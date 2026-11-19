import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {PackKnowledge,parseSnbt} from '../src/pack-knowledge.mjs';
import {ChatCompanion,companionTools} from '../src/chat-companion.mjs';
import {OfficialResearch,officialURL,publicAddress} from '../src/official-research.mjs';
import {validateAppearance} from '../src/appearance.mjs';
import {exportCard,importCard} from '../src/cards.mjs';
import {createApp} from '../src/server.mjs';

async function fixture(t,{request,now=Date.now}={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-chat-'));const store=new Store(dir),knowledge=new PackKnowledge(store),events=[];
  knowledge.savePack({id:'pack',name:'fixture',status:'ready',roots:['https://example.com/docs'],fingerprint:'one'});
  const research=new OfficialResearch(store),chat=new ChatCompanion({store,knowledge,research,provider:()=>({model:'test',protocol:'openai',hourlyLimit:120}),emit:e=>events.push(e),request:request??(async()=>({content:'我在这里。',calls:[],usage:{}})),now});
  const role=store.roles()[0];chat.attach({profileId:'profile',clientId:'client',world:'world:A',pack:'pack',role});chat.update(1,{dimension:'minecraft:overworld',active:true,events:[]});
  t.after(async()=>{chat.close();knowledge.close();store.close();await fs.rm(dir,{recursive:true,force:true});});return {store,knowledge,chat,role,events,dir};
}
test('companion exposes only read-only knowledge and memory tools; rejects invented action tool',async t=>{
  let n=0;const f=await fixture(t,{request:async(_config,input)=>{assert.deepEqual(input.tools.map(x=>x.name),companionTools.map(x=>x.name));if(!n++)return {calls:[{id:'x',name:'game_action',arguments:{action:'mine'}}],content:'',usage:{}};assert.match(input.messages.at(-1).content,/不能操作游戏/);return {content:'我可以陪你聊聊。',calls:[],usage:{}};}});
  await f.chat.receive('帮我挖矿');assert.equal(f.chat.bot,undefined);assert.equal(f.events.filter(e=>e.type==='reply').length,1);
});
test('cancel and world changes discard late replies and prevent queued tool writes',async t=>{
  let resolve,started;const ready=new Promise(r=>started=r);const f=await fixture(t,{request:()=>new Promise(r=>{resolve=r;started();})});const pending=f.chat.receive('你好');await ready;
  f.chat.detach();f.chat.attach({profileId:'profile',clientId:'client',world:'world:B',pack:'pack',role:f.role});
  resolve({content:'迟来的回复',calls:[{id:'x',name:'remember',arguments:{scope:'world',kind:'place',text:'旧世界的家'}}],usage:{}});await pending;
  assert.equal(f.events.filter(e=>e.type==='reply').length,0);assert.equal(f.store.memories(f.role.id).length,0);
});
test('context excludes another world and dimension while preserving personal memory',async t=>{
  let prompt;const f=await fixture(t,{request:async(_c,input)=>{prompt=JSON.stringify(input);return {content:'你好',calls:[],usage:{}};}});
  f.store.memory(f.role.id,'','fact','喜欢薄荷绿');f.store.memory(f.role.id,'world:B','place','秘密地点 B');f.store.memory(f.role.id,'world:A','place','下界宝库','user',undefined,'minecraft:the_nether');
  await f.chat.receive('你记得我喜欢什么吗');assert.match(prompt,/薄荷绿/);assert.doesNotMatch(prompt,/秘密地点 B|下界宝库/);
});
test('heartbeats reject stale sequence; switching dimension cancels pending generation',async t=>{
  const f=await fixture(t);assert.throws(()=>f.chat.update(1,{}),/过期/);f.chat.update(2,null);const epoch=f.chat.epoch;f.chat.update(3,{dimension:'minecraft:the_nether'});assert.ok(f.chat.epoch>epoch);
});
test('authenticated document traffic keeps a slow export connected without stale tokens extending it',async t=>{
  let time=0;const {chat}=await fixture(t,{now:()=>time});const id=chat.client.sessionId;
  time=11000;chat.requireSession(id,'profile');time=21000;chat.tick();assert.ok(chat.client);
  assert.throws(()=>chat.requireSession('expired','profile'),/过期/);time=24000;chat.tick();assert.equal(chat.client,null);
});
test('proactive chat observes cooldown, quiet preference, combat, screen and AFK',async t=>{
  let time=0;const f=await fixture(t,{now:()=>time});time=61000;assert.equal(f.chat.eligibleForProactive(),false);time=181000;assert.equal(f.chat.eligibleForProactive(),true);
  for(const key of ['combat','screen','dead']){f.chat.observation[key]=true;assert.equal(f.chat.eligibleForProactive(),false);f.chat.observation[key]=false;}
  f.chat.observation.active=false;assert.equal(f.chat.eligibleForProactive(),false);f.chat.observation.active=true;f.chat.role.chatter='quiet';assert.equal(f.chat.eligibleForProactive(),false);
});
test('appearance validates and survives card export/import and service reopening',async t=>{
  const f=await fixture(t),appearance={mode:'gradient',color:'#112233',color2:'#aabbcc',chatColor:'#fedcba',chatNameColor:'#abcdef'};
  const role=f.store.saveRole({id:f.role.id,appearance});assert.equal(role.appearance.color2,'#AABBCC');
  const card=importCard(Buffer.from(JSON.stringify(exportCard(role))));assert.deepEqual(card.role.appearance,role.appearance);
  assert.equal(role.appearance.chatColor,'#FEDCBA');assert.equal(role.appearance.chatNameColor,'#ABCDEF');
  const legacyUpdate=f.store.saveRole({id:role.id,appearance:{mode:'solid',color:'#112244',color2:'#aabbcc'}});assert.equal(legacyUpdate.appearance.chatColor,'#FEDCBA');
  const reopened=new Store(f.dir);assert.equal(reopened.role(role.id).appearance.chatNameColor,'#ABCDEF');reopened.close();
  assert.throws(()=>validateAppearance({chatColor:'red'}));assert.throws(()=>validateAppearance({chatNameColor:'#123'}));
  assert.throws(()=>validateAppearance({color:'url(http://bad)'}));assert.throws(()=>validateAppearance({mode:'unknown'}));
});
test('knowledge prefers matching runtime recipes, filters locked quests and isolates packs',async t=>{
  const f=await fixture(t);
  f.knowledge.put('pack',{id:'static',kind:'recipe',title:'魔法棒',text:'魔法棒使用木头',priority:30,source:'script'});
  f.knowledge.put('pack',{id:'runtime',kind:'recipe',title:'魔法棒',text:'魔法棒使用钻石',priority:100,source:'game'});
  f.knowledge.put('pack',{id:'quest',kind:'quest',title:'魔法棒最终任务',text:'魔法棒隐藏结局',quest:'ABC'});
  f.knowledge.put('another',{id:'other',title:'魔法棒',text:'错误整合包的魔法棒'});
  const results=f.knowledge.search('pack','魔法棒');assert.equal(results[0].source,'game');assert.ok(results.every(d=>!d.quest));assert.ok(!JSON.stringify(results).includes('错误整合包'));
  assert.ok(f.knowledge.search('pack','魔法棒',{unlocked:['ABC']}).some(d=>d.quest==='ABC'));
  assert.ok(f.knowledge.search('pack','魔法棒',{spoilers:true}).some(d=>d.quest==='ABC'));
});
test('changed documents replace FTS terms and deleted sources disappear',async t=>{
  const f=await fixture(t),doc={id:'a',title:'legacyore',text:'legacyore 配方'};assert.equal(f.knowledge.put('pack',doc),true);assert.equal(f.knowledge.put('pack',doc),false);
  f.knowledge.put('pack',{...doc,title:'currentore',text:'currentore 配方'});assert.equal(f.knowledge.search('pack','legacyore').length,0);assert.equal(f.knowledge.search('pack','currentore').length,1);f.knowledge.remove('pack','a');assert.equal(f.knowledge.search('pack','currentore').length,0);
});
test('SNBT parser extracts multiline quest text as data',()=>{
  const parsed=parseSnbt('{ title: "章" quests: [{ id: "AB12" title: "任务" description: ["第一句", "第二句"] }] }');assert.equal(parsed.quests[0].description[1],'第二句');assert.throws(()=>parseSnbt('{quests:['));
});
test('official research blocks private addresses and undeclared hosts; caches and caps calls',async t=>{
  const f=await fixture(t);for(const ip of ['127.0.0.1','10.0.0.3','172.16.2.1','192.168.1.1','169.254.169.254','::1','::ffff:127.0.0.1','fe80::1'])assert.equal(publicAddress(ip),false,ip);assert.equal(publicAddress('8.8.8.8'),true);
  assert.throws(()=>officialURL('https://other.example/x',['https://example.com']));assert.throws(()=>officialURL('http://example.com',['https://example.com']));assert.throws(()=>officialURL('https://github.com/untrusted/repo',['https://github.com/owner/mod']));
  let count=0,time=100;const research=new OfficialResearch(f.store,{now:()=>time,download:async url=>{count++;return {url,text:'官方资料'};}}),budget=research.budget(),roots=['https://example.com/docs'];
  await research.read('pack','https://example.com/a',roots,budget);await research.read('pack','https://example.com/a',roots,budget);assert.equal(count,1);
  await research.read('pack','https://example.com/b',roots,budget);await research.read('pack','https://example.com/c',roots,budget);await assert.rejects(research.read('pack','https://example.com/d',roots,budget),/3 个/);
  time+=8*86400000;await research.read('pack','https://example.com/a',roots,research.budget());assert.equal(count,4);
});
test('initial overview is cached, bounded and charged to the same quota',async t=>{
  const f=await fixture(t);await f.chat.overview('pack');await f.chat.overview('pack');assert.equal(f.knowledge.pack('pack').overviewRequests,1);assert.equal(f.store.get('companionRequestTimes').length,1);
  const p=f.knowledge.pack('pack');p.overview=null;p.overviewRequests=8;f.knowledge.savePack(p);await f.chat.overview('pack');assert.equal(f.store.get('companionRequestTimes').length,1);
});
test('new mode defaults to no bot; pairing persists; native API and web writes remain authenticated',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-api-'));let app=await createApp({directory:dir,port:0,companionProfiles:[{id:'fixture',name:'fixture',loader:'fabric',gameDir:dir}]});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  const state=await fetch(app.url+'/api/state').then(r=>r.json());assert.equal(state.mode,'companion');assert.equal(app.session.bot,null);assert.equal(state.companion.profiles[0].token,undefined);
  const token=app.companion.profiles[0].token;assert.equal((await fetch(app.url+'/companion/v1/handshake',{method:'POST',body:'{}'})).status,403);
  assert.equal((await fetch(app.url+'/api/companion/mode?mode=legacy')).status,405);
  await app.close();app=await createApp({directory:dir,port:0,companionProfiles:[{id:'fixture',name:'fixture',loader:'fabric',gameDir:dir}]});assert.equal(app.companion.profiles[0].token,token);
});
test('native client round trip stays private and rejects an expired world session',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-native-'));
  const app=await createApp({directory:dir,port:0,companionProfiles:[{id:'fixture',name:'fixture',loader:'fabric',gameDir:dir}],companionRequest:async()=>({content:'我在旁边陪你。',calls:[],usage:{input:12,output:8}})});
  t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
  const token=app.companion.profiles[0].token;
  const post=async(route,data)=>fetch(app.url+'/companion/v1/'+route,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(data)});
  const joined=await post('handshake',{protocol:1,world:'test-world',clientId:'client'}).then(r=>r.json());assert.ok(joined.sessionId);
  await post('state',{sessionId:joined.sessionId,seq:1,observation:{dimension:'minecraft:overworld',active:true,held:'minecraft:oak_log 原木'}});
  const resumed=await post('handshake',{protocol:1,world:'test-world',clientId:'client'}).then(r=>r.json());
  assert.equal(resumed.seq,1);assert.equal(resumed.sessionId,joined.sessionId);
  assert.equal((await post('state',{sessionId:resumed.sessionId,seq:resumed.seq+1,observation:{health:17}})).status,200);
  assert.equal(app.companion.chat.observation.held,'minecraft:oak_log 原木');assert.equal(app.companion.chat.observation.health,17);
  await post('chat',{sessionId:joined.sessionId,text:'今天就一起散步吧'});
  await new Promise(r=>setTimeout(r,25));
  const updates=await fetch(app.url+`/companion/v1/events?sessionId=${joined.sessionId}&after=0`,{headers:{authorization:'Bearer '+token}}).then(r=>r.json());
  assert.ok(updates.events.some(e=>e.type==='reply'&&e.data.text==='我在旁边陪你。'));assert.equal(app.session.bot,null);assert.equal(app.session.engine,null);
  await post('leave',{sessionId:joined.sessionId});assert.equal((await post('state',{sessionId:joined.sessionId,seq:2,observation:{}})).status,400);
});
test('new runtime export removes recipes deleted by a changed datapack',async t=>{
  const f=await fixture(t);f.knowledge.ingest('pack',[{id:'recipe:oldore',kind:'recipe',title:'oldore',text:'oldore'}],{begin:true,finished:true});
  assert.equal(f.knowledge.search('pack','oldore').length,1);f.knowledge.ingest('pack',[{id:'recipe:newore',kind:'recipe',title:'newore',text:'newore'}],{begin:true,finished:true});
  assert.equal(f.knowledge.search('pack','oldore').length,0);assert.equal(f.knowledge.search('pack','newore').length,1);
});

