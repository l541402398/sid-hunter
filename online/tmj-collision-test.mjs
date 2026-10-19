// 零依赖：TMJ 接管行走碰撞的 Node 侧契约。用法 node online/tmj-collision-test.mjs
// 覆盖：7 层地图装载、默认回退、collision 层自洽、出生点/电梯落点/电梯厅可用。
// 注意：手绘布局不再与旧 WORLD.floorCollides() 逐格相等；跨系统差异由
// tiled/export-from-world.mjs 的只读报告负责，不在这里当失败条件。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('./shared/world.js');
const T = W.TMJ;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('通过', name); }
  catch (e) { failed++; console.error('失败', name + '\n' + (e.stack || e)); }
}
const ts = T.tileSize(1, W.FLOOR_SCALE);
const cellCenter = (tx, ty) => ({ x: (tx + 0.5) * ts, y: (ty + 0.5) * ts });

test('7 层 TMJ 已装载且默认关闭', () => {
  assert.equal(T.count(), 7);
  assert.equal(T.isEnabled(), false);
  assert.equal(T.active(), false);
  for (let id = 1; id <= 7; id++) {
    const m = T.get(id);
    assert.ok(m, `floor${id} 未装载`);
    assert.equal(m.width, 90);
    assert.equal(m.height, 25);
    assert.equal(m.tileWidth, 16);
  }
});

test('默认回退：旧出生点与旧电梯完全不变', () => {
  const spawns = W.floorSpawns(1);
  assert.ok(spawns.length >= 4, '旧出生点数量异常');
  assert.ok(spawns.every(p => !W.floorCollides(1, p.x, p.y)), '旧出生点不应撞墙');
  const portals = W.floorPortals(1);
  assert.deepEqual(portals.map(p => p.side), ['left', 'right']);
  assert.ok(W.floorById(1).halls.length >= 2, '旧电梯厅应保留');
});

test('接管后：collision 层自洽 + 空地率（5F 36–50%）', () => {
  T.enable(true);
  W.applyTMJLayout();
  assert.equal(T.isEnabled(), true);
  for (let id = 1; id <= 7; id++) {
    const m = T.get(id);
    assert.equal(m.source, 'build-floors', `floor${id} 不是 build-floors 产出`);
    let open = 0;
    for (let ty = 0; ty < m.height; ty++) for (let tx = 0; tx < m.width; tx++) {
      const c = cellCenter(tx, ty);
      const tileSolid = m.collision[ty * m.width + tx] !== 0;
      if (!tileSolid) open++;
      const dx = c.x / W.FLOOR_SCALE, dy = c.y / W.FLOOR_SCALE;
      const propSolid = m.props.some((p) => p.solid && dx >= p.x && dx < p.x + p.w && dy >= p.y && dy < p.y + p.h);
      assert.equal(T.solidAt(id, c.x, c.y, W.FLOOR_SCALE), tileSolid || propSolid,
        `floor${id} 格 ${tx},${ty} 与 collision/props 不一致`);
    }
    const ratio = open / (m.width * m.height);
    const rMin = id === 5 ? 0.36 : 0.52, rMax = id === 5 ? 0.50 : 0.64;
    assert.ok(ratio >= rMin && ratio <= rMax, `floor${id} 空地率 ${(ratio * 100).toFixed(1)}%`);
  }
});

test('NPC 对齐 TMJ：落在可走格', () => {
  for (const n of W.NPCS) {
    assert.ok(n.floorId >= 1 && n.floorId <= 7, `${n.id} 楼层异常`);
    assert.equal(T.solidAt(n.floorId, n.x, n.y, W.FLOOR_SCALE), false,
      `${n.id} 站在 TMJ 墙/实心 props 里 (${n.x},${n.y})`);
  }
});

test('容器对齐 TMJ：footprint 不压墙/实心 props', () => {
  for (let id = 1; id <= 7; id++) {
    for (const c of W.floorContainers(id)) {
      for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++) {
        assert.equal(T.solidAt(id, c.x + c.w * i / 2, c.y + c.h * j / 2, W.FLOOR_SCALE), false,
          `floor${id} 容器 ${c.label} footprint 压墙 (${Math.round(c.x)},${Math.round(c.y)})`);
      }
    }
  }
});

test('独立房间门点对齐 TMJ：全部落在功能区且可站', () => {
  for (let id = 1; id <= 7; id++) {
    const map = T.get(id);
    for (const r of W.roomsForFloor(id)) {
      assert.equal(T.solidAt(id, r.door.x, r.door.y, W.FLOOR_SCALE), false,
        `floor${id} 房间 ${r.name} 门点在墙里`);
      const inZone = (map.zones || []).some(z =>
        r.door.x >= z.x * W.FLOOR_SCALE && r.door.x <= (z.x + z.w) * W.FLOOR_SCALE &&
        r.door.y >= z.y * W.FLOOR_SCALE && r.door.y <= (z.y + z.h) * W.FLOOR_SCALE);
      assert.ok(inZone, `floor${id} 房间 ${r.name} 门点不在任何功能区`);
    }
  }
});

