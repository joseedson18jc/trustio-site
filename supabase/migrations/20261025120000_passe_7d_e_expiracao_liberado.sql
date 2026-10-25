-- =============================================================================
-- Trustio · Passe de 7 dias e expiração limpa de acesso_modo = 'liberado'
-- -----------------------------------------------------------------------------
-- 1. Quando acesso_modo = 'liberado' tem acesso_fim no passado (ex.: passe de 7
--    dias expirado), a conta não é tratada como revogada/bloqueada; volta a
--    valer o status e a cota padrão da conta.
-- 2. ativar_assinatura_stripe(p_email, p_valor_tabela) ativa o passe de 7 dias
--    (R$ 24,90 / R$ 39,90 / R$ 54,90 e versões com cupom) ou a assinatura
--    recorrente (status = 'assinante') com as flags trustio.access_rpc e
--    trustio.lead_rpc = 'on' para passar pelos triggers guard_acesso_admin e
--    guard_lead_update. Cria o lead se o comprador ainda não tiver cadastro.
-- 3. conta_acesso_permitido, acesso_liberado_ativo, reserve_chat_message,
--    acesso_do_chat e voz_acesso_livre tratam liberação expirada sem bloquear
--    o usuário indevidamente.
-- =============================================================================

create or replace function public.acesso_liberado_ativo(p_lead public.crm_leads)
returns boolean language sql stable as $$
  select p_lead.acesso_modo = 'liberado'
    and (p_lead.acesso_inicio is null or p_lead.acesso_inicio <= now())
    and (p_lead.acesso_fim is null or p_lead.acesso_fim > now());
$$;

create or replace function public.acesso_liberado_ativo(p_lead_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  l public.crm_leads%rowtype;
begin
  select * into l from public.crm_leads where id = p_lead_id;
  if not found then return false; end if;
  return public.acesso_liberado_ativo(l);
end;
$$;
revoke all on function public.acesso_liberado_ativo(uuid) from public, anon, authenticated;
grant execute on function public.acesso_liberado_ativo(uuid) to service_role;

create or replace function public.conta_acesso_permitido(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select
      case
        when acesso_modo in ('revogado','bloqueado','bloqueado_login') then false
        when acesso_modo = 'liberado' then
          case
            when (acesso_inicio is null or acesso_inicio <= now()) and (acesso_fim is null or acesso_fim > now()) then true
            when status = 'cancelado' then false
            else true
          end
        when status = 'cancelado' then false
        when acesso_inicio is not null and acesso_inicio > now() then false
        when acesso_fim is not null and acesso_fim <= now() then false
        else true
      end
    from public.crm_leads where user_id = p_user_id
  ), true);
$$;
revoke all on function public.conta_acesso_permitido(uuid) from public, anon, authenticated;
grant execute on function public.conta_acesso_permitido(uuid) to service_role;

create or replace function public.acesso_do_chat(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  abre timestamptz;
  antecipado timestamptz;
  eh_admin boolean;
  eh_pre boolean;
  v_lead public.crm_leads%rowtype;
  v_liberado boolean;
begin
  if not public.conta_acesso_permitido(p_user_id) then
    return jsonb_build_object('aberto',false,'motivo','acesso_revogado');
  end if;

  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if found then
    v_liberado := public.acesso_liberado_ativo(v_lead);
    if v_liberado then
      return jsonb_build_object('aberto',true,'motivo','liberacao_admin');
    end if;
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
revoke all on function public.acesso_do_chat(uuid) from public, anon, authenticated;
grant execute on function public.acesso_do_chat(uuid) to service_role;

create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
  v_lead public.crm_leads%rowtype;
  v_email text;
  v_livre boolean;
  v_anterior public.crm_leads%rowtype;
  v_liberado_ativo boolean;
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

  v_liberado_ativo := public.acesso_liberado_ativo(v_lead);

  if v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login')
    or (v_lead.status = 'cancelado' and not v_liberado_ativo)
    or (v_lead.acesso_modo <> 'liberado' and (
      (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
      or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now())
    )) then
    return jsonb_build_object('ok',false,'error','acesso_revogado');
  end if;

  v_livre := v_liberado_ativo or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente');

  v_anterior := v_lead;
  update public.crm_leads
     set mensagens_usadas = mensagens_usadas + 1,
         status = case when status = 'assinante' then status else 'ativo' end,
         last_seen_at = now()
   where id = v_lead.id
     and acesso_modo not in ('revogado','bloqueado','bloqueado_login')
     and (status <> 'cancelado' or v_liberado_ativo)
     and (v_lead.acesso_modo = 'liberado' or ((acesso_inicio is null or acesso_inicio<=now()) and (acesso_fim is null or acesso_fim>now())))
     and (v_livre or v_limit = 0 or mensagens_usadas < v_limit)
  returning * into v_lead;

  if not found then
    v_lead := v_anterior;
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit);
  end if;

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
revoke all on function public.reserve_chat_message(uuid) from public, anon;
grant execute on function public.reserve_chat_message(uuid) to authenticated, service_role;

