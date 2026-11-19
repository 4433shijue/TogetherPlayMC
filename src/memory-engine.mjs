import {createHash} from 'node:crypto';
import {memoryTerms,retrieveMemories} from './memory.mjs';
import {embeddingVersion} from './local-embeddings.mjs';
export const sourceHash=text=>createHash('sha256').update(text).digest('hex');
export function textChunks(text){const out=[];for(let offset=0;offset<text.length;offset+=240)out.push({offset,text:text.slice(offset,offset+280)});return out;}
export function bm25(documents,query){
 const wanted=memoryTerms(query),tokens=documents.map(d=>[...memoryTerms(d.text)]),average=tokens.reduce((n,t)=>n+t.length,0)/Math.max(1,tokens.length);
 const frequencies=new Map([...wanted].map(w=>[w,tokens.filter(t=>t.includes(w)).length]));
 return tokens.map(words=>[...wanted].reduce((score,w)=>{if(!words.includes(w))return score;const idf=Math.log(1+(documents.length-frequencies.get(w)+.5)/(frequencies.get(w)+.5));return score+idf*2.2/(1+1.2*(.25+.75*words.length/Math.max(1,average)));},0));
}
export class MemoryEngine{
 constructor(store,{embedder=null}={}){this.store=store;this.embedder=embedder;this.closed=false;this.job=null;this.tail=Promise.resolve();this.progress=null;
  store.db.exec(`CREATE TABLE IF NOT EXISTS memory_vectors (id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,dimension TEXT NOT NULL,fingerprint TEXT NOT NULL,model TEXT NOT NULL,vectors TEXT NOT NULL); CREATE INDEX IF NOT EXISTS vector_scope ON memory_vectors(role,world,dimension);`);
 }
 documents({role,world,dimension}){
  const memories=retrieveMemories(this.store.memories(role,world).filter(m=>this.store.get('memoryMeta:'+m.id,{status:'active'}).status==='active'),{world,dimension,limit:10000,budget:120000000}).map(m=>({...m,key:'m:'+m.id,type:'memory'}));
  // Legacy messages without dimension are historical quotations, never current world facts.
  const events=this.store.db.prepare("SELECT id,time,type,json FROM events WHERE role=? AND world=? AND type IN ('owner_chat','reply') AND (coalesce(json_extract(json,'$.dimension'),'')='' OR json_extract(json,'$.dimension')=?) ORDER BY id DESC LIMIT 10000").all(role,world,dimension??'').map(r=>({...r,key:'e:'+r.id,role,world,dimension:JSON.parse(r.json).dimension??'',text:String(JSON.parse(r.json).text??''),json:undefined}));
  return [...memories,...events].filter(d=>d.text.trim());
 }
 serial(fn){const result=this.tail.then(fn);this.tail=result.catch(()=>{});return result;}
 status(){return {semantic:this.store.get('companionPreferences',{}).semanticMemory!==false,model:this.embedder?.status?.()??{available:false,loaded:false,error:'本次测试未启用本机模型'},indexed:this.store.db.prepare('SELECT count(*) n FROM memory_vectors').get().n,progress:this.progress,error:this.lastError??'',limit:10000};}
 async index(documents,{limit=12,signal}={}){
  if(!this.embedder||this.store.get('companionPreferences',{}).semanticMemory===false)return;
  let count=0;
  for(const doc of documents){
   if(this.closed||signal?.aborted||count>=limit)break;
   const fingerprint=sourceHash(doc.text),old=this.store.db.prepare('SELECT fingerprint,model,role,world,dimension FROM memory_vectors WHERE id=?').get(doc.key);
   if(old?.fingerprint===fingerprint&&old.model===embeddingVersion&&old.role===doc.role&&old.world===doc.world&&old.dimension===(doc.dimension??''))continue;
   const chunks=textChunks(doc.text),vectors=[];
   for(let start=0;start<chunks.length;start+=8){if(this.closed||signal?.aborted)return;vectors.push(...await this.embedder.embed(chunks.slice(start,start+8).map(c=>c.text)));}
   if(this.closed||signal?.aborted)return;
   // Edits, deletion and replacement while inference is running invalidate this result.
   const live=doc.type==='memory'?this.store.db.prepare('SELECT text FROM memories WHERE id=?').get(doc.id):this.store.db.prepare("SELECT json_extract(json,'$.text') text FROM events WHERE id=?").get(doc.id);
   if(live&&sourceHash(live.text)===fingerprint)this.store.db.prepare('INSERT OR REPLACE INTO memory_vectors VALUES (?,?,?,?,?,?,?)').run(doc.key,doc.role,doc.world,doc.dimension??'',fingerprint,embeddingVersion,JSON.stringify(vectors));
   count++;
  }
 }
 search(scope,query,{signal,limit=8,indexLimit=12}={}){return this.serial(async()=>{
  if(this.closed||signal?.aborted)return {memories:[],quotes:[],mode:'cancelled'};
  const documents=this.documents(scope),scores=bm25(documents,query),scoreMap=new Map(documents.map((d,i)=>[d.key,scores[i]]));let vector=null;
  try{if(this.embedder&&Date.now()>(this.retryAfter??0)&&this.store.get('companionPreferences',{}).semanticMemory!==false){await this.index(documents,{signal,limit:indexLimit});if(!this.closed&&!signal?.aborted)vector=(await this.embedder.embed([String(query).slice(0,500)]))[0];}}catch(error){this.lastError=error.message;this.retryAfter=Date.now()+300000;}
  if(this.closed||signal?.aborted)return {memories:[],quotes:[],mode:'cancelled'};
  // Re-read after awaits; stale/superseded memories must never survive a concurrent edit.
  const current=new Map(this.documents(scope).map(d=>[d.key,d]));
  const vectors=new Map(vector?this.store.db.prepare("SELECT id,fingerprint,vectors FROM memory_vectors WHERE role=? AND (world='' OR world=?) AND model=?").all(scope.role,scope.world,embeddingVersion).map(v=>[v.id,v]):[]);
  const ranked=documents.filter(d=>current.get(d.key)?.text===d.text).map((d)=>{
   const lexical=scoreMap.get(d.key),saved=vectors.get(d.key);let semantic=0,offset=0;
   if(saved?.fingerprint===sourceHash(d.text))for(const [i,v] of JSON.parse(saved.vectors).entries()){const similarity=v.reduce((n,x,k)=>n+x*(vector[k]??0),0);if(similarity>semantic){semantic=similarity;offset=i*240;}}
   if(lexical>0){const word=[...memoryTerms(query)].find(w=>d.text.toLowerCase().includes(w));if(word)offset=Math.max(0,d.text.toLowerCase().indexOf(word)-120);}
   return {...d,offset,retrieval:{lexical:Number(lexical.toFixed(3)),semantic:vector?Number(semantic.toFixed(3)):null},score:lexical/(lexical+2)*.6+Math.max(0,semantic-.25)*1.2};
  }).filter(d=>d.retrieval.lexical>0||d.retrieval.semantic>=.42).sort((a,b)=>b.score-a.score);
  const unique=items=>{const seen=new Set();return items.filter(d=>{const key=d.text.trim();if(seen.has(key))return false;seen.add(key);return true;}).slice(0,limit);};
  let memoryChars=0;const memories=unique(ranked.filter(d=>d.type==='memory'&&d.text.length<=6500)).filter(d=>{if(memoryChars+d.text.length>6500)return false;memoryChars+=d.text.length;return true;}).map(({key,offset,type,score,...d})=>d);
  const quotes=unique(ranked.filter(d=>d.type!=='memory')).slice(0,6).map(d=>({id:d.id,time:d.time,dimension:d.dimension,speaker:d.type==='owner_chat'?'玩家':'伙伴',text:d.text.slice(d.offset,d.offset+900),excerpt:d.offset>0||d.text.length>900,retrieval:d.retrieval,source:'历史原话，不代表当前事实或任务完成'}));
  return {memories,quotes,mode:vector?'hybrid':'keyword',candidates:documents.length};
 });}
 rebuild(scope){
  if(this.job)return this.job;this.retryAfter=0;this.lastError='';this.progress={state:'running',processed:0};
  this.job=(async()=>{try{const docs=this.documents(scope);this.progress.total=docs.length;for(let i=0;i<docs.length&&!this.closed;i+=8){await this.serial(()=>this.index(docs.slice(i,i+8),{limit:8}));this.progress.processed=Math.min(i+8,docs.length);await new Promise(resolve=>setImmediate(resolve));}this.progress.state=this.closed?'cancelled':'complete';}catch(e){this.progress.state='failed';this.lastError=e.message;}finally{this.job=null;}})();return this.job;
 }
 async close(){this.closed=true;await this.embedder?.close?.();await this.tail;await this.job;}
}
