"use strict";
/* Trustio Console · Agentes de voz.
   List view + agent builder, with the WebGL galaxy orb (assets/orb.js) as the live-test surface:
   clicking it plays the agent's neural clip and drives uAudio from the real waveform. */

const AGENTS = [
  { id: "ara", name: "Ara", role: "Atendimento ao cliente", sector: "Atendimento", model: "trustio-voice-xAI-fast-2.0",
    voice: "ara", tools: 4, calls: 612, p95: 388, status: "live", updated: "há 2 h",
    colors: "#c9e6ff,#2f7dff,#081a3a", glow: "#7abeff", arch: 0,
    line: "Oi, eu sou a Ara. Posso ajudar com o seu pedido, com a sua fatura ou com um agendamento. O que você precisa hoje?",
    turns: [["me", "Meu pedido chegou com o produto errado."],
            ["ai", "Sinto muito por isso. Achei o pedido 8841 — um teclado no lugar do mouse. Posso enviar o correto hoje e gerar a etiqueta de devolução?"],
            ["tool", "consultar_pedido(8841) · politica_troca() · criar_etiqueta()"],
            ["me", "Pode, por favor."],
            ["ai", "Pronto. Protocolo 2026-0913. A etiqueta chega por e-mail em instantes."]],
    prompt: `Você é a Ara, agente de voz da Trustio para atendimento.

TOM: calorosa, direta, frases curtas. Fale como uma pessoa ao telefone, nunca como uma URA.

FLUXO
1. Cumprimente pelo nome quando o número for reconhecido e confirme o motivo da ligação em uma frase.
2. Consulte o pedido com consultar_pedido(numero). Se o cliente não souber o número, busque por CPF ou e-mail.
3. Aplique politica_troca() antes de prometer qualquer devolução ou reembolso.
4. Feche com o protocolo e envie a confirmação por WhatsApp.

LIMITES
- Nunca leia em voz alta cartão, CPF completo ou senha; confirme apenas os quatro últimos dígitos.
- Reembolso acima de R$ 500 exige aprovação humana: chame transferir_para_humano(financeiro).
- Se o cliente pedir para falar com uma pessoa, transfira imediatamente, sem insistir.` },

  { id: "eve", name: "Eve", role: "Vendas e reativação", sector: "Vendas", model: "trustio-voice-xAI-fast-2.0",
    voice: "eve", tools: 5, calls: 341, p95: 402, status: "live", updated: "ontem",
    colors: "#e2ccff,#7b4dff,#160a38", glow: "#a888ff", arch: 1,
    line: "Oi! Aqui é a Eve. Vi que você deixou o carrinho pela metade. Quer que eu finalize o pedido com o mesmo cartão?",
    turns: [["ai", "Oi, Marina! Vi que você pediu uma cotação do plano Pro. Posso tirar dúvidas agora?"],
            ["me", "Quero saber se cabe 5 casos de uso."],
            ["ai", "Cabe — o Pro inclui até cinco. Se quiser, envio um link de pagamento com dez por cento na anuidade."],
            ["tool", "criar_link_pagamento(pro, cupom=ANUAL10)"]],
    prompt: `Você é a Eve, agente de voz da Trustio para vendas consultivas.

TOM: ágil, simpática, sem pressão. Uma pergunta por vez.

FLUXO
1. Confirme o interesse registrado no CRM antes de apresentar preço.
2. Qualifique volume, prazo e decisor com perguntas curtas.
3. Só ofereça desconto dentro da tabela vigente; nunca invente condição.
4. Feche com link de pagamento ou agendamento com o time humano.

LIMITES
- Nunca prometa prazo de implantação abaixo de duas semanas.
- Desconto acima de 10% exige aprovação: transferir_para_humano(comercial).` },

  { id: "leo", name: "Leo", role: "Cobrança e confirmações", sector: "Cobrança", model: "trustio-voice-xAI-fast-2.0",
    voice: "leo", tools: 3, calls: 218, p95: 371, status: "live", updated: "há 3 dias",
    colors: "#ffe4a8,#ff9a3c,#3a1606", glow: "#ffb454", arch: 2,
    line: "Boa tarde, sou o Leo. Confirmo o pagamento de duzentos e trinta reais recebido hoje. Posso enviar o comprovante por e-mail?",
    turns: [["ai", "Boa tarde, falo com o senhor Ricardo? Aqui é o Leo, da Trustio."],
            ["me", "Sim, sou eu."],
            ["ai", "Consta uma fatura de duzentos e trinta reais vencida há cinco dias. Posso gerar um Pix agora ou reagendar para o dia dez?"],
            ["tool", "gerar_pix(230.00) · registrar_promessa(2026-09-10)"]],
    prompt: `Você é o Leo, agente de voz da Trustio para cobrança amigável.

TOM: firme, tranquilo, respeitoso. Nunca constranja o cliente.

FLUXO
1. Confirme a identidade antes de citar qualquer valor.
2. Apresente o débito uma única vez, com data e valor exatos.
3. Ofereça Pix imediato ou reagendamento dentro da política.
4. Registre a promessa de pagamento e confirme por WhatsApp.

LIMITES (CDC e boas práticas)
- Não ligue fora do horário permitido nem repita a ligação no mesmo dia.
- Não fale sobre a dívida com terceiros.
- Encerre a chamada se o cliente pedir.` },

  { id: "rex", name: "Rex", role: "Suporte técnico N1", sector: "Suporte técnico", model: "trustio-voice-latest",
    voice: "rex", tools: 6, calls: 113, p95: 455, status: "paused", updated: "há 6 dias",
    colors: "#c6fff0,#22c48f,#052a1e", glow: "#3ddc97", arch: 3,
    line: "Aqui é o Rex. Sua ocorrência foi registrada com prioridade alta. Um técnico entra em contato em até duas horas.",
    turns: [["me", "Minha internet caiu de novo."],
            ["ai", "Vou verificar o sinal do seu equipamento agora. Um instante."],
            ["tool", "diagnostico_link(cliente=44120) · abrir_chamado(prioridade=alta)"],
            ["ai", "Identifiquei perda de sinal na sua região. Chamado 5521 aberto com prioridade alta; um técnico entra em contato em até duas horas."]],
    prompt: `Você é o Rex, agente de voz da Trustio para suporte técnico de nível 1.

TOM: grave, objetivo, sem jargão. Explique cada passo antes de pedir uma ação.

FLUXO
1. Rode diagnostico_link() antes de qualquer pergunta ao cliente.
2. Guie no máximo três passos de verificação; se não resolver, abra chamado.
3. Informe número do chamado, prioridade e prazo real.

LIMITES
- Nunca peça senha do roteador nem dados de cartão.
- Não prometa prazo fora do SLA do plano contratado.` },

  { id: "sal", name: "Sal", role: "Jurídico e pesquisa", sector: "Jurídico", model: "trustio-voice-xAI-fast-2.0",
    voice: "sal", tools: 4, calls: 0, p95: 0, status: "draft", updated: "há 20 min",
    colors: "#ffd0dd,#ff4f8a,#33081a", glow: "#ff7aa8", arch: 1,
    line: "Olá, sou a Sal. Encontrei três decisões recentes do STJ sobre o tema. Quer o resumo agora ou por e-mail?",
    turns: [["me", "Preciso das decisões recentes sobre revisão de contrato bancário."],
            ["ai", "Encontrei três acórdãos do STJ dos últimos noventa dias. Quer o resumo agora ou por e-mail?"],
            ["tool", "buscar_jurisprudencia(tema, 90d) · resumir(3)"]],
    prompt: `Você é a Sal, agente de voz da Trustio para escritórios e departamentos jurídicos.

TOM: precisa, discreta, técnica quando necessário.

FLUXO
1. Confirme tema, tribunal e recorte temporal antes de buscar.
2. Cite sempre a fonte: tribunal, número e data do acórdão.
3. Ofereça o resumo por voz e o inteiro teor por e-mail.

LIMITES
- Nunca emita opinião jurídica conclusiva nem estime chance de êxito.
- Deixe explícito que a validação final é do advogado responsável.` }
];

