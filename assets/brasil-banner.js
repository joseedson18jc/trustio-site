// Faixa "Soberania Nacional, Compromisso Local" da home: céu estrelado, luzes no horizonte e
// mapa do Brasil com a rede ligando as capitais. As animações só começam quando a faixa entra
// na tela, e o céu só é redesenhado enquanto ela está visível.
(() => {
  const banner = document.querySelector(".tb-banner");
  if (!banner) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let visivel = false;

  // Pausa as animações CSS até a faixa aparecer (sem JS, elas rodam direto).
  if ("IntersectionObserver" in window) banner.classList.add("tb-wait");

  /* ---------- Céu estrelado ---------- */
  const sc = document.getElementById("tb-stars"), sx = sc.getContext("2d");
  let stars = [], quadro = 0;
  function sizeStars() {
    const W = sc.clientWidth, H = sc.clientHeight;
    sc.width = W * devicePixelRatio; sc.height = H * devicePixelRatio;
    sx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    stars = Array.from({ length: Math.round((W * H) / 6000) }, () => ({
      x: Math.random() * W, y: Math.random() * H * 0.78,
      r: Math.random() * 1.3 + 0.2, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.2,
      c: Math.random() < 0.15 ? "160,215,255" : "255,255,255",
    }));
  }
  function drawStars(t) {
    quadro = 0;
    sx.clearRect(0, 0, sc.clientWidth, sc.clientHeight);
    for (const s of stars) {
      const a = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.0009 * s.s + s.p));
      sx.fillStyle = `rgba(${s.c},${a})`; sx.beginPath(); sx.arc(s.x, s.y, s.r, 0, 7); sx.fill();
    }
    if (!reduce && visivel) quadro = requestAnimationFrame(drawStars);
  }

  /* ---------- Luzes das cidades no horizonte ---------- */
  const lc = document.getElementById("tb-lights"), lx = lc.getContext("2d");
  function drawLights() {
    lc.width = lc.clientWidth; lc.height = lc.clientHeight;
    const LW = lc.width;
    lx.clearRect(0, 0, lc.width, lc.height);
    const cx = LW / 2, R = Math.max(LW * 1.15, 950);
    for (let i = 0; i < Math.round(LW / 1.4); i++) {
      const x = Math.random() * LW;
      const y = R - Math.sqrt(Math.max(0, R * R - (x - cx) * (x - cx))) + 30 + Math.random() * lc.height * 0.6;
      if (y > lc.height) continue;
      lx.fillStyle = Math.random() < 0.7 ? `rgba(255,205,120,${0.25 + Math.random() * 0.6})` : `rgba(180,225,255,${0.2 + Math.random() * 0.5})`;
      lx.beginPath(); lx.arc(x, y, Math.random() * 1.4 + 0.3, 0, 7); lx.fill();
    }
  }

  function redimensionar() { sizeStars(); drawLights(); if (!quadro) drawStars(performance.now()); }
  redimensionar();
  addEventListener("resize", redimensionar);

  /* ---------- Mapa do Brasil (lon/lat → SVG) ---------- */
  const P = ([lon, lat]) => [+((lon + 74.4) * 10).toFixed(1), +((5.6 - lat) * 10).toFixed(1)];
  const outline = [
    [-51.7,4.4],[-54.0,2.4],[-56.5,1.9],[-58.2,1.5],[-60.0,5.2],[-61.3,4.5],[-63.4,3.9],[-64.8,4.1],[-65.6,2.3],[-67.1,1.9],
    [-69.4,1.1],[-69.9,-1.0],[-69.4,-2.3],[-70.0,-4.3],[-71.7,-4.5],[-73.2,-6.6],[-73.9,-7.6],[-72.7,-9.4],[-70.5,-9.5],
    [-70.4,-11.1],[-68.7,-11.1],[-66.6,-9.9],[-65.3,-11.5],[-63.0,-12.6],[-60.5,-13.7],[-60.2,-16.3],[-58.3,-16.4],
    [-57.7,-18.1],[-58.1,-20.2],[-57.9,-22.1],[-55.6,-22.4],[-55.4,-24.0],[-54.6,-25.6],[-53.7,-26.2],[-53.9,-27.4],
    [-55.7,-28.3],[-57.6,-30.2],[-56.0,-31.1],[-53.4,-33.7],[-52.1,-32.3],[-50.3,-30.1],[-49.0,-28.6],[-48.6,-26.9],
    [-48.4,-25.5],[-47.1,-24.6],[-45.4,-23.8],[-43.8,-23.0],[-42.0,-22.9],[-41.0,-21.6],[-40.2,-20.3],[-39.7,-18.5],
    [-39.1,-17.4],[-38.9,-15.7],[-39.0,-13.6],[-38.4,-12.6],[-37.3,-11.3],[-36.4,-10.4],[-35.3,-9.2],[-34.9,-7.8],
    [-34.9,-6.5],[-35.3,-5.1],[-36.5,-4.9],[-37.7,-4.4],[-39.0,-3.3],[-40.7,-2.8],[-42.2,-2.7],[-43.5,-2.3],[-44.6,-2.0],
    [-46.0,-1.0],[-47.4,-0.7],[-48.5,-1.4],[-49.5,-0.2],[-50.6,0.4],[-51.4,1.7],[-50.7,2.5],[-51.2,3.9],
  ];
  const cities = [
    { n: "Manaus", ll: [-60.0, -3.1], a: "e" }, { n: "Belém", ll: [-48.5, -1.45], a: "e" }, { n: "Fortaleza", ll: [-38.5, -3.7], a: "e" },
    { n: "Recife", ll: [-34.9, -8.05], a: "e" }, { n: "Salvador", ll: [-38.5, -12.97], a: "e" }, { n: "Brasília", ll: [-47.9, -15.8], a: "w" },
    { n: "Belo Horizonte", ll: [-43.9, -19.9], a: "e" }, { n: "São Paulo", ll: [-46.6, -23.55], a: "s" }, { n: "Rio de Janeiro", ll: [-43.2, -22.9], a: "e" },
    { n: "Curitiba", ll: [-49.3, -25.4], a: "e" }, { n: "Porto Alegre", ll: [-51.2, -30.0], a: "e" },
  ];
  const minor = [[-67.8,-9.97],[-63.9,-8.76],[-56.1,-15.6],[-49.3,-16.7],[-54.6,-20.4],[-44.3,-2.5],[-60.7,2.8],[-48.3,-10.2],[-42.8,-5.1],[-35.7,-9.6],[-37.1,-10.9],[-48.5,-27.6],[-40.3,-20.3],[-52.4,-31.8],[-61.0,-15.5],[-57.9,-5.5],[-51.6,-7.5],[-45.9,-12.1]];

  // Catmull-Rom → Bézier cúbica, fechada.
  function smooth(pts) {
    const n = pts.length; let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1]}`;
    }
    return d + "Z";
  }
  const NS = "http://www.w3.org/2000/svg";
  // style vai pelo CSSOM: a CSP do site (style-src 'self') bloqueia o atributo style="…".
  const el = (t, a = {}) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) { if (k === "style") e.style.cssText = a[k]; else e.setAttribute(k, a[k]); }
    return e;
  };
  const svg = document.getElementById("tb-map");
  const land = document.getElementById("tb-land");
  const path = smooth(outline.map(P));
  land.appendChild(el("path", { d: path, class: "tb-outline-fill" }));
  land.appendChild(el("path", { d: path, class: "tb-outline", pathLength: 1 }));

  // Luzes espalhadas pelo interior.
  const dots = document.getElementById("tb-dots");
  const [minx, maxx, miny, maxy] = [P([-72, 0])[0], P([-35, 0])[0], P([0, 4])[1], P([0, -32])[1]];
  const probe = el("path", { d: path }); land.appendChild(probe);
  let placed = 0, tries = 0;
  while (placed < 160 && tries < 2500) {
    tries++;
    const x = minx + Math.random() * (maxx - minx), y = miny + Math.random() * (maxy - miny);
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    if (probe.isPointInFill(pt)) {
      dots.appendChild(el("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: (Math.random() * 0.7 + 0.3).toFixed(2), class: "tb-dot", style: `animation-delay:${(1.8 + Math.random() * 4).toFixed(2)}s` }));
      placed++;
    }
  }
  probe.remove();

  // Capitais.
  const cg = document.getElementById("tb-cities");
  const pos = {};
  cities.forEach((c, i) => {
    const [x, y] = P(c.ll); pos[c.n] = [x, y];
    const g = el("g", { class: "tb-city", style: `transform-origin:${x}px ${y}px;animation-delay:${(1.6 + i * 0.18).toFixed(2)}s` });
    g.appendChild(el("circle", { cx: x, cy: y, r: 2.6, class: "tb-core" }));
    g.appendChild(el("circle", { cx: x, cy: y, r: 2, class: "tb-halo", style: `animation-delay:${(2 + i * 0.37).toFixed(2)}s` }));
    const t = el("text", { x: c.a === "w" ? x - 6 : c.a === "s" ? x - 4 : x + 6, y: c.a === "s" ? y + 11 : y + 2.6, "text-anchor": c.a === "w" ? "end" : "start" });
    t.textContent = c.n; g.appendChild(t); cg.appendChild(g);
  });
  const minorPts = minor.map(P);
  minorPts.forEach(([x, y], i) => {
    const g = el("g", { class: "tb-city", style: `transform-origin:${x}px ${y}px;animation-delay:${(2.4 + i * 0.09).toFixed(2)}s` });
    g.appendChild(el("circle", { cx: x, cy: y, r: 1.4, class: "tb-core" })); cg.appendChild(g);
  });

  // Arcos entre as capitais (Bézier quadrática, curvada para fora) e pacotes de dados.
  const links = [
    ["Manaus","Belém"],["Manaus","Brasília"],["Manaus","Fortaleza"],["Belém","Fortaleza"],["Belém","Brasília"],
    ["Fortaleza","Recife"],["Fortaleza","Brasília"],["Recife","Salvador"],["Recife","Brasília"],["Salvador","Brasília"],
    ["Salvador","Belo Horizonte"],["Salvador","Rio de Janeiro"],["Brasília","Belo Horizonte"],["Brasília","São Paulo"],
    ["Belo Horizonte","Rio de Janeiro"],["Belo Horizonte","São Paulo"],["Rio de Janeiro","São Paulo"],["São Paulo","Curitiba"],
    ["Curitiba","Porto Alegre"],["São Paulo","Porto Alegre"],["Brasília","Curitiba"],["Manaus","São Paulo"],["Belém","Salvador"],
  ];
  const ag = document.getElementById("tb-arcs"), pg = document.getElementById("tb-packets");
  function arcPath(a, b, bow) {
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    const nx = -dy / L, ny = dx / L, k = L * bow;
    return `M${a[0]},${a[1]} Q${(mx + nx * k).toFixed(1)},${(my + ny * k).toFixed(1)} ${b[0]},${b[1]}`;
  }
  const pacotes = [];
  links.forEach(([A, B], i) => {
    const id = "tb-arc" + i;
    ag.appendChild(el("path", { id, d: arcPath(pos[A], pos[B], (i % 2 ? 0.22 : -0.22) * (0.8 + Math.random() * 0.5)), class: "tb-arc", pathLength: 1, style: `animation-delay:${(2.2 + i * 0.11).toFixed(2)}s` }));
    if (reduce) return;
    for (let k = 0; k < (i % 3 === 0 ? 2 : 1); k++) {
      const c = el("circle", { r: 1.3, class: "tb-packet", opacity: 0 });
      // begin="indefinite": os pacotes partem quando a faixa aparece, não no carregamento da página.
      const m = el("animateMotion", { dur: `${(3 + Math.random() * 3).toFixed(1)}s`, begin: "indefinite", repeatCount: "indefinite", keyPoints: k ? "1;0" : "0;1", keyTimes: "0;1", calcMode: "linear" });
      m.appendChild(el("mpath", { href: "#" + id })); c.appendChild(m);
      pg.appendChild(c);
      pacotes.push({ c, m, atraso: (4 + i * 0.13 + k * 1.7) * 1000 });
    }
  });
  minorPts.forEach((p, i) => {
    let best = null, bd = 1e9;
    for (const n in pos) { const d = Math.hypot(pos[n][0] - p[0], pos[n][1] - p[1]); if (d < bd) { bd = d; best = pos[n]; } }
    ag.appendChild(el("path", { d: arcPath(best, p, 0.15), class: "tb-arc tb-minor", pathLength: 1, style: `animation-delay:${(3.4 + i * 0.08).toFixed(2)}s` }));
  });

  let iniciado = false;
  function iniciar() {
    if (iniciado) return;
    iniciado = true;
    banner.classList.remove("tb-wait");
    for (const { c, m, atraso } of pacotes) {
      setTimeout(() => { c.setAttribute("opacity", "1"); if (m.beginElement) m.beginElement(); }, atraso);
    }
  }

  if ("IntersectionObserver" in window) {
    // Começa quando 20% da faixa aparece. Fora da tela, pausa tudo: animações CSS (tb-wait),
    // pacotes e demais animações do SVG, e o redesenho do céu.
    new IntersectionObserver((entradas) => {
      const alvo = entradas[0];
      visivel = alvo.isIntersecting;
      if (alvo.intersectionRatio >= 0.2) iniciar();
      if (!iniciado) return;
      banner.classList.toggle("tb-wait", !visivel);
      if (visivel) {
        svg.unpauseAnimations();
        if (!quadro && !reduce) quadro = requestAnimationFrame(drawStars);
      } else {
        svg.pauseAnimations();
      }
    }, { threshold: [0, 0.2] }).observe(banner);
  } else {
    visivel = true;
    iniciar();
    drawStars(performance.now());
  }
})();
