// 唯一数据源：零依赖生成 7 层 TMJ（逐层独立布局 + 真实家具 footprint + 电梯原坐标）。
// export-from-world.mjs 只读校验，禁止覆盖本文件产物。
// 用法：node tiled/build-floors.mjs
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { THEMES, PALETTE_LIST, THEME_ROLES, themeById } from './themes.mjs';
import { ASSET_FILES, ASSET_SCALE } from './asset-files.mjs';
const ASSET_SIZES = JSON.parse(readFileSync('tiled/asset-sizes.json', 'utf8'));

if (process.env.SID_TMJ === '1') {
  console.error('build-floors: SID_TMJ=1 会让 WORLD.floorPortal() 读到 TMJ 自己。请取消该环境变量后重跑。');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const WORLD = require('../online/shared/world.js');

const W = 90, H = 25, T = 16;
const SPAWN = { x: 4, y: 3 };
const DOOR_ROWS = [2, 3]; // 电梯门开口：2 格高，覆盖 floorPortal 的 y≈44–59 design px

// ---------- 逐层布局：手写脊柱 + 功能区房间 ----------
// spine：主路径折线（2 格宽）；rooms：功能区矩形（与脊柱重叠或由自动连接打通）。
// 每层 6 个主题功能区；F1–F4/F6 另加东侧电梯厅，F5/F7 由东侧功能区兼作出口。
const LAYOUTS = {
  1: {
    spine: [[1, 3], [34, 3], [34, 13], [56, 13], [56, 3], [88, 3]],
    rooms: [
      { name: '检疫闸口', x: 3, y: 6, w: 10, h: 6, style: 'entry' },
      { name: '样本分析台', x: 16, y: 7, w: 12, h: 6, style: 'work' },
      { name: '低温实验舱', x: 36, y: 5, w: 18, h: 8, style: 'landmark', landmark: 'tank' },
      { name: '主控室', x: 60, y: 6, w: 12, h: 6, style: 'control' },
      { name: '应急冲洗', x: 24, y: 15, w: 14, h: 5, style: 'hazard' },
      { name: '东侧电梯厅', x: 78, y: 5, w: 8, h: 6, style: 'exit' },
    ],
  },
  2: {
    spine: [[1, 3], [18, 3], [18, 14], [72, 14], [72, 3], [88, 3]],
    rooms: [
      { name: '检录更衣', x: 3, y: 6, w: 10, h: 6, style: 'entry' },
      { name: '中央球场', x: 24, y: 8, w: 40, h: 6, style: 'field', landmark: 'scoreboard' },
      { name: '看台补给', x: 24, y: 5, w: 18, h: 3, style: 'rest' },
      { name: '跑道直道', x: 24, y: 14, w: 48, h: 3, style: 'track' },
      { name: '器材库', x: 74, y: 6, w: 10, h: 6, style: 'storage' },
      { name: '东侧电梯厅', x: 76, y: 4, w: 8, h: 6, style: 'exit' },
    ],
  },
  3: {
    spine: [[1, 3], [10, 3], [10, 10], [30, 10], [30, 3], [44, 3], [44, 16], [62, 16], [62, 3], [88, 3]],
    rooms: [
      { name: '王座厅', x: 3, y: 5, w: 14, h: 8, style: 'landmark', landmark: 'throne' },
      { name: '中央拱廊', x: 33, y: 5, w: 8, h: 12, style: 'gallery' },
      { name: '藏书阁', x: 32, y: 13, w: 13, h: 8, style: 'library' },
      { name: '炼金室', x: 64, y: 5, w: 12, h: 7, style: 'hazard' },
      { name: '宝库', x: 64, y: 13, w: 12, h: 7, style: 'storage' },
      { name: '东侧电梯厅', x: 78, y: 5, w: 8, h: 6, style: 'exit' },
    ],
  },
  4: {
    spine: [[1, 3], [18, 3], [18, 8], [38, 8], [38, 13], [58, 13], [58, 8], [74, 8], [74, 3], [88, 3]],
    rooms: [
      { name: '林间营地', x: 3, y: 5, w: 12, h: 7, style: 'camp' },
      { name: '药草圃', x: 20, y: 10, w: 16, h: 8, style: 'garden' },
      { name: '古树祭坛', x: 40, y: 10, w: 16, h: 8, style: 'landmark', landmark: 'tree' },
      { name: '树屋', x: 44, y: 5, w: 10, h: 4, style: 'storage' },
      { name: '溪流桥', x: 60, y: 10, w: 12, h: 7, style: 'bridge' },
      { name: '东侧电梯厅', x: 76, y: 5, w: 8, h: 6, style: 'exit' },
    ],
  },
  5: {
    spine: [[1, 3], [8, 3], [8, 8], [22, 8], [22, 3], [34, 3], [34, 12], [50, 12], [50, 8], [64, 8], [64, 16], [76, 16], [76, 3], [88, 3]],
    rooms: [
      { name: '牢房', x: 7, y: 14, w: 6, h: 4, style: 'prison' },
      { name: '刑讯室', x: 18, y: 5, w: 6, h: 4, style: 'hazard' },
      { name: '铁栅井', x: 33, y: 13, w: 7, h: 4, style: 'landmark', landmark: 'shaft' },
      { name: '守卫室', x: 48, y: 5, w: 6, h: 4, style: 'guard' },
      { name: '水牢', x: 57, y: 14, w: 6, h: 4, style: 'hazard' },
      { name: '宝库', x: 70, y: 7, w: 6, h: 4, style: 'storage' },
      { name: '东侧电梯厅', x: 79, y: 5, w: 7, h: 5, style: 'exit' },
    ],
  },
  6: {
    spine: [[1, 3], [16, 3], [16, 10], [38, 10], [38, 6], [58, 6], [58, 12], [76, 12], [76, 3], [88, 3]],
    rooms: [
      { name: '甲板', x: 3, y: 5, w: 14, h: 8, style: 'deck', landmark: 'mast' },
      { name: '货舱', x: 18, y: 11, w: 18, h: 8, style: 'storage' },
      { name: '厨房', x: 20, y: 9, w: 14, h: 5, style: 'kitchen' },
      { name: '船长室', x: 40, y: 5, w: 14, h: 6, style: 'captain' },
      { name: '炮舱', x: 60, y: 13, w: 16, h: 8, style: 'cannon' },
      { name: '东侧电梯厅', x: 78, y: 5, w: 8, h: 6, style: 'exit' },
    ],
  },
  7: {
    spine: [[1, 3], [18, 3], [18, 8], [36, 8], [36, 14], [56, 14], [56, 8], [72, 8], [72, 3], [88, 3]],
    rooms: [
      { name: '霓虹街', x: 3, y: 5, w: 11, h: 6, style: 'entry' },
      { name: '黑市', x: 20, y: 9, w: 14, h: 8, style: 'market' },
      { name: '服务器机房', x: 38, y: 9, w: 14, h: 8, style: 'server' },
      { name: '全息塔广场', x: 56, y: 9, w: 16, h: 9, style: 'landmark', landmark: 'tower' },
      { name: '义体诊所', x: 58, y: 5, w: 10, h: 3, style: 'clinic' },
      { name: '天台酒吧', x: 74, y: 5, w: 12, h: 7, style: 'bar' },
    ],
  },
};

// ---------- 家具/装饰道具：真实 footprint（单位 = TMJ 设计 px，1 格 = 16px） ----------
const PROPS = {
  bench: { w: 40, h: 14, role: 'floorLight', label: '长凳' },
  goal: { w: 48, h: 32, role: 'accent2', label: '球门' },
  desk: { w: 34, h: 20, role: 'accent1', label: '桌' },
  table: { w: 28, h: 24, role: 'wallTop', label: '台' },
  chair: { w: 14, h: 14, role: 'paper', label: '椅' },
  shelf: { w: 14, h: 30, role: 'wallTop', label: '架' },
  cabinet: { w: 18, h: 26, role: 'wallTop', label: '柜' },
  locker: { w: 14, h: 28, role: 'accent1', label: '储物柜' },
  crate: { w: 16, h: 16, role: 'accent2', label: '箱' },
  boxstack: { w: 20, h: 24, role: 'accent2', label: '箱堆' },
  plant: { w: 12, h: 12, role: 'accent2', label: '绿植' },
  cooler: { w: 14, h: 20, role: 'paper', label: '饮水机' },
  sign: { w: 12, h: 18, role: 'paper', label: '牌' },
  monitor: { w: 16, h: 12, role: 'accent1', label: '屏' },
  server: { w: 18, h: 28, role: 'accent1', label: '机柜' },
  chest: { w: 20, h: 14, role: 'accent1', label: '宝箱' },
  column: { w: 12, h: 12, role: 'wallTop', label: '柱' },
  barrel: { w: 14, h: 18, role: 'accent2', label: '桶' },
  chain: { w: 10, h: 16, role: 'paper', label: '链' },
  cone: { w: 10, h: 10, role: 'accent2', label: '锥' },
  bed: { w: 28, h: 16, role: 'paper', label: '床' },
  stove: { w: 22, h: 16, role: 'accent2', label: '灶' },
  cannon: { w: 24, h: 14, role: 'accent2', label: '炮' },
  map: { w: 20, h: 12, role: 'paper', label: '海图' },
  flower: { w: 10, h: 10, role: 'accent2', label: '花' },
  rock: { w: 14, h: 12, role: 'wallTop', label: '石' },
  rope: { w: 18, h: 10, role: 'paper', label: '绳' },
  neon: { w: 10, h: 24, role: 'accent1', label: '霓虹' },
  bar: { w: 26, h: 14, role: 'accent1', label: '吧台' },
  tank: { w: 48, h: 32, role: 'accent1', label: '低温舱' },
  scoreboard: { w: 36, h: 24, role: 'warm', label: '计分塔' },
  throne: { w: 28, h: 30, role: 'accent1', label: '王座' },
  tree: { w: 32, h: 32, role: 'wallTop', label: '古树' },
  shaft: { w: 28, h: 28, role: 'accent1', label: '铁栅井' },
  mast: { w: 18, h: 18, role: 'warm', label: '主桅' },
  tower: { w: 26, h: 26, role: 'accent1', label: '全息塔' },
  jamb: { w: 4, h: 12, role: 'wallTop', label: '门框' },
};

const STYLE_KINDS = {
  entry: ['bench', 'plant', 'sign', 'locker'],
  work: ['desk', 'chair', 'shelf', 'monitor'],
  control: ['desk', 'monitor', 'server', 'cabinet'],
  hazard: ['crate', 'barrel', 'cone', 'chain'],
  rest: ['bench', 'table', 'cooler', 'plant'],
  storage: ['crate', 'boxstack', 'shelf', 'cabinet'],
  exit: ['plant', 'sign', 'bench', 'cooler'],
  track: ['cone', 'bench', 'cooler', 'sign'],
  field: ['bench', 'cone', 'cooler', 'sign'],
  gallery: ['column', 'bench', 'plant', 'sign'],
  library: ['shelf', 'table', 'chair', 'plant'],
  guard: ['desk', 'chair', 'chest', 'bench'],
  market: ['crate', 'shelf', 'sign', 'neon'],
  server: ['server', 'cabinet', 'monitor', 'crate'],
  clinic: ['bed', 'cabinet', 'monitor', 'plant'],
  bar: ['table', 'chair', 'barrel', 'neon'],
  camp: ['bench', 'crate', 'plant', 'cooler'],
  garden: ['plant', 'crate', 'boxstack', 'flower'],
  bridge: ['crate', 'rope', 'plant', 'rock'],
  prison: ['bed', 'chain', 'crate', 'barrel'],
  kitchen: ['table', 'barrel', 'crate', 'stove'],
  captain: ['desk', 'chest', 'map', 'cabinet'],
  cannon: ['cannon', 'barrel', 'crate', 'chain'],
  deck: ['barrel', 'crate', 'rope', 'bench'],
  landmark: ['column', 'plant', 'chest', 'sign'],
};

// 逐层真实素材映射：7 层全部接 vendor sprite；1F/7F 是首批样板，2F–6F 按同一张表铺。
const ASSET_BY_FLOOR = {
  1: {
    plant: 'plantSmall', desk: 'desk', server: 'controlBox', monitor: 'monitorFace',
    sign: 'monitorFace', locker: 'cabinetTall', shelf: 'shelf', cabinet: 'cabinetTall',
    bench: 'sofaSmall', chair: 'chair', cooler: 'water', crate: 'dgnBoxes', boxstack: 'dgnBoxes',
    chest: 'dgnChest', column: 'dgnColumn', tank: 'neonHolo', cone: 'bin', barrel: 'dgnBox',
    chain: 'dgnSkull', table: 'tableSmall', tv: 'monitorFace',
  },
  2: {
    cooler: 'water', plant: 'plantSmall', bench: 'sofaSmall', sign: 'board', cone: 'bin',
    locker: 'cabinetTall', crate: 'dgnBoxes', boxstack: 'dgnBoxes', scoreboard: 'bannerBig',
    table: 'tableSmall', shelf: 'shelf', cabinet: 'cabinetTall', barrel: 'dgnBox', chair: 'chair', goal: 'sportsGoalB',
  },
  3: {
    plant: 'plantSmall', sign: 'dgnFlagRed', column: 'dgnColumn', shelf: 'shelf',
    crate: 'dgnBoxes', boxstack: 'dgnBoxes', bench: 'sofaSmall', chest: 'dgnChest',
    table: 'tableRound', chair: 'chair', chain: 'dgnSkull', cone: 'bin', barrel: 'dgnBox',
    cooler: 'water', throne: 'dgnChestOpen', cabinet: 'cabinetTall',
  },
  4: {
    plant: 'forestBrush1', crate: 'forestStump', bench: 'forestRock2', boxstack: 'forestStump',
    cooler: 'water', flower: 'forestFlowerB', sign: 'board', column: 'forestTree1',
    chest: 'dgnChest', shelf: 'forestStump', cabinet: 'forestStump', rope: 'dgnBox',
    rock: 'forestRock1', tree: 'forestTree1', barrel: 'forestStump',
  },
  5: {
    crate: 'dgnBoxes', barrel: 'dgnBox', chain: 'dgnSkull', cone: 'bin', chest: 'dgnChest',
    sign: 'dgnFlagBlue', bench: 'sofaSmall', plant: 'dgnTorch1', shelf: 'shelf',
    bed: 'sofaSmall', column: 'dgnColumn', chair: 'chair', cabinet: 'cabinetTall',
    cooler: 'water', shaft: 'dgnColumn', desk: 'desk', boxstack: 'dgnBoxes',
  },
  6: {
    crate: 'dgnBoxes', barrel: 'dgnBox', cabinet: 'cabinetTall', bench: 'sofaSmall',
    map: 'lootMap', rope: 'dgnBox', stove: 'cabinetTall', table: 'tableSmall',
    chain: 'dgnSkull', cannon: 'dgnBox', plant: 'plantSmall', mast: 'dgnColumn',
    shelf: 'shelf', boxstack: 'dgnBoxes', chest: 'dgnChest', desk: 'desk',
    cooler: 'water', sign: 'dgnFlagRed',
  },
  7: {
    plant: 'plantSmall', sign: 'bannerArrow', bench: 'sofaSmall', neon: 'neonHolo',
    crate: 'dgnBoxes', cabinet: 'vending', monitor: 'neonHolo', locker: 'cabinetTall',
    server: 'cabinetTall', column: 'dgnColumn', chest: 'dgnChest', table: 'tableSmall',
    chair: 'chair', shelf: 'shelf', tower: 'antenna', bed: 'sofaSmall', barrel: 'dgnBox',
    whiteboard: 'bannerBig', tv: 'neonHolo', vending: 'vending', lamp: 'neonHolo',
  },
};
const OPEN_KINDS = {
  1: ['crate', 'plant', 'monitor', 'sign', 'barrel', 'cooler'],
  2: ['bench', 'cone', 'cooler', 'crate', 'plant', 'sign', 'goal'],
  3: ['plant', 'column', 'sign', 'chest', 'crate', 'barrel'],
  4: ['rock', 'plant', 'crate', 'bench', 'sign', 'barrel'],
  5: ['plant', 'chain', 'column', 'crate', 'barrel', 'sign'],
  6: ['barrel', 'crate', 'rope', 'plant', 'sign', 'bench'],
  7: ['neon', 'plant', 'crate', 'vending', 'shelf', 'barrel'],
};
const ASSET_VARIANTS = {
  1: { plant: ['plantSmall', 'plantBig'] },
  2: { goal: ['sportsGoalA', 'sportsGoalB', 'sportsGoalC'] },
  3: { plant: ['plantSmall', 'plantBig'] },
  4: { plant: ['forestBrush1', 'forestRock2'], rock: ['forestRock1', 'forestRock2'], flower: ['forestFlowerR', 'forestFlowerB'], column: ['forestTree1', 'forestTree2'] },
  7: { plant: ['plantSmall', 'plantBig'], neon: ['neonHolo', 'bannerArrow'], crate: ['dgnBoxes', 'dgnBox'], barrel: ['dgnBox', 'dgnBoxes'], shelf: ['shelf', 'shelfTall'], sign: ['bannerArrow', 'neonHolo'] },
};
const visualRectOf = (p) => {
  const sz = ASSET_SIZES[p.prop];
  if (!sz) return null;
  const s = p.propScale || 1, w = sz[0] * s, h = sz[1] * s;
  return { x: p.x + p.w / 2 - w / 2, y: p.y + p.h - h, w, h };
};
const assetOf = (floorId, kind, seed = 0) => {
  const variants = (ASSET_VARIANTS[floorId] || {})[kind];
  const key = variants && variants.length ? variants[Math.abs(seed) % variants.length] : (ASSET_BY_FLOOR[floorId] || {})[kind];
  const prop = key || '';
  return { prop, propScale: prop ? (ASSET_SCALE[prop] || 1) : 1 };
};

// ---------- 工具 ----------
const key = (x, y) => y * W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const rngOf = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (arr, rng) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const overlap = (a, b, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

// ---------- 连通修复：薄墙/多门之后仍可能有孤岛，用 3 格宽 L 形通道接回主区域 ----------
function repairDeadOpen(walk, critical) {
  for (let iter = 0; iter < 16; iter++) {
    const seen = new Set([key(SPAWN.x, SPAWN.y)]);
    const q = [[SPAWN.x, SPAWN.y]];
    if (!walk[SPAWN.y][SPAWN.x]) return;
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !walk[ny][nx] || seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    let dead = null;
    for (let y = 0; y < H && !dead; y++) for (let x = 0; x < W; x++) {
      if (walk[y][x] && !seen.has(key(x, y))) { dead = [x, y]; break; }
    }
    if (!dead) return;
    let best = null;
    for (const k of seen) {
      const x = k % W, y = Math.floor(k / W);
      const d = Math.abs(x - dead[0]) + Math.abs(y - dead[1]);
      if (!best || d < best.d) best = { d, x, y };
    }
    if (!best) return;
    const [dx0, dy0] = dead;
    for (let x = Math.min(dx0, best.x); x <= Math.max(dx0, best.x); x++) {
      for (const dy of [0, 1, 2]) {
        if (dy0 + dy < H) { walk[dy0 + dy][x] = 1; critical.add(key(x, dy0 + dy)); }
      }
    }
    for (let y = Math.min(dy0, best.y); y <= Math.max(dy0, best.y); y++) {
      for (const dx of [0, 1, 2]) {
        if (best.x + dx < W) { walk[y][best.x + dx] = 1; critical.add(key(best.x + dx, y)); }
      }
    }
  }
}

// ---------- 地形 ----------
// 楼板包络：不再“全实心挖房间”，而是先铺楼板，再用 1 格隔墙 + 2 格门分隔。
const ENVELOPE = [3, 3, 84, 19];
const RING = 2; // 楼板内一圈 2 格宽环形走廊，保证所有功能区/角落可达

// 5F 地牢迷宫：2 格宽走廊 + DFS 生成树 + 少量回路，房间作为迷宫中的石室。
function carveMazeFloor(layout) {
  const walk = Array.from({ length: H }, () => new Array(W).fill(0));
  const critical = new Set(), ring = new Set(), zoneCells = new Set();
  const [ex, ey, ew, eh] = ENVELOPE;
  const rng = rngOf(5 * 104729 + 131);
  // 1 格走廊 + 1 格墙：41×9 个格点，比上一版 28×6/2 格走廊密一倍。
  const S = 2, COLS = 41, ROWS = 9;
  const nx = (gx) => ex + 1 + gx * S;
  const ny = (gy) => ey + 1 + gy * S;
  const carve = (x, y) => { if (inMap(x, y)) walk[y][x] = 1; };
  const carveH = (gx, gy) => carve(nx(gx) + 1, ny(gy));
  const carveV = (gx, gy) => carve(nx(gx), ny(gy) + 1);
  const visited = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
  const cells = [[0, 0]];
  visited[0][0] = true;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const carveNode = (gx, gy) => carve(nx(gx), ny(gy));
  for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) carveNode(gx, gy);
  // Growing Tree：72% 取最新（接近递归回溯）+ 28% 随机（Prim 式分叉），走廊长短更不均匀。
  while (cells.length) {
    const pick = rng() < 0.72 ? cells.length - 1 : Math.floor(rng() * cells.length);
    const [gx, gy] = cells[pick];
    const opts = shuffle(dirs, rng).filter(([dx, dy]) => {
      const tx = gx + dx, ty = gy + dy;
      return tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && !visited[ty][tx];
    });
    if (!opts.length) { cells.splice(pick, 1); continue; }
    const [dx, dy] = opts[0];
    const tx = gx + dx, ty = gy + dy;
    if (dx === 1) carveH(gx, gy);
    else if (dx === -1) carveH(tx, ty);
    else if (dy === 1) carveV(gx, gy);
    else carveV(tx, ty);
    visited[ty][tx] = true;
    cells.push([tx, ty]);
  }
  // 8% 回路：保留死路，但减少“只有一条长走廊”的单调
  for (let gy = 0; gy < ROWS; gy++) for (let gx = 0; gx < COLS; gx++) {
    if (gx + 1 < COLS && rng() < 0.08) carveH(gx, gy);
    if (gy + 1 < ROWS && rng() < 0.08) carveV(gx, gy);
  }
  // 石室只留小核心，不再用大房间把迷宫挖空
  for (const r of layout.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      carve(x, y); zoneCells.add(key(x, y));
    }
  }
  // 电梯入口：左右各 2 格高，接到第一/最后一列格点
  for (const y of DOOR_ROWS) {
    for (let x = 0; x <= ex + 2; x++) carve(x, y);
    for (let x = ex + ew - 2; x < W; x++) carve(x, y);
  }
  for (let y = 2; y <= 5; y++) { carve(ex + 1, y); carve(ex + 2, y); carve(ex + ew - 2, y); carve(ex + ew - 3, y); }
  repairDeadOpen(walk, critical);
  // 主路径：左入口 → 右入口，BFS 最短
  const start = [2, 3], goal = [W - 3, 3];
  const prev = new Map();
  const q = [start];
  const seen = new Set([key(start[0], start[1])]);
  while (q.length) {
    const [x, y] = q.shift();
    if (x === goal[0] && y === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = x + dx, ty = y + dy;
      if (!inMap(tx, ty) || !walk[ty][tx]) continue;
      const k = key(tx, ty);
      if (seen.has(k)) continue;
      seen.add(k); prev.set(k, key(x, y)); q.push([tx, ty]);
    }
  }
  let cur = key(goal[0], goal[1]);
  if (seen.has(cur)) {
    while (cur !== key(start[0], start[1])) {
      critical.add(cur);
      cur = prev.get(cur);
      if (cur === undefined) break;
    }
    critical.add(key(start[0], start[1]));
  }
  return { walk, critical, ring, zoneCells, cores: 0 };
}
function carveFloor(layout, floorId) {
  if (floorId === 5) return carveMazeFloor(layout);
  const walk = Array.from({ length: H }, () => new Array(W).fill(0));
  const critical = new Set();
  const ring = new Set();
  const zoneCells = new Set();
  const zoneMask = Array.from({ length: H }, () => new Array(W).fill(-1));
  const set = (x, y, v) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    walk[y][x] = v;
  };
  const [ex, ey, ew, eh] = ENVELOPE;

  // 1) 楼板
  for (let y = ey; y < ey + eh; y++) for (let x = ex; x < ex + ew; x++) set(x, y, 1);
  // 2) 环形走廊
  for (let y = ey; y < ey + eh; y++) for (let x = ex; x < ex + ew; x++) {
    if (x < ex + RING || x >= ex + ew - RING || y < ey + RING || y >= ey + eh - RING) {
      set(x, y, 1); ring.add(key(x, y));
    }
  }
  // 3) 功能区遮罩
  layout.rooms.forEach((r, i) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x >= 0 && y >= 0 && x < W && y < H) zoneMask[y][x] = i;
    }
  });

  // 4) 主路径：2 格宽折线（先记录，最后再确保打开）
  const spineSet = new Set();
  for (let i = 0; i < layout.spine.length - 1; i++) {
    const [x1, y1] = layout.spine[i], [x2, y2] = layout.spine[i + 1];
    if (x1 === x2) {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) for (const x of [x1, x1 + 1]) {
        set(x, y, 1); spineSet.add(key(x, y)); critical.add(key(x, y));
      }
    } else {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) for (const y of [y1, y1 + 1]) {
        set(x, y, 1); spineSet.add(key(x, y)); critical.add(key(x, y));
      }
    }
  }

  // 5) 功能区 2 格厚隔墙：画扩展矩形的一圈，跳过环廊/主路径/其它功能区
  layout.rooms.forEach((r, zi) => {
    const skip = (x, y) =>
      spineSet.has(key(x, y)) || ring.has(key(x, y)) ||
      (zoneMask[y] && zoneMask[y][x] >= 0 && zoneMask[y][x] !== zi);
    const x0 = r.x - 1, y0 = r.y - 1, x1 = r.x + r.w, y1 = r.y + r.h;
    for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (!skip(x, y)) set(x, y, 0);
    for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if (!skip(x, y)) set(x, y, 0);
  });

  // 6) 功能区连到主路径/环廊：2 格深门洞 + 2 格宽 L 形通道
  const anchors = [...spineSet, ...ring].map((k) => ({ x: k % W, y: Math.floor(k / W) }));
  for (const r of layout.rooms) {
    let best = null;
    for (let yy = r.y; yy < r.y + r.h; yy++) for (let xx = r.x; xx < r.x + r.w; xx++) {
      const edge = xx === r.x || xx === r.x + r.w - 1 || yy === r.y || yy === r.y + r.h - 1;
      if (!edge) continue;
      for (const s of anchors) {
        const d = Math.abs(s.x - xx) + Math.abs(s.y - yy);
        if (!best || d < best.d) best = { d, x: xx, y: yy, sx: s.x, sy: s.y };
      }
    }
    if (!best) continue;
    const { x: cx, y: cy, sx, sy } = best;
    const door = (cells) => {
      for (const [x, y] of cells) {
        set(x, y, 1);
        if (x >= 0 && y >= 0 && x < W && y < H) critical.add(key(x, y));
      }
    };
    if (cx === r.x) door([[cx - 1, cy], [cx - 1, cy + 1], [cx, cy], [cx, cy + 1]]);
    else if (cx === r.x + r.w - 1) door([[cx + 1, cy], [cx + 1, cy + 1], [cx, cy], [cx, cy + 1]]);
    else if (cy === r.y) door([[cx, cy - 1], [cx + 1, cy - 1], [cx, cy], [cx + 1, cy]]);
    else door([[cx, cy + 1], [cx + 1, cy + 1], [cx, cy], [cx + 1, cy]]);
    if (Math.abs(cx - sx) > 1) for (let x = Math.min(cx, sx); x <= Math.max(cx, sx); x++) {
      set(x, cy, 1); set(x, cy + 1, 1); critical.add(key(x, cy)); critical.add(key(x, cy + 1));
    }
    if (Math.abs(cy - sy) > 1) for (let y = Math.min(cy, sy); y <= Math.max(cy, sy); y++) {
      set(cx, y, 1); set(cx + 1, y, 1); critical.add(key(cx, y)); critical.add(key(cx + 1, y));
    }
  }

  // 7) 电梯入口：左右各 2 格高，接到环廊
  for (const y of DOOR_ROWS) {
    for (let x = 0; x <= ex; x++) { set(x, y, 1); critical.add(key(x, y)); }
    for (let x = ex + ew - 1; x < W; x++) { set(x, y, 1); critical.add(key(x, y)); }
  }

  // 8) 结构柱/设备间：贪心填 4×4/5×3 等实心块，压低空地率；每放一块都检查连通和功能区可达
  const targetOpen = (floorId === 5 ? 0.52 : 0.58) * W * H;
  let openCount = 0;
  for (const row of walk) for (const v of row) if (v) openCount++;
  const reachInfo = () => {
    const seen = new Set([key(SPAWN.x, SPAWN.y)]); const q = [[SPAWN.x, SPAWN.y]];
    if (!walk[SPAWN.y][SPAWN.x]) return { seen, ok: false };
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || !walk[ny][nx] || seen.has(k)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    const zonesOk = layout.rooms.every((r) => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (walk[y][x] && seen.has(key(x, y))) return true;
      }
      return false;
    });
    return { seen, ok: zonesOk };
  };
  const cores = [];
  const sizes = [[6, 4], [5, 4], [7, 3], [4, 4], [5, 3], [4, 3]];
  const candidates = [];
  for (const [cw, ch] of sizes) {
    for (let y = ey + 3; y < ey + eh - ch - 2; y += 2) {
      for (let x = ex + 3; x < ex + ew - cw - 2; x += 2) candidates.push([x, y, cw, ch]);
    }
  }
  const shuffled = shuffle(candidates, rngOf(floorId * 1237 + 7));
  for (const [x, y, cw, ch] of shuffled) {
    if (openCount <= targetOpen) break;
    let ok = true;
    for (let yy = y; yy < y + ch && ok; yy++) for (let xx = x; xx < x + cw; xx++) {
      if (!walk[yy][xx] || zoneMask[yy][xx] >= 0 || spineSet.has(key(xx, yy)) || ring.has(key(xx, yy)) || critical.has(key(xx, yy))) { ok = false; break; }
    }
    if (!ok) continue;
    if (cores.some(([cx0, cy0, cw0, ch0]) => x < cx0 + cw0 && cx0 < x + cw && y < cy0 + ch0 && cy0 < y + ch)) continue;
    const before = reachInfo();
    for (let yy = y; yy < y + ch; yy++) for (let xx = x; xx < x + cw; xx++) walk[yy][xx] = 0;
    const after = reachInfo();
    if (!after.ok || after.seen.size < before.seen.size - cw * ch) {
      for (let yy = y; yy < y + ch; yy++) for (let xx = x; xx < x + cw; xx++) walk[yy][xx] = 1;
      continue;
    }
    cores.push([x, y, cw, ch]);
    openCount -= cw * ch;
  }

  // 9) 边界：楼板外包络外保持实心；门行例外
  for (let x = 0; x < W; x++) { walk[0][x] = 0; walk[1][x] = 0; walk[H - 1][x] = 0; }
  for (let y = 0; y < H; y++) if (y !== 2 && y !== 3) { walk[y][0] = 0; walk[y][W - 1] = 0; }
  // 功能区内部登记，保留旧接口
  for (const r of layout.rooms) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (walk[y][x]) zoneCells.add(key(x, y));
  return { walk, critical, ring, zoneCells, cores };
}

