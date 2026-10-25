// Teste grátis por tempo (20261025210000): 3 dias a partir da primeira pergunta, sem contar perguntas.
// Pagos, liberados, assinantes e equipe nunca são barrados; o cliente não mexe em teste_fim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, uid } from './teste-gratis-db.mjs';


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
