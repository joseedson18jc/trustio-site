// Testes do seletor de modelos do chat (supabase/functions/chat/modelos.ts): a lista que vem do
// servidor é normalizada e o Trustio X-Thunderbolt só vale para assinantes, mesmo que o servidor
// não marque o modelo ou que a preferência salva seja de quando a pessoa ainda assinava.
import assert from "node:assert/strict";
import { escolhaPermitida, normalizarModelos, MODELOS_SO_ASSINANTES, temBuscaPropria } from "../supabase/functions/chat/modelos.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const LISTA = normalizarModelos([
  { id: "trustio-flash", rotulo: "Trustio Flash", icone: "flash" },
  { id: "trustio-heavy", rotulo: "Trustio Heavy Thinking", icone: "heavy", padrao: true },
  { id: "trustio-thunderbolt", rotulo: "Trustio X-Thunderbolt", icone: "thunderbolt", assinante: true },
]);

t("Thunderbolt é só para assinantes", () => {
  assert.ok(MODELOS_SO_ASSINANTES.has("trustio-thunderbolt"));
});

t("normalizar: mantém a marca de assinante", () => {
  assert.equal(LISTA.find((m) => m.id === "trustio-thunderbolt").assinante, true);
  assert.equal(LISTA.find((m) => m.id === "trustio-flash").assinante, undefined);
});

t("normalizar: Thunderbolt fica só para assinantes mesmo sem a marca vinda do servidor", () => {
  const [m] = normalizarModelos([{ id: "trustio-thunderbolt", rotulo: "Thunderbolt" }]);
  assert.equal(m.assinante, true);
});

t("normalizar: assinante só com true de verdade", () => {
  const [m] = normalizarModelos([{ id: "outro", rotulo: "Outro", assinante: "sim" }]);
  assert.equal(m.assinante, undefined);
});

t("escolha: assinante pode usar o Thunderbolt", () => {
  assert.equal(escolhaPermitida(LISTA, "trustio-thunderbolt", true), "trustio-thunderbolt");
});

t("escolha: quem está no teste cai no padrão (null)", () => {
  assert.equal(escolhaPermitida(LISTA, "trustio-thunderbolt", false), null);
});

t("escolha: modelos comuns valem para todos", () => {
  assert.equal(escolhaPermitida(LISTA, "trustio-flash", false), "trustio-flash");
});

t("escolha: pedido fora da lista ou vazio cai no padrão", () => {
  assert.equal(escolhaPermitida(LISTA, "deepseek", true), null);
  assert.equal(escolhaPermitida(LISTA, null, true), null);
});

t("busca: o Thunderbolt pesquisa sozinho, a função não abre a rodada de busca", () => {
  assert.equal(temBuscaPropria("trustio-thunderbolt"), true);
  assert.equal(temBuscaPropria("trustio-flash"), false);
});

console.log(`${n} testes ok`);
