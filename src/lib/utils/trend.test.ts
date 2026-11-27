import { describe, it, expect } from 'vitest'
import { compareToPrevious } from './trend'

describe('compareToPrevious', () => {
  it('reports growth with a signed percentage', () => {
    expect(compareToPrevious(150, 100, 'vs ontem')).toMatchObject({
      direction: 'up',
      label: '+50% vs ontem',
    })
  })

  it('reports a drop with a minus sign', () => {
    expect(compareToPrevious(50, 100, 'vs ontem')).toMatchObject({
      direction: 'down',
      label: '−50% vs ontem',
    })
  })

  it('says there is no movement when both periods are empty', () => {
    // This is the case that used to read "+12% vs ontem" next to R$ 0,00.
    expect(compareToPrevious(0, 0, 'vs ontem')).toMatchObject({
      direction: 'flat',
      label: 'sem movimento vs ontem',
      percent: null,
    })
  })

  it('refuses to invent a percentage when there is no baseline', () => {
    expect(compareToPrevious(500, 0, 'vs ontem')).toMatchObject({
      direction: 'up',
      label: 'sem comparação vs ontem',
      percent: null,
    })
  })

  it('names a day with no sales instead of printing −100%', () => {
    expect(compareToPrevious(0, 300, 'vs ontem')).toMatchObject({
      direction: 'down',
      label: 'nada vendido vs ontem',
    })
  })

  it('treats a difference of centavos as stable', () => {
    expect(compareToPrevious(100.001, 100, 'vs ontem').direction).toBe('flat')
  })

  it('uses the Brazilian decimal comma', () => {
    expect(compareToPrevious(101.5, 100, 'vs ontem').label).toBe('+1,5% vs ontem')
  })

  it('drops the decimal once the number is big enough not to need it', () => {
    expect(compareToPrevious(234, 100, 'vs ontem').label).toBe('+134% vs ontem')
  })

  it('caps absurd swings off a tiny base', () => {
    // Yesterday R$ 2, today R$ 900 is +44900% — a true number that tells
    // the shopkeeper nothing.
    expect(compareToPrevious(900, 2, 'vs ontem').label).toBe('+999% vs ontem')
  })

  it('survives non-finite input instead of rendering NaN', () => {
    expect(compareToPrevious(NaN, 100, 'vs ontem').label).toBe('nada vendido vs ontem')
    expect(compareToPrevious(100, NaN, 'vs ontem').percent).toBeNull()
  })

  it('carries the suffix through so the badge says what it compares to', () => {
    expect(compareToPrevious(120, 100, 'vs mês anterior').label)
      .toBe('+20% vs mês anterior')
  })
})
