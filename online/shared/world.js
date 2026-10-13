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
    BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, PALETTES,
    makeFurniture, collidesAt, coverFor, pointOccluded, distanceToEntity, INTERACT_RANGE, NPCS,
    PLAY_CONFIG, rpsOutcome, lineClear, spriteDirection, drawCharacterBody, ATTACK_ANIMATION_MS,
    RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool
  };
  root.WORLD = WORLD;
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).WORLD;
