-- Lembrete de oferta automático: cada cadastro novo recebe o lembrete uma vez, sozinho,
-- quando o teste grátis termina ou 3 dias depois do cadastro sem nenhuma pergunta.
-- Quem paga, quem saiu da lista e endereços que devolveram e-mail ficam de fora.
alter table public.crm_lembretes add column if not exists sair_token uuid not null default gen_random_uuid();
alter table public.crm_lembretes add column if not exists tentativas integer not null default 0;
create unique index if not exists crm_lembretes_sair_token on public.crm_lembretes (sair_token);
-- Garantia dura de "uma vez só" no envio automático.
create unique index if not exists crm_lembretes_auto_unico on public.crm_lembretes (lower(email)) where campanha = 'lembrete-oferta-auto';

-- Quem pediu para não receber mais e-mails de oferta (os avisos da conta continuam).
create table if not exists public.crm_email_descadastros (
  email text primary key,
  origem text not null default 'lembrete-oferta',
  criado_em timestamptz not null default now()
);
alter table public.crm_email_descadastros enable row level security;
revoke all on public.crm_email_descadastros from anon, authenticated;

-- Descadastro pelo token que vai no e-mail. Devolve false quando o token não existe.
create or replace function public.crm_lembrete_sair(p_token uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(email) into v_email from crm_lembretes where sair_token = p_token;
  if v_email is null then return false; end if;
  insert into crm_email_descadastros (email) values (v_email) on conflict do nothing;
  return true;
end $$;
revoke all on function public.crm_lembrete_sair(uuid) from public, anon, authenticated;
grant execute on function public.crm_lembrete_sair(uuid) to service_role;

-- Reserva: agora pula quem saiu da lista e desiste depois de 3 tentativas.
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
    update crm_lembretes l set reservado_em = now(), tentativas = l.tentativas + 1
     where l.campanha = v_campanha and l.enviado_em is null and l.tentativas < 3
       and (l.reservado_em is null or l.reservado_em < now() - interval '15 minutes')
       and not exists (select 1 from crm_email_descadastros d where d.email = lower(l.email))
     returning l.*;
end $$;
revoke all on function public.crm_lembrete_reservar(text) from public, anon, authenticated;
grant execute on function public.crm_lembrete_reservar(text) to service_role;

-- Quem entra na fila do envio automático. Só cadastros a partir de 18/11/2026: os mais
-- antigos nunca receberam este lembrete e não devem receber todos de uma vez por surpresa.
create or replace function public.crm_lembrete_elegiveis()
returns table (lead_id uuid, email text, nome text, teste_fim timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, lower(trim(c.email)), c.nome, c.teste_fim
  from crm_leads c
  where c.created_at >= timestamptz '2026-11-18 00:00:00+00'
    and coalesce(c.papel, 'teste') = 'teste'
    and coalesce(c.status, '') not in ('assinante', 'cancelado')
    and coalesce(c.acesso_modo, 'padrao') = 'padrao'
    and c.confirmed_at is not null
    and c.pago_plano is null and c.pago_chat_ate is null and c.pago_agentio_ate is null
    and c.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    and ((c.teste_fim is not null and c.teste_fim <= now())
      or (c.teste_fim is null and c.created_at <= now() - interval '3 days'))
    and not exists (select 1 from crm_lembretes l where l.lead_id = c.id or lower(l.email) = lower(trim(c.email)))
    and not exists (select 1 from crm_email_descadastros d where d.email = lower(trim(c.email)))
    and not exists (select 1 from crm_emails e where e.lead_id = c.id and (e.rejeitado_em is not null or e.reclamado_em is not null))
  order by c.created_at
  limit 40
$$;
revoke all on function public.crm_lembrete_elegiveis() from public, anon, authenticated;

-- Roda de hora em hora. Só envia entre 9h e 20h de Brasília.
create or replace function public.crm_lembrete_automatico()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_hora integer := extract(hour from now() at time zone 'America/Sao_Paulo');
  v_token text;
  v_pendentes integer;
begin
  if v_hora < 9 or v_hora >= 20 then return 0; end if;
  insert into crm_lembretes (campanha, lead_id, email, nome, teste_fim)
  select 'lembrete-oferta-auto', e.lead_id, e.email, e.nome, e.teste_fim from crm_lembrete_elegiveis() e
  on conflict do nothing;
  select count(*) into v_pendentes from crm_lembretes l
   where l.campanha = 'lembrete-oferta-auto' and l.enviado_em is null and l.tentativas < 3
     and (l.reservado_em is null or l.reservado_em < now() - interval '15 minutes')
     and not exists (select 1 from crm_email_descadastros d where d.email = lower(l.email));
  if v_pendentes = 0 then return 0; end if;
  v_token := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into crm_lembrete_disparos (campanha, token_hash, expira_em)
  values ('lembrete-oferta-auto', encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + interval '5 minutes');
  delete from crm_lembrete_disparos where criado_em < now() - interval '7 days';
  perform net.http_post(url := 'https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/lembrete-oferta',
    body := '{}'::jsonb, headers := jsonb_build_object('Content-Type', 'application/json', 'x-trustio-disparo', v_token),
    timeout_milliseconds := 20000);
  return v_pendentes;
end $$;
revoke all on function public.crm_lembrete_automatico() from public, anon, authenticated;

-- cron.schedule com nome substitui o job de mesmo nome: reaplicar não duplica.
select cron.schedule('lembrete-oferta-automatico', '23 * * * *', 'select public.crm_lembrete_automatico()');
