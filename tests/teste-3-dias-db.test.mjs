// Teste grátis por tempo (20261025210000): 3 dias a partir da primeira pergunta, sem contar perguntas.
// Pagos, liberados, assinantes e equipe nunca são barrados; o cliente não mexe em teste_fim.
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
const MIGRATION = '20261025210000_teste_gratis_3_dias.sql';
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
  await db.exec(`create unique index crm_leads_email_idx on crm_leads (lower(email));`);
  await db.exec(migration('20261025180000_liberacao_automatica_stripe.sql'));
  await db.exec(migration(MIGRATION));
  for (const [n,email,papel,status] of [[1,'admin@test','admin','ativo'],[2,'user@test','teste','ativo'],[3,'staff@test','colaborador','ativo'],[4,'admin2@test','admin','ativo'],[5,'paid@test','cliente','assinante']]) {
    await db.query('insert into auth.users values($1,$2,now(),null)',[uid(n),email]);
    await db.query('insert into crm_leads(id,user_id,email,papel,status) values($1,$1,$2,$3,$4)',[uid(n),email,papel,status]);
  }
  const actor = async n => db.exec(`reset role; set request.jwt.claim.sub = '${n ? uid(n) : ''}'; ${n ? 'set role authenticated;' : ''}`);
  const control = async (n,mode,start=null,end=null,reason='Teste administrativo') => db.query('select crm_definir_acesso($1,$2,$3,$4,$5)',[uid(n),mode,start,end,reason]);
  return { db, actor, control };
}


const DIA = 86400e3;
const reserva = async (db, n) => (await db.query('select reserve_chat_message($1) r', [uid(n)])).rows[0].r;
const fim = async (db, n) => (await db.query('select teste_fim from crm_leads where id=$1', [uid(n)])).rows[0].teste_fim;
const forcarFim = (db, n, quando) =>
  db.exec(`set trustio.teste_rpc='on'; update crm_leads set teste_fim='${quando.toISOString()}' where id='${uid(n)}'; set trustio.teste_rpc='';`);

test('a primeira pergunta abre 3 dias de teste e não há limite de perguntas', async () => {
  const { db } = await setup();
  assert.equal((await db.query('select free_trial_days() d')).rows[0].d, 3);
  assert.equal(await fim(db, 2), null, 'conta nova: o teste ainda não começou');
  const r1 = await reserva(db, 2);
  assert.equal(r1.ok, true);
  assert.equal(r1.subscriber, false);
  const f = await fim(db, 2);
  assert.ok(Math.abs(f - Date.now() - 3 * DIA) < 60e3, 'teste_fim = agora + 3 dias');
  assert.equal(new Date(r1.trial_ends_at).getTime(), f.getTime());
  for (let i = 0; i < 12; i++) assert.equal((await reserva(db, 2)).ok, true, 'perguntas ilimitadas durante o teste');
  assert.equal((await fim(db, 2)).getTime(), f.getTime(), 'as perguntas seguintes não estendem o teste');
});

test('depois dos 3 dias o chat responde trial_esgotado', async () => {
  const { db } = await setup();
  await reserva(db, 2);
  await forcarFim(db, 2, new Date(Date.now() - 1000));
  const r = await reserva(db, 2);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'trial_esgotado');
  assert.ok(r.trial_ends_at);
  assert.equal((await db.query('select status from crm_leads where id=$1', [uid(2)])).rows[0].status, 'trial_esgotado');
});

test('quem já gastou as 5 perguntas ganha os 3 dias na próxima pergunta', async () => {
  const { db } = await setup();
  await db.exec(`set trustio.lead_rpc='on'; update crm_leads set mensagens_usadas=5, status='trial_esgotado' where id='${uid(2)}'; set trustio.lead_rpc='';`);
  const r = await reserva(db, 2);
  assert.equal(r.ok, true);
  assert.ok(await fim(db, 2));
  assert.equal((await db.query('select status from crm_leads where id=$1', [uid(2)])).rows[0].status, 'ativo');
});

test('equipe, cliente, assinante e plano pago nunca são barrados pelo fim do teste', async () => {
  const { db } = await setup();
  await db.query("insert into auth.users values($1,'pago@test',now(),null)", [uid(6)]);
  await db.query("insert into crm_leads(id,user_id,email,papel,status) values($1,$1,'pago@test','teste','ativo')", [uid(6)]);
  await db.exec(`set trustio.pago_rpc='on'; update crm_leads set pago_chat_ate=now()+interval '30 days' where id='${uid(6)}'; set trustio.pago_rpc='';`);
  for (const n of [1, 3, 5, 6]) {
    await forcarFim(db, n, new Date(Date.now() - DIA));
    const r = await reserva(db, n);
    assert.equal(r.ok, true, 'conta ' + n);
    assert.equal(r.subscriber, true, 'conta ' + n);
  }
});

test('o cliente não altera o próprio teste_fim', async () => {
  const { db, actor } = await setup();
  await reserva(db, 2);
  const antes = await fim(db, 2);
  await actor(2);
  await db.query("update crm_leads set teste_fim=now()+interval '400 days', nome='Novo' where id=$1", [uid(2)]);
  await actor(null);
  const lead = (await db.query('select teste_fim, nome from crm_leads where id=$1', [uid(2)])).rows[0];
  assert.equal(lead.teste_fim.getTime(), antes.getTime());
  assert.equal(lead.nome, 'Novo', 'os dados de contato continuam editáveis');
  await actor(2);
  await db.query("update crm_leads set teste_fim=null where id=$1", [uid(2)]);
  await actor(null);
  assert.equal((await fim(db, 2)).getTime(), antes.getTime(), 'nem zerando o teste_fim');
  await actor(null);
});

test('resposta que falhou na primeira pergunta devolve o teste inteiro', async () => {
  const { db } = await setup();
  const r = await reserva(db, 2);
  await db.query('select release_chat_message($1)', [r.lead_id]);
  assert.equal(await fim(db, 2), null, 'contador voltou a 0: o relógio não começou');
  await reserva(db, 2); await reserva(db, 2);
  const f = await fim(db, 2);
  await db.query('select release_chat_message($1)', [r.lead_id]);
  assert.equal((await fim(db, 2)).getTime(), f.getTime(), 'já tinha pergunta respondida: o teste segue');
});

test('reiniciar a cota no CRM reinicia também os 3 dias', async () => {
  const { db, actor } = await setup();
  await reserva(db, 2);
  await forcarFim(db, 2, new Date(Date.now() - 1000));
  await reserva(db, 2);
  await actor(1);
  await db.query("select crm_reiniciar_cota($1,'cliente pediu mais tempo')", [uid(2)]);
  await actor(null);
  assert.equal(await fim(db, 2), null);
  assert.equal((await reserva(db, 2)).ok, true);
});
