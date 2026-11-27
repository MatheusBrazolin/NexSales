-- ============================================================
-- Devolucao: lancamento novo, nunca apagamento do anterior
-- ============================================================
--
-- O QUE EXISTE HOJE
-- -----------------
-- Nada. Devolver significa EXCLUIR a venda. Isso apaga um fato que
-- aconteceu: a venda existiu, o cliente pagou, o dinheiro entrou no caixa
-- daquele dia. Apagar reescreve o passado e, de quebra, some com a
-- comissao, com o fechamento ja feito e com a conferencia do estoque.
--
-- O MODELO
-- --------
-- A venda original fica intacta. A devolucao e um lancamento proprio que
-- aponta para ela. O historico passa a contar a verdade inteira: vendeu,
-- e depois devolveu.
--
-- `on delete restrict` em sale_id de proposito: venda que tem devolucao
-- NAO pode mais ser excluida. Sem isso, apagar a venda seria de novo o
-- caminho para sumir com o rastro.
--
-- TRES INTEGRACOES QUE NAO PODEM FALTAR
-- -------------------------------------
-- 1. Estoque volta (so para produto que controla estoque).
-- 2. Devolucao em dinheiro SAI DA GAVETA — entra no esperado do caixa.
-- 3. O relatorio de lucro desconta a devolucao, senao o faturamento mente.
-- ============================================================

create table if not exists public.sale_returns (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales(id) on delete restrict,
  total_amount  numeric(12,2) not null check (total_amount > 0),
  refund_method public.payment_method not null,
  reason        text not null check (btrim(reason) <> ''),
  actor_id      uuid not null references auth.users(id) on delete restrict,
  actor_email   text,
  business_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  created_at    timestamptz not null default now()
);

create index if not exists idx_sale_returns_sale on public.sale_returns (sale_id);
create index if not exists idx_sale_returns_date on public.sale_returns (business_date desc);

create table if not exists public.sale_return_items (
  id           uuid primary key default gen_random_uuid(),
  return_id    uuid not null references public.sale_returns(id) on delete cascade,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  product_id   uuid references public.products(id) on delete set null,
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  subtotal     numeric(12,2) not null check (subtotal >= 0)
);

create index if not exists idx_sale_return_items_return on public.sale_return_items (return_id);
create index if not exists idx_sale_return_items_item   on public.sale_return_items (sale_item_id);

alter table public.sale_returns      enable row level security;
alter table public.sale_return_items enable row level security;

-- Leitura segue a da venda-mae. Escrita so pela RPC (SECURITY DEFINER):
-- sem policy de insert, update ou delete, a devolucao nasce imutavel.
drop policy if exists "read_sale_returns" on public.sale_returns;
create policy "read_sale_returns" on public.sale_returns
  for select using (
    public.is_admin()
    or (auth.uid() is not null and business_date = (now() at time zone 'America/Sao_Paulo')::date)
  );

drop policy if exists "read_sale_return_items" on public.sale_return_items;
create policy "read_sale_return_items" on public.sale_return_items
  for select using (
    exists (select 1 from public.sale_returns r where r.id = return_id)
  );

-- ------------------------------------------------------------
-- Quanto de cada item ainda pode ser devolvido
-- ------------------------------------------------------------
create or replace function public.returnable_items(p_sale_id uuid)
returns table (
  sale_item_id uuid,
  product_id   uuid,
  product_name text,
  unit_price   numeric,
  sold         integer,
  returned     integer,
  remaining    integer
)
language sql
stable
set search_path = public
as $$
  select
    si.id,
    si.product_id,
    coalesce(p.name, si.item_description, 'Produto removido'),
    si.unit_price,
    si.quantity,
    coalesce((
      select sum(ri.quantity)::integer
        from public.sale_return_items ri
       where ri.sale_item_id = si.id
    ), 0),
    si.quantity - coalesce((
      select sum(ri.quantity)::integer
        from public.sale_return_items ri
       where ri.sale_item_id = si.id
    ), 0)
  from public.sale_items si
  left join public.products p on p.id = si.product_id
  where si.sale_id = p_sale_id
  order by si.id;
