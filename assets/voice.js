"use strict";
// VoiceAI · Powered by xAI — audio-reactive WebGL orbs (assets/orb.js), real neural voice clips, use-case tabs.
const rm = window.matchMedia("(prefers-reduced-motion: reduce)");
const AUDIO = window.VOICE_AUDIO || {};
const src = (key) => AUDIO[key] || `assets/voice/${key}.mp3`;

// --- orbs
const orbs = new Map();
document.querySelectorAll(".orb").forEach((el) => {
  const [bright, mid] = (el.dataset.colors || "#bfe0ff,#2563eb,#081536").split(",");
  const glow = el.dataset.glow || "#5ea7ff";
  const hero = el.hasAttribute("data-hero-orb");
  el.style.setProperty("--glow", glow);
  orbs.set(el, new TrustioOrb(el, {
    colors: [mid, bright, glow], anchor: glow, bg: el.dataset.bg || "#05070b",
    arch: el.dataset.arch !== undefined ? Number(el.dataset.arch) : -1,
    lens: hero ? 0.08 : 0, dual: hero, fps: Number(el.dataset.fps || (hero ? 60 : 30)), seed: Math.random() * 100
  }));
});

// --- audio engine: one <audio>, one AnalyserNode, RMS → orb level
let ctx, analyser, data, source, current = null, raf = 0;
const player = new Audio(); player.preload = "auto"; player.crossOrigin = "anonymous";
function ensureAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.6;
    data = new Uint8Array(analyser.fftSize);
    source = ctx.createMediaElementSource(player); source.connect(analyser); analyser.connect(ctx.destination);
  } catch (e) { ctx = null; }
}
function meter() {
  if (!current) return;
  let level = 0;
  if (analyser) {
    analyser.getByteTimeDomainData(data);
    let sum = 0; for (let i = 0; i < data.length; i++) { const x = (data[i] - 128) / 128; sum += x * x; }
    level = Math.min(1, Math.sqrt(sum / data.length) * 4.2);
  } else {
    level = 0.35 + 0.35 * Math.abs(Math.sin(performance.now() / 90)) * Math.abs(Math.sin(performance.now() / 410)); // fallback when Web Audio is unavailable
  }
  orbs.get(current.orb)?.setLevel(level);
  current.orb.style.setProperty("--lv", (0.35 + 0.65 * level).toFixed(2));
  raf = requestAnimationFrame(meter);
}
function stop() {
  cancelAnimationFrame(raf);
  if (typeof heroStop === "function" && current && stageOrb?.classList.contains("playing")) heroStop();
  if (current) { orbs.get(current.orb)?.setLevel(0); current.orb.style.setProperty("--lv", "0"); current.orb.classList.remove("speaking"); current.card?.classList.remove("speaking"); current = null; }
  player.pause();
}
function play(key, orb, caption) {
  const card = orb.closest(".voice");
  if (current && current.key === key) { stop(); return; }
  stop(); ensureAudio(); ctx?.resume?.();
  current = { key, orb, card };
  orb.classList.add("speaking"); card?.classList.add("speaking");
  if (caption) flashCaption(orb, caption);
  player.src = src(key);
  player.play().catch(() => { flashCaption(orb, "Toque novamente para ouvir."); stop(); });
  meter();
}
player.addEventListener("ended", stop);
function flashCaption(orb, msg) { const cap = orb.closest(".orb-stage")?.querySelector("[data-caption]"); if (cap) cap.textContent = msg; }

// --- hero stage: pick a voice, tap the orb, watch it talk (the console has its own button)
const HERO = {
  bruna:   { file: "hero-bruna",   who: "a Bruna",   line: "Oi, tudo bem? Aqui é a Trustio! Achei seu pedido: sai hoje e chega na quinta. Quer que eu já mande o rastreio no seu WhatsApp?" },
  matheus: { file: "hero-matheus", who: "o Matheus", line: "Oi, tudo bem? Aqui é a Trustio! Achei seu pedido: sai hoje e chega na quinta. Quer que eu já mande o rastreio no seu WhatsApp?" },
  hero:    { file: "hero",         who: "a voz original", line: "Olá! Aqui é a Trustio. Posso confirmar seu agendamento de quinta-feira às dez, ou você prefere outro horário?" }
};
const heroOrb = document.querySelector("[data-hero-orb]");
const stageOrb = heroOrb?.closest(".stage-orb");
const ring = stageOrb?.querySelector(".orb-ring .prog");
const stateEl = document.querySelector("[data-state]"), stateWrap = stateEl?.closest(".orb-state");
const live = document.querySelector("[data-caption]");
const picks = [...document.querySelectorAll("[data-pick]")];
let heroKey = "bruna", words = [];
const RING = 301.6;

