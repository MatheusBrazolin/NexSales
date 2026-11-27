/**
 * Totals arithmetic for a sale in progress.
 *
 * Kept out of the PDV component so the rules are testable and so there is a
 * single place where the client and the server agree: `create_sale_with_items`
 * applies GREATEST(discount, 0) and LEAST(discount, gross), and so does this.
 * If the screen promised a total the RPC would not honour, the operator would
 * quote one price and the receipt would print another.
 */

export interface CartLike {
  quantity: number
  /** Price the cashier typed for this line, if any. */
  customPrice?: number
  /** Catalogue price, used when there is no override. */
  unitPrice: number
}

/** Sum of the lines, before any discount on the total. */
export function cartSubtotal(items: CartLike[]): number {
  return items.reduce(
    (sum, item) => sum + (item.customPrice ?? item.unitPrice) * item.quantity,
    0,
  )
}

/**
 * Parses what the operator typed into the discount field.
 *
 * Accepts both "12,50" and "12.50" — a Brazilian keypad produces the comma,
 * a numeric keypad on a phone may produce the dot. Anything unparseable is
 * treated as no discount rather than as an error, because the field is
 * optional and a half-typed value should not blank out the total.
 */
export function parseDiscountInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0

  const parsed = parseFloat(trimmed.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export interface SaleTotals {
  subtotal: number
  /** The discount actually applied, after clamping. */
  discount: number
  /** What the customer pays. Never negative. */
  total: number
  /** True when the typed discount was larger than the sale. */
  exceeded: boolean
}

/** Applies a requested discount to a subtotal under the server's rules. */
export function saleTotals(subtotal: number, requestedDiscount: number): SaleTotals {
  const requested = Number.isFinite(requestedDiscount) ? requestedDiscount : 0
  const discount = Math.min(Math.max(requested, 0), subtotal)

  return {
    subtotal,
    discount,
    total: subtotal - discount,
    exceeded: requested > subtotal && subtotal > 0,
  }
}
