import pathfinderPackage from 'mineflayer-pathfinder';
import { Vec3 } from 'vec3';
import { randomUUID } from 'node:crypto';
import { Household } from './household.mjs';
import { vanillaProfile, storageCategory, reserveFor } from './vanilla.mjs';
import { Survival, hostileNames } from './survival.mjs';
import { Gathering, excavationRisk } from './gathering.mjs';
const {goals,Movements}=pathfinderPackage;
export const actionNames=['observe','follow','wait','goto','home','set_home','meet','set_meeting','inspect_recipe','organize','collect','craft','smelt','equip','eat','give','chest','farm','build','explore','fight','retreat','recover','surface','retrieve','prepare_tools','fell_tree','mine','cleanup'];
export const gameTool={name:'game_action',description:'执行一个真实 Minecraft 动作。串行调用，检查结果后再决定下一步。坐标和物品必须来自观察。collect: item 为方块名或 logs/stone/coal/iron/food；craft: item,count 为目标成品数量；smelt: item,count；chest: x,y,z,item,count,mode=inspect/deposit/withdraw；farm: mode=harvest/plant；build: mode=hut/path/farm,item=材料,x,y,z 起点,size=3..7；fight: entityId，仅敌对生物；equip: item,mode=hand/head/torso/legs/feet；give: item,count；explore: x,z 目标；set_home 设置当前位置；所有数量 1..64。',parameters:{type:'object',properties:{action:{type:'string',enum:actionNames},item:{type:'string'},count:{type:'integer',minimum:1,maximum:64},x:{type:'number'},y:{type:'number'},z:{type:'number'},mode:{type:'string'},size:{type:'integer',minimum:3,maximum:7},entityId:{type:'integer'}},required:['action'],additionalProperties:false}};
export const memoryTool={name:'remember',description:'保存玩家明确告知的偏好或已实际发生的经历。长期偏好 scope=global；当前世界事件 scope=world。不得猜测事实或保存秘密。',parameters:{type:'object',properties:{text:{type:'string'},scope:{type:'string',enum:['global','world']}},required:['text','scope'],additionalProperties:false}};
gameTool.description+=' inspect_recipe: item 为成品，读取实际配方与缺少材料；organize: 将背包余量存入玩家登记的分类箱，count 为单次数量上限；set_meeting: 标记当前会合点；meet: 返回当前维度的会合点。';
gameTool.description+=' surface: 寻找水面换气并尝试上岸；retrieve: entityId 为已观察的浅水掉落物，确认氧气和返程后取回，随后上浮；prepare_tools: item=木/石/铁工具、shield 或 torch，可自动补齐木板木棍工作台，铁锭和燃料需已有；fell_tree: 一次采伐一棵可确认的小树，可给树干 x,y,z，count 必须为 1，需真实垫脚材料；cleanup: 清理脚下本次留下的垫脚柱；mine: mode=north/south/east/west，count 为水平双格巷道推进长度 1..16，备工具火把后开挖并原路返回。不会承诺指定矿物产量。';
export function validateAction(a){
  if(!a||!actionNames.includes(a.action))throw new Error('未知游戏动作。');
  for(const key of Object.keys(a))if(!(key in gameTool.parameters.properties))throw new Error(`不支持的动作参数：${key}`);
  for(const k of ['x','y','z'])if(a[k]!==undefined&&(!Number.isFinite(a[k])||Math.abs(a[k])>30_000_000))throw new Error('坐标无效。');
  if(a.count!==undefined&&(!Number.isInteger(a.count)||a.count<1||a.count>64))throw new Error('数量必须为 1–64。');
  if(a.item!==undefined&&!/^[a-z0-9_]{1,80}$/.test(a.item))throw new Error('物品名必须为 Minecraft 注册名。');
  if(a.size!==undefined&&(!Number.isInteger(a.size)||a.size<3||a.size>7))throw new Error('建筑尺寸必须为 3–7。');
  if(a.entityId!==undefined&&!Number.isInteger(a.entityId))throw new Error('实体 ID 无效。');
  if(['fell_tree','surface','cleanup'].includes(a.action)&&a.count!==undefined&&a.count!==1)throw new Error('此动作一次只执行一项，count 必须为 1。');
  if(a.action==='mine'&&(!['north','south','east','west'].includes(a.mode)||(a.count??4)>16))throw new Error('巷道方向必须为 north/south/east/west，长度最多 16。');
  return a;
}
const pos=p=>p?{x:Math.floor(p.x),y:Math.floor(p.y),z:Math.floor(p.z)}:null;
export function inventoryTotals(items){const counts=new Map();for(const item of items)counts.set(item.name,(counts.get(item.name)??0)+item.count);return [...counts].map(([name,count])=>({name,count}));}
const hostile=hostileNames;
const foods=['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_salmon','cooked_cod','bread','baked_potato','apple','carrot','melon_slice','sweet_berries'];
const cropSeeds={wheat:'wheat_seeds',carrots:'carrot',potatoes:'potato',beetroots:'beetroot_seeds'};
export function blueprint(kind,origin,size=5){
  const result=[];const put=(x,y,z)=>result.push({x:origin.x+x,y:origin.y+y,z:origin.z+z});
  if(kind==='path'){for(let x=0;x<size;x++)for(let z=0;z<2;z++)put(x,0,z);}
  else if(kind==='hut'){
    for(let x=0;x<size;x++)for(let z=0;z<size;z++){put(x,0,z);put(x,4,z);if(x===0||z===0||x===size-1||z===size-1)for(let y=1;y<=3;y++)if(!(x===Math.floor(size/2)&&z===0&&y<=2))put(x,y,z);}
    // A real staircase lets a survival player reach the roof without flying.
    for(let step=0;step<3;step++)for(let y=0;y<=step;y++)put(step-3,y,1);
  }else if(kind==='farm'){for(let x=0;x<size;x++)for(let z=0;z<size;z++)put(x,0,z);}
  else throw new Error('只支持 hut、path、farm 三种预设。');
  return result;
}
export class ActionEngine {
  constructor(bot,{owner,role,world,store,emit=()=>{},permissions={}}){Object.assign(this,{bot,owner,role,world,store,emit,permissions});this.current=null;this.tail=Promise.resolve();this.following=false;this.generation=0;this.spawnAnchor=null;this.death=null;this.placed=new Set();this.busySince=0;
    this.household=new Household(this);this.lastOwner=null;this.survival=new Survival(this);this.gathering=new Gathering(this);
    bot.on('death',()=>{this.death={...pos(bot.entity?.position),dimension:this.dimension(),at:Date.now()};this.stop();this.survival.set('dead','已经倒下，原任务已中断');emit('death',{position:this.death});});
  }
  dimension(){return String(this.bot.game?.dimension??'unknown');}
  configure(){const movement=new Movements(this.bot);movement.canDig=false;movement.allow1by1towers=false;movement.allowParkour=false;movement.scafoldingBlocks=[];movement.exclusionAreasStep.push(block=>this.household.enabled&&!this.household.contains(block.position)?100:0);this.bot.pathfinder.setMovements(movement);this.spawnAnchor=pos(this.bot.entity.position);this.observeOwner();}
  observeOwner(){const p=this.bot.players?.[this.owner]?.entity?.position;if(p)this.lastOwner={...pos(p),dimension:this.dimension(),at:Date.now()};return this.lastOwner?.dimension===this.dimension()?this.lastOwner:null;}
  snapshot(){const b=this.bot,p=b.entity?.position;if(!p)return {connected:false};const blocks=b.findBlocks({matching:block=>block.boundingBox!=='empty'&&!['stone','dirt','grass_block','deepslate','bedrock'].includes(block.name),maxDistance:16,count:36}).map(v=>({name:b.blockAt(v)?.name,...pos(v)}));return {connected:true,profile:vanillaProfile.id,position:pos(p),dimension:this.dimension(),equipment:(b.entity.equipment??[]).filter(Boolean).map(i=>({name:i.name,count:i.count})),health:b.health,food:b.food,oxygen:b.oxygenLevel??20,inWater:Boolean(b.entity.isInWater),survival:this.survival.status,temporaryBlocks:this.gathering.temporary.map(t=>({...pos(t.position),material:t.name})),time:b.time?.timeOfDay,raining:b.isRaining,ownerPosition:pos(b.players?.[this.owner]?.entity?.position),lastSeenOwner:this.observeOwner(),inventory:inventoryTotals(b.inventory.items()),entities:Object.values(b.entities).filter(e=>e!==b.entity&&e.position.distanceTo(p)<32).slice(0,24).map(e=>({id:e.id,name:e.name,username:e.username,position:pos(e.position),hostile:hostile.has(e.name),item:e.name==='item'?e.getDroppedItem?.()?.name:undefined})),nearby:blocks,home:this.home(),meeting:this.meeting(),household:this.household.state(),action:this.current?.action??(this.following?'follow':'idle')};}
  home(){for(const m of this.store.memories(this.role.id,this.world)){if(m.world!==this.world||m.kind!=='home')continue;try{const h=JSON.parse(m.text);if(h?.dimension===this.dimension())return h;}catch{}}return null;}
  stop(){this.generation++;this.current?.controller.abort(new Error('任务已停止。'));this.bot.pathfinder?.setGoal(null);this.bot.stopDigging?.();this.bot.clearControlStates?.();this.bot.deactivateItem?.();if(this.bot.currentWindow)this.bot.closeWindow(this.bot.currentWindow);this.following=false;}
  check(signal){signal?.throwIfAborted();if(!this.bot.entity||this.bot.health<=0)throw new Error('当前无法行动。');}
  count(name){return this.bot.inventory.items().filter(i=>i.name===name).reduce((n,i)=>n+i.count,0);}
  item(name){const i=this.bot.inventory.items().find(i=>i.name===name);if(!i)throw new Error(`背包里没有 ${name}。`);return i;}
  point(a){if(!['x','y','z'].every(k=>Number.isFinite(a[k])))throw new Error('此动作需要观察到的 x、y、z 坐标。');return new Vec3(Math.floor(a.x),Math.floor(a.y),Math.floor(a.z));}
  bounds(p){if(this.household.enabled){if(!this.household.contains(p))throw new Error('目标超出当前工作区，请先调整分工范围。');return;}const anchor=pos(this.bot.players?.[this.owner]?.entity?.position)??this.home()??this.spawnAnchor;if(!anchor)throw new Error('没有活动范围中心。');if(Math.hypot(p.x-anchor.x,p.z-anchor.z)>this.role.radius)throw new Error(`目标超出 ${this.role.radius} 格活动范围，请在角色设置中调整或先一起走近。`);}
  protected(p){if(this.permissions.modifyProtected)return false;const home=this.home();if(home&&Math.hypot(p.x-home.x,p.z-home.z)<=8)return true;return this.store.memories(this.role.id,this.world).some(m=>{if(m.world!==this.world||m.kind!=='protection')return false;try{const v=JSON.parse(m.text);return v.dimension===this.dimension()&&Math.hypot(p.x-v.x,p.z-v.z)<=(v.radius??8);}catch{return false;}});}
  async move(p,signal,range=2,{known=false}={}){this.check(signal);if(!known||this.household.enabled)this.bounds(p);const goal=new goals.GoalNear(p.x,p.y,p.z,range);await this.bot.pathfinder.goto(goal);this.check(signal);if(!goal.isEnd(this.bot.entity.position.floored()))throw new Error('未能到达目标，当前位置不能确认任务完成。');}
  async pause(ms,signal){await new Promise((resolve,reject)=>{if(signal.aborted)return reject(signal.reason);const timer=setTimeout(done,ms);function cancel(){clearTimeout(timer);signal.removeEventListener('abort',cancel);reject(signal.reason);}function done(){signal.removeEventListener('abort',cancel);resolve();}signal.addEventListener('abort',cancel,{once:true});});this.check(signal);}
  run(args,context={}){
    validateAction(args);const generation=this.generation;
    const run=async()=>{
      if(generation!==this.generation)throw new Error('旧任务已取消。');
      if(this.settling)throw new Error('上个动作仍在等待游戏回应，请稍后重试或重新邀请伙伴。');
      const controller=new AbortController(),id=randomUUID();const entry={id,action:args.action,controller};this.current=entry;this.following=false;this.bot.pathfinder.setGoal(null);
      const limit=['build','smelt','fell_tree','mine','prepare_tools'].includes(args.action)?180000:90000;
      const timer=setTimeout(()=>controller.abort(new Error('动作超时，已停止。')),limit);
      const onAbort=()=>{this.bot.pathfinder.setGoal(null);this.bot.stopDigging?.();this.bot.clearControlStates();this.bot.deactivateItem?.();if(this.bot.currentWindow)this.bot.closeWindow(this.bot.currentWindow);};controller.signal.addEventListener('abort',onAbort,{once:true});
      this.store.task(id,this.role.id,this.world,'running',args);this.emit('action_start',{id,...args});
      let cancelListener;
      try{const work=Promise.resolve().then(()=>this.execute(args,controller.signal,context));this.settling=true;work.finally(()=>{this.settling=false;}).catch(()=>{});const interrupted=new Promise((_,reject)=>{cancelListener=()=>reject(controller.signal.reason);controller.signal.addEventListener('abort',cancelListener,{once:true});});const result=await Promise.race([work,interrupted]);this.check(controller.signal);this.store.task(id,this.role.id,this.world,'done',{args,result});this.emit('action_result',{id,action:args.action,ok:true,result});return {ok:true,...result};}
      catch(e){this.store.task(id,this.role.id,this.world,controller.signal.aborted?'cancelled':'failed',{args,error:e.message});this.emit('action_result',{id,action:args.action,ok:false,error:e.message});return {ok:false,error:e.message,inventory:this.bot.inventory.items().map(i=>({name:i.name,count:i.count}))};}
      finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);if(cancelListener)controller.signal.removeEventListener('abort',cancelListener);if(this.current===entry)this.current=null;}
    };
    const pending=this.tail.then(run,run);this.tail=pending.catch(()=>{});return pending;
  }
  async execute(a,s,ctx){
    this.check(s);const b=this.bot,n=a.count??1;
    switch(a.action){
      case 'observe':return this.snapshot();
      case 'surface':return this.survival.surface(s);
      case 'retrieve':return this.survival.retrieve(a,s);
      case 'prepare_tools':return this.gathering.prepare(a,s);
      case 'fell_tree':return this.gathering.fell(a,s);
      case 'mine':return this.gathering.mine(a,s);
      case 'cleanup':{const removed=await this.gathering.cleanup(s);return {removed,remaining:this.gathering.temporary.length,complete:this.gathering.temporary.length===0};}
      case 'wait':b.pathfinder.setGoal(null);return {waiting:true};
      case 'follow':{const e=b.players?.[this.owner]?.entity;if(!e)throw new Error('暂时看不到玩家。');if(this.household.enabled)this.bounds(e.position);this.observeOwner();b.pathfinder.setGoal(new goals.GoalFollow(e,this.role.followDistance??3),true);this.following=true;return {following:this.owner,distance:this.role.followDistance??3};}
      case 'set_meeting':{const point={...pos(b.entity.position),dimension:this.dimension()};for(const m of this.store.memories(this.role.id,this.world))if(m.kind==='meeting'&&m.world===this.world){try{if(JSON.parse(m.text).dimension===point.dimension)this.store.deleteMemory(m.id);}catch{}}this.store.memory(this.role.id,this.world,'meeting',JSON.stringify(point),'game');return {meeting:point};}
      case 'meet':{const point=this.meeting();if(!point)throw new Error('当前维度没有会合点。');await this.move(new Vec3(point.x,point.y,point.z),s,2,{known:true});return {position:pos(b.entity.position)};}
      case 'inspect_recipe':return this.recipe(a.item,n);
      case 'organize':return this.organize(n,s);
      case 'goto':await this.move(this.point(a),s,a.mode==='exact'?0:2);return {position:pos(b.entity.position)};
      case 'set_home':{const h={...pos(b.entity.position),dimension:this.dimension()};for(const m of this.store.memories(this.role.id,this.world))if(m.kind==='home'&&m.world===this.world){try{if(JSON.parse(m.text).dimension===h.dimension)this.store.deleteMemory(m.id);}catch{}}this.store.memory(this.role.id,this.world,'home',JSON.stringify(h),'game');return {home:h};}
      case 'home':{const h=this.home();if(!h)throw new Error('这个维度还没有标记家。');await this.move(new Vec3(h.x,h.y,h.z),s,2,{known:true});return {position:pos(b.entity.position)};}
      case 'collect':return this.collect(a.item,n,s);
      case 'craft':return this.craft(a.item,n,s);
      case 'equip':await b.equip(this.item(a.item),['head','torso','legs','feet'].includes(a.mode)?a.mode:'hand');return {equipped:a.item};
      case 'eat':{if(b.food>=20)return {food:b.food,alreadyFull:true};const item=foods.map(name=>b.inventory.items().find(i=>i.name===name)).find(Boolean);if(!item)throw new Error('没有可直接食用的安全食物。');const before=this.count(item.name),foodBefore=b.food;await b.equip(item,'hand');await this.pause(200,s);this.check(s);await b.consume();for(let i=0;i<35&&this.count(item.name)>=before;i++)await this.pause(100,s);this.check(s);if(this.count(item.name)>=before)throw new Error('没有确认到食物消耗，请检查游戏状态。');return {consumed:item.name,foodBefore,food:b.food};}
      case 'give':return this.give(a.item,n,s);
      case 'chest':return this.chest(a,s,ctx);
      case 'smelt':return this.smelt(a.item,n,s,ctx);
      case 'farm':return this.farm(a,s);
      case 'build':return this.build(a,s);
      case 'explore':{const p=b.entity.position;const x=a.x??p.x+Math.round(Math.cos(Date.now())*16),z=a.z??p.z+Math.round(Math.sin(Date.now())*16);const loaded=b.blockAt(new Vec3(Math.floor(x),Math.floor(p.y),Math.floor(z)));if(!loaded)throw new Error('目标区块尚未加载，请先在附近探索。');await this.move(new Vec3(x,p.y,z),s,3);return this.snapshot();}
      case 'fight':return this.fight(a.entityId,s);
      case 'retreat':return this.survival.retreat(s);
      case 'recover':return this.recover(s);
      default:throw new Error('动作未实现。');
    }
  }
  meeting(){for(const m of this.store.memories(this.role.id,this.world)){if(m.world!==this.world||m.kind!=='meeting')continue;try{const p=JSON.parse(m.text);if(p.dimension===this.dimension())return p;}catch{}}return null;}
  recipe(name,count=1){
    const b=this.bot,item=b.registry.itemsByName[name];if(!item)throw new Error('未知原版物品。');
    const recipes=b.recipesAll(item.id,null,true).slice(0,12).map(r=>{const batches=Math.ceil(count/r.result.count);return {produces:r.result.count*batches,requiresTable:r.requiresTable,ingredients:(r.delta??[]).filter(i=>i.count<0).map(i=>{const name=b.registry.items[i.id]?.name??String(i.id),required=-i.count*batches;return {name,required,available:this.count(name),missing:Math.max(0,required-this.count(name))};})};});
    return {item:name,requested:count,recipes,note:recipes.length?'材料数量来自当前版本配方。不同配方是替代方案。':'当前合成接口没有该配方；可能需要熔炼或其他尚未接入的工序。'};
  }
  async organize(limit,s){
    let moved=0;const transfers=[],b=this.bot;
    for(const item of inventoryTotals(b.inventory.items())){
      if(moved>=limit)break;
      if(b.inventory.items().some(i=>i.name===item.name&&i.nbt))continue;
      const spare=item.count-reserveFor(item.name);if(spare<=0)continue;
      const box=this.household.settings().containers.find(c=>c.category===storageCategory(item.name));if(!box)continue;
      const block=b.blockAt(new Vec3(box.x,box.y,box.z));if(block?.name!==box.block)continue;
      const count=Math.min(spare,limit-moved,64);const result=await this.chest({action:'chest',mode:'deposit',item:item.name,count,x:box.x,y:box.y,z:box.z},s,{});
      moved+=result.count;transfers.push({container:box.name,item:item.name,count:result.count});
    }
    return {moved,transfers,complete:moved>=limit,note:moved?'已按实际背包变化确认存入；保留随身物资。':'没有可存入的余量、匹配分类箱或可用箱子。'};
  }
  async makeRoom(){
    const b=this.bot,owner=b.players?.[this.owner]?.entity;if(!owner||!this.following||this.current||b.entity.position.distanceTo(owner.position)>=1.5)return false;
    const center=owner.position.floored();
    for(const [x,z]of [[3,0],[-3,0],[0,3],[0,-3]]){
      const target=center.offset(x,0,z);if(!['air','cave_air'].includes(b.blockAt(target)?.name)||!['air','cave_air'].includes(b.blockAt(target.offset(0,1,0))?.name)||b.blockAt(target.offset(0,-1,0))?.boundingBox!=='block')continue;
      try{this.bounds(target);}catch{continue;}
      const result=await this.run({action:'goto',...pos(target)});return result.ok;
    }
    return false;
  }
  async recover(s){
    const b=this.bot;if(!this.death||this.death.dimension!==this.dimension())throw new Error('当前维度没有可取回的死亡位置。');
    if(b.health<10)throw new Error('生命不足，暂不返回死亡地点。');
    const death=new Vec3(this.death.x,this.death.y,this.death.z),block=b.blockAt(death);
    if(block?.name==='lava'||Object.values(b.entities).some(e=>hostile.has(e.name)&&e.position.distanceTo(death)<8))throw new Error('死亡地点附近仍有危险，先准备装备或请玩家协助。');
    let received=0;const tracked=new Set();
    const collect=p=>{if(p.collectorEntityId===b.entity.id&&tracked.has(p.collectedEntityId))received+=Number(p.pickupItemCount??0);};
    b._client.on('collect',collect);
    try{
      for(const e of Object.values(b.entities))if(e.name==='item'&&e.position.distanceTo(death)<12)tracked.add(e.id);
      await this.move(death,s);
      const drops=Object.values(b.entities).filter(e=>e.name==='item'&&e.position.distanceTo(death)<12).slice(0,24);
      drops.forEach(e=>tracked.add(e.id));
      for(const d of drops){if(!b.entities[d.id])continue;await this.move(d.position,s,1);await this.pause(400,s);}
      return {visited:pos(b.entity.position),received,recovered:received>0,complete:received>0,note:received?'已确认拾取死亡地点附近物品；不能据此保证全部找回。':'到达了附近，但没有确认拾取物品。',inventory:this.snapshot().inventory};
    }finally{b._client.removeListener('collect',collect);}
  }
  async tool(block,s){
    const healthy=i=>{const max=this.bot.registry.itemsByName[i.name]?.maxDurability;return !max||max-(i.durabilityUsed??0)>2;};
    let choices=this.bot.inventory.items().filter(i=>/_pickaxe$|_axe$|_shovel$|_hoe$/.test(i.name)&&healthy(i));
    if(block.harvestTools&&!choices.some(i=>block.harvestTools[i.type])){
      const name=['wooden_pickaxe','stone_pickaxe','iron_pickaxe'].find(n=>block.harvestTools[this.bot.registry.itemsByName[n]?.id]);
      if(!name)throw new Error(`${block.name} 需要暂未支持自动准备的工具。`);
      await this.gathering.ensure(name,this.count(name)+1,s);
      choices=this.bot.inventory.items().filter(i=>/_pickaxe$|_axe$|_shovel$|_hoe$/.test(i.name)&&healthy(i));
    }
    const candidates=choices.map(item=>({item,time:block.digTime(item.type,false,false,false,[],{})})).sort((a,b)=>a.time-b.time);
    if(candidates[0]){await this.bot.equip(candidates[0].item,'hand');this.check(s);}
    if(block.harvestTools&&!block.harvestTools[this.bot.heldItem?.type])throw new Error(`${block.name} 需要更合适的工具，先制作/装备工具。`);
  }
  async dig(block,s){this.check(s);this.bounds(block.position);if(this.protected(block.position))throw new Error('目标在家园保护区，请明确开启本次改建权限。');if(block.name==='bedrock'||block.name.includes('chest')||block.name.includes('shulker')||block.name.includes('furnace'))throw new Error('不会拆除容器或不可破坏方块。');const risk=excavationRisk(this.bot,block);if(risk)throw new Error(risk);await this.move(block.position,s,2);const fresh=this.bot.blockAt(block.position);if(fresh?.name!==block.name)throw new Error('目标方块已经变化。');const currentRisk=excavationRisk(this.bot,fresh);if(currentRisk)throw new Error(currentRisk);await this.tool(fresh,s);this.check(s);await this.bot.dig(block);this.check(s);}
  async collect(item,count,s){
    if(!item)throw new Error('缺少采集对象。');const b=this.bot;
    const matches=block=>item==='logs'?/_log$/.test(block.name):item==='stone'?block.name==='stone':item==='coal'?/_?coal_ore$/.test(block.name):item==='iron'?/iron_ore$/.test(block.name):item==='food'?['sweet_berry_bush','melon'].includes(block.name):block.name===item;
    const candidates=b.findBlocks({matching:matches,maxDistance:Math.min(48,this.role.radius),count:80}).map(p=>b.blockAt(p)).filter(block=>!this.protected(block.position)).sort((a,c)=>a.position.y-c.position.y||a.position.distanceTo(b.entity.position)-c.position.distanceTo(b.entity.position));
    if(!candidates.length)throw new Error('附近没有可采集的目标，或目标位于保护区。');
    const before=this.snapshot().inventory;let broken=0,reason='';
    for(const block of candidates){this.check(s);if(broken>=count)break;if(b.inventory.emptySlotCount()===0){reason='背包已满，请先整理。';break;}try{await this.dig(block,s);broken++;const p=block.position;await this.move(p,s,1);await this.pause(700,s);}catch(e){this.check(s);reason=e.message;if(!broken)continue;break;}}
    const drops=new Set(candidates.flatMap(block=>(b.registry.blocksByName[block.name]?.drops??[]).map(id=>b.registry.items[id]?.name)));
    candidates.forEach(block=>drops.add(block.name));if(item==='food')for(const name of ['melon_slice','sweet_berries'])drops.add(name);
    // A block can break while its drop lands outside the first pickup radius.
    // Approach matching visible drops before reporting the inventory delta.
    if(broken)for(const drop of Object.values(b.entities).filter(e=>e.name==='item'&&e.position.distanceTo(b.entity.position)<8).slice(0,12)){
      let name;try{name=drop.getDroppedItem?.()?.name;}catch{}if(!drops.has(name))continue;
      try{await this.move(drop.position.floored(),s,0);await this.pause(400,s);}catch(error){this.check(s);reason=error.message;}
    }
    const after=this.snapshot().inventory,delta=after.map(i=>({name:i.name,count:i.count-(before.find(v=>v.name===i.name)?.count??0)})).filter(i=>i.count>0);
    const collectedCount=delta.filter(i=>drops.has(i.name)).reduce((n,i)=>n+i.count,0);
    return {blocksBroken:broken,pickedUp:delta,collectedCount,complete:broken>=count&&collectedCount>=count,note:reason||(collectedCount?'仅匹配目标掉落物且实际入包的数量计入进度。':'没有确认拾取目标物品；不要报告采集完成。'),inventory:after};
  }
  async craft(name,count,s,depth=0){
    const b=this.bot,definition=b.registry.itemsByName[name];if(!definition)throw new Error(`未知物品 ${name}。`);if(depth>3)throw new Error('制作前置步骤过多，请分步准备材料。');
    const before=this.count(name);let table=b.findBlock({matching:b.registry.blocksByName.crafting_table.id,maxDistance:32});
    let recipes=b.recipesFor(definition.id,null,count,table);
    if(!recipes.length&&!table){
      const all=b.recipesAll(definition.id,null,true);if(all.some(r=>r.requiresTable)){
        if(!this.count('crafting_table'))await this.craft('crafting_table',1,s,depth+1);
        const target=this.findEmptyNear();await this.place(target,'crafting_table',s);table=b.blockAt(target);recipes=b.recipesFor(definition.id,null,count,table);
      }
    }
    if(!recipes.length)throw new Error(`缺少制作 ${name} 的材料。请先采集材料，木板与木棍也需要单独合成。`);
    if(table)await this.move(table.position,s,3);const recipe=recipes[0],times=Math.ceil(count/recipe.result.count);
    // Each recipe transaction is confirmed before reopening the crafting grid.
    for(let batch=0;batch<times;batch++){this.check(s);const stock=this.count(name);await b.craft(recipe,1,table);this.check(s);for(let i=0;i<20&&this.count(name)-stock<recipe.result.count;i++)await this.pause(100,s);if(this.count(name)-stock<recipe.result.count)break;}
    const made=this.count(name)-before;if(made<=0)throw new Error('没有确认到合成产物。');return {item:name,created:made,requested:count,complete:made>=count,inventory:this.snapshot().inventory};
  }
  async give(name,count,s){
    const b=this.bot,owner=b.players?.[this.owner]?.entity;if(!owner)throw new Error('暂时看不到玩家。');if(this.count(name)<count)throw new Error('背包数量不足。');
    await this.move(owner.position,s,1);await b.lookAt(owner.position.offset(0,0.8,0),true);await this.pause(150,s);
    const existing=new Set(Object.keys(b.entities).map(Number));let received=0,recollected=false;
    // 1.20.1 collect packets include the actual transferred count; mere disappearance is not delivery.
    const collect=packet=>{if(existing.has(packet.collectedEntityId))return;const entity=b.entities[packet.collectedEntityId];let item;try{item=entity?.getDroppedItem?.();}catch{}if(item?.name!==name)return;if(packet.collectorEntityId===owner.id)received+=Number(packet.pickupItemCount??0);if(packet.collectorEntityId===b.entity.id)recollected=true;};
    b._client.on('collect',collect);
    try{const before=this.count(name),item=this.item(name);await b.toss(item.type,null,count);this.check(s);for(let i=0;i<30&&received<count&&!recollected;i++)await this.pause(100,s);const complete=received>=count;return {tossed:name,count,received,complete,recollected,note:complete?'已确认玩家拾取。':recollected?'物品被伙伴重新捡回，尚未交付。':'尚未确认玩家拾取，请靠近物品；不要报告已经交付。',inventoryDecreased:before-this.count(name)};}
    finally{b._client.removeListener('collect',collect);}
  }
  findEmptyNear(){const p=this.bot.entity.position.floored();for(let r=2;r<5;r++)for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++){const q=p.offset(x,0,z),block=this.bot.blockAt(q),below=this.bot.blockAt(q.offset(0,-1,0));if(block?.name==='air'&&below?.boundingBox==='block'&&!this.protected(q))return q;}throw new Error('附近没有允许放置的空地。');}
  async place(p,name,s){
    this.check(s);this.bounds(p);if(this.protected(p))throw new Error('目标位于保护区。');const current=this.bot.blockAt(p);if(current?.name===name)return false;if(!current||!['air','cave_air','void_air'].includes(current.name))throw new Error(`建筑位置被 ${current?.name??'未加载区块'} 占用，未进行覆盖。`);
    const goal=new goals.GoalPlaceBlock(p,this.bot.world,{range:4.2,LOS:true});
    if(!goal.facesPos.length)throw new Error('目标没有可附着的相邻方块。');
    // Pathfinding predicts from cell centres. The actual player can stop at a
    // cell edge, so choose a visible stance and centre there before placing.
    const stances=[];
    for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++)for(let y=-4;y<=1;y++){
      const q=p.offset(x,y,z);if(goal.isStandingIn(q))continue;const foot=this.bot.blockAt(q),head=this.bot.blockAt(q.offset(0,1,0)),floor=this.bot.blockAt(q.offset(0,-1,0));
      if(foot?.boundingBox==='empty'&&head?.boundingBox==='empty'&&floor?.boundingBox==='block'&&goal.getFaceAndRef(q.offset(.5,1.6,.5)))stances.push(q);
    }
    stances.sort((a,b)=>a.distanceTo(this.bot.entity.position)-b.distanceTo(this.bot.entity.position));let target;
    for(const q of stances.slice(0,16)){
      this.check(s);try{await this.bot.pathfinder.goto(new goals.GoalBlock(q.x,q.y,q.z));this.check(s);if(!this.bot.entity.position.floored().equals(q))continue;
        const centre=q.offset(.5,0,.5);
        try{this.bot.setControlState('sneak',true);for(let i=0;i<30;i++){this.check(s);const d=centre.minus(this.bot.entity.position);if(Math.hypot(d.x,d.z)<.07)break;await this.bot.look(Math.atan2(-d.x,-d.z),0,true);this.check(s);this.bot.setControlState('forward',true);await this.pause(50,s);this.bot.setControlState('forward',false);}}
        finally{this.bot.clearControlStates();}
        await this.pause(150,s);target=goal.getFaceAndRef(this.bot.entity.position.offset(0,1.6,0));if(target)break;
      }catch(e){this.check(s);}
    }
    if(!target)throw new Error(`无法找到可见且可到达的放置位置：${p}。已保留已完成部分。`);
    await this.bot.equip(this.item(name),'hand');this.check(s);await this.bot.placeBlock(this.bot.blockAt(target.ref),target.face.scaled(-1));this.check(s);const placed=this.bot.blockAt(p);if(!placed||placed.name==='air')throw new Error('服务端未确认放置成功。');this.placed.add(`${this.dimension()}:${p}`);return true;
  }
  async chest(a,s,ctx){
    const p=this.point(a);if(!ctx.containerAllowed&&!this.household.permits(p,a.mode,a.item))throw new Error('箱子操作需要本次明确授权，或登记为匹配物资类别的分类箱。');if(!['deposit','withdraw','inspect'].includes(a.mode))throw new Error('箱子模式应为 inspect / deposit / withdraw。');await this.move(p,s,3);const block=this.bot.blockAt(p);if(!block||!['chest','trapped_chest','barrel'].includes(block.name))throw new Error('此位置不是支持的箱子。');const before=this.count(a.item),n=a.count??1;const win=await this.bot.openContainer(block);
    try{this.check(s);if(a.mode==='inspect')return {items:win.containerItems().map(i=>({name:i.name,count:i.count}))};const item=this.bot.registry.itemsByName[a.item];if(!item)throw new Error('未知物品。');await win[a.mode](item.id,null,n);this.check(s);}finally{win.close();}
    const expected=before+(a.mode==='withdraw'?n:-n);for(let i=0;i<20&&this.count(a.item)!==expected;i++)await this.pause(100,s);if(this.count(a.item)!==expected)throw new Error('箱子操作后背包数量未得到确认，请检查实际物品。');return {mode:a.mode,item:a.item,count:n,inventory:this.snapshot().inventory};
  }
  async smelt(item,count,s,ctx){
    const recipes={raw_iron:'iron_ingot',raw_gold:'gold_ingot',raw_copper:'copper_ingot',iron_ore:'iron_ingot',gold_ore:'gold_ingot',cobblestone:'stone',sand:'glass',potato:'baked_potato',beef:'cooked_beef',porkchop:'cooked_porkchop',chicken:'cooked_chicken',mutton:'cooked_mutton',cod:'cooked_cod',salmon:'cooked_salmon'};
    if(!recipes[item])throw new Error('暂不支持该熔炼配方。');if(count>8)throw new Error('单次最多熔炼 8 个，完成后可继续。');if(this.count(item)<count)throw new Error('原料不足。');
    let block=this.bot.findBlock({matching:this.bot.registry.blocksByName.furnace.id,maxDistance:24});
    if(block&&!ctx.containerAllowed&&!this.placed.has(`${this.dimension()}:${block.position}`))throw new Error('使用已有熔炉需玩家明确授权容器操作。');
    if(!block){if(!this.count('furnace'))await this.craft('furnace',1,s);const p=this.findEmptyNear();await this.place(p,'furnace',s);block=this.bot.blockAt(p);}
    const fuel=['coal','charcoal'].map(n=>this.bot.inventory.items().find(i=>i.name===n)).find(Boolean);if(!fuel)throw new Error('需要煤炭或木炭燃料。');await this.move(block.position,s,3);const furnace=await this.bot.openFurnace(block);const expected=this.bot.registry.itemsByName[recipes[item]].id;
    try{this.check(s);if(furnace.inputItem()||furnace.outputItem()||furnace.fuelItem())throw new Error('熔炉已有物品，为避免混用请先清空或换一个。');await furnace.putInput(this.item(item).type,null,count);this.check(s);await furnace.putFuel(fuel.type,null,Math.ceil(count/8));let produced=0;
      while(produced<count){await this.pause(500,s);const output=furnace.outputItem();if(output?.type===expected){const n=output.count;await furnace.takeOutput();produced+=n;}}
      return {item:recipes[item],created:produced};
    }finally{furnace.close();}
  }
  async farm(a,s){
    const b=this.bot;if(!['harvest','plant'].includes(a.mode))throw new Error('农作模式为 harvest / plant。');let done=0;const limit=a.count??8;
    if(a.mode==='harvest'){
      const crops=b.findBlocks({matching:block=>{const max=block.name==='beetroots'?3:7;return block.name in cropSeeds&&Number(block.getProperties().age)===max;},maxDistance:24,count:64});
      for(const p of crops){if(done>=limit)break;const block=b.blockAt(p),seed=cropSeeds[block.name];await this.dig(block,s);await this.move(p,s,1);await this.pause(400,s);if(this.count(seed))await this.place(p,seed,s);done++;}
    }else{
      const seed=a.item??'wheat_seeds';if(!Object.values(cropSeeds).includes(seed))throw new Error('不支持该种子。');const soil=b.findBlocks({matching:b.registry.blocksByName.farmland.id,maxDistance:24,count:64});for(const p of soil){if(done>=limit)break;const target=p.offset(0,1,0);if(b.blockAt(target)?.name!=='air')continue;await this.place(target,seed,s);done++;}
    }
    return {mode:a.mode,plots:done,inventory:this.snapshot().inventory};
  }
  async build(a,s){
    const b=this.bot,origin=this.point(a),size=a.size??5,kind=a.mode??'hut',material=a.item??'oak_planks',cells=blueprint(kind,origin,size);
    if(kind==='farm')return this.buildFarm(cells,s);
    if(!b.registry.blocksByName[material]||!/^(?:[a-z]+_planks|cobblestone|stone|bricks|stone_bricks|dirt)$/.test(material))throw new Error('建筑材料请选择木板、圆石、石头、砖块或泥土。');
    const pending=cells.filter(p=>b.blockAt(new Vec3(p.x,p.y,p.z))?.name!==material);
    for(const p of pending){const v=new Vec3(p.x,p.y,p.z);this.bounds(v);if(this.protected(v)||b.blockAt(v)?.name!=='air')throw new Error('建筑范围有障碍或保护区，请选择空地。');}
    if(this.count(material)<pending.length)throw new Error(`需要 ${pending.length} 个 ${material}，当前只有 ${this.count(material)}。`);
    // Bottom-up order gives every block a supported face. A small hut has an open doorway.
    pending.sort((a,b)=>a.y-b.y);let placed=0;for(const p of pending)if(await this.place(new Vec3(p.x,p.y,p.z),material,s))placed++;
    return {kind,placed,origin,verified:cells.every(p=>b.blockAt(new Vec3(p.x,p.y,p.z))?.name===material)};
  }
  async buildFarm(cells,s){
    const b=this.bot,hoe=b.inventory.items().find(i=>/_hoe$/.test(i.name));if(!hoe)throw new Error('先准备一把锄头。');
    for(const p of cells){const v=new Vec3(p.x,p.y,p.z);this.bounds(v);if(this.protected(v)||!['dirt','grass_block','farmland'].includes(b.blockAt(v)?.name)||b.blockAt(v.offset(0,1,0))?.name!=='air')throw new Error('农田需要未受保护、上方为空的泥土/草地。');}
    const water=b.findBlock({matching:b.registry.blocksByName.water.id,maxDistance:24});if(!water||cells.some(p=>Math.abs(p.x-water.position.x)>4||Math.abs(p.z-water.position.z)>4||Math.abs(p.y-water.position.y)>1))throw new Error('请选择已有水源四格以内的土地。');
    let tilled=0;for(const p of cells){const v=new Vec3(p.x,p.y,p.z);if(b.blockAt(v)?.name==='farmland')continue;await this.move(v,s,3);await b.equip(hoe,'hand');this.check(s);await b.activateBlock(b.blockAt(v));await this.pause(150,s);if(b.blockAt(v)?.name!=='farmland')throw new Error('未确认土地已耕作。');tilled++;}return {tilled,note:'已开垦农田，调用 farm plant 播种。'};
  }
  async fight(id,s){return this.survival.fight(id,s);}
}
