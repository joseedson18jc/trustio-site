-- Teste de 3 dias do Agentio: quando o status do WhatsApp vira "ativo" no CRM (pelo botão
-- "Ativar 3 dias" ou pelo seletor), a pessoa recebe automaticamente um e-mail com as instruções
-- e uma mensagem no WhatsApp. Quem envia é a função aviso-agente, chamada pelo próprio banco.
--
-- A URL da função e o segredo compartilhado ficam no Vault (fora do repositório):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/aviso-agente', 'aviso_agente_url');
--   select vault.create_secret('<mesmo valor do segredo AVISOS_SEGREDO da função>', 'aviso_agente_segredo');
-- Sem eles, a ativação funciona normalmente e nada é enviado.

create extension if not exists pg_net with schema extensions;

-- Por canal (e-mail e WhatsApp): quando o aviso saiu de fato (_em), a reserva de um envio em
-- andamento (_reserva, que expira em 2 minutos se a função cair no meio) e o motivo da última
-- falha (_erro). O CRM mostra isso, e a reserva impede aviso em dobro.
alter table public.crm_leads
  add column if not exists whatsapp_aviso_email_em timestamptz,
  add column if not exists whatsapp_aviso_email_reserva timestamptz,
  add column if not exists whatsapp_aviso_email_erro text,
  add column if not exists whatsapp_aviso_wa_em timestamptz,
  add column if not exists whatsapp_aviso_wa_reserva timestamptz,
  add column if not exists whatsapp_aviso_wa_erro text;

-- O cliente não altera os campos do aviso.
create or replace function public.guard_lead_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('trustio.lead_rpc', true) = 'on' then return new; end if;
  if not public.is_admin() and auth.uid() is not null then
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at;
    new.whatsapp_trial_status := old.whatsapp_trial_status;
    new.whatsapp_trial_requested_at := old.whatsapp_trial_requested_at;
    new.whatsapp_trial_started_at := old.whatsapp_trial_started_at;
    new.whatsapp_trial_ends_at := old.whatsapp_trial_ends_at;
    new.whatsapp_aviso_email_em := old.whatsapp_aviso_email_em;
    new.whatsapp_aviso_email_reserva := old.whatsapp_aviso_email_reserva;
    new.whatsapp_aviso_email_erro := old.whatsapp_aviso_email_erro;
    new.whatsapp_aviso_wa_em := old.whatsapp_aviso_wa_em;
    new.whatsapp_aviso_wa_reserva := old.whatsapp_aviso_wa_reserva;
    new.whatsapp_aviso_wa_erro := old.whatsapp_aviso_wa_erro;
  end if;
  return new;
end $$;

-- Ativar também serve para quem ainda não pediu, desde que tenha telefone: o número do
-- cadastro vira o número do teste.
create or replace function public.activate_whatsapp_trial(p_lead_id uuid, p_days integer default 3)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'somente administradores'; end if;
  perform set_config('trustio.lead_rpc', 'on', true);
  update public.crm_leads
     set whatsapp_trial_status = 'ativo',
         whatsapp_numero = coalesce(whatsapp_numero, nullif(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), '')),
         whatsapp_trial_started_at = now(),
         whatsapp_trial_ends_at = now() + make_interval(days => greatest(1, p_days))
   where id = p_lead_id;
  perform set_config('trustio.lead_rpc', 'off', true);
end $$;

