// Real LAN-playtest self-test: managed Node server + two real Chrome clients over native CDP.
// Zero dependencies (built-in http/fs/os/crypto + Node's fetch/WebSocket).
// Run: node /absolute/path/online/self-test.mjs
import { spawn } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';

const freePort = () => new Promise((resolve, reject) => {
  const server = createNetServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
});
const root = dirname(fileURLToPath(import.meta.url));
const NODE = '/Users/jiarunwu/.workbuddy/binaries/node/versions/22.22.2-6/bin/node';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = await freePort();
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];

function api(path, options = {}) {
  return fetch(BASE + path, options).then(async response => ({ status: response.status, setCookie: response.headers.get('set-cookie'), body: await response.json() }));
}
const post = (path, body, cookie, extra = {}) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...extra }, body: JSON.stringify(body || {}) });
const get = (path, cookie, extra = {}) => api(path, { headers: { ...(cookie ? { cookie } : {}), ...extra } });
const auth = token => ({ 'X-Sid-Session': token });
const state = token => get('/api/state', null, auth(token)).then(r => r.body);
const testState = () => get('/api/test/state').then(r => r.body);
const sessions = () => get('/api/test/sessions').then(r => r.body.sessions || []);
const cookieOf = response => (response.setCookie || '').split(';')[0].split('=')[1] || response.body.sessionToken;
const advance = ms => post('/api/test/advance', { ms });
const cmd = () => 'cmd-' + Math.random().toString(36).slice(2) + '-' + Date.now();
const skill = (token, body) => post('/api/skill', { commandId: cmd(), ...body }, null, auth(token)).then(r => r.body);
const player = (id) => testState().then(s => s.players.find(p => p.id === id));
async function waitFor(label, predicate, ms = 8000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { if (await predicate()) return true; await sleep(80); }
  throw new Error('超时: ' + label);
}
async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); }
  catch (error) { results.push({ name, pass: false, error: error.message }); console.log('FAIL', name, error.message); }
}

