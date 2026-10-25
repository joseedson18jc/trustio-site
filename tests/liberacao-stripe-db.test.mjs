// Liberação automática dos planos pessoais (20261025180000): plano pelo link, um direito por
// sessão (reenvio não soma dias), compra sem conta guardada até o e-mail ser confirmado,
// cancelamento no fim do período, reembolso na hora, bloqueio do admin acima de tudo.
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
  await db.exec(`create unique index crm_leads_email_idx on crm_leads (lower(email));`);
  await db.exec(migration('20261025180000_liberacao_automatica_stripe.sql'));
  for (const [n,email,papel,status] of [[1,'admin@test','admin','ativo'],[2,'user@test','teste','ativo'],[3,'staff@test','colaborador','ativo'],[4,'admin2@test','admin','ativo'],[5,'paid@test','cliente','assinante']]) {
    await db.query('insert into auth.users values($1,$2,now(),null)',[uid(n),email]);
    await db.query('insert into crm_leads(id,user_id,email,papel,status) values($1,$1,$2,$3,$4)',[uid(n),email,papel,status]);
  }
  const actor = async n => db.exec(`reset role; set request.jwt.claim.sub = '${n ? uid(n) : ''}'; ${n ? 'set role authenticated;' : ''}`);
  const control = async (n,mode,start=null,end=null,reason='Teste administrativo') => db.query('select crm_definir_acesso($1,$2,$3,$4,$5)',[uid(n),mode,start,end,reason]);
  return { db, actor, control };
}

const LINK = { passe: 'plink_1UDTzBEJikqpWGBRttpPYGge', mensal: 'plink_1UDTz3EJikqpWGBRJGeMQsRk',
  combo: 'plink_1UJfQHEJikqpWGBR2V5gVJbH', agentio: 'plink_1UJfQ5EJikqpWGBRU76aJWOA', starter: 'plink_1UBl6oEJikqpWGBR8xEeXJGN' };
const DIA = 86400e3;
async function ctx() {
  const s = await setup();
  const { db } = s;
  const comoServico = () => db.exec(`reset role; set request.jwt.claim.sub = ''; set role service_role;`);
  const compra = async (sessao, email, link, extra = {}) => {
    await comoServico();
    const r = (await db.query('select stripe_ativar_compra($1,$2,$3,$4,$5,$6,$7,$8) r',
      [sessao, email, link, extra.tier ?? null, extra.sub ?? null, extra.cus ?? null, extra.pi ?? null, extra.valor ?? 2490])).rows[0].r;
    await db.exec('reset role');
    return r;
  };
  const lead = async (email) => (await db.query(`select *, pago_chat_ate::text chat_txt, pago_agentio_ate::text ag_txt from crm_leads where lower(email)=lower($1)`, [email])).rows[0];
  const reserva = async (n) => (await db.query('select reserve_chat_message($1) r', [uid(n)])).rows[0].r;
  const ate = (v) => (v === Infinity || v === 'infinity' ? Infinity : new Date(v).getTime());
  return { ...s, comoServico, compra, lead, reserva, ate };
}

test('passe de 7 dias: libera o chat na hora, reenvio não soma dias, segundo passe emenda', async () => {
  const { db, compra, lead, reserva, ate } = await ctx();
  await db.query("update crm_leads set mensagens_usadas=5, status='trial_esgotado' where id=$1", [uid(2)]);
  assert.equal((await reserva(2)).error, 'trial_esgotado');
  const r = await compra('cs_1', 'User@Test', LINK.passe, { pi: 'pi_1' });
  assert.equal(r.ativado, true);
  let l = await lead('user@test');
  const fim1 = ate(l.pago_chat_ate);
  assert.ok(Math.abs(fim1 - (Date.now() + 7 * DIA)) < 60e3, 'fim em 7 dias');
  assert.equal(l.pago_agentio_ate, null, 'passe de chat não libera o Agentio');
  assert.equal(l.pago_plano, 'Chat · passe 7 dias');
  const ok = await reserva(2);
  assert.equal(ok.ok, true); assert.equal(ok.subscriber, true);
  assert.equal((await db.query('select reserve_chat_message($1) r', [uid(2)])).rows[0].r.remaining, null, 'sem contar perguntas');
  assert.equal((await db.query('select voz_acesso_livre($1) v', [uid(2)])).rows[0].v, 'livre');

  assert.equal((await compra('cs_1', 'user@test', LINK.passe, { pi: 'pi_1' })).motivo, 'repetido');
  l = await lead('user@test');
  assert.equal(ate(l.pago_chat_ate), fim1, 'reenvio da Stripe não soma dias');

  await compra('cs_2', 'user@test', LINK.passe, { pi: 'pi_2' });
  l = await lead('user@test');
  assert.ok(Math.abs(ate(l.pago_chat_ate) - (fim1 + 7 * DIA)) < 60e3, 'segundo passe começa quando o primeiro acaba');
  assert.equal((await db.query('select count(*)::int n from direitos_pagos')).rows[0].n, 2);
});