-- Toda nova ativação começa com os avisos zerados (reservas e erros da anterior não valem).
-- Ativado pelo seletor do CRM (sem passar pela função acima), o período começa agora e dura o
-- número de dias configurado no painel (hermes_trial_dias, padrão 3).
create or replace function public.whatsapp_trial_inicio()
returns trigger language plpgsql set search_path = public as $$
declare v_dias integer;
begin
  if new.whatsapp_trial_status = 'ativo' and old.whatsapp_trial_status is distinct from 'ativo' then
    new.whatsapp_aviso_email_reserva := null; new.whatsapp_aviso_email_erro := null;
    new.whatsapp_aviso_wa_reserva := null; new.whatsapp_aviso_wa_erro := null;
    if new.whatsapp_trial_started_at is not distinct from old.whatsapp_trial_started_at then
      select coalesce((value #>> '{}')::integer, 3) into v_dias from public.app_settings where key = 'hermes_trial_dias';
      new.whatsapp_trial_started_at := now();
      new.whatsapp_trial_ends_at := now() + make_interval(days => greatest(1, coalesce(v_dias, 3)));
      new.whatsapp_numero := coalesce(new.whatsapp_numero, nullif(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), ''));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_whatsapp_inicio on public.crm_leads;
create trigger crm_leads_whatsapp_inicio before update of whatsapp_trial_status on public.crm_leads
  for each row execute function public.whatsapp_trial_inicio();

-- Chama a função de aviso para um lead (assíncrono: quem ativou não espera o envio).
create or replace function public.aviso_agente_chamar(p_lead_id uuid)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_segredo text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'aviso_agente_url';
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'aviso_agente_segredo';
  if v_url is null or v_segredo is null then
    raise log 'aviso-agente: url ou segredo ausente no Vault; lead % sem aviso', p_lead_id;
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('lead_id', p_lead_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-trustio-segredo', v_segredo),
    timeout_milliseconds := 20000
  );
  return true;
end $$;

-- Na transição para "ativo", depois de gravar.
create or replace function public.whatsapp_trial_avisar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.whatsapp_trial_status = 'ativo' and old.whatsapp_trial_status is distinct from 'ativo' then
    perform public.aviso_agente_chamar(new.id);
  end if;
  return new;
end $$;

-- Botão "Reenviar avisos" do CRM: nova tentativa para quem está ativo (a chamada não chegou, ou o
-- Resend ou a Evolution falharam). A função só manda o que ainda não saiu nesta ativação.
create or replace function public.reenviar_aviso_whatsapp(p_lead_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'somente administradores'; end if;
  if not exists (select 1 from public.crm_leads where id = p_lead_id and whatsapp_trial_status = 'ativo') then
    raise exception 'o teste deste lead não está ativo';
  end if;
  return public.aviso_agente_chamar(p_lead_id);
end $$;

-- Colunas de um canal. Só aceita os dois canais conhecidos (os nomes entram no SQL dinâmico).
create or replace function public.aviso_colunas(p_canal text, out c_em text, out c_reserva text, out c_erro text)
language plpgsql immutable as $$
declare v_p text;
begin
  v_p := case p_canal when 'email' then 'whatsapp_aviso_email' when 'whatsapp' then 'whatsapp_aviso_wa' end;
  if v_p is null then raise exception 'canal desconhecido: %', p_canal; end if;
  c_em := v_p || '_em'; c_reserva := v_p || '_reserva'; c_erro := v_p || '_erro';
end $$;

-- Reserva o envio de um canal para a ativação que a chamada viu (p_inicio), de forma atômica:
-- de duas chamadas simultâneas, só uma envia. Não reserva se o aviso já saiu nesta ativação ou
-- se outra chamada está enviando (reserva com menos de 2 minutos). Devolve a marca, ou null.
create or replace function public.aviso_reservar(p_lead_id uuid, p_canal text, p_inicio timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c record; v_marca timestamptz := clock_timestamp(); v_ok uuid;
begin
  select * into c from public.aviso_colunas(p_canal);
  execute format(
    'update public.crm_leads set %2$I = $2
      where id = $1 and whatsapp_trial_status = ''ativo'' and whatsapp_trial_started_at = $3
        and (%1$I is null or %1$I < whatsapp_trial_started_at)
        and (%2$I is null or %2$I < $2 - interval ''2 minutes'')
      returning id', c.c_em, c.c_reserva)
    into v_ok using p_lead_id, v_marca, p_inicio;
  return case when v_ok is null then null else v_marca end;
end $$;

-- Fecha a própria reserva: sem erro, o aviso saiu; com erro, a reserva é desfeita (o "Reenviar
-- avisos" pode tentar de novo) e o motivo fica gravado. Uma chamada cuja reserva expirou e foi
-- tomada por outra, ou que é de uma ativação anterior, não mexe em nada.
create or replace function public.aviso_concluir(p_lead_id uuid, p_canal text, p_marca timestamptz, p_erro text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.aviso_colunas(p_canal);
  if p_erro is null then
    execute format('update public.crm_leads set %1$I = clock_timestamp(), %2$I = null, %3$I = null where id = $1 and %2$I = $2',
      c.c_em, c.c_reserva, c.c_erro) using p_lead_id, p_marca;
  else
    execute format('update public.crm_leads set %2$I = null, %3$I = left($3, 300) where id = $1 and %2$I = $2',
      c.c_em, c.c_reserva, c.c_erro) using p_lead_id, p_marca, p_erro;
  end if;
end $$;

-- Motivo de um canal que nem chegou a ser tentado (configuração faltando), só para a ativação
-- que a chamada viu e se o aviso ainda não saiu nem está saindo.
create or replace function public.aviso_falta(p_lead_id uuid, p_canal text, p_inicio timestamptz, p_erro text)
returns void language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.aviso_colunas(p_canal);
  execute format(
    'update public.crm_leads set %3$I = left($3, 300)
      where id = $1 and whatsapp_trial_status = ''ativo'' and whatsapp_trial_started_at = $2
        and (%1$I is null or %1$I < whatsapp_trial_started_at)
        and (%2$I is null or %2$I < clock_timestamp() - interval ''2 minutes'')', c.c_em, c.c_reserva, c.c_erro)
    using p_lead_id, p_inicio, p_erro;
end $$;

revoke execute on function public.aviso_agente_chamar(uuid) from public, anon, authenticated;
revoke execute on function public.whatsapp_trial_avisar() from public, anon, authenticated;
revoke execute on function public.whatsapp_trial_inicio() from public, anon, authenticated;
revoke execute on function public.aviso_colunas(text) from public, anon, authenticated;
revoke execute on function public.aviso_reservar(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.aviso_concluir(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.aviso_falta(uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.aviso_reservar(uuid, text, timestamptz) to service_role;
grant execute on function public.aviso_concluir(uuid, text, timestamptz, text) to service_role;
grant execute on function public.aviso_falta(uuid, text, timestamptz, text) to service_role;
revoke execute on function public.reenviar_aviso_whatsapp(uuid) from public, anon;
grant execute on function public.reenviar_aviso_whatsapp(uuid) to authenticated;

drop trigger if exists crm_leads_whatsapp_aviso on public.crm_leads;
create trigger crm_leads_whatsapp_aviso after update of whatsapp_trial_status on public.crm_leads
  for each row execute function public.whatsapp_trial_avisar();

-- A view lista as colunas uma a uma (o token de opt-in fica de fora); entram as do aviso.
drop view if exists public.crm_overview;
create view public.crm_overview with (security_invoker = true) as
select
  l.id, l.user_id, l.nome, l.email, l.telefone, l.tipo, l.empresa, l.segmento, l.origem, l.status, l.plano,
  l.mensagens_usadas, l.notas, l.confirmed_at, l.last_seen_at, l.created_at, l.updated_at, l.onboarding_seen_at,
  l.whatsapp_numero, l.whatsapp_trial_status, l.whatsapp_trial_requested_at, l.whatsapp_trial_started_at,
  l.whatsapp_trial_ends_at, l.whatsapp_aviso_email_em, l.whatsapp_aviso_email_reserva, l.whatsapp_aviso_email_erro,
  l.whatsapp_aviso_wa_em, l.whatsapp_aviso_wa_reserva, l.whatsapp_aviso_wa_erro,
  (select count(*) from public.conversations c where c.user_id = l.user_id) as conversas,
  (select max(m.created_at) from public.messages m where m.user_id = l.user_id) as ultima_mensagem
from public.crm_leads l;
grant select on public.crm_overview to authenticated;
