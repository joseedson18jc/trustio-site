-- Trustio · Tipo de usuário no CRM: admin, colaborador, teste grátis, cliente.
--
--   admin        acesso máximo e irrestrito: CRM, /admin/, configurações e mudança de tipo.
--                Só dois e-mails podem ser admin (lista em emails_admin()); o banco recusa
--                qualquer outro e não deixa remover o último admin.
--   colaborador  usa o CRM (vê e edita leads, ativa o WhatsApp) e o chat sem cota; não muda
--                tipos, não mexe em configurações, não lê conversas de clientes.
--   teste        teste grátis: cota de perguntas grátis (padrão de toda conta nova).
--   cliente      chat sem cota e acesso antecipado, como o status "assinante".
--
-- A tabela admins continua sendo a fonte que o resto do banco consulta (is_admin(),
-- políticas, painel mestre); crm_leads.papel e admins ficam sincronizados nos dois sentidos.

-- ─────────────────────────────────────────────────────────────── coluna
alter table public.crm_leads
  add column if not exists papel text not null default 'teste'
  check (papel in ('admin', 'colaborador', 'teste', 'cliente'));

update public.crm_leads set papel = 'cliente' where status = 'assinante' and papel = 'teste';
update public.crm_leads l set papel = 'admin' from public.admins a where a.user_id = l.user_id;

-- ─────────────────────────────────────────────────────────────── quem pode ser admin
create or replace function public.emails_admin()
returns text[] language sql immutable as $$
  select array['joseedson18@hotmail.com', 'matheuscastrocorrea@gmail.com']::text[];
$$;

create or replace function public.pode_ser_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u where u.id = p_user_id and lower(u.email) = any (public.emails_admin()));
$$;

-- Admin = está em admins E o e-mail atual da conta está na lista. Quem troca o e-mail do
-- Auth para outro endereço perde os poderes na hora, mesmo antes de alguém limpar admins.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
     and public.pode_ser_admin(auth.uid());
$$;

-- Equipe = admin ou colaborador: quem entra no CRM.
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (select 1 from public.crm_leads where user_id = auth.uid() and papel = 'colaborador');
$$;

-- Papel de quem está logado, para a página decidir o que mostrar (o banco decide o que vale).
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = public as $$
  -- papel 'admin' sem is_admin() (e-mail trocado para fora da lista) não vale: conta como teste.
  select case when public.is_admin() then 'admin'
              else coalesce((select nullif(papel, 'admin') from public.crm_leads where user_id = auth.uid()), 'teste') end;
$$;

-- ─────────────────────────────────────────────────────────────── regras do tipo
create or replace function public.validar_papel()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.papel is not distinct from old.papel then return new; end if;
  if new.papel in ('admin', 'colaborador') and new.user_id is null then
    raise exception 'papel_exige_conta' using hint = 'Admin e colaborador precisam ter conta criada no site.';
  end if;
  if new.papel = 'admin' and not public.pode_ser_admin(new.user_id) then
    raise exception 'admin_restrito' using hint = 'Só joseedson18@hotmail.com e matheuscastrocorrea@gmail.com podem ser admin.';
  end if;
  if tg_op = 'UPDATE' and old.papel = 'admin' and new.papel <> 'admin' then
    -- Serializa os rebaixamentos: dois admins saindo ao mesmo tempo não podem, cada um,
    -- contar com o outro como "o admin que fica". A trava vale até o fim da transação,
    -- e a contagem abaixo já enxerga o que a outra transação gravou.
    perform pg_advisory_xact_lock(hashtext('trustio_rebaixa_admin'));
    if not exists (select 1 from public.crm_leads where papel = 'admin' and id <> new.id) then
      raise exception 'ultimo_admin' using hint = 'Precisa haver pelo menos um admin.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists crm_leads_papel on public.crm_leads;
