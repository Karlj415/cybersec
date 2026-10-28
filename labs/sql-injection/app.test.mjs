import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { connect } from 'node:net';
import { createLabServer, database, search } from './app.mjs';

// Sends raw bytes, so the request can be malformed in ways fetch() refuses to send.
async function rawRequest(port, ...parts) {
  const socket = connect(port, '127.0.0.1');
  await once(socket, 'connect');
  let reply = '';
  socket.on('data', data => { reply += data; });
  for (const part of parts.slice(0, -1)) {
    socket.write(part);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  socket.end(parts.at(-1));
  await once(socket, 'close');
  return reply.split('\r\n')[0];
}

function withDatabase(check) {
  const db = database();
  try { check(db); } finally { db.close(); }
}

test('normal search returns exact public matches in both modes', () => {
  withDatabase(db => {
    for (const mode of ['vulnerable', 'fixed']) {
      assert.deepEqual(search(db, 'Notebook', mode).rows, ['Notebook']);
      assert.deepEqual(search(db, 'Unreleased prototype', mode).rows, []);
      assert.deepEqual(search(db, '', mode).rows, []);
      assert.deepEqual(search(db, 'Missing', mode).rows, []);
    }
  });
});

test('injection leaks a draft only when input changes SQL source', () => {
  withDatabase(db => {
    const attack = "' OR 1=1 -- ";
    assert.ok(search(db, attack, 'vulnerable').rows.includes('Unreleased prototype'));
    const fixed = search(db, attack, 'fixed');
    assert.deepEqual(fixed.rows, []);
    assert.deepEqual(fixed.parameters, [attack]);
    assert.ok(!fixed.query.includes(attack));
    assert.equal(fixed.error, null);
  });
});

test('parameter binding preserves a legitimate apostrophe', () => {
  withDatabase(db => {
    assert.ok(search(db, "O'Reilly Guide", 'vulnerable').error);
    assert.deepEqual(search(db, "O'Reilly Guide", 'fixed').rows, ["O'Reilly Guide"]);
  });
});

test('HTTP preserves defaults, input encoding, JSON isolation and request validation', async t => {
  const server = createLabServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base)).text(), /<form/);
  for (const mode of ['vulnerable', 'fixed']) {
    const args = new URLSearchParams({ mode, name: "' OR 1=1 -- " });
    const response = await fetch(`${base}/search?${args}`);
    assert.match(response.headers.get('content-type'), /^application\/json/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    const result = await response.json();
    assert.equal(result.rows.includes('Unreleased prototype'), mode === 'vulnerable');
  }
  const defaultResult = await (await fetch(`${base}/search?name=Notebook`)).json();
  assert.deepEqual(defaultResult.parameters, ['Notebook']);
  const input = '<img src=x onerror=alert(1)>';
  const encoded = new URLSearchParams({ mode: 'fixed', name: input });
  const response = await fetch(`${base}/search?${encoded}`);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual((await response.json()).parameters, [input]);
  assert.equal((await fetch(`${base}/search?mode=unknown`)).status, 400);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});

test('a malformed request target gets 400 and the server keeps running', async t => {
  const server = createLabServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  const { port } = server.address();
  assert.equal(await rawRequest(port, 'GET //[ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'), 'HTTP/1.1 400 Bad Request');
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
});
