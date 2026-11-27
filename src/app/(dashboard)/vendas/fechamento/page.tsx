import { redirect } from 'next/navigation'
import { getCashClose, todayLocalISO, type CashCloseSummary } from '@/lib/queries/cash-close'
import { CashCloseView } from '@/components/sales/cash-close-view'
import { getCurrentUser } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'

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
  const { data: summary, offline } = await tryQuery(
    () => getCashClose(localDate),
    EMPTY_SUMMARY,
  )

  return (
    <>
      {offline && (
        <OfflineBanner message="Sem conexão — fechamento de caixa indisponível offline." />
      )}
      {/* O fechamento é o resumo automático do dia: total, número de vendas
          e quanto entrou em cada forma de pagamento.

          A conferência manual da gaveta (fundo de troco, sangria,
          suprimento, contagem no fim do dia) foi construída e retirada
          desta tela a pedido do dono — a loja não trabalha assim. O
          componente, as consultas e as tabelas continuam no projeto:
          <CashDrawerPanel drawer={drawer} date={localDate} /> em
          components/sales/cash-drawer-panel.tsx é o que traz de volta. */}
      <CashCloseView summary={summary} />
    </>
  )
}

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}
