-- CRM comercial: contas, contatos, negócios, atividades e modelos.
-- O acesso usa os papéis existentes. As gravações passam pela função transacional
-- para validar vínculos, versão e histórico. O conteúdo inicial fica vazio.
create table public.crm_comercial_registros (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,100}$'),
  kind text not null check (kind in ('account','contact','deal','activity','template','settings')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version > 0)
);
alter table public.crm_comercial_registros enable row level security;
create policy "equipe lê CRM comercial" on public.crm_comercial_registros
  for select to authenticated using (public.is_staff());
revoke all on public.crm_comercial_registros from anon, authenticated;
grant select on public.crm_comercial_registros to authenticated;

create or replace function public.crm_comercial_salvar(p_item jsonb, p_delete boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  registro public.crm_comercial_registros%rowtype;
  anterior jsonb;
  item jsonb := p_item;
  chave text := p_item->>'id';
  tipo text := p_item->>'kind';
  versao integer;
  campo text;
  referencia text;
  tipo_pai text;
  pai jsonb;
  etapas jsonb;
  etapa jsonb;
  agora timestamptz := clock_timestamp();
  mudancas text[] := '{}';
  historico jsonb;
  tem_registro boolean;
begin
  if public.is_staff() is not true then raise exception 'Este CRM é exclusivo da equipe Trustio.' using errcode = '42501'; end if;
  if p_delete and public.is_admin() is not true then raise exception 'Somente administradores podem excluir registros.' using errcode = '42501'; end if;
  if jsonb_typeof(p_item) is distinct from 'object' or chave is null or chave !~ '^[a-zA-Z0-9_-]{1,100}$' or tipo is null or tipo not in ('account','contact','deal','activity','template','settings') or octet_length(p_item::text) > 150000 then
    raise exception 'Registro inválido ou muito grande.';
  end if;
  if coalesce(item->>'version','0') !~ '^\d{1,9}$' then raise exception 'Versão inválida.'; end if;
  versao := coalesce((item->>'version')::integer,0);
  -- Serializa as gravações deste CRM, inclusive a checagem de vínculos.
  perform pg_advisory_xact_lock(hashtext('trustio-crm-comercial'));
  select * into registro from public.crm_comercial_registros where id = chave for update;
  tem_registro := found;
  if tem_registro and (registro.version <> versao or registro.kind <> tipo) or not tem_registro and versao <> 0 then
    raise exception 'Este registro mudou. Atualize os dados e tente de novo.' using errcode = '40001';
  end if;
  anterior := registro.data;
  if p_delete then
    if not tem_registro then raise exception 'Registro não encontrado.'; end if;
    if tipo = 'settings' then raise exception 'Edite as etapas pelo funil.'; end if;
    if exists (select 1 from public.crm_comercial_registros r where r.id <> chave and (r.data->>'account' = chave or r.data->>'deal' = chave or r.data->>'contactId' = chave)) then
      raise exception 'Este registro tem vínculos. Remova os vínculos antes de excluir.';
    end if;
    delete from public.crm_comercial_registros where id = chave;
    return jsonb_build_object('ok',true,'item',null);
  end if;
  if tipo in ('account','contact','deal','template') and (jsonb_typeof(item->'name') is distinct from 'string' or length(btrim(item->>'name')) not between 1 and 300) then raise exception 'Informe um nome ou título.'; end if;
  if tipo in ('account','deal') then
    if item ? 'tags' and (jsonb_typeof(item->'tags') <> 'array') then raise exception 'Marcadores inválidos.'; end if;
    if jsonb_array_length(coalesce(item->'tags','[]'::jsonb)) > 30 then raise exception 'Marcadores inválidos.'; end if;
    for campo in select value from jsonb_array_elements(coalesce(item->'tags','[]'::jsonb)) loop
      if jsonb_typeof(campo::jsonb) <> 'string' then raise exception 'Marcadores inválidos.'; end if;
    end loop;
    foreach campo in array array['value','probability'] loop
      if nullif(item->>campo,'') is not null then
        if item->>campo !~ '^\d+(\.\d+)?$' then raise exception 'Confira o valor e a probabilidade.'; end if;
        if (item->>campo)::numeric < 0 or campo = 'probability' and (item->>campo)::numeric > 100 then raise exception 'Confira o valor e a probabilidade.'; end if;
      end if;
    end loop;
  end if;
  foreach campo in array array['date','closeDate','last','followup'] loop
    if nullif(item->>campo,'') is not null then
      if item->>campo !~ '^\d{4}-\d{2}-\d{2}$' or to_char((item->>campo)::date,'YYYY-MM-DD') <> item->>campo then raise exception 'Data inválida.'; end if;
    end if;
  end loop;
  if nullif(item->>'time','') is not null and item->>'time' !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Horário inválido.'; end if;
  if tipo = 'deal' then
    if nullif(item->>'account','') is null or coalesce(item->>'status','') not in ('open','won','lost') then raise exception 'Informe a conta e a situação do negócio.'; end if;
    if item->>'status' = 'lost' and nullif(btrim(item->>'lossReason'),'') is null then raise exception 'Informe o motivo da perda.'; end if;
    select data->'stages' into etapas from public.crm_comercial_registros where id = 'pipeline-settings';
    etapas := coalesce(etapas,'[{"id":"A mapear"},{"id":"Prospecção"},{"id":"Qualificação"},{"id":"Reunião"},{"id":"Proposta"}]'::jsonb);
    if not exists (select 1 from jsonb_array_elements(etapas) s where s->>'id' = item->>'stage') then raise exception 'A etapa mudou. Atualize o funil.'; end if;
  end if;
  if tipo = 'activity' then
    if nullif(item->>'account','') is null or nullif(item->>'date','') is null or coalesce(item->>'state','') not in ('pending','done') or nullif(btrim(item->>'subject'),'') is null then raise exception 'Informe conta, assunto, prazo e situação da atividade.'; end if;
  end if;
  if tipo in ('account','contact','deal','activity') then
    foreach campo in array array['account','deal','contactId'] loop
      referencia := nullif(item->>campo,'');
      if referencia is null then continue; end if;
      tipo_pai := case campo when 'account' then 'account' when 'deal' then 'deal' else 'contact' end;
      select data into pai from public.crm_comercial_registros where id = referencia and kind = tipo_pai;
      if not found then raise exception 'O vínculo mudou. Atualize os dados.'; end if;
      if campo in ('deal','contactId') and nullif(item->>'account','') is not null and pai->>'account' is distinct from item->>'account' then raise exception 'O contato ou negócio deve pertencer à mesma conta.'; end if;
    end loop;
  end if;
  -- Alterar a conta de um contato ou negócio não pode deixar vínculos inconsistentes.
  if tipo in ('deal','contact') and tem_registro and anterior->>'account' is distinct from item->>'account' then
    if exists (select 1 from public.crm_comercial_registros r where (r.data->>'deal' = chave or r.data->>'contactId' = chave) and r.data->>'account' is distinct from item->>'account') then
      raise exception 'Remova os vínculos com atividades ou negócios antes de mudar a conta.';
    end if;
  end if;
  if tipo = 'settings' then
    if chave <> 'pipeline-settings' or jsonb_typeof(item->'stages') is distinct from 'array' then raise exception 'Funil inválido.'; end if;
    etapas := item->'stages';
    if jsonb_array_length(etapas) not between 1 and 20 then raise exception 'Use de 1 a 20 etapas.'; end if;
    for etapa in select value from jsonb_array_elements(etapas) loop
      if jsonb_typeof(etapa->'id') is distinct from 'string' or length(etapa->>'id') not between 1 and 100 or jsonb_typeof(etapa->'label') is distinct from 'string' or length(btrim(etapa->>'label')) not between 1 and 80 then raise exception 'Nome de etapa inválido.'; end if;
    end loop;
    if (select count(distinct s->>'id') from jsonb_array_elements(etapas) s) <> jsonb_array_length(etapas) then raise exception 'Etapas duplicadas.'; end if;
    if exists (select 1 from public.crm_comercial_registros r where r.kind = 'deal' and not exists (select 1 from jsonb_array_elements(etapas) s where s->>'id' = r.data->>'stage')) then raise exception 'Uma etapa em uso não pode ser removida.'; end if;
  end if;
  -- Histórico de negócios vem do banco. O cliente não pode reescrever eventos passados.
  if tipo = 'deal' then
    if not tem_registro then mudancas := array['Negócio criado'];
    else
      if anterior->>'stage' is distinct from item->>'stage' then mudancas := array_append(mudancas,'Etapa alterada de ' || coalesce((select s->>'label' from jsonb_array_elements(etapas) s where s->>'id' = anterior->>'stage'),anterior->>'stage','Não definida') || ' para ' || coalesce((select s->>'label' from jsonb_array_elements(etapas) s where s->>'id' = item->>'stage'),item->>'stage')); end if;
      if anterior->>'status' is distinct from item->>'status' then mudancas := array_append(mudancas,'Situação alterada para ' || case item->>'status' when 'won' then 'Ganho' when 'lost' then 'Perdido' else 'Em aberto' end); end if;
      if anterior->>'owner' is distinct from item->>'owner' then mudancas := array_append(mudancas,'Responsável alterado para ' || coalesce(nullif(item->>'owner',''),'Não definido')); end if;
      if anterior->>'value' is distinct from item->>'value' then mudancas := array_append(mudancas,'Valor do negócio atualizado'); end if;
      if cardinality(mudancas) = 0 then mudancas := array['Dados do negócio atualizados']; end if;
    end if;
    historico := coalesce(anterior->'history','[]'::jsonb) || jsonb_build_array(jsonb_build_object('at',agora,'text',array_to_string(mudancas,' · '),'actor',auth.uid()));
    item := (item - 'history' - 'createdAt' - 'updatedAt' - 'closedAt') || jsonb_build_object('history',historico,'createdAt',coalesce(anterior->'createdAt',to_jsonb(agora)),'updatedAt',agora,'closedAt',case when item->>'status' = 'open' then null when anterior->>'status' = item->>'status' then coalesce(anterior->'closedAt',to_jsonb(agora)) else to_jsonb(agora) end);
  end if;
  versao := versao + 1;
  item := item || jsonb_build_object('id',chave,'kind',tipo,'version',versao);
  insert into public.crm_comercial_registros(id,kind,data,version) values(chave,tipo,item,versao)
  on conflict(id) do update set data = excluded.data, version = excluded.version;
  return jsonb_build_object('ok',true,'version',versao,'item',item);
end $$;
revoke all on function public.crm_comercial_salvar(jsonb,boolean) from public, anon;
grant execute on function public.crm_comercial_salvar(jsonb,boolean) to authenticated;
