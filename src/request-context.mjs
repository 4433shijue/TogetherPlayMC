import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {encodeRequest,complete} from './providers.mjs';
import {checkDailyBudget} from './companion-plus.mjs';
import {cacheDiagnostics,systemText} from './prompt-cache.mjs';
import {savedUsage,normalizeProviderUsage} from './provider-usage.mjs';
import {stableJson} from './prompt-context.mjs';

export const contextRetention={requests:100,bytes:40_000_000,legacyUsage:200};
const count=value=>typeof value==='string'?value.length:JSON.stringify(value??null).length;
const usage=savedUsage;
const imageMeta=(data,mime)=>({attachment:'image',mime,bytes:Buffer.from(data,'base64').length,sha256:createHash('sha256').update(Buffer.from(data,'base64')).digest('hex'),note:'图片二进制未写入上下文日志；本次请求仍发送了原图片。'});
function snapshot(value,key=''){
 if(typeof value==='string'){
  const image=value.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/);
  return image?imageMeta(image[2],image[1]):value;
 }
 if(Array.isArray(value))return value.map(v=>snapshot(v));
 if(value&&typeof value==='object'){
  if(typeof value.data==='string'&&/^image\//.test(value.mime??value.media_type??value.mimeType??''))return imageMeta(value.data,value.mime??value.media_type??value.mimeType);
  return Object.fromEntries(Object.entries(value).filter(([k])=>!['authorization','x-api-key','x-goog-api-key','encryptedkey','encryptedvisionkey'].includes(k.toLowerCase())).map(([k,v])=>[k,snapshot(v,k)]));
 }
 return value;
}
const scrub=(value,secret)=>{const s=JSON.stringify(snapshot(value));return JSON.parse(secret?s.split(secret).join('[密钥已移除]'):s);};
export function describeContext(config,input,sections=[]){
 const body=encodeRequest(config,input),imageCount=(input.messages??[]).reduce((n,m)=>n+(m.images?.length??0),0);
 const blocks=sections.length?sections.map(s=>({...s,characters:count(s.text)})):[{id:'system',label:'系统上下文',text:input.system??'',characters:count(input.system??'')}];
 const encodedSystem=systemText(body,config.protocol);
 if(encodedSystem.startsWith(input.system??'')&&encodedSystem.length>(input.system??'').length){const extra=encodedSystem.slice((input.system??'').length);blocks.push({id:'protocol-format',label:'接口格式附加说明',text:extra,characters:extra.length});}
 const messages=(input.messages??[]).map(m=>({...m}));
 const conversation=messages.filter(m=>m.role!=='tool'),tools=messages.filter(m=>m.role==='tool');
 const dynamicCharacters=blocks.filter(b=>b.location==='current-message').reduce((n,b)=>n+b.characters,0);
 const breakdown=[...blocks.map(({id,label,characters})=>({id,label,characters})),{id:'messages',label:'聊天记录与本轮问题',characters:Math.max(0,conversation.reduce((n,m)=>n+count(m.content??'')+(m.calls?.length?count(m.calls):0),0)-dynamicCharacters)},{id:'tool-results',label:'工具返回',characters:tools.reduce((n,m)=>n+count(m.content??''),0)},{id:'tool-definitions',label:'可用工具定义',characters:(config.toolMode??'native')==='native'&&input.tools?.length?count(input.tools):0}].filter(p=>p.characters>0);
 // Character counts explain composition; they are deliberately not called tokens.
 const stableText=encodedSystem;
 const stableTools=(config.toolMode??'native')==='native'?(body.tools??[]):[];
 const stablePrefixHash=createHash('sha256').update(stableJson({protocol:config.protocol??'',model:config.model??'',toolMode:config.toolMode??'native',system:stableText,tools:stableTools})).digest('hex');
 return scrub({sections:blocks,messages,tools:config.toolMode==='chat'?[]:input.tools??[],requestBody:body,breakdown,imageCount,bodyCharacters:JSON.stringify(snapshot(body)).length,cacheProfile:{...cacheDiagnostics(config,body),stablePrefixHash,stablePrefixCharacters:stableText.length,stableSectionIds:blocks.filter(b=>b.location==='system').map(b=>b.id)},note:'字符数用于比较上下文组成，不是 token 计费。实际请求体包含协议转换；图片仅保留元数据，鉴权信息不记录。'},config.key);
}

