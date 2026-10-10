// Trustio · animações 3D dos modelos (página /modelos): Flash (raio) e Heavy Thinking (peso).
// As marcas são as mesmas de assets/modelos/*.svg (grade de 96, gradientes da tampa e do corpo),
// extrudadas em 3D. O three.js só é baixado quando o palco chega perto da tela; sem WebGL, ou com
// "reduzir movimento", fica a marca estática (a imagem que já está no palco) ou um quadro parado.
const PALCOS = [...document.querySelectorAll("[data-tm3d]")];
const REDUZIR = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function temWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}

if (PALCOS.length && temWebGL()) {
  const io = new IntersectionObserver((itens) => {
    if (!itens.some((i) => i.isIntersecting)) return;
    io.disconnect();
    import("./vendor/three/three.module.min.js").then((THREE) => {
      PALCOS.forEach((palco) => { try { montar(THREE, palco); } catch (e) { console.error("tm3d", e); } });
    }).catch((e) => console.error("tm3d: three.js", e));
  }, { rootMargin: "300px 0px" });
  PALCOS.forEach((p) => io.observe(p));
}

// ───────────────────────────────────────────────────────────── marcas (grade 96 → mundo)
const ESCALA = 0.03; // 96 unidades ≈ 2,9 do mundo
const px = (x) => (x - 48) * ESCALA;
const py = (y) => (48 - y) * ESCALA;

// Comandos simples (M, L, H, V, Q, Z) dos caminhos de assets/modelos/*.svg.
function forma(THREE, cmds) {
  const s = new THREE.Shape();
  let x = 0, y = 0;
  for (const [op, ...a] of cmds) {
    if (op === "M") { x = a[0]; y = a[1]; s.moveTo(px(x), py(y)); }
    else if (op === "L") { x = a[0]; y = a[1]; s.lineTo(px(x), py(y)); }
    else if (op === "H") { x = a[0]; s.lineTo(px(x), py(y)); }
    else if (op === "V") { y = a[0]; s.lineTo(px(x), py(y)); }
    else if (op === "Q") { s.quadraticCurveTo(px(a[0]), py(a[1]), px(a[2]), py(a[3])); x = a[2]; y = a[3]; }
  }
  s.closePath();
  return s;
}

const PECAS = {
  flash: [
    { cmds: [["M", 25.4, 24], ["Q", 29, 12, 41, 12], ["H", 86], ["L", 79.7, 31], ["H", 52], ["L", 14, 60]],
      cores: ["#5EA7FF", "#2563EB"], eixo: "diag" },
    { cmds: [["M", 10.4, 74.2], ["L", 57.5, 38.2], ["L", 64, 46], ["H", 71], ["L", 65.5, 62], ["H", 40], ["L", 32, 86], ["H", 7]],
      cores: ["#2E6BF0", "#0F2C6B"], eixo: "y" },
  ],
  heavy: [
    { cmds: [["M", 10, 28], ["Q", 10, 10, 28, 10], ["H", 40], ["V", 38], ["H", 32], ["V", 58], ["H", 58], ["V", 86], ["H", 28], ["Q", 10, 86, 10, 68]],
      cores: ["#5EA7FF", "#2E6BF0", "#0F2C6B"], eixo: "y" },
    { cmds: [["M", 56, 10], ["H", 68], ["Q", 86, 10, 86, 28], ["V", 68], ["Q", 86, 86, 68, 86], ["H", 62], ["V", 38], ["H", 56]],
      cores: ["#2563EB", "#5EA7FF"], eixo: "y" },
  ],
};

