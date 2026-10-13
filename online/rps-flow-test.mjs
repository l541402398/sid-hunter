// 联机猜拳（RPS）新协议端到端流程测试。
// 覆盖：9 结果、接受不结算、10s 共同 deadline、deadline-1 可改与 deadline 拒绝、
// 乱序 revision、隐私（三方/公共）、双未选/单未选、邀请超时/拒绝/取消、
// busy/重复/第三方、断线/淘汰/finish/reset、筹码不足不负/积分不重复、
// step/http 入口一致、结束同帧优先级，以及 server.js SSE 刷新竞态修正。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const C = WORLD.PLAY_CONFIG;
const CHOICES = ['rock', 'paper', 'scissors'];
const SCORE = WORLD.SCORE;

let sequence = 0, passed = 0, failed = 0;
const nonce = () => `rps-${++sequence}`;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`通过 ${name}`); }
  catch (error) { failed++; console.error(`失败 ${name}\n${error.stack}`); }
}

// ---- 受控时间（fake Date.now）----
const realNow = Date.now;
let CLOCK = 1_000_000_000;
Date.now = () => CLOCK;
const advance = ms => { CLOCK += ms; };
const setClock = ms => { CLOCK = ms; };

function fixture(count = 5) {
  const r = createRoom();
  for (let i = 0; i < count; i++) {
    const p = r.join(`session-${i}`, `玩家${i}`).player;
    p.x = 500 + i * 20; p.y = 350; p.exploration.chips = 3;
  }
  return r;
}
const invite = (r, fromId = 0, toId = 1, extra = {}) =>
  r.play(r.find(fromId).sessionId, { commandId: nonce(), kind: 'rpsInvite', targetId: r.find(toId).id, ...extra });
const accept = (r, toId = 1, extra = {}) =>
  r.play(r.find(toId).sessionId, { commandId: nonce(), kind: 'rpsReply', challengeId: r.find(toId).games.rpsPending.id, ...extra });
const reject = (r, toId = 1, extra = {}) =>
  r.play(r.find(toId).sessionId, { commandId: nonce(), kind: 'rpsReject', challengeId: r.find(toId).games.rpsPending.id, ...extra });
const cancel = (r, id, extra = {}) =>
  r.play(r.find(id).sessionId, { commandId: nonce(), kind: 'rpsCancel', challengeId: r.find(id).games.rpsPending.id, ...extra });
const choose = (r, id, choice, revision, commandId = nonce(), extra = {}) =>
  r.play(r.find(id).sessionId, { commandId, kind: 'rpsChoose', challengeId: r.find(id).games.rpsPending.id, choice, revision, ...extra });
// 直接进入“选择”阶段，双方都已选，并推进到 deadline 之后触发结算。
function settleBoth(r, fromChoice, toChoice) {
  const cid = r.find(0).games.rpsPending.id;
  choose(r, 0, fromChoice, 1);
  choose(r, 1, toChoice, 1);
  const deadline = r.find(0).games.rpsPending.deadline;
  setClock(deadline + 1);
  r.step(0); // 触发 syncRoom 结算
  return cid;
}

// ===== 1. 九种结果组合：筹码 ±rpsStake 与 SCORE 胜负平 =====
await test('九种出拳组合双向结算：筹码±stake，积分按胜负平', () => {
  for (const a of CHOICES) for (const b of CHOICES) {
    const r = fixture(), from = r.find(0), to = r.find(1);
    assert.equal(invite(r).ok, true);
    assert.equal(accept(r).ok, true);
    settleBoth(r, a, b);
    const outcome = WORLD.rpsOutcome(a, b); // 1: from 胜, -1: from 负, 0: 平
    assert.equal(from.exploration.chips, 3 + outcome, `from chips ${a} vs ${b}`);
    assert.equal(to.exploration.chips, 3 - outcome, `to chips ${a} vs ${b}`);
    const expectFrom = outcome > 0 ? SCORE.rpsWin : outcome < 0 ? SCORE.rpsLose : SCORE.rpsDraw;
    const expectTo = outcome > 0 ? SCORE.rpsLose : outcome < 0 ? SCORE.rpsWin : SCORE.rpsDraw;
    assert.equal(from.score, expectFrom);
    assert.equal(to.score, expectTo);
    assert.equal(r.room.challenges.size, 0);
    // 私密末局结果结构正确，仅本人可见 opponentChoice
    const af = from.games.rpsResult, tf = to.games.rpsResult;
    assert.equal(af.status, 'resolved'); assert.equal(af.ownChoice, a); assert.equal(af.opponentChoice, b);
    assert.equal(af.outcome, outcome > 0 ? 'win' : outcome < 0 ? 'lose' : 'draw');
    assert.equal(af.delta, outcome); assert.equal(af.reason, 'settled');
    assert.equal(tf.ownChoice, b); assert.equal(tf.opponentChoice, a);
    assert.equal(tf.delta, -outcome);
  }
});

