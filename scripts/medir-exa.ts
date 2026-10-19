// Mede a latência da Exa com variações do pedido da busca do chat (supabase/functions/chat/busca.ts),
// para escolher a mais rápida que ainda traz conteúdo bom. Roda só à mão (workflow medir-exa.yml),
// com o segredo EXA_API_KEY; a chave nunca é impressa. Cada execução faz ~12 buscas (centavos).
const chave = (Deno.env.get("EXA_API_KEY") ?? "").trim();
if (!chave) { console.log("EXA_API_KEY não definida."); Deno.exit(0); }

type Variante = { nome: string; corpo: Record<string, unknown> };
const base = { numResults: 5, userLocation: "BR" };
const variantes: Variante[] = [
  { nome: "atual: fast + texto 1500 + maxAgeHours 1", corpo: { ...base, type: "fast", contents: { text: { maxCharacters: 1500 }, maxAgeHours: 1, livecrawlTimeout: 5000 } } },
  { nome: "fast + texto 1500 (cache)", corpo: { ...base, type: "fast", contents: { text: { maxCharacters: 1500 } } } },
  { nome: "instant + texto 1500 (cache)", corpo: { ...base, type: "instant", contents: { text: { maxCharacters: 1500 } } } },
  { nome: "instant + highlights (cache)", corpo: { ...base, type: "instant", contents: { highlights: true } } },
  { nome: "fast + highlights + maxAgeHours 24", corpo: { ...base, type: "fast", contents: { highlights: true, maxAgeHours: 24, livecrawlTimeout: 3000 } } },
  { nome: "instant + texto 800 (cache)", corpo: { ...base, type: "instant", contents: { text: { maxCharacters: 800 } } } },
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
    } catch (err) {
      console.log(`${v.nome} | "${q}" | falhou em ${Math.round(performance.now() - t0)} ms: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
