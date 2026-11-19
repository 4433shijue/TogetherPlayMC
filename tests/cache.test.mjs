import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Store} from '../src/store.mjs';
import {CacheTest} from '../src/cache-test.mjs';
import {cacheSupport} from '../src/prompt-cache.mjs';
import {providerUsage,encodeRequest,complete} from '../src/providers.mjs';
import {readProviderStream} from '../src/provider-stream.mjs';
import {summarizeUsage,tokenNumber} from '../src/provider-usage.mjs';
import {describeContext} from '../src/request-context.mjs';
import {savePreferences,usageReport,checkDailyBudget} from '../src/companion-plus.mjs';
import {createApp} from '../src/server.mjs';
const config={protocol:'openai',url:'https://api.openai.com/v1',model:'gpt-4.1',toolMode:'native',hourlyLimit:120};
const input={system:'固定角色与规则',messages:[{role:'user',content:'本轮状态：坐标 1'}],tools:[{name:'observe',description:'观察',parameters:{type:'object',properties:{}}}]};
const frame=x=>'data: '+JSON.stringify(x)+'\n\n';
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-cache-')),store=new Store(directory);t.after(async()=>{await store.context.drain();store.close();await fs.rm(directory,{recursive:true,force:true});});return {store,role:store.roles()[0].id};}
const receipt=(read=0)=>providerUsage(config,{prompt_tokens:2000,completion_tokens:2,prompt_tokens_details:{cached_tokens:read}});

