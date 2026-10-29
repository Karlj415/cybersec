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
 gist.status=200;gist.barrier=0;gist.waiting=[];gist.patches=0;gist.stale=false;
 gist.data=()=>JSON.parse(gist.file).data;
 gist.held={};gist.pending={GET:0,PATCH:0};
 // Hold every GET or PATCH until the returned function is called.
 gist.hold=method=>{let release;gist.held[method]=new Promise(r=>{release=r});return ()=>{delete gist.held[method];release()}};
 gist.attach=async(context,net={offline:false})=>{
  await context.route('https://**/*',route=>route.abort());
  await context.route(/\/sync-config\.js$/,route=>route.fulfill({contentType:'text/javascript',body:configJS}));
  await context.route('https://api.github.com/gists/'+GIST,async route=>{
   const request=route.request();
   seenTokens.add(request.headers().authorization);
   if(net.offline)return route.abort('internetdisconnected');
   if(gist.held[request.method()]){
    gist.pending[request.method()]++;
    await gist.held[request.method()];
    gist.pending[request.method()]--;
   }
   if(gist.status!==200)return route.fulfill({status:gist.status,body:'{}'}).catch(()=>{});
   if(request.method()==='GET'&&gist.barrier){
    // Hold reads until `barrier` browsers have read, so they all see the same revision.
    gist.waiting.push(route);
    if(gist.waiting.length<gist.barrier)return;
    gist.barrier=0;
    const held=gist.waiting.splice(0);
    for(const r of held)await r.fulfill({contentType:'application/json',body:JSON.stringify({id:GIST,files:{'cyberpath-progress.json':{content:gist.file}}})});
    return;
   }
   let content=gist.file;
   if(request.method()==='PATCH'){gist.previous=gist.file;gist.file=content=JSON.parse(request.postData()).files['cyberpath-progress.json'].content;gist.patches++}
   else if(gist.stale){content=gist.previous;gist.stale=false} // like a cached read just after a write
   // The page may have cancelled the request (sign-out, timeout) while it was held.
   await route.fulfill({contentType:'application/json',body:JSON.stringify({id:GIST,files:{'cyberpath-progress.json':{content}}})}).catch(()=>{});
  });
 };
 gist.tokens=seenTokens;
 return gist;
}
async function vm(browser,gist){
 const context=await browser.newContext();const net={offline:false};await gist.attach(context,net);
 const page=await context.newPage();page.net=net;await page.goto(base);
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

async function signedInPair(browser){
 const gist=fakeGitHub();
 const a=await vm(browser,gist),b=await vm(browser,gist);
 await signIn(a);await synced(a);await signIn(b);await synced(b);
 return {gist,a,b};
}
const labs=page=>page.evaluate(()=>normaliseStore(store).labs);

test('simultaneous uploads: the overwritten browser notices and merges its work back',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await a.evaluate(()=>toggleLab('l01',0,true));
 await b.evaluate(()=>toggleLab('l02',0,true));
 // Both read the same revision, then both upload: the later upload replaces the earlier one.
 gist.barrier=2;
 await Promise.all([a.evaluate(()=>syncNow()),b.evaluate(()=>syncNow())]);
 expect(Object.keys(gist.data().labs)).toHaveLength(1);
 // The check after each upload spots the overwrite and repairs it without any new edits.
 const both={l01:[true,false,false],l02:[true,false,false]};
 await expect.poll(()=>gist.data().labs,{timeout:15000}).toEqual(both);
 // The browser whose upload survived gets the merged copy on its next pull (load, tab focus or edit).
 for(const page of [a,b]){await page.evaluate(()=>syncNow());expect(await labs(page)).toEqual(both)}
 await a.context().close();await b.context().close();
});

test('a stale read from GitHub does not undo a newer change',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await a.evaluate(()=>{toggleLab('l01',0,true);return syncNow()});
 await a.evaluate(()=>{toggleLab('l01',0,false);return syncNow()});
 const patches=gist.patches;
 gist.stale=true;
 await a.evaluate(()=>syncNow());
 expect(await labs(a)).toEqual({});
 expect(gist.data().labs).toEqual({});
 expect(gist.patches).toBe(patches);
 await a.context().close();await b.context().close();
});

