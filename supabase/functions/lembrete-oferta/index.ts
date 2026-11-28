import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
// Lembrete de oferta para quem criou conta e ainda não tem plano. Envio pontual: as linhas vêm da
// fila crm_lembretes e o disparo é autorizado por um token de uso único (o banco guarda só o hash).
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM = Deno.env.get("EMAIL_FROM") ?? "Trustio <no-reply@send.trustio.com.br>";
const RESPOSTA = "contato@trustio.com.br";
const PLANOS = "https://trustio.com.br/planos.html#pessoal";
const FUNCAO = "https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/lembrete-oferta";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = { "Access-Control-Allow-Origin": "https://trustio.com.br", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin" };
type Lembrete = { id: string; email: string; nome: string | null; teste_fim: string | null; sair_token?: string | null };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export function mensagem(l: Lembrete, agora = new Date()) {
  const primeiro = (l.nome ?? "").trim().split(/\s+/)[0] ?? "";
  const nome = /^\p{L}[\p{L}'-]{1,29}$/u.test(primeiro) ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1) : "";
  const saudacao = nome ? `Olá, ${nome}.` : "Olá.";
  const fim = l.teste_fim ? new Date(l.teste_fim) : null;
  const situacao = !fim ? "Você criou sua conta na Trustio, mas ainda não fez a primeira pergunta. O teste grátis de 3 dias só começa a contar quando você enviar a primeira."
    : fim > agora ? `Seu teste grátis da Trustio termina em ${fim.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" })} (horário de Brasília).`
    : "Seu teste grátis da Trustio terminou.";
  const chamada = "Para continuar com uma IA privada e sem censura, escolha um plano:";
  const planos = ["Passe 7 dias: R$ 24,90, pagamento único, não renova sozinho", "Mensal: R$ 79 por mês", "Anual: R$ 790 por ano (equivale a R$ 65,83 por mês)"];
  const acesso = "O acesso é liberado assim que o pagamento é confirmado. Use no pagamento o mesmo e-mail da sua conta.";
  const aviso = "Quem envia as perguntas responde pelo conteúdo delas e pelo uso que faz das respostas, nos termos da lei.";
  // Com token, o descadastro é por link (página de confirmação) e pelo botão do programa de e-mail.
  const token = l.sair_token && UUID.test(l.sair_token) ? l.sair_token : "";
  const linkSair = token ? `https://trustio.com.br/descadastro.html?t=${token}` : "";
  const sair = token ? "Dúvidas? Responda este e-mail." : 'Dúvidas? Responda este e-mail. Se não quiser mais receber e-mails da Trustio, responda com "sair".';
  const p = 'style="margin:0 0 16px;font-size:16px;line-height:1.55"';
  return { from: FROM, to: [l.email], reply_to: RESPOSTA, subject: "Seu acesso à Trustio: continue por R$ 24,90",
    headers: token ? { "List-Unsubscribe": `<${FUNCAO}?sair=${token}>, <mailto:${RESPOSTA}?subject=sair>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : { "List-Unsubscribe": `<mailto:${RESPOSTA}?subject=sair>` },
    text: `${saudacao}\n\n${situacao}\n\n${chamada}\n\n${planos.map(x => "- " + x).join("\n")}\n\n${acesso}\n\nVer planos: ${PLANOS}\n\n${aviso}\n\n${sair}${token ? `\n\nPara não receber mais e-mails de oferta da Trustio: ${linkSair}` : ""}\n\nEquipe Trustio`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#202532"><div style="max-width:560px;margin:24px auto;padding:32px;background:#ffffff;border-radius:16px">`
      + `<p ${p}>${esc(saudacao)}</p><p ${p}>${esc(situacao)}</p><p ${p}>${esc(chamada)}</p>`
      + `<ul style="margin:0 0 16px;padding-left:20px;font-size:16px;line-height:1.7">${planos.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`
      + `<p ${p}>${esc(acesso)}</p>`
      + `<p style="margin:24px 0"><a href="${PLANOS}" style="display:inline-block;padding:13px 22px;border-radius:10px;background:#2563eb;color:#ffffff;font-weight:bold;font-size:16px;text-decoration:none">Ver planos</a></p>`
      + `<p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#5b6474">${esc(aviso)}</p>`
      + `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#5b6474">${esc(sair)}${token ? ` <a href="${linkSair}" style="color:#5b6474">Parar de receber e-mails de oferta</a>` : ""}</p>`
      + `<p style="margin:0;font-size:14px;color:#202532">Equipe Trustio</p></div></body></html>` };
}

async function sha256(v: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const token = req.headers.get("x-trustio-disparo") ?? "";
  // Sem o cabeçalho de disparo, o pedido é um descadastro: um clique no programa de e-mail
  // (token na URL) ou a confirmação na página descadastro.html (token no corpo).
  if (!token) {
    let sair = new URL(req.url).searchParams.get("sair");
    if (!sair) { try { sair = (await req.json())?.sair ?? null; } catch { sair = null; } }
    if (typeof sair !== "string" || !UUID.test(sair)) return new Response(null, { status: 404, headers: CORS });
    const banco = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: achou, error: falha } = await banco.rpc("crm_lembrete_sair", { p_token: sair });
    if (falha) return new Response(null, { status: 503, headers: CORS });
    return achou ? Response.json({ ok: true }, { headers: CORS }) : new Response(null, { status: 404, headers: CORS });
  }
  if (token.length < 32) return new Response(null, { status: 401 });
  if (!RESEND_KEY) return new Response(null, { status: 503 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await db.rpc("crm_lembrete_reservar", { p_token_hash: await sha256(token) });
  if (error) return new Response(null, { status: 503 });
  const fila = (data ?? []) as Lembrete[];
  if (!fila.length) return new Response(null, { status: 401 });
  // A resposta sai na hora; o envio segue em segundo plano, um por vez, no ritmo do provedor.
  const enviar = (async () => {
    for (const l of fila) {
      let provider: string | null = null, erro: string | null = null;
      try {
        const r = await fetch("https://api.resend.com/emails", { method: "POST", signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `lembrete-oferta/${l.id}` }, body: JSON.stringify(mensagem(l)) });
        const body = await r.json();
        if (r.ok && typeof body.id === "string") provider = body.id; else erro = `Provedor recusou o envio (${r.status})`;
      } catch { erro = "Envio não confirmado"; }
      await db.from("crm_lembretes").update(provider ? { enviado_em: new Date().toISOString(), provider_id: provider, erro: null } : { erro, reservado_em: null }).eq("id", l.id);
      await new Promise(resolve => setTimeout(resolve, 600));
    }
  })();
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(enviar); else await enviar;
  return Response.json({ aceitos: fila.length }, { status: 202 });
});