// ---------- 道具放置 ----------
function placeProps(floorId, layout, walk, critical, zoneCells, ring) {
  const rng = rngOf(floorId * 7919 + 17);
  const props = [];
  const avoid = [...new Set([...critical, ...ring])];
  const pathRects = avoid.map((k) => ({ x: (k % W) * T, y: Math.floor(k / W) * T, w: T, h: T }));
  const occupied = [];
  const addProp = (kind, x, y, room, extra = {}) => {
    const def = PROPS[kind];
    if (!def) return false;
    const w = extra.w || def.w, h = extra.h || def.h;
    const rect = { x: Math.round(x), y: Math.round(y), w, h };
    const onWalk = (px, py) => {
      const tx = Math.floor(px / T), ty = Math.floor(py / T);
      return !!(walk[ty] && walk[ty][tx]);
    };
    const willBeSolid = extra.solid !== undefined ? extra.solid : extra.landmark === true;
    if (willBeSolid) {
      if (![[rect.x + 2, rect.y + 2], [rect.x + rect.w - 2, rect.y + 2],
        [rect.x + 2, rect.y + rect.h - 2], [rect.x + rect.w - 2, rect.y + rect.h - 2]]
        .every(([px, py]) => onWalk(px, py))) return false;
    } else if (!onWalk(rect.x + rect.w / 2, rect.y + rect.h / 2)) return false;
    const roomPx = { x: room.x * T, y: room.y * T, w: room.w * T, h: room.h * T };
    if (rect.x < roomPx.x + 2 || rect.y < roomPx.y + 2 ||
        rect.x + rect.w > roomPx.x + roomPx.w - 2 || rect.y + rect.h > roomPx.y + roomPx.h - 2) return false;
    if (willBeSolid && pathRects.some((p) => overlap(rect, p, 2))) return false;
    if (occupied.some((p) => overlap(rect, p, 2))) return false;
    const asset = assetOf(floorId, kind, rect.x * 31 + rect.y);
    const sz = ASSET_SIZES[asset.prop];
    const vw = sz ? sz[0] * asset.propScale : rect.w;
    const vh = sz ? sz[1] * asset.propScale : rect.h;
    const vis = { x: rect.x + rect.w / 2 - vw / 2, y: rect.y + rect.h - vh, w: vw, h: vh };
    if (props.some((q) => {
      const qv = visualRectOf(q);
      return qv && overlap(vis, qv, -6);
    })) return false;
    const obj = {
      kind, label: extra.label || def.label, role: extra.role || def.role,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      ...asset,
      solid: willBeSolid,
      ...extra,
    };
    props.push(obj);
    occupied.push(rect);
    return true;
  };

  for (const room of layout.rooms) {
    const roomPx = { x: room.x * T, y: room.y * T, w: room.w * T, h: room.h * T };
    const styleKinds = STYLE_KINDS[room.style] || STYLE_KINDS.storage;

    // 1) 标志物：先放，优先房间中心，其次四角/偏移
    if (room.landmark) {
      const def = PROPS[room.landmark];
      const cx = roomPx.x + roomPx.w / 2 - def.w / 2;
      const cy = roomPx.y + roomPx.h / 2 - def.h / 2;
      const candidates = [
        [cx, cy], [cx - 24, cy], [cx + 24, cy], [cx, cy - 18], [cx, cy + 18],
        [roomPx.x + 8, roomPx.y + 8], [roomPx.x + roomPx.w - def.w - 8, roomPx.y + 8],
        [roomPx.x + 8, roomPx.y + roomPx.h - def.h - 8],
        [roomPx.x + roomPx.w - def.w - 8, roomPx.y + roomPx.h - def.h - 8],
      ];
      if (room.landmark === 'scoreboard') {
        candidates.unshift(
          [roomPx.x + 8, roomPx.y + 8],
          [roomPx.x + roomPx.w - def.w - 8, roomPx.y + 8],
          [roomPx.x + 8, roomPx.y + roomPx.h - def.h - 8],
          [roomPx.x + roomPx.w - def.w - 8, roomPx.y + roomPx.h - def.h - 8],
        );
      }
      let placed = false;
      const solidLandmark = room.landmark !== 'scoreboard'; // 计分塔是悬挂物，不挡 200–300 人的球场动线
      for (const [x, y] of candidates) if (addProp(room.landmark, x, y, room, { landmark: true, solid: solidLandmark })) { placed = true; break; }
      // 200–300 人模式：实在放不下实心标志物时，退化为非阻挡地标（仍保留视觉焦点）
      if (!placed) for (const [x, y] of candidates) if (addProp(room.landmark, x, y, room, { landmark: true, solid: false })) { placed = true; break; }
      if (!placed) console.warn(`  warn floor${floorId} ${room.name}: 标志物 ${room.landmark} 放不下`);
    }

    // 2) 两簇靠墙装饰：每簇 2–4 件同族道具
    const sides = ['north', 'south', 'west', 'east'];
    let clusters = 0;
    for (let attempt = 0; attempt < 10 && clusters < 2; attempt++) {
      const side = sides[(attempt + Math.floor(rng() * 4)) % 4];
      const kinds = shuffle(styleKinds, rng);
      const horizontal = side === 'north' || side === 'south';
      let cursor = horizontal
        ? roomPx.x + 4 + rng() * Math.max(0, roomPx.w - 80)
        : roomPx.y + 4 + rng() * Math.max(0, roomPx.h - 80);
      let placed = 0;
      for (const kind of kinds) {
        const def = PROPS[kind];
        if (!def) continue;
        let x, y;
        if (side === 'north') { x = cursor; y = roomPx.y + 3; }
        else if (side === 'south') { x = cursor; y = roomPx.y + roomPx.h - def.h - 3; }
        else if (side === 'west') { x = roomPx.x + 3; y = cursor; }
        else { x = roomPx.x + roomPx.w - def.w - 3; y = cursor; }
        if (addProp(kind, x, y, room)) {
          placed++;
          cursor += (horizontal ? def.w : def.h) + 4;
        }
        if (placed >= 4) break;
      }
      if (placed >= 2) clusters++;
    }
  }
  return { props, pathRects };
}

