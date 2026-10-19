'use strict';
// 常量与调参（尺寸/速度/规则/计分/转盘/动作参数）（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? {} : {};
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const WORLD_W = 3840, WORLD_H = 640;
  // ===== 地图放大倍数（服务端与浏览器共用同一份）=====
  // 需求：每层 1440×400 太小，放大 2× → 2880×800（4 倍面积），支撑 200–300 人峰值。
  // 单一来源：Node 读 SID_FLOOR_SCALE（测试/临时对比用），浏览器读服务端注入的
  // window.__SID_FLOOR_SCALE__（staticServe 在 /shared/world/config.js 响应前写入），
  // 都没有时默认 2 —— 这样正式环境两端一定一致，不会出现“服务端 2880、客户端 1440”的错位。
  const FLOOR_SCALE = (function () {
    if (typeof window !== 'undefined' && Number(window.__SID_FLOOR_SCALE__) > 0) return Number(window.__SID_FLOOR_SCALE__);
    if (typeof process !== 'undefined' && process.env && Number(process.env.SID_FLOOR_SCALE) > 0) return Number(process.env.SID_FLOOR_SCALE);
    return 2;
  })();
  // 逻辑视野：一屏看半层（半层宽 = 720*scale），高度按 3:2 基准；客户端再按窗口比例自适应。
  const VIEW_W = Math.round(720 * FLOOR_SCALE), VIEW_H = Math.round(400 * FLOOR_SCALE);
  // 阶段2-阶段1（÷4 尺度修正）：世界像素尺度整体缩小 4 倍，使既有 px 常量首次落到真实含义。
  // 行走手感：144 世界像素/秒（吴佳润 528fd9e，2026-10-15 调参，晚于 feature_dev_floor 的 112，
  // 合并时以该最新调参为准）；两端读取同一配置，冷却不阻止行走。
  // 移动速度随地图比例缩放：放大到 2 倍后跑同样距离需要同样时间。
  // 移动速度随地图比例缩放，但略低于线性：放大后距离翻倍，速度 2× 会显得"飘太快"，
  // 2× 地图用 1.67×（144 → 240 px/s），跑图更稳，也贴合用户"稍微减小点"的反馈。
  const SPEED = Math.round(144 * (FLOOR_SCALE >= 2 ? 1.67 : FLOOR_SCALE)), MIN_Y = 135, MAX_Y = WORLD_H - 24, MIN_X = 20, MAX_X = WORLD_W - 20;
  const BODY_HALF = 9, FOOT_TOP = 4, FOOT_BOTTOM = 5;
  // 阶段2-阶段1（门洞改世界 px）：门洞净宽按轴向绑定身体包络，而不是两轴都用 18px。
  //  h 门（开口沿 x）绑定身体 x 向 2*BODY_HALF = 18px ⇒ 声明开口 40px（净 40-18-2 = 20）；
  //  v 门（开口沿 y）绑定脚部 y 向 FOOT_TOP+FOOT_BOTTOM = 9px ⇒ 声明开口 32px（净 32-9-2 = 21）。
  // 声明→几何约损 2px（QA 实测），故 v 用 30 只到净 19，必须提到 32。
  const DOOR_HALF_PX_H = 20, DOOR_HALF_PX_V = 16;
  // 区域名（阶段3）：由旧的 4 区名重构为与七层结构一致；仅供 UI 概览/调试，不影响玩法。
  const ZONES = ['前台·大堂食堂', '综合办公', '产品研发', '档案票证', '值班会议', '财务会议', '健身报告厅'];
  const FIELD_NAMES = { hair: '头发颜色', top: '上衣颜色', pants: '裤子颜色', shoes: '鞋颜色' };
  const TRAIT_NAMES = { saying: '口头禅', food: '爱吃的食物', sport: '喜欢的运动' };
  const MASK = '***';
  // 肢体互动（跳跃 / 锤子）的唯一数值来源：服务端判定与客户端渲染都读这里，避免两端漂移。
  // 这些数值不参与任何玩法结算：不扣血、不公开 S-ID、不消耗技能次数、不写公共日志。
  const ACTION = {
    jumpMs: 520,          // 一次跳跃的总时长
    jumpHeight: 16,       // 抛物线顶点高度（像素）
    jumpDodgeFrom: 0.18,  // 腾空可躲锤的进度起点
    jumpDodgeTo: 0.82,    // 腾空可躲锤的进度终点
    hammerRange: 58,      // 锤子作用半径（地面坐标欧氏距离）
    hammerCooldownMs: 1000, // J 挥锤 / 幽灵吓人共用 1 秒冷却
    frightMs: 750,        // 受惊锁地图动作，不封身份技能
    stunMs: 750,          // 被敲晕时长
    bumpMs: 15000,        // 头顶肿包保留时长
    maxBumps: 3           // 头顶同时最多显示的肿包数
  };
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
    rpsStake: 1, rpsTimeoutMs: 30000, rpsCooldownMs: 5000, rpsRoundMs: 10000,
    attackRange: 48, attackCooldownMs: 1200, attackConeCos: 0.5, stunMs: 800, freezeMs: 1000
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
  // 战争迷雾：5F 地牢回廊。半径是世界像素，服务端裁剪与客户端渲染共用同一份，
  // 否则改客户端会看到"服务端没发、但客户端还画着残影"的不一致。
  const FLOOR_FOG = { 5: { radius: 180 } };
  return { WORLD_W, WORLD_H, FLOOR_SCALE, FLOOR_FOG, VIEW_W, VIEW_H, SPEED, MIN_Y, MAX_Y, MIN_X, MAX_X, BODY_HALF, FOOT_TOP, FOOT_BOTTOM, DOOR_HALF_PX_H, DOOR_HALF_PX_V, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, ACTION, PALETTES, INTERACT_RANGE, PLAY_CONFIG, RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool, rpsOutcome };
});


