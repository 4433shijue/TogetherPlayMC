import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import nbt from 'prismarine-nbt';
import {createPracticeWorld} from '../src/practice-world.mjs';

test('practice saves accept timestamps whose low 32 bits exceed signed int range',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'together-time-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const timestamp=417*4294967296+0x80000001;assert.ok((timestamp>>>0)>0x7fffffff);
  t.mock.method(Date,'now',()=>timestamp);
  const world=await createPracticeWorld(directory);
  const {parsed}=await nbt.parse(await fs.readFile(path.join(world.directory,'level.dat')));
  const value=parsed.value.Data.value.LastPlayed.value;
  assert.equal((BigInt(value[0])<<32n)+BigInt(value[1]>>>0),BigInt(timestamp));
});