const STATUS = { live: ["live", "Em produção"], draft: ["draft", "Rascunho"], paused: ["paused", "Pausado"] };
const rm = matchMedia("(prefers-reduced-motion: reduce)");

/* ── orbs ── */
const orbs = new Map();
function mountOrb(el, a, hero) {
  const [bright, mid] = a.colors.split(",");
  el.style.setProperty("--glow", a.glow);
  el.dataset.voice = a.id;
  orbs.set(el, new TrustioOrb(el, {
    colors: [mid, bright, a.glow], anchor: a.glow, bg: "#0b0f16", arch: a.arch,
    lens: hero ? 0.08 : 0, dual: !!hero, fps: hero ? 60 : 24, seed: Math.random() * 100
  }));
  return el;
}

/* ── audio ── */
let ctx, analyser, data, current = null, raf = 0;
const player = new Audio(); player.preload = "none";
function ensureAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.6;
    data = new Uint8Array(analyser.fftSize);
    const src = ctx.createMediaElementSource(player); src.connect(analyser); analyser.connect(ctx.destination);
  } catch (e) { ctx = null; }
}
function meter() {
  if (!current) return;
  let level = 0.4;
  if (analyser) {
    analyser.getByteTimeDomainData(data);
    let sum = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
    level = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
  }
  orbs.get(current.el)?.setLevel(level);
  current.el.style.setProperty("--lv", (0.3 + 0.7 * level).toFixed(2));
  raf = requestAnimationFrame(meter);
}
function stopAudio() {
  cancelAnimationFrame(raf);
  if (current) { orbs.get(current.el)?.setLevel(0); current.el.style.setProperty("--lv", "0"); current = null; }
  player.pause();
}

