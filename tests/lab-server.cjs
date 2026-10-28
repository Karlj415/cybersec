// Starts a lab app on free loopback ports and resolves with every URL it prints.
const {spawn}=require('node:child_process');
const path=require('node:path');

function startLab(folder,args,urlCount=1){
 const child=spawn(process.execPath,['app.mjs',...args],
  {cwd:path.join(__dirname,'../labs',folder),stdio:['ignore','pipe','pipe']});
 const ready=new Promise((resolve,reject)=>{
  let output='',errors='';
  child.once('error',reject);
  child.stderr.on('data',data=>{errors+=data.toString()});
  child.once('exit',code=>reject(Error('Lab exited: '+code+' '+errors)));
  child.stdout.on('data',data=>{
   output+=data.toString();
   const urls=output.match(/http:\/\/127\.0\.0\.1:\d+/g)||[];
   if(urls.length>=urlCount)resolve(urls);
  });
 });
 async function stop(){
  if(child.exitCode===null){await new Promise(resolve=>{child.once('exit',resolve);child.kill()})}
 }
 return {ready,stop};
}

module.exports={startLab};
