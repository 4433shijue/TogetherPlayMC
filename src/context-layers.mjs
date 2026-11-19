const layers={observation:'current',guidance:'current','personality-delivery':'current',memories:'retrieval',evidence:'retrieval',pack:'retrieval',goals:'continuity',journal:'continuity','recalled-quotes':'retrieval',unfinished:'continuity','triggered-book':'retrieval','history-summary':'continuity',places:'retrieval'};
const priority={observation:100,guidance:95,memories:90,unfinished:85,evidence:80,'recalled-quotes':75,'triggered-book':70,goals:65,'history-summary':60,places:50,'personality-delivery':40,journal:30,pack:20};
// Whole sections are omitted, never sliced through structured facts or negations.
export function fitContextLayers(sections,stableIds,{max,tools,question}){
 const stable=sections.filter(s=>stableIds.has(s.id)),base=stable.map(s=>s.text).join('\n').length+JSON.stringify(tools??[]).length+String(question??'').length+512;
 let remaining=Math.max(0,max-base),dynamic=sections.filter(s=>!stableIds.has(s.id)).sort((a,b)=>(priority[b.id]??0)-(priority[a.id]??0));
 for(const s of stable)Object.assign(s,{layer:'core',location:'system',included:true});
 for(const s of dynamic){s.layer=layers[s.id]??'retrieval';s.location='current-message';s.originalCharacters=s.text.length;s.included=s.text.length+1<=remaining;if(s.included)remaining-=s.text.length+1;else{s.omittedReason='超过本轮文字预算；原始记录仍保留';s.text='';}}
 return {system:stable.map(s=>s.text).join('\n'),dynamic:sections.filter(s=>!stableIds.has(s.id)&&s.included).map(s=>s.text).join('\n')};
}
