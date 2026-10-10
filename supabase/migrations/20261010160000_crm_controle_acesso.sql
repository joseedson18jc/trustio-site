-- Controle administrativo de acesso; datas são verificadas em cada uso, sem depender de cron.
alter table public.crm_leads
  add column acesso_modo text not null default 'padrao' check (acesso_modo in ('padrao','liberado','revogado','bloqueado','bloqueado_login')),
  add column acesso_inicio timestamptz,
  add column acesso_fim timestamptz,
  add column acesso_motivo text,
  add column acesso_ban_anterior timestamptz,
  add column acesso_ban_aplicado timestamptz;
alter table public.crm_leads add constraint acesso_periodo_valido check (acesso_fim is null or acesso_inicio is null or acesso_fim > acesso_inicio);

create or replace function public.conta_acesso_permitido(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select acesso_modo not in ('revogado','bloqueado','bloqueado_login')
    and (status <> 'cancelado' or acesso_modo = 'liberado')
    and (acesso_inicio is null or acesso_inicio <= now())
    and (acesso_fim is null or acesso_fim > now())
    from public.crm_leads where user_id = p_user_id), true);
$$;
revoke all on function public.conta_acesso_permitido(uuid) from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
    and public.pode_ser_admin(auth.uid()) and public.conta_acesso_permitido(auth.uid());
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or (public.conta_acesso_permitido(auth.uid())
    and exists (select 1 from public.crm_leads where user_id = auth.uid() and papel = 'colaborador'));
$$;
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  select case when not public.conta_acesso_permitido(auth.uid()) then 'teste'
    when public.is_admin() then 'admin'
    else coalesce((select nullif(papel,'admin') from public.crm_leads where user_id = auth.uid()), 'teste') end;
$$;

-- Guard separado: permanece efetivo mesmo quando uma RPC antiga usa trustio.lead_rpc.
create or replace function public.guard_acesso_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- Conta nova começa no padrão; qualquer concessão ou banimento passa pela RPC.
    new.acesso_modo := 'padrao'; new.acesso_inicio := null; new.acesso_fim := null; new.acesso_motivo := null; new.acesso_ban_anterior := null; new.acesso_ban_aplicado := null;
    return new;
  end if;
  if (new.acesso_modo,new.acesso_inicio,new.acesso_fim,new.acesso_motivo,new.acesso_ban_anterior,new.acesso_ban_aplicado)
      is distinct from (old.acesso_modo,old.acesso_inicio,old.acesso_fim,old.acesso_motivo,old.acesso_ban_anterior,old.acesso_ban_aplicado)
      and current_setting('trustio.access_rpc',true) is distinct from 'on' then
    raise exception 'Use o controle de acesso do administrador' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and
    ((new.status,new.papel,new.mensagens_usadas) is distinct from (old.status,old.papel,old.mensagens_usadas)
    or (current_setting('trustio.lead_rpc',true) is distinct from 'on' and
      (new.whatsapp_trial_status,new.whatsapp_trial_ends_at) is distinct from (old.whatsapp_trial_status,old.whatsapp_trial_ends_at))) then
    raise exception 'Somente administrador altera acesso e cota' using errcode = '42501';
  end if;
  if new.papel = 'admin' and (new.status = 'cancelado' or new.acesso_modo <> 'padrao' or new.acesso_inicio is not null or new.acesso_fim is not null) then
    raise exception 'Rebaixe o administrador antes de restringir seu acesso';
  end if;
  return new;
end $$;
create trigger crm_leads_guard_z_acesso_admin before insert or update on public.crm_leads
  for each row execute function public.guard_acesso_admin();

