-- Voz das respostas (ElevenLabs), 17 out 2026: só para quem tem acesso livre (assinante, liberado,
-- admin, colaborador, cliente: a mesma regra do reserve_chat_message) e com um teto diário de
-- caracteres por conta, porque cada caractere falado é cobrado pela ElevenLabs.
-- A função de borda "voz" reserva os caracteres antes de chamar a ElevenLabs e devolve se a chamada falhar.

create table if not exists public.voz_uso (
  user_id    uuid    not null references auth.users (id) on delete cascade,
  dia        date    not null,
  caracteres integer not null default 0 check (caracteres >= 0),
  primary key (user_id, dia)
);
-- Só a função de borda (service role) mexe aqui; sem políticas, o cliente não lê nem escreve.
alter table public.voz_uso enable row level security;

create or replace function public.reservar_voz(p_user_id uuid, p_caracteres integer, p_limite integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lead public.crm_leads;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usados integer;
begin
  if p_caracteres is null or p_caracteres <= 0 or p_limite is null or p_limite <= 0 then
    return jsonb_build_object('ok', false, 'error', 'pedido_invalido');
  end if;
  if not public.conta_acesso_permitido(p_user_id) then
    return jsonb_build_object('ok', false, 'error', 'acesso_revogado');
  end if;
  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if not found
    or v_lead.acesso_modo in ('revogado','bloqueado','bloqueado_login')
    or (v_lead.status = 'cancelado' and v_lead.acesso_modo <> 'liberado')
    or (v_lead.acesso_inicio is not null and v_lead.acesso_inicio > now())
    or (v_lead.acesso_fim is not null and v_lead.acesso_fim <= now())
    or not (v_lead.acesso_modo = 'liberado' or v_lead.status = 'assinante'
            or v_lead.papel in ('admin', 'colaborador', 'cliente')) then
    return jsonb_build_object('ok', false, 'error', 'voz_so_assinantes');
  end if;

  insert into public.voz_uso (user_id, dia, caracteres) values (p_user_id, v_dia, 0)
  on conflict (user_id, dia) do nothing;
  update public.voz_uso set caracteres = caracteres + p_caracteres
   where user_id = p_user_id and dia = v_dia and caracteres + p_caracteres <= p_limite
  returning caracteres into v_usados;
  if v_usados is null then
    select caracteres into v_usados from public.voz_uso where user_id = p_user_id and dia = v_dia;
    return jsonb_build_object('ok', false, 'error', 'voz_limite_diario', 'usados', v_usados, 'limite', p_limite);
  end if;
  return jsonb_build_object('ok', true, 'usados', v_usados, 'limite', p_limite);
end $$;

-- A chamada à ElevenLabs falhou: os caracteres reservados voltam para a conta.
create or replace function public.devolver_voz(p_user_id uuid, p_caracteres integer)
returns void language sql security definer set search_path = public as $$
  update public.voz_uso set caracteres = greatest(0, caracteres - greatest(0, coalesce(p_caracteres, 0)))
   where user_id = p_user_id and dia = (now() at time zone 'America/Sao_Paulo')::date;
$$;

revoke all on function public.reservar_voz(uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.devolver_voz(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_voz(uuid, integer, integer) to service_role;
grant execute on function public.devolver_voz(uuid, integer) to service_role;
