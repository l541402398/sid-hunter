// Anonymous clue pool regression. Isolated rooms/loopback only; never use 8787/8790.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { createRoom } = require('./room.js');
const root = dirname(fileURLToPath(import.meta.url));
const results = [], children = [];
let browser = null;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function test(name, fn) {
  try { await fn(); results.push(true); console.log('PASS', name); }
  catch (e) { results.push(false); console.error('FAIL', name, e.stack); }
}
const freePort = () => new Promise((resolve, reject) => {
  const s = createServer(); s.once('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
async function until(fn) {
  for (let i = 0; i < 100; i++) { if (await fn()) return; await pause(50); }
  throw new Error('Timed out');
}
async function stop(p) {
  if (!p || p.exitCode !== null || p.signalCode !== null) return;
  const done = new Promise(r => p.once('exit', r)); p.kill('SIGTERM');
  await Promise.race([done, pause(1500)]);
  if (p.exitCode === null && p.signalCode === null) { p.kill('SIGKILL'); await done; }
}
function assertSlots(slots) {
  for (const slot of slots) {
    assert.deepEqual(Object.keys(slot).sort(), ['alive', 'key', 'label', 'traits']);
    assert.match(slot.key, /^[0-9a-f-]{36}$/);
    assert.match(slot.label, /^坏人\d+$/);
    assert.equal(typeof slot.alive, 'boolean');
    for (const key of Object.keys(slot.traits)) assert.ok(['saying', 'food', 'sport'].includes(key));
  }
}
const use = (r, actor, kind, target, sid) => r.useSkill(actor.sessionId, {
  commandId: randomUUID(), skill: kind, targetId: target.id, sid
});
try {
  const r = createRoom({ random: () => 0 });
  await test('空房间池为空，不造固定四坑', () => assert.deepEqual(r.publicSnapshot().badSlots, []));
  const bad = r.join('module-bad', '测试坏人').player;
  const good = r.join('module-good', '测试好人').player;
  r.join('module-extra1', '旁观甲'); r.join('module-extra2', '旁观乙');
  let slot = r.publicSnapshot().badSlots[0];
  await test('一坏人一坑，未知属性不下发', () => {
    assert.equal(r.publicSnapshot().badSlots.length, 1); assertSlots([slot]);
    assert.deepEqual(slot.traits, {}); assert.equal(slot.alive, true);
  });
  await test('不同观看者及重复快照完全一致且复用缓存', () => {
    const a = r.publicSnapshot(bad.id).badSlots, b = r.publicSnapshot(good.id).badSlots;
    assert.strictEqual(a, b); assert.deepEqual(a, [slot]);
  });
  await test('姓名、位置、离线与重连不改变匿名标识，不进新日志', () => {
    const count = r.room.logs.length;
    bad.name = '变更后的姓名'; bad.x = 3000; r.setOffline(bad.id); r.join(bad.sessionId, '随意名字');
    assert.equal(r.publicSnapshot().badSlots[0].key, slot.key);
    assert.equal(r.publicSnapshot().badSlots[0].label, slot.label);
    assert.equal(r.room.logs.length, count);
  });
  await test('好人NPC不入坏人池', () => {
    r.spawnNpc(2, good); assert.equal(r.publicSnapshot().badSlots.length, 1);
  });
  await test('probe合法公开同步池，仅该已公开项且只新增正常技能日志', () => {
    const count = r.room.logs.length;
    assert.equal(use(r, good, 'probe', bad).ok, true);
    const next = r.publicSnapshot().badSlots[0];
    assert.equal(next.key, slot.key); assert.deepEqual(next.traits, { saying: bad.traits.saying });
    assert.equal(r.room.logs.length, count + 1); slot = next;
  });
  await test('缓存公开值不可被快照调用者改写', () => {
    assert.ok(Object.isFrozen(r.publicSnapshot().badSlots));
    assert.ok(Object.isFrozen(slot) && Object.isFrozen(slot.traits));
    assert.throws(() => { slot.traits.food = '伪造'; }, TypeError);
  });
  await test('指认非致死不删除卡，致死保留原标识与公开线索', () => {
    assert.ok(use(r, good, 'accuse', bad).ok);
    assert.equal(r.publicSnapshot().badSlots[0].alive, true);
    r.room.clockOffset += 12001;
    assert.ok(use(r, good, 'accuse', bad).ok);
    const dead = r.publicSnapshot().badSlots[0];
    assert.equal(dead.alive, false); assert.equal(dead.key, slot.key);
    assert.deepEqual(dead.traits, slot.traits); assert.equal(bad.alive, false);
  });
  await test('reset清旧映射，新局重新生成匿名key', () => {
    const key = slot.key; r.reset(); assert.deepEqual(r.publicSnapshot().badSlots, []);
    r.join('new-bad', '新局'); assert.notEqual(r.publicSnapshot().badSlots[0].key, key);
  });
  // Multi-bad fixture is module-only: no new production endpoint or role assignment option.
  const m = createRoom();
  const ma = m.join('ma', '甲').player, mb = m.join('mb', '乙').player;
  m.join('mc', '丙'); m.join('md', '丁'); m.join('me', '戊');
  mb.faction = 'bad'; mb.hp = 2;
  await test('模块多坏人各有唯一匿名key与label，不卡四坑', () => {
    const slots = m.publicSnapshot().badSlots; assertSlots(slots); assert.equal(slots.length, 2);
    assert.equal(new Set(slots.map(s => s.key)).size, 2); assert.equal(new Set(slots.map(s => s.label)).size, 2);
    assert.ok(slots.every(s => Object.keys(s.traits).length === 0));
  });
  await test('spy公开人物SID不加入匿名池', () => {
    const before = JSON.stringify(m.publicSnapshot().badSlots);
    assert.ok(use(m, ma, 'spy', mb).ok);
    assert.equal(JSON.stringify(m.publicSnapshot().badSlots), before);
  });
  await test('kill淘汰坏人保留匿名卡且无身份关联字段', () => {
    assert.ok(use(m, ma, 'kill', mb, mb.sid.segments.join('-')).ok);
    const slots = m.publicSnapshot().badSlots; assertSlots(slots);
    assert.equal(slots.length, 2); assert.equal(slots.filter(s => !s.alive).length, 1);
  });

  const port = await freePort(); assert.ok(![8787, 8790].includes(port));
  const base = `http://127.0.0.1:${port}`;
  const proc = spawn(process.execPath, [join(root, 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DEV: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  }); children.push(proc);
  let output = ''; proc.stdout.on('data', d => { output += d; }); proc.stderr.on('data', d => { output += d; });
  await until(async () => { try { return (await fetch(base + '/')).status === 200; } catch { return false; } });
  async function request(path, token, body) {
    const res = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Sid-Session': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { ...(await res.json()), status: res.status };
  }
  const people = [];
  for (let i = 0; i < 4; i++) people.push(await request('/api/join', null, { nickname: `HTTP${i}` }));
  const [a, b] = people;
  const before = await request('/api/state', b.sessionToken);
  await test('HTTP匿名池白名单、零未知值、各视角一致', async () => {
    assertSlots(before.badSlots); assert.equal(before.badSlots.length, 1);
    assert.deepEqual(before.badSlots[0].traits, {});
    assert.deepEqual((await request('/api/state', a.sessionToken)).badSlots, before.badSlots);
  });
  await test('真实HTTP probe公开同步匿名池，人物公开数据也一致', async () => {
    const response = await request('/api/skill', b.sessionToken, { commandId: randomUUID(), skill: 'probe', targetId: a.playerId });
    assert.ok(response.ok); const s = await request('/api/state', b.sessionToken);
    const actorTarget = s.players.find(p => p.id === a.playerId);
    assert.equal(Object.keys(s.badSlots[0].traits).length, 1);
    for (const [k, v] of Object.entries(s.badSlots[0].traits)) assert.equal(v, actorTarget.traits[k]);
    assert.equal(s.badSlots[0].key, before.badSlots[0].key);
  });
  await test('真实SSE首帧包含同一匿名池', async () => {
    const ctrl = new AbortController();
    try {
      const response = await fetch(base + '/api/stream?sid_token=' + b.sessionToken, { signal: ctrl.signal });
      const reader = response.body.getReader(); let buffer = '';
      for (;;) {
        const { value, done } = await reader.read(); assert.equal(done, false);
        buffer += new TextDecoder().decode(value);
        const line = buffer.split('\n').find(v => v.startsWith('data: '));
        if (line) { assert.deepEqual(JSON.parse(line.slice(6)).badSlots, (await request('/api/state', b.sessionToken)).badSlots); break; }
      }
      await reader.cancel();
    } finally { ctrl.abort(); }
  });

  if (process.env.BAD_POOL_BROWSER === '1') {
    const chromePort = await freePort(), profile = await mkdtemp(join(tmpdir(), 'sid-pool-browser-'));
    browser = { profile, proc: spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
      '--headless=new', '--no-sandbox', '--no-first-run', '--no-default-browser-check',
      `--remote-debugging-port=${chromePort}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'
    ], { stdio: 'ignore' }) };
    let page;
    await until(async () => { try { page = (await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json()).find(p => p.type === 'page'); return !!page; } catch { return false; } });
    const ws = new WebSocket(page.webSocketDebuggerUrl); browser.ws = ws;
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let seq = 0; const pending = new Map(), errors = [];
    ws.onmessage = e => { const msg = JSON.parse(e.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
    };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout')); }, 10000);
      pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } }); ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
    const key = async (value, code, vk) => { await send('Page.bringToFront'); await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code, windowsVirtualKeyCode: vk, ...(value === ' ' ? { text: ' ', unmodifiedText: ' ' } : value === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code, windowsVirtualKeyCode: vk }); };
    await send('Page.enable'); await send('Runtime.enable'); await send('Page.navigate', { url: base + '/' });
    await until(() => evaluate("document.readyState==='complete' && !!document.getElementById('bad-toggle')"));
    await evaluate(`localStorage.setItem('sid_session_token',${JSON.stringify(b.sessionToken)})`);
    await send('Page.reload');
    try { await until(() => evaluate("document.querySelectorAll('.bad-slot').length===1")); }
    catch (error) {
      console.error('Browser initialization', JSON.stringify(errors), await evaluate("({ready:document.readyState,pool:document.getElementById('bad-slots').textContent,joinHidden:document.getElementById('join-page').hidden,token:!!localStorage.getItem('sid_session_token')})"));
      throw error;
    }
    await test('浏览器真实Enter/Space切换且默认折叠', async () => {
      assert.equal(await evaluate("document.getElementById('bad-slots').hidden"), true);
      await until(() => evaluate("document.getElementById('join-page').hidden"));
      await send('Page.bringToFront');
      await evaluate("document.getElementById('bad-toggle').focus()"); await key('Enter', 'Enter', 13);
      assert.equal(await evaluate("document.getElementById('bad-toggle').getAttribute('aria-expanded')"), 'true');
      await key(' ', 'Space', 32); assert.equal(await evaluate("document.getElementById('bad-slots').hidden"), true);
    });
    await test('匿名卡DOM无姓名、人物关联或SID链接', async () => {
      const html = await evaluate("document.getElementById('bad-slots').outerHTML");
      assert.ok(!html.includes('HTTP0')); assert.ok(!/data-player|data-target|data-copy-sid|href=/.test(html));
    });
    await test('线索使用安全文本，无HTML解析且快照不会强制展开', async () => {
      const literal = '<b>测试线索</b>';
      const frame = { ...before, badSlots: [{ key: 'ui-fixture', label: '坏人测试', alive: false, traits: { saying: literal } }] };
      // Feed through the real EventSource callback without exposing private app internals.
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `const OriginalEventSource=window.EventSource; window.EventSource=class extends OriginalEventSource { constructor(...args){super(...args); window.poolTestStream=this;} };` });
      await send('Page.reload'); await until(() => evaluate("!!window.poolTestStream && typeof window.poolTestStream.onmessage==='function'"));
      await evaluate('window.poolTestStream.close()');
      await evaluate(`window.poolTestStream.onmessage({data:${JSON.stringify(JSON.stringify(frame))}})`);
      assert.equal(await evaluate("document.querySelector('.bad-clue strong').textContent"), literal);
      assert.equal(await evaluate("document.querySelector('#bad-slots b')===null"), true);
      assert.equal(await evaluate("document.getElementById('bad-slots').hidden"), true);
      assert.ok((await evaluate("document.getElementById('bad-slots').textContent")).includes('已淘汰'));
      await evaluate(`window.poolTestStream.onmessage({data:${JSON.stringify(JSON.stringify({ ...before, badSlots: [] }))}})`);
      assert.equal(await evaluate("document.getElementById('bad-slots').textContent"), '暂无坏人');
      const old = { ...before }; delete old.badSlots;
      await evaluate(`window.poolTestStream.onmessage({data:${JSON.stringify(JSON.stringify(old))}})`);
      assert.ok((await evaluate("document.getElementById('bad-slots').textContent")).includes('尚未提供'));
    });
    await test('窄屏卡片不横向溢出，浏览器无运行异常', async () => {
      await evaluate(`window.poolTestStream.onmessage({data:${JSON.stringify(JSON.stringify({ ...before, badSlots: [{ key: 'long-clue', label: '坏人123456', alive: true, traits: { saying: '长线索'.repeat(80) } }] }))}})`);
      await evaluate("document.getElementById('bad-toggle').click()");
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
      assert.equal(await evaluate("!document.getElementById('bad-slots').hidden && document.querySelector('.bad-slot').getBoundingClientRect().width>0 && document.getElementById('bad-slots').scrollWidth <= document.getElementById('bad-slots').clientWidth && document.querySelector('.bad-slot').scrollWidth <= document.querySelector('.bad-slot').clientWidth"), true);
      assert.deepEqual(errors, []);
    });
  } else console.log('SKIP 浏览器：设置BAD_POOL_BROWSER=1可启用实际Chrome/CDP验证');
} catch (e) { results.push(false); console.error('FAIL runner', e.stack); }
finally {
  if (browser) { browser.ws?.close(); await stop(browser.proc); await rm(browser.profile, { recursive: true, force: true }); }
  for (const p of children) await stop(p);
}
console.log(`汇总 ${results.filter(Boolean).length}/${results.length} PASS`);
process.exitCode = results.every(Boolean) ? 0 : 1;
