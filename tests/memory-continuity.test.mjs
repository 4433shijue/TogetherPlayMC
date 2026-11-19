import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {proposeMemory,confirmMemory,memoryMeta,reviseMemory,recallConversation} from '../src/memory-continuity.mjs';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-memory-')),store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});return {store,role:store.roles()[0].id};}
test('replacement waits for confirmation, transfers pins and preserves the old record',async t=>{
 const {store,role}=await fixture(t),id=store.memory(role,'','fact','喜欢住海边');store.set('pinnedMemories:'+role,[id]);
 const candidate=proposeMemory(store,{role,text:'现在更喜欢住森林',quote:'我现在更喜欢住森林',category:'preference',replaces:id});
 assert.equal(candidate.status,'pending');assert.deepEqual(store.relevantMemories(role,'world','','喜欢').map(m=>m.id),[id]);
 confirmMemory(store,role,candidate.id);assert.equal(memoryMeta(store,id).status,'superseded');assert.equal(store.memories(role).length,2);
 assert.deepEqual(store.relevantMemories(role,'world','','喜欢').map(m=>m.id),[candidate.id]);assert.deepEqual(store.get('pinnedMemories:'+role),[candidate.id]);
});
test('replacement refuses another world and detects edits since the suggestion',async t=>{
 const {store,role}=await fixture(t),id=store.memory(role,'world:A','place','家在海边','user',undefined,'overworld');
 assert.throws(()=>proposeMemory(store,{role,world:'world:B',dimension:'overworld',kind:'place',text:'改了',replaces:id}),/相同范围/);
 const p=proposeMemory(store,{role,world:'world:A',dimension:'overworld',kind:'place',text:'家在森林',replaces:id});store.memory(role,'world:A','place','家在山上','user',id,'overworld');
 assert.throws(()=>confirmMemory(store,role,p.id),/原记忆已被修改/);assert.equal(memoryMeta(store,id).status,'active');
});
test('manual revisions can be restored without erasing later text',async t=>{
 const {store,role}=await fixture(t),id=store.memory(role,'','fact','第一版');store.memory(role,'','fact','第二版','user',id);reviseMemory(store,role,id,0);
 assert.equal(store.memories(role)[0].text,'第一版');assert.equal(store.get('memoryRevisions:'+id)[0].text,'第二版');
});
test('historical retrieval finds a long message tail beyond recent context, within the current world',async t=>{
 const {store,role}=await fixture(t);store.event('owner_chat',{text:'一路上的风景。'.repeat(100)+'我们约好下次去找樱花森林。'},role,'world:A');
 for(let i=0;i<220;i++)store.event('reply',{text:'今天继续走走。'},role,'world:A');
 store.event('owner_chat',{text:'另一个存档的樱花森林秘密'},role,'world:B');
 const found=recallConversation(store,role,'world:A','樱花森林');assert.ok(found.some(r=>r.text.includes('约好下次去找樱花森林')));assert.ok(found.every(r=>!r.text.includes('秘密')));assert.ok(found.reduce((n,r)=>n+r.text.length,0)<=6000);
});