// ===== 2. 接受（rpsReply/rpsAccept 别名）不立即结算，phase=selecting =====
await test('接受不结算：phase=selecting，截止前不结算、筹码不变', () => {
  const r = fixture(), from = r.find(0), to = r.find(1);
  assert.equal(invite(r).ok, true);
  assert.equal(r.play(to.sessionId, { commandId: nonce(), kind: 'rpsAccept', challengeId: to.games.rpsPending.id }).ok, true);
  assert.equal(from.games.rpsPending.phase, 'selecting');
  assert.equal(to.games.rpsPending.phase, 'selecting');
  // 双方都已选出拳后，仍不应结算
  choose(r, 0, 'rock', 1); choose(r, 1, 'scissors', 1);
  const deadline = from.games.rpsPending.deadline;
  setClock(deadline - 1); r.step(0);
  assert.equal(r.room.challenges.size, 1, '截止前不应结算');
  assert.equal(from.exploration.chips, 3); assert.equal(to.exploration.chips, 3);
  assert.equal(from.games.rpsResult, null); assert.equal(to.games.rpsResult, null);
  assert.equal(from.games.rpsPending.phase, 'selecting');
});

// ===== 3. 共同 deadline = startedAt + rpsRoundMs =====
await test('共同 deadline：startedAt 与 deadline 差值为 rpsRoundMs', () => {
  const r = fixture(), from = r.find(0), to = r.find(1);
  assert.equal(invite(r).ok, true);
  assert.equal(accept(r).ok, true);
  assert.equal(from.games.rpsPending.deadline - from.games.rpsPending.startedAt, C.rpsRoundMs);
  assert.equal(from.games.rpsPending.deadline, to.games.rpsPending.deadline, '双方 deadline 一致');
});

// ===== 4. deadline-1 可改，>=deadline 拒绝（已结算删除）=====
await test('deadline-1 可改出拳，>=deadline 的修改请求被拒（已结算）', () => {
  const r = fixture(), from = r.find(0), to = r.find(1);
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  const deadline = from.games.rpsPending.deadline;
  setClock(deadline - 1);
  assert.equal(choose(r, 0, 'rock', 1).ok, true);
  assert.equal(choose(r, 0, 'paper', 2).ok, true); // deadline-1 仍可改
  assert.equal(r.find(0).games.rpsPending.ownChoice, 'paper');
  setClock(deadline);
  // 此刻第一步 syncRoom 已结算；再 choose 时挑战已不存在
  const res = choose(r, 0, 'scissors', 3);
  assert.equal(res.ok, false);
  assert.match(res.error, /不存在或已结束/);
  assert.equal(r.room.challenges.size, 0);
});

// ===== 5. 乱序 revision 拒绝，相同 revision+choice 幂等 =====
await test('revision 递增安全整数：旧/乱序拒绝，相同幂等', () => {
  const r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  const deadline = r.find(0).games.rpsPending.deadline;
  setClock(deadline - 1000);
  assert.equal(choose(r, 0, 'rock', 1).ok, true);
  assert.equal(r.find(0).games.rpsPending.ownChoice, 'rock');
  assert.equal(choose(r, 0, 'rock', 0).ok, false, '更低 revision 应拒绝');
  assert.equal(choose(r, 0, 'rock', 1).ok, true, '相同 revision+choice 幂等');
  assert.equal(r.find(0).games.rpsPending.ownChoice, 'rock');
  assert.equal(choose(r, 0, 'paper', 1).ok, true, '相同 revision 不同 choice 可改');
  assert.equal(r.find(0).games.rpsPending.ownChoice, 'paper');
  assert.equal(choose(r, 0, 'scissors', 2).ok, true);
  assert.equal(choose(r, 0, 'rock', 2).ok, true, '相同 revision（新choice）覆盖');
  assert.equal(choose(r, 0, 'rock', 3).ok, true);
  assert.equal(choose(r, 0, 'rock', 2).ok, false, '乱序（低于当前3）拒绝');
  // 非安全整数/负数拒绝
  assert.equal(choose(r, 0, 'rock', 1.5).ok, false);
  assert.equal(choose(r, 0, 'rock', -1).ok, false);
});

