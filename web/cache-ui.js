const choices='<option value="auto">自动识别官方接口</option><option value="observe">仅观测（不添加增强参数）</option><option value="anthropic-5m">Anthropic 五分钟缓存</option><option value="openai-routing">OpenAI 稳定路由提示</option>';
export function setupCacheUI({api,run,getState,toast,onFinished=()=>{}}){
 const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 for(const [form,id] of [['provider-form','cache-policy'],['vision-provider-form','vision-cache-policy']])($(form).querySelector('.buttons')??$(form).querySelector('button')).insertAdjacentHTML('beforebegin',`<label>输入缓存策略<select id="${id}">${choices}</select></label><p class="small" id="${id}-hint"></p>`);
 $('page-usage').insertAdjacentHTML('beforeend',`<article id="cache-test-panel"><h3>验证这个接口的缓存回执</h3><p>使用可预览的虚构资料，连续发送三次共享前缀的请求。只比较实际回执与耗时，不保证命中，也不估算账单折扣。</p><div class="buttons"><button id="cache-preview">预览测试内容</button><button id="cache-start" disabled>开始三次 API 测试（会产生用量）</button><button id="cache-cancel" disabled>取消后续请求</button></div><p id="cache-test-status" role="status">尚未开始。测试不会写入聊天或记忆。</p><details><summary>查看将发送的内容</summary><pre id="cache-test-input" style="white-space:pre-wrap;max-height:320px;overflow:auto"></pre></details><div class="table-scroll" id="cache-test-results"></div></article>`);
 let preview=null,scope='',seen='',generation=0,poll=null,active=false;
 function buttons(){$('cache-preview').disabled=active;$('cache-start').disabled=active||!preview;$('cache-cancel').disabled=!active;}
 const handle=fn=>async e=>{await run(fn)(e);buttons();};
 const call=(operation,extra={})=>api('/api/plus/cache-test',{operation,...extra});
 function cancelPoll(){if(poll)clearTimeout(poll);poll=null;}
 function show(record){
  active=record?.status==='running';buttons();
  if(!record)return;
  $('cache-test-status').textContent=({running:'正在测试',completed:'测试完成',cancelled:'测试已取消',failed:'测试未完成',interrupted:'服务中断后未继续测试'}[record.status]??record.status)+' · '+record.results.length+' / 3 次请求已有记录。'+(record.source==='fixture'?'本次为本地模拟接口。':'')+(record.error??'');
  const table=el('table'),head=el('tr');for(const title of ['次序','状态','输入 / 已知部分','缓存读取','缓存写入','首字延迟','总耗时'])head.append(el('th',title));table.append(head);
  for(const r of record.results){const row=el('tr'),u=r.usage??{};for(const value of [r.round,({completed:'已返回',cancelled:'已取消',failed:'失败',interrupted:'服务中断'}[r.status]??r.status),u.input??(u.knownInput!==null&&u.knownInput!==undefined?u.knownInput+'（未完整）':'未知'),u.cacheRead??'未知',u.cacheWrite??'未知',r.firstTextMs===null?'未知':r.firstTextMs+' ms',r.durationMs+' ms'])row.append(el('td',String(value)));table.append(row);}$('cache-test-results').replaceChildren(table);
 }
 async function status(){cancelPoll();const token=generation,owner=getState().selectedRole;const record=await call('status');if(token!==generation||owner!==getState().selectedRole)return;const wasActive=active;show(record);if(wasActive&&record?.status!=='running')await onFinished();if(record?.status==='running')poll=setTimeout(()=>status().catch(e=>toast(e.message,true)),700);}
 $('cache-preview').onclick=handle(async()=>{const token=generation;preview=await call('preview');if(token!==generation){preview=null;return;}$('cache-test-input').textContent=preview.system+'\n\n'+preview.questions.join('\n');$('cache-test-status').textContent=preview.model+' · '+preview.policy.reason+' '+preview.characters+' 个固定前缀字符。'+preview.note;$('cache-start').disabled=false;});
 $('cache-start').onclick=handle(async()=>{if(!preview)throw Error('请先预览测试内容。');const result=await call('start',{id:preview.id});preview=null;show(result);await status();});
 $('cache-cancel').onclick=handle(async()=>{await call('cancel');await status();});
 document.querySelector('[data-page="usage"]').addEventListener('click',run(status));
 window.addEventListener('beforeunload',cancelPoll);
 return {render(){const s=getState();if(!s)return;const nextScope=s.selectedRole+JSON.stringify([s.provider.protocol,s.provider.url,s.provider.model,s.provider.cachePolicy,s.visionProvider]);if(scope&&scope!==nextScope){generation++;preview=null;active=false;cancelPoll();buttons();$('cache-start').disabled=true;$('cache-test-input').textContent='连接或伙伴发生变化，请重新预览。';$('cache-test-results').replaceChildren();$('cache-test-status').textContent='请重新预览当前连接。';}scope=nextScope;
  const current=JSON.stringify([s.provider.cachePolicy,s.visionProvider?.cachePolicy]);if(seen!==current){seen=current;$('cache-policy').value=s.provider.cachePolicy??'auto';$('vision-cache-policy').value=s.visionProvider?.cachePolicy??'auto';}
  $('cache-policy-hint').textContent=(s.provider.cacheSupport?.reason??'')+' 缓存读取和写入可能采用不同计费方式；失败时不会自动重发。';$('vision-cache-policy-hint').textContent=s.visionProvider?.cacheSupport?.reason??'';
 }};
}
