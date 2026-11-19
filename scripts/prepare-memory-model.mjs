import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root} from '../src/paths.mjs';
const model='Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const revision='2c4055b12046f11709e9df2c122e59ffbdc2f900';
const host=process.env.TOGETHER_MODEL_HOST||'https://huggingface.co';
if(!['https://huggingface.co','https://hf-mirror.com'].includes(host))throw Error('Unsupported model host');
const metadata=await fetch(`${host}/api/models/${model}/revision/${revision}?blobs=true`,{signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Model metadata unavailable');return r.json();});
const directory=path.join(root,'runtime/models',model),files=[];
for(const file of ['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx','README.md']){
 const target=path.join(directory,file);await fs.mkdir(path.dirname(target),{recursive:true});
 let data=process.argv.includes('--existing')?await fs.readFile(target).catch(()=>null):null;
 if(!data){const response=await fetch(`${host}/${model}/resolve/${revision}/${file}`,{signal:AbortSignal.timeout(600000)});if(!response.ok)throw Error(file+': HTTP '+response.status);data=Buffer.from(await response.arrayBuffer());}
 const expected=metadata.siblings.find(s=>s.rfilename===file);
 const actual=expected?.lfs?createHash('sha256').update(data).digest('hex'):createHash('sha1').update('blob '+data.length+'\0').update(data).digest('hex');
 if(actual!==(expected?.lfs?.sha256??expected?.blobId))throw Error('Model checksum mismatch: '+file);
 await fs.writeFile(target+'.partial',data);await fs.rename(target+'.partial',target);
 files.push({path:file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});console.log(file,data.length);
}
const license=await fs.readFile(path.join(root,'node_modules/@huggingface/transformers/LICENSE'));
await fs.writeFile(path.join(directory,'LICENSE'),license);files.push({path:'LICENSE',bytes:license.length,sha256:createHash('sha256').update(license).digest('hex')});
await fs.writeFile(path.join(directory,'model-manifest.json'),JSON.stringify({model,revision,license:'Apache-2.0',source:`https://huggingface.co/${model}`,files},null,2));
