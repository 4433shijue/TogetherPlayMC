import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const runtime = path.join(root, 'runtime');
export const gameDir = path.join(runtime, 'vanilla-player');
export const work = path.join(root, 'work');

export function inside(parent, relative) {
  const target = path.resolve(parent, relative);
  const rel = path.relative(parent, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`路径超出项目子目录: ${relative}`);
  }
  return target;
}

export function rulesAllow(rules = [], features = {}, platform = 'windows', arch = 'amd64') {
  if (!rules.length) return true;
  let allowed = false;
  for (const rule of rules) {
    if (rule.os?.name && rule.os.name !== platform) continue;
    if (rule.os?.arch && !new RegExp(`^(?:${rule.os.arch})$`).test(arch)) continue;
    if (rule.os?.version && !new RegExp(rule.os.version).test('10.0')) continue;
    if (Object.entries(rule.features ?? {}).some(([k, v]) => Boolean(features[k]) !== v)) continue;
    allowed = rule.action === 'allow';
  }
  return allowed;
}

export function expandArguments(items, replacements, features = {}) {
  return items.flatMap(item => {
    if (typeof item === 'object' && !rulesAllow(item.rules, features)) return [];
    const values = typeof item === 'string' ? [item] : [item.value].flat();
    return values.map(value => value.replace(/\$\{([^}]+)\}/g, (_, name) => {
      if (!(name in replacements)) throw new Error(`缺少启动变量: ${name}`);
      return String(replacements[name]);
    }));
  });
}
