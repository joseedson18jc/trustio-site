// Trustio · aviso do teste do Agentio (Supabase Edge Function, projeto mjdaluioyutnxlyomzyd).
// O banco chama esta função quando o teste do WhatsApp de um lead vira "ativo" no CRM
// (gatilho crm_leads_whatsapp_aviso). Ela manda à pessoa um e-mail com as instruções e uma
// mensagem no WhatsApp, e grava no lead quando cada um saiu (ou o erro).
//
// Segredos (Dashboard → Edge Functions → Secrets):
//   AVISOS_SEGREDO      obrigatório  o mesmo valor guardado no Vault como aviso_agente_segredo
//   RESEND_API_KEY      para o e-mail
//   EMAIL_FROM          opcional     padrão "Trustio <no-reply@send.trustio.com.br>"
//   EVOLUTION_URL       para o WhatsApp (ex.: https://evolution.trustio.com.br)
//   EVOLUTION_INSTANCE  nome da instância conectada ao número que envia
//   EVOLUTION_API_KEY   chave da Evolution API
//   EVOLUTION_NUMERO    opcional     número conectado à instância, se for o próprio Agentio
// O número do Agentio que aparece nas instruções vem do painel (app_settings.hermes_numero).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SEGREDO = Deno.env.get("AVISOS_SEGREDO") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") ?? "Trustio <no-reply@send.trustio.com.br>";
const EVOLUTION_URL = (Deno.env.get("EVOLUTION_URL") ?? "").replace(/\/$/, "");
const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_INSTANCE") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";
// Número de onde a Evolution envia (opcional): se for o próprio Agentio, a mensagem pede para
// responder ali mesmo em vez de salvar outro número.
const EVOLUTION_NUMERO_PROPRIO = Deno.env.get("EVOLUTION_NUMERO") ?? "";
const SITE = "https://trustio.com.br";

type Lead = {
  id: string; nome: string | null; email: string | null; whatsapp_numero: string | null;
  whatsapp_trial_status: string; whatsapp_trial_started_at: string | null; whatsapp_trial_ends_at: string | null;
  whatsapp_aviso_email_em: string | null; whatsapp_aviso_wa_em: string | null;
};

function responder(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}

// Comparação em tempo constante: o tempo da resposta não revela quantos caracteres batem.
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function primeiroNome(nome: string | null) {
  return (nome ?? "").trim().split(/\s+/)[0] ?? "";
}

// Só dígitos. Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55.
function digitos(n: string | null) {
  const d = (n ?? "").replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? "55" + d : d;
}

function telefoneLegivel(d: string) {
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : "+" + d;
}

function dataLegivel(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso)).replace(",", " às");
}

// Telefone sem quebra de linha no meio.
const tel = (d: string) => `<span style="white-space:nowrap;">${escapar(telefoneLegivel(d))}</span>`;

