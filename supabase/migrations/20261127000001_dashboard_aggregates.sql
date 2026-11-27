-- ============================================================
-- Dashboard: agregacao no banco em vez de no Node
-- ============================================================
--
-- PROBLEMA
-- --------
-- getDashboardMetrics() buscava TODAS as linhas e somava em JavaScript:
--
--   .from('sales').select('total_amount').gte('created_at', inicioDoMes)
--   const monthTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0)
--
-- O PostgREST do Supabase aplica um teto padrao de linhas por request
-- (db-max-rows, 1000 por padrao). Passando de 1000 vendas no mes, o total,
-- a contagem e o ticket medio passavam a mostrar numeros silenciosamente
-- errados — e o grafico de 30 dias truncava junto. ~33 vendas/dia chegam
-- la. Alem disso trafegava N linhas para calcular um numero.
--
-- SOLUCAO
-- -------
-- Duas funcoes que devolvem o resultado ja agregado. Sao STABLE e rodam
-- como INVOKER (sem security definer) de proposito: as policies de RLS
-- continuam valendo, entao um funcionario que chamar a RPC direto ve
-- apenas o que ele ja podia ver.
-- ============================================================

-- ------------------------------------------------------------
-- KPIs do dashboard em uma unica linha.
-- Os recortes de dia e mes usam o fuso de Brasilia, igual ao
-- brDayRangeUTC()/todayBRISO() de src/lib/utils/datetime.ts.
-- ------------------------------------------------------------
create or replace function public.dashboard_metrics()
returns table (
  today_total     numeric,
  today_count     bigint,
  month_total     numeric,
  month_count     bigint,
  avg_ticket      numeric,
  low_stock_count bigint
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('day',   now() at time zone 'America/Sao_Paulo')
        at time zone 'America/Sao_Paulo' as day_start,
      date_trunc('month', now() at time zone 'America/Sao_Paulo')
        at time zone 'America/Sao_Paulo' as month_start,
      (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')
        at time zone 'America/Sao_Paulo' as next_month_start
  ),
  agg as (
    select
      coalesce(sum(s.total_amount) filter (where s.created_at >= b.day_start), 0) as today_total,
      count(*)                     filter (where s.created_at >= b.day_start)     as today_count,
      coalesce(sum(s.total_amount) filter (where s.created_at >= b.month_start), 0) as month_total,
      count(*)                     filter (where s.created_at >= b.month_start)   as month_count
    from bounds b
    left join public.sales s
      on s.created_at >= b.month_start
     and s.created_at <  b.next_month_start
    group by b.day_start, b.month_start
  )
  select
    a.today_total,
    a.today_count,
    a.month_total,
    a.month_count,
    case when a.month_count > 0 then a.month_total / a.month_count else 0 end as avg_ticket,
    (
      select count(*)
        from public.products p
       where p.is_active
         and p.track_stock
         and p.stock_quantity <= p.min_stock
    ) as low_stock_count
  from agg a;
$$;

grant execute on function public.dashboard_metrics() to authenticated;

-- ------------------------------------------------------------
-- Serie dos ultimos 30 dias (inclusive hoje), ja com os dias sem
-- venda preenchidos com zero, rotulada como "dd/MM" em BRT.
-- ------------------------------------------------------------
create or replace function public.sales_last_30_days()
returns table (
  day_label text,
  total     numeric
)
language sql
stable
set search_path = public
as $$
  with days as (
    select generate_series(
      (now() at time zone 'America/Sao_Paulo')::date - 29,
      (now() at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date as d
  )
  select
    to_char(days.d, 'DD/MM') as day_label,
    coalesce(sum(s.total_amount), 0) as total
  from days
  left join public.sales s
    on (s.created_at at time zone 'America/Sao_Paulo')::date = days.d
  group by days.d
  order by days.d;
$$;

grant execute on function public.sales_last_30_days() to authenticated;