$$;

grant execute on function public.returnable_items(uuid) to authenticated;

-- ------------------------------------------------------------
-- Registrar a devolucao
-- ------------------------------------------------------------
create or replace function public.register_sale_return(
  p_sale_id       uuid,
  p_items         jsonb,
  p_refund_method public.payment_method,
  p_reason        text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_return_id uuid;
  v_item      jsonb;
  v_sale_item record;
  v_qty       integer;
  v_returned  integer;
  v_total     numeric(12,2) := 0;
  v_subtotal  numeric(12,2);
  v_email     text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'empty_return';
  end if;

  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required';
  end if;

  if not exists (select 1 from public.sales where id = p_sale_id) then
    raise exception 'sale_not_found';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.sale_returns
    (sale_id, total_amount, refund_method, reason, actor_id, actor_email)
  values (p_sale_id, 0.01, p_refund_method, btrim(p_reason), auth.uid(), v_email)
  returning id into v_return_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'invalid_quantity';
    end if;

    select si.id, si.product_id, si.quantity, si.unit_price, p.track_stock, p.name
      into v_sale_item
      from public.sale_items si
      left join public.products p on p.id = si.product_id
     where si.id = (v_item->>'sale_item_id')::uuid
       and si.sale_id = p_sale_id;

    if not found then
      raise exception 'item_not_in_sale';
    end if;

    -- Ja devolvido antes. Sem esta trava daria para devolver duas vezes o
    -- mesmo item e receber duas vezes pelo mesmo produto.
    select coalesce(sum(ri.quantity), 0)::integer into v_returned
      from public.sale_return_items ri
     where ri.sale_item_id = v_sale_item.id;

    if v_qty > v_sale_item.quantity - v_returned then
      raise exception 'exceeds_sold:%', coalesce(v_sale_item.name, 'item');
    end if;

    v_subtotal := v_sale_item.unit_price * v_qty;
    v_total    := v_total + v_subtotal;

    insert into public.sale_return_items
      (return_id, sale_item_id, product_id, quantity, unit_price, subtotal)
    values
      (v_return_id, v_sale_item.id, v_sale_item.product_id, v_qty,
       v_sale_item.unit_price, v_subtotal);

    -- O produto volta para a prateleira.
    if v_sale_item.track_stock then
      update public.products
         set stock_quantity = stock_quantity + v_qty
       where id = v_sale_item.product_id;
    end if;
  end loop;

  if v_total <= 0 then
    raise exception 'invalid_return_total';
  end if;

  update public.sale_returns set total_amount = v_total where id = v_return_id;

  return v_return_id;
end;
$$;

grant execute on function public.register_sale_return(uuid, jsonb, public.payment_method, text) to authenticated;

-- ------------------------------------------------------------
-- A gaveta: devolucao em dinheiro SAI do caixa
-- ------------------------------------------------------------
-- A lista de colunas de retorno mudou (ganhou `refunds`), e o Postgres
-- recusa `create or replace` nesse caso: "cannot change return type of
-- existing function". Mesma regra do 20261127000009 — drop antes.
drop function if exists public.cash_expected(date);

create function public.cash_expected(p_date date)
returns table (
  opening     numeric,
  cash_sales  numeric,
  supplies    numeric,
  withdrawals numeric,
  refunds     numeric,
  expected    numeric
)
language sql
stable
set search_path = public
as $$
  with mov as (
    select
      coalesce(sum(amount) filter (where kind = 'opening'), 0) as opening,
      coalesce(sum(amount) filter (where kind = 'in'),      0) as supplies,
      coalesce(sum(amount) filter (where kind = 'out'),     0) as withdrawals
    from public.cash_movements
    where business_date = p_date
  ),
  vendas as (
    select coalesce(sum(sp.amount), 0) as cash_sales
      from public.sale_payments sp
      join public.sales s on s.id = sp.sale_id
     where sp.method = 'cash'
       and (s.created_at at time zone 'America/Sao_Paulo')::date = p_date
  ),
  devolucoes as (
    -- So as devolvidas EM DINHEIRO. Estorno no cartao nao mexe na gaveta.
    select coalesce(sum(r.total_amount), 0) as refunds
      from public.sale_returns r
     where r.refund_method = 'cash'
       and r.business_date = p_date
  )
  select
    mov.opening,
    vendas.cash_sales,
    mov.supplies,
    mov.withdrawals,
    devolucoes.refunds,
    mov.opening + vendas.cash_sales + mov.supplies - mov.withdrawals - devolucoes.refunds
  from mov, vendas, devolucoes;
$$;

grant execute on function public.cash_expected(date) to authenticated;

-- ------------------------------------------------------------
-- O relatorio de lucro desconta as devolucoes
-- ------------------------------------------------------------
-- Sem isto o faturamento mente: conta a venda que foi desfeita. E o custo
-- tambem precisa ser descontado, senao a margem fica pior do que a real —
-- o produto voltou para a prateleira, ele nao foi consumido.
--
-- A assinatura nao muda, entao `create or replace` substitui de verdade.
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
    select s.id, s.total_amount, s.discount_amount, s.payment_method
      from public.sales s
     where s.created_at >= p_start
       and s.created_at <= p_end
  ),
  items as (
    select
      coalesce(p.name, 'Produto removido') as name,
      si.quantity                          as quantity,
      si.subtotal                          as revenue,
      -- Custo da linha, nao do produto hoje.
      si.quantity * si.unit_cost           as cost
    from public.sale_items si
    join sales_in_period s on s.id = si.sale_id
    left join public.products p on p.id = si.product_id
  ),
  devolucoes as (
    -- Duas subconsultas escalares, e nao um join unico: juntar
    -- sale_returns com sale_return_items multiplicaria o total_amount
    -- pelo numero de itens. Mesmo cuidado do 20260615000002.
    select
      coalesce((
        select sum(r.total_amount) from public.sale_returns r
         where r.created_at >= p_start and r.created_at <= p_end
      ), 0) as returned_revenue,
      coalesce((
        select sum(ri.quantity * si.unit_cost)
          from public.sale_return_items ri
          join public.sale_returns r on r.id = ri.return_id
          join public.sale_items si on si.id = ri.sale_item_id
         where r.created_at >= p_start and r.created_at <= p_end
      ), 0) as returned_cost
  ),
  totals as (
    select
      coalesce((select sum(total_amount)    from sales_in_period), 0)
        - (select returned_revenue from devolucoes)                   as revenue,
      coalesce((select sum(discount_amount) from sales_in_period), 0) as discounts,
      coalesce((select sum(cost)            from items), 0)
        - (select returned_cost from devolucoes)                      as cost,
      (select count(*) from sales_in_period)                          as sales_count,
      (select returned_revenue from devolucoes)                       as returns
  ),
  by_payment as (
    select jsonb_object_agg(
             payment_method,
             jsonb_build_object('revenue', revenue, 'count', cnt)
           ) as data
    from (
      select payment_method, sum(total_amount) as revenue, count(*) as cnt
        from sales_in_period group by payment_method
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
             else 0 end as margin
      from items group by name order by sum(revenue) desc limit 10
    ) t
  )
  select jsonb_build_object(
    'revenue',     totals.revenue,
    'discounts',   totals.discounts,
    'cost',        totals.cost,
    'grossProfit', totals.revenue - totals.cost,
    'grossMargin', case when totals.revenue > 0
                        then ((totals.revenue - totals.cost) / totals.revenue) * 100
                        else 0 end,
    'salesCount',  totals.sales_count,
    -- Devolucoes ja estao descontadas de revenue e de cost. Este campo
    -- existe para a tela poder MOSTRAR quanto voltou, em vez de o numero
    -- simplesmente encolher sem explicacao.
    'returns',     totals.returns,
    'byPayment',   coalesce(by_payment.data, '{}'::jsonb),
    'topProducts', top_products.data
  )
  from totals, by_payment, top_products;
$$;

grant execute on function public.dre_report(timestamptz, timestamptz) to authenticated;
