import fs from 'node:fs/promises';
import sync from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createApp} from '../src/server.mjs';
import {rulesAllow} from '../src/paths.mjs';
import {offlineUuid} from '../src/launch.mjs';
import {createPracticeWorld} from '../src/practice-world.mjs';
import {installProfile} from '../src/companion-install.mjs';
import {Store} from '../src/store.mjs';
import {unzipSync} from 'fflate';
const qa=path.resolve('runtime/qa-cobble1211'),game=path.join(qa,'game'),assets=path.join(qa,'launcher/assets'),libs=path.join(qa,'launcher/libraries');
const dir=await fs.mkdtemp(path.resolve('work/cobble-live-')),meta=JSON.parse(await fs.readFile(path.join(qa,'metadata.json'),'utf8'));
const profile={id:'qa-cobble',name:'Cobblemon QA',version:'1.21.1',loader:'fabric',gameDir:game},owner='TogetherHost';
const store=new Store(dir);store.set('provider',{protocol:'openai',url:'http://127.0.0.1:1',model:'offline acceptance',toolMode:'native'});store.saveRole({...store.roles()[0],chatter:'quiet'});store.close();
const model=async(_c,input)=>{
 const last=input.messages.at(-1);
 if(last.role==='tool'){const result=JSON.parse(last.content);console.log('GIFT_TOOL',result);return {content:result.error??('游戏回执 '+result.status),calls:[]};}
 if(!input.tools.some(t=>(t.name??t.function?.name)==='offer_gift'))return {content:'当前不能送礼。',calls:[]};
 return {content:'',calls:[{id:'cg-1',name:'offer_gift',arguments:{itemId:'cobblemon:poke_ball',count:3,intent:'requested'}}]};
};model.contextSource='fixture';
const app=await createApp({port:0,directory:dir,companionProfiles:[profile],companionRequest:model});
try{
const build=path.resolve('companion-mod/fabric1211/build/libs'),name='together-companion-fabric-1.21.1-0.6.0';
await installProfile(app.companion.profiles[0],{directory:dir,endpoint:app.url,dist:build});await fs.copyFile(path.join(build,name+'-live-test.jar'),path.join(game,'mods/together-live-probe.jar'));
await fs.writeFile(path.join(game,'options.txt'),'lang:zh_cn\nfullscreen:false\npauseOnLostFocus:false\nrenderDistance:5\nsimulationDistance:5\nmaxFps:45\nsoundCategory_master:0.0\n');
const world=await createPracticeWorld(game),classpath=[],native=path.join(dir,'natives');await fs.mkdir(native);
for(const l of meta.libraries){if(!rulesAllow(l.rules))continue;const [g,n,v,c]=l.name.split(':'),rel=l.downloads?.artifact?.path??g.replaceAll('.','/')+'/'+n+'/'+v+'/'+n+'-'+v+(c?'-'+c:'')+'.jar';if(!/^[\w./+\-]+$/.test(rel)||rel.includes('..'))throw Error('library path');
 const file=path.join(libs,rel);await fs.access(file);classpath.push(file);
 if(rel.endsWith('natives-windows.jar')){const files=unzipSync(await fs.readFile(file),{filter:e=>/\.dll$/i.test(e.name)});for(const [n,b] of Object.entries(files))await fs.writeFile(path.join(native,path.basename(n)),b);}
}
const client=path.join(qa,'client.jar');if(meta.downloads?.client?.sha1&&createHash('sha1').update(await fs.readFile(client)).digest('hex')!==meta.downloads.client.sha1)throw Error('official client hash mismatch');
classpath.push(client);
const args=['-Xms512M','-Xmx5G','-XX:+UseG1GC','-Dfile.encoding=UTF-8','-Dtogether.qa=true','-Dtogether.liveTest=true','-Djava.library.path='+native,'-cp',classpath.join(';'),'net.fabricmc.loader.impl.launch.knot.KnotClient','--username',owner,'--version','1.21.1','--gameDir',game,'--assetsDir',assets,'--assetIndex','17','--uuid',offlineUuid(owner),'--accessToken','0','--userType','mojang','--versionType','release','--width','960','--height','560','--quickPlaySingleplayer',world.name];
const argfile=path.join(dir,'args.txt');await fs.writeFile(argfile,args.map(a=>'"'+a.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"').join('\n'));
const logfile=path.join(dir,'game.log'),fd=sync.openSync(logfile,'a'),child=spawn(path.join(process.env.JAVA21_HOME||process.env.JAVA_HOME,'bin/javaw.exe'),['@'+argfile],{cwd:game,windowsHide:true,stdio:['ignore',fd,fd]});sync.closeSync(fd);
console.log('START',child.pid,dir,app.url,world.name);let baseline,configured=false,success=false,closing=false,recipe;
function stop(){if(closing)return;closing=true;spawn('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue;if($p){$null=$p.CloseMainWindow()}`],{windowsHide:true,stdio:'ignore'}).unref();setTimeout(()=>{if(child.exitCode===null)child.kill();},18000).unref();}
const timer=setInterval(async()=>{try{const c=app.companion.chat,k=app.companion.knowledge;if(!c.observation?.giftBridge)return;
 const qty=c.observation.inventory.filter(i=>i.id==='cobblemon:poke_ball').reduce((a,i)=>a+i.count,0);if(!configured){baseline=qty;c.gifts.configure('role');configured=true;console.log('WORLD',c.world,'BASELINE',qty);}
 if(!recipe&&k.store.get('runtime-ready:'+k.runtimeKey(profile.id,c.world))){const recipes=k.db.prepare("SELECT text,source FROM companion_documents WHERE pack=? AND id=?").all(k.runtimeKey(profile.id,c.world),'runtime:recipe:cobblemon:poke_ball');if(recipes.length){recipe=JSON.parse(recipes[0].text);console.log('ACTUAL_RECIPE',recipe.id,recipe.result,recipes[0].source);}}
 const receipt=app.store.db.prepare("SELECT json FROM events WHERE type='gift_receipt' ORDER BY id DESC LIMIT 1").get();
 if(recipe&&receipt&&qty===baseline+3&&!closing){const last=JSON.parse(receipt.json);const log=await fs.readFile(logfile,'utf8'),move=log.match(/LIVE_FOLLOW player=([\d.]+) orb=([\d.]+) distance=([\d.]+)/);
 const turn=log.match(/LIVE_TURN orb=([\d.]+) player=([\d.]+)/);
 success=last.status==='dropped'&&last.itemId==='cobblemon:poke_ball'&&+move?.[1]>4&&+move?.[2]>2&&+move?.[3]<8&&+turn?.[1]<.1&&+turn?.[2]<.1&&log.includes('LIVE_NATIVE_CHAT_SENT');console.log('AUDIT',JSON.stringify({success,qty,baseline,last,move:move?.[0],turn:turn?.[0]}));stop();}}
 catch(e){console.error(e);stop();}},1700);
const limit=setTimeout(()=>{console.log('TIMEOUT');stop();},15*60000);
await new Promise(resolve=>child.once('exit',resolve));clearInterval(timer);clearTimeout(limit);console.log('GAME_CLOSED',success);if(!success)process.exitCode=1;
}finally{await app.close();}
