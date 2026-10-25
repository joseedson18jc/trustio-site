-- =============================================================================
-- Trustio · Liberação automática dos planos pessoais pagos na Stripe
-- -----------------------------------------------------------------------------
-- O webhook da Stripe (worker/src/afiliados.js) passa a liberar sozinho os planos pessoais
-- (Chat, Agentio e Combo, mensais, semestrais, anuais e de 7 dias). Empresas e Diagnóstico
-- continuam manuais. Regras combinadas com o José (25/out):
--  · plano pelo link de pagamento (catálogo stripe_planos), não pelo valor pago;
--  · um direito por sessão de checkout: o reenvio do mesmo evento não soma dias;
--  · quem paga sem conta fica com o direito guardado e recebe ao confirmar o e-mail
--    (o passe de 7 dias começa nessa hora, não no pagamento);
--  · cancelamento mantém o acesso até o fim do período pago; reembolso corta na hora.
-- O acesso pago fica em colunas próprias (pago_chat_ate, pago_agentio_ate), separado do
-- controle do administrador (acesso_modo): bloqueio e revogação do admin continuam valendo
-- por cima do pagamento, e o fim de um passe não bloqueia a conta, só volta ao teste grátis.
-- =============================================================================

-- 1. Catálogo: quais links de pagamento liberam o quê. Fora daqui, nada é liberado sozinho.
create table public.stripe_planos (
  payment_link text primary key,
  tier text not null unique,
  nome text not null,
  produtos text[] not null check (cardinality(produtos) between 1 and 2 and produtos <@ array['chat','agentio']::text[]),
  dias integer check (dias is null or dias between 1 and 366)   -- null: assinatura recorrente
);
alter table public.stripe_planos enable row level security;
create policy stripe_planos_admin on public.stripe_planos for select to authenticated using (public.is_admin());

insert into public.stripe_planos (payment_link, tier, nome, produtos, dias) values
  ('plink_1UDTz3EJikqpWGBRJGeMQsRk', 'pessoal',           'Chat · mensal',       array['chat'],            null),
  ('plink_1UDTzBEJikqpWGBRttpPYGge', 'passe7',            'Chat · passe 7 dias', array['chat'],            7),
  ('plink_1UDTzIEJikqpWGBRW3lRq2lv', 'anual',             'Chat · anual',        array['chat'],            null),
  ('plink_1UJfQ0EJikqpWGBRYdWYFbnY', 'agentio-semanal',   'Agentio · 7 dias',    array['agentio'],         7),
  ('plink_1UJfQ5EJikqpWGBRU76aJWOA', 'agentio-mensal',    'Agentio · mensal',    array['agentio'],         null),
  ('plink_1UJfQ8EJikqpWGBRyDVzZXli', 'agentio-semestral', 'Agentio · semestral', array['agentio'],         null),
  ('plink_1UJfQBEJikqpWGBRlNSfSuaJ', 'agentio-anual',     'Agentio · anual',     array['agentio'],         null),
  ('plink_1UJfQEEJikqpWGBR9W4ehnmJ', 'combo-semanal',     'Combo · 7 dias',      array['chat','agentio'],  7),
  ('plink_1UJfQHEJikqpWGBR2V5gVJbH', 'combo-mensal',      'Combo · mensal',      array['chat','agentio'],  null),
  ('plink_1UJfQKEJikqpWGBRehEddNM4', 'combo-semestral',   'Combo · semestral',   array['chat','agentio'],  null),
  ('plink_1UJfQNEJikqpWGBR4o7D7ReW', 'combo-anual',       'Combo · anual',       array['chat','agentio'],  null);

