import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {orbCatalogue as catalogue} from '../src/orb-forms.mjs';
import {dogBreeds,catCoats} from '../src/orb-animals.mjs';
import {orbFaces} from '../src/orb-faces.mjs';
import {buildOrbMeshes} from '../src/orb-geometry.mjs';
import {fitParts,surfaceHeight,modelTriangles,featureInk,partPose} from '../src/orb-render.mjs';
import {validateAppearance} from '../src/appearance.mjs';
import {Store} from '../src/store.mjs';
import {exportCard,importCard} from '../src/cards.mjs';
const {meshes}=buildOrbMeshes();
const animals=[...dogBreeds.map(b=>({form:'puppy',dogBreed:b.id,...b.palette})),...catCoats.map(c=>({form:'kitten',coatPattern:c.pattern,...c.palette}))];
test('eight breeds and five coats fit the original envelope and vertex budget with every ear and accessory',()=>{
 assert.equal(dogBreeds.length,8);assert.equal(catCoats.length,5);assert.equal(catalogue.forms.length,7);
 for(const a of animals)for(const ears of catalogue.ears.map(e=>e.id))for(const accessory of catalogue.accessories.map(e=>e.id)){
  const appearance=validateAppearance({...a,ears,accessory}),f=fitParts(catalogue,meshes,appearance);
  const vertices=f.parts.reduce((n,p)=>n+meshes[p.mesh].indices.length,0);assert.ok(vertices<26000,JSON.stringify({a,ears,accessory,vertices}));
  const model=modelTriangles(catalogue,meshes,appearance,'curious',800,{motion:.1,eventAge:800});
  for(const t of model.triangles)for(const point of t.points)assert.ok(point.every(Number.isFinite)&&Math.hypot(...point)*.3<.62,JSON.stringify({a,ears,accessory,point}));
 }
});
test('all animal expressions lie on the muzzle surface; masks are valid and move with their mesh',()=>{
 for(const a of animals){const fitted=fitParts(catalogue,meshes,a),body=meshes[fitted.form.parts[0].mesh];
  assert.ok(surfaceHeight(body,0,-.20)>1,'sculpted muzzle projects forward');
  for(const face of orbFaces)for(const p of face.variants[a.form].parts){const points=p.type==='ellipse'?[[p.x-p.rx,p.y-p.ry],[p.x+p.rx,p.y+p.ry]]:p.points;for(const [x,y] of points)assert.ok(surfaceHeight(body,x*.01*fitted.form.face[3],-.015+y*.01*fitted.form.face[3])>.2);}
 }
 for(const mesh of Object.values(meshes))for(const weights of Object.values(mesh.masks||{})){assert.equal(weights.length,mesh.vertices.length/2);for(let i=0;i<weights.length;i+=3)assert.ok(weights.slice(i,i+3).every(v=>v>=0&&v<=1)&&weights[i]+weights[i+1]+weights[i+2]<=1.00001);}
 const dog=fitParts(catalogue,meshes,{form:'puppy',dogBreed:'beagle'}),ear=dog.parts.find(p=>p.motion==='earLeftDrop');assert.notDeepEqual(partPose(ear,'wink',800,false,0,0,800),partPose(ear,'calm',800,false,0,0,800));
 const masks=structuredClone(meshes[ear.mesh].masks);modelTriangles(catalogue,meshes,{form:'puppy',dogBreed:'beagle'},'wink',400);assert.deepEqual(meshes[ear.mesh].masks,masks);
});
test('hanging dog ears expose their lower silhouette instead of disappearing inside the cheeks',()=>{
 const depthAt=(mesh,x,y)=>{let depth=-Infinity;for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(n=>mesh.vertices.slice(n*6,n*6+3)),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;if(Math.min(u,v,w)>=0)depth=Math.max(depth,u*a[2]+v*b[2]+w*c[2]);}return depth;};
 for(const dogBreed of ['golden','beagle','poodle']){const fitted=fitParts(catalogue,meshes,{form:'puppy',dogBreed}),body=meshes[fitted.form.parts[0].mesh],part=fitted.parts.find(p=>p.mesh.startsWith('pet-ear-')&&p.x<0),ear=meshes[part.mesh];let visible=0,total=0;
  for(let i=0;i<ear.vertices.length;i+=6){const [x,y,z,,,nz]=ear.vertices.slice(i,i+6);if(nz<.2||y>-.35)continue;total++;if(z+part.z>depthAt(body,x+part.x,y+part.y)+.005)visible++;}
  assert.ok(total>10&&visible/total>.45,`${dogBreed}: only ${visible}/${total} lower-ear samples visible`);
 }
});
test('local contrast differs between a dark eye patch and pale fur, and custom ink remains exact',()=>{
 const cow={form:'kitten',coatPattern:'cow',...catCoats.find(c=>c.id==='cow').palette};assert.notEqual(featureInk(catalogue,meshes,cow,-31,19),featureInk(catalogue,meshes,cow,31,19));
 const black={form:'kitten',...catCoats.find(c=>c.id==='black').palette};assert.equal(featureInk(catalogue,meshes,black,31,19,.12),'#E8F3DA');
 for(const a of animals)assert.equal(featureInk(catalogue,meshes,{...a,eyeColor:'#123ABC',autoEyeColor:false},31,19,.12),'#123ABC');
});
test('cat ears have broad attached roots, tapered tips and inset inner surfaces without clipping',()=>{
 const fitted=fitParts(catalogue,meshes,{form:'kitten',ears:'preset'}),body=meshes[fitted.form.parts[0].mesh];
 const points=mesh=>Array.from({length:mesh.vertices.length/6},(_,i)=>mesh.vertices.slice(i*6,i*6+3));
 const depthAt=(mesh,x,y)=>{let z=-Infinity;for(let i=0;i<mesh.indices.length;i+=3){const [a,b,c]=mesh.indices.slice(i,i+3).map(n=>mesh.vertices.slice(n*6,n*6+3)),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,w=1-u-v;if(Math.min(u,v,w)>=-1e-6)z=Math.max(z,u*a[2]+v*b[2]+w*c[2]);}return z;};
 for(const outer of fitted.parts.filter(p=>p.mesh.startsWith('pet-ear-'))){
  const mesh=meshes[outer.mesh],p=points(mesh),inner=fitted.parts.find(p=>p.material==='innerEar'&&p.x===outer.x),innerMesh=meshes[inner.mesh];
  const width=values=>Math.max(...values.map(p=>p[0]))-Math.min(...values.map(p=>p[0]));
  assert.ok(width(p.filter(p=>p[1]<.10))>.50,'root must not pinch into a stalk');
  assert.ok(width(p.filter(p=>p[1]>.60))<.17,'ear tapers into a rounded triangular tip');
  assert.ok(Math.max(...p.map(p=>p[1]+outer.y))>1.15,'triangle remains visible above the head');
  assert.ok(surfaceHeight(body,outer.x,outer.y)>outer.z+.15,'root embedded in the head');
  for(const [x,y,z] of points(innerMesh)){const gap=z-depthAt(mesh,x,y);assert.ok(gap>.003&&gap<.03,`inner-ear surface gap ${gap}`);}
  for(const state of ['calm','curious','sleepy','wink'])for(const time of [0,400,800,1600])assert.deepEqual(partPose(inner,state,time,false,0,0,time),partPose(outer,state,time,false,0,0,time),'inner and outer ear must move together');
  const thickness=values=>Math.max(...values.map(p=>p[2]))-Math.min(...values.map(p=>p[2]));assert.ok(thickness(p.filter(p=>p[1]>.60))<thickness(p.filter(p=>p[1]<.10))*.65,'ear thickness tapers toward the tip');
 }
});
test('reduced animations freeze animals; distress suppresses wagging; greeting settles after two wags',()=>{
 for(const a of animals){const appearance={...a,ears:'preset',accessory:'scarf',reducedMotion:true};assert.deepEqual(modelTriangles(catalogue,meshes,appearance,'wink',300).triangles,modelTriangles(catalogue,meshes,appearance,'wink',9000).triangles);const tail=fitParts(catalogue,meshes,a).parts.find(p=>p.motion?.startsWith('tail'));for(const state of ['sad','worried','sleepy'])assert.equal(partPose(tail,state,600,false,0,0,600).yaw,0);assert.equal(partPose(tail,'wink',1400,false,0,0,1400).yaw,0);}
});
test('legacy puppy migration, independent edits, old-client partial saves, cards and database reopening retain animal fields',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-animals-'));const store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});
 const old=validateAppearance({form:'puppy',color:'#123456',ears:'round',face:false});assert.equal(old.dogBreed,'golden');assert.equal(old.color,'#123456');assert.equal(old.ears,'round');assert.equal(old.face,false);
 const role=store.roles()[0];const custom=validateAppearance({...animals[0],coatPattern:'calico',muzzleColor:'#123456',innerEarColor:'#ABCDEF',noseColor:'#314159',markingColor:'#654321',markingColor2:'#FEDCBA',accessory:'hat',eyeColor:'#AABBCC',autoEyeColor:false});store.saveRole({id:role.id,appearance:custom});
 for(const b of dogBreeds){const r=store.saveRole({id:role.id,appearance:{dogBreed:b.id}});assert.equal(r.appearance.muzzleColor,custom.muzzleColor);assert.equal(r.appearance.coatPattern,'calico');}
 store.saveRole({id:role.id,appearance:{form:'kitten'}});store.saveRole({id:role.id,appearance:{color:'#778899',face:true}});const saved=store.role(role.id);assert.equal(saved.appearance.dogBreed,'poodle');assert.equal(saved.appearance.markingColor2,custom.markingColor2);assert.equal(saved.appearance.eyeColor,custom.eyeColor);
 assert.deepEqual(importCard(Buffer.from(JSON.stringify(exportCard(saved)))).role.appearance,saved.appearance);
 const reopen=new Store(dir);try{assert.deepEqual(reopen.role(role.id).appearance,saved.appearance);}finally{reopen.close();}
 for(const key of ['muzzleColor','innerEarColor','noseColor','markingColor','markingColor2'])assert.throws(()=>validateAppearance({[key]:'broken'}));assert.throws(()=>validateAppearance({dogBreed:'unknown'}));assert.throws(()=>validateAppearance({coatPattern:'random'}));
});

test('opening a pre-0.11 database backfills golden without rewriting existing colors, switches or persona',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-old-puppy-'));let store=new Store(dir);const role=store.roles()[0];role.appearance={form:'puppy',color:'#aabbcc',accessory:'flower',ears:'none',face:false,reducedMotion:true};store.db.prepare('UPDATE roles SET json=? WHERE id=?').run(JSON.stringify(role),role.id);store.close();store=new Store(dir);t.after(async()=>{store.close();await fs.rm(dir,{recursive:true,force:true});});const upgraded=store.role(role.id);assert.equal(upgraded.appearance.dogBreed,'golden');assert.equal(upgraded.appearance.color,'#aabbcc');assert.equal(upgraded.appearance.accessory,'flower');assert.equal(upgraded.appearance.face,false);assert.equal(upgraded.appearance.reducedMotion,true);assert.equal(upgraded.persona,role.persona);assert.equal(upgraded.appearance.coatPattern,'solid');
});
