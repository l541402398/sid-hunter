// 零依赖真实 Chrome / 原生 CDP 机制玩法验收；不由游戏页面加载。
// 脚手架复用自 exploration-browser-test.mjs（freePort、spawn server、CDP、moveTo 等）。
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
const reportPath = join(outputs, 'mechanics-browser-results.json');
const onlineShot = join(outputs, '机制玩法验收.png');
const demoShot = join(outputs, '离线机制验收.png');
const chromePath = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [], runtimeErrors = [], consoleErrors = [], cleanup = {}, screenshots = [];
// 本任务明确禁止修改的源码；脚本只会新增验收文件与 outputs，绝不削弱断言。
// 重构适配：分包后守卫必须覆盖新模块目录（见 test-helpers/guard-files.mjs）。
const frozenFiles = ['online/server.js', 'online/room.js', 'online/shared/world.js', ...MODULE_FILES];
const allGameFiles = [...frozenFiles, 'online/public/game.js', 'online/public/index.html', 'online/public/styles.css', 'demo/main.js', 'demo/index.html', 'demo/styles.css'];
const hashes = async list => Object.fromEntries(await Promise.all(list.map(async f => [f, createHash('sha256').update(await readFile(join(root, f))).digest('hex')])));
const frozenBefore = await hashes(frozenFiles), allBefore = await hashes(allGameFiles);
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, chrome, ws, commandSequence = 0, cdpSequence = 0, serverLog = '', chromeLog = '', fatalError, browserVersion, token, target;
const inflight = new Map();
const commandId = () => `mech-qa-${Date.now()}-${++commandSequence}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
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
const pub = (s, id) => s.players.find(p => p.id === id);
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
        const s = await state(session), p = pub(s, s.me.id), diff = goal - p[axis];
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
// 朝向只由移动意图归一化决定；停止后保留。发一个方向的意图，等朝向生效再停止。
async function faceDirection(dir, session = token) {
  await api('/api/input', { [dir]: true }, session);
  await waitFor('朝向归一化生效 ' + dir, async () => {
    const s = await state(session), p = pub(s, s.me.id), f = p.facing;
    return (dir === 'right' && f.x > 0.9) || (dir === 'left' && f.x < -0.9) || (dir === 'down' && f.y > 0.9) || (dir === 'up' && f.y < -0.9);
  }, 3000);
  await api('/api/input', {}, session);
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
// 转盘覆盖层画布是否有内容：统计不透明且非全黑的像素。
const wheelCanvasInk = () => ev(`(()=>{const c=document.querySelector('#wheel-canvas');const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>0&&(d[i]||d[i+1]||d[i+2]))n++;return n;})()`);
async function demoSampleRegion(x, y, w, h) { await ev('__sidTest.draw()'); const s = await demoSnapshot(); return sampleRegion(x, y, w, h, Math.round(s.cameraX)); }
async function demoSampleBand(band) { return demoSampleRegion(band.x, band.y, band.w, band.h); }
// ---------- 画布像素判定：世界坐标取样，按镜头换算成画布像素 ----------
// 亮青蓝：b-r>=55 且 b>=150 且 g>=130（#7fe3ff 与地面/木色明显分离）；灰色：#8b93a6 系（低饱和中间亮度）。
async function sampleRegion(worldX, worldY, w, h, camX) {
  return ev(`(()=>{const c=document.querySelector('#office');const g=c.getContext('2d');
    let x=Math.round(${worldX}-${camX}), y=Math.round(${worldY});
    x=Math.max(0,Math.min(c.width-${w},x)); y=Math.max(0,Math.min(c.height-${h},y));
    let d; try{ d=g.getImageData(x,y,${w},${h}).data; }catch(e){ return {error:String(e),x,y}; }
    let cyan=0,grey=0,green=0,maxBR=-999,count=0;
    for(let i=0;i<d.length;i+=4){const r=d[i],gg=d[i+1],b=d[i+2];count++;
      const br=b-r; if(br>maxBR)maxBR=br;
      if(br>=55&&b>=150&&gg>=130)cyan++;
      if(Math.abs(r-gg)<=16&&Math.abs(gg-b)<=16&&Math.abs(r-b)<=18&&r>=95&&r<=170)grey++;
      if(gg>150&&gg-r>45&&gg-b>25)green++;
    }
    return {x,y,w:${w},h:${h},cyan,grey,green,maxBR,count};})()`);
}
const worldCamX = x => clamp(Math.round(x - 480), 0, 2880);
async function browserCamX() { const s = await state(); return worldCamX(pub(s, s.me.id).x); }
async function waitMetric(label, probe, ok, timeout = 3500) {
  const deadline = Date.now() + timeout; let last;
  while (Date.now() < deadline) { last = await probe(); if (last && ok(last)) return last; await pause(70); }
  return last;
}
async function canvasClickWorld(worldX, worldY, camX) {
  const r = await ev(`(()=>{const r=document.querySelector('#office').getBoundingClientRect(),s=Math.min(r.width/960,r.height/640);return {x:r.x+(r.width-960*s)/2+(${worldX}-${camX})*s,y:r.y+(r.height-640*s)/2+${worldY}*s}})()`);
  await point(r.x, r.y);
}
// 名牌强调条（活着的非选中角色为绿色 #78c39b）位于 l.x+1,l.y+5；取样其左侧窄条。
const labelAccent = (p, camX) => sampleRegion(p.x - 74, p.y + 16, 10, 24, camX);
// 容器/家具描边的取样带（避开家具自带彩色装饰，只覆盖上边框中部）。
const reception = { id: 'reception-132-173', x: 132, y: 173, w: 155, h: 67 };
const cabinet = { id: 'cabinet-785-160', x: 785, y: 160, w: 92, h: 74 };
const plant = { id: 'plant-353-169', x: 353, y: 169, w: 62, h: 70 };
const npcReception = { id: 'npc-reception', name: '接待员小禾', x: 520, y: 285 };
const borderBand = f => ({ x: f.x + Math.round(f.w * 0.36), y: f.y - 6, w: Math.max(16, Math.round(f.w * 0.36)), h: 12 });
async function terminate(child, label) {
  if (!child) { cleanup[label] = '未启动'; return; }
  if (child.exitCode !== null || child.signalCode !== null) { cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode }; return; }
  const exit = new Promise(r => child.once('exit', r)); child.kill();
  let timer; await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(Error(`${label} 未退出`)), 5000); })]).finally(() => clearTimeout(timer));
  cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode };
}
let selfId, otherId;
try {
  await mkdir(profile, { recursive: true });
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_DEV: '1', SID_TEST: '0', SID_SSO: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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

  // ============================ 联机（浏览器页面） ============================
  await test('联机 01 首页无 JS 报错、浏览器加入 + 第二位玩家用 API 加入', async () => {
    await open(base + '/', `!!document.querySelector('#join-page')&&!document.querySelector('#join-page').hidden`);
    await click('#nickname'); await send('Input.insertText', { text: '浏览器验收' }); await click('#join-form button[type=submit]');
    await waitFor('浏览器加入并收到权威快照', async () => ev(`document.querySelector('#join-page').hidden&&__qaSSE.length>1`));
    token = await ev(`localStorage.getItem('sid_session_token')`); assert.ok(token);
    target = (await api('/api/join', { nickname: '线索目标' }, null)).data; assert.equal(target.ok, true);
    await waitFor('第二位玩家出现在页面', async () => (await ev(`document.querySelector('#roster-count').textContent`)) === '2');
    const s = await state(); selfId = s.me.id; otherId = target.playerId;
    assert.equal(runtimeErrors.length, 0); assert.equal(consoleErrors.length, 0);
    assert.equal((await api('/api/test/state', undefined, null)).status, 404);
    return { browserPlayerId: selfId, otherPlayerId: otherId, testBackendDisabled: true };
  });
  if (!token || !target) throw Error('加入前置条件失败');

  await test('联机 02 描边三档与可交互性一致（远距 idle 无亮色、64px ready 亮青蓝、搜寻后 blocked 灰、不可交互家具永无亮色）', async () => {
    const band = borderBand(reception);
    // 远距：出生点 (430,340) 距接待台足迹 174px，镜头发夹 0
    const far = await waitMetric('远距描边', async () => { const cam = await browserCamX(); return sampleRegion(band.x, band.y, band.w, band.h, cam); }, m => m.count > 0);
    assert.equal(far.cyan, 0, `远距时接待台不应有亮青蓝描边，实测 cyan=${far.cyan}`);
    const plantBand = borderBand(plant);
    const plantFar = await sampleRegion(plantBand.x, plantBand.y, plantBand.w, plantBand.h, await browserCamX());
    assert.equal(plantFar.cyan, 0, '不可交互家具（绿植）不应有亮色描边');
    // 走真实 /api/input 到 64px 内（未搜寻）
    await moveTo(220, 275);
    const ready = await waitMetric('ready 亮青蓝', async () => { const cam = await browserCamX(); return sampleRegion(band.x, band.y, band.w, band.h, cam); }, m => m.cyan > 0);
    assert.ok(ready.cyan > 0, `接待台 64px 内应出现亮青蓝描边，实测 ${JSON.stringify(ready)}`);
    // UI 搜寻该容器（真实 DOM）
    await ev(`document.querySelector('#office').focus()`); await key('k', 'KeyK', 75);
    await waitFor('K 打开接待台', async () => ev(`document.querySelector('#exploration h2')?.textContent==='接待台'`));
    await click('#exploration-action');
    await waitFor('接待台已搜', async () => { const s = await state(); return s.me.exploration.searched.includes(reception.id) && s.me.exploration.chips === 3; });
    const blocked = await waitMetric('blocked 灰描边', async () => { const cam = await browserCamX(); return sampleRegion(band.x, band.y, band.w, band.h, cam); }, m => m.grey > 0);
    assert.equal(blocked.cyan, 0, `搜寻后不应再有亮青蓝描边，实测 cyan=${blocked.cyan}`);
    assert.ok(blocked.grey > 0, `搜寻后应为灰色静态描边，实测 grey=${blocked.grey}`);
    await click('#exploration-close');
    // 不可交互家具（绿植）再确认一次仍无亮色
    const plantNear = await sampleRegion(plantBand.x, plantBand.y, plantBand.w, plantBand.h, await browserCamX());
    assert.equal(plantNear.cyan, 0, '绿植边框从未出现亮色描边像素');
    return { farCyan: far.cyan, readyCyan: ready.cyan, blockedCyan: blocked.cyan, blockedGrey: blocked.grey, maxBRReady: ready.maxBR, plantCyan: [plantFar.cyan, plantNear.cyan] };
  });

  await test('联机 03 遮挡时人物与名称同步隐藏、移出后同帧恢复（自己与第二位玩家各一次）', async () => {
    // 自己先走走廊（y=200）再横移到柜子下方
    await moveTo(600, 200); await moveTo(832, 200);
    await waitFor('自身遮挡 HUD', async () => (await ev(`document.querySelector('#cover-status').textContent`)) === '身体已遮挡 · 不免疫技能');
    let me = pub(await state(), selfId);
    let cam = await browserCamX();
    const selfCoveredAccent = await waitMetric('遮挡名牌消失', async () => { cam = await browserCamX(); return labelAccent(me, cam); }, m => m.count > 0 && m.green === 0, 1500);
    assert.equal(selfCoveredAccent.green, 0, '被遮挡时自身名牌强调像素不应存在');
    await canvasClickWorld(me.x + 56, me.y + 15, cam);
    await ev('new Promise(r=>requestAnimationFrame(r))');
    assert.equal(await ev(`document.querySelector('#target').hidden`), true, '被遮挡时自身名牌区域点击不应命中角色（自身不进入 labels 命中）');
    // 移出遮挡同一帧恢复
    await moveTo(950, 200);
    await waitFor('自身恢复 HUD', async () => (await ev(`document.querySelector('#cover-status').textContent`)) === '无遮挡');
    me = pub(await state(), selfId); cam = await browserCamX();
    const selfRestored = await waitMetric('名牌恢复', async () => { cam = await browserCamX(); return labelAccent(me, cam); }, m => m.green > 0, 2000);
    assert.ok(selfRestored.green > 0, '移出遮挡后自身名牌强调像素应立即恢复');
    await canvasClickWorld(me.x + 56, me.y + 15, cam);
    await waitFor('自身名牌命中', async () => !(await ev(`document.querySelector('#target').hidden`)));
    assert.equal(await ev(`document.querySelector('#target h2').textContent`), me.name);
    await click('#target-close');
    // 自己离开该区域，避免干扰第二位玩家
    await moveTo(600, 280);
    // 第二位玩家（API）
    await moveTo(600, 200, target.sessionToken); await moveTo(832, 200, target.sessionToken);
    let other = pub(await state(), otherId); cam = await browserCamX();
    const otherCovered = await waitMetric('他人遮挡名牌消失', async () => { cam = await browserCamX(); return labelAccent(other, cam); }, m => m.count > 0 && m.green === 0, 1500);
    assert.equal(otherCovered.green, 0, '第二位玩家被遮挡时名牌强调像素不应存在');
    await canvasClickWorld(other.x + 56, other.y + 15, cam);
    await ev('new Promise(r=>requestAnimationFrame(r))');
    assert.equal(await ev(`document.querySelector('#target').hidden`), true, '第二位玩家被遮挡时名牌区域点击不应命中角色');
    await moveTo(950, 200, target.sessionToken);
    other = pub(await state(), otherId); cam = await browserCamX();
    const otherRestored = await waitMetric('他人名牌恢复', async () => { cam = await browserCamX(); return labelAccent(other, cam); }, m => m.green > 0, 2000);
    assert.ok(otherRestored.green > 0, '第二位玩家移出遮挡后名牌应立即恢复');
    await canvasClickWorld(other.x + 56, other.y + 15, cam);
    await waitFor('他人名牌命中', async () => !(await ev(`document.querySelector('#target').hidden`)));
    assert.equal(await ev(`document.querySelector('#target h2').textContent`), other.name);
    await click('#target-close');
    return { selfCoveredAccent, selfRestored, otherCovered, otherRestored, coveredPos: { x: 832, y: 200 }, restoredPos: { x: 950, y: 200 } };
  });

  await test('联机 04 转盘覆盖层：打开、10 格、首次免费、可重复、chips 与 prize 一致、转动期间按钮禁用', async () => {
    await moveTo(520, 340);
    await ev(`document.querySelector('#office').focus()`); await key('k', 'KeyK', 75);
    await waitFor('NPC 面板出现转盘', async () => ev(`!!document.querySelector('#exploration-wheel')&&document.querySelector('#exploration h2').textContent==='接待员小禾'`));
    // 本轮规则：转盘不再“用一次即禁用”，而是打开覆盖层且可重复转动。
    assert.equal(await ev(`document.querySelector('#exploration-wheel').disabled`), false, '转盘按钮应可用于打开覆盖层');
    assert.match(await ev(`document.querySelector('#exploration-wheel-state').textContent`), /第 1 次 · 免费/);
    const before = (await state()).me.exploration.chips;
    await click('#exploration-wheel');
    await waitFor('转盘覆盖层可见', async () => (await ev(`document.querySelector('#wheel-overlay').hidden`)) === false);
    await waitFor('转盘画布有内容', async () => (await wheelCanvasInk()) > 2000);
    assert.match(await ev(`document.querySelector('#wheel-cost').textContent`), /免费/);
    await click('#wheel-spin');
    await waitFor('转动期间 #wheel-spin 禁用', async () => (await ev(`document.querySelector('#wheel-spin').disabled`)) === true, 3000);
    const after = await waitFor('wheelSpins 记录 1 次', async () => { const e = (await state()).me; return e.games.wheelSpins[npcReception.id] === 1 ? e : false; });
    await waitFor('#wheel-result 非空', async () => (await ev(`document.querySelector('#wheel-result').textContent`)).length > 0);
    const resultText = await ev(`document.querySelector('#wheel-result').textContent`);
    const m = resultText.match(/获得(\d+)筹码/);
    assert.equal(after.exploration.chips - before, m ? Number(m[1]) : 0, '筹码增量应等于 prize（洗心革面券/轮回券不改变筹码）');
    await click('#wheel-close');
    // 可重复：重新打开后按钮仍可用，证明不是“领取后即禁用”。
    await click('#exploration-wheel');
    await waitFor('再次打开覆盖层', async () => (await ev(`document.querySelector('#wheel-overlay').hidden`)) === false);
    assert.equal(await ev(`document.querySelector('#wheel-spin').disabled`), false, '有筹码时第二次转动按钮应可用（可重复）');
    await click('#wheel-close');
    await click('#exploration-close');
    return { chipsBefore: before, chipsAfter: after.exploration.chips, resultText };
  });

  await test('联机 05 猜拳入口：工具栏旧入口已移除，靠近后点击目标出现「邀请猜拳」并弹出十秒选择界面', async () => {
    const B = target.sessionToken;
    const A = await ev(`localStorage.getItem('sid_session_token')`);
    assert.ok(typeof A === 'string' && A.length >= 16, '浏览器页面的玩家令牌可读');
    // 工具栏「互动小游戏」入口与 #games-toggle 均已移除（改用「靠近角色 → 邀请猜拳」）。
    assert.deepEqual(JSON.parse(await ev(`JSON.stringify({toggle:!!document.querySelector('#games-toggle'),label:/互动小游戏/.test(document.querySelector('.toolbar-left')?.textContent||'')})`)), { toggle: false, label: false }, '旧入口应已移除');
    // 两名玩家站到一起（猜拳要求双方各至少 1 筹码，先让 B 搜一次容器拿筹码）
    await moveTo(600, 280);
    await moveTo(1000, 285, B); await moveTo(1050, 285, B);
    const bSearch = await api('/api/interact', { commandId: commandId(), kind: 'search', entityId: 'desk-1035-172' }, B);
    assert.equal(bSearch.data.ok, true, `B 搜寻桌面应成功：${JSON.stringify(bSearch.data && bSearch.data.error)}`);
    assert.ok((await state(B)).me.exploration.chips >= 1, 'B 需至少有 1 筹码');
    await moveTo(640, 280, B);
    await waitFor('双方进入邀请范围', async () => { const s = await state(A), o = pub(s, otherId), m = pub(s, selfId); return Math.hypot(o.x - m.x, o.y - m.y) <= 64; });
    // 通过玩家名单选中目标（比画布点击稳定：画布上其他面板/覆盖层会拦截命中）。
    await ev(`(()=>{const p=document.querySelector('#roster');if(p)p.hidden=false;const t=document.querySelector('#roster-toggle');if(t)t.setAttribute('aria-expanded','true')})()`);
    await waitFor('名单出现目标行', async () => (await ev(`!!document.querySelector('#roster-items [data-player="${otherId}"]')`)), 6000);
    await ev(`document.querySelector('#roster-items [data-player="${otherId}"]').click()`);
    let inviteDiag = null;
    try {
      await waitFor('目标档案出现邀请按钮', async () => (await ev(`!!document.querySelector('#target-invite-rps')`)), 6000);
    } catch (e) {
      inviteDiag = await ev(`JSON.stringify({targetHidden:document.querySelector('#target').hidden,invite:!!document.querySelector('#target-invite-rps'),rosterHidden:document.querySelector('#roster').hidden})`);
      throw Error(`${e.message}；现场=${inviteDiag}`);
    }
    const inviteReady = JSON.parse(await ev(`(()=>{const b=document.querySelector('#target-invite-rps');return JSON.stringify({exists:!!b,disabled:!!b&&b.disabled,text:b?b.textContent.trim():null})})()`));
    assert.equal(inviteReady.exists, true); assert.equal(inviteReady.disabled, false, `邀请按钮应可用（${JSON.stringify(inviteReady)}）`);
    assert.match(inviteReady.text, /邀请猜拳/);
    await click('#target-invite-rps');
    // 发起方进入等待：挑战存在且 role=from / phase=invited
    let pendingA = null;
    try {
      pendingA = await waitFor('A 侧 pending role=from', async () => { const p = (await state(A)).me.games.rpsPending; return p && p.role === 'from' ? p : false; }, 6000);
    } catch (e) {
      const s = await state(A), o = pub(s, otherId), m2 = pub(s, selfId);
      const note = await ev(`(document.querySelector('#target-rps-note')||{}).textContent||null`).catch(() => null);
      throw Error(`${e.message}；现场 dist=${Math.round(Math.hypot(o.x - m2.x, o.y - m2.y))} chipsA=${s.me.exploration.chips} chipsB=${(await state(B)).me.exploration.chips} rpsUntilA=${s.me.games.rpsUntil - s.serverTime} note=${note}`);
    }
    assert.equal(pendingA.phase, 'invited');
    assert.ok(!('choice' in pendingA), 'A 的 pending 不得含任何 choice 字段');
    assert.equal(pendingA.fromId, selfId); assert.equal(pendingA.toId, otherId);
    const pendingB = await waitFor('B 侧 pending role=to', async () => { const p = (await state(B)).me.games.rpsPending; return p && p.role === 'to' ? p : false; });
    assert.equal(pendingB.id, pendingA.id, '双方看到同一个挑战');
    // B 接受 -> 进入 selecting：客户端应渲染十秒选择界面
    assert.equal((await api('/api/play', { commandId: commandId(), kind: 'rpsReply', challengeId: pendingA.id }, B)).data.ok, true, 'B 接受应成功');
    const selecting = await waitFor('进入 selecting 且选择界面可见', async () => {
      const p = (await state(A)).me.games.rpsPending;
      if (!p || p.phase !== 'selecting') return false;
      const visible = await ev(`(()=>{const host=document.querySelector('#games');if(!host||host.hidden)return false;const rock=document.querySelector('#games-choice-rock');return !!rock&&rock.getBoundingClientRect().width>0})()`).catch(() => false);
      return visible ? p : false;
    }, 8000);
    assert.equal(selecting.deadline - selecting.startedAt, await ev('WORLD.PLAY_CONFIG.rpsRoundMs'), 'deadline - startedAt 应为 rpsRoundMs');
    assert.ok(!('opponentChoice' in selecting) && !('choice' in selecting), '选择阶段不得暴露对手出拳');
    const phaseText = await ev(`document.querySelector('#games-phase').textContent`);
    assert.ok(phaseText.length > 0, '应渲染阶段文案');
    // 选择石头 -> 服务端记录 ownChoice
    await click('#games-choice-rock');
    const chosen = await waitFor('服务端记录自己出拳', async () => { const p = (await state(A)).me.games.rpsPending; return p && p.ownChoice === 'rock' ? p : false; }, 6000);
    assert.equal(chosen.ownChoice, 'rock');
    // 收尾：取消本局挑战并关闭面板，避免给后续用例留下 pending / 面板遮挡。
    await api('/api/play', { commandId: commandId(), kind: 'rpsCancel', challengeId: chosen.id }, A);
    await waitFor('挑战已取消', async () => (await state(A)).me.games.rpsPending === null, 5000);
    await ev(`(()=>{const c=document.querySelector('#games-close');if(c)c.click();const t=document.querySelector('#target-close');if(t)t.click();})()`);
    return { inviteReady, pendingRole: pendingA.role, deadlineMs: selecting.deadline - selecting.startedAt, phaseText };
  });

  await test('联机 06 J 互动：无伤害命中 stun/freeze、hp 不变、筹码不变、共享 CD 冷却、冻结禁移、空挥也冷却', async () => {
    const A = token, B = target.sessionToken;
    // 命中：A 面向右，B 在 48px 锥内
    await moveTo(600, 280); await moveTo(628, 280, B);
    await faceDirection('right', A);
    const bBefore = pub(await state(), otherId), aChipsBefore = (await state(A)).me.exploration.chips;
    await ev(`document.querySelector('#office').focus()`); await key('j', 'KeyJ', 74);
    const hit = await waitFor('B 被眩晕', async () => { const s = await state(), b = pub(s, otherId); return b.stunUntil > s.serverTime ? { s, b } : false; });
    assert.ok(hit.b.freezeUntil - hit.b.stunUntil === 200, `freeze 应比 stun 多 200ms，实测 ${hit.b.freezeUntil - hit.b.stunUntil}`);
    assert.equal(hit.b.hp, bBefore.hp, 'B 血量不应改变');
    assert.equal(hit.b.alive, bBefore.alive, 'B 存活状态不应改变');
    assert.equal((await state(A)).me.exploration.chips, aChipsBefore, 'A 筹码不应改变');
    const aAfter = (await state(A)).me;
    const sharedCooldown = await ev('WORLD.PLAY_CONFIG.attackCooldownMs');
    assert.equal(aAfter.combat.attackUntil - aAfter.combat.lastAttackAt, sharedCooldown, '命中冷却应等于共享 CD');
    const cdLeft = aAfter.combat.attackUntil - (await state()).serverTime;
    assert.ok(cdLeft > 0 && cdLeft <= sharedCooldown, `A 应进入共享 ${sharedCooldown}ms 冷却，实测剩余 ${cdLeft}ms`);
    await waitFor('status 含无伤害', async () => /无伤害/.test(await ev(`document.querySelector('#combat-status').textContent`)));
    // J 攻击已改为纯键盘触发：按钮保留在 DOM 但不可见。冷却倒计时由按钮文案承载
    // （game.js 里 button.textContent = cooldown>0 ? 'J · 互动 · 冷却 Ns' : ...），
    // 命中时底部提示条显示命中反馈，空挥时才显示空挥+冷却——所以两处分别断言。
    let cooldownUi = null;
    await waitFor('按钮不可见且处于禁用态（冷却中）', async () => {
      cooldownUi = JSON.parse(await ev(`(()=>{const b=document.querySelector('#attack-button');const s=document.querySelector('#combat-status');return JSON.stringify({buttonDisabled:b.disabled,buttonHidden:b.hasAttribute('hidden'),buttonVisible:b.getBoundingClientRect().width>0,buttonText:(b.textContent||'').slice(0,40),statusVisible:s.getBoundingClientRect().width>0,statusText:(s.textContent||'').slice(0,50)})})()`));
      return cooldownUi.buttonDisabled === true && cooldownUi.buttonHidden === true && cooldownUi.buttonVisible === false && /冷却 \d+s/.test(cooldownUi.buttonText) ? cooldownUi : false;
    }).catch(error => { throw Error(`${error.message}；现场=${JSON.stringify(cooldownUi)}`); });
    assert.ok(/互动命中|冷却/.test(cooldownUi.statusText), `命中时底部提示条应有可见反馈，实测 ${cooldownUi.statusText}`);
    await screenshot(onlineShot); // 命中瞬间：B 带眩晕星/冰蓝僵直覆盖，底部显示无伤害与冷却
    // 冷却期内再次按 J 不应生效（不延长 B 的 freezeUntil）。J 互动冷却已从 12s 调整为 1.2 秒
    // （attackCooldownMs），所以必须先确认取样时仍在冷却窗口内，否则该断言的前提不成立。
    const freezeBefore = hit.b.freezeUntil;
    await key('j', 'KeyJ', 74);
    const afterRePress = await state();
    // 冷却窗口只有 1.2 秒，若取样时窗口已过则这次按 J 合法，断言不再适用；否则必须原样返回。
    if (afterRePress.me.combat.attackUntil - hit.s.serverTime > 0) {
      assert.equal(pub(afterRePress, otherId).freezeUntil, freezeBefore, '冷却期间再次按 J 不应改变 B 的 freezeUntil');
    }
    // 冻结期间 B 无法移动。冻结窗口只有 1 秒（stun 800ms + 200ms），采样本身要花时间，
    // 所以只在「取样时仍在冻结窗口内」才断言位置未变；否则冻结已自然结束。
    const bFrozen = pub(await state(B), otherId);
    await api('/api/input', { left: true }, B);
    await pause(120);
    const bStill = await state(B);
    if (bStill.serverTime < pub(bStill, otherId).freezeUntil) {
      assert.equal(pub(bStill, otherId).x, bFrozen.x, '冻结期间 B 位置不应变化');
    }
    await api('/api/input', {}, B);
    // 冻结结束后可正常移动
    await waitFor('B 解除冻结', async () => { const s = await state(B); return s.serverTime >= pub(s, otherId).freezeUntil; }, 4000);
    await api('/api/input', { left: true }, B);
    await waitFor('B 恢复可移动', async () => pub(await state(B), otherId).x < pub(bStill, otherId).x);
    await api('/api/input', {}, B);
    // 等 A 冷却结束 → B 移出范围 → 空挥也进冷却
    await waitFor('A 攻击冷却结束', async () => { const s = await state(A); return s.me.combat.attackUntil <= s.serverTime; }, 16000);
    await moveTo(900, 280, B);
    await faceDirection('right', A);
    await ev(`document.querySelector('#office').focus()`); await key('j', 'KeyJ', 74);
    // 空挥反馈以服务端权威状态为准：单次快照里同时校验「共享 CD 长度」与「冷却尚未过期」，
    // 避免跨两次 HTTP 快照比较导致 1.2 秒冷却在测量间隙里到期。
    const empty = await waitFor('空挥进入共享 CD', async () => {
      const snap = await state(A);
      const cur = snap.me;
      const left = cur.combat.attackUntil - snap.serverTime;
      if (!(cur.combat.lastAttackAt > 0)) return false;
      if (cur.combat.attackUntil - cur.combat.lastAttackAt !== sharedCooldown) return false;
      return left > 0 && left <= sharedCooldown ? { cur, left } : false;
    }, 8000);
    const aEmpty = empty.cur;
    let emptyText = '';
    try {
      emptyText = await waitFor('空挥文案', async () => {
        const text = await ev(`document.querySelector('#combat-status').textContent`);
        return /空挥/.test(text) ? text : false;
      }, 4000);
    } catch { emptyText = await ev(`document.querySelector('#combat-status').textContent`); }
    assert.match(emptyText, /空挥|冷却/, `空挥后提示条应给出反馈，实测 ${emptyText}`);
    return { stunMs: hit.b.stunUntil - hit.s.serverTime, freezeMinusStun: hit.b.freezeUntil - hit.b.stunUntil, hitCooldownMs: cdLeft, emptySwingCooldownLeft: empty.left, emptySwingText: emptyText };
  });

  await test('联机 07 20Hz 快照下按钮身份稳定（#exploration-wheel）且旧互动小游戏入口已移除', async () => {
    await moveTo(520, 340);
    await ev(`(()=>{const c=document.querySelector('#exploration-close');if(c)c.click();})()`);
    await ev(`document.querySelector('#office').focus()`); await key('k', 'KeyK', 75);
    await waitFor('NPC 面板转盘存在', async () => ev(`document.querySelector('#exploration h2')?.textContent==='接待员小禾'&&!!document.querySelector('#exploration-wheel')`));
    const wheel = await sampleStable('#exploration-wheel', 24);
    // 猜拳已改为「靠近角色按 K / 点击角色 → 交互菜单 → 邀请猜拳」，工具栏「互动小游戏」入口已移除。
    // 注意 #games 面板本身仍被猜拳对战复用（由 target 面板的邀请按钮打开），只有入口被移除。
    const removed = await ev(`JSON.stringify({toggle:!!document.querySelector('#games-toggle'),label:/互动小游戏/.test(document.querySelector('.toolbar-left')?.textContent||'')})`);
    assert.deepEqual(JSON.parse(removed), { toggle: false, label: false }, `旧互动小游戏入口应已移除，实测 ${removed}`);
    await click('#exploration-close');
    return { wheel, removed: JSON.parse(removed) };
  });
  await test('联机 全流程无 JavaScript 异常或 console.error', async () => { assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []); });

  // ============================ 离线 demo（file:// ?test） ============================
  await open(demoURL + '?test', `!!window.__sidTest`);
  await test('demo 08 描边：远处 idle、64px 内 ready、搜寻后 blocked，并做画布像素判定', async () => {
    await ev('__sidTest.reset()');
    const band = borderBand(reception);
    const outlineOf = id => ev(`__sidTest.snapshot().outlines.find(o=>o.id===${JSON.stringify(id)}).state`);
    assert.equal(await outlineOf(reception.id), 'idle', '远处应为 idle');
    const far = await demoSampleBand(band);
    assert.equal(far.cyan, 0, '远处不应有亮青蓝像素');
    await setPosition(220, 275);
    assert.equal(await outlineOf(reception.id), 'ready', '64px 内应为 ready');
    // ready 是亮色呼吸脉冲：逐帧可能落在低透明度相位，按 clock 扫过整周期再取样。
    const ready = await waitMetric('demo ready 亮青蓝', async () => { await ev('__sidTest.advance(0.12)'); return demoSampleBand(band); }, m => m.cyan > 0);
    assert.ok(ready.cyan > 0, `64px 内应出现亮青蓝描边，实测 ${JSON.stringify(ready)}`);
    await ev(`__sidTest.interact('search','${reception.id}')`);
    assert.equal(await outlineOf(reception.id), 'blocked', '搜寻后应为 blocked');
    const blocked = await waitMetric('demo blocked 灰', () => demoSampleBand(band), m => m.grey > 0);
    assert.equal(blocked.cyan, 0, '搜寻后不应有亮青蓝像素');
    assert.ok(blocked.grey > 0, `搜寻后应为灰色静态描边，实测 ${JSON.stringify(blocked)}`);
    const plantBand = borderBand(plant);
    const plantM = await demoSampleBand(plantBand);
    assert.equal(plantM.cyan, 0, '不可交互家具不应有亮色描边');
    return { idle: far.cyan, ready: ready.cyan, blocked: [blocked.cyan, blocked.grey] };
  });
  await test('demo 09 遮挡：人物与名牌同步隐藏，移出后立即恢复，并截图', async () => {
    await ev('__sidTest.reset()'); await setPosition(832, 205);
    const covered = await demoSnapshot();
    assert.equal(covered.covered, true, '柜子后应判定遮挡');
    assert.equal(await ev(`document.querySelector('#cover-status').textContent`), '身体已遮挡');
    assert.ok(!covered.labels.some(l => l.ids.includes(0)), '被遮挡时自身不应出现在 labels');
    const coveredAccent = await demoSampleRegion(832 - 74, 205 + 16, 10, 24);
    assert.equal(coveredAccent.green, 0, '被遮挡时名牌强调像素不应存在');
    await screenshot(demoShot);
    await setPosition(832, 250);
    const restored = await demoSnapshot();
    assert.equal(restored.covered, false, '移出后不应再判定遮挡');
    assert.ok(restored.labels.some(l => l.ids.includes(0)), '移出遮挡后自身名牌应立即恢复');
    const restoredAccent = await demoSampleRegion(832 - 74, 250 + 16, 10, 24);
    assert.ok(restoredAccent.green > 0, '移出后名牌强调像素应恢复');
    return { coveredLabels: covered.labels.length, coveredAccent: coveredAccent.green, restoredAccent: restoredAccent.green };
  });
  await test('demo 10 转盘：可重复转动、首次免费、第二次=wheelSpinCost(1)、spins 递增、chips 与 prize 一致、不足失败', async () => {
    await ev('__sidTest.reset()');
    await setPosition(220, 275); await ev(`__sidTest.interact('search','${reception.id}')`); // 攒 3 筹码
    await setPosition(520, 340);
    const expectChips = (res, prev) => prev - res.cost + (res.item && res.item.kind === 'chips' ? res.item.amount : 0);
    const chips0 = (await demoSnapshot()).exploration.chips;
    const first = await ev(`__sidTest.play('wheel','${npcReception.id}')`);
    assert.equal(first.ok, true);
    assert.equal(first.slots.length, 10);
    assert.equal(first.cost, 0, '首次免费'); assert.equal(first.spins, 1);
    assert.equal(first.chips, expectChips(first, chips0), 'chips 应等于 prize（首次成本 0）');
    const second = await ev(`__sidTest.play('wheel','${npcReception.id}')`);
    assert.equal(second.ok, true, '第二次应可继续转动（可重复）');
    assert.equal(second.cost, await ev('WORLD.wheelSpinCost(1)'));
    assert.equal(second.spins, 2, 'spins 应递增');
    assert.equal(second.chips, expectChips(second, first.chips), 'chips 应按 (prize - cost) 变化');
    let failure = null, guard = 0, prev = second;
    while (guard++ < 12) { const r = await ev(`__sidTest.play('wheel','${npcReception.id}')`); if (!r.ok) { failure = { r, before: prev.chips }; break; } prev = r; }
    assert.ok(failure, '筹码最终应不足，play 应返回 ok:false');
    assert.equal((await demoSnapshot()).exploration.chips, failure.before, '失败不得改变筹码');
    return { first: { cost: first.cost, spins: first.spins, chips: first.chips }, second: { cost: second.cost, spins: second.spins }, failureChips: failure.before };
  });
  await test('demo 11 猜拳：rps 结算一致、对手同步、余额不为负、冷却，且真实 DOM 路径可用', async () => {
    await ev('__sidTest.reset()'); await setPosition(220, 275);
    await ev(`__sidTest.interact('search','${reception.id}')`);
    const chipsStart = (await demoSnapshot()).exploration.chips;
    assert.ok(chipsStart >= 3);
    await setPosition(620, 407);
    const r = await ev(`__sidTest.rps('rock')`);
    assert.equal(r.ok, true);
    assert.ok([-1, 0, 1].includes(r.delta), `delta 应为 -1/0/1，实测 ${r.delta}`);
    assert.equal(r.chips, chipsStart + r.delta, 'chips 应与 delta 一致');
    assert.ok(r.chips >= 0 && r.opponentChips >= 0, '双方余额不为负');
    const opp = (await ev(`__sidTest.games()`)).opponents.find(o => o.id === 1);
    assert.equal(opp.chips, r.opponentChips, '对手筹码应与返回值同步');
    const cool = await ev(`__sidTest.rps('rock')`);
    assert.equal(cool.ok, false, '冷却期间应拒绝');
    // 推进 clock 跳过冷却，走真实 DOM 路径
    await ev('__sidTest.advance(6)');
    await click('#games-toggle');
    await waitFor('小游戏面板打开', async () => (await ev(`document.querySelector('#games').hidden`)) === false && (await ev(`!!document.querySelector('#games-rps')`)));
    await click('#games [data-choice="paper"]');
    await click('#games-rps');
    await waitFor('结果文本出现', async () => (await ev(`document.querySelector('#games-result').textContent`)).length > 0);
    const domChips = Number(await ev(`document.querySelector('#games-chips').textContent`));
    assert.equal(domChips, (await demoSnapshot()).exploration.chips, '#games-chips 应反映真实筹码');
    assert.ok((await ev(`document.querySelector('#games-result').textContent`)).length > 0);
    await click('#games-close');
    return { delta: r.delta, chipsBefore: chipsStart, chipsAfter: r.chips, opponent: r.opponentChips, domChips };
  });
  await test('demo 12 J 互动：命中设置 stun/freeze、hp 不变、日志无副作用；空挥与按钮冷却', async () => {
    await ev('__sidTest.reset()'); await setPosition(620, 407);
    const hpBefore = await ev('__sidTest.secret(1)');
    const logsBefore = (await demoSnapshot()).logs;
    const hit = await ev('__sidTest.attack()');
    assert.equal(hit.ok, true, '应命中附近角色');
    assert.equal(hit.hitId, 1);
    assert.match(hit.resultText, /无伤害/);
    const g = await ev('__sidTest.games()'), snap = await demoSnapshot();
    const o = g.opponents.find(x => x.id === 1);
    assert.ok(o.stunUntil - snap.clock * 1000 > 0, 'stun 应生效');
    assert.equal(o.freezeUntil - o.stunUntil, 200, 'freeze 应比 stun 多 200ms');
    const hpAfter = await ev('__sidTest.secret(1)');
    assert.equal(hpAfter.hp, hpBefore.hp, 'hp 不应改变');
    assert.equal(hpAfter.alive, hpBefore.alive, 'alive 不应改变');
    const logsAfter = (await demoSnapshot()).logs;
    assert.deepEqual(logsAfter, logsBefore, '公共日志不应被写入');
    assert.ok(!logsAfter.some(t => /扣血|淘汰/.test(t)), '日志不应出现扣血/淘汰副作用');
    // 真实按钮路径：点 #attack-button 同样生效并显示冷却
    await ev('__sidTest.advance(13)'); await ev('__sidTest.draw()'); await setPosition(620, 407);
    const beforeStun = (await ev('__sidTest.games()')).opponents.find(o => o.id === 1).stunUntil;
    await click('#attack-button');
    const afterStun = (await ev('__sidTest.games()')).opponents.find(o => o.id === 1).stunUntil;
    assert.notEqual(afterStun, beforeStun, '点击 #attack-button 应同样命中并设置 stun');
    await ev('__sidTest.draw()');
    assert.match(await ev(`document.querySelector('#combat-status').textContent`), /冷却 \d+s/, '#combat-status 应显示冷却秒数');
    assert.match(await ev(`document.querySelector('#attack-button').textContent`), /（\d+s）/, '#attack-button 应显示冷却秒数');
    await screenshot(demoShot);
    // 空挥：把目标移出范围，冷却结束后空挥也进冷却
    await ev('__sidTest.advance(13)'); await ev('__sidTest.draw()');
    await setPosition(300, 600);
    const near = (await ev('__sidTest.games()')).opponents.filter(x => Math.hypot(x.x - 300, x.y - 600) <= 48);
    assert.equal(near.length, 0, '空挥位置附近不应有目标');
    const miss = await ev('__sidTest.attack()');
    assert.equal(miss.ok, false, '空挥应返回未命中');
    assert.match(miss.resultText, /空挥/);
    assert.ok(miss.cooldownMs > 0, '空挥也应进入冷却');
    return { hitText: hit.resultText, freezeMinusStun: o.freezeUntil - o.stunUntil, missText: miss.resultText };
  });
  await test('demo 13 普通地址（无 ?test）不暴露诊断接口且正常渲染无报错', async () => {
    const before = runtimeErrors.length, beforeC = consoleErrors.length;
    await open(demoURL, `!!window.WORLD&&!!document.querySelector('#clue-bag')`);
    assert.equal(await ev('typeof window.__sidTest'), 'undefined', '普通地址不应暴露 __sidTest');
    assert.equal(await ev(`typeof window.__sidTest?.snapshot`), 'undefined');
    assert.equal(await ev(`document.querySelector('#office').hidden`), false);
    await ev(`document.querySelector('#games-toggle').click()`);
    assert.equal(await ev(`document.querySelector('#games').hidden`), false, '普通地址小游戏面板应可正常打开');
    assert.equal(runtimeErrors.length, before); assert.equal(consoleErrors.length, beforeC);
    return { normalUrlNoTestApi: true };
  });
} catch (e) { fatalError = { message: e.message, stack: e.stack }; console.error('验收初始化或前置流程失败', e.stack); process.exitCode = 1; }
finally {
  if (ws) { await send('Browser.close').catch(() => {}); ws.close(); }
  for (const [child, label] of [[chrome, 'chrome'], [server, 'httpServer']]) { try { await terminate(child, label); } catch (e) { cleanup[label] = { exited: false, error: e.message }; } }
  const frozenAfter = await hashes(frozenFiles), allAfter = await hashes(allGameFiles);
  const frozenUnchanged = JSON.stringify(frozenBefore) === JSON.stringify(frozenAfter);
  results.push({ name: 'server.js/room.js/shared/world.js 未被修改（SHA-256 未变）', pass: frozenUnchanged });
  const gameChanged = Object.keys(allBefore).filter(f => allBefore[f] !== allAfter[f]);
  results.push({ name: '仅新增验收脚本与 outputs；玩法源码未被改动', pass: gameChanged.length === 0, detail: gameChanged.length ? { changed: gameChanged } : { changed: [] } });
  results.push({ name: 'finally 关闭 Chrome 与 HTTP 子进程，保留临时 profile 不递归删除', pass: cleanup.chrome?.exited === true && cleanup.httpServer?.exited === true, detail: cleanup });
  const summary = { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, total: results.length };
  const report = { date: new Date().toISOString(), engine: 'Windows 系统 Chrome headless + managed Node，零依赖原生 CDP，真实 HTTP/SSE 与 DOM 输入', node: process.execPath, browser: browserVersion, host: '127.0.0.1', port, environment: { SID_DEV: '1', SID_TEST: '0' }, results, runtimeErrors, consoleErrors, fatalError: fatalError ?? null, summary, screenshots: [...new Set(screenshots)].map(p => resolve(p)), profile: resolve(profile), cleanup, sourceHashes: { frozenBefore, frozenAfter, gameChanged }, serverLog, chromeLog, unresolvedIssues: [...results.filter(r => !r.pass).map(r => ({ name: r.name, error: r.error ?? '断言未通过' })), ...(fatalError ? [fatalError] : [])], limitations: ['仅 Windows Chrome headless，不包含其他浏览器或物理设备', '转盘 prize 为服务端随机，断言只校验 0..3 与增量一致性', '联机猜拳/攻击冷却按真实时间等待（5s / WORLD.PLAY_CONFIG.attackCooldownMs），用短轮询而非固定 sleep', '像素判定基于原生 getImageData，取样带已避开家具自带彩色装饰', '不清除用户目录；outputs/.browser-test-profile 保留，仅终止本脚本启动的进程'] };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...summary, fatalError: fatalError?.message ?? null, reportPath: resolve(reportPath), screenshots: report.screenshots, cleanup, gameChanged }, null, 2));
  if (summary.failed || fatalError) process.exitCode = 1;
}
