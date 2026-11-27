/**
 * Local IndexedDB cache for offline reads.
 *
 * Mirrors the shape of `products` and `categories` from Supabase so the same
 * server types flow through the UI whether the data came from the network
 * or from the local cache. A small `syncMeta` table records the last-sync
 * timestamp for each entity, so we can show "last updated X minutes ago"
 * and decide when a background refresh is needed.
 *
 * This file is import-safe on the server (it only constructs the Dexie
 * instance when running in the browser) — Dexie itself is a thin wrapper
 * around `window.indexedDB`, which doesn't exist on the server.
 */

import 'client-only'
import Dexie, { type Table } from 'dexie'
import type { Product, Category, CustomerBalance, PaymentMethod } from '@/types/database'
import { buildSearchTokens } from '@/lib/utils/search-text'

/** Mirror of `public.products.Row`. Same shape so server types reuse cleanly. */
/**
 * Produto no cache local, com os tokens de busca já calculados.
 *
 * `search_tokens` é um índice multiEntry no Dexie: é o que permite buscar
 * por prefixo usando o índice, em vez de ler o catálogo inteiro e filtrar
 * em JavaScript a cada tecla digitada pelo caixa.
 */
export type CachedProduct = Product & { search_tokens?: string[] }

/** Mirror of `public.categories.Row`. */
export type CachedCategory = Category

/** Mirror of the `customer_balances` view — used for offline fiado search. */
export type CachedCustomer = CustomerBalance

/** One line of a queued offline sale. Carries enough to render a provisional
 *  receipt and to rebuild the RPC payload without re-reading the catalog. */
export interface PendingSaleItem {
  product_id: string
  quantity: number
  name: string
  unit_price: number
  item_description?: string
}

/**
 * A sale rung up while offline (or that failed to reach the server), waiting
 * to be flushed to Supabase. `id` is the client-generated UUID used as the
 * idempotency key by the `create_sale_with_items` RPC.
 */
export interface PendingSale {
  id: string
  payment_method: PaymentMethod
  notes: string
  items: PendingSaleItem[]
  /** Net total already discounted, for the provisional receipt. */
  total: number
  /** Desconto aplicado no total. Replayed to the server on flush. */
  discount?: number
  /**
   * Pagamento dividido, quando houver. Ausente numa venda de forma única —
   * e ausente também nas vendas que já estavam na fila antes desta versão,
   * que continuam subindo pelo caminho de sempre.
   */
  payments?: { method: PaymentMethod; amount: number }[]
  /** UUID of the customer for fiado sales; null/undefined for regular sales. */
  customer_id?: string | null
  createdAt: string // ISO timestamp
  /** `pending` = waiting to sync; `failed` = server rejected (e.g. stock), needs review. */
  status: 'pending' | 'failed'
  /** Last error surfaced by the server, when status is `failed`. */
  error?: string
  /** How many flush attempts have run, for backoff/diagnostics. */
  attempts: number
}

/**
 * One row per entity (`products`, `categories`), tracking the last time a
 * full refresh completed. Used by the sync layer to debounce refreshes
 * and by the UI to render "última sincronização há X".
 */
export interface SyncMeta {
  key: 'products' | 'categories' | 'customers'
  lastSyncAt: string // ISO timestamp
  count: number
  /**
   * Marco do sync incremental: maior `updated_at` já baixado desta tabela.
   * A próxima sincronização pede só o que for mais novo que isto.
   * Ausente = nunca sincronizou, ou a tabela só faz refresh completo.
   */
  cursor?: string
  /**
   * Quando o último refresh COMPLETO terminou. O incremental não enxerga
   * uma linha apagada de vez, então um completo por dia fecha essa brecha.
   */
  lastFullSyncAt?: string
}

class VendasAppDB extends Dexie {
  products!: Table<CachedProduct, string>
  categories!: Table<CachedCategory, string>
  customers!: Table<CachedCustomer, string>
  syncMeta!: Table<SyncMeta, string>
  pendingSales!: Table<PendingSale, string>

  constructor() {
    super('vendas-app')
    // v1 — initial offline cache schema. Bump and add `.upgrade(...)` blocks
    // here when the local schema changes; never edit a past version.
    this.version(1).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
    })
    // v2 — offline write queue.
    this.version(2).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
      pendingSales: 'id, status, createdAt',
    })
    // v3 — customer cache for offline fiado sales. `full_name` and `phone`
    // indexed so the PDV search doesn't require a full table scan.
    this.version(3).stores({
      products: 'id, code, name, is_active',
      categories: 'id, name',
      syncMeta: 'key',
      pendingSales: 'id, status, createdAt',
      customers: 'id, full_name, phone',
    })
    // v4 — busca de produto por índice.
    //
    // Até aqui a busca do PDV era `db.products.filter(...)`, que o Dexie
    // resolve lendo TODOS os produtos do IndexedDB e testando um por um em
    // JavaScript, a cada tecla. Com catálogo pequeno não se nota; com
    // milhares de itens é o gargalo do caixa.
    //
    // `*search_tokens` é um índice multiEntry: uma entrada por palavra do
    // nome e por sufixo do código. Com ele, "coca" vira uma consulta de
    // faixa no índice em vez de uma varredura.
    this.version(4)
      .stores({
        products: 'id, code, name, is_active, *search_tokens',
        categories: 'id, name',
        syncMeta: 'key',
        pendingSales: 'id, status, createdAt',
        customers: 'id, full_name, phone',
      })
      .upgrade(async (tx) => {
        // Caches já instalados não têm os tokens: calcula na subida, para o
        // caixa não precisar esperar um sync completo para voltar a buscar.
        await tx
          .table('products')
          .toCollection()
          .modify((product: CachedProduct) => {
            product.search_tokens = buildSearchTokens(
              product.name ?? '',
              product.code ?? '',
            )
          })
      })
  }
}

/**
 * Singleton Dexie instance. Lazily constructed on the client so that
 * importing this module on the server (e.g. accidentally from a Server
 * Component) doesn't crash on `window.indexedDB` being undefined.
 */
let _db: VendasAppDB | null = null

export function getDB(): VendasAppDB {
  if (typeof window === 'undefined') {
    throw new Error(
      'getDB() called on the server. Offline cache is browser-only — guard the import with a "use client" boundary or a typeof window check.',
    )
  }
  if (!_db) _db = new VendasAppDB()
  return _db
}
