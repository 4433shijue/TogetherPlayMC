import {createHash} from 'node:crypto';
import {stableJson} from './prompt-context.mjs';

export const cachePolicies=['auto','observe','anthropic-5m','openai-routing'];
export function validateCachePolicy(value='auto',protocol){
 if(!cachePolicies.includes(value))throw Error('缓存策略无效。');
 if(value==='anthropic-5m'&&protocol!=='anthropic'||value==='openai-routing'&&!['openai','responses'].includes(protocol))throw Error('缓存策略与接口协议不匹配，请选择自动或仅观测。');
 return value;
}
export function cacheSupport(config){
 const policy=validateCachePolicy(config.cachePolicy??'auto',config.protocol);
 let url;try{url=new URL(config.url);}catch{}
 const official=Boolean(url&&url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443'));
 const host=official?url.hostname:'';
 const provider=host==='api.anthropic.com'&&config.protocol==='anthropic'?'anthropic':host==='api.openai.com'&&['openai','responses'].includes(config.protocol)?'openai':host==='api.deepseek.com'&&config.protocol==='openai'?'deepseek':host==='generativelanguage.googleapis.com'&&config.protocol==='gemini'?'gemini':'unknown';
 let effective='observe',reason='未识别的服务，默认仅观察回执；可手动选择与协议匹配的策略。';
 if(policy==='observe')reason='仅观察回执，不添加缓存参数；平台自动缓存仍可能生效。';
 else if(policy!=='auto'){effective=policy;reason='使用你为此连接指定的缓存策略。';}
 else if(provider==='anthropic'&&/^claude-/.test(config.model??'')){effective='anthropic-5m';reason='官方 Claude 接口：缓存固定系统内容，使用默认五分钟有效期。';}
 else if(provider==='openai'){
  effective=/^(?:gpt-(?:4o(?:-|$)|4\.1(?:-|$)|[5-9](?:[.-]|$))|o[134](?:-|$))/.test(config.model??'')?'openai-routing':'managed';
  reason=effective==='openai-routing'?'官方 OpenAI 接口：稳定键区分请求范围，配合平台自动缓存；新模型由平台自动路由。':'官方 OpenAI 接口：由平台决定缓存，不向未识别模型添加增强参数。';
 }else if(['deepseek','gemini'].includes(provider)){effective='managed';reason='官方接口由平台管理自动缓存，不创建显式缓存对象。';}
 return {policy,effective,provider,reason,ttl:effective==='anthropic-5m'?'5m':null};
}
export function systemText(body,protocol){
 const value=protocol==='openai'?body.messages?.[0]?.content:protocol==='responses'?body.instructions:protocol==='anthropic'?body.system:body.systemInstruction?.parts;
 return typeof value==='string'?value:Array.isArray(value)?value.map(p=>p.text??'').join('\n'):'';
}
export function applyPromptCache(config,body){
 const support=cacheSupport(config);
 if(support.effective==='anthropic-5m'&&typeof body.system==='string'&&body.system)body.system=[{type:'text',text:body.system,cache_control:{type:'ephemeral'}}];
 if(support.effective==='openai-routing'){
  const url=new URL(config.url);url.pathname=url.pathname.replace(/\/+$/,'');
  const fingerprint=stableJson({endpoint:url.href,model:config.model,protocol:config.protocol,toolMode:config.toolMode??'native',scope:config.cacheScope??{},system:systemText(body,config.protocol),tools:body.tools??[]});
  body.prompt_cache_key='together-v1-'+createHash('sha256').update(fingerprint).digest('hex').slice(0,52);
 }
 return body;
}
export function cacheDiagnostics(config,body){
 return {...cacheSupport(config),routingKey:body.prompt_cache_key??null,markers:Array.isArray(body.system)?body.system.filter(p=>p.cache_control).map((p,i)=>({location:'system',block:i,...p.cache_control})):[],note:'参数表示本次请求的缓存策略，命中及费用仍以供应商回执为准。'};
}
