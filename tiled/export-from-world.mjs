// 只读碰撞校验器（不再是数据源）。
//
// 数据源固定为 tiled/build-floors.mjs 产出的 floor*.tmj；本脚本只做两件事：
//   1. 把 TMJ collision 层与旧 WORLD.floorCollides() 逐格对比，报告差异；
//   2. 把 TMJ markers 里的电梯/出生点与 WORLD.floorPortal()/floorSpawns() 对比，报告偏移。
// 它不会写任何 floor*.tmj。差异是预期的（手绘布局本来就不等于旧楼层几何），
// 报告用于发现“新墙压住旧门口”“新开口落在旧家具里”这类事故，而不是追求 0 差异。
//
// 用法：
//   node tiled/export-from-world.mjs
//   node tiled/export-from-world.mjs --strict        # 有差异即 exit 1（发布前用）
//   node tiled/export-from-world.mjs --json out.json # 指定报告路径
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 必须在加载 world.js 之前拦住：SID_TMJ=1 时 floorCollides 会读 TMJ 自己，变成自己跟自己比。
if (process.env.SID_TMJ === '1') {
  console.error('collision-validator: SID_TMJ=1 会让对比对象变成 TMJ 自己。请取消该环境变量后重跑。');
  process.exit(2);
}

const WORLD = require('../online/shared/world.js');
const SCALE = WORLD.FLOOR_SCALE || 1;
const FLOOR_COUNT = WORLD.FLOOR_COUNT || 7;
const strict = process.argv.includes('--strict');
const jsonIndex = process.argv.findIndex((a) => a === '--json' || a.startsWith('--json='));
const jsonPath = jsonIndex < 0 ? 'tiled/collision-report.json'
  : (process.argv[jsonIndex].includes('=') ? process.argv[jsonIndex].split('=')[1] : process.argv[jsonIndex + 1]);

const round = (n) => Math.round(n * 100) / 100;
const pct = (n, d) => d ? (n / d * 100).toFixed(1) + '%' : '0.0%';

function propOf(obj, name) {
  const p = (obj && obj.properties || []).find((q) => q.name === name);
  return p ? p.value : undefined;
}

function readMap(id) {
  const file = `tiled/floor${id}.tmj`;
  let map;
  try { map = JSON.parse(readFileSync(file, 'utf8')); }
  catch (e) { throw new Error(`${file} 读取失败：${e.message}`); }
  const collision = (map.layers || []).find((l) => l.name === 'collision' && l.type === 'tilelayer');
  if (!collision) throw new Error(`${file} 缺少 collision 层`);
  if (!map.width || !map.height || !map.tilewidth) throw new Error(`${file} 缺少 width/height/tilewidth`);
  if (collision.data.length !== map.width * map.height) {
    throw new Error(`${file} collision 数据长度 ${collision.data.length} != ${map.width * map.height}`);
  }
  const markers = (map.layers || []).find((l) => l.name === 'markers' && l.type === 'objectgroup');
  return { file, map, collision, objects: (markers && markers.objects) || [] };
}

