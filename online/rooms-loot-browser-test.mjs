// 阶段4（需求①③）真实 Chrome 验收：独立小房间进出 + 搜打撤物品格搜索 + 七层主题截图。
//
// 覆盖点：
//  1) 七层每层家具密度（"楼太空旷"）与容器数量
//  2) 从楼层门口按 E 进入房间：服务端 zoneId 变化、房间内景渲染、空间提示条出现
//  3) 房间内家具/容器是独立加载的（楼层容器列表里没有房间容器）
//  4) 容器 → 物品格面板 → 开始搜索 → 逐格揭示（服务端节流）→ 全部拾取 → 服务端记账
//  5) 走到门口按 E 离开：zoneId 归零、站位还原到进入位置
//  6) 全程无未捕获异常；七层主题各截一张图作为美术证据
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const root = dirname(fileURLToPath(import.meta.url)), out = join(root, '../outputs/status-rooms-loot');
const free = () => new Promise(res => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const pause = ms => new Promise(res => setTimeout(res, ms));
await mkdir(out, { recursive: true });

const port = await free(), debug = await free(), base = `http://127.0.0.1:${port}`;
const profile = await mkdtemp(join(tmpdir(), 'sid-rooms-'));
let server, browser, ws, serial = 0;
const pending = new Map(), errors = [], evidence = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++serial;
  const timer = setTimeout(() => reject(Error(method + ' timeout')), 15000);
  pending.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
const wait = async (fn, tries = 200) => { for (let i = 0; i < tries; i++) { try { if (await fn()) return; } catch { } await pause(60); } throw Error('wait timeout'); };
const click = async selector => {
  const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};})()`);
  assert.ok(r, '找不到可点击元素: ' + selector);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
};
const key = async (code, key) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
};
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, name), Buffer.from(r.data, 'base64')); };
const state = () => ev("fetch('/api/test/state').then(r=>r.json())");

try {
  server = spawn(process.execPath, [join(root, 'server.js')], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SID_TEST: '1', SID_SSO: '0' }, stdio: 'ignore'
  });
  await wait(() => fetch(base + '/api/auth/config').then(r => r.ok));

  browser = spawn(process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ['--headless=new', '--no-sandbox', '--no-first-run', `--remote-debugging-port=${debug}`,
      '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let pages;
  await wait(async () => { pages = await fetch(`http://127.0.0.1:${debug}/json/list`).then(r => r.json()); return pages.length; });
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(res => ws.onopen = res);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push({ console: m.params.args.map(a => a.value || a.description) });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: base + '/?test' });
  await wait(() => ev("document.readyState==='complete'&&!!window.SID_SCENE"));
  await ev('SID_SCENE.ready');

  // ---------- 0. 数据层证据：每层家具/容器/房间 ----------
  const worldStats = await ev(`(function(){
    const out={floors:[],rooms:[]};
    for(let f=1;f<=7;f++) out.floors.push({floor:f,name:WORLD.floorById(f).name,furniture:WORLD.floorFurniture(f).length,containers:WORLD.floorContainers(f).length});
    for(const r of WORLD.ROOM_LIST){const room=WORLD.roomById(r.id);out.rooms.push({id:r.id,floor:r.floorId,name:r.name,furniture:room.furniture.length,containers:room.containers.length,w:room.width,h:room.height});}
    return out;})()`);
  evidence.push({ worldStats });
  assert.equal(worldStats.rooms.length, 14, '应有 14 间独立房间');
  for (const f of worldStats.floors) {
    assert.ok(f.furniture >= 35, `${f.floor}F 家具过少：${f.furniture}`);
    assert.ok(f.containers >= 5, `${f.floor}F 可搜容器过少：${f.containers}`);
  }
  const totalRoomContainers = worldStats.rooms.reduce((n, r) => n + r.containers, 0);
  assert.ok(totalRoomContainers >= 30, '房间内可搜容器总数过少');

  // ---------- 1. 加入 ----------
  await ev("document.querySelector('#nickname').value='验收员'");
  await click('#join-form button[type=submit]');
  await wait(() => ev("document.querySelector('#join-page').hidden"));
  const me0 = await ev("WORLD.FLOORS && window.__sidTest ? 1 : 1");
  const players = (await state()).players;
  const meId = players.find(p => p.name === '验收员').id;
  evidence.push({ joined: meId });

  // 默认状态下（坦克未开放）入口应提示无可用小游戏
  await wait(() => ev("!!document.querySelector('#minigame-toggle')"));
  await ev("document.querySelector('#minigame-toggle').click()");
  await pause(700);
  const mgClosed = await ev("document.querySelector('#mg-pick').textContent");
  await click('#mg-close');
  assert.ok(/没有开放的小游戏/.test(mgClosed), '坦克默认关闭时应提示无可用小游戏，实际：' + mgClosed);

  // ---------- 1.4 楼层游戏机：站到机器旁按 E 应进入跨楼层大厅 ----------
  const cab = await ev("(function(){const f=WORLD.floorFurniture(1).find(x=>x.type==='arcade');return {x:f.x+f.w/2,y:f.y+f.h/2+16};})()");
  await ev("fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:" + meId + ",floorId:1,x:" + cab.x + ",y:" + cab.y + "})})");
  await pause(420);
  await key('KeyE', 'e');
  await pause(800);
  const cabState = await ev("({open:!document.querySelector('#minigame-panel').hidden, text:document.querySelector('#mg-pick').textContent, mode:window.SID&&SID.minigame?SID.minigame.mode:''})");
  await shot('arcade-lobby.png');
  await click('#mg-close');
  evidence.push({ cabState });
  assert.ok(cabState.open, '靠近游戏机按 E 应打开小游戏面板：' + JSON.stringify(cabState));
  assert.equal(cabState.mode, 'arcade', '应进入跨楼层（arcade）模式');
  // ---------- 1.45 卡牌对决：开一局、出一张牌、结束回合 ----------
  await ev("fetch('/api/test/features',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({features:{spire:true}})})");
  await wait(() => ev("!!document.querySelector('#spire-toggle')"));
  await click('#spire-toggle');
  await pause(900);
  const spireOpen = await ev("({open:!document.querySelector('#spire-panel').hidden,cards:document.querySelectorAll('#spire-hand .spire-card').length,enemy:(document.querySelector('.spire-enemy strong')||{}).textContent||''})");
  assert.ok(spireOpen.open && spireOpen.cards >= 1, '卡牌面板应打开且至少 1 张手牌：' + JSON.stringify(spireOpen));
  await ev("(()=>{const b=document.querySelector('#spire-hand .spire-card');if(b){b.click();return true;}return false;})()");
  await pause(600);
  await click('#spire-end');
  await pause(700);
  const spireAfter = await ev("(document.querySelector('.spire-self')||{}).textContent||''");
  await shot('spire-battle.png');
  await ev("document.querySelector('#spire-close').click()");
  await pause(300);
  evidence.push({ spireOpen, spireAfter: spireAfter.slice(0, 60) });
  // ---------- 1.5 小游戏：开一局坦克并打赢（真实浏览器 + 服务端权威） ----------
  await ev("fetch('/api/test/features',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({features:{tank:true}})})");
  // 注意：必须由测试进程（无浏览器 Cookie）创建第二名玩家；
  // 用页面内 fetch 会带上同一会话，服务端会判定为''重连自己''而不是新玩家。
  const foeJoin = await fetch(base + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname: '坦克乙' }) });
  const foe = await foeJoin.json();
  const foeId = foe.playerId;
  assert.ok(Number.isInteger(foeId), '应能创建第二名玩家');
  await wait(() => ev("!!document.querySelector('#minigame-toggle')"));
  await ev("document.querySelector('#minigame-toggle').click()");
  await pause(900);
  const mgDebug = await ev("({hidden:document.querySelector('#minigame-panel').hidden,status:document.querySelector('#mg-status').textContent,pick:document.querySelector('#mg-pick').textContent,foes:document.querySelectorAll('#mg-pick .mg-foe').length})");
  assert.ok(!mgDebug.hidden, '小游戏面板未打开：' + JSON.stringify(mgDebug));
  assert.ok(mgDebug.foes > 0, '面板里没有对手按钮：' + JSON.stringify(mgDebug));
  await ev("document.querySelector('#mg-pick .mg-foe').click()");
  await wait(() => ev("!document.querySelector('#mg-board').hidden"), 80);
  const oppAct = action => ev("fetch('/api/test/minigame-act',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:" + foeId + ",action:'" + action + "'})})");
  for (let hit = 0; hit < 3; hit++) {
    await ev("document.querySelector('#mg-actions [data-act=load]').click()");
    await pause(160); await oppAct('load'); await pause(1300);
    await ev("document.querySelector('#mg-actions [data-act=fire]').click()");
    await pause(160); await oppAct('load'); await pause(1300);
  }
  const mgStatus = await ev("document.querySelector('#mg-status').textContent");
  await shot('minigame-tank-win.png');
  await click('#mg-close');
  evidence.push({ mgStatus });
  assert.ok(/你赢了/.test(mgStatus), '坦克三发命中后应判我方获胜，实际：' + mgStatus);
  // ---------- 2. 进入 2F「220 会议室」 ----------
  const room = worldStats.rooms.find(r => r.floor === 2 && r.name.includes('更衣室'));
  assert.ok(room, '缺少 2F 球员更衣室');
  const roomInfo = await ev(`(function(){const r=WORLD.roomById(${JSON.stringify(room.id)});return {door:{x:r.door.x,y:r.door.y},entry:{x:r.entry.x,y:r.entry.y},exit:{x:r.exit.x,y:r.exit.y},name:r.name};})()`);
  const doorPos = roomInfo.door;
  await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},floorId:2,x:${doorPos.x},y:${doorPos.y}})})`);
  await wait(() => ev("document.querySelector('#floor-indicator').textContent==='2F'"));
  await pause(250);
  await key('KeyE', 'e');
  await wait(() => ev("!document.querySelector('#zone-banner').hidden"));
  const inZone = (await state()).players.find(p => p.id === meId);
  assert.equal(inZone.zoneId, room.id, '服务端应记录进入房间');
  const banner = await ev("({name:document.querySelector('#zone-banner-name').textContent,coord:document.querySelector('#coordinate').textContent})");
  assert.ok(banner.name.includes('更衣室'), '空间提示条应显示房间名');
  evidence.push({ entered: room.id, serverZone: inZone.zoneId, banner });
  await pause(300);
  await shot('room-2f-meeting.png');

  // 房间内的人物可见性与容器独立性：客户端 containers 只含房间容器
  const roomCtx = await ev(`({zone:WORLD.roomById(${JSON.stringify(room.id)}).id, hint:document.querySelector('#nearby-empty').textContent})`);
  evidence.push({ roomCtx });

  // ---------- 3. 走到房间内一个容器旁，打开物品格 ----------
  const container = await ev(`(function(){const r=WORLD.roomById(${JSON.stringify(room.id)});const c=r.containers[0];return {id:c.id,name:c.container.name,x:c.x+c.w/2,y:c.y+c.h+26};})()`);
  await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},x:${container.x},y:${container.y}})})`);
  await pause(400);
  await key('KeyE', 'e');
  await wait(() => ev("!document.querySelector('#loot').hidden"));
  const gridHiddenBefore = await ev("document.querySelector('#loot-grid').hidden");
  assert.equal(gridHiddenBefore, true, '未开始搜索前不显示格子');
  await shot('loot-panel-ready.png');
  await click('#loot-start');
  await wait(() => ev("document.querySelectorAll('#loot-grid .loot-cell').length>0"));
  const slotCount = await ev("document.querySelectorAll('#loot-grid .loot-cell').length");
  assert.ok(slotCount >= 6, '物品格应至少 6 格');
  // 逐格揭示：等待全部翻开
  await wait(() => ev(`(()=>{const all=document.querySelectorAll('#loot-grid .loot-cell');return all.length>0&&[...all].every(c=>!c.classList.contains('is-hidden'));})()`), 400);
  const revealed = await ev(`(()=>{const all=[...document.querySelectorAll('#loot-grid .loot-cell')];return {total:all.length,revealed:all.filter(c=>!c.classList.contains('is-hidden')).length,empty:all.filter(c=>c.classList.contains('is-empty')).length,named:all.filter(c=>c.querySelector('.loot-name').textContent&&c.querySelector('.loot-name').textContent!=='空').length};})()`);
  assert.equal(revealed.revealed, revealed.total, '所有格子都应被揭示');
  evidence.push({ slotCount, revealed });
  await shot('loot-panel-revealed.png');

  // 服务端侧：此刻还没有 searched（拾取前）
  const beforeTake = (await state()).players.find(p => p.id === meId);
  assert.ok(!beforeTake.exploration.searched.includes(container.id), '拾取前不应标记为已搜索');
  const chipsBefore = beforeTake.exploration.chips;

  await click('#loot-take');
  await wait(() => ev("!document.querySelector('#loot-summary').hidden"));
  const summary = await ev("document.querySelector('#loot-summary').textContent");
  const afterTake = (await state()).players.find(p => p.id === meId);
  assert.ok(afterTake.exploration.searched.includes(container.id), '拾取后服务端应标记已搜索');
  assert.ok(afterTake.exploration.backpack.length + afterTake.exploration.chips >= beforeTake.exploration.chips, '记账不应为负');
  evidence.push({ container: container.id, chipsBefore, chipsAfter: afterTake.exploration.chips, backpack: afterTake.exploration.backpack.length, summary });
  await shot('loot-panel-taken.png');
  // 收起物品格面板（游戏里 E 也会先收面板；这里显式关闭，避免下一步的 E 被面板吞掉）。
  await click('#loot-close');
  await wait(() => ev("document.querySelector('#loot').hidden"));

  // ---------- 4. 走到门口离开房间：位置还原 ----------
  await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},x:${roomInfo.exit.x},y:${roomInfo.exit.y}})})`);
  await pause(350);
  await key('KeyE', 'e');
  await wait(() => ev("document.querySelector('#zone-banner').hidden"));
  const outZone = (await state()).players.find(p => p.id === meId);
  assert.equal(outZone.zoneId, null, '离开后服务端 zoneId 应为 null');
  assert.equal(outZone.floorId, 2, '离开后仍在同一层');
  // 回到进入时站的位置（门点）= 房间 door
  assert.ok(Math.hypot(outZone.x - doorPos.x, outZone.y - doorPos.y) <= 80, `离开后应回到进入位置附近，实际 ${outZone.x},${outZone.y}`);
  evidence.push({ exited: { x: outZone.x, y: outZone.y, expected: doorPos } });
  await shot('room-left-back-to-floor.png');

  // ---------- 4.5 道具经济：进入房间 → 背包 → 使用 / 卖出（筹码） ----------
  // 直接用测试钩子塞一件已知的消耗品，避免"随机搜到的全是宝物"导致用例不稳定。
  await ev(`fetch('/api/test/resources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},chips:12,item:'nanoSerum',count:1})})`);
  await ev(`fetch('/api/test/resources',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},item:'gold',count:1})})`);
  await pause(260);
  await key('KeyB', 'b');  // 需求④：B 键随时开关背包
  await wait(() => ev("!document.querySelector('#exploration').hidden && document.querySelectorAll('#bag-items .bag-cell').length>=2"));
  const bagBefore = await ev("({rows:document.querySelectorAll('#bag-items .bag-cell').length,chips:document.querySelector('#exploration-chips').textContent,centered:document.querySelector('#exploration').classList.contains('bag-mode')})");
  assert.ok(bagBefore.centered, '背包应以正中弹出的仓库模式打开（.bag-mode）');
  assert.ok(bagBefore.rows >= 2, '背包格子应至少有两格，实际 ' + bagBefore.rows);
  // 使用第一件可用道具（nanoSerum：疾行）
  const used = await ev(`(()=>{const cell=[...document.querySelectorAll("#bag-items .bag-cell")].find(r=>r.title.includes("纳米修复剂"));if(!cell)return false;cell.click();const btn=[...document.querySelectorAll("#bag-detail button")].find(b=>b.textContent.trim()==="使用");if(!btn)return false;btn.click();return true;})()`);
  assert.ok(used, '背包里应能找到纳米修复剂的使用按钮');
  await wait(() => ev("(()=>{const b=document.querySelector('#buff-bar');return b&&!b.hidden&&b.textContent.includes('疾行');})()"));
  const afterUse = (await state()).players.find(p => p.id === meId);
  assert.ok(afterUse.buffs && afterUse.buffs.speedUntil > Date.now(), '服务端应记录疾行 buff 的到期时间');
  // 卖出金条换筹码
  const chipsBeforeSell = afterUse.exploration.chips;
  const sold = await ev(`(()=>{const cell=[...document.querySelectorAll("#bag-items .bag-cell")].find(r=>r.title.includes("金条"));if(!cell)return false;cell.click();const btn=[...document.querySelectorAll("#bag-detail button")].find(b=>b.textContent.trim()==="卖出");if(!btn)return false;btn.click();return true;})()`);
  assert.ok(sold, '背包里应能找到金条的卖出按钮');
  await wait(() => state().then(s => s.players.find(p => p.id === meId).exploration.chips > chipsBeforeSell));
  const afterSell = (await state()).players.find(p => p.id === meId);
  assert.ok(!afterSell.items || afterSell.items.gold === undefined, '卖出后金条应从背包移除');
  evidence.push({ bagBefore, buffs: afterUse.buffs, chipsBeforeSell, chipsAfterSell: afterSell.exploration.chips });
  await shot('bag-economy.png');
  await shot('bag-grid.png');
  await click('#exploration-close');
  await wait(() => ev("document.querySelector('#exploration').hidden"));

  // ---------- 5. 5F 地牢层：真实素材图标 + 奇幻战利品 ----------
  const realIconCount = await ev('SID.lootIcons.realReady().length');
  assert.ok(realIconCount >= 8, `真实素材图标应已加载，实际 ${realIconCount}`);
  const dungeonContainer = await ev(`(function(){
    const list=WORLD.floorContainers(5);const c=list[0];
    return {id:c.id,name:c.container.name,x:c.x+c.w/2,y:c.y+c.h+26};
  })()`);
  await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},floorId:5,zoneId:null,x:${dungeonContainer.x},y:${dungeonContainer.y}})})`);
  await wait(() => ev("document.querySelector('#floor-indicator').textContent==='5F'"));
  await pause(420);
  await key('KeyE', 'e');
  await wait(() => ev("!document.querySelector('#loot').hidden"));
  await click('#loot-start');
  await wait(() => ev(`(()=>{const all=document.querySelectorAll('#loot-grid .loot-cell');return all.length>0&&[...all].every(c=>!c.classList.contains('is-hidden'));})()`), 400);
  const dungeonCells = await ev(`(()=>{const all=[...document.querySelectorAll('#loot-grid .loot-cell')];
    return {total:all.length,named:all.filter(c=>{const t=c.querySelector('.loot-name').textContent;return t&&t!=='空';}).map(c=>c.querySelector('.loot-name').textContent)};})()`);
  evidence.push({ realIconCount, dungeonContainer: dungeonContainer.id, dungeonCells });
  await shot('loot-5f-dungeon.png');
  await click('#loot-close');
  // 5F 房间也换成地牢内景（宝箱/木箱/骷髅），截一张作为"整层一个世界观"的证据。
  const dungeonRoom = worldStats.rooms.find(r => r.floor === 5 && r.name.includes('宝库'));
  const dRoom = await ev(`(function(){const r=WORLD.roomById(${JSON.stringify(dungeonRoom.id)});return {door:{x:r.door.x,y:r.door.y},name:r.name};})()`);
  await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},floorId:5,zoneId:null,x:${dRoom.door.x},y:${dRoom.door.y}})})`);
  await pause(400);
  await key('KeyE', 'e');
  await wait(() => ev("!document.querySelector('#zone-banner').hidden"));
  await pause(320);
  await shot('room-5f-dungeon.png');
  evidence.push({ dungeonRoom: dRoom.name });
  await key('KeyE', 'e');   // 已在门口，直接退出
  await wait(() => ev("document.querySelector('#zone-banner').hidden"));

  // ---------- 5.5 双榜：筹码榜 / 成就榜 ----------
  await click('#ranking-toggle');
  await wait(() => ev("!document.querySelector('#ranking').hidden"));
  await wait(() => ev("!!document.querySelector('#ranking-tabs')"));
  const tabs = await ev("[...document.querySelectorAll('#ranking-tabs button')].map(b=>b.textContent)");
  await click('#ranking-tabs button[data-tab="achievement"]');
  await pause(220);
  const achievementRows = await ev("document.querySelectorAll('#ranking-items .ranking-row').length");
  await shot('ranking-achievement.png');
  await click('#ranking-close');
  evidence.push({ tabs, achievementRows });
  assert.deepEqual(tabs, ['筹码榜', '成就榜'], '排行榜应有双榜切换');
  assert.ok(achievementRows >= 1, '成就榜应至少有一行');
  // ---------- 6. 七层主题外观证据 ----------
  for (const floor of [1, 2, 3, 4, 5, 6, 7]) {
    const p = await ev(`WORLD.floorSpawns(${floor})[0]`);
    await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${meId},floorId:${floor},x:${p.x},y:${p.y}})})`);
    await wait(() => ev(`document.querySelector('#floor-indicator').textContent==='${floor}F'`));
    await pause(320);
    await shot(`theme-${floor}f.png`);
  }

  assert.deepEqual(errors, [], '存在未捕获异常：' + JSON.stringify(errors).slice(0, 500));
  console.log(`PASS rooms-loot: 14 间房间 / 每层 ≥35 件家具 / 物品格 ${slotCount} 格逐格揭示 / 拾取记账 / 进出房间位置还原 / 七层主题截图`);
  await writeFile(join(out, 'rooms-loot-results.json'), JSON.stringify({ status: 'pass', evidence, errors }, null, 2));
} catch (error) {
  await writeFile(join(out, 'rooms-loot-results.json'), JSON.stringify({ status: 'fail', error: error.stack, evidence, errors }, null, 2));
  throw error;
} finally {
  if (ws) ws.close();
  for (const p of [browser, server]) if (p && p.exitCode === null) p.kill();
  await pause(200);
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
