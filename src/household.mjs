import { randomUUID } from 'node:crypto';
import { Vec3 } from 'vec3';
import { storageCategory } from './vanilla.mjs';
export const storageCategories=['building','food','seeds','minerals'];
const kinds=new Set(['chest','trapped_chest','barrel']);

export class Household {
  constructor(engine) { this.engine=engine; this.enabled=false; }
  key() { const e=this.engine; return `household:${e.role.id}:${e.world}:${e.dimension()}`; }
  settings() { return this.engine.store.get?.(this.key(),{area:null,containers:[]})??{area:null,containers:[]}; }
  state() { return {...this.settings(),enabled:this.enabled,dimension:this.engine.dimension()}; }
  area() { return this.enabled?this.settings().area:null; }
  contains(p) { const a=this.area(); return Boolean(a&&Math.hypot(p.x-a.x,p.z-a.z)<=a.radius&&Math.abs(p.y-a.y)<=16); }
  enable(radius) {
    const e=this.engine;
    if(!e.bot.players?.[e.owner]?.entity)throw new Error('请先在伙伴身边划定工作区。');
    if(!Number.isInteger(radius)||radius<8||radius>Math.min(48,e.role.radius))throw new Error('工作半径应为 8–48 格，且不超过角色活动半径。');
    const p=e.bot.entity.position;
    const settings=this.settings(); settings.area={x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z),radius};
    e.store.set(this.key(),settings); this.enabled=true; return this.state();
  }
  disable() { this.enabled=false; return this.state(); }
  register({name,category,x,y,z}) {
    const e=this.engine;
    if(typeof name!=='string'||!name.trim()||name.length>60||!storageCategories.includes(category))throw new Error('请填写箱子名称并选择收纳类别。');
    if(![x,y,z].every(Number.isInteger))throw new Error('请从附近观察到的容器中选择。');
    const p=new Vec3(x,y,z),block=e.bot.blockAt(p);
    if(e.bot.entity.position.distanceTo(p)>6||!kinds.has(block?.name))throw new Error('请让伙伴走近箱子或木桶六格内，再指定用途。');
    const settings=this.settings(),existing=settings.containers.find(c=>c.x===x&&c.y===y&&c.z===z);
    if(!existing&&settings.containers.length>=24)throw new Error('每个维度最多登记 24 个箱子。');
    const entry={id:existing?.id??randomUUID(),name:name.trim(),category,x,y,z,block:block.name,access:'deposit'};
    settings.containers=settings.containers.filter(c=>c.id!==entry.id).concat(entry); e.store.set(this.key(),settings); return entry;
  }
  remove(id) { const settings=this.settings();settings.containers=settings.containers.filter(c=>c.id!==id);this.engine.store.set(this.key(),settings); }
  permits(p,mode,item) { return ['deposit','inspect'].includes(mode)&&this.settings().containers.some(c=>c.x===p.x&&c.y===p.y&&c.z===p.z&&this.engine.bot.blockAt(p)?.name===c.block&&(mode==='inspect'||storageCategory(item)===c.category)); }
}
