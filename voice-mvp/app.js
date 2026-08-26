const loginView = document.querySelector("#login-view");
const demoView = document.querySelector("#demo-view");
const loginForm = document.querySelector("#login-form");
const accessCodeInput = document.querySelector("#access-code");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const talkButton = document.querySelector("#talk-button");
const talkLabel = document.querySelector("#talk-label");
const endButton = document.querySelector("#end-button");
const clearButton = document.querySelector("#clear-button");
const orb = document.querySelector("#orb");
const statusTitle = document.querySelector("#status-title");
const statusDetail = document.querySelector("#status-detail");
const transcript = document.querySelector("#transcript");
const messageForm = document.querySelector("#message-form");
const messageInput = document.querySelector("#message-input");
const timer = document.querySelector("#timer");
const scenarioButtons = document.querySelectorAll(".scenario-button");

const DEMO_SECONDS = 10 * 60;
const EARLY_AUDIO_LIMIT = 10;

let credential = null;
let credentialPromise = null;
let socket = null;
let socketPromise = null;
let audioContext = null;
let mediaStream = null;
let captureSource = null;
let captureNode = null;
let earlyAudio = [];
let micMuted = false;
let acceptAudio = true;
let activeSources = new Set();
let nextPlaybackTime = 0;
let currentAssistantText = null;
let currentUserText = null;
let sessionStartedAt = null;
let timerHandle = null;

function setStatus(state, title, detail) {
  orb.dataset.state = state;
  statusTitle.textContent = title;
  statusDetail.textContent = detail;
}

function showLogin() {
  loginView.hidden = false;
  demoView.hidden = true;
  accessCodeInput.focus();
}

function showDemo() {
  loginView.hidden = true;
  demoView.hidden = false;
  loginError.hidden = true;
  prefetchCredential();
}

async function checkAuth() {
  try {
    const response = await fetch("/api/auth", { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.authenticated) showDemo();
    else showLogin();
  } catch {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.hidden = true;

  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: accessCodeInput.value }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    loginError.textContent = data.error || "Não foi possível liberar o acesso.";
    loginError.hidden = false;
    return;
  }

  accessCodeInput.value = "";
  showDemo();
});

logoutButton.addEventListener("click", async () => {
  endSession();
  await fetch("/api/auth", { method: "DELETE" }).catch(() => {});
  credential = null;
  showLogin();
});

function credentialStillValid() {
  if (!credential?.token || !credential?.expiresAt) return false;
  return credential.expiresAt - Math.floor(Date.now() / 1000) > 30;
}

async function getCredential() {
  if (credentialStillValid()) return credential;
  if (credentialPromise) return credentialPromise;

  credentialPromise = fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar a sessão.");
      credential = data;
      return data;
    })
    .finally(() => {
      credentialPromise = null;
    });

  return credentialPromise;
}

function prefetchCredential() {
  getCredential().catch(() => {
    setStatus("idle", "Pronto para testar", "A sessão será preparada quando você iniciar a conversa.");
  });
}

async function ensureAudioContext() {
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    nextPlaybackTime = audioContext.currentTime;
  }
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext;
}

async function startMicCapture() {
  if (captureNode && mediaStream) {
    setMicMuted(false);
    return;
  }

  await ensureAudioContext();

  const streamPromise = navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const modulePromise = audioContext.audioWorklet.addModule("/capture-worklet.js");
  const [stream] = await Promise.all([streamPromise, modulePromise]);

  mediaStream = stream;
  captureSource = audioContext.createMediaStreamSource(stream);
  captureNode = new AudioWorkletNode(audioContext, "pcm-capture", {
    numberOfInputs: 1,
    numberOfOutputs: 0,
  });

  captureNode.port.onmessage = ({ data }) => {
    if (data?.type !== "audio" || !data.pcm) return;

    const level = Math.min(1, Math.max(0, Number(data.level || 0) * 5));
    if (orb.dataset.state === "listening") {
      orb.style.setProperty("--voice-level", String(level));
    }

    if (micMuted) return;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(data.pcm);
    } else {
      earlyAudio.push(data.pcm);
      if (earlyAudio.length > EARLY_AUDIO_LIMIT) earlyAudio.shift();
    }
  };

  captureSource.connect(captureNode);
  setMicMuted(false);
}

