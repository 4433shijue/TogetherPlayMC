import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { inside, rulesAllow, expandArguments } from '../src/paths.mjs';
import { offlineUuid, detectLanPort, validateName } from '../src/launch.mjs';
import { commandFor } from '../src/commands.mjs';

test('download paths cannot escape the isolated cache', () => {
  const base = path.resolve('runtime/cache');
  assert.throws(() => inside(base, '../original-game/options.txt'));
  assert.throws(() => inside(base, path.resolve('other-file')));
  assert.equal(inside(base, 'libs/a.jar'), path.join(base, 'libs/a.jar'));
});

test('Mojang platform and feature rules select Windows without demo or quick play', () => {
  assert.equal(rulesAllow([{ action: 'allow', os: { name: 'osx' } }]), false);
  assert.equal(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }]), true);
  assert.equal(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }]), false);
  assert.deepEqual(expandArguments([
    '--name', '${name}', { rules: [{ action: 'allow', features: { has_custom_resolution: true } }], value: ['--width', '${width}'] },
    { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' }
  ], { name: 'Test', width: 1100 }, { has_custom_resolution: true }), ['--name', 'Test', '--width', '1100']);
  assert.throws(() => expandArguments(['${unknown}'], {}));
});

test('offline identity is stable and two player names have different UUIDs', () => {
  assert.equal(offlineUuid('Notch'), 'b50ad385829d3141a2167e7d7539ba7f');
  assert.notEqual(offlineUuid('TogetherHost'), offlineUuid('TogetherAI'));
  assert.throws(() => validateName('../world'));
});

test('LAN detection ignores chat imitations and invalid ports', () => {
  assert.equal(detectLanPort('[Server thread/INFO]: Started serving on 50931'), 50931);
  assert.equal(detectLanPort('[Render thread/INFO]: Started serving on 99999'), null);
  assert.equal(detectLanPort('[Render thread/INFO]: Started serving on 0'), null);
  assert.equal(detectLanPort('[Render thread/INFO]: [CHAT] <Someone> Started serving on 50931'), null);
  assert.equal(detectLanPort('No LAN world yet'), null);
});

test('only the selected human player can issue recognized movement commands', () => {
  assert.equal(commandFor('TogetherHost', 'TogetherHost', '!follow'), 'follow');
  assert.equal(commandFor('TogetherHost', 'TogetherHost', '停下'), 'stop');
  assert.equal(commandFor('SomeoneElse', 'TogetherHost', '!follow'), null);
  assert.equal(commandFor('TogetherAI', 'TogetherHost', '!stop'), null);
  assert.equal(commandFor('TogetherHost', 'TogetherHost', '挖掉我家'), null);
});
