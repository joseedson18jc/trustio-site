// Atribuição de origem (assets/origem.js) sem navegador: só as funções puras e
// um localStorage de mentira. Nada sai para a rede.
//
// O que estes casos protegem, na prática: um token que a Stripe recusa derruba
// o checkout — ou seja, um erro aqui custa venda, não relatório. Por isso o
// foco está em caracteres aceitos, limite de 200 e no "não sobrescrever".
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHAVE, decorarUrl, lerParametros, montarToken, origemGuardada, registrarOrigem } from "../assets/origem.js";

/** localStorage de mentira; `quebrado` simula janela privada (lança em tudo). */
function armazemFalso({ quebrado = false, inicial = null } = {}) {
  const dados = new Map(inicial ? [[CHAVE, inicial]] : []);
  return {
    getItem(k) { if (quebrado) throw new Error("acesso negado"); return dados.get(k) ?? null; },
    setItem(k, v) { if (quebrado) throw new Error("acesso negado"); dados.set(k, v); },
    get tamanho() { return dados.size; },
  };
}

test("lê ref e utm_*, ignora o resto e apara espaço", () => {
  assert.deepEqual(lerParametros("?ref=joao&utm_source=instagram&nada=1"), { ref: "joao", utm_source: "instagram" });
  assert.deepEqual(lerParametros("?ref=%20maria%20"), { ref: "maria" });
  assert.equal(lerParametros("?nada=1"), null);
  assert.equal(lerParametros(""), null);
  assert.equal(lerParametros(undefined), null);
  // Valor vazio não conta como origem.
  assert.equal(lerParametros("?ref="), null);
});

test("token: ref ganha de utm, e o resultado só tem o que a Stripe aceita", () => {
  assert.equal(montarToken({ ref: "joao", utm_source: "instagram" }), "ref-joao");
  assert.equal(montarToken({ utm_source: "instagram", utm_campaign: "lancamento" }), "utm-instagram-lancamento");
  assert.equal(montarToken({ utm_source: "instagram" }), "utm-instagram");
  // Acento, espaço e pontuação viram "-"; nada fora de [A-Za-z0-9_-] sobrevive.
  assert.equal(montarToken({ ref: "José Eçá!" }), "ref-Jose-Eca");
  assert.match(montarToken({ ref: "a b/c?d=e#f" }), /^[A-Za-z0-9_-]+$/);
  // 200 caracteres é o teto da Stripe, e o token nunca termina em "-".
  const token = montarToken({ ref: "x".repeat(400) });
  assert.equal(token.length, 200);
  assert.doesNotMatch(token, /-$/);
});

test("token nulo quando não identifica ninguém", () => {
  assert.equal(montarToken(null), null);
  assert.equal(montarToken({}), null);
  // Só pontuação: sobraria o prefixo solto, que não atribui nada a ninguém.
  assert.equal(montarToken({ ref: "!!!" }), null);
  assert.equal(montarToken({ utm_source: "###" }), null);
});

test("decora o link da Stripe sem mexer no que já estava lá", () => {
  const base = "https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08";
  assert.equal(decorarUrl(base, "ref-joao"), `${base}?client_reference_id=ref-joao`);
  // Já tinha um valor: respeita o que o dono fixou à mão.
  const comValor = `${base}?client_reference_id=fixo`;
  assert.equal(decorarUrl(comValor, "ref-joao"), comValor);
  // Sem token, a URL volta idêntica — nenhum "?" sobrando no link.
  assert.equal(decorarUrl(base, null), base);
  // Parâmetro alternativo, usado nos links internos de cadastro.
  assert.equal(decorarUrl("https://trustio.com.br/cadastro.html", "joao", "ref"), "https://trustio.com.br/cadastro.html?ref=joao");
});

test("primeiro toque ganha: origem registrada não é sobrescrita", () => {
  const armazem = armazemFalso();
  const primeira = registrarOrigem(armazem, { ref: "joao" }, new Date("2026-10-08T12:00:00Z"));
  assert.equal(primeira.ref, "joao");
  assert.equal(primeira.em, "2026-10-08T12:00:00.000Z");

  // A pessoa volta uma semana depois por outro canal: o crédito continua do João.
  const segunda = registrarOrigem(armazem, { utm_source: "google" }, new Date("2026-10-15T12:00:00Z"));
  assert.equal(segunda.ref, "joao");
  assert.equal(segunda.utm_source, undefined);
  assert.equal(armazem.tamanho, 1);
});

test("sem parâmetro e sem histórico, não inventa origem", () => {
  const armazem = armazemFalso();
  assert.equal(registrarOrigem(armazem, null), null);
  assert.equal(armazem.tamanho, 0);
});

test("armazenamento bloqueado não derruba nada", () => {
  const armazem = armazemFalso({ quebrado: true });
  // Em janela privada perde-se a atribuição, nunca o checkout: a função
  // devolve a origem desta visita para o link ainda sair decorado.
  const origem = registrarOrigem(armazem, { ref: "joao" });
  assert.equal(origem.ref, "joao");
  assert.equal(montarToken(origem), "ref-joao");
  assert.equal(origemGuardada(armazem), null);
  assert.equal(origemGuardada(undefined), null);
});

test("lixo gravado no localStorage é tratado como ausência", () => {
  assert.equal(origemGuardada(armazemFalso({ inicial: "{isto não é json" })), null);
  assert.equal(origemGuardada(armazemFalso({ inicial: "\"texto\"" })), null);
  // E, nesse caso, a visita de agora pode registrar a origem no lugar do lixo.
  const armazem = armazemFalso({ inicial: "quebrado" });
  assert.equal(registrarOrigem(armazem, { ref: "maria" }).ref, "maria");
});
