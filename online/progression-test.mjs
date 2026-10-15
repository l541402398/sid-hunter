// 进度机制回归：单局连续对局转盘（阶梯收费、可重复、特殊券）、全行为计分、三种结束方式与排名。
// 零依赖：直接 require('./room.js') 构造权威房间；HTTP 段复用 mechanics-test 的 spawn 模式。
import assert from 'node:assert/strict';
import { readWorldSource } from './test-helpers/world-source.mjs';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const { RULES, SCORE, WHEEL, PLAY_CONFIG: C } = WORLD;
const furniture = WORLD.makeFurniture();
const npc = WORLD.NPCS[0];
const byId = id => furniture.find(f => f.id === id);
const blank = () => ({ chips: 0, clues: [], searched: [] });
let sequence = 0, passed = 0, failed = 0;
const nonce = () => `progression-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}
function fixture(count = 3, options = {}) {
  const r = createRoom(options);
  for (let i = 0; i < count; i++) r.join(`session-${i}`, `玩家${i}`);
  return r;
}
function near(p, entity) {
  if (entity.footprint) { p.x = entity.footprint.x + entity.footprint.w / 2; p.y = entity.depth + 12; }
  else { p.x = entity.x; p.y = entity.y; }
}
const search = (r, p, id) => r.interact(p.sessionId, { commandId: nonce(), kind: 'search', entityId: id });
const exchange = (r, p, entity) => r.interact(p.sessionId, { commandId: nonce(), kind: 'exchange', entityId: entity.id });

await test('WORLD 新常量与函数：浏览器脚本与 CommonJS 双载、无 import/export', async () => {
  // 合并适配：world 已拆成 shared/world/* + 聚合器；加载契约检查统一读拼接源码（顺序同 index.html）。
  const source = await readWorldSource();
  assert.ok(!/^\s*(import|export)\s/m.test(source));
  for (const sandbox of [{ window: {} }, {}]) {
    runInNewContext(source, sandbox);
    const w = sandbox.window ? sandbox.window.WORLD : sandbox.WORLD;
    assert.equal(typeof w.wheelSpinCost, 'function');
    assert.equal(typeof w.buildWheelPool, 'function');
    assert.equal(w.RULES.endRemainingPlayers, 100);
    assert.equal(w.RULES.timeLimitMs, 2 * 60 * 60 * 1000);
    assert.equal(JSON.stringify(w.SCORE), JSON.stringify(SCORE));
    assert.equal(w.buildWheelPool('good').length, 10);
    assert.equal(w.wheelSpinCost(3), WHEEL.spinCosts[3]);
    assert.ok(!('wheelRewards' in w.PLAY_CONFIG));
  }
});
await test('wheelSpinCost：首次免费、数组内取值正确、单调不减、超出数组线性外推仍递增', () => {
  assert.equal(WORLD.wheelSpinCost(0), 0);
  assert.equal(WORLD.wheelSpinCost(-3), 0);
  for (let n = 0; n < WHEEL.spinCosts.length; n++) assert.equal(WORLD.wheelSpinCost(n), WHEEL.spinCosts[n], `spinCosts[${n}]`);
  for (let n = 1; n <= 80; n++) assert.ok(WORLD.wheelSpinCost(n) >= WORLD.wheelSpinCost(n - 1), `单调 ${n}`);
  const L = WHEEL.spinCosts.length;
  const last = WHEEL.spinCosts[L - 1], inc = last - WHEEL.spinCosts[L - 2];
  assert.ok(inc > 0);
  assert.equal(WORLD.wheelSpinCost(L), last + inc);
  assert.equal(WORLD.wheelSpinCost(L + 1), last + inc * 2);
  assert.ok(WORLD.wheelSpinCost(L + 5) > WORLD.wheelSpinCost(L + 4));
});
await test('buildWheelPool：good 含 2 张线索券、无 reform/rebirth；bad 含 reform/rebirth、无 clue', () => {
  const good = WORLD.buildWheelPool('good'), bad = WORLD.buildWheelPool('bad');
  assert.equal(good.length, WHEEL.slotCount);
  assert.equal(bad.length, WHEEL.slotCount);
  const specialKeys = pool => pool.filter(i => i.kind === 'special').map(i => i.key);
  assert.deepEqual(specialKeys(good), ['clue', 'clue']);
  assert.equal(specialKeys(good).includes('reform'), false);
  assert.equal(specialKeys(good).includes('rebirth'), false);
  assert.ok(specialKeys(bad).includes('reform') && specialKeys(bad).includes('rebirth'));
  assert.equal(specialKeys(bad).includes('clue'), false);
  const goodChips = good.filter(i => i.kind === 'chips'), badChips = bad.filter(i => i.kind === 'chips');
  assert.equal(goodChips.length, WHEEL.slotCount - WHEEL.specialCount.good);
  assert.equal(badChips.length, WHEEL.slotCount - WHEEL.specialCount.bad);
  for (const item of [...goodChips, ...badChips]) assert.ok(WHEEL.chipAmounts.includes(item.amount), `amount ${item.amount}`);
  assert.ok(new Set([...goodChips, ...badChips].map(i => i.amount)).size > 1, '筹码数量应随槽位变化');
  for (const item of [...good, ...bad]) {
    assert.equal(typeof item.label, 'string'); assert.ok(item.label.length);
    assert.equal(typeof item.color, 'string'); assert.match(item.color, /^#[0-9A-Fa-f]{6}$/);
    assert.equal(typeof item.glyph, 'string'); assert.ok(item.glyph.length);
  }
  assert.deepEqual(WORLD.buildWheelPool('good'), good); // 顺序确定，可复现
});
await test('转盘可重复：阶梯收费、计数递增、slots/slotIndex 结构一致、筹码不足时失败且状态不变', () => {
  let draws = 0;
  const r = fixture(3, { randomInt: max => { assert.equal(max, WHEEL.slotCount); draws++; return 2; } });
  const p = r.find(0); p.x = npc.x; p.y = npc.y; p.exploration.chips = 10;
  let chips = 10;
  for (let spin = 0; spin < 4; spin++) {
    const cost = WORLD.wheelSpinCost(spin);
    const res = r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: npc.id });
    assert.equal(res.ok, true, `第 ${spin + 1} 次转动`);
    assert.equal(res.cost, cost); assert.equal(res.spins, spin + 1);
    assert.equal(res.wheel.slots.length, WHEEL.slotCount);
    assert.ok(res.wheel.slotIndex >= 0 && res.wheel.slotIndex < WHEEL.slotCount);
    assert.deepEqual(res.wheel.item, res.wheel.slots[res.wheel.slotIndex]);
    assert.equal(res.faction, p.faction);
    assert.equal(p.games.wheelSpins[npc.id], spin + 1);
    assert.equal(res.wheel.item.kind, 'chips');
    chips = chips - cost + res.wheel.item.amount;
    assert.equal(p.exploration.chips, chips);
    assert.ok(p.exploration.chips >= 0);
  }
  assert.equal(draws, 4);
  assert.equal(p.score, 0); // wheelPrize 计 0 分
  // 返回对象为深拷贝，篡改不影响服务端状态
  const probe = r.privateSnapshot(p.id).me.games;
  probe.wheelSpins[npc.id] = 999;
  assert.equal(p.games.wheelSpins[npc.id], 4);
  // 筹码不足：失败、不改变任何状态、不消耗指令
  p.exploration.chips = 0;
  const spinsBefore = p.games.wheelSpins[npc.id], scoreBefore = p.score, id = nonce();
  const fail = r.play(p.sessionId, { commandId: id, kind: 'wheel', entityId: npc.id });
  assert.equal(fail.ok, false); assert.match(fail.error, /筹码不足/);
  assert.equal(r.room.processed.has(id), false);
  assert.equal(p.exploration.chips, 0); assert.equal(p.games.wheelSpins[npc.id], spinsBefore); assert.equal(p.score, scoreBefore);
});
await test('特殊券·reform：坏人转好人，洗心革面后坏人全灭 → badWiped 且有排名', () => {
  const r = fixture(3, { randomInt: () => 0 }); // bad 池 slot0 = reform
  const p = r.find(0), decoy = r.find(1);
  decoy.faction = 'bad'; decoy.alive = false; decoy.hp = 0; // 另一名坏人已出局
  p.x = npc.x; p.y = npc.y; p.exploration.chips = 0;
  const res = r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: npc.id });
  assert.equal(res.ok, true); assert.equal(res.wheel.item.key, 'reform');
  assert.equal(p.faction, 'good'); assert.equal(p.hp, 1);
  assert.deepEqual(Object.keys(p.skills).sort(), ['accuse', 'probe']);
  assert.equal(r.room.finished, true); assert.equal(r.room.finishReason, 'badWiped');
  assert.ok(Array.isArray(r.room.ranking) && r.room.ranking.length === 3);
});
await test('特殊券·rebirth：重随机 colors/traits/sid 并重置 traitPublic 与 revealed', () => {
  const r = fixture(3, { randomInt: () => 1 }); // bad 池 slot1 = rebirth
  const p = r.find(0); p.x = npc.x; p.y = npc.y; p.exploration.chips = 0;
  p.colors = { hair: ['旧', '#000000'], top: ['旧', '#000000'], pants: ['旧', '#000000'], shoes: ['旧', '#000000'] };
  p.traits = { saying: '__old__', food: '__old__', sport: '__old__' };
  p.sid = { segments: ['~~~', '~~~', '~~~'], revealed: [true, true, true] };
  p.traitPublic = { saying: true, food: true, sport: true };
  const res = r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: npc.id });
  assert.equal(res.ok, true); assert.equal(res.wheel.item.key, 'rebirth');
  assert.notEqual(p.colors.hair[0], '旧'); assert.notEqual(p.traits.saying, '__old__'); assert.notEqual(p.sid.segments[0], '~~~');
  assert.deepEqual(p.traitPublic, { saying: false, food: false, sport: false });
  assert.deepEqual(p.sid.revealed, [false, false, false]);
  assert.equal(p.sid.segments.length, 3);
  assert.ok(r.publicSnapshot().logs.some(l => l.text.includes('身份特征被重新随机')));
});
await test('特殊券·clue：给到一条关于坏人的私密线索，进入本人 clues 且不进入公开投影', () => {
  const r = fixture(3, { randomInt: () => 0 }); // good 池 slot0 = clue
  const p = r.find(1); // 好人
  assert.equal(p.faction, 'good');
  p.x = npc.x; p.y = npc.y; p.exploration.chips = 0;
  const publicBefore = JSON.stringify(r.publicSnapshot());
  const res = r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: npc.id });
  assert.equal(res.ok, true); assert.equal(res.wheel.item.key, 'clue');
  assert.equal(p.exploration.clues.length, 1);
  const clue = p.exploration.clues[0];
  assert.equal(clue.targetId, r.find(0).id); assert.equal(r.find(0).faction, 'bad');
  assert.equal(clue.source, '转盘·线索券');
  assert.ok(clue.text.includes(clue.value));
  assert.ok(!('clues' in r.publicProjection(p)));
  for (const visible of r.publicSnapshot().players) assert.ok(!('exploration' in visible));
  assert.ok(!JSON.stringify(r.publicSnapshot()).includes(clue.value) || r.find(0).traitPublic[clue.key]);
});
await test('计分·探索与猜拳：搜索 +2、线索 +2、兑换 +1/+2、猜拳胜/负/平局', () => {
  const r = fixture(3);
  const p = r.find(1), q = r.find(2);
  near(p, byId('desk-1035-172'));
  assert.equal(search(r, p, 'desk-1035-172').ok, true);
  assert.equal(p.score, SCORE.search);
  near(p, byId('cabinet-785-160'));
  assert.equal(search(r, p, 'cabinet-785-160').ok, true);
  assert.equal(p.score, SCORE.search * 2 + SCORE.clue);
  p.exploration.chips = 20; near(p, npc);
  const beforeExchange = p.score;
  assert.equal(exchange(r, p, npc).ok, true);
  assert.equal(p.score, beforeExchange + SCORE.exchange + SCORE.clue);
  p.x = 500; p.y = 350; q.x = 520; q.y = 350; p.exploration.chips = 5; q.exploration.chips = 5;
  const pScore = p.score, qScore = q.score;
  // 新协议：邀请不带出拳；被邀请方接受后进入 10 秒选择阶段；双方出拳后到 deadline 才结算计分。
  const settleRps = (from, to, aChoice, bChoice, label) => {
    const fromSession = from.sessionId, toSession = to.sessionId;
    assert.equal(r.play(fromSession, { commandId: nonce(), kind: 'rpsInvite', targetId: to.id }).ok, true, `${label} 邀请`);
    const cid = r.privateSnapshot(to.id).me.games.rpsPending.id;
    assert.equal(r.play(toSession, { commandId: nonce(), kind: 'rpsReply', challengeId: cid }).ok, true, `${label} 接受`);
    assert.equal(r.play(fromSession, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: aChoice, revision: 1 }).ok, true, `${label} 发起方出拳`);
    assert.equal(r.play(toSession, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: bChoice, revision: 1 }).ok, true, `${label} 被邀请方出拳`);
    r.room.clockOffset += C.rpsRoundMs + 1; r.step(0);
  };
  settleRps(p, q, 'rock', 'scissors', '第一局');
  assert.equal(p.score, pScore + SCORE.rpsWin); assert.equal(q.score, qScore + SCORE.rpsLose);
  r.room.clockOffset += C.rpsCooldownMs + 1; // 越过 5 秒共享冷却
  settleRps(p, q, 'paper', 'paper', '第二局');
  assert.equal(p.score, pScore + SCORE.rpsWin + SCORE.rpsDraw);
  assert.equal(q.score, qScore + SCORE.rpsLose + SCORE.rpsDraw);
});
await test('计分·攻击与技能：J 命中 +1、空挥 0；probe +3、spy +2、accuse 命中 +8、kill +10', () => {
  const r = fixture(3);
  for (const x of r.room.players) { x.x = 1500 + x.id * 100; x.y = 350; }
  const a = r.find(1), b = r.find(2); a.x = 500; b.x = 530;
  const aScore = a.score;
  assert.equal(r.attack(a.sessionId, { commandId: nonce() }).hitId, b.id);
  assert.equal(a.score, aScore + SCORE.interactHit);
  r.room.clockOffset += 12001; b.x = 2000;
  assert.equal(r.attack(a.sessionId, { commandId: nonce() }).hitId, undefined);
  assert.equal(a.score, aScore + SCORE.interactHit); // 空挥不加分

  const s = fixture(3);
  const bad = s.find(0), good = s.find(1);
  assert.equal(s.useSkill(bad.sessionId, { commandId: nonce(), skill: 'probe', targetId: good.id }).ok, true);
  assert.equal(bad.score, SCORE.probe);
  assert.equal(s.useSkill(bad.sessionId, { commandId: nonce(), skill: 'spy', targetId: good.id }).ok, true);
  assert.equal(bad.score, SCORE.probe + SCORE.spy);
  assert.equal(s.useSkill(s.find(2).sessionId, { commandId: nonce(), skill: 'accuse', targetId: bad.id }).ok, true);
  assert.equal(s.find(2).score, SCORE.accuseHit); assert.equal(bad.hp, 1); // 未淘汰

  const k = fixture(3);
  const killer = k.find(0), victim = k.find(1);
  assert.equal(k.useSkill(killer.sessionId, { commandId: nonce(), skill: 'kill', targetId: victim.id, sid: victim.sid.segments.join('-') }).ok, true);
  assert.equal(killer.score, SCORE.kill); assert.equal(victim.alive, false);
});
await test('计分·只增不改他人', () => {
  const r = fixture(3);
  const p = r.find(1);
  const others = r.room.players.filter(x => x !== p).map(x => x.score);
  near(p, byId('desk-1035-172'));
  assert.equal(search(r, p, 'desk-1035-172').ok, true);
  assert.ok(p.score > 0);
  assert.deepEqual(r.room.players.filter(x => x !== p).map(x => x.score), others);
});
await test('结束·存活淘汰至阈值 → aliveFloor 且 ranking 为 null；小房间不会开局即结束', () => {
  const small = fixture(6);
  const smallSnap = small.publicSnapshot();
  assert.equal(smallSnap.finished, false); assert.equal(smallSnap.finishReason, null);
  const r = fixture(6, { rules: { endRemainingPlayers: 3, timeLimitMs: RULES.timeLimitMs } });
  for (const id of [1, 2, 3]) { const p = r.find(id); p.hp = 0; p.alive = false; }
  const snap = r.publicSnapshot();
  assert.equal(r.room.players.filter(p => p.alive).length, 3);
  assert.equal(snap.finished, true); assert.equal(snap.finishReason, 'aliveFloor'); assert.equal(snap.ranking, null);
});
await test('结束·坏人全灭 → badWiped 且 ranking 按分数降序（含命中计分）', () => {
  const r = fixture(4);
  const bad = r.find(0), hitter = r.find(1);
  bad.hp = 1;
  hitter.score = 5; r.find(2).score = 9; r.find(3).score = 1;
  assert.equal(r.useSkill(hitter.sessionId, { commandId: nonce(), skill: 'accuse', targetId: bad.id }).ok, true);
  assert.equal(r.room.finished, true); assert.equal(r.room.finishReason, 'badWiped'); assert.equal(bad.alive, false);
  const ranking = r.room.ranking;
  assert.ok(Array.isArray(ranking) && ranking.length === 4);
  for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].score >= ranking[i].score, `降序 ${i}`);
  assert.equal(ranking[0].rank, 1);
  assert.equal(ranking.find(e => e.id === hitter.id).score, 5 + SCORE.accuseHit);
});
await test('结束·时间到 → timeUp 且有 ranking', () => {
  const r = fixture(3);
  assert.equal(r.publicSnapshot().finished, false);
  r.room.clockOffset += RULES.timeLimitMs + 1;
  const snap = r.publicSnapshot();
  assert.equal(snap.finished, true); assert.equal(snap.finishReason, 'timeUp');
  assert.ok(Array.isArray(snap.ranking) && snap.ranking.length === 3);
  for (let i = 1; i < snap.ranking.length; i++) assert.ok(snap.ranking[i - 1].score >= snap.ranking[i].score);
});
await test('reset 清空 score/finishReason/ranking/wheelSpins', () => {
  const r = fixture(3, { randomInt: () => 2 });
  const p = r.find(0); p.x = npc.x; p.y = npc.y; p.exploration.chips = 5;
  assert.equal(r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: npc.id }).ok, true);
  assert.equal(p.games.wheelSpins[npc.id], 1);
  p.score = 7;
  r.room.clockOffset += RULES.timeLimitMs + 1; r.publicSnapshot();
  assert.equal(r.room.finished, true);
  r.reset();
  assert.equal(r.room.finished, false); assert.equal(r.room.finishReason, ''); assert.equal(r.room.ranking, null);
  const fresh = r.join('session-x', '新局').player;
  assert.equal(fresh.score, 0);
  assert.deepEqual(fresh.exploration, blank());
  assert.deepEqual(fresh.games, { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '', rpsResult: null });
});

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
let child, base, output = '';
async function request(path, { token, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Sid-Session': token } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
  return { status: response.status, data: await response.json() };
}
try {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DEV: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时\n${output}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`服务退出${code}\n${output}`)); });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => { output += data; if (output.includes('技能次数恢复周期:')) { clearTimeout(timer); resolve(); } });
  });
  await test('HTTP·/api/test/state 暴露 score/finishReason/ranking/rules，公开 state 也带 score 与规则', async () => {
    const joined = await request('/api/join', { body: { nickname: '进度甲' } });
    assert.equal(joined.data.ok, true);
    const st = await request('/api/test/state');
    assert.equal(st.status, 200); assert.equal(st.data.ok, true);
    assert.ok(st.data.players.length >= 1);
    for (const p of st.data.players) assert.equal(typeof p.score, 'number');
    assert.equal(st.data.finishReason, null); assert.equal(st.data.ranking, null);
    assert.equal(st.data.rules.endRemainingPlayers, RULES.endRemainingPlayers);
    assert.equal(st.data.rules.timeLimitMs, RULES.timeLimitMs);
    assert.equal(typeof st.data.rules.endsAt, 'number');
    const pub = await request('/api/state', { token: joined.data.sessionToken });
    assert.equal(pub.status, 200);
    assert.equal(typeof pub.data.players[0].score, 'number');
    assert.equal(pub.data.rules.timeLimitMs, RULES.timeLimitMs);
    assert.equal(pub.data.finishReason, null);
  });
} catch (error) { failed++; console.error(`HTTP 初始化或流程失败\n${error.stack}\n${output}`); }
finally {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
console.log(`进度机制回归：${passed}项通过，${failed}项失败；HTTP子进程已关闭。`);
if (failed) process.exitCode = 1;
