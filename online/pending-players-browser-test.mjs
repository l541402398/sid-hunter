// 待加入名单真实浏览器测试：虚构员工+独立临时数据库，绝不访问公司员工服务或当前游戏局。
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
const root=dirname(fileURLToPath(import.meta.url));
const free=()=>new Promise(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const port=await free(),debug=await free(),base=`http://127.0.0.1:${port}`,dir=await mkdtemp(join(tmpdir(),'sid-pending-'));
let server,browser,ws,id=0;const pending=new Map(),errors=[];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{for(let i=0;i<160;i++){if(await fn())return;await pause(50);}throw Error('timeout: '+label);};
const send=(method,params={})=>new Promise((resolve,reject)=>{const i=++id,timer=setTimeout(()=>reject(Error(method+' timeout')),10000);pending.set(i,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id:i,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
const command=action=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('IPC timeout')),5000);server.once('message',m=>{clearTimeout(timer);m.ok?resolve(m):reject(Error(JSON.stringify(m)));});server.send({action});});
try{
 server=spawn(process.execPath,['-e',`
  const {ROOM,STORE,ACTIVITY}=require(${JSON.stringify(join(root,'server.js'))});
  STORE.saveEmployees([
   {empNo:'001',name:'已加入',deliveryGroup:'交付一组'},
   {empNo:'010',name:'待邀乙',deliveryGroup:'交付一组',email:'never-send@example.com',title:'never-send'},
   {empNo:'002',name:'待邀甲',deliveryGroup:'交付一组'},
   {empNo:'020',name:'<img src=x onerror=alert(1)>',deliveryGroup:'交付二组'},
   {empNo:'030',name:'未分组'}
  ]);
  const start=ACTIVITY.startManual({minutes:10,label:'待加入名单自测'});if(!start.ok)throw Error(JSON.stringify(start));
  ROOM.join('pending-browser-fixture',null,{empNo:'001',name:'已加入'});
  process.on('message',m=>{
   if(m.action==='join')ROOM.join('joined-new-fixture',null,{empNo:'002',name:'待邀甲'});
   if(m.action==='empty'){for(const e of STORE.listEmployees()){if(ROOM.room.players.some(p=>p.empNo===e.empNo))continue;const r=ROOM.join('staff-'+e.empNo,null,{empNo:e.empNo,name:e.name});if(r.error){process.send({ok:false,error:r.error,empNo:e.empNo});return;}}}
   if(m.action==='no-table'){const old=STORE.listEmployees;STORE.listEmployees=()=>[];process.send({ok:true});return;}
   process.send({ok:true});
  });
 `],{env:{...process.env,HOST:'127.0.0.1',PORT:String(port),SID_TEST:'0',SID_SSO:'0',SID_PROFILE_SYNC:'0',SID_DB:'1',SID_DB_FILE:join(dir,'test.sqlite')},stdio:['ignore','ignore','inherit','ipc']});
 await wait(async()=>{try{return (await fetch(base+'/api/auth/config')).ok;}catch{return false;}},'server');
 const chrome=process.env.SID_CHROME||(process.platform==='darwin'?'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome':process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':'google-chrome');
 browser=spawn(chrome,['--headless=new','--no-sandbox','--no-first-run',`--remote-debugging-port=${debug}`,`--user-data-dir=${join(dir,'chrome')}`,'about:blank'],{stdio:'ignore'});
 let pages;await wait(async()=>{try{pages=await fetch(`http://127.0.0.1:${debug}/json/list`).then(r=>r.json());return pages.some(p=>p.type==='page');}catch{return false;}},'Chrome');
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 await send('Page.enable');await send('Runtime.enable');
 await send('Browser.grantPermissions',{origin:base,permissions:['clipboardReadWrite','clipboardSanitizedWrite']});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('sid_session_token','pending-browser-fixture');window.__alerts=[];window.alert=m=>__alerts.push(m);`});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/?ticket=must-not-share#secret'});
 await wait(()=>ev("document.readyState==='complete'&&document.querySelector('#join-page').hidden"),'joined');
 await click('#pending-toggle');await wait(()=>ev("document.querySelectorAll('.pending-member').length===4"),'pending loaded');
 assert.equal(await ev("document.querySelector('#pending-count').textContent"),'4');
 assert.equal(await ev("document.querySelectorAll('.pending-group[open]').length"),0,'默认所有组收起');
 assert.equal(await ev("[...document.querySelectorAll('.pending-group')].every(g=>Math.abs(g.getBoundingClientRect().height-g.querySelector('summary').getBoundingClientRect().height)<2)"),true,'收起时组高仅为标题高度');
 await click('.pending-group summary');
 assert.equal(await ev("document.querySelectorAll('.pending-group[open]').length"),1,'各组独立展开');
 await click('.pending-group summary');assert.equal(await ev("document.querySelectorAll('.pending-group[open]').length"),0,'再次点击收起');
 // 原生summary支持Enter键展开，不只依赖鼠标。
 await ev("document.querySelector('.pending-group summary').focus()");
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait(()=>ev("document.querySelector('.pending-group').open"),'键盘可展开');
 const grouped = await ev("[...document.querySelectorAll('.pending-group')].map(g=>({name:g.querySelector('summary strong').textContent,ids:[...g.querySelectorAll('.pending-person small')].map(e=>e.textContent)}))");
 assert.deepEqual(grouped.find(g=>g.name.startsWith('交付一组')).ids,['工号 002','工号 010']);
 assert.deepEqual(grouped.find(g=>g.name.startsWith('交付二组')).ids,['工号 020']);
 assert.deepEqual(grouped.at(-1).ids,['工号 030']);
 assert.equal(await ev("document.querySelectorAll('#pending-items img').length"),0,'姓名文本不可注入HTML');
 assert.deepEqual(await ev('__alerts'),[]);
 assert.equal(await ev("document.querySelector('#pending-items').textContent.includes('已加入')"),false);
 await click('#roster-toggle');assert.equal(await ev("document.querySelector('#pending-players').hidden"),true);
 await click('#pending-toggle');assert.equal(await ev("document.querySelector('#roster').hidden"),true);
 assert.equal(await ev("document.querySelector('.pending-group').open"),true,'面板开关保留分组状态');
 await ev("document.querySelectorAll('.pending-group').forEach(g=>g.open=true)");
 for(const width of [1440,768,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
  const layout=await ev(`(()=>{const p=document.querySelector('#pending-players').getBoundingClientRect();return {inside:p.left>=0&&p.right<=innerWidth,scroll:document.querySelector('#pending-items').scrollWidth<=document.querySelector('#pending-items').clientWidth+2};})()`);
  assert.ok(layout.inside&&layout.scroll,JSON.stringify({width,layout}));
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.bringToFront');
 await click('.pending-invite');
 try { await wait(()=>ev("document.querySelector('#invite-message').textContent==='已复制游戏链接，快去邀请他加入吧'"),'clipboard success'); }
 catch(error) { throw Error(error.message+' / '+JSON.stringify(await ev("({message:document.querySelector('#invite-message').textContent,link:document.querySelector('#invite-link').value,focus:document.hasFocus()})"))); }
 assert.equal(await ev("document.querySelector('#invite-dialog').open"),true);
 const link=await ev("document.querySelector('#invite-link').value");
 assert.ok(!/127\.0\.0\.1|localhost|ticket|secret/.test(link),link);assert.equal(new URL(link).port,String(port));
 assert.equal(await ev('navigator.clipboard.readText()'),link,'实际读取剪贴板确认复制内容');
 await click('#invite-ok');assert.equal(await ev("document.querySelector('#invite-dialog').open"),false);
 await ev("navigator.clipboard.writeText=async()=>{throw Error('permission denied');}");
 await click('.pending-invite');await wait(()=>ev("document.querySelector('#invite-message').textContent.includes('未能自动复制')"),'denied');
 assert.equal(await ev("document.querySelector('#invite-link').value"),link);
 await click('#invite-close');
 // HTTP局域网不支持现代剪贴板：执行同步execCommand回退，成功/失败分别给真实结果。
 await ev("Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});window.__copyCalls=0;document.execCommand=cmd=>{if(cmd==='copy')__copyCalls++;return true;}");
 await click('.pending-invite');await wait(()=>ev("document.querySelector('#invite-message').textContent.startsWith('已复制')"),'fallback success');
 assert.equal(await ev('__copyCalls'),1);await click('#invite-ok');
 await ev("document.execCommand=()=>false");await click('.pending-invite');await wait(()=>ev("document.querySelector('#invite-message').textContent.startsWith('未能')"),'fallback denied');await click('#invite-close');
 await ev("document.querySelectorAll('.pending-group').forEach(g=>g.open=g.dataset.group==='交付一组')");
 await command('join');await click('#pending-refresh');await wait(()=>ev("document.querySelector('#pending-count').textContent==='3'"),'new joined removed');
 assert.deepEqual(await ev("[...document.querySelectorAll('.pending-group[open]')].map(g=>g.dataset.group)"),['交付一组'],'人数变化重绘保留各组状态');
 assert.equal(await ev("[...document.querySelectorAll('.pending-group')].find(g=>g.dataset.group==='交付一组').querySelector('.pending-group-count').textContent"),'1 人');
 assert.equal(await ev("document.querySelector('#pending-items').textContent.includes('待邀甲')"),false);
 await command('empty');await click('#pending-refresh');await wait(()=>ev("document.querySelector('#pending-count').textContent==='0'"),'all joined');
 assert.match(await ev("document.querySelector('#pending-items').textContent"),/所有同事都已加入/);
 await command('no-table');await click('#pending-refresh');await wait(()=>ev("document.querySelector('#pending-summary').textContent.includes('尚未同步')"),'no table');
 assert.equal(await ev("document.querySelector('#pending-count').textContent"),'—','未同步不能伪报0人');
 assert.deepEqual(errors,[]);
 console.log('PASS 待加入名单真实Chrome：左上入口/互斥名单、交付组/工号排序、XSS、3档宽度、真实剪贴板与LAN地址、权限拒绝/HTTP回退、加入后移除/全部加入/员工表未同步，零浏览器异常。');
}finally{
 if(ws)ws.close();
 await Promise.all([server,browser].filter(p=>p&&p.exitCode===null).map(p=>new Promise(resolve=>{p.once('exit',resolve);p.kill();setTimeout(()=>{if(p.exitCode===null)p.kill('SIGKILL');resolve();},2000).unref();})));
 await rm(dir,{recursive:true,force:true});
}
