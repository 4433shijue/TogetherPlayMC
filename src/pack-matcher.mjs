import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {folderFiles,versionMeta,privatePath} from './pack-reader.mjs';
import {scanGames} from './game-profiles.mjs';
import {gameTarget} from './game-versions.mjs';

export const pathKey=p=>process.platform==='win32'?path.resolve(p).toLowerCase():path.resolve(p);
const instanceId=p=>'scanned:'+createHash('sha256').update(pathKey(p)).digest('hex').slice(0,24);
const known=v=>v&&v!=='unknown';
const legacyVersion=p=>p.version||({vanilla1201:'1.20.1',elements146:'1.20.1'}[p.id])||'';
const markers=new Set(['mods','config','defaultconfigs','kubejs','data','patchouli_books','global_packs']);
const list=dir=>fs.readdir(dir,{withFileTypes:true}).catch(()=>[]);
async function plain(dir,parentMeta){
 const entries=await list(dir);
 if(!entries.some(e=>e.isDirectory()&&markers.has(e.name)))return null;
 let meta={version:'',loader:'unknown'};
 const files=['mmc-pack.json','version.json',path.basename(dir)+'.json'].map(n=>path.join(dir,n));
 for(const file of parentMeta?[parentMeta,...files]:files){
   try{const stat=await fs.lstat(file);if(!stat.isFile()||stat.size>4*1024**2)continue;meta=versionMeta(JSON.parse(await fs.readFile(file,'utf8')));break;}catch{}
 }
 return {id:instanceId(dir),name:path.basename(dir),gameDir:dir,...meta};
}
async function discover(root){
 const rows=await scanGames(root).catch(()=>[]);
 const entries=await list(root);
 if(!rows.length){const p=await plain(root);if(p)return [p];}
 if(!rows.length)for(const name of ['minecraft','.minecraft']){
   const child=path.join(root,name);if(!(await fs.lstat(child).catch(()=>null))?.isDirectory())continue;
   const p=await plain(child,path.join(root,'mmc-pack.json'));if(p)return [{...p,name:path.basename(root)}];
 }
 // Only inspect known layouts or immediate child instances under a chosen launcher root.
 const children=entries.filter(e=>e.isDirectory()&&!privatePath(e.name+'/')&&!markers.has(e.name)&&!['versions','libraries','assets','runtime','.minecraft'].includes(e.name)).slice(0,300);
 const dirs=children.filter(e=>e.name!=='instances').map(e=>path.join(root,e.name));
 if(children.some(e=>e.name==='instances'))for(const e of (await list(path.join(root,'instances'))).slice(0,300))if(e.isDirectory()&&!privatePath(e.name+'/'))dirs.push(path.join(root,'instances',e.name));
 for(const dir of dirs){
   const p=await plain(dir);if(p){rows.push(p);continue;}
   for(const sub of ['.minecraft','minecraft']){
     const gameDir=path.join(dir,sub);const stat=await fs.lstat(gameDir).catch(()=>null);if(!stat?.isDirectory())continue;
     const child=await plain(gameDir,path.join(dir,'mmc-pack.json'));if(child){rows.push({...child,name:path.basename(dir)});break;}
   }
 }
 return rows.map(p=>({...p,id:p.id||instanceId(p.versionDir||p.gameDir)}));
}

