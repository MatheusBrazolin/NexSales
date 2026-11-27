-- ============================================================
-- Sangria, suprimento e fechamento de caixa de verdade
-- ============================================================
--
-- O QUE EXISTE HOJE
-- -----------------
-- A tela "Fechamento de caixa" e um RESUMO DAS VENDAS DO DIA. Ela mostra
-- o que o sistema ja sabia e nao confere nada. Nao existe fundo de troco,
-- nao existe retirada, nao existe reforco, e nao existe a unica pergunta
-- que importa no fim do dia:
--
--   o dinheiro que esta na gaveta bate com o que deveria estar?
--
-- Sem isso, uma falta de caixa nao aparece em lugar nenhum.
--
-- A CONTA
-- -------
--   esperado = fundo de troco
--            + a parte EM DINHEIRO das vendas do dia
--            + suprimentos
--            - sangrias
--
-- "a parte em dinheiro" so pode ser calculada porque existe
-- sale_payments (20261128000001). Antes, numa venda mista, a venda
-- inteira entrava numa forma so, e o esperado nunca bateria.
--
-- POR QUE AS MOVIMENTACOES SAO IMUTAVEIS
-- --------------------------------------
-- Uma sangria que o operador pode apagar depois nao serve para conferir
-- nada — e exatamente o buraco que o registro de atividades fechou para
-- as vendas. Aqui a RLS tem policy de SELECT e de INSERT, e NENHUMA de
-- update ou delete. Errou o valor? Lanca o oposto, com o motivo. O erro
-- fica visivel, que e o comportamento certo para dinheiro.
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'cash_movement_kind') then
    create type public.cash_movement_kind as enum ('opening', 'in', 'out');
  end if;
end $$;

comment on type public.cash_movement_kind is
  'opening = fundo de troco, in = suprimento (entrada), out = sangria (retirada)';

create table if not exists public.cash_movements (
  id            uuid primary key default gen_random_uuid(),
  -- Dia-calendario em Sao Paulo, nao em UTC: uma venda das 22h e do mesmo
  -- dia do caixa, mas ja e "amanha" em UTC.
  business_date date not null default (now() at time zone 'America/Sao_Paulo')::date,
  kind          public.cash_movement_kind not null,
  amount        numeric(12,2) not null check (amount > 0),
  reason        text not null check (btrim(reason) <> ''),
  actor_id      uuid not null references auth.users(id) on delete restrict,
  actor_email   text,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cash_movements_date on public.cash_movements (business_date desc);

alter table public.cash_movements enable row level security;

-- Leitura: admin ve tudo; o operador ve o dia corrente, que e o que ele
-- precisa para fechar o proprio caixa.
drop policy if exists "read_cash_movements" on public.cash_movements;
create policy "read_cash_movements" on public.cash_movements
  for select using (
    public.is_admin()
    or (
      auth.uid() is not null
      and business_date = (now() at time zone 'America/Sao_Paulo')::date
    )
  );

-- Escrita so pela RPC (SECURITY DEFINER). Sem policy de insert direto,
-- de update ou de delete: a movimentacao nasce imutavel.

-- ------------------------------------------------------------
-- Fechamentos
-- ------------------------------------------------------------
create table if not exists public.cash_closes (
  id            uuid primary key default gen_random_uuid(),
  business_date date not null unique,
  expected_cash numeric(12,2) not null,
  counted_cash  numeric(12,2) not null check (counted_cash >= 0),
  -- Guardada, e nao recalculada na leitura: a diferenca apurada naquele
  -- dia e um fato daquele dia. Mesmo motivo do unit_cost.
  difference    numeric(12,2) not null,
  notes         text,
  actor_id      uuid not null references auth.users(id) on delete restrict,
  actor_email   text,
  closed_at     timestamptz not null default now()
);

alter table public.cash_closes enable row level security;

drop policy if exists "read_cash_closes" on public.cash_closes;
create policy "read_cash_closes" on public.cash_closes
  for select using (
    public.is_admin()
    or (
      auth.uid() is not null
      and business_date = (now() at time zone 'America/Sao_Paulo')::date
    )
  );

-- ------------------------------------------------------------
-- Quanto deveria haver na gaveta
-- ------------------------------------------------------------
create or replace function public.cash_expected(p_date date)
returns table (
  opening     numeric,
  cash_sales  numeric,
  supplies    numeric,
  withdrawals numeric,
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
    -- So a PARCELA em dinheiro. Cartao e PIX nao estao na gaveta.
    select coalesce(sum(sp.amount), 0) as cash_sales
      from public.sale_payments sp
      join public.sales s on s.id = sp.sale_id
     where sp.method = 'cash'
       and (s.created_at at time zone 'America/Sao_Paulo')::date = p_date
  )
  select
    mov.opening,
    vendas.cash_sales,
    mov.supplies,
    mov.withdrawals,
    mov.opening + vendas.cash_sales + mov.supplies - mov.withdrawals
  from mov, vendas;
$$;

grant execute on function public.cash_expected(date) to authenticated;

-- ------------------------------------------------------------
-- Lancar movimentacao
-- ------------------------------------------------------------
create or replace function public.register_cash_movement(
  p_kind   public.cash_movement_kind,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  -- Motivo obrigatorio pelo mesmo motivo da exclusao de venda: sem ele, o
  -- lancamento diz que saiu dinheiro, mas nao para que.
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required';
  end if;

  -- Um fundo de troco por dia. O segundo seria dinheiro contado duas vezes.
  if p_kind = 'opening' and exists (
    select 1 from public.cash_movements
     where business_date = v_today and kind = 'opening'
  ) then
    raise exception 'opening_already_set';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into public.cash_movements (kind, amount, reason, actor_id, actor_email)
  values (p_kind, round(p_amount, 2), btrim(p_reason), auth.uid(), v_email)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.register_cash_movement(public.cash_movement_kind, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- Fechar o caixa
-- ------------------------------------------------------------
create or replace function public.close_cash_register(
  p_date    date,
  p_counted numeric,
  p_notes   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_expected numeric(12,2);
  v_email    text;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if p_counted is null or p_counted < 0 then
    raise exception 'invalid_amount';
  end if;

  if exists (select 1 from public.cash_closes where business_date = p_date) then
    raise exception 'already_closed';
  end if;

  select expected into v_expected from public.cash_expected(p_date);

  select email into v_email from auth.users where id = auth.uid();

  insert into public.cash_closes
    (business_date, expected_cash, counted_cash, difference, notes, actor_id, actor_email)
  values
    (p_date, v_expected, round(p_counted, 2), round(p_counted, 2) - v_expected,
     nullif(btrim(coalesce(p_notes, '')), ''), auth.uid(), v_email)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.close_cash_register(date, numeric, text) to authenticated;
