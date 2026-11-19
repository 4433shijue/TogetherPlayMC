import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import minecraftData from 'minecraft-data';
import {Vec3} from 'vec3';
import {Store} from '../src/store.mjs';
import {ActionEngine,validateAction} from '../src/actions.mjs';
import {CompanionSession} from '../src/session.mjs';
import {PlanJournal} from '../src/plans.mjs';
import {waterRoute,survivalDecision,breathing,nearbyDanger,safeCombatStand} from '../src/survival.mjs';
import {excavationRisk,inspectTree} from '../src/gathering.mjs';

async function setup(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-survival-')),store=new Store(directory),role=store.roles()[0],b=new EventEmitter(),blocks=new Map(),items=[],controls={};
  const block=(p,name)=>({name,position:p.floored(),boundingBox:['air','water','torch'].includes(name)?'empty':'block'});
  Object.assign(b,{registry:minecraftData('1.20.1'),_client:new EventEmitter(),health:20,food:20,oxygenLevel:20,game:{dimension:'overworld'},entity:{id:1,position:new Vec3(.5,64,.5),isInWater:false},players:{Host:{entity:{id:2,position:new Vec3(0,64,0)}}},entities:{},inventory:{items:()=>items,emptySlotCount:()=>20},pathfinder:{setGoal(){},setMovements(){}},blockAt:p=>blocks.get(p.floored().toString())??block(p,p.y<64?'stone':'air'),findBlocks:()=>[],findBlock:()=>null,clearControlStates(){for(const k of Object.keys(controls))controls[k]=false;},setControlState(k,v){controls[k]=v;},deactivateItem(){},activateItem(){},equip:async()=>{},lookAt:async()=>{},quit(){},chat(){},attack(){}});
  const e=new ActionEngine(b,{store,role,owner:'Host',world:'world:test'}),s=new CompanionSession({store,provider:()=>({model:'',toolMode:'native'}),emit(){}});
  Object.assign(s,{bot:b,engine:e,role,world:e.world,owner:'Host',status:'connected',active:true,paused:false});clearInterval(s.timer);
  e.pause=async(ms,signal)=>{e.check(signal);};e.move=async(p,signal)=>{e.check(signal);b.entity.position=p.offset(.5,0,.5);};
  const put=(x,y,z,name)=>blocks.set(new Vec3(x,y,z).toString(),block(new Vec3(x,y,z),name));
  t.after(async()=>{s.close();store.close();await fs.rm(directory,{recursive:true,force:true});});return {b,e,s,store,role,blocks,items,controls,put};
}
const signal=()=>new AbortController().signal;
function pool(g){for(let x=1;x<=4;x++)for(let z=-1;z<=1;z++)for(let y=61;y<=63;y++)g.put(x,y,z,'water');}
function tree(g){for(let y=64;y<=69;y++)g.put(4,y,0,'oak_log');g.put(4,63,0,'dirt');g.put(4,70,0,'oak_leaves');}

