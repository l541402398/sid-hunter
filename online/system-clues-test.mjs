// 系统定时公布轻量集成：虚拟时钟、真实room和独立SQLite，不启动HTTP/浏览器。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const require=createRequire(import.meta.url);
const {createRoom}=require('./room.js');
const {createBadPool}=require('./room/badpool.js');
const {createActivity,TEMPLATES,at}=require('./server/activity.js');
const {createStore}=require('./server/store.js');
const clone=x=>JSON.parse(JSON.stringify(x));
let t=at('2026-10-20','09:00'),passed=0,failed=0;
const realNow=Date.now;Date.now=()=>t;
function test(name,fn){try{fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.stack);}}
function mem(){let state=null,days=[];return{enabled:true,fail:false,writes:0,loadAdmin(){return state?clone(state):null;},saveAdmin(s){if(this.fail)return false;this.writes++;state=clone(s);return true;},loadSessions(){return clone(days);},archiveSession(d,s){if(this.fail)return false;days.push(clone(d));state=clone(s);return true;},saveRound(){return !this.fail;}};}
function f(input={}){t=at('2026-10-20','09:00');const room=createRoom(),store=mem(),activity=createActivity({room,store});assert.equal(activity.saveConfig({...TEMPLATES.development,...input,enabled:true}).ok,true);room.join('a','首个坏人');room.join('b','好人');return{room,store,activity};}
const total=r=>r.room.players.reduce((n,p)=>n+Object.keys(p.systemClues?.colors||{}).length+Object.keys(p.systemClues?.traits||{}).length,0);
const next=a=>a.state().cluePublication.nextAt;
try{
test('开发2分钟/生产30分钟默认，管理员全参数校验且无效设置不覆盖',()=>{
 assert.equal(TEMPLATES.development.clueIntervalMs,120000);assert.equal(TEMPLATES.production.clueIntervalMs,1800000);
 const {activity}=f();const before=activity.state().config;
 for(const patch of [{clueIntervalMs:0},{clueIntervalMs:1500},{clueIntervalMs:86401000},{cluePercent:0},{cluePercent:101},{cluePercent:'20'},{clueMin:0},{clueMin:6,clueMax:5},{clueMax:1001},{clueMax:1.5}]){
  assert.equal(activity.saveConfig(patch).ok,false,JSON.stringify(patch));assert.deepEqual(activity.state().config,before);
 }
 assert.equal(activity.saveConfig({clueIntervalMs:245000,cluePercent:25,clueMin:2,clueMax:8}).ok,true);
 assert.equal(activity.state().config.clueIntervalMs,245000);
});
test('公布条数按20%向上取整，最低最高上限，无存活坏人0条',()=>{
 const room=createRoom();room.join('a','首个坏人');room.join('b','好人');
 for(let i=0;i<5;i++)room.spawnNpc(5,{floorId:1},'bad');
 for(const [n,want] of [[0,0],[1,1],[5,1],[6,2],[10,2],[11,3],[15,3],[16,4],[20,4],[21,5],[26,5]]){
  room.room.players.filter(p=>p.faction==='bad').forEach((p,i)=>{p.alive=i<n;});
  const s=room.systemCluePreview(TEMPLATES.production);assert.equal(s.aliveBad,n);assert.equal(s.count,want);
 }
});
test('跨过精确到期点仅公布一轮，系统池与探查/公开档案隔离',()=>{
 const {room,activity}=f();const bad=room.find(0);assert.equal(room.useSkill('b',{commandId:'probe',skill:'probe',targetId:0}).ok,true);
 assert.equal(total(room),0);const reveal=clone(bad.traitPublic);const due=next(activity);
 t=due-1;activity.tick();assert.equal(total(room),0);
 t++;activity.tick();assert.equal(total(room),1);assert.equal(activity.state().cluePublication.lastCount,1);assert.deepEqual(bad.traitPublic,reveal);
 const stable=clone(bad.systemClues);for(let i=0;i<10;i++)activity.tick();assert.deepEqual(bad.systemClues,stable);
 assert.equal(next(activity),due+120000);
});
test('大池不放回、每轮优先不同人，全员选过后允许再抽，全部7字段可选',()=>{
 const names={hair:['棕'],top:['蓝'],pants:['黑'],shoes:['白']};
 const players=Array.from({length:4},(_,i)=>({id:i,faction:i===3?'good':'bad',alive:true,colors:clone(names),traits:{saying:'一',food:'二',sport:'三'},traitPublic:{saying:true,food:true,sport:true}}));
 let serial=0;
 const pool=createBadPool({room:{players},randomInt:(lo,hi)=>hi===1000000?++serial:lo,randomUUID:()=>`test-slot-${serial}`});
 const batch=pool.publishBatch(5);assert.equal(batch.length,5);assert.equal(new Set(batch.slice(0,3).map(p=>p.playerId)).size,3);
 assert.equal(new Set(batch.map(p=>`${p.playerId}-${p.group}-${p.field}`)).size,5);
 assert.ok(players[3].systemClues===undefined);assert.equal(pool.candidates().length,16);
 assert.equal(pool.publishBatch(99).length,16);assert.equal(pool.candidates().length,0);assert.equal(pool.publishBatch(1).length,0);
 for(const p of players.slice(0,3)){assert.equal(Object.keys(p.systemClues.colors).length,4);assert.equal(Object.keys(p.systemClues.traits).length,3);}
});
test('淘汰者不抽、离线存活者可抽、无可公布字段按真实剩余条数且不刷重复',()=>{
 const {room,activity}=f({cluePercent:100,clueMin:5,clueMax:5});room.spawnNpc(2,{floorId:1},'bad');
 const bad=room.find(0);room.setOffline(0);room.room.players.find(p=>p.npc).alive=false;
 const liveNpc=room.room.players.filter(p=>p.npc&&p.alive)[0];
 for(const field of ['hair','top','pants','shoes'])room.publishSystemClue(liveNpc.id,'colors',field);
 for(const field of ['saying','food','sport'])room.publishSystemClue(liveNpc.id,'traits',field);
 assert.equal(activity.state().cluePublication.aliveBad,2);t=next(activity);activity.tick();assert.equal(total(room),12); // 7预先公布+离线坏人5项
 assert.equal(room.room.players.find(p=>p.npc&&!p.alive).systemClues,undefined);
 t=next(activity);activity.tick();assert.equal(activity.state().cluePublication.lastCount,2);
 const before=total(room);t=next(activity);activity.tick();assert.equal(total(room),before);assert.equal(activity.state().cluePublication.count,0);
});
test('服务暂停只补一轮，下一次为未来时间，截止/关闭/已结束不公布',()=>{
 const {room,activity}=f();const due=next(activity);t=due+120000*8+500;activity.tick();assert.equal(total(room),1);assert.ok(next(activity)>t);
 const before=total(room);t=at('2026-10-20','17:00');activity.tick();assert.equal(total(room),before);assert.equal(next(activity),null);
 const g=f();g.activity.finishSession();t+=999999;g.activity.tick();assert.equal(total(g.room),0);assert.equal(next(g.activity),null);
 const h=f();h.room.finish();t+=120000;h.activity.tick();assert.equal(total(h.room),0);assert.equal(next(h.activity),null);
});
test('改比例/条数不延期，改间隔从保存时计时；保存失败回滚配置与时间',()=>{
 const {room,store,activity}=f();const due=next(activity);t+=30000;
 assert.equal(activity.saveConfig({cluePercent:50,clueMin:2,clueMax:6}).ok,true);assert.equal(next(activity),due);
 assert.equal(activity.saveConfig({clueIntervalMs:300000}).ok,true);assert.equal(next(activity),t+300000);const saved=next(activity);
 store.fail=true;assert.equal(activity.saveConfig({clueIntervalMs:10000}).ok,false);assert.equal(activity.state().config.clueIntervalMs,300000);
 store.fail=false;t+=1001;activity.tick();assert.equal(next(activity),saved);assert.equal(total(room),0);
});
test('公布写盘失败不外泄、不前进，修复重试一轮且不重复',()=>{
 const {room,store,activity}=f();const beforeLogs=clone(room.room.logs),due=next(activity);store.fail=true;t=due;activity.tick();assert.ok(activity.state().error);assert.equal(total(room),0);
 assert.deepEqual(room.publicSnapshot().badSlots[0].systemClues,{colors:{},traits:{}});
 assert.equal(store.loadAdmin().clueSchedule.nextAt,due);
 assert.deepEqual(room.room.logs,beforeLogs,'失败公布的黄色日志也要回滚');
 store.fail=false;t+=1001;activity.tick();assert.equal(total(room),1);const after=next(activity);activity.tick();assert.equal(total(room),1);assert.equal(next(activity),after);
});
test('次日重置公布记录与时间，昨日归档保留系统记录',()=>{
 const {room,activity}=f();t=next(activity);activity.tick();assert.equal(total(room),1);t=at('2026-10-20','17:00');activity.tick();
 t=at('2026-10-21','09:00');activity.tick();assert.equal(room.room.players.length,0);room.join('next','新局坏人');room.join('nextgood','好人');assert.equal(total(room),0);assert.equal(next(activity),t+120000);
});
test('旧生产配置补默认30分钟，旧版本无时间状态不会补发历史线索',()=>{
 const g=f();const state=g.store.loadAdmin();state.config={template:'production',enabled:true,startTime:'09:00',endTime:'17:00',chargeIntervalMs:1200000};delete state.clueSchedule;
 const room=createRoom({restore:{...state.liveSnapshot,includeNpcs:true}});t+=3600000;
 const activity=createActivity({room,store:g.store,initial:state});activity.tick();assert.equal(activity.state().config.clueIntervalMs,1800000);assert.equal(next(activity),t+1800000);assert.equal(total(room),0);
});
test('SQLite重开数据库后保持公布时间及字段，不重复已成功轮次',()=>{
 const dir=mkdtempSync(join(new URL('../outputs/',import.meta.url).pathname,'system-clue-db-'));let store;
 try{
  t=at('2026-10-20','09:00');const file=join(dir,'test.sqlite');store=createStore({file});assert.equal(store.enabled,true);
  const room=createRoom(),activity=createActivity({room,store});activity.saveConfig({...TEMPLATES.development,enabled:true});room.join('db','坏人');room.join('dbg','好人');
  t=next(activity);activity.tick();assert.equal(total(room),1);const due=next(activity);store.close();
  store=createStore({file});const prior=store.loadAdmin();assert.equal(prior.clueSchedule.nextAt,due);
  const restored=createRoom({restore:{...prior.liveSnapshot,includeNpcs:true}});const a=createActivity({room:restored,store,initial:prior});a.tick();assert.equal(total(restored),1);assert.equal(next(a),due);
  t=due;a.tick();assert.equal(total(restored),2);store.close();store=null;
 }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
test('系统公布带结构化黄色日志且只有匿名序号和已公布字段，无坏人身份关联',()=>{
 const {room,activity,store}=f({clueMin:2,clueMax:2});
 t=next(activity);activity.tick();
 const messages=room.publicSnapshot(1).logs.filter(e=>e.type==='systemClue');
 assert.equal(messages.length,2);assert.deepEqual(messages,room.publicSnapshot(0).logs.filter(e=>e.type==='systemClue'));
 for(const entry of messages){
  assert.match(entry.text,/^系统公布：坏人01的.+为「.+」。$/);
  assert.deepEqual(Object.keys(entry).sort(),['text','time','type']);
  assert.ok(!entry.text.includes('首个坏人'));assert.ok(!entry.text.includes(room.find(0).sid.segments.join('-')));
  const fields={...room.find(0).systemClues.colors,...room.find(0).systemClues.traits};assert.ok(Object.values(fields).some(value=>entry.text.includes('「'+value+'」')));
 }
 assert.equal(store.loadAdmin().liveSnapshot.logs.filter(e=>e.type==='systemClue').length,2);
 activity.tick();assert.equal(room.room.logs.filter(e=>e.type==='systemClue').length,2);
});
}finally{Date.now=realNow;}
console.log(`系统定时线索检查 ${passed} PASS / ${failed} FAIL；未启动游戏服务或浏览器。`);process.exitCode=failed?1:0;
