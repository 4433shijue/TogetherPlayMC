import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Store} from '../src/store.mjs';
import {describeContext} from '../src/request-context.mjs';
import {promptObservation,promptEvidence} from '../src/prompt-context.mjs';
import {encodeRequest} from '../src/providers.mjs';
import {createApp} from '../src/server.mjs';

const config={protocol:'openai',model:'fixture',toolMode:'native',key:'secret-for-context-test'};
const input={system:'角色：小伴',messages:[{role:'user',content:'今晚住哪儿？'}],tools:[]};
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-context-')),store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});return {store,dir,role:store.roles()[0].id};}
test('trace freezes the exact outgoing text and usage before later input mutations',async t=>{
 const {store,role}=await fixture(t);const request=structuredClone(input);let finish;
 const pending=store.context.run(config,request,undefined,{role,kind:'chat'},()=>new Promise(r=>finish=r));
 const live=store.context.list(role).requests[0];assert.equal(live.status,'running');request.messages[0].content='后来的问题';
 finish({content:'河边吧。',calls:[],usage:{input:100,output:8,cached:0}});const result=await pending,record=store.context.get(role,result.requestId);
 assert.deepEqual(record.detail.requestBody,encodeRequest(config,input));assert.equal(record.meta.usage.cached,0);assert.equal(record.meta.status,'completed');assert.ok(!JSON.stringify(record).includes(config.key));
});
for(const protocol of ['openai','responses','anthropic','gemini'])for(const toolMode of ['native','json','chat'])test(`context keeps ${protocol}/${toolMode} wire shape without image binary or credentials`,()=>{
 const png=Buffer.from('not-a-secret-image-fixture').toString('base64');
 const detail=describeContext({...config,protocol,toolMode},{...input,system:'secret-for-context-test',messages:[{role:'user',content:'看看',images:[{mime:'image/png',data:png}]}]});
 assert.equal(detail.imageCount,1);const serialized=JSON.stringify(detail);assert.ok(!serialized.includes(png));assert.ok(!serialized.includes(config.key));assert.match(serialized,/sha256/);assert.ok(detail.requestBody);
 if(toolMode==='json')assert.ok(detail.sections.some(s=>s.id==='protocol-format'));
});
test('stable prefix diagnostics are canonical and separate from dynamic content',()=>{
 const stableSections=[{id:'rules',label:'规则',location:'system',text:'固定规则'}];
 const one=describeContext(config,{system:'固定规则',messages:[{role:'user',content:'今天下雨'}],tools:[{name:'tool',parameters:{z:1,a:2}}]},stableSections);
 const two=describeContext(config,{system:'固定规则',messages:[{role:'user',content:'明天晴天'}],tools:[{name:'tool',parameters:{a:2,z:1}}]},stableSections);
 assert.equal(one.cacheProfile.stablePrefixHash,two.cacheProfile.stablePrefixHash);assert.equal(one.cacheProfile.stablePrefixCharacters,two.cacheProfile.stablePrefixCharacters);
 const changed=describeContext(config,{system:'新的固定规则',messages:[],tools:[{name:'tool',parameters:{a:2,z:1}}]},stableSections);assert.notEqual(changed.cacheProfile.stablePrefixHash,one.cacheProfile.stablePrefixHash);
 const changedScope=describeContext({...config,toolMode:'chat'},{system:'固定规则',messages:[],tools:[]},stableSections);assert.notEqual(changedScope.cacheProfile.stablePrefixHash,one.cacheProfile.stablePrefixHash);
});
test('request metadata records stable prefix changes without storing credentials',async t=>{
 const {store,role}=await fixture(t),config={protocol:'openai',model:'fixture',toolMode:'native',key:'diagnostic-secret'},request=async()=>({content:'好',calls:[],usage:{input:12,output:2,cacheRead:4,cacheWrite:0,uncachedInput:8,cacheStatus:'hit'}});
 const first=await store.context.run(config,{system:'固定规则',messages:[{role:'user',content:'第一句'}],tools:[]},undefined,{role,world:'A'},request);
 const second=await store.context.run(config,{system:'固定规则',messages:[{role:'user',content:'第二句'}],tools:[]},undefined,{role,world:'A'},request);
 const one=store.context.get(role,first.requestId),two=store.context.get(role,second.requestId);assert.equal(one.meta.stablePrefixChangeReason,'first-request');assert.equal(two.meta.stablePrefixChangeReason,'unchanged');assert.equal(one.meta.stablePrefixHash,two.meta.stablePrefixHash);assert.equal(two.meta.usage.cacheRead,4);assert.equal(two.meta.usage.cacheStatus,'hit');assert.ok(!JSON.stringify(two).includes(config.key));
});
test('unknown usage stays unknown, errors and cancelled late responses remain visible',async t=>{
 const {store,role}=await fixture(t);
 await assert.rejects(store.context.run(config,input,undefined,{role},async()=>{throw new Error('offline');}));
 const failed=store.context.list(role).requests[0];assert.equal(failed.status,'failed');assert.equal(failed.usage.input,null);
 const controller=new AbortController();let finish;const pending=store.context.run(config,input,controller.signal,{role},()=>new Promise(r=>finish=r));controller.abort();finish({content:'迟到',calls:[],usage:{input:5,output:2}});
 const result=await pending,record=store.context.get(role,result.requestId);assert.equal(record.meta.status,'cancelled');assert.equal(record.detail.response.discarded,true);assert.equal(record.meta.usage.input,5);
});
test('old usage cannot be presented as reconstructed context and role isolation is enforced',async t=>{
 const {store,role}=await fixture(t),other=store.saveRole({name:'另一位'}).id;store.event('usage',{model:'old',input:57613,output:31},role,'A');
 const record=store.context.list(role).requests[0];assert.equal(record.full,false);assert.equal(store.context.get(role,record.id).detail,null);assert.throws(()=>store.context.get(other,record.id));
});
test('JSON tool definitions are counted only once and empty tool arrays add no characters',()=>{
 const plain=describeContext(config,input);assert.equal(plain.breakdown.find(p=>p.id==='messages').characters,input.messages[0].content.length);assert.ok(!plain.breakdown.some(p=>p.id==='tool-definitions'));
 const json=describeContext({...config,toolMode:'json'},{...input,tools:[{name:'search',parameters:{type:'object'}}]});assert.ok(json.sections.find(s=>s.id==='protocol-format').text.includes('search'));assert.ok(!json.breakdown.some(p=>p.id==='tool-definitions'));
});
test('shutdown drains in-flight traces and linked rounds stay in their role',async t=>{
 const {store,role}=await fixture(t);let finish,drained=false;
 const first=await store.context.run(config,input,undefined,{role,group:'dialogue',round:1},async()=>({content:'查资料',calls:[],usage:{input:8}}));
 const second=store.context.run(config,input,undefined,{role,group:'dialogue',round:2},()=>new Promise(r=>finish=r));
 const draining=store.context.drain().then(()=>drained=true);await Promise.resolve();assert.equal(drained,false);finish({content:'完成',calls:[],usage:{input:10}});await second;await draining;
 assert.equal(store.context.get(role,first.requestId).related.length,2);assert.throws(()=>store.context.get('other',first.requestId));assert.equal(store.context.pending.size,0);
});
test('completed records are retained within count and restarted in-flight requests are marked interrupted',async t=>{
 const {store,role,dir}=await fixture(t);for(let i=0;i<103;i++)await store.context.run(config,input,undefined,{role},async()=>({content:'ok',calls:[],usage:{}}));
 assert.equal(store.db.prepare('SELECT count(*) AS n FROM model_requests').get().n,100);
 const meta={id:'unfinished',role,status:'running',created:new Date().toISOString()};store.db.prepare('INSERT INTO model_requests VALUES (?,?,?,?,?,?,?)').run(meta.id,meta.created,role,'','running',JSON.stringify(meta),'{}');
 const reopened=new Store(dir);assert.equal(reopened.context.get(role,'unfinished').meta.status,'interrupted');reopened.close();
});
test('large quest lists stay local while prompt contains truthful counts and relevant achievements',()=>{
 const quests=Array.from({length:1065},(_,i)=>'task-'+i),o={health:20,position:{x:1,y:64,z:2},inventory:[{id:'wood',count:2}],questProgressKnown:true,questCompletedKnown:false,advancementsKnown:true,unlockedQuests:quests,startableQuests:quests,visibleQuests:quests,completedQuests:[],advancements:[{id:'minecraft:story/mine_stone',title:'石器时代'}]};
 const compact=promptObservation(o,'石器时代');assert.equal(compact.questSummary.visible,1065);assert.equal(compact.questSummary.completedKnown,false);assert.equal(compact.advancementSummary.relevant.length,1);assert.deepEqual(compact.inventory,o.inventory);assert.ok(!JSON.stringify(compact).includes('task-1064'));assert.equal(o.unlockedQuests.length,1065);
});
test('long retrieved excerpts have a visible truncation marker and a bounded aggregate',()=>{
 const docs=promptEvidence(Array.from({length:8},(_,i)=>({title:'资料'+i,text:'材料'.repeat(10000)})));assert.ok(docs.every(d=>d.excerptTruncated));assert.ok(docs.reduce((n,d)=>n+d.text.length,0)<=18000);
});
test('context API authenticates reads, persists a real local call, and preview never calls the model',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-context-api-'));let calls=0;
 const request=async()=>{calls++;return {content:'陪你看河。',calls:[],usage:{input:50,output:8}};};request.contextSource='fixture';
 const app=await createApp({directory:dir,port:0,companionProfiles:[],companionRequest:request});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const state=await fetch(app.url+'/api/state').then(r=>r.json()),headers={'x-together-token':state.csrf,'content-type':'application/json'};
 assert.equal((await fetch(app.url+'/api/context/requests')).status,403);
 const c=app.companion.chat;c.attach({profileId:'p',clientId:'c',playSessionId:'s',world:'A',pack:'p',role:app.store.roles()[0]});c.update(1,{dimension:'minecraft:overworld',active:true,questProgressKnown:true,unlockedQuests:['do-not-send-raw-id']});
 const preview=await fetch(app.url+'/api/context/preview',{method:'POST',headers,body:JSON.stringify({text:'今晚住哪儿？'})}).then(r=>r.json());
 assert.equal(preview.meta.status,'preview');assert.equal(calls,0);assert.ok(!JSON.stringify(preview).includes('do-not-send-raw-id'));
 await c.receive('今晚住哪儿？');assert.equal(calls,1);const list=await fetch(app.url+'/api/context/requests',{headers}).then(r=>r.json());assert.equal(list.total,1);assert.equal(list.requests[0].source,'fixture');
 const result=await fetch(app.url+'/api/context/request?id='+list.requests[0].id,{headers}).then(r=>r.json());assert.ok(result.detail.sections.some(s=>s.id==='observation'));assert.ok(result.detail.messages.at(-1).content.endsWith('今晚住哪儿？'));assert.ok(result.detail.sections.find(s=>s.id==='observation').location==='current-message');
 assert.equal(app.store.conversation(state.selectedRole,'A').at(-1).data.requestId,result.meta.id);
});
