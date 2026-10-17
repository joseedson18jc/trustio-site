-- Busca na web do chat (Exa), 17 out 2026.
-- Quem tem acesso livre (a mesma regra da voz: voz_acesso_livre) tem um teto diário de buscas.
-- Quem está no teste ganha uma demonstração única de algumas buscas (por conta, para sempre).
-- A função de borda "chat" reserva uma busca antes de chamar a Exa e devolve se ela falhar.

create table if not exists public.busca_uso (
  user_id uuid    not null references auth.users (id) on delete cascade,
  dia     date    not null,
  buscas  integer not null default 0 check (buscas >= 0),
  primary key (user_id, dia)
);
create table if not exists public.busca_demo (
  user_id uuid    primary key references auth.users (id) on delete cascade,
  buscas  integer not null default 0 check (buscas >= 0)
);
-- Só a função de borda (service role) mexe aqui; sem políticas, o cliente não lê nem escreve.
alter table public.busca_uso enable row level security;
alter table public.busca_demo enable row level security;

-- Reserva uma busca: acesso livre no teto diário p_limite; teste na demonstração única p_demo.
create or replace function public.reservar_busca(p_user_id uuid, p_limite integer, p_demo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acesso text := public.voz_acesso_livre(p_user_id);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usadas integer;
begin
  if coalesce(p_limite, 0) <= 0 or coalesce(p_demo, -1) < 0 then
    return jsonb_build_object('ok', false, 'error', 'pedido_invalido');
  end if;
  if v_acesso = 'revogado' then return jsonb_build_object('ok', false, 'error', 'acesso_revogado'); end if;

  if v_acesso = 'livre' then
    insert into public.busca_uso (user_id, dia, buscas) values (p_user_id, v_dia, 0) on conflict (user_id, dia) do nothing;
    update public.busca_uso set buscas = buscas + 1
     where user_id = p_user_id and dia = v_dia and buscas < p_limite
    returning buscas into v_usadas;
    if v_usadas is null then return jsonb_build_object('ok', false, 'error', 'busca_limite_diario', 'limite', p_limite); end if;
    return jsonb_build_object('ok', true, 'demo', false, 'usadas', v_usadas, 'limite', p_limite);
  end if;

  insert into public.busca_demo (user_id, buscas) values (p_user_id, 0) on conflict (user_id) do nothing;
  update public.busca_demo set buscas = buscas + 1
   where user_id = p_user_id and buscas < p_demo
  returning buscas into v_usadas;
  if v_usadas is null then return jsonb_build_object('ok', false, 'error', 'busca_demo_esgotada', 'limite', p_demo); end if;
  return jsonb_build_object('ok', true, 'demo', true, 'usadas', v_usadas, 'limite', p_demo,
                            'restante', greatest(0, p_demo - v_usadas));
end $$;

-- A Exa falhou: a busca reservada volta para o mesmo saldo de onde saiu.
create or replace function public.devolver_busca(p_user_id uuid, p_demo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_demo then
    update public.busca_demo set buscas = greatest(0, buscas - 1) where user_id = p_user_id;
  else
    update public.busca_uso set buscas = greatest(0, buscas - 1)
     where user_id = p_user_id and dia = (now() at time zone 'America/Sao_Paulo')::date;
  end if;
end $$;

-- Ainda pode buscar hoje? (o chat só oferece a ferramenta ao modelo se puder)
create or replace function public.busca_situacao(p_user_id uuid, p_limite integer, p_demo integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_acesso text := public.voz_acesso_livre(p_user_id);
  v_usadas integer;
begin
  if v_acesso = 'revogado' then return jsonb_build_object('acesso', v_acesso, 'pode', false); end if;
  if v_acesso = 'livre' then
    select buscas into v_usadas from public.busca_uso
     where user_id = p_user_id and dia = (now() at time zone 'America/Sao_Paulo')::date;
    return jsonb_build_object('acesso', 'livre', 'pode', coalesce(v_usadas, 0) < p_limite);
  end if;
  select buscas into v_usadas from public.busca_demo where user_id = p_user_id;
  return jsonb_build_object('acesso', 'teste', 'pode', coalesce(v_usadas, 0) < p_demo,
                            'demo_restante', greatest(0, p_demo - coalesce(v_usadas, 0)));
end $$;

revoke all on function public.reservar_busca(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.devolver_busca(uuid, boolean) from public, anon, authenticated;
revoke all on function public.busca_situacao(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reservar_busca(uuid, integer, integer) to service_role;
grant execute on function public.devolver_busca(uuid, boolean) to service_role;
grant execute on function public.busca_situacao(uuid, integer, integer) to service_role;
