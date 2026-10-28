/* Abertura do chat (/app/), 17 out 2026. Cada atalho aciona o controle de verdade do chat:
   o clipe de anexo, o botão de conversa por voz (voz.js), o cartão do Heavy Thinking (chat.js).
   As tarefas rápidas só preenchem a caixa de mensagem; quem envia é a pessoa. */
(function () {
  var box = document.querySelector("[data-atalhos]");
  if (!box) return;
  var EN = /^en/i.test(document.documentElement.lang || "");
  function T(pt, en) { return EN ? en : pt; }

  var TAREFAS = {
    resumir: [T("Resuma o arquivo anexado em 5 tópicos, com o mais importante primeiro.", "Summarize the attached file in 5 bullet points, most important first."), true],
    conta: [T("Resolva passo a passo e explique cada etapa: ", "Solve step by step and explain each step: "), false],
    grafico: [T("Faça o gráfico da função y = ", "Plot the function y = "), false],
    revisar: [T("Revise o texto abaixo: corrija os erros, deixe mais claro e mantenha o meu tom.\n\n", "Review the text below: fix the mistakes, make it clearer and keep my tone.\n\n"), false],
    traduzir: [T("Traduza para o inglês, mantendo o tom: ", "Translate into English, keeping the tone: "), false],
    mensagem: [T("Escreva uma mensagem curta e educada para ", "Write a short, polite message to "), false]
  };

  var prompt = document.getElementById("prompt");
  var aviso = box.querySelector("[data-atalhos-aviso]");

  function avisar(texto) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.hidden = !texto;
  }
  function focarCaixa() {
    if (!prompt) return;
    prompt.focus();
    var fim = prompt.value.length;
    try { prompt.setSelectionRange(fim, fim); } catch (e) { /* alguns navegadores não deixam */ }
  }
  function preencher(texto) {
    if (!prompt) return;
    prompt.value = texto;
    // O chat ajusta a altura e o botão de enviar no evento "input".
    prompt.dispatchEvent(new Event("input", { bubbles: true }));
    focarCaixa();
  }
  function botaoVoz() { return document.querySelector(".composer .conversa-voz"); }
  function cartaoHeavy() { return document.querySelector("[data-modelo-opcoes] input[name='modelo-rapido'][value='trustio-heavy']"); }

  // Esconde o atalho quando o controle não existe nesta conta (voz desligada, um modelo só).
  function mostrar(el, visivel) { if (el && el.hidden === !!visivel) el.hidden = !visivel; }
  function botaoAoVivo() { var b = document.querySelector(".composer .tr-abrir"); return b && !b.hidden ? b : null; }
  var cartoes = { voz: box.querySelector("[data-atalho='voz']"), heavy: box.querySelector("[data-atalho='heavy']"),
    aoVivo: box.querySelector("[data-atalho='tempo-real']") };
  function atualizar() {
    // Só escreve quando muda: o observador abaixo também vê o atributo hidden.
    mostrar(cartoes.aoVivo, botaoAoVivo());
    mostrar(cartoes.voz, botaoVoz());
    mostrar(cartoes.heavy, cartaoHeavy());
  }
  atualizar();
  var composer = document.querySelector("[data-composer]");
  if (composer && "MutationObserver" in window) {
    new MutationObserver(atualizar).observe(composer.parentNode || composer, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  }

  box.addEventListener("click", function (e) {
    var alvo = e.target.closest ? e.target.closest("[data-atalho], [data-tarefa]") : null;
    if (!alvo) return;
    avisar("");
    var tarefa = alvo.getAttribute("data-tarefa");
    if (tarefa && TAREFAS[tarefa]) {
      preencher(TAREFAS[tarefa][0]);
      if (TAREFAS[tarefa][1]) { var clipe = document.querySelector("[data-attach]"); if (clipe) clipe.click(); }
      return;
    }
    var acao = alvo.getAttribute("data-atalho");
    if (acao === "arquivo") {
      var anexo = document.querySelector("[data-attach]");
      if (anexo) anexo.click();
    } else if (acao === "tempo-real") {
      var aoVivo = botaoAoVivo();
      if (aoVivo) aoVivo.click(); else focarCaixa();
    } else if (acao === "voz") {
      var voz = botaoVoz();
      if (voz) voz.click(); else focarCaixa();
    } else if (acao === "heavy") {
      var heavy = cartaoHeavy();
      if (!heavy) { focarCaixa(); return; }
      if (!heavy.checked) heavy.click();
      avisar(T("Heavy Thinking ligado. Escreva a tarefa e envie.", "Heavy Thinking is on. Write your task and send it."));
      focarCaixa();
    }
  });
})();
