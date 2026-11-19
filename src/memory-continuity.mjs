import {memoryTerms} from './memory.mjs';

export const memoryMeta=(store,id)=>store.get('memoryMeta:'+id,{status:'active',category:'fact',resolved:false});
export function proposeMemory(store,{role,world='',dimension='',kind='fact',text,quote='',replaces='',category='fact'}){
 if(!['fact','preference','promise','topic'].includes(category))throw Error('记忆用途无效。');
 let old;
 if(replaces){
  old=store.memories(role).find(m=>m.id===replaces);
  if(!old||old.world!==world||old.dimension!==(world?dimension:'')||memoryMeta(store,old.id).status!=='active')throw Error('只能修正当前角色和相同范围内仍有效的记忆。');
 }
 const id=store.memory(role,world,kind,text,'companion',undefined,dimension);
 store.set('memoryEvidence:'+id,{source:quote.includes(text)?'stated':'inferred',original:quote});
 store.set('memoryMeta:'+id,{status:old?'pending':'active',category,resolved:false,...(old?{replaces:old.id,baseText:old.text,baseCreated:old.created}:{} )});
 return {id,status:old?'pending':'active',note:old?'修正已提交，等待玩家确认；旧记忆暂时继续有效。':'已记下，玩家可以校对。'};
}
export function confirmMemory(store,role,id){
 const m=store.memories(role).find(m=>m.id===id);if(!m)throw Error('记忆不存在。');
 const meta=memoryMeta(store,id);if(meta.status==='superseded')throw Error('这条记忆已有更新，请查看当前版本。');
 store.db.exec('BEGIN IMMEDIATE');
 try{
  if(meta.status==='pending'){
   const previous=store.memories(role).find(m=>m.id===meta.replaces);
   if(!previous||memoryMeta(store,previous.id).status!=='active'||previous.text!==meta.baseText||previous.created!==meta.baseCreated)throw Error('原记忆已被修改，请重新核对后提出修正。');
   store.set('memoryMeta:'+previous.id,{...memoryMeta(store,previous.id),status:'superseded',supersededBy:id});
   const pins=store.get('pinnedMemories:'+role,[]);if(pins.includes(previous.id))store.set('pinnedMemories:'+role,[...new Set(pins.map(value=>value===previous.id?id:value))]);
  }
  store.memory(role,m.world,m.kind,m.text,'user',id,m.dimension);
  store.set('memoryMeta:'+id,{...meta,status:'active',confirmed:new Date().toISOString()});store.db.exec('COMMIT');
 }catch(e){store.db.exec('ROLLBACK');throw e;}
 return {ok:true};
}
export function reviseMemory(store,role,id,index){
 const m=store.memories(role).find(m=>m.id===id),versions=store.get('memoryRevisions:'+id,[]);
 if(!m||!Number.isInteger(index)||!versions[index])throw Error('找不到这次修改前的记忆。');
 const old=versions[index];store.memory(role,m.world,m.kind,old.text,'user',id,m.dimension);
 store.set('memoryEvidence:'+id,old.evidence??{source:'stated',original:old.text});return {ok:true};
}
export function recallConversation(store,role,world,query,{limit=6,budget=6000,dimension}={}){
 const words=[...memoryTerms(query)].slice(0,12);if(!world||!words.length)return [];
 const conditions=words.map(()=>"json_extract(json,'$.text') LIKE ? ESCAPE '\\'").join(' OR ');
 const args=words.map(w=>'%'+w.replace(/[\\%_]/g,'\\$&')+'%');
 const rows=store.db.prepare("SELECT id,time,type,json FROM events WHERE role=? AND world=? AND type IN ('owner_chat','reply') AND ("+conditions+") ORDER BY id DESC LIMIT 300").all(role,world,...args);
 const scored=rows.filter(r=>!dimension||!JSON.parse(r.json).dimension||JSON.parse(r.json).dimension===dimension).map(r=>{const text=String(JSON.parse(r.json).text??''),lower=text.toLowerCase(),hits=words.filter(w=>lower.includes(w));return {...r,text,hits,score:hits.length+(r.type==='owner_chat'?.25:0)};}).sort((a,b)=>b.score-a.score||b.id-a.id);
 const result=[];let used=0;
 for(const r of scored){
  if(result.length>=limit||used>=budget)break;
  // Return an exact excerpt around the match, including matches at a long
  // message's tail. The original message remains searchable by its ID.
  const focus=r.text.toLowerCase().indexOf(r.hits[0]),start=Math.max(0,focus-180),size=Math.min(1400,budget-used),text=r.text.slice(start,start+size);used+=text.length;
  result.push({id:r.id,time:r.time,speaker:r.type==='owner_chat'?'玩家':'伙伴',text,excerpt:start>0||text.length<r.text.length,source:'历史原话，不代表当前事实或任务完成'});
 }
 return result;
}
