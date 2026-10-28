// Disposable XSS teaching app: fictional data, loopback only.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Deliberately NOT HttpOnly, so the lesson can show what injected JavaScript
// can read. The README asks you to add HttpOnly and compare.
export const DEMO_COOKIE = 'cp_xss_demo=fictional-session-1234; Path=/; SameSite=Strict';

// Output encoding for HTML text and quoted attribute values.
// & must be replaced first, or the & inside "&lt;" would be encoded again.
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function greeting(name, mode) {
  if (mode === 'vulnerable') {
    // Intentionally vulnerable: input becomes part of the HTML source.
    return '<p id="greeting">Hello, ' + name + '!</p>';
  }
  if (mode === 'fixed') {
    // Patch: input is encoded, so the browser shows it as text.
    return '<p id="greeting">Hello, ' + escapeHtml(name) + '!</p>';
  }
  throw new Error('Choose vulnerable or fixed');
}

const style = '<style>body{font:18px system-ui;max-width:800px;margin:30px auto;padding:20px;line-height:1.6}input,select,button{font:inherit;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:16px}label{display:block;margin:12px 0}#status{background:#fff3c4;padding:8px 12px}</style>';

const formPage = `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberPath XSS lab</title>${style}
<h1>Why does this greeting run code?</h1>
<p>Local training app. It greets you by the name you type. The intended rule:
whatever you type is shown as text, exactly as typed.</p>
<form action="/greet" method="get">
<label>Implementation <select name="mode"><option>vulnerable</option><option>fixed</option></select></label>
<label>Your name <input name="name" value="Sam"></label>
<button>Send request</button></form>
<p>Try the inputs from the lab README in vulnerable mode, then fixed mode. Predict each result before submitting.</p>
<p>This app sets a fictional cookie named <code>cp_xss_demo</code> so you can see what injected code can read. It is not a real session.</p></html>`;

export function resultPage(name, mode) {
  const fragment = greeting(name, mode);
  // The source box is always encoded: it must show the HTML, not run it.
  // The rendered greeting comes last, so broken markup cannot hide the rest.
  return `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CyberPath XSS lab result</title>${style}
<p><a href="/">Back to the form</a></p>
<h1>Result: ${mode} implementation</h1>
<p id="status" role="status">No script from your input has run.</p>
<h2>What the server sent for the greeting</h2>
<pre><code id="source">${escapeHtml(fragment)}</code></pre>
<h2>How your browser displayed it</h2>
${fragment}
</html>`;
}

export function createLabServer() {
  return createServer((request, response) => {
    function send(status, body, type = 'text/plain; charset=utf-8') {
      response.writeHead(status, {
        'Content-Type': type,
        'Content-Length': Buffer.byteLength(body),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
        'Set-Cookie': DEMO_COOKIE,
      });
      response.end(body);
    }

    if (request.method !== 'GET') {
      send(405, 'Use GET');
      return;
    }
    let url;
    try {
      url = new URL(request.url, 'http://127.0.0.1');
    } catch {
      // A malformed request target such as `//[` must not crash the lab.
      send(400, 'Invalid URL');
      return;
    }
    if (url.pathname === '/') {
      send(200, formPage, 'text/html; charset=utf-8');
      return;
    }
    if (url.pathname !== '/greet') {
      send(404, 'Not found');
      return;
    }

    const mode = url.searchParams.get('mode') ?? 'fixed';
    const name = url.searchParams.get('name') ?? '';
    if (mode !== 'vulnerable' && mode !== 'fixed') {
      send(400, 'Unknown implementation');
      return;
    }
    send(200, resultPage(name, mode), 'text/html; charset=utf-8');
  });
}

// Importing this module in tests must not start a listener.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 8767);
  const server = createLabServer();
  server.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`CyberPath XSS lab: http://127.0.0.1:${server.address().port} (Ctrl+C to stop)`);
  });
}
