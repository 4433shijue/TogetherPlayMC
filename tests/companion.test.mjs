import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import nbt from 'prismarine-nbt';
import {Store,protectSecret} from '../src/store.mjs';
import {importCard,exportCard,validateSkin} from '../src/cards.mjs';
import {ActionEngine,blueprint,validateAction} from '../src/actions.mjs';
import {createPracticeWorld} from '../src/practice-world.mjs';
import {createApp} from '../src/server.mjs';

async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-test-'));return dir;}
test('identity and world-scoped memory survive reopening, interrupted tasks do not resume',async t=>{
  const dir=await temp(t);let s=new Store(dir);const r=s.roles()[0];s.saveRole({id:r.id,name:'新名字',autonomy:'free',chatter:'chatty'});s.memory(r.id,'','fact','喜欢海边');s.memory(r.id,'A','home','{"x":10,"dimension":"overworld"}');s.memory(r.id,'B','home','{"x":90,"dimension":"overworld"}');s.task('task1',r.id,'A','running',{});s.close();s=new Store(dir);t.after(async()=>{s.close();await fs.rm(dir,{recursive:true,force:true});});assert.equal(s.role(r.id).gameName,r.gameName);assert.equal(s.role(r.id).autonomy,'free');assert.equal(s.role(r.id).chatter,'chatty');assert.equal(s.memories(r.id,'A').length,2);assert.equal(s.tasks(r.id,'A')[0].status,'interrupted');assert.ok(!s.memories(r.id,'A').some(m=>m.world==='B'));
});
test('DPAPI round trip does not store plaintext',{skip:process.platform!=='win32'},async()=>{const encrypted=await protectSecret('test-key-中文');assert.ok(!encrypted.includes('test-key'));assert.equal(await protectSecret(encrypted,true),'test-key-中文');});
test('V2/V3 cards import without executing extensions and own export omits identity',()=>{
  for(const spec of ['chara_card_v2','chara_card_v3']){const {role,warnings}=importCard(Buffer.from(JSON.stringify({spec,data:{name:'小伴',description:'温柔',first_mes:'你好',character_book:{entries:[{keys:['森林'],content:'森林里的家'}]},extensions:{script:'throw new Error("must not run")'}}})));assert.equal(role.greeting,'你好');assert.equal(role.book.length,1);assert.ok(warnings.length);assert.ok(role.extensions.originalCard);}
  const card=exportCard({id:'id',gameName:'fixed',skin:'file',name:'name'});assert.equal(card.role.id,undefined);assert.equal(card.role.gameName,undefined);assert.throws(()=>validateSkin(Buffer.from('not png')));
});
test('action validation rejects unknown and unbounded actions; blueprints are bounded and have a doorway',()=>{assert.throws(()=>validateAction({action:'eval',code:'x'}));assert.throws(()=>validateAction({action:'collect',count:999}));assert.throws(()=>validateAction({action:'goto',x:Infinity}));assert.throws(()=>validateAction({action:'collect',item:'../../file'}));const hut=blueprint('hut',{x:0,y:0,z:0},5);assert.ok(hut.length<150);assert.ok(!hut.some(p=>p.x===2&&p.y===1&&p.z===0));});
test('cancelled action cannot restart queued movement; world protection is dimension scoped',async t=>{
  const dir=await temp(t),store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const role=store.roles()[0],bot=new EventEmitter();Object.assign(bot,{health:20,game:{dimension:'overworld'},entity:{position:{x:0,y:64,z:0}},pathfinder:{setGoal(){}},clearControlStates(){},inventory:{items(){return []}}});
  const engine=new ActionEngine(bot,{owner:'Host',role,world:'A',store});let release;let executed=0;engine.execute=async(a,signal)=>{await new Promise(r=>release=r);engine.check(signal);executed++;return {};};
  const first=engine.run({action:'wait'});await new Promise(r=>setImmediate(r));const second=engine.run({action:'follow'});engine.stop();release();assert.equal((await first).ok,false);await assert.rejects(second,/取消/);assert.equal(executed,0);
  store.memory(role.id,'A','home',JSON.stringify({x:0,y:64,z:0,dimension:'overworld'}));assert.equal(engine.protected({x:1,y:64,z:1}),true);bot.game.dimension='the_nether';assert.equal(engine.protected({x:1,y:64,z:1}),false);
});
test('practice world is a new independent survival save with valid NBT',async t=>{const dir=await temp(t),a=await createPracticeWorld(dir);const parsed=await nbt.parse(await fs.readFile(path.join(a.directory,'level.dat')));const data=nbt.simplify(parsed.parsed).Data;assert.equal(data.GameType,0);assert.equal(data.allowCommands,0);assert.equal(data.WorldGenSettings.dimensions['minecraft:overworld'].generator.type,'minecraft:flat');assert.ok(await fs.stat(path.join(a.directory,'together-practice.json')));});
test('local server protects writes, excludes secrets and persists role settings',async t=>{
  const dir=await temp(t),app=await createApp({directory:dir,port:0});t.after(async()=>{await app.close();await fs.rm(dir,{recursive:true,force:true});});const state=await fetch(app.url+'/api/state').then(r=>r.json());assert.equal(state.provider.key,undefined);const bad=await fetch(app.url+'/api/roles',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(bad.status,403);
  const foreign=await fetch(app.url+'/api/state',{headers:{Origin:'https://foreign.example'}});assert.equal(foreign.status,403);
  const saved=await fetch(app.url+'/api/roles',{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify({id:state.selectedRole,autonomy:'close',chatter:'quiet'})}).then(r=>r.json());assert.equal(saved.autonomy,'close');assert.equal(saved.chatter,'quiet');
  const exported=await fetch(app.url+'/api/roles/export').then(r=>r.json());assert.equal(exported.role.gameName,undefined);assert.ok(!JSON.stringify(exported).includes('encryptedKey'));
});