function compareFloor(id) {
  const { file, map, collision, objects } = readMap(id);
  const W = map.width, H = map.height, T = map.tilewidth;
  const step = T * SCALE;
  let sameSolid = 0, sameOpen = 0;
  let tmjSolidLegacyOpen = 0, tmjOpenLegacySolid = 0;
  const samples = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = (x + 0.5) * step, py = (y + 0.5) * step;
      const tmjSolid = !!collision.data[y * W + x];
      const legacySolid = WORLD.floorCollides(id, px, py);
      if (tmjSolid === legacySolid) {
        if (tmjSolid) sameSolid++; else sameOpen++;
      } else {
        if (tmjSolid) tmjSolidLegacyOpen++; else tmjOpenLegacySolid++;
        if (samples.length < 48) samples.push({ x, y, wx: round(px), wy: round(py), tmj: tmjSolid ? 'solid' : 'open', legacy: legacySolid ? 'solid' : 'open' });
      }
    }
  }
  const cells = W * H;
  const mismatch = tmjSolidLegacyOpen + tmjOpenLegacySolid;

  const lifts = [];
  for (const side of ['left', 'right']) {
    const obj = objects.find((o) => o.name === `lift-${side}`);
    const legacy = WORLD.floorPortal(id, side);
    const target = side === 'left' ? id - 1 : id + 1;
    const expected = target >= 1 && target <= 7;
    if (!obj) {
      lifts.push({ side, tmj: null, legacy, skipped: !expected, error: expected ? 'TMJ 缺电梯对象' : '' , reason: expected ? '' : '边界层无此方向' });
      continue;
    }
    if (!legacy) { lifts.push({ side, tmj: obj, legacy: null, error: '旧 WORLD 无此侧电梯' }); continue; }
    const got = { x: round(obj.x), y: round(obj.y), w: round(obj.width || 0), h: round(obj.height || 0) };
    const exp = { x: round(legacy.x / SCALE), y: round(legacy.y / SCALE), w: round(legacy.w / SCALE), h: round(legacy.h / SCALE) };
    lifts.push({
      side,
      tmj: got,
      legacy: { x: round(legacy.x), y: round(legacy.y), w: round(legacy.w || 0), h: round(legacy.h || 0) },
      expectedDesign: exp,
      delta: { x: round(obj.x * SCALE - legacy.x), y: round(obj.y * SCALE - legacy.y), w: round((obj.width || 0) * SCALE - legacy.w), h: round((obj.height || 0) * SCALE - legacy.h) },
      targetFloor: propOf(obj, 'targetFloor'),
    });
  }

  const spawnObj = objects.find((o) => o.name === 'spawn');
  const legacySpawns = WORLD.floorSpawns(id);
  const propLayer = (map.layers || []).find((l) => l.name === 'props' && l.type === 'objectgroup');
  const propObjects = (propLayer && propLayer.objects) || [];
  const spawn = spawnObj ? {
    x: round(spawnObj.x * SCALE), y: round(spawnObj.y * SCALE),
    legacy: legacySpawns[0] ? { x: round(legacySpawns[0].x), y: round(legacySpawns[0].y) } : null,
    delta: legacySpawns[0] ? { x: round(spawnObj.x * SCALE - legacySpawns[0].x), y: round(spawnObj.y * SCALE - legacySpawns[0].y) } : null,
  } : null;

  return {
    id, file, theme: propOf(map, 'theme') || '', source: propOf(map, 'source') || '',
    width: W, height: H, tile: T, scale: SCALE, cells,
    sameSolid, sameOpen, tmjSolidLegacyOpen, tmjOpenLegacySolid, mismatch, mismatchPct: pct(mismatch, cells),
    samples, lifts, spawn,
    props: { total: propObjects.length, solid: propObjects.filter((o) => propOf(o, 'solid') !== false).length },
  };
}

const floors = [];
try {
  for (let id = 1; id <= FLOOR_COUNT; id++) floors.push(compareFloor(id));
} catch (e) {
  console.error('collision-validator: ' + e.message);
  process.exit(2);
}

const totals = floors.reduce((t, f) => {
  t.cells += f.cells; t.mismatch += f.mismatch;
  t.tmjSolidLegacyOpen += f.tmjSolidLegacyOpen; t.tmjOpenLegacySolid += f.tmjOpenLegacySolid;
  t.same += f.sameSolid + f.sameOpen;
  return t;
}, { cells: 0, mismatch: 0, tmjSolidLegacyOpen: 0, tmjOpenLegacySolid: 0, same: 0 });
totals.mismatchPct = pct(totals.mismatch, totals.cells);

const report = {
  generatedAt: new Date().toISOString(),
  source: 'tiled/build-floors.mjs → tiled/floor*.tmj',
  comparedWith: 'online/shared/world.js (legacy, TMJ disabled)',
  world: { FLOOR_W: WORLD.FLOOR_W, FLOOR_H: WORLD.FLOOR_H, FLOOR_SCALE: SCALE },
  note: '差异是手绘布局与旧楼层的预期差；只读报告，不写地图。',
  totals, floors,
};
writeFileSync(jsonPath, JSON.stringify(report, null, 2));

console.log('碰撞校验（只读）：TMJ collision vs 旧 WORLD.floorCollides');
console.log(`地图源：build-floors.mjs；世界格 ${SCALE}×；报告：${jsonPath}\n`);
console.log('层 主题            TMJ格   差异          新墙/旧可走  旧墙/新可走  电梯Δ(世界px)');
for (const f of floors) {
  const liftDelta = f.lifts.map((l) => l.skipped ? `${l.side}:-` : l.delta ? `${l.side}:(${l.delta.x},${l.delta.y})` : `${l.side}:ERR`).join(' ');
  console.log(
    `${String(f.id).padEnd(2)} ${f.theme.padEnd(14)} ${String(f.cells).padEnd(7)} ` +
    `${String(f.mismatch).padStart(4)} ${f.mismatchPct.padStart(6)}  ` +
    `${String(f.tmjSolidLegacyOpen).padStart(10)}  ${String(f.tmjOpenLegacySolid).padStart(10)}  ${liftDelta}`
  );
}
console.log(`\n总计：${totals.mismatch}/${totals.cells} = ${totals.mismatchPct}；` +
  `新墙压旧可走 ${totals.tmjSolidLegacyOpen}，新开口落旧实心 ${totals.tmjOpenLegacySolid}`);
console.log('说明：差异不等于错误。手绘布局可以故意改墙；报告只用来定位“新墙压住旧门口/电梯口”的事故点。');

if (strict && totals.mismatch > 0) {
  console.error('\n--strict：存在差异，按发布门禁失败。');
  process.exitCode = 1;
}