test('fora da liberação automática: empresas, diagnóstico e link desconhecido não liberam nada', async () => {
  const { db, compra, lead } = await ctx();
  assert.equal((await compra('cs_b2b', 'user@test', LINK.starter, { tier: 'starter', valor: 290000 })).motivo, 'fora_da_liberacao_automatica');
  assert.equal((await compra('cs_x', 'user@test', 'plink_desconhecido', { tier: 'diagnostico', valor: 2490 })).motivo, 'fora_da_liberacao_automatica',
    'valor de passe sem link de plano pessoal não vira passe');
  assert.equal((await db.query('select count(*)::int n from direitos_pagos')).rows[0].n, 0);
  assert.equal((await lead('user@test')).pago_chat_ate, null);
  assert.equal((await compra('cs_t', 'user@test', null, { tier: 'pessoal', valor: 7900 })).ativado, true, 'sem link, vale o tier do plano pessoal');
});

test('Agentio sozinho não libera o chat; Combo libera os dois', async () => {
  const { db, compra, lead, reserva } = await ctx();
  await db.query("update crm_leads set mensagens_usadas=5, status='trial_esgotado' where id=$1", [uid(2)]);
  await compra('cs_a', 'user@test', LINK.agentio, { sub: 'sub_a', cus: 'cus_1', valor: 12900 });
  let l = await lead('user@test');
  assert.equal(l.ag_txt, 'infinity'); assert.equal(l.pago_chat_ate, null);
  assert.equal((await reserva(2)).error, 'trial_esgotado');
  await compra('cs_c', 'user@test', LINK.combo, { sub: 'sub_c', cus: 'cus_1', valor: 17900 });
  l = await lead('user@test');
  assert.equal(l.chat_txt, 'infinity'); assert.equal(l.ag_txt, 'infinity');
  assert.equal((await reserva(2)).ok, true);
});

test('quem paga sem conta: direito guardado, aplicado só com o e-mail confirmado', async () => {
  const { db, compra, lead, ate } = await ctx();
  const r = await compra('cs_n', 'novo@test', LINK.passe, { pi: 'pi_n' });
  assert.equal(r.pendente, true);
  let l = await lead('novo@test');
  assert.equal(l.origem, 'stripe'); assert.equal(l.user_id, null); assert.equal(l.pago_chat_ate, null);
  // Cadastro (handle_new_user faz upsert pelo e-mail), ainda sem confirmar.
  await db.query('insert into auth.users values($1,$2,null,null)', [uid(9), 'novo@test']);
  await db.query('update crm_leads set user_id=$1 where lower(email)=$2', [uid(9), 'novo@test']);
  assert.equal((await lead('novo@test')).pago_chat_ate, null, 'sem confirmar o e-mail, nada liberado');
  // Confirmação (handle_user_confirmed copia confirmed_at para o lead): passe começa agora.
  await db.query('update auth.users set email_confirmed_at=now() where id=$1', [uid(9)]);
  await db.query('update crm_leads set confirmed_at=now() where user_id=$1', [uid(9)]);
  l = await lead('novo@test');
  assert.ok(Math.abs(ate(l.pago_chat_ate) - (Date.now() + 7 * DIA)) < 60e3, '7 dias a partir da confirmação');
});

