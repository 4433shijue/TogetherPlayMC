import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateAppearance,defaultAppearance} from '../src/appearance.mjs';
import {orbForms,orbCatalogue} from '../src/orb-forms.mjs';
import {Store} from '../src/store.mjs';
import {importCard,exportCard} from '../src/cards.mjs';
import {flowerGift,observeKeepsake,rememberKeepsake,keepsakes} from '../src/keepsakes.mjs';
import {proposePlace,decidePlace} from '../src/place-dialogue.mjs';
import {createApp} from '../src/server.mjs';

async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-style-')),store=new Store(directory);t.after(async()=>{store.close();await fs.rm(directory,{recursive:true,force:true});});return {store,role:store.roles()[0]};}
const custom={dogBreed:'beagle',coatPattern:'calico',muzzleColor:'#ABCDEF',innerEarColor:'#A98174',noseColor:'#765432',markingColor:'#454545',markingColor2:'#EDAB76',mode:'gradient',color:'#102345',color2:'#cdefff',coreColor:'#F09020',accentColor:'#7823AD',accessoryColor:'#990042',eyeColor:'#EEFFDD',autoEyeColor:false,ears:'round',accessory:'flower',reducedMotion:true,softBody:false};
test('old appearances retain their colors, expressions and chat style; invalid values cannot reach renderers',()=>{
 const old=validateAppearance({color:'#ABCDEF',color2:'#123456',face:false,chatColor:'#FFEEDD'});assert.equal(old.form,'orb');assert.equal(old.color,'#ABCDEF');assert.equal(old.face,false);assert.equal(old.chatColor,'#FFEEDD');
 for(const bad of [{form:'url'},{ears:'cat'},{accessory:'sword'},{coreColor:'red'},{accentColor:'#1234'},{eyeColor:null},{autoEyeColor:'false'},{softBody:0},{face:null},null])assert.throws(()=>validateAppearance(bad));
 assert.equal(validateAppearance({...defaultAppearance(),unknown:'ignored'}).unknown,undefined);
});
test('every shape preserves independent colors through partial edits, storage reopen and role-card export/import',async t=>{
 const {store,role}=await fixture(t);store.saveRole({id:role.id,appearance:custom});
 for(const f of orbForms){const saved=store.saveRole({id:role.id,appearance:{form:f.id}});assert.deepEqual(saved.appearance,validateAppearance({...custom,form:f.id}));const card=importCard(Buffer.from(JSON.stringify(exportCard(saved))));const copy=store.saveRole(card.role);assert.deepEqual(copy.appearance,saved.appearance);}
 const reopened=new Store(store.directory);try{assert.deepEqual(reopened.role(role.id).appearance,store.role(role.id).appearance);}finally{reopened.close();}
});
test('shared catalogues match the web and both native loaders; accessories stay available for every form',async()=>{
 for(const file of ['web/orb-forms.json','companion-mod/common/src/main/resources/assets/together_companion/orb-forms.json'])assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),orbCatalogue);
 assert.equal(orbForms.length,7);for(const f of orbForms)for(const accessory of ['none','scarf','hat','flower'])assert.equal(validateAppearance({...f.palette,form:f.id,accessory}).accessory,accessory);
});
test('keepsakes require observed or confirmed events, deduplicate, and isolate companions and worlds',async t=>{
 const {store,role}=await fixture(t),scope={role:role.id,world:'A',dimension:'overworld'};
 const p=proposePlace(store,scope,'家',{position:{x:10,y:64,z:0}});assert.equal(keepsakes(store,role.id).length,0);decidePlace(store,scope,p.id,true);assert.equal(keepsakes(store,role.id)[0].id,'home');
 assert.equal(observeKeepsake(store,scope,{biome:'minecraft:plains',active:true}),false);assert.equal(observeKeepsake(store,scope,{biome:'minecraft:snowy_plains',active:false}),false);
 assert.equal(observeKeepsake(store,scope,{biome:'minecraft:snowy_plains',active:true},100),true);assert.equal(observeKeepsake(store,scope,{biome:'minecraft:snowy_plains',active:true},200),false);
 rememberKeepsake(store,scope,'flower',300);rememberKeepsake(store,{...scope,world:'B'},'flower',400);assert.equal(keepsakes(store,role.id,'A').length,3);assert.equal(keepsakes(store,role.id,'B').length,1);assert.deepEqual(keepsakes(store,'someone-else'),[]);assert.equal(rememberKeepsake(store,scope,'anything'),false);
});
test('a flower gift is an explicit local gesture, not a question, quote, negation or plan',()=>{
 for(const text of ['送你一朵花','我送给你一束鲜花！','给你这朵花，戴上吧','送你花'])assert.equal(flowerGift(text),true,text);
 for(const text of ['不要送你花','如果我送你一朵花','明天送你一朵花','我想送你一朵花','怎么送你花','送你花吗？','他说“送你一朵花”','我没有送你花','可以送你一朵花吗','我种了一朵花','我给你花粉'])assert.equal(flowerGift(text),false,text);
});
test('web and native saves keep all custom parts; old color-only clients do not erase new style; gift uses no provider',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-style-api-'));let calls=0;
 const app=await createApp({directory,port:0,companionProfiles:[{id:'fixture',loader:'fabric',gameDir:directory}],companionRequest:async()=>{calls++;throw Error('Unexpected provider call');}});
 t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});
 const state=await fetch(app.url+'/api/state').then(r=>r.json()),profile=app.companion.profiles[0],chat=app.companion.chat;
 const web=(route,body)=>fetch(app.url+route,{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify(body)});
 const role=await web('/api/roles',{id:state.selectedRole,appearance:{...custom,form:'puppy'}}).then(r=>r.json());
 chat.attach({profileId:profile.id,clientId:'c',world:'fixture:test',pack:profile.id,role});chat.update(1,{dimension:'overworld',position:{x:0,y:64,z:0},active:true,biome:'minecraft:snowy_plains'});
 const native=(body,token=profile.token)=>fetch(app.url+'/companion/v1/appearance',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({sessionId:chat.client.sessionId,...body})});
 assert.equal((await native({appearance:{form:'cloud'}},'invalid')).status,403);
 const saved=await native({roleId:role.id,appearance:{form:'planet'}}).then(r=>r.json());assert.deepEqual(saved.role.appearance,validateAppearance({...custom,form:'planet'}));
 const legacy=await native({appearance:{color:'#334455',color2:'#AABBCC',mode:'solid',face:true,reducedMotion:false}}).then(r=>r.json());assert.equal(legacy.role.appearance.form,'planet');assert.equal(legacy.role.appearance.accentColor,custom.accentColor);assert.equal(legacy.role.appearance.autoEyeColor,false);for(const key of ['dogBreed','coatPattern','muzzleColor','innerEarColor','noseColor','markingColor','markingColor2'])assert.equal(legacy.role.appearance[key],custom[key]);
 assert.equal((await native({roleId:'other',appearance:{form:'cloud'}})).status,400);
 await chat.receive('送你一朵花');assert.equal(calls,0);const records=await fetch(app.url+'/api/companion/keepsakes?role='+role.id).then(r=>r.json());assert.deepEqual(records.map(x=>x.id),['flower','snow']);
 for(const route of ['/orb-style.js','/orb-shape.js','/orb-forms.json'])assert.equal((await fetch(app.url+route)).status,200);
});