/* ── list ── */
const tbody = document.querySelector("#agentsTable tbody");
let filter = "all", query = "";
function renderList() {
  tbody.innerHTML = "";
  AGENTS.filter(a => (filter === "all" || a.status === filter) &&
      (a.name + a.role + a.voice + a.model).toLowerCase().includes(query))
    .forEach(a => {
      const tr = document.createElement("tr");
      tr.tabIndex = 0; tr.setAttribute("role", "link");
      tr.innerHTML = `
        <td><div class="who"><div class="orb"></div><div><b>${a.name}</b><small>${a.role}</small></div></div></td>
        <td data-l="Modelo"><code>${a.model}</code></td>
        <td data-l="Voz"><code>${a.voice}</code></td>
        <td class="tools-n" data-l="Ferramentas">${a.tools} ativas</td>
        <td class="num" data-l="Chamadas 24 h">${a.calls ? a.calls.toLocaleString("pt-BR") : "—"}</td>
        <td class="num" data-l="p95">${a.p95 ? a.p95 + " ms" : "—"}</td>
        <td data-l="Status"><span class="chip ${STATUS[a.status][0]}">${STATUS[a.status][1]}</span></td>
        <td class="tools-n" data-l="Atualizado">${a.updated}</td>
        <td class="go">›</td>`;
      mountOrb(tr.querySelector(".orb"), a, false);
      const open = () => openAgent(a);
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      tbody.appendChild(tr);
    });
}
document.querySelectorAll(".filters button").forEach((b, i, all) => b.addEventListener("click", () => {
  all.forEach(x => { x.setAttribute("aria-selected", String(x === b)); x.tabIndex = x === b ? 0 : -1; });
  filter = b.dataset.filter; renderList();
}));
document.getElementById("q").addEventListener("input", e => { query = e.target.value.toLowerCase(); renderList(); });

