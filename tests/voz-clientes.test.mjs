// Clientes de voz do chat (assets/voz-tempo-real.js e assets/voz.js): os arquivos de verdade rodam aqui dentro
// de um navegador simulado (node:vm), sem rede, sem microfone e com o relógio na mão do teste.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const raiz = new URL("../", import.meta.url);
const tick = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

function elemento(tag, criados) {
  const classes = new Set();
  const e = {
    tag, className: "", hidden: false, textContent: "", innerHTML: "", title: "", filhos: [], ouvintes: {}, atributos: {}, seletores: {},
    style: { setProperty() {} },
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      toggle: (c, on) => ((on === undefined ? !classes.has(c) : on) ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c),
    },
    setAttribute(k, v) { this.atributos[k] = String(v); }, getAttribute(k) { return this.atributos[k]; },
    appendChild(f) { this.filhos.push(f); return f; }, insertBefore(f) { this.filhos.push(f); return f; },
    insertAdjacentHTML() {}, insertAdjacentElement() {}, remove() { this.removido = true; }, focus() {},
    addEventListener(t, f) { (this.ouvintes[t] ||= []).push(f); },
    clicar() { (this.ouvintes.click || []).forEach((f) => f({})); },
    querySelector(sel) { return this.seletores[sel] ?? null; }, querySelectorAll() { return []; },
  };
  criados?.push(e);
  return e;
}

// Um navegador de mentira com o mínimo que os dois arquivos usam. Tudo que eles fazem fica anotado em `b`.
function navegador() {
  const b = { agora: 1_000_000, criados: [], timers: [], sockets: [], nos: [], tocados: [], gravadores: [], faixasParadas: 0, nivelMic: 0, sessaoFalha: false, avisos: [] };
  let proximoId = 1;
  const row = elemento("div"), enviar = elemento("button");
  row.seletores["[data-send]"] = enviar;
  const document = {
    body: elemento("body"), currentScript: { src: "https://trustio.com.br/assets/voz-tempo-real.js" },
    createElement: (tag) => elemento(tag, b.criados),
    querySelector: (sel) => (sel === ".composer-row" ? row : sel === "[data-send]" ? enviar : null),
    querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  };
  class AudioContext {
    constructor() { this.sampleRate = 48000; this.state = "running"; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; }
    resume() { return Promise.resolve(); } close() { this.state = "closed"; return Promise.resolve(); }
    createBuffer(c, n, taxa) { return { duration: n / taxa, getChannelData: () => ({ set() {} }) }; }
    createBufferSource() { const f = { connect() {}, start() { b.tocados.push(f); }, stop() {} }; return f; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 0, getFloatTimeDomainData: (buf) => buf.fill(b.nivelMic) }; }
  }
  class AudioWorkletNode { constructor() { this.port = { onmessage: null }; b.nos.push(this); } disconnect() {} }
  class WebSocket {
    constructor(url, protocolos) { this.url = url; this.protocolos = protocolos; this.readyState = 1; this.enviados = []; b.sockets.push(this); }
    send(d) { this.enviados.push(d); } close() { this.readyState = 3; }
  }
  class MediaRecorder {
    static isTypeSupported() { return true; }
    constructor() { this.state = "inactive"; this.mimeType = "audio/webm"; b.gravadores.push(this); }
    start() { this.state = "recording"; } stop() { this.state = "inactive"; this.onstop(); }
  }
  class Audio { play() { return Promise.resolve(); } pause() {} load() {} removeAttribute() {} }
  const janela = {
    document, console, Blob, AbortController, AudioContext, AudioWorkletNode, WebSocket, MediaRecorder, Audio,
    location: { href: "https://trustio.com.br/app/" },
    navigator: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() { b.faixasParadas++; } }] }) } },
    URL: Object.assign(function (caminho, base) { return new URL(caminho, base); }, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
    requestAnimationFrame() {},
    setTimeout: (f, ms) => { const id = proximoId++; b.timers.push({ id, f, ms }); return id; },
    clearTimeout: (id) => { b.timers = b.timers.filter((t) => t.id !== id); },
    setInterval: () => proximoId++, clearInterval() {},
    // GET: situação do botão. POST: o pedido de áudio, que cada teste decide como responde (b.aoPedirAudio).
    fetch: (url, init = {}) => {
      if ((init.method || "GET") === "GET") {
        return Promise.resolve({ ok: true, json: async () => ({ disponivel: true, configurada: true, acesso: "livre", demo_restante: 0 }) });
      }
      return b.aoPedirAudio(init);
    },
    __agora: () => b.agora,
  };
  janela.window = janela;
  vm.createContext(janela);
  vm.runInContext("Date.now = () => __agora();", janela);
  b.janela = janela;
  b.carregar = (arquivo) => vm.runInContext(readFileSync(new URL(arquivo, raiz), "utf8"), janela, { filename: arquivo });
  b.disparar = (ms) => { const vez = b.timers.filter((t) => t.ms === ms); b.timers = b.timers.filter((t) => t.ms !== ms); vez.forEach((t) => t.f()); return vez.length; };
  b.criado = (classe) => b.criados.filter((e) => e.className.split(" ").includes(classe)).at(-1);
  // O que o chat (assets/chat.js) entrega aos dois módulos.
  b.ctx = {
    T: (pt) => pt, EN: false, planosUrl: "/planos", CFG: { chatEndpoint: "https://x.supabase.co/functions/v1/chat", key: "pub" },
    showNotice: (texto) => b.avisos.push(texto), semCota: () => true, ocupado: () => false, input: { value: "" },
    adicionarArquivos() {}, enviar() {},
    sb: { auth: { getSession: () => (b.sessaoFalha ? Promise.reject(new Error("rede")) : Promise.resolve({ data: { session: { access_token: "a.b.c" } } })) } },
  };
  return b;
}

