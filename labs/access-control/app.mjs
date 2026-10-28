// Disposable access-control and CSRF teaching app: fictional data, loopback only.
// Two servers: the shop (default port 8768) and a pretend attacker page (8769).
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const SESSION_COOKIE = 'cp_shop_session';
export const ATTACKER_EMAIL = 'attacker@example.invalid';

export function createStore() {
  return {
    users: {
      alice: { name: 'Alice', email: 'alice@example.invalid' },
      bob: { name: 'Bob', email: 'bob@example.invalid' },
    },
    invoices: {
      1041: { owner: 'alice', item: 'Laptop stand', total: '$49.00', address: '1 Example Lane' },
      1042: { owner: 'bob', item: 'Noise-cancelling headphones', total: '$199.00', address: '2 Sample Street' },
    },
    // session id -> { user, csrfToken }
    sessions: new Map(),
  };
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function signIn(store, user) {
  if (!Object.hasOwn(store.users, user)) return null;
  const id = randomBytes(16).toString('hex');
  store.sessions.set(id, { user, csrfToken: randomBytes(16).toString('hex') });
  return id;
}

export function sessionFromCookie(store, cookieHeader = '') {
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return store.sessions.get(rest.join('=')) ?? null;
  }
  return null;
}

// IDOR: returns the invoice the signed-in user may see, or null.
export function findInvoice(store, session, id, mode) {
  const invoice = Object.hasOwn(store.invoices, id) ? store.invoices[id] : null;
  if (mode === 'vulnerable') {
    // Intentionally vulnerable: any signed-in user gets any invoice by number.
    return invoice;
  }
  if (mode === 'fixed') {
    // Patch: the server checks ownership against the session, not the URL.
    return invoice && invoice.owner === session.user ? invoice : null;
  }
  throw new Error('Choose vulnerable or fixed');
}

