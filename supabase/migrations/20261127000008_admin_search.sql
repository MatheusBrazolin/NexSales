-- ============================================================
-- Busca da lista administrativa de produtos
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- A tela /produtos filtra assim:
--
--   name.ilike.%termo%,code.ilike.%termo%
--
-- Dois defeitos, e o primeiro e o que mais incomoda na loja:
--
--   1. Acento. Quem digita "acucar" nao acha "Açúcar". A busca do PDV ja
--      foi corrigida; a da tela de estoque continuava acentuada, entao o
--      dono procura um produto que existe, nao encontra, e cadastra de
--      novo — dois itens iguais com estoques diferentes.
--
--   2. Varredura. '%termo%' num ilike comum nao usa indice. Os indices
--      GIN criados em 20261127000006 existem sobre nx_normalize(name) e
--      sobre code; um ilike em `name` cru nao casa com nenhum dos dois.
--
-- A SOLUCAO
-- ---------
-- Uma "computed column" do PostgREST: uma funcao que recebe a LINHA de
-- products e devolve o nome normalizado. O PostgREST expoe isso como se
-- fosse uma coluna (`?name_norm=ilike.*acucar*`), entao a tela mantem a
-- paginacao, a contagem exata e os filtros de categoria e estoque — nada
-- disso caberia numa RPC de busca.
--
-- Medido com 20 mil produtos, antes de escrever a tela:
--
--   ilike '%acucar%' em `name`      -> 0 resultados (o acento), seq scan
--   name_norm sem indice proprio    -> encontra, mas 130 ms de seq scan
--   name_norm com o indice abaixo   -> encontra, 6 ms, BitmapOr nos GIN
--
-- A funcao recebe a LINHA inteira, que e o que o PostgREST exige de uma
-- computed column — e tambem o que IMPEDE o planner de fazer inline dela.
-- Por isso ela precisa do indice proprio abaixo: o idx_products_name_trgm
-- da migration 6 indexa nx_normalize(name), expressao diferente, e nao
-- seria usado aqui. Os dois ficam: aquele serve o search_products() do
-- PDV, este serve o filtro da tela.
-- ============================================================

create or replace function public.name_norm(p public.products)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select public.nx_normalize(p.name);
$$;

comment on function public.name_norm(public.products) is
  'Coluna calculada: nome sem acento e em minusculas. Usada pelo filtro da tela de produtos.';

grant execute on function public.name_norm(public.products) to authenticated;
grant execute on function public.name_norm(public.products) to anon;

-- O indice que torna o filtro acima uma busca, e nao uma varredura.
create index if not exists idx_products_name_norm_trgm
  on public.products using gin (public.name_norm(products.*) gin_trgm_ops);

-- ------------------------------------------------------------
-- Indice para o sync incremental do PDV
-- ------------------------------------------------------------
-- O cache offline passou a baixar so o que mudou:
--
--   where updated_at >= <ultimo marco>
--
-- Sem indice isso e uma varredura da tabela a cada 60 segundos, em cada
-- caixa aberto. Com ele, a sincronizacao de rotina — que quase sempre nao
-- traz linha nenhuma — custa praticamente nada.
create index if not exists idx_products_updated_at
  on public.products (updated_at);
