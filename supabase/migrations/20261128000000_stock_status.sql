-- ============================================================
-- Situacao de estoque como coluna calculada
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- A tela /produtos filtrava "estoque baixo" assim:
--
--   1. busca a PAGINA 1 de todos os produtos  (range 0..19)
--   2. corta em 20 linhas
--   3. filtra por estoque baixo em JavaScript
--   4. mostra o `count` da consulta SEM filtro
--
-- Com cinco produtos ninguem nota. Com catalogo grande:
--
--   - o cabecalho diz "120 produtos" e a tabela mostra 3, ou nenhum;
--   - a paginacao promete 6 paginas, todas quase vazias;
--   - o produto que de fato precisa de reposicao esta na pagina 5, e
--     ninguem vai ate la.
--
-- E justamente o filtro que o dono usa para decidir o que comprar. Ele
-- responde errado em silencio: nao da erro, so esconde o que importa.
--
-- POR QUE NAO DA PARA FILTRAR DIRETO
-- -----------------------------------
-- "estoque baixo" e `stock_quantity <= min_stock`: uma coluna comparada
-- com OUTRA coluna. O PostgREST nao sabe expressar isso num filtro — e por
-- isso que a comparacao tinha ido parar no JavaScript.
--
-- A SOLUCAO
-- ---------
-- Mesma tecnica do name_norm (20261127000008): uma computed column. A
-- comparacao acontece no Postgres, e a tela filtra por um valor simples,
-- mantendo paginacao e contagem exata corretas.
--
-- 'free' existe separado de propósito. Produto sem controle de estoque (o
-- "Item Avulso") vive em 0/0 para sempre: tratado como numero, ele aparece
-- como "Sem estoque" em toda lista — era o que acontecia aqui, e o mesmo
-- defeito ja corrigido no PDV. Ele nao tem situacao de estoque; dizer que
-- esta zerado e mentira.
-- ============================================================

create or replace function public.stock_status(p public.products)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when not coalesce(p.track_stock, true) then 'free'
    when p.stock_quantity <= 0             then 'out'
    when p.stock_quantity <= p.min_stock   then 'low'
    else                                        'ok'
  end;
$$;

comment on function public.stock_status(public.products) is
  'Coluna calculada: free (sem controle), out (zerado), low (<= minimo), ok.';

grant execute on function public.stock_status(public.products) to authenticated;
grant execute on function public.stock_status(public.products) to anon;

-- A funcao recebe a linha inteira, o que impede o planner de fazer inline
-- dela — entao ela precisa do indice proprio, como o name_norm.
create index if not exists idx_products_stock_status
  on public.products (public.stock_status(products.*));
