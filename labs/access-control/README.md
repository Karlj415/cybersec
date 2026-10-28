# Access control: IDOR and CSRF, find the missing check, add it, verify the fix

Allow 60-75 minutes. Prerequisites: the cookies and sessions lesson, the SQL injection lab and the XSS lab (this lab follows the same pattern). Use Node 24 LTS, or Node 22.13+ on the 22.x line. No npm packages or accounts are used.

## Start the app

Use the same VM as the SQL injection and XSS labs. Open Terminal **inside that VM**, change into the copied course folder, then run:

```sh
cd labs/access-control
node app.mjs
```

Expected output:

```text
CyberPath shop lab: http://127.0.0.1:8768
Pretend attacker page: http://127.0.0.1:8769 (Ctrl+C stops both)
```

One command starts two small web servers. Port **8768** is a fictional shop. Port **8769** plays the part of a different, malicious website. Both listen only on `127.0.0.1`, so nothing outside the VM can reach them. If you see `EADDRINUSE`, an earlier lab is still using one of those ports: stop it with Ctrl+C and try again.

Open **http://127.0.0.1:8768** in a browser **inside the same VM**. Keep the terminal running. All data lives in memory: stopping and restarting the app resets everything, including Alice's email.

## 1. Understand the intended rules

The shop has two fictional customers, Alice and Bob. Each has one invoice and a recovery email address (the address a "forgot password" link would go to).

| Invoice | Owner | Item |
| --- | --- | --- |
| 1041 | alice | Laptop stand |
| 1042 | bob | Noise-cancelling headphones |

The rules:

1. A customer may only see **their own** invoices.
2. Only the customer, using the shop's own settings page, may change their recovery email.

Sign-in is a button with no password. That is deliberate: this lab is about what the server checks **after** someone is signed in.

Press **Sign in as Alice**. Behind the scenes, the server creates a random session ID, remembers that it belongs to Alice, and sends it to your browser as a cookie:

```text
Set-Cookie: cp_shop_session=<32 random hex characters>; Path=/; HttpOnly; SameSite=Lax
```

From now on your browser attaches that cookie to every request it sends to `127.0.0.1`, and the server uses it to know "this is Alice". `HttpOnly` hides it from page JavaScript (you saw why that matters in the XSS lab). `SameSite=Lax` comes up in step 4.

## 2. IDOR: change one number

Click **Open invoice 1041 (vulnerable)**. Expected: Alice's laptop stand, owner `alice`. Look at the address bar: `/vulnerable/invoices/1041`.

Predict what happens if you change `1041` to `1042` and press Enter. Then try it.

Expected: **Bob's** invoice, with his item and shipping address, while you are signed in as Alice.

The vulnerable code in `app.mjs`:

```javascript
const invoice = Object.hasOwn(store.invoices, id) ? store.invoices[id] : null;
if (mode === 'vulnerable') {
  // Intentionally vulnerable: any signed-in user gets any invoice by number.
  return invoice;
}
```

The server checks that *someone* is signed in (sign out and try: you get "Not signed in"), but never checks *who*. The invoice number in the URL is a direct reference to a database record, and the server trusts it. That is an **IDOR**: insecure direct object reference. No special tools were needed; the attack is editing the address bar.

Now try `/fixed/invoices/1042`. Expected: **Invoice not found**, status 404. Then `/fixed/invoices/1041`: Alice's invoice still works.

The fixed code:

```javascript
if (mode === 'fixed') {
  // Patch: the server checks ownership against the session, not the URL.
  return invoice && invoice.owner === session.user ? invoice : null;
}
```

`session.user` comes from the server's own memory, looked up by the session cookie. Alice cannot change it by editing the URL. The URL says *which* invoice; the session says *who is asking*; the server compares the two.

Why 404 instead of 403 ("forbidden")? A 403 would confirm that invoice 1042 exists and belongs to someone else. "Not found" reveals nothing.

## 3. CSRF: a different website makes your browser act

Stay signed in as Alice. On the shop page, find **Recovery email**: `alice@example.invalid`.

First, use the shop normally: type a new address into the **fixed** form and press **Save (fixed)**. Expected: `Recovery email for Alice is now ...`. The shop's own form works.

Now open **http://127.0.0.1:8769** in a new tab. This page pretends to be an unrelated website offering a prize. Each button submits a hidden form **to the shop**, asking it to change the recovery email to `attacker@example.invalid`. In a real attack the form would submit itself the moment the page loads; here you press the button so you can watch each step.

Predict, then press **Claim prize (vulnerable target)**. Expected: `Recovery email for Alice is now attacker@example.invalid.` Go back to the shop tab and reload: the change is real. If this were a real shop, the attacker would now press "forgot password" and take over Alice's account.

What happened:

1. The attacker page told your browser: "send this form to `127.0.0.1:8768/vulnerable/email`".
2. Your browser sent it, and **automatically attached Alice's session cookie**, because the request was going to the shop.
3. The shop saw a valid session for Alice and did what the form asked.

The attacker never saw Alice's cookie or any shop page. They only needed the request to happen. That is **CSRF**: cross-site request forgery.

