import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {installProfile,restoreProfile} from '../src/companion-install.mjs';
import {gameTarget,gameTargets,companionJar,sameTarget} from '../src/game-versions.mjs';
import {scanGames} from '../src/game-profiles.mjs';
import {inspectModBuild} from '../src/mod-build.mjs';

test('selects and restores the matching companion without duplicating a renamed Fabric API',async t=>{
 const prior=process.env.TOGETHER_NEOFORGE_PREVIEW;
 t.after(()=>{if(prior===undefined)delete process.env.TOGETHER_NEOFORGE_PREVIEW;else process.env.TOGETHER_NEOFORGE_PREVIEW=prior;});
 delete process.env.TOGETHER_NEOFORGE_PREVIEW;assert.equal(gameTarget('1.21.1','neoforge'),undefined);
 process.env.TOGETHER_NEOFORGE_PREVIEW='1';
 assert.equal(gameTarget('1.21.1','forge'),undefined);assert.equal(gameTarget('1.21','neoforge'),undefined);
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'together-targets-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 assert.equal(sameTarget({loader:'fabric'},{version:'1.21.1',loader:'fabric'}),false);
 for(const [i,target] of gameTargets.entries()){
   const {version,loader}=target,name=companionJar(target),game=path.join(base,'v'+i),mods=path.join(game,'mods');
   const dist=process.env.TOGETHER_TEST_MODS||path.join(base,'dist');await fs.mkdir(mods,{recursive:true});
   if(!process.env.TOGETHER_TEST_MODS){await fs.mkdir(dist,{recursive:true});await fs.writeFile(path.join(dist,name),'fixture:'+name);}
   await fs.writeFile(path.join(game,'v'+i+'.json'),JSON.stringify({inheritsFrom:version,libraries:[{name:({neoforge:'net.neoforged:neoforge:21.1.217',forge:'net.minecraftforge:forge:47.4.22',fabric:'net.fabricmc:fabric-loader:0.16.14'})[loader]}]}));
   const [p]=await scanGames(game);assert.equal(p.supported,true);assert.equal(p.version,version);assert.equal(p.loader,loader);
   const api='renamed-dependency.jar';if(loader==='fabric')await fs.writeFile(path.join(mods,api),zipSync({'fabric.mod.json':strToU8('{"id":"fabric-api"}')}));
   const old='together-companion-neoforge-1.21.1-0.5.0.jar';
   if(loader==='neoforge')await fs.writeFile(path.join(mods,old),'previous build');
   const m=await installProfile({...p,id:'qa-target-'+i+'-'+Date.now(),token:'fixture'},{dist,endpoint:'http://127.0.0.1:1',directory:base});
   assert.equal(m.installed,name);assert.deepEqual(await fs.readFile(path.join(mods,name)),await fs.readFile(path.join(dist,name)));
   assert.equal((await inspectModBuild(game,loader,dist,version)).status,'current');
   assert.deepEqual((await fs.readdir(mods)).sort(),(loader==='fabric'?[api,name]:[name]).sort());
   await restoreProfile(m);assert.deepEqual(await fs.readdir(mods),loader==='fabric'?[api]:loader==='neoforge'?[old]:[]);
   if(loader==='neoforge')assert.equal(await fs.readFile(path.join(mods,old),'utf8'),'previous build');
 }
});
