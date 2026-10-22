// Testes das skills no chat (supabase/functions/chat/skills.ts): o id que vem do navegador não é
// confiável, o catálogo bate com o do app (assets/chat-skills.js) e cada bloco cabe no prompt.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SKILLS, blocoDaSkill, skillDoPedido } from "../supabase/functions/chat/skills.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("id do pedido: vazio/null desliga, id do catálogo vale, o resto mantém a skill da conversa", () => {
  assert.equal(skillDoPedido(""), null);
  assert.equal(skillDoPedido(null), null);
  assert.equal(skillDoPedido("legal-brazil-lawyer"), "legal-brazil-lawyer");
  assert.equal(skillDoPedido(undefined), undefined);
  assert.equal(skillDoPedido("nao-existe"), undefined);
  assert.equal(skillDoPedido(42), undefined);
  assert.equal(skillDoPedido({ id: "scrapy" }), undefined);
});

t("chaves do protótipo não viram skill", () => {
  for (const k of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
    assert.equal(skillDoPedido(k), undefined, k);
    assert.equal(blocoDaSkill(k), "", k);
  }
});

t("bloco: nome, aviso de que as regras da Trustio continuam valendo e o texto da skill", () => {
  const b = blocoDaSkill("scrapy");
  assert.match(b, /^Skill ativa nesta conversa: /);
  assert.match(b, /não as substituem/);
  assert.ok(b.endsWith(SKILLS.scrapy.prompt));
});

t("catálogo: 15 skills, iguais às do app, cada uma com nome curto e texto de até 5.000 caracteres", () => {
  const ids = Object.keys(SKILLS);
  assert.equal(ids.length, 15);
  for (const id of ids) {
    assert.match(id, /^[a-z0-9-]{1,64}$/);
    assert.ok(SKILLS[id].nome.length > 0 && SKILLS[id].nome.length <= 40, id);
    assert.ok(SKILLS[id].prompt.length > 500 && SKILLS[id].prompt.length <= 5000, id);
  }
});

const app = await readFile(new URL("../assets/chat-skills.js", import.meta.url), "utf8");
const doApp = [...app.matchAll(/^\s{4}\['([a-z0-9-]+)',/gm)].map((m) => m[1]);
t("os ids do app e os da função são os mesmos, e cada um tem o .zip publicado", () => {
  assert.deepEqual([...doApp].sort(), Object.keys(SKILLS).sort());
});
for (const id of doApp) await readFile(new URL(`../app/skills/${id}.zip`, import.meta.url));

t("o texto das skills não cita outra IA pelo nome (regra da marca)", () => {
  for (const [id, s] of Object.entries(SKILLS)) {
    assert.doesNotMatch(s.prompt + s.nome, /\b(ChatGPT|OpenAI|Gemini|Claude|Anthropic|GPT-\d|Kimi|Copilot)\b/, id);
  }
});

console.log(`\n${n + 1} testes passaram`);
