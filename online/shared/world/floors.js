'use strict';
// 七层楼面数据、建造、查询与乘梯资格判定（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js'), { TMJ: require('./tmj.js') }, require('./geometry.js'), require('./furniture.js'), require('./dressing.js'), require('./sprite-bounds.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { lineClear, collidesAt, coverFor, pointOccluded, facingVector, blocksFor, DOOR_HALF_PX_H, DOOR_HALF_PX_V, INTERACT_RANGE, DRESSING, THEME_PROP, SPRITE_BOUNDS, TMJ, BODY_HALF, FOOT_TOP, FOOT_BOTTOM } = D;
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
  // 楼层尺寸可缩放：所有布局都是 1500×1000 归一化坐标，改比例即整体放大，不用重画。
  // 倍数来自 config.js 的单一来源（服务端与浏览器一致）；默认 2 → 2880×800。
  const FLOOR_SCALE = D.FLOOR_SCALE || 1;
  const FLOOR_W = Math.round(1440 * FLOOR_SCALE), FLOOR_H = Math.round(400 * FLOOR_SCALE); // 每层世界像素尺寸
  const X_SPAN = 1500, Y_SPAN = 1000;
  // 电梯厅尺寸随楼层同比例缩放，否则放大后厅会缩成一个小方块、门也错位。
  const LIFT_CONFIG = Object.freeze({
    hallW: Math.round(144 * FLOOR_SCALE), hallH: Math.round(96 * FLOOR_SCALE),
    opening: Math.round(48 * FLOOR_SCALE), trigger: Math.round(38 * FLOOR_SCALE), closeDelayMs: 650
  });
  // 归一化坐标 → 世界像素（x/y 各按自身设计跨度换算，保持 2.4:1 斜俯视与既有像素尺度）。
  const nX = v => Math.round(v / X_SPAN * FLOOR_W);
  const nY = v => Math.round(v / Y_SPAN * FLOOR_H);
  const nRect = c => { const x1 = nX(c[0]), y1 = nY(c[1]), x2 = nX(c[2]), y2 = nY(c[3]); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; };
  // 放大楼层时，家具**位置**随楼面摊开，但**尺寸**回到 1×：精灵本身就按原像素绘制，
  // 保留放大后的矩形会让碰撞比画面大一圈（"空气墙"），也会让人走进家具上半截。
  // 做法 = 以放大后矩形的中心为锚点，把宽高缩回 1/S；scale=1 时是恒等变换。
  const visualRect = (r, isContainer = false) => {
    if (FLOOR_SCALE === 1) return r;
    const mul = isContainer ? 1.0 : 1.35;
    const w = Math.max(1, Math.round((r.w / FLOOR_SCALE) * mul));
    const h = Math.max(1, Math.round((r.h / FLOOR_SCALE) * mul));
    return { x: Math.round(r.x + (r.w - w) / 2), y: Math.round(r.y + (r.h - h) / 2), w, h };
  };
  // 七层各自独立的建筑外轮廓（0–1500 × 0–1000 归一化）：
  // 保持北侧 y=0..280 贯通 0..1500 以衔接东西双电梯厅，2F..6F 保留西南缺口契约，每层拥有独一无二的平面几何形状。
  const OUTLINE_1F = [[0, 0], [1500, 0], [1500, 680], [1390, 680], [1390, 1000], [110, 1000], [110, 640], [0, 640]];
  const OUTLINE_2F = [[0, 0], [1500, 0], [1500, 620], [1280, 620], [1280, 1000], [240, 1000], [240, 560], [0, 560]];
  const OUTLINE_3F = [[0, 0], [1500, 0], [1500, 720], [1360, 720], [1360, 1000], [320, 1000], [320, 780], [180, 780], [180, 500], [0, 500]];
  const OUTLINE_4F = [[0, 0], [1500, 0], [1500, 820], [1220, 820], [1220, 1000], [280, 1000], [280, 820], [150, 820], [150, 520], [0, 520]];
  const OUTLINE_5F = [[0, 0], [1500, 0], [1500, 680], [1360, 680], [1360, 860], [1140, 860], [1140, 1000], [360, 1000], [360, 680], [160, 680], [160, 500], [0, 500]];
  const OUTLINE_6F = [[0, 0], [1500, 0], [1500, 760], [1400, 760], [1400, 1000], [420, 1000], [420, 840], [260, 840], [260, 640], [140, 640], [140, 480], [0, 480]];
  const OUTLINE_7F = [[0, 0], [1500, 0], [1500, 580], [1380, 580], [1380, 1000], [120, 1000], [120, 580], [0, 580]];
  const FULL_RECT = OUTLINE_1F, L24 = OUTLINE_2F, L56 = OUTLINE_5F;
  // 1F 试点：以「2× 世界像素」直接写成品尺寸，换算回 1500×1000 设计坐标。
  // visualRect 会把非容器 ×1.35/S、容器 ×1/S 缩放，这里预先反算，保证最终 rect = 所写 px。
  const P1 = (type, label, x, y, w, h, flag) => {
    const mul = (typeof flag === 'string' && flag.indexOf('container:') === 0) ? 1 : 1.35;
    const cx = x + w / 2, cy = y + h / 2, dw = w * 2 / mul, dh = h * 2 / mul;
    const row = [type, label, (cx - dw / 2) / 1.92, (cy - dh / 2) / 0.8, (cx + dw / 2) / 1.92, (cy + dh / 2) / 0.8];
    if (flag) row.push(flag);
    return row;
  };
  const PX1 = (x, y) => [x / 1.92, y / 0.8];

  // 点是否在楼面轮廓内（本地版本，建造期 FLOORS 还没注册，不能调 inFloor）。
  const pointInPoly = (poly, x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  function buildMazeLayout(spec) {
    const { cols, rows, seed } = spec.maze;
    const gw = cols * 2 + 1, gh = rows * 2 + 1;
    const g = Array.from({ length: gh }, () => Array(gw).fill(1));
    let s = (seed >>> 0) || 5;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const stack = [[1, 1]]; g[1][1] = 0;
    const dirs = [[0, -2], [0, 2], [-2, 0], [2, 0]];
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = dirs.map(([dx, dy]) => [cx + dx, cy + dy, dx, dy])
        .filter(([x, y]) => x > 0 && y > 0 && x < gw - 1 && y < gh - 1 && g[y][x] === 1);
      if (!opts.length) { stack.pop(); continue; }
      const [nx, ny, dx, dy] = opts[Math.floor(rnd() * opts.length)];
      g[cy + dy / 2][cx + dx / 2] = 0; g[ny][nx] = 0;
      stack.push([nx, ny]);
    }
    for (let y = 2; y < gh - 2; y += 2) for (let x = 1; x < gw - 1; x++) if (g[y][x] === 1 && rnd() < 0.10) g[y][x] = 0;
    g[1][0] = 0; g[1][gw - 1] = 0;
    const cellW = FLOOR_W / gw, cellH = FLOOR_H / gh;
    const poly = spec.outline.map(([x, y]) => ({ x: nX(x), y: nY(y) }));
    const inside = (x, y) => pointInPoly(poly, x, y);
    const walls = []; let wid = 0;
    for (let ry = 0; ry < gh; ry++) {
      let run = 0;
      for (let rx = 0; rx <= gw; rx++) {
        const isWall = rx < gw && g[ry][rx] === 1 && inside((rx + 0.5) * cellW, (ry + 0.5) * cellH);
        if (isWall) { run++; continue; }
        if (run) {
          const x = Math.round((rx - run) * cellW), y = Math.round(ry * cellH);
          const w = Math.round(run * cellW), h = Math.round(cellH);
          walls.push({ id: `f${spec.id}:wall:maze:${wid++}`, x, y, w, h, type: 'wall',
            footprint: { x, y, w, h }, depth: y + h });
          run = 0;
        }
      }
    }
    const open = [];
    for (let ry = 1; ry < gh; ry += 2) for (let rx = 1; rx < gw; rx += 2) {
      if (g[ry][rx] !== 0) continue;
      const x = (rx + 0.5) * cellW, y = (ry + 0.5) * cellH;
      if (inside(x, y)) open.push({ x, y });
    }
    const spawnsNorm = [];
    for (let i = 0; i < open.length && spawnsNorm.length < 12; i += Math.max(1, Math.floor(open.length / 12))) {
      spawnsNorm.push([open[i].x / FLOOR_W * X_SPAN, open[i].y / FLOOR_H * Y_SPAN]);
    }
    spawnsNorm.sort((a, b) => Math.hypot(a[0] - 750, a[1] - 500) - Math.hypot(b[0] - 750, b[1] - 500));
    return { walls, open, cellW, cellH, spawnsNorm };
  }

  const FLOOR_SPECS = [
    // ===== 1F · 晨光迎宾小镇厅（T 型阶梯广场：西迎宾厅 + 中央圆形花坛广场 + 南红格桌布烘焙餐厅 + 东市集） =====
    { id: 1, name: '1F · 晨光迎宾厅', source: 'original', outline: OUTLINE_1F,
      zones: ['接待区', '晨光广场', '食堂', '后厨取餐', '核心筒', '东侧市集翼'], stairLeft: [70, 560], stairRight: [1220, 620],
      furniture: [
        ['sofa', '迎宾等候沙发', 215, 275, 385, 355],
        ['cabinet', '大厅储物柜', 415, 275, 525, 355, 'container:hall1'],
        ['cabinet', '核心筒', 25, 420, 105, 580],
        // 南侧红格桌布阳光烘焙餐厅（x=320..920, y=540..960）
        ['table', '烘焙餐桌一', 345, 555, 475, 645, 'container:table1'],
        ['table', '烘焙餐桌二', 555, 555, 685, 645],
        ['table', '烘焙餐桌三', 765, 555, 895, 645],
        ['table', '烘焙餐桌四', 345, 725, 475, 815],
        ['table', '烘焙餐桌五', 555, 725, 685, 815],
        ['table', '烘焙餐桌六', 765, 725, 895, 815],
        ['counter', '鲜果烘焙取餐台', 425, 875, 615, 965, 'container:counter'],
        ['cabinet', '果酱点心边柜', 665, 875, 815, 965],
        // 东侧社区市集与阅读翼（x=1040..1360）
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['sofa', '东廊沐光沙发', 1255, 110, 1415, 195],
        ['table', '社区共读桌', 1165, 315, 1235, 395]
      ],
      npcs: [{ slug: 'reception', name: '数字员工JULI', x: 280, y: 175, dialogue: '你好，我是数字员工JULI，需要用金币交换一条办公室线索吗？', cost: 3 }],
      walls: [['h', 395, 140, 480], ['h', 495, 200, 480], ['h', 495, 640, 920], ['h', 520, 1040, 1340]],
      spawns: [[80, 320], [500, 240], [725, 320], [520, 470], [920, 320], [1080, 460], [1080, 820]] },

    // ===== 2F · 晴空绿茵体育场（体育场碗形轮廓：中央绿茵足球场 + 北冠军奖杯看台 + 西更衣果汁吧 + 南替补席） =====
    { id: 2, name: '2F · 晴空绿茵场', source: 'real', outline: OUTLINE_2F,
      zones: ['220 会议室', '冠军看台', '核心筒', '绿茵球场', '茶水间', '南看台替补席', '205', '206', '东侧俱乐部'],
      stairLeft: [70, 480], stairRight: [1220, 560],
      furniture: [
        ['table', '220 战术会议桌', 65, 105, 195, 195],
        ['desk', '教练战术台', 265, 105, 405, 195, 'container:desk1'],
        ['shelf', '冠军金杯架', 915, 95, 1035, 185],
        ['cabinet', '球员储物柜', 25, 365, 125, 455, 'container:cabinet'],
        ['counter', '鲜榨能量果汁吧', 135, 365, 235, 455],
        ['mat', '西侧热身草垫', 395, 385, 515, 475],
        ['mat', '东侧热身草垫', 925, 385, 1045, 475],
        ['rack', '西侧敏捷器材架', 395, 565, 495, 655],
        ['rack', '东侧敏捷器材架', 945, 565, 1045, 655],
        ['cabinet', '赛会记录柜', 1245, 105, 1365, 195, 'container:printer2'],
        ['sofa', '主队替补长椅', 395, 875, 565, 960],
        ['table', '中场橙汁补给桌', 625, 875, 775, 960],
        ['sofa', '客队替补长椅', 815, 875, 965, 960],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560]
      ],
      walls: [['h', 330, 15, 225], ['h', 268, 360, 590], ['h', 268, 850, 1080], ['h', 600, 1120, 1265]],
      npcs: [{ slug: 'f2', name: '数字员工JULI', x: 528, y: 268, dialogue: '你好，我是数字员工JULI，可用金币兑换积分、属性或线索效果，也可参与幸运大转盘。', cost: 3 }],
      spawns: [[330, 320], [540, 340], [720, 520], [900, 340], [540, 760], [900, 760], [1080, 480]] },

    // ===== 3F · 暖木学者书院与画廊（古典书院轮廓：北皇家藏书长廊 + 西茗茶修复室 + 中央红毯共读厅 + 东手绘画廊） =====
    { id: 3, name: '3F · 暖木藏书阁', source: 'real', outline: OUTLINE_3F,
      zones: ['301', '藏书长廊', '303', '核心筒', '茗茶修复室', '中央共读厅', '305', '讨论区', '东侧手绘画廊'],
      stairLeft: [70, 450], stairRight: [1220, 620],
      furniture: [
        ['shelf', '古籍善本架一', 65, 95, 195, 185],
        ['shelf', '古籍善本架二', 225, 95, 355, 185],
        ['desk', '首席司书案', 395, 100, 545, 195, 'container:desk2'],
        ['shelf', '古籍善本架三', 575, 95, 695, 185],
        ['shelf', '古籍善本架四', 995, 95, 1115, 185],
        ['cabinet', '核心筒', 25, 315, 125, 455],
        ['cabinet', '善本修复资料柜', 385, 355, 505, 445, 'container:docs3'],
        ['table', '茗茶品茗台', 215, 515, 355, 605],
        ['desk', '古籍临摹台', 385, 515, 525, 605],
        ['desk', '学者共读长案一', 685, 365, 865, 455],
        ['desk', '学者共读长案二', 685, 525, 865, 615],
        ['sofa', '书院绒面阅读座', 905, 525, 1055, 610],
        ['table', '研讨长桌一', 625, 715, 785, 805],
        ['table', '研讨长桌二', 845, 715, 1005, 805],
        ['table', '南窗诗集桌', 685, 865, 865, 955],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560]
      ],
      walls: [['h', 480, 200, 490], ['h', 310, 600, 780], ['h', 310, 880, 1060], ['v', 565, 330, 630], ['h', 520, 1120, 1340]],
      npcs: [{ slug: 'archive', name: '档案员阿卷', x: 280, y: 295, dialogue: '我可以帮你寻找一条尚未掌握的线索。', cost: 3 }],
      spawns: [[80, 250], [340, 260], [620, 260], [640, 480], [820, 660], [960, 480], [1080, 480], [1080, 820]] },

    // ===== 4F · 阳光玻璃花房与果木温室（阶梯温室轮廓：北育苗花廊 + 西果木苗圃 + 中央玻璃花坛 + 东香草茶歇露台） =====
    { id: 4, name: '4F · 阳光花房层', source: 'real', outline: OUTLINE_4F,
      zones: ['育苗花廊', '果木苗圃', '404', '核心筒', '茶水间', '中央花坛', '讨论区', '香草工坊', '东侧露台'],
      stairLeft: [70, 460], stairRight: [1220, 620],
      furniture: [
        ['table', '育苗浸种台', 65, 100, 195, 190],
        ['desk', '植物图谱记录台', 265, 100, 425, 195, 'container:desk3'],
        ['plant', '北廊向日葵花箱', 445, 105, 505, 185],
        ['cabinet', '核心筒', 25, 315, 125, 455],
        ['table', '果木嫁接工作台一', 215, 335, 365, 425],
        ['table', '果木嫁接工作台二', 395, 335, 545, 425],
        ['table', '盆栽换土台', 335, 515, 495, 605],
        ['plant', '西圃蜜柑树箱', 215, 515, 295, 600],
        ['cabinet', '珍稀花种储藏柜', 745, 335, 875, 425, 'container:ticket4'],
        ['plant', '中央花坛花箱一', 905, 335, 985, 415],
        ['table', '香草纯露手作台', 655, 485, 815, 575],
        ['sofa', '花房藤编沙发', 845, 485, 1005, 575],
        ['table', '干花压制长桌', 805, 625, 965, 715],
        ['table', '南温室育苗台一', 425, 865, 575, 955],
        ['table', '南温室育苗台二', 645, 865, 795, 955],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['sofa', '东花廊观景沙发', 1325, 105, 1465, 190],
        ['table', '花草茶品鉴桌', 1245, 615, 1345, 700]
      ],
      walls: [['h', 285, 200, 520], ['h', 595, 640, 960], ['h', 485, 1100, 1420]],
      npcs: [{ slug: 'f4', name: '数字员工JULI', x: 354, y: 300, dialogue: '你好，我是数字员工JULI，可用金币兑换积分、属性或线索效果，也可参与幸运大转盘。', cost: 3 }],
      spawns: [[80, 250], [320, 250], [600, 260], [600, 460], [600, 760], [1040, 460], [1040, 760]] },

    // ===== 5F · 暖灯星象古籍馆（对称十字博物馆轮廓：中央金辉星盘圆厅 + 北星图壁龛 + 西矿石翼 + 南星象讲堂） =====
    { id: 5, name: '5F · 暖灯古籍廊', source: 'real', outline: OUTLINE_5F,
      zones: ['501', '星图壁龛', '核心筒', '矿石标本翼', '金辉星盘圆厅', '星象讲堂', '509', '茶水间', '东侧观星翼'],
      stairLeft: [70, 250], stairRight: [1220, 580],
      furniture: [
        ['shelf', '星象古籍架一', 65, 95, 195, 185],
        ['shelf', '星象古籍架二', 235, 95, 365, 185],
        ['desk', '星图测绘长案', 415, 100, 585, 195],
        ['shelf', '星象古籍架三', 975, 95, 1095, 185],
        ['sofa', '北廊观星软榻', 1215, 100, 1375, 190],
        ['cabinet', '核心筒', 25, 315, 125, 455],
        ['table', '矿石标本展台一', 195, 485, 345, 575],
        ['cabinet', '司天监值班柜', 605, 285, 725, 375, 'container:duty5'],
        ['desk', '浑天仪观测台', 765, 285, 905, 375],
        ['table', '琥珀化石展台', 555, 515, 725, 610, 'container:table2'],
        ['sofa', '星盘圆厅绒面座', 775, 515, 945, 605],
        ['table', '星象讲堂长桌一', 515, 725, 675, 815],
        ['table', '星象讲堂长桌二', 735, 725, 895, 815],
        ['table', '南廊典藏品鉴桌', 615, 865, 795, 955],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560]
      ],
      walls: [['v', 455, 295, 585], ['v', 1045, 295, 585], ['h', 665, 455, 655], ['h', 665, 845, 1045]],
      npcs: [{ slug: 'f5', name: '数字员工JULI', x: 583, y: 268, dialogue: '你好，我是数字员工JULI，可用金币兑换积分、属性或线索效果，也可参与幸运大转盘。', cost: 3 }],
      spawns: [[360, 250], [750, 240], [750, 450], [500, 640], [750, 840], [1080, 250], [1080, 620]] },

    // ===== 6F · 晴海甲板甜品舱（游轮观景甲板轮廓：北舷窗观海廊 + 西海盐冰淇淋吧 + 中央蓝毯下午茶沙龙） =====
    { id: 6, name: '6F · 晴海甜品舱', source: 'real', outline: OUTLINE_6F,
      zones: ['604', '舷窗观海廊', '核心筒', '冰淇淋吧', '甜品工坊', '下午茶沙龙', '糖果展台', '东侧甲板'],
      stairLeft: [70, 250], stairRight: [1220, 620],
      furniture: [
        ['table', '观海茶座一', 65, 100, 195, 190],
        ['table', '观海茶座二', 255, 100, 385, 190],
        ['table', '观海茶座三', 445, 100, 585, 190],
        ['sofa', '北廊海景卡座', 1165, 100, 1335, 190],
        ['plant', '缤纷糖果树一', 1365, 105, 1435, 185],
        ['cabinet', '核心筒', 25, 315, 125, 445],
        ['counter', '焦糖华夫与冰淇淋吧', 305, 315, 485, 405],
        ['cabinet', '船长甜品金库', 445, 525, 545, 615, 'container:safe6'],
        ['table', '西甲板海风茶座', 305, 685, 445, 775],
        ['table', '三层塔下午茶桌一', 705, 385, 865, 475],
        ['sofa', '晴海蓝绒卡座一', 915, 385, 1085, 475],
        ['table', '三层塔下午茶桌二', 645, 565, 805, 655],
        ['sofa', '晴海蓝绒卡座二', 865, 565, 1035, 655],
        ['desk', '翻糖礼盒包装台', 645, 725, 825, 815, 'container:desk4'],
        ['table', '马卡龙品鉴圆桌', 885, 725, 1045, 815],
        ['table', '南甲板观浪茶座', 745, 865, 925, 955],
        ['plant', '缤纷糖果树二', 1085, 735, 1155, 815],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560]
      ],
      walls: [['h', 465, 160, 495], ['h', 330, 595, 845], ['h', 330, 965, 1265], ['v', 575, 485, 785]],
      npcs: [{ slug: 'f6', name: '数字员工JULI', x: 552, y: 268, dialogue: '你好，我是数字员工JULI，可用金币兑换积分、属性或线索效果，也可参与幸运大转盘。', cost: 3 }],
      spawns: [[480, 250], [220, 540], [640, 260], [620, 500], [850, 500], [620, 860], [1120, 500], [1120, 860]] },

    // ===== 7F · 云端晚霞音乐露台（空中露台轮廓：北中音乐厅大舞台 + 中央礼堂坐席 + 西云端健身阁 + 南晚霞果饮吧 + 东文创市集） =====
    { id: 7, name: '7F · 云端露台层', source: 'original', outline: OUTLINE_7F,
      zones: ['云端健身阁', '更衣室', '露天音乐舞台', '礼堂坐席', '晚霞果饮吧', '核心筒', '东侧文创市集'], stairLeft: [70, 520], stairRight: [1220, 520],
      furniture: [
        ['treadmill', '云端慢跑机一', 65, 95, 145, 175],
        ['treadmill', '云端慢跑机二', 165, 95, 245, 175],
        ['treadmill', '云端慢跑机三', 265, 95, 345, 175],
        ['rack', '轻木哑铃架', 365, 95, 455, 175],
        ['mat', '阳光瑜伽垫', 195, 225, 335, 310],
        ['cabinet', '核心筒', 25, 405, 115, 545],
        ['cabinet', '露台原木更衣柜', 185, 405, 305, 495, 'container:locker'],
        ['stage', '云端露天音乐舞台', 585, 110, 965, 245],
        ['seat', '音乐厅西一排', 565, 315, 735, 380],
        ['seat', '音乐厅西二排', 565, 415, 735, 480],
        ['seat', '音乐厅西三排', 565, 515, 735, 580],
        ['seat', '音乐厅东一排', 815, 315, 985, 380],
        ['seat', '音乐厅东二排', 815, 415, 985, 480],
        ['seat', '音乐厅东三排', 815, 515, 985, 580],
        ['counter', '晚霞鲜果特饮吧', 545, 705, 725, 795, 'container:bar7'],
        ['sofa', '晚霞观景沙发西', 315, 705, 485, 795],
        ['table', '露台星光茶座一', 315, 855, 465, 945],
        ['table', '露台星光茶座二', 555, 855, 705, 945],
        ['sofa', '晚霞观景沙发东', 785, 855, 955, 945],
        ['cabinet', '东侧电梯厅', 1140, 400, 1300, 560],
        ['sofa', '东露台沐光沙发', 1215, 95, 1385, 185]
      ],
      walls: [['v', 485, 120, 520], ['h', 355, 140, 455], ['h', 640, 520, 725], ['h', 640, 825, 1050], ['v', 1095, 260, 620]],
      npcs: [{ slug: 'f7', name: '数字员工JULI', x: 427, y: 268, dialogue: '你好，我是数字员工JULI，可用金币兑换积分、属性或线索效果，也可参与幸运大转盘。', cost: 3 }],
      spawns: [[80, 280], [380, 280], [775, 280], [775, 610], [500, 800], [1040, 280], [1040, 800]] }
  ];

  const CONTAINER_IDS = {
    reception: 'reception-132-173', counter: 'counter-1990-165', table1: 'table-2010-514',
    cabinet: 'cabinet-785-160', desk1: 'desk-1035-172', desk2: 'desk-1690-172',
    desk3: 'desk-2940-172', table2: 'table-2535-513', desk4: 'desk-3600-172',
    locker: 'locker-7000-770',
    hall1: 'hall1-340-300', printer2: 'printer2-590-370', docs3: 'docs3-590-290',
    ticket4: 'ticket4-590-280', duty5: 'duty5-610-305', safe6: 'safe6-640-355', bar7: 'bar7-480-300'
  };
  const CONTAINER_NAMES = {};
  const FLOORS = {};
  const NPCS = [];
  // ===== 美术层布局（layouts/fN.js）：存在即接管该层的家具/墙/出生点/NPC/房门，楼层轮廓与 id 契约不变 =====
  // 布局以 2× 世界像素书写最终尺寸；这里换算回设计坐标后走原建造流程（碰撞/容器 id/电梯厅全部同源）。
  const LAYOUTS = (typeof module !== 'undefined' && module.exports && typeof require === 'function')
    ? require('./layouts/index.js')
    : ((typeof window !== 'undefined' ? window : globalThis).SID_LAYOUTS || {});
  const LOBBY_DOORS = {};
  for (const spec of FLOOR_SPECS) {
    const L = LAYOUTS[spec.id];
    if (!L) continue;
    spec.lobby = true;
    spec.wallBase = L.wallBase || 112;
    // 楼层外轮廓可由布局覆盖（2× 世界像素书写，直角多边形），每层独立形状。
    if (Array.isArray(L.outline)) spec.outline = L.outline.map(([x, y]) => [x / 1.92, y / 0.8]);
    spec.maze = null;
    spec.furniture = L.furniture.map(r => P1(r[0], r[1], r[2], r[3], r[4], r[5], r[6]));
    // style：'fence' | 'hedge' | 'glass'（矮隔断）/ 'house'（独立小建筑，屋顶 + 立面 + 嵌墙门）；skin：主题外观参数，仅渲染用。
    spec.walls = (L.walls || []).map(w => w.o === 'h'
      ? ['h', (w.y + (w.t || 16) / 2) / 0.8, w.x1 / 1.92, w.x2 / 1.92, { t: (w.t || 16) / 0.8, face: w.face || 60, style: w.style, skin: w.skin, open: (w.open || []).map(([a, b]) => [a / 1.92, b / 1.92]) }]
      : ['v', (w.x + (w.t || 16) / 2) / 1.92, w.y1 / 0.8, w.y2 / 0.8, { t: (w.t || 16) / 1.92, face: w.face || 60, style: w.style, skin: w.skin, open: (w.open || []).map(([a, b]) => [a / 0.8, b / 0.8]) }]);
    spec.spawns = L.spawns.map(([x, y]) => PX1(x, y));
    const byslug = Object.fromEntries((spec.npcs || []).map(n => [n.slug, n]));
    spec.npcs = (L.npcs || []).map(n => ({ ...(byslug[n.slug] || {}), ...n, x: n.x / 1.92, y: n.y / 0.8 }));
    for (const [slug, p] of Object.entries(L.rooms || {})) LOBBY_DOORS[slug] = [p[0], p[1]];
  }
  // 美术层楼层的碰撞块统一为「贴前沿的底部条带」——画什么撞什么，不再走旧工位岛/主题精灵的特例。
  function lobbyBlocks(f) {
    const { x, y, w, h, type } = f;
    if (type === 'pillar') return [{ x, y, w, h }];
    if (type === 'fountain') return [{ x: x + 8, y: y + h - 40, w: w - 16, h: 38 }];
    if (type === 'plant') { const d = Math.min(16, h); return [{ x: x + Math.round(w * 0.2), y: y + h - d, w: Math.round(w * 0.6), h: d }]; }
    const d = Math.min(24, h);
    return [{ x: x + 4, y: y + h - d, w: Math.max(4, w - 8), h: d }];
  }
  (function buildFloors() {
    for (const spec of FLOOR_SPECS) {
      const floor = {
        id: spec.id, name: spec.name, source: spec.source,
        width: FLOOR_W, height: FLOOR_H, zones: spec.zones.slice(),
        ...(spec.lobby ? { lobby: true, wallBase: spec.wallBase } : {}),
        polygon: spec.outline.map(([x, y]) => ({ x: nX(x), y: nY(y) })),
        furniture: [], walls: [], doors: [], spawnPoints: [], portals: [], npcs: []
      };
      const maze = spec.maze ? buildMazeLayout(spec) : null;
      if (maze) { floor.maze = { cellW: maze.cellW, cellH: maze.cellH }; floor._mazeOpen = maze.open; }

      // 1) 先建造墙体，以便后续所有家具与装饰做严格的 3/4 视觉包围盒防穿模校验！
      if (maze) {
        for (const w of maze.walls) floor.walls.push({ ...w });
      } else {
        spec.walls.forEach((w, i) => {
          // 第 5 元可选：{ t 厚度(设计单位), face 立面高(px), open [[a1,a2],…] 显式门洞(设计单位) }
          const [orient, fixed, a1, a2, wopt] = w, opt = wopt || {}, t = opt.t || 7, isH = orient === 'h';
          const toPx = isH ? nX : nY;
          const nFixed = isH ? nY : nX;
          const halfPx = isH ? DOOR_HALF_PX_H : DOOR_HALF_PX_V;
          const guard = halfPx / (isH ? FLOOR_W / X_SPAN : FLOOR_H / Y_SPAN);
          let openings = [];
          if (isH && fixed === 205 && (spec.id === 3 || spec.id === 4)) openings = [64, 161, 223];
          if (isH && fixed === 195 && spec.id === 5) openings = [64, 161, 222];
          if (isH && fixed === 195 && spec.id === 6) openings = [62, 184, 306];
          if (!isH && fixed === 151 && (spec.id === 5 || spec.id === 6)) openings = [710, 855];
          if (isH && fixed === 313 && spec.id === 6) openings = [62];
          const lo = toPx(a1), hi = toPx(a2), near = nFixed(fixed - t / 2), far = nFixed(fixed + t / 2);
          let cursor = lo, segment = 0;
          const pushWall = (start, end) => {
            if (end <= start) return;
            const x = isH ? start : near, y = isH ? near : start;
            const ww = isH ? end - start : far - near, hh = isH ? far - near : end - start;
            const wall = { id: `f${spec.id}:wall:${i}:${segment++}`, x, y, w: ww, h: hh, type: 'wall',
              footprint: { x, y, w: ww, h: hh }, depth: y + hh };
            if (opt.face) wall.face = opt.face;
            if (opt.style) wall.style = opt.style;
            if (opt.skin) wall.skin = opt.skin;
            if (spec.lobby) wall.lobby = true;
            floor.walls.push(wall);
          };
          if (Array.isArray(opt.open)) {
            for (const [o1, o2] of opt.open.slice().sort((p, q) => p[0] - q[0])) {
              const s = toPx(o1), e = toPx(o2);
              pushWall(cursor, s);
              floor.doors.push({ id: `f${spec.id}:door:${i}:${segment}`, orientation: orient,
                x: isH ? Math.round((s + e) / 2) : nX(fixed), y: isH ? nY(fixed) : Math.round((s + e) / 2), width: e - s });
              cursor = e;
            }
          }
          for (const center of openings.filter(v => v > a1 + guard && v < a2 - guard)) {
            const c = toPx(center);
            pushWall(cursor, c - halfPx);
            floor.doors.push({ id: `f${spec.id}:door:${i}:${segment}`, orientation: orient,
              x: isH ? c : nX(fixed), y: isH ? nY(fixed) : c, width: 2 * halfPx });
            cursor = c + halfPx;
          }
          pushWall(cursor, hi);
        });
      }

      // 2) 建造家具：使用完整 3/4 视觉包围盒（含向上立面高度 56px 与北侧椅背）进行零重叠校验
      const rows = spec.lobby ? spec.furniture.slice() : spec.furniture.concat((DRESSING && DRESSING[spec.id]) || []);
      // 美术层楼层：每条「朝南的水平外轮廓边」都立一段 wallBase 高的实墙（墙带），渲染由北墙画法负责。
      if (spec.lobby) {
        const poly = floor.polygon, bands = [];
        for (let k = 0; k < poly.length; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length];
          if (a.y !== b.y) continue;
          const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x);
          if (x2 - x1 < 8 || !pointInPoly(poly, (x1 + x2) / 2, a.y + 2)) continue;
          bands.push({ x: x1, y: a.y, w: x2 - x1, h: spec.wallBase });
        }
        bands.sort((p, q) => p.y - q.y || p.x - q.x);
        floor.bands = bands;
        bands.forEach((bd, k) => floor.walls.push({ id: `f${spec.id}:wall:north${k ? ':' + k : ''}`, x: bd.x, y: bd.y, w: bd.w, h: bd.h, type: 'wall',
          footprint: { x: bd.x, y: bd.y, w: bd.w, h: bd.h }, depth: bd.y + bd.h, lobby: true, northBand: true }));
      }
      const inBand = (r) => (floor.bands || []).some(b => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h + 2 && r.y + r.h > b.y);
      const fitTheme = (f) => {
        const fit = THEME_PROP && THEME_PROP[spec.id] && THEME_PROP[spec.id][f.type];
        if (!fit || !fit.prop || fit.repeat) return;
        const b = SPRITE_BOUNDS && SPRITE_BOUNDS[fit.prop];
        if (!b) return;
        const s = Math.max(1, Math.min(fit.scale || 1, Math.floor(f.w / Math.max(1, b[0]))));
        const visW = Math.max(6, b[4] * s), visH = Math.max(6, b[5] * s);
        const baseW = Math.min(visW, f.w);
        const depth = Math.min(24, Math.max(10, visH));
        const base = {
          x: Math.round(f.x + (f.w - baseW) / 2),
          y: Math.round(f.y + f.h - depth),
          w: Math.round(baseW), h: Math.round(depth)
        };
        f.blocks = [{ ...base }];
        f.footprint = { ...base };
      };
      const overlapArea = (a, b) => {
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return w > 0 && h > 0 ? w * h : 0;
      };
      const visBoxOf = (r, type) => {
        const by = r.y + r.h;
        const tall = (type === 'mat' || type === 'stage') ? r.h + 6 : Math.max(r.h + 10, 56);
        return { x: r.x - 10, y: by - tall, w: r.w + 20, h: tall + 8 };
      };
      const wallVisBoxes = floor.walls.filter(w => !w.northBand).map(w => ({ x: w.x - 10, y: w.y - (w.face || 30), w: w.w + 20, h: w.h + (w.face || 30) + 8 }));
      const npcVisBoxes = (spec.npcs || []).map(n => ({ x: nX(n.x) - 42, y: nY(n.y) - 68, w: 84, h: 80 }));
      const placedVisBoxes = [];
      const inPolyRect = (r) => (
        pointInPoly(floor.polygon, r.x + 4, r.y + 4) &&
        pointInPoly(floor.polygon, r.x + r.w - 4, r.y + 4) &&
        pointInPoly(floor.polygon, r.x + 4, r.y + r.h - 4) &&
        pointInPoly(floor.polygon, r.x + r.w - 4, r.y + r.h - 4)
      );
      const isVisClear = (r, type) => {
        const vb = visBoxOf(r, type);
        // 美术层楼层：靠墙家具允许在视觉上叠到北墙前（画在墙之后），只要求落地矩形在墙脚以南。
        if (spec.lobby ? inBand(r) : (vb.y < 58)) return false;
        if (r.x < 12 || r.x + r.w > FLOOR_W - 12 || r.y + r.h > FLOOR_H - 10) return false;
        if (!inPolyRect(r)) return false;
        if (wallVisBoxes.some(wb => overlapArea(vb, wb) > 0)) return false;
        if (type !== 'reception' && npcVisBoxes.some(nb => overlapArea(vb, nb) > 0)) return false;
        if (placedVisBoxes.some(pb => overlapArea(vb, pb) > 0)) return false;
        return true;
      };

      rows.forEach((row, i) => {
        if (maze && !(typeof row[6] === 'string' && row[6].indexOf('container:') === 0)) return;
        const [type, label, x1, y1, x2, y2, flag] = row;
        const isContainerRow = typeof flag === 'string' && flag.indexOf('container') === 0;
        let r = visualRect(nRect([x1, y1, x2, y2]), isContainerRow);
        if (label !== '东侧电梯厅') {
          if (!isVisClear(r, type)) {
            if (!isContainerRow) {
              let nudged = null;
              for (let rad = 16; rad <= 64 && !nudged; rad += 16) {
                for (const [dx, dy] of [[0, rad], [0, -rad], [rad, 0], [-rad, 0], [rad, rad], [-rad, rad]]) {
                  const cand = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
                  if (isVisClear(cand, type)) { nudged = cand; break; }
                }
              }
              if (!nudged) return;
              r = nudged;
            } else {
              for (let rad = 16; rad <= 280; rad += 16) {
                let found = null;
                for (const [dx, dy] of [[0, rad], [0, -rad], [rad, 0], [-rad, 0], [rad, rad], [-rad, rad], [rad, -rad], [-rad, -rad]]) {
                  const cand = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
                  if (isVisClear(cand, type)) { found = cand; break; }
                }
                if (found) { r = found; break; }
              }
            }
          }
          placedVisBoxes.push(visBoxOf(r, type));
        }
        const footHeight = type === 'plant' ? Math.min(r.h, 18) : Math.max(12, Math.round(r.h * 0.85));
        let id, container = null;
        if (flag && flag.indexOf('container:') === 0) {
          const name = flag.slice('container:'.length);
          id = CONTAINER_IDS[name] || `f${spec.id}:container:${name}`;
          container = { name: label };
          CONTAINER_NAMES[id] = label;
        } else {
          id = `f${spec.id}:${type}:${i}`;
        }
        const f = { id, floorId: spec.id, x: r.x, y: r.y, w: r.w, h: r.h, type, label,
          footprint: { x: r.x, y: r.y + r.h - footHeight, w: r.w, h: footHeight }, depth: r.y + r.h };
        f.blocks = blocksFor(f);
        if (spec.lobby) { f.blocks = lobbyBlocks(f); f.footprint = { ...f.blocks[0] }; }
        else fitTheme(f);
        if (label === '东侧电梯厅') { f.architecturalPlaceholder = true; f.blocks = []; f.footprint = null; f.w = 0; f.h = 0; }
        if (container) f.container = container;
        floor.furniture.push(f);
      });
      // 出生点：安全池，按 id 轮转，服务端还会再做无碰撞/无遮挡校验。
      // 出生点体检：直接落在墙/家具里的人会被卡住（实测 1F/2F/4F/7F 都有），
      // 这里做一次小范围螺旋搜索，挪到最近的空位。纯几何、无 BFS，构建期成本可忽略。
      const blockersForSpawn = floor.furniture.filter(q => !q.architecturalPlaceholder).concat(floor.walls);
      const freeAt = (x, y) => {
        for (const it of blockersForSpawn) {
          const boxes = (it.blocks && it.blocks.length) ? it.blocks : (it.footprint ? [it.footprint] : null);
          if (!boxes) continue;
          for (const b of boxes) {
            if (x + 5.25 > b.x && x - 5.25 < b.x + b.w && y + 13.25 > b.y && y - 2 < b.y + b.h) return false;
          }
        }
        return true;
      };
      (maze ? maze.spawnsNorm : spec.spawns).forEach(([x, y]) => {
        let sx = nX(x), sy = nY(y);
        if (!freeAt(sx, sy)) {
          let best = null;
          for (let r = 12; r <= 96 && !best; r += 12) {
            for (const [dx, dy] of [[0, r], [0, -r], [r, 0], [-r, 0], [r, r], [-r, -r], [r, -r], [-r, r]]) {
              if (freeAt(sx + dx, sy + dy)) { best = { x: sx + dx, y: sy + dy }; break; }
            }
          }
          if (best) { sx = best.x; sy = best.y; }
        }
        floor.spawnPoints.push({ x: sx, y: sy });
      });
      // 螺旋搜索仍找不到空位（密集区域）时直接丢弃该出生点，绝不让玩家生成在墙/家具里。
      const safeSpawns = floor.spawnPoints.filter(sp => freeAt(sp.x, sp.y));
      if (safeSpawns.length) floor.spawnPoints = safeSpawns;
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
        // 美术层楼层外轮廓各异：两侧入口可能在更低处，候选高度向南延伸（既有楼层仍优先命中原高度）。
        const entryCands = [100, 96, 108, 92, 80, 120, 140, 156, 176, 200];
        if (spec.lobby) for (let cy = 220; cy <= FLOOR_H - 60; cy += 20) entryCands.push(cy);
        for (const cy of entryCands) {
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
          y: entryY - 56, w: 144, h: 112, entryY, approach: { x: approachX, y: entryY } };
        floor.halls.push(hall);
        const addWall = (name, x, y, w, h) => floor.walls.push({ id: `${hall.id}:wall:${name}`, x, y, w, h,
          type: 'wall', elevatorHall: true, footprint: { x, y, w, h }, depth: y + h });
        addWall('north', hall.x, hall.y, hall.w, 4);
        addWall('south', hall.x, hall.y + hall.h - 4, hall.w, 4);
        addWall('outer', side === 'left' ? hall.x : hall.x + hall.w - 4, hall.y, 4, hall.h);
        floor.walls.push({
          id: `${hall.id}:wall:lift`,
          x: hall.x + 32,
          y: hall.y,
          w: 80,
          h: Math.max(24, (entryY - 12) - hall.y),
          type: 'wall',
          invisible: true,
          footprint: { x: hall.x + 32, y: hall.y, w: 80, h: Math.max(24, (entryY - 12) - hall.y) },
          depth: entryY - 12
        });
        const doorOpening = hall.h - 8;
        floor.glassDoors.push({ id: `${hall.id}:glass`, hallId: hall.id, side, x: edgeX, y: entryY,
          opening: doorOpening, footprint: { x: edgeX - 2, y: entryY - doorOpening / 2, w: 4, h: doorOpening }, depth: entryY + doorOpening / 2 });
        floor.portals.push({ id: `f${spec.id}:portal:${side}`, floorId: spec.id, side,
          x: hall.x + 72, y: entryY - 12, w: 64, h: 30 });
      }
      // 阶段3：西侧 portal 统一落在「西侧核心筒」中心（stairLeft x=70，与参考图 5F/6F 一致），
      // 3F/4F 原有的局部重排（把左门挪到桌南空带）随之取消：锚点不再落在桌面遮挡足迹内。
      // NPC：唯一迁移且保留原 ID，floorId 独立决定归属。
      for (const n of (spec.npcs || [])) {
        const npc = { id: `npc-${n.slug}`, slug: n.slug, name: n.name, x: nX(n.x), y: nY(n.y),
          dialogue: n.dialogue, cost: n.cost, floorId: spec.id };
        NPCS.push(npc);
        floor.npcs.push(npc);
      }
      FLOORS[spec.id] = floor;
    }
    // 保持既有前两项顺序（npc-reception, npc-archive），同时把 2F/4F/5F/6F/7F 的同功能 NPC 一并纳入。
    const order = { 'npc-reception': 0, 'npc-archive': 1 };
    NPCS.sort((a, b) => (order[a.id] ?? (a.floorId + 10)) - (order[b.id] ?? (b.floorId + 10)));
  })();
  // ===== TMJ 接管（SID_TMJ=1）=====
  // 只替换「行走几何」相关数据：portal / hall / spawn / arrival / glassDoors；
  // 家具、NPC、容器仍保留原数据用于渲染与交互，避免一次性重画整层。
  // 重复调用安全：每层只应用一次；客户端在 TMJ 地图 fetch 完成后也会调用同一函数。
  const NPC_TMJ_ZONE = { reception: '检疫闸口', archive: '藏书阁' };
  // TMJ 接管后 NPC 不再用旧归一化坐标：放进对应功能区的最近可站格。
  function placeNpcOnTMJ(npc, floorId) {
    const map = TMJ.get(floorId);
    if (!map || !map.zones || !map.zones.length) return;
    const zone = map.zones.find(z => z.name === NPC_TMJ_ZONE[npc.slug]) || map.zones[0];
    const T = map.tileWidth || 16;
    const ts = T * FLOOR_SCALE;
    const x0 = Math.max(0, Math.floor(zone.x / T));
    const y0 = Math.max(0, Math.floor(zone.y / T));
    const x1 = Math.min(map.width - 1, Math.ceil((zone.x + zone.w) / T) - 1);
    const y1 = Math.min(map.height - 1, Math.ceil((zone.y + zone.h) / T) - 1);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let best = null;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const wx = (x + 0.5) * ts, wy = (y + 0.5) * ts;
      if (TMJ.solidAt(floorId, wx, wy, FLOOR_SCALE)) continue;
      const d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best) { npc.x = (best.x + 0.5) * ts; npc.y = (best.y + 0.5) * ts; }
  }

  function placeContainerOnTMJ(f, floorId, placed, order) {
    const map = TMJ.get(floorId);
    if (!map || !f.container) return false;
    const s = FLOOR_SCALE, ts = (map.tileWidth || 16) * s;
    const zones = (map.zones || []).filter(z => z.name !== '东侧电梯厅');
    if (!zones.length) return false;
    const overlap = (a, b) => a.x < b.x + b.w + 4 && b.x < a.x + a.w + 4 && a.y < b.y + b.h + 4 && b.y < a.y + a.h + 4;
    const fits = (x, y) => {
      if (x < 0 || y < 0 || x + f.w > map.width * ts || y + f.h > map.height * ts) return false;
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        const px = x + f.w * i / 2, py = y + f.h * j / 2;
        if (TMJ.solidAt(floorId, px, py, s)) return false;
      }
      return !placed.some(r => overlap({ x, y, w: f.w, h: f.h }, r));
    };
    const moveTo = (x, y) => {
      const dx = x - f.x, dy = y - f.y;
      f.x = x; f.y = y;
      if (f.footprint) { f.footprint.x += dx; f.footprint.y += dy; }
      if (Array.isArray(f.blocks)) for (const b of f.blocks) { b.x += dx; b.y += dy; }
      f.depth = f.y + f.h;
      placed.push({ x, y, w: f.w, h: f.h });
      return true;
    };
    // 优先放进主题功能区；接待台固定回检疫闸口
    const preferred = f.type === 'reception' ? zones.find(z => z.name === '检疫闸口') : null;
    const orderZones = preferred ? [preferred, ...zones.filter(z => z !== preferred)] : zones;
    for (let zi = 0; zi < orderZones.length; zi++) {
      const zone = orderZones[(zi + (order || 0)) % orderZones.length];
      const x0 = Math.max(0, Math.floor(zone.x / (map.tileWidth || 16)));
      const y0 = Math.max(0, Math.floor(zone.y / (map.tileWidth || 16)));
      const x1 = Math.min(map.width - 1, Math.ceil((zone.x + zone.w) / (map.tileWidth || 16)) - 1);
      const y1 = Math.min(map.height - 1, Math.ceil((zone.y + zone.h) / (map.tileWidth || 16)) - 1);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
        const x = (tx + 0.5) * ts - f.w / 2;
        const y = (ty + 0.5) * ts - f.h / 2;
        if (fits(x, y)) return moveTo(x, y);
      }
    }
    // 兜底：全图扫一遍，别让容器留在墙里
    for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) {
      const x = (tx + 0.5) * ts - f.w / 2;
      const y = (ty + 0.5) * ts - f.h / 2;
      if (fits(x, y)) return moveTo(x, y);
    }
    return false;
  }

  function applyTMJLayout() {
    if (!TMJ || !TMJ.isEnabled()) return 0;
    let applied = 0;
    for (const id of Object.keys(FLOORS)) {
      const floor = FLOORS[id];
      if (!floor || floor._tmjLayout || !TMJ.get(id)) continue;
      const portals = TMJ.portals(id, FLOOR_SCALE);
      if (portals.length) {
        floor.portals = portals.map(p => ({
          id: p.id, floorId: p.floorId, side: p.side, x: p.x, y: p.y, w: p.w, h: p.h,
        }));
        // TMJ 画面层需要厅地坪，否则电梯门/轿厢会浮在虚空；保留 portal.hall 给 SCENE.halls。
        floor.halls = portals.map(p => ({ ...p.hall, side: p.side }));
      }
      // 出生点取整层可走格（按 TMJ spawn 距离排序），多人按 id 轮转，避免叠在同一个点上。
      const cells = TMJ.spawnCells(id, FLOOR_SCALE);
      if (cells.length) floor.spawnPoints = cells.slice(0, 1024).map(p => ({ x: p.x, y: p.y }));
      floor.arrivalPoints = {
        left: floor.spawnPoints.filter(p => p.x < FLOOR_W / 2).map(p => ({ ...p })),
        right: floor.spawnPoints.filter(p => p.x > FLOOR_W / 2).map(p => ({ ...p })),
      };
      // TMJ 没有玻璃门层；保留旧门只会画出"能穿过却不能挡"的假门。
      floor.glassDoors = [];
      for (const npc of floor.npcs) placeNpcOnTMJ(npc, id);
      const placedContainers = [];
      let containerOrder = 0;
      for (const f of floor.furniture) if (f.container) placeContainerOnTMJ(f, id, placedContainers, containerOrder++);
      floor._safeSpawns = null;
      floor._tmjLayout = true;
      applied++;
    }
    return applied;
  }
  if (TMJ && TMJ.isEnabled()) applyTMJLayout();
  function floorById(id = 1) { const n = Number(id); return Number.isSafeInteger(n) ? FLOORS[n] || null : null; }
  function floorOptions() { return FLOOR_SPECS.map(f => ({ id: f.id, label: `${f.id}F`, name: f.name })); }
  function inHall(floorId, side, x, y) {
    // TMJ 接管：电梯厅不是旧楼面数据的一部分，用 lift 周围生成的虚拟厅判定。
    if (TMJ && TMJ.active(floorId)) {
      const p = TMJ.portals(floorId, FLOOR_SCALE).find(q => q.side === side);
      if (!p) return false;
      const h = p.hall;
      return x >= h.x && x <= h.x + h.w && y > h.y && y < h.y + h.h;
    }
    const f = floorById(floorId), hall = f && f.halls.find(h => h.side === side);
    return !!hall && x > hall.x && x < hall.x + hall.w && y > hall.y && y < hall.y + hall.h;
  }
  // Only public door states are replicated; no actor identity or faction enters this state machine.
  function advanceGlassDoors(floorId, previous, actors, now) {
    const f = floorById(floorId), next = {};
    for (const d of f.glassDoors) {
      const near = actors.some(p => p.floorId === floorId && p.online !== false && !p.npc &&
        Math.abs(p.x - d.x) <= LIFT_CONFIG.trigger && Math.abs(p.y - d.y) <= d.opening / 2 + 12);
      const old = previous[d.id] || { open: false, holdUntil: 0 };
      next[d.id] = { open: near || now < old.holdUntil, holdUntil: near ? now + LIFT_CONFIG.closeDelayMs : old.holdUntil };
    }
    return next;
  }
  function floorBlockers(floorId, doorStates) {
    const f = floorById(floorId);
    if (!f) return [];
    // TMJ 接管时行走碰撞只看 collision 层；旧家具不再参与碰撞/遮挡，避免两套几何互相打架。
    if (TMJ && TMJ.active(floorId)) return [];
    // 北侧墙带：楼板区域内 y<96 一律不可行走，避免人物"走上墙"；
    // 只覆盖 0..1440 的楼板，不碰两侧楼板外的电梯厅（他们在 x<0 / x>1440）。
    const wallBand = { id: `f${floorId}:wallband`, floorId, type: 'wallband', label: '',
      x: 0, y: 0, w: 1440, h: 96, depth: 96, invisible: true,
      // collidesAt 优先读 blocks[]，其次 footprint；墙带没有分组，直接给整块 footprint。
      footprint: { x: 0, y: 0, w: 1440, h: 96 } };
    return f.furniture.filter(q => !q.architecturalPlaceholder).concat(f.walls,
      doorStates ? f.glassDoors.filter(d => !(doorStates[d.id] && doorStates[d.id].open)) : []);
  }
  // 房间门口清理：把门口 64px 内的纯装饰家具移走（保留容器，不能因为清理掉战利品）。
  function pruneDecorNear(floorId, x, y, radius = 64) {
    const f = floorById(floorId);
    if (!f) return 0;
    const distToRect = (q) => {
      const dx = Math.max(q.x - x, 0, x - (q.x + q.w));
      const dy = Math.max(q.y - y, 0, y - (q.y + q.h));
      return Math.hypot(dx, dy);
    };
    const before = f.furniture.length;
    f.furniture = f.furniture.filter(q => q.architecturalPlaceholder || q.container || q.npc ||
      distToRect(q) >= radius);
    f._safeSpawns = null; // 家具变了，出生点需要重新净化
    return before - f.furniture.length;
  }  function floorFurniture(floorId) { return floorById(floorId).furniture.slice(); }
  function floorWalls(floorId) { return floorById(floorId).walls.slice(); }
  function floorPortals(floorId) { return floorById(floorId).portals.map(p => ({ ...p })); }
  // 出生点兜底净化：构建期来不及做（家具是分两步装配的），这里在最终数据上算一次并缓存。
  // 目标：任何出生点都不允许落在墙体/家具里 —— 否则玩家一进局就被卡住。
  function floorSpawns(floorId) {
    const f = floorById(floorId);
    if (!f) return [];
    // TMJ 接管：返回 collision 层 + 道具 footprint 都放得下身体盒的空地中心，按 TMJ spawn 排序。
    if (TMJ && TMJ.active(floorId)) {
      const cells = TMJ.spawnCells(floorId, FLOOR_SCALE).filter(p => !floorCollides(floorId, p.x, p.y));
      if (cells.length) return cells.slice(0, 1024).map(p => ({ x: p.x, y: p.y }));
    }
    if (!f._safeSpawns) {
      const blockers = f.furniture.filter(q => !q.architecturalPlaceholder).concat(f.walls, f.glassDoors || []);
      // 直接用 floorCollides 判定，保证与真实行走碰撞完全一致（自己重写一份容易漏掉门窗）。
      const freeAt = (x, y) => !floorCollides(floorId, x, y);
      const offsets = [[0, 16], [0, -16], [16, 0], [-16, 0], [24, 16], [-24, 16], [24, -16], [-24, -16], [0, 32], [32, 0], [-32, 0], [0, -32]];
      const out = [];
      for (const p of f.spawnPoints) {
        if (freeAt(p.x, p.y)) { out.push(p); continue; }
        let fixed = null;
        for (let r = 1; r <= 4 && !fixed; r++) {
          for (const [dx, dy] of offsets) {
            if (freeAt(p.x + dx * r, p.y + dy * r)) { fixed = { x: p.x + dx * r, y: p.y + dy * r }; break; }
          }
        }
        if (fixed) out.push(fixed);
      }
      f._safeSpawns = out.length ? out : f.spawnPoints;
    }
    return f._safeSpawns.map(p => ({ ...p }));
  }
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
    // TMJ 接管：落点仍取门口正前方，但碰撞只问 collision 层，不再被旧家具的 footprint 否决。
    if (TMJ && TMJ.active(floorId)) {
      for (const [x, y] of [[portal.x, portal.y + 14], [portal.x, portal.y], [portal.x, portal.y - 14]]) {
        if (floorCollides(floorId, x, y)) continue;
        return { x, y };
      }
      return null;
    }
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
    if (!f) return false;
    // TMJ 接管：楼面范围以 90×25 地图为准；轮廓外由 solidAt 返回 true 兜底。
    if (TMJ && TMJ.active(floorId)) return TMJ.inside(floorId, x, y, FLOOR_SCALE);
    return inMainFloor(f, x, y) || f.halls.some(h => x >= h.x && x <= h.x + h.w && y > h.y && y < h.y + h.h);
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
    // TMJ 接管：身体盒四角落在 collision 层实心格即不可走；与 preview.html 的判定同源。
    if (TMJ && TMJ.active(floorId)) {
      return [[x - BODY_HALF, y - FOOT_BOTTOM], [x + BODY_HALF, y - FOOT_BOTTOM],
        [x - BODY_HALF, y + FOOT_TOP], [x + BODY_HALF, y + FOOT_TOP]]
        .some(([px, py]) => TMJ.solidAt(floorId, px, py, FLOOR_SCALE));
    }
    if (!inFloor(floorId, x, y)) return true;
    return collidesAt(x, y, blockers || floorBlockers(floorId));
  }
  function floorBounds(floorId) {
    const f = floorById(floorId);
    // TMJ 接管：bounds 与 90×25 地图等大，并向左右各外扩一个电梯厅（72 design px）。
    // 电梯厅不在 tile 层里，由 TMJ.solidAt() 的虚拟厅放行；这里只负责相机/移动半径。
    if (TMJ && TMJ.active(floorId)) return { minX: -72 * FLOOR_SCALE + 12, maxX: FLOOR_W + 72 * FLOOR_SCALE - 12, minY: 72, maxY: FLOOR_H - 24 };
    // 注意：minY 不能抬到墙带之下 —— 电梯厅在楼板外的 y≈32..128，抬 minY 会把整条西/东通道封死。
    // "不能上墙"改用一条只覆盖楼板区域的隐形墙带（见 floorBlockers）。
    return { minX: f.worldBounds.minX + 12, maxX: f.worldBounds.maxX - 12, minY: f.wallBase ? f.wallBase + 14 : 72, maxY: f.height - 24 };
  }
  function cameraBounds(floorId, viewW, viewH, x, y) {
    const b = floorById(floorId).worldBounds, w = b.maxX - b.minX, h = b.maxY - b.minY;
    return { x: viewW >= w ? b.minX + (w - viewW) / 2 : Math.max(b.minX, Math.min(b.maxX - viewW, x - viewW / 2)),
      y: viewH >= h ? b.minY + (h - viewH) / 2 : Math.max(b.minY, Math.min(b.maxY - viewH, y - viewH / 2)) };
  }
  // 兼容旧接口：返回指定层（默认 1F）的家具，供仍按单层语义调用的代码使用。
  function makeFurniture(floorId = 1) { return floorFurniture(floorId); }
  function portalAccess(actor, portal, range = 116) {
    if (!actor || !portal) return { inReach: false, facingOk: false, allowed: false, reason: '无可用电梯门' };
    if (actor.floorId !== portal.floorId || !inHall(portal.floorId, portal.side, actor.x, actor.y))
      return { inReach: false, facingOk: false, allowed: false, reason: '请穿过玻璃门进入电梯厅后乘梯' };
    const dx = portal.x - actor.x, dy = portal.y - actor.y, d = Math.hypot(dx, dy);
    if (d > range) return { inReach: false, facingOk: false, allowed: false, reason: '距离电梯太远，请靠近后再按 K' };
    if (d === 0) return { inReach: true, facingOk: true, allowed: true, reason: '' };
    const facingAway = actor.spriteFacing === 'front' && Math.abs(dx) < 0.5 && Math.abs(dy + 14) < 0.5;
    if (facingAway) return { inReach: true, facingOk: false, allowed: false, reason: '请面向电梯门后再按 K' };
    return { inReach: true, facingOk: true, allowed: true, reason: '' };
  }
  return { LOBBY_DOORS, LAYOUTS, FLOOR_BASE_HEIGHT, FLOOR_SCALE, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, nX, nY, nRect, FULL_RECT, L24, L56, FLOOR_SPECS, CONTAINER_IDS, CONTAINER_NAMES, FLOORS, NPCS, floorById, floorOptions, inHall, advanceGlassDoors, floorBlockers, floorFurniture, pruneDecorNear, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorPortal, elevatorLanding, floorNpcs, floorContainers, inFloor, inMainFloor, floorCollides, floorBounds, cameraBounds, makeFurniture, portalAccess, applyTMJLayout };
});



