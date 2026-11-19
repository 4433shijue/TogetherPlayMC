import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildOrbMeshes} from '../src/orb-geometry.mjs';
import {orbCatalogue} from '../src/orb-forms.mjs';
import {orbFaces} from '../src/orb-faces.mjs';
import {surfaceHeight,fitParts,modelTriangles,partPose,materialColor} from '../src/orb-render.mjs';
const library=buildOrbMeshes(),{meshes}=library;
test('generated browser/native meshes match and contain finite unit normals and valid triangle indices',async()=>{
 for(const file of ['web/orb-meshes.json','companion-mod/common/src/main/resources/assets/together_companion/orb-meshes.json'])assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),library);
 assert.equal(await fs.readFile('web/orb-render.js','utf8'),await fs.readFile('src/orb-render.mjs','utf8'));
 for(const [id,m] of Object.entries(meshes)){assert.ok(m.vertices.every(Number.isFinite),id);assert.equal(m.indices.length%3,0);assert.ok(m.indices.every(n=>Number.isInteger(n)&&n>=0&&n<m.vertices.length/6),id);for(let i=0;i<m.vertices.length;i+=6)assert.ok(Math.abs(Math.hypot(...m.vertices.slice(i+3,i+6))-1)<.001,id+' normal');}
});
test('all expression paths and fitted flowers stay on the visible curved surface',()=>{
 for(const form of orbCatalogue.forms){const mesh=meshes['body-'+form.id];assert.ok(surfaceHeight(mesh,0,0)>surfaceHeight(mesh,.5,0),form.id+' curved face');
  for(const face of orbFaces)for(const p of face.parts){const points=p.type==='ellipse'?[[p.x-p.rx,p.y-p.ry],[p.x+p.rx,p.y+p.ry]]:p.points;for(const [x,y] of points)assert.ok(surfaceHeight(mesh,form.face[0]+x*.01*form.face[3],form.face[1]+y*.01*form.face[3])>.2,form.id+' '+face.id);}
  const flower=fitParts(orbCatalogue,meshes,{form:form.id,accessory:'flower'}).parts.find(p=>p.fit==='flower');assert.ok(flower.z>.2&&flower.z<1,form.id+' flower');assert.ok(Math.abs(flower.pitch)<80&&Math.abs(flower.yaw)<80,form.id+' flower normal');
 }
});
test('every shape and attachment stays bounded under squash and all view angles',()=>{
 for(const f of orbCatalogue.forms)for(const ears of ['none','floppy','round'])for(const accessory of ['none','scarf','hat','flower'])for(const angle of [0,.85,Math.PI]){
  const m=modelTriangles(orbCatalogue,meshes,{...f.palette,form:f.id,ears,accessory},'curious',12345,{motion:.1,angle});assert.ok(m.triangles.length>100&&m.triangles.length<8500);
  for(const t of m.triangles){assert.ok(t.alpha>0&&t.alpha<=1);assert.ok(t.color.every(n=>Number.isFinite(n)&&n>=0&&n<=255));for(const p of t.points)assert.ok(Math.hypot(...p)*.3<.62,[f.id,ears,accessory,angle].join(':'));}
 }
});
test('satellite crosses behind the body, ring is thin, and reduced motion freezes every material and part',()=>{
 const f=orbCatalogue.forms.find(f=>f.id==='planet'),sat=f.parts.find(p=>p.motion==='satellite');assert.ok(partPose(sat,'calm',0,false,Math.PI/2).z>.8);assert.ok(partPose(sat,'calm',0,false,Math.PI*1.5).z<-.8);
 const ys=meshes.orbitBand.vertices.filter((_,i)=>i%6===1);assert.ok(Math.max(...ys)-Math.min(...ys)<.06);
 for(const form of orbCatalogue.forms){const a={...form.palette,form:form.id,ears:'floppy',accessory:'scarf',reducedMotion:true};assert.deepEqual(modelTriangles(orbCatalogue,meshes,a,'calm',100,{motion:.1}).triangles,modelTriangles(orbCatalogue,meshes,a,'calm',99999,{motion:-.1}).triangles);}
});
test('cave lighting dims surfaces while the luminous core stays bright',()=>{
 const shade=(material,light)=>materialColor([200,170,120],material,[0,.1,1],[0,0,1],100,true,light,[0,0,1],[-.36,.73,.58]);
 for(const material of ['matte','plush','cloth','cloud','glass','jelly','ceramic','petal'])assert.ok(shade(material,.12)[0]<shade(material,1)[0]*.7,material);
 assert.deepEqual(shade('glow',.12),shade('glow',1));
});

test('manually fitted pointed ear roots intersect every body surface',()=>{
 for(const f of orbCatalogue.forms){const {parts,form}=fitParts(orbCatalogue,meshes,{form:f.id,ears:'pointed'}),body=meshes[form.parts.find(p=>p.mesh.startsWith('body-')).mesh];for(const ear of parts.filter(p=>p.fit==='pointedEar'))assert.ok(surfaceHeight(body,ear.x,ear.y)>ear.z,form.id+' ear root');}
});
