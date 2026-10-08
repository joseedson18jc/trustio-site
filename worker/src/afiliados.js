/**
 * Programa de afiliados (afiliados.html e a aba Afiliados do CRM).
 *
 *   POST /afiliados          cadastro público. Grava como pendente (registrar_afiliado, chave de
 *                            serviço) e manda o e-mail "recebemos seu cadastro, análise em até
 *                            30 minutos". A resposta HTTP não traz o código.
 *   POST /afiliados/aprovar  só a equipe: o CRM manda { id } com o token de quem está logado
 *                            (Authorization: Bearer). aprovar_afiliado roda com esse token,
 *                            então is_staff() e o teto de vagas valem no banco; depois o
 *                            afiliado recebe por e-mail e WhatsApp o link https://trustio.com.br/?ref=CUPOM
 *                            e o cupom (ex.: LUISC10), criado na Stripe nessa hora.
 *   POST /stripe/webhook     checkout.session.completed → registrar_comissao (cupom vence link,
 *                            tetos no banco) → avisa o afiliado por e-mail e WhatsApp.
 */

import { assinaturaValida, criarCupomAfiliado, lerSessao, promoDaSessao } from "./stripe.js";
import { brl, enviarWhatsapp, MENSAGENS, whatsappConfigurado } from "./whatsapp.js";

const CANAIS = new Set([
  "YouTube", "Instagram / TikTok", "Newsletter", "Podcast",
  "Consultoria / B2B", "Comunidade (WhatsApp/Telegram/Discord)", "Outro",
]);
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIPOS_PIX = new Set(["cpf", "email", "telefone", "aleatoria"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** CPF com os dois dígitos verificadores certos; recebe com ou sem pontuação. */
export function cpfValido(bruto) {
  const cpf = String(bruto ?? "").replace(/\D/g, "");
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (n) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
    const dv = (soma * 10) % 11;
    return dv === 10 ? 0 : dv;
  };
  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10]);
}

const campo = (v, max) => String(v ?? "").trim().slice(0, max);

export function linkDeIndicacao(env, codigo) {
  const url = new URL("/", env.SITE_URL || "https://trustio.com.br");
  url.searchParams.set("ref", codigo);
  return url.toString();
}

function validar(dados) {
  const email = campo(dados.email, 254).toLowerCase();
  const afiliado = {
    email,
    nome: campo(dados.nome, 120),
    canal: campo(dados.canal, 80),
    audiencia: campo(dados.audiencia, 300),
    pix: campo(dados.pix, 140),
    pixTipo: campo(dados.pix_tipo, 20).toLowerCase(),
    cpf: campo(dados.cpf, 20).replace(/\D/g, ""),
    whatsapp: campo(dados.whatsapp, 30).replace(/\D/g, ""),
  };
  if (!EMAIL_VALIDO.test(email)) return { erro: "email_invalido" };
  if (!afiliado.nome) return { erro: "nome_ausente" };
  if (!CANAIS.has(afiliado.canal)) return { erro: "canal_invalido" };
  if (!/^\d{10,13}$/.test(afiliado.whatsapp)) return { erro: "whatsapp_invalido" };
  if (!cpfValido(afiliado.cpf)) return { erro: "cpf_invalido" };
  if (!TIPOS_PIX.has(afiliado.pixTipo)) return { erro: "pix_tipo_invalido" };
  if (!afiliado.pix) return { erro: "pix_ausente" };
  return { afiliado };
}

function moldura(previa, miolo) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="dark"></head>
<body style="margin:0;padding:0;background:#05070b;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070b;padding:40px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#0b0f16;border:1px solid rgba(160,179,211,.14);border-radius:16px;">
    <tr><td style="padding:34px 34px 10px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <p style="margin:0 0 22px;font-size:19px;font-weight:700;color:#f4f6fa;letter-spacing:-.02em;">Trust<span style="color:#2563eb;">io</span> <span style="color:#8b96a7;font-weight:400;">/ afiliados</span></p>
      ${miolo}
      <p style="margin:0;padding-top:20px;border-top:1px solid rgba(160,179,211,.12);font-size:12px;color:#6c7789;">
        Trustio · <a href="https://trustio.com.br/afiliados.html" style="color:#6c7789;">trustio.com.br/afiliados</a> ·
        <a href="https://trustio.com.br/privacidade.html" style="color:#6c7789;">Privacidade</a>
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const P = 'style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#bdc5d1;"';
const ROTULO = 'style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8d98aa;"';

