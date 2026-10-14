// 独立验收：联机版（online/）。只新建本文件与 qa-report.json，不修改任何产品文件。
// 运行：node /absolute/path/online/qa-verify.mjs
// 结构：0 判定工具自验 → A 模块级（room.js 直接执行） → B HTTP 级（SID_TEST=1） →
//       C 非测试构建 → D 真实浏览器（headless Chrome ×2）
import { spawn } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createServer as netServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const ONLINE = dirname(fileURLToPath(import.meta.url));
const ROOM_MOD = require(join(ONLINE, 'room.js'));
const WORLD = require(join(ONLINE, 'shared/world.js'));
// Windows 试玩构建：服务端用当前受管 Node 自身，Chrome 用本机安装路径。
const NODE = process.execPath;
const CHROME = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = p => (p || 'c') + '-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
const results = [], evidence = [];
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); }
  catch (e) { results.push({ name, pass: false, error: String(e && e.message || e) }); console.log('FAIL', name, e && e.message); }
}
async function waitFor(label, fn, ms = 8000) {
  const end = Date.now() + ms;
  for (; ;) { try { if (await fn()) return true; } catch { } if (Date.now() > end) throw new Error('超时: ' + label); await sleep(70); }
}
const freePort = () => new Promise((res, rej) => { const s = netServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

// ---------------- 0 判定工具自验（先自测，才许对产品下结论） ----------------
const FURNITURE = WORLD.makeFurniture();
function insideFurniture(x, y) {
  return FURNITURE.some(f => x + WORLD.BODY_HALF > f.x && x - WORLD.BODY_HALF < f.x + f.w && y + WORLD.FOOT_TOP > f.y && y - WORLD.FOOT_BOTTOM < f.y + f.h);
}
// 服务端只按家具 footprint 判定脚部碰撞；角色可以站在家具上半部（视觉上被遮挡但不阻挡）。
function insideFootprint(x, y) {
  return FURNITURE.some(f => { const b = f.footprint; return x + WORLD.BODY_HALF > b.x && x - WORLD.BODY_HALF < b.x + b.w && y + WORLD.FOOT_TOP > b.y && y - WORLD.FOOT_BOTTOM < b.y + b.h; });
}
function collectKeys(obj, prefix = '', out = new Set()) {
  if (obj === null || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj)) { out.add(prefix ? prefix + '.' + k : k); if (v && typeof v === 'object') collectKeys(v, prefix ? prefix + '.' + k : k, out); }
  return out;
}
function findForbidden(obj, words) { const flat = JSON.stringify(obj); return words.filter(w => flat.includes(w)); }
function htmlInjection(html) {
  const tags = [...String(html).matchAll(/<(script|style|iframe|img|svg|b|i)\b/gi)].map(m => m[1].toLowerCase());
  return { count: tags.length, tags: [...new Set(tags)] };
}
function deduceFromLogs(logs) {
  const out = [];
  const reveal = logs.findIndex(l => /的S-ID已公开/.test(l.text));
  const accuse = logs.findIndex(l => /被指认一次/.test(l.text));
  if (reveal < 0 || accuse < 0) return out;
  out.push({ revealLog: logs[reveal].text, accuseLog: logs[accuse].text, inferred: '被指认者是好人（指控者受罚）' });
  return out;
}
const judgeSamples = [
  { name: '家具内命中', actual: insideFurniture(200, 200), expected: true },
  { name: '走廊不命中', actual: insideFurniture(600, 407), expected: false },
  { name: '脚部足迹命中', actual: insideFootprint(200, 238), expected: true },
  { name: '足迹上方外观区不命中', actual: insideFootprint(200, 200), expected: false },
  { name: '键名收集含嵌套', actual: [...collectKeys({ a: { b: 1 } })].sort().join(','), expected: 'a,a.b' },
  { name: '禁词扫描命中', actual: findForbidden({ x: { faction: 'bad' } }, ['"faction"']).length, expected: 1 },
  { name: '禁词扫描不命中', actual: findForbidden({ x: '甲' }, ['"faction"']).length, expected: 0 },
  { name: 'HTML注入命中', actual: htmlInjection('<strong><i>x</i></strong>').count, expected: 1 },
  { name: 'HTML注入不命中', actual: htmlInjection('<strong>甲</strong>').count, expected: 0 },
  { name: '日志推断命中', actual: deduceFromLogs([{ text: '甲被指认一次。' }, { text: '乙的S-ID已公开：B1C-***-***。' }]).length, expected: 1 },
  { name: '日志推断不命中', actual: deduceFromLogs([{ text: '甲加入了办公室。' }]).length, expected: 0 }
];
const judge = { passed: judgeSamples.filter(s => s.actual === s.expected).length, total: judgeSamples.length, samples: judgeSamples.map(s => ({ name: s.name, pass: s.actual === s.expected, actual: String(s.actual), expected: String(s.expected) })) };
await test(`0. 判定工具自验：已知答案样本 ${judge.passed}/${judge.total}`, async () => {
  assert.equal(judge.passed, judge.total, JSON.stringify(judge.samples.filter(s => !s.pass)));
});

// ---------------- A 模块级：直接执行 room.js（服务端权威逻辑） ----------------
const freshRoom = () => ROOM_MOD.createRoom();

await test('A1 模块级：首位bad其后good、S-ID三段各三位、同名独立身份、昵称截断', async () => {
  const r = freshRoom();
  const a = r.join('s-a', '甲').player, b = r.join('s-b', '乙').player, c = r.join('s-c', '甲').player;
  assert.equal(a.faction, 'bad'); assert.equal(b.faction, 'good'); assert.equal(c.faction, 'good');
  assert.equal(a.hp, 2); assert.equal(b.hp, 1);
  for (const p of [a, b, c]) {
    assert.equal(p.sid.segments.length, 3);
    for (const s of p.sid.segments) assert.match(s, /^[A-Z0-9]{3}$/, '段: ' + s);
  }
  assert.notEqual(a.id, c.id); assert.equal(c.name, '甲2');
  const long = r.join('s-d', '一二三四五六七八九十十一').player;
  assert.ok(long.name.length <= 8, '昵称截断: ' + long.name);
});

await test('A2 模块级：左右/上下世界边界钳制', async () => {
  const r = freshRoom(); const p = r.join('s-a', '甲').player;
  p.x = 3000; p.y = 340;
  r.setIntent(p.id, { right: true });
  for (let i = 0; i < 400; i++) r.step(0.05);
  assert.equal(p.x, WORLD.MAX_X, '右边界: ' + p.x);
  r.setIntent(p.id, { right: false, left: true });
  for (let i = 0; i < 900; i++) r.step(0.05);
  assert.equal(p.x, WORLD.MIN_X, '左边界: ' + p.x);
  p.x = 600; p.y = 400;
  r.setIntent(p.id, { left: false, up: true });
  for (let i = 0; i < 200; i++) r.step(0.05);
  assert.equal(p.y, WORLD.MIN_Y, '上边界: ' + p.y);
  r.setIntent(p.id, { up: false, down: true });
  for (let i = 0; i < 200; i++) r.step(0.05);
  assert.equal(p.y, WORLD.MAX_Y, '下边界: ' + p.y);
});

await test('A3 模块级：斜向归一化（不比直行快）', async () => {
  const r = freshRoom(); const p = r.join('s-a', '甲').player;
  p.x = 600; p.y = 340;
  r.setIntent(p.id, { right: true, down: true });
  const x0 = p.x, y0 = p.y; r.step(0.05);
  const d = Math.hypot(p.x - x0, p.y - y0);
  assert.ok(Math.abs(d - WORLD.SPEED * 0.05) < 1e-6, '斜向位移=' + d + ' 期望=' + WORLD.SPEED * 0.05);
});

await test('A4 模块级：家具逐轴AABB阻挡，沿边反复怼 300 步不穿模', async () => {
  const r = freshRoom(); const p = r.join('s-a', '甲').player;
  p.x = 210; p.y = 252; r.setIntent(p.id, { up: true });
  for (let i = 0; i < 40; i++) r.step(0.05);
  assert.ok(p.y >= 245, '被接待台挡住 y=' + p.y);
  p.x = 100; p.y = 214; r.setIntent(p.id, { up: false, right: true });
  for (let i = 0; i < 40; i++) r.step(0.05);
  assert.ok(p.x <= 124 && !insideFootprint(p.x, p.y), '横向受阻 x=' + p.x);
  const dirs = [{ up: true }, { right: true }, { down: true }, { left: true }, { up: true, right: true }, { down: true, left: true }];
  for (let i = 0; i < 300; i++) {
    r.setIntent(p.id, dirs[i % dirs.length]); r.step(0.05);
    assert.ok(!insideFootprint(p.x, p.y), '穿模于 (' + p.x + ',' + p.y + ') 第' + i + '步');
  }
});

await test('A5 模块级：人物互穿（无玩家间碰撞）', async () => {
  const r = freshRoom(); const a = r.join('s-a', '甲').player, b = r.join('s-b', '乙').player;
  a.x = b.x = 700; a.y = b.y = 340;
  r.setIntent(a.id, { right: true }); r.setIntent(b.id, { left: true });
  for (let i = 0; i < 20; i++) r.step(0.05);
  assert.ok(a.x > 700 && b.x < 700, `a.x=${a.x} b.x=${b.x}`);
});

await test('A6 模块级：极大 dt 被钳制到 0.05 秒，不瞬移出界也不穿家具', async () => {
  const r = freshRoom(); const p = r.join('s-a', '甲').player;
  p.x = 1000; p.y = 340; r.setIntent(p.id, { right: true });
  r.step(1000);
  assert.ok(Math.abs(p.x - (1000 + WORLD.SPEED * 0.05)) < 1e-6, '极大 dt 被钳制为单帧位移: ' + p.x);
  assert.ok(p.x < WORLD.MAX_X && !insideFootprint(p.x, p.y), '仍在世界内且未穿家具: ' + p.x);
  const r2 = freshRoom(); const q = r2.join('s-b', '乙').player;
  q.x = 1020; q.y = 200; r2.setIntent(q.id, { right: true });
  r2.step(1.1);
  const tunneled = q.x > 1181 && !insideFootprint(q.x, q.y);
  evidence.push({ tag: 'A6-clamp', note: 'step(dt) 将 dt 钳制到 [0, 0.05] 秒并逐轴判定，单次大 dt 只产生一帧位移，不跨过家具；服务端固定 50ms 与之一致', dt: 1.1, from: 1020, to: q.x, crossedDesk: tunneled });
  assert.equal(tunneled, false, '大 dt 不再穿模');
});

await test('A7 模块级：次数上限2、不溢出、nextChargeAt 推进正确、惰性结算粒度', async () => {
  const r = freshRoom(); const a = r.join('s-a', '甲').player; r.join('s-b', '乙');
  const t0 = r.now();
  const res = r.useSkill('s-a', { commandId: uid(), skill: 'probe', targetId: 1 });
  assert.equal(res.ok, true, JSON.stringify(res));
  const sk = a.skills.probe;
  assert.equal(sk.chargesRemaining, 1, '消耗后剩余: ' + sk.chargesRemaining);
  assert.ok(Math.abs(sk.nextChargeAt - (t0 + 90000)) < 500, 'nextChargeAt 偏移: ' + (sk.nextChargeAt - t0));
  r.room.clockOffset += 360000;
  const proj = r.privateProjection(a);
  assert.equal(proj.skills.probe.chargesRemaining, 2, '长时间后封顶: ' + proj.skills.probe.chargesRemaining);
  assert.equal(proj.skills.probe.nextChargeAt, 0, '满后清空 nextChargeAt');
  const b = r.find(1);
  b.skills.probe.chargesRemaining = 0; b.skills.probe.nextChargeAt = r.now() - 450000;
  let reads = 0, snap;
  do { snap = r.privateProjection(b); reads++; } while (snap.skills.probe.chargesRemaining < 2 && reads < 20);
  evidence.push({ tag: 'A7-lazy', note: '惰性结算每次读取最多补 1 次，需多次读取才补齐（20Hz 快照下约百毫秒内收敛）', readsNeeded: reads, final: snap.skills.probe.chargesRemaining });
  assert.equal(snap.skills.probe.chargesRemaining, 2, '最终封顶不溢出');
});

await test('A8 模块级：结束仅三种（badWiped/aliveFloor/timeUp）；小房间淘汰好人至存活2不结束', async () => {
  const kill = (r, actor, targetId) => r.useSkill(actor, { commandId: uid(), skill: 'action', targetId, sid: r.find(targetId).sid.segments.join('-') });
  const accuse = (r, actor, targetId) => r.useSkill(actor, { commandId: uid(), skill: 'accuse', targetId });
  // 旧「存活<=2 且有淘汰即结束」已废除：小房间淘汰好人只减少存活，不触发结束。
  let r = freshRoom(); r.join('r1a', '甲'); r.join('r1b', '乙'); r.join('r1c', '丙');
  kill(r, 'r1a', 1);
  assert.equal(r.room.finished, false, '3人局淘汰1名好人（存活2）不应结束');
  r = freshRoom(); ['a', 'b', 'c', 'd'].forEach(k => r.join('r2' + k, k));
  kill(r, 'r2a', 1);
  assert.equal(r.room.finished, false, '4人局淘汰1人（存活3）不应结束');
  r = freshRoom(); r.join('r3a', '甲'); r.join('r3b', '乙');
  assert.equal(r.room.finished, false, '2人无淘汰不应结束');
  r = freshRoom(); r.join('r4a', '甲');
  assert.equal(r.room.finished, false, '1人不应结束');
  // badWiped：两名好人各指认唯一坏人一次（hp 2→0）-> 坏人全灭，结束并下发排名。
  r = freshRoom(); r.join('w-a', '甲'); r.join('w-b', '乙'); r.join('w-c', '丙');
  accuse(r, 'w-b', 0); r.room.clockOffset += 13000; accuse(r, 'w-c', 0);
  assert.equal(r.room.finished, true, '坏人全灭应结束');
  assert.equal(r.room.finishReason, 'badWiped');
  assert.ok(Array.isArray(r.room.ranking) && r.room.ranking.length === 3, 'badWiped 应下发排名');
  // aliveFloor：用 options.rules 把阈值降到 2 -> 存活降到阈值即结束，不排名。
  const f = ROOM_MOD.createRoom({ rules: { endRemainingPlayers: 2 } });
  f.join('f-a', '甲'); f.join('f-b', '乙'); f.join('f-c', '丙');
  kill(f, 'f-a', 1);
  assert.equal(f.room.finished, true, '存活降到阈值应结束');
  assert.equal(f.room.finishReason, 'aliveFloor'); assert.equal(f.room.ranking, null);
  // timeUp：推进时钟越过 2 小时上限 -> 结束并下发排名与公开 rules。
  const t = freshRoom(); t.join('t-a', '甲'); t.join('t-b', '乙');
  t.room.clockOffset += WORLD.RULES.timeLimitMs;
  const snap = t.publicSnapshot();
  assert.equal(t.room.finished, true); assert.equal(t.room.finishReason, 'timeUp');
  assert.ok(Array.isArray(t.room.ranking) && t.room.ranking.length === 2);
  assert.deepEqual(Object.keys(snap.rules).sort(), ['endRemainingPlayers', 'endsAt', 'timeLimitMs']);
  assert.ok(snap.players.every(p => typeof p.score === 'number'));
});

await test('A9 模块级：离线者计入存活、不淘汰不释放、原地冻结、可被施技', async () => {
  const r = freshRoom(); r.join('o-a', '甲'); const b = r.join('o-b', '乙').player; r.join('o-c', '丙');
  r.setOffline(b.id);
  b.x = 1234; b.y = 340; r.setIntent(b.id, { right: true });
  for (let i = 0; i < 20; i++) r.step(0.05);
  assert.equal(b.x, 1234, '离线者原地不动: ' + b.x);
  assert.equal(b.online, false); assert.equal(b.alive, true);
  assert.equal(r.publicSnapshot().aliveCount, 3, '离线者仍计入存活');
  assert.equal(r.room.finished, false, '离线不触发结束');
  const res = r.useSkill('o-a', { commandId: uid(), skill: 'probe', targetId: b.id });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(b.alive, true, '对离线者施技不淘汰');
  assert.equal(b.online, false, '对离线者施技不释放');
});

await test('A10 模块级：已淘汰目标再施技被拒；同一目标不重复计数', async () => {
  // 4 人局：淘汰 1 人后存活 3 人，房间不结束，才能单独检验「已淘汰目标不可操作」分支。
  const r = freshRoom(); r.join('k-a', '甲'); r.join('k-b', '乙'); r.join('k-c', '丙'); r.join('k-d', '丁');
  const sid = r.find(1).sid.segments.join('-');
  const first = r.useSkill('k-a', { commandId: uid(), skill: 'action', targetId: 1, sid });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(r.find(1).alive, false);
  assert.equal(r.room.eliminateEvents, 1);
  assert.equal(r.room.finished, false, '4人局淘汰1人不结束');
  r.room.clockOffset += 13000;
  const second = r.useSkill('k-a', { commandId: uid(), skill: 'action', targetId: 1, sid });
  assert.equal(second.ok, false, '已淘汰目标应被拒: ' + JSON.stringify(second));
  assert.match(second.error, /已淘汰|无效/);
  const probeDead = r.useSkill('k-a', { commandId: uid(), skill: 'probe', targetId: 1 });
  assert.equal(probeDead.ok, false, '对已淘汰者探查也应被拒');
  assert.equal(r.room.eliminateEvents, 1, '淘汰计数不得重复: ' + r.room.eliminateEvents);
});

await test('A11 模块级：伪造归属字段（actorId/faction/hp/skills/x/y）全部被忽略', async () => {
  const r = freshRoom(); const a = r.join('f-a', '甲').player; const b = r.join('f-b', '乙').player;
  const before = { faction: a.faction, hp: a.hp, hpB: b.hp, factionB: b.faction, xB: b.x, charges: a.skills.probe.chargesRemaining, chargesB: b.skills.probe.chargesRemaining };
  const res = r.useSkill('f-a', {
    commandId: uid(), skill: 'probe', targetId: b.id,
    actorId: b.id, actor: b.id, playerId: b.id, faction: 'good', hp: 99, alive: false,
    x: 9999, y: 9999, targetPlayerId: a.id, skills: { probe: { chargesRemaining: 99 } }
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(a.faction, before.faction, '请求方阵营未被伪造改写');
  assert.equal(a.hp, before.hp); assert.equal(b.hp, before.hpB); assert.equal(b.faction, before.factionB);
  assert.equal(b.x, before.xB, '他人坐标未被伪造改写');
  assert.equal(a.skills.probe.chargesRemaining, before.charges - 1, '按凭证结算请求方次数');
  assert.equal(b.skills.probe.chargesRemaining, before.chargesB, '他人次数未被伪造改写');
});

await test('A12 模块级：同一 commandId 重放被去重、只结算一次', async () => {
  const r = freshRoom(); r.join('d-a', '甲'); const b = r.join('d-b', '乙').player;
  const id = uid();
  const first = r.useSkill('d-a', { commandId: id, skill: 'probe', targetId: b.id });
  const second = r.useSkill('d-a', { commandId: id, skill: 'probe', targetId: b.id });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(second.ok, false, '重放应被拒: ' + JSON.stringify(second));
  assert.match(second.error, /已结算过/);
  const revealed = b.sid.revealed.filter(Boolean).length + Object.values(b.traitPublic).filter(Boolean).length;
  assert.equal(revealed, 1, '只结算一次，实际公开项: ' + revealed);
  assert.equal(r.find(0).skills.probe.chargesRemaining, 1, '只扣一次次数');
});

await test('A13 模块级：public 投影键白名单与掩码', async () => {
  const r = freshRoom(); const a = r.join('p-a', '甲').player; r.join('p-b', '乙');
  const pub = r.publicProjection(a);
  const keys = [...collectKeys(pub)].sort();
  evidence.push({ tag: 'A13-public-keys', keys });
  for (const bad of ['faction', 'hp', 'skills', 'sessionId', 'traitPublic', 'input', 'walk', 'lastSeen']) {
    assert.ok(!keys.includes(bad) && !keys.some(k => k.startsWith(bad + '.') || k.endsWith('.' + bad)), 'public 含禁用键: ' + bad);
  }
  assert.equal(pub.sid, `${WORLD.MASK}-${WORLD.MASK}-${WORLD.MASK}`, '初始三段全掩码: ' + pub.sid);
  assert.deepEqual(Object.values(r.publicProjection(r.find(1)).traits), [WORLD.MASK, WORLD.MASK, WORLD.MASK], '他人隐藏属性掩码');
  r.find(0).sid.revealed[0] = true;
  assert.equal(r.publicProjection(r.find(0)).sid.split('-').filter(s => s === WORLD.MASK).length, 2, '公开一段后掩码数: ' + r.publicProjection(r.find(0)).sid);
});

// ---------------- B HTTP 级（SID_TEST=1 服务） ----------------
const PORT_B = await freePort();
const BASE_B = `http://127.0.0.1:${PORT_B}`;
const serverB = spawn(NODE, [join(ONLINE, 'server.js')], { env: { ...process.env, PORT: String(PORT_B), SID_TEST: '1', SID_DEV: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const logB = []; serverB.stdout.on('data', d => logB.push(String(d))); serverB.stderr.on('data', d => logB.push(String(d)));

const call = async (path, opts = {}) => {
  const res = await fetch(BASE_B + path, opts);
  let body = null; try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
};
const post = (path, body, cookie, extra = {}) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie: 'sid_session=' + cookie } : {}), ...extra }, body: JSON.stringify(body || {}) });
const get = (path, cookie, extra = {}) => call(path, { headers: { ...(cookie ? { cookie: 'sid_session=' + cookie } : {}), ...extra } });
const tokenGet = (path, token, extra = {}) => call(path, { headers: { 'X-Sid-Session': token, ...extra } });
const tokenPost = (path, body, token, extra = {}) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sid-Session': token, ...extra }, body: JSON.stringify(body || {}) });
const testState = async () => (await call('/api/test/state')).body;
const advance = ms => post('/api/test/advance', { ms });
const pstate = async id => (await testState()).players.find(p => p.id === id);
const cookieOf = r => (r.setCookie || '').split(';')[0].split('=')[1] || (r.body && r.body.sessionToken);
// 主持人重开走真实门禁：需要一个有效身份 + 同源 Origin + 能力令牌 CSRF + confirm。
const resetRoom = async () => {
  const list = (await get('/api/test/sessions')).body.sessions;
  let token = list.length ? list[0].sessionId : null;
  if (!token) {
    const throwaway = await post('/api/join', { nickname: '重置器' });
    token = throwaway.body.sessionToken;
  }
  const cap = await tokenGet('/api/dev/capabilities', token);
  assert.equal(cap.body.canReset, true, '重置需要 SID_DEV=1 隔离服务的本机授权: ' + JSON.stringify(cap.body));
  const r = await tokenPost('/api/host/reset', { confirm: true, csrfToken: cap.body.csrfToken }, token, { Origin: BASE_B });
  assert.equal(r.status, 200, '主持人重开失败: ' + JSON.stringify(r.body));
  return r;
};
const joinBy = async nick => { const r = await post('/api/join', { nickname: nick }); return { res: r, token: cookieOf(r), id: r.body.playerId, name: r.body.name }; };

await waitFor('server B boot', async () => { try { return (await call('/api/state')).status === 401; } catch { return false; } }, 12000);

await test('B1 会话构造/窃取：随机 cookie 与 sid_token 一律 401，无法冒用身份', async () => {
  const tried = [];
  for (let i = 0; i < 25; i++) {
    const fake = (Math.random().toString(36).slice(2) + 'x'.repeat(40)).slice(0, 32);
    const s = await get('/api/state', fake);
    tried.push(s.status);
    assert.equal(s.status, 401, '伪造 cookie 拿到状态: ' + s.status);
  }
  const q = await call('/api/stream?sid_token=' + 'f'.repeat(32));
  assert.equal(q.status, 401, '伪造 sid_token 查询参数: ' + q.status);
  const real = await joinBy('甲');
  const guess = await get('/api/state', real.token.slice(0, 30) + 'zz');
  assert.equal(guess.status, 401, '变异凭证: ' + guess.status);
  const empty = await get('/api/state', '');
  assert.equal(empty.status, 401, '空凭证');
  evidence.push({ tag: 'B1', tried: tried.length, distinctStatus: [...new Set(tried)], note: '25 个随机 32 位凭证 + 变异凭证 + 空凭证全部 401' });
});

await test('B2 同名加入是独立身份；昵称截断与去重；同凭证重连不刷新资源', async () => {
  await resetRoom();
  const a = await joinBy('乙'), b = await joinBy('乙');
  assert.notEqual(a.id, b.id, '同名为两个身份');
  assert.equal(a.name, '乙'); assert.equal(b.name, '乙2', '去重命名: ' + b.name);
  const long = await post('/api/join', { nickname: '一二三四五六七八九十十一' });
  assert.ok(long.body.name.length <= 8, '服务端截断: ' + long.body.name);
  const st = await testState();
  assert.equal(st.players.find(p => p.id === a.id).faction, 'bad');
  assert.equal(st.players.find(p => p.id === b.id).faction, 'good');
  await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: b.id }, a.token);
  const before = (await pstate(a.id)).skills.probe.chargesRemaining;
  const rejoin = await post('/api/join', { nickname: '乙' }, a.token);
  assert.equal(rejoin.body.revived, true, '同凭证重连为同一身份');
  assert.equal(rejoin.body.playerId, a.id, '重连不产生新身份');
  const after = (await pstate(a.id)).skills.probe.chargesRemaining;
  assert.equal(after, before, '重连不得刷新次数: ' + before + '->' + after);
});

