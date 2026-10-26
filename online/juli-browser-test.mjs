// Juli场景NPC：真服务/临时库/实际Canvas贴图、鼠标和K交互，测试不重启当前游戏。
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {createRequire} from 'node:module';
const root=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const {createJuliRenderer}=require('./public/js/render/juli.js');
// 单元：失败回退、方向选择、固定锚点、只替换特定场景NPC、帧绘制无像素处理。
let fake;
const unit=createJuliRenderer({Image:class{constructor(){fake=this;}set src(v){this.path=v;}}});
const scene={npc:true,entityId:'npc-reception',x:100,y:200};
const calls=[];const ctx={save(){},restore(){},beginPath(){},ellipse(){},fill(){},drawImage(...a){calls.push(a);}};
assert.equal(unit.draw(ctx,scene,0),false);const loaded=unit.load();
fake.naturalWidth=512;fake.naturalHeight=112;fake.onload();assert.equal(await loaded,true);
assert.equal(unit.draw(ctx,{npc:true,id:3,x:1,y:1},0),false,'管理员假人仍是普通人形');
assert.equal(unit.draw(ctx,{...scene,entityId:'npc-other'},0),false);
for(const [i,facing] of ['front','left','right','back'].entries()){
 assert.equal(unit.draw(ctx,{...scene,facing},0),true);const a=calls.at(-1);assert.equal(a[1],i*128);
 assert.equal(a[6]+a[8]*(104/112),200,'脚底锚点固定');
}
unit.draw(ctx,scene,1.4);const breath=calls.at(-1);assert.ok(Math.abs(breath[6]+breath[8]*(104/112)-200)<1e-9);assert.ok(breath[8]<112*.8);
assert.deepEqual(unit.bounds(scene),{x:-46,y:-78,w:92,h:80});
const failed=createJuliRenderer({Image:class{set src(v){this.onerror();}}});assert.equal(await failed.load(),false);assert.equal(failed.draw(ctx,scene,0),false);
console.log('PASS Juli单元：仅场景NPC、加载失败回退、四向贴图、脚底锚点及呼吸、无额外手臂绘制。');
const free=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{for(let i=0;i<180;i++){if(await fn())return;await pause(50);}throw Error('timeout: '+label);};
const dir=await mkdtemp(join(tmpdir(),'sid-juli-')),port=await free(),debug=await free(),base=`http://127.0.0.1:${port}`;
let server,browser,ws,serial=0;const pending=new Map(),errors=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>reject(Error(method+' timeout')),12000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const place=(slug='reception',photo=false)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('IPC placement')),5000);server.once('message',m=>{clearTimeout(timer);m.ok?resolve(m):reject(Error(JSON.stringify(m)));});server.send({slug,photo});});
const key=async(code,key=code)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
try{
 await mkdir(join(root,'../outputs/juli-npc-v2'),{recursive:true});
 server=spawn(process.execPath,['-e',`
 const {ROOM,ACTIVITY}=require(${JSON.stringify(join(root,'server.js'))});
 const WORLD=require(${JSON.stringify(join(root,'shared/world.js'))});
 const start=ACTIVITY.startManual({minutes:10,label:'Juli像素NPC自测'});if(!start.ok)throw Error(JSON.stringify(start));
 const joined=ROOM.join('juli-browser-fixture','素材验收员');
 process.on('message',m=>{const p=ROOM.find(joined.player.id),n=WORLD.NPCS.find(n=>n.slug===m.slug);
 if(!n){process.send({ok:false,error:'missing npc'});return;}
 Object.assign(p,{floorId:n.floorId,zoneId:null,x:n.x+(m.photo?110:0),y:n.y+(m.photo?70:16),input:{up:false,down:false,left:false,right:false}});p.floorRevision++;
 process.send({ok:true,x:n.x,y:n.y,floorId:n.floorId,id:n.id});});
 `],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SID_TEST:'0',SID_SSO:'0',SID_PROFILE_SYNC:'0',SID_DB:'1',SID_DB_FILE:join(dir,'test.sqlite')},stdio:['ignore','ignore','inherit','ipc']});
 await wait(async()=>{try{return (await fetch(base+'/api/auth/config')).ok;}catch{return false;}},'server');
 assert.equal((await fetch(base+'/assets/npcs-juli/juli-atlas.png?v=2')).status,200);
 assert.equal((await fetch(base+'/assets/npcs-juli/manifest.json').then(r=>r.json())).version,2);
 const chrome=process.env.SID_CHROME||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
 browser=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${join(dir,'chrome')}`,'about:blank'],{stdio:'ignore'});
 let pages;await wait(async()=>{try{pages=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());return pages.some(p=>p.type==='page');}catch{return false;}},'Chrome');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 await send('Page.enable');await send('Runtime.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 localStorage.setItem('sid_session_token','juli-browser-fixture');
 window.__juliDraw=null;window.__juliDraws=0;
 const image=CanvasRenderingContext2D.prototype.drawImage;
 CanvasRenderingContext2D.prototype.drawImage=function(...a){
 if(this.canvas.id==='office'&&a[0]?.src?.includes('npcs-juli/juli-atlas.png')){
  const m=this.getTransform(),r=this.canvas.getBoundingClientRect(),dpr=this.canvas.width/r.width;
  window.__juliDraw={args:a.slice(1),m:{a:m.a,d:m.d,e:m.e,f:m.f},dpr,r:{x:r.x,y:r.y},smooth:this.imageSmoothingEnabled};window.__juliDraws++;
 }return image.apply(this,a);};
 `});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base});
 await wait(()=>ev("document.readyState==='complete'&&document.querySelector('#join-page').hidden&&SID.juliSprites.status==='ready'"),'Juli ready');
 const first=await place();await wait(()=>ev('window.__juliDraws>3'),'actual map Juli draw');
 assert.equal(await ev('window.__juliDraw.smooth'),false);
 // 真实alpha：四个格无背景；白色机壳内部必须不透明。
 const pixels=await ev(`(async()=>{const im=new Image();im.src='/assets/npcs-juli/juli-atlas.png';await im.decode();const c=document.createElement('canvas');c.width=512;c.height=112;const x=c.getContext('2d');x.drawImage(im,0,0);const a=x.getImageData(0,0,512,112).data;let transparent=0,opaque=0,partial=0,white=0;for(let i=0;i<a.length;i+=4){if(a[i+3]===0)transparent++;else if(a[i+3]===255){opaque++;if(a[i]>215&&a[i+1]>215&&a[i+2]>205)white++;}else partial++;}return{transparent,opaque,partial,white};})()`);
 assert.ok(pixels.transparent>25000);assert.ok(pixels.opaque>10000);assert.equal(pixels.partial,0);assert.ok(pixels.white>4000,'白色机壳不可抠空');
 const edges=await ev(`(async()=>{const im=new Image();im.src='/assets/npcs-juli/juli-atlas.png?v=2';await im.decode();const c=document.createElement('canvas');c.width=512;c.height=112;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,512,112).data;let bad=0,boundary=0,red=0,dirtyTransparent=0;for(let y=0;y<112;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;if(!d[i+3]){if(d[i]||d[i+1]||d[i+2])dirtyTransparent++;continue;}if(d[i]>75&&d[i]>d[i+1]*1.4&&d[i]>d[i+2]*1.4)red++;let edge=false;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx<0||nx>=512||ny<0||ny>=112||!d[(ny*512+nx)*4+3])edge=true;}if(edge){boundary++;if(d[i]!==8||d[i+1]!==24||d[i+2]!==43)bad++;}}return{boundary,bad,red,dirtyTransparent};})()`);
 assert.equal(edges.bad,0,'四向所有边界像素为深海军蓝，没有浅色白边');
 assert.equal(edges.dirtyTransparent,0,'透明区RGB归零');assert.ok(edges.red>8,'红色顶标保留');
 // 验证点击外侧翼片（旧人形半宽26之外）会打开原NPC私密面板。
 const wing=await ev(`(()=>{const {args:a,m,dpr,r}=__juliDraw;return{x:r.x+(m.a*(a[4]+a[6]*.12)+m.e)/dpr,y:r.y+(m.d*(a[5]+a[7]*.28)+m.f)/dpr};})()`);
 for(const type of ['mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:wing.x,y:wing.y,button:'left',clickCount:1});
 await wait(()=>ev("document.querySelector('#exploration').open"),'wing click opens NPC');
 assert.match(await ev("document.querySelector('#exploration').textContent"),/接待员小禾/);
 await key('Escape','Escape');
 await ev("document.querySelector('#office').focus()");
 await key('KeyK','k');
 // 原接待员站在接待台footprint内：K按原距离仲裁优先打开接待台，而非NPC。
 // 保留原玩法，不因换皮改变K优先级；接待员仍可由翼片/身体/名牌点击打开。
 await wait(()=>ev("!document.querySelector('#loot').hidden"),'K retains nearest reception counter');
 assert.match(await ev("document.querySelector('#loot').textContent"),/接待台/);await key('Escape','Escape');
 await place('reception',true); await pause(400);
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'../outputs/juli-npc-v2/juli-in-game.png'),Buffer.from(shot.data,'base64'));
 const before=await ev('__juliDraws');const archive=await place('archive');
 await wait(()=>ev(`document.querySelector('#coordinate').textContent.startsWith('${archive.floorId}F')&&window.__juliDraws>${before+3}`),'archive Juli');
 await key('KeyK','k');await wait(()=>ev("document.querySelector('#exploration').open"),'archive interaction');
 assert.match(await ev("document.querySelector('#exploration').textContent"),/档案员阿卷/);await key('Escape','Escape');
 // 实际执行四向渲染，数据来源不看人物阵营或工号。
 assert.equal(await ev(`(()=>{const c=document.createElement('canvas');c.width=512;c.height=112;const ctx=c.getContext('2d');return ['front','left','right','back'].every(facing=>SID.juliSprites.draw(ctx,{npc:true,entityId:'npc-reception',x:64,y:104,facing},0));})()`),true);
 assert.deepEqual(errors,[]);
 await writeFile(join(root,'../outputs/juli-npc-v2/verification.json'),JSON.stringify({status:'pass',version:2,pixels,edges,reception:first,archive,errors},null,2));
 console.log('PASS Juli真实Chrome：透明像素/白壳完整、实际地图渲染、nearest-neighbour、翼片鼠标点击、K接待台原仲裁/档案商店、换层、四向与零异常；临时库不影响当前局。');
}finally{
 if(ws)ws.close();
 await Promise.all([server,browser].filter(p=>p&&p.exitCode===null).map(p=>new Promise(resolve=>{p.once('exit',resolve);p.kill();setTimeout(()=>{if(p.exitCode===null)p.kill('SIGKILL');resolve();},2000).unref();})));
 await rm(dir,{recursive:true,force:true});
}
