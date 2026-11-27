import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { brDayRangeUTC } from '@/lib/utils/datetime'
import type { PaymentMethod, Sale, SaleWithItems } from '@/types/database'
import { isElectron } from '@/lib/db/client'

export interface SalesListParams {
  payment?: PaymentMethod
  /** Filtro de dia exato (YYYY-MM-DD em BRT). */
  day?: string
  page?: number
  pageSize?: number
}

export interface SalesListResult {
  items: Sale[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 25

export async function getSalesPaged(
  params: SalesListParams = {},
): Promise<SalesListResult> {
  if (isElectron()) {
    const { getSalesPaged: sqliteGet } = await import('@/lib/db/queries/sales')
    return sqliteGet(params)
  }

  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  let query = supabase
    .from('sales')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (params.payment) {
    query = query.eq('payment_method', params.payment)
  }

  if (params.day) {
    const { start, end } = brDayRangeUTC(params.day)
    query = query.gte('created_at', start).lte('created_at', end)
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return {
    items: (data ?? []) as Sale[],
    total,
    page,
    pageSize,
    totalPages,
  }
}

export async function getSaleById(id: string): Promise<SaleWithItems | null> {
  if (isElectron()) {
    const { getSaleById: sqliteGet } = await import('@/lib/db/queries/sales')
    return sqliteGet(id)
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales')
    .select('*, sale_items(*, products(*)), customers(full_name), sale_payments(method, amount)')
    .eq('id', id)
    .single()

  if (error) return null
  return data as SaleWithItems
}

export async function getTopProducts(limit = 5) {
  if (isElectron()) {
    const { getTopProducts: sqliteGet } = await import('@/lib/db/queries/sales')
    return sqliteGet(limit)
  }

  // Agregado no banco (20261128000008). A versão anterior puxava 500
  // linhas de sale_items pela rede para devolver 5, e somava em
  // JavaScript — mas o pior era o `.limit(500)` SEM ordenação: com muitos
  // itens, o PostgREST devolve 500 quaisquer e o "mais vendidos" vira o
  // top de uma fatia aleatória. Continuaria parecendo uma lista plausível.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('top_products', { p_limit: limit })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    total: Number(row.total),
  }))
}