await test('B3 伪造归属：请求体塞 actorId/faction/hp/skills/x/y 不影响权威状态', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙');
  const beforeB = await pstate(b.id);
  const res = await tokenPost('/api/skill', {
    commandId: uid(), skill: 'probe', targetId: b.id,
    actorId: b.id, playerId: b.id, faction: 'good', hp: 99, alive: false, x: 9999, y: 9999,
    targetPlayerId: a.id, skills: { probe: { chargesRemaining: 99 } }, sessionId: b.token
  }, a.token);
  assert.equal(res.body.ok, true, JSON.stringify(res.body));
  const afterA = await pstate(a.id), afterB = await pstate(b.id);
  assert.equal(afterA.faction, 'bad', '请求方阵营未被伪造改写');
  assert.equal(afterB.hp, beforeB.hp, '目标血量未被伪造改写');
  assert.equal(afterB.x, beforeB.x, '目标坐标未被伪造改写');
  assert.equal(afterB.skills.probe.chargesRemaining, beforeB.skills.probe.chargesRemaining, '目标次数未被伪造改写');
  assert.equal(afterA.skills.probe.chargesRemaining, 1, '按凭证结算请求方次数');
  const input = await tokenPost('/api/input', { right: true, playerId: b.id, x: 9999 }, a.token);
  assert.equal(input.status, 200);
  await sleep(300);
  assert.equal((await pstate(b.id)).x, beforeB.x, '带他人 id 的 input 不移动他人');
});