create trigger crm_leads_papel before insert or update of papel on public.crm_leads
  for each row execute function public.validar_papel();

-- crm_leads → admins
create or replace function public.sincronizar_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.papel = 'admin' and new.user_id is not null then
    insert into public.admins (user_id) values (new.user_id) on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.papel = 'admin' and new.papel <> 'admin' and old.user_id is not null then
    delete from public.admins where user_id = old.user_id;
  end if;
  return null;
end $$;

drop trigger if exists crm_leads_sincroniza_admins on public.crm_leads;
create trigger crm_leads_sincroniza_admins after insert or update of papel on public.crm_leads
  for each row execute function public.sincronizar_admins();

-- admins → crm_leads, e a mesma trava de e-mail para quem insere direto em admins
-- (workflow com ADMIN_EMAILS, SQL à mão).
create or replace function public.guardar_admins()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.pode_ser_admin(new.user_id) then
      raise exception 'admin_restrito' using hint = 'Só joseedson18@hotmail.com e matheuscastrocorrea@gmail.com podem ser admin.';
    end if;
    update public.crm_leads set papel = 'admin' where user_id = new.user_id and papel <> 'admin';
    return new;
  end if;
  -- Quem deixa de ser admin volta a cliente se paga (status assinante), senão a teste grátis.
  update public.crm_leads set papel = case when status = 'assinante' then 'cliente' else 'teste' end
   where user_id = old.user_id and papel = 'admin';
  return old;
end $$;

drop trigger if exists admins_guarda on public.admins;
create trigger admins_guarda after insert or delete on public.admins
  for each row execute function public.guardar_admins();

-- Admins de fora da lista saem (voltam a cliente ou teste); Matheus entra: os dois admins
-- são os definidos pelo dono.
delete from public.admins a where not public.pode_ser_admin(a.user_id);
insert into public.admins (user_id)
  select id from auth.users where lower(email) = 'matheuscastrocorrea@gmail.com'
  on conflict do nothing;

-- ─────────────────────────────────────────────────────────────── edição pelo CRM
create or replace function public.guard_lead_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_setting('trustio.lead_rpc', true) = 'on' then return new; end if;
  if auth.uid() is null then return new; end if;
  -- Identidade do lead (a conta e o e-mail que carregam o tipo) não muda por aqui, nem para
  -- a equipe: trocar user_id de um lead colaborador daria acesso de equipe a outra conta.
  new.user_id := old.user_id; new.email := old.email;
  if not public.is_staff() then
    -- Cliente editando o próprio cadastro: só os dados de contato mudam.
    new.status := old.status; new.plano := old.plano; new.mensagens_usadas := old.mensagens_usadas;
    new.notas := old.notas; new.email := old.email; new.user_id := old.user_id; new.origem := old.origem;
    new.confirmed_at := old.confirmed_at; new.created_at := old.created_at; new.papel := old.papel;
    new.whatsapp_trial_status := old.whatsapp_trial_status;
    new.whatsapp_trial_requested_at := old.whatsapp_trial_requested_at;
    new.whatsapp_trial_started_at := old.whatsapp_trial_started_at;
    new.whatsapp_trial_ends_at := old.whatsapp_trial_ends_at;
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

drop policy if exists "lead reads own" on public.crm_leads;
create policy "lead reads own" on public.crm_leads for select
  using (user_id = auth.uid() or public.is_staff());
drop policy if exists "lead updates own contact" on public.crm_leads;
create policy "lead updates own contact" on public.crm_leads for update
  using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

