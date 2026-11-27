/**
 * CSV generation tuned for Brazilian Excel.
 *
 * Three details decide whether the file opens correctly or as a single
 * mangled column, and all three are easy to get wrong:
 *
 * 1. Separator. Excel in a pt-BR locale expects `;`, not `,`, because the
 *    comma is the decimal separator here.
 * 2. Decimals. 1234.5 must be written "1234,50" or Excel reads it as text.
 * 3. Encoding. Without a UTF-8 BOM, Excel assumes Latin-1 and every
 *    "Ç", "ã" and "é" in a product name comes out broken.
 */

export type CsvValue = string | number | null | undefined

/** Column definition: a header plus how to pull the cell out of a row. */
export interface CsvColumn<T> {
  header: string
  value: (row: T) => CsvValue
}

const SEPARATOR = ';'
const BOM = '﻿'

/** Formats a number the way Excel pt-BR expects: comma decimals, no grouping. */
export function csvNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return ''
  return value.toFixed(decimals).replace('.', ',')
}

/**
 * Escapes one cell. Quotes anything holding the separator, a quote or a line
 * break; a literal quote inside is doubled, per RFC 4180.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''

  const text = typeof value === 'number' ? csvNumber(value) : String(value)
  if (!/["\r\n;]/.test(text)) return text

  return `"${text.replace(/"/g, '""')}"`
}

/** Builds the full CSV text, BOM included, ready to be written to a file. */
export function buildCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(SEPARATOR),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(SEPARATOR)),
  ]
  return BOM + lines.join('\r\n')
}

/**
 * Hands the CSV to the browser as a download.
 *
 * Returns false when there is no DOM to work with (SSR, or a test), so the
 * caller can tell the user instead of failing silently.
 */
export function downloadCsv(filename: string, content: string): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return false
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Give the browser a tick to start the download before revoking the handle.
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
  return true
}

/** "relatorio-lucro-2026-11-27.csv" — sortable, no spaces, no accents. */
export function csvFilename(prefix: string, date = new Date()): string {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
  return `${prefix}-${iso}.csv`
}
