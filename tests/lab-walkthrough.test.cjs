// Follows each web lab's README in a scratch copy: apply the fix the README
// describes, check that exactly the tests it names now fail, then apply the
// README's own replacement tests and check that everything passes. This keeps
// the counts and test edits the READMEs promise in line with the real files.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const labs=path.join(__dirname,'../labs');

function replaceOnce(text,from,to){
 assert.equal(text.split(from).length,2,`expected exactly one ${JSON.stringify(from.slice(0,60))}`);
 return text.replace(from,()=>to);
}
// The learner's patch, as each README describes it in words.
const fixes={
 'sql-injection':source=>replaceOnce(source,
  `query = "SELECT name FROM products WHERE public = 1 AND name = '" + name + "'";\n    parameters = [];`,
  `query = 'SELECT name FROM products WHERE public = 1 AND name = ?';\n    parameters = [name];`),
 xss:source=>replaceOnce(source,
  `// Intentionally vulnerable: input becomes part of the HTML source.\n    return '<p id="greeting">Hello, ' + name + '!</p>';`,
  `return '<p id="greeting">Hello, ' + escapeHtml(name) + '!</p>';`),
 'access-control':source=>{
  source=replaceOnce(source,`// Intentionally vulnerable: any signed-in user gets any invoice by number.\n    return invoice;`,`return invoice && invoice.owner === session.user ? invoice : null;`);
  source=replaceOnce(source,`// Intentionally vulnerable: the session cookie alone is trusted.\n  } else if`,
   `if (!sameToken(session.csrfToken, form.get('csrf'))) {\n      return { status: 403, message: 'Rejected: missing or wrong CSRF token. Nothing changed.' };\n    }\n  } else if`);
  return replaceOnce(source,`<form method="post" action="/vulnerable/email"><label>`,`<form method="post" action="/vulnerable/email"><input type="hidden" name="csrf" value="\${session.csrfToken}"><label>`);
 },
};

function runTests(dir){
 const env={...process.env};delete env.NODE_TEST_CONTEXT;
 const result=spawnSync(process.execPath,['--test','--test-reporter=tap','app.test.mjs'],{cwd:dir,encoding:'utf8',env});
 const names=pattern=>[...result.stdout.matchAll(pattern)].map(m=>m[1]);
 return {passed:names(/^ok \d+ - (.+)$/gm),failed:names(/^not ok \d+ - (.+)$/gm)};
}
// Apply the README's "Compare your edited tests" blocks. `// Replaces: name`
// swaps a whole test; `// In the test 'name', change ... // to ...` swaps one line.
function applyReadmeTests(readme,tests){
 const section=readme.split('### Compare your edited tests')[1];
 assert.ok(section,'README has a "Compare your edited tests" section');
 const blocks=[...section.split(/\n## /)[0].matchAll(/```javascript\n([\s\S]*?)```/g)].map(m=>m[1]);
 assert.ok(blocks.length>0);
 const find=name=>{
  const start=tests.search(new RegExp(`^test\\((['"])${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\1`,'m'));
  assert.ok(start>=0,`app.test.mjs has a test named ${name}`);
  return [start,tests.indexOf('\n});\n',start)+'\n});\n'.length];
 };
 for(const block of blocks){
  const whole=block.match(/^\/\/ Replaces: (.+)\n/);
  const line=block.match(/^\/\/ In the test '(.+)', change\n(.+)\n\/\/ to\n(.+)\n$/);
  assert.ok(whole||line,'block format: '+block.split('\n')[0]);
  const [start,end]=find(whole?whole[1]:line[1]);
  const replacement=whole?block.slice(whole[0].length):replaceOnce(tests.slice(start,end),line[2],line[3]);
  tests=tests.slice(0,start)+replacement+tests.slice(end);
 }
 return tests;
}
const quoted=text=>[...text.matchAll(/`([^`]+)`/g)].map(m=>m[1]);

for(const lab of Object.keys(fixes)){
 test(`${lab}: the README's fix, failing tests and replacement tests match reality`,t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`cyberpath-${lab}-`));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.cpSync(path.join(labs,lab),dir,{recursive:true});
  const readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');
  const before=runTests(dir);
  assert.deepEqual(before.failed,[]);
  assert.match(readme,new RegExp(`\`# pass ${before.passed.length}\``),'README states the starting pass count');

  fs.writeFileSync(path.join(dir,'app.mjs'),fixes[lab](fs.readFileSync(path.join(dir,'app.mjs'),'utf8')));
  const patched=runTests(dir);
  const claim=readme.match(/\*\*Exactly (\w+) tests? should fail:\*\* ([^\n]*)/);
  assert.ok(claim,'README says which tests fail after the patch');
  const words={one:1,two:2,three:3,four:4};
  assert.equal(patched.failed.length,words[claim[1]],`failing after the patch: ${patched.failed.join(' | ')}`);
  for(const name of patched.failed)assert.ok(quoted(claim[2]).includes(name),`README names the failing test "${name}"`);

  fs.writeFileSync(path.join(dir,'app.test.mjs'),applyReadmeTests(readme,fs.readFileSync(path.join(dir,'app.test.mjs'),'utf8')));
  const updated=runTests(dir);
  assert.deepEqual(updated.failed,[]);
  assert.match(readme,new RegExp(`all ${updated.passed.length} pass`),'README states the final pass count');
 });
}