await test('B4 重放与去重：同 commandId 两次只结算一次；不同 commandId 连发被冷却挡住', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙');
  const id = uid();
  const first = await tokenPost('/api/skill', { commandId: id, skill: 'probe', targetId: b.id }, a.token);
  const second = await tokenPost('/api/skill', { commandId: id, skill: 'probe', targetId: b.id }, a.token);
  assert.equal(first.body.ok, true, JSON.stringify(first.body));
  assert.equal(second.body.ok, false, '重放应被拒: ' + JSON.stringify(second.body));
  assert.match(second.body.error, /已结算过/);
  assert.equal((await pstate(a.id)).skills.probe.chargesRemaining, 1, '只扣一次次数');
  const pubB = (await tokenGet('/api/state', b.token)).body.players.find(p => p.id === b.id);
  assert.equal(Object.values(pubB.traits).filter(v => v !== '***').length, 1, '探查只公开一项隐藏属性: ' + JSON.stringify(pubB.traits));
  assert.equal((await pstate(b.id)).sidRevealed.filter(Boolean).length, 0, '探查不公开 SID 段: ' + (await pstate(b.id)).sidRevealed);
  const third = await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: b.id }, a.token);
  assert.equal(third.body.ok, false, '不同 commandId 立发应被冷却挡: ' + JSON.stringify(third.body));
  assert.match(third.body.error, /冷却/);
  assert.equal((await pstate(a.id)).skills.probe.chargesRemaining, 1, '冷却拒绝不扣次数');
  evidence.push({ tag: 'B4', replayError: second.body.error, cooldownError: third.body.error, revealedTraits: Object.values(pubB.traits).filter(v => v !== '***') });
});

