import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {installProfile,restoreProfile} from '../src/companion-install.mjs';
import {gameTargets,companionJar,sameTarget} from '../src/game-versions.mjs';
import {scanGames} from '../src/game-profiles.mjs';
import {inspectModBuild} from '../src/mod-build.mjs';

test('selects and restores the matching companion without duplicating a renamed Fabric API',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'together-targets-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 assert.equal(sameTarget({loader:'fabric'},{version:'1.21.1',loader:'fabric'}),false);
 for(const [i,target] of gameTargets.entries()){
   const {version,loader}=target,name=companionJar(target),game=path.join(base,'v'+i),mods=path.join(game,'mods');
   const dist=process.env.TOGETHER_TEST_MODS||path.join(base,'dist');await fs.mkdir(mods,{recursive:true});
   if(!process.env.TOGETHER_TEST_MODS){await fs.mkdir(dist,{recursive:true});await fs.writeFile(path.join(dist,name),'fixture:'+name);}
   await fs.writeFile(path.join(game,'v'+i+'.json'),JSON.stringify({inheritsFrom:version,libraries:[{name:loader==='forge'?'net.minecraftforge:forge:47.4.22':'net.fabricmc:fabric-loader:0.16.14'}]}));
   const [p]=await scanGames(game);assert.equal(p.supported,true);assert.equal(p.version,version);assert.equal(p.loader,loader);
   const api='renamed-dependency.jar';if(loader==='fabric')await fs.writeFile(path.join(mods,api),zipSync({'fabric.mod.json':strToU8('{"id":"fabric-api"}')}));
   const m=await installProfile({...p,id:'qa-target-'+i+'-'+Date.now(),token:'fixture'},{dist,endpoint:'http://127.0.0.1:1',directory:base});
   assert.equal(m.installed,name);assert.deepEqual(await fs.readFile(path.join(mods,name)),await fs.readFile(path.join(dist,name)));
   assert.equal((await inspectModBuild(game,loader,dist,version)).status,'current');
   assert.deepEqual((await fs.readdir(mods)).sort(),(loader==='forge'?[name]:[api,name]).sort());
   await restoreProfile(m);assert.deepEqual(await fs.readdir(mods),loader==='forge'?[]:[api]);
 }
});
