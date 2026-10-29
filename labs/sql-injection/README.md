# SQL injection: follow the input, change the code, verify the fix

Allow 60–90 minutes. Prerequisites: the earlier HTML, SQL and requests/API lessons, followed by “Read the JavaScript before the SQL lab”. Use Node 24 LTS, or Node 22.13+ on the 22.x line, with its built-in node:sqlite module. No npm packages or real accounts are used.

## Use a VM you already have

Use the Ubuntu VM from the Linux phase (VirtualBox, UTM or Parallels). Kali can also run this JavaScript lab directly; a second VM is unnecessary. This lab has no CPU-specific binaries, so the source works on ARM and Intel when the required Node version is available.

Copy the `cybersec` folder into the VM using your existing shared folder or file transfer. Open Terminal **inside that VM**, change into the copied folder, then run:

```sh
cd labs/sql-injection
node --version
node -e "require('node:sqlite')"
node app.mjs
```

Open **http://127.0.0.1:8766** in a browser **inside the same VM**. `localhost` means the machine running the browser. A Mac browser's localhost is the Mac, not Ubuntu. Keep the terminal running; Ctrl+C stops the app. If the port is occupied, stop the earlier lab process first. Every search starts with a fresh in-memory database, so no database files or reset commands are needed.

Install a suitable Node version using the [official Node download guidance](https://nodejs.org/en/download) for your guest architecture. Do not assume an older distribution package includes node:sqlite. If the import fails, check the version first. Node 22 may print an ExperimentalWarning for SQLite; the module still runs and the tests check actual behavior.

### Optional: use Kali and the app VM together

The required lab stays in one VM. If both VMs have SSH connectivity on a private lab network, run this **in Kali**, replacing `student` and `APP_VM_PRIVATE_IP` with your own app VM's login and reachable private address:

```sh
ssh -N -L 8766:127.0.0.1:8766 student@APP_VM_PRIVATE_IP
```

Leave that terminal open. Open http://127.0.0.1:8766 in Kali's browser or Burp's built-in browser. SSH forwards Kali's loopback port to the app VM's loopback port. This requires an SSH server on the app VM, permission to log in, and no existing Kali listener on 8766. A connection failure is a networking/SSH setup issue, not an SQL result. Stop the tunnel with Ctrl+C.

Parallels and UTM network labels differ and their private networks may not connect to each other. Use the single-VM route unless you have verified that connectivity. Do not change the app to listen on `0.0.0.0`, expose it through port forwarding to the internet, or disable your firewall to get this lesson working.

## 1. Understand the intended feature

The fictional products table contains:

| name | public |
| --- | --- |
| Notebook | 1 |
| O'Reilly Guide | 1 |
| Unreleased prototype | 0 |

A visitor should find a product only when **both** conditions hold: it is public and its name exactly matches the requested name. The draft is seeded teaching data, not a real secret. This example intentionally omits login so the SQL mechanism is easier to inspect.

Open `app.mjs`. Trace these steps: the form sends a GET request; `url.searchParams.get` decodes the `name` parameter; the handler passes that string into `search`; SQLite evaluates the query; JavaScript serializes the result object as JSON. URL encoding transports the string. It does not make that string safe for SQL.

## 2. Predict, then run the vulnerable version

Select `vulnerable`. Search for `Notebook` and inspect the JSON response:

```sql
SELECT name FROM products WHERE public = 1 AND name = 'Notebook'
```

Expected: one row, `Notebook`. Search for `Unreleased prototype`: expected no rows, because its `public` value is 0.

Now predict what happens with `O'Reilly Guide`. The JavaScript concatenation below inserts its apostrophe directly into the SQL source:

```javascript
query = "SELECT name FROM products WHERE public = 1 AND name = '" + name + "'";
parameters = [];
const rows = db.prepare(query).all(...parameters).map(row => row.name);
```

The opening SQL quote starts a string, but the quote after `O` ends it prematurely. The remaining text is parsed as SQL rather than part of the name, producing a syntax error. An ordinary user's valid data already breaks this implementation.

Try this exact input, including the trailing space:

```text
' OR 1=1 -- 
```

The generated query is:

```sql
SELECT name FROM products WHERE public = 1 AND name = '' OR 1=1 -- '
```

Explain each piece before moving on:

- The first apostrophe closes the string opened by the application. `name = ''` is now a comparison against an empty string.
- `OR 1=1` adds a condition that is always true.
- SQL evaluates `AND` before `OR`, so the filter means `(public = 1 AND name = '') OR true`. Even private rows satisfy it.
- `--` begins an SQL line comment, so the application's final quote is ignored.

Expected: all three products, including `Unreleased prototype`. This is a confidentiality failure: the application intended to enforce a visibility rule, but let the caller rewrite its SQL expression. There is no password guessing or special scanner involved.

## 3. Apply the fix and explain the JavaScript

The fixed implementation uses:

```javascript
query = 'SELECT name FROM products WHERE public = 1 AND name = ?';
parameters = [name];
const rows = db.prepare(query).all(...parameters).map(row => row.name);
```

`?` is a SQL value placeholder. `[name]` is a JavaScript array with one item; `...parameters` spreads its items into the method call. `prepare` compiles the fixed SQL structure, and `all` binds the supplied name as a value. `.map(row => row.name)` extracts the name property from each returned row object. SQLite does not reinterpret the bound value's quotes, `OR`, or comment marker as query structure.

Select `fixed` and repeat the same requests:

| Input | Vulnerable | Fixed |
| --- | --- | --- |
| Notebook | Notebook | Notebook |
| Unreleased prototype | No rows | No rows |
| O'Reilly Guide | SQL error | O'Reilly Guide |
| `' OR 1=1 -- ` | All three rows | No rows |

The fixed attack result is empty because no product literally has that entire name. The response shows `query` and `parameters` separately. It is a teaching display of the arguments supplied to SQLite, not a claim that SQLite receives a second concatenated SQL string.

Now make the repair yourself: in the `vulnerable` branch of `search`, replace its concatenated `query` and empty `parameters` with the two fixed assignments. Restart the server and repeat the tests with `vulnerable` selected. Both branches should now behave safely. Keep notes or a copy of the original to compare. No changes to the request parser, firewall, or browser were needed: you repaired the boundary where data became SQL instructions.

## 4. Verify and interpret failures

Before editing, run in another terminal from this directory:

```sh
node --test app.test.mjs
```

Expected: `# pass 5` and `# fail 0`. The tests demonstrate the original failure, the fixed behavior, legitimate apostrophes, and real HTTP requests. After repairing the intentionally vulnerable branch, **Exactly three tests should fail:** `injection leaks a draft only when input changes SQL source`, `parameter binding preserves a legitimate apostrophe` and `HTTP preserves defaults, input encoding, JSON isolation and request validation` (its loop also expects `vulnerable` mode to leak the draft). Update the injection and HTTP tests to require no leaked draft from either branch; change the apostrophe test to require a successful match in both branches. Rerun until all 5 pass. This turns the reproduction into a regression test for your patch. Do not merely delete the failing assertion.

Also test an empty name and a nonexistent name. Both should return no rows without an error in the fixed implementation.

### Compare your edited tests

Try the edit yourself first. Then compare with the blocks below: yours can look different and still be right, as long as each test now requires the safe result from **both** modes and still contains the attack. A block that starts with `// Replaces:` is a whole new test that takes the place of the test named there. A block that starts with `// In the test` changes one line inside that test.

```javascript
// Replaces: injection leaks a draft only when input changes SQL source
test('injection leaks nothing in either mode', () => {
  withDatabase(db => {
    const attack = "' OR 1=1 -- ";
    for (const mode of ['vulnerable', 'fixed']) {
      const result = search(db, attack, mode);
      assert.deepEqual(result.rows, []);
      assert.deepEqual(result.parameters, [attack]);
      assert.ok(!result.query.includes(attack));
      assert.equal(result.error, null);
    }
  });
});
```

```javascript
// Replaces: parameter binding preserves a legitimate apostrophe
test('both modes match a legitimate apostrophe', () => {
  withDatabase(db => {
    for (const mode of ['vulnerable', 'fixed']) {
      const result = search(db, "O'Reilly Guide", mode);
      assert.deepEqual(result.rows, ["O'Reilly Guide"]);
      assert.equal(result.error, null);
    }
  });
});
```

```javascript
// In the test 'HTTP preserves defaults, input encoding, JSON isolation and request validation', change
    assert.equal(result.rows.includes('Unreleased prototype'), mode === 'vulnerable');
// to
    assert.equal(result.rows.includes('Unreleased prototype'), false);
```

The HTTP test is `async`: `await fetch(...)` waits for each reply before the next line runs. Part 3 of the JavaScript lessons covers `await`, `assert` and `node --test`.

## What this fix does and does not guarantee

- Parameters protect **values** in this query. Dynamic table names, column names, or sort directions need a separate allowlist/design; a value placeholder is not an arbitrary SQL-fragment placeholder.
- HTML escaping is for an HTML context, not a SQL fix. URL encoding is transport encoding. A firewall cannot repair this concatenation. Blocking apostrophes breaks names and leaves the fundamental mistake in place.
- The `public = 1` predicate is still necessary. Parameter binding prevents its rewrite; it does not invent missing authorization rules or make deliberately public data private.
- The JSON output and `nosniff` header keep the teaching response separate from HTML parsing. They do not fix SQL injection. This lab is not a production service and its query/error disclosure is intentional for learning.

## Explain it without looking

1. Where exactly does user data become SQL source in the vulnerable branch?
2. Why does the attack match a row whose `public` value is 0?
3. Why can the same apostrophe be valid data with a placeholder but change parsing with concatenation?
4. If we remove `public = 1` from the fixed query, does parameter binding still hide drafts? Why?

You are finished when you can answer those questions, show before/after requests, and explain your own patch. Merely reproducing the payload is not the goal.

Sources: [Node SQLite prepared statements](https://nodejs.org/docs/latest-v22.x/api/sqlite.html), [SQLite expressions and operator precedence](https://www.sqlite.org/lang_expr.html), [SQLite comments](https://www.sqlite.org/lang_comment.html).
