-- Trustio · o que o painel mestre (/admin/) precisa para existir.
--
-- Esta migração estava só no banco de produção: foi aplicada por fora quando o painel
-- foi construído, e o arquivo nunca entrou no repositório. Sem ela, um ambiente
-- reconstruído a partir daqui sobe com /admin/ quebrado — sem admin_overview() para
-- os números e a fila, e sem as configurações do Hermes que a tela lê e grava.
--
-- O número da versão é anterior ao de rollout_acesso de propósito: é a ordem em que os
-- objetos nasceram. Tudo é idempotente, então reaplicar num ambiente que já os tem não
-- muda nada — em particular, o on conflict do nothing preserva a configuração viva.

-- ── configurações do agente Hermes e rótulo do modelo ────────────────────────
-- O escopo e a instrução carregam a regra que o agente não pode contrariar: ele atende
-- no WhatsApp ou no Telegram da própria pessoa, nunca por computador ou terminal.
insert into public.app_settings (key, value) values
  ('hermes_status',      to_jsonb('rascunho'::text)),
  ('hermes_numero',      to_jsonb(''::text)),
  ('hermes_telegram',    to_jsonb(''::text)),
  ('hermes_canais',      '["whatsapp", "telegram"]'::jsonb),
  ('hermes_trial_dias',  to_jsonb(3)),
  ('hermes_escopo',      to_jsonb('O agente roda somente no WhatsApp ou no Telegram do cliente, vinculado ao número cadastrado. Sem acesso por computador ou terminal.'::text)),
  ('hermes_prompt',      to_jsonb('Você é o Hermes, o agente de IA da Trustio. Você atende exclusivamente no WhatsApp ou no Telegram do próprio cliente, vinculado ao número que ele cadastrou. Não há acesso por computador, navegador ou terminal: toda a conversa acontece no aplicativo de mensagens dele. Você é autônomo: executa tarefas, organiza rotinas, pesquisa, escreve e resume. Responda em português do Brasil, de forma direta e objetiva. Confirme antes de qualquer ação irreversível.'::text)),
  ('modelo_rotulo',      to_jsonb('Definido pelos segredos da função de chat'::text))
on conflict (key) do nothing;

-- ── resumo da operação para o painel ─────────────────────────────────────────
-- Uma chamada só: os seis números do topo, a lista de administradores e a fila de
-- números esperando ativação. Security definer porque atravessa auth.users e o RLS
-- de conversations/messages; a primeira linha garante que só administrador entra.
create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'somente administradores'; end if;
  return jsonb_build_object(
    'leads',            (select count(*) from public.crm_leads),
    'confirmados',      (select count(*) from public.crm_leads where confirmed_at is not null),
    'assinantes',       (select count(*) from public.crm_leads where status = 'assinante'),
    'wa_pendentes',     (select count(*) from public.crm_leads where whatsapp_trial_status = 'solicitado'),
    'wa_ativos',        (select count(*) from public.crm_leads where whatsapp_trial_status = 'ativo'),
    'conversas',        (select count(*) from public.conversations),
    'mensagens',        (select count(*) from public.messages),
    'admins',           (select coalesce(jsonb_agg(u.email order by u.email), '[]'::jsonb)
                           from public.admins a join auth.users u on u.id = a.user_id),
    'pendentes',        (select coalesce(jsonb_agg(jsonb_build_object(
                             'id', id, 'nome', nome, 'email', email, 'numero', whatsapp_numero,
                             'pedido_em', whatsapp_trial_requested_at) order by whatsapp_trial_requested_at), '[]'::jsonb)
                           from public.crm_leads where whatsapp_trial_status = 'solicitado')
  );
end;
$$;

revoke all on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