// ---------- 装饰层 ----------
function buildDecorLayers(walk, critical, zoneCells, layout, props, rng) {
  const decor = new Array(W * H).fill(0);
  const objects = new Array(W * H).fill(0);
  // 墙脚线：贴着可行走面的墙格
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (walk[y][x]) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && walk[y + dy][x + dx]);
    if (near) decor[key(x, y)] = 3;
  }
  // 主路径导视：critical = 脊柱 + 房间连接，铺一层 accent1 地面标记（渲染层会压暗）
  for (const k of critical) {
    const x = k % W, y = Math.floor(k / W);
    if (walk[y][x]) decor[k] = 3;
  }
  // 每个功能区一块 3×1 地面标记（不压主路径/道具）
  const blockedAt = (x, y) => {
    if (!inMap(x, y) || !walk[y][x]) return true;
    if (critical.has(key(x, y))) return true;
    return props.some((p) => x * T + T > p.x && x * T < p.x + p.w && y * T + T > p.y && y * T < p.y + p.h);
  };
  for (const room of layout.rooms) {
    let placed = false;
    for (let yy = room.y + 1; yy < room.y + room.h - 1 && !placed; yy++) {
      for (let xx = room.x + 1; xx < room.x + room.w - 2; xx++) {
        if (!blockedAt(xx, yy) && !blockedAt(xx + 1, yy) && !blockedAt(xx + 2, yy)) {
          decor[key(xx, yy)] = 3; decor[key(xx + 1, yy)] = 3; decor[key(xx + 2, yy)] = 3;
          placed = true; break;
        }
      }
    }
  }
  // 软装饰：每间房 2 个小簇（2–3 格），给 objects 层一点内容
  for (const room of layout.rooms) {
    let clusters = 0;
    for (let attempt = 0; attempt < 12 && clusters < 2; attempt++) {
      const xx = room.x + 1 + Math.floor(rng() * Math.max(1, room.w - 3));
      const yy = room.y + 1 + Math.floor(rng() * Math.max(1, room.h - 2));
      if (blockedAt(xx, yy) || blockedAt(xx + 1, yy)) continue;
      // 防止相邻两簇粘成 7–8 格：候选格 1 格内已有 objects 就换位置
      const nearObject = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (objects[key(x + dx, y + dy)]) return true;
        }
        return false;
      };
      if (nearObject(xx, yy) || nearObject(xx + 1, yy) || nearObject(xx, yy + 1)) continue;
      objects[key(xx, yy)] = 4; objects[key(xx + 1, yy)] = 4;
      if (rng() < 0.5 && !blockedAt(xx, yy + 1)) objects[key(xx, yy + 1)] = 4;
      clusters++;
    }
  }
  return { decor, objects };
}

