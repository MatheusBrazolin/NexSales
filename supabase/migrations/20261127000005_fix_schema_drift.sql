-- ============================================================
-- Reconcilia o banco de producao com o historico de migrations
-- ============================================================
--
-- CONTEXTO
-- --------
-- O banco de producao foi montado aplicando SQL a mao, em pedacos, sem o
-- historico de migrations do CLI. Com isso ele divergiu do repositorio: a
-- migration 20260623000001_track_stock.sql entrou pela metade — products
-- ganhou track_stock, mas sale_items nunca ganhou item_description.
--
-- A divergencia so apareceu quando create_sale_with_items passou a inserir
-- nessa coluna: o PDV parou de registrar vendas com
--
--   column "item_description" of relation "sale_items" does not exist
--
-- Esta migration existe para que, a partir daqui, repositorio e banco
-- partam do mesmo lugar. Todos os comandos sao IF NOT EXISTS: rodar em um
-- banco que ja esta em dia nao faz nada.
--
-- O QUE NAO ESTA AQUI, DE PROPOSITO
-- ---------------------------------
-- A migration do track_stock tambem insere um produto de sistema com codigo
-- 'AVULSO' (o "Item Avulso" do PDV). Producao nao tem esse produto — tem um
-- "OUTRO" de codigo '01' que cumpre o mesmo papel. Inserir produto e mexer
-- no catalogo da loja, nao em estrutura, entao isso fica como decisao do
-- dono e nao de uma migration.
-- ============================================================

alter table public.products
  add column if not exists track_stock boolean not null default true;

alter table public.sale_items
  add column if not exists item_description text;
