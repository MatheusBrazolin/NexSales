import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type CashMovementKind = 'opening' | 'in' | 'out'

export interface CashMovement {
  id: string
  kind: CashMovementKind
  amount: number
  reason: string
  actor_email: string | null
  created_at: string
}

export interface CashClose {
  expected_cash: number
  counted_cash: number
  difference: number
  notes: string | null
  actor_email: string | null
  closed_at: string
}

export interface CashDrawer {
  /** Fundo de troco lançado no dia. */
  opening: number
  /** Só a parcela em dinheiro das vendas — cartão e PIX não estão na gaveta. */
  cashSales: number
  supplies: number
  withdrawals: number
  /** Quanto deveria haver na gaveta agora. */
  expected: number
  movements: CashMovement[]
  /** Preenchido quando o caixa do dia já foi fechado. */
  close: CashClose | null
}

const EMPTY = {
  opening: 0,
  cashSales: 0,
  supplies: 0,
  withdrawals: 0,
  expected: 0,
}

export async function getCashDrawer(date: string): Promise<CashDrawer> {
  const supabase = await createClient()

  const [expectedRes, movementsRes, closeRes] = await Promise.all([
    supabase.rpc('cash_expected', { p_date: date }),
    supabase
      .from('cash_movements')
      .select('id, kind, amount, reason, actor_email, created_at')
      .eq('business_date', date)
      .order('created_at', { ascending: true }),
    supabase
      .from('cash_closes')
      .select('expected_cash, counted_cash, difference, notes, actor_email, closed_at')
      .eq('business_date', date)
      .maybeSingle(),
  ])

  if (expectedRes.error) throw new Error(expectedRes.error.message)
  if (movementsRes.error) throw new Error(movementsRes.error.message)

  // A RPC devolve uma única linha; o supabase-js entrega como array.
  const row = Array.isArray(expectedRes.data) ? expectedRes.data[0] : expectedRes.data
  const totals = row
    ? {
        opening: Number(row.opening ?? 0),
        cashSales: Number(row.cash_sales ?? 0),
        supplies: Number(row.supplies ?? 0),
        withdrawals: Number(row.withdrawals ?? 0),
        expected: Number(row.expected ?? 0),
      }
    : EMPTY

  const close = closeRes.data
    ? {
        expected_cash: Number(closeRes.data.expected_cash),
        counted_cash: Number(closeRes.data.counted_cash),
        difference: Number(closeRes.data.difference),
        notes: closeRes.data.notes,
        actor_email: closeRes.data.actor_email,
        closed_at: closeRes.data.closed_at,
      }
    : null

  return {
    ...totals,
    movements: (movementsRes.data ?? []).map((m) => ({
      id: m.id,
      kind: m.kind as CashMovementKind,
      amount: Number(m.amount),
      reason: m.reason,
      actor_email: m.actor_email,
      created_at: m.created_at,
    })),
    close,
  }
}
