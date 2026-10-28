-- Voz em tempo real (28 out 2026): conversa falada com a xAI pelo relé do worker trustio-optin
-- (wss://api.trustio.com.br/voz/tempo-real). Só para assinantes (voz_acesso_livre = 'livre') com o chat
-- aberto para a conta (acesso_do_chat), a mesma porta da função voz e do chat.
-- O relé reserva os segundos de uma sessão antes de abrir a conexão com a xAI e devolve o que
-- sobrou quando a conversa termina; o teto é por dia (fuso de São Paulo). Só o service_role
-- chama as funções e lê a tabela.

create table if not exists public.voz_tempo_real_uso (
  user_id uuid not null,
  dia date not null,
  segundos integer not null default 0 check (segundos >= 0),
  primary key (user_id, dia)
);
alter table public.voz_tempo_real_uso enable row level security;
revoke all on public.voz_tempo_real_uso from public, anon, authenticated;

create or replace function public.voz_tempo_real_hoje()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Reserva até p_segundos para uma sessão, sem passar de p_limite no dia.
create or replace function public.reservar_voz_tempo_real(p_user_id uuid, p_segundos integer, p_limite integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acesso text := public.voz_acesso_livre(p_user_id);
  v_dia date := public.voz_tempo_real_hoje();
  v_usados integer;
  v_dar integer;
begin
  if v_acesso <> 'livre' then
    return jsonb_build_object('ok', false, 'error',
      case when v_acesso = 'teste' then 'voz_tempo_real_assinantes' else 'acesso_revogado' end);
  end if;
  if not coalesce((public.acesso_do_chat(p_user_id) ->> 'aberto')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'chat_ainda_fechado');
  end if;
  if coalesce(p_segundos, 0) <= 0 or coalesce(p_limite, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'pedido_invalido');
  end if;
  insert into public.voz_tempo_real_uso (user_id, dia) values (p_user_id, v_dia) on conflict do nothing;
  select segundos into v_usados from public.voz_tempo_real_uso where user_id = p_user_id and dia = v_dia for update;
  v_dar := least(p_segundos, p_limite - v_usados);
  if v_dar < 10 then
    return jsonb_build_object('ok', false, 'error', 'voz_tempo_real_limite', 'usados', v_usados, 'limite', p_limite);
  end if;
  update public.voz_tempo_real_uso set segundos = segundos + v_dar where user_id = p_user_id and dia = v_dia;
  return jsonb_build_object('ok', true, 'segundos', v_dar, 'dia', v_dia, 'restante', p_limite - v_usados - v_dar);
end $$;

-- Devolve os segundos que a sessão reservou e não usou (nunca abaixo de zero).
create or replace function public.devolver_voz_tempo_real(p_user_id uuid, p_dia date, p_segundos integer)
returns void language sql security definer set search_path = public as $$
  update public.voz_tempo_real_uso set segundos = greatest(0, segundos - greatest(0, coalesce(p_segundos, 0)))
  where user_id = p_user_id and dia = p_dia;
$$;

-- Para o botão: o acesso e quantos segundos ainda restam hoje (sem gastar nada).
create or replace function public.voz_tempo_real_situacao(p_user_id uuid, p_limite integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acesso text := public.voz_acesso_livre(p_user_id); v_usados integer;
begin
  if v_acesso <> 'livre' then return jsonb_build_object('acesso', v_acesso, 'restante', 0); end if;
  if not coalesce((public.acesso_do_chat(p_user_id) ->> 'aberto')::boolean, false) then
    return jsonb_build_object('acesso', 'livre', 'chat_aberto', false, 'restante', 0);
  end if;
  select segundos into v_usados from public.voz_tempo_real_uso where user_id = p_user_id and dia = public.voz_tempo_real_hoje();
  return jsonb_build_object('acesso', 'livre', 'chat_aberto', true, 'restante', greatest(0, p_limite - coalesce(v_usados, 0)));
end $$;

revoke all on function public.voz_tempo_real_hoje() from public, anon, authenticated;
revoke all on function public.reservar_voz_tempo_real(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.devolver_voz_tempo_real(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.voz_tempo_real_situacao(uuid, integer) from public, anon, authenticated;
grant execute on function public.voz_tempo_real_hoje() to service_role;
grant execute on function public.reservar_voz_tempo_real(uuid, integer, integer) to service_role;
grant execute on function public.devolver_voz_tempo_real(uuid, date, integer) to service_role;
grant execute on function public.voz_tempo_real_situacao(uuid, integer) to service_role;