function stopMicCapture() {
  if (captureNode) {
    captureNode.port.onmessage = null;
    captureNode.disconnect();
    captureNode = null;
  }
  if (captureSource) {
    captureSource.disconnect();
    captureSource = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  earlyAudio = [];
  micMuted = false;
  talkLabel.textContent = socket?.readyState === WebSocket.OPEN ? "Ativar microfone" : "Iniciar conversa";
}

function setMicMuted(value) {
  micMuted = value;
  mediaStream?.getAudioTracks().forEach((track) => {
    track.enabled = !value;
  });

  if (mediaStream) {
    talkLabel.textContent = value ? "Reativar microfone" : "Microfone ativo";
  }
}

function toggleMic() {
  if (!mediaStream) return startMicCapture();
  setMicMuted(!micMuted);
  setStatus(
    micMuted ? "idle" : "listening",
    micMuted ? "Microfone pausado" : "Ouvindo...",
    micMuted ? "Toque para reativar." : "Fale normalmente. Você pode interromper o agente a qualquer momento.",
  );
}

function openSocket(session) {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (socketPromise) return socketPromise;

  socketPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(session.wsUrl, [`xai-client-secret.${session.token}`]);
    ws.binaryType = "arraybuffer";
    socket = ws;

    const timeout = window.setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error("Tempo limite ao conectar ao agente."));
    }, 9000);

    ws.addEventListener("open", () => {
      window.clearTimeout(timeout);

      ws.send(JSON.stringify({
        type: "session.update",
        session: {
          audio: {
            input: {
              format: { type: "audio/pcm", rate: 24000 },
              transport: "binary",
              transcription: { language_hint: "pt-BR" },
            },
            output: {
              format: { type: "audio/pcm", rate: 24000 },
              transport: "binary",
            },
          },
        },
      }));

      for (const chunk of earlyAudio) ws.send(chunk);
      earlyAudio = [];

      beginTimer();
      endButton.disabled = false;
      setStatus(
        mediaStream ? "listening" : "idle",
        mediaStream ? "Ouvindo..." : "Agente conectado",
        mediaStream ? "Fale normalmente. A resposta será reproduzida em streaming." : "Digite uma mensagem ou ative o microfone.",
      );
      talkLabel.textContent = mediaStream ? "Microfone ativo" : "Ativar microfone";
      resolve(ws);
    }, { once: true });

    ws.addEventListener("message", handleSocketMessage);

    ws.addEventListener("close", () => {
      if (socket === ws) socket = null;
      socketPromise = null;
      stopPlayback();
      stopTimer();
      endButton.disabled = true;
      if (!demoView.hidden) {
        setStatus("idle", "Sessão encerrada", "Inicie uma nova conversa quando quiser.");
        talkLabel.textContent = "Iniciar conversa";
      }
    });

    ws.addEventListener("error", () => {
      window.clearTimeout(timeout);
      reject(new Error("Falha na conexão em tempo real."));
    }, { once: true });
  }).finally(() => {
    socketPromise = null;
  });

  return socketPromise;
}

async function ensureConnection(withMic = false) {
  setStatus("connecting", "Conectando...", "Preparando áudio e sessão em paralelo para reduzir a latência.");

  const sessionPromise = getCredential();
  const micPromise = withMic ? startMicCapture() : Promise.resolve();

  const session = await sessionPromise;
  const wsPromise = openSocket(session);
  await Promise.all([wsPromise, micPromise]);

  if (withMic) {
    setStatus("listening", "Ouvindo...", "Fale normalmente. Você pode interromper o agente a qualquer momento.");
    talkLabel.textContent = "Microfone ativo";
  }

  return socket;
}

function handleSocketMessage(event) {
  if (event.data instanceof ArrayBuffer) {
    if (acceptAudio) enqueuePcm(event.data);
    return;
  }

  if (event.data instanceof Blob) {
    if (acceptAudio) event.data.arrayBuffer().then(enqueuePcm);
    return;
  }

  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }

  switch (data.type) {
    case "input_audio_buffer.speech_started":
      acceptAudio = false;
      currentUserText = null;
      stopPlayback();
      setStatus("listening", "Ouvindo...", "Pode continuar. O agente foi interrompido automaticamente.");
      break;

    case "input_audio_buffer.speech_stopped":
      setStatus("thinking", "Processando...", "O agente está preparando a resposta.");
      break;

    case "conversation.item.input_audio_transcription.updated":
      updateUserTranscript(data.transcript || data.text || "");
      break;

    case "conversation.item.input_audio_transcription.completed":
      updateUserTranscript(data.transcript || data.text || "");
      currentUserText = null;
      break;

    case "response.created":
      acceptAudio = true;
      currentAssistantText = null;
      setStatus("thinking", "Respondendo...", "O primeiro áudio será reproduzido assim que chegar.");
      break;

    case "response.output_audio_transcript.delta":
      appendAssistantTranscript(data.delta || "");
      setStatus("speaking", "Agente falando", "Você pode interromper falando normalmente.");
      break;

    case "response.output_audio_transcript.done":
      currentAssistantText = null;
      break;

    case "response.done":
      acceptAudio = true;
      setStatus(
        mediaStream && !micMuted ? "listening" : "idle",
        mediaStream && !micMuted ? "Ouvindo..." : "Pronto",
        mediaStream && !micMuted ? "Pode fazer a próxima pergunta." : "Digite uma mensagem ou ative o microfone.",
      );
      break;

    case "error":
      console.error("xAI realtime error", data);
      setStatus("idle", "Algo não saiu como esperado", data.error?.message || "Tente novamente.");
      break;

    default:
      break;
  }
}

