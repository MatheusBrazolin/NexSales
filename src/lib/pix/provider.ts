import 'server-only'

/**
 * Cobrança Pix, independente de provedor.
 *
 * O provedor é escolhido por variável de ambiente. Sem configuração, esta
 * camada devolve `null` e TUDO que depende dela some da tela — o PDV volta
 * a se comportar exatamente como antes. Essa é a propriedade que torna
 * seguro publicar uma integração de pagamento que ainda não foi testada
 * contra uma conta real.
 */

export type PixStatus = 'pending' | 'paid' | 'expired' | 'cancelled'

export interface CreatedPixCharge {
  providerChargeId: string
  /** O "copia e cola". */
  qrCode: string
  /** PNG em base64, quando o provedor devolve. */
  qrCodeBase64?: string
  expiresAt?: string
}

export interface PixProvider {
  readonly name: string

  createCharge(input: {
    amount: number
    /** Identificador da venda que ainda vai existir, para conciliação. */
    reference: string
    description: string
  }): Promise<CreatedPixCharge>

  /** Pergunta ao provedor, com a chave da loja, qual é o status real. */
  getStatus(providerChargeId: string): Promise<PixStatus>

  /**
   * Lê APENAS o identificador da cobrança no corpo da notificação.
   *
   * De propósito não devolve status: o corpo do webhook não é prova de
   * pagamento, é só um aviso de "olhe esta cobrança". Quem decide é o
   * getStatus.
   */
  parseNotification(body: unknown): { providerChargeId: string } | null

  /** Confere a assinatura, quando o provedor assina. */
  verifySignature(rawBody: string, headers: Headers): boolean
}

let cached: PixProvider | null | undefined

/** Devolve o provedor configurado, ou null quando o Pix está desligado. */
export async function getPixProvider(): Promise<PixProvider | null> {
  if (cached !== undefined) return cached

  const name = process.env.PIX_PROVIDER?.trim().toLowerCase()

  if (!name) {
    cached = null
    return cached
  }

  if (name === 'mercadopago') {
    const { createMercadoPagoProvider } = await import('./mercado-pago')
    cached = createMercadoPagoProvider()
    return cached
  }

  // Provedor desconhecido é erro de configuração, não motivo para o caixa
  // parar de vender: registra e segue desligado.
  console.error(`[pix] PIX_PROVIDER="${name}" não é um provedor conhecido. Pix desligado.`)
  cached = null
  return cached
}

/** Só para os testes: esquece o provedor memorizado. */
export function resetPixProviderCache() {
  cached = undefined
}
