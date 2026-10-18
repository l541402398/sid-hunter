// 主校验：尺寸/图层/来源/12 色/电梯原坐标/主路径/功能区可达/道具 footprint。
// 用法：node tiled/validate-floors.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { THEMES, PALETTE_LIST } from './themes.mjs';

if (process.env.SID_TMJ === '1') {
  console.error('validate-floors: SID_TMJ=1 会让 WORLD.floorPortal() 读到 TMJ 自己。请取消该环境变量后重跑。');
  process.exit(2);
}
const require = createRequire(import.meta.url);
const WORLD = require('../online/shared/world.js');
const W = 90, H = 25, T = 16, SCALE = WORLD.FLOOR_SCALE || 1;
let failed = 0;
const fail = (m) => { failed++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const propOf = (o, n) => (o.properties || []).find((p) => p.name === n)?.value;
const layerOf = (j, n) => j.layers.find((l) => l.name === n);
const key = (x, y) => y * W + x;

function load(id) {
  const j = JSON.parse(readFileSync(`tiled/floor${id}.tmj`, 'utf8'));
  const collision = layerOf(j, 'collision');
  const ground = layerOf(j, 'ground');
  const zones = layerOf(j, 'zones');
  const props = layerOf(j, 'props');
  const markers = layerOf(j, 'markers');
  return { j, collision, ground, zones, props, markers, solid: collision.data.map((v) => (v ? 1 : 0)) };
}

function reachable(floor, start) {
  const { solid, props } = floor;
  const solidProps = props.objects.filter((o) => propOf(o, 'solid') !== false);
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H || solid[key(x, y)]) return true;
    const px = (x + 0.5) * T, py = (y + 0.5) * T;
    return solidProps.some((p) => px >= p.x && px < p.x + p.width && py >= p.y && py < p.y + p.height);
  };
  const seen = new Set();
  const q = [start];
  if (blocked(start[0], start[1])) return { seen, blocked };
  seen.add(key(start[0], start[1]));
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = key(nx, ny);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || blocked(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  return { seen, blocked };
}

