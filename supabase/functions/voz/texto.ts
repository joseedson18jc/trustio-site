// Texto de uma resposta do chat pronto para ser falado (17 out 2026): sem símbolos de Markdown,
// sem código nem JSON de gráfico, com as fórmulas mais comuns ditas em português.
// Cada caractere enviado à ElevenLabs é cobrado, então o que não se fala sai antes.

const LATEX: Array<[RegExp, string]> = [
  [/\{,\\?\}/g, ","],                                   // vírgula decimal brasileira: 2{,}5 (e o {,\} que o modelo às vezes escreve)
  [/\\[,;:! ]/g, " "],                                  // espaços do LaTeX: \, \; \: \!
  [/\\sqrt\s*\{([^{}]*)\}/g, "raiz de $1"],                // antes da fração: \frac{-b \pm \sqrt{x}}{2a}
  [/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 sobre $2"],
  [/\^\s*\{?2\}?/g, " ao quadrado"],
  [/\^\s*\{?3\}?/g, " ao cubo"],
  [/\^\s*\{([^{}]*)\}/g, " elevado a $1"],
  [/\^\s*(\w)/g, " elevado a $1"],
  [/\\pm/g, " mais ou menos "],
  [/\\(cdot|times)/g, " vezes "],
  [/\\div/g, " dividido por "],
  [/\\(leq|le)\b/g, " menor ou igual a "],
  [/\\(geq|ge)\b/g, " maior ou igual a "],
  [/\\neq/g, " diferente de "],
  [/\\approx/g, " aproximadamente "],
  [/\\infty/g, " infinito "],
  [/\\pi\b/g, " pi "],
  [/\\Delta\b/g, " delta "],
  [/\\int/g, " integral de "],
  [/\\sum/g, " somatório de "],
  [/_\s*\{([^{}]*)\}/g, " $1"],                         // índices: x_{1}, x_1
  [/_\s*(\w)/g, " $1"],
  [/\\[a-zA-Z]+/g, " "],                                // demais comandos (\left, \right, \text, ...)
  [/>/g, " maior que "],
  [/</g, " menor que "],
  [/[{}]/g, ""],
  [/=/g, " igual a "],
  [/(^|[\s(])-\s*(?=[\w(])/g, "$1menos "],
  [/\s\+\s/g, " mais "],
];

function falarLatex(src: string): string {
  let s = src;
  for (const [re, troca] of LATEX) s = s.replace(re, troca);
  return s;
}

export function textoParaFala(md: string): string {
  let s = String(md || "");
  s = s.replace(/\n*\[\[anexo:[^\]]*\]\][\s\S]*?\[\[\/anexo\]\]/g, "\n");      // anexos da mensagem
  s = s.replace(/```[\s\S]*?(```|$)/g, "\n");                                     // código e gráficos
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => " " + falarLatex(m) + ". ");
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => " " + falarLatex(m) + ". ");
  s = s.replace(/\$([^$\n]+?)\$/g, (_, m) => falarLatex(m));
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => falarLatex(m));
  s = s.replace(/<[^>]+>/g, "");                                                 // HTML
  s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, "");                                    // imagens
  s = s.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");                                 // links: só o texto
  s = s.replace(/https?:\/\/\S+/g, "link");
  // Tabelas: a linha separadora some; cada linha vira uma frase com as células separadas por vírgula.
  s = s.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, "");
  s = s.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (_, m) => m.split("|").map((c: string) => c.trim()).filter(Boolean).join(", ") + ".");
  s = s.replace(/`([^`]*)`/g, "$1");
  s = s.replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*)$/gm, "$1.");                              // títulos
  s = s.replace(/^[ \t]*(?:[-*+•]|\d+[.)])[ \t]+(.*)$/gm, "$1.");                      // listas
  s = s.replace(/^[ \t]*>[ \t]?/gm, "");                                               // citações
  s = s.replace(/(\*\*|__)(.+?)\1/g, "$2").replace(/(\*|_)(?=\S)(.+?)(?<=\S)\1/g, "$2");
  s = s.replace(/\s*\n\s*\n\s*/g, ". ").replace(/\s*\n\s*/g, " ");
  s = s.replace(/[ \t]+/g, " ").replace(/\s+([.,;:!?])/g, "$1");
  s = s.replace(/([.!?:])\.+/g, "$1").replace(/\.{2,}/g, ".").replace(/^[.\s]+/, "");
  s = s.trim();
  if (s && !/[.!?…]$/.test(s)) s += ".";
  return s === "." ? "" : s;
}
