import {Worker} from 'node:worker_threads';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {root} from './paths.mjs';
export const embeddingModel='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
export const embeddingVersion=embeddingModel+'@2c4055b12046f11709e9df2c122e59ffbdc2f900:q8:mean:v1';
export class LocalEmbeddings{
 constructor(){this.pending=new Map();this.sequence=0;this.closed=false;this.error='';}
 status(){return {available:existsSync(path.join(root,'runtime/models',embeddingModel,'model-manifest.json')),loaded:Boolean(this.worker),error:this.error,model:embeddingVersion};}
 async embed(texts){
  if(this.closed)throw Error('检索已关闭');
  if(!this.status().available)throw Error('本机语义模型未安装，已使用关键词检索');
  if(!this.worker){
   this.worker=new Worker(new URL('./embedding-worker.mjs',import.meta.url),{execArgv:process.execArgv.filter(a=>!a.startsWith('--input-type')),workerData:{directory:path.join(root,'runtime/models'),model:embeddingModel}});
   this.worker.on('message',message=>{const pending=this.pending.get(message.id);if(!pending)return;clearTimeout(pending.timer);this.pending.delete(message.id);message.error?pending.reject(Error(message.error)):pending.resolve(message.vectors);});
   this.worker.on('error',error=>this.fail(error));
   this.worker.on('exit',code=>{if(code&&!this.closed)this.fail(Error('本机检索线程已停止'));});
  }
  return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.fail(Error('本机语义检索超时，已使用关键词检索'));void this.worker?.terminate();this.worker=null;},45000);this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({id,texts});});
 }
 fail(error){this.error=error.message;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
 close(){this.closed=true;this.fail(Error('检索已关闭'));const worker=this.worker;this.worker=null;return worker?.terminate();}
}
