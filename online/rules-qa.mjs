// Independent re-sign: rules dialog + canonical four skills. Never imports old QA runners.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const qaRunId=randomUUID();
console.log('QA-RUN-ID',qaRunId);
const root=dirname(fileURLToPath(import.meta.url)),NODE=process.execPath;
const CHROME=process.env.SID_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const files=['room.js','server.js','shared/world.js','public/game.js','public/index.html','public/styles.css'];
const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,createHash('sha256').update(await readFile(join(root,f))).digest('hex')])));
const beforeHashes=await hashes();
assert.equal(beforeHashes['public/index.html'],'a6f6fa9a158e2ab9fdd7a8fed90d600dbbf6e3d23ad09dd187b8132d4b3c406d','must test frozen final HTML');
const results=[],runtimeErrors=[],children=[],clients=[];
let fatal=null,port,base,serverLog='';
const freePort=()=>new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(label,fn,ms=7000){const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await delay(30);}throw Error('timeout: '+label);}
async function test(id,ac,name,fn){const proof={};try{await fn(proof);results.push({id,ac,name,status:'PASS',evidence:proof});console.log('PASS',id,name,JSON.stringify(proof).slice(0,320));}catch(e){results.push({id,ac,name,status:'FAIL',evidence:proof,error:e.message});console.log('FAIL',id,name,e.message,JSON.stringify(proof));}}
const require=createRequire(import.meta.url),{createRoom,SKILL_CONFIG,WORLD}=require(join(root,'room.js'));
const fixture=(n=4)=>{const r=createRoom();for(let i=0;i<n;i++)r.join('s'+i,'QA'+i);return r;};
const use=(r,i,skill,targetId=1,extra={})=>r.useSkill('s'+i,{commandId:randomUUID(),skill,targetId,...extra});
const clone=o=>JSON.parse(JSON.stringify(o));
const fullSid=p=>p.sid.segments.join('-');
function noForbiddenKeys(o,forbidden){return Object.keys(o).filter(k=>forbidden.includes(k));}
const judgeSamples=[
 ['forbidden hit',noForbiddenKeys({faction:'bad'},['faction']).length,1],
 ['forbidden miss',noForbiddenKeys({name:'QA'},['faction']).length,0],
 ['four ids equality',['probe','accuse','spy','kill'].sort().join(','),'accuse,kill,probe,spy'],
 ['SID uppercase hit',/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test('ABC-12A-A12'),true],
 ['SID lower miss',/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test('abc-12a-a12'),false],
 ['result count fail not pass',['PASS','FAIL','UNTESTED'].filter(x=>x==='PASS').length,1]
];
await test('J-01','AC-09','判定工具先自验',async p=>{p.samples=judgeSamples.map(([name,a,e])=>({name,actual:a,expected:e,pass:a===e}));p.passed=p.samples.filter(x=>x.pass).length;p.total=p.samples.length;assert.equal(p.passed,p.total);});
// Module execution provides exact authoritative state and controls only isolated in-memory fixtures.
await test('M-01','AC-01/AC-12','首位坏人四技能/其后好人两技能，初始2次/CD/格式',async p=>{
 const r=fixture();p.players=r.room.players.map(x=>({id:x.id,faction:x.faction,skills:clone(x.skills),sid:fullSid(x)}));
 assert.equal(r.find(0).faction,'bad');for(const x of r.room.players.slice(1))assert.equal(x.faction,'good');
 assert.deepEqual(Object.keys(r.find(0).skills).sort(),['accuse','kill','probe','spy']);assert.deepEqual(Object.keys(r.find(1).skills).sort(),['accuse','probe']);
 for(const x of r.room.players)for(const [id,s] of Object.entries(x.skills)){assert.equal(s.chargesRemaining,2);assert.equal(s.maxCharges,2);assert.equal(s.chargeIntervalMs,90000);assert.equal(s.cooldownMs,['spy','probe'].includes(id)?8000:12000);assert.equal(s.nextChargeAt,0);}
 for(const x of r.room.players)assert.match(fullSid(x),/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
});
await test('M-02','AC-12','probe双方只公开隐藏属性；spy坏人只公开SID',async p=>{
 p.runs=[];for(const actor of [0,1]){const r=fixture();const target=actor===0?1:2;const a=use(r,actor,'probe',target);const q=r.publicProjection(r.find(target));p.runs.push({actor,reply:a,public:q});assert.equal(a.ok,true);assert.equal(a.kind,'probe');assert.notEqual(q.traits.saying,'***');assert.equal(q.sid,'***-***-***');}
 const r=fixture(),a=use(r,0,'spy',1),q=r.publicProjection(r.find(1));p.spy={reply:a,public:q};assert.equal(a.ok,true);assert.equal(a.kind,'spy');assert.deepEqual(Object.values(q.traits),['***','***','***']);assert.equal(q.sid.split('-').filter(x=>x==='***').length,2);
});
await test('M-03','AC-12','双方accuse好人公开施法者自身SID；好人指认坏人扣血归零一次淘汰',async p=>{
 p.goodTarget=[];for(const actor of [0,1]){const r=fixture();const target=actor===0?1:2;const a=use(r,actor,'accuse',target);p.goodTarget.push({actor,reply:a,self:r.publicProjection(r.find(actor)),targetHp:r.find(target).hp,logs:r.publicSnapshot().logs});assert.equal(a.ok,true);assert.equal(r.find(target).hp,1);assert.equal(r.find(actor).sid.revealed.filter(Boolean).length,1);}
 const r=fixture();const first=use(r,1,'accuse',0);const hp1=r.find(0).hp;r.room.clockOffset+=13000;const second=use(r,1,'accuse',0);p.badTarget={first,hp1,second,hp2:r.find(0).hp,alive:r.find(0).alive,eliminateEvents:r.room.eliminateEvents};assert.equal(hp1,1);assert.equal(r.find(0).hp,0);assert.equal(r.find(0).alive,false);assert.equal(r.room.eliminateEvents,1);r.room.clockOffset+=13000;const again=use(r,2,'accuse',0);p.again=again;assert.equal(again.ok,false);assert.equal(r.room.eliminateEvents,1);
});
await test('M-04','AC-12','坏人四技能各自结算，不共享次数或CD',async p=>{
 const r=fixture();p.runs=[];for(const id of ['probe','spy','accuse','kill']){const reply=use(r,0,id,1,id==='kill'?{sid:'AAA-AAA-AAA'}:{});p.runs.push({id,reply,skills:clone(r.find(0).skills)});assert.equal(reply.ok,true);}
 for(const [id,s] of Object.entries(r.find(0).skills)){assert.equal(s.chargesRemaining,1,id);assert(s.cooldownUntil>r.now(),id);}
});
await test('M-05','AC-12','good不能spy/kill，未知/空skill拒绝，伪造归属无效',async p=>{
 const r=fixture(),before=clone(r.privateSnapshot(1).me);p.replies=[];
 for(const skill of ['spy','kill','bogus','',null,{},'__proto__']){const a=use(r,1,skill,2,{faction:'bad',actorId:0,hp:99,skills:{kill:{chargesRemaining:99}}});p.replies.push({skill,reply:a});assert.equal(a.ok,false);}
 assert.deepEqual(r.privateSnapshot(1).me,before);assert.equal(r.find(1).faction,'good');
});
await test('M-06','AC-12','旧action只按凭证映射；不能利用alias绕过good权限',async p=>{
 const r=fixture();const good=use(r,1,'action',2,{sid:fullSid(r.find(2)),faction:'bad'}),bad=use(r,0,'action',3,{sid:'AAA-AAA-AAA'});p.good=good;p.bad=bad;p.skills=clone(r.find(0).skills);assert.equal(good.kind,'accuse');assert.equal(r.find(2).alive,true);assert.equal(r.find(1).skills.accuse.chargesRemaining,1);assert.equal(bad.kind,'kill');assert.equal(r.find(0).skills.kill.chargesRemaining,1);assert.equal(r.find(0).skills.accuse.chargesRemaining,2);
});
await test('M-07','AC-12','禁止自选/淘汰目标/淘汰施法者；去重一次结算',async p=>{
 const r=fixture();p.self=[];for(const skill of ['probe','accuse','spy','kill']){const a=use(r,0,skill,0,{sid:fullSid(r.find(0))});p.self.push(a);assert.equal(a.ok,false);}
 const commandId=randomUUID(),a=use(r,0,'kill',1,{sid:fullSid(r.find(1)),commandId}),b=use(r,0,'kill',1,{sid:fullSid(r.find(1)),commandId});p.kill={a,b};assert.equal(a.ok,true);assert.equal(b.ok,false);p.dead=use(r,2,'probe',1);assert.equal(p.dead.ok,false);p.deadActor=use(r,1,'probe',2);assert.equal(p.deadActor.ok,false);assert.equal(r.room.eliminateEvents,1);
});
await test('M-08','AC-03/AC-13','0次离线长时间后首个privateSnapshot直接恢复2次',async p=>{
 const r=fixture();for(const skill of ['probe','spy','accuse','kill']){assert.equal(use(r,0,skill,1,skill==='kill'?{sid:'AAA-AAA-AAA'}:{}).ok,true);}
 r.room.clockOffset+=13000;for(const skill of ['probe','spy','accuse','kill'])assert.equal(use(r,0,skill,2,skill==='kill'?{sid:'AAA-AAA-AAA'}:{}).ok,true);
 p.before=clone(r.find(0).skills);for(const s of Object.values(r.find(0).skills))assert.equal(s.chargesRemaining,0);r.setOffline(0);r.room.clockOffset+=900000;
 const first=r.privateSnapshot(0);p.first=first.me.skills;p.online=r.find(0).online;assert.equal(p.online,false);for(const s of Object.values(first.me.skills)){assert.equal(s.chargesRemaining,2);assert.equal(s.nextChargeAt,0);}p.reads=1;
});
await test('M-09','AC-13','倒计时中再用一次不重置起点；90秒补1、180秒补2、满停止',async p=>{
 const r=fixture();assert.equal(use(r,0,'spy',1).ok,true);const original=r.find(0).skills.spy.nextChargeAt;r.room.clockOffset+=9000;assert.equal(use(r,0,'spy',2).ok,true);p.initialAt=original;p.secondAt=r.find(0).skills.spy.nextChargeAt;assert.equal(p.secondAt,original);r.room.clockOffset+=81001;const first=r.privateSnapshot(0).me.skills.spy;p.at90=first;assert.equal(first.chargesRemaining,1);assert.equal(first.nextChargeAt,original+90000);r.room.clockOffset+=90001;const full=r.privateSnapshot(0).me.skills.spy;p.at180=full;assert.equal(full.chargesRemaining,2);assert.equal(full.nextChargeAt,0);r.room.clockOffset+=900000;p.later=r.privateSnapshot(0).me.skills.spy;assert.equal(p.later.chargesRemaining,2);
});
await test('M-10','AC-05','kill严格大写、未知段/小写不消费、错SID消费并CD',async p=>{
 const r=fixture(),sid=fullSid(r.find(1));p.invalid=[];for(const input of [sid.toLowerCase(),'***-***-***','ABC','']){const a=use(r,0,'kill',1,{sid:input});p.invalid.push(a);assert.equal(a.ok,false);assert.equal(r.find(0).skills.kill.chargesRemaining,2);assert.equal(r.find(0).skills.kill.cooldownUntil,0);}
 p.wrong=use(r,0,'kill',1,{sid:sid==='AAA-AAA-AAA'?'BBB-BBB-BBB':'AAA-AAA-AAA'});assert.equal(p.wrong.ok,true);assert.equal(r.find(0).skills.kill.chargesRemaining,1);r.room.clockOffset+=13000;p.correct=use(r,0,'kill',1,{sid});assert.equal(p.correct.ok,true);assert.equal(r.find(1).alive,false);
});
await test('M-11','AC-06/AC-07','结束仅三种（badWiped/aliveFloor/timeUp）；小房间淘汰好人至存活2不结束',async p=>{
 p.rooms=[];
 // 旧「存活<=2 且有淘汰即结束」已废除：小房间淘汰好人只减少存活，不触发结束。
 for(const n of [1,2,3,4]){const r=fixture(n);if(n>2)use(r,0,'kill',1,{sid:fullSid(r.find(1))});const q={n,alive:r.publicSnapshot().aliveCount,finished:r.room.finished,reason:r.room.finishReason};p.rooms.push(q);assert.equal(q.finished,false,'n='+n+' 三条件均未命中不得结束');}
 // badWiped：两名好人各指认唯一坏人一次（hp 2→0）-> 坏人全灭，结束 + 排名 + 结算冻结。
 const w=fixture(3);use(w,1,'accuse',0);w.room.clockOffset+=13000;use(w,2,'accuse',0);
 assert.equal(w.room.finished,true);assert.equal(w.room.finishReason,'badWiped');
 assert.ok(Array.isArray(w.room.ranking)&&w.room.ranking.length===3);
 p.badWiped={reason:w.room.finishReason,ranking:w.room.ranking};
 const x=w.find(2).x;w.setIntent(2,{right:true});w.step(.05);assert.equal(w.find(2).x,x,'结束后移动冻结');
 assert.equal(use(w,1,'probe',2).ok,false,'结束后技能冻结');assert(w.join('new','new').error,'结束后拒绝加入');
 // aliveFloor：用 options.rules 降阈值制造“存活降到阈值”结束（不排名）。
 const f=createRoom({rules:{endRemainingPlayers:2}});f.join('a','QAa');f.join('b','QAb');f.join('c','QAc');
 f.useSkill('a',{commandId:randomUUID(),skill:'kill',targetId:1,sid:fullSid(f.find(1))});
 assert.equal(f.room.finished,true);assert.equal(f.room.finishReason,'aliveFloor');assert.equal(f.room.ranking,null);
 p.aliveFloor={reason:f.room.finishReason,alive:f.publicSnapshot().aliveCount};
 // timeUp：推进时钟越过时长上限 -> 结束 + 排名 + 公开 rules/score。
 const t=fixture(2);t.room.clockOffset+=WORLD.RULES.timeLimitMs;const snap=t.publicSnapshot();
 assert.equal(t.room.finished,true);assert.equal(t.room.finishReason,'timeUp');assert.ok(Array.isArray(t.room.ranking)&&t.room.ranking.length===2);
 assert.deepEqual(Object.keys(snap.rules).sort(),['endRemainingPlayers','endsAt','timeLimitMs']);
 assert.ok(snap.players.every(x=>typeof x.score==='number'));
 p.timeUp={reason:t.room.finishReason,ranking:t.room.ranking.length};
});
await test('M-12','AC-09','公开无faction/skills/hp；四项private只归本人',async p=>{
 const r=fixture();p.public=r.publicSnapshot();p.badKeys=Object.keys(r.privateSnapshot(0).me.skills);p.goodKeys=Object.keys(r.privateSnapshot(1).me.skills);
 for(const x of p.public.players){assert.deepEqual(noForbiddenKeys(x,['faction','skills','hp','sessionId','traitPublic','input']),[]);assert.equal(x.sid,'***-***-***');assert.deepEqual(Object.values(x.traits),['***','***','***']);}
 for(const x of p.public.players)assert(!JSON.stringify(p.public).includes(fullSid(r.find(x.id))));assert.deepEqual(p.badKeys.sort(),['accuse','kill','probe','spy']);assert.deepEqual(p.goodKeys.sort(),['accuse','probe']);
});
await test('M-13','AC-10/AC-14','错指认公共日志不写操作者/对错，私密通知仅本人SID公开不扣血',async p=>{
 const r=fixture();const before=r.publicSnapshot().logs.length;use(r,1,'accuse',2);p.newLogs=r.publicSnapshot().logs.slice(0,r.publicSnapshot().logs.length-before);p.event=r.privateSnapshot(1).me.pending.at(-1);assert.deepEqual(p.newLogs.map(x=>x.text),['QA2被指认一次。']);assert(!JSON.stringify(p.newLogs).includes('QA1'));assert(!/错指认|命中|失败|成功|扣血/.test(JSON.stringify(p.newLogs)));assert.match(p.event.text,/你的第1段S-ID已公开/);assert.equal(p.event.result.damaged,0);assert(!p.event.text.includes('你被扣'));assert(!/操作者|在线|离线/.test(p.event.text));
});
class Client{
 constructor(){this.ids=0;this.pending=new Map();}
 async launch(){this.profile=await mkdtemp(join(root,'../outputs/sid-rules-qa-'));this.port=await freePort();this.proc=spawn(CHROME,['--headless=new','--no-sandbox','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',`--remote-debugging-port=${this.port}`,`--user-data-dir=${this.profile}`,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});children.push(this.proc);this.chromeLog='';this.proc.stderr.on('data',x=>{this.chromeLog=(this.chromeLog+x).slice(-6000);});let pages;await until('chrome',async()=>{if(this.proc.exitCode!==null)throw Error('Chrome exited '+this.proc.exitCode+' '+this.chromeLog);try{pages=await(await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();return pages.length>0;}catch{return false;}},20000);this.ws=new WebSocket(pages.find(x=>x.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{this.ws.onopen=r;this.ws.onerror=j;});this.ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const cb=this.pending.get(m.id);if(cb){this.pending.delete(m.id);m.error?cb.j(Error(m.error.message)):cb.r(m.result);}}if(m.method==='Runtime.exceptionThrown')runtimeErrors.push(m.params);};await this.send('Runtime.enable');await this.send('Page.enable');await this.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});await this.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__qaStreamCalls=0;const E=window.EventSource;window.EventSource=class extends E{constructor(...a){window.__qaStreamCalls++;super(...a);}};window.__qaCanvasTexts=[];const f=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(t,...a){window.__qaCanvasTexts.push(String(t));if(window.__qaCanvasTexts.length>10000)window.__qaCanvasTexts.splice(0,5000);return f.call(this,t,...a);};`});}
 send(method,params={}){return new Promise((r,j)=>{const id=++this.ids,t=setTimeout(()=>j(Error('CDP timeout '+method)),60000);this.pending.set(id,{r:x=>{clearTimeout(t);r(x);},j:x=>{clearTimeout(t);j(x);}});this.ws.send(JSON.stringify({id,method,params}));});}
 async ev(expression){const a=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(a.exceptionDetails)throw Error(JSON.stringify(a.exceptionDetails));return a.result.value;}
 key(type,key,code,modifiers=0){return this.send('Input.dispatchKeyEvent',{type,key,code,modifiers,windowsVirtualKeyCode:key==='Escape'?27:key==='Tab'?9:key===' '?32:key.length===1?key.toUpperCase().charCodeAt(0):0});}
 async click(selector){const a=await this.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await this.send('Input.dispatchMouseEvent',{type,...a,button:'left',clickCount:1});}
 async boot(nick){await this.send('Page.navigate',{url:base});await until('join UI',()=>this.ev(`!!document.querySelector('#join-form')&&!document.querySelector('#join-page').hidden`));await this.ev(`document.querySelector('#nickname').value=${JSON.stringify(nick)};document.querySelector('#join-form').requestSubmit()`);await until('client ready',()=>this.ev(`document.querySelector('#join-page').hidden&&document.querySelector('#alive-count').textContent!=='0'`));return this.ev(`fetch('/api/state').then(x=>x.json())`);}
 async close(){this.ws?.close();if(this.proc?.exitCode===null){const done=new Promise(r=>this.proc.once('exit',r));this.proc.kill('SIGTERM');await Promise.race([done,delay(2000)]);}/* 保留 outputs 下的独立 Chrome profile，不递归删除。 */}
}
try{
 port=await freePort();assert.notEqual(port,8787);base=`http://127.0.0.1:${port}`;const srv=spawn(NODE,[join(root,'server.js')],{env:{...process.env,PORT:String(port),SID_TEST:'1'},stdio:['ignore','pipe','pipe']});children.push(srv);srv.stdout.on('data',x=>serverLog+=x);srv.stderr.on('data',x=>serverLog+=x);
 const api=async(path,body,token)=>{const res=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{'X-Sid-Session':token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:res.status,body:await res.json()};};
 await until('server',async()=>{try{return(await api('/api/state')).status===401;}catch{return false;}});
 const A=new Client(),B=new Client();clients.push(A,B);await A.launch();await B.launch();const a=await A.boot('验收坏人'),b=await B.boot('验收好人');const sessions=(await api('/api/test/sessions')).body.sessions;const ta=sessions.find(x=>x.playerId===a.me.id).sessionId,tb=sessions.find(x=>x.playerId===b.me.id).sessionId;
 const c=(await api('/api/join',{nickname:'存活同伴'})).body;const tc=c.sessionToken;
 await test('H-01','AC-12','真实HTTP权限拒绝unknown/spy/kill与伪造阵营',async p=>{p.replies=[];for(const skill of ['spy','kill','bogus']){const q=await api('/api/skill',{skill,commandId:randomUUID(),targetId:a.me.id,faction:'bad',actorId:a.me.id},tb);p.replies.push(q);assert.equal(q.status,400);assert.equal(q.body.ok,false);}p.good=(await api('/api/state',undefined,tb)).body.me.skills;assert(Object.values(p.good).every(s=>s.chargesRemaining===2));});
 await test('D-01','AC-15','规则入口紧邻公共日志，醒目琥珀；图解静态内容正确与占位',async p=>{
 p.dom=await A.ev(`(()=>{const e=document.querySelector('#rules-toggle'),r=document.querySelector('#rules-view'),s=getComputedStyle(e);return {previous:e.previousElementSibling.id,text:e.textContent,bg:s.backgroundImage,color:s.color,dialog:r.tagName,sections:r.querySelectorAll('.rule-section').length,colors:r.querySelectorAll('.rule-color-grid>div').length,masks:r.querySelectorAll('.rule-masks>div').length,skills:[...r.querySelectorAll('.rule-skill-grid h4')].map(x=>x.textContent),textRules:r.textContent}})()`);
 assert.equal(p.dom.previous,'log-toggle');assert.equal(p.dom.dialog,'DIALOG');assert(p.dom.bg.includes('243, 199, 115'));assert.equal(p.dom.colors,4);assert.equal(p.dom.masks,3);assert.equal(p.dom.skills.length,4);for(const word of ['100 人','A7C-9K2-3M8','每段3位','独立储存 2 次','90 秒','20 分钟','线索规则待补充','不代表你的身份','存活淘汰至剩余 100 人','坏人全灭','时间到（2 小时）','按分数排名','仅三种'])assert(p.dom.textRules.includes(word),word);
 });
 await test('D-12','AC-18','双方目标原文精确一致',async p=>{
 p.goals=await A.ev(`(()=>{const x=document.querySelector('[aria-label="双方目标"]');return [...x.querySelectorAll('article')].map(e=>({title:e.querySelector('strong').textContent,text:e.querySelector('p').textContent}))})()`);
 assert.deepEqual(p.goals,[{title:'好人目标',text:'保护好自己，指认坏人。'},{title:'坏人目标',text:'隐藏好自己，击杀他人。'}]);
 });
 await test('D-13','AC-18','技能操作路径精确一致',async p=>{
 p.path=await A.ev(`[...document.querySelector('[aria-label="技能操作路径"]').querySelectorAll('span')].map(x=>x.textContent)`);assert.deepEqual(p.path,['地图/名单','档案','展开私密','技能']);
 });
 await test('D-14','AC-18','线索为定期随机公布，不杜撰领取条件或具体周期',async p=>{
 p.clue=await A.ev(`(()=>{const e=[...document.querySelectorAll('#rules-view .rule-section')].find(e=>e.querySelector('h3').textContent==='线索规则待补充');return {flow:[...e.querySelectorAll('.mini-flow span')].map(x=>x.textContent),paragraph:e.querySelector('p').textContent,text:e.textContent}})()`);
 assert.deepEqual(p.clue.flow,['定期随机公布','坏人相关线索','辅助辨认']);assert.equal(p.clue.paragraph,'定期公布坏人线索尚未实现，周期、数量和内容待补充；与已实现的容器搜寻及 NPC 私密兑换不同。');assert(!p.clue.text.includes('领取'));assert(!/\d+\s*(秒|分钟|小时|条|个)/.test(p.clue.paragraph));
 });
 await test('D-02','AC-02/AC-16','打开dialog清移动不暂停世界，不创建新SSE',async p=>{
 await A.ev(`document.querySelector('#office').focus()`);await A.key('keyDown','d','KeyD');await delay(180);p.before=(await api('/api/state',undefined,ta)).body;p.streamBefore=await A.ev('window.__qaStreamCalls');p.serverStreamsBefore=(await api('/api/test/streams')).body;
 await api('/api/input',{right:true},tb);await A.click('#rules-toggle');await delay(200);const first=(await api('/api/state',undefined,ta)).body;await A.key('keyDown','d','KeyD');await delay(500);p.after=(await api('/api/state',undefined,ta)).body;p.streamAfter=await A.ev('window.__qaStreamCalls');p.serverStreamsAfter=(await api('/api/test/streams')).body;const own1=first.players.find(x=>x.id===a.me.id),own2=p.after.players.find(x=>x.id===a.me.id),peer1=first.players.find(x=>x.id===b.me.id),peer2=p.after.players.find(x=>x.id===b.me.id);p.positions={own1:own1.x,own2:own2.x,peer1:peer1.x,peer2:peer2.x};assert.equal(own1.x,own2.x);assert(peer2.x>peer1.x);assert(p.after.serverTime>p.before.serverTime);assert.equal(p.streamBefore,p.streamAfter);assert.equal(p.serverStreamsBefore.count,p.serverStreamsAfter.count);assert.equal(await A.ev(`document.querySelector('#rules-view').open`),true);await A.key('keyUp','d','KeyD');await api('/api/input',{},tb);await A.key('keyDown','Escape','Escape');await A.key('keyUp','Escape','Escape');
 });
 await test('D-03','AC-16','打开规则销毁我的信息、私密待确认及输入',async p=>{
 // ① 我的信息：打开后存在；进入规则页立即销毁。（产品中「我的信息」与「目标私密面板」互斥，故分两段覆盖同一销毁意图）
 await A.ev(`document.querySelector('#my-info').focus()`);await A.key('keyDown',' ','Space');await A.key('keyUp',' ','Space');
 p.mineBefore=await A.ev(`({mine:document.querySelector('#mine').childNodes.length,mineHidden:document.querySelector('#mine').hidden})`);assert(p.mineBefore.mine>0);assert.equal(p.mineBefore.mineHidden,false);
 await A.click('#rules-toggle');
 p.mineAfter=await A.ev(`({mine:document.querySelector('#mine').childNodes.length,mineHidden:document.querySelector('#mine').hidden,input:!!document.querySelector('#sid-input'),private:(document.querySelector('#private-content')?.childNodes.length)??0,dialog:document.querySelector('#rules-view').open})`);assert.equal(p.mineAfter.mine,0);assert.equal(p.mineAfter.mineHidden,true);assert.equal(p.mineAfter.private,0);assert.equal(p.mineAfter.input,false);assert.equal(p.mineAfter.dialog,true);await A.click('#rules-close');
 // ② 私密待确认（含 S-ID 输入）：展开并选中技能后进入规则页，私密 DOM、待确认输入一起销毁。
 await A.ev(`if(document.querySelector('#roster').hidden)document.querySelector('#roster-toggle').click();document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#roster-items [data-player="${b.me.id}"]').click();document.querySelector('#private-gate').click();document.querySelector('#kill').click();document.querySelector('#sid-input').value='AAA-AAA-AAA'`);
 p.before=await A.ev(`({private:document.querySelector('#private-content').childNodes.length,input:!!document.querySelector('#sid-input'),sid:document.querySelector('#sid-input')?document.querySelector('#sid-input').value:'',expanded:document.querySelector('#private-gate').getAttribute('aria-expanded')})`);assert(p.before.private>0);assert(p.before.input);assert.equal(p.before.sid,'AAA-AAA-AAA');assert.equal(p.before.expanded,'true');
 await A.click('#rules-toggle');
 p.after=await A.ev(`({mine:document.querySelector('#mine').childNodes.length,mineHidden:document.querySelector('#mine').hidden,private:document.querySelector('#private-content').childNodes.length,input:!!document.querySelector('#sid-input'),expanded:document.querySelector('#private-gate').getAttribute('aria-expanded'),dialog:document.querySelector('#rules-view').open})`);assert.equal(p.after.mine,0);assert.equal(p.after.mineHidden,true);assert.equal(p.after.private,0);assert.equal(p.after.input,false);assert.equal(p.after.expanded,'false');assert.equal(p.after.dialog,true);await A.click('#rules-close');
 });
 await test('D-04','AC-16','Esc/返回与Tab/ShiftTab焦点陷阱、返回入口焦点',async p=>{
 await A.click('#rules-toggle');p.focus=[];for(const modifiers of [0,1,0,1]){await A.key('keyDown','Tab','Tab',modifiers);await A.key('keyUp','Tab','Tab',modifiers);p.focus.push(await A.ev(`({id:document.activeElement.id,inside:document.querySelector('#rules-view').contains(document.activeElement)})`));}assert(p.focus.every(x=>x.inside));await A.key('keyDown','Escape','Escape');await A.key('keyUp','Escape','Escape');p.esc=await A.ev(`({open:document.querySelector('#rules-view').open,focus:document.activeElement.id,expanded:document.querySelector('#rules-toggle').getAttribute('aria-expanded')})`);assert.equal(p.esc.open,false);assert.equal(p.esc.focus,'rules-toggle');assert.equal(p.esc.expanded,'false');await A.click('#rules-toggle');await A.click('#rules-close');p.return=await A.ev(`({open:document.querySelector('#rules-view').open,focus:document.activeElement.id})`);assert.equal(p.return.open,false);assert.equal(p.return.focus,'rules-toggle');
 });
 await test('D-05','AC-15/AC-09','规则示例虚构，坏人/好人规则相同且不读取本人秘密',async p=>{
 const h1=await A.ev(`document.querySelector('#rules-view').innerHTML`),h2=await B.ev(`document.querySelector('#rules-view').innerHTML`);p.hashA=createHash('sha256').update(h1).digest('hex');p.hashB=createHash('sha256').update(h2).digest('hex');p.example='A7C-9K2-3M8';p.containsOwnSID=h1.includes(a.me.sid)||h1.includes(b.me.sid);p.containsNames=h1.includes(a.me.name)||h1.includes(b.me.name);assert.equal(h1,h2);assert.equal(p.containsOwnSID,false);assert.equal(p.containsNames,false);assert(h1.includes(p.example));
 });
 await test('D-06','AC-17','昵称<script>及<i>x</i>按字面文字，名单/target/mine不插入标签',async p=>{
 const names=['<script>','<i>x</i>','后续正常'];p.joined=[];for(const nickname of names)p.joined.push((await api('/api/join',{nickname})).body);await delay(200);await A.ev(`document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));if(document.querySelector('#roster').hidden)document.querySelector('#roster-toggle').click()`);p.list=await A.ev(`({rows:document.querySelectorAll('#roster-items [data-player]').length,names:[...document.querySelectorAll('#roster-items strong')].map(x=>x.textContent),script:document.querySelectorAll('#roster-items script').length,italic:document.querySelectorAll('#roster-items strong i').length})`);assert.equal(p.list.rows,6);assert.equal(p.list.script,0);assert.equal(p.list.italic,0);for(const n of names)assert(p.list.names.includes(n));const scriptId=p.joined[0].playerId;await A.ev(`document.querySelector('#roster-items [data-player="${scriptId}"]').click()`);p.target=await A.ev(`({name:document.querySelector('#target h2').textContent,scripts:document.querySelectorAll('#target script').length})`);assert.equal(p.target.name,'<script>');assert.equal(p.target.scripts,0);
 const token=p.joined[0].sessionToken;const C=B;await C.send('Network.enable');await C.send('Network.setCookie',{name:'sid_session',value:token,url:base});await C.ev(`localStorage.setItem('sid_session_token',${JSON.stringify(token)})`);await C.send('Page.navigate',{url:base});await until('reused browser initialized snapshot',()=>C.ev(`!!document.querySelector('#join-page')&&document.querySelector('#join-page').hidden&&document.querySelector('#alive-count').textContent==='6'`),15000);await C.send('Page.bringToFront');p.cState=await C.ev(`fetch('/api/state').then(x=>x.json()).then(x=>({id:x.me.id,name:x.me.name}))`);assert.equal(p.cState.name,'<script>');await C.ev(`document.querySelector('#my-info').focus()`);await C.key('keyDown',' ','Space');await C.key('keyUp',' ','Space');p.mine=await C.ev(`({text:document.querySelector('#mine h2').textContent,scripts:document.querySelectorAll('#mine script').length})`);assert(p.mine.text.includes('<script>'));assert.equal(p.mine.scripts,0);await C.send('Network.setCookie',{name:'sid_session',value:tb,url:base});await C.ev(`localStorage.setItem('sid_session_token',${JSON.stringify(tb)})`);await C.send('Page.navigate',{url:base});await until('B restored initialized',()=>C.ev(`!!document.querySelector('#alive-count')&&document.querySelector('#alive-count').textContent==='6'`),15000);p.restoredId=await C.ev(`fetch('/api/state').then(x=>x.json()).then(x=>x.me.id)`);assert.equal(p.restoredId,b.me.id);
 });
 await test('D-07','AC-15/AC-16','390×560小窗口dialog滚动可达底部且无横溢出',async p=>{
 await A.send('Emulation.setDeviceMetricsOverride',{width:390,height:560,deviceScaleFactor:1,mobile:false});await A.click('#rules-toggle');p.before=await A.ev(`(()=>{const r=document.querySelector('#rules-view'),b=r.getBoundingClientRect();return {clientHeight:r.clientHeight,scrollHeight:r.scrollHeight,scrollWidth:r.scrollWidth,clientWidth:r.clientWidth,viewport:innerWidth,viewportH:innerHeight,bounds:{x:b.x,y:b.y,width:b.width,height:b.height},overflow:getComputedStyle(r).overflowY}})()`);assert(p.before.viewport<=390,`窄窗宽 ${p.before.viewport}`);assert(p.before.viewportH<=560,`窄窗高 ${p.before.viewportH}`);assert(p.before.scrollHeight>p.before.clientHeight);assert.equal(p.before.overflow,'auto');assert(p.before.scrollWidth<=p.before.clientWidth);await A.ev(`document.querySelector('#rules-view').scrollTop=100000`);p.bottom=await A.ev(`(()=>{const r=document.querySelector('#rules-view');return {scrollTop:r.scrollTop,max:r.scrollHeight-r.clientHeight,lastSection:r.querySelector('.rule-section:last-child').getBoundingClientRect().bottom,viewport:innerHeight,dialogBottom:r.getBoundingClientRect().bottom}})()`);assert(Math.abs(p.bottom.scrollTop-p.bottom.max)<=1);assert(p.bottom.lastSection<=p.bottom.viewport,`末段底 ${p.bottom.lastSection} 视口 ${p.bottom.viewport}`);
 await A.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});await A.ev(`document.querySelector('#rules-view').scrollTop=100000;new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
 const shot=await A.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(join(root,'rules-qa-lower.png'),Buffer.from(shot.data,'base64'));p.screenshot=join(root,'rules-qa-lower.png');await A.click('#rules-close');
 });
 await test('D-08','AC-12','客户端坏人四个按钮/好人两个，自己的资源不外泄',async p=>{
 await A.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});for(const [cl,target] of [[A,b.me.id],[B,a.me.id]]){await cl.ev(`if(document.querySelector('#roster').hidden)document.querySelector('#roster-toggle').click();document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#roster-items [data-player="${target}"]').click();document.querySelector('#private-gate').click()`);}p.bad=await A.ev(`[...document.querySelectorAll('#private-content [data-skill]')].map(x=>x.dataset.skill)`);p.good=await B.ev(`[...document.querySelectorAll('#private-content [data-skill]')].map(x=>x.dataset.skill)`);assert.deepEqual(p.bad.sort(),['accuse','kill','probe','spy']);assert.deepEqual(p.good.sort(),['accuse','probe']);
 });
 await test('D-09','AC-08','淘汰者不画地图但保留名单档案',async p=>{
 const sid=(await api('/api/state',undefined,tc)).body.me.sid;const aliveBefore=Number(await A.ev(`document.querySelector('#alive-count').textContent`));const reply=await api('/api/skill',{skill:'kill',commandId:randomUUID(),targetId:c.playerId,sid},ta);p.reply=reply;assert.equal(reply.body.ok,true);
 await until('client processed elimination',async()=>Number(await A.ev(`document.querySelector('#alive-count').textContent`))<aliveBefore);
 await A.ev('window.__qaCanvasTexts=[]');await delay(150);p.mapTexts=await A.ev(`window.__qaCanvasTexts.filter(x=>x.includes('存活同伴'))`);await A.ev(`if(document.querySelector('#roster').hidden)document.querySelector('#roster-toggle').click()`);p.roster=await A.ev(`document.querySelector('#roster-items [data-player="${c.playerId}"]').textContent`);assert.deepEqual(p.mapTexts,[]);assert(p.roster.includes('淘汰'));
 });
 await test('D-10','AC-11','rAF180帧真实性能，只报间隔非GPU整帧',async p=>{
 p.sample=await A.ev(`new Promise(resolve=>{const a=[];let last;const f=t=>{if(last!==undefined)a.push(t-last);last=t;if(a.length<180)requestAnimationFrame(f);else{a.sort((x,y)=>x-y);resolve({frames:a.length,p50:a[90],p95:a[171],max:a[179]});}};requestAnimationFrame(f);})`);assert.equal(p.sample.frames,180);
 });
 await test('D-11','AC-12','浏览器四技能确认真正调用canonical接口并独立扣次',async p=>{
 await api('/api/test/advance',{ms:900000});await delay(150);p.runs=[];
 for(const id of ['probe','spy','accuse','kill']){
 await A.ev(`if(document.querySelector('#roster').hidden)document.querySelector('#roster-toggle').click();document.querySelector('#search').value='';document.querySelector('#search').dispatchEvent(new Event('input'));document.querySelector('#roster-items [data-player="${b.me.id}"]').click();document.querySelector('#private-gate').click()`);
 const before=(await api('/api/state',undefined,ta)).body.me.skills;assert.equal(await A.ev(`document.querySelector('#${id}').disabled`),false,id+' should be enabled');
 await A.ev(`document.querySelector('#${id}').click();${id==='kill'?"document.querySelector('#sid-input').value='AAA-AAA-AAA';":''}document.querySelector('#confirm').click()`);
 await until('UI '+id+' charge decrement',async()=>{const s=(await api('/api/state',undefined,ta)).body.me.skills;return s[id].chargesRemaining===before[id].chargesRemaining-1;});
 await until('UI '+id+' response result',()=>A.ev(`!!document.querySelector('#result-host')&&document.querySelector('#result-host').textContent.length>0`));const after=(await api('/api/state',undefined,ta)).body.me.skills;p.runs.push({id,before,after,result:await A.ev(`document.querySelector('#result-host').textContent`)});for(const k of Object.keys(before))if(k!==id)assert.equal(after[k].chargesRemaining,before[k].chargesRemaining,id+' must not debit '+k);
 }
 });
 await test('H-02','AC-03/AC-13','HTTP离线0次充能：无SSE读取，首次state立即满2',async p=>{
 const j=(await api('/api/join',{nickname:'离线充能'})).body,token=j.sessionToken;for(const targetId of [a.me.id,b.me.id]){const z=await api('/api/skill',{skill:'probe',commandId:randomUUID(),targetId},token);p['probe'+targetId]=z;assert.equal(z.body.ok,true);if(targetId===a.me.id)await api('/api/test/advance',{ms:9000});}const control=new AbortController();const response=await fetch(base+'/api/stream',{headers:{'X-Sid-Session':token},signal:control.signal});await response.body.getReader().read();control.abort();await until('offline',async()=>!(await api('/api/test/state')).body.players.find(x=>x.id===j.playerId).online);const raw=(await api('/api/test/state')).body.players.find(x=>x.id===j.playerId);p.before=raw.skills.probe;assert.equal(p.before.chargesRemaining,0);await api('/api/test/advance',{ms:900000});const first=await api('/api/state',undefined,token);p.first=first.body.me.skills.probe;assert.equal(p.first.chargesRemaining,2);assert.equal(p.first.nextChargeAt,0);
 });
}catch(e){fatal=e.stack||String(e);console.error('FATAL',fatal);}finally{
 for(const c of clients){try{await c.close();}catch{}}
 for(const child of children){if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await Promise.race([done,delay(2000)]);}}
}
const afterHashes=await hashes(),stable=JSON.stringify(beforeHashes)===JSON.stringify(afterHashes);
const report={date:new Date().toISOString(),command:`${NODE} ${join(root,'rules-qa.mjs')}`,port,engine:'Node22 + isolated module execution + actual HTTP/SSE + Chrome CDP temporary profiles',beforeHashes,afterHashes,stable,fatal,summary:{passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length,total:results.length},results,runtimeErrors,serverLog,limitations:['物理Alt-Tab、物理断网/休眠未测；离线为真实SSE连接关闭','Safari/Firefox及真实跨机LAN未测','高DPI/GPU整帧呈现、浏览器原生自动补全未测','正式20分钟恢复、正式100人/时长只核对说明与配置，未切换构建运行；待补充项不视作缺陷','昵称转义验证script/i正文，不据此声称所有XSS payload不可执行','世界继续用另一玩家移动及服务时间实测；规则打开后本人不移动不等于暂停世界']};
await writeFile(join(root,'rules-qa-report.json'),JSON.stringify(report,null,2));console.log('FINAL',JSON.stringify(report.summary),'stable',stable,'fatal',!!fatal);if(fatal||!stable||report.summary.failed||runtimeErrors.length)process.exitCode=1;
