// 用系统 Chrome + CDP 截 tiled/preview.html 的 7 层画面（dev-only）。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9224;
const profile = mkdtempSync(join(tmpdir(), 'tmj-preview-'));
const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1800,560', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWs() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('CDP not ready');
}
const wsUrl = await getWs();
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waiting = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; waiting.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result;

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
mkdirSync('tiled/render', { recursive: true });

for (let floor = 1; floor <= 7; floor++) {
  await send('Page.navigate', { url: `http://127.0.0.1:8789/tiled/preview.html?floor=${floor}&clean=1&v=${Date.now()}` });
  await sleep(1600);
  const hud = await evalJs(`document.getElementById('hud').textContent`);
  console.log(`floor${floor}:`, hud.result?.value);
  const rect = (await evalJs(`(()=>{const r=document.getElementById('c').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)).result?.value;
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 },
  });
  if (shot.result?.data) {
    writeFileSync(`tiled/render/layout-floor${floor}.png`, Buffer.from(shot.result.data, 'base64'));
  } else console.log('screenshot failed', JSON.stringify(shot).slice(0, 200));
}

// F1 调试
await send('Page.navigate', { url: `http://127.0.0.1:8789/tiled/preview.html?floor=1&clean=1&v=${Date.now()}` });
await sleep(1500);
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112, nativeVirtualKeyCode: 112 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F1', code: 'F1', windowsVirtualKeyCode: 112, nativeVirtualKeyCode: 112 });
await sleep(500);
const rectDbg = (await evalJs(`(()=>{const r=document.getElementById('c').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`)).result?.value;
const shot = await send('Page.captureScreenshot', {
  format: 'png', captureBeyondViewport: true,
  clip: { x: rectDbg.x, y: rectDbg.y, width: rectDbg.width, height: rectDbg.height, scale: 1 },
});
if (shot.result?.data) writeFileSync('tiled/render/layout-floor1-debug.png', Buffer.from(shot.result.data, 'base64'));

ws.close(); chrome.kill();
setTimeout(() => process.exit(0), 300);
