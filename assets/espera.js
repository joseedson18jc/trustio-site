"use strict";
// Atendimento: campos condicionais e pré-seleção por URL.
const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
const qs = new URLSearchParams(location.search);

// --- B2C / B2B conditional fields
const form = document.getElementById("espera-form");
const tipoInputs = [...document.querySelectorAll('input[name="tipo"]')];
const conds = [...document.querySelectorAll(".cond")];
const segSel = document.querySelector("[data-req-b2b]");
function applyTipo() {
  const t = tipoInputs.find((i) => i.checked)?.dataset.tipo || "b2c";
  conds.forEach((c) => { c.hidden = c.dataset.when !== t; });
  if (segSel) segSel.required = t === "b2b";
  const o = document.querySelector("[data-origem]"); if (o) o.value = `espera.html · ${t}`;
}
tipoInputs.forEach((i) => i.addEventListener("change", applyTipo));

// --- orientação ou assinatura após o pagamento
const acessoInputs = [...document.querySelectorAll('input[name="acesso"]')];
const nextInput = document.querySelector("[data-next]");
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
const OBRIGADO = `https://trustio.com.br${EN ? "/en" : ""}/obrigado.html`;
const submitBtn = document.querySelector("[data-submit]");
const subjInput = form?.querySelector('input[name="_subject"]');
const preNota = document.querySelector("[data-pre-nota]");
function applyAcesso() {
  const pre = acessoInputs.find((i) => i.checked)?.dataset.acesso === "pre";
  const t = tipoInputs.find((i) => i.checked)?.dataset.tipo || "b2c";
  const pv = document.querySelector('input[name="plano"]:checked')?.value || "";
  const planoKey = t === "b2b" ? "empresa" : pv.startsWith("Passe") ? "semanal" : pv.startsWith("Anual") ? "anual" : "mensal";
  if (nextInput) nextInput.value = pre ? `${OBRIGADO}?lista=pre&plano=${planoKey}` : `${OBRIGADO}?lista=espera`;
  if (subjInput) subjInput.value = (pre ? "Pedido de assinatura — trustio.com.br" : "Solicitação de contato — trustio.com.br") + (EN ? " · EN" : "");
  // Empresa não entra em 1 dia útil: o arquiteto faz contato nesse prazo e a implantação segue o prazo do plano.
  if (preNota) preNota.textContent = t === "b2b" ? T("arquiteto em até 1 dia útil · proposta e link de pagamento", "architect within 1 business day · proposal and payment link") : T("acesso automático após a confirmação do pagamento · enviamos o link de pagamento", "automatic access after payment confirmation · we send the payment link");
  if (submitBtn) submitBtn.firstChild.textContent = !pre ? T("Solicitar contato ", "Request contact ") : t === "b2b" ? T("Quero assinar e falar com um arquiteto ", "Subscribe and talk to an architect ") : T("Quero assinar com acesso automático ", "Subscribe with automatic access ");
}
acessoInputs.forEach((i) => i.addEventListener("change", applyAcesso));
document.querySelectorAll('input[name="plano"], input[name="tipo"]').forEach((i) => i.addEventListener("change", applyAcesso));

// --- deep links: ?tipo=b2b|b2c  &seg=voiceai|juridico|saude|financeiro  &plano=mensal|semanal|anual  &acesso=pre
const tipo = qs.get("tipo");
if (tipo === "b2b" || tipo === "b2c") { const r = tipoInputs.find((i) => i.dataset.tipo === tipo); if (r) r.checked = true; }
const segMap = EN
  ? { voiceai: "VoiceAI", juridico: "Legal", saude: "Healthcare", financeiro: "Finance", varejo: "Retail", industria: "Manufacturing", publico: "Public sector" }
  : { voiceai: "VoiceAI", juridico: "Jurídico", saude: "Saúde", financeiro: "Financeiro", varejo: "Varejo", industria: "Indústria", publico: "Setor público" };
const seg = qs.get("seg");
if (seg && segSel && segMap[seg]) { const opt = [...segSel.options].find((o) => o.textContent.startsWith(segMap[seg])); if (opt) opt.selected = true; }
const planoMap = { mensal: "Mensal", semanal: "Passe", anual: "Anual" };
const plano = qs.get("plano");
if (plano && planoMap[plano]) { const r = [...document.querySelectorAll('input[name="plano"]')].find((i) => i.value.startsWith(planoMap[plano])); if (r) r.checked = true; }
if (qs.get("acesso") === "pre") { const r = acessoInputs.find((i) => i.dataset.acesso === "pre"); if (r) r.checked = true; }
applyTipo();
applyAcesso();
if (qs.has("tipo") || qs.has("seg") || qs.has("acesso")) setTimeout(() => document.getElementById("lista")?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "start" }), 150);
