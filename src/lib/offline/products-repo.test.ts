import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Product } from '@/types/database'

// Mock the sync layer so ensureProductsCached doesn't reach Supabase.
vi.mock('./sync', () => ({
  syncProducts: vi.fn().mockResolvedValue({ synced: 0, at: '' }),
}))

import { getDB } from './db'
import { syncProducts } from './sync'
import { searchProducts, getByCode, ensureProductsCached } from './products-repo'
import { buildSearchTokens } from '@/lib/utils/search-text'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: crypto.randomUUID(),
    code: '0001',
    name: 'Produto',
    description: null,
    sale_price: 5,
    cost_price: 3,
    stock_quantity: 10,
    min_stock: 2,
    category_id: null,
    is_active: true,
    track_stock: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(async () => {
  const db = getDB()
  await db.products.clear()
  await db.syncMeta.clear()
  vi.clearAllMocks()
})

describe('searchProducts', () => {
  beforeEach(async () => {
    const db = getDB()
    await db.products.bulkAdd([
      makeProduct({ code: '111', name: 'Coca-Cola Lata' }),
      makeProduct({ code: '222', name: 'Coca-Cola 2L' }),
      makeProduct({ code: '333', name: 'Água Mineral' }),
      makeProduct({ code: '444', name: 'Inativo', is_active: false }),
      makeProduct({ code: '555', name: 'Sem Estoque', stock_quantity: 0 }),
    ])
  })

  it('finds products by name substring (case-insensitive)', async () => {
    const results = await searchProducts('coca')
    expect(results).toHaveLength(2)
    expect(results.map((p) => p.name)).toContain('Coca-Cola Lata')
  })

  it('finds a product by its code', async () => {
    const results = await searchProducts('333')
    expect(results).toHaveLength(1)
    expect(results[0].name).toBe('Água Mineral')
  })

  it('excludes inactive products and out-of-stock products', async () => {
    expect(await searchProducts('Inativo')).toHaveLength(0)
    expect(await searchProducts('Sem Estoque')).toHaveLength(0)
  })

  it('returns an empty array for a blank query', async () => {
    expect(await searchProducts('   ')).toHaveLength(0)
  })

  it('respects the limit', async () => {
    const results = await searchProducts('coca', 1)
    expect(results).toHaveLength(1)
  })
})

describe('getByCode', () => {
  it('returns the active product for an exact code', async () => {
    const db = getDB()
    await db.products.add(makeProduct({ code: '7891000', name: 'Leite' }))
    const found = await getByCode('7891000')
    expect(found?.name).toBe('Leite')
  })

  it('returns null for an unknown code', async () => {
    expect(await getByCode('does-not-exist')).toBeNull()
  })

  it('returns null for an inactive product', async () => {
    const db = getDB()
    await db.products.add(makeProduct({ code: 'OFF', is_active: false }))
    expect(await getByCode('OFF')).toBeNull()
  })
})

describe('ensureProductsCached', () => {
  it('does nothing when the cache already has products and meta is fresh', async () => {
    const db = getDB()
    await db.products.add(makeProduct())
    await db.syncMeta.put({ key: 'products', lastSyncAt: new Date().toISOString(), count: 1 })
    await ensureProductsCached()
    expect(syncProducts).not.toHaveBeenCalled()
  })

  it('syncs once when the cache is empty and online', async () => {
    await ensureProductsCached()
    expect(syncProducts).toHaveBeenCalledTimes(1)
  })
})

describe('searchProducts — catálogo grande', () => {
  beforeEach(async () => {
    const db = getDB()
    await db.products.bulkAdd(
      [
        makeProduct({ code: '7891000100103', name: 'Açúcar Refinado União 1kg' }),
        makeProduct({ code: '7891910000197', name: 'Sabão em Pó OMO 1,6kg' }),
        makeProduct({ code: '7891000053508', name: 'Leite Condensado Moça 395g' }),
        makeProduct({ code: '0100', name: 'Item Avulso', track_stock: false, stock_quantity: 0 }),
        makeProduct({ code: '9999', name: 'Garrafa de Coca Retornável' }),
        makeProduct({ code: '8888', name: 'Coca-Cola 2L' }),
      ].map((p) => ({ ...p, search_tokens: buildSearchTokens(p.name, p.code) })),
    )
  })

  it('acha produto com acento quando o caixa digita sem', async () => {
    // O caso que mais atrapalha na prática: sem isto o operador conclui
    // que o produto não existe e cadastra de novo.
    const results = await searchProducts('acucar')
    expect(results.map((p) => p.name)).toContain('Açúcar Refinado União 1kg')
  })

  it('acha "Sabão" digitando "sabao"', async () => {
    expect((await searchProducts('sabao')).map((p) => p.name))
      .toContain('Sabão em Pó OMO 1,6kg')
  })

  it('acha "Moça" digitando "moca"', async () => {
    expect((await searchProducts('moca')).map((p) => p.name))
      .toContain('Leite Condensado Moça 395g')
  })

  it('acha pelo final do código, para quem não leu o começo', async () => {
    expect((await searchProducts('0103')).map((p) => p.code))
      .toContain('7891000100103')
  })

  it('inclui produto sem controle de estoque', async () => {
    // Item Avulso vive em 0 e sumia da busca, porque o filtro antigo só
    // olhava stock_quantity > 0 e ignorava track_stock.
    expect((await searchProducts('avulso')).map((p) => p.name))
      .toContain('Item Avulso')
  })

  it('põe o nome que começa com o termo antes do que tem no meio', async () => {
    const results = await searchProducts('coca')
    expect(results[0].name).toBe('Coca-Cola 2L')
  })

  it('põe o código exato em primeiro lugar', async () => {
    const results = await searchProducts('7891000100103')
    expect(results[0].code).toBe('7891000100103')
  })

  it('respeita o limite pedido', async () => {
    expect((await searchProducts('a', 2)).length).toBeLessThanOrEqual(2)
  })

  it('continua achando produto cacheado antes da v4, sem tokens', async () => {
    // Caches instalados migram na subida do Dexie, mas a busca não pode
    // depender disso para funcionar.
    const db = getDB()
    await db.products.add(makeProduct({ code: '7777', name: 'Detergente Ypê' }))
    expect((await searchProducts('detergente')).map((p) => p.name))
      .toContain('Detergente Ypê')
  })
})