create or replace function public.crm_definir_acesso(p_lead_id uuid, p_modo text,
  p_inicio timestamptz default null, p_fim timestamptz default null, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.crm_leads; anterior text; ban_atual timestamptz; ban_novo timestamptz;
begin
  if not public.is_admin() then raise exception 'Somente administrador' using errcode = '42501'; end if;
  select * into l from public.crm_leads where id = p_lead_id for update;
  if not found or l.user_id is null then raise exception 'Conta não encontrada'; end if;
  if l.user_id = auth.uid() or l.papel = 'admin' then raise exception 'Rebaixe o administrador antes de restringir seu acesso'; end if;
  if p_modo is null or p_modo not in ('padrao','liberado','revogado','bloqueado','bloqueado_login') then raise exception 'Modo inválido'; end if;
  if (p_inicio is not null and not isfinite(p_inicio)) or (p_fim is not null and not isfinite(p_fim)) then raise exception 'Data inválida'; end if;
  if p_fim is not null and (p_fim <= now() or (p_inicio is not null and p_fim <= p_inicio)) then raise exception 'O fim deve ser futuro e posterior ao início'; end if;
  if p_modo in ('revogado','bloqueado','bloqueado_login') and (p_inicio is not null or p_fim is not null) then raise exception 'Revogação e bloqueio são imediatos; limpe as datas'; end if;
  if nullif(trim(p_motivo),'') is null or length(p_motivo) > 500 then raise exception 'Informe um motivo de até 500 caracteres'; end if;
  anterior := current_setting('trustio.access_rpc',true);
  perform set_config('trustio.access_rpc','on',true);
  update public.crm_leads set acesso_modo=p_modo, acesso_inicio=p_inicio, acesso_fim=p_fim, acesso_motivo=trim(p_motivo) where id=p_lead_id;
  -- A mesma transação bloqueia novos logins no Auth. Sessões já emitidas perdem os produtos
  -- pelas verificações de acesso acima. Só desfaz o banimento criado por este controle.
  if p_modo = 'bloqueado_login' and l.acesso_modo <> 'bloqueado_login' then
    select banned_until into ban_atual from auth.users where id=l.user_id for update;
    ban_novo := greatest(ban_atual,now() + interval '100 years');
    update auth.users set banned_until = ban_novo where id=l.user_id;
    update public.crm_leads set acesso_ban_anterior=ban_atual, acesso_ban_aplicado=ban_novo where id=l.id;
  elsif p_modo <> 'bloqueado_login' and l.acesso_modo = 'bloqueado_login' then
    update auth.users set banned_until = l.acesso_ban_anterior where id=l.user_id and banned_until=l.acesso_ban_aplicado;
    update public.crm_leads set acesso_ban_anterior=null, acesso_ban_aplicado=null where id=l.id;
  end if;
  perform set_config('trustio.access_rpc',coalesce(anterior,''),true);
end $$;
revoke all on function public.crm_definir_acesso(uuid,text,timestamptz,timestamptz,text) from public, anon, authenticated;
grant execute on function public.crm_definir_acesso(uuid,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
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
  update public.crm_leads
     set mensagens_usadas = mensagens_usadas + 1,
         status = case when status = 'assinante' then status else 'ativo' end,
         last_seen_at = now()
   where id = v_lead.id
     and acesso_modo not in ('revogado','bloqueado','bloqueado_login')
     and (status <> 'cancelado' or acesso_modo='liberado')
     and (acesso_inicio is null or acesso_inicio<=now()) and (acesso_fim is null or acesso_fim>now())
     and (acesso_modo = 'liberado' or status = 'assinante' or papel in ('admin', 'colaborador', 'cliente')
          or v_limit = 0 or mensagens_usadas < v_limit)
  returning * into v_lead;

  if not found then
    v_lead := v_anterior;
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit);
  end if;

  v_livre := v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente');

  -- Esta reserva consumiu a última pergunta grátis: já marca como esgotado (a mensagem atual passa).
  if not v_livre and v_limit > 0 and v_lead.mensagens_usadas >= v_limit then
    update public.crm_leads set status = 'trial_esgotado' where id = v_lead.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'used', v_lead.mensagens_usadas,
    'limit', v_limit,
    'subscriber', v_livre,
    'remaining', case when v_livre or v_limit = 0 then null
                      else greatest(0, v_limit - v_lead.mensagens_usadas) end
  );
end $$;

