import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {zipSync,strToU8} from 'fflate';
import {createApp} from '../src/server.mjs';

const {chromium,_electron}=await import(pathToFileURL(process.env.TOGETHER_PLAYWRIGHT).href);
const dir=await fs.mkdtemp(path.resolve('work/pack-match-ui-')),launcher=path.join(dir,'launcher'),game=path.join(launcher,'Renamed weekend');
const jar=zipSync({'assets/example/patchouli_books/guide/zh_cn/entries/moon.json':strToU8('{"name":"月光手册","text":"月光矿石"}')});
await fs.mkdir(path.join(game,'mods'),{recursive:true});await fs.writeFile(path.join(game,'mods/manual.jar'),jar);
const meta=strToU8('{"inheritsFrom":"1.12.2","libraries":[{"name":"net.minecraftforge:forge:1.12.2-14.23"}]}');
await fs.writeFile(path.join(game,'version.json'),meta);const file=path.join(dir,'old-forge.zip');
await fs.writeFile(file,zipSync({'mods/manual.jar':jar,'version.json':meta}));
const app=await createApp({directory:dir,port:0,companionProfiles:[]});
try{
 for(const kind of ['web','desktop']){
   let browser,desktop;
   try{
     let page;if(kind==='web'){
       browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({viewport:{width:1280,height:800}});await page.goto(app.url);
     }else{
       desktop=await _electron.launch({executablePath:path.resolve('desktop/node_modules/electron/dist/electron.exe'),args:[path.resolve('desktop/main.cjs')],env:{...process.env,TOGETHER_ROOT:process.cwd(),TOGETHER_DATA:dir,TOGETHER_PORT:new URL(app.url).port}});
       page=await desktop.firstWindow();await page.locator('#connect').click();await page.waitForURL(app.url+'/**');
     }
     const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',async r=>{if(r.url().endsWith('/pack-import')&&r.status()>=400)console.log('UI_ERROR',kind,await r.text());});const nav=page.locator('[data-page="connect"]');
     if(!await nav.isVisible())await page.locator('details.nav-group').filter({has:nav}).locator('summary').click();await nav.click();
     await page.locator('#pack-library summary').filter({hasText:'匹配目录'}).click();
     if(kind==='web'){await page.getByRole('textbox',{name:'匹配目录路径'}).fill(launcher);await page.getByRole('button',{name:'记住目录'}).click();}
     await page.getByRole('button',{name:'移除目录'}).waitFor();
     const started=page.waitForResponse(r=>r.url().endsWith('/pack-import')&&r.request().method()==='POST'&&r.request().postDataJSON()?.action==='start');await page.locator('#pack-file').setInputFiles(file);
     const {id}=await (await started).json();while(app.companion.imports.job.id===id&&['waiting','uploading','reading','saving'].includes(app.companion.imports.job.status))await new Promise(r=>setTimeout(r,100));
     assert.equal(app.companion.imports.job.status,'ready',app.companion.imports.job.error);
     await page.locator('#pack-status').filter({hasText:'资料已保存'}).waitFor();
     const bind=page.getByRole('button',{name:'确认绑定',exact:true});await bind.waitFor();assert.ok(await bind.isEnabled());
     await bind.click();await page.getByText(/已关联：Renamed weekend.*当前版本暂不能安装伙伴/).waitFor();
     assert.equal(await page.locator('#pack-detail').getByRole('button',{name:'安装伙伴',exact:true}).count(),0);
     await page.getByLabel('搜索本包资料').fill('月光矿石');await page.getByRole('button',{name:'查资料',exact:true}).click();
     await page.locator('#pack-detail details summary').filter({hasText:'月光手册'}).click();assert.match(await page.locator('#pack-detail details[open]').innerText(),/manual.jar!\//);
     await page.getByRole('button',{name:'从实例补全资料'}).click();await page.getByLabel('查询来源').waitFor();
     await page.getByLabel('查询来源').selectOption({index:1});await page.getByLabel('搜索本包资料').fill('月光矿石');await page.getByRole('button',{name:'查资料',exact:true}).click();
     await page.locator('#pack-detail details summary').filter({hasText:'月光手册'}).click();assert.match(await page.locator('#pack-detail details[open]').innerText(),/本机实例「Renamed weekend」/);
     if(kind==='web')await page.setViewportSize({width:390,height:844});
     const panel=page.locator('#pack-library');assert.ok(await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await panel.screenshot({path:path.join(dir,kind+'.png')});
     await page.getByRole('button',{name:'解除关联'}).click();await bind.waitFor();assert.equal(app.companion.profiles.length,0);assert.deepEqual(errors,[]);
     console.log('PASS',kind,dir);
   }finally{await desktop?.close();await browser?.close();}
 }
}finally{await app.close();}