// ---------- 电梯 / 出生点 ----------
function liftObjects(floorId) {
  const out = [];
  for (const side of ['left', 'right']) {
    const p = WORLD.floorPortal(floorId, side);
    if (!p) continue;
    const target = side === 'left' ? floorId - 1 : floorId + 1;
    if (target < 1 || target > 7) continue; // 1F 无下行，7F 无上行
    out.push({
      side, targetFloor: target,
      x: Math.round(p.x / WORLD.FLOOR_SCALE),
      y: Math.round(p.y / WORLD.FLOOR_SCALE),
      w: Math.round(p.w / WORLD.FLOOR_SCALE),
      h: Math.round(p.h / WORLD.FLOOR_SCALE),
    });
  }
  return out;
}

function hallJambs(lift, mapW) {
  // 旧电梯厅 144×96 world（=72×48 design），门洞 48 world（=24 design）高。
  const cx = lift.x + lift.w / 2, cy = lift.y + lift.h / 2;
  const hallW = 72, hallH = 48, doorH = 24;
  const hallX = lift.side === 'left' ? -hallW : mapW;
  const hallY = cy - hallH / 2;
  const doorY = cy - doorH / 2;
  return [
    { kind: 'jamb', x: hallX, y: hallY, w: 4, h: doorY - hallY },
    { kind: 'jamb', x: hallX, y: doorY + doorH, w: 4, h: hallY + hallH - doorY - doorH },
  ];
}

