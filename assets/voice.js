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
