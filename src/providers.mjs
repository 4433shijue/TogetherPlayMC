import {applyPromptCache} from './prompt-cache.mjs';
import {normalizeProviderUsage} from './provider-usage.mjs';
import {readProviderStream} from './provider-stream.mjs';
import { randomUUID } from 'node:crypto';

export const protocols=['openai','responses','anthropic','gemini'];
export function endpoint(config,route) {
  if(!protocols.includes(config.protocol))throw new Error('请选择接口协议。');
  let u;try{u=new URL(config.url);}catch{throw new Error('请填写完整的 http/https 服务地址。');}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw new Error('服务地址不能包含密码、查询参数或片段。');
  let p=u.pathname.replace(/\/+$/,'').replace(/\/(chat\/completions|responses|messages|models(?:\/[^/]+:generateContent)?)$/,'');
  if(!p)p=config.protocol==='gemini'?'/v1beta':'/v1';
  u.pathname=`${p}/${route}`;return u;
}
export function headers(c){return {'content-type':'application/json',...(c.key ? c.protocol==='anthropic'?{'x-api-key':c.key}:c.protocol==='gemini'?{'x-goog-api-key':c.key}:{authorization:`Bearer ${c.key}`} : {}),...(c.protocol==='anthropic'?{'anthropic-version':c.apiVersion||'2023-06-01'}:{})};}
export class ProviderError extends Error{constructor(message,status=0){super(message);this.status=status;}}
async function request(c,url,body,signal,onText){
  let response;
  try{response=await fetch(url,{method:body?'POST':'GET',headers:headers(c),body:body?JSON.stringify(body):undefined,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000)});}
  catch(e){if(signal?.aborted)throw signal.reason;throw new ProviderError(e.name==='TimeoutError'?'接口响应超时，已停止本次请求。':'无法连接接口，请检查地址和网络。');}
  if(!response.ok){await response.body?.cancel();if(response.status===400&&(body?.prompt_cache_key||body?.system?.some?.(p=>p.cache_control)))throw new ProviderError('接口返回 HTTP 400。本次请求已结束；若缓存增强参数不被支持，可在连接模型中改为仅观测后手动重试。',400);throw new ProviderError(({401:'API Key 无效或已过期。',403:'当前密钥没有访问权限。',404:'未找到接口路径；若服务不提供模型列表，可手动填写模型 ID。',405:'服务不支持该操作，可以手动填写模型 ID。',429:'接口额度不足或请求过于频繁。'})[response.status]??`接口返回 HTTP ${response.status}，本次请求已结束。`,response.status);}
  if(c.stream&&(response.headers.get('content-type')??'').includes('text/event-stream'))return readProviderStream(response,c.protocol,onText,signal);
  const parts=[];let size=0;for await(const part of response.body){parts.push(part);size+=part.length;if(size>8_000_000)throw new ProviderError('接口响应过大。');}
  try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch{throw new ProviderError('接口没有返回 JSON，请检查服务地址是否指向了网页。');}
}
export async function listModels(c,signal){
  const found=new Map(),seen=new Set();let cursor='';
  for(let page=0;page<100;page++){
    const url=endpoint(c,'models');if(cursor)url.searchParams.set(c.protocol==='gemini'?'pageToken':c.protocol==='anthropic'?'after_id':'after',cursor);
    const data=await request(c,url,null,signal), models=c.protocol==='gemini'?data.models:data.data;
    if(!Array.isArray(models))throw new ProviderError('服务没有返回可识别的模型列表，请手动填写模型 ID。');
    for(const m of models){const id=String(m.id??m.name??'').replace(/^models\//,'');if(id)found.set(id,{id,name:m.display_name??m.displayName??id,chat:c.protocol!=='gemini'||!m.supportedGenerationMethods||m.supportedGenerationMethods.includes('generateContent')});}
    const next=c.protocol==='gemini'?data.nextPageToken:data.has_more?(data.last_id??models.at(-1)?.id):null;
    if(!next)return [...found.values()].sort((a,b)=>a.id.localeCompare(b.id));
    if(seen.has(next))throw new ProviderError('模型列表分页重复，请稍后重试或手动填写。');seen.add(next);cursor=next;
  }throw new ProviderError('模型列表超过分页上限。');
}
function messageText(m){return String(m.content??'');}
function pictures(m){const images=m.images??[];if(!Array.isArray(images)||images.length>1)throw new ProviderError('每次最多发送一张图片。');return images.map(i=>{if(!['image/png','image/jpeg'].includes(i.mime)||typeof i.data!=='string'||i.data.length>6_700_000)throw new ProviderError('图片格式无效。');return i;});}
function parts(m,protocol){const content=messageText(m),images=pictures(m);if(protocol==='openai')return images.length?[{type:'text',text:content},...images.map(i=>({type:'image_url',image_url:{url:`data:${i.mime};base64,${i.data}`}}))]:content;
  if(protocol==='responses')return [{type:'input_text',text:content},...images.map(i=>({type:'input_image',image_url:`data:${i.mime};base64,${i.data}`}))];
  if(protocol==='anthropic')return [...(content?[{type:'text',text:content}]:[]),...images.map(i=>({type:'image',source:{type:'base64',media_type:i.mime,data:i.data}}))];
  return [...(content?[{text:content}]:[]),...images.map(i=>({inlineData:{mimeType:i.mime,data:i.data}}))];}
function encodeBase(c,{system,messages,tools=[]}){
  const toolMode=c.toolMode??'native';const native=toolMode==='native'&&tools.length>0;
  if(toolMode==='json')system+='\n本接口使用 JSON 动作格式。只返回 JSON 对象 {"say":"对玩家说的话","actions":[{"name":"工具名","arguments":{}}]}。没有可用工具时 actions 必须为空数组。不使用代码。工具定义：'+JSON.stringify(tools);
  const normalized=toolMode==='native'?messages:messages.map(m=>({role:m.role==='tool'?'user':m.role,images:m.images,content:m.role==='tool'?`游戏执行结果：${m.content}`:toolMode==='json'&&m.role==='assistant'?JSON.stringify({say:messageText(m),actions:(m.calls??[]).map(a=>({name:a.name,arguments:a.arguments}))}):m.calls?.length?`${m.content??''}\n请求动作：${JSON.stringify(m.calls)}`:messageText(m)}));
  if(c.protocol==='openai')return {model:c.model,messages:[{role:'system',content:system},...normalized.map(m=>m.role==='tool'?{role:'tool',tool_call_id:m.callId,content:m.content}:m.calls?{role:'assistant',content:m.content||null,tool_calls:m.calls.map(t=>({id:t.id,type:'function',function:{name:t.name,arguments:JSON.stringify(t.arguments)}}))}:{role:m.role,content:parts(m,'openai')})],...(native?{tools:tools.map(t=>({type:'function',function:t}))}:{})};
  if(c.protocol==='responses')return {model:c.model,instructions:system,store:false,input:normalized.flatMap(m=>m.role==='tool'?[{type:'function_call_output',call_id:m.callId,output:m.content}]:m.rawResponse??[...(m.content||m.images?.length?[{role:m.role,content:m.images?.length?parts(m,'responses'):m.content}]:[]),...(m.calls??[]).map(t=>({type:'function_call',call_id:t.id,name:t.name,arguments:JSON.stringify(t.arguments)}))]),...(native?{tools:tools.map(t=>({type:'function',...t,strict:false}))}:{}),max_output_tokens:2048};
  if(c.protocol==='anthropic')return {model:c.model,system,max_tokens:2048,messages:normalized.map(m=>m.role==='tool'?{role:'user',content:[{type:'tool_result',tool_use_id:m.callId,content:m.content}]}:{role:m.role,content:m.rawAnthropic??[...parts(m,'anthropic'),...(m.calls??[]).map(t=>({type:'tool_use',id:t.id,name:t.name,input:t.arguments}))]}),...(native?{tools:tools.map(t=>({name:t.name,description:t.description,input_schema:t.parameters}))}:{})};
  return {systemInstruction:{parts:[{text:system}]},contents:normalized.map(m=>m.role==='tool'?{role:'user',parts:[{functionResponse:{name:m.name,id:m.callId,response:{result:m.content}}}]}:{role:m.role==='assistant'?'model':'user',parts:m.rawGemini??[...parts(m,'gemini'),...(m.calls??[]).map(t=>({functionCall:{name:t.name,args:t.arguments,id:t.id}}))]}),...(native?{tools:[{functionDeclarations:tools}]}:{}),generationConfig:{maxOutputTokens:2048}};
}
export function encodeRequest(c,input){const body=applyPromptCache(c,encodeBase(c,input));if(input.maxOutputTokens!==undefined){const n=input.maxOutputTokens;if(!Number.isInteger(n)||n<1||n>2048)throw Error('输出上限无效。');if(c.protocol==='openai')body[/^(?:gpt-[5-9]|o[134])/.test(c.model??'')?'max_completion_tokens':'max_tokens']=n;else if(c.protocol==='responses')body.max_output_tokens=n;else if(c.protocol==='anthropic')body.max_tokens=n;else body.generationConfig.maxOutputTokens=n;}if(c.stream&&c.toolMode!=='json'&&c.protocol!=='gemini'){body.stream=true;if(c.protocol==='openai')body.stream_options={include_usage:true};}return body;}
function parseArgs(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;try{const v=JSON.parse(value);if(v&&typeof v==='object'&&!Array.isArray(v))return v;}catch{}throw new ProviderError('模型返回了无法解析的动作参数，本次动作未执行。');}
export const providerUsage=normalizeProviderUsage;
export function decodeResponse(c,data){
  let content='',calls=[],raw={};let u=data.usage??data.usageMetadata;
  if(c.protocol==='openai'){const m=data.choices?.[0]?.message;if(!m)throw new ProviderError('接口未返回对话内容。');content=typeof m.content==='string'?m.content:'';calls=(m.tool_calls??[]).map(t=>({id:t.id,name:t.function.name,arguments:parseArgs(t.function.arguments)}));}
  if(c.protocol==='responses'){raw.rawResponse=data.output??[];content=raw.rawResponse.flatMap(x=>x.type==='message'?x.content??[]:[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');calls=raw.rawResponse.filter(x=>x.type==='function_call').map(t=>({id:t.call_id,name:t.name,arguments:parseArgs(t.arguments)}));}
  if(c.protocol==='anthropic'){raw.rawAnthropic=data.content??[];content=raw.rawAnthropic.filter(x=>x.type==='text').map(x=>x.text).join('\n');calls=raw.rawAnthropic.filter(x=>x.type==='tool_use').map(t=>({id:t.id,name:t.name,arguments:parseArgs(t.input)}));}
  if(c.protocol==='gemini'){raw.rawGemini=data.candidates?.[0]?.content?.parts??[];content=raw.rawGemini.filter(x=>x.text&&!x.thought).map(x=>x.text).join('\n');calls=raw.rawGemini.filter(x=>x.functionCall).map(x=>({id:x.functionCall.id??randomUUID(),name:x.functionCall.name,arguments:parseArgs(x.functionCall.args??{})}));}
  if(c.toolMode==='json'){
    try{const v=JSON.parse(content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));if(!v||typeof v.say!=='string'||!Array.isArray(v.actions)||v.actions.length>6)throw Error();content=v.say;calls=v.actions.map(a=>({id:randomUUID(),name:a.name,arguments:parseArgs(a.arguments??{})}));raw={};}
    catch{const error=new ProviderError('此模型未返回有效的结构化动作。请切换模型、改用原生工具，或选择仅聊天。');let shape='not_json';try{const parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));shape=parsed&&typeof parsed==='object'?`fields:${Object.keys(parsed).sort().join(',')}`:typeof parsed;}catch{}error.responseIssue={shape,characters:content.length,nativeCalls:calls.length};throw error;}
  }
  if(c.toolMode==='chat')calls=[];
  if(!content&&!calls.length)throw new ProviderError('模型没有返回可用内容（可能被截断或拦截）。');
  return {content,calls,...raw,usage:providerUsage(c,u)};
}
export async function complete(c,input,signal,onText){
 if(!c.model)throw new Error('请先选择模型。');
 c={...c,stream:Boolean(c.stream&&c.toolMode!=='json')};
 const route=c.protocol==='openai'?'chat/completions':c.protocol==='responses'?'responses':c.protocol==='anthropic'?'messages':`models/${encodeURIComponent(c.model.replace(/^models\//,''))}:${c.stream?'streamGenerateContent':'generateContent'}`;
 const url=endpoint(c,route);if(c.stream&&c.protocol==='gemini')url.searchParams.set('alt','sse');
 let data;try{data=await request(c,url,encodeRequest(c,input),signal,onText);return decodeResponse(c,data);}catch(e){const u=data?.usage??data?.usageMetadata??e.providerStreamUsage;e.usage=providerUsage(c,u??{});throw e;}
}
