import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPixProvider } from '@/lib/pix/provider'

export const dynamic = 'force-dynamic'

/**
 * Cria a cobrança Pix de uma venda que ainda não existe.
 *
 * A venda só é registrada depois da confirmação do pagamento — por isso a
 * cobrança guarda o `client_uuid`, que é a chave de idempotência que a
 * venda vai usar quando for criada.
 */
export async function POST(request: Request) {
  const provider = await getPixProvider()
  if (!provider) {
    return NextResponse.json({ error: 'pix_disabled' }, { status: 503 })
  }

  // Quem cria cobrança precisa estar logado: sem isto, qualquer um geraria
  // QR na conta da loja.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  let body: { amount?: number; client_uuid?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
  }

  const amount = Number(body.amount)
  const clientUuid = String(body.client_uuid ?? '')

  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'invalid_amount' }, { status: 400 })
  }
  if (!/^[0-9a-f-]{36}$/i.test(clientUuid)) {
    return NextResponse.json({ error: 'invalid_client_uuid' }, { status: 400 })
  }

  const service = createServiceClient()

  // Já existe cobrança para esta venda? Devolve a mesma, em vez de gerar
  // um segundo QR para o mesmo dinheiro.
  const { data: existing } = await service
    .from('pix_charges')
    .select('id, status, qr_code, qr_code_base64, expires_at')
    .eq('client_uuid', clientUuid)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ charge: existing })
  }

  try {
    const created = await provider.createCharge({
      amount,
      reference: clientUuid,
      description: 'Venda NexSales',
    })

    const { data, error } = await service
      .from('pix_charges')
      .insert({
        client_uuid: clientUuid,
        amount,
        provider: provider.name,
        provider_charge_id: created.providerChargeId,
        qr_code: created.qrCode,
        qr_code_base64: created.qrCodeBase64 ?? null,
        expires_at: created.expiresAt ?? null,
        created_by: user.id,
      })
      .select('id, status, qr_code, qr_code_base64, expires_at')
      .single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ charge: data })
  } catch (err) {
    console.error('[pix] falha ao criar cobrança:', err)
    return NextResponse.json({ error: 'provider_error' }, { status: 502 })
  }
}
