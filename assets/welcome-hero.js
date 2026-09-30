/* Abertura do chat (/app/): contagem dos números (easeOutCubic, uma vez, ao entrar na tela) e o
   botão "Começar", que abre a conversa (mesmo caminho do onboarding) ou foca a caixa de mensagem. */
(function () {
  var hero = document.querySelector("[data-wh]");
  if (!hero) return;
  var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  var reduz = !!(mq && mq.matches);
  var local = document.documentElement.lang || "pt-BR";

  function formata(v, casas, suf) {
    return v.toLocaleString(local, { minimumFractionDigits: casas, maximumFractionDigits: casas }) + suf;
  }

  var numeros = Array.prototype.slice.call(hero.querySelectorAll("[data-wh-count]"));
  numeros.forEach(function (el) {
    el.textContent = formata(Number(el.dataset.whCount), Number(el.dataset.whDec), el.dataset.whSuf);
  });

  function conta(el, i) {
    var casas = Number(el.dataset.whDec), suf = el.dataset.whSuf;
    var dur = 1500 + i * 80, ini = null;
    el.textContent = formata(0, casas, suf);
    function passo(t) {
      if (ini === null) ini = t;
      var p = Math.min(1, (t - ini) / dur), e = 1 - Math.pow(1 - p, 3);
      // Lê o alvo a cada quadro: o chat pode trocar o limite de perguntas grátis no meio da contagem.
      el.textContent = formata(Number(el.dataset.whCount) * e, casas, suf);
      if (p < 1) requestAnimationFrame(passo);
    }
    setTimeout(function () { requestAnimationFrame(passo); }, 480 + i * 90);
  }

  // O chat fica em data-state="loading" (invisível, atrás da tela de entrada) até a sessão
  // carregar. Contagem e vídeo só começam quando ele fica "ready": antes disso ninguém os vê, e
  // o vídeo nem é baixado para quem não entra.
  function quandoPronto(fn) {
    var shell = document.querySelector(".chat-shell");
    if (!shell || shell.dataset.state === "ready") { fn(); return; }
    var mo = new MutationObserver(function () {
      if (shell.dataset.state === "ready") { mo.disconnect(); fn(); }
    });
    mo.observe(shell, { attributes: true, attributeFilter: ["data-state"] });
  }

  if (!reduz && "IntersectionObserver" in window) quandoPronto(function () {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (en) {
        if (!en.isIntersecting) return;
        obs.disconnect();
        numeros.forEach(conta);
      });
    }, { threshold: 0.25 });
    var lista = hero.querySelector(".wh-stats");
    if (lista) obs.observe(lista);
  });

  // O vídeo só roda com a abertura visível (abrir uma conversa esconde a tela de boas-vindas) e
  // sem "reduzir movimento", inclusive se isso mudar depois.
  var video = hero.querySelector("video"), visivel = false;
  function atualizaVideo() {
    if (!video) return;
    if (visivel && !(mq && mq.matches)) { var p = video.play(); if (p && p.catch) p.catch(function () {}); }
    else video.pause();
  }
  if (video) {
    video.removeAttribute("autoplay");
    quandoPronto(function () {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (entradas) {
          visivel = entradas[entradas.length - 1].isIntersecting;
          atualizaVideo();
        }).observe(hero);
      } else { visivel = true; atualizaVideo(); }
    });
    if (mq) {
      if (mq.addEventListener) mq.addEventListener("change", atualizaVideo);
      else if (mq.addListener) mq.addListener(atualizaVideo);
    }
  }

  var cta = hero.querySelector("[data-wh-cta]");
  if (cta) cta.addEventListener("click", function () {
    var inicio = document.querySelector("[data-ob-start]");
    if (inicio && inicio.offsetParent !== null) { inicio.click(); return; }
    var prompt = document.getElementById("prompt");
    if (prompt) prompt.focus();
  });
})();
