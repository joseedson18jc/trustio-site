-- Trustio · Ritmo do teste grátis (25/10/2026). O teste é por tempo (20261025210000), então uma conta de
-- teste poderia mandar perguntas sem parar e ocupar o único modelo do servidor. Sem contar perguntas:
--   1. uma pergunta por vez: enquanto a resposta não termina, a próxima volta com aguarde_resposta;
--   2. um intervalo de 5 s entre o início de duas perguntas (aguarde_intervalo).
-- Pagos, liberados, assinantes e equipe: sem ritmo. A trava (em_andamento_ate) vence sozinha em 180 s,
-- para uma falha no meio da resposta nunca prender a conta.

alter table public.crm_leads add column if not exists em_andamento_ate timestamptz;
alter table public.crm_leads add column if not exists ultima_pergunta_em timestamptz;

-- As três colunas do teste só mudam pelas RPCs. Fora delas, voltam ao valor anterior.
create or replace function public.guard_teste_fim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('trustio.teste_rpc', true) is distinct from 'on' then
    if tg_op = 'INSERT' then
      new.teste_fim := null; new.em_andamento_ate := null; new.ultima_pergunta_em := null;
    else
      new.teste_fim := old.teste_fim; new.em_andamento_ate := old.em_andamento_ate;
      new.ultima_pergunta_em := old.ultima_pergunta_em;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_teste_fim() from public, anon, authenticated;

-- Mesmo corpo de 20261025210000, mais o ritmo antes da reserva e a trava gravada junto com ela.
create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
  v_dias integer := public.free_trial_days();
  v_intervalo constant interval := interval '5 seconds';
  v_trava constant interval := interval '180 seconds';
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

  v_livre := v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente')
          or coalesce(v_lead.pago_chat_ate > now(), false);

  -- Ritmo só no teste ainda aberto: teste vencido segue para trial_esgotado logo abaixo.
  if not v_livre and public.teste_ativo(v_lead.teste_fim) then
    if v_lead.em_andamento_ate > now() then
      return jsonb_build_object('ok', false, 'error', 'aguarde_resposta',
        'retry_after', greatest(1, ceil(extract(epoch from v_lead.em_andamento_ate - now())))::integer);
    end if;
    if v_lead.ultima_pergunta_em > now() - v_intervalo then
      return jsonb_build_object('ok', false, 'error', 'aguarde_intervalo',
        'retry_after', greatest(1, ceil(extract(epoch from v_lead.ultima_pergunta_em + v_intervalo - now())))::integer);
    end if;
  end if;

  v_anterior := v_lead;
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads
     set mensagens_usadas = mensagens_usadas + 1,
         status = case when status = 'assinante' then status else 'ativo' end,
         last_seen_at = now(),
         -- O teste grátis começa na primeira pergunta e dura free_trial_days (não conta perguntas).
         teste_fim = case when teste_fim is null and v_dias > 0 then now() + make_interval(days => v_dias) else teste_fim end,
         em_andamento_ate = case when v_livre then null else now() + v_trava end,
         ultima_pergunta_em = now()
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

-- Resposta que falhou devolve a pergunta e solta a conta na hora (sem trava nem intervalo).
create or replace function public.release_chat_message(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads
     set mensagens_usadas = greatest(0, mensagens_usadas - 1),
         teste_fim = case when greatest(0, mensagens_usadas - 1) = 0 then null else teste_fim end,
         status = case when status = 'trial_esgotado' and public.teste_ativo(teste_fim) then 'ativo' else status end,
         em_andamento_ate = null,
         ultima_pergunta_em = null
   where id = p_lead_id;
end $$;
revoke all on function public.release_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.release_chat_message(uuid) to service_role;

-- Fim da resposta (com ou sem texto): solta a trava; o intervalo de 5 s continua valendo.
create or replace function public.fim_chat_message(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads set em_andamento_ate = null
   where id = p_lead_id and em_andamento_ate is not null;
end $$;
revoke all on function public.fim_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.fim_chat_message(uuid) to service_role;

-- Reiniciar o teste no CRM solta também a trava (mesmo corpo de 20261025210000).
create or replace function public.crm_reiniciar_cota(p_lead_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Somente administrador' using errcode='42501'; end if;
  if nullif(trim(p_motivo),'') is null or length(p_motivo)>500 then raise exception 'Informe um motivo de até 500 caracteres'; end if;
  perform set_config('trustio.teste_rpc', 'on', true);
  update public.crm_leads set mensagens_usadas=0, teste_fim=null, em_andamento_ate=null, ultima_pergunta_em=null,
    status=case when status='trial_esgotado' then 'email_confirmado' else status end where id=p_lead_id;
  if not found then raise exception 'Lead não encontrado'; end if;
  insert into public.crm_eventos(lead_id,autor,autor_email,campo,para)
    select p_lead_id,auth.uid(),email,'cota_reiniciada',trim(p_motivo) from auth.users where id=auth.uid();
end $$;
revoke all on function public.crm_reiniciar_cota(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_reiniciar_cota(uuid,text) to authenticated;
