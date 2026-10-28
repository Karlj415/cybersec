import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const source = readFileSync(new URL('./bridge.mjs', import.meta.url), 'utf8');
function run(code) {
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: code, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('the prerequisite example returns a matching row and reports a string', () => {
  const output = run(source);
  assert.match(output, /name: 'Notebook', type: 'string'/);
  assert.match(output, /\[ 'Notebook' \]/);
});

test('the documented Missing and unbound-parameter experiments return no rows', () => {
  assert.match(run(source.replace("new URLSearchParams('name=Notebook')", "new URLSearchParams('name=Missing')")), /\[\]/);
  assert.match(run(source.replace('.all(name)', '.all()')), /\[\]/);
});
