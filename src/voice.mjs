import {spawn} from 'node:child_process';
import path from 'node:path';
import {root} from './paths.mjs';

const defaults={inputEnabled:false,outputEnabled:false,spatial:true,voice:'',volume:75,rate:0};
export function validateVoice(input,current=defaults){
  const value={...defaults,...current};
  for(const key of ['inputEnabled','outputEnabled','spatial'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')throw Error('语音开关无效。');value[key]=input[key];}
  for(const [key,min,max] of [['volume',0,100],['rate',-4,4]])if(input[key]!==undefined){if(!Number.isInteger(input[key])||input[key]<min||input[key]>max)throw Error('语音音量或语速超出范围。');value[key]=input[key];}
  if(input.voice!==undefined){if(typeof input.voice!=='string'||input.voice.length>160)throw Error('声音名称无效。');value.voice=input.voice;}
  return value;
}
export function validateRecording(data){
  if(typeof data!=='string'||data.length>1_400_000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw Error('录音无效或超过 20 秒。');
  const b=Buffer.from(data,'base64');
  if(b.length<44||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WAVE')throw Error('录音需要 WAV 格式。');
  let format=false,audio=0;
  for(let i=12;i+8<=b.length;){const kind=b.toString('ascii',i,i+4),size=b.readUInt32LE(i+4),start=i+8;if(start+size>b.length)throw Error('录音数据不完整。');
    if(kind==='fmt '){if(size<16||b.readUInt16LE(start)!==1||b.readUInt16LE(start+2)!==1||b.readUInt32LE(start+4)!==16000||b.readUInt16LE(start+14)!==16)throw Error('录音需要 16 kHz 单声道 PCM。');format=true;}
    if(kind==='data')audio+=size;i=start+size+(size%2);
  }
  if(!format||audio<3200||audio>640000)throw Error('请录制 0.1–20 秒的语音。');return b;
}
export function localVoice(request,signal){
  if(process.platform!=='win32')return Promise.reject(Error('本机语音目前需要 Windows。'));
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-File',path.join(root,'scripts/local-voice.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let out='',error='',done=false;
    const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);err?reject(err):resolve(value);};
    const abort=()=>{child.kill();finish(Error('语音已取消。'));};
    const timer=setTimeout(()=>{child.kill();finish(Error('本机语音处理超时，请缩短这句话后重试。'));},40000);
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}
    child.on('error',e=>finish(e));child.stdin.on('error',()=>{});
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',b=>{out+=b;if(out.length>6_000_000){child.kill();finish(Error('语音结果过大。'));}});
    child.stderr.on('data',b=>{error+=b.toString('utf8').slice(0,1000);});
    child.on('close',code=>{if(done)return;if(code!==0){finish(Error('本机语音不可用，请检查 Windows 中文语音组件。'+(error.includes('没有可用的中文')?' 当前缺少中文识别。':'')));return;}try{finish(null,JSON.parse(out.replace(/^\uFEFF/,'').trim()));}catch{finish(Error('本机语音没有返回有效结果。'));}});
    child.stdin.end(JSON.stringify(request));
  });
}
export class VoiceService {
  constructor(store,run=localVoice){this.store=store;this.run=run;this.jobs=new Map();this.cachedInfo=null;}
  config(){return validateVoice({},this.store.get('voice',defaults));}
  async info(){return this.cachedInfo??=await this.run({action:'info'});}
  async save(input){const config=validateVoice(input,this.config()),info=await this.info();if(config.inputEnabled&&!info.recognizers.some(r=>r.culture==='zh-CN'))throw Error('请先在 Windows 安装中文语音识别组件。');if(config.voice&&!info.voices.some(v=>v.name===config.voice))throw Error('这台电脑没有安装所选声音。');this.cancel();this.store.set('voice',config);return config;}
  async task(key,request){this.jobs.get(key)?.abort();const controller=new AbortController();this.jobs.set(key,controller);try{return await this.run(request,controller.signal);}finally{if(this.jobs.get(key)===controller)this.jobs.delete(key);}}
  async transcribe(key,data){if(!this.config().inputEnabled)throw Error('请先在语音设置开启按键说话。');validateRecording(data);const r=await this.task(key+':recognize',{action:'transcribe',data});return {text:String(r.text??'').slice(0,4000),confidence:Number(r.confidence)||0};}
  async speak(key,text,{preview=false}={}){const c=this.config();if(!preview&&!c.outputEnabled)return {disabled:true};text=String(text??'').replace(/[<>]/g,'').trim();if(!text||text.length>8000)throw Error('没有可朗读的文字。');const info=await this.info();const voice=c.voice||info.voices.find(v=>v.name==='Microsoft Kangkang')?.name||info.voices.find(v=>v.culture==='zh-CN')?.name;if(!voice)throw Error('请先在 Windows 安装中文朗读声音。');return {...await this.task(key+':speak',{action:'speak',voice,rate:c.rate,text:text.slice(0,220)}),truncated:text.length>220};}
  cancel(prefix=''){for(const [key,c] of this.jobs)if(key.startsWith(prefix)){c.abort();this.jobs.delete(key);}}
}
