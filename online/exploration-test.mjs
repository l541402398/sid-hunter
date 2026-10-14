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
const { createRoom, WORLD, SKILL_CONFIG } = require('./room.js');
const furniture = WORLD.makeFurniture();
const containers = furniture.filter(f => f.container);
const reception = containers.find(f => f.type === 'reception');
const cabinet = containers.find(f => f.type === 'cabinet');
const tables = containers.filter(f => f.type === 'table');
const desk = containers.find(f => f.type === 'desk');
const npc = WORLD.NPCS[0];
const blank = () => ({ chips: 0, clues: [], searched: [] });
let sequence = 0, passed = 0, failed = 0;
const command = () => `exploration-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}
function fixture(count = 4) {
  const r = createRoom();
  for (let i = 0; i < count; i++) r.join(`session-${i}`, `测试玩家${i}`);
  return r;
}
function near(p, entity) {
  p.x = entity.footprint ? entity.footprint.x + entity.footprint.w / 2 : entity.x;
  p.y = entity.footprint ? entity.depth + 12 : entity.y;
}
function action(r, actor, kind, entity, more = {}) {
  return r.interact(actor.sessionId, { commandId: command(), kind, entityId: entity.id, ...more });
}
function skill(r, actor, kind, target, more = {}) {
  return r.useSkill(actor.sessionId, { commandId: command(), skill: kind, targetId: target.id, ...more });
}
function clueValid(r, actor, clue) {
  assert.deepEqual(Object.keys(clue).sort(), ['id', 'targetId', 'targetName', 'key', 'label', 'value', 'source', 'text'].sort());
  const target = r.find(clue.targetId);
  assert.ok(target.alive && target.id !== actor.id);
  assert.equal(clue.targetName, target.name);
  assert.equal(clue.value, target.traits[clue.key]);
  assert.equal(clue.label, WORLD.TRAIT_NAMES[clue.key]);
  assert.ok(clue.id && clue.source && clue.text.includes(clue.value));
}

await test('01 WORLD 在普通浏览器脚本、globalThis 和 CommonJS 中合约一致', async () => {
  const source = await readFile(new URL('./shared/world.js', import.meta.url), 'utf8');
  for (const sandbox of [{ window: {} }, {}]) {
    runInNewContext(source, sandbox);
    const w = sandbox.window ? sandbox.window.WORLD : sandbox.WORLD;
    for (const key of ['makeFurniture', 'collidesAt', 'coverFor', 'pointOccluded', 'distanceToEntity']) assert.equal(typeof w[key], 'function');
    assert.equal(JSON.stringify(w.makeFurniture()), JSON.stringify(furniture));
    assert.equal(JSON.stringify(w.NPCS), JSON.stringify(WORLD.NPCS));
    assert.equal(w.INTERACT_RANGE, 64);
  }
});
await test('02 现有家具坐标不变，稳定独立 id、9 个中性命名容器及两个 NPC', () => {
  assert.equal(furniture.length, 29);
  assert.deepEqual(WORLD.makeFurniture(), furniture);
  assert.equal(new Set(furniture.map(f => f.id)).size, 29);
  assert.equal(containers.length, 9);
  assert.deepEqual(containers.map(f => f.id).sort(), ['cabinet-785-160', 'reception-132-173', 'desk-1035-172', 'desk-1690-172', 'desk-2940-172', 'desk-3600-172', 'counter-1990-165', 'table-2010-514', 'table-2535-513'].sort());
  for (const f of furniture) {
    assert.equal(f.depth, f.y + f.h);
    assert.ok(f.footprint.y > f.y && f.footprint.y + f.footprint.h === f.depth);
    assert.deepEqual(Object.keys(f).sort(), ['id', 'x', 'y', 'w', 'h', 'type', 'footprint', 'depth', ...(f.container ? ['container'] : [])].sort());
    if (f.container) { assert.deepEqual(Object.keys(f.container), ['name']); assert.ok(!/线索|筹码|奖励/.test(f.container.name)); }
  }
  const second = WORLD.makeFurniture(); second[0].footprint.y = -1;
  assert.notEqual(furniture[0].footprint.y, -1);
  assert.deepEqual(WORLD.NPCS.map(n => [n.id, n.name, n.x, n.y, n.cost]), [['npc-reception', '接待员小禾', 520, 285, 3], ['npc-archive', '档案员阿卷', 3300, 360, 3]]);
  for (const n of WORLD.NPCS) { assert.ok(n.dialogue); assert.ok(!('color' in n)); }
});
await test('03 身体/脚可进入视觉上部，底部足迹阻挡且严格接触边界不阻挡', () => {
  for (const f of furniture) {
    const x = f.x + f.w / 2;
    assert.equal(WORLD.collidesAt(x, f.y + 10, [f]), false);
    assert.equal(WORLD.collidesAt(x, f.footprint.y + 5, [f]), true);
    assert.equal(WORLD.collidesAt(x, f.footprint.y - WORLD.FOOT_TOP, [f]), false);
    assert.equal(WORLD.collidesAt(x, f.depth + WORLD.FOOT_BOTTOM, [f]), false);
    assert.equal(WORLD.collidesAt(f.x - WORLD.BODY_HALF, f.depth - 8, [f]), false);
    assert.equal(WORLD.collidesAt(f.x + f.w + WORLD.BODY_HALF, f.depth - 8, [f]), false);
  }
});
await test('04 身体重叠 0.22 阈值、前后景深度与点击遮挡独立判断', () => {
  const p = { x: 100, y: 100 };
  const f = { id: 'synthetic', x: 79, y: 47, w: 42, h: 61 * 0.22, depth: 200 };
  assert.equal(WORLD.coverFor(p, [f]), f);
  assert.equal(WORLD.coverFor(p, [{ ...f, h: f.h - 0.01 }]), null);
  assert.equal(WORLD.coverFor({ ...p, y: 200 }, [f]), null);
  assert.equal(WORLD.coverFor({ x: 1000, y: 100 }, [f]), null);
  const front = { ...f, depth: 220 };
  assert.equal(WORLD.coverFor(p, [front, f]), front);
  assert.equal(WORLD.pointOccluded(90, 50, p, [f]), true);
  assert.equal(WORLD.pointOccluded(90, 90, p, [f]), false);
  assert.equal(WORLD.pointOccluded(90, 50, { ...p, y: 200 }, [f]), false);
  // 点击点即使处于身体包围盒外，前景绘制矩形仍不可穿透点击。
  assert.equal(WORLD.pointOccluded(79, 47, { x: 500, y: 100 }, [f]), true);
});
await test('05 距离使用最近足迹点，NPC 使用点距离且包含对角距离', () => {
  const f = reception.footprint;
  assert.equal(WORLD.distanceToEntity({ x: f.x + 5, y: f.y + 5 }, reception), 0);
  assert.equal(WORLD.distanceToEntity({ x: f.x - 3, y: f.y - 4 }, reception), 5);
  assert.equal(WORLD.distanceToEntity({ x: npc.x + 3, y: npc.y + 4 }, npc), 5);
  assert.equal(WORLD.distanceToEntity({ x: cabinet.x + 10, y: cabinet.y }, cabinet), cabinet.footprint.y - cabinet.y);
});
await test('06 step 限制 dt、walk 为实际距离、滑动/碰撞/边界/离线/存活', () => {
  const r = fixture(), p = r.find(0);
  p.x = 430; p.y = 340; r.setIntent(p.id, { right: true }); r.step(10);
  assert.equal(p.x, 438); assert.equal(p.walk, 8);
  r.step(-1); r.step(NaN); r.step(Infinity); assert.equal(p.x, 438);
  p.x = WORLD.MAX_X; p.walk = 0; r.step(0.05); assert.equal(p.walk, 0);
  p.x = 200; p.y = reception.footprint.y - WORLD.FOOT_TOP; p.walk = 0;
  r.setIntent(p.id, { down: true }); r.step(0.05); assert.equal(p.walk, 0);
  r.setIntent(p.id, { right: true, down: true }); r.step(0.05);
  assert.equal(p.y, reception.footprint.y - WORLD.FOOT_TOP); assert.ok(Math.abs(p.walk - 8 / Math.SQRT2) < 1e-8);
  const oldX = p.x; r.setOffline(p.id); r.setIntent(p.id, { right: true }); r.step(0.05); assert.equal(p.x, oldX);
  p.online = true; p.alive = false; r.step(0.05); assert.equal(p.x, oldX);
  p.alive = true; r.finish(); r.step(0.05); assert.equal(p.x, oldX);
});
await test('07 无身份/缺命令/非法 kind/实体/类型/远距离拒绝，客户端坐标不可冒充', () => {
  const r = fixture(), p = r.find(0);
  assert.equal(r.interact('invalid', { commandId: command(), kind: 'search', entityId: reception.id }).ok, false);
  for (const body of [null, {}, { commandId: 12 }, { commandId: '  ', kind: 'search', entityId: reception.id }, { commandId: command(), kind: 'bad' }, { commandId: command(), kind: 'search', entityId: npc.id }, { commandId: command(), kind: 'exchange', entityId: reception.id }, { commandId: command(), kind: 'search', entityId: furniture.find(f => !f.container).id }, { commandId: command(), kind: 'search', entityId: '__proto__' }]) assert.equal(r.interact(p.sessionId, body).ok, false);
  assert.equal(action(r, p, 'search', reception, { x: reception.x, y: reception.depth }).ok, false);
  assert.deepEqual(p.exploration, blank());
});
await test('08 距离 64 允许、超过 64 拒绝，搜索奖励停止移动和指令重复', () => {
  const r = fixture(), p = r.find(0), f = reception.footprint;
  p.x = f.x - 64.01; p.y = f.y + 2;
  const id = command(); assert.equal(action(r, p, 'search', reception, { commandId: id }).ok, false);
  p.x = f.x - 64; r.setIntent(p.id, { right: true });
  const result = action(r, p, 'search', reception, { commandId: id });
  assert.equal(result.ok, true); assert.equal(result.exploration.chips, 3);
  assert.deepEqual(p.input, { up: false, down: false, left: false, right: false });
  const position = [p.x, p.y]; r.step(0.05); assert.deepEqual([p.x, p.y], position);
  assert.equal(action(r, p, 'search', reception, { commandId: id }).ok, false);
  assert.equal(action(r, p, 'search', reception).ok, false); assert.equal(p.exploration.chips, 3);
});
await test('09 搜索按玩家独立，全部筹码容器 +2（接待台 +3）', () => {
  const r = fixture();
  for (const p of [r.find(0), r.find(1)]) {
    for (const f of containers.filter(f => !['cabinet', 'table'].includes(f.type))) {
      near(p, f); const before = p.exploration.chips;
      assert.equal(action(r, p, 'search', f).ok, true);
      assert.equal(p.exploration.chips - before, f.type === 'reception' ? 3 : 2);
    }
    assert.equal(p.exploration.chips, 13); assert.equal(p.exploration.searched.length, 6);
  }
});
await test('10 cabinet/table 奖励真实私人线索，跨搜索/NPC 全局去重', () => {
  const r = fixture(), p = r.find(1);
  for (const f of [cabinet, ...tables]) { near(p, f); assert.equal(action(r, p, 'search', f).ok, true); }
  assert.equal(p.exploration.clues.length, 3); assert.equal(p.exploration.chips, 0);
  p.exploration.chips = 30;
  for (const n of WORLD.NPCS) { near(p, n); assert.equal(action(r, p, 'exchange', n).ok, true); }
  for (const clue of p.exploration.clues) clueValid(r, p, clue);
  assert.equal(new Set(p.exploration.clues.map(c => `${c.targetId}:${c.key}`)).size, 5);
  assert.equal(new Set(p.exploration.clues.map(c => c.id)).size, 5);
});
await test('11 线索不修改公开属性/SID/技能/公共日志/目标事件且私有数据深拷贝', () => {
  const r = fixture(), p = r.find(0), publicBefore = r.publicSnapshot();
  const skillsBefore = JSON.stringify(p.skills), targetPending = r.privateSnapshot(1).me.pending;
  near(p, cabinet); const result = action(r, p, 'search', cabinet);
  assert.equal(result.ok, true);
  const publicAfter = r.publicSnapshot();
  assert.deepEqual(publicAfter.logs, publicBefore.logs);
  for (const visible of publicAfter.players) {
    assert.ok(!('exploration' in visible)); assert.ok(!('faction' in visible)); assert.ok(!('hp' in visible));
    assert.deepEqual(visible.traits, { saying: '***', food: '***', sport: '***' }); assert.equal(visible.sid, '***-***-***');
  }
  assert.equal(JSON.stringify(p.skills), skillsBefore);
  assert.deepEqual(r.privateSnapshot(1).me.pending, targetPending);
  assert.deepEqual(r.privateSnapshot(1).me.exploration, blank());
  const privateCopy = r.privateSnapshot(p.id).me.exploration;
  privateCopy.clues[0].value = '篡改'; privateCopy.searched.push('fake'); privateCopy.chips = 100;
  result.exploration.clues[0].text = '篡改'; result.exploration.searched.length = 0;
  assert.notEqual(p.exploration.clues[0].value, '篡改'); assert.notEqual(p.exploration.clues[0].text, '篡改');
  assert.deepEqual(p.exploration.searched, [cabinet.id]); assert.equal(p.exploration.chips, 0);
});
await test('12 单人/全部已公开/仅淘汰目标无线索时搜索补偿 +2 不浪费', () => {
  for (const scenario of ['solo', 'public', 'dead']) {
    const r = fixture(scenario === 'solo' ? 1 : 3), p = r.find(0);
    for (const target of r.room.players.slice(1)) {
      if (scenario === 'public') target.traitPublic = { saying: true, food: true, sport: true };
      else target.alive = false;
    }
    near(p, cabinet); assert.equal(action(r, p, 'search', cabinet).ok, true);
    assert.equal(p.exploration.chips, 2); assert.equal(p.exploration.clues.length, 0);
    assert.deepEqual(p.exploration.searched, [cabinet.id]); assert.equal(action(r, p, 'search', cabinet).ok, false);
  }
});
await test('13 兑换不足/距离/有效 NPC/存活/局结束校验不扣筹码或消耗指令', () => {
  const r = fixture(), p = r.find(0); near(p, npc); p.exploration.chips = 2;
  const id = command(); assert.equal(action(r, p, 'exchange', npc, { commandId: id }).ok, false);
  assert.equal(p.exploration.chips, 2); p.exploration.chips = 3;
  assert.equal(action(r, p, 'exchange', npc, { commandId: id }).ok, true); assert.equal(p.exploration.chips, 0);
  p.exploration.chips = 10; p.x += 64.01;
  assert.equal(action(r, p, 'exchange', npc).ok, false); assert.equal(p.exploration.chips, 10);
  near(p, npc); p.alive = false;
  assert.equal(action(r, p, 'exchange', npc).ok, false); p.alive = true; r.finish();
  assert.equal(action(r, p, 'exchange', npc).ok, false); assert.equal(p.exploration.chips, 10);
});
await test('14 兑换耗尽真实库存、重复/无线索不扣费且存活离线目标可获线索', () => {
  const r = fixture(2), p = r.find(0); r.setOffline(1); near(p, npc); p.exploration.chips = 20;
  const id = command(); assert.equal(action(r, p, 'exchange', npc, { commandId: id }).ok, true);
  assert.equal(action(r, p, 'exchange', npc, { commandId: id }).ok, false); assert.equal(p.exploration.chips, 17);
  for (let i = 0; i < 2; i++) assert.equal(action(r, p, 'exchange', npc).ok, true);
  assert.equal(p.exploration.chips, 11); assert.equal(p.exploration.clues.length, 3);
  const before = JSON.stringify(p.exploration); assert.equal(action(r, p, 'exchange', npc).ok, false);
  assert.equal(JSON.stringify(p.exploration), before);
  near(p, cabinet); assert.equal(action(r, p, 'search', cabinet).ok, true); assert.equal(p.exploration.chips, 13);
});
await test('15 新线索跳过已公开属性及淘汰目标，库存不足不先扣费用', () => {
  const r = fixture(), p = r.find(0); r.find(1).alive = false;
  r.find(2).traitPublic.saying = true; r.find(3).traitPublic = { saying: true, food: true, sport: true };
  near(p, npc); p.exploration.chips = 9;
  for (let i = 0; i < 2; i++) { assert.equal(action(r, p, 'exchange', npc).ok, true); assert.equal(p.exploration.clues.at(-1).targetId, 2); }
  assert.deepEqual(p.exploration.clues.map(c => c.key), ['food', 'sport']);
  assert.equal(action(r, p, 'exchange', npc).ok, false); assert.equal(p.exploration.chips, 3);
});
await test('16 搜索淘汰/局结束/无身份拒绝，重连保持状态与搜索记录，重置清空', () => {
  const r = fixture(), p = r.find(0); near(p, reception); assert.equal(action(r, p, 'search', reception).ok, true);
  near(p, cabinet); assert.equal(action(r, p, 'search', cabinet).ok, true);
  const saved = r.privateSnapshot(p.id).me.exploration;
  r.setOffline(p.id); assert.equal(r.join(p.sessionId, '不同名字').revived, true);
  assert.deepEqual(r.privateSnapshot(p.id).me.exploration, saved); assert.equal(action(r, p, 'search', cabinet).ok, false);
  near(p, desk); p.alive = false; assert.equal(action(r, p, 'search', desk).ok, false); p.alive = true;
  r.finish(); assert.equal(action(r, p, 'search', desk).ok, false); assert.deepEqual(p.exploration, saved);
  const used = [...r.room.processed.keys()][0]; r.reset(); assert.equal(r.playerBySession(p.sessionId), null);
  assert.equal(action(r, p, 'search', desk).ok, false); assert.equal(r.room.processed.size, 0);
  const fresh = r.join(p.sessionId, '新玩家').player; assert.deepEqual(fresh.exploration, blank()); near(fresh, reception);
  assert.equal(action(r, fresh, 'search', reception, { commandId: used }).ok, true);
});
await test('17 原有技能不加距离限制、好坏技能权限与公开掩码保持', () => {
  const r = fixture(), bad = r.find(0), good = r.find(1), target = r.find(2);
  bad.x = good.x = 20; target.x = 3800;
  assert.deepEqual(Object.keys(bad.skills), ['probe', 'accuse', 'spy', 'kill']);
  assert.deepEqual(Object.keys(good.skills), ['probe', 'accuse']);
  assert.equal(skill(r, good, 'spy', target).ok, false); assert.equal(skill(r, good, 'kill', target, { sid: target.sid.segments.join('-') }).ok, false);
  assert.equal(skill(r, bad, 'probe', target).ok, true); assert.equal(target.traitPublic.saying, true);
  assert.equal(skill(r, bad, 'spy', target).ok, true); assert.equal(target.sid.revealed[0], true);
  const visible = r.publicProjection(target);
  assert.equal(visible.traits.saying, target.traits.saying); assert.equal(visible.traits.food, '***');
  assert.equal(visible.sid, `${target.sid.segments[0]}-***-***`);
  assert.equal(skill(r, good, 'accuse', bad).ok, true); assert.equal(bad.hp, 1);
});
await test('18 技能冷却/次数恢复/命令去重/SID校验/局结束保持', () => {
  const r = fixture(), bad = r.find(0), target = r.find(2), extra = r.find(3);
  const id = command(); assert.equal(skill(r, bad, 'probe', target, { commandId: id }).ok, true);
  assert.equal(skill(r, bad, 'probe', target, { commandId: id }).ok, false);
  assert.equal(skill(r, bad, 'probe', target).ok, false); assert.equal(bad.skills.probe.chargesRemaining, 1);
  r.room.clockOffset += 8100; assert.equal(skill(r, bad, 'probe', target).ok, true); assert.equal(bad.skills.probe.chargesRemaining, 0);
  r.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3;
  assert.equal(r.privateSnapshot(bad.id).me.skills.probe.chargesRemaining, 2);
  assert.equal(skill(r, bad, 'kill', target, { sid: 'aaa-aaa-aaa' }).ok, false); assert.equal(bad.skills.kill.chargesRemaining, 2);
  const wrong = target.sid.segments[0][0] === 'A' ? 'BBB-BBB-BBB' : 'AAA-AAA-AAA';
  assert.equal(skill(r, bad, 'kill', target, { sid: wrong }).ok, true); assert.equal(target.alive, true);
  r.room.clockOffset += 13000; assert.equal(skill(r, bad, 'kill', target, { sid: target.sid.segments.join('-') }).ok, true);
  assert.equal(r.room.finished, false); r.room.clockOffset += 100000;
  assert.equal(skill(r, bad, 'kill', extra, { sid: extra.sid.segments.join('-') }).ok, true);
  // 新结束规则：存活人数降到 2 人不再结束对局，改为时间到（2 小时）结束。
  assert.equal(r.room.finished, false);
  r.room.clockOffset += WORLD.RULES.timeLimitMs;
  assert.equal(skill(r, bad, 'probe', r.find(1)).ok, false);
  assert.equal(r.room.finished, true); assert.equal(r.room.finishReason, 'timeUp');
  near(bad, reception); assert.equal(action(r, bad, 'search', reception).ok, false);
});
await test('19 搜索与技能共享命令去重，不让同一成功指令跨接口重复结算', () => {
  const r = fixture(), p = r.find(0), target = r.find(1), id = command(); near(p, reception);
  assert.equal(action(r, p, 'search', reception, { commandId: id }).ok, true);
  assert.equal(skill(r, p, 'probe', target, { commandId: id }).ok, false);
  const next = command(); assert.equal(skill(r, p, 'probe', target, { commandId: next }).ok, true);
  near(p, npc); assert.equal(action(r, p, 'exchange', npc, { commandId: next }).ok, false); assert.equal(p.exploration.chips, 3);
});

await test('19b 无线索失败不锁命令，新增真实目标后可重试并停止移动', () => {
  const r = fixture(1), p = r.find(0), n = WORLD.NPCS[1]; near(p, n); p.exploration.chips = 6;
  const id = command(); assert.equal(action(r, p, 'exchange', n, { commandId: id }).ok, false);
  assert.equal(p.exploration.chips, 6); assert.equal(r.room.processed.has(id), false);
  r.join('new-target', '新增目标'); r.setIntent(p.id, { right: true, up: true });
  assert.equal(action(r, p, 'exchange', n, { commandId: id }).ok, true);
  assert.equal(p.exploration.chips, 3); clueValid(r, p, p.exploration.clues[0]);
  assert.deepEqual(p.input, { up: false, down: false, left: false, right: false });
  const position = [p.x, p.y]; r.step(0.05); assert.deepEqual([p.x, p.y], position);
});

const freePort = () => new Promise((resolve, reject) => {
  const server = createServer(); server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(error => error ? reject(error) : resolve(port)); });
});
let child, base, a, b, csrf;
let serverOutput = '';
async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Sid-Session': token } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
  return { status: response.status, headers: response.headers, data: await response.json() };
}
const httpAction = (token, kind, entity, more = {}) => request('/api/interact', { method: 'POST', token, body: { commandId: command(), kind, entityId: entity.id, ...more } });
async function moveTo(token, x, y) {
  // 使用真实输入和权威状态移动，不额外增加测试传送或修改玩家的 HTTP 后门。
  try {
    for (const [axis, value] of [['x', x], ['y', y]]) {
      let moving = '';
      const deadline = Date.now() + 12000;
      while (true) {
        const state = (await request('/api/state', { token })).data;
        const p = state.players.find(p => p.id === state.me.id), diff = value - p[axis];
        if (Math.abs(diff) <= 9) break;
        assert.ok(Date.now() < deadline, `移动超时：${axis}=${p[axis]}，目标 ${value}`);
        const key = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
        if (moving !== key) { await request('/api/input', { method: 'POST', token, body: { [key]: true } }); moving = key; }
        await pause(25);
      }
      await request('/api/input', { method: 'POST', token, body: {} });
    }
  } finally { await request('/api/input', { method: 'POST', token, body: {} }); }
}
try {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_DEV: '1', SID_TEST: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`HTTP 服务启动超时\n${serverOutput}`)), 10000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`HTTP 服务提前退出 ${code}\n${serverOutput}`)); });
    child.stderr.on('data', data => { serverOutput += data; });
    child.stdout.on('data', data => { serverOutput += data; if (serverOutput.includes('技能次数恢复周期:')) { clearTimeout(timer); resolve(); } });
  });
  await test('20 HTTP 身份授权与 skill 一致，私有 state、只托管共享地图不托管 room', async () => {
    assert.equal((await request('/api/state')).status, 401);
    assert.equal((await httpAction(null, 'search', reception)).status, 400);
    assert.equal((await httpAction('forged', 'search', reception)).data.ok, false);
    a = (await request('/api/join', { method: 'POST', body: { nickname: 'HTTP甲' } })).data;
    b = (await request('/api/join', { method: 'POST', body: { nickname: 'HTTP乙' } })).data;
    assert.deepEqual((await request('/api/state', { token: a.sessionToken })).data.me.exploration, blank());
    const forged = await httpAction(null, 'search', reception, { sessionId: a.sessionToken, playerId: a.playerId, x: 200, y: 250 });
    assert.equal(forged.data.ok, false);
    assert.equal((await request('/api/state', { headers: { Cookie: `sid_session=${a.sessionToken}` } })).data.me.id, a.playerId);
    const shared = await fetch(base + '/shared/world.js'); assert.equal(shared.status, 200);
    const text = await shared.text(); assert.ok(!text.includes('EXPLORATION_REWARDS'));
    assert.equal((await request('/room.js')).status, 404); assert.equal((await request('/api/test/state')).status, 404);
  });
  await test('21 HTTP 真实移动靠近搜索/重复/兑换/重连，别人 state 不包含探索', async () => {
    assert.equal((await httpAction(a.sessionToken, 'search', reception, { x: 200, y: 250 })).data.ok, false);
    await moveTo(a.sessionToken, 220, 275);
    const id = command(), result = await httpAction(a.sessionToken, 'search', reception, { commandId: id });
    assert.equal(result.status, 200); assert.equal(result.data.exploration.chips, 3);
    assert.equal((await httpAction(a.sessionToken, 'search', reception, { commandId: id })).status, 400);
    assert.equal((await httpAction(a.sessionToken, 'search', reception)).data.ok, false);
    await moveTo(a.sessionToken, npc.x, npc.y);
    const before = (await request('/api/state', { token: b.sessionToken })).data;
    const exchangeId = command();
    await request('/api/input', { method: 'POST', token: a.sessionToken, body: { right: true } });
    const exchange = await httpAction(a.sessionToken, 'exchange', npc, { commandId: exchangeId });
    assert.equal(exchange.status, 200); assert.equal(exchange.data.exploration.chips, 0);
    assert.equal((await httpAction(a.sessionToken, 'exchange', npc, { commandId: exchangeId })).data.ok, false);
    const stopped = (await request('/api/state', { token: a.sessionToken })).data.players.find(p => p.id === a.playerId);
    await pause(120);
    const later = (await request('/api/state', { token: a.sessionToken })).data.players.find(p => p.id === a.playerId);
    assert.deepEqual([later.x, later.y], [stopped.x, stopped.y]);
    const clue = exchange.data.exploration.clues[0];
    assert.equal(clue.targetId, b.playerId); assert.equal(clue.value, before.me.traits[clue.key]);
    const other = (await request('/api/state', { token: b.sessionToken })).data;
    assert.deepEqual(other.me.exploration, blank()); assert.deepEqual(other.logs, before.logs);
    for (const p of other.players) { assert.ok(!('exploration' in p)); assert.deepEqual(p.traits, { saying: '***', food: '***', sport: '***' }); }
    const revived = await request('/api/join', { method: 'POST', token: a.sessionToken, body: { nickname: '不能替换身份' } });
    assert.equal(revived.data.revived, true); assert.equal(revived.data.playerId, a.playerId);
    assert.deepEqual((await request('/api/state', { token: a.sessionToken })).data.me.exploration, exchange.data.exploration);
    assert.equal((await httpAction(a.sessionToken, 'exchange', npc)).data.ok, false);
    assert.equal((await request('/api/state', { token: a.sessionToken })).data.me.exploration.chips, 0);
  });
  await test('22 HTTP 既有远距离技能保持，交互返回状态且不泄露给目标', async () => {
    await moveTo(a.sessionToken, 180, 275);
    const state = (await request('/api/state', { token: a.sessionToken })).data;
    const p = state.players.find(p => p.id === a.playerId), target = state.players.find(p => p.id === b.playerId);
    assert.ok(Math.hypot(p.x - target.x, p.y - target.y) > WORLD.INTERACT_RANGE);
    const result = await request('/api/skill', { method: 'POST', token: a.sessionToken, body: { commandId: command(), skill: 'probe', targetId: b.playerId } });
    assert.equal(result.status, 200);
    const visible = (await request('/api/state', { token: a.sessionToken })).data.players.find(p => p.id === b.playerId);
    assert.notEqual(visible.traits.saying, '***'); assert.equal(visible.traits.food, '***');
    assert.deepEqual((await request('/api/state', { token: b.sessionToken })).data.me.exploration, blank());
  });
  await test('22b HTTP 每玩家独立搜索、无效正文拒绝且失败不改变状态', async () => {
    const before = (await request('/api/state', { token: a.sessionToken })).data.me.exploration;
    for (const body of [null, {}, { commandId: command(), kind: 'search', entityId: 'bad' }]) {
      const result = await request('/api/interact', { method: 'POST', token: a.sessionToken, body });
      assert.equal(result.status, 400); assert.equal(result.data.ok, false); assert.deepEqual(result.data.exploration, before);
    }
    await moveTo(b.sessionToken, 220, 275);
    const result = await httpAction(b.sessionToken, 'search', reception);
    assert.equal(result.status, 200); assert.equal(result.data.exploration.chips, 3);
    assert.deepEqual((await request('/api/state', { token: a.sessionToken })).data.me.exploration, before);
  });
  await test('23 HTTP finish 冻结交互，reset 撤销身份/状态/命令，新玩家可重新搜索', async () => {
    csrf = (await request('/api/dev/capabilities', { token: a.sessionToken })).data.csrfToken;
    const options = { method: 'POST', token: a.sessionToken, headers: { Origin: base }, body: { confirm: true, csrfToken: csrf } };
    assert.equal((await request('/api/host/finish', options)).status, 200);
    const before = (await request('/api/state', { token: a.sessionToken })).data.me.exploration;
    assert.equal((await httpAction(a.sessionToken, 'search', reception)).data.ok, false);
    assert.deepEqual((await request('/api/state', { token: a.sessionToken })).data.me.exploration, before);
    assert.equal((await request('/api/host/reset', options)).status, 200);
    assert.equal((await request('/api/state', { token: a.sessionToken })).status, 401);
    assert.equal((await httpAction(a.sessionToken, 'search', reception)).data.ok, false);
    const fresh = (await request('/api/join', { method: 'POST', token: a.sessionToken, body: { nickname: '新局' } })).data;
    assert.notEqual(fresh.sessionToken, a.sessionToken);
    assert.deepEqual((await request('/api/state', { token: fresh.sessionToken })).data.me.exploration, blank());
    await moveTo(fresh.sessionToken, 220, 275);
    assert.equal((await httpAction(fresh.sessionToken, 'search', reception)).data.exploration.chips, 3);
  });
} catch (error) {
  failed++; console.error(`HTTP 测试初始化失败\n${error.stack}\n${serverOutput}`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit'); child.kill(); await exited;
  }
}
console.log(`探索回归结果：${passed} 项通过，${failed} 项失败；HTTP 子进程已关闭。`);
if (failed) process.exitCode = 1;
