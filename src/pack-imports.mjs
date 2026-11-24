import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {pipeline} from 'node:stream/promises';
import {archiveLimit,folderFiles} from './pack-reader.mjs';
import {scanGames,validateGame} from './game-profiles.mjs';
import {pairProfile,publicProfile} from './companion-install.mjs';

const pause=()=>new Promise(r=>setImmediate(r));
const supported=p=>p.version==='1.20.1'&&['forge','fabric'].includes(p.loader);
const active=s=>['waiting','uploading','reading','saving'].includes(s);
export class PackImports{
  constructor(knowledge,profiles){
    this.k=knowledge;this.store=knowledge.store;this.profiles=profiles;this.hashes=new Map();this.scanned=new Map();
    for(const {pack} of this.k.db.prepare("SELECT DISTINCT pack FROM companion_documents WHERE pack LIKE 'import-stage:%'").all())this.discard(pack);
  }
  discard(id){const db=this.k.db;db.exec('BEGIN');try{for(const d of db.prepare('SELECT id FROM companion_documents WHERE pack=?').all(id))this.k.remove(id,d.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  list(){return this.k.packs().filter(p=>p.id.startsWith('archive:')).map(p=>({...p,bound:this.profiles.filter(f=>this.store.get('pack-binding:'+f.id)===p.id).map(f=>({id:f.id,name:f.name}))}));}
  state(){const j=this.job;return {packs:this.list(),job:j?{id:j.id,status:j.status,done:j.done,total:j.total,pack:j.pack,error:j.error}:null};}
  start({file,folder,profileId,name}){
    if(active(this.job?.status))throw Error('已有导入任务，请先等待或取消。');
    const p=this.profiles.find(p=>profileId?p.id===profileId:typeof folder==='string'&&path.resolve(folder).toLowerCase()===path.resolve(p.gameDir).toLowerCase());if(profileId&&!p)throw Error('游戏实例不存在。');
    if(p){folder=p.gameDir;name=p.name;}
    if(file&&folder||file&&!/\.(mrpack|zip)$/i.test(file)||[file,folder].some(v=>v&&!path.isAbsolute(v)))throw Error('请选择本地整合包或游戏文件夹。');
    const j=this.job={id:randomUUID(),status:'waiting',done:0,total:0,name:path.basename(String(name||file||folder||'整合包')).slice(0,180),controller:new AbortController()};
    if(file||folder)this.run(j,{file,folder,name:j.name,profile:p?{loader:p.loader,version:p.version??'1.20.1'}:undefined});
    else{j.timer=setTimeout(()=>this.cancel(j.id),120000);j.timer.unref();}
    return {id:j.id};
  }
  run(j,input,upload){
    j.status=upload?'uploading':'reading';clearTimeout(j.timer);
    j.task=(async()=>{
      let tmp;const signal=j.controller.signal,stage='import-stage:'+j.id;
      try{
        if(upload){
          tmp=await fs.mkdtemp(path.join(os.tmpdir(),'together-pack-'));input.file=path.join(tmp,'upload.zip');
          await pipeline(upload,async function*(source){for await(const b of source){j.done+=b.length;if(j.done>archiveLimit)throw Error('压缩包超过 4 GiB。');yield b;}},createWriteStream(input.file,{flags:'wx'}),{signal});
        }
        signal.throwIfAborted();j.status='reading';j.done=0;j.total=0;
        const data=await new Promise((resolve,reject)=>{
          const worker=new Worker(new URL('./pack-reader.mjs',import.meta.url),{execArgv:[],workerData:{task:'pack-import',input},resourceLimits:{maxOldGenerationSizeMb:512}});
          const stop=()=>{void worker.terminate();};signal.addEventListener('abort',stop,{once:true});
          worker.on('message',m=>{if(m.progress)Object.assign(j,m.progress);else if(m.error)reject(Error(m.error));else resolve(m.result);});
          worker.on('error',reject);worker.on('exit',()=>{signal.removeEventListener('abort',stop);reject(Error('资料读取已中断。'));});
        });
        signal.throwIfAborted();const {docs,pack,facts}=data;
        if(!this.k.pack(pack.id)){
          // Keep unfinished batches out of search. Publish the complete index and its facts atomically.
          j.status='saving';j.done=0;j.total=docs.length;
          for(let i=0;i<docs.length;i+=100){
            signal.throwIfAborted();this.k.db.exec('BEGIN');try{for(const doc of docs.slice(i,i+100))this.k.put(stage,doc);this.k.db.exec('COMMIT');}catch(e){this.k.db.exec('ROLLBACK');throw e;}
            j.done=Math.min(i+100,j.total);await pause();
          }
          signal.throwIfAborted();this.k.db.exec('BEGIN');try{
            this.k.db.prepare('UPDATE companion_documents SET pack=? WHERE pack=?').run(pack.id,stage);
            this.store.set('pack-facts:'+pack.id,facts);this.k.savePack({...pack,documents:docs.length,updated:new Date().toISOString()});this.k.db.exec('COMMIT');
          }catch(e){this.k.db.exec('ROLLBACK');throw e;}
        }
        if(input.folder&&!input.profile)this.store.set('pack-import-folder:'+pack.id,input.folder);
        j.pack=pack.id;j.status='ready';
      }catch(e){j.status=signal.aborted?'cancelled':'error';j.error=signal.aborted?'导入已取消。':String(e.message).slice(0,350);}
      finally{this.discard(stage);if(tmp)await fs.rm(path.join(tmp,'upload.zip'),{force:true}).then(()=>fs.rmdir(tmp));}
    })();return j.task;
  }
  async upload(id,req){const j=this.job;if(!j||j.id!==id||j.status!=='waiting')throw Error('上传任务无效。');if(Number(req.headers['content-length'])>archiveLimit){this.cancel(id);throw Error('压缩包超过 4 GiB。');}j.total=Number(req.headers['content-length'])||0;await this.run(j,{name:j.name},req);return this.state();}
  cancel(id){const j=this.job;if(j?.id!==id||!active(j.status))return;clearTimeout(j.timer);j.controller.abort();if(!j.task)j.status='cancelled';}
  async matches(id,searchRoot){
    const p=this.k.pack(id);if(!id?.startsWith('archive:')||!p)throw Error('找不到导入的资料包。');
    const facts=this.store.get('pack-facts:'+id,{}),rows=[];
    const knownRoot=searchRoot||(!this.scanned.has(id)&&this.store.get('pack-import-folder:'+id));
    if(knownRoot){
      let found;try{found=await scanGames(knownRoot);}catch(e){if(searchRoot)throw e;found=[];}
      const scanned=[];
      for(const p of found){const key=createHash('sha256').update(p.versionDir).digest('hex').slice(0,24);scanned.push({...p,id:'scanned:'+key});}
      this.scanned.set(id,scanned);
    }
    const candidates=this.profiles.concat((this.scanned.get(id)??[]).filter(p=>!this.profiles.some(f=>f.gameDir.toLowerCase()===p.gameDir.toLowerCase()&&p.loader===f.loader)));
    for(const f of candidates){
      const r={id:f.id,name:f.name,path:f.gameDir,matched:0,missing:0,changed:0,extra:0,differences:[],level:'incompatible'},examples=s=>{if(r.differences.length<5)r.differences.push(s);};
      rows.push(r);if(!supported(p)||(f.version??'1.20.1')!==p.version||f.loader!==p.loader){examples('游戏版本或加载器不匹配');continue;}
      let root;try{root=await fs.realpath(f.gameDir);}catch{examples('实例目录不存在');continue;}
      let local;try{local=await folderFiles(root);}catch(e){examples('无法核对目录：'+e.message);continue;}
      for(const [rel,hash] of Object.entries(facts)){
        const file=path.join(root,rel);let stat;try{
          const actual=await fs.realpath(file);const sub=path.relative(root,actual);
          if(sub.startsWith('..'+path.sep)||sub==='..'||path.isAbsolute(sub))throw Error();
          stat=await fs.stat(actual);if(!stat.isFile()||stat.size>512*1024**2)throw Error();
          const cached=this.hashes.get(actual),stamp=[stat.size,stat.mtimeMs,stat.ctimeMs].join(':');let value=cached?.value;
          if(cached?.stamp!==stamp){const h=createHash('sha512');for await(const b of createReadStream(actual))h.update(b);value=h.digest('hex');if(this.hashes.size>30000)this.hashes.clear();this.hashes.set(actual,{stamp,value});}
          if(value===hash)r.matched++;else{r.changed++;examples('已修改：'+rel);}
        }catch{r.missing++;examples('缺失或不可读取：'+rel);}
      }
      for(const n of local.keys())if((/^mods\/.*\.jar$/i.test(n)||['folder','zip'].includes(p.format)&&n.includes('/'))&&!Object.hasOwn(facts,n)){r.extra++;examples('实例另有：'+n);}
      r.level=r.matched&&!r.missing&&!r.changed&&!r.extra&&!p.warnings.length&&!(p.format==='curseforge'&&p.declared)?'high':'possible';
    }
    rows.sort((a,b)=>({high:2,possible:1,incompatible:0}[b.level]-{high:2,possible:1,incompatible:0}[a.level])||b.matched-a.matched);
    return {candidates:rows,recommended:rows.filter(r=>r.level==='high').length===1?rows.find(r=>r.level==='high').id:null};
  }
  async bind(pack,profileId,unbind=false){
    if(unbind){if(this.store.get('pack-binding:'+profileId)!==pack)throw Error('绑定已变化，请刷新。');}
    else if(!(await this.matches(pack)).candidates.some(r=>r.id===profileId&&r.level!=='incompatible'))throw Error('该实例不能绑定这个资料包。');
    if(!unbind&&profileId.startsWith('scanned:')){
      const chosen=(this.scanned.get(pack)??[]).find(f=>f.id===profileId),p=await validateGame(chosen);
      const existing=this.profiles.find(f=>f.gameDir.toLowerCase()===p.gameDir.toLowerCase());if(existing&&existing.loader!==p.loader)throw Error('这个共用目录已关联其他加载器，请先核对实例隔离设置。');
      if(!existing){this.profiles.push(pairProfile(this.store,p));this.store.set('gameProfiles',this.profiles.map(publicProfile));}
      profileId=existing?.id??p.id;
    }
    if(!this.profiles.some(f=>f.id===profileId))throw Error('实例不存在。');
    this.store.set('pack-binding:'+profileId,unbind?null:pack);return this.state();
  }
  async close(){if(this.job){this.cancel(this.job.id);await this.job.task;}}
}
