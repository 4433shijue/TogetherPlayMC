// Deterministic, indexed meshes shared by the native renderer and browser preview.
// Vertices store position and outward normal; all coordinates are in body radii.
import {animalModels} from './orb-animals.mjs';
import {buildDogEar} from './orb-dog-ears.mjs';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const length=Math.hypot(...v)||1;return v.map(x=>x/length);};
const round=n=>Math.round(n*100000)/100000||0;
function surface(fn,rows=20,columns=32,{front=false}={}){
 const vertices=[],indices=[];
 for(let r=0;r<=rows;r++)for(let c=0;c<=columns;c++){
  const u=r/rows,v=c/columns,p=fn(u,v),e=.0002;
  const a=sub(fn(clamp(u+e,0,1),v),fn(clamp(u-e,0,1),v));
  const b=sub(fn(clamp(u,.0001,.9999),v+e),fn(clamp(u,.0001,.9999),v-e));
  let normal=unit(cross(b,a));if(Math.hypot(...normal)<.5)normal=unit(p);
  vertices.push(...p.map(round),...normal.map(round));
 }
 for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const a=r*(columns+1)+c,b=a+columns+1;indices.push(a,b+1,b,a,a+1,b+1);}
 const result={vertices,indices};if(front)result.front=frontSurface(result);return result;
}
function spherePoint(u,v){const a=u*Math.PI,b=v*Math.PI*2;return [Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];}
function bodyPoint(id,u,v){
 const [sx,sy,sz]=spherePoint(u,v),a=u*Math.PI;
 if(id==='orb')return [sx,sy,sz];
 if(id==='puppy'){
  const width=1.01-.085*sy,x=sx*width,y=sy*.94-.025;
  const cheek=.045*(Math.exp(-(((x-.43)/.25)**2)-(((y+.13)/.25)**2))+Math.exp(-(((x+.43)/.25)**2)-(((y+.13)/.25)**2)));
  return [x,y,sz*.94+(sz>0?cheek*Math.pow(Math.max(0,sz),.35):0)];
 }
 if(id==='jelly'){const radius=Math.pow(Math.sin(a),.78)*(1.04-.11*sy),angle=v*Math.PI*2;return [radius*Math.cos(angle),sy*.80-.10+.018*Math.cos(angle*3)*Math.pow(Math.sin(a),3)*Math.max(0,-sy),radius*.91*Math.sin(angle)];}
 if(id==='lantern')return [sx*(.96-.17*sy),sy*1.02+.045,sz*(.93-.16*sy)];
 if(id==='planet')return [sx*.92,sy*.92,sz*.92];
 const lobes=[[0,-.12,0,.97,.75,.87],[-.71,-.13,-.04,.57,.53,.60],[.72,-.13,-.06,.58,.53,.59],[-.36,.39,-.03,.60,.59,.66],[.39,.43,-.08,.59,.64,.65]];
 const sdf=p=>{let d=1e4;for(const [x,y,z,rx,ry,rz] of lobes){const b=(Math.hypot((p[0]-x)/rx,(p[1]-y)/ry,(p[2]-z)/rz)-1)*Math.min(rx,ry,rz),h=Math.max(.29-Math.abs(d-b),0)/.29;d=Math.min(d,b)-h*h*.29*.25;}return d;};
 let low=0,high=1.8;for(let n=0;n<21;n++){const mid=(low+high)/2;if(sdf([sx*mid,sy*mid,sz*mid])<0)low=mid;else high=mid;}const radius=(low+high)/2;return [sx*radius,sy*radius,sz*radius];
}
function frontSurface(mesh){
 const size=41,min=-.8,step=.04,z=new Array(size*size).fill(-2),v=mesh.vertices;
 for(let i=0;i<mesh.indices.length;i+=3){const tri=mesh.indices.slice(i,i+3).map(n=>v.slice(n*6,n*6+3)),[a,b,c]=tri;
  const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
  const left=clamp(Math.ceil((Math.min(...tri.map(p=>p[0]))-min)/step),0,size-1),right=clamp(Math.floor((Math.max(...tri.map(p=>p[0]))-min)/step),0,size-1);
  const bottom=clamp(Math.ceil((Math.min(...tri.map(p=>p[1]))-min)/step),0,size-1),top=clamp(Math.floor((Math.max(...tri.map(p=>p[1]))-min)/step),0,size-1);
  for(let y=bottom;y<=top;y++)for(let x=left;x<=right;x++){const px=min+x*step,py=min+y*step,wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,wc=1-wa-wb;if(Math.min(wa,wb,wc)>=-1e-6)z[y*size+x]=Math.max(z[y*size+x],wa*a[2]+wb*b[2]+wc*c[2]);}
 }
 return {size,min,step,z:z.map(round)};
}
function ear(side){return surface((u,v)=>{
 const a=v*Math.PI*2,w=Math.pow(Math.sin(Math.PI*u),.52)*(.18+.045*u),bend=side*(.09*Math.sin(u*Math.PI)+.035*u);
 return [bend+Math.cos(a)*w,-.99*u,.02+.23*u*u+Math.sin(a)*(.075+.035*u)*Math.pow(Math.sin(Math.PI*u),.5)];
 },16,16);}
