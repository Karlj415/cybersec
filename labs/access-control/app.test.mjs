import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  ATTACKER_EMAIL, SESSION_COOKIE, attackerPage, changeEmail, createAttackerServer,
  createLabServer, createStore, findInvoice, sessionFromCookie, signIn,
} from './app.mjs';

function aliceSession(store) {
  const id = signIn(store, 'alice');
  return sessionFromCookie(store, `${SESSION_COOKIE}=${id}`);
}

test('customers can open their own invoice in both modes', () => {
  const store = createStore();
  const alice = aliceSession(store);
  for (const mode of ['vulnerable', 'fixed']) {
    assert.equal(findInvoice(store, alice, '1041', mode).owner, 'alice');
    assert.equal(findInvoice(store, alice, '9999', mode), null);
  }
});

test("IDOR: another customer's invoice leaks only in vulnerable mode", () => {
  const store = createStore();
  const alice = aliceSession(store);
  assert.equal(findInvoice(store, alice, '1042', 'vulnerable').owner, 'bob');
  assert.equal(findInvoice(store, alice, '1042', 'fixed'), null);
});

test('CSRF: a form without the token changes the email only in vulnerable mode', () => {
  const store = createStore();
  const alice = aliceSession(store);
  const forged = new URLSearchParams({ email: ATTACKER_EMAIL });
  assert.equal(changeEmail(store, alice, forged, 'fixed').status, 403);
  assert.equal(store.users.alice.email, 'alice@example.invalid');
  assert.equal(changeEmail(store, alice, forged, 'vulnerable').status, 200);
  assert.equal(store.users.alice.email, ATTACKER_EMAIL);
});

test("the shop's own form works in fixed mode; a wrong token is rejected", () => {
  const store = createStore();
  const alice = aliceSession(store);
  const wrong = new URLSearchParams({ email: 'new@example.invalid', csrf: 'f'.repeat(32) });
  assert.equal(changeEmail(store, alice, wrong, 'fixed').status, 403);
  const right = new URLSearchParams({ email: 'new@example.invalid', csrf: alice.csrfToken });
  assert.equal(changeEmail(store, alice, right, 'fixed').status, 200);
  assert.equal(store.users.alice.email, 'new@example.invalid');
  assert.equal(changeEmail(store, alice, new URLSearchParams({ csrf: alice.csrfToken }), 'fixed').status, 400);
  assert.equal(sessionFromCookie(store, `${SESSION_COOKIE}=not-a-session`), null);
  assert.equal(signIn(store, 'mallory'), null);
});

test('HTTP: session cookie flags, ownership check, token check and request validation', async t => {
  const server = createLabServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const form = body => ({ method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });

  assert.match(await (await fetch(base)).text(), /Sign in as Alice/);
  assert.equal((await fetch(`${base}/fixed/invoices/1041`)).status, 401);
  assert.equal((await fetch(`${base}/fixed/email`, form({ email: ATTACKER_EMAIL }))).status, 401);

  const login = await fetch(`${base}/login`, form({ user: 'alice' }));
  assert.equal(login.status, 303);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=[0-9a-f]{32}; Path=/; HttpOnly; SameSite=Lax$`));
  const cookie = { Cookie: setCookie.split(';')[0] };

  const home = await (await fetch(base, { headers: cookie })).text();
  assert.match(home, /Signed in as <b>Alice<\/b>/);
  const token = home.match(/name="csrf" value="([0-9a-f]{32})"/)[1];

  assert.equal((await fetch(`${base}/fixed/invoices/1041`, { headers: cookie })).status, 200);
  const other = await fetch(`${base}/fixed/invoices/1042`, { headers: cookie });
  assert.equal(other.status, 404);
  assert.ok(!(await other.text()).includes('headphones'));

  const forged = await fetch(`${base}/fixed/email`, { ...form({ email: ATTACKER_EMAIL }), headers: { ...form({}).headers, ...cookie } });
  assert.equal(forged.status, 403);
  const real = await fetch(`${base}/fixed/email`, { ...form({ email: 'new@example.invalid', csrf: token }), headers: { ...form({}).headers, ...cookie } });
  assert.equal(real.status, 200);
  assert.match(await (await fetch(base, { headers: cookie })).text(), /id="email">new@example\.invalid</);

  assert.equal((await fetch(`${base}/fixed/email`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...cookie }, body: '{}' })).status, 415);
  assert.equal((await fetch(`${base}/login`, form({ user: 'mallory' }))).status, 400);
  assert.equal((await fetch(`${base}/vulnerable/email`)).status, 404);
  assert.equal((await fetch(`${base}/missing`, { method: 'DELETE' })).status, 405);

  const logout = await fetch(`${base}/logout`, { ...form({}), headers: { ...form({}).headers, ...cookie } });
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${base}/fixed/invoices/1041`, { headers: cookie })).status, 401);
});

test('the attacker page targets the shop and cannot include a token', async t => {
  const html = attackerPage('http://127.0.0.1:8768');
  assert.match(html, /action="http:\/\/127\.0\.0\.1:8768\/vulnerable\/email"/);
  assert.match(html, /action="http:\/\/127\.0\.0\.1:8768\/fixed\/email"/);
  assert.ok(!html.includes('name="csrf"'));
  const server = createAttackerServer('http://127.0.0.1:8768');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.match(await (await fetch(base)).text(), /Claim prize/);
  assert.equal((await fetch(`${base}/other`)).status, 404);
});
