"use strict";
// Lista de espera: contagem regressiva para o lançamento, campos condicionais B2C/B2B e pré-seleção por URL (?tipo=b2b&seg=juridico).
const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
const qs = new URLSearchParams(location.search);

// --- countdown
const cd = document.querySelector("[data-countdown]");
if (cd) {
  const target = new Date(cd.dataset.countdown).getTime();
  const el = { d: cd.querySelector('[data-cd="d"]'), h: cd.querySelector('[data-cd="h"]'), m: cd.querySelector('[data-cd="m"]') };
  const tick = () => {
    const diff = Math.max(0, target - Date.now());
    const d = Math.floor(diff / 864e5), h = Math.floor(diff % 864e5 / 36e5), m = Math.floor(diff % 36e5 / 6e4);
    el.d.textContent = String(d); el.h.textContent = String(h).padStart(2, "0"); el.m.textContent = String(m).padStart(2, "0");
    if (diff === 0) cd.querySelector("small").textContent = "lançado";
  };
  tick(); setInterval(tick, 30_000);
}

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

// --- deep links: ?tipo=b2b|b2c  &seg=voiceai|juridico|saude|financeiro  &plano=mensal|semanal|anual
const tipo = qs.get("tipo");
if (tipo === "b2b" || tipo === "b2c") { const r = tipoInputs.find((i) => i.dataset.tipo === tipo); if (r) r.checked = true; }
const segMap = { voiceai: "VoiceAI", juridico: "Jurídico", saude: "Saúde", financeiro: "Financeiro", varejo: "Varejo", industria: "Indústria", publico: "Setor público" };
const seg = qs.get("seg");
if (seg && segSel && segMap[seg]) { const opt = [...segSel.options].find((o) => o.textContent.startsWith(segMap[seg])); if (opt) opt.selected = true; }
const planoMap = { mensal: "Mensal", semanal: "Passe", anual: "Anual" };
const plano = qs.get("plano");
if (plano && planoMap[plano]) { const r = [...document.querySelectorAll('input[name="plano"]')].find((i) => i.value.startsWith(planoMap[plano])); if (r) r.checked = true; }
applyTipo();
if (qs.has("tipo") || qs.has("seg")) setTimeout(() => document.getElementById("lista")?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "start" }), 150);
