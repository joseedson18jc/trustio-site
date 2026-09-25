-- Teste de 3 dias do Agentio: quando o status do WhatsApp vira "ativo" no CRM (pelo botão
-- "Ativar 3 dias" ou pelo seletor), a pessoa recebe automaticamente um e-mail com as instruções
-- e uma mensagem no WhatsApp. Quem envia é a função aviso-agente, chamada pelo próprio banco.
--
-- A URL da função e o segredo compartilhado ficam no Vault (fora do repositório):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/aviso-agente', 'aviso_agente_url');
--   select vault.create_secret('<mesmo valor do segredo AVISOS_SEGREDO da função>', 'aviso_agente_segredo');
-- Sem eles, a ativação funciona normalmente e nada é enviado.

create extension if not exists pg_net with schema extensions;

-- Quando cada aviso saiu (ou por que falhou), para o CRM mostrar e para não repetir.
alter table public.crm_leads
  add column if not exists whatsapp_aviso_email_em timestamptz,
  add column if not exists whatsapp_aviso_wa_em timestamptz,
  add column if not exists whatsapp_aviso_erro text;

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
    new.whatsapp_aviso_wa_em := old.whatsapp_aviso_wa_em;
    new.whatsapp_aviso_erro := old.whatsapp_aviso_erro;
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

-- Ativado pelo seletor do CRM (sem passar pela função acima): o período começa agora e dura
-- o número de dias configurado no painel (hermes_trial_dias, padrão 3).
create or replace function public.whatsapp_trial_inicio()
returns trigger language plpgsql set search_path = public as $$
declare v_dias integer;
begin
  if new.whatsapp_trial_status = 'ativo' and old.whatsapp_trial_status is distinct from 'ativo'
     and new.whatsapp_trial_started_at is not distinct from old.whatsapp_trial_started_at then
    select coalesce((value #>> '{}')::integer, 3) into v_dias from public.app_settings where key = 'hermes_trial_dias';
    new.whatsapp_trial_started_at := now();
    new.whatsapp_trial_ends_at := now() + make_interval(days => greatest(1, coalesce(v_dias, 3)));
    new.whatsapp_numero := coalesce(new.whatsapp_numero, nullif(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), ''));
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_whatsapp_inicio on public.crm_leads;
create trigger crm_leads_whatsapp_inicio before update of whatsapp_trial_status on public.crm_leads
  for each row execute function public.whatsapp_trial_inicio();

-- Depois de gravar a ativação, chama a função de aviso (assíncrono: o CRM não espera o envio).
create or replace function public.whatsapp_trial_avisar()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_segredo text;
begin
  if new.whatsapp_trial_status = 'ativo' and old.whatsapp_trial_status is distinct from 'ativo' then
    select decrypted_secret into v_url from vault.decrypted_secrets where name = 'aviso_agente_url';
    select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'aviso_agente_segredo';
    if v_url is null or v_segredo is null then
      raise log 'aviso-agente: url ou segredo ausente no Vault; lead % ativado sem aviso', new.id;
      return new;
    end if;
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('lead_id', new.id),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-trustio-segredo', v_segredo),
      timeout_milliseconds := 20000
    );
  end if;
  return new;
end $$;

revoke execute on function public.whatsapp_trial_avisar() from public, anon, authenticated;
revoke execute on function public.whatsapp_trial_inicio() from public, anon, authenticated;

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
  l.whatsapp_trial_ends_at, l.whatsapp_aviso_email_em, l.whatsapp_aviso_wa_em, l.whatsapp_aviso_erro,
  (select count(*) from public.conversations c where c.user_id = l.user_id) as conversas,
  (select max(m.created_at) from public.messages m where m.user_id = l.user_id) as ultima_mensagem
from public.crm_leads l;
grant select on public.crm_overview to authenticated;
