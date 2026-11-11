// 权威状态回归：公开生命、匿名受击、真正随机阵营、原题续答与真实 SQLite 重启防重。
// 仅进程内运行，不启动服务器；数据库位于临时 outputs 子目录。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const { createActivity, TEMPLATES, at } = require('./server/activity.js');
const { createStore } = require('./server/store.js');
const clone = value => JSON.parse(JSON.stringify(value));
const originalNow = Date.now;
let clock = at('2026-11-11', '10:00'), passed = 0, failed = 0;
Date.now = () => clock;
function test(name, run) {
  try { run(); passed++; console.log('PASS', name); }
  catch (error) { failed++; console.error('FAIL', name, error.stack); }
}
function factionDraw(values) {
  let index = 0;
  return () => values[index++] ?? .99;
}
function skill(room, actor, target) {
  return room.useSkill(actor.sessionId, { commandId: randomUUID(), skill: 'action', targetId: target.id });
}
function search(room, actor, container, extra = {}) {
  actor.x = container.x; actor.y = container.y;
  return room.searchStart(actor.sessionId, {
    commandId: randomUUID(), containerId: container.id,
    roundId: room.room.roundId, expectedFloorRevision: actor.floorRevision, forceMode: 'quiz', ...extra
  });
}
function memory() {
  let state = null;
  return { enabled: true, fail: false, loadAdmin() { return state && clone(state); }, loadSessions() { return []; },
    saveAdmin(value) { if (this.fail) return false; state = clone(value); return true; } };
}
function managedRoom(store, prior = null) {
  const room = createRoom({ allowForceMode: true, random: () => .99,
    ...(prior ? { restore: { ...prior.liveSnapshot, includeNpcs: true } } : {}) });
  const activity = createActivity({ room, store, initial: prior });
  if (!prior) assert.equal(activity.saveConfig({ ...TEMPLATES.production, enabled: true }).ok, true);
  return { room, activity };
}
try {
  test('首位与重启后新玩家独立随机；已有员工重登不重抽阵营', () => {
    for (const [roll, faction] of [[0, 'bad'], [.199999, 'bad'], [.2, 'good'], [.99, 'good']]) {
      const room = createRoom({ random: () => roll });
      assert.equal(room.join('first', '首位').player.faction, faction);
    }
    const room = createRoom({ random: factionDraw([.99, .99, 0]) });
    const first = room.join('first', null, { empNo: 'E001', name: '员工甲' }).player;
    assert.equal(first.faction, 'good');
    assert.equal(room.join('second', '第二人').player.faction, 'good');
    assert.equal(room.join('third', '第三人').player.faction, 'bad');
    const restore = { roundId: room.room.roundId, players: clone(room.room.players), sessions: [...room.room.sessions] };
    const restarted = createRoom({ restore, random: () => 0 });
    assert.equal(restarted.join('new-session', null, { empNo: 'E001', name: '员工甲' }).player.faction, 'good');
    assert.equal(restarted.join('new-player', '新玩家').player.faction, 'bad');
    assert.ok(createRoom({ random: () => .99 }).join('good-only', '好人').player.faction === 'good');
  });
  test('公开生命与固定个人上限；修改初始配置不改变已有玩家血条', () => {
    const room = createRoom({ random: factionDraw([0, .99, .99]) });
    const bad = room.join('bad', '坏人').player, good = room.join('good', '好人').player;
    room.setCombatConfig({ initialHp: 5 });
    const later = room.join('later', '后来者').player;
    assert.equal(bad.maxHp, 3); assert.equal(good.maxHp, 3); assert.equal(later.maxHp, 5);
    assert.equal(skill(room, good, bad).ok, true);
    assert.equal(bad.hp, 2); assert.equal(bad.maxHp, 3);
    const stream = room.streamSnapshot(good.id, {});
    for (const publicPlayer of [...room.publicSnapshot(good.id).players, ...stream.players, ...stream.directory]) {
      const owner = room.find(publicPlayer.id);
      assert.equal(publicPlayer.hp, owner.hp); assert.equal(publicPlayer.maxHp, owner.maxHp);
      for (const secret of ['faction', 'skills', 'sessionId', 'empNo']) assert.ok(!(secret in publicPlayer), secret);
    }
    assert.equal(room.privateSnapshot(bad.id).me.maxHp, 3);
    const players = clone(room.room.players); delete players[0].maxHp;
    const restored = createRoom({ restore: { roundId: room.room.roundId, initialHp: 3, players, sessions: [...room.room.sessions] } });
    restored.setCombatConfig({ initialHp: 3 });
    assert.equal(restored.find(bad.id).maxHp, 3); assert.equal(restored.find(bad.id).hp, 2);
    restored.setCombatConfig({ initialHp: 8 }); assert.equal(restored.find(bad.id).maxHp, 3);
  });
  test('受击及误指认通知匿名，保护不拦本人技能，归零通知仅本人收到', () => {
    const room = createRoom({ random: factionDraw([0, .99, .99, .99]) });
    const [bad, good, other, witness] = ['bad', 'good', 'other', 'witness'].map(id => room.join(id, id).player);
    assert.equal(skill(room, good, bad).ok, true);
    const hit = room.privateSnapshot(bad.id).me.pending.find(event => event.type === 'hit');
    assert.match(hit.text, /剩余 2 格/); assert.equal(hit.result.damaged, 1);
    assert.equal(hit.hp, 2); assert.equal(hit.maxHp, 3); assert(hit.protectUntil > clock);
    for (const forbidden of ['byId', 'byName', 'actorId', 'kind', 'faction']) assert.ok(!(forbidden in hit));
    assert.equal(skill(room, bad, other).ok, true, '保护中的玩家仍可正常施技');
    const protectUntil = other.protectUntil;
    assert.equal(skill(room, other, witness).ok, true, '自身保护不抵消误指认自损');
    assert.equal(other.hp, 1); assert.equal(other.protectUntil, protectUntil);
    assert.equal(room.privateSnapshot(other.id).me.pending.at(-1).type, 'selfHit');
    bad.hp = 1; bad.protectUntil = 0;
    assert.equal(skill(room, witness, bad).ok, true);
    assert.equal(bad.hp, 0); assert.equal(bad.alive, false); assert.equal(bad.protectUntil, 0);
    const truce = room.privateSnapshot(bad.id).me.pending.filter(event => event.type === 'truce');
    assert.equal(truce.length, 1); assert.match(truce[0].text, /仍可探索/); assert.equal(truce[0].result.truce, true);
    assert.ok(!room.privateSnapshot(witness.id).me.pending.some(event => event.type === 'truce'));
    assert.ok(room.room.logs.every(entry => !/指认|刺杀|\+10|\+3/.test(entry.text)));
  });
  test('原题超过一分钟、员工换会话后可续答，其他人不能提交该题', () => {
    const room = createRoom({ allowForceMode: true, random: () => .99 });
    const player = room.join('first', null, { empNo: 'Q001', name: '答题者' }).player;
    const other = room.join('other', '其他人').player;
    const container = WORLD.zoneContainers(player.floorId, null)[0];
    const opened = search(room, player, container), original = clone(room.room.searchSessions.get(opened.sessionId).question);
    assert.equal(opened.mode, 'quiz'); assert.ok(!('answer' in opened.quiz));
    clock += 61_000;
    room.setOffline(player.id);
    const returned = room.join('relogin', null, { empNo: 'Q001', name: '答题者' }).player;
    const continued = search(room, returned, container);
    assert.equal(continued.reused, true); assert.equal(continued.sessionId, opened.sessionId); assert.deepEqual(continued.quiz, opened.quiz);
    assert.equal(room.searchTake(other.sessionId, { sessionId: opened.sessionId, answer: original.answer }).ok, false);
    assert.deepEqual(room.privateSnapshot(player.id).me.exploration.pendingQuizContainerIds, [container.id]);
    const result = room.searchTake(returned.sessionId, { sessionId: opened.sessionId, answer: original.answer });
    assert.equal(result.correct, true); assert.equal(result.gained.points, 2);
    assert.equal(room.searchTake(returned.sessionId, { sessionId: opened.sessionId, answer: original.answer }).ok, false);
    assert.equal(returned.score, 2); assert.equal(returned.exploration.exploreCount, 1);
    assert.equal(search(room, returned, container).ok, false);
    assert.deepEqual(room.privateSnapshot(player.id).me.exploration.pendingQuizContainerIds, []);
  });
  test('真实SQLite重启恢复原题和已提交记录，新场重置才允许重新开箱', () => {
    clock = at('2026-11-11', '10:00');
    const outputs = resolve(dirname(fileURLToPath(import.meta.url)), '../outputs');
    mkdirSync(outputs, { recursive: true });
    const folder = mkdtempSync(join(outputs, 'combat-quiz-state-')), file = join(folder, 'test.sqlite');
    let store;
    try {
      store = createStore({ file }); assert.equal(store.enabled, true);
      const first = managedRoom(store), player = first.room.join('quiz', null, { empNo: 'Q002', name: '重启续答者' }).player;
      const container = WORLD.zoneContainers(player.floorId, null)[0], opened = search(first.room, player, container);
      const original = clone(first.room.room.searchSessions.get(opened.sessionId).question);
      assert.equal(store.loadAdmin().liveSnapshot.searchSessions.length, 1, '出题立即存档，无需等周期快照');
      store.close(); store = createStore({ file });
      const prior = store.loadAdmin(), second = managedRoom(store, prior);
      const returned = second.room.join('after-restart', null, { empNo: 'Q002', name: '重启续答者' }).player;
      assert.equal(search(second.room, returned, container).sessionId, opened.sessionId);
      assert.deepEqual(second.room.room.searchSessions.get(opened.sessionId).question, original);
      const answer = second.room.searchTake(returned.sessionId, { sessionId: opened.sessionId, answer: original.answer });
      assert.equal(answer.correct, true); assert.equal(answer.gained.points, 2);
      assert.equal(store.loadAdmin().liveSnapshot.searchSessions[0][1].taken, true, '提交立即存档');
      store.close(); store = createStore({ file });
      const third = managedRoom(store, store.loadAdmin()), stable = third.room.find(player.id);
      assert.equal(third.room.searchTake(stable.sessionId, { sessionId: opened.sessionId, answer: original.answer }).ok, false);
      assert.equal(stable.score, 2); assert.equal(stable.exploration.exploreCount, 1);
      assert.equal(search(third.room, stable, container).ok, false);
      assert.ok(!JSON.stringify(third.room.publicSnapshot(stable.id)).includes('submittedAnswer'));
      assert.ok(!JSON.stringify(third.room.privateSnapshot(stable.id)).includes('submittedAnswer'));
      third.room.reset(); assert.equal(third.room.room.searchSessions.size, 0);
      const fresh = third.room.join('fresh', null, { empNo: 'Q002', name: '新场答题者' }).player;
      assert.equal(search(third.room, fresh, container).mode, 'quiz');
    } finally {
      store?.close();
      const child = relative(outputs, resolve(folder));
      assert(child && !child.startsWith('..') && !isAbsolute(child), '临时库清理必须留在 outputs 内');
      rmSync(folder, { recursive: true, force: true });
    }
  });
  test('答题存档失败不返回成功，并冻结后续玩法写入', () => {
    clock = at('2026-11-11', '10:00');
    const store = memory(), { room, activity } = managedRoom(store);
    const player = room.join('quiz-fail', '存档失败'), owner = player.player;
    const container = WORLD.zoneContainers(owner.floorId, null)[0];
    store.fail = true;
    const opened = search(room, owner, container);
    assert.equal(opened.ok, false); assert.equal(opened.closed, true); assert.match(opened.error, /存档失败/);
    assert.ok(activity.guard()); assert.equal(store.loadAdmin().liveSnapshot.searchSessions.length, 0);
  });
} finally { Date.now = originalNow; }
console.log(`权威生命与续答回归 ${passed} PASS / ${failed} FAIL`);
process.exitCode = failed ? 1 : 0;
