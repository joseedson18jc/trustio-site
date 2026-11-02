// Botão parar do chat (supabase/functions/chat/parar.ts e migração 20261102120000): o id de cada envio,
// a vigia que confere a parada a cada intervalo e a tabela parar_chat, que o navegador nunca acessa.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { idDoPedido, vigiarParada } from '../supabase/functions/chat/parar.ts';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const ID = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

test('id do pedido: só UUID, em minúsculas', () => {
  assert.equal(idDoPedido(ID), ID);
  assert.equal(idDoPedido(ID.toUpperCase()), ID);
  for (const ruim of [undefined, null, '', 'abc', 42, {}, `${ID}x`, ` ${ID}`, "'; drop table parar_chat; --"]) {
    assert.equal(idDoPedido(ruim), null, String(ruim));
  }
});

test('vigia: para quando a conferência acha o id, e chama aoParar uma vez', async () => {
  let conferencias = 0, paradas = 0;
  const vigia = vigiarParada(async () => ++conferencias >= 3, () => paradas++, 5);
  assert.equal(vigia.parado, false);
  await espera(60);
  assert.equal(vigia.parado, true);
  assert.equal(paradas, 1);
  assert.equal(conferencias, 3, 'depois de achar, não confere mais');
});

test('vigia: conferência que falha conta como "não parou" e a vigia continua', async () => {
  let conferencias = 0;
  const vigia = vigiarParada(async () => {
    conferencias++;
    if (conferencias === 1) throw new Error('tabela ainda não existe');
    return conferencias === 3;
  }, () => {}, 5);
  await espera(60);
  assert.equal(vigia.parado, true);
  assert.equal(conferencias, 3);
});

test('vigia: encerrar para de conferir, sem disparar aoParar', async () => {
  let conferencias = 0, paradas = 0;
  const vigia = vigiarParada(async () => { conferencias++; return false; }, () => paradas++, 5);
  await espera(30);
  vigia.encerrar();
  const ate = conferencias;
  await espera(30);
  assert.equal(conferencias, ate);
  assert.equal(paradas, 0);
  assert.equal(vigia.parado, false);
});

test('vigia: encerrada no meio de uma conferência que acharia o id, não para', async () => {
  let paradas = 0;
  let soltar;
  const vigia = vigiarParada(() => new Promise((r) => { soltar = r; }), () => paradas++, 5);
  await espera(20);
  vigia.encerrar();
  soltar(true);
  await espera(10);
  assert.equal(paradas, 0);
  assert.equal(vigia.parado, false);
});

async function banco() {
  const db = new PGlite();
  // service_role ignora o RLS, como no Supabase.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;`);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261102120000_botao_parar.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into auth.users values ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');`);
  return db;
}

test('parar_chat: a função (service_role) grava, lê e apaga', async () => {
  const db = await banco();
  await db.exec(`set role service_role;
    insert into parar_chat(pedido_id, user_id) values ('${ID}', '00000000-0000-0000-0000-000000000001')`);
  const { rows } = await db.query(`select user_id from parar_chat where pedido_id = $1`, [ID]);
  assert.equal(rows[0].user_id, '00000000-0000-0000-0000-000000000001');
  await db.exec(`delete from parar_chat where pedido_id = '${ID}'`);
  assert.equal((await db.query('select count(*)::int n from parar_chat')).rows[0].n, 0);
});

test('parar_chat: o navegador (anon e authenticated) não lê nem grava', async () => {
  const db = await banco();
  await db.exec(`insert into parar_chat(pedido_id, user_id) values ('${ID}', '00000000-0000-0000-0000-000000000001')`);
  for (const papel of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${papel};`);
    await assert.rejects(db.query('select * from parar_chat'), /permission denied/, `${papel} lê`);
    await assert.rejects(
      db.query(`insert into parar_chat(pedido_id, user_id) values (gen_random_uuid(), '00000000-0000-0000-0000-000000000002')`),
      /permission denied/, `${papel} grava`);
  }
});

test('parar_chat: conta apagada leva as paradas junto', async () => {
  const db = await banco();
  await db.exec(`insert into parar_chat(pedido_id, user_id) values ('${ID}', '00000000-0000-0000-0000-000000000001');
    delete from auth.users where id = '00000000-0000-0000-0000-000000000001';`);
  assert.equal((await db.query('select count(*)::int n from parar_chat')).rows[0].n, 0);
});
