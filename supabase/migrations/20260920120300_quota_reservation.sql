-- Cota reservada de forma atômica antes de chamar o modelo; backfill de leads; leitura de admin.

-- 1) Usuários já existentes no Auth sem linha no CRM.
insert into public.crm_leads (user_id, nome, email, telefone, tipo, empresa, segmento, origem, status, confirmed_at)
select u.id,
       nullif(u.raw_user_meta_data->>'nome',''),
       u.email,
       nullif(u.raw_user_meta_data->>'telefone',''),
       case when u.raw_user_meta_data->>'tipo' = 'b2b' then 'b2b' else 'b2c' end,
       nullif(u.raw_user_meta_data->>'empresa',''),
       nullif(u.raw_user_meta_data->>'segmento',''),
       coalesce(nullif(u.raw_user_meta_data->>'origem',''), 'backfill'),
       case when u.email_confirmed_at is null then 'novo' else 'email_confirmado' end,
       u.email_confirmed_at
  from auth.users u
 where u.email is not null
   and not exists (select 1 from public.crm_leads l where l.user_id = u.id)
on conflict (lower(email)) do update set user_id = excluded.user_id;

-- 2) Reserva uma mensagem: incremento condicional numa única instrução (sem corrida entre requisições
--    paralelas). Cria o lead se faltar. Chamada só pela função de chat (service role).
create or replace function public.reserve_chat_message(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_limit integer := public.free_message_limit();
  v_lead public.crm_leads;
  v_email text;
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
     and (status = 'assinante' or v_limit = 0 or mensagens_usadas < v_limit)
  returning * into v_lead;

  if not found then
    update public.crm_leads set status = 'trial_esgotado'
     where id = v_lead.id and status <> 'assinante';
    return jsonb_build_object('ok', false, 'error', 'trial_esgotado',
                              'used', v_lead.mensagens_usadas, 'limit', v_limit);
  end if;

  -- Esta reserva consumiu a última pergunta grátis: já marca como esgotado (a mensagem atual passa).
  if v_lead.status <> 'assinante' and v_limit > 0 and v_lead.mensagens_usadas >= v_limit then
    update public.crm_leads set status = 'trial_esgotado' where id = v_lead.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lead_id', v_lead.id,
    'used', v_lead.mensagens_usadas,
    'limit', v_limit,
    'subscriber', v_lead.status = 'assinante',
    'remaining', case when v_lead.status = 'assinante' or v_limit = 0 then null
                      else greatest(0, v_limit - v_lead.mensagens_usadas) end
  );
end $$;

-- 3) Devolve a reserva quando o modelo não respondeu (nada foi consumido de verdade).
create or replace function public.release_chat_message(p_lead_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_limit integer := public.free_message_limit();
begin
  update public.crm_leads
     set mensagens_usadas = greatest(0, mensagens_usadas - 1),
         status = case when status = 'trial_esgotado' and (v_limit = 0 or greatest(0, mensagens_usadas - 1) < v_limit)
                       then 'ativo' else status end
   where id = p_lead_id;
end $$;

revoke execute on function public.reserve_chat_message(uuid) from public, anon, authenticated;
revoke execute on function public.release_chat_message(uuid) from public, anon, authenticated;
grant execute on function public.reserve_chat_message(uuid) to service_role;
grant execute on function public.release_chat_message(uuid) to service_role;

-- 4) Administradores enxergam conversas e mensagens de todos (a view crm_overview depende disso).
drop policy if exists "admins read conversations" on public.conversations;
create policy "admins read conversations" on public.conversations for select to authenticated using (public.is_admin());
drop policy if exists "admins read messages" on public.messages;
create policy "admins read messages" on public.messages for select to authenticated using (public.is_admin());
