const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,writeFile,mkdir,symlink,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {once}=require('node:events');

test('local server serves course/lab content with HEAD support and confines file access',async t=>{
 const {createStaticServer}=await import('../scripts/serve.mjs');
 const directory=await mkdtemp(path.join(tmpdir(),'cyberpath-server-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const root=path.join(directory,'public');await mkdir(root);
 await writeFile(path.join(root,'index.html'),'<h1>local practice</h1>');
 await writeFile(path.join(root,'notes.txt'),'training note');
 await writeFile(path.join(directory,'secret.txt'),'outside root');
 await writeFile(path.join(root,'.secret'),'hidden');
 const server=createStaticServer(root);server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
 const base=`http://127.0.0.1:${server.address().port}`;
 const index=await fetch(base);assert.match(index.headers.get('content-type'),/^text\/html/);
 assert.equal(await index.text(),'<h1>local practice</h1>');
 const head=await fetch(base+'/notes.txt',{method:'HEAD'});assert.equal(head.status,200);
 assert.equal(head.headers.get('content-length'),'13');assert.equal(await head.text(),'');
 assert.equal(await(await fetch(base+'/notes.txt?name=student')).text(),'training note');
 assert.equal((await fetch(base+'/missing')).status,404);
 assert.equal((await fetch(base+'/.secret')).status,403);
 assert.equal((await fetch(base+'/%2e%2e%2fsecret.txt')).status,403);
 assert.equal((await fetch(base+'/%ZZ')).status,400);
 assert.equal((await fetch(base,{method:'POST'})).status,405);
 try{await symlink(path.join(directory,'secret.txt'),path.join(root,'link.txt'))}
 catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;return}
 assert.equal((await fetch(base+'/link.txt')).status,403);
 await symlink(path.join(root,'.secret'),path.join(root,'hidden-link.txt'));
 assert.equal((await fetch(base+'/hidden-link.txt')).status,403);
});
