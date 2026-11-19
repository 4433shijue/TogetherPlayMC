import fs from 'node:fs/promises';
import path from 'node:path';
import {createInterface} from 'node:readline/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolveDataDirectory} from '../src/data-root.mjs';
const rl=createInterface({input:process.stdin,output:process.stdout});
try{
 const backup=await fs.realpath((process.argv[2]||await rl.question('粘贴更新时显示的 before- 开头的备份文件夹路径：')).trim().replace(/^"|"$/g,''));
 const record=JSON.parse(await fs.readFile(path.join(backup,'restore.json'),'utf8')),target=await fs.realpath(record.target);
 const storage=resolveDataDirectory({root:target});
 if(path.dirname(backup).toLowerCase()!==path.join(target,'work').toLowerCase()||!/^before-(?:v07|\d+-\d+-\d+)-\d+$/.test(path.basename(backup)))throw Error('请选择此程序自动生成的升级备份。');
 const files=[...record.replaced,...record.added];
 for(const file of files){if(!path.resolve(target,file).startsWith(target+path.sep)||/^(data|config|work)[\\/]/i.test(file))throw Error('备份清单无效。');}
 if(process.platform==='win32'){
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'java|node|electron|TogetherPlayMC' } | Select-Object Name,CommandLine) | ConvertTo-Json -Compress"],{windowsHide:true});let rows=JSON.parse(stdout||'[]');if(!Array.isArray(rows))rows=[rows];
  if(rows.some(p=>/^javaw?\.exe$/i.test(p.Name)&&/net\.minecraft|fabricmc|bootstraplauncher|modlauncher/i.test(p.CommandLine||'')))throw Error('请先保存并退出 Minecraft。');
  if(rows.some(p=>String(p.CommandLine).toLowerCase().includes(target.toLowerCase())&&(/src[\\/]server\.mjs/i.test(p.CommandLine||'')||/electron|TogetherPlayMC/i.test(p.Name))))throw Error('请先退出该目录的桌面与服务。');
 }
 for(const file of record.replaced)await fs.access(path.join(backup,file));
 // Keep a second recovery point, and retain all user data created since the upgrade.
 const recovery=path.join(target,'work','before-rollback-'+Date.now());await fs.mkdir(recovery,{recursive:true});
 for(const file of files){const dest=path.join(recovery,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(target,file),dest).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 for(const file of record.replaced)await fs.copyFile(path.join(backup,file),path.join(target,file));
 for(const file of record.added)await fs.unlink(path.join(target,file)).catch(e=>{if(e.code!=='ENOENT')throw e;});
 console.log('旧版程序已恢复。当前聊天、日记和设置保留；稳定数据目录：'+storage.directory+'；回退前程序备份：'+recovery);
}catch(e){console.error(e.message);process.exitCode=1;}finally{if(!process.argv[2])await rl.question('按回车关闭。');rl.close();}
