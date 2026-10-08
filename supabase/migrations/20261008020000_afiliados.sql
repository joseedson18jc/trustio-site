-- Trustio · programa de afiliados (100 vagas, cadastro sujeito a aprovação).
--
-- Fluxo:
--   1. afiliados.html posta no worker (POST /afiliados), que chama registrar_afiliado com
--      a chave de serviço. O afiliado entra como 'pendente', já com código reservado
--      (ex.: MARIA482), e recebe por e-mail o aviso de que o cadastro está em análise.
--   2. A equipe aprova na aba Afiliados do CRM (/crm/afiliados.html). O CRM chama o
--      worker (POST /afiliados/aprovar) com o token da pessoa logada; o worker chama
--      aprovar_afiliado com esse token, então is_staff() vale, e envia por e-mail o link
--      https://trustio.com.br/?ref=CODIGO. O CRM abre o WhatsApp do afiliado com a mesma
--      mensagem pronta.
--   3. aprovar_afiliado recusa a 101ª vaga: só 100 afiliados ativos no país.
--
-- Tabela própria, e não colunas em crm_leads: afiliado é parceiro, não cliente, e CPF e
-- chave Pix não devem passar pelas políticas de "lead lê a própria linha".

create table if not exists public.afiliados (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nome text not null,
  whatsapp text not null check (whatsapp ~ '^[0-9]{10,13}$'),
  canal text not null,
  audiencia text,
  cpf text not null check (cpf ~ '^[0-9]{11}$'),
  pix_tipo text not null check (pix_tipo in ('cpf', 'email', 'telefone', 'aleatoria')),
  pix_chave text not null,
  codigo text not null,
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'pausado', 'recusado', 'removido')),
  notas text,
  recebido_enviado_em timestamptz,
  aprovado_em timestamptz,
  aprovado_por uuid,
  link_enviado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists afiliados_email_unico on public.afiliados (lower(email));
create unique index if not exists afiliados_codigo_unico on public.afiliados (codigo);
-- Um afiliado por CPF: o mesmo titular não abre duas contas para dobrar o teto.
create unique index if not exists afiliados_cpf_unico on public.afiliados (cpf);

alter table public.afiliados enable row level security;

drop policy if exists "equipe lê afiliados" on public.afiliados;
create policy "equipe lê afiliados" on public.afiliados for select
  using (public.is_staff());

drop policy if exists "equipe edita afiliados" on public.afiliados;
create policy "equipe edita afiliados" on public.afiliados for update
  using (public.is_staff()) with check (public.is_staff());

grant select, update on public.afiliados to authenticated;

-- Pela edição direta a equipe muda notas, chave Pix e status (pausar, recusar, remover).
-- E-mail, CPF e código são a identidade do link; virar 'ativo' só por aprovar_afiliado,
-- que confere as 100 vagas e registra quem aprovou.
create or replace function public.guard_afiliado_update()
returns trigger language plpgsql set search_path = public as $$
begin
  new.email := old.email;
  new.cpf := old.cpf;
  new.codigo := old.codigo;
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

drop trigger if exists guard_afiliado_update on public.afiliados;
create trigger guard_afiliado_update before update on public.afiliados
  for each row when (current_setting('trustio.afiliado_rpc', true) is distinct from 'on')
  execute function public.guard_afiliado_update();

-- Vagas do programa (app_settings, para a equipe poder mudar sem migração).
insert into public.app_settings (key, value) values ('afiliados_vagas', to_jsonb(100))
on conflict (key) do nothing;

-- CPF com os dois dígitos verificadores certos (11 dígitos, sem todos iguais).
create or replace function public.cpf_valido(p_cpf text)
returns boolean language plpgsql immutable set search_path = public as $$
declare
  d int[];
  s int;
  dv int;
  i int;
begin
  if p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^(.)\1{10}$' then return false; end if;
  select array_agg(substr(p_cpf, n, 1)::int order by n) into d from generate_series(1, 11) n;
  s := 0; for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
  if dv <> d[10] then return false; end if;
  s := 0; for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
  return dv = d[11];
end;
$$;

