import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {createApp} from '../src/server.mjs';
import {createSnapshot,listSnapshots,previewSnapshot,restoreSnapshot,snapshotRoot,recoverInterruptedRestore} from '../src/data-snapshots.mjs';
async function fixture(t,cleanup=true){const root=await fs.mkdtemp(path.join(os.tmpdir(),'together-snap-')),directory=path.join(root,'data');if(cleanup)t.after(()=>fs.rm(root,{recursive:true,force:true}));return {root,directory};}
test('snapshot restores database and media, preserves current port and creates recovery point',async t=>{
 const {directory}=await fixture(t);let store=new Store(directory);const role=store.roles()[0].id;
 store.memory(role,'','fact','旧记忆');await fs.mkdir(path.join(directory,'journey-media'));await fs.writeFile(path.join(directory,'journey-media','one'),'photo');
 const snapshot=await createSnapshot(directory);store.memory(role,'','fact','后来记下的');await fs.writeFile(path.join(directory,'journey-media','two'),'new photo');await fs.writeFile(path.join(directory,'connection.json'),'{"port":39999}');store.close();
 const preview=await previewSnapshot(directory,snapshot.id);assert.equal(preview.current.memories,2);assert.equal(preview.counts.memories,1);
 const result=await restoreSnapshot(directory,snapshot.id,preview.token);store=new Store(directory);assert.equal(store.memories(role).length,1);store.close();
 assert.equal(await fs.readFile(path.join(directory,'connection.json'),'utf8'),'{"port":39999}');assert.equal(await fs.readFile(path.join(directory,'journey-media','one'),'utf8'),'photo');await assert.rejects(fs.access(path.join(directory,'journey-media','two')));
 assert.equal((await listSnapshots(directory)).length,2);assert.equal((await previewSnapshot(directory,result.before)).counts.memories,2);
});
test('tampered backup and stale preview cannot overwrite current data',async t=>{
 const {directory}=await fixture(t);const store=new Store(directory);const snapshot=await createSnapshot(directory);store.close();
 const preview=await previewSnapshot(directory,snapshot.id);await assert.rejects(restoreSnapshot(directory,snapshot.id,'wrong'),/重新预览/);
 await fs.appendFile(path.join(snapshotRoot(directory),snapshot.id,'together.sqlite'),'tampered');await assert.rejects(restoreSnapshot(directory,snapshot.id,preview.token),/不完整|变化/);
 await assert.rejects(previewSnapshot(directory,'../outside'),/编号/);
});
test('failure part way through file swap recovers all original files',async t=>{
 const {directory}=await fixture(t);let store=new Store(directory);const role=store.roles()[0].id;store.memory(role,'','fact','before');const snapshot=await createSnapshot(directory);store.memory(role,'','fact','latest');store.close();
 const p=await previewSnapshot(directory,snapshot.id);await assert.rejects(restoreSnapshot(directory,snapshot.id,p.token,{afterMove(){throw Error('simulated move failure');}}),/已保留/);
 store=new Store(directory);assert.equal(store.memories(role).length,2);store.close();assert.equal(await recoverInterruptedRestore(directory),false);
});
test('storage API requires preview and reloads the runtime after a successful restore',async t=>{
 const {directory,root}=await fixture(t,false);const app=await createApp({directory,port:0,companionProfiles:[]});t.after(async()=>{await app.close();await fs.rm(root,{recursive:true,force:true});});
 const state=await fetch(app.url+'/api/state').then(r=>r.json());const post=async(route,b={})=>{const r=await fetch(app.url+'/api/storage/'+route,{method:'POST',headers:{'content-type':'application/json','x-together-token':state.csrf},body:JSON.stringify(b)});return {status:r.status,data:await r.json()};};
 const snap=(await post('backup')).data;app.store.memory(state.selectedRole,'','fact','after snapshot');
 assert.equal((await post('restore',{id:snap.id})).status,400);
 const p=(await post('preview',{id:snap.id})).data;assert.equal(p.current.memories,1);assert.equal((await post('restore',{id:snap.id,token:p.token})).status,200);
 assert.equal(app.store.memories(state.selectedRole).length,0);assert.equal((await fetch(app.url+'/api/state').then(r=>r.json())).selectedRole,state.selectedRole);
});
