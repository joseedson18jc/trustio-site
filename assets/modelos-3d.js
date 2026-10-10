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

// ───────────────────────────────────────────────────────────── brilho em shader
// Fitas (raios, corrente) e anéis (onda de choque) com perfil gaussiano: núcleo claro e halo suave,
// somados à cena (aditivo). Cores em sRGB direto, sem conversão.
const corV = (THREE, hex) => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255); };
const VS_UV = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
const FS_FITA = `
uniform vec3 uCor; uniform vec3 uNucleo; uniform float uOpac; uniform float uProg; uniform float uCauda; uniform float uHalo;
varying vec2 vUv;
void main(){
  float v = vUv.y, u = vUv.x;
  float nucleo = exp(-pow(v * 3.4, 2.0));
  float halo = exp(-pow(v * 1.2, 2.0)) * uHalo;
  float revela = 1.0 - smoothstep(uProg - 0.05, uProg, u);
  float apaga = smoothstep(uCauda - 0.18, uCauda, u);
  float a = (nucleo + halo) * revela * apaga * uOpac;
  gl_FragColor = vec4(mix(uCor, uNucleo, nucleo), a);
}`;
const FS_ANEL = `
uniform float uR; uniform float uW; uniform float uOpac; uniform float uT; uniform vec3 uA; uniform vec3 uB;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0; float d = length(p);
  float anel = exp(-pow((d - uR) / uW, 2.0));
  float rastro = exp(-pow((d - uR * 0.82) / (uW * 3.0), 2.0)) * 0.22;
  float ang = atan(p.y, p.x);
  vec3 c = mix(uA, uB, 0.5 + 0.5 * sin(ang * 2.0 + uT * 1.7 + d * 6.0));
  float a = (anel + rastro) * uOpac * (1.0 - smoothstep(0.9, 1.0, d));
  gl_FragColor = vec4(c, a);
}`;

function matFita(THREE, cor, nucleo, halo) {
  return new THREE.ShaderMaterial({
    vertexShader: VS_UV, fragmentShader: FS_FITA, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCor: { value: corV(THREE, cor) }, uNucleo: { value: corV(THREE, nucleo) }, uOpac: { value: 0 }, uProg: { value: 1.1 }, uCauda: { value: 0 }, uHalo: { value: halo } },
  });
}
function matAnel(THREE, a, b) {
  return new THREE.ShaderMaterial({
    vertexShader: VS_UV, fragmentShader: FS_ANEL, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uR: { value: 0 }, uW: { value: 0.08 }, uOpac: { value: 0 }, uT: { value: 0 }, uA: { value: corV(THREE, a) }, uB: { value: corV(THREE, b) } },
  });
}
// Fita ao longo de uma polilinha no plano XY: u = posição ao longo (0..1), v = -1..1 na largura.
function geoFita(THREE, pts, largura, afina) {
  const n = pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = [];
  const acc = [0];
  for (let i = 1; i < n; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const total = acc[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    const u = acc[i] / total, w = largura * (1 - afina * u);
    const nx = -dy / l * w, ny = dx / l * w, p = pts[i];
    pos.set([p.x + nx, p.y + ny, p.z, p.x - nx, p.y - ny, p.z], i * 6);
    uv.set([u, 1, u, -1], i * 4);
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
// Caminho de raio por deslocamento do ponto médio.
function trajeto(THREE, de, ate, geracoes, desvio) {
  let pts = [de.clone(), ate.clone()];
  for (let g = 0; g < geracoes; g++) {
    const novo = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], m = a.clone().lerp(b, 0.5);
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1, off = (Math.random() - 0.5) * desvio;
      m.x += -dy / l * off; m.y += dx / l * off;
      novo.push(m, b);
    }
    pts = novo; desvio *= 0.56;
  }
  return pts;
}
function clarao(THREE, cor, escala) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: pontoTextura(THREE), color: cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(escala); return s;
}
const easeOutExpo = (x) => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);

