// 零依赖真实 Chrome / 原生 CDP 探索验收；不由游戏页面加载。
// 使用 managed Node 执行本脚本，服务端使用 process.execPath；不修改玩法源码。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const online = dirname(fileURLToPath(import.meta.url)), root = dirname(online);
const outputs = join(root, 'outputs'), profile = join(outputs, '.browser-test-profile');
const reportPath = join(outputs, 'exploration-browser-results.json');
const screenshotPath = join(outputs, '探索玩法验收.png');
const coverScreenshotPath = join(outputs, '家具遮挡验证.png');
const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [], runtimeErrors = [], consoleErrors = [], cleanup = {}, screenshots = [];
const protectedFiles = ['online/server.js', 'online/room.js', 'online/shared/world.js', 'online/public/game.js', 'online/public/index.html', 'online/public/styles.css', 'demo/main.js', 'demo/index.html', 'demo/styles.css'];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async f => [f, createHash('sha256').update(await readFile(join(root, f))).digest('hex')])));
const beforeHashes = await hashes();
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, chrome, ws, commandSequence = 0, cdpSequence = 0, serverLog = '', chromeLog = '', fatalError, browserVersion, token, target, clue, savedExploration;
const inflight = new Map();
const commandId = () => `browser-qa-${Date.now()}-${++commandSequence}`;
async function waitFor(label, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await pause(25); }
  throw Error(`等待超时：${label}`);
}
async function test(name, fn) {
  try { const detail = await fn(); results.push({ name, pass: true, ...(detail ? { detail } : {}) }); console.log('通过', name); }
  catch (e) { results.push({ name, pass: false, error: e.message, stack: e.stack }); console.error('失败', name, e.message); }
}
async function api(path, body, session = token) {
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(session ? { 'X-Sid-Session': session } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
  return { status: r.status, data: await r.json() };
}
const state = async session => (await api('/api/state', undefined, session ?? token)).data;
function send(method, params = {}) {
  return new Promise((ok, no) => { const id = ++cdpSequence; const timer = setTimeout(() => { inflight.delete(id); no(Error(`CDP 超时：${method}`)); }, 12000); inflight.set(id, { ok: r => { clearTimeout(timer); ok(r); }, no: e => { clearTimeout(timer); no(e); } }); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
async function point(x, y, heldUntil) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  try { if (heldUntil) await heldUntil(); }
  finally { await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
}
async function click(selector, heldUntil) {
  const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)throw Error('控件不存在或隐藏');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('控件不可见');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await point(r.x, r.y, heldUntil);
}
async function canvasClick(x, y) {
  const r = await ev(`(()=>{const r=document.querySelector('#office').getBoundingClientRect(),s=Math.min(r.width/960,r.height/640);return {x:r.x+(r.width-960*s)/2+${x}*s,y:r.y+(r.height-640*s)/2+${y}*s}})()`); await point(r.x, r.y);
}
async function key(key, code, vk) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk }); }
async function open(url, predicate) {
  await send('Page.navigate', { url });
  await waitFor('真实页面加载 ' + url, async () => ev(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&(${predicate})`).catch(() => false));
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
}
async function screenshot(path) { await ev('window.scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path, Buffer.from(s.data, 'base64')); screenshots.push(path); }
async function assertDestroyed() { assert.deepEqual(await ev(`({hidden:document.querySelector('#exploration').hidden,children:document.querySelector('#exploration').childNodes.length,expanded:document.querySelector('#clue-bag').getAttribute('aria-expanded')})`), { hidden: true, children: 0, expanded: 'false' }); }
async function moveTo(x, y) {
  const path = [];
  try {
    for (const [axis, goal] of [['x', x], ['y', y]]) {
      let moving = '', lastPosition, lastChange = Date.now();
      await waitFor(`真实 /api/input 移动 ${axis} 到 ${goal}`, async () => {
        const s = await state(), p = s.players.find(p => p.id === s.me.id), diff = goal - p[axis];
        if (Math.abs(diff) <= 8) { path.push({ x: p.x, y: p.y }); return true; }
        if (p[axis] !== lastPosition) { lastPosition = p[axis]; lastChange = Date.now(); }
        assert.ok(Date.now() - lastChange < 1800, `路径被阻挡：${axis}=${p[axis]}，目标=${goal}`);
        const direction = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
        if (moving !== direction) { assert.equal((await api('/api/input', { [direction]: true })).data.ok, true); moving = direction; }
        return false;
      }, 12000);
      await api('/api/input', {});
    }
  } finally { await api('/api/input', {}); }
  return path;
}
async function sampleStable(selector, minMessages = 24) {
  await ev(`window.__qaButton=document.querySelector(${JSON.stringify(selector)});window.__qaStart=__qaSSE.length`);
  await waitFor('20Hz 快照期间按钮身份保持', async () => (await ev('__qaSSE.length-__qaStart')) >= minMessages);
  assert.equal(await ev(`__qaButton.isConnected&&__qaButton===document.querySelector(${JSON.stringify(selector)})`), true, '快照替换了正在操作的 DOM 按钮');
  return ev(`(()=>{const a=__qaSSE.slice(__qaStart);return {snapshots:a.length,spanMs:a.at(-1)-a[0],observedHz:(a.length-1)*1000/(a.at(-1)-a[0])}})()`);
}
const demoURL = pathToFileURL(join(root, 'demo/index.html')).href;
const demoSnapshot = () => ev('__sidTest.snapshot()');
const setPosition = (x, y) => ev(`__sidTest.setPosition(${x},${y})`);
async function terminate(child, label) {
  if (!child) { cleanup[label] = '未启动'; return; }
  if (child.exitCode !== null || child.signalCode !== null) { cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode }; return; }
  const exit = new Promise(r => child.once('exit', r)); child.kill();
  let timer; await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(Error(`${label} 未退出`)), 5000); })]).finally(() => clearTimeout(timer));
  cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode };
}
try {
  await mkdir(profile, { recursive: true });
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_DEV: '1', SID_TEST: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.on('error', e => { serverLog += e.stack; }); server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  await waitFor('loopback 服务启动', async () => { if (server.exitCode !== null) throw Error(serverLog); return api('/api/state', undefined, null).then(r => r.status === 401).catch(() => false); });
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  chrome.on('error', e => { chromeLog += e.stack; }); chrome.stderr.on('data', d => { chromeLog = (chromeLog + d).slice(-8000); });
  const page = await waitFor('Chrome CDP 页面', async () => { if (chrome.exitCode !== null) throw Error(chromeLog); return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).then(a => a.find(p => p.type === 'page')).catch(() => false); });
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && inflight.has(m.id)) { const p = inflight.get(m.id); inflight.delete(m.id); m.error ? p.no(Error(m.error.message)) : p.ok(m.result); } if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(m.params); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); await send('Page.bringToFront');
  browserVersion = await send('Browser.getVersion');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaSSE=[];const NativeEventSource=window.EventSource;window.EventSource=class extends NativeEventSource{constructor(...args){super(...args);this.addEventListener('message',()=>window.__qaSSE.push(performance.now()));}};` });
  await test('online 真实 load、无 JavaScript 异常、DOM 加入玩家、第二位 API join', async () => {
    await open(base + '/', `!!document.querySelector('#join-page')&&!document.querySelector('#join-page').hidden`);
    await click('#nickname'); await send('Input.insertText', { text: '浏览器验收' }); await click('#join-form button[type=submit]');
    await waitFor('浏览器加入并收到权威快照', async () => ev(`document.querySelector('#join-page').hidden&&__qaSSE.length>1`));
    token = await ev(`localStorage.getItem('sid_session_token')`); assert.ok(token);
    target = (await api('/api/join', { nickname: '线索目标' }, null)).data; assert.equal(target.ok, true);
    await waitFor('第二位玩家出现在页面', async () => (await ev(`document.querySelector('#roster-count').textContent`)) === '2');
    assert.equal(runtimeErrors.length, 0); assert.equal(consoleErrors.length, 0);
    assert.equal((await api('/api/test/state', undefined, null)).status, 404);
    return { browserPlayerId: (await state()).me.id, targetPlayerId: target.playerId, testBackendDisabled: true };
  });
  if (!token || !target) throw Error('加入前置条件失败');
  await test('online 远距离真实点击接待台显示无法搜寻，禁用按钮，服务端拒绝', async () => {
    await canvasClick(210, 201);
    await waitFor('远距容器面板', async () => ev(`!document.querySelector('#exploration').hidden`));
    assert.match(await ev(`document.querySelector('#exploration-distance').textContent`), /距离太远/);
    assert.equal(await ev(`document.querySelector('#exploration-action').disabled`), true);
    const r = await api('/api/interact', { commandId: commandId(), kind: 'search', entityId: 'reception-132-173' }); assert.equal(r.data.ok, false);
    assert.equal((await state()).me.exploration.chips, 0); await click('#exploration-close'); await assertDestroyed();
  });
  await test('online 真实 /api/input 靠近、键盘 E 打开接待台、20Hz 按钮稳定、搜寻 +3 且重复防领', async () => {
    const path = await moveTo(220, 275);
    await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69);
    await waitFor('E 路径打开接待台', async () => ev(`document.querySelector('#exploration h2')?.textContent==='接待台'`));
    const stability = await sampleStable('#exploration-action');
    await click('#exploration-action', async () => {
      await ev('window.__qaHeld=document.querySelector("#exploration-action");window.__qaHeldStart=__qaSSE.length');
      await waitFor('真实指针按住跨越四个快照', async () => (await ev('__qaSSE.length-__qaHeldStart')) >= 4);
      assert.equal(await ev('__qaHeld===document.querySelector("#exploration-action")&&__qaHeld.isConnected'), true);
    });
    await waitFor('接待台奖励', async () => (await state()).me.exploration.chips === 3);
    await waitFor('已搜控件禁用', async () => ev(`document.querySelector('#exploration-action').disabled&&document.querySelector('#exploration-state').textContent.includes('已搜寻')`));
    await click('#exploration-action');
    const repeat = await api('/api/interact', { commandId: commandId(), kind: 'search', entityId: 'reception-132-173' }); assert.equal(repeat.data.ok, false); assert.equal((await state()).me.exploration.chips, 3);
    await click('#exploration-close'); return { path, stability, repeatError: repeat.data.error };
  });
  await test('online 真实移动 NPC-reception、稳定 DOM 确认支付 3、背包一条真实私密线索', async () => {
    const path = await moveTo(520, 285);
    await waitFor('附近 NPC 按钮', async () => ev(`!!document.querySelector('#nearby-items [data-entity="npc-reception"]')&&!document.querySelector('#nearby-items [data-entity="npc-reception"]').hidden`));
    const nearbyStability = await sampleStable('#nearby-items [data-entity="npc-reception"]');
    await click('#nearby-items [data-entity="npc-reception"]');
    assert.equal(await ev(`document.querySelector('#exploration h2').textContent`), '接待员小禾');
    const actionStability = await sampleStable('#exploration-action'); await click('#exploration-action');
    savedExploration = await waitFor('NPC 权威兑换', async () => { const e = (await state()).me.exploration; return e.chips === 0 && e.clues.length === 1 && e; });
    clue = savedExploration.clues[0]; assert.equal(clue.targetId, target.playerId); assert.equal(clue.value, (await state(target.sessionToken)).me.traits[clue.key]);
    await click('#exploration-close'); await click('#clue-bag');
    assert.equal(await ev(`document.querySelectorAll('#exploration .clue-card').length`), 1); assert.ok((await ev(`document.querySelector('#exploration').textContent`)).includes(clue.value));
    await screenshot(screenshotPath); return { path, nearbyStability, actionStability, exploration: savedExploration };
  });
  await test('online 公共 roster、日志及他人私有快照不泄露该 trait 或探索奖励', async () => {
    assert.ok(clue, '兑换前置条件失败'); await click('#exploration-close'); await click('#roster-toggle'); await click('#log-toggle');
    const s = await state(target.sessionToken); assert.equal(s.players.find(p => p.id === target.playerId).traits[clue.key], '***');
    assert.ok(!JSON.stringify(s.players).includes(clue.value)); assert.ok(!JSON.stringify(s.logs).includes(clue.value));
    assert.deepEqual(s.me.exploration, { chips: 0, clues: [], searched: [] }); assert.ok(s.players.every(p => !('exploration' in p)));
    assert.ok(!(await ev(`document.querySelector('#roster-items').textContent`)).includes(clue.value)); assert.ok(!(await ev(`document.querySelector('#log-items').textContent`)).includes(clue.value));
    await click('#search'); await send('Input.insertText', { text: clue.value });
    assert.equal(await ev(`document.querySelectorAll('#roster-items [data-player]').length`), 0);
    await ev(`document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'))`);
    const stableRoster = await sampleStable(`#roster-items [data-player="${target.playerId}"]`);
    await click(`#roster-items [data-player="${target.playerId}"] strong`); assert.equal(await ev(`document.querySelector('#target h2').textContent`), '线索目标');
    await click('#target-close'); await click('#roster-close'); await click('#log-close'); return { stableRoster, privateTraitStaysMasked: true };
  });
  await test('online 关闭、真实 Esc 与 CDP 失焦均销毁私密探索 DOM，不回滚奖励', async () => {
    for (const mode of ['关闭', 'Esc', 'blur']) {
      await click('#clue-bag'); assert.ok((await ev(`document.querySelector('#exploration').textContent`)).includes(clue.value));
      if (mode === '关闭') await click('#exploration-close');
      else if (mode === 'Esc') await key('Escape', 'Escape', 27);
      else { await send('Emulation.setFocusEmulationEnabled', { enabled: false }); await ev(`window.dispatchEvent(new Event('blur'))`); }
      await assertDestroyed(); assert.ok(!(await ev('document.body.innerHTML')).includes(clue.value)); assert.deepEqual((await state()).me.exploration, savedExploration);
    }
    await send('Emulation.setFocusEmulationEnabled', { enabled: true }); return { blurMode: 'CDP focus emulation + DOM blur；未模拟物理 Alt-Tab' };
  });
  await test('online 浏览器真实刷新恢复同一身份、探索背包及已搜状态；20Hz SSE 实测', async () => {
    const id = (await state()).me.id; await send('Page.reload', { ignoreCache: true });
    await waitFor('刷新 load 与重新连接', async () => ev(`document.readyState==='complete'&&document.querySelector('#join-page').hidden&&__qaSSE.length>=25`).catch(() => false));
    assert.equal((await state()).me.id, id); assert.deepEqual((await state()).me.exploration, savedExploration);
    assert.equal(await ev(`document.querySelector('#exploration').hidden`), true); await click('#clue-bag'); assert.equal(await ev(`document.querySelectorAll('.clue-card').length`), 1);
    const timings = await ev(`(()=>{const a=__qaSSE.slice(1),d=a.slice(1).map((x,i)=>x-a[i]).sort((x,y)=>x-y);return {snapshots:a.length,observedHz:(a.length-1)*1000/(a.at(-1)-a[0]),p50Ms:d[Math.floor(d.length*.5)],p95Ms:d[Math.floor(d.length*.95)]}})()`);
    assert.ok(timings.observedHz >= 15 && timings.observedHz <= 25, JSON.stringify(timings)); await screenshot(screenshotPath); await click('#exploration-close');
    await moveTo(220, 275); await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69); await waitFor('刷新后已搜状态', async () => ev(`document.querySelector('#exploration-state')?.textContent.includes('已搜寻')`)); assert.equal(await ev(`document.querySelector('#exploration-action').disabled`), true);
    return { timings, persistedIdentity: id, persistedExploration: true };
  });
  await test('online 20Hz 目标频率专项：真实 SSE 到达率至少 18Hz（允许 10% 调度偏差）', async () => {
    const sample = await sampleStable('#clue-bag', 40);
    assert.ok(sample.observedHz >= 18 && sample.observedHz <= 25, `服务端配置 20Hz，但真实浏览器收到 ${sample.observedHz.toFixed(2)}Hz；40 条快照跨度 ${sample.spanMs.toFixed(1)}ms。DOM 稳定性通过，频率偏差报告给 parent，不修改源码。`);
    return sample;
  });
  await test('online 全流程无 JavaScript 异常或 console.error', async () => { assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []); });

  await open(demoURL + '?test', `!!window.__sidTest`);
  await test('demo file:// 真实 load、远距点击容器拒绝、键盘 E 与真实 DOM 搜寻 +3 重复防领', async () => {
    await ev('__sidTest.reset()'); await canvasClick(210, 201);
    assert.equal(await ev(`document.querySelector('#exploration').hidden`), true); assert.match(await ev(`document.querySelector('#copy-toast').textContent`), /靠近/);
    await setPosition(220, 275); await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69);
    assert.equal(await ev(`document.querySelector('#exploration h2').textContent`), '接待台');
    await click('#exploration-action'); assert.equal((await demoSnapshot()).exploration.chips, 3); assert.equal(await ev(`document.querySelector('#exploration-action').disabled`), true);
    await click('#exploration-action'); assert.equal((await demoSnapshot()).exploration.chips, 3); await click('#exploration-close');
  });
  await test('demo NPC exchange、容器真实 DOM 搜寻线索、背包与关闭/Esc/blur销毁', async () => {
    await setPosition(565, 285); await canvasClick(520 - (await demoSnapshot()).cameraX, 262);
    assert.equal(await ev(`document.querySelector('#exploration h2').textContent`), '接待员小禾'); await click('#exploration-action');
    let s = await demoSnapshot(); assert.equal(s.exploration.chips, 0); assert.equal(s.exploration.clues.length, 1); await click('#exploration-close');
    await setPosition(832, 205); await canvasClick(825 - (await demoSnapshot()).cameraX, 185);
    assert.equal(await ev(`document.querySelector('#exploration h2').textContent`), '储物柜'); await click('#exploration-action'); assert.equal((await demoSnapshot()).exploration.clues.length, 2); await click('#exploration-close');
    s = await demoSnapshot(); const publicBefore = JSON.stringify(s.projections), logsBefore = JSON.stringify(s.logs);
    for (const mode of ['关闭', 'Esc', 'blur']) { await click('#clue-bag'); assert.equal(await ev(`document.querySelectorAll('.clue-card').length`), 2); if (mode === '关闭') await click('#exploration-close'); else if (mode === 'Esc') await key('Escape', 'Escape', 27); else await ev(`window.dispatchEvent(new Event('blur'))`); await assertDestroyed(); }
    assert.equal(JSON.stringify((await demoSnapshot()).projections), publicBefore); assert.equal(JSON.stringify((await demoSnapshot()).logs), logsBefore);
  });
  await test('demo 脚部碰撞：身体可进入柜上部，foot top=210 阻挡，水平可滑动', async () => {
    await ev('__sidTest.reset()'); await setPosition(832, 205); assert.equal(await ev(`WORLD.collidesAt(832,205,__sidTest.furniture)`), false);
    assert.equal(await ev(`WORLD.collidesAt(832,207,__sidTest.furniture)`), true);
    await ev(`__sidTest.key('KeyS',true);for(let i=0;i<12;i++)__sidTest.step(.05);__sidTest.key('KeyS',false);__sidTest.draw()`); assert.equal((await demoSnapshot()).self.y, 205);
    await ev(`__sidTest.key('KeyD',true);for(let i=0;i<3;i++)__sidTest.step(.05);__sidTest.key('KeyD',false);__sidTest.draw()`); assert.equal((await demoSnapshot()).self.x, 856);
  });
  await test('demo CDP Canvas 像素核验家具前后景、身体与名牌同步遮挡、移出遮挡名牌恢复及遮挡截图', async () => {
    await ev('__sidTest.reset()'); await setPosition(832, 400);
    const readRegions = `(()=>{__sidTest.draw();const s=__sidTest.snapshot(),g=document.querySelector('#office').getContext('2d');const region=(x,y,w,h)=>Array.from(g.getImageData(x-Math.round(s.cameraX),y,w,h).data);return {cabinet:region(816,170,30,30),head:region(821,152,18,8),front:region(821,221,18,8),selection:region(810,194,3,9)}})()`;
    const baseline = await ev(readRegions); await setPosition(832, 205); const behind = await ev(readRegions), s = await demoSnapshot();
    assert.equal(s.covered, true); assert.equal(await ev(`document.querySelector('#cover-status').textContent`), '身体已遮挡'); assert.ok(!s.labels.some(l => l.ids.includes(0)), '自身名牌应与人物同步隐藏');
    assert.deepEqual(behind.cabinet, baseline.cabinet, '柜体区域必须覆盖身体，不能把人物画在柜体前面'); assert.notDeepEqual(behind.head, baseline.head, '头部应在柜顶上方保留可见像素');
    await screenshot(coverScreenshotPath);
    await setPosition(832, 250); await ev('__sidTest.select(0)'); const front = await ev(readRegions);
    assert.equal((await demoSnapshot()).covered, false); assert.ok((await demoSnapshot()).labels.some(l => l.ids.includes(0)), '移出遮挡后自身名牌应立即恢复'); assert.notDeepEqual(front.front, baseline.front, '前景人物上衣应覆盖柜体');
    const cyanCount = front.selection.filter((_, i, a) => i % 4 === 0 && a[i] > 120 && a[i + 1] > 170 && a[i + 2] > 190).length;
    assert.ok(cyanCount > 0, '前景选中框应有蓝色像素');
    const changed = (a, b) => a.filter((v, i) => v !== b[i]).length;
    return { cabinetFootprintTop: 210, safePosition: { x: 832, y: 205 }, behindBodyChangedChannels: changed(behind.cabinet, baseline.cabinet), visibleHeadChangedChannels: changed(behind.head, baseline.head), foregroundBodyChangedChannels: changed(front.front, baseline.front), cyanCount, pixelSource: '原生 CDP Runtime 读取真实 Canvas getImageData；截图由 Page.captureScreenshot 生成' };
  });
  await test('demo 真实 DOM reset 清空筹码、线索、已搜、私密面板，容器可重新搜寻', async () => {
    await setPosition(220, 275); await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69); await click('#exploration-action'); assert.equal((await demoSnapshot()).exploration.chips, 3);
    await click('#exploration-close'); await setPosition(565, 285); await canvasClick(520 - (await demoSnapshot()).cameraX, 262); await click('#exploration-action');
    assert.equal((await demoSnapshot()).exploration.clues.length, 1); await click('#exploration-close');
    await ev(`document.querySelector('#my-info').focus()`); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await click('#reset'); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    const e = (await demoSnapshot()).exploration; assert.equal(e.chips, 0); assert.deepEqual(e.clues, []); assert.deepEqual(e.searched, []); assert.equal(e.panel, null); await assertDestroyed();
    await setPosition(220, 275); await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69); assert.equal(await ev(`document.querySelector('#exploration-action').disabled`), false);
  });
  await test('demo 普通 URL 不存在 ?test 权威诊断接口，普通玩法 DOM 容器与背包可用', async () => {
    await open(demoURL, `!!window.WORLD&&!!document.querySelector('#clue-bag')`); assert.equal(await ev('typeof window.__sidTest'), 'undefined'); assert.equal(await ev('location.search'), '');
    await canvasClick(210, 201); assert.equal(await ev(`document.querySelector('#exploration').hidden`), true); assert.match(await ev(`document.querySelector('#copy-toast').textContent`), /靠近/);
    await click('#clue-bag'); assert.match(await ev(`document.querySelector('#exploration').textContent`), /背包为空/); await click('#exploration-close');
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []);
  });
} catch (e) { fatalError = { message: e.message, stack: e.stack }; console.error('验收初始化或前置流程失败', e.stack); process.exitCode = 1; }
finally {
  if (ws) { await send('Browser.close').catch(() => {}); ws.close(); }
  for (const [child, label] of [[chrome, 'chrome'], [server, 'httpServer']]) { try { await terminate(child, label); } catch (e) { cleanup[label] = { exited: false, error: e.message }; } }
  const afterHashes = await hashes(); const unchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
  results.push({ name: '仅新增验收脚本和 outputs；既有源码 SHA-256 未变', pass: unchanged });
  results.push({ name: 'finally 关闭 Chrome 与 HTTP 子进程，保留临时 profile 不递归删除', pass: cleanup.chrome?.exited === true && cleanup.httpServer?.exited === true, detail: cleanup });
  const summary = { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, total: results.length };
  const report = { date: new Date().toISOString(), engine: 'Windows 系统 Chrome headless + managed Node，零依赖原生 CDP，真实 HTTP/SSE 与 DOM 输入', node: process.execPath, browser: browserVersion, host: '127.0.0.1', port, environment: { SID_DEV: '1', SID_TEST: '0' }, results, runtimeErrors, consoleErrors, fatalError: fatalError ?? null, summary, screenshots: [...new Set(screenshots)].map(p => resolve(p)), profile: resolve(profile), cleanup, sourceHashes: { before: beforeHashes, after: afterHashes }, serverLog, chromeLog, unresolvedIssues: [...results.filter(r => !r.pass).map(r => ({ name: r.name, error: r.error ?? '断言未通过' })), ...(fatalError ? [fatalError] : [])], limitations: ['仅 Windows Chrome headless，不包含其他浏览器、物理设备或跨网段联机', 'blur 使用 CDP focus emulation 配合 DOM blur，未验证物理 Alt-Tab', '20Hz 是真实 SSE 消息及 DOM 稳定性采样，不代表整机 GPU 帧率', 'demo ?test 仅用于现有 setPosition/step 布置与诊断；搜索、兑换、背包、reset 均用真实 CDP DOM 操作，普通 URL 的接口隔离单独验证', '不清除用户目录；outputs/.browser-test-profile 保留，仅终止本脚本启动的进程'] };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...summary, fatalError: fatalError?.message ?? null, reportPath: resolve(reportPath), screenshots: report.screenshots, cleanup }, null, 2));
  if (summary.failed || fatalError) process.exitCode = 1;
}
