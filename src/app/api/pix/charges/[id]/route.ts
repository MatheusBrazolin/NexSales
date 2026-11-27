import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getPixProvider } from '@/lib/pix/provider'

export const dynamic = 'force-dynamic'

/**
 * Status da cobrança, reconsultado no provedor.
 *
 * É a consulta de reserva: se o webhook não chegar — e ele falha com mais
 * frequência do que se imagina — a tela ainda descobre que o dinheiro
 * caiu. Nunca devolve um "pago" que não tenha vindo da API do provedor.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const provider = await getPixProvider()
  if (!provider) {
    return NextResponse.json({ error: 'pix_disabled' }, { status: 503 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const { id } = await params
  const service = createServiceClient()

  const { data: charge } = await service
    .from('pix_charges')
    .select('id, status, provider_charge_id, created_by')
    .eq('id', id)
    .maybeSingle()

  if (!charge) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }

  // O service role ignora RLS, então a dona da cobrança é conferida aqui.
  if (charge.created_by && charge.created_by !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Já resolvida: não há por que incomodar o provedor de novo.
  if (charge.status !== 'pending' || !charge.provider_charge_id) {
    return NextResponse.json({ status: charge.status })
  }

  try {
    const status = await provider.getStatus(charge.provider_charge_id)

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
    console.error('[pix] falha ao consultar status:', err)
    // Erro de rede não é "não pago": devolve o que se sabe e deixa a tela
    // tentar de novo.
    return NextResponse.json({ status: charge.status, stale: true })
  }
}
