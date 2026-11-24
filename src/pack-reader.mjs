import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {crc32} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import yauzl from 'yauzl';
import {staticDocuments} from './pack-knowledge.mjs';
import {archiveSignature,spoolArchive} from './archive-stream.mjs';

export const archiveLimit=4*1024**3;
const digest=(v,alg='sha512')=>createHash(alg).update(v).digest('hex');
const roots=['mods','config','defaultconfigs','kubejs','patchouli_books','data','global_packs','moonlight-global-datapacks'];
const modFile=p=>/^mods\/[^/]+\.jar$/i.test(p)&&!/^mods\/together-companion-/i.test(p);
const sensitive=p=>/(?:^|\/)(?:saves|logs|accounts?|screenshots|crash-reports|togetherplay|together-companion)(?:[./_-]|$)|(?:token|password|credentials|api[-_]?key)/i.test(p);
const dataFile=p=>!sensitive(p)&&roots.includes(p.split('/')[0])&&/\.(?:json|snbt|js|toml|cfg|properties)$/i.test(p);
const reference=p=>/(?:^|\/)patchouli_books\/.*\.json$|(?:^|\/)data\/[^/]+\/recipes?\/.*\.json$|^config\/ftbquests\/quests\/.*\.snbt$|^kubejs\/(?:server_scripts|startup_scripts)\/.*\.js$/.test(p);
const language=p=>/(?:^|\/)assets\/[^/]+\/lang\/zh_cn\.json$/i.test(p);
const json=b=>JSON.parse(b.toString('utf8').replace(/^\uFEFF/,''));
const short=v=>String(v??'').slice(0,180);
function safe(p){
  if(typeof p!=='string'||!p||p.length>1024||/[\\:\x00-\x1f]/.test(p)||p.startsWith('/')||p.replace(/\/$/,'').split('/').some(v=>!v||v==='.'||v==='..'))throw Error('压缩包包含不安全的路径。');
  return p;
}
async function entries(zip,cap,select,onConflict){
  if(zip.entryCount>cap)throw Error('压缩包条目过多。');
  const files=new Map(),names=new Set();
  for await(const e of zip.eachEntry()){
    if(select&&!select(e.fileName))continue;
    const n=safe(e.fileName),key=n.toLowerCase();if(names.has(key)){if(onConflict){onConflict(n);continue;}throw Error('压缩包有重复路径：'+n);}names.add(key);
    if(!n.endsWith('/')&&(e.externalFileAttributes>>>16&0xf000)!==0xa000)files.set(n,e);
  }
  return files;
}
const zipOptions={autoClose:false,strictFileNames:true};
async function read(zip,e,limit,budget){
  if(e.uncompressedSize>limit||e.uncompressedSize>budget.left)throw Error('所选资料超过读取或解压上限：'+e.fileName);
  const chunks=[];let size=0,crc=0;
  for await(const b of await zip.openReadStreamPromise(e)){
    size+=b.length;budget.left-=b.length;if(size>limit||budget.left<0)throw Error('解压资料超过上限。');
    crc=crc32(b,crc);chunks.push(b);
  }
  if(size!==e.uncompressedSize||crc!==e.crc32)throw Error('压缩包文件损坏：'+e.fileName);
  return Buffer.concat(chunks,size);
}
const optMeta=n=>['manifest.json','modrinth.index.json','mmc-pack.json','version.json'].includes(n);
function versionMeta(m){
  const libs=(m.libraries??[]).map(l=>l.name).join(' '),parts=m.components??[];
  const component=parts.find(p=>['net.minecraftforge','net.fabricmc.fabric-loader','org.quiltmc.quilt-loader','net.neoforged'].includes(p.uid));
  return {version:short(parts.find(p=>p.uid==='net.minecraft')?.version??m.inheritsFrom??m.clientVersion??m.id),
    loader:/neoforge/i.test(libs+' '+component?.uid)?'neoforge':/quilt/i.test(libs+' '+component?.uid)?'quilt':/net\.minecraftforge|net\.forge/.test(libs+' '+component?.uid)?'forge':/net\.fabricmc/.test(libs+' '+component?.uid)?'fabric':'unknown'};
}
export async function folderFiles(root){
  const files=new Map();let count=0;
  async function walk(dir,prefix){
    for(const e of await fs.readdir(dir,{withFileTypes:true})){
      if(++count>100000)throw Error('目录条目过多。');
      const n=prefix+e.name;if(e.isSymbolicLink()||sensitive(n))continue;
      if(e.isDirectory()){if((prefix||roots.includes(n))&&n.split('/').length<32)await walk(path.join(dir,e.name),n+'/');}
      else if(e.isFile()&&(modFile(n)||dataFile(n)||optMeta(n)||n===path.basename(root)+'.json'))files.set(n,path.join(dir,e.name));
    }
  }
  await walk(root,'');return files;
}

