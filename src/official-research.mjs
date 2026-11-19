import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';

export function publicAddress(ip) {
  if(net.isIPv4(ip)) {
    const [a,b]=ip.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127||a===198&&[18,19].includes(b));
  }
  if(net.isIPv6(ip))return /^2[0-9a-f]{3}:/i.test(ip)&&!/^2001:(?:0:|db8:)/i.test(ip);
  return false;
}
export function officialURL(value,roots) {
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.hostname==='localhost')throw new Error('资料仅允许公开 HTTPS 页面。');
  if(!roots.some(root=>{try{const r=new URL(root);return u.origin===r.origin&&(r.hostname==='github.com'?u.pathname===r.pathname.replace(/\/$/,'')||u.pathname.startsWith(r.pathname.replace(/\/$/,'')+'/'):true);}catch{return false;}}))throw new Error('此地址不在本整合包的资料来源中。');
  u.hash='';return u;
}
// DNS answers are checked and pinned for the connection, including every redirect.
export async function downloadOfficial(value,roots,signal,redirects=0) {
  const url=officialURL(value,roots);
  const addresses=await dns.lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('资料地址指向非公开网络，已拒绝访问。');
  const address=addresses[0];
  const result=await new Promise((resolve,reject)=>{
    const request=https.get(url,{signal,timeout:12000,headers:{'user-agent':'TogetherPlayMC/0.5 (local companion documentation reader)','accept':'text/html,text/plain,application/json'},lookup:(_host,_opts,cb)=>cb(null,address.address,address.family)},response=>{
      if([301,302,303,307,308].includes(response.statusCode)){response.resume();resolve({redirect:new URL(response.headers.location,url).href});return;}
      if(response.statusCode!==200){response.resume();reject(new Error(`资料页面返回 HTTP ${response.statusCode}`));return;}
      const type=String(response.headers['content-type']??'');
      if(!/text\/(?:html|plain)|application\/json/.test(type)){response.resume();reject(new Error('资料不是可读取的文字页面。'));return;}
      const chunks=[];let size=0;
      response.on('data',chunk=>{size+=chunk.length;if(size>1_000_000){response.destroy(new Error('资料页面超过 1 MB。'));return;}chunks.push(chunk);});
      response.on('error',reject);response.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),url:url.href}));
    });
    request.on('timeout',()=>request.destroy(new Error('资料页面连接超时。')));request.on('error',reject);
  });
  if(result.redirect){if(redirects>=3)throw new Error('资料重定向次数过多。');return downloadOfficial(result.redirect,roots,signal,redirects+1);}
  const links=[];for(const match of result.body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    try{const link=officialURL(new URL(match[1].replaceAll('&amp;','&'),result.url).href,roots);if(links.length<40&&!links.some(l=>l.url===link.href))links.push({url:link.href,label:match[2].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,120)});}catch{}
  }
  const text=result.body.replace(/<(script|style|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim().slice(0,24000);
  return {url:result.url,text,links};
}

export class OfficialResearch {
  constructor(store,{download=downloadOfficial,now=Date.now}={}){this.store=store;this.download=download;this.now=now;}
  budget(){return {pages:0};}
  async read(pack,url,roots,budget,signal) {
    const approved=officialURL(url,roots).href;
    const key=`official:${pack}:${approved}`,cached=this.store.get(key);
    if(cached&&this.now()-cached.fetched<7*86400000)return {...cached,cached:true};
    if(budget.pages>=3)throw new Error('本次对话已经查阅 3 个官方页面。');
    budget.pages++;
    const result=await this.download(approved,roots,signal);
    const value={...result,fetched:this.now(),versionVerified:false};
    if(signal?.aborted)throw signal.reason;
    this.store.set(key,value);return value;
  }
}
