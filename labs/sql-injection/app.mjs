// Disposable SQL injection teaching app: fictional data, loopback only.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function database() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE products (name TEXT, public INTEGER)');
  const insert = db.prepare('INSERT INTO products VALUES (?, ?)');
  insert.run('Notebook', 1);
  insert.run("O'Reilly Guide", 1);
  insert.run('Unreleased prototype', 0);
  return db;
}

export function search(db, name, mode) {
  let query;
  let parameters;
  if (mode === 'vulnerable') {
    // Intentionally vulnerable: input becomes part of SQL source text.
    query = "SELECT name FROM products WHERE public = 1 AND name = '" + name + "'";
    parameters = [];
  } else if (mode === 'fixed') {
    // Patch: SQL structure stays constant; values are bound separately.
    query = 'SELECT name FROM products WHERE public = 1 AND name = ?';
    parameters = [name];
  } else {
    throw new Error('Choose vulnerable or fixed');
  }

  try {
    const rows = db.prepare(query).all(...parameters).map(row => row.name);
    return { query, parameters, rows, error: null };
  } catch (error) {
    return { query, parameters, rows: [], error: error.message };
  }
}

const page = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberPath SQL lab</title>
<style>body{font:18px system-ui;max-width:800px;margin:30px auto;padding:20px;line-height:1.6}input,select,button{font:inherit;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:16px}label{display:block;margin:12px 0}</style>
<h1>Why does this SQL query change?</h1>
<p>Local training app with three fictional products: two public and one private draft.
The intended rule: search must return only public products with an exact matching name.</p>
<form action="/search" method="get">
<label>Implementation <select name="mode"><option>vulnerable</option><option>fixed</option></select></label>
<label>Product name <input name="name" value="Notebook"></label>
<button>Send request</button></form>
<p>Try <code>Notebook</code>, then <code>O'Reilly Guide</code>, then <code>' OR 1=1 -- </code>.
Switch to fixed and repeat all three. Predict each result before submitting.</p>
<p>The response shows the SQL template, separately supplied parameters, returned rows and any error.
Use Back to change one input. See the course lesson and lab README for the explanation.</p>
<p>This deliberately exposes SQL for teaching. Production apps should not disclose query internals.</p></html>`;

export function createLabServer() {
  return createServer((request, response) => {
    function send(status, body, type = 'text/plain; charset=utf-8') {
      response.writeHead(status, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    }

    if (request.method !== 'GET') {
      send(405, 'Use GET');
      return;
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/') {
      send(200, page, 'text/html; charset=utf-8');
      return;
    }
    if (url.pathname !== '/search') {
      send(404, 'Not found');
      return;
    }

    const mode = url.searchParams.get('mode') ?? 'fixed';
    const name = url.searchParams.get('name') ?? '';
    if (mode !== 'vulnerable' && mode !== 'fixed') {
      send(400, 'Unknown implementation');
      return;
    }
    const db = database();
    try {
      const result = search(db, name, mode);
      // JSON is served as JSON, never interpolated into executable HTML.
      send(200, JSON.stringify(result, null, 2), 'application/json; charset=utf-8');
    } finally {
      db.close();
    }
  });
}

// Importing this module in tests must not start a listener.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 8766);
  const server = createLabServer();
  server.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`CyberPath SQL lab: http://127.0.0.1:${server.address().port} — Ctrl+C to stop`);
  });
}
