-- Trustio · Abre o chat para qualquer conta cadastrada no teste grátis com e-mail confirmado.
-- Limite rigoroso de 5 perguntas por conta. Ao terminar, o chat bloqueia e direciona
-- para a escolha de plano pago (planos.html).

insert into public.app_settings (key, value) values
  ('acesso_abre_em', to_jsonb(now()::text)),
  ('free_message_limit', '5'::jsonb)
on conflict (key) do update set value = excluded.value;
