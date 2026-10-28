import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const run = file => execFileSync(process.execPath, [fileURLToPath(new URL(file, import.meta.url))], { encoding: 'utf8' });

test('part 1 prints the output the lesson promises', () => {
  assert.equal(run('./first-steps.mjs'), [
    'Hello, Sam', 'string number', 'Score is now 3', 'Normal user: limited access', '51', '6', 'Sam has 3 points', '',
  ].join('\n'));
});

test('part 2 prints the output the lesson promises', () => {
  assert.equal(run('./second-steps.mjs'), [
    'Hi Ana', '8', '22 3', "[ 'port 22', 'port 80', 'port 443' ]",
    'Checking port 22', 'Checking port 80', 'Checking port 443',
    'Ana false', 'Paris', 'not given', '9 a-b', '',
  ].join('\n'));
});
