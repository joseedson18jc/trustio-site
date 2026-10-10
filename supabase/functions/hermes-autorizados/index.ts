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
  type Linha = { id: string; whatsapp_numero: string | null; telefone: string | null; acesso_modo: string; acesso_inicio: string | null; acesso_fim: string | null; status: string; whatsapp_trial_status: string; whatsapp_trial_ends_at: string | null };
  async function todas(filtro: (q: any) => any): Promise<Linha[] | null> {
    const linhas: Linha[] = [];
    let ultimo: string | null = null;
    while (true) {
      let q = filtro(admin.from("crm_leads").select("id,whatsapp_numero,telefone,acesso_modo,acesso_inicio,acesso_fim,status,whatsapp_trial_status,whatsapp_trial_ends_at"));
      if (ultimo) q = q.gt("id", ultimo);
      const { data, error } = await q.order("id").limit(PAGINA);
      if (error) return null;
      linhas.push(...(data ?? []));
      if (!data || data.length < PAGINA) return linhas;
      ultimo = data[data.length - 1].id;
    }
  }
  const contas = await todas((q) => q);
  // Falha de leitura não pode virar lista vazia: o Mac mantém a última lista aplicada.
  if (!contas) return responder(500, { error: "leitura" });

  function permitido(l: Linha) {
    return !["revogado", "bloqueado", "bloqueado_login"].includes(l.acesso_modo) &&
      (l.status !== "cancelado" || l.acesso_modo === "liberado") &&
      (!l.acesso_inicio || Date.parse(l.acesso_inicio) <= Date.parse(agora)) && (!l.acesso_fim || Date.parse(l.acesso_fim) > Date.parse(agora));
  }
  // Uma restrição prevalece também sobre um número fixo ou compartilhado com outra conta.
  const negados = [...new Set(contas.filter((l) => !permitido(l)).flatMap((l) =>
    [normalizar(l.whatsapp_numero), normalizar(l.telefone)].filter((n): n is string => !!n)))].sort();
  const numeros = [...new Set(contas.filter(permitido).filter((l) =>
    l.status === "assinante" || (l.whatsapp_trial_status === "ativo" && !!l.whatsapp_trial_ends_at && Date.parse(l.whatsapp_trial_ends_at) > Date.parse(agora)))
    .map((l) => normalizar(l.whatsapp_numero) ?? (l.status === "assinante" ? normalizar(l.telefone) : null))
    .filter((n): n is string => !!n && !negados.includes(n)))].sort();
  return responder(200, { numeros, negados, gerado_em: agora });
});