create or replace function public.voz_acesso_livre(p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_lead public.crm_leads%rowtype;
  v_liberado_ativo boolean;
begin
  if not public.conta_acesso_permitido(p_user_id) then return 'revogado'; end if;
  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if not found then return 'teste'; end if;
  if v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login') then
    return 'revogado';
  end if;

  v_liberado_ativo := public.acesso_liberado_ativo(v_lead);

  if v_liberado_ativo or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente') then
    return 'livre';
  end if;

  if v_lead.status = 'cancelado' then
    return 'revogado';
  end if;

  if v_lead.acesso_modo <> 'liberado' then
    if (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
      or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now()) then
      return 'revogado';
    end if;
  end if;

  return 'teste';
end $$;
revoke all on function public.voz_acesso_livre(uuid) from public, anon, authenticated;
grant execute on function public.voz_acesso_livre(uuid) to service_role;

create or replace function public.ativar_assinatura_stripe(
  p_email text,
  p_valor_tabela integer default null,
  p_centavos integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_centavos integer := coalesce(p_valor_tabela, p_centavos, 0);
  v_passe_7d boolean := v_centavos in (2490, 3990, 5490, 2241, 3591, 4941);
  v_lead_id uuid;
  v_user_id uuid;
begin
  if v_email = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem_email');
  end if;

  perform set_config('trustio.access_rpc', 'on', true);
  perform set_config('trustio.lead_rpc', 'on', true);

  if not exists (select 1 from public.crm_leads where lower(email) = v_email) then
    select id into v_user_id from auth.users where lower(email) = v_email;
    insert into public.crm_leads (user_id, email, tipo, status, origem)
    values (
      v_user_id,
      v_email,
      'b2c',
      case when v_passe_7d then 'novo' else 'assinante' end,
      'stripe'
    );
  end if;

  if v_passe_7d then
    update public.crm_leads
    set acesso_modo      = 'liberado',
        acesso_inicio    = coalesce(acesso_inicio, now()),
        acesso_fim       = greatest(coalesce(acesso_fim, now()), now()) + interval '7 days',
        acesso_motivo    = 'Passe 7 dias (Stripe)'
    where lower(email) = v_email and (papel is null or papel <> 'admin')
    returning id into v_lead_id;
  else
    update public.crm_leads
    set status           = 'assinante',
        acesso_modo      = 'liberado',
        acesso_inicio    = coalesce(acesso_inicio, now()),
        acesso_fim       = null,
        acesso_motivo    = 'Assinatura (Stripe)'
    where lower(email) = v_email and (papel is null or papel <> 'admin')
    returning id into v_lead_id;
  end if;

  return jsonb_build_object('ok', v_lead_id is not null, 'lead_id', v_lead_id, 'passe_7d', v_passe_7d);
end $$;

revoke all on function public.ativar_assinatura_stripe(text, integer, integer) from public, anon, authenticated;
grant execute on function public.ativar_assinatura_stripe(text, integer, integer) to service_role;

create or replace function public.ativar_acesso_stripe(
  p_email text,
  p_centavos integer default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.ativar_assinatura_stripe(p_email, p_centavos, p_centavos);
$$;

revoke all on function public.ativar_acesso_stripe(text, integer) from public, anon, authenticated;
grant execute on function public.ativar_acesso_stripe(text, integer) to service_role;

create or replace function public.registrar_trial_activated(
  p_sessao text,
  p_email_comprador text,
  p_price_id text default null,
  p_valor_centavos int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sessao text := nullif(trim(coalesce(p_sessao, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email_comprador, '')), ''));
  v_user uuid;
  v_cadastro jsonb;
  v_utms jsonb;
  v_fonte text;
  v_afiliado text;
begin
  if v_sessao is null then return jsonb_build_object('ok', false, 'error', 'sem_sessao'); end if;

  if v_email is not null then
    begin
      perform public.ativar_assinatura_stripe(v_email, p_valor_centavos);
    exception when others then
      -- Ambientes de teste mínimos ou sem colunas/tabelas de CRM
      null;
    end;
  end if;

  perform pg_advisory_xact_lock(hashtext('trustio.funil.trial.' || v_sessao));
  if exists (select 1 from public.eventos_funil where evento = 'trial_activated' and meta->>'stripe_session' = v_sessao) then
    return jsonb_build_object('ok', true, 'registrado', false, 'motivo', 'repetido');
  end if;

  if v_email is not null then
    select user_id into v_user from public.crm_leads
     where lower(email) = v_email and user_id is not null limit 1;
  end if;
  if v_user is not null then
    select meta into v_cadastro from public.eventos_funil
     where evento = 'signup_complete' and meta->>'user_id' = v_user::text
     order by criado_em limit 1;
  end if;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_utms
    from jsonb_each_text(coalesce(v_cadastro, '{}'::jsonb)) as e(k, v)
   where (k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') and v ~ '^[a-z0-9._-]{1,64}$')
      or (k = 'ref_host' and v ~ '^[a-z0-9.-]{1,64}$')
      or (k = 'landing' and v ~ '^/[a-z0-9._/-]{0,63}$');
  v_fonte := case when v_cadastro->>'fonte_atrib' in ('metadata', 'local') then v_cadastro->>'fonte_atrib' else 'nenhuma' end;

  select atribuicao into v_afiliado from public.comissoes where stripe_session_id = v_sessao;

  insert into public.eventos_funil (evento, meta)
  values ('trial_activated', jsonb_strip_nulls(jsonb_build_object(
    'tipo', 'pagamento',
    'stripe_session', v_sessao,
    'price_id', nullif(trim(coalesce(p_price_id, '')), ''),
    'valor_centavos', p_valor_centavos,
    'atrib_afiliado', coalesce(v_afiliado, 'nenhum'),
    'fonte_atrib', v_fonte
  )) || v_utms);

  return jsonb_build_object('ok', true, 'registrado', true, 'fonte_atrib', v_fonte);
end;
$$;

revoke all on function public.registrar_trial_activated(text, text, text, int) from public, anon, authenticated;
grant execute on function public.registrar_trial_activated(text, text, text, int) to service_role;
