// 零依赖真实 Chrome / 原生 CDP 进度玩法验收：转盘（可重复 + 阶梯收费）、计分、三种结束方式与排名。
// 头部脚手架原样复用自 exploration-browser-test.mjs（freePort、spawn server、CDP、moveTo、sampleStable 等）。
// 使用 managed Node 执行本脚本，服务端使用 process.execPath；仅在发现明确 bug 时才最小改动玩法源码。
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
const reportPath = join(outputs, 'progression-browser-results.json');
const onlineShot = join(outputs, '转盘与结算验收.png');
const finishShot = join(outputs, '结算验收.png');
const demoShot = join(outputs, '离线进度验收.png');
const chromePath = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [], runtimeErrors = [], consoleErrors = [], cleanup = {}, screenshots = [];
// 任务明确禁止修改的服务端源码；脚本只新增验收文件并写 outputs。
const protectedFiles = ['online/server.js', 'online/room.js', 'online/shared/world.js', 'online/public/game.js', 'online/public/index.html', 'online/public/styles.css', 'demo/main.js', 'demo/index.html', 'demo/styles.css'];
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async f => [f, createHash('sha256').update(await readFile(join(root, f))).digest('hex')])));
const beforeHashes = await hashes();
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, chrome, ws, commandSequence = 0, cdpSequence = 0, serverLog = '', chromeLog = '', fatalError, browserVersion, token, target, selfId, otherId, goodToken;
const inflight = new Map();
const commandId = () => `prog-qa-${Date.now()}-${++commandSequence}`;
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
const meScore = async (session = token) => (await state(session)).me.score;
const publicScore = async (session = token) => { const s = await state(session); return s.players.find(p => p.id === s.me.id).score; };
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
async function key(k, code, vk) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code, windowsVirtualKeyCode: vk }); }
async function open(url, predicate) {
  await send('Page.navigate', { url });
  await waitFor('真实页面加载 ' + url, async () => ev(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&(${predicate})`).catch(() => false));
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
}
async function screenshot(path) { await ev('window.scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path, Buffer.from(s.data, 'base64')); screenshots.push(path); }
async function moveTo(x, y, session = token) {
  const path = [];
  try {
    for (const [axis, goal] of [['x', x], ['y', y]]) {
      let moving = '', lastPosition, lastChange = Date.now();
      await waitFor(`真实 /api/input 移动 ${axis} 到 ${goal}`, async () => {
        const s = await state(session), p = s.players.find(p => p.id === s.me.id), diff = goal - p[axis];
        if (Math.abs(diff) <= 8) { path.push({ x: p.x, y: p.y }); return true; }
        if (p[axis] !== lastPosition) { lastPosition = p[axis]; lastChange = Date.now(); }
        assert.ok(Date.now() - lastChange < 1800, `路径被阻挡：${axis}=${p[axis]}，目标=${goal}`);
        const direction = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
        if (moving !== direction) { assert.equal((await api('/api/input', { [direction]: true }, session)).data.ok, true); moving = direction; }
        return false;
      }, 14000);
      await api('/api/input', {}, session);
    }
  } finally { await api('/api/input', {}, session); }
  return path;
}
async function sampleStable(selector, minMessages = 24) {
  await ev(`window.__qaButton=document.querySelector(${JSON.stringify(selector)});window.__qaStart=__qaSSE.length`);
  await waitFor('20Hz 快照期间按钮身份保持', async () => (await ev('__qaSSE.length-__qaStart')) >= minMessages);
  assert.equal(await ev(`__qaButton.isConnected&&__qaButton===document.querySelector(${JSON.stringify(selector)})`), true, '快照替换了正在操作的 DOM 按钮');
  return ev(`(()=>{const a=__qaSSE.slice(__qaStart);return {snapshots:a.length,spanMs:a.at(-1)-a[0],observedHz:(a.length-1)*1000/(a.at(-1)-a[0])}})()`);
}
const plays = () => ev(`__qaAPI.filter(x=>x.url==='/api/play')`);
// 转盘画布像素判定：好人线索券蓝 #3B82F6 / 坏人洗心革面券绿 #22C55E / 轮回券红 #EF4444 / 筹码扇区 #F59E0B。
const wheelSample = () => ev(`(()=>{const c=document.querySelector('#wheel-canvas');const g=c.getContext('2d');let d;try{d=g.getImageData(0,0,c.width,c.height).data;}catch(e){return {error:String(e)};}
  let blue=0,green=0,red=0,amber=0,opaque=0;for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2],a=d[i+3];
    if(a>0&&(r||gg||b))opaque++;
    if(b>170&&b-r>60&&b-gg>30&&gg>80)blue++;
    if(gg>150&&gg-r>60&&gg-b>40)green++;
    if(r>180&&r-gg>80&&r-b>80&&gg<120&&b<120)red++;
    if(r>200&&gg>110&&gg<200&&b<90)amber++;}
  return {blue,green,red,amber,opaque,w:c.width,h:c.height};})()`);
const wheelCostText = () => ev(`document.querySelector('#wheel-cost').textContent`);
const overlays = () => ev(`({wheel:!document.querySelector('#wheel-overlay').hidden,finish:!document.querySelector('#finish-overlay').hidden,ranking:!document.querySelector('#ranking').hidden})`);
async function openNpcPanel() {
  // 直接点「附近互动」NPC 按钮：openExploration 会先关闭已有面板，避免 E 键在面板已开时反而关闭。
  await waitFor('附近 NPC 按钮', async () => ev(`(()=>{const b=document.querySelector('#nearby-items [data-entity="npc-reception"]');return !!b&&!b.hidden;})()`));
  await click('#nearby-items [data-entity="npc-reception"]');
  try {
    await waitFor('NPC 探索面板', async () => ev(`document.querySelector('#exploration h2')?.textContent==='接待员小禾'&&!!document.querySelector('#exploration-wheel')`), 4000);
  } catch (e) {
    const diag = await ev(`({h2:document.querySelector('#exploration h2')?.textContent||null,wheel:!!document.querySelector('#exploration-wheel'),nearby:[...document.querySelectorAll('#nearby-items button')].filter(b=>!b.hidden).map(b=>b.dataset.entity),roster:document.querySelector('#roster-count').textContent,pageToken:localStorage.getItem('sid_session_token'),meIsGood:localStorage.getItem('sid_session_token')===${JSON.stringify(goodToken)}})`);
    throw Error(`NPC 探索面板未打开：${JSON.stringify(diag)}`);
  }
}
async function hostReset(session, csrfToken) {
  const r = await fetch(base + '/api/host/reset', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Sid-Session': session, Origin: base }, body: JSON.stringify({ csrfToken, confirm: true }), signal: AbortSignal.timeout(5000) });
  return { status: r.status, data: await r.json() };
}
const demoURL = pathToFileURL(join(root, 'demo/index.html')).href;
const demoSnapshot = () => ev('__sidTest.snapshot()');
const setPosition = (x, y) => ev(`__sidTest.setPosition(${x},${y})`);
const demoChips = async () => (await demoSnapshot()).exploration.chips;
const wheelNpc = 'npc-reception';
async function terminate(child, label) {
  if (!child) { cleanup[label] = '未启动'; return; }
  if (child.exitCode !== null || child.signalCode !== null) { cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode }; return; }
  const exit = new Promise(r => child.once('exit', r)); child.kill();
  let timer; await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(Error(`${label} 未退出`)), 5000); })]).finally(() => clearTimeout(timer));
  cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode };
}
// 好人/坏人盘筹码账目：cost 扣除；筹码项加 amount；线索券无可用坏人线索时补偿 2 筹码。
function chipsDelta(result) {
  const item = result.wheel.item;
  if (item.kind === 'chips') return item.amount;
  if (/补偿2筹码/.test(result.resultText || '')) return 2;
  return 0;
}
try {
  await mkdir(profile, { recursive: true });
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_DEV: '1', SID_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.on('error', e => { serverLog += e.stack; }); server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  await waitFor('loopback 服务启动', async () => { if (server.exitCode !== null) throw Error(serverLog); return api('/api/state', undefined, null).then(r => r.status === 401).catch(() => false); });
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  chrome.on('error', e => { chromeLog += e.stack; }); chrome.stderr.on('data', d => { chromeLog = (chromeLog + d).slice(-8000); });
  const page = await waitFor('Chrome CDP 页面', async () => { if (chrome.exitCode !== null) throw Error(chromeLog); return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).then(a => a.find(p => p.type === 'page')).catch(() => false); });
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && inflight.has(m.id)) { const p = inflight.get(m.id); inflight.delete(m.id); m.error ? p.no(Error(m.error.message)) : p.ok(m.result); } if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(m.params); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params); };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); await send('Page.bringToFront');
  browserVersion = await send('Browser.getVersion');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaSSE=[];window.__qaAPI=[];const NativeEventSource=window.EventSource;window.EventSource=class extends NativeEventSource{constructor(...args){super(...args);this.addEventListener('message',()=>window.__qaSSE.push(performance.now()));}};const __qaFetch=window.fetch;window.fetch=function(...a){const url=String(a[0]);return __qaFetch.apply(this,a).then(function(r){try{const c=r.clone();c.json().then(function(j){window.__qaAPI.push({url:url,status:r.status,body:j});}).catch(function(){});}catch(e){}return r;});};` });

  // ============================ 联机（浏览器页面） ============================
  await test('联机 01 首页无 JS 异常、浏览器加入（第一位=坏人）+ 第二位 API 加入（好人）', async () => {
    await open(base + '/', `!!document.querySelector('#join-page')&&!document.querySelector('#join-page').hidden`);
    await click('#nickname'); await send('Input.insertText', { text: '浏览器验收' }); await click('#join-form button[type=submit]');
    await waitFor('浏览器加入并收到权威快照', async () => ev(`document.querySelector('#join-page').hidden&&__qaSSE.length>1`));
    token = await ev(`localStorage.getItem('sid_session_token')`); assert.ok(token);
    const s0 = await state(); selfId = s0.me.id;
    assert.equal(s0.me.faction, 'bad', '第一位加入者应为坏人');
    target = (await api('/api/join', { nickname: '线索目标' }, null)).data; assert.equal(target.ok, true);
    otherId = target.playerId; goodToken = target.sessionToken;
    await waitFor('第二位玩家出现在页面', async () => (await ev(`document.querySelector('#roster-count').textContent`)) === '2');
    assert.equal((await state(goodToken)).me.faction, 'good');
    assert.equal(runtimeErrors.length, 0); assert.equal(consoleErrors.length, 0);
    assert.equal((await api('/api/test/state', undefined, null)).status, 200); // SID_TEST=1 本脚本专用
    return { browserPlayerId: selfId, browserFaction: 'bad', otherPlayerId: otherId };
  });
  if (!token || !target) throw Error('加入前置条件失败');

  await test('联机 02 真实靠近 NPC 打开探索面板：#exploration-wheel 打开覆盖层、画布有内容、首行「免费」', async () => {
    await moveTo(520, 340);
    await openNpcPanel();
    assert.equal(await ev(`document.querySelector('#exploration-wheel').disabled`), false, '未转动时转盘按钮应可用');
    assert.match(await ev(`document.querySelector('#exploration-wheel-state').textContent`), /第 1 次 · 免费/);
    await click('#exploration-wheel');
    await waitFor('转盘覆盖层可见', async () => (await overlays()).wheel);
    assert.match(await wheelCostText(), /免费/);
    await waitFor('转盘画布已绘制', async () => (await wheelSample()).opaque > 2000);
    const px = await wheelSample();
    assert.equal(await ev(`document.querySelector('#wheel-canvas').hidden`), false);
    return { costText: await wheelCostText(), pixels: px };
  });

  await test('联机 03 像素：坏人盘含洗心革面券绿 #22C55E、轮回券红 #EF4444，筹码扇区 #F59E0B', async () => {
    const px = await wheelSample();
    assert.ok(px.green > 200, `坏人盘应出现洗心革面券绿 #22C55E 扇区像素，实测 ${JSON.stringify(px)}`);
    assert.ok(px.red > 200, `坏人盘应出现轮回券红 #EF4444 扇区像素，实测 ${JSON.stringify(px)}`);
    assert.ok(px.amber > 2000, `应存在筹码扇区 #F59E0B，实测 ${JSON.stringify(px)}`);
    assert.equal(px.blue, 0, '坏人盘不应含线索券蓝 #3B82F6');
    await click('#wheel-close');
    await waitFor('关闭覆盖层', async () => !(await overlays()).wheel);
    return px;
  });

  await test('联机 04 切换浏览器身份为第二位好人：好人盘含线索券蓝 #3B82F6 与筹码扇区', async () => {
    // 第一位加入者固定是坏人；用第二位（API 造出的好人）身份验证好人盘：换 session 令牌后重载。
    await send('Network.clearBrowserCookies');
    await ev(`localStorage.setItem('sid_session_token', ${JSON.stringify(goodToken)})`);
    await send('Page.reload', { ignoreCache: true });
    await waitFor('以好人身份重新连接', async () => ev(`document.readyState==='complete'&&document.querySelector('#join-page').hidden&&__qaSSE.length>=3`).catch(() => false));
    token = goodToken;
    const s = await state(); assert.equal(s.me.id, otherId); assert.equal(s.me.faction, 'good');
    await moveTo(520, 340); await openNpcPanel();
    assert.match(await ev(`document.querySelector('#exploration-wheel-state').textContent`), /第 1 次 · 免费/);
    await click('#exploration-wheel');
    await waitFor('好人盘覆盖层可见', async () => (await overlays()).wheel);
    assert.match(await wheelCostText(), /免费/);
    const px = await waitFor('好人盘像素', async () => { const p = await wheelSample(); return p.blue > 200 ? p : false; });
    assert.ok(px.blue > 200, `好人盘应出现线索券蓝 #3B82F6 扇区像素，实测 ${JSON.stringify(px)}`);
    assert.ok(px.amber > 2000, `应存在筹码扇区 #F59E0B，实测 ${JSON.stringify(px)}`);
    // 好人盘不含洗心革面券/轮回券：允许极少量抗锯齿噪点，数量级应远低于坏人盘的特殊券扇区。
    assert.ok(px.green < 50, `好人盘不应含洗心革面券绿，实测 ${px.green}`);
    assert.ok(px.red < 50, `好人盘不应含轮回券红，实测 ${px.red}`);
    await screenshot(onlineShot);
    return px;
  });

  await test('联机 05 点 #wheel-spin：/api/play ok、slots 10、item=slots[slotIndex]、wheelSpins=1、#wheel-result，转动期间按钮禁用', async () => {
    const before = (await state()).me.exploration.chips, startLen = (await plays()).length;
    await click('#wheel-spin');
    const disabledDuringFlight = await waitFor('转动期间 #wheel-spin 禁用', async () => (await ev(`document.querySelector('#wheel-spin').disabled`)) === true, 3000);
    const play = await waitFor('服务端 /api/play 结算', async () => { const a = await plays(); return a.length > startLen ? a[a.length - 1].body : false; });
    assert.equal(play.ok, true, play.error);
    assert.equal(play.wheel.slots.length, 10, 'wheel.slots 必须为 10 格');
    assert.deepEqual(play.wheel.item, play.wheel.slots[play.wheel.slotIndex], 'wheel.item 必须等于 slots[slotIndex]');
    assert.equal(play.spins, 1); assert.equal(play.cost, 0);
    const after = await waitFor('wheelSpins 记录为 1', async () => { const e = (await state()).me; return e.games.wheelSpins[wheelNpc] === 1 ? e : false; });
    assert.equal(after.exploration.chips, before - play.cost + chipsDelta(play), '筹码变化必须等于 prize 或对应特殊效果');
    await waitFor('#wheel-result 非空', async () => (await ev(`document.querySelector('#wheel-result').textContent`)).length > 0);
    return { resultText: await ev(`document.querySelector('#wheel-result').textContent`), disabledDuringFlight, item: play.wheel.item };
  });

  await test('联机 06 可重复 + 阶梯收费：第 2/3 次费用=wheelSpinCost(n)、spins 递增、筹码按 prize-cost 变化', async () => {
    await click('#wheel-close');
    // 先用真实 /api/interact 搜索容器攒筹码（接待台 +3）。
    await moveTo(220, 275);
    assert.equal((await api('/api/interact', { commandId: commandId(), kind: 'search', entityId: 'reception-132-173' })).data.ok, true);
    await moveTo(520, 340); await openNpcPanel(); await click('#exploration-wheel');
    await waitFor('重新打开覆盖层', async () => (await overlays()).wheel);
    const expected = [];
    for (let n = 2; n <= 3; n++) {
      const before = (await state()).me.exploration.chips, startLen = (await plays()).length;
      await click('#wheel-spin');
      const play = await waitFor(`第 ${n} 次转动结算`, async () => { const a = await plays(); return a.length > startLen ? a[a.length - 1].body : false; });
      assert.equal(play.ok, true, play.error);
      assert.equal(play.spins, n);
      assert.equal(play.cost, await ev(`WORLD.wheelSpinCost(${n - 1})`), `第 ${n} 次费用应为 wheelSpinCost(${n - 1})`);
      assert.equal(play.wheel.slots.length, 10);
      // 动画约 1.2s，按钮在动画期间禁用；等动画结束后再允许下一次点击，避免竞态。
      await waitFor(`第 ${n} 次动画结束`, async () => (await ev(`document.querySelector('#wheel-spin').disabled`)) === false, 4000);
      const after = await waitFor(`wheelSpins=${n}`, async () => { const e = (await state()).me; return e.games.wheelSpins[wheelNpc] === n ? e : false; });
      assert.equal(after.exploration.chips, before - play.cost + chipsDelta(play), `第 ${n} 次筹码应按 (prize - cost) 变化`);
      expected.push({ n, cost: play.cost, before, after: after.exploration.chips, item: play.wheel.item });
    }
    return { ladder: expected };
  });

  await test('联机 07 把筹码花光后再次转动失败且筹码不变（按钮禁用 + API 400）', async () => {
    let failure = null, guard = 0;
    while (guard++ < 14) {
      const before = (await state()).me.exploration.chips;
      const r = await api('/api/play', { commandId: commandId(), kind: 'wheel', entityId: wheelNpc });
      if (!r.data.ok) { failure = { data: r.data, status: r.status, before }; break; }
      assert.equal(r.data.wheel.slots.length, 10);
      assert.equal((await state()).me.exploration.chips, before - r.data.cost + chipsDelta(r.data), '转动中筹码应按 (prize - cost) 变化');
    }
    assert.ok(failure, '筹码最终应不足，转动必须失败');
    assert.equal(failure.status, 400); assert.match(String(failure.data.error), /筹码不足/);
    assert.equal((await state()).me.exploration.chips, failure.before, '失败不得改变筹码');
    await waitFor('#wheel-spin 因筹码不足被禁用', async () => (await ev(`document.querySelector('#wheel-spin').disabled`)) === true);
    await click('#wheel-close');
    return { error: failure.data.error, chips: failure.before, spins: failure.data.spins };
  });

  await test('联机 08 分数：搜索容器后公开投影 score 与 #score-value 增加（=SCORE.search，含线索再加 clue）', async () => {
    await moveTo(830, 250); // 储物柜，奖励真实线索
    const before = await publicScore(), cluesBefore = (await state()).me.exploration.clues.length;
    const r = await api('/api/interact', { commandId: commandId(), kind: 'search', entityId: 'cabinet-785-160' });
    assert.equal(r.data.ok, true, r.data.error);
    const after = await publicScore(), cluesAfter = (await state()).me.exploration.clues.length;
    const expected = (await ev('WORLD.SCORE.search')) + (cluesAfter > cluesBefore ? await ev('WORLD.SCORE.clue') : 0);
    assert.equal(after - before, expected, '公开投影分数应等于 search(+clue)');
    await waitFor('#score-value 与公开分数同步', async () => (await ev(`Number(document.querySelector('#score-value').textContent)`)) === after);
    assert.ok(after > before);
    return { before, after, expected, clue: cluesAfter > cluesBefore };
  });

  await test('联机 09 排行榜：#ranking 面板可打开、#ranking-rules 含结束条件与剩余时间；20Hz 下按钮身份稳定', async () => {
    await moveTo(520, 340); await openNpcPanel(); await click('#exploration-wheel');
    await waitFor('转盘覆盖层', async () => (await overlays()).wheel);
    const wheelStable = await sampleStable('#wheel-spin', 24);
    await click('#wheel-close');
    const toggleStable = await sampleStable('#games-toggle', 24);
    await click('#ranking-toggle');
    await waitFor('排行榜打开', async () => (await overlays()).ranking);
    const rules = await ev(`document.querySelector('#ranking-rules').textContent`);
    assert.match(rules, /结束方式/); assert.match(rules, /存活淘汰至剩余 100 人/); assert.match(rules, /时间到/);
    assert.match(rules, /距时间到还有 \d+:\d{2}:\d{2}/, '应显示剩余时间');
    assert.ok((await ev(`document.querySelectorAll('#ranking-items .ranking-row').length`)) >= 2, '#ranking-items 应有行');
    await click('#ranking-close');
    return { rules, wheelStable, toggleStable };
  });

  await test('联机 10 结束条件②坏人全灭：accuse 打掉唯一坏人 → badWiped、ranking 降序、#finish-overlay 可见', async () => {
    const badPlayer = (await api('/api/test/state', undefined, null)).data.players.find(p => p.id === selfId);
    assert.equal(badPlayer.hp, 2, '唯一的坏人应有 2 点血');
    const st = await state(goodToken);
    assert.equal(st.finished, false);
    const a1 = await api('/api/skill', { commandId: commandId(), skill: 'accuse', targetId: selfId }, goodToken);
    assert.equal(a1.data.ok, true, a1.data.error);
    assert.equal((await api('/api/test/state', undefined, null)).data.players.find(p => p.id === selfId).hp, 1);
    await api('/api/test/advance', { ms: 12001 }, null);
    const a2 = await api('/api/skill', { commandId: commandId(), skill: 'accuse', targetId: selfId }, goodToken);
    assert.equal(a2.data.ok, true, a2.data.error);
    const fin = await waitFor('游戏以 badWiped 结束', async () => { const s = await state(goodToken); return s.finished ? s : false; });
    assert.equal(fin.finishReason, 'badWiped');
    assert.ok(Array.isArray(fin.ranking) && fin.ranking.length === 2);
    for (let i = 1; i < fin.ranking.length; i++) assert.ok(fin.ranking[i - 1].score >= fin.ranking[i].score, `ranking 必须按 score 降序（${i}）`);
    await waitFor('#finish-overlay 可见', async () => (await overlays()).finish);
    assert.match(await ev(`document.querySelector('#finish-reason').textContent`), /坏人/);
    assert.ok((await ev(`document.querySelectorAll('#finish-ranking .ranking-row').length`)) >= 2, '#finish-ranking 应有行');
    await screenshot(finishShot);
    return { finishReason: fin.finishReason, ranking: fin.ranking, reason: await ev(`document.querySelector('#finish-reason').textContent`) };
  });

  await test('联机 11 结束条件①不会在人数不足的小房间提前结束：rules.endRemainingPlayers=100 且 finished=false', async () => {
    const cap = await api('/api/dev/capabilities', undefined, goodToken);
    assert.equal(cap.status, 200); assert.equal(cap.data.canReset, true);
    const reset = await hostReset(goodToken, cap.data.csrfToken);
    assert.equal(reset.status, 200); assert.equal(reset.data.ok, true);
    await open(base + '/', `document.querySelector('#join-page')&&!document.querySelector('#join-page').hidden`);
    await click('#nickname'); await send('Input.insertText', { text: '进度甲' }); await click('#join-form button[type=submit]');
    await waitFor('重新加入', async () => ev(`document.querySelector('#join-page').hidden&&document.querySelector('#roster-count').textContent==='1'`));
    token = await ev(`localStorage.getItem('sid_session_token')`);
    assert.equal((await api('/api/join', { nickname: '进度乙' }, null)).data.ok, true);
    await waitFor('第二位玩家', async () => (await ev(`document.querySelector('#roster-count').textContent`)) === '2');
    const s = await state();
    assert.equal(s.rules.endRemainingPlayers, 100);
    assert.equal(s.rules.timeLimitMs, 7200000);
    assert.equal(s.finished, false, '2 人小房间不得因存活阈值提前结束');
    assert.equal(s.finishReason, null);
    return { endRemainingPlayers: s.rules.endRemainingPlayers, finished: s.finished };
  });

  await test('联机 12 结束条件③时间到：advance 超过 timeLimitMs → timeUp、ranking、覆盖层文案含「时间」', async () => {
    await api('/api/test/advance', { ms: 7200000 + 1000 }, null);
    const fin = await waitFor('游戏以 timeUp 结束', async () => { const s = await state(); return s.finished ? s : false; });
    assert.equal(fin.finishReason, 'timeUp');
    assert.ok(Array.isArray(fin.ranking) && fin.ranking.length === 2, 'timeUp 必须有排名');
    for (let i = 1; i < fin.ranking.length; i++) assert.ok(fin.ranking[i - 1].score >= fin.ranking[i].score);
    await waitFor('#finish-overlay 可见', async () => (await overlays()).finish);
    assert.match(await ev(`document.querySelector('#finish-reason').textContent`), /时间/);
    return { finishReason: fin.finishReason, ranking: fin.ranking.length, reason: await ev(`document.querySelector('#finish-reason').textContent`) };
  });

  await test('联机 全流程无 JavaScript 异常或 console.error', async () => { assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []); });

  // ============================ 离线 demo（file:// ?test） ============================
  await open(demoURL + '?test', `!!window.__sidTest`);
  await test('demo 13 play wheel：可重复、首次免费、第二次=wheelSpinCost(1)、spins 递增、筹码与 prize 一致、不足失败', async () => {
    await ev('__sidTest.reset()');
    await setPosition(220, 275); await ev(`__sidTest.interact('search','reception-132-173')`); // 攒 3 筹码
    await setPosition(520, 340);
    const expectChips = (res, before) => before - res.cost + (res.item && res.item.kind === 'chips' ? res.item.amount : 0);
    const before = await demoChips();
    const first = await ev(`__sidTest.play('wheel','${wheelNpc}')`);
    assert.equal(first.ok, true); assert.equal(first.slots.length, 10); assert.equal(first.cost, 0); assert.equal(first.spins, 1);
    assert.equal(first.chips, expectChips(first, before));
    const second = await ev(`__sidTest.play('wheel','${wheelNpc}')`);
    assert.equal(second.ok, true, '第二次应可继续转动（可重复）');
    assert.equal(second.cost, await ev('WORLD.wheelSpinCost(1)'));
    assert.equal(second.spins, 2);
    assert.equal(second.chips, expectChips(second, first.chips));
    let failure = null, guard = 0, prev = second;
    while (guard++ < 12) {
      const r = await ev(`__sidTest.play('wheel','${wheelNpc}')`);
      if (!r.ok) { failure = { r, before: prev.chips }; break; }
      prev = r;
    }
    assert.ok(failure, '筹码最终应不足，play 应返回 ok:false');
    assert.equal(await demoChips(), failure.before, '失败不得改变筹码');
    return { first: { cost: first.cost, spins: first.spins, chips: first.chips }, second: { cost: second.cost, spins: second.spins, chips: second.chips }, failureChips: failure.before };
  });

  await test('demo 14 真实 DOM 路径：点 #exploration-wheel 打开覆盖层 → 点 #wheel-spin 产生 #wheel-result，关闭后可重复', async () => {
    await ev('__sidTest.reset()');
    await setPosition(220, 275); await ev(`__sidTest.interact('search','reception-132-173')`);
    await setPosition(520, 340);
    await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69);
    assert.equal(await ev(`document.querySelector('#exploration h2').textContent`), '接待员小禾');
    await click('#exploration-wheel');
    assert.equal(await ev(`document.querySelector('#wheel-overlay').hidden`), false);
    await waitFor('转盘画布已绘制', async () => (await wheelSample()).opaque > 2000);
    await click('#wheel-spin');
    await waitFor('#wheel-result 出现真实结果', async () => /第 \d+ 次/.test(await ev(`document.querySelector('#wheel-result').textContent`)), 5000);
    const firstResult = await ev(`document.querySelector('#wheel-result').textContent`);
    await click('#wheel-close');
    assert.equal(await ev(`document.querySelector('#wheel-overlay').hidden`), true);
    await click('#exploration-wheel');
    await waitFor('再次打开', async () => (await ev(`document.querySelector('#wheel-overlay').hidden`)) === false);
    await click('#wheel-spin');
    const secondResult = await waitFor('第二次结果', async () => { const t = await ev(`document.querySelector('#wheel-result').textContent`); return /第 2 次/.test(t) ? t : false; }, 5000);
    assert.notEqual(/第 \d+ 次/.exec(firstResult)[0], secondResult);
    await click('#wheel-close');
    return { firstResult, secondResult };
  });

  await test('demo 15 像素与结算：好人盘含线索券蓝；forceFinish(badWiped) 覆盖层/#finish-reason/#finish-ranking；aliveFloor 展示存活者', async () => {
    await ev('__sidTest.reset()'); await setPosition(520, 340);
    await ev(`document.querySelector('#office').focus()`); await key('e', 'KeyE', 69);
    await click('#exploration-wheel');
    const px = await waitFor('好人盘像素', async () => { const p = await wheelSample(); return p.blue > 200 ? p : false; });
    assert.ok(px.blue > 200, `好人盘应出现线索券蓝扇区，实测 ${JSON.stringify(px)}`);
    assert.ok(px.amber > 2000, '应存在筹码扇区');
    await screenshot(demoShot);
    await click('#wheel-close');
    const fin = await ev(`__sidTest.forceFinish('badWiped')`);
    assert.equal(fin.finishReason, 'badWiped');
    assert.equal(await ev(`document.querySelector('#finish-overlay').hidden`), false);
    assert.match(await ev(`document.querySelector('#finish-reason').textContent`), /坏人/);
    const rows = await ev(`[...document.querySelectorAll('#finish-ranking .ranking-row')].map(r=>Number(r.querySelector('.ranking-score')?.textContent)||0)`);
    assert.ok(rows.length > 0, '#finish-ranking 应有行');
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1] >= rows[i], '按分数降序');
    await ev('__sidTest.reset()');
    const fin2 = await ev(`__sidTest.forceFinish('aliveFloor')`);
    assert.equal(fin2.finishReason, 'aliveFloor');
    assert.equal(await ev(`document.querySelector('#finish-overlay').hidden`), false);
    assert.match(await ev(`document.querySelector('#finish-ranking').textContent`), /不按分数排名/);
    assert.match(await ev(`document.querySelector('#finish-reason').textContent`), /存活/);
    await ev(`document.querySelector('#finish-close').click()`);
    return { pixels: px, badWipedReason: fin.finishReason, aliveFloorReason: fin2.finishReason };
  });

  await test('demo 16 score() 随搜索/兑换增长且 #score-value 同步；普通地址不暴露 ?test 接口且正常渲染', async () => {
    await ev('__sidTest.reset()');
    const s0 = (await ev(`__sidTest.score()`)).self;
    await setPosition(220, 275); await ev(`__sidTest.interact('search','reception-132-173')`);
    const s1 = (await ev(`__sidTest.score()`)).self;
    assert.equal(s1, s0 + 2, '搜索 +SCORE.search');
    await ev('__sidTest.draw()');
    assert.equal(Number(await ev(`document.querySelector('#score-value').textContent`)), s1, '#score-value 应同步');
    await setPosition(520, 340); await ev(`__sidTest.interact('exchange','${wheelNpc}')`);
    const s2 = (await ev(`__sidTest.score()`)).self;
    assert.equal(s2, s1 + 3, '兑换 +SCORE.exchange +SCORE.clue');
    await ev('__sidTest.draw()');
    assert.equal(Number(await ev(`document.querySelector('#score-value').textContent`)), s2);
    const before = runtimeErrors.length, beforeC = consoleErrors.length;
    await open(demoURL, `!!window.WORLD&&!!document.querySelector('#clue-bag')`);
    assert.equal(await ev('typeof window.__sidTest'), 'undefined', '普通地址不应暴露 __sidTest');
    assert.equal(await ev(`document.querySelector('#office').hidden`), false);
    assert.equal(runtimeErrors.length, before); assert.equal(consoleErrors.length, beforeC);
    return { score: [s0, s1, s2], normalUrlNoTestApi: true };
  });
} catch (e) { fatalError = { message: e.message, stack: e.stack }; console.error('验收初始化或前置流程失败', e.stack); process.exitCode = 1; }
finally {
  if (ws) { await send('Browser.close').catch(() => {}); ws.close(); }
  for (const [child, label] of [[chrome, 'chrome'], [server, 'httpServer']]) { try { await terminate(child, label); } catch (e) { cleanup[label] = { exited: false, error: e.message }; } }
  const afterHashes = await hashes(); const unchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
  results.push({ name: '仅新增验收脚本和 outputs；既有源码 SHA-256 未变', pass: unchanged, detail: unchanged ? { changed: [] } : { before: beforeHashes, after: afterHashes } });
  results.push({ name: 'finally 关闭 Chrome 与 HTTP 子进程，保留临时 profile 不递归删除', pass: cleanup.chrome?.exited === true && cleanup.httpServer?.exited === true, detail: cleanup });
  const summary = { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, total: results.length };
  const report = { date: new Date().toISOString(), engine: 'Windows 系统 Chrome headless + managed Node，零依赖原生 CDP，真实 HTTP/SSE 与 DOM 输入', node: process.execPath, browser: browserVersion, host: '127.0.0.1', port, environment: { SID_DEV: '1', SID_TEST: '1' }, results, runtimeErrors, consoleErrors, fatalError: fatalError ?? null, summary, screenshots: [...new Set(screenshots)].map(p => resolve(p)), profile: resolve(profile), cleanup, sourceHashes: { before: beforeHashes, after: afterHashes }, serverLog, chromeLog, unresolvedIssues: [...results.filter(r => !r.pass).map(r => ({ name: r.name, error: r.error ?? '断言未通过' })), ...(fatalError ? [fatalError] : [])], limitations: ['仅 Windows Chrome headless，不含其他浏览器或物理设备', '第一位加入者固定是坏人：好人盘通过把浏览器身份切换到第二位（API 好人）令牌并重载来验证', '转盘落点与奖励为服务端随机，断言只校验结构、费用与筹码增量的一致性', '结束后重开一局使用本机开发重置（SID_DEV=1 + CSRF + 二次确认）', '不清除用户目录；outputs/.browser-test-profile 保留，仅终止本脚本启动的进程'] };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...summary, fatalError: fatalError?.message ?? null, reportPath: resolve(reportPath), screenshots: report.screenshots, cleanup }, null, 2));
  if (summary.failed || fatalError) process.exitCode = 1;
}
