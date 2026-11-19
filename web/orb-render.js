// CPU preview of the exact meshes shipped to Minecraft. No external 3D runtime.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const hex=s=>parseInt(s.slice(1),16),rgb=n=>[n>>16&255,n>>8&255,n&255];
const color=(a,b,t)=>a.map((n,i)=>n*(1-t)+b[i]*t);
const fallback={dogBreed:'golden',coatPattern:'solid',muzzleColor:'#F5DBAD',innerEarColor:'#DBA9A0',noseColor:'#483534',markingColor:'#D8A15B',markingColor2:'#F1D19A',form:'orb',ears:'preset',accessory:'none',mode:'solid',color:'#88C9B0',color2:'#F3D69B',coreColor:'#FFE8AB',accentColor:'#6F9C89',accessoryColor:'#E79C8E',eyeColor:'#203F36',autoEyeColor:true,softBody:true,face:true};
export function surfaceHeight(mesh,x,y){const f=mesh.front,gx=clamp((x-f.min)/f.step,0,f.size-1.00001),gy=clamp((y-f.min)/f.step,0,f.size-1.00001),ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;return (f.z[iy*f.size+ix]*(1-tx)+f.z[iy*f.size+ix+1]*tx)*(1-ty)+(f.z[(iy+1)*f.size+ix]*(1-tx)+f.z[(iy+1)*f.size+ix+1]*tx)*ty;}
export function fitParts(catalogue,meshes,appearance){
 const a={...fallback,...appearance},form=resolveForm(catalogue,a),ears=a.ears==='preset'?(form.earPreset||'none'):a.ears;
 const parts=[...form.parts,...(catalogue.parts[ears]||[]),...(catalogue.parts[a.accessory]||[])].map(p=>({...p}));
 const {ears:e,scarf:s,hat:h,flower:f}=form.fittings,body=meshes[form.parts[0].mesh.startsWith('body-')?form.parts[0].mesh:'body-'+form.id];
 for(const p of parts){switch(p.fit){
  case 'ear':p.x=Math.sign(p.x)*e[0];p.y=e[1];p.z=e[2];break;
  case 'pointedEar':p.x=Math.sign(p.x)*(e[0]>.7?e[0]*.76:e[0]);p.y=e[1];p.z=e[2];break;
  case 'roundEar':p.x=Math.sign(p.x)*(e[0]-.13);p.y=e[1]+.23;break;
  case 'scarf':p.rx=s[0];p.y=s[1];p.rz=s[2];break;
  case 'knot':case 'ribbon':p.x*=s[0]/.85;p.y+=s[1]+.57;p.z*=s[2]/.84;break;
  case 'hat':p.rx=p.rz=h[0];p.y=h[1];break;
  case 'brim':p.rx=h[0];p.rz=h[0]*.94;p.y=h[1]+.08;break;
  case 'pom':p.x=h[0]*.18;p.y=h[1]+.63;break;
  case 'flower':case 'flowerCenter':{
   p.x=f[0];p.y=f[1];p.z=surfaceHeight(body,p.x,p.y)+.045;const nx=-(surfaceHeight(body,p.x+.02,p.y)-surfaceHeight(body,p.x-.02,p.y))/.04,ny=-(surfaceHeight(body,p.x,p.y+.02)-surfaceHeight(body,p.x,p.y-.02))/.04;
   p.yaw=Math.atan2(nx,1)*180/Math.PI;p.pitch=-Math.atan2(ny,Math.hypot(nx,1))*180/Math.PI;
   if(p.fit==='flowerCenter'){const n=Math.hypot(nx,ny,1);p.x+=nx/n*.055;p.y+=ny/n*.055;p.z+=.055/n;}break;
  }
 }if(['hat','brim','pom'].includes(p.fit)&&a.ears!=='none'&&ears!=='floppy'&&ears!=='round'){const pointed=ears==='pointed'||/shiba|corgi|husky|border|samoyed|kitten/.test(ears);if(pointed&&p.fit!=='pom'){p.rx=Math.min(p.rx,.46);p.rz=Math.min(p.rz,.48);}}}return {form,parts};
}
export function deformation(form,a,state,now,motion=0){const amount=a.reducedMotion||a.softBody===false?0:form.softness*(Math.sin(now*.0018)*.009+motion),pose=a.softBody===false?0:state==='sleepy'?-.06:state==='shy'?-.025:state==='proud'?.025:0;return [1-amount*.45-pose*.35,1+amount+pose,1-amount*.4];}
const idle=(now,period,length)=>{const p=now%period;return p<length?Math.sin(Math.PI*p/length)*Math.sin(Math.PI*2*p/length):0;};
const earPulse=(age,delay=0)=>age<=delay||age>=1600?0:Math.sin(Math.PI*(age-delay)/(1600-delay))**2;
export function earMotion(ear,state,now,reduced,eventAge,lag=0,tipLag=lag,turn=0){
 if(!ear||reduced)return {pitch:0,roll:0,yaw:0,bend:[0,0,0]};
 const quiet=['worried','sad','sleepy'].includes(state),beat=state==='wink'?earPulse(eventAge):0,late=state==='wink'?earPulse(eventAge,ear.delay):0;
 const root=quiet?0:beat,tip=quiet?0:late,rest=quiet?0:idle(now,13000,1600),tail=quiet?0:idle(now-ear.delay+13000,13000,1600);
 return {pitch:quiet?-6:root*ear.lift*.4+clamp(lag,-.18,.18)*24,roll:(state==='curious'?-ear.side*6:0)-ear.side*ear.direction*(root*ear.lift*.6+rest),yaw:quiet?0:ear.side*root*(ear.direction>0?7:3),bend:quiet?[0,0,0]:[clamp(turn,-.09,.09)*ear.length*.65, -ear.direction*tip*ear.flex*.15,ear.flex*(tip+.12*tail)+clamp(tipLag,-.18,.18)*.45]};
}
export function deformEarVertex(vertex,weights,bend){
 if(!weights)return vertex;
 const [w,gx,gy,gz]=weights,[dx,dy,dz]=bend,[x,y,z,nx,ny,nz]=vertex,den=1+gx*dx+gy*dy+gz*dz,dot=(nx*dx+ny*dy+nz*dz)/den;
 const normal=[nx-gx*dot,ny-gy*dot,nz-gz*dot],length=Math.hypot(...normal)||1;
 return [x+dx*w,y+dy*w,z+dz*w,...normal.map(n=>n/length)];
}
export function createEarSpring(){let lag=0,turn=0;return {step(inputLag,yawStep,reduced=false){if(reduced){lag=turn=0;}else{lag+=(clamp(inputLag,-.18,.18)-lag)*.25;turn+=(clamp(yawStep,-.085,.085)-turn)*.22;}return {tipLag:lag,turn};},reset(){lag=turn=0;}};}
export function partPose(p,state,now,reduced,phase,lag=0,eventAge=now%6000,ear=null,tipLag=lag,turn=0){
 let {x,y,z}=p,roll=p.rotation||0,pitch=p.pitch||0,yaw=p.yaw||0;
 if(p.motion==='satellite'){const t=reduced?.6:phase;x=Math.cos(t)*1.36;y=.32+Math.sin(t)*.24;z=Math.sin(t)*.90;}
 const quiet=['worried','sad','sleepy'].includes(state),greet=state==='wink'&&eventAge>=0&&eventAge<1600&&!reduced,beat=greet?Math.sin(Math.PI*Math.min(1,eventAge/1600)):0;
 if(ear){const m=earMotion(ear,state,now,reduced,eventAge,lag,tipLag,turn);pitch+=m.pitch;roll+=m.roll;yaw+=m.yaw;}
 else if(p.motion?.startsWith('ear')){const side=p.motion.includes('Left')?-1:1,point=p.motion.endsWith('Point');if(!reduced){if(state==='curious')roll+=side*-8;if(quiet)pitch-=8;else{roll+=idle(now,13000,1600)*2;pitch+=lag*48;}if(greet){pitch+=beat*(point?10:18);yaw+=side*beat*(p.mesh.includes('kitten')?22:5);}}}
 if(p.motion?.startsWith('tail')&&!reduced&&!quiet){const amount=p.motion==='tailPom'?9:p.motion==='tailCurl'?13:23;yaw+=greet?(eventAge<1400?Math.sin(eventAge/1400*Math.PI*4)*amount*Math.sin(Math.PI*eventAge/1400):0):Math.sin(now*.007)*(state==='happy'?amount:idle(now,15000,1700)*4);}
 if(p.motion?.startsWith('paw')){if(state==='sleepy'){y+=.12;z-=.09;}else if(!reduced&&!quiet)pitch+=idle(now+(p.motion.endsWith('Left')?0:2600),19000,1500)*6;}
 if(p.motion==='core'&&!reduced){x+=Math.sin(now*.0013)*.027;y+=Math.sin(now*.0017)*.023;}
 if(p.motion?.startsWith('ribbon')&&!reduced)pitch+=lag*(p.motion==='ribbonLeft'?45:32);
 return {x,y,z,roll:roll*Math.PI/180,pitch:pitch*Math.PI/180,yaw:yaw*Math.PI/180};
}
function rotation(roll,pitch,yaw){const cr=Math.cos(roll),sr=Math.sin(roll),cp=Math.cos(pitch),sp=Math.sin(pitch),cy=Math.cos(yaw),sy=Math.sin(yaw);return (x,y,z)=>{let t=x*cr-y*sr;y=x*sr+y*cr;x=t;t=y*cp-z*sp;z=y*sp+z*cp;y=t;return [x*cy+z*sy,y,-x*sy+z*cy];};}
export function materialColor(base,material,p,n,now,reduced,light,view,sun){
 if(material==='glow')return base.map(v=>v*(reduced?1:.94+.06*Math.sin(now*.0018)));
 const diffuse=clamp(n.reduce((v,x,i)=>v+x*sun[i],0),0,1);let shade=(.38+.62*light)*(.78+.22*diffuse),shine=0;
 if(material==='cloud')shade=(.44+.56*light)*(.88+.12*diffuse);
 if(material==='plush'||material==='cloth')shade*=1+Math.sin(Math.floor(p[0]*19)*12.9898+Math.floor(p[1]*19)*78.233+Math.floor(p[2]*19)*37.719)*(material==='cloth'?.025:.015);
 if(['jelly','ceramic','glass','satin'].includes(material)){const half=sun.map((x,i)=>x+view[i]),length=Math.hypot(...half);const dot=length?clamp(n.reduce((v,x,i)=>v+x*half[i],0)/length,0,1):0;shine=Math.pow(dot,material==='jelly'?44:30)*(material==='jelly'?.37:material==='glass'?.20:.11)*(.4+.6*light);}
 return base.map(v=>clamp(v*shade+255*shine,0,255));
}
export function modelTriangles(catalogue,meshes,appearance,state,now,{angle=0,light=1,phase=now*.00026,motion=0,eventAge=now%6000,lag=motion*.5,tipLag=lag,turn=0}={}){
 const a={...fallback,...appearance},fitted=fitParts(catalogue,meshes,a),{form,parts}=fitted,d=deformation(form,a,state,now,motion),view=[-Math.sin(angle),0,Math.cos(angle)],sun=rotation(0,0,-angle)(-.36,.73,.58),camera=rotation(0,0,angle),triangles=[];
 for(const p of parts){const mesh=meshes[p.mesh],pose=partPose(p,state,now,a.reducedMotion,phase,lag,eventAge,mesh.ear,tipLag,turn),bend=earMotion(mesh.ear,state,now,a.reducedMotion,eventAge,lag,tipLag,turn).bend,rotate=rotation(pose.roll,pose.pitch,pose.yaw),body=p.mesh.startsWith('body-'),surface=p.surface||(p.material==='body'?form.material:p.material==='core'?'glow':form.material==='plush'?'plush':'matte'),base=rgb(hex(p.material==='core'?a.coreColor:p.material==='accessory'?a.accessoryColor:p.material==='body'?a.color:p.material==='innerEar'?a.innerEarColor:a.accentColor)),bottom=rgb(hex(a.color2)),vertices=[];
  for(let i=0;i<mesh.vertices.length;i+=6){const v=mesh.ear?deformEarVertex(mesh.vertices.slice(i,i+6),mesh.ear.weights.slice(i/6*4,i/6*4+4),bend):mesh.vertices.slice(i,i+6);let point=rotate(v[0]*p.rx,v[1]*p.ry,v[2]*p.rz),normal=rotate(v[3]/p.rx,v[4]/p.ry,v[5]/p.rz);if(body){point=point.map((x,j)=>x*d[j]);normal=normal.map((x,j)=>x/d[j]);}point=point.map((x,j)=>x+[pose.x,pose.y,pose.z][j]*d[j]);const len=Math.hypot(...normal)||1;normal=normal.map(x=>x/len);
   const plain=p.material==='body'&&a.mode==='gradient'?color(bottom,base,(clamp(point[1],-1,1)+1)/2):base,tint=maskColor(plain,mesh.masks?.[patternKey(a)]?.slice(i/2,i/2+3),a);
   vertices.push({p:camera(...point),color:materialColor(tint,surface,point,normal,now,a.reducedMotion,light,view,sun),dot:normal.reduce((n,x,j)=>n+x*view[j],0)});
  }
  for(let i=0;i<mesh.indices.length;i+=3){const t=mesh.indices.slice(i,i+3).map(index=>vertices[index]);if(t.reduce((n,v)=>n+v.dot,0)<-.01)continue;triangles.push({points:t.map(v=>v.p),colors:t.map(v=>v.color),color:[0,1,2].map(k=>Math.round(t.reduce((n,v)=>n+v.color[k],0)/3)),alpha:p.alpha??1});}
 }
 return {triangles,form,deformation:d,camera,appearance:a};
}
function facePolygons(face,now,reduced,eventAge=now%6000){
 const phase=now%5700,blink=!reduced&&face.slowBlink&&eventAge>450&&eventAge<1500?Math.max(.10,Math.abs(eventAge-975)/525):!reduced&&face.blink&&phase<180?Math.max(.12,Math.abs(phase-90)/90):1,mouth=face.id==='responding'&&!reduced?.78+.22*Math.sin(now*.012):1,result=[];
 const angle=face.tilt*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
 for(const part of face.parts){const put=points=>result.push({points:points.map(([px,py])=>{let x=px,y=py;if(part.group==='eyes')y=19+(y-19)*blink;if(part.group==='mouth')y=-19+(y+19)*mouth;return [x*cos-y*sin,x*sin+y*cos];}),color:part.color,alpha:part.opacity,anchor:(()=>{let [x,y]=part.anchor||[part.x??part.points[0][0],part.y??part.points[0][1]];if(part.group==='eyes')y=19+(y-19)*blink;if(part.group==='mouth')y=-19+(y+19)*mouth;return [x*cos-y*sin,x*sin+y*cos];})()});
  const ellipse=(x,y,rx,ry)=>{for(let i=0;i<14;i++){const a=i*Math.PI/7,b=(i+1)*Math.PI/7;put([[x,y],[x+Math.cos(a)*rx,y+Math.sin(a)*ry],[x+Math.cos(b)*rx,y+Math.sin(b)*ry]]);}};
  if(part.type==='ellipse')ellipse(part.x,part.y,part.rx,part.ry);else{for(let i=1;i<part.points.length;i++){const [ax,ay]=part.points[i-1],[bx,by]=part.points[i],len=Math.hypot(bx-ax,by-ay);if(!len)continue;const dx=-(by-ay)*part.width/2/len,dy=(bx-ax)*part.width/2/len;put([[ax+dx,ay+dy],[bx+dx,by+dy],[bx-dx,by-dy]]);put([[ax+dx,ay+dy],[bx-dx,by-dy],[ax-dx,ay-dy]]);}for(const p of part.points)ellipse(...p,part.width/2,part.width/2);}
 }return result;
}
function scene(catalogue,meshes,face,appearance,now,options={}){
 const state=face?.id||'calm',model=modelTriangles(catalogue,meshes,appearance,state,now,options),{triangles,form,deformation:d,camera,appearance:a}=model,light=options.light??1;
 if(a.face!==false&&face){const variant=face.variants?.[a.form]||face,body=meshes[form.parts.find(p=>p.mesh.startsWith('body-')).mesh];
  for(const p of facePolygons({...face,...variant},now,a.reducedMotion,options.eventAge)){const local=featureInk(catalogue,meshes,a,p.anchor[0],p.anchor[1],light),tint=p.color==='ink'?local:p.color==='outline'?(local==='#E8F3DA'?'#203F36':'#E8F3DA'):p.color==='nose'?a.noseColor:p.color,offset=p.color==='outline'?.023:tint==='#FFF5DD'?.032:.029;triangles.push({points:p.points.map(([x,y])=>{const px=form.face[0]+x*.01*form.face[3],py=form.face[1]+y*.01*form.face[3];return camera(px*d[0],py*d[1],(surfaceHeight(body,px,py)+offset)*d[2]);}),color:rgb(hex(tint)),alpha:p.alpha,face:true});}
 }
 triangles.sort((a,b)=>a.points.reduce((n,v)=>n+v[2],0)-b.points.reduce((n,v)=>n+v[2],0));return {triangles,form};
}
export function renderModel(ctx,width,height,catalogue,meshes,face,appearance,now,options={}){
 const {triangles,form}=scene(catalogue,meshes,face,appearance,now,options);ctx.clearRect(0,0,width,height);const scale=Math.min(width,height)/3.7,cx=width/2,cy=height/2+height*.025;
 for(const triangle of triangles){ctx.globalAlpha=triangle.alpha;const c=triangle.color;ctx.fillStyle=`rgb(${c[0]},${c[1]},${c[2]})`;ctx.beginPath();triangle.points.forEach((p,i)=>{const x=cx+p[0]*scale,y=cy-p[1]*scale;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();if(!triangle.face&&triangle.alpha===1){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.45;ctx.stroke();}}
 ctx.globalAlpha=1;return form;
}
// Hardware depth and interpolated vertex colors avoid seams where fitted clothes
// overlap the body. Canvas remains a fallback for browsers without WebGL.
let sharedSurface,sharedPainter;
export function createModelRenderer(canvas){
 const ctx=canvas.getContext('2d');
 if(!sharedSurface){sharedSurface=document.createElement('canvas');sharedPainter=createWebGLRenderer(sharedSurface);}
 return (...args)=>{
  if(!sharedPainter)return renderModel(ctx,canvas.width,canvas.height,...args);
  if(sharedSurface.width!==canvas.width)sharedSurface.width=canvas.width;if(sharedSurface.height!==canvas.height)sharedSurface.height=canvas.height;
  const form=sharedPainter(...args);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(sharedSurface,0,0);return form;
 };
}
function createWebGLRenderer(canvas){
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:false});
 if(!gl)return null;
 let program,buffer,position,colorAttribute,scaleUniform;
 const initialize=()=>{
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
  const vertex=shader(gl.VERTEX_SHADER,'attribute vec3 position;attribute vec4 color;uniform vec2 scale;varying vec4 tint;void main(){gl_Position=vec4(position.x*scale.x,position.y*scale.y-.05,-position.z*.25,1.0);tint=color;}');
  const fragment=shader(gl.FRAGMENT_SHADER,'precision mediump float;varying vec4 tint;void main(){gl_FragColor=tint;}');
  program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  buffer=gl.createBuffer();position=gl.getAttribLocation(program,'position');colorAttribute=gl.getAttribLocation(program,'color');scaleUniform=gl.getUniformLocation(program,'scale');
 };
 initialize();canvas.addEventListener('webglcontextlost',e=>e.preventDefault());canvas.addEventListener('webglcontextrestored',initialize);
 return (catalogue,meshes,face,appearance,now,options)=>{
  if(gl.isContextLost())return;const {triangles,form}=scene(catalogue,meshes,face,appearance,now,options),opaque=[],translucent=[],faces=[];
  for(const t of triangles)(t.face?faces:t.alpha<1?translucent:opaque).push(t);
  gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(colorAttribute);gl.vertexAttribPointer(position,3,gl.FLOAT,false,28,0);gl.vertexAttribPointer(colorAttribute,4,gl.FLOAT,false,28,12);
  const radius=Math.min(canvas.width,canvas.height)/3.7;gl.uniform2f(scaleUniform,radius*2/canvas.width,radius*2/canvas.height);
  for(const [i,group]of [opaque,translucent,faces].entries()){if(i){gl.depthMask(false);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);}else{gl.depthMask(true);gl.disable(gl.BLEND);}const data=new Float32Array(group.length*21);let n=0;for(const t of group)for(let j=0;j<3;j++){const p=t.points[j],c=t.colors?.[j]||t.color;data[n++]=p[0];data[n++]=p[1];data[n++]=p[2];data[n++]=c[0]/255;data[n++]=c[1]/255;data[n++]=c[2]/255;data[n++]=t.alpha;}gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);gl.drawArrays(gl.TRIANGLES,0,group.length*3);}
  gl.depthMask(true);return form;
 };
}

