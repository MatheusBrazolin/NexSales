import { redirect } from 'next/navigation'
import { getCashClose, todayLocalISO } from '@/lib/queries/cash-close'
import { CashCloseView } from '@/components/sales/cash-close-view'
import { getCurrentUser } from '@/lib/auth/roles'

export const metadata = {
  title: 'Fechamento de caixa',
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  // Aberto pra qualquer usuário autenticado — funcionário fecha o caixa
  // todo final de dia. Antes chamava requireAdmin() e o employee era
  // redirecionado pra /vendas/nova, dando impressão de que o botão
  // "Fechar caixa" estava bugado.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { date } = await searchParams
  const localDate = isValidDate(date) ? date : todayLocalISO()
  const summary = await getCashClose(localDate)

  return <CashCloseView summary={summary} />
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}