export function emailRecebido(nome, escapar) {
  return {
    subject: "Recebemos seu cadastro de afiliado — Trustio",
    html: moldura("Seu cadastro está em análise: resposta em até 30 minutos.", `
      <p style="margin:0 0 14px;font-size:20px;font-weight:600;color:#f4f6fa;">Olá, ${escapar(nome)}!</p>
      <p ${P}>Recebemos seu cadastro no programa de parcerias da Trustio. O programa é exclusivo — são apenas 100 vagas para todo o país — e cada cadastro passa por aprovação.</p>
      <p ${P}><b style="color:#f4f6fa;">Tempo de análise: até 30 minutos.</b> A confirmação, com o seu link de afiliado, chega neste e-mail e no seu WhatsApp.</p>
      <p style="margin:0 0 30px;font-size:13px;line-height:1.6;color:#8b96a7;">Se não foi você quem se cadastrou, ignore este e-mail.</p>`),
    text: `Olá, ${nome}!\n\nRecebemos seu cadastro no programa de parcerias da Trustio. O programa é exclusivo — apenas 100 vagas para todo o país — e cada cadastro passa por aprovação.\n\nTempo de análise: até 30 minutos. A confirmação, com o seu link de afiliado, chega neste e-mail e no seu WhatsApp.\n\nTrustio · https://trustio.com.br/afiliados.html`,
  };
}

export function emailAprovado(nome, codigo, link, escapar, cupom = null) {
  return {
    subject: "Aprovado! Seu link de afiliado Trustio",
    html: moldura("Seu cadastro foi aprovado. Seu link de afiliado está aqui.", `
      <p style="margin:0 0 14px;font-size:20px;font-weight:600;color:#f4f6fa;">Parabéns, ${escapar(nome)}!</p>
      <p ${P}>Seu cadastro no programa de afiliados da Trustio foi aprovado. Cada venda pelo seu link gera comissão fixa, liberada na hora via a chave Pix que você cadastrou.</p>
      <p ${ROTULO}>Seu link</p>
      <p style="margin:0 0 22px;font-size:15px;line-height:1.6;word-break:break-all;"><a href="${escapar(link)}" style="color:#5ea7ff;">${escapar(link)}</a></p>
      <p ${ROTULO}>${cupom ? "Seu cupom (10% na 1ª cobrança de quem comprar)" : "Seu código"}</p>
      <p style="margin:0 0 26px;font-size:22px;font-weight:700;color:#53cdfe;font-family:ui-monospace,Menlo,monospace;">${escapar(cupom || codigo)}</p>
      <p style="margin:0 0 26px;"><a href="${escapar(link)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 24px;border-radius:10px;">Abrir meu link</a></p>
      <p style="margin:0 0 30px;font-size:13px;line-height:1.6;color:#8b96a7;">Guarde este e-mail.</p>`),
    text: `Parabéns, ${nome}!\n\nSeu cadastro no programa de afiliados da Trustio foi aprovado.\n\nSeu link: ${link}\n${cupom ? `Seu cupom: ${cupom} (10% na 1ª cobrança de quem comprar)` : `Seu código: ${codigo}`}\n\nCada venda pelo link gera comissão fixa, liberada na hora via a chave Pix cadastrada.\n\nTrustio · https://trustio.com.br/afiliados.html`,
  };
}

async function enviar(env, para, mensagem) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM || "Trustio <no-reply@send.trustio.com.br>", to: [para], ...mensagem }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
}

