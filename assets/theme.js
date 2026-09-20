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