/* ── builder ── */
const listView = document.getElementById("listView"), buildView = document.getElementById("buildView");
const testOrbEl = document.getElementById("testOrb");
let testOrb = null, agent = AGENTS[0], clock = 0, clockTimer = 0;

function openAgent(a) {
  agent = a;
  document.getElementById("bName").textContent = a.name;
  document.getElementById("bId").textContent = "7Qk2…" + a.name;
  const st = document.getElementById("bStatus");
  st.className = "chip " + STATUS[a.status][0]; st.textContent = STATUS[a.status][1];
  document.getElementById("fName").value = a.name;
  document.getElementById("fSector").value = a.sector;
  document.getElementById("fModel").value = a.model;
  document.getElementById("fVoice").value = a.voice;
  const pr = document.getElementById("fPrompt"); pr.value = a.prompt; countPrompt();
  document.getElementById("tHint").textContent = "Toque na esfera para ouvir " + a.name + " responder.";
  document.getElementById("tLog").innerHTML = '<p class="muted">A transcrição aparece aqui durante o teste.</p>';
  document.getElementById("tEvents").textContent = `session.update      · voice=${a.voice}, vad=server_vad\nsession.created     · br-sao-1\n`;
  document.getElementById("tLat").textContent = a.p95 ? "p95 " + a.p95 + " ms" : "—";
  // (re)build the hero test orb with this agent's palette
  stopAudio();
  if (testOrb) { orbs.delete(testOrbEl); testOrbEl.innerHTML = ""; testOrbEl.className = "orb"; }
  testOrb = mountOrb(testOrbEl, a, true);
  listView.hidden = true; buildView.hidden = false;
  window.scrollTo({ top: 0, behavior: rm.matches ? "auto" : "smooth" });
  history.replaceState(null, "", "#" + a.id);
}
document.getElementById("backBtn").addEventListener("click", () => {
  stopAudio(); resetTest();
  buildView.hidden = true; listView.hidden = false; history.replaceState(null, "", "#");
});
document.getElementById("newAgent").addEventListener("click", () => {
  openAgent({ ...AGENTS[0], name: "Novo agente", role: "Sem função definida", status: "draft", calls: 0, p95: 0, updated: "agora",
    prompt: "Você é um agente de voz da Trustio.\n\nTOM:\n\nFLUXO\n1.\n\nLIMITES\n- " });
});

/* prompt counter + autosave pill */
const promptEl = document.getElementById("fPrompt"), savedEl = document.getElementById("saved");
function countPrompt() { document.getElementById("promptCount").textContent = promptEl.value.length + " caracteres"; }
let saveT = 0;
function touched() {
  countPrompt(); clearTimeout(saveT);
  saveT = setTimeout(() => { savedEl.classList.add("show"); setTimeout(() => savedEl.classList.remove("show"), 1800); }, 500);
}
promptEl.addEventListener("input", touched);
document.querySelectorAll("#fName,#fSector,#fModel,#fVoice,#fLang,#fVad,#toolList input").forEach(el => el.addEventListener("change", touched));
document.getElementById("fName").addEventListener("input", e => { document.getElementById("bName").textContent = e.target.value || "Sem nome"; });
const temp = document.getElementById("fTemp"), rate = document.getElementById("fRate");
temp.addEventListener("input", () => document.getElementById("oTemp").value = Number(temp.value).toFixed(2));
rate.addEventListener("input", () => document.getElementById("oRate").value = Number(rate.value).toFixed(2) + "×");
document.getElementById("deployBtn").addEventListener("click", e => {
  const b = e.currentTarget; const old = b.textContent;
  b.textContent = "Publicando…"; b.disabled = true;
  setTimeout(() => { b.textContent = "Publicado ✓"; setTimeout(() => { b.textContent = old; b.disabled = false; }, 1600); }, 900);
});
document.getElementById("revertBtn").addEventListener("click", () => { promptEl.value = agent.prompt; countPrompt(); });

