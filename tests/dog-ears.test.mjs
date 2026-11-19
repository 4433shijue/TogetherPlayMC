import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createHash} from 'node:crypto';
import {buildOrbMeshes} from '../src/orb-geometry.mjs';import {dogEarProfiles,earField} from '../src/orb-dog-ears.mjs';import {orbCatalogue} from '../src/orb-forms.mjs';import {fitParts,earMotion,deformEarVertex,createEarSpring,modelTriangles} from '../src/orb-render.mjs';
const {meshes}=buildOrbMeshes(),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),sub=(a,b)=>a.map((x,i)=>x-b[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rayDistance(origin,direction,mesh){let nearest=Infinity;for(let k=0;k<mesh.indices.length;k+=3){const [a,b,c]=mesh.indices.slice(k,k+3).map(i=>mesh.vertices.slice(i*6,i*6+3)),e1=sub(b,a),e2=sub(c,a),h=cross(direction,e2),det=dot(e1,h);if(Math.abs(det)<1e-9)continue;const s=sub(origin,a),u=dot(s,h)/det;if(u<0||u>1)continue;const q=cross(s,e1),v=dot(direction,q)/det;if(v<0||u+v>1)continue;const t=dot(e2,q)/det;if(t>=0)nearest=Math.min(nearest,t);}return nearest;}
test('dog ear roots attach, shells fit the original ear budget, folds and breed proportions differ',()=>{
 for(const [id,p]of Object.entries(dogEarProfiles)){const fitted=fitParts(orbCatalogue,meshes,{form:'puppy',dogBreed:id}),body=meshes['body-'+id],ears=fitted.parts.filter(p=>p.mesh.startsWith('pet-ear-')||p.mesh.startsWith('pet-inner-'));
  assert.ok(ears.reduce((n,p)=>n+meshes[p.mesh].indices.length,0)<=4608,id+' ear budget');assert.ok(rayDistance(p.root,[0,0,1],body)>.02&&rayDistance(p.root,[0,0,1],body)<1&&rayDistance(p.root,[0,0,-1],body)<2,id+' root attachment');
  for(const part of ears){const m=meshes[part.mesh];assert.equal(m.ear.weights.length,m.vertices.length/6*4);assert.equal(m.ear.delay,p.delay);for(let i=0;i<m.ear.weights.length;i+=4)assert.ok(m.ear.weights[i]>=0&&m.ear.weights[i]<=1);}
 }
 assert.ok(dogEarProfiles.corgi.width>dogEarProfiles.husky.width*1.25);assert.ok(dogEarProfiles.husky.height>dogEarProfiles.shiba.height);assert.ok(dogEarProfiles.beagle.height>dogEarProfiles.golden.height);
 const top=side=>Math.max(...meshes['pet-ear-border-'+side].vertices.filter((_,i)=>i%6===1));assert.ok(top('Left')>top('Right')+.02,'fixed left/right fold difference');
 const beagle=dogEarProfiles.beagle;assert.ok(beagle.root[1]-beagle.height<-.945,'beagle ends below the chin');
});
test('inner dog ears stay outside the matching curved shell with a small gap',()=>{
 for(const id of Object.keys(dogEarProfiles))for(const side of ['Left','Right']){const outer=meshes[`pet-ear-${id}-${side}`],inner=meshes[`pet-inner-${id}-${side}`];let good=0;for(let i=0;i<inner.vertices.length;i+=6){const p=inner.vertices.slice(i,i+3),n=inner.vertices.slice(i+3,i+6).map(x=>-x),distance=rayDistance(p,n,outer);if(distance>=.001&&distance<.065)good++;}assert.ok(good/(inner.vertices.length/6)>.97,`${id} ${side}: ${good}/${inner.vertices.length/6} attached inner samples`);}
});
test('ear bending has anchored roots and correctly transforms surface normals',()=>{
 for(const [id,p]of Object.entries(dogEarProfiles)){const m=meshes[`pet-ear-${id}-Right`],motion=earMotion(m.ear,'wink',12000,false,900,.12,.08,.05);
  assert.deepEqual(earField(0,0,m.ear.length),[0,0,0,0]);assert.deepEqual(deformEarVertex([0,0,0,0,0,1],[0,0,0,0],motion.bend),[0,0,0,0,0,1]);
  for(let i=0;i<m.vertices.length;i+=6){const weights=m.ear.weights.slice(i/6*4,i/6*4+4),v=m.vertices.slice(i,i+6),result=deformEarVertex(v,weights,motion.bend);assert.ok(result.every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...result.slice(3))-1)<1e-8);assert.ok(1+dot(weights.slice(1),motion.bend)>.65,'no inverted deformation');
   const tangent=cross(v.slice(3),[.37,.61,.27]),deformedTangent=tangent.map((n,k)=>n+motion.bend[k]*dot(weights.slice(1),tangent));assert.ok(Math.abs(dot(result.slice(3),deformedTangent))<1e-7,'normal perpendicular to transformed surface');}
 }
});
test('greetings delay tips, finish in 1600ms, repeat cleanly and suppress play under distress',()=>{
 for(const id of Object.keys(dogEarProfiles)){const ear=meshes[`pet-ear-${id}-Left`].ear,a=age=>earMotion(ear,'wink',12000,false,age);
  assert.ok(a(ear.delay/2).pitch>0);assert.equal(a(ear.delay/2).bend[2],0);assert.ok(a(800).bend[2]>0);assert.ok(a(1600).bend.every(x=>x===0));assert.deepEqual(earMotion(ear,'wink',25000,false,900),a(900));
  for(const state of ['worried','sad','sleepy'])assert.deepEqual(earMotion(ear,state,700,false,700,.18,.18,.09).bend,[0,0,0]);
  assert.deepEqual(earMotion(ear,'wink',900,true,900,.18,.18,.09),{pitch:0,roll:0,yaw:0,bend:[0,0,0]});
 }
});
test('ear lag follows input and settles, resets on reduced motion and stays bounded',()=>{
 const spring=createEarSpring();let result=spring.step(.18,.085);assert.ok(result.tipLag>0&&result.tipLag<.18);for(let i=0;i<30;i++)result=spring.step(-.18,-.085);assert.ok(Math.abs(result.tipLag)<=.18&&Math.abs(result.turn)<=.085);for(let i=0;i<100;i++)result=spring.step(0,0);assert.ok(Math.abs(result.tipLag)<1e-10&&Math.abs(result.turn)<1e-10);assert.deepEqual(spring.step(.18,.085,true),{tipLag:0,turn:0});
});
test('all dog ears and accessories stay inside the envelope throughout extreme ear motions',()=>{
 for(const dogBreed of Object.keys(dogEarProfiles))for(const accessory of ['none','hat','scarf','flower'])for(const age of [0,180,700,1100,1600]){const m=modelTriangles(orbCatalogue,meshes,{form:'puppy',dogBreed,accessory},'wink',12000,{eventAge:age,motion:.1,lag:.18,tipLag:.18,turn:.09});for(const tri of m.triangles)for(const p of tri.points)assert.ok(Math.hypot(...p)*.3<.62,dogBreed+' animated envelope');}
});
test('0.11.2 cat meshes and fittings remain byte-identical',async()=>{
 const expected=JSON.parse(await fs.readFile(new URL('./fixtures/cat-v0112-hashes.json',import.meta.url),'utf8'));
 for(const [key,value]of Object.entries(expected.meshes))assert.equal(createHash('sha256').update(JSON.stringify(meshes[key])).digest('hex'),value,key);
 assert.deepEqual(orbCatalogue.forms.find(f=>f.id==='kitten'),expected.form);
});
