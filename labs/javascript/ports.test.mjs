// Lesson: JavaScript from zero, part 3. Run: node --test labs/javascript/ports.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWebPort } from './ports.mjs';

test('80 and 443 are web ports', () => {
  assert.equal(isWebPort(80), true);
  assert.equal(isWebPort(443), true);
});

test('other ports are not web ports', () => {
  assert.deepEqual([22, 3389].map(isWebPort), [false, false]);
});
