import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, PAYMENT_LABELS } from './format'

/** Intl inserts a non-breaking space (U+00A0); normalize it for readable asserts. */
function normalize(value: string): string {
  return value.replace(/ /g, ' ')
}

describe('formatCurrency', () => {
  it('formats a value as Brazilian Real', () => {
    expect(normalize(formatCurrency(1234.56))).toBe('R$ 1.234,56')
  })

  it('formats zero', () => {
    expect(normalize(formatCurrency(0))).toBe('R$ 0,00')
  })

  it('rounds to two decimal places', () => {
    expect(normalize(formatCurrency(9.999))).toBe('R$ 10,00')
  })

  it('formats thousands with a dot separator', () => {
    expect(normalize(formatCurrency(1000000))).toBe('R$ 1.000.000,00')
  })
})

describe('formatDate', () => {
  it('formats a date as dd/MM/yyyy às HH:mm (local time)', () => {
    // Numeric constructor = unambiguous local time, so the result is
    // timezone-independent for this assertion.
    const date = new Date(2026, 5, 8, 14, 30) // 08/06/2026 14:30
    expect(formatDate(date)).toBe('08/06/2026 às 14:30')
  })

  it('accepts an ISO string', () => {
    expect(formatDate('2026-01-05T09:05:00')).toBe('05/01/2026 às 09:05')
  })
})

describe('PAYMENT_LABELS', () => {
  it('maps every payment method to a pt-BR label', () => {
    expect(PAYMENT_LABELS.cash).toBe('Dinheiro')
    expect(PAYMENT_LABELS.credit).toBe('Cartão de Crédito')
    expect(PAYMENT_LABELS.debit).toBe('Cartão de Débito')
    expect(PAYMENT_LABELS.pix).toBe('PIX')
  })
})
