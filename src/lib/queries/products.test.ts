/**
 * Verifies the Electron bypass: when isElectron() returns true the query
 * functions read from the local SQLite cache and never touch Supabase.
 *
 * This guards against the regression where the Supabase path was attempted
 * first, causing the tryQuery 3-second fallback timer to fire before the
 * catch block could return SQLite data — leaving Electron pages empty offline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Category, ProductWithCategory } from '@/types/database'

vi.mock('@/lib/db/client', () => ({ isElectron: vi.fn() }))
vi.mock('@/lib/db/queries/products', () => ({
  getProductsPaged: vi.fn(),
  getLowStock: vi.fn(),
  getCategories: vi.fn(),
}))
// Prevent any real Supabase client construction in non-Electron tests.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockRejectedValue(new Error('Supabase must not be called')),
}))

import { createClient } from '@/lib/supabase/server'
import { isElectron } from '@/lib/db/client'
import * as sqliteQueries from '@/lib/db/queries/products'
import { getProductsPaged, getLowStock, getCategories } from '@/lib/queries/products'

const isElectronMock = vi.mocked(isElectron)
const sqliteGetProductsPaged = vi.mocked(sqliteQueries.getProductsPaged)
const sqliteGetLowStock = vi.mocked(sqliteQueries.getLowStock)
const sqliteGetCategories = vi.mocked(sqliteQueries.getCategories)

const EMPTY_PAGED = { items: [] as ProductWithCategory[], total: 0, page: 1, pageSize: 20, totalPages: 1 }
const EMPTY_PRODUCTS: ProductWithCategory[] = []
const EMPTY_CATEGORIES: Category[] = []

beforeEach(() => {
  vi.clearAllMocks()
  isElectronMock.mockReturnValue(false)
})

describe('getProductsPaged — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetProductsPaged.mockResolvedValue(EMPTY_PAGED)

    const result = await getProductsPaged()

    expect(sqliteGetProductsPaged).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PAGED)
  })

  it('forwards all params to the SQLite query', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetProductsPaged.mockResolvedValue(EMPTY_PAGED)

    const params = { search: 'café', page: 2, pageSize: 10 }
    await getProductsPaged(params)

    expect(sqliteGetProductsPaged).toHaveBeenCalledWith(params)
  })

  it('returns a non-empty list from SQLite when the cache has data', async () => {
    isElectronMock.mockReturnValue(true)
    const fakeProduct = {
      id: 'p-1', name: 'Café 500g', code: '001',
      sale_price: 12, cost_price: 6, stock_quantity: 30, min_stock: 5,
      is_active: true, track_stock: true, category_id: null, description: null, categories: null,
      created_at: '', updated_at: '',
    } satisfies ProductWithCategory
    sqliteGetProductsPaged.mockResolvedValue({
      items: [fakeProduct], total: 1, page: 1, pageSize: 20, totalPages: 1,
    })

    const result = await getProductsPaged({ search: 'café' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('Café 500g')
  })
})

describe('getLowStock — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetLowStock.mockResolvedValue(EMPTY_PRODUCTS)

    const result = await getLowStock()

    expect(sqliteGetLowStock).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_PRODUCTS)
  })
})

describe('getCategories — Electron path', () => {
  it('calls SQLite and returns its result', async () => {
    isElectronMock.mockReturnValue(true)
    sqliteGetCategories.mockResolvedValue(EMPTY_CATEGORIES)

    const result = await getCategories()

    expect(sqliteGetCategories).toHaveBeenCalledOnce()
    expect(result).toEqual(EMPTY_CATEGORIES)
  })

  it('returns categories from SQLite', async () => {
    isElectronMock.mockReturnValue(true)
    const cats: Category[] = [
      { id: 'c-1', name: 'Bebidas', created_at: '2026-01-01T00:00:00Z' },
    ]
    sqliteGetCategories.mockResolvedValue(cats)

    const result = await getCategories()

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Bebidas')
  })
})

/**
 * Builder encadeável e aguardável, como o do supabase-js.
 *
 * `result` é o que a consulta devolve: permite separar o que o BANCO
 * retornou do que a função entrega, que é exatamente onde morava o bug do
 * filtro de estoque.
 */
function builder(result: { data: unknown[]; count: number } = { data: [], count: 0 }) {
  const obj = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    in: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    then(resolve: (v: unknown) => void) {
      return Promise.resolve({ data: result.data, error: null, count: result.count }).then(resolve)
    },
  }
  for (const key of ['select', 'eq', 'or', 'in', 'lte', 'order', 'range'] as const) {
    obj[key].mockReturnValue(obj)
  }
  return obj
}

