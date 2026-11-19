import {appVersion} from '../src/version.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {Vec3} from 'vec3';
import minecraftData from 'minecraft-data';
import {Store} from '../src/store.mjs';
import {PlanJournal} from '../src/plans.mjs';
import {ActionEngine} from '../src/actions.mjs';
import {CompanionSession} from '../src/session.mjs';
import {createApp} from '../src/server.mjs';

async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-continuity-')),store=new Store(directory);
  store.testCleanups=[];t.after(async()=>{for(const cleanup of store.testCleanups.reverse())await cleanup();store.close();await fs.rm(directory,{recursive:true,force:true});});
  return {store,role:store.roles()[0],directory};
}
function game(store,role){
  const bot=new EventEmitter(),items=[],blocks=new Map();let goal=null;
  Object.assign(bot,{_client:new EventEmitter(),registry:minecraftData('1.20.1'),health:20,food:20,game:{dimension:'overworld'},entity:{id:1,position:new Vec3(0,64,0)},players:{Host:{username:'Host',entity:{id:2,position:new Vec3(4,64,0)}}},entities:{},
    inventory:{items:()=>items,emptySlotCount:()=>20},pathfinder:{setGoal(g){goal=g;},setMovements(m){this.movements=m;}},clearControlStates(){},
    blockAt:p=>blocks.get(p.toString())??{name:p.y<64?'stone':'air',boundingBox:p.y<64?'block':'empty',position:p},findBlocks:()=>[],quit(){},chat(){},
    equip:async()=>{},lookAt:async()=>{},attack(){},time:{timeOfDay:1000}
  });
  const engine=new ActionEngine(bot,{store,role,world:'world:A',owner:'Host'});
  const session=new CompanionSession({store,provider:()=>({protocol:'openai',url:'http://fixture.invalid',model:'fixture',toolMode:'native'}),emit(){}});
  Object.assign(session,{bot,engine,role,world:'world:A',owner:'Host',status:'connected',active:true,paused:false});clearInterval(session.timer);
  engine.pause=async()=>{};store.testCleanups.push(()=>session.close());
  return {bot,engine,session,items,blocks,getGoal:()=>goal};
}

test('plan survives restart, partial crafting and unreceived delivery never count as complete',async t=>{
  const {store,role,directory}=await fixture(t),j=new PlanJournal(store,role.id,'A','overworld');
  const p=j.start('做八块木板，再给我一块');j.outline(p.id,[{title:'制作木板',action:'craft',item:'oak_planks',count:8},{title:'交付木板',action:'give',item:'oak_planks',count:1}]);
  let state=j.record(p.id,{action:'craft',item:'oak_planks',count:8},{ok:true,created:4,complete:false});assert.equal(state.steps[0].status,'pending');assert.equal(state.steps[0].progress,4);
  j.record(p.id,{action:'craft',item:'oak_planks',count:4},{ok:true,created:4,complete:true});
  state=j.record(p.id,{action:'give',item:'oak_planks',count:1},{ok:true,received:0,complete:false});assert.equal(state.status,'running');assert.equal(state.steps[1].status,'pending');
  // A new process reconciles persisted running work, but does not execute it.
  const reopened=new Store(directory);store.testCleanups.push(()=>reopened.close());
  const after=new PlanJournal(reopened,role.id,'A','overworld');assert.equal(after.get(p.id).status,'interrupted');assert.equal(after.get(p.id).steps[0].status,'done');
  after.resume(p.id);state=after.record(p.id,{action:'give',item:'oak_planks',count:1},{ok:true,received:1,complete:true});assert.equal(state.status,'done');
});

test('plans are isolated by role, world and dimension and reject invented completion fields',async t=>{
  const {store,role}=await fixture(t),j=new PlanJournal(store,role.id,'A','overworld'),p=j.start('采木头');
  for(const other of [new PlanJournal(store,role.id,'B','overworld'),new PlanJournal(store,role.id,'A','the_nether'),new PlanJournal(store,'other','A','overworld')])assert.throws(()=>other.resume(p.id));
  assert.throws(()=>j.outline(p.id,[{title:'完成',action:'collect',item:'logs',status:'done'}]));
  assert.throws(()=>j.outline(p.id,[{title:'看看',action:'observe'}]));
  assert.throws(()=>j.outline(p.id,[{title:'随便执行',action:'eval'}]));
  j.outline(p.id,[{title:'采木头',action:'collect',item:'logs',count:2}]);
  assert.equal(j.record(p.id,{action:'craft',item:'oak_planks',count:2},{ok:true,created:2}).steps[0].status,'pending');
});

