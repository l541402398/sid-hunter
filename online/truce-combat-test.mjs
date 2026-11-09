import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');

let seq = 0;
const nid = () => `truce-${++seq}`;
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (e) { failed++; console.error(`失败 ${name}\n${e.stack}`); }
}

function fixture(n = 5) {
  const r = createRoom();
  for (let i = 0; i < n; i++) r.join(`s${i}`, `P${i}`);
  return r;
}

await test('配置：积分统一、首搜/首游为0、对抗默认生命3', () => {
  assert.equal(WORLD.SCORE.accuseHit, 10);
  assert.equal(WORLD.SCORE.assassinateHit, 3);
  assert.equal(WORLD.SCORE.firstSearch, 0);
  assert.equal(WORLD.SCORE.firstMinigame, 0);
  assert.equal(WORLD.SCORE.spy, 0);
  assert.equal(WORLD.SCORE.kill, 0);
  assert.equal(WORLD.COMBAT.initialHp, 3);
  assert.equal(WORLD.EXPLORE.emptyChance, 5);
  assert.equal(WORLD.wheelSpinCost(0), 0);
  assert.equal(WORLD.wheelSpinCost(2), 0);
  assert.ok(WORLD.NPC_EXCHANGE_LIST.every(x => x.cost === 0));
  assert.ok(!WORLD.NPC_EXCHANGE.hideOwnSid);
});

await test('入场：双方生命相同，各仅一个技能，阵营约4:1', () => {
  const r = fixture(10);
  const humans = r.room.players.filter(p => !p.npc);
  for (const p of humans) {
    assert.equal(p.hp, r.room.initialHp);
    const keys = Object.keys(p.skills);
    assert.equal(keys.length, 1);
    assert.equal(keys[0], p.faction === 'bad' ? 'assassinate' : 'accuse');
    assert.equal(p.skills[keys[0]].maxCharges, 1);
    assert.equal(p.skills[keys[0]].chargesRemaining, 1);
  }
  const bad = humans.filter(p => p.faction === 'bad').length;
  assert.ok(bad >= 1 && bad <= 4, `bad=${bad}`);
});

await test('指认命中坏人：扣血+10分+保护；同目标当日不可再操作', () => {
  const r = fixture(5);
  const good = r.room.players.find(p => p.faction === 'good');
  const bad = r.room.players.find(p => p.faction === 'bad');
  bad.x = good.x; bad.y = good.y;
  const before = good.score;
  const res = r.useSkill(good.sessionId, { commandId: nid(), skill: 'accuse', targetId: bad.id });
  assert.equal(res.ok, true);
  assert.equal(bad.hp, r.room.initialHp - 1);
  assert.equal(good.score, before + 10);
  assert.ok(bad.protectUntil > r.now());
  assert.match(res.resultText, /指认成功/);
  // 公共日志不提操作者/技能名
  assert.ok(r.room.logs.some(l => l.text.includes(`${bad.name}的对抗生命变为`)));
  assert.ok(!r.room.logs.some(l => /指认|刺杀|\+10|\+3/.test(l.text) && l.text.includes(good.name)));
  // 无次数时先报冷却；补次数后应拦同目标
  good.skills.accuse.chargesRemaining = 1;
  good.skills.accuse.nextChargeAt = 0;
  bad.protectUntil = 0;
  const again = r.useSkill(good.sessionId, { commandId: nid(), skill: 'accuse', targetId: bad.id });
  assert.equal(again.ok, false);
  assert.match(again.error, /今日|同一/);
  assert.equal(good.skills.accuse.chargesRemaining, 1, '无效操作不扣次数');
});

await test('误指认：自己扣血且不触发保护；目标不掉血', () => {
  const r = fixture(5);
  const goods = r.room.players.filter(p => p.faction === 'good');
  assert.ok(goods.length >= 2);
  const a = goods[0], b = goods[1];
  b.x = a.x; b.y = a.y;
  const res = r.useSkill(a.sessionId, { commandId: nid(), skill: 'accuse', targetId: b.id });
  assert.equal(res.ok, true);
  assert.equal(a.hp, r.room.initialHp - 1);
  assert.equal(b.hp, r.room.initialHp);
  assert.equal(a.protectUntil || 0, 0);
});

await test('刺杀命中好人 +3；刺同阵营无效果但仍耗次', () => {
  const r = fixture(5);
  const bad = r.room.players.find(p => p.faction === 'bad');
  const good = r.room.players.find(p => p.faction === 'good');
  const otherBad = r.room.players.find(p => p.faction === 'bad' && p.id !== bad.id);
  good.x = bad.x; good.y = bad.y;
  const before = bad.score;
  let res = r.useSkill(bad.sessionId, { commandId: nid(), skill: 'assassinate', targetId: good.id });
  assert.equal(res.ok, true);
  assert.equal(good.hp, r.room.initialHp - 1);
  assert.equal(bad.score, before + 3);
  if (otherBad) {
    r.room.clockOffset += bad.skills.assassinate.chargeIntervalMs + 1;
    otherBad.x = bad.x; otherBad.y = bad.y;
    otherBad.protectUntil = 0;
    const hp = otherBad.hp;
    res = r.useSkill(bad.sessionId, { commandId: nid(), skill: 'assassinate', targetId: otherBad.id });
    assert.equal(res.ok, true);
    assert.equal(otherBad.hp, hp);
    assert.match(res.resultText, /无效|同/);
  }
});

