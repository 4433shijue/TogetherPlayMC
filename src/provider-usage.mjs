export function tokenNumber(value){
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return null;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:null;
}
const first=(...values)=>{for(const v of values){const n=tokenNumber(v);if(n!==null)return n;}return null;};
const paths=['prompt_tokens','input_tokens','completion_tokens','output_tokens','promptTokenCount','candidatesTokenCount','cachedContentTokenCount','cache_read_input_tokens','cache_creation_input_tokens','prompt_cache_hit_tokens','prompt_cache_miss_tokens','prompt_tokens_details.cached_tokens','input_tokens_details.cached_tokens','input_tokens_details.cache_write_tokens','prompt_tokens_details.cache_write_tokens'];
export function usageEvidence(raw){const result={};for(const key of paths){const value=key.split('.').reduce((o,k)=>o?.[k],raw);if(value!==undefined)result[key]=typeof value==='string'?(/^[\d.eE+\-\s]*$/.test(value)?value.slice(0,100):'[无效数值字符串]'):value===null||['number','boolean'].includes(typeof value)?value:'[无效字段类型]';}return result;}
export function normalizeProviderUsage(config,raw={}){
 raw??={};const output=first(raw.completion_tokens,raw.output_tokens,raw.candidatesTokenCount),evidence=usageEvidence(raw);
 let input=null,knownInput=null,cacheRead=null,cacheWrite=null,uncachedInput=null,cacheConsistent=true;
 const issues=[];
 if(config.protocol==='anthropic'){
  uncachedInput=tokenNumber(raw.input_tokens);cacheRead=tokenNumber(raw.cache_read_input_tokens);cacheWrite=tokenNumber(raw.cache_creation_input_tokens);
  const parts=[uncachedInput,cacheRead,cacheWrite],known=parts.filter(n=>n!==null);knownInput=known.length?known.reduce((a,b)=>a+b,0):null;
  if(known.length===3)input=knownInput;
 }else{
  input=first(raw.prompt_tokens,raw.input_tokens,raw.promptTokenCount);
  const standard=first(raw.prompt_tokens_details?.cached_tokens,raw.input_tokens_details?.cached_tokens,raw.cachedContentTokenCount),hit=tokenNumber(raw.prompt_cache_hit_tokens),miss=tokenNumber(raw.prompt_cache_miss_tokens);
  cacheRead=standard??hit;cacheWrite=first(raw.input_tokens_details?.cache_write_tokens,raw.prompt_tokens_details?.cache_write_tokens);
  if(standard!==null&&hit!==null&&standard!==hit){cacheConsistent=false;issues.push('两种缓存读取字段不一致');}
  if(hit!==null&&miss!==null){const total=hit+miss;if(input!==null&&input!==total){cacheConsistent=false;issues.push('命中与未命中之和不等于总输入');}else input??=total;}
  if(input!==null&&cacheRead!==null&&cacheRead>input){cacheConsistent=false;issues.push('缓存读取大于总输入');}
  if(input!==null&&cacheRead!==null&&cacheWrite!==null&&cacheRead+cacheWrite>input){cacheConsistent=false;issues.push('缓存读取与写入合计大于总输入');}
  if(cacheConsistent)uncachedInput=miss??(input!==null&&cacheRead!==null?input-cacheRead-(cacheWrite??0):null);
  const known=[cacheRead,cacheWrite,uncachedInput].filter(n=>n!==null);knownInput=input??(known.length?known.reduce((a,b)=>a+b,0):null);
 }
 if(input!==null&&!Number.isSafeInteger(input)){input=null;cacheConsistent=false;issues.push('输入合计超出可精确计数范围');}
 if(knownInput!==null&&!Number.isSafeInteger(knownInput))knownInput=null;
 const cacheStatus=!cacheConsistent?'unknown':cacheRead>0?'hit':cacheWrite>0?'write':cacheRead===0?'miss':'unknown';
 return {input,knownInput,inputComplete:input!==null,output,cached:cacheRead,cacheRead,cacheWrite,uncachedInput,cacheStatus,cacheConsistent,normalizationVersion:2,usageEvidence:evidence,usageIssues:issues};
}
export function savedUsage(value={}){
 value??={};const keys=['input','output','cached','cacheRead','cacheWrite','uncachedInput','knownInput'];
 return {...Object.fromEntries(keys.map(k=>[k,tokenNumber(value[k])])),inputComplete:value.normalizationVersion===2?value.inputComplete===true:tokenNumber(value.input)!==null,normalizationVersion:value.normalizationVersion===2?2:1,cacheConsistent:value.cacheConsistent!==false,cacheStatus:['hit','write','miss','unknown'].includes(value.cacheStatus)?value.cacheStatus:'unknown',usageEvidence:value.usageEvidence??{},usageIssues:Array.isArray(value.usageIssues)?value.usageIssues:[]};
}
export function summarizeUsage(items){
 const normalized=items.map(savedUsage),modern=normalized.filter(r=>r.normalizationVersion===2),readable=modern.filter(r=>r.cacheConsistent&&r.cacheRead!==null),comparable=readable.filter(r=>r.inputComplete&&r.input!==null&&r.cacheRead<=r.input),total=comparable.reduce((n,r)=>n+r.input,0);
 const input=normalized.reduce((n,r)=>n+(r.knownInput??r.input??0),0),read=modern.reduce((n,r)=>n+(r.cacheConsistent?r.cacheRead??0:0),0),write=modern.reduce((n,r)=>n+(r.cacheConsistent?r.cacheWrite??0:0),0),reported=modern.filter(r=>r.cacheConsistent&&(r.cacheRead!==null||r.cacheWrite!==null)).length;
 return {requests:items.length,reported:normalized.filter(r=>r.input!==null).length,input,knownInput:input,output:normalized.reduce((n,r)=>n+(r.output??0),0),unknownUsage:normalized.filter(r=>r.input===null).length,partialInput:normalized.filter(r=>r.input===null&&r.knownInput!==null).length,legacyRequests:items.length-modern.length,cacheReported:reported,cacheReadReported:readable.length,cacheWriteReported:modern.filter(r=>r.cacheConsistent&&r.cacheWrite!==null).length,cacheUnknown:items.length-reported,cached:read,cacheRead:read,cacheWrite:write,cacheMiss:readable.filter(r=>r.cacheRead===0).length,cacheSampleCount:comparable.length,cacheRate:total?comparable.reduce((n,r)=>n+r.cacheRead,0)/total:null,cacheReadRate:total?comparable.reduce((n,r)=>n+r.cacheRead,0)/total:null,cacheRequestRate:readable.length?readable.filter(r=>r.cacheRead>0).length/readable.length:null,cacheRequestSamples:readable.length};
}