async function enqueuePcm(arrayBuffer) {
  if (!acceptAudio || !arrayBuffer?.byteLength) return;
  await ensureAudioContext();

  const pcm = new Int16Array(arrayBuffer);
  const samples = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i += 1) {
    samples[i] = pcm[i] / (pcm[i] < 0 ? 32768 : 32767);
  }

  const buffer = audioContext.createBuffer(1, samples.length, 24000);
  buffer.copyToChannel(samples, 0);

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(audioContext.destination);

  const startAt = Math.max(audioContext.currentTime + 0.012, nextPlaybackTime);
  nextPlaybackTime = startAt + buffer.duration;
  activeSources.add(source);
  source.onended = () => activeSources.delete(source);
  source.start(startAt);
}

function stopPlayback() {
  activeSources.forEach((source) => {
    try { source.stop(); } catch {}
  });
  activeSources.clear();
  if (audioContext) nextPlaybackTime = audioContext.currentTime;
}

function transcriptContainer() {
  const empty = transcript.querySelector(".empty-transcript");
  if (empty) empty.remove();
  return transcript;
}

function createTurn(role, text = "") {
  const wrapper = document.createElement("div");
  wrapper.className = `turn turn-${role}`;

  const label = document.createElement("span");
  label.className = "turn-label";
  label.textContent = role === "user" ? "Você" : "Agente";

  const paragraph = document.createElement("p");
  paragraph.className = "turn-text";
  paragraph.textContent = text;

  wrapper.append(label, paragraph);
  transcriptContainer().append(wrapper);
  transcript.scrollTop = transcript.scrollHeight;
  return paragraph;
}

function updateUserTranscript(text) {
  if (!text) return;
  if (!currentUserText) currentUserText = createTurn("user", text);
  else currentUserText.textContent = text;
  transcript.scrollTop = transcript.scrollHeight;
}

function appendAssistantTranscript(delta) {
  if (!delta) return;
  if (!currentAssistantText) currentAssistantText = createTurn("assistant", "");
  currentAssistantText.textContent += delta;
  transcript.scrollTop = transcript.scrollHeight;
}

async function sendText(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return;

  await ensureAudioContext();
  const ws = await ensureConnection(false);
  createTurn("user", trimmed);
  currentUserText = null;

  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: trimmed }],
    },
  }));
  ws.send(JSON.stringify({ type: "response.create" }));
  setStatus("thinking", "Processando...", "O agente está preparando a resposta.");
}

messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value;
  if (!text.trim()) return;
  messageInput.value = "";
  try {
    await sendText(text);
  } catch (error) {
    setStatus("idle", "Não foi possível enviar", error.message || "Tente novamente.");
  }
});

scenarioButtons.forEach((button) => {
  button.addEventListener("click", () => {
    messageInput.value = button.dataset.prompt || "";
    messageInput.focus();
  });
});

talkButton.addEventListener("click", async () => {
  try {
    if (socket?.readyState === WebSocket.OPEN) {
      await toggleMic();
      return;
    }
    await ensureConnection(true);
  } catch (error) {
    stopMicCapture();
    setStatus("idle", "Não foi possível iniciar", error.message || "Verifique o microfone e tente novamente.");
  }
});

endButton.addEventListener("click", () => endSession());

clearButton.addEventListener("click", () => {
  transcript.innerHTML = '<p class="empty-transcript">A transcrição aparecerá aqui durante o teste.</p>';
  currentAssistantText = null;
  currentUserText = null;
});

function beginTimer() {
  if (sessionStartedAt) return;
  sessionStartedAt = Date.now();
  updateTimer();
  timerHandle = window.setInterval(updateTimer, 1000);
}

function updateTimer() {
  if (!sessionStartedAt) {
    timer.textContent = "10:00";
    return;
  }

  const elapsed = Math.floor((Date.now() - sessionStartedAt) / 1000);
  const remaining = Math.max(0, DEMO_SECONDS - elapsed);
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (remaining === 0) {
    endSession();
    setStatus("idle", "Tempo da demonstração concluído", "Você pode iniciar uma nova sessão.");
  }
}

function stopTimer() {
  if (timerHandle) window.clearInterval(timerHandle);
  timerHandle = null;
  sessionStartedAt = null;
  timer.textContent = "10:00";
}

function endSession() {
  stopPlayback();
  stopMicCapture();
  stopTimer();
  acceptAudio = true;

  if (socket) {
    try { socket.close(1000, "Demo ended"); } catch {}
  }
  socket = null;
  socketPromise = null;
  endButton.disabled = true;
  talkLabel.textContent = "Iniciar conversa";
  setStatus("idle", "Pronto para testar", "Inicie uma nova conversa quando quiser.");

  credential = null;
  prefetchCredential();
}

window.addEventListener("beforeunload", () => {
  try { socket?.close(); } catch {}
  mediaStream?.getTracks().forEach((track) => track.stop());
});

checkAuth();
