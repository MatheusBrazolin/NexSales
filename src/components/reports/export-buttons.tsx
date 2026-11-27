'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildCsv, downloadCsv, csvFilename, type CsvColumn } from '@/lib/utils/csv'

interface ExportButtonsProps<T> {
  /** Used for the file name: "<prefix>-2026-11-27.csv". */
  filePrefix: string
  columns: CsvColumn<T>[]
  rows: T[]
  /** Lines written above the table — period, totals, whatever frames it. */
  preamble?: string[]
  /** Hides the PDF button where printing makes no sense. */
  showPrint?: boolean
}

/**
 * CSV download + PDF export for a report.
 *
 * The PDF route is the browser's own print dialog ("Salvar como PDF") driven
 * by the print stylesheet in globals.css, rather than a PDF library. That is
 * a deliberate trade: a client-side PDF generator would add well over 100 kB
 * to a page used a few times a month, and it would have to re-implement the
 * Brazilian number and date formatting that the browser already does right.
 */
export function ExportButtons<T>({
  filePrefix,
  columns,
  rows,
  preamble = [],
  showPrint = true,
}: ExportButtonsProps<T>) {
  const [exporting, setExporting] = useState(false)

  function handleCsv() {
    if (rows.length === 0) {
      toast.info('Nada para exportar neste período.')
      return
    }

    setExporting(true)
    try {
      const table = buildCsv(columns, rows)
      const content = preamble.length > 0
        ? `﻿${preamble.join('\r\n')}\r\n\r\n${table.slice(1)}`
        : table

      const ok = downloadCsv(csvFilename(filePrefix), content)
      if (ok) {
        toast.success('Arquivo CSV gerado.')
      } else {
        toast.error('Não foi possível gerar o arquivo neste navegador.')
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex items-center gap-2 print:hidden">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCsv}
        disabled={exporting}
        aria-busy={exporting}
        className="border-slate-200 dark:border-white/10"
      >
        {exporting ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden />
        ) : (
          <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden />
        )}
        Exportar CSV
      </Button>

      {showPrint && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          className="border-slate-200 dark:border-white/10"
        >
          <Printer className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Exportar PDF
        </Button>
      )}
    </div>
  )
}
