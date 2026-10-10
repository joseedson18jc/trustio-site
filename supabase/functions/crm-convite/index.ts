// Chamado somente pelo botão do admin; destinatário e prazo vêm do banco, nunca do cliente.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_BASE = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "Trustio <no-reply@send.trustio.com.br>";
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "https://trustio.com.br",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
type Convite = { id: string; email: string; nome: string | null; fim: string; enviado_em: string | null; concedeu: boolean };
const responder = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function mensagem(c: Convite) {
  const nome = (c.nome ?? "").trim().split(/\s+/)[0] || "olá";
  const fim = new Date(c.fim).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  const titulo = c.concedeu ? "Mais 3 dias grátis para você experimentar a Trustio" : "Seu convite para voltar à Trustio continua disponível";
  const convite = `Seu acesso gratuito ao chat, sem cota de perguntas, está liberado até ${fim} (horário de Brasília). Entre com sua conta e experimente mais. Não há cobrança por esta cortesia.`;
  const afiliados = "Você também pode ganhar comissões indicando a Trustio: conheça o programa de afiliados, os valores e as regras. As comissões dependem de indicações que gerem vendas elegíveis.";
  return { from: FROM, to: [c.email], reply_to: "contato@trustio.com.br", subject: titulo,
    text: `${nome},\n\n${titulo}\n\n${convite}\n\nVoltar ao chat: https://trustio.com.br/app/\n\n${afiliados}\nhttps://trustio.com.br/afiliados.html\n\nEquipe Trustio`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;color:#202532"><main style="max-width:560px;margin:24px auto;padding:32px;background:white;border-radius:16px"><p style="font-size:24px;font-weight:bold">Trustio</p><h1 style="font-size:26px">${esc(titulo)}</h1><p>${esc(nome)},</p><p>${esc(convite)}</p><p style="margin:28px 0"><a href="https://trustio.com.br/app/" style="padding:14px 22px;background:#3e47d8;color:white;border-radius:8px;text-decoration:none">Voltar ao chat</a></p><h2 style="font-size:21px">Ganhe com suas indicações</h2><p>${esc(afiliados)}</p><p><a href="https://trustio.com.br/afiliados.html">Ver o programa de afiliados e as comissões</a></p><p>Se precisar de ajuda, responda a este e-mail.<br>Equipe Trustio</p></main></body></html>` };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return responder(405, { error: "Método inválido" });
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return responder(401, { error: "Entre no CRM novamente" });
  const client = createClient(URL_BASE, ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth.user) return responder(401, { error: "Entre no CRM novamente" });
  const { data: isAdmin, error: roleError } = await client.rpc("is_admin");
  if (roleError || !isAdmin) return responder(403, { error: "Somente administrador" });
  if (!RESEND_KEY) return responder(503, { error: "Envio de e-mail não configurado; nenhum prazo foi alterado" });
  let body;
  try { body = await req.json(); } catch { return responder(400, { error: "Pedido inválido" }); }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body || !uuid.test(body.lead_id) || !uuid.test(body.pedido) || typeof body.conceder !== "boolean") return responder(400, { error: "Pedido inválido" });
  const { data, error } = await client.rpc("crm_preparar_convite", { p_lead_id: body.lead_id, p_pedido: body.pedido, p_conceder: body.conceder });
  if (error) return responder(400, { error: error.message });
  const c = data as Convite;
  if (c.enviado_em) return responder(200, { enviado: true, fim: c.fim });
  const admin = createClient(URL_BASE, SERVICE_KEY, { auth: { persistSession: false } });
  let provider: string | null = null;
  let failure: string | null = null;
  try {
    const res = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `crm-convite/${c.id}` }, body: JSON.stringify(mensagem(c)) });
    const result = await res.json();
    if (!res.ok || !result.id) throw new Error(`Provedor de e-mail recusou o envio (${res.status})`);
    provider = result.id;
  } catch { failure = "Envio não confirmado. Tente novamente para verificar ou concluir o mesmo envio."; }
  const { error: saveError } = await admin.rpc("crm_concluir_convite", { p_pedido: c.id, p_provider_id: provider, p_erro: failure });
  if (saveError) return responder(200, { enviado: !!provider, fim: c.fim, error: "Não foi possível registrar o resultado. Tente novamente com o mesmo pedido." });
  return responder(200, { enviado: !!provider, fim: c.fim, error: failure });
});
