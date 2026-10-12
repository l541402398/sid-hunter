'use strict';
// 服务端 CommonJS 与浏览器普通脚本共用地图：绘制矩形、实体足迹和深度相互独立。
(function (root) {
  const WORLD_W = 3840, WORLD_H = 640, VIEW_W = 960, VIEW_H = 640;
  const SPEED = 160, MIN_Y = 135, MAX_Y = WORLD_H - 24, MIN_X = 20, MAX_X = WORLD_W - 20;
  const BODY_HALF = 9, FOOT_TOP = 4, FOOT_BOTTOM = 5;
  const ZONES = ['接待区', '产品研发区', '茶水休息区', '档案工作区'];
  const FIELD_NAMES = { hair: '头发颜色', top: '上衣颜色', pants: '裤子颜色', shoes: '鞋颜色' };
  const TRAIT_NAMES = { saying: '口头禅', food: '爱吃的食物', sport: '喜欢的运动' };
  const MASK = '***';
  const PALETTES = {
    hair: [['银白', '#d3dce9'], ['栗棕', '#9f6748'], ['墨黑', '#263244'], ['金黄', '#e7bd6b'], ['紫灰', '#9986b2']],
    top: [['深蓝', '#5686bc'], ['砖红', '#b86a64'], ['草绿', '#75a58a'], ['米白', '#d2c9b2'], ['浅紫', '#a18ac2']],
    pants: [['炭灰', '#505d70'], ['海军蓝', '#354967'], ['卡其', '#a79770'], ['浅灰', '#95a1ad']],
    shoes: [['白色', '#e3e7e8'], ['黑色', '#27303c'], ['红色', '#bb6258'], ['棕色', '#927253']]
  };
  const INTERACT_RANGE = 64;
  // 转盘奖励（原 wheelRewards）已迁移到 WHEEL：单局连续对局取消“每局一次”限制，
  // 首次免费、之后每次消耗筹码且次数越多越贵，每次放置 slotCount 个物品（筹码 + 特殊券）。
  const PLAY_CONFIG = {
    rpsStake: 1, rpsTimeoutMs: 30000, rpsCooldownMs: 5000,
    attackRange: 48, attackCooldownMs: 12000, attackConeCos: 0.5, stunMs: 800, freezeMs: 1000
  };
  // 结束规则：仅三种结束方式——存活淘汰至 endRemainingPlayers、坏人全灭、时间到。
  const RULES = { endRemainingPlayers: 100, timeLimitMs: 2 * 60 * 60 * 1000 };
  // 所有游戏行为记分表（服务端权威）。
  const SCORE = { search: 2, exchange: 1, clue: 2, rpsWin: 2, rpsDraw: 1, rpsLose: 0, interactHit: 1, probe: 3, spy: 2, accuseHit: 8, kill: 10, wheelPrize: 0 };
  const WHEEL = {
    slotCount: 10,
    spinCosts: [0, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56, 64],
    chipAmounts: [0, 1, 2, 3, 5, 8],
    specialCount: { good: 2, bad: 2 },
    specials: { good: ['clue'], bad: ['reform', 'rebirth'] }
  };
  const WHEEL_ITEMS = {
    clue:    { key: 'clue',    label: '线索券',     desc: '获取一名坏人的一条线索',   color: '#3B82F6', glyph: '?' },
    reform:  { key: 'reform',  label: '洗心革面券', desc: '将自己由坏人转换为好人',   color: '#22C55E', glyph: '♻' },
    rebirth: { key: 'rebirth', label: '轮回券',     desc: '重新随机自己的身份特征',   color: '#EF4444', glyph: '↻' }
  };
  const WHEEL_CHIP_COLOR = '#F59E0B';
  // 第 priorSpins 次转动的费用（priorSpins<=0 即首次 → spinCosts[0]）。
  // 超出数组范围时按末级增量线性外推，保证“次数越多越贵”且严格递增。
  function wheelSpinCost(priorSpins, wheel = WHEEL) {
    const costs = wheel.spinCosts;
    const spins = Math.max(0, Math.floor(Number(priorSpins) || 0));
    if (spins < costs.length) return costs[spins];
    const last = costs[costs.length - 1];
    const step = costs[costs.length - 1] - costs[costs.length - 2];
    return last + step * (spins - (costs.length - 1));
  }
  // 顺序确定（不随机）：先放 specialCount[faction] 个特殊券，其余槽位用 chipAmounts 循环填充筹码项。
  // 筹码索引偏移为 pool.length - specialCount，保证筹码数量随槽位变化、可见“不同数量的筹码”。
  function buildWheelPool(faction, wheel = WHEEL) {
    const pool = [];
    const specialCount = wheel.specialCount[faction] || 0;
    const list = wheel.specials[faction] || [];
    for (let i = 0; i < specialCount; i++) {
      const item = WHEEL_ITEMS[list[i % list.length]];
      pool.push({ kind: 'special', key: item.key, label: item.label, desc: item.desc, color: item.color, glyph: item.glyph });
    }
    const chipBase = pool.length - specialCount;
    for (let i = pool.length; i < wheel.slotCount; i++) {
      const amount = wheel.chipAmounts[(i - chipBase) % wheel.chipAmounts.length];
      pool.push({ kind: 'chips', amount, label: `${amount} 筹码`, color: WHEEL_CHIP_COLOR, glyph: '●' });
    }
    return pool;
  }
  function rpsOutcome(a, b) {
    if (a === b) return 0;
    return ({ rock: 'scissors', paper: 'rock', scissors: 'paper' })[a] === b ? 1 : -1;
  }
  function lineClear(a, b, furniture) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      if (furniture.some(({ footprint: f }) => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h)) return false;
    }
    return true;
  }
  const NPCS = [
    { id: 'npc-reception', name: '接待员小禾', x: 520, y: 285, dialogue: '你好，需要用筹码交换一条办公室线索吗？', cost: 3 },
    { id: 'npc-archive', name: '档案员阿卷', x: 3300, y: 360, dialogue: '我可以帮你寻找一条尚未掌握的线索。', cost: 3 }
  ];
  const CONTAINER_NAMES = {
    'reception-132-173': '接待台', 'cabinet-785-160': '储物柜',
    'desk-1035-172': '研发办公桌一', 'desk-1690-172': '研发办公桌二',
    'desk-2940-172': '档案办公桌一', 'desk-3600-172': '档案办公桌二',
    'counter-1990-165': '茶水台', 'table-2010-514': '休息桌一', 'table-2535-513': '休息桌二'
  };
  function makeFurniture() {
    const list = [];
    const add = (x, y, w, h, type) => {
      const id = `${type}-${x}-${y}`;
      const footHeight = type === 'plant' ? 18 : 24;
      const f = { id, x, y, w, h, type, footprint: { x, y: y + h - footHeight, w, h: footHeight }, depth: y + h };
      if (CONTAINER_NAMES[id]) f.container = { name: CONTAINER_NAMES[id] };
      list.push(f);
    };
    add(132, 173, 155, 67, 'reception'); add(353, 169, 62, 70, 'plant'); add(785, 160, 92, 74, 'cabinet');
    add(120, 518, 184, 66, 'sofa'); add(407, 541, 64, 52, 'plant'); add(745, 523, 150, 62, 'sofa');
    [1035, 1240, 1480, 1690, 2940, 3145, 3380, 3600].forEach(x => { add(x, 172, 137, 77, 'desk'); add(x + 12, 509, 137, 77, 'desk'); });
    add(1990, 165, 267, 76, 'counter'); add(2450, 170, 162, 68, 'sofa'); add(2670, 165, 74, 81, 'plant');
    add(2010, 514, 128, 75, 'table'); add(2240, 519, 180, 63, 'sofa'); add(2535, 513, 127, 75, 'table'); add(2770, 526, 61, 58, 'plant');
    return list;
  }
  function collidesAt(x, y, furniture) {
    return furniture.some(({ footprint: f }) => x + BODY_HALF > f.x && x - BODY_HALF < f.x + f.w &&
      y + FOOT_TOP > f.y && y - FOOT_BOTTOM < f.y + f.h);
  }
  // 身体包围盒与现有角色绘制范围一致；足迹只用于脚部碰撞。
  function coverFor(p, furniture) {
    let cover = null;
    for (const f of furniture) {
      if (p.y >= f.depth) continue;
      const w = Math.max(0, Math.min(p.x + 21, f.x + f.w) - Math.max(p.x - 21, f.x));
      const h = Math.max(0, Math.min(p.y + 8, f.y + f.h) - Math.max(p.y - 53, f.y));
      if (w * h / (42 * 61) >= 0.22 && (!cover || f.depth >= cover.depth)) cover = f;
    }
    return cover;
  }
  function pointOccluded(x, y, p, furniture) {
    return furniture.some(f => p.y < f.depth && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
  }
  function distanceToEntity(p, entity) {
    if (!entity.footprint) return Math.hypot(p.x - entity.x, p.y - entity.y);
    const f = entity.footprint;
    const x = Math.max(f.x, Math.min(f.x + f.w, p.x));
    const y = Math.max(f.y, Math.min(f.y + f.h, p.y));
    return Math.hypot(p.x - x, p.y - y);
  }
  const WORLD = {
    WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_X, MAX_X, MIN_Y, MAX_Y,
    BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, PALETTES,
    makeFurniture, collidesAt, coverFor, pointOccluded, distanceToEntity, INTERACT_RANGE, NPCS,
    PLAY_CONFIG, rpsOutcome, lineClear,
    RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool
  };
  root.WORLD = WORLD;
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).WORLD;