function corpoDoEmail(nome: string, fim: string, agente: string | null, numeroCliente: string) {
  const ola = nome ? `Olá, ${escapar(nome)}!` : "Olá!";
  const passo1 = agente
    ? `Salve o número do Agentio, <strong style="color:#f4f6fa;">${tel(agente)}</strong>, e mande um “Oi” pelo WhatsApp que você cadastrou (${tel(numeroCliente)}).`
    : `Responda à mensagem que a Trustio enviou para o seu WhatsApp (${tel(numeroCliente)}).`;
  const botao = agente
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 26px;"><tr><td style="border-radius:14px;background:#2563eb;">
          <a href="https://wa.me/${agente}?text=${encodeURIComponent("Oi, Agentio!")}" style="display:inline-block;padding:16px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">Abrir conversa no WhatsApp</a>
        </td></tr></table>`
    : "";
  const passo = (n: number, texto: string) =>
    `<tr><td valign="top" style="padding:0 12px 14px 0;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:13px;color:#5ea7ff;">${n}</td>
     <td style="padding:0 0 14px;font-size:15px;line-height:1.6;color:#bdc5d1;">${texto}</td></tr>`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark">
<title>Seu Agentio está ativo · Trustio</title></head>
<body style="margin:0;padding:0;background:#05070b;font-family:'Geist','Inter','Segoe UI',system-ui,-apple-system,sans-serif;color:#f4f6fa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Seus 3 dias com o agente de IA da Trustio no WhatsApp começaram.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070b;padding:32px 16px;"><tr><td align="center">
  <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
    <tr><td style="padding:0 8px 22px;"><span style="font-size:22px;font-weight:800;letter-spacing:-0.04em;color:#f4f6fa;">Trust<span style="color:#5ea7ff;">io</span></span></td></tr>
    <tr><td style="background:#0b0e14;border:1px solid rgba(160,179,211,0.16);border-radius:20px;padding:36px 32px;">
      <p style="margin:0 0 14px;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#8d98aa;">Teste grátis · 3 dias</p>
      <h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;letter-spacing:-0.03em;font-weight:800;color:#ffffff;">Seu Agentio está ativo no WhatsApp.</h1>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#bdc5d1;">${ola} Você recebeu acesso ao Agentio, o agente de IA da Trustio. Ele trabalha direto no seu WhatsApp${fim ? `, até <strong style="color:#f4f6fa;">${escapar(fim)}</strong> (horário de Brasília)` : ""}.</p>
      ${botao}
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.04em;color:#f4f6fa;">Como começar</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
        ${passo(1, passo1)}
        ${passo(2, "Peça do jeito que você falaria com um assistente: “me lembre de pagar o boleto sexta às 9h”, “resuma este áudio”, “pesquise voos para Recife em novembro”.")}
        ${passo(3, "Mande textos, áudios, fotos e documentos. Antes de qualquer ação que não dá para desfazer, o Agentio pede a sua confirmação.")}
      </table>
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;letter-spacing:0.04em;color:#f4f6fa;">O que ele faz</p>
      <p style="margin:0 0 22px;font-size:14.5px;line-height:1.6;color:#bdc5d1;">Executa tarefas, organiza rotinas e lembretes, pesquisa, escreve e resume. Ele atende só no número cadastrado; não há acesso por computador ou navegador.</p>
      <hr style="border:0;border-top:1px solid rgba(160,179,211,0.16);margin:26px 0;">
      <p style="margin:0;font-size:13.5px;line-height:1.6;color:#99a4b5;">Quando os 3 dias terminarem, é só escolher um plano em <a href="${SITE}/planos.html" style="color:#5ea7ff;">trustio.com.br/planos</a> para continuar com o Agentio. Nada é cobrado sem você escolher.</p>
      <p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:#8d98aa;">Não pediu este teste? Responda este e-mail e nós desativamos.</p>
    </td></tr>
    <tr><td style="padding:22px 8px 0;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:0.08em;color:#6f7c92;">
      Trustio · construída e hospedada no Brasil · <a href="${SITE}/" style="color:#8d98aa;">trustio.com.br</a> · <a href="${SITE}/privacidade.html" style="color:#8d98aa;">Privacidade</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function textoDoEmail(nome: string, fim: string, agente: string | null, numeroCliente: string) {
  return [
    nome ? `Olá, ${nome}!` : "Olá!",
    "",
    `Você recebeu acesso ao Agentio, o agente de IA da Trustio, direto no seu WhatsApp${fim ? `, até ${fim} (horário de Brasília)` : ""}.`,
    "",
    "Como começar:",
    agente
      ? `1. Salve o número do Agentio, ${telefoneLegivel(agente)}, e mande um "Oi" pelo WhatsApp que você cadastrou (${telefoneLegivel(numeroCliente)}): https://wa.me/${agente}`
      : `1. Responda à mensagem que a Trustio enviou para o seu WhatsApp (${telefoneLegivel(numeroCliente)}).`,
    "2. Peça do jeito que você falaria com um assistente: lembretes, resumos, pesquisas, textos.",
    "3. Mande textos, áudios, fotos e documentos. Antes de qualquer ação que não dá para desfazer, ele pede a sua confirmação.",
    "",
    `Quando os 3 dias terminarem, escolha um plano em ${SITE}/planos.html para continuar. Nada é cobrado sem você escolher.`,
    "",
    `Trustio · ${SITE}`,
  ].join("\n");
}

function textoDoWhatsapp(nome: string, fim: string, agente: string | null) {
  return [
    `${nome ? `Olá, ${nome}!` : "Olá!"} Aqui é a Trustio. 👋`,
    "",
    `Seu teste grátis do *Agentio*, o agente de IA da Trustio, está ativo${fim ? ` até *${fim}*` : " por 3 dias"}.`,
    "",
    agente && agente !== digitos(EVOLUTION_NUMERO_PROPRIO)
      ? `Para começar, salve o número do Agentio (${telefoneLegivel(agente)}) e mande um "Oi": https://wa.me/${agente}`
      : "Para começar, é só responder esta mensagem com o que você precisa.",
    "",
    "Ele organiza lembretes e rotinas, pesquisa, escreve e resume. Pode mandar texto, áudio, foto ou documento. Antes de qualquer ação que não dá para desfazer, ele pede a sua confirmação.",
    "",
    "As instruções completas também foram para o seu e-mail.",
  ].join("\n");
}

