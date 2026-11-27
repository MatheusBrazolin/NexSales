import { describe, it, expect } from 'vitest'
import { cartSubtotal, parseDiscountInput, saleTotals } from './sale-totals'

describe('cartSubtotal', () => {
  it('is zero for an empty cart', () => {
    expect(cartSubtotal([])).toBe(0)
  })

  it('multiplies price by quantity', () => {
    expect(cartSubtotal([{ quantity: 3, unitPrice: 2.5 }])).toBe(7.5)
  })

  it('prefers the price the cashier typed over the catalogue price', () => {
    expect(cartSubtotal([{ quantity: 2, unitPrice: 10, customPrice: 7 }])).toBe(14)
  })

  it('honours a deliberate R$ 0,00 override instead of falling back', () => {
    // This is the exact case the NULLIF(..., 0) bug used to get wrong on the
    // server: a giveaway was silently charged at the catalogue price.
    expect(cartSubtotal([{ quantity: 1, unitPrice: 10, customPrice: 0 }])).toBe(0)
  })
})

describe('parseDiscountInput', () => {
  it('reads an empty field as no discount', () => {
    expect(parseDiscountInput('')).toBe(0)
    expect(parseDiscountInput('   ')).toBe(0)
  })

  it('accepts the Brazilian comma decimal', () => {
    expect(parseDiscountInput('12,50')).toBe(12.5)
  })

  it('accepts a dot decimal too', () => {
    expect(parseDiscountInput('12.50')).toBe(12.5)
  })

  it('treats unparseable text as no discount, not as an error', () => {
    expect(parseDiscountInput('abc')).toBe(0)
  })
})

describe('saleTotals', () => {
  it('subtracts the discount from the subtotal', () => {
    expect(saleTotals(100, 15)).toMatchObject({ discount: 15, total: 85 })
  })

  it('ignores a negative discount instead of inflating the sale', () => {
    expect(saleTotals(100, -20)).toMatchObject({ discount: 0, total: 100 })
  })

  it('clamps a discount larger than the sale, so the total never goes negative', () => {
    expect(saleTotals(50, 80)).toMatchObject({ discount: 50, total: 0, exceeded: true })
  })

  it('does not flag an exceeded discount on an empty cart', () => {
    // Typing a discount before scanning anything is not a mistake worth
    // warning about — there is simply nothing to discount yet.
    expect(saleTotals(0, 10).exceeded).toBe(false)
  })

  it('matches the server when the discount equals the sale exactly', () => {
    expect(saleTotals(40, 40)).toMatchObject({ discount: 40, total: 0, exceeded: false })
  })

  it('falls back to no discount when handed a non-finite number', () => {
    expect(saleTotals(100, NaN)).toMatchObject({ discount: 0, total: 100 })
  })
})
