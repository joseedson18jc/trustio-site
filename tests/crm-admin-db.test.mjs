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
  const actor = async n => db.exec(`reset role; set request.jwt.claim.sub = '${n ? uid(n) : ''}'; ${n ? 'set role authenticated;' : ''}`);
  const control = async (n,mode,start=null,end=null,reason='Teste administrativo') => db.query('select crm_definir_acesso($1,$2,$3,$4,$5)',[uid(n),mode,start,end,reason]);
  return { db, actor, control };
}
test('admin recebe cadastro e primeira assinatura uma vez, com reserva e revogação protegidas', async () => {
  const {db,actor}=await setup();
  try {
    const sql=migration('20261010190000_crm_admin_notifications.sql');
    await db.exec(`create function public.registrar_comissao(text,text,text,text,text,int,text,text) returns jsonb language sql as $$ select '{"registrada":false,"motivo":"sem_afiliado"}'::jsonb $$;`);
    await db.exec(sql.slice(0,sql.indexOf("select cron.schedule(")));
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,0);
    await db.query('insert into auth.users values($1,$2,null,null)',[uid(6),'new@test']);
    await db.query('insert into crm_leads(id,user_id,email,nome) values($1,$1,$2,$3)',[uid(6),'new@test','New']);
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,2);
    await db.exec(`update crm_leads set status='assinante' where id='${uid(6)}'; update crm_leads set status='cancelado' where id='${uid(6)}'; update crm_leads set status='assinante' where id='${uid(6)}'`);
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,4);
    const paidArgs=['evt','checkout',null,null,'new@test',1000,'price',null];
    const result=(await db.query('select registrar_comissao($1,$2,$3,$4,$5,$6,$7,$8) result',paidArgs)).rows[0].result;
    assert.equal(result.motivo,'sem_afiliado');
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,4);
    paidArgs[4]='buyer-without-account@test';
    await db.query('select registrar_comissao($1,$2,$3,$4,$5,$6,$7,$8)',paidArgs);
    await db.query('select registrar_comissao($1,$2,$3,$4,$5,$6,$7,$8)',paidArgs);
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,6);
    await actor(2); await assert.rejects(db.query('select crm_admin_reservar_avisos()'));
    assert.equal((await db.query('select count(*)::int n from crm_admin_avisos')).rows[0].n,0);
    await actor(null);
    const claimed=(await db.query('select * from crm_admin_reservar_avisos()')).rows;
    assert.equal(claimed.length,6);
    assert.equal((await db.query('select * from crm_admin_reservar_avisos()')).rows.length,0);
    const first=claimed[0];
    await db.query('select crm_admin_concluir_aviso($1,$2,$3,$4)',[first.id,first.reservado_em,'provider',null]);
    await db.query('select crm_admin_concluir_aviso($1,$2,$3,$4)',[first.id,first.reservado_em,null,'late failure']);
    assert.equal((await db.query('select provider_id,erro from crm_admin_avisos where id=$1',[first.id])).rows[0].erro,null);
    await db.exec(`update crm_admin_avisos set reservado_em=now()-interval '3 minutes'; delete from admins where user_id='${uid(4)}'`);
    const retry=(await db.query('select * from crm_admin_reservar_avisos()')).rows;
    assert.ok(retry.every(n=>n.destinatario==='admin@test'&&n.id!==first.id));
    await db.exec(`update crm_admin_avisos set criado_em=now()-interval '24 hours',reservado_em=null`);
    assert.equal((await db.query('select * from crm_admin_reservar_avisos()')).rows.length,0);
  } finally {await db.close();}
});
test('concessão, revogação, agendamento e expiração prevalecem sobre planos e cotas', async () => {
  const { db,actor,control } = await setup();
  try {
    await actor(1); await control(2,'liberado'); await actor(null);
    await db.exec(`update crm_leads set mensagens_usadas=100 where id='${uid(2)}'`);
    assert.equal((await db.query('select reserve_chat_message($1) result',[uid(2)])).rows[0].result.ok,true);
    await actor(1); await control(5,'revogado'); await actor(null);
    assert.equal((await db.query('select acesso_do_chat($1) result',[uid(5)])).rows[0].result.aberto,false);
    assert.equal((await db.query('select reserve_chat_message($1) result',[uid(5)])).rows[0].result.ok,false);
    await actor(1); await control(2,'liberado','2099-01-01','2100-01-01'); await actor(null);
    assert.equal((await db.query('select acesso_do_chat($1) result',[uid(2)])).rows[0].result.aberto,false);
    await actor(1); await control(2,'liberado',null,new Date(Date.now()+60000).toISOString()); await actor(null);
    await db.exec(`select set_config('trustio.access_rpc','on',true); update crm_leads set acesso_fim=now()-interval '1 second' where id='${uid(2)}'`);
    assert.equal((await db.query('select acesso_do_chat($1) result',[uid(2)])).rows[0].result.aberto,false);
    await db.exec(`select set_config('trustio.access_rpc','on',true); update crm_leads set status='cancelado',acesso_modo='padrao',acesso_fim=null where id='${uid(5)}'`);
    assert.equal((await db.query('select reserve_chat_message($1) result',[uid(5)])).rows[0].result.ok,false);
  } finally { await db.close(); }
});
test('bloqueio de login é atômico, restaurável e preserva banimentos externos', async () => {
  const { db,actor,control } = await setup();
  try {
    await actor(null); await db.exec(`update auth.users set banned_until='2090-01-01' where id='${uid(2)}'`);
    await actor(1); await control(2,'bloqueado_login');
    await actor(null); assert.ok((await db.query('select banned_until from auth.users where id=$1',[uid(2)])).rows[0].banned_until > new Date('2090-01-01'));
    await actor(1); await control(2,'padrao'); await actor(null);
    assert.equal(new Date((await db.query('select banned_until from auth.users where id=$1',[uid(2)])).rows[0].banned_until).getUTCFullYear(),2090);
    await actor(1); await control(3,'bloqueado'); await actor(3);
    assert.equal((await db.query('select is_staff() ok')).rows[0].ok,false);
    assert.equal((await db.query('select meu_papel() papel')).rows[0].papel,'teste');
  } finally { await db.close(); }
});
test('cliente e colaborador não elevam privilégios; admins não ficam sem acesso', async () => {
  const { db,actor,control } = await setup();
  try {
    for (const n of [2,3]) {
      await actor(n);
      await assert.rejects(control(2,'liberado'),e=>e.code==='42501');
      await assert.rejects(db.query('update crm_leads set acesso_modo=$1 where id=$2',['liberado',uid(n)]),e=>e.code==='42501');
      await assert.rejects(db.query('select activate_whatsapp_trial($1,7)',[uid(2)]));
      await assert.rejects(db.query('select crm_reiniciar_cota($1,$2)',[uid(2),'teste']));
    }
    await actor(3); await assert.rejects(db.query('update crm_leads set status=$1 where id=$2',['assinante',uid(2)]),e=>e.code==='42501');
    await actor(1); await assert.rejects(control(1,'bloqueado')); await assert.rejects(control(4,'revogado'));
    await assert.rejects(db.query('update crm_leads set status=$1 where id=$2',['cancelado',uid(4)]));
    await db.query('update crm_leads set papel=$1 where id=$2',['teste',uid(4)]);
    await assert.rejects(db.query('update crm_leads set papel=$1 where id=$2',['teste',uid(1)]),/ultimo_admin/);
    await assert.rejects(control(2,'liberado',null,'2000-01-01'));
    await assert.rejects(control(2,'bloqueado','2099-01-01',null));
    await assert.rejects(control(2,'liberado',null,null,''));
    await db.exec('reset role; set role anon');
    await assert.rejects(control(2,'liberado'),e=>e.code==='42501');
  } finally { await db.close(); }
});
test('controle, motivo, prazo do WhatsApp, segmento e reinício de cota têm histórico', async () => {
  const { db,actor,control } = await setup();
  try {
    await actor(1); await control(2,'liberado');
    await db.query('update crm_leads set segmento=$1 where id=$2',['saúde',uid(2)]);
    await db.query('select activate_whatsapp_trial($1,7)',[uid(2)]);
    await db.query('select crm_reiniciar_cota($1,$2)',[uid(2),'Reposição aprovada']);
    await actor(null);
    const fields=(await db.query('select campo,autor from crm_eventos where lead_id=$1',[uid(2)])).rows;
    for (const name of ['acesso_modo','acesso_motivo','segmento','whatsapp_trial_ends_at','cota_reiniciada']) assert.ok(fields.some(x=>x.campo===name && x.autor===uid(1)),name);
    const lead=(await db.query('select * from crm_leads where id=$1',[uid(2)])).rows[0];
    assert.ok(new Date(lead.whatsapp_trial_ends_at)-Date.now()>6*86400000);
    assert.equal(lead.mensagens_usadas,0);
  } finally { await db.close(); }
});

