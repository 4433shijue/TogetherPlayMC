import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync,unlinkSync,existsSync} from 'node:fs';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';

const text=(v,n=2000)=>String(v??'').trim().slice(0,n);
const stamp=()=>new Date().toISOString();
const localDate=value=>{const d=new Date(value);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const parse=row=>row?{...row,data:JSON.parse(row.json),json:undefined}:null;
export const journeyCapabilities=['expressions','journal','goals','guidance','vision'];

export function imageInfo(bytes){
  let width,height,mime;
  if(bytes.length<24||bytes.length>5_000_000)throw new Error('图片需小于 5 MB。');
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){width=bytes.readUInt32BE(16);height=bytes.readUInt32BE(20);mime='image/png';}
  else if(bytes[0]===255&&bytes[1]===216){
    mime='image/jpeg';let p=2;
    while(p+9<bytes.length){if(bytes[p++]!==255)break;while(bytes[p]===255)p++;const marker=bytes[p++];if(marker===217||marker===218)break;const len=bytes.readUInt16BE(p);if(len<2||p+len>bytes.length)break;if([192,193,194].includes(marker)){height=bytes.readUInt16BE(p+3);width=bytes.readUInt16BE(p+5);break;}p+=len;}
  }
  if(!width||!height||width>4096||height>4096||width*height>9_000_000)throw new Error('请选择尺寸不超过 4096 像素的 PNG 或 JPEG 图片。');
  return {mime,width,height};
}

