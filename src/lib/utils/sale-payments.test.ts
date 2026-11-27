import { describe, it, expect } from 'vitest'
import {
  cashChange,
  cleanPaymentLines,
  summarizeSplit,
  toCents,
  type PaymentLine,
} from './sale-payments'

describe('toCents', () => {
  it('evita a soma quebrada do ponto flutuante', () => {
    // 50.10 + 20.20 nao da exatamente 70.30 em binario. Se a comparacao
    // fosse em reais, esta venda seria recusada por uma diferenca que nao
    // existe na gaveta.
    expect(toCents(50.1) + toCents(20.2)).toBe(toCents(70.3))
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  it('trata valor invalido como zero', () => {
    expect(toCents(NaN)).toBe(0)
    expect(toCents(Infinity)).toBe(0)
  })
})

describe('summarizeSplit', () => {
  const lines = (...l: PaymentLine[]) => l

  it('fecha quando a soma bate com o total', () => {
    const s = summarizeSplit(
      lines({ method: 'credit', amount: 50 }, { method: 'cash', amount: 20 }),
      70,
    )
    expect(s.balanced).toBe(true)
    expect(s.remaining).toBe(0)
    expect(s.overpaid).toBe(false)
  })

  it('não fecha quando falta — e diz quanto falta', () => {
    const s = summarizeSplit(lines({ method: 'credit', amount: 50 }), 70)
    expect(s.balanced).toBe(false)
    expect(s.remaining).toBe(20)
  })

  it('acusa quando passou do total', () => {
    const s = summarizeSplit(
      lines({ method: 'credit', amount: 50 }, { method: 'cash', amount: 30 }),
      70,
    )
    expect(s.overpaid).toBe(true)
    expect(s.remaining).toBe(-10)
    expect(s.balanced).toBe(false)
  })

  it('a forma predominante é a de maior valor — é a etiqueta da venda', () => {
    const s = summarizeSplit(
      lines({ method: 'cash', amount: 20 }, { method: 'credit', amount: 50 }),
      70,
    )
    expect(s.predominant).toBe('credit')
  })

  it('no empate fica com a primeira, como o servidor', () => {
    const s = summarizeSplit(
      lines({ method: 'pix', amount: 35 }, { method: 'cash', amount: 35 }),
      70,
    )
    expect(s.predominant).toBe('pix')
  })

  it('qualquer parcela fiada exige cliente', () => {
    const s = summarizeSplit(
      lines({ method: 'cash', amount: 40 }, { method: 'fiado', amount: 30 }),
      70,
    )
    expect(s.requiresCustomer).toBe(true)
  })

  it('não exige cliente quando não há fiado', () => {
    expect(summarizeSplit(lines({ method: 'cash', amount: 70 }), 70).requiresCustomer).toBe(
      false,
    )
  })

  it('venda de total zero nunca fica balanceada', () => {
    // O servidor recusa parcela <= 0, entao nao existe divisao valida de
    // uma venda de R$ 0,00.
    expect(summarizeSplit([], 0).balanced).toBe(false)
  })

  it('ignora linha ainda não preenchida', () => {
    const s = summarizeSplit(
      lines({ method: 'cash', amount: 70 }, { method: 'pix', amount: 0 }),
      70,
    )
    expect(s.balanced).toBe(true)
  })
})

describe('cleanPaymentLines', () => {
  it('descarta as linhas zeradas que o servidor recusaria', () => {
    const out = cleanPaymentLines([
      { method: 'cash', amount: 10 },
      { method: 'pix', amount: 0 },
      { method: 'credit', amount: -5 },
    ])
    expect(out).toEqual([{ method: 'cash', amount: 10 }])
  })
})

describe('cashChange', () => {
  it('o troco sai só da parte em dinheiro', () => {
    // R$ 50 no cartao + R$ 15 em dinheiro, cliente entrega R$ 20.
    // Troco e R$ 5 — nao R$ 55, que seria devolver dinheiro que ele nunca
    // entregou.
    const change = cashChange(
      [
        { method: 'credit', amount: 50 },
        { method: 'cash', amount: 15 },
      ],
      20,
    )
    expect(change).toBe(5)
  })

  it('não devolve troco quando não há parcela em dinheiro', () => {
    expect(cashChange([{ method: 'pix', amount: 70 }], 100)).toBe(0)
  })

  it('não devolve negativo quando o recebido é menor', () => {
    expect(cashChange([{ method: 'cash', amount: 70 }], 50)).toBe(0)
  })
})