export class PackMatcher{
 constructor(knowledge,profiles){this.k=knowledge;this.store=knowledge.store;this.profiles=profiles;this.hashes=new Map();this.running=new Map();this.recent=new Map();this.controller=new AbortController();}
 roots(){return this.store.get('pack-search-roots',[]);}
 async root(dir,remove=false){
   if(typeof dir!=='string'||!path.isAbsolute(dir))throw Error('请选择启动器或实例的完整目录。');
   const value=remove?dir:await fs.realpath(dir),key=pathKey(value),old=this.roots();
   if(!remove&&(path.parse(value).root===value||privatePath(value.replaceAll('\\','/')+'/')||!(await fs.stat(value)).isDirectory()))throw Error('请选择启动器或实例目录，不扫描整盘、存档或私人目录。');
   const next=old.filter(x=>pathKey(x)!==key);if(!remove)next.push(value);if(next.length>24)throw Error('最多记住 24 个目录。');
   this.store.set('pack-search-roots',next);this.recent.clear();return next;
 }
 async matches(id,useRecent=false){
   const pack=this.k.pack(id);if(!id?.startsWith('archive:')||!pack)throw Error('资料包不存在。');
   const roots=[...new Set([...this.roots(),this.store.get('pack-import-folder:'+id)].filter(Boolean))];
   const key=JSON.stringify([id,roots,this.profiles.map(p=>[p.id,p.gameDir,p.version,p.loader])]);
   const previous=this.recent.get(key);if(useRecent&&previous&&Date.now()-previous.at<30000)return previous.result;
   if(!this.running.has(key)){const task=this.compare(pack,roots).then(result=>{if(this.recent.size>=12)this.recent.delete(this.recent.keys().next().value);this.recent.set(key,{at:Date.now(),result});return result;}).finally(()=>this.running.delete(key));this.running.set(key,task);}
   return this.running.get(key);
 }
 async compare(pack,roots){
   const facts=this.store.get('pack-facts:'+pack.id,{}),warnings=[],rows=[],signal=this.controller.signal;
   const instances=this.profiles.map(p=>({id:p.id,name:p.name,gameDir:p.gameDir,version:p.versionDir? p.version:legacyVersion(p),versionDir:p.versionDir,loader:p.loader}));
   for(const root of roots){
     signal.throwIfAborted();try{const current=await fs.realpath(root);if(pathKey(current)!==pathKey(root))throw Error();const found=await discover(current);if(!found.length)warnings.push('未发现实例：'+root);
       for(const p of found){const i=instances.findIndex(q=>pathKey(q.gameDir)===pathKey(p.gameDir)&&(!known(p.version)||!known(q.version)||q.version===p.version)&&(!known(p.loader)||!known(q.loader)||q.loader===p.loader));
         if(i<0)instances.push(p);else instances[i]={...p,...instances[i],version:instances[i].version||p.version,loader:known(instances[i].loader)?instances[i].loader:p.loader};}
     }catch{warnings.push('目录不可用：'+root);}
   }
   const expected=Object.entries(facts),modFact=n=>/^mods\/[^/]+\.jar$/i.test(n);
   for(const f of instances){
     signal.throwIfAborted();
     const r={id:f.id,name:f.name,path:f.gameDir,version:f.version||'',loader:f.loader||'unknown',canInstall:Boolean(gameTarget(f.version,f.loader)),matched:0,matchedMods:0,missing:0,changed:0,extra:0,differences:[],level:'incompatible'},note=s=>{if(r.differences.length<5)r.differences.push(s);};rows.push(r);
     if((known(pack.version)&&known(f.version)&&pack.version!==f.version)||(known(pack.loader)&&known(f.loader)&&pack.loader!==f.loader)){note('游戏版本或加载器明确不同');continue;}
     let local;try{const actual=await fs.realpath(f.gameDir);if(privatePath(actual.replaceAll('\\','/')+'/'))throw Error();local=await folderFiles(actual);}catch{note('无法读取实例目录');continue;}
     for(const [rel,hash] of expected){
       signal.throwIfAborted();const file=local.get(rel);
       if(!file){r.missing++;note('缺失：'+rel);continue;}
       try{
         const actual=await fs.realpath(file);if(pathKey(actual)!==pathKey(file))throw Error();
         const stat=await fs.stat(actual);if(!stat.isFile()||stat.size>512*1024**2)throw Error();
         const stamp=[stat.size,stat.mtimeMs,stat.ctimeMs].join(':'),cached=this.hashes.get(actual);let value=cached?.value;
         if(cached?.stamp!==stamp){const h=createHash('sha512');for await(const b of createReadStream(actual,{signal}))h.update(b);value=h.digest('hex');if(this.hashes.size>30000)this.hashes.clear();this.hashes.set(actual,{stamp,value});}
         if(value===hash){r.matched++;if(modFact(rel))r.matchedMods++;}else{r.changed++;note('已修改：'+rel);}
       }catch{r.missing++;note('无法核对：'+rel);}
     }
     for(const n of local.keys())if((modFact(n)||!['modrinth','curseforge'].includes(pack.format)&&n.includes('/'))&&!Object.hasOwn(facts,n)){r.extra++;note('实例另有：'+n);}
     if(instances.some(i=>i!==f&&pathKey(i.gameDir)===pathKey(f.gameDir)&&((known(i.version)&&known(f.version)&&i.version!==f.version)||(known(i.loader)&&known(f.loader)&&i.loader!==f.loader)))){
       r.canInstall=false;note('多个游戏版本或加载器共用此目录，安装前请先隔离实例');
     }
     const allModsKnown=expected.filter(([n])=>modFact(n)).length>=pack.mods;
     r.level=r.matchedMods&&allModsKnown&&pack.fingerprintComplete!==false&&!(pack.format==='curseforge'&&pack.declared)&&!r.missing&&!r.changed&&!r.extra?'high':'possible';
     if(!r.matched)note('没有一致的文件指纹，需要手动核对');
   }
   const weight={high:2,possible:1,incompatible:0};rows.sort((a,b)=>weight[b.level]-weight[a.level]||b.matchedMods-a.matchedMods||b.matched-a.matched);
   const high=rows.filter(r=>r.level==='high');return {candidates:rows,recommended:high.length===1?high[0].id:null,warnings};
 }
 async close(){this.controller.abort();await Promise.allSettled(this.running.values());}
}
