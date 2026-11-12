// 献花规则、持久化、隐私及真实 HTTP 门禁。使用隔离 SQLite，不操作运行中的游戏。
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SID_TEST = '1'; process.env.SID_SSO = '0';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const { validateRecipients } = require('./room/flowers.js');
const { createStore } = require('./server/store.js');
const { createActivity } = require('./server/activity.js');
const { createManager } = require('./manager.js');
const { makeRouter } = require('./server/app.js');
const auth = require('./server/auth.js');
const rules = { enableAliveFloor: false, enableBadWiped: false };
const roster = Array.from({ length: 8 }, (_, i) => ({ empNo: `00${i}`, name: `收花人${i}` }));
function fixture(options = {}) {
  const r = createRoom({ rules, flowerRecipients: roster, roleModelEmpNos: ['007', 'honor-only'], ...options });
  const add = empNo => r.join(`session-${empNo}`, null, { empNo, name: `员工${empNo}` }).player;
  return { r, add, send: (a, b, extra = {}) => r.sendFlower(a.sessionId, { roundId: r.room.roundId, targetId: b.id, ...extra }) };
}

test('收花人名单严格按文本工号匹配，独立于年度榜样；保存失败不更换名单', () => {
  assert.deepEqual(validateRecipients([{ empNo: ' 00123 ', name: ' 姓名 ' }]), [{ empNo: '00123', name: '姓名' }]);
  for (const list of [null, {}, [{ empNo: 123 }], [{ empNo: '' }], [{ empNo: 'a' }, { empNo: 'a' }], [{ empNo: 'a', name: 3 }]])
    assert.throws(() => validateRecipients(list));
  const { r, add } = fixture({ persistFlowerRecipients: () => false });
  const onlyHonor = add('honor-only'), onlyFlower = add('000'), both = add('007');
  assert.deepEqual(r.flowers.publicInfo(onlyHonor), { flowerRecipient: false, annualRoleModel: true, flowersReceived: 0 });
  assert.equal(r.flowers.publicInfo(onlyFlower).annualRoleModel, false);
  assert.equal(r.flowers.publicInfo(both).annualRoleModel, true);
  assert.equal(r.flowers.publicInfo(both).flowerRecipient, true);
  assert.equal(r.flowers.configure([]).ok, false);
  assert.equal(r.flowers.publicInfo(onlyFlower).flowerRecipient, true);
});

test('发送者每次 +2、每场最多 10 分；满额仍可献花，逐对幂等', () => {
  const { r, add, send } = fixture(), a = add('sender');
  const targets = roster.map(p => add(p.empNo));
  a.score = 17;
  for (let i = 0; i < targets.length; i++) {
    const result = send(a, targets[i]);
    assert.equal(result.ok, true); assert.equal(result.gainedPoints, i < 5 ? 2 : 0);
    const duplicate = send(a, targets[i]);
    assert.equal(duplicate.alreadySent, true); assert.equal(duplicate.gainedPoints, 0);
    assert.equal(targets[i].flowerState.received, 1);
  }
  assert.equal(a.score, 27); assert.equal(a.flowerState.sentPoints, 10);
  assert.equal(r.privateSnapshot(a.id).me.flowers.sentTo.length, 8);
});

test('收花人每满 5 朵 +1 分无上限，离线与休战均可收花，收花人也可献花', () => {
  const { r, add, send } = fixture(), target = add('000'), peer = add('001');
  target.alive = false; target.hp = 0; target.online = false; target.score = 20;
  for (let i = 0; i < 65; i++) {
    const actor = add(`sender-${i}`);
    assert.equal(send(actor, target).ok, true);
    assert.equal(target.score, 20 + Math.floor((i + 1) / 5));
  }
  assert.equal(target.score, 33); assert.equal(target.flowerState.received, 65);
  assert.equal(send(target, peer).gainedPoints, 2); assert.equal(target.score, 35);
  assert.equal(send(target, target).ok, false);
});

