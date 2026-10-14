import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const C = WORLD.PLAY_CONFIG, T = WORLD.ATTACK_ANIMATION_MS;
const directions = [
  ['right', { right: true }, 1, 0], ['left', { left: true }, -1, 0],
  ['front', { down: true }, 0, 1], ['back', { up: true }, 0, -1]
];
const blank = { up: false, down: false, left: false, right: false };
const woodColors = new Set(['#986039', '#75472d', '#ddb078', '#a36b40', '#bd8750']);
let passed = 0, failed = 0, sequence = 0;
const nonce = () => `movement-attack-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}
function fixture() {
  const r = createRoom();
  for (let i = 0; i < 4; i++) {
    const p = r.join(`movement-${i}`, `专项${i}`).player;
    p.x = i ? 1500 + i * 100 : 500; p.y = 350;
  }
  return r;
}
function move(r, id, input, dt = .05) { r.setIntent(id, input); r.step(dt); }
const position = p => [p.x, p.y, p.walk, p.spriteFacing];
const attack = (r, id = 0, extra = {}) => r.attack(r.find(id).sessionId, { commandId: nonce(), ...extra });
function fixedClock(fn) {
  const realNow = Date.now;
  let clock = 1800000000000;
  Date.now = () => clock;
  try { return fn(ms => { clock += ms; }); } finally { Date.now = realNow; }
}
function near(actual, expected, label) { assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`); }
function render(direction, age = null, extra = {}, attackDirection = direction, world = WORLD) {
  const calls = [], stack = [];
  const g = {
    fillStyle: '#initial', globalAlpha: .73,
    save() { stack.push([this.fillStyle, this.globalAlpha]); },
    restore() { assert.ok(stack.length); [this.fillStyle, this.globalAlpha] = stack.pop(); },
    fillRect(x, y, w, h) {
      assert.ok([x, y, w, h].every(Number.isFinite));
      assert.ok([x, y, w, h].every(Number.isInteger)); assert.ok(w > 0 && h > 0);
      calls.push({ x, y, w, h, color: this.fillStyle, alpha: this.globalAlpha });
    }
  };
  const p = { id: 0, x: 100, y: 100, walk: 0, moving: false, alive: true, online: true,
    spriteFacing: direction, colors: Object.fromEntries(Object.entries(WORLD.PALETTES).map(([k, v]) => [k, v[0]])), ...extra };
  world.drawCharacterBody(g, p, 0, age, attackDirection);
  assert.deepEqual(stack, []); assert.equal(g.fillStyle, '#initial'); assert.equal(g.globalAlpha, .73);
  assert.ok(calls.length > 30);
  return calls;
}
const wood = calls => calls.filter(c => woodColors.has(c.color));
const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
function grip(calls) {
  const lastWood = calls.findLastIndex(c => woodColors.has(c.color));
  assert.ok(lastWood >= 0);
  const gripIndex = calls.findIndex((c, i) => i > lastWood && c.w === 6 && c.h === 6 && c.color === '#1c1620');
  assert.ok(gripIndex > lastWood, '握点必须在全部锤头像素之后绘制');
  const outline = calls[gripIndex], palm = calls[gripIndex + 1], shade = calls[gripIndex + 2];
  assert.deepEqual([outline.w, outline.h, outline.color], [6, 6, '#1c1620']);
  assert.deepEqual([palm.w, palm.h, palm.color], [4, 4, '#eabb94']);
  assert.deepEqual([shade.w, shade.h], [4, 1]);
  assert.ok(intersects(outline, palm));
  assert.ok(calls.some(c => c.color === '#986039' && intersects(c, palm)), '手掌必须压住锤柄握点');
  return palm;
}

