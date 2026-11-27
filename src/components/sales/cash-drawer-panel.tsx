'use client'

/**
 * Conferência da gaveta: fundo de troco, sangria, suprimento e fechamento.
 *
 * A tela de fechamento até aqui era um RESUMO DAS VENDAS — mostrava o que o
 * sistema já sabia e não conferia nada. Faltava a única pergunta que importa
 * no fim do dia: o dinheiro que está na gaveta bate com o que deveria estar?
 *
 * O esperado soma apenas a PARCELA em dinheiro das vendas. Cartão e PIX não
 * estão na gaveta, e numa venda mista só parte dela está.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Wallet, ArrowDownLeft, ArrowUpRight, Lock, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format'
import { parseDiscountInput } from '@/lib/utils/sale-totals'
import { formatBRDateTime } from '@/lib/utils/datetime'
import {
  registerCashMovement,
  closeCashRegister,
} from '@/app/(dashboard)/vendas/fechamento/actions'
import type { CashDrawer, CashMovementKind } from '@/lib/queries/cash-drawer'

const KIND_LABELS: Record<CashMovementKind, string> = {
  opening: 'Fundo de troco',
  in: 'Suprimento',
  out: 'Sangria',
}

export function CashDrawerPanel({ drawer, date }: { drawer: CashDrawer; date: string }) {
  const [form, setForm] = useState<CashMovementKind | null>(null)
  const [amountRaw, setAmountRaw] = useState('')
  const [reason, setReason] = useState('')
  const [countedRaw, setCountedRaw] = useState('')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const amount = parseDiscountInput(amountRaw)
  const counted = parseDiscountInput(countedRaw)
  const difference = countedRaw.trim() ? counted - drawer.expected : null

  function submitMovement() {
    if (!form) return
    startTransition(async () => {
      const result = await registerCashMovement(form, amount, reason)
      if (result.success) {
        toast.success(`${KIND_LABELS[form]} registrada.`)
        setForm(null)
        setAmountRaw('')
        setReason('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Não foi possível registrar.')
      }
    })
  }

  function submitClose() {
    startTransition(async () => {
      const result = await closeCashRegister(date, counted, notes)
      if (result.success) {
        toast.success('Caixa fechado.')
        setCountedRaw('')
        setNotes('')
        router.refresh()
      } else {
        toast.error(result.error ?? 'Não foi possível fechar o caixa.')
      }
    })
  }

  return (
    <Card className="border-slate-200/80 dark:border-white/8 shadow-sm dark:bg-slate-800/60">
      <CardHeader className="bg-slate-50/60 dark:bg-white/3 border-b border-slate-100 dark:border-white/5 pb-3">
        <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Wallet className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          Conferência da gaveta
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        <dl className="space-y-1.5 text-sm">
          <Row label="Fundo de troco" value={drawer.opening} />
          <Row label="Vendas em dinheiro" value={drawer.cashSales} hint="só a parte paga em espécie" />
          <Row label="Suprimentos" value={drawer.supplies} />
          <Row label="Sangrias" value={-drawer.withdrawals} />
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 dark:border-white/10">
            <dt className="font-semibold text-slate-900 dark:text-slate-100">
              Deveria haver na gaveta
            </dt>
            <dd className="font-semibold text-lg text-slate-900 dark:text-slate-100 tabular-nums">
              {formatCurrency(drawer.expected)}
            </dd>
          </div>
        </dl>

        {drawer.close ? (
          <ClosedSummary close={drawer.close} />
        ) : (
          <>
            {form === null ? (
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setForm('opening')} className="text-xs h-8">
                  Fundo
                </Button>
                <Button variant="outline" size="sm" onClick={() => setForm('out')} className="text-xs h-8">
                  <ArrowUpRight className="h-3.5 w-3.5 mr-1" />
                  Sangria
                </Button>
                <Button variant="outline" size="sm" onClick={() => setForm('in')} className="text-xs h-8">
                  <ArrowDownLeft className="h-3.5 w-3.5 mr-1" />
                  Suprimento
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2.5">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {KIND_LABELS[form]}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="mov-amount" className="text-[11px] text-slate-600 dark:text-slate-400">
                      Valor
                    </Label>
                    <Input
                      id="mov-amount"
                      inputMode="decimal"
                      value={amountRaw}
                      onChange={(e) => setAmountRaw(e.target.value)}
                      placeholder="0,00"
                      className="h-9 text-right tabular-nums"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mov-reason" className="text-[11px] text-slate-600 dark:text-slate-400">
                      Motivo <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="mov-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex.: depósito no banco"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={isPending}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitMovement}
                    disabled={isPending || amount <= 0 || reason.trim().length < 3}
                  >
                    Registrar
                  </Button>
                </div>
              </div>
            )}

            {drawer.movements.length > 0 && <MovementList movements={drawer.movements} />}

            <div className="rounded-lg border border-slate-200 dark:border-white/10 p-3 space-y-2.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-slate-400" />
                Fechar o caixa
              </p>
              <div>
                <Label htmlFor="counted" className="text-[11px] text-slate-600 dark:text-slate-400">
                  Quanto você contou na gaveta
                </Label>
                <Input
                  id="counted"
                  inputMode="decimal"
                  value={countedRaw}
                  onChange={(e) => setCountedRaw(e.target.value)}
                  placeholder="0,00"
                  className="h-9 text-right tabular-nums"
                />
              </div>

              {difference !== null && <DifferenceHint difference={difference} />}

              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observação (opcional)"
                className="h-9 text-sm"
              />

              <Button
                onClick={submitClose}
                disabled={isPending || !countedRaw.trim()}
                className="w-full h-9"
              >
                <Check className="h-4 w-4 mr-1.5" />
                Fechar caixa do dia
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Row({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <dt className="text-slate-600 dark:text-slate-400">
        {label}
        {hint && (
          <span className="block text-[11px] text-slate-400 dark:text-slate-500">{hint}</span>
        )}
      </dt>
      <dd className="tabular-nums text-slate-900 dark:text-slate-100">
        {formatCurrency(value)}
      </dd>
    </div>
  )
}

function DifferenceHint({ difference }: { difference: number }) {
  if (Math.abs(difference) < 0.005) {
    return (
      <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Bate certo com o esperado.
      </p>
    )
  }
  const falta = difference < 0
  return (
    <p
      role="status"
      className={`text-xs font-medium ${falta ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}
    >
      {falta ? 'Faltam ' : 'Sobram '}
      {formatCurrency(Math.abs(difference))} na gaveta.
    </p>
  )
}

function MovementList({ movements }: { movements: CashDrawer['movements'] }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
        Movimentações do dia
      </p>
      <ul className="space-y-1">
        {movements.map((m) => (
          <li
            key={m.id}
            className="text-xs flex justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-1 last:border-0"
          >
            <span className="text-slate-700 dark:text-slate-300 min-w-0">
              <span className="font-medium">{KIND_LABELS[m.kind]}</span>
              <span className="text-slate-400 dark:text-slate-500"> · {m.reason}</span>
            </span>
            <span
              className={`tabular-nums shrink-0 ${m.kind === 'out' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}
            >
              {m.kind === 'out' ? '−' : '+'}
              {formatCurrency(m.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ClosedSummary({ close }: { close: NonNullable<CashDrawer['close']> }) {
  const falta = close.difference < 0
  const bate = Math.abs(close.difference) < 0.005

  return (
    <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/4 p-3 space-y-1.5">
      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-slate-400" />
        Caixa fechado
      </p>
      <div className="text-xs space-y-1 text-slate-600 dark:text-slate-400">
        <p>
          Contado: <span className="tabular-nums font-medium text-slate-900 dark:text-slate-100">{formatCurrency(close.counted_cash)}</span>
        </p>
        <p
          className={
            bate
              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
              : falta
                ? 'text-red-600 dark:text-red-400 font-medium'
                : 'text-amber-700 dark:text-amber-400 font-medium'
          }
        >
          {bate
            ? 'Bateu certo com o esperado.'
            : `${falta ? 'Faltaram' : 'Sobraram'} ${formatCurrency(Math.abs(close.difference))}.`}
        </p>
        {close.notes && <p className="italic">“{close.notes}”</p>}
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Por {close.actor_email ?? 'desconhecido'} em {formatBRDateTime(close.closed_at)}
        </p>
      </div>
    </div>
  )
}
