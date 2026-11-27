import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatBRDateTime } from '@/lib/utils/datetime'

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

/**
 * Percentage in Brazilian notation: decimal comma, no space before the sign.
 *
 * Exists because seven places in the app wrote `${value.toFixed(1)}%` and
 * produced "12.5%" — with a dot — right next to "R$ 1.234,56", which the
 * currency helper formats correctly. The inconsistency is what gives a
 * product away as unfinished.
 */
export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '—'

  return (
    new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value) + '%'
  )
}

// Always in BRT — same reasoning as the dashboard/cash-close helpers.
export function formatDate(date: string | Date): string {
  return formatBRDateTime(date)
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR })
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro',
  credit: 'Cartão de Crédito',
  debit: 'Cartão de Débito',
  pix: 'PIX',
  fiado: 'Fiado',
}
