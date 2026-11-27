import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { startOfMonth, endOfMonth, subDays, subMonths } from 'date-fns'

export type DREPeriod = 'this-month' | 'last-month' | 'last-30' | 'last-90'

export interface DREResult {
  revenue: number
  cost: number
  grossProfit: number
  grossMargin: number
  salesCount: number
  byPayment: Record<string, { revenue: number; count: number }>
  topProducts: Array<{
    name: string
    revenue: number
    cost: number
    profit: number
    margin: number
    quantity: number
  }>
}

export const PERIOD_LABELS: Record<DREPeriod, string> = {
  'this-month': 'Este mês',
  'last-month': 'Mês passado',
  'last-30': 'Últimos 30 dias',
  'last-90': 'Últimos 90 dias',
}

function periodRange(period: DREPeriod): { start: string; end: string } {
  const now = new Date()
  switch (period) {
    case 'this-month':
      return { start: startOfMonth(now).toISOString(), end: endOfMonth(now).toISOString() }
    case 'last-month': {
      const last = subMonths(now, 1)
      return { start: startOfMonth(last).toISOString(), end: endOfMonth(last).toISOString() }
    }
    case 'last-30':
      return { start: subDays(now, 29).toISOString(), end: now.toISOString() }
    case 'last-90':
      return { start: subDays(now, 89).toISOString(), end: now.toISOString() }
  }
}

export async function getDREReport(period: DREPeriod = 'this-month'): Promise<DREResult> {
  const supabase = await createClient()
  const { start, end } = periodRange(period)

  // Aggregated by Postgres. The previous version pulled every sale of the
  // period with its items nested and summed them here, which silently lost
  // everything past the PostgREST row cap — a 90-day report of a busy shop
  // was computed over a slice of the data, with no warning anywhere.
  const { data, error } = await supabase.rpc('dre_report', {
    p_start: start,
    p_end: end,
  })

  if (error) throw new Error(error.message)

  const row = (data ?? {}) as Partial<RawDRE>

  return {
    revenue: Number(row.revenue ?? 0),
    cost: Number(row.cost ?? 0),
    grossProfit: Number(row.grossProfit ?? 0),
    grossMargin: Number(row.grossMargin ?? 0),
    salesCount: Number(row.salesCount ?? 0),
    byPayment: Object.fromEntries(
      Object.entries(row.byPayment ?? {}).map(([method, value]) => [
        method,
        { revenue: Number(value.revenue), count: Number(value.count) },
      ]),
    ),
    topProducts: (row.topProducts ?? []).map((p) => ({
      name: p.name,
      revenue: Number(p.revenue),
      cost: Number(p.cost),
      profit: Number(p.profit),
      margin: Number(p.margin),
      quantity: Number(p.quantity),
    })),
  }
}

/** Shape of the jsonb the dre_report() RPC returns. */
interface RawDRE {
  revenue: number | string
  cost: number | string
  grossProfit: number | string
  grossMargin: number | string
  salesCount: number | string
  byPayment: Record<string, { revenue: number | string; count: number | string }>
  topProducts: Array<{
    name: string
    revenue: number | string
    cost: number | string
    profit: number | string
    margin: number | string
    quantity: number | string
  }>
}
