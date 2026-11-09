// 进度机制回归（积分/休战改版）：转盘每日免费随机积分、全行为计分、结束方式与排名。
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
const blank = () => ({ chips: undefined, clues: [], searched: [] }); // chips 已随金币移除
let sequence = 0, passed = 0, failed = 0;
const nonce = () => `progression-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}
function fixture(count = 3, options = {}) {
  // random 固定：首位为坏人，其余为好人（确定性阵营夹具）。
  const r = createRoom({ random: () => 0.99, ...options });
  for (let i = 0; i < count; i++) r.join(`session-${i}`, `玩家${i}`);
  return r;
}
// dev 新增 floorGuard：交互/小游戏指令须带 roundId 与本人 floorRevision。
const guard = (r, p) => ({ roundId: r.room.roundId, expectedFloorRevision: p.floorRevision });
const search = (r, p, c, extra = {}) => { p.x = c.x; p.y = c.y; return r.interact(p.sessionId, { commandId: nonce(), kind: 'search', entityId: c.id, ...guard(r, p), ...extra }); };
const wheel = (r, p, entity = npc) => { p.x = entity.x; p.y = entity.y; return r.play(p.sessionId, { commandId: nonce(), kind: 'wheel', entityId: entity.id, ...guard(r, p) }); };

await test('WORLD 新常量与函数：浏览器脚本与 CommonJS 双载、无 import/export', async () => {
  // 合并适配：world 已拆成 shared/world/* + 聚合器；加载契约检查统一读拼接源码（顺序同 index.html）。
  const source = await readWorldSource();
  assert.ok(!/^\s*(import|export)\s/m.test(source));
  for (const sandbox of [{ window: {} }, {}]) {
    runInNewContext(source, sandbox);
    const w = sandbox.window ? sandbox.window.WORLD : sandbox.WORLD;
    assert.equal(w.wheelSpinCost, undefined);
    assert.equal(typeof w.buildWheelPool, 'function');
    assert.equal(w.RULES.endRemainingPlayers, 100);
    assert.equal(w.RULES.timeLimitMs, 2 * 60 * 60 * 1000);
    assert.equal(JSON.stringify(w.SCORE), JSON.stringify(SCORE));
    assert.equal(JSON.stringify(w.EXPLORE), JSON.stringify(WORLD.EXPLORE));
    assert.equal(JSON.stringify(w.COMBAT), JSON.stringify(WORLD.COMBAT));
    assert.equal(w.buildWheelPool('good').length, 10);
    assert.ok(!('wheelRewards' in w.PLAY_CONFIG));
  }
});
await test('转盘：积分改版后免费（无花费函数），每日上限 3 次', () => {
  assert.equal(WORLD.wheelSpinCost, undefined);
  assert.equal(WHEEL.maxDailySpins, 3);
});
await test('buildWheelPool：两阵营十槽全为随机积分，不再有线索券/洗心革面/重生券', () => {
  const good = WORLD.buildWheelPool('good'), bad = WORLD.buildWheelPool('bad');
  for (const pool of [good, bad]) {
    assert.equal(pool.length, WHEEL.slotCount);
    for (const item of pool) {
      assert.equal(item.kind, 'points'); assert.ok(Number.isInteger(item.amount) && item.amount >= 1);
      assert.equal(typeof item.label, 'string'); assert.match(item.label, /积分/);
      assert.match(item.color, /^#[0-9A-Fa-f]{6}$/); assert.ok(item.glyph.length);
    }
    assert.ok(!pool.some(i => ['clue', 'reform', 'rebirth'].includes(i.key)));
  }
  assert.ok(new Set(good.map(i => i.amount)).size > 1, '积分数量应随槽位变化');
  assert.deepEqual(WORLD.buildWheelPool('good'), good); // 顺序确定，可复现
});
await test('转盘：每日3次免费、全楼层共享、积分入账、第4次拒绝且状态不变', () => {
  let draws = 0;
  const r = fixture(3, { randomInt: max => { draws++; return draws % max; } }), p = r.find(1);
  let score = 0;
  for (let i = 1; i <= 3; i++) {
    // 第3次换到另一楼层的 NPC，验证每日次数全楼层共享。
    if (i === 3) p.floorId = WORLD.NPCS[1].floorId;
    const ok = wheel(r, p, i === 3 ? WORLD.NPCS[1] : npc);
    assert.equal(ok.ok, true, `第 ${i} 次转动`); assert.equal(ok.cost, 0); assert.equal(ok.spins, i);
    assert.equal(ok.wheel.slots.length, WHEEL.slotCount); assert.deepEqual(ok.wheel.item, { ...ok.wheel.slots[ok.wheel.slotIndex], kind: 'points' });
    score += ok.wheel.item.amount; assert.equal(p.score, score);
  }
  const fail = wheel(r, p, WORLD.NPCS[1]);
  assert.equal(fail.ok, false); assert.match(fail.error, /上限/); assert.equal(p.score, score); assert.equal(p.games.wheelDailySpins, 3);
});
await test('计分·探索与猜拳：直接积分 +1、答题答对 +2、猜拳胜 +2/负平 0', () => {
  const r = fixture(3, { randomInt: () => 10 });
  const p = r.find(1), q = r.find(2), cs = WORLD.zoneContainers(p.floorId, p.zoneId || null);
  assert.equal(search(r, p, cs[0]).mode, 'points'); assert.equal(p.score, SCORE.exploreDirect);
  const quiz = search(r, p, cs[1], { forceMode: 'quiz' }); assert.equal(quiz.mode, 'quiz');
  const ans = r.room.searchSessions.get(quiz.sessionId).question.answer;
  assert.equal(r.interact(p.sessionId, { kind: 'quizAnswer', sessionId: quiz.sessionId, answer: ans }).correct, true);
  assert.equal(p.score, SCORE.exploreDirect + SCORE.exploreQuiz);
  p.x = 500; p.y = 350; q.x = 520; q.y = 350;
  const pScore = p.score, qScore = q.score;
  // 新协议：邀请不带出拳；被邀请方接受后进入 10 秒选择阶段；双方出拳后到 deadline 才结算计分。
  const settleRps = (from, to, aChoice, bChoice, label) => {
    const fromSession = from.sessionId, toSession = to.sessionId;
    assert.equal(r.play(fromSession, { commandId: nonce(), kind: 'rpsInvite', targetId: to.id, ...guard(r, from) }).ok, true, `${label} 邀请`);
    const cid = r.privateSnapshot(to.id).me.games.rpsPending.id;
    assert.equal(r.play(toSession, { commandId: nonce(), kind: 'rpsReply', challengeId: cid, ...guard(r, to) }).ok, true, `${label} 接受`);
    assert.equal(r.play(fromSession, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: aChoice, revision: 1, ...guard(r, from) }).ok, true, `${label} 发起方出拳`);
    assert.equal(r.play(toSession, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: bChoice, revision: 1, ...guard(r, to) }).ok, true, `${label} 被邀请方出拳`);
    r.room.clockOffset += C.rpsRoundMs + 1; r.step(0);
  };
  settleRps(p, q, 'rock', 'scissors', '第一局');
  assert.equal(p.score, pScore + SCORE.rpsWin); assert.equal(q.score, qScore + SCORE.rpsLose);
  r.room.clockOffset += C.rpsCooldownMs + 1; // 越过 5 秒共享冷却
  settleRps(p, q, 'paper', 'paper', '第二局');
  assert.equal(p.score, pScore + SCORE.rpsWin + SCORE.rpsDraw);
  assert.equal(q.score, qScore + SCORE.rpsLose + SCORE.rpsDraw);
});
await test('计分·攻击与技能：J命中按J渠道随机积分（概率命中+1/未命中0）；指认坏人 +10、刺杀好人 +3、误指认 0 分', () => {
  // J 积分为随机触发（WORLD.ACTION.hammerPointChance，建议值）：注入确定的 randomInt 分别验证命中/未命中。
  for (const [roll, gain] of [[0, WORLD.ACTION.hammerPoint], [9999, 0]]) {
    const r = fixture(3, { randomInt: () => roll });
    for (const x of r.room.players) { x.x = 1500 + x.id * 100; x.y = 350; }
    const a = r.find(1), b = r.find(2); a.x = 500; b.x = 530;
    const aScore = a.score;
    assert.equal(r.attack(a.sessionId, { commandId: nonce(), ...guard(r, a) }).hitId, b.id);
    assert.equal(a.score, aScore + gain); assert.equal(a.exploration.hammerPointsToday, gain);
  }
  assert.equal(SCORE.interactHit, 0, '旧 interactHit 固定分保持 0');

  const s = fixture(3);
  const bad = s.find(0), good = s.find(1), other = s.find(2);
  assert.equal(s.useSkill(bad.sessionId, { commandId: nonce(), skill: 'assassinate', targetId: good.id }).ok, true);
  assert.equal(bad.score, SCORE.assassinateHit); assert.equal(good.hp, 2);
  assert.equal(s.useSkill(other.sessionId, { commandId: nonce(), skill: 'accuse', targetId: bad.id }).ok, true);
  assert.equal(other.score, SCORE.accuseHit); assert.equal(bad.hp, 2);
  assert.equal(s.useSkill(good.sessionId, { commandId: nonce(), skill: 'accuse', targetId: other.id }).ok, true);
  assert.equal(good.score, 0, '误指认不加分'); assert.equal(good.hp, 1, '误指认自扣1格');
  for (const old of ['probe', 'spy', 'kill']) assert.equal(s.useSkill(bad.sessionId, { commandId: nonce(), skill: old, targetId: good.id }).ok, false);
});
await test('计分·只增不改他人', () => {
  const r = fixture(3, { randomInt: () => 10 });
  const p = r.find(1), cs = WORLD.zoneContainers(p.floorId, p.zoneId || null);
  const others = r.room.players.filter(x => x !== p).map(x => x.score);
  assert.equal(search(r, p, cs[0]).ok, true);
  assert.ok(p.score > 0);
  assert.deepEqual(r.room.players.filter(x => x !== p).map(x => x.score), others);
});
await test('结束·默认不因休战人数结束；开启 enableAliveFloor 后达阈值 → aliveFloor 且 ranking 为 null', () => {
  const small = fixture(6);
  for (const id of [1, 2, 3]) { const p = small.find(id); p.hp = 0; p.alive = false; }
  const smallSnap = small.publicSnapshot();
  assert.equal(smallSnap.finished, false); assert.equal(smallSnap.finishReason, null);
  const r = fixture(6, { rules: { enableAliveFloor: true, endRemainingPlayers: 3, timeLimitMs: RULES.timeLimitMs } });
  for (const id of [1, 2, 3]) { const p = r.find(id); p.hp = 0; p.alive = false; }
  const snap = r.publicSnapshot();
  assert.equal(r.room.players.filter(p => p.alive).length, 3);
  assert.equal(snap.finished, true); assert.equal(snap.finishReason, 'aliveFloor'); assert.equal(snap.ranking, null);
});
await test('结束·开启 enableBadWiped 后坏人全部休战 → badWiped 且 ranking 按分数降序（含命中计分）', () => {
  const r = fixture(4, { rules: { enableBadWiped: true } });
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
await test('reset 清空 score/finishReason/ranking/wheelSpins 与每日探索计数', () => {
  const r = fixture(3, { randomInt: () => 2 });
  const p = r.find(0);
  assert.equal(wheel(r, p).ok, true);
  assert.equal(p.games.wheelSpins[npc.id], 1);
  p.score = 7;
  r.room.clockOffset += RULES.timeLimitMs + 1; r.publicSnapshot();
  assert.equal(r.room.finished, true);
  r.reset();
  assert.equal(r.room.finished, false); assert.equal(r.room.finishReason, ''); assert.equal(r.room.ranking, null);
  const fresh = r.join('session-x', '新局').player;
  assert.equal(fresh.score, 0); assert.equal(fresh.hp, 3);
  assert.deepEqual({ chips: fresh.exploration.chips, clues: fresh.exploration.clues, searched: fresh.exploration.searched, exploreCount: fresh.exploration.exploreCount }, { ...blank(), exploreCount: 0 });
  assert.deepEqual(fresh.games.wheelSpins, {}); assert.equal(fresh.games.rpsPending, null);
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
    child.stdout.on('data', data => { output += data; if (output.includes('S-ID 服务已启动')) { clearTimeout(timer); resolve(); } });
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
