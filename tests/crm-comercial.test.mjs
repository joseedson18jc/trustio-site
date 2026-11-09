import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261109060000_crm_comercial.sql",
    import.meta.url,
  ),
  "utf8",
);
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;
    create function public.is_staff() returns boolean language sql stable as $$ select coalesce(current_setting('test.role',true),'') in ('admin','colaborador') $$;
    create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.role',true),'') = 'admin' $$;`);
  await db.exec(migration);
  const role = async (name) => {
    await db.exec("reset role");
    await db.query("select set_config('test.role',$1,false)", [name]);
    await db.exec("set role authenticated");
  };
  const save = async (item, remove = false) =>
    (
      await db.query("select crm_comercial_salvar($1::jsonb,$2) as saved", [
        JSON.stringify(item),
        remove,
      ])
    ).rows[0].saved.item;
  return { db, role, save };
}
test("commercial CRM uses staff access, linked records, version checks and server history", async () => {
  const { db, role, save } = await setup();
  try {
    await role("teste");
    await assert.rejects(
      save({ id: "account", kind: "account", name: "QA" }),
      /exclusivo/,
    );
    await role("colaborador");
    const account = await save({
      id: "account",
      kind: "account",
      name: "QA",
      tags: ["B2B"],
      value: "",
      probability: "",
    });
    assert.equal(account.version, 1);
    await assert.rejects(
      db.query("update crm_comercial_registros set version=99"),
      /permission denied/,
    );
    const contact = await save({
      id: "contact",
      kind: "contact",
      name: "Pessoa QA",
      account: "account",
    });
    let deal = await save({
      id: "deal",
      kind: "deal",
      name: "Negócio QA",
      account: "account",
      contactId: "contact",
      status: "open",
      stage: "Prospecção",
      value: "1000",
      probability: "50",
    });
    assert.equal(deal.history.length, 1);
    const prior = deal;
    deal = await save({
      ...deal,
      stage: "Reunião",
      history: [{ text: "forged" }],
    });
    assert.equal(deal.history.length, 2);
    assert.match(deal.history[1].text, /Etapa alterada/);
    assert.ok(deal.history.every((entry) => entry.text !== "forged"));
    await assert.rejects(
      save({ ...prior, stage: "Proposta" }),
      /registro mudou/,
    );
    await assert.rejects(
      save({ ...deal, probability: "101" }),
      /probabilidade/,
    );
    await assert.rejects(save({ ...deal, status: "lost" }), /motivo/);
    await assert.rejects(save({ ...deal, stage: "invalid" }), /etapa mudou/);
    const account2 = await save({
      id: "other-account",
      kind: "account",
      name: "Outra conta",
    });
    await assert.rejects(
      save({ ...deal, account: account2.id }),
      /mesma conta/,
    );
    let activity = await save({
      id: "activity",
      kind: "activity",
      subject: "Reunião QA",
      account: "account",
      deal: "deal",
      type: "Reunião",
      state: "pending",
      date: "2026-11-10",
      time: "14:30",
    });
    activity = await save({ ...activity, state: "done" });
    assert.equal(activity.state, "done");
    await assert.rejects(save({ ...activity, date: "2026-02-30" }));
    await assert.rejects(save(deal, true), /administradores/);
    await role("admin");
    await assert.rejects(save(account, true), /vínculos/);
    await assert.rejects(save(deal, true), /vínculos/);
    await assert.rejects(
      save({ ...contact, account: "other-account" }),
      /vínculos/,
    );
    let settings = await save({
      id: "pipeline-settings",
      kind: "settings",
      stages: [
        { id: "Prospecção", label: "Contato inicial" },
        { id: "Reunião", label: "Diagnóstico" },
      ],
    });
    await assert.rejects(
      save({
        ...settings,
        stages: [{ id: "Prospecção", label: "Contato inicial" }],
      }),
      /etapa em uso/,
    );
    deal = await save({ ...deal, stage: "Prospecção", status: "won" });
    assert.match(deal.history.at(-1).text, /Contato inicial/);
    assert.ok(deal.closedAt);
    deal = await save({ ...deal, status: "open" });
    assert.equal(deal.closedAt, null);
    await save(activity, true);
    await save(deal, true);
    await save(contact, true);
    await save(account, true);
    await role("teste");
    assert.equal(
      (await db.query("select * from crm_comercial_registros")).rows.length,
      0,
    );
    await db.exec("reset role; set role anon");
    await assert.rejects(
      db.query("select * from crm_comercial_registros"),
      /permission denied/,
    );
    await assert.rejects(save(account), /permission denied/);
  } finally {
    await db.close();
  }
});
