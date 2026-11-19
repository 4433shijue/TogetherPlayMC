import {Vec3} from 'vec3';

export const hostileNames=new Set(['zombie','husk','drowned','skeleton','stray','spider','cave_spider','creeper','witch','pillager','vindicator','slime','magma_cube','silverfish','endermite','phantom']);
const air=new Set(['air','cave_air','void_air']);
const water=new Set(['water','seagrass','tall_seagrass','kelp','kelp_plant']);
const danger=new Set(['lava','fire','soul_fire','cactus','magma_block','campfire','soul_campfire','powder_snow','sweet_berry_bush','bubble_column']);
const key=p=>`${p.x},${p.y},${p.z}`;
const dead=Symbol.for('togetherplay.confirmedDead');
export const wet=b=>Boolean(b&&water.has(b.name));
export const open=b=>Boolean(b&&b.boundingBox==='empty'&&!danger.has(b.name));
export function bindOxygen(bot){
  const tag=Symbol.for('togetherplay.ownOxygen');if(bot[tag]||!bot._client?.on)return;bot[tag]=true;
  let own=bot.oxygenLevel??20;
  // Mineflayer 4.39 can copy another entity's air metadata into bot.oxygenLevel.
  // The pinned 1.20.1 protocol stores this player's air at metadata index 1.
  bot._client.on('entity_metadata',packet=>{if(packet.entityId===bot.entity?.id){const entry=packet.metadata?.find(m=>m.key===1);if(entry&&Number.isFinite(entry.value))own=Math.max(0,Math.min(20,Math.round(entry.value/15)));}bot.oxygenLevel=own;});
  bot.on('respawn',()=>{own=20;bot.oxygenLevel=20;});bot.oxygenLevel=own;
}
export function breathing(bot){const p=bot.entity?.position;return Boolean(p&&air.has(bot.blockAt(p.offset(0,1.62,0).floored())?.name));}
export function threats(bot,radius=7){return Object.values(bot.entities).filter(e=>!e[dead]&&e!==bot.entity&&!e.username&&e.type!=='player'&&hostileNames.has(e.name)&&e.position.distanceTo(bot.entity.position)<=radius).sort((a,b)=>a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position));}
export function safeStand(bot,p){return open(bot.blockAt(p))&&!wet(bot.blockAt(p))&&open(bot.blockAt(p.offset(0,1,0)))&&!wet(bot.blockAt(p.offset(0,1,0)))&&bot.blockAt(p.offset(0,-1,0))?.boundingBox==='block'&&!danger.has(bot.blockAt(p.offset(0,-1,0))?.name);}
const ranged=new Set(['skeleton','stray','pillager','witch']);
export function nearbyDanger(bot){return threats(bot,16).filter(e=>e.position.distanceTo(bot.entity.position)<=(ranged.has(e.name)?16:6));}
export function safeCombatStand(bot,p){for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)if(!safeStand(bot,p.offset(x,0,z)))return false;return true;}

// Search only loaded, two-block-clear cells. This also finds a lateral opening
// under an overhang; it never assumes that straight above is breathable.
export function waterRoute(bot,start,target=null,{radius=12,rise=24,limit=7000}={}){
  const origin=start.floored(),queue=[origin],seen=new Map([[key(origin),null]]),points=new Map([[key(origin),origin]]);
  let end=null;
  for(let i=0;i<queue.length&&i<limit;i++){
    const p=queue[i],foot=bot.blockAt(p),head=bot.blockAt(p.offset(0,1,0));
    if(open(foot)&&open(head)&&(target?p.distanceTo(target.floored())<1:air.has(head.name))){end=p;break;}
    for(const [x,y,z] of [[0,1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,-1,0]]){
      const q=p.offset(x,y,z),id=key(q);if(seen.has(id)||Math.hypot(q.x-origin.x,q.z-origin.z)>radius||q.y>origin.y+rise||q.y<origin.y-(target?8:2))continue;
      const f=bot.blockAt(q),h=bot.blockAt(q.offset(0,1,0)),below=bot.blockAt(q.offset(0,-1,0));
      if(!open(f)||!open(h)||(!wet(f)&&!wet(h)&&!wet(below)&&!safeStand(bot,q)))continue;
      seen.set(id,key(p));points.set(id,q);queue.push(q);
    }
  }
  if(!end)return null;const route=[];for(let id=key(end);id!==null;id=seen.get(id))route.unshift(points.get(id));return route;
}