test('teste grátis mantém limite e contador; controle de login não aceita alteração direta',async()=>{
  const {db,actor,control}=await setup();
  try {
    await actor(null);
    for(let i=0;i<5;i++) assert.equal((await db.query('select reserve_chat_message($1) result',[uid(2)])).rows[0].result.ok,true);
    const denied=(await db.query('select reserve_chat_message($1) result',[uid(2)])).rows[0].result;
    assert.equal(denied.error,'trial_esgotado'); assert.equal(denied.used,5);
    await actor(1); await assert.rejects(db.query('update crm_leads set acesso_modo=$1 where id=$2',['bloqueado_login',uid(2)]));
    await control(2,'bloqueado_login'); await actor(null);
    await db.query('update auth.users set banned_until=$1 where id=$2',['2200-01-01',uid(2)]);
    await actor(1); await control(2,'padrao'); await actor(null);
    assert.equal(new Date((await db.query('select banned_until from auth.users where id=$1',[uid(2)])).rows[0].banned_until).getUTCFullYear(),2200);
  } finally {await db.close();}
});

test('convite concede três dias uma vez, usa e-mail confirmado e reenvia sem novo prazo',async()=>{
  const {db,actor}=await setup();
  const invite=(id,request,grant)=>db.query('select crm_preparar_convite($1,$2,$3) convite',[uid(id),uid(request),grant]);
  try {
    await actor(null); await db.query('update crm_leads set email=$1 where id=$2',['forged@test',uid(2)]);
    await actor(1);
    const first=(await invite(2,100,true)).rows[0].convite;
    assert.equal(first.email,'user@test');
    assert.ok(Date.parse(first.fim)-Date.now()>2.99*86400000);
    const repeat=(await invite(2,100,true)).rows[0].convite;
    assert.equal(repeat.fim,first.fim);
    await assert.rejects(invite(2,101,true),/Aguarde/);
    await actor(null); await db.exec(`update crm_convites set criado_em=now()-interval '2 minutes'`);
    await actor(1); const resend=(await invite(2,102,false)).rows[0].convite;
    assert.equal(resend.fim,first.fim); assert.equal(resend.concedeu,false);
    await actor(null); await db.exec(`update crm_convites set criado_em=now()-interval '2 minutes'`);
    await actor(1); const extra=(await invite(2,103,true)).rows[0].convite;
    assert.equal(Date.parse(extra.fim)-Date.parse(first.fim),3*86400000);
    await actor(null);
    assert.equal((await db.query('select count(*) from crm_eventos where campo=$1',['convite_retorno'])).rows[0].count,3);
    await db.exec('set role service_role');
    await db.query('select crm_concluir_convite($1,$2,$3)',[uid(103),'provider-1',null]);
    await db.query('select crm_concluir_convite($1,$2,$3)',[uid(103),null,'Late error']);
    await db.exec('reset role');
    assert.equal((await db.query('select erro from crm_convites where id=$1',[uid(103)])).rows[0].erro,null);
  }finally{await db.close();}
});