function tail(){return surface((u,v)=>{const a=v*Math.PI*2,r=.13*Math.pow(Math.sin(Math.PI*u),.4),center=[.34*Math.sin(u*Math.PI*.72),.28*u*u,.12*u],axis=unit([.34*Math.PI*.72*Math.cos(u*Math.PI*.72),.56*u,.12]),right=unit(cross(axis,[0,0,1])),up=cross(axis,right);return center.map((n,i)=>n+r*(Math.cos(a)*right[i]+Math.sin(a)*up[i]));},14,14);}
function clothBand(){return surface((u,v)=>{const a=u*Math.PI*2,b=v*Math.PI*2,radial=.055*Math.sign(Math.cos(b))*Math.pow(Math.abs(Math.cos(b)),.45);return [(1+radial)*Math.cos(a),.105*Math.sign(Math.sin(b))*Math.pow(Math.abs(Math.sin(b)),.45)+.024*Math.sin(a*2),(1+radial)*Math.sin(a)];},36,12);}
function ribbon(side,length){return surface((u,v)=>{const a=v*Math.PI*2,width=.10*(1-.18*u)*Math.pow(Math.sin(Math.PI*clamp(u,.001,.999)),.15);return [side*.07*u*u+Math.cos(a)*width,-length*u,.06*Math.sin(u*Math.PI)+.10*u*u+Math.sin(a)*.024];},12,10);}
function cap(){return surface((u,v)=>{const a=u*Math.PI/2,b=v*Math.PI*2,r=Math.sin(a);return [r*Math.cos(b)+.18*Math.pow(Math.cos(a),2),Math.cos(a)*.60,r*.93*Math.sin(b)];},14,28);}
function petal(){return surface((u,v)=>{const a=v*Math.PI*2,w=.11*Math.pow(Math.sin(Math.PI*u),.7);return [Math.cos(a)*w,.32*u,.075*Math.sin(u*Math.PI)-.045*u+Math.sin(a)*.028*Math.sin(Math.PI*u)];},12,12);}
function orbitBand(){return surface((u,v)=>{const a=u*Math.PI*2,b=v*Math.PI*2,r=1.38+.14*Math.sign(Math.cos(b))*Math.pow(Math.abs(Math.cos(b)),.28);return [r*Math.cos(a),.025*Math.sin(b),r*Math.sin(a)];},48,8);}
const bell=(x,y,cx,cy,rx,ry)=>Math.exp(-(((x-cx)/rx)**2)-((y-cy)/ry)**2);
function animalBody(a,u,v){
 // Spend the existing mesh budget on the face, where markings and mouths need it.
 const latitude=u*Math.PI+.20*Math.sin(u*Math.PI*2),longitude=v*Math.PI*2+.62*Math.cos(v*Math.PI*2);
 const sx=Math.sin(latitude)*Math.cos(longitude),sy=Math.cos(latitude),sz=Math.sin(latitude)*Math.sin(longitude),[w,h,d,m]=a.shape,x=sx*w*(1-.055*sy),y=sy*h-.025;
 const cheek=(a.id==='kitten'?.085:a.id==='shiba'||a.id==='samoyed'?.075:.045)*(bell(x,y,.51,-.16,.3,.29)+bell(x,y,-.51,-.16,.3,.29));
 const muzzle=m*(.65*bell(x,y,0,-.19,.42,.29)+.27*bell(x,y,-.19,-.25,.23,.20)+.27*bell(x,y,.19,-.25,.23,.20));
 const tuft=a.id==='poodle'?.035*Math.sin(u*24)**2*Math.cos(v*Math.PI*12)**2:a.id==='samoyed'?.023*Math.cos(v*Math.PI*14)**2:0;
 return [x*(1+tuft),y*(1+tuft),sz*d+(sz>0?(cheek+muzzle)*Math.pow(sz,.35):0)];
}
function catEar(side,inner=false){
 // A padded triangular shell with a broad embedded root, not a pinched tube.
 const corners=[[-.32,0],[.32,0],[.10,.72]],segments=24,center=[.035,.25],positions=[],indices=[];
 const mix=(a,b,t)=>a.map((x,i)=>x*(1-t)+b[i]*t);
 const boundary=Array.from({length:segments},(_,i)=>{const k=Math.floor(i/8),at=i%8,c=corners[k],previous=corners[(k+2)%3],next=corners[(k+1)%3],incoming=mix(c,previous,.13),outgoing=mix(c,next,.13);
  if(at<4){const t=at/4;return [0,1].map(j=>(1-t)**2*incoming[j]+2*(1-t)*t*c[j]+t*t*outgoing[j]);}
  return mix(outgoing,mix(next,c,.13),(at-4)/4);
 });
 const depth=(x,y)=>{const t=clamp(y/.72,0,1),half=Math.max(.025,.32*(1-t)),lateral=clamp((x-.10*t)/half,-1,1);return .085-.065*t+.055*Math.sin(Math.PI*t)*(1-lateral*lateral);};
 const face=(rings,front)=>{
  const offset=positions.length,place=p=>{let [x,y]=p;if(inner){x=center[0]+(x-center[0])*.66;y=center[1]+(y-center[1])*.70+.035;}const z=front?depth(x,y)+(inner?.010:0):-.08+.065*y/.72;positions.push([side*x,y,z]);};
  place(center);
  for(let r=1;r<=rings;r++)for(const b of boundary)place(mix(center,b,r/rings));
  const put=(a,b,c)=>{if(front===(side>0))indices.push(a,b,c);else indices.push(a,c,b);};
  for(let s=0;s<segments;s++)put(offset,offset+1+s,offset+1+(s+1)%segments);
  for(let r=1;r<rings;r++)for(let s=0;s<segments;s++){const a=offset+1+(r-1)*segments+s,b=offset+1+(r-1)*segments+(s+1)%segments,c=a+segments,d=b+segments;put(a,c,d);put(a,d,b);}
  return offset+1+(rings-1)*segments;
 };
 const front=face(5,true);
 if(!inner){const back=face(2,false);for(let s=0;s<segments;s++){const next=(s+1)%segments,a=front+s,b=front+next,c=back+s,d=back+next;if(side>0)indices.push(a,c,d,a,d,b);else indices.push(a,d,c,a,b,d);}}
 const normals=positions.map(()=>[0,0,0]);for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),n=cross(sub(positions[b],positions[a]),sub(positions[c],positions[a]));for(const v of [a,b,c])for(let j=0;j<3;j++)normals[v][j]+=n[j];}
 return {vertices:positions.flatMap((p,i)=>[...p,...unit(normals[i])].map(round)),indices};
}
function petEar(a,side,inner=false){
 if(a.earType==='cat')return catEar(side,inner);
 return buildDogEar(a.id,side,inner);
}
function petTail(a){
 return surface((u,v)=>{
  const t=a.tailType,angle=v*Math.PI*2,curl=t==='curl'||t==='fluffCurl',cat=t==='cat',pom=t==='pom';
  if(pom){const center=[.17,.12,-.17],s=spherePoint(u,v);return center.map((x,i)=>x+s[i]*.23);}
  const centerAt=q=>{if(curl){const k=q*Math.PI*1.65;return [.18+Math.sin(k)*.27,.22+(1-Math.cos(k))*.25,-.18-.10*q];}if(cat){const k=q*Math.PI*1.15;return [.20+Math.sin(k)*.31,.63*q-.12,-.14-.08*q];}return t==='feather'?[.60*q,.10+.57*q,-.13-.36*q]:[.39*q,.20*q*q,-.15-.18*q];};
  const center=centerAt(u),axis=unit(sub(centerAt(clamp(u+.001,0,1)),centerAt(clamp(u-.001,0,1)))),right=unit(cross(axis,[0,0,1])),up=cross(axis,right);
  const r=(t==='fluffCurl'?.18:t==='feather'?.20:cat?.095:.12)*Math.pow(Math.sin(Math.PI*u),curl?.40:cat?.30:.55);
  return center.map((x,i)=>x+r*(Math.cos(angle)*right[i]+Math.sin(angle)*up[i]));
 },14,16);
}
// Per-vertex masks and their front-surface interpolation are baked once. Moving
// ears/tails carry the same weights; no world-coordinate noise runs in a client.
const patternKeys=[...Object.keys(animalModels).filter(x=>x!=='kitten'),'cat-solid','cat-cow','cat-tabby','cat-calico'];
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const spot=(x,y,cx,cy,rx,ry)=>smooth(.34,.50,bell(x,y,cx,cy,rx,ry));
function mask(key,x,y,z,part){
 const body=part==='body',tail=part==='tail',ear=part==='ear';
 const front=smooth(.12,.48,z),back=1-smooth(-.30,.18,z),chest=spot(x,y,0,-.65,.61,.43),cheeks=Math.max(spot(x,y,-.47,-.24,.39,.28),spot(x,y,.47,-.24,.39,.28));
 let muzzle=body?spot(x,y,0,-.23,.43,.29)*front:0,one=0,two=0;
 if(key==='shiba'||key==='corgi'){
  const blaze=key==='corgi'?spot(x,y,.025+.055*y,.49,.095,.38):0;
  one=body?Math.max(cheeks*.95,chest,blaze)*front:tail?smooth(.10,.25,y):0;
 }
 if(key==='husky'){
  const cap=spot(x,y,0,.73,.92,.53),eyeMask=Math.max(spot(x,y,-.46,.26,.32,.45),spot(x,y,.46,.26,.32,.45));
  const blaze=spot(x,y,0,.36,.15,.48);
  one=body?Math.max(back,Math.max(cap,eyeMask)*(1-blaze)):ear?.8:tail?.66:0;
 }
 if(key==='border'){
  const blaze=spot(x-.035*Math.sin(y*4),y,0,.42,.10+.045*Math.max(0,y),.61);
  one=body?Math.max(blaze,chest,cheeks*.75)*front:tail?smooth(.25,.40,x):0;
 }
 if(key==='beagle'){
  one=body?back*spot(x,y,0,.24,.85,.75):0;
  two=body?Math.max(spot(x,y,-.78,.24,.37,.65),spot(x,y,.78,.24,.37,.65))*smooth(-.25,.1,z):ear?.92:0;
 }
 if(key==='cat-cow'||key==='cat-calico'){
  one=body?Math.max(spot(x,y,-.43,.35,.39,.48)*front,spot(x,y,.44,-.06,.50,.65)*back):ear?(x<0?1:0):tail?smooth(.22,.36,y):0;
  two=key==='cat-calico'?(body?Math.max(spot(x,y,.54,.35,.35,.43)*front,spot(x,y,-.58,-.25,.43,.47)*back):ear?(x>0?1:0):tail?1-smooth(.07,.20,y):0):0;
 }
 if(key==='cat-tabby'){
  const brow=Math.max(spot(x,y,0,.68,.065,.27),spot(x+.09*(y-.5),y,-.24,.64,.065,.23),spot(x-.09*(y-.5),y,.24,.64,.065,.23));
  const cheekStripes=Math.max(spot(Math.abs(x),y,.79,.11,.21,.045),spot(Math.abs(x),y,.85,-.10,.19,.045));
  one=body?Math.max((brow+cheekStripes)*front,smooth(.72,.96,Math.abs(Math.sin(y*14+x*2)))*back):tail?smooth(.65,.93,Math.abs(Math.sin(y*24+x*3))):ear?.18:0;
 }
 one=clamp(one,0,1);two=clamp(two,0,1)*(1-one);return [muzzle,one*(1-muzzle),two*(1-muzzle)];
}
function bakeMasks(mesh,keys,part,offset=[0,0,0]){
 mesh.masks={};for(const key of keys){const weights=[];for(let i=0;i<mesh.vertices.length;i+=6)weights.push(...mask(key,mesh.vertices[i]+offset[0],mesh.vertices[i+1]+offset[1],mesh.vertices[i+2]+offset[2],part));mesh.masks[key]=weights;}
 if(!mesh.front)return;
 const f=mesh.front;f.masks=Object.fromEntries(keys.map(key=>[key,new Array(f.size*f.size*3).fill(0)]));
 const winning=new Array(f.size*f.size).fill(-2),v=mesh.vertices;
 for(let i=0;i<mesh.indices.length;i+=3){const ids=mesh.indices.slice(i,i+3),[a,b,c]=ids.map(n=>v.slice(n*6,n*6+3)),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-9)continue;
  const left=clamp(Math.ceil((Math.min(a[0],b[0],c[0])-f.min)/f.step),0,f.size-1),right=clamp(Math.floor((Math.max(a[0],b[0],c[0])-f.min)/f.step),0,f.size-1),bottom=clamp(Math.ceil((Math.min(a[1],b[1],c[1])-f.min)/f.step),0,f.size-1),top=clamp(Math.floor((Math.max(a[1],b[1],c[1])-f.min)/f.step),0,f.size-1);
  for(let y=bottom;y<=top;y++)for(let x=left;x<=right;x++){const px=f.min+x*f.step,py=f.min+y*f.step,wa=((b[1]-c[1])*(px-c[0])+(c[0]-b[0])*(py-c[1]))/den,wb=((c[1]-a[1])*(px-c[0])+(a[0]-c[0])*(py-c[1]))/den,wc=1-wa-wb,z=wa*a[2]+wb*b[2]+wc*c[2],n=y*f.size+x;if(Math.min(wa,wb,wc)<-1e-6||z<winning[n])continue;winning[n]=z;for(const key of keys)for(let k=0;k<3;k++)f.masks[key][n*3+k]=round(wa*mesh.masks[key][ids[0]*3+k]+wb*mesh.masks[key][ids[1]*3+k]+wc*mesh.masks[key][ids[2]*3+k]);}
 }
}
function addAnimals(meshes){
 meshes['pet-paw']=surface(spherePoint,8,12);meshes['pet-pad']=surface(spherePoint,6,10);meshes['pet-tuft']=surface(spherePoint,8,12);
 for(const a of Object.values(animalModels)){
  const keys=a.id==='kitten'?patternKeys.filter(k=>k.startsWith('cat-')):[a.id];
  const fluffy=a.id==='samoyed'||a.id==='poodle';
  const body=meshes['body-'+a.id]=surface((u,v)=>animalBody(a,u,v),fluffy?26:34,fluffy?44:52,{front:true});bakeMasks(body,keys,'body');
  const tailMesh=meshes['pet-tail-'+a.id]=petTail(a);bakeMasks(tailMesh,keys,'tail');
  for(const side of [-1,1]){const s=side<0?'Left':'Right',earMesh=meshes['pet-ear-'+a.id+'-'+s]=petEar(a,side);meshes['pet-inner-'+a.id+'-'+s]=petEar(a,side,true);bakeMasks(earMesh,patternKeys,'ear',[side*.64,0,0]);}
 }
 for(const key of ['earLeft','earRight'])bakeMasks(meshes[key],patternKeys,'ear',[key==='earLeft'?-.8:.8,0,0]);
}
export function buildOrbMeshes(){const meshes={sphere:surface(spherePoint,14,24),earLeft:ear(-1),earRight:ear(1),tail:tail(),clothBand:clothBand(),ribbonLeft:ribbon(-1,.54),ribbonRight:ribbon(1,.37),cap:cap(),petal:petal(),orbitBand:orbitBand()};for(const id of ['orb','lantern','jelly','puppy','cloud','planet'])meshes['body-'+id]=surface((u,v)=>bodyPoint(id,u,v),24,40,{front:true});addAnimals(meshes);return {version:3,meshes};}
