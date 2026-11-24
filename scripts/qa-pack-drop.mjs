import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createApp} from '../src/server.mjs';

const {chromium}=await import(pathToFileURL(process.env.TOGETHER_PLAYWRIGHT).href);
const file=path.resolve(process.argv[2]),dir=await fs.mkdtemp(path.resolve('work/pack-drop-'));
const app=await createApp({directory:dir,port:0,companionProfiles:[]});
const matchGame=process.argv.includes('--match-cobble')?path.resolve('runtime/qa-cobble1211/game'):null;
let browser,timer;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.goto(app.url);
 const nav=page.locator('[data-page="connect"]');
 if(!await nav.isVisible())await page.locator('details.nav-group').filter({has:nav}).locator('summary').click();
 await nav.click();
 if(matchGame){
   await fs.copyFile(path.resolve('runtime/qa-cobble1211/metadata.json'),path.join(matchGame,'version.json'),fs.constants.COPYFILE_EXCL).catch(e=>{if(e.code!=='EEXIST')throw e;});
   await page.locator('#pack-library summary').filter({hasText:'匹配目录'}).click();
   await page.getByRole('textbox',{name:'匹配目录路径'}).fill(matchGame);await page.getByRole('button',{name:'记住目录'}).click();
   await page.getByRole('button',{name:'移除目录'}).waitFor();
 }
 const carrier=await page.evaluateHandle(()=>document.body.appendChild(Object.assign(document.createElement('input'),{type:'file',hidden:true})));
 await carrier.asElement().setInputFiles(file);
 await carrier.evaluate(input=>{const dataTransfer=new DataTransfer();dataTransfer.items.add(input.files[0]);document.querySelector('#pack-library').dispatchEvent(new DragEvent('drop',{dataTransfer,bubbles:true,cancelable:true}));input.remove();});
 timer=setInterval(()=>{const j=app.companion.imports.job;console.log('IMPORT',j?.status,j?.done,j?.total,j?.error??'');},15000);
 await page.waitForFunction(()=>/资料已保存|导入失败|导入已取消/.test(document.querySelector('#pack-status').textContent),null,{timeout:30*60000});
 const job=app.companion.imports.job;assert.equal(job.status,'ready',job.error);
 await page.getByRole('textbox',{name:'搜索本包资料'}).fill('精灵球怎么做');
 await page.getByRole('button',{name:'查资料',exact:true}).click();
 const hit=page.locator('#pack-detail details').first();await hit.locator('summary').waitFor();
 assert.match(await hit.locator('summary').innerText(),/^精灵球 · cobblemon:poke_ball$/);await hit.locator('summary').click();
 const source=await hit.locator('.source-url').innerText(),body=await hit.innerText();
 assert.match(source,/\/recipe\/poke_ball\.json$/);assert.match(body,/red_apricorn/);
 if(matchGame){
   const pick=page.getByLabel('待绑定的游戏实例');await pick.waitFor({timeout:300000});
   const res=await app.companion.imports.matches(job.pack),c=res.candidates.find(x=>x.path===matchGame);
   assert.ok(c?.canInstall&&c.matchedMods>=200,JSON.stringify(c));assert.equal(app.companion.profiles.length,0);
   await pick.selectOption(c.id);await page.getByRole('button',{name:'确认绑定'}).click();
   const install=page.locator('#pack-detail').getByRole('button',{name:'安装伙伴',exact:true});await install.waitFor({timeout:180000});
   assert.equal(app.companion.profiles.length,0);await install.click();await page.getByText('已安装：together-companion-fabric-1.21.1-0.6.0.jar',{exact:true}).waitFor({timeout:180000});
   console.log('MATCH_AND_INSTALL',JSON.stringify(c));
 }
 assert.deepEqual(errors,[]);await page.locator('#pack-library').screenshot({path:path.join(dir,'recipe.png')});
 console.log('PASS',JSON.stringify({dir,source,pack:app.companion.imports.list()[0],body}));
}finally{clearInterval(timer);await browser?.close();await app.close();}
