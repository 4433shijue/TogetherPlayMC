import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const databaseName = 'together.sqlite';
const dataFiles = ['together.sqlite', 'together.sqlite-wal', 'together.sqlite-shm', 'connection.json'];
const dataDirectories = ['skins', 'journey-media', 'backups'];
const countTables = ['roles', 'memories', 'events', 'tasks', 'plans', 'journey_entries', 'journey_goals', 'journey_sessions', 'journey_marks'];

const isMissing = error => error?.code === 'ENOENT';
const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

export function resolveDataDirectory({ root, env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const override = String(env.TOGETHER_DATA ?? '').trim();
  if (override) {
    if (!path.isAbsolute(override)) throw new Error('TOGETHER_DATA 必须是绝对路径。');
    return { directory: path.resolve(override), source: 'override' };
  }
  if (platform === 'win32') {
    const localAppData = String(env.LOCALAPPDATA ?? '').trim() || path.join(home, 'AppData', 'Local');
    return { directory: path.join(localAppData, 'TogetherPlayMC', 'data'), source: 'localappdata' };
  }
  const dataHome = String(env.XDG_DATA_HOME ?? '').trim() || path.join(home, '.local', 'share');
  return { directory: path.join(dataHome, 'togetherplaymc', 'data'), source: 'user-data' };
}

async function fileExists(file) {
  try { await fs.access(file); return true; } catch (error) { if (isMissing(error)) return false; throw error; }
}

export async function inspectDataDirectory(directory) {
  const dbPath = path.join(directory, databaseName);
  const result = { directory, database: dbPath, exists: await fileExists(directory), databaseExists: await fileExists(dbPath), integrity: null, counts: {}, meaningful: false, error: null };
  if (!result.databaseExists) return result;
  let db;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    result.integrity = String(db.prepare('PRAGMA integrity_check').get().integrity_check ?? 'unknown');
    for (const table of countTables) {
      try { result.counts[table] = Number(db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n ?? 0); } catch { result.counts[table] = 0; }
    }
    result.meaningful = ['roles', 'memories', 'events', 'journey_entries', 'journey_goals'].some(table => result.counts[table] > 0);
  } catch (error) {
    result.error = error.message;
  } finally {
    try { db?.close(); } catch {}
  }
  return result;
}

function pushCandidate(list, seen, directory, reason) {
  if (!directory) return;
  const resolved = path.resolve(directory);
  const key = resolved.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ directory: resolved, reason });
}

async function legacyCandidates(root, target) {
  const candidates = [];
  const seen = new Set();
  pushCandidate(candidates, seen, path.join(root, 'data'), 'current-root');

  let cursor = path.resolve(root);
  for (let depth = 0; depth < 6; depth += 1) {
    cursor = path.dirname(cursor);
    pushCandidate(candidates, seen, path.join(cursor, 'data'), `ancestor-${depth + 1}`);
    const base = path.basename(cursor);
    if (base.toLowerCase() === 'dist') {
      let entries = [];
      try { entries = await fs.readdir(cursor, { withFileTypes: true }); } catch {}
      for (const entry of entries.filter(item => item.isDirectory() && /^v\d/i.test(item.name)).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
        pushCandidate(candidates, seen, path.join(cursor, entry.name, 'TogetherPlayMC', 'data'), `sibling-${entry.name}`);
        pushCandidate(candidates, seen, path.join(cursor, entry.name, 'data'), `sibling-${entry.name}-flat`);
      }
    }
  }
  return candidates.filter(candidate => !samePath(candidate.directory, target));
}

