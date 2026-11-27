-- ============================================================
-- Pagamento misto: uma venda, varias formas de pagamento
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- `sales.payment_method` e um enum UNICO por venda. O cliente que paga
-- R$ 50 no cartao e R$ 20 em dinheiro obriga o caixa a escolher uma das
-- duas formas — e a venda inteira vai parar na escolhida.
--
-- Isso nao da erro em lugar nenhum. Simplesmente:
--
--   - o relatorio por forma de pagamento mente, todo dia;
--   - o fechamento de caixa cobra do caixa um dinheiro que entrou no
--     cartao (ou o contrario), e nunca fecha;
--   - no fiado e pior: "paguei metade agora, o resto fica" vira uma venda
--     100% fiada, e o cliente aparece devendo o valor cheio.
--
-- O MODELO
-- --------
-- Uma tabela de pagamentos por venda. `sales.payment_method` continua
-- existindo e passa a significar a forma PREDOMINANTE (a de maior valor),
-- que e o que a lista de vendas e o recibo mostram como etiqueta.
--
-- Quem lida com DINHEIRO passa a ler sale_payments:
--   - o saldo do fiado (so a parcela fiada e divida);
--   - o fechamento de caixa (cada forma com o seu valor).
--
-- Quem so mostra etiqueta continua lendo sales.payment_method. Isso limita
-- a mudanca as telas onde o numero importa.
-- ============================================================

create table if not exists public.sale_payments (
  -- gen_random_uuid() e nativo do Postgres (pg_catalog), nao vem de
  -- extensao. As migrations antigas usam uuid_generate_v4(), do uuid-ossp,
  -- e so funcionaram porque foram aplicadas a mao pelo painel: o `db push`
  -- roda com um search_path que nao inclui o schema `extensions`, e a
  -- funcao simplesmente nao existe la.
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid not null references public.sales(id) on delete cascade,
  method     public.payment_method not null,
  amount     numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

comment on table public.sale_payments is
  'Formas de pagamento de uma venda. A soma dos amounts e igual a sales.total_amount.';

-- O cascade importa: cancelar a venda apaga os pagamentos junto, sem
-- deixar linha orfa cobrando um dinheiro que nao existe mais.

create index if not exists idx_sale_payments_sale   on public.sale_payments(sale_id);
create index if not exists idx_sale_payments_method on public.sale_payments(method);

-- ------------------------------------------------------------
-- Backfill: toda venda que ja existe ganha a sua linha
-- ------------------------------------------------------------
-- Nenhum numero historico muda: cada venda vira um pagamento unico, do
-- valor cheio, na forma que ja estava gravada.
--
-- Venda com total zero fica SEM linha de pagamento, de proposito: o check
-- exige amount > 0, e dizer que ela foi paga em alguma forma seria
-- inventar um fato. Nada foi pago.
insert into public.sale_payments (sale_id, method, amount, created_at)
select s.id, s.payment_method, s.total_amount, s.created_at
  from public.sales s
 where s.total_amount > 0
   and not exists (
     select 1 from public.sale_payments sp where sp.sale_id = s.id
   );

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.sale_payments enable row level security;

-- SECURITY DEFINER de proposito: esta funcao e chamada DE DENTRO da policy
-- de sales. Sem o definer, consultar sale_payments aplicaria a RLS de
-- sale_payments, que consulta sales — e a policy entraria em recursao.
create or replace function public.sale_has_fiado(p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sale_payments
     where sale_id = p_sale_id and method = 'fiado'
  );
$$;

grant execute on function public.sale_has_fiado(uuid) to authenticated;

drop policy if exists "read_sale_payments_of_visible_sales" on public.sale_payments;
create policy "read_sale_payments_of_visible_sales" on public.sale_payments
  for select using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and (
          public.is_admin()
          or (
            auth.uid() is not null
            and (
              s.created_at >= public.br_today_start()
              or s.payment_method = 'fiado'
              or public.sale_has_fiado(s.id)
            )
          )
        )
    )
  );

drop policy if exists "owner_insert_sale_payments" on public.sale_payments;
create policy "owner_insert_sale_payments" on public.sale_payments
  for insert with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- A venda parcialmente fiada precisa continuar visivel
-- ------------------------------------------------------------
-- Sem isto, o vendedor perderia de vista no dia seguinte uma venda cuja
-- divida ele ainda precisa cobrar — porque a forma predominante dela
-- seria 'cash', nao 'fiado'.
drop policy if exists "admin_or_today_or_fiado_read_sales" on public.sales;
create policy "admin_or_today_or_fiado_read_sales" on public.sales
  for select using (
    public.is_admin()
    or (
      auth.uid() is not null
      and (
        created_at >= public.br_today_start()
        or payment_method = 'fiado'
        or public.sale_has_fiado(id)
      )
    )
  );

drop policy if exists "read_sale_items_of_visible_sales" on public.sale_items;
create policy "read_sale_items_of_visible_sales" on public.sale_items
  for select using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and (
          public.is_admin()
          or (
            auth.uid() is not null
            and (
              s.created_at >= public.br_today_start()
              or s.payment_method = 'fiado'
              or public.sale_has_fiado(s.id)
            )
          )
        )
    )
  );

