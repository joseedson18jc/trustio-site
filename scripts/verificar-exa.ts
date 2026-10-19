// Verifica a busca na web do chat contra a Exa de verdade, com o mesmo código da função chat
// (supabase/functions/chat/busca.ts). Roda no fim do deploy, com o segredo EXA_API_KEY do GitHub;
// a chave nunca é impressa. Uma busca por deploy (custa centavos).
import { buscarNaWeb } from "../supabase/functions/chat/busca.ts";

const chave = (Deno.env.get("EXA_API_KEY") ?? "").trim();
if (!chave) {
  console.log("EXA_API_KEY não definida; a busca na web está desligada. Nada a verificar.");
  Deno.exit(0);
}
try {
  const resultados = await buscarNaWeb("cotação do dólar hoje", true, chave);
  console.log(`Exa respondeu com ${resultados.length} resultado(s).`);
  for (const r of resultados.slice(0, 3)) {
    console.log(`- ${r.titulo} (${new URL(r.url).hostname}, ${r.data ?? "sem data"}, ${r.texto.length} caracteres de texto)`);
  }
  if (!resultados.length) {
    console.error("A Exa aceitou o pedido mas não devolveu resultados.");
    Deno.exit(1);
  }
} catch (err) {
  const e = err as { status?: number; detalhe?: string; message?: string };
  console.error(`A busca na Exa falhou: ${e.status ?? ""} ${e.detalhe ?? e.message ?? ""}`);
  Deno.exit(1);
}