// ---------- 死区清理：道具靠墙后可能围出 1–2 格口袋，删掉最近的装饰件把它打开 ----------
function pruneDeadProps(props, walk) {
  const solidProps = () => props.filter((p) => p.kind !== 'jamb');
  const reach = () => {
    const blocked = (x, y) => {
      if (!inMap(x, y) || !walk[y][x]) return true;
      const px = (x + 0.5) * T, py = (y + 0.5) * T;
      return solidProps().some((p) => px >= p.x && px < p.x + p.w && py >= p.y && py < p.y + p.h);
    };
    const seen = new Set();
    const start = [SPAWN.x, SPAWN.y];
    if (blocked(start[0], start[1])) return { seen, blocked };
    seen.add(key(start[0], start[1]));
    const q = [start];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, k = key(nx, ny);
        if (!inMap(nx, ny) || seen.has(k) || blocked(nx, ny)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    return { seen, blocked };
  };
  for (let iter = 0; iter < 24; iter++) {
    const { seen, blocked } = reach();
    const dead = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!walk[y][x] || seen.has(key(x, y)) || blocked(x, y)) continue;
      dead.push([x, y]);
    }
    if (!dead.length) break;
    const [dx, dy] = dead[0];
    let best = -1, bestD = Infinity;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (p.kind === 'jamb' || p.landmark) continue;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const d = Math.hypot(cx - (dx + 0.5) * T, cy - (dy + 0.5) * T);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > 96) break;
    props.splice(best, 1);
  }
  return props;
}

