/* assets/voz-tempo-real.js — voz ao vivo no chat (28 out 2026).
   Conversa falada em tempo real com a xAI (grok-voice), em português do Brasil, pelo relé do worker:
   navegador ⇄ wss://api.trustio.com.br/voz/tempo-real ⇄ wss://api.x.ai/v1/realtime.
   - Só para assinantes: o botão aparece quando GET /voz/tempo-real diz "disponivel"; no teste ele
     aparece com o selo "Assinantes" e o toque mostra os planos.
   - Latência: microfone, áudio e conexão começam juntos no toque; o áudio dito antes da conexão
     abrir fica guardado e segue depois; blocos de 20 ms; a resposta toca bloco a bloco enquanto chega,
     sem esperar o fim; se a pessoa fala por cima, a resposta para na hora.
   O chat (assets/chat.js) chama TrustioVozTempoReal.iniciar(...) uma vez, com o mesmo contexto da voz. */
(function () {
  "use strict";
  var API = "https://api.trustio.com.br/voz/tempo-real";
  var WS = "wss://api.trustio.com.br/voz/tempo-real";
  var TAXAS = [8000, 16000, 22050, 24000, 32000, 44100, 48000];
  // O módulo do AudioWorklet fica ao lado deste arquivo.
  var CAPTURA = new URL("voz-tempo-real-captura.js", (document.currentScript || {}).src || location.href).href;
  var ctx = null, botao = null, situacao = null;
  var sessao = null;   // a conversa aberta (uma por vez)

  function T(pt, en) { return ctx.T(pt, en); }
  function el(tag, cls, texto) { var e = document.createElement(tag); if (cls) e.className = cls; if (texto) e.textContent = texto; return e; }
  function token() {
    return ctx.sb.auth.getSession().then(function (r) { var s = r.data && r.data.session; return s ? s.access_token : null; });
  }

  var MOTIVOS = {
    limite: ["O tempo desta conversa acabou.", "This conversation's time is up."],
    voz_tempo_real_limite: ["Você usou toda a voz ao vivo de hoje. Amanhã tem de novo.", "You've used all of today's live voice. It resets tomorrow."],
    voz_tempo_real_assinantes: ["A voz ao vivo é para assinantes.", "Live voice is for subscribers."],
    inativo: ["Conversa encerrada por silêncio.", "Conversation ended after silence."],
    xai: ["A conexão com a voz caiu. Tente de novo.", "The voice connection dropped. Try again."],
    nao_autorizado: ["Entre de novo na sua conta para usar a voz ao vivo.", "Sign in again to use live voice."],
    email_nao_confirmado: ["Confirme seu e-mail para usar a voz ao vivo.", "Confirm your e-mail to use live voice."],
    nao_configurada: ["A voz ao vivo ainda não está ligada.", "Live voice isn't on yet."],
  };
  function motivo(m) { var t = MOTIVOS[m]; return t ? T(t[0], t[1]) : T("A voz ao vivo não está disponível agora.", "Live voice isn't available right now."); }

  // ---- situação (mostra ou esconde o botão)
  function verificar() {
    token().then(function (t) {
      if (!t) return null;
      return fetch(API, { headers: { Authorization: "Bearer " + t } }).then(function (r) { return r.ok ? r.json() : null; });
    }).then(function (j) { situacao = j; aplicar(); }).catch(function () { situacao = null; aplicar(); });
  }
  function aplicar() {
    if (!botao) return;
    var teste = situacao && situacao.acesso === "teste";
    botao.hidden = !(situacao && (situacao.disponivel || teste));
    botao.classList.toggle("is-bloqueado", !!teste);
    var selo = botao.querySelector(".selo-assinante");
    if (selo) selo.remove();
    if (teste) botao.insertAdjacentHTML("beforeend", "<small class=\"selo-assinante\">" + T("Assinantes", "Subscribers") + "</small>");
  }

  // ---- painel
  function montarPainel() {
    var fundo = el("div", "tr-fundo");
    var painel = el("div", "tr-painel");
    painel.setAttribute("role", "dialog");
    painel.setAttribute("aria-modal", "true");
    painel.setAttribute("aria-label", T("Voz ao vivo", "Live voice"));
    var topo = el("div", "tr-topo");
    topo.appendChild(el("b", "tr-titulo", T("Voz ao vivo", "Live voice")));
    var tempo = el("span", "tr-tempo");
    topo.appendChild(tempo);
    var orbe = el("div", "tr-orbe");
    orbe.setAttribute("aria-hidden", "true");
    var estado = el("p", "tr-estado", T("Conectando…", "Connecting…"));
    estado.setAttribute("role", "status");
    var falas = el("div", "tr-falas");
    falas.setAttribute("aria-live", "polite");
    var acoes = el("div", "tr-acoes");
    var mudo = el("button", "tr-btn-mudo", T("Silenciar", "Mute"));
    mudo.type = "button";
    mudo.setAttribute("aria-pressed", "false");
    var sair = el("button", "tr-btn-sair", T("Encerrar", "End"));
    sair.type = "button";
    acoes.appendChild(mudo);
    acoes.appendChild(sair);
    var nota = el("p", "tr-nota", T("Voz gerada pela xAI (EUA). Use fones para a conversa fluir melhor.",
      "Voice by xAI (US). Headphones help the conversation flow."));
    [topo, orbe, estado, falas, acoes, nota].forEach(function (x) { painel.appendChild(x); });
    fundo.appendChild(painel);
    document.body.appendChild(fundo);
    return { fundo: fundo, orbe: orbe, estado: estado, falas: falas, mudo: mudo, sair: sair, tempo: tempo };
  }
  function falaDe(s, quem) {
    var linha = el("p", "tr-fala tr-fala-" + quem);
    s.ui.falas.appendChild(linha);
    s.ui.falas.scrollTop = s.ui.falas.scrollHeight;
    return linha;
  }
  function mostrarEstado(s, texto, modo) {
    s.ui.estado.textContent = texto;
    s.ui.orbe.setAttribute("data-modo", modo || "");
  }

  // ---- áudio que chega: PCM16 agendado sem lacunas no relógio do AudioContext
  function tocar(s, buf) {
    var pcm = new Int16Array(buf, 0, buf.byteLength >> 1);
    if (!pcm.length) return;
    var f = new Float32Array(pcm.length);
    for (var i = 0; i < pcm.length; i++) f[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff);
    var b = s.audio.createBuffer(1, f.length, s.taxa);
    b.getChannelData(0).set(f);
    var fonte = s.audio.createBufferSource();
    fonte.buffer = b;
    fonte.connect(s.audio.destination);
    var agora = s.audio.currentTime;
    // 40 ms de folga só no primeiro bloco de uma resposta: absorve a variação da rede sem atraso perceptível
    if (s.proximo < agora) s.proximo = agora + 0.04;
    fonte.start(s.proximo);
    s.proximo += b.duration;
    s.fontes.push(fonte);
    fonte.onended = function () {
      var k = s.fontes.indexOf(fonte);
      if (k >= 0) s.fontes.splice(k, 1);
      if (!s.fontes.length && !s.encerrada) mostrarEstado(s, T("Ouvindo…", "Listening…"), "ouvindo");
    };
    mostrarEstado(s, T("Falando…", "Speaking…"), "falando");
  }
  function calar(s) {
    s.fontes.forEach(function (f) { try { f.onended = null; f.stop(); } catch (e) { /* já parou */ } });
    s.fontes = [];
    s.proximo = 0;
  }

  function aoEvento(s, ev) {
    switch (ev.type) {
      case "trustio.pronto":
        s.fimEm = Date.now() + ev.segundos * 1000;
        mostrarEstado(s, T("Ouvindo…", "Listening…"), "ouvindo");
        break;
      case "input_audio_buffer.speech_started":
        calar(s);   // a pessoa falou por cima: a resposta para na hora (a xAI corta do lado dela)
        s.linhaIa = null;
        mostrarEstado(s, T("Ouvindo você…", "Listening to you…"), "voce");
        break;
      case "input_audio_buffer.speech_stopped":
        mostrarEstado(s, T("Pensando…", "Thinking…"), "pensando");
        break;
      case "conversation.item.input_audio_transcription.completed":
        if (ev.transcript) falaDe(s, "voce").textContent = ev.transcript;
        break;
      case "response.output_audio_transcript.delta":
        if (!s.linhaIa) s.linhaIa = falaDe(s, "ia");
        s.linhaIa.textContent += ev.delta || "";
        s.ui.falas.scrollTop = s.ui.falas.scrollHeight;
        break;
      case "response.done":
        s.linhaIa = null;
        break;
      case "error":
        console.warn("voz ao vivo:", ev.error && ev.error.message);
        break;
      case "trustio.fim":
        s.motivo = ev.motivo;
        break;
    }
  }

  // ---- abrir e fechar
  function abrir() {
    if (sessao) return;
    if (situacao && situacao.acesso === "teste") { location.href = ctx.planosUrl; return; }
    if (window.TrustioVoz && window.TrustioVoz.parar) window.TrustioVoz.parar();
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || !window.AudioWorkletNode || !navigator.mediaDevices) {
      ctx.showNotice(T("Seu navegador não tem a voz ao vivo. Use o Chrome, o Edge ou o Safari atualizados.",
        "Your browser doesn't support live voice. Use an up-to-date Chrome, Edge or Safari."));
      return;
    }
    // Tudo nasce no toque (o Safari só libera o áudio dentro do gesto) e começa ao mesmo tempo.
    var audio = new AC();
    if (TAXAS.indexOf(audio.sampleRate) < 0) { audio.close(); audio = new AC({ sampleRate: 48000 }); }
    if (audio.state === "suspended") audio.resume().catch(function () {});
    var s = sessao = { audio: audio, taxa: audio.sampleRate, fontes: [], proximo: 0, guardado: [], mudo: false,
      encerrada: false, ws: null, stream: null, no: null, linhaIa: null, motivo: null, fimEm: 0, ui: montarPainel() };
    s.ui.sair.addEventListener("click", function () { fechar(s); });
    s.ui.mudo.addEventListener("click", function () {
      s.mudo = !s.mudo;
      s.ui.mudo.setAttribute("aria-pressed", String(s.mudo));
      s.ui.mudo.textContent = s.mudo ? T("Ativar mic", "Unmute") : T("Silenciar", "Mute");
    });
    s.tecla = function (e) { if (e.key === "Escape") fechar(s); };
    document.addEventListener("keydown", s.tecla);
    s.relogio = setInterval(function () {
      if (!s.fimEm) return;
      var r = Math.max(0, Math.round((s.fimEm - Date.now()) / 1000));
      s.ui.tempo.textContent = Math.floor(r / 60) + ":" + String(r % 60).padStart(2, "0");
    }, 1000);
    s.ui.sair.focus();

    var mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    var modulo = audio.audioWorklet.addModule(CAPTURA);
    Promise.all([mic, modulo]).then(function (r) {
      if (s.encerrada) { r[0].getTracks().forEach(function (t) { t.stop(); }); return; }
      s.stream = r[0];
      var fonte = audio.createMediaStreamSource(s.stream);
      s.no = new AudioWorkletNode(audio, "captura-trustio");
      s.no.port.onmessage = function (e) {
        if (s.encerrada || s.mudo) return;
        s.ui.orbe.style.setProperty("--nivel", String(Math.min(1, e.data.nivel * 6)));
        if (s.ws && s.ws.readyState === 1) s.ws.send(e.data.pcm);
        else if (s.guardado.length < 400) s.guardado.push(e.data.pcm);
      };
      fonte.connect(s.no);
    }).catch(function (e) {
      s.motivo = e && e.name === "NotAllowedError" ? "mic" : "mic_erro";
      fechar(s, e && e.name === "NotAllowedError"
        ? T("Libere o microfone para conversar por voz.", "Allow the microphone to talk by voice.")
        : T("Não deu para usar o microfone.", "Couldn't use the microphone."));
    });

    token().then(function (t) {
      if (s.encerrada) return;
      if (!t) { fechar(s, motivo("nao_autorizado")); return; }
      var ws = s.ws = new WebSocket(WS + "?taxa=" + s.taxa, ["trustio", "jwt." + t]);
      ws.binaryType = "arraybuffer";
      ws.onopen = function () {
        s.guardado.forEach(function (b) { ws.send(b); });
        s.guardado = [];
      };
      ws.onmessage = function (e) {
        if (typeof e.data !== "string") { tocar(s, e.data); return; }
        try { aoEvento(s, JSON.parse(e.data)); } catch (err) { /* evento que não é JSON */ }
      };
      ws.onclose = function () { if (!s.encerrada) fechar(s, s.motivo && s.motivo !== "navegador" ? motivo(s.motivo) : null); };
    });
  }

  function fechar(s, aviso) {
    if (s.encerrada) return;
    s.encerrada = true;
    calar(s);
    clearInterval(s.relogio);
    document.removeEventListener("keydown", s.tecla);
    if (s.no) { s.no.port.onmessage = null; try { s.no.disconnect(); } catch (e) { /* */ } }
    if (s.stream) s.stream.getTracks().forEach(function (t) { t.stop(); });
    if (s.ws && s.ws.readyState <= 1) try { s.ws.close(1000, "fim"); } catch (e) { /* */ }
    s.audio.close().catch(function () {});
    s.ui.fundo.remove();
    if (sessao === s) sessao = null;
    if (botao) botao.focus();
    if (aviso) ctx.showNotice(aviso);
    verificar();   // atualiza o tempo que resta hoje
  }

  function iniciar(c) {
    ctx = c;
    var row = document.querySelector(".composer-row");
    var enviar = row && row.querySelector("[data-send]");
    if (!row || !enviar) return;
    botao = el("button", "tr-abrir");
    botao.type = "button";
    botao.hidden = true;
    botao.setAttribute("aria-label", T("Voz ao vivo: conversar falando, em tempo real", "Live voice: talk in real time"));
    botao.title = T("Voz ao vivo", "Live voice");
    botao.innerHTML = "<svg viewBox=\"0 0 20 20\" aria-hidden=\"true\"><path d=\"M3 10h1.5M6.5 6.5v7M10 3.5v13M13.5 6.5v7M16.5 10H17\"/></svg>";
    botao.addEventListener("click", abrir);
    row.insertBefore(botao, enviar);
    verificar();
  }

  window.TrustioVozTempoReal = { iniciar: iniciar, abrir: abrir };
})();
