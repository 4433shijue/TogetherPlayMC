// A versioned capability profile. Modpack adapters must supply and verify their own
// registry/recipe/interaction semantics before they can advertise support.
export const vanillaProfile = Object.freeze({
  id:'java-vanilla-1.20.1', edition:'Java', version:'1.20.1', name:'Java 1.20.1 原版玩法',
  modpacks:false,
  capabilities:[
    {name:'采集、制作、交付、农田、简单建造',status:'已完成基础实测',note:'0.2 的独立练习场记录；复杂地图与更多材料仍需覆盖。'},
    {name:'任务接续、相关记忆、家园分工',status:'本地回归验证',note:'0.3 新增；不同模型与自然生存场景尚需实测。'},
    {name:'跟随、会合与让路',status:'部分实测',note:'基础跟随已有实测；新增会合与让路需复杂地形验证。'},
    {name:'工具备料、小树采伐、照明掘进与返程',status:'隔离生存世界实测',note:'0.4：8 块原木整树入包并清理垫脚；石镐合成、掘进与遇岩浆停工。大树与复杂矿洞尚需扩展。'},
    {name:'落水自救、浅水掉落物取回',status:'隔离生存世界实测',note:'0.4：自动上浮上岸；确认取回 3 颗钻石后换气。限定可确认返程的浅水，不支持深海搜救。'},
    {name:'近战、持盾、侧移与持续撤退',status:'隔离生存世界实测',note:'0.4：动态尸壳、骷髅击败记录与苦力怕避让；复杂地形、围攻和长期生存仍待验收。死亡取物沿用基础能力。'},
    {name:'村民交易、附魔、酿药、红石、载具、跨维度冒险',status:'尚未接入',note:'列入原版后续能力范围。'},
    {name:'元素觉醒及其他整合包',status:'后续适配',note:'需要独立连接和模组玩法适配，不可导入到当前原版环境。'}
  ]
});

const food = new Set(['cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','cooked_salmon','cooked_cod','bread','baked_potato','apple','carrot','melon_slice','sweet_berries','beetroot','potato','wheat']);
export function storageCategory(name) {
  if (food.has(name)) return 'food';
  if (/seeds$/.test(name)) return 'seeds';
  if (/(?:_log|_wood|_planks|_stem|_hyphae)$/.test(name)||['cobblestone','cobbled_deepslate','stone','dirt','sand','gravel','glass','bricks','stone_bricks'].includes(name)) return 'building';
  if (/(?:_ore|_ingot|_nugget)$/.test(name)||/^(raw_|coal$|charcoal$|diamond$|emerald$|redstone$|lapis_lazuli$)/.test(name)) return 'minerals';
  return null; // Equipment, named items and unclassified loot stay with the companion.
}
export const reserveFor = name => ['coal','charcoal'].includes(name)?16:({food:16,seeds:16,building:32,minerals:0})[storageCategory(name)]??Infinity;