function pintar(THREE, geo, cores, eixo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, pos = geo.attributes.position;
  const cs = cores.map((c) => new THREE.Color(c));
  const out = new Float32Array(pos.count * 3), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x || 1);
    const y = 1 - (pos.getY(i) - b.min.y) / (b.max.y - b.min.y || 1); // 0 em cima
    let t = eixo === "diag" ? (x + y) / 2 : y;
    t = Math.min(1, Math.max(0, t));
    const seg = t * (cs.length - 1), k = Math.min(cs.length - 2, Math.floor(seg));
    tmp.copy(cs[k]).lerp(cs[k + 1], seg - k);
    out[i * 3] = tmp.r; out[i * 3 + 1] = tmp.g; out[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(out, 3));
}

function marca(THREE, tipo) {
  const grupo = new THREE.Group(), meshes = [];
  for (const p of PECAS[tipo]) {
    const geo = new THREE.ExtrudeGeometry(forma(THREE, p.cmds), {
      depth: 0.32, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.045, bevelSegments: 4, curveSegments: 24,
    });
    geo.translate(0, 0, -0.16);
    pintar(THREE, geo, p.cores, p.eixo);
    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, metalness: 0.25, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25,
      emissive: new THREE.Color("#0b2a6b"), emissiveIntensity: 0.18,
    });
    const m = new THREE.Mesh(geo, mat);
    grupo.add(m); meshes.push(m);
  }
  return { grupo, meshes };
}

