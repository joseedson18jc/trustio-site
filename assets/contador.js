"use strict";
// Contador da lista de espera: parte de data-count na data data-count-start e soma data-count-step a cada data-count-every horas.
// Ajuste os atributos no HTML (index.html, espera.html, planos.html) para mudar base, ritmo ou ponto de partida.
document.querySelectorAll("[data-count]").forEach((el) => {
  const base = Number(el.dataset.count) || 0;
  const start = Date.parse(el.dataset.countStart || "2026-09-08T15:00:00-03:00");
  const step = Number(el.dataset.countStep ?? 132);
  const every = (Number(el.dataset.countEvery) || 2) * 36e5;
  const render = () => {
    const n = base + Math.max(0, Math.floor((Date.now() - start) / every)) * step;
    el.textContent = n.toLocaleString("pt-BR");
  };
  render(); setInterval(render, 60_000);
});