export async function inspectPack({file,folder,name,profile,scratch},progress=()=>{}){
  const docs=[],facts=new Map(),manifestMods=new Set(),warnings=new Set(),budget={left:4*1024**3};
  let packName=name||path.basename(folder||file),version=profile?.version||'',loader=profile?.loader||'unknown',release='',format=folder?'folder':'zip',declared=0,docBytes=0,nestedEntries=0;
  const warn=s=>{if(warnings.size<30)warnings.add(s);};
  const add=(n,b,source)=>{try{
    for(const d of staticDocuments(n,b.toString('utf8').replace(/^\uFEFF/,''),source)){d.text=d.text.slice(0,16000);d.title=d.title.slice(0,300);docBytes+=Buffer.byteLength(d.text);docs.push(d);}
  }catch{warn('无法解析 '+source);}
  if(docs.length>60000||docBytes>96*1024**2)throw Error('可索引资料超过上限。');};
  const translations=new Map();let zip,ownScratch;try{
    let files,local=Boolean(folder),prefix='',overrides='';
    if(local){
      if(sensitive((await fs.realpath(folder)).split(path.sep).join('/')+'/'))throw Error('请选择游戏实例目录，不读取存档、日志或私人目录。');
      files=await folderFiles(folder);
    }
    else{
      if((await fs.stat(file)).size>archiveLimit)throw Error('压缩包超过 4 GiB。');
      const signature=archiveSignature(file);
      if(signature==='zip'){zip=await yauzl.openPromise(file,zipOptions);files=await entries(zip,100000);}
      else{
        const dir=scratch??(ownScratch=await fs.mkdtemp(path.join(os.tmpdir(),'together-read-')));
        files=await spoolArchive(file,dir,n=>{
          safe(n);if(sensitive(n))return false;
          const a=n.split('/'),base=a.at(-1);
          return optMeta(base)||base===a.at(-2)+'.json'||a.some((v,i)=>roots.includes(v)&&(modFile(a.slice(i).join('/'))||dataFile(a.slice(i).join('/'))));
        },progress);local=true;format=signature==='unknown'?'tar':signature;
      }
      if(![...files.keys()].some(n=>optMeta(n)||roots.includes(n.split('/')[0]))){
        const instances=new Set([...files.keys()].map(n=>n.match(/^((?:.*\/)?versions\/[^/]+\/)mods\/[^/]+\.jar$/i)?.[1]).filter(Boolean));
        if(instances.size>1)throw Error('压缩包有多个游戏实例，请解压后选择其中一个实例文件夹。');
        const starts=instances.size?instances:new Set([...files.keys()].filter(n=>!sensitive(n)).flatMap(n=>{
          const a=n.split('/'),i=a.findIndex((v,k)=>roots.includes(v)||k===a.length-1&&optMeta(v));return i>0?[a.slice(0,i).join('/')+'/']:[];
        }));if(starts.size===1)prefix=[...starts][0];
      }
      if(prefix)files=new Map([...files].filter(([n])=>n.startsWith(prefix)).map(([n,e])=>[n.slice(prefix.length),e]));
    }
    const bytes=async(n,limit)=>{const e=files.get(n);if(!local)return read(zip,e,limit,budget);
      const size=(await fs.stat(e)).size;budget.left-=size;if(size>limit||budget.left<0)throw Error('文件超过读取上限：'+n);return fs.readFile(e);};
    const manifest=files.has('modrinth.index.json')?'modrinth.index.json':files.has('manifest.json')?'manifest.json':null;
    if(manifest){
      const m=json(await bytes(manifest,4*1024**2));
      if(!Array.isArray(m.files)||m.files.length>20000)throw Error('整合包清单格式无效。');
      packName=short(m.name)||packName;release=short(m.versionId??m.version);declared=m.files.length;
      if(manifest==='modrinth.index.json'){
        if(m.game!=='minecraft'||m.formatVersion!==1)throw Error('不支持这个 Modrinth 清单版本。');
        format='modrinth';overrides='overrides';version=short(m.dependencies?.minecraft);
        loader=Object.keys(m.dependencies??{}).find(k=>['forge','fabric-loader','quilt-loader','neoforge'].includes(k))?.replace('-loader','')??'unknown';
        for(const f of m.files){const p=safe(f.path);if(f.env?.client==='unsupported')continue;if(modFile(p))manifestMods.add(p);if((modFile(p)||dataFile(p))&&/^[a-f0-9]{128}$/i.test(f.hashes?.sha512))facts.set(p,f.hashes.sha512.toLowerCase());}
      }else{
        if(m.manifestType!=='minecraftModpack'||m.manifestVersion!==1)throw Error('不支持这个 CurseForge 清单。');
        format='curseforge';overrides=safe(m.overrides||'overrides');version=short(m.minecraft?.version);
        const loaders=m.minecraft?.modLoaders??[];loader=short((loaders.find(l=>l.primary)||loaders[0])?.id).split('-')[0]||'unknown';
        for(const f of m.files)manifestMods.add(String(f.projectID)+':'+String(f.fileID));
      }
    }else{
      const meta=['mmc-pack.json','version.json',path.basename(folder||prefix.slice(0,-1)||'')+'.json',...[...files.keys()].filter(n=>/^[^/]+\.json$/.test(n)&&!sensitive(n))].find(n=>files.has(n)&&!sensitive(n)&&(/^(mmc-pack|version)\.json$/.test(n)||n===path.basename(folder||prefix.slice(0,-1)||'')+'.json'||/1\.\d+/.test(n)));
      if(meta){const v=versionMeta(json(await bytes(meta,4*1024**2)));version=v.version||version;loader=v.loader!=='unknown'?v.loader:loader;}
    }
    let list=new Map();
    for(const n of files.keys()){
      const rel=overrides?(n.startsWith(overrides+'/')?n.slice(overrides.length+1):''):n;
      if(rel&&(modFile(rel)||dataFile(rel)))list.set(rel,n);
    }
    // Client overrides replace the common file at the same instance-relative path.
    if(format==='modrinth')for(const n of files.keys())if(n.startsWith('client-overrides/')){const p=n.slice(17);if(modFile(p)||dataFile(p))list.set(p,n);}
    if(!manifest&&!list.size)throw Error('没有识别出整合包清单、模组或游戏资料目录。');
    let done=0;for(const [rel,n] of list){
      if(done++%12===0)progress({done,total:list.size});
      if(modFile(rel)){
        let inner;
        try{
          if(local){const h=createHash('sha512');for await(const b of createReadStream(files.get(n))){budget.left-=b.length;if(budget.left<0)throw Error('读取超过上限。');h.update(b);}facts.set(rel,h.digest('hex'));inner=await yauzl.openPromise(files.get(n),zipOptions);}
          else{const b=await bytes(n,512*1024**2);facts.set(rel,digest(b));inner=await yauzl.fromBufferPromise(b,zipOptions);}
          nestedEntries+=inner.entryCount;if(nestedEntries>2000000)throw Error('模组条目总数超过上限。');
          const members=await entries(inner,100000,n=>!sensitive(n)&&(reference(n)||language(n)),n=>warn('忽略重名资料：'+rel+'!/'+n));
          for(const [member,e] of members){
            const src=rel+'!/'+member,limit=language(member)?4*1024**2:1000000;
            if(e.uncompressedSize>limit){warn('资料过大：'+src);continue;}
            if(e.uncompressedSize>budget.left)throw Error('解压资料超过上限。');
            try{
              const raw=await read(inner,e,limit,budget);
              if(language(member)){
                for(const [key,v] of Object.entries(json(raw))){
                  const m=/^(?:item|block)\.([a-z0-9_]+)\.([a-z0-9_.-]+)$/.exec(key);
                  if(m&&typeof v==='string'&&v.length<=160&&translations.size<120000)translations.set(m[1]+':'+m[2],v);
                }
              }else add(rel+'/'+member,raw,src);
            }catch(e){if(budget.left<0||docs.length>60000||docBytes>96*1024**2)throw e;warn('无法解析 '+src);}
          }
        }finally{inner?.close();}
      }else{
        const size=local?(await fs.stat(files.get(n))).size:files.get(n).uncompressedSize;
        if(size>4*1024**2){
          if(size>512*1024**2||size>budget.left)throw Error('配置超过指纹读取上限：'+rel);
          const stream=local?createReadStream(files.get(n)):await zip.openReadStreamPromise(files.get(n));
          const h=createHash('sha512');let crc=0,used=0;for await(const b of stream){budget.left-=b.length;used+=b.length;if(budget.left<0||used>size)throw Error('读取超过上限。');h.update(b);if(!local)crc=crc32(b,crc);}
          if(used!==size||(!local&&crc!==files.get(n).crc32))throw Error('配置读取不完整：'+rel);
          facts.set(rel,h.digest('hex'));if(reference(rel))warn('仅校验指纹，资料文件过大：'+rel);continue;
        }
        const b=await bytes(n,4*1024**2);facts.set(rel,digest(b));if(reference(rel)&&size<=1000000)add(rel,b,rel);
      }
    }
    for(const doc of docs)if(doc.kind==='recipe'){
      let result;try{result=JSON.parse(doc.text).result;}catch{continue;}
      const id=typeof result==='string'?result:result?.id??result?.item,title=translations.get(id);
      if(title)doc.title=title+' · '+id;
    }
    const signatures=Object.fromEntries([...facts].sort(([a],[b])=>a<b?-1:a>b?1:0)),ids=[...manifestMods].sort();
    const key=digest(JSON.stringify([format==='folder'?'zip':format,version,loader,release,ids,signatures]),'sha256');
    const counts={};for(const d of docs)counts[d.kind]=(counts[d.kind]||0)+1;
    return {pack:{id:'archive:'+key,name:short(packName),release,version,loader,format,counts,manifestOnly:Boolean(manifest)&&!list.size,mods:format==='curseforge'?Math.max(ids.length,[...facts.keys()].filter(modFile).length):new Set([...ids,...[...facts.keys()].filter(modFile)]).size,declared,warnings:[...warnings],status:'ready',progress:100},facts:signatures,docs};
  }finally{zip?.close();if(ownScratch)await fs.rm(ownScratch,{recursive:true,force:true});}
}

if(process.send&&process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.once('message',async input=>{
  let reply;try{reply={result:await inspectPack(input,p=>process.send({progress:p}))};}catch(e){reply={error:e.message};}
  process.send(reply,()=>process.disconnect());
});
