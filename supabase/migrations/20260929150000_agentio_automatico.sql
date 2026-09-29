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
-- O resto já existe e continua igual: whatsapp_trial_inicio (antes do update) preenche início,
-- fim (app_settings.hermes_trial_dias) e zera as marcas de aviso; whatsapp_trial_avisar (depois
-- do update) chama a função aviso-agente, que manda o e-mail e o WhatsApp de boas-vindas. Essa
-- chamada é assíncrona (pg_net) e, sem os segredos no Vault, só registra no log: a confirmação
-- do e-mail nunca falha por causa do aviso.
--
-- Migração nova de propósito: as anteriores já estão aplicadas.

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

    -- Mesma marca da RPC do teste: o guard_lead_update deixa estas colunas mudarem.
    perform set_config('trustio.lead_rpc', 'on', true);
    update public.crm_leads
       set whatsapp_numero = case when whatsapp_trial_status = 'nao_solicitado' then v_tel_cadastro else whatsapp_numero end,
           whatsapp_trial_requested_at = coalesce(whatsapp_trial_requested_at, now()),
           whatsapp_trial_status = 'ativo'
     where user_id = new.id
       and (
         (whatsapp_trial_status = 'solicitado' and whatsapp_numero is not null)
         or (whatsapp_trial_status = 'nao_solicitado' and v_tel_cadastro is not null)
       );
    perform set_config('trustio.lead_rpc', 'off', true);
  end if;
  if new.email is distinct from old.email then
    update public.crm_leads set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;

revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
