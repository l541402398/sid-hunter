// Isolated rules/four-skills regression. Does not connect to or restart live port 8787.
// Run with managed Node. No dependencies; Chrome CDP uses Node's native WebSocket.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const NODE = process.execPath;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pause = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise((resolve, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const results = [], errors = [];
async function test(name, fn) {
  try { const evidence = await fn(); results.push({ name, pass: true, evidence: evidence || 'assertions passed' }); console.log('PASS', name); }
  catch (e) { results.push({ name, pass: false, error: e.stack }); console.log('FAIL', name, e.message); }
}
async function until(label, fn) { for (let i = 0; i < 100; i++) { if (await fn()) return; await pause(60); } throw new Error('timeout: ' + label); }
let counter = 0;
function fixture() {
  const r = createRoom();
  for (const [token, name] of [['bad','坏测试'],['good','好测试'],['target','目标'],['extra','备用']]) r.join(token, name);
  return r;
}
function use(r, token, skill, targetId, more = {}) { return r.useSkill(token, { commandId: `cmd-${++counter}`, skill, targetId, ...more }); }
function privateMe(r, id) { return r.privateSnapshot(id).me; }

await test('01 好人两项、坏人四项实际私密状态；公开投影无阵营/技能', () => {
  const r = fixture();
  assert.deepEqual(Object.keys(privateMe(r,0).skills), ['probe','accuse','spy','kill']);
  assert.deepEqual(Object.keys(privateMe(r,1).skills), ['probe','accuse']);
  for (const p of r.publicSnapshot().players) { assert.ok(!('faction' in p)); assert.ok(!('skills' in p)); }
});
await test('02 坏人探查只公开隐藏属性、刺探只公开SID；两资源独立', () => {
  const r = fixture(), target = r.find(2);
  assert.equal(use(r,'bad','probe',2).ok,true);
  assert.deepEqual(target.traitPublic,{saying:true,food:false,sport:false});
  assert.deepEqual(target.sid.revealed,[false,false,false]);
  assert.equal(use(r,'bad','spy',2).ok,true);
  assert.deepEqual(target.traitPublic,{saying:true,food:false,sport:false});
  assert.deepEqual(target.sid.revealed,[true,false,false]);
  assert.equal(r.find(0).skills.probe.chargesRemaining,1);
  assert.equal(r.find(0).skills.spy.chargesRemaining,1);
  assert.equal(r.find(0).skills.accuse.chargesRemaining,2);
  assert.equal(r.find(0).skills.kill.chargesRemaining,2);
});
await test('03 两阵营指认好人效果一致、无扣血；错指认公共日志无操作者', () => {
  const r = fixture();
  for (const token of ['bad','good']) {
    const actor = r.playerBySession(token), before = actor.hp;
    r.room.logs = [];
    assert.equal(use(r,token,'accuse',2).ok,true);
    assert.equal(actor.hp,before); assert.deepEqual(actor.sid.revealed,[true,false,false]);
    assert.equal(r.room.logs.length,1); assert.equal(r.room.logs[0].text,'目标被指认一次。');
    const event = privateMe(r,actor.id).pending.at(-1);
    assert.match(event.text,/你的第1段S-ID已公开/); assert.equal(event.result.damaged,0);
    assert.ok(!JSON.stringify(event).includes(actor.name));
  }
  r.find(0).sid.revealed = [true,true,true]; r.room.clockOffset += 13000;
  use(r,'bad','accuse',2);
  assert.match(privateMe(r,0).pending.at(-1).text,/已全部公开/);
});
await test('04 两阵营指认坏人目标均扣1血；自选禁止', () => {
  for (const token of ['bad','good']) {
    const r = fixture();
    // The real lobby creates only one bad player. A server-only target fixture exercises
    // bad->bad without changing the production lobby's faction allocation rule.
    r.find(2).faction = 'bad'; r.find(2).hp = 2;
    assert.equal(use(r,token,'accuse',2).ok,true); assert.equal(r.find(2).hp,1);
    assert.equal(use(r,token,'probe',r.playerBySession(token).id).ok,false);
  }
});
await test('05 good spy/kill及未知id拒绝，不消耗任何次数；同commandId去重', () => {
  const r = fixture(), before = JSON.stringify(r.find(1).skills);
  for (const id of ['spy','kill','not-a-skill','__proto__',null]) assert.equal(use(r,'good',id,2).ok,false);
  assert.equal(JSON.stringify(r.find(1).skills),before);
  const body = { commandId:'one-command', skill:'probe', targetId:2 };
  assert.equal(r.useSkill('good',body).ok,true);
  const after = JSON.stringify(r.find(1).skills);
  assert.equal(r.useSkill('good',body).ok,false); assert.equal(JSON.stringify(r.find(1).skills),after);
});
await test('06 四技能各自独立恢复；重复用不重置计时、长离线补足、满停止', () => {
  const r = fixture();
  for (const id of ['probe','spy','accuse','kill']) assert.equal(use(r,'bad',id,2,{sid:'AAA-AAA-AAA'}).ok,true);
  const p = r.find(0), starts = Object.fromEntries(Object.entries(p.skills).map(([k,s])=>[k,s.nextChargeAt]));
  r.room.clockOffset += 13000;
  for (const id of ['probe','spy','accuse','kill']) {
    assert.equal(use(r,'bad',id,2,{sid:'AAA-AAA-AAA'}).ok,true);
    assert.equal(p.skills[id].nextChargeAt,starts[id]); assert.equal(p.skills[id].chargesRemaining,0);
  }
  r.setOffline(0); r.room.clockOffset += 78000;
  let s = privateMe(r,0).skills;
  for (const k of Object.keys(s)) { assert.equal(s[k].chargesRemaining,1); assert.equal(s[k].nextChargeAt,starts[k]+90000); }
  r.room.clockOffset += 900000;
  s = privateMe(r,0).skills;
  for (const k of Object.keys(s)) { assert.equal(s[k].chargesRemaining,2); assert.equal(s[k].nextChargeAt,0); }
});
await test('07 完整SID精确匹配；结束仅三种（badWiped/aliveFloor/timeUp），小房间不再按存活数结束', () => {
  const r = fixture();
  assert.equal(use(r,'bad','kill',2,{sid:'bad-format'}).ok,false);
  assert.equal(r.find(0).skills.kill.chargesRemaining,2);
  assert.equal(use(r,'bad','kill',2,{sid:r.find(2).sid.segments.join('-')}).ok,true);
  assert.equal(r.room.finished,false);
  // 再淘汰一名好人：存活降到 2，但旧“存活<=2 且有淘汰即结束”已废除，坏人仍在场 -> 不结束。
  r.room.clockOffset += 13000;
  use(r,'bad','kill',3,{sid:r.find(3).sid.segments.join('-')});
  assert.equal(r.room.finished,false);
  assert.equal(r.room.players.filter(p=>p.alive).length,2);
  // badWiped：两名好人各指认唯一坏人一次（hp 2→0）-> 坏人全灭，结束并下发排名。
  const w = fixture();
  assert.equal(use(w,'good','accuse',0).ok,true); assert.equal(w.find(0).hp,1); assert.equal(w.room.finished,false);
  w.room.clockOffset += 13000;
  assert.equal(use(w,'target','accuse',0).ok,true);
  assert.equal(w.room.finished,true); assert.equal(w.room.finishReason,'badWiped');
  assert.ok(Array.isArray(w.room.ranking)&&w.room.ranking.length===4);
  // aliveFloor：用 options.rules 把阈值降到 2 -> 淘汰一名好人后存活降到阈值即结束（无排名）。
  const f = createRoom({rules:{endRemainingPlayers:2}});
  f.join('fa','甲'); f.join('fb','乙'); f.join('fc','丙');
  assert.equal(f.useSkill('fa',{commandId:'floor-1',skill:'kill',targetId:1,sid:f.find(1).sid.segments.join('-')}).ok,true);
  assert.equal(f.room.finished,true); assert.equal(f.room.finishReason,'aliveFloor'); assert.equal(f.room.ranking,null);
  // timeUp：推进时钟越过时间上限 -> 结束并下发排名与公开 rules。
  const t = createRoom(); t.join('ta','甲'); t.join('tb','乙');
  t.room.clockOffset += WORLD.RULES.timeLimitMs;
  const snap = t.publicSnapshot();
  assert.equal(t.room.finished,true); assert.equal(t.room.finishReason,'timeUp');
  assert.ok(Array.isArray(t.room.ranking)&&t.room.ranking.length===2);
  assert.deepEqual(Object.keys(snap.rules).sort(),['endRemainingPlayers','endsAt','timeLimitMs']);
  assert.ok(snap.players.every(p=>typeof p.score==='number'));
  // 小房间未命中三条件不结束。
  const fresh = createRoom(); fresh.join('a'); fresh.join('b'); assert.equal(fresh.room.finished,false);
});