// ===== 6. 隐私：三方/公共不泄露对手出拳或是否已选 =====
await test('隐私：私有投影仅 ownChoice/ownRevision，公共投影无 games', () => {
  const r = fixture(3), a = r.find(0), b = r.find(1), c = r.find(2);
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  choose(r, 0, 'rock', 1); // 仅 A 选，B 未选
  const ap = r.privateSnapshot(0).me.games.rpsPending;
  const bp = r.privateSnapshot(1).me.games.rpsPending;
  for (const p of [ap, bp]) {
    assert.equal(p.ownChoice === null || p.ownChoice === 'rock', true); // 只看自己
    assert.equal('opponentChoice' in p, false, '不泄露对手出拳');
    assert.equal('opponentChosen' in p, false, '不泄露对手是否已选');
    assert.equal('choice' in p, false);
  }
  // 第三方 C 完全不可见
  const cp = r.privateSnapshot(2).me.games;
  assert.equal(cp.rpsPending, null); assert.equal(cp.rpsResult, null);
  // 公共快照不含任何私有字段
  const pub = r.publicSnapshot();
  for (const pl of pub.players) {
    for (const k of ['games', 'exploration', 'hp', 'choice', 'chips', 'rpsPending', 'rpsResult', 'lastResult']) {
      assert.ok(!(k in pl), `公共不应含 ${k}`);
    }
  }
  // A 自己的 rpsResult（结算后）含 opponentChoice，但仅 A 本人可见
  const deadline = ap.deadline; setClock(deadline + 1); r.step(0);
  const own = r.privateSnapshot(0).me.games.rpsResult;
  assert.equal(own.opponentChoice, 'rock'); // B 未选 -> 取消时仍不泄露，见下
  // 注意：取消时 opponentChoice 为 null，resolved 才填入
});

// ===== 7. 双未选 / 单未选：取消无扣无分，反馈谁未选 =====
await test('双未选/单未选：取消无扣无分并反馈谁未选', () => {
  // 双未选
  let r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  let dl = r.find(0).games.rpsPending.deadline; setClock(dl + 1); r.step(0);
  assert.equal(r.room.challenges.size, 0);
  assert.equal(r.find(0).exploration.chips, 3); assert.equal(r.find(1).exploration.chips, 3);
  assert.equal(r.find(0).score, 0); assert.equal(r.find(1).score, 0);
  assert.equal(r.find(0).games.rpsResult.status, 'cancelled');
  assert.match(r.find(0).games.rpsResult.reason, /双方均未出拳|双方均未选择/);
  // 单未选：A 选，B 未选
  r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  choose(r, 0, 'rock', 1);
  dl = r.find(0).games.rpsPending.deadline; setClock(dl + 1); r.step(0);
  assert.equal(r.room.challenges.size, 0);
  assert.equal(r.find(0).exploration.chips, 3); assert.equal(r.find(1).exploration.chips, 3);
  assert.equal(r.find(0).score, 0); assert.equal(r.find(1).score, 0);
  // 邀请方(A)未选 -> 其原因为“你未出拳”；对方(B)未选 -> 其原因为“对方未出拳”
  const ar = r.find(0).games.rpsResult, br = r.find(1).games.rpsResult;
  assert.equal(ar.status, 'cancelled'); assert.equal(br.status, 'cancelled');
  assert.equal(ar.opponentChoice, null, '取消不泄露对手出拳');
  assert.equal(br.opponentChoice, null);
  assert.match(ar.reason, /你未出拳/); assert.match(br.reason, /对方未出拳/);
});

