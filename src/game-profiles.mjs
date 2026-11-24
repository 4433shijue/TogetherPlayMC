import fs from 'node:fs/promises';
import path from 'node:path';
import {gameTarget} from './game-versions.mjs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exists=async p=>fs.access(p).then(()=>true,()=>false);
export async function scanGames(input){
 if(typeof input!=='string'||!path.isAbsolute(input))throw Error('请选择完整的游戏文件夹路径。');
 const base=await fs.realpath(input);if(!(await fs.stat(base)).isDirectory())throw Error('请选择文件夹，不是启动器文件。');
 const dirs=new Set([base]);for(const root of [base,path.join(base,'.minecraft')]){
  for(const e of (await fs.readdir(path.join(root,'versions'),{withFileTypes:true}).catch(()=>[])).slice(0,300))if(e.isDirectory())dirs.add(path.join(root,'versions',e.name));
 }
 const result=[];
 for(const dir of dirs){
  const name=path.basename(dir),file=path.join(dir,name+'.json');let m;try{m=JSON.parse(await fs.readFile(file,'utf8'));}catch{continue;}
  const libs=(m.libraries??[]).map(l=>l.name??'').join(' '),args=JSON.stringify(m.arguments??{});
  const loader=/net\.neoforged:/.test(libs)?'neoforge':/org\.quiltmc:/.test(libs)?'quilt':/net\.fabricmc:/.test(libs)?'fabric':/net\.minecraftforge:/.test(libs)?'forge':'unknown';
  const version=m.clientVersion||m.inheritsFrom||libs.match(/net\.fabricmc:intermediary:([\d.]+)/)?.[1]||libs.match(/net\.minecraftforge:forge:(1\.\d+(?:\.\d+)?)(?:-|\s|$)/)?.[1]||args.match(/"--fml\.mcVersion","([^"]+)"/)?.[1]||(/^1\.\d+(?:\.\d+)?$/.test(m.id)?m.id:'');
  const shared=path.basename(path.dirname(dir))==='versions'?path.dirname(path.dirname(dir)):dir;
  const ini=await fs.readFile(path.join(dir,'PCL/Setup.ini'),'utf8').catch(()=>''),setting=ini.match(/VersionArgumentIndie=(\d+)/)?.[1];
  const gameDir=setting==='0'?shared:setting==='1'||await exists(path.join(dir,'mods'))?dir:shared;
  result.push({name,version,loader,gameDir,versionDir:dir,sharedDir:shared,supported:Boolean(gameTarget(version,loader)),note:setting===undefined?'请核对 PCL 的版本隔离设置，确认下面的实际模组目录。':'已读取版本隔离配置，请核对实际模组目录。'});
 }
 if(!result.length)throw Error('没有找到版本配置。在 PCL 打开你要玩的版本文件夹，复制地址后重新扫描。');return result;
}
export async function validateGame(b){
 const candidates=await scanGames(b.versionDir),p=candidates.find(p=>p.versionDir===path.resolve(b.versionDir));
 if(!p?.supported)throw Error('游戏内伙伴支持 1.20.1 Fabric / Forge 和 1.21.1 Fabric。');
 const chosen=await fs.realpath(b.gameDir);if(![p.versionDir,p.sharedDir].includes(chosen))throw Error('实际游戏目录必须是该版本目录或其 .minecraft 目录。');
 return {id:'game-'+createHash('sha256').update(chosen.toLowerCase()).digest('hex').slice(0,16),name:String(b.name||p.name).slice(0,100),loader:p.loader,gameDir:chosen,versionDir:p.versionDir,version:p.version};
}
export async function assertGamesClosed(){
 if(process.platform!=='win32')return;
 const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-Command',"@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^javaw?\\.exe$' -and $_.CommandLine -match 'net\\.minecraft|fabricmc|bootstraplauncher|modlauncher' }).Count"],{windowsHide:true});
 if(Number(stdout.trim()))throw Error('请先保存并退出 Minecraft，再安装或恢复伙伴。');
}
