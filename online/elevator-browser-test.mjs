import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createServer} from 'node:net';
const root=dirname(fileURLToPath(import.meta.url)),out=join(root,'../outputs');
const free=()=>new Promise(res=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>res(p));});});
const pause=ms=>new Promise(res=>setTimeout(res,ms));
const port=await free(),debug=await free(),base=`http://127.0.0.1:${port}`,profile=await mkdtemp(join(tmpdir(),'sid-lift-'));
let server,browser,ws,serial=0;const pending=new Map(),errors=[],evidence=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(()=>reject(Error(method+' timeout')),10000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const wait=async fn=>{for(let i=0;i<120;i++){try{if(await fn())return;}catch{}await pause(50);}throw Error('wait timeout');};
const click=async selector=>{const r=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:r.x,y:r.y,button:'left',clickCount:1});};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(out,name),Buffer.from(r.data,'base64'));};
try{
 server=spawn(process.execPath,[join(root,'server.js')],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',SID_TEST:'1',SID_SSO:'0'},stdio:'ignore'});
 await wait(()=>fetch(base+'/api/auth/config').then(r=>r.ok));
 const asset='/assets/vendor/kenney-indoors/Tilesheets/roguelikeIndoor_transparent.png',a=await fetch(base+asset);assert.equal(a.status,200);assert.equal(a.headers.get('content-type'),'image/png');evidence.push({asset,status:a.status,mime:a.headers.get('content-type')});
 browser=spawn(process.env.SID_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--no-sandbox','--no-first-run',`--remote-debugging-port=${debug}`,'--remote-debugging-address=127.0.0.1',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 let pages;await wait(async()=>{pages=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());return pages.length;});
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(res=>ws.onopen=res);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/?test'});await wait(()=>ev("document.readyState==='complete'&&!!window.SID_SCENE"));await ev('SID_SCENE.ready');
 await ev("document.querySelector('#nickname').value='工程验梯'");await click('#join-form button[type=submit]');await wait(()=>ev("document.querySelector('#join-page').hidden"));
 // Runtime state placement is only through SID_TEST=1 HTTP; normal UI is exercised for selection.
 await ev(`(async()=>{const s=await fetch('/api/state',{headers:{'X-Sid-Session':sessionStorage.getItem('sid-session')||''}}).then(r=>r.json());window.__liftPlayer=s.me.id;})()`);
 for(const width of [1440,768,390]){
   await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:width===390?2:1,mobile:false});
   await ev(`(async()=>{const p=WORLD.floorPortal(1,'left');await fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:window.__liftPlayer,floorId:1,x:p.x,y:p.y})});})()`);
   await pause(150);await send('Input.dispatchKeyEvent',{type:'keyDown',key:'e',code:'KeyE',windowsVirtualKeyCode:69});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'e',code:'KeyE',windowsVirtualKeyCode:69});
   await wait(()=>ev("!document.querySelector('#elevator-picker').hidden"));
   const layout=await ev(`(()=>{const panel=document.querySelector('.elevator-card').getBoundingClientRect();return [...document.querySelectorAll('[data-floor-id]')].map(b=>{const r=b.getBoundingClientRect();return{id:+b.dataset.floorId,inside:r.left>=panel.left&&r.right<=panel.right,centerHit:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===b||b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))};});})()`);
   assert.ok(layout.every(b=>b.inside&&b.centerHit),JSON.stringify(layout));await shot(`engine-picker-${width}.png`);
   await click('[data-floor-id="4"]');await wait(()=>ev("document.querySelector('#floor-indicator').textContent==='4F'"));
   const arrived=await ev("fetch('/api/state').then(r=>r.json()).then(s=>({id:s.me.floorId,name:s.me.floorName,self:s.players.find(p=>p.id===s.me.id)}))");assert.equal(arrived.id,4);assert.ok(arrived.self.x<0);evidence.push({width,layout,arrived});
   await wait(()=>ev("document.querySelector('#floor-transition').hidden"));
 }
 const stats=await ev('SID_SCENE.stats');assert.equal(stats.ready,true);assert.ok(stats.drawImage>100);assert.ok(stats.furniture>50);evidence.push({onlineAssets:stats});await shot('engine-online-4f-west.png');
 for(const floor of [1,2,3,4,5,6,7]){
   await send('Page.navigate',{url:pathToFileURL(join(root,'../demo/index.html')).href+`?test&floor=${floor}`});await wait(()=>ev('!!window.__sidTest&&!!window.SID_SCENE'));await ev('SID_SCENE.ready');await pause(100);
   const stats=await ev('SID_SCENE.stats');assert.equal(stats.ready,true);assert.ok(stats.floors>0);assert.ok(stats.furniture>50);await shot(`engine-demo-${floor}f.png`);evidence.push({demoFloor:floor,assets:stats});
 }
 assert.deepEqual(errors,[]);console.log('PASS real Chrome: image MIME, decoded drawImage online/demo, 3 responsive picker sizes, real 4F selection, 7 floor screenshots');
 await writeFile(join(out,'engine-elevator-results.json'),JSON.stringify({status:'engineering-self-check-pass',evidence,errors},null,2));
}catch(error){await writeFile(join(out,'engine-elevator-results.json'),JSON.stringify({status:'fail',error:error.stack,evidence,errors},null,2));throw error;}
finally{if(ws)ws.close();for(const p of [browser,server])if(p&&p.exitCode===null)p.kill();await pause(200);await rm(profile,{recursive:true,force:true}).catch(()=>{});}
