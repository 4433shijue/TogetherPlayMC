import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {inventoryTotals,ActionEngine} from '../src/actions.mjs';
import {CompanionSession,autonomousActionAllowed} from '../src/session.mjs';
import {Store} from '../src/store.mjs';
import {importCard} from '../src/cards.mjs';

test('split inventory stacks never count existing stock as new collection',()=>{
  const before=inventoryTotals([{name:'oak_planks',count:64},{name:'oak_planks',count:64},{name:'cobblestone',count:3}]);
  const after=inventoryTotals([{name:'oak_planks',count:40},{name:'oak_planks',count:64},{name:'oak_planks',count:24},{name:'cobblestone',count:4}]);
  assert.deepEqual(after.map(i=>({name:i.name,count:i.count-(before.find(b=>b.name===i.name)?.count??0)})).filter(i=>i.count>0),[{name:'cobblestone',count:1}]);
});
test('home lookup skips a newer home from a different dimension',()=>{
  const bot=new EventEmitter();bot.game={dimension:'overworld'};
  const engine=new ActionEngine(bot,{owner:'Host',role:{id:'r'},world:'A',store:{memories:()=>[{world:'A',kind:'home',text:'{"dimension":"the_nether","x":70}'},{world:'A',kind:'home',text:'{"dimension":"overworld","x":10}'}]}});
  assert.equal(engine.home().x,10);bot.game.dimension='the_nether';assert.equal(engine.home().x,70);
});
test('autonomy restricts small chores separately from free goals',()=>{
  assert.equal(autonomousActionAllowed('close',{action:'collect',count:1}),false);
  assert.equal(autonomousActionAllowed('balanced',{action:'collect',count:8}),true);
  assert.equal(autonomousActionAllowed('balanced',{action:'collect',count:9}),false);
  assert.equal(autonomousActionAllowed('balanced',{action:'build'}),false);
  assert.equal(autonomousActionAllowed('free',{action:'build'}),true);
});
test('chat history survives many action logs and stays scoped to its role and world',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-chat-')),store=new Store(directory);t.after(async()=>{store.close();await fs.rm(directory,{recursive:true,force:true});});const role=store.roles()[0];
  store.event('owner_chat',{text:'这就是我们的家'},role.id,'A');store.event('reply',{text:'记住啦'},role.id,'A');store.event('reply',{text:'另一个世界'},role.id,'B');
  for(let n=0;n<100;n++)store.event('action_result',{ok:true},role.id,'A');
  assert.deepEqual(store.conversation(role.id,'A').map(e=>e.data.text),['这就是我们的家','记住啦']);
});
test('a model response arriving after stop cannot execute or reply; leaving clears world identity',async t=>{
  const session=new CompanionSession({store:{get:()=>null,event:()=>({})},provider:()=>({toolMode:'native'}),emit(){}});t.after(()=>session.close());let actions=0,replies=0,finish;
  session.engine={stop(){},permissions:{},run(){actions++;}};session.system=()=>'';session.say=()=>replies++;session.request=()=>new Promise(r=>finish=r);session.world='A';session.port=1234;
  const pending=session.turn('采点木头');session.stop();finish({content:'去采木头啦',calls:[{name:'game_action',arguments:{action:'collect',item:'logs'},id:'c'}]});await pending;
  assert.equal(actions,0);assert.equal(replies,0);session.leave();assert.equal(session.world,null);assert.equal(session.port,null);
});
test('V3 PNG character card metadata imports without executing scripts',()=>{
  const card={spec:'chara_card_v3',data:{name:'PNG 伙伴',first_mes:'一起出发',extensions:{script:'throw new Error("never execute")'}}};
  const chunk=(type,data)=>{const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);return out;};
  const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('tEXt',Buffer.from('ccv3\0'+Buffer.from(JSON.stringify(card)).toString('base64'))),chunk('IEND',Buffer.alloc(0))]);
  const result=importCard(png);assert.equal(result.role.name,'PNG 伙伴');assert.equal(result.role.greeting,'一起出发');assert.ok(result.warnings.length);
});
test('side chat excludes tool-only history and finished practice pauses autonomous billing',async t=>{
  const session=new CompanionSession({store:{get:()=>null,set(){},event:()=>({})},provider:()=>({toolMode:'native',model:'test'}),emit(){}});t.after(()=>session.close());
  session.messages=[{role:'assistant',content:'去采木头',calls:[{id:'c1'}]},{role:'tool',callId:'c1',content:'result'},{role:'assistant',content:'拿到了'}];session.system=()=>'';session.say=()=>{};let request;
  session.request=async input=>{request=structuredClone(input);return {content:'在呢',calls:[]};};await session.turn('今天心情真好',{side:true});assert.ok(request.messages.every(m=>m.role!=='tool'&&!m.calls));
  session.practice={status:'running',results:{},calls:30};session.finishPractice('limit');assert.equal(session.paused,true);assert.equal(session.practice.status,'limit');
});
