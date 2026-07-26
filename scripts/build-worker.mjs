import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

const textExtensions = new Set([".css", ".html", ".js", ".json", ".svg", ".txt", ".webmanifest", ".xml"]);

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else files.push(absolute);
  }
  return files;
}

const sourceFiles = [
  "index.html",
  "modelos.html",
  "manifesto.html",
  "fundador.html",
  "404.html",
  "robots.txt",
  "sitemap.xml",
  "site.webmanifest",
  ...((await walk(join(root, "assets"))).map((file) => relative(root, file))),
];

const files = {};
for (const sourceFile of sourceFiles.sort()) {
  const extension = extname(sourceFile).toLowerCase();
  const content = await readFile(join(root, sourceFile));
  const path = `/${sourceFile.replaceAll("\\\\", "/")}`;
  files[path] = {
    type: mimeTypes[extension] ?? "application/octet-stream",
    encoding: textExtensions.has(extension) ? "text" : "base64",
    body: textExtensions.has(extension) ? content.toString("utf8") : content.toString("base64"),
    etag: `\"${createHash("sha256").update(content).digest("hex").slice(0, 20)}\"`,
  };
}

const worker = `const FILES = ${JSON.stringify(files)};

const SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:; form-action 'self' mailto:; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'; upgrade-insecure-requests",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY"
};

function binaryBody(base64) {
  const decoded = atob(base64);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function respond(request, file, status = 200) {
  const headers = new Headers(SECURITY_HEADERS);
  headers.set("Content-Type", file.type);
  headers.set("ETag", file.etag);
  headers.set("Cache-Control", file.type.startsWith("text/html")
    ? "public, max-age=0, must-revalidate"
    : "public, max-age=3600, stale-while-revalidate=86400");

  if (request.headers.get("If-None-Match") === file.etag) {
    return new Response(null, { status: 304, headers });
  }

  const body = request.method === "HEAD"
    ? null
    : file.encoding === "base64" ? binaryBody(file.body) : file.body;
  return new Response(body, { status, headers });
}

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { ...SECURITY_HEADERS, Allow: "GET, HEAD" }
      });
    }

    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/index.html") {
      return Response.redirect(new URL("/", url), 308);
    }
    if (path === "/") path = "/index.html";
    if (path === "/manifesto" || path === "/manifesto/") path = "/manifesto.html";

    const file = FILES[path];
    if (file) return respond(request, file);
    return respond(request, FILES["/404.html"], 404);
  }
};
`;

await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "server"), { recursive: true });
await mkdir(join(dist, ".openai"), { recursive: true });
await writeFile(join(dist, "server", "index.js"), worker);
await cp(join(root, ".openai", "hosting.json"), join(dist, ".openai", "hosting.json"));

console.log(`Built Trustio worker with ${Object.keys(files).length} embedded files.`);