function setState(text, mode) { if (!stateEl) return; stateEl.textContent = text; stateWrap.classList.toggle("live", mode === "live"); stateWrap.classList.toggle("done", mode === "done"); }
function prepCaption(key) {
  if (!live) return;
  live.textContent = ""; words = [];
  live.dataset.preview = HERO[key].line;
}
function buildCaption(key) {
  if (!live) return;
  live.textContent = "";
  words = HERO[key].line.split(" ").map((w, i, arr) => { const el = document.createElement("span"); el.textContent = w + (i < arr.length - 1 ? " " : ""); live.appendChild(el); return el; });
}
let tickRaf = 0;
function tick() {
  cancelAnimationFrame(tickRaf);
  if (!current || current.key !== HERO[heroKey].file) return;
  tickRaf = requestAnimationFrame(tick); // currentTime advances continuously; timeupdate alone is only ~4 Hz
  const d = player.duration || 0, t = player.currentTime || 0, p = d ? Math.min(1, t / d) : 0;
  if (ring) ring.style.strokeDashoffset = (RING * (1 - p)).toFixed(1) + "px";
  // words land a hair ahead of the audio so the eye never waits for the ear
  const n = Math.min(words.length, Math.ceil((p + 0.06) * words.length));
  for (let i = 0; i < words.length; i++) words[i].classList.toggle("on", i < n);
}
function heroStop() {
  cancelAnimationFrame(tickRaf);
  stageOrb?.classList.remove("playing"); heroOrb?.setAttribute("aria-pressed", "false");
  if (ring) ring.style.strokeDashoffset = RING + "px";
  setState(`Toque para ouvir ${HERO[heroKey].who} de novo`, "done");
}
function heroSpeak() {
  if (!heroOrb) return;
  const v = HERO[heroKey];
  if (current && current.key === v.file) { stop(); heroStop(); setState(`Toque para ouvir ${v.who} de novo`, "done"); return; }
  buildCaption(heroKey);
  play(v.file, heroOrb);
  stageOrb?.classList.add("playing"); heroOrb.setAttribute("aria-pressed", "true");
  setState(`${v.who.replace(/^(a|o) /, (m) => m.toUpperCase())} falando…`, "live");
}
function pickVoice(key, andPlay) {
  heroKey = key;
  picks.forEach((b) => { const on = b.dataset.pick === key; b.setAttribute("aria-checked", String(on)); b.tabIndex = on ? 0 : -1; });
  if (current && Object.values(HERO).some((v) => v.file === current.key)) { stop(); heroStop(); }
  prepCaption(key);
  if (andPlay) heroSpeak(); else setState(`Toque na esfera para ouvir ${HERO[key].who}`);
}
heroOrb?.addEventListener("click", heroSpeak);
heroOrb?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); heroSpeak(); } });
picks.forEach((b, i) => {
  b.addEventListener("click", () => pickVoice(b.dataset.pick, true));
  b.addEventListener("keydown", (e) => { const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return; e.preventDefault(); const n = picks[(i + d + picks.length) % picks.length]; n.focus(); pickVoice(n.dataset.pick, false); });
});
player.addEventListener("playing", tick);
player.addEventListener("ended", () => { if (words.length) words.forEach((w) => w.classList.add("on")); heroStop(); if (Object.values(HERO).some((v) => v.file === (current?.key))) return; setState(`Toque para ouvir ${HERO[heroKey].who} de novo`, "done"); });
// "Ouvir o agente" in the hero copy plays the selected voice and brings the orb into view
document.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); heroOrb?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "center" }); if (!(current && current.key === HERO[heroKey].file)) heroSpeak(); }));
prepCaption(heroKey);

// --- voice library
document.querySelectorAll(".voice").forEach((card) => {
  const orb = card.querySelector(".orb");
  card.addEventListener("click", () => play(card.dataset.voice, orb));
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); } });
});