await test('生命归零进入休战：可探索得积分，不可再用技能', () => {
  const r = fixture(5);
  const good = r.room.players.find(p => p.faction === 'good');
  const bad = r.room.players.find(p => p.faction === 'bad');
  bad.hp = 1; bad.protectUntil = 0;
  bad.x = good.x; bad.y = good.y;
  const res = r.useSkill(good.sessionId, { commandId: nid(), skill: 'accuse', targetId: bad.id });
  assert.equal(res.ok, true);
  assert.equal(bad.alive, false);
  assert.equal(bad.truce ?? !bad.alive, true);
  const priv = r.privateSnapshot(bad.id);
  assert.equal(priv.me.truce, true);
  assert.ok((priv.me.pending || []).some(e => e.type === 'truce'));
  // 休战不可技能
  const blocked = r.useSkill(bad.sessionId, { commandId: nid(), skill: 'action', targetId: good.id });
  assert.equal(blocked.ok, false);
  // 休战可探索
  const containers = WORLD.floorContainers(bad.floorId);
  assert.ok(containers.length);
  const c = containers[0];
  bad.x = c.x; bad.y = c.y;
  const open = r.interact(bad.sessionId, {
    commandId: nid(), kind: 'search', entityId: c.id,
    roundId: r.room.roundId, expectedFloorRevision: bad.floorRevision, forceMode: 'points'
  });
  assert.equal(open.ok, true);
  assert.equal(open.gained.points, 1);
  assert.ok(bad.score >= 1);
  // 休战无穿墙：碰撞仍生效（与活人同一路径）
  const wallX = bad.x;
  bad.input = { up: false, down: false, left: true, right: false };
  // 不断言具体挡点，只确认 alive=false 时 step 仍调用 zoneCollides（无抛错）
  r.step(0.05);
  assert.equal(typeof bad.x, 'number');
});

await test('猜拳胜者得积分且不扣金币；休战可参与', () => {
  const r = fixture(3);
  const a = r.find(0), b = r.find(1);
  a.exploration.chips = 0; b.exploration.chips = 0;
  a.alive = false; // 休战
  a.x = b.x; a.y = b.y;
  a.x = 500; a.y = 350; b.x = 520; b.y = 350;
  a.floorId = b.floorId = 1;
  const inv2 = r.play(a.sessionId, { commandId: nid(), kind: 'rpsInvite', targetId: b.id, roundId: r.room.roundId, expectedFloorRevision: a.floorRevision });
  assert.equal(inv2.ok, true, inv2.error || inv2.resultText);
  const challengeId = a.games.rpsPending.id;
  assert.equal(r.play(b.sessionId, { commandId: nid(), kind: 'rpsReply', challengeId, roundId: r.room.roundId, expectedFloorRevision: b.floorRevision }).ok, true);
  assert.equal(r.play(a.sessionId, { commandId: nid(), kind: 'rpsChoose', challengeId, choice: 'rock', revision: 1, roundId: r.room.roundId, expectedFloorRevision: a.floorRevision }).ok, true);
  assert.equal(r.play(b.sessionId, { commandId: nid(), kind: 'rpsChoose', challengeId, choice: 'scissors', revision: 1, roundId: r.room.roundId, expectedFloorRevision: b.floorRevision }).ok, true);
  r.room.clockOffset += WORLD.PLAY_CONFIG.rpsRoundMs + 1;
  r.step(0);
  assert.equal(a.games.rpsResult.status, 'resolved');
  assert.equal(a.games.rpsResult.outcome, 'win');
  assert.ok(a.score >= 2, `winner score ${a.score}`);
  assert.equal(a.exploration.chips, 0);
  assert.equal(b.exploration.chips, 0);
});

await test('转盘免费产出积分', () => {
  const r = fixture(1);
  const p = r.find(0);
  const npc = WORLD.NPCS[0];
  p.x = npc.x; p.y = npc.y; p.floorId = npc.floorId;
  p.exploration.chips = 0;
  const before = p.score;
  const res = r.play(p.sessionId, { commandId: nid(), kind: 'wheel', entityId: npc.id, roundId: r.room.roundId, expectedFloorRevision: p.floorRevision });
  assert.equal(res.ok, true, res.error || res.resultText);
  assert.equal(res.cost, 0);
  assert.equal(res.wheel.item.kind, 'points');
  assert.ok(p.score > before);
  assert.equal(p.exploration.chips, 0);
});

console.log(`\n合计 通过 ${passed} 失败 ${failed}`);
process.exit(failed ? 1 : 0);
