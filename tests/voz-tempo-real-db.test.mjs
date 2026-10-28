// Voz em tempo real (20261028090000): segundos por dia, só para assinantes, reservados pelo relé do worker.
// Quem está no teste não reserva nada; acesso revogado também não; o cliente não chama as funções.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, uid } from './teste-gratis-db.mjs';

const VOZ = '20261017090000_voz.sql';
const TEMPO_REAL = '20261028090000_voz_tempo_real.sql';
const reservar = async (db, n, segundos, limite = 3600) =>
  (await db.query('select reservar_voz_tempo_real($1,$2,$3) r', [uid(n), segundos, limite])).rows[0].r;
const devolver = (db, n, dia, segundos) => db.query('select devolver_voz_tempo_real($1,$2,$3)', [uid(n), dia, segundos]);
const situacao = async (db, n, limite = 3600) =>
  (await db.query('select voz_tempo_real_situacao($1,$2) r', [uid(n), limite])).rows[0].r;
const usados = async (db, n) =>
  (await db.query('select coalesce(sum(segundos),0)::int s from voz_tempo_real_uso where user_id=$1', [uid(n)])).rows[0].s;

test('assinante reserva os segundos pedidos e vê o que resta no dia', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  const r = await reservar(db, 5, 900);
  assert.equal(r.ok, true);
  assert.equal(r.segundos, 900);
  assert.equal(r.restante, 2700);
  assert.equal(await usados(db, 5), 900);
  assert.equal((await situacao(db, 5)).restante, 2700);
});

test('perto do teto a reserva encolhe, e no teto é recusada', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  for (let i = 0; i < 3; i++) assert.equal((await reservar(db, 5, 900, 3000)).ok, true);
  const ultima = await reservar(db, 5, 900, 3000);
  assert.equal(ultima.segundos, 300, 'só o que resta até o teto');
  const recusa = await reservar(db, 5, 900, 3000);
  assert.equal(recusa.ok, false);
  assert.equal(recusa.error, 'voz_tempo_real_limite');
  assert.equal(await usados(db, 5), 3000);
});

test('devolver solta o que a sessão não usou, nunca abaixo de zero', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  const r = await reservar(db, 5, 900);
  await devolver(db, 5, r.dia, 600);
  assert.equal(await usados(db, 5), 300);
  await devolver(db, 5, r.dia, 5000);
  assert.equal(await usados(db, 5), 0);
});

test('quem está no teste não reserva: a voz em tempo real é só para assinantes', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  const r = await reservar(db, 2, 900);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'voz_tempo_real_assinantes');
  assert.equal(await usados(db, 2), 0);
  assert.equal((await situacao(db, 2)).acesso, 'teste');
});

test('equipe tem acesso livre; acesso revogado é recusado', async () => {
  const { db, actor, control } = await setup([VOZ, TEMPO_REAL]);
  assert.equal((await reservar(db, 3, 60)).ok, true);
  await actor(1);
  await control(5, 'revogado');
  await actor(null);
  const r = await reservar(db, 5, 60);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'acesso_revogado');
});

test('pedido inválido não reserva nada', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  assert.equal((await reservar(db, 5, 0)).error, 'pedido_invalido');
  assert.equal((await reservar(db, 5, 60, 0)).error, 'pedido_invalido');
  assert.equal(await usados(db, 5), 0);
});

test('o navegador não chama as funções nem lê a tabela', async () => {
  const { db, actor } = await setup([VOZ, TEMPO_REAL]);
  await actor(5);
  await assert.rejects(db.query('select reservar_voz_tempo_real($1,60,3600)', [uid(5)]), /permission denied/);
  await assert.rejects(db.query('select voz_tempo_real_situacao($1,3600)', [uid(5)]), /permission denied/);
  await assert.rejects(db.query('select * from voz_tempo_real_uso'), /permission denied/);
});

test('assinante com o chat ainda fechado não reserva (mesma porta da voz e do chat)', async () => {
  const { db } = await setup([VOZ, TEMPO_REAL]);
  await db.exec(`insert into app_settings values ('acesso_abre_em', to_jsonb((now() + interval '3 days')::text)),
    ('acesso_antecipado_em', to_jsonb((now() + interval '2 days')::text))
    on conflict (key) do update set value = excluded.value;`);
  const r = await reservar(db, 5, 900);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'chat_ainda_fechado');
  assert.equal(await usados(db, 5), 0);
  const s = await situacao(db, 5);
  assert.equal(s.restante, 0);
  assert.equal(s.chat_aberto, false);
});
