import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {inspectDataDirectory} from './data-root.mjs';
import {appVersion} from './version.mjs';

const managed=['together.sqlite','together.sqlite-wal','together.sqlite-shm','skins','journey-media'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const exists=file=>fs.access(file).then(()=>true,()=>false);
export const snapshotRoot=directory=>path.resolve(directory)+'-snapshots';
function child(root,name){if(!/^[a-zA-Z0-9-]+$/.test(name))throw Error('备份编号无效。');return path.join(root,name);}
async function atomicJson(file,value){await fs.writeFile(file+'.tmp',JSON.stringify(value,null,2));await fs.rename(file+'.tmp',file);}
async function inventory(directory,relative=''){
 const files=[];
 for(const e of await fs.readdir(path.join(directory,relative),{withFileTypes:true})){
  const name=path.posix.join(relative,e.name);
  if(e.isSymbolicLink())throw Error('备份中不能包含链接。');
  if(!relative&&!['together.sqlite','skins','journey-media'].includes(e.name))continue;
  if(e.isDirectory())files.push(...await inventory(directory,name));
  else {const bytes=await fs.readFile(path.join(directory,name));files.push({path:name,bytes:bytes.length,sha256:hash(bytes)});}
 }
 return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function createSnapshot(directory,{reason='manual'}={}){
 const base=snapshotRoot(directory),id='snapshot-'+Date.now()+'-'+randomUUID(),target=child(base,id);
 await fs.mkdir(target,{recursive:true});
 try{
  const db=new DatabaseSync(path.join(directory,'together.sqlite'));
  try{db.exec("VACUUM INTO '"+path.join(target,'together.sqlite').replaceAll("'","''")+"'");}finally{db.close();}
  for(const name of ['skins','journey-media'])if(await exists(path.join(directory,name)))await fs.cp(path.join(directory,name),path.join(target,name),{recursive:true,dereference:false});
  const inspection=await inspectDataDirectory(target);if(inspection.integrity!=='ok')throw Error('备份数据库校验失败。');
  const manifest={format:1,id,version:appVersion,created:new Date().toISOString(),reason,counts:inspection.counts,files:await inventory(target)};
  await atomicJson(path.join(target,'snapshot.json'),manifest);return {...manifest,bytes:manifest.files.reduce((n,f)=>n+f.bytes,0)};
 }catch(e){await fs.rm(target,{recursive:true,force:true});throw e;}
}
export async function listSnapshots(directory){
 const base=snapshotRoot(directory),entries=await fs.readdir(base,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
 const list=[];
 for(const e of entries)if(e.isDirectory()&&e.name.startsWith('snapshot-'))try{
  const m=JSON.parse(await fs.readFile(path.join(child(base,e.name),'snapshot.json'),'utf8'));
  list.push({id:e.name,created:m.created,version:m.version,reason:m.reason,counts:m.counts,bytes:m.files.reduce((n,f)=>n+f.bytes,0)});
 }catch{}
 return list.sort((a,b)=>b.created.localeCompare(a.created));
}
export async function previewSnapshot(directory,id){
 const target=child(snapshotRoot(directory),id),raw=await fs.readFile(path.join(target,'snapshot.json'),'utf8'),m=JSON.parse(raw);
 if(m.format!==1||m.id!==id||!Array.isArray(m.files))throw Error('无法识别这份备份。');
 const actual=await inventory(target);
 if(JSON.stringify(actual)!==JSON.stringify(m.files))throw Error('备份文件不完整或已发生变化，不能恢复。');
 const inspection=await inspectDataDirectory(target);if(inspection.integrity!=='ok')throw Error('备份数据库未通过完整性检查。');
 // A valid but unrelated SQLite database is not a TogetherPlayMC backup.
 const db=new DatabaseSync(path.join(target,'together.sqlite'),{readOnly:true});
 try{for(const name of ['roles','settings','memories','events'])if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))throw Error('这份备份缺少伙伴数据表。');}finally{db.close();}
 return {id,created:m.created,version:m.version,counts:inspection.counts,current:(await inspectDataDirectory(directory)).counts,bytes:actual.reduce((n,f)=>n+f.bytes,0),token:hash(raw),note:'恢复会替换角色、记忆、聊天、设置、照片和皮肤；当前内容会先自动备份。游戏存档、程序和当前端口不会被替换。'};
}
// This is called before opening Store, with the service lock held. An interrupted
// swap is rolled back using the original files, never by opening a partial DB.
export async function recoverInterruptedRestore(directory){
 const marker=path.join(directory,'restore-state.json');if(!await exists(marker))return false;
 const m=JSON.parse(await fs.readFile(marker,'utf8')),stage=child(snapshotRoot(directory),m.stage);
 if(!String(m.stage).startsWith('restore-')||!Array.isArray(m.original)||m.original.some(n=>!managed.includes(n)))throw Error('恢复记录无效，请保留数据目录。');
 if(m.phase!=='complete')for(const name of managed){
  const target=path.join(directory,name),old=path.join(stage,'rollback',name);
  if(await exists(old)){await fs.rm(target,{recursive:true,force:true});await fs.rename(old,target);}
  else if(!m.original.includes(name))await fs.rm(target,{recursive:true,force:true});
 }
 await fs.rm(marker);await fs.rm(stage,{recursive:true,force:true});return true;
}
export async function restoreSnapshot(directory,id,token,{afterMove}={}){
 const preview=await previewSnapshot(directory,id);if(!token||token!==preview.token)throw Error('备份已改变，请重新预览后恢复。');
 const before=await createSnapshot(directory,{reason:'before-restore'}),stageId='restore-'+randomUUID(),stage=child(snapshotRoot(directory),stageId),incoming=path.join(stage,'incoming');
 await fs.mkdir(incoming,{recursive:true});await fs.mkdir(path.join(stage,'rollback'));
 const source=child(snapshotRoot(directory),id);
 for(const name of ['together.sqlite','skins','journey-media'])if(await exists(path.join(source,name)))await fs.cp(path.join(source,name),path.join(incoming,name),{recursive:true});
 if(JSON.stringify(await inventory(incoming))!==JSON.stringify(await inventory(source)))throw Error('恢复暂存文件校验失败，当前数据未改变。');
 const original=[];for(const name of managed)if(await exists(path.join(directory,name)))original.push(name);
 const marker=path.join(directory,'restore-state.json'),journal={stage:stageId,original,phase:'swapping',before:before.id};
 await atomicJson(marker,journal);
 try{
  for(const name of original){await fs.rename(path.join(directory,name),path.join(stage,'rollback',name));await afterMove?.(name);}
  for(const name of ['together.sqlite','skins','journey-media'])if(await exists(path.join(incoming,name)))await fs.rename(path.join(incoming,name),path.join(directory,name));
  if((await inspectDataDirectory(directory)).integrity!=='ok')throw Error('恢复后的数据库未通过校验。');
  await atomicJson(marker,{...journal,phase:'complete'});
  await recoverInterruptedRestore(directory);return {ok:true,before:before.id,restored:id};
 }catch(e){await recoverInterruptedRestore(directory);throw Error('恢复未完成，已保留恢复前的数据：'+e.message);}
}
