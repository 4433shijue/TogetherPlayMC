import {parentPort,workerData} from 'node:worker_threads';
import {env,pipeline} from '@huggingface/transformers';
env.allowRemoteModels=false;
env.allowLocalModels=true;
env.localModelPath=workerData.directory;
env.useFSCache=false;
let extractor;
let queue=Promise.resolve();
parentPort.on('message',({id,texts})=>{
 queue=queue.then(async()=>{
  try{
   extractor??=await pipeline('feature-extraction',workerData.model,{dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
   const output=await extractor(texts,{pooling:'mean',normalize:true,truncation:true,max_length:256});
   parentPort.postMessage({id,vectors:output.tolist()});
  }catch(error){parentPort.postMessage({id,error:error.message});}
 });
});
