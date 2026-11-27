import { redirect } from 'next/navigation'
import { getCashClose, todayLocalISO, type CashCloseSummary } from '@/lib/queries/cash-close'
import { CashCloseView } from '@/components/sales/cash-close-view'
import { getCurrentUser } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { CashDrawerPanel } from '@/components/sales/cash-drawer-panel'
import { getCashDrawer, type CashDrawer } from '@/lib/queries/cash-drawer'

export const metadata = {
  title: 'Fechamento de caixa',
}

export default async function FechamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { date } = await searchParams
  const localDate = isValidDate(date) ? date : todayLocalISO()

  const EMPTY_SUMMARY: CashCloseSummary = {
    date: localDate,
    count: 0,
    total: 0,
    averageTicket: 0,
    byPayment: [],
    sales: [],
  }
  const EMPTY_DRAWER: CashDrawer = {
    opening: 0,
    cashSales: 0,
    supplies: 0,
    withdrawals: 0,
    refunds: 0,
    expected: 0,
    movements: [],
    close: null,
  }

  const [{ data: summary, offline }, { data: drawer }] = await Promise.all([
    tryQuery(() => getCashClose(localDate), EMPTY_SUMMARY),
    tryQuery(() => getCashDrawer(localDate), EMPTY_DRAWER),
  ])

  return (
    <>
      {offline && (
        <OfflineBanner message="Sem conexão — fechamento de caixa indisponível offline." />
      )}
      <div className="space-y-6">
        {/* A conferência vem ANTES do resumo: no fim do dia a pergunta é
            quanto deveria haver na gaveta, não quanto se vendeu. */}
        <CashDrawerPanel drawer={drawer} date={localDate} />
        <CashCloseView summary={summary} />
      </div>
    </>
  )
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}
