// TMJ 电梯规格测试：SID_TMJ=1 下校验左右电梯、目标层、反向往返与可达性。
// 用法：node online/tmj-elevator-test.mjs
process.env.SID_TMJ = '1';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { WORLD: W } = require('./room.js');

assert.ok(W.TMJ && W.TMJ.isEnabled(), 'TMJ 未启用');
assert.equal(W.TMJ.count(), 7, 'TMJ 层数应为 7');

const T = 16, SCALE = W.FLOOR_SCALE, STEP = T * SCALE; // 采样步长必须乘 scale
const maps = {};
for (let id = 1; id <= 7; id++) maps[id] = JSON.parse(readFileSync(`tiled/floor${id}.tmj`, 'utf8'));

// 1) 每层电梯存在性与目标层
for (let id = 1; id <= 7; id++) {
  const objs = maps[id].layers.find((l) => l.name === 'markers' && l.type === 'objectgroup').objects;
  const lifts = objs.filter((o) => o.name.startsWith('lift-'));
  const side = (o) => o.properties.find((p) => p.name === 'side').value;
  const target = (o) => o.properties.find((p) => p.name === 'targetFloor').value;
  const sides = lifts.map(side).sort();
  if (id === 1) assert.deepEqual(sides, ['right'], '第 1 层只能有上行梯');
  else if (id === 7) assert.deepEqual(sides, ['left'], '第 7 层只能有下行梯');
  else assert.deepEqual(sides, ['left', 'right'], `第 ${id} 层应左右各一部`);
  for (const o of lifts) {
    const s = side(o);
    assert.equal(target(o), s === 'left' ? id - 1 : id + 1, `${id}F ${s} 目标层错误`);
  }
}

// 2) 反向往返：n 的右梯 <-> n+1 的左梯
for (let id = 1; id <= 6; id++) {
  const up = maps[id].layers.find((l) => l.name === 'markers' && l.type === 'objectgroup').objects.find((o) => o.name === 'lift-right');
  const down = maps[id + 1].layers.find((l) => l.name === 'markers' && l.type === 'objectgroup').objects.find((o) => o.name === 'lift-left');
  assert.ok(up && down, `${id}F->${id + 1}F 缺少反向配对`);
  assert.equal(up.properties.find((p) => p.name === 'targetFloor').value, id + 1);
  assert.equal(down.properties.find((p) => p.name === 'targetFloor').value, id);
}

// 3) 世界碰撞在电梯口可站立，且从出生点 BFS 可达
for (let id = 1; id <= 7; id++) {
  const map = W.TMJ.get(id);
  const f = W.floorById(id);
  const spawn = f.spawnPoints[0];
  const Wd = map.width, Hd = map.height;
  const solid = (cx, cy) => (cx < 0 || cy < 0 || cx >= Wd || cy >= Hd) || !!map.collision[cy * Wd + cx];
  const start = [Math.floor(spawn.x / STEP), Math.floor(spawn.y / STEP)];
  const seen = new Set([start[1] * Wd + start[0]]);
  const q = [start];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, k = ny * Wd + nx;
      if (nx < 0 || ny < 0 || nx >= Wd || ny >= Hd || seen.has(k) || solid(nx, ny)) continue;
      seen.add(k); q.push([nx, ny]);
    }
  }
  for (const p of W.floorPortals(id)) {
    const door = p.side === 'left' ? [0, 3] : [Wd - 1, 3];
    assert.ok(seen.has(door[1] * Wd + door[0]), `${id}F ${p.side} 电梯门从出生点不可达`);
    assert.equal(W.inHall(id, p.side, p.x, p.y + 14), true, `${id}F ${p.side} 门外不在虚拟电梯厅`);
    assert.equal(W.floorCollides(id, p.x, p.y + 14), false, `${id}F ${p.side} 电梯厅内应可站立`);
    const landing = W.elevatorLanding(id, p.side);
    assert.ok(landing && !W.floorCollides(id, landing.x, landing.y), `${id}F ${p.side} 落点不可用`);
  }
}

console.log('PASS tmj-elevator: 首末层单向、目标层 n±1、反向配对、电梯口可站立且 BFS 可达');