async function enviarEmail(para: string, nome: string, fim: string, agente: string | null, numeroCliente: string) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [para],
      // O remetente é no-reply: respostas ("não pedi este teste") vão para o contato da Trustio.
      reply_to: "contato@trustio.com.br",
      subject: "Seu Agentio está ativo no WhatsApp · 3 dias grátis",
      html: corpoDoEmail(nome, fim, agente, numeroCliente),
      text: textoDoEmail(nome, fim, agente, numeroCliente),
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function enviarWhatsapp(numero: string, texto: string) {
  const r = await fetch(`${EVOLUTION_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`, {
    method: "POST",
    headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
    // "text" é o formato da Evolution v2; "textMessage", o da v1. Cada versão ignora o outro.
    body: JSON.stringify({ number: numero, text: texto, textMessage: { text: texto } }),
  });
  if (!r.ok) throw new Error(`evolution ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return responder(405, { error: "method_not_allowed" });
  if (!SEGREDO || !iguais(req.headers.get("x-trustio-segredo") ?? "", SEGREDO)) return responder(401, { error: "unauthorized" });

  let leadId = "";
  try { leadId = String((await req.json())?.lead_id ?? ""); } catch { /* corpo inválido */ }
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return responder(400, { error: "lead_id" });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: lead, error } = await admin.from("crm_leads")
    .select("id,nome,email,whatsapp_numero,whatsapp_trial_status,whatsapp_trial_started_at,whatsapp_trial_ends_at,whatsapp_aviso_email_em,whatsapp_aviso_wa_em")
    .eq("id", leadId).maybeSingle<Lead>();
  if (error) return responder(500, { error: "lead" });
  if (!lead || lead.whatsapp_trial_status !== "ativo") return responder(200, { ok: true, ignorado: "nao_ativo" });

  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", "hermes_numero").maybeSingle();
  const agenteBruto = digitos(typeof cfg?.value === "string" ? cfg.value : "");
  // O número do painel só entra nas instruções se estiver completo (DDI + DDD + número).
  const agente = agenteBruto.length >= 12 && agenteBruto.length <= 15 ? agenteBruto : null;

  const nome = primeiroNome(lead.nome);
  const fim = dataLegivel(lead.whatsapp_trial_ends_at);
  const numeroCliente = digitos(lead.whatsapp_numero);
  const inicio = lead.whatsapp_trial_started_at ? Date.parse(lead.whatsapp_trial_started_at) : 0;
  // Um aviso por ativação: já saiu depois do início deste período, não sai de novo.
  const jaFoi = (em: string | null) => !!em && Date.parse(em) >= inicio;

  const erros: string[] = [];
  const marcar: Record<string, string> = {};

  if (!jaFoi(lead.whatsapp_aviso_email_em)) {
    if (!RESEND_API_KEY) erros.push("e-mail: RESEND_API_KEY ausente");
    else if (!lead.email) erros.push("e-mail: lead sem e-mail");
    else {
      try { await enviarEmail(lead.email, nome, fim, agente, numeroCliente); marcar.whatsapp_aviso_email_em = new Date().toISOString(); }
      catch (e) { erros.push("e-mail: " + (e as Error).message); }
    }
  }

  if (!jaFoi(lead.whatsapp_aviso_wa_em)) {
    if (!EVOLUTION_URL || !EVOLUTION_INSTANCE || !EVOLUTION_API_KEY) erros.push("WhatsApp: Evolution API não configurada");
    else if (numeroCliente.length < 12) erros.push("WhatsApp: lead sem número válido");
    else {
      try { await enviarWhatsapp(numeroCliente, textoDoWhatsapp(nome, fim, agente)); marcar.whatsapp_aviso_wa_em = new Date().toISOString(); }
      catch (e) { erros.push("WhatsApp: " + (e as Error).message); }
    }
  }

  const { error: gravar } = await admin.from("crm_leads")
    .update({ ...marcar, whatsapp_aviso_erro: erros.length ? erros.join(" · ").slice(0, 500) : null })
    .eq("id", lead.id);
  if (gravar) console.error("aviso_gravar", gravar.message);
  if (erros.length) console.error("aviso_erros", lead.id, erros.join(" · "));
  return responder(200, { ok: erros.length === 0, enviados: Object.keys(marcar), erros });
});
