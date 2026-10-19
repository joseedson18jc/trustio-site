// Testes do histórico abreviado (supabase/functions/chat/historico.ts): nunca corta mais de 30%,
// só respostas antigas do assistente, as mais recentes e as perguntas da pessoa ficam inteiras.
import assert from "node:assert/strict";
import { abreviarHistorico, MARCA, CORTE_MAXIMO } from "../supabase/functions/chat/historico.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const tam = (ms) => ms.reduce((s, m) => s + m.content.length, 0);
const longa = (c) => (c + " ").repeat(Math.ceil(3000 / (c.length + 1))).trim();
const conversa = (pares) => Array.from({ length: pares }, (_, i) => [
  { role: "user", content: `pergunta ${i}` }, { role: "assistant", content: longa(`resposta ${i}`) },
]).flat();

t("histórico curto não muda", () => {
  const h = [{ role: "user", content: "oi" }, { role: "assistant", content: "olá" }];
  assert.deepEqual(abreviarHistorico(h), h);
});

t("o corte nunca passa de 30% do histórico", () => {
  for (const pares of [4, 8, 14, 29]) {
    const h = conversa(pares), novo = abreviarHistorico(h);
    const corte = 1 - tam(novo) / tam(h);
    assert.ok(corte <= CORTE_MAXIMO + 1e-9, `${pares} pares: corte ${corte}`);
  }
});

t("conversa longa corta perto do limite, abreviando as mais antigas primeiro", () => {
  const h = conversa(14), novo = abreviarHistorico(h);
  const corte = 1 - tam(novo) / tam(h);
  assert.ok(corte > 0.2, `corte ${corte}`);
  assert.ok(novo[1].content.endsWith(MARCA));
  assert.ok(!novo[novo.length - 1].content.endsWith(MARCA));
});

t("as 6 últimas mensagens e todas as perguntas ficam intactas; mesmo tamanho e ordem", () => {
  const h = conversa(14), novo = abreviarHistorico(h);
  assert.equal(novo.length, h.length);
  h.forEach((m, i) => { assert.equal(novo[i].role, m.role); if (m.role === "user" || i >= h.length - 6) assert.equal(novo[i].content, m.content); });
});

t("não altera a lista original", () => {
  const h = conversa(14), copia = JSON.stringify(h);
  abreviarHistorico(h);
  assert.equal(JSON.stringify(h), copia);
});

console.log(`\n${n} testes passaram`);
