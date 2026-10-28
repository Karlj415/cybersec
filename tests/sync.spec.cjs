// Cross-browser sync against a fake GitHub Gist API. Two browser contexts stand in for two VMs.
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const {once}=require('node:events');

const PASS='correct horse battery staple';
const TOKEN='github_pat_test_token';
const GIST='abc123';
let server,base,configJS;

test.beforeAll(async()=>{
 const {createStaticServer}=await import('../scripts/serve.mjs');
 const {encryptConfig,configScript}=await import('../scripts/setup-sync.mjs');
 configJS=configScript(await encryptConfig({token:TOKEN,gist:GIST},PASS,1000));
 server=createStaticServer(path.join(__dirname,'..'));server.listen(0,'127.0.0.1');await once(server,'listening');
 base=`http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(()=>new Promise(resolve=>server.close(resolve)));

// One shared in-memory gist, like the real one every VM talks to.
function fakeGitHub(){
 const gist={file:JSON.stringify({version:1,rev:'init',data:{done:[],labs:{},quiz:{},answers:{},last:null}})};
 const seenTokens=new Set();
 gist.status=200;
 gist.data=()=>JSON.parse(gist.file).data;
 gist.attach=async context=>{
  await context.route('https://**/*',route=>route.abort());
  await context.route(/\/sync-config\.js$/,route=>route.fulfill({contentType:'text/javascript',body:configJS}));
  await context.route('https://api.github.com/gists/'+GIST,async route=>{
   const request=route.request();
   seenTokens.add(request.headers().authorization);
   if(gist.status!==200)return route.fulfill({status:gist.status,body:'{}'});
   if(request.method()==='PATCH')gist.file=JSON.parse(request.postData()).files['cyberpath-progress.json'].content;
   await route.fulfill({contentType:'application/json',body:JSON.stringify({id:GIST,files:{'cyberpath-progress.json':{content:gist.file}}})});
  });
 };
 gist.tokens=seenTokens;
 return gist;
}
async function vm(browser,gist){
 const context=await browser.newContext();await gist.attach(context);
 const page=await context.newPage();await page.goto(base);
 return page;
}
async function signIn(page,passphrase=PASS){
 await page.getByRole('button',{name:'Sign in'}).click();
 await page.getByLabel('Sync passphrase').fill(passphrase);
 await page.locator('#syncSignIn').getByRole('button',{name:'Sign in'}).click();
}
const synced=page=>expect(page.locator('#syncBtn')).toHaveText('☁ Synced');

test('progress follows you between browsers and merges what each one already had',async({browser})=>{
 const gist=fakeGitHub();
 const a=await vm(browser,gist),b=await vm(browser,gist);

 await signIn(a,'wrong passphrase');
 await expect(a.locator('#syncSignInMsg')).toHaveText('Wrong passphrase.');
 await a.getByLabel('Sync passphrase').fill(PASS);
 await a.locator('#syncSignIn').getByRole('button',{name:'Sign in'}).click();
 await synced(a);

 // VM A ticks a step; it reaches the gist after the short upload delay.
 await a.evaluate(()=>{openLesson('l01');toggleLab('l01',0,true)});
 await expect(a.locator('#syncBtn')).toHaveText('☁ Saving…');
 await synced(a);
 expect(gist.data().labs.l01).toEqual([true,false,false]);

 // VM B already has its own local progress before signing in: it is kept and merged.
 await b.evaluate(()=>{openLesson('l02');toggleLab('l02',1,true)});
 await signIn(b);await synced(b);
 expect(await b.evaluate(()=>store.labs)).toEqual({l01:[true,false,false],l02:[false,true,false]});
 expect(gist.data().labs).toEqual({l01:[true,false,false],l02:[false,true,false]});

 // Back on VM A: returning to the tab pulls B's work into the open lesson without saving over it.
 await a.evaluate(()=>{openLesson('l02')});await synced(a);
 await a.evaluate(()=>syncNow());
 await expect(a.locator('.lab-step input').nth(1)).toBeChecked();

 // Unticking on one VM propagates (no union merge when nothing conflicts).
 await a.locator('.lab-step input').nth(1).uncheck();await synced(a);
 await b.evaluate(()=>syncNow());
 expect(await b.evaluate(()=>store.labs)).toEqual({l01:[true,false,false]});

 // Reset on B clears every signed-in browser.
 b.on('dialog',dialog=>dialog.accept());
 await b.getByRole('button',{name:'Reset'}).click();await synced(b);
 await a.evaluate(()=>syncNow());
 expect(await a.evaluate(()=>store.labs)).toEqual({});

 // Signing in survives a reload; the token is only ever sent to the GitHub API.
 await a.reload();await synced(a);
 expect([...gist.tokens]).toEqual(['Bearer '+TOKEN]);
 await a.context().close();await b.context().close();
});

test('a revoked token signs the browser out and keeps local progress',async({browser})=>{
 const gist=fakeGitHub();
 const page=await vm(browser,gist);
 await signIn(page);await synced(page);
 gist.status=401;
 let message='';page.on('dialog',dialog=>{message=dialog.message();dialog.accept()});
 await page.evaluate(()=>{openLesson('l01');toggleLab('l01',0,true)});
 await expect(page.locator('#syncBtn')).toHaveText('Sign in');
 expect(message).toMatch(/rejected the sync token/);
 expect(await page.evaluate(()=>[store.labs.l01,localStorage.getItem('cyberpath_sync_auth')])).toEqual([[true],null]);
 await page.context().close();
});