for (let id = 1; id <= 7; id++) {
  console.log(`floor${id}`);
  const theme = THEMES.find((t) => t.id === id);
  const { j, collision, ground, zones, props, markers, solid } = load(id);

  if (j.width === W && j.height === H && j.tilewidth === T && j.tileheight === T) ok('尺寸 90×25 / 16px');
  else fail(`尺寸 ${j.width}x${j.height}/${j.tilewidth}x${j.tileheight}`);

  for (const n of ['ground', 'decor', 'objects', 'collision']) if (!layerOf(j, n)) fail(`缺图层 ${n}`);
  for (const n of ['zones', 'props', 'markers']) if (!layerOf(j, n)) fail(`缺对象层 ${n}`);

  const source = propOf(j, 'source');
  if (source === 'build-floors') ok('source = build-floors'); else fail(`source=${source || '(missing)'}，应为 build-floors`);

  const pal = String(propOf(j, 'palette') || '').split(',').filter(Boolean);
  if (pal.length === 12 && pal.join(',') === PALETTE_LIST[id].join(',')) ok('palette = 12 色（与主题表一致）');
  else fail(`palette ${pal.length} 色 / 与主题表不一致`);

  if (String(propOf(j, 'theme') || '').includes(theme.name)) ok(`theme = ${theme.name}`); else fail(`theme 不是 ${theme.name}`);

  if (ground && collision && ground.data.length === W * H && collision.data.length === W * H) {
    let mismatch = 0;
    for (let i = 0; i < W * H; i++) if ((ground.data[i] ? 1 : 0) === (collision.data[i] ? 1 : 0)) mismatch++;
    if (mismatch) fail(`ground/collision 有 ${mismatch} 格不一致`); else ok('ground/collision 互补');
  } else fail('ground/collision 数据长度错误');

  const open = ground ? ground.data.filter(Boolean).length : 0;
  const ratio = open / (W * H);
  const [minOpen, maxOpen] = id === 5 ? [0.36, 0.50] : [0.55, 0.64];
  if (ratio >= minOpen && ratio <= maxOpen) ok(`空地占比 ${(ratio * 100).toFixed(1)}%`);
  else fail(`空地占比 ${(ratio * 100).toFixed(1)}%（要求 ${(minOpen * 100).toFixed(0)}–${(maxOpen * 100).toFixed(0)}%）`);

  // 厚墙：离任何可走面 ≥3 格的实心格，必须是小比例（柱/设备间），不能是实心岩体
  if (ground) {
    const dist = new Int16Array(W * H).fill(-1); const q = [];
    for (let i = 0; i < W * H; i++) if (ground.data[i]) { dist[i] = 0; q.push(i); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = ny * W + nx;
        if (dist[k] !== -1) continue;
        dist[k] = dist[i] + 1; q.push(k);
      }
    }
    let thick = 0;
    for (let i = 0; i < W * H; i++) if (!ground.data[i] && dist[i] >= 3) thick++;
    const thickPct = thick / (W * H);
    const maxThick = id === 5 ? 0.20 : 0.12;
    if (thickPct <= maxThick) ok(`厚墙 ${(thickPct * 100).toFixed(1)}%（≤${Math.round(maxThick * 100)}%）`);
    else fail(`厚墙 ${(thickPct * 100).toFixed(1)}%（要求 ≤${Math.round(maxThick * 100)}%）`);
  }

  // 电梯：边界层单向、目标层、反向配对、坐标 = floorPortal 原坐标
  const lifts = markers.objects.filter((o) => o.name.startsWith('lift-'));
  const side = (o) => propOf(o, 'side');
  const target = (o) => propOf(o, 'targetFloor');
  const has = (s) => lifts.some((o) => side(o) === s);
  if (id === 1 && has('left')) fail('第 1 层不应有向下电梯');
  if (id === 7 && has('right')) fail('第 7 层不应有向上电梯');
  for (const o of lifts) {
    const s = side(o), tg = target(o);
    const expect = s === 'left' ? id - 1 : id + 1;
    if (tg !== expect) fail(`${s} 电梯 targetFloor=${tg}，应为 ${expect}`);
    if (tg >= 1 && tg <= 7) {
      const other = load(tg).markers.objects.filter((x) => x.name.startsWith('lift-'));
      const back = other.some((x) => side(x) === (s === 'left' ? 'right' : 'left') && target(x) === id);
      if (!back) fail(`${s}→${tg} 缺少反向电梯`);
    }
    const p = WORLD.floorPortal(id, s);
    if (!p) fail(`${s} 电梯在旧 WORLD 中不存在`);
    else {
      const exp = { x: p.x / SCALE, y: p.y / SCALE, w: p.w / SCALE, h: p.h / SCALE };
      const got = { x: o.x, y: o.y, w: o.width, h: o.height };
      if (Math.abs(exp.x - got.x) > 0.01 || Math.abs(exp.y - got.y) > 0.01 ||
          Math.abs(exp.w - got.w) > 0.01 || Math.abs(exp.h - got.h) > 0.01) {
        fail(`${s} 电梯不是 floorPortal 原坐标：期望 ${JSON.stringify(exp)}，实际 ${JSON.stringify(got)}`);
      }
    }
  }
  if (lifts.length) ok(`电梯 ${lifts.map((o) => side(o) + '->' + target(o)).join(', ')} · 坐标为 floorPortal 原值`);

  // 出生点 + 主路径 + 功能区
  const spawn = markers.objects.find((o) => o.name === 'spawn');
  if (!spawn) fail('缺出生点');
  else {
    const sx = Math.floor(spawn.x / T), sy = Math.floor(spawn.y / T);
    const { seen, blocked } = reachable({ solid, props }, [sx, sy]);
    if (blocked(sx, sy)) fail('出生点在实心格/道具内');
    else {
      const doorL = seen.has(key(0, 2)) || seen.has(key(0, 3));
      const doorR = seen.has(key(W - 1, 2)) || seen.has(key(W - 1, 3));
      if (doorL && doorR) ok('主路径：左电梯门 → 右电梯门可达');
      else fail(`主路径不可达（left=${doorL}, right=${doorR}）`);
      const zs = zones.objects.filter((o) => propOf(o, 'zone') !== false);
      const zbad = [];
      for (const z of zs) {
        let any = false;
        const x0 = Math.floor(z.x / T), y0 = Math.floor(z.y / T);
        const x1 = Math.ceil((z.x + z.width) / T), y1 = Math.ceil((z.y + z.height) / T);
        for (let y = y0; y < y1 && !any; y++) for (let x = x0; x < x1; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          if (!blocked(x, y) && seen.has(key(x, y))) { any = true; break; }
        }
        if (!any) zbad.push(z.name);
      }
      if (zbad.length) fail(`功能区不可达：${zbad.join(', ')}`); else ok(`功能区可达 ${zs.length}/${zs.length}`);
      // 死区：可走格中既不可达、也没被道具覆盖的格子
      let dead = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (solid[key(x, y)] || seen.has(key(x, y)) || blocked(x, y)) continue;
        dead++;
      }
      if (dead) fail(`死区 ${dead} 格`); else ok('死区 0');
      // 总面积/可达面积（含道具覆盖）
      const reachRatio = seen.size / (W * H);
      const rMin = id === 5 ? 0.36 : 0.52, rMax = id === 5 ? 0.50 : 0.64;
      if (reachRatio >= rMin && reachRatio <= rMax) ok(`实际可达 ${(reachRatio * 100).toFixed(1)}%（${Math.round(rMin * 100)}–${Math.round(rMax * 100)}%）`);
      else fail(`实际可达 ${(reachRatio * 100).toFixed(1)}%（要求 ${Math.round(rMin * 100)}–${Math.round(rMax * 100)}%）`);
      ok(`可走 ${open} 格，实际可达 ${seen.size} 格（道具占 ${open - seen.size} 格）`);
    }
  }

  // 道具：footprint 合法、互不重叠、不整块压墙
  const solidProps = props.objects.filter((o) => propOf(o, 'solid') !== false);
  let propBad = 0;
  for (const p of solidProps) {
    if (!(p.width > 0 && p.height > 0)) { propBad++; continue; }
    if (propOf(p, 'kind') === 'jamb') continue;
    const cx = Math.floor((p.x + p.width / 2) / T), cy = Math.floor((p.y + p.height / 2) / T);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || solid[key(cx, cy)]) {
      propBad++; console.log(`    info 道具 ${p.name} 中心压在墙上（${cx},${cy}）`);
    }
  }
  for (let a = 0; a < solidProps.length; a++) for (let b = a + 1; b < solidProps.length; b++) {
    const A = solidProps[a], B = solidProps[b];
    if (A.x < B.x + B.width && B.x < A.x + A.width && A.y < B.y + B.height && B.y < A.y + A.height) {
      propBad++; console.log(`    FAIL 道具重叠 ${A.name} / ${B.name}`);
    }
  }
  if (propBad) fail(`道具 footprint 异常 ${propBad} 处`); else ok(`道具 footprint ${solidProps.length} 个互不重叠`);

  // 主题表功能区名：实际 zones 必须包含主题表的 6 个名字（F5/F7 额外有东侧电梯厅）
  const names = new Set((zones.objects || []).map((o) => o.name));
  const missing = theme.zones.filter((n) => !names.has(n));
  if (missing.length) fail(`缺主题功能区：${missing.join(', ')}`); else ok('主题功能区名齐全');
}
console.log(failed ? `\n${failed} 项未通过` : '\n全部通过');
process.exitCode = failed ? 1 : 0;





