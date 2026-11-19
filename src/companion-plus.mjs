import {summarizeUsage} from './provider-usage.mjs';
import {rememberKeepsake} from './keepsakes.mjs';
import {randomUUID} from 'node:crypto';
import {incrementalHistory} from './conversation-summary.mjs';
export const defaultPreferences={streamReplies:true,semanticMemory:true,modelSummary:false,proactiveMinutes:3,proactiveHourly:6,dailyRequests:150,dailyInput:300000,inputChars:45000};
export function preferences(store){return {...defaultPreferences,...store.get('companionPreferences',{})};}
export function savePreferences(store,b){const p=preferences(store);for(const k of ['semanticMemory','modelSummary'])if(b[k]!==undefined){if(typeof b[k]!=='boolean')throw Error('记忆开关无效');p[k]=b[k];}if(b.streamReplies!==undefined){if(typeof b.streamReplies!=='boolean')throw Error('实时回复开关无效');p.streamReplies=b.streamReplies;}for(const [k,min,max] of [['proactiveMinutes',1,60],['proactiveHourly',0,60],['dailyRequests',1,5000],['dailyInput',1000,100000000],['inputChars',8000,200000]])if(b[k]!==undefined){const n=Number(b[k]);if(!Number.isInteger(n)||n<min||n>max)throw Error(k+' 超出允许范围');p[k]=n;}return store.set('companionPreferences',p);}
const day=now=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date(now));
export function usageReport(store,now=Date.now(),filters={}){
 const all=store.db.prepare("SELECT time,role,json FROM events WHERE type='usage' AND time>=? ORDER BY id").all(new Date(now-8*86400000).toISOString()).map(r=>({...JSON.parse(r.json),role:r.role,day:day(r.time)}));
 const rows=all.filter(r=>(!filters.model||r.model===filters.model)&&(!filters.endpoint||r.endpointHash===filters.endpoint)&&(!filters.kind||r.kind===filters.kind)&&(!filters.role||r.role===filters.role));
 const daily=[];for(let i=6;i>=0;i--){const date=day(now-i*86400000),items=rows.filter(r=>r.day===date);daily.push({date,...summarizeUsage(items),proactive:items.filter(r=>r.kind==='proactive').length});}
 const options={models:[...new Set(all.map(r=>r.model).filter(Boolean))],endpoints:[...new Set(all.map(r=>r.endpointHash).filter(Boolean))],kinds:[...new Set(all.map(r=>r.kind).filter(Boolean))]};
 return {daily,today:daily.at(-1),budgetToday:summarizeUsage(all.filter(r=>r.day===day(now))),preferences:preferences(store),options,note:'token 读取比例使用新版完整输入与读取回执；请求命中比例使用新版读取回执，均排除矛盾值。旧口径单列，未知不作零。已知输入包含未完整回执的已知下限；字符前缀与 token 命中是两项不同的诊断。'};
}
export function checkDailyBudget(store,now){const p=preferences(store),today=usageReport(store,now).today,attempts=store.get('dailyAttempts',{});const count=attempts.day===day(now)?attempts.count:0;if(count>=p.dailyRequests||today.input>=p.dailyInput)throw Error('今天已达到用量上限，可在“用量与节奏”调整。未报告的 token 无法计入输入上限。');store.set('dailyAttempts',{day:day(now),count:count+1});}
export function archive(store,role,b={}){
 const query=String(b.query??'').slice(0,300),byId=/^#\d+$/.test(query);
 const args=[role,String(b.world??''),String(b.world??''),byId?Number(query.slice(1)):'%'+query.replace(/[\\%_]/g,'\\$&')+'%'];
 const where="role=? AND (?='' OR world=?) AND type IN ('reply','owner_chat') AND "+(byId?'id=?':"json_extract(json,'$.text') LIKE ? ESCAPE '\\'");
 const total=store.db.prepare('SELECT COUNT(*) n FROM events WHERE '+where).get(...args).n;
 const offset=Math.max(0,Math.floor(Number(b.offset)||0)),limit=b.export?Math.min(total,100000):50;
 const rows=store.db.prepare('SELECT id,time,world,type,json FROM events WHERE '+where+' ORDER BY id DESC LIMIT ? OFFSET ?').all(...args,limit,offset).map(r=>({...r,data:JSON.parse(r.json),json:undefined}));return {rows,total,offset,truncated:b.export&&total>limit};
}
export function places(store,role,world){return store.get('places:'+role,[]).filter(p=>!world||p.world===world);}
export function editPlace(store,role,b,observation,currentWorld){
 const list=places(store,role),old=list.find(p=>p.id===b.id);if(b.id&&!old)throw Error('地点不存在。');
 if(b.remove){store.set('places:'+role,list.filter(p=>p.id!==b.id));return {ok:true};}
 const world=b.here?currentWorld:String(b.world??old?.world??''),dimension=b.here?observation?.dimension:String(b.dimension??old?.dimension??''),position=b.here?observation?.position:b.position??old?.position;
 if(!world||!dimension||!position||!['x','y','z'].every(k=>typeof position[k]==='number'&&Number.isFinite(position[k])&&Math.abs(position[k])<=30000000))throw Error('请进入世界记录当前位置，或填写有效存档、维度和坐标。');
 const name=String(b.name??old?.name??'').trim().slice(0,100);if(!name)throw Error('给地点起个名字吧。');
 const p={id:old?.id??randomUUID(),world,dimension,position:Object.fromEntries(['x','y','z'].map(k=>[k,Number(position[k])])),name,notes:String(b.notes??old?.notes??'').slice(0,2000)};
 store.set('places:'+role,[p,...list.filter(v=>v.id!==p.id)].slice(0,1000));if(/^(?:(?:我们|我|咱们)的?)?(?:家|新家|小屋|小窝|基地|home)$/i.test(p.name))rememberKeepsake(store,{role,world,dimension},'home');return p;
}
export function historyContext(store,role,world,preview=false,dimension=''){return incrementalHistory(store,role,world,preview,dimension);}
export function boundInput(input,max){
 const copy={...input,messages:input.messages.map(m=>({...m}))};
 const size=()=>copy.system.length+JSON.stringify(copy.tools??[]).length+copy.messages.reduce((n,m)=>n+JSON.stringify({...m,images:undefined}).length,0);
 // Remove whole earlier conversation turns; never break tool call/result pairs.
 while(size()>max&&copy.messages.length>1){const next=copy.messages.findIndex((m,i)=>i>0&&m.role==='user');if(next<1)break;copy.messages.splice(0,next);}
 if(size()>max)throw Error('本次文字上下文超过输入预算，请缩小问题或调高“用量与节奏”中的单次文字上限。图片另按接口计量。');
 return copy;
}
