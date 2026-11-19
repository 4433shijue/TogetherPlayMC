import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';
import { root, runtime, gameDir, work, inside, rulesAllow } from '../src/paths.mjs';

const sha1 = bytes => createHash('sha1').update(bytes).digest('hex');
const exists = file => fs.access(file).then(() => true, () => false);

async function fetchBytes(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) { throw new Error(`下载失败: ${url} (${error.message})`); }
}

async function valid(file, artifact) {
  try {
    const stat = await fs.stat(file);
    if (artifact.size && stat.size !== artifact.size) return false;
    return artifact.sha1 ? sha1(await fs.readFile(file)) === artifact.sha1 : true;
  } catch { return false; }
}

async function ensure(artifact, target, source, counts) {
  if (await valid(target, artifact)) { counts.cached++; return target; }
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (source && await valid(source, artifact)) {
    await fs.copyFile(source, target);
    counts.reused++;
  } else {
    const bytes = await fetchBytes(artifact.url);
    if (artifact.sha1 && sha1(bytes) !== artifact.sha1) throw new Error(`下载校验失败: ${artifact.url}`);
    if (artifact.size && bytes.length !== artifact.size) throw new Error(`下载长度错误: ${artifact.url}`);
    await fs.writeFile(target, bytes);
    counts.downloaded++;
  }
  return target;
}

async function concurrent(items, run, limit = 8) {
  let index = 0;
  let failure;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure && index < items.length) {
      try { await run(items[index++]); }
      catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}

