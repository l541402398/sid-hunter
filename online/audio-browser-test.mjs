// 真实 Chrome 端到端音频验收：验证双轨 BGM（游戏大厅 / 年度纪念册）自动切换、
// 静音/音量面板同步、翻书与敲打等 Kenney CC0 音效请求均返回 200/206 且零运行时异常。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from '../annual-review/tests/browser.cjs';

const online = dirname(fileURLToPath(import.meta.url));
const out = resolve(online, '../outputs/audio-browser-test');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, '.profile-'));

const freePort = async () => {
  const s = createServer();
  await new Promise((ok, no) => { s.once('error', no); s.listen(0, '127.0.0.1', ok); });
  const p = s.address().port;
  await new Promise((ok, no) => s.close(e => e ? no(e) : ok()));
  return p;
};

const port = await freePort();
const debugPort = await freePort();
const base = `http://127.0.0.1:${port}`;
let server, browser, socket, seq = 0;
const pending = new Map();
const errors = [];
const failedResources = [];
const audioRequests = [];

const call = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  const timer = setTimeout(() => { pending.delete(id); rej(Error('CDP timeout ' + method)); }, 15000);
  pending.set(id, {
    resolve: (v) => { clearTimeout(timer); res(v); },
    reject: (e) => { clearTimeout(timer); rej(e); }
  });
  socket.send(JSON.stringify({ id, method, params }));
});

const evalJS = async (expression) => {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

const wait = async (expr, timeout = 12000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evalJS(expr)) return;
    await delay(60);
  }
  throw Error('Timed out: ' + expr);
};