await test('B5 击杀语义：小写按格式错误拒绝且不消耗；错误SID不匹配但消耗；正确大写淘汰', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  const realSid = (await pstate(b.id)).sid;
  const lower = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: realSid.toLowerCase() }, a.token);
  assert.equal(lower.body.ok, false, '小写应被拒: ' + JSON.stringify(lower.body));
  assert.equal(lower.body.formatError, true, '标记为格式错误');
  assert.equal((await pstate(a.id)).skills.kill.chargesRemaining, 2, '小写不消耗');
  let snap = (await tokenGet('/api/state', a.token)).body;
  assert.equal(snap.me.skills.kill.cooldownUntil, 0, '小写不进冷却: ' + snap.me.skills.kill.cooldownUntil);
  const bad = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: 'bad-format' }, a.token);
  assert.equal(bad.body.ok, false, '格式错误被拒');
  assert.equal((await pstate(a.id)).skills.kill.chargesRemaining, 2, '格式错误不消耗');
  const wrong = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: 'AAA-AAA-AAA' }, a.token);
  assert.equal(wrong.body.ok, true, JSON.stringify(wrong.body));
  assert.match(wrong.body.resultText, /不匹配/);
  assert.equal((await pstate(a.id)).skills.kill.chargesRemaining, 1, '错误提交仍消耗');
  assert.equal((await pstate(b.id)).alive, true, '未淘汰');
  await advance(13000);
  const kill = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: realSid }, a.token);
  assert.equal(kill.body.ok, true, JSON.stringify(kill.body));
  assert.equal((await pstate(b.id)).alive, false, '精确匹配淘汰');
  await advance(13000);
  const again = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: realSid }, a.token);
  assert.equal(again.body.ok, false, '已淘汰目标再击杀被拒: ' + JSON.stringify(again.body));
  assert.equal((await testState()).eliminateEvents, 1, '淘汰计数不重复');
});

