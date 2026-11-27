-- ============================================================
-- Motivo da exclusao passa a ser obrigatorio
-- ============================================================
--
-- O campo nasceu opcional em 20261128000002, e na pratica opcional vira
-- em branco: a linha do registro diria quem apagou e quanto, mas nao por
-- que — que e justamente a pergunta que se faz ao olhar o historico meses
-- depois.
--
-- A assinatura NAO muda, entao `create or replace` substitui de verdade e
-- nao cria sobrecarga.
-- ============================================================

create or replace function public.cancel_sale(p_sale_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item     record;
  v_sale     record;
  v_snapshot jsonb;
  v_email    text;
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Motivo obrigatorio. A trava fica AQUI, e nao so na tela: desabilitar o
  -- botao impede o clique, nao a chamada. A chave da API vai no navegador,
  -- entao quem quisesse apagar sem justificar chamaria a funcao direto.
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'sale_not_found' using errcode = 'P0001';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  -- A venda inteira, antes de deixar de existir.
  v_snapshot := jsonb_build_object(
    'sale', to_jsonb(v_sale),
    'seller_email', (select email from auth.users where id = v_sale.seller_id),
    'customer_name', (
      select full_name from public.customers where id = v_sale.customer_id
    ),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'product_code', p.code,
               'product_name', coalesce(p.name, si.item_description, 'Produto removido'),
               'quantity',     si.quantity,
               'unit_price',   si.unit_price,
               'unit_cost',    si.unit_cost,
               'subtotal',     si.subtotal
             ) order by si.id)
        from public.sale_items si
        left join public.products p on p.id = si.product_id
       where si.sale_id = p_sale_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object('method', sp.method, 'amount', sp.amount)
                       order by sp.amount desc)
        from public.sale_payments sp
       where sp.sale_id = p_sale_id
    ), '[]'::jsonb)
  );

  insert into public.audit_log
    (action, entity, entity_id, actor_id, actor_email, summary, reason, snapshot)
  values (
    'sale_deleted',
    'sale',
    p_sale_id,
    auth.uid(),
    v_email,
    'Venda de ' || to_char(v_sale.total_amount, 'FM999G999G990D00') ||
      ' em ' || v_sale.payment_method::text ||
      ' (' || to_char(v_sale.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ')',
    btrim(p_reason),
    v_snapshot
  );

  -- Devolve cada item ao estoque. FOR UPDATE evita corrida com o PDV.
  for v_item in
    select si.product_id, si.quantity
      from public.sale_items si
      join public.products p on p.id = si.product_id
     where si.sale_id = p_sale_id
       for update of p
  loop
    update public.products
       set stock_quantity = stock_quantity + v_item.quantity
     where id = v_item.product_id;
  end loop;

  delete from public.sales where id = p_sale_id;
end;
$$;

grant execute on function public.cancel_sale(uuid, text) to authenticated;

comment on function public.cancel_sale(uuid, text) is
  'Cancela a venda. Grava o registro de auditoria ANTES de apagar, na mesma transacao.';