test('long runtime recipes survive many shorter item-name search hits',async t=>{
  const f=await fixture(t);
  for(let i=0;i<145;i++)f.knowledge.put('pack',{id:'item-'+i,kind:'item',title:'橡木 木板',text:'橡木 木板',priority:100});
  f.knowledge.put('pack',{id:'runtime:oak_planks',kind:'recipe',title:'橡木木板',text:'橡木 原木 合成 木板 ×4 '+('额外材料说明 '.repeat(400)),priority:100});
  const rows=f.knowledge.search('pack','橡木 木板');assert.ok(rows.some(r=>r.kind==='recipe'&&r.text.includes('×4')));
});


test('full guidance is restricted to explicit questions and never proactive chat',async t=>{
 const {chat}=await fixture(t);chat.role.guideLevel='full';
 assert.equal(chat.options('今天天气不错',false).spoilers,false);
 assert.equal(chat.options('这个任务怎么做',false).spoilers,true);
 assert.equal(chat.options('这个任务怎么做',true).spoilers,false);
 chat.role.guideLevel='hint';assert.equal(chat.options('这个任务怎么做',false).spoilers,false);
 assert.equal(chat.options('给我完整攻略',false).spoilers,true);
});
test('late image replies cannot write to a different world or trigger goal tools',async t=>{
 let resolve,started;const ready=new Promise(r=>started=r);const f=await fixture(t,{request:()=>new Promise(r=>{resolve=r;started();})});
 const image=f.chat.journey.upload(f.chat.scope(),'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=');
 const pending=f.chat.receive('看看图片',{mediaId:image.id});await ready;f.chat.detach();f.chat.attach({profileId:'profile',clientId:'client',world:'world:B',pack:'pack',role:f.role});f.chat.update(1,{dimension:'minecraft:overworld'});
 resolve({content:'旧照片回答',calls:[{id:'x',name:'suggest_goal',arguments:{title:'错误世界的目标'}}],usage:{}});await pending;
 assert.equal(f.events.filter(e=>e.type==='reply').length,0);assert.equal(f.chat.journey.goals(f.role.id,'world:B').length,0);
});
