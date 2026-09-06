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

// --- hero orb: opens the Agent Builder console (the orb speaks there)
const heroOrb = document.querySelector("[data-hero-orb]");
const heroLine = "Olá! Aqui é a Trustio. Posso confirmar seu agendamento de quinta-feira às dez, ou você prefere outro horário?";
function openConsole() { stop(); location.href = heroOrb?.dataset.console || "console/"; }
heroOrb?.addEventListener("click", openConsole);
heroOrb?.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openConsole(); } });
// "Ouvir o agente" keeps the preview in place on this page
function heroSpeak() { if (heroOrb) play("hero", heroOrb, heroLine); }
document.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); heroSpeak(); heroOrb?.scrollIntoView({ behavior: rm.matches ? "auto" : "smooth", block: "center" }); }));

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
