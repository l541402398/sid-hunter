'use strict';
// 一次性工具：为「每层 6 间房」挑选可站立、互相分散、且从出生点可达的门点。
// 用法：node online/room-door-scan.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('./shared/world.js');

const STEP = 24;
for (let fid = 1; fid <= 7; fid++) {
  const fl = W.floorById(fid);
  const blockers = W.floorBlockers(fid, {});
  const ok = (x, y) => W.inFloor(fid, x, y) && !W.floorCollides(fid, x, y, blockers) && y > 110 && y < fl.height - 24 && x > 30 && x < fl.width - 30;
  const spawns = W.floorSpawns(fid);
  const start = spawns[0];
  // BFS 可达性（20px 网格）
  const cell = 20, cols = Math.ceil(fl.width / cell), rows = Math.ceil(fl.height / cell);
  const idx = (x, y) => Math.floor(y / cell) * cols + Math.floor(x / cell);
  const seen = new Uint8Array(cols * rows);
  const sx = Math.round(start.x / cell), sy = Math.round(start.y / cell);
  const q = [[sx, sy]]; seen[sy * cols + sx] = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (seen[ny * cols + nx]) continue;
      const wx = nx * cell + cell / 2, wy = ny * cell + cell / 2;
      if (!ok(wx, wy)) continue;
      seen[ny * cols + nx] = 1; q.push([nx, ny]);
    }
  }
  const reachable = (x, y) => seen[Math.floor(y / cell) * cols + Math.floor(x / cell)] === 1 &&
    ok(x, y) && seen[Math.floor((y - 8) / cell) * cols + Math.floor(x / cell)] === 1;
  const existing = W.roomsForFloor(fid).map(r => r.door);
  const candidates = [];
  for (let y = 160; y < fl.height - 60; y += STEP) {
    for (let x = 80; x < fl.width - 80; x += STEP) {
      if (!reachable(x, y)) continue;
      if (existing.some(d => Math.hypot(d.x - x, d.y - y) < 190)) continue;
      candidates.push({ x, y });
    }
  }
  // 贪心：已选门点之间尽量远，并与现有门点保持距离
  const picked = [];
  while (picked.length < 4 && candidates.length) {
    let best = null, bestD = -1;
    for (const c of candidates) {
      const ds = [...existing, ...picked].map(d => Math.hypot(d.x - c.x, d.y - c.y));
      const d = Math.min(...ds);
      if (d > bestD) { bestD = d; best = c; }
    }
    picked.push(best);
    for (let i = candidates.length - 1; i >= 0; i--) {
      if (Math.hypot(candidates[i].x - best.x, candidates[i].y - best.y) < 160) candidates.splice(i, 1);
    }
  }
  console.log(fid + 'F existing', existing.map(d => `${d.x},${d.y}`).join(' '), '=> new', JSON.stringify(picked));
}
