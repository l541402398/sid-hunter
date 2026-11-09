// 积分/休战改版：探索、答题、NPC 福利解锁、J 挥锤积分的轻量进程内回归（不启动 HTTP/浏览器）。
// 取代 exploration-test.mjs 中依赖旧家具坐标/金币兑换线索的规则断言。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const { migrateLegacyEconomy } = require('./room/index.js');

let seq = 0, passed = 0, failed = 0;
const nid = () => `pe-${++seq}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (e) { failed++; console.error(`失败 ${name}\n${e.stack}`); }
}
// rolls：依次返回的随机整数（用尽后返回 50 → 答题）；首位玩家为坏人，其余为好人。
function fixture({ rolls = [], n = 3, rules } = {}) {
  const queue = rolls.slice();
  const r = createRoom({ random: () => 0.99, randomInt: max => (queue.length ? queue.shift() : 50) % max, ...(rules ? { rules } : {}) });
  for (let i = 0; i < n; i++) r.join(`s${i}`, `P${i}`);
  return r;
}
const containersFor = p => WORLD.zoneContainers(p.floorId, p.zoneId || null);
function open(r, p, c, extra = {}) {
  p.x = c.x; p.y = c.y;
  return r.interact(p.sessionId, { commandId: nid(), kind: 'search', entityId: c.id,
    roundId: r.room.roundId, expectedFloorRevision: p.floorRevision, ...extra });
}
function claim(r, p, effect, extra = {}) {
  const npc = WORLD.NPCS.find(n => n.floorId === p.floorId);
  p.x = npc.x; p.y = npc.y;
  return r.interact(p.sessionId, { commandId: nid(), kind: 'exchange', entityId: npc.id, effect,
    roundId: r.room.roundId, expectedFloorRevision: p.floorRevision, ...extra });
}
const quizAnswer = (r, sessionId) => r.room.searchSessions.get(sessionId).question.answer;

await test('配置：空箱5%/积分15%/答题80%，直接+1、答题+2', () => {
  assert.deepEqual({ ...WORLD.EXPLORE }, { emptyChance: 5, pointsChance: 15, quizChance: 80, directPoints: 1, quizPoints: 2 });
  assert.equal(WORLD.SCORE.exploreDirect, 1); assert.equal(WORLD.SCORE.exploreQuiz, 2);
  assert.equal(WORLD.SCORE.firstSearch, 0); assert.equal(WORLD.SCORE.firstMinigame, 0);
});

await test('按概率区间开箱：0-4空箱、5-19直接积分、20-99答题；同一容器只能开一次', () => {
  const r = fixture({ rolls: [4, 5, 19, 20] }), p = r.find(1), cs = containersFor(p);
  assert.ok(cs.length >= 4);
  const empty = open(r, p, cs[0]);
  assert.equal(empty.mode, 'empty'); assert.equal(p.score, 0); assert.equal(p.exploration.exploreCount, 1);
  const pts = open(r, p, cs[1]);
  assert.equal(pts.mode, 'points'); assert.equal(pts.gained.points, 1); assert.equal(p.score, 1); assert.equal(p.exploration.exploreCount, 2);
  assert.equal(open(r, p, cs[2]).mode, 'points'); assert.equal(p.score, 2);
  const quiz = open(r, p, cs[3]);
  assert.equal(quiz.mode, 'quiz'); assert.equal(p.exploration.exploreCount, 3, '答题箱提交前不计探索');
  assert.ok(!('answer' in quiz.quiz), '题目不下发答案');
  const again = open(r, p, cs[0]); assert.equal(again.ok, false); assert.match(again.error, /已经搜索过/);
  assert.ok(!('chips' in p.exploration), '金币余额字段已移除，不再产出金币');
});

await test('答题：无效答案不计数；提交后计探索，答对+2、答错0；会话只能提交一次', () => {
  const r = fixture(), p = r.find(1), cs = containersFor(p);
  const q1 = open(r, p, cs[0]); assert.equal(q1.mode, 'quiz');
  const invalid = r.interact(p.sessionId, { kind: 'quizAnswer', sessionId: q1.sessionId, answer: '' });
  assert.equal(invalid.ok, false); assert.equal(p.exploration.exploreCount, 0);
  const right = r.interact(p.sessionId, { kind: 'quizAnswer', sessionId: q1.sessionId, answer: quizAnswer(r, q1.sessionId) });
  assert.equal(right.ok, true); assert.equal(right.correct, true); assert.equal(right.gained.points, 2);
  assert.equal(p.score, 2); assert.equal(p.exploration.exploreCount, 1);
  assert.equal(r.interact(p.sessionId, { kind: 'quizAnswer', sessionId: q1.sessionId, answer: 'A' }).ok, false);
  const q2 = open(r, p, cs[1]); const s = r.room.searchSessions.get(q2.sessionId).question;
  const wrong = s.type === 'judge' ? (s.answer === 'T' ? 'F' : 'T')
    : ['A', 'B', 'C', 'D'].find(x => x !== String(s.answer).slice(0, 1) && !String(s.answer).includes(x));
  const res = r.interact(p.sessionId, { kind: 'quizAnswer', sessionId: q2.sessionId, answer: wrong });
  assert.equal(res.ok, true); assert.equal(res.correct, false); assert.equal(p.score, 2); assert.equal(p.exploration.exploreCount, 2, '答错也计探索');
});

await test('NPC 福利按探索数量解锁（5/10/15/20/25）、免费、每类每日一次', () => {
  const r = fixture({ rolls: Array(20).fill(10) }), p = r.find(1), cs = containersFor(p);
  assert.deepEqual(WORLD.NPC_EXCHANGE_LIST.map(d => [d.key, d.unlockAt]),
    [['score', 5], ['revealRandomTrait', 10], ['revealTargetTrait', 15], ['hideOwnTrait', 20], ['hideBadClue', 25]]);
  for (let i = 0; i < 4; i++) assert.equal(open(r, p, cs[i]).mode, 'points');
  const locked = claim(r, p, 'score'); assert.equal(locked.ok, false); assert.match(locked.error, /需探索 5/);
  assert.equal(locked.npcExchange.effects.find(e => e.key === 'score').unlocked, false);
  open(r, p, cs[4]); assert.equal(p.exploration.exploreCount, 5);
  const before = p.score, ok = claim(r, p, 'score');
  assert.equal(ok.ok, true); assert.equal(ok.cost, 0); assert.equal(p.score, before + 10);
  const twice = claim(r, p, 'score'); assert.equal(twice.ok, false); assert.match(twice.error, /今日已领取/);
  assert.equal(claim(r, p, 'revealRandomTrait').ok, false, '10 档未解锁');
});

await test('跨日：探索次数/已开容器/福利/转盘/J与小游戏额度重置，积分保留', () => {
  // 场次时长放宽到 3 天，避免 2 小时 timeUp 先结束本局。
  const r = fixture({ rolls: Array(10).fill(10), rules: { timeLimitMs: 3 * 86400000 } }), p = r.find(1), cs = containersFor(p);
  for (let i = 0; i < 5; i++) open(r, p, cs[i]);
  assert.equal(claim(r, p, 'score').ok, true);
  p.exploration.hammerPointsToday = 7; p.exploration.minigamePointsToday = 6; p.games.wheelDailySpins = 3;
  const score = p.score;
  r.room.clockOffset += 24 * 3600 * 1000;
  r.privateSnapshot(p.id);
  assert.equal(p.exploration.exploreCount, 0); assert.deepEqual(p.exploration.searched, []);
  assert.deepEqual(p.exploration.exchangedToday, {}); assert.equal(p.exploration.hammerPointsToday, 0);
  assert.equal(p.exploration.minigamePointsToday, 0); assert.equal(p.games.wheelDailySpins, 0);
  assert.ok(p.score >= score, '积分跨日保留（存活积分会继续累加）');
  assert.equal(open(r, p, cs[0]).ok, true, '新的一天可再次开启同一容器');
});

await test('J 挥锤：命中按概率得积分，同一目标每日≤2，渠道每日≤10，不扣对抗生命', () => {
  const r = fixture({ rolls: Array(200).fill(0), n: 8 }), a = r.find(1);
  for (const q of r.room.players) { q.x = a.x + 2000; q.y = a.y; }
  const others = r.room.players.filter(q => q.id !== a.id);
  const swing = () => { r.room.clockOffset += WORLD.ACTION.hammerCooldownMs + 1; return r.performAction(a.id, 'hammer'); };
  const t1 = others[0]; t1.x = a.x + 10; t1.y = a.y;
  const got = [swing(), swing(), swing()].map(x => x.points);
  assert.deepEqual(got, [1, 1, 0], '同一目标每日最多2分'); assert.equal(t1.hp, 3);
  t1.x = a.x + 2000;
  for (const q of others.slice(1)) { q.x = a.x + 10; swing(); swing(); swing(); q.x = a.x + 2000; }
  assert.equal(a.exploration.hammerPointsToday, 10, '渠道日上限10'); assert.equal(a.score, 10);
  const miss = fixture({ rolls: Array(10).fill(9999) }), m = miss.find(1), mt = miss.find(2);
  for (const q of miss.room.players) { q.x = m.x + 2000; } mt.x = m.x + 10; mt.y = m.y;
  const res = miss.performAction(m.id, 'hammer');
  assert.equal(res.hit, true); assert.equal(res.points, 0, '概率未命中不得分');
  assert.equal(miss.performAction(m.id, 'scare').ok, false, '吓人已移除');
});

await test('休战玩家：可探索、答题、领福利、J挥锤、转盘；不可使用对抗技能', () => {
  const r = fixture({ rolls: Array(30).fill(10) }), bad = r.find(0), good = r.find(1), cs = containersFor(bad);
  bad.hp = 1;
  assert.equal(r.useSkill(good.sessionId, { commandId: nid(), skill: 'accuse', targetId: bad.id }).ok, true);
  assert.equal(bad.alive, false);
  for (let i = 0; i < 5; i++) assert.equal(open(r, bad, cs[i]).ok, true);
  assert.equal(claim(r, bad, 'score').ok, true);
  good.x = bad.x + 10; good.y = bad.y;
  assert.equal(r.performAction(bad.id, 'hammer').hit, true);
  const npc = WORLD.NPCS.find(n => n.floorId === bad.floorId); bad.x = npc.x; bad.y = npc.y;
  assert.equal(r.play(bad.sessionId, { commandId: nid(), kind: 'wheel', entityId: npc.id, roundId: r.room.roundId, expectedFloorRevision: bad.floorRevision }).ok, true);
  assert.equal(r.useSkill(bad.sessionId, { commandId: nid(), skill: 'assassinate', targetId: good.id }).ok, false);
});

await test('旧存档迁移：金币余额/道具/buff 被丢弃，积分保留，恢复后不崩溃', () => {
  const src = fixture({ n: 2 }), legacy = JSON.parse(JSON.stringify(src.room.players));
  legacy[0].score = 7;
  Object.assign(legacy[0].exploration, { chips: 42, items: { gold: 2 }, backpack: [{ key: 'gold' }] });
  legacy[0].buffs = { speedUntil: Date.now() + 60_000, shieldUntil: 0, focusNext: true };
  delete legacy[1].exploration.clues; delete legacy[1].exploration.searched;
  const r = createRoom({ random: () => 0.99, restore: { players: legacy, sessions: [], roundId: src.room.roundId } });
  const p0 = r.find(0), p1 = r.find(1);
  assert.equal(p0.score, 7);
  for (const k of ['chips', 'items', 'backpack']) assert.ok(!(k in p0.exploration), k);
  assert.ok(!('buffs' in p0));
  assert.deepEqual(p1.exploration.clues, []); assert.deepEqual(p1.exploration.searched, []);
  const me = r.privateProjection(p0);
  for (const k of ['backpack', 'items', 'buffs', 'passive']) assert.ok(!(k in me), `private ${k}`);
  assert.ok(!('chips' in me.exploration));
  assert.equal(migrateLegacyEconomy(migrateLegacyEconomy(p0)), p0, '幂等');
});

console.log(`积分探索测试：${passed} 项通过，${failed} 项失败`);
process.exitCode = failed ? 1 : 0;
