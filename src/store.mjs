import {summarizeUsage} from './provider-usage.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { retrieveMemories } from './memory.mjs';
import { validateAppearance,defaultAppearance } from './appearance.mjs';
import {RequestContext} from './request-context.mjs';
import {validatePersonality} from './personality.mjs';

export const defaultRole = () => ({ id: randomUUID(), name: '小伴', persona: '温柔、好奇的男性伙伴。愿意一起生活和冒险，有自己的想法，坦诚承认不知道的事。', relationship: '一起玩 Minecraft 的朋友', style: '自然中文，短句，不刷屏', examples: '', greeting: '我来啦，今天想一起做什么？', autonomy: 'balanced', chatter: 'natural', radius: 64, book: [], extensions: {} });
export function validateRole(input, previous) {
  const out = { ...(previous ?? defaultRole()) };
  for (const k of ['name','persona','relationship','style','examples','greeting']) {
    if (input[k] !== undefined) out[k] = String(input[k]).slice(0, k === 'name' ? 80 : 16000);
  }
  if (!out.name.trim()) throw new Error('请填写角色名字。');
  for (const [key, allowed] of [['autonomy',['close','balanced','free']],['chatter',['quiet','natural','chatty']]]) {
    if (input[key] !== undefined && !allowed.includes(input[key])) throw new Error(`无效角色设置：${key}`);
    if (input[key] !== undefined) out[key] = input[key];
  }
  if (input.radius !== undefined) {
    if (!Number.isInteger(Number(input.radius)) || input.radius < 8 || input.radius > 256) throw new Error('活动半径应为 8–256 格。');
    out.radius = Number(input.radius);
  }
  if(input.followDistance!==undefined){if(!Number.isInteger(Number(input.followDistance))||input.followDistance<2||input.followDistance>6)throw new Error('跟随距离应为 2–6 格。');out.followDistance=Number(input.followDistance);}
  out.followDistance??=3;
  out.personality=validatePersonality(input.personality,out.personality);
  out.appearance=validateAppearance(input.appearance===undefined?out.appearance:{...out.appearance,...input.appearance});
  if(input.guideLevel!==undefined&&!['hint','next','full'].includes(input.guideLevel))throw new Error('攻略档位无效。');
  out.guideLevel=input.guideLevel??out.guideLevel??'hint';
  if (Array.isArray(input.book)) out.book = input.book.slice(0,100).map(e=>({ keys: (e.keys ?? []).map(String).slice(0,20), content: String(e.content ?? '').slice(0,8000), enabled: e.enabled !== false, constant: Boolean(e.constant) }));
  if (input.extensions && typeof input.extensions === 'object') out.extensions = input.extensions;
  out.gameName ??= `TP${out.id.replaceAll('-','').slice(0,12)}`;
  return out;
}

