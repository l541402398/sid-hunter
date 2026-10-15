'use strict';
// room 子模块：可调配置（技能/探索/随机池）与随机工具。改数值只需动这个文件。
const WORLD = require('../shared/world.js');

const SKILL_CONFIG = {
  chargeIntervalMs: 90_000, // 正式版改为 1_200_000（20 分钟）
  maxCharges: 2,
  probeCooldownMs: 8_000,
  actionCooldownMs: 12_000
};

// 奖励仅保存在服务端，共享地图不暴露容器内容。
// 原 9 个容器唯一分配到七层，保留原 ID 与奖励；楼层归属单独存储，不复制经济。
const EXPLORATION_REWARDS = {
  'reception-132-173': { kind: 'chips', amount: 3 },
  'counter-1990-165': { kind: 'chips', amount: 2 },
  'table-2010-514': { kind: 'clue' },
  'cabinet-785-160': { kind: 'clue' },
  'desk-1035-172': { kind: 'chips', amount: 2 },
  'desk-1690-172': { kind: 'chips', amount: 2 },
  'desk-2940-172': { kind: 'chips', amount: 2 },
  'table-2535-513': { kind: 'clue' },
  'desk-3600-172': { kind: 'chips', amount: 2 },
  // 任务3（五项场景修改）新增：每层 1 个新可搜容器（与 world.js CONTAINER_IDS 同步登记）。
  'hall1-340-300': { kind: 'chips', amount: 2 },
  'printer2-590-370': { kind: 'chips', amount: 1 },
  'docs3-590-290': { kind: 'clue' },
  'ticket4-590-280': { kind: 'chips', amount: 2 },
  'duty5-610-305': { kind: 'chips', amount: 1 },
  'safe6-640-355': { kind: 'clue' },
  'bar7-480-300': { kind: 'chips', amount: 1 }
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
const randomColors = () => Object.fromEntries(Object.entries(WORLD.PALETTES).map(([k, options]) => [k, pick(options)]));
const randomTraits = () => Object.fromEntries(Object.keys(TRAIT_POOL).map(k => [k, pick(TRAIT_POOL[k])]));

module.exports = { SKILL_CONFIG, EXPLORATION_REWARDS, SEG_CHARS, NAME_POOL, TRAIT_POOL, pick, randChar, randomSid, randomColors, randomTraits };