test('relevant old Chinese memories survive more than 150 newer records without leaking worlds or dimensions',async t=>{
  const {store,role}=await fixture(t);
  const old=store.memory(role.id,'','fact','喜欢在海边盖房子');store.db.prepare('UPDATE memories SET created=? WHERE id=?').run('2020-01-01T00:00:00.000Z',old);
  for(let i=0;i<180;i++)store.memory(role.id,'A','experience',`刚才整理第 ${i} 个背包格子`);
  store.memory(role.id,'B','experience','海岸有钻石');store.memory(role.id,'A','place','海岸传送门在下界','game',undefined,'the_nether');
  const result=store.relevantMemories(role.id,'A','overworld','我们去海岸搭房子吧');
  assert.equal(result[0].id,old);assert.ok(!result.some(m=>m.world==='B'||m.dimension==='the_nether'));
  assert.ok(result.reduce((sum,m)=>sum+m.text.length,0)<=6500);
});

test('work area constrains both destinations and path steps; named boxes grant no withdrawal rights',async t=>{
  const {store,role}=await fixture(t),{engine,bot,blocks,session}=game(store,role);
  engine.configure();engine.household.enable(12);assert.doesNotThrow(()=>engine.bounds(new Vec3(4,64,4)));assert.throws(()=>engine.bounds(new Vec3(13,64,0)),/工作区/);
  const exclusion=bot.pathfinder.movements.exclusionAreasStep.at(-1);assert.equal(exclusion({position:new Vec3(20,64,0)}),100);
  const p=new Vec3(2,64,0);blocks.set(p.toString(),{name:'chest',position:p});
  engine.household.register({name:'建材箱',category:'building',x:2,y:64,z:0});assert.equal(engine.household.permits(p,'deposit','oak_planks'),true);assert.equal(engine.household.permits(p,'withdraw','oak_planks'),false);assert.equal(engine.household.permits(p,'deposit','diamond_sword'),false);
  await assert.rejects(engine.chest({action:'chest',mode:'withdraw',x:2,y:64,z:0,item:'oak_planks',count:1},new AbortController().signal,{}),/授权/);
  bot.game.dimension='the_nether';assert.equal(engine.household.settings().containers.length,0);assert.equal(engine.household.contains(new Vec3(0,64,0)),false);
});

test('sorting deposits only surplus into assigned boxes and keeps equipment and named items',async t=>{
  const {store,role}=await fixture(t),{engine,items,blocks,session}=game(store,role);
  const p=new Vec3(2,64,0);blocks.set(p.toString(),{name:'chest',position:p});engine.household.register({name:'建材箱',category:'building',x:2,y:64,z:0});
  items.push({name:'oak_planks',count:40},{name:'diamond_sword',count:1},{name:'stone',count:64,nbt:{display:'纪念品'}},{name:'bread',count:20});
  const deposited=[];engine.chest=async a=>{deposited.push(a);return {count:a.count};};
  const result=await engine.organize(64,new AbortController().signal);assert.equal(result.moved,8);assert.equal(deposited.length,1);assert.equal(deposited[0].item,'oak_planks');assert.equal(deposited[0].count,8);
});

test('player disappearing pauses normal work but preserves an explicitly assigned bounded job',async t=>{
  const {store,role}=await fixture(t),{engine,bot,session}=game(store,role);
  const j=session.journal(),p=j.start('帮我采木头');session.planId=p.id;session.planDimension=p.dimension;engine.observeOwner();
  delete bot.players.Host.entity;session.ownerGone();assert.equal(j.get(p.id).status,'paused');assert.equal(session.separation.lastSeen.x,4);
  bot.players.Host.entity={id:2,position:new Vec3(4,64,0)};engine.household.enable(12);const next=j.start('在这里采木头');session.planId=next.id;session.planDimension=next.dimension;
  delete bot.players.Host.entity;session.ownerGone();assert.equal(j.get(next.id).status,'running');assert.equal(session.planId,next.id);
});

