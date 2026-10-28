import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEvents, parseTrainingCsv, successfulLogons, sessionProcesses } from './analyze-events.mjs';

test('exact event ID rejects the substring lookalike', () => {
  const events = loadEvents();
  assert.deepEqual(events.filter(event => event.EventId.includes('4624')).map(event => event.Record), ['3', '4', '7']);
  assert.deepEqual(successfulLogons(events).map(event => event.Record), ['3', '4']);
});

test('an event ID alone does not replace provider verification', () => {
  const fake = { ...loadEvents()[0], EventId: '4624', Provider: 'Different-Provider' };
  assert.deepEqual(successfulLogons([fake]), []);
});

test('host scopes session correlation', () => {
  const events = loadEvents();
  const processes = sessionProcesses(events, 'LAB-WIN', '0x42');
  assert.deepEqual(processes.map(event => event.Record), ['5']);
  assert.equal(processes[0].Process, 'powershell.exe');
  assert.deepEqual(sessionProcesses(events, 'LAB-OTHER', '0x42'), []);
  assert.equal(sessionProcesses(events, 'LAB-WIN', '0x99')[0].Record, '6');
});

test('training parser rejects unsupported CSV and malformed IDs', () => {
  assert.throws(() => parseTrainingCsv('Record,EventId\n1,"4624"'), /unquoted/);
  assert.throws(() => parseTrainingCsv('Record,EventId\n1,4624'), /Missing column/);
  const headers = 'Record,TimeUtc,Host,Provider,EventId,LogonId,Process';
  assert.throws(() => parseTrainingCsv(headers + '\n1,now,host,provider,wrong,0x42,app'), /decimal digits/);
  assert.throws(() => parseTrainingCsv(headers + '\n1,too,few'), /field count/);
});
