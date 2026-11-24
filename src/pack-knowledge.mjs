import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import {normalizeRecipe,materialPlan} from './guide.mjs';

const hash=text=>createHash('sha256').update(text).digest('hex');
const segmenter=new Intl.Segmenter('zh',{granularity:'word'});
export const searchTerms=text=>[...new Set([...segmenter.segment(String(text).toLowerCase())].filter(s=>s.isWordLike).map(s=>s.segment).filter(s=>s.length>1))].slice(0,80);
const textOf=value=>typeof value==='string'?value:Array.isArray(value)?value.map(textOf).filter(Boolean).join('\n'):value&&typeof value==='object'?Object.entries(value).filter(([k])=>!['icon','image','texture','advancement','sortnum'].includes(k)).map(([k,v])=>`${k}: ${textOf(v)}`).join('\n'):String(value??'');

// A bounded data parser, not a script interpreter. FTB Quests uses SNBT compounds/lists.
export function parseSnbt(source) {
  const tokens=source.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}\[\],:]|[^\s{}\[\],:]+/g)??[];
  let p=0;
  function value(depth=0){
    if(depth>40)throw new Error('SNBT nesting too deep');
    const t=tokens[p++];if(t===undefined)throw new Error('Incomplete SNBT');
    if(t==='{'){const out={};while(tokens[p]!=='}'){if(tokens[p]===','){p++;continue;}const key=scalar(tokens[p++]);if(tokens[p++]!==':')throw new Error('Invalid SNBT key');out[key]=value(depth+1);}p++;return out;}
    if(t==='['){const out=[];while(tokens[p]!==']'){if(tokens[p]===','){p++;continue;}out.push(value(depth+1));}p++;return out;}
    return scalar(t);
  }
  function scalar(t){if(t?.startsWith('"'))return JSON.parse(t);if(t?.startsWith("'"))return t.slice(1,-1).replace(/\\'/g,"'");return t;}
  return value();
}

export function staticDocuments(relative,content,source){
  const add=(kind,title,text,priority,quest='')=>({id:'local:'+relative+(quest?':'+quest:''),kind,title,text,priority,quest,source});
  if(relative.endsWith('.snbt')){
    const data=parseSnbt(content);
    return (data.quests??[]).map(q=>add('quest',textOf(q.title??data.title??'任务'),textOf({title:q.title,description:q.description,subtitle:q.subtitle,tasks:q.tasks}),80,String(q.id)));
  }
  if(relative.endsWith('.json')){
    const data=JSON.parse(content);
    if(relative.includes('patchouli_books'))return [add('manual',textOf(data.name??relative),textOf(data),70)];
    if(/\/recipes?\//.test(relative))return [add('recipe',relative,JSON.stringify(data),60)];
  }
  if(relative.endsWith('.js')){
    const declarations=[...content.matchAll(/\.(shaped|shapeless|smelting|blasting|smoking|campfireCooking|stonecutting)\s*\(\s*(['"])([^'"\r\n]+)\2/g)].map(m=>m[1]+': '+m[3]);
    if(declarations.length)return [add('script-reference',path.basename(relative),'KubeJS 静态配方线索，参数和最终配方需要用游戏实际加载数据核对。\n'+declarations.join('\n'),30)];
  }
  return [];
}

export class PackKnowledge {
  constructor(store,emit=()=>{}) {
    this.store=store;this.db=store.db;this.emit=emit;this.jobs=new Map();
    this.db.exec(`CREATE TABLE IF NOT EXISTS companion_packs(id TEXT PRIMARY KEY,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS companion_documents(rowid INTEGER PRIMARY KEY,pack TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,priority INTEGER NOT NULL,quest TEXT NOT NULL,hash TEXT NOT NULL,updated TEXT NOT NULL,UNIQUE(pack,id));
      CREATE VIRTUAL TABLE IF NOT EXISTS companion_search USING fts5(terms,content='');`);
  }
  pack(id){const row=this.db.prepare('SELECT json FROM companion_packs WHERE id=?').get(id);return row?JSON.parse(row.json):null;}
  packs(){return this.db.prepare('SELECT json FROM companion_packs').all().map(r=>JSON.parse(r.json));}
  savePack(pack){this.db.prepare('INSERT OR REPLACE INTO companion_packs VALUES (?,?)').run(pack.id,JSON.stringify(pack));this.emit({type:'knowledge',data:this.status(pack.id)});return pack;}
  status(id){const pack=this.pack(id);if(!pack)return null;return {...pack,documents:this.db.prepare('SELECT count(*) AS n FROM companion_documents WHERE pack=?').get(id).n};}
  put(pack,doc) {
    const title=String(doc.title??doc.id).slice(0,300),text=String(doc.text??'').slice(0,16000),fingerprint=hash(JSON.stringify({...doc,title,text}));
    const old=this.db.prepare('SELECT * FROM companion_documents WHERE pack=? AND id=?').get(pack,String(doc.id));
    if(old?.hash===fingerprint)return false;
    if(old)this.db.prepare("INSERT INTO companion_search(companion_search,rowid,terms) VALUES('delete',?,?)").run(old.rowid,searchTerms(old.title+' '+old.text).join(' '));
    this.db.prepare('INSERT INTO companion_documents(pack,id,kind,title,text,source,priority,quest,hash,updated) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(pack,id) DO UPDATE SET kind=excluded.kind,title=excluded.title,text=excluded.text,source=excluded.source,priority=excluded.priority,quest=excluded.quest,hash=excluded.hash,updated=excluded.updated').run(pack,String(doc.id),doc.kind??'manual',title,text,String(doc.source??''),doc.priority??50,String(doc.quest??''),fingerprint,new Date().toISOString());
    const row=this.db.prepare('SELECT rowid FROM companion_documents WHERE pack=? AND id=?').get(pack,String(doc.id));
    this.db.prepare('INSERT INTO companion_search(rowid,terms) VALUES (?,?)').run(row.rowid,searchTerms(title+' '+text).join(' '));return true;
  }
  remove(pack,id){const old=this.db.prepare('SELECT * FROM companion_documents WHERE pack=? AND id=?').get(pack,id);if(!old)return;this.db.prepare("INSERT INTO companion_search(companion_search,rowid,terms) VALUES('delete',?,?)").run(old.rowid,searchTerms(old.title+' '+old.text).join(' '));this.db.prepare('DELETE FROM companion_documents WHERE rowid=?').run(old.rowid);}
  runtimeKey(pack,world){return `${pack}:world:${hash(world).slice(0,24)}`;}
  plan(pack,world,inventory,item,count,recipeId){const key=this.runtimeKey(pack,world);if(!this.store.get('runtime-ready:'+key))throw new Error('当前世界的实际配方还在同步，请稍后再试。');const recipes=this.db.prepare("SELECT text FROM companion_documents WHERE pack=? AND kind='recipe'").all(key).map(normalizeRecipe).filter(Boolean);return materialPlan(recipes,inventory,item,count,recipeId);}
  search(pack,query,{unlocked=[],spoilers=false,limit=8,world,staticOnly=false,withoutRecipes=false}={}) {
    if(world){
      const options={unlocked,spoilers,limit},key=this.runtimeKey(pack,world),ready=this.store.get('runtime-ready:'+key);
      const staticOptions={...options,staticOnly:true,withoutRecipes:Boolean(ready)},archive=this.store.get('pack-binding:'+pack),local=this.search(pack,query,staticOptions);
      const extra=archive?this.search(archive,query,staticOptions).map(d=>({...d,source:'导入包资料：'+d.source})):[];
      const docs=[...(ready?this.search(key,query,options):[]),...local,...extra];
      return [...new Map(docs.map(d=>[d.source+'\n'+d.title,d])).values()].slice(0,limit);
    }
    const terms=searchTerms(query).slice(0,40);if(!terms.length)return [];
    const match=terms.map(t=>'"'+t.replaceAll('"','""')+'"').join(' OR ');
    const select='SELECT d.*,bm25(companion_search) AS relevance FROM companion_search JOIN companion_documents d ON d.rowid=companion_search.rowid WHERE companion_search MATCH ? AND d.pack=?'+(withoutRecipes?" AND d.kind NOT IN ('recipe','script-reference')":'')+(staticOnly?" AND d.id NOT LIKE 'runtime:%'":'');
    const candidates=this.db.prepare(select+' ORDER BY relevance LIMIT 120').all(match,pack);
    // Long ingredient lists rank below short item names in BM25. Reserve candidates for actual recipes.
    const recipes=withoutRecipes?[]:this.db.prepare(select+" AND d.kind='recipe' ORDER BY relevance LIMIT 80").all(match,pack);
    const rows=[...new Map([...candidates,...recipes].map(d=>[d.id,d])).values()];
    const allowed=new Set(unlocked.map(String));
    const score=d=>terms.filter(t=>(d.title+' '+d.text).toLowerCase().includes(t)).length*100+d.priority+(d.kind==='recipe'?25:0);
    return rows.filter(d=>(!staticOnly||!d.id.startsWith('runtime:'))&&(!d.quest||spoilers||allowed.has(d.quest))).sort((a,b)=>score(b)-score(a)).slice(0,limit).map(({title,text,source,kind,quest,updated})=>({title,text,source,kind,quest,updated}));
  }
  ingest(pack,documents,{finished=false,begin=false,world}={}) {
    if(world){const result=this.ingest(this.runtimeKey(pack,world),documents,{finished,begin});const key=this.runtimeKey(pack,world);if(begin)this.store.set('runtime-ready:'+key,false);if(finished){this.store.set('runtime-ready:'+key,true);this.store.set('runtime-fingerprint:'+key,hash(JSON.stringify(this.db.prepare('SELECT id,hash FROM companion_documents WHERE pack=? ORDER BY id').all(key))));}const p=this.pack(pack);if(p){p.runtime=finished?'ready':'indexing';this.savePack(p);}return result;}
    if(!Array.isArray(documents)||documents.length>150)throw new Error('资料分批最多 150 条。');
    this.db.exec('BEGIN');
    try{
    if(begin)for(const old of this.db.prepare("SELECT id FROM companion_documents WHERE pack=? AND id LIKE 'runtime:%'").all(pack))this.remove(pack,old.id);
    let changed=0;
    for(const d of documents){if(!d||typeof d.id!=='string'||d.id.length>300||!['item','block','recipe','coverage'].includes(d.kind))throw new Error('游戏资料格式无效。');changed+=Number(this.put(pack,{...d,id:'runtime:'+d.id,priority:100,source:'当前游戏已加载数据',quest:''}));}
    const p=this.pack(pack);if(p){p.runtime=finished?'ready':'indexing';p.runtimeUpdated=new Date().toISOString();this.savePack(p);}this.db.exec('COMMIT');return {changed};
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
  cancel(id){this.jobs.get(id)?.abort();const p=this.pack(id);if(p){p.status='cancelled';this.savePack(p);}}
  async scan(profile,{force=false}={}) {
    const root=path.resolve(profile.gameDir),mods=[];
    for(const f of (await fs.readdir(path.join(root,'mods')).catch(()=>[])).filter(f=>f.endsWith('.jar')).sort()){const s=await fs.stat(path.join(root,'mods',f));mods.push({file:f,size:s.size,mtime:s.mtimeMs});}
    // Stable profile identity across worlds; all source hashes are updated within it.
    const id=profile.id, fingerprint=hash(JSON.stringify(mods)),previous=this.pack(id);
    this.jobs.get(id)?.abort();const controller=new AbortController();this.jobs.set(id,controller);
    const pack={id,name:profile.name,loader:profile.loader,version:'1.20.1',fingerprint,status:'indexing',progress:0,mods:mods.length,roots:[],warnings:[],runtime:previous?.runtime??'waiting',overview:previous?.fingerprint===fingerprint?previous.overview:null,overviewRequests:previous?.fingerprint===fingerprint?(previous.overviewRequests??0):0,updated:new Date().toISOString()};
    this.savePack(pack);const seen=new Set(),roots=new Set(profile.sources??[]);let total=0;
    const add=doc=>{if(++total>60000)throw new Error('整合包资料超过 60000 条，请缩小资料范围。');seen.add(doc.id);this.put(id,doc);};
    const extract=(relative,content,source)=>{
      if(content.length>1_000_000)return;
      try{
        for(const doc of staticDocuments(relative,content,source))add(doc);
      }catch{pack.warnings.push(`无法完整解析 ${relative}`);}
    };
    try{
      for(let i=0;i<mods.length;i++) {
        if(controller.signal.aborted)throw new Error('整理已取消。');
        const mod=mods[i],buffer=await fs.readFile(path.join(root,'mods',mod.file));
        const files=unzipSync(buffer,{filter:f=>f.originalSize<=1_000_000&&(f.name==='fabric.mod.json'||f.name==='META-INF/mods.toml'||/patchouli_books\/.*\.json$/.test(f.name))});
        // Commit a mod's local documents together, keeping disk sync off the per-entry path.
        this.db.exec('BEGIN');try{for(const [name,bytes] of Object.entries(files)){
          const content=Buffer.from(bytes).toString('utf8');
          if(name==='fabric.mod.json'){try{const meta=JSON.parse(content);for(const u of Object.values(meta.contact??{}))if(typeof u==='string'&&u.startsWith('https://'))roots.add(u);add({id:`mod:${mod.file}`,kind:'mod',title:meta.name??meta.id,text:`${meta.id} ${meta.version}\n${meta.description??''}`,source:mod.file,priority:50});}catch{}}
          else if(name==='META-INF/mods.toml'){for(const m of content.matchAll(/(?:displayURL|issueTrackerURL)\s*=\s*["'](https:\/\/[^"']+)["']/g))roots.add(m[1]);add({id:`mod:${mod.file}`,kind:'mod',title:mod.file,text:content.slice(0,10000),source:mod.file,priority:50});}
          else extract(`${mod.file}/${name}`,content,`${mod.file}!/${name}`);
        }this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
        pack.progress=Math.round((i+1)/Math.max(1,mods.length)*75);if(i%10===0)this.savePack(pack);await new Promise(r=>setImmediate(r));
      }
      const walk=async(dir,relative='')=>{for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){if(controller.signal.aborted)throw new Error('整理已取消。');if(entry.isSymbolicLink())continue;const full=path.join(dir,entry.name),rel=(relative+'/'+entry.name).replace(/^\//,'');if(entry.isDirectory())await walk(full,rel);else if(/\.(json|snbt|js)$/.test(entry.name)){const stat=await fs.stat(full);if(stat.size<=1_000_000)extract(rel,await fs.readFile(full,'utf8'),path.relative(root,full).replaceAll('\\','/'));}}};
      for(const rel of ['config/ftbquests/quests','patchouli_books','kubejs/server_scripts','kubejs/startup_scripts','kubejs/data','moonlight-global-datapacks'])await walk(path.join(root,rel),rel);
      for(const old of this.db.prepare("SELECT id FROM companion_documents WHERE pack=? AND id NOT LIKE 'runtime:%'").all(id))if(!seen.has(old.id))this.remove(id,old.id);
      pack.fingerprint=hash(fingerprint+JSON.stringify(this.db.prepare("SELECT id,hash FROM companion_documents WHERE pack=? AND id NOT LIKE 'runtime:%' ORDER BY id").all(id)));
      pack.overview=previous?.fingerprint===pack.fingerprint?previous.overview:null;pack.overviewRequests=previous?.fingerprint===pack.fingerprint?(previous.overviewRequests??0):0;
      pack.roots=[...roots].filter(u=>{try{return new URL(u).protocol==='https:';}catch{return false;}}).slice(0,300);pack.progress=100;pack.status='ready';pack.warnings=[...new Set(pack.warnings)].slice(0,30);pack.coverage='基础文本与常见配方；特殊机器参数、隐藏机制需按资料单独核实。';if(this.jobs.get(id)===controller)this.savePack(pack);
      return pack;
    }catch(e){pack.status=controller.signal.aborted?'cancelled':'error';pack.error=e.message;if(this.jobs.get(id)===controller)this.savePack(pack);return pack;}
    finally{if(this.jobs.get(id)===controller)this.jobs.delete(id);}
  }
  close(){for(const c of this.jobs.values())c.abort();}
}