test('独立房间门点从 TMJ spawn BFS 可达', () => {
  for (let id = 1; id <= 7; id++) {
    const map = T.get(id), ts = map.tileWidth * W.FLOOR_SCALE;
    const sp = T.spawnPoint(id, W.FLOOR_SCALE);
    const sx = Math.floor(sp.x / ts), sy = Math.floor(sp.y / ts);
    const seen = new Set([sy * map.width + sx]);
    const q = [[sx, sy]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const k = ny * map.width + nx;
        if (seen.has(k)) continue;
        if (T.solidAt(id, (nx + 0.5) * ts, (ny + 0.5) * ts, W.FLOOR_SCALE)) continue;
        seen.add(k); q.push([nx, ny]);
      }
    }
    for (const r of W.roomsForFloor(id)) {
      const k = Math.floor(r.door.y / ts) * map.width + Math.floor(r.door.x / ts);
      assert.ok(seen.has(k), `floor${id} 房间 ${r.name} 门点从 spawn 不可达`);
    }
  }
});

test('接管后：出生点全部落在空地，且首个出生点贴近 TMJ spawn', () => {
  for (let id = 1; id <= 7; id++) {
    const spawns = W.floorSpawns(id);
    assert.ok(spawns.length >= 64, `floor${id} 出生点太少`);
    assert.ok(spawns.every(p => !W.floorCollides(id, p.x, p.y)), `floor${id} 有出生点在墙里`);
    const sp = T.spawnPoint(id, W.FLOOR_SCALE);
    const first = spawns[0];
    assert.ok(Math.hypot(first.x - sp.x, first.y - sp.y) <= ts, `floor${id} 首个出生点离 spawn 太远`);
  }
});

test('接管后：电梯厅/落点/面向资格可用', () => {
  for (let id = 1; id <= 7; id++) {
    const portals = W.floorPortals(id);
    const lifts = T.portals(id, W.FLOOR_SCALE);
    assert.equal(portals.length, lifts.length, `floor${id} portal 数与 lift 数不一致`);
    for (const p of portals) {
      assert.ok(W.inHall(id, p.side, p.x, p.y - 32), `floor${id} ${p.side} 门外不在虚拟电梯厅`);
      const access = W.portalAccess({ floorId: id, x: p.x, y: p.y - 32, spriteFacing: 'front' }, p);
      assert.equal(access.allowed, true, `floor${id} ${p.side} 电梯资格被拒绝：${access.reason}`);
      const landing = W.elevatorLanding(id, p.side);
      assert.ok(landing, `floor${id} ${p.side} 没有落点`);
      assert.equal(W.floorCollides(id, landing.x, landing.y), false, `floor${id} ${p.side} 落点在墙里`);
    }
  }
  assert.deepEqual(W.floorPortals(1).map(p => p.side), ['right'], '1F 应只有上行电梯');
  assert.deepEqual(W.floorPortals(7).map(p => p.side), ['left'], '7F 应只有下行电梯');
});

test('接管后：楼层边界 = 90×25 地图 + 两侧电梯厅，家具不再参与碰撞', () => {
  for (let id = 1; id <= 7; id++) {
    const b = W.floorBounds(id);
    assert.deepEqual(b, {
      minX: -72 * W.FLOOR_SCALE + 12,
      maxX: W.FLOOR_W + 72 * W.FLOOR_SCALE - 12,
      minY: 72, maxY: W.FLOOR_H - 24,
    });
    assert.equal(W.floorBlockers(id, {}).length, 0, `floor${id} 仍有旧 blocker`);
    assert.equal(W.inFloor(id, 1, 1), true);
    const sides = id === 1 ? ['right'] : id === 7 ? ['left'] : ['left', 'right'];
    for (const side of sides) {
      const hallX = side === 'left' ? -10 : W.FLOOR_W + 10;
      const probeX = side === 'left' ? -80 : W.FLOOR_W + 80;
      const outsideX = side === 'left' ? -400 : W.FLOOR_W + 400;
      assert.equal(W.inFloor(id, hallX, 100), true, `floor${id} ${side} 电梯厅不在边界内`);
      assert.equal(T.solidAt(id, probeX, 103, W.FLOOR_SCALE), false, `floor${id} ${side} 电梯厅应可走`);
      assert.equal(T.solidAt(id, outsideX, 103, W.FLOOR_SCALE), true, `floor${id} ${side} 厅外应实心`);
    }
  }
});

test('5F 迷宫保留战争迷雾配置', () => {
  assert.equal(W.FLOOR_FOG[5].radius, 180);
});

test('TMJ 电梯厅保留：厅/门/轿厢不再悬空', () => {
  for (let id = 1; id <= 7; id++) {
    const f = W.floorById(id);
    const sides = id === 1 ? ['right'] : id === 7 ? ['left'] : ['left', 'right'];
    assert.equal(f.halls.length, sides.length, `floor${id} 电梯厅数量不对`);
    for (const side of sides) {
      const h = f.halls.find(q => q.side === side);
      assert.ok(h, `floor${id} 缺 ${side} 电梯厅`);
      assert.ok(h.w >= 144 && h.h >= 96, `floor${id} ${side} 电梯厅尺寸异常`);
    }
  }
});

console.log(`\nTMJ 碰撞契约：${passed} 项通过，${failed} 项失败`);
process.exitCode = failed ? 1 : 0;