test('stop during reunion prevents automatic follow and subsequent ticks do not restart movement',async t=>{
  const {store,role}=await fixture(t),{engine,bot,session}=game(store,role);
  delete bot.players.Host.entity;session.separation={lastSeen:{x:4,y:64,z:0,dimension:'overworld',at:Date.now()},attempted:false,followWanted:true};
  let release,moves=0;engine.run=async()=>{moves++;return new Promise(r=>release=r);};const pending=session.tick();await new Promise(r=>setImmediate(r));session.stop();release({ok:true});await pending;await session.tick();
  assert.equal(moves,1);assert.equal(session.separation,null);assert.equal(session.paused,true);
});

test('a late model response cannot change or finish a paused persistent plan',async t=>{
  const {store,role}=await fixture(t),{session}=game(store,role);
  let release;session.request=()=>new Promise(r=>release=r);const pending=session.receive('帮我采集木头');const id=session.planId;assert.ok(id);
  session.stop();release({content:'开始啦',calls:[{id:'call',name:'task_plan',arguments:{steps:[{title:'采木头',action:'collect',item:'logs',count:1}]}}]});await pending;
  assert.equal(session.journal().get(id).status,'paused');assert.equal(session.journal().get(id).steps.length,0);
});

test('model workflow records real step receipts and resumes without repeating completed craft',async t=>{
  const {store,role}=await fixture(t),{session,engine}=game(store,role);
  const j=session.journal(),p=j.start('制作一把木镐并交给我');j.outline(p.id,[{title:'制作木镐',action:'craft',item:'wooden_pickaxe',count:1},{title:'递给玩家',action:'give',item:'wooden_pickaxe',count:1}]);
  j.record(p.id,{action:'craft',item:'wooden_pickaxe',count:1},{ok:true,created:1,complete:true});j.pause(p.id);
  const actions=[];engine.run=async a=>{actions.push(a);return {ok:true,received:1,complete:true};};
  let turn=0;session.request=async input=>{assert.match(input.system,/制作木镐/);assert.match(input.system,/"status":"done"/);return turn++===0?{content:'把做好的木镐给你',calls:[{id:'give',name:'game_action',arguments:{action:'give',item:'wooden_pickaxe',count:1}}]}:{content:'收到了',calls:[]};};
  await session.resumePlan(p.id);assert.deepEqual(actions.map(a=>a.action),['give']);assert.equal(j.get(p.id).status,'done');assert.equal(store.memories(role.id,'world:A').filter(m=>m.source==='game'&&m.kind==='experience').length,1);
});

test('repeated identical game failures stop locally and preserve the blocked step',async t=>{
  const {store,role}=await fixture(t),{session,engine}=game(store,role);
  let requests=0,actions=0;
  session.request=async()=>requests++===0?{content:'先采木头',calls:[{id:'plan',name:'task_plan',arguments:{steps:[{title:'采木头',action:'collect',item:'logs',count:2}]}}]}:{content:'',calls:[{id:`act${requests}`,name:'game_action',arguments:{action:'collect',item:'logs',count:2}}]};
  engine.run=async()=>{actions++;return {ok:false,error:'没有可到达的木头'};};
  await session.receive('帮我采集木头');assert.equal(actions,2);assert.equal(requests,3);assert.equal(session.journal().list()[0].status,'paused');assert.equal(session.journal().list()[0].steps[0].status,'pending');
});

test('dimension switch pauses the original dimension plan and revokes independent work',async t=>{
  const {store,role}=await fixture(t),{session,engine,bot}=game(store,role);
  session.lastDimension='overworld';const j=session.journal(),p=j.start('采木头');session.planId=p.id;session.planDimension='overworld';engine.household.enable(12);bot.game.dimension='the_nether';session.paused=true;
  await session.tick();assert.equal(j.get(p.id).status,'paused');assert.equal(engine.household.enabled,false);assert.equal(session.planId,null);
});

test('API lists compatibility honestly and refuses cross-world plan resumes',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-api-'));const app=await createApp({directory,port:0});t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});
  const state=await fetch(app.url+'/api/state').then(r=>r.json());assert.equal(state.version,appVersion);assert.equal(state.profile.version,'1.20.1');assert.equal(state.mode,'companion');assert.equal(state.storage.source,'explicit');assert.equal(state.storage.integrity,null);assert.deepEqual(state.profile.modpacks,['元素觉醒 1.4.6']);
  const res=await fetch(app.url+'/api/plans/resume',{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify({id:'different-world'})});assert.equal(res.status,400);assert.match((await res.json()).error,/世界/);
});