export class RequestContext {
 constructor(store){
  this.store=store;this.db=store.db;this.pending=new Set();
  if(!this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='model_requests'").get()){
   const dir=path.join(store.directory,'backups');mkdirSync(dir,{recursive:true});
   this.db.exec("VACUUM INTO '"+path.join(dir,'before-context-'+Date.now()+'.sqlite').replaceAll("'","''")+"'");
  }
  this.db.exec('CREATE TABLE IF NOT EXISTS model_requests (id TEXT PRIMARY KEY,created TEXT NOT NULL,role TEXT NOT NULL,world TEXT NOT NULL,status TEXT NOT NULL,meta TEXT NOT NULL,detail TEXT NOT NULL); CREATE INDEX IF NOT EXISTS model_request_scope ON model_requests(role,created)');
  for(const row of this.db.prepare("SELECT * FROM model_requests WHERE status='running'").all()){
   const meta=JSON.parse(row.meta);meta.status='interrupted';meta.error='服务在收到结果前退出，接口用量未知。';this.update(row.id,meta,JSON.parse(row.detail));
  }
  this.prune();
 }
 update(id,meta,detail){this.db.prepare('UPDATE model_requests SET status=?,meta=?,detail=? WHERE id=?').run(meta.status,JSON.stringify(meta),JSON.stringify(detail),id);}
 prune(){
  const rows=this.db.prepare('SELECT id,status,length(CAST(detail AS BLOB))+length(CAST(meta AS BLOB)) AS bytes FROM model_requests ORDER BY created DESC,rowid DESC').all();
  let total=0;for(let i=0;i<rows.length;i++){total+=rows[i].bytes;if(rows[i].status!=='running'&&(i>=contextRetention.requests||total>contextRetention.bytes))this.db.prepare('DELETE FROM model_requests WHERE id=?').run(rows[i].id);}
 }
 run(...args){const job=this.record(...args);this.pending.add(job);job.then(()=>this.pending.delete(job),()=>this.pending.delete(job));return job;}
 async drain(){await Promise.allSettled([...this.pending]);}
 async record(config,input,signal,scope={},request=complete){
  config={...config,cacheScope:{role:scope.role??'',world:scope.world??'',kind:scope.kind??'chat',mode:scope.mode??'companion'}};
  checkDailyBudget(this.store,Date.now());
  const started=Date.now(),id=randomUUID(),meta={id,created:new Date(started).toISOString(),role:scope.role??'',world:scope.world??'',mode:scope.mode??'companion',kind:scope.kind??'chat',endpointHash:createHash('sha256').update(String(config.url??'')).digest('hex'),group:scope.group??id,round:scope.round??1,model:config.model??'',protocol:config.protocol,toolMode:config.toolMode??'native',status:'running',usage:normalizeProviderUsage(config),durationMs:null,full:true,source:scope.source??'provider'};
  let detail;
  try{detail=describeContext(config,input,scope.sections);}catch(e){detail={sections:[],messages:[],breakdown:[],note:'请求编码失败：'+e.message};}
  meta.cachePolicy=detail.cacheProfile?.policy??'auto';meta.cacheEffective=detail.cacheProfile?.effective??'observe';meta.breakdown=detail.breakdown;meta.bodyCharacters=detail.bodyCharacters??0;meta.imageCount=detail.imageCount??0;meta.stablePrefixHash=detail.cacheProfile?.stablePrefixHash??null;meta.stablePrefixCharacters=detail.cacheProfile?.stablePrefixCharacters??null;meta.stableSectionIds=detail.cacheProfile?.stableSectionIds??[];
  const previous=this.db.prepare("SELECT meta,detail FROM model_requests WHERE role=? AND world=? AND json_extract(meta,'$.kind')=? ORDER BY rowid DESC LIMIT 1").get(meta.role,meta.world,meta.kind);
  const previousMeta=previous?JSON.parse(previous.meta):null,previousDetail=previous?JSON.parse(previous.detail):null;
  const sameScope=Boolean(previousMeta&&previousMeta.model===meta.model&&previousMeta.protocol===meta.protocol&&previousMeta.toolMode===meta.toolMode&&previousMeta.endpointHash===meta.endpointHash&&previousMeta.cachePolicy===meta.cachePolicy&&previousMeta.cacheEffective===meta.cacheEffective);
  const a=JSON.stringify(sameScope?previousDetail?.requestBody??null:null),b=JSON.stringify(detail.requestBody??null);let shared=0;if(sameScope)while(shared<Math.min(a.length,b.length)&&a[shared]===b[shared])shared++;
  meta.commonPrefixCharacters=sameScope?shared:null;
  meta.stablePrefixChangeReason=!previousMeta?'first-request':!sameScope?'request-scope-changed':previousMeta.stablePrefixHash===meta.stablePrefixHash?'unchanged':'stable-content-changed';
  // A corrupt/huge prompt must not silently consume unbounded local storage.
  if(Buffer.byteLength(JSON.stringify(detail))>4_000_000){detail={breakdown:meta.breakdown,note:'上下文超过 4 MB，未保存完整原文。',omitted:true};meta.full=false;}
  this.db.prepare('INSERT INTO model_requests VALUES (?,?,?,?,?,?,?)').run(id,meta.created,meta.role,meta.world,meta.status,JSON.stringify(meta),JSON.stringify(detail));this.prune();
  try{
   const result=await request(config,input,signal,text=>{if(!signal?.aborted){meta.firstTextMs??=Date.now()-started;meta.streamed=true;scope.onText?.(text);}});meta.status=signal?.aborted?'cancelled':'completed';meta.usage=usage(result.usage??normalizeProviderUsage(config));detail.usageEvidence=meta.usage.usageEvidence;detail.response=scrub({content:result.content,calls:result.calls,discarded:Boolean(signal?.aborted)},config.key);
   return {...result,requestId:id};
  }catch(error){
   meta.status=signal?.aborted?'cancelled':'failed';meta.error=String(error.message??error).split(config.key||'\u0000').join('[密钥已移除]');meta.usage=usage(error.usage??normalizeProviderUsage(config));detail.usageEvidence=meta.usage.usageEvidence;error.usage=meta.usage;error.contextRequestId=id;throw error;
  }finally{meta.durationMs=Date.now()-started;this.update(id,meta,detail);this.prune();}
 }
 legacy(row){const v=JSON.parse(row.json);return {id:'usage:'+row.id,created:row.time,role:row.role,world:row.world,model:v.model,protocol:v.protocol,mode:v.mode??'legacy',kind:'historical',status:v.failed?'failed':'completed',usage:usage(v),full:false,note:'此请求发生在上下文记录启用之前，只保留了接口用量；无法还原当时原文。'};}
 list(role,{offset=0,kind='',status='',world=''}={}){
  const rows=this.db.prepare('SELECT meta FROM model_requests WHERE role=? ORDER BY created DESC').all(role).map(r=>JSON.parse(r.meta));
  const old=this.db.prepare("SELECT id,time,role,world,json FROM events WHERE role=? AND type='usage' AND json_extract(json,'$.requestId') IS NULL ORDER BY id DESC LIMIT ?").all(role,contextRetention.legacyUsage).map(r=>this.legacy(r));
  const filtered=[...rows,...old].filter(r=>(!kind||r.kind===kind)&&(!status||r.status===status)&&(!world||r.world===world)).sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id));
  const start=Math.max(0,Math.min(100000,Math.floor(Number(offset)||0)));return {requests:filtered.slice(start,start+30),total:filtered.length,offset:start,retention:contextRetention};
 }
 get(role,id){
  if(/^usage:\d+$/.test(id)){const row=this.db.prepare("SELECT id,time,role,world,json FROM events WHERE id=? AND role=? AND type='usage' AND json_extract(json,'$.requestId') IS NULL").get(Number(id.slice(6)),role);if(row)return {meta:this.legacy(row),detail:null};}
  const row=this.db.prepare('SELECT meta,detail FROM model_requests WHERE id=? AND role=?').get(id,role);if(!row)throw new Error('这条上下文记录不存在，或已超出保留范围。');const meta=JSON.parse(row.meta),related=this.db.prepare("SELECT meta FROM model_requests WHERE role=? AND json_extract(meta,'$.group')=? ORDER BY created,rowid").all(role,meta.group??id).map(r=>JSON.parse(r.meta));return {meta,detail:JSON.parse(row.detail),related};
 }
}