export async function cadastrarAfiliado(req, env, origin, { rpc, json, escapar }) {
  let dados;
  try { dados = await req.json(); } catch { return json(400, { ok: false, error: "corpo_invalido" }, origin); }
  if (String(dados?._honey || "").trim()) return json(200, { ok: true }, origin); // robô

  const { afiliado, erro } = validar(dados || {});
  if (erro) return json(400, { ok: false, error: erro }, origin);

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RESEND_API_KEY) {
    console.error("afiliados_nao_configurado");
    return json(503, { ok: false, error: "indisponivel" }, origin);
  }

  let registro;
  try {
    registro = await rpc(env, "registrar_afiliado", {
      p_email: afiliado.email,
      p_nome: afiliado.nome,
      p_canal: afiliado.canal,
      p_audiencia: afiliado.audiencia || null,
      p_pix_chave: afiliado.pix,
      p_pix_tipo: afiliado.pixTipo,
      p_cpf: afiliado.cpf,
      p_whatsapp: afiliado.whatsapp,
    });
  } catch (err) {
    console.error("registrar_afiliado_falhou", err.message);
    return json(502, { ok: false, error: "indisponivel" }, origin);
  }
  if (!registro?.ok) return json(400, { ok: false, error: registro?.error || "erro" }, origin);

  // enviar = false: o aviso saiu há menos de 5 minutos, ou o afiliado já foi analisado.
  // A resposta é a mesma, para não revelar a terceiros quem já é afiliado.
  if (registro.enviar) {
    try {
      await enviar(env, afiliado.email, emailRecebido(registro.nome || afiliado.nome, escapar));
      await enviarWhatsapp(env, afiliado.whatsapp, MENSAGENS.recebido(registro.nome || afiliado.nome));
    } catch (err) {
      console.error("envio_afiliado_falhou", err.message);
      try { await rpc(env, "desfazer_recebido_afiliado", { p_email: afiliado.email }); }
      catch (e) { console.error("desfazer_recebido_afiliado_falhou", e.message); }
      return json(502, { ok: false, error: "email_nao_enviado" }, origin);
    }
  }
  return json(200, { ok: true }, origin);
}

/** RPC com o token de quem está logado no CRM: o banco aplica is_staff() a essa pessoa. */
async function rpcComoUsuario(env, token, nome, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const texto = await r.text();
  if (r.status === 401 || r.status === 403) return { ok: false, error: "sessao_invalida" };
  if (!r.ok) throw new Error(`rpc ${nome} ${r.status}: ${texto.slice(0, 300)}`);
  try { return JSON.parse(texto); } catch { return null; }
}

export async function aprovarAfiliado(req, env, origin, { rpc, json, escapar }) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { ok: false, error: "sessao_invalida" }, origin);
  let dados;
  try { dados = await req.json(); } catch { return json(400, { ok: false, error: "corpo_invalido" }, origin); }
  if (!UUID.test(String(dados?.id || ""))) return json(400, { ok: false, error: "id_invalido" }, origin);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.RESEND_API_KEY) {
    console.error("afiliados_nao_configurado");
    return json(503, { ok: false, error: "indisponivel" }, origin);
  }

  let r;
  try { r = await rpcComoUsuario(env, token, "aprovar_afiliado", { p_id: dados.id }); }
  catch (err) {
    console.error("aprovar_afiliado_falhou", err.message);
    return json(502, { ok: false, error: "indisponivel" }, origin);
  }
  if (!r?.ok) {
    const status = r?.error === "sessao_invalida" ? 401 : r?.error === "somente_equipe" ? 403 : 409;
    return json(status, { ok: false, error: r?.error || "erro", vagas: r?.vagas }, origin);
  }

  // Cupom na Stripe na primeira aprovação (ou no reenvio, se a Stripe ainda não estava ligada).
  let cupom = r.cupom || null;
  let cupomErro = null;
  if (!cupom && env.STRIPE_SECRET_KEY && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const criado = await criarCupomAfiliado(env, r.id, r.candidatos || [], (c) => rpc(env, "cupom_livre", { p_cupom: c }));
      const salvo = await rpc(env, "definir_cupom_afiliado", { p_id: r.id, p_cupom: criado.cupom, p_promo_id: criado.promoId });
      if (salvo?.ok) cupom = criado.cupom; else cupomErro = salvo?.error || "nao_salvo";
    } catch (err) { cupomErro = err.message; console.error("cupom_afiliado_falhou", err.message); }
  } else if (!cupom) {
    cupomErro = "stripe_nao_configurada";
  }

  const link = linkDeIndicacao(env, cupom || r.codigo);
  // Aprovado no banco mesmo se o e-mail falhar: o CRM avisa e o botão reenvia.
  let emailEnviado = true;
  try { await enviar(env, r.email, emailAprovado(r.nome, r.codigo, link, escapar, cupom)); }
  catch (err) { emailEnviado = false; console.error("envio_aprovacao_falhou", err.message); }
  const wa = await enviarWhatsapp(env, r.whatsapp, MENSAGENS.aprovado(r.nome, link, cupom));
  return json(200, {
    ok: true, email_enviado: emailEnviado, whatsapp_enviado: wa.enviado, codigo: r.codigo, cupom, cupom_erro: cupomErro,
    link, whatsapp: r.whatsapp, nome: r.nome, mensagem_whatsapp: MENSAGENS.aprovado(r.nome, link, cupom),
  }, origin);
}

