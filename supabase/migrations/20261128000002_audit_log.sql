-- ============================================================
-- Registro de auditoria: o que foi apagado, por quem, quando
-- ============================================================
--
-- O PROBLEMA
-- ----------
-- Excluir uma venda apaga tudo: a venda, os itens e os pagamentos. O
-- proprio dialogo avisa que "o historico nao tera registro dessa venda".
-- O estoque volta, entao o inventario fecha e nada denuncia a falta.
--
-- Hoje so admin consegue excluir (cancel_sale checa is_admin), o que ja
-- limita bastante o risco. Mas a conta de admin pode ser emprestada, o
-- dono pode promover um gerente amanha, e ninguem — nem o dono — deveria
-- conseguir apagar dinheiro sem deixar rastro.
--
-- O QUE TORNA ESTE REGISTRO CONFIAVEL
-- -----------------------------------
-- 1. Escrito DENTRO do cancel_sale, na mesma transacao do delete. Nao
--    existe caminho que apague a venda sem gravar aqui: se a gravacao
--    falhar, o delete nao acontece.
--
-- 2. NINGUEM pode apagar ou alterar este registro pela aplicacao. A RLS
--    esta ligada e existe APENAS policy de leitura (admin). Sem policy de
--    insert, update ou delete, essas operacoes sao negadas para todo
--    mundo que passa pela API — inclusive para o admin. Quem escreve e a
--    funcao SECURITY DEFINER, que roda como dona da tabela.
--
--    Um registro de auditoria que o suspeito pode apagar nao serve para
--    nada. E por isso que a tabela e proposital e deliberadamente
--    somente-leitura.
--
-- 3. O snapshot guarda a venda inteira em jsonb — itens, precos,
--    pagamentos, cliente e quem vendeu. Nao e so "venda X foi apagada": e
--    a venda inteira preservada, para o dono conferir o que sumiu.
--
-- 4. O email de quem apagou fica CONGELADO na linha, pelo mesmo motivo do
--    unit_cost: se o usuario for removido depois, o rastro continua
--    dizendo quem foi.
-- ============================================================

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  summary     text not null,
  reason      text,
  snapshot    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_log is
  'Somente-leitura pela API. Escrito apenas por funcoes SECURITY DEFINER.';

create index if not exists idx_audit_log_created on public.audit_log (created_at desc);
create index if not exists idx_audit_log_action  on public.audit_log (action);

alter table public.audit_log enable row level security;

-- Leitura: so admin. Um funcionario nao precisa ver o que o dono apagou.
drop policy if exists "admin_read_audit_log" on public.audit_log;
create policy "admin_read_audit_log" on public.audit_log
  for select using (public.is_admin());

-- Nao ha policy de insert, update ou delete, de proposito. Isso NEGA as
-- tres operacoes para qualquer um que passe pela API.

-- ------------------------------------------------------------
-- cancel_sale passa a registrar antes de apagar
-- ------------------------------------------------------------
-- `drop function` antes do create: a lista de parametros mudou (ganhou
-- p_reason), e `create or replace` criaria uma sobrecarga em vez de
-- substituir — ver 20261127000009.
drop function if exists public.cancel_sale(uuid);

create function public.cancel_sale(p_sale_id uuid, p_reason text default null)
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
    nullif(btrim(coalesce(p_reason, '')), ''),
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
