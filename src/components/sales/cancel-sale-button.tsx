'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cancelSale } from '@/app/(dashboard)/vendas/actions'

interface CancelSaleButtonProps {
  saleId: string
  /** Short human-readable id (e.g. last 8 chars) shown in the modal. */
  shortId: string
}

/**
 * Admin-only "Excluir venda" button on the sale detail page.
 *
 * Opens an inline confirmation modal that explicitly warns the user about
 * stock restoration before allowing the destructive action to run.
 */
export function CancelSaleButton({ saleId, shortId }: CancelSaleButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  // Escape closes the modal from anywhere inside it. Bound on the document
  // rather than the overlay so it works no matter which element holds focus.
  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isPending])

  function handleConfirm() {
    startTransition(async () => {
      const result = await cancelSale(saleId, reason)
      if (result.success) {
        toast.success('Venda excluída. Estoque devolvido aos produtos.')
        setIsOpen(false)
        router.push('/vendas')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Não foi possível excluir a venda.')
      }
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 hover:border-red-300"
        onClick={() => setIsOpen(true)}
      >
        <Trash2 className="mr-1.5 h-4 w-4" />
        Excluir venda
      </Button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-sale-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
        >
          {/* Real button rather than a click handler on the overlay div: the
              backdrop is dismissable by keyboard too, not only by mouse. */}
          <button
            type="button"
            aria-label="Fechar"
            disabled={isPending}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default focus:outline-none"
          />
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden ring-1 ring-slate-200">
            <div className="px-6 py-5 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="cancel-sale-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Excluir venda #{shortId}?
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Esta ação não pode ser desfeita.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-amber-50/60 border-b border-amber-100">
              <p className="text-sm text-amber-900 leading-relaxed">
                Ao excluir esta venda:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  Os produtos vendidos serão{' '}
                  <strong>devolvidos ao estoque</strong>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  Os totais do dia/mês serão recalculados
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-amber-600 mt-0.5">•</span>
                  A venda sai do histórico de vendas, mas{' '}
                  <strong>fica registrada no Registro de atividades</strong> — com
                  quem excluiu, quando, e tudo o que ela continha
                </li>
              </ul>
            </div>

            <div className="px-6 py-4 border-b border-slate-100">
              <label
                htmlFor="cancel-reason"
                className="block text-xs font-medium text-slate-700"
              >
                Motivo <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isPending}
                maxLength={200}
                placeholder="Ex.: cliente desistiu, item errado"
                className="mt-1.5 w-full h-9 rounded-md border border-slate-200 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Fica guardado junto com o registro da exclusão.
              </p>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-2 bg-slate-50/30">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
                className="text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending}
                className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-1.5 h-4 w-4" />
                    Excluir definitivamente
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