await test('B6 公共快照泄露扫描：无 faction/hp/skills/actor/他人完整SID（递归键枚举+值扫描）', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  const secrets = (await testState()).players;
  const snap = (await tokenGet('/api/state', b.token)).body;
  evidence.push({
    tag: 'B6-keys', topLevel: Object.keys(snap).sort(),
    playerKeys: Object.keys(snap.players[0]).sort(), meKeys: Object.keys(snap.me).sort(),
    note: 'public.players 含 online 字段（对外暴露在线状态）'
  });
  const flat = JSON.stringify(snap.players);
  for (const key of ['"faction"', '"hp"', '"skills"', '"sessionId"', '"traitPublic"', '"pending"', '"input"', '"walk"']) {
    assert.ok(!flat.includes(key), 'public.players 含禁用键: ' + key);
  }
  for (const s of secrets) assert.ok(!flat.includes(s.sid), 'public 泄露完整SID: ' + s.sid);
  assert.ok(!/actor/i.test(JSON.stringify(snap)), 'public 含 actor 字样');
  assert.equal(snap.players.every(p => Object.values(p.traits).every(v => v === '***')), true, '他人隐藏属性必须全部掩码');
  // 规则变更后的公开字段：每名玩家下发 score；顶层下发 rules，未结束时 finishReason=null、ranking=null。
  assert.ok(snap.players.every(p => typeof p.score === 'number'), 'public.players 应含数值 score');
  assert.deepEqual(Object.keys(snap.rules).sort(), ['endRemainingPlayers', 'endsAt', 'timeLimitMs'], 'public.rules 字段');
  assert.equal(snap.finishReason, null, '未结束 finishReason 为 null');
  assert.equal(snap.ranking, null, '未结束 ranking 为 null');
  assert.ok(!flat.includes('"faction"') && !flat.includes('"hp"') && !flat.includes('"skills"'), '新增 score 不得带出私密键');
  const priv = (await tokenGet('/api/state', b.token)).body;
  const others = JSON.stringify(priv.players.filter(p => p.id !== b.id));
  for (const s of secrets.filter(x => x.id !== b.id)) {
    assert.ok(!others.includes(s.sid), 'own-private 泄露他人完整SID: ' + s.sid);
    assert.ok(!others.includes('"faction"'), 'own-private 泄露他人阵营');
  }
  assert.equal(priv.me.sid, secrets.find(s => s.id === b.id).sid, '本人完整SID仅自己可见');
});

await test('B7 公共日志：无上下线/操作者字样；错指认不再公开受罚方 S-ID，无法反推阵营', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: c.id }, b.token);
  await advance(13000);
  await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: c.id }, b.token);
  const snap = (await tokenGet('/api/state', a.token)).body;
  const texts = snap.logs.map(l => l.text);
  evidence.push({ tag: 'B7-logs', logs: texts.slice(0, 6) });
  for (const t of texts) assert.ok(!/上线|下线|离线|在线状态|操作者/.test(t), '日志禁词: ' + t);
  // 被指认者的公开日志只写“被指认一次”，不写对错、不公开受罚方 S-ID，故无法据此反推阵营。
  assert.ok(texts.some(t => /丙被指认一次/.test(t)), '缺被指认日志: ' + JSON.stringify(texts.slice(0, 4)));
  assert.ok(!texts.some(t => /的S-ID已公开/.test(t)), '错指认不得在公共日志公开 S-ID: ' + JSON.stringify(texts));
  assert.ok(!/好人|坏人|错指认|命中|失败/.test(texts.join('|')), '公共日志泄露阵营/对错');
  const deduced = deduceFromLogs(snap.logs);
  evidence.push({ tag: 'B7-inference', deduced, note: '隐私修复后错指认不再写入可反推的 S-ID 日志' });
  assert.equal(deduced.length, 0, '公共日志不得可反推阵营');
  const truth = (await testState()).players.find(p => p.id === c.id).faction;
  assert.equal(truth, 'good', '被指认目标实际阵营（证明原推断路径已关闭）');
});

await test('B8 断线：关闭 SSE 即判离线、原地不动、可被施技、重连同id同位置、离线期间按时间恢复次数', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: c.id }, b.token);
  assert.equal((await pstate(b.id)).skills.probe.chargesRemaining, 1, '前置消耗');
  const ctrl = new AbortController();
  const res = await fetch(BASE_B + '/api/stream', { headers: { cookie: 'sid_session=' + b.token }, signal: ctrl.signal });
  const reader = res.body.getReader(); await reader.read();
  await waitFor('SSE 首帧', async () => (await pstate(b.id)).online === true);
  const before = await pstate(b.id);
  ctrl.abort();
  await waitFor('离线判定', async () => (await pstate(b.id)).online === false, 6000);
  const frozen = await pstate(b.id);
  assert.equal(frozen.x, before.x, '离线者原地不动');
  const probe = await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: b.id }, a.token);
  assert.equal(probe.body.ok, true, JSON.stringify(probe.body));
  assert.equal((await pstate(b.id)).alive, true, '离线者不被淘汰');
  assert.equal((await pstate(b.id)).online, false, '离线者不被释放');
  await advance(91000);
  const re = await tokenGet('/api/state', b.token);
  assert.equal(re.body.me.id, b.id, '重连同 playerId');
  assert.equal((await pstate(b.id)).x, before.x, '位置保持');
  assert.ok(re.body.me.pending.length >= 1, '重连拿到私密摘要');
  const text = re.body.me.pending.map(e => e.text).join(' | ');
  assert.ok(!/甲|乙|丙|actor|操作者|在线|离线/.test(text), '摘要含禁用信息: ' + text);
  const charges = (await pstate(b.id)).skills.probe.chargesRemaining;
  evidence.push({ tag: 'B8', digest: text, chargesAfterOffline: charges });
  assert.equal(charges, 2, '离线期间按时间恢复: ' + charges);
});

await test('B9 badWiped 结束之后：加入/技能/移动全部冻结；SSE 仍能读到历史私密事件', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: c.id }, a.token);
  const pendingBefore = (await tokenGet('/api/state', c.token)).body.me.pending.length;
  assert.ok(pendingBefore >= 1, '前置私密事件: ' + pendingBefore);
  // 小房间淘汰好人不再结束：先淘汰乙，游戏继续。
  const killB = await tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: b.id, sid: (await pstate(b.id)).sid }, a.token);
  assert.equal(killB.body.ok, true, JSON.stringify(killB.body));
  assert.equal((await testState()).finished, false, '小房间仅淘汰好人不应结束');
  // 唯一的坏人（甲）被好人指认两次（hp 2→0）-> 坏人全灭，badWiped 结束并下发排名。
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: a.id }, c.token)).body.ok, true);
  await advance(13000);
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: a.id }, c.token)).body.ok, true);
  await waitFor('badWiped 结束', async () => (await testState()).finished, 5000);
  const st = await testState();
  assert.equal(st.finished, true, '坏人全灭应结束');
  assert.equal(st.finishReason, 'badWiped');
  assert.ok(Array.isArray(st.ranking) && st.ranking.length === 3, 'badWiped 应下发排名');
  const join = await post('/api/join', { nickname: '新同事' });
  assert.equal(join.status, 409, '结束后拒绝新加入: ' + join.status);
  const xBefore = (await pstate(c.id)).x;
  await tokenPost('/api/input', { right: true }, c.token);
  await sleep(400);
  assert.equal((await pstate(c.id)).x, xBefore, '结束后移动冻结');
  const skill = await tokenPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: c.id }, c.token);
  assert.equal(skill.body.ok, false, '结束后技能冻结: ' + JSON.stringify(skill.body));
  assert.match(skill.body.error, /冻结/, '结束后技能冻结原因');
  const stream = await tokenGet('/api/state', c.token);
  const pendingAfter = stream.body.me.pending.length;
  assert.ok(pendingAfter >= pendingBefore, `结束后仍能读到历史私密事件 ${pendingBefore}->${pendingAfter}`);
  const ack = await tokenPost('/api/ack', { eventIds: stream.body.me.pending.map(e => e.eventId) }, c.token);
  evidence.push({ tag: 'B9', ackStatus: ack.status, ackBody: ack.body, note: '结束后 ack 仍被接受（仅清理本人摘要，不改权威状态）' });
  const after = await testState();
  assert.equal(after.finished, true); assert.equal(after.eliminateEvents, 2);
});

