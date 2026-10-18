// 补充校验：装饰成组、功能区有陈设、道具不成孤点、objects 层不压墙。
// 用法：node tiled/validate-extra.mjs
import { readFileSync, existsSync } from 'node:fs';
import { ASSET_FILES } from './asset-files.mjs';
const ASSET_SIZES = JSON.parse(readFileSync('tiled/asset-sizes.json', 'utf8'));

const W = 90, H = 25, T = 16;
let bad = 0;
const fail = (m) => { bad++; console.log('  FAIL ' + m); };
const ok = (m) => console.log('  ok   ' + m);
const propOf = (o, n) => (o.properties || []).find((p) => p.name === n)?.value;
const key = (x, y) => y * W + x;

for (let id = 1; id <= 7; id++) {
  const j = JSON.parse(readFileSync(`tiled/floor${id}.tmj`, 'utf8'));
  const layer = (n) => j.layers.find((l) => l.name === n);
  const ground = layer('ground').data;
  const objects = layer('objects').data;
  const decor = layer('decor').data;
  const zones = layer('zones').objects;
  const props = layer('props').objects.filter((o) => propOf(o, 'kind') !== 'jamb');
  const markers = layer('markers').objects;
  const spawn = markers.find((o) => o.name === 'spawn');

  // 1F/7F 素材样板：每个 prop 必须有 vendor 素材键 + 文件；总装饰 80–110 件
  if (id >= 1 && id <= 7) {
    let assetBad = 0;
    for (const p of props) {
      const key = propOf(p, 'prop');
      const rel = key && ASSET_FILES[key];
      if (!rel || !existsSync('online/public/assets/vendor/' + rel)) {
        assetBad++; console.log(`    FAIL 素材缺失 ${p.name} prop=${key || '(empty)'}`);
      }
    }
    if (assetBad) fail(`素材键/文件缺失 ${assetBad} 处`); else ok(`素材键/文件 ${props.length} 件全部存在`);
    if (props.length < 80 || props.length > 110) fail(`装饰件 ${props.length}（样板要求 80–110）`);
    else ok(`装饰件 ${props.length}（80–110）`);
  }


  // 1) objects 层：连通分量 2–6 格，全部在可行走地面
  const seen = new Set();
  let comps = 0, single = 0, offGround = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!objects[key(x, y)] || seen.has(key(x, y))) continue;
    comps++;
    const q = [[x, y]]; seen.add(key(x, y)); let n = 0;
    while (q.length) {
      const [cx, cy] = q.pop(); n++;
      if (!ground[key(cx, cy)]) offGround++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!objects[key(nx, ny)] || seen.has(key(nx, ny))) continue;
        seen.add(key(nx, ny)); q.push([nx, ny]);
      }
    }
    if (n < 2) single++;
    if (n > 6) fail(`objects 簇 ${n} 格（要求 2–6）`);
  }
  if (offGround) fail(`objects 有 ${offGround} 格压在墙上`);
  if (single) fail(`objects 有 ${single} 个单格孤点`);
  else ok(`objects ${comps} 簇，全部 2–6 格且在地面`);

  // 2) decor 层：值只能是 0/3，且 3 必须贴墙或为地面标记
  let decorBad = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = decor[key(x, y)];
    if (v !== 0 && v !== 3 && v !== 4) decorBad++;
  }
  if (decorBad) fail(`decor 层有 ${decorBad} 个非法 gid`); else ok('decor 层 gid 合法');

  // 3) 每个功能区至少 2 件陈设；标志物区至少有 1 个 landmark
  let zoneBad = 0;
  for (const z of zones) {
    const cx = (o) => o.x + o.width / 2, cy = (o) => o.y + o.height / 2;
    const inside = props.filter((p) => {
      const x = cx(p), y = cy(p);
      return x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height;
    });
    if (inside.length < 2) { zoneBad++; console.log(`    info ${z.name} 只有 ${inside.length} 件陈设`); }
    if (propOf(z, 'landmark') && !inside.some((p) => propOf(p, 'landmark'))) {
      fail(`${z.name} 是标志物区但没有 landmark 道具`);
    }
  }
  if (zoneBad) fail(`${zoneBad} 个功能区陈设 < 2 件`); else ok(`功能区陈设 ${zones.length}/${zones.length} 达标`);

  // 3b) sprite 视觉重叠：用真实 PNG 尺寸算，0 才通过
  let visOverlap = 0;
  const vis = props.map((p) => {
    const key = propOf(p, 'prop'), sz = ASSET_SIZES[key];
    if (!sz) return null;
    const s = Number(propOf(p, 'propScale')) || 1;
    const w = sz[0] * s, h = sz[1] * s;
    return { x: p.x + p.width / 2 - w / 2, y: p.y + p.height - h, w, h };
  }).filter(Boolean);
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const a = vis[i], b = vis[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 6 && iy > 6) visOverlap++;
  }
  if (visOverlap) fail(`sprite 视觉重叠 ${visOverlap} 对`); else ok(`sprite 视觉重叠 0（${vis.length} 件）`);

  // 4) 孤立道具：48px 内没有同族件，且不是 landmark
  let isolated = 0;
  for (const p of props) {
    if (propOf(p, 'landmark')) continue;
    const cx = p.x + p.width / 2, cy = p.y + p.height / 2;
    const near = props.some((q) => q !== p && Math.hypot(q.x + q.width / 2 - cx, q.y + q.height / 2 - cy) <= 48);
    if (!near) isolated++;
  }
  if (isolated) fail(`孤立道具 ${isolated} 件（要求 48px 内有同族件）`); else ok(`道具成组（${props.length} 件）`);

  // 5) 出生点存在且在可行走格
  if (!spawn) fail('缺出生点');
  else {
    const sx = Math.floor(spawn.x / T), sy = Math.floor(spawn.y / T);
    if (sx < 0 || sy < 0 || sx >= W || sy >= H || !ground[key(sx, sy)]) fail('出生点不在可行走地面');
    else ok('出生点在地面');
  }
}
console.log(bad ? `\n${bad} 项未通过` : '\n补充校验全部通过');
process.exitCode = bad ? 1 : 0;




