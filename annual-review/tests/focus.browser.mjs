import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { resolveChrome } from './browser.cjs';
const testDir = dirname(fileURLToPath(import.meta.url)),
  out = resolve(testDir, '../../outputs/annual-review-book');
const urlIndex = process.argv.indexOf('--url');
const baseURL =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ||
  (urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined) ||
  process.env.REVIEW_URL ||
  'http://127.0.0.1:8790/';
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, '.focus-browser-'));
const net = createServer();
await new Promise((r) => net.listen(0, '127.0.0.1', r));
const port = net.address().port;
await new Promise((r) => net.close(r));
const browser = spawn(
  resolveChrome(),
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
);
let socket,
  id = 0;
const pending = new Map();
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const seq = ++id;
    pending.set(seq, { resolve, reject });
    socket.send(JSON.stringify({ id: seq, method, params }));
  });
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails)
    throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await delay(60);
  }
  throw Error('Timed out ' + expression);
}
const child = (e) =>
  evaluate(
    `(()=>{const frame=globalThis.document.getElementById('annual-review-frame');const document=frame.contentDocument,window=frame.contentWindow;return (${e});})()`
  );
const idle = () =>
  wait(
    'document.getElementById("annual-review-frame").contentDocument.getElementById("book-stage").dataset.busy==="false"'
  );
const key = async (key) => {
  const code = key,
    virtual = { ArrowRight: 39, ArrowLeft: 37, Tab: 9, Enter: 13, Escape: 27 }[key];
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    windowsVirtualKeyCode: virtual
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode: virtual
  });
};
async function clickChild(selector) {
  const point = await child(
    `(()=>{const r=document.querySelector(${JSON.stringify(
      selector
    )}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`
  );
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    clickCount: 1
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    clickCount: 1
  });
}
async function screenshot(name) {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, name + '.png'), Buffer.from(r.data, 'base64'));
}
async function snapshot(name) {
  const state = await evaluate(
    `(()=>{const f=document.getElementById('annual-review-frame'),doc=f.contentDocument;const read=e=>{const s=e.ownerDocument.defaultView.getComputedStyle(e);return{id:e.id,tag:e.tagName,focus:e.matches(':focus'),visible:e.matches(':focus-visible'),outline:s.outline,outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,border:s.border,shadow:s.boxShadow};};return{name:${JSON.stringify(
      name
    )},hostActive:document.activeElement.id,childActive:doc.activeElement.id,mode:doc.getElementById('book-stage').dataset.mode,busy:doc.getElementById('book-stage').dataset.busy,elements:[document.getElementById('annual-review-overlay'),f,doc.getElementById('review-dialog'),doc.activeElement].map(read)};})()`
  );
  await screenshot('focus-' + name);
  return state;
}
const results = [];
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:' + port + '/json/version')).ok) break;
    } catch {}
    await delay(100);
  }
  const page = await (
    await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })
  ).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
    }
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await call('Page.navigate', { url: baseURL });
  await call('Page.bringToFront');
  await wait(`document.getElementById('annual-review-frame')?.contentDocument?.activeElement?.id === 'reader-title'`);
  const initialButtonOutline = await child(`getComputedStyle(document.getElementById('start-review')).outlineStyle`);
  assert.equal(initialButtonOutline, 'none', 'Initial focus must not outline the cover button');
  await key('Tab');
  await key('Tab');
  const startFocus = await child(`(() => {
    const start = document.getElementById('start-review');
    return { focused: document.activeElement === start, outline: getComputedStyle(start).outlineStyle };
  })()`);
  assert.equal(startFocus.focused, true);
  assert.notEqual(startFocus.outline, 'none', 'Tab navigation must outline the cover button');
  await clickChild('#start-review');
  await idle();
  results.push(await snapshot('mouse-open'));
  await key('ArrowRight');
  await delay(100);
  results.push(await snapshot('keyboard-busy'));
  await idle();
  results.push(await snapshot('keyboard-idle'));
  await key('ArrowRight');
  await idle();
  results.push(await snapshot('keyboard-next'));
  await key('ArrowLeft');
  await idle();
  results.push(await snapshot('keyboard-previous'));
  await child('document.getElementById("review-dialog").focus()');
  results.push(await snapshot('dialog-focused'));
  await evaluate('document.getElementById("annual-review-frame").focus()');
  results.push(await snapshot('frame-focused'));
  await child('document.getElementById("close-review").focus()');
  await key('Tab');
  results.push(await snapshot('keyboard-tab'));
  writeFileSync(join(out, 'verification-focus.json'), JSON.stringify(results, null, 2));
  for (const result of results)
    console.log(
      `${result.name}: focus=${result.childActive || '(none)'}, outline=${
        result.elements.at(-1).outline
      }`
    );
  console.log(`Saved ${results.length} focus snapshots to ${join(out, 'verification-focus.json')}`);
  for (const r of results)
    for (const e of r.elements)
      if (['annual-review-overlay', 'annual-review-frame', 'review-dialog'].includes(e.id))
        assert(
          e.outlineStyle === 'none' || parseFloat(e.outlineWidth) === 0,
          `${r.name}: ${e.id} acquired an outline`
        );
  const tab = results.find((r) => r.name === 'keyboard-tab').elements.at(-1);
  assert(
    tab.tag === 'BUTTON' && parseFloat(tab.outlineWidth) > 0 && tab.outlineStyle !== 'none',
    'Keyboard button focus indication must remain visible'
  );
  console.log(
    'PASS keyboard page changes and focused containers have no outline; Tab keeps button focus visible.'
  );
} finally {
  socket?.close();
  browser.kill();
}
