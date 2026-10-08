-- Trustio · afiliados: cupom, atribuição de vendas e comissões calculadas sozinhas.
--
-- Fluxo da venda:
--   1. Na aprovação o worker cria na Stripe o cupom do afiliado (ex.: LUISC10, 10% na 1ª
--      cobrança) e grava aqui com definir_cupom_afiliado. O link enviado ao afiliado passa a
--      ser https://trustio.com.br/?ref=LUISC10.
--   2. O site guarda o ?ref= em cookie por 90 dias e, no clique para pagar, acrescenta ao
--      link da Stripe client_reference_id=LUISC10 e prefilled_promo_code=LUISC10.
--   3. A Stripe avisa o worker (POST /stripe/webhook, checkout.session.completed). O worker
--      chama registrar_comissao: o cupom digitado vence o link (último clique), o valor da
--      comissão sai da tabela pública de afiliados.html, e os tetos de R$ 25.000/mês e
--      R$ 300.000/ano por afiliado são aplicados aqui, no banco.
--   4. A equipe vê "a pagar" na aba Afiliados do CRM, paga o Pix e marca como pago.
--
-- Valores em centavos.

alter table public.afiliados add column if not exists cupom text;
alter table public.afiliados add column if not exists stripe_promotion_code_id text;
create unique index if not exists afiliados_cupom_unico on public.afiliados (cupom) where cupom is not null;
create unique index if not exists afiliados_promo_unico on public.afiliados (stripe_promotion_code_id) where stripe_promotion_code_id is not null;

-- Cupom e promoção da Stripe são identidade do link: a equipe não troca pela edição direta.
create or replace function public.guard_afiliado_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := old.email;
  new.cpf := old.cpf;
  new.codigo := old.codigo;
  new.cupom := old.cupom;
  new.stripe_promotion_code_id := old.stripe_promotion_code_id;
  new.created_at := old.created_at;
  new.aprovado_em := old.aprovado_em;
  new.aprovado_por := old.aprovado_por;
  new.link_enviado_em := old.link_enviado_em;
  new.recebido_enviado_em := old.recebido_enviado_em;
  if new.status = 'ativo' and old.status is distinct from 'ativo' then
    raise exception 'use_aprovar_afiliado';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Candidatos de cupom, na ordem: LUISC10, LUISCA10, LUISCAR10, LUISC210 … LUISC910.
