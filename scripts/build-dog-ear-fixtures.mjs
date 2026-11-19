import fs from 'node:fs/promises';import {buildOrbMeshes} from '../src/orb-geometry.mjs';import {earMotion,deformEarVertex,createEarSpring} from '../src/orb-render.mjs';
const {meshes}=buildOrbMeshes(),cases=[];
for(const [id,mesh]of Object.entries(meshes))if(mesh.ear)for(const state of ['calm','wink','curious','sleepy','worried','sad'])for(const age of [0,40,100,180,400,800,1300,1600,2000])for(const reduced of [false,true]){
 const time=12000,lag=.12,tipLag=-.08,turn=.04,m=earMotion(mesh.ear,state,time,reduced,age,lag,tipLag,turn),vertex=age%3===0?0:age%3===1?48:100,at=vertex*6;
 cases.push({id,state,age,time,reduced,lag,tipLag,turn,vertex,motion:[m.pitch,m.roll,m.yaw,...m.bend],expected:deformEarVertex(mesh.vertices.slice(at,at+6),mesh.ear.weights.slice(vertex*4,vertex*4+4),m.bend)});
}
const spring=createEarSpring(),steps=[];for(let i=0;i<150;i++){const lag=i<20?.12:i<30?-.18:0,yaw=i<10?.085:i<20?-.085:0,reduced=i===145;steps.push({lag,yaw,reduced,...spring.step(lag,yaw,reduced)});}
await fs.mkdir('companion-mod/common/src/test/resources',{recursive:true});await fs.writeFile('companion-mod/common/src/test/resources/dog-ear-fixtures.json',JSON.stringify({cases,steps})+'\n');console.log(`Prepared ${cases.length} cross-client vertex cases and ${steps.length} spring steps.`);
