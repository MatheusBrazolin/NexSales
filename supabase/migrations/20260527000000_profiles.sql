-- ============================================================
-- PROFILES: nome + sobrenome dos usuarios
-- ============================================================

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles enable row level security;

-- Qualquer autenticado pode ler perfis (necessario pra mostrar
-- nome do vendedor em vendas, lista de usuarios, etc.)
create policy "auth_read_profiles" on public.profiles
  for select using (auth.uid() is not null);

-- Usuario pode criar/atualizar o proprio perfil. Admins podem tudo.
create policy "self_or_admin_insert_profile" on public.profiles
  for insert with check (
    auth.uid() = user_id or public.is_admin()
  );

create policy "self_or_admin_update_profile" on public.profiles
  for update using (
    auth.uid() = user_id or public.is_admin()
  ) with check (
    auth.uid() = user_id or public.is_admin()
  );

create policy "admin_delete_profile" on public.profiles
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- Trigger: criar profile automaticamente no signup
-- Pega first_name / last_name do raw_user_meta_data se vierem.
-- Blindado contra falhas (nao trava o signup).
-- ------------------------------------------------------------
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (user_id, first_name, last_name)
    values (
      new.id,
      nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '')), ''),
      nullif(trim(coalesce(new.raw_user_meta_data->>'last_name', '')), '')
    )
    on conflict (user_id) do nothing;
  exception when others then
    raise warning 'handle_new_user_profile failed for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger trg_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Backfill: cria profile vazio pra usuarios existentes (UI cai pro email)
insert into public.profiles (user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- Atualiza admin_list_users pra retornar first_name + last_name.
-- DROP necessario porque o tipo de retorno mudou (Postgres nao
-- permite mudar return type via CREATE OR REPLACE).
-- ------------------------------------------------------------
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  first_name text,
  last_name text,
  role public.user_role,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
    select
      u.id as user_id,
      u.email::text,
      p.first_name,
      p.last_name,
      coalesce(r.role, 'employee'::public.user_role) as role,
      u.created_at,
      u.last_sign_in_at
    from auth.users u
    left join public.user_roles r on r.user_id = u.id
    left join public.profiles p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function public.admin_list_users() to authenticated;
