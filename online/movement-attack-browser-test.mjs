// 零依赖真实 Chrome / 原生 CDP；复用项目现有浏览器测试的服务、输入、截图与清理脚手架。
// 仅观察原始绘制与真实输入，不修改游戏状态机、计时、网络响应或动画逻辑。
import assert from 'node:assert/strict';
import { MODULE_FILES, GUARD_PATHS } from './test-helpers/guard-files.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';

const online = dirname(fileURLToPath(import.meta.url)), root = dirname(online);
const outputs = join(root, 'outputs'), profile = join(outputs, '.movement-browser-profile');
const reportPath = join(outputs, 'movement-attack-browser-results.json');
const chromePath = process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const results = [], runtimeErrors = [], consoleErrors = [], cleanup = {}, screenshots = [], sheets = [], network = [];
// 重构适配：分包后守卫必须覆盖新模块目录。
const protectedFiles = GUARD_PATHS;
const hashes = async () => Object.fromEntries(await Promise.all(protectedFiles.map(async f => [f, createHash('sha256').update(await readFile(join(root, f))).digest('hex')])));
const beforeHashes = await hashes();
const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
let server, chrome, ws, cdpSequence = 0, serverLog = '', chromeLog = '', fatalError, browserVersion, token, selfId, target;
const inflight = new Map();
async function waitFor(label, predicate, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await predicate(); if (value) return value; await pause(20); }
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
const state = async (session = token) => (await api('/api/state', undefined, session)).data;
const pub = (s, id = selfId) => s.players.find(p => p.id === id);
function send(method, params = {}) {
  return new Promise((ok, no) => { const id = ++cdpSequence; const timer = setTimeout(() => { inflight.delete(id); no(Error(`CDP 超时：${method}`)); }, 12000); inflight.set(id, { ok: r => { clearTimeout(timer); ok(r); }, no: e => { clearTimeout(timer); no(e); } }); ws.send(JSON.stringify({ id, method, params })); });
}
async function ev(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
async function click(selector) {
  const p = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)throw Error('控件不存在或隐藏');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
}
async function open(url, predicate) {
  await send('Page.navigate', { url });
  await waitFor('真实页面加载', async () => ev(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'&&(${predicate})`).catch(() => false));
  await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
}
async function screenshot(name) {
  const path = join(outputs, name), s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path, Buffer.from(s.data, 'base64')); screenshots.push(resolve(path)); return resolve(path);
}
const dirs = [
  { input: 'right', sprite: 'right', key: 'ArrowRight', code: 'ArrowRight', vk: 39, axis: 'x', sign: 1 },
  { input: 'left', sprite: 'left', key: 'ArrowLeft', code: 'ArrowLeft', vk: 37, axis: 'x', sign: -1 },
  { input: 'up', sprite: 'back', key: 'ArrowUp', code: 'ArrowUp', vk: 38, axis: 'y', sign: -1 },
  { input: 'down', sprite: 'front', key: 'ArrowDown', code: 'ArrowDown', vk: 40, axis: 'y', sign: 1 }
];
const j = { key: 'j', code: 'KeyJ', vk: 74 };
const down = (d, autoRepeat = false) => send('Input.dispatchKeyEvent', { type: 'keyDown', key: d.key, code: d.code, windowsVirtualKeyCode: d.vk, autoRepeat });
const up = d => send('Input.dispatchKeyEvent', { type: 'keyUp', key: d.key, code: d.code, windowsVirtualKeyCode: d.vk });
async function tap(d = j) { await down(d); await up(d); }
async function focus() { await ev(`document.querySelector('#office').focus()`); }
const demoSnap = () => ev('__sidTest.snapshot()');
const player = async mode => {
  if (mode === '离线') return (await demoSnap()).self;
  const rendered = await waitFor('联机真实绘制帧',async()=>ev('__movementQA.records.at(-1)?.p'));
  const authoritative = pub(await state());
  return { ...authoritative, moving: rendered.moving, walk: rendered.walk };
};
async function moveTo(x, y, session = token) {
  try {
    for (const [axis, goal] of [['x', x], ['y', y]]) {
      let direction, lastPosition, lastChange = Date.now();
      await waitFor(`真实 /api/input ${axis} 到 ${goal}`, async () => {
        const s = await state(session), p = pub(s, s.me.id), diff = goal - p[axis];
        if (Math.abs(diff) <= 5) return true;
        if (p[axis] !== lastPosition) { lastPosition = p[axis]; lastChange = Date.now(); }
        assert.ok(Date.now() - lastChange < 1800, '真实移动路径被阻挡');
        const next = axis === 'x' ? (diff > 0 ? 'right' : 'left') : (diff > 0 ? 'down' : 'up');
        if (next !== direction) { assert.equal((await api('/api/input', { [next]: true }, session)).data.ok, true); direction = next; }
        return false;
      }, 14000);
      await api('/api/input', {}, session);
    }
  } finally { await api('/api/input', {}, session); }
}
async function terminate(child, label) {
  if (!child) { cleanup[label] = { started: false }; return; }
  if (child.exitCode === null && child.signalCode === null) {
    const exit = new Promise(r => child.once('exit', r)); child.kill();
    let timer; await Promise.race([exit, new Promise((_, no) => { timer = setTimeout(() => no(Error(`${label} 未退出`)), 5000); })]).finally(() => clearTimeout(timer));
  }
  cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode, signal: child.signalCode };
}

