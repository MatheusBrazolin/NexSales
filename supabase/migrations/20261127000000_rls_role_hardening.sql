-- ============================================================
-- RLS: alinha as policies com o controle de acesso do app
-- ============================================================
--
-- PROBLEMA
-- --------
-- As policies originais eram todas no formato:
--
--   using (auth.uid() is not null)
--
-- ou seja, QUALQUER usuario autenticado — inclusive um 'employee' — podia
-- ler e escrever products, categories e customers, e ler o historico
-- completo de vendas, falando direto com a API REST do Supabase.
--
-- A trava de admin existia apenas na camada do app (requireAdmin() em
-- src/lib/auth/roles.ts). Como a NEXT_PUBLIC_SUPABASE_ANON_KEY esta no
-- bundle do browser por definicao, um funcionario logado podia abrir o
-- DevTools e rodar:
--
--   await supabase.from('products').update({ sale_price: 0.01 }).eq(...)
--   await supabase.from('sales').select('*')   -- vendas de todos os dias
--
-- SOLUCAO
-- -------
-- As policies abaixo espelham exatamente a regra que o app ja aplica:
--
--   admin     -> acesso total
--   employee  -> le o catalogo, le as vendas DE HOJE, le o historico de
--                FIADO (a tela de clientes e do PDV e precisa do extrato
--                completo do devedor) e cria clientes. Nenhuma escrita em
--                produtos, categorias nem alteracao de vendas.
--
-- Toda escrita legitima de venda/estoque/pagamento continua passando pelas
-- funcoes SECURITY DEFINER (create_sale_with_items, cancel_sale,
-- record_debt_payment), que rodam com privilegios proprios e fazem a
-- propria checagem de autorizacao. Por isso travar as tabelas nao quebra
-- nenhum fluxo do PDV.
--
-- public.is_admin() ja existe desde 20260526000000_user_roles.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Helper: inicio do dia corrente no fuso de Brasilia, em UTC.
-- Espelha brDayRangeUTC() de src/lib/utils/datetime.ts.
-- ------------------------------------------------------------
create or replace function public.br_today_start()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select date_trunc('day', now() at time zone 'America/Sao_Paulo')
           at time zone 'America/Sao_Paulo';
$$;

grant execute on function public.br_today_start() to authenticated;

-- ------------------------------------------------------------
-- CATEGORIES: todos leem, so admin escreve
-- ------------------------------------------------------------
drop policy if exists "auth_read_categories"  on public.categories;
drop policy if exists "auth_write_categories" on public.categories;

create policy "auth_read_categories" on public.categories
  for select using (auth.uid() is not null);

create policy "admin_write_categories" on public.categories
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- PRODUCTS: todos leem (PDV + sync offline), so admin escreve.
-- A baixa de estoque da venda nao passa por aqui: quem faz e a
-- create_sale_with_items, que e security definer.
-- ------------------------------------------------------------
drop policy if exists "auth_read_products"  on public.products;
drop policy if exists "auth_write_products" on public.products;

create policy "auth_read_products" on public.products
  for select using (auth.uid() is not null);

create policy "admin_write_products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- SALES: admin le tudo. Funcionario le:
--   1. as vendas de hoje — e exatamente o que a tela /vendas ja
--      mostra pra ele (lockedDay em vendas/page.tsx);
--   2. as vendas fiadas de qualquer data — a tela de clientes e
--      parte do PDV e depende do extrato completo do devedor
--      (getCustomerDetails em src/lib/queries/customers.ts).
-- O historico de dinheiro/PIX/cartao de outros dias deixa de ser
-- visivel pra ele, que era o vazamento.
-- Insert continua restrito ao proprio vendedor; update e delete
-- nao tem policy nenhuma (so a RPC cancel_sale mexe em venda).
-- ------------------------------------------------------------
drop policy if exists "auth_read_sales"    on public.sales;
drop policy if exists "owner_insert_sales" on public.sales;

create policy "admin_or_today_or_fiado_read_sales" on public.sales
  for select using (
    public.is_admin()
    or (
      auth.uid() is not null
      and (
        created_at >= public.br_today_start()
        or payment_method = 'fiado'
      )
    )
  );

create policy "owner_insert_sales" on public.sales
  for insert with check (auth.uid() = seller_id);

-- ------------------------------------------------------------
-- SALE_ITEMS: visibilidade segue a da venda-mae.
-- ------------------------------------------------------------
drop policy if exists "auth_read_sale_items"    on public.sale_items;
drop policy if exists "owner_insert_sale_items" on public.sale_items;

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
            )
          )
        )
    )
  );

create policy "owner_insert_sale_items" on public.sale_items
  for insert with check (
    exists (
      select 1 from public.sales s
      where s.id = sale_id and s.seller_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- CUSTOMERS: todos leem e criam (o PDV cadastra cliente na hora
-- da venda fiada), mas so admin edita e exclui.
-- ------------------------------------------------------------
drop policy if exists "auth_read_customers"  on public.customers;
drop policy if exists "auth_write_customers" on public.customers;

create policy "auth_read_customers" on public.customers
  for select using (auth.uid() is not null);

create policy "auth_insert_customers" on public.customers
  for insert with check (auth.uid() is not null);

create policy "admin_update_customers" on public.customers
  for update using (public.is_admin()) with check (public.is_admin());

create policy "admin_delete_customers" on public.customers
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- DEBT_PAYMENTS: leitura segue autenticado (a tela de fiado e do
-- PDV); insert continua pela RPC record_debt_payment, que grava
-- recorded_by = auth.uid(). Estorno e so admin.
-- ------------------------------------------------------------
drop policy if exists "auth_read_debt_payments"   on public.debt_payments;
drop policy if exists "auth_insert_debt_payments" on public.debt_payments;

create policy "auth_read_debt_payments" on public.debt_payments
  for select using (auth.uid() is not null);

create policy "owner_insert_debt_payments" on public.debt_payments
  for insert with check (auth.uid() = recorded_by);

create policy "admin_delete_debt_payments" on public.debt_payments
  for delete using (public.is_admin());

-- ------------------------------------------------------------
-- A view de saldo passa a rodar com os privilegios de quem invoca,
-- senao ela viraria uma porta de saida para as policies acima.
-- Os totais continuam corretos para o funcionario: a view soma
-- apenas vendas fiadas e debt_payments, que ele enxerga por inteiro.
-- ------------------------------------------------------------
alter view public.customer_balances set (security_invoker = on);