export async function prepare(log = console.log) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/experiment.json'), 'utf8'));
  if (config.version !== '1.20.1') throw new Error('本实验目前只验证 Minecraft 1.20.1。');
  await fs.mkdir(work, { recursive: true });
  await fs.mkdir(runtime, { recursive: true });
  await fs.mkdir(gameDir, { recursive: true });
  const counts = { reused: 0, downloaded: 0, cached: 0 };
  const metadataFile = path.join(runtime, 'cache/1.20.1.json');
  let metadata;
  if (await exists(metadataFile)) {
    metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  } else {
    log('读取 Mojang 官方原版版本清单。');
    const manifest = JSON.parse(await fetchBytes('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'));
    const entry = manifest.versions.find(v => v.id === config.version);
    if (!entry) throw new Error('官方版本清单中未找到 1.20.1。');
    await ensure(entry, metadataFile, null, counts);
    metadata = JSON.parse(await fs.readFile(metadataFile, 'utf8'));
  }
  if (metadata.id !== config.version || metadata.mainClass !== 'net.minecraft.client.main.Main') {
    throw new Error('版本元数据不是目标原版客户端。');
  }
  // Mojang can refresh translations for the same asset index id. Reuse a
  // previously verified 1.20.1 index when the installed pack has a complete set.
  try {
    const installed = JSON.parse(await fs.readFile(config.sourceClientJar.replace(/\.jar$/i, '.json'), 'utf8'));
    const localIndex = path.join(config.sourceMinecraft, 'assets/indexes', `${installed.assetIndex.id}.json`);
    if (installed.clientVersion === config.version && installed.assetIndex.id === metadata.assetIndex.id &&
        installed.downloads.client.sha1 === metadata.downloads.client.sha1 &&
        await valid(localIndex, installed.assetIndex)) {
      metadata.assetIndex = installed.assetIndex;
      log('沿用本机已校验的同版本资源索引，避免仅为翻译更新重新下载资源。');
    }
  } catch { /* A clean machine uses the current official index. */ }
  const clientJar = await ensure(metadata.downloads.client,
    path.join(runtime, 'cache/client-1.20.1.jar'), config.sourceClientJar, counts);
  const classpath = [];
  const nativeJars = [];
  const libraries = metadata.libraries.filter(lib => rulesAllow(lib.rules));
  log(`准备 ${libraries.length} 项原版依赖，优先校验并复制本机已有文件。`);
  for (const lib of libraries) {
    const artifact = lib.downloads.artifact;
    if (artifact) {
      const file = await ensure(artifact, inside(path.join(runtime, 'libraries'), artifact.path),
        inside(path.join(config.sourceMinecraft, 'libraries'), artifact.path), counts);
      classpath.push(file);
      if (/natives-windows(?:[^/]*)\.jar$/i.test(file) && !/natives-windows-(?:x86|arm64)\.jar$/i.test(file)) nativeJars.push(file);
    }
    if (lib.natives?.windows) {
      const classifier = lib.natives.windows.replace('${arch}', '64');
      const artifact = lib.downloads.classifiers[classifier];
      nativeJars.push(await ensure(artifact, inside(path.join(runtime, 'libraries'), artifact.path),
        inside(path.join(config.sourceMinecraft, 'libraries'), artifact.path), counts));
    }
  }
  classpath.push(clientJar);
  const nativesDir = path.join(runtime, 'natives');
  await fs.mkdir(nativesDir, { recursive: true });
  for (const file of nativeJars) {
    const entries = unzipSync(await fs.readFile(file));
    for (const [name, data] of Object.entries(entries)) {
      if (!name.toLowerCase().endsWith('.dll')) continue;
      await fs.writeFile(inside(nativesDir, path.basename(name)), data);
    }
  }
  const assetsDir = path.join(runtime, 'assets');
  const indexFile = path.join(assetsDir, 'indexes', `${metadata.assetIndex.id}.json`);
  await ensure(metadata.assetIndex, indexFile,
    path.join(config.sourceMinecraft, 'assets/indexes', `${metadata.assetIndex.id}.json`), counts);
  const index = JSON.parse(await fs.readFile(indexFile, 'utf8'));
  const assets = [...new Map(Object.values(index.objects).map(v => [v.hash, v])).values()];
  log(`准备 ${assets.length} 项原版资源，文件全部放入项目 runtime 目录。`);
  let completed = 0;
  await concurrent(assets, async asset => {
    const relative = `${asset.hash.slice(0, 2)}/${asset.hash}`;
    await ensure({ sha1: asset.hash, size: asset.size, url: `https://resources.download.minecraft.net/${relative}` },
      path.join(assetsDir, 'objects', relative), path.join(config.sourceMinecraft, 'assets/objects', relative), counts);
    if (++completed % 1000 === 0) log(`资源已准备 ${completed}/${assets.length}`);
  });
  let logConfig;
  if (metadata.logging?.client) {
    logConfig = await ensure(metadata.logging.client.file,
      path.join(runtime, 'cache', metadata.logging.client.file.id),
      path.join(config.sourceMinecraft, 'assets/log_configs', metadata.logging.client.file.id), counts);
  }
  const options = path.join(gameDir, 'options.txt');
  if (!await exists(options)) {
    await fs.writeFile(options, [
      'version:3465', 'lang:zh_cn', 'renderDistance:6', 'simulationDistance:5',
      'maxFps:60', 'graphicsMode:0', 'renderClouds:false', 'particles:1',
      'enableVsync:false', 'fullscreen:false', 'guiScale:2', 'pauseOnLostFocus:false',
      'tutorialStep:none', 'onboardAccessibility:false', 'soundCategory_music:0.0',
      'soundCategory_master:0.3', 'entityDistanceScaling:0.75', ''
    ].join('\n'));
  }
  const plan = { version: config.version, metadata, classpath, nativesDir, assetsDir, gameDir, logConfig, counts };
  await fs.writeFile(path.join(runtime, 'launch-plan.json'), JSON.stringify(plan, null, 2));
  await fs.writeFile(path.join(work, 'preparation.json'), JSON.stringify({
    date: new Date().toISOString(), version: config.version, mainClass: metadata.mainClass,
    jarSha1: sha1(await fs.readFile(clientJar)), assetIndexSha1: metadata.assetIndex.sha1, libraries: classpath.length - 1,
    assets: assets.length, nativeJars: nativeJars.length, counts, gameDir, sourceModified: false
  }, null, 2));
  log(`原版已准备：复用 ${counts.reused}，下载 ${counts.downloaded}，缓存 ${counts.cached}。`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepare().catch(error => { console.error(error.message); process.exitCode = 1; });
}
