import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Sale } from '@/types/database'
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
    monthTotal: Number(row?.month_total ?? 0),
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