/* ── live test ── */
const tState = document.getElementById("tState"), tDot = document.getElementById("tDot"),
      tLog = document.getElementById("tLog"), tEvents = document.getElementById("tEvents"),
      tClock = document.getElementById("tClock"), callBtn = document.getElementById("callBtn");

function ev(line) { tEvents.textContent += line + "\n"; tEvents.scrollTop = tEvents.scrollHeight; }
function setState(s, busy) { tState.textContent = s; tDot.className = "dot " + (busy ? "busy" : "live"); }
function resetTest() {
  setState("Pronto", false); callBtn.textContent = "Iniciar teste"; clearInterval(clockTimer);
  clock = 0; tClock.textContent = "00:00"; testOrbEl.classList.remove("speaking");
}
function runTest() {
  if (current) { stopAudio(); resetTest(); return; }
  ensureAudio(); ctx?.resume?.();
  tLog.innerHTML = ""; callBtn.textContent = "Encerrar";
  clock = 0; clearInterval(clockTimer);
  clockTimer = setInterval(() => { clock++; tClock.textContent = String(Math.floor(clock / 60)).padStart(2, "0") + ":" + String(clock % 60).padStart(2, "0"); }, 1000);
  setState("Ouvindo", false); ev("input_audio_buffer.speech_started");
  const turns = agent.turns || [];
  let i = 0;
  const step = () => {
    if (i >= turns.length) { playLine(); return; }
    const [kind, text] = turns[i++];
    if (kind === "tool") { ev("response.function_call · " + text); addLog("tool", text); setState("Executando ferramenta", true); }
    else { addLog(kind, text); setState(kind === "me" ? "Ouvindo" : "Falando", kind !== "me"); if (kind === "ai") ev("response.audio.delta ·  " + text.slice(0, 34) + "…"); }
    setTimeout(step, kind === "tool" ? 700 : 1500);
  };
  setTimeout(step, 500);
}
function addLog(kind, text) {
  const p = document.createElement("p");
  if (kind === "me") p.className = "me";
  if (kind === "tool") { p.className = "muted"; p.style.fontFamily = "var(--mono)"; p.style.fontSize = "11px"; p.textContent = "→ " + text; }
  else p.textContent = text;
  tLog.appendChild(p); tLog.scrollTop = tLog.scrollHeight;
}
function playLine() {
  setState("Falando", true); ev("response.audio.done");
  current = { el: testOrbEl };
  testOrbEl.classList.add("speaking");
  player.src = (window.VOICE_AUDIO && window.VOICE_AUDIO[agent.id]) || ("../assets/voice/" + agent.id + ".mp3");
  player.play().catch(() => { document.getElementById("tHint").textContent = "Toque na esfera para liberar o áudio."; });
  meter();
}
player.addEventListener("ended", () => { stopAudio(); testOrbEl.classList.remove("speaking"); setState("Pronto", false); ev("session.idle"); callBtn.textContent = "Iniciar teste"; clearInterval(clockTimer); });
callBtn.addEventListener("click", runTest);
testOrbEl.addEventListener("click", () => { if (current) { stopAudio(); resetTest(); } else { ensureAudio(); ctx?.resume?.(); playLine(); } });

/* ── shell chrome ── */
document.getElementById("sideToggle").addEventListener("click", e => {
  const s = document.getElementById("side"), open = s.classList.toggle("open");
  e.currentTarget.setAttribute("aria-expanded", String(open));
});
document.querySelectorAll(".env button").forEach((b, _, all) => b.addEventListener("click", () => {
  all.forEach(x => x.classList.toggle("is-on", x === b));
  ev("environment · " + b.dataset.env);
}));
document.querySelectorAll("[data-soon]").forEach(a => a.addEventListener("click", e => e.preventDefault()));
document.getElementById("teamBtn").addEventListener("click", e => {
  const b = e.currentTarget, on = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", String(!on));
});
window.addEventListener("pagehide", stopAudio);

/* boot */
renderList();
const hash = location.hash.slice(1);
const found = AGENTS.find(a => a.id === hash);
if (found) openAgent(found);