test('assinatura: cancelada vale até o fim do período, evento atrasado é ignorado, encerrada é final', async () => {
  const { db, compra, lead, comoServico, reserva } = await ctx();
  await db.query("update crm_leads set mensagens_usadas=5 where id=$1", [uid(2)]);
  await compra('cs_s', 'user@test', LINK.mensal, { sub: 'sub_1', cus: 'cus_1', valor: 7900 });
  const atualiza = async (fim, encerrar, em) => {
    await comoServico();
    const r = (await db.query('select stripe_atualizar_assinatura($1,$2,$3,$4) r', ['sub_1', fim, encerrar, em])).rows[0].r;
    await db.exec('reset role'); return r;
  };
  const t = (min) => new Date(Date.now() + min * 60e3).toISOString();
  const fimPeriodo = t(10 * 24 * 60);
  await atualiza(fimPeriodo, false, t(1));
  assert.equal(new Date((await lead('user@test')).pago_chat_ate).toISOString(), fimPeriodo, 'cancelou: acesso até o fim do período');
  assert.equal((await reserva(2)).ok, true);
  assert.equal((await atualiza(null, false, t(0))).atualizadas, 0, 'evento mais velho que o aplicado não reabre');
  await atualiza(null, false, t(2));
  assert.equal((await lead('user@test')).chat_txt, 'infinity', 'desfez o cancelamento');
  await atualiza(t(-1), true, t(3));
  assert.ok((await lead('user@test')).pago_chat_ate < new Date(), 'encerrada: acesso acabou');
  assert.equal((await reserva(2)).error, 'trial_esgotado', 'volta ao teste grátis (já usado), sem bloquear a conta');
  assert.equal((await atualiza(null, false, t(4))).atualizadas, 0, 'depois de encerrada, nada reabre');
});

test('reembolso total corta na hora: passe pelo pagamento, assinatura pelo cliente', async () => {
  const { db, compra, lead, comoServico } = await ctx();
  await compra('cs_p', 'user@test', LINK.passe, { pi: 'pi_p', cus: 'cus_1' });
  await compra('cs_s', 'user@test', LINK.agentio, { sub: 'sub_1', cus: 'cus_1', valor: 12900 });
  const reembolso = async (pi, cus) => { await comoServico();
    const r = (await db.query('select stripe_reembolso($1,$2) r', [pi, cus])).rows[0].r; await db.exec('reset role'); return r; };
  assert.equal((await reembolso('pi_p', 'cus_1')).encerradas, 1);
  let l = await lead('user@test');
  assert.equal(l.pago_chat_ate, null, 'passe reembolsado não conta mais');
  assert.equal(l.ag_txt, 'infinity', 'o pagamento identificado não derruba a assinatura do mesmo cliente');
  assert.equal((await reembolso('pi_renovacao', 'cus_1')).encerradas, 1, 'renovação: acha a assinatura pelo cliente');
  l = await lead('user@test');
  assert.equal(l.pago_agentio_ate, null);
  assert.equal((await reembolso('pi_outro', 'cus_b2b')).encerradas, 0);
  const d = (await db.query("select encerrado_motivo m from direitos_pagos order by criado_em")).rows.map((x) => x.m);
  assert.deepEqual(d, ['reembolso', 'reembolso']);
});

test('segurança: cliente não grava acesso pago nem chama as funções; bloqueio do admin prevalece', async () => {
  const { db, actor, compra, reserva, control } = await ctx();
  await actor(2);
  await assert.rejects(db.query(`update crm_leads set pago_chat_ate='infinity' where user_id='${uid(2)}'`), /só muda pelos pagamentos/);
  await assert.rejects(db.query("select stripe_ativar_compra('cs_f','user@test',$1)", [LINK.mensal]), /permission denied/);
  await assert.rejects(db.query("select stripe_reembolso('pi')"), /permission denied/);
  await db.exec('reset role');
  await db.exec(`set role anon`);
  await assert.rejects(db.query("select stripe_atualizar_assinatura('sub',null)"), /permission denied/);
  await db.exec('reset role');
  await assert.rejects(db.query(`insert into crm_leads(email,pago_chat_ate) values('x@test','infinity') returning pago_chat_ate`).then((r) => {
    if (r.rows[0].pago_chat_ate === null) throw new Error('zerado no insert'); }), /zerado no insert/);

  await compra('cs_m', 'user@test', LINK.mensal, { sub: 'sub_m', cus: 'cus_2', valor: 7900 });
  await actor(1);
  await control(2, 'revogado');
  await db.exec('reset role');
  assert.equal((await reserva(2)).error, 'acesso_revogado', 'revogação do admin vale por cima do pagamento');
  assert.equal((await db.query('select voz_acesso_livre($1) v', [uid(2)])).rows[0].v, 'revogado');
});
