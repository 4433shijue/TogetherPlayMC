import {Vec3} from 'vec3';
import {open,wet,safeStand,threats} from './survival.mjs';

const dirs=[new Vec3(1,0,0),new Vec3(-1,0,0),new Vec3(0,1,0),new Vec3(0,-1,0),new Vec3(0,0,1),new Vec3(0,0,-1)];
const log=b=>Boolean(b&&/^(oak|birch|spruce|jungle|acacia|dark_oak|mangrove|cherry)_log$/.test(b.name));
const key=p=>`${p.x},${p.y},${p.z}`;
export function excavationRisk(bot,block){
  const p=block.position,feet=bot.entity.position;
  if(p.y<feet.y&&p.y>=feet.y-1.1&&Math.abs(p.x+.5-feet.x)<.75&&Math.abs(p.z+.5-feet.z)<.75)return '不会挖掉脚下的支撑方块。';
  for(const d of dirs){const adjacent=bot.blockAt(p.plus(d));if(!adjacent)return '相邻区块尚未加载。';if(wet(adjacent)||['lava','bubble_column'].includes(adjacent.name))return '目标邻近水或岩浆，停止开挖。';}
  const above=bot.blockAt(p.offset(0,1,0));if(['sand','red_sand','gravel'].includes(above?.name)||above?.name.endsWith('_concrete_powder'))return '上方有会掉落的方块，停止开挖。';
  return null;
}
export function inspectTree(engine,start){
  const b=engine.bot,first=b.blockAt(start);if(!log(first))throw new Error('目标不是支持的天然原木。');
  const queue=[first],seen=new Set([key(start)]),logs=[];let canopy=false;
  for(let i=0;i<queue.length;i++){
    const block=queue[i];logs.push(block);engine.bounds(block.position);
    if(engine.protected(block.position))throw new Error('树木连接到保护区，整棵树不采伐。');
    if(logs.length>64||Math.abs(block.position.y-start.y)>10)throw new Error('树体超过本次小树采伐范围，请分开处理大型树木。');
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const p=block.position.offset(x,y,z),next=b.blockAt(p);if(!next)throw new Error('树木边缘尚未加载。');
      if(next.name.endsWith('_leaves'))canopy=true;
      if(next.name===first.name&&!seen.has(key(p))){seen.add(key(p));queue.push(next);}
    }
  }
  if(!canopy)throw new Error('没有发现相连树冠，不自动拆除可能属于建筑的原木。');
  const bottom=Math.min(...logs.map(v=>v.position.y)),top=Math.max(...logs.map(v=>v.position.y));
  const bases=logs.filter(v=>v.position.y===bottom);
  if(bases.length!==1||logs.some(v=>Math.abs(v.position.x-bases[0].position.x)>1||Math.abs(v.position.z-bases[0].position.z)>1)||top-bottom>8)throw new Error('暂支持单主干、九格以内的小树；大树和多主干树保留原状。');
  if(!['dirt','grass_block','podzol','rooted_dirt','mud','moss_block'].includes(b.blockAt(bases[0].position.offset(0,-1,0))?.name))throw new Error('树根不在自然土壤上，暂不采伐。');
  return {logs:logs.sort((a,c)=>a.position.y-c.position.y),base:bases[0].position,top,name:first.name};
}

