import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLabServer, escapeHtml, greeting } from './app.mjs';

const payload = `<img src=x onerror="document.getElementById('status').textContent='Script ran. It can read: '+document.cookie">`;

test('escapeHtml encodes the five HTML-special characters, ampersand first', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
  assert.equal(escapeHtml('Sam'), 'Sam');
});

test('ordinary names look the same in both modes', () => {
  for (const name of ['Sam', 'Ana Maria', '']) {
    assert.equal(greeting(name, 'vulnerable'), greeting(name, 'fixed'));
  }
});

test('markup in input becomes live HTML only in vulnerable mode', () => {
  assert.ok(greeting(payload, 'vulnerable').includes('<img src=x onerror='));
  assert.ok(greeting('Use the <b> tag', 'vulnerable').includes('<b>'));
  const fixed = greeting(payload, 'fixed');
  assert.ok(!fixed.includes('<img'));
  assert.ok(fixed.includes('&lt;img src=x onerror=&quot;'));
});

test('HTTP serves encoded HTML in fixed mode, keeps headers and validates requests', async t => {
  const server = createLabServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;

  const home = await fetch(base);
  assert.match(await home.text(), /<form/);
  assert.match(home.headers.get('set-cookie'), /^cp_xss_demo=/);

  const fixed = await fetch(`${base}/greet?${new URLSearchParams({ mode: 'fixed', name: payload })}`);
  assert.match(fixed.headers.get('content-type'), /^text\/html/);
  assert.equal(fixed.headers.get('x-content-type-options'), 'nosniff');
  const body = await fixed.text();
  assert.ok(!body.includes('<img'), 'fixed mode must not send a live image tag');
  assert.ok(body.includes('&lt;img'));

  const defaulted = await (await fetch(`${base}/greet?name=${encodeURIComponent('<b>')}`)).text();
  assert.ok(!defaulted.includes('Hello, <b>'), 'a missing mode defaults to fixed');

  assert.equal((await fetch(`${base}/greet?mode=unknown`)).status, 400);
  assert.equal((await fetch(`${base}/missing`)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
