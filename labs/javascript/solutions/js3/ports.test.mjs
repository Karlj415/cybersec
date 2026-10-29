import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAdminPort, isWebPort } from './ports.mjs';

test('80 and 443 are web ports', () => {
  assert.equal(isWebPort(80), true);
  assert.equal(isWebPort(443), true);
});

test('22 and 3389 are remote-admin ports, web ports are not', () => {
  assert.deepEqual([22, 3389, 80, 443].map(isAdminPort), [true, true, false, false]);
});
