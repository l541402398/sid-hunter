// 休战（取代旧“幽灵”）语义的进程内回归，替换 ghost-offline-test.mjs：
// 旧用例依赖 SID_TEST HTTP 服务与 /api/test/* 端点（origin/dev 上已不可用），且断言幽灵穿墙/吓人等已取消的规则。
// 这里在进程内覆盖同一组关注点：休战仍在公共快照、不计对抗、碰撞与活人一致、可挥锤不可吓人、
// 技能冻结不随时间恢复、离线重连保持休战、结束后冻结。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');

let seq = 0, passed = 0, failed = 0;
const nid = () => `to-${++seq}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (e) { failed++; console.error(`失败 ${name}\n${e.stack}`); }
}
function fixture(n = 6, rules) {
  const r = createRoom({ random: () => 0.99, ...(rules ? { rules } : {}) });
  for (let i = 0; i < n; i++) r.join(`s${i}`, `T${i}`);
  return r;
}
function truce(r, victim) {
  const bad = r.room.players.find(p => p.faction === 'bad' && p.id !== victim.id && p.alive);
  victim.hp = 1; victim.protectUntil = 0;
  const res = r.useSkill(bad.sessionId, { commandId: nid(), skill: 'assassinate', targetId: victim.id });
  assert.equal(res.ok, true, JSON.stringify(res)); assert.equal(victim.alive, false);
  return bad;
}

await test('技能使对抗生命归零 → 休战：仍在公共快照、不结束本局、只私密提示一次', () => {
  const r = fixture(), g = r.find(1);
  truce(r, g);
  const snap = r.publicSnapshot(g.id);
  const pub = snap.players.find(p => p.id === g.id);
  assert.ok(pub); assert.equal(pub.alive, false); assert.equal(pub.truce, true);
  assert.equal(snap.finished, false);
  const me = r.privateSnapshot(g.id).me;
  assert.equal(me.truce, true); assert.equal(me.hp, 0);
  assert.equal(me.pending.filter(e => e.type === 'truce').length, 1);
  const texts = r.room.logs.map(l => l.text);
  assert.ok(texts.includes(`${g.name}进入休战状态。`)); assert.ok(!texts.some(t => /幽灵|淘汰|出局/.test(t)));
});

await test('休战者移动与活人走同一碰撞路径（不再穿家具），仍受楼层边界约束', () => {
  const r = fixture(), g = r.find(1), alive = r.find(2);
  truce(r, g);
  const c = WORLD.zoneContainers(g.floorId, g.zoneId || null)[0];
  for (const p of [g, alive]) { p.x = c.x - 80; p.y = c.y; p.input = { up: false, down: false, left: false, right: true }; p.combat.stunUntil = 0; p.combat.freezeUntil = 0; p.stunUntil = 0; }
  for (let i = 0; i < 40; i++) r.step(0.05);
  assert.equal(g.x, alive.x, '休战者与活人同起点同输入应停在同一位置'); assert.equal(g.y, alive.y);
  // 一直向左走到楼层边界：两者被同样钳住。
  for (const p of [g, alive]) p.input = { up: false, down: false, left: true, right: false };
  for (let i = 0; i < 400; i++) r.step(0.05);
  assert.equal(g.x, alive.x, '楼层边界同样约束休战者'); assert.equal(g.y, alive.y);
});

await test('休战者可J挥锤（积分规则同活人），任何人都不能scare；锤子可命中休战者且不扣生命', () => {
  const r = fixture(), g = r.find(1), a = r.find(2);
  truce(r, g);
  for (const p of r.room.players) { p.x = 3000 + p.id * 200; p.y = 350; }
  g.x = 500; g.y = 350; a.x = 520; a.y = 350;
  const swing = r.performAction(g.id, 'hammer');
  assert.equal(swing.ok, true); assert.equal(swing.hit, true); assert.equal(swing.targetId, a.id); assert.equal(a.hp, 3);
  for (const p of [g, a]) assert.equal(r.performAction(p.id, 'scare').ok, false);
  r.room.clockOffset += WORLD.ACTION.hammerCooldownMs + 1;
  const back = r.performAction(a.id, 'hammer');
  assert.equal(back.hit, true); assert.equal(back.targetId, g.id); assert.equal(g.hp, 0); assert.equal(g.alive, false);
});

await test('休战冻结技能：次数与恢复时刻不随时间变化，所有对抗技能被拒', () => {
  const r = fixture(), g = r.find(1);
  g.skills.accuse.chargesRemaining = 0; g.skills.accuse.nextChargeAt = r.now() + 60000;
  truce(r, g);
  const frozen = JSON.stringify(g.skills);
  assert.equal(typeof g.skillsFrozenAt, 'number');
  r.room.clockOffset += 3 * 3600000;
  r.privateSnapshot(g.id);
  assert.equal(JSON.stringify(g.skills), frozen);
  for (const skill of ['accuse', 'assassinate', 'action', 'probe', 'kill']) {
    assert.equal(r.useSkill(g.sessionId, { commandId: nid(), skill, targetId: 0 }).ok, false, skill);
  }
});

await test('休战者离线/重连保持休战与积分，不会复活；他人不能对其指认或刺杀', () => {
  const r = fixture(6, { timeLimitMs: 3 * 86400000 }), g = r.find(1);
  const bad = truce(r, g);
  g.score = 12;
  r.setOffline(g.id); r.join(g.sessionId, '重连');
  assert.equal(g.alive, false); assert.equal(g.hp, 0); assert.equal(g.score >= 12, true);
  r.room.clockOffset += 24 * 3600000; r.privateSnapshot(g.id);
  assert.equal(g.alive, false, '跨日不自动复活（本场内）');
  bad.skills.assassinate.chargesRemaining = 1;
  const again = r.useSkill(bad.sessionId, { commandId: nid(), skill: 'assassinate', targetId: g.id });
  assert.equal(again.ok, false); assert.match(again.error, /休战/);
});

await test('本局结束后休战者与活人一样冻结：不能挥锤、不能移动', () => {
  const r = fixture(), g = r.find(1);
  truce(r, g);
  r.finish();
  assert.equal(r.performAction(g.id, 'hammer').ok, false);
  const x = g.x; g.input = { up: false, down: false, left: false, right: true }; r.step(0.05);
  assert.equal(g.x, x);
});

console.log(`休战离线测试：${passed} 项通过，${failed} 项失败`);
process.exitCode = failed ? 1 : 0;