export function emailComissao(nome, valorComissao, valorVenda, escapar) {
  return {
    subject: `Você fez uma venda! Comissão de ${brl(valorComissao)} — Trustio`,
    html: moldura(`Comissão de ${brl(valorComissao)} registrada.`, `
      <p style="margin:0 0 14px;font-size:20px;font-weight:600;color:#f4f6fa;">${escapar(nome)}, você fez uma venda!</p>
      <p ${P}>Uma venda de <b style="color:#f4f6fa;">${brl(valorVenda)}</b> entrou pelo seu link ou cupom Trustio.</p>
      <p ${ROTULO}>Sua comissão</p>
      <p style="margin:0 0 26px;font-size:26px;font-weight:700;color:#53cdfe;">${brl(valorComissao)}</p>
      <p style="margin:0 0 30px;font-size:13px;line-height:1.6;color:#8b96a7;">O valor vai para a chave Pix cadastrada.</p>`),
    text: `${nome}, você fez uma venda!\n\nVenda: ${brl(valorVenda)}\nSua comissão: ${brl(valorComissao)}\n\nO valor vai para a chave Pix cadastrada.\n\nTrustio · https://trustio.com.br/afiliados.html`,
  };
}

/**
 * POST /stripe/webhook. Só checkout.session.completed gera comissão (é a primeira compra;
 * renovações chegam como invoice.* e não pagam comissão de novo). Responde 2xx a todo evento
 * que não gera comissão, para a Stripe não reenviar; 5xx só em falha real, e a Stripe tenta
 * de novo por até 3 dias.
 */
export async function webhookStripe(req, env, { rpc, json, escapar }) {
  const corpo = await req.text();
  if (!env.STRIPE_WEBHOOK_SECRET) return json(503, { ok: false, error: "nao_configurado" });
  if (!(await assinaturaValida(corpo, req.headers.get("stripe-signature"), env.STRIPE_WEBHOOK_SECRET))) {
    return json(400, { ok: false, error: "assinatura_invalida" });
  }
  let evento;
  try { evento = JSON.parse(corpo); } catch { return json(400, { ok: false, error: "corpo_invalido" }); }
  if (evento.type !== "checkout.session.completed") return json(200, { ok: true, ignorado: evento.type });

  const resumo = evento.data?.object || {};
  if (resumo.payment_status && resumo.payment_status !== "paid" && resumo.payment_status !== "no_payment_required") {
    return json(200, { ok: true, ignorado: "nao_pago" });
  }

  let registro;
  try {
    const sessao = env.STRIPE_SECRET_KEY ? await lerSessao(env, resumo.id) : resumo;
    const preco = sessao.line_items?.data?.[0]?.price?.id || null;
    registro = await rpc(env, "registrar_comissao", {
      p_evento: evento.id,
      p_sessao: sessao.id,
      p_ref: sessao.client_reference_id || null,
      p_promo_id: promoDaSessao(sessao),
      p_email_comprador: sessao.customer_details?.email || sessao.customer_email || null,
      p_valor_venda: Number(sessao.amount_subtotal ?? 0),
      p_price_id: preco,
      p_payment_intent: typeof sessao.payment_intent === "string" ? sessao.payment_intent : null,
    });
  } catch (err) {
    console.error("comissao_falhou", err.message);
    return json(500, { ok: false, error: "tente_de_novo" });
  }

  if (registro?.registrada && registro.valor_comissao > 0) {
    const a = registro.afiliado;
    try { await enviar(env, a.email, emailComissao(a.nome, registro.valor_comissao, registro.valor_venda, escapar)); }
    catch (err) { console.error("email_comissao_falhou", err.message); }
    await enviarWhatsapp(env, a.whatsapp, MENSAGENS.comissao(a.nome, registro.valor_comissao, registro.valor_venda));
  }
  return json(200, { ok: true, registrada: Boolean(registro?.registrada), motivo: registro?.motivo || null });
}

export const statusIntegracoes = (env) => ({
  stripe: Boolean(env.STRIPE_SECRET_KEY),
  stripe_webhook: Boolean(env.STRIPE_WEBHOOK_SECRET),
  whatsapp: whatsappConfigurado(env),
});
