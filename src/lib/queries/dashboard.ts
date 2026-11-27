import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { ProductWithCategory, Sale } from '@/types/database'
import { isElectron } from '@/lib/db/client'

export async function getDashboardMetrics() {
  if (isElectron()) {
    const { getDashboardMetrics: sqliteGet } = await import('@/lib/db/queries/dashboard')
    return sqliteGet()
  }

  const supabase = await createClient()

  // The KPIs are aggregated by Postgres, not by this process. Summing them
  // here would mean paging every sale of the month through PostgREST, which
  // silently truncates at db-max-rows (1000 by default) — past that the
  // month total and the average ticket would just be wrong.
  const [metrics, recentSales] = await Promise.all([
    supabase.rpc('dashboard_metrics').single(),
    supabase
      .from('sales')
      .select('id, total_amount, payment_method, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  if (metrics.error) throw new Error(metrics.error.message)

  const row = metrics.data

  return {
    todayTotal: Number(row?.today_total ?? 0),
    yesterdayTotal: Number(row?.yesterday_total ?? 0),
    monthTotal: Number(row?.month_total ?? 0),
    lastMonthTotal: Number(row?.last_month_total ?? 0),
    todayCount: Number(row?.today_count ?? 0),
    monthCount: Number(row?.month_count ?? 0),
    avgTicket: Number(row?.avg_ticket ?? 0),
    lowStockCount: Number(row?.low_stock_count ?? 0),
    recentSales: (recentSales.data ?? []) as Sale[],
  }
}

export async function getSalesLast30Days() {
  if (isElectron()) {
    const { getSalesLast30Days: sqliteGet } = await import('@/lib/db/queries/dashboard')
    return sqliteGet()
  }

  const supabase = await createClient()

  // Grouped and gap-filled in SQL: the previous version fetched every sale of
  // the window and bucketed them here, which hit the same row cap as the KPIs.
  const { data, error } = await supabase.rpc('sales_last_30_days')
  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    date: row.day_label,
    total: Number(row.total),
  }))
}


export interface TopProduct {
  id: string
  name: string
  code: string
  total: number
}

export interface DashboardOverview {
  metrics: Awaited<ReturnType<typeof getDashboardMetrics>>
  chart: Awaited<ReturnType<typeof getSalesLast30Days>>
  topProducts: TopProduct[]
  lowStock: ProductWithCategory[]
}

/**
 * Tudo que o dashboard mostra, numa ida só ao banco.
 *
 * Antes eram CINCO consultas em duas ondas: três que a página esperava, e
 * mais duas que só começavam depois que as primeiras voltavam (os blocos
 * em Suspense). O custo não era o tamanho das consultas — era o número de
 * viagens, cada uma pagando a latência até o banco.
 *
 * No desktop não existe esta RPC: o SQLite local responde pelas funções
 * separadas, que continuam valendo.
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
  if (isElectron()) {
    const [metrics, chart, topProducts, lowStock] = await Promise.all([
      getDashboardMetrics(),
      getSalesLast30Days(),
      import('@/lib/db/queries/sales').then((m) => m.getTopProducts(5)),
      import('@/lib/db/queries/products').then((m) => m.getLowStock()),
    ])
    return { metrics, chart, topProducts, lowStock }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dashboard_overview', {
    p_top_limit: 5,
    p_low_limit: 50,
  })

  if (error) throw new Error(error.message)

  const bruto = (data ?? {}) as {
    metrics?: Record<string, unknown>
    recentSales?: Sale[]
    chart?: DashboardOverview['chart']
    topProducts?: { id: string; name: string; code: string; total: number }[]
    lowStock?: ProductWithCategory[]
  }

  const m = bruto.metrics ?? {}

  return {
    metrics: {
      todayTotal: Number(m.today_total ?? 0),
      todayCount: Number(m.today_count ?? 0),
      yesterdayTotal: Number(m.yesterday_total ?? 0),
      monthTotal: Number(m.month_total ?? 0),
      monthCount: Number(m.month_count ?? 0),
      lastMonthTotal: Number(m.last_month_total ?? 0),
      avgTicket: Number(m.avg_ticket ?? 0),
      lowStockCount: Number(m.low_stock_count ?? 0),
      recentSales: bruto.recentSales ?? [],
    },
    chart: bruto.chart ?? [],
    topProducts: (bruto.topProducts ?? []).map((t) => ({ ...t, total: Number(t.total) })),
    lowStock: bruto.lowStock ?? [],
  }
}
