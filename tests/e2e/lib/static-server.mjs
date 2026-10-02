import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Start an ephemeral HTTP static file server.
 * @param {string} rootDir Root directory to serve files from.
 * @returns {Promise<{ server: http.Server, port: number, baseUrl: string, close: () => Promise<void> }>}
 */
export async function startStaticServer(rootDir) {
  const server = http.createServer((req, res) => {
    // Only allow GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('Method Not Allowed');
    }

    try {
      let rawUrl = req.url || '/';
      let pathname = rawUrl.split('?')[0].split('#')[0];

      // Safe decoding
      pathname = decodeURIComponent(pathname);

      // Handle directory index mappings
      if (pathname === '/' || pathname === '') {
        pathname = '/index.html';
      } else if (pathname.endsWith('/')) {
        pathname += 'index.html';
      } else if (!path.extname(pathname)) {
        // Check if directory exists with index.html, else try appending .html
        const directPath = path.join(rootDir, pathname);
        if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
          pathname += '/index.html';
        } else if (fs.existsSync(directPath + '.html')) {
          pathname += '.html';
        }
      }

      // Prevent directory traversal
      const targetPath = path.resolve(rootDir, '.' + pathname);
      if (!targetPath.startsWith(path.resolve(rootDir))) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        return res.end('Forbidden');
      }

      if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end(`File Not Found: ${pathname}`);
      }

      const ext = path.extname(targetPath).toLowerCase();
      const contentType = MIME_MAP[ext] || 'application/octet-stream';

      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      });

      if (req.method === 'HEAD') {
        return res.end();
      }

      fs.createReadStream(targetPath).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Internal Server Error: ${err.message}`);
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const address = server.address();
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const close = () =>
    new Promise((resolve) => {
      server.close(() => resolve());
    });

  return { server, port, baseUrl, close };
}
