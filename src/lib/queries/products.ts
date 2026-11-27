import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Category, ProductWithCategory } from '@/types/database'
import { isElectron } from '@/lib/db/client'
import { normalizeSearchText } from '@/lib/utils/search-text'

export type StockFilter = 'all' | 'ok' | 'low' | 'out'

export interface ProductsListParams {
  search?: string
  categoryId?: string
  stock?: StockFilter
  page?: number
  pageSize?: number
}

export interface ProductsListResult {
  items: ProductWithCategory[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

const DEFAULT_PAGE_SIZE = 20

export async function getProductsPaged(
  params: ProductsListParams = {},
): Promise<ProductsListResult> {
  // Electron reads directly from SQLite — always fresh (synced every 60 s),
  // instant, and immune to the tryQuery race condition where a hanging Supabase
  // TCP connection causes the 5-second fallback timer to fire before this
  // catch-block can return SQLite data.
  if (isElectron()) {
    const { getProductsPaged: sqliteGet } = await import('@/lib/db/queries/products')
    return sqliteGet(params)
  }

  const supabase = await createClient()
  const page = Math.max(1, params.page ?? 1)
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? DEFAULT_PAGE_SIZE))

  let query = supabase
    .from('products')
    .select('*, categories(id, name)', { count: 'exact' })
    .eq('is_active', true)

  if (params.search) {
    // `name_norm` é a computed column criada em 20261127000008: o nome sem
    // acento e em minúsculas. Filtrar por `name` cru deixava "acucar" sem
    // achar "Açúcar" — o dono procurava um produto que existe, não achava,
    // e cadastrava de novo. O termo vai normalizado do mesmo jeito dos dois
    // lados, e o `code` fica como está porque é ASCII.
    const s = sanitizeForIlike(normalizeSearchText(params.search))
    if (s) query = query.or(`name_norm.ilike.%${s}%,code.ilike.%${s}%`)
  }

  if (params.categoryId) {
    query = query.eq('category_id', params.categoryId)
  }

  // `stock_status` e a computed column criada em 20261128000000. O filtro
  // precisa acontecer AQUI, no banco, antes do range: antes ele rodava em
  // JavaScript depois da pagina ja ter sido cortada em 20 linhas, entao a
  // tela mostrava 3 itens dizendo "120 produtos" e os que precisavam de
  // reposicao ficavam numa pagina que ninguem abre.
  //
  // 'ok' inclui 'free' porque produto sem controle de estoque sempre pode
  // ser vendido — ele so nao tem quantidade para comparar.
  if (params.stock === 'out') {
    query = query.eq('stock_status', 'out')
  } else if (params.stock === 'low') {
    query = query.eq('stock_status', 'low')
  } else if (params.stock === 'ok') {
    query = query.in('stock_status', ['ok', 'free'])
  }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.order('name').range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  const items = (data ?? []) as ProductWithCategory[]

  const total = count ?? items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return { items, total, page, pageSize, totalPages }
}

export async function getLowStock(): Promise<ProductWithCategory[]> {
  if (isElectron()) {
    const { getLowStock: sqliteGet } = await import('@/lib/db/queries/products')
    return sqliteGet()
  }

  // O filtro acontece no banco, pela computed column stock_status.
  //
  // Antes era `order by stock_quantity limit 50` e o filtro em JavaScript
  // depois — mesmo defeito do filtro da tela de produtos: se 50 itens sem
  // controle de estoque (que vivem em 0) ocupassem a fatia, o alerta
  // apareceria VAZIO com produtos de verdade acabando na prateleira.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(id, name)')
    .eq('is_active', true)
    .in('stock_status', ['low', 'out'])
    .order('stock_quantity')
    .limit(50)

  if (error) throw new Error(error.message)

  return (data ?? []) as ProductWithCategory[]
}

export async function getCategories(): Promise<Category[]> {
  if (isElectron()) {
    const { getCategories: sqliteGet } = await import('@/lib/db/queries/products')
    return sqliteGet()
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)
  return (data ?? []) as Category[]
}

/** Escape characters that break PostgREST's `or()` filter syntax. */
function sanitizeForIlike(input: string): string {
  return input.replace(/[,()%]/g, ' ').trim()
}
