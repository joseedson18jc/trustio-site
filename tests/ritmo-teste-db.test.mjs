// Ritmo do teste grátis (20261025230000): uma pergunta por vez e 5 s entre perguntas, sem contar perguntas.
// Pagos, liberados, assinantes e equipe não têm ritmo; o cliente não mexe nas colunas da trava.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, uid } from './teste-gratis-db.mjs';

const RITMO = '20261025230000_ritmo_do_teste.sql';
const reserva = async (db, n) => (await db.query('select reserve_chat_message($1) r', [uid(n)])).rows[0].r;
const terminou = (db, n) => db.query('select fim_chat_message($1)', [uid(n)]);
const devolve = (db, n) => db.query('select release_chat_message($1)', [uid(n)]);
const colunas = async (db, n) => (await db.query('select em_andamento_ate, ultima_pergunta_em, teste_fim from crm_leads where id=$1', [uid(n)])).rows[0];
// Volta o relógio da última pergunta (simula o tempo passando) pelas RPCs, como o servidor faria.
const passar = (db, n, segundos) =>
  db.exec(`set trustio.teste_rpc='on'; update crm_leads set ultima_pergunta_em = ultima_pergunta_em - interval '${segundos} seconds',
    em_andamento_ate = em_andamento_ate - interval '${segundos} seconds' where id='${uid(n)}'; set trustio.teste_rpc='';`);

test('no teste, a segunda pergunta espera a primeira terminar', async () => {
  const { db } = await setup([RITMO]);
  assert.equal((await reserva(db, 2)).ok, true);
  const r = await reserva(db, 2);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'aguarde_resposta');
  assert.ok(r.retry_after > 0 && r.retry_after <= 180);
  assert.equal((await db.query('select mensagens_usadas from crm_leads where id=$1', [uid(2)])).rows[0].mensagens_usadas, 1, 'a recusa não conta uso');
});

test('depois do fim da resposta vale só o intervalo de 5 s', async () => {
  const { db } = await setup([RITMO]);
  await reserva(db, 2);
  await terminou(db, 2);
  assert.equal((await colunas(db, 2)).em_andamento_ate, null, 'fim_chat_message solta a trava');
  const cedo = await reserva(db, 2);
  assert.equal(cedo.error, 'aguarde_intervalo');
  assert.ok(cedo.retry_after >= 1 && cedo.retry_after <= 5);
  await passar(db, 2, 6);
  assert.equal((await reserva(db, 2)).ok, true, '6 s depois a próxima pergunta passa');
});

test('a trava vence sozinha em 180 s se a resposta nunca avisar o fim', async () => {
  const { db } = await setup([RITMO]);
  await reserva(db, 2);
  await passar(db, 2, 179);
  assert.equal((await reserva(db, 2)).error, 'aguarde_resposta');
  await passar(db, 2, 2);
  assert.equal((await reserva(db, 2)).ok, true);
});

test('resposta que falhou solta a conta na hora', async () => {
  const { db } = await setup([RITMO]);
  await reserva(db, 2);
  await devolve(db, 2);
  const c = await colunas(db, 2);
  assert.equal(c.em_andamento_ate, null);
  assert.equal(c.ultima_pergunta_em, null);
  assert.equal((await reserva(db, 2)).ok, true, 'pode tentar de novo sem esperar');
});

test('pagos, assinantes, liberados e equipe não têm ritmo', async () => {
  const { db, actor, control } = await setup([RITMO]);
  await db.exec(`set trustio.pago_rpc='on'; update crm_leads set pago_chat_ate=now()+interval '30 days' where id='${uid(2)}'; set trustio.pago_rpc='';`);
  for (const n of [1, 2, 3, 5]) {
    for (let i = 0; i < 3; i++) assert.equal((await reserva(db, n)).ok, true, `conta ${n}, pergunta ${i + 1}`);
    assert.equal((await colunas(db, n)).em_andamento_ate, null, 'sem trava para quem não está no teste');
  }
  const { rows } = await db.query("insert into auth.users values($1,'livre@test',now(),null) returning id", [uid(6)]);
  await db.query("insert into crm_leads(id,user_id,email,papel,status) values($1,$1,'livre@test','teste','ativo')", [rows[0].id]);
  await actor(1);
  await control(6, 'liberado');
  await actor(null);
  for (let i = 0; i < 3; i++) assert.equal((await reserva(db, 6)).ok, true, 'liberado');
});

test('teste vencido continua respondendo trial_esgotado, não aguarde', async () => {
  const { db } = await setup([RITMO]);
  await reserva(db, 2);
  await db.exec(`set trustio.teste_rpc='on'; update crm_leads set teste_fim=now()-interval '1 minute' where id='${uid(2)}'; set trustio.teste_rpc='';`);
  assert.equal((await reserva(db, 2)).error, 'trial_esgotado');
});

test('o cliente não mexe na trava nem no intervalo', async () => {
  const { db, actor } = await setup([RITMO]);
  await reserva(db, 2);
  const antes = await colunas(db, 2);
  await actor(2);
  await db.query('update crm_leads set em_andamento_ate=null, ultima_pergunta_em=null, nome=$2 where id=$1', [uid(2), 'Novo']);
  await actor(null);
  const depois = await colunas(db, 2);
  assert.equal(depois.em_andamento_ate.getTime(), antes.em_andamento_ate.getTime());
  assert.equal(depois.ultima_pergunta_em.getTime(), antes.ultima_pergunta_em.getTime());
  assert.equal((await reserva(db, 2)).error, 'aguarde_resposta');
});

test('reiniciar o teste no CRM solta a trava', async () => {
  const { db, actor } = await setup([RITMO]);
  await reserva(db, 2);
  await actor(1);
  await db.query("select crm_reiniciar_cota($1,'teste do ritmo')", [uid(2)]);
  await actor(null);
  const c = await colunas(db, 2);
  assert.equal(c.em_andamento_ate, null);
  assert.equal(c.teste_fim, null);
  assert.equal((await reserva(db, 2)).ok, true);
});
