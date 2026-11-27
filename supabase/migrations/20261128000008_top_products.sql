-- ============================================================
-- Mais vendidos: agregado no banco, nao no JavaScript
-- ============================================================
--
-- O QUE EXISTIA
-- -------------
--   .from('sale_items').select('product_id, quantity, products(name, code)').limit(500)
--
-- e a soma por produto feita em JavaScript. Dois problemas, e o segundo e
-- pior que o primeiro.
--
-- 1. LENTO: puxa 500 linhas pela rede para devolver 5. Medido, o dashboard
--    responde em 544 ms, o dobro da segunda tela mais lenta.
--
-- 2. ERRADO: o `.limit(500)` NAO tem ordenacao. Com 61 itens de venda,
--    pega todos e o resultado sai certo por acidente. Com 10 mil, o
--    PostgREST devolve 500 QUAISQUER — e o "mais vendidos" passa a ser o
--    top de uma fatia aleatoria.
--
--    Ninguem perceberia: continua parecendo uma lista plausivel. E o mesmo
--    padrao do filtro de estoque corrigido em 20261128000000 — responde
--    errado e parece certo.
--
-- DEVOLUCAO DESCONTA
-- ------------------
-- Produto devolvido nao foi vendido. A subconsulta por item evita o
-- produto cartesiano que multiplicaria as somas (ver 20260615000002).
-- ============================================================

create or replace function public.top_products(p_limit integer default 5)
returns table (
  id    uuid,
  name  text,
  code  text,
  total bigint
)
language sql
stable
set search_path = public
as $$
  with vendidos as (
    select
      si.product_id,
      sum(si.quantity) as vendido,
      sum(coalesce((
        select sum(ri.quantity)
          from public.sale_return_items ri
         where ri.sale_item_id = si.id
      ), 0)) as devolvido
    from public.sale_items si
    where si.product_id is not null
    group by si.product_id
  )
  select
    p.id,
    p.name,
    p.code,
    (v.vendido - v.devolvido)::bigint
  from vendidos v
  join public.products p on p.id = v.product_id
  where v.vendido - v.devolvido > 0
  order by (v.vendido - v.devolvido) desc, p.name
  limit greatest(1, least(coalesce(p_limit, 5), 50));
$$;

grant execute on function public.top_products(integer) to authenticated;

comment on function public.top_products(integer) is
  'Mais vendidos, ja descontadas as devolucoes. Agregado no banco.';
