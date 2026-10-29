import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('./check.mjs', import.meta.url));
const solutions = fileURLToPath(new URL('./solutions/', import.meta.url));
const solution = name => readFileSync(join(solutions, name), 'utf8');

// Copies the reference answers to a scratch folder, applies `edit`, and runs the checker on the copy.
function checkCopy(t, part, name, edit = source => source) {
  const dir = mkdtempSync(join(tmpdir(), 'cyberpath-check-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(solutions, dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, edit(readFileSync(file, 'utf8')));
  const result = spawnSync(process.execPath, [checker, part, file], { encoding: 'utf8' });
  return { code: result.status, out: result.stdout };
}

test('the reference answers pass every check', t => {
  for (const [part, name] of [['part1', 'mine.mjs'], ['part2', 'second.mjs'], ['part3', 'js3/ports.mjs']]) {
    const { code, out } = checkCopy(t, part, name);
    assert.equal(code, 0, out);
    assert.match(out, /All checks passed/);
    assert.doesNotMatch(out, /FAIL/);
  }
});

test('part 1: a typo and a wrong count get specific hints', t => {
  const typo = checkCopy(t, 'part1', 'mine.mjs', s => s.replace("console.log('Ready');", "console.log('Ready';"));
  assert.equal(typo.code, 1);
  assert.match(typo.out, /FAIL {2}the file runs without an error\n {6}Hint: Node stopped with: SyntaxError/);
  const short = checkCopy(t, 'part1', 'mine.mjs', s => s.replace('counter + 3', 'counter + 2'));
  assert.match(short.out, /FAIL {2}prints Ready/);
  const noElse = checkCopy(t, 'part1', 'mine.mjs', s => s.replace(/ else \{\n.*\n\}/, ''));
  assert.match(noElse.out, /FAIL {2}uses else/);
});

test('part 2: printing instead of returning, and a wrong answer, are explained', t => {
  const prints = checkCopy(t, 'part2', 'second.mjs', s => s.replace('return port === 80 || port === 443;', 'console.log(port === 80 || port === 443);'));
  assert.match(prints.out, /FAIL {2}isWebPort returns a value\n {6}Hint: isWebPort returns undefined: use return/);
  const wrong = checkCopy(t, 'part2', 'second.mjs', s => s.replace('port === 80 || port === 443', 'port === 80'));
  assert.match(wrong.out, /isWebPort\(443\) gave false but should give true/);
  const missing = checkCopy(t, 'part2', 'second.mjs', s => s.replace('[22, 80, 443, 3389]', '[22, 80, 443]'));
  assert.match(missing.out, /FAIL {2}the loop reaches port 3389/);
  // A module-style file (with export) is imported instead of run in a sandbox.
  const exported = checkCopy(t, 'part2', 'second.mjs', s => s.replace('function isWebPort', 'export function isWebPort'));
  assert.equal(exported.code, 0, exported.out);
});

test('part 3: a missing export and a failing test are explained', t => {
  const unexported = checkCopy(t, 'part3', 'js3/ports.mjs', s => s.replace('export function isAdminPort', 'function isAdminPort'));
  assert.match(unexported.out, /FAIL {2}exports isAdminPort\n {6}Hint: isAdminPort is not exported/);
  const failing = checkCopy(t, 'part3', 'js3/ports.test.mjs', s => s.replace('[true, true, false, false]', '[true, true, true, false]'));
  assert.match(failing.out, /FAIL {2}your tests pass\n {6}Hint: 1 test\(s\) failed/);
  const broken = checkCopy(t, 'part3', 'js3/ports.mjs', s => s.replace('port === 22 ||', 'port === 22 |||'));
  assert.match(broken.out, /FAIL {2}the module loads\n {6}Hint: Node stopped with: SyntaxError/);
});

test('a path that does not exist says so', () => {
  const result = spawnSync(process.execPath, [checker, 'part1', join(tmpdir(), 'no-such-file.mjs')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /does not exist/);
});
