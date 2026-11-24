import {setupCacheUI} from '/cache-ui.js';
import {setupMemoryEngine} from '/memory-engine.js';
import {setupStorage} from '/storage.js';
import {setupPersonality} from '/personality.js';
import {setupJourney} from "/journey.js";
import {setupPlus} from "/plus.js";
import {setupVoice} from "/voice.js";
const $=id=>document.getElementById(id);let state,roleId,editingMemory=null,toastTimer,modelOptions=[],modelActiveIndex=-1;const pageTitles={journal:'把回忆留在这里。',goals:'慢慢把约定做完。',play:'今天，也一起玩吧。',roles:'认识你的伙伴。',provider:'给伙伴接上灵感。',memory:'记得我们一起走过。',activity:'看看这一路发生了什么。',plans:'慢慢把约定做完。'};
function toast(message,error=false){$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,9000);}
async function api(url,data){const res=await fetch(url,{method:data===undefined?'GET':'POST',headers:{'x-together-token':state?.csrf??'',...(data===undefined?{}:{'content-type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});const result=await res.json();if(!res.ok)throw new Error(result.error??'操作失败');return result;}
function run(fn){return async e=>{e?.preventDefault();const target=e?.currentTarget,button=target?.tagName==='BUTTON'?target:null;if(button)button.disabled=true;try{await fn(e);}catch(err){toast(err.message,true);}finally{if(button)button.disabled=false;}};}
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function download(url){const a=document.createElement('a');a.href=url;a.download='';a.click();}
async function base64(file){if(!file)throw new Error('请选择文件。');if(file.size>8_000_000)throw new Error('文件最大 8 MB。');const bytes=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
const journeyUI=setupJourney({getState:()=>state,api,toast,run,refresh});
const personalityUI=setupPersonality();
setupMemoryEngine({api,run,toast,getState:()=>state});
const plusUI=setupPlus({getState:()=>state,api,toast,run,refresh});Object.assign(pageTitles,{connect:'从这里连上你的世界。',usage:'让每次接话都值得。',archive:'把以前的话找回来。',places:'记得回家的路。'});
const cacheUI=setupCacheUI({api,run,toast,getState:()=>state,onFinished:()=>plusUI.load('usage')});
const storageUI=setupStorage({api,run,toast,getState:()=>state});pageTitles.storage='把共同经历好好留住。';
setupVoice({api,toast,run});pageTitles.voice='让声音也陪在身边。';
const contextUI=setupContext({getState:()=>state,api,toast,run});pageTitles.context='看清每一次对话。';
document.querySelector('main').append(document.querySelector('footer'));
organizeNavigation();setupModelPicker();
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>window.scrollTo({top:0})));
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{const group=b.closest('.nav-group');if(group)group.open=true;document.querySelectorAll('[data-page]').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===`page-${b.dataset.page}`));$('page-title').textContent=pageTitles[b.dataset.page];if(b.dataset.page==='memory')loadMemories().catch(e=>toast(e.message,true));});
function providerInput(){return {protocol:$('protocol').value,url:$('provider-url').value.trim(),key:$('provider-key').value,model:$('model').value.trim(),toolMode:$('tool-mode').value,hourlyLimit:Number($('hour-limit').value),apiVersion:$('api-version').value.trim(),cachePolicy:$('cache-policy').value,clearKey:$('clear-key').checked};}
function modelLabel(model){return model.name&&model.name!==model.id?`${model.name} · ${model.id}`:model.id;}
function visibleModels(){const query=$('model').value.trim().toLowerCase(),filtered=modelOptions.filter(m=>!query||modelLabel(m).toLowerCase().includes(query));return [...filtered.filter(m=>m.chat),...filtered.filter(m=>!m.chat)];}
function closeModelMenu(){const menu=$('model-menu');if(!menu)return;menu.hidden=true;$('model').setAttribute('aria-expanded','false');modelActiveIndex=-1;}
function chooseModel(model){$('model').value=model.id;closeModelMenu();$('model').focus();}
function renderModelMenu(){
 const menu=$('model-menu'),results=$('model-results'),count=$('model-menu-count');if(!menu||!results)return;const all=visibleModels(),chat=all.filter(m=>m.chat),other=all.filter(m=>!m.chat);count.textContent=modelOptions.length?`显示 ${all.length} / ${modelOptions.length} · 聊天可用 ${chat.length}`:'先点击“拉取模型”';results.replaceChildren();
 const addGroup=(title,items,offset)=>{if(!items.length)return;const heading=element('div',title,'model-group-title');results.append(heading);items.forEach((model,index)=>{const b=element('button',undefined,'model-option');b.type='button';b.id='model-option-'+(offset+index);b.dataset.index=String(offset+index);b.dataset.modelId=model.id;b.setAttribute('role','option');b.setAttribute('aria-label',modelLabel(model));b.append(element('strong',model.name||model.id),element('small',model.id+(model.chat?' · 可聊天':' · 不确定是否支持聊天')));b.onclick=()=>chooseModel(model);results.append(b);});};
 addGroup('聊天可用',chat,0);addGroup('其他返回项',other,chat.length);if(!all.length)results.append(element('p',modelOptions.length?'没有匹配的模型。可以继续手填模型 ID。':'拉取模型后会显示在这里，也可以直接手填模型 ID。','model-empty'));modelActiveIndex=-1;
}
function openModelMenu(){const menu=$('model-menu');if(!menu)return;menu.hidden=false;$('model').setAttribute('aria-expanded','true');renderModelMenu();}
function moveModelSelection(direction){const list=visibleModels();if(!list.length)return;modelActiveIndex=(modelActiveIndex+direction+list.length)%list.length;const active=list[modelActiveIndex];$('model').setAttribute('aria-activedescendant','model-option-'+modelActiveIndex);document.querySelectorAll('.model-option').forEach(b=>b.classList.toggle('active',b.dataset.modelId===active.id));document.getElementById('model-option-'+modelActiveIndex)?.scrollIntoView({block:'nearest'});}
function setupModelPicker(){const input=$('model'),menu=$('model-menu');if(!input||!menu)return;input.addEventListener('focus',openModelMenu);input.addEventListener('input',()=>{openModelMenu();renderModelMenu();});input.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();moveModelSelection(1);}else if(event.key==='ArrowUp'){event.preventDefault();moveModelSelection(-1);}else if(event.key==='Enter'&&modelActiveIndex>=0){event.preventDefault();const list=visibleModels();if(list[modelActiveIndex])chooseModel(list[modelActiveIndex]);}else if(event.key==='Escape'){closeModelMenu();}});document.addEventListener('click',event=>{if(!event.target.closest('.model-picker'))closeModelMenu();});}
function organizeNavigation(){const nav=document.querySelector('nav');if(!nav)return;const groups={home:nav.querySelector('[data-nav-group="home"] .nav-group-items'),companion:nav.querySelector('[data-nav-group="companion"] .nav-group-items'),journey:nav.querySelector('[data-nav-group="journey"] .nav-group-items'),settings:nav.querySelector('[data-nav-group="settings"] .nav-group-items')};const map={play:'home',roles:'companion',plans:'journey',memory:'journey',activity:'journey',journal:'journey',goals:'journey',archive:'journey',places:'journey',provider:'settings',connect:'settings',usage:'settings',voice:'settings',context:'settings',storage:'settings'};for(const button of [...nav.querySelectorAll('button[data-page]')]){const group=groups[map[button.dataset.page]??'settings'];if(group)group.append(button);}}
function fillProvider(){const p=state.provider;$('protocol').value=p.protocol;$('provider-url').value=p.url;$('model').value=p.model;$('tool-mode').value=p.toolMode;$('hour-limit').value=p.hourlyLimit;$('api-version').value=p.apiVersion??'2023-06-01';$('cache-policy').value=p.cachePolicy??'auto';$('provider-key').placeholder=p.hasKey?'已加密保存；留空保留原密钥':'填写 API Key';}
$('provider-form').onsubmit=run(async()=>{await api('/api/provider',providerInput());$('provider-key').value='';$('clear-key').checked=false;
await refresh();fillProvider();toast('连接设置已保存。');});
$('models').onclick=run(async()=>{const result=await api('/api/models',providerInput());modelOptions=result.models;renderModelMenu();const chatCount=modelOptions.filter(x=>x.chat).length;$('models-info').textContent=modelOptions.length?`已拉取 ${modelOptions.length} 个模型，其中 ${chatCount} 个标记为聊天可用；点击模型框可搜索和滚动选择。`:'接口成功返回空列表，可手动填写模型 ID。';openModelMenu();});
$('probe').onclick=run(async()=>{await api('/api/provider',providerInput());$('provider-key').value='';const result=await api('/api/probe',{});$('capability').textContent=result.message;toast(result.message,result.passed===false);await refresh();});
function renderRoles(){const list=$('role-list');list.replaceChildren(...state.roles.map(r=>{const b=element('button',r.name,'role-card');b.classList.toggle('selected',r.id===roleId);b.append(element('small',r.id===state.selectedRole?'当前陪玩伙伴':'点击编辑'));b.onclick=()=>{roleId=r.id;renderRoles();fillRole();};return b;}));}
function fillRole(){const r=state.roles.find(r=>r.id===roleId);if(!r)return;$('role-id').value=r.id;for(const k of ['name','persona','relationship','style','examples','greeting','autonomy','chatter','radius','followDistance'])$(`role-${k}`).value=r[k]??(k==='followDistance'?3:'');$('book-info').textContent=`角色卡知识条目 ${(r.book??[]).length} 条；扩展资料保存在导出文件中，脚本不执行。`;fillAppearance(r);personalityUI.fill(r);loadSkin();}
function loadSkin(){const canvas=$('skin-canvas'),ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#d1ddc3';ctx.fillRect(0,0,128,128);ctx.fillStyle='#a5b99a';ctx.fillRect(32,32,64,64);$('skin-label').textContent='默认皮肤';const img=new Image();const id=roleId;img.onload=()=>{if(roleId!==id)return;ctx.clearRect(0,0,128,128);ctx.drawImage(img,8,8,8,8,16,16,96,96);ctx.drawImage(img,40,8,8,8,16,16,96,96);$('skin-label').textContent='已上传本地皮肤';};img.src=`/api/skin?id=${encodeURIComponent(roleId)}&t=${Date.now()}`;}
$('role-form').onsubmit=run(async()=>{const r={id:roleId};for(const k of ['name','persona','relationship','style','examples','greeting','autonomy','chatter'])r[k]=$(`role-${k}`).value;r.radius=Number($('role-radius').value);r.followDistance=Number($('role-followDistance').value);r.appearance={mode:$('orb-mode').value,color:$('orb-color').value,color2:$('orb-color2').value,...journeyUI.appearance()};r.personality=personalityUI.read();await api('/api/roles',r);await refresh();renderRoles();toast('角色已保存。');});
$('new-role').onclick=run(async()=>{const r=await api('/api/roles',{name:'新的伙伴'});roleId=r.id;await refresh();renderRoles();fillRole();});
$('choose-role').onclick=run(async()=>{await api('/api/roles/select',{id:roleId});await refresh();renderRoles();toast('已选择这个伙伴，开启陪玩后会使用他。');});
$('export-role').onclick=()=>download(`/api/roles/export?id=${encodeURIComponent(roleId)}`);
$('import-card').onchange=run(async e=>{const result=await api('/api/roles/import',{data:await base64(e.target.files[0])});roleId=result.role.id;await refresh();renderRoles();fillRole();toast(['角色卡已导入。',...result.warnings].join(' '));e.target.value='';});
$('skin-file').onchange=run(async e=>{const result=await api('/api/skin',{id:roleId,data:await base64(e.target.files[0])});loadSkin();toast(result.message);e.target.value='';});
for(const [id,url,message]of [['launch','/api/launch','游戏正在启动。进入单人世界后，伙伴会自动加入。'],['start','/api/start','已开启陪玩，等待世界连接。'],['pause','/api/stop','已经停下。'],['resume','/api/resume','已恢复自主陪玩。'],['leave','/api/leave','伙伴已下线。'],['prepare','/api/prepare','正在准备环境，可在旅途记录查看进度。'],['protect','/api/protect','已保护当前位置周围 8 格。'],['practice-stop','/api/practice/stop','练习已停止。'],['practice-retry','/api/practice/retry','已重新开始独立练习。']])$(id).onclick=run(async()=>{const result=await api(url,{});toast(result.message??message);await refresh();});
$('practice').onclick=run(async()=>{const r=await api('/api/practice',{});toast(r.message);});
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=run(async()=>{const r=await api('/api/action',{action:b.dataset.action});toast(r.ok?'动作已执行。':r.error,!r.ok);await refresh();}));
for(const id of ['permit-build','permit-chest'])$(id).onchange=run(async()=>{await api('/api/permissions',{modifyProtected:$('permit-build').checked,containers:$('permit-chest').checked});toast('本次连接的权限已更新。');});
$('chat-form').onsubmit=run(async()=>{const text=$('chat-input').value.trim();if(!text)return;if(state.mode==='companion')await journeyUI.send(text);else await api('/api/chat',{text});$('chat-input').value='';});
const memoryLabels={fact:'偏好 / 事实',experience:'共同经历',place:'地点备注',home:'家',meeting:'会合点',protection:'保护区'};
async function loadMemories(){
 const list=await api(`/api/memories?role=${encodeURIComponent(state.selectedRole)}`),filter=$('memory-filter').value;
 const labels={fact:'事实',preference:'偏好',promise:'我们的约定',topic:'下次接着聊'};
 const visible=list.filter(m=>filter==='all'||filter==='pending'?filter==='all'||m.continuity.status==='pending':filter==='open'?m.continuity.status==='active'&&!m.continuity.resolved&&['promise','topic'].includes(m.continuity.category):m.continuity.status!=='superseded');
 $('memory-list').replaceChildren(...visible.map(m=>{
  const card=element('article',undefined,'memory-card'),meta=m.continuity;
  card.append(element('small',`${m.world?'当前存档记录':'长期记忆'} · ${labels[meta.category]??'事实'} · ${m.evidenceLabel}${meta.resolved?' · 已结束':''}`),element('p',m.text));
  if(meta.status==='pending')card.append(element('strong','待确认修正：确认前仍使用旧记忆。'),element('p','原记忆：'+(meta.baseText??''),'muted'));
  if(meta.status==='superseded')card.append(element('small','已有更新，这条旧记忆不再进入当前对话。'));
  if(m.quote)card.append(element('small','记录依据：'+m.quote));
  const buttons=element('div',undefined,'buttons');
  const button=(title,action)=>{const b=element('button',title);b.onclick=run(action);buttons.append(b);};
  if(meta.status!=='superseded'&&(m.source!=='user'||meta.status==='pending'))button(meta.status==='pending'?'确认替换旧记忆':'确认这条记忆',async()=>{await api('/api/plus/memory-confirm',{id:m.id});await loadMemories();});
  if(['fact','experience','place'].includes(m.kind))button('编辑',async()=>{editingMemory=m;$('memory-id').value=m.id;$('memory-scope').value=m.world?'world':'global';$('memory-kind').value=m.kind;$('memory-category').value=meta.category;$('memory-text').value=m.text;$('memory-text').focus();});
  if(meta.status==='active')button(m.pinned?'取消固定':'固定这条记忆',async()=>{await api('/api/plus/memory-pin',{id:m.id,pinned:!m.pinned});await loadMemories();});
  if(meta.status==='active'&&['promise','topic'].includes(meta.category))button(meta.resolved?'重新接续':'标记已结束',async()=>{await api('/api/plus/memory-resolve',{id:m.id,resolved:!meta.resolved});await loadMemories();});
  button(meta.status==='pending'?'不采用这次修正':'删除',async()=>{if(!confirm('删除这条记忆？'))return;await api('/api/memories/delete',{id:m.id});await loadMemories();});
  card.append(buttons);
  if(m.revisions?.length){const details=element('details');details.append(element('summary','修改历史（'+m.revisions.length+'）'));m.revisions.forEach((r,index)=>{const item=element('div',undefined,'memory-revision');item.append(element('small',new Date(r.changed).toLocaleString()),element('p',r.text));const restore=element('button','恢复这段文字');restore.onclick=run(async()=>{if(!confirm('恢复到这段文字？当前文字也会保留在修改历史。'))return;await api('/api/plus/memory-revision',{id:m.id,index});await loadMemories();});item.append(restore);details.append(item);});card.append(details);}
  return card;
 }));
 if(!visible.length)$('memory-list').append(element('p','这里暂时没有记录。','empty'));
}
$('memory-filter').onchange=run(loadMemories);
$('memory-form').onsubmit=run(async()=>{const world=$('memory-scope').value==='world'?(editingMemory?.world||state.session.world):'';if(world===undefined)throw new Error('请先进入一个世界，再添加存档记忆。');await api('/api/memories',{id:$('memory-id').value||undefined,role:state.selectedRole,world,kind:$('memory-kind').value,category:$('memory-category').value,text:$('memory-text').value});$('memory-form').reset();editingMemory=null;await loadMemories();toast('记忆已保存。');});
$('memory-clear').onclick=()=>{$('memory-form').reset();editingMemory=null;};$('export-memory').onclick=()=>download('/api/memories/export');
const types={notice:'提示',error:'遇到问题',owner_chat:'你说',reply:'伙伴说',action_start:'开始行动',action_result:'行动结果',joined:'加入世界',disconnected:'离开世界',death:'角色死亡',recovery:'取回物品',usage:'模型用量',capability:'能力检查',practice:'练习记录'};
function renderEvents(){const events=state.events;$('event-list').replaceChildren(...events.slice().reverse().map(e=>{const div=element('div',undefined,`event ${e.type}`);div.append(element('time',new Date(e.time).toLocaleTimeString()),element('strong',types[e.type]??e.type));const text=e.data.text??e.data.message??JSON.stringify(e.data);div.append(element('div',text));return div;}));const chat=state.conversation??events.filter(e=>['reply','owner_chat'].includes(e.type)&&e.role===state.selectedRole);if(!chat.length)$('chat-log').replaceChildren(element('p','进入单人世界后，在这里或按 T 和伙伴说话。','empty'));if(chat.length){$('chat-log').replaceChildren(...chat.slice(-40).map(e=>{const d=element('div',undefined,'chat-row');d.append(element('b',e.type==='owner_chat'?'你':state.roles.find(r=>r.id===e.role)?.name??'伙伴'),document.createTextNode(e.data.text??''));if(e.data.sources?.length){const details=element('details'),summary=element('summary','资料来源');details.append(summary);for(const source of e.data.sources)details.append(element('p',`${source.title} · ${source.source}`,'small'));d.append(details);}if(e.type==='reply'&&e.data.requestId){const b=element('button','查看这次上下文','chat-context-link');b.onclick=run(()=>contextUI.open(e.data.requestId));d.append(b);}return d;}));$('chat-log').scrollTop=$('chat-log').scrollHeight;}}
const actionLabels={idle:'休息中',observe:'观察周围',follow:'跟着你',wait:'等待安排',goto:'赶路中',home:'正在回家',meet:'前往会合点',set_home:'记下家的位置',set_meeting:'记下会合点',inspect_recipe:'查看配方',organize:'整理背包',collect:'采集材料',craft:'制作物品',smelt:'烧制材料',equip:'更换装备',eat:'吃点东西',give:'递交物品',chest:'整理容器',farm:'照料农田',build:'建造中',explore:'探索周围',fight:'正在防卫',retreat:'正在撤退',recover:'寻找遗失物',surface:'上浮换气',retrieve:'水下取物',prepare_tools:'准备工具',fell_tree:'采伐树木',mine:'开挖通道',cleanup:'清理垫脚'};
const vital=n=>Number.isFinite(n)?Math.round(n*10)/10:'—';
function renderState(){const s=state.session,g=s.game;const statuses={idle:'等待进入世界',connecting:'正在加入',connected:s.paused?'已停下，等你安排':'正在陪玩',disconnected:'连接已断开'};$('status').textContent=statuses[s.status]??s.status;$('status').classList.toggle('connected',s.status==='connected');$('current-role').textContent=state.roles.find(r=>r.id===state.selectedRole)?.name??'尚未选择';$('current-world').textContent=state.bridge?.worldName??'等待进入';$('current-action').textContent=actionLabels[g?.action]??'休息中';$('vitals').textContent=g?`${vital(g.health)} / ${vital(g.food)} / ${vital(g.oxygen)}`:'— / — / —';$('survival-status').textContent=g?`${g.survival?.message??'保命反应已就绪'}。叫停后仍会先上浮换气；未完成任务需要你重新安排。`:'保命反应在入场后启用。叫停任务时，落水仍会先上浮换气。';const usage=state.usage??{};$('usage-requests').textContent=`${usage.reported??0} / ${usage.requests??0}`;$('usage-input').textContent=Number(usage.input??0).toLocaleString();$('usage-output').textContent=Number(usage.output??0).toLocaleString();$('usage-cache').textContent=usage.cacheReadReported?Number(usage.cacheRead??usage.cached??0).toLocaleString():'未报告';$('launch').disabled=state.gameRunning||state.preparing;$('setup-hint').textContent=state.preparing?'正在准备游戏依赖，请查看旅途记录。':state.provider.model?'进入托管环境的单人世界即可；原整合包存档保持独立。':'首次使用先去「连接模型」，再到「我的伙伴」选好角色。';if(state.capability)$('capability').textContent=state.capability.passed===true?'模型动作格式检查通过。':state.capability.passed===false?'模型未通过动作检查，请切换工具模式或模型。':'聊天接口可用。';if(s.practice)$('practice-status').textContent=`练习 ${s.practice.status} · ${s.practice.calls}/30 次请求 · ${Object.entries(s.practice.results).map(([k,v])=>`${k}: ${v}`).join('，')}`;}
let plansKey='',storageKey='',nearbyKey='',profileKey='';
const planStatuses={running:'正在做',paused:'暂时放下',interrupted:'等待重新接续',blocked:'需要调整',done:'步骤已完成',cancelled:'已取消'};
const categoryLabels={building:'建材',food:'食物',seeds:'种子',minerals:'矿物'};
function renderPlans(){
  const s=state.session,plans=s.plans??[],house=s.household;
  $('plans-context').textContent=s.world?`${state.bridge?.worldName??'当前世界'} · ${s.game?.dimension??''} · 计划与物资安排按角色、存档和维度分别保存。`:'进入世界后，可以查看和接续这个世界的计划。';
  const pk=JSON.stringify(plans);
  if(pk!==plansKey){plansKey=pk;$('plan-list').replaceChildren(...plans.map(p=>{
    const card=element('div',undefined,'plan-card'),head=element('div',undefined,'section-head');
    head.append(element('strong',p.request),element('span',planStatuses[p.status]??p.status,`pill plan-${p.status}`));card.append(head);
    if(p.reason)card.append(element('p',p.reason,'small'));
    const steps=element('ol');for(const step of p.steps){const target=step.expected?.count;steps.append(element('li',`${step.status==='done'?'✓ ':''}${step.title}${target?` · ${Math.min(step.progress,target)}/${target}`:''}`,step.status==='done'?'step-done':''));}card.append(steps);
    if(!p.steps.length)card.append(element('p','还没有形成步骤；继续后会先检查现状并安排。','muted'));
    if(!['done','cancelled'].includes(p.status)){
      const buttons=element('div',undefined,'buttons');
      for(const [verb,label] of p.status==='running'?[['pause','先停下'],['cancel','取消计划']]:[['resume','接着做'],['cancel','取消计划']]){
        const b=element('button',label);b.onclick=run(async()=>{await api(`/api/plans/${verb}`,{id:p.id});await refresh();toast(verb==='resume'?'已接续计划，会先检查当前情况。':verb==='pause'?'进度已保存。':'这项计划已取消。');});buttons.append(b);
      }card.append(buttons);
    }
    return card;
  }));if(!plans.length)$('plan-list').append(element('p','还没有计划。在聊天里说说你想一起完成的事吧。','empty'));}
  const area=house?.area;
  $('work-status').textContent=house?.enabled?`工作区已开启 · 中心 ${area.x}, ${area.y}, ${area.z} · 半径 ${area.radius} 格`:'工作区未开启。划定范围后，再告诉他这次要做什么。';
  const sk=JSON.stringify(house?.containers??[]);
  if(sk!==storageKey){storageKey=sk;$('storage-list').replaceChildren(...(house?.containers??[]).map(c=>{const row=element('div',undefined,'storage-row');row.append(element('span',`${c.name} · ${categoryLabels[c.category]} · ${c.x}, ${c.y}, ${c.z}`));const remove=element('button','撤销');remove.onclick=run(async()=>{await api('/api/household/containers',{remove:c.id});await refresh();toast('已撤销这个分类箱的使用权限。');});row.append(remove);return row;}));}
  const nearby=(s.game?.nearby??[]).filter(b=>['chest','trapped_chest','barrel'].includes(b.name)&&s.game?.position&&Math.hypot(b.x-s.game.position.x,b.y-s.game.position.y,b.z-s.game.position.z)<=6),nk=JSON.stringify(nearby);
  if(nk!==nearbyKey){nearbyKey=nk;const select=$('storage-position'),previous=select.value;select.replaceChildren();const blank=element('option',nearby.length?'选择附近容器':'让伙伴走近箱子或木桶');blank.value='';select.append(blank);for(const b of nearby){const option=element('option',`${b.name==='barrel'?'木桶':'箱子'} · ${b.x}, ${b.y}, ${b.z}`);option.value=JSON.stringify({x:b.x,y:b.y,z:b.z});select.append(option);}if([...select.options].some(o=>o.value===previous))select.value=previous;}
  const features=state.profile?.capabilities??[],fk=JSON.stringify(features);
  if(fk!==profileKey){profileKey=fk;$('capability-list').replaceChildren(...features.map(f=>{const row=element('div',undefined,'capability-row');const title=element('div');title.append(element('strong',f.name),element('span',f.status,'pill'));row.append(title,element('p',f.note,'muted'));return row;}));}
}
$('work-form').onsubmit=run(async()=>{await api('/api/household',{enabled:true,radius:Number($('work-radius').value)});await refresh();toast('工作区已划好，现在可以交代分工。');});
$('work-disable').onclick=run(async()=>{await api('/api/household',{enabled:false});await refresh();toast('已结束分工，原任务进度保留。');});
$('storage-form').onsubmit=run(async()=>{if(!$('storage-position').value)throw new Error('请先选择附近容器。');await api('/api/household/containers',{...JSON.parse($('storage-position').value),name:$('storage-name').value,category:$('storage-category').value});$('storage-name').value='';await refresh();toast('已记住这个分类箱，允许查看和存入。');});
async function refresh(){state=await api('/api/state');roleId??=state.selectedRole;renderState();renderEvents();renderRoles();renderPlans();renderCompanion();journeyUI.render();contextUI.render();plusUI.render();cacheUI.render();}