-- Primeiro nome (até 6 letras) + inicial(is) do último sobrenome + 10.
create or replace function public.cupons_candidatos(p_nome text)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  limpo text := upper(translate(trim(coalesce(p_nome, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'));
  partes text[] := regexp_split_to_array(trim(regexp_replace(limpo, '[^A-Z ]', '', 'g')), '\s+');
  primeiro text;
  ultimo text;
  base text;
  r text[] := '{}';
  i int;
begin
  partes := array_remove(partes, '');
  primeiro := coalesce(left(partes[1], 6), '');
  if primeiro = '' then primeiro := 'TRUST'; end if;
  ultimo := case when coalesce(array_length(partes, 1), 0) > 1 then partes[array_length(partes, 1)] else '' end;
  for i in 1..3 loop
    if length(ultimo) >= i then r := r || (primeiro || left(ultimo, i) || '10'); end if;
  end loop;
  if coalesce(array_length(r, 1), 0) = 0 then r := r || (primeiro || '10'); end if;
  base := primeiro || left(ultimo, 1);
  for i in 2..9 loop r := r || (base || i::text || '10'); end loop;
  return r;
end;
$$;

-- O worker grava o cupom depois de criá-lo na Stripe.
create or replace function public.definir_cupom_afiliado(p_id uuid, p_cupom text, p_promo_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform set_config('trustio.afiliado_rpc', 'on', true);
  update public.afiliados set cupom = upper(p_cupom), stripe_promotion_code_id = p_promo_id, updated_at = now()
   where id = p_id and cupom is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'ja_tem_cupom'); end if;
  return jsonb_build_object('ok', true);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'error', 'cupom_em_uso');
end;
$$;

revoke all on function public.definir_cupom_afiliado(uuid, text, text) from public, anon, authenticated;
grant execute on function public.definir_cupom_afiliado(uuid, text, text) to service_role;

-- Cupom já usado por alguém? O worker pula esse candidato antes de tentar na Stripe.
create or replace function public.cupom_livre(p_cupom text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.afiliados where cupom = upper(p_cupom));
$$;

revoke all on function public.cupom_livre(text) from public, anon, authenticated;
grant execute on function public.cupom_livre(text) to service_role;

-- aprovar_afiliado devolve também o cupom e os candidatos, para o worker criar o cupom.
create or replace function public.aprovar_afiliado(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.afiliados%rowtype;
  v_vagas int;
  v_ativos int;
begin
  if not public.is_staff() then return jsonb_build_object('ok', false, 'error', 'somente_equipe'); end if;
  perform pg_advisory_xact_lock(hashtext('trustio.afiliados.vagas'));

  select * into v from public.afiliados where id = p_id for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'nao_encontrado'); end if;

  if v.status <> 'ativo' then
    select (value #>> '{}')::int into v_vagas from public.app_settings where key = 'afiliados_vagas';
    v_vagas := coalesce(v_vagas, 100);
    select count(*) into v_ativos from public.afiliados where status = 'ativo';
    if v_ativos >= v_vagas then
      return jsonb_build_object('ok', false, 'error', 'vagas_esgotadas', 'vagas', v_vagas);
    end if;
  end if;

  perform set_config('trustio.afiliado_rpc', 'on', true);
  update public.afiliados
     set status = 'ativo',
         aprovado_em = coalesce(aprovado_em, now()),
         aprovado_por = coalesce(aprovado_por, auth.uid()),
         link_enviado_em = now(),
         updated_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'id', v.id, 'email', v.email, 'nome', v.nome, 'codigo', v.codigo,
    'cupom', v.cupom, 'whatsapp', v.whatsapp, 'candidatos', to_jsonb(public.cupons_candidatos(v.nome)));
end;
$$;

-- ── comissões ───────────────────────────────────────────────────────────────
create table if not exists public.comissoes (
  id uuid primary key default gen_random_uuid(),
  afiliado_id uuid not null references public.afiliados(id),
  stripe_event_id text not null,
  stripe_session_id text not null,
  stripe_payment_intent text,
  stripe_price_id text,
  comprador_email text,
  valor_venda int not null check (valor_venda >= 0),
  valor_tabela int not null check (valor_tabela >= 0),
  valor_comissao int not null check (valor_comissao >= 0),
  atribuicao text not null check (atribuicao in ('cupom', 'link')),
  teto_aplicado boolean not null default false,
  auto_indicacao boolean not null default false,
  status text not null default 'a_pagar' check (status in ('a_pagar', 'pago', 'cancelada')),
  pago_em timestamptz,
  pago_por uuid,
  notas text,
  created_at timestamptz not null default now()
);

create unique index if not exists comissoes_evento_unico on public.comissoes (stripe_event_id);
create unique index if not exists comissoes_sessao_unica on public.comissoes (stripe_session_id);
create index if not exists comissoes_afiliado on public.comissoes (afiliado_id, created_at);

alter table public.comissoes enable row level security;

drop policy if exists "equipe lê comissões" on public.comissoes;
create policy "equipe lê comissões" on public.comissoes for select using (public.is_staff());

drop policy if exists "equipe edita comissões" on public.comissoes;
create policy "equipe edita comissões" on public.comissoes for update
  using (public.is_staff()) with check (public.is_staff());

grant select, update on public.comissoes to authenticated;

-- A equipe só muda status e notas; valores e origem vêm da Stripe e não se editam.
create or replace function public.guard_comissao_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.afiliado_id := old.afiliado_id;
  new.stripe_event_id := old.stripe_event_id;
  new.stripe_session_id := old.stripe_session_id;
  new.stripe_payment_intent := old.stripe_payment_intent;
  new.stripe_price_id := old.stripe_price_id;
  new.comprador_email := old.comprador_email;
  new.valor_venda := old.valor_venda;
  new.valor_tabela := old.valor_tabela;
  new.valor_comissao := old.valor_comissao;
  new.atribuicao := old.atribuicao;
  new.teto_aplicado := old.teto_aplicado;
  new.auto_indicacao := old.auto_indicacao;
  new.created_at := old.created_at;
  if new.status = 'pago' and old.status is distinct from 'pago' then
    new.pago_em := now();
    new.pago_por := auth.uid();
  elsif new.status <> 'pago' then
    new.pago_em := null;
    new.pago_por := null;
  else
    new.pago_em := old.pago_em;
    new.pago_por := old.pago_por;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_comissao_update on public.comissoes;
create trigger guard_comissao_update before update on public.comissoes
  for each row execute function public.guard_comissao_update();

-- Tabela pública de afiliados.html, pelo valor de tabela (antes do desconto) em centavos.
-- Planos B2B mensais: 10% da 1ª fatura. Valor fora da tabela: sem comissão (0).
create or replace function public.comissao_por_valor(p_centavos int)
returns int language sql immutable set search_path = public as $$
  select case p_centavos
    when 79000 then 20000    -- Chat sem censura · Anual (R$ 790) → R$ 200
    when 7900 then 7900      -- Chat sem censura · Mensal → 1 mensalidade
    when 2490 then 2490      -- Passe 7 dias → o valor do passe
    when 169000 then 42000   -- Combo Chat + Agentio · Anual → R$ 420
    when 17900 then 17900    -- Combo · Mensal → 1 mensalidade
    when 12900 then 12900    -- Agentio · Mensal → 1 mensalidade
    when 119000 then 30000   -- Agentio · Anual → R$ 300
    when 490000 then 50000   -- Diagnóstico B2B → R$ 500
    when 290000 then 29000   -- B2B Starter → 10% da 1ª fatura
    when 790000 then 79000   -- B2B Pro → 10% da 1ª fatura
    when 1990000 then 199000 -- B2B Dedicado → 10% da 1ª fatura
    else 0
  end;
$$;

-- Registra a comissão de uma venda confirmada pela Stripe. Idempotente: o mesmo evento (ou
-- a mesma sessão de checkout) entregue de novo não gera segunda comissão.
create or replace function public.registrar_comissao(
  p_evento text,
  p_sessao text,
  p_ref text,
  p_promo_id text,
  p_email_comprador text,
  p_valor_venda int,
  p_price_id text default null,
  p_payment_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.afiliados%rowtype;
  v_atribuicao text;
  v_tabela int;
  v_comissao int;
  v_mes int;
  v_ano int;
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_inicio_ano timestamptz := date_trunc('year', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_teto boolean := false;
  v_auto boolean;
  v_id uuid;
  c_teto_mes constant int := 2500000;   -- R$ 25.000/mês por afiliado
  c_teto_ano constant int := 30000000;  -- R$ 300.000/ano por afiliado
begin
  if exists (select 1 from public.comissoes where stripe_event_id = p_evento or stripe_session_id = p_sessao) then
    return jsonb_build_object('ok', true, 'registrada', false, 'motivo', 'repetida');
  end if;

  -- Cupom digitado no checkout vence o link: é a indicação mais recente.
  if nullif(p_promo_id, '') is not null then
    select * into a from public.afiliados where stripe_promotion_code_id = p_promo_id;
    if found then v_atribuicao := 'cupom'; end if;
  end if;
  if v_atribuicao is null and nullif(trim(coalesce(p_ref, '')), '') is not null then
    select * into a from public.afiliados where cupom = upper(trim(p_ref)) or codigo = upper(trim(p_ref)) limit 1;
    if found then v_atribuicao := 'link'; end if;
  end if;
  if v_atribuicao is null then return jsonb_build_object('ok', true, 'registrada', false, 'motivo', 'sem_afiliado'); end if;
  if a.status <> 'ativo' then return jsonb_build_object('ok', true, 'registrada', false, 'motivo', 'afiliado_inativo'); end if;

  v_tabela := public.comissao_por_valor(coalesce(p_valor_venda, 0));
  if v_tabela = 0 then return jsonb_build_object('ok', true, 'registrada', false, 'motivo', 'valor_fora_da_tabela'); end if;

  -- Um afiliado por vez: duas vendas simultâneas não furam o teto.
  perform pg_advisory_xact_lock(hashtext('trustio.comissoes.' || a.id::text));
  select coalesce(sum(valor_comissao), 0) into v_mes from public.comissoes
   where afiliado_id = a.id and status <> 'cancelada' and created_at >= v_inicio_mes;
  select coalesce(sum(valor_comissao), 0) into v_ano from public.comissoes
   where afiliado_id = a.id and status <> 'cancelada' and created_at >= v_inicio_ano;

  v_comissao := least(v_tabela, greatest(c_teto_mes - v_mes, 0), greatest(c_teto_ano - v_ano, 0));
  v_teto := v_comissao < v_tabela;
  v_auto := lower(coalesce(p_email_comprador, '')) = lower(a.email);

  insert into public.comissoes (afiliado_id, stripe_event_id, stripe_session_id, stripe_payment_intent, stripe_price_id,
    comprador_email, valor_venda, valor_tabela, valor_comissao, atribuicao, teto_aplicado, auto_indicacao)
  values (a.id, p_evento, p_sessao, p_payment_intent, p_price_id, lower(nullif(trim(p_email_comprador), '')),
    p_valor_venda, v_tabela, v_comissao, v_atribuicao, v_teto, v_auto)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then return jsonb_build_object('ok', true, 'registrada', false, 'motivo', 'repetida'); end if;

  return jsonb_build_object('ok', true, 'registrada', true, 'comissao_id', v_id, 'valor_comissao', v_comissao,
    'valor_venda', p_valor_venda, 'teto_aplicado', v_teto, 'atribuicao', v_atribuicao, 'auto_indicacao', v_auto,
    'afiliado', jsonb_build_object('nome', a.nome, 'email', a.email, 'whatsapp', a.whatsapp));
end;
$$;

revoke all on function public.registrar_comissao(text, text, text, text, text, int, text, text) from public, anon, authenticated;
grant execute on function public.registrar_comissao(text, text, text, text, text, int, text, text) to service_role;
