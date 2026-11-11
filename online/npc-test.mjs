'use strict';
// 开发用 NPC 的真实 HTTP 自测。dev 上 /api/dev/* 已统一迁到管理员面板（410），
// 本脚本改走 /api/manager/npc（授权码登录 + CSRF + 同源 Origin），NPC 规则断言不变。
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

async function call(port, pathname, { method, token, body, origin, raw, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Sid-Session'] = token;
  if (cookie) headers['Cookie'] = cookie;
  if (origin) headers['Origin'] = origin;
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data, raw, setCookie: res.headers.get('set-cookie') || '' };
}
const join = (port, nickname) => call(port, '/api/join', { body: { nickname } });
// 管理员会话：登录拿 cookie + csrfToken。
async function managerLogin(port) {
  const r = await call(port, '/api/manager/login', { body: { code: process.env.SID_MANAGER_CODE || '091256' } });
  const cookie = (r.setCookie.match(/sid_manager=[^;]+/) || [''])[0];
  return { cookie, csrf: r.data.csrfToken };
}
const npc = (port, mgr, body, origin = `http://127.0.0.1:${port}`) => call(port, '/api/manager/npc', { cookie: mgr && mgr.cookie, body: { ...body, csrfToken: body.csrfToken ?? (mgr && mgr.csrf), faction: body.faction || 'good' }, origin });
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

const main = spawnServer(PORT, {});
const noDev = spawnServer(PORT + 1, {});
let exitCode = 1;