// ===== 8. 邀请超时 / 拒绝 / 取消 =====
await test('邀请超时/拒绝/取消：均取消无扣', () => {
  // 超时（邀请阶段 30s）
  let r = fixture();
  assert.equal(invite(r).ok, true);
  advance(C.rpsTimeoutMs + 1); r.step(0);
  assert.equal(r.room.challenges.size, 0);
  assert.equal(r.find(0).games.rpsResult.status, 'cancelled');
  assert.match(r.find(0).games.rpsResult.reason, /超时/);
  assert.equal(r.find(0).exploration.chips, 3);
  // 拒绝（仅 to）
  r = fixture();
  assert.equal(invite(r).ok, true);
  assert.equal(reject(r).ok, true);
  assert.equal(r.room.challenges.size, 0);
  assert.match(r.find(0).games.rpsResult.reason, /拒绝/);
  // 取消（任一方）
  for (const who of [0, 1]) {
    r = fixture();
    assert.equal(invite(r).ok, true);
    assert.equal(cancel(r, who).ok, true);
    assert.equal(r.room.challenges.size, 0);
    assert.equal(r.find(who).games.rpsResult.reason, '已取消');
  }
});

// ===== 9. busy / 重复 / 第三方 / 角色校验 =====
await test('busy/重复/第三方/角色校验', () => {
  const r = fixture(3);
  assert.equal(invite(r).ok, true);
  const cid = r.find(1).games.rpsPending.id;
  // busy：参与者已有 pending
  assert.equal(invite(r).ok, false, '发起者再次邀请应失败');
  assert.equal(invite(r, 1, 2).ok, false, '被邀请者再邀请他人应失败');
  // 第三方操作
  assert.equal(r.play(r.find(2).sessionId, { commandId: nonce(), kind: 'rpsReply', challengeId: cid }).ok, false);
  assert.equal(r.play(r.find(2).sessionId, { commandId: nonce(), kind: 'rpsCancel', challengeId: cid }).ok, false);
  assert.equal(r.play(r.find(2).sessionId, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: 'rock', revision: 1 }).ok, false);
  // 只有 to 可以 accept；from 不能 accept
  assert.equal(r.play(r.find(0).sessionId, { commandId: nonce(), kind: 'rpsReply', challengeId: cid }).ok, false);
  assert.equal(accept(r).ok, true);
  // accept 后 from 不能 reject（仅 to）
  assert.equal(reject(r).ok, false, 'accept 后 from 不能 reject');
  // 双方均可 choose
  assert.equal(choose(r, 0, 'rock', 1).ok, true);
  assert.equal(choose(r, 1, 'scissors', 1).ok, true);
  // 重复 commandId 防重
  const dup = r.play(r.find(0).sessionId, { commandId: nonce(), kind: 'rpsChoose', challengeId: cid, choice: 'paper', revision: 2 });
  assert.equal(dup.ok, true);
  assert.equal(r.play(r.find(0).sessionId, { commandId: dup.commandId || nonce(), kind: 'rpsChoose', challengeId: cid, choice: 'paper', revision: 2 }).ok, true); // 不同 commandId 同 revision 仍幂等
});

// ===== 10. 邀请接受仍按距离/LOS/余额校验；旧邀请带 choice 不锁定 =====
await test('接受重校验距离/LOS/余额；旧 choice 不锁定', () => {
  const r = fixture(), a = r.find(0), b = r.find(1);
  // 旧协议 style：邀请带 choice，应忽略且不锁定
  assert.equal(invite(r, 0, 1, { choice: 'rock' }).ok, true);
  const ap = r.privateSnapshot(0).me.games.rpsPending;
  assert.equal('choice' in ap, false);
  assert.equal(ap.ownChoice, null);
  assert.equal(accept(r).ok, true);
  // 把 A 移远，再次邀请后接受应失败并取消
  const r2 = fixture(), x = r2.find(0), y = r2.find(1);
  assert.equal(invite(r2).ok, true);
  x.x = y.x + 200; // 超出 INTERACT_RANGE
  assert.equal(accept(r2).ok, false);
  assert.equal(r2.room.challenges.size, 0);
  assert.match(x.games.rpsResult.reason, /距离|家具|筹码|不在线|已淘汰/);
});