// --- use-case tabs
const tabs = [...document.querySelectorAll(".usecase-tabs button")], panels = [...document.querySelectorAll(".usecase-panel")];
function showTab(i) {
  tabs.forEach((t, k) => { t.setAttribute("aria-selected", String(k === i)); t.tabIndex = k === i ? 0 : -1; });
  panels.forEach((p, k) => { p.hidden = k !== i; if (k === i) p.setAttribute("data-active", ""); else p.removeAttribute("data-active"); });
}
tabs.forEach((t, i) => { t.addEventListener("click", () => showTab(i)); t.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { showTab((i + 1) % tabs.length); tabs[(i + 1) % tabs.length].focus(); } if (e.key === "ArrowLeft") { showTab((i - 1 + tabs.length) % tabs.length); tabs[(i - 1 + tabs.length) % tabs.length].focus(); } }); });

window.addEventListener("pagehide", stop);

// --- canais: fatos no hover, painel de detalhes no clique
const CHANNELS = {
  phone: { icon: "phone", kicker: "Telefonia", title: "Ligação de voz",
    lede: "O canal mais exigente — e onde o agente mais se prova. Fala-a-fala em tempo real, com número local e transferência para humano sem perder o fio.",
    how: "A chamada entra por SIP (seu número ou um número novo com o DDD da cidade) e passa pela camada Trustio antes do modelo: identificação, mascaramento de dados sensíveis e playbook. O agente escuta, raciocina, chama ferramentas no meio da conversa e responde em menos de um segundo. Se precisar de gente, transfere com um resumo do que já foi dito.",
    quick: ["< 1 s fala-a-fala", "Seu número via SIP", "Transfere com contexto"],
    facts: [["Entrada", "Número novo (DDD local) ou porte/SIP do número atual; também WebRTC no site"], ["Latência", "Sub-segundo ponta a ponta, com interrupções tratadas (o cliente pode falar por cima)"], ["Registro", "Gravação, transcrição e eventos da chamada no perímetro, no Brasil"], ["Boa prática", "O agente se identifica como assistente virtual no início da ligação"]],
    uses: ["Atendimento N1", "Confirmação de consulta", "Cobrança e acordos", "Recepção 24/7", "Qualificação outbound"] },
  whatsapp: { icon: "whatsapp", kicker: "Mensageria", title: "WhatsApp",
    lede: "O canal que o Brasil usa. Pela API oficial de negócios, o mesmo agente responde texto, áudio e documentos — e sabe quando só um template é permitido.",
    how: "A conversa roda na WhatsApp Business Platform (API oficial da Meta), nunca em número pessoal ou automação não homologada. Dentro da janela de 24 h após a última mensagem do cliente, o agente conversa livremente; fora dela, só envia templates aprovados — e escolhe o certo sozinho. Áudios recebidos são transcritos e entram na mesma memória da ligação.",
    quick: ["API oficial Meta", "Janela de 24 h", "Áudio transcrito"],
    facts: [["Requisito", "Conta WhatsApp Business verificada e opt-in do cliente (LGPD)"], ["Janela", "24 h após a última mensagem do cliente; depois, apenas templates aprovados pela Meta"], ["Formatos", "Texto, áudio, imagem, documento, botões e listas interativas"], ["Custo", "Cobrado pela Meta por mensagem/conversa, por categoria (utilidade, marketing, autenticação)"]],
    uses: ["Confirmação e lembrete", "Suporte assíncrono", "Reativação de carrinho", "Envio de boleto e 2ª via"] },
  telegram: { icon: "telegram", kicker: "Mensageria", title: "Telegram",
    lede: "Bots e grupos atendidos pelo mesmo agente, com as mesmas permissões e sem janela de 24 h.",
    how: "Um bot Telegram é ligado ao agente pela Bot API. Ele responde no privado a quem iniciou a conversa e, em grupos onde foi adicionado, atende menções e comandos. Botões inline transformam respostas em ações (confirmar, remarcar, abrir chamado) sem o usuário digitar.",
    quick: ["Sem janela de 24 h", "Grupos e canais", "Botões inline"],
    facts: [["Requisito", "Bot criado no @BotFather; o cliente inicia com /start ou o bot é adicionado ao grupo"], ["Janela", "Não há: o agente pode escrever a qualquer momento para quem já iniciou"], ["Formatos", "Texto, áudio, arquivos grandes, botões inline e teclados"], ["Custo", "A Bot API é gratuita; o custo é só o do agente"]],
    uses: ["Comunidades e suporte técnico", "Alertas e status de pedido", "Times internos", "Público que evita WhatsApp"] },
  gmail: { icon: "gmail", kicker: "E-mail", title: "Gmail",
    lede: "Lê, responde e encaminha na caixa da empresa — com rascunho para aprovação quando você quiser, envio direto quando a regra permitir.",
    how: "Conectado ao Google Workspace pela API oficial, com escopos mínimos. O agente lê a thread inteira, classifica, responde com o mesmo playbook da voz e do WhatsApp e etiqueta. Você define por regra o que sai como rascunho para um humano aprovar e o que vai direto — por assunto, valor ou remetente.",
    quick: ["Rascunho ou envio direto", "Lê a thread inteira", "Etiqueta e encaminha"],
    facts: [["Requisito", "Conta Google Workspace; autorização OAuth pelo administrador"], ["Aprovação", "Por regra: rascunho para revisão humana ou envio automático"], ["Memória", "O que foi dito por voz ou WhatsApp vale na resposta por e-mail"], ["Guardrail", "Nunca envia fora da política: anexos, valores e destinatários passam pelo filtro"]],
    uses: ["Caixa contato@ e vendas@", "Cotações e follow-up", "Triagem e encaminhamento", "Resposta a documentos"] },
  outlook: { icon: "outlook", kicker: "E-mail", title: "Outlook",
    lede: "Microsoft 365 com as mesmas regras, filas e registros da operação — inclusive caixas compartilhadas.",
    how: "Integra pelo Microsoft Graph, com consentimento do administrador do tenant. Atende caixas individuais e compartilhadas (suporte@, financeiro@), respeita categorias e regras já existentes e mantém a trilha de auditoria na mesma linha das ligações. Rascunho para aprovação ou envio direto, como no Gmail.",
    quick: ["Microsoft Graph", "Caixas compartilhadas", "Mesmas regras da voz"],
    facts: [["Requisito", "Tenant Microsoft 365 e consentimento do admin no Entra ID"], ["Filas", "Caixas compartilhadas viram filas com SLA e prioridade"], ["Aprovação", "Por regra: rascunho para revisão ou envio automático"], ["Registro", "Cada e-mail tratado entra na mesma trilha de auditoria da operação"]],
    uses: ["Empresas no ecossistema Microsoft", "Suporte com SLA", "Financeiro e cobrança por e-mail", "Backoffice"] },
  calendar: { icon: "calendar", kicker: "Agenda", title: "Agenda",
    lede: "Google Calendar e Outlook: agenda, remarca, confirma e evita o no-show antes de ele acontecer.",
    how: "O agente consulta a disponibilidade real (não uma planilha), cria o evento com endereço ou link, e dispara a confirmação pelo canal que o cliente prefere — ligação, WhatsApp ou SMS. Se o cliente pede para mudar, remarca na hora. Fuso, feriados e buffers entre compromissos entram na conta.",
    quick: ["Google + Outlook", "Confirma e remarca", "Reduz no-show"],
    facts: [["Requisito", "Google Calendar ou Outlook/Exchange conectados; regras de horário e buffer"], ["Confirmação", "Lembrete e confirmação por voz, WhatsApp ou SMS, 24 h e 2 h antes (configurável)"], ["Remarcação", "Oferece os próximos horários livres e move o evento na hora"], ["Contexto", "Sabe quem é o cliente e por que está vindo — não repete perguntas"]],
    uses: ["Clínicas e consultórios", "Escritórios e advocacia", "Serviços a domicílio", "Demonstrações comerciais"] },
  imessage: { icon: "imessage", kicker: "Mensageria", title: "iMessage",
    lede: "Mensagens Apple com o nome e o logo da sua marca no lugar de um número desconhecido.",
    how: "Pelo Apple Messages for Business, a conversa aparece no app Mensagens com a identidade da marca e o selo de verificação — sem número de telefone visível. O cliente inicia a conversa (a partir do Maps, Safari, Spotlight ou de um botão no seu site) e o mesmo agente responde com texto, imagens, listas e agendamento.",
    quick: ["Marca verificada", "Cliente inicia", "Base iOS"],
    facts: [["Requisito", "Cadastro e aprovação da marca pela Apple, por meio de um provedor homologado"], ["Início", "Sempre pelo cliente: a marca não pode mandar a primeira mensagem"], ["Formatos", "Texto, imagens, listas de opções, seletor de horário, Apple Pay"], ["Alcance", "Usuários de iPhone, iPad e Mac com iMessage"]],
    uses: ["Varejo e marcas premium", "Suporte pós-venda", "Agendamento a partir do Maps", "Público majoritariamente iOS"] },
  sms: { icon: "sms", kicker: "Mensageria", title: "SMS",
    lede: "Confirmações, códigos e avisos onde não há internet nem aplicativo — e uma resposta curta vira ação.",
    how: "Chega em qualquer celular, sem app. O agente usa SMS para o que é curto e urgente: confirmar, lembrar, avisar, autenticar. A resposta do cliente é lida e executada — \"SIM\" confirma, \"2\" remarca, \"PARAR\" descadastra. Para conversas longas, ele convida para WhatsApp ou ligação.",
    quick: ["Sem internet, sem app", "160 caracteres", "Resposta vira ação"],
    facts: [["Requisito", "Número curto (short code) ou longo habilitado e opt-in do cliente"], ["Formato", "160 caracteres por segmento (GSM-7); mensagens maiores são concatenadas"], ["Resposta", "Palavras-chave e números viram ações no fluxo (confirmar, remarcar, sair)"], ["Custo", "Por mensagem enviada, por operadora"]],
    uses: ["Confirmação de consulta", "Códigos e autenticação", "Avisos de entrega", "Cobrança com link de pagamento"] }
};
const chDetail = document.getElementById("ch-detail");
const chBtns = [...document.querySelectorAll(".ch-btn[data-ch]")];
let chOpen = null;
// fatos no hover (progressive enhancement: sem JS o card continua igual)
chBtns.forEach((b) => {
  const c = CHANNELS[b.dataset.ch]; if (!c) return;
  const more = document.createElement("div"); more.className = "ch-more";
  const inner = document.createElement("div");
  const facts = document.createElement("div"); facts.className = "ch-facts";
  c.quick.forEach((q) => { const s = document.createElement("span"); s.textContent = q; facts.appendChild(s); });
  const hint = document.createElement("span"); hint.className = "ch-hint"; hint.textContent = "Ver detalhes";
  inner.append(facts, hint); more.appendChild(inner); b.appendChild(more);
});
function cdSet(name, fn) { const el = chDetail?.querySelector(`[data-cd="${name}"]`); if (el) fn(el); }
function closeChannel(focusCard) {
  if (!chOpen) return;
  const prev = chOpen; chOpen = null;
  prev.setAttribute("aria-expanded", "false"); prev.closest(".ch")?.classList.remove("is-open");
  chDetail.hidden = true;
  if (focusCard) prev.focus();
}
function openChannel(btn) {
  const c = CHANNELS[btn.dataset.ch]; if (!c || !chDetail) return;
  if (chOpen === btn) { closeChannel(true); return; }
  if (chOpen) { chOpen.setAttribute("aria-expanded", "false"); chOpen.closest(".ch")?.classList.remove("is-open"); }
  chOpen = btn; btn.setAttribute("aria-expanded", "true"); btn.closest(".ch")?.classList.add("is-open");
  cdSet("icon", (el) => { el.src = `assets/connectors/${c.icon}.svg`; });
  cdSet("kicker", (el) => { el.textContent = c.kicker; });
  cdSet("title", (el) => { el.textContent = c.title; });
  cdSet("lede", (el) => { el.textContent = c.lede; });
  cdSet("how", (el) => { el.textContent = c.how; });
  cdSet("uses", (el) => { el.textContent = ""; c.uses.forEach((u) => { const s = document.createElement("span"); s.textContent = u; el.appendChild(s); }); });
  cdSet("facts", (el) => { el.textContent = ""; c.facts.forEach(([k, v]) => { const d = document.createElement("div"); const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; d.append(dt, dd); el.appendChild(d); }); });
  cdSet("cta", (el) => { el.firstChild.textContent = `Ativar ${c.title} `; });
  chDetail.hidden = false;
  chDetail.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "nearest" });
  chDetail.querySelector(".ch-close")?.focus({ preventScroll: true });
}
chBtns.forEach((b) => b.addEventListener("click", () => openChannel(b)));
chDetail?.querySelector("[data-ch-close]")?.addEventListener("click", () => closeChannel(true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && chOpen) closeChannel(true); });
