"use strict";
// Suporte 24/7 (FAB do WhatsApp) — aparece só depois do primeiro scroll (RA5, reavaliação
// 2026-10): na dobra ele cobria CTAs e campos de formulário (cards de planos, e-mail do
// cadastro). Sem JS o botão continua sempre visível (enhancement progressivo).
// Em páginas mais curtas que a viewport (sem scroll possível), um fallback de 8 s
// garante que o suporte continue alcançável.
(function () {
  var fab = document.querySelector(".wa-float");
  if (!fab) return;

  fab.classList.add("wa-esperando");

  var entrou = false;
  function mostrar() {
    if (entrou) return;
    entrou = true;
    fab.classList.remove("wa-esperando");
    fab.classList.add("wa-entrou");
  }

  function aoRolar() {
    if ((window.scrollY || document.documentElement.scrollTop) > 40) mostrar();
  }
  window.addEventListener("scroll", aoRolar, { passive: true });
  setTimeout(mostrar, 8000);
})();