// ===== 11. 断线 setOffline 立即取消；淘汰/ finish/ reset =====
await test('断线/淘汰/finish/reset 取消挑战无扣', () => {
  // 断线
  let r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  choose(r, 0, 'rock', 1);
  r.setOffline(1); // 被邀请者断线
  assert.equal(r.room.challenges.size, 0);
  assert.equal(r.find(0).exploration.chips, 3); assert.equal(r.find(1).exploration.chips, 3);
  assert.equal(r.find(1).games.rpsResult.status, 'cancelled');
  assert.match(r.find(1).games.rpsResult.reason, /离线/);
  // 淘汰：另一坏人存在避免 badWiped 直接结束
  r = fixture(); r.find(4).faction = 'bad'; r.find(0).hp = 1;
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  const b = r.find(1);
  assert.equal(r.useSkill(r.find(0).sessionId, { commandId: nonce(), skill: 'kill', targetId: 1, sid: b.sid.segments.join('-') }).ok, true);
  assert.equal(r.room.challenges.size, 0, '被淘汰方参与挑战应被取消');
  assert.equal(r.find(0).exploration.chips, 3);
  // finish 取消所有
  r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  r.finish();
  assert.equal(r.room.challenges.size, 0);
  assert.equal(r.find(0).games.rpsResult.status, 'cancelled');
  assert.match(r.find(0).games.rpsResult.reason, /游戏已结束/);
  // reset 清空
  r.reset();
  assert.equal(r.room.challenges.size, 0);
  const fresh = r.join('session-0', '新').player;
  assert.deepEqual(fresh.games, { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '', rpsResult: null });
});

// ===== 12. 筹码不足不负、积分不重复 =====
await test('筹码不足不负、积分只结算一次', () => {
  // 结算时筹码不足 -> 取消（不扣、不负、不积分）
  let r = fixture(), from = r.find(0), to = r.find(1);
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  choose(r, 0, 'rock', 1); choose(r, 1, 'scissors', 1);
  from.exploration.chips = 0; // 结算前把发起方筹码降为不足
  const dl = from.games.rpsPending.deadline; setClock(dl + 1); r.step(0);
  assert.equal(r.room.challenges.size, 0);
  assert.equal(from.exploration.chips, 0, '不应出现负筹码');
  assert.equal(to.exploration.chips, 3);
  assert.equal(from.score, 0); assert.equal(to.score, 0);
  assert.equal(from.games.rpsResult.status, 'cancelled');
  assert.match(from.games.rpsResult.reason, /结算条件不满足/);
  // 积分只结算一次：重复触发 syncRoom 不重复加分
  r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  settleBoth(r, 'rock', 'scissors');
  const s0 = r.find(0).score;
  setClock(r.find(0).games.rpsPending ? dl : CLOCK + 1);
  r.step(0); r.step(0); r.step(0);
  assert.equal(r.find(0).score, s0, '重复 sync 不应重复加分');
});

// ===== 13. 结束同帧优先级：已结束则 deadline 不结算 =====
await test('结束同帧优先级：游戏结束后截止不结算', () => {
  const r = fixture();
  assert.equal(invite(r).ok, true); assert.equal(accept(r).ok, true);
  choose(r, 0, 'rock', 1); choose(r, 1, 'scissors', 1);
  // 先结束游戏
  r.finish();
  assert.equal(r.room.finished, true);
  // 再推进到 deadline 之后
  const dl = r.find(0).games.rpsPending ? r.find(0).games.rpsPending.deadline : CLOCK + C.rpsRoundMs;
  setClock(dl + 1);
  r.step(0);
  assert.equal(r.find(0).exploration.chips, 3, '结束后不应结算筹码');
  assert.equal(r.find(0).score, 0, '结束后不应结算积分');
  assert.equal(r.find(0).games.rpsResult.status, 'cancelled', '结束后挑战应取消');
  assert.match(r.find(0).games.rpsResult.reason, /游戏已结束/);
  // 同帧：step 先 checkFinish 再 syncRoom，已结束则不会结算
  const r2 = fixture();
  assert.equal(invite(r2).ok, true); assert.equal(accept(r2).ok, true);
  choose(r2, 0, 'rock', 1); choose(r2, 1, 'scissors', 1);
  r2.finish();
  const dl2 = r2.find(0).games.rpsPending.deadline;
  setClock(dl2 + 1);
  r2.step(0); // checkFinish(已结束) -> syncRoom(取消) ，不结算
  assert.equal(r2.find(0).exploration.chips, 3);
  assert.equal(r2.find(0).games.rpsResult.status, 'cancelled');
});

