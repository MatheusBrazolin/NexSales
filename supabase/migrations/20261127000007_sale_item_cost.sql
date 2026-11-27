-- ============================================================
-- Guarda o custo do item no momento da venda
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- sale_items ja guarda unit_price (o preco cobrado naquela venda), mas o
-- custo nao: o relatorio de lucro multiplica a quantidade vendida pelo
-- cost_price ATUAL do produto. A propria tela admite isso em letra miuda:
-- "custo de produto (aprox.)".
--
-- Na pratica, se o fornecedor subir o preco hoje, a margem de uma venda de
-- junho muda sozinha — e o lucro do mes passado deixa de bater com o que
-- foi apurado na epoca. Um relatorio que muda o passado nao serve para
-- decidir nada.
--
-- A SOLUCAO
-- ---------
-- Congelar o custo na linha da venda, do mesmo jeito que unit_price ja
-- congela o preco. A partir daqui o lucro de uma venda e um fato, nao uma
-- conta refeita com dados de hoje.
--
-- SOBRE AS VENDAS ANTIGAS
-- -----------------------
-- Nao da para recuperar o custo historico do que ja foi vendido: essa
-- informacao nunca foi gravada. O backfill usa o custo atual, que e
-- exatamente o que o relatorio ja fazia — ou seja, nenhum numero historico
-- muda com esta migration. A diferenca e que, daqui para frente, para de
-- piorar.
-- ============================================================

alter table public.sale_items
  add column if not exists unit_cost numeric(12,2) not null default 0
    check (unit_cost >= 0);

comment on column public.sale_items.unit_cost is
  'Custo unitario no momento da venda. Congelado, como unit_price.';

-- Backfill: mantem o relatorio exatamente como esta hoje para o passado.
update public.sale_items si
   set unit_cost = coalesce(p.cost_price, 0)
  from public.products p
 where p.id = si.product_id
   and si.unit_cost = 0;

-- ------------------------------------------------------------
-- A venda passa a gravar o custo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null,
  p_discount       numeric default 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id    uuid;
  v_gross      numeric(12,2) := 0;
  v_discount   numeric(12,2);
  v_item       jsonb;
  v_product    record;
  v_qty        integer;
  v_unit_price numeric(12,2);
  v_subtotal   numeric(12,2);
  v_item_desc  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  IF p_payment_method = 'fiado' AND p_customer_id IS NULL THEN
    RAISE EXCEPTION 'customer_required';
  END IF;

  v_discount := GREATEST(COALESCE(p_discount, 0), 0);

  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_sale_id FROM public.sales WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_sale_id;
    END IF;
  END IF;

  INSERT INTO public.sales (total_amount, payment_method, notes, seller_id, client_uuid, customer_id)
  VALUES (0, p_payment_method, p_notes, auth.uid(), p_client_uuid, p_customer_id)
  RETURNING id INTO v_sale_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty       := (v_item->>'quantity')::integer;
    v_item_desc := v_item->>'item_description';

    SELECT id, sale_price, cost_price, stock_quantity, name, track_stock
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', (v_item->>'product_id');
    END IF;

    IF v_product.track_stock AND v_product.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    v_unit_price := CASE
      WHEN v_item ? 'unit_price' THEN (v_item->>'unit_price')::numeric
      ELSE v_product.sale_price
    END;

    v_subtotal := v_unit_price * v_qty;
    v_gross    := v_gross + v_subtotal;

    INSERT INTO public.sale_items
      (sale_id, product_id, quantity, unit_price, subtotal, item_description, unit_cost)
    VALUES
      (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc,
       coalesce(v_product.cost_price, 0));

    IF v_product.track_stock THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_product.id;
    END IF;
  END LOOP;

  v_discount := LEAST(v_discount, v_gross);

  UPDATE public.sales
     SET total_amount    = v_gross - v_discount,
         discount_amount = v_discount
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

-- ------------------------------------------------------------
-- O relatorio passa a ler o custo congelado
-- ------------------------------------------------------------
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
  totals as (
    select
      coalesce((select sum(total_amount)    from sales_in_period), 0) as revenue,
      coalesce((select sum(discount_amount) from sales_in_period), 0) as discounts,
      coalesce((select sum(cost)            from items), 0)           as cost,
      (select count(*) from sales_in_period)                          as sales_count
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
    'byPayment',   coalesce(by_payment.data, '{}'::jsonb),
    'topProducts', top_products.data
  )
  from totals, by_payment, top_products;
$$;

grant execute on function public.dre_report(timestamptz, timestamptz) to authenticated;
