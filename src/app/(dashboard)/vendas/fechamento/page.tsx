import { getCashClose, todayLocalISO } from '@/lib/queries/cash-close'
import { CashCloseView } from '@/components/sales/cash-close-view'
import { requireAdmin } from '@/lib/auth/roles'

export const metadata = {
  title: 'Fechamento de caixa',
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireAdmin()

  const { date } = await searchParams
  const localDate = isValidDate(date) ? date : todayLocalISO()
  const summary = await getCashClose(localDate)

  return <CashCloseView summary={summary} />
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}