test('convite protege bloqueios, contas pagas, Auth e histórico contra cliente e colaborador',async()=>{
  const {db,actor,control}=await setup();
  const invite=(id,request=100,grant=true)=>db.query('select crm_preparar_convite($1,$2,$3)',[uid(id),uid(request),grant]);
  try{
    for(const n of [2,3]) {
      await actor(n); await assert.rejects(invite(2),e=>e.code==='42501');
      assert.equal((await db.query('select * from crm_convites')).rows.length,0);
      await assert.rejects(db.query('select crm_concluir_convite($1,$2,$3)',[uid(100),'forged',null]),e=>e.code==='42501');
      await assert.rejects(db.query('insert into crm_convites(id,lead_id,autor,email,fim,concedeu) values($1,$2,$3,$4,now(),true)',[uid(100),uid(2),uid(n),'forged@test']),e=>e.code==='42501');
    }
    await actor(1);
    for(const n of [1,3,5]) await assert.rejects(invite(n),/acesso sem prazo/);
    for(const mode of ['bloqueado','bloqueado_login','revogado']) {
      await control(2,mode); await assert.rejects(invite(2),/bloqueada ou revogada/);
    }
    await control(2,'liberado','2099-01-01','2100-01-01'); await assert.rejects(invite(2),/agendado/);
    await control(2,'padrao'); await assert.rejects(invite(2,100,false),/Não há convite/);
    await actor(null); await db.query('update auth.users set email_confirmed_at=null where id=$1',[uid(2)]);
    await actor(1); await assert.rejects(invite(2),/confirmado/);
    await actor(null); await db.query('update auth.users set email_confirmed_at=now(),banned_until=$1 where id=$2',['2099-01-01',uid(2)]);
    await actor(1); await assert.rejects(invite(2),/login permitido/);
    await actor(null); await db.query('update auth.users set banned_until=null where id=$1',[uid(2)]);
    await actor(1); await invite(2);
    await actor(null);await db.exec(`update crm_convites set criado_em=now()-interval '24 hours'`);
    await actor(1);await assert.rejects(invite(2),/Convite antigo/);
    await actor(null);await db.exec(`select set_config('trustio.access_rpc','on',true); update crm_leads set acesso_fim=now()-interval '1 second' where id='${uid(2)}'; update crm_convites set fim=now()-interval '1 second'`);
    await actor(1);await assert.rejects(invite(2,101,false),/Não há convite/);
    await db.exec('reset role;set role anon'); await assert.rejects(invite(2),e=>e.code==='42501');
  }finally{await db.close();}
});