// ------------------------------------------------------------------ voz ao vivo (assets/voz-tempo-real.js)
async function vozAoVivo() {
  const b = navegador();
  b.carregar("assets/voz-tempo-real.js");
  b.janela.TrustioVozTempoReal.iniciar(b.ctx);
  await tick();
  return b;
}
async function conversaAberta() {
  const b = await vozAoVivo();
  b.janela.TrustioVozTempoReal.abrir();
  await tick();
  const ws = b.sockets[0];
  ws.onopen();
  const evento = (type, extra = {}) => ws.onmessage({ data: JSON.stringify({ type, ...extra }) });
  const audio = () => ws.onmessage({ data: new Int16Array(960).fill(1200).buffer });
  return { b, ws, evento, audio };
}

test("voz ao vivo: abre o socket com o token no subprotocolo e toca o áudio que chega", async () => {
  const { b, ws, evento, audio } = await conversaAberta();
  assert.equal(ws.url, "wss://api.trustio.com.br/voz/tempo-real?taxa=48000");
  assert.deepEqual([...ws.protocolos], ["trustio", "jwt.a.b.c"]);
  evento("trustio.pronto", { segundos: 900 });
  audio(); audio();
  assert.equal(b.tocados.length, 2);
});

test("ponto 4: depois que a pessoa fala por cima, o áudio da resposta antiga é descartado até a fala dela acabar", async () => {
  const { b, evento, audio } = await conversaAberta();
  audio();
  assert.equal(b.tocados.length, 1);
  evento("input_audio_buffer.speech_started");
  audio(); audio();                               // blocos da resposta interrompida que ainda estavam a caminho
  assert.equal(b.tocados.length, 1, "nada da resposta antiga toca");
  evento("input_audio_buffer.speech_stopped");
  audio();
  assert.equal(b.tocados.length, 2, "a resposta nova toca");
});

test("ponto 4: uma resposta nova (response.created) também encerra o descarte", async () => {
  const { b, evento, audio } = await conversaAberta();
  evento("input_audio_buffer.speech_started");
  audio();
  assert.equal(b.tocados.length, 0);
  evento("response.created");
  audio();
  assert.equal(b.tocados.length, 1);
});

test("ponto 4: sem nenhum dos dois eventos, o descarte acaba no teto de 10 s (a IA não fica muda)", async () => {
  const { b, evento, audio } = await conversaAberta();
  evento("input_audio_buffer.speech_started");
  b.agora += 9_999; audio();
  assert.equal(b.tocados.length, 0, "antes do teto ainda descarta");
  b.agora += 1; audio();
  assert.equal(b.tocados.length, 1, "no teto volta a tocar");
});

test("ponto 5: microfone silenciado manda silêncio do mesmo tamanho, e volta ao áudio ao reativar", async () => {
  const { b, ws } = await conversaAberta();
  const captura = () => b.nos[0].port.onmessage({ data: { pcm: new Int16Array(960).fill(1200).buffer, nivel: 0.2 } });
  const zeros = (buf) => new Uint8Array(buf).every((x) => x === 0);
  captura();
  assert.equal(ws.enviados.length, 1);
  assert.ok(!zeros(ws.enviados[0]), "com o mic ligado segue a fala");
  const mudo = b.criado("tr-btn-mudo");
  mudo.clicar();
  assert.equal(mudo.atributos["aria-pressed"], "true");
  captura();
  assert.equal(ws.enviados.length, 2, "silenciado continua mandando blocos (o relé não encerra por inatividade)");
  assert.equal(ws.enviados[1].byteLength, 1920);
  assert.ok(zeros(ws.enviados[1]), "e o bloco é só silêncio");
  mudo.clicar();
  captura();
  assert.ok(!zeros(ws.enviados[2]), "reativado, a fala volta");
});

test("ponto 6: conexão que cai sem o servidor dizer por quê mostra aviso e fecha o painel", async () => {
  const { b, ws } = await conversaAberta();
  ws.onclose();
  assert.deepEqual(b.avisos, ["A conexão com a voz caiu. Tente de novo."]);
  assert.ok(b.criado("tr-fundo").removido, "painel removido");
  assert.equal(b.faixasParadas, 1, "microfone solto");
});

