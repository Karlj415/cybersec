// Small loopback-only static server for the course and local inspection labs.
import { createServer } from 'node:http';
import { realpathSync } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
};

function excluded(path) {
  return path.split(/[\\/]/).some(segment => segment.startsWith('.') || segment === 'node_modules');
}

// Only answer requests addressed to this machine by a loopback name and our
// own port. A web page cannot then point its own domain at 127.0.0.1 (DNS
// rebinding) and read these files through the visitor's browser.
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
export function allowedHost(host, port) {
  if (typeof host !== 'string' || !host) return false;
  try {
    const url = new URL(`http://${host}`);
    return url.host === host.toLowerCase() && LOOPBACK.has(url.hostname) && Number(url.port || 80) === port;
  } catch {
    return false;
  }
}

function within(root, target) {
  const path = relative(root, target);
  return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path);
}

export function createStaticServer(directory) {
  const root = realpathSync(directory);
  const server = createServer(async (request, response) => {
    function reply(status, body, type = 'text/plain; charset=utf-8') {
      response.writeHead(status, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    }
    if (!allowedHost(request.headers.host, server.address().port)) {
      reply(421, 'This server only answers requests for 127.0.0.1, localhost or [::1] on its own port');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      reply(405, 'Use GET or HEAD');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      reply(400, 'Invalid URL');
      return;
    }
    // Do not expose hidden files, Git metadata or installed packages.
    if (excluded(pathname)) {
      reply(403, 'Forbidden');
      return;
    }
    try {
      let file = await realpath(resolve(root, '.' + pathname));
      if (!within(root, file) || excluded(relative(root, file))) { reply(403, 'Forbidden'); return; }
      if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
      // Check again after resolving an index or symlink.
      if (!within(root, file) || excluded(relative(root, file))) { reply(403, 'Forbidden'); return; }
      const body = await readFile(file);
      reply(200, body, types[extname(file)] ?? 'application/octet-stream');
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') reply(404, 'Not found');
      else if (error.code === 'EACCES') reply(403, 'Forbidden');
      else reply(500, 'Unable to read file');
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const directory = process.argv[2] ?? '.';
    const port = Number(process.argv[3] ?? 8765);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Port must be an integer from 0 to 65535');
    const server = createStaticServer(directory);
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Serving ${resolve(directory)} at http://127.0.0.1:${server.address().port} — Ctrl+C to stop`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
