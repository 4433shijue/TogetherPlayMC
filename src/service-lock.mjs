import fs from 'node:fs/promises';
import path from 'node:path';
export async function health(port){try{const r=await fetch('http://127.0.0.1:'+port+'/api/state',{signal:AbortSignal.timeout(1500)});const s=await r.json();return s.app==='TogetherPlayMC'?s:null;}catch{return null;}}
export async function acquireService(directory,port){
 await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'service.lock');
 for(let attempt=0;attempt<3;attempt++){
   try{const handle=await fs.open(file,'wx');await handle.writeFile(JSON.stringify({pid:process.pid,port}));await handle.close();return async()=>{try{const old=JSON.parse(await fs.readFile(file,'utf8'));if(old.pid===process.pid)await fs.unlink(file);}catch{}};}
   catch(e){if(e.code!=='EEXIST')throw e;let old;try{old=JSON.parse(await fs.readFile(file,'utf8'));}catch{throw Error('服务启动锁暂不可读，请稍后再打开。');}
     let alive=false;try{process.kill(old.pid,0);alive=true;}catch(e){if(e.code==='EPERM')alive=true;}
     if(alive)throw Error('服务已在启动或运行，端口 '+old.port+'。请打开该端口网页；如刚刚启动，请稍等几秒。');
     await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});
   }
 }
 throw Error('服务正在启动，请稍后再试。');
}