function fillAppearance(role){const a=role.appearance??{mode:'solid',color:'#88C9B0',color2:'#F3D69B'};$('orb-mode').value=a.mode;$('orb-color').value=a.color;$('orb-color2').value=a.color2;journeyUI.fillAppearance(role);}
for(const id of ['survival-status','practice-status','pause'])$(id)?.closest('article')?.classList.add('legacy-only');
$('survival-status').classList.add('legacy-only');
for(const id of ['role-autonomy','role-radius','skin-file'])$(id).closest('label')?.classList.add('legacy-only');
document.querySelector('.skin-preview').classList.add('legacy-only');
document.querySelector('.role-top .grow > p').classList.add('legacy-only');
document.querySelector('[data-page="plans"]').classList.add('legacy-only');
let companionProfilesKey='';
function renderCompanion(){
  const companion=state.mode==='companion';document.body.classList.toggle('companion-mode',companion);$('play-mode').value=state.mode;
  renderDraft();if(!companion)return;
  const role=state.roles.find(r=>r.id===state.selectedRole),a=role?.appearance??{mode:'solid',color:'#88C9B0',color2:'#F3D69B'};
  $('hero-orb').style.background=a.mode==='gradient'?'linear-gradient('+a.color+', '+a.color2+')':a.color;
  $('current-action').textContent=state.session.generation==='thinking'?(state.session.generationLabel||'正在想怎么回答你'):'在你身边';
  $('vitals').previousElementSibling.textContent='你的生命 / 饱食';$('vitals').textContent=state.session.game?`${vital(state.session.game.health)} / ${vital(state.session.game.food)}`:'— / —';
  $('companion-generation').textContent=state.session.generation==='thinking'?'正在回复，游戏可以继续。':state.session.status==='connected'?'私人连接已就绪，按 T 聊天，F8 管理伙伴。':'等待进入单人世界；球体在服务离线时仍可跟随。';
  $('setup-hint').textContent=state.provider.model?'选好下方环境并安装模组，以后照常打开游戏。':'先到「连接模型」保存接口，再安装下方的伙伴模组。';
  $('toggle-proactive').textContent=role?.chatter==='quiet'?'开启主动说话':'关闭主动说话';
  const data=state.companion??{},key=JSON.stringify(data);if(key===companionProfilesKey)return;companionProfilesKey=key;
  $('companion-profiles').replaceChildren(...(data.profiles??[]).map(profile=>{
    const card=element('div',undefined,'profile-card'),knowledge=(data.knowledge??[]).find(k=>k.id===profile.id);card.append(element('h4',profile.name),element('p',(profile.loader==='forge'?'Forge':'Fabric')+' · '+(profile.version??'1.20.1'),'small'));
    const statuses={indexing:'正在整理',ready:'基础资料已就绪',cancelled:'已暂停整理',error:'整理遇到问题'};
    card.append(element('p',knowledge?(statuses[knowledge.status]??knowledge.status)+' · '+knowledge.progress+'% · '+knowledge.documents+' 条资料':'首次安装后建立资料库','small'));
    if(knowledge)card.append(element('p','实际配方：'+({ready:'已同步',indexing:'同步中',waiting:'进入世界后读取'}[knowledge.runtime]??knowledge.runtime),'small'));
    const buttons=element('div',undefined,'buttons');for(const [label,url] of [['安装 / 更新','/api/companion/install'],['重新整理','/api/companion/reindex'],['暂停整理','/api/companion/cancel-index']]){const button=element('button',label);button.onclick=run(async()=>{const result=await api(url,{profileId:profile.id});toast(result.backup?'已安装，备份位于 '+result.backup:'资料任务已更新。');await refresh();});buttons.append(button);}card.append(buttons);
    const detail=element('details');detail.append(element('summary','覆盖情况与资料来源'));
    if(knowledge){detail.append(element('p',knowledge.coverage??'正在读取本地资料。','small'));if(knowledge.overview)detail.append(element('p',knowledge.overview,'small'));if(knowledge.error)detail.append(element('p',knowledge.error,'small'));for(const warning of knowledge.warnings??[])detail.append(element('p',warning,'small'));for(const source of knowledge.roots??[])detail.append(element('p',source,'source-url'));}
    const sources=element('textarea');sources.rows=3;sources.placeholder='可补充官方手册网址，每行一个 HTTPS 地址';sources.value=(profile.sources??[]).join('\n');const save=element('button','保存补充来源');save.onclick=run(async()=>{await api('/api/companion/sources',{profileId:profile.id,sources:sources.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)});toast('资料来源已保存。');});detail.append(sources,save);card.append(detail);return card;
  }));
}
function renderDraft(){const session=state?.session??{};$('reply-draft').hidden=state?.mode!=='companion'||session.generation!=='thinking';$('reply-progress').textContent=session.generationLabel||'正在想怎么回答你…';$('reply-draft-text').textContent=session.replyDraft||'';}
$('play-mode').onchange=run(async()=>{await api('/api/companion/mode',{mode:$('play-mode').value});await refresh();toast(state.mode==='legacy'?'已切换旧版操作模式，重新准备环境并重启游戏后使用。':'已切换球体伙伴模式。');});
$('cancel-reply').onclick=run(async()=>{await api('/api/stop',{});await refresh();});
$('toggle-proactive').onclick=run(async()=>{const role=state.roles.find(r=>r.id===state.selectedRole);await api('/api/roles',{id:role.id,chatter:role.chatter==='quiet'?'natural':'quiet'});await refresh();});
await refresh();fillProvider();renderRoles();fillRole();const stream=new EventSource('/api/events');let refreshTimer;stream.addEventListener('update',event=>{const e=JSON.parse(event.data);if(e.type==='companion_progress'&&state?.selectedRole===e.role&&state.session.world===e.world){state.session.replyDraft=e.data.text;state.session.generationLabel=e.data.label;state.session.generation=e.data.label?'thinking':'idle';renderDraft();return;}clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh().catch(()=>{}),150);});stream.onerror=()=>{$('status').textContent='控制台连接中断，正在重连';};setInterval(()=>refresh().catch(()=>{}),4000);

