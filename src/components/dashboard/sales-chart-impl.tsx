'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { formatCurrency } from '@/lib/utils/format'
import { usePrefersReducedMotion } from '@/lib/motion'

interface SalesChartProps {
  data: { date: string; total: number }[]
}

interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: ReadonlyArray<{ value?: number | string }>
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const value = Number(payload[0]?.value ?? 0)
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 tabular-nums">
        {formatCurrency(value)}
      </p>
    </div>
  )
}

export function SalesChart({ data }: SalesChartProps) {
  const total = data.reduce((sum, point) => sum + point.total, 0)
  const prefersReduced = usePrefersReducedMotion()
  // Every list in the app has an empty state; the chart had none, so a shop
  // with no sales yet got a tall empty rectangle with no axes and no words.
  const isEmpty = data.length === 0 || data.every((point) => point.total === 0)

  return (
    <Card className="border-slate-200/60 dark:border-white/8 bg-white/80 dark:bg-slate-800/70 backdrop-blur-sm shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base text-slate-900 dark:text-slate-100">Vendas — Últimos 30 dias</CardTitle>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Evolução diária do faturamento</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Acumulado
          </p>
          <AnimatedNumber
            value={total}
            format={formatCurrency}
            className="block text-lg font-semibold text-slate-900 dark:text-slate-100 tabular-nums"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isEmpty ? (
          <div className="h-[240px] flex flex-col items-center justify-center text-center">
            <LineChartIcon
              className="h-10 w-10 text-slate-300 dark:text-slate-600 mb-3"
              aria-hidden
            />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Nenhuma venda nos últimos 30 dias
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs">
              O gráfico começa a desenhar assim que a primeira venda for
              registrada no PDV.
            </p>
          </div>
        ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tickFormatter={(v) => `R$${v}`}
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: '#cbd5e1', strokeDasharray: '3 3' }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#7c3aed"
              strokeWidth={2}
              fill="url(#salesGradient)"
              isAnimationActive={!prefersReduced}
              animationDuration={650}
              animationEasing="ease-out"
              activeDot={{
                r: 5,
                stroke: '#fff',
                strokeWidth: 2,
                fill: '#7c3aed',
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
