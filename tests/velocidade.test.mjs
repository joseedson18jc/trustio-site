// Velocidade do modelo no chat (assets/velocidade.js): tokens por segundo enquanto ele pensa e escreve.
// Vale o número que o servidor do modelo informa; sem ele, a conta é feita a partir do primeiro token.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(root + "assets/velocidade.js", "utf8"), ctx);
const V = ctx.TrustioVelocidade;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("sem tokens, sem velocidade", () => {
  const m = V.medidor();
  assert.equal(m.taxa(), 0);
  assert.equal(V.rotulo(0), "");
});

t("conta a partir do primeiro token, não do envio (fila e leitura do prompt não entram)", () => {
  const m = V.medidor();
  m.marcar(1, 10_000);
  m.marcar(101, 11_000);
  assert.equal(m.taxa(), 100);
});

t("espera um mínimo de tempo e de tokens antes de mostrar uma estimativa", () => {
  const m = V.medidor();
  m.marcar(1, 0);
  m.marcar(3, 100);
  assert.equal(m.taxa(), 0);
});

t("o número informado pelo servidor do modelo vale mais que a estimativa", () => {
  const m = V.medidor();
  m.marcar(1, 0);
  m.marcar(50, 1000, 131.4);
  assert.equal(m.taxa(), 131);
  m.marcar(60, 5000);
  assert.equal(m.taxa(), 131, "trecho sem número mantém o último informado");
});

t("número informado inválido é ignorado", () => {
  const m = V.medidor();
  m.marcar(1, 0, -5);
  m.marcar(201, 2000, "x");
  assert.equal(m.taxa(), 100);
});

t("rótulo", () => {
  assert.equal(V.rotulo(123), " · 123 tok/s");
});

console.log(`${n} testes ok`);
