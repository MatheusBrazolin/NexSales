'use client'

/**
 * Devolução de itens de uma venda.
 *
 * A venda original fica intacta: a devolução é um lançamento próprio que
 * aponta para ela. Antes, devolver significava EXCLUIR a venda — e isso
 * apaga um fato que aconteceu (o cliente pagou, o dinheiro entrou no caixa
 * daquele dia).
 */

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Undo2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatCurrency, PAYMENT_LABELS } from '@/lib/utils/format'
import { registerSaleReturn } from '@/app/(dashboard)/vendas/actions'
import type { ReturnableItem } from '@/lib/queries/returns'
import type { PaymentMethod } from '@/types/database'

const REFUND_METHODS: PaymentMethod[] = ['cash', 'pix', 'credit', 'debit', 'fiado']

export function SaleReturnButton({
  saleId,
  items,
}: {
  saleId: string
  items: ReturnableItem[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('cash')
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isPending) setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, isPending])

  const available = items.filter((item) => item.remaining > 0)
  const chosen = available
    .map((item) => ({ item, qty: quantities[item.sale_item_id] ?? 0 }))
    .filter(({ qty }) => qty > 0)
  const total = chosen.reduce((sum, { item, qty }) => sum + item.unit_price * qty, 0)
  const canSubmit = chosen.length > 0 && reason.trim().length >= 3

  // Tudo já voltou: não há o que devolver, então o botão não aparece.
  if (available.length === 0) return null

  function handleConfirm() {
    startTransition(async () => {
      const result = await registerSaleReturn(
        saleId,
        chosen.map(({ item, qty }) => ({ sale_item_id: item.sale_item_id, quantity: qty })),
        refundMethod,
        reason,
      )
      if (result.success) {
        toast.success('Devolução registrada. Estoque devolvido.')
        setIsOpen(false)
        setQuantities({})
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Não foi possível registrar a devolução.')
      }
    })
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setIsOpen(true)}>
        <Undo2 className="mr-1.5 h-4 w-4" />
        Devolver itens
      </Button>

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="Fechar"
            disabled={isPending}
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 cursor-default focus:outline-none"
          />
          <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-lg w-full overflow-hidden ring-1 ring-slate-200 dark:ring-white/10 max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/8">
              <h2 id="return-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Devolver itens
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                A venda continua no histórico. A devolução entra como lançamento
                próprio, e o estoque volta.
              </p>
            </div>

            <div className="px-6 py-4 space-y-3">
              {available.map((item) => (
                <div key={item.sale_item_id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {formatCurrency(item.unit_price)} · pode devolver {item.remaining}
                      {item.returned > 0 && ` (${item.returned} já devolvido)`}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={item.remaining}
                    value={quantities[item.sale_item_id] ?? ''}
                    onChange={(e) => {
                      const raw = parseInt(e.target.value, 10)
                      const qty = Number.isFinite(raw)
                        ? Math.max(0, Math.min(raw, item.remaining))
                        : 0
                      setQuantities((prev) => ({ ...prev, [item.sale_item_id]: qty }))
                    }}
                    placeholder="0"
                    className="h-9 w-20 text-center tabular-nums"
                    aria-label={`Quantidade a devolver de ${item.product_name}`}
                  />
                </div>
              ))}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-white/8 space-y-3">
              <div>
                <label
                  htmlFor="refund-method"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Como o valor foi devolvido
                </label>
                <select
                  id="refund-method"
                  value={refundMethod}
                  onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}
                  className="mt-1.5 w-full h-9 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-700/60 px-3 text-sm text-slate-900 dark:text-slate-100"
                >
                  {REFUND_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_LABELS[method]}
                    </option>
                  ))}
                </select>
                {refundMethod === 'cash' && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Sai da gaveta e entra na conferência do caixa de hoje.
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="return-reason"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Motivo <span className="text-red-500">*</span>
                </label>
                <Input
                  id="return-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  placeholder="Ex.: produto com defeito"
                  className="mt-1.5 h-9"
                />
              </div>

              <div className="flex items-baseline justify-between pt-1">
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Total a devolver
                </span>
                <span className="text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>

            <div className="px-6 py-4 flex items-center justify-end gap-2 bg-slate-50/30 dark:bg-white/3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={isPending || !canSubmit}
                className="disabled:opacity-50"
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Undo2 className="mr-1.5 h-4 w-4" />
                    Registrar devolução
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
