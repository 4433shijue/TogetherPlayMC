import {gameTargets,companionJar} from '../src/game-versions.mjs';
import {appVersion} from '../src/version.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {unzipSync} from 'fflate';
import {root,runtime} from '../src/paths.mjs';

await fs.writeFile(path.join(root,'companion-mod/common/src/main/resources/together-build.json'),JSON.stringify({version:appVersion,protocol:1}));
await import('./build-orb-faces.mjs');

async function gradleFor(version){
const base=path.join(runtime,'build-tools'),archive=path.join(base,`gradle-${version}-bin.zip`),gradle=path.join(base,`gradle-${version}`,'bin','gradle.bat');
await fs.mkdir(base,{recursive:true});
try{await fs.access(gradle);}catch{
  const url=`https://downloads.gradle.org/distributions/gradle-${version}-bin.zip`;
  let sha;try{sha=await fs.readFile(archive+'.sha256','utf8');}catch{sha=await fetch(url+'.sha256',{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw new Error('Gradle checksum unavailable');return r.text();});}
  let bytes;try{bytes=await fs.readFile(archive);}catch{}
  if(!bytes||createHash('sha256').update(bytes).digest('hex')!==sha.trim()){
    const response=await fetch(url,{signal:AbortSignal.timeout(240000)});if(!response.ok)throw new Error(`Gradle download HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());
    if(createHash('sha256').update(bytes).digest('hex')!==sha.trim())throw new Error('Gradle checksum mismatch');await fs.writeFile(archive,bytes);
  }
  for(const [name,data] of Object.entries(unzipSync(bytes))){const dest=path.resolve(base,name);if(!dest.startsWith(base+path.sep))throw new Error('Unsafe archive path');if(name.endsWith('/'))await fs.mkdir(dest,{recursive:true});else{await fs.mkdir(path.dirname(dest),{recursive:true});await fs.writeFile(dest,data);}}
}
return gradle;
}
const config=await fs.readFile(path.join(root,'config/experiment.json'),'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return {};throw e;});
const javaHome=process.env.JAVA_HOME||(config.javaPath?path.dirname(path.dirname(config.javaPath)):null);
const args=process.argv.slice(2);
const quote=s=>"'"+s.replaceAll("'","''")+"'";
async function run(tasks,home=javaHome){const gradle=await gradleFor(tasks.some(t=>t.includes('neoforge1211'))?'8.14.3':'8.7');return new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',`& ${quote(gradle)} -p ${quote(path.join(root,'companion-mod'))} ${tasks.map(t=>{if(!/^[\w:=-]+$/.test(t))throw new Error('Invalid build argument');return quote(t);}).join(' ')} --console=plain; exit $LASTEXITCODE`],{windowsHide:true,stdio:'inherit',env:{...process.env,...(home?{JAVA_HOME:home}:{})}});child.on('error',reject);child.on('exit',resolve);});}
if(args.length){process.exitCode=await run(args,args.some(t=>t.includes('1211'))?(process.env.JAVA21_HOME||javaHome):javaHome);}
else{
  const target=path.join(root,'artifacts/mods');await fs.mkdir(target,{recursive:true});const checksums=[];
  for(const t of gameTargets){const {project,loader}=t;
    const code=await run([`:${project}:build`,`-PcompanionLoader=${project}`],t.java===21?(process.env.JAVA21_HOME||javaHome):javaHome);if(code!==0){process.exitCode=code||1;break;}
    const name=companionJar(t),bytes=await fs.readFile(path.join(root,'companion-mod',project,'build/libs',name)),entries=unzipSync(bytes);
    const meta={fabric:'fabric.mod.json',forge:'META-INF/mods.toml',neoforge:'META-INF/neoforge.mods.toml'}[loader];
    if(!entries['togetherplay/companion/CompanionClient.class']||!entries[meta])throw new Error('Incomplete companion archive: '+name);
    await fs.writeFile(path.join(target,name),bytes);checksums.push(createHash('sha256').update(bytes).digest('hex')+'  '+name);console.log('Verified package: '+name);
  }
  if(!process.exitCode)await fs.writeFile(path.join(target,'SHA256SUMS.txt'),checksums.join('\n')+'\n');
}
