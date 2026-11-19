import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {prepareDataDirectory,backupDataDirectory} from '../src/data-root.mjs';
const payload=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const rl=createInterface({input:process.stdin,output:process.stdout});
try{
 const version=JSON.parse(await fs.readFile(path.join(payload,'package.json'),'utf8')).version;console.log('一起玩 MC '+version+' 更新。请先退出游戏，并从托盘退出桌面与本地服务。');
 const target=await fs.realpath((process.argv[2]||await rl.question('粘贴旧版程序文件夹的完整路径，然后回车：')).trim().replace(/^"|"$/g,''));
 if(target.toLowerCase()===payload.toLowerCase())throw Error('请选择旧版程序目录，不是升级包目录。');
 const pkg=JSON.parse(await fs.readFile(path.join(target,'package.json'),'utf8'));if(pkg.name!=='togetherplaymc')throw Error('这个目录不是 TogetherPlayMC，请选择含 start-together.cmd 的旧版文件夹。');
 if(process.platform==='win32'){
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'java|node|electron|TogetherPlayMC' } | Select-Object Name,CommandLine) | ConvertTo-Json -Compress"],{windowsHide:true});let rows=JSON.parse(stdout||'[]');if(!Array.isArray(rows))rows=[rows];const norm=s=>String(s||'').replaceAll('/','\\').toLowerCase();
  if(rows.some(p=>/^javaw?\.exe$/i.test(p.Name)&&/net\.minecraft|fabricmc|bootstraplauncher|modlauncher/i.test(p.CommandLine||'')))throw Error('Minecraft 仍在运行，请保存退出后再更新。');
  if(rows.some(p=>norm(p.CommandLine).includes(norm(target))&&!norm(p.CommandLine).includes(norm(payload))&&(/src[\\/]server\.mjs/i.test(p.CommandLine||'')||/electron|TogetherPlayMC/i.test(p.Name))))throw Error('旧版服务或桌面仍在运行，请从托盘退出后再更新。');
 }
 const manifest=JSON.parse(await fs.readFile(path.join(payload,'release-manifest.json'),'utf8'));
 for(const f of manifest.files){const source=path.resolve(payload,f.path),dest=path.resolve(target,f.path);if(!source.startsWith(payload+path.sep)||!dest.startsWith(target+path.sep)||/^(data|config|work)[\\/]/i.test(f.path))throw Error('升级文件清单无效。');const data=await fs.readFile(source);if(createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('升级包校验不通过：'+f.path);}
 const storage=await prepareDataDirectory({root:target});
 const backup=path.join(target,'work','before-'+version.replaceAll('.','-')+'-'+Date.now());await fs.mkdir(backup,{recursive:true});
 const dataBackup=path.join(backup,'stable-data');
 await backupDataDirectory(storage.directory,dataBackup);
 const replaced=[],added=[];
 for(const f of manifest.files){const previous=path.join(target,f.path);try{await fs.access(previous);await fs.mkdir(path.dirname(path.join(backup,f.path)),{recursive:true});await fs.copyFile(previous,path.join(backup,f.path));replaced.push(f.path);}catch(e){if(e.code==='ENOENT')added.push(f.path);else throw e;}}
 try{for(const f of manifest.files){const dest=path.join(target,f.path);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(payload,f.path),dest);}}
 catch(e){for(const f of replaced)await fs.copyFile(path.join(backup,f),path.join(target,f));for(const f of added)await fs.unlink(path.join(target,f)).catch(()=>{});throw Error('更新没有完成，已回退程序文件：'+e.message);}
 await fs.writeFile(path.join(backup,'restore.json'),JSON.stringify({target,replaced,added},null,2));
 console.log('程序已更新，稳定数据目录保留。程序备份：'+backup+'\n数据目录：'+storage.directory+'\n现在打开 TogetherPlayMC.exe，进入“连接与安装”更新你常用版本的伙伴。');
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(!process.argv[2])await rl.question('按回车关闭。');rl.close();}
