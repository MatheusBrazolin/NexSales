'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { CashMovementKind } from '@/lib/queries/cash-drawer'

export interface CashActionResult {
  success: boolean
  error?: string
}

/** Traduz os códigos que as RPCs levantam para frases que o operador entende. */
function translate(message: string): string {
  if (message.includes('reason_required')) return 'Informe o motivo da movimentação.'
  if (message.includes('invalid_amount')) return 'Informe um valor maior que zero.'
  if (message.includes('opening_already_set'))
    return 'O fundo de troco de hoje já foi lançado. Para corrigir, lance um suprimento ou uma sangria.'
  if (message.includes('already_closed')) return 'O caixa deste dia já foi fechado.'
  if (message.includes('unauthenticated')) return 'Sessão expirada. Faça login novamente.'
  return message
}

export async function registerCashMovement(
  kind: CashMovementKind,
  amount: number,
  reason: string,
): Promise<CashActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('register_cash_movement', {
    p_kind: kind,
    p_amount: amount,
    p_reason: reason,
  })

  if (error) return { success: false, error: translate(error.message) }

  revalidatePath('/vendas/fechamento')
  return { success: true }
}

export async function closeCashRegister(
  date: string,
  counted: number,
  notes: string,
): Promise<CashActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_cash_register', {
    p_date: date,
    p_counted: counted,
    p_notes: notes || null,
  })

  if (error) return { success: false, error: translate(error.message) }

  revalidatePath('/vendas/fechamento')
  return { success: true }
}