test('an unreadable synced copy is never overwritten unless you Reset or Restore',async({browser})=>{
 const gist=fakeGitHub();
 const page=await vm(browser,gist);
 await signIn(page);await synced(page);
 gist.file='{"version":1,"rev":"x","data":{bro';
 await page.evaluate(()=>{toggleLab('l01',0,true);return syncNow()});
 await expect(page.locator('#syncBtn')).toHaveText('☁ Sync error');
 await expect(page.locator('#syncBtn')).toHaveAttribute('title',/cannot be read/);
 expect(gist.file).toBe('{"version":1,"rev":"x","data":{bro');
 // A newer format this page does not understand is protected the same way.
 gist.file=JSON.stringify({version:2,rev:'future',data:{}});
 await page.evaluate(()=>syncNow());
 expect(JSON.parse(gist.file).version).toBe(2);
 page.on('dialog',dialog=>dialog.accept());
 await page.evaluate(()=>{showHome()});
 await page.getByRole('button',{name:'Reset'}).click();await synced(page);
 expect(gist.data()).toEqual({done:[],labs:{},quiz:{},answers:{},last:null});
 await page.context().close();
});

test('a sync redraw keeps keyboard focus on the same control',async({browser})=>{
 const {a,b}=await signedInPair(browser);
 await a.evaluate(()=>openLesson('l01'));
 await a.locator('.lab-step input').nth(1).focus();
 await b.evaluate(()=>{toggleLab('l01',2,true);return syncNow()});
 await a.evaluate(()=>syncNow());
 await expect(a.locator('.lab-step input').nth(2)).toBeChecked();
 await expect(a.locator('.lab-step input').nth(1)).toBeFocused();
 // Same on the roadmap.
 await a.evaluate(()=>showHome());
 await a.locator('.lesson-card').nth(3).focus();
 await b.evaluate(()=>{toggleLab('l02',0,true);return syncNow()});
 await a.evaluate(()=>syncNow());
 await expect(a.locator('.lesson-card').nth(3)).toBeFocused();
 await a.context().close();await b.context().close();
});

// ---- Edge cases from the second review ---------------------------------
const tick=(page,id,step,value=true)=>page.evaluate(([id,step,value])=>{toggleLab(id,step,value);return syncNow()},[id,step,value]);
const savedMeta=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('cyberpath_sync_meta')));
const close=(...pages)=>Promise.all(pages.map(page=>page.context().close()));

test('browsers signed in before the history format still pass unticks along',async({browser})=>{
 const gist=fakeGitHub();
 // What the first sync release left behind: no history or epoch anywhere.
 gist.file=JSON.stringify({version:1,rev:'old1',data:{done:[],labs:{l01:[true,false,false]},quiz:{},answers:{},last:null}});
 const legacy=async()=>{
  const page=await vm(browser,gist);
  await page.evaluate(([token,id])=>{
   localStorage.setItem('cyberpath_v1',JSON.stringify({done:[],labs:{l01:[true,false,false]},quiz:{},answers:{},last:null}));
   localStorage.setItem('cyberpath_sync_auth',JSON.stringify({token,gist:id}));
   localStorage.setItem('cyberpath_sync_meta',JSON.stringify({base:'old1',dirty:false,force:false}));
  },[TOKEN,GIST]);
  await page.reload();await synced(page);
  return page;
 };
 const a=await legacy(),b=await legacy();
 await tick(a,'l01',0,false);
 await b.evaluate(()=>syncNow());
 expect(await labs(b)).toEqual({});
 expect(gist.data().labs).toEqual({});
 await close(a,b);
});

test('a browser that missed hundreds of uploads takes the latest copy instead of merging old ticks back',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);
 await b.evaluate(()=>syncNow());
 expect(await labs(b)).toEqual({l01:[true,false,false]});
 // More uploads than the history keeps, ending with the step unticked.
 await a.evaluate(async()=>{for(let i=0;i<=205;i++){toggleLab('l01',0,i%2===0);await syncNow()}});
 expect(gist.data().labs).toEqual({});
 await b.evaluate(()=>syncNow());
 expect(await labs(b)).toEqual({});
 expect(gist.data().labs).toEqual({});
 await close(a,b);
});

