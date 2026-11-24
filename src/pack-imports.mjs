import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fork} from 'node:child_process';
import {archiveName} from './archive-stream.mjs';
import {gameTarget,sameTarget} from './game-versions.mjs';
import {PackMatcher,pathKey} from './pack-matcher.mjs';
import {pipeline} from 'node:stream/promises';
import {archiveLimit} from './pack-reader.mjs';
import {pairProfile,publicProfile} from './companion-install.mjs';
import {work} from './paths.mjs';

const pause=()=>new Promise(r=>setImmediate(r));
const active=s=>['waiting','uploading','reading','saving'].includes(s);
async function importScratch(directory,bytes){
  // Leave headroom for the index. Prefer user data; portable installs may be on a larger drive.
  const free=async dir=>{const s=await fs.statfs(dir);return s.bavail*s.bsize;};
  const required=bytes+64*1024**2;
  if(await free(directory)>=required)return fs.mkdtemp(path.join(directory,'together-pack-'));
  if(path.parse(directory).root!==path.parse(work).root){
    try{await fs.mkdir(work,{recursive:true});if(await free(work)>=required)return await fs.mkdtemp(path.join(work,'together-pack-'));}catch{}
  }
  throw Error('资料库和程序所在磁盘空间不足，请释放空间或选择已解压的游戏文件夹。');
}
export class PackImports{
  constructor(knowledge,profiles){
    this.k=knowledge;this.store=knowledge.store;this.profiles=profiles;this.matcher=new PackMatcher(knowledge,profiles);
    for(const {pack} of this.k.db.prepare("SELECT DISTINCT pack FROM companion_documents WHERE pack LIKE 'import-stage:%'").all())this.discard(pack);
  }
  discard(id){const db=this.k.db;db.exec('BEGIN');try{for(const d of db.prepare('SELECT id FROM companion_documents WHERE pack=?').all(id))this.k.remove(id,d.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
  links(){return this.store.get('pack-instance-links',[]);}
  bound(pack){
    const links=this.links().filter(b=>b.pack===pack);
    for(const p of this.profiles)if(this.store.get('pack-binding:'+p.id)===pack&&!links.some(b=>b.id===p.id||pathKey(p.gameDir)===pathKey(b.path)))
      links.push({pack,id:p.id,name:p.name,path:p.gameDir,version:p.version,loader:p.loader,canInstall:Boolean(gameTarget(p.version??(['elements146','vanilla1201'].includes(p.id)?'1.20.1':''),p.loader))});
    return links;
  }
  list(){return this.k.packs().filter(p=>p.id.startsWith('archive:')).map(p=>({...p,bound:this.bound(p.id)}));}
  state(){const j=this.job;return {roots:this.matcher.roots(),packs:this.list(),job:j?{id:j.id,status:j.status,done:j.done,total:j.total,pack:j.pack,error:j.error}:null};}
  start({file,folder,profileId,name}){
    if(active(this.job?.status))throw Error('已有导入任务，请先等待或取消。');
    const p=this.profiles.find(p=>profileId?p.id===profileId:typeof folder==='string'&&path.resolve(folder).toLowerCase()===path.resolve(p.gameDir).toLowerCase());if(profileId&&!p)throw Error('游戏实例不存在。');
    if(p){folder=p.gameDir;name=p.name;}
    if(file&&folder||file&&!archiveName.test(file)||[file,folder].some(v=>v&&!path.isAbsolute(v)))throw Error('请选择 ZIP、MRPACK、7Z、RAR、TAR 压缩包或游戏文件夹。');
    const j=this.job={id:randomUUID(),status:'waiting',done:0,total:0,name:path.basename(String(name||file||folder||'整合包')).slice(0,180),controller:new AbortController()};
    if(file||folder)this.run(j,{file,folder,name:j.name,profile:p?{loader:p.loader,version:p.version}:undefined});
    else{j.timer=setTimeout(()=>this.cancel(j.id),120000);j.timer.unref();}
    return {id:j.id};
  }
  run(j,input,upload){
    j.status=upload?'uploading':'reading';clearTimeout(j.timer);
    j.task=(async()=>{
      let tmp;const signal=j.controller.signal,stage='import-stage:'+j.id;
      try{
        if(input.supplement&&pathKey(await fs.realpath(input.folder))!==pathKey(input.folder))throw Error('实例目录已变化，请重新确认关联。');
        const size=upload?Number(upload.headers['content-length'])||0:input.file?(await fs.stat(input.file)).size:0;
        tmp=await importScratch(this.store.directory,size*(upload?2:1));input.scratch=tmp;
        if(upload){
          input.file=path.join(tmp,'upload');
          await pipeline(upload,async function*(source){for await(const b of source){j.done+=b.length;if(j.done>archiveLimit)throw Error('压缩包超过 4 GiB。');yield b;}},createWriteStream(input.file,{flags:'wx',highWaterMark:1024*1024}),{signal});
        }
        signal.throwIfAborted();j.status='reading';j.done=0;j.total=0;
        const data=await new Promise((resolve,reject)=>{
          const worker=fork(new URL('./pack-reader.mjs',import.meta.url),[],{execArgv:['--max-old-space-size=512'],serialization:'advanced',stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
          let result,error;const stop=()=>worker.kill();signal.addEventListener('abort',stop,{once:true});
          worker.on('message',m=>{if(m.progress)Object.assign(j,m.progress);else if(m.error)error=Error(m.error);else result=m.result;});
          worker.on('error',e=>{error=e;});worker.on('close',(code,sig)=>{signal.removeEventListener('abort',stop);if(result&&!error)resolve(result);else reject(error??Error('资料读取已中断：'+(sig||code)));});
          worker.send(input);
        });
        signal.throwIfAborted();const {docs,pack,facts}=data;
        if(input.supplement)pack.id='instance-index:'+pack.id.slice(8);
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
        if(input.supplement){
          const links=this.links(),link=links.find(b=>b.pack===input.supplement.pack&&b.id===input.supplement.id);
          if(!link)throw Error('关联已解除，未挂入补全资料。');
          link.index=pack.id;this.store.set('pack-instance-links',links);j.pack=link.pack;
        }else{
          if(input.folder&&!input.profile)this.store.set('pack-import-folder:'+pack.id,await fs.realpath(input.folder));
          j.pack=pack.id;void this.matcher.matches(pack.id).catch(()=>{});
        }
        j.status='ready';
      }catch(e){j.status=signal.aborted?'cancelled':'error';j.error=signal.aborted?'导入已取消。':/ENOSPC/.test(e.message)?'资料库所在磁盘空间不足。请释放空间，或选择已解压的游戏文件夹。':String(e.message).slice(0,350);}
      finally{this.discard(stage);if(tmp)await fs.rm(tmp,{recursive:true,force:true,maxRetries:3});}
    })();return j.task;
  }
  async upload(id,req){const j=this.job;if(!j||j.id!==id||j.status!=='waiting')throw Error('上传任务无效。');if(Number(req.headers['content-length'])>archiveLimit){this.cancel(id);throw Error('压缩包超过 4 GiB。');}j.total=Number(req.headers['content-length'])||0;await this.run(j,{name:j.name},req);return this.state();}
  cancel(id){const j=this.job;if(j?.id!==id||!active(j.status))return;clearTimeout(j.timer);j.controller.abort();if(!j.task)j.status='cancelled';}
  async matches(id,root,useRecent=false){if(root)await this.matcher.root(root);return this.matcher.matches(id,useRecent);}
  async bind(pack,id,unbind=false){
    if(unbind){
      const links=this.links();
      const b=this.bound(pack).find(x=>x.id===id);if(!b)throw Error('关联已变化，请刷新。');
      for(const p of this.profiles)if((p.id===id||pathKey(p.gameDir)===pathKey(b.path))&&this.store.get('pack-binding:'+p.id)===pack)this.store.set('pack-binding:'+p.id,null);
      this.store.set('pack-instance-links',links.filter(x=>x.pack!==pack||x.id!==id));
    }else{
      const c=(await this.matches(pack)).candidates.find(x=>x.id===id&&x.level!=='incompatible');if(!c)throw Error('该实例不能关联这个资料包。');
      const links=this.links(),already=links.find(b=>b.pack===pack&&b.id===id);
      this.store.set('pack-instance-links',[...links.filter(b=>b.id!==id&&!(pathKey(b.path)===pathKey(c.path)&&b.version===c.version&&b.loader===c.loader)),{pack,id,path:c.path,name:c.name,version:c.version,loader:c.loader,canInstall:c.canInstall,index:already?.index}]);
      if(this.profiles.some(p=>p.id===id))this.store.set('pack-binding:'+id,pack);
    }
    return this.state();
  }
  supplement(pack,id){
    if(active(this.job?.status))throw Error('请等待当前资料任务完成。');
    const b=this.bound(pack).find(x=>x.id===id);if(!b)throw Error('请先确认关联。');
    if(!this.links().some(x=>x.id===id&&x.pack===pack))this.store.set('pack-instance-links',[...this.links(),b]);
    const j=this.job={id:randomUUID(),done:0,total:0,controller:new AbortController()};
    this.run(j,{folder:b.path,name:b.name,supplement:{pack,id},profile:{version:b.version,loader:b.loader}});return {id:j.id};
  }
  search(pack,query,instance){
    if(!pack?.startsWith('archive:')||!this.k.pack(pack))throw Error('资料包不存在。');
    const opts={spoilers:true,staticOnly:true},q=String(query??'').slice(0,400);
    if(!instance)return this.k.search(pack,q,opts);
    const b=this.bound(pack).find(x=>x.id===instance);if(!b?.index)throw Error('该实例还没有可查询的补全资料。');
    return this.k.search(b.index,q,opts).map(d=>({...d,source:'本机实例「'+b.name+'」：'+d.source}));
  }
  async installCandidate(pack,id){
    const link=this.bound(pack).find(b=>b.id===id);if(!link)throw Error('请先确认资料关联。');
    const c=(await this.matches(pack)).candidates.find(x=>pathKey(x.path)===pathKey(link.path)&&x.level!=='incompatible'&&x.canInstall&&x.loader===link.loader&&x.version===link.version);
    if(!c)throw Error('无法确认这个实例可以安装伙伴，请重新核对目录。');
    const existing=this.profiles.find(f=>pathKey(f.gameDir)===pathKey(c.path));if(existing&&!sameTarget(existing,c))throw Error('不同游戏版本或加载器共用目录，请先隔离实例。');
    if(existing)return existing;
    const profile={id:'game-'+createHash('sha256').update(pathKey(c.path)).digest('hex').slice(0,16),gameDir:c.path,name:c.name,version:c.version,loader:c.loader};
    return pairProfile(this.store,profile);
  }
  installed(pack,id,p){
    if(!this.profiles.some(f=>f.id===p.id)){this.profiles.push(p);this.store.set('gameProfiles',this.profiles.map(publicProfile));}
    this.store.set('pack-binding:'+p.id,pack);
  }
  async close(){if(this.job){this.cancel(this.job.id);await this.job.task;}await this.matcher.close();}
}
