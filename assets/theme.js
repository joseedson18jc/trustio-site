/* Aplica o tema salvo antes da primeira pintura, evitando flash.
   Carregado de forma síncrona no <head>, antes de styles.css.
   Padrão da marca: escuro. O claro é opt-in (alternador no cabeçalho). */
(function () {
  try {
    var theme = localStorage.getItem("trustio-theme");
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  } catch (error) {
    /* localStorage indisponível (modo privado, bloqueio de dados): fica no escuro. */
  }
})();

/* Bandeira de idioma: leva junto a busca e a âncora da página (?lista=pre&plano=anual,
   ?tipo=b2b, #empresas), para a troca de idioma não perder o estado. O href fixo
   continua valendo sem JavaScript. */
(function () {
  function levarEstado(e) {
    var a = e.target && e.target.closest ? e.target.closest("a.lang-switch") : null;
    // Sempre recalcula: sem busca nem âncora agora, o link volta ao endereço limpo.
    if (!a) return;
    a.href = a.getAttribute("href").split(/[?#]/)[0] + location.search + location.hash;
  }
  document.addEventListener("click", levarEstado);
  document.addEventListener("auxclick", levarEstado); // botão do meio: nova aba
})();
