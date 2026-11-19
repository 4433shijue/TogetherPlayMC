import {CacheTest} from './cache-test.mjs';
import {cacheSupport,validateCachePolicy} from './prompt-cache.mjs';
import {memoryMeta} from './memory-continuity.mjs';
import {appVersion} from './version.mjs';
import {createSnapshot,listSnapshots,previewSnapshot,restoreSnapshot,recoverInterruptedRestore,snapshotRoot} from './data-snapshots.mjs';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Store,protectSecret } from './store.mjs';
import { endpoint,listModels,protocols,complete } from './providers.mjs';
import { importCard,exportCard,validateSkin } from './cards.mjs';
import { CompanionSession } from './session.mjs';
import { gameTool } from './actions.mjs';
import { launchClient,validateName } from './launch.mjs';
import { root,runtime,work } from './paths.mjs';
import { prepareCompanion,managedGame } from '../scripts/prepare-companion.mjs';
import { createPracticeWorld } from './practice-world.mjs';
import { vanillaProfile } from './vanilla.mjs';
import { createCompanionAPI,companionProfile } from './companion-api.mjs';
import {plusAction} from './plus-api.mjs';
import {health,acquireService} from './service-lock.mjs';
import {describeContext} from './request-context.mjs';
import {memoryEvidence} from './memory.mjs';
import {prepareDataDirectory} from './data-root.mjs';