async function runPaged(
  params: Parameters<typeof getProductsPaged>[0],
  result?: { data: unknown[]; count: number },
) {
  const b = builder(result)
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn(() => b),
  } as unknown as Awaited<ReturnType<typeof createClient>>)

  const out = await getProductsPaged(params)
  // Embrulhado: `b` tem `then`, então devolvê-lo direto de uma função
  // async faria o await desembrulhar o mock no lugar de retorná-lo.
  return { b, out }
}

describe('getProductsPaged — filtro de busca no Supabase', () => {
  async function runSearch(search: string) {
    return runPaged({ search })
  }

  it('busca pela coluna normalizada, para o acento não esconder o produto', async () => {
    const { b } = await runSearch('açúcar')

    // O filtro tem que sair sem acento dos dois lados: a coluna name_norm
    // guarda "acucar" e o termo precisa chegar igual.
    expect(b.or).toHaveBeenCalledWith('name_norm.ilike.%acucar%,code.ilike.%acucar%')
  })

  it('acha o produto acentuado mesmo quando o termo vem sem acento', async () => {
    const { b } = await runSearch('ACUCAR')

    expect(b.or).toHaveBeenCalledWith('name_norm.ilike.%acucar%,code.ilike.%acucar%')
  })

  it('não monta filtro quando sobra texto vazio depois de limpar', async () => {
    const { b } = await runSearch('%%%')

    expect(b.or).not.toHaveBeenCalled()
  })
})

describe('getProductsPaged — filtro de estoque', () => {
  const produto = (over: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    code: '001',
    name: 'Produto',
    stock_quantity: 50,
    min_stock: 5,
    track_stock: true,
    is_active: true,
    categories: null,
    ...over,
  })

  it('manda "estoque baixo" para o banco ANTES de paginar', async () => {
    const { b } = await runPaged({ stock: 'low' })

    expect(b.eq).toHaveBeenCalledWith('stock_status', 'low')

    // O coração do defeito: o filtro rodava em JavaScript DEPOIS do range,
    // sobre as 20 linhas que já tinham sido cortadas. A ordem das chamadas
    // é o que prova que agora ele acontece no banco.
    const ordemDoFiltro = b.eq.mock.invocationCallOrder.at(-1) as number
    const ordemDoRange = b.range.mock.invocationCallOrder[0]
    expect(ordemDoFiltro).toBeLessThan(ordemDoRange)
  })

  it('"em estoque" inclui o produto sem controle de estoque', async () => {
    const { b } = await runPaged({ stock: 'ok' })

    // Sem o 'free', o "Item Avulso" — que vive em 0/0 — sumia da lista em
    // que o dono iria procurá-lo.
    expect(b.in).toHaveBeenCalledWith('stock_status', ['ok', 'free'])
  })

  it('"sem estoque" não varre mais a quantidade crua', async () => {
    const { b } = await runPaged({ stock: 'out' })

    expect(b.eq).toHaveBeenCalledWith('stock_status', 'out')
    // `lte('stock_quantity', 0)` marcava como esgotado todo produto sem
    // controle de estoque, que está em 0 por definição e não por falta.
    expect(b.lte).not.toHaveBeenCalled()
  })

  it('não filtra por situação quando o filtro é "todos"', async () => {
    const { b } = await runPaged({ stock: 'all' })

    const filtrosDeEstoque = b.eq.mock.calls.filter(([col]) => col === 'stock_status')
    expect(filtrosDeEstoque).toHaveLength(0)
    expect(b.in).not.toHaveBeenCalled()
  })

  it('entrega o que o banco filtrou, sem refiltrar no cliente', async () => {
    // O banco é a autoridade agora. Antes, estas linhas passavam por um
    // items.filter() que descartava parte da página já cortada — e o
    // cabeçalho seguia anunciando o total SEM filtro.
    // A segunda linha é deliberadamente "alta" (50 > 5): o items.filter()
    // antigo a descartaria aqui no cliente. Se ela voltar, é porque não
    // existe mais um segundo filtro discordando do banco.
    const doBanco = [
      produto({ stock_quantity: 3, min_stock: 5 }),
      produto({ stock_quantity: 50, min_stock: 5 }),
    ]
    const { out } = await runPaged({ stock: 'low' }, { data: doBanco, count: 2 })

    expect(out.items).toHaveLength(2)
    expect(out.total).toBe(2)
    expect(out.totalPages).toBe(1)
  })

  it('o total do cabeçalho passa a ser o total JÁ filtrado', async () => {
    // Este era o sintoma na tela: "120 produtos" no topo e três linhas na
    // tabela, porque o count vinha da consulta sem filtro e as linhas
    // vinham do filtro em JavaScript.
    const tresLinhas = [produto(), produto(), produto()]
    const { out } = await runPaged({ stock: 'low' }, { data: tresLinhas, count: 3 })

    expect(out.total).toBe(3)
    expect(out.items).toHaveLength(3)
  })
})