function sameToken(expected, supplied) {
  const a = Buffer.from(expected);
  const b = Buffer.from(String(supplied ?? ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

// CSRF: changes the recovery email if the request is allowed.
export function changeEmail(store, session, form, mode) {
  if (mode === 'vulnerable') {
    // Intentionally vulnerable: the session cookie alone is trusted.
  } else if (mode === 'fixed') {
    // Patch: only the shop's own form contains this session's secret token.
    if (!sameToken(session.csrfToken, form.get('csrf'))) {
      return { status: 403, message: 'Rejected: missing or wrong CSRF token. Nothing changed.' };
    }
  } else {
    throw new Error('Choose vulnerable or fixed');
  }
  const email = String(form.get('email') ?? '').trim();
  if (!email || email.length > 100) return { status: 400, message: 'Enter an email address (100 characters or fewer).' };
  store.users[session.user].email = email;
  return { status: 200, message: `Recovery email for ${store.users[session.user].name} is now ${email}.` };
}

const style = '<style>body{font:18px system-ui;max-width:800px;margin:30px auto;padding:20px;line-height:1.6}input,button{font:inherit;max-width:100%}form{margin:12px 0}fieldset{margin:16px 0}code{overflow-wrap:anywhere}</style>';

function page(title, body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>${style}
${body}</html>`;
}

function homePage(store, session) {
  if (!session) {
    return page('CyberPath shop lab', `<h1>CyberPath shop (local training app)</h1>
<p>Two fictional customers, Alice and Bob, each have one invoice. Sign-in is a button with no password: this lab is about what happens <em>after</em> sign-in.</p>
<form method="post" action="/login"><input type="hidden" name="user" value="alice"><button>Sign in as Alice</button></form>
<form method="post" action="/login"><input type="hidden" name="user" value="bob"><button>Sign in as Bob</button></form>`);
  }
  const user = store.users[session.user];
  const mine = Object.entries(store.invoices).find(([, invoice]) => invoice.owner === session.user)[0];
  return page('CyberPath shop lab', `<h1>CyberPath shop (local training app)</h1>
<p id="who">Signed in as <b>${escapeHtml(user.name)}</b>.</p>
<h2>Your invoice</h2>
<p><a href="/vulnerable/invoices/${mine}">Open invoice ${mine} (vulnerable)</a><br>
<a href="/fixed/invoices/${mine}">Open invoice ${mine} (fixed)</a></p>
<h2>Account settings</h2>
<p>Recovery email: <b id="email">${escapeHtml(user.email)}</b></p>
<fieldset><legend>Vulnerable form (no token)</legend>
<form method="post" action="/vulnerable/email"><label>New email <input name="email" type="email" required></label> <button>Save (vulnerable)</button></form></fieldset>
<fieldset><legend>Fixed form (hidden CSRF token)</legend>
<form method="post" action="/fixed/email"><input type="hidden" name="csrf" value="${session.csrfToken}"><label>New email <input name="email" type="email" required></label> <button>Save (fixed)</button></form></fieldset>
<form method="post" action="/logout"><button>Sign out</button></form>`);
}

function invoicePage(id, invoice, mode) {
  return page(`Invoice ${id}`, `<p><a href="/">Back to the shop</a></p>
<h1>Invoice ${escapeHtml(id)} (${mode})</h1>
<dl><dt>Item</dt><dd>${escapeHtml(invoice.item)}</dd><dt>Total</dt><dd>${escapeHtml(invoice.total)}</dd>
<dt>Ship to</dt><dd>${escapeHtml(invoice.address)}</dd><dt>Owner</dt><dd id="owner">${escapeHtml(invoice.owner)}</dd></dl>`);
}

function messagePage(title, message) {
  return page(title, `<p><a href="/">Back to the shop</a></p><h1>${escapeHtml(title)}</h1><p id="message">${escapeHtml(message)}</p>`);
}

async function readForm(request) {
  const type = request.headers['content-type'] ?? '';
  if (!type.startsWith('application/x-www-form-urlencoded')) return null;
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 4096) return null;
  }
  return new URLSearchParams(body);
}

export function createLabServer(store = createStore()) {
  return createServer(async (request, response) => {
    function send(status, body, extra = {}) {
      response.writeHead(status, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        ...extra,
      });
      response.end(body);
    }
    function redirectHome(cookie) {
      response.writeHead(303, { Location: '/', 'Cache-Control': 'no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
      response.end();
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    const session = sessionFromCookie(store, request.headers.cookie);
    const route = `${request.method} ${url.pathname}`;

    if (route === 'GET /') {
      send(200, homePage(store, session));
      return;
    }

    if (request.method === 'POST' && ['/login', '/logout', '/vulnerable/email', '/fixed/email'].includes(url.pathname)) {
      const form = await readForm(request);
      if (!form) {
        send(415, messagePage('Unsupported request', 'Send a normal HTML form (at most 4 KB).'));
        return;
      }
      if (url.pathname === '/login') {
        const id = signIn(store, form.get('user'));
        if (!id) {
          send(400, messagePage('Unknown user', 'Choose Alice or Bob.'));
          return;
        }
        redirectHome(`${SESSION_COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax`);
        return;
      }
      if (url.pathname === '/logout') {
        for (const [id, value] of store.sessions) if (value === session) store.sessions.delete(id);
        redirectHome(`${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
        return;
      }
      if (!session) {
        send(401, messagePage('Not signed in', 'The request arrived without a valid session cookie. Nothing changed.'));
        return;
      }
      const mode = url.pathname.split('/')[1];
      const result = changeEmail(store, session, form, mode);
      send(result.status, messagePage(result.status === 200 ? 'Email changed' : 'Request refused', result.message));
      return;
    }

    const match = url.pathname.match(/^\/(vulnerable|fixed)\/invoices\/(\d+)$/);
    if (request.method === 'GET' && match) {
      if (!session) {
        send(401, messagePage('Not signed in', 'Sign in on the shop home page first.'));
        return;
      }
      const [, mode, id] = match;
      const invoice = findInvoice(store, session, id, mode);
      if (!invoice) {
        // 404, not 403: do not confirm that someone else's invoice exists.
        send(404, messagePage('Invoice not found', `No invoice ${id} for your account.`));
        return;
      }
      send(200, invoicePage(id, invoice, mode));
      return;
    }

    send(request.method === 'GET' ? 404 : 405, messagePage('Not found', 'Use the links and forms on the shop page.'));
  });
}

// A page that pretends to be some other website. It never sees the shop's
// pages or cookies; it can only make the browser send a form to the shop.
export function attackerPage(target) {
  const forms = ['vulnerable', 'fixed'].map(mode => `<form method="post" action="${escapeHtml(target)}/${mode}/email">
<input type="hidden" name="email" value="${ATTACKER_EMAIL}">
<button>Claim prize (${mode} target)</button></form>`).join('\n');
  return page('Free prize', `<h1>Congratulations! You won a free prize!</h1>
<p>This page pretends to be an unrelated website. Each button secretly submits a form to the shop that sets the recovery email to <code>${ATTACKER_EMAIL}</code>.
A real attack would hide the form and submit it automatically; here you press the button so you can see each step.</p>
${forms}`);
}

export function createAttackerServer(target) {
  return createServer((request, response) => {
    const body = request.method === 'GET' && new URL(request.url, 'http://127.0.0.1').pathname === '/'
      ? attackerPage(target) : 'Not found';
    response.writeHead(body === 'Not found' ? 404 : 200, {
      'Content-Type': body === 'Not found' ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
    });
    response.end(body);
  });
}

function listen(server, port) {
  return new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveListen(server.address().port));
  });
}

// Importing this module in tests must not start a listener.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const shopPort = await listen(createLabServer(), Number(process.argv[2] ?? 8768));
    const shop = `http://127.0.0.1:${shopPort}`;
    const attackerPort = await listen(createAttackerServer(shop), Number(process.argv[3] ?? 8769));
    console.log(`CyberPath shop lab: ${shop}`);
    console.log(`Pretend attacker page: http://127.0.0.1:${attackerPort} (Ctrl+C stops both)`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
