import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {zipSync,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
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

test('Windows reads 7z, tar and gzip/xz/bzip2 tar with the same recipe and Chinese lookup',{skip:process.platform!=='win32'},async t=>{
 const {im,k,dir}=await library(t);
 const entries={};for(let i=0;i<100;i++)entries['data/demo/recipe/variant'+i+'.json']={...raw,result:{id:'demo:variant'+i}};
 const names=Object.fromEntries(Array.from({length:100},(_,i)=>['item.demo.variant'+i,'精灵球变体'+i]));names['item.demo.ball']='精灵球';
 entries['data/demo/recipe/ball.json']={...raw,result:{id:'demo:ball',count:4}};entries['assets/demo/lang/zh_cn.json']=names;
 await writeTree(dir,{'mods/ball.jar':zip(entries)});
 for(const [ext,options] of [['7z',['--format=7zip']],['tar',[]],['tar.gz',['-z']],['tar.xz',['-J']],['tar.bz2',['-j']]]){
   const file=path.join(dir,'tiny.'+ext);execFileSync('tar.exe',[...options,'-cf',file,'-C',dir,'mods'],{windowsHide:true});
   const id=await imported(im,{file});const [hit]=k.search(id,'精灵球怎么做？');
   assert.equal(hit.title,'精灵球 · demo:ball',ext);assert.equal(hit.source,'mods/ball.jar!/data/demo/recipe/ball.json');
 }
});
test('stored RAR imports a real manual without a rar executable',async t=>{
 const {im,k,dir}=await library(t),file=path.join(dir,'book.rar');
 // One RAR4 store-method member: patchouli_books/test/entry.json.
 await fs.writeFile(file,Buffer.from('UmFyIRoHAM+QcwAADQAAAAAAAABZPnQAgD8AFQAAABUAAAACE2eYbgAAAAAUMB8AIAAAAHBhdGNob3VsaV9ib29rcy90ZXN0L2VudHJ5Lmpzb257Im5hbWUiOiJSQVIgbWFudWFsIn0EsHsAAAcA','base64'));
 const id=await imported(im,{file});assert.equal(im.list()[0].format,'rar');assert.equal(k.search(id,'RAR manual')[0].source,'patchouli_books/test/entry.json');
});

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
 const dir=await temp(t),a=path.join(dir,'a'),b=path.join(dir,'b'),tree={...sample,'mods/book.jar':zip({})};await writeTree(a,tree);await writeTree(b,tree);
 const profiles=[{id:'a',name:'Same',gameDir:a,loader:'forge'},{id:'b',name:'Same',gameDir:b,loader:'forge'},{id:'c',name:'Same',gameDir:a,loader:'fabric'}],{im,store}=await library(t,profiles);
 const id=await imported(im,{folder:a});assert.equal((await im.matches(id)).recommended,null);
 await writeTree(b,{[recipe]:{changed:true}});const m=await im.matches(id);assert.equal(m.recommended,'a');assert.equal(m.candidates.find(c=>c.id==='b').changed,1);assert.equal(store.get('pack-binding:a'),null);
 await im.bind(id,'a');assert.equal(store.get('pack-binding:a'),id);await assert.rejects(im.bind(id,'c'));await im.bind(id,'a',true);assert.equal(store.get('pack-binding:a'),null);
});
test('user-selected PCL root binds a library without creating a game profile or token',async t=>{
 const {im,dir}=await library(t),g=path.join(dir,'versions','Example');await writeTree(g,{...sample,'mods/book.jar':zip({}),'Example.json':sample['version.json'],'PCL/Setup.ini':'VersionArgumentIndie=1'});const id=await imported(im,{folder:g});
 assert.ok((await im.matches(id)).recommended?.startsWith('scanned:'));
 const res=await im.matches(id,dir);assert.ok(res.recommended?.startsWith('scanned:'));assert.equal(im.profiles.length,0);await im.bind(id,res.recommended);assert.equal(im.profiles.length,0);assert.equal(im.list()[0].bound.length,1);
});
test('unknown archive matches an old renamed Forge instance, survives restart and supplements without modifying the game',async t=>{
 const {im,dir,k,store}=await library(t),launcher=path.join(dir,'launcher'),g=path.join(launcher,'周末副本'),file=path.join(dir,'share.zip');
 const jar=zip({'assets/demo/patchouli_books/demo/zh_cn/entries/moon.json':{name:'月光手册',text:'离线资料'}}),tree={'mods/guide.jar':jar};
 await writeTree(g,{...tree,'version.json':{inheritsFrom:'1.12.2',libraries:[{name:'net.minecraftforge:forge:1.12.2-14.23'}]}});
 await fs.writeFile(file,zip(tree));await im.matcher.root(launcher);const id=await imported(im,{file});
 assert.equal(k.pack(id).version,'');const m=await im.matches(id);assert.ok(m.recommended);assert.equal(m.candidates[0].canInstall,false);
 await im.bind(id,m.recommended);await assert.rejects(im.installCandidate(id,m.recommended));assert.equal(store.get('gameProfiles'),null);
 await writeTree(g,{[manual]:{name:'本机独有',text:'蓝莓蛋糕'}});
 const before=await fs.readdir(g);im.supplement(id,m.recommended);await im.job.task;assert.equal(im.job.status,'ready',im.job.error);
 assert.equal(im.search(id,'蓝莓蛋糕').length,0);assert.match(im.search(id,'蓝莓蛋糕',m.recommended)[0].source,/周末副本.*moon.json/);
 assert.deepEqual(await fs.readdir(g),before);const again=new PackImports(k,[]);try{assert.deepEqual(again.matcher.roots(),[await fs.realpath(launcher)]);assert.ok(again.bound(id)[0].index);}finally{await again.close();}
 await im.bind(id,m.recommended,true);assert.equal(im.bound(id).length,0);assert.throws(()=>im.search(id,'月光',m.recommended));assert.ok(im.search(id,'月光').length);
 await im.matcher.root(launcher,true);assert.deepEqual((await im.matches(id)).candidates,[]);
});
test('unknown loose folders, zero-evidence manifests and config-only hits are never auto-selected',async t=>{
 const {im,dir}=await library(t),game=path.join(dir,'Loose'),archive=path.join(dir,'pack.zip');
 await writeTree(game,{[manual]:{name:'内容'}});await im.matcher.root(game);
 for(const tree of [{[manual]:{name:'内容'}},{'manifest.json':{manifestType:'minecraftModpack',manifestVersion:1,files:[{projectID:1,fileID:2}]}}]){
   await fs.writeFile(archive,zip(tree));const id=await imported(im,{file:archive}),m=await im.matches(id);assert.equal(m.recommended,null);assert.equal(m.candidates[0].level,'possible');
   assert.equal(m.candidates[0].version,'');assert.equal(m.candidates[0].canInstall,false);
 }
});
test('a broken version descriptor does not discard readable manuals or invent a Minecraft version',async t=>{
 const dir=await temp(t),file=path.join(dir,'unknown.zip');await fs.writeFile(file,zip({'version.json':'{',[manual]:{name:'Moon journal'}}));
 const {pack,docs}=await inspectPack({file});assert.equal(pack.version,'');assert.equal(pack.loader,'unknown');assert.ok(pack.warnings.some(s=>s.includes('version.json')));assert.equal(docs[0].title,'Moon journal');
});
test('a launcher instance with separate component metadata resolves its game folder',async t=>{
 const {im,dir}=await library(t),root=path.join(dir,'instances','Renamed'),data=path.join(root,'.minecraft'),jar=zip({}),file=path.join(dir,'game.zip');
 await writeTree(root,{'mmc-pack.json':{components:[{uid:'net.minecraft',version:'1.12.2'},{uid:'net.minecraftforge',version:'14.23'}]}});
 await writeTree(data,{'mods/a.jar':jar});await fs.writeFile(file,zip({'mods/a.jar':jar}));await im.matcher.root(root);
 const result=await im.matches(await imported(im,{file})),c=result.candidates[0];assert.equal(c.version,'1.12.2');assert.equal(c.loader,'forge');assert.equal(c.path,await fs.realpath(data));assert.equal(result.recommended,c.id);assert.equal(c.canInstall,false);
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