// Secrets travel over stdin, never through process arguments or a temporary plaintext file.
export function protectSecret(value, decrypt = false) {
  if (process.platform !== 'win32') throw new Error('此版本的密钥保存使用 Windows DPAPI。');
  const operation = decrypt ? 'Unprotect' : 'Protect';
  const script = `Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[System.Security.Cryptography.ProtectedData]::${operation}($b,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let result=''; child.stdout.on('data',x=>result+=x); child.stderr.resume();
    child.on('error',reject); child.on('exit',code=>code===0 ? resolve(decrypt ? Buffer.from(result.trim(),'base64').toString('utf8') : result.trim()) : reject(new Error('Windows 密钥加密/解密失败，请用保存密钥的 Windows 账户启动。')));
    child.stdin.end(decrypt ? value : Buffer.from(value).toString('base64'));
  });
}

export class Store {
  constructor(directory) {
    mkdirSync(directory,{recursive:true}); this.directory=directory;
    this.db=new DatabaseSync(path.join(directory,'together.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS roles (id TEXT PRIMARY KEY,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,kind TEXT NOT NULL,text TEXT NOT NULL,source TEXT NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT,time TEXT NOT NULL,role TEXT,world TEXT,type TEXT NOT NULL,json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY,role TEXT,world TEXT,status TEXT,json TEXT,updated TEXT);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY,role TEXT NOT NULL,world TEXT NOT NULL,dimension TEXT NOT NULL,status TEXT NOT NULL,json TEXT NOT NULL,updated TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS plan_scope ON plans(role,world,dimension,updated);
      CREATE INDEX IF NOT EXISTS memory_scope ON memories(role,world);
      CREATE INDEX IF NOT EXISTS event_scope ON events(role,world,id);`);
    if(!this.db.prepare('PRAGMA table_info(memories)').all().some(c=>c.name==='dimension'))this.db.exec("ALTER TABLE memories ADD COLUMN dimension TEXT NOT NULL DEFAULT ''");
    // Idempotent in-place appearance upgrade; no schema or role identity changes.
    const animalDefaults=defaultAppearance();
    for(const row of this.db.prepare('SELECT id,json FROM roles').all()){
      const role=JSON.parse(row.json),appearance={...(role.appearance??{})};let changed=false;
      for(const key of ['dogBreed','coatPattern','muzzleColor','innerEarColor','noseColor','markingColor','markingColor2'])if(appearance[key]===undefined){appearance[key]=animalDefaults[key];changed=true;}
      if(changed){role.appearance=appearance;this.db.prepare('UPDATE roles SET json=? WHERE id=?').run(JSON.stringify(role),row.id);}
    }
    if (!this.roles().length) this.saveRole({});
    // Interrupted work is recorded, never silently resumed against a different world.
    this.db.prepare("UPDATE tasks SET status='interrupted' WHERE status='running'").run();
    this.db.prepare("UPDATE plans SET status='interrupted' WHERE status='running'").run();
    this.context=new RequestContext(this);
  }
  close(){this.db.close();}
  get(key,fallback=null){const r=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key);return r?JSON.parse(r.value):fallback;}
  set(key,value){this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key,JSON.stringify(value));return value;}
  roles(){return this.db.prepare('SELECT json FROM roles ORDER BY rowid').all().map(x=>JSON.parse(x.json));}
  role(id){return this.roles().find(x=>x.id===id);}
  saveRole(input){const prev=input.id?this.role(input.id):undefined;if(input.id&&!prev)throw new Error('角色不存在。');const role=validateRole(input,prev);this.db.prepare('INSERT OR REPLACE INTO roles VALUES (?,?)').run(role.id,JSON.stringify(role));return role;}
  memory(role,world,kind,text,source='user',id=randomUUID(),dimension=''){
    if(!this.role(role)||!['fact','home','meeting','place','experience','protection'].includes(kind))throw new Error('记忆类别或角色无效。');
    if(typeof text!=='string'||!text.trim()||text.length>12000)throw new Error('记忆需要 1–12000 字符。');
    const previous=this.db.prepare('SELECT * FROM memories WHERE id=?').get(id);
    if(previous&&previous.role!==role)throw Error('不能修改其他伙伴的记忆。');
    if(previous&&previous.text!==text){const versions=this.get('memoryRevisions:'+id,[]);this.set('memoryRevisions:'+id,[{text:previous.text,source:previous.source,created:previous.created,evidence:this.get('memoryEvidence:'+id,{}),changed:new Date().toISOString()},...versions].slice(0,30));}
    this.db.prepare('INSERT OR REPLACE INTO memories (id,role,world,kind,text,source,created,dimension) VALUES (?,?,?,?,?,?,?,?)').run(id,role,world,kind,text,source,new Date().toISOString(),world?dimension:'');return id;
  }
  memories(role,world){return world===undefined?this.db.prepare('SELECT * FROM memories WHERE role=? ORDER BY created DESC').all(role):this.db.prepare("SELECT * FROM memories WHERE role=? AND (world='' OR world=?) ORDER BY created DESC").all(role,world);}
  relevantMemories(role,world,dimension,query,selective=false){const rows=this.db.prepare("SELECT * FROM memories WHERE role=? AND (world='' OR world=?) ORDER BY created DESC").all(role,world);return retrieveMemories(rows.filter(m=>this.get('memoryMeta:'+m.id,{status:'active'}).status==='active'),{world,dimension,query,selective});}
  deleteMemory(id){if(this.db.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_vectors'").get())this.db.prepare('DELETE FROM memory_vectors WHERE id=?').run('m:'+id);this.db.prepare('DELETE FROM memories WHERE id=?').run(id);for(const prefix of ['memoryEvidence:','memoryMeta:','memoryRevisions:'])this.db.prepare('DELETE FROM settings WHERE key=?').run(prefix+id);}
  event(type,data,role='',world=''){const event={time:new Date().toISOString(),type,data,role,world};this.db.prepare('INSERT INTO events(time,role,world,type,json) VALUES (?,?,?,?,?)').run(event.time,role,world,type,JSON.stringify(data));return event;}
  events(limit=100,role=null,world=null){return this.db.prepare('SELECT * FROM events WHERE (? IS NULL OR role=?) AND (? IS NULL OR world=?) ORDER BY id DESC LIMIT ?').all(role,role,world,world,limit).reverse().map(x=>({...x,data:JSON.parse(x.json),json:undefined}));}
  conversation(role,world=null){return this.db.prepare("SELECT * FROM events WHERE role=? AND (? IS NULL OR world=?) AND type IN ('reply','owner_chat') ORDER BY id DESC LIMIT 40").all(role,world,world).reverse().map(x=>({...x,data:JSON.parse(x.json),json:undefined}));}
  task(id,role,world,status,data){this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?,?,?,?,?,?)').run(id,role,world,status,JSON.stringify(data),new Date().toISOString());}
  tasks(role,world){return this.db.prepare('SELECT * FROM tasks WHERE role=? AND world=? ORDER BY updated DESC LIMIT 30').all(role,world).map(x=>({...x,data:JSON.parse(x.json),json:undefined}));}
  savePlan(p){this.db.prepare('INSERT OR REPLACE INTO plans VALUES (?,?,?,?,?,?,?)').run(p.id,p.role,p.world,p.dimension,p.status,JSON.stringify(p),p.updated);}
  plans(role,world,dimension){return this.db.prepare('SELECT * FROM plans WHERE role=? AND world=? AND dimension=? ORDER BY updated DESC LIMIT 50').all(role,world,dimension).map(p=>({...JSON.parse(p.json),status:p.status}));}
 usage(){return summarizeUsage(this.db.prepare("SELECT json FROM events WHERE type='usage'").all().map(x=>JSON.parse(x.json)));}
}
