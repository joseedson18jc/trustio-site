-- Botão parar do chat (2 nov 2026). Cada envio do chat leva um id gerado no navegador (pedido_id);
-- o botão ■ pede à função de chat que grave esse id aqui. A resposta em andamento confere a tabela
-- a cada segundo e, ao achar o próprio id, para de ler o modelo, salva o que já foi escrito e
-- libera a fila do servidor. Só a função (service_role) lê e escreve: o navegador nunca acessa.
create table if not exists public.parar_chat (
  pedido_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);
create index if not exists parar_chat_user_idx on public.parar_chat (user_id, criado_em);

alter table public.parar_chat enable row level security;
-- Sem políticas: com RLS ligado, anon e authenticated não veem nada. Os grants padrão do Supabase
-- também saem, para a tabela nem aparecer para o navegador.
revoke all on public.parar_chat from anon, authenticated;
grant select, insert, delete on public.parar_chat to service_role;
