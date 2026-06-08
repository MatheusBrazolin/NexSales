import { describe, it, expect } from 'vitest'
import { loginSchema, createEmployeeSchema } from './auth.schema'
import { productSchema } from './product.schema'
import { categorySchema } from './category.schema'

describe('loginSchema', () => {
  it('accepts a valid username + password', () => {
    const result = loginSchema.safeParse({ username: 'joana', password: 'secret1' })
    expect(result.success).toBe(true)
  })

  it('trims surrounding spaces from the username', () => {
    const result = loginSchema.safeParse({ username: '  joana  ', password: 'secret1' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.username).toBe('joana')
  })

  it('rejects a password shorter than 6 chars', () => {
    const result = loginSchema.safeParse({ username: 'joana', password: '123' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty username', () => {
    expect(loginSchema.safeParse({ username: '', password: 'secret1' }).success).toBe(false)
  })
})

describe('createEmployeeSchema', () => {
  const base = {
    firstName: 'Ana',
    lastName: 'Silva',
    username: 'ana.silva',
    password: 'secret1',
  }

  it('accepts a valid employee', () => {
    expect(createEmployeeSchema.safeParse(base).success).toBe(true)
  })

  it('lowercases the username', () => {
    const result = createEmployeeSchema.safeParse({ ...base, username: 'Ana.Silva' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.username).toBe('ana.silva')
  })

  it('rejects a username with spaces', () => {
    expect(createEmployeeSchema.safeParse({ ...base, username: 'ana silva' }).success).toBe(false)
  })

  it('rejects a too-short first name', () => {
    expect(createEmployeeSchema.safeParse({ ...base, firstName: 'A' }).success).toBe(false)
  })
})

describe('productSchema', () => {
  const base = {
    code: '7891000100103',
    name: 'Leite Integral',
    sale_price: '5.50',
    cost_price: '3',
    stock_quantity: '10',
    min_stock: '2',
    category_id: '',
  }

  it('accepts a product and coerces numeric strings to numbers', () => {
    const result = productSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.sale_price).toBe(5.5)
      expect(result.data.stock_quantity).toBe(10)
    }
  })

  it('rejects a negative sale price', () => {
    expect(productSchema.safeParse({ ...base, sale_price: '-1' }).success).toBe(false)
  })

  it('rejects a non-integer stock quantity', () => {
    expect(productSchema.safeParse({ ...base, stock_quantity: '1.5' }).success).toBe(false)
  })

  it('rejects an empty product code', () => {
    expect(productSchema.safeParse({ ...base, code: '' }).success).toBe(false)
  })

  it('rejects an invalid category UUID', () => {
    expect(productSchema.safeParse({ ...base, category_id: 'not-a-uuid' }).success).toBe(false)
  })
})

describe('categorySchema', () => {
  it('accepts a valid name', () => {
    expect(categorySchema.safeParse({ name: 'Bebidas' }).success).toBe(true)
  })

  it('rejects a name shorter than 2 chars', () => {
    expect(categorySchema.safeParse({ name: 'A' }).success).toBe(false)
  })
})
