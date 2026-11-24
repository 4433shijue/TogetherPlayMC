import {confirmMemory,reviseMemory,memoryMeta} from './memory-continuity.mjs';
import {inspectModBuild} from './mod-build.mjs';
import {appVersion} from './version.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {placeSuggestions,decidePlace} from './place-dialogue.mjs';
import {preferences,savePreferences,usageReport,archive,places,editPlace} from './companion-plus.mjs';
import {incrementalHistory} from './conversation-summary.mjs';

export async function plusAction({store,companion,cacheTest,role,provider,port,storage},action,b){
 const chat=companion.chat;
 if(action==='cache-test'){if(!cacheTest)throw Error('缓存测试不可用。');if(b.operation==='preview')return cacheTest.preview(role);if(b.operation==='start')return cacheTest.start(role,b.id);if(b.operation==='cancel'){if(cacheTest.current?.record.role===role)cacheTest.cancel();return cacheTest.status(role);}if(b.operation==='status')return cacheTest.status(role);throw Error('缓存测试操作无效。');}

 if(action==='preferences'){if(b.save&&b.modelSummary===false)chat.summaryController?.abort();return b.save?savePreferences(store,b):preferences(store);}
 if(action==='memory-engine'){
   const active=chat.role?.id===role,scope={role,world:String(b.world??(active?chat.world:'')??'').slice(0,300),dimension:String(b.dimension??(active?chat.observation?.dimension:'')??'').slice(0,200)};
   if(b.rebuild){if(!preferences(store).semanticMemory||!chat.memoryEngine.status().model.available)throw Error('请先启用并安装本机语义模型。');void chat.memoryEngine.rebuild(scope);}
   const result=b.query?await chat.memoryEngine.search(scope,String(b.query).slice(0,500)):null;
   const history=incrementalHistory(store,role,scope.world,true,scope.dimension);
   return {scope,preferences:preferences(store),status:chat.memoryEngine.status(),result,summary:{text:history.summary,chunks:history.chunks,recentMessages:history.messages.length}};
 }
 if(action==='usage'){
   const trends=store.db.prepare('SELECT meta FROM model_requests ORDER BY created DESC').all().map(r=>JSON.parse(r.meta)).filter(r=>(!b.model||r.model===b.model)&&(!b.endpoint||r.endpointHash===b.endpoint)&&(!b.kind||r.kind===b.kind)).slice(0,30).map(r=>({endpoint:r.endpointHash,kind:r.kind,normalizationVersion:r.usage?.normalizationVersion??1,knownInput:r.usage?.knownInput??r.usage?.input??null,inputComplete:r.usage?.inputComplete??false,time:r.created,model:r.model,input:r.usage?.input??null,cacheRead:r.usage?.cacheRead??r.usage?.cached??null,cacheWrite:r.usage?.cacheWrite??null,cacheStatus:r.usage?.cacheStatus??'unknown',characters:r.bodyCharacters,stablePrefixHash:r.stablePrefixHash??null,stablePrefixCharacters:r.stablePrefixCharacters??null,commonPrefix:r.commonPrefixCharacters??null,stablePrefixChangeReason:r.stablePrefixChangeReason??'unknown'}));
   return {...usageReport(store,Date.now(),b),trends,attempts:store.get('dailyAttempts',{})};
 }
 if(action==='archive')return {...archive(store,role,b),worlds:companion.journey.worlds(role)};
 if(action==='place-decide')return decidePlace(store,{role,world:chat.world,dimension:chat.observation?.dimension},b.id,b.accept===true);
 if(action==='memory-confirm')return confirmMemory(store,role,b.id);
 if(action==='memory-revision')return reviseMemory(store,role,b.id,b.index);
 if(action==='memory-resolve'){const m=store.memories(role).find(m=>m.id===b.id);if(!m)throw Error('记忆不存在。');const meta=memoryMeta(store,b.id);if(!['promise','topic'].includes(meta.category))throw Error('只有约定和待续话题可以标记完成。');store.set('memoryMeta:'+b.id,{...meta,resolved:b.resolved===true});return {ok:true};}
 if(action==='places')return b.save?editPlace(store,role,b,chat.observation,chat.world):{suggestions:chat.world?placeSuggestions(store,{role,world:chat.world,dimension:chat.observation?.dimension}):[],places:places(store,role,b.world),worlds:companion.journey.worlds(role),current:chat.world?{world:chat.world,dimension:chat.observation?.dimension,position:chat.observation?.position}:null};
 if(action==='memory-pin'){
   if(!store.memories(role).some(m=>m.id===b.id))throw Error('这条记忆不属于当前伙伴。');
   let ids=store.get('pinnedMemories:'+role,[]).filter(id=>id!==b.id);if(b.pinned){if(memoryMeta(store,b.id).status!=='active')throw Error('请先确认这条记忆，旧版本不能固定。');if(ids.length>=12)throw Error('最多固定 12 条记忆，请先取消一条。');ids.push(b.id);}store.set('pinnedMemories:'+role,ids);return {ok:true};
 }
 if(action==='diagnostics'){
   const profiles=[];for(const p of companion.profiles){
     let installed=false,paired=false,endpointMatches=false,exists=true;
     try{const mods=await fs.readdir(path.join(p.gameDir,'mods'));installed=mods.some(n=>n.startsWith('together-companion-'+p.loader+'-')&&n.endsWith('.jar'));const c=JSON.parse(await fs.readFile(path.join(p.gameDir,'config/together-companion.json'),'utf8'));paired=c.profileId===p.id&&c.token===p.token;endpointMatches=c.endpoint==='http://127.0.0.1:'+port;}catch{exists=await fs.access(p.gameDir).then(()=>true,()=>false);}
     const build=await inspectModBuild(p.gameDir,p.loader,undefined,p.version);
     profiles.push({build,id:p.id,name:p.name,gameDir:p.gameDir,loader:p.loader,installed,paired,endpointMatches,exists,restorable:Boolean(store.get('installation:'+p.id)),hint:!exists?'找不到游戏目录，请重新添加。':!installed?'退出游戏后点击安装伙伴。':!paired||!endpointMatches?'配置与服务不一致，退出游戏后重新安装伙伴。':build.status!=='current'?build.hint:'安装配置正常，模组已是当前版本。使用 PCL 进入单人世界。'});
   }
   const model=provider(),latest=store.context.list(role).requests.find(r=>r.kind!=='historical');
   return {version:appVersion,service:'本地服务已启动',url:'http://127.0.0.1:'+port,connected:Boolean(chat.client),world:chat.observation?.worldName??'',modelReady:Boolean(model.model&&model.url&&model.key),model:model.model,gameBuildVersion:chat.client?.buildVersion??null,latest:latest?{status:latest.status,error:latest.error,time:latest.created}:null,profiles,storage:storage?{directory:storage.directory,source:storage.source,migration:storage.migration,integrity:storage.integrity??null}:null,advice:chat.client?'已经进入世界，按 T 和伙伴聊天；F8 管理回忆和打算。':'等待你打开游戏并进入单人存档。服务启动不会替你启动 PCL。'};
 }
 throw Error('未知控制台功能。');
}
