-- Trustio · confirmação que chega de um link enviado antes da troca para este projeto.
--
-- Entre 24/09 e a troca, a lista de espera gravava no KV e no D1 do Cloudflare. Um link
-- enviado nesse período continua valendo depois da troca: o worker confere o link lá e,
-- antes de consumi-lo, grava a confirmação aqui, para o CRM mostrar a pessoa como
-- confirmada na hora. Repetir é inofensivo: campos vazios não apagam os existentes, a
-- origem registrada primeiro é mantida e confirmed_at guarda a primeira data.

create or replace function public.importar_optin_confirmado(
  p_email text,
  p_nome text default null,
  p_telefone text default null,
  p_tipo text default 'b2c',
  p_empresa text default null,
  p_segmento text default null,
  p_origem text default 'lista-de-espera',
  p_notas text default null,
  p_criado_em timestamptz default null,
  p_confirmado_em timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  insert into public.crm_leads
    (email, nome, telefone, tipo, empresa, segmento, origem, status, notas,
     confirmed_at, created_at)
  values
    (v_email, nullif(trim(coalesce(p_nome, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
     case when p_tipo in ('b2c', 'b2b') then p_tipo else 'b2c' end,
     nullif(trim(coalesce(p_empresa, '')), ''), nullif(trim(coalesce(p_segmento, '')), ''),
     coalesce(nullif(p_origem, ''), 'lista-de-espera'), 'email_confirmado',
     nullif(trim(coalesce(p_notas, '')), ''),
     coalesce(p_confirmado_em, now()), coalesce(p_criado_em, now()))
  on conflict (lower(email)) do update set
    nome = coalesce(public.crm_leads.nome, excluded.nome),
    telefone = coalesce(public.crm_leads.telefone, excluded.telefone),
    empresa = coalesce(public.crm_leads.empresa, excluded.empresa),
    segmento = coalesce(public.crm_leads.segmento, excluded.segmento),
    notas = coalesce(public.crm_leads.notas, excluded.notas),
    confirmed_at = coalesce(public.crm_leads.confirmed_at, excluded.confirmed_at),
    status = case when public.crm_leads.status = 'novo' then 'email_confirmado' else public.crm_leads.status end,
    optin_token = null,
    optin_expira_em = null,
    updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.importar_optin_confirmado(text, text, text, text, text, text, text, text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.importar_optin_confirmado(text, text, text, text, text, text, text, text, timestamptz, timestamptz) to service_role;
