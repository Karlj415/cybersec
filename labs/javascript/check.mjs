// Checks your own practice files from the JavaScript lessons. From the course root:
//   node labs/javascript/check.mjs part1 ~/mine.mjs
//   node labs/javascript/check.mjs part2 ~/second.mjs
//   node labs/javascript/check.mjs part3 ~/js3/ports.mjs
// Each line says PASS or FAIL. A FAIL comes with a hint about what to change.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import vm from 'node:vm';

const results = [];
function check(ok, text, hint) {
  results.push({ ok: Boolean(ok), text, hint });
  return Boolean(ok);
}

// Run the file the same way `node file` would, and collect what it printed.
function run(file, args = []) {
  // NODE_TEST_CONTEXT is set when this checker itself runs inside a test, and
  // would stop the learner's own `node --test` from running.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [...args, file], { encoding: 'utf8', timeout: 10000, env });
  return { ok: result.status === 0, out: result.stdout ?? '', err: result.stderr ?? '' };
}

function firstError(err) {
  return err.split('\n').find(line => /^\w*Error\b/.test(line)) ?? err.trim().split('\n')[0] ?? 'unknown error';
}

function runs(file) {
  const result = run(file);
  check(result.ok, 'the file runs without an error',
    `Node stopped with: ${firstError(result.err)}. The line number is in the first line of the message. Fix that line, then run the checker again.`);
  return result;
}

function uses(source, pattern, word, hint) {
  check(pattern.test(source), `uses ${word}`, hint);
}

// Find a function in the learner's file. Files with import/export are modules,
// so they are imported; plain files run in a separate context with output hidden.
async function findFunction(file, source, name) {
  if (/^\s*(import|export)\b/m.test(source)) {
    const module = await import(pathToFileURL(file).href + '?checked=' + Date.now());
    return module[name];
  }
  const context = vm.createContext({ console: { log() {}, error() {} }, URLSearchParams, setTimeout });
  vm.runInContext(source, context, { filename: file, timeout: 5000 });
  return vm.runInContext(`typeof ${name} === 'function' ? ${name} : undefined`, context);
}

function checkPorts(fn, name, expected) {
  if (!check(typeof fn === 'function', `has a function called ${name}`,
    `No function called ${name} was found. Check the spelling (capital letters matter).`)) return;
  const ports = Object.keys(expected).map(Number);
  const actual = ports.map(port => fn(port));
  if (!check(!actual.every(value => value === undefined), `${name} returns a value`,
    `${name} returns undefined: use return to hand back true or false. console.log only prints it.`)) return;
  const wrong = ports.filter((port, i) => actual[i] !== expected[port]);
  check(!wrong.length, `${name} gives the right answers`,
    wrong.map(port => `${name}(${port}) gave ${JSON.stringify(actual[ports.indexOf(port)])} but should give ${expected[port]}.`).join(' '));
}

async function part1(file, source) {
  const { out } = runs(file);
  const lines = out.split('\n');
  check(lines.includes('Ready') && !lines.includes('Not yet'), 'prints Ready',
    'After adding 3 the counter should be 3, and counter >= 3 should then print Ready. Print the counter with console.log to see its value.');
  uses(source, /\bconst\s+\w+/, 'const', 'Make a const that holds your name, for example: const name = \'Sam\';');
  uses(source, /\blet\s+\w+\s*=\s*0\b/, 'a let starting at 0', 'Make the counter with let, starting at 0: let counter = 0;');
  uses(source, /\bif\s*\(/, 'if', 'Use if (counter >= 3) { ... } to make the decision.');
  uses(source, /\belse\b/, 'else', 'Add else { ... } so the program prints Not yet when the counter is below 3.');
  uses(source, />=\s*3/, '>= 3', 'The condition for "3 or more" is written counter >= 3.');
}

async function part2(file, source) {
  const { out } = runs(file);
  check(out.includes('Checking port 3389'), 'the loop reaches port 3389', 'Add 3389 to the end of the ports list: [22, 80, 443, 3389].');
  check(/\bstudent\b/.test(out), 'prints the new role', "Add role: 'student' to the user object, then console.log(user.role).");
  try {
    checkPorts(await findFunction(file, source, 'isWebPort'), 'isWebPort', { 80: true, 443: true, 22: false, 3389: false });
  } catch (error) {
    check(false, 'isWebPort can be loaded', `Loading the file failed: ${error.message}`);
  }
  check(out.includes('[ false, true, true, false ]'), 'prints ports.map(isWebPort)',
    'Add console.log(ports.map(isWebPort)); at the end. With 3389 added it prints [ false, true, true, false ].');
}

async function part3(file) {
  let module;
  try {
    module = await import(pathToFileURL(file).href + '?checked=' + Date.now());
  } catch (error) {
    check(false, 'the module loads', `Node stopped with: ${error.name}: ${error.message}. Fix that, then run the checker again.`);
    return;
  }
  check(true, 'the module loads');
  for (const name of ['isWebPort', 'isAdminPort']) {
    check(typeof module[name] === 'function', `exports ${name}`,
      `${name} is not exported. Write export in front of it: export function ${name}(port) { ... }`);
  }
  if (typeof module.isWebPort === 'function') checkPorts(module.isWebPort, 'isWebPort', { 80: true, 443: true, 22: false, 3389: false });
  if (typeof module.isAdminPort === 'function') checkPorts(module.isAdminPort, 'isAdminPort', { 22: true, 3389: true, 80: false, 443: false });
  const testFile = join(dirname(file), 'ports.test.mjs');
  if (!check(existsSync(testFile), 'has a test file next to it', `Make ${testFile} with at least one test for isAdminPort.`)) return;
  check(/isAdminPort/.test(readFileSync(testFile, 'utf8')), 'the tests check isAdminPort', 'Import isAdminPort in ports.test.mjs and add a test that checks it.');
  const result = run(testFile, ['--test', '--test-reporter=tap']);
  const count = word => Number((result.out.match(new RegExp(`^# ${word} (\\d+)`, 'm')) ?? [])[1] ?? 0);
  check(result.ok && count('pass') > 0 && count('fail') === 0, 'your tests pass',
    count('fail') ? `${count('fail')} test(s) failed. Run node --test ${testFile} and compare "expected" with "actual" in the output.`
      : `The tests did not run: ${firstError(result.err || result.out)}`);
}

const parts = { part1, part2, part3 };
const [part, given] = process.argv.slice(2);
if (!parts[part] || !given) {
  console.log('Usage: node labs/javascript/check.mjs part1|part2|part3 <your file>');
  process.exit(2);
}
const file = resolve(given);
if (!existsSync(file)) {
  console.log(`FAIL  ${file} does not exist. Check the path: ~/mine.mjs means mine.mjs in your home folder.`);
  process.exit(1);
}
await parts[part](file, readFileSync(file, 'utf8'));
for (const { ok, text, hint } of results) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok && hint) console.log(`      Hint: ${hint}`);
}
const failed = results.filter(result => !result.ok).length;
console.log(failed ? `\n${failed} check(s) failed. Fix one thing at a time and run the checker again.` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
