-- Trustio · registrar_optin passa a gravar numa instrução só.
--
-- A versão anterior lia o lead e só então gravava. Duas inscrições simultâneas do
-- mesmo e-mail liam o mesmo estado: num endereço novo, uma delas esbarraria no
-- índice único de lower(email); num existente, as duas gravariam e a última venceria.
-- O on conflict trava a linha e o returning devolve o token efetivamente gravado --
-- o mesmo padrão que handle_new_user e reserve_chat_message já usam nesta tabela.
--
-- Esta migração vem separada de propósito: a anterior já está aplicada nos ambientes
-- existentes, e editar um arquivo já aplicado não muda nada neles. Correção de função
-- viaja em migração nova.

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
  v_salvo text;
begin
  v_email := lower(trim(coalesce(p_email, '')));
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  -- O where exclui quem já confirmou: nada é atualizado, o returning volta vazio, e
  -- respondemos sem reenviar e sem revelar que a pessoa está na lista.
  insert into public.crm_leads
    (email, nome, telefone, tipo, empresa, segmento, origem, status, notas,
     optin_token, optin_expira_em, optin_pedido_em)
  values
    (v_email, nullif(trim(coalesce(p_nome, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
     coalesce(nullif(p_tipo, ''), 'b2c'), nullif(trim(coalesce(p_empresa, '')), ''),
     nullif(trim(coalesce(p_segmento, '')), ''), coalesce(nullif(p_origem, ''), 'lista-de-espera'),
     'novo', nullif(trim(coalesce(p_notas, '')), ''),
     v_token, now() + interval '48 hours', now())
  on conflict (lower(email)) do update set
    nome = coalesce(nullif(trim(coalesce(p_nome, '')), ''), public.crm_leads.nome),
    telefone = coalesce(nullif(trim(coalesce(p_telefone, '')), ''), public.crm_leads.telefone),
    tipo = coalesce(nullif(p_tipo, ''), public.crm_leads.tipo),
    empresa = coalesce(nullif(trim(coalesce(p_empresa, '')), ''), public.crm_leads.empresa),
    segmento = coalesce(nullif(trim(coalesce(p_segmento, '')), ''), public.crm_leads.segmento),
    notas = coalesce(nullif(trim(coalesce(p_notas, '')), ''), public.crm_leads.notas),
    optin_token = excluded.optin_token,
    optin_expira_em = excluded.optin_expira_em,
    optin_pedido_em = excluded.optin_pedido_em,
    updated_at = now()
  where public.crm_leads.confirmed_at is null
  returning optin_token into v_salvo;

  if v_salvo is null then
    return jsonb_build_object('ok', true, 'ja_confirmado', true);
  end if;

  return jsonb_build_object('ok', true, 'token', v_salvo);
end;
$$;

revoke all on function public.registrar_optin(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_optin(text, text, text, text, text, text, text, text) to service_role;
