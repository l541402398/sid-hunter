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
  const visualRect = r => {
    if (FLOOR_SCALE === 1) return r;
    const w = Math.max(1, Math.round(r.w / FLOOR_SCALE));
    const h = Math.max(1, Math.round(r.h / FLOOR_SCALE));
    return { x: Math.round(r.x + (r.w - w) / 2), y: Math.round(r.y + (r.h - h) / 2), w, h };
  };
  // 楼层外轮廓（0–1500 × 0–1000 归一化）。轮廓外是非楼面，禁止行走，不得用矩形底板补平。
  const FULL_RECT = [[0, 0], [1500, 0], [1500, 1000], [0, 1000]];
  const L24 = [[0, 0], [1500, 0], [1500, 1000], [255, 1000], [255, 710], [122, 710], [122, 550], [0, 550]];
  const L56 = [[0, 0], [1500, 0], [1500, 1000], [151, 1000], [151, 620], [72, 620], [72, 520], [0, 520]];

  // 点是否在楼面轮廓内（本地版本，建造期 FLOORS 还没注册，不能调 inFloor）。
  const pointInPoly = (poly, x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  };
  // ===== 5F 地牢迷宫 =====
  // 在 (2*cols+1)×(2*rows+1) 的格子上跑递归回溯（完美迷宫），再随机开少量环，
  // 让"死路"不至于太惩罚。墙壁按整格合并成横条，减少碰撞矩形数量。
  // 电梯口两格强制打开，否则出生点/玻璃门到不了楼面。
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
    // 开环：消除约 10% 的内部墙格，避免整层只有一条正确路线。
    for (let y = 2; y < gh - 2; y += 2) for (let x = 1; x < gw - 1; x++) if (g[y][x] === 1 && rnd() < 0.10) g[y][x] = 0;
    // 电梯口：左右两端的第 1 行必须直通。
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
    // 出生点：从开放格里均匀取 12 个，归一化后交给原有 spawns 流程（会再做碰撞体检）。
    const spawnsNorm = [];
    for (let i = 0; i < open.length && spawnsNorm.length < 12; i += Math.max(1, Math.floor(open.length / 12))) {
      spawnsNorm.push([open[i].x / FLOOR_W * X_SPAN, open[i].y / FLOOR_H * Y_SPAN]);
    }
    // 中心附近的出生点排前面：首屏/截图不会一出生就贴着楼角。
    spawnsNorm.sort((a, b) => Math.hypot(a[0] - 750, a[1] - 500) - Math.hypot(b[0] - 750, b[1] - 500));
    return { walls, open, cellW, cellH, spawnsNorm };
  }

  // 每层规格：rooms 用 zones 呈现；furniture 行为 [type,label,x1,y1,x2,y2,flag?]（角点、0–1000 归一化）。
  // 可搜容器以 flag 'container:<name>' 标记并生成稳定 ID f{层}:container:{name}。
  // walls 行为 [orient,fixed,a1,a2]（orient 'h'/'v'），是真正的碰撞墙体；门=两段墙之间留出的空隙，
  // 因此门是可通行的真实开洞，不是贴图。
  const FLOOR_SPECS = [
    { id: 1, name: '1F · 科幻实验层', source: 'original', outline: FULL_RECT,
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

    { id: 2, name: '2F · 竞技运动层', source: 'real', outline: L24,
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
        ['plant', '中庭绿植', 300, 640, 352, 700],
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
        ['h', 340, 0, 250], ['v', 250, 340, 440], ['v', 250, 520, 600], ['h', 710, 0, 255], ['h', 890, 365, 510],
        ['h', 650, 1000, 1160], ['h', 650, 1300, 1500]],
      spawns: [[303, 470], [300, 760], [330, 300], [606, 500], [588, 500], [577, 705], [900, 470], [900, 760], [1080, 500], [1080, 850]] },

    { id: 3, name: '3F · 魔幻城堡层', source: 'real', outline: L24,
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
      spawns: [[70, 250], [183, 660], [330, 250], [583, 260], [631, 825], [909, 500], [900, 700], [1080, 500], [1080, 850]] },

    { id: 4, name: '4F · 幽深森林层', source: 'real', outline: L24,
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

    { id: 5, name: '5F · 地牢回廊层', source: 'real', outline: L56, maze: { cols: 10, rows: 6, seed: 5 },
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

    { id: 6, name: '6F · 海盗甲板层', source: 'real', outline: L56,
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

    { id: 7, name: '7F · 赛博霓虹层', source: 'original', outline: FULL_RECT,
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
      spawns: [[75, 300], [75, 700], [589, 300], [500, 480], [500, 720], [900, 300], [900, 700], [1080, 500], [1080, 850]] }
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
  (function buildFloors() {
    for (const spec of FLOOR_SPECS) {
      const floor = {
        id: spec.id, name: spec.name, source: spec.source,
        width: FLOOR_W, height: FLOOR_H, zones: spec.zones.slice(),
        polygon: spec.outline.map(([x, y]) => ({ x: nX(x), y: nY(y) })),
        furniture: [], walls: [], doors: [], spawnPoints: [], portals: [], npcs: []
      };
      // 5F 地牢：整层换成程序生成的迷宫；家具只保留经济容器，并挪进开放格。
      const maze = spec.maze ? buildMazeLayout(spec) : null;
      if (maze) { floor.maze = { cellW: maze.cellW, cellH: maze.cellH }; floor._mazeOpen = maze.open; }
      // 家具：经济容器保留原稳定 ID，装饰按楼层编号；坐标调整不改变经济键。
      // 阶段4（需求③）：spec.furniture 之后追加 dressing.js 的逐层陈设，让"空荡荡的楼层"变成有内容的空间。
      // 追加项与原始项走完全相同的建造逻辑（碰撞/足迹/容器登记），不引入第二条代码路径。
      const rows = spec.furniture.concat((DRESSING && DRESSING[spec.id]) || []);
      const originalCount = spec.furniture.length;
      // 主题单图家具：碰撞盒按素材**不透明像素**的宽度/高度收窄（PNG 透明边不再算碰撞）。
      const fitTheme = (f) => {
        const fit = THEME_PROP && THEME_PROP[spec.id] && THEME_PROP[spec.id][f.type];
        if (!fit || !fit.prop || fit.repeat) return;
        const b = SPRITE_BOUNDS && SPRITE_BOUNDS[fit.prop];
        if (!b) return;
        const s = Math.max(1, Math.min(fit.scale || 1, Math.floor(f.w / Math.max(1, b[0]))));
        const visW = Math.max(6, b[4] * s), visH = Math.max(6, b[5] * s);
        // 主题家具一律用"脚下一条基座"，不再沿用 desk 工位岛那套大块碰撞：
        // 宽度取素材实际宽度，深度最多 24px，底边对齐家具底边。
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
      const placedRects = [];
      const overlapArea = (a, b) => {
        const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        return w > 0 && h > 0 ? w * h : 0;
      };
      rows.forEach((row, i) => {
        // 迷宫层：非容器家具会被墙切断/挡路，直接不上楼；容器留到最后统一安置到开放格。
        if (maze && !(typeof row[6] === 'string' && row[6].indexOf('container:') === 0)) return;
        const [type, label, x1, y1, x2, y2, flag] = row;
        const r = visualRect(nRect([x1, y1, x2, y2]));
        // 后加的陈设（dressing）若与已放置家具明显重叠就跳过，避免物品堆积/错位。
        // 容器行永远保留（哪怕重叠），否则会把可搜容器挤掉。
        const isContainerRow = typeof flag === 'string' && flag.indexOf('container') === 0;
        if (i >= originalCount && !isContainerRow && placedRects.some(pr => overlapArea(r, pr) > 240)) return;
        placedRects.push(r);
        // 足迹高度不得超过家具本身：白板/电视/长凳等矮件若沿用 24px 会把足迹顶到家具上方，
        // 变成"看得见却撞到空气"的隐形墙（阶段4 新增矮件后暴露）。
        // 碰撞盒高度：桌子/柜子这类"整件都该挡人"的家具按高度 60% 计，
        // 否则人物会站进桌面上半截（旧实现固定 24px，只挡桌脚）。
        // 默认按素材自身高度给碰撞（留 15% 顶部余量，免得贴图顶端也挡人）；
        // 植物这类矮件保持 18px，避免盆栽形成隐形墙。
        const footHeight = type === 'plant' ? Math.min(r.h, 18) : Math.max(12, Math.round(r.h * 0.85));
        let id, container = null;
        if (flag && flag.indexOf('container:') === 0) {
          const name = flag.slice('container:'.length);
          // 旧容器用登记过的经济 ID（被 EXPLORATION_REWARDS 引用）；新容器用「层+名字」派生稳定 ID，
          // 保证不随数组下标变化，刷新/重连后搜索状态仍然对得上。
          id = CONTAINER_IDS[name] || `f${spec.id}:container:${name}`;
          container = { name: label };
          CONTAINER_NAMES[id] = label;
        } else {
          id = `f${spec.id}:${type}:${i}`;
        }
        const f = { id, floorId: spec.id, x: r.x, y: r.y, w: r.w, h: r.h, type, label,
          footprint: { x: r.x, y: r.y + r.h - footHeight, w: r.w, h: footHeight }, depth: r.y + r.h };
        // 行走碰撞 = 单体底部足迹并集（R-DECOMP）；f.footprint 语义不变。
        f.blocks = blocksFor(f);
        fitTheme(f);
        // Preserve the row and decorative ID, but an elevator hall is not a cabinet.
        if (label === '东侧电梯厅') { f.architecturalPlaceholder = true; f.blocks = []; f.footprint = null; f.w = 0; f.h = 0; }
        if (container) f.container = container;
        floor.furniture.push(f);
      });
      // 迷宫层：把经济容器塞进互不重复的开放格，并缩到格子内（长桌不再横穿走廊）。
      if (maze) {
        const cells = maze.open.slice();
        const used = new Set();
        for (const f of floor.furniture) {
          let pick = -1;
          for (let k = 0; k < cells.length; k++) {
            const idx = (Math.floor(cells.length * 0.13) + k * 7) % cells.length;
            if (!used.has(idx)) { pick = idx; break; }
          }
          if (pick < 0) pick = 0;
          used.add(pick);
          const cell = cells[pick];
          f.w = Math.min(f.w, Math.max(44, Math.round(maze.cellW - 30)));
          f.h = Math.min(f.h, Math.max(26, Math.round(maze.cellH - 18)));
          f.x = Math.round(cell.x - f.w / 2);
          f.y = Math.round(cell.y - f.h / 2);
          const footH = Math.max(10, Math.min(f.h, Math.round(f.h * 0.8)));
          f.footprint = { x: f.x, y: f.y + f.h - footH, w: f.w, h: footH };
          f.blocks = blocksFor(f);
          fitTheme(f);
          f.depth = f.y + f.h;
        }
      }
      // 墙体：真实碰撞矩形，厚度约 7 归一化；门是两段墙间的空隙，天然可通行。
      // 迷宫层用生成好的整格墙条，不再走原来的手工墙。
      if (maze) {
        for (const w of maze.walls) floor.walls.push({ ...w });
      } else
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
        const npc = { id: `npc-${n.slug}`, slug: n.slug, name: n.name, x: nX(n.x), y: nY(n.y),
          dialogue: n.dialogue, cost: n.cost, floorId: spec.id };
        NPCS.push(npc);
        floor.npcs.push(npc);
      }
      FLOORS[spec.id] = floor;
    }
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
    return { minX: f.worldBounds.minX + 12, maxX: f.worldBounds.maxX - 12, minY: 72, maxY: f.height - 24 };
  }
  function cameraBounds(floorId, viewW, viewH, x, y) {
    const b = floorById(floorId).worldBounds, w = b.maxX - b.minX, h = b.maxY - b.minY;
    return { x: viewW >= w ? b.minX + (w - viewW) / 2 : Math.max(b.minX, Math.min(b.maxX - viewW, x - viewW / 2)),
      y: viewH >= h ? b.minY + (h - viewH) / 2 : Math.max(b.minY, Math.min(b.maxY - viewH, y - viewH / 2)) };
  }
  // 兼容旧接口：返回指定层（默认 1F）的家具，供仍按单层语义调用的代码使用。
  function makeFurniture(floorId = 1) { return floorFurniture(floorId); }
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
  return { FLOOR_BASE_HEIGHT, FLOOR_SCALE, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, nX, nY, nRect, FULL_RECT, L24, L56, FLOOR_SPECS, CONTAINER_IDS, CONTAINER_NAMES, FLOORS, NPCS, floorById, floorOptions, inHall, advanceGlassDoors, floorBlockers, floorFurniture, pruneDecorNear, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorPortal, elevatorLanding, floorNpcs, floorContainers, inFloor, inMainFloor, floorCollides, floorBounds, cameraBounds, makeFurniture, portalAccess, applyTMJLayout };
});



