#!/usr/bin/env node
// Configura a Stripe para o programa de afiliados, uma vez só. Rode no terminal:
//
//   STRIPE_SECRET_KEY=rk_live_… node scripts/stripe-afiliados-setup.mjs
//
// O que faz (idempotente: rodar de novo não duplica nada):
//   1. Liga "permitir códigos promocionais" em todos os Payment Links ativos, para o cupom do
//      afiliado (ex.: LUISC10) valer e vir preenchido no checkout.
//   2. Cria o webhook https://api.trustio.com.br/stripe/webhook (checkout.session.completed).
//   3. Grava no worker, via `wrangler secret put`, STRIPE_SECRET_KEY e STRIPE_WEBHOOK_SECRET.
//      Os valores vão direto da memória para o wrangler: nada é impresso na tela.
//
// A chave precisa (chave restrita): Checkout Sessions (ler), Coupons, Promotion Codes,
// Payment Links e Webhook Endpoints (escrever).
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHAVE = process.env.STRIPE_SECRET_KEY || "";
const URL_WEBHOOK = "https://api.trustio.com.br/stripe/webhook";
const VERSAO_API = "2024-06-20";
const WORKER = resolve(dirname(fileURLToPath(import.meta.url)), "..", "worker");

if (!/^(sk|rk)_(live|test)_/.test(CHAVE)) {
  console.error("Defina STRIPE_SECRET_KEY (sk_… ou rk_…) antes de rodar. Ver o topo deste arquivo.");
  process.exit(1);
}

async function stripe(metodo, caminho, campos) {
  const r = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${CHAVE}`, "Stripe-Version": VERSAO_API, "Content-Type": "application/x-www-form-urlencoded" },
    body: campos ? new URLSearchParams(campos).toString() : undefined,
  });
  const dados = await r.json();
  if (!r.ok) throw new Error(`${metodo} ${caminho}: ${dados?.error?.message || r.status}`);
  return dados;
}

function segredoNoWorker(nome, valor) {
  const r = spawnSync("npx", ["wrangler", "secret", "put", nome], { cwd: WORKER, input: valor, stdio: ["pipe", "inherit", "inherit"] });
  if (r.status !== 0) throw new Error(`wrangler secret put ${nome} falhou`);
}

// 1. Payment Links
let ligados = 0;
let total = 0;
const pulados = [];
let depois;
do {
  const pagina = await stripe("GET", `payment_links?active=true&limit=100${depois ? `&starting_after=${depois}` : ""}`);
  for (const link of pagina.data) {
    total++;
    if (!link.allow_promotion_codes) {
      try {
        await stripe("POST", `payment_links/${link.id}`, { allow_promotion_codes: "true" });
        ligados++;
      } catch (err) {
        // Preço livre ("o cliente escolhe o valor") não aceita cupom na Stripe: o link segue
        // atribuindo pelo client_reference_id, só sem o cupom preenchido.
        if (!/custom_unit_amount/.test(err.message)) throw err;
        pulados.push(link.url);
      }
    }
  }
  depois = pagina.has_more ? pagina.data.at(-1).id : null;
} while (depois);
console.log(`Payment Links: ${total} ativos, cupom ligado em ${ligados}.`);
if (pulados.length) console.log(`Sem cupom (preço livre, a Stripe não permite): ${pulados.join(", ")}`);

// 2. Webhook
const existentes = await stripe("GET", "webhook_endpoints?limit=100");
const ja = existentes.data.find((w) => w.url === URL_WEBHOOK);
let segredoWebhook = null;
if (ja) {
  console.log(`Webhook já existe (${ja.id}). A Stripe só mostra o segredo na criação: se o worker ainda não tem`);
  console.log("STRIPE_WEBHOOK_SECRET, gere outro em Developers → Webhooks → (endpoint) → Roll secret e rode:");
  console.log("  cd worker && npx wrangler secret put STRIPE_WEBHOOK_SECRET");
} else {
  const novo = await stripe("POST", "webhook_endpoints", {
    url: URL_WEBHOOK,
    "enabled_events[]": "checkout.session.completed",
    description: "Trustio · comissões de afiliados",
    api_version: VERSAO_API,
  });
  segredoWebhook = novo.secret;
  console.log(`Webhook criado (${novo.id}).`);
}

// 3. Segredos no worker
segredoNoWorker("STRIPE_SECRET_KEY", CHAVE);
if (segredoWebhook) segredoNoWorker("STRIPE_WEBHOOK_SECRET", segredoWebhook);
console.log("Pronto. Confira: curl -s https://api.trustio.com.br/saude  → afiliados.stripe e stripe_webhook = true");
