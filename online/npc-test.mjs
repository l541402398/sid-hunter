'use strict';
// 开发用 NPC（/api/dev/npc）的真实 HTTP 自测。
// 只用 Node 内置 fetch + child_process，不装任何依赖。
// 全程使用临时端口，**不碰 8787 上正在跑的用户试玩服务**。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
// Non-loopback verification intentionally remains an external QA case.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const WORLD = require('./shared/world.js'); // CommonJS 与浏览器共用的同一份世界定义

const PORT = 8899, BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = BASE; // trustedDevRequest(requireOrigin=true) 要求 Origin 与 Host 同源

const results = [], skipped = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  → ${detail}`}`);
}
function skip(name, why) { skipped.push(name); console.log(`SKIP  ${name}  → ${why}`); }
const wait = ms => new Promise(r => setTimeout(r, ms));

async function call(port, pathname, { method, token, body, origin, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Sid-Session'] = token;
  if (origin) headers['Origin'] = origin;
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data, raw };
}
const join = (port, nickname) => call(port, '/api/join', { body: { nickname } });
const caps = (port, token, origin) => call(port, '/api/dev/capabilities', { token, origin });
const npc = (port, token, body) => call(port, '/api/dev/npc', { token, body, origin: ORIGIN });
const skill = (port, token, body) => call(port, '/api/skill', { token, body });
const act = (port, token, kind) => call(port, '/api/action', { token, body: { kind } });
const st = (port, token) => call(port, '/api/state', { token });
const tst = (port, body) => call(port, '/api/test/state', { body });
const place = (port, body) => call(port, '/api/test/place', { body });
const advance = (port, ms) => call(port, '/api/test/advance', { body: { ms } });

