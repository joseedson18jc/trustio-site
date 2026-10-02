"use strict";
/* Orb de vitrine do VoiceAI na home — o mesmo shader "galáxia em esfera de vidro"
   do trustio.com.br/voice.html, em versão decorativa (sem áudio). Preguiçoso como
   o resto do site: o contexto WebGL só nasce quando o orb se aproxima da viewport
   (mesmo padrão do PR #88 — home-orb-idle mostra o gradiente estático até lá). */
(function () {
  function initOrb(el) {
    var c = (el.dataset.colors || "#bfe0ff,#2563eb,#081536").split(",");
    var glow = el.dataset.glow || "#5ea7ff";
    el.style.setProperty("--glow", glow);
    var orb = new TrustioOrb(el, {
      colors: [c[1], c[0], glow], anchor: glow, bg: el.dataset.bg || "#05070b",
      arch: el.dataset.arch !== undefined ? Number(el.dataset.arch) : -1,
      lens: 0, dual: false, fps: Number(el.dataset.fps || 30), seed: Math.random() * 100
    });
    el.classList.remove("orb-home-idle");
    return orb;
  }
  function iniciar() {
    document.querySelectorAll(".orb-home").forEach(function (el) {
      el.classList.add("orb-home-idle");
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries, obs) {
          entries.forEach(function (e) {
            if (!e.isIntersecting) return;
            obs.disconnect();
            initOrb(e.target);
          });
        }, { rootMargin: "320px" });
        io.observe(el);
      } else {
        initOrb(el);
      }
    });
  }

  // orb.js é defer e carrega antes deste arquivo no documento; se por qualquer
  // motivo a ordem mudar (injetor, bundler, reorder do stamp), o DOMContentLoaded
  // ainda vem depois de todos os defers — o orb nunca fica sem nascer.
  if (typeof window.TrustioOrb === "function") iniciar();
  else document.addEventListener("DOMContentLoaded", function () { if (typeof window.TrustioOrb === "function") iniciar(); });
})();
