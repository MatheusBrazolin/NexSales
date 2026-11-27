/**
 * Period-over-period comparison for the dashboard KPIs.
 *
 * Exists because those badges used to be literals in the component —
 * `trendLabel: '+12% vs ontem'` — so a shop with no sales still read
 * "+12% vs ontem" next to R$ 0,00. On a management screen that is not
 * decoration, it is an invented business number.
 *
 * The awkward cases are the point of this file:
 *
 *  - previous = 0 and current = 0  → there is nothing to compare, say so.
 *  - previous = 0 and current > 0  → a percentage would be infinite, so it
 *    reads "primeira venda" / "acima de zero" instead of "+∞%".
 *  - a tiny base (yesterday R$ 2) turns into absurd percentages, so very
 *    large swings are capped in the label.
 */

export type TrendDirection = 'up' | 'down' | 'flat'

export interface Trend {
  direction: TrendDirection
  /** Ready to render. Never a fabricated number. */
  label: string
  /** Percentage change, or null when it cannot be computed. */
  percent: number | null
}

/** Below this the two values are treated as the same (centavos noise). */
const FLAT_THRESHOLD = 0.005

/** Magnitude only — the caller prepends the sign it wants to show. */
function formatPercentValue(value: number): string {
  const magnitude = Math.abs(value)
  const rounded = magnitude >= 10 ? Math.round(magnitude) : Math.round(magnitude * 10) / 10
  return rounded.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

/**
 * @param current  value for the period being shown
 * @param previous same metric for the comparable earlier period
 * @param suffix   what the comparison is against ("vs ontem")
 */
export function compareToPrevious(
  current: number,
  previous: number,
  suffix: string,
): Trend {
  const safeCurrent = Number.isFinite(current) ? current : 0
  const safePrevious = Number.isFinite(previous) ? previous : 0

  if (safePrevious === 0 && safeCurrent === 0) {
    return { direction: 'flat', label: `sem movimento ${suffix}`, percent: null }
  }

  if (safePrevious === 0) {
    // No baseline to divide by — report the fact, not a percentage.
    return { direction: 'up', label: `sem comparação ${suffix}`, percent: null }
  }

  if (safeCurrent === 0) {
    return { direction: 'down', label: `nada vendido ${suffix}`, percent: -100 }
  }

  const percent = ((safeCurrent - safePrevious) / safePrevious) * 100

  if (Math.abs(percent) < FLAT_THRESHOLD) {
    return { direction: 'flat', label: `estável ${suffix}`, percent: 0 }
  }

  const direction: TrendDirection = percent > 0 ? 'up' : 'down'
  const sign = percent > 0 ? '+' : '−'

  // A base of a few reais produces percentages nobody can read. Past 999%
  // the exact figure stops being information.
  if (Math.abs(percent) > 999) {
    return { direction, label: `${sign}999% ${suffix}`, percent }
  }

  return {
    direction,
    label: `${sign}${formatPercentValue(percent)}% ${suffix}`,
    percent,
  }
}
