import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const main = await fs.readFile(new URL('../desktop/main.cjs', import.meta.url), 'utf8');

test('packaged Windows desktop app creates a portable desktop shortcut', async () => {
  assert.match(main, /process\.platform!=='win32'/);
  assert.match(main, /app\.isPackaged/);
  assert.match(main, /app\.getPath\('desktop'\)/);
  assert.match(main, /shell\.writeShortcutLink\(shortcut,'create'/);
  assert.match(main, /shell\.writeShortcutLink\(shortcut,'replace'/);
  assert.match(main, /shell\.readShortcutLink\(shortcut\)/);
  assert.match(main, /target:process\.execPath/);
  assert.match(main, /cwd:root/);
  assert.match(main, /一起玩 MC\.lnk/);
  assert.match(main, /TOGETHER_DATA/);
  assert.match(main, /storage-info/);
  const packager = await fs.readFile(new URL('../scripts/package-release.mjs', import.meta.url), 'utf8');
  assert.match(packager, /创建桌面快捷方式\.cmd/);
  assert.match(packager, /WScript\.Shell/);
});
