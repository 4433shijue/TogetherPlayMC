const definitions={home:{label:'小围巾',note:'记下了我们的家'},snow:{label:'毛线帽',note:'一起走进雪地'},flower:{label:'头顶小花',note:'你在聊天里送给我的花'}};
export function keepsakes(store,role,world){return store.get('keepsakes:'+role,[]).filter(r=>!world||r.world===world);}
export function rememberKeepsake(store,scope,id,now=Date.now()){
  if(!definitions[id]||!scope?.role||!scope.world)return false;
  const records=keepsakes(store,scope.role);if(records.some(r=>r.id===id&&r.world===scope.world))return false;
  store.set('keepsakes:'+scope.role,[{id,...definitions[id],world:scope.world,dimension:scope.dimension||'',created:now},...records].slice(0,300));return true;
}
export function observeKeepsake(store,scope,observation,now){
  if(observation?.active&&!observation.dead&&/^minecraft:(snowy_plains|snowy_taiga|snowy_beach|snowy_slopes|ice_spikes|frozen_peaks|jagged_peaks|grove)$/.test(observation.biome))return rememberKeepsake(store,scope,'snow',now);
  return false;
}
export function flowerGift(text){
  if(/[?？]|不|别|没|如果|假如|要是|打算|想要|想送|准备|以后|明天|改天|能不能|可以|怎么|如何|他说|她说|例如|比如|[“”「」"『』]/.test(text))return false;
  return /^(?:好[呀啊]?[，, ]*)?(?:我)?(?:送(?:给)?你|给你)(?:一朵|一束|这朵|这束|一[朵束]小)?(?:小|鲜)?花(?:[，, ]*(?:收下吧|戴上吧|给你戴|送给你))?[。！!～~呀啊啦吧]*$/.test(text.trim());
}
