-- Trustio · Agentio automático na confirmação do e-mail
--
-- Até aqui, o teste de 3 dias do Agentio (agente no WhatsApp) só começava quando alguém da
-- equipe clicava "Ativar 3 dias" no /crm/. Agora ele começa sozinho no momento em que a pessoa
-- confirma o e-mail, desde que ela tenha pedido o agente com um número:
--
--   · informou o telefone no próprio cadastro (o campo diz "Só usamos para ativar o bônus do
--     agente no WhatsApp, no número que você informar"): o número vem de raw_user_meta_data,
--     não de um telefone que o lead já tinha de outra origem (ex.: lista de espera), que não
--     foi dado para isso; ou
--   · pediu o agente no chat antes de confirmar (status "solicitado", com whatsapp_numero).
--
-- Sem número, nada muda: a pessoa pode pedir depois no chat, e a equipe ativa no /crm/.
-- Teste "ativo" ou "encerrado" nunca é reiniciado por aqui.
--
-- O resto já existe: whatsapp_trial_inicio (antes do update) preenche início, fim
-- (app_settings.hermes_trial_dias) e zera as marcas de aviso; whatsapp_trial_avisar (depois do
-- update) chama a função aviso-agente. Essa chamada é assíncrona (pg_net) e, sem os segredos no
-- Vault, só registra no log: a confirmação do e-mail nunca falha por causa do aviso.
--
-- O número digitado no cadastro não é verificado: alguém poderia pôr o WhatsApp de outra pessoa.
-- Por isso a ativação automática fica marcada (crm_leads.whatsapp_ativacao = 'automatica') e o
-- aviso de boas-vindas vai só por e-mail, para o endereço que a pessoa acabou de confirmar, com
-- as instruções ("salve o número do Agentio e mande um Oi"). Nenhuma mensagem sai para o número;
-- o agente só responde quando o próprio número puxa a conversa. Quando a equipe ativa no /crm/
-- (whatsapp_ativacao = 'equipe'), e-mail e WhatsApp seguem como antes.
--
-- Migração nova de propósito: as anteriores já estão aplicadas.

-- ─────────────────────────────────────────────────────────────── origem da ativação
alter table public.crm_leads add column if not exists whatsapp_ativacao text
  check (whatsapp_ativacao in ('automatica', 'equipe'));

-- Toda ativação registra a origem: automática só quando vem da confirmação do e-mail (marca
-- trustio.ativacao_automatica, ligada abaixo); qualquer outra (equipe no /crm/) é 'equipe'.
create or replace function public.whatsapp_trial_inicio()
returns trigger language plpgsql set search_path = public as $$
declare v_dias integer;
begin
  if new.whatsapp_trial_status = 'ativo' and old.whatsapp_trial_status is distinct from 'ativo' then
    new.whatsapp_aviso_email_reserva := null; new.whatsapp_aviso_email_erro := null;
    new.whatsapp_aviso_wa_reserva := null; new.whatsapp_aviso_wa_erro := null;
    new.whatsapp_ativacao := case when current_setting('trustio.ativacao_automatica', true) = 'on' then 'automatica' else 'equipe' end;
    if new.whatsapp_trial_started_at is not distinct from old.whatsapp_trial_started_at then
      select coalesce((value #>> '{}')::integer, 3) into v_dias from public.app_settings where key = 'hermes_trial_dias';
      new.whatsapp_trial_started_at := now();
      new.whatsapp_trial_ends_at := now() + make_interval(days => greatest(1, coalesce(v_dias, 3)));
      new.whatsapp_numero := coalesce(new.whatsapp_numero, nullif(regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g'), ''));
    end if;
  end if;
  return new;
end $$;

-- A regra "número não verificado não recebe WhatsApp" vale no banco, não só na função: a
-- reserva do canal WhatsApp é recusada para ativação automática. Qualquer versão da função
-- aviso-agente passa por aqui antes de enviar (a anterior entende a recusa como "já saiu" e
-- segue só com o e-mail), então a regra vale desde esta migração, mesmo antes de a função nova
-- ser publicada ou se a publicação falhar.
create or replace function public.aviso_reservar(p_lead_id uuid, p_canal text, p_inicio timestamptz)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare c record; v_marca timestamptz := clock_timestamp(); v_ok uuid;
begin
  if p_canal = 'whatsapp' and exists (
    select 1 from public.crm_leads where id = p_lead_id and whatsapp_ativacao = 'automatica'
  ) then
    return null;
  end if;
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

revoke execute on function public.aviso_reservar(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.aviso_reservar(uuid, text, timestamptz) to service_role;

-- O cliente não muda a origem da ativação pelo próprio cadastro (mesmo guard de 26/09, com
-- whatsapp_ativacao entre as colunas travadas).
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
    new.whatsapp_ativacao := old.whatsapp_ativacao;
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

-- ─────────────────────────────────────────────────────────────── confirmação do e-mail
create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tel_cadastro text;
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.crm_leads
       set status = case when status = 'novo' then 'email_confirmado' else status end,
           confirmed_at = new.email_confirmed_at
     where user_id = new.id;

    -- agentio automatico: o teste do agente no WhatsApp começa na confirmação do e-mail
    -- para quem pediu com um número (no cadastro ou no chat). Só dígitos, 10 a 15, como a
    -- RPC request_whatsapp_trial.
    v_tel_cadastro := regexp_replace(coalesce(new.raw_user_meta_data ->> 'telefone', ''), '\D', '', 'g');
    if length(v_tel_cadastro) not between 10 and 15 then v_tel_cadastro := null; end if;

    -- Mesma marca da RPC do teste (o guard_lead_update deixa estas colunas mudarem) e a marca
    -- da origem, lida pelo whatsapp_trial_inicio.
    perform set_config('trustio.lead_rpc', 'on', true);
    perform set_config('trustio.ativacao_automatica', 'on', true);
    update public.crm_leads
       set whatsapp_numero = case when whatsapp_trial_status = 'nao_solicitado' then v_tel_cadastro else whatsapp_numero end,
           whatsapp_trial_requested_at = coalesce(whatsapp_trial_requested_at, now()),
           whatsapp_trial_status = 'ativo'
     where user_id = new.id
       and (
         (whatsapp_trial_status = 'solicitado' and whatsapp_numero is not null)
         or (whatsapp_trial_status = 'nao_solicitado' and v_tel_cadastro is not null)
       );
    perform set_config('trustio.ativacao_automatica', 'off', true);
    perform set_config('trustio.lead_rpc', 'off', true);
  end if;
  if new.email is distinct from old.email then
    update public.crm_leads set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;

revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
