import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { connectCompanion } from '../src/companion.mjs';

test('status can be sampled before Minecraft login finishes and connection can be cancelled', { timeout: 5000 }, async t => {
  const sockets = new Set();
  const server = createServer(socket => { sockets.add(socket); socket.on('error', () => {}); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connection = once(server, 'connection');
  const controller = connectCompanion({ port: server.address().port, owner: 'TestHost', username: 'TestBot', log: () => {} });
  t.after(() => {
    controller.disconnect();
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  // Regression: bot.players is not populated synchronously by createBot().
  assert.doesNotThrow(() => controller.snapshot());
  assert.equal(controller.snapshot().status, 'connecting');
  assert.equal(controller.snapshot().ownerPosition, null);
  await connection;
  const ended = once(controller.bot, 'end');
  assert.doesNotThrow(() => controller.disconnect());
  await ended;
  assert.equal(controller.snapshot().status, 'disconnected');
  assert.doesNotThrow(() => controller.disconnect());
});
