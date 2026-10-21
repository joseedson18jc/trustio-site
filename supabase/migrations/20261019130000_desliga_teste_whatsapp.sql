-- Trustio · teste de 3 dias do agente no WhatsApp desligado (19/10/2026)
--
-- Revisão legal da campanha B2C (G2): o onboarding do Agentio roda em Baileys, ponte não oficial
-- do WhatsApp, e o teste grátis não pode ser oferecido. O site e o e-mail de confirmação já não
-- oferecem o teste (#149, #152); esta migração fecha o mesmo caminho no banco, para ninguém
-- começar um teste novo por fora da interface.
--
-- Uma chave só, app_settings.whatsapp_teste_aberto (false). Fechada:
--   · request_whatsapp_trial devolve {ok:false, error:'teste_encerrado'} e não muda o lead;
--   · a confirmação do e-mail não começa o teste, mesmo com telefone no cadastro, e nunca falha;
--   · nenhuma escrita leva o teste para "solicitado" ou "ativo" (a RPC da equipe,
--     activate_whatsapp_trial, e a edição direta no /crm/ recebem o erro abaixo).
-- Continua valendo: testes já ativos vão até o fim do prazo (hermes-autorizados não muda), e
-- qualquer teste ou pedido pode ser encerrado.
--
-- Reabrir (por exemplo, com o Agentio na Cloud API oficial), no SQL Editor:
--   update public.app_settings set value = 'true'::jsonb, updated_at = now() where key = 'whatsapp_teste_aberto';

insert into public.app_settings (key, value) values ('whatsapp_teste_aberto', 'false'::jsonb)
on conflict (key) do nothing;

-- Comparação, não conversão: um valor malformado conta como fechado, sem erro (a confirmação do
-- e-mail passa por aqui e não pode falhar). Definer: app_settings só é legível para admins.
create or replace function public.teste_whatsapp_aberto()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = 'whatsapp_teste_aberto'), false)
$$;
revoke execute on function public.teste_whatsapp_aberto() from public, anon;
grant execute on function public.teste_whatsapp_aberto() to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────── guarda de todas as escritas
create or replace function public.guardar_teste_whatsapp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.whatsapp_trial_status in ('solicitado', 'ativo')
     and (tg_op = 'INSERT' or old.whatsapp_trial_status is distinct from new.whatsapp_trial_status)
     and not public.teste_whatsapp_aberto() then
    raise exception 'O teste do agente no WhatsApp está desligado.';
  end if;
  return new;
end $$;
revoke execute on function public.guardar_teste_whatsapp() from public, anon, authenticated;

drop trigger if exists crm_leads_teste_whatsapp_fechado on public.crm_leads;
create trigger crm_leads_teste_whatsapp_fechado
  before insert or update of whatsapp_trial_status on public.crm_leads
  for each row execute function public.guardar_teste_whatsapp();

-- ─────────────────────────────────────────────────────────────── pedido pelo chat
-- Igual a 20260920120500, com a chave antes de qualquer escrita.
create or replace function public.request_whatsapp_trial(p_numero text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num text := regexp_replace(coalesce(p_numero, ''), '\D', '', 'g'); v_lead public.crm_leads;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'unauthorized'); end if;
  if not public.teste_whatsapp_aberto() then return jsonb_build_object('ok', false, 'error', 'teste_encerrado'); end if;
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

-- ─────────────────────────────────────────────────────────────── confirmação do e-mail
-- Igual a 20260929150000, com o bloco do teste inteiro (marcas incluídas) atrás da chave.
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

    if public.teste_whatsapp_aberto() then
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
  end if;
  if new.email is distinct from old.email then
    update public.crm_leads set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;

revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