-- ------------------------------------------------------------
-- O saldo do fiado passa a somar so a PARCELA fiada
-- ------------------------------------------------------------
-- Antes: sum(total_amount) where payment_method = 'fiado'.
-- Numa venda mista isso cobraria do cliente a venda inteira, incluindo a
-- parte que ele pagou na hora.
--
-- A pre-agregacao em subconsulta foi mantida (ver 20260615000002): juntar
-- sales e debt_payments direto no mesmo join multiplica as duas somas.
create or replace view public.customer_balances as
select
  c.id,
  c.full_name,
  c.phone,
  c.notes,
  c.created_at,
  c.updated_at,
  coalesce(s.total_fiado,  0)                              as total_fiado,
  coalesce(dp.total_paid,  0)                              as total_paid,
  coalesce(s.total_fiado,  0) - coalesce(dp.total_paid, 0) as current_debt,
  dp.last_payment_at,
  s.first_fiado_at
from public.customers c
left join (
  select
    s.customer_id,
    sum(sp.amount)  as total_fiado,
    min(s.created_at) as first_fiado_at
  from public.sales s
  join public.sale_payments sp on sp.sale_id = s.id
  where sp.method = 'fiado'
    and s.customer_id is not null
  group by s.customer_id
) s  on s.customer_id  = c.id
left join (
  select
    customer_id,
    sum(amount)     as total_paid,
    max(created_at) as last_payment_at
  from public.debt_payments
  group by customer_id
) dp on dp.customer_id = c.id;

alter view public.customer_balances set (security_invoker = on);

-- ------------------------------------------------------------
-- A venda passa a aceitar varios pagamentos
-- ------------------------------------------------------------
-- `drop function` antes do create: a lista de parametros mudou, e
-- `create or replace` criaria uma SOBRECARGA em vez de substituir — foi
-- exatamente assim que o banco acabou com tres versoes vivas desta mesma
-- funcao (ver 20261127000009).
--
-- p_payments e opcional. Quando vier null, a venda tem uma forma so e nada
-- muda — e isso que mantem funcionando a fila de vendas offline gravada
-- pela versao anterior do app, que nao conhece este parametro.
drop function if exists public.create_sale_with_items(
  public.payment_method, text, jsonb, uuid, uuid, numeric
);

CREATE FUNCTION public.create_sale_with_items(
  p_payment_method public.payment_method,
  p_notes          text,
  p_items          jsonb,
  p_client_uuid    uuid default null,
  p_customer_id    uuid default null,
  p_discount       numeric default 0,
  p_payments       jsonb default null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id     uuid;
  v_gross       numeric(12,2) := 0;
  v_discount    numeric(12,2);
  v_total       numeric(12,2);
  v_item        jsonb;
  v_product     record;
  v_qty         integer;
  v_unit_price  numeric(12,2);
  v_subtotal    numeric(12,2);
  v_item_desc   text;
  v_pay         jsonb;
  v_pay_method  public.payment_method;
  v_pay_amount  numeric(12,2);
  v_paid        numeric(12,2) := 0;
  v_best_amount numeric(12,2) := -1;
  v_main_method public.payment_method;
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
  v_total    := v_gross - v_discount;

  -- ---------- pagamentos ----------
  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
    -- Caminho de sempre: uma forma so, o valor cheio.
    v_main_method := p_payment_method;

    IF v_total > 0 THEN
      INSERT INTO public.sale_payments (sale_id, method, amount)
      VALUES (v_sale_id, p_payment_method, v_total);
    END IF;
  ELSE
    FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      v_pay_method := (v_pay->>'method')::public.payment_method;
      v_pay_amount := round((v_pay->>'amount')::numeric, 2);

      IF v_pay_amount IS NULL OR v_pay_amount <= 0 THEN
        RAISE EXCEPTION 'invalid_payment_amount';
      END IF;

      IF v_pay_method = 'fiado' AND p_customer_id IS NULL THEN
        RAISE EXCEPTION 'customer_required';
      END IF;

      INSERT INTO public.sale_payments (sale_id, method, amount)
      VALUES (v_sale_id, v_pay_method, v_pay_amount);

      v_paid := v_paid + v_pay_amount;

      -- A forma predominante e a etiqueta da venda nas listas e no recibo.
      IF v_pay_amount > v_best_amount THEN
        v_best_amount := v_pay_amount;
        v_main_method := v_pay_method;
      END IF;
    END LOOP;

    -- A trava que faz o modelo valer alguma coisa. Sem ela, um erro de
    -- digitacao no caixa viraria uma venda cujos pagamentos nao somam o
    -- total — e o fechamento nunca mais fecharia, sem ninguem saber por que.
    IF round(v_paid, 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'payment_mismatch:%:%', round(v_total, 2), round(v_paid, 2);
    END IF;
  END IF;

  UPDATE public.sales
     SET total_amount    = v_total,
         discount_amount = v_discount,
         payment_method  = v_main_method
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;

grant execute on function public.create_sale_with_items(
  public.payment_method, text, jsonb, uuid, uuid, numeric, jsonb
) to authenticated;

comment on function public.create_sale_with_items(
  public.payment_method, text, jsonb, uuid, uuid, numeric, jsonb
) is
  'Registra a venda. p_payments opcional: quando vier, a soma tem de bater com o total.';