-- Prefixo do código: até 8 letras do primeiro nome, sem acento; TRUSTIO se não sobrar nada.
create or replace function public.prefixo_afiliado(p_nome text)
returns text language sql immutable set search_path = public as $$
  select coalesce(nullif(left(regexp_replace(upper(translate(split_part(trim(coalesce(p_nome, '')), ' ', 1),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '[^A-Z]', '', 'g'), 8), ''), 'TRUSTIO');
$$;

-- Cadastra o afiliado como pendente (ou reconhece o já cadastrado) e devolve
-- { ok, nome, status, enviar }. enviar = true quando o e-mail "recebemos seu cadastro"
-- deve sair: na primeira vez e, depois, no máximo uma vez a cada 5 minutos.
create or replace function public.registrar_afiliado(
  p_email text,
  p_nome text,
  p_canal text,
  p_audiencia text default null,
  p_pix_chave text default null,
  p_pix_tipo text default null,
  p_cpf text default null,
  p_whatsapp text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_nome text := left(nullif(trim(coalesce(p_nome, '')), ''), 120);
  v_canal text := left(nullif(trim(coalesce(p_canal, '')), ''), 80);
  v_aud text := left(nullif(trim(coalesce(p_audiencia, '')), ''), 300);
  v_pix text := left(nullif(trim(coalesce(p_pix_chave, '')), ''), 140);
  v_pix_tipo text := lower(trim(coalesce(p_pix_tipo, '')));
  v_cpf text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '[^0-9]', '', 'g');
  v_id uuid;
  v_codigo text;
  v_status text;
  v_nome_salvo text;
  v_enviar boolean;
  v_tentativa int := 0;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'email_invalido');
  end if;
  if v_nome is null then return jsonb_build_object('ok', false, 'error', 'nome_ausente'); end if;
  if v_canal is null then return jsonb_build_object('ok', false, 'error', 'canal_ausente'); end if;
  if v_wa !~ '^[0-9]{10,13}$' then return jsonb_build_object('ok', false, 'error', 'whatsapp_invalido'); end if;
  if v_pix is null then return jsonb_build_object('ok', false, 'error', 'pix_ausente'); end if;
  if v_pix_tipo not in ('cpf', 'email', 'telefone', 'aleatoria') then
    return jsonb_build_object('ok', false, 'error', 'pix_tipo_invalido');
  end if;
  if not public.cpf_valido(v_cpf) then return jsonb_build_object('ok', false, 'error', 'cpf_invalido'); end if;

  perform set_config('trustio.afiliado_rpc', 'on', true);

  -- E-mail já cadastrado: nada muda. O formulário é público; se ele atualizasse a chave
  -- Pix, qualquer um que soubesse o e-mail de um afiliado desviaria as comissões dele.
  -- Troca de Pix é feita pela equipe, no CRM.
  select id, codigo, nome, status into v_id, v_codigo, v_nome_salvo, v_status
    from public.afiliados where lower(email) = v_email;
  v_nome := coalesce(v_nome_salvo, v_nome);

  -- CPF de outro afiliado (outro e-mail): recusa, sem dizer de quem é.
  if v_id is null and exists (select 1 from public.afiliados where cpf = v_cpf) then
    return jsonb_build_object('ok', false, 'error', 'cpf_em_uso');
  end if;

  while v_id is null loop
    v_tentativa := v_tentativa + 1;
    if v_tentativa > 20 then raise exception 'codigo_indisponivel'; end if;
    v_codigo := public.prefixo_afiliado(v_nome) || lpad((floor(random() * 1000))::int::text, 3, '0');
    begin
      insert into public.afiliados (email, nome, whatsapp, canal, audiencia, cpf, pix_tipo, pix_chave, codigo)
      values (v_email, v_nome, v_wa, v_canal, v_aud, v_cpf, v_pix_tipo, v_pix, v_codigo)
      returning id, status into v_id, v_status;
    exception when unique_violation then
      -- Código repetido: tenta outro. E-mail repetido (cadastro simultâneo): usa o que entrou.
      select id, codigo, status into v_id, v_codigo, v_status from public.afiliados where lower(email) = v_email;
      if v_id is null and exists (select 1 from public.afiliados where cpf = v_cpf) then
        return jsonb_build_object('ok', false, 'error', 'cpf_em_uso');
      end if;
    end;
  end loop;

  update public.afiliados
     set recebido_enviado_em = now()
   where id = v_id and status = 'pendente'
     and (recebido_enviado_em is null or recebido_enviado_em < now() - interval '5 minutes')
  returning true into v_enviar;

  return jsonb_build_object('ok', true, 'nome', v_nome, 'status', v_status, 'enviar', coalesce(v_enviar, false));
end;
$$;

revoke all on function public.registrar_afiliado(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_afiliado(text, text, text, text, text, text, text, text) to service_role;

-- O worker devolve recebido_enviado_em a nulo se a Resend recusar o e-mail de
-- "recebemos seu cadastro", para o afiliado poder enviar o formulário de novo na hora.
create or replace function public.desfazer_recebido_afiliado(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('trustio.afiliado_rpc', 'on', true);
  update public.afiliados set recebido_enviado_em = null where lower(email) = lower(trim(p_email));
end;
$$;

revoke all on function public.desfazer_recebido_afiliado(text) from public, anon, authenticated;
grant execute on function public.desfazer_recebido_afiliado(text) to service_role;

-- Aprova (ou reconfirma) um afiliado. Só a equipe: o worker chama com o token de quem
-- clicou no CRM. Devolve os dados para o e-mail e o WhatsApp com o link. Reaprovar quem
-- já está ativo não gasta vaga: serve para reenviar o link.
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

  -- Uma aprovação por vez: duas pessoas aprovando juntas não passam de 100.
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

  return jsonb_build_object('ok', true, 'email', v.email, 'nome', v.nome, 'codigo', v.codigo, 'whatsapp', v.whatsapp);
end;
$$;

revoke all on function public.aprovar_afiliado(uuid) from public, anon;
grant execute on function public.aprovar_afiliado(uuid) to authenticated;

-- Vagas ocupadas e total, para o contador da aba Afiliados.
create or replace function public.vagas_afiliados()
returns jsonb language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then jsonb_build_object(
    'vagas', coalesce((select (value #>> '{}')::int from public.app_settings where key = 'afiliados_vagas'), 100),
    'ativos', (select count(*) from public.afiliados where status = 'ativo'))
  else null end;
$$;

revoke all on function public.vagas_afiliados() from public, anon;
grant execute on function public.vagas_afiliados() to authenticated;
