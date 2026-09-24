-- Trustio · leva para o projeto novo (mjdaluioyutnxlyomzyd) as configurações vivas do
-- projeto anterior (yxkgdgcdvngltnykleig), exportadas em 24/09/2026.
--
-- As migrações anteriores já semeiam estas chaves com "on conflict do nothing", mas alguns
-- valores foram editados depois pelo painel (textos do Hermes, 21/09 04:10). Aqui ficam os
-- valores em uso no momento da troca. Rodar de novo é inofensivo: só regrava os mesmos valores.
--
-- Os dados de pessoas não entram aqui: o projeto anterior tinha apenas registros de teste e
-- a conta do administrador, que se cadastra de novo (ADMIN_EMAILS no workflow o promove).

insert into public.app_settings (key, value) values
  ('acesso_abre_em',       '"2026-10-01T09:00:00-03:00"'::jsonb),
  ('acesso_antecipado_em', '"2026-09-23T09:00:00-03:00"'::jsonb),
  ('free_message_limit',   '5'::jsonb),
  ('hermes_canais',        '["whatsapp", "telegram"]'::jsonb),
  ('hermes_escopo',        '"O agente roda somente no WhatsApp ou no Telegram do cliente, vinculado ao número cadastrado. Sem acesso por computador ou terminal."'::jsonb),
  ('hermes_numero',        '""'::jsonb),
  ('hermes_prompt',        '"Você é o Hermes, o agente de IA da Trustio. Você atende exclusivamente no WhatsApp ou no Telegram do próprio cliente, vinculado ao número que ele cadastrou. Não há acesso por computador, navegador ou terminal: toda a conversa acontece no aplicativo de mensagens dele. Você é autônomo: executa tarefas, organiza rotinas, pesquisa, escreve e resume. Responda em português do Brasil, de forma direta e objetiva. Confirme antes de qualquer ação irreversível."'::jsonb),
  ('hermes_status',        '"rascunho"'::jsonb),
  ('hermes_telegram',      '""'::jsonb),
  ('hermes_trial_dias',    '3'::jsonb),
  ('modelo_rotulo',        '"Definido pelos segredos da função de chat"'::jsonb),
  ('system_prompt',        '"Você é a Trustio, uma assistente de IA privada. Responda em português do Brasil, de forma direta, útil e sem rodeios. Não adicione avisos ou moralizações que o usuário não pediu."'::jsonb)
on conflict (key) do update set value = excluded.value;