export class Journey {
  constructor(store){
    this.store=store;this.db=store.db;this.mediaDir=path.join(store.directory,'journey-media');mkdirSync(this.mediaDir,{recursive:true});
    if(!store.get('journeySchema')){
      const dir=path.join(store.directory,'backups');mkdirSync(dir,{recursive:true});
      const file=path.join(dir,'before-v06-'+Date.now()+'.sqlite');this.db.exec("VACUUM INTO '"+file.replaceAll("'","''")+"'");
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS journey_sessions(id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,client TEXT NOT NULL,started TEXT NOT NULL,updated TEXT NOT NULL,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_entries(id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,dimension TEXT NOT NULL,session TEXT NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_marks(role TEXT NOT NULL,world TEXT NOT NULL,key TEXT NOT NULL,PRIMARY KEY(role,world,key));
      CREATE TABLE IF NOT EXISTS journey_goals(id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,dimension TEXT NOT NULL,status TEXT NOT NULL,updated TEXT NOT NULL,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_media(id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,created TEXT NOT NULL,saved INTEGER NOT NULL DEFAULT 0,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_baselines(role TEXT NOT NULL,world TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(role,world));
      CREATE INDEX IF NOT EXISTS journey_entry_scope ON journey_entries(role,world,created);
      CREATE INDEX IF NOT EXISTS journey_goal_scope ON journey_goals(role,world,dimension);`);
    store.set('journeySchema',6);this.cleanup();
  }
  cleanup(){for(const row of this.db.prepare('SELECT * FROM journey_media WHERE saved=0 AND created<?').all(new Date(Date.now()-3600000).toISOString()))this.removeMedia(row.id);}
  mark(role,world,key){return this.db.prepare('INSERT OR IGNORE INTO journey_marks VALUES (?,?,?)').run(role,world,key).changes>0;}
  start(role,world,client){
    const old=this.db.prepare('SELECT * FROM journey_sessions WHERE role=? AND world=? AND client=? ORDER BY updated DESC LIMIT 1').get(role,world,client);
    if(old)return parse(old);
    const id=randomUUID(),now=stamp();this.db.prepare('INSERT INTO journey_sessions VALUES (?,?,?,?,?,?,?)').run(id,role,world,client,now,now,'{}');return parse(this.db.prepare('SELECT * FROM journey_sessions WHERE id=?').get(id));
  }
  observe(session,o){
    const {role,world,id}=session;
    const row=this.db.prepare('SELECT json FROM journey_baselines WHERE role=? AND world=?').get(role,world);
    const previous=row?JSON.parse(row.json):null;
    const known={dimension:o.dimension,biome:o.biome,dead:o.dead,position:o.position,worldName:o.worldName};
    const advancements=o.advancementsKnown?o.advancements??[]:previous?.advancements;
    const completed=o.questCompletedKnown?o.completedQuests??[]:previous?.completedQuests;
    const event=(kind,key,title)=>{if(this.mark(role,world,key)&&previous)this.add({role,world,dimension:o.dimension,session:id},{title,kind,source:'game',position:o.position,state:{health:o.health,food:o.food,weather:o.weather,time:o.time,biome:o.biome}});};
    if(o.dimension)event('dimension','dimension:'+o.dimension,'来到 '+o.dimension);
    if(o.biome)event('biome','biome:'+o.dimension+':'+o.biome,'发现 '+o.biome);
    for(const a of advancements??[])if(previous?.advancements!==undefined)event('advancement','advancement:'+a.id,'获得进度：'+a.title);else this.mark(role,world,'advancement:'+a.id);
    for(const q of completed??[])if(previous?.completedQuests!==undefined)event('quest','quest:'+q,'完成任务：'+q);else this.mark(role,world,'quest:'+q);
    if(o.dead&&previous&&!previous.dead)event('death','death:'+id+':'+(o.deathCount??o.eventSequence??stamp()),'这次冒险中倒下了');
    this.db.prepare('INSERT OR REPLACE INTO journey_baselines VALUES (?,?,?)').run(role,world,JSON.stringify({...known,advancements,completedQuests:completed}));
    const data={...session.data,last:o,ended:false};session.data=data;
    this.db.prepare('UPDATE journey_sessions SET updated=?,json=? WHERE id=?').run(stamp(),JSON.stringify(data),id);
    for(const goal of this.goals(role,world,o.dimension)){
      const e=goal.data.evidence;if(goal.status!=='active'||!e)continue;
      const done=e.type==='advancement'?advancements?.some(a=>a.id===e.id):e.type==='quest'?completed?.includes(e.id):false;
      if(done)this.goal({role,world,dimension:o.dimension},{id:goal.id,status:'done',completionSource:'game'});
    }
  }
  end(session){if(!session)return;session.data={...session.data,ended:true};this.db.prepare('UPDATE journey_sessions SET updated=?,json=? WHERE id=?').run(stamp(),JSON.stringify(session.data),session.id);}
  recap(role,world,dimension,currentId){
    if(currentId&&this.db.prepare('SELECT 1 FROM journey_marks WHERE role=? AND world=? AND key=?').get(role,world,'recap-dismiss:'+currentId))return null;
    const previous=parse(this.db.prepare('SELECT * FROM journey_sessions WHERE role=? AND world=? AND id<>? ORDER BY updated DESC LIMIT 1').get(role,world,currentId??''));
    if(!previous)return null;
    const entries=this.entries(role,{world,dimension}).filter(e=>e.session===previous.id).slice(0,8);
    const goals=this.goals(role,world,dimension).filter(g=>['active','paused'].includes(g.status));
    const last=previous.data.last;
    return {session:previous.id,time:previous.updated,entries,goals,position:last?.dimension===dimension?last.position:null,dimension:last?.dimension,summary:entries.map(e=>e.data.title).join('；')||'上次一起停留在这个世界。'};
  }
  add(scope,data){
    if(!scope.role||!scope.world)throw new Error('请先选择存档。');
    const id=randomUUID(),now=stamp();let mediaId=data.mediaId||null;
    if(mediaId)this.media(scope,mediaId);
    const value={title:text(data.title,200)||'一起记住这一刻',text:text(data.text,12000),mood:text(data.mood,80),kind:data.kind??'moment',source:data.source??'user',position:data.position??null,state:data.state??null,mediaId,favorite:Boolean(data.favorite),sources:data.sources??[]};
    this.db.prepare('INSERT INTO journey_entries VALUES (?,?,?,?,?,?,?,0,?)').run(id,scope.role,scope.world,scope.dimension??'',scope.session??'',now,now,JSON.stringify(value));
    if(mediaId)this.db.prepare('UPDATE journey_media SET saved=1 WHERE id=?').run(mediaId);
    return this.entry(scope.role,id);
  }
  entry(role,id){const e=parse(this.db.prepare('SELECT * FROM journey_entries WHERE id=? AND role=? AND deleted=0').get(id,role));if(!e)throw new Error('这条日记不存在。');return e;}
  entries(role,{world='',dimension='',date='',favorite=false}={}){return this.db.prepare('SELECT * FROM journey_entries WHERE role=? AND deleted=0 ORDER BY created DESC').all(role).map(parse).filter(e=>(!world||world===e.world)&&(!dimension||!e.dimension||dimension===e.dimension)&&(!date||localDate(e.created)===date)&&(!favorite||e.data.favorite));}
  edit(role,b){
    const e=this.entry(role,b.id);
    if(b.remove){
      this.db.prepare('UPDATE journey_entries SET deleted=1,updated=? WHERE id=?').run(stamp(),e.id);
      for(const d of this.entries(role,{world:e.world}))if(d.data.sources?.includes(e.id))this.edit(role,{id:d.id,remove:true});
      if(e.data.mediaId&&!this.entries(role).some(x=>x.data.mediaId===e.data.mediaId))this.removeMedia(e.data.mediaId);
      return {deleted:true};
    }
    for(const k of ['title','text','mood'])if(b[k]!==undefined)e.data[k]=text(b[k],k==='text'?12000:k==='title'?200:80);
    if(b.favorite!==undefined)e.data.favorite=Boolean(b.favorite);e.data.userEdited=true;
    this.db.prepare('UPDATE journey_entries SET updated=?,json=? WHERE id=?').run(stamp(),JSON.stringify(e.data),e.id);return this.entry(role,e.id);
  }
  worlds(role){return this.db.prepare('SELECT world,MAX(updated) AS updated FROM journey_sessions WHERE role=? GROUP BY world ORDER BY updated DESC').all(role).map(w=>({...w,name:JSON.parse(this.db.prepare('SELECT json FROM journey_sessions WHERE role=? AND world=? ORDER BY updated DESC LIMIT 1').get(role,w.world).json).last?.worldName||w.world}));}
  goals(role,world,dimension='',deleted=false){return this.db.prepare('SELECT * FROM journey_goals WHERE role=? AND world=? ORDER BY updated DESC').all(role,world).map(parse).filter(g=>(deleted?g.status==='deleted':g.status!=='deleted')&&(!dimension||!g.dimension||g.dimension===dimension));}
  deleteGoal(scope,id,restore=false){
    const g=parse(this.db.prepare('SELECT * FROM journey_goals WHERE id=? AND role=? AND world=?').get(String(id??''),scope.role,scope.world));
    if(!g)throw new Error('目标不属于当前角色和存档。');if(g.dimension&&scope.dimension&&g.dimension!==scope.dimension)throw new Error('请回到目标所属的维度。');
    if(restore?g.status!=='deleted':g.status==='deleted')return {id:g.id,deleted:g.status==='deleted'};
    let status='deleted';
    if(restore){status=['suggested','active','paused','done','abandoned'].includes(g.data.deletedStatus)?g.data.deletedStatus:'active';delete g.data.deletedStatus;}
    else g.data.deletedStatus=g.status;
    this.db.prepare('UPDATE journey_goals SET status=?,updated=?,json=? WHERE id=?').run(status,stamp(),JSON.stringify(g.data),g.id);
    return {id:g.id,deleted:!restore};
  }
  goal(scope,b){
    let g=b.id?parse(this.db.prepare('SELECT * FROM journey_goals WHERE id=? AND role=? AND world=?').get(b.id,scope.role,scope.world)):null;
    if(b.id&&!g)throw new Error('目标不属于当前角色和存档。');if(g?.status==='deleted')throw new Error('这个打算已删除，请先在“已删除”中恢复。');if(g?.dimension&&scope.dimension&&g.dimension!==scope.dimension)throw new Error('请回到目标所属的维度。');
    const status=b.status??g?.status??'active';if(!['suggested','active','paused','done','abandoned'].includes(status))throw new Error('目标状态无效。');
    const data={...(g?.data??{}),title:text(b.title??g?.data.title,200),notes:text(b.notes??g?.data.notes,3000),position:b.position??g?.data.position??null};
    if(!data.title)throw new Error('请写下想做的事。');
    if(b.steps!==undefined){if(!Array.isArray(b.steps)||b.steps.length>30)throw Error('每个打算最多 30 个步骤。');data.steps=b.steps.map((s,i)=>({text:text(s.text,300),done:Boolean(s.done),source:s.done?'user':null})).filter(s=>s.text);}
    if(b.reminder!==undefined){if(!['quiet','next-session'].includes(b.reminder))throw Error('提醒方式无效。');data.reminder=b.reminder;}
    if(b.evidence&&!g){if(!['quest','advancement'].includes(b.evidence.type)||typeof b.evidence.id!=='string')throw new Error('目标证据无效。');data.evidence={type:b.evidence.type,id:text(b.evidence.id,200)};}
    if(status==='done')data.completionSource=b.completionSource==='game'?'game':'user';
    const id=g?.id??randomUUID();this.db.prepare('INSERT OR REPLACE INTO journey_goals VALUES (?,?,?,?,?,?,?)').run(id,scope.role,scope.world,g?.dimension??scope.dimension??'',status,stamp(),JSON.stringify(data));return parse(this.db.prepare('SELECT * FROM journey_goals WHERE id=?').get(id));
  }
  suggest(scope,message){
    const match=message.match(/(?:下次|明天|以后|待会|接下来)(?:我们|咱们|我)?(?:想|要|打算|准备)?([^，。！？,!?\n]{2,150})/);
    if(!match||!this.mark(scope.role,scope.world,'suggestion:'+createHash('sha256').update(message).digest('hex')))return null;
    return this.goal(scope,{title:match[1],notes:'来自你说的：'+text(message,300),status:'suggested'});
  }
  acknowledge(scope,message){
    if(/[?？]|如果|等到|下次|还没|没有/.test(message))return;
    for(const g of this.goals(scope.role,scope.world,scope.dimension)){
      if(g.status!=='active'||!message.includes(g.data.title))continue;
      const tail=message.slice(message.indexOf(g.data.title)+g.data.title.length);
      const head=message.slice(0,message.indexOf(g.data.title));
      if(/^(?:[」”"，,\s]|已经|我|已|刚刚)*(?:完成了|做好了|建好了)/.test(tail)||/(?:我|我已经|我刚刚)(?:完成了|做好了|建好了)[：:「“"\s]*$/.test(head))this.goal(scope,{id:g.id,status:'done',completionSource:'user'});
    }
  }
  upload(scope,base64){
    if(typeof base64!=='string'||base64.length>6_700_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('图片数据无效。');
    this.cleanup();const bytes=Buffer.from(base64,'base64'),info=imageInfo(bytes),id=randomUUID();
    writeFileSync(path.join(this.mediaDir,id),bytes,{flag:'wx'});
    try{this.db.prepare('INSERT INTO journey_media VALUES (?,?,?,?,0,?)').run(id,scope.role,scope.world,stamp(),JSON.stringify(info));}catch(e){unlinkSync(path.join(this.mediaDir,id));throw e;}
    return {id,...info};
  }
  media(scope,id){const row=parse(this.db.prepare('SELECT * FROM journey_media WHERE id=? AND role=? AND world=?').get(id,scope.role,scope.world));if(!row||(!row.saved&&Date.now()-Date.parse(row.created)>3600000))throw new Error('图片不存在或已过期，请重新选择。');return {...row,bytes:readFileSync(path.join(this.mediaDir,row.id))};}
  removeMedia(id){const row=this.db.prepare('SELECT id FROM journey_media WHERE id=?').get(id);if(!row)return;const file=path.join(this.mediaDir,row.id);if(existsSync(file))unlinkSync(file);this.db.prepare('DELETE FROM journey_media WHERE id=?').run(id);}
  discard(scope,id){const m=this.media(scope,id);if(!m.saved)this.removeMedia(id);return {ok:true};}
  export(role,filters){
    const entries=this.entries(role,filters),files={'journal.json':strToU8(JSON.stringify({format:'together-journal-v1',entries},null,2))};
    for(const e of entries)if(e.data.mediaId){const m=this.media({role,world:e.world},e.data.mediaId);files['photos/'+m.id+(m.data.mime==='image/png'?'.png':'.jpg')]=m.bytes;}
    files['README.txt']=strToU8('TogetherPlayMC 共同冒险日记。journal.json 包含文字、来源和地点；photos 包含手动留念。');return zipSync(files,{level:1});
  }
}
