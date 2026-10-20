// VM执行真实管理JS：场次操作/草稿设置分离，不运行浏览器或HTTP服务。
import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{TEMPLATES}=require('./server/activity.js');
const html=readFileSync(new URL('./public/manager.html',import.meta.url),'utf8'),source=readFileSync(new URL('./public/manager.js',import.meta.url),'utf8');
const all=[],ids=new Map();function element(tag='div'){const e={tagName:tag.toUpperCase(),value:'',checked:false,hidden:false,textContent:'',dataset:{},children:[],append(...x){this.children.push(...x);},replaceChildren(){this.children=[];},click(){downloads.push({href:this.href,download:this.download});},remove(){this.removed=true;}};all.push(e);return e;}
for(const m of html.matchAll(/id="([^"]+)"/g))ids.set(m[1],element());
let state={activity:{config:{...TEMPLATES.development,enabled:false},templates:TEMPLATES,currentRoundId:'round-one',active:false,paused:false,session:null,cluePublication:{aliveBad:12,remaining:84,count:3,nextAt:0,lastCount:0},status:'当前休场',storageReady:true,history:[],dailyRanking:[],totalRanking:[]},current:{playerCount:0,aliveCount:0}};
let seq=0,confirmResult=true,exportStatus=200,poll;const calls=[],messages=[],downloads=[],revoked=[];
const body=element('body');
for(const id of ['module-session','module-settings','module-npc','module-scores','module-minigames']){assert.match(html,new RegExp(`<details[^>]+id="${id}"`));ids.get(id).open=true;}
assert.equal((html.match(/class="manager-result manager-module"/g)||[]).length,5);
const context={document:{hidden:false,body,getElementById:id=>{assert.ok(ids.has(id),'未知控件 '+id);return ids.get(id);},createElement:element,createTextNode:s=>s,querySelectorAll:()=>all.filter(e=>e.dataset.feature)},Date,console,crypto:{randomUUID:()=>`test-operation-${++seq}`},setInterval:fn=>{poll=fn;return 1;},setTimeout:fn=>{fn();return 1;},URL:{createObjectURL:()=> 'blob:test-excel',revokeObjectURL:url=>revoked.push(url)},
confirm:text=>{messages.push(text);return confirmResult;},fetch:async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,body,options});let data;
if(url.includes('/export-scores?'))return{ok:exportStatus===200,status:exportStatus,headers:{get:key=>key==='Content-Type'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'attachment; filename="S-ID-scores-2026-10-20.xlsx"'},blob:async()=>({size:1234}),json:async()=>({error:'管理会话已过期'})};
if(url.endsWith('/session'))data={authed:true,csrfToken:'csrf-test'};
else if(url.endsWith('/state'))data=JSON.parse(JSON.stringify(state));
else if(url.endsWith('/features'))data={ok:true,features:[{key:'rps',label:'猜拳',enabled:true}]};
else if(url.endsWith('/config')){state.activity.config={...body.config};data={ok:true,config:{...body.config},message:'已保存。日程从明天生效。'};}
else if(url.endsWith('/control')){
 if(body.action==='start'){state.activity.active=true;state.activity.session={label:body.label,startedAt:Date.now(),endsAt:Date.now()+body.minutes*60000};state.activity.currentRoundId='round-two';}
 if(body.action==='pause'){state.activity.paused=true;state.activity.cluePublication.paused=true;state.activity.cluePublication.remainingMs=60000;}
 if(body.action==='resume'){state.activity.paused=false;state.activity.cluePublication.paused=false;}
 if(body.action==='finish'){state.activity.active=false;state.activity.history.push({roundId:'round-two',day:'2026-10-20',label:'已结算测试场',startedAt:Date.now(),ranking:[{rank:1,name:'<b>名字</b>',score:8,alive:true}]});}
 data={ok:true};
}else data={ok:true};return{ok:true,status:200,json:async()=>data};}};
vm.runInNewContext(source,context);const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};await flush();
const writes=()=>calls.filter(c=>c.body),configWrites=()=>writes().filter(c=>c.url.endsWith('/config'));
assert.equal(ids.get('manager-app').hidden,false);assert.equal(ids.get('config-minutes').value,1);assert.ok(!ids.has('game-open'));assert.ok(!ids.has('game-close'));
ids.get('template-production').onclick();assert.equal(ids.get('config-minutes').value,20);assert.equal(ids.get('clue-minutes').value,30);assert.equal(ids.get('config-enabled').checked,false);assert.equal(writes().length,0);
ids.get('config-enabled').checked=true;ids.get('template-development').onclick();assert.equal(ids.get('config-enabled').checked,true);assert.equal(ids.get('clue-minutes').value,2);assert.match(ids.get('clue-preview').textContent,/下一轮预计 3 条/);
// 编辑上午场并新增下午场，只改草稿，不触发任何写请求。
let rows=ids.get('schedule-slots').children;assert.equal(rows.length,1);
rows[0].children[0].children[1].value='上午场';rows[0].children[0].children[1].oninput();rows[0].children[2].children[1].value='12:00';rows[0].children[2].children[1].oninput();
ids.get('schedule-add').onclick();assert.equal(ids.get('schedule-slots').children.length,2);assert.equal(writes().length,0);
ids.get('clue-percent').value=50;ids.get('clue-max').value=4;ids.get('clue-percent').oninput();assert.match(ids.get('clue-preview').textContent,/下一轮预计 4 条/);
ids.get('settings-form').onsubmit({preventDefault(){}});await flush();let save=configWrites().at(-1);assert.equal(save.body.config.slots.length,2);assert.equal(save.body.config.slots[0].label,'上午场');assert.equal(save.body.config.slots[0].endTime,'12:00');assert.equal(save.body.config.slots[1].startTime,'14:00');assert.equal(save.body.csrfToken,'csrf-test');assert.equal(save.body.confirm,true);assert.match(ids.get('config-message').textContent,/明天生效/);
// 手动开场不提交未保存的设置；版本绑定与二次确认。
ids.get('config-minutes').value=99;ids.get('manual-minutes').value=20;ids.get('manual-label').value='第二测试场';const n=configWrites().length;
await ids.get('session-start').onclick();await flush();let op=writes().at(-1).body;assert.equal(op.action,'start');assert.equal(op.expectedRoundId,'round-one');assert.equal(op.minutes,20);assert.ok(op.commandId);assert.equal(configWrites().length,n);assert.ok(!('config'in op));assert.equal(ids.get('config-minutes').value,99);assert.equal(ids.get('session-start').disabled,true);
await ids.get('session-pause').onclick();await flush();assert.equal(ids.get('session-resume').hidden,false);assert.match(ids.get('clue-live').textContent,/计时已暂停/);assert.equal(writes().at(-1).body.expectedRoundId,'round-two');
await ids.get('session-resume').onclick();await flush();assert.equal(ids.get('session-pause').hidden,false);assert.equal(configWrites().length,n);
confirmResult=false;const before=writes().length;await ids.get('session-finish').onclick();await flush();assert.equal(writes().length,before,'取消确认不发送结算');
confirmResult=true;await ids.get('session-finish').onclick();await flush();assert.equal(writes().at(-1).body.action,'finish');assert.equal(ids.get('session-start').disabled,false);assert.equal(ids.get('history-session').children.length,1);assert.equal(ids.get('history-session').value,'round-two');assert.ok(!source.includes('innerHTML'));
ids.get('npc-count').value=2;ids.get('npc-floor').value=3;await ids.get('npc-bad').onclick();assert.equal(writes().at(-1).body.faction,'bad');await ids.get('manager-features-save').onclick();assert.equal(writes().at(-1).body.csrfToken,'csrf-test');
// 原生details独立状态，不被5秒轮询和表格刷新重置，也不会提交表单。
ids.get('module-settings').open=false;ids.get('module-npc').open=false;await poll();await flush();assert.equal(ids.get('module-settings').open,false);assert.equal(ids.get('module-npc').open,false);assert.equal(ids.get('module-session').open,true);assert.equal(ids.get('config-minutes').value,99);
const countBeforeExport=writes().length;await ids.get('scores-export').onclick();assert.equal(downloads.length,1);assert.equal(downloads[0].download,'S-ID-scores-2026-10-20.xlsx');assert.equal(revoked[0],'blob:test-excel');assert.equal(writes().length,countBeforeExport);assert.equal(calls.at(-1).options.credentials,'same-origin');assert.ok(calls.at(-1).url.includes('roundId=round-two'));assert.equal(ids.get('scores-export').disabled,false);assert.match(ids.get('scores-export-message').textContent,/发起下载/);
exportStatus=401;await ids.get('scores-export').onclick();assert.equal(downloads.length,1,'未授权不可下载');assert.equal(ids.get('manager-app').hidden,true);assert.match(ids.get('scores-export-message').textContent,/会话已过期/);
console.log('PASS 模块折叠独立且轮询不重置、Excel选中场次下载与会话失效/资源清理；真实管理JS：双模板仅填值、动态上下午场、保存草稿、场次操作独立且确认/版本绑定、暂停/继续UI、手动多场与历史场选择、CSRF；无HTTP/Chrome。');
