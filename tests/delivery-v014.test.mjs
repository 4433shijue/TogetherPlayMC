import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {zipSync,strToU8} from 'fflate';
import {inspectModBuild} from '../src/mod-build.mjs';
import {Store} from '../src/store.mjs';
import {ChatCompanion} from '../src/chat-companion.mjs';
import {PackKnowledge} from '../src/pack-knowledge.mjs';
import {OfficialResearch} from '../src/official-research.mjs';
test('mod diagnostics distinguish current bytes, old content and duplicate installs',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-mod-build-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const mods=path.join(dir,'game/mods'),artifacts=path.join(dir,'artifacts');await fs.mkdir(mods,{recursive:true});await fs.mkdir(artifacts);
 const name='together-companion-fabric-1.20.1-0.6.0.jar',bytes=zipSync({'together-build.json':strToU8('{"version":"0.14.0"}')});await fs.writeFile(path.join(artifacts,name),bytes);assert.equal((await inspectModBuild(path.join(dir,'game'),'fabric',artifacts)).status,'missing');
 await fs.writeFile(path.join(mods,name),bytes);assert.equal((await inspectModBuild(path.join(dir,'game'),'fabric',artifacts)).status,'current');
 await fs.writeFile(path.join(mods,name),zipSync({'old.txt':strToU8('old build')}));assert.equal((await inspectModBuild(path.join(dir,'game'),'fabric',artifacts)).status,'outdated');
 await fs.writeFile(path.join(mods,'together-companion-forge-1.20.1-0.6.0.jar'),bytes);assert.equal((await inspectModBuild(path.join(dir,'game'),'fabric',artifacts)).status,'conflict');
});
test('streaming drafts are transient and late chunks after cancel cannot reappear',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-stream-turn-')),store=new Store(dir),knowledge=new PackKnowledge(store);const events=[];let finish,sendText,started;const ready=new Promise(r=>started=r);
 const request=async(c,input,signal,onText)=>{assert.equal(c.stream,true);sendText=onText;onText('我正在');return new Promise(r=>{finish=r;started();});};
 const chat=new ChatCompanion({store,knowledge,research:new OfficialResearch(store),provider:()=>({model:'fixture',protocol:'openai',toolMode:'native'}),request,emit:e=>events.push(e)});
 t.after(async()=>{chat.close();knowledge.close();await store.context.drain();store.close();await fs.rm(dir,{recursive:true,force:true});});
 const role=store.roles()[0];chat.attach({profileId:'p',clientId:'c',world:'w',pack:'p',role});chat.update(1,{dimension:'overworld',active:true});
 const pending=chat.receive('陪我走走吧');await ready;assert.equal(chat.state().replyDraft,'我正在');assert.equal(store.conversation(role.id,'w').filter(e=>e.type==='reply').length,0);
 chat.cancel();sendText('不应该出现的尾巴');finish({content:'迟来的完整结果',calls:[],usage:{input:1,output:1}});await pending;
 assert.equal(chat.state().replyDraft,'');assert.equal(store.conversation(role.id,'w').filter(e=>e.type==='reply').length,0);assert.ok(events.some(e=>e.type==='companion_cancel'));
 const trace=store.context.list(role.id).requests[0];assert.equal(trace.status,'cancelled');assert.equal(trace.streamed,true);assert.ok(trace.firstTextMs>=0);
});