Press **Claim prize (fixed target)**. Expected: `Rejected: missing or wrong CSRF token. Nothing changed.` (status 403).

## How the token fix works

View the shop page's source (right-click, View Page Source) and find the fixed form:

```html
<input type="hidden" name="csrf" value="<32 random hex characters>">
```

When you signed in, the server also created a second random value, the **CSRF token**, stored it next to your session, and put it into the shop's own forms. The fixed handler refuses any change that doesn't send it back:

```javascript
} else if (mode === 'fixed') {
  // Patch: only the shop's own form contains this session's secret token.
  if (!sameToken(session.csrfToken, form.get('csrf'))) {
    return { status: 403, message: 'Rejected: missing or wrong CSRF token. Nothing changed.' };
  }
}
```

The attacker page cannot include the token, because browsers do not let one website read another website's pages (this rule is called the **same-origin policy**). The cookie travels automatically; the token does not. `sameToken` uses `timingSafeEqual`, which takes the same time whether the first or the last character is wrong, so an attacker cannot guess the token one character at a time by measuring response speed.

## 4. SameSite: why the browser sent the cookie at all

Browsers group addresses into **sites**. For a normal domain, the site is the main name: `shop.example.com` and `evil.example.com` are the same site, `example.com` and `example.net` are different sites. Port numbers do not count. That means the attacker page at `127.0.0.1:8769` is the **same site** as the shop at `127.0.0.1:8768`, which is why `SameSite=Lax` did not stop step 3.

Now open the attacker page by a different name: **http://localhost:8769**. `localhost` and `127.0.0.1` reach the same computer, but the browser treats them as **different sites**. Press **Claim prize (vulnerable target)** again.

Expected: **Not signed in. The request arrived without a valid session cookie. Nothing changed.** Even the vulnerable endpoint is safe here, because `SameSite=Lax` told the browser: do not attach this cookie to a form POST that another site started. Reload the shop: Alice is still signed in and the email did not change.

So SameSite is a strong second layer, but it is not the whole fix:

- It does nothing against attackers on the **same site**: another app on a sibling subdomain, or (as here) another port on the same host.
- `Lax` still sends the cookie when another site links to a page with a plain GET request. **Never change data with a GET request**, or Lax will not protect it.
- Older browsers and some embedded browsers ignore it.

The CSRF token works in all those cases. Use both.

## 5. Apply the fixes yourself and verify with tests

Before editing, run this from the `labs/access-control` folder in a second terminal:

```sh
node --test app.test.mjs
```

Expected: `# pass 6` and `# fail 0`.

Now patch both vulnerable branches in `app.mjs`:

- In `findInvoice`, make the `vulnerable` branch return the invoice only when `invoice.owner === session.user`.
- In `changeEmail`, make the `vulnerable` branch reject requests whose `csrf` value doesn't match `session.csrfToken` (copy the `sameToken` check from the fixed branch).
- Add a hidden `csrf` input to the vulnerable form in `homePage`, copying the fixed form, so Alice can still use it.

Restart the app (Ctrl+C, then `node app.mjs`; Alice will need to sign in again), and repeat steps 2 and 3 using only the vulnerable links and buttons. Both attacks should now fail, and the shop's own vulnerable form should still save.

Rerun the tests. **Exactly two tests should fail**: the IDOR test and the CSRF test. They described the old bugs. Change their vulnerable-mode assertions to require the safe result (`null` for Bob's invoice, status 403 for the forged form), and rerun until all 6 pass. Keep the attacks in the tests as regression tests.

## What these fixes do and do not guarantee

- Ownership checks belong on the **server**, on every request that reads or changes a record. Hiding the link, disabling a button, or checking in browser JavaScript does not count: the attacker edits the request directly.
- Random-looking IDs (UUIDs) make guessing harder but are not a permission check. IDs leak through shared links, logs and screenshots.
- Real apps have more rules than "owner only": roles (staff, admin), shared records, deleted accounts. Put every check in one place so new pages cannot forget it.
- CSRF tokens protect cookie-based sessions. An API that only accepts a token in an `Authorization` header is not exposed the same way, because browsers do not attach that header automatically.
- An XSS bug defeats CSRF tokens: injected script runs **on** the shop's own page, so it can read the token and send it. Fix XSS first.
- This lab is intentionally vulnerable and has no passwords. It is not a production login pattern.

## Explain it without looking

1. In the IDOR attack, what did the server check, and what did it forget to check?
2. Where does `session.user` come from, and why can't Alice change it from the address bar?
3. In the CSRF attack, which part did the browser add automatically, and which part could the attacker page not add?
4. Why did SameSite block the attack from `localhost:8769` but not from `127.0.0.1:8769`?

You are finished when you can answer those questions, show the before/after results for both attacks, and explain your own patches.

Sources: [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html), [PortSwigger: IDOR](https://portswigger.net/web-security/access-control/idor), [PortSwigger: CSRF](https://portswigger.net/web-security/csrf), [MDN: SameSite cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies#controlling_third-party_cookies_with_samesite).
