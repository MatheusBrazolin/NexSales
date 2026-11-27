/**
 * Offline-first product reads for the PDV.
 *
 * The point of sale must work with no network, so it reads exclusively from
 * the local IndexedDB cache (kept fresh by `SyncProvider` → `sync.ts`).
 *
 * A busca usa o índice multiEntry `search_tokens`. A versão anterior usava
 * `db.products.filter(...)` com a justificativa de que o catálogo era
 * pequeno — o que o Dexie resolve lendo TODOS os produtos do IndexedDB e
 * testando um por um em JavaScript, a cada tecla digitada. Essa premissa
 * deixa de valer no momento em que a loja cadastra alguns milhares de
 * itens, e é justamente o caixa quem paga a conta.
 *
 * Browser-only: `getDB()` throws on the server, so only import from client
 * components.
 */

import 'client-only'
import { getDB, type CachedProduct } from './db'
import {
  matchesQuery,
  normalizeSearchText,
  scoreMatch,
} from '@/lib/utils/search-text'
import { syncProducts } from './sync'
import type { Product } from '@/types/database'

const DEFAULT_LIMIT = 10

/**
 * Teto de candidatos lidos do cache antes de ordenar.
 *
 * Mantém o custo da busca constante por mais que o catálogo cresça: o PDV
 * mostra 10 linhas, não precisa materializar mil para escolher 10.
 */
const CANDIDATE_LIMIT = 200

/**
 * Substring search by name OR code, case-insensitive. Only active products
 * with stock are returned — same filter the PDV always applied.
 */
export async function searchProducts(
  query: string,
  limit = DEFAULT_LIMIT,
): Promise<Product[]> {
  const raw = query.trim()
  if (!raw) return []

  const q = normalizeSearchText(raw)
  if (!q) return []

  const db = getDB()

  // Consulta de faixa no índice: pega quem tem alguma palavra (ou sufixo de
  // código) começando pelo termo. É o caminho normal — digitar "coca",
  // "acuc", "sabao" ou o final de um código cai aqui.
  const byPrefix = (await db.products
    .where('search_tokens')
    .startsWith(q)
    .limit(CANDIDATE_LIMIT)
    .toArray()) as CachedProduct[]

  let candidates = byPrefix

  // Rede de segurança para o termo que cai no MEIO de uma palavra
  // ("efinado"), que índice de prefixo não alcança. Só roda quando o índice
  // trouxe pouca coisa, e é limitada, para nunca virar a varredura que esta
  // função existe para evitar.
  if (candidates.length < limit) {
    const fallback = (await db.products
      .filter((p) => matchesQuery(p.name, p.code, raw))
      .limit(CANDIDATE_LIMIT)
      .toArray()) as CachedProduct[]

    const seen = new Set(candidates.map((p) => p.id))
    candidates = [...candidates, ...fallback.filter((p) => !seen.has(p.id))]
  }

  const sellable = candidates.filter(
    (p) =>
      p.is_active &&
      // Produto sem controle de estoque (o "Item Avulso") vive em 0 e some
      // da busca se o filtro só olhar a quantidade — era o que acontecia.
      (!p.track_stock || p.stock_quantity > 0),
  )

  // Mesma ordem de search_products() no Postgres, para a lista do PDV sair
  // igual com e sem internet.
  return sellable
    .sort((a, b) => {
      const byScore =
        scoreMatch(a.name, a.code, raw) - scoreMatch(b.name, b.code, raw)
      if (byScore !== 0) return byScore
      return a.name.localeCompare(b.name, 'pt-BR')
    })
    .slice(0, limit)
}

/** Exact barcode/SKU lookup. Returns null when there's no active match. */
export async function getByCode(code: string): Promise<Product | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const db = getDB()
  const product = await db.products.where('code').equals(trimmed).first()
  if (!product || !product.is_active) return null
  return product
}

const STALE_MS = 5 * 60_000 // re-sync if cache is older than 5 minutes

/**
 * First-load safety net: syncs products if the local cache is empty OR if the
 * last sync is older than STALE_MS (5 min). This ensures a newly created or
 * edited product shows up in the PDV without waiting for the 60-second periodic
 * sync. Best-effort — swallows errors since the PDV must keep working regardless.
 */
export async function ensureProductsCached(): Promise<void> {
  try {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    const db = getDB()
    const count = await db.products.count()
    if (count === 0) {
      await syncProducts()
      return
    }
    const meta = await db.syncMeta.get('products')
    if (!meta || Date.now() - new Date(meta.lastSyncAt).getTime() > STALE_MS) {
      await syncProducts()
    }
  } catch {
    // Best-effort; the empty-state UI handles a still-empty cache.
  }
}
