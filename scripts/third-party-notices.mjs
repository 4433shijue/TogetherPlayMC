import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from '../src/paths.mjs';

// Read package metadata and preserve license notices without executing packages.
const packages=[];
async function scan(directory){
 for(const entry of await fs.readdir(directory,{withFileTypes:true})){
  if(!entry.isDirectory()||entry.name.startsWith('.'))continue;
  const folder=path.join(directory,entry.name);
  if(entry.name.startsWith('@')){await scan(folder);continue;}
  try{const p=JSON.parse(await fs.readFile(path.join(folder,'package.json'),'utf8'));if(p.name&&p.version)packages.push({name:p.name,version:p.version,license:p.license??p.licenses??'See upstream',repository:typeof p.repository==='string'?p.repository:p.repository?.url,folder});}catch(e){if(e.code!=='ENOENT')throw e;}
  try{await scan(path.join(folder,'node_modules'));}catch(e){if(e.code!=='ENOENT')throw e;}
 }
}
await scan(path.join(root,'node_modules'));
const seen=new Set(),rows=[];
for(const p of packages.sort((a,b)=>a.name.localeCompare(b.name)||a.version.localeCompare(b.version))){
 const id=p.name+'@'+p.version;if(seen.has(id))continue;seen.add(id);
 const directory='third-party-licenses/npm/'+p.name.replaceAll('/','__')+'-'+p.version;
 const names=(await fs.readdir(p.folder)).filter(n=>/^(?:licen[cs]e|copying|notice)(?:$|[.\-_])/i.test(n));
 for(const name of names){const from=path.join(p.folder,name);if(!(await fs.stat(from)).isFile())continue;await fs.mkdir(path.join(root,directory),{recursive:true});await fs.copyFile(from,path.join(root,directory,name));}
 const license=typeof p.license==='string'?p.license:JSON.stringify(p.license);
 let source=p.repository?.replace(/^git\+/, '').replace(/^git:\/\//,'https://').replace(/^ssh:\/\/git@github.com[/:]/,'https://github.com/').replace(/^git@github.com:/,'https://github.com/').replace(/^github:/,'https://github.com/').replace(/\.git$/,'');
 if(source&&/^[\w.-]+\/[\w.-]+$/.test(source))source='https://github.com/'+source;
 if(!source?.startsWith('https://'))source='https://www.npmjs.com/package/'+p.name;
 rows.push('| '+p.name+' | '+p.version+' | '+license.replaceAll('|',' / ')+' | [上游]('+source+') | '+(names.length?'[随附许可]('+directory+'/)':'见包内声明与上游')+' |');
}
const intro=`# Third-party notices

本清单来自安装的依赖元数据，完整版本与依赖关系见 package-lock.json。第一方声明不替代第三方许可证。

直接依赖、模型、加载器和《元素觉醒》的用途与致谢见 [CREDITS.md](CREDITS.md)。第三方模型固定 revision 和文件哈希位于发行包 runtime/models 内的 model-manifest.json。

## 随包许可证

- Node.js 24.19.0：[官方完整声明](third-party-licenses/Node-LICENSE.txt)，包含 Node 内部依赖声明。
- Electron 45.2.1：发行根目录 LICENSE 与 LICENSES.chromium.html 保留上游原文。
- Fabric API 0.92.2+1.20.1：[许可证](third-party-licenses/Fabric-API-LICENSE.txt)，JAR 内声明也保留；Forge 和 Fabric Loader 属于用户提供的游戏运行环境。
- Transformers.js 与量化多语言 MiniLM：Apache-2.0；依赖许可、模型卡和模型 LICENSE 随包保留。
- sharp 0.34.5 与 libvips 8.17.3：见下方 LGPL 组件说明及 npm 包内 README、LICENSE、versions.json。

## LGPL 组件的来源与替换

Windows 包保留未修改的 @img/sharp-win32-x64/lib/libvips-42.dll 与 libvips-cpp-8.17.3.dll，使用动态库机制。用户可替换为 ABI 兼容的修改版本；不限制为调试这类修改进行的逆向工程。重建与版本清单见包内 versions.json 及上游构建资料。

- [LGPL-3.0 全文](third-party-licenses/LGPL-3.0.txt) 和 [GPL-3.0 全文](third-party-licenses/GPL-3.0.txt)。
- [sharp v0.34.5 源码](https://github.com/lovell/sharp/tree/v0.34.5)。
- [libvips v8.17.3 源码](https://github.com/libvips/libvips/tree/v8.17.3)。
- [Windows 构建发布与源码材料](https://github.com/libvips/build-win64-mxe/releases/tag/v8.17.3)及[构建工程](https://github.com/libvips/build-win64-mxe)。
- [sharp-libvips 打包工程与依赖许可](https://github.com/lovell/sharp-libvips)。原 npm 包内 README 的逐库列表和 versions.json 已随包保留。

## npm 依赖

| 项目 | 版本 | 上游声明的许可 | 来源 | 原文 |
| --- | --- | --- | --- | --- |
`;
await fs.writeFile(path.join(root,'THIRD_PARTY_NOTICES.md'),intro+rows.join('\n')+'\n');
console.log(JSON.stringify({packages:seen.size,notices:'THIRD_PARTY_NOTICES.md'}));
