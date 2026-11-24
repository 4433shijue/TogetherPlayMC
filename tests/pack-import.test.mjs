import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {PackKnowledge} from '../src/pack-knowledge.mjs';
import {inspectPack} from '../src/pack-reader.mjs';
import {PackImports} from '../src/pack-imports.mjs';
import {createApp} from '../src/server.mjs';
import {scanGames} from '../src/game-profiles.mjs';

const bytes=s=>strToU8(typeof s==='string'?s:JSON.stringify(s)),zip=m=>zipSync(Object.fromEntries(Object.entries(m).map(([k,v])=>[k,v instanceof Uint8Array?v:bytes(v)])));
const recipe='kubejs/data/demo/recipes/moon.json',manual='patchouli_books/demo/en_us/entries/moon.json',raw={type:'minecraft:crafting_shapeless',ingredients:[{item:'demo:offline_ingredient'}],result:{item:'demo:moon'}};
const sample={'version.json':{inheritsFrom:'1.20.1',libraries:[{name:'net.minecraftforge:forge:1.20.1'}]},[recipe]:raw,[manual]:{name:'Moon journal',text:'crystalline moon'},'config/ftbquests/quests/a.snbt':'{quests:[{id:"abcdef",title:"Moon quest"}]}','config/together-companion.json':{token:'never_read'},'saves/private/patchouli_books/x.json':{name:'never_read'}};
const temp=async t=>{const p=await fs.mkdtemp(path.join(os.tmpdir(),'together-import-test-'));t.after(()=>fs.rm(p,{recursive:true,force:true}));return p;};
async function writeTree(dir,map){for(const [k,v] of Object.entries(map)){const f=path.join(dir,k);await fs.mkdir(path.dirname(f),{recursive:true});await fs.writeFile(f,v instanceof Uint8Array?v:bytes(v));}}
async function library(t,profiles=[]){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-import-test-')),store=new Store(dir),k=new PackKnowledge(store),im=new PackImports(k,profiles);t.after(async()=>{await im.close();store.close();await fs.rm(dir,{recursive:true,force:true});});return {dir,store,k,im};}
async function imported(im,input){im.start(input);await im.job.task;assert.equal(im.job.status,'ready',im.job.error);return im.job.pack;}

test('imports wrapped ZIP, nested JAR manuals and recipes, ignores private files and unrecognized quests',async t=>{
 const dir=await temp(t),p=path.join(dir,'demo.zip'),content={...sample,'mods/book.jar':zip({'data/demo/recipes/lamp.json':raw,'data/demo/patchouli_books/test/en_us/entries/sun.json':{name:'Sun manual'}}),'config/custom/quests.json':{title:'never_read'}};
 await fs.writeFile(p,zip(Object.fromEntries(Object.entries(content).map(([k,v])=>['my-pack/'+k,v]))));
 const result=await inspectPack({file:p});assert.equal(result.pack.version,'1.20.1');assert.equal(result.pack.loader,'forge');assert.equal(result.pack.mods,1);
 assert.deepEqual(result.pack.counts,{recipe:2,manual:2,quest:1});assert.ok(result.docs.some(d=>d.source.startsWith('mods/book.jar!/')));
 assert.doesNotMatch(JSON.stringify(result),/never_read|together-companion\.json|saves\/private/);
});
test('Modrinth and CurseForge manifests stay offline, respect client overrides, and never invent sources',async t=>{
 const dir=await temp(t),file=path.join(dir,'a.mrpack'),jar=zip({}),sha=createHash('sha512').update(jar).digest('hex');
 const m={game:'minecraft',formatVersion:1,name:'Night',versionId:'v1',dependencies:{minecraft:'1.20.1','fabric-loader':'x'},files:[{path:'mods/a.jar',hashes:{sha512:sha},downloads:['https://invalid.example/file.jar']}]};
 await fs.writeFile(file,zip({'modrinth.index.json':m}));let r=await inspectPack({file});assert.deepEqual(r.pack.counts,{});assert.equal(r.facts['mods/a.jar'],sha);assert.equal(r.pack.mods,1);
 await fs.writeFile(file,zip({'modrinth.index.json':m,['overrides/'+manual]:{name:'old'},['client-overrides/'+manual]:{name:'new'},['server-overrides/'+manual]:{name:'secret'}}));r=await inspectPack({file});assert.deepEqual(r.docs.map(d=>d.title),['new']);
 await fs.writeFile(file,zip({'manifest.json':{manifestType:'minecraftModpack',manifestVersion:1,name:'Night',minecraft:{version:'1.21',modLoaders:[{id:'neoforge-1',primary:true}]},files:[{projectID:42,fileID:87}]}}));r=await inspectPack({file});assert.equal(r.pack.loader,'neoforge');assert.equal(r.pack.mods,1);assert.deepEqual(r.docs,[]);
});
test('content identity, cancellation, broken archives and restart preserve committed search and previous data',async t=>{
 const {im,k,dir}=await library(t),file=path.join(dir,'game.zip');await fs.writeFile(file,zip(sample));const id=await imported(im,{file});
 assert.equal(await imported(im,{file}),id);const other=new Store(dir);try{const k2=new PackKnowledge(other);assert.equal(k2.search(id,'crystalline')[0].source,manual);}finally{other.close();}
 await fs.writeFile(file,zip({...sample,'config/demo.toml':'setting=true'}));assert.notEqual(await imported(im,{file}),id);
 const job=im.start({file});im.cancel(job.id);await im.job.task;assert.equal(im.job.status,'cancelled');
 await fs.writeFile(file,Buffer.from('invalid zip'));im.start({file});await im.job.task;assert.equal(im.job.status,'error');
 assert.equal(im.list().length,2);assert.equal(k.search(id,'crystalline').length,1);
 assert.equal(k.db.prepare("SELECT count(*) n FROM companion_documents WHERE pack LIKE 'import-stage:%'").get().n,0);
});
test('rejects unsafe entry and manifest paths; rejects unreasonable metadata without extraction',async t=>{
 const dir=await temp(t),file=path.join(dir,'untrusted.zip');
 for(const data of [{'../outside.txt':'bad'},{'modrinth.index.json':{game:'minecraft',formatVersion:1,files:[{path:'C:/outside.jar'}]}},{'manifest.json':{manifestType:'minecraftModpack',manifestVersion:1,files:[],overrides:'../other'}},{'modrinth.index.json':' '.repeat(4*1024**2+1)}]){
   await fs.writeFile(file,zip(data));await assert.rejects(inspectPack({file}));}
});
test('matches by content, reports ambiguity and differences, confirms before binding, rejects unsupported games',async t=>{
 const dir=await temp(t),a=path.join(dir,'a'),b=path.join(dir,'b');await writeTree(a,sample);await writeTree(b,sample);
 const profiles=[{id:'a',name:'Same',gameDir:a,loader:'forge'},{id:'b',name:'Same',gameDir:b,loader:'forge'},{id:'c',name:'Same',gameDir:a,loader:'fabric'}],{im,store}=await library(t,profiles);
 const id=await imported(im,{folder:a});assert.equal((await im.matches(id)).recommended,null);
 await writeTree(b,{[recipe]:{changed:true}});const m=await im.matches(id);assert.equal(m.recommended,'a');assert.equal(m.candidates.find(c=>c.id==='b').changed,1);assert.equal(store.get('pack-binding:a'),null);
 await im.bind(id,'a');assert.equal(store.get('pack-binding:a'),id);await assert.rejects(im.bind(id,'c'));await im.bind(id,'a',true);assert.equal(store.get('pack-binding:a'),null);
});
test('user-selected PCL root discovers instances without adding them before confirmation',async t=>{
 const {im,dir}=await library(t),g=path.join(dir,'versions','Example');await writeTree(g,{...sample,'Example.json':sample['version.json'],'PCL/Setup.ini':'VersionArgumentIndie=1'});const id=await imported(im,{folder:g});
 assert.ok((await im.matches(id)).recommended?.startsWith('scanned:'));
 const res=await im.matches(id,dir);assert.ok(res.recommended?.startsWith('scanned:'));assert.equal(im.profiles.length,0);await im.bind(id,res.recommended);assert.equal(im.profiles.length,1);assert.equal(im.list()[0].bound.length,1);
});
test('mixed loader dependencies cannot make Quilt or NeoForge look like a supported instance',async t=>{
 const root=await temp(t);
 for(const [name,libs] of [['quilt',['org.quiltmc:quilt-loader:1','net.fabricmc:intermediary:1.20.1']],['neoforge',['net.neoforged:forge:1','net.minecraftforge:loader:1']]]){
   const dir=path.join(root,name);await writeTree(dir,{[name+'.json']:{inheritsFrom:'1.20.1',libraries:libs.map(name=>({name}))}});
   const [p]=await scanGames(dir);assert.equal(p.loader,name);assert.equal(p.supported,false);
 }
});
test('runtime recipes replace stale archive claims only in their own world and preserve quest visibility',async t=>{
 const {im,k,store,dir}=await library(t),file=path.join(dir,'p.zip');await fs.writeFile(file,zip(sample));const id=await imported(im,{file});store.set('pack-binding:game',id);
 k.ingest('game',[{id:'moon',kind:'recipe',title:'Moon',text:'current_ingredient'}],{world:'A',begin:true,finished:true});
 assert.equal(k.search('game','moon',{world:'A'}).filter(d=>d.kind==='recipe')[0].text,'current_ingredient');
 assert.ok(!k.search('game','offline_ingredient',{world:'A'}).some(d=>d.kind==='recipe'));
 assert.ok(k.search('game','offline_ingredient',{world:'B'}).some(d=>d.kind==='recipe'));assert.ok(!k.search('game','current_ingredient',{world:'B'}).length);
 assert.ok(!k.search('game','Moon',{world:'A'}).some(d=>d.kind==='quest'));assert.ok(k.search(id,'Moon',{spoilers:true}).some(d=>d.kind==='quest'));
});
test('loopback upload, offline search and authorization use the same API as the control panel',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-import-http-')),app=await createApp({directory,port:0,companionProfiles:[]});t.after(async()=>{await app.close();await fs.rm(directory,{recursive:true,force:true});});
 const url=app.url+'/api/companion/pack-import',csrf=(await(await fetch(app.url+'/api/state')).json()).csrf;
 const post=async(b)=>{const r=await fetch(url,{method:'POST',headers:{'x-together-token':csrf,'content-type':'application/json'},body:JSON.stringify(b)});assert.ok(r.ok);return r.json();};
 assert.equal((await fetch(url,{method:'POST',body:'{}'})).status,403);const {id}=await post({action:'start',name:'demo.zip'});
 const r=await fetch(url+'?upload='+id,{method:'POST',headers:{'x-together-token':csrf},body:zip(sample)});const state=await r.json();assert.equal(state.job.status,'ready',JSON.stringify(state.job));assert.equal((await post({action:'search',pack:state.job.pack,query:'crystalline'}))[0].source,manual);
});
