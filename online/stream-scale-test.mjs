// 300 人规模推流回归：楼层裁剪、增量下发、名录补丁、私密字段不外泄、服务端每 tick 成本上限。
// 纯进程内测试（不起 HTTP / 浏览器）。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom } = require('./room.js');
const W = require('./shared/world.js');
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(true); console.log('通过', name); }
  catch (e) { results.push(false); console.error('失败', name, e && e.stack); }
}
function place(p, floorId) {
  const fl = W.floorById(floorId); p.floorId = floorId; p.zoneId = null;
  for (let k = 0; k < 200; k++) {
    const x = 120 + ((p.id * 7919 + k * 104729) % Math.max(1, fl.width - 240));
    const y = 120 + ((p.id * 104723 + k * 7907) % Math.max(1, fl.height - 240));
    if (W.inFloor(floorId, x, y)) { p.x = x; p.y = y; return; }
  }
}
function makeRoom(n) {
  const R = createRoom({ rules: { endRemainingPlayers: 0 } });
  for (let i = 0; i < n; i++) {
    const p = R.join('s' + i, '玩家' + i, { empNo: 'E' + i }).player;
    p.online = true; place(p, 1 + (i % 7));
  }
  return R;
}
const SECRET_KEYS = ['faction', 'hp', 'skills', 'empNo', 'gender', 'sessionId', 'exploration', 'input'];
function noSecrets(obj, where) {
  for (const k of SECRET_KEYS) assert.ok(!(k in obj), `${where} 不应包含私密字段 ${k}`);
}

await test('推流只带同楼层同空间玩家坐标；名录覆盖全员且无私密字段', () => {
  const R = makeRoom(70);
  const viewer = R.room.players[3];
  const s = R.streamSnapshot(viewer.id, {});
  assert.equal(s.scope, 'floor');
  assert.ok(s.players.length > 1);
  for (const p of s.players) { assert.equal(p.floorId, viewer.floorId); noSecrets(p, 'players'); }
  // 取默认值的字段会被省略（客户端用 STREAM_DEFAULTS 补齐），所以 0 分时 score 缺省。
  viewer.score = 7;
  const s2 = R.streamSnapshot(viewer.id, {});
  assert.equal(s2.players.find(p => p.id === viewer.id).score, 7, '本人分数可见');
  assert.ok(s2.players.filter(p => p.id !== viewer.id).every(p => !p.score), '他人分数不可见');
  assert.equal(s.directory.length, 70);
  assert.equal(s.totalPlayers, 70);
  for (const d of s.directory) {
    noSecrets(d, 'directory');
    assert.ok(!('x' in d) && !('y' in d), '名录不含坐标');
    assert.match(d.sid, /^[A-Z0-9*]{3}-[A-Z0-9*]{3}-[A-Z0-9*]{3}$/);
    assert.ok(Object.values(d.traits).every(v => v === W.MASK), '未公开属性保持遮罩');
    assert.equal(d.score, 0, '进行中名录不泄露他人分数');
  }
  assert.ok(Array.isArray(s.logs) && Array.isArray(s.badSlots) && s.me && s.me.id === viewer.id, '首帧带齐慢变字段与 me');
});

await test('慢变字段增量：未变化不重发，变化后只发一次；名录只补变化条目', () => {
  const R = makeRoom(30);
  const viewer = R.room.players[0], conn = {};
  R.streamFrame(viewer.id, conn);
  const quiet = R.streamSnapshot(viewer.id, conn);
  for (const k of ['logs', 'badSlots', 'ranking', 'historicalRanking', 'rules', 'directory', 'directoryPatch', 'me']) {
    assert.ok(!(k in quiet), `无变化时不应重发 ${k}`);
  }
  R.room.logs.unshift({ time: '12:00:00', text: '测试日志' });
  const target = R.room.players[5];
  target.traitPublic.food = true;
  // 慢变字段按 tick 共享缓存（40ms），等下一 tick 再取。
  const until = Date.now() + 60; while (Date.now() < until) { /* 等待共享缓存过期 */ }
  const changed = R.streamSnapshot(viewer.id, conn);
  assert.equal(changed.logs[0].text, '测试日志');
  assert.deepEqual(changed.directoryPatch.map(d => d.id), [target.id]);
  assert.equal(changed.directoryPatch[0].traits.food, target.traits.food);
  const again = R.streamSnapshot(viewer.id, conn);
  assert.ok(!('logs' in again) && !('directoryPatch' in again), '同一版本只下发一次');
});

await test('me 变化即下发、未变化约每 20 帧兜底一次；新连接重新拿全量', () => {
  const R = makeRoom(10);
  const viewer = R.room.players[0], conn = {};
  R.streamFrame(viewer.id, conn);
  let withMe = 0;
  for (let i = 0; i < 40; i++) if (R.streamFrame(viewer.id, conn).includes('"me":')) withMe++;
  assert.ok(withMe >= 1 && withMe <= 3, `40 帧内兜底下发 me 次数异常：${withMe}`);
  viewer.score += 5;
  assert.ok(R.streamFrame(viewer.id, conn).includes('"me":'), '分数变化后立即下发 me');
  const fresh = R.streamSnapshot(viewer.id, {});
  assert.ok(fresh.directory && fresh.logs && fresh.me, '新连接全量');
});

await test('战争迷雾层只下发半径内的人；房间内只看到同房间的人', () => {
  const fogFloor = Number(Object.keys(W.FLOOR_FOG || {})[0]);
  if (!fogFloor) return;
  const R = makeRoom(14);
  const [a, b, c] = R.room.players;
  for (const p of [a, b, c]) { p.floorId = fogFloor; p.zoneId = null; }
  place(a, fogFloor); b.x = a.x; b.y = a.y; c.x = a.x + W.FLOOR_FOG[fogFloor].radius * 3; c.y = a.y;
  const ids = R.streamSnapshot(a.id, {}).players.map(p => p.id);
  assert.ok(ids.includes(b.id) && !ids.includes(c.id));
});

await test('300 人分散 7 层：每 tick 为全部观众生成推流的成本与单帧体积在预算内', () => {
  const R = makeRoom(300);
  const conns = new Map(R.room.players.map(p => [p.id, {}]));
  for (const p of R.room.players) R.streamFrame(p.id, conns.get(p.id));
  let worst = 0, bytes = 0, frames = 0;
  for (let k = 0; k < 5; k++) {
    const t0 = process.hrtime.bigint();
    for (const p of R.room.players) { const f = R.streamFrame(p.id, conns.get(p.id)); bytes += f.length; frames++; }
    worst = Math.max(worst, Number(process.hrtime.bigint() - t0) / 1e6);
    const until = Date.now() + 45; while (Date.now() < until) { /* 模拟 tick 间隔 */ }
  }
  const avgKB = bytes / frames / 1024;
  console.log(`  300 人：最慢一 tick ${worst.toFixed(1)}ms（预算 50ms），平均单帧 ${avgKB.toFixed(1)}KB`);
  assert.ok(worst < 45, `每 tick 推流成本过高：${worst.toFixed(1)}ms`);
  assert.ok(avgKB < 20, `单帧体积过大：${avgKB.toFixed(1)}KB`);
});

const passed = results.filter(Boolean).length;
console.log(`推流规模测试：${passed} 项通过，${results.length - passed} 项失败`);
process.exitCode = passed === results.length ? 0 : 1;