create or replace function public.acesso_do_chat(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  abre timestamptz;
  antecipado timestamptz;
  eh_admin boolean;
  eh_pre boolean;
begin
  if not public.conta_acesso_permitido(p_user_id) then
    return jsonb_build_object('aberto',false,'motivo','acesso_revogado');
  end if;
  if exists (select 1 from public.crm_leads where user_id=p_user_id and acesso_modo='liberado') then
    return jsonb_build_object('aberto',true,'motivo','liberacao_admin');
  end if;
  select (value #>> '{}')::timestamptz into abre
    from public.app_settings where key = 'acesso_abre_em';
  select (value #>> '{}')::timestamptz into antecipado
    from public.app_settings where key = 'acesso_antecipado_em';

  eh_admin := (exists (select 1 from public.admins a where a.user_id = p_user_id) and public.pode_ser_admin(p_user_id))
           or exists (select 1 from public.crm_leads l where l.user_id = p_user_id and l.papel = 'colaborador');
  eh_pre := exists (
    select 1 from public.crm_leads l
    where l.user_id = p_user_id and (l.status = 'assinante' or l.papel = 'cliente')
  );

  if eh_admin or abre is null or now() >= abre then
    return jsonb_build_object(
      'aberto', true,
      'motivo', case when eh_admin then 'admin' when abre is null then 'sem_portao' else 'lancamento' end,
      'abre_em', abre, 'antecipado_em', antecipado);
  end if;

  if eh_pre and antecipado is not null and now() >= antecipado then
    return jsonb_build_object('aberto', true, 'motivo', 'antecipado',
      'abre_em', abre, 'antecipado_em', antecipado);
  end if;

  return jsonb_build_object(
    'aberto', false,
    'motivo', case when eh_pre then 'antes_do_antecipado' else 'antes_do_lancamento' end,
    'pre_assinante', eh_pre,
    'abre_em', abre, 'antecipado_em', antecipado);
end $$;

create or replace function public.activate_whatsapp_trial(p_lead_id uuid, p_days integer default 3)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'somente a equipe'; end if;
  if p_days is null or p_days not between 1 and 365 then raise exception 'Dias inválidos (1 a 365)'; end if;
  if not exists (select 1 from public.crm_leads where id=p_lead_id and public.conta_acesso_permitido(user_id)) then raise exception 'Conta sem acesso'; end if;
  perform set_config('trustio.lead_rpc', 'on', true);
  update public.crm_leads
     set whatsapp_trial_status = 'ativo',
         whatsapp_numero = coalesce(whatsapp_numero, nullif(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), '')),
         whatsapp_trial_started_at = now(),
         whatsapp_trial_ends_at = now() + make_interval(days => greatest(1, p_days))
   where id = p_lead_id;
  perform set_config('trustio.lead_rpc', 'off', true);
end $$;

create or replace view public.crm_overview with (security_invoker = true) as
  select l.id, l.user_id, l.nome, l.email, l.telefone, l.tipo, l.empresa, l.segmento, l.origem,
         l.status, l.plano, l.mensagens_usadas, l.notas, l.confirmed_at, l.last_seen_at,
         l.created_at, l.updated_at, l.onboarding_seen_at, l.whatsapp_numero,
         l.whatsapp_trial_status, l.whatsapp_trial_requested_at, l.whatsapp_trial_started_at,
         l.whatsapp_trial_ends_at,
         public.conversas_de(l.user_id) as conversas,
         public.ultima_mensagem_de(l.user_id) as ultima_mensagem,
         l.papel,
         l.whatsapp_aviso_email_em, l.whatsapp_aviso_email_reserva, l.whatsapp_aviso_email_erro,
         l.whatsapp_aviso_wa_em, l.whatsapp_aviso_wa_reserva, l.whatsapp_aviso_wa_erro,
         l.whatsapp_ativacao,
         l.proximo_contato, l.etiquetas, l.acesso_modo, l.acesso_inicio, l.acesso_fim, l.acesso_motivo
    from public.crm_leads l;

create or replace function public.crm_registrar_eventos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid := auth.uid();
  v_email text;
begin
  if tg_op = 'UPDATE' and (old.status, old.plano, old.papel, old.whatsapp_trial_status, old.notas,
                           old.proximo_contato, old.etiquetas, old.telefone, old.confirmed_at, old.segmento, old.acesso_modo, old.acesso_inicio, old.acesso_fim, old.acesso_motivo, old.whatsapp_trial_ends_at)
      is not distinct from (new.status, new.plano, new.papel, new.whatsapp_trial_status, new.notas,
                            new.proximo_contato, new.etiquetas, new.telefone, new.confirmed_at, new.segmento, new.acesso_modo, new.acesso_inicio, new.acesso_fim, new.acesso_motivo, new.whatsapp_trial_ends_at) then
    -- Atualizações que não mexem no que a equipe acompanha (último acesso, uso, avisos).
    return new;
  end if;
  if v_autor is not null then select email into v_email from auth.users where id = v_autor; end if;
  if tg_op = 'INSERT' then
    insert into public.crm_eventos (lead_id, em, autor, autor_email, campo, para)
    values (new.id, new.created_at, v_autor, v_email, 'criado', new.origem);
    return new;
  end if;
  -- Texto de cada valor; notas longas são cortadas em 500 caracteres.
  insert into public.crm_eventos (lead_id, autor, autor_email, campo, de, para)
  select new.id, v_autor, v_email, c.campo, left(c.de, 500), left(c.para, 500)
    from (values
      ('segmento', old.segmento, new.segmento),
      ('acesso_modo', old.acesso_modo, new.acesso_modo),
      ('acesso_inicio', old.acesso_inicio::text, new.acesso_inicio::text),
      ('acesso_fim', old.acesso_fim::text, new.acesso_fim::text),
      ('acesso_motivo', old.acesso_motivo, new.acesso_motivo),
      ('whatsapp_trial_ends_at', old.whatsapp_trial_ends_at::text, new.whatsapp_trial_ends_at::text),
      ('status', old.status::text, new.status::text),
      ('plano', old.plano::text, new.plano::text),
      ('papel', old.papel::text, new.papel::text),
      ('whatsapp_trial_status', old.whatsapp_trial_status::text, new.whatsapp_trial_status::text),
      ('notas', old.notas::text, new.notas::text),
      ('proximo_contato', old.proximo_contato::text, new.proximo_contato::text),
      ('etiquetas', array_to_string(old.etiquetas, ', '), array_to_string(new.etiquetas, ', ')),
      ('telefone', old.telefone::text, new.telefone::text),
      ('confirmed_at', old.confirmed_at::text, new.confirmed_at::text)
    ) as c(campo, de, para)
   where c.de is distinct from c.para;
  return new;
end $$;

create or replace function public.crm_reiniciar_cota(p_lead_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Somente administrador' using errcode='42501'; end if;
  if nullif(trim(p_motivo),'') is null or length(p_motivo)>500 then raise exception 'Informe um motivo de até 500 caracteres'; end if;
  update public.crm_leads set mensagens_usadas=0,
    status=case when status='trial_esgotado' then 'email_confirmado' else status end where id=p_lead_id;
  if not found then raise exception 'Lead não encontrado'; end if;
  insert into public.crm_eventos(lead_id,autor,autor_email,campo,para)
    select p_lead_id,auth.uid(),email,'cota_reiniciada',trim(p_motivo) from auth.users where id=auth.uid();
end $$;
revoke all on function public.crm_reiniciar_cota(uuid,text) from public,anon,authenticated;
grant execute on function public.crm_reiniciar_cota(uuid,text) to authenticated;

create or replace function public.validar_papel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.papel is not distinct from old.papel then return new; end if;
  if new.papel in ('admin', 'colaborador') and new.user_id is null then
    raise exception 'papel_exige_conta' using hint = 'Admin e colaborador precisam ter conta criada no site.';
  end if;
  if new.papel = 'admin' and not public.pode_ser_admin(new.user_id) then
    raise exception 'admin_restrito' using hint = 'Só joseedson18@hotmail.com e matheuscastrocorrea@gmail.com podem ser admin.';
  end if;
  if tg_op = 'UPDATE' and old.papel = 'admin' and new.papel <> 'admin' then
    -- Serializa os rebaixamentos: dois admins saindo ao mesmo tempo não podem, cada um,
    -- contar com o outro como "o admin que fica". A trava vale até o fim da transação,
    -- e a contagem abaixo já enxerga o que a outra transação gravou.
    perform pg_advisory_xact_lock(hashtext('trustio_rebaixa_admin'));
    if not exists (select 1 from public.crm_leads where papel = 'admin' and id <> new.id
      and public.pode_ser_admin(user_id) and public.conta_acesso_permitido(user_id)) then
      raise exception 'ultimo_admin' using hint = 'Precisa haver pelo menos um admin.';
    end if;
  end if;
  return new;
end $$;