let server, chrome, ws, profile;
let port, base, seq=0;
const requests = new Map();
async function cdp(method, params = {}) {
  return new Promise((resolve,reject)=>{ const id=++seq; const timer=setTimeout(()=>{ requests.delete(id); reject(new Error('CDP timeout '+method)); },15000);
    requests.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
    ws.send(JSON.stringify({id,method,params})); });
}
async function evaluate(expression) {
  const r=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
}
async function click(selector) {
  const p=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing selector '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await cdp('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',clickCount:1});
  await cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',clickCount:1});
}
const key=(type,key,code,vk)=>cdp('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk});
async function post(path,body,token) { const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{'X-Sid-Session':token}:{})},body:JSON.stringify(body)}); return {status:r.status,...await r.json()}; }
async function state(token) { return (await fetch(base+'/api/state',{headers:{'X-Sid-Session':token}})).json(); }
try {
  port=await freePort(); base=`http://127.0.0.1:${port}`;
  assert.notEqual(port,8787);
  server=spawn(NODE,[join(root,'server.js')],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SID_TEST:'1'},stdio:'ignore'});
  await until('isolated server',async()=>{try{return (await fetch(base+'/api/state')).status===401;}catch{return false;}});
  const debug=await freePort(); profile=await mkdtemp(join(tmpdir(),'sid-rules-'));
  chrome=spawn(CHROME,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
  let page;
  await until('chrome',async()=>{try{page=(await (await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page');return !!page;}catch{return false;}});
  ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&requests.has(m.id)){const r=requests.get(m.id);requests.delete(m.id);m.error?r.reject(new Error(m.error.message)):r.resolve(m.result);} if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
  await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await cdp('Page.navigate',{url:base+'/'});
  await until('join UI',()=>evaluate(`!!document.getElementById('join-page')&&!document.getElementById('join-page').hidden`));
  await evaluate(`document.getElementById('nickname').value='浏览甲'`); await click('#join-form button');
  await until('joined',()=>evaluate(`document.getElementById('join-page').hidden`));
  const token=await evaluate(`localStorage.getItem('sid_session_token')`);
  const nick=await post('/api/join',{nickname:'<script>'}); const good=await post('/api/join',{nickname:'浏览乙'}); await post('/api/join',{nickname:'备用'});
  await until('snapshot updated',()=>evaluate(`document.getElementById('roster-count').textContent==='4'`));
  await test('08 真实HTTP响应两/四技能并结算；旧action兼容且未知key拒绝',async()=>{
    assert.deepEqual(Object.keys((await state(token)).me.skills),['probe','accuse','spy','kill']);
    assert.deepEqual(Object.keys((await state(good.sessionToken)).me.skills),['probe','accuse']);
    const spy=await post('/api/skill',{commandId:'http-spy',skill:'spy',targetId:nick.playerId},token); assert.equal(spy.ok,true);
    const probe=await post('/api/skill',{commandId:'http-probe',skill:'probe',targetId:nick.playerId},token); assert.equal(probe.ok,true);
    const s=await state(token), p=s.players.find(p=>p.id===nick.playerId); assert.notEqual(p.traits.saying,'***'); assert.notEqual(p.sid,'***-***-***');
    const invalid=await post('/api/skill',{commandId:'http-no',skill:'unknown',targetId:nick.playerId},token); assert.equal(invalid.ok,false);
    const legacy=await post('/api/skill',{commandId:'legacy',skill:'action',targetId:nick.playerId,sid:'AAA-AAA-AAA'},token); assert.equal(legacy.kind,'kill');
  });
  await test('09 昵称<script>在名单/目标/我的信息均为文字；公开层不显示阵营差异',async()=>{
    await click('#roster-toggle');
    await until('nickname roster',()=>evaluate(`document.getElementById('roster-items').textContent.includes('<script>')`));
    assert.equal(await evaluate(`document.querySelectorAll('#roster-items script').length`),0);
    await click(`[data-player="${nick.playerId}"]`);
    assert.equal(await evaluate(`document.querySelector('#target h2').textContent`),'<script>');
    assert.equal(await evaluate(`document.querySelectorAll('#target script').length`),0);
    const text=await evaluate(`document.getElementById('target').textContent`); assert.ok(!/好人|坏人/.test(text));
    // Same browser switches to the <script> identity, making the mine-name path real.
    await cdp('Network.setCookie',{name:'sid_session',value:nick.sessionToken,url:base,httpOnly:true,path:'/'});
    await evaluate(`localStorage.setItem('sid_session_token',${JSON.stringify(nick.sessionToken)})`);
    await cdp('Page.navigate',{url:base+'/'});
    await until('nickname page rendered',()=>evaluate(`document.readyState==='complete'&&document.getElementById('roster-count').textContent==='4'&&document.getElementById('join-page').hidden`));
    await until('nickname identity',()=>evaluate(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.name==='<script>')`));
    await cdp('Page.bringToFront');
    await evaluate(`document.getElementById('my-info').focus()`); await key('keyDown',' ','Space',32); await key('keyUp',' ','Space',32);
    await until('mine visible',()=>evaluate(`!document.getElementById('mine').hidden`));
    assert.ok((await evaluate(`document.getElementById('mine').textContent`)).includes('<script>'));
    assert.equal(await evaluate(`document.querySelectorAll('#mine script').length`),0);
    // Restore the original bad browser identity, without touching live 8787.
    await cdp('Network.setCookie',{name:'sid_session',value:token,url:base,httpOnly:true,path:'/'});
    await evaluate(`localStorage.setItem('sid_session_token',${JSON.stringify(token)})`); await cdp('Page.navigate',{url:base+'/'});
    await until('restored page rendered',()=>evaluate(`document.readyState==='complete'&&document.getElementById('roster-count').textContent==='4'&&document.getElementById('join-page').hidden`));
    await until('restored bad',()=>evaluate(`fetch('/api/state').then(r=>r.json()).then(s=>s.me.faction==='bad')`));
    await cdp('Page.bringToFront');
  });
  await test('10 真实私密界面四技能；我的信息四项；规则打开销毁私密DOM',async()=>{
    await click('#roster-toggle'); await click(`[data-player="${good.playerId}"]`); await click('#private-gate');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-skill]')].map(e=>e.dataset.skill)`),['probe','accuse','spy','kill']);
    await evaluate(`document.getElementById('my-info').focus()`); await key('keyDown',' ','Space',32); await key('keyUp',' ','Space',32);
    // 身份眼睛同时解锁血量与技能明细，四项技能文案随之出现在“我的信息”。
    await click('#eye-identity');
    const text=await evaluate(`document.getElementById('mine').textContent`); for(const n of ['探查','指认','刺探','击杀'])assert.ok(text.includes(n),n);
    await click('#rules-toggle');
    assert.equal(await evaluate(`document.getElementById('mine').childElementCount`),0);
    assert.equal(await evaluate(`document.getElementById('private-content').childElementCount`),0);
    await click('#rules-close');
  });
  await test('11 入口紧邻日志/琥珀高对比；规则8区SVG/色块/流程；三种结束方式与示例不读取本人SID',async()=>{
    assert.equal(await evaluate(`document.getElementById('log-toggle').nextElementSibling.id`),'rules-toggle');
    const style=await evaluate(`getComputedStyle(document.getElementById('rules-toggle')).backgroundImage`); assert.ok(style.includes('gradient'));
    await click('#rules-toggle');
    assert.equal(await evaluate(`document.getElementById('rules-view').open`),true);
    assert.equal(await evaluate(`document.activeElement.id`),'rules-close');
    assert.equal(await evaluate(`document.querySelectorAll('#rules-view .rule-section').length`),8);
    assert.ok(await evaluate(`document.querySelectorAll('#rules-view svg').length>0&&document.querySelectorAll('.rule-color-grid i').length===4&&document.querySelectorAll('.mini-flow').length>=6`));
    const text=await evaluate(`document.getElementById('rules-view').textContent`);
    assert.ok(text.includes('A7C-9K2-3M8')); assert.ok(text.includes('***-9K2-***')); assert.ok(!text.includes((await state(token)).me.sid));
    assert.ok(!text.includes('浏览甲'));
    // 新结束规则：仅三种（存活淘汰至剩余 100 人 / 坏人全灭 / 时间到 2 小时），并按分数结算排名。
    assert.ok(text.includes('存活淘汰至剩余 100 人')); assert.ok(text.includes('坏人全灭')); assert.ok(text.includes('时间到（2 小时）'));
    assert.ok(text.includes('按分数排名')); assert.ok(text.includes('仅三种'));
    assert.ok(text.includes('待补充')); assert.ok(text.includes('阅读规则时游戏仍在继续'));
    const streams=await (await fetch(base+'/api/test/streams')).json(); assert.equal(streams.count,1);
    await click('#rules-close'); assert.equal(await evaluate(`document.activeElement.id`),'rules-toggle');
  });
  await test('12 规则打开清空WASD、Esc/返回关闭与焦点陷阱；服务器不暂停',async()=>{
    await evaluate(`document.getElementById('office').focus()`); const before=(await state(token)).players.find(p=>p.id===0).x;
    await key('keyDown','d','KeyD',68);
    await until('movement',async()=> (await state(token)).players.find(p=>p.id===0).x>before+8);
    await evaluate(`document.getElementById('rules-toggle').focus();document.getElementById('rules-toggle').click()`);
    await pause(150); const x=(await state(token)).players.find(p=>p.id===0).x; await pause(200);
    assert.equal((await state(token)).players.find(p=>p.id===0).x,x);
    const t=(await state(token)).serverTime; await pause(100); assert.ok((await state(token)).serverTime>t);
    await key('keyDown','Tab','Tab',9); await key('keyUp','Tab','Tab',9); assert.equal(await evaluate(`document.activeElement.id`),'rules-close');
    await key('keyDown','Escape','Escape',27); await key('keyUp','Escape','Escape',27);
    assert.equal(await evaluate(`document.getElementById('rules-view').open`),false); assert.equal(await evaluate(`document.activeElement.id`),'rules-toggle');
    await key('keyUp','d','KeyD',68);
  });
  await test('13 390px小窗口规则可滚动且无横向溢出，保存图解截图',async()=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
    await click('#rules-toggle');
    const layout=await evaluate(`(()=>{const d=document.getElementById('rules-view');return{client:d.clientWidth,scroll:d.scrollWidth,vertical:d.scrollHeight>d.clientHeight}})()`);
    assert.ok(layout.scroll<=layout.client+1,JSON.stringify(layout)); assert.equal(layout.vertical,true);
    await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
    await evaluate(`document.getElementById('rules-view').scrollTop=0`);
    const shot=await cdp('Page.captureScreenshot',{format:'png'}); await writeFile(join(root,'rules-skill-preview.png'),Buffer.from(shot.data,'base64'));
    await click('#rules-close'); return layout;
  });
  await test('14 浏览器运行无未捕获异常',()=>{ assert.deepEqual(errors,[]); });
} catch(e) { results.push({name:'browser harness',pass:false,error:e.stack}); console.error(e); }
finally {
  if(ws)ws.close();
  for(const proc of [chrome,server]) if(proc&&proc.exitCode===null){const done=new Promise(r=>proc.once('exit',r));proc.kill('SIGTERM');await Promise.race([done,pause(2500)]);if(proc.exitCode===null)proc.kill('SIGKILL');}
  if(profile)await rm(profile,{recursive:true,force:true,maxRetries:3}).catch(()=>{});
  await writeFile(join(root,'rules-skill-test-results.json'),JSON.stringify({date:new Date().toISOString(),bind:'127.0.0.1',port,live8787Untouched:true,results,summary:{passed:results.filter(r=>r.pass).length,total:results.length},runtimeErrors:errors,limitations:['仅本机隔离随机端口与真实Chrome CDP测试，不是独立QA或跨设备验收','恢复边界使用服务端clockOffset加速，不等待真实90秒','bad指认bad分支用服务端内存目标fixture覆盖；正式加入规则仍仅首人为bad','未启动/停止/重置既有8787进程；四技能需主持人以后安排重启才在既有服务生效','旧self-test/qa脚本与报告未修改；不将旧报告算作新版本验收']},null,2));
  if(results.some(r=>!r.pass))process.exitCode=1;
  console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length}));
}
