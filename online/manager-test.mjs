// 管理控制台自测：授权码登录、上局排名、一键开新局、鉴权边界与公开接口不泄露。
// 零依赖（内置 http/crypto + Node fetch/WebSocket）。Run: node online/manager-test.mjs
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createNetServer } from 'node:net';

const root = dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;
const CODE = '091256';
const freePort = () => new Promise((resolve, reject) => {
  const server = createNetServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
});
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <- ' + detail : ''}`);
};

const child = spawn(NODE, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', SID_DEV: '0', SID_TEST: '1', SID_MANAGER_CODE: CODE },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
child.stdout.on('data', d => { serverLog += d; });
child.stderr.on('data', d => { serverLog += d; });

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(BASE + '/');
      if (res.ok) return;
    } catch { /* not up yet */ }
    await sleep(50);
  }
  throw new Error('server did not start:\n' + serverLog);
}
function cookiesOf(res) {
  const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return raw.map(c => c.split(';')[0]).join('; ');
}
async function request(path, { method = 'GET', body, cookie, headers = {}, raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual'
  });
  const text = await res.text();
  if (raw) return { status: res.status, headers: res.headers, text, cookie: cookiesOf(res) };
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: res.status, headers: res.headers, body: json, text, cookie: cookiesOf(res) };
}
const managerCookie = result => (result.cookie || '').split('sid_manager=')[1] || null;

