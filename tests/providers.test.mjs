import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {endpoint,listModels,complete,encodeRequest,decodeResponse} from '../src/providers.mjs';
import {gameTool} from '../src/actions.mjs';

async function fixture(t,handler){const requests=[];const server=http.createServer(async(req,res)=>{const parts=[];for await(const b of req)parts.push(b);const raw=Buffer.concat(parts).toString();const data=raw?JSON.parse(raw):null;requests.push({url:req.url,headers:req.headers,data});handler(req,res,data,requests);});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});return {url:`http://127.0.0.1:${server.address().port}`,requests};}
const response=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
test('endpoint normalization preserves relay prefixes and handles full endpoints',()=>{
  assert.equal(endpoint({protocol:'openai',url:'https://example.com/relay/v1/chat/completions'},'models').pathname,'/relay/v1/models');
  assert.equal(endpoint({protocol:'gemini',url:'https://example.com'},'models').pathname,'/v1beta/models');
  assert.equal(endpoint({protocol:'gemini',url:'https://example.com/v1beta/models/test:generateContent'},'models').pathname,'/v1beta/models');
  assert.throws(()=>endpoint({protocol:'openai',url:'https://secret@example.com'},'models'));
});
for(const protocol of ['openai','responses','anthropic','gemini'])test(`${protocol}: real HTTP model listing, native tool call and result round trip`,async t=>{
  const f=await fixture(t,(req,res,body)=>{
    if(req.url.includes('/models')&&req.method==='GET'){
      if(protocol==='gemini')return response(res,req.url.includes('pageToken')?{models:[{name:'models/second',displayName:'第二个',supportedGenerationMethods:['generateContent']}]}:{models:[{name:'models/first',supportedGenerationMethods:['generateContent']}],nextPageToken:'page-two'});
      if(protocol==='anthropic')return response(res,req.url.includes('after_id')?{data:[{id:'second'}],has_more:false}:{data:[{id:'first'}],has_more:true,last_id:'first'});
      return response(res,{data:[{id:'first'},{id:'second'}]});
    }
    const isResult=JSON.stringify(body).includes('test-result');
    if(protocol==='openai')return response(res,{choices:[{message:isResult?{content:'已经观察到啦。'}:{content:'让我看看。',tool_calls:[{id:'c1',type:'function',function:{name:'game_action',arguments:'{"action":"observe"}'}}]}}],usage:{prompt_tokens:14,completion_tokens:8,prompt_tokens_details:{cached_tokens:3}}});
    if(protocol==='responses')return response(res,{output:isResult?[{type:'message',role:'assistant',content:[{type:'output_text',text:'已经观察到啦。'}]}]:[{type:'reasoning',id:'r1',summary:[]},{type:'function_call',call_id:'c1',name:'game_action',arguments:'{"action":"observe"}'}],usage:{input_tokens:14,output_tokens:8}});
    if(protocol==='anthropic')return response(res,{content:isResult?[{type:'text',text:'已经观察到啦。'}]:[{type:'tool_use',id:'c1',name:'game_action',input:{action:'observe'}}],usage:{input_tokens:14,output_tokens:8,cache_read_input_tokens:0,cache_creation_input_tokens:0}});
    return response(res,{candidates:[{content:{role:'model',parts:isResult?[{text:'已经观察到啦。'}]:[{functionCall:{name:'game_action',args:{action:'observe'},id:'c1'},thoughtSignature:'keep-this-signature'}]}}],usageMetadata:{promptTokenCount:14,candidatesTokenCount:8}});
  });
  const c={protocol,url:f.url,key:'test-secret',model:'first'};assert.equal((await listModels(c)).length,2);
  const input={system:'test',messages:[{role:'user',content:'请观察'}],tools:[gameTool]};const first=await complete(c,input);assert.equal(first.calls[0].arguments.action,'observe');assert.equal(first.usage.input,14);
  const second=await complete(c,{...input,messages:[...input.messages,{role:'assistant',...first},{role:'tool',callId:first.calls[0].id,name:'game_action',content:'test-result'}]});assert.equal(second.content,'已经观察到啦。');
  const last=f.requests.at(-1);assert.equal(last.headers[protocol==='anthropic'?'x-api-key':protocol==='gemini'?'x-goog-api-key':'authorization'],protocol==='anthropic'||protocol==='gemini'?'test-secret':'Bearer test-secret');
  if(protocol==='gemini')assert.ok(JSON.stringify(last.data).includes('keep-this-signature'));
  if(protocol==='responses')assert.ok(last.data.input.some(x=>x.type==='reasoning'));
});
test('list errors, empty lists and malformed responses stay distinct',async t=>{
  const f=await fixture(t,(req,res)=>req.url.startsWith('/bad')?response(res,{error:'secret must never be echoed'},401):req.url.startsWith('/broken')?response(res,{}):response(res,{data:[]}));
  await assert.rejects(listModels({protocol:'openai',url:f.url+'/bad',key:'x'}),/Key/);
  await assert.rejects(listModels({protocol:'openai',url:f.url+'/broken'}),/列表/);
  assert.deepEqual(await listModels({protocol:'openai',url:f.url+'/empty'}),[]);
});
test('abort cancels pending provider I/O and JSON mode rejects arbitrary text',async t=>{
  const f=await fixture(t,()=>{});const controller=new AbortController();const promise=complete({protocol:'openai',url:f.url,model:'x'},{system:'x',messages:[]},controller.signal);controller.abort(new Error('stopped'));await assert.rejects(promise,/stopped/);
  assert.throws(()=>decodeResponse({protocol:'openai',toolMode:'json'},{choices:[{message:{content:'我已经完成了'}}]}),/结构化/);
  const r=decodeResponse({protocol:'openai',toolMode:'json'},{choices:[{message:{content:'{"say":"好","actions":[{"name":"game_action","arguments":{"action":"observe"}}]}'}}]});assert.equal(r.calls[0].arguments.action,'observe');
  assert.match(encodeRequest({protocol:'openai',toolMode:'json',model:'x'},{system:'x',messages:[],tools:[]}).messages[0].content,/actions 必须为空/);
});
test('JSON follow-ups preserve assistant action envelopes and failed decoding preserves reported usage',async t=>{
  const input={system:'test',messages:[{role:'assistant',content:'观察一下',calls:[{id:'id',name:'game_action',arguments:{action:'observe'}}]},{role:'tool',callId:'id',content:'{"ok":true}'}],tools:[gameTool]};
  const encoded=encodeRequest({protocol:'openai',toolMode:'json',model:'x'},input);
  assert.deepEqual(JSON.parse(encoded.messages[1].content),{say:'观察一下',actions:[{name:'game_action',arguments:{action:'observe'}}]});
  const f=await fixture(t,(_req,res)=>response(res,{choices:[{message:{content:'plain text'}}],usage:{prompt_tokens:123,completion_tokens:9}}));
  await assert.rejects(complete({protocol:'openai',toolMode:'json',model:'x',url:f.url},input),e=>e.usage.input===123&&e.responseIssue.shape==='not_json');
});