export function survivalDecision(engine,{paused=false}={}){
  const b=engine.bot;if(!b.entity||b.health<=0)return null;
  const underwater=!breathing(b)&&(b.entity.isInWater||wet(b.blockAt(b.entity.position.offset(0,1,0).floored())));
  if(underwater&&engine.current?.action!=='surface'&&(engine.current?.action!=='retrieve'||(b.oxygenLevel??20)<=9||b.health<10))return {action:'surface',reason:'先上浮换气，原任务已经暂停。'};
  if(paused||['retreat','surface','retrieve'].includes(engine.current?.action))return null;
  const enemies=nearbyDanger(b);
  if(b.entity.isInLava||(b.health<10&&enemies.length))return {action:'retreat',reason:'生命或落脚点有危险，先撤到安全位置。'};
  if(engine.current?.action==='fight')return null;
  if(b.health<10&&(engine.current||engine.following))return {action:'wait',reason:'生命不足，先暂停工作休整。'};
  if(enemies.length){const first=enemies[0],armed=b.inventory.items().some(i=>/_sword$|_axe$/.test(i.name));return {action:enemies.length>2||!armed||b.health<12||enemies.some(e=>['creeper','witch','vindicator'].includes(e.name))?'retreat':'fight',entityId:first.id,reason:'附近有敌对生物，先处理危险，原任务已保存。'};}
  return null;
}

