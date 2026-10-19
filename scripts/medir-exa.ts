// Mede a latência da Exa com variações do pedido da busca do chat (supabase/functions/chat/busca.ts),
// para escolher a mais rápida que ainda traz conteúdo bom. Roda só à mão (workflow medir-exa.yml),
// com o segredo EXA_API_KEY; a chave nunca é impressa. Cada execução faz ~12 buscas (centavos).
const chave = (Deno.env.get("EXA_API_KEY") ?? "").trim();
if (!chave) { console.log("EXA_API_KEY não definida."); Deno.exit(0); }

type Variante = { nome: string; corpo: Record<string, unknown> };
const base = { numResults: 5, userLocation: "BR" };
const variantes: Variante[] = [
  { nome: "fast + texto 900 + maxAgeHours 1 + livecrawl 2500", corpo: { ...base, numResults: 4, type: "fast", contents: { text: { maxCharacters: 900 }, maxAgeHours: 1, livecrawlTimeout: 2500 } } },
  { nome: "instant + texto 900", corpo: { ...base, numResults: 4, type: "instant", contents: { text: { maxCharacters: 900 } } } },
  { nome: "instant + highlights maxCharacters 600", corpo: { ...base, numResults: 4, type: "instant", contents: { highlights: { maxCharacters: 600 } } } },
  { nome: "instant + highlights numSentences 3 x2", corpo: { ...base, numResults: 4, type: "instant", contents: { highlights: { numSentences: 3, highlightsPerUrl: 2 } } } },
  { nome: "fast + highlights maxCharacters 600 + maxAgeHours 1 + livecrawl 2500", corpo: { ...base, numResults: 4, type: "fast", contents: { highlights: { maxCharacters: 600 }, maxAgeHours: 1, livecrawlTimeout: 2500 } } },
];
const consultas = ["cotação do dólar hoje", "resultado último jogo do Flamengo"];

for (const v of variantes) {
  for (const q of consultas) {
    const t0 = performance.now();
    try {
      const r = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q, ...v.corpo }),
        signal: AbortSignal.timeout(30_000),
      });
      const ms = Math.round(performance.now() - t0);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.log(`${v.nome} | "${q}" | HTTP ${r.status} ${ms} ms | ${String(j?.error ?? "").slice(0, 160)}`); continue; }
      const rs = Array.isArray(j.results) ? j.results : [];
      const chars = rs.reduce((s: number, x: { text?: string; highlights?: string[] }) =>
        s + (x.text?.length ?? 0) + (x.highlights ?? []).join(" ").length, 0);
      const hosts = rs.slice(0, 3).map((x: { url: string }) => new URL(x.url).hostname).join(", ");
      const avisos = (j.warnings ?? []).map((w: { code: string; path: string }) => `${w.code} ${w.path}`).join("; ");
      console.log(`${v.nome} | "${q}" | ${ms} ms (Exa ${j.searchTime ?? "?"} ms) | ${rs.length} res, ${chars} chars | US$ ${j.costDollars?.total ?? "?"} | ${hosts}${avisos ? " | avisos: " + avisos : ""}`);
      const p0 = rs[0] ?? {};
      const amostra = (p0.highlights?.length ? p0.highlights.join(" … ") : (p0.text ?? "")).replace(/\s+/g, " ").slice(0, 260);
      console.log(`    amostra [1] ${amostra}`);
    } catch (err) {
      console.log(`${v.nome} | "${q}" | falhou em ${Math.round(performance.now() - t0)} ms: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