// ---------- 孤点清理：48px 内没有同伴的装饰件，先补一件小件；补不下就删掉 ----------
function groupIsolatedProps(props, layout, walk, critical, floorId) {
  const pathRects = [...critical].map((k) => ({ x: (k % W) * T, y: Math.floor(k / W) * T, w: T, h: T }));
  const roomOf = (p) => layout.rooms.find((r) =>
    p.x + p.w / 2 >= r.x * T && p.x + p.w / 2 <= (r.x + r.w) * T &&
    p.y + p.h / 2 >= r.y * T && p.y + p.h / 2 <= (r.y + r.h) * T);
  const companions = ['plant', 'crate', 'chair', 'cone', 'sign'];
  for (let iter = 0; iter < 24; iter++) {
    const lonely = props.find((p) => p.kind !== 'jamb' && !p.landmark &&
      !props.some((q) => q !== p && Math.hypot(q.x + q.w / 2 - (p.x + p.w / 2), q.y + q.h / 2 - (p.y + p.h / 2)) <= 48));
    if (!lonely) break;
    const room = roomOf(lonely);
    let added = false;
    if (room) {
      for (const kind of companions) {
        const def = PROPS[kind];
        const cands = [
          [lonely.x + lonely.w + 2, lonely.y],
          [lonely.x - def.w - 2, lonely.y],
          [lonely.x, lonely.y + lonely.h + 2],
          [lonely.x, lonely.y - def.h - 2],
        ];
        for (const [x, y] of cands) {
          const rect = { x, y, w: def.w, h: def.h };
          if (x < room.x * T + 2 || y < room.y * T + 2 ||
              x + def.w > (room.x + room.w) * T - 2 || y + def.h > (room.y + room.h) * T - 2) continue;
          const tx = Math.floor((x + def.w / 2) / T), ty = Math.floor((y + def.h / 2) / T);
          if (!(walk[ty] && walk[ty][tx])) continue;
          if (props.some((p) => overlap(rect, { x: p.x, y: p.y, w: p.w, h: p.h }, 2))) continue;
          props.push({ kind, label: def.label, role: def.role, x, y, w: def.w, h: def.h, ...assetOf(floorId, kind, x * 31 + y), solid: false });
          added = true; break;
        }
        if (added) break;
      }
    }
    if (!added) props.splice(props.indexOf(lonely), 1);
  }
  return props;
}

