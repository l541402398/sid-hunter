// 管理控制台真实 Chrome 验收（原生 CDP，零依赖，且不加载游戏页面）。
// 覆盖：授权码登录失败/成功、上局排名渲染、二次确认取消/确认、重开后排名保留、退出、无 JS 异常。
// Run: SID_CHROME=/usr/bin/google-chrome node online/manager-browser-test.mjs
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';

const online = dirname(fileURLToPath(import.meta.url));
const root = dirname(online);
const outputs = join(root, 'outputs');
await mkdir(outputs, { recursive: true });
const reportPath = join(outputs, 'manager-browser-results.json');
const shotPath = join(outputs, '管理控制台验收.png');
const CODE = '091256';
const chromePath = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const port = await freePort();
const debugPort = await freePort();
const base = `http://127.0.0.1:${port}`;
const results = [];
const runtimeErrors = [];
let server = null, chrome = null, ws = null, cdpSequence = 0, serverLog = '', fatal = null;
const inflight = new Map();
const test = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, pass: true, ...(detail ? { detail } : {}) }); console.log('通过', name, detail === undefined ? '' : '- ' + JSON.stringify(detail).slice(0, 200)); }
  catch (e) { results.push({ name, pass: false, error: e.message }); console.error('失败', name, '-', e.message); }
};
async function waitFor(label, predicate, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await pause(40); }
  throw Error(`等待超时：${label}`);
}
function send(method, params = {}) {
  return new Promise((ok, no) => {
    const id = ++cdpSequence;
    const timer = setTimeout(() => { inflight.delete(id); no(Error(`CDP 超时：${method}`)); }, 15000);
    inflight.set(id, { ok: r => { clearTimeout(timer); ok(r); }, no: e => { clearTimeout(timer); no(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception));
  return r.result.value;
}
async function point(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function click(selector) {
  const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('控件不存在: '+${JSON.stringify(selector)});if(e.hidden)throw Error('控件隐藏: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();if(!b.width||!b.height)throw Error('控件不可见: '+${JSON.stringify(selector)});return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await point(r.x, r.y);
}
const textOf = selector => ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e?String(e.textContent||''):null})()`);
const isVisible = selector => ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return !!(e&&!e.hidden&&e.getBoundingClientRect().width>0)})()`);

// ---------- HTTP：造一局并让它以 timeUp 结束 ----------
let managerCookie = '';
async function http(path, { method = 'GET', body, cookie, session } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...(session ? { 'X-Sid-Session': session } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* 非 JSON */ }
  return { status: res.status, data, text, setCookie: res.headers.getSetCookie() };
}
const cookieValue = res => ((res.setCookie || [])[0] || '').split(';')[0] || '';

async function buildFinishedMatch() {
  const join = async nickname => (await http('/api/join', { method: 'POST', body: { nickname } })).data;
  const bad = await join('浏览器甲');
  const one = await join('浏览器乙');
  const two = await join('浏览器丙');
  const three = await join('浏览器丁');
  const stateOf = async session => (await http('/api/state', { session })).data;
  const waitKill = async (session, ms = 20000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const skills = (await stateOf(session)).me.skills;
      if (skills.kill && skills.kill.chargesRemaining > 0 && skills.kill.cooldownUntil <= Date.now()) return true;
      await pause(250);
    }
    return false;
  };
  for (const [index, victim] of [[0, one], [1, two]]) {
    await waitKill(bad.sessionToken);
    const sid = (await stateOf(victim.sessionToken)).me.sid;
    await http('/api/skill', { method: 'POST', session: bad.sessionToken, body: { commandId: 'qa-kill-' + index + '-' + Date.now(), skill: 'kill', targetId: victim.playerId, sid } });
  }
  // 4 人房触发不了存活阈值，用测试时间推进把 2 小时走完，得到真实 timeUp 结算。
  await http('/api/test/advance', { method: 'POST', body: { ms: 7200000 + 1000 } });
  await waitFor('服务端完成 timeUp 结算', async () => ((await http('/api/test/state')).data || {}).finished === true, 8000);
  return { bad, one, two, three };
}

try {
  server = spawn(process.execPath, ['server.js'], {
    cwd: online,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SID_DEV: '0', SID_TEST: '1', SID_MANAGER_CODE: CODE },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', d => { serverLog += d; });
  server.stderr.on('data', d => { serverLog += d; });
  await waitFor('服务端启动', async () => { try { return (await fetch(base + '/')).ok; } catch { return false; } }, 10000);
  const match = await buildFinishedMatch();

  // 管理端登录（HTTP），用于验证排名数据本身
  const login = await http('/api/manager/login', { method: 'POST', body: { code: CODE } });
  managerCookie = cookieValue(login);
  await test('管理端 HTTP 登录拿到会话', () => {
    if (login.status !== 200 || !managerCookie) throw Error(`status=${login.status}`);
    return { status: login.status };
  });
  const stateRes = await http('/api/manager/state', { cookie: managerCookie });
  await test('HTTP 读取上局排名（4 人）', () => {
    const last = stateRes.data && stateRes.data.lastResult;
    if (!last || !Array.isArray(last.ranking) || last.ranking.length !== 4) throw Error(JSON.stringify(last));
    return { reason: last.finishReason, top: last.ranking[0].name, score: last.ranking[0].score };
  });

  // ---------- 启动真实 Chrome ----------
  chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--mute-audio',
    `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${join(outputs, '.manager-browser-profile')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => { });
  const version = await waitFor('Chrome 调试端口', async () => {
    try { const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`); return r.ok ? r.json() : null; } catch { return null; }
  }, 20000);
  const targetInfo = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(targetInfo.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = e => no(Error('WebSocket 连接失败')); });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id && inflight.has(message.id)) {
      const { ok, no } = inflight.get(message.id);
      inflight.delete(message.id);
      if (message.error) no(Error(message.error.message)); else ok(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.text || 'exception');
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      runtimeErrors.push((message.params.args || []).map(a => a.value || a.description || '').join(' '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await test('Chrome 可无头启动（版本可读）', () => ({ browser: version.Browser }));

  // 附加到页面并等待登录卡片
  await send('Page.navigate', { url: base + '/manager' });
  await waitFor('管理页加载完成', async () => ev(`document.readyState==='complete'`).catch(() => false), 15000);
  await waitFor('登录卡片出现', () => isVisible('.manager-login'), 8000);

  await test('未登录时显示授权码登录卡片', async () => {
    const visible = await isVisible('.manager-login');
    const appHidden = !(await isVisible('.manager-app'));
    if (!visible || !appHidden) throw Error(`login=${visible} appHidden=${appHidden}`);
    const type = await ev(`document.getElementById('manager-code').type`);
    return { loginVisible: visible, appHidden, inputType: type };
  });

  await test('页面源码不包含授权码', async () => {
    const html = await ev(`document.documentElement.outerHTML`);
    if (html.includes(CODE)) throw Error('页面出现授权码明文');
    return { length: html.length };
  });

  await test('错误授权码给出错误提示且不进入控制台', async () => {
    await click('#manager-code');
    await send('Input.insertText', { text: '000000' });
    await click('#manager-login');
    await waitFor('错误提示出现', async () => (await textOf('#manager-login-error') || '').length > 0, 8000);
    const message = await textOf('#manager-login-error');
    const appVisible = await isVisible('.manager-app');
    if (appVisible) throw Error('错误授权码竟然进入了控制台');
    if (!/授权码/.test(message)) throw Error('错误提示文案异常: ' + message);
    return { message };
  });

  await test('正确授权码进入控制台并显示上局排名', async () => {
    await ev(`(()=>{const i=document.getElementById('manager-code');i.value='';})()`);
    await click('#manager-code');
    await send('Input.insertText', { text: CODE });
    await click('#manager-login');
    await waitFor('控制台出现', () => isVisible('.manager-app'), 10000);
    await waitFor('排名表格出现', async () => (await ev(`document.querySelectorAll('#manager-ranking tr').length`)) >= 4, 10000);
    const rows = await ev(`JSON.stringify([...document.querySelectorAll('#manager-ranking tr')].map(tr=>[...tr.children].map(td=>td.textContent)))`);
    const parsed = JSON.parse(rows);
    const reason = await textOf('#manager-result-reason');
    const meta = await textOf('#manager-result-meta');
    if (parsed.length !== 4) throw Error('排名行数=' + parsed.length);
    if (!/时间到/.test(reason)) throw Error('结束原因文案异常: ' + reason);
    const names = parsed.map(r => r[1]);
    if (!names.includes('浏览器甲')) throw Error('排名缺少玩家: ' + JSON.stringify(names));
    const topScore = parsed[0][2];
    if (topScore !== '20') throw Error('第一名分数应为 20，实际 ' + topScore);
    const faction = parsed[0][4];
    if (faction !== '坏人') throw Error('第一名阵营应为坏人，实际 ' + faction);
    return { rows: parsed, reason, meta };
  });

  await test('登录卡片在进入控制台后隐藏', async () => {
    const loginVisible = await isVisible('.manager-login');
    if (loginVisible) throw Error('登录卡片仍然可见');
    return { loginHidden: true };
  });

  await test('授权码输入框已清空（不留存明文）', async () => {
    const value = await ev(`document.getElementById('manager-code').value`);
    if (value) throw Error('输入框仍保留: ' + value);
    return { value: '' };
  });

  await test('二次确认弹窗可取消且房间未被清空', async () => {
    await click('#manager-start');
    await waitFor('确认弹窗打开', () => isVisible('#manager-confirm'), 6000);
    const warn = await textOf('.manager-warn');
    if (!/清空全部玩家与身份凭证/.test(warn || '')) throw Error('警示文案异常: ' + warn);
    await click('#manager-confirm-cancel');
    await waitFor('确认弹窗关闭', async () => !(await isVisible('#manager-confirm')), 6000);
    const after = await http('/api/manager/state', { cookie: managerCookie });
    if (after.data.current.playerCount !== 4) throw Error('取消后玩家数=' + after.data.current.playerCount);
    return { warn, playerCount: after.data.current.playerCount };
  });

  await test('确认重开后房间清空且上局排名保留', async () => {
    await click('#manager-start');
    await waitFor('确认弹窗打开', () => isVisible('#manager-confirm'), 6000);
    await click('#manager-confirm-accept');
    const seen = [];
    const waitState = async (label, ok, timeout = 12000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        const text = await textOf('#manager-state');
        const server = (await http('/api/manager/state', { cookie: managerCookie })).data;
        seen.push(`${label} ui=${text} serverFinished=${server && server.current && server.current.finished} players=${server && server.current && server.current.playerCount}`);
        if (ok(text, server)) return { text, server };
        await pause(120);
      }
      throw Error(`${label} 超时：${seen.slice(-4).join(' || ')}`);
    };
    await waitState('房间清空', (text, server) => server && server.current && server.current.playerCount === 0 && server.current.finished === false);
    await waitFor('重开状态下仍显示排名', async () => (await ev(`document.querySelectorAll('#manager-ranking tr').length`)) >= 4, 10000);
    const settled = await waitState('状态条回到进行中', text => /进行中/.test(text || ''));
    const rows = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#manager-ranking tr')].map(tr=>[...tr.children].map(td=>td.textContent)))`));
    if (!rows.map(r => r[1]).includes('浏览器甲')) throw Error('重开后排名丢失: ' + JSON.stringify(rows));
    const joinNow = await http('/api/join', { method: 'POST', body: { nickname: '重开后新玩家' } });
    if (joinNow.status !== 200) throw Error('重开后无法加入: ' + JSON.stringify(joinNow.data));
    return { rows: rows.length, statusText: settled.text };
  });

  await test('页面全程无未捕获 JS 异常', () => {
    if (runtimeErrors.length) throw Error(runtimeErrors.slice(0, 3).join(' | '));
    return { errors: 0 };
  });

  await ev('window.scrollTo(0,0)');
  await pause(200);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'));

  await test('退出登录回到登录卡片', async () => {
    // 关键：浏览器登录前先作废我这边的 HTTP 会话，避免 /api/manager/session 探针读到
    // 另一个会话，导致“浏览器是否真的登录过”无法判定（HttpOnly Cookie 脚本读不到）。
    await http('/api/manager/logout', { method: 'POST', cookie: managerCookie });
    const beforeProbe = await (await fetch(base + '/api/manager/session', { headers: { cookie: managerCookie } })).json();
    if (beforeProbe.authed !== false) throw Error('HTTP 会话未先作废: ' + JSON.stringify(beforeProbe));
    await click('#manager-logout');
    await waitFor('回到登录卡片', () => isVisible('.manager-login'), 8000);
    const appHidden = !(await isVisible('.manager-app'));
    if (!appHidden) throw Error('控制台仍然可见');
    // 浏览器 Cookie 是 HttpOnly，脚本读不到值：只能确认退出后探针仍为未登录。
    const afterProbe = await (await fetch(base + '/api/manager/session', { headers: { cookie: managerCookie } })).json();
    if (afterProbe.authed !== false) throw Error('退出后出现意外会话: ' + JSON.stringify(afterProbe));
    return { appHidden, authed: afterProbe.authed };
  });
} catch (error) {
  fatal = error;
  results.push({ name: '验收脚本执行', pass: false, error: String(error && error.stack || error) });
} finally {
  try { if (ws) ws.close(); } catch { /* ignore */ }
  try { if (chrome) chrome.kill('SIGKILL'); } catch { /* ignore */ }
  try { if (server) server.kill('SIGTERM'); } catch { /* ignore */ }
  await pause(300);
}

const passed = results.filter(r => r.pass).length;
await writeFile(reportPath, JSON.stringify({ target: base, results, runtimeErrors, fatal: fatal ? String(fatal.message) : null, serverLogTail: serverLog.split('\n').slice(-12) }, null, 2));
console.log(`\n管理控制台浏览器验收：${passed}/${results.length} 项通过`);
if (fatal) console.error('致命错误：' + fatal.message);
if (serverLog) console.error('--- 服务端日志尾部 ---\n' + serverLog.split('\n').slice(-10).join('\n'));
if (passed !== results.length) process.exitCode = 1;