await test('严格1200ms配置、260ms动画契约及浏览器共享导出', async () => {
  assert.equal(C.attackCooldownMs, 1200); assert.equal(T, 260);
  for (const key of ['spriteDirection', 'drawCharacterBody']) assert.equal(typeof WORLD[key], 'function');
  const source = await readFile(new URL('./shared/world.js', import.meta.url), 'utf8');
  for (const sandbox of [{ window: {} }, {}]) {
    runInNewContext(source, sandbox);
    const w = sandbox.window ? sandbox.window.WORLD : sandbox.WORLD;
    assert.equal(w.PLAY_CONFIG.attackCooldownMs, 1200); assert.equal(w.ATTACK_ANIMATION_MS, T);
    for (const [direction] of directions) assert.deepEqual(render(direction, T * .62, {}, direction, w), render(direction, T * .62));
  }
});
for (const [direction, input, dx, dy] of directions) {
  await test(`实际位移${direction}、意图不提前改外观、停止和相反键保持`, () => {
    const r = fixture(), p = r.find(0), old = position(p);
    r.setIntent(0, { ...input, spriteFacing: 'forged', facing: { x: 99, y: 99 }, x: 0, y: 0 });
    assert.deepEqual(position(p), old); assert.deepEqual(p.combat.facing, { x: dx, y: dy });
    r.step(.05);
    assert.deepEqual(position(p), [old[0] + dx * WORLD.SPEED * .05, old[1] + dy * WORLD.SPEED * .05, WORLD.SPEED * .05, direction]);
    const saved = position(p), facing = { ...p.combat.facing };
    for (const stop of [{}, { left: true, right: true }, { up: true, down: true }, { up: true, down: true, left: true, right: true }]) {
      move(r, 0, stop); assert.deepEqual(position(p), saved); assert.deepEqual(p.combat.facing, facing);
    }
    r.setIntent(0, input); r.step(0); assert.deepEqual(position(p), saved);
  });
}
await test('四个世界边界撞墙不改外观、walk不增加但战斗向量更新', () => {
  for (const [direction, input, dx, dy] of directions) {
    const r = fixture(), p = r.find(0);
    move(r, 0, { up: true });
    if (dx) p.x = dx > 0 ? WORLD.MAX_X : WORLD.MIN_X;
    if (dy) p.y = dy > 0 ? WORLD.MAX_Y : WORLD.MIN_Y;
    const saved = position(p);
    move(r, 0, input);
    assert.deepEqual(position(p), saved, direction); assert.deepEqual(p.combat.facing, { x: dx, y: dy });
  }
});
await test('家具足迹正撞保持、横向与纵向滑移只按实际可移动轴转身', () => {
  const f = WORLD.makeFurniture()[0].footprint;
  const r = fixture(), p = r.find(0);
  move(r, 0, { up: true }); p.x = f.x - WORLD.BODY_HALF; p.y = f.y + 10;
  assert.equal(WORLD.collidesAt(p.x, p.y, WORLD.makeFurniture()), false);
  let saved = position(p); move(r, 0, { right: true }); assert.deepEqual(position(p), saved);
  move(r, 0, { right: true, down: true });
  assert.equal(p.x, saved[0]); near(p.y - saved[1], WORLD.SPEED * .05 / Math.SQRT2, '纵滑位移');
  near(p.walk - saved[2], p.y - saved[1], '纵滑walk'); assert.equal(p.spriteFacing, 'front');
  p.x = f.x + 40; p.y = f.y - WORLD.FOOT_TOP; saved = position(p);
  move(r, 0, { right: true, down: true });
  assert.equal(p.y, saved[1]); near(p.x - saved[0], WORLD.SPEED * .05 / Math.SQRT2, '横滑位移');
  near(p.walk - saved[2], p.x - saved[0], '横滑walk'); assert.equal(p.spriteFacing, 'right');
});
await test('等轴四象限有效上一方向稳定、无效方向选纵轴、近等轴无抖动', () => {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const horizontal = sx < 0 ? 'left' : 'right', vertical = sy < 0 ? 'back' : 'front';
    for (const previous of ['front', 'back', 'left', 'right']) {
      const expected = [horizontal, vertical].includes(previous) ? previous : vertical;
      assert.equal(WORLD.spriteDirection(sx, sy, previous), expected);
      assert.equal(WORLD.spriteDirection(sx * (1 + 1e-8), sy, previous), expected);
      assert.equal(WORLD.spriteDirection(0, 0, previous), previous);
      const r = fixture(), p = r.find(0);
      const seed = directions.find(([d]) => d === previous)[1]; move(r, 0, seed);
      const input = { [sx < 0 ? 'left' : 'right']: true, [sy < 0 ? 'up' : 'down']: true };
      for (let i = 0; i < 12; i++) {
        const old = position(p); move(r, 0, input);
        near(p.x - old[0], sx * WORLD.SPEED * .05 / Math.SQRT2, '等轴x');
        near(p.y - old[1], sy * WORLD.SPEED * .05 / Math.SQRT2, '等轴y');
        near(p.walk - old[2], WORLD.SPEED * .05, '等轴walk'); assert.equal(p.spriteFacing, expected);
      }
    }
  }
  assert.equal(WORLD.spriteDirection(2, 1, 'front'), 'right');
  assert.equal(WORLD.spriteDirection(1, -2, 'left'), 'back');
});
await test('stun/freeze冻结外观和位移、截止边界及重新输入恢复', () => fixedClock(advance => {
  for (const field of ['stunUntil', 'freezeUntil']) {
    const r = fixture(), p = r.find(0); move(r, 0, { left: true });
    const duration = field === 'stunUntil' ? C.stunMs : C.freezeMs;
    p.combat[field] = r.now() + duration;
    const saved = position(p), facing = { ...p.combat.facing };
    move(r, 0, { right: true }); assert.deepEqual(position(p), saved); assert.deepEqual(p.combat.facing, facing); assert.deepEqual(p.input, blank);
    advance(duration - 1); p.input.down = true; r.step(.05); assert.deepEqual(position(p), saved); assert.deepEqual(p.input, blank);
    advance(1); r.step(.05); assert.deepEqual(position(p), saved);
    move(r, 0, { right: true }); assert.equal(p.x, saved[0] + 8); assert.equal(p.spriteFacing, 'right');
  }
}));
await test('离线/结束不移动或转身；幽灵（dev 合并语义）可移动但不可行动', () => {
  for (const state of ['offline', 'finished']) {
    const r = fixture(), p = r.find(1); move(r, 1, { left: true }); const saved = position(p), facing = { ...p.combat.facing };
    if (state === 'offline') r.setOffline(1); if (state === 'finished') r.finish();
    move(r, 1, { right: true }); assert.deepEqual(position(p), saved); assert.deepEqual(p.combat.facing, facing);
    r.setIntent(1, {}); assert.deepEqual(p.input, blank);
  }
  // 合并适配：dev 分支把淘汰者变成可穿家具、可吓人的幽灵，因此「已淘汰」不再冻结移动；
  // 这里改为断言幽灵确实能移动，同时仍不能攻击 / 跳跃 / 挥锤 / 使用身份技能。
  const r = fixture(), p = r.find(1);
  p.x = 500; p.y = 350; p.walk = 0; // 层内安全点：fixture 的 1600 超出 1F 可行走范围，会被边界钳住
  move(r, 1, { left: true }); const saved = position(p);
  p.alive = false;
  p.x = 500; p.input = { up: false, down: false, left: false, right: false };
  move(r, 1, { right: true });
  assert.notDeepEqual(position(p), saved);
  assert.equal(r.attack(p.sessionId, { commandId: nonce() }).ok, false);
  assert.equal(r.performAction(p.id, 'jump').ok, false);
  assert.equal(r.performAction(p.id, 'hammer').ok, false);
  assert.equal(r.useSkill(p.sessionId, { commandId: nonce(), skill: 'probe', targetId: r.find(0).id }).ok, false);
  r.setIntent(1, {}); assert.deepEqual(p.input, blank);
});
await test('重连保留外观、方向锁定、控制与CD；公私投影向量深拷贝且不泄露私密字段', () => fixedClock(() => {
  const r = fixture(), p = r.find(0); move(r, 0, { left: true }); assert.equal(attack(r).ok, true);
  move(r, 0, { down: true }); p.combat.freezeUntil = r.now() + C.freezeMs;
  const saved = position(p), combat = structuredClone(p.combat);
  r.setOffline(0); const joined = r.join(p.sessionId, '不改名'); assert.equal(joined.revived, true); assert.equal(joined.player, p);
  assert.deepEqual(position(p), saved); assert.deepEqual(p.combat, combat); assert.deepEqual(p.input, blank);
  const pub = r.publicSnapshot().players[0], me = r.privateSnapshot(0).me;
  assert.equal(pub.spriteFacing, 'front'); assert.equal(me.spriteFacing, 'front'); assert.deepEqual(me.combat, combat);
  for (const key of ['facing', 'lastAttackFacing', 'lastAttackDirection', 'lastAttackAt', 'stunUntil', 'freezeUntil']) assert.deepEqual(pub[key], combat[key]);
  for (const key of ['combat', 'hp', 'skills', 'faction', 'sessionId', 'games', 'exploration']) assert.ok(!(key in pub), key);
  pub.facing.x = 99; pub.lastAttackFacing.x = 99; me.combat.facing.x = 99; me.combat.lastAttackFacing.x = 99;
  assert.deepEqual(p.combat, combat);
}));
for (const [direction] of directions) {
  await test(`木锤${direction}各阶段不同、全程手握运动与木纹、整数像素调用`, () => {
    const ages = [0, T * .11, T * .22, T * .42, T * .62, T * .81, T * .88];
    const frames = ages.map(age => render(direction, age));
    assert.equal(new Set(frames.map(c => JSON.stringify(c))).size, ages.length);
    assert.equal(new Set(frames.map(c => JSON.stringify(grip(c)))).size, ages.length);
    for (const calls of frames) {
      const colors = new Set(wood(calls).map(c => c.color));
      for (const color of woodColors) assert.ok(colors.has(color), `${direction}缺少${color}`);
      assert.ok(wood(calls).some(c => c.w === 1 && c.h === 1)); grip(calls);
    }
    const keyHands = direction === 'back' ? [[-14, -19], [-21, -36], [-17, -43]]
      : ['left', 'right'].includes(direction) ? [[2, -17], [-5, -40], [16, -23]] : [[14, -17], [21, -38], [10, -12]];
    for (const [i, age] of [0, T * .22, T * .62].entries()) {
      const palm = grip(render(direction, age)), [x, y] = keyHands[i];
      assert.equal(palm.x + 2, 100 + (direction === 'left' ? -x : x)); assert.equal(palm.y + 2, 100 + y);
    }
  });
  await test(`木锤${direction}动画首末边界、非法age与淘汰不绘武器`, () => {
    const idle = render(direction);
    for (const age of [null, undefined, NaN, Infinity, -1, T, T + 1]) assert.deepEqual(render(direction, age), idle);
    for (const age of [0, T - .001]) assert.ok(wood(render(direction, age)).length > 0);
    assert.deepEqual(render(direction, 0, { alive: false }), render(direction, null, { alive: false }));
  });
}
await test('左右全调用严格镜像、前景/背后深度绘制、四向图形确实不同', () => {
  for (const age of [0, T * .22, T * .42, T * .62, T - 1]) {
    const right = render('right', age), left = render('left', age);
    assert.deepEqual(left, right.map(c => ({ ...c, x: 200 - c.x - c.w })));
    const frames = directions.map(([d]) => render(d, age));
    assert.equal(new Set(frames.map(c => JSON.stringify(c))).size, 4);
    for (const [direction] of directions) {
      const calls = render(direction, age), firstWood = calls.findIndex(c => woodColors.has(c.color));
      const torso = calls.findIndex(c => c.color === WORLD.PALETTES.top[0][1] && c.h === 16);
      assert.ok(torso >= 0);
      assert.equal(firstWood < torso, direction === 'back', direction);
      const hand = grip(calls); assert.equal(calls.indexOf(hand) < torso, direction === 'back');
    }
  }
});
await test('蓄力/击打/收势阶段交界连续，移动摆步仍握紧锤柄', () => {
  for (const [direction] of directions) {
    for (const boundary of [T * .22, T * .62]) {
      const hands = [-.001, 0, .001].map(offset => grip(render(direction, boundary + offset)));
      for (const hand of hands) {
        assert.ok(Math.abs(hand.x - hands[1].x) <= 1); assert.ok(Math.abs(hand.y - hands[1].y) <= 1);
      }
    }
    for (const walk of [8, 24, 48]) for (const age of [0, T * .22, T * .62, T - 1]) {
      grip(render(direction, age, { moving: true, walk }));
    }
  }
});
await test('传入锁定攻击方向覆盖移动外观、动画结束回到当前外观', () => {
  for (const [direction] of directions) for (const [sprite] of directions) {
    assert.deepEqual(render(sprite, T * .42, {}, direction), render(direction, T * .42));
    assert.deepEqual(render(sprite, T, {}, direction), render(sprite));
  }
});
for (const [direction, input, dx, dy] of directions) {
  await test(`攻击${direction}命中无伤害、方向锁定、转身后不能改写本次挥击`, () => fixedClock(() => {
    const r = fixture(), a = r.find(0), b = r.find(1); move(r, 0, input); r.setIntent(0, {});
    b.x = a.x + dx * 30; b.y = a.y + dy * 30;
    const before = structuredClone(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills, exploration: p.exploration, games: p.games })));
    const logs = structuredClone(r.room.logs), pending = structuredClone([...r.room.pending]);
    const result = attack(r, 0, { facing: { x: -dx, y: -dy }, lastAttackDirection: 'forged', targetId: 3 });
    assert.equal(result.ok, true); assert.equal(result.hitId, b.id); assert.ok(!('hp' in result));
    assert.equal(a.combat.lastAttackDirection, direction); assert.deepEqual(a.combat.lastAttackFacing, { x: dx, y: dy });
    assert.notEqual(a.combat.lastAttackFacing, a.combat.facing);
    assert.equal(b.combat.stunUntil, a.combat.lastAttackAt + C.stunMs); assert.equal(b.combat.freezeUntil, a.combat.lastAttackAt + C.freezeMs);
    assert.deepEqual(r.room.players.map(p => ({ hp: p.hp, alive: p.alive, skills: p.skills, exploration: p.exploration, games: p.games })), before);
    assert.deepEqual(r.room.logs, logs); assert.deepEqual([...r.room.pending], pending); assert.equal(r.room.eliminateEvents, 0); assert.equal(r.room.finished, false);
    const next = directions.find(([, , nx, ny]) => nx === -dx && ny === -dy);
    move(r, 0, next[1]); assert.equal(a.spriteFacing, next[0]); assert.deepEqual(a.combat.facing, { x: next[2], y: next[3] });
    assert.equal(a.combat.lastAttackDirection, direction); assert.deepEqual(a.combat.lastAttackFacing, { x: dx, y: dy });
    result.combat.lastAttackFacing.x = 99; assert.deepEqual(a.combat.lastAttackFacing, { x: dx, y: dy });
  }));
}
await test('攻击方向取意图而非撞墙外观，等轴攻击方向采用有效外观', () => fixedClock(() => {
  const r = fixture(), p = r.find(0); move(r, 0, { up: true }); p.x = WORLD.MAX_X;
  move(r, 0, { right: true }); assert.equal(p.spriteFacing, 'back');
  assert.equal(attack(r).combat.lastAttackDirection, 'right');
  const q = fixture(), a = q.find(0); move(q, 0, { left: true });
  q.setIntent(0, { left: true, up: true });
  const result = attack(q); assert.equal(result.combat.lastAttackDirection, 'left');
  assert.deepEqual(result.combat.lastAttackFacing, { x: -1 / Math.SQRT2, y: -1 / Math.SQRT2 });
  move(q, 0, { down: true }); assert.equal(a.spriteFacing, 'front'); assert.equal(a.combat.lastAttackDirection, 'left');
}));
for (const hit of [false, true]) {
  await test(`${hit ? '命中' : '空挥'}1199ms拒绝/1200ms接受、失败nonce可重试与成功nonce永久防重`, () => fixedClock(advance => {
    const r = fixture(), a = r.find(0), b = r.find(1);
    if (hit) { b.x = a.x + 30; b.y = a.y; }
    const id = nonce(), retryId = nonce(), result = attack(r, 0, { commandId: id });
    assert.equal(result.ok, true); assert.equal(result.hitId, hit ? 1 : undefined);
    assert.equal(a.combat.attackUntil - a.combat.lastAttackAt, C.attackCooldownMs);
    const t = a.combat.lastAttackAt, hp = b.hp, saved = structuredClone(a.combat);
    advance(C.attackCooldownMs - 1);
    assert.equal(attack(r, 0, { commandId: retryId }).ok, false); assert.equal(r.room.processed.has(retryId), false);
    assert.deepEqual(a.combat, saved); assert.equal(attack(r, 0, { commandId: id }).ok, false);
    advance(1);
    assert.equal(attack(r, 0, { commandId: id }).ok, false); assert.deepEqual(a.combat, saved);
    assert.equal(attack(r, 0, { commandId: retryId }).ok, true); assert.equal(a.combat.lastAttackAt, t + 1200);
    assert.equal(b.hp, hp); assert.equal(b.alive, true);
    advance(C.attackCooldownMs * 10);
    assert.equal(attack(r, 0, { commandId: id }).ok, false); assert.equal(attack(r, 0, { commandId: retryId }).ok, false);
    assert.ok(r.room.processed.has(id)); assert.ok(r.room.processed.has(retryId));
    const skill = r.useSkill(a.sessionId, { commandId: id, skill: 'probe', targetId: 2 }); assert.equal(skill.ok, false);
    const p = r.find(2), npc = WORLD.NPCS[0]; p.x = npc.x; p.y = npc.y;
    assert.equal(r.play(p.sessionId, { commandId: id, kind: 'wheel', entityId: npc.id }).ok, false);
  }));
}
console.log(`移动攻击专项：${passed}项通过，${failed}项失败；零依赖mock canvas，无浏览器或输出文件。`);
if (failed) process.exitCode = 1;
