/* assets/voz.js — voz no chat (17 out 2026).
   - Microfone: grava a fala e envia como áudio (a transcrição em português já existe no servidor).
   - "Ouvir": lê a resposta em voz alta (função de borda "voz", ElevenLabs). Só assinantes; quem está
     no teste vê o botão com o selo "Assinantes" e, ao tocar, o convite para os planos.
   - Conversa por voz (assinantes): fala → resposta lida em voz alta → volta a ouvir, sem tocar em nada.
     A gravação para sozinha depois de ~1,4 s de silêncio.
   O chat (assets/chat.js) chama TrustioVoz.iniciar(...) uma vez, decorar(el) em cada resposta e
   respostaPronta(el) quando uma resposta termina de chegar. */
(function () {
  "use strict";
  var ctx = null, audioAtual = null, urlAtual = null, conversa = false, gravador = null, falando = false;
  var micBtn = null, conversaBtn = null;
  var SILENCIO_MS = 1400, MAX_GRAVACAO_MS = 120000, LIMIAR = 0.018;

  function T(pt, en) { return ctx.T(pt, en); }
  function assinante() { return !!ctx.semCota(); }
  function endpoint() { return String(ctx.CFG.chatEndpoint || "").replace(/\/chat\/?$/, "/voz"); }
  function convite() {
    ctx.showNotice(T("A voz das respostas é exclusiva para assinantes. ", "Spoken answers are for subscribers. ") +
      "<a href=\"" + ctx.planosUrl + "\">" + T("Ver planos", "See plans") + "</a>");
  }
  function svg(d) { return "<svg viewBox=\"0 0 20 20\" aria-hidden=\"true\"><path d=\"" + d + "\"/></svg>"; }
  var ICONE_FALA = "M3.5 8v4h3l4 3.5v-11l-4 3.5zM13.5 7a4 4 0 0 1 0 6M15.5 5a7 7 0 0 1 0 10";
  var ICONE_PARAR = "M6 6h8v8H6z";
  var ICONE_MIC = "M10 3a2.5 2.5 0 0 0-2.5 2.5v4a2.5 2.5 0 0 0 5 0v-4A2.5 2.5 0 0 0 10 3zM5.5 9.5a4.5 4.5 0 0 0 9 0M10 14v3M7.5 17h5";
  var ICONE_CONVERSA = "M4 12V9a6 6 0 0 1 12 0v3M4 12h2.5v4H4zM13.5 12H16v4h-2.5z";

  // ---------------------------------------------------------------- tocar
  function pararFala() {
    if (audioAtual) { audioAtual.pause(); audioAtual.src = ""; audioAtual = null; }
    if (urlAtual) { URL.revokeObjectURL(urlAtual); urlAtual = null; }
    falando = false;
    Array.prototype.forEach.call(document.querySelectorAll(".msg-ouvir.is-tocando"), marcarParado);
  }
  function marcarParado(b) { b.classList.remove("is-tocando", "is-carregando"); b.innerHTML = svg(ICONE_FALA) + "<span>" + T("Ouvir", "Listen") + "</span>"; }

  function falar(texto, botao) {
    pararFala();
    if (!texto || !texto.trim()) return Promise.resolve();
    if (botao) { botao.classList.add("is-carregando"); botao.innerHTML = svg(ICONE_PARAR) + "<span>" + T("Carregando…", "Loading…") + "</span>"; }
    return ctx.sb.auth.getSession().then(function (r) {
      var s = r.data && r.data.session; if (!s) throw new Error("sem_sessao");
      return fetch(endpoint(), {
        method: "POST",
        headers: { "Authorization": "Bearer " + s.access_token, "apikey": ctx.CFG.key, "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto, idioma: ctx.EN ? "en" : "pt" })
      });
    }).then(function (res) {
      if (!res.ok) return res.json().catch(function () { return {}; }).then(function (j) { var e = new Error(j.error || "voz_indisponivel"); e.status = res.status; throw e; });
      return res.blob();
    }).then(function (blob) {
      urlAtual = URL.createObjectURL(blob);
      audioAtual = new Audio(urlAtual);
      falando = true;
      if (botao) { botao.classList.remove("is-carregando"); botao.classList.add("is-tocando"); botao.innerHTML = svg(ICONE_PARAR) + "<span>" + T("Parar", "Stop") + "</span>"; }
      return new Promise(function (fim) {
        audioAtual.onended = audioAtual.onerror = function () { pararFala(); fim(); };
        audioAtual.play().catch(function () { pararFala(); fim(); });
      });
    }).catch(function (err) {
      if (botao) marcarParado(botao);
      falando = false;
      var c = err && err.message;
      if (c === "voz_so_assinantes") convite();
      else if (c === "voz_limite_diario") ctx.showNotice(T("Você chegou ao limite diário de voz. Ela volta amanhã.", "You reached today's voice limit. It comes back tomorrow."));
      else if (c === "voz_nao_configurada") ctx.showNotice(T("A voz ainda não foi ligada no servidor.", "Voice isn't switched on on the server yet."));
      else ctx.showNotice(T("Não foi possível gerar a voz agora. Tente de novo em instantes.", "Couldn't generate the voice just now. Try again shortly."));
      throw err;
    });
  }

  // ---------------------------------------------------------------- botão "Ouvir" em cada resposta
  function decorar(el) {
    if (!el || el.querySelector(".msg-ouvir")) return;
    var cab = el.querySelector(".msg-cab"); if (!cab) return;
    var b = document.createElement("button");
    b.type = "button"; b.className = "msg-ouvir" + (assinante() ? "" : " is-bloqueado");
    b.title = assinante() ? T("Ouvir esta resposta (o texto é enviado à ElevenLabs para virar voz)", "Listen to this answer (the text is sent to ElevenLabs to become speech)")
                          : T("Recurso para assinantes", "For subscribers");
    marcarParado(b);
    if (!assinante()) b.insertAdjacentHTML("beforeend", "<small class=\"selo-assinante\">" + T("Assinantes", "Subscribers") + "</small>");
    b.addEventListener("click", function () {
      if (!assinante()) { convite(); return; }
      if (b.classList.contains("is-tocando") || b.classList.contains("is-carregando")) { pararFala(); return; }
      falar(el._texto || "", b).catch(function () {});
    });
    cab.appendChild(b);
  }

  // ---------------------------------------------------------------- microfone e conversa por voz
  function tipoGravacao() {
    var tipos = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (var i = 0; i < tipos.length; i++) if (window.MediaRecorder && MediaRecorder.isTypeSupported(tipos[i])) return tipos[i];
    return "";
  }
  function gravar() {
    if (gravador) { gravador.parar(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      ctx.showNotice(T("Este navegador não grava áudio aqui.", "This browser can't record audio here.")); sairConversa(); return;
    }
    pararFala();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var tipo = tipoGravacao(), partes = [], rec = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined);
      var ac = window.AudioContext ? new AudioContext() : null, analisador = null, ultimoSom = Date.now(), ouviuFala = false, timer = null, inicio = Date.now();
      if (ac) { analisador = ac.createAnalyser(); analisador.fftSize = 1024; ac.createMediaStreamSource(stream).connect(analisador); }
      var buf = analisador ? new Float32Array(analisador.fftSize) : null;
      function nivel() { analisador.getFloatTimeDomainData(buf); var s = 0; for (var i = 0; i < buf.length; i++) s += buf[i] * buf[i]; return Math.sqrt(s / buf.length); }
      function vigiar() {
        if (!gravador) return;
        if (analisador) {
          if (nivel() > LIMIAR) { ultimoSom = Date.now(); ouviuFala = true; }
          if (ouviuFala && Date.now() - ultimoSom > SILENCIO_MS) { gravador.parar(); return; }
        }
        if (Date.now() - inicio > MAX_GRAVACAO_MS) { gravador.parar(); return; }
        timer = setTimeout(vigiar, 120);
      }
      gravador = { parar: function () { if (rec.state !== "inactive") rec.stop(); } };
      rec.ondataavailable = function (e) { if (e.data && e.data.size) partes.push(e.data); };
      rec.onstop = function () {
        clearTimeout(timer); stream.getTracks().forEach(function (t) { t.stop(); }); if (ac) ac.close();
        gravador = null; marcarMic(false);
        var mime = (rec.mimeType || tipo || "audio/webm").split(";")[0], ext = mime.indexOf("mp4") >= 0 ? "m4a" : mime.indexOf("ogg") >= 0 ? "ogg" : "webm";
        var blob = new Blob(partes, { type: mime });
        if (!ouviuFala || blob.size < 2000) { if (conversa) setTimeout(gravar, 400); return; }
        ctx.adicionarArquivos([new File([blob], "fala." + ext, { type: mime })]);
        ctx.enviar(ctx.input.value);
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
    if (!assinante()) { convite(); return; }
    conversa = !conversa;
    conversaBtn.classList.toggle("is-ativa", conversa);
    conversaBtn.setAttribute("aria-pressed", conversa ? "true" : "false");
    if (conversa) {
      ctx.showNotice(T("Conversa por voz ligada: fale, e eu respondo em voz alta. Toque de novo para desligar.", "Voice conversation on: speak and I'll answer out loud. Tap again to turn it off."));
      if (!gravador && !ctx.ocupado()) gravar();
    } else { if (gravador) gravador.parar(); pararFala(); }
  }

  // Uma resposta terminou de chegar: na conversa por voz, ela é lida e o microfone volta a ouvir.
  function respostaPronta(el) {
    decorar(el);
    if (!conversa || !assinante()) return;
    var b = el.querySelector(".msg-ouvir");
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
    micBtn.addEventListener("click", function () { if (ctx.ocupado()) return; gravar(); });
    conversaBtn = document.createElement("button");
    conversaBtn.type = "button"; conversaBtn.className = "conversa-voz" + (assinante() ? "" : " is-bloqueado");
    conversaBtn.setAttribute("aria-pressed", "false");
    conversaBtn.setAttribute("aria-label", T("Conversa por voz", "Voice conversation"));
    conversaBtn.title = assinante() ? T("Conversa por voz: falo e respondo em voz alta", "Voice conversation: I listen and answer out loud")
                                    : T("Conversa por voz · recurso para assinantes", "Voice conversation · for subscribers");
    conversaBtn.innerHTML = svg(ICONE_CONVERSA) + (assinante() ? "" : "<small class=\"selo-assinante\">" + T("Assinantes", "Subscribers") + "</small>");
    conversaBtn.addEventListener("click", alternarConversa);
    row.insertBefore(micBtn, enviarBtn);
    row.insertBefore(conversaBtn, enviarBtn);
  }

  // O plano pode mudar depois de carregar (a conta chega depois do primeiro desenho): redesenha os selos.
  function atualizarPlano() {
    if (!ctx) return;
    var livre = assinante();
    Array.prototype.forEach.call(document.querySelectorAll(".msg-ouvir, .conversa-voz"), function (b) {
      b.classList.toggle("is-bloqueado", !livre);
      var selo = b.querySelector(".selo-assinante");
      if (livre && selo) selo.remove();
      if (!livre && !selo) b.insertAdjacentHTML("beforeend", "<small class=\"selo-assinante\">" + T("Assinantes", "Subscribers") + "</small>");
    });
  }

  window.TrustioVoz = { iniciar: iniciar, decorar: decorar, respostaPronta: respostaPronta, atualizarPlano: atualizarPlano, parar: pararFala };
})();
