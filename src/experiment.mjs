import fs from 'node:fs/promises';
import { appendFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { root, runtime, gameDir, work } from './paths.mjs';
import { launchClient, detectLanPort, validateName } from './launch.mjs';
import { connectCompanion } from './companion.mjs';
import { prepare } from '../scripts/prepare-vanilla.mjs';

await fs.mkdir(work, { recursive: true });
const sessionId = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(work, `experiment-${sessionId}.jsonl`);
const stateFile = path.join(work, 'experiment-state.json');
function log(event, detail) {
  const entry = { time: new Date().toISOString(), event, ...detail };
  appendFileSync(logFile, JSON.stringify(entry) + '\n');
  console.log(`[${new Date().toLocaleTimeString('zh-CN')}] ${event}: ${JSON.stringify(detail)}`);
}

let companion;
let client;
let attemptedPort = null;
let exiting = false;
let sampling = false;
const startedAt = Date.now();
const config = JSON.parse(await fs.readFile(path.join(root, 'config/experiment.json'), 'utf8'));
const option = name => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const owner = validateName(option('--owner') ?? config.playerName);
const portOption = option('--port');
const attachPort = portOption === null ? null : Number(portOption);
if (attachPort !== null && (!Number.isInteger(attachPort) || attachPort < 1 || attachPort > 65535)) throw new Error('--port 需要有效端口。');
validateName(config.companionName);
if (owner === config.companionName) throw new Error('两个角色名不能相同。');

async function writeState() {
  const state = { updatedAt: new Date().toISOString(), sessionId, logFile,
    phase: 'vanilla-connectivity-test', modelConnected: false, owner,
    controllerPid: process.pid, gamePid: client?.pid ?? null,
    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    nodeRssMB: Math.round(process.memoryUsage().rss / 1048576),
    companion: companion?.snapshot() ?? null };
  writeFileSync(stateFile + '.tmp', JSON.stringify(state, null, 2));
  renameSync(stateFile + '.tmp', stateFile);
  return state;
}

function connect(port) {
  attemptedPort = port;
  log('connecting', { host: '127.0.0.1', port, owner, username: config.companionName });
  companion = connectCompanion({ port, owner, username: config.companionName, log });
}

async function finish(reason) {
  if (exiting) return;
  exiting = true;
  clearInterval(timer);
  companion?.disconnect();
  log('finished', { reason });
  // The experiment never kills Minecraft while it may be saving a world.
  if (client?.exitCode === null) client.unref();
  await writeState();
  input.close();
  setTimeout(() => process.exit(0), 750).unref();
}

if (attachPort) {
  connect(attachPort);
} else {
  let plan;
  try { plan = JSON.parse(await fs.readFile(path.join(runtime, 'launch-plan.json'), 'utf8')); }
  catch { plan = await prepare(message => log('preparation', { message })); }
  const latestLog = path.join(gameDir, 'logs/latest.log');
  // A stale LAN announcement must never connect the bot to another session.
  try { await fs.rename(latestLog, path.join(work, `previous-client-${sessionId}.log`)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  client = launchClient(plan, { ...config, playerName: owner }, path.join(work, `minecraft-${sessionId}.log`));
  client.once('error', error => { log('launch_error', { message: error.message }); void finish('launch_error'); });
  client.once('exit', code => { log('game_exit', { code }); void finish('game_closed'); });
  log('game_started', { pid: client.pid, gameDir, maxHeapMB: config.maxHeapMB, owner });
  console.log('\n请在新开的原版 MC 中新建测试世界，按 Esc → 对局域网开放 → 创建局域网世界。');
  console.log('检测到端口后，TogetherAI 会自动加入。此阶段不调用任何模型 API。\n');
}

const input = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
input.on('line', line => {
  const command = line.trim().toLowerCase();
  if (command === 'status') void writeState().then(state => console.log(JSON.stringify(state, null, 2)));
  else if (['follow', 'stop', 'hello', 'help'].includes(command)) companion?.command(command);
  else if (command === 'disconnect') void finish('user_disconnect');
});
const timer = setInterval(async () => {
  if (exiting || sampling) return;
  sampling = true;
  try {
    if (!attachPort && !companion) {
      const currentLog = await fs.readFile(path.join(gameDir, 'logs/latest.log'), 'utf8').catch(() => '');
      const port = detectLanPort(currentLog);
      if (port && port !== attemptedPort) connect(port);
    }
    await writeState();
  } catch (error) { log('monitor_error', { message: error.message }); }
  finally { sampling = false; }
}, 2000);
process.on('SIGINT', () => void finish('interrupted'));
process.on('SIGTERM', () => void finish('terminated'));
await writeState();
