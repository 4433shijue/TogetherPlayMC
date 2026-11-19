import {formLibrary,meshLibrary} from './orb-shape.js';
import {createModelRenderer} from './orb-render.js';
export const faceLibrary=fetch('/orb-faces.json').then(r=>{if(!r.ok)throw Error('表情预览暂时不可用');return r.json();});
const views=new Map();let library=[],forms=null,meshes=null,scheduled=false,last=0;
const reducedMedia=matchMedia('(prefers-reduced-motion: reduce)');
Promise.all([faceLibrary,formLibrary,meshLibrary]).then(([data,catalogue,geometry])=>{library=data;forms=catalogue;meshes=geometry;for(const v of views.values())build(v);}).catch(()=>{});
function build(v){
 v.face=library.find(f=>f.id===v.state)||library[0];if(!v.face||!forms||!meshes)return;
 if(!v.canvas){v.canvas=document.createElement('canvas');v.canvas.className='orb-face-layer';v.canvas.setAttribute('aria-hidden','true');v.host.querySelector('.orb-face-layer')?.remove();v.host.append(v.canvas);v.render=createModelRenderer(v.canvas);}
 v.host.setAttribute('aria-label',v.face.label+'的'+(forms.forms.find(f=>f.id===(v.appearance.form||'orb'))||forms.forms[0]).name);paint(v,Date.now());
}
function paint(v,now){
 if(!v.face||!v.canvas)return;const box=v.host.getBoundingClientRect();if(!box.width||!box.height)return;
 const ratio=Math.min(devicePixelRatio||1,2),width=Math.round(box.width*ratio),height=Math.round(box.height*ratio),key=width+','+height;
 if(v.size!==key){v.canvas.width=width;v.canvas.height=height;v.size=key;}

 const reduced=v.appearance.reducedMotion||reducedMedia.matches||!v.animate;
 v.render(forms,meshes,v.face,{...v.appearance,reducedMotion:reduced},now,{eventAge:now-v.started,angle:v.appearance.previewAngle||0,light:v.appearance.previewLight??1,phase:v.state==='responding'?.6:now*(v.state==='thinking'?.00055:.00026)});
 v.host.style.transform=reduced?'':`translateY(${Math.sin(now*.002)*(v.appearance.face===false?.012:v.face.bob)*100}px)`;
}
function animate(now){scheduled=false;if(now-last>=1000/20){last=now;for(const [host,v] of views){if(!host.isConnected){views.delete(host);continue;}if(v.animate&&host.getClientRects().length)paint(v,Date.now());}}
 if(views.size){scheduled=true;requestAnimationFrame(animate);}}
export function showFace(host,state='calm',appearance={},animateFace=true){
 const signature=JSON.stringify([state,appearance]);let v=views.get(host);if(v?.signature===signature&&v.animate===animateFace)return;
 if(!v){v={host};views.set(host,v);}if(v.state!==state)v.started=Date.now();Object.assign(v,{signature,state,appearance,animate:animateFace});host.style.background='transparent';host.classList.add('vector-orb');build(v);
 if(!scheduled){scheduled=true;requestAnimationFrame(animate);}
}
new ResizeObserver(()=>{for(const v of views.values())if(!v.animate)paint(v,Date.now());}).observe(document.documentElement);