test('unknown and invalid numeric values never become reported zero',()=>{
 for(const value of [null,undefined,'',false,true,' ',NaN,Infinity,-1,1.5,{},'1e3'])assert.equal(tokenNumber(value),null);
 assert.equal(tokenNumber('0'),0);assert.equal(tokenNumber(3),3);
 const u=providerUsage(config,{prompt_tokens:null,completion_tokens:false,prompt_tokens_details:{cached_tokens:''},secret:'do-not-save'});
 assert.equal(u.input,null);assert.equal(u.output,null);assert.equal(u.cacheRead,null);assert.equal(u.cacheStatus,'unknown');assert.ok(!JSON.stringify(u).includes('do-not-save'));
});
test('Anthropic partial components retain a budget lower bound and do not invent a total',async t=>{
 const {store}=await fixture(t);const u=providerUsage({protocol:'anthropic'},{input_tokens:100,cache_read_input_tokens:1000});
 assert.equal(u.input,null);assert.equal(u.knownInput,1100);assert.equal(u.cacheWrite,null);assert.equal(u.inputComplete,false);
 store.event('usage',u);savePreferences(store,{dailyInput:1000});assert.throws(()=>checkDailyBudget(store,Date.now()),/用量上限/);
 const r=usageReport(store).today;assert.equal(r.input,1100);assert.equal(r.partialInput,1);assert.equal(r.cacheReadRate,null);assert.equal(r.cacheRequestRate,1);
});
test('DeepSeek aliases reconstruct complete inputs and exclude conflicting receipts',()=>{
 const u=providerUsage(config,{prompt_cache_hit_tokens:700,prompt_cache_miss_tokens:'300'});assert.equal(u.input,1000);assert.equal(u.cacheRead,700);assert.equal(u.uncachedInput,300);
 const bad=providerUsage(config,{prompt_tokens:900,prompt_cache_hit_tokens:700,prompt_cache_miss_tokens:300});assert.equal(bad.cacheConsistent,false);assert.equal(summarizeUsage([bad]).cacheRequestRate,null);
 assert.equal(providerUsage(config,{prompt_tokens:100,prompt_cache_hit_tokens:90,prompt_tokens_details:{cached_tokens:20}}).cacheConsistent,false);
 assert.equal(providerUsage(config,{prompt_tokens:1,prompt_tokens_details:{cached_tokens:2}}).cacheStatus,'unknown');
});
test('OpenAI newer write receipts preserve complete accounting and original numeric fields',()=>{
 const u=providerUsage({protocol:'responses'},{input_tokens:15000,input_tokens_details:{cached_tokens:12000,cache_write_tokens:3000}});assert.equal(providerUsage({protocol:'responses'},{input_tokens_details:{cache_write_tokens:3000}}).knownInput,3000);assert.equal(u.cacheWrite,3000);assert.equal(u.uncachedInput,0);assert.equal(u.usageEvidence['input_tokens_details.cache_write_tokens'],3000);
 assert.equal(providerUsage(config,{prompt_tokens:100,prompt_tokens_details:{cached_tokens:90,cache_write_tokens:20}}).cacheConsistent,false);
});
test('weighted token and request ratios use different denominators and exclude legacy rows',()=>{
 const r=summarizeUsage([receipt(1000),providerUsage(config,{prompt_tokens:100, prompt_tokens_details:{cached_tokens:0}}),{input:9000,cacheRead:9000},providerUsage(config,{prompt_tokens:10000})]);
 assert.equal(r.cacheReadRate,1000/2100);assert.equal(r.cacheRequestRate,.5);assert.equal(r.cacheSampleCount,2);assert.equal(r.legacyRequests,1);assert.equal(r.input,21100);
});
test('usage filters do not shrink the real daily budget and legacy rows stay untouched',async t=>{
 const {store}=await fixture(t);store.event('usage',{...receipt(1000),model:'one',endpointHash:'A',kind:'chat'});store.event('usage',{...receipt(0),model:'two',endpointHash:'B',kind:'vision'});store.event('usage',{input:300,model:'old'});
 const before=store.db.prepare("SELECT json FROM events WHERE type='usage'").all();const r=usageReport(store,Date.now(),{model:'one',endpoint:'A',kind:'chat'});assert.equal(r.today.requests,1);assert.equal(r.budgetToday.input,4300);assert.deepEqual(store.db.prepare("SELECT json FROM events WHERE type='usage'").all(),before);
});
test('automatic enhancements require exact official HTTPS host, matching protocol and recognized model',()=>{
 assert.equal(cacheSupport(config).effective,'openai-routing');
 for(const url of ['https://api.openai.com.evil.test','http://api.openai.com','https://api.openai.com:444','https://user@api.openai.com','https://relay.test/v1'])assert.equal(cacheSupport({...config,url}).effective,'observe');
 assert.equal(cacheSupport({...config,protocol:'anthropic'}).effective,'observe');assert.equal(cacheSupport({...config,model:'custom'}).effective,'managed');
 assert.equal(cacheSupport({...config,url:'https://api.deepseek.com',model:'deepseek-chat'}).effective,'managed');assert.equal(cacheSupport({...config,url:'https://generativelanguage.googleapis.com',protocol:'gemini'}).effective,'managed');
 assert.equal(cacheSupport({...config,url:'https://relay.test',cachePolicy:'openai-routing'}).effective,'openai-routing');assert.throws(()=>cacheSupport({...config,cachePolicy:'anthropic-5m'}),/不匹配/);
 assert.equal(encodeRequest({...config,cachePolicy:'observe'},input).prompt_cache_key,undefined);
});
test('routing keys remain stable across dynamic input but separate roles, worlds, tools and models',()=>{
 const c={...config,cacheScope:{role:'R',world:'W',kind:'chat',mode:'companion'}},key=encodeRequest(c,input).prompt_cache_key;assert.ok(key.length<=64);
 assert.equal(encodeRequest(c,{...input,messages:[{role:'user',content:'位置变了'}]}).prompt_cache_key,key);
 for(const patch of [{model:'gpt-4o'},{cacheScope:{...c.cacheScope,role:'S'}},{cacheScope:{...c.cacheScope,world:'B'}},{cacheScope:{...c.cacheScope,kind:'summary'}},{toolMode:'json'}])assert.notEqual(encodeRequest({...c,...patch},input).prompt_cache_key,key);
 assert.notEqual(encodeRequest(c,{...input,system:'新的人设'}).prompt_cache_key,key);assert.notEqual(encodeRequest(c,{...input,tools:[]}).prompt_cache_key,key);
});
test('Anthropic marks only fixed system text in native, JSON and chat modes',()=>{
 for(const toolMode of ['native','json','chat']){const c={...config,url:'https://api.anthropic.com',model:'claude-sonnet-4-5',protocol:'anthropic',toolMode},d=describeContext(c,input);assert.equal(d.requestBody.system[0].cache_control.type,'ephemeral');assert.equal(d.requestBody.messages.some(m=>JSON.stringify(m).includes('cache_control')),false);assert.ok(d.requestBody.system[0].text.includes(input.system));assert.equal(d.cacheProfile.markers.length,1);}
});
test('test output caps are encoded using each protocol without changing normal chat limits',()=>{
 for(const protocol of ['openai','responses','anthropic','gemini']){const b=encodeRequest({...config,protocol,cachePolicy:'observe'},{...input,maxOutputTokens:256});assert.equal(b.max_tokens??b.max_output_tokens??b.generationConfig?.maxOutputTokens,256);}
 assert.equal(encodeRequest({...config,model:'gpt-5.1'},{...input,maxOutputTokens:256}).max_completion_tokens,256);assert.throws(()=>encodeRequest(config,{...input,maxOutputTokens:9999}));
});
test('stream usage merges partial nested updates and preserves receipts on failure',async()=>{
 const events=[{choices:[],usage:{prompt_tokens:2000,prompt_tokens_details:{cached_tokens:1000}}},{choices:[{delta:{content:'收到'},finish_reason:'stop'}],usage:{completion_tokens:2,prompt_tokens_details:{audio_tokens:0}}}];const result=await readProviderStream(new Response(events.map(frame).join('')),'openai');assert.equal(result.usage.prompt_tokens_details.cached_tokens,1000);assert.equal(result.usage.prompt_tokens,2000);
 await assert.rejects(readProviderStream(new Response(frame({type:'response.failed',response:{usage:{input_tokens:55,input_tokens_details:{cached_tokens:20}}}})),'responses'),e=>e.providerStreamUsage.input_tokens===55&&e.providerStreamUsage.input_tokens_details.cached_tokens===20);
});
test('unsupported enhancement stops after one HTTP request and suggests explicit observation fallback',async t=>{
 let calls=0;const server=http.createServer((req,res)=>{calls++;res.writeHead(400);res.end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 await assert.rejects(complete({...config,url:'http://127.0.0.1:'+server.address().port,cachePolicy:'openai-routing'},input),e=>/仅观测/.test(e.message)&&e.usage.normalizationVersion===2&&e.usage.input===null);assert.equal(calls,1);
});
test('cache verification sends three serial synthetic requests and leaves chat, memories and tasks untouched',async t=>{
 const {store,role}=await fixture(t);store.memory(role,'','fact','private memory');let calls=0,inflight=0,maxInflight=0;const inputs=[];
 const request=async(c,i,s,onText)=>{calls++;maxInflight=Math.max(maxInflight,++inflight);inputs.push(i);onText('收');await new Promise(r=>setImmediate(r));inflight--;return {content:'收到',calls:[],usage:receipt(calls===1?0:1900)};};request.contextSource='fixture';
 const runner=new CacheTest({store,provider:()=>config,context:()=>({world:'world'}),request});t.after(()=>runner.close());const preview=runner.preview(role);assert.equal(calls,0);assert.ok(!preview.system.includes('private memory'));const record=runner.start(role,preview.id);assert.throws(()=>runner.start(role,preview.id),e=>e.status===409);await runner.job;
 assert.equal(record.status,'completed');assert.equal(calls,3);assert.equal(maxInflight,1);assert.ok(inputs.every(i=>i.maxOutputTokens===256&&i.system===preview.system&&i.tools.length===0));assert.equal(store.conversation(role,'world').length,0);assert.equal(store.memories(role).length,1);assert.equal(store.db.prepare('SELECT COUNT(*) n FROM tasks').get().n,0);assert.equal(record.results.length,3);assert.equal(store.context.list(role).requests[0].source,'fixture');assert.equal(store.get('dailyAttempts').count,3);assert.equal(usageReport(store).today.requests,3);
});
test('cancellation between rounds stops further requests and close drains active request',async t=>{
 const {store,role}=await fixture(t);let calls=0,runner;const request=async()=>{calls++;return {content:'收到',calls:[],usage:receipt()};};runner=new CacheTest({store,provider:()=>config,context:()=>({}),request,emit:e=>{if(e.type==='usage')runner.cancel();}});runner.start(role,runner.preview(role).id);await runner.job;assert.equal(calls,1);assert.equal(runner.status(role).status,'cancelled');
 const pending=new CacheTest({store,provider:()=>config,context:()=>({}),request:(_c,_i,s)=>new Promise((_,reject)=>s.addEventListener('abort',()=>reject(s.reason),{once:true}))});pending.start(role,pending.preview(role).id);await pending.close();assert.equal(pending.status(role).status,'cancelled');assert.equal(store.context.pending.size,0);await runner.close();
});
test('cache verification respects daily and hourly limits, preview freshness and provider errors',async t=>{
 const {store,role}=await fixture(t);let calls=0,c={...config};const runner=new CacheTest({store,provider:()=>c,context:()=>({}),request:async()=>{calls++;return {content:'收到',usage:receipt()};}});t.after(()=>runner.close());let p=runner.preview(role);c={...c,model:'gpt-4o'};assert.throws(()=>runner.start(role,p.id),/变化/);p=runner.preview(role);runner.previews.get(role).created-=300001;assert.throws(()=>runner.start(role,p.id),/过期/);
 savePreferences(store,{dailyRequests:1});runner.start(role,runner.preview(role).id);await runner.job;assert.equal(calls,1);assert.equal(runner.status(role).status,'failed');assert.match(runner.status(role).error,/用量上限/);
 savePreferences(store,{dailyRequests:10});c.hourlyLimit=1;runner.start(role,runner.preview(role).id);await runner.job;assert.equal(calls,1);assert.match(runner.status(role).error,/每小时/);
 c.hourlyLimit=120;runner.request=async()=>{calls++;throw Error('unsupported');};runner.start(role,runner.preview(role).id);await runner.job;assert.equal(calls,2);assert.equal(runner.status(role).results.length,1);
});
test('cache API enforces CSRF, separate policy validation, and cancellation on role or provider changes',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-cache-api-'));let calls=0;const request=(_c,_i,s)=>{calls++;return new Promise((_,reject)=>s.addEventListener('abort',()=>reject(s.reason),{once:true}));};request.contextSource='fixture';
 const app=await createApp({directory,port:0,companionProfiles:[],companionRequest:request});t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});const state=await fetch(app.url+'/api/state').then(r=>r.json()),post=(url,b,auth=true)=>fetch(app.url+url,{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-together-token':state.csrf}:{})},body:JSON.stringify(b)}),cache=b=>post('/api/plus/cache-test',b).then(r=>r.json());
 assert.equal((await post('/api/plus/cache-test',{operation:'start'},false)).status,403);assert.equal((await post('/api/provider',{...config,cachePolicy:'auto'})).status,200);
 assert.equal((await post('/api/vision-provider',{enabled:true,protocol:'openai',url:config.url,model:'gpt-4o',toolMode:'chat',cachePolicy:'anthropic-5m'})).status,400);assert.equal((await post('/api/vision-provider',{enabled:true,protocol:'openai',url:config.url,model:'gpt-4o',toolMode:'chat',cachePolicy:'observe'})).status,200);
 let p=await cache({operation:'preview'});await cache({operation:'start',id:p.id});assert.equal(calls,1);const role=app.store.saveRole({...app.store.role(state.selectedRole),id:undefined,name:'another'});await post('/api/roles/select',{id:role.id});await app.store.context.drain();await new Promise(r=>setImmediate(r));assert.equal(app.store.get('cacheTests')[0].status,'cancelled');assert.equal(calls,1);
 p=await cache({operation:'preview'});await cache({operation:'start',id:p.id});await post('/api/provider',{...config,cachePolicy:'observe'});await app.store.context.drain();await new Promise(r=>setImmediate(r));assert.equal(app.store.get('cacheTests')[0].status,'cancelled');assert.equal(calls,2);const s=await fetch(app.url+'/api/state').then(r=>r.json());assert.equal(s.provider.cachePolicy,'observe');assert.equal(s.visionProvider.cachePolicy,'observe');
});

test('local HTTP end-to-end benchmark encodes all protocols and persists normalized receipts',async t=>{
 const {store,role}=await fixture(t);let protocol,wire=[];
 const server=http.createServer(async(req,res)=>{const parts=[];for await(const p of req)parts.push(p);const body=JSON.parse(Buffer.concat(parts));wire.push(body);const read=wire.length===1?0:1900;let data;
  if(protocol==='openai')data={choices:[{message:{content:'收到'}}],usage:{prompt_tokens:2000,completion_tokens:2,prompt_cache_hit_tokens:read,prompt_cache_miss_tokens:2000-read}};
  if(protocol==='responses')data={output:[{type:'message',content:[{type:'output_text',text:'收到'}]}],usage:{input_tokens:2000,output_tokens:2,input_tokens_details:{cached_tokens:read,cache_write_tokens:0}}};
  if(protocol==='anthropic')data={content:[{type:'text',text:'收到'}],usage:{input_tokens:100,output_tokens:2,cache_read_input_tokens:read,cache_creation_input_tokens:1900-read}};
  if(protocol==='gemini')data={candidates:[{content:{parts:[{text:'收到'}]}}],usageMetadata:{promptTokenCount:2000,candidatesTokenCount:2,cachedContentTokenCount:read}};
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(data));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 for(protocol of ['openai','responses','anthropic','gemini']){
  wire=[];const c={...config,protocol,url:'http://127.0.0.1:'+server.address().port,cachePolicy:protocol==='anthropic'?'anthropic-5m':['openai','responses'].includes(protocol)?'openai-routing':'auto'},runner=new CacheTest({store,provider:()=>c,context:()=>({world:'test'})});
  runner.start(role,runner.preview(role).id);await runner.job;const record=runner.status(role);assert.equal(record.status,'completed',record.error);assert.equal(wire.length,3);assert.ok(record.results.every(r=>r.usage.input===2000&&r.usage.normalizationVersion===2));assert.equal(record.results[1].usage.cacheRead,1900);assert.ok(record.results.every(r=>r.firstTextMs===null));
  if(protocol==='anthropic')assert.equal(wire[0].system[0].cache_control.type,'ephemeral');if(['openai','responses'].includes(protocol))assert.equal(wire[0].prompt_cache_key,wire[1].prompt_cache_key);
  assert.ok(wire.every(b=>(b.max_tokens??b.max_output_tokens??b.generationConfig?.maxOutputTokens)===256));const detail=store.context.get(role,record.results[1].requestId).detail;assert.ok(Object.keys(detail.usageEvidence).length>0);await runner.close();
 }
});

test('cache runs interrupted by service restart are terminal and never resume requests',async t=>{
 const {store,role}=await fixture(t);store.set('cacheTests',[{id:'interrupted',role,status:'running',results:[]}]);let calls=0;const runner=new CacheTest({store,provider:()=>config,context:()=>({}),request:async()=>{calls++;}});assert.equal(runner.status(role).status,'interrupted');assert.equal(calls,0);assert.equal(runner.current,null);await runner.close();
});

test('a new owner chat cancels a pending benchmark without starting another benchmark round',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-cache-chat-'));let calls=0;
 const request=(_c,_i,signal)=>{calls++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));};request.contextSource='fixture';
 const app=await createApp({directory,port:0,companionProfiles:[],companionRequest:request});t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});const state=await fetch(app.url+'/api/state').then(r=>r.json()),post=(route,data)=>fetch(app.url+route,{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify(data)}).then(r=>r.json());
 await post('/api/provider',config);const chat=app.companion.chat;chat.attach({profileId:'test',clientId:'test',world:'test',pack:'fixture',role:app.store.role(state.selectedRole)});chat.update(1,{active:true,health:20,food:20,dimension:'overworld'});const p=await post('/api/plus/cache-test',{operation:'preview'});await post('/api/plus/cache-test',{operation:'start',id:p.id});assert.equal(calls,1);await chat.receive('先安静一会');await app.store.context.drain();await new Promise(r=>setImmediate(r));assert.equal(app.store.get('cacheTests')[0].status,'cancelled');assert.equal(calls,1);
});
