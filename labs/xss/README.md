# Cross-site scripting (XSS): follow the input into the page, encode it, verify the fix

Allow 45-60 minutes. Prerequisites: the HTML lesson, the cookies lesson, "Read the JavaScript before the SQL lab", and the SQL injection lab (this lab follows the same pattern). Use Node 24 LTS, or Node 22.13+ on the 22.x line. No npm packages or accounts are used.

## Start the app

Use the same VM as the SQL injection lab. Open Terminal **inside that VM**, change into the copied course folder, then run:

```sh
cd labs/xss
node app.mjs
```

Expected output:

```text
CyberPath XSS lab: http://127.0.0.1:8767 (Ctrl+C to stop)
```

Open **http://127.0.0.1:8767** in a browser **inside the same VM**. Keep the terminal running. If you see `EADDRINUSE`, another program already uses port 8767: stop the earlier lab with Ctrl+C in its terminal and try again.

The app only listens on `127.0.0.1`, so nothing outside the VM can reach it. Do not change that to `0.0.0.0`.

## 1. Understand the intended feature

The page greets you by the name you type. The rule: **whatever you type should appear on the page as text, exactly as you typed it.**

Open `app.mjs` and trace one request: the form sends a GET request to `/greet`; `url.searchParams.get('name')` reads your input; `greeting(name, mode)` builds a small piece of HTML; `resultPage` puts that piece into a full page; the server sends the page as `text/html`, and the browser reads it as HTML.

The result page has three parts, top to bottom:

- **Status line** (yellow): says `No script from your input has run.` unless injected JavaScript changes it.
- **What the server sent:** the exact HTML the server produced for the greeting, shown as text so you can read it.
- **How your browser displayed it:** that same HTML, given to the browser for real.

The app also sets a cookie called `cp_xss_demo` with a made-up value. It stands in for a login cookie so you can see what injected code can reach. It is not a real session.

## 2. Predict, then run the vulnerable version

Select `vulnerable` and send each input below. **Write down your prediction first.**

**Input 1:** `Sam`

The vulnerable code is:

```javascript
return '<p id="greeting">Hello, ' + name + '!</p>';
```

Expected: `Hello, Sam!`. The source box shows `<p id="greeting">Hello, Sam!</p>`.

**Input 2:** `Use the <b> tag`

Expected: the page shows `Hello, Use the tag!` with ` tag!` in **bold**, and the `<b>` you typed has disappeared. The source box shows why: your `<b>` is now part of the HTML, so the browser treated it as a "start bold text" instruction instead of four characters to display. An ordinary user writing about HTML already breaks the page. This is the same "valid data breaks it" warning sign as `O'Reilly Guide` in the SQL lab.

**Input 3** (copy it exactly, as one line):

```html
<img src=x onerror="document.getElementById('status').textContent='Script ran. It can read: '+document.cookie">
```

Expected: the yellow status line changes to `Script ran. It can read: cp_xss_demo=fictional-session-1234`, and the greeting shows `Hello,` then a small broken-image icon, then `!`.

Explain each piece before moving on:

- `<img src=x>` asks the browser to load an image from the address `x`. There is no such image, so loading fails. (Your terminal shows nothing for this; the server just answers 404.)
- `onerror="..."` is an HTML attribute whose value is **JavaScript**. The browser runs it when the image fails to load.
- `document.getElementById('status').textContent = ...` finds the status line and replaces its text.
- `document.cookie` is every cookie for this site that page JavaScript is allowed to read.

The input contains no `<script>` tag, but JavaScript ran anyway. A filter that blocked the word `script` would not have stopped it.

This is **reflected** XSS: the input travels in the URL (look at the address bar) and comes straight back in the response. Anyone who clicks a link containing that URL runs the attacker's code on this site, with this site's permissions. A real attack would send `document.cookie` to the attacker's server instead of showing it. This lab only changes text on your own page.

## 3. Apply the fix and explain the JavaScript

Select `fixed` and repeat all three inputs.

| Input | Vulnerable | Fixed |
| --- | --- | --- |
| `Sam` | Hello, Sam! | Hello, Sam! |
| `Use the <b> tag` | Bold text, `<b>` missing | Shows `<b>` literally |
| image payload | Status line says Script ran | Payload shown as plain text, status unchanged |

The fixed code is:

```javascript
return '<p id="greeting">Hello, ' + escapeHtml(name) + '!</p>';
```

and `escapeHtml` is:

```javascript
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
```

