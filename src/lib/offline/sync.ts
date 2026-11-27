/**
 * Sync layer: pulls the canonical Supabase tables into the local IndexedDB
 * cache so the app can read them offline.
 *
 * Duas coisas aqui existem por causa do catálogo grande:
 *
 * 1. Paginação. O PostgREST corta a resposta em `db-max-rows` (1000 por
 *    padrão no Supabase) e não avisa: devolve 1000 linhas com cara de
 *    resultado completo. Um `select('*')` solto, com 3 mil produtos
 *    cadastrados, deixaria 2 mil fora do cache do PDV — sem erro nenhum
 *    para investigar depois. O caixa simplesmente não acharia o produto.
 *
 * 2. Sync incremental. Antes cada sincronização apagava a tabela local e
 *    rebaixava o catálogo inteiro, a cada 60 segundos. Com algumas centenas
 *    de itens não se nota; com milhares vira tráfego e CPU constantes no
 *    caixa — e uma janela, entre o `clear()` e o `bulkAdd()`, em que a busca
 *    não acha nada porque a tabela está vazia. Agora só descem as linhas com
 *    `updated_at` mais novo que o último marco, e um refresh completo roda
 *    uma vez por dia para capturar o que o incremental não enxerga (um
 *    produto apagado de vez, um cache corrompido).
 *
 * Cada sync bem-sucedido carimba o `syncMeta` com o horário e a contagem,
 * para a UI mostrar "sincronizado há X minutos".
 */

import 'client-only'
import { createClient } from '@/lib/supabase/client'
import { getDB, type CachedCategory, type CachedCustomer, type CachedProduct, type SyncMeta } from './db'
import { buildSearchTokens } from '@/lib/utils/search-text'

export interface SyncResult {
  /** Quantas linhas foram escritas (ou removidas) no cache local. */
  synced: number
  /** ISO timestamp de quando o sync rodou — também gravado no syncMeta. */
  at: string
  /** `full` recarregou a tabela inteira; `incremental` trouxe só o que mudou. */
  mode: 'full' | 'incremental'
}

/** Teto de linhas por requisição do PostgREST (`db-max-rows`). */
const PAGE_SIZE = 1000

/** Trava de segurança: 100 páginas = 100 mil linhas. Nunca gira para sempre. */
const MAX_PAGES = 100

/** Um refresh completo por dia pega o que o incremental não vê. */
const FULL_RESYNC_MS = 24 * 60 * 60_000

/**
 * Janela de folga ao retomar do marco.
 *
 * `updated_at` recebe o `now()` do início da transação, mas a linha só fica
 * visível no commit. Sem essa folga, uma escrita longa poderia ficar com
 * timestamp anterior ao marco e nunca mais ser baixada. Rebaixar alguns
 * segundos de linhas é inofensivo — a gravação é `bulkPut`, idempotente.
 */
const CURSOR_OVERLAP_MS = 5_000

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/**
 * Percorre o resultado em páginas até a última vir incompleta.
 *
 * É o que impede o corte silencioso do PostgREST em 1000 linhas.
 */
async function fetchAllPages<T>(page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = []

  for (let i = 0; i < MAX_PAGES; i++) {
    const from = i * PAGE_SIZE
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw error

    const batch = data ?? []
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }

  return rows
}

/**
 * Maior `updated_at` do lote, comparado como data e não como texto —
 * precisão de fração de segundo varia entre linhas e a comparação
 * lexicográfica erraria nesses casos.
 */
function maxUpdatedAt(
  rows: ReadonlyArray<{ updated_at?: string | null }>,
  fallback?: string,
): string | undefined {
  let bestIso = fallback
  let bestMs = fallback ? Date.parse(fallback) : Number.NEGATIVE_INFINITY

  for (const row of rows) {
    const iso = row.updated_at
    if (!iso) continue
    const ms = Date.parse(iso)
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms
      bestIso = iso
    }
  }

  return bestIso
}

/**
 * Os tokens de busca são calculados uma vez, aqui, e não a cada tecla
 * digitada no PDV. É o que transforma a busca do caixa numa consulta de
 * índice em vez de uma varredura do catálogo.
 */
function withSearchTokens(rows: readonly CachedProduct[]): CachedProduct[] {
  return rows.map((product) => ({
    ...product,
    search_tokens: buildSearchTokens(product.name ?? '', product.code ?? ''),
  }))
}

/**
 * Sincroniza `products`.
 *
 * Incremental por padrão; cai para refresh completo quando não há marco,
 * quando o cache está vazio ou quando o último completo já passou de um dia.
 * `force: true` pede o completo explicitamente (botão "sincronizar agora").
 */
export async function syncProducts(options: { force?: boolean } = {}): Promise<SyncResult> {
  const db = getDB()
  const meta = await db.syncMeta.get('products')
  const cached = await db.products.count()

  const cursor = meta?.cursor
  const lastFullSyncAt = meta?.lastFullSyncAt
  const fullIsFresh =
    !!lastFullSyncAt && Date.now() - Date.parse(lastFullSyncAt) < FULL_RESYNC_MS

  if (!options.force && cursor && lastFullSyncAt && fullIsFresh && cached > 0) {
    return syncProductsIncremental(cursor, lastFullSyncAt)
  }

  return syncProductsFull()
}

