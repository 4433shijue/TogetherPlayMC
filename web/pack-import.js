export function setupPackImport({getState,api,run,el,btn}){
 const $=id=>document.getElementById(id),url='/api/companion/pack-import';
 const call=(action,data={})=>api(url,{action,...data});
 const panel=el('article');panel.id='pack-library';
panel.innerHTML='<h3>本地整合包资料库</h3><div class="buttons"><label class="pack-picker">选择或拖入整合包<input id="pack-file" type="file" accept=".zip,.mrpack,.7z,.rar,.tar,.tar.gz,.tar.xz,.tar.bz2,.tgz,.txz,.tbz,.tbz2"></label><button id="pack-folder" type="button">导入游戏文件夹</button></div><form id="pack-path-form" hidden><label>游戏实例文件夹<input id="pack-path" required placeholder="包含 mods 或配置的目录"></label><button>读取文件夹</button></form><p id="pack-status" role="status"></p><button id="pack-cancel" hidden>取消导入</button><label id="pack-select-label" hidden>资料包<select id="pack-select"></select></label><div id="pack-detail"></div>';
 $('page-connect').insertBefore(panel,$('diagnosis-list'));
 const guide=el('a','新整合包怎么装伙伴？');guide.href='/help.html#modpack';panel.querySelector('.buttons').append(guide);
 const folders=el('details'),summary=el('summary','匹配目录'),rootsBox=el('div'),rootForm=el('form'),rootInput=el('input');
 rootInput.required=true;rootInput.placeholder='启动器或游戏实例的完整路径';rootInput.setAttribute('aria-label','匹配目录路径');
 const remember=async root=>{if(root){await call('remember-root',{root});rootInput.value='';await load();}};
 rootForm.append(rootInput,el('button','记住目录'));rootForm.onsubmit=run(async()=>remember(rootInput.value.trim()));
 folders.append(summary,rootsBox,rootForm);
 if(window.togetherDesktop)folders.append(btn('选择匹配目录',async()=>remember(await window.togetherDesktop.chooseFolder())));
 panel.insertBefore(folders,$('pack-detail'));
 let packs=[],job,timer,selected='',rendered='',detailSeq=0,upload,rootsKey;

 const busy=()=>['waiting','uploading','reading','saving'].includes(job?.status);
 const report=(target,text)=>{target.replaceChildren(el('p',text,'small'));};
 async function matches(target,id,seq,cached=true){
   report(target,'正在核对本机实例与文件指纹…');
   try{
     const {candidates,recommended,warnings}=await call('matches',{pack:id,cached});if(seq!==detailSeq)return;target.replaceChildren();
     if(!candidates.length)report(target,'没有找到本机实例。仍可查阅原包资料，或在「匹配目录」添加游戏文件夹。');
     for(const warning of warnings??[])target.append(el('p',warning,'small'));
     const select=el('select');select.setAttribute('aria-label','待绑定的游戏实例');select.append(new Option('选择要绑定的实例',''));
     const p=packs.find(p=>p.id===id);
     for(const c of candidates){
       const level={high:'文件匹配',possible:'需核对',incompatible:'不兼容'}[c.level];
       target.append(el('p',c.name+' · '+level+' · '+(c.version||'版本未知')+' / '+(c.loader==='unknown'?'加载器未知':c.loader)+' · '+(c.canInstall?'支持游戏内伙伴':'仅可查资料')+' · '+c.path,'source-url'));
       if(c.level!=='incompatible')target.append(el('p','一致 '+c.matched+' · 修改 '+c.changed+' · 缺失 '+c.missing+' · 额外文件 '+c.extra,'small'));
       if(c.differences.length)target.append(el('p',c.differences.join('；'),'small'));
       if(c.level!=='incompatible'&&!p.bound.some(b=>b.id===c.id||b.path===c.path&&b.version===c.version&&b.loader===c.loader))select.append(new Option(c.name+' · '+c.path,c.id));
     }
     if(select.options.length>1){
       if(recommended)select.value=recommended;
       const bind=btn('确认绑定',async()=>{if(!select.value)return;await call('bind',{pack:id,profileId:select.value});rendered='';await load();});
       bind.disabled=!select.value;select.onchange=()=>{bind.disabled=!select.value;};target.append(select,bind);
     }
     target.append(btn('重新核对',async()=>matches(target,id,seq,false)));
   }catch(e){if(seq===detailSeq){report(target,e.message);target.append(btn('返回候选实例',async()=>matches(target,id,seq)));}}
 }
 function detail(p){
   const seq=++detailSeq,d=$('pack-detail');d.replaceChildren();if(!p)return;
   const labels={'modrinth':'Modrinth','curseforge':'CurseForge','zip':'ZIP','7z':'7-Zip','rar':'RAR','tar':'TAR','folder':'游戏文件夹'};
   d.append(el('h4',p.name),el('p',[labels[p.format],p.release,p.version?'MC '+p.version:'游戏版本未知',p.loader==='unknown'?'加载器未知':p.loader].filter(Boolean).join(' · '),'small'));
   const counts=Object.entries(p.counts).map(([k,n])=>({quest:'任务',manual:'手册',recipe:'配方','script-reference':'脚本线索'}[k]??k)+' '+n);
   d.append(el('p','模组 '+p.mods+' · '+(counts.length?counts.join(' · '):p.manifestOnly?'只有模组清单':'未读到可查资料')));
   if(!p.counts.quest)d.append(el('p','没有读到可识别的任务资料；不代表这个包没有任务。','small'));
   if(p.manifestOnly)d.append(el('p','这份包只有清单。关联已安装的实例后，可以从本机补全资料。','small'));
   for(const w of p.warnings)d.append(el('p',w,'small'));
   const form=el('form'),q=el('input'),out=el('div');q.placeholder='搜索任务、手册或配方';q.maxLength=400;q.required=true;q.setAttribute('aria-label','搜索本包资料');
   const source=el('select');source.setAttribute('aria-label','查询来源');source.append(new Option('导入的原包',''));for(const b of p.bound)if(b.index)source.append(new Option('本机实例：'+b.name,b.id));if(source.options.length>1)form.append(source);source.onchange=()=>out.replaceChildren();
   form.append(q,el('button','查资料'));form.onsubmit=run(async()=>{const rows=await call('search',{pack:p.id,query:q.value.trim(),instance:source.value});out.replaceChildren();if(!rows.length)report(out,'本包没有找到相关资料。');for(const r of rows){const hit=el('details'),body=el('p',r.text);hit.append(el('summary',r.title),el('p',r.source,'source-url'),body);out.append(hit);}});
   d.append(form,out,el('h4','游戏实例'));
   for(const b of p.bound){
     const section=el('div');section.append(el('p','已关联：'+b.name+' · '+(b.canInstall?'支持游戏内伙伴':'可查资料，当前版本暂不能安装伙伴')),el('p',b.path,'source-url'));
     const supplement=btn(b.index?'更新本机资料':'从实例补全资料',async()=>{await call('supplement',{pack:p.id,profileId:b.id});await load();});supplement.dataset.supplement='';supplement.disabled=busy();section.append(supplement);
     if(b.canInstall)section.append(btn('安装伙伴',async()=>{const m=await call('install',{pack:p.id,profileId:b.id});section.append(el('p','已安装：'+m.installed));}));
     section.append(btn('解除关联',async()=>{await call('unbind',{pack:p.id,profileId:b.id});rendered='';await load();}));d.append(section);
   }
   const target=el('div');d.append(target);void matches(target,p.id,seq);
 }
 async function load(){
   const s=await api(url);packs=s.packs;job=s.job;
   const rootKey=JSON.stringify(s.roots||[]);if(rootKey!==rootsKey){rootsKey=rootKey;rootsBox.replaceChildren();for(const root of s.roots||[]){const row=el('div');row.append(el('span',root,'source-url'),btn('移除目录',async()=>{await call('forget-root',{root});await load();}));rootsBox.append(row);}}
   const sel=$('pack-select');
   if(job?.status==='ready'&&load.last!==job.id){selected=job.pack;load.last=job.id;}
   if(!packs.some(p=>p.id===selected))selected=packs.at(-1)?.id||'';
   const key=JSON.stringify([packs,rootsKey,selected,getState()?.companion?.profiles?.map(p=>[p.id,p.gameDir])]);
   if(key!==rendered){rendered=key;sel.replaceChildren(...packs.map(p=>new Option(p.name+' · '+(p.release||p.version||'未知版本')+' · '+p.id.slice(8,15),p.id)));sel.value=selected;$('pack-select-label').hidden=!packs.length;detail(packs.find(p=>p.id===selected));}
   $('pack-status').textContent=job?({waiting:'等待文件',uploading:'读取本地上传',reading:'解析整合包',saving:'保存资料',ready:'资料已保存',cancelled:'导入已取消',error:'导入失败'}[job.status]+(busy()&&job.total?' · '+Math.round(job.done*100/job.total)+'%':'')+(job.status==='error'?'：'+job.error:'')):packs.length?'':'还没有导入整合包。';
   $('pack-cancel').hidden=!busy();$('pack-file').disabled=busy();$('pack-folder').disabled=busy();
   for(const b of panel.querySelectorAll('[data-supplement]'))b.disabled=busy();
   clearTimeout(timer);if(busy())timer=setTimeout(()=>load().catch(e=>{$('pack-status').textContent=e.message;}),650);
 }
 async function file(f){
   if(!f)return;if(!/\.(?:zip|mrpack|7z|rar|tar|tar\.(?:gz|bz2|xz)|tgz|txz|tbz2?)$/i.test(f.name))throw Error('请选择 ZIP、MRPACK、7Z、RAR 或 TAR 系列整合包。');
   if(f.size>4*1024**3)throw Error('压缩包超过 4 GiB。');
   const local=window.togetherDesktop?.packFilePath?.(f);
   const {id}=await call('start',local?{file:local,name:f.name}:{name:f.name});
   if(!local){
     upload=new AbortController();
     const transfer=fetch(url+'?upload='+encodeURIComponent(id),{method:'POST',body:f,signal:upload.signal,headers:{'x-together-token':getState().csrf}}).then(async r=>{if(!r.ok)throw Error((await r.json()).error);});
     try{await Promise.all([load(),transfer]);}catch(e){if(e.name!=='AbortError')throw e;}finally{upload=null;await load();}
   }else await load();
 }
 $('pack-file').onchange=run(async()=>{const f=$('pack-file').files[0];$('pack-file').value='';await file(f);});
 panel.ondragover=e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';};
 panel.ondrop=run(async e=>{if(!busy())await file(e.dataTransfer.files[0]);});
 $('pack-select').onchange=()=>{selected=$('pack-select').value;detail(packs.find(p=>p.id===selected));};
 $('pack-folder').onclick=run(async()=>{if(window.togetherDesktop){const folder=await window.togetherDesktop.chooseFolder();if(folder){await call('start',{folder});await load();}}else{$('pack-path-form').hidden=false;$('pack-path').focus();}});
 $('pack-path-form').onsubmit=run(async()=>{await call('start',{folder:$('pack-path').value.trim()});$('pack-path-form').hidden=true;await load();});
 $('pack-cancel').onclick=run(async()=>{if(job)await call('cancel',{id:job.id});upload?.abort();await load();});
 return {load};
}
