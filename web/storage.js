export function setupStorage({api,run,toast,getState}){
 const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 const nav=el('button','◈　数据与恢复');nav.dataset.page='storage';document.querySelector('nav').append(nav);
 document.querySelector('main').insertAdjacentHTML('beforeend',`
 <section class="page" id="page-storage"><article><span class="pill">把共同经历好好留住</span><h2>数据与恢复</h2><p id="storage-location"></p><p id="snapshot-location" class="small"></p><p>备份包含角色、记忆、聊天、设置、照片和皮肤。只留在你的电脑，也包含本机加密的模型设置，请妥善保管。</p><div class="buttons"><button id="snapshot-create" class="primary">立即备份</button><button id="snapshot-refresh">刷新备份列表</button></div><p id="storage-status" role="status"></p></article><div id="snapshot-list"></div></section>
 <dialog id="snapshot-preview"><h2>恢复前，先核对这些内容</h2><p id="snapshot-date"></p><div id="snapshot-counts" class="table-scroll"></div><p id="snapshot-note"></p><p>请先保存并退出 Minecraft。恢复开始前，会自动保留当前数据的一份备份。</p><div class="buttons"><button id="snapshot-apply" class="danger">确认恢复这份备份</button><button id="snapshot-close">先不恢复</button></div></dialog>`);
 let preview=null,busy=false;
 const labels={roles:'角色',memories:'记忆（含旧版本）',events:'聊天与事件',tasks:'旧模式任务',plans:'旧模式计划',journey_entries:'日记',journey_goals:'打算',journey_sessions:'旅程',journey_marks:'进度记录'};
 async function load(){
  const result=await api('/api/storage/list',{});$('storage-location').textContent='数据保存位置：'+result.directory;$('snapshot-location').textContent='备份保存位置：'+result.snapshotDirectory;
  $('snapshot-list').replaceChildren();
  for(const item of result.snapshots){const card=el('article'),previewButton=el('button','预览与恢复');
   card.append(el('h3',new Date(item.created).toLocaleString()),el('p',(item.reason==='before-restore'?'恢复前自动备份':'手动备份')+' · 程序 '+item.version+' · '+(item.bytes/1048576).toFixed(1)+' MB'));
   previewButton.onclick=run(async()=>{if(busy)return;$('storage-status').textContent='正在校验备份…';try{preview=await api('/api/storage/preview',{id:item.id});const table=el('table'),header=el('tr');for(const label of ['内容','现在','这份备份'])header.append(el('th',label));table.append(header);for(const [key,label] of Object.entries(labels)){const row=el('tr');for(const value of [label,preview.current[key]??0,preview.counts[key]??0])row.append(el('td',String(value)));table.append(row);}$('snapshot-counts').replaceChildren(table);$('snapshot-date').textContent=new Date(preview.created).toLocaleString()+' · '+preview.version;$('snapshot-note').textContent=preview.note;$('snapshot-preview').showModal();}finally{$('storage-status').textContent='';}});card.append(previewButton);$('snapshot-list').append(card);
  }
  if(!result.snapshots.length)$('snapshot-list').append(el('p','还没有创建完整备份。迁移和旧版升级的恢复文件仍保留在原位置。'));
 }
 async function operation(fn){if(busy)return;busy=true;$('snapshot-create').disabled=true;$('snapshot-apply').disabled=true;try{return await fn();}finally{busy=false;$('snapshot-create').disabled=false;$('snapshot-apply').disabled=false;}}
 $('snapshot-create').onclick=run(()=>operation(async()=>{$('storage-status').textContent='正在备份与校验…';try{await api('/api/storage/backup',{});await load();toast('备份完成，照片和数据库都已校验。');}finally{$('storage-status').textContent='';}}));
 $('snapshot-apply').onclick=run(()=>operation(async()=>{if(!preview)return;$('storage-status').textContent='正在恢复，请稍候…';try{await api('/api/storage/restore',{id:preview.id,token:preview.token});location.reload();}finally{$('storage-status').textContent='';}}));
 $('snapshot-close').onclick=()=>{if(!busy)$('snapshot-preview').close();};$('snapshot-preview').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('snapshot-refresh').onclick=run(load);nav.addEventListener('click',run(load));return {load};
}
