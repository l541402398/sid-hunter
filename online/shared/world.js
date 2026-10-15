'use strict';
// 服务端 CommonJS 与浏览器普通脚本共用地图：绘制矩形、实体足迹和深度相互独立。
(function (root) {
  const WORLD_W = 3840, WORLD_H = 640, VIEW_W = 960, VIEW_H = 640;
  // 阶段2-阶段1（÷4 尺度修正）：世界像素尺度整体缩小 4 倍，使既有 px 常量首次落到真实含义。
  // SPEED：阶段3（2026-10-14）按用户反馈"行走过慢"，由 64（2.0 m/s）上调到 112（3.5 m/s）。
  // 服务端权威移动（room.js）与离线版（demo/main.js）都读这个唯一真源，两端速度一致。
  const SPEED = 112, MIN_Y = 135, MAX_Y = WORLD_H - 24, MIN_X = 20, MAX_X = WORLD_W - 20;
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
  function lineClear(a, b, furniture) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      if (furniture.some(({ footprint: f }) => f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h)) return false;
    }
    return true;
  }
  // ---------- 七层楼层数据（1–7F，两端与服务端同源） ----------
  // 逻辑视口基准高度：动态适配时统一缩放 s = 视区CSS高 / FLOOR_BASE_HEIGHT。
  // 世界坐标与屏幕坐标共用同一个 s，屏幕变宽=看到更多世界，绝不非等比拉伸。
  // 阶段2-阶段1（÷4 尺度修正）：FLOOR_BASE_HEIGHT 640→320，FLOOR_W 3840→960，FLOOR_H 1600→400。
  // 唯一尺度源：水平/立面 32px/m，平面进深 13.33px/m（保持 2.4:1）；0–1000 单位 = 30m×30m 楼板。
  // 两轴同比例缩小，nX/nY 自动把全部家具/墙/门/出生点/入口缩到同一尺度。
  const FLOOR_BASE_HEIGHT = 320;
  // 阶段3（楼板加宽 · 每层不能太小）：每层世界像素宽 960→1440（1.5×，45m×30m）。
  // 为让家具/角色/门洞的**像素尺度完全不变**，x 轴归一化空间同步由 0–1000 扩到 0–1500（X_SPAN）：
  // 1 设计单位仍 = 0.96px，故既有 0–1000 内容落在原像素位置，右侧 1000–1500 是新增的
  // 「东侧走廊 + 东侧服务翼（电梯厅/楼梯间/卫生间）」。y 轴保持 0–1000（1 单位 = 0.4px）。
  const FLOOR_W = 1440, FLOOR_H = 400; // 每层世界像素尺寸（二维相机需要纵向空间）
  const X_SPAN = 1500, Y_SPAN = 1000;
  const LIFT_CONFIG = Object.freeze({ hallW: 144, hallH: 96, opening: 48, trigger: 38, closeDelayMs: 650 });
  // 归一化坐标 → 世界像素（x/y 各按自身设计跨度换算，保持 2.4:1 斜俯视与既有像素尺度）。
  const nX = v => Math.round(v / X_SPAN * FLOOR_W);
  const nY = v => Math.round(v / Y_SPAN * FLOOR_H);
  const nRect = c => { const x1 = nX(c[0]), y1 = nY(c[1]), x2 = nX(c[2]), y2 = nY(c[3]); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  // 楼层外轮廓（0–1500 × 0–1000 归一化）。轮廓外是非楼面，禁止行走，不得用矩形底板补平。
  const FULL_RECT = [[0, 0], [1500, 0], [1500, 1000], [0, 1000]];
  const L24 = [[0, 0], [1500, 0], [1500, 1000], [255, 1000], [255, 710], [122, 710], [122, 550], [0, 550]];
  const L56 = [[0, 0], [1500, 0], [1500, 1000], [151, 1000], [151, 620], [72, 620], [72, 520], [0, 520]];

  // 每层规格：rooms 用 zones 呈现；furniture 行为 [type,label,x1,y1,x2,y2,flag?]（角点、0–1000 归一化）。
  // 可搜容器以 flag 'container:<name>' 标记并生成稳定 ID f{层}:container:{name}。
  // walls 行为 [orient,fixed,a1,a2]（orient 'h'/'v'），是真正的碰撞墙体；门=两段墙之间留出的空隙，
  // 因此门是可通行的真实开洞，不是贴图。
  const FLOOR_SPECS = [
    { id: 1, name: '1F · 原创大厅食堂', source: 'original', outline: FULL_RECT,
      zones: ['接待区', '等候区', '食堂', '后厨取餐', '核心筒', '东侧服务翼'], stairLeft: [70, 700], stairRight: [1220, 620],
      furniture: [
        ['reception', '接待台', 150, 120, 320, 220, 'container:reception'],
        ['sofa', '等候沙发', 430, 150, 610, 250],
        ['plant', '门厅绿植', 650, 130, 710, 200],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '大厅储物柜', 340, 300, 460, 390, 'container:hall1'],
        ['sofa', '阅读沙发', 860, 150, 1000, 240],
        ['plant', '图书角绿植', 980, 300, 1030, 360],
        ['table', '食堂餐桌一', 360, 600, 470, 690, 'container:table1'],
        ['table', '食堂餐桌二', 540, 600, 650, 690],
        ['table', '食堂餐桌三', 720, 600, 830, 690],
        ['table', '食堂餐桌四', 360, 740, 470, 830],
        ['table', '食堂餐桌五', 540, 740, 650, 830],
        ['table', '食堂餐桌六', 720, 740, 830, 830],
        ['counter', '取餐台', 340, 860, 700, 950, 'container:counter'],
        ['cabinet', '后厨操作台', 710, 880, 830, 960],
        ['plant', '食堂绿植', 300, 950, 350, 995],
        ['cabinet', '核心筒', 30, 430, 125, 610],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）：走廊 + 电梯厅 + 楼梯间 + 卫生间 + 装饰 ——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      npcs: [{ slug: 'reception', name: '接待员小禾', x: 250, y: 175, dialogue: '你好，需要用筹码交换一条办公室线索吗？', cost: 3 }],
      walls: [['h', 470, 300, 490], ['h', 470, 575, 825], ['h', 800, 300, 650], ['h', 800, 710, 825],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[75, 340], [75, 700], [75, 750], [500, 360], [700, 360], [500, 480], [900, 360], [1080, 500], [1080, 850]] },

    { id: 2, name: '2F · 综合办公', source: 'real', outline: L24,
      zones: ['220 会议室', '上层工位', '核心筒', '卫生间', '茶水间', '226 斜角室', '205', '206', '东侧服务翼'],
      stairLeft: [70, 520], stairRight: [1220, 620],
      furniture: [
        ['table', '220 会议室', 15, 20, 150, 235],
        ['desk', '研发办公桌一', 258, 25, 395, 235, 'container:desk1'],
        ['desk', '工位岛二', 400, 25, 540, 235],
        ['cabinet', '核心筒', 15, 345, 125, 425, 'container:cabinet'],
        ['counter', '卫生间台面', 130, 345, 250, 430],
        ['table', '茶水间台面', 125, 565, 250, 700],
        ['table', '226 斜角室', 258, 795, 362, 995],
        ['desk', '205 工位', 370, 895, 436, 995],
        ['desk', '206 工位', 442, 895, 506, 995],
        ['desk', '中央工位一', 409, 370, 569, 500],
        ['desk', '中央工位二', 409, 540, 569, 680],
        ['desk', '中央工位三', 481, 725, 641, 845],
        ['desk', '右上工位', 868, 10, 995, 205],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '打印间文件柜', 590, 370, 710, 460, 'container:printer2'],
        ['sofa', '中庭沙发', 258, 430, 395, 510],
        ['plant', '中庭绿植', 258, 640, 310, 700],
        // 2d 闭合：205/206 工位之间 29px 凹角（北侧 h890 薄墙与南楼面沿之间只剩 3px 缝）填成一件真实共享绿植箱，
        // 避免"看得见地板却走不进"的隐形墙（team-lead 方案 A：只增实体、不加墙）。造型待美术确认（绿植箱/打印柜皆可）。
        ['plant', '工位绿植箱', 436, 893, 467, 940],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      walls: [['v', 253, 0, 250], ['h', 250, 0, 150], ['h', 250, 255, 540],
        ['h', 340, 0, 250], ['v', 250, 340, 600], ['h', 710, 0, 255], ['h', 890, 365, 510],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[70, 470], [300, 760], [330, 300], [600, 300], [588, 500], [577, 705], [900, 470], [900, 760], [1080, 500], [1080, 850]] },

    { id: 3, name: '3F · 产品研发', source: 'real', outline: L24,
      zones: ['301', '302', '303', '核心筒', '茶水间', '316 斜角室', '305', '讨论区', '小会议区', '东侧服务翼'],
      stairLeft: [70, 520], stairRight: [1220, 620],
      furniture: [
        // 301/302/303 会议桌只占房间上部，底部留出门口步道（门墙 y205），不再封住门内。
        ['desk', '301', 8, 15, 128, 150],
        ['desk', '302', 146, 15, 188, 150],
        ['desk', '303', 208, 15, 250, 150],
        ['cabinet', '核心筒', 10, 290, 118, 490],
        ['table', '茶水间台面', 125, 500, 250, 660],
        ['desk', '研发办公桌二', 312, 90, 503, 220, 'container:desk2'],
        ['table', '316 斜角室', 253, 730, 362, 995],
        ['desk', '305', 368, 840, 433, 995],
        ['table', '讨论区', 440, 840, 498, 995],
        ['table', '小会议区', 503, 840, 608, 995],
        ['desk', '工位带一', 409, 290, 569, 430],
        ['desk', '工位带二', 409, 475, 569, 640],
        ['desk', '工位带三', 481, 655, 641, 790],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '产品资料柜', 590, 290, 710, 380, 'container:docs3'],
        ['sofa', '休息角沙发', 745, 480, 900, 570],
        ['plant', '讨论区绿植', 745, 300, 800, 360],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      walls: [['h', 205, 0, 254], ['v', 254, 0, 205], ['v', 130, 0, 205], ['v', 192, 0, 205],
        ['h', 495, 0, 120], ['h', 727, 250, 365], ['h', 835, 365, 610],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      npcs: [{ slug: 'archive', name: '档案员阿卷', x: 330, y: 300, dialogue: '我可以帮你寻找一条尚未掌握的线索。', cost: 3 }],
      spawns: [[70, 250], [183, 660], [330, 250], [583, 260], [631, 825], [900, 300], [900, 700], [1080, 500], [1080, 850]] },

    { id: 4, name: '4F · 档案票证', source: 'real', outline: L24,
      zones: ['401', '403', '404', '核心筒', '茶水间', '416 作战室', '讨论区', '406 会议室', '票证工位区', '东侧服务翼'],
      stairLeft: [70, 520], stairRight: [1220, 620],
      furniture: [
        // 401/403/404 同上：家具缩到 y150，让出 3F/4F 会议室的门口通道。
        ['desk', '401', 8, 15, 128, 150],
        ['desk', '403', 146, 15, 188, 150],
        ['desk', '404', 208, 15, 250, 150],
        ['cabinet', '核心筒', 10, 285, 118, 480],
        ['table', '茶水间台面', 125, 500, 250, 660],
        ['desk', '档案办公桌一', 295, 70, 493, 215, 'container:desk3'],
        ['table', '416 作战室', 253, 730, 362, 995],
        ['table', '讨论区', 368, 845, 433, 995],
        ['table', '406 会议室', 437, 845, 498, 995],
        ['desk', '票证工位区', 503, 845, 613, 995],
        ['desk', '中央带一', 409, 280, 569, 425],
        ['desk', '中央带二', 409, 470, 569, 610],
        ['desk', '中央带三', 481, 650, 641, 800],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '票证储藏柜', 590, 280, 710, 370, 'container:ticket4'],
        ['sofa', '档案区沙发', 745, 480, 900, 570],
        ['plant', '档案区绿植', 745, 290, 800, 350],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190],
        // 档案票证层：东侧加两件文件柜强化主题（非容器，不改经济）。
        ['cabinet', '档案柜一', 1010, 760, 1110, 890],
        ['cabinet', '档案柜二', 1010, 900, 1110, 995]
      ],
      walls: [['h', 205, 0, 254], ['v', 254, 0, 205], ['v', 130, 0, 205], ['v', 192, 0, 205],
        ['h', 495, 0, 120], ['h', 727, 250, 365], ['h', 840, 365, 615],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[70, 250], [183, 660], [330, 250], [583, 260], [631, 825], [900, 300], [900, 700], [1080, 500], [1080, 850]] },

    { id: 5, name: '5F · 值班会议', source: 'real', outline: L56,
      zones: ['501', '502', '503', '核心筒', '卫生间', '516', '值班室', '左下附翼', '会议区', '509', '茶水间', '东侧服务翼'],
      stairLeft: [70, 250], stairRight: [1220, 620],
      furniture: [
        // 501/502/503 会议桌缩到 y150，让出 5F 会议室的门口通道（门墙 y195）。
        ['desk', '501', 8, 15, 128, 150],
        ['desk', '502', 144, 15, 186, 150],
        ['desk', '503', 193, 15, 251, 150],
        ['cabinet', '核心筒', 10, 290, 118, 490],
        ['counter', '卫生间台面', 142, 290, 248, 375],
        ['table', '516', 253, 290, 305, 420],
        ['table', '值班室', 75, 500, 149, 615],
        // 任务9：附翼工位东移让出 v151 墙的两扇门（y710/y855），门口不再被工位岛堵死。
        ['desk', '左下附翼一', 180, 640, 338, 760],
        ['desk', '左下附翼二', 180, 780, 338, 900],
        ['desk', '左下附翼三', 155, 915, 338, 995],
        ['desk', '顶部工位排', 483, 45, 643, 190],
        ['desk', '中短带', 425, 305, 585, 385],
        ['table', '休息桌二', 310, 500, 700, 630, 'container:table2'],
        ['desk', '下带', 425, 675, 585, 795],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '值班储物柜', 610, 305, 710, 385, 'container:duty5'],
        ['sofa', '茶歇沙发', 710, 450, 860, 540],
        ['plant', '值班区绿植', 720, 560, 775, 620],
        ['table', '小室', 345, 855, 405, 995],
        ['table', '讨论区', 410, 855, 473, 995],
        ['table', '宽会议区', 478, 855, 598, 995],
        ['desk', '509', 603, 855, 674, 995],
        ['table', '茶水间台面', 752, 855, 810, 995],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      walls: [['h', 195, 0, 253], ['v', 130, 0, 195], ['v', 190, 0, 195],
        ['h', 280, 0, 120], ['h', 495, 0, 307], ['v', 307, 280, 495],
        ['h', 620, 72, 151], ['v', 151, 620, 1000], ['h', 850, 342, 676], ['h', 850, 750, 813],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[500, 250], [500, 450], [420, 440], [500, 820], [900, 250], [900, 450], [900, 700], [250, 560], [1080, 500], [1080, 850]] },

    { id: 6, name: '6F · 财务会议', source: 'real', outline: L56,
      zones: ['604', '602', '601', '核心筒', '卫生间', '603', '值班室', '顶工位', '会议簇', '茶水间', '财务工位', '东侧服务翼'],
      stairLeft: [70, 250], stairRight: [1220, 620],
      furniture: [
        // 604/602/601 会议桌缩到 y150，让出 6F 会议室的门口通道（门墙 y195）。
        ['desk', '604', 8, 15, 121, 150],
        ['desk', '602', 140, 15, 241, 150],
        ['desk', '601', 247, 15, 365, 150],
        ['cabinet', '核心筒', 10, 320, 121, 515],
        ['counter', '卫生间台面', 127, 320, 248, 400],
        ['table', '603', 253, 320, 303, 445],
        ['table', '值班室', 75, 525, 149, 648],
        // 任务9：下翼工位东移让出 v151 墙的两扇门（y710/y855），门口不再被工位岛堵死。
        ['desk', '下翼一', 180, 660, 338, 780],
        ['desk', '下翼二', 180, 795, 338, 915],
        ['desk', '下翼三', 155, 930, 338, 995],
        ['desk', '顶工位', 521, 82, 681, 218],
        ['desk', '中带', 462, 355, 622, 415],
        ['desk', '中央带', 462, 515, 622, 655],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（工位缩减后腾出的探索点）——
        ['cabinet', '财务保险柜', 640, 355, 740, 435, 'container:safe6'],
        ['sofa', '财务休息沙发', 755, 480, 900, 570],
        ['plant', '财务区绿植', 755, 300, 810, 360],
        ['desk', '档案办公桌二', 385, 705, 700, 785, 'container:desk4'],
        ['table', '小会议簇一', 345, 878, 458, 995],
        ['table', '小会议簇二', 463, 878, 589, 995],
        ['table', '小会议簇三', 596, 878, 725, 995],
        ['table', '茶水间台面', 752, 878, 808, 995],
        ['desk', '财务工位一', 852, 10, 995, 90],
        ['desk', '财务工位二', 852, 100, 995, 160],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      walls: [['h', 195, 0, 368], ['v', 123, 0, 195], ['v', 245, 0, 195],
        ['h', 313, 0, 305], ['v', 305, 313, 520], ['h', 520, 0, 305],
        ['h', 652, 72, 151], ['v', 151, 652, 1000], ['h', 875, 343, 727], ['h', 875, 750, 810],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[480, 260], [480, 460], [472, 680], [480, 820], [900, 260], [900, 460], [900, 700], [250, 580], [1080, 500], [1080, 850]] },

    { id: 7, name: '7F · 原创健身会议大厅', source: 'original', outline: FULL_RECT,
      zones: ['健身器械区', '自由训练', '更衣室', '会议大厅', '舞台', '核心筒', '东侧服务翼'], stairLeft: [70, 700], stairRight: [1220, 620],
      furniture: [
        ['treadmill', '跑步机一', 170, 40, 250, 120],
        ['treadmill', '跑步机二', 260, 40, 340, 120],
        ['treadmill', '跑步机三', 350, 40, 430, 120],
        ['treadmill', '跑步机四', 440, 40, 520, 120],
        ['rack', '哑铃架一', 560, 40, 640, 110],
        ['rack', '哑铃架二', 560, 150, 640, 220],
        ['mat', '训练垫一', 680, 50, 790, 130],
        ['mat', '训练垫二', 680, 150, 790, 230],
        ['cabinet', '更衣柜', 165, 540, 280, 620, 'container:locker'],
        // —— 任务8：每层新增可搜容器与星露谷风装饰（健身房/报告厅的探索点）——
        ['counter', '能量补给台', 480, 320, 640, 420, 'container:bar7'],
        ['table', '体测记录台', 850, 330, 970, 410],
        ['sofa', '观赛沙发', 850, 560, 990, 650],
        ['plant', '大厅绿植', 850, 480, 910, 550],
        ['table', '更衣台', 165, 640, 280, 720],
        ['seat', '左三排一座', 360, 560, 430, 610],
        ['seat', '左三排二座', 360, 640, 430, 690],
        ['seat', '左三排三座', 360, 720, 430, 770],
        ['seat', '右三排一座', 680, 560, 750, 610],
        ['seat', '右三排二座', 680, 640, 750, 690],
        ['seat', '右三排三座', 680, 720, 750, 770],
        ['stage', '舞台', 345, 820, 800, 970],
        ['cabinet', '核心筒', 30, 430, 155, 610],
        // —— 东侧服务翼（阶段3新增，x 1000–1500）——
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['cabinet', '东侧楼梯间', 1320, 400, 1470, 560],
        ['counter', '东侧卫生间台面', 1140, 700, 1470, 860],
        ['sofa', '东侧等候沙发', 1180, 120, 1360, 220],
        ['plant', '东侧绿植一', 1010, 120, 1070, 190],
        ['plant', '东侧绿植二', 1420, 120, 1480, 190]
      ],
      walls: [['v', 155, 500, 1000], ['h', 500, 160, 285], ['h', 500, 320, 825], ['h', 790, 160, 440], ['h', 790, 500, 690], ['h', 790, 750, 825],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[75, 300], [75, 700], [500, 300], [500, 480], [500, 720], [900, 300], [900, 700], [1080, 500], [1080, 850]] }
  ];

  // 经济实体沿用既有唯一 ID；楼层归属独立存放，装饰与墙体使用新稳定 ID。
  const CONTAINER_IDS = {
    reception: 'reception-132-173', counter: 'counter-1990-165', table1: 'table-2010-514',
    cabinet: 'cabinet-785-160', desk1: 'desk-1035-172', desk2: 'desk-1690-172',
    desk3: 'desk-2940-172', table2: 'table-2535-513', desk4: 'desk-3600-172',
    // 阶段3新增：7F 原本 0 容器（搜寻维度为死层），把「更衣柜」升为可搜容器（改坐标不换既有 9 个 ID）。
    locker: 'locker-7000-770',
    // 任务3（五项场景修改）新增：每层 1 个新可搜容器（工位缩减后腾出的探索点）。ID 同样稳定不复查。
    hall1: 'hall1-340-300', printer2: 'printer2-590-370', docs3: 'docs3-590-290',
    ticket4: 'ticket4-590-280', duty5: 'duty5-610-305', safe6: 'safe6-640-355', bar7: 'bar7-480-300'
  };
  const CONTAINER_NAMES = {};
  const FLOORS = {};
  const NPCS = [];
  // ===== 阶段2-2d：行走碰撞「单体足迹」(R-DECOMP / R-FOOT / R-CLIP / R-MERGE) =====
  // 语义：f.footprint 保持原样（供 coverFor / pointOccluded / lineClear / 命中 / 视线）；
  //       新增 f.blocks[] 仅供行走碰撞（collidesAt）。区域 rect 的碰撞 = 若干单体底部足迹的并集。
  const WK_W = 51.2, WK_PLAN = 23.3, R2_DEPTH = 46.6, R2_THRESH = 55.6;
  const _r3 = v => Math.round(v * 1000) / 1000;
  const _blk = (x, y, w, h) => ({ x: _r3(x), y: _r3(y), w: _r3(Math.max(1, w)), h: _r3(Math.max(1, h)) });
  const _cols = w => Math.max(1, Math.floor((w + 2) / WK_W));          // C = max{n | n*51.2 <= rectW+2}
  const _objD = d => Math.min(24, Math.max(6, d));                     // R-CLIP
  // 逐类型「单体自深」(m × 13.33px/m)；缺省用 rect 深
  const FURN_SELF_D = {
    desk: 9.3, table: 24, counter: 8.7, cabinet: 6.7, reception: 10.7, sofa: 12,
    plant: 10.7, treadmill: 9.3, rack: 6.7, seat: 6.7, mat: 24, stage: 24
  };
  // 工位分支的单一真源：'island'（连排/双面岛，C>=2）| 'workSingle'（工位型单桌）| 'roomSingle'（房号竖放单桌）。
  // blocksFor 与渲染（drawWorkstation）都以它为唯一判据，避免"房号单桌被画成工位岛"。
  function deskBranch(f) {
    if ((f.type === 'desk' || f.type === 'table') && /^\d{3}$/.test(f.label || '')) return 'roomSingle';
    if (f.type !== 'desk') return null;
    if (_cols(f.w) >= 2) return 'island';
    return /工位/.test(f.label || '') ? 'workSingle' : 'roomSingle';
  }
  // 工位岛的单一真源：碰撞（blocksFor）与绘制（drawWorkstation）都调它，保证「画什么撞什么」。
  // 非岛返回 null；返回 { C, rows, gap, plan, unitW, islandH, bw, ox, uy }；uy=rect.y。
  function deskIsland(f) {
    if (deskBranch(f) !== 'island') return null;               // 非岛（单桌走 workSingle / roomSingle）
    const { x, y, w, h } = f;
    const C = _cols(w);
    const rows = h >= R2_THRESH ? 2 : 1;
    const gap = rows === 2 ? Math.min(24, Math.max(0, h - 2 * WK_PLAN)) : 0;
    let islandH = rows === 2 ? (2 * WK_PLAN + gap) : WK_PLAN;
    // R-NO-POCKET：残余窄带 (0,9)px 吸附到 rect 全深，避免岛底留下 <9px（身位）的死缝
    if (rows === 2 && h - islandH > 0 && h - islandH < 9) islandH = h;
    const bw = C * WK_W;
    const ox = x + Math.max(0, (w - bw) / 2);
    return { C, rows, gap, plan: WK_PLAN, unitW: WK_W, islandH, bw, ox, uy: y };
  }
  function blocksFor(f) {
    const { type, label, x, y, w, h } = f;
    const cx = x + w / 2;
    // 2d 闭合件：工位绿植箱占满自身 rect（封住 205/206 工位间凹角）
    if (label === '工位绿植箱') return [_blk(x, y, w, h)];
    const center = (bw, bh) => [_blk(cx - bw / 2, y + Math.max(0, (h - bh) / 2), bw, bh)];
    const topStrip = d => [_blk(x, y, w, d)];
    const bottomStrip = d => [_blk(x, y + h - d, w, d)];
    // 工位/房号单桌：分支单一真源 deskBranch
    const br = deskBranch(f);
    if (br === 'roomSingle') {                                 // 房号竖放单桌：19.2×24，置 (rect.x+2, rect.y-6 上探封列顶死条)
      const bw = Math.min(19.2, Math.max(6, w - 8)), bh = Math.min(24, h);
      return [_blk(x + 2, Math.max(0, y - 6), bw, bh + (y >= 6 ? 6 : 0))];
    }
    if (br === 'workSingle') {                                 // 工位型单桌：D1 44.8×16 贴后沿
      const bw = Math.min(44.8, Math.max(24, w - 24)), bh = Math.min(16, h);
      const bx = (w - bw) >= 24 ? x + w - bw : x;
      return [_blk(bx, y + 2, bw, bh)];
    }
    if (br === 'island') {                                     // 连排/双面岛：块深 = 绘制岛深（单一真源 deskIsland）
      const isl = deskIsland(f);
      return [_blk(isl.ox, isl.uy, isl.bw, Math.min(h, isl.islandH))];
    }
    // 核心筒：底部条带 102.4×24（v5：禁全 rect，否则堵死 h313 门洞 / 埋 portal / 封 6F 左服务带）
    if (type === 'cabinet' && label === '核心筒') return [_blk(cx - 51.2, y + h - 24, 102.4, 24)];
    // 舞台：底部条带 24 深（可站上去，不加 walls）
    if (type === 'stage') return [_blk(x, y + h - 24, w, 24)];
    // 训练垫：垫区 48×24（R-FOOT 保留 24）
    if (type === 'mat') return center(Math.min(48, w), 24);
    if (type === 'treadmill') return center(Math.min(57.6, w), 9.3);
    if (type === 'rack') return center(Math.min(38.4, w), 6.7);
    if (type === 'seat') return center(Math.min(67.2, w), 6.7);
    if (type === 'table' && /^食堂餐桌/.test(label || '')) return center(Math.min(80, w - 12), 24);
    if (type === 'table') return center(Math.min(Math.max(24, w - 24), w), 24);      // 会议/讨论等：收至 rectW-24 居中
    // 任务9（碰撞体积消失/摆放错位修复）：台面/柜类/接待台/沙发/绿植原先碰撞贴 rect 北沿细条
    // （topStrip），但绘制的立面在 rect 南沿（面向镜头）——玩家能穿进可见家具大半才被挡。
    // 改为碰撞贴南沿立面（bottomStrip，与原始 footprint「底部 24px」语义一致），画什么撞什么。
    if (type === 'counter') return bottomStrip(_objD(FURN_SELF_D.counter));             // 台面：贴前沿立面
    if (type === 'cabinet') return bottomStrip(_objD(FURN_SELF_D.cabinet));             // 柜类：贴前沿立面
    if (type === 'reception' || type === 'sofa' || type === 'plant') return bottomStrip(_objD(FURN_SELF_D[type]));
    return bottomStrip(_objD(FURN_SELF_D[type] == null ? h : FURN_SELF_D[type]));    // 默认：底部条带
  }
  (function buildFloors() {
    for (const spec of FLOOR_SPECS) {
      const floor = {
        id: spec.id, name: spec.name, source: spec.source,
        width: FLOOR_W, height: FLOOR_H, zones: spec.zones.slice(),
        polygon: spec.outline.map(([x, y]) => ({ x: nX(x), y: nY(y) })),
        furniture: [], walls: [], doors: [], spawnPoints: [], portals: [], npcs: []
      };
      // 家具：经济容器保留原稳定 ID，装饰按楼层编号；坐标调整不改变经济键。
      spec.furniture.forEach((row, i) => {
        const [type, label, x1, y1, x2, y2, flag] = row;
        const r = nRect([x1, y1, x2, y2]);
        const footHeight = type === 'plant' ? 18 : 24;
        let id, container = null;
        if (flag && flag.indexOf('container:') === 0) {
          const name = flag.slice('container:'.length);
          id = CONTAINER_IDS[name];
          container = { name: label };
          CONTAINER_NAMES[id] = label;
        } else {
          id = `f${spec.id}:${type}:${i}`;
        }
        const f = { id, floorId: spec.id, x: r.x, y: r.y, w: r.w, h: r.h, type, label,
          footprint: { x: r.x, y: r.y + r.h - footHeight, w: r.w, h: footHeight }, depth: r.y + r.h };
        // 行走碰撞 = 单体底部足迹并集（R-DECOMP）；f.footprint 语义不变。
        f.blocks = blocksFor(f);
        // Preserve the row and decorative ID, but an elevator hall is not a cabinet.
        if (label === '东侧电梯厅') { f.architecturalPlaceholder = true; f.blocks = []; f.footprint = null; f.w = 0; f.h = 0; }
        if (container) f.container = container;
        floor.furniture.push(f);
      });
      // 墙体：真实碰撞矩形，厚度约 7 归一化；门是两段墙间的空隙，天然可通行。
      // 阶段2-阶段1（门洞改世界 px）：开口净宽按轴绑定身体包络 —— h 门沿 x 用身体 18px、声明开口 40px；
      //  v 门沿 y 用脚部 9px、声明开口 32px。门洞与墙段都在 px 上生成，端部守卫按同轴换算回归一化单位。
      spec.walls.forEach((w, i) => {
        const [orient, fixed, a1, a2] = w, t = 7, isH = orient === 'h';
        const toPx = isH ? nX : nY;      // 沿墙方向的归一化 → 世界 px
        const nFixed = isH ? nY : nX;    // 墙厚方向的归一化 → 世界 px
        const halfPx = isH ? DOOR_HALF_PX_H : DOOR_HALF_PX_V;
        const guard = halfPx / (isH ? FLOOR_W / X_SPAN : FLOOR_H / Y_SPAN); // 端部守卫：半开口 px → 归一化单位
        // 顶部会议室及左下附翼必须有真实入口，不能仅画门但保留完整碰撞墙。
        let openings = [];
        if (isH && fixed === 205 && (spec.id === 3 || spec.id === 4)) openings = [64, 161, 223];
        if (isH && fixed === 195 && spec.id === 5) openings = [64, 161, 222];
        if (isH && fixed === 195 && spec.id === 6) openings = [62, 184, 306];
        if (!isH && fixed === 151 && (spec.id === 5 || spec.id === 6)) openings = [710, 855];
        // QA-D09：6F 左下服务柱网被 h313 + v305 + h520 合围成全宽封闭区（含 f6:portal:left-down 本体）。
        // 在 y495 横墙 x≈238 处开一个真门（复用 openings 机制），使该区可由走廊真实走进。
        if (isH && fixed === 313 && spec.id === 6) openings = [62];
        const lo = toPx(a1), hi = toPx(a2), near = nFixed(fixed - t / 2), far = nFixed(fixed + t / 2);
        let cursor = lo, segment = 0;
        const pushWall = (start, end) => {
          if (end <= start) return;
          const x = isH ? start : near, y = isH ? near : start;
          const ww = isH ? end - start : far - near, hh = isH ? far - near : end - start;
          floor.walls.push({ id: `f${spec.id}:wall:${i}:${segment++}`, x, y, w: ww, h: hh, type: 'wall',
            footprint: { x, y, w: ww, h: hh }, depth: y + hh });
        };
        for (const center of openings.filter(v => v > a1 + guard && v < a2 - guard)) {
          const c = toPx(center);
          pushWall(cursor, c - halfPx);
          floor.doors.push({ id: `f${spec.id}:door:${i}:${segment}`, orientation: orient,
            x: isH ? c : nX(fixed), y: isH ? nY(fixed) : c, width: 2 * halfPx });
          cursor = c + halfPx;
        }
        pushWall(cursor, hi);
      });
      // 出生点：安全池，按 id 轮转，服务端还会再做无碰撞/无遮挡校验。
      spec.spawns.forEach(([x, y]) => floor.spawnPoints.push({ x: nX(x), y: nY(y) }));
      // 到达候选按侧独立；不改变普通出生池及其轮转顺序，中心线不归任一侧。
      floor.arrivalPoints = {
        left: floor.spawnPoints.filter(p => p.x < floor.width / 2).map(p => ({ ...p })),
        right: floor.spawnPoints.filter(p => p.x > floor.width / 2).map(p => ({ ...p }))
      };
      FLOORS[spec.id] = floor;
      // Annex geometry is in world pixels; the original normalized floor never moves or scales.
      floor.halls = []; floor.glassDoors = [];
      floor.worldBounds = { minX: -LIFT_CONFIG.hallW, maxX: FLOOR_W + LIFT_CONFIG.hallW, minY: 0, maxY: FLOOR_H };
      const staticBlockers = floor.furniture.concat(floor.walls);
      for (const side of ['left', 'right']) {
        const edgeX = side === 'left' ? 0 : FLOOR_W;
        const approachX = edgeX + (side === 'left' ? 28 : -28);
        // The west entrance must avoid conference walls/core cabinets. Pick a genuine free corridor.
        let entryY = null;
        for (const cy of [100, 96, 108, 92, 80, 120, 140, 156, 176, 200]) {
          let safe = true;
          for (let x = side === 'left' ? 0 : FLOOR_W - 48; x <= (side === 'left' ? 48 : FLOOR_W); x += 4) {
            for (let y = cy - 12; y <= cy + 12; y += 4) {
              if (!inMainFloor(floor, x === FLOOR_W ? x - .01 : x + .01, y) || collidesAt(x, y, staticBlockers)) safe = false;
            }
          }
          if (safe) { entryY = cy; break; }
        }
        if (entryY === null) throw new Error(`No safe annex entrance for ${spec.id}F ${side}`);
        const hall = { id: `f${spec.id}:hall:${side}`, side, x: side === 'left' ? -144 : FLOOR_W,
          y: entryY - 48, w: 144, h: 96, entryY, approach: { x: approachX, y: entryY } };
        floor.halls.push(hall);
        const addWall = (name, x, y, w, h) => floor.walls.push({ id: `${hall.id}:wall:${name}`, x, y, w, h,
          type: 'wall', footprint: { x, y, w, h }, depth: y + h });
        addWall('north', hall.x, hall.y, hall.w, 4);
        addWall('south', hall.x, hall.y + hall.h - 4, hall.w, 4);
        addWall('outer', side === 'left' ? hall.x : hall.x + hall.w - 4, hall.y, 4, hall.h);
        addWall('entry-north', edgeX - 2, hall.y, 4, 24);
        addWall('entry-south', edgeX - 2, entryY + 24, 4, 24);
        floor.glassDoors.push({ id: `${hall.id}:glass`, hallId: hall.id, side, x: edgeX, y: entryY,
          opening: 48, footprint: { x: edgeX - 2, y: entryY - 24, w: 4, h: 48 }, depth: entryY + 24 });
        floor.portals.push({ id: `f${spec.id}:portal:${side}`, floorId: spec.id, side,
          x: hall.x + 72, y: entryY - 12, w: 64, h: 30 });
      }
      // 阶段3：西侧 portal 统一落在「西侧核心筒」中心（stairLeft x=70，与参考图 5F/6F 一致），
      // 3F/4F 原有的局部重排（把左门挪到桌南空带）随之取消：锚点不再落在桌面遮挡足迹内。
      // NPC：唯一迁移且保留原 ID，floorId 独立决定归属。
      for (const n of (spec.npcs || [])) {
        const npc = { id: `npc-${n.slug}`,  name: n.name, x: nX(n.x), y: nY(n.y),
          dialogue: n.dialogue, cost: n.cost, floorId: spec.id };
        NPCS.push(npc);
        floor.npcs.push(npc);
      }
      FLOORS[spec.id] = floor;
    }
  })();

  function floorById(id = 1) { const n = Number(id); return Number.isSafeInteger(n) ? FLOORS[n] || null : null; }
  function floorOptions() { return FLOOR_SPECS.map(f => ({ id: f.id, label: `${f.id}F`, name: f.name })); }
  function inHall(floorId, side, x, y) {
    const f = floorById(floorId), hall = f && f.halls.find(h => h.side === side);
    return !!hall && x > hall.x && x < hall.x + hall.w && y > hall.y && y < hall.y + hall.h;
  }
  // Only public door states are replicated; no actor identity or faction enters this state machine.
  function advanceGlassDoors(floorId, previous, actors, now) {
    const f = floorById(floorId), next = {};
    for (const d of f.glassDoors) {
      const near = actors.some(p => p.floorId === floorId && p.online !== false && p.alive !== false &&
        Math.abs(p.x - d.x) <= LIFT_CONFIG.trigger && Math.abs(p.y - d.y) <= d.opening / 2 + 12);
      const old = previous[d.id] || { open: false, holdUntil: 0 };
      next[d.id] = { open: near || now < old.holdUntil, holdUntil: near ? now + LIFT_CONFIG.closeDelayMs : old.holdUntil };
    }
    return next;
  }
  function floorBlockers(floorId, doorStates) {
    const f = floorById(floorId);
    if (!f) return [];
    return f.furniture.filter(q => !q.architecturalPlaceholder).concat(f.walls,
      doorStates ? f.glassDoors.filter(d => !(doorStates[d.id] && doorStates[d.id].open)) : []);
  }
  function floorFurniture(floorId) { return floorById(floorId).furniture.slice(); }
  function floorWalls(floorId) { return floorById(floorId).walls.slice(); }
  function floorPortals(floorId) { return floorById(floorId).portals.map(p => ({ ...p })); }
  function floorSpawns(floorId) { return floorById(floorId).spawnPoints.map(p => ({ ...p })); }
  function floorArrivals(floorId, side) {
    const floor = FLOORS[Number(floorId)];
    if (!floor || !['left', 'right'].includes(side)) return [];
    return floor.arrivalPoints[side].map(p => ({ ...p }));
  }
  function safeSideLanding(floorId, side) {
    const floor = FLOORS[Number(floorId)];
    if (!floor) return null;
    const blockers = floorBlockers(floorId);
    for (const p of floorArrivals(floorId, side)) {
      const sameSide = side === 'left' ? p.x < floor.width / 2 : side === 'right' && p.x > floor.width / 2;
      if (!sameSide || floorCollides(floorId, p.x, p.y, blockers) || coverFor(p, blockers)) continue;
      if (floor.portals.some(portal => Math.hypot(p.x - portal.x, p.y - portal.y) <= INTERACT_RANGE)) continue;
      return p;
    }
    return null; // 同侧无合法候选时拒绝，绝不回退到另一侧。
  }
  // 指定层、指定侧（west=left / east=right）的电梯门户。
  function floorPortal(floorId, side) {
    const floor = FLOORS[Number(floorId)];
    if (!floor) return null;
    const p = floor.portals.find(q => q.side === side);
    return p ? { ...p } : null;
  }
  // 乘梯落点：落在目标层**同侧电梯门口**。优先门口正前方（南 14px），其次门口本身，
  // 都要求楼面内、不碰撞、不被家具遮挡；否则回退门口原坐标。
  function elevatorLanding(floorId, side) {
    const floor = FLOORS[Number(floorId)];
    if (!floor) return null;
    const portal = floor.portals.find(p => p.side === side);
    if (!portal) return null;
    const blockers = floorBlockers(floorId);
    const candidates = [[portal.x, portal.y + 14], [portal.x, portal.y], [portal.x, portal.y - 14]];
    for (const [x, y] of candidates) {
      if (inFloor(floorId, x, y) && !collidesAt(x, y, blockers) && !coverFor({ x, y }, blockers)) return { x, y };
    }
    return null;
  }
  function floorNpcs(floorId) { return floorById(floorId).npcs.map(n => ({ ...n })); }
  function floorContainers(floorId) { return floorById(floorId).furniture.filter(f => f.container).map(f => ({ ...f, footprint: { ...f.footprint } })); }
  // 点是否在该层楼面内（多边形内），用于「轮廓外禁止行走」。
  function inFloor(floorId, x, y) {
    const f = floorById(floorId);
    return !!f && (inMainFloor(f, x, y) || f.halls.some(h => x >= h.x && x <= h.x + h.w && y > h.y && y < h.y + h.h));
  }
  function inMainFloor(floor, x, y) {
    const poly = floor.polygon;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 该层可行走判定：楼面内 + 不撞家具/墙体。服务端权威移动使用它。
  function floorCollides(floorId, x, y, blockers) {
    if (!inFloor(floorId, x, y)) return true;
    return collidesAt(x, y, blockers || floorBlockers(floorId));
  }
  function floorBounds(floorId) { const f = floorById(floorId); return { minX: f.worldBounds.minX + 12, maxX: f.worldBounds.maxX - 12, minY: 40, maxY: f.height - 24 }; }
  function cameraBounds(floorId, viewW, viewH, x, y) {
    const b = floorById(floorId).worldBounds, w = b.maxX - b.minX, h = b.maxY - b.minY;
    return { x: viewW >= w ? b.minX + (w - viewW) / 2 : Math.max(b.minX, Math.min(b.maxX - viewW, x - viewW / 2)),
      y: viewH >= h ? b.minY + (h - viewH) / 2 : Math.max(b.minY, Math.min(b.maxY - viewH, y - viewH / 2)) };
  }
  // 兼容旧接口：返回指定层（默认 1F）的家具，供仍按单层语义调用的代码使用。
  function makeFurniture(floorId = 1) { return floorFurniture(floorId); }
  function collidesAt(x, y, items) {
    const hit = f => x + BODY_HALF > f.x && x - BODY_HALF < f.x + f.w &&
      y + FOOT_TOP > f.y && y - FOOT_BOTTOM < f.y + f.h;
    for (const it of items) {
      // 行走碰撞优先用 f.blocks[]（单体足迹并集）；无 blocks 时回退 footprint（墙体走此分支）。
      const bs = it.blocks;
      if (bs && bs.length) { for (const b of bs) if (hit(b)) return true; }
      else if (it.footprint && hit(it.footprint)) return true;
    }
    return false;
  }
  // 身体包围盒与现有角色绘制范围一致；足迹只用于脚部碰撞。
  // 阶段2-阶段1（÷4 尺度修正）：包围盒随世界同步 ÷4（半宽 21→5.25、下 8→2、上 53→13.25，盒 10.5×15.25）。
  // 家具足迹同比例缩小 → 面积比与阈值 0.22 不变，命中集合与缩小前逐点等价（不重标定阈值即守恒）。
  function coverFor(p, furniture) {
    let cover = null;
    for (const f of furniture) {
      if (p.y >= f.depth) continue;
      const w = Math.max(0, Math.min(p.x + 5.25, f.x + f.w) - Math.max(p.x - 5.25, f.x));
      const h = Math.max(0, Math.min(p.y + 2, f.y + f.h) - Math.max(p.y - 13.25, f.y));
      if (w * h / (10.5 * 15.25) >= 0.22 && (!cover || f.depth >= cover.depth)) cover = f;
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
  // 外观朝向独立于 J 挥拳向量；等轴位移保留仍有效的上一方向。
  function spriteDirection(dx, dy, previous = 'front') {
    const eps = 1e-6, ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.hypot(dx, dy) <= eps) return previous;
    const horizontal = dx < 0 ? 'left' : 'right', vertical = dy < 0 ? 'back' : 'front';
    if (Math.abs(ax - ay) <= eps * Math.max(1, ax, ay)) {
      return previous === horizontal || previous === vertical ? previous : vertical;
    }
    return ax > ay ? horizontal : vertical;
  }
  // ---------- 需求2：电梯门「面对 + 靠近」资格判定（两端与服务端同源的唯一真源） ----------
  // 外观四向 → 单位向量。front=朝屏幕下方(南)，back=朝上方(北)。
  function facingVector(dir) {
    return dir === 'left' ? { x: -1, y: 0 } : dir === 'right' ? { x: 1, y: 0 }
      : dir === 'back' ? { x: 0, y: -1 } : { x: 0, y: 1 };
  }
  // 电梯不分上下方向：任何一部都能乘到任意其它楼层（客户端弹选层）。
  // 资格：inReach（进入交互半径）/ facingOk（面向门，cos≥0.5）/ allowed（可提交）。
  function portalAccess(actor, portal, range = INTERACT_RANGE) {
    if (!actor || !portal) return { inReach: false, facingOk: false, allowed: false, reason: '无可用电梯门' };
    if (actor.floorId !== portal.floorId || !inHall(portal.floorId, portal.side, actor.x, actor.y))
      return { inReach: false, facingOk: false, allowed: false, reason: '请穿过玻璃门进入电梯厅后乘梯' };
    const dx = portal.x - actor.x, dy = portal.y - actor.y, d = Math.hypot(dx, dy);
    if (d > range) return { inReach: false, facingOk: false, allowed: false, reason: '距离电梯太远，请靠近后再按 E（64 像素以内）' };
    if (d === 0) return { inReach: true, facingOk: true, allowed: true, reason: '' };
    const f = facingVector(actor.spriteFacing);
    const facingOk = (dx * f.x + dy * f.y) / d >= 0.5;
    if (!facingOk) return { inReach: true, facingOk: false, allowed: false, reason: '请面向电梯门后再按 E' };
    return { inReach: true, facingOk: true, allowed: true, reason: '' };
  }
  const SKIN = ['#eabb94', '#d3a58a', '#c08e73', '#e8c3a3', '#cf9d7e'];
  const characterShadeCache = new Map();
  function characterShade(hex, k) {
    const key = hex + '|' + k;
    if (characterShadeCache.has(key)) return characterShadeCache.get(key);
    const n = parseInt(hex.slice(1), 16), t = k > 0 ? 255 : 8, a = Math.min(1, Math.abs(k));
    const ch = c => Math.round(c + (t - c) * a);
    const color = '#' + ((1 << 24) | (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
    characterShadeCache.set(key, color);
    return color;
  }
  const ATTACK_ANIMATION_MS = 260;
  // 袖口、前臂、握点与木锤共用同一组关节；逐像素栅格化，旋转时不产生平滑边缘。
  function drawCharacterAttack(rect, x, y, direction, age, colors) {
    const t = age / ATTACK_ANIMATION_MS;
    const side = direction === 'left' || direction === 'right', back = direction === 'back';
    const poses = side
      ? [[2, -17, -.9], [-5, -40, -2.1], [16, -23, .2], [2, -17, -.9]]
      : back ? [[-14, -19, -1.3], [-21, -36, -2.3], [-17, -43, -1.1], [-14, -19, -1.3]]
        : [[14, -17, -1.2], [21, -38, -1.9], [10, -12, .9], [14, -17, -1.2]];
    const times = [0, .22, .62, 1];
    const i = t < times[1] ? 0 : t < times[2] ? 1 : 2;
    const u = (t - times[i]) / (times[i + 1] - times[i]), eased = u * u * (3 - 2 * u);
    const mix = (a, b) => a + (b - a) * eased;
    const hand = { x: mix(poses[i][0], poses[i + 1][0]), y: mix(poses[i][1], poses[i + 1][1]) };
    const angle = mix(poses[i][2], poses[i + 1][2]);
    const shoulder = { x: side ? 0 : back ? -11 : 11, y: -28 };
    const elbow = { x: shoulder.x + (hand.x - shoulder.x) * .55 + (back ? -3 : 3),
      y: shoulder.y + (hand.y - shoulder.y) * .55 + 3 };
    const pixel = (px, py, w, h, color) => rect(x + (direction === 'left' ? -px - w : px), y + py, w, h, color);
    const segment = (a, b, width, color) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= steps; j++) {
        pixel(Math.round(a.x + (b.x - a.x) * j / steps) - Math.floor(width / 2),
          Math.round(a.y + (b.y - a.y) * j / steps) - Math.floor(width / 2), width, width, color);
      }
    };
    segment(shoulder, elbow, 7, colors.outline); segment(elbow, hand, 6, colors.outline);
    segment(shoulder, elbow, 5, colors.topLo); segment(elbow, hand, 4, colors.skinLo);
    segment({ x: shoulder.x - 1, y: shoulder.y - 1 }, { x: elbow.x - 1, y: elbow.y - 1 }, 2, colors.topHi);
    const vx = Math.cos(angle), vy = Math.sin(angle);
    const handleEnd = { x: hand.x + vx * 16, y: hand.y + vy * 16 };
    const handleButt = { x: hand.x - vx * 3, y: hand.y - vy * 3 };
    segment(handleButt, handleEnd, 5, colors.outline);
    segment(handleButt, handleEnd, 3, '#986039');
    // 锤头的横轴始终垂直于锤柄，保留深棕端面、暖木色与木纹。
    for (let py = Math.floor(handleEnd.y - 11); py <= Math.ceil(handleEnd.y + 11); py++) {
      for (let px = Math.floor(handleEnd.x - 11); px <= Math.ceil(handleEnd.x + 11); px++) {
        const dx = px - handleEnd.x, dy = py - handleEnd.y;
        const along = dx * vx + dy * vy, across = -dx * vy + dy * vx;
        if (Math.abs(along) > 5 || Math.abs(across) > 9) continue;
        const color = Math.abs(along) > 4 || Math.abs(across) > 8 ? colors.outline
          : across > 5 ? '#75472d' : along < -2 ? '#ddb078'
            : Math.abs(along - 1) < .6 ? '#a36b40' : '#bd8750';
        pixel(px, py, 1, 1, color);
      }
    }
    // 手掌最后盖住锤柄握点，不能出现柄与手分离的悬浮武器。
    pixel(Math.round(hand.x) - 3, Math.round(hand.y) - 3, 6, 6, colors.outline);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) - 2, 4, 4, colors.skin);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) + 1, 4, 1, colors.skinLo);
  }
  // 可选攻击 age 单位为毫秒；固定攻击方向只影响这次挥击，待机/走路仍使用原外观。
  function drawCharacterBody(g, p, clock, attackAgeMs = null, attackDirection = null) {
    g.save();
    const rect = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const shade = characterShade, x = Math.round(p.x), c = p.colors;
    const hi = Math.max(0, PALETTES.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], skinLo = shade(skin, -.24);
    const hair = c.hair[1], hairHi = shade(hair, .3), hairLo = shade(hair, -.3);
    const top = c.top[1], topHi = shade(top, .24), topLo = shade(top, -.3);
    const pants = c.pants[1], pantsHi = shade(pants, .18), pantsLo = shade(pants, -.26);
    const shoes = c.shoes[1], shoeLo = shade(shoes, -.32), OL = '#1c1620';
    const ph = (p.walk || 0) * .13, sw = p.moving ? Math.sin(ph) : 0;
    const bob = p.moving ? -Math.round(Math.abs(Math.sin(ph)) * 2) : Math.round(Math.sin(clock * 1.5 + (p.spriteIndex ?? p.id) * 1.9) * .7);
    const yb = Math.round(p.y) + bob;
    const liftL = Math.max(0, sw) * 2, liftR = Math.max(0, -sw) * 2, arm = Math.round(-sw * 1.6);
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    const attacking = p.alive && Number.isFinite(attackAgeMs) && attackAgeMs >= 0 && attackAgeMs < ATTACK_ANIMATION_MS;
    const direction = (attacking ? attackDirection : p.spriteFacing) || p.spriteFacing || 'front';
    const drawAttack = () => drawCharacterAttack(rect, x, yb, direction, attackAgeMs,
      { outline: OL, skin, skinLo, topLo, topHi });
    g.globalAlpha = .3 * a;
    rect(x - 11, p.y + 2, 22, 5, '#0f0a12'); rect(x - 8, p.y + 1, 16, 6, '#0f0a12');
    g.globalAlpha = a;
    if (direction === 'left' || direction === 'right') {
      // 以右侧面为基准逐块镜像，远侧肢体先画、近侧后画，两个步行相位相反。
      const sideRect = (sx, sy, w, h, color) => rect(x + (direction === 'left' ? -sx - w : sx), yb + sy, w, h, color);
      const layer = parts => {
        for (const q of parts) sideRect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
        for (const q of parts) sideRect(...q);
      };
      const stride = Math.round(sw * 4), farArm = Math.round(sw * 3);
      layer([
        [-5 - stride, -12, 6, 9 - liftR, pantsLo], [-5 - stride, -3 - liftR, 10, 4, shoeLo],
        [-4 + farArm, -30, 4, 12, topLo], [-4 + farArm, -19, 4, 5, skinLo]
      ]);
      layer([[-7, -17, 14, 6, pants], [-7, -31, 14, 16, top]]);
      sideRect(-7, -31, 14, 2, topHi); sideRect(-7, -17, 14, 2, topLo);
      sideRect(-7, -31, 2, 16, topLo); sideRect(5, -29, 2, 12, shade(top, .1));
      sideRect(-7, -17, 14, 1, shade(pants, -.5));
      layer([[-3 + stride, -12, 6, 9 - liftL, pantsLo], [-3 + stride, -3 - liftL, 10, 4, shoes]]);
      sideRect(-3 + stride, -12, 6, 2, pantsHi); sideRect(-3 + stride, -liftL, 10, 1, shoeLo);
      if (!attacking) {
        layer([[-2 - farArm, -30, 5, 12, topLo], [-2 - farArm, -19, 5, 5, skin]]);
        sideRect(-2 - farArm, -29, 2, 10, topHi);
      }
      const head = [[-3, -34, 6, 5, skinLo], [-7, -47, 14, 16, skin],
        [7, -41, 3, 4, skin], [-8, -49, 16, 7, hair], [-8, -44, 7, 12, hairLo]];
      const style = hi % 4;
      if (style === 1) head.push([-9, -44, 5, 16, hair]);
      if (style === 2) head.push([-11, -43, 4, 12, hairLo]);
      if (style === 3) head.push([-5, -53, 8, 5, hair]);
      layer(head);
      sideRect(-6, -48, 8, 2, hairHi); sideRect(-2, -41, 3, 4, skinLo); sideRect(-2, -41, 2, 3, skin);
      sideRect(3, -45, 3, 1, hairLo); sideRect(4, -43, 2, 3, '#2b2230'); sideRect(5, -43, 1, 1, '#f4f8ff');
      sideRect(8, -39, 2, 1, skinLo); sideRect(5, -36, 2, 1, '#a8706a');
      if (attacking) drawAttack(); // 侧面握锤的是近侧手臂，覆盖躯干与头部边缘。
    } else {
      const back = direction === 'back';
      if (attacking && back) drawAttack(); // 朝后挥击先画，随后由背部与后脑自然遮挡。
      const parts = [
        [x - 11, yb - 3 - liftL, 10, 4, shoes], [x + 1, yb - 3 - liftR, 10, 4, shoes],
        [x - 9, yb - 12, 7, 9 - liftL, pantsLo], [x + 2, yb - 12, 7, 9 - liftR, pantsLo],
        [x - 10, yb - 17, 20, 6, pants],
        [x - 11, yb - 31, 22, 16, top],
        [x - 16, yb - 30 + arm, 5, 12, topLo], [x + 11, yb - 30 - arm, 5, 12, topLo],
        [x - 16, yb - 19 + arm, 5, 5, skin], [x + 11, yb - 19 - arm, 5, 5, skin],
        [x - 4, yb - 34, 8, 5, skinLo],
        [x - 10, yb - 47, 20, 16, back ? hair : skin],
        [x - 11, yb - 49, 22, 7, hair]
      ];
      if (attacking) {
        const sleeveIndex = back ? 6 : 7;
        parts.splice(sleeveIndex + 2, 1); parts.splice(sleeveIndex, 1);
      }
      const style = hi % 4;
      if (style === 1) parts.push([x - 13, yb - 44, 3, 16, hair], [x + 10, yb - 44, 3, 16, hair]);
      else parts.push([x - 12, yb - 44, 3, 10, hairLo], [x + 9, yb - 44, 3, 10, hairLo]);
      if (style === 2) parts.push([x + 11, yb - 43, 4, 12, hairLo]);
      if (style === 3) parts.push([x - 5, yb - 53, 10, 5, hair]);
      for (const q of parts) rect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
      for (const q of parts) rect(...q);
      rect(x - 9, yb - 48, 9, 2, hairHi);
      rect(x - 11, yb - 31, 22, 2, topHi); rect(x - 11, yb - 17, 22, 2, topLo);
      rect(x - 11, yb - 31, 2, 16, shade(top, .1)); rect(x + 9, yb - 31, 2, 16, topLo);
      if (!back) rect(x - 1, yb - 31, 2, 5, shade(top, -.45));
      rect(x - 10, yb - 17, 20, 1, shade(pants, -.5));
      rect(x - 9, yb - 12, 7, 2, pantsHi); rect(x + 2, yb - 12, 7, 2, pantsHi);
      rect(x - 11, yb - liftL, 10, 1, shoeLo); rect(x + 1, yb - liftR, 10, 1, shoeLo);
      if (back) {
        rect(x - 10, yb - 35, 20, 4, hairLo); rect(x - 8, yb - 44, 3, 8, shade(hair, .1));
        rect(x - 8, yb - 28, 16, 1, shade(top, .1));
      } else {
        rect(x - 11, yb - 40, 1, 4, skinLo); rect(x + 10, yb - 40, 1, 4, skinLo);
        rect(x - 8, yb - 45, 4, 1, hairLo); rect(x + 4, yb - 45, 4, 1, hairLo);
        rect(x - 7, yb - 43, 3, 3, '#2b2230'); rect(x + 4, yb - 43, 3, 3, '#2b2230');
        rect(x - 7, yb - 43, 1, 1, '#f4f8ff'); rect(x + 4, yb - 43, 1, 1, '#f4f8ff');
        rect(x - 1, yb - 39, 2, 1, skinLo);
        rect(x - 3, yb - 36, 6, 1, '#a8706a'); rect(x - 4, yb - 37, 1, 1, '#a8706a'); rect(x + 3, yb - 37, 1, 1, '#a8706a');
      }
      if (attacking && !back) drawAttack(); // 朝前的手臂与木锤处于身体前景。
    }
    g.restore();
  }
  const WORLD = {
    WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_X, MAX_X, MIN_Y, MAX_Y,
    // 后墙墙带高度（世界像素）：墙带覆盖楼面北侧 y<WALL_BASE 的区域，属纯背景，不参与碰撞。
    // 两端 drawBackWall 与 shared/scene.js 的家具裁剪共用此值，避免"家具画到墙上"。
    WALL_BASE: 58,
    BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, PALETTES,
    makeFurniture, collidesAt, coverFor, pointOccluded, distanceToEntity, INTERACT_RANGE, NPCS,
    deskIsland, deskBranch,
    facingVector, portalAccess, floorPortal, elevatorLanding,
    PLAY_CONFIG, rpsOutcome, lineClear, spriteDirection, drawCharacterBody, ATTACK_ANIMATION_MS,
    RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool,
    // 七层楼层数据与查询接口（服务端权威、两端同源）。
    FLOOR_BASE_HEIGHT, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, FLOORS, CONTAINER_NAMES, floorById, floorBlockers,
    floorOptions, inHall, advanceGlassDoors, cameraBounds,
    floorFurniture, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorNpcs, floorContainers,
    FLOOR_COUNT: FLOOR_SPECS.length,
    inFloor, floorCollides, floorBounds,
    // 肢体互动（跳跃 / 锤子）共享数值表：服务端判定与客户端渲染同源。
    ACTION
  };
  root.WORLD = WORLD;
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).WORLD;