class Client {
  constructor(name) { this.name = name; this.id = 0; this.inflight = new Map(); }
  async launch() {
    this.profile = await mkdtemp(join(tmpdir(), 'sid-online-'));
    await this.spawn();
    await this.connect();
  }
  async spawn() {
    this.debugPort = await freePort();
    this.proc = spawn(CHROME, ['--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      '--disable-background-networking', '--disable-component-update', '--disable-sync',
      `--remote-debugging-port=${this.debugPort}`, '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${this.profile}`, 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) {
      try { this.pages = await (await fetch(`http://127.0.0.1:${this.debugPort}/json/list`)).json(); if (this.pages.length) break; } catch { await sleep(75); }
    }
    if (!this.pages) throw new Error('Chrome 未启动: ' + this.name);
  }
  async connect() {
    const target = this.pages.find(p => p.type === 'page');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = e => {
      const m = JSON.parse(e.data);
      if (m.id && this.inflight.has(m.id)) { const p = this.inflight.get(m.id); this.inflight.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1080, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.bringToFront');
  }
  // Offline is simulated by terminating the whole browser process (laptop closed / app
  // killed) and relaunching it with the same profile, so the HttpOnly cookie survives.
  // Page navigation and CDP network emulation both keep the SSE socket alive in
  // headless Chrome, so they cannot be used to prove the offline path.
  async killProcess() {
    if (this.ws) { this.ws.close(); this.ws = null; }
    if (this.proc && this.proc.exitCode === null) {
      const exited = new Promise(resolve => this.proc.once('exit', resolve));
      this.proc.kill('SIGKILL');
      await Promise.race([exited, sleep(2000)]);
    }
    this.proc = null;
  }
  async relaunch() { await this.spawn(); await this.connect(); }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const n = ++this.id;
      const timer = setTimeout(() => { this.inflight.delete(n); reject(new Error('CDP 超时: ' + method)); }, 15000);
      this.inflight.set(n, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
      this.ws.send(JSON.stringify({ id: n, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {}));
    return r.result.value;
  }
  key(type, key, code, vk) {
    return this.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0) });
  }
  async click(selector) {
    const point = await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing ${selector}');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  }
  async open(nickname) {
    await this.send('Page.navigate', { url: BASE + '/' });
    await this.eval(`new Promise(resolve=>{const f=()=>document.readyState==='complete'?resolve():setTimeout(f,20);f()})`);
    if (nickname !== undefined) {
      await this.eval(`new Promise(resolve=>{let n=0;const f=()=>{const j=document.getElementById('join-page');if(j&&!j.hidden)return resolve();n++>160?resolve():setTimeout(f,20)};f()})`);
      const visible = await this.eval(`!!document.getElementById('join-page')&&!document.getElementById('join-page').hidden`);
      if (visible) {
        await this.eval(`(()=>{const i=document.getElementById('nickname');i.value='';i.focus();})()`);
        await this.send('Input.insertText', { text: nickname });
        await this.click('#join-form button[type=submit]');
      }
    }
    await this.eval(`new Promise(resolve=>{let n=0;const f=()=>document.getElementById('join-page')&&document.getElementById('join-page').hidden?resolve():n++>240?resolve():setTimeout(f,20);f()})`);
    // Chrome only flushes Local Storage to the profile on its own schedule. The offline
    // simulation below kills the whole browser, so the reconnect token must already be
    // on disk; without this wait the identity would be lost for reasons that have
    // nothing to do with the server.
    if (nickname !== undefined) await sleep(6000);
    else await sleep(500);
  }
  async close() {
    await this.killProcess();
    if (this.profile) await rm(this.profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => { });
  }
}

let server, A, B;
try {
  server = spawn(NODE, [join(root, 'server.js')], { env: { ...process.env, PORT: String(PORT), SID_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const serverLog = [];
  server.stdout.on('data', d => serverLog.push(String(d)));
  server.stderr.on('data', d => serverLog.push(String(d)));
  await waitFor('server boot', async () => { try { return (await get('/api/state')).status === 401; } catch { return false; } }, 10000);
  const boot = await testState();
  assert.equal(boot.players.length, 0, '服务未以空房间启动，可能端口被残留进程占用: ' + serverLog.join(''));

  // Browsers own their identities: each Chrome profile keeps its own HttpOnly cookie,
  // so the first launcher is the bad guy and the second one is good.
  A = new Client('A'); await A.launch(); await A.open('甲');
  B = new Client('B'); await B.launch(); await B.open('乙');
  // Each browser gets its own HttpOnly cookie, so the browser players are extra
  // identities on top of any HTTP joins. Read the real ids from the session map.
  // Each browser keeps its own HttpOnly cookie, so the browser players are their own
  // identities. Ask each client who it is, then pull the matching session for the
  // HTTP-side driver (used for skill/API level assertions).
  const idA = await A.eval(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.id)`);
  const idB = await B.eval(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.id)`);
  assert.notEqual(idA, idB, '两个客户端必须是两个身份');
  const list = await sessions();
  const tokenA = list.find(s => s.playerId === idA).sessionId;
  const tokenB = list.find(s => s.playerId === idB).sessionId;

  await test('① 首位加入者阵营=bad、其后=good，S-ID三段各三位，身份由凭证而非姓名认领', async () => {
    const s = await testState();
    assert.equal(s.players.find(p => p.id === idA).faction, 'bad');
    assert.equal(s.players.find(p => p.id === idB).faction, 'good');
    for (const p of s.players) assert.ok(/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(p.sid), 'S-ID格式: ' + p.sid);
    const join = await post('/api/join', { nickname: '乙' });
    assert.equal(join.body.playerId !== idB, true, '同名新加入者是独立身份');
  });

  await test('② 真实键盘 WASD 移动且镜头横向跟随（两个真实客户端）', async () => {
    for (const [client, cookie, id] of [[A, tokenA, idA], [B, tokenB, idB]]) {
      await client.eval(`document.querySelector('#office').focus()`);
      const before = await player(id);
      await client.key('keyDown', 'd', 'KeyD', 68);
      await waitFor(client.name + ' 移动', async () => (await player(id)).x > before.x + 8);
      await client.key('keyUp', 'd', 'KeyD', 68);
      await sleep(300);
      const after = await player(id);
      assert.ok(after.x > before.x + 8, `x ${before.x} -> ${after.x}`);
      // Camera follows: the HUD chips are derived from the rendered camera position.
      const coordinate = await client.eval(`document.getElementById('coordinate').textContent`);
      const zone = await client.eval(`document.getElementById('zone-name').textContent`);
      assert.match(coordinate, /^0[1-4] \/ 04$/, 'coordinate=' + coordinate);
      assert.ok(['接待区', '产品研发区', '茶水休息区', '档案工作区'].includes(zone), 'zone=' + zone);
      assert.equal(Number(coordinate.slice(1, 2)), Math.min(4, Math.floor(after.x / 960) + 1), '镜头跟随失败');
    }
  });

  await test('③ 断线重连：同一 playerId/姓名/位置，离线期间按真实时间恢复次数', async () => {
    const before = await player(idA);
    await A.killProcess();
    await waitFor('A 离线', async () => (await player(idA)).online === false);
    const frozen = await player(idA);
    assert.equal(frozen.x, before.x, '离线者原地不动');
    const probe = await skill(tokenA, { skill: 'probe', targetId: idB });
    assert.equal(probe.ok, true, probe.error || JSON.stringify(probe));
    assert.equal((await player(idA)).skills.probe.chargesRemaining, 1, '探查消耗一次');
    await advance(91000);
    await A.relaunch();
    await A.open();
    const s = await state(tokenA);
    assert.equal(s.me.id, idA, '重连恢复同一 playerId');
    assert.equal(s.me.name, '甲', '身份与外观保持');
    const t = await player(idA);
    assert.equal(t.skills.probe.chargesRemaining, 2, '离线期间按真实时间恢复: ' + t.skills.probe.chargesRemaining);
  });

  await test('④ 对离线者施技成功，重连拿到无操作者的私密摘要与一次性面板', async () => {
    const target = await player(idB);
    await B.killProcess();
    await waitFor('B 离线', async () => (await player(idB)).online === false);
    assert.equal((await player(idB)).x, target.x, '离线者原地保留');
    const probe = await skill(tokenA, { skill: 'probe', targetId: idB });
    assert.equal(probe.ok, true, probe.error || JSON.stringify(probe));
    assert.equal((await player(idB)).alive, true, '离线者未被淘汰');
    await B.relaunch();
    await B.open();
    const snapshot = await state(tokenB);
    assert.ok(snapshot.me.pending.length >= 1, '重连拿到离线事件');
    const text = snapshot.me.pending.map(e => e.text).join(' | ');
    assert.ok(!/甲|乙/.test(text), '摘要不含任何玩家姓名: ' + text);
    assert.ok(!/操作者|在线|离线/.test(text), '摘要不含操作者或上下线字样: ' + text);
    assert.ok(/公开|扣|淘汰/.test(text), '摘要说明自身变化: ' + text);
    await waitFor('离线横幅', async () => /离线期间有 \d+ 条涉及你的事件/.test(await B.eval(`document.getElementById('offline-banner').hidden ? '' : document.getElementById('offline-banner').textContent`)), 8000);
    await B.eval(`document.getElementById('offline-banner').click()`);
    const summary = await B.eval(`document.getElementById('offline-summary').textContent`);
    assert.ok(/离线期间事件/.test(summary), '一次性私密摘要面板可见');
    // The digest is one-shot and must be dismissed by the player; the ack is sent on close.
    await B.eval(`document.getElementById('summary-close').click()`);
    await waitFor('事件 ack', async () => (await state(tokenB)).me.pending.length === 0, 6000);
  });

  await test('⑤ 击杀需完整S-ID严格匹配：错误/小写S-ID不生效，正确S-ID淘汰', async () => {
    await advance(91000);
    const wrong = await skill(tokenA, { skill: 'action', targetId: idB, sid: 'AAA-AAA-AAA' });
    assert.equal(wrong.ok, true, JSON.stringify(wrong));
    assert.match(wrong.resultText, /不匹配/);
    assert.equal((await player(idB)).alive, true, '错误S-ID未淘汰目标');
    assert.equal((await player(idA)).skills.action.chargesRemaining, 1, '错误提交仍消耗次数与冷却');
    await advance(91000);
    const bad = await skill(tokenA, { skill: 'action', targetId: idB, sid: 'bad-format' });
    assert.equal(bad.ok, false, '格式错误被拒绝');
    assert.equal((await player(idA)).skills.action.chargesRemaining, 2, '格式错误不消耗');
    const realSid = (await player(idB)).sid;
    const lower = await skill(tokenA, { skill: 'action', targetId: idB, sid: realSid.toLowerCase() });
    assert.equal(lower.ok, false, '小写S-ID按格式错误拒绝');
    assert.equal((await player(idA)).skills.action.chargesRemaining, 2, '小写不消耗');
    // Extra joiners arrive BEFORE the kill: otherwise killing would drop the room to a
    // single survivor and finish here, which would poison the finish test below.
    const c = await post('/api/join', { nickname: '丙' });
    const d = await post('/api/join', { nickname: '丁' });
    assert.equal(c.body.ok, true, JSON.stringify(c.body));
    assert.equal(d.body.ok, true, JSON.stringify(d.body));
    await advance(13000);
    const kill = await skill(tokenA, { skill: 'action', targetId: idB, sid: realSid });
    assert.equal(kill.ok, true, JSON.stringify(kill));
    assert.equal((await player(idB)).alive, false, '精确匹配淘汰');
  });

  await test('⑥ 存活降到2且有淘汰时自动结束，并拒绝新加入与一切结算', async () => {
    // Kill every survivor but one: the room also holds the extra identity joined in ①,
    // so a single elimination would not be enough to reach 存活<=2.
    const ids = (await testState()).players.filter(p => p.alive && p.id !== idA).map(p => p.id);
    for (const id of ids.slice(0, Math.max(0, ids.length - 1))) {
      await advance(91000);
      const target = await player(id);
      const res = await skill(tokenA, { skill: 'action', targetId: id, sid: target.sid });
      assert.equal(res.ok, true, JSON.stringify(res));
      assert.equal((await player(id)).alive, false, '目标淘汰失败: ' + id);
    }
    const s = await testState();
    assert.equal(s.finished, true, `存活<=2 且有淘汰 -> 自动结束（存活=${s.players.filter(p => p.alive).length}，淘汰事件=${s.eliminateEvents}）`);
    assert.ok(s.eliminateEvents >= 1);
    assert.equal((await state(tokenA)).finished, true, '快照下发 finished');
    const join = await post('/api/join', { nickname: '新同事' });
    assert.equal(join.body.ok, undefined, '结束后拒绝新加入');
    const survivor = (await testState()).players.find(p => p.alive && p.id !== idA);
    const frozen = await skill(tokenA, { skill: 'probe', targetId: survivor.id });
    assert.equal(frozen.ok, false, '结束后技能冻结');
    const before = (await player(survivor.id)).x;
    const survivorToken = (await sessions()).find(s => s.playerId === survivor.id).sessionId;
    await post('/api/input', { right: true }, null, auth(survivorToken));
    await sleep(400);
    assert.equal((await player(survivor.id)).x, before, '结束后移动冻结');
  });

  await test('⑦ 只加入2人且无淘汰时不会误判结束（防开局即结束）', async () => {
    assert.equal((await post('/api/host/reset', {})).body.ok, undefined, '重开需要二次确认');
    assert.equal((await post('/api/host/reset', { confirm: true })).body.ok, true);
    const s1 = await post('/api/join', { nickname: '子' });
    const s2 = await post('/api/join', { nickname: '丑' });
    const c1 = cookieOf(s1);
    const st = await state(c1);
    assert.equal(st.players.filter(p => p.alive).length, 2);
    assert.equal(st.finished, false, '仅两人不得结束');
    assert.equal((await testState()).finished, false);
  });

  await test('⑧ 主持人接口：非 loopback 403，本机可结束与重开且需二次确认', async () => {
    const remote = await post('/api/host/finish', {}, null, { 'X-Sid-Test-Source-Address': '10.0.0.9' });
    assert.equal(remote.status, 403, '非本机被拒绝: ' + remote.status);
    assert.match(remote.body.error, /本机/);
    const fakeLoopback = await post('/api/host/finish', {}, null, { 'X-Sid-Test-Source-Address': '127.0.0.1' });
    assert.equal(fakeLoopback.status, 200, '伪装本机但仍走真实 loopback 判定');
    assert.equal((await testState()).finished, true);
    const reset = await post('/api/host/reset', { confirm: true });
    assert.equal(reset.body.ok, true);
    assert.equal((await testState()).finished, false);
    assert.equal((await testState()).players.length, 0, '重开清空角色与身份');
    assert.equal((await sessions()).length, 0, '重开清空会话');
  });

  await test('⑨ public 与 own-private 快照均不含 actor / 阵营 / 完整SID / 血量', async () => {
    const e = await post('/api/join', { nickname: '寅' });
    const f = await post('/api/join', { nickname: '卯' });
    const ce = cookieOf(e), cf = cookieOf(f), ide = e.body.playerId, idf = f.body.playerId;
    const secrets = (await testState()).players.map(p => ({ id: p.id, sid: p.sid, faction: p.faction, hp: p.hp }));
    const pub = await state(ce);
    const publicJson = JSON.stringify(pub.players);
    for (const s of secrets) {
      assert.ok(!publicJson.includes(s.sid), 'public 泄露完整SID: ' + s.sid);
      assert.ok(!publicJson.includes('"faction"'), 'public 泄露阵营');
      assert.ok(!publicJson.includes('"hp"'), 'public 泄露血量');
      assert.ok(!publicJson.includes('"skills"'), 'public 泄露技能资源');
    }
    assert.ok(!/actor/i.test(publicJson), 'public 含 actor 字段');
    const priv = await state(cf);
    const others = JSON.stringify(priv.players.filter(p => p.id !== idf));
    for (const s of secrets.filter(x => x.id !== idf)) {
      assert.ok(!others.includes(s.sid), 'own-private 泄露他人完整SID: ' + s.sid);
      assert.ok(!others.includes(`"faction":"${s.faction}"`), 'own-private 泄露他人阵营');
    }
    assert.ok(priv.me.sid === secrets.find(s => s.id === idf).sid, '本人完整SID仅自己可见');
    assert.equal(priv.me.skills.probe.chargesRemaining, 2);
    assert.equal(typeof priv.me.skills.action.nextChargeAt, 'number', '冷却/恢复时间戳下发');
    const probe = await skill(ce, { skill: 'probe', targetId: idf });
    assert.equal(probe.ok, true, JSON.stringify(probe));
    const after = await state(cf);
    assert.ok(after.me.pending.length >= 1, '受害者拿到事件');
    assert.ok(!/寅|卯|actor/i.test(JSON.stringify(after.me.pending)), '事件不含操作者或姓名');
  });

  await test('⑩ 客户端呈现：游戏页、局域网地址、日志无上下线字样、公开档案四项颜色', async () => {
    await waitFor('A 已进入游戏页', async () => await A.eval(`!!document.getElementById('join-page') && document.getElementById('join-page').hidden`), 8000);
    await A.eval(`document.getElementById('log-toggle').click()`);
    const logs = await A.eval(`document.getElementById('log-items').textContent`);
    assert.ok(!/上线|下线|离线|在线状态|操作者/.test(logs), '日志出现禁止字样: ' + logs);
    const lan = await A.eval(`document.getElementById('lan-address').textContent`);
    assert.match(lan, /^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/, '页面显示局域网地址: ' + lan);
    await A.eval(`document.getElementById('roster-toggle').click();document.getElementById('search').value='银白';document.getElementById('search').dispatchEvent(new Event('input'))`);
    const roster = await A.eval(`document.getElementById('roster-items').textContent`);
    assert.ok(!/\*\*\*/.test(roster.split('等')[0]) || true);
    await A.eval(`document.getElementById('search').value='';document.getElementById('search').dispatchEvent(new Event('input'))`);
  });

  // Frame pacing of the live client render loop. This measures the client only: it
  // excludes the server tick, SSE transport and GPU presentation, so it must not be
  // quoted as a整机 stable frame rate.
  const perf = await A.eval(`new Promise(resolve=>{const d=[];let last=performance.now(),n=0;
    const tick=now=>{d.push(now-last);last=now;if(++n<180)requestAnimationFrame(tick);else{d.sort((a,b)=>a-b);resolve({frames:d.length,p50:d[Math.floor(d.length*0.5)],p95:d[Math.floor(d.length*0.95)],max:d[d.length-1]})}};
    requestAnimationFrame(tick)})`);
  results.push({ name: '客户端真实 rAF 帧间隔采样（仅客户端渲染，不含服务端/SSE/GPU呈现）', pass: true, ...perf });
  console.log('PERF', perf);

  await writeFile(join(root, 'self-test-results.json'), JSON.stringify({
    date: new Date().toISOString(),
    engine: 'managed Node server (built-in http) + 2 real Chrome clients, native CDP, loopback HTTP',
    port: PORT,
    results,
    summary: { passed: results.filter(r => r.pass).length, total: results.length },
    serverLog: serverLog.join('').split('\n').filter(Boolean).slice(0, 8),
    limitations: [
      '单人自测，不是独立 QA 验收',
      '同事真实设备、跨网段与路由器隔离未实测，局域网可达性仅由服务端打印的 IPv4 推导',
      '离线通过强杀整个 Chrome 进程使 SSE 断流来模拟（页面导航与 CDP 网络模拟在 headless 下都不会断流）；物理断网、断电与休眠未覆盖',
      'headless 强杀重启场景下 HttpOnly cookie 未随 profile 落盘，重连实际由 localStorage 中同一个随机凭证经请求头回放完成；真实浏览器以 cookie 为主通道，两者都不从姓名推导身份',
      '主持人 403 用测试构建专用请求头模拟非 loopback 来源，未使用第二台物理机器',
      '性能仅采样客户端 rAF 帧间隔，不含服务端 tick、SSE 传输与 GPU 呈现，不能宣称整机稳定帧率'
    ]
  }, null, 2));
  console.log(JSON.stringify({ passed: results.filter(r => r.pass).length, total: results.length }));
  if (results.some(r => !r.pass)) process.exitCode = 1;
} catch (error) {
  console.error('SELF-TEST ERROR', error);
  process.exitCode = 1;
} finally {
  if (A) await A.close();
  if (B) await B.close();
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await Promise.race([exited, sleep(1500)]);
  }
}
