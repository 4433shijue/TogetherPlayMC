import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {ActionEngine} from '../src/actions.mjs';
test('an unresponsive game operation does not block stop and cannot overlap a new task',async()=>{
  const b=new EventEmitter();Object.assign(b,{health:20,entity:{position:{}},inventory:{items:()=>[]},pathfinder:{setGoal(){}},clearControlStates(){}});
  const store={task(){}};const engine=new ActionEngine(b,{owner:'Host',role:{id:'role'},world:'world',store});
  let release;engine.execute=()=>new Promise(r=>release=r);const action=engine.run({action:'wait'});await new Promise(r=>setImmediate(r));engine.stop();
  const result=await Promise.race([action,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('stop did not settle')),250);timer.unref();})]);assert.equal(result.ok,false);
  await assert.rejects(engine.run({action:'wait'}),/等待游戏/);release({});await new Promise(r=>setImmediate(r));assert.equal(engine.settling,false);
});
