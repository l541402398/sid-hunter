// 公网管理控制台真实浏览器验收（只读，不改动线上房间）。
// 用法: SID_CHROME=/usr/bin/google-chrome node online/manager-live-browser-test.mjs https://game.afann.xyz 091256
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { setTimeout as pause } from 'node:timers/promises';

const online = dirname(fileURLToPath(import.meta.url));
const outputs = join(dirname(online), 'outputs');
await mkdir(outputs, { recursive: true });
const target = (process.argv[2] || 'https://game.afann.xyz').replace(/\/+$/, '');
const code = process.argv[3] || process.env.SID_MANAGER_CODE || '091256';
const chromePath = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const reportPath = join(outputs, 'manager-live-results.json');
const shotPath = join(outputs, '管理控制台线上验收.png');

const results = [];
const errors = [];
let chrome = null, ws = null, seq = 0, fatal = null;
const inflight = new Map();
const test = async (name, fn) => {
  try { const detail = await fn(); results.push({ name, pass: true, ...(detail ? { detail } : {}) }); console.log('通过', name, detail === undefined ? '' : '- ' + JSON.stringify(detail).slice(0, 220)); }
  catch (e) { results.push({ name, pass: false, error: e.message }); console.error('失败', name, '-', e.message); }
};
async function waitFor(label, predicate, timeout = 12000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const v = await predicate(); if (v) return v; await pause(60); }
  throw Error(`等待超时：${label}`);
}
function send(method, params = {}) {
  return new Promise((ok, no) => {
    const id = ++seq;
    const timer = setTimeout(() => { inflight.delete(id); no(Error(`CDP 超时：${method}`)); }, 20000);
    inflight.set(id, { ok: r => { clearTimeout(timer); ok(r); }, no: e => { clearTimeout(timer); no(e); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.text);
  return r.result.value;
}
async function click(selector) {
  const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)throw Error('控件不可用: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
}
const textOf = s => ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});return e?String(e.textContent||''):null})()`);
const visible = s => ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});return !!(e&&!e.hidden&&e.getBoundingClientRect().width>0)})()`);

const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const debugPort = await freePort();

try {
  const index = await fetch(target + '/');
  await test('公网首页可达', () => ({ status: index.status }));

  chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--mute-audio',
    `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=${join(outputs, '.manager-live-profile')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', () => { });
  const version = await waitFor('Chrome 调试端口', async () => {
    try { const r = await fetch(`http://127.0.0.1:${debugPort}/json/version`); return r.ok ? r.json() : null; } catch { return null; }
  }, 25000);
  const info = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(info.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(Error('WebSocket 连接失败')); });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && inflight.has(m.id)) { const h = inflight.get(m.id); inflight.delete(m.id); m.error ? h.no(Error(m.error.message)) : h.ok(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text || 'exception');
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description || '').join(' '));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await test('Chrome 可无头启动', () => ({ browser: version.Browser }));

  await send('Page.navigate', { url: target + '/manager' });
  await waitFor('页面加载', async () => ev(`document.readyState==='complete'`).catch(() => false), 25000);
  await waitFor('登录卡片出现', () => visible('.manager-login'), 15000);
  await test('公网 /manager 显示授权码登录卡片', async () => ({ login: await visible('.manager-login'), app: await visible('.manager-app') }));

  await test('错误授权码被拒且留在登录页', async () => {
    await click('#manager-code');
    await send('Input.insertText', { text: 'definitely-wrong' });
    await click('#manager-login');
    await waitFor('错误提示', async () => ((await textOf('#manager-login-error')) || '').length > 0, 12000);
    const msg = await textOf('#manager-login-error');
    if (await visible('.manager-app')) throw Error('错误授权码进入控制台');
    return { message: msg };
  });

  await test('授权码登录进入控制台并读到当前对局', async () => {
    await ev(`(()=>{const i=document.getElementById('manager-code');i.value='';})()`);
    await click('#manager-code');
    await send('Input.insertText', { text: code });
    await click('#manager-login');
    await waitFor('控制台出现', () => visible('.manager-app'), 15000);
    await waitFor('状态已刷新', async () => {
      const t = await textOf('#manager-state');
      return !!t && t !== '载入中…';
    }, 15000);
    const status = await textOf('#manager-state');
    const players = await textOf('#manager-players');
    const alive = await textOf('#manager-alive');
    const reason = await textOf('#manager-result-reason');
    const rows = await ev(`document.querySelectorAll('#manager-ranking tr').length`);
    return { status, players, alive, reason, rankingRows: rows };
  });

  await test('开始下一局按钮与二次确认弹窗就位（不确认）', async () => {
    await click('#manager-start');
    await waitFor('确认弹窗', () => visible('#manager-confirm'), 8000);
    const warn = await textOf('.manager-warn');
    if (!/清空全部玩家与身份凭证/.test(warn || '')) throw Error('警示文案异常: ' + warn);
    await click('#manager-confirm-cancel');
    await waitFor('弹窗关闭', async () => !(await visible('#manager-confirm')), 8000);
    return { warn, cancelled: true };
  });

  await test('页面无未捕获 JS 异常', () => {
    if (errors.length) throw Error(errors.slice(0, 3).join(' | '));
    return { errors: 0 };
  });

  await ev('window.scrollTo(0,0)');
  await pause(250);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(shotPath, Buffer.from(shot.data, 'base64'));
} catch (error) {
  fatal = error;
  results.push({ name: '线上浏览器验收脚本', pass: false, error: String(error && error.stack || error) });
} finally {
  try { if (ws) ws.close(); } catch { /* ignore */ }
  try { if (chrome) chrome.kill('SIGKILL'); } catch { /* ignore */ }
  await pause(300);
}
const passed = results.filter(r => r.pass).length;
await writeFile(reportPath, JSON.stringify({ target, results, errors, fatal: fatal ? String(fatal.message) : null }, null, 2));
console.log(`\n公网管理控制台浏览器验收（${target}）：${passed}/${results.length} 项通过`);
if (fatal) console.error('致命错误：' + fatal.message);
if (passed !== results.length) process.exitCode = 1;
