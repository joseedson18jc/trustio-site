-- O gatilho de proteção revertia as alterações feitas pela própria função request_whatsapp_trial
-- (ela roda com auth.uid() do cliente). A função sinaliza a transação e o gatilho respeita.
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
  end if;
  return new;
end $$;

create or replace function public.request_whatsapp_trial(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'); v_lead public.crm_leads;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if length(v_num) < 10 or length(v_num) > 15 then return jsonb_build_object('ok', false, 'error', 'numero_invalido'); end if;
  select * into v_lead from public.crm_leads where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'error', 'lead_inexistente'); end if;
  perform set_config('trustio.lead_rpc', 'on', true);
  if v_lead.whatsapp_trial_status = 'nao_solicitado' then
    update public.crm_leads
       set whatsapp_numero = v_num, whatsapp_trial_status = 'solicitado', whatsapp_trial_requested_at = now()
     where id = v_lead.id
     returning * into v_lead;
  elsif v_lead.whatsapp_numero is distinct from v_num and v_lead.whatsapp_trial_status = 'solicitado' then
    update public.crm_leads set whatsapp_numero = v_num where id = v_lead.id returning * into v_lead;
  end if;
  perform set_config('trustio.lead_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'status', v_lead.whatsapp_trial_status, 'numero', v_lead.whatsapp_numero,
    'requested_at', v_lead.whatsapp_trial_requested_at, 'started_at', v_lead.whatsapp_trial_started_at, 'ends_at', v_lead.whatsapp_trial_ends_at);
end $$;

create or replace function public.activate_whatsapp_trial(p_lead_id uuid, p_days integer default 3)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'somente administradores'; end if;
  perform set_config('trustio.lead_rpc', 'on', true);
  update public.crm_leads
     set whatsapp_trial_status = 'ativo', whatsapp_trial_started_at = now(), whatsapp_trial_ends_at = now() + make_interval(days => greatest(1, p_days))
   where id = p_lead_id;
  perform set_config('trustio.lead_rpc', 'off', true);
end $$;
