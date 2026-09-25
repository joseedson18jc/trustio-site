// Trustio · números autorizados a falar com o Agentio (Supabase Edge Function).
// O sincronizador no Mac (mac/hermes-autorizados.sh) consulta esta lista a cada 30 s e monta o
// WHATSAPP_ALLOWED_USERS do Hermes: quem está com o teste de 3 dias ativo e dentro do prazo, e
// os assinantes. Quando o teste vence, o número sai da lista sozinho.
//
// Segredo (Dashboard → Edge Functions → Secrets):
//   HERMES_SEGREDO  obrigatório  o mesmo valor guardado no Mac em ~/.trustio-hermes-sync-key
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("HERMES_SEGREDO") ?? "";

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
  const [teste, assinantes] = await Promise.all([
    admin.from("crm_leads").select("whatsapp_numero").eq("whatsapp_trial_status", "ativo").gt("whatsapp_trial_ends_at", agora),
    admin.from("crm_leads").select("whatsapp_numero").eq("status", "assinante"),
  ]);
  // Falha de leitura não pode virar "lista vazia": o Mac mantém a lista que já tem.
  if (teste.error || assinantes.error) return responder(500, { error: "leitura" });

  const numeros = [...new Set([...(teste.data ?? []), ...(assinantes.data ?? [])]
    .map((l) => normalizar(l.whatsapp_numero)).filter((n): n is string => !!n))].sort();
  return responder(200, { numeros, gerado_em: agora });
});
