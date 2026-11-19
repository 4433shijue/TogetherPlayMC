import mineflayer from 'mineflayer';
import pathfinderPackage from 'mineflayer-pathfinder';
import { commandFor } from './commands.mjs';
import { validateName } from './launch.mjs';

const { pathfinder, Movements, goals } = pathfinderPackage;

export function connectCompanion({ port, owner, username, log }) {
  validateName(owner);
  validateName(username);
  if (owner === username) throw new Error('两个玩家必须使用不同的角色名。');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('局域网端口无效。');
  const bot = mineflayer.createBot({
    host: '127.0.0.1', port, username, auth: 'offline', version: '1.20.1',
    hideErrors: true, checkTimeoutInterval: 30000, viewDistance: 'tiny'
  });
  bot.loadPlugin(pathfinder);
  let status = 'connecting';
  let action = 'idle';
  let spawnAt = null;
  let lastReply = 0;
  let lastOwnerSeen = Date.now();
  const say = message => {
    if (status !== 'connected') return;
    bot.chat(message);
    log('reply', { message });
  };
  const stop = () => {
    if (bot.entity && bot.pathfinder) bot.pathfinder.setGoal(null);
    bot.clearControlStates?.();
    action = 'idle';
  };
  const snapshot = () => {
    const p = bot.entity?.position;
    const target = bot.players?.[owner]?.entity;
    return {
      status, action, username, owner, port, spawnAt,
      position: p ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) } : null,
      ownerPosition: target ? { x: +target.position.x.toFixed(2), y: +target.position.y.toFixed(2), z: +target.position.z.toFixed(2) } : null,
      distanceToOwner: p && target ? +p.distanceTo(target.position).toFixed(2) : null,
      health: bot.health, food: bot.food,
      inventory: bot.inventory?.items().map(item => ({ name: item.name, count: item.count })) ?? []
    };
  };
  const command = requested => {
    if (status !== 'connected') return;
    log('command', { command: requested });
    if (requested === 'stop') { stop(); say('好，我停下等你。'); }
    if (requested === 'follow') {
      const target = bot.players?.[owner]?.entity;
      if (!target) { say('我暂时看不到你，走近一点再叫我。'); return; }
      lastOwnerSeen = Date.now();
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      action = 'follow';
      say('我跟着你，只走路，不挖方块、不搭桥。');
    }
    if (requested === 'hello') say('我在这里。现在是联机测试，暂时还没有接入大模型。');
    if (requested === 'status') {
      const s = snapshot();
      say(`生命 ${s.health}，饱食 ${s.food}，距离你 ${s.distanceToOwner ?? '?'} 格，${action === 'follow' ? '正在跟随' : '正在等你'}。`);
    }
    if (requested === 'help') say('联机测试指令：!follow 跟随，!stop 停下，!status 状态，!hello 打招呼。');
  };
  bot.once('spawn', () => {
    status = 'connected';
    spawnAt = new Date().toISOString();
    const movement = new Movements(bot);
    movement.canDig = false;
    movement.allow1by1towers = false;
    movement.allowParkour = false;
    movement.allowFreeMotion = false;
    movement.canOpenDoors = false;
    movement.scafoldingBlocks = [];
    bot.pathfinder.setMovements(movement);
    log('spawn', snapshot());
    say('我进来啦！这是原版联机测试。输入 !help 查看测试指令。');
  });
  bot.on('chat', (sender, message) => {
    if (sender === username) return;
    if (sender === owner) log('owner_chat', { sender, message });
    const request = commandFor(sender, owner, message);
    if (!request) return;
    // Stop always remains immediate; ordinary commands are rate limited.
    if (request !== 'stop' && Date.now() - lastReply < 750) return;
    lastReply = Date.now();
    command(request);
  });
  bot.on('entityGone', entity => {
    if (action === 'follow' && entity.username === owner) stop();
  });
  bot.on('death', () => { stop(); log('death', {}); });
  bot.on('kicked', reason => log('kicked', { reason: typeof reason === 'string' ? reason : JSON.stringify(reason) }));
  bot.on('error', error => log('error', { message: error.message }));
  bot.on('end', reason => { status = 'disconnected'; action = 'idle'; log('disconnected', { reason }); });
  const guard = setInterval(() => {
    if (action !== 'follow') return;
    if (bot.players?.[owner]?.entity) lastOwnerSeen = Date.now();
    else if (Date.now() - lastOwnerSeen > 3000) stop();
  }, 1000);
  guard.unref();
  bot.once('end', () => clearInterval(guard));
  return { snapshot, command, disconnect: () => {
    if (status === 'disconnected') return;
    stop();
    clearInterval(guard);
    status = 'disconnected';
    if (bot.quit) bot.quit('联机测试结束');
    else bot.end('联机测试结束');
  }, bot };
}
