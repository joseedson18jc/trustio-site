// Velocidade do modelo no chat: tokens por segundo enquanto ele pensa e escreve (2 nov 2026).
// Vale o número que o servidor do modelo informa (llama.cpp: timings.predicted_per_second, que a
// função de chat repassa como "v"). Sem ele, a conta vai do primeiro token até agora: a espera na
// fila e a leitura do prompt não entram.
(function () {
  "use strict";
  var MIN_MS = 500, MIN_TOKENS = 5;

  function medidor() {
    var inicio = null, tokensInicio = 0, ultimo = null, informada = 0;
    return {
      marcar: function (tokens, agora, v) {
        if (inicio === null) { inicio = agora; tokensInicio = tokens; }
        ultimo = { tokens: tokens, agora: agora };
        if (typeof v === "number" && v > 0 && isFinite(v)) informada = v;
      },
      taxa: function () {
        if (informada) return Math.round(informada);
        if (!ultimo || ultimo.agora - inicio < MIN_MS || ultimo.tokens - tokensInicio < MIN_TOKENS) return 0;
        return Math.round((ultimo.tokens - tokensInicio) / ((ultimo.agora - inicio) / 1000));
      }
    };
  }

  function rotulo(taxa) { return taxa ? " · " + taxa + " tok/s" : ""; }

  window.TrustioVelocidade = { medidor: medidor, rotulo: rotulo };
})();
