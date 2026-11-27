import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CreatedPixCharge, PixProvider, PixStatus } from './provider'

const API = 'https://api.mercadopago.com'

/**
 * Mapeia o status do Mercado Pago para o nosso.
 *
 * Só `approved` vira pago. Qualquer coisa que não esteja nesta lista fica
 * como `pending`, de propósito: diante de um status desconhecido, não dar
 * a venda por paga é o erro barato; dar é o caro.
 */
export function mapStatus(providerStatus: string): PixStatus {
  switch (providerStatus) {
    case 'approved':
      return 'paid'
    case 'cancelled':
    case 'rejected':
      return 'cancelled'
    case 'expired':
      return 'expired'
    default:
      return 'pending'
  }
}

/**
 * Confere a assinatura do webhook do Mercado Pago.
 *
 * O cabeçalho `x-signature` traz `ts` e `v1`. O manifesto assinado é
 * `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` com HMAC-SHA256.
 *
 * Mesmo com assinatura válida, o status NUNCA vem do corpo — a assinatura
 * só prova que a notificação veio do provedor, não que o dinheiro caiu.
 */
export function verifyMercadoPagoSignature(
  secret: string,
  dataId: string,
  requestId: string | null,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((piece) => {
      const [key, ...rest] = piece.split('=')
      return [key.trim(), rest.join('=').trim()]
    }),
  )

  const ts = parts.ts
  const v1 = parts.v1
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${requestId ?? ''};ts:${ts};`
  const expected = createHmac('sha256', secret).update(manifest).digest('hex')

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(v1, 'utf8')
  // Comparação de tempo constante: comparar com === vaza, pelo tempo de
  // resposta, quantos caracteres iniciais o atacante acertou.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function createMercadoPagoProvider(): PixProvider | null {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim()
  if (!token) {
    console.error('[pix] PIX_PROVIDER=mercadopago mas MERCADO_PAGO_ACCESS_TOKEN está vazio.')
    return null
  }

  const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET?.trim()
  // O Mercado Pago exige um e-mail de pagador. NÃO use o e-mail do dono da
  // loja: é dado pessoal indo para um terceiro sem necessidade.
  const payerEmail = process.env.PIX_PAYER_EMAIL?.trim() || 'pagador@exemplo.com'

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`mercadopago ${response.status}: ${text.slice(0, 300)}`)
    }

    return response.json()
  }

  return {
    name: 'mercadopago',

    async createCharge({ amount, reference, description }): Promise<CreatedPixCharge> {
      const data = await call('/v1/payments', {
        method: 'POST',
        // A chave de idempotência usa a referência da venda: se a rede cair
        // no meio e o caixa tentar de novo, não nascem duas cobranças.
        headers: { 'X-Idempotency-Key': reference },
        body: JSON.stringify({
          transaction_amount: Number(amount.toFixed(2)),
          description,
          payment_method_id: 'pix',
          external_reference: reference,
          payer: { email: payerEmail },
        }),
      })

      const tx = data?.point_of_interaction?.transaction_data

      if (!data?.id || !tx?.qr_code) {
        throw new Error('mercadopago: resposta sem QR code')
      }

      return {
        providerChargeId: String(data.id),
        qrCode: tx.qr_code,
        qrCodeBase64: tx.qr_code_base64,
        expiresAt: data.date_of_expiration,
      }
    },

    async getStatus(providerChargeId) {
      const data = await call(`/v1/payments/${encodeURIComponent(providerChargeId)}`)
      return mapStatus(String(data?.status ?? ''))
    },

    parseNotification(body) {
      const payload = body as { type?: string; action?: string; data?: { id?: unknown } }
      const isPayment =
        payload?.type === 'payment' || String(payload?.action ?? '').startsWith('payment.')

      const id = payload?.data?.id
      if (!isPayment || id === undefined || id === null) return null

      return { providerChargeId: String(id) }
    },

    verifySignature(rawBody, headers) {
      // Sem segredo configurado não há o que conferir. A proteção real
      // continua sendo reconsultar o status na API — a notificação só diz
      // qual cobrança olhar.
      if (!webhookSecret) return true

      let dataId = ''
      try {
        const parsed = JSON.parse(rawBody) as { data?: { id?: unknown } }
        dataId = String(parsed?.data?.id ?? '')
      } catch {
        return false
      }

      return verifyMercadoPagoSignature(
        webhookSecret,
        dataId,
        headers.get('x-request-id'),
        headers.get('x-signature'),
      )
    },
  }
}
