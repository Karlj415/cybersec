// Lesson: JavaScript from zero, part 3. Run: node labs/javascript/third-steps.mjs
import { createServer } from 'node:http';
import { once } from 'node:events';
import { isWebPort } from './ports.mjs';

// 1. A module: isWebPort lives in ports.mjs and is imported above.
console.log(isWebPort(443), isWebPort(22));

// 2. JSON: turn an object into text, and the text back into an object.
const user = { name: 'Ana', admin: false, ports: [22, 443] };
const text = JSON.stringify(user);
console.log(text);
const copy = JSON.parse(text);
console.log(copy.name, copy.ports.length);

// 3. An error, caught: try runs the code, catch receives the error.
try {
  JSON.parse('{ name: Ana }');
} catch (error) {
  console.log('Caught a', error.name);
}

// 4. await: wait for an answer that takes time, like a web request.
const server = createServer((request, response) => {
  response.end(JSON.stringify({ ok: true }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
console.log('Server said', await response.json());
server.close();