// ---------- 落位兜底：任何功能区至少 2 件小陈设，避免主路径穿过房间后一件都放不下 ----------
function ensureZoneProps(props, layout, walk, critical, ring, floorId) {
  const roomCount = new Map(layout.rooms.map((r) => [r.name, 0]));
  const centerIn = (p, r) => {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    return cx >= r.x * T && cx <= (r.x + r.w) * T && cy >= r.y * T && cy <= (r.y + r.h) * T;
  };
  for (const p of props) for (const r of layout.rooms) if (centerIn(p, r)) roomCount.set(r.name, (roomCount.get(r.name) || 0) + 1);
  const free = (rect) => !props.some((p) => overlap(rect, { x: p.x, y: p.y, w: p.w, h: p.h }, 2));
  for (const r of layout.rooms) {
    let count = roomCount.get(r.name) || 0;
    while (count < 2) {
      let done = false;
      // 优先贴墙放一对小件（plant + crate），保证 48px 内成组
      for (let y = r.y; y < r.y + r.h && !done; y++) {
        for (let x = r.x; x < r.x + r.w - 1; x++) {
          if (!walk[y][x] || !walk[y][x + 1]) continue;
          const a = { kind: 'plant', label: PROPS.plant.label, role: PROPS.plant.role, x: x * T + 2, y: y * T + 3, w: 12, h: 12, ...assetOf(floorId, 'plant', x * T * 31 + y * T), solid: false };
          const b = { kind: 'crate', label: PROPS.crate.label, role: PROPS.crate.role, x: x * T + 18, y: y * T + 3, w: 14, h: 14, ...assetOf(floorId, 'crate', x * T * 31 + y * T), solid: false };
          if (!free({ x: a.x, y: a.y, w: a.w, h: a.h }) || !free({ x: b.x, y: b.y, w: b.w, h: b.h })) continue;
          props.push(a, b); count += 2; done = true; break;
        }
      }
      if (!done) break;
    }
  }
  return props;
}

// ---------- 开放区填充：1F/7F 样板，把环廊/中庭也铺成组素材（非阻挡） ----------
function placeOpenDecor(props, layout, walk, critical, ring, floorId) {
  const kinds = OPEN_KINDS[floorId];
  if (!kinds) return props;
  const rng = rngOf(floorId * 3571 + 19);
  const [ex, ey, ew, eh] = ENVELOPE;
  const insideZone = (x, y) => layout.rooms.some((r) =>
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  const add = (kind, x, y) => {
    const def = PROPS[kind];
    if (!def) return false;
    const rect = { x: Math.round(x), y: Math.round(y), w: def.w, h: def.h };
    if (rect.x < ex * T + 2 || rect.y < ey * T + 2 ||
        rect.x + rect.w > (ex + ew) * T - 2 || rect.y + rect.h > (ey + eh) * T - 2) return false;
    const tx = Math.floor((rect.x + rect.w / 2) / T), ty = Math.floor((rect.y + rect.h / 2) / T);
    if (!walk[ty] || !walk[ty][tx]) return false;
    if (props.some((p) => overlap(rect, { x: p.x, y: p.y, w: p.w, h: p.h }, 2))) return false;
    const asset = assetOf(floorId, kind, rect.x * 31 + rect.y);
    const sz = ASSET_SIZES[asset.prop];
    const vw = sz ? sz[0] * asset.propScale : rect.w;
    const vh = sz ? sz[1] * asset.propScale : rect.h;
    const vis = { x: rect.x + rect.w / 2 - vw / 2, y: rect.y + rect.h - vh, w: vw, h: vh };
    if (props.some((p) => {
      const qv = visualRectOf(p);
      return qv && overlap(vis, qv, -6);
    })) return false;
    props.push({
      kind, label: def.label, role: def.role,
      x: rect.x, y: rect.y, w: rect.w, h: rect.h,
      ...asset, solid: false,
    });
    return true;
  };
  let clusters = 0;
  const targetClusters = floorId === 2 ? 18 : floorId === 3 ? 20 : floorId === 7 ? 22 : floorId === 1 ? 16 : floorId === 6 ? 16 : 14;
  for (let attempt = 0; attempt < 600 && clusters < targetClusters; attempt++) {
    const bx = ex + 3 + Math.floor(rng() * (ew - 6));
    const by = ey + 3 + Math.floor(rng() * (eh - 6));
    if (!walk[by][bx] || insideZone(bx, by)) continue;
    // 开放区道具贴墙/贴环廊放，别散在场地中间挡 200–300 人的动线
    const nearWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) =>
      !walk[by + dy] || !walk[by + dy][bx + dx]);
    if (!nearWall) continue;
    const row = shuffle(kinds, rng);
    const horizontal = rng() < 0.5;
    const start = props.length;
    let cx = bx * T + 2, cy = by * T + 2, placed = 0;
    for (const kind of row) {
      const def = PROPS[kind];
      const x = horizontal ? cx : bx * T + 2;
      const y = horizontal ? by * T + 2 : cy;
      if (add(kind, x, y)) {
        placed++;
        if (horizontal) cx += Math.max(def.w, 40) + 2; else cy += Math.max(def.h, 40) + 2;
      }
      if (placed >= 4) break;
    }
    if (placed >= 2) clusters++; else props.length = start;
  }
  return props;
}

