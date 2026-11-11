// 实物奖品（方案 §九）无头回归：奖品池单元、房间渠道接入（探索开箱 / J 命中）、存储往返、管理端 HTTP。
// 不启动浏览器；HTTP 段用临时端口 + SID_TEST=1（内存库、自动开场），不碰任何正在运行的服务。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { createRoom, WORLD } = require('./room.js');
const { createPrizePool } = require('./room/prizes.js');
const { createStore } = require('./server/store.js');

let passed = 0, failed = 0, seq = 0;
const nid = () => `pz-${++seq}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (e) { failed++; console.error(`失败 ${name}\n${e.stack}`); }
}
const P = (id, extra = {}) => ({ id, name: `P${id}`, ...extra });

// ---------------- 奖品池单元 ----------------
await test('奖品池默认关闭：空库存、概率 0，不会发放', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  assert.equal(pool.tryDraw(P(1, { empNo: 'E1' }), 'explore'), null);
  const v = pool.view();
  assert.deepEqual(v.chances, { explore: 0, hammer: 0 });
  assert.deepEqual(v.hammerLimits, { perTargetDaily: 2, dailyCap: 10 });
  assert.equal(v.totals.stock, 0);
});

await test('每位员工整个活动最多一次（跨渠道），库存不超发，NPC 不参与', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  assert.equal(pool.configure({ items: [{ name: '保温杯', stock: 3 }], chances: { explore: 1, hammer: 1 } }).ok, true);
  const a = P(1, { empNo: 'E1' });
  const first = pool.tryDraw(a, 'explore', { roundId: 'r1' });
  assert.equal(first.prize.name, '保温杯');
  assert.equal(pool.tryDraw(a, 'explore', { roundId: 'r1' }), null, '同渠道不重复');
  assert.equal(pool.tryDraw(a, 'hammer', { roundId: 'r2' }), null, '跨渠道、跨场次不重复');
  assert.equal(pool.tryDraw({ ...a, id: 99 }, 'hammer', { roundId: 'r3' }), null, '同工号换角色不重复');
  assert.equal(pool.tryDraw(P(50, { npc: true }), 'explore'), null, 'NPC 不参与');
  let winners = 1;
  for (let i = 2; i <= 20; i++) if (pool.tryDraw(P(i, { empNo: `E${i}` }), i % 2 ? 'hammer' : 'explore')) winners++;
  assert.equal(winners, 3, '库存 3 只能发 3 份');
  const v = pool.view();
  assert.equal(v.items[0].claimed, 3); assert.equal(v.items[0].remaining, 0); assert.equal(v.claims.length, 3);
  assert.equal(new Set(v.claims.map(c => c.key)).size, 3);
});

await test('概率判定与按剩余库存加权选品类', () => {
  let next = 9999;
  const pool = createPrizePool({ randomInt: n => Math.min(next, n - 1) });
  pool.configure({ items: [{ name: 'A', stock: 1 }, { name: 'B', stock: 3 }], chances: { explore: 0.5 } });
  assert.equal(pool.tryDraw(P(1, { empNo: 'E1' }), 'explore'), null, '9999 ≥ 5000 未中');
  next = 0;
  assert.equal(pool.tryDraw(P(1, { empNo: 'E1' }), 'explore').prize.name, 'A', '加权首格 → A');
  next = 0;
  assert.equal(pool.tryDraw(P(2, { empNo: 'E2' }), 'explore').prize.name, 'B', 'A 售罄后只剩 B');
  assert.equal(pool.tryDraw(P(3, { empNo: 'E3' }), 'unknown'), null, '未知渠道');
});

await test('落盘失败：回滚库存与中奖记录，不宣布中奖；之后可再次中奖', () => {
  let ok = false; const saved = [];
  const pool = createPrizePool({ randomInt: () => 0, persist: s => { saved.push(s); return ok; } });
  ok = true; pool.configure({ items: [{ name: '耳机', stock: 1 }], chances: { explore: 1 } }); ok = false;
  const r = pool.tryDraw(P(1, { empNo: 'E1' }), 'explore');
  assert.equal(r.prize, undefined); assert.equal(r.persistFailed, true);
  assert.equal(pool.view().items[0].claimed, 0); assert.equal(pool.view().claims.length, 0);
  assert.equal(pool.eligible(P(1, { empNo: 'E1' })), true);
  ok = true;
  assert.equal(pool.tryDraw(P(1, { empNo: 'E1' }), 'explore').prize.name, '耳机');
  assert.equal(saved.at(-1).claims['employee:E1'].prizeName, '耳机', '落盘内容含中奖记录');
});

await test('管理配置校验：库存不低于已发、已中奖品类不可删、概率范围、保存失败回滚', () => {
  let ok = true;
  const pool = createPrizePool({ randomInt: () => 0, persist: () => ok });
  assert.equal(pool.configure({ items: [{ name: '杯', stock: 2 }], chances: { explore: 1 } }).ok, true);
  pool.tryDraw(P(1, { empNo: 'E1' }), 'explore');
  const id = pool.view().items[0].id;
  assert.match(pool.configure({ items: [{ id, name: '杯', stock: 0 }] }).error, /不能低于已发出/);
  assert.match(pool.configure({ items: [] }).error, /不能删除/);
  assert.match(pool.configure({ chances: { explore: 1.5 } }).error, /0–1/);
  assert.match(pool.configure({ items: [{ name: '', stock: 1 }] }).error, /名称/);
  assert.match(pool.configure({ items: [{ name: 'x', stock: 1.5 }] }).error, /整数/);
  const res = pool.configure({ items: [{ id, name: '杯', stock: 5 }, { name: '伞', stock: 2 }], hammerLimits: { perTargetDaily: 1, dailyCap: 3 } });
  assert.equal(res.ok, true);
  assert.equal(res.prizes.items.find(i => i.id === id).claimed, 1, '保留已发出数');
  assert.deepEqual(res.prizes.hammerLimits, { perTargetDaily: 1, dailyCap: 3 });
  ok = false;
  assert.match(pool.configure({ chances: { explore: 0 } }).error, /保存失败/);
  assert.equal(pool.chanceOf('explore'), 1, '保存失败回滚');
});

await test('存储往返：prize_pool 表保存/读取，重启后资格与库存不丢', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'sid-prize-'));
  try {
    const file = path.join(dir, 'sid.sqlite');
    let store = createStore({ file });
    assert.equal(store.enabled, true);
    const pool = createPrizePool({ randomInt: () => 0, persist: s => store.savePrizes(s) });
    pool.configure({ items: [{ name: '杯', stock: 2 }], chances: { explore: 1 } });
    pool.tryDraw(P(1, { empNo: 'E1' }), 'explore');
    store.close();
    store = createStore({ file });
    const again = createPrizePool({ initial: store.loadPrizes(), randomInt: () => 0, persist: s => store.savePrizes(s) });
    assert.equal(again.eligible(P(7, { empNo: 'E1' })), false, '重启后同工号仍不可再中');
    assert.equal(again.view().items[0].remaining, 1);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------- 房间渠道接入 ----------------
function fixture({ n = 3, prizes, roll = () => 0 } = {}) {
  const r = createRoom({ random: () => 0.99, randomInt: max => roll(max) % max, prizes });
  for (let i = 0; i < n; i++) r.join(`s${i}`, `P${i}`, { empNo: `E${i}` });
  return r;
}
function open(r, p, c) {
  p.x = c.x; p.y = c.y;
  return r.interact(p.sessionId, { commandId: nid(), kind: 'search', entityId: c.id, roundId: r.room.roundId, expectedFloorRevision: p.floorRevision });
}
const containers = p => WORLD.zoneContainers(p.floorId, p.zoneId || null);
function adjacent(a, b) { b.floorId = a.floorId; b.zoneId = a.zoneId; b.x = a.x + 10; b.y = a.y; }

await test('探索开箱：独立判定、不占普通结果、不额外加分；只中一次', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  pool.configure({ items: [{ name: '杯', stock: 5 }], chances: { explore: 1 } });
  // roll=10 → 普通结果为「直接积分」（5 ≤ 10 < 20）；奖品池用自己的 rng（0 → 必中）
  const r = fixture({ prizes: pool, roll: () => 10 }), p = r.find(1), cs = containers(p);
  const s0 = p.score;
  const first = open(r, p, cs[0]);
  assert.equal(first.ok, true); assert.equal(first.mode, 'points');
  assert.deepEqual(first.prize, { id: pool.view().items[0].id, name: '杯', channel: 'explore' });
  assert.match(first.resultText, /实物奖品「杯」/);
  assert.equal(p.score - s0, WORLD.EXPLORE.directPoints, '只得本次开箱积分，中奖不加分');
  const second = open(r, p, cs[1]);
  assert.equal(second.ok, true); assert.equal(second.prize, null, '已中奖不再抽');
  assert.deepEqual(r.privateProjection(p).prize, { name: '杯', channel: 'explore', at: pool.view().claims[0].at });
  const pub = JSON.stringify(r.publicProjection(p, r.find(0)));
  assert.ok(!pub.includes('杯'), '公开投影不含奖品');
  assert.equal(r.privateProjection(r.find(2)).prize, null);
});

await test('重复开同一容器（已搜过）不触发抽奖', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  const r = fixture({ prizes: pool, roll: () => 10 }), p = r.find(1), c = containers(p)[0];
  assert.equal(open(r, p, c).prize, null, '概率 0 时不中');
  pool.configure({ items: [{ name: '杯', stock: 5 }], chances: { explore: 1 } });
  const again = open(r, p, c);
  assert.equal(again.ok, false); assert.equal(pool.view().claims.length, 0);
});

await test('J 命中（/api/action 锤子 与 /api/attack）：只对在线真人目标判定，有效触发次数受限', () => {
  const pool = createPrizePool({ randomInt: () => 9999 }); // 概率 0.5 时 9999 永不中，用来数「有效触发」
  pool.configure({ items: [{ name: '杯', stock: 5 }], chances: { hammer: 0.5 }, hammerLimits: { perTargetDaily: 2, dailyCap: 3 } });
  const r = fixture({ n: 4, prizes: pool, roll: () => 9999 }), a = r.find(1), b = r.find(2), c = r.find(3);
  const swing = target => { adjacent(a, target); a.hammerCooldownUntil = 0; a.stunUntil = 0; return r.performAction(a.id, 'hammer'); };
  for (let i = 0; i < 3; i++) assert.equal(swing(b).hit, true);
  assert.equal(a.exploration.prizeHammerToday, 2, '同一目标每日最多 2 次有效触发');
  assert.equal(a.exploration.prizeHammerByTarget[String(b.id)], 2);
  b.x = a.x + 2000; // 让 c 成为唯一的最近目标
  swing(c); swing(c);
  assert.equal(a.exploration.prizeHammerToday, 3, '每日合计上限 3');
  assert.equal(a.exploration.prizeHammerByTarget[String(c.id)], 1, '达到每日合计后不再计数');
  a.exploration.prizeHammerToday = 0; a.exploration.prizeHammerByTarget = {};
  c.online = false;
  assert.equal(swing(c).hit, true);
  assert.equal(a.exploration.prizeHammerToday, 0, '离线目标不算有效触发');
  // 换成必中：命中在线真人即中奖，结果附带 prize，积分照常按 J 规则（不额外加分）
  const pool2 = createPrizePool({ randomInt: () => 0 });
  pool2.configure({ items: [{ name: '伞', stock: 1 }], chances: { hammer: 1 } });
  const r2 = fixture({ n: 3, prizes: pool2, roll: () => 9999 }), x = r2.find(1), y = r2.find(2);
  adjacent(x, y);
  const s0 = x.score;
  const hit = r2.performAction(x.id, 'hammer');
  assert.equal(hit.hit, true); assert.deepEqual(hit.prize, { id: pool2.view().items[0].id, name: '伞', channel: 'hammer' });
  assert.equal(x.score - s0, hit.points, '中奖不额外加分（9999 → J 积分未触发即 0）');
  assert.equal(pool2.view().items[0].remaining, 0);
  // /api/attack 路径：另一位玩家，库存已空 → 无奖品
  const z = r2.find(0); adjacent(z, y); z.combat.facing = { x: 1, y: 0 };
  const atk = r2.attack(z.sessionId, { commandId: nid(), roundId: r2.room.roundId, expectedFloorRevision: z.floorRevision });
  assert.equal(atk.ok, true); assert.equal(atk.prize ?? null, null, '库存为 0 不发放');
});

await test('/api/attack 命中可中奖（同一共享池）；NPC 目标不判定', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  pool.configure({ items: [{ name: '杯', stock: 3 }], chances: { hammer: 1 } });
  const r = fixture({ n: 3, prizes: pool }), a = r.find(1), b = r.find(2);
  adjacent(a, b); a.combat.facing = { x: 1, y: 0 };
  const atk = r.attack(a.sessionId, { commandId: nid(), roundId: r.room.roundId, expectedFloorRevision: a.floorRevision });
  assert.equal(atk.ok, true); assert.equal(atk.hitId, b.id, atk.resultText);
  assert.equal(atk.prize.name, '杯'); assert.match(atk.resultText, /实物奖品「杯」/);
  b.npc = true; const c = r.find(0); adjacent(c, b); c.combat.facing = { x: 1, y: 0 };
  const npcHit = r.performAction(c.id, 'hammer');
  assert.equal(npcHit.hit, true); assert.equal(npcHit.prize, null, 'NPC 目标不产生奖品');
});

await test('休战玩家仍可中奖；中奖后进入休战 / 重置房间都不刷新资格', () => {
  const pool = createPrizePool({ randomInt: () => 0 });
  pool.configure({ items: [{ name: '杯', stock: 5 }], chances: { explore: 1 } });
  const r = fixture({ prizes: pool, roll: () => 10 }), truce = r.find(1), winner = r.find(2);
  truce.alive = false;
  assert.equal(open(r, truce, containers(truce)[0]).prize.name, '杯', '休战可中奖');
  assert.ok(open(r, winner, containers(winner)[0]).prize);
  winner.alive = false;
  assert.equal(open(r, winner, containers(winner)[1]).prize, null, '进入休战不刷新');
  r.reset();
  const back = r.join('s2', 'P2', { empNo: 'E2' }).player;
  assert.equal(open(r, back, containers(back)[0]).prize, null, '重置后同工号仍不可再中');
  assert.equal(r.privateProjection(back).prize.name, '杯', '新局仍显示已中奖品');
});

await test('进程内未注入奖品池时房间自带内存池（默认关闭），旧调用不受影响', () => {
  const r = fixture({ roll: () => 10 }), p = r.find(1);
  const res = open(r, p, containers(p)[0]);
  assert.equal(res.ok, true); assert.equal(res.prize, null);
  assert.equal(r.prizes.view().totals.stock, 0);
});

// ---------------- 管理端 HTTP ----------------
const PORT = 18000 + Math.floor(Math.random() * 1000), BASE = `http://127.0.0.1:${PORT}`;
async function call(pathname, { body, token, cookie, origin, method } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Sid-Session'] = token;
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  const res = await fetch(BASE + pathname, { method: method || (body ? 'POST' : 'GET'), headers, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') || '' };
}
const server = spawn(process.execPath, ['server.js'], { cwd: HERE, env: { ...process.env, SID_TEST: '1', PORT: String(PORT), HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe'] });
let out = ''; server.stdout.on('data', d => { out += d; }); server.stderr.on('data', d => { out += d; });
try {
  for (let i = 0; i < 100 && !out.includes('S-ID 服务已启动'); i++) await new Promise(r => setTimeout(r, 100));
  await test('管理端 HTTP：未登录 401；CSRF/Origin 门禁；配置库存与概率；开箱中奖；中奖记录与私密状态', async () => {
    assert.equal((await call('/api/manager/prizes')).status, 401);
    const login = await call('/api/manager/login', { body: { code: process.env.SID_MANAGER_CODE || '091256' } });
    const cookie = (login.setCookie.match(/sid_manager=[^;]+/) || [''])[0], csrf = login.data.csrfToken;
    assert.ok(cookie && csrf);
    const view = await call('/api/manager/prizes', { cookie });
    assert.equal(view.status, 200); assert.equal(view.data.prizes.totals.stock, 0);
    const cfg = { items: [{ name: '保温杯', stock: 1 }], chances: { explore: 1, hammer: 0 } };
    assert.equal((await call('/api/manager/prizes', { cookie, origin: BASE, body: { ...cfg, csrfToken: 'bad' } })).status, 403);
    assert.equal((await call('/api/manager/prizes', { cookie, origin: 'http://evil.example', body: { ...cfg, csrfToken: csrf } })).status, 403);
    assert.equal((await call('/api/manager/prizes', { cookie, origin: BASE, body: { items: [{ name: 'x', stock: -1 }], csrfToken: csrf } })).status, 400);
    const saved = await call('/api/manager/prizes', { cookie, origin: BASE, body: { ...cfg, csrfToken: csrf } });
    assert.equal(saved.status, 200, JSON.stringify(saved.data)); assert.equal(saved.data.prizes.totals.remaining, 1);
    const prizes = [];
    for (const name of ['甲', '乙']) {
      const j = await call('/api/join', { body: { nickname: name } });
      assert.equal(j.status, 200, JSON.stringify(j.data));
      const token = j.data.sessionToken, st = (await call('/api/state', { token })).data;
      const c = WORLD.zoneContainers(st.me.floorId, st.me.zoneId || null)[0];
      assert.equal((await call('/api/test/place', { body: { playerId: st.me.id, x: c.x, y: c.y } })).status, 200);
      const me = (await call('/api/state', { token })).data;
      const r = await call('/api/search/start', { token, body: { containerId: c.id, commandId: nid(), roundId: me.roundId, expectedFloorRevision: me.me.floorRevision } });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      prizes.push(r.data.prize || null);
      const after = (await call('/api/state', { token })).data.me;
      assert.equal(after.prize ? after.prize.name : null, r.data.prize ? r.data.prize.name : null, '私密状态与开箱结果一致');
    }
    assert.equal(prizes.filter(Boolean).length, 1, '库存 1：两人只有一人中奖');
    const final = (await call('/api/manager/prizes', { cookie })).data.prizes;
    assert.equal(final.claims.length, 1); assert.equal(final.claims[0].prizeName, '保温杯'); assert.equal(final.claims[0].channel, 'explore');
    assert.equal(final.items[0].remaining, 0);
    assert.match((await call('/api/manager/prizes', { cookie, origin: BASE, body: { items: [{ id: final.items[0].id, name: '保温杯', stock: 0 }], csrfToken: csrf } })).data.error, /不能低于已发出/);
  });
} finally {
  server.kill();
}

console.log(`实物奖品测试：${passed} 项通过，${failed} 项失败`);
process.exitCode = failed ? 1 : 0;
