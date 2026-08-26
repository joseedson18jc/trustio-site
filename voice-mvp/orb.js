const orb = document.querySelector("#orb");
const canvas = document.querySelector("#orb-canvas");

if (orb && canvas) {
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const TAU = Math.PI * 2;

  const stateTuning = {
    idle:       { energy: 0.42, speed: 0.42, glow: 0.58, ring: 0.24, wobble: 0.009 },
    connecting: { energy: 0.72, speed: 1.22, glow: 0.86, ring: 0.82, wobble: 0.013 },
    listening:  { energy: 0.62, speed: 0.68, glow: 0.76, ring: 0.42, wobble: 0.012 },
    thinking:   { energy: 0.94, speed: 1.48, glow: 1.00, ring: 0.96, wobble: 0.019 },
    speaking:   { energy: 0.84, speed: 1.02, glow: 0.94, ring: 0.70, wobble: 0.016 },
  };

  const signalPoints = Array.from({ length: 18 }, (_, i) => ({
    angle: (i / 18) * TAU + ((i * 0.73) % 1),
    radius: 0.15 + ((i * 37) % 71) / 100,
    size: 0.65 + ((i * 19) % 10) / 12,
    phase: (i * 1.71) % TAU,
    drift: 0.08 + ((i * 13) % 7) / 100,
  }));

  let cssWidth = 0;
  let cssHeight = 0;
  let dpr = 1;
  let raf = 0;
  let lastTime = performance.now();
  let visualTime = 0;
  let smoothLevel = 0;
  let smoothEnergy = stateTuning.idle.energy;
  let lastRenderedState = "idle";
  let pageVisible = !document.hidden;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function roundedNoise(angle, time) {
    return (
      Math.sin(angle * 3 + time * 0.71) * 0.50 +
      Math.sin(angle * 5 - time * 0.49 + 1.7) * 0.31 +
      Math.sin(angle * 7 + time * 0.33 + 0.6) * 0.19
    );
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetWidth = Math.max(1, Math.round(cssWidth * dpr));
    const targetHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(visualTime, true);
  }

  function readVoiceLevel() {
    const raw = getComputedStyle(orb).getPropertyValue("--voice-level");
    return clamp(Number.parseFloat(raw) || 0, 0, 1);
  }

  function organicSpherePath(cx, cy, radius, time, wobble) {
    const path = new Path2D();
    const steps = 96;

    for (let i = 0; i <= steps; i += 1) {
      const angle = (i / steps) * TAU;
      const n = roundedNoise(angle, time);
      const r = radius * (1 + n * wobble);
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }

    path.closePath();
    return path;
  }

  function drawAura(cx, cy, radius, time, tuning, level) {
    const pulse = 1 + Math.sin(time * 1.35) * 0.025 + level * 0.08;
    const auraRadius = radius * (1.44 + tuning.glow * 0.11) * pulse;

    const aura = ctx.createRadialGradient(cx, cy, radius * 0.48, cx, cy, auraRadius);
    aura.addColorStop(0, `rgba(87, 118, 255, ${0.12 + tuning.glow * 0.07})`);
    aura.addColorStop(0.35, `rgba(72, 99, 255, ${0.09 + tuning.glow * 0.08})`);
    aura.addColorStop(0.62, `rgba(132, 74, 255, ${0.045 + tuning.glow * 0.045})`);
    aura.addColorStop(1, "rgba(20, 25, 46, 0)");

    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy, auraRadius, 0, TAU);
    ctx.fill();

    const cyanX = cx - radius * (0.54 + Math.sin(time * 0.42) * 0.06);
    const cyanY = cy + radius * (0.26 + Math.cos(time * 0.39) * 0.04);
    const cyan = ctx.createRadialGradient(cyanX, cyanY, 0, cyanX, cyanY, radius * 0.88);
    cyan.addColorStop(0, `rgba(48, 203, 255, ${0.08 + tuning.energy * 0.05})`);
    cyan.addColorStop(1, "rgba(48, 203, 255, 0)");
    ctx.fillStyle = cyan;
    ctx.beginPath();
    ctx.arc(cyanX, cyanY, radius * 0.9, 0, TAU);
    ctx.fill();
  }

  function drawOrbitalRings(cx, cy, radius, time, tuning) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "screen";

    const ringDefs = [
      { r: 1.17, squash: 0.54, tilt: -0.34, speed: 0.31, alpha: 0.18 },
      { r: 1.28, squash: 0.72, tilt: 0.58, speed: -0.21, alpha: 0.11 },
      { r: 1.08, squash: 0.43, tilt: 1.02, speed: 0.42, alpha: 0.10 },
    ];

    ringDefs.forEach((ring, index) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ring.tilt + time * ring.speed * tuning.speed);
      ctx.scale(1, ring.squash);

      ctx.strokeStyle = `rgba(${index === 1 ? "154, 101, 255" : "104, 174, 255"}, ${ring.alpha * (0.52 + tuning.ring)})`;
      ctx.lineWidth = 0.75 + tuning.ring * 0.55;

      const rr = radius * ring.r;
      const start = time * ring.speed * 0.8 + index * 1.7;
      ctx.beginPath();
      ctx.arc(0, 0, rr, start, start + Math.PI * (0.86 + tuning.ring * 0.25));
      ctx.stroke();

      ctx.strokeStyle = `rgba(231, 240, 255, ${0.07 + tuning.ring * 0.07})`;
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(0, 0, rr, start + Math.PI * 1.18, start + Math.PI * 1.56);
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }

  function drawFluidInterior(cx, cy, radius, time, tuning, level, spherePath) {
    ctx.save();
    ctx.clip(spherePath);

    const base = ctx.createRadialGradient(
      cx - radius * 0.34,
      cy - radius * 0.38,
      radius * 0.05,
      cx + radius * 0.08,
      cy + radius * 0.12,
      radius * 1.15,
    );
    base.addColorStop(0, "rgba(38, 52, 98, 0.88)");
    base.addColorStop(0.32, "rgba(12, 20, 47, 0.98)");
    base.addColorStop(0.72, "rgba(5, 8, 20, 1)");
    base.addColorStop(1, "rgba(1, 3, 8, 1)");
    ctx.fillStyle = base;
    ctx.fillRect(cx - radius * 1.2, cy - radius * 1.2, radius * 2.4, radius * 2.4);

    ctx.globalCompositeOperation = "screen";

    const blobs = [
      { color: [49, 113, 255], ax: 0.45, ay: 0.37, phase: 0.3, size: 0.72 },
      { color: [73, 207, 255], ax: 0.50, ay: 0.32, phase: 2.0, size: 0.54 },
      { color: [126, 72, 255], ax: 0.38, ay: 0.50, phase: 3.8, size: 0.66 },
      { color: [70, 79, 255], ax: 0.34, ay: 0.44, phase: 5.1, size: 0.48 },
    ];

    blobs.forEach((blob, index) => {
      const localTime = time * (0.34 + index * 0.055) * tuning.speed + blob.phase;
      const x = cx + Math.sin(localTime * 1.11) * radius * blob.ax;
      const y = cy + Math.cos(localTime * 0.89 + index) * radius * blob.ay;
      const rr = radius * blob.size * (1 + level * 0.08);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, rr);
      const alpha = 0.22 + tuning.energy * 0.14 + (index === 1 ? level * 0.05 : 0);
      gradient.addColorStop(0, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${alpha})`);
      gradient.addColorStop(0.45, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, ${alpha * 0.55})`);
      gradient.addColorStop(1, `rgba(${blob.color[0]}, ${blob.color[1]}, ${blob.color[2]}, 0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, TAU);
      ctx.fill();
    });

    const ribbonWidth = radius * (0.14 + tuning.energy * 0.045 + level * 0.025);
    const ribbonAlpha = 0.08 + tuning.energy * 0.08;

    for (let i = 0; i < 3; i += 1) {
      const phase = time * (0.55 + i * 0.08) * tuning.speed + i * 2.1;
      const yOffset = Math.sin(phase) * radius * 0.22 + (i - 1) * radius * 0.18;
      const gradient = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
      if (i === 1) {
        gradient.addColorStop(0, "rgba(77, 207, 255, 0)");
        gradient.addColorStop(0.45, `rgba(77, 207, 255, ${ribbonAlpha * 1.2})`);
        gradient.addColorStop(1, "rgba(90, 95, 255, 0)");
      } else {
        gradient.addColorStop(0, "rgba(110, 78, 255, 0)");
        gradient.addColorStop(0.52, `rgba(110, 78, 255, ${ribbonAlpha})`);
        gradient.addColorStop(1, "rgba(76, 166, 255, 0)");
      }

      ctx.strokeStyle = gradient;
      ctx.lineWidth = ribbonWidth * (i === 1 ? 0.74 : 1);
      ctx.lineCap = "round";
      ctx.shadowColor = i === 1 ? "rgba(80, 205, 255, 0.35)" : "rgba(112, 82, 255, 0.32)";
      ctx.shadowBlur = radius * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx - radius * 1.04, cy + yOffset);
      ctx.bezierCurveTo(
        cx - radius * 0.44,
        cy + yOffset - Math.cos(phase * 0.9) * radius * 0.42,
        cx + radius * 0.34,
        cy + yOffset + Math.sin(phase * 1.1) * radius * 0.38,
        cx + radius * 1.04,
        cy + yOffset - Math.sin(phase * 0.7) * radius * 0.12,
      );
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.globalCompositeOperation = "screen";
    signalPoints.forEach((point, index) => {
      const angle = point.angle + time * point.drift * tuning.speed;
      const drift = 1 + Math.sin(time * 0.73 + point.phase) * 0.035;
      const px = cx + Math.cos(angle) * radius * point.radius * drift;
      const py = cy + Math.sin(angle * 0.94 + point.phase * 0.1) * radius * point.radius * 0.82 * drift;
      const twinkle = 0.34 + 0.48 * (0.5 + Math.sin(time * (1.1 + point.drift) + point.phase) * 0.5);
      const alpha = twinkle * (0.34 + tuning.energy * 0.28);
      const size = point.size * (0.72 + tuning.energy * 0.18);

      ctx.fillStyle = index % 4 === 0
        ? `rgba(112, 216, 255, ${alpha})`
        : `rgba(224, 235, 255, ${alpha * 0.82})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, TAU);
      ctx.fill();
    });

    const lowerShade = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
    lowerShade.addColorStop(0, "rgba(255,255,255,0.035)");
    lowerShade.addColorStop(0.48, "rgba(255,255,255,0)");
    lowerShade.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = lowerShade;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

    const sheenX = cx - radius * 0.36 + Math.sin(time * 0.31) * radius * 0.04;
    const sheenY = cy - radius * 0.42;
    const sheen = ctx.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, radius * 0.64);
    sheen.addColorStop(0, `rgba(255,255,255,${0.19 + tuning.energy * 0.05})`);
    sheen.addColorStop(0.18, "rgba(211,231,255,0.08)");
    sheen.addColorStop(0.62, "rgba(180,211,255,0.014)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.beginPath();
    ctx.arc(sheenX, sheenY, radius * 0.64, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawRim(cx, cy, radius, time, tuning, spherePath, level) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    ctx.strokeStyle = `rgba(160, 194, 255, ${0.15 + tuning.glow * 0.12})`;
    ctx.lineWidth = 1.1;
    ctx.shadowColor = "rgba(80, 126, 255, 0.42)";
    ctx.shadowBlur = 14 + tuning.glow * 16 + level * 10;
    ctx.stroke(spherePath);

    ctx.shadowBlur = 0;
    const rim = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    rim.addColorStop(0, "rgba(255,255,255,0.62)");
    rim.addColorStop(0.18, "rgba(142,196,255,0.26)");
    rim.addColorStop(0.55, "rgba(83,110,255,0.08)");
    rim.addColorStop(0.82, "rgba(117,83,255,0.22)");
    rim.addColorStop(1, "rgba(255,255,255,0.10)");
    ctx.strokeStyle = rim;
    ctx.lineWidth = 0.85;
    ctx.stroke(spherePath);

    const glintAngle = -2.18 + Math.sin(time * 0.27) * 0.08;
    ctx.strokeStyle = `rgba(241, 248, 255, ${0.23 + tuning.energy * 0.08})`;
    ctx.lineWidth = 1.35;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.992, glintAngle, glintAngle + 0.54);
    ctx.stroke();
    ctx.restore();
  }

  function drawCorePulse(cx, cy, radius, time, tuning, level) {
    if (tuning.energy < 0.6 && level < 0.08) return;

    const pulse = 0.5 + 0.5 * Math.sin(time * (2.6 + tuning.speed * 0.6));
    const r = radius * (0.18 + tuning.energy * 0.09 + level * 0.04);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gradient.addColorStop(0, `rgba(172, 202, 255, ${0.035 + pulse * 0.035 + level * 0.035})`);
    gradient.addColorStop(0.4, `rgba(84, 131, 255, ${0.028 + tuning.energy * 0.025})`);
    gradient.addColorStop(1, "rgba(84,131,255,0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }

  function draw(t, force = false) {
    if (!ctx || !cssWidth || !cssHeight) return;

    const state = orb.dataset.state || "idle";
    const tuning = stateTuning[state] || stateTuning.idle;
    const rawLevel = readVoiceLevel();
    const speakingPulse = state === "speaking"
      ? 0.18 + (0.5 + Math.sin(t * 7.5) * 0.5) * 0.12
      : 0;
    const targetLevel = state === "listening" ? rawLevel : speakingPulse;

    smoothLevel = lerp(smoothLevel, targetLevel, force ? 1 : 0.15);
    smoothEnergy = lerp(smoothEnergy, tuning.energy, force ? 1 : 0.055);

    const cx = cssWidth / 2;
    const cy = cssHeight / 2;
    const baseRadius = Math.min(cssWidth, cssHeight) * 0.272;
    const breathe = 1 + Math.sin(t * 1.05) * 0.008;
    const stateBoost = state === "thinking" ? 0.012 : 0;
    const radius = baseRadius * (breathe + smoothLevel * 0.032 + stateBoost);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    drawAura(cx, cy, radius, t, { ...tuning, energy: smoothEnergy }, smoothLevel);
    drawOrbitalRings(cx, cy, radius, t, tuning);

    const spherePath = organicSpherePath(
      cx,
      cy,
      radius,
      t * tuning.speed,
      tuning.wobble + smoothLevel * 0.008,
    );

    drawFluidInterior(cx, cy, radius, t, tuning, smoothLevel, spherePath);
    drawCorePulse(cx, cy, radius, t, tuning, smoothLevel);
    drawRim(cx, cy, radius, t, tuning, spherePath, smoothLevel);
  }

  function render(now, force = false) {
    if (!pageVisible && !force) return;

    const delta = Math.min(50, Math.max(0, now - lastTime));
    lastTime = now;
    visualTime += delta / 1000;

    draw(visualTime, force);
    lastRenderedState = orb.dataset.state || "idle";

    if (!force && !reducedMotion.matches && pageVisible) {
      raf = requestAnimationFrame(render);
    }
  }

  function restart() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTime = performance.now();
    if (reducedMotion.matches) render(lastTime, true);
    else raf = requestAnimationFrame(render);
  }

  const observer = new ResizeObserver(resize);
  observer.observe(orb);

  const stateObserver = new MutationObserver(() => {
    const state = orb.dataset.state || "idle";
    if (state !== lastRenderedState && reducedMotion.matches) {
      draw(visualTime, true);
    }
  });
  stateObserver.observe(orb, { attributes: true, attributeFilter: ["data-state"] });

  reducedMotion.addEventListener?.("change", restart);

  document.addEventListener("visibilitychange", () => {
    pageVisible = !document.hidden;
    if (pageVisible) restart();
    else if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });

  resize();
  restart();
}
