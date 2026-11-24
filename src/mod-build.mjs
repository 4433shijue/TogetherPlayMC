import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import {root} from './paths.mjs';
import {gameTarget,companionJar} from './game-versions.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function inspectModBuild(gameDir,loader,artifacts=path.join(root,'artifacts/mods'),versionId='1.20.1'){
 const target=gameTarget(versionId,loader);if(!target)return {status:'unavailable',hint:'这个版本和加载器仅支持离线查阅。'};
 const name=companionJar(target);
 const names=(await fs.readdir(path.join(gameDir,'mods')).catch(()=>[])).filter(n=>/^together-companion-(?:fabric|forge)-[\d.]+-[\d.]+\.jar$/.test(n));
 let expected;try{expected=await fs.readFile(path.join(artifacts,name));}catch{return {status:'unavailable',hint:'程序包缺少模组，请重新解压完整包。'};}
 if(!names.length)return {status:'missing',hint:'还没有安装伙伴模组。'};
 if(names.length!==1||names[0]!==name)return {status:'conflict',hint:'发现多个伙伴模组或加载器不匹配，请退出游戏后重新安装。'};
 const bytes=await fs.readFile(path.join(gameDir,'mods',name));let version=null;
 try{const resource=unzipSync(bytes, {filter:e=>e.name==='together-build.json'})['together-build.json'];if(resource)version=JSON.parse(Buffer.from(resource).toString()).version;}catch{}
 const matches=digest(bytes)===digest(expected);
 return {status:matches?'current':'outdated',version,sha256:digest(bytes),expectedSha256:digest(expected),hint:matches?'模组文件与当前程序包一致。':'模组与当前程序包不一致，请退出游戏后更新伙伴。'};
}
