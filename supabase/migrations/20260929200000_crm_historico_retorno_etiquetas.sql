-- Trustio · CRM: histórico do lead, próximo contato e etiquetas
--
-- 1. crm_eventos: cada mudança nos campos que a equipe trabalha (status, plano, tipo de
--    usuário, teste do WhatsApp, notas, próximo contato, etiquetas, telefone) e a confirmação
--    do e-mail viram uma linha com quem mudou e quando. Quem grava é o gatilho, nunca o site;
--    a equipe só lê. Mudança feita pelo banco (rotina de encerramento, confirmação do e-mail)
--    fica sem autor ("sistema").
-- 2. crm_leads.proximo_contato: data para retomar o contato com o lead (follow-up).
-- 3. crm_leads.etiquetas: marcadores livres da equipe (até 10, de 1 a 30 caracteres).
--
-- As duas colunas novas são da equipe: o cliente, editando o próprio cadastro no chat, não as
-- muda (guard_lead_update) nem as vê de outra forma além da própria linha.

-- ─────────────────────────────────────────────────────────────── colunas novas
create or replace function public.etiquetas_validas(p text[])
returns boolean language sql immutable set search_path = public as $$
  select cardinality(p) <= 10
     and not exists (select 1 from unnest(p) e where char_length(e) not between 1 and 30);
$$;

alter table public.crm_leads add column if not exists proximo_contato date;
alter table public.crm_leads add column if not exists etiquetas text[] not null default '{}';
alter table public.crm_leads drop constraint if exists crm_leads_etiquetas_validas;
alter table public.crm_leads add constraint crm_leads_etiquetas_validas check (public.etiquetas_validas(etiquetas));

-- A mesma view de 29/09, com as colunas novas no fim.
create or replace view public.crm_overview with (security_invoker = true) as
  select l.id, l.user_id, l.nome, l.email, l.telefone, l.tipo, l.empresa, l.segmento, l.origem,
         l.status, l.plano, l.mensagens_usadas, l.notas, l.confirmed_at, l.last_seen_at,
         l.created_at, l.updated_at, l.onboarding_seen_at, l.whatsapp_numero,
         l.whatsapp_trial_status, l.whatsapp_trial_requested_at, l.whatsapp_trial_started_at,
         l.whatsapp_trial_ends_at,
         public.conversas_de(l.user_id) as conversas,
         public.ultima_mensagem_de(l.user_id) as ultima_mensagem,
         l.papel,
         l.whatsapp_aviso_email_em, l.whatsapp_aviso_email_reserva, l.whatsapp_aviso_email_erro,
         l.whatsapp_aviso_wa_em, l.whatsapp_aviso_wa_reserva, l.whatsapp_aviso_wa_erro,
         l.whatsapp_ativacao,
         l.proximo_contato, l.etiquetas
    from public.crm_leads l;

-- O guard de 29/09, com proximo_contato e etiquetas entre as colunas que só a equipe muda.
create or replace function public.guard_lead_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('trustio.lead_rpc', true) = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  -- Identidade do lead (a conta e o e-mail que carregam o tipo) não muda por aqui, nem para
  -- a equipe: trocar user_id de um lead colaborador daria acesso de equipe a outra conta.
  new.user_id := old.user_id; new.email := old.email;
  new.whatsapp_aviso_email_em := old.whatsapp_aviso_email_em;
  new.whatsapp_aviso_email_reserva := old.whatsapp_aviso_email_reserva;
  new.whatsapp_aviso_email_erro := old.whatsapp_aviso_email_erro;
  new.whatsapp_aviso_wa_em := old.whatsapp_aviso_wa_em;
  new.whatsapp_aviso_wa_reserva := old.whatsapp_aviso_wa_reserva;
  new.whatsapp_aviso_wa_erro := old.whatsapp_aviso_wa_erro;
  if not public.is_staff() then
    -- Cliente editando o próprio cadastro: só os dados de contato mudam.
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at; new.papel := old.papel;
    new.whatsapp_trial_status := old.whatsapp_trial_status;
    new.whatsapp_trial_requested_at := old.whatsapp_trial_requested_at;
    new.whatsapp_trial_started_at := old.whatsapp_trial_started_at;
    new.whatsapp_trial_ends_at := old.whatsapp_trial_ends_at;
    new.whatsapp_ativacao := old.whatsapp_ativacao;
    new.proximo_contato := old.proximo_contato;
    new.etiquetas := old.etiquetas;
    -- O número do agente só muda pela RPC do teste ou pela equipe.
    new.whatsapp_numero := old.whatsapp_numero;
    -- Assinante sem whatsapp_numero é liberado pelo telefone do cadastro: travado também.
    if old.status = 'assinante' then new.telefone := old.telefone; end if;
  elsif not public.is_admin() then
    if new.papel is distinct from old.papel then
      raise exception 'papel_so_admin' using hint = 'Só um admin muda o tipo de usuário.';
    end if;
    -- Colaborador trabalha o lead (status, plano, notas, WhatsApp); o histórico fica.
    new.mensagens_usadas := old.mensagens_usadas; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────── histórico