test('Reset wins over a browser that had offline edits from before it',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);await b.evaluate(()=>syncNow());
 b.net.offline=true;
 await tick(b,'l02',0,true);
 await expect(b.locator('#syncBtn')).toHaveText('☁ Sync error');
 a.on('dialog',dialog=>dialog.accept());
 await a.getByRole('button',{name:'Reset'}).click();await synced(a);
 expect(gist.data().labs).toEqual({});
 let notice='';b.on('dialog',dialog=>{notice=dialog.message();dialog.accept()});
 b.net.offline=false;
 await b.evaluate(()=>syncNow());await synced(b);
 expect(await labs(b)).toEqual({});
 expect(gist.data().labs).toEqual({});
 expect(notice).toMatch(/reset or restored in another browser/);
 // After that, the browser syncs normally again.
 await tick(b,'l03',0,true);
 expect(gist.data().labs).toEqual({l03:[true,false,false]});
 await close(a,b);
});

test('an edit during a Reset upload does not leave the overwrite switched on',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);
 const release=gist.hold('PATCH');
 a.on('dialog',dialog=>dialog.accept());
 await a.evaluate(()=>{resetProgress();syncNow()});
 await expect.poll(()=>gist.pending.PATCH).toBe(1);
 await a.evaluate(()=>toggleLab('l04',0,true));
 release();
 await expect.poll(()=>gist.data().labs).toEqual({});
 await expect.poll(()=>a.evaluate(()=>sync.running===null)).toBe(true);
 const meta=await savedMeta(a);
 expect(meta.force).toBe(false);
 // The later edit still uploads, through the normal path.
 await a.evaluate(()=>syncNow());
 expect(gist.data().labs).toEqual({l04:[true,false,false]});
 await close(a,b);
});

test('signing out while a download is in flight does not overwrite later local edits',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(b,'l02',0,true);
 const release=gist.hold('GET');
 const pending=a.evaluate(()=>{syncNow();return true});
 await pending;
 await expect.poll(()=>gist.pending.GET).toBe(1);
 await a.evaluate(()=>{signOut(true);toggleLab('l05',0,true)});
 release();
 await a.waitForTimeout(300);
 expect(await labs(a)).toEqual({l05:[true,false,false]});
 expect(await a.evaluate(()=>JSON.parse(localStorage.getItem('cyberpath_v1')).labs)).toEqual({l05:[true]});
 await expect(a.locator('#syncBtn')).toHaveText('Sign in');
 await close(a,b);
});

test('a GitHub request that never answers times out instead of blocking sync',async({browser})=>{
 const gist=fakeGitHub();
 const a=await vm(browser,gist);await signIn(a);await synced(a);
 await a.evaluate(()=>{sync.timeoutMs=300});
 const release=gist.hold('GET');
 await a.evaluate(()=>syncNow());
 await expect(a.locator('#syncBtn')).toHaveText('☁ Sync error');
 await expect(a.locator('#syncBtn')).toHaveAttribute('title',/did not answer in time/);
 release();
 await tick(a,'l01',0,true);await synced(a);
 expect(gist.data().labs).toEqual({l01:[true,false,false]});
 await close(a);
});

test('missing sync metadata on reload merges local progress instead of discarding it',async({browser})=>{
 const gist=fakeGitHub();
 const a=await vm(browser,gist);await signIn(a);await synced(a);
 await a.evaluate(()=>{
  localStorage.setItem('cyberpath_v1',JSON.stringify({done:[],labs:{l01:[true,false,false]},quiz:{},answers:{},last:null}));
  localStorage.removeItem('cyberpath_sync_meta');
 });
 await a.reload();await synced(a);
 expect(await labs(a)).toEqual({l01:[true,false,false]});
 expect(gist.data().labs).toEqual({l01:[true,false,false]});
 await close(a);
});

test('damaged sync metadata never forces an overwrite',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 const meta=await savedMeta(a);
 await a.evaluate(meta=>localStorage.setItem('cyberpath_sync_meta',JSON.stringify({...meta,force:'false',dirty:'no',unverified:1})),meta);
 await tick(b,'l06',0,true);
 await a.reload();await synced(a);
 expect(gist.data().labs).toEqual({l06:[true,false,false]});
 expect(await labs(a)).toEqual({l06:[true,false,false]});
 await close(a,b);
});

test('if this browser cannot store a download, its sync position does not move',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 const before=(await savedMeta(a)).base;
 await tick(b,'l07',0,true);
 await a.evaluate(()=>{
  const setItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==='cyberpath_v1')throw new Error('quota');return setItem.call(this,key,value)};
 });
 await a.evaluate(()=>syncNow());
 await expect(a.locator('#syncBtn')).toHaveAttribute('title',/could not save the synced progress/);
 expect((await savedMeta(a)).base).toBe(before);
 await close(a,b);
});

