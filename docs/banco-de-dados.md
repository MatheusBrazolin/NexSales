# Banco de dados — como a busca e o cache funcionam

Escrito em 27/11/2026, quando o catálogo tinha 5 produtos e a pergunta era
o que acontece quando tiver 20 mil. Tudo aqui foi medido com 20 mil
produtos num Postgres de teste antes de virar código.

## O problema que não era velocidade

A busca de hoje, `ilike '%termo%'`, tem dois defeitos. O segundo é o grave:

| termo digitado | resultado antes |
| --- | --- |
| `acucar` | **0 resultados**, mesmo com "Açúcar Refinado" cadastrado |
| `sabao` | **0 resultados**, mesmo com "Sabão em Pó" cadastrado |

O caixa digita sem acento e com pressa. Sem normalização, o produto
simplesmente não existe para ele — então ele cadastra de novo, e a loja
passa a ter dois itens iguais com estoques diferentes. Lentidão o operador
percebe e reclama; isso aqui ele não percebe, e o estoque apodrece sozinho.

## Três lugares, uma regra

A mesma normalização (minúsculas, sem acento) está escrita em três
runtimes diferentes, e as três precisam concordar — senão a busca do caixa
diverge da busca da tela de estoque:

| onde | o quê | arquivo |
| --- | --- | --- |
| Postgres | `nx_normalize(text)`, IMMUTABLE para poder indexar | `20261127000006_product_search.sql` |
| Navegador | `normalizeSearchText()` + tokens no IndexedDB | `src/lib/utils/search-text.ts` |
| Desktop | UDF determinística `nx_normalize` no SQLite | `src/lib/db/client.ts` |

## Onde cada busca acontece

**O PDV não busca no Postgres.** Ele busca no IndexedDB, para funcionar sem
internet. Por isso o índice GIN sozinho não deixaria o caixa mais rápido: o
gargalo era `db.products.filter(...)`, que o Dexie resolve lendo o catálogo
inteiro e testando um por um em JavaScript, **a cada tecla**. Hoje é um
índice multiEntry (`*search_tokens`) com os tokens calculados uma vez, no
sync.

**A tela /produtos busca no Postgres**, via uma *computed column* do
PostgREST (`name_norm`), e não via RPC — é o que permite manter paginação,
contagem exata e os filtros de categoria e estoque na mesma consulta.

Medido com 20 mil produtos:

```
ilike em `name`               ->   0 resultados, seq scan  (o bug)
name_norm sem índice próprio  -> acha, 130 ms de seq scan
name_norm com o índice GIN    -> acha,   6 ms, BitmapOr
```

> A função recebe a **linha** inteira, que é o que o PostgREST exige de uma
> computed column — e também o que impede o planner de fazer inline dela.
> Por isso ela tem índice próprio: `idx_products_name_trgm` indexa
> `nx_normalize(name)`, expressão diferente, e não seria usado aqui.

## Sync offline incremental

O cache baixava o catálogo inteiro a cada 60 segundos, com `clear()` antes
do `bulkAdd()` — inclusive a janela em que a tabela fica vazia e a busca do
caixa não acha nada. Hoje:

- desce só o que tem `updated_at` maior que o marco (`syncMeta.cursor`);
- o marco volta 5 segundos de propósito: `updated_at` recebe o `now()` do
  **início** da transação, mas a linha só aparece no commit;
- o filtro `is_active` fica **fora** da consulta incremental, para um
  produto desativado chegar e ser apagado do cache. Se a consulta o
  excluísse, ele continuaria vendável no PDV;
- um refresh completo por dia (e ao voltar de um período offline) cobre o
  que o incremental não vê: produto apagado de vez.

Paginação em todas as consultas de sync: o PostgREST corta em
`db-max-rows` (1000 por padrão) e devolve a resposta truncada **com cara de
completa**. Com 3 mil produtos, 2 mil ficariam fora do cache sem erro
nenhum na tela.

## Preços congelados

`sale_items` guarda `unit_price` **e** `unit_cost`, ambos congelados na
hora da venda. O relatório de lucro usava o custo *atual* do produto: se o
fornecedor subisse o preço hoje, a margem de uma venda de junho mudava
sozinha. Um relatório que reescreve o passado não serve para decidir nada.

## Como aplicar migrations (o ponto em aberto)

Hoje as migrations foram aplicadas **à mão, pelo painel**. Foi exatamente
isso que fez o banco divergir do repositório e derrubar o PDV em
27/11/2026: a `20260623000001_track_stock.sql` tinha sido só metade
aplicada, e uma venda falhou com `column "item_description" does not
exist`. O repositório dizia uma coisa, o banco era outra, e nada avisava.

O conserto é o Supabase CLI. Falta só o login, que precisa das mãos do
dono:

```bash
supabase login
```

Depois, uma vez:

```bash
supabase link --project-ref hvctkbrvjcsfqtjeycrn
```

Como as migrations já existentes foram aplicadas por fora, o histórico
precisa ser marcado antes do primeiro push — senão o CLI tentaria recriar
tabelas que já existem:

```bash
supabase migration list
```

E daí em diante, aplicar vira um comando só:

```bash
supabase db push
```
