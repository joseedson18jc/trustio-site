-- Metadados apenas: sem corpo do e-mail, IP, agente do navegador ou tokens de links.
create table public.crm_emails (
  email_id text not null,
  destinatario text not null,
  lead_id uuid references public.crm_leads(id) on delete set null,
  remetente text not null,
  assunto text not null default '',
  enviado_em timestamptz,
  entregue_em timestamptz,
  aberto_em timestamptz,
  clicado_em timestamptz,
  atrasado_em timestamptz,
  falhou_em timestamptz,
  rejeitado_em timestamptz,
  reclamado_em timestamptz,
  cliques integer not null default 0,
  multidestinatario boolean not null default false,
  ultimo_link text,
  atualizado_em timestamptz not null,
  primary key(email_id,destinatario)
);
create index crm_emails_lead on public.crm_emails(lead_id,atualizado_em desc);
create index crm_emails_recent on public.crm_emails(atualizado_em desc,email_id,destinatario);
create table public.crm_email_recebimentos(id text primary key, recebido_em timestamptz not null default now());
alter table public.crm_emails enable row level security;
alter table public.crm_email_recebimentos enable row level security;
revoke all on public.crm_emails, public.crm_email_recebimentos from anon,authenticated;
grant select on public.crm_emails to authenticated;
grant all on public.crm_emails,public.crm_email_recebimentos to service_role;
create policy crm_emails_admin on public.crm_emails for select to authenticated using(public.is_admin());

create view public.crm_emails_overview with(security_invoker=true) as
  select e.*, case
    when reclamado_em is not null then 'spam'
    when rejeitado_em is not null then 'rejeitado'
    when falhou_em is not null then 'falhou'
    when clicado_em is not null then 'clicado'
    when aberto_em is not null then 'aberto'
    when entregue_em<=now()-interval '48 hours' then 'sem_interacao'
    when entregue_em is not null then 'entregue'
    when atrasado_em is not null then 'atrasado'
    else 'enviado' end as estado
  from public.crm_emails e;
grant select on public.crm_emails_overview to authenticated;

create or replace function public.crm_registrar_email(p_evento_id text,p_email_id text,p_tipo text,p_em timestamptz,
  p_remetente text,p_destinatarios text[],p_assunto text,p_link text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_destinatario text; lead uuid; begin
  if p_tipo not in ('email.sent','email.delivered','email.opened','email.clicked','email.delivery_delayed','email.failed','email.bounced','email.complained','email.suppressed') then raise exception 'Evento inválido'; end if;
  if p_em is null or not isfinite(p_em) or nullif(p_evento_id,'') is null or nullif(p_email_id,'') is null then raise exception 'Evento inválido'; end if;
  insert into public.crm_email_recebimentos(id) values(p_evento_id) on conflict do nothing;
  if not found then return; end if;
  foreach v_destinatario in array p_destinatarios loop
    v_destinatario := lower(trim(v_destinatario));
    select l.id into lead from public.crm_leads l left join auth.users u on u.id=l.user_id
      where lower(u.email)=v_destinatario or (l.user_id is null and lower(l.email)=v_destinatario) order by l.created_at desc limit 1;
    insert into public.crm_emails(email_id,destinatario,lead_id,remetente,assunto,atualizado_em,multidestinatario)
      values(p_email_id,v_destinatario,lead,p_remetente,left(coalesce(p_assunto,''),500),p_em,cardinality(p_destinatarios)>1)
      on conflict(email_id,destinatario) do nothing;
    update public.crm_emails set
      lead_id=coalesce(crm_emails.lead_id,lead),
      enviado_em=case when p_tipo='email.sent' then least(enviado_em,p_em) else enviado_em end,
      entregue_em=case when p_tipo='email.delivered' then least(entregue_em,p_em) else entregue_em end,
      aberto_em=case when p_tipo='email.opened' then least(aberto_em,p_em) else aberto_em end,
      clicado_em=case when p_tipo='email.clicked' then least(clicado_em,p_em) else clicado_em end,
      atrasado_em=case when p_tipo='email.delivery_delayed' then greatest(atrasado_em,p_em) else atrasado_em end,
      falhou_em=case when p_tipo in ('email.failed','email.suppressed') then least(falhou_em,p_em) else falhou_em end,
      rejeitado_em=case when p_tipo='email.bounced' then least(rejeitado_em,p_em) else rejeitado_em end,
      reclamado_em=case when p_tipo='email.complained' then least(reclamado_em,p_em) else reclamado_em end,
      cliques=cliques+case when p_tipo='email.clicked' then 1 else 0 end,
      ultimo_link=case when p_tipo='email.clicked' and (crm_emails.atualizado_em<=p_em or ultimo_link is null) then left(p_link,1000) else ultimo_link end,
      atualizado_em=greatest(crm_emails.atualizado_em,p_em)
      where email_id=p_email_id and crm_emails.destinatario=v_destinatario;
  end loop;
end $$;
revoke all on function public.crm_registrar_email(text,text,text,timestamptz,text,text[],text,text) from public,anon,authenticated;
grant execute on function public.crm_registrar_email(text,text,text,timestamptz,text,text[],text,text) to service_role;

-- Só os administradores autorizados pela RLS recebem as alterações.
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and
    not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='crm_emails') then
    alter publication supabase_realtime add table public.crm_emails;
  end if;
end $$;
