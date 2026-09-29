// Tema da página "IA sem censura" antes da primeira pintura: a mesma escolha do resto do site
// (localStorage "trustio-theme"); sem escolha salva, escuro, como no site.
(function () {
  var t = null;
  try { t = localStorage.getItem("trustio-theme"); } catch (e) { /* sem storage */ }
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  document.documentElement.classList.add("js");
  // ".js" esconde as seções até o script da página revelá-las. Se esse script não carregar ou
  // quebrar antes de assumir (marca "js-pronto"), tira o ".js" no load e o conteúdo aparece.
  window.addEventListener("load", function () {
    var h = document.documentElement;
    if (!h.classList.contains("js-pronto")) h.classList.remove("js");
  });
})();
