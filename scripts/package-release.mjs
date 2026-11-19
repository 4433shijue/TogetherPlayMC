import {appVersion} from '../src/version.mjs';
const docTag='v'+appVersion.split('.').slice(0,2).join('');
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from '../src/paths.mjs';
const out=path.join(root,'dist','v'+appVersion),stage=path.join(out,'TogetherPlayMC');await fs.mkdir(stage,{recursive:true});
const copy=async(from,to=from)=>{await fs.mkdir(path.dirname(path.join(stage,to)),{recursive:true});await fs.cp(path.join(root,from),path.join(stage,to),{recursive:true,filter:p=>!/[\\/]\.cache([\\/]|$)/.test(p)&&!/[\\/]onnxruntime-node[\\/]bin[\\/]napi-v3[\\/](darwin|linux|win32[\\/](arm64|ia32))([\\/]|$)/.test(p)});};
for(const name of ['src','web','package.json','package-lock.json','start-together.cmd','README.md','CREDITS.md','LICENSE.md','THIRD_PARTY_NOTICES.md','third-party-licenses'])await copy(name);
if(!process.argv.includes('--refresh'))await copy('node_modules');
for(const name of ['prepare-companion.mjs','prepare-vanilla.mjs','apply-update.mjs','rollback-update.mjs','local-voice.ps1'])await copy('scripts/'+name);
await copy('runtime/node/node.exe');await copy('runtime/cache/fabric-api-0.92.2+1.20.1.jar');
await copy('runtime/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2');
await copy('docs/cache-open-source-review.md','cache-open-source-review.md');
for(const name of ['compatibility.md','development.md',docTag+'-release-notes.md',docTag+'-acceptance.md','cache-open-source-review.md','memory-context-open-source-review.md'])await copy('docs/'+name);
await copy('docs/screenshots/'+docTag,'docs/screenshots/'+docTag);
for(const loader of ['fabric','forge'])await copy('artifacts/mods/together-companion-'+loader+'-1.20.1-0.6.0.jar');
if(!process.argv.includes('--refresh')){await fs.cp(path.join(root,'desktop/node_modules/electron/dist'),stage,{recursive:true});await fs.rename(path.join(stage,'electron.exe'),path.join(stage,'TogetherPlayMC.exe'));}
await fs.mkdir(path.join(stage,'resources/app'),{recursive:true});for(const name of ['main.cjs','preload.cjs','start.html','start.js','start.css'])await copy('desktop/'+name,'resources/app/'+name);
await fs.writeFile(path.join(stage,'resources/app/package.json'),JSON.stringify({name:'togetherplaymc-desktop',version:appVersion,main:'main.cjs'}));
await fs.writeFile(path.join(stage,'更新旧版.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "scripts\\apply-update.mjs"\r\n');
await fs.writeFile(path.join(stage,'请先读我.txt'),'一起玩 MC '+appVersion+'\r\n\r\n解压整个文件夹，第一次双击 TogetherPlayMC.exe 会在当前用户桌面创建“一起玩 MC”快捷方式。以后直接双击桌面快捷方式即可打开。\r\n双击 TogetherPlayMC.exe 后，选择“开始连接” → “连接与安装” → “添加我的游戏”。\r\n也可以双击 start-together.cmd 使用网页版。\r\n完整图文教程在控制台“连接与安装”中。\r\n朋友需要自己的模型接口和已安装好的 1.20.1 Fabric / Forge 游戏。\r\n用户数据默认保存到 %LOCALAPPDATA%\\TogetherPlayMC\\data，首次启动会自动迁移可识别的旧版 data。\r\n不要只复制 EXE。不要把含有个人 data 的使用中目录转发朋友。\r\n关闭桌面窗口会收进托盘，右键托盘可退出本地服务。\r\n');
await fs.writeFile(path.join(stage,'创建桌面快捷方式.cmd'),[
 '@echo off',
 'setlocal',
 'set "TARGET=%~dp0TogetherPlayMC.exe"',
 'if not exist "%TARGET%" (',
 '  echo 找不到 TogetherPlayMC.exe，请把这个文件放在完整解压的文件夹里。',
 '  pause',
 '  exit /b 1',
 ')',
 `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$target=[IO.Path]::GetFullPath($env:TARGET); $desktop=[Environment]::GetFolderPath('Desktop'); $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop '一起玩 MC.lnk')); $shortcut.TargetPath=$target; $shortcut.WorkingDirectory=(Split-Path $target); $shortcut.IconLocation=$target; $shortcut.Description='一起玩 MC · 本地陪伴'; $shortcut.Save()"`,
 'if errorlevel 1 (',
 '  echo 创建快捷方式失败，请确认当前 Windows 用户允许写入桌面。',
 '  pause',
 '  exit /b 1',
 ')',
 'echo 已创建桌面快捷方式：一起玩 MC.lnk',
 'echo 现在可以直接双击桌面的“一起玩 MC”打开程序。',
 'exit /b 0'
].join('\r\n')+'\r\n');
await fs.writeFile(path.join(stage,'回退更新.cmd'),'@echo off\r\ncd /d "%~dp0"\r\n"runtime\\node\\node.exe" "scripts\\rollback-update.mjs"\r\n');
for(const name of [docTag+'-release-notes.md',docTag+'-acceptance.md']){try{await copy('docs/'+name,name);}catch(e){if(e.code!=='ENOENT')throw e;}}
await copy('docs/screenshots/'+docTag,'screenshots/'+docTag);
await fs.mkdir(path.join(out,'mods'),{recursive:true});await fs.mkdir(path.join(out,'comparison'),{recursive:true});
for(const loader of ['fabric','forge']){const name=`together-companion-${loader}-1.20.1-0.6.0.jar`;await fs.copyFile(path.join(root,'artifacts/mods',name),path.join(out,'mods',name));}
for(const name of (await fs.readdir(path.join(root,'docs/screenshots/'+docTag))).filter(name=>name.endsWith('.png')&&!name.startsWith('fabric-')&&!name.startsWith('forge-')))await fs.copyFile(path.join(root,'docs/screenshots/'+docTag,name),path.join(out,'comparison',name));
for(const name of [docTag+'-release-notes.md',docTag+'-acceptance.md'])await fs.copyFile(path.join(root,'docs',name),path.join(out,name));
await fs.writeFile(path.join(stage,'THIRD-PARTY.txt'),'Electron 45.2.1: MIT, see LICENSE and LICENSES.chromium.html.\nNode.js 24: see https://nodejs.org/en/about/previous-releases and https://github.com/nodejs/node/blob/v24.x/LICENSE.\nFabric API 0.92.2: Apache-2.0, see https://github.com/FabricMC/fabric/blob/1.20.1/LICENSE.\nTransformers.js and paraphrase-multilingual-MiniLM-L12-v2: Apache-2.0; model revision and file checksums in runtime/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/model-manifest.json. Model LICENSE and README.md included there. JavaScript dependency licenses are included in node_modules. Minecraft, PCL, Java and modpacks are not distributed.\n');
const files=[],pendingFiles=[];async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory()){if(['data','config','work'].includes(e.name)&&dir===stage)throw Error('Personal directory leaked');await walk(file);}else{const relative=path.relative(stage,file).replaceAll('\\','/');if(relative==='release-manifest.json')continue;pendingFiles.push({file,path:relative});}}}await walk(stage);for(let start=0;start<pendingFiles.length;start+=16){const batch=await Promise.all(pendingFiles.slice(start,start+16).map(async entry=>{const bytes=await fs.readFile(entry.file);return {path:entry.path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}));files.push(...batch);}files.sort((a,b)=>a.path.localeCompare(b.path));await fs.writeFile(path.join(stage,'release-manifest.json'),JSON.stringify({version:appVersion,platform:'win32-x64',files},null,2));console.log(JSON.stringify({stage,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)}));
