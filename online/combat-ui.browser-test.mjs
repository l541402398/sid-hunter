// Real browser acceptance for public health, protection auras, private notifications and truce.
// Starts an isolated SID_TEST server with in-memory SQLite; no live preview is reused.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from '../annual-review/tests/browser.cjs';

const require = createRequire(import.meta.url), W = require('./shared/world.js');
const online = dirname(fileURLToPath(import.meta.url));
const out = resolve(online, '../outputs/combat-ui');
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, '.browser-profile-'));
const results = [], errors = [], failedResources = [], screenshots = [], observations = {};
const freePort = async () => {
  const listener = createServer();
  await new Promise((ok, no) => { listener.once('error', no); listener.listen(0, '127.0.0.1', ok); });
  const port = listener.address().port;
  await new Promise((ok, no) => listener.close(error => error ? no(error) : ok()));
  return port;
};
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, browser, socket, sequence = 0, serverLog = '', activeCheck = 'startup', self, otherGood, bads, ownToken;
const pending = new Map(), tokens = new Map();
async function waitFor(label, predicate, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await predicate();
    if (value) return value;
    await delay(45);
  }
  throw Error('Timed out: ' + label);
}
async function api(path, body, token) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-Sid-Session': token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(7000)
  });
  return { status: response.status, data: await response.json() };
}
const state = async (token = ownToken) => (await api('/api/state', undefined, token)).data;
const call = (method, params = {}) => new Promise((ok, no) => {
  const id = ++sequence;
  const timer = setTimeout(() => { pending.delete(id); no(Error('CDP timeout ' + method)); }, 15000);
  pending.set(id, { ok: value => { clearTimeout(timer); ok(value); }, no: error => { clearTimeout(timer); no(error); } });
  socket.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const response = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
  return response.result.value;
}
const waitPage = expression => waitFor(expression, () => evaluate(expression));
const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function key(key, code, vk, type) {
  await call('Input.dispatchKeyEvent', { type: type || 'keyDown', key, code, windowsVirtualKeyCode: vk });
  if (!type) await call('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}
async function check(name, fn) {
  activeCheck = name;
  const detail = await fn();
  results.push({ name, passed: true, ...(detail ? { detail } : {}) });
  console.log('PASS ' + name);
}
async function capture(name) {
  const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(out, name), Buffer.from(screenshot.data, 'base64'));
  screenshots.push(name);
}
function assertPublicPlayer(p) {
  assert(Number.isSafeInteger(p.maxHp) && p.maxHp > 0, 'Public maxHp missing or invalid');
  assert(Number.isSafeInteger(p.hp) && p.hp >= 0 && p.hp <= p.maxHp, 'Public hp outside 0..maxHp');
  for (const name of ['faction', 'skills', 'empNo', 'sessionId', 'exploration', 'input'])
    assert(!(name in p), 'Public player exposed ' + name);
}
async function health(selector, hp, protectedValue = false, truce = false) {
  await waitPage(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e&&Number(e.dataset.hp)===${hp}&&e.dataset.protected===${JSON.stringify(String(protectedValue))}&&e.dataset.truce===${JSON.stringify(String(truce))};})()`);
  const value = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return{role:e.getAttribute('role'),now:Number(e.getAttribute('aria-valuenow')),max:Number(e.getAttribute('aria-valuemax')),hp:Number(e.dataset.hp),maxHp:Number(e.dataset.maxHp),label:e.getAttribute('aria-label')};})()`);
  assert.equal(value.role, 'meter'); assert.equal(value.now, hp); assert.equal(value.hp, hp);
  assert(value.max > 0 && value.max === value.maxHp);
  return value;
}
async function skill(actor, target) {
  const snapshot = await state(tokens.get(actor.id));
  const response = await api('/api/skill', {
    commandId: 'combat-ui-' + actor.id + '-' + Date.now(), skill: actor.faction === 'good' ? 'accuse' : 'assassinate', targetId: target.id,
    roundId: snapshot.roundId, expectedFloorRevision: snapshot.me.floorRevision
  }, tokens.get(actor.id));
  assert.equal(response.status, 200, JSON.stringify(response.data));
  assert.equal(response.data.ok, true, response.data.error || response.data.resultText);
  return response.data;
}
function openSpot() {
  const bounds = W.floorBounds(1), blockers = W.floorBlockers(1);
  for (let y = bounds.minY + 110; y < bounds.maxY - 80; y += 30)
    for (let x = bounds.minX + 130; x < bounds.maxX - 150; x += 30) {
      const points = [0, 20, 40, 60].map(dx => ({ x: x + dx, y }));
      if (points.every(p => !W.floorCollides(1, p.x, p.y, blockers) && !W.coverFor(p, blockers)) &&
          W.lineClear(points[0], points[3], blockers)) return { x, y };
    }
  throw Error('No open movement/hammer test spot');
}
async function installVisualProbe() {
  await evaluate(`(()=>{
    const qa=window.__combatQA={frames:[],auras:[],bars:[],toast:[],canvasText:[],search:[]};
    const aura=SID.combatVisuals.drawProtectionCocoon,bar=SID.combatVisuals.drawHealthBar,body=WORLD.drawCharacterBody;
    SID.combatVisuals.drawProtectionCocoon=function(g,p,clock,height){const result=aura.apply(this,arguments);qa.auras.push({at:performance.now(),id:p.id,hp:p.hp,maxHp:p.maxHp,protected:!!p.protected,alive:p.alive,truce:!!p.truce,drawn:result});if(qa.auras.length>2500)qa.auras.shift();return result;};
    SID.combatVisuals.drawHealthBar=function(g,s){const result=bar.apply(this,arguments);qa.bars.push({...s,at:performance.now()});if(qa.bars.length>2500)qa.bars.shift();return result;};
    WORLD.drawCharacterBody=function(g,p,clock,age,direction){const result=body.apply(this,arguments);if(p.id===${self.id}){const t=g.getTransform();qa.frames.push({at:performance.now(),p:JSON.parse(JSON.stringify(p)),clock,age,direction,transform:{a:t.a,d:t.d,e:t.e,f:t.f}});if(qa.frames.length>1000)qa.frames.shift();}return result;};
    const fillText=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(this.canvas.id==='office'){qa.canvasText.push(String(text));if(qa.canvasText.length>1000)qa.canvasText.shift();}return fillText.call(this,text,...args);};
    const toast=document.getElementById('copy-toast');new MutationObserver(()=>{const text=toast.textContent;if(text)qa.toast.push({text,at:performance.now()});}).observe(toast,{childList:true,characterData:true,subtree:true});
    const fetch=window.fetch;window.fetch=async function(input,...args){const response=await fetch.call(this,input,...args);const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(path==='/api/search/start'||path==='/api/search/take'){const data=await response.clone().json();qa.search.push({path,status:response.status,sessionId:data.sessionId,mode:data.mode,quiz:data.quiz,ok:data.ok,correct:data.correct});}return response;};
    qa.compareAura=()=>{
      const frame=qa.frames.at(-1);if(!frame)throw Error('No real character frame');
      const player={...frame.p,x:64,y:102,moving:false,walk:0,alive:true,truce:false};
      const render=(protectedValue,withAura,withBody=true,time=0)=>{const c=document.createElement('canvas');c.width=128;c.height=128;const g=c.getContext('2d');g.imageSmoothingEnabled=false;const p={...player,protected:protectedValue};if(withBody)body(g,p,0,null,p.spriteFacing);if(withAura)aura(g,p,time,77);return c;};
      const plain=render(false,false),bodyProtected=render(true,false),withAura=render(true,true),off=render(false,true);
      const pixels=c=>c.getContext('2d').getImageData(0,0,128,128).data;
      const a=pixels(plain),b=pixels(bodyProtected),c=pixels(withAura),d=pixels(off),effect=pixels(render(true,true,false)),next=pixels(render(true,true,false,.6));
      const different=(left,right,i)=>left[i]!==right[i]||left[i+1]!==right[i+1]||left[i+2]!==right[i+2]||left[i+3]!==right[i+3];
      let bodyDiff=0,auraDiff=0,offDiff=0,bodyPixels=0,edgePixels=0,motionPixels=0;
      for(let i=0;i<a.length;i+=4){
        if(a[i+3])bodyPixels++;
        if(different(a,b,i))bodyDiff++;
        if(different(a,c,i))auraDiff++;
        if(different(a,d,i))offDiff++;
        const x=(i/4)%128,y=Math.floor(i/(4*128));
        if((x<44||x>84)&&y>=30&&y<90&&effect[i+3]>60)edgePixels++;
        if(different(effect,next,i))motionPixels++;
      }
      const faceOverlayMax=Math.max(...Array.from({length:10},(_,y)=>Array.from({length:12},(_,x)=>effect[((32+y)*128+58+x)*4+3])).flat());
      const transparentOutside=[0,127,128*127,128*128-1].every(pixel=>effect[pixel*4+3]===0);
      const truceDrawn=aura(document.createElement('canvas').getContext('2d'),{...player,hp:0,alive:false,truce:true,protected:true},0,77);
      return {bodyDiff,auraDiff,offDiff,bodyPixels,edgePixels,motionPixels,faceOverlayMax,transparentOutside,truceDrawn,plain:plain.toDataURL(),withAura:withAura.toDataURL()};
    };
  })()`);
}

