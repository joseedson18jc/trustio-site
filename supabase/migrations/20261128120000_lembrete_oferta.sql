-- Lembrete de oferta por e-mail (envio pontual, pedido pelo dono do produto).
-- crm_lembretes é a fila: uma linha por destinatário e campanha, com o resultado do envio.
-- crm_lembrete_disparos guarda só o hash de um token de uso único que autoriza um disparo.
-- As duas tabelas ficam fechadas por RLS sem política: só o service role (a função
-- lembrete-oferta) e o dono do banco leem ou gravam.
create table if not exists public.crm_lembretes (
  id uuid primary key default gen_random_uuid(),
  campanha text not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  email text not null,
  nome text,
  teste_fim timestamptz,
  reservado_em timestamptz,
  enviado_em timestamptz,
  provider_id text,
  erro text,
  criado_em timestamptz not null default now()
);
create unique index if not exists crm_lembretes_unico on public.crm_lembretes (campanha, lower(email), coalesce(teste_fim, 'epoch'::timestamptz));
alter table public.crm_lembretes enable row level security;

create table if not exists public.crm_lembrete_disparos (
  id uuid primary key default gen_random_uuid(),
  campanha text not null,
  token_hash text not null unique,
  expira_em timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.crm_lembrete_disparos enable row level security;
revoke all on public.crm_lembretes, public.crm_lembrete_disparos from anon, authenticated;

-- Consome o token (uma vez só) e reserva as linhas pendentes da campanha dele.
create or replace function public.crm_lembrete_reservar(p_token_hash text)
returns setof public.crm_lembretes
language plpgsql security definer set search_path = public as $$
declare v_campanha text;
begin
  update crm_lembrete_disparos set usado_em = now()
   where token_hash = p_token_hash and usado_em is null and expira_em > now()
   returning campanha into v_campanha;
  if v_campanha is null then return; end if;
  return query
    update crm_lembretes l set reservado_em = now()
     where l.campanha = v_campanha and l.enviado_em is null
       and (l.reservado_em is null or l.reservado_em < now() - interval '15 minutes')
     returning l.*;
end $$;
revoke all on function public.crm_lembrete_reservar(text) from public, anon, authenticated;
grant execute on function public.crm_lembrete_reservar(text) to service_role;
