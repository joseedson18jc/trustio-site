-- Trustio · Teste grátis por tempo, nunca por número de perguntas (pedido do José, 25/10/2026).
-- A primeira pergunta abre 3 dias de teste (free_trial_days); durante eles o chat não conta perguntas.
-- Quem já gastou as 5 perguntas do teste antigo ganha os 3 dias na próxima pergunta (teste_fim nulo).
-- free_message_limit fica como está: outros leitores tratam 0 como "sem limite", então não é zerado;
-- reserve_chat_message deixa de usá-lo para barrar. Pagos, liberados, assinantes e equipe: sem mudança.

insert into public.app_settings (key, value) values ('free_trial_days', '3'::jsonb)
on conflict (key) do nothing;

alter table public.crm_leads add column if not exists teste_fim timestamptz;

create or replace function public.free_trial_days()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select greatest(0, (value #>> '{}')::integer) from public.app_settings where key = 'free_trial_days'), 3);
$$;
revoke all on function public.free_trial_days() from public, anon;
grant execute on function public.free_trial_days() to authenticated, service_role;

-- A regra única do teste grátis: ainda não começou, ou ainda não terminou (0 dias = sem teto).
create or replace function public.teste_ativo(p_teste_fim timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select public.free_trial_days() = 0 or p_teste_fim is null or p_teste_fim > now();
$$;
revoke all on function public.teste_ativo(timestamptz) from public, anon;
grant execute on function public.teste_ativo(timestamptz) to authenticated, service_role;

-- teste_fim só muda pelas RPCs (reserva, devolução, reinício da cota). Fora delas, volta ao valor anterior.
create or replace function public.guard_teste_fim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('trustio.teste_rpc', true) is distinct from 'on' then
    if tg_op = 'INSERT' then new.teste_fim := null; else new.teste_fim := old.teste_fim; end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_teste_fim() from public, anon, authenticated;
drop trigger if exists crm_leads_guard_teste on public.crm_leads;
create trigger crm_leads_guard_teste before insert or update on public.crm_leads
  for each row execute function public.guard_teste_fim();

-- Mesmo corpo de 20261025180000: só a condição da cota, o início do teste e os campos trial_* mudam.
create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
  v_dias integer := public.free_trial_days();
  v_lead public.crm_leads;
  v_email text;
  v_livre boolean;
  v_anterior public.crm_leads;
begin
  if not public.conta_acesso_permitido(p_user_id) then
    return jsonb_build_object('ok',false,'error','acesso_revogado');
  end if;
  select * into v_lead from public.crm_leads where user_id = p_user_id for update;
  if not found then
    select email into v_email from auth.users where id = p_user_id;
    if v_email is null then
      return jsonb_build_object('ok', false, 'error', 'lead_inexistente');
    end if;
    insert into public.crm_leads (user_id, email, origem, status)
    values (p_user_id, v_email, 'app', 'email_confirmado')
    on conflict (lower(email)) do update set user_id = excluded.user_id
    returning * into v_lead;
  end if;

  if v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login')
    or (v_lead.status = 'cancelado' and v_lead.acesso_modo <> 'liberado')
    or (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
    or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now()) then
    return jsonb_build_object('ok',false,'error','acesso_revogado');
  end if;
  v_anterior := v_lead;
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads
     set mensagens_usadas = mensagens_usadas + 1,
         status = case when status = 'assinante' then status else 'ativo' end,
         last_seen_at = now(),
         -- O teste grátis começa na primeira pergunta e dura free_trial_days (não conta perguntas).
         teste_fim = case when teste_fim is null and v_dias > 0 then now() + make_interval(days => v_dias) else teste_fim end
   where id = v_lead.id
     and acesso_modo not in ('revogado','bloqueado','bloqueado_login')
     and (status <> 'cancelado' or acesso_modo='liberado')
     and (acesso_inicio is null or acesso_inicio<=now()) and (acesso_fim is null or acesso_fim>now())
     and (acesso_modo = 'liberado' or status = 'assinante' or papel in ('admin', 'colaborador', 'cliente')
          or coalesce(pago_chat_ate > now(), false)
          or public.teste_ativo(teste_fim))
  returning * into v_lead;

  if not found then
    v_lead := v_anterior;
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit,
                              'trial_ends_at', v_lead.teste_fim, 'trial_days', v_dias);
  end if;

  v_livre := v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente')
          or coalesce(v_lead.pago_chat_ate > now(), false);

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'used', v_lead.mensagens_usadas,
    'limit', 0,
    'subscriber', v_livre,
    -- Sem contagem de perguntas: remaining fica null (clientes antigos escondem o contador).
    'remaining', null,
    'trial_ends_at', case when v_livre then null else v_lead.teste_fim end,
    'trial_days', v_dias
  );
end $$;
revoke all on function public.reserve_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.reserve_chat_message(uuid) to service_role;

-- Resposta que falhou devolve a pergunta; se era a primeira, o relógio do teste não começa.
create or replace function public.release_chat_message(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads
     set mensagens_usadas = greatest(0, mensagens_usadas - 1),
         teste_fim = case when greatest(0, mensagens_usadas - 1) = 0 then null else teste_fim end,
         status = case when status = 'trial_esgotado' and public.teste_ativo(teste_fim) then 'ativo' else status end
   where id = p_lead_id;
end $$;
revoke all on function public.release_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.release_chat_message(uuid) to service_role;

-- Reiniciar a cota no CRM reinicia também os 3 dias (mesmo corpo de 20261010160000 + teste_fim).
create or replace function public.crm_reiniciar_cota(p_lead_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Somente administrador' using errcode='42501'; end if;
  if nullif(trim(p_motivo),'') is null or length(p_motivo)>500 then raise exception 'Informe um motivo de até 500 caracteres'; end if;
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads set mensagens_usadas=0, teste_fim=null,
    status=case when status='trial_esgotado' then 'email_confirmado' else status end where id=p_lead_id;
  if not found then raise exception 'Lead não encontrado'; end if;
  insert into public.crm_eventos(lead_id,autor,autor_email,campo,para)
    select p_lead_id,auth.uid(),email,'cota_reiniciada',trim(p_motivo) from auth.users where id=auth.uid();
end $$;
revoke all on function public.crm_reiniciar_cota(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_reiniciar_cota(uuid,text) to authenticated;
