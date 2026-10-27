// Campo de LEDs azuis do herói: acende onde o cursor passa e, no celular, com o scroll.
// Basta pôr <div class="hero-field" aria-hidden="true"><canvas id="network-canvas"></canvas></div>
// no herói e carregar este arquivo. Com "reduzir movimento", fica parado.
(() => {
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

class TrustioDotField {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d", { alpha: true });
    this.parent = canvas.parentElement;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.animationFrame = 0;
    this.startTime = performance.now();
    this.pointer = { x: 0, y: 0, active: false, lastMove: 0 };
    // Energia do campo: o scroll "carrega" os LEDs (0..1) e decai sozinho.
    // No celular, sem ponteiro, é o scroll que acende o fundo.
    this.energy = 0;
    this.lastScrollY = window.scrollY || 0;
    this.isManifesto = document.body.classList.contains("manifesto-page") || Boolean(canvas.closest(".hero-field"));
    this.tabVisible = !document.hidden;
    this.inViewport = true;
    this.visible = true;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.parent);
    this.bindEvents();
    this.resize();
    this.draw(this.startTime);
  }

  bindEvents() {
    // O texto do herói fica por cima do canvas: ouvir a seção inteira faz o
    // LED seguir o cursor também quando ele passa sobre título e botões.
    const alvo = this.parent.closest("section, header, .manifesto-hero") || this.parent;
    alvo.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
      this.pointer.active = true;
      this.pointer.lastMove = performance.now();
      this.wake();
    }, { passive: true });

    alvo.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });

    // Scroll vira energia: cada pixel rolado carrega o campo (teto 1), e o
    // decaimento no draw devolve o fade. Rolar rápido = LEDs bem mais vivos.
    window.addEventListener("scroll", () => {
      const y = window.scrollY || 0;
      const delta = Math.abs(y - this.lastScrollY);
      this.lastScrollY = y;
      if (delta > 0) {
        this.energy = Math.min(1, this.energy + delta / 520);
        this.wake();
      }
    }, { passive: true });

    document.addEventListener("visibilitychange", () => {
      this.tabVisible = !document.hidden;
      this.syncVisibility();
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          this.inViewport = entry.isIntersecting;
          this.syncVisibility();
        });
      }, { threshold: 0.02 }).observe(this.parent);
    }

    window.addEventListener("resize", () => this.resize(), { passive: true });
  }

  // Um evento novo (mouse/scroll) religa o loop mesmo que ele estivesse parado.
  wake() {
    if (this.visible && !this.animationFrame && !reducedMotion.matches) {
      this.animationFrame = window.requestAnimationFrame((time) => this.draw(time));
    }
  }

  // Draw only while the tab is active AND the hero is on screen — saves a full-canvas repaint per frame otherwise.
  syncVisibility() {
    this.visible = this.tabVisible && this.inViewport;
    if (this.visible && !this.animationFrame && !reducedMotion.matches) {
      this.animationFrame = window.requestAnimationFrame((time) => this.draw(time));
    }
  }

  resize() {
    const rect = this.parent.getBoundingClientRect();
    const availableWidth = Math.min(rect.width, window.innerWidth);
    this.width = Math.max(1, Math.round(availableWidth));
    this.height = Math.max(1, Math.round(rect.height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.maxWidth = "100%";
    this.canvas.style.height = "100%";
    this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(time) {
    this.animationFrame = 0;
    const ctx = this.context;
    const width = this.width;
    const height = this.height;
    if (!ctx || width <= 1 || height <= 1) return;

    // A energia decai ~5% por frame: o brilho do scroll esvai em ~1s.
    this.energy *= 0.95;
    const energy = reducedMotion.matches ? 0 : this.energy;

    ctx.clearRect(0, 0, width, height);
    // Grade mais densa (LED de painel de verdade) e blend aditivo: pontos
    // somados sobre o fundo escuro geram o brilho "neon" moderno.
    const step = this.isManifesto ? Math.max(26, width / 38) : Math.max(22, width / 34);
    const elapsed = time - this.startTime;
    const recentlyMoved = time - this.pointer.lastMove < 1400;
    const pointerActive = this.pointer.active && recentlyMoved;
    const sourceX = pointerActive
      ? this.pointer.x
      : width * (0.52 + Math.sin(elapsed * 0.00022) * 0.28);
    const sourceY = pointerActive
      ? this.pointer.y
      : height * (0.48 + Math.cos(elapsed * 0.00031) * 0.12);
    const cycle = 4000;
    const waveWidth = this.isManifesto ? 190 : 150;
    const maxDistance = Math.hypot(width, height);
    // O scroll acelera a onda: campo carregado atravessa a tela mais rápido.
    const waveSpeed = 0.13 * (1 + energy * 2.4);
    const waveRadius = reducedMotion.matches ? maxDistance * 0.34 : ((elapsed * waveSpeed) % (maxDistance + waveWidth));
    // Halo persistente ao redor do cursor — LED acende onde o mouse está.
    const haloR = pointerActive ? 230 : 0;
    const near = [];

    ctx.globalCompositeOperation = "lighter";
    for (let y = step * 0.5; y < height; y += step) {
      for (let x = step * 0.5; x < width; x += step) {
        const distance = Math.hypot(x - sourceX, y - sourceY);
        const waveDistance = Math.abs(distance - waveRadius);
        const wave = Math.max(0, 1 - waveDistance / waveWidth);
        const halo = haloR > 0 ? Math.max(0, 1 - Math.hypot(x - this.pointer.x, y - this.pointer.y) / haloR) : 0;
        const shimmer = reducedMotion.matches
          ? 0
          : Math.max(0, Math.sin((elapsed + x * 12 + y * 8) / cycle * Math.PI * 2) - 0.74) * 0.16;
        // base + onda + energia do scroll + halo do cursor + cintilação
        const alpha = Math.min(0.95,
          (this.isManifesto ? 0.14 : 0.22)
          + wave * (0.66 + energy * 0.3)
          + energy * 0.28
          + halo * 0.62
          + shimmer);
        const radius = (this.isManifesto ? 1.1 : 1.25)
          + wave * (1.6 + energy * 0.9)
          + energy * 0.7
          + halo * 1.35;

        // núcleo: azul-sinal com toque de branco quando muito aceso
        const hot = Math.max(wave, halo, energy);
        ctx.beginPath();
        ctx.fillStyle = hot > 0.25
          ? `rgba(${Math.round(94 + hot * 120)}, ${Math.round(167 + hot * 70)}, 255, ${alpha})`
          : `rgba(96, 118, 152, ${Math.min(0.5, alpha)})`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // halo difuso dos LEDs mais acesos (onda no pico, cursor ou scroll)
        if (hot > 0.5) {
          ctx.beginPath();
          ctx.fillStyle = `rgba(94, 167, 255, ${(hot - 0.5) * (0.2 + energy * 0.14)})`;
          ctx.arc(x, y, radius * 4.2, 0, Math.PI * 2);
          ctx.fill();
        }

        // coleciona os acesos perto do cursor para as linhas de constelação
        if (halo > 0.45) near.push({ x, y, b: halo });
      }
    }

    // Constelação: liga os LEDs acesos ao redor do cursor (poucos pontos,
    // custo desprezível) — dá o toque "tech vivo" sem virar árvore de Natal.
    if (near.length > 1 && !reducedMotion.matches) {
      for (let i = 0; i < near.length; i += 1) {
        for (let j = i + 1; j < near.length; j += 1) {
          const d = Math.hypot(near[i].x - near[j].x, near[i].y - near[j].y);
          if (d < step * 2.05) {
            const la = Math.min(0.4, (near[i].b + near[j].b) * 0.22 * (1 - d / (step * 2.05)));
            if (la <= 0.02) continue;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(94, 167, 255, ${la})`;
            ctx.lineWidth = 0.7;
            ctx.moveTo(near[i].x, near[i].y);
            ctx.lineTo(near[j].x, near[j].y);
            ctx.stroke();
          }
        }
      }
    }
    ctx.globalCompositeOperation = "source-over";

    if (!reducedMotion.matches && this.visible) {
      this.animationFrame = window.requestAnimationFrame((nextTime) => this.draw(nextTime));
    }
  }
}

document.querySelectorAll("#network-canvas").forEach((canvas) => {
  if (canvas instanceof HTMLCanvasElement) new TrustioDotField(canvas);
});
})();