test('同一工号重连、名单移除再加入不能再领奖；非收花人、NPC、自送、旧场指令均拒绝', () => {
  const { r, add, send } = fixture(), a = add('sender'), b = add('000'), other = add('other');
  assert(send(a, b).ok);
  const reconnect = r.join('new-session', null, { empNo: a.empNo, name: '改名' }).player;
  assert.equal(reconnect.id, a.id); assert.equal(send(reconnect, b).alreadySent, true);
  assert.equal(send(a, other).ok, false);
  assert.equal(send(a, a).ok, false);
  assert.equal(send(a, b, { roundId: 'old-round' }).ok, false);
  assert.equal(r.sendFlower('unknown', { roundId: r.room.roundId, targetId: b.id }).ok, false);
  assert.equal(r.sendFlower(a.sessionId, null).ok, false);
  r.flowers.configure([]); assert.equal(send(a, b).ok, false);
  r.flowers.configure(roster); assert.equal(send(a, b).alreadySent, true);
  b.npc = true; assert.equal(send(a, b).ok, false);
  b.npc = false;
  for (const field of ['pausedAt', 'finished', 'accessClosed']) {
    r.room[field] = true; assert.equal(send(a, b).ok, false); r.room[field] = false;
  }
});

test('同步存档失败时双方鲜花、积分和去重记录整笔回滚，可安全重试', () => {
  const { r, add, send } = fixture(), target = add('000');
  for (let i = 0; i < 4; i++) send(add(`sender-${i}`), target);
  const a = add('new-sender'), before = JSON.stringify({ a: a.score, b: target.score, flowers: target.flowerState });
  r.flowers.setPersistence(() => false);
  assert.equal(send(a, target).ok, false);
  assert.equal(JSON.stringify({ a: a.score, b: target.score, flowers: target.flowerState }), before);
  assert.deepEqual(r.flowers.privateInfo(a).sentTo, []);
  r.flowers.setPersistence(() => true);
  assert.equal(send(a, target).gainedPoints, 2); assert.equal(target.score, 1);
});

test('公开状态、名录、接收者私密状态及日志不泄露送花者名单', () => {
  const { r, add, send } = fixture(), a = add('sender'), b = add('000');
  send(a, b);
  const publicPlayer = r.publicSnapshot(b.id).players.find(p => p.id === b.id);
  for (const p of [publicPlayer, ...r.streamSnapshot(b.id, {}).directory]) {
    for (const field of ['empNo', 'flowerState', 'sentTo', 'sentPoints', 'receivedFrom']) assert(!(field in p), field);
  }
  assert.deepEqual(r.privateSnapshot(b.id).me.flowers, { received: 1, sentPoints: 0, sentTo: [] });
  assert.deepEqual(r.privateSnapshot(a.id).me.flowers, { received: 0, sentPoints: 2, sentTo: [b.id] });
  assert.deepEqual(r.room.pending.get(b.id), []);
  assert(!r.room.logs.some(e => /献花|送花/.test(e.text)));
});

test('真实 SQLite 重启恢复并立即去重；新场重置额度、鲜花、记录并保留名单和累计成绩', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sid-flowers-')), file = join(dir, 'test.sqlite');
  let store = createStore({ file });
  try {
    let r = fixture({ persistFlowerRecipients: list => store.saveFlowerRecipients(list) }).r;
    assert(r.flowers.configure(roster).ok);
    let activity = createActivity({ room: r, store }); assert(activity.openTestSession(30 * 60000).ok);
    const b = r.join('target', null, { empNo: '000', name: '接收者' }).player;
    for (let i = 0; i < 5; i++) {
      const a = r.join(`s${i}`, null, { empNo: `s${i}`, name: `发送者${i}` }).player;
      assert(r.sendFlower(a.sessionId, { roundId: r.room.roundId, targetId: b.id }).ok);
    }
    const roundId = r.room.roundId;
    store.close(); store = createStore({ file });
    const admin = store.loadAdmin();
    r = createRoom({ rules, flowerRecipients: store.loadFlowerRecipients(), restore: { ...admin.liveSnapshot, includeNpcs: true } });
    activity = createActivity({ room: r, store, initial: admin });
    assert.equal(r.room.roundId, roundId);
    const sender = r.join('reconnected', null, { empNo: 's0', name: '发送者' }).player;
    assert.equal(r.sendFlower(sender.sessionId, { roundId, targetId: b.id }).alreadySent, true);
    assert.equal(r.find(b.id).score, 1); assert.equal(sender.score, 2);
    assert(activity.finishSession().ok); assert(activity.openTestSession(30 * 60000).ok);
    const nextA = r.join('next-a', null, { empNo: 's0', name: '发送者' }).player;
    const nextB = r.join('next-b', null, { empNo: '000', name: '接收者' }).player;
    assert.equal(r.flowers.publicInfo(nextB).flowerRecipient, true);
    assert.deepEqual(r.flowers.privateInfo(nextB), { received: 0, sentPoints: 0, sentTo: [] });
    assert(r.sendFlower(nextA.sessionId, { roundId: r.room.roundId, targetId: nextB.id }).ok);
    assert.equal(r.sendFlower(nextA.sessionId, { roundId, targetId: nextB.id }).ok, false);
    assert.equal(store.loadSessions().length, 1);
    assert.equal(activity.state().totalRanking.find(p => p.name === '发送者0').score, 2);
  } finally { store.close(); assert(dir.startsWith(join(tmpdir(), 'sid-flowers-'))); rmSync(dir, { recursive: true, force: true }); }
});