try {
  if (!await waitReady(PORT)) throw new Error('主服务未启动');
  if (!await waitReady(PORT + 1)) throw new Error('对照服务未启动');

  check('锤子冷却为1000ms', WORLD.ACTION.hammerCooldownMs === 1000);
  // ---------- ① 门禁（管理员会话 / CSRF / 同源）----------
  const anon = await npc(PORT, null, { count: 1, csrfToken: 'x' });
  check('无管理员会话 → 401', anon.status === 401, `${anon.status} ${JSON.stringify(anon.data)}`);
  const mgr = await managerLogin(PORT);
  check('管理员登录拿到 CSRF', !!mgr.cookie && typeof mgr.csrf === 'string' && !!mgr.csrf);
  const wrongCsrf = await npc(PORT, mgr, { count: 1, csrfToken: 'wrong' });
  check('CSRF 错误 → 403', wrongCsrf.status === 403, `${wrongCsrf.status} ${JSON.stringify(wrongCsrf.data)}`);
  const badOrigin = await npc(PORT, mgr, { count: 1 }, 'http://evil.example');
  check('Origin 不同源 → 403', badOrigin.status === 403, `${badOrigin.status} ${JSON.stringify(badOrigin.data)}`);

  // ---------- ② 正常添加 ----------
  const j = await join(PORT, '');
  const me = j.data.sessionToken, meId = j.data.playerId;
  check('真人加入成功', j.data.ok, `id=${meId}`);
  await place(PORT, { playerId: meId, floorId: 1 });
  const made = await npc(PORT, mgr, { count: 1, floorId: 1 });
  const npc0 = made.data.players && made.data.players[0];
  check('添加 NPC 成功', made.status === 200 && !!npc0, `${made.status} ${JSON.stringify(made.data)}`);

  const s1 = await tst(PORT);
  const np = s1.data.players.find(p => p.id === npc0.id);
  check('NPC 阵营恒为 good', np && np.faction === 'good', `faction=${np && np.faction}`);
  check('NPC 无会话、不可被认领（hasSession=false）', np && np.npc === true && np.hasSession === false, `npc=${np && np.npc} hasSession=${np && np.hasSession}`);
  check('NPC 有完整随机 S-ID 且初始全未公开', np && /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(np.sid) && np.sidRevealed.every(v => v === false),
    `sid=${np && np.sid} revealed=${np && JSON.stringify(np.sidRevealed)}`);
  check('NPC 对抗生命 3（与真人相同）、存活、在线', np && np.hp === WORLD.COMBAT.initialHp && np.alive === true && np.online === true, `hp=${np && np.hp} alive=${np && np.alive} online=${np && np.online}`);
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

  // ---------- ③ 旧探查入口已取消 ----------
  const logsBefore = (await st(PORT, me)).data.logs.length;
  const probe = await skill(PORT, me, { skill: 'probe', targetId: npc0.id, commandId: uid() });
  check('旧 probe 技能被拒（积分/休战改版）', !probe.data.ok, `${probe.status} ${probe.data.resultText || probe.data.error}`);
  check('被拒的旧技能不写公共日志', (await st(PORT, me)).data.logs.length === logsBefore);

  // ---------- ③ 锤击 NPC（走到锤击范围内）----------
  await place(PORT, { playerId: meId, x: np6.x - 30, y: np6.y });
  const hammer = await act(PORT, me, 'hammer');
  check('锤击 NPC 命中', hammer.status === 200 && hammer.data.hit === true && hammer.data.targetId === npc0.id, JSON.stringify(hammer.data));
  const afterHit = await st(PORT, me);
  const npHit = afterHit.data.players.find(p => p.id === npc0.id);
  check('NPC 被敲晕（stunUntil 有效）', npHit.stunUntil > afterHit.data.serverTime, `剩余 ${npHit.stunUntil - afterHit.data.serverTime}ms`);
  check('NPC 头顶 bumps=1', npHit.bumps === 1, `bumps=${npHit.bumps}`);
  const npHammerState = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  check('锤击不触碰对抗字段（生命不变、存活、S-ID 未公开）',
    npHammerState.hp === WORLD.COMBAT.initialHp && npHammerState.alive === true && npHammerState.sidRevealed.every(v => v === false),
    `hp=${npHammerState.hp} alive=${npHammerState.alive} revealed=${JSON.stringify(npHammerState.sidRevealed)}`);

  // ---------- ④ 刺杀 NPC（首位加入者为坏人）→ NPC 扣 1 格对抗生命，不加分（防刷分）----------
  const meFaction = (await st(PORT, me)).data.me.faction;
  const myScoreBefore = (await st(PORT, me)).data.me.score;
  const hit = await skill(PORT, me, { skill: meFaction === 'bad' ? 'assassinate' : 'accuse', targetId: npc0.id, commandId: uid() });
  check('对 NPC 使用阵营技能受理', hit.status === 200 && hit.data.ok, `${hit.status} ${hit.data.resultText || hit.data.error}`);
  const npAccuse = (await tst(PORT)).data.players.find(p => p.id === npc0.id);
  const meAfter = (await st(PORT, me)).data.me;
  if (meFaction === 'bad') {
    check('刺杀好人 NPC：NPC 扣 1 格、仍对抗中', npAccuse.hp === WORLD.COMBAT.initialHp - 1 && npAccuse.alive === true, `hp=${npAccuse.hp} alive=${npAccuse.alive}`);
    check('命中 NPC 不加积分', meAfter.score === myScoreBefore, `${myScoreBefore} → ${meAfter.score}`);
  } else {
    check('误指认好人 NPC：自己扣 1 格，NPC 不掉血', meAfter.hp === WORLD.COMBAT.initialHp - 1 && npAccuse.hp === WORLD.COMBAT.initialHp, `me=${meAfter.hp} npc=${npAccuse.hp}`);
  }
  const again = await skill(PORT, me, { skill: meFaction === 'bad' ? 'assassinate' : 'accuse', targetId: npc0.id, commandId: uid() });
  check('同一目标当日不可再次操作', !again.data.ok, again.data.error);

  // ---------- ⑦ 同名 join 不会认领 NPC ----------
  const joinSame = await join(PORT, npc0.name);
  check('用 NPC 名字 join 不会认领 NPC（revived=false 且是新 id）',
    joinSame.data.ok && joinSame.data.revived === false && joinSame.data.playerId !== npc0.id,
    `playerId=${joinSame.data.playerId} revived=${joinSame.data.revived} npcId=${npc0.id}`);
  const afterJoin = await tst(PORT);
  const npStill = afterJoin.data.players.find(p => p.id === npc0.id);
  check('NPC 仍然 hasSession=false（未被接管）', npStill && npStill.npc === true && npStill.hasSession === false, `hasSession=${npStill && npStill.hasSession}`);

  // ---------- ⑤ 旧击杀入口已取消；场次按时间收局 ----------
  const made2 = await npc(PORT, mgr, { count: 1, floorId: 1 });
  const npc1 = made2.data.players && made2.data.players[0];
  check('再加一个 NPC（凑到 2 名 NPC）', made2.status === 200 && !!npc1 && npc1.id !== npc0.id, `id=${npc1 && npc1.id}`);
  const kill = await skill(PORT, me, { skill: 'kill', targetId: npc1.id, commandId: uid() });
  check('旧 kill 技能被拒', !kill.data.ok, `${kill.status} ${kill.data.resultText || kill.data.error}`);
  const npAlive = (await tst(PORT)).data.players.find(p => p.id === npc1.id);
  check('NPC 未进入休战', npAlive && npAlive.alive === true && npAlive.hp === WORLD.COMBAT.initialHp, `alive=${npAlive && npAlive.alive} hp=${npAlive && npAlive.hp}`);
  await advance(PORT, 7200001); await wait(200);
  const afterKill = await tst(PORT);
  check('时间到（2 小时）触发结束', afterKill.data.finished === true, `finished=${afterKill.data.finished}`);
  const afterEnd = await act(PORT, me, 'hammer');
  // 场次结束后：房间拒绝（400 已结束）或场次门禁关闭（403 closed）都算冻结。
  check('结束后动作被冻结', (afterEnd.status === 400 && /结束/.test(afterEnd.data.error || '')) || (afterEnd.status === 403 && afterEnd.data.closed === true), `${afterEnd.status} ${afterEnd.data.error}`);

  // ---------- ⑧ 管理员开新场后 NPC 清空；count 只接受 1–5 ----------
  const before8 = await st(PORT, me);
  const fin = await call(PORT, '/api/manager/control', { cookie: mgr.cookie, origin: `http://127.0.0.1:${PORT}`,
    body: { action: 'finish', confirm: true, csrfToken: mgr.csrf, expectedRoundId: before8.data.roundId } });
  const roundId = (await call(PORT, '/api/manager/state', { cookie: mgr.cookie })).data.activity?.currentRoundId;
  const start = await call(PORT, '/api/manager/control', { cookie: mgr.cookie, origin: `http://127.0.0.1:${PORT}`,
    body: { action: 'start', confirm: true, csrfToken: mgr.csrf, expectedRoundId: roundId, minutes: 30, label: 'npc-test', commandId: 'npctest' + Date.now() } });
  check('结算并开新场成功', fin.status === 200 && start.status === 200 && start.data.ok, `${fin.status} ${start.status} ${JSON.stringify(start.data)}`);
  const afterReset = await tst(PORT);
  check('新场 NPC 与玩家全部清空', afterReset.data.players.length === 0, `players=${afterReset.data.players.length}`);
  const five = await npc(PORT, mgr, { count: 5, floorId: 1 });
  check('count=5 一次添加 5 名', five.status === 200 && five.data.players.length === 5, `${five.status} ${JSON.stringify(five.data).slice(0, 120)}`);
  const cappedNpcs = (await tst(PORT)).data.players.filter(p => p.npc === true);
  check('5 名 NPC 全部落点不与家具重叠', cappedNpcs.length === 5 && cappedNpcs.every(p => !collides(p.x, p.y)),
    cappedNpcs.map(p => `(${p.x},${p.y})`).join(' '));
  check('count 超出 1–5 被拒（不静默截断）', (await npc(PORT, mgr, { count: 99 })).status === 400);

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
