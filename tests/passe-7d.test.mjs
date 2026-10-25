import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = name => readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
function definition(sql, name) {
  const start = sql.indexOf('create or replace function public.' + name + '(');
  const end = sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3;
  return sql.slice(start, end);
}
const uid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table app_settings(key text primary key,value jsonb);
    create table admins(user_id uuid primary key);
    create function public.emails_admin() returns text[] language sql as $$ select array['admin@test','admin2@test'] $$;`);
  const base = migration('20260920120000_trustio_auth_crm_chat.sql');
  for (const table of ['crm_leads','conversations','messages']) {
    const a = base.indexOf('create table if not exists public.' + table);
    await db.exec(base.slice(a, base.indexOf('\n);', a) + 3));
  }
  await db.exec(`alter table crm_leads add papel text default 'teste', add onboarding_seen_at timestamptz,
    add whatsapp_numero text, add whatsapp_trial_status text default 'nao_solicitado',
    add whatsapp_trial_requested_at timestamptz, add whatsapp_trial_started_at timestamptz, add whatsapp_trial_ends_at timestamptz,
    add whatsapp_aviso_email_em timestamptz, add whatsapp_aviso_email_reserva timestamptz, add whatsapp_aviso_email_erro text,
    add whatsapp_aviso_wa_em timestamptz, add whatsapp_aviso_wa_reserva timestamptz, add whatsapp_aviso_wa_erro text,
    add whatsapp_ativacao text, add proximo_contato date, add etiquetas text[] default '{}';
    create table crm_eventos(id bigint generated always as identity,lead_id uuid,em timestamptz default now(),autor uuid,autor_email text,campo text,de text,para text);
    insert into app_settings values('free_message_limit','5');
    create function public.free_message_limit() returns integer language sql as $$ select (value #>> '{}')::integer from app_settings where key='free_message_limit' $$;
    create function public.conversas_de(p_user_id uuid) returns bigint language sql as $$ select count(*) from conversations where user_id=p_user_id $$;
    create function public.ultima_mensagem_de(p_user_id uuid) returns timestamptz language sql as $$ select max(created_at) from messages where user_id=p_user_id $$;`);
  const roles = migration('20260925200000_tipos_de_usuario.sql');
  await db.exec(definition(migration('20260926150000_revisao_seguranca.sql'),'pode_ser_admin'));
  for (const name of ['is_admin','is_staff','validar_papel','sincronizar_admins','guardar_admins']) await db.exec(definition(roles,name));
  await db.exec(`create trigger crm_leads_papel before insert or update of papel on crm_leads for each row execute function validar_papel();
    create trigger crm_leads_sincroniza_admins after insert or update of papel on crm_leads for each row execute function sincronizar_admins();
    create trigger admins_guarda after insert or delete on admins for each row execute function guardar_admins();`);
  await db.exec(definition(migration('20260929200000_crm_historico_retorno_etiquetas.sql'),'guard_lead_update'));
  await db.exec(`create trigger crm_leads_guard before update on crm_leads for each row execute function guard_lead_update();
    alter table crm_leads enable row level security;
    create policy equipe on crm_leads for all to authenticated using (user_id=auth.uid() or public.is_staff()) with check(user_id=auth.uid() or public.is_staff());
    grant usage on schema auth to authenticated; grant select,update on crm_leads to authenticated;`);
  await db.exec(migration('20261010150000_crm_investigacao.sql'));
  await db.exec(migration('20261010160000_crm_controle_acesso.sql'));
  await db.exec(migration('20261010170000_crm_convite_retorno.sql'));
  await db.exec(migration('20261010180000_crm_email_tracking.sql'));
  await db.exec(`create trigger crm_leads_eventos after insert or update on crm_leads for each row execute function crm_registrar_eventos();`);
  for (const [n,email,papel,status] of [[1,'admin@test','admin','ativo'],[2,'user@test','teste','ativo'],[3,'staff@test','colaborador','ativo'],[4,'admin2@test','admin','ativo'],[5,'paid@test','cliente','assinante']]) {
    await db.query('insert into auth.users values($1,$2,now(),null)',[uid(n),email]);
    await db.query('insert into crm_leads(id,user_id,email,papel,status) values($1,$1,$2,$3,$4)',[uid(n),email,papel,status]);
  }
  await db.exec(migration('20261025120000_passe_7d_e_expiracao_liberado.sql'));
  return { db };
}

test('passe de 7 dias concede acesso temporário e expira suavemente para cota padrão', async () => {
  const { db } = await setup();

  // Comprador prévio ganha passe de 7 dias
  await db.query(`insert into auth.users values ('${uid(10)}', 'buyer@test', now(), null)`);
  await db.query(`insert into crm_leads(id, user_id, email, papel, status) values ('${uid(10)}', '${uid(10)}', 'buyer@test', 'teste', 'novo')`);

  const res1 = (await db.query(`select public.ativar_assinatura_stripe('buyer@test', 2490) as r`)).rows[0].r;
  assert.equal(res1.ok, true);
  assert.equal(res1.passe_7d, true);

  const lead1 = (await db.query(`select * from crm_leads where email = 'buyer@test'`)).rows[0];
  assert.equal(lead1.acesso_modo, 'liberado');
  assert.ok(lead1.acesso_fim > new Date());

  const reserve1 = (await db.query(`select public.reserve_chat_message('${uid(10)}') as r`)).rows[0].r;
  assert.equal(reserve1.ok, true);
  assert.equal(reserve1.subscriber, true);

  // Expiração do passe de 7 dias não bloqueia como revogado, reverte para teste
  await db.exec(`set trustio.access_rpc = 'on'; update crm_leads set acesso_inicio = now() - interval '8 days', acesso_fim = now() - interval '1 day' where email = 'buyer@test';`);
  const chatExpired = (await db.query(`select public.acesso_do_chat('${uid(10)}') as r`)).rows[0].r;
  assert.equal(chatExpired.aberto, true);

  const vozExpired = (await db.query(`select public.voz_acesso_livre('${uid(10)}') as r`)).rows[0].r;
  assert.equal(vozExpired, 'teste');

  // Continua com cota de teste disponível (usou 1 mensagem, limite é 5)
  const reserveExpired = (await db.query(`select public.reserve_chat_message('${uid(10)}') as r`)).rows[0].r;
  assert.equal(reserveExpired.ok, true);
  assert.equal(reserveExpired.subscriber, false);
  assert.equal(reserveExpired.used, 2);
  assert.equal(reserveExpired.remaining, 3);

  // Quando a cota de teste estoura após expiração, dá trial_esgotado (não revogado)
  await db.exec(`set trustio.lead_rpc = 'on'; update crm_leads set mensagens_usadas = 5 where email = 'buyer@test';`);
  const reserveEsgotado = (await db.query(`select public.reserve_chat_message('${uid(10)}') as r`)).rows[0].r;
  assert.equal(reserveEsgotado.ok, false);
  assert.equal(reserveEsgotado.error, 'trial_esgotado');
});

test('ativação Stripe lida com cupom de desconto, mensal e compra pré-cadastro', async () => {
  const { db } = await setup();

  // Cupom de 10% no passe de 7 dias (2241 centavos)
  await db.query(`insert into auth.users values ('${uid(11)}', 'cupom@test', now(), null)`);
  await db.query(`insert into crm_leads(id, user_id, email, papel, status) values ('${uid(11)}', '${uid(11)}', 'cupom@test', 'teste', 'novo')`);
  const resCupom = (await db.query(`select public.ativar_assinatura_stripe('cupom@test', 2241) as r`)).rows[0].r;
  assert.equal(resCupom.ok, true);
  assert.equal(resCupom.passe_7d, true);

  // Assinatura mensal (7900 centavos)
  const resMensal = (await db.query(`select public.ativar_assinatura_stripe('cupom@test', 7900) as r`)).rows[0].r;
  assert.equal(resMensal.ok, true);
  assert.equal(resMensal.passe_7d, false);
  const leadMensal = (await db.query(`select * from crm_leads where email = 'cupom@test'`)).rows[0];
  assert.equal(leadMensal.status, 'assinante');
  assert.equal(leadMensal.acesso_fim, null);

  // Comprador sem lead prévio (compra antes do cadastro)
  const resSemLead = (await db.query(`select public.ativar_assinatura_stripe('novo_comprador@test', 2490) as r`)).rows[0].r;
  assert.equal(resSemLead.ok, true);
  assert.equal(resSemLead.passe_7d, true);
  const leadCriado = (await db.query(`select * from crm_leads where email = 'novo_comprador@test'`)).rows[0];
  assert.ok(leadCriado);
  assert.equal(leadCriado.acesso_modo, 'liberado');
});
