import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Product, Category } from '@/types/database'

// Must be hoisted — mock registers before the tested module is imported.
const fromMock = vi.fn()
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}))

import { getDB } from './db'
import {
  syncProducts,
  syncCategories,
  syncAll,
  getLastSync,
} from './sync'

// Build a mock Supabase query builder that is both chainable and awaitable.
//
// `range` existe porque o sync passou a paginar: sem ele o mock quebraria
// na primeira chamada. O mock registra o range pedido para os testes de
// paginação devolverem a fatia certa.
function chain(result: { data: unknown; error: unknown }) {
  const obj = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    then(
      resolve: (v: typeof result) => void,
      reject?: (e: unknown) => void,
    ) {
      return Promise.resolve(result).then(resolve, reject)
    },
    catch(onRejected: (reason: unknown) => void) {
      return Promise.resolve(result).catch(onRejected)
    },
  }
  obj.select.mockReturnValue(obj)
  obj.eq.mockReturnValue(obj)
  obj.gte.mockReturnValue(obj)
  obj.order.mockReturnValue(obj)
  obj.range.mockReturnValue(obj)
  return obj
}

/**
 * Mock que devolve uma fatia real do array por página, como o PostgREST faz.
 * Usado para provar que o sync não para na primeira página.
 */
function pagedChain<T>(rows: T[]) {
  const calls: Array<[number, number]> = []
  const obj = {
    select: vi.fn(),
    eq: vi.fn(),
    gte: vi.fn(),
    order: vi.fn(),
    range: vi.fn((from: number, to: number) => {
      calls.push([from, to])
      current = { data: rows.slice(from, to + 1), error: null }
      return obj
    }),
    then(resolve: (v: unknown) => void, reject?: (e: unknown) => void) {
      return Promise.resolve(current).then(resolve, reject)
    },
    catch(onRejected: (reason: unknown) => void) {
      return Promise.resolve(current).catch(onRejected)
    },
    calls,
  }
  let current: { data: unknown; error: unknown } = { data: [], error: null }
  obj.select.mockReturnValue(obj)
  obj.eq.mockReturnValue(obj)
  obj.gte.mockReturnValue(obj)
  obj.order.mockReturnValue(obj)
  return obj
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    code: '001',
    name: 'Produto',
    description: null,
    sale_price: 10,
    cost_price: 5,
    stock_quantity: 20,
    min_stock: 5,
    category_id: null,
    is_active: true,
    track_stock: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: crypto.randomUUID(),
    name: 'Categoria',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  const db = getDB()
  await db.products.clear()
  await db.categories.clear()
  await db.customers.clear()
  await db.syncMeta.clear()
  vi.clearAllMocks()
})

describe('syncProducts', () => {
  it('populates IndexedDB with rows returned by Supabase', async () => {
    const products = [makeProduct({ name: 'Café' }), makeProduct({ name: 'Pão' })]
    fromMock.mockReturnValue(chain({ data: products, error: null }))

    const result = await syncProducts()

    expect(result.synced).toBe(2)
    const stored = await getDB().products.toArray()
    expect(stored).toHaveLength(2)
    expect(stored.map((p) => p.name)).toEqual(expect.arrayContaining(['Café', 'Pão']))
  })

  it('replaces stale cache on each call', async () => {
    // Seed old data
    await getDB().products.add(makeProduct({ name: 'Velho' }))

    const fresh = [makeProduct({ name: 'Fresco' })]
    fromMock.mockReturnValue(chain({ data: fresh, error: null }))

    await syncProducts()

    const stored = await getDB().products.toArray()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('Fresco')
  })

  it('stamps syncMeta after a successful sync', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }))

    await syncProducts()

    const meta = await getDB().syncMeta.get('products')
    expect(meta?.key).toBe('products')
    expect(meta?.count).toBe(0)
    expect(meta?.lastSyncAt).toBeTruthy()
  })

  it('throws when Supabase returns an error', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'DB down' } }))

    await expect(syncProducts()).rejects.toMatchObject({ message: 'DB down' })
  })
})

