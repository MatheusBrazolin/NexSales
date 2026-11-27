'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, Printer, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadCsv, csvFilename } from '@/lib/utils/csv'

interface ExportButtonsProps {
  /** Used for the file name: "<prefix>-2026-11-27.csv". */
  filePrefix: string
  /**
   * The finished CSV text, built by the caller with `buildCsv`.
   *
   * It arrives already built, rather than as columns + rows, because this is
   * a Client Component and a page that renders it on the server cannot send
   * functions across that boundary — a `value: (row) => row.name` accessor
   * throws "Functions cannot be passed directly to Client Components" at
   * render time and takes the whole page down with it. A string always
   * serialises.
   */
  csv: string
  /** Rows represented, only to decide whether there is anything to export. */
  rowCount: number
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
export function ExportButtons({
  filePrefix,
  csv,
  rowCount,
  showPrint = true,
}: ExportButtonsProps) {
  const [exporting, setExporting] = useState(false)

  function handleCsv() {
    if (rowCount === 0) {
      toast.info('Nada para exportar neste período.')
      return
    }

    setExporting(true)
    try {
      const ok = downloadCsv(csvFilename(filePrefix), csv)
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
