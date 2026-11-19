export function promptObservation(observation,query=''){
 const {unlockedQuests=[],visibleQuests=[],startableQuests=[],completedQuests=[],advancements=[],...state}=observation;
 const words=String(query).toLowerCase().match(/[a-z_]+|[\u4e00-\u9fff]{2,}/g)??[];
 const relevant=advancements.filter(a=>words.some(w=>(a.title+' '+a.id).toLowerCase().includes(w))).slice(0,8);
 return {...state,questSummary:{known:state.questProgressKnown,completedKnown:state.questCompletedKnown,visible:visibleQuests.length,startable:startableQuests.length,completed:completedQuests.length,note:'完整任务 ID 留在本地检索和完成校验中；可见不等于完成。'},advancementSummary:{known:state.advancementsKnown,completed:advancements.length,relevant,note:'完整已获进度列表留在本地；这里只附与本轮问题相关的条目。'}};
}
export function promptEvidence(evidence){
 let remaining=18000;
 return evidence.flatMap(d=>{if(remaining<=0)return [];const text=String(d.text??''),limit=Math.min(6000,remaining);remaining-=Math.min(text.length,limit);return [{...d,text:text.slice(0,limit),...(text.length>limit?{excerptTruncated:true,originalCharacters:text.length}:{} )}];});
}
export const section=(id,label,prefix,value)=>({id,label,text:prefix+(typeof value==='string'?value:JSON.stringify(value))});
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
export const stableJson=value=>JSON.stringify(canonical(value));
export const stableSection=(id,label,prefix,value)=>({id,label,text:prefix+(typeof value==='string'?value:stableJson(value))});
