import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {unzipSync} from 'fflate';
import {Store} from '../src/store.mjs';
import {Journey} from '../src/journey.mjs';
import {materialPlan} from '../src/guide.mjs';
import {PackKnowledge} from '../src/pack-knowledge.mjs';
import {encodeRequest,protocols} from '../src/providers.mjs';
import {createApp} from '../src/server.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=';
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-journey-')),store=new Store(dir),journey=new Journey(store),role=store.roles()[0].id,scope={role,world:'A',dimension:'overworld'};t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,store,journey,scope};}
const observation=(extra={})=>({dimension:'overworld',biome:'plains',worldName:'家',position:{x:1,y:60,z:2},dead:false,advancementsKnown:true,advancements:[{id:'old',title:'旧成就'}],questCompletedKnown:true,completedQuests:[],...extra});

test('first observation is a baseline; new progress deduplicates across reconnect and deletion',async t=>{
 const {journey:j,scope:s}=await fixture(t),trip=j.start(s.role,s.world,'play-one');j.observe(trip,observation());assert.equal(j.entries(s.role).length,0);
 const next=observation({advancements:[{id:'old',title:'旧成就'},{id:'new',title:'新成就'}],completedQuests:['quest1']});j.observe(trip,next);assert.equal(j.entries(s.role).length,2);
 for(const e of j.entries(s.role))j.edit(s.role,{id:e.id,remove:true});j.end(trip);const reconnect=j.start(s.role,s.world,'play-one');assert.equal(reconnect.id,trip.id);j.observe(reconnect,next);assert.equal(j.entries(s.role).length,0);
});
test('unknown quest completion does not become evidence; visible is not completed',async t=>{
 const {journey:j,scope:s}=await fixture(t),trip=j.start(s.role,s.world,'a');j.observe(trip,observation());const goal=j.goal(s,{title:'完成任务',evidence:{type:'quest',id:'q'}});
 j.observe(trip,observation({unlockedQuests:['q'],visibleQuests:['q'],questCompletedKnown:false,completedQuests:['q']}));assert.equal(j.goals(s.role,s.world)[0].status,'active');
 j.observe(trip,observation({completedQuests:['q']}));assert.equal(j.goals(s.role,s.world)[0].status,'done');assert.equal(j.goals(s.role,s.world)[0].data.completionSource,'game');assert.ok(goal.id);
});
test('journal photos remain local; exports contain attachments and deletion invalidates summaries',async t=>{
 const {journey:j,scope:s}=await fixture(t),photo=j.upload(s,png);const entry=j.add(s,{title:'海边',mediaId:photo.id});const summary=j.add(s,{title:'今天',sources:[entry.id],kind:'summary'});
 const zip=unzipSync(j.export(s.role,{world:'A'}));assert.ok(zip['photos/'+photo.id+'.png']);assert.ok(zip['journal.json']);assert.throws(()=>j.media({...s,world:'B'},photo.id));
 j.edit(s.role,{id:entry.id,remove:true});assert.throws(()=>j.entry(s.role,summary.id));assert.throws(()=>j.media(s,photo.id));
});
test('goals isolate worlds and dimensions and retain user completion attribution',async t=>{
 const {journey:j,scope:s,store}=await fixture(t),g=j.goal(s,{title:'建屋',notes:'海边'});assert.throws(()=>j.goal({...s,world:'B'},{id:g.id,status:'done'}));assert.throws(()=>j.goal({...s,dimension:'nether'},{id:g.id,status:'done'}));
 j.goal(s,{id:g.id,status:'done'});assert.equal(new Journey(store).goals(s.role,'A','overworld')[0].data.completionSource,'user');assert.equal(j.goals(s.role,'A','nether').length,0);
});
test('recaps survive service restart and omit other-dimension coordinates',async t=>{
 const {journey:j,scope:s,store}=await fixture(t),one=j.start(s.role,'A','one');j.observe(one,observation());j.add({...s,session:one.id},{title:'一起看海'});j.end(one);
 const reopened=new Journey(store),two=reopened.start(s.role,'A','two');assert.match(reopened.recap(s.role,'A','overworld',two.id).summary,/看海/);assert.equal(reopened.recap(s.role,'A','nether',two.id).position,null);assert.equal(reopened.recap(s.role,'B','overworld',two.id),null);
 reopened.mark(s.role,'A','recap-dismiss:'+two.id);assert.equal(new Journey(store).recap(s.role,'A','overworld',two.id),null);const three=reopened.start(s.role,'A','three');assert.ok(reopened.recap(s.role,'A','overworld',three.id));
});
test('goal suggestions are drafts and repeated messages do not duplicate them',async t=>{
 const {journey:j,scope:s}=await fixture(t);j.suggest(s,'下次我们想在河边盖房子');j.suggest(s,'下次我们想在河边盖房子');assert.equal(j.goals(s.role,'A').length,1);assert.equal(j.goals(s.role,'A')[0].status,'suggested');
});
test('goal deletion stays out of recaps and completion checks until explicitly restored',async t=>{
 const {journey:j,scope:s,store}=await fixture(t),trip=j.start(s.role,s.world,'one');j.observe(trip,observation());
 const g=j.goal(s,{title:'建屋',status:'paused',evidence:{type:'quest',id:'q'}});
 const suggestion=j.suggest(s,'下次我们想在河边盖房子');
 assert.throws(()=>j.deleteGoal({...s,world:'B'},g.id));assert.throws(()=>j.deleteGoal({...s,role:'other'},g.id));assert.throws(()=>j.deleteGoal({...s,dimension:'nether'},g.id));
 j.deleteGoal(s,g.id);j.deleteGoal(s,g.id);j.deleteGoal(s,suggestion.id);
 assert.equal(j.goals(s.role,s.world).length,0);assert.equal(j.goals(s.role,s.world,s.dimension,true).length,2);
 assert.throws(()=>j.goal(s,{id:g.id,status:'active'}),/已删除/);
 assert.equal(j.suggest(s,'下次我们想在河边盖房子'),null);
 j.observe(trip,observation({completedQuests:['q']}));j.acknowledge(s,'建屋完成了');j.end(trip);
 const reopened=new Journey(store),next=reopened.start(s.role,s.world,'two');assert.equal(reopened.recap(s.role,s.world,s.dimension,next.id).goals.length,0);
 reopened.deleteGoal(s,g.id,true);assert.equal(reopened.goals(s.role,s.world)[0].status,'paused');assert.equal(reopened.goals(s.role,s.world)[0].data.evidence.id,'q');
 reopened.deleteGoal(s,g.id,true);assert.equal(reopened.goals(s.role,s.world).length,1);
});
test('web and native goal deletion authenticate, refresh recaps, and support recovery',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-goal-delete-'));const app=await createApp({directory:dir,port:0,companionProfiles:[{id:'p',loader:'fabric',gameDir:dir}]});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const c=app.companion.chat,r=app.store.roles()[0],p=app.companion.profiles[0],connect=id=>{const session=c.attach({profileId:'p',clientId:'c',playSessionId:id,world:'A',pack:'p',role:r});c.update(1,observation());return session.sessionId;};connect('one');
 const goal=c.journey.goal(c.scope(),{title:'删除验收小屋',status:'active'});c.detach();const sessionId=connect('two');assert.equal(c.recap.goals.length,1);
 const state=await fetch(app.url+'/api/state').then(r=>r.json());
 const web=(b,auth=true)=>fetch(app.url+'/api/companion/journey',{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-together-token':state.csrf}:{})},body:JSON.stringify({world:'A',...b})});
 const native=(b,auth=true)=>fetch(app.url+'/companion/v1/journey',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer '+p.token}:{})},body:JSON.stringify({sessionId,...b})});
 assert.equal((await web({action:'goal-delete',id:goal.id},false)).status,403);assert.equal((await web({action:'goal-delete',id:goal.id,world:'B'})).status,400);
 assert.equal((await web({action:'goal-delete',id:goal.id})).status,200);assert.equal(c.recap.goals.length,0);assert.equal(c.state().goals.length,0);
 assert.doesNotMatch(c.buildContext('你好').sections.find(s=>s.id==='goals').text,/删除验收小屋/);
 assert.equal((await native({action:'list'}).then(r=>r.json())).goals.length,0);
 assert.equal((await native({action:'list',goalTrash:true}).then(r=>r.json())).goals[0].id,goal.id);
 assert.equal((await native({action:'goal-restore',id:goal.id},false)).status,403);
 assert.equal((await native({action:'goal-restore',id:goal.id})).status,200);assert.equal(c.recap.goals.length,1);
 assert.equal((await native({action:'goal-delete',id:goal.id})).status,200);assert.equal((await web({action:'list',goalTrash:true}).then(r=>r.json())).goals.length,1);
});
const recipe=(id,out,count,slots)=>({id,serializer:'minecraft:crafting_shapeless',result:{id:out,count},ingredients:slots.map(s=>[].concat(s).map(id=>({id,count:1}))),standard:true});
test('material expansion reserves shared materials and supports mixed alternatives',()=>{
 const recipes=[recipe('planks','plank',4,['log']),recipe('sticks','stick',4,['plank','plank']),recipe('pick','pick',1,['plank','plank','plank','stick','stick'])];
 let plan=materialPlan(recipes,[{id:'log',count:1}],'pick');assert.deepEqual(plan.missing,[{id:'log',count:1}]);
 plan=materialPlan([recipe('mixed','chest',1,Array(8).fill(['oak','birch']))],[{id:'oak',count:4},{id:'birch',count:4}],'chest');assert.deepEqual(plan.missing,[]);assert.equal(plan.used.reduce((n,x)=>n+x.count,0),8);
});
test('material plans stop loops and expose unsupported machine conditions',()=>{
 const cycle=materialPlan([recipe('a','a',1,['b']),recipe('b','b',1,['a'])],[],'a');assert.ok(cycle.warnings.some(x=>x.includes('循环')));
 const plan=materialPlan([{...recipe('machine','magic',1,['dust']),standard:false}],[],'magic');assert.ok(plan.warnings.some(x=>x.includes('机器')));assert.deepEqual(plan.missing,[{id:'magic',count:1}]);
});
test('modded alternatives prefer available stock and avoid recycling basic gathered materials',()=>{
 const recipes=[recipe('mod:exotic','minecraft:cobblestone',1,['mod:frozen_stone']),recipe('minecraft:oak_planks','minecraft:oak_planks',4,['minecraft:oak_log']),recipe('minecraft:stick','minecraft:stick',4,['minecraft:oak_planks','minecraft:oak_planks']),recipe('minecraft:stone_pickaxe','minecraft:stone_pickaxe',1,[['mod:stone','minecraft:cobblestone'],['mod:stone','minecraft:cobblestone'],['mod:stone','minecraft:cobblestone'],['mod:stick','minecraft:stick'],['mod:stick','minecraft:stick']])];
 recipes.push({id:'mod:stick_from_branch',serializer:'minecraft:crafting_shapeless',standard:true,result:{id:'minecraft:stick',count:1},ingredients:[[{id:'mod:branch',count:1}]]});
 const plan=materialPlan(recipes,[],'minecraft:stone_pickaxe');assert.deepEqual(plan.missing,[{id:'minecraft:cobblestone',count:3},{id:'minecraft:oak_log',count:1}]);
 const stocked=materialPlan(recipes,[{id:'mod:stone',count:3},{id:'mod:stick',count:2}],'minecraft:stone_pickaxe');assert.deepEqual(stocked.missing,[]);
});
test('runtime recipe evidence is scoped per world and is unavailable until export completes',async t=>{
 const {store}=await fixture(t),k=new PackKnowledge(store);t.after(()=>k.close());k.savePack({id:'p',name:'p'});
 const doc=(material)=>({id:'r',kind:'recipe',title:'魔杖',text:JSON.stringify({id:'r',serializer:'minecraft:crafting_shapeless',result:{id:'wand',count:1},ingredients:[[{id:material,count:1}]]})});
 k.ingest('p',[doc('diamond')],{world:'A',begin:true});assert.throws(()=>k.plan('p','A',[],'wand'),/同步/);k.ingest('p',[],{world:'A',finished:true});k.ingest('p',[doc('dirt')],{world:'B',begin:true,finished:true});
 assert.equal(k.plan('p','A',[],'wand').missing[0].id,'diamond');assert.equal(k.plan('p','B',[],'wand').missing[0].id,'dirt');assert.ok(!JSON.stringify(k.search('p','魔杖',{world:'A'})).includes('dirt'));
});
for(const protocol of protocols)for(const toolMode of ['native','json','chat'])test(`${protocol}/${toolMode}: image survives request encoding without leaking to later text`,()=>{
 const config={protocol,toolMode,model:'fixture'},image={mime:'image/png',data:png};const body=encodeRequest(config,{system:'test',messages:[{role:'user',content:'看图',images:[image]}]});assert.ok(JSON.stringify(body).includes(png));assert.ok(!JSON.stringify(encodeRequest(config,{system:'test',messages:[{role:'user',content:'接着聊'}]})).includes(png));
});
test('journey writes need authentication; media cannot cross worlds; image is sent once',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-v06-api-'));const inputs=[];const app=await createApp({directory:dir,port:0,companionProfiles:[],companionRequest:async(_c,i)=>{inputs.push(i);return {content:'看到了',calls:[],usage:{input:1,output:1}};}});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const state=await fetch(app.url+'/api/state').then(r=>r.json()),post=(url,b,auth=true)=>fetch(app.url+url,{method:'POST',headers:{'content-type':'application/json',...(auth?{'x-together-token':state.csrf}:{})},body:JSON.stringify(b)});
 assert.equal((await post('/api/companion/journey',{action:'photo',world:'A',data:png},false)).status,403);
 app.companion.chat.attach({profileId:'p',clientId:'c',playSessionId:'play',world:'A',pack:'p',role:app.store.roles()[0]});app.companion.chat.update(1,observation());
 const p=await post('/api/companion/journey',{action:'photo',world:'A',data:png}).then(r=>r.json());assert.ok(p.id);
 assert.equal((await fetch(app.url+'/api/companion/media?world=B&id='+p.id)).status,400);
 await app.companion.chat.receive('这是什么',{mediaId:p.id});await app.companion.chat.receive('你好');assert.ok(inputs[0].messages.at(-1).images);assert.ok(inputs[1].messages.every(m=>!m.images));
});

test('named user completion is distinct from game evidence; questions cannot finish goals',async t=>{
 const {journey:j,scope:s}=await fixture(t),g=j.goal(s,{title:'河边小屋'});
 j.acknowledge(s,'河边小屋完成了吗？');assert.equal(j.goals(s.role,'A')[0].status,'active');
 j.acknowledge(s,'河边小屋已经完成了');assert.equal(j.goals(s.role,'A')[0].status,'done');assert.equal(j.goals(s.role,'A')[0].data.completionSource,'user');
});

test('temporary photos expire while saved memories survive cleanup',async t=>{
 const {journey:j,scope:s}=await fixture(t),temp=j.upload(s,png),saved=j.upload(s,png);j.add(s,{title:'留住',mediaId:saved.id});
 j.db.prepare('UPDATE journey_media SET created=?').run('2000-01-01T00:00:00Z');j.cleanup();assert.throws(()=>j.media(s,temp.id));assert.equal(j.media(s,saved.id).saved,1);
});
test('native diary keeps same-world dimension history while goals remain local',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-native-diary-'));
 const app=await createApp({directory:dir,port:0,companionProfiles:[{id:'p',loader:'fabric',gameDir:dir}],companionRequest:async()=>({content:'',calls:[],usage:{}})});
 t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const c=app.companion.chat,r=app.store.roles()[0],p=app.companion.profiles[0];
 const {sessionId}=c.attach({profileId:'p',clientId:'c',playSessionId:'one',world:'A',pack:'p',role:r});c.update(1,observation());
 c.journey.add({...c.scope(),dimension:'nether'},{title:'下界留念'});
 c.journey.add({...c.scope(),world:'B'},{title:'另一个世界'});
 c.journey.goal({...c.scope(),dimension:'nether'},{title:'下界目标'});
 const result=await fetch(app.url+'/companion/v1/journey',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+p.token},body:JSON.stringify({sessionId,action:'list'})}).then(x=>x.json());
 assert.deepEqual(result.entries.map(e=>e.data.title),['下界留念']);assert.equal(result.goals.length,0);
});
test('deleting a source refreshes the visible recap and rejects an in-flight summary',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-summary-'));let finish;const app=await createApp({directory:dir,port:0,companionProfiles:[],companionRequest:()=>new Promise(r=>finish=r)});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const c=app.companion.chat,r=app.store.roles()[0],connect=id=>{c.attach({profileId:'p',clientId:'c',playSessionId:id,world:'A',pack:'p',role:r});c.update(1,observation());};connect('one');
 const e=c.journey.add(c.scope(),{title:'会被删除的来源'});c.detach();connect('two');assert.match(c.recap.summary,/会被删除/);
 const state=await fetch(app.url+'/api/state').then(r=>r.json()),post=b=>fetch(app.url+'/api/companion/journey',{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify({world:'A',...b})}).then(r=>r.json());
 await post({action:'summarize',ids:[e.id]});await post({action:'journal-edit',id:e.id,remove:true});assert.doesNotMatch(c.recap.summary,/会被删除/);
 finish({content:'迟到的日记',calls:[],usage:{}});await new Promise(r=>setImmediate(r));assert.equal(c.journey.entries(r.id).length,0);
});
