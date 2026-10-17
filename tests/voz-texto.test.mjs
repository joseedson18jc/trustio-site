// Testes do texto que vai para a voz (supabase/functions/voz/texto.ts): o que se lê em voz alta
// não pode ter símbolos de Markdown, código, JSON de gráfico nem LaTeX cru.
import assert from "node:assert/strict";
import { textoParaFala } from "../supabase/functions/voz/texto.ts";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("Markdown vira texto corrido", () => {
  assert.equal(textoParaFala("# Título\n\n**Negrito** e *itálico* com `código`.\n\n- item um\n- item dois"),
    "Título. Negrito e itálico com código. item um. item dois.");
});

t("bloco de código e gráfico não são lidos", () => {
  const md = "Veja:\n\n```python\nprint('oi')\n```\n\n```grafico\n{\"tipo\":\"2d\"}\n```\n\nFim.";
  assert.equal(textoParaFala(md), "Veja: Fim.");
});

t("links falam só o texto; URL solta vira 'link'", () => {
  assert.equal(textoParaFala("Leia [o guia](https://x.com/a) ou https://trustio.com.br/planos agora."),
    "Leia o guia ou link agora.");
});

t("tabela vira frases", () => {
  assert.equal(textoParaFala("| Parcela | Valor |\n|---|---|\n| 1ª | R$ 10 |"), "Parcela, Valor. 1ª, R$ 10.");
});

t("fórmulas comuns são faladas em português", () => {
  assert.equal(textoParaFala("A raiz é $x = \\frac{-b \\pm \\sqrt{\\Delta}}{2a}$ e $x^2$."),
    "A raiz é x igual a menos b mais ou menos raiz de delta sobre 2a e x ao quadrado.");
});

t("vírgula decimal brasileira em LaTeX", () => {
  assert.equal(textoParaFala("Vale $2{,}5$."), "Vale 2,5.");
});

t("bloco de anexo e marcas HTML somem", () => {
  assert.equal(textoParaFala("Oi <b>você</b>\n\n[[anexo: a.pdf]]\nconteúdo\n[[/anexo]]"), "Oi você.");
});

t("espaços do LaTeX, vírgula quebrada, índices, sinais e menos antes de parêntese", () => {
  assert.equal(textoParaFala("Vértice em $(2{,\\}5,\\; -0{,}25)$, com $x_1 > 0$ e $-(-5)$."),
    "Vértice em (2,5, menos 0,25), com x 1 maior que 0 e menos (menos 5).");
});

t("texto vazio continua vazio", () => {
  assert.equal(textoParaFala("```\nsó código\n```"), "");
});

console.log(`\n${n} testes passaram`);
