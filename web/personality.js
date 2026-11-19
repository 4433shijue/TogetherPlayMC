import {formLibrary} from './orb-shape.js';
export function setupPersonality(){
 const $=id=>document.getElementById(id);let catalogue=null,pendingPreset='auto';
 const panel=document.createElement('fieldset');panel.className='personality-settings';
 panel.innerHTML=`<legend>性格与说话习惯</legend><p class="small">给熟悉的伙伴添一点不同的表达。名字、原有人设、关系和共同记忆都会保留，主动聊天频率仍由你决定。</p><div class="grid-2"><label>性格来源<select id="personality-mode"><option value="role">沿用角色人设</option><option value="form">采用形态性格</option><option value="custom">自定义</option></select></label><label id="personality-preset-field">性格预设<select id="personality-preset" disabled><option value="auto">随当前形态</option></select></label></div><label id="personality-custom-field" hidden>自定义性格补充<textarea id="personality-custom" rows="4" maxlength="2000" placeholder="例如：安静温柔的小狗，偶尔汪一下，给建议时直接清楚。"></textarea></label><p id="personality-status" class="small" aria-live="polite"></p><div class="personality-sample"><strong id="personality-name"></strong><p id="personality-summary"></p><blockquote id="personality-example"></blockquote></div><button type="button" id="personality-adopt" disabled>采用当前形态性格</button><p class="small">口癖只偶尔出现；攻略步骤、危险提醒和认真交流时优先说清楚。保存角色后生效。</p>`;
 $('role-style').closest('.grid-2').after(panel);
 function render(){
  const mode=$('personality-mode').value,form=$('orb-form').value||'orb',id=$('personality-preset').value||pendingPreset;
  $('personality-preset-field').hidden=mode!=='form';$('personality-custom-field').hidden=mode!=='custom';$('personality-adopt').hidden=mode!=='role';
  const effective=mode==='role'?form:id==='auto'?form:id,preset=catalogue?.personalityPresets.find(p=>p.id===effective);
  $('personality-status').textContent=mode==='role'?'当前沿用你填写的人设与说话风格；下面是当前形态的推荐。':mode==='custom'?'使用下方补充，不叠加形态口癖；切换形态时保留这段文字。':id==='auto'?'性格随当前形态变化；经典小球继续使用原有人设。':'性格固定使用所选预设，换外观也会保留。';
  panel.querySelector('.personality-sample').hidden=mode==='custom';
  $('personality-name').textContent=preset?(mode==='role'?'形态推荐 · ':'')+preset.name:'正在读取形态性格…';
  $('personality-summary').textContent=preset?.summary||'';$('personality-example').textContent=preset?.example?'口吻示例：'+preset.example:'';
 }
 for(const id of ['personality-mode','personality-preset'])$(id).addEventListener('change',render);
 document.addEventListener('orb-appearance-change',render);
 $('personality-adopt').onclick=()=>{$('personality-mode').value='form';$('personality-preset').value='auto';render();};
 formLibrary.then(data=>{catalogue=data;$('personality-preset').replaceChildren(new Option('随当前形态','auto'),...data.personalityPresets.map(p=>new Option(p.name,p.id)));$('personality-preset').value=pendingPreset;$('personality-preset').disabled=false;$('personality-adopt').disabled=false;render();}).catch(()=>{$('personality-status').textContent='性格预设未能载入，请刷新后重试。';});
 render();
 return {read:()=>({mode:$('personality-mode').value,preset:catalogue?$('personality-preset').value:pendingPreset,custom:$('personality-custom').value}),fill(role){const p={mode:'role',preset:'auto',custom:'',...role.personality};$('personality-mode').value=p.mode;pendingPreset=p.preset;if(catalogue)$('personality-preset').value=p.preset;$('personality-custom').value=p.custom;render();}};
}
