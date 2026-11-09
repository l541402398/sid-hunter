'use strict';
// room 子模块：可调配置（技能/探索/随机池）与随机工具。改数值只需动这个文件。
const WORLD = require('../shared/world.js');
const { normalizeGender, HAIR_PARITY, hairIndexAllowed } = require('../shared/gender.js');

const SKILL_CONFIG = {
  // 默认取坏人 CD（20 分钟）；正式场由 activity 模板 / 管理页覆盖 good/bad 分别配置。
  // 试玩可用较短间隔；正式：good 30min / bad 20min。
  chargeIntervalMs: 90_000,
  goodChargeIntervalMs: 90_000, // 正式版 1_800_000（30 分钟）
  badChargeIntervalMs: 90_000,  // 正式版 1_200_000（20 分钟）
  maxCharges: 1,
  startCharges: 1,
  probeCooldownMs: 0,
  actionCooldownMs: 0
};

const SEG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const NAME_POOL = ['小序', '阿澈', '木木', '七禾', '南风', '池雨', '蓝桉', '柚子', '星野', '可颂',
  '松子', '北辰', '秋白', '墨墨', '梨舟', '小满', '照野', '言川', '竹青', '余温',
  '芋圆', '青禾', '眠川', '拾光', '晚舟', '云舒', '鸣夏', '知白', '白鹭', '寒枝', '归野', '南山'];
const TRAIT_POOL = {
  saying: ['先喝口水', '马上就好', '有点意思', '稳住别慌', '让我想想', '先做复盘', '晚点再说'],
  food: ['番茄面', '饺子', '咖喱饭', '火锅', '三明治', '牛肉粉', '烤红薯'],
  sport: ['羽毛球', '游泳', '骑行', '篮球', '跑步', '攀岩', '瑜伽']
};

const pick = list => list[Math.floor(Math.random() * list.length)];
const randChar = () => SEG_CHARS[Math.floor(Math.random() * SEG_CHARS.length)];
const randomSid = () => [0, 1, 2].map(() => randChar() + randChar() + randChar());
// 形象由公开发色索引奇偶决定（见 shared/gender.js 与客户端 characters.js）。
// 指定性别时只从同奇偶的发色里挑，其它部位保持随机；未指定时退回原行为。
function hairOptionsForGender(gender) {
  const parsed = normalizeGender(gender);
  if (!parsed) return WORLD.PALETTES.hair;
  return WORLD.PALETTES.hair.filter((_, index) => index % 2 === HAIR_PARITY[parsed]);
}
const pickHairColor = gender => pick(hairOptionsForGender(gender));
const randomColors = gender => {
  const hair = hairOptionsForGender(gender);
  return Object.fromEntries(Object.entries(WORLD.PALETTES).map(([k, options]) => [k, k === 'hair' ? pick(hair) : pick(options)]));
};
const randomTraits = () => Object.fromEntries(Object.keys(TRAIT_POOL).map(k => [k, pick(TRAIT_POOL[k])]));

module.exports = {
  SKILL_CONFIG, SEG_CHARS, NAME_POOL, TRAIT_POOL,
  pick, randChar, randomSid, normalizeGender, hairIndexAllowed, hairOptionsForGender, pickHairColor, randomColors, randomTraits
};
