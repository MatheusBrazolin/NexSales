import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPixProvider } from '@/lib/pix/provider'

export const dynamic = 'force-dynamic'

/**
 * Notificação do provedor.
 *
 * A REGRA que define esta rota: o corpo do webhook NUNCA é prova de
 * pagamento. Ele diz apenas qual cobrança olhar. O status é sempre
 * reconsultado na API do provedor, com a chave da loja.
 *
 * Sem isso, qualquer pessoa que descobrisse esta URL poderia marcar
 * vendas como pagas mandando um JSON.
 */
export async function POST(request: Request) {
  const provider = await getPixProvider()
  if (!provider) {
    return NextResponse.json({ error: 'pix_disabled' }, { status: 503 })
  }

  const raw = await request.text()

  if (!provider.verifySignature(raw, request.headers)) {
    console.warn('[pix] webhook com assinatura inválida, ignorado')
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const parsed = provider.parseNotification(body)
  if (!parsed) {
    // Notificação de outro tipo de evento. Responder 200 evita que o
    // provedor fique reenviando para sempre.
    return NextResponse.json({ ignored: true })
  }

  const service = createServiceClient()

  const { data: charge } = await service
    .from('pix_charges')
    .select('id, status')
    .eq('provider', provider.name)
    .eq('provider_charge_id', parsed.providerChargeId)
    .maybeSingle()

  if (!charge) {
    return NextResponse.json({ ignored: true })
  }

  if (charge.status !== 'pending') {
    // Idempotência: a mesma notificação chegando duas vezes não dá baixa
    // duas vezes.
    return NextResponse.json({ status: charge.status, duplicate: true })
  }

  try {
    const status = await provider.getStatus(parsed.providerChargeId)

    if (status !== 'pending') {
      await service
        .from('pix_charges')
        .update({
          status,
          paid_at: status === 'paid' ? new Date().toISOString() : null,
        })
        .eq('id', charge.id)
        .eq('status', 'pending')
    }

    return NextResponse.json({ status })
  } catch (err) {
    console.error('[pix] falha ao confirmar no provedor:', err)
    // 500 faz o provedor reenviar depois, que é o comportamento desejado.
    return NextResponse.json({ error: 'provider_error' }, { status: 500 })
  }
}