await test('B10 结束条件反向：小房间淘汰好人至存活2不结束；离线者计入存活；badWiped 正例', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙'), d = await joinBy('丁');
  const kill = async target => tokenPost('/api/skill', { commandId: uid(), skill: 'action', targetId: target.id, sid: (await pstate(target.id)).sid }, a.token);
  const killed = await kill(d);
  assert.equal(killed.body.ok, true, JSON.stringify(killed.body));
  let st = await testState();
  assert.equal(st.finished, false, '4人局存活3不应结束');
  assert.equal(st.players.filter(p => p.alive).length, 3);
  const ctrl = new AbortController();
  const s = await fetch(BASE_B + '/api/stream', { headers: { cookie: 'sid_session=' + c.token }, signal: ctrl.signal });
  await s.body.getReader().read(); ctrl.abort();
  await waitFor('丙离线', async () => (await pstate(c.id)).online === false, 6000);
  st = await testState();
  assert.equal(st.players.filter(p => p.alive).length, 3, '离线者仍算存活');
  assert.equal(st.finished, false, '离线不误判结束');
  await advance(13000);
  const killed2 = await kill(b);
  assert.equal(killed2.body.ok, true, JSON.stringify(killed2.body));
  st = await testState();
  assert.equal(st.players.filter(p => p.alive).length, 2, '仅剩坏人 + 离线好人');
  assert.equal(st.finished, false, '小房间存活降到2但坏人仍在场 -> 不结束（旧“存活<=2”已废除）');
  // badWiped 正例：重置后由好人指认唯一坏人两次。
  await resetRoom();
  const e = await joinBy('戊'), f = await joinBy('己'), g = await joinBy('庚');
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: e.id }, f.token)).body.ok, true);
  await advance(13000);
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: e.id }, g.token)).body.ok, true);
  await waitFor('badWiped', async () => (await testState()).finished, 5000);
  const w = await testState();
  assert.equal(w.finished, true, '坏人全灭应结束');
  assert.equal(w.finishReason, 'badWiped');
  assert.ok(Array.isArray(w.ranking) && w.ranking.length === 3, 'badWiped 应下发排名');
  await resetRoom();
  await joinBy('子'); await joinBy('丑');
  assert.equal((await testState()).finished, false, '2人无淘汰不结束');
  await resetRoom(); await joinBy('独');
  assert.equal((await testState()).finished, false, '1人不结束');
});

await test('B11 主持人接口：需 SID_DEV+身份+同源Origin+CSRF+confirm；伪造来源头不能绕过', async () => {
  await resetRoom();
  const host = await joinBy('主持人');
  const cap = await tokenGet('/api/dev/capabilities', host.token);
  assert.equal(cap.status, 200, '本机能力可读: ' + cap.status);
  assert.equal(cap.body.canReset, true);
  const csrf = cap.body.csrfToken;
  // 伪造「非本机来源/本机来源」请求头都被忽略：身份 + 同源 Origin + CSRF + confirm 才是门禁。
  const forged = await tokenPost('/api/host/finish', { confirm: true }, host.token, { Origin: BASE_B, 'X-Sid-Test-Source-Address': '10.0.0.9' });
  assert.equal(forged.status, 403, '伪造来源头 + 缺 CSRF 仍被拒: ' + forged.status);
  const noOrigin = await tokenPost('/api/host/finish', { confirm: true, csrfToken: csrf }, host.token);
  assert.equal(noOrigin.status, 403, '缺同源 Origin 被拒: ' + noOrigin.status);
  const noConfirm = await tokenPost('/api/host/finish', { csrfToken: csrf }, host.token, { Origin: BASE_B });
  assert.equal(noConfirm.status, 400, '缺 confirm: ' + noConfirm.status);
  const local = await tokenPost('/api/host/finish', { confirm: true, csrfToken: csrf }, host.token, { Origin: BASE_B });
  assert.equal(local.status, 200, '合法本机可结束: ' + local.status);
  assert.equal((await testState()).finished, true);
  const rst = await tokenPost('/api/host/reset', { confirm: true, csrfToken: csrf }, host.token, { Origin: BASE_B });
  assert.equal(rst.body.ok, true);
  assert.equal((await testState()).players.length, 0);
  assert.equal((await get('/api/test/sessions')).body.sessions.length, 0, '重开清空会话');
});

await test('B12 badWiped 结束后旧身份仍可重连（revived），但不新增身份', async () => {
  await resetRoom();
  const a = await joinBy('甲'), b = await joinBy('乙'), c = await joinBy('丙');
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: a.id }, b.token)).body.ok, true);
  await advance(13000);
  assert.equal((await tokenPost('/api/skill', { commandId: uid(), skill: 'accuse', targetId: a.id }, c.token)).body.ok, true);
  await waitFor('badWiped', async () => (await testState()).finished, 5000);
  assert.equal((await testState()).finished, true);
  const re = await post('/api/join', { nickname: '甲' }, a.token);
  evidence.push({ tag: 'B12', status: re.status, body: re.body });
  assert.equal((await testState()).players.length, 3, '结束后重连不新增身份');
});

await test('B13 健壮性：超大 body / 畸形 JSON / 静态越界均不泄露且不崩溃', async () => {
  await resetRoom();
  let big = { status: 'fetch-failed', error: null };
  try {
    const res = await fetch(BASE_B + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: 'x'.repeat(400000) }) });
    big = { status: res.status };
  } catch (e) { big.error = String(e && e.message || e); }
  evidence.push({ tag: 'B13-big', ...big, note: '超过 32KB 的请求体被服务端直接断开（readBody 限制），客户端收不到 4xx 而是连接错误' });
  const alive1 = await call('/api/state');
  assert.equal(alive1.status, 401, '大 body 之后服务仍存活');
  const alive2 = await post('/api/join', { nickname: '仍可用' });
  assert.equal(alive2.status, 200, '大 body 之后仍可正常加入');
  const badJson = await fetch(BASE_B + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops' });
  const badBody = await badJson.json().catch(() => null);
  evidence.push({ tag: 'B13-badjson', status: badJson.status, body: badBody, note: '畸形 JSON 不报 400，而是以随机昵称成功加入' });
  for (const p of ['/../server.js', '/server.js', '/room.js', '/api/test/stateX']) {
    const r = await call(p);
    assert.ok([403, 404].includes(r.status), `${p} 返回 ${r.status}`);
    assert.ok(!(r.body && r.body.players), `${p} 不得返回内部状态`);
  }
  const shared = await call('/shared/world.js');
  assert.equal(shared.status, 200, 'shared/world.js 可读');
});

