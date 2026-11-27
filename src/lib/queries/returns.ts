import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { PaymentMethod } from '@/types/database'

export interface ReturnableItem {
  sale_item_id: string
  product_name: string
  unit_price: number
  sold: number
  returned: number
  /** Quanto ainda pode ser devolvido. Zero quando já voltou tudo. */
  remaining: number
}

export interface SaleReturn {
  id: string
  total_amount: number
  refund_method: PaymentMethod
  reason: string
  actor_email: string | null
  created_at: string
  items: { product_name: string; quantity: number; subtotal: number }[]
}

export async function getReturnableItems(saleId: string): Promise<ReturnableItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('returnable_items', { p_sale_id: saleId })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    sale_item_id: row.sale_item_id,
    product_name: row.product_name,
    unit_price: Number(row.unit_price),
    sold: Number(row.sold),
    returned: Number(row.returned),
    remaining: Number(row.remaining),
  }))
}

export async function getSaleReturns(saleId: string): Promise<SaleReturn[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sale_returns')
    .select(
      'id, total_amount, refund_method, reason, actor_email, created_at, sale_return_items(quantity, subtotal, products(name))',
    )
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => ({
    id: row.id,
    total_amount: Number(row.total_amount),
    refund_method: row.refund_method as PaymentMethod,
    reason: row.reason,
    actor_email: row.actor_email,
    created_at: row.created_at,
    items: (row.sale_return_items ?? []).map((item) => ({
      product_name: item.products?.name ?? 'Produto removido',
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
    })),
  }))
}
