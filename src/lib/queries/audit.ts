import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { PaymentMethod } from '@/types/database'

/** Uma linha da venda, como ela era no momento em que foi apagada. */
export interface AuditSnapshotItem {
  product_code: string | null
  product_name: string
  quantity: number
  unit_price: number
  unit_cost: number
  subtotal: number
}

export interface AuditSnapshot {
  sale?: {
    id: string
    total_amount: number
    discount_amount: number
    payment_method: PaymentMethod
    notes: string | null
    created_at: string
  }
  seller_email?: string | null
  customer_name?: string | null
  items?: AuditSnapshotItem[]
  payments?: { method: PaymentMethod; amount: number }[]
}

export interface AuditEntry {
  id: string
  action: string
  entity: string
  entity_id: string | null
  actor_email: string | null
  summary: string
  reason: string | null
  created_at: string
  snapshot: AuditSnapshot
}

/**
 * Histórico de exclusões.
 *
 * Só admin enxerga — a RLS da tabela já garante isso no banco, e não
 * apenas na tela. Um funcionário que chamasse a API direto receberia
 * zero linhas.
 */
export async function getAuditLog(limit = 200): Promise<AuditEntry[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entity_id: row.entity_id,
    actor_email: row.actor_email,
    summary: row.summary,
    reason: row.reason,
    created_at: row.created_at,
    snapshot: (row.snapshot ?? {}) as AuditSnapshot,
  }))
}