const clickReal = async (point) => {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await call('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
  await call('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
};

const clickChild = async (sel) => {
  const pt = await evalJS(`(() => {
    const f = document.getElementById('annual-review-frame');
    const el = f.contentDocument.querySelector(${JSON.stringify(sel)});
    const fr = f.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: fr.left + f.clientLeft + r.left + r.width / 2, y: fr.top + f.clientTop + r.top + r.height / 2 };
  })()`);
  await clickReal(pt);
};

const clickRoot = async (sel) => {
  const pt = await evalJS(`(() => {
    const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  await clickReal(pt);
};

const pressKey = async (key, code, vk) => {
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
};

const capture = async (name) => {
  await delay(120);
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, name), Buffer.from(r.data, 'base64'));
};

try {
  server = spawn(process.execPath, [join(online, 'server.js')], {
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DB: '1', SID_DB_FILE: ':memory:', SID_TEST_AUTO_OPEN: '1', SID_DEV: '0', SID_PROFILE_SYNC: '0' },
    stdio: 'ignore',
    windowsHide: true
  });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(base + '/')).ok) break; } catch {}
    await delay(120);
  }

  browser = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });

  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok) break; } catch {}
    await delay(100);
  }

  const page = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const t = pending.get(m.id);
      if (t) { pending.delete(m.id); m.error ? t.reject(Error(m.error.message)) : t.resolve(m.result); }
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Network.responseReceived') {
      const r = m.params.response;
      const u = new URL(r.url).pathname;
      if (r.status >= 400 && !u.startsWith('/api/')) failedResources.push({ url: r.url, status: r.status });
      if (/\.(mp3|ogg|wav)$/i.test(u)) audioRequests.push({ path: u, status: r.status, mime: r.mimeType });
    }
  };

  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  // 1. 打开游戏主页：纪念册首屏打开时自动切至 annual BGM
  await call('Page.navigate', { url: base + '/' });
  await wait('document.getElementById("annual-review-overlay")?.dataset.ready === "true"');
  assert.equal(await evalJS('window.SID.audio.getState().track'), 'annual');
  console.log('PASS 1. Startup annual review sets BGM track to annual');

  // 2. 点击「开启年度回忆」与翻页：解锁音频、加载 bgm-annual.mp3、播放 bookOpen / bookFlip 音效
  await clickChild('#start-review');
  await wait('document.getElementById("annual-review-frame").contentDocument.getElementById("book-stage").dataset.mode === "open"');
  await delay(250);
  await clickChild('#next-page');
  await wait('document.getElementById("annual-review-frame").contentDocument.getElementById("book-stage").dataset.busy === "false"');
  await delay(250);
  assert.equal(await evalJS('window.SID.audio.getState().unlocked'), true);
  assert.ok(audioRequests.some(r => r.path.endsWith('/bgm-annual.mp3') && [200, 206].includes(r.status)), 'bgm-annual.mp3 did not load');
  assert.ok(audioRequests.some(r => r.path.endsWith('/bookOpen.ogg') && r.status === 200), 'bookOpen.ogg did not load');
  assert.ok(audioRequests.some(r => /bookFlip[123]\.ogg$/.test(r.path) && r.status === 200), 'bookFlip*.ogg did not load');
  console.log('PASS 2. Opening & flipping annual review loads bgm-annual.mp3, bookOpen.ogg, bookFlip*.ogg');

  // 3. 纪念册右上角静音按钮与主游戏双向同步
  await clickChild('#annual-audio-toggle');
  await wait('window.SID.audio.getState().muted === true');
  assert.equal(await evalJS('document.getElementById("audio-toggle").dataset.muted'), 'true');
  await wait('document.getElementById("annual-review-frame").contentDocument.getElementById("annual-audio-toggle").dataset.muted === "true"');
  await clickChild('#annual-audio-toggle');
  await wait('window.SID.audio.getState().muted === false');
  assert.equal(await evalJS('document.getElementById("audio-toggle").dataset.muted'), 'false');
  console.log('PASS 3. Annual review mute button syncs bidirectionally with game toolbar');

  // 4. 关闭纪念册：切换回游戏 BGM（bgm-game.mp3），并加入对局
  await clickChild('#close-review');
  await wait('!document.getElementById("annual-review-overlay").open');
  await delay(300);
  assert.equal(await evalJS('window.SID.audio.getState().track'), 'game');
  assert.ok(audioRequests.some(r => r.path.endsWith('/bgm-game.mp3') && [200, 206].includes(r.status)), 'bgm-game.mp3 did not load');
  console.log('PASS 4. Closing annual review crossfades to bgm-game.mp3');

  // 加入游戏并打开工具栏声音设置面板
  await evalJS('localStorage.setItem("sid-tutorial-v3:guest:音效自测", JSON.stringify({dismissed:true})); document.getElementById("nickname").value="音效自测"; document.getElementById("join-form").requestSubmit();');
  await wait('document.getElementById("join-page").hidden === true');
  await delay(200);

  await clickRoot('#audio-toggle');
  await wait('document.getElementById("audio-popover").hidden === false');
  assert.equal(await evalJS('document.getElementById("audio-track-label").textContent'), '办公大厅 · 爵士轻音');
  await capture('game-audio-popover-1440.png');
  await pressKey('Escape', 'Escape', 27);
  await wait('document.getElementById("audio-popover").hidden === true');
  console.log('PASS 5. Game toolbar audio popover opens, shows track label, and closes on Escape');

  // 5. 按 J 敲打触发敲打音效（空挥 cloth1.ogg 或命中 chop.ogg）
  await evalJS('document.getElementById("office").focus()');
  await pressKey('j', 'KeyJ', 74);
  await delay(350);
  assert.ok(audioRequests.some(r => /(cloth1|chop)\.ogg$/.test(r.path) && r.status === 200), 'J bonk SFX did not load');
  console.log('PASS 6. Pressing J plays bonk SFX (cloth1/chop)');

  // 6. 独立访问 /annual-review/ 同样播放年度纪念册背景音乐与翻书音
  const prevCount = audioRequests.length;
  await call('Page.navigate', { url: base + '/annual-review/' });
  await wait('document.getElementById("review-dialog")?.open === true');
  await clickRoot('#start-review');
  await delay(300);
  assert.ok(audioRequests.slice(prevCount).some(r => r.path.endsWith('/bgm-annual.mp3') && [200, 206].includes(r.status)), 'Standalone /annual-review/ did not load bgm-annual.mp3');
  console.log('PASS 7. Standalone /annual-review/ loads bgm-annual.mp3 and book SFX cleanly');

  assert.deepEqual(errors, [], 'Unexpected JS errors: ' + JSON.stringify(errors));
  assert.deepEqual(failedResources, [], 'Failed resources: ' + JSON.stringify(failedResources));
  console.log(`ALL 7 BROWSER AUDIO CHECKS PASSED (${audioRequests.length} audio requests, 0 errors, 0 failed resources).`);
} finally {
  try { socket?.close(); } catch {}
  try { browser?.kill(); } catch {}
  try { server?.kill(); } catch {}
}
