// Lesson: JavaScript from zero, part 1. Run: node labs/javascript/first-steps.mjs
const name = 'Sam';
let score = 2;
console.log('Hello, ' + name);
console.log(typeof name, typeof score);

score = score + 1;
console.log('Score is now', score);

const isAdmin = false;
if (isAdmin) {
  console.log('Welcome, admin');
} else {
  console.log('Normal user: limited access');
}

console.log('5' + 1);
console.log(5 + 1);
console.log(`${name} has ${score} points`);
