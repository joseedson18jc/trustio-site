-- Trustio · funil com atribuição (lancamento-b2c-out26).
--
-- 1. O site (anon/authenticated) só grava as etapas do navegador: signup_start e signup_complete.
--    Até aqui o insert era `with check (true)`: qualquer um forjava trial_activated.
-- 2. signup_complete conta uma vez por usuário, em qualquer navegador: o funil.js guarda no
--    localStorage, que não vale em outro aparelho. Um gatilho descarta a repetição (e o evento
--    de um user_id que não existe). Gatilho e não índice único: a tabela já tem duplicatas.
-- 3. trial_activated sai só do servidor: o webhook assinado da Stripe (worker) chama
--    registrar_trial_activated, que acha a conta pelo e-mail do comprador, copia as UTMs do
--    signup_complete dela e não grava o e-mail. O nome do evento é reaproveitado para não mexer
--    no CHECK; meta.tipo = 'pagamento'.
--
-- Linhas trial_activated anteriores a esta migração foram forjadas por definição (nada as
-- emitia): relatórios de pagamento contam a partir da data desta migração.

-- ── 1. política de gravação do site ─────────────────────────────────────────
drop policy if exists "site grava eventos do funil" on public.eventos_funil;
create policy "site grava eventos do funil" on public.eventos_funil
  for insert to anon, authenticated
  with check (evento in ('signup_start', 'signup_complete'));

-- ── 2. signup_complete: um por usuário ──────────────────────────────────────
create index if not exists eventos_funil_signup_usuario_idx
  on public.eventos_funil ((meta->>'user_id')) where evento = 'signup_complete';

-- security definer: quem grava (anon) não lê a tabela nem auth.users, e o gatilho precisa ler.
-- Devolve null (linha descartada, sem erro): o navegador não fica sabendo se a conta existe.
create or replace function public.eventos_funil_signup_unico()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_user text := new.meta->>'user_id';
begin
  if new.evento <> 'signup_complete' then return new; end if;
  if v_user is null or v_user !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if not exists (select 1 from auth.users where id = v_user::uuid) then return null; end if;
  -- Duas abas ao mesmo tempo: uma espera a outra, e a segunda vê a primeira linha.
  perform pg_advisory_xact_lock(hashtext('trustio.funil.signup.' || v_user));
  if exists (select 1 from public.eventos_funil where evento = 'signup_complete' and meta->>'user_id' = v_user) then
    return null;
  end if;
  return new;
end $$;

revoke all on function public.eventos_funil_signup_unico() from public, anon, authenticated;

drop trigger if exists eventos_funil_signup_unico on public.eventos_funil;
create trigger eventos_funil_signup_unico before insert on public.eventos_funil
  for each row execute function public.eventos_funil_signup_unico();

-- ── 3. trial_activated pelo webhook da Stripe ───────────────────────────────
create index if not exists eventos_funil_trial_sessao_idx
  on public.eventos_funil ((meta->>'stripe_session')) where evento = 'trial_activated';

-- Idempotente por sessão de checkout (a Stripe reentrega o mesmo evento). O e-mail só serve
-- para achar a conta e não vai para o meta. As UTMs vêm do primeiro signup_complete da conta,
-- filtradas pelo formato que o atribuicao.js grava (o meta veio do navegador). A atribuição de
-- afiliado vem da comissão já registrada para a sessão (cupom vence link).
create or replace function public.registrar_trial_activated(
  p_sessao text,
  p_email_comprador text,
  p_price_id text default null,
  p_valor_centavos int default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_sessao text := nullif(trim(coalesce(p_sessao, '')), '');
  v_email text := lower(nullif(trim(coalesce(p_email_comprador, '')), ''));
  v_user uuid;
  v_cadastro jsonb;
  v_utms jsonb;
  v_fonte text;
  v_afiliado text;
begin
  if v_sessao is null then return jsonb_build_object('ok', false, 'error', 'sem_sessao'); end if;

  perform pg_advisory_xact_lock(hashtext('trustio.funil.trial.' || v_sessao));
  if exists (select 1 from public.eventos_funil where evento = 'trial_activated' and meta->>'stripe_session' = v_sessao) then
    return jsonb_build_object('ok', true, 'registrado', false, 'motivo', 'repetido');
  end if;

  if v_email is not null then
    select user_id into v_user from public.crm_leads
     where lower(email) = v_email and user_id is not null limit 1;
  end if;
  if v_user is not null then
    select meta into v_cadastro from public.eventos_funil
     where evento = 'signup_complete' and meta->>'user_id' = v_user::text
     order by criado_em limit 1;
  end if;

  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_utms
    from jsonb_each_text(coalesce(v_cadastro, '{}'::jsonb)) as e(k, v)
   where (k in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term') and v ~ '^[a-z0-9._-]{1,64}$')
      or (k = 'ref_host' and v ~ '^[a-z0-9.-]{1,64}$')
      or (k = 'landing' and v ~ '^/[a-z0-9._/-]{0,63}$');
  v_fonte := case when v_cadastro->>'fonte_atrib' in ('metadata', 'local') then v_cadastro->>'fonte_atrib' else 'nenhuma' end;

  select atribuicao into v_afiliado from public.comissoes where stripe_session_id = v_sessao;

  insert into public.eventos_funil (evento, meta)
  values ('trial_activated', jsonb_strip_nulls(jsonb_build_object(
    'tipo', 'pagamento',
    'stripe_session', v_sessao,
    'price_id', nullif(trim(coalesce(p_price_id, '')), ''),
    'valor_centavos', p_valor_centavos,
    'atrib_afiliado', coalesce(v_afiliado, 'nenhum'),
    'fonte_atrib', v_fonte
  )) || v_utms);

  return jsonb_build_object('ok', true, 'registrado', true, 'fonte_atrib', v_fonte);
end $$;

revoke all on function public.registrar_trial_activated(text, text, text, int) from public, anon, authenticated;
grant execute on function public.registrar_trial_activated(text, text, text, int) to service_role;