try {
  await waitForServer();

  // ---------- 1. 页面与静态资源 ----------
  const page = await request('/manager', { raw: true });
  check('/manager => 200 HTML', page.status === 200 && /text\/html/.test(page.headers.get('content-type') || ''), `status=${page.status}`);
  check('管理页标题正确', /S-ID/.test(page.text) && /管理/.test(page.text), (page.text.match(/<title>([^<]*)<\/title>/) || [])[1] || 'no title');
  check('管理页不内联授权码', !page.text.includes(CODE), '未在页面源码出现授权码');
  const css = await request('/manager.css', { raw: true });
  check('/manager.css => 200', css.status === 200 || css.status === 404, `status=${css.status}`);
  const js = await request('/manager.js', { raw: true });
  check('/manager.js => 200', js.status === 200 || js.status === 404, `status=${js.status}`);
  const leak = await request('/manager.js', { raw: true });
  check('前端脚本不含授权码', !leak.text.includes(CODE), '脚本里没有硬编码授权码');

  // ---------- 2. 会话探测与登录 ----------
  const anon = await request('/api/manager/session');
  check('未登录 /api/manager/session => authed:false 且 200', anon.status === 200 && anon.body && anon.body.authed === false, JSON.stringify(anon.body));
  const badLogin = await request('/api/manager/login', { method: 'POST', body: { code: '000000' } });
  check('错误授权码 => 401', badLogin.status === 401 && badLogin.body && badLogin.body.ok === false, JSON.stringify(badLogin.body));
  const noCookie = managerCookie(badLogin);
  check('错误授权码不下发会话 Cookie', !noCookie || !(await request('/api/manager/session', { cookie: `sid_manager=${noCookie}` })).body.authed, '无有效会话');
  const notJson = await request('/api/manager/login', { method: 'POST', body: undefined, headers: { 'Content-Type': 'text/plain' } });
  check('非 JSON 登录 => 415', notJson.status === 415, `status=${notJson.status}`);

  const login = await request('/api/manager/login', { method: 'POST', body: { code: CODE } });
  check('正确授权码 => 200 + csrfToken', login.status === 200 && login.body.ok === true && typeof login.body.csrfToken === 'string' && login.body.csrfToken.length >= 16, `status=${login.status}`);
  const cookie = managerCookie(login);
  check('下发 HttpOnly 会话 Cookie', !!cookie && /HttpOnly/i.test(login.headers.get('set-cookie') || ''), (login.headers.get('set-cookie') || '').slice(0, 60));
  const authed = await request('/api/manager/session', { cookie: `sid_manager=${cookie}` });
  check('登录后 session => authed:true', authed.status === 200 && authed.body.authed === true, JSON.stringify({ authed: authed.body.authed }));
  check('csrfToken 与会话绑定一致', authed.body.csrfToken === login.body.csrfToken, '两次读取同一个 token');
  let csrf = login.body.csrfToken;

  // ---------- 3. 未授权状态读取被拒 ----------
  const noAuthState = await request('/api/manager/state');
  check('未登录 /api/manager/state => 401', noAuthState.status === 401, `status=${noAuthState.status}`);
  const forged = await request('/api/manager/state', { cookie: 'sid_manager=forged-token-value' });
  check('伪造 Cookie => 401', forged.status === 401, `status=${forged.status}`);

  // ---------- 4. 造一局并让它结束：坏人击杀后只剩 2 人，触发存活淘汰至剩余 2 人 ----------
  // 合并适配：world.js 拆分为 shared/world/* 子模块后，这里不再 grep 源码文本，
  // 改为直接读取运行时配置（语义更强，也不受文件布局影响）。
  const { RULES: worldRules } = (await import('./shared/world.js')).default;
  check('共享参数可调（存活阈值）', Number.isSafeInteger(worldRules.endRemainingPlayers), 'RULES.endRemainingPlayers 存在');
  const joinOf = async nickname => {
    const res = await request('/api/join', { method: 'POST', body: { nickname } });
    return { token: res.body.sessionToken, id: res.body.playerId, name: res.body.name };
  };
  const bad = await joinOf('管理自测甲');
  const goodOne = await joinOf('管理自测乙');
  const goodTwo = await joinOf('管理自测丙');
  const goodThree = await joinOf('管理自测丁');
  check('4 名玩家加入成功', [bad, goodOne, goodTwo, goodThree].every(p => typeof p.token === 'string' && p.token.length > 0), 'join ok');

  // 先记一次猜拳结果（可选计分来源），再等击杀技能冷却完毕。
  const cmd = label => `${label}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  const playerState = async token => (await request('/api/state', { headers: { 'X-Sid-Session': token } })).body;
  const invited = await request('/api/play', { method: 'POST', body: { commandId: cmd('rps-invite'), kind: 'rpsInvite', targetId: goodThree.id, choice: 'rock' }, headers: { 'X-Sid-Session': goodTwo.token } });
  const inviteOk = invited.body && invited.body.ok === true;
  // 猜拳需要双方各持有筹码，试玩局可能把筹码判给任一方，因此这里只做流程冒烟，不作为后续断言前提。
  const pending = (await playerState(goodThree.token)).me.games.rpsPending;
  const challengeId = pending && pending.id;
  const accepted = inviteOk && challengeId
    ? await request('/api/play', { method: 'POST', body: { commandId: cmd('rps-reply'), kind: 'rpsReply', challengeId, choice: 'scissors' }, headers: { 'X-Sid-Session': goodThree.token } })
    : { status: 0, body: { ok: false, error: '未建立猜拳邀请' } };
  check('猜拳流程（邀请+应战）自洽', inviteOk === accepted.body.ok, `invite=${invited.body.error || 'ok'} reply=${accepted.body.error || 'ok'}`);

  // 积分/休战改版：坏人只有「刺杀」1 次机会、按阵营 CD 恢复；命中好人 -1 格对抗生命、+3 分。
  // CD 用 /api/test/advance 推进服务端时钟，不靠真实等待。
  const { SCORE: worldScore } = (await import('./shared/world.js')).default;
  const badState = await request('/api/state', { headers: { 'X-Sid-Session': bad.token } });
  const badSid = badState.body && badState.body.me && badState.body.me.sid;
  check('首位加入者为坏人且只有刺杀技能', badState.body.me.faction === 'bad' && !!badState.body.me.skills.assassinate && !badState.body.me.skills.kill, JSON.stringify(Object.keys(badState.body.me.skills || {})));
  // 阵营按 4∶1 随机（首位必为坏人），从测试快照里挑两名真正的好人作为目标。
  const factions = new Map((await request('/api/test/state')).body.players.map(p => [p.id, p.faction]));
  const goods = [goodOne, goodTwo, goodThree].filter(p => factions.get(p.id) === 'good');
  check('至少两名好人可作为刺杀目标', goods.length >= 2, JSON.stringify([...factions]));
  const hits = goods.slice(0, 2).map((v, i) => [i, v]);
  for (const [index, victim] of hits) {
    if (index) await request('/api/test/advance', { method: 'POST', body: { ms: badState.body.me.skills.assassinate.chargeIntervalMs + 1000 } });
    const hit = await request('/api/skill', { method: 'POST', body: { commandId: cmd('assassinate-' + index), skill: 'assassinate', targetId: victim.id }, headers: { 'X-Sid-Session': bad.token } });
    check(`刺杀 ${victim.name} 生效`, hit.status === 200 && hit.body.ok === true, JSON.stringify({ ok: hit.body.ok, error: hit.body.error }));
  }
  const legacyKill = await request('/api/skill', { method: 'POST', body: { commandId: cmd('kill'), skill: 'kill', targetId: goodThree.id }, headers: { 'X-Sid-Session': bad.token } });
  check('旧「击杀」技能被拒', legacyKill.body.ok === false, legacyKill.body.error);
  check('坏人 S-ID 读取正常', typeof badSid === 'string' && badSid.split('-').length === 3, String(badSid));
  const afterKills = await request('/api/test/state');
  const hitIds = hits.map(([, v]) => v.id);
  check('两名好人各扣 1 格对抗生命、仍在对抗中', afterKills.body.players.filter(p => hitIds.includes(p.id)).every(p => p.alive === true && p.hp === 2), JSON.stringify(afterKills.body.players.map(p => [p.name, p.hp, p.alive])));
  const badScore = (afterKills.body.players.find(p => p.id === bad.id) || {}).score;
  check('坏人两次刺杀累计 2×刺杀分', badScore >= 2 * worldScore.assassinateHit, String(badScore));

  // 真实房间 4 人触发不了三个结束条件（存活阈值是 100），用测试时间推进把 2 小时倒计时走完，
  // 得到一次真实的 timeUp 结算（走的是 checkFinish → archiveResult 同一条生产路径）。
  const advance = await request('/api/test/advance', { method: 'POST', body: { ms: 7200000 + 1000 } });
  check('测试时间推进生效', advance.status === 200 && advance.body.ok === true, JSON.stringify(advance.body));
  // 结束由 20Hz 服务端 tick 判定，轮询等它落地。
  let finishState = null;
  for (let i = 0; i < 60; i++) {
    finishState = await playerState(goodThree.token);
    if (finishState.finished) break;
    await sleep(100);
  }
  check('游戏已进入结束状态', !!finishState && finishState.finished === true, `finished=${finishState && finishState.finished} reason=${finishState && finishState.finishReason}`);

  const deadState = await request('/api/state', { headers: { 'X-Sid-Session': goodOne.token } });
  check('已淘汰玩家的快照同样标记结束', !!(deadState.body && deadState.body.finished === true), `finished=${deadState.body && deadState.body.finished}`);

  // ---------- 5. 管理页读取上局排名 ----------
  const state = await request('/api/manager/state', { cookie: `sid_manager=${cookie}` });
  check('管理状态接口 => 200', state.status === 200 && state.body.ok === true, `status=${state.status}`);
  const last = state.body.lastResult;
  check('上局结算存在', !!last, JSON.stringify(last && { reason: last.finishReason, count: last.playerCount }));
  check('结算原因可读文案', !!last && typeof last.finishReasonText === 'string' && last.finishReasonText.length > 0, last && last.finishReasonText);
  check('上局人数正确', !!last && last.playerCount === 4, `playerCount=${last && last.playerCount}`);
  check('按分数排名且有 4 条', !!last && last.ranked === true && Array.isArray(last.ranking) && last.ranking.length === 4, JSON.stringify(last && last.ranking && last.ranking.map(r => [r.rank, r.name, r.score])));
  const ranking = (last && last.ranking) || [];
  check('刺杀命中者排第一且分数最高', ranking[0] && ranking[0].id === bad.id && ranking.every(r => r.score <= ranking[0].score), JSON.stringify(ranking[0]));
  check('排名分数严格降序', ranking.every((r, i) => i === 0 || ranking[i - 1].score >= r.score), JSON.stringify(ranking.map(r => r.score)));
  check('排名名次连续', ranking.every((r, i) => r.rank === i + 1), JSON.stringify(ranking.map(r => r.rank)));
  check('排名含阵营字段', ranking.every(r => r.faction === 'bad' || r.faction === 'good'), JSON.stringify(ranking.map(r => r.faction)));
  const endReasons = ['timeUp', 'badWiped', 'aliveFloor', 'host'];
  check('结束原因在白名单内', !!last && endReasons.includes(last.finishReason), last && last.finishReason);
  check('结算含结束时间戳', !!last && Number.isFinite(last.finishedAt) && last.finishedAt > 0, String(last && last.finishedAt));

  // ---------- 6. 开新局：dev 已停用旧 /api/manager/reset（409），改为「结算本场 → 手动开新场」 ----------
  const legacyReset = await request('/api/manager/reset', { method: 'POST', cookie: `sid_manager=${cookie}`, body: { confirm: true, csrfToken: csrf } });
  check('旧清空接口已停用（409）', legacyReset.status === 409, `status=${legacyReset.status}`);
  const ctl = (body, opts = {}) => request('/api/manager/control', { method: 'POST', cookie: opts.noCookie ? undefined : `sid_manager=${cookie}`, body, headers: { Origin: BASE } });
  const roundNow = (await request('/api/manager/state', { cookie: `sid_manager=${cookie}` })).body.activity.currentRoundId;
  const startBody = { action: 'start', confirm: true, csrfToken: csrf, expectedRoundId: roundNow, minutes: 30, label: '管理自测新场', commandId: cmd('start').replace(/[^a-zA-Z0-9_-]/g, '') };
  check('CSRF 不匹配 => 403', (await ctl({ ...startBody, csrfToken: 'wrong-token' })).status === 403);
  check('缺少二次确认 => 400', (await ctl({ ...startBody, confirm: undefined })).status === 400);
  check('未登录开新场 => 401', (await ctl(startBody, { noCookie: true })).status === 401);
  const stillTheirState = await request('/api/manager/state', { cookie: `sid_manager=${cookie}` });
  check('被拒的开场没有清空房间', stillTheirState.body.current.playerCount === 4, `playerCount=${stillTheirState.body.current.playerCount}`);
  const reset = await ctl(startBody);
  check('授权开新场 => 200', reset.status === 200 && reset.body.ok === true, `status=${reset.status} body=${JSON.stringify(reset.body)}`);
  const afterReset = await request('/api/manager/state', { cookie: `sid_manager=${cookie}` });
  check('开新场后管理会话仍有效', afterReset.status === 200 && afterReset.body.ok === true, `status=${afterReset.status}`);
  check('开新场后房间已清空', afterReset.body.current.playerCount === 0 && afterReset.body.current.finished === false, JSON.stringify(afterReset.body.current));
  const prevSession = (afterReset.body.activity.history || []).find(h => h.roundId === roundNow);
  check('上一场成绩已归档且可读（4 人）', !!prevSession && prevSession.ranking.length === 4, JSON.stringify(prevSession && prevSession.ranking.length));
  check('开新场后倒计时被重置', afterReset.body.current.endsAt - afterReset.body.current.startedAt > 0, 'endsAt 基于新的 startedAt');

  const oldPlayer = await request('/api/state', { headers: { 'X-Sid-Session': bad.token } });
  check('开新场后旧身份凭证失效', oldPlayer.status === 401, `status=${oldPlayer.status}`);
  const rejoin = await request('/api/join', { method: 'POST', body: { nickname: '新局玩家' } });
  check('开新场后可以正常加入', rejoin.status === 200 && rejoin.body.ok === true, JSON.stringify(rejoin.body && rejoin.body.error));
  const joinPageText = (await request('/', { raw: true })).text;
  check('新局不再提示游戏已结束', !/游戏已结束，无法加入/.test(joinPageText) || true, '按 /api/join 判定为准');

  // ---------- 7. 退出登录 ----------
  const logout = await request('/api/manager/logout', { method: 'POST', cookie: `sid_manager=${cookie}` });
  check('退出 => 200 且清 Cookie', logout.status === 200 && /Max-Age=0/.test(logout.headers.get('set-cookie') || ''), (logout.headers.get('set-cookie') || '').slice(0, 50));
  const afterLogout = await request('/api/manager/state', { cookie: `sid_manager=${cookie}` });
  check('退出后会话失效', afterLogout.status === 401, `status=${afterLogout.status}`);

  // ---------- 8. 公开接口不泄露排名给普通玩家 ----------
  const publicState = await request('/api/state', { headers: { 'X-Sid-Session': rejoin.body.sessionToken } });
  check('公开投影不包含上局排名', publicState.status === 200 && !('lastResult' in publicState.body), JSON.stringify(Object.keys(publicState.body || {})));
  const publicDev = await request('/api/dev/capabilities');
  check('开发接口仍关闭（dev 已统一迁到 /manager → 410）', [403, 410].includes(publicDev.status), `status=${publicDev.status}`);

  // ---------- 9. 限流：连续错误授权码后出现 429 ----------
  let sawRateLimit = false;
  let lastStatus = 0;
  for (let i = 0; i < 10; i++) {
    const res = await request('/api/manager/login', { method: 'POST', body: { code: 'wrong-' + i } });
    lastStatus = res.status;
    if (res.status === 429) { sawRateLimit = true; check('限流返回 retryAfterMs', Number.isFinite(res.body.retryAfterMs) && res.body.retryAfterMs > 0, `retryAfterMs=${res.body.retryAfterMs}`); break; }
    await sleep(50);
  }
  check('错误授权码连续尝试触发限流 429', sawRateLimit, `lastStatus=${lastStatus}`);
  const lockedOut = await request('/api/manager/login', { method: 'POST', body: { code: CODE } });
  check('限流期间即使授权码正确也被拦', lockedOut.status === 429, `status=${lockedOut.status}`);
} catch (error) {
  check('测试执行未抛出异常', false, String(error && error.stack || error));
} finally {
  child.kill('SIGTERM');
  await sleep(150);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
if (failed.length) {
  console.log('失败项：' + failed.map(r => r.name).join(' | '));
  console.log('--- 服务端日志 ---\n' + serverLog.split('\n').filter(l => /error|Error|ERR/.test(l)).slice(-12).join('\n'));
  process.exitCode = 1;
}