Each `replaceAll` swaps one HTML-special character for an **HTML entity**: a code like `&lt;` that the browser *displays* as `<` but never treats as the start of a tag. This is called **output encoding** (or escaping). Look at the source box in fixed mode: every `<` became `&lt;`. The browser shows your text exactly as typed, and nothing in it can act.

Why `&` goes first: if it came last, it would re-encode the `&` inside every `&lt;` we just made, turning `<` into the visible text `&lt;`. Why quotes: inside an attribute like `value="..."`, a `"` in the input would end the attribute early and let the rest become new attributes, such as `onerror`.

Now make the repair yourself: in the `vulnerable` branch of `greeting`, wrap `name` in `escapeHtml(...)`. Stop the server (Ctrl+C), start it again with `node app.mjs`, and repeat all three inputs with `vulnerable` selected. Both modes should now be safe.

## 4. Verify with tests

Before editing, run this from the `labs/xss` folder in a second terminal:

```sh
node --test app.test.mjs
```

Expected: `# pass 5` and `# fail 0`. The tests show the old bug, the fixed behavior, the encoding function itself, and real HTTP requests.

After your patch, run them again. **Exactly one test should fail:** `markup in input becomes live HTML only in vulnerable mode`. It described the old bug. Change its vulnerable-mode assertions so they require encoded output from both modes (for example, check that `greeting(payload, 'vulnerable')` does not include `<img`). Rerun until all 5 pass. Keep the payload in the test: it is now a regression test that fails if anyone removes the encoding again.

### Compare your edited tests

Try the edit yourself first. Then compare with the blocks below: yours can look different and still be right, as long as each test now requires the safe result from **both** modes and still contains the attack. A block that starts with `// Replaces:` is a whole new test that takes the place of the test named there. A block that starts with `// In the test` changes one line inside that test.

```javascript
// Replaces: markup in input becomes live HTML only in vulnerable mode
test('markup in input is encoded in both modes', () => {
  for (const mode of ['vulnerable', 'fixed']) {
    const html = greeting(payload, mode);
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&lt;img src=x onerror=&quot;'));
    assert.ok(!greeting('Use the <b> tag', mode).includes('<b>'));
  }
});
```

## 5. See what HttpOnly does and does not do

In `app.mjs`, find `DEMO_COOKIE` and add `; HttpOnly` to the end of the string. Restart the server. **Undo your patch from step 3 first** (or copy the original file back) so the vulnerable mode is vulnerable again.

Send the image payload in vulnerable mode. Expected: the status line still says `Script ran. It can read:` but the cookie is gone from the end.

`HttpOnly` hides a cookie from page JavaScript, so this script could not steal it. But the script **still ran**. It could still read the page, change it, or send requests to the site as the signed-in user. HttpOnly limits the damage; output encoding removes the bug.

## What this fix does and does not guarantee

- Encode for the place the data lands. `escapeHtml` is right for HTML text and for attribute values inside quotes. It is **not** enough inside a `<script>` block, a `style`, an `onclick` value, or a URL such as `href="javascript:..."`. The simplest rule: never put visitor input in those places.
- In browser JavaScript, `element.textContent = name` is the safe equivalent of `escapeHtml`. `element.innerHTML = name` has the same bug as this lab's vulnerable mode (that version is called DOM-based XSS).
- Template systems and frameworks (React, Vue, Go's `html/template`) encode by default. Their escape hatches, such as `innerHTML`, `v-html` or `dangerouslySetInnerHTML`, switch that off.
- A **Content Security Policy** (CSP) header can tell the browser not to run inline scripts like `onerror="..."`. It is a strong second layer, but the encoding fix comes first.
- Blocking `<script>` or "bad words" is not a fix. Input 3 had no `<script>`, and there are many other ways to start JavaScript.
- Escaping is an HTML fix. It does nothing for SQL injection; parameter binding does that. Each kind of output needs its own encoding.
- This lab is intentionally vulnerable. It is not a production app pattern.

## Explain it without looking

1. Where exactly does visitor text become HTML source in the vulnerable branch?
2. Why does the image payload run JavaScript without a `<script>` tag?
3. What does the browser do differently with `<` and `&lt;`?
4. If the cookie is HttpOnly, what can injected JavaScript still do?

You are finished when you can answer those questions, show the before/after source boxes, and explain your own patch.

Sources: [OWASP XSS Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html), [PortSwigger: cross-site scripting](https://portswigger.net/web-security/cross-site-scripting), [MDN: textContent](https://developer.mozilla.org/en-US/docs/Web/API/Node/textContent).
