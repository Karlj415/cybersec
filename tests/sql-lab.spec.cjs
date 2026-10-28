const {test,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const path=require('node:path');
let child,base;
test.beforeAll(async()=>{
 child=spawn(process.execPath,['app.mjs','0'],
  {cwd:path.join(__dirname,'../labs/sql-injection'),stdio:['ignore','pipe','pipe']});
 base=await new Promise((resolve,reject)=>{
  let output='',errors='';
  child.once('error',reject);
  child.stderr.on('data',data=>{errors+=data.toString()});
  child.once('exit',code=>reject(Error('Lab exited: '+code+' '+errors)));
  child.stdout.on('data',data=>{
   output+=data.toString();
   const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);
   if(match)resolve(match[0]);
  });
 });
});
test.afterAll(async()=>{
 if(child&&child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
});
test('dogfood the real form with normal input, an apostrophe and injection before and after the fix',async({page})=>{
 for(const mode of ['vulnerable','fixed']){
  for(const [input,vulnerable,fixed] of [
   ['Notebook',['Notebook'],['Notebook']],
   ['Unreleased prototype',[],[]],
   ["O'Reilly Guide",[],["O'Reilly Guide"]],
   ["' OR 1=1 -- ",['Notebook',"O'Reilly Guide",'Unreleased prototype'],[]],
   ['',[],[]],['Not a product',[],[]]
  ]){
   await page.goto(base);
   await page.getByLabel('Implementation').selectOption(mode);
   await page.getByLabel('Product name').fill(input);
   await page.getByRole('button',{name:'Send request'}).click();
   const result=JSON.parse(await page.locator('body').innerText());
   expect(result.rows).toEqual(mode==='vulnerable'?vulnerable:fixed);
   if(mode==='fixed'){expect(result.error).toBeNull();expect(result.parameters).toEqual([input])}
  }
 }
});
