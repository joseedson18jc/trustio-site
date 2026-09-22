-- Trustio · lista de espera com dupla confirmação, no mesmo CRM da conta.
--
-- Antes, a lista de espera vivia num armazenamento próprio do Worker, separada do
-- crm_leads. Duas listas de clientes é uma a mais do que a operação consegue manter
-- coerente. Aqui a inscrição vira um lead como qualquer outro, sem user_id (porque
-- ainda não existe conta), com um token de confirmação de prazo curto.

alter table public.crm_leads
  add column if not exists optin_token text,
  add column if not exists optin_expira_em timestamptz,
  add column if not exists optin_pedido_em timestamptz;

-- Busca pelo token precisa ser rápida e o token é único enquanto estiver valendo.
create unique index if not exists crm_leads_optin_token_idx
  on public.crm_leads (optin_token) where optin_token is not null;

comment on column public.crm_leads.optin_token is
  'Token de confirmação da lista de espera. Apagado assim que a pessoa confirma.';

-- Registra a inscrição e devolve o token a enviar por e-mail. Só o Worker chama,
-- com a chave de serviço: a função é security definer e negada a anon/authenticated.
create or replace function public.registrar_optin(
  p_email text,
  p_nome text default null,
  p_telefone text default null,
  p_tipo text default 'b2c',
  p_empresa text default null,
  p_segmento text default null,
  p_origem text default 'lista-de-espera',
  p_notas text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_token text;
  v_lead public.crm_leads%rowtype;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  select * into v_lead from public.crm_leads where lower(email) = v_email;

  -- Já confirmado: nada a reenviar, e a resposta não revela que a pessoa está na lista.
  if found and v_lead.confirmed_at is not null then
    return jsonb_build_object('ok', true, 'ja_confirmado', true);
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  if found then
    update public.crm_leads set
      nome = coalesce(nullif(trim(coalesce(p_nome, '')), ''), nome),
      telefone = coalesce(nullif(trim(coalesce(p_telefone, '')), ''), telefone),
      tipo = coalesce(nullif(p_tipo, ''), tipo),
      empresa = coalesce(nullif(trim(coalesce(p_empresa, '')), ''), empresa),
      segmento = coalesce(nullif(trim(coalesce(p_segmento, '')), ''), segmento),
      notas = coalesce(nullif(trim(coalesce(p_notas, '')), ''), notas),
      optin_token = v_token,
      optin_expira_em = now() + interval '48 hours',
      optin_pedido_em = now(),
      updated_at = now()
    where id = v_lead.id;
  else
    insert into public.crm_leads
      (email, nome, telefone, tipo, empresa, segmento, origem, status, notas,
       optin_token, optin_expira_em, optin_pedido_em)
    values
      (v_email, nullif(trim(coalesce(p_nome, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
       coalesce(nullif(p_tipo, ''), 'b2c'), nullif(trim(coalesce(p_empresa, '')), ''),
       nullif(trim(coalesce(p_segmento, '')), ''), coalesce(nullif(p_origem, ''), 'lista-de-espera'),
       'novo', nullif(trim(coalesce(p_notas, '')), ''),
       v_token, now() + interval '48 hours', now());
  end if;

  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

-- Confirma a inscrição. Token de uso único: sai do banco assim que é usado.
create or replace function public.confirmar_optin(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.crm_leads%rowtype;
begin
  if coalesce(trim(p_token), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'token_ausente');
  end if;

  select * into v_lead from public.crm_leads where optin_token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'token_invalido');
  end if;
  if v_lead.optin_expira_em is not null and now() > v_lead.optin_expira_em then
    return jsonb_build_object('ok', false, 'error', 'token_expirado', 'email', v_lead.email);
  end if;

  update public.crm_leads set
    confirmed_at = coalesce(confirmed_at, now()),
    status = case when status = 'novo' then 'email_confirmado' else status end,
    optin_token = null,
    optin_expira_em = null,
    updated_at = now()
  where id = v_lead.id;

  return jsonb_build_object('ok', true, 'email', v_lead.email);
end;
$$;

revoke all on function public.registrar_optin(text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.confirmar_optin(text) from public, anon, authenticated;
grant execute on function public.registrar_optin(text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.confirmar_optin(text) to service_role;
