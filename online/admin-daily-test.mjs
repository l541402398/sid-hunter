// 场次管理回归（取代旧每日唯一归档规则）：无HTTP/Chrome，不触碰真实库。
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{createRoom}=require('./room.js'),{createManager}=require('./manager.js');
const {createActivity,TEMPLATES,at,dayOf}=require('./server/activity.js'),{createStore}=require('./server/store.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let clock=at('2026-10-20','09:00'),passed=0,failed=0;const real=Date.now;Date.now=()=>clock;
function test(name,fn){try{fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack);}}
function memory(){let state=null,results=[];return{enabled:true,fail:false,loadAdmin(){return state?clone(state):null;},saveAdmin(s){if(this.fail)return false;state=clone(s);return true;},loadSessions(){return clone(results);},archiveSession(r,s){if(this.fail)return false;if(!results.some(x=>x.roundId===r.roundId))results.push(clone(r));state=clone(s);return true;}};}
function fixture(time='09:00',opts={}){clock=at('2026-10-20',time);const store=memory(),room=createRoom(),activity=createActivity({room,store});assert.equal(activity.saveConfig({...TEMPLATES.development,...opts,enabled:true}).ok,true);return{store,room,activity};}
const person=(r,s='p',emp='E1')=>r.join(s,null,{empNo:emp,name:'员工'+emp}).player;
const pair=[{id:'morning',label:'上午场',startTime:'09:00',endTime:'12:00'},{id:'afternoon',label:'下午场',startTime:'14:00',endTime:'17:00'}];
const use=(r,s,skill,target=0)=>r.useSkill(s,{commandId:Math.random().toString(),skill,targetId:target});
try{
test('默认每天一场、旧单时段迁移与时段重叠/跨日校验',()=>{
 const {activity}=fixture('08:59');assert.equal(activity.state().active,false);assert.equal(activity.state().config.slots.length,1);
 for(const slots of [[],[{id:'x',startTime:'10:00',endTime:'09:00'}],[...pair,{id:'overlap',startTime:'11:00',endTime:'13:00'}],[pair[0],pair[0]]])assert.equal(activity.saveConfig({slots}).ok,false);
 assert.equal(activity.saveConfig({startTime:'10:00',endTime:'16:00'}).ok,true);assert.equal(activity.state().config.slots[0].startTime,'10:00');assert.equal(dayOf(Date.parse('2026-10-19T16:00:00Z')),'2026-10-20');
});
test('同日上下午独立新场与存档，单场/当日/总分准确且不重复',()=>{
 const {room,activity}=fixture('08:59',{slots:pair});assert.ok(activity.guard());clock=at('2026-10-20','09:00');activity.tick();const first=room.room.roundId;person(room).score=12;person(room,'g','E2');
 clock=at('2026-10-20','12:00');activity.tick();assert.equal(activity.state().history.length,1);assert.equal(activity.state().active,false);
 clock=at('2026-10-20','14:00');activity.tick();assert.notEqual(room.room.roundId,first);assert.equal(room.room.players.length,0);const p=person(room,'p2');assert.equal(p.hp,3);assert.equal(p.skills.spy.chargesRemaining,2);p.score=8;person(room,'g2','E2');
 clock=at('2026-10-20','17:00');activity.tick();assert.equal(activity.state().history.length,2);const total=activity.state().totalRanking.find(p=>p.score===20);assert.ok(total);assert.equal(total.sessions,2);assert.equal(total.days,1);assert.equal(activity.state().dailyRanking.find(p=>p.key===total.key).score,20);activity.tick();assert.equal(activity.state().history.length,2);
});
test('同日可手动多场，每场独立积分，结束不关闭自动安排',()=>{
 const {room,activity}=fixture();person(room).score=7;activity.finishSession();assert.equal(activity.state().config.enabled,true);
 for(const score of [11,3]){assert.equal(activity.startManual({minutes:20,label:'测试'}).ok,true);assert.equal(room.room.players.length,0);person(room).score=score;activity.finishSession();}
 assert.equal(activity.state().history.length,3);assert.equal(activity.state().totalRanking[0].score,21);assert.equal(activity.state().totalRanking[0].sessions,3);activity.tick();assert.equal(activity.state().active,false);
});
test('未结算不能覆盖当前场，手动场时长校验且不可跨午夜',()=>{
 const {room,activity}=fixture();person(room).score=12;const rid=room.room.roundId;assert.equal(activity.startManual({minutes:5}).ok,false);assert.equal(room.room.roundId,rid);activity.finishSession();
 for(const minutes of [0,1.5,721])assert.equal(activity.startManual({minutes}).ok,false);clock=at('2026-10-20','23:50');assert.equal(activity.startManual({minutes:20}).ok,false);
});
test('立即结算上午场不取消下午场且重复结算不重加分',()=>{
 const {room,activity}=fixture('09:30',{slots:pair});person(room).score=10;const rid=room.room.roundId;activity.finishSession();activity.finishSession();assert.equal(activity.state().history.length,1);activity.tick();assert.equal(activity.state().active,false);clock=at('2026-10-20','14:00');activity.tick();assert.equal(activity.state().session.slotId,'afternoon');assert.notEqual(room.room.roundId,rid);
});
test('保存不结束当前场，改日程/自动开关次日生效，截止不变',()=>{
 const {room,activity}=fixture();person(room).score=9;const before=activity.state().session;
 assert.equal(activity.saveConfig({enabled:false,slots:[{id:'late',label:'新场',startTime:'10:00',endTime:'11:00'}],chargeIntervalMs:1200000}).ok,true);
 assert.equal(activity.state().active,true);assert.equal(activity.state().paused,false);assert.equal(activity.state().session.endsAt,before.endsAt);assert.equal(activity.guard(),'');assert.equal(activity.state().history.length,0);assert.equal(room.find(0).score,9);assert.equal(activity.state().scheduleEffective,'tomorrow');assert.equal(activity.state().plan.enabled,true);
 clock=at('2026-10-20','17:00');activity.tick();clock=at('2026-10-21','10:00');activity.tick();assert.equal(activity.state().active,false);assert.ok(activity.guard());
});
test('暂停技能/线索剩余时间不流逝、禁输入加入施技，继续平移而不延长截止',()=>{
 const {room,activity}=fixture();person(room,'bad');const good=person(room,'good','E2');assert.equal(use(room,'good','probe').ok,true);const due=good.skills.probe.nextChargeAt,clue=activity.state().cluePublication.nextAt;
 clock+=30000;activity.pause();const paused=clock;assert.equal(room.publicSnapshot().pausedAt,paused);clock+=600000;activity.tick();assert.equal(activity.state().paused,true);assert.ok(room.join('outsider','人').closed);assert.ok(use(room,'good','probe').closed);assert.equal(room.setIntent(good.id,{right:true}),false);
 assert.equal(room.privateSnapshot(good.id).me.skills.probe.chargesRemaining,1);assert.equal(good.skills.probe.nextChargeAt,due);assert.equal(activity.state().cluePublication.remainingMs,clue-paused);assert.equal(activity.state().cluePublication.nextAt,null);
 assert.equal(activity.resume().ok,true);assert.equal(good.skills.probe.nextChargeAt,due+600000);assert.equal(activity.state().cluePublication.nextAt,clue+600000);assert.equal(activity.state().session.endsAt,at('2026-10-20','17:00'));clock=due+600000;assert.equal(room.privateSnapshot(good.id).me.skills.probe.chargesRemaining,2);
});
test('暂停期间保存恢复/公布周期，技能保持已有剩余，线索新周期继续后起算',()=>{
 const {room,activity}=fixture();person(room,'bad');const good=person(room,'good','E2');use(room,'good','probe');clock+=10000;activity.pause();const due=good.skills.probe.nextChargeAt;clock+=300000;
 activity.saveConfig({chargeIntervalMs:1200000,clueIntervalMs:60000});assert.equal(good.skills.probe.nextChargeAt,due);assert.equal(activity.state().cluePublication.remainingMs,60000);activity.resume();assert.equal(activity.state().cluePublication.nextAt,clock+60000);assert.equal(good.skills.probe.nextChargeAt,due+300000);assert.equal(good.skills.probe.chargeIntervalMs,1200000);
});
test('暂停到原定截止仍结算，不能继续且不凭空恢复次数',()=>{
 const {room,activity}=fixture();person(room,'bad');const g=person(room,'good','E2');use(room,'good','probe');activity.pause();clock=at('2026-10-20','17:00');activity.tick();assert.equal(activity.state().active,false);assert.equal(activity.state().history.length,1);assert.equal(activity.resume().ok,false);assert.equal(g.skills.probe.chargesRemaining,1);
});
test('暂停状态重启后仍保持时钟，继续后累计暂停时长准确',()=>{
 const {room,activity,store}=fixture();person(room,'bad');const g=person(room,'good','E2');use(room,'good','probe');clock+=10000;activity.pause();const prior=store.loadAdmin(),due=g.skills.probe.nextChargeAt;clock+=120000;
 const restored=createRoom({restore:{...prior.liveSnapshot,includeNpcs:true}}),a=createActivity({room:restored,store,initial:prior});a.tick();assert.equal(a.state().paused,true);assert.equal(restored.privateSnapshot(1).me.skills.probe.chargesRemaining,1);a.resume();assert.equal(restored.find(1).skills.probe.nextChargeAt,due+120000);assert.equal(a.state().session.endsAt,at('2026-10-20','17:00'));
});
test('结算失败不清未归档场；继续失败回滚平移，修复后仅应用一次',()=>{
 const {room,activity,store}=fixture();person(room).score=31;const rid=room.room.roundId;store.fail=true;assert.equal(activity.finishSession().ok,false);assert.equal(activity.startManual({minutes:5}).ok,false);assert.equal(room.room.roundId,rid);assert.equal(room.find(0).score,31);
 store.fail=false;clock+=1001;activity.tick();assert.equal(activity.state().history.length,1);assert.equal(activity.state().totalRanking[0].score,31);activity.startManual({minutes:5});person(room,'b');const g=person(room,'g','E2');use(room,'g','probe');activity.pause();const due=g.skills.probe.nextChargeAt;clock+=30000;store.fail=true;assert.equal(activity.resume().ok,false);assert.equal(g.skills.probe.nextChargeAt,due);assert.equal(activity.state().paused,true);store.fail=false;clock+=1001;assert.equal(activity.resume().ok,true);assert.equal(g.skills.probe.nextChargeAt,due+31001);
});
test('手动开场请求去重、迟到旧场结算不得误伤新场',()=>{
 const {room,activity}=fixture();const old=room.room.roundId;activity.finishSession();const body={action:'start',expectedRoundId:old,commandId:'manual-request-001',minutes:10};assert.equal(activity.control(body).ok,true);const id=room.room.roundId;assert.equal(activity.control(body).alreadyApplied,true);assert.equal(room.room.roundId,id);assert.equal(activity.control({action:'finish',expectedRoundId:old}).ok,false);assert.equal(activity.state().active,true);assert.equal(activity.control({action:'finish',expectedRoundId:id}).ok,true);assert.equal(activity.control(body).alreadyApplied,true);
});
test('坏NPC三血安全点/不入积分，CAS与昵称凭证跨场累计不按重名合并',()=>{
 const {room,activity}=fixture();person(room).score=5;const b=room.join('guest1','同名').player;b.participantKey='browser1';b.score=2;const c=room.join('guest2','同名').player;c.participantKey='browser2';c.score=3;
 activity.addNpc({faction:'bad',count:1,floorId:2});const npc=room.room.players.find(p=>p.npc);assert.equal(npc.hp,3);assert.ok(Number.isFinite(npc.x));npc.score=999;activity.finishSession();activity.startManual({minutes:10});person(room,'new').score=6;const d=room.join('newguest','改名').player;d.participantKey='browser1';d.score=8;activity.finishSession();const ranks=activity.state().totalRanking;assert.equal(ranks.length,3);assert.deepEqual(ranks.map(r=>r.score),[11,10,3]);assert.equal(ranks[0].sessions,2);
});
test('次日自动新局新资源；旧daily版在局迁移为一场而非丢失',()=>{
 const {room,activity}=fixture();person(room).score=9;activity.finishSession();clock=at('2026-10-21','09:00');activity.tick();assert.equal(room.room.players.length,0);assert.equal(person(room,'new').hp,3);assert.equal(activity.state().totalRanking[0].score,9);
 const oldRoom=createRoom();oldRoom.join('old','历史人');const old={version:2,day:'2026-10-21',active:true,settled:false,config:{...TEMPLATES.production,enabled:true}};const a=createActivity({room:oldRoom,store:memory(),initial:old});assert.equal(a.state().active,true);assert.equal(a.state().session.endsAt,at('2026-10-21','17:00'));
});
test('管理场次控制需会话/CSRF/同源/确认，旧清空reset拒绝',()=>{
 const {room,activity}=fixture(),m=createManager({room,activity,passcode:'private-test',now:()=>clock});const req={headers:{host:'127.0.0.1:1',origin:'http://127.0.0.1:1'},socket:{remoteAddress:'127.0.0.1'}};
 try{assert.equal(m.control(req,null,{action:'finish'}).status,401);const login=m.login(req,{code:'private-test'}),token=login.cookie.split(';')[0].split('=')[1],csrfToken=login.body.csrfToken;assert.equal(m.control(req,token,{csrfToken:'bad',action:'finish'}).status,403);assert.equal(m.control({...req,headers:{...req.headers,origin:'http://evil'}},token,{csrfToken,confirm:true}).status,403);assert.equal(m.control(req,token,{csrfToken,action:'finish'}).status,400);assert.equal(m.control(req,token,{csrfToken,confirm:true,action:'pause',expectedRoundId:room.room.roundId}).status,200);assert.equal(m.reset(req,token,{csrfToken,confirm:true}).status,409);}finally{m.close();}
});
test('真实SQLite同日多场独立/重启总分不丢，旧daily兼容按round去重',()=>{
 const dir=mkdtempSync(join(new URL('../outputs/',import.meta.url).pathname,'session-db-'));let store;
 try{clock=at('2026-10-20','09:00');const file=join(dir,'test.sqlite');store=createStore({file});assert.equal(store.enabled,true);const r=createRoom(),a=createActivity({room:r,store});a.saveConfig({...TEMPLATES.development,enabled:true});person(r).score=10;a.finishSession();const first=store.loadSessions()[0];a.startManual({minutes:30});person(r,'new').score=20;a.finishSession();assert.equal(store.loadSessions().length,2);assert.equal(store.archiveSession({...first,ranking:[]},store.loadAdmin()),true);assert.equal(store.loadSessions().find(x=>x.roundId===first.roundId).ranking[0].score,10);
 store.archiveDay({...first,roundId:'legacy-distinct',label:'历史单日场'},store.loadAdmin());assert.equal(store.loadSessions().length,3);store.close();store=createStore({file});const prior=store.loadAdmin(),restored=createRoom({restore:{...prior.liveSnapshot,includeNpcs:true}}),b=createActivity({room:restored,store,initial:prior});assert.equal(b.state().history.length,3);assert.equal(b.state().totalRanking[0].score,40);assert.equal(store.loadDays().length,1);
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('暂停请求跨越紧邻场次边界，不得暂停新场；暂停到点自动换下场',()=>{
 const adjoining=[{id:'a',label:'第一场',startTime:'09:00',endTime:'10:00'},{id:'b',label:'第二场',startTime:'10:00',endTime:'11:00'}];
 const {room,activity}=fixture('09:00',{slots:adjoining});person(room).score=1;const old=room.room.roundId;activity.pause();clock=at('2026-10-20','10:00');
 const response=activity.control({action:'pause',expectedRoundId:old});assert.equal(response.ok,false);assert.equal(activity.state().session.slotId,'b');assert.equal(activity.state().paused,false);assert.equal(activity.state().history.length,1);
});
test('新场暂停/多次暂停无重复扣时，继续后恢复精确边界与人数线索不补发',()=>{
 const {room,activity}=fixture();person(room,'bad');const g=person(room,'good','E2');use(room,'good','probe');const due=g.skills.probe.nextChargeAt;
 for(const span of [20000,30000]){clock+=1000;activity.pause();const stamp=room.room.pausedAt;activity.pause();assert.equal(room.room.pausedAt,stamp);clock+=span;assert.equal(room.privateSnapshot(g.id).me.skills.probe.chargesRemaining,1);activity.resume();}
 assert.equal(g.skills.probe.nextChargeAt,due+50000);clock=due+50000-1;assert.equal(room.privateSnapshot(g.id).me.skills.probe.chargesRemaining,1);clock++;assert.equal(room.privateSnapshot(g.id).me.skills.probe.chargesRemaining,2);
 assert.ok(!room.find(0).systemClues);
});
test('存档禁用不允许手动开场或覆盖现有玩家',()=>{
 clock=at('2026-10-20','09:00');const r=createRoom();r.join('legacy','历史人');const s=memory();s.enabled=false;const a=createActivity({room:r,store:s});assert.equal(a.startManual({minutes:10}).ok,false);assert.equal(r.room.players.length,1);assert.ok(a.guard());
});
test('旧daily已结算当天不自动重开同一槽位，但可显式开测试场',()=>{
 clock=at('2026-10-20','11:00');const s=memory(),r=createRoom();const result={roundId:'old-round',day:'2026-10-20',startedAt:at('2026-10-20','09:00'),ranking:[{key:'old',name:'旧玩家',score:3}]};s.archiveSession(result,{});
 const a=createActivity({room:r,store:s,initial:{version:2,day:'2026-10-20',active:false,settled:true,config:{...TEMPLATES.development,enabled:true}}});a.tick();assert.equal(a.state().active,false);assert.equal(a.state().totalRanking[0].score,3);assert.equal(a.startManual({minutes:10}).ok,true);
});
test('玩家无开发危险面板，管理员当前场/安排/成绩三块分开',()=>{
 const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');assert.ok(!html.includes('js/markup/dev.js'));const ui=readFileSync(new URL('./public/manager.html',import.meta.url),'utf8');for(const id of ['session-pause','session-resume','session-finish','session-start','schedule-slots','schedule-add','history-session','session-ranking','daily-ranking','total-ranking'])assert.ok(ui.includes(`id="${id}"`),id);assert.ok(!ui.includes('id="game-open"'));assert.ok(!ui.includes('id="game-close"'));assert.ok(ui.includes('保存只修改设置'));
 assert.ok(!html.includes('js/markup/instructions.js'));assert.ok(!html.includes('href="/manager"'));assert.ok(!html.includes('admin-entry'));
 const client=readFileSync(new URL('./public/game.js',import.meta.url),'utf8');assert.ok(!client.includes("$('lan-address')"),'移除说明区域后，加入/重连不能引用已不存在的节点');
 assert.ok(html.includes('js/markup/rules.js'),'独立游戏规则入口保留');
 const routes=readFileSync(new URL('./server/routes/manager.js',import.meta.url),'utf8');assert.ok(routes.includes("pathname === '/manager'"),'管理员直达路由保留');
});
}finally{Date.now=real;}
console.log(`场次管理轻量回归 ${passed} PASS / ${failed} FAIL；无HTTP/Chrome。`);process.exitCode=failed?1:0;
