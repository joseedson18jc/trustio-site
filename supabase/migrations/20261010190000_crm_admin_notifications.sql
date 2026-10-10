-- Durable notifications for new Auth-linked registrations and first paid status.
-- No historical backfill; one immutable message per event and current administrator.
create table public.crm_admin_avisos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.crm_leads(id) on delete set null,
  evento text not null check (evento in ('cadastro','assinatura')),
  destinatario text not null,
  nome text, email text not null, plano text,
  origem text not null default 'crm',
  criado_em timestamptz not null default now(),
  reservado_em timestamptz, enviado_em timestamptz, provider_id text,
  tentativas integer not null default 0, erro text,
  unique (lead_id, evento, destinatario),
  unique (email, evento, destinatario)
);
alter table public.crm_admin_avisos enable row level security;
create policy admin_leitura on public.crm_admin_avisos for select to authenticated using (public.is_admin());
grant select on public.crm_admin_avisos to authenticated;
grant all on public.crm_admin_avisos to service_role;

create or replace function public.crm_admin_avisar_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare cadastro boolean; assinatura boolean;
begin
  cadastro := new.user_id is not null and (tg_op = 'INSERT' or old.user_id is null);
  assinatura := new.status = 'assinante' and (tg_op = 'INSERT' or old.status is distinct from 'assinante');
  if cadastro or assinatura then
    insert into public.crm_admin_avisos(lead_id,evento,destinatario,nome,email,plano)
      select new.id, e.evento, lower(u.email),new.nome,new.email,new.plano
      from public.admins a join auth.users u on u.id=a.user_id
      cross join (values ('cadastro',cadastro),('assinatura',assinatura)) e(evento,ativo)
      where e.ativo and u.email is not null and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= now())
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger crm_admin_novo_evento after insert or update of user_id,status on public.crm_leads
  for each row execute function public.crm_admin_avisar_evento();

-- The signed Stripe webhook calls this RPC for every completed paid checkout,
-- including purchases without an affiliate. Preserve its existing commission result.
alter function public.registrar_comissao(text,text,text,text,text,int,text,text) rename to registrar_comissao_base;
create or replace function public.registrar_comissao(
  p_evento text,p_sessao text,p_ref text,p_promo_id text,p_email_comprador text,p_valor_venda int,p_price_id text default null,p_payment_intent text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare resultado jsonb; comprador text := lower(nullif(trim(p_email_comprador),'')); l public.crm_leads%rowtype;
begin
  resultado := public.registrar_comissao_base(p_evento,p_sessao,p_ref,p_promo_id,p_email_comprador,p_valor_venda,p_price_id,p_payment_intent);
  if comprador is not null and comprador like '%@%' then
    select * into l from public.crm_leads where lower(email)=comprador limit 1;
    insert into public.crm_admin_avisos(lead_id,evento,destinatario,nome,email,plano,origem)
      select l.id,'assinatura',lower(u.email),l.nome,comprador,coalesce(l.plano,p_price_id),'stripe'
      from public.admins a join auth.users u on u.id=a.user_id
      where u.email is not null and u.email_confirmed_at is not null
        and (u.banned_until is null or u.banned_until <= now())
      on conflict do nothing;
  end if;
  return resultado;
end $$;
revoke all on function public.registrar_comissao_base(text,text,text,text,text,int,text,text) from public,anon,authenticated,service_role;
revoke all on function public.registrar_comissao(text,text,text,text,text,int,text,text) from public,anon,authenticated;
grant execute on function public.registrar_comissao(text,text,text,text,text,int,text,text) to service_role;

create or replace function public.crm_admin_reservar_avisos()
returns setof public.crm_admin_avisos language sql security definer set search_path = public as $$
  update public.crm_admin_avisos set reservado_em=now(),tentativas=tentativas+1
  where id in (
    select n.id from public.crm_admin_avisos n
    where n.enviado_em is null and n.criado_em > now()-interval '23 hours'
      and (n.reservado_em is null or n.reservado_em < now()-interval '2 minutes')
      -- Permission revocation takes effect before every attempted send.
      and exists (select 1 from public.admins a join auth.users u on u.id=a.user_id
        where lower(u.email)=n.destinatario and u.email_confirmed_at is not null
          and (u.banned_until is null or u.banned_until <= now()))
    order by n.criado_em limit 10 for update skip locked
  ) returning *;
$$;
create or replace function public.crm_admin_concluir_aviso(p_id uuid,p_reserva timestamptz,p_provider text,p_erro text)
returns void language sql security definer set search_path = public as $$
  update public.crm_admin_avisos set
    enviado_em=case when p_provider is not null then now() else enviado_em end,
    provider_id=coalesce(p_provider,provider_id),erro=case when p_provider is not null then null else left(p_erro,200) end
  where id=p_id and reservado_em=p_reserva and enviado_em is null;
$$;
revoke all on function public.crm_admin_avisar_evento() from public,anon,authenticated;
revoke all on function public.crm_admin_reservar_avisos() from public,anon,authenticated;
revoke all on function public.crm_admin_concluir_aviso(uuid,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.crm_admin_reservar_avisos() to service_role;
grant execute on function public.crm_admin_concluir_aviso(uuid,timestamptz,text,text) to service_role;

create or replace function public.crm_admin_processar_avisos()
returns void language plpgsql security definer set search_path = public,extensions as $$
declare segredo text;
begin
  if not exists(select 1 from public.crm_admin_avisos where enviado_em is null
    and criado_em > now()-interval '23 hours') then return; end if;
  select decrypted_secret into segredo from vault.decrypted_secrets where name='crm_admin_avisos_segredo';
  if segredo is null then return; end if;
  perform net.http_post(url := 'https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/admin-avisos',
    body := '{}'::jsonb, headers := jsonb_build_object('Content-Type','application/json','x-trustio-segredo',segredo),
    timeout_milliseconds := 20000);
end $$;
revoke all on function public.crm_admin_processar_avisos() from public,anon,authenticated;
select cron.schedule('crm-admin-avisos','* * * * *','select public.crm_admin_processar_avisos()');