test('water route reaches a real air opening beside an overhead obstruction',async t=>{
  const g=await setup(t);pool(g);for(let x=1;x<=3;x++)for(let z=-1;z<=1;z++)g.put(x,64,z,'stone');
  const route=waterRoute(g.b,new Vec3(2,61,0));assert.ok(route);assert.equal(route.at(-1).x,4);assert.equal(g.b.blockAt(route.at(-1).offset(0,1,0)).name,'air');
});
test('water search refuses an unknown or sealed exit',async t=>{
  const g=await setup(t);g.b.blockAt=p=>p.y<=63?{name:'water',boundingBox:'empty',position:p}:null;
  assert.equal(waterRoute(g.b,new Vec3(0,61,0),null,{radius:2,rise:4,limit:200}),null);
});
test('stop permits drowning rescue but suppresses automatic combat',async t=>{
  const g=await setup(t);pool(g);g.b.entity.position=new Vec3(2.5,61,.5);g.b.entity.isInWater=true;
  assert.equal(survivalDecision(g.e,{paused:true}).action,'surface');g.b.entity.position=new Vec3(.5,64,.5);g.b.entity.isInWater=false;g.b.entities[9]={id:9,name:'zombie',position:new Vec3(2,64,0)};assert.equal(survivalDecision(g.e,{paused:true}),null);
});
test('planned dive is allowed until oxygen reaches its return reserve',async t=>{
  const g=await setup(t);pool(g);g.b.entity.position=new Vec3(2.5,61,.5);g.b.entity.isInWater=true;g.e.current={action:'retrieve'};
  assert.equal(survivalDecision(g.e),null);g.b.oxygenLevel=9;assert.equal(survivalDecision(g.e).action,'surface');g.e.current=null;
});
for(const enemy of ['creeper','witch','vindicator'])test(`local reflex retreats from ${enemy}`,async t=>{const g=await setup(t);g.items.push({name:'iron_sword',count:1});g.b.entities[9]={id:9,name:enemy,position:new Vec3(2,64,0)};assert.equal(survivalDecision(g.e).action,'retreat');});
test('armed companion can defend without waiting for a model response',async t=>{const g=await setup(t);g.items.push({name:'stone_sword',count:1});g.b.entities[9]={id:9,name:'zombie',position:new Vec3(2,64,0)};assert.equal(survivalDecision(g.e).action,'fight');});
test('rescue aborts pending model, pauses plan and waits for old action to settle',async t=>{
  const g=await setup(t);pool(g);g.b.entity.position=new Vec3(2.5,61,.5);g.b.entity.isInWater=true;
  const j=g.s.journal(),p=j.start('取回物品');g.s.planId=p.id;const pending=new AbortController();g.s.pending=pending;g.e.settling=true;let ran=false;
  g.e.run=async()=>{assert.equal(g.e.settling,false);ran=true;return {ok:true,complete:true};};setTimeout(()=>{g.e.settling=false;},70);
  await g.s.reflex();assert.equal(pending.signal.aborted,true);assert.equal(j.get(p.id).status,'paused');assert.equal(g.s.paused,true);assert.equal(ran,true);
});
for(const collector of [1,2,null])test(`diving receipt only credits the companion: collector ${collector}`,async t=>{
  const g=await setup(t);pool(g);g.b.entities[8]={id:8,name:'item',position:new Vec3(2.5,62,.5)};
  g.e.survival.swim=async()=>{if(collector)g.b._client.emit('collect',{collectorEntityId:collector,collectedEntityId:8,pickupItemCount:2});delete g.b.entities[8];};let surfaced=false;g.e.survival.surface=async()=>{surfaced=true;return {surfaced:true};};
  const r=await g.e.survival.retrieve({entityId:8},signal());assert.equal(r.received,collector===1?2:0);assert.equal(r.complete,collector===1);assert.equal(surfaced,true);assert.equal(g.b._client.listenerCount('collect'),0);
});
test('cancelling a dive releases controls and listener; watchdog owns the rescue',async t=>{
  const g=await setup(t);pool(g);g.b.entities[8]={id:8,name:'item',position:new Vec3(2.5,62,.5)};const c=new AbortController();
  g.e.survival.swim=async()=>{g.controls.forward=true;c.abort(new Error('stop'));throw c.signal.reason;};await assert.rejects(g.e.survival.retrieve({entityId:8},c.signal),/stop/);assert.equal(g.controls.forward,false);assert.equal(g.b._client.listenerCount('collect'),0);assert.equal(g.e.survival.status.state,'needs_surface');
});
test('low air blocks diving before controls or inventory change',async t=>{const g=await setup(t);pool(g);g.b.oxygenLevel=14;g.b.entities[8]={id:8,name:'item',position:new Vec3(2.5,62,.5)};await assert.rejects(g.e.survival.retrieve({entityId:8},signal()),/换气/);assert.deepEqual(g.controls,{});});
test('mining rejects underfoot excavation, fluid exposure and falling gravel',async t=>{
  const g=await setup(t);assert.match(excavationRisk(g.b,g.b.blockAt(new Vec3(0,63,0))),/脚下/);
  g.put(3,64,0,'stone');g.put(4,64,0,'lava');assert.match(excavationRisk(g.b,g.b.blockAt(new Vec3(3,64,0))),/岩浆/);g.put(4,64,0,'air');g.put(3,65,0,'gravel');assert.match(excavationRisk(g.b,g.b.blockAt(new Vec3(3,64,0))),/掉落/);
});
test('tree inspection refuses a protected branch before cutting the trunk',async t=>{const g=await setup(t);tree(g);g.e.protected=p=>p.y===69;assert.throws(()=>inspectTree(g.e,new Vec3(4,64,0)),/保护区/);assert.equal(g.b.blockAt(new Vec3(4,64,0)).name,'oak_log');});
test('tree inspection distinguishes a small natural tree from a log building',async t=>{const g=await setup(t);tree(g);assert.equal(inspectTree(g.e,new Vec3(4,64,0)).logs.length,6);g.put(4,70,0,'air');assert.throws(()=>inspectTree(g.e,new Vec3(4,64,0)),/建筑/);});
test('mining returns through visited cells and reports partial progress at lava',async t=>{
  const g=await setup(t);for(let x=1;x<=4;x++)for(let y=64;y<=65;y++)g.put(x,y,0,'stone');g.put(3,65,1,'lava');g.items.push({name:'stone_pickaxe',count:1},{name:'torch',count:8});
  g.e.gathering.ensure=async()=>{};g.e.tool=async()=>{};g.b.dig=async block=>g.put(block.position.x,block.position.y,block.position.z,'air');g.e.place=async p=>{g.put(p.x,p.y,p.z,'torch');return true;};
  const r=await g.e.gathering.mine({mode:'east',count:4},signal());assert.equal(r.advanced,2);assert.equal(r.returned,true);assert.equal(r.complete,false);assert.match(r.note,/岩浆/);assert.equal(g.b.entity.position.x,.5);assert.equal(g.b.blockAt(new Vec3(3,65,0)).name,'stone');
});
test('plan requires return for mining and surfacing for underwater pickup',async t=>{
  const g=await setup(t),j=new PlanJournal(g.store,g.role.id,g.e.world,'overworld'),p=j.start('取回物品');j.outline(p.id,[{title:'取物',action:'retrieve',entityId:8,count:1}]);j.record(p.id,{action:'retrieve',entityId:8},{ok:true,received:1,surfaced:false,complete:false});assert.notEqual(j.get(p.id).status,'done');
  j.record(p.id,{action:'retrieve',entityId:8},{ok:true,received:1,surfaced:true,complete:true});assert.equal(j.get(p.id).status,'done');
  const mine=j.start('开挖四格后回来');j.outline(mine.id,[{title:'开挖',action:'mine',mode:'east',count:4}]);for(let i=0;i<4;i++)j.record(mine.id,{action:'mine',mode:'east',count:4},{ok:true,advanced:1,returned:true,complete:false});assert.notEqual(j.get(mine.id).status,'done');assert.equal(j.get(mine.id).steps[0].progress,0);
});
test('new action parameters reject oversized tunnels and repeated whole-tree counts',()=>{assert.throws(()=>validateAction({action:'mine',mode:'east',count:20}),/16/);assert.throws(()=>validateAction({action:'mine',mode:'down'}),/方向/);assert.throws(()=>validateAction({action:'fell_tree',count:3}),/1/);});

