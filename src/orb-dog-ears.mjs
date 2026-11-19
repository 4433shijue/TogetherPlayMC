// Padded dog-ear shells. Coordinates and motion settings are baked for both clients.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mix=(a,b,t)=>a.map((x,i)=>x+(b[i]-x)*t);
const unit=v=>{const n=Math.hypot(...v)||1;return v.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const sub=(a,b)=>a.map((x,i)=>x-b[i]);
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const round=x=>Math.round(x*1e5)/1e5||0;
function closestTriangle(p,a,b,c){
 const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);if(d1<=0&&d2<=0)return [a,[1,0,0]];
 const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return [b,[0,1,0]];
 const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);return [mix(a,b,t),[1-t,t,0]];}
 const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return [c,[0,0,1]];
 const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);return [mix(a,c,t),[1-t,0,t]];}
 const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0){const t=(d4-d3)/(d4-d3+d5-d6);return [mix(b,c,t),[0,1-t,t]];}
 const v=vb/(va+vb+vc),w=vc/(va+vb+vc);return [a.map((x,i)=>x+ab[i]*v+ac[i]*w),[1-v-w,v,w]];
}
export const dogEarProfiles={
 golden:{kind:'drop',root:[.74,.56,.12],height:1.24,width:.33,thickness:.18,out:.22,forward:.48,hat:[.62,.75],flower:[.35,.56,.65],delay:180,lift:13,flex:.13},
 shiba:{kind:'point',root:[.58,.51,.08],height:.57,width:.28,thickness:.12,out:.07,forward:.10,hat:[.43,.75],flower:[.39,.53,.65],delay:80,lift:7,flex:.045},
 corgi:{kind:'large',root:[.66,.48,.06],height:.82,width:.40,thickness:.13,out:.18,forward:.04,hat:[.42,.73],flower:[.39,.48,.65],delay:80,lift:7,flex:.055},
 husky:{kind:'point',root:[.55,.58,.06],height:.69,width:.29,thickness:.12,out:.03,forward:.04,hat:[.38,.76],flower:[.37,.54,.65],delay:80,lift:7,flex:.045},
 border:{kind:'fold',root:[.62,.51,.07],height:.78,width:.29,thickness:.12,out:.07,forward:.03,hat:[.41,.73],flower:[.36,.50,.65],delay:120,lift:8,flex:.075},
 beagle:{kind:'drop',root:[.73,.54,.12],height:1.53,width:.29,thickness:.15,out:.20,forward:.47,hat:[.60,.75],flower:[.34,.54,.65],delay:180,lift:12,flex:.15},
 samoyed:{kind:'fluff',root:[.60,.55,.06],height:.54,width:.28,thickness:.16,out:.06,forward:.04,hat:[.43,.76],flower:[.38,.53,.65],delay:80,lift:6,flex:.035},
 poodle:{kind:'wool',root:[.75,.40,.16],height:1.06,width:.34,thickness:.22,out:.20,forward:.44,hat:[.62,.80],flower:[.32,.51,.65],delay:180,lift:9,flex:.09}
};
const drooping=p=>p.kind==='drop'||p.kind==='wool';
// A scalar field shared by both ear surfaces; its gradient transforms normals exactly.
export function earField(y,z,length){const radius=Math.hypot(y,z),t=clamp((radius-.12)/length,0,1),w=t*t*(3-2*t),s=radius>1e-8&&t>0&&t<1?6*t*(1-t)/length/radius:0;return [w,0,s*y,s*z];}
export function buildDogEar(id,side,inner=false){
 const p=dogEarProfiles[id],drop=drooping(p),direction=drop?-1:1,segments=32,center=[0,.43],positions=[],indices=[];
 const knots=drop?[[-.30,0],[.30,0],[.91,.25],[1,.56],[.78,.86],[.20,1],[-.48,.94],[-.84,.67],[-.86,.28]]:[[-.70,0],[.70,0],[.83,.38],[.48,.78],[.12,1],[-.24,.91],[-.72,.44]];
 const boundary=Array.from({length:segments},(_,i)=>{const t=i/segments*knots.length,k=Math.floor(t),f=t-k,a=knots[(k+knots.length-1)%knots.length],b=knots[k],c=knots[(k+1)%knots.length],d=knots[(k+2)%knots.length];return [0,1].map(j=>.5*(2*b[j]+(-a[j]+c[j])*f+(2*a[j]-5*b[j]+4*c[j]-d[j])*f*f+(-a[j]+3*b[j]-3*c[j]+d[j])*f*f*f));});
 const point=(q,front,radial)=>{
  let [x,u]=q;if(inner){x*=drop?.65:.66;u=.17+.66*u;}u=clamp(u,0,1);
  const scallop=p.kind==='wool'?1+.06*Math.cos(u*Math.PI*6):p.kind==='fluff'?1+.025*Math.cos(u*Math.PI*6):1;
  x*=p.width*scallop;const outward=p.out*(drop?Math.sin(u*Math.PI*.8):u),tip=drop?.24:.12;
  const padding=p.thickness*(1-(1-tip)*u)*(.42+.58*(1-radial*radial));
  const offset=(front?1:-1)*padding+(inner?(front?1:-1)*.012:0);
  let y=direction*p.height*u,z=p.forward*(drop?1-Math.exp(-u*5):u)+offset;
  if(p.kind==='fold'&&u>.60){const maxAngle=side<0?1.8:2.35,angle=maxAngle*(u-.60)/.40,radius=p.height*.40/maxAngle;y=p.height*.60+radius*Math.sin(angle)-offset*Math.sin(angle);z=p.forward*u+radius*(1-Math.cos(angle))+offset*Math.cos(angle);}
  if(drop){const twist=side*(.13+.45*u*u),shift=x*Math.sin(twist);z+=shift;y+=.035*Math.sin(u*Math.PI);}
  return [side*(x+outward),y,z];
 };
 // Inner surfaces sample the same outer padding field, including the inset radius.
 const radiusAt=q=>{const dx=q[0]-center[0],dy=q[1]-center[1];let limit=Infinity;for(let i=0;i<segments;i++){const a=boundary[i],b=boundary[(i+1)%segments],ex=b[0]-a[0],ey=b[1]-a[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;const ax=a[0]-center[0],ay=a[1]-center[1],r=(ax*ey-ay*ex)/den,s=(ax*dy-ay*dx)/den;if(r>0&&s>=0&&s<=1)limit=Math.min(limit,r);}return Number.isFinite(limit)?1/limit:0;};
 const face=(rings,front)=>{
  const offset=positions.length,place=(q,r)=>{let radial=r;if(inner){const inset=[q[0]*(drop?.65:.66),.17+.66*q[1]];radial=radiusAt(inset);}positions.push(point(q,front,radial));};place(center,0);
  for(let r=1;r<=rings;r++)for(const b of boundary)place(mix(center,b,r/rings),r/rings);
  const put=(a,b,c)=>{if(front===(side*direction>0))indices.push(a,b,c);else indices.push(a,c,b);};
  for(let s=0;s<segments;s++)put(offset,offset+1+s,offset+1+(s+1)%segments);
  for(let r=1;r<rings;r++)for(let s=0;s<segments;s++){const a=offset+1+(r-1)*segments+s,b=offset+1+(r-1)*segments+(s+1)%segments,c=a+segments,d=b+segments;put(a,c,d);put(a,d,b);}
  return offset+1+(rings-1)*segments;
 };
 const front=face(4,inner?!drop:true);
 if(!inner){const back=face(2,false);for(let s=0;s<segments;s++){const next=(s+1)%segments,a=front+s,b=front+next,c=back+s,d=back+next;if(side*direction>0)indices.push(a,c,d,a,d,b);else indices.push(a,d,c,a,b,d);}}
 if(inner){const shell=buildDogEar(id,side,false),triangles=Array.from({length:shell.indices.length/3},(_,k)=>shell.indices.slice(k*3,k*3+3).map(i=>shell.vertices.slice(i*6,i*6+6)));for(let j=0;j<positions.length;j++){let closest=null,normal=null,best=Infinity;for(const triangle of triangles){const [point,weights]=closestTriangle(positions[j],...triangle.map(v=>v.slice(0,3))),distance=Math.hypot(...sub(point,positions[j]));if(distance<best){best=distance;closest=point;normal=unit([0,1,2].map(k=>triangle.reduce((n,v,i)=>n+v[k+3]*weights[i],0)));}}positions[j]=closest.map((x,k)=>x+normal[k]*.012);}}
 const normals=positions.map(()=>[0,0,0]);for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3),n=cross(sub(positions[b],positions[a]),sub(positions[c],positions[a]));for(const j of [a,b,c])for(let k=0;k<3;k++)normals[j][k]+=n[k];}
 const length=p.height*.92;
 return {vertices:positions.flatMap((v,i)=>[...v,...unit(normals[i])].map(round)),indices,ear:{length,delay:p.delay,lift:p.lift,flex:p.flex,side,direction,weights:positions.flatMap(v=>earField(v[1],v[2],length).map(round))}};
}
