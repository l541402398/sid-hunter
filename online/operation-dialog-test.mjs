// Real Chrome/CDP regression on an isolated test server. Never operates live 8787/8788/8790.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=dirname(fileURLToPath(import.meta.url)), require=createRequire(import.meta.url);
const W=require('./shared/world.js'), results=[], errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const free=()=>new Promise((ok,no)=>{const s=createServer();s.once('error',no);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>ok(port));});});
async function until(fn,label='condition'){for(let i=0;i<160;i++){if(await fn())return;await pause(50);}throw Error('Timeout: '+label);}
async function test(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.stack);}}
async function stop(p){if(!p||p.exitCode!==null||p.signalCode!==null)return;const end=new Promise(r=>p.once('exit',r));p.kill('SIGTERM');await Promise.race([end,pause(2000)]);if(p.exitCode===null&&p.signalCode===null){p.kill('SIGKILL');await end;}}
let server,chrome,profile,ws;
try{
 const port=await free(),debug=await free(); assert.ok(![8787,8788,8790].includes(port));
 const base=`http://127.0.0.1:${port}`;
 server=spawn(process.execPath,[join(root,'server.js')],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SID_DEV:'0',SID_TEST:'1',SID_SSO:'0'},stdio:'ignore'});
 await until(async()=>{try{return(await fetch(base+'/')).ok;}catch{return false;}},'test server');
 const api=async(path,token,body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{'X-Sid-Session':token}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(5000)});return{...await r.json(),status:r.status};};
 const self=await api('/api/join',null,{nickname:'弹窗测试甲'}),other=await api('/api/join',null,{nickname:'弹窗测试乙'});
 const snapshot=()=>api('/api/state',self.sessionToken);
 // 合并适配：feature 分支把「容器搜寻」改为搜打撤物品格面板（由 rooms-loot-browser-test 覆盖），
 // 中央私密弹窗现在只承载 NPC 兑换与线索背包；这里改在接待员 NPC 旁验证弹窗居中与输入冻结。
 let near;
 // 合并后地图 2x，移动速度 144→240 px/s：用例先按住→再按 K（原 E）的间隙会多漂一段，
 // 因此夹具取在 NPC 左侧，并校验「向右漂移 0–48px 的每个落点」NPC 都仍是最近可交互对象。
 const dominant=(f,p,npc)=>{const d=W.distanceToEntity(p,npc);
  if(W.floorCollides(f,p.x,p.y))return false;
  if(!W.floorPortals(f).every(q=>W.distanceToEntity(p,q)>90))return false;
  if(!W.floorContainers(f).every(c=>W.distanceToEntity(p,c)>d+10))return false;
  return W.floorNpcs(f).every(n=>n.id===npc.id||W.distanceToEntity(p,n)>d);};
 for(let f=1;f<=7&&!near;f++)for(const npc of W.floorNpcs(f)){
  if(near)break;
  for(let x=npc.x-72;x<npc.x-16&&!near;x+=2)for(let y=npc.y-16;y<=npc.y+16;y+=2){
   const base={x,y,floorId:f},d=W.distanceToEntity(base,npc);
   if(!(d>24&&d<58))continue;
   if(!dominant(f,base,npc))continue;
   let driftOk=true;
   for(let dx=8;dx<=48;dx+=8){const q={x:x+dx,y,floorId:f};
    if(W.distanceToEntity(q,npc)>60||!dominant(f,q,npc)){driftOk=false;break;}}
   if(driftOk)near={x,y,floorId:f,npc:npc.id};
  }
 }
 assert.ok(near,'valid npc fixture');
 await api('/api/test/place',null,{playerId:self.playerId,floorId:near.floorId,x:near.x,y:near.y});
 // NPC 兑换需要筹码（真实玩家从 0 起步），用测试钩子注入，保证 #exploration-action 可点。
 await api('/api/test/resources',null,{playerId:self.playerId,chips:9});
 await api('/api/test/place',null,{playerId:other.playerId,floorId:near.floorId,x:800,y:400});
 profile=await mkdtemp(join(tmpdir(),'sid-operation-dialog-'));
 chrome=spawn(process.env.SID_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let page;await until(async()=>{try{page=(await(await fetch(`http://127.0.0.1:${debug}/json/list`)).json()).find(p=>p.type==='page');return !!page;}catch{return false;}},'Chrome');
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no;});
 let seq=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.no(Error(m.error.message)):p.ok(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 const send=(method,params={})=>new Promise((ok,no)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);no(Error('CDP timeout '+method));},10000);pending.set(id,{ok:r=>{clearTimeout(t);ok(r);},no:e=>{clearTimeout(t);no(e);}});ws.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const click=async selector=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing element');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,...p,button:'left',clickCount:1});};
 const down=(key,code,vk)=>send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:vk});
 const up=(key,code,vk)=>send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:vk});
 const tap=async(key,code,vk)=>{await down(key,code,vk);await up(key,code,vk);};
 const centered=async id=>{const g=await ev(`(()=>{const r=document.getElementById(${JSON.stringify(id)}).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,open:document.getElementById(${JSON.stringify(id)}).open};})()`);assert.ok(g.open);assert.ok(Math.abs(g.x+g.w/2-g.vw/2)<3,JSON.stringify(g));assert.ok(Math.abs(g.y+g.h/2-g.vh/2)<3,JSON.stringify(g));assert.ok(g.y>=0&&g.y+g.h<=g.vh+1);};
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('sid_session_token',${JSON.stringify(self.sessionToken)});window.calls=[];const raw=window.fetch;window.fetch=async function(url,options){const r=await raw(url,options);if(['/api/input','/api/action','/api/attack','/api/skill','/api/interact'].includes(String(url)))window.calls.push({url:String(url),body:options?.body,result:await r.clone().json()});return r;};`});
 await send('Page.navigate',{url:base+'/'});await until(()=>ev("document.readyState==='complete'&&document.getElementById('join-page').hidden&&document.getElementById('roster-count').textContent==='2'"),'game joined');
 await test('坏人线索入口位于公共日志下方且唯一，匿名池居中',async()=>{
  assert.equal(await ev("document.getElementById('logs').contains(document.getElementById('bad-toggle'))"),true);
  assert.ok(await ev("document.getElementById('bad-toggle').getBoundingClientRect().top>=document.getElementById('log-items').getBoundingClientRect().bottom"));
  assert.equal(await ev("document.querySelectorAll('#bad-toggle').length"),1);
  await click('#bad-toggle');await centered('bad-pool-dialog');
  assert.ok(await ev("document.querySelectorAll('#bad-slots .bad-slot').length===1"));await tap('Escape','Escape',27);
  assert.equal(await ev("document.getElementById('bad-toggle').getAttribute('aria-expanded')"),'false');
 });
 await test('按K与NPC交谈打开中央弹窗，开窗时停止已按住的移动',async()=>{
  await ev("document.getElementById('office').focus()");await send('Page.bringToFront');
  await down('ArrowRight','ArrowRight',39);await pause(60);
  await tap('k','KeyK',75);await until(()=>ev("document.getElementById('exploration').open"),'K dialog');
  await centered('exploration');await until(()=>ev("window.calls.some(c=>c.url==='/api/input'&&JSON.parse(c.body).right===false)"));
  await pause(120);const a=await snapshot();await pause(220);const b=await snapshot();
  const pa=a.players.find(p=>p.id===self.playerId),pb=b.players.find(p=>p.id===self.playerId);
  assert.deepEqual([pb.x,pb.y],[pa.x,pa.y]);await up('ArrowRight','ArrowRight',39);
 });
 // K 现在是「场景交互」键（原 E 的语义），J 是敲击。面板打开时两者都必须被吞键列表挡住：
 // 既不能发出 /api/action / /api/attack，也不能穿透成「关掉当前面板 / 打开别的面板」。
 await test('搜寻窗口内WASD方向键JK不发送动作、位置保持不动，且 K 不穿透开关交互面板',async()=>{
  const count=await ev("window.calls.filter(c=>c.url==='/api/action'||c.url==='/api/attack').length");
  const interactCount=await ev("window.calls.filter(c=>c.url==='/api/interact').length");
  assert.equal(await ev("document.getElementById('exploration').open"),true);
  const before=await snapshot();
  for(const [key,code,vk] of [['w','KeyW',87],['ArrowLeft','ArrowLeft',37],['j','KeyJ',74],['k','KeyK',75]])await tap(key,code,vk);
  await pause(180);const after=await snapshot();
  assert.equal(await ev("window.calls.filter(c=>c.url==='/api/action'||c.url==='/api/attack').length"),count);
  assert.deepEqual(after.players.find(p=>p.id===self.playerId).x,before.players.find(p=>p.id===self.playerId).x);
  // 新增（K=交互后）：这一串按键不得触发任何交互上行，NPC 面板必须仍然开着。
  assert.equal(await ev("window.calls.filter(c=>c.url==='/api/interact').length"),interactCount,'面板内的 J/K 不应产生交互上行');
  assert.equal(await ev("document.getElementById('exploration').open"),true,'K 是交互键：面板打开时必须被吞掉，不得穿透关闭/改开面板');
 });
 await test('兑换正常结算，关闭清私密DOM且不会自动恢复原按键',async()=>{
  assert.equal(await ev("document.getElementById('exploration-action').disabled"),false);
  await click('#exploration-action');await until(()=>ev("window.calls.some(c=>c.url==='/api/interact'&&c.result.ok)"),'search settled');
  await click('#exploration-close');assert.equal(await ev("document.getElementById('exploration').childElementCount"),0);
  const a=await snapshot();await pause(160);const b=await snapshot();assert.equal(a.players[0].x,b.players[0].x);
 });
 const openPrivate=async()=>{
  if(await ev("document.getElementById('roster').hidden"))await click('#roster-toggle');
  await click(`[data-player="${other.playerId}"]`);await click('#private-gate');await centered('private-dialog');
 };
 await test('私密操作独立居中且坏人四技能初始可见，无需滚动侧档案',async()=>{
  await openPrivate();assert.equal(await ev("document.getElementById('target').contains(document.getElementById('private-content'))"),false);
  assert.equal(await ev("document.querySelectorAll('#private-content [data-skill]').length"),4);
  assert.ok(await ev("[...document.querySelectorAll('#private-content [data-skill]')].every(e=>{const r=e.getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight;})"));
  await click('#kill');assert.ok(await ev("document.getElementById('confirm').getBoundingClientRect().bottom<=innerHeight"));
  await ev("document.getElementById('sid-input').value='ABC-123-XYZ';window.savedSidInput=document.getElementById('sid-input')");await pause(300);
  assert.equal(await ev("document.getElementById('sid-input')===window.savedSidInput&&window.savedSidInput.value==='ABC-123-XYZ'"),true);
 });
 await test('私密窗Esc关闭销毁输入、收回门禁状态，重新打开无残留',async()=>{
  await tap('Escape','Escape',27);assert.equal(await ev("document.getElementById('private-content').childElementCount"),0);
  assert.equal(await ev("document.getElementById('private-gate').getAttribute('aria-expanded')"),'false');
  await click('#private-gate');assert.equal(await ev("document.querySelector('#sid-input')"),null);
  await click('#spy');await click('#confirm');await until(()=>ev("window.calls.some(c=>c.url==='/api/skill'&&c.result.ok)"),'skill settled');
  await click('#private-close');
 });
 for(const [width,height] of [[853,480],[390,844]])await test(`视口${width}x${height}私密技能和确认按钮可见`,async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  await openPrivate();await click('#kill');await centered('private-dialog');
  assert.equal(await ev("document.getElementById('private-dialog').scrollTop"),0);
  assert.ok(await ev("document.getElementById('confirm').getBoundingClientRect().bottom<=innerHeight"));
  await tap('Escape','Escape',27);
 });
 await test('切出与visibility隐藏均销毁私密内容，重新聚焦不恢复',async()=>{
  await openPrivate();await click('#kill');await ev("document.getElementById('sid-input').value='AAA-BBB-CCC';window.dispatchEvent(new Event('blur'))");
  assert.equal(await ev("document.getElementById('private-dialog').open"),false);assert.equal(await ev("document.getElementById('private-content').textContent"),'');
  await openPrivate();await ev("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden");
  assert.equal(await ev("document.getElementById('private-dialog').open"),false);
 });
 await test('线索背包居中且Esc关闭后控件正常',async()=>{
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await click('#clue-bag');await centered('exploration');await tap('Escape','Escape',27);
  assert.equal(await ev("document.getElementById('exploration').open"),false);
  assert.deepEqual(errors,[]);
 });
 const out=join(root,'..','outputs');await mkdir(out,{recursive:true});
 await openPrivate();const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,'center-private-actions.png'),Buffer.from(shot.data,'base64'));
 await writeFile(join(out,'operation-dialog-results.json'),JSON.stringify({results,errors},null,2));
}catch(e){console.error('FAIL runner',e.stack);results.push({name:'runner',pass:false});}
finally{ws?.close();await stop(chrome);await stop(server);if(profile)await rm(profile,{recursive:true,force:true});}
console.log(`汇总 ${results.filter(r=>r.pass).length}/${results.length} PASS`);process.exitCode=results.every(r=>r.pass)?0:1;