function setupContext({getState,api,run,toast}){
 const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const names={chat:'你主动聊天',vision:'截图提问',proactive:'伙伴主动说话',journal:'整理日记',summary:'整理聊天要点','cache-test':'缓存验证',overview:'整合包概览',probe:'接口检查',legacy:'旧版操作模式',historical:'旧请求 · 仅用量',preview:'此刻预览 · 尚未发送'};
 const statuses={running:'正在请求',completed:'已返回',failed:'失败',cancelled:'已取消',interrupted:'服务中断',preview:'未发送'};
 const num=n=>n==null?'未报告':Number(n).toLocaleString('zh-CN');
 const time=t=>new Date(t).toLocaleString('zh-CN',{hour12:false});
 const nav=el('button','◎　透明上下文');nav.dataset.page='context';document.querySelector('nav').append(nav);
 document.querySelector('footer').insertAdjacentHTML('beforebegin',`<section id="page-context" class="page">
 <div class="section-head"><div><p class="eyebrow">WHAT HE BRINGS INTO A CONVERSATION</p><h2>每一次对话，都能看清来处。</h2><p class="muted">展开人设、记忆、游戏状态、聊天记录和资料，查看实际发送的请求。</p></div><button id="context-refresh">刷新记录</button></div>
 <details class="context-preview"><summary>发送前，先看看上下文（不调用模型）</summary><form id="context-preview-form"><label>准备问他的话<textarea id="context-preview-text" rows="2" maxlength="4000" placeholder="可以留空，只查看此刻的背景和聊天记录。"></textarea></label><div class="buttons"><button type="button" id="context-copy-draft">带入聊天框文字</button><button class="primary">查看此刻预览</button></div><p class="small">预览使用此刻的游戏状态，不会发送请求；尚未发送的图片不在此预览中。</p></form></details>
 <div class="context-filters"><label>请求来源<select id="context-kind"><option value="">全部来源</option><option value="chat">你主动聊天</option><option value="proactive">伙伴主动说话</option><option value="vision">截图提问</option><option value="journal">整理日记</option><option value="summary">整理聊天要点</option><option value="cache-test">缓存验证</option><option value="overview">整合包概览</option><option value="probe">接口检查</option><option value="legacy">旧版操作模式</option><option value="historical">旧请求 · 仅用量</option></select></label><label>状态<select id="context-status"><option value="">全部状态</option><option value="completed">已返回</option><option value="running">正在请求</option><option value="failed">失败</option><option value="cancelled">已取消</option><option value="interrupted">服务中断</option></select></label><label class="check"><input type="checkbox" id="context-current-world">只看当前存档</label></div>
 <p id="context-list-note" class="small">完整上下文从本次升级后开始记录；旧请求只有实际用量，无法还原原文。</p>
 <div class="context-layout"><div><div id="context-requests" class="context-requests" aria-label="模型请求记录"></div><div class="buttons context-paging"><button id="context-prev">上一页</button><span id="context-page" class="small"></span><button id="context-next">下一页</button></div></div><article id="context-detail" class="context-detail" aria-live="polite"><p class="muted">选一条请求，查看他当时带了什么。</p></article></div>
 <p class="small">仅保存本机最近 100 次完整上下文，合计最多 40 MB。图片只记类型、大小和指纹；密钥与鉴权头不记录。金额未由接口返回，不推算费用。</p></section>`);
 let offset=0,total=0,selected='',role='',requestListKey='',busy=false,detailRevision='',generation=0,current=null;
 function block(title,text){const d=el('details',undefined,'context-block');d.append(el('summary',title),el('pre',typeof text==='string'?text:JSON.stringify(text,null,2)));return d;}
 function show(record){
  current=record;const {meta:m,detail:d}=record,box=$('context-detail');box.replaceChildren();
  const top=el('div',undefined,'section-head');top.append(el('h3',names[m.kind]??m.kind),el('span',statuses[m.status]??m.status,'pill'));box.append(top,el('p',`${time(m.created)} · ${m.model||'未选择模型'}`,'context-model'));
  box.append(el('p',`${m.protocol||'未知协议'} / ${m.toolMode||'未记录工具模式'}${m.round?' · 第 '+m.round+' 次接口请求':''}${m.world?' · 存档 '+m.world:''}`,'small context-scope'));
  if(m.source==='fixture')box.append(el('p','这条来自本地夹具，未连接付费接口；用量为测试值。','context-notice'));
  if(m.kind==='preview')box.append(el('p','这是此刻的预览，尚未发送给模型。正式发送时会重新读取当前状态。','context-notice'));
  const stats=el('div',undefined,'context-stats');for(const [label,value] of [['输入 token',m.usage?.input===null&&m.usage?.knownInput!==null&&m.usage?.knownInput!==undefined?num(m.usage.knownInput)+'（已知部分）':num(m.usage?.input)],['输出 token',num(m.usage?.output)],['缓存读取',num(m.usage?.cacheRead??m.usage?.cached)],['缓存写入',num(m.usage?.cacheWrite)],['缓存状态',m.usage?.cacheStatus??'未知'],['请求耗时',m.durationMs==null?'未记录':(m.durationMs/1000).toFixed(2)+' 秒']]){const cell=el('div');cell.append(el('small',label),el('strong',value));stats.append(cell);}box.append(stats);
  const profile=m.stablePrefixHash?`稳定前缀 ${num(m.stablePrefixCharacters)} 字符 · SHA-256 ${m.stablePrefixHash.slice(0,12)}… · ${m.stablePrefixChangeReason??'未知'}${m.commonPrefixCharacters==null?'':' · 公共前缀 '+num(m.commonPrefixCharacters)+' 字符'}`:'这条记录没有稳定前缀诊断。';
  box.append(el('p','Token 来自接口回执；未报告不等于零。稳定前缀与公共前缀只是本地布局诊断，不代表实际缓存命中或账单折扣。','small'),el('p',profile,'small'));
  if(m.error)box.append(el('p',m.error,'context-notice'));
  if(record.related?.length>1){const rounds=el('div',undefined,'buttons');for(const r of record.related){const b=el('button',`第 ${r.round} 次 · ${statuses[r.status]??r.status}`);b.disabled=r.id===m.id;b.onclick=run(()=>open(r.id));rounds.append(b);}box.append(el('p','这轮对话包含多次接口调用，工具查询后的上下文也可以分别查看。','small'),rounds);}
  if(!d){box.append(el('p',m.note||'这条记录只有接口用量，没有保存原始上下文。','context-notice'));return;}
  const bars=el('div',undefined,'context-breakdown'),parts=d.breakdown??[],sum=parts.reduce((n,p)=>n+p.characters,0);bars.append(el('h4','上下文组成'),el('p',`${num(sum)} 个文本字符${d.imageCount?' · '+d.imageCount+' 张图片（不计入字符占比）':''}`,'small'));
  for(const p of [...parts].sort((a,b)=>b.characters-a.characters)){const row=el('div',undefined,'context-part'),label=el('div');label.append(el('span',p.label),el('span',`${num(p.characters)} 字符 · ${sum?(p.characters/sum*100).toFixed(1):0}%`));const meter=el('meter');meter.min=0;meter.max=Math.max(1,sum);meter.value=p.characters;meter.setAttribute('aria-label',p.label+'字符占比');row.append(label,meter);bars.append(row);}box.append(bars);
  for(const s of d.sections??[])box.append(block(`${s.label} · ${{core:'固定设定',continuity:'连续记忆',retrieval:'相关资料',current:'当前状态'}[s.layer]??'上下文'} · ${num(s.characters)} 字符`,s.included===false?s.omittedReason+'（原资料 '+num(s.originalCharacters)+' 字符）':s.text));
  for(const [i,m] of (d.messages??[]).entries())box.append(block(`${i+1}. ${m.role==='user'?'玩家':m.role==='assistant'?'伙伴':m.role==='tool'?'工具返回':m.role}${m.name?' · '+m.name:''}${m.images?.length?' · 含图片':''}`,m));
  if(d.tools?.length)box.append(block('可用工具定义',d.tools));
  if(d.cacheProfile)box.append(block('缓存诊断',d.cacheProfile));if(d.usageEvidence)box.append(block('供应商原始用量字段',d.usageEvidence));if(m.usage?.normalizationVersion!==2)box.append(el('p','旧口径记录，不混入新版缓存比例。','small'));if(m.usage?.usageIssues?.length)box.append(block('回执核对提示',m.usage.usageIssues));
  if(d.response)box.append(block(d.response.discarded?'接口已返回，但取消后未写入聊天':'这次接口返回的内容',d.response));
  if(d.requestBody)box.append(block('实际请求体（图片二进制已省略）',d.requestBody));
  if(d.note)box.append(el('p',d.note,'small'));
  const exportButton=el('button','导出这条上下文');exportButton.onclick=()=>{const blob=new Blob([JSON.stringify(current,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='together-context-'+m.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};box.append(exportButton);
 }
 async function open(id){const n=++generation,r=getState()?.selectedRole;const data=await api('/api/context/request?id='+encodeURIComponent(id));if(n!==generation||r!==getState()?.selectedRole)return;selected=id;detailRevision=JSON.stringify(data.meta);show(data);for(const b of $('context-requests').children)b.setAttribute('aria-pressed',String(b.dataset.id===selected));}
 async function load(force=false){
  const s=getState();if(!s||busy)return;if(!s.contextRecording){$('context-detail').replaceChildren(el('p','本地服务还在运行旧版本。保存并退出游戏后，双击项目中的 update-chat-fix.cmd；重新打开网页后就能查看上下文。','context-notice'));return;}busy=true;const r=s.selectedRole;
  try{
   const world=$('context-current-world').checked?s.session.world??'':'';
   if($('context-current-world').checked&&!world)throw new Error('请先进入要筛选的存档。');
   const params=new URLSearchParams({offset:String(offset),kind:$('context-kind').value,status:$('context-status').value,world});
   const data=await api('/api/context/requests?'+params);if(r!==getState()?.selectedRole)return;total=data.total;
   const key=JSON.stringify(data.requests);if(force||key!==requestListKey){requestListKey=key;const list=$('context-requests');list.replaceChildren();
    for(const m of data.requests){const b=el('button',undefined,'context-request');b.dataset.id=m.id;b.setAttribute('aria-pressed',String(m.id===selected));b.append(el('strong',names[m.kind]??m.kind),el('small',`${time(m.created)} · ${statuses[m.status]??m.status}`),el('span',m.model||'未记录模型','context-model'),el('span',`输入 ${num(m.usage?.input)} / 输出 ${num(m.usage?.output)}`));if(m.round>1)b.append(el('small','同一轮对话的第 '+m.round+' 次接口调用'));b.onclick=run(()=>open(m.id));list.append(b);}
    if(!data.requests.length)list.append(el('p','这里还没有符合筛选条件的请求。可先展开上方预览，或完成一次正常聊天。','muted'));
   }
   $('context-page').textContent=`${total?Math.floor(offset/30)+1:0} / ${Math.ceil(total/30)} 页 · ${total} 条`;$('context-prev').disabled=offset===0;$('context-next').disabled=offset+30>=total;
   const chosen=data.requests.find(m=>m.id===selected);if(!selected&&data.requests.length)await open(data.requests[0].id);else if(chosen&&detailRevision!==JSON.stringify(chosen)&&selected!=='preview')await open(selected);
  }finally{busy=false;}
 }
 $('context-refresh').onclick=run(()=>load(true));
 for(const id of ['context-kind','context-status','context-current-world'])$(id).onchange=run(async()=>{offset=0;selected='';generation++;$('context-detail').replaceChildren(el('p','选一条请求，查看他当时带了什么。','muted'));await load(true);});
 $('context-prev').onclick=run(async()=>{offset=Math.max(0,offset-30);await load(true);});$('context-next').onclick=run(async()=>{offset+=30;await load(true);});
 $('context-copy-draft').onclick=()=>{$('context-preview-text').value=$('chat-input').value;};
 $('context-preview-form').onsubmit=run(async()=>{if(!getState()?.contextRecording)return load();const n=++generation,r=getState().selectedRole;const data=await api('/api/context/preview',{text:$('context-preview-text').value});if(n!==generation||r!==getState().selectedRole)return;selected='preview';show(data);});
 nav.addEventListener('click',()=>load(true).catch(e=>toast(e.message,true)));
 return {async open(id){offset=0;$('context-kind').value='';$('context-status').value='';$('context-current-world').checked=false;selected=id;nav.click();await open(id);$('page-context').scrollIntoView({block:'start'});},render(){const s=getState();if(!s)return;if(role!==s.selectedRole){role=s.selectedRole;selected='';offset=0;requestListKey='';detailRevision='';generation++;$('context-requests').replaceChildren();$('context-detail').replaceChildren(el('p','选一条请求，查看他当时带了什么。','muted'));}if($('page-context').classList.contains('active'))void load().catch(e=>toast(e.message,true));}};
}
