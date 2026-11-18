// Real Chromium + isolated in-memory server. No live preview or existing save is used.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveChrome } from '../annual-review/tests/browser.cjs';
const require = createRequire(import.meta.url), out = resolve('outputs/tutorial');
await mkdir(out,{recursive:true});
const free=async()=>{const s=createServer();await new Promise(ok=>s.listen(0,'127.0.0.1',ok));const port=s.address().port;await new Promise(ok=>s.close(ok));return port;};
const port=await free(),debug=await free(),base=`http://127.0.0.1:${port}`;
Object.assign(process.env,{HOST:'127.0.0.1',PORT:String(port),SID_TEST:'1',SID_SSO:'0',SID_DB:'1',SID_DB_FILE:':memory:'});
const {server,ROOM}=require('./server.js');
let self;const bads=[];
for(let i=0;i<100&&(!self||bads.length<3);i++){
 const p=ROOM.join('tutorial-browser-'+i,'训练验收'+i).player;
 if(p.faction==='good'&&!self)self=p;
 if(p.faction==='bad')bads.push(p);
}
assert.ok(self&&bads.length>=3);
const W=require('./shared/world.js');
let lane;
for(let f=1;f<=7&&!lane;f++)for(let y=200;y<W.floorById(f).height-100&&!lane;y+=40)for(let x=500;x<W.floorById(f).width-500&&!lane;x+=40){
 if([0,30,60,90].every(dx=>!W.floorCollides(f,x+dx,y))&&W.floorPortals(f).every(p=>Math.hypot(x-p.x,y-p.y)>500))lane={floorId:f,x,y};
}
assert(lane);Object.assign(self,lane,{protectUntil:0});
const profile=await mkdtemp(join(tmpdir(),'sid-tutorial-'));
let browser,socket,sequence=0,current='startup';const pending=new Map(),results=[],errors=[],failedResources=[],apiFrames=[];
const call=(method,params={})=>new Promise((ok,no)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method));},15000);pending.set(id,{ok:r=>{clearTimeout(t);ok(r);},no:e=>{clearTimeout(t);no(e);}});socket.send(JSON.stringify({id,method,params}));});
async function ev(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function room(expression){return ev(`document.getElementById('tutorial-frame').contentWindow.eval(${JSON.stringify(expression)})`);}
async function until(label,fn,ms=12000){const end=Date.now()+ms;while(Date.now()<end){const value=await fn();if(value)return value;await delay(40);}throw Error('Timed out: '+label);}
const wait=expression=>until(expression,()=>ev(expression));
const waitRoom=expression=>until(expression,()=>room(expression));
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
const clickRoom=async selector=>{
 await room('new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)))');
 const bounds=await room(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const frame=await ev("document.getElementById('tutorial-frame').getBoundingClientRect().toJSON()");
 for(const type of ['mousePressed','mouseReleased'])await call('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,x:frame.x+bounds.x,y:frame.y+bounds.y});
};
const key=async(code,type)=>{const names={ArrowRight:'ArrowRight',ArrowUp:'ArrowUp',ArrowDown:'ArrowDown',Escape:'Escape'},name=names[code]||code.slice(3).toLowerCase();await call('Input.dispatchKeyEvent',{type:type||'keyDown',code,key:name,windowsVirtualKeyCode:({ArrowRight:39,ArrowUp:38,ArrowDown:40,Escape:27})[code]||code.charCodeAt(3)});if(!type)await call('Input.dispatchKeyEvent',{type:'keyUp',code,key:name});};
async function capture(name){const shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name),Buffer.from(shot.data,'base64'));}
async function check(name,fn){current=name;await fn();results.push({name,passed:true});console.log('PASS',name);}
const phase=name=>waitRoom(`SID_PRACTICE.inspect().phase===${JSON.stringify(name)}&&!document.getElementById('tutorial-spotlight').hidden&&document.getElementById('tutorial-spotlight').dataset.phase===${JSON.stringify(name)}`);
const initPractice=step=>ev(`document.getElementById('tutorial-frame').contentWindow.postMessage({type:'sid-tutorial:init',progress:{step:${step}}},location.origin)`);
async function noteVisible(){const r=await room("({rect:document.getElementById('spotlight-note').getBoundingClientRect().toJSON(),w:innerWidth,h:innerHeight})");assert.ok(r.rect.x>=0&&r.rect.right<=r.w&&r.rect.y>=0&&r.rect.bottom<=r.h,JSON.stringify(r));}
async function comparisonVisible(){
 await noteVisible();
 assert.equal(await room("document.querySelector('#spotlight-reference .bad-slot').outerHTML===document.querySelector('#bad-slots .bad-slot').outerHTML"),true,'Comparison must retain the entire published card, including hidden fields');
 const styles=await room(`(()=>{const selectors=['.bad-slot','header strong','.bad-clue-heading','.bad-clue','.bad-clue span','.bad-clue strong'];const read=root=>selectors.map(s=>{const n=s==='.bad-slot'?root:root.querySelector(s),c=getComputedStyle(n);return Object.fromEntries(['color','backgroundImage','fontSize','fontWeight','lineHeight','marginTop','marginBottom','paddingTop','paddingLeft','display','flexDirection'].map(k=>[k,c[k]]));});return{original:read(document.querySelector('#bad-slots .bad-slot')),reference:read(document.querySelector('#spotlight-reference .bad-slot'))}})()`);
 assert.deepEqual(styles.reference,styles.original,'Use the same card styles as the clues panel');
 const r=await room(`({note:document.getElementById('spotlight-note').getBoundingClientRect().toJSON(),fields:[...document.querySelectorAll('#target [data-color="hair"],#target [data-color="top"]')].map(n=>n.getBoundingClientRect().toJSON()),w:innerWidth,h:innerHeight})`);
 for(const f of r.fields){
  assert.ok(f.x>=0&&f.y>=0&&f.right<=r.w&&f.bottom<=r.h,JSON.stringify(r));
  assert.ok(r.note.right<=f.x||r.note.x>=f.right||r.note.bottom<=f.y||r.note.y>=f.bottom,JSON.stringify(r));
 }
}
const step=()=>room("Number(document.body.dataset.tutorialStep)");
async function manualEntry(){await click('#rules-toggle');await click('#tutorial-entry');await wait("document.getElementById('tutorial-offer').open");await click('#tutorial-start');await wait("document.getElementById('tutorial-overlay').open&&document.getElementById('tutorial-loading').hidden");}
const raw=()=>({x:self.x,y:self.y,floorId:self.floorId,zoneId:self.zoneId||null,hp:self.hp,score:self.score,faction:self.faction,skills:structuredClone(self.skills),exploration:structuredClone(self.exploration)});
try{
 await until('server',async()=>{try{return(await fetch(base+'/')).ok;}catch{return false;}});
 browser=spawn(resolveChrome(),['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let page;await until('Chrome',async()=>{try{page=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page');return page;}catch{return false;}});
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{socket.onopen=ok;socket.onerror=no;});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.no(Error(m.error.message)):job.ok(m.result);}return;}if(m.method==='Network.requestWillBeSent'&&new URL(m.params.request.url).pathname.startsWith('/api/'))apiFrames.push(m.params.frameId);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Network.responseReceived'&&m.params.response.status>=400&&!m.params.response.url.includes('/api/'))failedResources.push(m.params.response.url);};
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await call('Page.addScriptToEvaluateOnNewDocument',{source:`if(window===top&&location.origin===${JSON.stringify(base)}){localStorage.setItem('sid_session_token',${JSON.stringify(self.sessionId)});window.gameplayCalls=[];const raw=fetch;window.fetch=async function(url,options){const path=new URL(typeof url==='string'?url:url.url,location.href).pathname;if(options?.method==='POST')gameplayCalls.push({path,body:options.body});return raw.apply(this,arguments);};}`});
 await call('Page.navigate',{url:base+'/'});await call('Page.bringToFront');
 await wait("document.readyState==='complete'&&document.getElementById('annual-review-overlay')?.dataset.ready==='true'");
 await key('Escape');
 await check('纪念册关闭且加入后首次展示可跳过的训练邀请',async()=>{
  await wait("document.getElementById('tutorial-offer').open");assert.equal(await ev("document.getElementById('join-page').hidden"),true);
  await capture('01-invitation.png');await click('#tutorial-skip');assert.equal(await ev("document.getElementById('tutorial-offer').open"),false);await delay(200);assert.equal(await ev("document.querySelector('.shell').inert"),false);
 });
 let baseline;
 await check('正式我的信息直接显示阵营与属性，关闭重开仍显示，公开资料不泄露',async()=>{
  const publicBefore=ROOM.publicSnapshot(self.id).players.map(p=>({id:p.id,traits:p.traits}));
  for(let i=0;i<2;i++){
   await click('#my-info');await wait("!document.getElementById('mine').hidden");
   assert.match(await ev("document.getElementById('mine-value-identity').textContent"),/调查员/);
   for(const id of ['saying','food','sport'])assert.equal(await ev(`document.getElementById('mine-value-${id}').textContent`),self.traits[id]);
   assert.equal(await ev("document.querySelectorAll('#mine .eye-toggle').length"),0);await click('#mine-close');
  }
  assert.deepEqual(ROOM.publicSnapshot(self.id).players.map(p=>({id:p.id,traits:p.traits})),publicBefore);
  await click('#roster-toggle');await click(`#roster-items [data-player="${bads[0].id}"]`);
  assert.equal(await ev("!!document.getElementById('private-gate')"),false);assert.equal(await ev("!!document.querySelector('#target #accuse')"),true);
  await click('#accuse');assert.ok(await ev("!!document.querySelector('#target #confirm')"));await click('#cancel');
  await click('#accuse');await click('#confirm');await until('formal skill damage',()=>bads[0].hp===2);await wait("document.querySelector('#target .health-value')?.textContent==='2/3'");
  assert.equal(self.score,10);await click('#target-close');await click('#roster-toggle');

 });
 await check('训练室直接复用正式DOM、CSS、game.js与房间渲染，没有另画功能界面',async()=>{
  await manualEntry();
  const ui=await room(`({scripts:[...document.scripts].map(s=>s.src),styles:[...document.styleSheets].map(s=>s.href),canvas:document.getElementById('office').getBoundingClientRect().toJSON(),width:innerWidth,height:innerHeight,custom:!!document.getElementById('practice-panel'),hud:document.querySelector('.game-hud').innerHTML})`);
  const official=await ev("document.querySelector('.game-hud').innerHTML");
  // Countdowns and live statistics differ; the elements and styling are identical.
  assert.ok(ui.scripts.includes(base+'/game.js'));assert.ok(ui.styles.includes(base+'/styles.css'));assert.equal(ui.custom,false);
  assert.ok(ui.canvas.width===ui.width&&ui.canvas.height===ui.height);
  const styleProbe=`['#rules-toggle','#my-info','#intel-hub','#logs-toggle'].map(selector=>{const c=getComputedStyle(document.querySelector(selector));return{selector,font:c.fontSize,border:c.borderWidth,clip:c.clipPath,background:c.backgroundImage}})`;
  assert.deepEqual(await room(styleProbe),await ev(styleProbe));
  for(const id of ['intel-hub','rules-toggle','roster-toggle','my-info','logs-toggle','fullscreen-toggle'])assert.ok(ui.hud.includes(`id="${id}"`)&&official.includes(`id="${id}"`));
  await until('real scene rendered',()=>room('SID_PRACTICE.inspect().drawCount>2'));
  assert.equal(await room('SID_PRACTICE.inspect().sceneId'),'f1:room:manager');
  assert.equal(await room("!!document.getElementById('zone-banner')"),false);await capture('01b-real-game-ui.png');await clickRoom('#room-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
 });
 await check('重启、恢复与重新进入使用同一套固定人物和线索，探索目标为最近书桌且没有引导箭头',async()=>{
  await manualEntry();
  const fixture=()=>room("SID_PRACTICE.request('/api/state').then(s=>({people:s.players.map(p=>({id:p.id,colors:p.colors,traits:p.traits})),faction:s.me.faction,clues:s.badSlots[0].systemClues.colors}))");
  let expected;
  for(const checkpoint of [2,5,2]){
   await initPractice(checkpoint);await until('fixed checkpoint',async()=>await step()===checkpoint);
   const current=await fixture();if(expected)assert.deepEqual(current.people,expected.people);else expected=current;
   assert.equal(current.faction,'good');
   assert.equal(current.people[1].colors.hair[0],'银白');assert.equal(current.people[1].colors.top[0],'砖红');
   if(checkpoint===5){
    assert.deepEqual(current.clues,{hair:'银白',top:'砖红'});
    await phase('target-colors');assert.equal(await room("document.getElementById('tutorial-spotlight').dataset.target"),'roster-toggle');
    await clickRoom('#roster-toggle');await waitRoom("document.getElementById('tutorial-spotlight').dataset.target==='roster-alpha'");
    await clickRoom('#roster-items [data-player="2"]');await waitRoom("document.getElementById('tutorial-spotlight').dataset.target==='target-colors'");await comparisonVisible();
   }
  }
  await initPractice(0);await until('new movement',async()=>await step()===0);
  assert.equal(await room("document.querySelectorAll('#spotlight-arrow,#tutorial-arrowhead').length"),0);
  assert.equal(await room("(()=>{const q=SID_PRACTICE.inspect(),W=WORLD,desks=W.roomById(q.sceneId).containers.filter(f=>f.type==='desk').sort((a,b)=>W.distanceToEntity(q.position,a)-W.distanceToEntity(q.position,b));return desks[0].id===q.deskId})()"),true);
  await clickRoom('#room-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
 });
 await check('可随时从规则重进，正式角色停止且保持原楼层坐标',async()=>{
  await ev("document.getElementById('office').focus()");const oldX=self.x;await key('ArrowRight','keyDown');await until('live moving',()=>self.x>oldX+5);
  await manualEntry();await key('ArrowRight','keyUp');await waitRoom("document.body.dataset.tutorialStep==='0'");baseline=raw();
  assert.equal(await room("document.body.innerText.includes('正式角色留在原位置')"),true);
  await ev('window.gameplayCalls=[]');await room("document.getElementById('office').focus()");
  assert.equal(await room("document.getElementById('movement-hint').hidden"),false);
  assert.equal(await room("[...document.querySelectorAll('#movement-hint kbd')].map(k=>k.textContent).join('')"),'WASD');
  const hint=await room("document.getElementById('movement-hint').getBoundingClientRect().toJSON()");assert.ok(hint.x>=1440*.3+20);await capture('02-movement-wasd.png');
  await room(`window.movementFrames=[];window.originalPracticeOverlay=SID_PRACTICE.drawOverlay;SID_PRACTICE.drawOverlay=function(ctx,view){
   originalPracticeOverlay.call(this,ctx,view);
   const phase=SID_PRACTICE.inspect().step;if(phase>1)return;
   const m=ctx.getTransform(),hint=document.getElementById('movement-hint').getBoundingClientRect();
   movementFrames.push({phase,camera:[m.a,m.b,m.c,m.d,m.e,m.f],player:view.player,hint:{x:hint.x,y:hint.y}});
  }`);
  await key('KeyD','keyDown');await until('movement step',async()=>await step()===1);await key('KeyD','keyUp');
  await waitRoom('movementFrames.filter(f=>f.phase===1).length>=3');
  const frames=await room('movementFrames');await room('SID_PRACTICE.drawOverlay=originalPracticeOverlay');
  assert.ok(frames.some(f=>f.phase===0)&&frames.some(f=>f.phase===1));
  for(const frame of frames)assert.deepEqual(frame.camera,frames[0].camera,'The map must stay fixed while walking and entering exploration');
  for(const frame of frames.filter(f=>f.phase===0))assert.deepEqual(frame.hint,{x:hint.x,y:hint.y},'WASD must stay at its initial screen position');
  assert.ok(frames.at(-1).player.x>frames[0].player.x+20,'The character must move across the stationary map');
  assert.deepEqual(raw(),baseline);await capture('02-room-movement.png');
 });
 await check('退出保存进度，随时重进从当前步骤继续',async()=>{
  await clickRoom('#room-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
  await call('Page.reload');await wait("document.getElementById('annual-review-overlay')?.dataset.ready==='true'");await key('Escape');
  await wait("document.getElementById('join-page').hidden&&!document.getElementById('annual-review-overlay').open");
  assert.equal(await ev("document.getElementById('tutorial-offer').open"),false);
  await manualEntry();await until('resumed step',async()=>await step()===1);
  await room("document.getElementById('office').focus()");await key('ArrowUp','keyDown');
  await waitRoom("(()=>{const q=SID_PRACTICE.inspect();return WORLD.distanceToEntity(q.position,WORLD.roomById(q.sceneId).furniture.find(f=>f.id===q.deskId))<=60})()");await key('ArrowUp','keyUp');
 });
 await check('J不写公告；个人信息按阵营、外观、隐藏属性、关闭按钮逐项讲解',async()=>{
  const logCount=await room("document.getElementById('log-count').textContent");await room("document.getElementById('office').focus()");await key('KeyJ');await delay(120);
  assert.equal(await room("document.getElementById('log-count').textContent"),logCount);
  await key('KeyK');await until('searched',async()=>await step()===2);await clickRoom('#loot-close');await phase('mine-open');
  await capture('03a-mine-entry.png');await clickRoom('#my-info');await phase('mine-faction');
  assert.match(await room("document.getElementById('mine-value-identity').textContent"),/调查员/);
  assert.equal(await room("document.querySelectorAll('#mine .eye-toggle').length"),0);
  const domOrder=await room("!!(document.querySelector('.mine-identity').compareDocumentPosition(document.getElementById('mine-colors'))&Node.DOCUMENT_POSITION_FOLLOWING)");assert.ok(domOrder);
  for(const [phaseName,target] of [['mine-faction','mine-faction'],['mine-colors','mine-colors'],['mine-traits','mine-traits']]){
   await phase(phaseName);assert.equal(await room("document.getElementById('tutorial-spotlight').dataset.target"),target);await capture(`03-${phaseName}.png`);await clickRoom('#spotlight-next');
  }
  await phase('mine-close');await clickRoom('#mine-close');await phase('clues-open');assert.equal(await step(),3);assert.deepEqual(raw(),baseline);
 });
 await check('正式角色被真实技能命中并进入休战，不切回、不关闭或重置教程',async()=>{
  for(const actor of bads.slice(0,3)){
   self.protectUntil=0;
   const response=await fetch(base+'/api/skill',{method:'POST',headers:{'Content-Type':'application/json','X-Sid-Session':actor.sessionId},body:JSON.stringify({commandId:'tutorial-hit-'+actor.id,skill:'assassinate',targetId:self.id,roundId:ROOM.room.roundId})});
   const result=await response.json();assert.equal(result.ok,true,JSON.stringify(result));
  }
  assert.equal(self.hp,0);assert.equal(self.alive,false);await delay(200);
  assert.equal(await ev("document.getElementById('tutorial-overlay').open"),true);assert.equal(await step(),3);assert.equal(await room("document.getElementById('score-value').textContent"),'2');
  assert.equal(self.x,baseline.x);assert.equal(self.y,baseline.y);assert.equal(ROOM.streams.has(self.id),true);
 });
 await check('线索卡片上方的遮罩可操作，明确提示按系统信息推理',async()=>{
  await clickRoom('#bad-toggle');await phase('clues-card');
  assert.equal(await room("document.getElementById('bad-pool-dialog').open"),true);
  assert.equal(await room("document.getElementById('spotlight-detail').textContent"),'根据系统公布的信息，推理出坏人是谁。');
  assert.equal(await room("document.getElementById('tutorial-spotlight').matches(':popover-open')"),true);
  await capture('04-clue-card.png');await clickRoom('#spotlight-next');await phase('clues-close');await clickRoom('#bad-pool-close');await phase('roster-open');
 });
 await check('名单按钮、搜索框和匹配人物依次高亮，不能空搜索跳过',async()=>{
  await capture('05-roster-entry.png');await clickRoom('#roster-toggle');await phase('roster-search');assert.equal(await room("document.getElementById('spotlight-next').disabled"),true);
  await room("document.getElementById('search').focus()");await call('Input.insertText',{text:'砖红'});
  assert.doesNotMatch(await room("document.getElementById('spotlight-detail').textContent"),/练习人物甲/);
  const keyword=await room("(()=>{const e=document.querySelector('#spotlight-detail .tutorial-emphasis'),c=getComputedStyle(e);return{text:e.textContent,color:c.color,weight:c.fontWeight,display:c.display}})()");
  assert.equal(keyword.text,'砖红');assert.equal(keyword.color,'rgb(255, 243, 107)');assert.ok(Number(keyword.weight)>=800);assert.equal(keyword.display,'inline');
  await waitRoom("!document.getElementById('spotlight-next').disabled");await capture('05-roster-search.png');
  assert.equal(await room("document.querySelectorAll('#roster-items [data-player]').length"),1);
  await clickRoom('#spotlight-next');await phase('roster-alpha');await clickRoom('#roster-items [data-player="2"]');await phase('target-colors');
  assert.equal(await room("document.querySelectorAll('.spotlight-ring').length"),2);
  assert.match(await room("document.querySelector('#target [data-color=hair]').textContent"),/银白/);
  assert.match(await room("document.querySelector('#target [data-color=top]').textContent"),/砖红/);
  assert.match(await room("document.getElementById('spotlight-reference').textContent"),/坏人01/);
  assert.deepEqual(await room("[...document.querySelectorAll('#spotlight-reference .bad-clue strong')].map(n=>n.textContent)"),['银白','砖红','***','***','***','***','***']);
  await comparisonVisible();await capture('06-color-comparison.png');
  await clickRoom('#spotlight-next');await phase('accuse');
  assert.equal(await room("!!document.getElementById('private-gate')"),false);assert.equal(await room("document.getElementById('accuse').closest('#target')!==null"),true);await capture('06-direct-skill.png');
 });
 await check('指认引导保留失焦面板、切回仍显示蒙层；关闭或取消后重开可继续',async()=>{
  const assertAccuse=async()=>{
   await phase('accuse');
   await waitRoom("document.getElementById('tutorial-spotlight').dataset.target==='accuse'");
   assert.equal(await room("document.getElementById('target').hidden"),false);
   assert.equal(await room("document.getElementById('tutorial-spotlight').dataset.target"),'accuse');
   assert.equal(await room("document.getElementById('tutorial-spotlight').matches(':popover-open')"),true);
  };
  const interrupt=async()=>{
   await room("window.dispatchEvent(new Event('blur'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('pointercancel'));window.dispatchEvent(new Event('focus'))");
   await delay(200);
  };
  const hp=await room("SID_PRACTICE.request('/api/state').then(s=>[s.me.hp,s.me.score,s.players[1].hp])");
  await interrupt();await assertAccuse();
  // Switch Chromium tabs as well as dispatching the separate blur/hidden events above.
  const other=await call('Target.createTarget',{url:'about:blank'});
  try{
   await call('Target.activateTarget',{targetId:other.targetId});await wait('document.hidden');
   await call('Page.bringToFront');await wait('!document.hidden');await assertAccuse();
  }finally{await call('Target.closeTarget',{targetId:other.targetId});await call('Page.bringToFront');}
  await room("document.getElementById('office').click()");await assertAccuse();
  await room("document.getElementById('spotlight-shade').dispatchEvent(new MouseEvent('click',{bubbles:true}))");await assertAccuse();
  const emphasis=await room("(()=>{const e=document.querySelector('#spotlight-tip .tutorial-emphasis'),c=getComputedStyle(e);return{text:e.textContent,color:c.color,weight:c.fontWeight,background:c.backgroundColor}})()");
  assert.match(await room("document.getElementById('spotlight-detail').textContent"),/成功指认坏人后，将会减少该坏人1格生命。/);
  assert.doesNotMatch(await room("document.getElementById('spotlight-detail').textContent"),/误指/);
  assert.equal(await room("document.getElementById('spotlight-tip').hidden"),false);
  assert.equal(emphasis.text,'误指好人会扣除自己 1 格生命。');assert.equal(emphasis.color,'rgb(255, 243, 107)');assert.ok(Number(emphasis.weight)>=800);assert.notEqual(emphasis.background,'rgba(0, 0, 0, 0)');
  await noteVisible();await capture('06-accuse-warning.png');
  for(const action of ['close','escape','parent-escape']){
   await clickRoom('#accuse');await phase('confirm');await interrupt();await phase('confirm');assert.equal(await room("!!document.getElementById('confirm')"),true);
   if(action==='close')await clickRoom('#target-close');else{
    if(action==='parent-escape')await ev("document.getElementById('tutorial-overlay').focus()");else await room("document.getElementById('confirm').focus()");
    await key('Escape');
   }
   await waitRoom("document.getElementById('target').hidden");assert.equal(await ev("document.getElementById('tutorial-overlay').open"),true);
   await waitRoom("document.getElementById('tutorial-spotlight').dataset.target==='roster-alpha'");await clickRoom('#roster-items [data-player="2"]');await assertAccuse();
  }
  await clickRoom('#accuse');await phase('confirm');await clickRoom('#cancel');await assertAccuse();
  assert.deepEqual(await room("SID_PRACTICE.request('/api/state').then(s=>[s.me.hp,s.me.score,s.players[1].hp])"),hp);
 });
 await check('直接指认并关闭档案，地图和名单的实际血条同时高亮为2/3',async()=>{
  await clickRoom('#accuse');await phase('confirm');await clickRoom('#confirm');await phase('target-close');
  await waitRoom("document.getElementById('score-value').textContent==='12'");await capture('06-skill-result.png');
  assert.equal(await step(),5);await clickRoom('#target-close');await phase('health');await waitRoom("document.querySelectorAll('.spotlight-ring').length===2");await delay(150);
  assert.equal(await room("document.querySelector('#roster-items [data-player=\"2\"] .health-value').textContent"),'2/3');
  const map=await room('SID_PRACTICE.inspect().mapHealth');assert.ok(map.x>=0&&map.y>=0&&map.x+map.width<=1440&&map.y+map.height<=900,JSON.stringify(map));
  assert.equal(await room("document.getElementById('training-complete').open"),false);await capture('07-health-change.png');
  assert.equal(self.score,baseline.score);assert.deepEqual(self.skills,baseline.skills);assert.deepEqual(self.exploration,baseline.exploration);
  const requests=await ev('window.gameplayCalls');assert.equal(requests.filter(c=>c.path!=='/api/input').length,0,JSON.stringify(requests));
  for(const request of requests){const v=JSON.parse(request.body);assert.ok(!v.up&&!v.down&&!v.left&&!v.right);}
  await clickRoom('#spotlight-next');await waitRoom("document.getElementById('training-complete').open");assert.equal(await step(),7);assert.equal(await room("document.getElementById('training-complete-title').textContent"),'恭喜您完成了新手训练营');await capture('08-completed.png');
 });
 await check('返回显示正式休战状态与期间事件，正式坐标未变化',async()=>{
  await clickRoom('#training-complete-exit');await wait("document.getElementById('tutorial-return').open");
  await wait("document.getElementById('tutorial-live-state').textContent.includes('休战中')");
  assert.match(await ev("document.getElementById('tutorial-live-state').textContent"),/生命 0\/3/);assert.match(await ev("document.getElementById('tutorial-event-list').textContent"),/生命|休战/);
  await capture('05-live-return.png');await click('#tutorial-return-ok');assert.equal(self.x,baseline.x);assert.equal(self.y,baseline.y);
 });
 await check('重进已完成教程可重新开始，窄屏和矮屏均可操作退出',async()=>{
  await manualEntry();await until('restart',async()=>await step()===0);
  for(const [width,height] of [[390,844],[853,480]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(100);
   const size=await room("({w:innerWidth,scroll:document.documentElement.scrollWidth,exit:document.getElementById('room-exit').getBoundingClientRect().toJSON()})");
   assert.ok(size.scroll<=size.w+1,JSON.stringify(size));assert.ok(size.exit.x>=0&&size.exit.right<=size.w);await capture(`06-room-${width}.png`);
  }
  await room("document.getElementById('office').focus()");await clickRoom('#room-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
 });
 await check('窄屏、矮屏下逐项讲解、搜索和血量提示可点击且不溢出',async()=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});await manualEntry();
  for(const [width,height] of [[390,844],[853,480]]){
   await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
   await initPractice(2);await phase('mine-open');await clickRoom('#my-info');
   for(const p of ['mine-faction','mine-colors','mine-traits']){await phase(p);await noteVisible();await capture(`09-${p}-${width}.png`);await clickRoom('#spotlight-next');}
   await phase('mine-close');await clickRoom('#mine-close');await phase('clues-open');await clickRoom('#bad-toggle');await phase('clues-card');await noteVisible();await capture(`09-clues-${width}.png`);await clickRoom('#spotlight-next');await phase('clues-close');await clickRoom('#bad-pool-close');
   await phase('roster-open');await clickRoom('#roster-toggle');await phase('roster-search');await room("document.getElementById('search').focus()");await call('Input.insertText',{text:'砖红'});await waitRoom("!document.getElementById('spotlight-next').disabled");await clickRoom('#spotlight-next');await phase('roster-alpha');await clickRoom('#roster-items [data-player="2"]');await phase('target-colors');await comparisonVisible();await capture(`09-comparison-${width}.png`);await clickRoom('#spotlight-next');await phase('accuse');await noteVisible();await capture(`09-warning-${width}.png`);await clickRoom('#accuse');await phase('confirm');await clickRoom('#confirm');await phase('target-close');await clickRoom('#target-close');await phase('health');await delay(200);
   await noteVisible();const m=await room('SID_PRACTICE.inspect().mapHealth');assert.ok(m.x>=0&&m.y>=0&&m.x+m.width<=width&&m.y+m.height<=height,JSON.stringify(m));await capture(`09-health-${width}.png`);
   await clickRoom('#spotlight-next');await waitRoom("document.getElementById('training-complete').open");
  }
  await clickRoom('#training-complete-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
 });
 await check('无法确认正式角色停止时不会进入教程，恢复网络后可重试',async()=>{
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await ev(`window.tutorialFetch=window.fetch;window.fetch=function(url,options){if(String(url)==='/api/input')return Promise.resolve(new Response(JSON.stringify({ok:false}),{headers:{'Content-Type':'application/json'}}));return tutorialFetch.apply(this,arguments);}`);
  await click('#rules-toggle');await click('#tutorial-entry');
  await wait("document.getElementById('copy-toast').textContent.includes('暂时无法确认')");
  assert.equal(await ev("document.getElementById('tutorial-overlay').open||document.getElementById('tutorial-offer').open"),false);
  assert.equal(await ev("document.querySelector('.shell').inert"),false);
  await ev('window.fetch=window.tutorialFetch');await manualEntry();await ev("document.getElementById('tutorial-frame').contentWindow.postMessage({type:'sid-tutorial:init',progress:{step:0}},location.origin)");await until('restarted',async()=>await step()===0);
  await ev("window.postMessage({type:'sid-tutorial:progress',progress:{step:5}},location.origin)");await delay(80);assert.equal(await step(),0);
  await clickRoom('#room-exit');await wait("document.getElementById('tutorial-return').open");await click('#tutorial-return-ok');
 });
 await check('浏览器无脚本异常、资源失败，练习房间不建立额外SSE',async()=>{
  assert.deepEqual(errors,[]);assert.deepEqual(failedResources,[]);assert.equal(ROOM.streams.size,1);const tree=await call('Page.getFrameTree');assert.ok(apiFrames.every(id=>id===tree.frameTree.frame.id),'Tutorial must not send real API requests');
 });
}catch(e){results.push({name:current,passed:false,error:e.stack});console.error('FAIL',current,e.stack);if(socket)await capture('failure.png').catch(()=>{});}
finally{
 await writeFile(join(out,'results.json'),JSON.stringify({results,errors,failedResources},null,2));
 socket?.close();if(browser){const done=new Promise(ok=>browser.once('exit',ok));browser.kill('SIGTERM');await Promise.race([done,delay(2000)]);if(browser.exitCode===null)browser.kill('SIGKILL');}
 for(const stream of ROOM.streams.values())stream.close();await new Promise(ok=>server.close(ok));await rm(profile,{recursive:true,force:true});
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} PASS`);process.exitCode=results.every(r=>r.passed)?0:1;
