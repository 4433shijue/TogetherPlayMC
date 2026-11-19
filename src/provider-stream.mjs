const mergeUsage=(a,b)=>{const out={...a};for(const [k,v] of Object.entries(b??{}))out[k]=v&&typeof v==='object'&&!Array.isArray(v)?mergeUsage(out[k]??{},v):v;return out;};
// Provider SSE frames are assembled into the same response shapes used by the
// buffered decoder. Only visible text reaches onText; tools and reasoning do not.
export async function readProviderStream(response,protocol,onText=()=>{},signal){
 const decoder=new TextDecoder(),blocks=new Map(),tools=new Map();
 let buffer='',total=0,content='',usage={},done=false,finalResponse=null,geminiParts=[];
 const visible=text=>{if(typeof text==='string'&&text){content+=text;if(!signal?.aborted)onText(text);}};
 const frame=raw=>{
  const data=raw.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
  if(!data||data==='[DONE]')return;
  const e=JSON.parse(data);usage=mergeUsage(usage,e.usage??e.usageMetadata??e.response?.usage);if(e.error||e.type==='error'||e.type==='response.failed')throw Error('流式接口返回错误，本次回复已停止。');
  if(protocol==='openai'){
   if(e.usage)usage=mergeUsage(usage,e.usage);const c=e.choices?.find(c=>(c.index??0)===0);if(!c)return;
   const d=c.delta??{};visible(d.content);
   for(const t of d.tool_calls??[]){const old=tools.get(t.index)??{id:'',type:'function',function:{name:'',arguments:''}};old.id+=t.id??'';old.function.name+=t.function?.name??'';old.function.arguments+=t.function?.arguments??'';tools.set(t.index,old);}
   if(c.finish_reason){if(!['stop','tool_calls'].includes(c.finish_reason))throw Error('回复未完整生成，请缩小问题后重试。');done=true;}
  }else if(protocol==='responses'){
   if(e.type==='response.output_text.delta')visible(e.delta);
   if(e.type==='response.completed'){finalResponse={...e.response,usage};done=true;}
   if(e.type==='response.incomplete')throw Error('回复未完整生成，请缩小问题后重试。');
  }else if(protocol==='anthropic'){
   if(e.type==='message_start')usage=mergeUsage(usage,e.message?.usage);
   if(e.type==='content_block_start'){const block={...e.content_block};blocks.set(e.index,block);if(block.type==='text')visible(block.text);}
   if(e.type==='content_block_delta'){
    const block=blocks.get(e.index);if(!block)throw Error('流式内容顺序无效。');
    const d=e.delta??{};
    if(d.type==='text_delta'){block.text=(block.text??'')+d.text;visible(d.text);}
    if(d.type==='input_json_delta')block._json=(block._json??'')+d.partial_json;
    if(d.type==='thinking_delta')block.thinking=(block.thinking??'')+d.thinking;
    if(d.type==='signature_delta')block.signature=(block.signature??'')+d.signature;
   }
   if(e.type==='message_delta'){usage=mergeUsage(usage,e.usage);if(e.delta?.stop_reason&&!['end_turn','tool_use','stop_sequence'].includes(e.delta.stop_reason))throw Error('回复未完整生成，请缩小问题后重试。');}
   if(e.type==='message_stop')done=true;
  }else if(protocol==='gemini'){
   if(e.usageMetadata)usage=mergeUsage(usage,e.usageMetadata);
   const c=e.candidates?.[0];for(const part of c?.content?.parts??[]){
    const previous=geminiParts.at(-1);
    if(part.text&&!part.thought)visible(part.text);
    if(part.text&&previous?.text&&Boolean(part.thought)===Boolean(previous.thought)&&!part.thoughtSignature&&!previous.thoughtSignature)previous.text+=part.text;
    else geminiParts.push({...part});
   }
   if(c?.finishReason){if(c.finishReason!=='STOP')throw Error('回复未完整生成，请缩小问题后重试。');done=true;}
  }
 };
 try{
  for await(const bytes of response.body){
   if(signal?.aborted)throw signal.reason;
   total+=bytes.length;if(total>8_000_000)throw Error('流式回复过大。');
   buffer+=decoder.decode(bytes,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');
   let end;while((end=buffer.indexOf('\n\n'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+2);frame(raw);}
  }
  buffer+=decoder.decode();if(buffer.trim())frame(buffer.replace(/\r\n/g,'\n'));
  if(!done)throw Error('连接在回复完成前中断，未将草稿保存为正式回复。');
  if(protocol==='openai')return {choices:[{message:{content,tool_calls:[...tools.values()]}}],usage};
  if(protocol==='responses')return finalResponse;
  if(protocol==='anthropic')return {content:[...blocks.values()].map(block=>{const {_json,...value}=block;return _json===undefined?value:{...value,input:JSON.parse(_json)};}),usage};
  return {candidates:[{content:{parts:geminiParts}}],usageMetadata:usage};
 }catch(e){e.providerStreamUsage=usage;throw e;}
}