try {
  server = spawn(process.execPath, ['server.js'], {
    cwd: online, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_TEST: '1', SID_DEV: '1', SID_DB: '1', SID_DB_FILE: ':memory:', SID_TEST_AUTO_OPEN: '1' }
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog += data.toString(); });
  await waitFor('isolated test server', async () => {
    try { return (await fetch(base + '/api/auth/config', { signal: AbortSignal.timeout(700) })).ok; } catch { return false; }
  });
  // Factions are independently random. Find sufficient real guest accounts without
  // changing the allocation algorithm or injecting a known private faction into UI.
  for (let i = 0; i < 80; i++) {
    const joined = await api('/api/join', { nickname: '验收' + i });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    tokens.set(joined.data.playerId, joined.data.sessionToken);
    const all = (await api('/api/test/state')).data.players;
    const goods = all.filter(p => p.faction === 'good'), villains = all.filter(p => p.faction === 'bad');
    if (goods.length >= 2 && villains.length >= 2) { [self, otherGood] = goods; bads = villains.slice(0, 2); break; }
  }
  assert(self && otherGood && bads?.length === 2, 'Could not create independent good/bad test participants');
  ownToken = tokens.get(self.id);
  const spot = openSpot(); observations.spot = spot;
  for (const id of tokens.keys()) await api('/api/test/place', { playerId: id, floorId: 7, zoneId: null, x: 500, y: 350 });
  await api('/api/test/place', { playerId: self.id, floorId: 1, zoneId: null, ...spot });
  await api('/api/test/place', { playerId: otherGood.id, floorId: 1, zoneId: null, x: spot.x + 30, y: spot.y });

  browser = spawn(resolveChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + debugPort, '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  await waitFor('Chrome', async () => { try { return (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).ok; } catch { return false; } });
  const page = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { socket.onopen = ok; socket.onerror = no; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) { const task = pending.get(message.id); if (task) { pending.delete(message.id); message.error ? task.no(Error(message.error.message)) : task.ok(message.result); } return; }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response;
      if (response.status >= 400 && !new URL(response.url).pathname.startsWith('/api/')) failedResources.push({ url: response.url, status: response.status });
    }
  };
  await call('Page.enable'); await call('Runtime.enable'); await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `if(location.origin===${JSON.stringify(base)})localStorage.setItem('sid_session_token',${JSON.stringify(ownToken)});` });
  await call('Page.navigate', { url: base + '/' }); await call('Page.bringToFront');
  await waitPage(`document.readyState==='complete'&&document.getElementById('annual-review-overlay').open&&document.getElementById('annual-review-overlay').dataset.ready==='true'`);
  await key('Escape', 'Escape', 27);
  await waitPage(`!document.getElementById('annual-review-overlay').open&&document.getElementById('join-page').hidden&&!!window.SID?.combatVisuals`);
  await installVisualProbe();
  await waitPage(`__combatQA.frames.length>2`);

  await check('Public health is legal while faction, skills and identity credentials remain private', async () => {
    const snapshot = await state();
    for (const player of snapshot.players) assertPublicPlayer(player);
    for (const player of snapshot.roster || []) assertPublicPlayer(player);
    assert.equal(snapshot.me.id, self.id); assert.equal(snapshot.me.hp, 3); assert.equal(snapshot.me.maxHp, 3);
    assert.equal(Object.keys(snapshot.me.skills).length, 1);
    assert(snapshot.players.some(p => p.id === otherGood.id));
  });
  await check('Roster, target profile, private operation and personal panel show health without S-ID', async () => {
    await click('#roster-toggle');
    await health(`#roster-items [data-player="${otherGood.id}"] .combat-health`, 3);
    await click(`#roster-items [data-player="${otherGood.id}"]`);
    await health('#target .combat-health', 3);
    await health('#private-content .combat-health', 3);
    const panels = await evaluate(`['target','roster-items','private-content'].map(id=>({id,text:document.getElementById(id).innerText}))`);
    for (const panel of panels) assert(!/S-ID|身份码|\*{3}-\*{3}-\*{3}/i.test(panel.text), panel.id + ' retained the removed identity-code UI');
    await key('Escape', 'Escape', 27);
    await click('#my-info');
    await health('#mine-health .combat-health', 3);
    assert(!/S-ID|身份码|\*{3}-\*{3}-\*{3}/i.test(await evaluate(`document.getElementById('mine').innerText`)));
    await capture('01-health-panels.png');
    await click('#mine-close');
    await click('#roster-close');
    await evaluate(`document.getElementById('target-close')?.click()`);
    await waitPage(`__combatQA.bars.length>0`);
    assert(!(await evaluate(`__combatQA.canvasText.some(text=>/S-ID|身份码|[*]{3}-[*]{3}-[*]{3}/i.test(text))`)), 'Canvas nameplate retained S-ID');
  });
  await check('Misidentification reduces own health, shows a specific notice and creates no aura', async () => {
    await skill(self, otherGood);
    await waitPage(`__combatQA.toast.some(e=>/生命/.test(e.text)&&/剩余.*2/.test(e.text))`);
    const snapshot = await state();
    assert.equal(snapshot.me.hp, 2); assert.equal(snapshot.me.protected, false);
    const notice = snapshot.me.pending.find(event => event.type === 'selfHit');
    assert(notice && /生命/.test(notice.text) && !/S-ID|新的公开变化/.test(notice.text));
    await click('#my-info'); await health('#mine-health .combat-health', 2);
    await capture('02-self-hit.png'); await click('#mine-close');
    await waitPage(`__combatQA.auras.some(s=>s.id===${self.id}&&s.hp===2&&!s.protected&&!s.drawn)`);
  });
  await check('A real opposing hit paints a translucent animated cocoon', async () => {
    await skill(bads[0], self);
    await waitPage(`__combatQA.auras.some(s=>s.id===${self.id}&&s.hp===1&&s.protected&&s.drawn)`);
    await waitPage(`__combatQA.toast.some(e=>/生命/.test(e.text)&&/保护/.test(e.text))`);
    const snapshot = await state();
    assert.equal(snapshot.me.hp, 1); assert.equal(snapshot.me.protected, true);
    const notice = snapshot.me.pending.find(event => event.type === 'hit');
    assert(notice && /生命/.test(notice.text) && /保护/.test(notice.text));
    assert(!/刺杀|指认|调查员|潜伏者|坏人|好人|新的公开变化/.test(notice.text), 'Victim notification reveals the attacker or skill');
    for (const name of ['actorId', 'actorName', 'byId', 'byName', 'faction', 'skill']) assert(!(name in notice));
    for (const actor of bads) assert(!notice.text.includes(actor.name));
    await capture('03-protected-game.png');
    await click('#my-info'); await health('#mine-health .combat-health', 1, true);
    await capture('03-protected-health-panel.png'); await click('#mine-close');
    const pixels = await evaluate('__combatQA.compareAura()');
    assert(pixels.bodyPixels > 100, 'Body sprite was not drawn');
    assert.equal(pixels.bodyDiff, 0, 'Protection changed body geometry or colors');
    assert.equal(pixels.offDiff, 0, 'Disabled protection still painted aura pixels');
    assert(pixels.auraDiff > 100 && pixels.edgePixels > 150, 'The cocoon should be visible around the body');
    assert(pixels.motionPixels > 100, 'The light ripples and fragments should animate');
    assert(pixels.transparentOutside && pixels.faceOverlayMax < 50, 'The surroundings are transparent and the face remains readable');
    assert.equal(pixels.truceDrawn, false, 'Truce still permits an aura');
    for (const [name, value] of [['04-protection-off.png', pixels.plain], ['05-protection-on.png', pixels.withAura]]) {
      writeFileSync(join(out, name), Buffer.from(value.split(',')[1], 'base64')); screenshots.push(name);
    }
    delete pixels.plain; delete pixels.withAura; observations.pixels = pixels;
  });
  await check('Protection expires on server time and notifications are not replayed by repeated snapshots', async () => {
    const notices = await evaluate('__combatQA.toast.length');
    for (let i = 0; i < 4; i++) await state();
    await delay(1200);
    assert.equal(await evaluate('__combatQA.toast.length'), notices, 'Repeated snapshots replayed the same toast');
    const snapshot = await state();
    await api('/api/test/advance', { ms: snapshot.me.protectUntil - snapshot.serverTime + 100 });
    await waitFor('protection expiry snapshot', async () => !(await state()).me.protected);
    const expiry = await evaluate('performance.now()');
    await waitPage(`__combatQA.auras.some(s=>s.id===${self.id}&&s.at>${expiry}&&!s.protected&&!s.drawn)`);
    await click('#my-info'); await health('#mine-health .combat-health', 1);
    await capture('06-protection-expired.png'); await click('#mine-close');
  });
  await check('Life zero shows a truce notice and empty health, with no protection aura', async () => {
    await skill(bads[1], self);
    await waitPage(`__combatQA.toast.some(e=>/休战/.test(e.text)&&/探索|答题/.test(e.text))`);
    const snapshot = await state();
    assert.equal(snapshot.me.hp, 0); assert.equal(snapshot.me.alive, false); assert.equal(snapshot.me.protected, false);
    assert(snapshot.me.pending.some(event => event.type === 'truce' && /休战/.test(event.text) && /探索/.test(event.text)));
    const since = await evaluate('performance.now()');
    await waitPage(`__combatQA.auras.some(s=>s.id===${self.id}&&s.at>${since}&&s.alive===false&&!s.drawn)`);
    await click('#my-info'); await health('#mine-health .combat-health', 0, false, true);
    const copy = await evaluate(`document.getElementById('mine').innerText`);
    assert(/休战/.test(copy) && /探索/.test(copy)); assert(!/S-ID|身份码/.test(copy));
    await capture('07-truce-health.png'); await click('#mine-close');
    await capture('07-truce-game.png');
  });
  await check('A truce player still moves and performs a real animated J hit without losing more health', async () => {
    await evaluate(`document.getElementById('office').focus()`);
    const before = await state(), start = before.players.find(p => p.id === self.id);
    await key('ArrowRight', 'ArrowRight', 39, 'keyDown');
    try { await waitFor('truce keyboard movement', async () => (await state()).players.find(p => p.id === self.id).x > start.x + 8); }
    finally { await key('ArrowRight', 'ArrowRight', 39, 'keyUp'); }
    const moved = (await state()).players.find(p => p.id === self.id);
    assert.equal(moved.hp, 0); assert.equal(moved.alive, false);
    await api('/api/test/place', { playerId: otherGood.id, floorId: 1, zoneId: null, x: moved.x + 15, y: moved.y });
    await delay(120);
    const since = await evaluate('performance.now()');
    await key('j', 'KeyJ', 74);
    await waitPage(`__combatQA.frames.some(f=>f.at>${since}&&Number.isFinite(f.age)&&f.age>=0&&f.age<WORLD.ATTACK_ANIMATION_MS)`);
    await waitFor('real J target reaction', async () => (await state(tokens.get(otherGood.id))).me.combat.stunUntil > (await state()).serverTime);
    const after = await state();
    assert.equal(after.me.hp, 0); assert.equal(after.me.protected, false);
    await capture('08-truce-movement-j.png');
    assert((await evaluate('__combatQA.frames')).some(f => f.p.moving), 'Actual rendered player never moved');
  });
  await check('Rules describe random factions, public health, neutral auras and continued truce play', async () => {
    const config = (await state()).rules;
    await click('#rules-toggle');
    const rules = await evaluate(`document.getElementById('rules-view').innerText`);
    for (const pattern of [/独立随机分配/, /血条.*公开|公开.*血条/, /阵营与技能仅本人/, /半透明光茧/, /休战/])
      assert(pattern.test(rules), 'Missing rules contract ' + pattern);
    assert.doesNotMatch(rules, /阅读规则时游戏仍在继续|坏人概率|首位玩家同样随机|以场务配置为准|额外击杀奖励|已取消金币|名单由场务独立维护|休战玩家以轻度半透明|专项测试场/);
    assert(!/对抗生命仅本人|公开身份码|三段身份码|S-ID已公开/.test(rules), 'Rules retained removed identity-code combat');
    assert.match(rules, new RegExp(`每场入场时拥有 ${config.initialHp} 格对抗生命`));
    assert.equal(await evaluate(`document.getElementById('rules-good-recovery').textContent`), '使用后 1 分钟 30 秒 恢复');
    assert.equal(await evaluate(`document.getElementById('rules-clue-interval').textContent.trim()`), '每隔 2 分钟');
    await click('#rules-close');
  });
  await check('F1 opens and closes collision diagnostics when development mode is enabled', async () => {
    await key('F1', 'F1', 112);
    assert.equal(await evaluate('SID.tmjDebug.isVisible()'), true);
    await key('F1', 'F1', 112);
    assert.equal(await evaluate('SID.tmjDebug.isVisible()'), false);
  });
  await check('A pending quiz survives close, real K reopen, 61 seconds and browser reload, then awards only once', async () => {
    observations.combatNotifications = await evaluate('__combatQA.toast');
    const container = W.floorContainers(1)[0];
    assert(container, 'Missing floor container for quiz acceptance');
    await api('/api/test/place', { playerId: self.id, floorId: 1, zoneId: null, x: container.x, y: container.y });
    const before = await state();
    const opened = await api('/api/search/start', {
      commandId: 'combat-ui-pending-' + Date.now(), containerId: container.id,
      roundId: before.roundId, expectedFloorRevision: before.me.floorRevision, forceMode: 'quiz', questionType: 'single'
    }, ownToken);
    assert.equal(opened.status, 200, JSON.stringify(opened.data));
    assert.equal(opened.data.mode, 'quiz');
    assert(!('answer' in opened.data.quiz), 'Server exposed quiz answer to browser');
    const question = require('./room/quiz.js').getQuizBank().find(question => question.id === opened.data.quiz.id);
    assert(question && question.type === 'single', 'Expected a deterministic built-in single-choice fixture');
    const openWithK = async () => {
      await evaluate(`document.getElementById('office').focus()`);
      await key('k', 'KeyK', 75);
      await waitPage(`!document.getElementById('loot').hidden&&!!document.querySelector('#loot .quiz-stem')&&!document.getElementById('loot-take').hidden`);
      assert.equal(await evaluate(`document.querySelector('#loot .quiz-stem').textContent`), opened.data.quiz.stem);
      const record = await evaluate(`__combatQA.search.filter(s=>s.path==='/api/search/start').at(-1)`);
      assert.equal(record.sessionId, opened.data.sessionId, 'Reopen rerolled the pending session');
      assert.equal(record.quiz.id, opened.data.quiz.id, 'Reopen rerolled the pending question');
      assert(!('answer' in record.quiz), 'Resumed question exposes its answer');
    };
    await waitPage(`__combatQA.frames.some(f=>Math.hypot(f.p.x-${container.x},f.p.y-${container.y})<1)`);
    await openWithK();
    await click('#loot-close'); await openWithK(); await click('#loot-close');
    await api('/api/test/advance', { ms: 61000 });
    assert((await state()).me.exploration.pendingQuizContainerIds.includes(container.id));
    await call('Page.reload', { ignoreCache: true });
    // The annual review opens once per day; reloading resumes the game directly.
    await waitPage(`document.readyState==='complete'&&!document.getElementById('annual-review-overlay').open&&document.getElementById('join-page').hidden&&!!window.SID?.combatVisuals`);
    await installVisualProbe();
    await waitPage(`__combatQA.frames.length>2`);
    await openWithK();
    await capture('09-resumed-quiz.png');
    const ownRankingScore = `(() => {
      const row = [...document.querySelectorAll('#ranking-items .ranking-row')].find(row =>
        row.querySelector('.ranking-name').textContent === ${JSON.stringify(self.name)});
      return row ? Number(row.querySelector('.ranking-score').textContent) : null;
    })()`;
    await click('#ranking-toggle');
    const scoreBefore = (await state()).me.score;
    await waitPage(`${ownRankingScore} === ${scoreBefore}`);
    await click(`#loot [data-option-key="${question.answer}"]`);
    await click('#loot-take');
    await waitPage(`__combatQA.search.some(s=>s.path==='/api/search/take'&&s.ok&&s.correct)`);
    const after = await state();
    assert.equal(after.me.score, scoreBefore + W.EXPLORE.quizPoints);
    await waitPage(`${ownRankingScore} === ${after.me.score}`);
    await click('#ranking-close');
    assert(!after.me.exploration.pendingQuizContainerIds.includes(container.id));
    const duplicate = await api('/api/search/take', { sessionId: opened.data.sessionId, answer: question.answer }, ownToken);
    assert.equal(duplicate.data.ok, false, 'Duplicate answer was accepted');
    assert.equal((await state()).me.score, after.me.score, 'Duplicate answer awarded points');
    observations.quiz = { containerId: container.id, questionId: opened.data.quiz.id, sessionId: opened.data.sessionId, scoreBefore, scoreAfter: after.me.score, duplicateStatus: duplicate.status };
    await capture('10-quiz-settled.png');
  });
  await check('A late quiz response cannot replace a newer container panel', async () => {
    await click('#loot-close');
    const [containerA, containerB] = W.floorContainers(1).slice(1, 3);
    assert(containerA && containerB, 'Need two additional containers for the response-order check');
    const prepare = async (container, questionType) => {
      await api('/api/test/place', { playerId: self.id, floorId: 1, zoneId: null, x: container.x, y: container.y });
      const snapshot = await state();
      const response = await api('/api/search/start', {
        commandId: 'combat-ui-order-' + container.id + '-' + Date.now(), containerId: container.id,
        roundId: snapshot.roundId, expectedFloorRevision: snapshot.me.floorRevision, forceMode: 'quiz', questionType
      }, ownToken);
      assert.equal(response.status, 200, JSON.stringify(response.data));
      assert.equal(response.data.mode, 'quiz');
      return response.data;
    };
    const a = await prepare(containerA, 'single'), b = await prepare(containerB, 'judge');
    assert.notEqual(a.quiz.stem, b.quiz.stem, 'The two UI fixtures must have distinguishable questions');
    await evaluate(`(()=>{const original=window.fetch;const qa=window.__lateQuiz={held:false,released:false};const gate=new Promise(resolve=>qa.release=()=>{qa.released=true;resolve();});window.fetch=async function(input,options){const response=await original.apply(this,arguments);let body;try{body=JSON.parse(options?.body||'{}');}catch{}const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;if(path==='/api/search/start'&&body?.containerId===${JSON.stringify(containerA.id)}&&!qa.held){qa.held=true;await gate;}return response;};})()`);
    const placeAndK = async container => {
      await api('/api/test/place', { playerId: self.id, floorId: 1, zoneId: null, x: container.x, y: container.y });
      const at = await evaluate('performance.now()');
      await waitPage(`__combatQA.frames.some(f=>f.at>${at}&&Math.hypot(f.p.x-${container.x},f.p.y-${container.y})<1)`);
      await evaluate(`document.getElementById('office').focus()`);
      await key('k', 'KeyK', 75);
    };
    await placeAndK(containerA);
    await waitPage('__lateQuiz.held');
    assert.equal(await evaluate(`document.querySelector('#loot .quiz-stem')`), null, 'The delayed response resolved before the ownership switch');
    await click('#loot-close');
    await placeAndK(containerB);
    await waitPage(`document.querySelector('#loot .quiz-stem')?.textContent===${JSON.stringify(b.quiz.stem)}`);
    const title = await evaluate(`document.getElementById('loot-title').textContent`);
    await evaluate('__lateQuiz.release()');
    await delay(180);
    assert.equal(await evaluate(`document.querySelector('#loot .quiz-stem').textContent`), b.quiz.stem, 'Old A response overwrote B question');
    assert.equal(await evaluate(`document.getElementById('loot-title').textContent`), title, 'Old A response overwrote B container title');
    assert.equal(await evaluate(`document.getElementById('loot-take').disabled`), false, 'Old A cleanup disabled B answer submission');
    assert.equal((await state()).me.score, observations.quiz.scoreAfter, 'Opening pending panels changed the settled score');
    observations.responseOrder = { containerA: containerA.id, containerB: containerB.id, questionA: a.quiz.id, questionB: b.quiz.id, lateReleased: true, displayedQuestion: b.quiz.id };
    await capture('11-late-response-isolated.png');
  });
  await check('Health and protection UI load without script or static-resource errors', async () => {
    assert.deepEqual(errors, []); assert.deepEqual(failedResources, []);
  });
  await check('Connection status stays visible offline and clears after snapshots resume', async () => {
    const connectionState = `document.getElementById('connection-status').dataset.state`;
    const network = { latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
    try {
      await call('Network.emulateNetworkConditions', { ...network, offline: true });
      await waitPage(`${connectionState} === 'offline'`);
      await delay(3200);
      assert.equal(await evaluate(connectionState), 'offline');
      assert.ok(await evaluate(`document.getElementById('connection-status').getBoundingClientRect().height > 0`));
    } finally {
      await call('Network.emulateNetworkConditions', { ...network, offline: false });
    }
    await waitPage(`${connectionState} === 'recovered'`);
    await waitPage(`${connectionState} === ''`);
  });
} catch (error) {
  results.push({ name: activeCheck, passed: false, error: error.stack });
  try { if (socket?.readyState === WebSocket.OPEN) await capture('failure.png'); } catch {}
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  try { if (socket?.readyState === WebSocket.OPEN) observations.visual = await evaluate(`window.__combatQA?{frames:__combatQA.frames.slice(-12),auras:__combatQA.auras.slice(-12),bars:__combatQA.bars.slice(-12),toast:__combatQA.toast}:null`); } catch {}
  writeFileSync(join(out, 'verification.json'), JSON.stringify({ url: base, results, errors, failedResources, screenshots, observations, serverLog }, null, 2));
  for (const task of pending.values()) task.no(Error('Browser closed'));
  socket?.close(); browser?.kill(); server?.kill();
}
console.log(`${results.filter(result => result.passed).length}/${results.length} combat UI checks passed.`);
