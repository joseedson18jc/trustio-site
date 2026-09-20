-- Widgets de boas-vindas pós-login e teste de 3 dias do agente no WhatsApp.
alter table public.crm_leads
  add column if not exists onboarding_seen_at timestamptz,
  add column if not exists whatsapp_numero text,
  add column if not exists whatsapp_trial_status text not null default 'nao_solicitado'
    check (whatsapp_trial_status in ('nao_solicitado','solicitado','ativo','encerrado')),
  add column if not exists whatsapp_trial_requested_at timestamptz,
  add column if not exists whatsapp_trial_started_at timestamptz,
  add column if not exists whatsapp_trial_ends_at timestamptz;

create index if not exists crm_leads_whatsapp_idx on public.crm_leads (whatsapp_trial_status, whatsapp_trial_requested_at desc);

-- O cliente não altera os campos do teste diretamente: só pelas funções abaixo.
create or replace function public.guard_lead_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if not public.is_admin() and auth.uid() is not null then
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at;
    new.whatsapp_trial_status := old.whatsapp_trial_status;
    new.whatsapp_trial_requested_at := old.whatsapp_trial_requested_at;
    new.whatsapp_trial_started_at := old.whatsapp_trial_started_at;
    new.whatsapp_trial_ends_at := old.whatsapp_trial_ends_at;
  end if;
  return new;
end $$;

-- Marca que o cliente viu os widgets de instrução.
create or replace function public.mark_onboarding_seen()
returns void language sql security definer set search_path = public as $$
  update public.crm_leads set onboarding_seen_at = coalesce(onboarding_seen_at, now()) where user_id = auth.uid();
$$;

-- Pede os 3 dias do agente no WhatsApp (uma vez por conta). Devolve o estado atual.
create or replace function public.request_whatsapp_trial(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'); v_lead public.crm_leads;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if length(v_num) < 10 or length(v_num) > 15 then return jsonb_build_object('ok', false, 'error', 'numero_invalido'); end if;
  select * into v_lead from public.crm_leads where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'lead_inexistente'); end if;
  if v_lead.whatsapp_trial_status = 'nao_solicitado' then
    update public.crm_leads
       set whatsapp_numero = v_num, whatsapp_trial_status = 'solicitado', whatsapp_trial_requested_at = now()
     where id = v_lead.id
     returning * into v_lead;
  elsif v_lead.whatsapp_numero is distinct from v_num and v_lead.whatsapp_trial_status = 'solicitado' then
    update public.crm_leads set whatsapp_numero = v_num where id = v_lead.id returning * into v_lead;
  end if;
  return jsonb_build_object('ok', true, 'status', v_lead.whatsapp_trial_status, 'numero', v_lead.whatsapp_numero,
    'requested_at', v_lead.whatsapp_trial_requested_at, 'started_at', v_lead.whatsapp_trial_started_at, 'ends_at', v_lead.whatsapp_trial_ends_at);
end $$;

-- Admin ativa o teste: 3 dias a partir de agora.
create or replace function public.activate_whatsapp_trial(p_lead_id uuid, p_days integer default 3)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'somente administradores'; end if;
  update public.crm_leads
     set whatsapp_trial_status = 'ativo', whatsapp_trial_started_at = now(), whatsapp_trial_ends_at = now() + make_interval(days => greatest(1, p_days))
   where id = p_lead_id;
end $$;

revoke execute on function public.mark_onboarding_seen() from public, anon;
revoke execute on function public.request_whatsapp_trial(text) from public, anon;
revoke execute on function public.activate_whatsapp_trial(uuid, integer) from public, anon;
grant execute on function public.mark_onboarding_seen() to authenticated;
grant execute on function public.request_whatsapp_trial(text) to authenticated;
grant execute on function public.activate_whatsapp_trial(uuid, integer) to authenticated;

-- A view usa l.*: recria para incluir as colunas novas.
drop view if exists public.crm_overview;
create view public.crm_overview with (security_invoker = true) as
select
  l.*,
  (select count(*) from public.conversations c where c.user_id = l.user_id) as conversas,
  (select max(m.created_at) from public.messages m where m.user_id = l.user_id) as ultima_mensagem
from public.crm_leads l;
grant select on public.crm_overview to authenticated;
