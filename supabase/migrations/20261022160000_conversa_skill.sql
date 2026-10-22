-- Skill ativa por conversa (Skills para baixar, também usáveis no chat do app).
-- A edge function "chat" grava aqui a skill que a pessoa escolheu e, a cada mensagem, põe as
-- instruções dela no prompt de sistema. O texto das skills fica na função (supabase/functions/chat/skills.ts):
-- aqui só o identificador, para o cliente nunca mandar prompt de sistema.
alter table public.conversations add column if not exists skill text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_skill_formato') then
    alter table public.conversations add constraint conversations_skill_formato
      check (skill is null or skill ~ '^[a-z0-9-]{1,64}$');
  end if;
end $$;

comment on column public.conversations.skill is 'Skill ativa na conversa (id do catálogo em supabase/functions/chat/skills.ts); null = nenhuma.';
