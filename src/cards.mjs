const signature=Buffer.from([137,80,78,71,13,10,26,10]);
export function pngChunks(bytes){
  const b=Buffer.from(bytes);if(!b.subarray(0,8).equals(signature))throw new Error('不是有效的 PNG 图片。');
  const chunks=[];let offset=8;
  while(offset+12<=b.length){const length=b.readUInt32BE(offset);if(length>8_000_000||offset+12+length>b.length)throw new Error('PNG 文件损坏。');const type=b.toString('ascii',offset+4,offset+8);chunks.push({type,data:b.subarray(offset+8,offset+8+length)});offset+=12+length;if(type==='IEND')return chunks;}
  throw new Error('PNG 文件不完整。');
}
export function validateSkin(bytes){
  if(bytes.length>1_000_000)throw new Error('皮肤文件过大，最大 1 MB。');const chunks=pngChunks(bytes),ihdr=chunks.find(x=>x.type==='IHDR')?.data;
  if(!ihdr||ihdr.length!==13||ihdr.readUInt32BE(0)!==64||![32,64].includes(ihdr.readUInt32BE(4)))throw new Error('请选择 64×64 或 64×32 的标准 Minecraft 皮肤 PNG。');
  if(!chunks.some(x=>x.type==='IDAT'))throw new Error('皮肤没有图像内容。');return {width:64,height:ihdr.readUInt32BE(4)};
}
export function importCard(bytes){
  if(bytes.length>8_000_000)throw new Error('角色卡最大 8 MB。');let card;
  if(Buffer.from(bytes).subarray(0,8).equals(signature)){
    const text=new Map();for(const chunk of pngChunks(bytes)){
      const zero=chunk.data.indexOf(0);if(zero<0)continue;const key=chunk.data.subarray(0,zero).toString();if(!['chara','ccv3'].includes(key))continue;
      let value;if(chunk.type==='tEXt')value=chunk.data.subarray(zero+1);
      if(chunk.type==='iTXt'){const rest=chunk.data.subarray(zero+1);if(rest[0]!==0)continue;let p=2;for(let i=0;i<2;i++){const z=rest.indexOf(0,p);if(z<0)throw new Error('角色卡文本损坏。');p=z+1;}value=rest.subarray(p);}
      if(value)text.set(key,value.toString());
    }
    const encoded=text.get('ccv3')??text.get('chara');if(!encoded)throw new Error('PNG 中没有可识别的角色卡信息（chara / ccv3）。');
    try{card=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));}catch{try{card=JSON.parse(encoded);}catch{throw new Error('角色卡内容无法解析。');}}
  }else{try{card=JSON.parse(Buffer.from(bytes).toString('utf8'));}catch{throw new Error('请选择 JSON 或 PNG 角色卡。');}}
  if(card?.format==='togetherplaymc-role-v1')return {role:{...card.role,id:undefined,gameName:undefined},warnings:[]};
  const d=card?.data??card;if(!d||typeof d.name!=='string')throw new Error('角色卡缺少名字。');
  const warnings=[];if(d.system_prompt||d.post_history_instructions)warnings.push('系统指令作为角色参考保存，不覆盖游戏操作规则。');
  if(d.extensions&&Object.keys(d.extensions).length)warnings.push('扩展字段保留用于导出；脚本、宏和外部资源不执行。');
  return {role:{name:d.name,persona:[d.description,d.personality,d.scenario].filter(Boolean).join('\n\n'),examples:d.mes_example??'',greeting:d.first_mes??'',book:d.character_book?.entries??[],extensions:{originalCard:card}},warnings};
}
export function exportCard(role){const {gameName,skin,id,...portable}=role;return {format:'togetherplaymc-role-v1',version:1,role:portable};}