// 原绘制完整执行。记录 fillRect 的真实几何，复制游戏画布真实像素；另在离屏画布按同一入参复绘供透明背景检查。
async function observe(id, mode) {
  await ev(`(()=>{
    const original=WORLD.drawCharacterBody;
    const qa=window.__movementQA={id:${JSON.stringify(id)},mode:${JSON.stringify(mode)},records:[],frames:{},capture:null,original};
    qa.render=(p,clock,age,direction)=>{
      const c=document.createElement('canvas');c.width=128;c.height=112;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
      original(g,{...p,x:64,y:94},clock,age,direction);return c;
    };
    qa.metrics=c=>{
      const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
      const woodColors=['986039','75472d','ddb078','a36b40','bd8750'];const wood=Object.fromEntries(woodColors.map(k=>[k,0]));
      let woodX=0,woodY=0,woodCount=0,opaque=0;
      for(let i=0;i<d.length;i+=4){if(d[i+3])opaque++;if(d[i+3]!==255)continue;const hex=[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('');if(hex in wood){wood[hex]++;woodCount++;woodX+=(i/4)%c.width;woodY+=Math.floor(i/4/c.width);}}
      return {wood,woodCount,woodCentroid:woodCount?{x:woodX/woodCount,y:woodY/woodCount}:null,opaque};
    };
    WORLD.drawCharacterBody=function(g,p,clock,age,direction){
      if(p.id!==qa.id)return original.apply(this,arguments);
      const rects=[],native=g.fillRect;
      g.fillRect=function(x,y,w,h){rects.push({x,y,w,h,color:this.fillStyle,alpha:this.globalAlpha});return native.call(this,x,y,w,h);};
      try{original.apply(this,arguments);}finally{g.fillRect=native;}
      const active=Number.isFinite(age)&&age>=0&&age<WORLD.ATTACK_ANIMATION_MS;
      const r={at:performance.now(),p:JSON.parse(JSON.stringify(p)),clock,age,direction,active};
      if(active){
        const c=qa.render(p,clock,age,direction);r.metrics=qa.metrics(c);
        // 朝后攻击先画，再被背部遮挡，因此不能假设手掌是整个角色的最后三笔。
        const gripIndex=rects.findIndex((q,i)=>{
          const palm=rects[i+1],edge=rects[i+2];
          return q.w===6&&q.h===6&&palm?.w===4&&palm?.h===4&&palm.x===q.x+1&&palm.y===q.y+1&&edge?.w===4&&edge?.h===1&&edge.x===palm.x&&edge.y===palm.y+3;
        });
        const grip=rects.slice(gripIndex,gripIndex+3);r.grip=grip;
        const palm=grip[1],center={x:palm.x+2,y:palm.y+2};
        const covers=(q)=>center.x>=q.x&&center.x<q.x+q.w&&center.y>=q.y&&center.y<q.y+q.h;
        const beforeGrip=rects.slice(0,gripIndex);
        r.handleAtGrip=beforeGrip.some(q=>q.color==='#986039'&&covers(q));
        r.armAtGrip=beforeGrip.some(q=>q.w===4&&q.h===4&&q.color!=='#986039'&&covers(q));
        r.armRects=rects.filter(q=>q.y>=Math.round(p.y)-48&&q.y<Math.round(p.y)-8&&q.w<=7&&q.h<=7).length;
      }
      qa.records.push(r);if(qa.records.length>2500)qa.records.shift();
      if(qa.capture){
        const phase=active?(age<65?'起手':age<125?'蓄力':age<200?'挥出':'收手'):'待机';
        const effective=active?direction:p.spriteFacing;
        const key=qa.capture+'-'+effective+'-'+phase;
        if(!qa.frames[key]&&(!qa.capture.startsWith('攻击')||active)){
          const c=qa.render(p,clock,age,direction),t=g.getTransform();
          const source=document.createElement('canvas');source.width=128;source.height=112;
          source.getContext('2d').drawImage(g.canvas,Math.round(p.x+t.e)-64,Math.round(p.y+t.f)-94,128,112,0,0,128,112);
          qa.frames[key]={key,mode:qa.mode,phase,direction:effective,age,p:r.p,clock,png:c.toDataURL('image/png'),gamePng:source.toDataURL('image/png'),metrics:qa.metrics(c),gameMetrics:qa.metrics(source),grip:r.grip};
        }
      }
    };
  })()`);
}
const records = () => ev('__movementQA.records');
async function capture(label) { await ev(`__movementQA.capture=${JSON.stringify(label)}`); }
async function clearRecords() { await ev('__movementQA.records=[]'); }
async function readyAttack(mode) {
  await waitFor('真实冷却结束', async () => mode === '离线' ? ev('__sidTest.games().combat.attackUntil<=__sidTest.snapshot().clock') : ((s) => s.me.combat.attackUntil <= s.serverTime)(await state()), 4000);
  await focus();
}
async function keyboardMove(mode, d) {
  await focus(); const before = await player(mode);
  await down(d);
  try {
    await waitFor('真实键盘位移与四向外观 ' + d.input, async () => { const p = await player(mode); return p.spriteFacing === d.sprite && (p[d.axis] - before[d.axis]) * d.sign > 5; });
    await waitFor('绘制调用使用实际四向', async () => ev(`__movementQA.records.some(r=>r.p.spriteFacing===${JSON.stringify(d.sprite)}&&r.p.moving)`));
  } finally { await up(d); }
  const releasedAt=await ev('performance.now()');
  await waitFor('松键后权威停止且插值完成', async () => {
    const recent=await ev('__movementQA.records.slice(-6)');
    if(recent.length<6||recent.some(r=>r.at<releasedAt+100||r.p.moving))return false;
    const p=await player(mode),r=recent.at(-1).p;
    return !p.moving&&Math.hypot(p.x-r.x,p.y-r.y)<0.6;
  });
  const stopped = await player(mode); await pause(160); const after = await player(mode);
  assert.equal(after.spriteFacing, d.sprite); assert.equal(after.x, stopped.x); assert.equal(after.y, stopped.y); assert.equal(after.walk, stopped.walk);
  const drawn = await ev('__movementQA.records.at(-1).p'); assert.equal(drawn.spriteFacing, d.sprite); assert.equal(drawn.moving, false);
  return { before: { x: before.x, y: before.y }, stopped: { x: after.x, y: after.y, walk: after.walk, spriteFacing: after.spriteFacing } };
}
async function fourWay(mode) {
  for (const d of dirs) {
    await test(`${mode} 四向真实键盘 ${d.input} / 停止保持 ${d.sprite}`, async () => {
      await clearRecords(); await capture('四向'); const detail = await keyboardMove(mode, d);
      await screenshot(`movement-${mode === '离线' ? 'offline' : 'online'}-${d.sprite}.png`);
      if (mode === '联机') {
        const inputs = network.filter(n => n.url.endsWith('/api/input') && n.postData);
        assert.ok(inputs.some(n => JSON.parse(n.postData)[d.input] === true), '键盘应触发真实 /api/input');
        detail.authoritativeFacing = pub(await state()).spriteFacing;
      }
      return detail;
    });
  }
}
async function fourAttacks(mode) {
  for (const d of dirs) {
    await test(`${mode} ${d.sprite} J 木锤四阶段 / 手臂握点同步 / 260ms 收尾`, async () => {
      await readyAttack(mode); await keyboardMove(mode, d); await clearRecords(); await capture('攻击');
      await tap();
      await waitFor('真实 J 动画出现', async () => ev('__movementQA.records.some(r=>r.active)'));
      // 截图直接来自真实页面；对照图在每个真实绘制帧同步采集，不暂停或推进时钟。
      await screenshot(`movement-${mode === '离线' ? 'offline' : 'online'}-attack-${d.sprite}.png`);
      await waitFor('动画结束并回到原朝向', async () => ev('__movementQA.records.some(r=>r.active)&&!__movementQA.records.at(-1).active'));
      const a = (await records()).filter(r => r.active);
      assert.ok(a.length >= 4, '必须采集多帧真实动画');
      assert.ok(a.every(r => r.age >= 0 && r.age < 260 && r.direction === d.sprite));
      const phases = await ev(`Object.values(__movementQA.frames).filter(f=>f.key.startsWith('攻击-${d.sprite}-')).map(f=>({phase:f.phase,age:f.age,metrics:f.metrics,gameMetrics:f.gameMetrics,grip:f.grip}))`);
      assert.equal(new Set(phases.map(f => f.phase)).size, 4, '起手、蓄力、挥出、收手应均有真实采样');
      assert.ok(phases.every(f=>f.gameMetrics.woodCount>10),'真实游戏画布每个阶段应存在木锤像素，不仅是离屏复绘');
      for (const r of a) {
        assert.ok(r.metrics.woodCount > 10, '真实入参复绘应有暖木色锤头/柄像素');
        assert.equal(r.grip.length, 3);
        const [outline, palm, edge] = r.grip;
        assert.equal(outline.w, 6); assert.equal(outline.h, 6); assert.equal(palm.w, 4); assert.equal(palm.h, 4);
        assert.equal(palm.x, outline.x + 1); assert.equal(palm.y, outline.y + 1);
        assert.equal(edge.x, palm.x); assert.equal(edge.y, palm.y + 3);
        assert.ok(r.armRects > 20, '袖口、前臂、柄、掌应由连续多块几何共同绘制');
        assert.equal(r.handleAtGrip,true,'木柄应穿过真实手掌中心握点');
        assert.equal(r.armAtGrip,true,'前臂末端应连接真实手掌握点');
      }
      assert.ok(new Set(a.map(r => `${r.grip[1].x},${r.grip[1].y}`)).size >= 3, '手掌应随挥击移动而非静止悬锤');
      assert.ok(new Set(a.map(r => `${Math.round(r.metrics.woodCentroid.x)},${Math.round(r.metrics.woodCentroid.y)}`)).size >= 3, '木锤应随手臂移动');
      const last = (await records()).at(-1); assert.equal(last.active, false); assert.equal(last.p.spriteFacing, d.sprite);
      return { frames: a.length, firstAgeMs: a[0].age, lastActiveAgeMs: a.at(-1).age, firstInactiveAfterMs: last.age, phases };
    });
  }
}
async function lockDirection(mode) {
  await test(`${mode} 挥击中转向：攻击朝向锁定、结束恢复移动朝向`, async () => {
    await readyAttack(mode); await keyboardMove(mode, dirs[0]); await clearRecords(); await capture(null);
    await tap();
    await waitFor('攻击起手', async () => ev('__movementQA.records.some(r=>r.active)'));
    await down(dirs[2]);
    try {
      await waitFor('攻击中真实向上转身', async () => ev(`__movementQA.records.some(r=>r.active&&r.p.spriteFacing==='back'&&r.direction==='right')`), 1200);
    } finally { await up(dirs[2]); }
    await waitFor('攻击结束恢复 back', async () => ev(`!__movementQA.records.at(-1).active&&__movementQA.records.at(-1).p.spriteFacing==='back'`));
    const a = (await records()).filter(r => r.active);
    assert.ok(a.every(r => r.direction === 'right'));
    let authoritative;
    if (mode === '联机') { const p = pub(await state()); assert.equal(p.lastAttackDirection, 'right'); assert.equal(p.spriteFacing, 'back'); assert.deepEqual(p.lastAttackFacing, { x: 1, y: 0 }); authoritative = p.lastAttackDirection; }
    return { activeFrames: a.length, turnedWhileActive: a.filter(r => r.p.spriteFacing === 'back').length, authoritative };
  });
}
async function cooldown(mode) {
  await test(`${mode} 连按/长按 J 不重置动画与 CD；1200ms 后可再次空挥`, async () => {
    await readyAttack(mode); await clearRecords(); await capture(null);
    await down(j);
    try {
      await waitFor('长按 J 首次攻击', async () => ev('__movementQA.records.some(r=>r.active)'));
      const first = mode === '离线' ? await ev('__sidTest.games().combat.attackUntil') : (await state()).me.combat.attackUntil;
      if (mode === '离线') {
        const frame=await ev('__movementQA.records.find(r=>r.active)');
        const attackStart=frame.clock-frame.age/1000;
        assert.ok(Math.abs((first-attackStart)*1000-1200)<0.00001,'离线 CD 应精确为 1200ms');
      }
      else { const s = await state(); assert.equal(s.me.combat.attackUntil - s.me.combat.lastAttackAt, 1200); }
      for (let i = 0; i < 4; i++) await down(j, true);
      await up(j);
      for (let i = 0; i < 3; i++) await tap();
      const now = mode === '离线' ? await ev('__sidTest.games().combat.attackUntil') : (await state()).me.combat.attackUntil;
      assert.equal(now, first, '冷却期连按/重复键不得延长 CD');
      await waitFor('至少跨过动画结束', async () => ev('__movementQA.records.some(r=>r.active)&&!__movementQA.records.at(-1).active'));
      const firstFrames = (await records()).filter(r => r.active); for (let i = 1; i < firstFrames.length; i++) assert.ok(firstFrames[i].age + 2 >= firstFrames[i - 1].age, '连按不得重启动画（允许 SSE 时钟同步的 2ms 量化误差）');
      // 长按重复事件跨过冷却仍应被 repeat 保护阻止；真正松开再按才触发。
      await down(j, true); await readyAttack(mode); await down(j, true);
      assert.equal(mode === '离线' ? await ev('__sidTest.games().combat.attackUntil') : (await state()).me.combat.attackUntil, first);
      await up(j); await tap();
      const second = await waitFor('冷却后新的真实 J', async () => { const value = mode === '离线' ? await ev('__sidTest.games().combat.attackUntil') : (await state()).me.combat.attackUntil; return value > first ? value : false; });
      if (mode === '联机') { const s = await state(); assert.equal(s.me.combat.attackUntil - s.me.combat.lastAttackAt, 1200); }
      else assert.ok(second - first >= 1.2-1e-9 && second - first < 1.5,`冷却后新攻击间隔 ${(second-first)*1000}ms`);
      return { firstUntil: first, secondUntil: second, intervalMs: (second - first) * (mode === '离线' ? 1000 : 1), repeatEvents: 6, extraTaps: 3 };
    } finally { await up(j); }
  });
}
async function pixelChecks(mode) {
  await test(`${mode} 原绘制像素：左右严格镜像、前后不同、259ms 有木锤/260ms 消失`, async () => {
    const data = await ev(`(()=>{
      const qa=__movementQA,p={...qa.records.at(-1).p,x:64,y:94,moving:false,walk:0};
      const render=(dir,age)=>qa.render({...p,spriteFacing:dir},0,age,dir);
      const pixels=c=>c.getContext('2d').getImageData(0,0,128,112).data;
      const comparisons=[];
      for(const age of [null,0,57,130,210,259,260]){
        const a=pixels(render('right',age)),b=pixels(render('left',age));let different=0;
        for(let y=0;y<112;y++)for(let x=0;x<128;x++)for(let k=0;k<4;k++)if(a[(y*128+x)*4+k]!==b[(y*128+127-x)*4+k])different++;
        comparisons.push({age,different});
      }
      const front=pixels(render('front',null)),back=pixels(render('back',null));let frontBack=0;
      for(let i=0;i<front.length;i++)if(front[i]!==back[i])frontBack++;
      const boundary=['right','left','front','back'].map(dir=>({dir,before:qa.metrics(render(dir,259)),after:qa.metrics(render(dir,260)),idle:qa.metrics(render(dir,null))}));
      return {comparisons,frontBack,boundary,animation:WORLD.ATTACK_ANIMATION_MS,cooldown:WORLD.PLAY_CONFIG.attackCooldownMs};
    })()`);
    assert.equal(data.animation, 260); assert.equal(data.cooldown, 1200);
    assert.ok(data.comparisons.every(c => c.different === 0), '左右必须逐像素严格镜像');
    assert.ok(data.frontBack > 100, '正面与背面必须有实际像素差异');
    for (const b of data.boundary) { assert.ok(b.before.woodCount > 10); assert.equal(b.after.woodCount, b.idle.woodCount); assert.equal(b.idle.woodCount, 0); }
    return data;
  });
}
async function contactSheet(mode) {
  const data = await ev(`(async()=>{
    const qa=__movementQA,dirs=['right','left','back','front'],phases=['待机','起手','蓄力','挥出','收手'];
    const selected=dirs.flatMap(dir=>phases.map(phase=>Object.values(qa.frames).find(f=>f.direction===dir&&f.phase===phase&&f.key.startsWith(phase==='待机'?'四向':'攻击'))).filter(Boolean));
    const build=async(field)=>{
      const c=document.createElement('canvas');c.width=1800;c.height=1640;const g=c.getContext('2d');g.fillStyle='#151923';g.fillRect(0,0,c.width,c.height);g.imageSmoothingEnabled=false;
      g.fillStyle='#f4eee4';g.font='bold 26px sans-serif';g.fillText(qa.mode+' · '+(field==='png'?'真实绘制入参 / 透明背景复绘':'真实游戏画布即时裁剪')+' · 3倍像素放大',24,38);
      g.font='18px sans-serif';g.fillText('全部来自真实键盘与自然时钟；不暂停、不加速、不替换游戏逻辑。阶段标注为实际采样 age。',24,68);
      for(let i=0;i<selected.length;i++){
        const f=selected[i],col=phases.indexOf(f.phase),row=dirs.indexOf(f.direction),x=20+col*354,y=98+row*382;
        g.fillStyle='#232b39';g.fillRect(x,y,340,366);g.fillStyle='#f4eee4';g.font='18px sans-serif';g.fillText(f.direction+' · '+f.phase+(f.age==null?'':' · '+f.age.toFixed(1)+'ms'),x+8,y+24);
        const img=new Image();img.src=f[field];await img.decode();g.drawImage(img,x-22,y+30,384,336);
      }
      return c.toDataURL('image/png');
    };
    return {count:selected.length,frames:selected.map(({png,gamePng,...f})=>f),isolated:await build('png'),game:await build('gamePng')};
  })()`);
  assert.equal(data.count, 20, '对照图应有四向 × 待机/四阶段的完整真实采样');
  const prefix = `movement-${mode === '离线' ? 'offline' : 'online'}`;
  const isolated = join(outputs, prefix + '-contact-sheet.png'), game = join(outputs, prefix + '-game-contact-sheet.png');
  await writeFile(isolated, Buffer.from(data.isolated.split(',')[1], 'base64')); await writeFile(game, Buffer.from(data.game.split(',')[1], 'base64'));
  sheets.push({ mode, isolated: resolve(isolated), game: resolve(game), frames: data.frames }); return { count: data.count, isolated, game };
}