test("ponto 6: fim com motivo do servidor mostra o motivo; encerrar pelo botão não mostra aviso", async () => {
  let c = await conversaAberta();
  c.evento("trustio.fim", { motivo: "limite" });
  c.ws.onclose();
  assert.deepEqual(c.b.avisos, ["O tempo desta conversa acabou."]);
  c = await conversaAberta();
  c.b.criado("tr-btn-sair").clicar();
  c.ws.onclose();
  assert.deepEqual(c.b.avisos, []);
  assert.equal(c.ws.readyState, 3, "o socket é fechado");
});

test("ponto 6: token que falha ao abrir fecha a conversa com aviso, sem deixar o microfone aberto", async () => {
  const b = await vozAoVivo();
  b.sessaoFalha = true;
  b.janela.TrustioVozTempoReal.abrir();
  await tick();
  assert.equal(b.sockets.length, 0, "nenhum socket é aberto");
  assert.deepEqual(b.avisos, ["A voz ao vivo não está disponível agora."]);
  assert.ok(b.criado("tr-fundo").removido, "painel removido");
  assert.equal(b.faixasParadas, 1, "microfone solto");
});

// ------------------------------------------------------------------ voz das respostas (assets/voz.js)
const PRAZO_AUDIO_MS = 100_000;
async function vozDoChat() {
  const b = navegador();
  b.aoPedirAudio = () => Promise.resolve({ ok: true, headers: { get: () => null }, blob: async () => new Blob(["mp3"]) });
  b.carregar("assets/voz.js");
  b.janela.TrustioVoz.iniciar(b.ctx);
  await tick();
  return b;
}
function resposta(b, texto) {
  const el = elemento("div"), cab = elemento("div");
  el.seletores[".msg-cab"] = cab; el._texto = texto;
  b.janela.TrustioVoz.decorar(el);
  return cab.filhos[0];   // o botão "Ouvir"
}

test("buscarAudio: pedido de voz que não responde é abortado no prazo e vira o aviso de erro 'prazo'", async () => {
  const b = await vozDoChat();
  let sinal = null;
  b.aoPedirAudio = (init) => {
    sinal = init.signal;
    return new Promise((_, rejeitar) => init.signal.addEventListener("abort", () => rejeitar(Object.assign(new Error("abortado"), { name: "AbortError" }))));
  };
  const ouvir = resposta(b, "Olá, tudo bem?");
  ouvir.clicar();
  await tick();
  assert.ok(ouvir.classList.contains("is-carregando"));
  assert.equal(b.timers.filter((t) => t.ms === PRAZO_AUDIO_MS).length, 1, "prazo de 100 s marcado");
  assert.equal(sinal.aborted, false);
  assert.deepEqual(b.avisos, []);
  b.disparar(PRAZO_AUDIO_MS);
  await tick();
  assert.equal(sinal.aborted, true, "o pedido é abortado");
  assert.equal(b.avisos.length, 1);
  assert.match(b.avisos[0], /Não foi possível gerar a voz agora \(prazo\)/);
  assert.ok(!ouvir.classList.contains("is-carregando"), "o botão sai de Carregando…");
});

test("buscarAudio: resposta a tempo solta o prazo e toca", async () => {
  const b = await vozDoChat();
  const ouvir = resposta(b, "Olá, tudo bem?");
  ouvir.clicar();
  await tick();
  assert.equal(b.timers.filter((t) => t.ms === PRAZO_AUDIO_MS).length, 0, "prazo desmarcado");
  assert.ok(ouvir.classList.contains("is-tocando"));
  assert.deepEqual(b.avisos, []);
});

test("ponto 12: conversa por voz sem ninguém falar desliga o microfone depois de 3 rodadas", async () => {
  const b = await vozDoChat();
  b.nivelMic = 0.001;                             // detector vivo, mas abaixo do limiar de fala
  const conversa = b.criado("conversa-voz");
  conversa.clicar();
  await tick();
  assert.equal(conversa.atributos["aria-pressed"], "true");
  assert.equal(b.gravadores.length, 1, "começa a ouvir");
  const rodadaSemFala = async () => { b.agora += 121_000; b.disparar(120); await tick(); };   // a gravação estoura os 120 s
  await rodadaSemFala();
  assert.equal(b.disparar(400), 1, "1ª rodada sem fala: volta a ouvir");
  await tick();
  await rodadaSemFala();
  assert.equal(b.disparar(400), 1, "2ª rodada sem fala: volta a ouvir");
  await tick();
  assert.equal(b.gravadores.length, 3);
  assert.equal(conversa.atributos["aria-pressed"], "true");
  await rodadaSemFala();
  assert.equal(b.disparar(400), 0, "3ª rodada: não regrava");
  assert.equal(conversa.atributos["aria-pressed"], "false", "conversa por voz desligada");
  assert.equal(b.avisos.at(-1), "Conversa por voz desligada: não ouvi ninguém por um tempo.");
  assert.equal(b.faixasParadas, 3, "microfone solto nas três rodadas");
  assert.equal(b.gravadores.length, 3);
});
