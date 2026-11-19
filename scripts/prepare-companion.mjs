import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipSync, unzipSync } from 'fflate';
import { root,runtime,inside } from '../src/paths.mjs';
import { prepare } from './prepare-vanilla.mjs';

export const managedGame=path.join(runtime,'companion-player');
async function download(url,target,hash){
  try{const b=await fs.readFile(target);if(hash&&createHash('sha1').update(b).digest('hex')===hash)return target;}catch{}
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error(`下载失败 HTTP ${response.status}：${url}`);const bytes=Buffer.from(await response.arrayBuffer());
  if(hash&&createHash('sha1').update(bytes).digest('hex')!==hash)throw new Error('下载校验失败。');await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);return target;
}
export async function prepareCompanion(log=console.log){
  let base;try{base=JSON.parse(await fs.readFile(path.join(runtime,'launch-plan.json'),'utf8'));}catch{base=await prepare(log);}
  let profile;
  try{profile=JSON.parse(await fs.readFile(path.join(runtime,'cache/fabric-profile.json'),'utf8'));}catch{
    try{profile=await fetch('https://meta.fabricmc.net/v2/versions/loader/1.20.1/0.16.14/profile/json',{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('无法读取 Fabric 元数据。');return r.json();});await fs.writeFile(path.join(runtime,'cache/fabric-profile.json'),JSON.stringify(profile));}
    catch(error){const old=JSON.parse(await fs.readFile(path.join(runtime,'companion-launch-plan.json'),'utf8'));if(old.profileKind!=='companion-fabric')throw error;profile={mainClass:old.metadata.mainClass,libraries:[],cachedLibraries:old.classpath.filter(p=>!base.classpath.includes(p))};log('网络不可用，沿用已校验安装的 Fabric 依赖。');}
  }
  if(profile.mainClass!=='net.fabricmc.loader.impl.launch.knot.KnotClient')throw new Error('Fabric 入口不符合预期。');const libraries=profile.cachedLibraries??[];
  for(const lib of profile.libraries){const [group,name,version]=lib.name.split(':');const relative=`${group.replaceAll('.','/')}/${name}/${version}/${name}-${version}.jar`;const url=new URL(relative,lib.url);if(url.origin!=='https://maven.fabricmc.net')throw new Error('依赖来源不符合预期。');const target=inside(path.join(runtime,'libraries'),relative);let hash=lib.sha1;
    if(!hash){try{const previous=JSON.parse(await fs.readFile(path.join(runtime,'companion-launch-plan.json'),'utf8'));if(previous.profileKind==='companion-fabric'&&previous.classpath.includes(target))hash=createHash('sha1').update(await fs.readFile(target)).digest('hex');}catch{}}
    if(!hash)hash=await fetch(`${url}.sha1`,{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('依赖缺少校验信息。');return r.text();}).then(x=>x.trim().split(/\s/)[0]);lib.sha1=hash;libraries.push(await download(String(url),target,hash));}
  if(profile.libraries.length)await fs.writeFile(path.join(runtime,'cache/fabric-profile.json'),JSON.stringify(profile));
  log('Fabric 依赖已准备，编译本地连接模组。');await fs.mkdir(path.join(managedGame,'mods'),{recursive:true});await fs.mkdir(path.join(runtime,'bridge-classes'),{recursive:true});
  const config=JSON.parse(await fs.readFile(path.join(root,'config/experiment.json'),'utf8'));const javac=path.join(path.dirname(config.javaPath),'javac.exe');
  await new Promise((resolve,reject)=>{const p=spawn(javac,['-encoding','UTF-8','--release','17','-cp',[...libraries,...base.classpath].join(path.delimiter),'-d',path.join(runtime,'bridge-classes'),path.join(root,'bridge/src/TogetherBridge.java')],{windowsHide:true});let err='';p.stderr.on('data',x=>err+=x);p.stdout.resume();p.on('error',reject);p.on('exit',code=>code===0?resolve():reject(new Error(`连接模组编译失败：${err}`)));});
  const files={'fabric.mod.json':await fs.readFile(path.join(root,'bridge/fabric.mod.json'))};
  for(const f of await fs.readdir(path.join(runtime,'bridge-classes/togetherplay')))if(f.endsWith('.class'))files[`togetherplay/${f}`]=await fs.readFile(path.join(runtime,'bridge-classes/togetherplay',f));
  await fs.writeFile(path.join(managedGame,'mods/togetherplay-bridge.jar'),zipSync(files));
  // Pin the official artifact and its published hash; the Java target is checked below.
  const skin=await download('https://cdn.modrinth.com/data/idMHQ4n2/versions/yyYvYfZI/CustomSkinLoader_Universal-15.1.jar',path.join(managedGame,'mods/CustomSkinLoader_Universal-15.1.jar'),'324e6921ecd576e44875981466e7f22170b6541a');
  const entries=unzipSync(await fs.readFile(skin));const tooNew=Object.entries(entries).filter(([name,b])=>name.endsWith('.class')&&!name.startsWith('META-INF/versions/')&&Buffer.from(b).readUInt16BE(6)>61);if(tooNew.length)throw new Error('皮肤模组需要高于 Java 17 的环境。');
  try{await fs.copyFile(path.join(base.gameDir,'options.txt'),path.join(managedGame,'options.txt'),fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST'&&e.code!=='ENOENT')throw e;}
  await fs.mkdir(path.join(managedGame,'CustomSkinLoader/LocalSkin/skins'),{recursive:true});
  const skinConfig={version:'15.1',loadlist:[{name:'LocalSkin',type:'Legacy',skin:'LocalSkin/skins/{USERNAME}.png',cape:'LocalSkin/capes/{USERNAME}.png',elytra:'LocalSkin/elytras/{USERNAME}.png'}],enableDynamicSkull:true,enableTransparentSkin:true,forceLoadAllTextures:false,enableLocalProfileCache:false};
  await fs.writeFile(path.join(managedGame,'CustomSkinLoader/CustomSkinLoader.json'),JSON.stringify(skinConfig,null,2));
  const plan={...base,profileKind:'companion-fabric',gameDir:managedGame,classpath:[...libraries,...base.classpath],metadata:{...base.metadata,mainClass:profile.mainClass}};
  await fs.writeFile(path.join(runtime,'companion-launch-plan.json'),JSON.stringify(plan,null,2));log('陪玩环境已准备，原整合包与原版实验环境未修改。');return plan;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareCompanion().catch(e=>{console.error(e.message);process.exitCode=1;});
