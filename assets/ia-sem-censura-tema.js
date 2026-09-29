// Tema da página "IA sem censura" antes da primeira pintura: a mesma escolha do resto do site
// (localStorage "trustio-theme"); sem escolha salva, escuro, como no site.
(function () {
  var t = null;
  try { t = localStorage.getItem("trustio-theme"); } catch (e) { /* sem storage */ }
  document.documentElement.setAttribute("data-theme", t === "light" ? "light" : "dark");
  document.documentElement.classList.add("js");
})();
