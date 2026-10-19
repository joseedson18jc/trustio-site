// Histórico enviado ao modelo, mais curto (19 out 2026). O modelo lê o prompt a ~270 tokens/s, e cada
// rodada da conversa relê tudo: respostas antigas e longas são o que mais pesa. Abrevia as MAIS ANTIGAS,
// só as respostas do assistente, e para quando o corte chega a no máximo 30% do histórico. As últimas
// mensagens ficam inteiras, e as perguntas da pessoa nunca são mexidas.
export const CORTE_MAXIMO = 0.30;
export const MENSAGENS_RECENTES_INTEIRAS = 6;
export const TAMANHO_ABREVIADO = 500;
export const MARCA = "\n[…resposta anterior abreviada]";

type Msg = { role: string; content: string };

// `mensagens` em ordem cronológica (a mais antiga primeiro).
export function abreviarHistorico<T extends Msg>(mensagens: T[]): T[] {
  const total = mensagens.reduce((s, m) => s + m.content.length, 0);
  const orcamento = Math.floor(total * CORTE_MAXIMO);
  const limite = Math.max(0, mensagens.length - MENSAGENS_RECENTES_INTEIRAS);
  let cortado = 0;
  return mensagens.map((m, i) => {
    if (i >= limite || m.role !== "assistant" || m.content.length <= TAMANHO_ABREVIADO + MARCA.length + 100) return m;
    // corta no fim de uma palavra, sem passar do que ainda cabe no orçamento de 30%
    const maxTirar = Math.min(m.content.length - TAMANHO_ABREVIADO, orcamento - cortado);
    if (maxTirar < 200) return m;
    let fim = m.content.length - maxTirar;
    const espaco = m.content.indexOf(" ", fim);
    if (espaco > 0 && espaco - fim < 40) fim = espaco;
    const novo = m.content.slice(0, fim).trimEnd() + MARCA;
    cortado += m.content.length - novo.length;
    return { ...m, content: novo };
  });
}
