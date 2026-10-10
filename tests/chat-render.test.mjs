// Testes do renderizador do chat (assets/chat-render.js): leitor de expressões, LaTeX, dinheiro (R$),
// tabelas e blocos de gráfico. Roda o arquivo como no navegador, num contexto isolado com o KaTeX.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("..", import.meta.url));
const ctx = { console, document: { documentElement: { lang: "pt-BR" } } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(root + "assets/vendor/katex/katex.min.js", "utf8"), ctx);
vm.runInContext(readFileSync(root + "assets/chat-render.js", "utf8"), ctx);
const R = ctx.TrustioRender;
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("expressões: precedência, implícita, unário", () => {
  const f = R.compile("2x^2 - 3sin(pi/2) + -x^2", ["x"]);
  assert.equal(f({ x: 3 }), 6);
  assert.equal(R.compile("2^-1", [])({}), 0.5);
  assert.equal(R.compile("-x^2", ["x"])({ x: 2 }), -4);
  assert.ok(Math.abs(R.compile("sin(x)·cos(y)", ["x", "y"])({ x: Math.PI / 2, y: 0 }) - 1) < 1e-12);
  assert.ok(Math.abs(R.compile("π", [])({}) - Math.PI) < 1e-12);
});

t("expressões: nada vira código", () => {
  for (const bad of ["constructor", "alert(1)", "x.constructor", "this", "window", "a[0]", "`x`", "x;y", "process.exit()"]) {
    assert.throws(() => R.compile(bad, ["x"]), undefined, bad);
  }
});

t("LaTeX inline e em bloco viram MathML", () => {
  const h = R.html("A raiz é $x = \\frac{-b}{2a}$.\n\n$$\\int_0^1 x^2\\,dx = \\frac13$$");
  assert.match(h, /<span class="tg-math"><span class="katex"><math/);
  assert.match(h, /<div class="tg-math-block"><span class="katex"><math[^>]*display="block"/);
  assert.doesNotMatch(h, /style="/, "sem estilos inline (CSP)");
});

t("\\( \\) e \\[ \\] também", () => {
  const h = R.html("Seja \\(a^2\\) e \\[b^2\\]");
  assert.equal((h.match(/<math/g) || []).length, 2);
});

t("dinheiro não vira fórmula", () => {
  for (const s of ["Custa R$ 1.000,00 por mês.", "R$10 e R$20", "de R$ 5 a R$ 9", "Total R$ 42,18"]) {
    assert.doesNotMatch(R.html(s), /<math/, s);
  }
  assert.match(R.html("Total R$ 42,18 e $x^2$"), /<math/);
});

t("várias fórmulas seguidas viram blocos, não <p>", () => {
  const h = R.html("$$a=1$$\n$$b=2$$\n$$c=3$$");
  assert.equal((h.match(/tg-math-block/g) || []).length, 3);
  assert.doesNotMatch(h, /<p><div/);
});

t("tabela com fórmula na célula", () => {
  const h = R.html("| Mês | Cálculo |\n|---|---:|\n| 1 | $1000 \\times 1{,}01$ |");
  assert.match(h, /<table><thead><tr><th>Mês<\/th><th class="tg-al-r">Cálculo<\/th>/);
  assert.match(h, /<td class="tg-al-r"><span class="tg-math">/);
});

t("bloco grafico vira figura; JSON incompleto espera; inválido fechado vira código", () => {
  const ok = R.html('```grafico\n{"tipo":"2d","titulo":"Seno","funcoes":[{"expr":"sin(x)"}]}\n```');
  assert.match(ok, /<figure class="tg-graf" data-graf="[^"]+"><figcaption>Seno<\/figcaption><\/figure>/);
  assert.match(R.html('```grafico\n{"tipo":"2d","fun'), /tg-graf-wait/);
  assert.match(R.html("```grafico\n{quebrado}\n```"), /<pre><code>\{quebrado\}/);
});

t("HTML do modelo é escapado; links só http(s)", () => {
  const h = R.html('<img src=x onerror=alert(1)> [ok](https://trustio.com.br) [mau](javascript:alert(1))');
  assert.doesNotMatch(h, /<img/);
  assert.match(h, /<a href="https:\/\/trustio.com.br" target="_blank" rel="noopener noreferrer nofollow">ok<\/a>/);
  assert.doesNotMatch(h, /href="javascript/);
});

t("cases, matriz e boxed passam pelo KaTeX sem erro", () => {
  const h = R.html("$$\\begin{cases} x = R\\cos t \\\\ y = R\\sin t \\end{cases}$$ $$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$ $\\boxed{3}$");
  assert.doesNotMatch(h, /katex-error/);
});

t("streaming: todo prefixo das respostas reais do Qwen renderiza sem erro", () => {
  const samples = JSON.parse(readFileSync(root + "tests/fixtures/chat-render-samples.json", "utf8"));
  let calls = 0;
  for (const text of Object.values(samples)) {
    for (let i = 1; i <= text.length; i += 7) { R.html(text.slice(0, i)); calls++; }
    const full = R.html(text);
    assert.doesNotMatch(full, /katex-error/);
  }
  assert.ok(calls > 300);
});

console.log(`\n${n} testes passaram`);
