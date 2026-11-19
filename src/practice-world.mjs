import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import nbt from 'prismarine-nbt';

export async function createPracticeWorld(gameDir,{suite}={}){
  const now=Date.now(),lastPlayed=[Math.floor(now/4294967296),now|0];
  const tag=(type,value)=>({type,value}),str=v=>tag('string',v),byte=v=>tag('byte',v),int=v=>tag('int',v),compound=v=>tag('compound',v),list=(type,value)=>tag('list',{type,value});
  const layers=[{block:str('minecraft:bedrock'),height:int(1)},{block:str('minecraft:dirt'),height:int(2)},{block:str('minecraft:grass_block'),height:int(1)}];
  const noise=(type,settings,preset)=>compound({type:str(type),generator:compound({type:str('minecraft:noise'),settings:str(settings),biome_source:compound(preset?{type:str('minecraft:multi_noise'),preset:str(preset)}:{type:str('minecraft:the_end')})})});
  const data={DataVersion:int(3465),version:int(19133),Version:compound({Id:int(3465),Name:str('1.20.1'),Snapshot:byte(0)}),LevelName:str('TogetherPlay · 独立练习场'),GameType:int(0),hardcore:byte(0),Difficulty:byte(1),allowCommands:byte(0),initialized:byte(1),SpawnX:int(0),SpawnY:int(64),SpawnZ:int(0),Time:tag('long',[0,0]),DayTime:tag('long',[0,1000]),LastPlayed:tag('long',lastPlayed),GameRules:compound({doMobSpawning:str('false'),doDaylightCycle:str('false'),spawnRadius:str('0')}),DataPacks:compound({Enabled:list('string',['vanilla']),Disabled:list('string',[])}),WorldGenSettings:compound({seed:tag('long',[0,1234]),generate_features:byte(0),bonus_chest:byte(0),dimensions:compound({'minecraft:overworld':compound({type:str('minecraft:overworld'),generator:compound({type:str('minecraft:flat'),settings:compound({biome:str('minecraft:plains'),lakes:byte(0),features:byte(0),layers:list('compound',layers),structure_overrides:list('string',[])})})}),'minecraft:the_nether':noise('minecraft:the_nether','minecraft:nether','minecraft:nether'),'minecraft:the_end':noise('minecraft:the_end','minecraft:end')})})};
  if(suite==='survival-v04')data.LevelName=str('TogetherPlay · 生存能力验收 0.4');
  const name=`TogetherPractice-${Date.now()}-${randomUUID().slice(0,6)}`,directory=path.join(gameDir,'saves',name);await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'level.dat'),gzipSync(nbt.writeUncompressed({type:'compound',name:'',value:{Data:compound(data)}})));await fs.writeFile(path.join(directory,'together-world-id.txt'),randomUUID());await fs.writeFile(path.join(directory,'together-practice.json'),JSON.stringify({version:1,...(suite==='survival-v04'?{suite}:{}),created:new Date().toISOString()}));return {name,directory};
}