test('two tabs of the course do not overwrite each other',async({browser})=>{
 const context=await browser.newContext();
 await context.route('https://**/*',route=>route.abort());
 const one=await context.newPage(),two=await context.newPage();
 await one.goto(base);await two.goto(base);
 await one.evaluate(()=>toggleLab('l01',0,true));
 await expect.poll(()=>labs(two)).toEqual({l01:[true,false,false]});
 await two.evaluate(()=>toggleLab('l02',0,true));
 await one.reload();
 expect(await labs(one)).toEqual({l01:[true,false,false],l02:[true,false,false]});
 await context.close();
});

test('an upload replaced right before the browser closed is merged back on its next visit',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await a.evaluate(()=>toggleLab('l08',0,true));
 await b.evaluate(()=>toggleLab('l09',0,true));
 gist.barrier=2;
 await Promise.all([a.evaluate(()=>syncNow()),b.evaluate(()=>syncNow())]);
 // Both close before the follow-up check runs, then come back.
 await Promise.all([a.reload(),b.reload()]);
 const both={l08:[true,false,false],l09:[true,false,false]};
 await expect.poll(()=>gist.data().labs,{timeout:15000}).toEqual(both);
 await close(a,b);
});

// ---- Three-way merge -----------------------------------------------------
// Each side's change since the copy both last shared wins, so offline unticks
// and cleared quizzes are not brought back by the other browser's copy.
test('an offline untick survives an edit made in another browser meanwhile',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);await b.evaluate(()=>syncNow());
 b.net.offline=true;
 await tick(b,'l01',0,false);
 await tick(a,'l02',0,true);
 b.net.offline=false;
 await b.evaluate(()=>syncNow());
 const expected={l02:[true,false,false]};
 expect(await labs(b)).toEqual(expected);
 expect(gist.data().labs).toEqual(expected);
 await a.evaluate(()=>syncNow());
 expect(await labs(a)).toEqual(expected);
 await close(a,b);
});

const setQuiz=(page,id,score,answers)=>page.evaluate(([id,score,answers])=>{store.quiz[id]=score;store.answers[id]=answers;save();return syncNow()},[id,score,answers]);
const quizOf=(page,id)=>page.evaluate(id=>({quiz:store.quiz[id]??null,answers:store.answers[id]??null}),id);

test('a quiz cleared offline stays cleared',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await setQuiz(a,'l01',3,[0,0,0]);await b.evaluate(()=>syncNow());
 b.net.offline=true;
 await b.evaluate(()=>{openLesson('l01');clearQuiz('l01')});
 await tick(a,'l02',0,true);
 b.net.offline=false;
 await b.evaluate(()=>syncNow());
 expect(await quizOf(b,'l01')).toEqual({quiz:null,answers:null});
 expect(gist.data().quiz).toEqual({});
 expect(gist.data().labs).toEqual({l02:[true,false,false]});
 await close(a,b);
});

test('a quiz retaken offline keeps its own score and answers together',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await setQuiz(a,'l01',3,[0,0,0]);await b.evaluate(()=>syncNow());
 b.net.offline=true;
 await setQuiz(b,'l01',1,[1,1,1]);
 await tick(a,'l02',0,true);
 b.net.offline=false;
 await b.evaluate(()=>syncNow());
 expect(await quizOf(b,'l01')).toEqual({quiz:1,answers:[1,1,1]});
 // Retaken on both sides: the higher score wins, with its own answers.
 await a.evaluate(()=>syncNow());
 a.net.offline=true;b.net.offline=true;
 await setQuiz(a,'l01',2,[2,2,2]);await setQuiz(b,'l01',3,[0,0,0]);
 a.net.offline=false;b.net.offline=false;
 await b.evaluate(()=>syncNow());await a.evaluate(()=>syncNow());
 for(const page of [a,b])expect(await quizOf(page,'l01')).toEqual({quiz:3,answers:[0,0,0]});
 expect(gist.data().quiz).toEqual({l01:3});
 await close(a,b);
});

test('an overwritten upload is rebuilt from the copy both browsers shared',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);await b.evaluate(()=>syncNow());
 await a.evaluate(()=>toggleLab('l01',0,false));
 await b.evaluate(()=>toggleLab('l02',0,true));
 gist.barrier=2;
 await Promise.all([a.evaluate(()=>syncNow()),b.evaluate(()=>syncNow())]);
 const expected={l02:[true,false,false]};
 await expect.poll(()=>gist.data().labs,{timeout:15000}).toEqual(expected);
 for(const page of [a,b]){await page.evaluate(()=>syncNow());expect(await labs(page)).toEqual(expected)}
 await close(a,b);
});

