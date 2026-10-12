import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const C = WORLD.PLAY_CONFIG, furniture = WORLD.makeFurniture(), npc = WORLD.NPCS[0];
const choices = ['rock', 'paper', 'scissors'];
let sequence = 0, passed = 0, failed = 0;
const nonce = () => `mechanics-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}
function fixture(options = {}, count = 5) {
  const r = createRoom(options);
  for (let i = 0; i < count; i++) {
    const p = r.join(`session-${i}`, `玩家${i}`).player;
    p.x = 500 + i * 20; p.y = 350; p.exploration.chips = 3;
  }
  return r;
}
const play = (r, id, kind, extra = {}) => r.play(r.find(id).sessionId, { commandId: nonce(), kind, ...extra });
const attack = (r, id = 0, extra = {}) => r.attack(r.find(id).sessionId, { commandId: nonce(), ...extra });
const invite = (r, extra = {}) => play(r, 0, 'rpsInvite', { targetId: 1, choice: 'rock', ...extra });
const reply = (r, extra = {}) => play(r, 1, 'rpsReply', { challengeId: r.find(1).games.rpsPending?.id, choice: 'scissors', ...extra });
const advance = (r, ms) => { r.room.clockOffset += ms; };
function attackFixture() {
  const r = fixture();
  for (const p of r.room.players) { p.x = 1500 + p.id * 100; p.y = 350; }
  r.find(0).x = 500; r.find(1).x = 530; r.find(1).hp = 3;
  return r;
}
function assertPublicSafe(r) {
  for (const p of r.publicSnapshot().players) {
    for (const key of ['hp', 'chips', 'exploration', 'games', 'combat', 'choice', 'choices', 'resultText', 'lastResult', 'rpsPending']) assert.ok(!(key in p), key);
    assert.deepEqual(Object.keys(p.facing).sort(), ['x', 'y']);
    assert.equal(typeof p.lastAttackAt, 'number');
    assert.equal(typeof p.stunUntil, 'number'); assert.equal(typeof p.freezeUntil, 'number');
  }
}

await test('共享契约、全部九种猜拳组合及浏览器导出', async () => {
  assert.deepEqual(C, { rpsStake: 1, rpsTimeoutMs: 30000, rpsCooldownMs: 5000, attackRange: 48, attackCooldownMs: 12000, attackConeCos: 0.5, stunMs: 800, freezeMs: 1000 });
  const expected = [[0, -1, 1], [1, 0, -1], [-1, 1, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) assert.equal(WORLD.rpsOutcome(choices[i], choices[j]), expected[i][j]);
  const source = await readFile(new URL('./shared/world.js', import.meta.url), 'utf8');
  for (const sandbox of [{ window: {} }, {}]) {
    runInNewContext(source, sandbox);
    const w = sandbox.window ? sandbox.window.WORLD : sandbox.WORLD;
    assert.equal(JSON.stringify(w.PLAY_CONFIG), JSON.stringify(C));
    for (const key of ['makeFurniture', 'collidesAt', 'coverFor', 'pointOccluded', 'distanceToEntity', 'rpsOutcome', 'lineClear', 'wheelSpinCost', 'buildWheelPool']) assert.equal(typeof w[key], 'function');
    assert.equal(w.rpsOutcome('rock', 'scissors'), 1);
  }
});
await test('脚部连线足迹阻挡、外部端点、同点与视觉矩形独立', () => {
  const f = furniture[0], x = f.x + f.w / 2;
  for (const [a, b, clear] of [
    [{ x: f.x - 5, y: f.footprint.y + 5 }, { x: f.x + f.w + 5, y: f.footprint.y + 5 }, false],
    [{ x, y: f.footprint.y - 1 }, { x, y: f.depth + 1 }, false],
    [{ x: f.x - 5, y: f.y + 5 }, { x: f.x + f.w + 5, y: f.y + 5 }, true],
    [{ x: 500, y: 350 }, { x: 500, y: 350 }, true],
    [{ x, y: f.footprint.y + 5 }, { x, y: f.footprint.y + 5 }, false]
  ]) { assert.equal(WORLD.lineClear(a, b, [f]), clear); assert.equal(WORLD.lineClear(b, a, [f]), clear); }
});
await test('转盘十槽池、首次免费、阶梯收费可重复、返回深拷贝与元数据保护', () => {
  let draws = 0;
  const r = fixture({ randomInt: max => { assert.equal(max, WORLD.WHEEL.slotCount); draws++; return 2; } }), p = r.find(0);
  p.x = npc.x; p.y = npc.y; p.exploration.chips = 5;
  const id = nonce(), first = play(r, 0, 'wheel', { commandId: id, entityId: npc.id, prize: 999, slotIndex: 999, randomInt: 999 });
  assert.equal(first.ok, true); assert.equal(first.cost, 0); assert.equal(first.spins, 1);
  assert.equal(first.wheel.slots.length, WORLD.WHEEL.slotCount);
  assert.ok(first.wheel.slotIndex >= 0 && first.wheel.slotIndex < WORLD.WHEEL.slotCount);
  assert.deepEqual(first.wheel.item, first.wheel.slots[first.wheel.slotIndex]);
  assert.equal(first.wheel.item.kind, 'chips'); assert.equal(first.exploration.chips, 5 + first.wheel.item.amount);
  assert.equal(play(r, 0, 'wheel', { commandId: id, entityId: npc.id }).ok, false); assert.equal(draws, 1);
  // 第二次转动改为阶梯收费：成功、费用增加、wheelSpins 计数 +1
  const chipsAfterFirst = p.exploration.chips;
  const second = play(r, 0, 'wheel', { entityId: npc.id });
  assert.equal(second.ok, true); assert.equal(second.cost, WORLD.wheelSpinCost(1)); assert.ok(second.cost > first.cost);
  assert.equal(second.spins, 2); assert.equal(p.games.wheelSpins[npc.id], 2);
  assert.equal(second.exploration.chips, chipsAfterFirst - second.cost + second.wheel.item.amount);
  second.games.wheelSpins[npc.id] = 999; second.combat.facing.x = -1;
  assert.equal(p.games.wheelSpins[npc.id], 2); assert.equal(p.combat.facing.x, 1);
  const q = r.find(1); q.x = npc.x; q.y = npc.y; q.exploration.chips = 2;
  assert.equal(play(r, 1, 'wheel', { entityId: npc.id }).ok, true);
  assert.equal(q.games.wheelSpins[npc.id], 1);
  p.x = WORLD.NPCS[1].x; p.y = WORLD.NPCS[1].y;
  assert.equal(play(r, 0, 'wheel', { entityId: WORLD.NPCS[1].id }).ok, true);
  assert.equal(p.games.wheelSpins[npc.id], 2); assert.equal(p.games.wheelSpins[WORLD.NPCS[1].id], 1);
  assert.equal(draws, 4); assertPublicSafe(r);
  assert.equal(r.publicSnapshot().logs.some(l => /转盘|筹码/.test(l.text)), false);
  for (const f of furniture) for (const key of ['reward', 'prize', 'slotIndex', 'chips']) assert.ok(!(key in f));
});
await test('转盘权威距离64、失败不扣不锁nonce、身份在线存活结束与伪造坐标', () => {
  const r = fixture(), p = r.find(0), id = nonce();
  p.x = npc.x + 64.01; p.y = npc.y;
  assert.equal(play(r, 0, 'wheel', { commandId: id, entityId: npc.id, x: npc.x, y: npc.y }).ok, false);
  assert.equal(r.room.processed.has(id), false); p.x = npc.x + 64;
  assert.equal(play(r, 0, 'wheel', { commandId: id, entityId: npc.id }).ok, true);
  for (const mode of ['offline', 'dead', 'finished']) {
    const z = fixture(), a = z.find(0); a.x = npc.x; a.y = npc.y;
    if (mode === 'offline') z.setOffline(0); if (mode === 'dead') a.alive = false; if (mode === 'finished') z.finish();
    assert.equal(play(z, 0, 'wheel', { entityId: npc.id }).ok, false); assert.equal(a.exploration.chips, 3);
  }
  assert.equal(r.play('forged', { commandId: nonce(), kind: 'wheel', entityId: npc.id }).ok, false);
  for (const body of [null, {}, { commandId: ' ' }, { commandId: 4 }, { commandId: nonce(), kind: 'wheel', entityId: 'fake' }, { commandId: nonce(), kind: 'fake' }]) assert.equal(r.play(p.sessionId, body).ok, false);
});
await test('九组合双向结算、选择隐藏锁定、无预扣、冷却与重复回应', () => {
  for (const a of choices) for (const b of choices) {
    const r = fixture(), from = r.find(0), to = r.find(1), beforeLogs = r.publicSnapshot().logs;
    const id = nonce(); assert.equal(invite(r, { choice: a, commandId: id }).ok, true);
    assert.equal(from.exploration.chips, 3); assert.equal(to.exploration.chips, 3);
    assert.equal(invite(r, { choice: b, commandId: id }).ok, false);
    const pending = r.privateSnapshot(1).me.games.rpsPending;
    assert.deepEqual(Object.keys(pending).sort(), ['id', 'fromId', 'fromName', 'toId', 'toName', 'role', 'expiresAt'].sort());
    assert.equal(pending.role, 'to'); assert.equal(from.games.rpsPending.role, 'from');
    assert.equal(pending.fromId, from.id); assert.equal(pending.toName, to.name);
    assert.ok(pending.expiresAt >= r.now() + 29900); assertPublicSafe(r);
    const replyId = nonce(), outcome = WORLD.rpsOutcome(a, b);
    const result = reply(r, { choice: b, commandId: replyId });
    assert.equal(result.ok, true); assert.equal(result.delta, -outcome);
    assert.equal(from.exploration.chips, 3 + outcome); assert.equal(to.exploration.chips, 3 - outcome);
    assert.equal(from.games.rpsPending, null); assert.equal(to.games.rpsPending, null); assert.equal(r.room.challenges.size, 0);
    const labels = { rock: '石头', paper: '布', scissors: '剪刀' };
    assert.ok(from.games.lastResult.includes(`你出${labels[a]}`)); assert.ok(from.games.lastResult.includes(`${to.name}出${labels[b]}`));
    assert.ok(to.games.lastResult.includes(`你出${labels[b]}`)); assert.ok(to.games.lastResult.includes(`${from.name}出${labels[a]}`));
    assert.ok(from.games.rpsUntil >= r.now() + 4900); assert.equal(from.games.rpsUntil, to.games.rpsUntil);
    assert.equal(reply(r, { commandId: replyId, challengeId: pending.id }).ok, false);
    assert.equal(invite(r).ok, false); advance(r, 5001); assert.equal(invite(r).ok, true);
    assert.deepEqual(r.publicSnapshot().logs, beforeLogs);
  }
});
await test('猜拳拒绝第三方、发起者回应、重复邀请、双向占用、非法选择与目标', () => {
  const r = fixture(); assert.equal(invite(r).ok, true);
  const challengeId = r.find(1).games.rpsPending.id;
  for (const kind of ['rpsReply', 'rpsCancel']) assert.equal(play(r, 2, kind, { challengeId, choice: 'paper' }).ok, false);
  assert.equal(play(r, 0, 'rpsReply', { challengeId, choice: 'paper' }).ok, false);
  assert.equal(invite(r).ok, false);
  assert.equal(play(r, 1, 'rpsInvite', { targetId: 2, choice: 'rock' }).ok, false);
  assert.equal(play(r, 2, 'rpsInvite', { targetId: 0, choice: 'rock' }).ok, false);
  assert.equal(reply(r, { choice: 'lizard' }).ok, false); assert.equal(r.room.challenges.size, 1);
  const q = fixture();
  for (const targetId of [0, 'unknown', null, {}, '', 200]) assert.equal(invite(q, { targetId }).ok, false);
  for (const choice of [undefined, null, 'Rock', 'lizard', 2]) assert.equal(invite(q, { choice }).ok, false);
  assert.equal(q.room.challenges.size, 0);
});
await test('双方均可发起、最小余额无负数、连续回应/取消竞争只结算一次', () => {
  for (const fromId of [0, 1]) {
    const r = fixture(), toId = 1 - fromId;
    r.find(0).exploration.chips = r.find(1).exploration.chips = 1;
    assert.equal(play(r, fromId, 'rpsInvite', { targetId: toId, choice: 'paper' }).ok, true);
    const challengeId = r.find(toId).games.rpsPending.id;
    assert.equal(play(r, toId, 'rpsInvite', { targetId: fromId, choice: 'rock' }).ok, false);
    assert.equal(play(r, toId, 'rpsReply', { challengeId, choice: 'rock' }).ok, true);
    assert.equal(r.find(fromId).exploration.chips, 2); assert.equal(r.find(toId).exploration.chips, 0);
    assert.equal(play(r, fromId, 'rpsCancel', { challengeId }).ok, false);
    assert.equal(play(r, toId, 'rpsReply', { challengeId, choice: 'scissors' }).ok, false);
    assert.equal(r.find(fromId).exploration.chips, 2); assert.equal(r.find(toId).exploration.chips, 0);
  }
  const r = fixture(); invite(r); const challengeId = r.find(1).games.rpsPending.id;
  assert.equal(play(r, 0, 'rpsCancel', { challengeId }).ok, true);
  assert.equal(reply(r, { challengeId }).ok, false);
  assert.deepEqual(r.room.players.slice(0, 2).map(p => p.exploration.chips), [3, 3]);
});
await test('猜拳任一参与者取消、不扣与共享nonce跨API防重', () => {
  for (const actor of [0, 1]) {
    const r = fixture(); invite(r); const challengeId = r.find(1).games.rpsPending.id, id = nonce();
    assert.equal(play(r, actor, 'rpsCancel', { challengeId, commandId: id }).ok, true);
    assert.equal(reply(r, { challengeId }).ok, false); assert.equal(r.room.challenges.size, 0);
    assert.equal(r.find(0).exploration.chips, 3); assert.equal(r.find(1).exploration.chips, 3);
    assert.equal(attack(r, actor, { commandId: id }).ok, false);
    assert.equal(r.useSkill(r.find(actor).sessionId, { commandId: id, skill: 'probe', targetId: 2 }).ok, false);
    r.find(actor).x = npc.x; r.find(actor).y = npc.y;
    assert.equal(r.interact(r.find(actor).sessionId, { commandId: id, kind: 'exchange', entityId: npc.id }).ok, false);
  }
  const r = fixture(), id = nonce(), p = r.find(0); p.x = npc.x; p.y = npc.y;
  assert.equal(play(r, 0, 'wheel', { commandId: id, entityId: npc.id }).ok, true);
  assert.equal(attack(r, 0, { commandId: id }).ok, false);
  const other = nonce(); assert.equal(attack(r, 0, { commandId: other }).ok, true);
  assert.equal(play(r, 0, 'wheel', { commandId: other, entityId: npc.id }).ok, false);
});
await test('发起距离、LOS、余额、在线、存活校验与精确距离64', () => {
  for (const mode of ['distance', 'balanceFrom', 'balanceTo', 'offlineFrom', 'offlineTo', 'deadFrom', 'deadTo', 'wall', 'finished']) {
    const r = fixture(), a = r.find(0), b = r.find(1);
    if (mode === 'distance') b.x = a.x + 64.01;
    if (mode === 'balanceFrom') a.exploration.chips = 0;
    if (mode === 'balanceTo') b.exploration.chips = 0;
    if (mode === 'offlineFrom') r.setOffline(0); if (mode === 'offlineTo') r.setOffline(1);
    if (mode === 'deadFrom') a.alive = false; if (mode === 'deadTo') b.alive = false;
    if (mode === 'finished') r.finish();
    if (mode === 'wall') { a.x = b.x = 200; a.y = 210; b.y = 250; }
    assert.equal(invite(r).ok, false, mode); assert.equal(r.room.challenges.size, 0);
  }
  const r = fixture(); r.find(1).x = r.find(0).x + 64;
  assert.equal(invite(r).ok, true);
});
await test('回应重检双方余额/距离/LOS/存活/在线/结束并告知两方，无负数', () => {
  for (const mode of ['distance', 'balanceFrom', 'balanceTo', 'offlineFrom', 'offlineTo', 'deadFrom', 'deadTo', 'wall', 'finished']) {
    const r = fixture(), a = r.find(0), b = r.find(1); invite(r); const challengeId = b.games.rpsPending.id;
    if (mode === 'distance') b.x = a.x + 65;
    if (mode === 'balanceFrom') a.exploration.chips = 0;
    if (mode === 'balanceTo') b.exploration.chips = 0;
    if (mode === 'offlineFrom') r.setOffline(0); if (mode === 'offlineTo') r.setOffline(1);
    if (mode === 'deadFrom') a.alive = false; if (mode === 'deadTo') b.alive = false;
    if (mode === 'finished') r.finish();
    if (mode === 'wall') { a.x = b.x = 200; a.y = 210; b.y = 250; }
    const balance = [a.exploration.chips, b.exploration.chips];
    assert.equal(reply(r, { challengeId }).ok, false, mode);
    assert.deepEqual([a.exploration.chips, b.exploration.chips], balance);
    assert.equal(r.room.challenges.size, 0, mode); assert.equal(a.games.rpsPending, null); assert.equal(b.games.rpsPending, null);
    assert.match(a.games.lastResult, /取消/); assert.match(b.games.lastResult, /取消/);
  }
});
await test('30秒过期读取/请求/step清理，刷新保留pending轮盘结果，reset撤销全部', () => {
  for (const trigger of ['state', 'request', 'step']) {
    const r = fixture(); invite(r); const challengeId = r.find(1).games.rpsPending.id;
    advance(r, C.rpsTimeoutMs - 100); assert.ok(r.privateSnapshot(0).me.games.rpsPending);
    advance(r, 101);
    if (trigger === 'state') r.privateSnapshot(1);
    if (trigger === 'request') assert.equal(reply(r, { challengeId }).ok, false);
    if (trigger === 'step') r.step(0);
    assert.equal(r.room.challenges.size, 0); assert.match(r.find(0).games.lastResult, /超时/);
    assert.equal(r.find(0).exploration.chips, 3); assert.equal(r.find(1).exploration.chips, 3);
  }
  const r = fixture({ randomInt: () => 2 }), a = r.find(0), b = r.find(1);
  a.x = npc.x; a.y = npc.y; play(r, 0, 'wheel', { entityId: npc.id });
  b.x = a.x + 20; b.y = a.y; invite(r);
  const saved = r.privateSnapshot(0).me.games;
  r.setOffline(0); r.join(a.sessionId, '不应改名');
  assert.deepEqual(r.privateSnapshot(0).me.games, saved);
  const spin2 = play(r, 0, 'wheel', { entityId: npc.id });
  assert.equal(spin2.ok, true); assert.equal(spin2.spins, 2); assert.equal(spin2.cost, WORLD.wheelSpinCost(1));
  assert.equal(a.games.wheelSpins[npc.id], 2);
  reply(r); const settled = r.privateSnapshot(0).me.games;
  r.setOffline(0); r.join(a.sessionId, '刷新'); assert.deepEqual(r.privateSnapshot(0).me.games, settled);
  const oldNonce = [...r.room.processed.keys()][0]; r.reset();
  assert.equal(r.room.challenges.size, 0); assert.equal(r.room.processed.size, 0); assert.equal(r.playerBySession(a.sessionId), null);
  const fresh = r.join(a.sessionId, '新局').player;
  assert.deepEqual(fresh.games, { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '' });
  assert.deepEqual(fresh.combat, { facing: { x: 1, y: 0 }, attackUntil: 0, lastAttackAt: 0, stunUntil: 0, freezeUntil: 0 });
  fresh.x = npc.x; fresh.y = npc.y; assert.equal(play(r, 0, 'wheel', { commandId: oldNonce, entityId: npc.id }).ok, true);
});
await test('技能淘汰同步取消挑战，原技能日志与victim事件不变', () => {
  for (const kind of ['kill', 'accuse']) {
    const r = fixture(); invite(r);
    if (kind === 'kill') {
      const b = r.find(1);
      assert.equal(r.useSkill(r.find(0).sessionId, { commandId: nonce(), skill: 'kill', targetId: 1, sid: b.sid.segments.join('-') }).ok, true);
    } else {
      // 另有存活坏人，避免“指认淘汰最后一名坏人”触发 badWiped 结束本局（新结束规则）。
      r.find(4).faction = 'bad';
      r.find(0).hp = 1;
      assert.equal(r.useSkill(r.find(2).sessionId, { commandId: nonce(), skill: 'accuse', targetId: 0 }).ok, true);
    }
    assert.equal(r.room.challenges.size, 0); assert.equal(r.find(1).games.rpsPending, null);
    assert.match(r.find(1).games.lastResult, /淘汰/); assert.equal(r.room.eliminateEvents, 1);
    const dead = kind === 'kill' ? 1 : 0;
    assert.deepEqual(r.privateSnapshot(dead).me.pending.map(e => e.type), ['eliminated']);
    assert.equal(r.room.logs[0].text, `${r.find(dead).name}已淘汰。`);
  }
});
await test('朝向只取移动意图归一化，停止保留，客户端坐标/facing无效', () => {
  const r = fixture(), p = r.find(0), position = [p.x, p.y];
  assert.deepEqual(p.combat.facing, { x: 1, y: 0 });
  r.setIntent(0, { up: true, right: true, x: 1, y: 1, facing: { x: -1, y: 0 } });
  assert.deepEqual(p.combat.facing, { x: 1 / Math.SQRT2, y: -1 / Math.SQRT2 }); assert.deepEqual([p.x, p.y], position);
  r.step(0.05); assert.ok(p.x > position[0]); assert.ok(p.y < position[1]);
  const facing = { ...p.combat.facing };
  r.setIntent(0, {}); r.setIntent(0, { left: true, right: true }); assert.deepEqual(p.combat.facing, facing);
  r.setOffline(0); r.setIntent(0, { left: true }); assert.deepEqual(p.combat.facing, facing);
  r.join(p.sessionId); p.alive = false; r.setIntent(0, { left: true }); assert.deepEqual(p.combat.facing, facing);
});
await test('攻击范围48、方向锥、零距离、最近单目标与忽略指定target', () => {
  for (const [dx, dy, hit] of [[48, 0, true], [48.01, 0, false], [-20, 0, false], [0, 20, false], [20, 30, true], [20, 35, false], [0, 0, true]]) {
    const r = attackFixture(), a = r.find(0), b = r.find(1); b.x = a.x + dx; b.y = a.y + dy;
    const result = attack(r, 0, { targetId: 4, x: b.x, y: b.y, facing: { x: -1, y: 0 } });
    assert.equal(result.ok, true); assert.equal(result.hitId, hit ? 1 : undefined, `${dx},${dy}`); assert.equal(b.hp, 3);
    assert.equal(b.combat.stunUntil, hit ? a.combat.lastAttackAt + 800 : 0);
    assert.equal(b.combat.freezeUntil, hit ? a.combat.lastAttackAt + 1000 : 0);
    assert.ok(!('hp' in result));
  }
  const r = attackFixture(); r.find(2).x = 540; r.find(2).hp = 3;
  assert.equal(attack(r, 0, { targetId: 2 }).hitId, 1); assert.equal(r.find(1).hp, 3); assert.equal(r.find(2).hp, 3);
  assert.ok(r.find(1).combat.stunUntil > r.now()); assert.equal(r.find(2).combat.stunUntil, 0);
  const q = fixture({}, 1); q.find(0).x = npc.x; q.find(0).y = npc.y;
  assert.equal(attack(q).hitId, undefined); assert.equal(q.find(0).hp, 2);
});
await test('攻击足迹LOS、cover隐藏、离线与淘汰目标不命中', () => {
  for (const mode of ['wall', 'cover', 'offline', 'dead']) {
    const r = attackFixture(), a = r.find(0), b = r.find(1);
    if (mode === 'wall') { a.x = b.x = 200; a.y = 210; b.y = 250; r.setIntent(0, { down: true }); assert.equal(WORLD.lineClear(a, b, furniture), false); }
    if (mode === 'cover') { a.x = 160; b.x = 200; a.y = b.y = 190; assert.equal(WORLD.lineClear(a, b, furniture), true); assert.ok(WORLD.coverFor(b, furniture)); }
    if (mode === 'offline') r.setOffline(1); if (mode === 'dead') b.alive = false;
    assert.equal(attack(r).hitId, undefined, mode); assert.equal(b.hp, 3);
  }
});
await test('攻击空挥也12秒CD，命中/空挥nonce永久防重与失败不消耗', () => {
  for (const hit of [false, true]) {
    const r = attackFixture(), a = r.find(0), b = r.find(1), id = nonce();
    if (!hit) b.x = 800;
    const skills = JSON.stringify(a.skills), result = attack(r, 0, { commandId: id });
    assert.equal(result.ok, true); assert.equal(a.combat.attackUntil - a.combat.lastAttackAt, 12000);
    const hp = b.hp, nextId = nonce();
    assert.equal(attack(r, 0, { commandId: nextId }).ok, false); assert.equal(r.room.processed.has(nextId), false);
    assert.equal(attack(r, 0, { commandId: id }).ok, false);
    advance(r, 12001); assert.equal(attack(r, 0, { commandId: id }).ok, false); assert.equal(b.hp, hp);
    // 超过旧技能清理阈值后，同局历史nonce仍不得被删除。
    advance(r, 600001);
    for (let i = 0; i < 3001; i++) r.room.processed.set(`other-${i}`, 0);
    assert.equal(r.useSkill(a.sessionId, { commandId: nonce(), skill: 'probe', targetId: 3 }).ok, true);
    assert.ok(r.room.processed.has(id)); assert.equal(attack(r, 0, { commandId: id }).ok, false);
    assert.equal(attack(r, 0, { commandId: nextId }).ok, true);
    const beforeSkills = JSON.parse(skills);
    for (const kind of ['accuse', 'spy', 'kill']) assert.deepEqual(a.skills[kind], beforeSkills[kind]);
  }
  const r = attackFixture(), p = r.find(0);
  for (const body of [null, {}, { commandId: ' ' }, { commandId: 5 }]) assert.equal(r.attack(p.sessionId, body).ok, false);
  assert.equal(r.attack('forged', { commandId: nonce(), targetId: 1 }).ok, false);
  for (const mode of ['offline', 'dead', 'finished']) {
    const q = attackFixture(); if (mode === 'offline') q.setOffline(0); if (mode === 'dead') q.find(0).alive = false; if (mode === 'finished') q.finish();
    assert.equal(attack(q).ok, false); assert.equal(q.find(0).combat.attackUntil, 0); assert.equal(q.find(1).hp, 3);
  }
});
await test('J无伤害无淘汰，不改变日志事件技能筹码或猜拳pending，公开控制动画', () => {
  const r = attackFixture(), a = r.find(0), b = r.find(1); b.hp = 1;
  assert.equal(invite(r).ok, true);
  const before = JSON.stringify(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills, exploration: p.exploration, games: p.games })));
  const logs = r.publicSnapshot().logs, events = JSON.stringify([...r.room.pending]);
  const result = attack(r);
  assert.equal(result.hitId, 1); assert.match(result.resultText, /眩晕0\.8秒 \/ 僵直1秒，无伤害/); assert.ok(!('hp' in result));
  assert.equal(JSON.stringify(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills, exploration: p.exploration, games: p.games }))), before);
  assert.deepEqual(r.publicSnapshot().logs, logs); assert.equal(JSON.stringify([...r.room.pending]), events);
  assert.equal(r.room.eliminateEvents, 0); assert.equal(r.room.finished, false); assert.equal(r.room.challenges.size, 1);
  const pub = r.publicProjection(a), targetPub = r.publicProjection(b), me = r.privateSnapshot(1).me;
  assert.equal(pub.lastAttackAt, a.combat.lastAttackAt); assert.deepEqual(pub.facing, a.combat.facing);
  assert.equal(targetPub.stunUntil, a.combat.lastAttackAt + 800); assert.equal(targetPub.freezeUntil, a.combat.lastAttackAt + 1000);
  assert.equal(me.combat.stunUntil, targetPub.stunUntil); assert.equal(me.combat.freezeUntil, targetPub.freezeUntil); assertPublicSafe(r);
  advance(r, 12001); assert.equal(attack(r).hitId, 1); assert.equal(b.hp, 1); assert.equal(b.alive, true);
  assert.equal(r.room.eliminateEvents, 0); assert.equal(r.room.finished, false); assert.equal(r.room.challenges.size, 1);
  const q = fixture({}, 2); q.room.eliminateEvents = 1;
  assert.equal(attack(q).hitId, 1); assert.equal(q.room.finished, false); assert.equal(q.room.eliminateEvents, 1);
  assert.equal(q.find(1).hp, 1); assert.equal(q.find(1).alive, true);
});
await test('所有真实好坏阵营均可J互动，双方skill charges完全不变', () => {
  for (const [actorId, targetId] of [[0, 1], [1, 0], [1, 2]]) {
    const r = fixture(), a = r.find(actorId), b = r.find(targetId);
    for (const p of r.room.players) p.x = 1500 + p.id * 100;
    a.x = 500; b.x = 530;
    const before = JSON.stringify(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills })));
    assert.equal(attack(r, actorId).hitId, targetId);
    assert.equal(JSON.stringify(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills }))), before);
  }
});
await test('眩晕800/僵直1000精确边界，step强制不动并清意图，到期必须重新输入', () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const r = attackFixture(), b = r.find(1), blank = { up: false, down: false, left: false, right: false };
    r.setIntent(1, { right: true }); const position = [b.x, b.y, b.walk], facing = { ...b.combat.facing };
    attack(r); const t = clock;
    assert.deepEqual(b.input, blank);
    for (const elapsed of [0, 799, 800, 999]) {
      clock = t + elapsed;
      assert.equal(clock < b.combat.stunUntil, elapsed < 800);
      assert.equal(clock < b.combat.freezeUntil, true);
      r.setIntent(1, { left: true, x: 1, facing: { x: -1, y: 0 } });
      assert.deepEqual(b.input, blank); assert.deepEqual(b.combat.facing, facing);
      b.input.right = true; r.step(0.05);
      assert.deepEqual([b.x, b.y, b.walk], position); assert.deepEqual(b.input, blank);
      b.input.right = true; r.setIntent(1, {}); assert.deepEqual(b.input, blank);
    }
    clock = t + 1000; r.step(0.05); assert.deepEqual([b.x, b.y, b.walk], position);
    r.setIntent(1, { right: true }); r.step(0.05);
    assert.deepEqual([b.x, b.y, b.walk], [position[0] + 8, position[1], position[2] + 8]);
    r.finish(); r.setIntent(1, {}); assert.deepEqual(b.input, blank);
  } finally { Date.now = realNow; }
});
await test('仅stun或仅freeze均禁止攻击、所有play/search/exchange，失败不消耗nonce或资源', () => {
  for (const field of ['stunUntil', 'freezeUntil']) {
    const r = fixture(), a = r.find(0); a.x = npc.x; a.y = npc.y; a.combat[field] = r.now() + 1000;
    const before = JSON.stringify({ exploration: a.exploration, games: a.games, skills: a.skills, combat: a.combat });
    const id = nonce(); const result = attack(r, 0, { commandId: id });
    assert.equal(result.ok, false); assert.match(result.error, /眩晕或僵直/); assert.equal(r.room.processed.has(id), false);
    for (const kind of ['wheel', 'rpsInvite', 'rpsReply', 'rpsCancel']) {
      const rejected = play(r, 0, kind, { entityId: npc.id, targetId: 1, choice: 'rock', challengeId: 'fake' });
      assert.equal(rejected.ok, false); assert.match(rejected.error, /眩晕或僵直/);
    }
    for (const kind of ['search', 'exchange']) {
      const rejected = r.interact(a.sessionId, { commandId: nonce(), kind, entityId: kind === 'search' ? 'reception-132-173' : npc.id });
      assert.equal(rejected.ok, false); assert.match(rejected.error, /眩晕或僵直/);
    }
    assert.equal(JSON.stringify({ exploration: a.exploration, games: a.games, skills: a.skills, combat: a.combat }), before);
    advance(r, 1001); assert.equal(attack(r, 0, { commandId: id }).ok, true);
    assert.equal(attack(r, 0, { commandId: id }).ok, false);
  }
});
await test('独立stun/freeze截止瞬间自动恢复移动与J，停止意图在离线淘汰结束时始终有效', () => {
  const realNow = Date.now;
  let clock = realNow(); Date.now = () => clock;
  try {
    for (const [field, duration] of [['stunUntil', 800], ['freezeUntil', 1000]]) {
      const r = attackFixture(), a = r.find(0), deadline = clock + duration;
      a.combat[field] = deadline;
      clock = deadline - 1;
      const id = nonce(); assert.equal(attack(r, 0, { commandId: id }).ok, false);
      const position = a.x; r.setIntent(0, { right: true }); r.step(0.05); assert.equal(a.x, position);
      clock = deadline;
      r.setIntent(0, { right: true }); r.step(0.05); assert.equal(a.x, position + 8);
      assert.equal(attack(r, 0, { commandId: id }).hitId, 1);
    }
    for (const state of ['offline', 'dead', 'finished']) {
      const r = fixture(), a = r.find(0); a.input.right = true;
      if (state === 'offline') a.online = false; if (state === 'dead') a.alive = false; if (state === 'finished') r.finish();
      r.setIntent(0, {}); assert.deepEqual(a.input, { up: false, down: false, left: false, right: false });
    }
  } finally { Date.now = realNow; }
});
await test('受控期间既有远程技能原逻辑保持，不新增状态或距离权限', () => {
  for (const field of ['stunUntil', 'freezeUntil']) {
    const r = fixture(), a = r.find(0), b = r.find(1); a.combat[field] = r.now() + 1000; b.x = 3800;
    assert.equal(r.useSkill(a.sessionId, { commandId: nonce(), skill: 'probe', targetId: b.id }).ok, true);
    assert.equal(a.skills.probe.chargesRemaining, 1); assert.equal(b.traitPublic.saying, true);
    assert.equal(r.useSkill(a.sessionId, { commandId: nonce(), skill: 'spy', targetId: b.id }).ok, true);
    assert.equal(a.skills.spy.chargesRemaining, 1); assert.equal(b.sid.revealed[0], true);
  }
});
await test('多玩家J跳过已stun/freeze目标不延长，无替代目标空挥仍CD；到期可再次命中', () => {
  const realNow = Date.now;
  let clock = realNow(); Date.now = () => clock;
  try {
    for (const field of ['stunUntil', 'freezeUntil']) {
      const r = attackFixture(), target = r.find(1), c = r.find(2); c.x = 510;
      target.combat[field] = clock + 1000;
      const until = { stunUntil: target.combat.stunUntil, freezeUntil: target.combat.freezeUntil };
      const result = attack(r, 2);
      assert.equal(result.hitId, undefined); assert.equal(c.combat.attackUntil, clock + 12000);
      assert.equal(target.combat.stunUntil, until.stunUntil); assert.equal(target.combat.freezeUntil, until.freezeUntil);
    }
    const r = attackFixture(), b = r.find(1), c = r.find(2);
    const id = nonce(); assert.equal(attack(r, 0, { commandId: id }).hitId, 1);
    const saved = { ...b.combat }; clock += 500; c.x = 510;
    const miss = attack(r, 2); assert.equal(miss.ok, true); assert.equal(miss.hitId, undefined); assert.deepEqual(b.combat, saved);
    assert.equal(attack(r, 0, { commandId: id }).ok, false); assert.deepEqual(b.combat, saved);
    clock += 500; c.x = 1700; r.find(3).x = 510;
    assert.equal(attack(r, 3).hitId, 1); assert.equal(b.combat.freezeUntil, clock + 1000);
    clock += 12000;
    assert.equal(attack(r, 0, { commandId: id }).ok, false); assert.equal(b.combat.freezeUntil, saved.freezeUntil + 1000);
    const q = attackFixture(); q.find(1).combat.freezeUntil = clock + 1000; q.find(2).x = 540;
    assert.equal(attack(q).hitId, 2); assert.equal(q.find(1).combat.freezeUntil, clock + 1000);
  } finally { Date.now = realNow; }
});
await test('受控猜拳回应暂拒不取消，控制到期可回应；刷新保留控制且reset清空', () => {
  const r = fixture(), a = r.find(0), b = r.find(1); invite(r);
  const challengeId = b.games.rpsPending.id; assert.equal(attack(r).hitId, 1);
  const before = r.privateSnapshot(1).me.combat, id = nonce();
  assert.equal(reply(r, { challengeId, commandId: id }).ok, false); assert.equal(r.room.challenges.size, 1);
  r.setOffline(1); r.join(b.sessionId); assert.deepEqual(r.privateSnapshot(1).me.combat, before);
  advance(r, 1001); assert.equal(reply(r, { challengeId, commandId: id }).ok, true);
  assert.equal(b.hp, 1); assert.equal(a.hp, 2); assert.equal(r.room.eliminateEvents, 0);
  r.reset(); const fresh = r.join(b.sessionId).player;
  assert.equal(fresh.combat.stunUntil, 0); assert.equal(fresh.combat.freezeUntil, 0);
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
const httpPlay = (token, kind, extra = {}) => request('/api/play', { token, body: { commandId: nonce(), kind, ...extra } });
const state = async token => (await request('/api/state', { token })).data;
async function moveTo(token, x, y) {
  try {
    for (const [axis, value] of [['x', x], ['y', y]]) {
      const deadline = Date.now() + 15000;
      let moving = '';
      while (true) {
        const s = await state(token), p = s.players.find(p => p.id === s.me.id), diff = value - p[axis];
        if (Math.abs(diff) <= 8) break;
        assert.ok(Date.now() < deadline, `真实移动超时 ${axis}=${p[axis]}，目标${value}`);
        const key = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
        if (key !== moving) { await request('/api/input', { token, body: { [key]: true } }); moving = key; }
        await pause(20);
      }
      await request('/api/input', { token, body: {} });
    }
  } finally { await request('/api/input', { token, body: {} }); }
}
try {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '0', SID_DEV: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时\n${output}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`服务退出${code}\n${output}`)); });
    child.stderr.on('data', data => { output += data; });
    child.stdout.on('data', data => { output += data; if (output.includes('技能次数恢复周期:')) { clearTimeout(timer); resolve(); } });
  });
  await test('正式HTTP无测试/开发权限、鉴权和输入伪造保护', async () => {
    assert.equal((await request('/api/test/state')).status, 404);
    assert.equal((await request('/api/test/advance', { body: { ms: 999999 } })).status, 405);
    assert.equal((await request('/api/dev/capabilities')).status, 403);
    for (const path of ['/api/play', '/api/attack']) {
      const result = await request(path, { body: { commandId: nonce(), kind: 'wheel', entityId: npc.id, playerId: 0, sessionId: 'fake' } });
      assert.equal(result.status, 400); assert.equal(result.data.ok, false); assert.equal(result.data.exploration, null);
      assert.ok(result.data.resultText);
    }
    for (const path of ['/room.js', '/mechanics-test.mjs']) assert.equal((await request(path)).status, 404);
  });
  const users = [];
  for (let i = 0; i < 4; i++) users.push((await request('/api/join', { body: { nickname: `HTTP玩家${i}` } })).data);
  const [a, b, c] = users.map(u => u.sessionToken);
  await test('正式HTTP移动忽略坐标和朝向，真实搜索保留2/3与NPC兑换3', async () => {
    const before = await state(a), position = before.players.find(p => p.id === before.me.id);
    await request('/api/input', { token: a, body: { x: npc.x, y: npc.y, facing: { x: -1, y: 0 } } });
    const after = await state(a), p = after.players.find(p => p.id === after.me.id);
    assert.deepEqual([p.x, p.y], [position.x, position.y]); assert.deepEqual(after.me.combat.facing, { x: 1, y: 0 });
    assert.equal((await httpPlay(a, 'wheel', { entityId: npc.id, x: npc.x, y: npc.y })).status, 400);
    for (const token of [a, b]) {
      await moveTo(token, 220, 275);
      const result = await request('/api/interact', { token, body: { commandId: nonce(), kind: 'search', entityId: 'reception-132-173' } });
      assert.equal(result.status, 200); assert.equal(result.data.exploration.chips, 3);
    }
    await moveTo(a, npc.x, npc.y); await moveTo(b, npc.x + 28, npc.y);
    const exchanged = await request('/api/interact', { token: a, body: { commandId: nonce(), kind: 'exchange', entityId: npc.id } });
    assert.equal(exchanged.data.ok, true); assert.equal(exchanged.data.exploration.chips, 0);
    assert.equal(exchanged.data.exploration.clues.length, 1);
  });
  await test('正式HTTP阶梯收费转盘、nonce防重、刷新保留私有结果与对方投影', async () => {
    const before = (await state(b)).me.exploration.chips;
    const id = nonce(), result = await httpPlay(b, 'wheel', { commandId: id, entityId: npc.id, prize: 999, slotIndex: 999 });
    assert.equal(result.status, 200);
    const wheel = result.data.wheel;
    assert.equal(wheel.slots.length, WORLD.WHEEL.slotCount);
    assert.ok(wheel.slotIndex >= 0 && wheel.slotIndex < WORLD.WHEEL.slotCount);
    assert.deepEqual(wheel.item, wheel.slots[wheel.slotIndex]);
    assert.equal(result.data.cost, 0); assert.equal(result.data.spins, 1);
    assert.equal(result.data.prize, wheel.item.kind === 'chips' ? wheel.item.amount : null);
    assert.equal(result.data.exploration.chips, before + (wheel.item.kind === 'chips' ? wheel.item.amount : 0));
    assert.equal((await httpPlay(b, 'wheel', { commandId: id, entityId: npc.id })).status, 400);
    // 第二次转动：阶梯收费且允许重复转动
    const second = await httpPlay(b, 'wheel', { entityId: npc.id });
    assert.equal(second.status, 200); assert.equal(second.data.cost, WORLD.wheelSpinCost(1)); assert.equal(second.data.spins, 2);
    assert.equal((await state(b)).me.games.wheelSpins[npc.id], 2);
    const saved = (await state(b)).me.games;
    const revived = await request('/api/join', { token: b, body: { nickname: '不允许替换' } });
    assert.equal(revived.data.revived, true); assert.deepEqual((await state(b)).me.games, saved);
    const other = await state(c);
    assert.equal(other.me.exploration.chips, 0); assert.deepEqual(other.me.games.wheelSpins, {});
    for (const p of other.players) for (const key of ['games', 'exploration', 'hp', 'choice', 'chips', 'lastResult']) assert.ok(!(key in p));
    // 甲兑换后余额为0，通过另一个真实筹码容器获得2，不依赖随机转盘奖励。
    await moveTo(a, 1080, 280);
    const searched = await request('/api/interact', { token: a, body: { commandId: nonce(), kind: 'search', entityId: 'desk-1035-172' } });
    assert.equal(searched.data.ok, true); assert.equal(searched.data.exploration.chips, 2);
    await moveTo(a, npc.x, npc.y);
  });
  await test('正式HTTP双方自愿猜拳、第三方拒绝、pending刷新、双私有余额及时更新', async () => {
    const beforeA = (await state(a)).me.exploration.chips, beforeB = (await state(b)).me.exploration.chips;
    const result = await httpPlay(a, 'rpsInvite', { targetId: users[1].playerId, choice: 'rock' });
    assert.equal(result.status, 200); assert.equal(result.data.exploration.chips, beforeA);
    const pending = (await state(b)).me.games.rpsPending;
    assert.equal(pending.role, 'to'); assert.ok(!('choice' in pending));
    assert.equal((await httpPlay(c, 'rpsReply', { challengeId: pending.id, choice: 'paper' })).status, 400);
    assert.equal((await httpPlay(c, 'rpsCancel', { challengeId: pending.id })).status, 400);
    await request('/api/join', { token: a, body: { nickname: '刷新' } });
    assert.equal((await state(a)).me.games.rpsPending.id, pending.id);
    const id = nonce(), replied = await httpPlay(b, 'rpsReply', { commandId: id, challengeId: pending.id, choice: 'scissors' });
    assert.equal(replied.status, 200); assert.equal(replied.data.delta, -1);
    assert.equal((await httpPlay(b, 'rpsReply', { commandId: id, challengeId: pending.id, choice: 'paper' })).status, 400);
    const aa = await state(a), bb = await state(b);
    assert.equal(aa.me.exploration.chips, beforeA + 1); assert.equal(bb.me.exploration.chips, beforeB - 1);
    assert.equal(aa.me.games.rpsPending, null); assert.equal(bb.me.games.rpsPending, null);
    assert.match(aa.me.games.lastResult, /你出石头/); assert.match(bb.me.games.lastResult, /你出剪刀/);
  });
  await test('正式HTTP全阵营J无伤害，公开眩晕僵直动画、状态门禁与CD去重', async () => {
    const beforeVictim = await state(a), beforeAttacker = await state(b);
    await request('/api/input', { token: b, body: { left: true } }); await request('/api/input', { token: b, body: {} });
    const id = nonce(), result = await request('/api/attack', { token: b, body: { commandId: id, targetId: users[2].playerId, facing: { x: 1, y: 0 }, x: 1, y: 1 } });
    assert.equal(result.status, 200); assert.equal(result.data.hitId, users[0].playerId);
    assert.match(result.data.resultText, /眩晕0\.8秒 \/ 僵直1秒，无伤害/); assert.ok(!('hp' in result.data));
    assert.equal(result.data.combat.attackUntil - result.data.combat.lastAttackAt, 12000);
    assert.equal((await request('/api/attack', { token: b, body: { commandId: id } })).status, 400);
    assert.equal((await request('/api/attack', { token: b, body: { commandId: nonce() } })).status, 400);
    const victim = await state(a), other = await state(c);
    assert.equal(victim.me.hp, beforeVictim.me.hp); assert.deepEqual(victim.me.pending, beforeVictim.me.pending);
    assert.deepEqual(victim.logs, beforeVictim.logs); assert.equal(victim.finished, beforeVictim.finished);
    assert.deepEqual(victim.me.skills, beforeVictim.me.skills); assert.deepEqual((await state(b)).me.skills, beforeAttacker.me.skills);
    assert.equal(victim.me.combat.stunUntil, result.data.combat.lastAttackAt + 800);
    assert.equal(victim.me.combat.freezeUntil, result.data.combat.lastAttackAt + 1000);
    const targetPub = other.players.find(p => p.id === users[0].playerId);
    assert.equal(targetPub.stunUntil, victim.me.combat.stunUntil); assert.equal(targetPub.freezeUntil, victim.me.combat.freezeUntil);
    const position = victim.players.find(p => p.id === users[0].playerId), facing = { ...victim.me.combat.facing };
    const rejected = await request('/api/attack', { token: a, body: { commandId: nonce() } });
    assert.equal(rejected.status, 400); assert.match(rejected.data.error, /眩晕或僵直/);
    const blockedPlay = await httpPlay(a, 'wheel', { entityId: npc.id });
    assert.equal(blockedPlay.status, 400); assert.match(blockedPlay.data.error, /眩晕或僵直/);
    for (const kind of ['search', 'exchange']) {
      const blocked = await request('/api/interact', { token: a, body: { commandId: nonce(), kind, entityId: npc.id } });
      assert.equal(blocked.status, 400); assert.match(blocked.data.error, /眩晕或僵直/);
    }
    await request('/api/input', { token: a, body: { right: true, stunUntil: 0, freezeUntil: 0 } });
    await pause(60);
    const locked = await state(a), lockedP = locked.players.find(p => p.id === users[0].playerId);
    assert.deepEqual([lockedP.x, lockedP.y], [position.x, position.y]); assert.deepEqual(locked.me.combat.facing, facing);
    await request('/api/input', { token: a, body: {} });
    const remain = victim.me.combat.freezeUntil - locked.serverTime;
    if (remain > 0) await pause(remain + 60);
    const ready = await state(a); assert.ok(ready.serverTime >= ready.me.combat.freezeUntil);
    await request('/api/input', { token: a, body: { right: true } }); await pause(100);
    await request('/api/input', { token: a, body: {} });
    const restored = await state(a); assert.ok(restored.players.find(p => p.id === users[0].playerId).x > position.x);
    assert.equal(restored.me.hp, beforeVictim.me.hp); assert.deepEqual(restored.me.pending, beforeVictim.me.pending);
    assert.equal((await state(c)).me.hp, 1);
    const attacker = other.players.find(p => p.id === users[1].playerId);
    assert.equal(attacker.lastAttackAt, result.data.combat.lastAttackAt); assert.deepEqual(attacker.facing, { x: -1, y: 0 });
    for (const p of other.players) for (const key of ['hp', 'chips', 'games', 'exploration', 'choices', 'resultText']) assert.ok(!(key in p));
  });
} catch (error) { failed++; console.error(`HTTP初始化或流程失败\n${error.stack}\n${output}`); }
finally {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}
console.log(`机制回归：${passed}项通过，${failed}项失败；HTTP子进程已关闭。`);
if (failed) process.exitCode = 1;
