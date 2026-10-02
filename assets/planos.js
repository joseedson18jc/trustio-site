"use strict";
// Planos: seletor Empresas | Você (com deep link #pessoal / #empresas) e pré-seleção do plano na lista de acesso.
// Mesmo arquivo nas duas versões do site: o texto segue o idioma da página.
const EN = /^en\b/i.test(document.documentElement.lang);
const T = (pt, en) => (EN ? en : pt);
const OBRIGADO = `https://trustio.com.br${EN ? "/en" : ""}/obrigado.html`;
const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
const tabs = [...document.querySelectorAll("[data-seg]")];
const panels = { empresas: document.getElementById("empresas"), pessoal: document.getElementById("pessoal") };
function show(seg, focusTab) {
  if (!panels[seg]) return;
  tabs.forEach((t) => { const on = t.dataset.seg === seg; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; if (on && focusTab) t.focus(); });
  Object.entries(panels).forEach(([k, p]) => { p.hidden = k !== seg; });
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => { show(t.dataset.seg); history.replaceState(null, "", "#" + t.dataset.seg); });
  t.addEventListener("keydown", (e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; e.preventDefault(); const n = tabs[(i + d + tabs.length) % tabs.length]; show(n.dataset.seg, true); history.replaceState(null, "", "#" + n.dataset.seg); });
});
// Sub-abas de "Para você": chat | agentio | combo (deep links #agentio e #combo).
const subTabs = [...document.querySelectorAll("[data-sub]")];
const subPanels = { chat: document.getElementById("pessoal-chat"), agentio: document.getElementById("agentio"), combo: document.getElementById("combo") };
function showSub(sub, focusTab) {
  if (!subPanels[sub]) return;
  subTabs.forEach((t) => { const on = t.dataset.sub === sub; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; if (on && focusTab) t.focus(); });
  Object.entries(subPanels).forEach(([k, p]) => { if (p) p.hidden = k !== sub; });
}
const subHash = (sub) => (sub === "chat" ? "pessoal" : sub);
subTabs.forEach((t, i) => {
  t.addEventListener("click", () => { showSub(t.dataset.sub); history.replaceState(null, "", "#" + subHash(t.dataset.sub)); });
  t.addEventListener("keydown", (e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; e.preventDefault(); const n = subTabs[(i + d + subTabs.length) % subTabs.length]; showSub(n.dataset.sub, true); history.replaceState(null, "", "#" + subHash(n.dataset.sub)); });
});
document.querySelectorAll("[data-sub-link]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault(); showSub(a.dataset.subLink); history.replaceState(null, "", "#" + a.dataset.subLink);
  document.querySelector(".seg-sub")?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "center" });
}));
function fromHash() {
  const h = location.hash.replace("#", "");
  if (h === "agentio" || h === "combo") { show("pessoal"); showSub(h); }
  else if (h === "pessoal" || h === "lista") { show("pessoal"); if (h === "pessoal") showSub("chat"); if (h === "lista") document.getElementById("lista")?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "start" }); }
  else if (h === "empresas" || h === "diagnostico") show("empresas");
}
fromHash();
window.addEventListener("hashchange", fromHash);
// "Quero acesso" nos cards: pré-seleciona o plano e leva ao formulário
document.querySelectorAll("[data-interesse]").forEach((a) => a.addEventListener("click", (e) => {
  e.preventDefault();
  const r = document.querySelector(`input[name="plano"][value="${a.dataset.interesse}"]`); if (r) r.checked = true;
  const f = document.getElementById("lista"); f?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "start" });
  setTimeout(() => document.getElementById("lead-email")?.focus({ preventScroll: true }), rm.matches ? 0 : 450);
}));