// ───────────────────────────────────────────────────────────── Flash: raio, corrente e velocidade
function cenaFlash(THREE, cena, pivo, grupo, meshes) {
  const g = new THREE.Group(); cena.add(g);
  const impactoLocal = new THREE.Vector3(px(36), py(48), 0.2); // o corte do raio na marca
  const luz = new THREE.PointLight(0xbfdcff, 0, 7, 1.5); cena.add(luz);
  const flare = clarao(THREE, 0xdbeaff, 1.2); cena.add(flare);

  // Corrente elétrica dentro do corte da marca (centro do vão diagonal), redesenhada a cada ~45 ms.
  const corteA = new THREE.Vector3(px(56), py(34.6), 0.02), corteB = new THREE.Vector3(px(13), py(67), 0.02);
  const matCorrente = matFita(THREE, "#5EA7FF", "#F4F6FA", 0.7);
  const corrente = new THREE.Mesh(new THREE.BufferGeometry(), matCorrente); grupo.add(corrente);
  let proxCorrente = 0, energia = 0;
  function redesenhaCorrente() {
    corrente.geometry.dispose();
    corrente.geometry = geoFita(THREE, trajeto(THREE, corteA, corteB, 5, 0.16), 0.03, 0.2);
  }

  // Linhas de velocidade: cabeça clara, cauda transparente.
  const N = 40, pos = new Float32Array(N * 6), cor = new Float32Array(N * 8), tr = [];
  const novoTraco = (inicio) => ({ x: inicio ? Math.random() * 11 - 5.5 : 5.5 + Math.random() * 2, y: (Math.random() - 0.5) * 3.8, l: 0.5 + Math.random() * 1.6, v: 3.5 + Math.random() * 5.5, a: 0.25 + Math.random() * 0.45 });
  for (let i = 0; i < N; i++) tr.push(novoTraco(true));
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  tgeo.setAttribute("color", new THREE.BufferAttribute(cor, 4));
  const tracos = new THREE.LineSegments(tgeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tracos.position.z = -1.8; cena.add(tracos);

  // Faíscas.
  const NF = 120, fpos = new Float32Array(NF * 3), fvel = new Float32Array(NF * 3);
  const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  const fmat = new THREE.PointsMaterial({ color: 0xd6e8ff, size: 0.06, map: pontoTextura(THREE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  cena.add(new THREE.Points(fgeo, fmat));
  let vidaFaisca = 0;

  // Raio: fitas com shader, desenhadas do céu até o alvo, com repiques e cauda que recolhe.
  let raio = null, proximo = 0.05;
  function limpaRaio() { if (!raio) return; raio.partes.forEach((p) => { g.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); }); raio = null; }
  function disparar() {
    limpaRaio();
    const alvo = grupo.localToWorld(impactoLocal.clone());
    const de = new THREE.Vector3(alvo.x + (Math.random() - 0.35) * 2.2, 2.9, alvo.z + 0.15);
    const principal = trajeto(THREE, de, alvo, 7, 1.0);
    const partes = [{ pts: principal, w: 0.11, atraso: 0, peso: 1 }];
    const nRamos = 2 + (Math.random() * 2 | 0);
    for (let k = 0; k < nRamos; k++) {
      const i = Math.floor(principal.length * (0.2 + Math.random() * 0.5)), p = principal[i];
      const fim = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.9, -0.45 - Math.random() * 0.8, 0));
      partes.push({ pts: trajeto(THREE, p, fim, 5, 0.45), w: 0.05, atraso: i / principal.length * 0.07, peso: 0.55 });
    }
    raio = { t: 0, alvo, impacto: false, repiques: Math.random() < 0.55 ? [0.16, 0.27] : [0.18], partes: partes.map((p) => {
      const m = new THREE.Mesh(geoFita(THREE, p.pts, p.w, p.peso < 1 ? 0.85 : 0.35), matFita(THREE, "#5EA7FF", "#F4F6FA", 0.75));
      g.add(m); return { m, atraso: p.atraso, peso: p.peso };
    }) };
  }
  function impacto(alvo) {
    luz.position.copy(alvo).add(new THREE.Vector3(0, 0.3, 0.9)); luz.intensity = 30;
    flare.position.copy(alvo).add(new THREE.Vector3(0, 0, 0.3));
    energia = 1;
    for (let i = 0; i < NF; i++) {
      fpos.set([alvo.x, alvo.y, alvo.z + 0.1], i * 3);
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 2.6;
      fvel.set([Math.cos(a) * s, Math.sin(a) * s * 0.7 + 0.7, (Math.random() - 0.3) * 1.4], i * 3);
    }
    fgeo.attributes.position.needsUpdate = true; vidaFaisca = 1;
  }

  return function (t, dt) {
    const estatico = dt === 0;
    grupo.position.y = Math.sin(t * 1.6) * 0.05;
    grupo.rotation.z = Math.sin(t * 0.9) * 0.025;

    for (let i = 0; i < N; i++) {
      const s = tr[i]; s.x -= s.v * dt;
      if (s.x + s.l < -5.5) tr[i] = novoTraco(false);
      const c = tr[i];
      pos.set([c.x, c.y, 0, c.x + c.l, c.y, 0], i * 6);
      cor.set([0.37, 0.65, 1, c.a, 0.37, 0.65, 1, 0], i * 8);
    }
    tgeo.attributes.position.needsUpdate = true; tgeo.attributes.color.needsUpdate = true;

    if (t >= proximo) { disparar(); proximo = t + (Math.random() < 0.25 ? 0.6 : 1.6 + Math.random() * 1.8); }
    if (raio) {
      raio.t += estatico ? 0.1 : dt;
      const rt = raio.t;
      // Brilho: acende ao chegar, repica e decai; a cauda recolhe de cima para baixo.
      let brilho = rt < 0.07 ? 1 : Math.max(0, 1 - (rt - 0.07) / 0.5);
      for (const r of raio.repiques) { const d = rt - r; if (d > 0 && d < 0.09) brilho = Math.max(brilho, 1 - d / 0.09); }
      raio.partes.forEach((p) => {
        const u = p.m.material.uniforms;
        u.uProg.value = Math.min(1.1, Math.max(0, (rt - p.atraso) / 0.07) * 1.1);
        u.uCauda.value = rt < 0.32 ? 0 : Math.min(1.2, (rt - 0.32) / 0.3 * 1.2);
        u.uOpac.value = brilho * p.peso * 1.25;
      });
      if (!raio.impacto && rt >= 0.07) { raio.impacto = true; impacto(raio.alvo); }
      if (rt > 0.7) limpaRaio();
    }

    // Clarão do impacto, luz e brilho da marca.
    luz.intensity *= Math.pow(0.002, dt);
    const k = Math.min(1, luz.intensity / 30);
    flare.material.opacity = k * 0.85; flare.scale.setScalar(0.6 + (1 - k) * 1.4);
    meshes.forEach((m) => { m.material.emissiveIntensity = 0.18 + k * 0.65; });

    // Corrente no corte: forte logo após o impacto, um fio sutil no resto do tempo.
    energia = Math.max(0, energia - dt * 1.3);
    if (t >= proxCorrente || estatico) { redesenhaCorrente(); proxCorrente = t + 0.045; }
    matCorrente.uniforms.uOpac.value = 0.18 + energia * 1.1 + Math.random() * 0.06;

    if (vidaFaisca > 0) {
      vidaFaisca -= dt;
      for (let i = 0; i < NF; i++) {
        fvel[i * 3] *= 0.985; fvel[i * 3 + 1] = fvel[i * 3 + 1] * 0.985 - 3.4 * dt;
        fpos[i * 3] += fvel[i * 3] * dt; fpos[i * 3 + 1] += fvel[i * 3 + 1] * dt; fpos[i * 3 + 2] += fvel[i * 3 + 2] * dt;
      }
      fgeo.attributes.position.needsUpdate = true;
      fmat.opacity = Math.max(0, vidaFaisca) * 0.9;
    }
  };
}

// ───────────────────────────────────────────────────────────── Heavy: peso, encaixe e pensamento
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
  grupo.add(new THREE.Points(geo, mat));

  // Onda de choque: dois anéis de frente (o segundo mais fino, logo atrás) e um no "chão", em perspectiva.
  const aneis = [
    { m: new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), matAnel(THREE, "#5EA7FF", "#53CDFE")), atraso: 0, dur: 1.15, w0: 0.1, w1: 0.018, op: 1 },
    { m: new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), matAnel(THREE, "#2563EB", "#9FC6FF")), atraso: 0.12, dur: 1.3, w0: 0.05, w1: 0.01, op: 0.7 },
    { m: new THREE.Mesh(new THREE.PlaneGeometry(8, 8), matAnel(THREE, "#53CDFE", "#2563EB")), atraso: 0.03, dur: 1.5, w0: 0.08, w1: 0.012, op: 0.75 },
  ];
  aneis[0].m.position.z = aneis[1].m.position.z = -0.35;
  aneis[2].m.rotation.x = -Math.PI / 2.35; aneis[2].m.position.set(0, -1.45, 0);
  aneis.forEach((a) => cena.add(a.m));
  const flare = clarao(THREE, 0xcfe2ff, 1); cena.add(flare);
  const brilho = new THREE.PointLight(0x9fc6ff, 0, 5, 1.5); brilho.position.set(centro.x, centro.y, 0.9); grupo.add(brilho);

  // Poeira do impacto: sai da emenda e desacelera.
  const ND = 180, dpos = new Float32Array(ND * 3), dvel = new Float32Array(ND * 3);
  const dgeo = new THREE.BufferGeometry(); dgeo.setAttribute("position", new THREE.BufferAttribute(dpos, 3));
  const dmat = new THREE.PointsMaterial({ color: 0x9fc6ff, size: 0.05, map: pontoTextura(THREE), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  cena.add(new THREE.Points(dgeo, dmat));

  const easeIn = (x) => x * x * x;
  const easeInOut = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  let impactoEm = -10, ultimoCiclo = -1;
  const camBase = camera.position.clone();

  function onda() {
    const c = grupo.localToWorld(centro.clone());
    flare.position.copy(c).add(new THREE.Vector3(0, 0, 0.4));
    for (let i = 0; i < ND; i++) {
      dpos.set([c.x + (Math.random() - 0.5) * 0.3, c.y + (Math.random() - 0.5) * 1.6, c.z + 0.05], i * 3);
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3.2;
      dvel.set([Math.cos(a) * s, Math.sin(a) * s * 0.6, (Math.random() - 0.5) * 1.5], i * 3);
    }
    dgeo.attributes.position.needsUpdate = true;
  }

  return function (t, dt) {
    const c = t % CICLO, n = Math.floor(t / CICLO);
    let k; // 0 = encaixado, 1 = afastado
    if (c < ENCAIXE) k = 1 - easeIn(c / ENCAIXE);
    else if (c < SOLTA) k = 0;
    else k = easeInOut((c - SOLTA) / (CICLO - SOLTA));
    if (c >= ENCAIXE && ultimoCiclo !== n) { ultimoCiclo = n; impactoEm = t; onda(); }
    const ti = t - impactoEm;

    // Assentamento elástico depois do encaixe (mola amortecida), em vez de parar seco.
    const mola = ti >= 0 && ti < 1.2 ? Math.exp(-7 * ti) * Math.cos(24 * ti) * 0.07 : 0;
    esq.position.copy(longeE).multiplyScalar(k + mola); esq.rotation.z = k * 0.35 + mola * 0.6;
    dir.position.copy(longeD).multiplyScalar(k + mola); dir.rotation.z = -k * 0.3 - mola * 0.5;

    // Câmera: tremor em seno amortecido (fluido), não aleatório.
    const tremor = ti >= 0 && ti < 0.9 ? Math.exp(-6 * ti) * 0.055 : 0;
    camera.position.x = camBase.x + Math.sin(ti * 47) * tremor * 0.6;
    camera.position.y = camBase.y + Math.sin(ti * 38 + 1.3) * tremor;

    // Anéis: abrem rápido e desaceleram (easeOutExpo), afinando e sumindo.
    aneis.forEach((a) => {
      const u = a.m.material.uniforms, x = (ti - a.atraso) / a.dur;
      u.uT.value = t;
      if (x < 0 || x > 1) { u.uOpac.value = 0; return; }
      const e = easeOutExpo(x);
      u.uR.value = 0.12 + e * 0.8;
      u.uW.value = a.w0 + (a.w1 - a.w0) * e;
      u.uOpac.value = a.op * Math.pow(1 - x, 1.6) * Math.min(1, x * 12);
    });
    const fl = ti >= 0 && ti < 0.7 ? 1 - ti / 0.7 : 0;
    flare.material.opacity = fl * 0.7; flare.scale.setScalar(0.8 + (1 - fl) * 2.2);

    grupo.position.y = Math.sin(t * 0.8) * 0.03;
    const pensando = 1 - k;
    brilho.intensity = fl * 11 + pensando * (2.2 + Math.sin(t * 3) * 0.8);
    meshes.forEach((m) => { m.material.emissiveIntensity = 0.16 + pensando * 0.12 + fl * 0.3; });
    grupo.rotation.y = Math.sin(t * 0.35) * 0.32;

    // Poeira.
    if (ti >= 0 && ti < 1.4) {
      for (let i = 0; i < ND; i++) {
        const f = Math.pow(0.04, dt);
        dvel[i * 3] *= f; dvel[i * 3 + 1] *= f; dvel[i * 3 + 2] *= f;
        dpos[i * 3] += dvel[i * 3] * dt; dpos[i * 3 + 1] += dvel[i * 3 + 1] * dt; dpos[i * 3 + 2] += dvel[i * 3 + 2] * dt;
      }
      dgeo.attributes.position.needsUpdate = true;
      dmat.opacity = Math.pow(1 - ti / 1.4, 1.5) * 0.85;
    } else dmat.opacity = 0;

    // Pensamento: as partículas giram e afundam na câmara; ao chegar, renascem por fora.
    const puxa = 0.15 + pensando * 0.75;
    for (let i = 0; i < N; i++) {
      const p = est[i];
      p.a += p.v * dt * (1 + 1.4 / (p.r + 0.3));
      p.r -= dt * puxa * (0.25 + 0.6 / (p.r + 0.4));
      if (p.r < 0.12) nasce(i, true);
      pos[i * 3] = centro.x + Math.cos(p.a) * p.r;
      pos[i * 3 + 1] = centro.y + p.h * Math.min(1, p.r) + Math.sin(p.a) * p.inc * p.r * 0.4;
      pos[i * 3 + 2] = Math.sin(p.a) * p.r * 0.55;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    mat.opacity = 0.45 + pensando * 0.55;
  };
}
