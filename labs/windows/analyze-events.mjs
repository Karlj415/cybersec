// Portable companion for the synthetic training CSV; not a live log collector.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const provider = 'Microsoft-Windows-Security-Auditing';

export function parseTrainingCsv(text) {
  // The supplied fixture uses unquoted fields only. Reject unsupported CSV
  // instead of silently splitting a quoted comma or multiline field incorrectly.
  if (text.includes('"')) throw new Error('This training parser requires unquoted CSV fields');
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  for (const required of ['Record', 'TimeUtc', 'Host', 'Provider', 'EventId', 'LogonId', 'Process']) {
    if (!headers.includes(required)) throw new Error(`Missing column: ${required}`);
  }
  return lines.map(line => {
    const fields = line.split(',');
    if (fields.length !== headers.length) throw new Error('CSV row has the wrong field count');
    const event = Object.fromEntries(headers.map((header, i) => [header, fields[i]]));
    if (!/^\d+$/.test(event.EventId)) throw new Error('EventId must contain decimal digits');
    return event;
  });
}

export function loadEvents(path = new URL('./events.csv', import.meta.url)) {
  return parseTrainingCsv(readFileSync(path, 'utf8'));
}

export function successfulLogons(events) {
  return events.filter(event => event.Provider === provider && Number(event.EventId) === 4624);
}

export function sessionProcesses(events, host, logonId) {
  return events.filter(event =>
    event.Provider === provider && Number(event.EventId) === 4688 &&
    event.Host === host && event.LogonId === logonId
  ).sort((a, b) => a.TimeUtc.localeCompare(b.TimeUtc));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const events = loadEvents();
  console.log('Synthetic training data, not live Windows telemetry.');
  console.log('Wrong substring matches:', events.filter(event => event.EventId.includes('4624')).map(event => event.Record));
  console.log('Correct logons:', successfulLogons(events).map(event => event.Record));
  console.log('LAB-WIN session processes:', sessionProcesses(events, 'LAB-WIN', '0x42'));
}
