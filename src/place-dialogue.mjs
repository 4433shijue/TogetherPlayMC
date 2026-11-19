import {randomUUID} from 'node:crypto';
import {places,editPlace} from './companion-plus.mjs';
import {placeContext} from './companionship.mjs';

export function proposePlace(store,scope,name,observation){
  name=String(name??'').replace(/^[「“"『]|[」”"』。！!]+$/g,'').trim();
  if(!name||name.length>80||!observation?.position)throw Error('请给地点起个短名字，并等游戏同步当前位置。');
  const list=store.get('placeSuggestions:'+scope.role,[]).filter(p=>Date.now()-p.created<86400000);
  const found=list.find(p=>p.world===scope.world&&p.dimension===scope.dimension&&p.name===name&&Math.hypot(...['x','y','z'].map(k=>p.position[k]-observation.position[k]))<3);
  if(found)return found;
  const p={id:randomUUID(),world:scope.world,dimension:scope.dimension,name,position:{...observation.position},created:Date.now()};
  store.set('placeSuggestions:'+scope.role,[p,...list].slice(0,30));return p;
}
export function placeSuggestions(store,scope){return store.get('placeSuggestions:'+scope.role,[]).filter(p=>p.world===scope.world&&p.dimension===scope.dimension&&Date.now()-p.created<86400000);}
export function decidePlace(store,scope,id,accept){
  const list=store.get('placeSuggestions:'+scope.role,[]),p=placeSuggestions(store,scope).find(p=>p.id===id);
  if(!p)throw Error('这张地点建议已过期，或不属于当前存档和维度。');
  if(accept){const same=places(store,scope.role,scope.world).find(x=>x.dimension===scope.dimension&&x.name===p.name);if(same)throw Error('已有同名地点，请到地点簿编辑原地点，或给新地点换个名字。');editPlace(store,scope.role,{...p,id:undefined},null,scope.world);}
  store.set('placeSuggestions:'+scope.role,list.filter(x=>x.id!==id));return {ok:true};
}
export function placeIntent(text){
  if(/[?？]|不要|别记|不记|假如|如果/.test(text))return null;
  const match=text.match(/(?:把这里(?:记为|记作|叫做)|这里(?:以后)?(?:就是|叫做)|以后这里就是|记住这里(?:是|叫|为))\s*(.{1,80}?)[。！!]?$/);
  if(!match)return null;
  return match[1].replace(/^(?:我们|我)的/,'').trim();
}
export function locatePlace(store,scope,text,observation){
  if(!/多远|距离|在哪|怎么回|回家|回到/.test(text))return null;
  const available=placeContext(places(store,scope.role,scope.world),observation);
  const matches=available.filter(p=>text.includes(p.name));
  if(matches.length!==1)return null;
  const p=matches[0];return `「${p.name}」在 ${Math.round(p.position.x)}, ${Math.round(p.position.y)}, ${Math.round(p.position.z)}${p.distance==null?'，当前位置还没同步。':`，离你约 ${p.distance} 格。这是直线距离，沿路是否能走还要看地形。`}`;
}
