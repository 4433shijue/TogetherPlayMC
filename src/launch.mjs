import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { expandArguments } from './paths.mjs';

export function validateName(name) {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name ?? '')) throw new Error('测试角色名需要 3–16 位英文字母、数字或下划线。');
  return name;
}

export function offlineUuid(name) {
  validateName(name);
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString('hex');
}

export function launchArguments(plan, config) {
  validateName(config.playerName);
  const heap = config.maxHeapMB;
  if (!Number.isInteger(heap) || heap < 512 || heap > 4096) throw new Error('实验客户端内存上限应在 512–4096 MB。');
  const replacements = {
    natives_directory: plan.nativesDir, launcher_name: 'TogetherPlayMC', launcher_version: '0.1.0',
    classpath: plan.classpath.join(';'), auth_player_name: config.playerName,
    version_name: plan.version, game_directory: plan.gameDir, assets_root: plan.assetsDir,
    assets_index_name: plan.metadata.assetIndex.id, auth_uuid: offlineUuid(config.playerName),
    auth_access_token: '0', clientid: '', auth_xuid: '', user_type: 'mojang',
    version_type: 'release', resolution_width: '1100', resolution_height: '700'
  };
  const logging = plan.logConfig ? [plan.metadata.logging.client.argument.replace('${path}', plan.logConfig)] : [];
  return [
    '-Xms512M', `-Xmx${heap}M`, '-XX:+UseG1GC', '-Dfile.encoding=UTF-8',
    ...logging, ...expandArguments(plan.metadata.arguments.jvm, replacements),
    plan.metadata.mainClass,
    ...expandArguments(plan.metadata.arguments.game, replacements, { has_custom_resolution: true })
  ];
}

export function launchClient(plan, config, stdoutFile) {
  const vanilla = plan.metadata.mainClass === 'net.minecraft.client.main.Main';
  const companion = plan.profileKind === 'companion-fabric' && plan.metadata.mainClass === 'net.fabricmc.loader.impl.launch.knot.KnotClient';
  if (!vanilla && !companion) throw new Error('仅允许启动原版或项目托管的轻量 Fabric 客户端。');
  if (!fs.existsSync(config.javaPath)) throw new Error(`找不到 Java 17: ${config.javaPath}`);
  const fd = fs.openSync(stdoutFile, 'a');
  try {
    return spawn(config.javaPath, launchArguments(plan, config), {
      cwd: plan.gameDir, windowsHide: true, stdio: ['ignore', fd, fd]
    });
  } finally { fs.closeSync(fd); }
}

export function detectLanPort(log) {
  const matches = [...log.matchAll(/^\[[^\r\n]*\/INFO\]: Started serving on (\d{1,5})\s*$/gm)];
  if (!matches.length) return null;
  const port = Number(matches.at(-1)[1]);
  return port >= 1 && port <= 65535 ? port : null;
}
