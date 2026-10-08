/**
 * Stripe para o programa de afiliados: verificação do webhook, cupom do afiliado e leitura
 * da sessão de checkout. Sem SDK (o worker não tem dependências): só fetch e Web Crypto.
 *
 * Segredos (wrangler secret put):
 *   STRIPE_SECRET_KEY      chave restrita: Checkout Sessions (ler), Coupons e Promotion Codes (escrever)
 *   STRIPE_WEBHOOK_SECRET  whsec_… do endpoint https://api.trustio.com.br/stripe/webhook
 */

// Versão fixa da API: os nomes dos campos abaixo (promotion_codes.coupon, discounts) são desta.
const VERSAO_API = "2024-06-20";
const TOLERANCIA_S = 300;
export const CUPOM_BASE = "AFILIADOS10"; // 10% na primeira cobrança, compartilhado pelos códigos

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** Confere o cabeçalho Stripe-Signature (t=…,v1=…) contra o corpo cru. */
export async function assinaturaValida(corpoCru, cabecalho, segredo, agoraS = Math.floor(Date.now() / 1000)) {
  if (!cabecalho || !segredo) return false;
  let t = 0;
  const assinaturas = [];
  for (const parte of cabecalho.split(",")) {
    const i = parte.indexOf("=");
    const k = parte.slice(0, i).trim();
    const v = parte.slice(i + 1).trim();
    if (k === "t") t = Number(v);
    if (k === "v1") assinaturas.push(v);
  }
  if (!t || !assinaturas.length || Math.abs(agoraS - t) > TOLERANCIA_S) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(`${t}.${corpoCru}`)));
  return assinaturas.some((s) => iguais(s, esperado));
}

async function stripe(env, metodo, caminho, campos) {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": VERSAO_API,
      ...(campos ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: campos ? new URLSearchParams(campos).toString() : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  return { status: r.status, dados };
}

/** Garante o cupom-base de 10% (uma vez só, primeira cobrança). */
async function garantirCupomBase(env) {
  const r = await stripe(env, "GET", `coupons/${CUPOM_BASE}`);
  if (r.status === 200) return;
  const c = await stripe(env, "POST", "coupons", {
    id: CUPOM_BASE, percent_off: "10", duration: "once", name: "Afiliados Trustio · 10% na 1ª cobrança",
  });
  if (c.status !== 200 && c.dados?.error?.code !== "resource_already_exists") {
    throw new Error(`stripe coupon ${c.status}: ${c.dados?.error?.message || ""}`);
  }
}

/**
 * Cria o código promocional do afiliado tentando os candidatos em ordem (LUISC10, LUISCA10…).
 * cupomLivre(c) consulta o banco; a Stripe também recusa código que já existe na conta.
 */
export async function criarCupomAfiliado(env, afiliadoId, candidatos, cupomLivre) {
  await garantirCupomBase(env);
  for (const bruto of candidatos) {
    const code = String(bruto).toUpperCase();
    if (!(await cupomLivre(code))) continue;
    const r = await stripe(env, "POST", "promotion_codes", {
      coupon: CUPOM_BASE,
      code,
      "metadata[afiliado_id]": afiliadoId,
      "restrictions[first_time_transaction]": "true",
    });
    if (r.status === 200) return { cupom: code, promoId: r.dados.id };
    if (!/already exists|already in use/i.test(r.dados?.error?.message || "")) {
      throw new Error(`stripe promotion_code ${r.status}: ${r.dados?.error?.message || ""}`);
    }
  }
  throw new Error("sem_cupom_disponivel");
}

/** Sessão de checkout com os descontos e os itens (o evento não traz line_items). */
export async function lerSessao(env, id) {
  const qs = "expand[]=line_items&expand[]=total_details.breakdown";
  const r = await stripe(env, "GET", `checkout/sessions/${encodeURIComponent(id)}?${qs}`);
  if (r.status !== 200) throw new Error(`stripe session ${r.status}: ${r.dados?.error?.message || ""}`);
  return r.dados;
}

/** ID do código promocional (promo_…) usado na sessão, se houver. */
export function promoDaSessao(sessao) {
  const ids = [
    ...(sessao?.total_details?.breakdown?.discounts || []).map((d) => d?.discount?.promotion_code),
    ...(sessao?.discounts || []).map((d) => d?.promotion_code),
  ].map((p) => (p && typeof p === "object" ? p.id : p));
  return ids.find(Boolean) || null;
}
