-- Voz das respostas (xAI, com ElevenLabs de reserva), 17 out 2026.
-- Quem tem acesso livre (assinante, liberado, admin, colaborador, cliente: a mesma regra do
-- reserve_chat_message) tem um teto diário de caracteres. Quem está no teste ganha uma
-- demonstração única (por conta, para sempre), para ouvir a voz antes de assinar.
-- A função de borda "voz" reserva os caracteres antes de chamar o provedor e devolve se ele falhar.

create table if not exists public.voz_uso (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  dia        date    not null,
  caracteres integer not null default 0 check (caracteres >= 0),
  primary key (user_id, dia)
);
create table if not exists public.voz_demo (
  user_id    uuid    primary key references auth.users (id) on delete cascade,
  caracteres integer not null default 0 check (caracteres >= 0)
);
-- Só a função de borda (service role) mexe aqui; sem políticas, o cliente não lê nem escreve.
alter table public.voz_uso enable row level security;
alter table public.voz_demo enable row level security;

-- Acesso livre? Mesmas condições do reserve_chat_message (revogado, cancelado e janela de acesso).
create or replace function public.voz_acesso_livre(p_user_id uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_lead public.crm_leads;
begin
  if not public.conta_acesso_permitido(p_user_id) then return 'revogado'; end if;
  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if not found then return 'teste'; end if;
  if v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login')
    or (v_lead.status = 'cancelado' and v_lead.acesso_modo <> 'liberado')
    or (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
    or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now()) then
    return 'revogado';
  end if;
  if v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente') then
    return 'livre';
  end if;
  return 'teste';
end $$;

-- Reserva p_caracteres: assinante no teto diário p_limite; teste na demonstração única p_demo.
create or replace function public.reservar_voz(p_user_id uuid, p_caracteres integer, p_limite integer, p_demo integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_acesso text := public.voz_acesso_livre(p_user_id);
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usados integer;
begin
  if p_caracteres is null or p_caracteres <= 0 or coalesce(p_limite, 0) <= 0 or coalesce(p_demo, -1) < 0 then
    return jsonb_build_object('ok', false, 'error', 'pedido_invalido');
  end if;
  if v_acesso = 'revogado' then return jsonb_build_object('ok', false, 'error', 'acesso_revogado'); end if;

  if v_acesso = 'livre' then
    insert into public.voz_uso (user_id, dia, caracteres) values (p_user_id, v_dia, 0) on conflict (user_id, dia) do nothing;
    update public.voz_uso set caracteres = caracteres + p_caracteres
     where user_id = p_user_id and dia = v_dia and caracteres + p_caracteres <= p_limite
    returning caracteres into v_usados;
    if v_usados is null then
      select caracteres into v_usados from public.voz_uso where user_id = p_user_id and dia = v_dia;
      return jsonb_build_object('ok', false, 'error', 'voz_limite_diario', 'usados', v_usados, 'limite', p_limite);
    end if;
    return jsonb_build_object('ok', true, 'demo', false, 'usados', v_usados, 'limite', p_limite);
  end if;

  -- Teste: a demonstração. A última resposta que ainda cabe em parte é aceita inteira, para a
  -- pessoa nunca ouvir uma frase cortada; depois disso, acabou.
  insert into public.voz_demo (user_id, caracteres) values (p_user_id, 0) on conflict (user_id) do nothing;
  update public.voz_demo set caracteres = caracteres + p_caracteres
   where user_id = p_user_id and caracteres < p_demo
  returning caracteres into v_usados;
  if v_usados is null then
    return jsonb_build_object('ok', false, 'error', 'voz_demo_esgotada', 'limite', p_demo);
  end if;
  return jsonb_build_object('ok', true, 'demo', true, 'usados', v_usados, 'limite', p_demo,
                            'restante', greatest(0, p_demo - v_usados));
end $$;

-- O provedor falhou: os caracteres reservados voltam para o mesmo saldo de onde saíram.
create or replace function public.devolver_voz(p_user_id uuid, p_caracteres integer, p_demo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_demo then
    update public.voz_demo set caracteres = greatest(0, caracteres - greatest(0, coalesce(p_caracteres, 0))) where user_id = p_user_id;
  else
    update public.voz_uso set caracteres = greatest(0, caracteres - greatest(0, coalesce(p_caracteres, 0)))
     where user_id = p_user_id and dia = (now() at time zone 'America/Sao_Paulo')::date;
  end if;
end $$;

-- Quanto da demonstração ainda resta (o chat mostra o selo "Grátis" enquanto houver).
create or replace function public.voz_situacao(p_user_id uuid, p_demo integer)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_acesso text := public.voz_acesso_livre(p_user_id); v_usados integer;
begin
  if v_acesso <> 'teste' then return jsonb_build_object('acesso', v_acesso); end if;
  select caracteres into v_usados from public.voz_demo where user_id = p_user_id;
  return jsonb_build_object('acesso', 'teste', 'demo_restante', greatest(0, p_demo - coalesce(v_usados, 0)));
end $$;

revoke all on function public.voz_acesso_livre(uuid) from public, anon, authenticated;
revoke all on function public.reservar_voz(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.devolver_voz(uuid, integer, boolean) from public, anon, authenticated;
revoke all on function public.voz_situacao(uuid, integer) from public, anon, authenticated;
grant execute on function public.voz_acesso_livre(uuid) to service_role;
grant execute on function public.reservar_voz(uuid, integer, integer, integer) to service_role;
grant execute on function public.devolver_voz(uuid, integer, boolean) to service_role;
grant execute on function public.voz_situacao(uuid, integer) to service_role;