async function copyIfPresent(source, destination) {
  try {
    await fs.copyFile(source, destination);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function copyDirectoryIfPresent(source, destination) {
  try {
    await fs.cp(source, destination, { recursive: true, errorOnExist: false, force: true });
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function copyDataContents(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  for (const name of dataFiles) await copyIfPresent(path.join(source, name), path.join(destination, name));
  for (const name of dataDirectories) await copyDirectoryIfPresent(path.join(source, name), path.join(destination, name));
  return destination;
}

export async function backupDataDirectory(source, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const sourceDb = path.join(source, databaseName), destinationDb = path.join(destination, databaseName);
  if (await fileExists(sourceDb)) {
    try {
      const db = new DatabaseSync(sourceDb);
      try { await fs.mkdir(path.dirname(destinationDb), { recursive: true }); db.exec(`VACUUM INTO '${destinationDb.replaceAll("'", "''")}'`); }
      finally { db.close(); }
      for (const name of ['connection.json']) await copyIfPresent(path.join(source, name), path.join(destination, name));
      for (const name of dataDirectories) await copyDirectoryIfPresent(path.join(source, name), path.join(destination, name));
    } catch {
      await copyDataContents(source, destination);
    }
  } else {
    await copyDataContents(source, destination);
  }
  const inspection = await inspectDataDirectory(destination);
  if (inspection.databaseExists && inspection.integrity !== 'ok') throw new Error(`数据备份校验失败：${inspection.error ?? inspection.integrity}`);
  return inspection;
}

async function promoteCopiedData(temp, target) {
  await fs.mkdir(target, { recursive: true });
  for (const name of dataFiles) {
    const source = path.join(temp, name), destination = path.join(target, name);
    if (await fileExists(source) && !(await fileExists(destination))) await fs.rename(source, destination);
  }
  for (const name of dataDirectories) {
    const source = path.join(temp, name), destination = path.join(target, name);
    if (await fileExists(source) && !(await fileExists(destination))) await fs.rename(source, destination);
  }
}

function migrationMarker({ target, source, backup, status, inspection, reason, error } = {}) {
  return {
    version: 1,
    status,
    source: source ?? null,
    target,
    backup: backup ?? null,
    reason: reason ?? null,
    completedAt: status === 'completed' ? new Date().toISOString() : null,
    integrity: inspection?.integrity ?? null,
    counts: inspection?.counts ?? {},
    error: error ?? null
  };
}

export async function prepareDataDirectory({ root, env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (!root) throw new Error('缺少数据目录解析所需的项目根目录。');
  const resolved = resolveDataDirectory({ root, env, platform, home });
  const target = resolved.directory;
  await fs.mkdir(path.dirname(target), { recursive: true });
  if(await fileExists(path.join(target,'restore-state.json')))return {...resolved,integrity:null,counts:{},migration:{status:'restore-pending'}};
  const existing = await inspectDataDirectory(target);
  if (existing.databaseExists) {
    if (existing.integrity !== 'ok') throw new Error(`稳定数据目录校验失败：${target}；请先恢复备份，未创建空数据库。`);
    return { ...resolved, directory: target, integrity: existing.integrity, counts: existing.counts, migration: { status: 'existing', source: null, backup: null } };
  }

  const candidates = await legacyCandidates(root, target);
  const inspected = [];
  const invalid = [];
  for (const candidate of candidates) {
    const inspection = await inspectDataDirectory(candidate.directory);
    if (!inspection.databaseExists) continue;
    if (inspection.integrity === 'ok') inspected.push({ ...candidate, inspection });
    else invalid.push({ ...candidate, inspection });
  }
  if (!inspected.length && invalid.length) throw new Error(`发现无法校验的旧数据，未创建空数据库：${invalid[0].directory}`);
  const source = inspected.find(item => item.inspection.meaningful) ?? inspected[0];
  if (!source) {
    await fs.mkdir(target, { recursive: true });
    return { ...resolved, directory: target, integrity: null, counts: {}, migration: { status: 'new', source: null, backup: null } };
  }

  const stamp = new Date().toISOString().replaceAll(/[^0-9]/g, '').slice(0, 14);
  const backup = path.join(path.dirname(target), 'backups', `migration-${stamp}-${randomUUID().slice(0, 8)}`);
  const temp = `${target}.migrating-${randomUUID()}`;
  const markerPath = path.join(target, 'migration.json');
  try {
    await backupDataDirectory(source.directory, backup);
    await copyDataContents(source.directory, temp);
    const copied = await inspectDataDirectory(temp);
    if (!copied.databaseExists || copied.integrity !== 'ok') throw new Error(`迁移数据库校验失败：${copied.error ?? copied.integrity}`);
    await promoteCopiedData(temp, target);
    const migrated = await inspectDataDirectory(target);
    if (!migrated.databaseExists || migrated.integrity !== 'ok') throw new Error(`迁移后数据库校验失败：${migrated.error ?? migrated.integrity}`);
    const marker = migrationMarker({ target, source: source.directory, backup, status: 'completed', inspection: migrated, reason: source.reason });
    await fs.writeFile(markerPath, JSON.stringify(marker, null, 2), 'utf8');
    return { ...resolved, directory: target, integrity: migrated.integrity, counts: migrated.counts, migration: { status: marker.status, source: marker.source, backup: marker.backup, reason: marker.reason } };
  } catch (error) {
    const marker = migrationMarker({ target, source: source.directory, backup, status: 'failed', inspection: source.inspection, reason: source.reason, error: error.message });
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(markerPath, JSON.stringify(marker, null, 2), 'utf8').catch(() => {});
    throw new Error(`数据迁移失败，旧数据仍保留在 ${source.directory}：${error.message}`);
  } finally {
    await fs.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}
