const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function app(saved){
 const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'dangerously',beforeParse(w){
  w.scrollTo=()=>{}; w.alert=()=>{}; w.confirm=()=>true;
  if(saved)w.localStorage.setItem('cyberpath_v1',saved);
 }});
 return dom.window;
}
const state=w=>JSON.parse(w.localStorage.getItem('cyberpath_v1'));
function answer(w,id='l01'){
 const quiz=w.eval(`ALL.find(l=>l.id==='${id}').quiz`);
 quiz.forEach((q,i)=>{const radio=w.document.querySelector(`input[name=q${i}][value="${q[2]}"]`);radio.click()});
}
function backup(data){return {target:{files:[{text:async()=>JSON.stringify(data)}],value:'backup.json'}}}
test('completion requires practical work and passing answers, awards XP once, and restores answers',()=>{
 const w=app();w.openLesson('l01');answer(w);w.checkQuiz('l01');
 assert.equal(state(w).done.length,0);
 w.document.querySelectorAll('.lab-step input').forEach(x=>x.click());
 w.checkQuiz('l01');w.checkQuiz('l01');
 assert.deepEqual(state(w).done,['l01']);assert.equal(w.document.getElementById('xpText').textContent,'20');
 w.showHome();w.openLesson('l01');
 assert.equal(w.document.querySelectorAll('#quizBox input:checked').length,3);
 assert.equal(w.document.querySelectorAll('.quiz-q.correct').length,3);
 const saved=w.localStorage.getItem('cyberpath_v1');w.close();
 const reopened=app(saved);reopened.openLesson('l01');
 assert.equal(reopened.document.querySelectorAll('#quizBox input:checked').length,3);
 reopened.clearQuiz('l01');assert.equal(reopened.document.querySelectorAll('#quizBox input:checked').length,0);
 assert.deepEqual(state(reopened).done,['l01']);reopened.close();
});
test('restore protects partial work and rejects unsupported versions without mutation',async()=>{
 const w=app();w.openLesson('l01');w.toggleLab('l01',0,true);
 const before=w.localStorage.getItem('cyberpath_v1');let prompts=0;
 w.confirm=()=>{prompts++;return false};
 const event=backup({version:1,data:{done:[],labs:{},quiz:{},last:null}});
 await w.importProgress(event);assert.equal(prompts,1);assert.equal(event.target.value,'');
 assert.equal(w.localStorage.getItem('cyberpath_v1'),before);
 let message;w.alert=m=>message=m;
 await w.importProgress(backup({version:99,data:{done:[],labs:{},quiz:{}}}));
 assert.match(message,/Unsupported backup version/);assert.equal(w.localStorage.getItem('cyberpath_v1'),before);
 w.confirm=()=>true;await w.importProgress(backup({version:1,data:{done:[],labs:{},quiz:{}}}));
 assert.equal(state(w).labs.l01,undefined);w.close();
});
test('answer-only progress requires confirmation and continue resumes the last unfinished lesson',async()=>{
 const w=app();w.openLesson('l02');answer(w,'l02');let prompts=0;w.confirm=()=>{prompts++;return false};
 await w.importProgress(backup({done:[],labs:{},quiz:{}}));assert.equal(prompts,1);
 w.showHome();w.continueLesson();assert.equal(state(w).last,'l02');
 w.resetProgress();assert.equal(state(w).last,'l02');
 w.confirm=()=>true;w.resetProgress();assert.equal(state(w).last,null);w.close();
});
test('corrupt storage is preserved and failed writes warn the learner',()=>{
 const w=app('{broken');assert.equal(w.localStorage.getItem('cyberpath_v1_corrupt_backup'),'{broken');
 assert.match(w.document.getElementById('storageNotice').textContent,/could not be read/);
 w.Storage.prototype.setItem=()=>{throw Error('quota')};w.openLesson('l01');
 assert.match(w.document.getElementById('storageNotice').textContent,/could not be saved/);w.close();
});
test('backup download contains a version and quiz answers',async()=>{
 const w=app();w.openLesson('l01');answer(w);let blob,clicked=false;
 w.URL.createObjectURL=b=>{blob=b;return 'blob:test'};w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){clicked=true;assert.equal(this.download,'cyberpath-progress.json')};
 w.exportProgress();assert.ok(blob.size>0);assert.ok(clicked);
 const text=await new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob)});
 const exported=JSON.parse(text);assert.equal(exported.version,1);assert.equal(exported.data.answers.l01.length,3);
 assert.equal(w.document.querySelector('a[download]'),null);w.close();
});

test('48 legacy completions do not prematurely finish the expanded curriculum',()=>{
 const done=Array.from({length:48},(_,i)=>'l'+String(i+1).padStart(2,'0'));
 const w=app(JSON.stringify({done,labs:{},quiz:{},last:'l48'}));
 assert.notEqual(w.document.getElementById('badgeText').textContent,'Path Complete');
 assert.equal(w.document.getElementById('countText').textContent,'48 / 68 lessons');
 w.continueLesson();assert.equal(state(w).last,'l60');w.close();
});
test('when the browser cannot save, messages never claim progress was saved or reset',()=>{
 const w=app(JSON.stringify({done:['l01'],labs:{},quiz:{},answers:{},last:null}));
 let message='';w.alert=m=>message=m;
 w.Storage.prototype.setItem=()=>{throw Error('quota')};
 w.resetProgress();
 assert.match(message,/could not save/);assert.doesNotMatch(message,/Fresh start/);
 w.openLesson('l02');answer(w,'l02');w.checkQuiz('l02');
 const quiz=w.document.getElementById('quizMsg').textContent;
 assert.match(quiz,/could not be saved/);assert.doesNotMatch(quiz,/are saved/);
 w.document.querySelectorAll('.lab-step input').forEach(x=>x.click());w.checkQuiz('l02');
 assert.match(w.document.getElementById('quizMsg').textContent,/could not save it/);
 w.close();
});

test('the dashboard has no stale lesson count and Next names the lesson Continue opens',()=>{
 assert.match(html,/id="countText"><\/span>/);
 const w=app();
 assert.equal(w.document.getElementById('countText').textContent,`0 / ${w.eval('ALL.length')} lessons`);
 w.openLesson('l05');w.showHome();
 const title=w.eval("ALL.find(l=>l.id==='l05').t");
 assert.match(w.document.getElementById('nextText').textContent,new RegExp('Next: '+title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 w.continueLesson();assert.equal(w.eval('currentLesson'),'l05');
 w.close();
});

test('checking a quiz moves focus to the result, which names the questions to review',()=>{
 const w=app();w.openLesson('l01');
 const quiz=w.eval("ALL.find(l=>l.id==='l01').quiz");
 quiz.forEach((q,i)=>{const value=i===0?q[2]:(q[2]+1)%3;w.document.querySelector(`input[name=q${i}][value="${value}"]`).click()});
 w.checkQuiz('l01');
 const message=w.document.getElementById('quizMsg');
 assert.equal(w.document.activeElement,message);
 assert.match(message.textContent,/Review Q2 and Q3/);
 for(let i=0;i<3;i++)assert.equal(w.document.getElementById('question'+i).getAttribute('aria-describedby'),'quizFeedback'+i);
 w.close();
});

test('each lesson has its own address and the roadmap clears it',()=>{
 const w=app();
 w.openLesson('l05');assert.equal(w.location.hash,'#l05');
 w.showHome();assert.equal(w.location.hash,'');
 w.close();
});