// Textura redonda e suave para as partículas.
function pontoTextura(THREE) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.35, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────────────────────────────────────────── palco comum
function montar(THREE, palco) {
  const tipo = palco.dataset.tm3d;
  if (!PECAS[tipo]) return;
  const canvas = document.createElement("canvas");
  canvas.className = "tm-canvas";
  canvas.setAttribute("aria-hidden", "true");
  palco.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  camera.position.set(0, 0, 7.6);

  cena.add(new THREE.AmbientLight(0xffffff, 0.55));
  const chave = new THREE.DirectionalLight(0xffffff, 2.4); chave.position.set(3, 4, 6); cena.add(chave);
  const contra = new THREE.DirectionalLight(0x5ea7ff, 1.6); contra.position.set(-5, -2, -3); cena.add(contra);
  const topo = new THREE.DirectionalLight(0x9fc6ff, 0.8); topo.position.set(0, 6, 1); cena.add(topo);

  const { grupo, meshes } = marca(THREE, tipo);
  const pivo = new THREE.Group(); pivo.add(grupo); cena.add(pivo);

  const anim = tipo === "flash" ? cenaFlash(THREE, cena, pivo, grupo, meshes) : cenaHeavy(THREE, cena, pivo, grupo, meshes, camera);

  // Inclinação seguindo o ponteiro (suave).
  const alvo = { x: 0, y: 0 };
  palco.addEventListener("pointermove", (e) => {
    const r = palco.getBoundingClientRect();
    alvo.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
    alvo.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  palco.addEventListener("pointerleave", () => { alvo.x = 0; alvo.y = 0; });

  function medir() {
    const w = palco.clientWidth, h = palco.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Em palco estreito (celular), afasta a câmera para a marca caber.
    camera.position.z = w / h < 1.2 ? 8.8 : 7.6;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { medir(); if (REDUZIR) desenhar(0); }).observe(palco);
  medir();

  let visivel = false, ultimo = 0, t = 0, rodando = false;
  function desenhar(dt) {
    pivo.rotation.y += ((alvo.x * 0.35) - pivo.rotation.y) * Math.min(1, dt * 3);
    pivo.rotation.x += ((alvo.y * 0.22) - pivo.rotation.x) * Math.min(1, dt * 3);
    anim(t, dt);
    renderer.render(cena, camera);
  }
  function quadro(agora) {
    if (!visivel || document.hidden) { rodando = false; return; }
    const dt = Math.min(0.05, (agora - (ultimo || agora)) / 1000);
    ultimo = agora; t += dt;
    desenhar(dt);
    requestAnimationFrame(quadro);
  }
  function ligar() { if (!rodando && visivel && !document.hidden && !REDUZIR) { rodando = true; ultimo = 0; requestAnimationFrame(quadro); } }

  new IntersectionObserver((it) => { visivel = it[0].isIntersecting; ligar(); }).observe(palco);
  document.addEventListener("visibilitychange", ligar);
  palco.classList.add("tm-pronto");
  if (REDUZIR) { t = tipo === "flash" ? 0.08 : 4; desenhar(0); }
}

// ───────────────────────────────────────────────────────────── Flash: raios e velocidade
function cenaFlash(THREE, cena, pivo, grupo, meshes) {
  const g = new THREE.Group(); cena.add(g);
  // Ponto de impacto: o corte do raio dentro da marca (entre a cunha da tampa e a ponta do corpo).
  const impactoLocal = new THREE.Vector3(px(36), py(48), 0.2);
  const luz = new THREE.PointLight(0xbfdcff, 0, 6, 1.6); cena.add(luz);

  // Linhas de velocidade atrás da marca.
  const N = 34, pos = new Float32Array(N * 6), vel = [];
  for (let i = 0; i < N; i++) vel.push(reiniciaTraco(i, true));
  const tracos = new THREE.LineSegments(
    (() => { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); return geo; })(),
    new THREE.LineBasicMaterial({ color: 0x5ea7ff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  tracos.position.z = -1.6; cena.add(tracos);
  function reiniciaTraco(i, inicio) {
    return { x: inicio ? Math.random() * 10 - 5 : 5 + Math.random() * 2, y: (Math.random() - 0.5) * 3.6, l: 0.4 + Math.random() * 1.4, v: 3 + Math.random() * 5 };
  }

  // Faíscas do impacto.
  const NF = 90, fpos = new Float32Array(NF * 3), fvel = new Float32Array(NF * 3);
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  const fmat = new THREE.PointsMaterial({ color: 0xcfe4ff, size: 0.07, map: pontoTextura(THREE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const faiscas = new THREE.Points(fgeo, fmat); cena.add(faiscas);
  let vidaFaisca = 0;

  // Raio: fita (dois triângulos por segmento) no plano da tela, núcleo claro e halo azul.
  function fita(pontos, largura) {
    const v = [];
    for (let i = 0; i < pontos.length - 1; i++) {
      const a = pontos[i], b = pontos[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l * largura, ny = dx / l * largura;
      v.push(a.x + nx, a.y + ny, a.z, a.x - nx, a.y - ny, a.z, b.x + nx, b.y + ny, b.z,
             a.x - nx, a.y - ny, a.z, b.x - nx, b.y - ny, b.z, b.x + nx, b.y + ny, b.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    return geo;
  }
  function trajeto(de, ate, geracoes, desvio) {
    let pts = [de.clone(), ate.clone()];
    for (let gnum = 0; gnum < geracoes; gnum++) {
      const novo = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], m = a.clone().lerp(b, 0.5);
        const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
        const off = (Math.random() - 0.5) * desvio;
        m.x += -dy / l * off; m.y += dx / l * off;
        novo.push(m, b);
      }
      pts = novo; desvio *= 0.55;
    }
    return pts;
  }
  const raios = [];
  function disparar() {
    const alvo = grupo.localToWorld(impactoLocal.clone());
    const de = new THREE.Vector3(alvo.x + (Math.random() - 0.3) * 2.6, 2.6, alvo.z + 0.1);
    const principal = trajeto(de, alvo, 6, 1.1);
    const conjunto = [{ pts: principal, w: 1 }];
    for (let k = 0; k < 2; k++) {
      const i = Math.floor(principal.length * (0.25 + Math.random() * 0.4));
      const p = principal[i], fim = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, -0.5 - Math.random() * 0.9, 0));
      conjunto.push({ pts: trajeto(p, fim, 4, 0.5), w: 0.55 });
    }
    const itens = [];
    for (const r of conjunto) {
      const halo = new THREE.Mesh(fita(r.pts, 0.045 * r.w), new THREE.MeshBasicMaterial({ color: 0x5ea7ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      const nucleo = new THREE.Mesh(fita(r.pts, 0.012 * r.w), new THREE.MeshBasicMaterial({ color: 0xf4f6fa, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(halo, nucleo); itens.push(halo, nucleo);
    }
    raios.push({ itens, vida: 0 });
    luz.position.copy(alvo).add(new THREE.Vector3(0, 0.4, 0.8)); luz.intensity = 26;
    for (let i = 0; i < NF; i++) {
      fpos[i * 3] = alvo.x; fpos[i * 3 + 1] = alvo.y; fpos[i * 3 + 2] = alvo.z + 0.1;
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 2.2;
      fvel[i * 3] = Math.cos(a) * s; fvel[i * 3 + 1] = Math.sin(a) * s * 0.8 + 0.6; fvel[i * 3 + 2] = (Math.random() - 0.3) * 1.2;
    }
    fgeo.attributes.position.needsUpdate = true; vidaFaisca = 0.9;
  }

  let proximo = 0.05;
  return function (t, dt) {
    // Marca flutuando, com leve impulso para a frente (velocidade).
    grupo.position.y = Math.sin(t * 1.6) * 0.05;
    grupo.rotation.z = Math.sin(t * 0.9) * 0.025;
    for (let i = 0; i < N; i++) {
      const s = vel[i];
      s.x -= s.v * dt;
      if (s.x + s.l < -5) vel[i] = reiniciaTraco(i, false);
      const c = vel[i];
      pos.set([c.x, c.y, 0, c.x + c.l, c.y, 0], i * 6);
    }
    tracos.geometry.attributes.position.needsUpdate = true;

    if (t >= proximo) { disparar(); proximo = t + (Math.random() < 0.3 ? 0.18 : 1.3 + Math.random() * 1.6); }
    for (let i = raios.length - 1; i >= 0; i--) {
      const r = raios[i]; r.vida += dt;
      const piscar = r.vida < 0.12 ? 1 : Math.max(0, 1 - (r.vida - 0.12) / 0.3) * (Math.random() > 0.25 ? 1 : 0.35);
      r.itens.forEach((m, k) => { m.material.opacity = (k % 2 ? 1 : 0.55) * piscar; });
      if (r.vida > 0.45) { r.itens.forEach((m) => { g.remove(m); m.geometry.dispose(); m.material.dispose(); }); raios.splice(i, 1); }
    }
    luz.intensity *= Math.pow(0.0008, dt);
    meshes.forEach((m) => { m.material.emissiveIntensity = 0.18 + Math.min(0.9, luz.intensity / 30); });
    if (vidaFaisca > 0) {
      vidaFaisca -= dt;
      for (let i = 0; i < NF; i++) {
        fvel[i * 3 + 1] -= 3.2 * dt;
        fpos[i * 3] += fvel[i * 3] * dt; fpos[i * 3 + 1] += fvel[i * 3 + 1] * dt; fpos[i * 3 + 2] += fvel[i * 3 + 2] * dt;
      }
      fgeo.attributes.position.needsUpdate = true;
      fmat.opacity = Math.max(0, vidaFaisca / 0.9);
    }
  };
}

// ───────────────────────────────────────────────────────────── Heavy: peso e pensamento
function cenaHeavy(THREE, cena, pivo, grupo, meshes, camera) {
  const [esq, dir] = meshes;
  const CICLO = 10, ENCAIXE = 1.5, SOLTA = 8.6;
  const longeE = new THREE.Vector3(-0.72, 0.62, 0.2), longeD = new THREE.Vector3(0.72, -0.58, 0.2);
  const centro = new THREE.Vector3(px(47), py(48), 0); // a câmara da marca

  // Partículas em espiral, puxadas para dentro da câmara ("pensando").
  const N = 520, pos = new Float32Array(N * 3), cor = new Float32Array(N * 3), est = [];
  const paleta = ["#5EA7FF", "#2E6BF0", "#2563EB", "#9FC6FF"].map((c) => new THREE.Color(c));
  function nasce(i, longe) {
    const r = longe ? 2.0 + Math.random() * 1.2 : 0.4 + Math.random() * 2.8;
    est[i] = { r, a: Math.random() * Math.PI * 2, h: (Math.random() - 0.5) * 0.9, v: 0.25 + Math.random() * 0.45, inc: (Math.random() - 0.5) * 0.9 };
    const c = paleta[(Math.random() * paleta.length) | 0];
    cor.set([c.r, c.g, c.b], i * 3);
  }
  for (let i = 0; i < N; i++) nasce(i, false);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(cor, 3));
  const mat = new THREE.PointsMaterial({ size: 0.075, map: pontoTextura(THREE), vertexColors: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const nuvem = new THREE.Points(geo, mat); grupo.add(nuvem);

  // Onda de choque do encaixe.
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0x5ea7ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  anel.position.z = -0.3; cena.add(anel);
  const brilho = new THREE.PointLight(0x9fc6ff, 0, 5, 1.5); brilho.position.set(centro.x, centro.y, 0.9); grupo.add(brilho);

  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let impactoEm = -10, ultimoCiclo = -1;
  const camBase = camera.position.clone();

  return function (t, dt) {
    const c = t % CICLO, n = Math.floor(t / CICLO);
    let k; // 0 = encaixado, 1 = afastado
    if (c < ENCAIXE) k = 1 - easeIn(c / ENCAIXE);
    else if (c < SOLTA) k = 0;
    else k = easeInOut((c - SOLTA) / (CICLO - SOLTA));
    if (c >= ENCAIXE && ultimoCiclo !== n) { ultimoCiclo = n; impactoEm = t; }
    esq.position.copy(longeE).multiplyScalar(k); esq.rotation.z = k * 0.35;
    dir.position.copy(longeD).multiplyScalar(k); dir.rotation.z = -k * 0.3;

    // Impacto: tremor curto, anel e luz na câmara.
    const ti = t - impactoEm;
    const tremor = ti < 0.45 ? (1 - ti / 0.45) * 0.06 : 0;
    camera.position.set(camBase.x + (Math.random() - 0.5) * tremor, camBase.y + (Math.random() - 0.5) * tremor, camera.position.z);
    if (ti < 1.4) { const s = 0.9 + ti * 1.8; anel.scale.set(s, s, 1); anel.material.opacity = 0.55 * (1 - ti / 1.4); }
    else anel.material.opacity = 0;
    grupo.position.y = ti < 0.3 ? -Math.sin(ti / 0.3 * Math.PI) * 0.08 : Math.sin(t * 0.8) * 0.03;
    const pensando = 1 - k;
    brilho.intensity = (ti < 0.6 ? (1 - ti / 0.6) * 16 : 0) + pensando * (2.2 + Math.sin(t * 3) * 0.8);
    meshes.forEach((m) => { m.material.emissiveIntensity = 0.16 + pensando * 0.12; });
    grupo.rotation.y = Math.sin(t * 0.35) * 0.32;

    // Pensamento: as partículas giram e afundam na câmara; ao chegar, renascem por fora.
    const puxa = 0.15 + pensando * 0.75;
    for (let i = 0; i < N; i++) {
      const p = est[i];
      p.a += p.v * dt * (1 + 1.4 / (p.r + 0.3));
      p.r -= dt * puxa * (0.25 + 0.6 / (p.r + 0.4));
      if (p.r < 0.12) nasce(i, true);
      const x = Math.cos(p.a) * p.r, z = Math.sin(p.a) * p.r * 0.55;
      pos[i * 3] = centro.x + x;
      pos[i * 3 + 1] = centro.y + p.h * Math.min(1, p.r) + Math.sin(p.a) * p.inc * p.r * 0.4;
      pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    mat.opacity = 0.45 + pensando * 0.55;
  };
}
