import { DatabaseSync } from 'node:sqlite';

function lookup(db, name) {
  const sql = 'SELECT name FROM products WHERE name = ?';
  return db.prepare(sql).all(name).map(row => row.name);
}

const params = new URLSearchParams('name=Notebook');
const name = params.get('name') ?? '';
console.log({ name, type: typeof name });

const db = new DatabaseSync(':memory:');
try {
  db.exec('CREATE TABLE products (name TEXT)');
  db.prepare('INSERT INTO products VALUES (?)').run('Notebook');
  console.log(lookup(db, name));
} finally {
  db.close();
}
