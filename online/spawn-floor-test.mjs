// 多楼层按当前人数随机分流出生自测：
// 覆盖：全 1–7F 随机分配（不再固定 1F）、按在线人数优先分流至最少人楼层（同少随机）、
// 电梯移动/离线/NPC/休战/进房对人数统计的口径、重连保留原楼层、单层内安全随机不叠人、
// TMJ 模式（SID_TMJ=1）兼容，以及真实 HTTP /api/join + /api/state + SSE 首帧端到端校验。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { failed++; console.error(`FAIL ${name}\n${err.stack}`); }
}

function assertSpawnSafe(room, p) {
  const blockers = room.floorBlockers(p.floorId);
  assert.ok(p.floorId >= 1 && p.floorId <= WORLD.FLOOR_COUNT, `楼层越界: ${p.floorId}`);
  assert.equal(WORLD.inFloor(p.floorId, p.x, p.y), true, `${p.floorId}F (${p.x},${p.y}) 不在楼面内`);
  assert.equal(WORLD.floorCollides(p.floorId, p.x, p.y, blockers), false, `${p.floorId}F (${p.x},${p.y}) 发生碰撞`);
  assert.equal(WORLD.coverFor({ x: p.x, y: p.y }, blockers), null, `${p.floorId}F (${p.x},${p.y}) 被家具遮挡`);
  for (const portal of WORLD.floorPortals(p.floorId)) {
    const dist = Math.hypot(p.x - portal.x, p.y - portal.y);
    assert.ok(dist > WORLD.INTERACT_RANGE, `${p.floorId}F (${p.x},${p.y}) 离电梯门过近: ${dist}`);
  }
}

await test('01 首位玩家不再固定 1F，且楼层与楼层内出生点均随机', () => {
  const firstFloors = new Set();
  const pointsOnFirstFloor = new Set();
  for (let i = 0; i < 40; i++) {
    const r = createRoom();
    const p = r.join(`s-${i}`, `首位${i}`).player;
    assertSpawnSafe(r, p);
    firstFloors.add(p.floorId);
  }
  assert.ok(firstFloors.size >= 4, `40 次独立开局应分布到多个楼层，实际仅出现: ${[...firstFloors].join(',')}`);
  assert.ok([...firstFloors].some(f => f !== 1), '不能全部出生在 1F');

  // 固定选定 3F 时，单层内坐标也应随机分布在安全出生池内（而非总是取 pool[0]）
  for (let i = 0; i < 30; i++) {
    let call = 0;
    const r = createRoom({
      spawnRandomInt: n => (call++ === 0 ? 2 : Math.floor(Math.random() * n))
    });
    const p = r.join(`f3-${i}`, `三楼${i}`).player;
    assert.equal(p.floorId, 3);
    assertSpawnSafe(r, p);
    pointsOnFirstFloor.add(`${p.x},${p.y}`);
  }
  assert.ok(pointsOnFirstFloor.size >= 4, `同层 30 次独立出生应随机分散到多个点位，实际仅: ${pointsOnFirstFloor.size}`);
});

await test('02 首轮 7 人与多轮 70 人按当前人数均衡分流到全部 1–7F，且顺序随机', () => {
  const orders = new Set();
  for (let round = 0; round < 6; round++) {
    const r = createRoom();
    const floors = [];
    for (let i = 0; i < WORLD.FLOOR_COUNT; i++) {
      const p = r.join(`s-${round}-${i}`, `玩家${i}`).player;
      assertSpawnSafe(r, p);
      floors.push(p.floorId);
    }
    assert.deepEqual([...floors].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7], '前 7 人应均匀覆盖 1–7F 各 1 人');
    orders.add(floors.join(','));
  }
  assert.ok(orders.size >= 2, `多局 7 人出生顺序应随机，不应固定顺序: ${[...orders].join(' | ')}`);

  // 70 人加入：每层恰好 10 人，且单层内前 10 人优先落在互不重叠的安全出生点上
  const big = createRoom();
  const byFloor = new Map();
  for (let i = 0; i < 70; i++) {
    const p = big.join(`b-${i}`, `大局${i}`).player;
    assertSpawnSafe(big, p);
    if (!byFloor.has(p.floorId)) byFloor.set(p.floorId, []);
    byFloor.get(p.floorId).push(p);
  }
  for (let f = 1; f <= WORLD.FLOOR_COUNT; f++) {
    const list = byFloor.get(f) || [];
    assert.equal(list.length, 10, `${f}F 应分配 10 人，实际 ${list.length}`);
    const uniqueCoords = new Set(list.map(p => `${p.x},${p.y}`));
    const safePoolSize = WORLD.floorSpawns(f).length;
    assert.equal(uniqueCoords.size, Math.min(10, safePoolSize), `${f}F 10 人应优先分散到不同安全点，不叠在一起`);
  }
});

