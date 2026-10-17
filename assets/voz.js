/* assets/voz.js — voz no chat (17 out 2026).
   - Microfone: grava a fala e envia como áudio (a transcrição em português já existe no servidor).
   - "Ouvir": lê a resposta em voz alta (função de borda "voz": xAI, com ElevenLabs de reserva).
     Assinantes ouvem à vontade (teto diário no servidor). Quem está no teste ganha uma demonstração
     única (~3 respostas, selo "Grátis"); depois, o selo vira "Assinantes" e o toque mostra os planos.
   - Conversa por voz: fala → resposta lida em voz alta → volta a ouvir, sem tocar em nada.
     A gravação para sozinha depois de ~1,1 s de silêncio, e a resposta é falada frase a frase
     enquanto chega (trecho(el, texto), chamado pelo chat a cada pedaço).
   O chat (assets/chat.js) chama TrustioVoz.iniciar(...) uma vez, decorar(el) em cada resposta e
   respostaPronta(el) quando uma resposta termina de chegar. */
(function () {
  "use strict";
  var ctx = null, urlAtual = null, conversa = false, gravador = null, configurada = false;
  // O servidor diz o acesso: "livre" (assinante etc.), "teste" (com demo_restante caracteres de demonstração).
  var acesso = null, demoRestante = 0, dicaMostrada = false;
  // Um só elemento de áudio, desbloqueado no toque: o Safari recusa play() que começa depois de um
  // fetch fora do gesto da pessoa; tocar um WAV mudo no próprio toque libera o elemento para depois.
  var player = null, liberado = false;
  // O detector de silêncio usa um AudioContext; no Safari ele nasce "suspended" (e mede zero) se for
  // criado fora do toque. Ele nasce e é retomado no toque, e a gravação reaproveita o mesmo.
  var contextoAudio = null;
  function acordarContexto() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!contextoAudio || contextoAudio.state === "closed") contextoAudio = new AC();
    if (contextoAudio.state === "suspended" && contextoAudio.resume) contextoAudio.resume().catch(function () {});
    return contextoAudio;
  }
  var micBtn = null, conversaBtn = null;
  var SILENCIO_MS = 1100, MAX_GRAVACAO_MS = 120000, LIMIAR = 0.018;

  function T(pt, en) { return ctx.T(pt, en); }
  function assinante() { return acesso ? acesso === "livre" : !!ctx.semCota(); }
  // Antes de o servidor responder (acesso === null), não se assume demonstração esgotada: o toque passa
  // e o servidor decide; o selo só aparece depois da resposta.
  function podeOuvir() { return acesso === null || assinante() || demoRestante > 0; }
  function seloHtml() {
    if (acesso === null || assinante()) return "";
    return demoRestante > 0
      ? "<small class=\"selo-assinante selo-gratis\">" + T("Grátis", "Free") + "</small>"
      : "<small class=\"selo-assinante\">" + T("Assinantes", "Subscribers") + "</small>";
  }
  function endpoint() { return String(ctx.CFG.chatEndpoint || "").replace(/\/chat\/?$/, "/voz"); }
  function convite() {
    ctx.showNotice(T("Sua demonstração de voz acabou. A voz das respostas é exclusiva para assinantes. ", "Your voice demo is over. Spoken answers are for subscribers. ") +
      "<a href=\"" + ctx.planosUrl + "\">" + T("Ver planos", "See plans") + "</a>");
  }
  function svg(d) { return "<svg viewBox=\"0 0 20 20\" aria-hidden=\"true\"><path d=\"" + d + "\"/></svg>"; }
  var ICONE_FALA = "M3.5 8v4h3l4 3.5v-11l-4 3.5zM13.5 7a4 4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10";
  var ICONE_PARAR = "M6 6h8v8H6z";
  var ICONE_MIC = "M10 3a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 10 3zM5.5 9.5a4.5 4.5 0 0 0 9 0M10 14v3M7.5 17h5";
  var ICONE_CONVERSA = "M4 12V9a6 6 0 0 1 12 0v3M4 12h2.5v4H4zM13.5 12H16v4h-2.5z";

  // ---------------------------------------------------------------- tocar
  function wavMudo() {
    var n = 800, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), i = 0;
    function str(t) { for (var k = 0; k < t.length; k++) v.setUint8(i++, t.charCodeAt(k)); }
    str("RIFF"); v.setUint32(i, 36 + n * 2, true); i += 4; str("WAVEfmt "); v.setUint32(i, 16, true); i += 4;
    v.setUint16(i, 1, true); i += 2; v.setUint16(i, 1, true); i += 2; v.setUint32(i, 8000, true); i += 4;
    v.setUint32(i, 16000, true); i += 4; v.setUint16(i, 2, true); i += 2; v.setUint16(i, 16, true); i += 2;
    str("data"); v.setUint32(i, n * 2, true);
    return URL.createObjectURL(new Blob([b], { type: "audio/wav" }));
  }
  // Chamar SEMPRE dentro do toque (clique em "Ouvir", no microfone ou na conversa por voz).
  function liberarAudio() {
    acordarContexto();
    if (!player) { player = new Audio(); player.preload = "auto"; }
    if (liberado) return;
    var mudo = wavMudo();
    player.src = mudo;
    var p = player.play();
    if (p && p.then) p.then(function () { liberado = true; player.pause(); URL.revokeObjectURL(mudo); }, function () { URL.revokeObjectURL(mudo); });
  }
  // Cada parada (toque em Parar, nova gravação, conversa desligada) troca a geração: áudio que
  // chegar depois, de um pedido antigo, não toca.
  var geracao = 0;
  function pararFala() {
    geracao++;
    if (player) { player.pause(); player.removeAttribute("src"); player.load(); }
    if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null; }
    Array.prototype.forEach.call(document.querySelectorAll(".msg-ouvir.is-tocando, .msg-ouvir.is-carregando"), marcarParado);
  }
  function marcarParado(b) { b.classList.remove("is-tocando", "is-carregando"); b.innerHTML = svg(ICONE_FALA) + "<span>" + T("Ouvir", "Listen") + "</span>" + (ctx ? seloHtml() : ""); }
  function marcarTocando(b) { if (!b) return; b.classList.remove("is-carregando"); b.classList.add("is-tocando"); b.innerHTML = svg(ICONE_PARAR) + "<span>" + T("Parar", "Stop") + "</span>"; }

  // Pede ao servidor o MP3 de um texto. Erro sai com .message = código do servidor e .falhas.
  function buscarAudio(texto) {
    return ctx.sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) throw new Error("sem_sessao");
      return fetch(endpoint(), {
        method: "POST",
        headers: { "Authorization": "Bearer " + s.access_token, "apikey": ctx.CFG.key, "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto, idioma: ctx.EN ? "en" : "pt" })
      });
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || ("http_" + res.status)); e.status = res.status; e.falhas = j.falhas || []; throw e; });
      if (res.headers.get("X-Voz-Demo") === "1") { demoRestante = Number(res.headers.get("X-Voz-Restante")) || 0; atualizarPlano(); }
      return res.blob();
    });
  }

  // Toca um MP3 no player único (desbloqueado no toque) e resolve quando ele acaba.
  function tocarBlob(blob, botao) {
    if (!player) player = new Audio();
    if (urlAtual) URL.revokeObjectURL(urlAtual);
    urlAtual = URL.createObjectURL(blob);
    player.src = urlAtual;
    marcarTocando(botao);
    return new Promise(function (fim, falha) {
      player.onended = function () { fim(); };
      player.onerror = function () { fim(); };
      player.play().catch(function (e) {
        if (e && e.name === "NotAllowedError") {
          ctx.showNotice(T("O navegador pediu um toque para tocar o áudio: toque em Ouvir na resposta.", "The browser needs a tap to play audio: tap Listen on the answer."));
          var err = new Error("toque_necessario"); err.silencioso = true; falha(err); return;
        }
        fim();
      });
    });
  }

  function avisarErro(err) {
    var c = err && err.message;
    if (err && err.silencioso) { /* aviso já mostrado */ }
    else if (c === "voz_demo_esgotada" || c === "voz_so_assinantes") { demoRestante = 0; atualizarPlano(); convite(); }
    else if (c === "voz_limite_diario") ctx.showNotice(T("Você chegou ao limite diário de voz. Ela volta amanhã.", "You reached today's voice limit. It comes back tomorrow."));
    else if (c === "voz_nao_configurada") ctx.showNotice(T("A voz ainda não foi ligada no servidor.", "Voice isn't switched on on the server yet."));
    else ctx.showNotice(T("Não foi possível gerar a voz agora", "Couldn't generate the voice just now") +
      " (" + [c].concat(err && err.falhas && err.falhas.length ? err.falhas : []).filter(Boolean).join(" · ").replace(/[<>&]/g, "") + "). " +
      T("Tente de novo em instantes.", "Try again shortly."));
  }

  // Lê um texto inteiro (botão "Ouvir").
  function falar(texto, botao) {
    pararFala();
    if (!texto || !texto.trim()) return Promise.resolve();
    var g = geracao;
    if (botao) { botao.classList.add("is-carregando"); botao.innerHTML = svg(ICONE_PARAR) + "<span>" + T("Carregando…", "Loading…") + "</span>"; }
    return buscarAudio(texto).then(function (blob) {
      if (g === geracao) return tocarBlob(blob, botao);
    }).then(function () {
      if (g === geracao) pararFala();
    }, function (err) {
      if (botao) marcarParado(botao);
      avisarErro(err);
      throw err;
    });
  }

  // ---------------------------------------------------------------- conversa por voz: frase a frase
  // A resposta é falada enquanto chega: cada frase completa já vai virar áudio (os pedidos correm
  // em paralelo) e toca na ordem. Antes, a voz esperava a resposta inteira e o MP3 inteiro.
  var fila = null;
  var FIM_FRASE = /[.!?…:;](?=\s)/g;     // fim de frase seguido de espaço: a frase acabou de verdade
  var MIN_TRECHO = 25;                   // evita pedidos minúsculos ("Sim." vai junto com a próxima)

  function enfileirar(f, texto) {
    if (!texto || !texto.trim() || f.erro) return;   // depois de um erro, nada mais é pedido (nem cobrado)
    var audio = buscarAudio(texto);
    audio.catch(function () { /* tratado na cadeia, na vez dele */ });
    f.cadeia = f.cadeia.then(function () {
      if (f.geracao !== geracao || f.erro) return;
      return audio.then(function (blob) {
        if (f.geracao !== geracao || f.erro) return;
        return tocarBlob(blob, f.botao);
      });
    }).catch(function (err) {
      // Trecho sem nada para falar depois da limpeza (só símbolos, "---"): pula e segue.
      if (err && err.message === "texto_vazio") return;
      if (!f.erro) { f.erro = err; avisarErro(err); }
    });
  }

  // Chamado pelo chat a cada pedaço da resposta (texto acumulado até agora).
  function trecho(el, texto) {
    if (!conversa || !configurada || !podeOuvir() || !el) return;
    if (!fila || fila.el !== el) {
      pararFala();
      fila = { el: el, usado: 0, cadeia: Promise.resolve(), geracao: geracao, erro: null, semCortes: false, botao: null };
    }
    var f = fila;
    if (f.semCortes || f.erro || f.geracao !== geracao) return;
    // Bloco de código: o servidor tira o código da fala; cortar no meio dele confundiria isso.
    if (texto.indexOf("```") >= 0) { f.semCortes = true; return; }
    var resto = texto.slice(f.usado), corte = -1, m;
    FIM_FRASE.lastIndex = 0;
    while ((m = FIM_FRASE.exec(resto))) if (m.index + 1 >= MIN_TRECHO) corte = m.index + 1;
    if (corte > 0) { enfileirar(f, resto.slice(0, corte)); f.usado += corte; }
  }

  // ---------------------------------------------------------------- botão "Ouvir" em cada resposta
  function decorar(el) {
    if (!el || el.querySelector(".msg-ouvir")) return;
    var cab = el.querySelector(".msg-cab"); if (!cab) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "msg-ouvir" + (podeOuvir() ? "" : " is-bloqueado");
    b.title = T("Ouvir esta resposta (o texto vai a um serviço de voz para virar áudio)", "Listen to this answer (the text goes to a voice service to become audio)");
    marcarParado(b);
    b.addEventListener("click", function () {
      if (!podeOuvir()) { convite(); return; }
      liberarAudio();
      if (b.classList.contains("is-tocando") || b.classList.contains("is-carregando")) { pararFala(); return; }
      falar(el._texto || "", b).catch(function () {});
    });
    b.hidden = !configurada;
    cab.appendChild(b);
  }

  // Surpresa para quem chega: na primeira resposta, um convite para ouvir de graça (uma vez por aparelho).
  function mostrarDica(b) {
    if (!b || dicaMostrada || !configurada || assinante() || demoRestante <= 0 || b.hidden) return;
    try { if (localStorage.getItem("trustio-voz-dica")) { dicaMostrada = true; return; } localStorage.setItem("trustio-voz-dica", "1"); } catch (e) { /* sem storage */ }
    dicaMostrada = true;
    b.classList.add("is-destaque");
    var dica = document.createElement("span");
    dica.className = "voz-dica"; dica.setAttribute("role", "status");
    dica.textContent = T("Novo: ouça esta resposta em voz alta. Grátis para experimentar.", "New: hear this answer out loud. Free to try.");
    b.insertAdjacentElement("afterend", dica);
    setTimeout(function () { b.classList.remove("is-destaque"); dica.remove(); }, 9000);
  }

  // ---------------------------------------------------------------- microfone e conversa por voz
  function tipoGravacao() {
    var tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (var i = 0; i < tipos.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(tipos[i])) return tipos[i];
    return "";
  }
  function gravar() {
    if (gravador) { gravador.parar("toque"); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      ctx.showNotice(T("Este navegador não grava áudio aqui.", "This browser can't record audio here.")); sairConversa(); return;
    }
    pararFala();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var tipo = tipoGravacao(), partes = [], rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      var ac = acordarContexto(), analisador = null, fonte = null, ultimoSom = Date.now(), ouviuFala = false, timer = null, inicio = Date.now();
      if (ac) { analisador = ac.createAnalyser(); analisador.fftSize = 1024; fonte = ac.createMediaStreamSource(stream); fonte.connect(analisador); }
      var buf = analisador ? new Float32Array(analisador.fftSize) : null;
      function nivel() { analisador.getFloatTimeDomainData(buf); var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
      function vigiar() {
        if (!gravador) return;
        if (analisador) {
          var n = nivel(); if (n > pico) pico = n;
          if (n > LIMIAR) { ultimoSom = Date.now(); ouviuFala = true; }
          if (ouviuFala && Date.now() - ultimoSom > SILENCIO_MS) { gravador.parar("silencio"); return; }
        }
        if (Date.now() - inicio > MAX_GRAVACAO_MS) { gravador.parar("limite"); return; }
        timer = setTimeout(vigiar, 120);
      }
      var motivo = "silencio", pico = 0;
      gravador = { parar: function (m) { motivo = m || motivo; if (rec.state !== "inactive") rec.stop(); } };
      rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
      rec.onstop = function () {
        clearTimeout(timer); stream.getTracks().forEach(function (t) { t.stop(); }); if (fonte) fonte.disconnect();
        gravador = null; marcarMic(false);
        var mime = (rec.mimeType || tipo || "audio/webm").split(";")[0], ext = mime.indexOf("mp4") >= 0 ? "m4a" : mime.indexOf("ogg") >= 0 ? "ogg" : "webm";
        var blob = new Blob(partes, { type: mime });
        // Parada pelo toque ou pelo limite de tempo: envia o que foi gravado mesmo que o detector não tenha
        // marcado fala (no Safari ele pode medir baixo). Só o fim automático exige fala detectada.
        // Detector "morto" (Safari sem o AudioContext rodando, ou nada medido): aí não dá para saber se houve
        // fala e a gravação vai assim mesmo. Com o detector vivo e sem fala, não envia: o whisper inventa frases
        // em silêncio ("Obrigado.", créditos de legenda) e isso viraria uma pergunta falsa.
        var detectorMorto = !analisador || pico === 0 || !ac || ac.state !== "running";
        var temAudio = blob.size >= 2000;
        if (!temAudio || (!ouviuFala && (motivo === "silencio" || !detectorMorto))) {
          if (motivo === "toque") ctx.showNotice(T("Não ouvi sua voz. Fale um pouco mais perto do microfone e tente de novo.", "I didn't hear your voice. Speak a bit closer to the mic and try again."));
          if (conversa && motivo !== "toque") setTimeout(gravar, 400);
          return;
        }
        ctx.adicionarArquivos([new File([blob], "fala." + ext, { type: mime })]);
        // A transcrição vira a própria mensagem; na conversa por voz, resposta curta e rápida (Flash).
        var falhou = function () { sairConversa(); };      // o aviso do chat fica na tela; a conversa para
        ctx.enviar(ctx.input.value, conversa ? { fala: "conversa", modelo: "trustio-flash", aoFalhar: falhou } : { fala: "1", aoFalhar: falhou });
      };
      rec.start(250); marcarMic(true); vigiar();
    }).catch(function () {
      ctx.showNotice(T("Permita o microfone para esta página e tente de novo.", "Allow the microphone for this page and try again."));
      sairConversa();
    });
  }
  function marcarMic(on) {
    if (!micBtn) return;
    micBtn.classList.toggle("is-gravando", on);
    micBtn.setAttribute("aria-pressed", on ? "true" : "false");
    micBtn.title = on ? T("Parar e enviar", "Stop and send") : T("Falar (português)", "Speak");
  }
  function sairConversa() { conversa = false; if (conversaBtn) { conversaBtn.classList.remove("is-ativa"); conversaBtn.setAttribute("aria-pressed", "false"); } }
  function alternarConversa() {
    if (!podeOuvir()) { convite(); return; }
    liberarAudio();
    conversa = !conversa;
    conversaBtn.classList.toggle("is-ativa", conversa);
    conversaBtn.setAttribute("aria-pressed", conversa ? "true" : "false");
    if (conversa) {
      ctx.showNotice(T("Conversa por voz ligada: fale, e eu respondo em voz alta. Toque de novo para desligar.", "Voice conversation on: speak and I'll answer out loud. Tap again to turn it off."));
      if (!gravador && !ctx.ocupado()) gravar();
    } else { if (gravador) gravador.parar("toque"); pararFala(); }
  }

  // Uma resposta terminou de chegar: na conversa por voz, termina de ser lida e o microfone volta a ouvir.
  function respostaPronta(el) {
    decorar(el);
    mostrarDica(el.querySelector(".msg-ouvir"));   // só numa resposta nova, nunca no histórico
    var b = el.querySelector(".msg-ouvir"), f = fila && fila.el === el ? fila : null;
    if (f) {
      fila = null;
      if (f.geracao !== geracao) return;           // alguém parou a fala no meio: não recomeça
      f.botao = b; if (!f.erro) marcarTocando(b);
      enfileirar(f, (el._texto || "").slice(f.usado));
      f.cadeia.then(function () {
        if (f.geracao !== geracao) return;
        pararFala();
        if (f.erro) { sairConversa(); return; }
        if (conversa && !gravador) gravar();
      });
      return;
    }
    if (!conversa || !podeOuvir()) return;
    falar(el._texto || "", b).then(function () { if (conversa && !gravador) gravar(); }, function () { sairConversa(); });
  }

  function iniciar(opcoes) {
    ctx = opcoes;
    var row = document.querySelector(".composer-row"), enviarBtn = document.querySelector("[data-send]");
    if (!row || !enviarBtn) return;
    micBtn = document.createElement("button");
    micBtn.type = "button"; micBtn.className = "mic"; micBtn.setAttribute("aria-pressed", "false");
    micBtn.setAttribute("aria-label", T("Falar", "Speak")); micBtn.title = T("Falar (português)", "Speak");
    micBtn.innerHTML = svg(ICONE_MIC);
    micBtn.addEventListener("click", function () { if (ctx.ocupado()) return; liberarAudio(); gravar(); });
    conversaBtn = document.createElement("button");
    conversaBtn.type = "button"; conversaBtn.className = "conversa-voz";
    conversaBtn.setAttribute("aria-pressed", "false");
    conversaBtn.setAttribute("aria-label", T("Conversa por voz", "Voice conversation"));
    conversaBtn.title = T("Conversa por voz: você fala e eu respondo em voz alta", "Voice conversation: you speak and I answer out loud");
    conversaBtn.innerHTML = svg(ICONE_CONVERSA) + seloHtml();
    conversaBtn.hidden = true;                 // aparece quando o servidor confirmar que a voz está ligada
    conversaBtn.addEventListener("click", alternarConversa);
    row.insertBefore(micBtn, enviarBtn);
    row.insertBefore(conversaBtn, enviarBtn);
    verificarServidor();
  }

  // A voz só aparece se o servidor tiver a chave e a voz configuradas (o PR pode entrar antes dos segredos).
  function verificarServidor() {
    ctx.sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) return null;
      return fetch(endpoint(), { headers: { "Authorization": "Bearer " + s.access_token, "apikey": ctx.CFG.key } });
    }).then(function (res) { return res && res.ok ? res.json() : null; }).then(function (j) {
      configurada = !!(j && j.configurada);
      if (j && j.acesso) { acesso = j.acesso; demoRestante = Number(j.demo_restante) || 0; }
      aplicarConfigurada();
      atualizarPlano();
    }).catch(function () { configurada = false; aplicarConfigurada(); });
  }
  function aplicarConfigurada() {
    if (conversaBtn) conversaBtn.hidden = !configurada;
    Array.prototype.forEach.call(document.querySelectorAll(".msg-ouvir"), function (b) { b.hidden = !configurada; });
  }

  // O plano pode mudar depois de carregar (a conta chega depois do primeiro desenho): redesenha os selos.
  function atualizarPlano() {
    if (!ctx) return;
    var pode = podeOuvir();
    Array.prototype.forEach.call(document.querySelectorAll(".msg-ouvir, .conversa-voz"), function (b) {
      b.classList.toggle("is-bloqueado", !pode);
      var selo = b.querySelector(".selo-assinante");
      if (selo) selo.remove();
      b.insertAdjacentHTML("beforeend", seloHtml());
    });
  }

  window.TrustioVoz = { iniciar: iniciar, decorar: decorar, respostaPronta: respostaPronta, trecho: trecho, atualizarPlano: atualizarPlano, parar: pararFala };
})();
