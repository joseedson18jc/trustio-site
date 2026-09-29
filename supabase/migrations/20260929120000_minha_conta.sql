-- Trustio · "Minha conta" no chat (/app/)
--
-- 1. preferencias_usuario: como a pessoa quer o chat (estilo de resposta, instruções pessoais,
--    modelo, Enter envia, tamanho do texto) e se tem foto de perfil. Tabela própria, e não o
--    crm_leads: a equipe lê o CRM, e as instruções pessoais são da pessoa. Nem a equipe nem o
--    admin leem esta tabela pelo site; a função do chat lê com a chave de serviço.
-- 2. Bucket privado "avatares": cada conta só lê e grava a própria pasta (<user_id>/…). A foto
--    chega ao navegador por download autenticado, nunca por link público.
--
-- A lista de modelos que a pessoa pode escolher fica em app_settings.modelos_chat
-- ([{"id": "...", "rotulo": "...", "descricao": "..."}]), definida pelo admin. Sem ela, o
-- chat usa só o modelo padrão e o seletor aparece travado.

-- ─────────────────────────────────────────────────────────────── 1. preferências
create table if not exists public.preferencias_usuario (
  user_id uuid primary key references auth.users(id) on delete cascade,
  estilo text not null default 'equilibrado' check (estilo in ('direto', 'equilibrado', 'detalhado')),
  instrucoes text not null default '' check (char_length(instrucoes) <= 1500),
  modelo text check (modelo is null or char_length(modelo) <= 200),
  enter_envia boolean not null default true,
  fonte text not null default 'normal' check (fonte in ('normal', 'grande')),
  avatar_em timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.preferencias_usuario enable row level security;

drop policy if exists "preferencias: dono" on public.preferencias_usuario;
create policy "preferencias: dono" on public.preferencias_usuario
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.preferencias_usuario from anon;
grant select, insert, update, delete on public.preferencias_usuario to authenticated;

create or replace function public.preferencias_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists preferencias_usuario_touch on public.preferencias_usuario;
create trigger preferencias_usuario_touch before update on public.preferencias_usuario
  for each row execute function public.preferencias_touch();

-- ─────────────────────────────────────────────────────────────── 2. fotos de perfil
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatares: dono le" on storage.objects;
create policy "avatares: dono le" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: dono envia" on storage.objects;
create policy "avatares: dono envia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: dono troca" on storage.objects;
create policy "avatares: dono troca" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatares: dono apaga" on storage.objects;
create policy "avatares: dono apaga" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text);
