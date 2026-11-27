-- ============================================================
-- Alteracao de preco: congelada na linha e registrada
-- ============================================================
--
-- O QUE EXISTE HOJE
-- -----------------
-- Qualquer operador pode clicar no lapis ao lado de qualquer item do
-- carrinho e digitar outro preco. Tem uso legitimo (cliente antigo
-- pedindo abatimento, embalagem amassada), entao a decisao foi manter
-- liberado — e registrar.
--
-- DOIS PROBLEMAS SEPARADOS
-- ------------------------
-- 1. NAO DA PARA SABER se um preco foi alterado. Hoje a unica forma e
--    comparar o preco cobrado com o preco de catalogo DE HOJE. Se o
--    produto mudou de preco desde a venda, uma venda honesta aparece como
--    alterada, e uma alterada passa despercebida.
--
--    E o mesmo defeito do custo, corrigido em 20261127000007: um numero
--    do passado recalculado com dado do presente. A correcao e a mesma —
--    congelar o preco de catalogo na linha, ao lado do preco cobrado.
--
-- 2. O SERVIDOR ACEITA VENDER POR ZERO. Medido: um produto de R$ 500
--    passou por R$ 0,01 e por R$ 0,00, e o estoque saiu nas duas. Isso
--    nao e desconto, e saida de mercadoria sem contrapartida. Vale como
--    defeito independente de haver ma fe.
--
-- O QUE ESTA MIGRATION FAZ
-- ------------------------
-- - sale_items.list_price: o preco de catalogo congelado na venda.
-- - create_sale_with_items recusa preco <= 0.
-- - toda venda com preco alterado gera uma linha no audit_log, a mesma
--   tabela somente-leitura do historico de exclusoes.
-- ============================================================

alter table public.sale_items
  add column if not exists list_price numeric(12,2) not null default 0
    check (list_price >= 0);

comment on column public.sale_items.list_price is
  'Preco de catalogo no momento da venda. Comparar com unit_price revela alteracao.';

-- Backfill com o preco de hoje. Mesma ressalva do unit_cost: o preco
-- historico nunca foi gravado, entao isto nao RECUPERA o passado — apenas
-- reproduz a unica comparacao que ja era possivel. A diferenca e que, da
-- proxima venda em diante, a comparacao passa a ser um fato.
update public.sale_items si
   set list_price = coalesce(p.sale_price, 0)
  from public.products p
 where p.id = si.product_id
   and si.list_price = 0;

-- ------------------------------------------------------------
-- A venda congela o preco de catalogo e registra a alteracao
-- ------------------------------------------------------------
-- A lista de parametros NAO muda, entao `create or replace` substitui de
-- verdade e nao cria sobrecarga.
create or replace function public.create_sale_with_items(
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
  v_overrides   jsonb := '[]'::jsonb;
  v_email       text;
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

    -- Venda por zero nao e desconto: e mercadoria saindo sem contrapartida.
    IF v_unit_price IS NULL OR v_unit_price <= 0 THEN
      RAISE EXCEPTION 'invalid_price:%', v_product.name;
    END IF;

    v_subtotal := v_unit_price * v_qty;
    v_gross    := v_gross + v_subtotal;

    INSERT INTO public.sale_items
      (sale_id, product_id, quantity, unit_price, subtotal, item_description, unit_cost, list_price)
    VALUES
      (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc,
       coalesce(v_product.cost_price, 0), coalesce(v_product.sale_price, 0));

    -- Guarda o que destoou do catalogo, para o registro mais abaixo.
    -- Produto sem controle de estoque fica de fora: nele o preco SEMPRE e
    -- digitado, entao marcar como alteracao seria ruido em toda venda.
    IF v_product.track_stock AND v_unit_price <> coalesce(v_product.sale_price, 0) THEN
      v_overrides := v_overrides || jsonb_build_object(
        'product_name', v_product.name,
        'quantity',     v_qty,
        'list_price',   v_product.sale_price,
        'charged',      v_unit_price,
        'difference',   v_unit_price - v_product.sale_price
      );
    END IF;

    IF v_product.track_stock THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_product.id;
    END IF;
  END LOOP;

  v_discount := LEAST(v_discount, v_gross);
  v_total    := v_gross - v_discount;

  IF p_payments IS NULL OR jsonb_array_length(p_payments) = 0 THEN
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

      IF v_pay_amount > v_best_amount THEN
        v_best_amount := v_pay_amount;
        v_main_method := v_pay_method;
      END IF;
    END LOOP;

    IF round(v_paid, 2) <> round(v_total, 2) THEN
      RAISE EXCEPTION 'payment_mismatch:%:%', round(v_total, 2), round(v_paid, 2);
    END IF;
  END IF;

  UPDATE public.sales
     SET total_amount    = v_total,
         discount_amount = v_discount,
         payment_method  = v_main_method
   WHERE id = v_sale_id;

  -- Uma linha por venda, nao por item: o dono quer ver "esta venda saiu
  -- com preco mexido", nao tres linhas da mesma venda.
  IF jsonb_array_length(v_overrides) > 0 THEN
    SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

    INSERT INTO public.audit_log
      (action, entity, entity_id, actor_id, actor_email, summary, snapshot)
    VALUES (
      'price_overridden',
      'sale',
      v_sale_id,
      auth.uid(),
      v_email,
      'Preço alterado em ' || jsonb_array_length(v_overrides)::text ||
        CASE WHEN jsonb_array_length(v_overrides) = 1 THEN ' item' ELSE ' itens' END ||
        ' · venda de ' || to_char(v_total, 'FM999G999G990D00'),
      jsonb_build_object(
        'sale', jsonb_build_object('id', v_sale_id, 'total_amount', v_total),
        'overrides', v_overrides
      )
    );
  END IF;

  RETURN v_sale_id;
END;
$$;

grant execute on function public.create_sale_with_items(
  public.payment_method, text, jsonb, uuid, uuid, numeric, jsonb
) to authenticated;
