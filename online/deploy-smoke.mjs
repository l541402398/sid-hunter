// 部署后冒烟自检：真实 HTTP 打 target，覆盖静态资源 / 身份 / SSE 快照 / 管理接口封锁。
// 用法: node smoke.mjs https://game.afann.xyz
const target = process.argv[2] || 'https://game.afann.xyz';
// 打公网 vhost 时，/api/dev|host|test 应由反向代理直接 404；直连源站（本地自检）时，
// 由服务端自己拒绝（403/405/404 都属于“未授权不可用”）。两种拓扑分别判定。
const targetHost = new URL(target).hostname;
const isLocalTarget = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(targetHost);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <- ' + detail : ''}`); };

async function get(path, opts = {}) {
  const res = await fetch(target + path, { redirect: 'manual', ...opts });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

const index = await get('/');
check('GET / => 200', index.status === 200, `status=${index.status}`);
check('页面标题正确', /S-ID/.test(index.text), index.text.match(/<title>([^<]*)<\/title>/)?.[1] || 'no title');
// 公网 vhost 由反代统一下发 no-store；直连源站时静态服务自身下发 no-cache，两者都不允许被缓存复用。
const cacheHeader = index.headers.get('cache-control') || '';
check('缓存禁用头', isLocalTarget ? /no-cache|no-store/.test(cacheHeader) : /no-store/.test(cacheHeader), cacheHeader);

for (const [path, type] of [['/game.js', 'javascript'], ['/styles.css', 'css'], ['/shared/world.js', 'javascript']]) {
  const res = await get(path);
  check(`静态资源 ${path}`, res.status === 200 && (res.headers.get('content-type') || '').includes(type), `status=${res.status} type=${res.headers.get('content-type')}`);
}

const bad = await get('/room.js');
check('服务端源码不可读 /room.js => 404', bad.status === 404, `status=${bad.status}`);

const state = await get('/api/state');
check('未认证 /api/state => 401', state.status === 401, `status=${state.status}`);

for (const path of ['/api/dev/capabilities', '/api/host/reset', '/api/test/state']) {
  const res = await get(path);
  const ok = isLocalTarget
    ? [403, 404, 405].includes(res.status)
    : res.status === 404;
  check(`管理接口封锁 ${path} => ${isLocalTarget ? '源站拒绝' : '404'}`, ok, `status=${res.status}`);
}

// ---------- 公网管理控制台（/manager）----------
// 授权码与线上 systemd 单元保持一致（SID_MANAGER_CODE 可覆盖）；冒烟只做只读校验，不触发重开。
const managerCode = process.env.SID_MANAGER_CODE || '091256';
const managerPage = await get('/manager');
check('管理页 /manager => 200 HTML', managerPage.status === 200 && /text\/html/.test(managerPage.headers.get('content-type') || ''), `status=${managerPage.status}`);
check('管理页标题正确', /S-ID 管理控制台/.test(managerPage.text), managerPage.text.match(/<title>([^<]*)<\/title>/)?.[1] || 'no title');
check('管理页不泄露授权码', !managerPage.text.includes(managerCode), '页面源码无授权码');
for (const asset of ['/manager.css', '/manager.js']) {
  const res = await get(asset);
  check(`管理页静态资源 ${asset}`, res.status === 200, `status=${res.status}`);
}

const managerSession = await get('/api/manager/session');
let managerSessionBody = null;
try { managerSessionBody = JSON.parse(managerSession.text); } catch { /* 非 JSON */ }
check('未登录 /api/manager/session => authed:false', managerSession.status === 200 && managerSessionBody && managerSessionBody.authed === false, JSON.stringify(managerSessionBody));
check('未登录 /api/manager/state => 401', (await get('/api/manager/state')).status === 401, 'state 需要管理会话');
const wrongCode = await fetch(target + '/api/manager/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'not-the-code' }) });
check('错误授权码 => 401', wrongCode.status === 401, `status=${wrongCode.status}`);

const managerLogin = await fetch(target + '/api/manager/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code: managerCode })
});
const managerLoginBody = await managerLogin.json().catch(() => null);
const setCookies = typeof managerLogin.headers.getSetCookie === 'function' ? managerLogin.headers.getSetCookie() : [managerLogin.headers.get('set-cookie')].filter(Boolean);
const managerCookie = (setCookies[0] || '').split(';')[0];
check('线上授权码可登录 /api/manager/login => 200', managerLogin.status === 200 && managerLoginBody && managerLoginBody.ok === true, `status=${managerLogin.status} body=${JSON.stringify(managerLoginBody).slice(0, 80)}`);
check('管理会话 Cookie 为 HttpOnly', /HttpOnly/i.test(setCookies[0] || '') && managerCookie.startsWith('sid_manager='), (setCookies[0] || '').slice(0, 60));
if (managerCookie) {
  const managerState = await fetch(target + '/api/manager/state', { headers: { cookie: managerCookie } });
  const managerStateBody = await managerState.json().catch(() => null);
  check('管理状态接口可读 /api/manager/state => 200', managerState.status === 200 && !!managerStateBody && managerStateBody.ok === true, `status=${managerState.status}`);
  check('管理状态含当前对局与名册', !!(managerStateBody && managerStateBody.current && Array.isArray(managerStateBody.teams)), JSON.stringify(managerStateBody && { finished: managerStateBody.current && managerStateBody.current.finished, players: managerStateBody.teams && managerStateBody.teams.length }));
  const lastResult = managerStateBody && managerStateBody.lastResult;
  check('结束局带上局排名快照', !managerStateBody || lastResult === null || lastResult === undefined || Array.isArray(lastResult.ranking) || lastResult.ranking === null, JSON.stringify(lastResult && { reason: lastResult.finishReason, ranked: lastResult.ranked, rows: lastResult.ranking && lastResult.ranking.length }));
  // 只验证重开接口已开通且要求二次确认，不真的清空线上房间。
  const resetProbe = await fetch(target + '/api/manager/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: managerCookie }, body: JSON.stringify({ csrfToken: managerLoginBody && managerLoginBody.csrfToken }) });
  check('重开接口开通且缺少二次确认 => 400', resetProbe.status === 400, `status=${resetProbe.status}`);
  const logout = await fetch(target + '/api/manager/logout', { method: 'POST', headers: { cookie: managerCookie } });
  check('管理退出 => 200', logout.status === 200, `status=${logout.status}`);
  const afterLogout = await fetch(target + '/api/manager/state', { headers: { cookie: managerCookie } });
  check('退出后管理会话失效 => 401', afterLogout.status === 401, `status=${afterLogout.status}`);
}

const nick = 'smoke-' + Math.random().toString(36).slice(2, 8);
const join = await fetch(target + '/api/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: nick })
});
const joined = await join.json();
check('加入房间 /api/join => ok', join.status === 200 && joined.ok === true, JSON.stringify(joined).slice(0, 160));
check('下发身份凭证', typeof joined.sessionToken === 'string' && joined.sessionToken.length >= 16, `tokenLen=${(joined.sessionToken || '').length}`);

if (joined.sessionToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let snapshots = 0;
  let first = null;
  try {
    const stream = await fetch(target + '/api/stream?sid_token=' + encodeURIComponent(joined.sessionToken), { signal: controller.signal });
    check('SSE /api/stream => 200', stream.status === 200, `status=${stream.status} type=${stream.headers.get('content-type')}`);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (snapshots < 3) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.type === 'snapshot') { snapshots++; first = first || payload; }
      }
    }
    reader.cancel().catch(() => { });
  } catch (error) {
    if (error.name !== 'AbortError') check('SSE 读取', false, String(error.message));
  } finally { clearTimeout(timer); }
  check('SSE 推送快照 >= 3 帧', snapshots >= 3, `frames=${snapshots}`);
  check('快照含自身身份与规则', !!(first && first.me && first.rules), JSON.stringify(first && first.rules));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
