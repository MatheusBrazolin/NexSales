import { describe, it, expect, beforeEach, vi } from 'vitest'

// Hoisted so the module mock factory can reference it.
const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ rpc: rpcMock })),
}))
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn() }))
vi.mock('@/lib/db/client', () => ({ isElectron: () => false }))
vi.mock('@/lib/db/sync', () => ({ pullSingleSale: vi.fn(), deleteLocalSale: vi.fn() }))

import { isAdmin } from '@/lib/auth/roles'
import { createSale, cancelSale } from './actions'

const validInput = {
  payment_method: 'cash' as const,
  notes: '',
  items: [{ product_id: 'p1', quantity: 2 }],
}

beforeEach(() => {
  rpcMock.mockReset()
})

describe('createSale', () => {
  it('returns the sale id on success', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    const result = await createSale(validInput)
    expect(result).toEqual({ saleId: 'sale-123' })
  })

  it('forwards the client_uuid as the idempotency key', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale({ ...validInput, client_uuid: 'uuid-abc' })
    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_client_uuid: 'uuid-abc' }),
    )
  })

  it('defaults client_uuid to null when omitted', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale(validInput)
    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_client_uuid: null }),
    )
  })

  it('maps insufficient_stock to a friendly message + code', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'insufficient_stock:Coca-Cola' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('insufficient_stock')
    expect(result.error).toBe('Estoque insuficiente para: Coca-Cola')
  })

  it('maps product_not_found', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'product_not_found:p1' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('product_not_found')
  })

  it('maps empty_cart', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'empty_cart' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('empty_cart')
  })

  it('maps unauthenticated', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'unauthenticated' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('unauthenticated')
  })

  it('falls back to code "unknown" for unexpected errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'some db explosion' } })
    const result = await createSale(validInput)
    expect(result.code).toBe('unknown')
    expect(result.error).toBe('some db explosion')
  })
})

describe('createSale — pagamento dividido', () => {
  it('encaminha as parcelas como p_payments', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })

    await createSale({
      ...validInput,
      payment_method: 'pix',
      payments: [
        { method: 'cash', amount: 5 },
        { method: 'pix', amount: 6.99 },
      ],
    })

    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({
        p_payment_method: 'pix',
        p_payments: [
          { method: 'cash', amount: 5 },
          { method: 'pix', amount: 6.99 },
        ],
      }),
    )
  })

  it('manda null quando não há divisão — é o caminho de forma única', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale(validInput)

    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_payments: null }),
    )
  })

  it('lista vazia também vira null, e não uma divisão que não soma nada', async () => {
    rpcMock.mockResolvedValue({ data: 'sale-123', error: null })
    await createSale({ ...validInput, payments: [] })

    expect(rpcMock).toHaveBeenCalledWith(
      'create_sale_with_items',
      expect.objectContaining({ p_payments: null }),
    )
  })

  it('traduz payment_mismatch do servidor para uma frase que o caixa entende', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'payment_mismatch:70.00:60.00' },
    })

    const result = await createSale(validInput)

    expect(result.code).toBe('payment_mismatch')
    expect(result.error).toContain('60.00')
    expect(result.error).toContain('70.00')
  })
})

describe('cancelSale — registro de auditoria', () => {
  it('encaminha o motivo para o banco gravar junto com a exclusão', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    rpcMock.mockResolvedValue({ error: null })

    await cancelSale('sale-1', '  cliente desistiu  ')

    expect(rpcMock).toHaveBeenCalledWith('cancel_sale', {
      p_sale_id: 'sale-1',
      p_reason: 'cliente desistiu',
    })
  })

  it('motivo em branco vira null, e não uma string vazia no histórico', async () => {
    vi.mocked(isAdmin).mockResolvedValue(true)
    rpcMock.mockResolvedValue({ error: null })

    await cancelSale('sale-1', '   ')

    expect(rpcMock).toHaveBeenCalledWith(
      'cancel_sale',
      expect.objectContaining({ p_reason: null }),
    )
  })

  it('não chama o banco quando quem pede não é admin', async () => {
    vi.mocked(isAdmin).mockResolvedValue(false)

    const result = await cancelSale('sale-1')

    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
  })
})
