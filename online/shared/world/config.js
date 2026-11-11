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
  // 肢体互动（锤子）的唯一数值来源：服务端判定与客户端渲染都读这里，避免两端漂移。
  // 这些数值不参与任何玩法结算：不扣血、不公开 S-ID、不消耗技能次数、不写公共日志。
  // 注：jump 动作已下线，原 jumpMs / jumpHeight / jumpDodgeFrom / jumpDodgeTo 一并移除。
  const ACTION = {
    hammerRange: 58,      // 锤子作用半径（地面坐标欧氏距离）
    hammerCooldownMs: 1000, // J 挥锤冷却
    frightMs: 750,        // 受惊锁地图动作，不封身份技能
    stunMs: 750,          // 被敲晕时长
    bumpMs: 15000,        // 头顶肿包保留时长
    maxBumps: 3,          // 头顶同时最多显示的肿包数
    // J 积分（建议值，待定）：命中后随机触发；单次 +1；同一操作者→目标每日最多 2；渠道日上限 10
    hammerPointChance: 0.35,
    hammerPoint: 1,
    hammerPointPerTargetDaily: 2,
    hammerPointDailyCap: 10
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
    // rpsStake 保留字段兼容旧客户端；新规则猜拳不再押注金币，胜者直接得积分
    rpsStake: 0, rpsTimeoutMs: 30000, rpsCooldownMs: 5000, rpsRoundMs: 10000,
    attackRange: 48, attackCooldownMs: 1200, attackConeCos: 0.5, stunMs: 800, freezeMs: 1000,
    // 小游戏共享每日积分额度（建议值）
    minigameWinPoints: 2,
    minigameDailyCap: 10
  };
  // 结束规则：按《年会对抗游戏业务方案.md》§一，默认按每日配置截止或管理员结算，不因剩100人或坏人全灭自动结束（100是获奖人数）。
  const RULES = { endRemainingPlayers: 100, timeLimitMs: 2 * 60 * 60 * 1000 };
  // 积分来源（整改后：统一积分，取消独立金币与首搜/首游/身份码/单独击杀奖励）
  // 建议分值见整改方案；标注建议的数值可在管理页或后续版本调整。
  const SCORE = {
    accuseHit: 10,             // 好人正确指认坏人并扣血
    assassinateHit: 3,         // 坏人正确刺杀好人并扣血
    survivalTick: 1,           // 对抗中每满 30 分钟 +1（休战后停止）
    survivalIntervalMs: 30 * 60 * 1000,
    exploreDirect: 1,          // 建议：开箱直接积分
    exploreQuiz: 2,            // 建议：开箱答题正确
    hammerPoint: 1,            // 建议：J 随机触发
    rpsWin: 2,                 // 建议：猜拳获胜（小游戏共享日额度）
    rpsDraw: 0,
    rpsLose: 0,
    npcScorePack: 10,          // 建议：NPC 积分礼包
    // 以下保留键名兼容旧调用，分值一律为 0
    spy: 0,
    kill: 0,
    firstSearch: 0,
    firstMinigame: 0,
    search: 0,
    exchange: 0,
    clue: 0,
    interactHit: 0,
    probe: 0,
    wheelPrize: 0
  };
  // 探索普通结果建议概率（空 / 直接积分 / 答题）；实物奖品独立判定，不占此表。
  const EXPLORE = {
    emptyChance: 5,
    pointsChance: 15,   // 累计区间：empty..empty+points
    quizChance: 80,     // 其余
    directPoints: 1,
    quizPoints: 2
  };
  // 对抗生命与受击保护（管理页可覆盖 room 级字段）
  const COMBAT = {
    initialHp: 3,
    protectMs: 5 * 60 * 1000,
    goodChargeIntervalMs: 30 * 60 * 1000,
    badChargeIntervalMs: 20 * 60 * 1000,
    maxCharges: 1,
    startCharges: 1,
    factionBadRatio: 0.2      // 好人:坏人 ≈ 4:1
  };
  // 转盘：免费随机积分，每日上限 3 次（全楼层 NPC 共享），不消耗积分。
  const WHEEL = {
    slotCount: 10,
    maxDailySpins: 3,
    // 槽位分值池（建议）；kind 改为 points
    chipAmounts: [1, 2, 3, 4, 5, 6, 8]
  };
  const WHEEL_CHIP_COLOR = '#F59E0B';
  // 转盘 10 槽全部为随机积分项。
  function buildWheelPool(faction, wheel = WHEEL) {
    const pool = [];
    for (let i = 0; i < wheel.slotCount; i++) {
      const amount = wheel.chipAmounts[i % wheel.chipAmounts.length];
      pool.push({ kind: 'points', amount, label: `${amount} 积分`, color: WHEEL_CHIP_COLOR, glyph: '●' });
    }
    return pool;
  }
  // NPC 福利：按探索档位解锁后免费领取（cost=0）；每 5 个不同容器解锁一项；所有楼层 NPC 共享进度与次数。
  // unlockAt = 需要已探索的容器数（5/10/15/…）；档位顺序建议值，待定。
  const NPC_EXCHANGE_LIST = Object.freeze([
    Object.freeze({
      key: 'score',
      label: '积分礼包',
      shortLabel: '积分礼包',
      cost: 0,
      points: 10,
      unlockAt: 5,
      dailyLimit: 1,
      desc: '免费领取 +10 积分（建议值；每日一次）'
    }),
    Object.freeze({
      key: 'revealRandomTrait',
      label: '公开随机玩家的一条隐藏属性',
      shortLabel: '公开随机玩家隐藏属性',
      cost: 0,
      unlockAt: 10,
      dailyLimit: 1,
      desc: '随机公开一名对抗中玩家的 1 条未公开隐藏属性并全员公告'
    }),
    Object.freeze({
      key: 'revealTargetTrait',
      label: '公开指定玩家的一条隐藏属性',
      shortLabel: '公开指定玩家隐藏属性',
      cost: 0,
      unlockAt: 15,
      dailyLimit: 1,
      desc: '选择一名对抗中玩家，公开其 1 条未公开隐藏属性并全员公告'
    }),
    Object.freeze({
      key: 'hideOwnTrait',
      label: '隐藏自己的一条已公开属性',
      shortLabel: '隐藏自己已公开属性',
      cost: 0,
      unlockAt: 20,
      dailyLimit: 1,
      desc: '将自己已公开的 1 条个人属性重新设为隐藏（***）'
    }),
    Object.freeze({
      key: 'hideBadClue',
      label: '隐藏指定匿名坏人卡上的一条已公布线索',
      shortLabel: '隐藏匿名坏人卡线索',
      cost: 0,
      unlockAt: 25,
      dailyLimit: 1,
      desc: '指定一张匿名坏人卡，隐藏其上 1 条已公布的系统线索'
    })
  ]);
  const NPC_EXCHANGE = Object.freeze(Object.fromEntries(NPC_EXCHANGE_LIST.map(item => [item.key, item])));
  function rpsOutcome(a, b) {
    if (a === b) return 0;
    return ({ rock: 'scissors', paper: 'rock', scissors: 'paper' })[a] === b ? 1 : -1;
  }
  // 战争迷雾：5F 地牢回廊。半径是世界像素，服务端裁剪与客户端渲染共用同一份，
  // 否则改客户端会看到"服务端没发、但客户端还画着残影"的不一致。
  const FLOOR_FOG = { 5: { radius: 180 } };
  return { WORLD_W, WORLD_H, FLOOR_SCALE, FLOOR_FOG, VIEW_W, VIEW_H, SPEED, MIN_Y, MAX_Y, MIN_X, MAX_X, BODY_HALF, FOOT_TOP, FOOT_BOTTOM, DOOR_HALF_PX_H, DOOR_HALF_PX_V, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, ACTION, PALETTES, INTERACT_RANGE, PLAY_CONFIG, RULES, SCORE, EXPLORE, COMBAT, WHEEL, WHEEL_CHIP_COLOR, buildWheelPool, NPC_EXCHANGE_LIST, NPC_EXCHANGE, rpsOutcome };
});
