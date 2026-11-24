export function setupPackImport({getState,api,run,el,btn}){
 const $=id=>document.getElementById(id),url='/api/companion/pack-import';
 const call=(action,data={})=>api(url,{action,...data});
 const panel=el('article');panel.id='pack-library';
 panel.innerHTML='<h3>本地整合包资料库</h3><div class="buttons"><label class="pack-picker">选择或拖入整合包<input id="pack-file" type="file" accept=".zip,.mrpack"></label><button id="pack-folder" type="button">导入游戏文件夹</button></div><form id="pack-path-form" hidden><label>游戏实例文件夹<input id="pack-path" required placeholder="包含 mods 或配置的目录"></label><button>读取文件夹</button></form><p id="pack-status" role="status"></p><button id="pack-cancel" hidden>取消导入</button><label id="pack-select-label" hidden>资料包<select id="pack-select"></select></label><div id="pack-detail"></div>';
 $('page-connect').insertBefore(panel,$('diagnosis-list'));
 let packs=[],job,timer,selected='',rendered='',detailSeq=0,upload;
 const busy=()=>['waiting','uploading','reading','saving'].includes(job?.status);
 const report=(target,text)=>{target.replaceChildren(el('p',text,'small'));};
 async function matches(target,id,seq,root){
   report(target,'正在核对本机实例与文件指纹…');
   try{
     const {candidates,recommended}=await call('matches',{pack:id,root});if(seq!==detailSeq)return;target.replaceChildren();
     if(!candidates.length)report(target,'本机尚未添加游戏。离线资料已经可以搜索。');
     const select=el('select');select.setAttribute('aria-label','待绑定的游戏实例');select.append(new Option('选择要绑定的实例',''));
     const p=packs.find(p=>p.id===id);
     for(const c of candidates){
       const level={high:'文件匹配',possible:'需核对',incompatible:'不兼容'}[c.level];
       target.append(el('p',c.name+' · '+level+' · '+c.path,'source-url'));
       if(c.level!=='incompatible')target.append(el('p','一致 '+c.matched+' · 修改 '+c.changed+' · 缺失 '+c.missing+' · 额外文件 '+c.extra,'small'));
       if(c.differences.length)target.append(el('p',c.differences.join('；'),'small'));
       if(c.level!=='incompatible'&&!p.bound.some(b=>b.id===c.id))select.append(new Option(c.name+' · '+c.path,c.id));
     }
     if(select.options.length>1){
       if(recommended)select.value=recommended;
       const bind=btn('确认绑定',async()=>{if(!select.value)return;await call('bind',{pack:id,profileId:select.value});rendered='';await load();});
       bind.disabled=!select.value;select.onchange=()=>{bind.disabled=!select.value;};target.append(select,bind);
     }
     const form=el('form'),dir=el('input');dir.placeholder='启动器或游戏版本文件夹路径';dir.required=true;dir.setAttribute('aria-label','匹配目录');
     form.append(dir,el('button','在此目录匹配'));form.onsubmit=run(async()=>matches(target,id,seq,dir.value.trim()));target.append(form);
     if(window.togetherDesktop)target.append(btn('选择匹配目录',async()=>{const root=await window.togetherDesktop.chooseFolder();if(root)await matches(target,id,seq,root);}));
   }catch(e){if(seq===detailSeq){report(target,e.message);target.append(btn('返回候选实例',async()=>matches(target,id,seq)));}}
 }
 function detail(p){
   const seq=++detailSeq,d=$('pack-detail');d.replaceChildren();if(!p)return;
   const labels={'modrinth':'Modrinth','curseforge':'CurseForge','zip':'游戏压缩包','folder':'游戏文件夹'};
   d.append(el('h4',p.name),el('p',[labels[p.format],p.release,p.version?'MC '+p.version:'游戏版本未知',p.loader==='unknown'?'加载器未知':p.loader].filter(Boolean).join(' · '),'small'));
   const counts=Object.entries(p.counts).map(([k,n])=>({quest:'任务',manual:'手册',recipe:'配方','script-reference':'脚本线索'}[k]??k)+' '+n);
   d.append(el('p','模组 '+p.mods+' · '+(counts.length?counts.join(' · '):p.manifestOnly?'只有模组清单':'未读到可查资料')));
   if(!p.counts.quest)d.append(el('p','没有读到可识别的任务资料；不代表这个包没有任务。','small'));
   if(p.version!=='1.20.1'||!['fabric','forge'].includes(p.loader))d.append(el('p','仅离线查阅：当前伙伴支持 Minecraft 1.20.1 Fabric / Forge。','small'));
   for(const w of p.warnings)d.append(el('p',w,'small'));
   const form=el('form'),q=el('input'),out=el('div');q.placeholder='搜索任务、手册或配方';q.maxLength=400;q.required=true;q.setAttribute('aria-label','搜索本包资料');
   form.append(q,el('button','查资料'));form.onsubmit=run(async()=>{const rows=await call('search',{pack:p.id,query:q.value.trim()});out.replaceChildren();if(!rows.length)report(out,'本包没有找到相关资料。');for(const r of rows){const hit=el('details'),body=el('p',r.text);hit.append(el('summary',r.title),el('p',r.source,'source-url'),body);out.append(hit);}});
   d.append(form,out,el('h4','游戏实例'));
   for(const b of p.bound)d.append(el('span','已绑定：'+b.name+'　'),btn('解除绑定',async()=>{await call('unbind',{pack:p.id,profileId:b.id});rendered='';await load();}));
   const target=el('div');d.append(target);void matches(target,p.id,seq);
 }
 async function load(){
   const s=await api(url);packs=s.packs;job=s.job;
   const sel=$('pack-select');
   if(job?.status==='ready'&&load.last!==job.id){selected=job.pack;load.last=job.id;}
   if(!packs.some(p=>p.id===selected))selected=packs.at(-1)?.id||'';
   const key=JSON.stringify([packs,selected,getState()?.companion?.profiles?.map(p=>[p.id,p.gameDir])]);
   if(key!==rendered){rendered=key;sel.replaceChildren(...packs.map(p=>new Option(p.name+' · '+(p.release||p.version||'未知版本')+' · '+p.id.slice(8,15),p.id)));sel.value=selected;$('pack-select-label').hidden=!packs.length;detail(packs.find(p=>p.id===selected));}
   $('pack-status').textContent=job?({waiting:'等待文件',uploading:'读取本地上传',reading:'解析整合包',saving:'保存资料',ready:'资料已保存',cancelled:'导入已取消',error:'导入失败'}[job.status]+(busy()&&job.total?' · '+Math.round(job.done*100/job.total)+'%':'')+(job.status==='error'?'：'+job.error:'')):packs.length?'':'还没有导入整合包。';
   $('pack-cancel').hidden=!busy();$('pack-file').disabled=busy();$('pack-folder').disabled=busy();
   clearTimeout(timer);if(busy())timer=setTimeout(()=>load().catch(e=>{$('pack-status').textContent=e.message;}),650);
 }
 async function file(f){
   if(!f)return;if(!/\.(zip|mrpack)$/i.test(f.name))throw Error('请选择 .zip 或 .mrpack 整合包。');
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