await test('03 动态响应各楼层当前人数：优先补齐人数最少楼层，人数相同时随机抽选', () => {
  const seen = new Set();
  for (let trial = 0; trial < 30; trial++) {
    const r = createRoom();
    // 先放 11 名在线玩家，手动分布为：1F:4, 2F:2, 3F:0, 4F:2, 5F:0, 6F:1, 7F:2
    const presetFloors = [1, 1, 1, 1, 2, 2, 4, 4, 6, 7, 7];
    presetFloors.forEach((fid, idx) => {
      const p = r.join(`pre-${idx}`, `旧${idx}`).player;
      p.floorId = fid;
    });
    const next = r.join('new-1', '新来1').player;
    assert.ok([3, 5].includes(next.floorId), `空层仅 3F/5F，应出生在其中之一，实际 ${next.floorId}F`);
    assertSpawnSafe(r, next);
    seen.add(next.floorId);

    // 再来一人应补齐另一个空层
    const next2 = r.join('new-2', '新来2').player;
    assert.equal(next2.floorId, next.floorId === 3 ? 5 : 3, '第二名新玩家应补齐剩余唯一空层');

    // 此时各层人数 [4, 2, 1, 2, 1, 1, 2]，下一名新玩家应在人数=1的 {3, 5, 6} 中产生
    const next3 = r.join('new-3', '新来3').player;
    assert.ok([3, 5, 6].includes(next3.floorId), `下一档最少人楼层为 3/5/6F，实际 ${next3.floorId}F`);
  }
  assert.deepEqual([...seen].sort((a, b) => a - b), [3, 5], '3F 与 5F 同为最少人时应随机命中两层');
});

await test('04 人数统计口径：NPC 与离线不计入，休战与楼层小房间内在线玩家计入；重连不改楼层', () => {
  // 1) NPC 不挤占 1F 计数
  const r1 = createRoom();
  r1.spawnNpc(5, { floorId: 1, x: 500, y: 350 }, 'good');
  const floors = [];
  for (let i = 0; i < WORLD.FLOOR_COUNT; i++) floors.push(r1.join(`u-${i}`, `真${i}`).player.floorId);
  assert.deepEqual(floors.sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7], '5 个 1F NPC 不应阻止真人正常覆盖 1–7F');

  // 2) 离线玩家不占在线人数：每层先 1 人，把 4F 玩家置离线，下一名新玩家应补进 4F
  const r2 = createRoom();
  for (let i = 0; i < WORLD.FLOOR_COUNT; i++) r2.join(`o-${i}`, `在${i}`);
  const p4 = r2.room.players.find(p => p.floorId === 4);
  r2.setOffline(p4.id);
  const refill = r2.join('refill', '补位').player;
  assert.equal(refill.floorId, 4, '4F 原玩家离线后成为唯一 0 在线楼层，新人应补位至 4F');

  // 3) 休战（alive=false 但 online=true）与在房间内（zoneId!=null）仍计入该层当前人数
  const r3 = createRoom();
  for (let i = 0; i < WORLD.FLOOR_COUNT; i++) r3.join(`t-${i}`, `活${i}`);
  const p2 = r3.room.players.find(p => p.floorId === 2);
  p2.alive = false; // 休战但在线
  const p6 = r3.room.players.find(p => p.floorId === 6);
  const f6Room = WORLD.roomsForFloor(6)[0];
  if (f6Room) p6.zoneId = f6Room.id; // 在 6F 独立房间内
  // 仅把 7F 玩家移到 1F，让 7F 成为唯一 0 人楼层（2F 休战与 6F 进房仍各算 1 人）
  const p7 = r3.room.players.find(p => p.floorId === 7);
  p7.floorId = 1;
  const newcomer = r3.join('newcomer', '新人').player;
  assert.equal(newcomer.floorId, 7, '休战和进房玩家计入所在楼层，只有 7F 为空时应出生在 7F');

  // 4) 重连（sessionId 或 empNo）保持原楼层与坐标不变
  const target = r3.join('emp-s1', null, { empNo: 'EMP888', name: '重连测试' }).player;
  target.floorId = 5; target.x = 612; target.y = 345;
  const revivedByEmp = r3.join('emp-s2', null, { empNo: 'EMP888', name: '重连测试' });
  assert.equal(revivedByEmp.revived, true);
  assert.equal(revivedByEmp.player.floorId, 5);
  assert.equal(revivedByEmp.player.x, 612);
  assert.equal(revivedByEmp.player.y, 345);
  const revivedBySid = r3.join('emp-s2', '改名');
  assert.equal(revivedBySid.revived, true);
  assert.equal(revivedBySid.player.floorId, 5);
});

await test('05 阵营随机注入 options.random 不被出生随机消耗', () => {
  const seq = [0.99, 0.05, 0.99];
  let idx = 0;
  const r = createRoom({ random: () => seq[idx++] });
  assert.equal(r.join('f1', '甲').player.faction, 'good');
  assert.equal(r.join('f2', '乙').player.faction, 'bad');
  assert.equal(r.join('f3', '丙').player.faction, 'good');
  assert.equal(idx, 3, 'options.random 应仅由阵营抽取消费 3 次');
});