test('email tracking deduplica eventos, preserva engajamento fora de ordem e limita leitura ao admin',async()=>{
  const {db,actor}=await setup();
  const event=(id,type,date,to=['USER@test'],message='message')=>db.query('select crm_registrar_email($1,$2,$3,$4,$5,$6,$7,$8)',[id,message,type,date,'contato@trustio.com.br',to,'Convite','https://trustio.com.br/afiliados.html']);
  try {
    await actor(null);await db.exec('set role service_role');
    await event('click','email.clicked','2026-10-10T12:00:00Z');
    await event('click','email.clicked','2026-10-10T12:00:00Z');
    await event('sent','email.sent','2026-10-09T12:00:00Z');
    await event('delivered','email.delivered','2026-10-09T12:01:00Z');
    await event('open','email.opened','2026-10-10T11:00:00Z');
    await event('none','email.delivered','2000-01-01T12:00:00Z',['other@test'],'old');
    await event('bounce','email.bounced','2026-10-10T12:00:00Z',['other@test'],'bounce');
    await event('failed','email.failed','2026-10-10T12:00:00Z',['other@test'],'failed');
    await event('delay','email.delivery_delayed','2026-10-10T12:00:00Z',['other@test'],'delay');
    await event('delayok','email.delivered','2026-10-10T12:01:00Z',['other@test'],'delay');
    await actor(1);
    const data=(await db.query('select * from crm_emails_overview order by email_id')).rows;
    const clicked=data.find(x=>x.email_id==='message');assert.equal(clicked.cliques,1);assert.equal(clicked.estado,'clicado');assert.equal(clicked.lead_id,uid(2));
    assert.ok(clicked.entregue_em);assert.ok(clicked.aberto_em);
    assert.equal(data.find(x=>x.email_id==='old').estado,'sem_interacao');
    assert.equal(data.find(x=>x.email_id==='bounce').estado,'rejeitado');
    assert.equal(data.find(x=>x.email_id==='failed').estado,'falhou');
    assert.equal(data.find(x=>x.email_id==='delay').estado,'entregue');
    for(const n of [2,3]){
      await actor(n);assert.equal((await db.query('select * from crm_emails_overview')).rows.length,0);
      await assert.rejects(event('forged','email.opened','2026-10-10'),e=>e.code==='42501');
      await assert.rejects(db.query('update crm_emails set aberto_em=now()'),e=>e.code==='42501');
    }
  }finally{await db.close();}
});
