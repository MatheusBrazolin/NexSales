import { KpiCards } from '@/components/dashboard/kpi-cards'
import { SalesChart } from '@/components/dashboard/sales-chart'
import { LowStockAlert } from '@/components/dashboard/low-stock-alert'
import { TopProducts } from '@/components/dashboard/top-products'
import { RecentSales } from '@/components/dashboard/recent-sales'
import { getDashboardOverview, type DashboardOverview } from '@/lib/queries/dashboard'
import { requireAdmin } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'

const VAZIO: DashboardOverview = {
  metrics: {
    todayTotal: 0,
    yesterdayTotal: 0,
    monthTotal: 0,
    lastMonthTotal: 0,
    avgTicket: 0,
    lowStockCount: 0,
    todayCount: 0,
    monthCount: 0,
    recentSales: [],
  },
  chart: [],
  topProducts: [],
  lowStock: [],
}

export default async function DashboardPage() {
  await requireAdmin()

  // Uma ida ao banco, não cinco. Antes eram três consultas que a página
  // esperava mais duas que só começavam depois — e o custo era o número
  // de viagens, não o tamanho delas.
  const { data: overview, offline } = await tryQuery(() => getDashboardOverview(), VAZIO)
  const { metrics } = overview

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Visão geral do seu negócio</p>
      </div>

      {offline && (
        <OfflineBanner message="Sem conexão — exibindo zeros. Os dados serão atualizados quando a internet retornar." />
      )}

      <KpiCards
        todayTotal={metrics.todayTotal}
        yesterdayTotal={metrics.yesterdayTotal}
        monthTotal={metrics.monthTotal}
        lastMonthTotal={metrics.lastMonthTotal}
        avgTicket={metrics.avgTicket}
        lowStockCount={metrics.lowStockCount}
        todayCount={metrics.todayCount}
        monthCount={metrics.monthCount}
      />

      <SalesChart data={overview.chart} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[480px]">
        <div className="lg:col-span-2 flex flex-col min-h-0">
          <RecentSales sales={metrics.recentSales} />
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto min-h-0">
          {/* Sem Suspense: os dados já vieram na mesma chamada, então não
              há nada para esperar — e um esqueleto que pisca por 0 ms é
              pior do que nenhum. */}
          <TopProducts products={overview.topProducts} />
          <LowStockAlert products={overview.lowStock} />
        </div>
      </div>
    </div>
  )
}
