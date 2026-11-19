const itemId=s=>String(s??'').split(' ')[0];
const common=['minecraft:cobblestone','minecraft:oak_log','minecraft:oak_planks','minecraft:stick'];
const preference=id=>common.includes(id)?common.indexOf(id):id.startsWith('minecraft:')?10:20;
const compareItem=(a,b)=>preference(a)-preference(b)||a.localeCompare(b);
const gathered=id=>/(?:_log|_wood|_stem|_ore)$/.test(id)||['minecraft:cobblestone','minecraft:cobbled_deepslate','minecraft:dirt','minecraft:sand','minecraft:gravel','minecraft:netherrack','minecraft:stone','minecraft:coal','minecraft:diamond','minecraft:redstone','minecraft:quartz'].includes(id);
export function normalizeRecipe(doc){
  let r;try{r=JSON.parse(doc.text);}catch{return null;}
  if(!r.id||!r.result||!Array.isArray(r.ingredients))return null;
  const result=typeof r.result==='object'?r.result:{id:itemId(r.result),count:Number(String(r.result).match(/×(\d+)/)?.[1]??1),name:String(r.result)};
  if(!result.id||result.id==='minecraft:air'||!Number.isFinite(result.count)||result.count<=0)return null;
  return {id:r.id,serializer:r.serializer,result,ingredients:r.ingredients.map(slot=>slot.map(v=>typeof v==='object'?v:{id:itemId(v),count:1})).filter(s=>s.length),coverage:r.coverage,standard:['minecraft:crafting_shaped','minecraft:crafting_shapeless','minecraft:smelting','minecraft:blasting','minecraft:smoking','minecraft:campfire_cooking','minecraft:stonecutting'].includes(r.serializer)};
}
export function materialPlan(recipes,inventory,item,count=1,recipeId=''){
  count=Math.max(1,Math.min(999,Math.floor(Number(count)||1)));
  const stock=new Map();for(const i of inventory??[])stock.set(i.id,(stock.get(i.id)||0)+i.count);
  const missing=new Map(),used=new Map(),steps=[],warnings=new Set();let nodes=0;
  const options=id=>recipes.filter(r=>r.result.id===id).sort((a,b)=>a.id.localeCompare(b.id));
  const take=(id,n)=>{const k=Math.min(stock.get(id)||0,n);stock.set(id,(stock.get(id)||0)-k);if(k)used.set(id,(used.get(id)||0)+k);return n-k;};
  function need(id,n,depth,chain,forced=''){
    n=take(id,n);if(!n)return;
    // Stop at ordinary gatherable resources. Recycling a wall or smelting exotic
    // frozen stone is not a useful default route to logs or cobblestone.
    if(depth>0&&gathered(id)){missing.set(id,(missing.get(id)||0)+n);return;}
    const choices=options(id),r=(forced?choices.find(x=>x.id===forced):null)??choices.filter(r=>r.standard).sort((a,b)=>{
      const coverage=r=>r.ingredients.length?r.ingredients.filter(slot=>slot.some(i=>(stock.get(i.id)||0)>=(i.count||1))).length/r.ingredients.length:0;return coverage(b)-coverage(a)||compareItem(a.id,b.id);
    })[0];
    if(depth>4||++nodes>40||chain.has(id)||!r||!r.standard){missing.set(id,(missing.get(id)||0)+n);if(choices.some(r=>!r.standard))warnings.add('特殊机器配方仅提供通用输入输出，能量、流体和阶段条件需要核实。');if(chain.has(id))warnings.add('已停止展开循环配方。');if(depth>4||nodes>40)warnings.add('前置合成展开达到上限。');return;}
    const times=Math.ceil(n/r.result.count),next=new Set([...chain,id]);
    for(const slot of r.ingredients){const candidates=[...slot].sort((a,b)=>(stock.get(b.id)||0)-(stock.get(a.id)||0)||compareItem(a.id,b.id));let remaining=times;for(const i of candidates){const units=Math.min(remaining,Math.floor((stock.get(i.id)||0)/(i.count||1)));if(units){take(i.id,units*(i.count||1));remaining-=units;}if(!remaining)break;}if(remaining){const i=candidates.find(x=>gathered(x.id)||options(x.id).some(r=>r.standard))??candidates[0];need(i.id,remaining*(i.count||1),depth+1,next);}}
    steps.push({recipe:r.id,item:id,crafts:times,produces:times*r.result.count,ingredients:r.ingredients,station:r.serializer});
    stock.set(id,(stock.get(id)||0)+times*r.result.count-n);
    if(/smelting|blasting|smoking/.test(r.serializer))warnings.add('熔炼步骤还需要合适的设备和燃料，燃料未计入材料缺口。');
  }
  need(item,count,0,new Set(),recipeId);
  return {item,count,available:(inventory??[]).filter(i=>i.id===item).reduce((n,i)=>n+i.count,0),recipes:options(item),used:[...used].map(([id,count])=>({id,count})),missing:[...missing].map(([id,count])=>({id,count})),steps,warnings:[...warnings],source:'当前存档实际加载配方'};
}