-- Contagens do CRM sem abrir o conteúdo das conversas para a equipe: só números.
create or replace function public.conversas_de(p_user_id uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case when public.is_staff() or p_user_id = auth.uid()
              then (select count(*) from public.conversations where user_id = p_user_id) else 0 end;
$$;
create or replace function public.ultima_mensagem_de(p_user_id uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select case when public.is_staff() or p_user_id = auth.uid()
              then (select max(created_at) from public.messages where user_id = p_user_id) end;
$$;

create or replace view public.crm_overview with (security_invoker = true) as
  select l.id, l.user_id, l.nome, l.email, l.telefone, l.tipo, l.empresa, l.segmento, l.origem,
         l.status, l.plano, l.mensagens_usadas, l.notas, l.confirmed_at, l.last_seen_at,
         l.created_at, l.updated_at, l.onboarding_seen_at, l.whatsapp_numero,
         l.whatsapp_trial_status, l.whatsapp_trial_requested_at, l.whatsapp_trial_started_at,
         l.whatsapp_trial_ends_at,
         public.conversas_de(l.user_id) as conversas,
         public.ultima_mensagem_de(l.user_id) as ultima_mensagem,
         l.papel
    from public.crm_leads l;

-- Colaborador também ativa o teste de 3 dias no WhatsApp.
create or replace function public.activate_whatsapp_trial(p_lead_id uuid, p_days integer default 3)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'somente a equipe'; end if;
  perform set_config('trustio.lead_rpc', 'on', true);
  update public.crm_leads
     set whatsapp_trial_status = 'ativo', whatsapp_trial_started_at = now(),
         whatsapp_trial_ends_at = now() + make_interval(days => greatest(1, p_days))
   where id = p_lead_id;
  perform set_config('trustio.lead_rpc', 'off', true);
end $$;

-- ─────────────────────────────────────────────────────────────── chat
-- Sem cota: status assinante, ou tipo admin, colaborador ou cliente.
create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
  v_lead public.crm_leads;
  v_email text;
  v_livre boolean;
begin
  select * into v_lead from public.crm_leads where user_id = p_user_id;
  if not found then
    select email into v_email from auth.users where id = p_user_id;
    if v_email is null then
      return jsonb_build_object('ok', false, 'error', 'lead_inexistente');
    end if;
    insert into public.crm_leads (user_id, email, origem, status)
    values (p_user_id, v_email, 'app', 'email_confirmado')
    on conflict (lower(email)) do update set user_id = excluded.user_id
    returning * into v_lead;
  end if;

  update public.crm_leads
     set mensagens_usadas = mensagens_usadas + 1,
         status = case when status = 'assinante' then status else 'ativo' end,
         last_seen_at = now()
   where id = v_lead.id
     and (status = 'assinante' or papel in ('admin', 'colaborador', 'cliente')
          or v_limit = 0 or mensagens_usadas < v_limit)
  returning * into v_lead;

  if not found then
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit);
  end if;

  v_livre := v_lead.status = 'assinante' or v_lead.papel in ('admin', 'colaborador', 'cliente');

  -- Esta reserva consumiu a última pergunta grátis: já marca como esgotado (a mensagem atual passa).
  if not v_livre and v_limit > 0 and v_lead.mensagens_usadas >= v_limit then
    update public.crm_leads set status = 'trial_esgotado' where id = v_lead.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'used', v_lead.mensagens_usadas,
    'limit', v_limit,
    'subscriber', v_livre,
    'remaining', case when v_livre or v_limit = 0 then null
                      else greatest(0, v_limit - v_lead.mensagens_usadas) end
  );
end $$;

-- Acesso antes da abertura: equipe entra sempre; cliente conta como pré-assinante.
create or replace function public.acesso_do_chat(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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

  eh_admin := (exists (select 1 from public.admins a where a.user_id = p_user_id) and public.pode_ser_admin(p_user_id))
           or exists (select 1 from public.crm_leads l where l.user_id = p_user_id and l.papel = 'colaborador');
  eh_pre := exists (
    select 1 from public.crm_leads l
    where l.user_id = p_user_id and (l.status = 'assinante' or l.papel = 'cliente')
  );

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
end $$;

grant execute on function public.meu_papel() to authenticated;
grant execute on function public.is_staff() to authenticated;
