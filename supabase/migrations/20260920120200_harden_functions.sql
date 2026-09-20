-- Endurecimento apontado pelo linter: search_path fixo e funções internas fora da API REST.
alter function public.touch_updated_at() set search_path = public;
alter function public.guard_lead_update() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.guard_lead_update() from public, anon, authenticated;

-- is_admin() é usada dentro das políticas RLS: precisa continuar executável por authenticated.
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.free_message_limit() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.free_message_limit() to authenticated;