describe('syncCategories', () => {
  it('populates IndexedDB with categories', async () => {
    const categories = [makeCategory({ name: 'Bebidas' }), makeCategory({ name: 'Laticínios' })]
    fromMock.mockReturnValue(chain({ data: categories, error: null }))

    const result = await syncCategories()

    expect(result.synced).toBe(2)
    expect(await getDB().categories.count()).toBe(2)
  })
})

describe('syncAll', () => {
  it('returns synced counts for all three entities on success', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }))

    const result = await syncAll()

    expect(result.products).toMatchObject({ synced: 0 })
    expect(result.categories).toMatchObject({ synced: 0 })
    expect(result.customers).toMatchObject({ synced: 0 })
  })

  it('captures a per-entity error without aborting the other syncs', async () => {
    // Keyed by table, not by call order: o sync de produtos agora lê o
    // syncMeta antes de falar com o servidor, então a ordem das chamadas
    // entre as três tabelas não é mais garantida.
    fromMock.mockImplementation((table: string) =>
      table === 'products'
        ? chain({ data: null, error: new Error('products failed') })
        : chain({ data: [], error: null }),
    )

    const result = await syncAll()

    // products failed, others succeeded
    expect(result.products).toMatchObject({ error: 'products failed' })
    expect(result.categories).toMatchObject({ synced: 0 })
    expect(result.customers).toMatchObject({ synced: 0 })
  })
})

describe('getLastSync', () => {
  it('returns undefined when never synced', async () => {
    expect(await getLastSync('products')).toBeUndefined()
  })

  it('returns the metadata written by syncProducts', async () => {
    fromMock.mockReturnValue(chain({ data: [makeProduct()], error: null }))
    await syncProducts()

    const meta = await getLastSync('products')
    expect(meta?.key).toBe('products')
    expect(meta?.count).toBe(1)
    expect(typeof meta?.lastSyncAt).toBe('string')
  })
})

