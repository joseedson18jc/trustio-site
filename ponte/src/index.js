/**
 * Ponte temporária: serve trustio.com.br a partir dos arquivos do branch main,
 * imitando o GitHub Pages (index.html em pastas, URL sem extensão -> .html,
 * pasta sem barra -> 301 com barra, 404.html, www -> raiz).
 */
const RAW = "https://raw.githubusercontent.com/joseedson18jc/trustio-site/main";
const TIPOS = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8", css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8", xml: "application/xml; charset=utf-8", txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8", webmanifest: "application/manifest+json",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff",
  ttf: "font/ttf", otf: "font/otf", mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4",
  mp4: "video/mp4", webm: "video/webm", pdf: "application/pdf", wasm: "application/wasm", zip: "application/zip",
};

const extensao = (p) => { const m = /\.([a-z0-9]+)$/i.exec(p.split("/").pop() || ""); return m ? m[1].toLowerCase() : ""; };

async function obter(caminho) {
  const r = await fetch(RAW + caminho, { cf: { cacheTtl: 300, cacheEverything: true } });
  return r.status === 200 ? r : null;
}

function servir(origem, caminho, req, status) {
  const h = new Headers();
  h.set("Content-Type", TIPOS[extensao(caminho)] || "application/octet-stream");
  h.set("Cache-Control", status === 200 ? "public, max-age=600" : "no-store");
  h.set("X-Content-Type-Options", "nosniff");
  h.set("X-Trustio-Ponte", "1");
  return new Response(req.method === "HEAD" ? null : origem.body, { status, headers: h });
}

async function naoEncontrado(req) {
  const r = await obter("/404.html");
  return r ? servir(r, "/404.html", req, 404) : new Response("Not found", { status: 404 });
}

export async function atender(req) {
  const url = new URL(req.url);
  if (url.hostname.startsWith("www.")) {
    return Response.redirect("https://" + url.hostname.slice(4) + url.pathname + url.search, 301);
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const p = url.pathname;
  let decod;
  try { decod = decodeURIComponent(p); } catch { return naoEncontrado(req); }
  // Como o Pages: nada de arquivos ocultos (.git, .github…) nem subida de pasta.
  if (decod.includes("..") || decod.split("/").some((s) => s.startsWith(".") && s !== ".well-known")) return naoEncontrado(req);

  if (p.endsWith("/")) {
    const r = await obter(p + "index.html");
    return r ? servir(r, p + "index.html", req, 200) : naoEncontrado(req);
  }
  if (extensao(p)) {
    const r = await obter(p);
    if (r) return servir(r, p, req, 200);
  } else {
    const html = await obter(p + ".html");
    if (html) return servir(html, p + ".html", req, 200);
  }
  if (await obter(p + "/index.html")) {
    return new Response(null, { status: 301, headers: { Location: p + "/" + url.search } });
  }
  return naoEncontrado(req);
}

export default { fetch: atender };
