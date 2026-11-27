'use client'

import dynamic from 'next/dynamic'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Recharts is the single heaviest dependency in the app (~100 kB gzip) and it
 * is used on exactly one card of one admin-only page. Loading it statically
 * put it in the bundle of every route that shares a chunk with the dashboard.
 *
 * ssr: false because the chart measures its own container before it can draw —
 * there is nothing meaningful to render on the server anyway.
 */
const SalesChartImpl = dynamic(
  () => import('./sales-chart-impl').then((m) => m.SalesChart),
  {
    ssr: false,
    loading: () => (
      <Card className="border-slate-200/60 dark:border-white/8 bg-white/80 dark:bg-slate-800/70 backdrop-blur-sm shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-2">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-28" />
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Skeleton className="h-[240px] w-full" />
        </CardContent>
      </Card>
    ),
  },
)

interface SalesChartProps {
  data: { date: string; total: number }[]
}

export function SalesChart({ data }: SalesChartProps) {
  return <SalesChartImpl data={data} />
}
