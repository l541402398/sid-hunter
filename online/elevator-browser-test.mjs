// 电梯真实浏览器回归：独立 SQLite + 真服务；仅测试子进程 IPC 布置站位，不添加生产测试接口。
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'../outputs');
const free=()=>new Promise(res=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
const pause=ms=>new Promise(res=>setTimeout(res,ms));
const port=await free(),debug=await free(),base=`http://127.0.0.1:${port}`,profile=await mkdtemp(join(tmpdir(),'sid-lift-'));
let server,browser,ws,serial=0;const pending=new Map(),errors=[],evidence=[];let serverLog='';
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(method+' timeout')),10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=async(fn,label='condition')=>{for(let i=0;i<160;i++){if(await fn())return;await pause(50);}throw Error('wait timeout: '+label);};
const click=async selector=>{const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',clickCount:1});};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name),Buffer.from(r.data,'base64'));};
const key=async(code,keyValue=code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:keyValue,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key:keyValue,code});};
const selected=()=>ev("Number(document.querySelector('.elevator-floor-btn.is-selected')?.dataset.floorId)");
const state=()=>ev("fetch('/api/state').then(r=>r.json()).then(s=>({floor:s.me.floorId,x:s.me.x,y:s.me.y}))");
const place=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('IPC placement timeout')),5000);server.once('message',m=>{clearTimeout(timer);m.ok?resolve(m):reject(Error(JSON.stringify(m)));});server.send({action:'place'});});
try{
 // SID_TEST=1 会禁用存档并关闭场次；本用例使用专属临时库与正常玩法门禁。
 server=spawn(process.execPath,['-e',`
  const {server,ROOM,ACTIVITY}=require(${JSON.stringify(join(root,'server.js'))});
  const {WORLD}=require(${JSON.stringify(join(root,'room.js'))});
  const result=ACTIVITY.startManual({minutes:10,label:'电梯键盘自测'});
  if(!result.ok)throw Error(JSON.stringify(result));
  const joined=ROOM.join('elevator-browser-fixture','工程验梯');
  if(joined.error)throw Error(joined.error);
  process.on('message',m=>{if(m.action!=='place')return;const p=ROOM.find(joined.player.id),lift=WORLD.floorPortal(1,'left');
   Object.assign(p,{floorId:1,zoneId:null,x:lift.x,y:lift.y,input:{up:false,down:false,left:false,right:false}});p.floorRevision++;
   process.send({ok:true,x:p.x,y:p.y});});
 `],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SID_TEST:'0',SID_DB:'1',SID_DB_FILE:join(profile,'test.sqlite'),SID_SSO:'0'},stdio:['ignore','pipe','pipe','ipc']});
 server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
 await wait(async()=>{try{return (await fetch(base+'/api/auth/config')).ok;}catch{return false;}},'server');
 const chrome=process.env.SID_CHROME||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
 browser=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${join(profile,'chrome')}`,'about:blank'],{stdio:'ignore'});
 browser.on('error',e=>errors.push(e.message));
 let pages;await wait(async()=>{try{pages=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());return pages.some(p=>p.type==='page');}catch{return false;}},'Chrome');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(res=>ws.onopen=res);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.__floorPosts=0;window.__movingPosts=0;
  const nativeFetch=window.fetch;window.fetch=function(url,init){if(String(url).includes('/api/floor-change'))window.__floorPosts++;if(String(url).includes('/api/input')){const b=JSON.parse(init?.body||'{}');if(b.up||b.down||b.left||b.right)window.__movingPosts++;}return nativeFetch.apply(this,arguments);};
  window.__liftFrames=[];let ops=[];const proto=CanvasRenderingContext2D.prototype,fill=proto.fillRect,image=proto.drawImage;
  proto.fillRect=function(){if(this.canvas.id==='office'){if(this.fillStyle==='#05070c'){if(ops.includes('lift')&&ops.includes('body')){window.__liftFrames.push(ops);if(window.__liftFrames.length>20)window.__liftFrames.shift();}ops=[];}if(this.fillStyle==='#8d929a')ops.push('lift');}return fill.apply(this,arguments);};
  proto.drawImage=function(){if(this.canvas.id==='office'&&arguments.length===9&&arguments[3]===64&&arguments[4]===112)ops.push('body');return image.apply(this,arguments);};
  localStorage.setItem('sid_session_token','elevator-browser-fixture');
 `});
 await send('Network.setCookie',{name:'sid_session',value:'elevator-browser-fixture',url:base,httpOnly:true,sameSite:'Lax'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/?test'});
 await wait(()=>ev("document.readyState==='complete'&&document.querySelector('#join-page').hidden"),'joined');
 // 真正 Canvas 调用顺序，而不只是源码位置：每帧最后一笔电梯绘制必须早于第一笔人物贴图。
 await place();await wait(()=>ev('window.__liftFrames.length>0'),'rendered characters and elevator');
 assert.ok(await ev("window.__liftFrames.every(ops=>ops.lastIndexOf('lift')<ops.indexOf('body'))"));
 evidence.push({layer:'实际Canvas绘制：电梯先于人物'});
 for(const width of [1440,768,390]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   await place();await wait(async()=>{const s=await state();return s.floor===1;},'placed at 1F');await pause(200);
   // 按住方向时打开也必须清空原来的移动意图。
   await key('KeyK','k');await wait(()=>ev("!document.querySelector('#elevator-picker').hidden"),'picker open');
   assert.equal(await selected(),2);
   assert.equal(await ev("document.querySelector('[data-floor-id=\"1\"]').disabled"),true);
   const before=await state(),moves=await ev('window.__movingPosts');
   for(const [code,want] of [['KeyD',3],['KeyA',2],['ArrowRight',3],['ArrowLeft',2],['KeyS',6],['KeyW',2],['ArrowDown',6],['ArrowUp',2]]){
     await key(code);assert.equal(await selected(),want,`${width}: ${code}`);
   }
   await key('KeyA','a');assert.equal(await selected(),2,'跳过当前层，不越界');
   await key('KeyD','d');await key('KeyD','d');assert.equal(await selected(),4);
   await key('ArrowDown');assert.equal(await selected(),7,'末行不足四格时落到7F');
   await key('ArrowRight');await key('ArrowDown');assert.equal(await selected(),7,'边界不越界');
   await key('ArrowUp');assert.equal(await selected(),3);
   await key('ArrowDown');assert.equal(await selected(),7);await key('ArrowLeft');assert.equal(await selected(),6);
   await pause(250);assert.deepEqual(await state(),before,'选层时人物不得移动');
   assert.equal(await ev('window.__movingPosts'),moves,'导航不能提交移动意图');
   const layout=await ev(`(()=>{const panel=document.querySelector('.elevator-card').getBoundingClientRect();return [...document.querySelectorAll('[data-floor-id]')].map(b=>{const r=b.getBoundingClientRect();return{id:+b.dataset.floorId,inside:r.left>=panel.left&&r.right<=panel.right};});})()`);
   assert.ok(layout.every(b=>b.inside),JSON.stringify(layout));
   const blue = await ev("getComputedStyle(document.querySelector('.is-selected')).borderTopColor.match(/\\d+/g).map(Number)");
   assert.ok(blue.every((v,i)=>Math.abs(v-[74,95,232][i])<=4),`蓝框含CSS过渡容差：${blue}`);
   assert.equal(await ev("document.querySelector('.is-selected').getAttribute('aria-pressed')"),'true');
   await shot(`engine-picker-${width}.png`);
   const requests=await ev('window.__floorPosts');
   await key('Escape','Escape');assert.equal(await ev('window.__floorPosts'),requests,'取消不能换层');
   await key('KeyK','k');assert.equal(await selected(),2,'重开恢复默认选项');
   await key('KeyS','s');assert.equal(await selected(),6);
   // 一次确认 + 自动重复键不能再提交。
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK'});
   await send('Input.dispatchKeyEvent',{type:'keyDown',key:'k',code:'KeyK',autoRepeat:true});
   await send('Input.dispatchKeyEvent',{type:'keyUp',key:'k',code:'KeyK'});
   await wait(async()=> (await state()).floor===6,'K arrives 6F');
   assert.equal(await ev('window.__floorPosts'),requests+1);
   await wait(()=>ev("document.querySelector('#floor-transition').hidden"),'transition done');
   evidence.push({width,layout,keyboard:'8方向键/边界/禁选/取消/K确认',noMovement:true,exactlyOneRequest:true});
 }
 // 鼠标点击与数字快捷选层继续保留。
 await place();await pause(250);await key('KeyK','k');await wait(()=>ev("!document.querySelector('#elevator-picker').hidden"));
 await click('[data-floor-id="4"]');await wait(async()=> (await state()).floor===4,'mouse arrives 4F');
 await wait(()=>ev("document.querySelector('#floor-transition').hidden"));
 await place();await pause(250);await key('KeyK','k');await wait(()=>ev("!document.querySelector('#elevator-picker').hidden"));
 await key('Digit3','3');await wait(async()=> (await state()).floor===3,'digit arrives 3F');
 assert.deepEqual(errors,[]);evidence.push({mouse:true,digit:true});
 await writeFile(join(out,'engine-elevator-results.json'),JSON.stringify({status:'pass',evidence,errors},null,2));
 console.log('PASS 电梯真实Chrome：实际绘制层级、3种窗口宽度、WASD/方向键蓝框、人物不动、K单次换层、禁选/边界/Esc/鼠标/数字快捷键；专属临时库，无现有服务变更。');
}catch(error){await writeFile(join(out,'engine-elevator-results.json'),JSON.stringify({status:'fail',error:error.stack,evidence,errors,serverLog},null,2));throw error;}
finally{
 if(ws)ws.close();
 const children=[browser,server].filter(p=>p&&p.exitCode===null);
 await Promise.all(children.map(p=>new Promise(resolve=>{p.once('exit',resolve);p.kill();setTimeout(()=>{if(p.exitCode===null)p.kill('SIGKILL');resolve();},2000).unref();})));
 await rm(profile,{recursive:true,force:true});
}