function spawnServer(port, env) {
  return spawn(process.execPath, ['server.js'], {
    cwd: HERE,
    env: { ...process.env, SID_TEST: '1', PORT: String(port), HOST: '127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}
async function waitReady(port) {
  for (let i = 0; i < 100; i++) {
    try { await fetch(`http://127.0.0.1:${port}/api/state`); return true; } catch { /* not yet */ }
    await wait(100);
  }
  return false;
}
const collides = (x, y) => WORLD.makeFurniture().some(f =>
  x + WORLD.BODY_HALF > f.x && x - WORLD.BODY_HALF < f.x + f.w &&
  y + WORLD.FOOT_TOP > f.y && y - WORLD.FOOT_BOTTOM < f.y + f.h);
const uid = () => crypto.randomUUID();

// 主服务：开 SID_DEV。对照服务：不开 SID_DEV，用于验证 403。
const main = spawnServer(PORT, { SID_DEV: '1' });
const noDev = spawnServer(PORT + 1, { SID_DEV: '0' });
let exitCode = 1;

try {
  if (!await waitReady(PORT)) throw new Error('主服务未启动');
  if (!await waitReady(PORT + 1)) throw new Error('对照服务未启动');

  check('锤子/吓人冷却为1000ms且受惊750ms', WORLD.ACTION.hammerCooldownMs === 1000 && WORLD.ACTION.frightMs === 750);
  // ---------- ① 门禁 ----------
  const ndev = await npc(PORT + 1, null, { count: 1, csrfToken: 'x' });
  check('未开 SID_DEV → 403', ndev.status === 403, `${ndev.status} ${JSON.stringify(ndev.data)}`);
  const badOrigin = await call(PORT, '/api/dev/npc', { token: null, body: { count: 1, csrfToken: 'x' }, origin: 'http://evil.example' });
  check('Origin 不同源 → 403', badOrigin.status === 403, `${badOrigin.status} ${JSON.stringify(badOrigin.data)}`);
  const anon = await npc(PORT, null, { count: 1, csrfToken: 'x' });
  check('无身份 → 401', anon.status === 401, `${anon.status} ${JSON.stringify(anon.data)}`);

  // ---------- ② 正常添加 ----------
  const j = await join(PORT, '');
  const me = j.data.sessionToken, meId = j.data.playerId;
  check('真人加入成功', j.data.ok, `id=${meId}`);
  const cap = await caps(PORT, me, ORIGIN);
  const csrf = cap.data.csrfToken;
  check('拿到开发 CSRF', cap.status === 200 && typeof csrf === 'string' && !!csrf, `canReset=${cap.data.canReset}`);
  const wrongCsrf = await npc(PORT, me, { count: 1, csrfToken: 'wrong' });
  check('CSRF 错误 → 403', wrongCsrf.status === 403, `${wrongCsrf.status} ${JSON.stringify(wrongCsrf.data)}`);

  const made = await npc(PORT, me, { count: 1, csrfToken: csrf });
  const npc0 = made.data.npcs && made.data.npcs[0];
  check('添加 NPC 成功并返回完整 S-ID', made.status === 200 && !!npc0 && /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(npc0.sid),
    `${made.status} ${JSON.stringify(npc0)}`);

  const s1 = await tst(PORT);
  const np = s1.data.players.find(p => p.id === npc0.id);
  check('NPC 阵营恒为 good', np && np.faction === 'good', `faction=${np && np.faction}`);
  check('NPC 无会话、不可被认领（hasSession=false）', np && np.npc === true && np.hasSession === false, `npc=${np && np.npc} hasSession=${np && np.hasSession}`);
  check('NPC 有完整随机 S-ID 且初始全未公开', np && /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(np.sid) && np.sidRevealed.every(v => v === false),
    `sid=${np && np.sid} revealed=${np && JSON.stringify(np.sidRevealed)}`);
  check('NPC 血量 1、存活、在线', np && np.hp === 1 && np.alive === true && np.online === true, `hp=${np && np.hp} alive=${np && np.alive} online=${np && np.online}`);
  check('NPC 落点不与家具重叠', np && !collides(np.x, np.y), `(${np && np.x},${np && np.y})`);
  const pub1 = await st(PORT, me);
  const npPub = pub1.data.players.find(p => p.id === npc0.id);
  check('公共投影里 NPC 的 S-ID 与隐藏属性仍是 ***（与真人同规则）',
    npPub && npPub.sid === '***-***-***' && Object.values(npPub.traits).every(v => v === '***'),
    `sid=${npPub && npPub.sid} traits=${npPub && JSON.stringify(npPub.traits)}`);

  // ---------- ⑥ 纯站立：若干 tick 后位置不变 ----------
  const before6 = { x: np.x, y: np.y };
  await wait(400); // 约 8 个 tick
  const np6 = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  check('若干 tick 后 NPC 位置不变（纯站立）', np6.x === before6.x && np6.y === before6.y, `(${before6.x},${before6.y}) → (${np6.x},${np6.y})`);

  // ---------- ③ 探查 NPC ----------
  const logsBefore = (await st(PORT, me)).data.logs.length;
  const probe = await skill(PORT, me, { skill: 'probe', targetId: npc0.id, commandId: uid() });
  check('探查 NPC 成功', probe.status === 200 && probe.data.ok && /探查完成/.test(probe.data.resultText || ''),
    `${probe.status} ${probe.data.resultText || probe.data.error}`);
  const afterProbe = await st(PORT, me);
  const npProbe = afterProbe.data.players.find(p => p.id === npc0.id);
  const revealedTrait = Object.values(npProbe.traits).filter(v => v !== '***');
  check('探查后 NPC 有一项隐藏属性被公开', revealedTrait.length === 1, JSON.stringify(npProbe.traits));
  check('公共日志新增了探查条目', afterProbe.data.logs.length === logsBefore + 1, `${logsBefore} → ${afterProbe.data.logs.length}`);

  // ---------- ③ 锤击 NPC（走到锤击范围内）----------
  await place(PORT, { playerId: meId, x: np6.x - 30, y: np6.y });
  const hammer = await act(PORT, me, 'hammer');
  check('锤击 NPC 命中', hammer.status === 200 && hammer.data.hit === true && hammer.data.targetId === npc0.id, JSON.stringify(hammer.data));
  const afterHit = await st(PORT, me);
  const npHit = afterHit.data.players.find(p => p.id === npc0.id);
  check('NPC 被敲晕（stunUntil 有效）', npHit.stunUntil > afterHit.data.serverTime, `剩余 ${npHit.stunUntil - afterHit.data.serverTime}ms`);
  check('NPC 头顶 bumps=1', npHit.bumps === 1, `bumps=${npHit.bumps}`);
  const npHammerState = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  check('锤击不触碰玩法字段（hp 仍为 1、存活、S-ID 未公开）',
    npHammerState.hp === 1 && npHammerState.alive === true && npHammerState.sidRevealed.every(v => v === false),
    `hp=${npHammerState.hp} alive=${npHammerState.alive} revealed=${JSON.stringify(npHammerState.sidRevealed)}`);

  // ---------- ④ 指认 NPC（好人）→ 自己公开一段，NPC 不掉血 ----------
  await advance(PORT, 13000); // 越过指认 12s 冷却
  const accuse = await skill(PORT, me, { skill: 'accuse', targetId: npc0.id, commandId: uid() });
  check('指认 NPC 受理', accuse.status === 200 && accuse.data.ok, `${accuse.status} ${accuse.data.resultText || accuse.data.error}`);
  const afterAccuse = await st(PORT, me);
  const mePub = afterAccuse.data.players.find(p => p.id === meId);
  const npAccuse = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  check('错指认好人：自己公开一段 S-ID', mePub.sid !== '***-***-***' && (mePub.sid.match(/[A-Z0-9]{3}/g) || []).length >= 1, `自己公共 SID=${mePub.sid}`);
  check('NPC 不掉血、仍存活', npAccuse.hp === 1 && npAccuse.alive === true, `hp=${npAccuse.hp} alive=${npAccuse.alive}`);

  // ---------- ⑦ 同名 join 不会认领 NPC ----------
  const joinSame = await join(PORT, npc0.name);
  check('用 NPC 名字 join 不会认领 NPC（revived=false 且是新 id）',
    joinSame.data.ok && joinSame.data.revived === false && joinSame.data.playerId !== npc0.id,
    `playerId=${joinSame.data.playerId} revived=${joinSame.data.revived} npcId=${npc0.id}`);
  const afterJoin = await tst(PORT);
  const npStill = afterJoin.data.players.find(p => p.id === npc0.id);
  check('NPC 仍然 hasSession=false（未被接管）', npStill && npStill.npc === true && npStill.hasSession === false, `hasSession=${npStill && npStill.hasSession}`);

  // ---------- ⑤ 击杀 NPC → 淘汰并触发结束（既有规则，只断言不改）----------
  const made2 = await npc(PORT, me, { count: 1, csrfToken: csrf });
  const npc1 = made2.data.npcs && made2.data.npcs[0];
  check('再加一个 NPC（凑到 2 名 NPC）', made2.status === 200 && !!npc1 && npc1.id !== npc0.id, `id=${npc1 && npc1.id}`);
  // 注意：上一步「同名 join」已经多加了一名真人，所以此时存活 = 我 + NPC0 + 那名真人 + NPC1 = 4。
  // 要把存活打到 2 需要淘汰两名 NPC（既有 checkFinish 规则：至少一次淘汰且存活 ≤ 2）。
  const aliveBefore = (await tst(PORT)).data.players.filter(p => p.alive).length;
  const kill = await skill(PORT, me, { skill: 'kill', targetId: npc0.id, sid: npc0.sid, commandId: uid() });
  check('用开发接口返回的完整 S-ID 击杀 NPC 成功', kill.status === 200 && kill.data.ok && /淘汰/.test(kill.data.resultText || ''),
    `${kill.status} ${kill.data.resultText || kill.data.error}`);
  const npKilled = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  check('NPC 已淘汰', npKilled && npKilled.alive === false && npKilled.hp === 0, `alive=${npKilled && npKilled.alive} hp=${npKilled && npKilled.hp}`);
  await advance(PORT, 13000); // 越过击杀 12s 冷却
  const kill2 = await skill(PORT, me, { skill: 'kill', targetId: npc1.id, sid: npc1.sid, commandId: uid() });
  check('击杀第二名 NPC 成功', kill2.status === 200 && kill2.data.ok && /淘汰/.test(kill2.data.resultText || ''),
    `${kill2.status} ${kill2.data.resultText || kill2.data.error}`);
  const afterKill = await tst(PORT);
  check(`存活降到 2 触发结束（既有规则：${aliveBefore} → ${afterKill.data.players.filter(p => p.alive).length}，eliminateEvents=${afterKill.data.eliminateEvents}）`,
    afterKill.data.finished === true && afterKill.data.players.filter(p => p.alive).length <= 2 && afterKill.data.eliminateEvents > 0,
    `finished=${afterKill.data.finished} 存活=${afterKill.data.players.filter(p => p.alive).length}`);
  const afterEnd = await act(PORT, me, 'hammer');
  check('结束后动作被冻结', afterEnd.status === 400 && /结束/.test(afterEnd.data.error || ''), `${afterEnd.status} ${afterEnd.data.error}`);

  // ---------- ⑧ 重置后 NPC 清空 ----------
  const reset = await call(PORT, '/api/host/reset', { token: me, body: { confirm: true, csrfToken: csrf }, origin: ORIGIN });
  check('重置成功', reset.status === 200 && reset.data.reset === true, `${reset.status} ${JSON.stringify(reset.data)}`);
  const afterReset = await tst(PORT);
  check('重置后 NPC 与玩家全部清空', afterReset.data.players.length === 0, `players=${afterReset.data.players.length}`);

  // ---------- count 截断（1–5，超出按 5 截断且不报错）----------
  const j2 = await join(PORT, '');
  const cap2 = await caps(PORT, j2.data.sessionToken, ORIGIN);
  const capped = await npc(PORT, j2.data.sessionToken, { count: 99, csrfToken: cap2.data.csrfToken });
  check('count 超出按 5 截断（不报错）',
    capped.status === 200 && Array.isArray(capped.data.npcs) && capped.data.npcs.length === 5,
    `${capped.status} 实际=${capped.data.npcs && capped.data.npcs.length}`);
  const cappedState = await tst(PORT);
  const cappedNpcs = cappedState.data.players.filter(p => p.npc === true);
  check('5 名 NPC 全部落点不与家具重叠', cappedNpcs.length === 5 && cappedNpcs.every(p => !collides(p.x, p.y)),
    cappedNpcs.map(p => `(${p.x},${p.y})`).join(' '));
  check('count=0 / 非法值不报错（按 1 处理）',
    (await npc(PORT, j2.data.sessionToken, { count: 0, csrfToken: cap2.data.csrfToken })).data.npcs.length === 1,
    'count=0');

  // Current iteration permits isolated loopback servers only. Retain this uncovered case as SKIP.
  skip('非 loopback → 403', '本轮测试仅允许loopback；既有独立QA结果不回填本脚本');
} catch (error) {
  check('测试脚本异常中止', false, error && error.stack || error);
} finally {
  main.kill('SIGKILL'); noDev.kill('SIGKILL');
}

const failed = results.filter(r => !r.pass);
console.log('\n──────── 汇总 ────────');
console.log(`通过 ${results.length - failed.length} / ${results.length}${skipped.length ? `（另有 ${skipped.length} 条 SKIP）` : ''}`);
if (failed.length) for (const f of failed) console.log(`  失败：${f.name}${f.detail ? ` → ${f.detail}` : ''}`);
if (skipped.length) for (const s of skipped) console.log(`  跳过：${s}`);
exitCode = failed.length ? 1 : 0;
console.log(`退出码：${exitCode}`);
process.exit(exitCode);
