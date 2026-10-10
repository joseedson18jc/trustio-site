-- Uma concessão por pedido; reenvio cria outro envio sem alterar o prazo.
create table public.crm_convites (
  id uuid primary key,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  autor uuid not null,
  email text not null,
  nome text,
  fim timestamptz not null,
  concedeu boolean not null,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  erro text,
  provider_id text
);
create index crm_convites_lead on public.crm_convites(lead_id, criado_em desc);
alter table public.crm_convites enable row level security;
revoke all on public.crm_convites from anon, authenticated;
grant select on public.crm_convites to authenticated;
grant all on public.crm_convites to service_role;
create policy crm_convites_admin on public.crm_convites for select to authenticated using (public.is_admin());

create or replace function public.crm_preparar_convite(p_lead_id uuid, p_pedido uuid, p_conceder boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l public.crm_leads;
  c public.crm_convites;
  ultimo public.crm_convites;
  destinatario text;
  prazo timestamptz;
begin
  if not public.is_admin() then raise exception 'Somente administrador' using errcode='42501'; end if;
  if p_pedido is null or p_conceder is null then raise exception 'Pedido inválido'; end if;
  select * into l from public.crm_leads where id=p_lead_id for update;
  if not found or l.user_id is null then raise exception 'Conta não encontrada'; end if;
  if l.acesso_modo in ('revogado','bloqueado','bloqueado_login') then raise exception 'Conta bloqueada ou revogada: revise o acesso antes de convidar'; end if;
  if l.acesso_inicio > now() then raise exception 'Conta com acesso agendado: revise o acesso antes de convidar'; end if;
  if coalesce(l.papel,'teste') <> 'teste' or l.status='assinante' or (l.acesso_modo='liberado' and l.acesso_fim is null) then
    raise exception 'Conta já possui acesso sem prazo; oferta destinada a contas de teste';
  end if;
  select email into destinatario from auth.users where id=l.user_id and email_confirmed_at is not null and (banned_until is null or banned_until<=now());
  if nullif(destinatario,'') is null then raise exception 'A conta precisa de e-mail confirmado e login permitido'; end if;
  select * into c from public.crm_convites where id=p_pedido;
  if found then
    if c.lead_id<>p_lead_id or c.autor<>auth.uid() or c.concedeu<>p_conceder then raise exception 'Pedido já utilizado'; end if;
    -- Resend guarda a chave por 24 h. Retentativas tardias precisam de um novo reenvio.
    if c.enviado_em is null and (c.criado_em<now()-interval '23 hours' or c.fim<=now() or l.acesso_modo<>'liberado' or l.acesso_fim is distinct from c.fim or c.email<>destinatario) then
      raise exception 'Convite antigo: use Reenviar convite ou libere novo prazo';
    end if;
    return to_jsonb(c);
  end if;
  select * into ultimo from public.crm_convites where lead_id=l.id order by criado_em desc limit 1;
  if ultimo.criado_em>now()-interval '1 minute' then raise exception 'Aguarde um minuto antes de enviar outro convite'; end if;
  if p_conceder then
    -- Extensão do prazo vigente; nunca encurta uma concessão existente.
    prazo := greatest(now(),l.acesso_fim)+interval '3 days';
    perform public.crm_definir_acesso(l.id,'liberado',null,prazo,'Cortesia: mais 3 dias de chat grátis + convite por e-mail');
  else
    if ultimo.id is null or ultimo.fim<=now() or l.acesso_modo<>'liberado' or l.acesso_fim is distinct from ultimo.fim then
      raise exception 'Não há convite vigente; libere mais 3 dias primeiro';
    end if;
    prazo := ultimo.fim;
  end if;
  insert into public.crm_convites(id,lead_id,autor,email,nome,fim,concedeu)
    values(p_pedido,l.id,auth.uid(),destinatario,l.nome,prazo,p_conceder) returning * into c;
  insert into public.crm_eventos(lead_id,autor,autor_email,campo,para)
    select l.id,auth.uid(),email,'convite_retorno',case when p_conceder then '+3 dias; ' else 'Reenvio; ' end || 'até ' || prazo::text from auth.users where id=auth.uid();
  return to_jsonb(c);
end $$;
revoke all on function public.crm_preparar_convite(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.crm_preparar_convite(uuid,uuid,boolean) to authenticated;

create or replace function public.crm_concluir_convite(p_pedido uuid, p_provider_id text, p_erro text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_provider_id is null and nullif(p_erro,'') is null then raise exception 'Resultado inválido'; end if;
  -- Uma falha concorrente nunca sobrescreve um envio já aceito.
  update public.crm_convites set provider_id=p_provider_id,
    enviado_em=case when p_provider_id is not null then now() end,
    erro=case when p_provider_id is null then left(p_erro,500) end
    where id=p_pedido and enviado_em is null;
end $$;
revoke all on function public.crm_concluir_convite(uuid,text,text) from public, anon, authenticated;
grant execute on function public.crm_concluir_convite(uuid,text,text) to service_role;