// 最后兜底：孤点道具就近补一件同层小件；补不上才移除，避免破坏功能区陈设计数。
function pairIsolatedProps(props, walk, floorId) {
  const companions = ['plant', 'crate', 'cone', 'flower', 'rock', 'barrel']
    .filter((k) => PROPS[k] && (ASSET_BY_FLOOR[floorId] || {})[k]);
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    if (p.landmark) continue;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    if (props.some((q) => q !== p && Math.hypot(q.x + q.w / 2 - cx, q.y + q.h / 2 - cy) <= 48)) continue;
    let added = false;
    for (const kind of companions) {
      const def = PROPS[kind];
      const offsets = [[p.w + 4, 0], [-def.w - 4, 0], [0, p.h + 4], [0, -def.h - 4],
        [p.w / 2 - def.w / 2, p.h + 4], [p.w / 2 - def.w / 2, -def.h - 4]];
      for (const [dx, dy] of offsets) {
        const rect = { x: Math.round(p.x + dx), y: Math.round(p.y + dy), w: def.w, h: def.h };
        if (rect.x < 2 || rect.y < 2 || rect.x + rect.w > W * T - 2 || rect.y + rect.h > H * T - 2) continue;
        const tx = Math.floor((rect.x + rect.w / 2) / T), ty = Math.floor((rect.y + rect.h / 2) / T);
        if (!walk[ty] || !walk[ty][tx]) continue;
        if (props.some((q) => overlap(rect, { x: q.x, y: q.y, w: q.w, h: q.h }, 2))) continue;
        props.push({ kind, label: def.label, role: def.role, x: rect.x, y: rect.y, w: rect.w, h: rect.h, ...assetOf(floorId, kind, rect.x * 31 + rect.y), solid: false });
        added = true; break;
      }
      if (added) break;
    }
    if (!added) props.splice(i, 1);
  }
}
// 最后清掉残余的 sprite 视觉重叠：优先移除后加入的非 landmark 小件；zone 计数由 validate-extra 兜底。
function resolveVisualOverlaps(props) {
  for (let i = 0; i < props.length; i++) {
    const a = visualRectOf(props[i]);
    if (!a) continue;
    for (let j = i + 1; j < props.length; j++) {
      const b = visualRectOf(props[j]);
      if (!b) continue;
      const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ix <= 6 || iy <= 6) continue;
      if (!props[i].landmark) { props.splice(i, 1); i--; break; }
      if (!props[j].landmark) { props.splice(j, 1); j--; }
    }
  }
}
// ---------- 生成 TMJ ----------
function makeTmj(themeId) {
  const theme = themeById(themeId);
  const layout = LAYOUTS[themeId];
  const { walk, critical, ring, zoneCells, cores } = carveFloor(layout, themeId);
  const { props } = placeProps(themeId, layout, walk, critical, zoneCells, ring);
  console.log(`  cores ${cores.length}`);
  pruneDeadProps(props, walk);
  for (let i = 0; i < 4; i++) {
    groupIsolatedProps(props, layout, walk, critical, themeId);
    pruneDeadProps(props, walk);
  }
  groupIsolatedProps(props, layout, walk, critical, themeId);
  ensureZoneProps(props, layout, walk, critical, ring, themeId);
  placeOpenDecor(props, layout, walk, critical, ring, themeId);
  pairIsolatedProps(props, walk, themeId);
  resolveVisualOverlaps(props);
  const { decor, objects } = buildDecorLayers(walk, critical, zoneCells, layout, props, rngOf(themeId * 104729 + 7));
  const lifts = liftObjects(themeId);
  const mapW = W * T;
  const jambProps = lifts.flatMap((l) => hallJambs(l, mapW));
  // 门框也进 props 层（真实 footprint，运行时据此挡人）
  for (const j of jambProps) props.push({ ...j, label: '门框', role: 'wallTop', solid: true });

  const oid = { n: 1 };
  const propObjects = props.map((p) => ({
    id: oid.n++, name: `prop-${p.kind}`, type: 'prop',
    x: p.x, y: p.y, width: p.w, height: p.h, rotation: 0, visible: true,
    properties: [
      { name: 'kind', type: 'string', value: p.kind },
      { name: 'label', type: 'string', value: p.label },
      { name: 'role', type: 'string', value: p.role },
      { name: 'prop', type: 'string', value: p.prop || '' },
      { name: 'propScale', type: 'int', value: p.propScale || 1 },
      { name: 'solid', type: 'bool', value: p.solid !== false },
      ...(p.landmark ? [{ name: 'landmark', type: 'bool', value: true }] : []),
    ],
  }));

  const zoneObjects = layout.rooms.map((r, i) => ({
    id: oid.n++, name: r.name, type: 'zone',
    x: r.x * T, y: r.y * T, width: r.w * T, height: r.h * T, rotation: 0, visible: true,
    properties: [
      { name: 'index', type: 'int', value: i + 1 },
      { name: 'style', type: 'string', value: r.style },
      { name: 'zone', type: 'bool', value: true },
      ...(r.landmark ? [{ name: 'landmark', type: 'bool', value: true }] : []),
    ],
  }));

  const objectsLayer = [{
    id: oid.n++, name: 'spawn', type: 'point',
    x: (SPAWN.x + 0.5) * T, y: (SPAWN.y + 0.5) * T, point: true, rotation: 0, visible: true, properties: [],
  }];
  for (const l of lifts) {
    objectsLayer.push({
      id: oid.n++, name: `lift-${l.side}`, type: 'rect',
      x: l.x, y: l.y, width: l.w, height: l.h, rotation: 0, visible: true,
      properties: [
        { name: 'side', type: 'string', value: l.side },
        { name: 'targetFloor', type: 'int', value: l.targetFloor },
        { name: 'targetSpawn', type: 'string', value: 'spawn' },
      ],
    });
  }

  const flat = (arr) => arr.map((v) => v);
  const layers = [
    { id: 1, name: 'ground', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: walk.map((row) => row.map((v) => (v ? 1 : 0))) .flat() },
    { id: 2, name: 'decor', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: flat(decor) },
    { id: 3, name: 'objects', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: flat(objects) },
    { id: 4, name: 'collision', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: false, data: walk.map((row) => row.map((v) => (v ? 0 : 1))).flat() },
    { id: 5, name: 'zones', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: zoneObjects },
    { id: 6, name: 'props', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: propObjects },
    { id: 7, name: 'markers', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: objectsLayer },
  ];

  return {
    type: 'map', version: '1.10', tiledversion: '1.12.2', orientation: 'orthogonal', renderorder: 'right-down',
    width: W, height: H, tilewidth: T, tileheight: T, infinite: false,
    tilesets: [{ firstgid: 1, source: `tileset-floor${themeId}.tsj` }],
    nextlayerid: 8, nextobjectid: oid.n,
    layers,
    properties: [
      { name: 'theme', type: 'string', value: `${themeId}F · ${theme.name}` },
      { name: 'palette', type: 'string', value: PALETTE_LIST[themeId].join(',') },
      { name: 'source', type: 'string', value: 'build-floors' },
      { name: 'grid', type: 'string', value: '90x25@16' },
      { name: 'collision', type: 'string', value: 'tiles+props' },
      { name: 'landmark', type: 'string', value: theme.landmark },
      { name: 'zones', type: 'string', value: theme.zones.join(',') },
    ],
  };
}

mkdirSync('tiled', { recursive: true });
for (const theme of THEMES) {
  const map = makeTmj(theme.id);
  writeFileSync(`tiled/floor${theme.id}.tmj`, JSON.stringify(map, null, 1));
  const open = map.layers.find((l) => l.name === 'ground').data.filter(Boolean).length;
  const props = map.layers.find((l) => l.name === 'props').objects.length;
  console.log(`floor${theme.id}.tmj  ${theme.name}  ${W}x${H}  开地 ${open}/${W * H}=${(open / (W * H) * 100).toFixed(1)}%  props ${props}`);
}
writeFileSync('tiled/asset-files.json', JSON.stringify({ files: ASSET_FILES, scale: ASSET_SCALE }, null, 1));





