try {
  // mkdir 前核验已有父目录；profile 独立且永久保留，不使用旧脚本的共享 profile。
  await readdir(root); await readdir(outputs); await mkdir(profile, { recursive: true });
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), SID_DEV: '1', SID_TEST: '0', SID_SSO: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.on('error', e => { serverLog += e.stack; }); server.stdout.on('data', d => { serverLog += d; }); server.stderr.on('data', d => { serverLog += d; });
  await waitFor('loopback 服务启动', async () => { if (server.exitCode !== null) throw Error(serverLog); return api('/api/state', undefined, null).then(r => r.status === 401).catch(() => false); });
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  chrome.on('error', e => { chromeLog += e.stack; }); chrome.stderr.on('data', d => { chromeLog = (chromeLog + d).slice(-8000); });
  const page = await waitFor('Chrome CDP 页面', async () => { if (chrome.exitCode !== null) throw Error(chromeLog); return fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).then(a => a.find(p => p.type === 'page')).catch(() => false); });
  ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && inflight.has(m.id)) { const p = inflight.get(m.id); inflight.delete(m.id); m.error ? p.no(Error(m.error.message)) : p.ok(m.result); }
    if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(m.params);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params);
    if (m.method === 'Network.requestWillBeSent' && /\/api\/(input|attack)$/.test(m.params.request.url)) network.push({ at: m.params.timestamp, url: m.params.request.url, postData: m.params.request.postData });
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }); await send('Page.bringToFront');
  browserVersion = await send('Browser.getVersion');
  await open(pathToFileURL(join(root, 'demo/index.html')).href + '?test', '!!window.__sidTest');
  await ev('__sidTest.reset();__sidTest.setPosition(450,340)'); await observe(0, '离线');
  await fourWay('离线'); await fourAttacks('离线'); await lockDirection('离线'); await cooldown('离线'); await pixelChecks('离线');
  await test('离线 真实 J 命中：hp/存活/筹码/公共日志不变、眩晕与僵直生效', async () => {
    await readyAttack('离线'); await keyboardMove('离线', dirs[0]); await ev('__sidTest.setPosition(620,407)');
    const before = await ev('({secret:__sidTest.secret(1),games:__sidTest.games(),logs:__sidTest.snapshot().logs})');
    await tap();
    await waitFor('键盘 J 眩晕目标', async () => ev('__sidTest.games().opponents.find(p=>p.id===1).stunUntil>__sidTest.snapshot().clock*1000'));
    const after = await ev('({secret:__sidTest.secret(1),games:__sidTest.games(),logs:__sidTest.snapshot().logs})');
    assert.deepEqual(after.secret, before.secret); assert.equal(after.games.chips, before.games.chips); assert.deepEqual(after.logs, before.logs);
    const victim = after.games.opponents.find(p => p.id === 1); assert.equal(victim.freezeUntil - victim.stunUntil, 200);
    assert.match(await ev(`document.querySelector('#combat-status').textContent`), /无伤害/);
    await screenshot('movement-offline-hit-no-damage.png'); return { hp: after.secret.hp, alive: after.secret.alive, chips: after.games.chips, stunUntil: victim.stunUntil, freezeUntil: victim.freezeUntil };
  });
  await test('离线 四向/挥击人工验收对照图完整', () => contactSheet('离线'));

  await open(base + '/', `!!document.querySelector('#join-page')&&!document.querySelector('#join-page').hidden`);
  await click('#nickname'); await send('Input.insertText', { text: '移动挥击验收' }); await click('#join-form button[type=submit]');
  await waitFor('真实浏览器入房', async () => ev(`document.querySelector('#join-page').hidden&&!!localStorage.getItem('sid_session_token')`));
  token = await ev(`localStorage.getItem('sid_session_token')`); selfId = (await state()).me.id;
  target = (await api('/api/join', { nickname: '无伤害验收目标' }, null)).data; assert.equal(target.ok, true);
  await observe(selfId, '联机');
  await waitFor('联机原绘制观察首帧',async()=>ev('__movementQA.records.length>0'));
  await fourWay('联机'); await fourAttacks('联机'); await lockDirection('联机'); await cooldown('联机'); await pixelChecks('联机');
  await test('联机 真实 /api/input 就位与键盘 J 命中：无伤害/不扣筹码/不写公共日志', async () => {
    await readyAttack('联机'); await moveTo(600,340); await moveTo(628,340,target.sessionToken);
    await keyboardMove('联机', dirs[0]);
    const before = await state(), victimBefore = (await state(target.sessionToken)).me, aChips = before.me.exploration.chips, bChips = victimBefore.exploration.chips;
    const requests = network.filter(n=>n.url.endsWith('/api/attack')).length;
    await clearRecords(); await tap();
    const hit = await waitFor('权威眩晕目标', async () => { const s=await state(),v=pub(s,target.playerId);return v.stunUntil>s.serverTime?{s,v}:false; });
    const victimAfter = (await state(target.sessionToken)).me;
    assert.equal(typeof victimBefore.hp,'number'); assert.equal(victimAfter.hp,victimBefore.hp); assert.equal(victimAfter.alive,victimBefore.alive); assert.equal(hit.v.freezeUntil-hit.v.stunUntil,200);
    assert.equal(hit.s.me.exploration.chips,aChips); assert.equal((await state(target.sessionToken)).me.exploration.chips,bChips);
    assert.deepEqual(hit.s.logs,before.logs); assert.equal(hit.s.me.combat.attackUntil-hit.s.me.combat.lastAttackAt,1200);
    assert.equal(network.filter(n=>n.url.endsWith('/api/attack')).length,requests+1,'J 应走真实 /api/attack');
    const freeze=hit.v.freezeUntil; await tap(); assert.equal(pub(await state(),target.playerId).freezeUntil,freeze);
    await screenshot('movement-online-hit-no-damage.png');
    return { hp:victimAfter.hp,alive:victimAfter.alive,stunUntil:hit.v.stunUntil,freezeUntil:freeze,cooldownMs:1200,attackRequestCount:1 };
  });
  await test('联机 四向/挥击人工验收对照图完整', () => contactSheet('联机'));
  await test('浏览器全程运行错误 0 / console.error 0 / 测试后门关闭', async () => {
    assert.deepEqual(runtimeErrors,[]); assert.deepEqual(consoleErrors,[]); assert.equal((await api('/api/test/state',undefined,null)).status,404);
    return { runtimeErrors:0,consoleErrors:0,testBackendDisabled:true };
  });
  const htmlPath=join(outputs,'movement-attack-contact-sheet.html');
  await writeFile(htmlPath,`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>四向与木锤挥击验收</title><style>body{background:#151923;color:#f4eee4;font:16px system-ui;margin:24px}img{max-width:100%;image-rendering:pixelated}section{margin:32px 0}a{color:#b9dbff}</style><h1>四向与木锤挥击验收</h1><p>真实键盘、自然时钟、共享原绘制。游戏截图与画布即时裁剪为真实像素；透明背景复绘使用记录到的原始入参，不替换游戏逻辑。260ms 边界检查是独立原绘制函数测试，并非伪造游戏帧。</p>${sheets.map(s=>`<section><h2>${s.mode}：真实游戏画布即时裁剪</h2><img src="${s.mode==='离线'?'movement-offline':'movement-online'}-game-contact-sheet.png"><h2>${s.mode}：相同真实入参的透明背景复绘</h2><img src="${s.mode==='离线'?'movement-offline':'movement-online'}-contact-sheet.png"></section>`).join('')}<h2>另存的真实完整游戏截图</h2>${screenshots.map(p=>`<p><a href="${p.split(/[\\/]/).at(-1)}">${p.split(/[\\/]/).at(-1)}</a></p>`).join('')}</html>`);
  sheets.push({html:resolve(htmlPath)});
} catch (e) { fatalError={message:e.message,stack:e.stack}; console.error('验收前置失败',e.stack); process.exitCode=1; }
finally {
  if(ws){await send('Browser.close').catch(()=>{});ws.close();}
  for(const [child,label] of [[chrome,'chrome'],[server,'httpServer']])try{await terminate(child,label);}catch(e){cleanup[label]={exited:false,error:e.message};}
  const afterHashes=await hashes(),changed=Object.keys(beforeHashes).filter(f=>beforeHashes[f]!==afterHashes[f]);
  results.push({name:'游戏源码与 README SHA-256 未变',pass:changed.length===0,detail:{changed}});
  results.push({name:'finally 关闭自己 Chrome/server 并保留独立 profile',pass:cleanup.chrome?.exited===true&&cleanup.httpServer?.exited===true,detail:cleanup});
  const summary={passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length,total:results.length};
  const report={date:new Date().toISOString(),engine:'Windows Chrome headless + managed Node / 零依赖原生 CDP',node:process.execPath,browser:browserVersion,environment:{SID_DEV:'1',SID_TEST:'0'},summary,results,runtimeErrors,consoleErrors,fatalError:fatalError??null,screenshots,sheets,profile:resolve(profile),cleanup,sourceHashes:{before:beforeHashes,after:afterHashes,changed},network,serverLog,chromeLog,limitations:['单一 Windows Chrome headless；不是物理设备测试','离线 ?test 接口仅用于初始摆位、读取状态，不用其 attack/key/advance/step 替代真实按键或真实计时','260ms 精确边界及严格镜像为独立调用原绘制函数的像素测试；真实动画阶段使用自然帧采样','对照图分为真实画布即时裁剪与同入参透明背景复绘；完整真实游戏截图另存','手掌/袖口/前臂同步由真实 fillRect 几何及随阶段变化的握点/木像素验证，最终视觉效果仍建议人工检查'],unresolvedIssues:[...results.filter(r=>!r.pass).map(r=>({name:r.name,error:r.error??'断言未通过'})),...(fatalError?[fatalError]:[])]};
  await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({...summary,fatalError:fatalError?.message??null,reportPath:resolve(reportPath),screenshots,sheets:sheets.map(({frames,...s})=>s),cleanup,changed},null,2));
  if(summary.failed||fatalError)process.exitCode=1;
}