test('真实 HTTP：管理员认证/CSRF/同源与格式校验，玩家鉴权，跨站与重复并发防护', async () => {
  const store = createStore({ file: ':memory:' });
  const { r, add } = fixture({ persistFlowerRecipients: list => store.saveFlowerRecipients(list) });
  const activity = createActivity({ room: r, store }); activity.openTestSession(30 * 60000);
  const a = add('sender'), b = add('000'); auth.bindRoom(r);
  const manager = createManager({ room: r, passcode: 'flowers-http-test', activity });
  const route = makeRouter({ ROOM: r, MANAGER: manager, resetTokens: new Map(), WORLD, openStream() {}, ACTIVITY: activity, STORE: store });
  const server = createServer((req, res) => { route(req, res, new URL(req.url, `http://${req.headers.host}`)).catch(e => { res.writeHead(500); res.end(e.message); }); });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function api(path, body, headers = {}) {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    const path = '/api/manager/flower-recipients';
    assert.equal((await api(path)).status, 401);
    const login = await api('/api/manager/login', { code: 'flowers-http-test' }); assert.equal(login.status, 200);
    const headers = { Cookie: login.cookie, Origin: base }, csrfToken = login.body.csrfToken;
    assert.equal((await api(path, { recipients: roster, confirm: true }, headers)).status, 403);
    assert.equal((await api(path, { recipients: roster, csrfToken, confirm: true }, { ...headers, Origin: 'https://untrusted.test' })).status, 403);
    assert.equal((await api(path, { recipients: roster, csrfToken, confirm: true }, headers)).status, 200);
    assert.equal((await api(path, { recipients: [{ empNo: 123 }], csrfToken, confirm: true }, headers)).status, 400);
    assert.deepEqual((await api(path, undefined, headers)).body.recipients, roster);
    const body = { roundId: r.room.roundId, targetId: b.id }, user = { 'X-Sid-Session': a.sessionId };
    assert.equal((await api('/api/flowers', body)).status, 401);
    assert.equal((await api('/api/flowers', body, { ...user, Origin: 'https://untrusted.test' })).status, 403);
    assert.equal((await api('/api/flowers', body, { ...user, 'Content-Type': 'text/plain' })).status, 415);
    const results = await Promise.all(Array.from({ length: 8 }, () => api('/api/flowers', body, { ...user, Origin: base })));
    assert(results.every(r => r.status === 200)); assert.equal(results.filter(r => !r.body.alreadySent).length, 1);
    assert.equal(a.score, 2); assert.equal(b.flowerState.received, 1);
    // HTTPS 反代保留 Host 时仍可献花；不能把服务内部 http 协议当成浏览器 Origin。
    const c = add('001');
    assert.equal((await api('/api/flowers', { ...body, targetId: c.id }, { ...user, Origin: base.replace('http:', 'https:') })).status, 200);
    activity.pause(); assert.equal((await api('/api/flowers', body, user)).status, 403);
  } finally { await new Promise(ok => server.close(ok)); manager.close(); store.close(); }
});

