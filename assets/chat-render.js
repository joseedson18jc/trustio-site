/* Trustio · renderização das respostas do chat: Markdown, LaTeX (KaTeX em MathML) e gráficos 2D/3D.
 *
 * - Seguro: todo texto do modelo é escapado; fórmulas viram MathML pelo KaTeX (sem estilos inline,
 *   compatível com a CSP do site); gráficos são desenhados em <canvas> a partir de um JSON com
 *   expressões avaliadas por um leitor próprio (nada do modelo é executado como código).
 * - Bloco de gráfico: ```grafico {json}``` (formato descrito ao modelo pelo gateway da Trustio).
 * - API: window.TrustioRender.html(markdown) -> HTML; window.TrustioRender.hydrate(elemento) desenha os
 *   gráficos do HTML já inserido. Sem window.katex as fórmulas aparecem como código.
 */
(function () {
  "use strict";

  // ------------------------------------------------------------------ expressões (leitor seguro)
  var FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp, log: Math.log, ln: Math.log,
    log10: Math.log10, log2: Math.log2, sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, floor: Math.floor,
    ceil: Math.ceil, round: Math.round, sign: Math.sign, min: Math.min, max: Math.max, atan2: Math.atan2,
    pow: Math.pow, sen: Math.sin, tg: Math.tan, sec: function (v) { return 1 / Math.cos(v); },
    csc: function (v) { return 1 / Math.sin(v); }, cot: function (v) { return 1 / Math.tan(v); }
  };
  var CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

  function tokenize(src) {
    var s = String(src).replace(/[−–]/g, "-").replace(/[·×⋅]/g, "*").replace(/÷/g, "/").replace(/π/g, "pi")
      .replace(/\*\*/g, "^").replace(/²/g, "^2").replace(/³/g, "^3");
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i)))) { out.push({ t: "n", v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if ((m = /^[a-z_][a-z0-9_]*/i.exec(s.slice(i)))) { out.push({ t: "id", v: m[0].toLowerCase() }); i += m[0].length; continue; }
      if ("+-*/^(),".indexOf(c) >= 0) { out.push({ t: c }); i++; continue; }
      throw new Error("caractere inválido: " + c);
    }
    return out;
  }

  // Gramática: expr = termo (('+'|'-') termo)*; termo = unário (('*'|'/'|implícito) unário)*;
  // unário = '-' unário | potência; potência = primário ('^' unário)?  (-x^2 = -(x^2), 2^-x vale).
  // Gera funções encadeadas (sem eval nem new Function).
  function compile(src, vars) {
    var toks = tokenize(src), p = 0;
    if (toks.length > 400) throw new Error("expressão longa demais");
    function peek() { return toks[p]; }
    function take(t) { if (!toks[p] || toks[p].t !== t) throw new Error("esperado " + t); return toks[p++]; }
    function startsPrimary(tk) { return tk && (tk.t === "n" || tk.t === "id" || tk.t === "("); }
    function expr() {
      var a = term();
      while (peek() && (peek().t === "+" || peek().t === "-")) {
        var op = toks[p++].t, b = term(), l = a;
        a = op === "+" ? (function (l, b) { return function (e) { return l(e) + b(e); }; })(l, b)
                       : (function (l, b) { return function (e) { return l(e) - b(e); }; })(l, b);
      }
      return a;
    }
    function term() {
      var a = unary();
      for (;;) {
        var tk = peek();
        if (tk && (tk.t === "*" || tk.t === "/")) {
          p++; var b = unary(), l = a;
          a = tk.t === "*" ? (function (l, b) { return function (e) { return l(e) * b(e); }; })(l, b)
                           : (function (l, b) { return function (e) { return l(e) / b(e); }; })(l, b);
        } else if (startsPrimary(tk)) {                    // multiplicação implícita: 2x, 3(x+1), x y
          var c = power(), r = a;
          a = (function (r, c) { return function (e) { return r(e) * c(e); }; })(r, c);
        } else return a;
      }
    }
    function power() {
      var base = primary();
      if (peek() && peek().t === "^") { p++; var ex = unary(); return function (e) { return Math.pow(base(e), ex(e)); }; }
      return base;
    }
    function unary() {
      if (peek() && peek().t === "-") { p++; var u = unary(); return function (e) { return -u(e); }; }
      if (peek() && peek().t === "+") { p++; return unary(); }
      return power();
    }
    function primary() {
      var tk = toks[p++];
      if (!tk) throw new Error("expressão incompleta");
      if (tk.t === "n") { var v = tk.v; return function () { return v; }; }
      if (tk.t === "(") { var inner = expr(); take(")"); return inner; }
      if (tk.t === "id") {
        if (Object.prototype.hasOwnProperty.call(FUNCS, tk.v) && peek() && peek().t === "(") {
          p++; var args = [];
          if (peek() && peek().t !== ")") { args.push(expr()); while (peek() && peek().t === ",") { p++; args.push(expr()); } }
          take(")");
          var fn = FUNCS[tk.v];
          if (args.length === 1) { var a0 = args[0]; return function (e) { return fn(a0(e)); }; }
          return function (e) { return fn.apply(null, args.map(function (g) { return g(e); })); };
        }
        if (vars.indexOf(tk.v) >= 0) { var name = tk.v; return function (e) { return e[name]; }; }
        if (Object.prototype.hasOwnProperty.call(CONSTS, tk.v)) { var k = CONSTS[tk.v]; return function () { return k; }; }
        throw new Error("nome desconhecido: " + tk.v);
      }
      throw new Error("símbolo inesperado: " + tk.t);
    }
    var f = expr();
    if (p < toks.length) throw new Error("sobrou texto na expressão");
    return function (env) { var v = f(env); return typeof v === "number" ? v : NaN; };
  }

  // ------------------------------------------------------------------ Markdown + LaTeX
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function tex(src, display) {
    if (window.katex && typeof window.katex.renderToString === "function") {
      try {
        var html = window.katex.renderToString(src, { displayMode: display, output: "mathml", throwOnError: false,
          strict: "ignore", trust: false, maxSize: 50, maxExpand: 500 });
        return display ? "<div class=\"tg-math-block\">" + html + "</div>" : "<span class=\"tg-math\">" + html + "</span>";
      } catch (err) { /* cai no texto */ }
    }
    return display ? "<pre class=\"tg-math-src\"><code>" + esc(src) + "</code></pre>" : "<code>" + esc(src) + "</code>";
  }

  // Tira as fórmulas do texto antes do Markdown (para * _ | dentro delas não virarem formatação) e devolve
  // marcadores \u0000N\u0000. Inline: $...$ só quando o $ de abertura vem colado num caractere e o de
  // fechamento não é seguido de dígito — assim "R$ 1.000" e "R$10 e R$20" continuam dinheiro.
  function pullMath(text, store) {
    function keep(html) { store.push(html); return "\u0000" + (store.length - 1) + "\u0000"; }
    // Fórmula em bloco: marcador próprio (\u0001N\u0001) numa linha só, para virar um bloco e não ficar dentro de <p>.
    function keepBlock(html) { store.push(html); return "\n\u0001" + (store.length - 1) + "\u0001\n"; }
    text = text.replace(/\\\[([\s\S]+?)\\\]/g, function (_, m) { return keepBlock(tex(m.trim(), true)); });
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, m) { return keepBlock(tex(m.trim(), true)); });
    text = text.replace(/\\\(([\s\S]+?)\\\)/g, function (_, m) { return keep(tex(m.trim(), false)); });
    text = text.replace(/(^|[^\\R$\w])\$(?=[^\s$])((?:\\.|[^$\n\\])+?)\$(?![\d$])/g, function (all, pre, m) {
      if (/\s$/.test(m)) return all;
      return pre + keep(tex(m, false));
    });
    return text;
  }

  function inline(t) {
    return esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/~~([^~]+)~~/g, "<del>$1</del>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<a href=\"$2\" target=\"_blank\" rel=\"noopener noreferrer nofollow\">$1</a>");
  }

  function splitRow(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }

  function table(lines) {
    var head = splitRow(lines[0]), aligns = splitRow(lines[1]).map(function (c) {
      return /^:-+:$/.test(c) ? "c" : /^-+:$/.test(c) ? "r" : "";
    });
    function cell(tag, c, i) { return "<" + tag + (aligns[i] ? " class=\"tg-al-" + aligns[i] + "\"" : "") + ">" + inline(c) + "</" + tag + ">"; }
    var body = lines.slice(2).map(function (l) {
      return "<tr>" + splitRow(l).map(function (c, i) { return cell("td", c, i); }).join("") + "</tr>";
    }).join("");
    return "<div class=\"tg-table\"><table><thead><tr>" + head.map(function (c, i) { return cell("th", c, i); }).join("") +
      "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  function blocks(text, out) {
    var lines = text.split("\n"), i = 0, para = [];
    function flush() { if (para.length) { out.push("<p>" + para.map(inline).join("<br>") + "</p>"); para = []; } }
    while (i < lines.length) {
      var l = lines[i];
      if (!l.trim()) { flush(); i++; continue; }
      if (/^\s*\u0001\d+\u0001\s*$/.test(l)) { flush(); out.push(l.trim()); i++; continue; }
      var h = /^(#{1,6})\s+(.*)$/.exec(l);
      if (h) { flush(); out.push(h[1].length <= 2 ? "<h3>" + inline(h[2]) + "</h3>" : "<h4>" + inline(h[2]) + "</h4>"); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push("<hr>"); i++; continue; }
      if (/^\s*\|.*\|\s*$/.test(l) && lines[i + 1] && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        flush(); var t = [l, lines[i + 1]]; i += 2;
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) t.push(lines[i++]);
        out.push(table(t)); continue;
      }
      if (/^\s*>/.test(l)) {
        flush(); var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + q.map(inline).join("<br>") + "</blockquote>"); continue;
      }
      if (/^\s*([-*•+])\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)) {
        flush(); var ordered = /^\s*\d+[.)]\s+/.test(l), items = [];
        while (i < lines.length && lines[i].trim() && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*•+])\s+/).test(lines[i])) {
          var item = lines[i++].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*([-*•+])\s+/, "");
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*•+]|\d+[.)])\s+/.test(lines[i])) item += " " + lines[i++].trim();
          items.push("<li>" + inline(item) + "</li>");
        }
        out.push(ordered ? "<ol>" + items.join("") + "</ol>" : "<ul>" + items.join("") + "</ul>"); continue;
      }
      para.push(l); i++;
    }
    flush();
  }

  function grafBlock(code, closed) {
    var spec = null;
    try { spec = JSON.parse(code); } catch (err) { spec = null; }
    if (spec && typeof spec === "object") {
      return "<figure class=\"tg-graf\" data-graf=\"" + esc(encodeURIComponent(JSON.stringify(spec))) + "\">" +
        (spec.titulo ? "<figcaption>" + esc(String(spec.titulo).slice(0, 160)) + "</figcaption>" : "") + "</figure>";
    }
    if (!closed) return "<div class=\"tg-graf tg-graf-wait\">Desenhando o gráfico…</div>";
    return "<pre><code>" + esc(code) + "</code></pre>";
  }

  function html(md) {
    var src = String(md == null ? "" : md).replace(/\r\n?/g, "\n");
    var parts = src.split(/^[ \t]*```/m), out = [];
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var closed = i < parts.length - 1, lang = (/^([a-z0-9_+-]*)/i.exec(parts[i]) || ["", ""])[1].toLowerCase();
        var code = parts[i].replace(/^[a-z0-9_+-]*[^\n]*\n?/i, "").replace(/\n$/, "");
        if (lang === "grafico" || lang === "gráfico" || lang === "graph" || lang === "plot") out.push(grafBlock(code, closed));
        else out.push("<pre><code" + (lang ? " class=\"lang-" + esc(lang) + "\"" : "") + ">" + esc(code) + "</code></pre>");
        continue;
      }
      var store = [], text = pullMath(parts[i], store), seg = [];
      blocks(text, seg);
      out.push(seg.join("").replace(/[\u0000\u0001](\d+)[\u0000\u0001]/g, function (_, n) { return store[+n]; }));
    }
    return out.join("");
  }

  // ------------------------------------------------------------------ gráficos (canvas)
  var PALETTE = ["#4f8cff", "#ff7a59", "#2ec4a6", "#f2b84b", "#b37feb", "#ff5c8a"];
  var MAX_PONTOS = 5000;

  function num(v) { return typeof v === "number" && isFinite(v); }
  function range(v, def) {
    if (Array.isArray(v)) {
      var n = v.filter(num);
      if (n.length >= 2) { var a = Math.min.apply(null, n), b = Math.max.apply(null, n); if (b > a) return [a, b]; }
    }
    return def;
  }
  function stripLhs(expr, names) {                       // "y = x^2", "f(x) = ...", "z=..." -> lado direito
    var s = String(expr == null ? "" : expr).trim();
    var m = /^\s*([a-z]\w*(\s*\([^)]*\))?)\s*=\s*(.+)$/i.exec(s);
    return m && names.test(m[1]) ? m[3] : s;
  }
  function nice(a, b, count) {
    var span = b - a, step = Math.pow(10, Math.floor(Math.log10(span / count))), err = span / count / step;
    step *= err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
    var out = [];
    for (var v = Math.ceil(a / step) * step; v <= b + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  function fmt(v) {
    var lang = (document.documentElement.lang || "pt-BR");
    var a = Math.abs(v);
    if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(1);
    return v.toLocaleString(lang, { maximumFractionDigits: a < 10 ? 2 : a < 100 ? 1 : 0 });
  }
  function percentile(sorted, q) { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]; }
  function colors(el) {
    var cs = getComputedStyle(el), txt = cs.color || "#888";
    return { text: txt, grid: withAlpha(txt, 0.12), axis: withAlpha(txt, 0.5), bg: "transparent" };
  }
  function withAlpha(c, a) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
    return m ? "rgba(" + m[1] + "," + m[2] + "," + m[3] + "," + a + ")" : "rgba(128,128,128," + a + ")";
  }
  function setupCanvas(fig, ratio, label) {
    var w = Math.max(260, Math.min(720, fig.clientWidth || 600)), h = Math.round(Math.min(460, w * ratio));
    var dpr = Math.min(2, window.devicePixelRatio || 1), cv = document.createElement("canvas");
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.className = "tg-graf-canvas"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", label || "Gráfico");
    fig.appendChild(cv);
    var ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { cv: cv, ctx: ctx, w: w, h: h };
  }

  function draw2d(fig, spec, errs) {
    var traces = [], xr = range(spec.x, null), funcs = spec.funcoes || spec.funcs || [];
    if (typeof funcs === "string") funcs = [{ expr: funcs }];
    if (!funcs.length && typeof spec.expr === "string") funcs = [{ expr: spec.expr, nome: spec.nome }];
    var series = Array.isArray(spec.series) ? spec.series : [], curves = Array.isArray(spec.curvas) ? spec.curvas : [];
    if (!xr) {                                              // sem faixa: usa os dados, ou -10..10
      var xs = [];
      series.forEach(function (s) { (Array.isArray(s.x) ? s.x : (s.y || []).map(function (_, i) { return i; })).forEach(function (v) { if (num(v)) xs.push(v); }); });
      xr = xs.length > 1 && Math.max.apply(null, xs) > Math.min.apply(null, xs) ? [Math.min.apply(null, xs), Math.max.apply(null, xs)] : [-10, 10];
    }
    funcs.slice(0, 8).forEach(function (f, k) {
      var src = typeof f === "string" ? f : f && f.expr;
      try {
        var fn = compile(stripLhs(src, /^(y|f|g|h)\b/i), ["x"]), pts = [], n = 700;
        for (var i = 0; i <= n; i++) { var x = xr[0] + (xr[1] - xr[0]) * i / n; pts.push([x, fn({ x: x })]); }
        traces.push({ kind: "linha", pts: pts, nome: (f && f.nome) || src, cor: (f && f.cor) || PALETTE[traces.length % 6], func: true });
      } catch (err) { errs.push(String(src) + ": " + err.message); }
    });
    curves.slice(0, 6).forEach(function (c) {
      try {
        var fx = compile(stripLhs(c.x, /^x\b/i), ["t"]), fy = compile(stripLhs(c.y, /^y\b/i), ["t"]), tr = range(c.t, [0, 2 * Math.PI]), pts = [], n = 900;
        for (var i = 0; i <= n; i++) { var t = tr[0] + (tr[1] - tr[0]) * i / n; pts.push([fx({ t: t }), fy({ t: t })]); }
        traces.push({ kind: "linha", pts: pts, nome: c.nome || "(" + c.x + ", " + c.y + ")", cor: c.cor || PALETTE[traces.length % 6] });
      } catch (err) { errs.push("curva: " + err.message); }
    });
    series.slice(0, 8).forEach(function (s) {
      var ys = Array.isArray(s.y) ? s.y.slice(0, MAX_PONTOS) : [], xs2 = Array.isArray(s.x) ? s.x : ys.map(function (_, i) { return i; });
      var pts = ys.map(function (y, i) { return [xs2[i], y]; }).filter(function (p) { return num(p[0]) && num(p[1]); });
      if (pts.length) traces.push({ kind: /barra/.test(s.estilo || "") ? "barras" : /ponto/.test(s.estilo || "") ? "pontos" : "linha",
        pts: pts, nome: s.nome || "dados", cor: s.cor || PALETTE[traces.length % 6] });
    });
    if (!traces.length) return false;
    // faixa x final (curvas paramétricas e séries podem passar da faixa pedida)
    traces.forEach(function (t) { if (!t.func) t.pts.forEach(function (p) { if (num(p[0])) { xr = [Math.min(xr[0], p[0]), Math.max(xr[1], p[0])]; } }); });
    var discrete = traces.filter(function (t) { return t.kind === "barras" || t.kind === "pontos"; });
    if (discrete.length) {                                   // barras e pontos não podem ficar cortados nas bordas
      var gap = Infinity;
      discrete.forEach(function (t) {
        var xs3 = t.pts.map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
        for (var q = 1; q < xs3.length; q++) if (xs3[q] > xs3[q - 1]) gap = Math.min(gap, xs3[q] - xs3[q - 1]);
      });
      var padX = isFinite(gap) ? gap * 0.6 : (xr[1] - xr[0]) * 0.05 || 0.5;
      xr = [xr[0] - padX, xr[1] + padX];
    }
    var ys3 = [], dataYs = [];
    traces.forEach(function (t) { t.pts.forEach(function (p) { if (num(p[1])) { ys3.push(p[1]); if (!t.func) dataYs.push(p[1]); } }); });
    if (traces.some(function (t) { return t.kind === "barras"; })) ys3.push(0);
    ys3.sort(function (a, b) { return a - b; });
    var yr = [percentile(ys3, 0.02), percentile(ys3, 0.98)];
    if (dataYs.length) yr = [Math.min(yr[0], Math.min.apply(null, dataYs)), Math.max(yr[1], Math.max.apply(null, dataYs))];
    var asked = range(spec.y, null);
    if (asked) {
      var inside = ys3.filter(function (v) { return v >= asked[0] && v <= asked[1]; }).length;
      if (inside >= 0.8 * ys3.length) yr = asked;              // respeita a faixa pedida se ela mostra os dados
    }
    if (!(yr[1] > yr[0])) yr = [yr[0] - 1, yr[0] + 1];
    var pad = (yr[1] - yr[0]) * 0.08; if (!asked || yr !== asked) yr = [yr[0] - pad, yr[1] + pad];

    var c = setupCanvas(fig, 0.6, spec.titulo), ctx = c.ctx, col = colors(fig);
    var showLegend = traces.length > 1 || traces[0].nome !== (funcs[0] && funcs[0].expr);
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif";
    var legendRows = showLegend ? legendLayout(ctx, traces, c.w - 66).rows : 0;
    var L = 52, R = 14, T = 14 + legendRows * 18, B = 30, W = c.w - L - R, H = c.h - T - B;
    function X(v) { return L + (v - xr[0]) / (xr[1] - xr[0]) * W; }
    function Y(v) { return T + H - (v - yr[0]) / (yr[1] - yr[0]) * H; }
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif"; ctx.lineWidth = 1;
    ctx.strokeStyle = col.grid; ctx.fillStyle = col.text; ctx.textAlign = "center"; ctx.textBaseline = "top";
    nice(xr[0], xr[1], Math.max(3, Math.floor(W / 80))).forEach(function (v) {
      ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), T + H); ctx.stroke(); ctx.fillText(fmt(v), X(v), T + H + 6);
    });
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    nice(yr[0], yr[1], Math.max(3, Math.floor(H / 50))).forEach(function (v) {
      ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + W, Y(v)); ctx.stroke(); ctx.fillText(fmt(v), L - 6, Y(v));
    });
    ctx.strokeStyle = col.axis; ctx.lineWidth = 1.2;
    if (yr[0] < 0 && yr[1] > 0) { ctx.beginPath(); ctx.moveTo(L, Y(0)); ctx.lineTo(L + W, Y(0)); ctx.stroke(); }
    if (xr[0] < 0 && xr[1] > 0) { ctx.beginPath(); ctx.moveTo(X(0), T); ctx.lineTo(X(0), T + H); ctx.stroke(); }
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, W, H); ctx.clip();
    traces.forEach(function (t) {
      ctx.strokeStyle = t.cor; ctx.fillStyle = t.cor; ctx.lineWidth = 2.2; ctx.lineJoin = "round";
      if (t.kind === "pontos") {
        t.pts.forEach(function (p) { ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 3.4, 0, 6.2832); ctx.fill(); });
      } else if (t.kind === "barras") {
        var bw = Math.max(3, W / Math.max(1, t.pts.length) * 0.6);
        t.pts.forEach(function (p) { var y0 = Y(Math.max(yr[0], Math.min(yr[1], 0))); ctx.fillRect(X(p[0]) - bw / 2, Math.min(Y(p[1]), y0), bw, Math.abs(y0 - Y(p[1]))); });
      } else {
        var open = false, prev = null, span = yr[1] - yr[0];
        ctx.beginPath();
        t.pts.forEach(function (p) {
          var ok = num(p[0]) && num(p[1]);
          if (ok && prev && t.func && Math.abs(p[1] - prev[1]) > span * 1.5) ok = false;   // assíntota: corta a linha
          if (!ok) { open = false; prev = num(p[1]) ? p : null; return; }
          var px = X(p[0]), py = Math.max(-1e4, Math.min(1e4, Y(p[1])));
          if (open) ctx.lineTo(px, py); else { ctx.moveTo(px, py); open = true; }
          prev = p;
        });
        ctx.stroke();
      }
    });
    ctx.restore();
    if (showLegend) legend(ctx, traces, L, 6, c.w - 66, col);
    return true;
  }

  // Legenda numa faixa acima do gráfico (nunca cobre os dados), quebrando em linhas se precisar.
  function legendLayout(ctx, traces, maxW) {
    var x = 0, rows = 1, items = traces.slice(0, 8).map(function (t) {
      var label = String(t.nome).slice(0, 40), w = ctx.measureText(label).width + 30;
      if (x + w > maxW && x > 0) { rows++; x = 0; }
      var it = { t: t, label: label, x: x, row: rows - 1 }; x += w; return it;
    });
    return { rows: rows, items: items };
  }
  function legend(ctx, traces, x0, y0, maxW, col) {
    ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    legendLayout(ctx, traces, maxW).items.forEach(function (it) {
      var y = y0 + it.row * 18 + 6;
      ctx.fillStyle = it.t.cor; ctx.fillRect(x0 + it.x, y - 2, 14, 4);
      ctx.fillStyle = col.text; ctx.fillText(it.label, x0 + it.x + 19, y);
    });
  }

  // 3D: superfície z=f(x,y) ou curvas paramétricas; projeção ortográfica que gira com o mouse/dedo.
  var RAMP = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
  function ramp(u) {
    u = Math.max(0, Math.min(1, u)) * (RAMP.length - 1);
    var i = Math.min(RAMP.length - 2, Math.floor(u)), f = u - i, a = RAMP[i], b = RAMP[i + 1];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  }

  function draw3d(fig, spec, errs) {
    var xr = range(spec.x, [-3, 3]), yr = range(spec.y, [-3, 3]), grid = null, curves = [], zs = [];
    var exprs = typeof spec.expr === "string" ? [spec.expr] : [];
    if (!exprs.length && Array.isArray(spec.funcoes)) spec.funcoes.forEach(function (f) { if (f && f.expr) exprs.push(f.expr); });
    if (exprs.length) {
      try {
        var fn = compile(stripLhs(exprs[0], /^(z|f)\b/i), ["x", "y"]), N = 40;
        grid = [];
        for (var i = 0; i <= N; i++) {
          var row = [];
          for (var j = 0; j <= N; j++) {
            var x = xr[0] + (xr[1] - xr[0]) * i / N, y = yr[0] + (yr[1] - yr[0]) * j / N, z = fn({ x: x, y: y });
            row.push([x, y, z]); if (num(z)) zs.push(z);
          }
          grid.push(row);
        }
      } catch (err) { errs.push(String(exprs[0]) + ": " + err.message); grid = null; }
    }
    (Array.isArray(spec.curvas) ? spec.curvas : []).slice(0, 6).forEach(function (c, k) {
      try {
        var fx = compile(c.x, ["t"]), fy = compile(c.y, ["t"]), fz = compile(c.z == null ? "0" : c.z, ["t"]);
        var tr = range(c.t, [0, 2 * Math.PI]), pts = [];
        for (var i = 0; i <= 900; i++) { var t = tr[0] + (tr[1] - tr[0]) * i / 900, p = [fx({ t: t }), fy({ t: t }), fz({ t: t })]; pts.push(p); if (num(p[2])) zs.push(p[2]); }
        curves.push({ pts: pts, cor: c.cor || PALETTE[k % 6] });
      } catch (err) { errs.push("curva 3D: " + err.message); }
    });
    if (!grid && !curves.length) return false;
    if (!spec.x && curves.length) {                          // curvas sem faixa: usa a extensão delas
      var ax = [], ay = [];
      curves.forEach(function (c) { c.pts.forEach(function (p) { if (num(p[0])) ax.push(p[0]); if (num(p[1])) ay.push(p[1]); }); });
      xr = range(ax, xr); yr = range(ay, yr);
    }
    zs.sort(function (a, b) { return a - b; });
    // Faixa de z: a extensão inteira, a não ser que haja picos (ex.: 1/(x²+y²)) — aí corta 2% em cada ponta.
    var zFull = [zs[0], zs[zs.length - 1]], zCut = [percentile(zs, 0.02), percentile(zs, 0.98)];
    var zr = range(spec.z, null) || ((zFull[1] - zFull[0]) > 6 * (zCut[1] - zCut[0] || 1e-9) ? zCut : zFull);
    if (!(zr[1] > zr[0])) zr = [zr[0] - 1, zr[0] + 1];
    function nx(v) { return (v - xr[0]) / (xr[1] - xr[0]) * 2 - 1; }
    function ny(v) { return (v - yr[0]) / (yr[1] - yr[0]) * 2 - 1; }
    function nz(v) { return (Math.max(zr[0], Math.min(zr[1], v)) - zr[0]) / (zr[1] - zr[0]) * 1.4 - 0.7; }

    var c = setupCanvas(fig, 0.75, spec.titulo), ctx = c.ctx, col = colors(fig);
    var view = { az: -0.85, el: 0.55 }, scale = Math.min(c.w, c.h) * 0.3;
    function proj(x, y, z) {
      var ca = Math.cos(view.az), sa = Math.sin(view.az), ce = Math.cos(view.el), se = Math.sin(view.el);
      var x1 = x * ca - y * sa, y1 = x * sa + y * ca;          // gira em torno de z
      var y2 = y1 * ce - z * se, z2 = y1 * se + z * ce;         // inclina (elevação)
      return [c.w / 2 + x1 * scale, c.h / 2 + 10 - z2 * scale, y2];
    }
    function render() {
      ctx.clearRect(0, 0, c.w, c.h);
      ctx.font = "12px system-ui, -apple-system, Segoe UI, sans-serif"; ctx.lineWidth = 1;
      var box = [[-1, -1, -0.7], [1, -1, -0.7], [1, 1, -0.7], [-1, 1, -0.7]];
      ctx.strokeStyle = col.grid; ctx.beginPath();                // chão (z mínimo) com grade
      for (var g = -1; g <= 1.0001; g += 0.5) {
        var a = proj(g, -1, -0.7), b = proj(g, 1, -0.7), d = proj(-1, g, -0.7), e = proj(1, g, -0.7);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.moveTo(d[0], d[1]); ctx.lineTo(e[0], e[1]);
      }
      ctx.stroke();
      ctx.strokeStyle = col.axis; ctx.beginPath();
      box.forEach(function (p, k) { var q = proj(p[0], p[1], p[2]); if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.closePath(); ctx.stroke();
      var zAxis0 = proj(-1, -1, -0.7), zAxis1 = proj(-1, -1, 0.7);
      ctx.beginPath(); ctx.moveTo(zAxis0[0], zAxis0[1]); ctx.lineTo(zAxis1[0], zAxis1[1]); ctx.stroke();
      if (grid) {
        var quads = [];
        for (var i = 0; i < grid.length - 1; i++) for (var j = 0; j < grid[i].length - 1; j++) {
          var q = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
          if (!q.every(function (p) { return num(p[2]); })) continue;
          var pp = q.map(function (p) { return proj(nx(p[0]), ny(p[1]), nz(p[2])); });
          var zAvg = (q[0][2] + q[1][2] + q[2][2] + q[3][2]) / 4;
          var ux = pp[1][0] - pp[0][0], uy = pp[1][1] - pp[0][1], vx = pp[3][0] - pp[0][0], vy = pp[3][1] - pp[0][1];
          quads.push({ pp: pp, depth: (pp[0][2] + pp[1][2] + pp[2][2] + pp[3][2]) / 4, u: (zAvg - zr[0]) / (zr[1] - zr[0]),
            shade: 0.72 + 0.28 * Math.min(1, Math.abs(ux * vy - uy * vx) / (scale * scale * 0.004 + 1e-9)) });
        }
        quads.sort(function (a, b) { return b.depth - a.depth; });
        quads.forEach(function (qd) {
          var rgb = ramp(qd.u), s = Math.min(1, qd.shade);
          ctx.fillStyle = "rgb(" + Math.round(rgb[0] * s) + "," + Math.round(rgb[1] * s) + "," + Math.round(rgb[2] * s) + ")";
          ctx.strokeStyle = "rgba(0,0,0,0.12)";
          ctx.beginPath(); ctx.moveTo(qd.pp[0][0], qd.pp[0][1]);
          for (var k = 1; k < 4; k++) ctx.lineTo(qd.pp[k][0], qd.pp[k][1]);
          ctx.closePath(); ctx.fill(); ctx.stroke();
        });
      }
      curves.forEach(function (cv) {
        ctx.strokeStyle = cv.cor; ctx.lineWidth = 2.4; ctx.beginPath(); var open = false;
        cv.pts.forEach(function (p) {
          if (!(num(p[0]) && num(p[1]) && num(p[2]))) { open = false; return; }
          var q = proj(nx(p[0]), ny(p[1]), nz(p[2]));
          if (open) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); open = true; }
        });
        ctx.stroke();
      });
      ctx.fillStyle = col.text; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      var lx = proj(1.18, -1, -0.7), ly = proj(1, 1.18, -0.7), lz = proj(-1, -1, 0.86);
      ctx.fillText("x", lx[0], lx[1]); ctx.fillText("y", ly[0], ly[1]); ctx.fillText("z", lz[0], lz[1]);
      var x0 = proj(-1, -1.12, -0.7), x1 = proj(1, -1.12, -0.7), y1p = proj(1.12, 1, -0.7), z0 = proj(-1.08, -1.08, -0.7), z1 = proj(-1.08, -1.08, 0.7);
      ctx.fillStyle = col.axis;
      ctx.fillText(fmt(xr[0]), x0[0], x0[1]); ctx.fillText(fmt(xr[1]), x1[0], x1[1]); ctx.fillText(fmt(yr[1]), y1p[0], y1p[1]);
      ctx.textAlign = "right"; ctx.fillText(fmt(zr[0]), z0[0] - 4, z0[1]); ctx.fillText(fmt(zr[1]), z1[0] - 4, z1[1]);
    }
    render();
    var drag = null, pending = false;
    c.cv.addEventListener("pointerdown", function (e) { drag = [e.clientX, e.clientY]; c.cv.setPointerCapture(e.pointerId); });
    c.cv.addEventListener("pointermove", function (e) {
      if (!drag) return;
      view.az += (e.clientX - drag[0]) * 0.01; view.el = Math.max(-1.45, Math.min(1.45, view.el + (e.clientY - drag[1]) * 0.01));
      drag = [e.clientX, e.clientY];
      if (!pending) { pending = true; requestAnimationFrame(function () { pending = false; render(); }); }
    });
    function stop() { drag = null; }
    c.cv.addEventListener("pointerup", stop); c.cv.addEventListener("pointercancel", stop);
    c.cv.addEventListener("dblclick", function () { view.az = -0.85; view.el = 0.55; render(); });
    var hint = document.createElement("p"); hint.className = "tg-graf-hint";
    hint.textContent = /^en/i.test(document.documentElement.lang) ? "Drag to rotate · double-click to reset" : "Arraste para girar · clique duplo para voltar";
    fig.appendChild(hint);
    return true;
  }

  function hydrate(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    Array.prototype.forEach.call(rootEl.querySelectorAll("figure.tg-graf[data-graf]:not([data-pronto])"), function (fig) {
      fig.setAttribute("data-pronto", "1");
      var errs = [], spec = null, ok = false;
      try { spec = JSON.parse(decodeURIComponent(fig.getAttribute("data-graf"))); } catch (err) { spec = null; }
      try {
        if (spec) ok = /3d/i.test(String(spec.tipo || "")) ? draw3d(fig, spec, errs) : draw2d(fig, spec, errs);
      } catch (err) { errs.push(err.message); ok = false; }
      if (!ok || errs.length) {
        var p = document.createElement("p"); p.className = "tg-graf-err";
        p.textContent = (ok ? "Parte do gráfico não pôde ser desenhada: " : "Não foi possível desenhar este gráfico: ") + errs.slice(0, 3).join("; ");
        fig.appendChild(p);
      }
    });
  }

  var api = { html: html, hydrate: hydrate, compile: compile };
  if (typeof window !== "undefined") window.TrustioRender = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
