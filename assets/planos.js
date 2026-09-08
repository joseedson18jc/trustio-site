"use strict";
// Planos: seletor Empresas | Você (com deep link #pessoal / #empresas) e pré-seleção do plano na lista de acesso.
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
function fromHash() {
  const h = location.hash.replace("#", "");
  if (h === "pessoal" || h === "lista") { show("pessoal"); if (h === "lista") document.getElementById("lista")?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "start" }); }
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
