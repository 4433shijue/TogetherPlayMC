import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ActionEngine} from '../src/actions.mjs';
import {Vec3} from 'vec3';

for(const who of ['owner','bot','nobody'])test(`delivery confirms actual owner pickup, recipient=${who}`,async()=>{
  const bot=new EventEmitter(),client=new EventEmitter(),owner={id:2,position:new Vec3(0,64,0)};let stock=1;
  Object.assign(bot,{_client:client,players:{Host:{entity:owner}},entity:{id:1,position:new Vec3(1,64,0)},entities:{},inventory:{items:()=>stock?[{name:'wooden_pickaxe',type:99,count:stock}]:[]},lookAt:async()=>{},toss:async()=>{stock=0;bot.entities[5]={getDroppedItem:()=>({name:'wooden_pickaxe',count:1})};if(who!=='nobody'){if(who==='bot')stock=1;client.emit('collect',{collectedEntityId:5,collectorEntityId:who==='owner'?2:1,pickupItemCount:1});}}});
  const engine=new ActionEngine(bot,{owner:'Host',role:{id:'r'},world:'test',store:{}});engine.move=async()=>{};engine.pause=async()=>{};engine.check=()=>{};
  const result=await engine.give('wooden_pickaxe',1,new AbortController().signal);assert.equal(result.complete,who==='owner');assert.equal(result.received,who==='owner'?1:0);assert.equal(client.listenerCount('collect'),0);
});
test('multi-batch crafting confirms each transaction against the actual inventory',async()=>{
  const bot=new EventEmitter();let stock=3,craftCalls=0;
  Object.assign(bot,{registry:{itemsByName:{oak_planks:{id:1}},blocksByName:{crafting_table:{id:2}}},findBlock:()=>null,recipesFor:()=>[{result:{count:4}}],inventory:{items:()=>[{name:'oak_planks',count:stock}]},craft:async()=>{craftCalls++;stock+=4;}});
  const engine=new ActionEngine(bot,{owner:'Host',role:{id:'r'},world:'A',store:{}});engine.check=()=>{};engine.snapshot=()=>({inventory:bot.inventory.items()});
  const result=await engine.craft('oak_planks',8,new AbortController().signal);assert.equal(result.created,8);assert.equal(result.complete,true);assert.equal(craftCalls,2);
});
