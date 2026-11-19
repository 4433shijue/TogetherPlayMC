import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = file => fs.readFile(new URL(file, root), 'utf8');

test('workbench keeps model selection scrollable and sidebar grouped', async () => {
  const [html, app, css] = await Promise.all([read('web/index.html'), read('web/app.js'), read('web/style.css')]);
  assert.match(html, /id="model-menu" class="model-menu"/);
  assert.doesNotMatch(html, /id="model"[^>]*list="model-list"/);
  for (const group of ['home', 'companion', 'journey', 'settings']) assert.match(html, new RegExp(`data-nav-group="${group}"`));
  assert.match(app, /modelOptions/);
  assert.match(app, /ArrowDown/);
  assert.match(app, /organizeNavigation/);
  assert.match(css, /\.model-menu[^{]*\{[^}]*max-height:360px[^}]*overflow-y:auto/);
  assert.match(css, /\.nav-group[^{]*\{/);
});