/** Recarga completa: só produtos ativos — inativo não serve ao PDV. */
async function syncProductsFull(): Promise<SyncResult> {
  const supabase = createClient()

  const rows = await fetchAllPages<CachedProduct>((from, to) =>
    supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      // Ordem determinística: sem ela, duas páginas podem repetir ou pular
      // linhas se alguém editar um produto no meio da paginação.
      .order('id')
      .range(from, to),
  )

  const products = withSearchTokens(rows)
  const at = new Date().toISOString()
  const cursor = maxUpdatedAt(rows)

  const db = getDB()
  await db.transaction('rw', db.products, db.syncMeta, async () => {
    await db.products.clear()
    if (products.length > 0) await db.products.bulkPut(products)
    await db.syncMeta.put({
      key: 'products',
      lastSyncAt: at,
      count: products.length,
      cursor,
      lastFullSyncAt: at,
    })
  })

  return { synced: products.length, at, mode: 'full' }
}

/**
 * Só o que mudou desde o marco.
 *
 * Aqui o filtro `is_active` não entra na consulta de propósito: um produto
 * desativado precisa chegar para ser APAGADO do cache. Se a consulta já o
 * excluísse, ele continuaria vendável no PDV até o refresh completo do dia
 * seguinte.
 */
async function syncProductsIncremental(
  cursor: string,
  lastFullSyncAt: string,
): Promise<SyncResult> {
  const supabase = createClient()
  const since = new Date(Date.parse(cursor) - CURSOR_OVERLAP_MS).toISOString()

  const rows = await fetchAllPages<CachedProduct>((from, to) =>
    supabase
      .from('products')
      .select('*')
      .gte('updated_at', since)
      .order('updated_at')
      .order('id')
      .range(from, to),
  )

  const upserts = withSearchTokens(rows.filter((product) => product.is_active))
  const removals = rows.filter((product) => !product.is_active).map((product) => product.id)
  const at = new Date().toISOString()

  const db = getDB()
  await db.transaction('rw', db.products, db.syncMeta, async () => {
    if (upserts.length > 0) await db.products.bulkPut(upserts)
    if (removals.length > 0) await db.products.bulkDelete(removals)

    await db.syncMeta.put({
      key: 'products',
      lastSyncAt: at,
      count: await db.products.count(),
      cursor: maxUpdatedAt(rows, cursor),
      lastFullSyncAt,
    })
  })

  return { synced: upserts.length + removals.length, at, mode: 'incremental' }
}

/** Refresh completo de `categories`. Tabela pequena, sempre substituída. */
export async function syncCategories(): Promise<SyncResult> {
  const supabase = createClient()

  const rows = await fetchAllPages<CachedCategory>((from, to) =>
    supabase.from('categories').select('*').order('id').range(from, to),
  )
  const at = new Date().toISOString()

  const db = getDB()
  await db.transaction('rw', db.categories, db.syncMeta, async () => {
    await db.categories.clear()
    if (rows.length > 0) await db.categories.bulkPut(rows)
    await db.syncMeta.put({ key: 'categories', lastSyncAt: at, count: rows.length })
  })

  return { synced: rows.length, at, mode: 'full' }
}

/**
 * Refresh completo de `customer_balances` para o fiado offline.
 *
 * Fica completo (e não incremental) porque é uma view agregada: o saldo de
 * um cliente muda quando uma VENDA é lançada, sem que a linha do cliente
 * seja tocada — `updated_at` não se mexeria, e o saldo no caixa congelaria.
 */
export async function syncCustomers(): Promise<SyncResult> {
  const supabase = createClient()

  const rows = await fetchAllPages<CachedCustomer>((from, to) =>
    supabase.from('customer_balances').select('*').order('id').range(from, to),
  )
  const at = new Date().toISOString()

  const db = getDB()
  await db.transaction('rw', db.customers, db.syncMeta, async () => {
    await db.customers.clear()
    if (rows.length > 0) await db.customers.bulkPut(rows)
    await db.syncMeta.put({ key: 'customers', lastSyncAt: at, count: rows.length })
  })

  return { synced: rows.length, at, mode: 'full' }
}

/**
 * Run all syncs in parallel. Failures are caught per-entity so a transient
 * outage in one table doesn't poison the others.
 *
 * `force: true` obriga o refresh completo de produtos. Quem volta de um
 * período offline usa isso: o incremental repara o que mudou, mas não vê um
 * produto apagado de vez enquanto o caixa estava sem rede.
 */
export async function syncAll(options: { force?: boolean } = {}): Promise<{
  products: SyncResult | { error: string }
  categories: SyncResult | { error: string }
  customers: SyncResult | { error: string }
}> {
  const [products, categories, customers] = await Promise.all([
    syncProducts(options).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar produtos',
    })),
    syncCategories().catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar categorias',
    })),
    syncCustomers().catch((err: unknown) => ({
      error: err instanceof Error ? err.message : 'Erro ao sincronizar clientes',
    })),
  ])
  return { products, categories, customers }
}

/** Read a sync timestamp from the local cache. Returns null if never synced. */
export async function getLastSync(
  key: SyncMeta['key'],
): Promise<SyncMeta | undefined> {
  return getDB().syncMeta.get(key)
}
