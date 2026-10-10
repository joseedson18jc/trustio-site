-- Leitura restrita à investigação do CRM; mantém as políticas do chat só para o dono.

create or replace function public.crm_investigar_conversations(p_user_id uuid)
returns table (id uuid, title text, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso exclusivo de administrador' using errcode = '42501';
  end if;
  return query select t.id, t.title, t.created_at, t.updated_at from public.conversations t
    where t.user_id = p_user_id order by t.created_at, t.id;
end;
$$;
revoke all on function public.crm_investigar_conversations(uuid) from public, anon, authenticated;
grant execute on function public.crm_investigar_conversations(uuid) to authenticated;

create or replace function public.crm_investigar_messages(p_user_id uuid)
returns table (id uuid, conversation_id uuid, role text, content text, model text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso exclusivo de administrador' using errcode = '42501';
  end if;
  return query select t.id, t.conversation_id, t.role, t.content, t.model, t.created_at from public.messages t
    where t.user_id = p_user_id order by t.created_at, t.id;
end;
$$;
revoke all on function public.crm_investigar_messages(uuid) from public, anon, authenticated;
grant execute on function public.crm_investigar_messages(uuid) to authenticated;