describe('syncProducts — paginação', () => {
  it('busca além das 1000 linhas que o PostgREST devolve por vez', async () => {
    // 1200 produtos: o `select` solto que existia antes pararia em 1000 e
    // o caixa nunca encontraria os 200 últimos — sem erro nenhum na tela.
    const rows = Array.from({ length: 1200 }, (_, i) =>
      makeProduct({ name: `Produto ${i}`, code: String(i).padStart(4, '0') }),
    )
    const paged = pagedChain(rows)
    fromMock.mockReturnValue(paged)

    const result = await syncProducts()

    expect(result.synced).toBe(1200)
    expect(await getDB().products.count()).toBe(1200)
    // Duas páginas: 0–999 (cheia, continua) e 1000–1999 (incompleta, para).
    expect(paged.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe('syncProducts — incremental', () => {
  /** Deixa o cache no estado de quem já sincronizou uma vez. */
  async function seedSynced(products: Product[], cursor: string) {
    const db = getDB()
    await db.products.bulkPut(products)
    await db.syncMeta.put({
      key: 'products',
      lastSyncAt: cursor,
      count: products.length,
      cursor,
      lastFullSyncAt: new Date().toISOString(),
    })
  }

  it('pede só o que mudou depois do marco e preserva o resto do cache', async () => {
    const antigo = makeProduct({ name: 'Antigo', updated_at: '2026-01-01T00:00:00.000Z' })
    await seedSynced([antigo], '2026-01-01T00:00:00.000Z')

    const novo = makeProduct({ name: 'Novo', updated_at: '2026-01-02T00:00:00.000Z' })
    const builder = chain({ data: [novo], error: null })
    fromMock.mockReturnValue(builder)

    const result = await syncProducts()

    expect(result.mode).toBe('incremental')
    expect(result.synced).toBe(1)
    // O produto antigo continua lá: incremental não limpa a tabela.
    const stored = await getDB().products.toArray()
    expect(stored.map((p) => p.name).sort()).toEqual(['Antigo', 'Novo'])
    // Pediu por updated_at, não baixou o catálogo inteiro.
    expect(builder.gte).toHaveBeenCalledWith('updated_at', expect.any(String))
  })

  it('volta alguns segundos no marco, para não perder escrita demorada', async () => {
    await seedSynced([makeProduct()], '2026-01-01T00:00:10.000Z')
    const builder = chain({ data: [], error: null })
    fromMock.mockReturnValue(builder)

    await syncProducts()

    const [, since] = builder.gte.mock.calls[0] as [string, string]
    expect(Date.parse(since)).toBe(Date.parse('2026-01-01T00:00:10.000Z') - 5_000)
  })

  it('apaga do cache o produto que foi desativado', async () => {
    const produto = makeProduct({ name: 'Saiu de linha', updated_at: '2026-01-01T00:00:00.000Z' })
    await seedSynced([produto], '2026-01-01T00:00:00.000Z')

    fromMock.mockReturnValue(
      chain({
        data: [{ ...produto, is_active: false, updated_at: '2026-01-02T00:00:00.000Z' }],
        error: null,
      }),
    )

    const result = await syncProducts()

    expect(result.synced).toBe(1)
    // Sem isso ele seguiria vendável no PDV até o refresh completo do dia seguinte.
    expect(await getDB().products.count()).toBe(0)
  })

  it('avança o marco para o updated_at mais novo que baixou', async () => {
    await seedSynced([makeProduct()], '2026-01-01T00:00:00.000Z')
    fromMock.mockReturnValue(
      chain({
        data: [
          makeProduct({ updated_at: '2026-01-03T00:00:00.000Z' }),
          makeProduct({ updated_at: '2026-01-02T00:00:00.000Z' }),
        ],
        error: null,
      }),
    )

    await syncProducts()

    expect((await getLastSync('products'))?.cursor).toBe('2026-01-03T00:00:00.000Z')
  })

  it('mantém o marco quando não veio nada novo', async () => {
    await seedSynced([makeProduct()], '2026-01-01T00:00:00.000Z')
    fromMock.mockReturnValue(chain({ data: [], error: null }))

    await syncProducts()

    expect((await getLastSync('products'))?.cursor).toBe('2026-01-01T00:00:00.000Z')
  })

  it('cai para refresh completo quando o último completo passou de um dia', async () => {
    const db = getDB()
    await db.products.bulkPut([makeProduct({ name: 'Velho' })])
    await db.syncMeta.put({
      key: 'products',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      count: 1,
      cursor: '2026-01-01T00:00:00.000Z',
      lastFullSyncAt: new Date(Date.now() - 25 * 60 * 60_000).toISOString(),
    })
    fromMock.mockReturnValue(chain({ data: [makeProduct({ name: 'Fresco' })], error: null }))

    const result = await syncProducts()

    // O completo é o que elimina do cache um produto apagado de vez no servidor.
    expect(result.mode).toBe('full')
    expect((await getDB().products.toArray()).map((p) => p.name)).toEqual(['Fresco'])
  })

  it('cai para refresh completo quando o cache local está vazio', async () => {
    await getDB().syncMeta.put({
      key: 'products',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      count: 10,
      cursor: '2026-01-01T00:00:00.000Z',
      lastFullSyncAt: new Date().toISOString(),
    })
    fromMock.mockReturnValue(chain({ data: [makeProduct()], error: null }))

    const result = await syncProducts()

    expect(result.mode).toBe('full')
  })

  it('force: true pede o completo mesmo com marco válido', async () => {
    await seedSynced([makeProduct({ name: 'Velho' })], '2026-01-01T00:00:00.000Z')
    fromMock.mockReturnValue(chain({ data: [makeProduct({ name: 'Fresco' })], error: null }))

    const result = await syncProducts({ force: true })

    expect(result.mode).toBe('full')
    expect((await getDB().products.toArray()).map((p) => p.name)).toEqual(['Fresco'])
  })
})