test('tool preparation rechecks planks consumed by sticks and the workbench',async t=>{
  const g=await setup(t),id=n=>g.b.registry.itemsByName[n].id;
  const recipes={oak_planks:{out:4,inputs:{oak_log:1}},stick:{out:4,inputs:{oak_planks:2}},crafting_table:{out:1,inputs:{oak_planks:4}},wooden_pickaxe:{out:1,inputs:{oak_planks:3,stick:2},table:true}};
  g.items.push({name:'oak_log',count:4});
  g.b.recipesAll=type=>{const name=g.b.registry.items[type].name,r=recipes[name];return r?[{result:{id:type,count:r.out},requiresTable:r.table,delta:Object.entries(r.inputs).map(([name,count])=>({id:id(name),count:-count}))}]:[];};
  const add=(name,delta)=>{let item=g.items.find(i=>i.name===name);if(!item){item={name,count:0};g.items.push(item);}item.count+=delta;};
  g.e.craft=async(name,count)=>{const r=recipes[name],times=Math.ceil(count/r.out);for(const [input,n]of Object.entries(r.inputs))assert.ok(g.e.count(input)>=n*times,`missing ${input}`);for(const [input,n]of Object.entries(r.inputs))add(input,-n*times);add(name,times*r.out);return {created:times*r.out,complete:true};};
  await g.e.gathering.ensure('wooden_pickaxe',1,signal());assert.equal(g.e.count('wooden_pickaxe'),1);assert.equal(g.e.count('crafting_table'),1);assert.ok(g.items.every(i=>i.count>=0));
});

