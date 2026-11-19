import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.mjs';
import { backupDataDirectory, inspectDataDirectory, prepareDataDirectory, resolveDataDirectory } from '../src/data-root.mjs';

async function tempRoot(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'together-data-root-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

function seed(directory, text = '迁移前的共同记忆') {
  const store = new Store(directory);
  const role = store.roles()[0];
  store.memory(role.id, '', 'fact', text);
  store.event('owner_chat', { text }, role.id, 'world');
  store.close();
  return role.id;
}

test('data directory resolver uses an explicit override and stable Windows default', () => {
  assert.deepEqual(resolveDataDirectory({ root: 'C:/package', platform: 'win32', env: { TOGETHER_DATA: 'D:/TogetherData', LOCALAPPDATA: 'C:/Users/test/AppData/Local' } }), { directory: path.resolve('D:/TogetherData'), source: 'override' });
  assert.deepEqual(resolveDataDirectory({ root: 'C:/package', platform: 'win32', env: { LOCALAPPDATA: 'C:/Users/test/AppData/Local' } }), { directory: path.join(path.resolve('C:/Users/test/AppData/Local'), 'TogetherPlayMC', 'data'), source: 'localappdata' });
  assert.throws(() => resolveDataDirectory({ root: 'C:/package', platform: 'win32', env: { TOGETHER_DATA: 'relative-data' } }), /绝对路径/);
});

test('first start migrates meaningful legacy data, side files, and writes a marker', async t => {
  const root = await tempRoot(t), legacy = path.join(root, 'data'), localAppData = path.join(root, 'local-app-data');
  const roleId = seed(legacy);
  await fs.mkdir(path.join(legacy, 'skins'), { recursive: true });
  await fs.writeFile(path.join(legacy, 'skins', `${roleId}.png`), 'skin');
  await fs.mkdir(path.join(legacy, 'journey-media'), { recursive: true });
  await fs.writeFile(path.join(legacy, 'journey-media', 'note.txt'), 'media');
  const storage = await prepareDataDirectory({ root, platform: 'win32', env: { LOCALAPPDATA: localAppData } });
  const target = path.join(localAppData, 'TogetherPlayMC', 'data');
  assert.equal(storage.directory, target);
  assert.equal(storage.migration.status, 'completed');
  assert.equal(storage.migration.source, legacy);
  assert.equal((await inspectDataDirectory(target)).meaningful, true);
  assert.equal(await fs.readFile(path.join(target, 'skins', `${roleId}.png`), 'utf8'), 'skin');
  assert.equal(await fs.readFile(path.join(target, 'journey-media', 'note.txt'), 'utf8'), 'media');
  const marker = JSON.parse(await fs.readFile(path.join(target, 'migration.json'), 'utf8'));
  assert.equal(marker.status, 'completed');
  assert.equal(marker.integrity, 'ok');
  assert.ok(marker.backup);
  assert.equal((await inspectDataDirectory(marker.backup)).integrity, 'ok');
});

test('existing stable data is never overwritten by a legacy candidate', async t => {
  const root = await tempRoot(t), legacy = path.join(root, 'data'), localAppData = path.join(root, 'local-app-data');
  seed(legacy, '旧数据');
  const stable = path.join(localAppData, 'TogetherPlayMC', 'data');
  seed(stable, '稳定数据');
  const before = JSON.parse(JSON.stringify((await inspectDataDirectory(stable)).counts));
  const storage = await prepareDataDirectory({ root, platform: 'win32', env: { LOCALAPPDATA: localAppData } });
  assert.equal(storage.migration.status, 'existing');
  assert.deepEqual((await inspectDataDirectory(stable)).counts, before);
  const db = new DatabaseSync(path.join(stable, 'together.sqlite'), { readOnly: true });
  assert.equal(db.prepare("SELECT text FROM memories WHERE text='稳定数据'").get().text, '稳定数据');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM memories WHERE text='旧数据'").get().n, 0);
  db.close();
});

test('corrupt stable database fails closed without creating an empty replacement', async t => {
  const root = await tempRoot(t), localAppData = path.join(root, 'local-app-data'), stable = path.join(localAppData, 'TogetherPlayMC', 'data');
  await fs.mkdir(stable, { recursive: true });
  await fs.writeFile(path.join(stable, 'together.sqlite'), 'not sqlite');
  await assert.rejects(prepareDataDirectory({ root, platform: 'win32', env: { LOCALAPPDATA: localAppData } }), /稳定数据目录校验失败/);
});

test('unreadable legacy database fails closed instead of silently creating a new profile', async t => {
  const root = await tempRoot(t), localAppData = path.join(root, 'local-app-data'), legacy = path.join(root, 'data');
  await fs.mkdir(legacy, { recursive: true });
  await fs.writeFile(path.join(legacy, 'together.sqlite'), 'not sqlite');
  await assert.rejects(prepareDataDirectory({ root, platform: 'win32', env: { LOCALAPPDATA: localAppData } }), /无法校验的旧数据/);
  assert.equal(await fs.access(path.join(localAppData, 'TogetherPlayMC', 'data', 'together.sqlite')).then(() => true, () => false), false);
});

test('backup uses a readable SQLite snapshot and keeps ancillary files', async t => {
  const root = await tempRoot(t), source = path.join(root, 'source'), destination = path.join(root, 'backup');
  seed(source);
  await fs.mkdir(path.join(source, 'backups'), { recursive: true });
  await fs.writeFile(path.join(source, 'backups', 'old.sqlite'), 'old');
  const inspection = await backupDataDirectory(source, destination);
  assert.equal(inspection.integrity, 'ok');
  assert.equal(await fs.readFile(path.join(destination, 'backups', 'old.sqlite'), 'utf8'), 'old');
});
