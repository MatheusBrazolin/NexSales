-- ============================================================
-- Dashboard: comparativo real com ontem e com o mes passado
-- ============================================================
--
-- Os selos de tendencia dos KPIs eram literais no codigo:
--
--   trendLabel: '+12% vs ontem'
--   trendLabel: '+8% vs mes anterior'
--
-- Com a loja zerada, o dashboard exibia "+12% vs ontem" ao lado de
-- R$ 0,00. Numa tela de gestao isso nao e enfeite, e numero inventado.
--
-- A funcao passa a devolver tambem o total de ontem e o total do mesmo
-- periodo do mes passado, para o app calcular a variacao de verdade.
-- ============================================================

create or replace function public.dashboard_metrics()
returns table (
  today_total      numeric,
  today_count      bigint,
  yesterday_total  numeric,
  month_total      numeric,
  month_count      bigint,
  last_month_total numeric,
  avg_ticket       numeric,
  low_stock_count  bigint
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('day',   now() at time zone 'America/Sao_Paulo')
        at time zone 'America/Sao_Paulo' as day_start,
      (date_trunc('day',  now() at time zone 'America/Sao_Paulo') - interval '1 day')
        at time zone 'America/Sao_Paulo' as yesterday_start,
      date_trunc('month', now() at time zone 'America/Sao_Paulo')
        at time zone 'America/Sao_Paulo' as month_start,
      (date_trunc('month', now() at time zone 'America/Sao_Paulo') + interval '1 month')
        at time zone 'America/Sao_Paulo' as next_month_start,
      (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month')
        at time zone 'America/Sao_Paulo' as last_month_start,
      -- Mesmo numero de dias ja decorridos no mes passado: comparar o mes
      -- inteiro anterior com 5 dias do mes atual diria sempre "caiu".
      (date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '1 month'
        + (now() at time zone 'America/Sao_Paulo'
           - date_trunc('month', now() at time zone 'America/Sao_Paulo')))
        at time zone 'America/Sao_Paulo' as last_month_same_point
  ),
  agg as (
    select
      coalesce(sum(s.total_amount) filter (
        where s.created_at >= b.day_start), 0)                        as today_total,
      count(*) filter (
        where s.created_at >= b.day_start)                            as today_count,
      coalesce(sum(s.total_amount) filter (
        where s.created_at >= b.yesterday_start
          and s.created_at <  b.day_start), 0)                        as yesterday_total,
      coalesce(sum(s.total_amount) filter (
        where s.created_at >= b.month_start), 0)                      as month_total,
      count(*) filter (
        where s.created_at >= b.month_start)                          as month_count,
      coalesce(sum(s.total_amount) filter (
        where s.created_at >= b.last_month_start
          and s.created_at <  b.last_month_same_point), 0)            as last_month_total
    from bounds b
    left join public.sales s
      on s.created_at >= least(b.last_month_start, b.yesterday_start)
     and s.created_at <  b.next_month_start
    group by b.day_start, b.month_start
  )
  select
    a.today_total,
    a.today_count,
    a.yesterday_total,
    a.month_total,
    a.month_count,
    a.last_month_total,
    case when a.month_count > 0 then a.month_total / a.month_count else 0 end,
    (
      select count(*)
        from public.products p
       where p.is_active
         and p.track_stock
         and p.stock_quantity <= p.min_stock
    )
  from agg a;
$$;

grant execute on function public.dashboard_metrics() to authenticated;
