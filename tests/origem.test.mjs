// Atribuição de origem (assets/origem.js) sem navegador: só as funções puras, um
// localStorage de mentira e uma string de cookie. Nada sai para a rede.
//
// O que estes casos protegem, na prática: um token que a Stripe recusa derruba o
// checkout, e um código de afiliado errado paga a pessoa errada. Erro aqui custa venda e
// comissão, não relatório. Daí o foco em caracteres aceitos, teto de 200, e sobretudo na
// precedência entre o `?ref=` da visita e o cookie que `app.js` deixou.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CHAVE, campanhaGuardada, codigoDeAfiliado, decorarUrl, lerParametros, montarToken, registrarCampanha,
} from "../assets/origem.js";

/** localStorage de mentira; `quebrado` simula janela privada (lança em tudo). */
function armazemFalso({ quebrado = false, inicial = null } = {}) {
  const dados = new Map(inicial ? [[CHAVE, inicial]] : []);
  return {
    getItem(k) { if (quebrado) throw new Error("acesso negado"); return dados.get(k) ?? null; },
    setItem(k, v) { if (quebrado) throw new Error("acesso negado"); dados.set(k, v); },
    get tamanho() { return dados.size; },
  };
}

test("campanha: lê utm_*, apara espaço e ignora o resto", () => {
  assert.deepEqual(lerParametros("?utm_source=instagram&nada=1"), { utm_source: "instagram" });
  assert.deepEqual(lerParametros("?utm_source=%20ig%20"), { utm_source: "ig" });
  assert.equal(lerParametros("?nada=1"), null);
  assert.equal(lerParametros(""), null);
  assert.equal(lerParametros(undefined), null);
  assert.equal(lerParametros("?utm_source="), null);
  // `ref` é do cookie, não da campanha: não pode entrar no registro de primeiro toque.
  assert.equal(lerParametros("?ref=JOSE042"), null);
});

test("afiliado: último clique vence, como os termos publicados prometem", () => {
  // A visita atual é o clique mais recente, então ganha do cookie.
  assert.equal(codigoDeAfiliado("?ref=BIA456", "trustio_ref=ANA123"), "BIA456");
  // Sem ?ref= nesta visita, vale o que o app.js guardou.
  assert.equal(codigoDeAfiliado("", "trustio_ref=ANA123"), "ANA123");
  assert.equal(codigoDeAfiliado("?utm_source=x", "a=1; trustio_ref=ANA123; b=2"), "ANA123");
  // Minúsculas são normalizadas, como o app.js faz ao gravar.
  assert.equal(codigoDeAfiliado("?ref=jose042", ""), "JOSE042");
});

test("afiliado: código fora do formato é ignorado, nunca adivinhado", () => {
  // Melhor nenhuma atribuição que pagar a pessoa errada.
  assert.equal(codigoDeAfiliado("?ref=naoexiste", ""), null);
  assert.equal(codigoDeAfiliado("?ref=TOOLONGNAME123", ""), null);
  assert.equal(codigoDeAfiliado("?ref=JOSE42", ""), null);
  assert.equal(codigoDeAfiliado("", "trustio_ref=lixo"), null);
  assert.equal(codigoDeAfiliado("", ""), null);
  assert.equal(codigoDeAfiliado(undefined, undefined), null);
  // Um ?ref= inválido não apaga o cookie válido: o clique ruim é que é ignorado.
  assert.equal(codigoDeAfiliado("?ref=lixo", "trustio_ref=ANA123"), "ANA123");
  // Cookie de nome parecido não vale pelo prefixo.
  assert.equal(codigoDeAfiliado("", "outro_trustio_ref=ANA123"), null);
});

test("token: afiliado ganha de campanha, e o resultado só tem o que a Stripe aceita", () => {
  assert.equal(montarToken("JOSE042", { utm_source: "instagram" }), "ref-JOSE042");
  assert.equal(montarToken(null, { utm_source: "instagram", utm_campaign: "lancamento" }), "utm-instagram-lancamento");
  assert.equal(montarToken(null, { utm_source: "instagram" }), "utm-instagram");
  assert.match(montarToken(null, { utm_source: "a b/c?d=e#f" }), /^[A-Za-z0-9_-]+$/);
  assert.equal(montarToken(null, { utm_source: "Eçã" }), "utm-Eca");
  // 200 é o teto da Stripe, e o token nunca termina em "-".
  const t = montarToken(null, { utm_source: "x".repeat(400) });
  assert.equal(t.length, 200);
  assert.doesNotMatch(t, /-$/);
});

test("token nulo quando não identifica ninguém", () => {
  assert.equal(montarToken(null, null), null);
  assert.equal(montarToken(null, {}), null);
  assert.equal(montarToken(null, { utm_source: "###" }), null);
});

test("decora o link da Stripe sem mexer no que já estava lá", () => {
  const base = "https://buy.stripe.com/28EcN5aYq4Td9afgVp5wI08";
  assert.equal(decorarUrl(base, "ref-JOSE042"), `${base}?client_reference_id=ref-JOSE042`);
  const comValor = `${base}?client_reference_id=fixo`;
  assert.equal(decorarUrl(comValor, "ref-JOSE042"), comValor);
  assert.equal(decorarUrl(base, null), base);
  assert.equal(decorarUrl("https://trustio.com.br/cadastro.html", "JOSE042", "ref"), "https://trustio.com.br/cadastro.html?ref=JOSE042");
});

test("campanha: primeiro toque ganha e não é sobrescrito", () => {
  const armazem = armazemFalso();
  const primeira = registrarCampanha(armazem, { utm_source: "instagram" }, new Date("2026-10-08T12:00:00Z"));
  assert.equal(primeira.utm_source, "instagram");
  assert.equal(primeira.em, "2026-10-08T12:00:00.000Z");
  const segunda = registrarCampanha(armazem, { utm_source: "google" }, new Date("2026-10-15T12:00:00Z"));
  assert.equal(segunda.utm_source, "instagram");
  assert.equal(armazem.tamanho, 1);
});

test("sem parâmetro e sem histórico, não inventa campanha", () => {
  const armazem = armazemFalso();
  assert.equal(registrarCampanha(armazem, null), null);
  assert.equal(armazem.tamanho, 0);
});

test("armazenamento bloqueado não derruba nada", () => {
  const armazem = armazemFalso({ quebrado: true });
  const c = registrarCampanha(armazem, { utm_source: "instagram" });
  assert.equal(c.utm_source, "instagram");
  assert.equal(campanhaGuardada(armazem), null);
  assert.equal(campanhaGuardada(undefined), null);
  // E o afiliado não depende de localStorage nenhum: vem do cookie.
  assert.equal(codigoDeAfiliado("", "trustio_ref=ANA123"), "ANA123");
});

test("lixo gravado no localStorage é tratado como ausência", () => {
  assert.equal(campanhaGuardada(armazemFalso({ inicial: "{isto não é json" })), null);
  assert.equal(campanhaGuardada(armazemFalso({ inicial: "\"texto\"" })), null);
  const armazem = armazemFalso({ inicial: "quebrado" });
  assert.equal(registrarCampanha(armazem, { utm_source: "ig" }).utm_source, "ig");
});