-- 2. Direitos: uma linha por compra (sessão de checkout). inicio nulo = aguardando a conta.
create table public.direitos_pagos (
  id uuid primary key default gen_random_uuid(),
  stripe_session text not null unique,
  email text not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  tier text not null,
  plano_nome text not null,
  produtos text[] not null,
  dias integer,
  subscription_id text,
  customer_id text,
  payment_intent text,
  valor_centavos integer,
  inicio timestamptz,
  fim timestamptz,                      -- null: assinatura em dia, sem data para acabar
  encerrado_em timestamptz,
  encerrado_motivo text check (encerrado_motivo in ('cancelado', 'reembolso')),
  stripe_evento_em timestamptz,         -- último evento da assinatura aplicado (ignora os atrasados)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index direitos_pagos_lead on public.direitos_pagos (lead_id);
create index direitos_pagos_assinatura on public.direitos_pagos (subscription_id) where subscription_id is not null;
create index direitos_pagos_pagamento on public.direitos_pagos (payment_intent) where payment_intent is not null;
create index direitos_pagos_cliente on public.direitos_pagos (customer_id) where customer_id is not null;
alter table public.direitos_pagos enable row level security;
create policy direitos_pagos_admin on public.direitos_pagos for select to authenticated using (public.is_admin());
-- Os privilégios padrão do Supabase dão escrita a anon/authenticated em tabela nova; aqui só as funções escrevem.
revoke insert, update, delete, truncate on public.stripe_planos, public.direitos_pagos from anon, authenticated;

-- 3. Resumo na conta, lido pelo chat, pela voz e pelo Agentio. Só as funções abaixo escrevem.
alter table public.crm_leads
  add column pago_chat_ate timestamptz,
  add column pago_agentio_ate timestamptz,
  add column pago_plano text;

create or replace function public.guard_pago()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('trustio.pago_rpc', true) is distinct from 'on' then
    if tg_op = 'INSERT' then
      new.pago_chat_ate := null; new.pago_agentio_ate := null; new.pago_plano := null;
    elsif (new.pago_chat_ate, new.pago_agentio_ate, new.pago_plano)
          is distinct from (old.pago_chat_ate, old.pago_agentio_ate, old.pago_plano) then
      raise exception 'O acesso pago só muda pelos pagamentos da Stripe' using errcode = '42501';
    end if;
  end if;
  -- Com o Agentio pago, o telefone do cadastro é o número liberado: o cliente não o troca sozinho.
  if tg_op = 'UPDATE' and auth.uid() is not null and not public.is_staff()
     and coalesce(old.pago_agentio_ate > now(), false) then
    new.telefone := old.telefone;
  end if;
  return new;
end $$;
revoke all on function public.guard_pago() from public, anon, authenticated;
create trigger crm_leads_guard_pago before insert or update on public.crm_leads
  for each row execute function public.guard_pago();

-- 4. Recalcula o resumo da conta a partir dos direitos (reembolsados não contam).
create or replace function public.pago_sincronizar(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_chat timestamptz;
  v_agentio timestamptz;
  v_plano text;
  anterior text := current_setting('trustio.pago_rpc', true);
begin
  if p_lead is null then return; end if;
  select max(coalesce(d.fim, 'infinity')) filter (where 'chat' = any(d.produtos)),
         max(coalesce(d.fim, 'infinity')) filter (where 'agentio' = any(d.produtos))
    into v_chat, v_agentio
    from public.direitos_pagos d
   where d.lead_id = p_lead and d.inicio is not null and d.encerrado_motivo is distinct from 'reembolso';
  select d.plano_nome into v_plano
    from public.direitos_pagos d
   where d.lead_id = p_lead and d.inicio is not null and d.encerrado_motivo is distinct from 'reembolso'
   order by coalesce(d.fim, 'infinity') desc, d.criado_em desc limit 1;

  perform set_config('trustio.pago_rpc', 'on', true);
  update public.crm_leads
     set pago_chat_ate = v_chat, pago_agentio_ate = v_agentio, pago_plano = v_plano,
         plano = coalesce(v_plano, plano)
   where id = p_lead
     and (pago_chat_ate, pago_agentio_ate, pago_plano) is distinct from (v_chat, v_agentio, v_plano);
  perform set_config('trustio.pago_rpc', coalesce(anterior, ''), true);
end $$;
revoke all on function public.pago_sincronizar(uuid) from public, anon, authenticated, service_role;

-- 5. Aplica os direitos guardados quando a conta existe e o e-mail está confirmado.
--    Passe comprado com outro ainda valendo começa quando o anterior acaba.
create or replace function public.pago_aplicar_pendentes(p_lead uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  l public.crm_leads;
  d public.direitos_pagos;
  v_base timestamptz;
  n integer := 0;
begin
  select * into l from public.crm_leads where id = p_lead;
  if not found or l.user_id is null then return 0; end if;
  if not exists (select 1 from auth.users u where u.id = l.user_id
                  and u.email_confirmed_at is not null and lower(u.email) = lower(l.email)) then
    return 0;
  end if;
  for d in select * from public.direitos_pagos
            where lead_id = l.id and inicio is null and encerrado_motivo is null
            order by criado_em for update loop
    if d.dias is null then
      update public.direitos_pagos set inicio = now(), atualizado_em = now() where id = d.id;
    else
      select max(x.fim) into v_base from public.direitos_pagos x
       where x.lead_id = l.id and x.produtos = d.produtos and x.inicio is not null
         and x.encerrado_motivo is null and x.fim > now();
      v_base := greatest(now(), coalesce(v_base, now()));
      update public.direitos_pagos
         set inicio = v_base, fim = v_base + make_interval(days => d.dias), atualizado_em = now()
       where id = d.id;
    end if;
    n := n + 1;
  end loop;
  if n > 0 then perform public.pago_sincronizar(l.id); end if;
  return n;
end $$;
revoke all on function public.pago_aplicar_pendentes(uuid) from public, anon, authenticated, service_role;

-- A conta criada ou confirmada depois do pagamento recebe o que estava guardado.
create or replace function public.pago_ao_vincular_conta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null
     and exists (select 1 from public.direitos_pagos where lead_id = new.id and inicio is null and encerrado_motivo is null) then
    perform public.pago_aplicar_pendentes(new.id);
  end if;
  return null;
end $$;
revoke all on function public.pago_ao_vincular_conta() from public, anon, authenticated;
create trigger crm_leads_pago_pendente after update of user_id, confirmed_at, email on public.crm_leads
  for each row execute function public.pago_ao_vincular_conta();

-- 6. Compra paga (checkout.session.completed ou async_payment_succeeded). Idempotente pela sessão.
create or replace function public.stripe_ativar_compra(
  p_sessao text,
  p_email text,
  p_payment_link text default null,
  p_tier text default null,
  p_subscription text default null,
  p_customer text default null,
  p_payment_intent text default null,
  p_valor_centavos integer default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sessao text := nullif(trim(coalesce(p_sessao, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email, '')), ''));
  p public.stripe_planos;
  l public.crm_leads;
  v_aplicados integer;
begin
  if v_sessao is null then return jsonb_build_object('ok', false, 'motivo', 'sem_sessao'); end if;
  select * into p from public.stripe_planos where payment_link = p_payment_link;
  if not found then select * into p from public.stripe_planos where tier = p_tier; end if;
  if not found then
    return jsonb_build_object('ok', true, 'ativado', false, 'motivo', 'fora_da_liberacao_automatica');
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'ativado', false, 'motivo', 'sem_email');
  end if;

  perform pg_advisory_xact_lock(hashtext('trustio.stripe.compra.' || v_sessao));
  if exists (select 1 from public.direitos_pagos where stripe_session = v_sessao) then
    return jsonb_build_object('ok', true, 'ativado', false, 'motivo', 'repetido');
  end if;

  insert into public.crm_leads (email, tipo, origem, status) values (v_email, 'b2c', 'stripe', 'novo')
  on conflict (lower(email)) do nothing;
  select * into l from public.crm_leads where lower(email) = v_email for update;

  insert into public.direitos_pagos (stripe_session, email, lead_id, tier, plano_nome, produtos, dias,
                                     subscription_id, customer_id, payment_intent, valor_centavos)
  values (v_sessao, v_email, l.id, p.tier, p.nome, p.produtos, p.dias,
          nullif(trim(coalesce(p_subscription, '')), ''), nullif(trim(coalesce(p_customer, '')), ''),
          nullif(trim(coalesce(p_payment_intent, '')), ''), p_valor_centavos);

  v_aplicados := public.pago_aplicar_pendentes(l.id);
  return jsonb_build_object('ok', true, 'ativado', v_aplicados > 0, 'pendente', v_aplicados = 0,
                            'tier', p.tier, 'lead_id', l.id);
end $$;
revoke all on function public.stripe_ativar_compra(text, text, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.stripe_ativar_compra(text, text, text, text, text, text, text, integer) to service_role;

-- 7. Assinatura mudou (customer.subscription.updated/deleted). p_fim nulo = em dia;
--    com data = cancelada no fim do período; p_encerrar = acabou de vez.
create or replace function public.stripe_atualizar_assinatura(
  p_subscription text,
  p_fim timestamptz,
  p_encerrar boolean default false,
  p_evento_em timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  if nullif(trim(coalesce(p_subscription, '')), '') is null then
    return jsonb_build_object('ok', false, 'motivo', 'sem_assinatura');
  end if;
  for r in
    update public.direitos_pagos
       set fim = p_fim,
           encerrado_em = case when p_encerrar then now() end,
           encerrado_motivo = case when p_encerrar then 'cancelado' end,
           stripe_evento_em = coalesce(p_evento_em, stripe_evento_em),
           atualizado_em = now()
     where subscription_id = p_subscription
       and encerrado_motivo is null
       and (p_evento_em is null or stripe_evento_em is null or p_evento_em >= stripe_evento_em)
    returning lead_id
  loop
    perform public.pago_sincronizar(r.lead_id);
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'atualizadas', n);
end $$;
revoke all on function public.stripe_atualizar_assinatura(text, timestamptz, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.stripe_atualizar_assinatura(text, timestamptz, boolean, timestamptz) to service_role;

-- 8. Reembolso total (charge.refunded): corta na hora. Acha a compra pelo pagamento; sem ele
--    (renovação de assinatura), pelas assinaturas em dia do mesmo cliente da Stripe.
create or replace function public.stripe_reembolso(
  p_payment_intent text,
  p_customer text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
  v_pi text := nullif(trim(coalesce(p_payment_intent, '')), '');
  v_cliente text := nullif(trim(coalesce(p_customer, '')), '');
begin
  if v_pi is not null then
    for r in
      update public.direitos_pagos
         set fim = case when fim is null or fim > now() then now() else fim end,
             encerrado_em = now(), encerrado_motivo = 'reembolso', atualizado_em = now()
       where payment_intent = v_pi and encerrado_motivo is distinct from 'reembolso'
      returning lead_id
    loop
      perform public.pago_sincronizar(r.lead_id);
      n := n + 1;
    end loop;
  end if;
  if n = 0 and v_cliente is not null then
    for r in
      update public.direitos_pagos
         set fim = case when fim is null or fim > now() then now() else fim end,
             encerrado_em = now(), encerrado_motivo = 'reembolso', atualizado_em = now()
       where customer_id = v_cliente and subscription_id is not null and encerrado_motivo is null
      returning lead_id
    loop
      perform public.pago_sincronizar(r.lead_id);
      n := n + 1;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'encerradas', n);
end $$;
revoke all on function public.stripe_reembolso(text, text) from public, anon, authenticated;
grant execute on function public.stripe_reembolso(text, text) to service_role;

-- 9. Chat e voz enxergam o acesso pago. Mesmo corpo de 20261010160000/20261017090000, com
--    pago_chat_ate > now() somado aos casos sem cota.
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
          or coalesce(pago_chat_ate > now(), false)
          or v_limit = 0 or mensagens_usadas < v_limit)
  returning * into v_lead;

  if not found then
    v_lead := v_anterior;
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit);
  end if;

  v_livre := v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente')
          or coalesce(v_lead.pago_chat_ate > now(), false);

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
revoke all on function public.reserve_chat_message(uuid) from public, anon;
grant execute on function public.reserve_chat_message(uuid) to authenticated, service_role;

create or replace function public.voz_acesso_livre(p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_lead public.crm_leads;
begin
  if not public.conta_acesso_permitido(p_user_id) then return 'revogado'; end if;
  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if not found then return 'teste'; end if;
  if v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login')
    or (v_lead.status = 'cancelado' and v_lead.acesso_modo <> 'liberado')
    or (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
    or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now()) then
    return 'revogado';
  end if;
  if v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente')
     or coalesce(v_lead.pago_chat_ate > now(), false) then
    return 'livre';
  end if;
  return 'teste';
end $$;
revoke all on function public.voz_acesso_livre(uuid) from public, anon, authenticated;
grant execute on function public.voz_acesso_livre(uuid) to service_role;
