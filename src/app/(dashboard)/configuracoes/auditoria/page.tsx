import { ShieldAlert, Trash2, User, Clock, Tag } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuditLog, type AuditEntry } from '@/lib/queries/audit'
import { requireAdmin } from '@/lib/auth/roles'
import { tryQuery } from '@/lib/supabase/try-query'
import { OfflineBanner } from '@/components/offline/offline-banner'
import { formatCurrency, formatDate, PAYMENT_LABELS } from '@/lib/utils/format'

export const metadata = {
  title: 'Registro de atividades',
}

export default async function AuditoriaPage() {
  await requireAdmin()

  const { data: entries, offline } = await tryQuery(() => getAuditLog(), [] as AuditEntry[])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-slate-100 tracking-tight">
          Registro de atividades
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Vendas excluídas e preços alterados, com quem fez e quando
        </p>
      </div>

      {offline && (
        <OfflineBanner message="Sem conexão — o registro de atividades só pode ser lido online." />
      )}

      <div className="rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50/60 dark:bg-amber-500/8 p-3.5 flex gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-medium">Este registro não pode ser apagado nem alterado.</p>
          <p className="text-amber-800/80 dark:text-amber-200/70">
            Ele é gravado pelo próprio banco de dados, na mesma operação que apaga a
            venda ou registra o preço — não há caminho no sistema que faça uma dessas
            coisas sem deixar a linha aqui. Nem o administrador consegue removê-la.
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <Card className="border-slate-200/80 dark:border-white/8 dark:bg-slate-800/60">
          <CardContent className="py-14 text-center">
            <Trash2 className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">
              Nada a mostrar
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Quando alguém excluir uma venda ou vender por um preço diferente do
              cadastro, aparece aqui com todos os detalhes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) =>
            entry.action === 'price_overridden' ? (
              <PriceCard key={entry.id} entry={entry} />
            ) : (
              <AuditCard key={entry.id} entry={entry} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

function AuditCard({ entry }: { entry: AuditEntry }) {
  const items = entry.snapshot.items ?? []
  const payments = entry.snapshot.payments ?? []
  const sale = entry.snapshot.sale

  return (
    <Card className="border-slate-200/80 dark:border-white/8 shadow-sm overflow-hidden dark:bg-slate-800/60">
      <CardHeader className="bg-red-50/50 dark:bg-red-500/8 border-b border-red-100 dark:border-red-500/15 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-500" />
            Venda excluída
          </CardTitle>
          <span className="text-xs font-medium text-slate-900 dark:text-slate-100 tabular-nums">
            {sale ? formatCurrency(sale.total_amount) : '—'}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field icon={<User className="h-3.5 w-3.5" />} label="Quem excluiu">
            {entry.actor_email ?? 'desconhecido'}
          </Field>
          <Field icon={<Clock className="h-3.5 w-3.5" />} label="Quando excluiu">
            {formatDate(entry.created_at)}
          </Field>
          {sale && (
            <Field label="A venda era de">{formatDate(sale.created_at)}</Field>
          )}
          {entry.snapshot.seller_email && (
            <Field label="Quem vendeu">{entry.snapshot.seller_email}</Field>
          )}
          {entry.snapshot.customer_name && (
            <Field label="Cliente">{entry.snapshot.customer_name}</Field>
          )}
          {payments.length > 0 && (
            <Field label="Pagamento">
              {payments
                .map((p) => `${PAYMENT_LABELS[p.method]} ${formatCurrency(p.amount)}`)
                .join(' + ')}
            </Field>
          )}
        </div>

        {entry.reason && (
          <div className="rounded-md bg-slate-50 dark:bg-white/5 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Motivo informado
            </p>
            <p className="text-sm text-slate-900 dark:text-slate-100 mt-0.5">{entry.reason}</p>
          </div>
        )}

        {items.length > 0 && (
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              O que foi vendido
            </p>
            <ul className="space-y-1">
              {items.map((item, index) => (
                <li
                  key={index}
                  className="text-xs text-slate-700 dark:text-slate-300 flex justify-between gap-3 border-b border-slate-100 dark:border-white/5 pb-1 last:border-0"
                >
                  <span>
                    {item.quantity}× {item.product_name}
                    {item.product_code && (
                      <span className="text-slate-400 dark:text-slate-500"> · {item.product_code}</span>
                    )}
                  </span>
                  <span className="tabular-nums shrink-0">{formatCurrency(item.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function PriceCard({ entry }: { entry: AuditEntry }) {
  const overrides = entry.snapshot.overrides ?? []

  return (
    <Card className="border-slate-200/80 dark:border-white/8 shadow-sm overflow-hidden dark:bg-slate-800/60">
      <CardHeader className="bg-amber-50/50 dark:bg-amber-500/8 border-b border-amber-100 dark:border-amber-500/15 pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Tag className="h-4 w-4 text-amber-500" />
            Preço alterado na venda
          </CardTitle>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {formatDate(entry.created_at)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-3">
        <Field icon={<User className="h-3.5 w-3.5" />} label="Quem vendeu">
          {entry.actor_email ?? 'desconhecido'}
        </Field>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
            O que mudou
          </p>
          <ul className="space-y-1.5">
            {overrides.map((item, index) => (
              <li
                key={index}
                className="text-xs border-b border-slate-100 dark:border-white/5 pb-1.5 last:border-0"
              >
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {item.quantity}× {item.product_name}
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="line-through text-slate-400">
                    {formatCurrency(item.list_price)}
                  </span>
                  <span>→</span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(item.charged)}
                  </span>
                  <span
                    className={
                      item.difference < 0
                        ? 'text-red-600 dark:text-red-400 font-medium'
                        : 'text-emerald-700 dark:text-emerald-400 font-medium'
                    }
                  >
                    ({item.difference < 0 ? '−' : '+'}
                    {formatCurrency(Math.abs(item.difference))} por unidade)
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>

        {entry.entity_id && (
          <a
            href={`/vendas/${entry.entity_id}`}
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Ver a venda
          </a>
        )}
      </CardContent>
    </Card>
  )
}

function Field({
  icon,
  label,
  children,
}: {
  icon?: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        {icon}
        {label}
      </p>
      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-0.5 break-words">
        {children}
      </p>
    </div>
  )
}
