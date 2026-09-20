-- Cota gratuita legível por qualquer usuário autenticado (o painel só é visível a admins).
create or replace function public.free_message_limit()
returns integer language sql stable security definer set search_path = public as $$
  select coalesce((select (value)::text::integer from public.app_settings where key = 'free_message_limit'), 0);
$$;
grant execute on function public.free_message_limit() to authenticated;
revoke execute on function public.free_message_limit() from anon;
