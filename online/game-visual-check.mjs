// 一次性：真实游戏页 8787 的 TMJ 画面层截图 + 运行检查（零依赖 CDP）。
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG = 9227;
const BASE = process.env.SID_BASE || 'http://127.0.0.1:8787';
const profile = mkdtempSync(join(tmpdir(), 'sid-tmj-visual-'));
const outDir = 'outputs';
mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DEBUG}`, `--user-data-dir=${profile}`, '--window-size=1440,900', '--no-first-run', '--disable-background-networking', 'about:blank'], { stdio: 'ignore' });

async function getPage() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {}
    await sleep(250);
  }
  throw new Error('no page');
}
const page = await getPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push((m.params.args || []).map(a => a.value || a.description).join(' '));
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: BASE + '/' });
await sleep(1500);
await ev(`(()=>{const n=document.querySelector('#nickname'); if(n){n.value='TMJ视觉验收';n.dispatchEvent(new Event('input',{bubbles:true}));} const b=document.querySelector('#join-form button[type=submit]'); if(b)b.click(); return true;})()`);
for (let i = 0; i < 40; i++) {
  const ok = await ev(`!!(document.querySelector('#join-page') && document.querySelector('#join-page').hidden)`);
  if (ok) break;
  await sleep(250);
}
await sleep(3000);
const apiState = async () => ev(`fetch('/api/state',{headers:{'X-Sid-Session':localStorage.getItem('sid_session_token')}}).then(r=>r.json())`);
const before = await apiState();
await send('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68, code: 'KeyD', key: 'd', text: 'd' });
await sleep(900);
await send('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68, code: 'KeyD', key: 'd' });
await sleep(400);
const after = await apiState();
const selfOf = (s) => s && Array.isArray(s.players) ? s.players.find(p => p.id === s.me?.id) : null;
const b = selfOf(before), a = selfOf(after);
const move = { beforeX: b?.x, afterX: a?.x, beforeY: b?.y, afterY: a?.y, alive: after?.me?.alive };
const info = await ev(`(()=>{
  const W=window.WORLD, T=window.SID&&window.SID.tmjVisual;
  const m=W&&W.TMJ&&W.TMJ.get(1);
  return { tmj: !!(W&&W.TMJ&&W.TMJ.isEnabled()), visualReady: !!(T&&T.ready), visualError: T&&T.error,
    mapProps: m?m.props.length:0, mapGround: m?m.ground.length:0, floor: window.floorId ?? null,
    canvas: !!document.querySelector('canvas') };
})()`);
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
if (shot.result?.data) writeFileSync(join(outDir, 'game-tmj-visual.png'), Buffer.from(shot.result.data, 'base64'));
console.log(JSON.stringify({ info, move, errors, shot: join(outDir, 'game-tmj-visual.png') }, null, 2));
ws.close(); chrome.kill(); setTimeout(() => process.exit(0), 200);