await test('06 TMJ 模式（SID_TMJ=1）下 21 人均匀随机分流 1–7F 且全部无碰撞安全', () => {
  const script = `
    const assert = require('node:assert/strict');
    const { createRoom, WORLD } = require('./online/room.js');
    const r = createRoom();
    const counts = new Map();
    for (let i = 0; i < 21; i++) {
      const p = r.join('tmj-' + i, 'T' + i).player;
      assert.equal(WORLD.floorCollides(p.floorId, p.x, p.y, r.floorBlockers(p.floorId)), false);
      for (const portal of WORLD.floorPortals(p.floorId)) {
        assert.ok(Math.hypot(p.x - portal.x, p.y - portal.y) > WORLD.INTERACT_RANGE);
      }
      counts.set(p.floorId, (counts.get(p.floorId) || 0) + 1);
    }
    for (let f = 1; f <= WORLD.FLOOR_COUNT; f++) assert.equal(counts.get(f), 3);
  `;
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const res = spawnSync(process.execPath, ['-e', script], {
    cwd: repoRoot,
    env: { ...process.env, SID_TMJ: '1' },
    encoding: 'utf8'
  });
  assert.equal(res.status, 0, res.stderr || res.stdout);
});

await test('07 真实 HTTP /api/join + /api/state + SSE 首帧：14 人均匀落位 1–7F 且快照楼层一致', async () => {
  const port = await new Promise((resolve, reject) => {
    const s = createServer(); s.once('error', reject);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
  });
  const base = `http://127.0.0.1:${port}`;
  const dbDir = mkdtempSync(path.join(tmpdir(), 'sid-spawn-'));
  let log = '';
  const child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DEV: '0', SID_SSO: '0', SID_DB_FILE: path.join(dbDir, 'sid.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server start timeout\n${log}`)), 10000);
      const poll = async () => {
        try {
          const r = await fetch(`${base}/api/state`);
          if (r.status === 401 || r.status === 200) { clearTimeout(timer); resolve(); return; }
        } catch { /* wait */ }
        setTimeout(poll, 80);
      };
      poll();
    });

    const floorCounts = new Map();
    const joined = [];
    for (let i = 0; i < 14; i++) {
      const jr = await fetch(`${base}/api/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: `分流${i}` })
      });
      assert.equal(jr.status, 200);
      const jd = await jr.json();
      assert.equal(jd.ok, true);
      const sr = await fetch(`${base}/api/state`, { headers: { 'X-Sid-Session': jd.sessionToken } });
      assert.equal(sr.status, 200);
      const sd = await sr.json();
      const me = sd.me;
      const pubSelf = sd.players.find(p => p.id === me.id);
      assert.ok(pubSelf, '快照应包含本人公开条目');
      assert.equal(me.floorId, pubSelf.floorId, '私密与公开楼层一致');
      assert.equal(me.floorName, WORLD.floorById(me.floorId).name, 'floorName 与楼层匹配');
      assert.ok(sd.glassDoors.every(d => d.id.startsWith(`f${me.floorId}:`)), 'glassDoors 应属于本人出生楼层');
      floorCounts.set(me.floorId, (floorCounts.get(me.floorId) || 0) + 1);
      joined.push({ token: jd.sessionToken, floorId: me.floorId });
    }
    for (let f = 1; f <= WORLD.FLOOR_COUNT; f++) {
      assert.equal(floorCounts.get(f), 2, `HTTP 14 人加入后 ${f}F 应为 2 人，实际 ${floorCounts.get(f) || 0}`);
    }

    // 校验非 1F 玩家的 SSE 首帧也正确下发本人出生楼层
    const nonFloor1 = joined.find(u => u.floorId !== 1);
    assert.ok(nonFloor1, '应存在出生在非 1F 的玩家');
    const ctrl = new AbortController();
    const sseRes = await fetch(`${base}/api/stream?sid_token=${encodeURIComponent(nonFloor1.token)}`, { signal: ctrl.signal });
    const reader = sseRes.body.getReader();
    let text = '';
    while (!text.includes('\n\n')) {
      const { value, done } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    ctrl.abort();
    const dataLine = text.split('\n').find(l => l.startsWith('data: '));
    assert.ok(dataLine, 'SSE 应推送首帧快照');
    const frame = JSON.parse(dataLine.slice(6));
    assert.equal(frame.me.floorId, nonFloor1.floorId, 'SSE 首帧 me.floorId 与出生楼层一致');
    assert.equal(frame.me.floorName, WORLD.floorById(nonFloor1.floorId).name);
  } finally {
    child.kill('SIGKILL');
    rmSync(dbDir, { recursive: true, force: true });
  }
});

console.log(`\n多楼层随机出生测试：${passed} 项通过，${failed} 项失败`);
if (failed) process.exitCode = 1;