export function resolveForm(catalogue,a){const base=catalogue.forms.find(f=>f.id===a.form)||catalogue.forms[0];return a.form==='puppy'?{...base,...catalogue.animals[a.dogBreed||'golden'],id:'puppy'}:base;}
export const patternKey=a=>a.form==='puppy'?(a.dogBreed||'golden'):a.form==='kitten'?'cat-'+(a.coatPattern||'solid'):'';
function maskColor(base,weights,a){if(!weights)return base;let out=base.map(x=>x*(1-weights.reduce((n,v)=>n+v,0)));for(let k=0;k<3;k++){const c=rgb(hex(a[['muzzleColor','markingColor','markingColor2'][k]]));out=out.map((v,i)=>v+c[i]*weights[k]);}return out;}
export function featureInk(catalogue,meshes,appearance,x,y,light=1){const a={...fallback,...appearance};if(!a.autoEyeColor)return a.eyeColor;const f=resolveForm(catalogue,a),px=f.face[0]+x*.01*f.face[3],py=f.face[1]+y*.01*f.face[3],front=meshes[f.parts.find(p=>p.mesh.startsWith('body-')).mesh].front,mask=front.masks?.[patternKey(a)],base=a.mode==='gradient'?color(rgb(hex(a.color2)),rgb(hex(a.color)),(clamp(py,-1,1)+1)/2):rgb(hex(a.color));
 let weights;if(mask){const gx=clamp((px-front.min)/front.step,0,front.size-1.00001),gy=clamp((py-front.min)/front.step,0,front.size-1.00001),ix=Math.floor(gx),iy=Math.floor(gy),tx=gx-ix,ty=gy-iy;weights=[0,1,2].map(k=>(mask[(iy*front.size+ix)*3+k]*(1-tx)+mask[(iy*front.size+ix+1)*3+k]*tx)*(1-ty)+(mask[((iy+1)*front.size+ix)*3+k]*(1-tx)+mask[((iy+1)*front.size+ix+1)*3+k]*tx)*ty);}
 const c=maskColor(base,weights,a),luma=(c[0]*.2126+c[1]*.7152+c[2]*.0722)*(.38+.62*light)*.86/255;return luma<.48?'#E8F3DA':'#203F36';}
