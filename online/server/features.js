'use strict';
// 功能开关 = **小游戏开关**（按用户拍板的定位）。
//
// 只控制"哪些小游戏现在开放"，不控制搜索 / 背包 / 商店 / 房间这些基础系统 ——
// 那些是常开的，关掉会让人没法正常玩。
//
// 运营方式：管理页逐个勾选，或一键套用「第 1/2/3 天」预设。
const MINIGAMES = {
  rps:     { label: '猜拳对决',       desc: '两人 10 秒出拳，胜者拿筹码', players: '2 人', default: true },
  spire:   { label: '卡牌对决',       desc: '杀戮尖塔式回合制（内容较多，后续开放）', players: '1–2 人', default: false },
  tank:    { label: '坦克大战',       desc: '俯视双人对射，先打中三次者胜', players: '2 人', default: false },
  parkour: { label: '多人趣味闯关',   desc: '蛋仔派对式竞速闯关', players: '2–8 人', default: false }
};
const FEATURE_KEYS = Object.keys(MINIGAMES);

function defaultFeatures() {
  return Object.fromEntries(FEATURE_KEYS.map(k => [k, !!MINIGAMES[k].default]));
}
// 只接受已知小游戏 key，值强制布尔；未知 key 丢弃。
function sanitizeFeatures(input, base) {
  const out = { ...(base || defaultFeatures()) };
  if (input && typeof input === 'object') {
    for (const k of FEATURE_KEYS) if (k in input) out[k] = !!input[k];
  }
  return out;
}
// 管理页用的元数据（含当前值）。implemented 区分"已可玩"与"占位"。
const IMPLEMENTED = new Set(['rps', 'tank']);
function featureList(current) {
  const cur = sanitizeFeatures(current);
  return FEATURE_KEYS.map(k => ({
    key: k, label: MINIGAMES[k].label, desc: MINIGAMES[k].desc, players: MINIGAMES[k].players,
    enabled: cur[k], implemented: IMPLEMENTED.has(k)
  }));
}
// 一键预设：对应"第 N 天开放到哪一步"。运营可先套预设再微调。
const PRESETS = {
  day1: { label: '第 1 天 · 只有猜拳', features: { rps: true, spire: false, tank: false, parkour: false } },
  day2: { label: '第 2 天 · 加卡牌', features: { rps: true, spire: true, tank: false, parkour: false } },
  day3: { label: '第 3 天 · 加坦克', features: { rps: true, spire: true, tank: true, parkour: false } },
  all: { label: '全开', features: { rps: true, spire: true, tank: true, parkour: true } }
};

module.exports = { MINIGAMES, FEATURE_KEYS, defaultFeatures, sanitizeFeatures, featureList, PRESETS };
