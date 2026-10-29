// Lesson: JavaScript from zero, part 2. Run: node labs/javascript/second-steps.mjs
function greet(person) {
  return 'Hi ' + person;
}
console.log(greet('Ana'));

const double = n => n * 2;
console.log(double(4));

const ports = [22, 80, 443];
console.log(ports[0], ports.length);
console.log(ports.map(port => 'port ' + port));

for (const port of ports) {
  console.log('Checking port', port);
}

const user = { name: 'Ana', admin: false };
console.log(user.name, user.admin);

console.log(ports.length > 2, user.admin === true);
