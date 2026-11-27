-- ============================================================
-- O dashboard inteiro numa ida so ao banco
-- ============================================================
--
-- O QUE FOI MEDIDO
-- ----------------
-- Tempo de resposta autenticado, mediana de 4 amostras:
--
--   /dashboard   617 ms   <- o dobro da segunda tela
--   /vendas      277 ms
--   /relatorios  253 ms
--   /produtos    217 ms
--
-- A tentativa anterior atacou o VOLUME (o top 5 puxava 500 linhas) e nao
-- deu ganho nenhum de velocidade — porque a loja tem 61 itens de venda, e
-- nao havia volume para economizar. O ganho daquela mudanca foi de
-- correcao, nao de tempo. Registrado aqui porque a licao importa: medir
-- antes evita consertar o que nao esta quebrado.
--
-- O QUE REALMENTE CUSTA
-- ---------------------
-- CINCO consultas, em duas ondas:
--
--   onda 1 (a pagina espera): dashboard_metrics, 10 vendas recentes,
--                             sales_last_30_days
--   onda 2 (Suspense, depois): top_products, produtos com estoque baixo
--
-- Cada ida ao banco custa latencia de rede, e a segunda onda so comeca
-- depois que a primeira volta. Nao e o tamanho das consultas: e o numero
-- de viagens.
--
-- Esta funcao COMPOE as que ja existem, em vez de reescrever a logica
-- delas. Os calculos de fuso, comparacao com o mes anterior e desconto de
-- devolucao continuam num lugar so — aqui nao ha regra de negocio nova,
-- so uma viagem em vez de cinco.
-- ============================================================

create or replace function public.dashboard_overview(
  p_top_limit integer default 5,
  p_low_limit integer default 50
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'metrics', (select to_jsonb(m) from public.dashboard_metrics() m),

    'recentSales', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select s.id, s.total_amount, s.payment_method, s.created_at
          from public.sales s
         order by s.created_at desc
         limit 10
      ) r
    ), '[]'::jsonb),

    'chart', coalesce((
      select jsonb_agg(to_jsonb(d))
        from public.sales_last_30_days() d
    ), '[]'::jsonb),

    'topProducts', coalesce((
      select jsonb_agg(to_jsonb(t))
        from public.top_products(p_top_limit) t
    ), '[]'::jsonb),

    'lowStock', coalesce((
      select jsonb_agg(to_jsonb(l))
      from (
        select
          p.id, p.code, p.name, p.stock_quantity, p.min_stock,
          p.sale_price, p.track_stock,
          (select jsonb_build_object('id', c.id, 'name', c.name)
             from public.categories c where c.id = p.category_id) as categories
        from public.products p
        where p.is_active
          and public.stock_status(p) in ('low', 'out')
        order by p.stock_quantity
        limit greatest(1, least(coalesce(p_low_limit, 50), 200))
      ) l
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.dashboard_overview(integer, integer) to authenticated;

comment on function public.dashboard_overview(integer, integer) is
  'Tudo que o dashboard mostra, numa chamada. Compoe as funcoes existentes.';