// 恢复真实时间，准备 HTTP 一致性测试。
Date.now = realNow;

// ===== 14. step / http 入口一致；以及 SSE 刷新竞态修正 =====
let child, base, output = '';
const freePort = () => new Promise((resolve, reject) => {
  const srv = http.createServer(); srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => { const port = srv.address().port; srv.close(e => e ? reject(e) : resolve(port)); });
});
async function request(path, { token, body, method = body === undefined ? 'GET' : 'POST', headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { 'X-Sid-Session': token } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(5000)
  });
  return { status: res.status, data: await res.json() };
}
const httpPlay = (token, kind, extra = {}) => request('/api/play', { token, body: { commandId: nonce(), kind, ...extra } });
const state = async token => (await request('/api/state', { token })).data;
async function openStream(token) {
  return new Promise((resolve, reject) => {
    const req = http.get(`${base}/api/stream?sid_token=${token}`, res => { res.on('data', () => {}); resolve({ req, res }); });
    req.on('error', reject);
  });
}
// 真实移动玩家到目标坐标（服务端忽略客户端坐标，只能靠移动指令走过去）。
async function moveTo(token, x, y) {
  for (const [axis, value] of [['x', x], ['y', y]]) {
    const deadline = Date.now() + 15000;
    let moving = '';
    while (true) {
      const s = await state(token), p = s.players.find(p => p.id === s.me.id), diff = value - p[axis];
      if (Math.abs(diff) <= 8) break;
      assert.ok(Date.now() < deadline, `真实移动超时 ${axis}`);
      const key = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
      if (key !== moving) { await request('/api/input', { token, body: { [key]: true } }); moving = key; }
      await pause(20);
    }
    await request('/api/input', { token, body: {} });
  }
}
try {
  const port = await freePort(); base = `http://127.0.0.1:${port}`;
  // SID_TEST=1 暴露 /api/test/advance 推进服务端时钟
  child = spawn(process.execPath, [fileURLToPath(new URL('./server.js', import.meta.url))],
    { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DEV: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`服务启动超时\n${output}`)), 10000);
    child.once('error', e => { clearTimeout(timer); reject(e); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`服务退出${code}\n${output}`)); });
    child.stderr.on('data', d => { output += d; });
    child.stdout.on('data', d => { output += d; if (output.includes('技能次数恢复周期:')) { clearTimeout(timer); resolve(); } });
  });
  const advanceServer = ms => request('/api/test/advance', { body: { ms } });
  // 加入两名玩家并真实移动到相邻位置（满足猜拳距离/视线要求）。
  const joinClose = async () => {
    const users = [];
    for (let i = 0; i < 2; i++) users.push((await request('/api/join', { body: { nickname: `H${i}` } })).data);
    const [a, b] = [users[0].sessionToken, users[1].sessionToken];
    await moveTo(a, 500, 350);
    await moveTo(b, 545, 350);
    return { users, a, b };
  };

  await test('HTTP 双方邀请→接受→双选→截止结算，与房间逻辑一致', async () => {
    const { users, a, b } = await joinClose();
    const inv = await httpPlay(a, 'rpsInvite', { targetId: users[1].playerId });
    assert.equal(inv.status, 200);
    assert.equal((await state(b)).me.games.rpsPending.phase, 'invited');
    const cid = (await state(a)).me.games.rpsPending.id;
    assert.equal((await httpPlay(b, 'rpsReply', { challengeId: cid })).status, 200);
    const pending = (await state(a)).me.games.rpsPending;
    assert.equal(pending.phase, 'selecting');
    assert.equal(pending.deadline - pending.startedAt, C.rpsRoundMs);
    // 双方出拳
    assert.equal((await httpPlay(a, 'rpsChoose', { challengeId: cid, choice: 'rock', revision: 1 })).status, 200);
    assert.equal((await httpPlay(b, 'rpsChoose', { challengeId: cid, choice: 'scissors', revision: 1 })).status, 200);
    // 截止前不结算
    let st = await state(a);
    const toDeadline = st.me.games.rpsPending.deadline - st.serverTime;
    await advanceServer(Math.max(0, toDeadline - 50));
    st = await state(a);
    assert.equal(st.players.find(p => p.id === users[0].playerId).exploration.chips, 3, '截止前不结算');
    assert.notEqual(st.me.games.rpsPending, null, '截止前仍在选择');
    // 推进越过 deadline，等待 20Hz 快照触发 syncRoom 结算
    await advanceServer(200);
    await pause(150);
    const sa = await state(a), sb = await state(b);
    assert.equal(sa.me.games.rpsResult.status, 'resolved');
    assert.equal(sa.me.games.rpsResult.outcome, 'win');
    assert.equal(sa.me.games.rpsResult.delta, 1);
    assert.equal(sa.players.find(p => p.id === users[0].playerId).exploration.chips, 4);
    assert.equal(sb.players.find(p => p.id === users[1].playerId).exploration.chips, 2);
    assert.equal(sa.me.games.rpsResult.opponentChoice, 'scissors');
    assert.equal(sb.me.games.rpsResult.opponentChoice, 'rock');
  });

  await test('HTTP 单未选截止取消：无扣、无分、反馈对方未出拳', async () => {
    const { users, a, b } = await joinClose();
    await httpPlay(a, 'rpsInvite', { targetId: users[1].playerId });
    const cid = (await state(a)).me.games.rpsPending.id;
    await httpPlay(b, 'rpsReply', { challengeId: cid });
    await httpPlay(a, 'rpsChoose', { challengeId: cid, choice: 'rock', revision: 1 });
    const st = await state(a);
    const toDeadline = st.me.games.rpsPending.deadline - st.serverTime;
    await advanceServer(toDeadline + 200); await pause(150);
    const sa = await state(a), sb = await state(b);
    assert.equal(sa.me.games.rpsResult.status, 'cancelled');
    assert.equal(sb.me.games.rpsResult.status, 'cancelled');
    assert.equal(sa.players.find(p => p.id === users[0].playerId).exploration.chips, 3);
    assert.match(sb.me.games.rpsResult.reason, /对方未出拳/);
  });

  await test('server.js SSE 刷新不误取消，真实断线取消并取消猜拳', async () => {
    const { users, a, b } = await joinClose();
    await httpPlay(a, 'rpsInvite', { targetId: users[1].playerId });
    const cid = (await state(a)).me.games.rpsPending.id;
    await httpPlay(b, 'rpsReply', { challengeId: cid });
    // 打开两条 a 的流（模拟刷新）：第二条覆盖第一条
    const s1 = await openStream(a);
    const s2 = await openStream(a);
    await pause(60);
    s1.req.destroy(); // 关闭“旧”流
    await pause(80);
    const ta = (await request('/api/test/state')).data.players.find(p => p.id === users[0].playerId);
    assert.equal(ta.online, true, '刷新关闭旧流不应误下线');
    // b 仍能看到挑战存在
    const sb = await state(b);
    assert.equal(sb.me.games.rpsPending.id, cid, '刷新后挑战仍在');
    // 关闭“当前”流 -> 真实断线 -> 下线并取消猜拳
    s2.req.destroy();
    await pause(80);
    const ta2 = (await request('/api/test/state')).data.players.find(p => p.id === users[0].playerId);
    assert.equal(ta2.online, false, '真实断线应下线');
    const sb2 = await state(b);
    assert.equal(sb2.me.games.rpsPending, null, '断线后挑战应取消');
    assert.equal(sb2.me.games.rpsResult.status, 'cancelled');
  });
} catch (error) {
  failed++; console.error(`HTTP 初始化或流程失败\n${error.stack}\n${output}`);
} finally {
  if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
}

console.log(`RPS 流程测试：${passed} 项通过，${failed} 项失败`);
if (failed) process.exitCode = 1;