// ---------------- C 非测试构建（未设 SID_TEST） ----------------
const PORT_C = await freePort();
const BASE_C = `http://127.0.0.1:${PORT_C}`;
const serverC = spawn(NODE, [join(ONLINE, 'server.js')], { env: { ...process.env, PORT: String(PORT_C), SID_TEST: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
const logC = []; serverC.stdout.on('data', d => logC.push(String(d))); serverC.stderr.on('data', d => logC.push(String(d)));
await waitFor('server C boot', async () => { try { return (await fetch(BASE_C + '/api/state')).status === 401; } catch { return false; } }, 12000);

await test('C1 正式构建（无 SID_TEST）：测试端点不可达，且忽略测试头', async () => {
  for (const p of ['/api/test/state', '/api/test/sessions', '/api/test/advance', '/api/test/streams']) {
    const r = await fetch(BASE_C + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ms":1000}' });
    let body = null; try { body = await r.json(); } catch { }
    assert.ok([404, 405].includes(r.status), `${p} 应为 404/405，实际 ${r.status}`);
    assert.ok(!(body && body.players), `${p} 不得泄露状态`);
    const rg = await fetch(BASE_C + p);
    assert.equal(rg.status, 404, `${p} GET 应为 404，实际 ${rg.status}`);
  }
  const join = await fetch(BASE_C + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"nickname":"甲"}' });
  assert.equal(join.status, 200, '正式构建仍可正常加入');
  const hostSim = await fetch(BASE_C + '/api/host/finish', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sid-Test-Source-Address': '10.0.0.9' }, body: '{}' });
  evidence.push({ tag: 'C1-hostSim', status: hostSim.status, note: '正式构建未启用 SID_DEV，且测试来源头被忽略 -> 主持人管理一律 403' });
  assert.equal(hostSim.status, 403, '正式构建禁用主持人管理，且测试头不能绕过');
});

// ---------------- D 真实浏览器 ----------------
const PORT_D = await freePort();
const BASE_D = `http://127.0.0.1:${PORT_D}`;
const serverD = spawn(NODE, [join(ONLINE, 'server.js')], { env: { ...process.env, PORT: String(PORT_D), SID_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
const logD = []; serverD.stdout.on('data', d => logD.push(String(d))); serverD.stderr.on('data', d => logD.push(String(d)));
await waitFor('server D boot', async () => { try { return (await fetch(BASE_D + '/api/state')).status === 401; } catch { return false; } }, 12000);

class Client {
  constructor(name) { this.name = name; this.n = 0; this.inflight = new Map(); }
  async launch() {
    this.profile = await mkdtemp(join(ONLINE, '../outputs/sid-qa-'));
    this.debugPort = await freePort();
    this.proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
      '--disable-component-update', '--disable-sync', `--remote-debugging-port=${this.debugPort}`, '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${this.profile}`, 'about:blank'], { stdio: 'ignore' });
    let pages = null;
    for (let i = 0; i < 80; i++) { try { pages = await (await fetch(`http://127.0.0.1:${this.debugPort}/json/list`)).json(); if (pages && pages.length) break; } catch { await sleep(75); } }
    if (!pages) throw new Error('Chrome 未启动: ' + this.name);
    this.ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && this.inflight.has(m.id)) { const p = this.inflight.get(m.id); this.inflight.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } };
    await this.send('Runtime.enable'); await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.bringToFront');
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.n;
      const timer = setTimeout(() => { this.inflight.delete(id); reject(new Error('CDP 超时: ' + method)); }, 20000);
      this.inflight.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}));
    return r.result.value;
  }
  key(type, key, code, vk) { return this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) }); }
  async open(nickname) {
    await this.send('Page.navigate', { url: BASE_D + '/' });
    await this.eval(`new Promise(r=>{const f=()=>document.readyState==='complete'?r():setTimeout(f,20);f()})`);
    await this.eval(`new Promise(r=>{let n=0;const f=()=>{const j=document.getElementById('join-page');if(j&&!j.hidden)return r();n++>200?r():setTimeout(f,20)};f()})`);
    const visible = await this.eval(`!!document.getElementById('join-page')&&!document.getElementById('join-page').hidden`);
    if (visible) {
      await this.eval(`(()=>{const i=document.getElementById('nickname');i.value='';i.focus();})()`);
      if (nickname) await this.send('Input.insertText', { text: nickname });
      const pt = await this.eval(`(()=>{const r=document.querySelector('#join-form button[type=submit]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    }
    await this.eval(`new Promise(r=>{let n=0;const f=()=>document.getElementById('join-page')&&document.getElementById('join-page').hidden?r():n++>300?r():setTimeout(f,20);f()})`);
    await sleep(600);
  }
  async close() {
    try { if (this.ws) this.ws.close(); } catch { }
    if (this.proc && this.proc.exitCode === null) { const ex = new Promise(r => this.proc.once('exit', r)); this.proc.kill('SIGKILL'); await Promise.race([ex, sleep(2000)]); }
    // 保留 outputs 下的独立 Chrome profile，不递归删除。
  }
}

let A = null, B = null;
try {
  A = new Client('A'); await A.launch(); await A.open('甲');
  B = new Client('B'); await B.launch(); await B.open('乙');
  const idA = await A.eval(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.id)`);
  const idB = await B.eval(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.id)`);
  assert.notEqual(idA, idB, '两个客户端必须是两个身份');
  const dCall = async (path, opts = {}) => { const r = await fetch(BASE_D + path, opts); let b = null; try { b = await r.json(); } catch { } return { status: r.status, body: b, setCookie: r.headers.get('set-cookie') }; };
  const dPost = (path, body, cookie, extra = {}) => dCall(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie: 'sid_session=' + cookie } : {}), ...extra }, body: JSON.stringify(body || {}) });
  const dGet = (path, cookie, extra = {}) => dCall(path, { headers: { ...(cookie ? { cookie: 'sid_session=' + cookie } : {}), ...extra } });
  const dState = async () => (await dCall('/api/test/state')).body;
  const dPlayer = async id => (await dState()).players.find(p => p.id === id);
  const dSessions = async () => (await dCall('/api/test/sessions')).body.sessions;
  const tokenOf = async id => (await dSessions()).find(s => s.playerId === id).sessionId;
  const extra = await dPost('/api/join', { nickname: '丙' });
  const idC = extra.body.playerId;

  await test('D1 两个真实客户端各自 WASD 移动、镜头横向跟随', async () => {
    for (const [cl, id] of [[A, idA], [B, idB]]) {
      await cl.eval(`document.querySelector('#office').focus()`);
      const before = await dPlayer(id);
      await cl.key('keyDown', 'd', 'KeyD', 68);
      await waitFor(cl.name + ' 移动', async () => (await dPlayer(id)).x > before.x + 8, 8000);
      await cl.key('keyUp', 'd', 'KeyD', 68);
      await sleep(300);
      const after = await dPlayer(id);
      assert.ok(after.x > before.x + 8, `${cl.name} x ${before.x} -> ${after.x}`);
      const coord = await cl.eval(`document.getElementById('coordinate').textContent`);
      assert.equal(Number(coord.slice(1, 2)), Math.min(4, Math.floor(after.x / 960) + 1), '镜头跟随: ' + coord);
    }
  });

  await test('D2 客户端 DOM 泄露扫描：页面源码不含他人完整SID/阵营/血量键', async () => {
    const secrets = (await dState()).players;
    const html = await A.eval(`document.documentElement.innerHTML`);
    for (const s of secrets) {
      if (s.id === idA) continue;
      assert.ok(!html.includes(s.sid), 'DOM 泄露他人完整SID: ' + s.sid);
    }
    assert.ok(!/faction|"hp"|skills/i.test(html), 'DOM 含阵营/血量/技能键');
    const store = await A.eval(`({token:localStorage.getItem('sid_session_token'),lan:localStorage.getItem('sid_lan')})`);
    evidence.push({ tag: 'D2', tokenInLocalStorage: !!store.token, note: '会话凭证明文落在 localStorage（同源脚本可读；HttpOnly cookie 之外的第二条通道）' });
    assert.ok(store.token, '凭证确实写在 localStorage（风险项）');
  });

  await test('D3 名单搜索只消费 public：自己未公开隐藏属性搜不到自己，公开后才命中', async () => {
    const tokenA = await tokenOf(idA);
    const mine = (await dGet('/api/state', tokenA)).body.me;
    const traitValue = Object.values(mine.traits)[0];
    const search = async q => A.eval(`(()=>{const s=document.getElementById('search');s.value=${JSON.stringify(q)};s.dispatchEvent(new Event('input'));return [...document.querySelectorAll('#roster-items [data-player]')].map(e=>+e.dataset.player)})()`);
    await A.eval(`document.getElementById('roster-toggle').click()`);
    await sleep(300);
    await search('');
    const before = await search(traitValue);
    assert.ok(!before.includes(idA), '未公开隐藏属性不得命中自己: ' + JSON.stringify(before));
    const masked = await search('***');
    assert.equal(masked.length, 0, '*** 不得命中: ' + JSON.stringify(masked));
    const byName = await search('甲');
    assert.ok(byName.includes(idA), '姓名应命中自己: ' + JSON.stringify(byName));
    const tokenB = await tokenOf(idB);
    const res = await dPost('/api/skill', { commandId: uid(), skill: 'probe', targetId: idA }, null, { 'X-Sid-Session': tokenB });
    assert.equal(res.body.ok, true, JSON.stringify(res.body));
    await sleep(700);
    const after = await search(traitValue);
    evidence.push({ tag: 'D3', traitValue, before, after });
    assert.ok(after.includes(idA), '公开后应命中自己: ' + JSON.stringify(after));
  });

  await test('D4 在线状态对外可见：名单出现「离线」标签（与自述「不出现上下线字样」口径冲突）', async () => {
    const tokenC = await tokenOf(idC);
    const ctrl = new AbortController();
    const s = await fetch(BASE_D + '/api/stream', { headers: { cookie: 'sid_session=' + tokenC }, signal: ctrl.signal });
    await s.body.getReader().read(); ctrl.abort();
    await waitFor('目标离线', async () => (await dPlayer(idC)).online === false, 6000);
    await A.eval(`(()=>{const r=document.getElementById('roster');if(r.hidden)document.getElementById('roster-toggle').click();
      const s=document.getElementById('search');s.value='';s.dispatchEvent(new Event('input'));})()`);
    await sleep(700);
    const roster = await A.eval(`(()=>{const box=document.getElementById('roster-items');return {text:box.textContent,tags:[...box.querySelectorAll('.offline-tag')].map(e=>e.textContent)}})()`);
    const snapshot = (await dGet('/api/state', await tokenOf(idA))).body;
    evidence.push({
      tag: 'D4', offlineTags: roster.tags, rosterHasOfflineWord: /离线/.test(roster.text),
      publicOnlineField: snapshot.players.map(p => ({ id: p.id, online: p.online })),
      note: 'publicProjection 下发 online 字段；名单渲染 .offline-tag，画布名牌按 online 追加「· 离线」并降低不透明度'
    });
    assert.ok(/离线/.test(roster.text), '名单确实出现「离线」字样（口径冲突，见报告）');
  });

  await test('D5 公共日志渲染：无禁词，但条目的主语/目标是玩家姓名', async () => {
    await A.eval(`document.getElementById('log-toggle').click()`);
    await sleep(300);
    const logs = await A.eval(`document.getElementById('log-items').textContent`);
    const items = await A.eval(`[...document.querySelectorAll('#log-items li p')].map(e=>e.textContent)`);
    evidence.push({ tag: 'D5', items: items.slice(0, 6) });
    assert.ok(!/上线|下线|离线|在线状态|操作者/.test(logs), '日志出现禁词: ' + logs);
    assert.ok(items.some(t => /被指认一次|已公开|加入了办公室/.test(t)), '日志内容: ' + JSON.stringify(items.slice(0, 3)));
  });

  await test('D6 昵称 HTML：名单按字面文本渲染，<script>/<i>x</i> 不注入标签也不吞后续名单', async () => {
    await dPost('/api/join', { nickname: '<i>x</i>' });
    await dPost('/api/join', { nickname: '<script>' });
    await dPost('/api/join', { nickname: '正常名' });
    const names = (await dState()).players.map(p => p.name);
    assert.ok(names.includes('<i>x</i>'), '未转义昵称入库: ' + JSON.stringify(names));
    assert.ok(names.includes('<script>'), 'script 昵称入库');
    await A.eval(`(()=>{const r=document.getElementById('roster');if(r.hidden)document.getElementById('roster-toggle').click();const s=document.getElementById('search');s.value='';s.dispatchEvent(new Event('input'));})()`);
    await sleep(800);
    const probe = await A.eval(`(()=>{const box=document.getElementById('roster-items');
      return {rows:box.querySelectorAll('[data-player]').length, italic:box.querySelectorAll('i:not(.swatch)').length, script:box.querySelectorAll('script').length, xss:!!window.__xss, names:[...box.querySelectorAll('strong')].map(x=>x.textContent), text:box.textContent.slice(0,120)}})()`);
    evidence.push({ tag: 'D6', ...probe, totalPlayers: names.length, serverNames: names });
    assert.equal(probe.xss, false, '未观测到 JS 执行');
    assert.equal(probe.script, 0, '昵称不得作为 <script> 注入');
    assert.equal(probe.italic, 0, '昵称不得作为 <i> 注入');
    assert.equal(probe.rows, names.length, `名单不被吞：渲染 ${probe.rows} / 实际 ${names.length}`);
    for (const n of ['<i>x</i>', '<script>', '正常名']) assert.ok(probe.names.includes(n), '名单应含字面昵称: ' + n);
  });

  const perf = async cl => cl.eval(`new Promise(resolve=>{const d=[];let last=performance.now(),n=0;
    const tick=now=>{d.push(now-last);last=now;if(++n<180)requestAnimationFrame(tick);else{d.sort((a,b)=>a-b);resolve({frames:d.length,p50:d[Math.floor(d.length*0.5)],p95:d[Math.floor(d.length*0.95)],max:d[d.length-1]})}};
    requestAnimationFrame(tick)})`);
  const perfA = await perf(A), perfB = await perf(B);
  results.push({ name: 'D7 客户端 rAF 帧间隔（A/B 各180帧，仅客户端渲染）', pass: true, A: perfA, B: perfB });
  console.log('PERF A', perfA, 'B', perfB);
} catch (error) {
  results.push({ name: 'D 浏览器阶段致命错误', pass: false, error: String(error && error.message || error) });
  console.error('BROWSER SECTION ERROR', error);
} finally {
  if (A) await A.close();
  if (B) await B.close();
}

const passed = results.filter(r => r.pass).length;
await writeFile(join(ONLINE, 'qa-report.json'), JSON.stringify({
  date: new Date().toISOString(),
  engine: '受管 Node 服务 + room.js 模块级直跑 + fetch HTTP + 2 个真实 headless Chrome（CDP），loopback HTTP',
  ports: { httpSidTest: PORT_B, httpNormalBuild: PORT_C, browser: PORT_D },
  judge,
  summary: { passed, failed: results.length - passed, total: results.length },
  results,
  evidence,
  serverLogs: { B: logB.join('').split('\n').filter(Boolean).slice(0, 5), C: logC.join('').split('\n').filter(Boolean).slice(0, 3), D: logD.join('').split('\n').filter(Boolean).slice(0, 5) },
  limitations: [
    '物理断网/断电/休眠未测；离线由真实关闭 SSE 连接（fetch abort）触发，未强杀整机进程',
    'Safari / Firefox / 移动端浏览器未测，本轮只覆盖系统 Chrome headless',
    '主持人 403 由 SID_TEST 专用请求头模拟非 loopback 源，未使用第二台物理机器与真实跨机局域网',
    '性能只采样客户端 rAF 帧间隔，不含服务端 tick、SSE 传输与 GPU 呈现，不能宣称整机稳定帧率',
    '高 DPI、真实路由器隔离、跨网段与同事真机可达性未测',
    '长周期充能恢复由 clockOffset 推进模拟，未做 >10 分钟真实时钟观测',
    '碰撞判定 oracle 与服务端共用 WORLD 常量与同一 AABB 公式，属同口径复核，不是独立几何实现'
  ]
}, null, 2));
console.log(JSON.stringify({ passed, failed: results.length - passed, total: results.length }));
for (const s of [serverB, serverC, serverD]) { try { if (s && s.exitCode === null) s.kill('SIGTERM'); } catch { } }
await sleep(400);
process.exit(results.some(r => !r.pass) ? 1 : 0);