export class Gathering {
  constructor(engine){this.e=engine;this.temporary=[];}
  get b(){return this.e.bot;}
  supplies(){const b=this.b;if(b.health<12||b.food<10)throw new Error('生命或饱食度不足，先休整。');if(b.inventory.emptySlotCount()<2)throw new Error('至少留出两个背包空位再采集。');if(threats(b,8).length)throw new Error('附近有敌对生物，先处理危险。');}
  async ensure(name,count,s,state={steps:0,stack:[]}){
    const e=this.e,b=this.b;e.check(s);if(e.count(name)>=count)return;
    if(++state.steps>48||state.stack.length>10||state.stack.includes(name))throw new Error(`无法继续准备 ${name}，请先补充基础材料。`);
    const nested={get steps(){return state.steps;},set steps(v){state.steps=v;},stack:[...state.stack,name]};
    if(/_log$/.test(name)){
      const got=await e.collect(name,Math.min(8,count-e.count(name)),s);if(!got.complete||e.count(name)<count)throw new Error(`还缺少 ${name}。${got.note}`);return;
    }
    if(name==='cobblestone'){
      if(!b.inventory.items().some(i=>/_pickaxe$/.test(i.name)))await this.ensure('wooden_pickaxe',1,s,nested);
      await e.collect('stone',Math.min(16,count-e.count(name)),s);if(e.count(name)<count)throw new Error('附近可安全取得的圆石不足。');return;
    }
    const item=b.registry.itemsByName[name];if(!item)throw new Error(`未知物品 ${name}。`);
    const recipes=b.recipesAll(item.id,null,true).filter(r=>r.result?.count>0);
    const score=r=>(r.delta??[]).filter(d=>d.count<0).reduce((n,d)=>{const input=b.registry.items[d.id]?.name;return n+(e.count(input)>=-d.count?0:input?.endsWith('_log')?(b.findBlock({matching:block=>block.name===input,maxDistance:24})?2:100):input?.endsWith('_planks')?3:input==='stick'?2:input==='cobblestone'?5:30);},0);
    recipes.sort((a,c)=>score(a)-score(c));const recipe=recipes[0];if(!recipe)throw new Error(`缺少 ${name}，它需要采集、熔炼或玩家补给。`);
    const times=Math.ceil((count-e.count(name))/recipe.result.count);
    if(recipe.requiresTable&&!b.findBlock({matching:b.registry.blocksByName.crafting_table.id,maxDistance:24}))await this.ensure('crafting_table',1,s,nested);
    const ingredients=(recipe.delta??[]).filter(d=>d.count<0).map(d=>({name:b.registry.items[d.id]?.name,count:-d.count*times}));
    if(ingredients.some(i=>!i.name))throw new Error('配方包含未识别材料。');
    // Preparing sticks can consume planks already reserved for the tool. Recheck
    // all inputs together after preparation, including the workbench cost.
    for(let pass=0;pass<4&&ingredients.some(i=>e.count(i.name)<i.count);pass++)for(const i of ingredients)await this.ensure(i.name,i.count,s,nested);
    if(ingredients.some(i=>e.count(i.name)<i.count))throw new Error(`无法同时备齐 ${name} 的全部材料。`);
    const made=await e.craft(name,count-e.count(name),s);if(!made.complete||e.count(name)<count)throw new Error(`未确认备齐 ${name}。`);
  }
  async prepare(a,s){
    this.supplies();const names=a.item?[a.item]:['stone_pickaxe','stone_axe','stone_sword'];
    if(names.some(n=>! /^(wooden|stone|iron)_(pickaxe|axe|shovel|sword|hoe)$|^(shield|torch)$/.test(n)))throw new Error('自动备料支持木、石、铁工具、盾牌和火把。');
    const ready=[];for(const name of names){const equipped=name==='shield'&&this.b.inventory.slots?.[45]?.name==='shield'?1:0;const needed=(a.count??1)-equipped;if(needed>0)await this.ensure(name,needed,s);ready.push({name,count:this.e.count(name)+equipped});}
    return {ready,complete:true,note:'已核对真实背包；铁锭和燃料需要已有库存。'};
  }
  async pillar(s){
    const e=this.e,b=this.b,p=b.entity.position.floored(),floor=b.blockAt(p.offset(0,-1,0));
    if(!safeStand(b,p)||!open(b.blockAt(p.offset(0,2,0))))throw new Error('临时垫脚位置不安全或头顶受阻。');
    e.bounds(p);if(e.protected(p))throw new Error('垫脚位置位于保护区。');
    const name=['dirt','cobblestone'].find(n=>e.count(n));if(!name)throw new Error('较高树冠需要泥土或圆石垫脚。');
    await b.equip(e.item(name),'hand');e.check(s);b.setControlState('jump',true);
    try{for(let i=0;i<16&&b.entity.position.y<p.y+1.05;i++)await e.pause(50,s);if(b.entity.position.y<p.y+1.05)throw new Error('没有确认跳起，停止垫脚。');await b.placeBlock(floor,new Vec3(0,1,0));e.check(s);for(let i=0;i<10&&b.blockAt(p)?.name!==name;i++)await e.pause(100,s);if(b.blockAt(p)?.name!==name)throw new Error('垫脚方块未放置成功。');this.temporary.push({position:p,name,dimension:e.dimension()});}
    finally{b.clearControlStates();}await e.pause(500,s);
  }
  async cleanup(s){
    const e=this.e,b=this.b;let removed=0;
    while(this.temporary.length){const entry=this.temporary.at(-1);if(entry.dimension!==e.dimension())throw new Error('垫脚块属于另一维度，不能在这里清理。');const block=b.blockAt(entry.position);if(block?.name!==entry.name)break;
      const p=b.entity.position;if(Math.abs(p.x-entry.position.x-.5)>.7||Math.abs(p.z-entry.position.z-.5)>.7||Math.abs(p.y-entry.position.y-1)>.6)break;
      const below=b.blockAt(entry.position.offset(0,-1,0));if(below?.boundingBox!=='block'||['lava','magma_block'].includes(below.name))break;
      await e.tool(block,s);e.check(s);await b.dig(block);e.check(s);this.temporary.pop();removed++;await e.pause(500,s);
    }
    return removed;
  }
  async fell(a,s){
    const e=this.e,b=this.b;this.supplies();if(this.temporary.length)throw new Error('上次采伐有未清理的垫脚块，请先执行 cleanup。');
    const starts=a.x!==undefined?[e.point(a)]:b.findBlocks({matching:log,maxDistance:24,count:64}).sort((p,q)=>p.y-q.y||p.distanceTo(b.entity.position)-q.distanceTo(b.entity.position));
    let tree,error;for(const p of starts){try{tree=inspectTree(e,p);break;}catch(ex){error=ex;}}if(!tree)throw error??new Error('附近没有可确认的小树。');
    const origin=b.entity.position.clone();let broken=0,note='';
    const scaffolds=Math.max(0,tree.top-tree.base.y-4);if(e.count('dirt')+e.count('cobblestone')<scaffolds)throw new Error(`这棵树需要至少 ${scaffolds} 个泥土或圆石垫脚。`);
    if(!b.inventory.items().some(i=>/_axe$/.test(i.name)))await this.ensure('wooden_axe',1,s);
    const before=e.count(tree.name);
    try{
      // Stand beside the trunk, then harvest bottom-up. Only our own temporary
      // column may be removed from below the feet, one supported block at a time.
      const stance=dirs.filter(d=>d.y===0).map(d=>tree.base.plus(d)).find(p=>safeStand(b,p)&&!e.protected(p));if(!stance)throw new Error('树旁没有安全站位。');await e.move(stance,s,0);
      for(const target of tree.logs){
        this.supplies();e.check(s);let block=b.blockAt(target.position);if(block?.name!==tree.name)continue;
        while(block.position.offset(.5,.5,.5).distanceTo(b.entity.position.offset(0,1.62,0))>4.4){if(this.temporary.length>=4)throw new Error('树冠超出安全可及范围。');await this.pillar(s);}
        await e.tool(block,s);e.check(s);await b.dig(block);e.check(s);broken++;await e.pause(100,s);
      }
      await this.cleanup(s);if(this.temporary.length)throw new Error('垫脚块尚未清完，暂停采伐。');
      for(const target of tree.logs.filter(t=>t.position.y===tree.base.y)){await e.move(target.position,s,0);await e.pause(600,s);}
    }catch(ex){e.check(s);note=ex.message;await this.cleanup(s).catch(()=>{});}
    const collected=e.count(tree.name)-before,remaining=tree.logs.filter(t=>b.blockAt(t.position)?.name===tree.name).length;
    return {trees:remaining===0?1:0,blocksBroken:broken,collectedCount:Math.max(0,collected),remaining,temporary:this.temporary.map(v=>({...v.position,material:v.name})),complete:remaining===0&&collected>=broken&&this.temporary.length===0,note:note||'按剩余原木与实际入包数量确认采伐；散落物未全部入包时不会算完成。',startedAt:{...origin}};
  }
  async mine(a,s){
    const e=this.e,b=this.b;this.supplies();const delta={north:new Vec3(0,0,-1),south:new Vec3(0,0,1),east:new Vec3(1,0,0),west:new Vec3(-1,0,0)}[a.mode];
    if(!delta)throw new Error('巷道开挖需要 mode=north/south/east/west。');
    const length=a.count??1;if(length>16)throw new Error('一次巷道最多推进十六格。');
    if(!/^(wooden|stone|iron|diamond|netherite|golden)_pickaxe$/.test(a.item??'stone_pickaxe'))throw new Error('挖矿请选择镐类工具。');await this.ensure(a.item??'stone_pickaxe',1,s);
    await this.ensure('torch',Math.ceil(length/4),s);this.supplies();
    const start=b.entity.position.floored(),trail=[start],before=new Map(b.inventory.items().map(i=>[i.name,e.count(i.name)]));let advanced=0,broken=0,lit=0,note='',returned=false;
    try{
      for(let i=1;i<=length;i++){
        this.supplies();e.check(s);const p=start.plus(delta.scaled(i));e.bounds(p);e.bounds(p.offset(0,1,0));
        const floor=b.blockAt(p.offset(0,-1,0));if(floor?.boundingBox!=='block'||['magma_block','sand','gravel'].includes(floor.name))throw new Error('前方落脚点不可靠，停止掘进。');
        for(const cell of [p.offset(0,1,0),p]){const block=b.blockAt(cell);if(!block)throw new Error('前方区块尚未加载。');if(open(block)&&!wet(block))continue;
          if(!/^(stone|deepslate|granite|diorite|andesite|tuff|dirt|.*_ore)$/.test(block.name))throw new Error(`前方 ${block.name} 不在可开挖地层范围。`);
          const risk=excavationRisk(b,block);if(risk)throw new Error(risk);if(e.protected(cell))throw new Error('掘进方向进入保护区。');
          if(!b.inventory.items().some(i=>/_pickaxe$/.test(i.name)))await this.ensure('stone_pickaxe',1,s);
          await e.tool(block,s);e.check(s);await b.dig(block);e.check(s);broken++;
        }
        if(!safeStand(b,p))throw new Error('开挖后的落脚点不安全。');await e.move(p,s,0);trail.push(p);advanced++;
        if((i-1)%4===0){const torch=trail.at(-2);if(b.blockAt(torch)?.name==='air'){await e.place(torch,'torch',s);lit++;await e.move(p,s,0);}}
        await e.pause(300,s);
      }
    }catch(ex){e.check(s);note=ex.message;}
    // Return only through already visited cells; a changed or obstructed route
    // is reported explicitly instead of digging a new way home.
    try{for(const p of trail.slice().reverse()){if(!safeStand(b,p))throw new Error('返程通道发生变化。');await e.move(p,s,0);}returned=true;}catch(ex){e.check(s);note+=(note?' ':'')+`返程未完成：${ex.message}`;}
    const pickedUp=b.inventory.items().map(i=>({name:i.name,count:e.count(i.name)-(before.get(i.name)??0)})).filter((v,i,all)=>v.count>0&&all.findIndex(o=>o.name===v.name)===i);
    return {advanced,blocksBroken:broken,torchesPlaced:lit,returned,pickedUp,complete:advanced>=length&&returned&&!note,note:note||'已沿原路返回；推进长度与实际掉落分别记录，不保证遇到指定矿脉。'};
  }
}
