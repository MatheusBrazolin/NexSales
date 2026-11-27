-- ============================================================
-- Relatorio de lucro (DRE): agregacao no banco
-- ============================================================
--
-- Mesmo problema do dashboard: getDREReport() buscava todas as vendas do
-- periodo COM os itens aninhados e somava em JavaScript. O teto de linhas
-- do PostgREST (db-max-rows, 1000 por padrao) corta a lista em silencio,
-- entao um relatorio de 90 dias de uma loja movimentada mostrava receita,
-- custo e margem calculados sobre um pedaco dos dados — sem nenhum aviso.
--
-- Esta funcao devolve tudo pronto num unico jsonb. INVOKER de proposito:
-- as policies de RLS continuam valendo.
-- ============================================================

create or replace function public.dre_report(
  p_start timestamptz,
  p_end   timestamptz
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with sales_in_period as (
    select s.id, s.total_amount, s.payment_method
      from public.sales s
     where s.created_at >= p_start
       and s.created_at <= p_end
  ),
  items as (
    select
      coalesce(p.name, 'Produto removido')          as name,
      si.quantity                                   as quantity,
      si.subtotal                                   as revenue,
      si.quantity * coalesce(p.cost_price, 0)       as cost
    from public.sale_items si
    join sales_in_period s on s.id = si.sale_id
    left join public.products p on p.id = si.product_id
  ),
  totals as (
    select
      coalesce((select sum(total_amount) from sales_in_period), 0) as revenue,
      coalesce((select sum(cost)         from items), 0)           as cost,
      (select count(*) from sales_in_period)                       as sales_count
  ),
  by_payment as (
    select jsonb_object_agg(
             payment_method,
             jsonb_build_object('revenue', revenue, 'count', cnt)
           ) as data
    from (
      select payment_method,
             sum(total_amount) as revenue,
             count(*)          as cnt
        from sales_in_period
       group by payment_method
    ) p
  ),
  top_products as (
    select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.revenue desc), '[]'::jsonb) as data
    from (
      select
        name,
        sum(revenue)  as revenue,
        sum(cost)     as cost,
        sum(quantity) as quantity,
        sum(revenue) - sum(cost) as profit,
        case when sum(revenue) > 0
             then ((sum(revenue) - sum(cost)) / sum(revenue)) * 100
             else 0
        end as margin
      from items
      group by name
      order by sum(revenue) desc
      limit 10
    ) t
  )
  select jsonb_build_object(
    'revenue',     totals.revenue,
    'cost',        totals.cost,
    'grossProfit', totals.revenue - totals.cost,
    'grossMargin', case when totals.revenue > 0
                        then ((totals.revenue - totals.cost) / totals.revenue) * 100
                        else 0 end,
    'salesCount',  totals.sales_count,
    'byPayment',   coalesce(by_payment.data, '{}'::jsonb),
    'topProducts', top_products.data
  )
  from totals, by_payment, top_products;
$$;

grant execute on function public.dre_report(timestamptz, timestamptz) to authenticated;