test('casual conversation preserves following and stop still cancels it immediately',async t=>{
  const {store,role}=await fixture(t),{engine,session}=game(store,role);
  engine.following=true;let tools;
  session.request=async input=>{tools=input.tools;return {content:'我喜欢海边',calls:[]};};
  await session.receive('你喜欢森林还是海边？');assert.equal(engine.following,true);assert.deepEqual(tools,[]);
  await session.receive('先停一下');assert.equal(engine.following,false);assert.equal(session.paused,true);
});

for(const picked of ['apple','oak_log'])test(`collect only counts the requested block drops, picked up ${picked}`,async t=>{
  const {store,role}=await fixture(t),{engine,bot,items,blocks}=game(store,role);
  const p=new Vec3(3,64,0),block={name:'oak_log',position:p,boundingBox:'block'};blocks.set(p.toString(),block);bot.findBlocks=()=>[p];
  engine.dig=async()=>items.push({name:picked,count:1});engine.move=async()=>{};
  const result=await engine.collect('logs',1,new AbortController().signal);
  assert.equal(result.collectedCount,picked==='oak_log'?1:0);assert.equal(result.complete,picked==='oak_log');
});

for(const confirmed of [false,true])test(`combat requires a server death event, confirmed=${confirmed}`,async t=>{
  const {store,role}=await fixture(t),{engine,bot,items}=game(store,role);
  items.push({name:'stone_sword',count:1});bot.setControlState=()=>{};bot.deactivateItem=()=>{};
  const target={id:9,name:'zombie',height:1.8,position:new Vec3(2,64,0)};bot.entities[9]=target;
  bot.attack=()=>{if(confirmed)bot.emit('entityDead',target);delete bot.entities[9];};
  const result=await engine.fight(9,new AbortController().signal);
  assert.equal(result.defeated,confirmed);assert.equal(result.complete,confirmed);assert.equal(bot.listenerCount('entityDead'),0);
});

for(const confirmed of [false,true])test(`visiting a death location is not item recovery, received=${confirmed}`,async t=>{
  const {store,role}=await fixture(t),{engine,bot}=game(store,role);
  engine.death={x:2,y:64,z:0,dimension:'overworld',at:Date.now()};bot.entities[9]={id:9,name:'item',position:new Vec3(2,64,0)};
  engine.move=async()=>{bot.entity.position=new Vec3(2,64,0);if(confirmed){bot._client.emit('collect',{collectorEntityId:1,collectedEntityId:9,pickupItemCount:2});delete bot.entities[9];}};
  const result=await engine.recover(new AbortController().signal);assert.equal(result.recovered,confirmed);assert.equal(result.received,confirmed?2:0);assert.equal(bot._client.listenerCount('collect'),0);
});

test('finishing an assigned work-area job does not launch a new autonomous request',async t=>{
  const {store,role}=await fixture(t),{engine,session}=game(store,role);
  role.autonomy='free';engine.household.enable(12);session.lastActivity=0;session.lastIdle=0;
  session.request=()=>{throw new Error('should not request a model')};let requests=0;session.turn=async()=>requests++;
  await session.tick();assert.equal(requests,0);
});

test('field work stays near the player and a known home remains a valid return destination',async t=>{
  const {store,role}=await fixture(t),{engine,bot}=game(store,role);
  store.memory(role.id,'world:A','home',JSON.stringify({x:0,y:64,z:0,dimension:'overworld'}));
  bot.entity.position=new Vec3(1000,64,0);bot.players.Host.entity.position=new Vec3(1000,64,0);
  assert.doesNotThrow(()=>engine.bounds(new Vec3(1002,64,0)));
  bot.pathfinder.goto=async()=>{bot.entity.position=new Vec3(0,64,0);};
  const result=await engine.execute({action:'home'},new AbortController().signal,{});assert.equal(result.position.x,0);
});

test('stopping during automatic follow setup cannot start a new idle model request',async t=>{
  const {store,role}=await fixture(t),{engine,session}=game(store,role);role.autonomy='close';role.chatter='chatty';session.lastActivity=0;session.lastIdle=0;
  let release,requests=0;engine.run=()=>new Promise(r=>release=r);session.turn=async()=>requests++;
  const tick=session.tick();await new Promise(r=>setImmediate(r));session.stop();release({ok:true});await tick;assert.equal(requests,0);assert.equal(session.paused,true);
});
