-- ============================================================
-- Busca de produto preparada para catalogo grande
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- getProductsPaged() e a busca do PDV fazem
--
--   where name ilike '%termo%' or code ilike '%termo%'
--
-- Um LIKE com % na frente NAO usa indice B-tree. Com os 5 produtos de hoje
-- e instantaneo; com 20 mil vira varredura da tabela inteira a cada tecla
-- digitada pelo caixa, numa instancia Nano.
--
-- A SOLUCAO
-- ---------
-- pg_trgm: quebra o texto em trigramas e indexa com GIN, o que torna
-- '%termo%' uma busca indexada de verdade.
--
-- unaccent: no Brasil o caixa digita sem acento. Sem isto, "acucar" nao
-- acha "Açúcar" e "sabao" nao acha "Sabão" — e o operador conclui que o
-- produto nao esta cadastrado.
-- ============================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() e STABLE porque depende de um dicionario que pode mudar, e o
-- Postgres nao aceita funcao STABLE em indice. Este wrapper fixa o
-- dicionario e declara IMMUTABLE, que e a forma padrao de poder indexar.
create or replace function public.nx_normalize(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, extensions
as $$
  select lower(public.unaccent('public.unaccent', p_text));
$$;

comment on function public.nx_normalize(text) is
  'Texto sem acento e em minusculas, para busca. IMMUTABLE para poder indexar.';

-- Indice da busca por nome. Normalizado, para "acucar" achar "Açúcar".
create index if not exists idx_products_name_trgm
  on public.products using gin (public.nx_normalize(name) gin_trgm_ops);

-- Busca por pedaco de codigo ("termina em 4567"). O codigo exato ja e
-- coberto pelo unique de products.code, que continua sendo o caminho do
-- leitor de codigo de barras.
create index if not exists idx_products_code_trgm
  on public.products using gin (code gin_trgm_ops);

-- Catalogo do PDV: o filtro de ativos entra em quase toda consulta.
create index if not exists idx_products_active_name
  on public.products (is_active, name);

-- ------------------------------------------------------------
-- Busca do PDV, com a ordem que o caixa espera
-- ------------------------------------------------------------
-- A ordem importa mais que a velocidade: quem bipa um codigo quer AQUELE
-- produto em primeiro lugar, nao o mais parecido.
--
--   1. codigo exato      -> o bipe do leitor
--   2. codigo que comeca -> digitacao parcial do codigo
--   3. nome que comeca   -> "coca" antes de "garrafa de coca"
--   4. similaridade      -> erro de digitacao, nome no meio
--
-- STABLE e INVOKER: as policies de RLS continuam valendo.
create or replace function public.search_products(
  p_query text,
  p_limit integer default 20,
  p_only_in_stock boolean default true
)
returns setof public.products
language sql
stable
set search_path = public
as $$
  with q as (
    select
      trim(p_query)                      as raw,
      public.nx_normalize(trim(p_query)) as norm
  )
  select p.*
    from public.products p, q
   where p.is_active
     and q.raw <> ''
     and (not p_only_in_stock or not p.track_stock or p.stock_quantity > 0)
     and (
          p.code = q.raw
       or p.code ilike q.raw || '%'
       or public.nx_normalize(p.name) % q.norm
       or public.nx_normalize(p.name) like '%' || q.norm || '%'
     )
   order by
     case
       when p.code = q.raw                                      then 0
       when p.code ilike q.raw || '%'                            then 1
       when public.nx_normalize(p.name) like q.norm || '%'       then 2
       else 3
     end,
     similarity(public.nx_normalize(p.name), q.norm) desc,
     p.name
   limit greatest(1, least(p_limit, 100));
$$;

grant execute on function public.search_products(text, integer, boolean) to authenticated;

comment on function public.search_products(text, integer, boolean) is
  'Busca de produto do PDV: codigo exato primeiro, depois prefixo, depois similaridade.';
