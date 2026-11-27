-- ============================================================
-- Desconto no total da venda
-- ============================================================
--
-- O PDV ja permitia sobrescrever o preco item a item, mas nao dar um
-- desconto no total — que e como o desconto realmente acontece no balcao
-- ("deixa por 50"). Agora a venda guarda o desconto separado, para que o
-- relatorio de lucro continue vendo a receita bruta dos itens e o quanto
-- foi concedido.
--
-- Esta migration TAMBEM corrige uma regressao: a versao de
-- create_sale_with_items publicada em 20260623000001_track_stock.sql
-- reintroduziu
--
--   v_unit_price := COALESCE(NULLIF((v_item->>'unit_price')::numeric, 0),
--                            v_product.sale_price);
--
-- que a migration 20260615000003 tinha acabado de remover, pelo motivo
-- descrito la: NULLIF(..., 0) transforma um preco legitimo de R$ 0,00 no
-- preco de catalogo. Ou seja, um item dado como brinde (preco zerado pelo
-- caixa) era cobrado pelo valor cheio, em silencio. O contrato correto e o
-- de 20260615000003: usar o preco enviado quando a CHAVE existe no JSON,
-- porque o frontend so a inclui quando o caixa definiu um preco.
-- ============================================================

alter table public.sales
  add column if not exists discount_amount numeric(12,2) not null default 0
    check (discount_amount >= 0);

comment on column public.sales.discount_amount is
  'Desconto aplicado sobre a soma dos itens. total_amount ja vem liquido.';

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

  -- Idempotência: se o client_uuid já existe, devolve o id existente
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_sale_id
      FROM public.sales
     WHERE client_uuid = p_client_uuid;
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

    SELECT id, sale_price, stock_quantity, name, track_stock
      INTO v_product
      FROM public.products
     WHERE id = (v_item->>'product_id')::uuid
       AND is_active = true
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found:%', (v_item->>'product_id');
    END IF;

    -- Only enforce stock limits for tracked products
    IF v_product.track_stock AND v_product.stock_quantity < v_qty THEN
      RAISE EXCEPTION 'insufficient_stock:%', v_product.name;
    END IF;

    -- Presence of the key decides, not its value: the frontend only sends
    -- unit_price when the cashier set one, so R$ 0,00 is a real price.
    v_unit_price := CASE
      WHEN v_item ? 'unit_price' THEN (v_item->>'unit_price')::numeric
      ELSE v_product.sale_price
    END;

    v_subtotal := v_unit_price * v_qty;
    v_gross    := v_gross + v_subtotal;

    INSERT INTO public.sale_items (sale_id, product_id, quantity, unit_price, subtotal, item_description)
    VALUES (v_sale_id, v_product.id, v_qty, v_unit_price, v_subtotal, v_item_desc);

    -- Only deduct stock for tracked products
    IF v_product.track_stock THEN
      UPDATE public.products
         SET stock_quantity = stock_quantity - v_qty
       WHERE id = v_product.id;
    END IF;
  END LOOP;

  -- Um desconto maior que a venda zera o total em vez de virar negativo.
  v_discount := LEAST(v_discount, v_gross);

  UPDATE public.sales
     SET total_amount    = v_gross - v_discount,
         discount_amount = v_discount
   WHERE id = v_sale_id;

  RETURN v_sale_id;
END;
$$;
