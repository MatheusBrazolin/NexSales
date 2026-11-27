'use client'

/**
 * Divisão do pagamento de uma venda entre várias formas.
 *
 * Existe porque `create_sale_with_items` RECUSA a venda quando a soma das
 * parcelas não bate com o total. Deixar o caixa descobrir isso só ao
 * apertar F4, com um erro do banco, seria péssimo no meio do atendimento —
 * então o que falta (ou o que passou) fica visível o tempo todo, e o botão
 * de finalizar só libera quando fecha.
 */

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils/format'
import { parseDiscountInput } from '@/lib/utils/sale-totals'
import { summarizeSplit, type PaymentLine } from '@/lib/utils/sale-payments'
import type { PaymentMethod } from '@/types/database'

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'credit', label: 'Cartão de Crédito' },
  { value: 'debit', label: 'Cartão de Débito' },
  { value: 'fiado', label: 'Fiado' },
]

export interface PaymentSplitProps {
  /** Total da venda, já com desconto. */
  total: number
  lines: PaymentLine[]
  onChange: (lines: PaymentLine[]) => void
  /** Texto cru digitado em cada linha, para o operador poder apagar e redigitar. */
  rawAmounts: string[]
  onRawAmountsChange: (raw: string[]) => void
}

export function PaymentSplit({
  total,
  lines,
  onChange,
  rawAmounts,
  onRawAmountsChange,
}: PaymentSplitProps) {
  const summary = summarizeSplit(lines, total)

  function updateLine(index: number, patch: Partial<PaymentLine>, raw?: string) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
    if (raw !== undefined) {
      onRawAmountsChange(rawAmounts.map((value, i) => (i === index ? raw : value)))
    }
  }

  function addLine() {
    // A nova linha já vem com o que falta. É o caso comum: o cliente diz
    // "R$ 50 no cartão e o resto em dinheiro" — o resto o sistema sabe.
    const remaining = summary.remaining > 0 ? summary.remaining : 0
    const used = new Set(lines.map((l) => l.method))
    const next = PAYMENT_OPTIONS.find((o) => !used.has(o.value))?.value ?? 'cash'

    onChange([...lines, { method: next, amount: remaining }])
    onRawAmountsChange([
      ...rawAmounts,
      remaining > 0 ? remaining.toFixed(2).replace('.', ',') : '',
    ])
  }

  function removeLine(index: number) {
    onChange(lines.filter((_, i) => i !== index))
    onRawAmountsChange(rawAmounts.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-slate-800/40 p-3">
      <div className="space-y-2.5">
        {lines.map((line, index) => (
          <div key={index} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              {index === 0 && (
                <Label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Forma
                </Label>
              )}
              <Select
                value={line.method}
                items={PAYMENT_OPTIONS}
                onValueChange={(v) => updateLine(index, { method: v as PaymentMethod })}
              >
                <SelectTrigger className="h-9 border-slate-200 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-28 space-y-1">
              {index === 0 && (
                <Label
                  htmlFor={`split-amount-${index}`}
                  className="text-[11px] font-medium text-slate-600 dark:text-slate-400"
                >
                  Valor
                </Label>
              )}
              <div className="relative">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  R$
                </span>
                <Input
                  id={`split-amount-${index}`}
                  inputMode="decimal"
                  value={rawAmounts[index] ?? ''}
                  onChange={(e) =>
                    updateLine(
                      index,
                      { amount: parseDiscountInput(e.target.value) },
                      e.target.value,
                    )
                  }
                  placeholder="0,00"
                  className="h-9 pl-8 text-right tabular-nums"
                />
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeLine(index)}
              disabled={lines.length <= 1}
              aria-label={`Remover forma de pagamento ${index + 1}`}
              className="h-9 w-9 shrink-0 text-slate-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addLine}
        disabled={lines.length >= PAYMENT_OPTIONS.length}
        className="w-full h-8 text-xs"
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        Adicionar forma
      </Button>

      <SplitStatus
        balanced={summary.balanced}
        overpaid={summary.overpaid}
        remaining={summary.remaining}
      />
    </div>
  )
}

function SplitStatus({
  balanced,
  overpaid,
  remaining,
}: {
  balanced: boolean
  overpaid: boolean
  remaining: number
}) {
  if (balanced) {
    return (
      <p
        role="status"
        className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400"
      >
        Pagamento fecha com o total
      </p>
    )
  }

  if (overpaid) {
    return (
      <p
        role="status"
        className="text-center text-xs font-medium text-red-600 dark:text-red-400"
      >
        Passou {formatCurrency(Math.abs(remaining))} do total
      </p>
    )
  }

  return (
    <p
      role="status"
      className="text-center text-xs font-medium text-amber-700 dark:text-amber-400"
    >
      Falta {formatCurrency(remaining)}
    </p>
  )
}
