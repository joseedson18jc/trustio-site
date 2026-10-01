-- Trustio · funil primeiro-party (signup_start → signup_complete → trial_activated).
-- O Web Analytics do Cloudflare só conta pageviews (não aceita eventos customizados) e o
-- WhatsApp in-app reporta como "direct"; estes eventos ficam aqui, gravados pelo site com a
-- chave publishable, e o funil se conta direto no banco (count por evento/dia) ou no /crm.
--
-- RLS: qualquer visitante pode GRAVAR um evento (com o formato certo); ninguém lê, exceto admins.

create table if not exists public.eventos_funil (
  id        uuid primary key default extensions.gen_random_uuid(),
  evento    text not null check (evento in ('signup_start', 'signup_complete', 'trial_activated')),
  meta      jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists eventos_funil_evento_idx
  on public.eventos_funil (evento, criado_em desc);

alter table public.eventos_funil enable row level security;

drop policy if exists "site grava eventos do funil" on public.eventos_funil;
create policy "site grava eventos do funil" on public.eventos_funil
  for insert to anon, authenticated with check (true);

drop policy if exists "admins leem eventos do funil" on public.eventos_funil;
create policy "admins leem eventos do funil" on public.eventos_funil
  for select to authenticated using (public.is_admin());
