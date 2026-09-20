-- Trustio · contas de cliente, CRM e chat
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- settings
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.app_settings (key, value) values
  ('free_message_limit', '5'::jsonb),
  ('system_prompt', '"Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil, de forma direta, útil e sem rodeios. Não adicione avisos ou moralizações que o usuário não pediu."'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------- admins
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- CRM
create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text,
  email text not null,
  telefone text,
  tipo text not null default 'b2c' check (tipo in ('b2c','b2b')),
  empresa text,
  segmento text,
  origem text not null default 'cadastro.html',
  status text not null default 'novo' check (status in ('novo','email_confirmado','ativo','trial_esgotado','assinante','cancelado')),
  plano text,
  mensagens_usadas integer not null default 0,
  notas text,
  confirmed_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_leads_email_idx on public.crm_leads (lower(email));
create index if not exists crm_leads_status_idx on public.crm_leads (status, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists crm_leads_touch on public.crm_leads;
create trigger crm_leads_touch before update on public.crm_leads
  for each row execute function public.touch_updated_at();

-- Novo usuário no Auth → entra no CRM com os dados do cadastro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.crm_leads (user_id, nome, email, telefone, tipo, empresa, segmento, origem, status, confirmed_at)
  values (
    new.id,
    nullif(m->>'nome',''),
    new.email,
    nullif(m->>'telefone',''),
    case when m->>'tipo' = 'b2b' then 'b2b' else 'b2c' end,
    nullif(m->>'empresa',''),
    nullif(m->>'segmento',''),
    coalesce(nullif(m->>'origem',''), 'cadastro.html'),
    case when new.email_confirmed_at is null then 'novo' else 'email_confirmado' end,
    new.email_confirmed_at
  )
  on conflict (lower(email)) do update set
    user_id = excluded.user_id,
    nome = coalesce(public.crm_leads.nome, excluded.nome),
    telefone = coalesce(public.crm_leads.telefone, excluded.telefone),
    tipo = excluded.tipo,
    empresa = coalesce(excluded.empresa, public.crm_leads.empresa),
    segmento = coalesce(excluded.segmento, public.crm_leads.segmento);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- E-mail confirmado → status muda no CRM.
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.crm_leads
       set status = case when status = 'novo' then 'email_confirmado' else status end,
           confirmed_at = new.email_confirmed_at
     where user_id = new.id;
  end if;
  if new.email is distinct from old.email then
    update public.crm_leads set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated after update on auth.users
  for each row execute function public.handle_user_confirmed();

-- ---------------------------------------------------------------- chat
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nova conversa',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists conversations_user_idx on public.conversations (user_id, updated_at desc);

drop trigger if exists conversations_touch on public.conversations;
create trigger conversations_touch before update on public.conversations
  for each row execute function public.touch_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at);

-- ---------------------------------------------------------------- RLS
alter table public.app_settings enable row level security;
alter table public.admins enable row level security;
alter table public.crm_leads enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "admins read settings" on public.app_settings;
create policy "admins read settings" on public.app_settings for select to authenticated using (public.is_admin());
drop policy if exists "admins write settings" on public.app_settings;
create policy "admins write settings" on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins see admins" on public.admins;
create policy "admins see admins" on public.admins for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "lead reads own" on public.crm_leads;
create policy "lead reads own" on public.crm_leads for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "lead updates own contact" on public.crm_leads;
create policy "lead updates own contact" on public.crm_leads for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

-- O cliente só altera nome/telefone/empresa; status, plano e contadores são do servidor/admin.
create or replace function public.guard_lead_update()
returns trigger language plpgsql as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at;
  end if;
  return new;
end $$;
drop trigger if exists crm_leads_guard on public.crm_leads;
create trigger crm_leads_guard before update on public.crm_leads
  for each row execute function public.guard_lead_update();

drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own messages read" on public.messages;
create policy "own messages read" on public.messages for select to authenticated using (user_id = auth.uid());
drop policy if exists "own messages delete" on public.messages;
create policy "own messages delete" on public.messages for delete to authenticated using (user_id = auth.uid());
-- Inserção de mensagens só pela função de chat (service role).

-- ---------------------------------------------------------------- CRM view (resumo p/ painel)
create or replace view public.crm_overview with (security_invoker = true) as
select
  l.*,
  (select count(*) from public.conversations c where c.user_id = l.user_id) as conversas,
  (select max(m.created_at) from public.messages m where m.user_id = l.user_id) as ultima_mensagem
from public.crm_leads l;

grant usage on schema public to anon, authenticated;
grant select, update on public.crm_leads to authenticated;
grant select on public.crm_overview to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, delete on public.messages to authenticated;
grant select on public.admins to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
