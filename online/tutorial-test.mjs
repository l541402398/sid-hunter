import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), T = require('./public/tutorial/model.js');
function profile(room) {
  assert.equal(room.state.step,2);room.viewProfile();
  assert.equal(room.state.phase,'mine-faction');
  for(const phase of ['mine-colors','mine-traits','mine-close']){room.event('next');assert.equal(room.state.phase,phase);}
  room.event('mine-close');assert.equal(room.state.step,3);
}
function clues(room) {
  assert.equal(room.state.phase,'clues-countdown');
  assert.equal(room.state.cluesLeft,5);
  for(let i=0;i<51;i++)room.tick(.1);
  assert.equal(room.state.cluesPublished,true);assert.equal(room.readClues(),false);
  room.event('next');assert.equal(room.state.phase,'clues-open');
  assert.equal(room.state.cluesPublished,true);room.readClues();assert.equal(room.state.phase,'clues-card');
  room.event('next');room.event('clues-close');assert.equal(room.state.step,4);
}
function roster(room) {
  room.event('roster-open');assert.equal(room.state.phase,'roster-search');room.event('search');room.event('alpha-open');assert.equal(room.state.step,5);
  assert.equal(room.state.phase,'target-colors');
  assert.equal(room.event('confirm-open'),false);
  assert.equal(room.accuse('alpha'),false);
  room.event('next');assert.equal(room.state.phase,'accuse');room.event('confirm-open');
}
test('七步教程按顺序完成：逐项讲解、搜索指认、确认两处血量后才完成',()=>{
  const room=T.create();assert.equal(room.explore(),false);
  for(let i=0;i<18;i++)room.move(1,0,.05);assert.equal(room.state.step,1);
  for(let i=0;i<18;i++)room.move(1,-1,.05);assert.ok(room.nearDesk());
  assert.equal(room.explore(),true);assert.equal(room.state.phase,'explore-close');assert.equal(room.state.step,1);
  assert.equal(room.explore(),false);assert.equal(room.state.player.score,2);assert.equal(room.event('loot-close'),true);
  profile(room);clues(room);roster(room);assert.equal(room.accuse('alpha'),true);
  assert.equal(room.state.npcHp,2);assert.equal(room.state.step,5);assert.equal(room.state.phase,'target-close');assert.equal(room.state.player.score,12);
  assert.equal(room.accuse('alpha'),false);room.event('target-close');assert.equal(room.state.step,6);
  room.event('next');assert.equal(room.state.step,7);assert.equal(room.state.phase,'complete');
});
test('阶段不能越过讲解、关闭、搜索和确认，误指认可重试且不提前完成',()=>{
  const room=T.create({step:2});assert.equal(room.event('mine-close'),false);assert.equal(room.event('next'),false);
  profile(room);assert.equal(room.readClues(),false);clues(room);assert.equal(room.accuse('alpha'),false);roster(room);
  for(let i=0;i<3;i++)assert.equal(room.accuse('beta'),false);assert.equal(room.state.player.hp,3);assert.match(room.state.result,/休战/);
  assert.ok(room.accuse('alpha'));assert.equal(room.state.step,5);assert.equal(room.event('next'),false);
});
test('每个练习角色独立，练习操作不修改外部角色数据',()=>{
  const live={hp:3,score:99,faction:'bad',x:900,y:500};const a=T.create({step:5,...live}),b=T.create({step:5});
  a.event('next');a.event('confirm-open');a.accuse('beta');a.accuse('alpha');assert.equal(live.hp,3);assert.equal(live.score,99);assert.equal(b.state.npcHp,3);assert.equal(b.state.player.score,2);
});
test('恢复检查点包含前置线索与正确血量，边界和家具仍有碰撞',()=>{
  assert.deepEqual(T.normalizeProgress({step:999}),{step:7,completed:true,dismissed:false});assert.equal(T.normalizeProgress({step:'4'}).step,0);
  const resume=T.create({step:6});assert.equal(resume.state.npcHp,2);assert.equal(resume.state.player.score,12);assert.equal(resume.state.phase,'health');
  const room=T.create();for(let i=0;i<1000;i++)room.move(-1,-1,10);assert.ok(room.state.player.x>=46&&room.state.player.y>=175);
});

test('移动教学允许任意方向走动，但碰墙不能累计进度',()=>{
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const room=T.create(null,{spawn:{x:300,y:400},collides:()=>false});
    for(let i=0;i<9;i++)room.move(dx,dy,.05);
    assert.equal(room.state.step,1);
  }
  const blocked=T.create(null,{collides:()=>true});
  for(let i=0;i<20;i++)blocked.move(1,0,.05);
  assert.equal(blocked.state.step,0);assert.equal(blocked.state.player.walk,0);
});
test('取消指认确认后回到指认引导，可重新确认且不改变生命与积分',()=>{
  const room=T.create({step:5});room.event('next');room.event('confirm-open');
  const before=JSON.stringify([room.state.player,room.state.npcHp]);
  assert.equal(room.event('cancel'),true);assert.equal(room.state.phase,'accuse');
  assert.equal(room.accuse('alpha'),false);assert.equal(JSON.stringify([room.state.player,room.state.npcHp]),before);
  room.event('confirm-open');assert.equal(room.accuse('alpha'),true);
});
