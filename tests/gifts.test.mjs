import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {Store} from '../src/store.mjs';
import {ChatCompanion} from '../src/chat-companion.mjs';
import {createApp} from '../src/server.mjs';

async function setup(t,request){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'orb-gift-')),store=new Store(dir);
  const role=store.saveRole({...store.roles()[0],persona:'test-persona-947',style:'test-style-68'});
  const c=new ChatCompanion({store,request,provider:()=>({model:'fixture',toolMode:'native'}),knowledge:{status:()=>({}),pack:()=>null,search:()=>[]},research:{budget:()=>({})}});
  c.attach({profileId:'qa',clientId:'native',world:'save',role});c.update(1,{dimension:'overworld',giftBridge:true,active:true});
  t.after(async()=>{c.close();await c.drainMemory();store.close();await fs.rm(dir,{recursive:true,force:true});});
  return c;
}
const offer={itemId:'minecraft:bricks',count:2,intent:'requested'};
const tool=input=>input.tools.some(t=>t.name==='offer_gift');
test('gift tool is opt-in per save and original persona survives; normal conversation needs one call',async t=>{
  const calls=[];const c=await setup(t,async(config,input)=>{calls.push(input);return {content:'普通回复',calls:[]};});
  assert.equal(tool(c.buildContext('早',{preview:true}).input),false);
  c.gifts.configure('role');await c.receive('早');assert.equal(calls.length,1);assert.ok(tool(calls[0]));assert.match(calls[0].system,/test-persona-947/);
  assert.equal(tool(c.buildContext('事件',{proactive:true}).input),false);
  assert.equal(tool(c.buildContext('不用送了，我想自己去找',{preview:true}).input),false);
  c.provider=()=>({toolMode:'chat'});assert.equal(tool(c.buildContext('聊聊',{preview:true}).input),false);
  c.update(2,{giftBridge:false});assert.equal(tool(c.buildContext('早',{preview:true}).input),false);
  c.detach();c.attach({profileId:'qa',clientId:'native',world:'other',role:c.role});assert.equal(c.gifts.mode(),'off');
});
test('one delivered gift per chat, validated receipt reaches the follow-up model and spontaneous cooldown survives requests',async t=>{
  const inputs=[];const c=await setup(t,async(config,input)=>{inputs.push(structuredClone(input));return inputs.length===1?{content:'',calls:[1,2].map(id=>({id:String(id),name:'offer_gift',arguments:offer}))}:{content:'收到游戏结果',calls:[]};});
  c.gifts.configure('role');const done=c.receive('给我一点砖块');
  for(let i=0;i<150&&!c.gifts.waiting();i++)await wait(10);
  const id=c.gifts.waiting();assert.ok(id);assert.equal(c.gifts.receipt(id,'dropped').accepted,false);
  assert.deepEqual(c.gifts.claim('wrong'),{});assert.equal(c.gifts.claim(id).gift.itemId,offer.itemId);assert.deepEqual(c.gifts.claim(id),{});
  assert.equal(c.gifts.receipt(id,'dropped').accepted,true);assert.equal(c.gifts.receipt(id,'dropped').accepted,false);await done;
  const results=inputs[1].messages.filter(m=>m.role==='tool').map(m=>JSON.parse(m.content));assert.equal(results[0].status,'dropped');assert.ok(results[1].error);
  assert.throws(()=>c.gifts.offer({...offer,intent:'spontaneous'},new AbortController().signal),/主动/);
  const ac=new AbortController(),next=c.gifts.offer(offer,ac.signal);ac.abort();assert.equal((await next).status,'unconfirmed');assert.equal(c.gifts.waiting(),null);
});
test('protected mode reaches the game; failed receipts, invalid stacks and cancelled scope do not count as delivery',async t=>{
  const c=await setup(t,async()=>({content:'',calls:[]}));c.gifts.configure('progress');
  const ac=new AbortController();for(const invalid of [{count:0},{count:65},{itemId:'wrong'},{nbt:'x'}])assert.throws(()=>c.gifts.offer({...offer,...invalid},ac.signal));
  const result=c.gifts.offer({...offer,intent:'spontaneous'},ac.signal);const g=c.gifts.claim(c.gifts.waiting()).gift;assert.equal(g.mode,'progress');c.gifts.receipt(g.id,'progress');assert.equal((await result).status,'progress');
  c.pending=ac;const another=c.gifts.offer(offer,ac.signal);const id=c.gifts.waiting();c.update(2,{dimension:'nether'});assert.equal((await another).status,'unconfirmed');assert.deepEqual(c.gifts.claim(id),{});assert.equal(c.gifts.receipt(id,'dropped').accepted,false);
});

test('only the paired native session may enable, claim and acknowledge a pending gift',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'gift-bridge-'));
  const app=await createApp({port:0,directory:dir,companionProfiles:[{id:'qa',gameDir:dir,loader:'fabric'}],companionRequest:async()=>({content:'',calls:[]})});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  const headers={authorization:'Bearer '+app.companion.profiles[0].token,'content-type':'application/json'};
  const post=(route,data)=>fetch(app.url+'/companion/v1/'+route,{method:'POST',headers,body:JSON.stringify(data)});
  const {sessionId}=await (await post('handshake',{protocol:1,clientId:'qa',world:'save'})).json();
  await post('state',{seq:1,sessionId,observation:{dimension:'minecraft:overworld',giftBridge:true}});
  const action=(name,more={})=>post('journey',{action:'gift-'+name,sessionId,...more});
  assert.equal((await action('mode',{mode:'role'})).status,200);
  const {csrf}=await (await fetch(app.url+'/api/state')).json();
  const wrong=await fetch(app.url+'/api/companion/journey',{method:'POST',headers:{'content-type':'application/json','x-together-token':csrf},body:JSON.stringify({action:'gift-mode',mode:'off'})});assert.ok(!wrong.ok);
  const c=app.companion.chat,pending=c.gifts.offer(offer,new AbortController().signal);
  const events=await (await fetch(app.url+'/companion/v1/events?sessionId='+sessionId,{headers})).json();
  const id=events.state.giftWaiting;assert.ok(id);assert.equal(events.state.giftMode,'role');
  assert.ok(!(await action('claim',{id,sessionId:'expired'})).ok);
  assert.equal((await (await action('claim',{id})).json()).gift.id,id);
  await action('receipt',{id,status:'unavailable'});assert.equal((await pending).status,'unavailable');
});
