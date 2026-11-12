// 真实 Chromium 验收：独立内存服务与示例员工，不修改任何已有游戏或预览存档。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from '../annual-review/tests/browser.cjs';

const require = createRequire(import.meta.url), out = resolve('outputs/flower-interaction');
mkdirSync(out, { recursive: true });
async function freePort() {
  const s = createServer(); await new Promise(ok => s.listen(0, '127.0.0.1', ok));
  const port = s.address().port; await new Promise(ok => s.close(ok)); return port;
}
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
Object.assign(process.env, { HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_SSO: '0', SID_DB: '1', SID_DB_FILE: ':memory:', SID_MANAGER_CODE: 'flower-browser-test' });
const { server, ROOM, ACTIVITY, MANAGER, STORE } = require('./server.js');
const people = [
  { empNo: 'fsender', name: '献花体验者' }, { empNo: 'f001', name: '收花人甲' },
  { empNo: '090911', name: '榜样收花人乙' }, { empNo: '091013', name: '仅榜样示例' }, { empNo: 'fordinary', name: '普通同事' },
  ...Array.from({ length: 5 }, (_, i) => ({ empNo: 'f00' + (i + 3), name: '收花人' + (i + 3) }))
];
const recipients = people.filter((p, i) => i === 1 || i === 2 || i >= 5);
assert(ROOM.flowers.configure(recipients).ok);
const all = people.map(p => ROOM.join('browser-' + p.empNo, null, p).player), sender = all[0], target = all[1];
let ownToken = sender.sessionId;
const actors = Array.from({ length: 14 }, (_, i) => ROOM.join('recognition-' + i, null, { empNo: 'recognition-' + i, name: '致敬同事' + i }).player);
const results = [], errors = [], resourceErrors = [], pending = new Map();
let browser, socket, sequence = 0, stage = 'startup';
const call = (method, params = {}) => new Promise((ok, no) => {
  const id = ++sequence, timer = setTimeout(() => { pending.delete(id); no(Error('CDP timeout: ' + method)); }, 15000);
  pending.set(id, { ok: value => { clearTimeout(timer); ok(value); }, no: error => { clearTimeout(timer); no(error); } });
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
}
async function waitFor(label, predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await predicate(); if (value) return value; await delay(50); }
  throw Error('Timed out: ' + label);
}
const waitPage = expression => waitFor(expression, () => evaluate(expression));
async function click(selector) {
  const p = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...p });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...p });
}
async function key(key, code, keyCode) {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
}
async function capture(name) {
  const shot = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, name), Buffer.from(shot.data, 'base64'));
}
async function check(name, fn) { stage = name; await fn(); results.push({ name, passed: true }); console.log('PASS', name); }
async function selectPlayer(p) {
  if (await evaluate(`document.getElementById('roster').hidden`)) await click('#roster-toggle');
  await click(`#roster-items [data-player="${p.id}"]`);
  await waitPage(`!document.getElementById('target').hidden&&document.querySelector('#target h2').textContent===${JSON.stringify(p.name)}`);
  await delay(180);
}
async function openAs(player) {
  ownToken = player.sessionId;
  await evaluate(`localStorage.setItem('sid_session_token',${JSON.stringify(ownToken)})`);
  await call('Page.navigate', { url: base + '/' });
  await call('Page.bringToFront');
  await waitPage(`document.readyState==='complete'&&document.getElementById('annual-review-overlay').dataset.ready==='true'`);
  await key('Escape', 'Escape', 27);
  await waitPage(`!document.getElementById('annual-review-overlay').open&&document.getElementById('join-page').hidden`);
}
try {
  await waitFor('HTTP server', async () => { try { return (await fetch(base + '/api/auth/config')).ok; } catch { return false; } });
  browser = spawn(resolveChrome(), ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + mkdtempSync(join(out, '.browser-profile-')), 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  await waitFor('Chromium', async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; } });
  const page = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const job = pending.get(message.id); if (job) { pending.delete(message.id); message.error ? job.no(Error(message.error.message)) : job.ok(message.result); } return; }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      const path = new URL(message.params.response.url).pathname;
      if (!path.startsWith('/api/') && path !== '/favicon.ico') resourceErrors.push(message.params.response.url);
    }
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(base)}&&!localStorage.getItem('sid_session_token'))localStorage.setItem('sid_session_token',${JSON.stringify(ownToken)});` });
  await call('Page.navigate', { url: base + '/' });
  await call('Page.bringToFront');
  await waitPage(`document.readyState==='complete'&&document.getElementById('annual-review-overlay').dataset.ready==='true'`);
  await key('Escape', 'Escape', 27);
  await waitPage(`!document.getElementById('annual-review-overlay').open&&document.getElementById('join-page').hidden`);
  await check('名单与档案区分收花人、年度榜样和普通玩家，身份可叠加', async () => {
    await selectPlayer(target);
    assert.equal(await evaluate(`document.querySelectorAll('#roster-items .recipient-badge').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('#roster-items .roster-flower-count').length`), 0);
    for (const p of all.slice(2,4)) assert.equal(await evaluate(`document.querySelectorAll('#roster-items [data-player="${p.id}"] .model-badge').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('#target .recipient-badge').length`), 1);
    assert.equal(await evaluate(`document.querySelectorAll('#target .model-badge').length`), 0);
    await capture('01-recipient-desktop.png');
    await selectPlayer(all[2]);
    assert.equal(await evaluate(`document.querySelectorAll('#target .honor-badge').length`), 2);
    await selectPlayer(all[3]);
    assert.equal(await evaluate(`document.querySelectorAll('#target .model-badge').length`), 1);
    assert.equal(await evaluate(`!!document.getElementById('send-flower')`), false);
    await selectPlayer(all[4]); assert.equal(await evaluate(`!!document.getElementById('send-flower')`), false);
  });
  await check('键盘献花成功、+2 分、按钮去重，满屏特效不阻挡操作且按时销毁', async () => {
    await selectPlayer(target);
    await evaluate(`document.getElementById('send-flower').focus()`); await key('Enter', 'Enter', 13);
    await waitPage(`document.querySelectorAll('.flower-particle').length===28`);
    const started = await evaluate(`performance.now()`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.flower-celebration')).pointerEvents`), 'none');
    assert.equal(sender.score, 2); assert.equal(target.flowerState.received, 1);
    await delay(380);
    await capture('02-flower-celebration.png');
    await waitPage(`document.getElementById('send-flower').disabled&&document.getElementById('send-flower').textContent.includes('已送花')`);
    await evaluate(`document.getElementById('send-flower').click();document.getElementById('send-flower').click()`);
    assert.equal(sender.score, 2); assert.equal(target.flowerState.received, 1);
    await waitPage(`document.querySelector('#roster-items [data-player="${target.id}"] .roster-flower-count b')?.textContent==='1'`);
    await delay(2700);
    const held = await evaluate(`(()=>{const e=document.querySelector('.flower-dedication');return e?{duration:getComputedStyle(e).animationDuration,opacity:Number(getComputedStyle(e).opacity),text:e.textContent}:null;})()`);
    assert(held && held.opacity > .95); assert.equal(held.duration, '4.5s'); assert(held.text.includes(target.name));
    await capture('02b-dedication-held.png');
    await waitPage(`!document.querySelector('.flower-celebration')`);
    assert(await evaluate(`performance.now()`)-started >= 4200);
  });
  await check('发送者满 10 分仍可送花，计花继续且提示本次不加分', async () => {
    for (const recipient of all.filter(p => p !== target && recipients.some(q => q.empNo === p.empNo))) {
      await selectPlayer(recipient); await click('#send-flower');
      await waitPage(`document.getElementById('send-flower').textContent.includes('已送花')`);
    }
    assert.equal(sender.score, 10); assert.equal(sender.flowerState.sentPoints, 10);
    assert.equal(sender.flowerState.sentTo.length, 7);
    assert.match(await evaluate(`document.getElementById('copy-toast').textContent`), /已达 10 分/);
    await click('#my-info');
    assert.match(await evaluate(`document.getElementById('mine-flowers').innerText`), /10 \/ 10/);
    await capture('03-sender-cap.png'); await click('#mine-close');
  });
  await check('手机档案无横向溢出，触摸献花，减少动态效果时不播放满屏飞花', async () => {
    await openAs(actors[0]);
    await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: true });
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await selectPlayer(target);
    const button = await evaluate(`(()=>{const b=document.getElementById('send-flower');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [button] });
    await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitPage(`document.querySelector('.flower-celebration')`);
    assert.equal(await evaluate(`document.querySelectorAll('.flower-particle').length`), 0);
    const layout = await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,button:document.getElementById('send-flower').getBoundingClientRect().toJSON(),panel:document.getElementById('target').getBoundingClientRect().toJSON()})`);
    assert(layout.scroll <= layout.width + 1); assert(layout.button.x >= 0 && layout.button.right <= layout.width);
    assert(layout.panel.y >= 0 && layout.panel.bottom <= 844);
    await capture('04-mobile-390x844.png');
    await waitPage(`!document.querySelector('.flower-celebration')`);
    await call('Emulation.setEmulatedMedia', { features: [] });
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  });
  await check('接收者只见本场 15 朵和所得积分，不展示送花人；可向其他收花人献花', async () => {
    for (const actor of actors.slice(1)) assert(ROOM.sendFlower(actor.sessionId, { roundId: ROOM.room.roundId, targetId: target.id }).ok);
    assert.equal(target.flowerState.received, 15); assert.equal(target.score, 3);
    await openAs(target); await click('#my-info');
    const text = await evaluate(`document.getElementById('mine-flowers').innerText`);
    assert.match(text, /15 朵/); assert(!/献花体验者|致敬同事|送花名单/.test(text));
    assert.equal(await evaluate(`document.querySelectorAll('#mine [data-sender]').length`), 0);
    await capture('05-receiver-private-count.png'); await click('#mine-close');
    for (let i = 0; i < 5; i++) {
      const actor = ROOM.join('live-recognition-' + i, null, { empNo: 'live-recognition-' + i, name: '匿名提醒验收' + i }).player;
      assert(ROOM.sendFlower(actor.sessionId, { roundId: ROOM.room.roundId, targetId: target.id }).ok);
    }
    await waitPage(`document.getElementById('copy-toast').textContent.includes('20 朵鲜花')`);
    const notice = await evaluate(`document.getElementById('copy-toast').textContent`);
    assert.match(notice, /参与积分 \+1/); assert(!/匿名提醒验收|致敬同事/.test(notice));
    await selectPlayer(target); assert.equal(await evaluate(`!!document.getElementById('send-flower')`), false);
    await waitPage(`document.querySelector('#roster-items [data-player="${target.id}"] .roster-flower-count b')?.textContent==='20'`);
    assert.equal(await evaluate(`document.querySelectorAll('#roster-items .recipient-badge').length`), 0);
    await capture('05b-roster-flower-count.png');
    await selectPlayer(all[2]); await click('#send-flower');
    await waitPage(`document.getElementById('send-flower').textContent.includes('已送花')`);
    assert.equal(target.score, 6);
  });
  await check('刷新重登保持已送花，关闭及静止时没有持续特效节点', async () => {
    await openAs(sender); await selectPlayer(target);
    await waitPage(`document.getElementById('send-flower').disabled&&document.getElementById('send-flower').textContent.includes('已送花')`);
    assert.equal(await evaluate(`document.querySelectorAll('.flower-celebration,.flower-particle').length`), 0);
  });
  await check('管理员名单可保存并立即生效，后台刷新保留未保存草稿', async () => {
    await call('Page.navigate', { url: base + '/manager' });
    await waitPage(`document.readyState==='complete'&&!!document.getElementById('manager-code')`);
    await evaluate(`document.getElementById('manager-code').value='flower-browser-test';document.getElementById('manager-login-form').requestSubmit()`);
    await waitPage(`!document.getElementById('manager-app').hidden&&document.getElementById('flower-recipients').value.includes('f001')`);
    await evaluate(`window.confirm=()=>true;document.getElementById('flower-recipients').value+=${JSON.stringify('\nfnew,新增收花人')}`);
    await delay(5200);
    assert.match(await evaluate(`document.getElementById('flower-recipients').value`), /fnew/);
    await click('#flower-recipients-save');
    await waitPage(`document.getElementById('flower-recipients-summary').textContent.includes('8 位')`);
    assert(ROOM.flowers.view().recipients.some(p => p.empNo === 'fnew'));
    await capture('06-manager-roster.png');
  });
  await check('年度纪念册保留原榜样卡片，不展示勋章或献花入口', async () => {
    await call('Page.navigate', { url: base + '/annual-review/' });
    await waitPage(`document.readyState==='complete'&&!!document.querySelector('[data-chapter="people"]')`);
    await evaluate(`document.getElementById('start-review').click()`);
    await waitPage(`document.getElementById('book-stage').dataset.mode==='open'&&document.getElementById('book-stage').dataset.busy==='false'`);
    await click('[data-chapter="people"]');
    await waitPage(`document.querySelectorAll('#spread .honor-winner').length>0&&document.getElementById('book-stage').dataset.busy==='false'`);
    assert.equal(await evaluate(`document.querySelectorAll('#spread .annual-model-medal,.model-badge').length`), 0);
    assert.equal(await evaluate(`document.querySelectorAll('#spread #send-flower').length`), 0);
    await capture('07-annual-honors-unchanged.png');
  });
  assert.deepEqual(errors, []); assert.deepEqual(resourceErrors, []);
} catch (error) {
  results.push({ name: stage, passed: false, error: error.stack });
  console.error(error); process.exitCode = 1;
  try { if (socket?.readyState === 1) await capture('failure.png'); } catch {}
} finally {
  try { if (socket?.readyState === 1) { await call('Browser.close'); socket.close(); } } catch {}
  if (browser && browser.exitCode === null) browser.kill();
  for (const entry of ROOM.streams.values()) entry.close();
  await new Promise(ok => server.close(ok)); MANAGER.close(); STORE.close();
  writeFileSync(join(out, 'report.json'), JSON.stringify({ results, errors, resourceErrors, passed: results.filter(r => r.passed).length, failed: results.filter(r => !r.passed).length }, null, 2));
}
