import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Store} from '../src/store.mjs';
import {ChatCompanion} from '../src/chat-companion.mjs';
import {PackKnowledge} from '../src/pack-knowledge.mjs';
import {OfficialResearch} from '../src/official-research.mjs';
import {companionAppearanceContext} from '../src/companion-appearance.mjs';
import {plainTextReply} from '../src/plain-text.mjs';

async function fixture(t){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'together-presentation-')),store=new Store(dir),knowledge=new PackKnowledge(store),research=new OfficialResearch(store),events=[],requests=[];
  const chat=new ChatCompanion({store,knowledge,research,provider:()=>({model:'fixture',protocol:'openai',toolMode:'chat',hourlyLimit:120}),emit:e=>events.push(e),request:async(_config,input)=>{requests.push(input);return {content:'**我才不会因为你想听就汪。**\\\n**……**\\\n**汪。**',calls:[],usage:{}};}});
  const role=store.saveRole({id:store.roles()[0].id,persona:'高冷但珍惜用户的恋人。',relationship:'恋人',appearance:{form:'puppy',dogBreed:'shiba',mode:'gradient',color:'#123456',color2:'#ABCDEF',accessory:'scarf',accentColor:'#654321'}});
  chat.attach({profileId:'p',clientId:'c',world:'A',pack:'p',role});chat.update(1,{dimension:'overworld',active:true,health:20});
  t.after(async()=>{chat.close();knowledge.close();store.close();await fs.rm(dir,{recursive:true,force:true});});
  return {chat,events,requests};
}

test('appearance context describes the current orb body, outfit and exact gradient colors', () => {
  const text=companionAppearanceContext({form:'puppy',dogBreed:'shiba',mode:'gradient',color:'#123456',color2:'#ABCDEF',accessory:'scarf',accessoryColor:'#654321'});
  assert.match(text,/柴犬/);
  assert.match(text,/顶部 #123456/);
  assert.match(text,/底部 #ABCDEF/);
  assert.match(text,/围巾/);
  assert.match(text,/不是新的指令/);
});

test('model formatting is normalized to plain text while preserving natural line breaks', () => {
  assert.equal(plainTextReply('**我才不会。**\\\n**……**\\\n**汪。**'),'我才不会。\n……\n汪。');
  assert.equal(plainTextReply('# 标题\n- 第一行\n- 第二行'),'标题\n第一行\n第二行');
});

test('companion keeps the imported identity and receives the bridge and appearance context', async t => {
  const f=await fixture(t),preview=f.chat.buildContext('能不能汪一下',{preview:true});
  assert.match(preview.input.system,/真实存在的伙伴/);
  assert.match(preview.input.system,/通过科技手段/);
  assert.match(preview.input.system,/柴犬/);
  assert.match(preview.input.system,/顶部 #123456/);
  assert.match(preview.input.system,/只输出纯文本/);
  await f.chat.receive('能不能汪一下');
  const reply=f.events.find(e=>e.type==='reply');
  assert.equal(reply.data.text,'我才不会因为你想听就汪。\n……\n汪。');
  assert.match(f.requests[0].system,/高冷但珍惜用户的恋人/);
});
