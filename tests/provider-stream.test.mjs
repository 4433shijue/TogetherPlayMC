import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {complete} from '../src/providers.mjs';
import {readProviderStream} from '../src/provider-stream.mjs';
const frame=value=>'data: '+JSON.stringify(value)+'\r\n\r\n';
const streams={
 openai:[{choices:[{index:0,delta:{content:'我在'}}]},{choices:[{index:0,delta:{content:'这里。'},finish_reason:'stop'}]},{choices:[],usage:{prompt_tokens:20,completion_tokens:4,prompt_tokens_details:{cached_tokens:10}}}],
 responses:[{type:'response.output_text.delta',delta:'我在'},{type:'response.output_text.delta',delta:'这里。'},{type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'我在这里。'}]}],usage:{input_tokens:20,output_tokens:4,input_tokens_details:{cached_tokens:10}}}}],
 anthropic:[{type:'message_start',message:{usage:{input_tokens:10,cache_read_input_tokens:10,cache_creation_input_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'我在'}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text:'这里。'}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:4}},{type:'message_stop'}],
 gemini:[{candidates:[{content:{parts:[{text:'我在'}]}}]},{candidates:[{content:{parts:[{text:'这里。'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:4,cachedContentTokenCount:10}}]
};
for(const protocol of Object.keys(streams))test(protocol+' stream delivers visible text before completion and keeps actual usage',async t=>{
 let release,body;const gate=new Promise(r=>release=r),server=http.createServer(async(req,res)=>{const chunks=[];for await(const b of req)chunks.push(b);body=JSON.parse(Buffer.concat(chunks));res.writeHead(200,{'content-type':'text/event-stream'});const events=streams[protocol];
  // Split multibyte Chinese and CRLF boundaries deliberately.
  const first=Buffer.from(events.slice(0,protocol==='anthropic'?3:1).map(frame).join(''));for(let i=0;i<first.length;i+=3)res.write(first.subarray(i,i+3));await gate;
  res.end(events.slice(protocol==='anthropic'?3:1).map(frame).join(''));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 let firstText;const arrived=new Promise(r=>firstText=r),visible=[];const pending=complete({protocol,stream:true,url:'http://127.0.0.1:'+server.address().port,model:'test',toolMode:'native'},{system:'hi',messages:[{role:'user',content:'你好'}]},undefined,text=>{visible.push(text);firstText();});
 await arrived;assert.equal(visible.join(''),'我在');release();const result=await pending;assert.equal(result.content,'我在这里。');assert.equal(result.usage.input,20);assert.equal(result.usage.cacheRead,10);assert.equal(result.usage.output,4);if(protocol!=='gemini')assert.equal(body.stream,true);
});
test('tool argument fragments and hidden reasoning never appear as visible drafts',async()=>{
 const events=[{type:'message_start',message:{usage:{input_tokens:1}}},{type:'content_block_start',index:0,content_block:{type:'thinking',thinking:''}},{type:'content_block_delta',index:0,delta:{type:'thinking_delta',thinking:'private reasoning'}},{type:'content_block_delta',index:0,delta:{type:'signature_delta',signature:'signature'}},{type:'content_block_start',index:1,content_block:{type:'tool_use',id:'t1',name:'remember',input:{}}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'{"text":'}},{type:'content_block_delta',index:1,delta:{type:'input_json_delta',partial_json:'"约定"}'}},{type:'message_stop'}];const visible=[];
 const r=await readProviderStream(new Response(events.map(frame).join('')),'anthropic',s=>visible.push(s));assert.equal(visible.length,0);assert.equal(r.content[1].input.text,'约定');assert.equal(r.content[0].signature,'signature');
});
test('truncated stream is an error with usage, not a completed partial reply',async()=>{
 await assert.rejects(readProviderStream(new Response(frame({choices:[{delta:{content:'半句话'}}],usage:{prompt_tokens:9}})),'openai'),e=>/完成前中断/.test(e.message)&&e.providerStreamUsage.prompt_tokens===9);
});
