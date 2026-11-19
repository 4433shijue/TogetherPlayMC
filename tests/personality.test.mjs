import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {Store} from '../src/store.mjs';import {exportCard,importCard} from '../src/cards.mjs';import {ChatCompanion} from '../src/chat-companion.mjs';import {PackKnowledge} from '../src/pack-knowledge.mjs';import {OfficialResearch} from '../src/official-research.mjs';import {createApp} from '../src/server.mjs';
import {defaultPersonality,validatePersonality,personalityContext,personalityDelivery,personalityPresets} from '../src/personality.mjs';
async function fixture(t,request){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-personality-')),store=new Store(dir),knowledge=new PackKnowledge(store),research=new OfficialResearch(store),inputs=[];const chat=new ChatCompanion({store,knowledge,research,provider:()=>({model:'fixture',protocol:'openai',hourlyLimit:120}),request:request??(async(_,input)=>{inputs.push(input);return {content:'先回亮处。',calls:[],usage:{}};})});const role=store.roles()[0];chat.attach({profileId:'p',clientId:'c',world:'A',pack:'p',role});chat.update(1,{dimension:'overworld',active:true,health:20});t.after(async()=>{chat.close();knowledge.close();store.close();await fs.rm(dir,{recursive:true,force:true});});return {store,chat,role,dir,inputs};}
test('personality validation preserves dormant preferences and rejects invalid or empty custom settings',()=>{
 assert.deepEqual(validatePersonality(),defaultPersonality());const p=validatePersonality({mode:'custom',preset:'kitten',custom:'安静的小狗'});assert.equal(validatePersonality({mode:'role'},p).custom,p.custom);
 for(const invalid of [null,[],{mode:'bad'},{preset:'bad'},{custom:7},{mode:'custom',custom:' '},{custom:'x'.repeat(2001)}])assert.throws(()=>validatePersonality(invalid));
});
test('legacy roles, partial appearance saves, cards, memories and reopened storage retain independent personality',async t=>{
 const {store,role,dir}=await fixture(t);const legacy={...role};delete legacy.personality;store.db.prepare('UPDATE roles SET json=? WHERE id=?').run(JSON.stringify(legacy),role.id);assert.equal(personalityContext(store.role(role.id)),null);
 const memory=store.memory(role.id,'','fact','喜欢薄荷绿');store.event('owner_chat',{text:'一起留下的记录'},role.id,'A');const p={mode:'form',preset:'puppy',custom:'保留的自定义草稿'};
 store.saveRole({id:role.id,personality:p});store.saveRole({id:role.id,appearance:{form:'kitten',color:'#123456'}});store.saveRole({id:role.id,name:role.name});const saved=store.role(role.id);
 assert.deepEqual(saved.personality,p);for(const key of ['id','persona','relationship','style','greeting'])assert.equal(saved[key],role[key]);assert.equal(store.memories(role.id)[0].id,memory);assert.equal(store.conversation(role.id,'A').length,1);
 const imported=store.saveRole(importCard(Buffer.from(JSON.stringify(exportCard(saved)))).role);assert.deepEqual(imported.personality,p);assert.notEqual(imported.id,role.id);
 const reopened=new Store(dir);try{assert.deepEqual(reopened.role(role.id).personality,p);assert.equal(reopened.role(role.id).appearance.color,'#123456');}finally{reopened.close();}
});
test('auto personality follows seven forms while fixed and custom choices survive shape changes',()=>{
 for(const preset of personalityPresets){const role={appearance:{form:preset.id},personality:{mode:'form',preset:'auto'}};assert.equal(personalityContext(role)?.id??'orb',preset.id);role.personality.preset='puppy';assert.equal(personalityContext(role).id,'puppy');role.personality={mode:'custom',custom:'安静可靠'};assert.equal(personalityContext(role).preferences,'安静可靠');role.personality.mode='role';assert.equal(personalityContext(role),null);}
 assert.match(personalityContext({appearance:{form:'kitten'},personality:{mode:'form',preset:'auto'}}).voice,/喵/);
});
test('actual requests contain selected traits and memories, with situation rules outside the stable persona',async t=>{
 const f=await fixture(t);f.store.memory(f.role.id,'','fact','喜欢薄荷绿');const role=f.store.saveRole({id:f.role.id,appearance:{form:'puppy'},personality:{mode:'form',preset:'auto'}});f.chat.changeRole(role);
 await f.chat.receive('你还记得我喜欢什么颜色吗');await f.chat.receive('我害怕，先别开玩笑');assert.equal(f.inputs.length,2);assert.equal(f.inputs[0].system,f.inputs[1].system);assert.match(f.inputs[0].system,/狗狗球|忠诚/);assert.match(f.inputs[0].system,new RegExp(role.name));assert.match(JSON.stringify(f.inputs[0].messages),/薄荷绿/);assert.match(f.inputs[1].messages.at(-1).content,/serious|省略拟声/);
 assert.equal(f.store.conversation(role.id,'A').filter(e=>e.type==='reply').at(-1).data.text,'先回亮处。','never append a bark to model output');
 const preview=f.chat.buildContext('怎么做火把',{preview:true});assert.equal(preview.sections.find(s=>s.id==='personality').location,'system');assert.equal(preview.sections.find(s=>s.id==='personality-delivery').location,'current-message');assert.match(preview.sections.find(s=>s.id==='personality-delivery').text,/practical/);
});
test('role switches and reverting to original persona remove previous preset from the next request',async t=>{
 const f=await fixture(t);f.chat.changeRole(f.store.saveRole({id:f.role.id,personality:{mode:'form',preset:'puppy'}}));await f.chat.receive('你好');const other=f.store.saveRole({name:'另一个伙伴',personality:{mode:'custom',custom:'谨慎的小领航员'}});f.chat.changeRole(other);await f.chat.receive('你好');assert.doesNotMatch(f.inputs[1].system,/狗狗球|偶尔在招呼/);assert.match(f.inputs[1].system,/谨慎的小领航员/);
 f.chat.changeRole(f.store.saveRole({id:other.id,personality:{mode:'role'}}));assert.ok(!f.chat.buildContext('你好',{preview:true}).sections.some(s=>s.id==='personality'));
});
test('danger and practical guidance suppress play, while personality never overrides quiet mode',async t=>{
 for(const observation of [{combat:true},{dead:true},{health:6},{expression:'sad'}])assert.equal(personalityDelivery('你好',observation).context,'serious');assert.equal(personalityDelivery('给我合成步骤').context,'practical');assert.equal(personalityDelivery('你好').context,'casual');
 const f=await fixture(t);f.chat.changeRole(f.store.saveRole({id:f.role.id,chatter:'quiet',personality:{mode:'form',preset:'puppy'}}));assert.equal(f.chat.eligibleForProactive(),false);assert.equal(f.chat.handshake().role.personality.preset,'puppy');assert.match(f.chat.buildContext('附近有新发现',{proactive:true}).sections.find(s=>s.id==='personality-delivery').text,/保持沉默/);
});
test('native and web saves share personality, old clients preserve it and stale role writes are rejected',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-personality-api-')),app=await createApp({directory:dir,port:0,companionProfiles:[{id:'p',gameDir:path.join(dir,'game'),loader:'fabric'}]});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});
 const module=await fetch(app.url+'/personality.js');assert.equal(module.status,200);assert.match(module.headers.get('content-type'),/javascript/);assert.match(await module.text(),/setupPersonality/);
 const state=await fetch(app.url+'/api/state').then(r=>r.json()),role=app.store.role(state.selectedRole),chat=app.companion.chat,profile=app.companion.profiles[0];const {sessionId}=chat.attach({profileId:'p',clientId:'c',world:'A',pack:'p',role});chat.update(1,{dimension:'overworld',active:true});
 const native=body=>fetch(app.url+'/companion/v1/appearance',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+profile.token},body:JSON.stringify({sessionId,roleId:role.id,...body})});
 const saved=await native({personality:{mode:'form',preset:'kitten'},appearance:{form:'puppy'}});assert.equal(saved.status,200);assert.equal((await saved.json()).role.personality.preset,'kitten');
 const legacy=await native({appearance:{color:'#123456'}}).then(r=>r.json());assert.equal(legacy.role.personality.preset,'kitten');assert.equal(legacy.role.persona,role.persona);assert.equal((await native({roleId:'stale',personality:{mode:'role'}})).status,400);
 const web=await fetch(app.url+'/api/roles',{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify({id:role.id,personality:{mode:'custom',custom:'温柔安静，不加口癖'}})});assert.equal(web.status,200);assert.equal(chat.handshake().role.personality.custom,'温柔安静，不加口癖');
 const rejected=await native({personality:{mode:'custom',custom:''}});assert.equal(rejected.status,400);assert.equal(app.store.role(role.id).personality.custom,'温柔安静，不加口癖');
});
