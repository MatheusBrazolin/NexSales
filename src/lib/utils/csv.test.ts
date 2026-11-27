import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildCsv,
  buildCsvReport,
  csvCell,
  csvNumber,
  csvFilename,
  downloadCsv,
} from './csv'

describe('csvNumber', () => {
  it('uses a comma for decimals, as Excel pt-BR expects', () => {
    expect(csvNumber(1234.5)).toBe('1234,50')
  })

  it('does not group thousands — grouping would need quoting too', () => {
    expect(csvNumber(1234567.89)).toBe('1234567,89')
  })

  it('honours a custom precision', () => {
    expect(csvNumber(12.3456, 3)).toBe('12,346')
  })

  it('returns empty for values that are not finite', () => {
    expect(csvNumber(NaN)).toBe('')
    expect(csvNumber(Infinity)).toBe('')
  })
})

describe('csvCell', () => {
  it('leaves plain text alone', () => {
    expect(csvCell('Coca-Cola 2L')).toBe('Coca-Cola 2L')
  })

  it('quotes a value containing the separator', () => {
    expect(csvCell('Arroz; Feijão')).toBe('"Arroz; Feijão"')
  })

  it('doubles embedded quotes', () => {
    expect(csvCell('Caixa 12"')).toBe('"Caixa 12"""')
  })

  it('quotes values with line breaks', () => {
    expect(csvCell('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"')
  })

  it('writes null and undefined as an empty cell', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
  })

  it('formats numbers through csvNumber', () => {
    expect(csvCell(9.9)).toBe('9,90')
  })
})

describe('buildCsv', () => {
  interface Row {
    name: string
    total: number
  }

  const columns = [
    { header: 'Produto', value: (r: Row) => r.name },
    { header: 'Total', value: (r: Row) => r.total },
  ]

  it('starts with a UTF-8 BOM so Excel does not mangle accents', () => {
    expect(buildCsv(columns, [])).toMatch(/^﻿/)
  })

  it('writes the header even with no rows', () => {
    expect(buildCsv(columns, [])).toBe('﻿Produto;Total')
  })

  it('separates with semicolons and ends lines with CRLF', () => {
    const csv = buildCsv(columns, [{ name: 'Pão', total: 1.5 }])
    expect(csv).toBe('﻿Produto;Total\r\nPão;1,50')
  })

  it('escapes cells that would otherwise break the column layout', () => {
    const csv = buildCsv(columns, [{ name: 'Kit; promo', total: 10 }])
    expect(csv).toContain('"Kit; promo";10,00')
  })
})

describe('csvFilename', () => {
  it('appends a sortable ISO date', () => {
    expect(csvFilename('relatorio-lucro', new Date('2026-11-27T12:00:00Z')))
      .toBe('relatorio-lucro-2026-11-27.csv')
  })

  it('uses the Brazilian day, not the server day', () => {
    // 01:30 UTC on the 28th is still 22:30 on the 27th in São Paulo.
    expect(csvFilename('vendas', new Date('2026-11-28T01:30:00Z')))
      .toBe('vendas-2026-11-27.csv')
  })
})

describe('downloadCsv', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports failure when the environment cannot create object URLs', () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: undefined })
    expect(downloadCsv('x.csv', 'a;b')).toBe(false)
  })

  it('names the file with a .csv extension when the caller omits it', () => {
    const click = vi.fn()
    const created: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)

    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:fake',
      revokeObjectURL: () => {},
    })
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreate(tag) as HTMLAnchorElement
      if (tag === 'a') {
        el.click = click
        created.push(el)
      }
      return el
    }) as typeof document.createElement)

    expect(downloadCsv('relatorio', 'a;b')).toBe(true)
    expect(created[0].download).toBe('relatorio.csv')
    expect(click).toHaveBeenCalledTimes(1)

    vi.restoreAllMocks()
  })
})

describe('buildCsvReport', () => {
  interface Row {
    name: string
  }
  const columns = [{ header: 'Produto', value: (r: Row) => r.name }]

  it('falls back to a plain table when there is no preamble', () => {
    expect(buildCsvReport([], columns, [])).toBe(buildCsv(columns, []))
  })

  it('puts the summary above the table, separated by a blank line', () => {
    const csv = buildCsvReport(['Periodo;Este mes'], columns, [{ name: 'Pão' }])
    expect(csv).toBe('﻿Periodo;Este mes\r\n\r\nProduto\r\nPão')
  })

  it('keeps exactly one BOM, at the very start where Excel looks for it', () => {
    const csv = buildCsvReport(['Resumo'], columns, [{ name: 'X' }])
    expect(csv.indexOf('﻿')).toBe(0)
    expect(csv.lastIndexOf('﻿')).toBe(0)
  })
})
