-- Trustio · aplica no servidor as datas de abertura que o site anuncia.
--
-- Antes desta migração, "o chat está aberto" era inferido da existência da chave do
-- provedor: no instante em que a chave fosse configurada para atender o acesso
-- antecipado de 23/09, qualquer conta com e-mail confirmado conseguiria conversar,
-- contrariando as datas publicadas. A elegibilidade passa a ser decidida aqui.

insert into public.app_settings (key, value) values
  ('acesso_abre_em', to_jsonb('2026-10-01T09:00:00-03:00'::text)),
  ('acesso_antecipado_em', to_jsonb('2026-09-23T09:00:00-03:00'::text))
on conflict (key) do nothing;

-- Quem pode conversar agora, e por quê. Uma fonte só, usada pela função de chat
-- tanto no envio quanto na verificação de saúde.
create or replace function public.acesso_do_chat(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  abre timestamptz;
  antecipado timestamptz;
  eh_admin boolean;
  eh_pre boolean;
begin
  select (value #>> '{}')::timestamptz into abre
    from public.app_settings where key = 'acesso_abre_em';
  select (value #>> '{}')::timestamptz into antecipado
    from public.app_settings where key = 'acesso_antecipado_em';

  eh_admin := exists (select 1 from public.admins a where a.user_id = p_user_id);
  -- Pré-assinante é quem o CRM já marcou como assinante: é o mesmo estado que o
  -- dono ajusta quando o pagamento entra, então não há um segundo conceito a manter.
  eh_pre := exists (
    select 1 from public.crm_leads l
    where l.user_id = p_user_id and l.status = 'assinante'
  );

  -- Sem data configurada não há portão: o chat responde normalmente.
  if eh_admin or abre is null or now() >= abre then
    return jsonb_build_object(
      'aberto', true,
      'motivo', case when eh_admin then 'admin' when abre is null then 'sem_portao' else 'lancamento' end,
      'abre_em', abre, 'antecipado_em', antecipado);
  end if;

  if eh_pre and antecipado is not null and now() >= antecipado then
    return jsonb_build_object('aberto', true, 'motivo', 'antecipado',
      'abre_em', abre, 'antecipado_em', antecipado);
  end if;

  return jsonb_build_object(
    'aberto', false,
    'motivo', case when eh_pre then 'antes_do_antecipado' else 'antes_do_lancamento' end,
    'pre_assinante', eh_pre,
    'abre_em', abre, 'antecipado_em', antecipado);
end;
$$;

revoke all on function public.acesso_do_chat(uuid) from public;
revoke all on function public.acesso_do_chat(uuid) from anon, authenticated;
grant execute on function public.acesso_do_chat(uuid) to service_role;

comment on function public.acesso_do_chat(uuid) is
  'Decide se a conta pode conversar agora: administradores sempre, pré-assinantes a partir de acesso_antecipado_em, todo mundo a partir de acesso_abre_em.';