test('nearby entities cannot overwrite the companion oxygen reserve',async t=>{
  const g=await setup(t);g.b._client.emit('entity_metadata',{entityId:1,metadata:[{key:1,value:135}]});assert.equal(g.b.oxygenLevel,9);
  g.b.oxygenLevel=20;g.b._client.emit('entity_metadata',{entityId:9,metadata:[{key:1,value:300}]});assert.equal(g.b.oxygenLevel,9);
});
test('ranged attackers remain dangerous beyond melee range and ledges are excluded',async t=>{
  const g=await setup(t);g.b.entities[9]={id:9,name:'skeleton',position:new Vec3(12,64,0)};assert.equal(nearbyDanger(g.b).length,1);
  g.put(2,63,0,'air');assert.equal(safeCombatStand(g.b,new Vec3(0,64,0)),false);
});
test('danger pause retains local vigilance while explicit stop disables combat',async t=>{
  const g=await setup(t);g.s.paused=true;g.s.survivalGuard=true;g.b.entities[9]={id:9,name:'creeper',position:new Vec3(3,64,0)};let actions=0;g.e.run=async a=>{assert.equal(a.action,'retreat');actions++;return {ok:true,complete:true};};
  await g.s.reflex();assert.equal(actions,1);assert.equal(g.s.survivalGuard,true);g.s.stop();g.s.lastReflex=0;await g.s.reflex();assert.equal(actions,1);assert.equal(g.s.survivalGuard,false);
});
test('equipped offhand shield is reused during combat',async t=>{
  const g=await setup(t);g.items.push({name:'iron_sword',count:1});g.b.inventory.slots=[];g.b.inventory.slots[45]={name:'shield',count:1};let raises=0;g.b.activateItem=()=>raises++;
  const target={id:9,name:'zombie',position:new Vec3(2,64,0),height:1.8};g.b.entities[9]=target;g.b.attack=()=>{};let ticks=0;g.e.pause=async()=>{if(++ticks===2)await new Promise(resolve=>setTimeout(resolve,160));if(ticks===4){g.b.emit('entityDead',target);delete g.b.entities[9];}};
  const result=await g.e.fight(9,signal());assert.equal(result.defeated,true);assert.ok(raises>0);
});
test('scaffold cleanup never crosses dimensions',async t=>{
  const g=await setup(t);g.e.gathering.temporary.push({position:new Vec3(0,63,0),name:'dirt',dimension:'the_nether'});g.b.dig=()=>{throw new Error('must not dig')};await assert.rejects(g.e.gathering.cleanup(signal()),/维度/);
});
