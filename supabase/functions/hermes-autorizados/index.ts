// Trustio · números autorizados a falar com o Agentio (Supabase Edge Function).
// O sincronizador no Mac (mac/hermes-autorizados.sh) consulta esta lista a cada 30 s e monta o
// WHATSAPP_ALLOWED_USERS do Hermes: quem está com o teste de 3 dias ativo e dentro do prazo, e
// os assinantes (com o telefone do cadastro, se nunca pediram o teste). Quando o teste vence, o
// número sai da lista sozinho.
//
// Segredo (Dashboard → Edge Functions → Secrets):
//   HERMES_SEGREDO  obrigatório  o mesmo valor guardado no Mac em ~/.trustio-hermes-sync-key
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("HERMES_SEGREDO") ?? "";
const PAGINA = 1000;

function responder(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// Comparação em tempo constante: o tempo da resposta não revela quantos caracteres batem.
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

// Formato do Hermes: DDI + DDD + número, só dígitos. Número brasileiro sem DDI ganha o 55.
function normalizar(n: string | null) {
  const d = (n ?? "").replace(/\D/g, "");
  const com = d.length === 10 || d.length === 11 ? "55" + d : d;
  return com.length >= 12 && com.length <= 15 ? com : null;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return responder(405, { error: "method_not_allowed" });
  if (!SEGREDO || !iguais(req.headers.get("x-trustio-segredo") ?? "", SEGREDO)) return responder(401, { error: "unauthorized" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const agora = new Date().toISOString();

  // Lê todas as páginas por chave (id > último lido), não por posição: um cadastro que entra ou
  // sai no meio da leitura não desloca as páginas seguintes nem esconde outro número.
  type Linha = { id: string; whatsapp_numero: string | null; telefone: string | null };
  async function todas(filtro: (q: any) => any): Promise<Linha[] | null> {
    const linhas: Linha[] = [];
    let ultimo: string | null = null;
    while (true) {
      let q = filtro(admin.from("crm_leads").select("id,whatsapp_numero,telefone"));
      if (ultimo) q = q.gt("id", ultimo);
      const { data, error } = await q.order("id").limit(PAGINA);
      if (error) return null;
      linhas.push(...(data ?? []));
      if (!data || data.length < PAGINA) return linhas;
      ultimo = data[data.length - 1].id;
    }
  }
  const [teste, assinantes] = await Promise.all([
    todas((q) => q.eq("whatsapp_trial_status", "ativo").gt("whatsapp_trial_ends_at", agora)),
    todas((q) => q.eq("status", "assinante")),
  ]);
  // Falha de leitura não pode virar "lista vazia": o Mac mantém a lista que já tem.
  if (!teste || !assinantes) return responder(500, { error: "leitura" });

  // Teste: o número do WhatsApp (a ativação o preenche). Assinante: o do WhatsApp ou, se nunca
  // pediu o teste, o telefone do cadastro.
  const numeros = [...new Set([
    ...teste.map((l) => normalizar(l.whatsapp_numero)),
    ...assinantes.map((l) => normalizar(l.whatsapp_numero) ?? normalizar(l.telefone)),
  ].filter((n): n is string => !!n))].sort();
  return responder(200, { numeros, gerado_em: agora });
});