test('metadata without saved copies falls back to keeping both sides',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);await b.evaluate(()=>syncNow());
 b.net.offline=true;
 await tick(b,'l02',0,true);
 await b.evaluate(()=>{const meta=JSON.parse(localStorage.getItem('cyberpath_sync_meta'));delete meta.snaps;localStorage.setItem('cyberpath_sync_meta',JSON.stringify(meta))});
 await tick(a,'l03',0,true);
 b.net.offline=false;
 await b.reload();await synced(b);
 const all={l01:[true,false,false],l02:[true,false,false],l03:[true,false,false]};
 expect(await labs(b)).toEqual(all);
 expect(gist.data().labs).toEqual(all);
 await close(a,b);
});

// ---- Sign-in lasts for one tab --------------------------------------------
const authIn=page=>page.evaluate(()=>[localStorage.getItem('cyberpath_sync_auth'),sessionStorage.getItem('cyberpath_sync_auth')!==null]);

test('the token stays in this tab: never on disk, kept on reload, absent in a new tab',async({browser})=>{
 const gist=fakeGitHub();
 const a=await vm(browser,gist);
 await signIn(a);await synced(a);
 expect(await authIn(a)).toEqual([null,true]);
 await a.reload();await synced(a);
 expect(await authIn(a)).toEqual([null,true]);
 const second=await a.context().newPage();await second.goto(base);
 await expect(second.locator('#syncBtn')).toHaveText('Sign in');
 expect(await authIn(second)).toEqual([null,false]);
 await close(a);
});

test('a token saved by an older version is moved out of localStorage',async({browser})=>{
 const gist=fakeGitHub();
 const a=await vm(browser,gist);
 await a.evaluate(([token,id])=>localStorage.setItem('cyberpath_sync_auth',JSON.stringify({token,gist:id})),[TOKEN,GIST]);
 await a.reload();await synced(a);
 expect(await authIn(a)).toEqual([null,true]);
 await close(a);
});

test('signing out in one tab signs out the others',async({browser})=>{
 const gist=fakeGitHub();
 const one=await vm(browser,gist);
 const two=await one.context().newPage();await two.goto(base);
 await signIn(one);await synced(one);await signIn(two);await synced(two);
 await one.evaluate(()=>signOut(true));
 await expect(two.locator('#syncBtn')).toHaveText('Sign in');
 expect(await authIn(two)).toEqual([null,false]);
 await close(one);
});

test('a second tab signing in keeps the shared sync position',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l01',0,true);await b.evaluate(()=>syncNow());
 const second=await b.context().newPage();await second.goto(base);
 await tick(a,'l01',0,false);
 await signIn(second);await synced(second);
 // A fresh start would merge both copies and bring the tick back.
 expect(await labs(second)).toEqual({});
 expect(gist.data().labs).toEqual({});
 await close(a,b);
});

test('a tab that is not signed in has its edits uploaded by one that is',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 const other=await a.context().newPage();await other.goto(base);
 await expect(other.locator('#syncBtn')).toHaveText('Sign in');
 await other.evaluate(()=>toggleLab('l01',0,true));
 await expect.poll(()=>gist.data().labs).toEqual({l01:[true,false,false]});
 await b.evaluate(()=>syncNow());
 expect(await labs(b)).toEqual({l01:[true,false,false]});
 await close(a,b);
});

test('edits made while no tab was signed in are kept at the next sign-in',async({browser})=>{
 const {gist,a,b}=await signedInPair(browser);
 await tick(a,'l03',0,true);await b.evaluate(()=>syncNow());
 // Close b's only signed-in tab, then edit in a new tab that is not signed in.
 const context=b.context();
 const later=await context.newPage();await b.close();await later.goto(base);
 await later.evaluate(()=>{toggleLab('l03',0,false);toggleLab('l01',0,true)});
 await tick(a,'l02',0,true);
 await signIn(later);await synced(later);
 const expected={l01:[true,false,false],l02:[true,false,false]};
 expect(await labs(later)).toEqual(expected);
 expect(gist.data().labs).toEqual(expected);
 await close(a,later);
});