create table if not exists public.crm_eventos (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  em timestamptz not null default now(),
  autor uuid,
  autor_email text,
  campo text not null,
  de text,
  para text
);
create index if not exists crm_eventos_lead_em on public.crm_eventos (lead_id, em desc);

alter table public.crm_eventos enable row level security;
drop policy if exists "eventos: equipe le" on public.crm_eventos;
create policy "eventos: equipe le" on public.crm_eventos for select to authenticated using (public.is_staff());
revoke all on public.crm_eventos from anon, authenticated;
grant select on public.crm_eventos to authenticated;

create or replace function public.crm_registrar_eventos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_autor uuid := auth.uid();
  v_email text;
begin
  if tg_op = 'UPDATE' and (old.status, old.plano, old.papel, old.whatsapp_trial_status, old.notas,
                           old.proximo_contato, old.etiquetas, old.telefone, old.confirmed_at)
      is not distinct from (new.status, new.plano, new.papel, new.whatsapp_trial_status, new.notas,
                            new.proximo_contato, new.etiquetas, new.telefone, new.confirmed_at) then
    -- Atualizações que não mexem no que a equipe acompanha (último acesso, uso, avisos).
    return new;
  end if;
  if v_autor is not null then select email into v_email from auth.users where id = v_autor; end if;
  if tg_op = 'INSERT' then
    insert into public.crm_eventos (lead_id, em, autor, autor_email, campo, para)
    values (new.id, new.created_at, v_autor, v_email, 'criado', new.origem);
    return new;
  end if;
  -- Texto de cada valor; notas longas são cortadas em 500 caracteres.
  insert into public.crm_eventos (lead_id, autor, autor_email, campo, de, para)
  select new.id, v_autor, v_email, c.campo, left(c.de, 500), left(c.para, 500)
    from (values
      ('status', old.status::text, new.status::text),
      ('plano', old.plano::text, new.plano::text),
      ('papel', old.papel::text, new.papel::text),
      ('whatsapp_trial_status', old.whatsapp_trial_status::text, new.whatsapp_trial_status::text),
      ('notas', old.notas::text, new.notas::text),
      ('proximo_contato', old.proximo_contato::text, new.proximo_contato::text),
      ('etiquetas', array_to_string(old.etiquetas, ', '), array_to_string(new.etiquetas, ', ')),
      ('telefone', old.telefone::text, new.telefone::text),
      ('confirmed_at', old.confirmed_at::text, new.confirmed_at::text)
    ) as c(campo, de, para)
   where c.de is distinct from c.para;
  return new;
end $$;

revoke execute on function public.crm_registrar_eventos() from public, anon, authenticated;

drop trigger if exists crm_leads_eventos on public.crm_leads;
create trigger crm_leads_eventos after insert or update on public.crm_leads
  for each row execute function public.crm_registrar_eventos();

-- Ponto de partida do histórico dos leads que já existem: o cadastro e a confirmação do e-mail
-- (só na primeira vez; reaplicar não duplica).
insert into public.crm_eventos (lead_id, em, campo, para)
select l.id, l.created_at, 'criado', l.origem
  from public.crm_leads l
 where not exists (select 1 from public.crm_eventos e where e.lead_id = l.id and e.campo = 'criado');
insert into public.crm_eventos (lead_id, em, campo, para)
select l.id, l.confirmed_at, 'confirmed_at', l.confirmed_at::text
  from public.crm_leads l
 where l.confirmed_at is not null
   and not exists (select 1 from public.crm_eventos e where e.lead_id = l.id and e.campo = 'confirmed_at');
