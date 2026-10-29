// Part 2, steps 2 and 3: one possible answer. Check yours with:
//   node labs/javascript/check.mjs part2 ~/second.mjs
function greet(person) {
  return 'Hi ' + person;
}
console.log(greet('Ana'));

const double = n => n * 2;
console.log(double(4));

const ports = [22, 80, 443, 3389];
console.log(ports[0], ports.length);
console.log(ports.map(port => 'port ' + port));

for (const port of ports) {
  console.log('Checking port', port);
}

const user = { name: 'Ana', admin: false, role: 'student' };
console.log(user.name, user.admin);
console.log(user.role);

console.log(ports.length > 2, user.admin === true);

function isWebPort(port) {
  return port === 80 || port === 443;
}
console.log(ports.map(isWebPort));
