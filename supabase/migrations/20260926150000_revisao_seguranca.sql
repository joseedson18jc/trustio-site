-- Trustio · revisão de segurança (26/09/2026)
--
-- 1. Cliente não troca, por conta própria, o número liberado no agente do WhatsApp.
--    O guard protegia status, plano e o teste, mas deixava whatsapp_numero livre para um
--    PATCH direto: quem tinha teste ativo ou assinatura podia apontar o acesso para qualquer
--    número (e, trocando a cada 30 s, reiniciar o gateway do Mac para todo mundo). O número só
--    muda pela RPC request_whatsapp_trial (que liga trustio.lead_rpc) ou pela equipe. Para
--    assinante, o telefone do cadastro também fica travado, porque é ele que o
--    hermes-autorizados usa quando não há whatsapp_numero.
-- 2. registrar_optin: no máximo um e-mail de confirmação a cada 5 minutos por endereço, sem
--    sobrescrever lead que já tem conta e sem apagar as notas da equipe.
-- 3. Admin não lê as conversas dos clientes: as contagens do CRM já vêm das funções
--    security definer conversas_de/ultima_mensagem_de, e as políticas de leitura geral
--    faziam as conversas de todo mundo aparecerem na barra lateral do admin no /app/.
-- 4. emails_admin() e pode_ser_admin() deixam de ser chamáveis por anon/authenticated (quem
--    as usa são funções security definer, que seguem funcionando), e só conta com e-mail
--    confirmado pode ser admin.
--
-- Migração nova de propósito: as anteriores já estão aplicadas.

-- ─────────────────────────────────────────────────────────────── 1. guard do lead
create or replace function public.guard_lead_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('trustio.lead_rpc', true) = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  -- Identidade do lead (a conta e o e-mail que carregam o tipo) não muda por aqui, nem para
  -- a equipe: trocar user_id de um lead colaborador daria acesso de equipe a outra conta.
  new.user_id := old.user_id; new.email := old.email;
  new.whatsapp_aviso_email_em := old.whatsapp_aviso_email_em;
  new.whatsapp_aviso_email_reserva := old.whatsapp_aviso_email_reserva;
  new.whatsapp_aviso_email_erro := old.whatsapp_aviso_email_erro;
  new.whatsapp_aviso_wa_em := old.whatsapp_aviso_wa_em;
  new.whatsapp_aviso_wa_reserva := old.whatsapp_aviso_wa_reserva;
  new.whatsapp_aviso_wa_erro := old.whatsapp_aviso_wa_erro;
  if not public.is_staff() then
    -- Cliente editando o próprio cadastro: só os dados de contato mudam.
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at; new.papel := old.papel;
    new.whatsapp_trial_status := old.whatsapp_trial_status;
    new.whatsapp_trial_requested_at := old.whatsapp_trial_requested_at;
    new.whatsapp_trial_started_at := old.whatsapp_trial_started_at;
    new.whatsapp_trial_ends_at := old.whatsapp_trial_ends_at;
    -- O número do agente só muda pela RPC do teste ou pela equipe.
    new.whatsapp_numero := old.whatsapp_numero;
    -- Assinante sem whatsapp_numero é liberado pelo telefone do cadastro: travado também.
    if old.status = 'assinante' then new.telefone := old.telefone; end if;
  elsif not public.is_admin() then
    if new.papel is distinct from old.papel then
      raise exception 'papel_so_admin' using hint = 'Só um admin muda o tipo de usuário.';
    end if;
    -- Colaborador trabalha o lead (status, plano, notas, WhatsApp); o histórico fica.
    new.mensagens_usadas := old.mensagens_usadas; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────── 2. opt-in
create or replace function public.registrar_optin(
  p_email text,
  p_nome text default null,
  p_telefone text default null,
  p_tipo text default 'b2c',
  p_empresa text default null,
  p_segmento text default null,
  p_origem text default 'lista-de-espera',
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_token text;
  v_salvo text;
  v_notas text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_notas := nullif(trim(coalesce(p_notas, '')), '');

  -- O where deixa de fora: quem já confirmou; lead que já tem conta (os dados dele não são
  -- reescritos por um formulário público); e quem pediu o link há menos de 5 minutos (sem
  -- reenvio em rajada para o mesmo endereço). Em todos, o returning volta vazio e a resposta
  -- não revela nada a terceiros.
  insert into public.crm_leads
    (email, nome, telefone, tipo, empresa, segmento, origem, status, notas,
     optin_token, optin_expira_em, optin_pedido_em)
  values
    (v_email, nullif(trim(coalesce(p_nome, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
     coalesce(nullif(p_tipo, ''), 'b2c'), nullif(trim(coalesce(p_empresa, '')), ''),
     nullif(trim(coalesce(p_segmento, '')), ''), coalesce(nullif(p_origem, ''), 'lista-de-espera'),
     'novo', v_notas,
     v_token, now() + interval '48 hours', now())
  on conflict (lower(email)) do update set
    nome = coalesce(nullif(trim(coalesce(p_nome, '')), ''), public.crm_leads.nome),
    telefone = coalesce(nullif(trim(coalesce(p_telefone, '')), ''), public.crm_leads.telefone),
    tipo = coalesce(nullif(p_tipo, ''), public.crm_leads.tipo),
    empresa = coalesce(nullif(trim(coalesce(p_empresa, '')), ''), public.crm_leads.empresa),
    segmento = coalesce(nullif(trim(coalesce(p_segmento, '')), ''), public.crm_leads.segmento),
    -- Acrescenta, não substitui: a nota da equipe não some com uma nova inscrição.
    notas = case
      when v_notas is null then public.crm_leads.notas
      when public.crm_leads.notas is null then v_notas
      when position(v_notas in public.crm_leads.notas) > 0 then public.crm_leads.notas
      else public.crm_leads.notas || E'\n' || v_notas
    end,
    optin_token = excluded.optin_token,
    optin_expira_em = excluded.optin_expira_em,
    optin_pedido_em = excluded.optin_pedido_em,
    updated_at = now()
  where public.crm_leads.confirmed_at is null
    and public.crm_leads.user_id is null
    and (public.crm_leads.optin_pedido_em is null or public.crm_leads.optin_pedido_em < now() - interval '5 minutes')
  returning optin_token into v_salvo;

  if v_salvo is null then
    return jsonb_build_object('ok', true, 'ja_confirmado', true);
  end if;

  return jsonb_build_object('ok', true, 'token', v_salvo);
end;
$$;

revoke all on function public.registrar_optin(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_optin(text, text, text, text, text, text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────── 3. conversas só do dono
drop policy if exists "admins read conversations" on public.conversations;
drop policy if exists "admins read messages" on public.messages;

-- ─────────────────────────────────────────────────────────────── 4. funções de admin
create or replace function public.pode_ser_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and lower(u.email) = any (public.emails_admin())
  );
$$;

revoke execute on function public.emails_admin() from public, anon, authenticated;
revoke execute on function public.pode_ser_admin(uuid) from public, anon, authenticated;