const publicDir=path.join(root,'web');
const json=(res,status,data)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(data));};
async function body(req){let size=0;const parts=[];for await(const chunk of req){size+=chunk.length;if(size>12_000_000)throw new Error('上传内容过大。');parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{throw new Error('请求格式无效。');}}
export async function createApp({directory,storage,port=38885,open=false,companionProfiles,companionRequest}={}){
  storage ??= directory ? {directory:path.resolve(directory),source:'explicit',integrity:null,counts:{},migration:{status:'explicit',source:null,backup:null}} : await prepareDataDirectory({root});
  directory ??= storage.directory;
  const managedAvailable=await fs.access(path.join(root,'config/experiment.json')).then(()=>true,()=>false);
  await recoverInterruptedRestore(directory);
  const csrf=randomBytes(24).toString('hex'),bridgeToken=randomBytes(32).toString('hex'),clients=new Set();
  let store,session,companion,cacheTest,config,visionConfig,selectedRole,mode,key='',visionKey='',enabled=false,bridgeState=null,lastBridge=0,gameProcess=null,preparing=false,closing=false,maintenance=false,activeRequests=0;
  const publicProvider=()=>({...config,cachePolicy:config.cachePolicy??'auto',cacheSupport:cacheSupport(config),hasKey:Boolean(key)});
  const provider=()=>({...config,key});
  const visionProvider=()=>visionConfig.enabled?{...visionConfig,key:visionKey}:provider();
  const emit=event=>{if(['owner_chat','companion_cancel','companion_settings'].includes(event.type))cacheTest?.cancel('聊天或伙伴状态发生变化，测试已停止。');const text=`event: update\ndata: ${JSON.stringify(event)}\n\n`;for(const res of clients)res.write(text);};
  async function loadRuntime(){
    store=new Store(directory);key='';visionKey='';
    config=store.get('provider',{protocol:'openai',url:'',model:'',toolMode:'native',hourlyLimit:120});
    visionConfig=store.get('visionProvider',{enabled:false});
    for(const [setting,vision] of [['encryptedKey',false],['encryptedVisionKey',true]])if(store.get(setting))try{const secret=await protectSecret(store.get(setting),true);if(vision)visionKey=secret;else key=secret;}catch(e){store.event('error',{message:e.message});}
    selectedRole=store.get('selectedRole',store.roles()[0].id);if(!store.role(selectedRole))selectedRole=store.roles()[0].id;
    session=new CompanionSession({store,provider,emit});mode=managedAvailable?store.get('playMode','companion'):'companion';
    companion=await createCompanionAPI({store,provider,visionProvider,emit,role:()=>store.role(selectedRole),getMode:()=>mode,setMode:value=>{mode=value;enabled=false;store.set('playMode',value);},legacy:session,directory,profiles:companionProfiles,request:companionRequest});
    cacheTest=new CacheTest({store,provider,emit,request:companionRequest,context:()=>({world:companion.chat.world,busy:Boolean(companion.chat.pending||store.context.pending.size)})});companion.chat.cacheTestBusy=()=>Boolean(cacheTest.current);

  }
  await loadRuntime();
  const notice=message=>emit(store.event('notice',{message}));
  const sync=()=>{
    if(mode==='legacy'&&enabled&&bridgeState?.online){const role=store.role(selectedRole);if(session.status==='disconnected')return;session.join({...bridgeState,role});}
  };
  async function prepareEnvironment(){if(preparing)throw new Error('环境正在准备，请稍等。');preparing=true;try{return await prepareCompanion(notice);}finally{preparing=false;}}
  async function writeBridge(){await fs.mkdir(path.join(managedGame,'config'),{recursive:true});await fs.writeFile(path.join(managedGame,'config/togetherbridge.json'),JSON.stringify({endpoint:`http://127.0.0.1:${server.address().port}`,token:bridgeToken}));}
  const server=http.createServer(async(req,res)=>{
    activeRequests++;
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    try{
      const expected=`127.0.0.1:${server.address().port}`;if(req.headers.host!==expected&&req.headers.host!==`localhost:${server.address().port}`)return json(res,403,{error:'仅接受本机访问。'});
      const url=new URL(req.url,`http://${expected}`),route=url.pathname;
      if(maintenance)return json(res,503,{error:'正在备份或恢复数据，请稍候。'});
      if(route.startsWith('/companion/v1/')){
        if(req.headers.origin&&![`http://${expected}`,`http://localhost:${server.address().port}`].includes(req.headers.origin))return json(res,403,{error:'来源不匹配。'});
        return await companion.native(req,res,url,body);
      }
      if(route==='/bridge'){
        if(req.headers.authorization!==`Bearer ${bridgeToken}`)return json(res,403,{error:'连接凭据无效。'});
        if(req.method==='GET')return json(res,200,{enabled:enabled&&mode==='legacy'});
        if(mode!=='legacy')return json(res,200,{enabled:false,ok:false});
        if(req.method!=='POST')return json(res,405,{error:'不支持的方法。'});const state=await body(req);
        if(state.online){validateName(state.owner);if(!Number.isInteger(state.port)||state.port<1||state.port>65535||! /^(world|practice):[a-f0-9-]{36}$/.test(state.world))throw new Error('世界连接信息无效。');}
        const previous=bridgeState;bridgeState=state;lastBridge=Date.now();if(!state.online)session.leave();else if(enabled){if(previous?.world!==state.world)session.leave();sync();}return json(res,200,{ok:true});
      }
      if(req.headers.origin&&![`http://${expected}`,`http://localhost:${server.address().port}`].includes(req.headers.origin))return json(res,403,{error:'来源不匹配。'});
      if(req.method!=='GET'&&req.headers['x-together-token']!==csrf)return json(res,403,{error:'页面会话已失效，请刷新页面。'});
      if(route.startsWith('/api/voice/')){
        const b=req.method==='GET'?{}:await body(req),voice=companion.voice;
        if(route==='/api/voice/config')return json(res,200,req.method==='POST'?await voice.save(b):{...voice.config(),...await voice.info()});
        if(route==='/api/voice/test'&&req.method==='POST')return json(res,200,await voice.speak('web-preview','我在这里，准备好就一起出发吧。',{preview:true}));
        if(route==='/api/voice/cancel'&&req.method==='POST'){voice.cancel('web-preview');return json(res,200,{ok:true});}
        return json(res,404,{error:'语音接口不存在。'});
      }
      if(route.startsWith('/api/context/')){
        if(req.headers['x-together-token']!==csrf)return json(res,403,{error:'请刷新页面后查看上下文。'});
        if(route==='/api/context/requests'&&req.method==='GET')return json(res,200,store.context.list(selectedRole,Object.fromEntries(url.searchParams)));
        if(route==='/api/context/request'&&req.method==='GET')return json(res,200,store.context.get(selectedRole,url.searchParams.get('id')));
        if(route==='/api/context/preview'&&req.method==='POST'){
          const b=await body(req),text=String(b.text??'').slice(0,4000);if(mode!=='companion')throw new Error('当前预览适用于球体聊天伙伴；旧版模式可查看实际请求记录。');
          const {input,sections}=companion.chat.buildContext(text,{preview:true});
          return json(res,200,{meta:{id:'preview',created:new Date().toISOString(),role:selectedRole,world:companion.chat.world,kind:'preview',model:config.model,protocol:config.protocol,toolMode:config.toolMode,status:'preview',full:true,usage:{input:null,output:null,cached:null,cacheRead:null,cacheWrite:null,uncachedInput:null,cacheStatus:'unknown'}},detail:describeContext({...provider(),cacheScope:{role:selectedRole,world:companion.chat.world,kind:'chat',mode:'companion'}},input,sections)});
        }
        return json(res,404,{error:'上下文接口不存在。'});
      }
      if(route.startsWith('/api/storage/')&&req.method==='POST'){
        const b=await body(req);
        if(route==='/api/storage/list')return json(res,200,{directory,snapshotDirectory:snapshotRoot(directory),snapshots:await listSnapshots(directory)});
        if(route==='/api/storage/preview')return json(res,200,await previewSnapshot(directory,b.id));
        if(!['/api/storage/backup','/api/storage/restore'].includes(route))throw Error('未知的数据操作。');
        if(activeRequests>1||preparing||companion.knowledge.jobs.size||store.context.pending.size)throw Error('还有操作正在完成，请等回复或资料整理结束后重试。');
        if(route.endsWith('/restore')&&(companion.chat.client||session.active||gameProcess))throw Error('请先保存退出游戏，再恢复数据。');
        maintenance=true;
        try{
          if(route.endsWith('/backup'))return json(res,200,await createSnapshot(directory));
          const preview=await previewSnapshot(directory,b.id);if(preview.token!==b.token)throw Error('请重新预览这份备份后确认恢复。');
          await cacheTest?.close();session.close();await companion.close();await store.context.drain();store.close();
          let result;
          try{result=await restoreSnapshot(directory,b.id,b.token);}finally{await loadRuntime();}
          enabled=false;bridgeState=null;emit({type:'data_restored',data:result});return json(res,200,result);
        }finally{maintenance=false;}
      }
      if(route==='/api/shutdown'&&req.method==='POST'){json(res,200,{ok:true});setTimeout(()=>close(),100);return;}
      if(route.startsWith('/api/plus/')&&req.method==='POST')return json(res,200,await plusAction({store,companion,cacheTest,role:selectedRole,provider,port:server.address().port,storage},route.slice('/api/plus/'.length),await body(req)));
      if(await companion.web(req,res,url,body))return;
      if(route==='/api/state')return json(res,200,{app:'TogetherPlayMC',version:appVersion,contextRecording:true,managedAvailable,mode,storage:{directory,source:storage.source,migration:storage.migration,integrity:storage.integrity??null,counts:storage.counts??{}},companion:companion.publicState(),profile:mode==='companion'?companionProfile:vanillaProfile,csrf,provider:publicProvider(),visionProvider:{...visionConfig,cachePolicy:visionConfig.cachePolicy??'auto',cacheSupport:cacheSupport(visionProvider()),hasKey:Boolean(visionKey)},roles:store.roles(),selectedRole,enabled,preparing,gameRunning:Boolean(gameProcess),session:mode==='companion'?companion.chat.state():session.state(),bridge:mode==='companion'?{worldName:companion.chat.observation?.worldName}:bridgeState,usage:store.usage(),events:store.events(80),conversation:store.conversation(selectedRole,(mode==='companion'?companion.chat.world:session.world)??null),capability:config.model?store.get(session.capabilityKey()):null});
      if(route==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
      if(route==='/api/provider'&&req.method==='POST'){
        const b=await body(req);if(!protocols.includes(b.protocol)||!['native','json','chat'].includes(b.toolMode))throw new Error('接口设置无效。');endpoint(b,'models');if(typeof b.model!=='string'||b.model.length>200)throw new Error('模型 ID 无效。');const limit=Number(b.hourlyLimit);if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error('请求上限应为 1–1000。');
        validateCachePolicy(b.cachePolicy??'auto',b.protocol);cacheTest.cancel('连接设置发生变化，测试已停止。');if(b.key){if(typeof b.key!=='string'||b.key.length>8192)throw new Error('密钥无效。');const encrypted=await protectSecret(b.key);store.set('encryptedKey',encrypted);key=b.key;}else if(b.clearKey){store.set('encryptedKey',null);key='';}
        config={protocol:b.protocol,url:b.url.trim(),model:b.model.trim(),toolMode:b.toolMode,hourlyLimit:limit,cachePolicy:b.cachePolicy??'auto',apiVersion:typeof b.apiVersion==='string'?b.apiVersion:'2023-06-01'};store.set('provider',config);session.cancel();companion.chat.cancel();session.messages=[];return json(res,200,publicProvider());
      }
      if(route==='/api/vision-provider'&&req.method==='POST'){
        const b=await body(req);if(typeof b.enabled!=='boolean')throw new Error('请选择是否单独设置识图模型。');
        if(b.enabled){if(!protocols.includes(b.protocol)||!['native','json','chat'].includes(b.toolMode)||typeof b.model!=='string'||!b.model.trim()||b.model.length>200)throw new Error('识图模型设置无效。');endpoint(b,'models');}
        validateCachePolicy(b.cachePolicy??'auto',b.protocol??visionConfig.protocol??'openai');cacheTest.cancel('识图连接设置发生变化，测试已停止。');
        if(b.key){if(typeof b.key!=='string'||b.key.length>8192)throw new Error('密钥无效。');store.set('encryptedVisionKey',await protectSecret(b.key));visionKey=b.key;}else if(b.clearKey){store.set('encryptedVisionKey',null);visionKey='';}
        visionConfig={enabled:b.enabled,cachePolicy:b.cachePolicy??'auto',protocol:b.protocol??visionConfig.protocol??'openai',url:b.url??visionConfig.url??'',model:b.model??visionConfig.model??'',toolMode:b.toolMode??visionConfig.toolMode??'chat',apiVersion:b.apiVersion??'2023-06-01'};store.set('visionProvider',visionConfig);companion.chat.cancel();return json(res,200,{...visionConfig,hasKey:Boolean(visionKey)});
      }
      if(route==='/api/models'&&req.method==='POST'){const b=await body(req);const c={...config,...b,key:b.key||key};const models=await listModels(c);return json(res,200,{models});}
      if(route==='/api/probe'&&req.method==='POST'){
        if(mode==='companion'){const r=await companion.chat.callModel({system:'请用自然中文简短打招呼。',messages:[{role:'user',content:'你好。'}],tools:[]},undefined,{kind:'probe',role:selectedRole});return json(res,200,{passed:null,text:r.content,message:'聊天接口可用。'});}
        const result=await store.context.run(provider(),{system:'调用 game_action，参数 action=observe。仅检查格式，不执行任何游戏动作。',messages:[{role:'user',content:'观察游戏。'}],tools:config.toolMode==='chat'?[]:[gameTool]},undefined,{kind:'probe',role:selectedRole,world:session.world??'',mode:'legacy'});const passed=config.toolMode==='chat'?null:result.calls.length===1&&result.calls[0].name==='game_action'&&result.calls[0].arguments?.action==='observe';store.set(session.capabilityKey(),{passed,checked:new Date().toISOString()});emit(store.event('usage',{...result.usage,kind:'probe',source:'provider',endpointHash:store.context.get(selectedRole,result.requestId).meta.endpointHash,requestId:result.requestId,model:config.model,protocol:config.protocol},selectedRole,session.world??''));return json(res,200,{passed,text:result.content,message:passed===true?'模型动作格式检查通过。':passed===null?'聊天接口可用。':'动作检查未通过，请切换工具模式或模型。'});
      }
      if(route==='/api/roles'&&req.method==='POST'){const role=store.saveRole(await body(req));if(session.role?.id===role.id){session.cancel();session.role=role;if(session.engine)session.engine.role=role;}if(selectedRole===role.id)companion.chat.changeRole(role);return json(res,200,role);}
      if(route==='/api/roles/select'&&req.method==='POST'){const b=await body(req);if(!store.role(b.id))throw new Error('角色不存在。');selectedRole=b.id;store.set('selectedRole',selectedRole);session.leave();companion.chat.changeRole(store.role(selectedRole));sync();return json(res,200,{ok:true});}
      if(route==='/api/roles/import'&&req.method==='POST'){const b=await body(req);const result=importCard(Buffer.from(b.data??'','base64'));return json(res,200,{role:store.saveRole(result.role),warnings:result.warnings});}
      if(route==='/api/roles/export'){const role=store.role(url.searchParams.get('id')??selectedRole);if(!role)throw new Error('角色不存在。');res.setHeader('Content-Disposition','attachment; filename="together-role.json"');return json(res,200,exportCard(role));}
      if(route==='/api/skin'&&req.method==='POST'){
        const b=await body(req),role=store.role(b.id);if(!role)throw new Error('角色不存在。');const bytes=Buffer.from(b.data??'','base64');const dimensions=validateSkin(bytes);await fs.mkdir(path.join(directory,'skins'),{recursive:true});await fs.writeFile(path.join(directory,'skins',`${role.id}.png`),bytes);await fs.mkdir(path.join(managedGame,'CustomSkinLoader/LocalSkin/skins'),{recursive:true});await fs.writeFile(path.join(managedGame,'CustomSkinLoader/LocalSkin/skins',`${role.gameName}.png`),bytes);return json(res,200,{...dimensions,message:'皮肤已保存。重新进入世界后检查显示；若仍是旧皮肤，重启游戏清理内存缓存。'});
      }
      if(route==='/api/skin'){const role=store.role(url.searchParams.get('id'));if(!role)throw new Error('角色不存在。');try{const bytes=await fs.readFile(path.join(directory,'skins',`${role.id}.png`));res.writeHead(200,{'content-type':'image/png','cache-control':'no-store'});return res.end(bytes);}catch{return json(res,404,{error:'尚未上传皮肤。'});}}
      if(route==='/api/memories'&&req.method==='GET'){const role=url.searchParams.get('role')??selectedRole;return json(res,200,store.memories(role).map(m=>({...memoryEvidence(store,m),pinned:store.get('pinnedMemories:'+role,[]).includes(m.id)})));}
      if(route==='/api/memories'&&req.method==='POST'){const b=await body(req);if(b.role!==selectedRole)throw Error('请先选择这位伙伴。');const previous=b.id?store.memories(selectedRole).find(x=>x.id===b.id):null;if(b.id&&!previous)throw Error('记忆不存在。');if(!['','fact','experience','place','protection'].includes(b.kind??'fact'))throw new Error('家位置请在游戏中标记。');if(b.category!==undefined&&!['fact','preference','promise','topic'].includes(b.category))throw Error('记忆用途无效。');const id=store.memory(b.role,b.world??'',b.kind||'fact',b.text,'user',b.id,b.world?(previous?.dimension??companion.chat.observation?.dimension??''):'');store.set('memoryMeta:'+id,{...memoryMeta(store,id),category:b.category??memoryMeta(store,id).category});store.set('memoryEvidence:'+id,{source:'stated',original:b.text});return json(res,200,{id});}
      if(route==='/api/memories/delete'&&req.method==='POST'){const b=await body(req);if(!store.memories(selectedRole).some(m=>m.id===b.id))throw Error('记忆不存在。');store.deleteMemory(b.id);store.set('pinnedMemories:'+selectedRole,store.get('pinnedMemories:'+selectedRole,[]).filter(id=>id!==b.id));return json(res,200,{ok:true});}
      if(route==='/api/memories/export'){res.setHeader('Content-Disposition','attachment; filename="together-memories.json"');return json(res,200,{role:selectedRole,memories:store.memories(selectedRole)});}
      if(route==='/api/tasks')return json(res,200,session.world?store.tasks(selectedRole,session.world):[]);
      if(route==='/api/plans'&&req.method==='GET')return json(res,200,session.journal()?.list()??[]);
      if(['/api/plans/resume','/api/plans/pause','/api/plans/cancel'].includes(route)&&req.method==='POST'){
        const b=await body(req),journal=session.journal(),plan=journal?.get(b.id);
        if(session.status!=='connected'||!plan)throw new Error('请回到计划所属的角色、世界和维度。');
        if(['done','cancelled'].includes(plan.status))throw new Error('这项计划已经结束。');
        if(route.endsWith('/resume'))session.resumePlan(b.id).catch(e=>notice(e.message));
        else {if(session.planId===b.id)session.stop();journal.pause(b.id,route.endsWith('/cancel')?'你取消了这项计划。':'你暂停了这项计划。',route.endsWith('/cancel')?'cancelled':'paused');}
        return json(res,200,{ok:true});
      }
      if(route==='/api/household'&&req.method==='POST'){
        const b=await body(req);if(session.status!=='connected')throw new Error('请先进入世界。');
        if(typeof b.enabled!=='boolean')throw new Error('请明确开启或关闭分工。');
        session.cancel(true,'工作范围已调整，请重新检查后继续。');
        const result=b.enabled?session.engine.household.enable(b.radius):session.engine.household.disable();return json(res,200,result);
      }
      if(route==='/api/household/containers'&&req.method==='POST'){
        const b=await body(req);if(session.status!=='connected')throw new Error('请先进入世界。');
        session.cancel(true,'分类箱权限已调整。');
        if(b.remove){session.engine.household.remove(b.remove);return json(res,200,{ok:true});}
        return json(res,200,session.engine.household.register(b));
      }
      if(route==='/api/start'&&req.method==='POST'){if(mode==='companion')return json(res,200,{ok:true,message:'从原启动器进入已安装伙伴模组的单人世界，按 T 聊天，F8 管理回忆和打算。'});enabled=true;session.leave();await writeBridge();sync();notice('陪玩已开启，进入托管游戏世界后会自动加入。');return json(res,200,{ok:true});}
      if(route==='/api/stop'&&req.method==='POST'){if(mode==='companion')companion.chat.cancel();else session.stop();return json(res,200,{ok:true});}
      if(route==='/api/resume'&&req.method==='POST'){session.paused=false;session.failures=0;return json(res,200,{ok:true});}
      if(route==='/api/leave'&&req.method==='POST'){enabled=false;session.leave();companion.chat.detach();return json(res,200,{ok:true});}
      if(route==='/api/permissions'&&req.method==='POST'){const b=await body(req);if(!session.engine)throw new Error('角色尚未进入世界。');session.engine.permissions={modifyProtected:Boolean(b.modifyProtected),containers:Boolean(b.containers)};return json(res,200,{ok:true});}
      if(route==='/api/protect'&&req.method==='POST'){if(!session.engine)throw new Error('请先进入世界。');const s=session.engine.snapshot();store.memory(selectedRole,session.world,'protection',JSON.stringify({...s.position,dimension:s.dimension,radius:8}),'user');return json(res,200,{ok:true});}
      if(route==='/api/chat'&&req.method==='POST'){const b=await body(req);const target=mode==='companion'?companion.chat:session;if(mode==='companion'?!target.client:target.status!=='connected')throw new Error('请先进入世界。');target.receive(b.text,mode==='companion'?{mediaId:b.mediaId}:undefined).catch(e=>notice(e.message));return json(res,200,{ok:true});}
      if(route==='/api/action'&&req.method==='POST'){if(!session.engine||session.status!=='connected')throw new Error('请先进入世界。');const b=await body(req);session.cancel();session.separation=null;session.survivalGuard=!['wait','observe','inspect_recipe','set_home','set_meeting'].includes(b.action);if(['follow','home','meet'].includes(b.action)){session.engine.household.disable();session.paused=b.action!=='follow';}const result=await session.engine.run(b,{containerAllowed:session.engine.permissions.containers});return json(res,200,result);}
      if(route==='/api/prepare'&&req.method==='POST'){prepareEnvironment().catch(e=>notice(e.message));return json(res,200,{ok:true});}
      if(route==='/api/launch'&&req.method==='POST'){
        if(gameProcess)throw new Error('游戏已经启动。');let plan;try{plan=JSON.parse(await fs.readFile(path.join(runtime,'companion-launch-plan.json'),'utf8'));}catch{plan=await prepareEnvironment();}if(mode==='legacy')await writeBridge();await fs.mkdir(work,{recursive:true});const launchConfig=JSON.parse(await fs.readFile(path.join(root,'config/experiment.json'),'utf8'));gameProcess=launchClient(plan,launchConfig,path.join(work,'companion-client.log'));gameProcess.once('exit',()=>{gameProcess=null;bridgeState=null;session.leave();companion.chat.detach();notice('游戏已退出，陪玩连接已关闭。');});gameProcess.once('error',()=>{gameProcess=null;notice('游戏启动失败，请查看本地日志。');});enabled=mode==='legacy';return json(res,200,{ok:true});
      }
      if(route==='/api/practice'&&req.method==='POST'){if(session.world)throw new Error('请先在游戏中保存并退出当前世界，再创建练习场。');const result=await createPracticeWorld(managedGame);enabled=true;await writeBridge();return json(res,200,{name:result.name,message:'独立练习场已创建。在游戏的单人游戏列表中选择 TogetherPlay · 独立练习场，进入后自动开始。'});}
      if(route==='/api/practice/stop'&&req.method==='POST'){session.stop();return json(res,200,{ok:true});}
      if(route==='/api/practice/retry'&&req.method==='POST'){if(!session.world?.startsWith('practice:'))throw new Error('请先进入独立练习场。');session.stop();session.startPractice();return json(res,200,{ok:true});}
      const staticFiles={'/':'index.html','/app.js':'app.js','/memory-engine.js':'memory-engine.js','/cache-ui.js':'cache-ui.js','/personality.js':'personality.js','/journey.js':'journey.js','/plus.js':'plus.js','/storage.js':'storage.js','/voice.js':'voice.js','/help.html':'help.html','/context.js':'context.js','/orb-style.js':'orb-style.js','/orb-shape.js':'orb-shape.js','/orb-forms.json':'orb-forms.json','/orb-face.js':'orb-face.js','/orb-faces.json':'orb-faces.json','/orb-meshes.json':'orb-meshes.json','/orb-render.js':'orb-render.js','/style.css':'style.css'};
      if(req.method==='GET'&&/^\/help\/(desktop|connect|scan)\.png$/.test(route)){const bytes=await fs.readFile(path.join(publicDir,route.slice(1)));res.writeHead(200,{'content-type':'image/png'});return res.end(bytes);}
      if(req.method==='GET'&&staticFiles[route]){const bytes=await fs.readFile(path.join(publicDir,staticFiles[route]));res.writeHead(200,{'content-type':route.endsWith('.json')?'application/json; charset=utf-8':route.endsWith('.js')?'text/javascript; charset=utf-8':route.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','cache-control':'no-cache'});return res.end(bytes);}
      return json(res,404,{error:'未找到该页面或操作。'});
    }catch(e){if(!res.headersSent)json(res,e.status===409?409:400,{error:e.message});else res.end();}finally{activeRequests--;}
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(e){await cacheTest?.close();session.close();await companion.close();store.close();throw e;}
  const guard=setInterval(()=>{if(maintenance)return;companion.chat.tick();for(const res of clients)res.write(': keepalive\n\n');if(session.active&&lastBridge&&Date.now()-lastBridge>12000){session.leave();bridgeState=null;notice('世界连接心跳中断，已停止陪玩。');}},4000);guard.unref();
  const url=`http://127.0.0.1:${server.address().port}`;
  if(open)spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'}).unref();
  const close=async()=>{if(closing)return;closing=true;clearInterval(guard);enabled=false;await cacheTest?.close();session.close();await companion.close();for(const r of clients)r.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await store.context.drain();store.close();};
  return {server,get store(){return store;},get session(){return session;},get companion(){return companion;},close,url};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try {
    const storage=await prepareDataDirectory({root});
    const localSettings=await fs.readFile(path.join(storage.directory,'connection.json'),'utf8').then(JSON.parse).catch(()=>({}));
    const port=Number(process.env.TOGETHER_PORT??localSettings.port??38885),url=`http://127.0.0.1:${port}`,directory=storage.directory;
    const existing=await health(port);
    if(existing){console.log('服务已经启动：'+url);if(process.argv.includes('--open'))spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'}).unref();}
    else {
      let release;
      try{release=await acquireService(directory,port);}catch(e){console.error(e.message);process.exit(1);}
      createApp({port,directory,storage,open:process.argv.includes('--open')}).then(app=>{app.server.once('close',()=>release());console.log(`TogetherPlayMC 控制台：${app.url}`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>process.exit()));}).catch(async e=>{
        await release();
        if(e.code==='EADDRINUSE'){try{const existing=await fetch(url+'/api/state',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());if(existing.app==='TogetherPlayMC'){console.log(`控制台已经启动：${url}`);if(process.argv.includes('--open'))spawn('explorer.exe',[url],{windowsHide:true,stdio:'ignore'}).unref();return;}}catch{}}
        console.error(e.code==='EADDRINUSE'?'端口被其他程序占用，请设置 TOGETHER_PORT 后重新启动。':e.message);process.exitCode=1;
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode=1;
  }
}
