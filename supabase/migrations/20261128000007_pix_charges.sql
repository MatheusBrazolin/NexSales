-- ============================================================
-- Cobranca Pix com baixa automatica
-- ============================================================
--
-- O QUE EXISTE HOJE
-- -----------------
-- "PIX" e so um rotulo. O caixa marca a forma, confere no celular se o
-- dinheiro caiu, e finaliza na confianca. Em hora de movimento, a
-- conferencia some — e e assim que uma venda e dada como paga sem ter
-- sido.
--
-- O MODELO
-- --------
-- Uma cobranca por venda, com QR dinamico e identificador proprio. A
-- venda so fecha quando o provedor confirma.
--
-- DUAS REGRAS QUE VIERAM DA PESQUISA, E QUE A MAIORIA DAS INTEGRACOES
-- ERRA
--
-- 1. O CORPO DO WEBHOOK NUNCA E PROVA DE PAGAMENTO. Ele e apenas um
--    aviso de "olhe esta cobranca". O status e sempre reconfirmado
--    consultando a API do provedor com a chave da loja. Aceitar o corpo
--    como verdade e aceitar que qualquer um que descubra a URL marque
--    vendas como pagas.
--
-- 2. O webhook pode nao chegar. Entao existe consulta de reserva: a tela
--    pergunta o status enquanto espera.
--
-- `provider_charge_id` e unico: a mesma notificacao processada duas vezes
-- nao pode dar baixa duas vezes.
-- ============================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'pix_charge_status') then
    create type public.pix_charge_status as enum ('pending', 'paid', 'expired', 'cancelled');
  end if;
end $$;

create table if not exists public.pix_charges (
  id                  uuid primary key default gen_random_uuid(),
  -- Chave de idempotencia da venda que ainda vai existir. A venda so e
  -- criada depois da confirmacao, entao aqui nao ha sale_id ainda.
  client_uuid         uuid not null unique,
  sale_id             uuid references public.sales(id) on delete set null,
  amount              numeric(12,2) not null check (amount > 0),
  provider            text not null,
  provider_charge_id  text,
  status              public.pix_charge_status not null default 'pending',
  qr_code             text,
  qr_code_base64      text,
  paid_at             timestamptz,
  expires_at          timestamptz,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Unico por provedor: impede que a mesma notificacao de baixa seja
-- processada duas vezes como se fossem duas cobrancas.
create unique index if not exists idx_pix_charges_provider_id
  on public.pix_charges (provider, provider_charge_id)
  where provider_charge_id is not null;

create index if not exists idx_pix_charges_status  on public.pix_charges (status);
create index if not exists idx_pix_charges_created on public.pix_charges (created_at desc);

drop trigger if exists trg_pix_charges_updated_at on public.pix_charges;
create trigger trg_pix_charges_updated_at
  before update on public.pix_charges
  for each row execute function public.set_updated_at();

alter table public.pix_charges enable row level security;

-- O operador le a propria cobranca para a tela saber quando liberar a
-- venda. A escrita e toda feita pelo servidor (service role), que nao
-- passa por RLS: a confirmacao de pagamento nao pode depender de nada
-- que venha do navegador.
drop policy if exists "read_own_pix_charges" on public.pix_charges;
create policy "read_own_pix_charges" on public.pix_charges
  for select using (
    public.is_admin()
    or (auth.uid() is not null and created_by = auth.uid())
  );
