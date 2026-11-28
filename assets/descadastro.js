// Página descadastro.html: confirma a saída da lista de e-mails de oferta.
// O link do e-mail traz um token (?t=...); nada é gravado antes de a pessoa confirmar.
(function () {
  "use strict";
  var FUNCAO = "https://mjdaluioyutnxlyomzyd.supabase.co/functions/v1/lembrete-oferta";
  var $ = function (s) { return document.querySelector(s); };
  var titulo = $("[data-sair-titulo]"), texto = $("[data-sair-texto]"), botao = $("[data-sair-confirmar]");
  var status = $("[data-sair-status]"), inicio = $("[data-sair-inicio]");
  var token = new URLSearchParams(location.search).get("t") || "";
  function fim(t, p) { titulo.textContent = t; texto.textContent = p; status.textContent = ""; botao.hidden = true; inicio.hidden = false; }
  function invalido() { fim("Este link não é válido.", "Para sair da lista, escreva para contato@trustio.com.br com o assunto \"sair\"."); }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) { invalido(); return; }
  botao.addEventListener("click", function () {
    botao.disabled = true; status.textContent = "Enviando…";
    fetch(FUNCAO, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sair: token }) }).then(function (r) {
      if (r.ok) fim("Pronto.", "Você não vai mais receber e-mails de oferta da Trustio.");
      else if (r.status === 404) invalido();
      else throw new Error("falhou");
    }).catch(function () { botao.disabled = false; status.textContent = "Não foi possível concluir agora. Tente de novo em instantes."; });
  });
})();
