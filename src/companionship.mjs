// Local observations decide when there is something worth sharing. No extra model calls.
const minutes=n=>n*60000;
export function distance(a,b){return a&&b?Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z):null;}
export function placeContext(list,o){return list.filter(p=>p.dimension===o?.dimension).map(p=>{const d=distance(p.position,o.position);return {...p,distance:d==null?null:Math.round(d),distanceKind:'直线距离；不代表可步行路线'};});}
export function moments(previous,next,{now=Date.now(),places=[]}={}){
  if(!previous)return [];
  const result=[];
  const add=(key,text,priority=1,category='scenery',ttl=5,cooldown=30)=>result.push({key,text,priority,category,created:now,expires:now+minutes(ttl),cooldown:minutes(cooldown)});
  if(previous.dimension!==next.dimension){add('dimension:'+next.dimension,'刚进入了另一个维度 '+next.dimension,2);return result;}
  if(previous.biome&&next.biome&&previous.biome!==next.biome)add('biome:'+next.biome,'走进了新的群系 '+next.biome);
  if(previous.weather&&next.weather&&previous.weather!==next.weather)add('weather:'+next.weather,'天气变成了'+next.weather);
  if(Number.isFinite(previous.time)&&Number.isFinite(next.time)){
    const night=t=>t>=13000&&t<23000;
    if(night(previous.time)!==night(next.time))add('daylight:'+night(next.time),night(next.time)?'天色慢慢暗下来了':'天又亮了');
  }
  if(next.health<previous.health)add('hurt','玩家刚刚受伤，请先关注目前是否已经安全',3,'care',5,3);
  if(previous.health<=6&&next.health>10)add('recovered','刚才受伤后，血量已经恢复了',3,'care',5,3);
  if(previous.food>6&&next.food<=6)add('hungry','玩家现在有些饿了',3,'care');
  if(!previous.dead&&next.dead)add('death','玩家刚刚在冒险中倒下，等重新站稳后再温和回应',4,'care',8,3);
  if(previous.dead&&!next.dead)add('respawn','玩家已经重新出生，先陪她缓一缓',4,'care',5,3);
  if(previous.advancementsKnown&&next.advancementsKnown){
    const known=new Set((previous.advancements??[]).map(a=>a.id));
    for(const a of next.advancements??[])if(!known.has(a.id))add('progress:'+a.id,'刚获得了进度「'+a.title+'」',2,'progress',8,1440);
  }
  if(previous.durability!=null&&next.durability!=null&&previous.durability>.1&&next.durability<=.1)add('durability:'+next.held,'手中的工具耐久已经不到一成',3,'care');
  const oldEntities=new Set((previous.nearby??[]).map(e=>e.id));
  for(const e of (next.nearby??[]).filter(e=>!oldEntities.has(e.id)).slice(0,2)){
    if(e.hostile&&e.distance<=8)add('nearby-danger:'+e.id,'看见附近有'+e.name+'，距离约'+Math.round(e.distance)+'格；平静提醒，不渲染恐怖',3,'care',1,3);
    else if(!e.hostile)add('animal:'+e.type,'附近看见了'+e.name,1,'scenery',2);
  }
  for(const p of places.filter(p=>p.dimension===next.dimension)){
    const before=distance(p.position,previous.position),after=distance(p.position,next.position);
    if(before!=null&&after!=null&&before>12&&after<=12)add('arrival:'+p.id,'回到了记下的地点「'+p.name+'」附近',2,'places');
  }
  // Older clients can still report explicit events. Inventory changes are deliberately quiet.
  for(const text of next.events??[]){
    if(/背包|整理|物品变化|inventory|held|手里|手持|拿着|受伤|新维度/i.test(text))continue;
    add('legacy:'+text.replace(/[\d.,，\s+-]+/g,'').slice(0,100),text,1);
  }
  return result;
}
export function quietIntent(text,now=Date.now()){
  if(/(?:恢复|继续)(?:主动)?(?:聊天|说话)|可以说话了|不用安静了|陪我聊聊/.test(text))return {until:0,message:'好，我在呢。'};
  if(/(?:^|[，,。])\s*(?:请)?(?:你)?(?:先)?(?:安静|别说话|不要说话|先别聊|别打扰|让我专心)/.test(text)&&!/[?？]|为什么|怎么|能不能/.test(text)){
    const value=text.match(/([\d零一二两三四五六七八九十百]{1,5})\s*分钟/)?.[1];
    const digit=c=>c==='两'?2:'零一二三四五六七八九'.indexOf(c),chinese=s=>{if(s==='两')return 2;if(s.includes('百')){const [a,b]=s.split('百');return (digit(a)||1)*100+(b?chinese(b.replace(/^零/,'')):0);}if(s.includes('十')){const [a,b]=s.split('十');return (a?digit(a):1)*10+(b?digit(b):0);}return digit(s);};
    const amount=value?(/^\d+$/.test(value)?Number(value):chinese(value)):15,duration=Math.min(120,Math.max(1,amount));
    return {until:now+minutes(duration),message:`好，我先安静陪你 ${duration} 分钟。你叫我，我还是会回应。`};
  }
  return null;
}
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
function tokens(text){return new Set([...segmenter.segment(text.toLowerCase())].filter(s=>s.isWordLike&&!/^(我|你|我们|的|了|是|在|啊|呀|呢|哦|吧|也|还|就|可以|一下)$/.test(s.segment)).map(s=>s.segment));}
export function repeatsReply(text,earlier){
  const flat=s=>s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  const polarity=s=>/(?:不|没|未|别|无|not|never)/i.test(s);
  const a=tokens(text),numbers=s=>(s.match(/\d+/g)??[]).join(',');
  return earlier.some(old=>{
    if(flat(text)===flat(old))return true;
    if(polarity(text)!==polarity(old)||numbers(text)!==numbers(old))return false;
    const b=tokens(old),shared=[...a].filter(t=>b.has(t)).length;
    return shared>=3&&shared/Math.max(a.size,b.size)>=.72;
  });
}