export class Survival {
  constructor(engine){this.e=engine;bindOxygen(engine.bot);this.status={state:'ready',message:'保命反应已就绪'};}
  get b(){return this.e.bot;}
  decision(options){return survivalDecision(this.e,options);}
  set(state,message){this.status={state,message,at:Date.now()};this.e.emit('survival',this.status);}
  async move(p,s,range=0,{known=false,timeout=4000}={}){
    const timer=setTimeout(()=>this.b.pathfinder.setGoal(null),timeout);
    try{return await this.e.move(p,s,range,{known});}finally{clearTimeout(timer);}
  }
  async swim(route,s,{deadline=Date.now()+18000,reserve=0}={}){
    const e=this.e,b=this.b;b.pathfinder.setGoal(null);
    try{
      for(const cell of route.slice(1)){
        const goal=cell.offset(.5,0,.5);let best=Infinity,lastProgress=Date.now();
        while(true){
          e.check(s);const p=b.entity.position,dx=goal.x-p.x,dz=goal.z-p.z,dy=goal.y-p.y,horizontal=Math.hypot(dx,dz);
          if(horizontal<.42&&Math.abs(dy)<.55)break;
          if(Date.now()>deadline)throw new Error('游泳时间达到上限，需要先换气。');
          if(reserve&&(b.oxygenLevel??20)<=reserve)throw new Error('已达到返程氧气线。');
          if(!open(b.blockAt(cell))||!open(b.blockAt(cell.offset(0,1,0))))throw new Error('水路发生变化，需要重新找出口。');
          const distance=horizontal+Math.abs(dy);if(distance<best-.12){best=distance;lastProgress=Date.now();}if(Date.now()-lastProgress>2800)throw new Error('水中移动受阻。');
          if(horizontal>.15)await b.lookAt(new Vec3(goal.x,p.y+1.4,goal.z),true);
          e.check(s);b.setControlState('forward',horizontal>.3);b.setControlState('jump',dy>.12);b.setControlState('sprint',false);b.setControlState('sneak',false);
          await e.pause(80,s);
        }
      }
    }finally{b.clearControlStates();}
  }
  async surface(s){
    const b=this.b,e=this.e;this.set('surfacing','正在寻找可呼吸的水面');
    try{
      if(!breathing(b)){
        const route=waterRoute(b,b.entity.position);if(!route)throw new Error('已加载范围内没有找到可呼吸出口，需要玩家协助。');
        await this.swim(route,s);
        for(let i=0;i<30&&!breathing(b);i++){b.setControlState('jump',true);await e.pause(80,s);}
        if(!breathing(b))throw new Error('未确认头部离开水面。');
      }
      // Hold the surface while replenishing air; then try a nearby solid bank.
      for(let i=0;i<45&&(b.oxygenLevel??20)<19;i++){e.check(s);b.setControlState('jump',true);await e.pause(100,s);}
      b.clearControlStates();
      const origin=b.entity.position.floored(),banks=[];
      for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let y=-1;y<=2;y++){const p=origin.offset(x,y,z);if(safeStand(b,p))banks.push(p);}
      banks.sort((a,c)=>a.distanceTo(b.entity.position)-c.distanceTo(b.entity.position));
      let onLand=!b.entity.isInWater;
      for(const bank of banks.slice(0,3)){try{
        // Pathfinder can refuse the final water-to-bank step. The same bounded
        // swimming controls can cross a nearby loaded, one-block shore.
        const route=waterRoute(b,b.entity.position,bank,{radius:5,rise:3,limit:500});
        if(route)await this.swim(route,s,{deadline:Date.now()+3500});
        else await this.move(bank,s,0,{known:true,timeout:2500});
        onLand=!b.entity.isInWater&&safeStand(b,b.entity.position.floored());if(onLand)break;
      }catch{e.check(s);}}
      if(!breathing(b))throw new Error('上岸时重新入水，需要再次自救。');
      this.set(onLand?'safe':'afloat',onLand?'已上岸，等待安排':'已经换气，附近没有可确认的上岸路线');
      return {surfaced:true,onLand,oxygen:b.oxygenLevel,complete:true};
    }finally{b.clearControlStates();}
  }
  async retrieve(a,s){
    const e=this.e,b=this.b,target=b.entities[a.entityId];
    if(!target||target.name!=='item')throw new Error('水下取物需要观察到的掉落物 entityId。');
    if(b.health<14||b.food<12||(b.oxygenLevel??20)<19||!breathing(b))throw new Error('先上岸、补足生命食物并换气，再下水。');
    if(threats(b,12).length)throw new Error('附近有敌对生物，先清理再潜水。');
    e.bounds(target.position);const entry=b.entity.position.clone();
    if(Math.hypot(entry.x-target.position.x,entry.z-target.position.z)>8)throw new Error('请先走到掉落物八格以内的安全岸边。');
    if(!wet(b.blockAt(target.position.floored())))throw new Error('该物品当前不在水中，请使用普通拾取路线。');
    const back=waterRoute(b,target.position),out=waterRoute(b,entry,target.position);
    if(!back||!out)throw new Error('无法确认往返水路，不冒险下潜。');
    const depth=back.at(-1).y-target.position.y;
    // Mineflayer reports oxygen in 0..20 units; reserve 9 for ascent/replanning.
    const budget=out.length*.65+back.length*.35;
    if(depth>6||budget>10||out.length>16)throw new Error('超出浅水取物预算（最深六格，预计往返十秒），需要靠近或其他装备。');
    let received=0,note='',surfaced=false;const onCollect=p=>{if(p.collectorEntityId===b.entity.id&&p.collectedEntityId===target.id)received+=Number(p.pickupItemCount??0);};
    b._client.on('collect',onCollect);this.set('diving','下潜取物，氧气不足将立即返程');
    try{
      try{
        await this.swim(out,s,{deadline:Date.now()+9000,reserve:10});
        for(let i=0;i<10&&b.entities[target.id]&&!received;i++){if((b.oxygenLevel??20)<=10)break;await e.pause(100,s);}
        note=received?'已确认目标物品入包。':'没有确认拾取目标；可能已漂走、消失或被别人拿走。';
      }catch(error){e.check(s);note=error.message;}
      await this.surface(s);surfaced=true;
      return {received,surfaced,complete:received>0&&surfaced,note};
    }finally{b._client.removeListener('collect',onCollect);b.clearControlStates();if(!surfaced)this.set('needs_surface','取物已中断，保命反应将接手上浮');}
  }
  async retreat(s){
    const b=this.b,e=this.e;b.clearControlStates();b.deactivateItem?.();if(b.entity.isInWater&&!breathing(b))return this.surface(s);
    this.set('retreating','正在远离威胁');const origin=b.entity.position.floored(),enemies=threats(b,16),candidates=[];
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)for(let y=-2;y<=2;y++){
      const p=origin.offset(x,y,z),distance=p.distanceTo(origin);if(distance<3||distance>9||!safeCombatStand(b,p))continue;
      const separation=enemies.length?Math.min(...enemies.map(t=>t.position.distanceTo(p))):distance;
      if(enemies.length&&separation<Math.min(...enemies.map(t=>t.position.distanceTo(origin)))+2)continue;
      try{e.bounds(p);}catch{continue;}candidates.push({p,score:separation-distance*.12});
    }
    candidates.sort((a,c)=>c.score-a.score);
    for(const {p}of candidates.slice(0,3)){try{await this.move(p,s,0);const safe=nearbyDanger(b).length===0&&!b.entity.isInLava;if(safe){this.set('safe','已经拉开距离，保持警戒');return {retreated:true,complete:true,health:b.health};}}catch{e.check(s);}}
    this.set('blocked','没有找到可确认的安全退路，需要玩家协助');return {retreated:false,complete:false,note:'未能确认安全退路，已停止工作。'};
  }
  async fight(id,s){
    const b=this.b,e=this.e,target=id?b.entities[id]:nearbyDanger(b)[0];
    if(!target||target.username||target.type==='player'||!hostileNames.has(target.name))throw new Error('目标不是附近可攻击的敌对生物。');
    const weapons=b.inventory.items().filter(i=>/_sword$|_axe$/.test(i.name));
    if(!weapons.length||b.health<12||['creeper','witch','vindicator'].includes(target.name)||threats(b,7).length>2)return {...await this.retreat(s),defeated:false,complete:false,note:'装备、生命或威胁不适合交战，已尝试撤退。'};
    const rank=i=>({netherite:6,diamond:5,iron:4,stone:3,golden:2,wooden:1}[i.name.split('_')[0]]??0)*2+Number(i.name.endsWith('_sword'));
    weapons.sort((a,c)=>rank(c)-rank(a));await b.equip(weapons[0],'hand');e.check(s);
    const equippedShield=b.inventory.slots?.[45]?.name==='shield'?b.inventory.slots[45]:null;
    const shield=equippedShield??b.inventory.items().find(i=>i.name==='shield');if(shield&&!equippedShield){await b.equip(shield,'off-hand');e.check(s);}
    await e.pause(150,s);
    let defeated=false,lastAttack=0,strafes=0,blocks=0,attacks=0;const origin=b.entity.position.clone(),deadline=Date.now()+25000;
    const died=t=>{t[dead]=true;if(t.id===target.id)defeated=true;};b.on('entityDead',died);this.set('defending','正在防卫，低血量或威胁增加就撤退');
    try{
      while(b.entities[target.id]&&!defeated&&Date.now()<deadline){
        e.check(s);const nearby=threats(b,7);
        if(b.health<10||nearby.length>2||nearby.some(t=>['creeper','witch','vindicator'].includes(t.name)))return {...await this.retreat(s),defeated:false,complete:false,attacks,strafes,shieldRaised:blocks>0,note:'战况危险，已中断攻击并尝试撤退。'};
        if(target.position.distanceTo(origin)>20)break;e.bounds(target.position);
        const distance=target.position.distanceTo(b.entity.position);
        if(distance>3){b.clearControlStates();if(!safeCombatStand(b,target.position.floored())){await e.pause(200,s);continue;}await b.lookAt(target.position.offset(0,1.4,0),true);if(shield&&ranged.has(target.name)){b.activateItem(true);blocks++;}else b.deactivateItem();try{await this.move(target.position,s,1,{timeout:2000});}catch{e.check(s);}await e.pause(100,s);continue;}
        await b.lookAt(target.position.offset(0,(target.height??1.8)*.75,0),true);e.check(s);
        // Test each proposed sidestep against loaded floor, headroom and bounds.
        const dx=target.position.x-b.entity.position.x,dz=target.position.z-b.entity.position.z,len=Math.hypot(dx,dz)||1;
        const side=Math.floor(Date.now()/900)%2?1:-1,p=b.entity.position.offset(side*dz/len,0,side*-dx/len).floored();
        let canStep=safeCombatStand(b,p);try{e.bounds(p);}catch{canStep=false;}
        b.setControlState('left',canStep&&side>0);b.setControlState('right',canStep&&side<0);if(canStep)strafes++;
        const cooldown=weapons[0].name.endsWith('_axe')?1250:700;
        if(Date.now()-lastAttack>=cooldown&&distance<3&&(!b.canSeeEntity||b.canSeeEntity(target))){b.deactivateItem();b.attack(target);lastAttack=Date.now();attacks++;e.emit('combat_attack',{target:target.id,weapon:b.heldItem?.name,health:b.health,distance,attacks});}
        else if(shield&&Date.now()-lastAttack>120&&!b.usingHeldItem){b.activateItem(true);blocks++;}
        await e.pause(100,s);
      }
      this.set(defeated?'safe':'waiting',defeated?'确认击败目标':'未确认目标死亡，停止追击');
      return {target:target.name,defeated,complete:defeated,attacks,strafes,shieldRaised:blocks>0,health:b.health,note:defeated?'游戏死亡事件确认击败目标。':'目标离开、超出范围或战斗超时；不计作击败。'};
    }finally{b.removeListener('entityDead',died);b.clearControlStates();b.deactivateItem();b.pathfinder.setGoal(null);}
  }
}
