// Lightweight in-process room + UI-function regression. No HTTP server or browser is started.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { createRoom, SKILL_CONFIG, WORLD } = require('./room.js');
let passed = 0, failed = 0, seq = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('PASS', name); }
  catch (e) { failed++; console.error('FAIL', name, e.stack); }
}
function fixture() {
  const r = createRoom({ random: () => 0.2 });
  for (let i = 0; i < 6; i++) r.join('charge-session-' + i, '测试' + i);
  return r;
}
function use(r, actor, skill, target = 2, extra = {}) {
  return r.useSkill(r.find(actor).sessionId, { commandId: 'charges-' + (++seq), skill, targetId: target, ...extra });
}
await test('坏人新建/重开3血，三次不同好人指认进入休战；同目标日限一次；保护期内不可连打', () => {
  const r = fixture();
  const bad = r.room.players.find(p => p.faction === 'bad');
  const goods = r.room.players.filter(p => p.faction === 'good');
  assert.ok(bad && goods.length >= 3);
  assert.equal(bad.hp, 3);
  assert.equal(Object.keys(bad.skills).join(','), 'assassinate');
  assert.equal(use(r, goods[0].id, 'accuse', bad.id).ok, true); assert.equal(bad.hp, 2); assert.equal(bad.alive, true);
  assert.ok(bad.protectUntil > r.now());
  const duringProtect = use(r, goods[1].id, 'accuse', bad.id);
  assert.equal(duringProtect.ok, false); assert.match(duringProtect.error, /保护/);
  assert.equal(goods[1].skills.accuse.chargesRemaining, 1, '保护期内无效操作不扣次');
  bad.protectUntil = 0;
  goods[0].skills.accuse.chargesRemaining = 1;
  goods[0].skills.accuse.nextChargeAt = 0;
  const dup = use(r, goods[0].id, 'accuse', bad.id);
  assert.equal(dup.ok, false); assert.match(dup.error, /今日|同一/);
  assert.equal(goods[0].skills.accuse.chargesRemaining, 1);
  r.setOffline(bad.id); const reconnect = r.join(bad.sessionId, '不应重建');
  assert.equal(reconnect.player, bad); assert.equal(bad.hp, 2);
  bad.protectUntil = 0;
  assert.equal(use(r, goods[1].id, 'accuse', bad.id).ok, true); assert.equal(bad.hp, 1); assert.equal(bad.alive, true);
  bad.protectUntil = 0;
  assert.equal(use(r, goods[2].id, 'accuse', bad.id).ok, true); assert.equal(bad.hp, 0); assert.equal(bad.alive, false);
  r.reset(); assert.equal(r.join('new-round', '新局').player.hp, 3);
});
await test('技能配置：无短CD、最大1次、挥锤CD不变', () => {
  assert.equal(SKILL_CONFIG.probeCooldownMs, 0);
  assert.equal(SKILL_CONFIG.actionCooldownMs, 0);
  assert.equal(SKILL_CONFIG.maxCharges, 1);
  assert.equal(SKILL_CONFIG.chargeIntervalMs, 90000);
  assert.equal(WORLD.PLAY_CONFIG.attackCooldownMs, 1200);
  assert.equal(WORLD.ACTION.hammerCooldownMs, 1000);
});
await test('好人指认：一次机会用尽后需等CD；满充不超过1', () => {
  const now = Date.now, t = 1800000000000;
  Date.now = () => t;
  try {
    const r = fixture(), p = r.find(1), s = p.skills.accuse;
    s.cooldownUntil = t + 12000;
    const first = use(r, 1, 'accuse', 0); assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.skills.accuse.chargesRemaining, 0); assert.equal(first.serverTime, t);
    assert.equal(s.nextChargeAt, t + s.chargeIntervalMs); assert.equal(s.cooldownUntil, 0);
    const second = use(r, 1, 'accuse', 2); assert.equal(second.ok, false); assert.match(second.error, /次数用尽/);
  } finally { Date.now = now; }
});
await test('坏人刺杀：一次机会；action 别名映射到 assassinate', () => {
  const r = fixture(), bad = r.find(0), good = r.find(1);
  good.x = bad.x; good.y = bad.y;
  const res = r.useSkill(bad.sessionId, { commandId: 'charges-' + (++seq), skill: 'action', targetId: good.id });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(good.hp, 2);
  assert.equal(bad.skills.assassinate.chargesRemaining, 0);
});
await test('恢复精确边界：未到期0次，到期1次即可立刻使用', () => {
  const old = Date.now; let t = 1800000000000; Date.now = () => t;
  try {
    const r = fixture();
    assert.equal(use(r, 1, 'accuse', 0).ok, true);
    const s = r.find(1).skills.accuse;
    t = s.nextChargeAt - 1; assert.equal(use(r, 1, 'accuse', 2).ok, false);
    t++; const result = use(r, 1, 'accuse', 2); assert.equal(result.ok, true);
    assert.equal(s.chargesRemaining, 0); assert.equal(s.cooldownUntil, 0);
    assert.equal(s.nextChargeAt, t + s.chargeIntervalMs);
  } finally { Date.now = old; }
});
await test('离线恢复到上限停止计时；休战与结束不继续恢复', () => {
  const r = fixture();
  const good = r.room.players.find(p => p.faction === 'good');
  const bad = r.room.players.find(p => p.faction === 'bad');
  use(r, good.id, 'accuse', bad.id);
  r.setOffline(good.id); r.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3;
  r.privateSnapshot(good.id);
  assert.equal(good.skills.accuse.chargesRemaining, 1); assert.equal(good.skills.accuse.nextChargeAt, 0);
  const r2 = fixture();
  const g2 = r2.room.players.find(p => p.faction === 'good');
  const b2 = r2.room.players.find(p => p.faction === 'bad');
  use(r2, g2.id, 'accuse', b2.id);
  r2.finish(); r2.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3; r2.privateSnapshot(g2.id);
  assert.equal(g2.skills.accuse.chargesRemaining, 0);
  const r3 = fixture();
  const g3 = r3.room.players.find(p => p.faction === 'good');
  const b3 = r3.room.players.find(p => p.faction === 'bad');
  b3.hp = 1; b3.protectUntil = 0;
  assert.equal(use(r3, g3.id, 'accuse', b3.id).ok, true);
  assert.equal(b3.alive, false);
  const frozenCharges = b3.skills.assassinate.chargesRemaining;
  r3.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3; r3.privateSnapshot(b3.id);
  assert.equal(b3.skills.assassinate.chargesRemaining, frozenCharges, '休战后次数不再恢复');
  assert.ok(b3.skillsFrozenAt != null);
});
await test('旧 probe/spy/kill 入口拒绝；阵营不能互用；幂等 commandId', () => {
  const r = fixture();
  const good = r.room.players.find(p => p.faction === 'good');
  const bad = r.room.players.find(p => p.faction === 'bad');
  assert.equal(use(r, good.id, 'probe', bad.id).ok, false);
  assert.equal(use(r, bad.id, 'spy', good.id).ok, false);
  assert.equal(use(r, bad.id, 'kill', good.id).ok, false);
  assert.equal(use(r, good.id, 'assassinate', bad.id).ok, false);
  assert.equal(use(r, bad.id, 'accuse', good.id).ok, false);
  const cmd = { commandId:'same-skill-id', skill:'accuse', targetId: bad.id };
  assert.equal(r.useSkill(good.sessionId, cmd).ok, true);
  assert.equal(r.useSkill(good.sessionId, cmd).ok, false);
  assert.equal(good.skills.accuse.chargesRemaining, 0);
});

const source = readFileSync(new URL('./public/game.js', import.meta.url), 'utf8');
const section = source.slice(source.indexOf('  const secondsLeft ='), source.indexOf('  // Personal privacy choices'));
function ui(faction = 'good') {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, textContent:'', disabled:false, html:'',
      set innerHTML(value) { this.html = value; for (const m of value.matchAll(/id="([^"]+)"/g)) element(m[1]); },
      get innerHTML() { return this.html; }, replaceChildren() { this.html = ''; } });
    return elements.get(id);
  }
  const skillId = faction === 'bad' ? 'assassinate' : 'accuse';
  const skills = { [skillId]: {chargesRemaining:1,maxCharges:1,cooldownUntil:999999, nextChargeAt:0} };
  const env = { me:{id:0,alive:true,faction,skills,accusedToday:[]}, finished:false, gameClosed:'', gamePausedAt:0, now:1000, serverTime:1000,
    privateGeneration:1, sessionGeneration:1, privateOpen:true, privateResult:'', pending:null, selectedId:2,
    target:{id:2,alive:true,sid:'***-***-***',name:'目标',traits:{saying:'***',food:'***',sport:'***'},protected:false},
    traitNames:{saying:'口头禅',food:'食物',sport:'运动'}, MASK:'***', apiCalls:0,
    $:element, holding:()=>env.privateOpen, selected:()=>env.target, serverNow:()=>env.now,
    escapeText:s=>String(s), commandId:()=>String(++seq), api:async()=>{ env.apiCalls++; return{ok:true}; } };
  const context = vm.createContext(env);
  vm.runInContext(section + '\n globalThis.uiAPI={skillButtonText,skillStatus,renderPrivate,updateSkillStatus,renderConfirmation,commit};', context);
  return {env,api:env.uiAPI,e:element};
}

await test('每个技能按钮下方都有对应简略效果和可访问说明', () => {
  for (const [faction, ids] of [['good',['accuse']],['bad',['assassinate']]]) {
    const {api,e} = ui(faction); api.renderPrivate(); const html=e('private-content').innerHTML;
    for(const id of ids) {
      assert.ok(html.includes(`aria-describedby="${id}-effect"`));
      assert.ok(html.indexOf(`id="${id}"`) < html.indexOf(`id="${id}-effect"`));
    }
    assert.equal((html.match(/data-skill=/g)||[]).length,ids.length);
    for (const id of ['probe','spy','kill'].filter(id=>!ids.includes(id))) assert.ok(!html.includes(`data-skill="${id}"`));
  }
});
await test('好人蓝指认、坏人红刺杀，确认按钮随技能类型配色，关闭清除', () => {
  for (const faction of ['good','bad']) {
    const {env,api,e} = ui(faction); api.renderPrivate();
    const html=e('private-content').innerHTML;
    const ids=faction==='good'?['accuse']:['assassinate'];
    for(const id of ids){
      const color=id==='accuse'?'blue':'red';
      assert.match(html,new RegExp(`id="${id}"[^>]+class="skill-${color}"`));
      env.target.sid='***-***-***';
      env.pending={kind:id,target:2};api.renderConfirmation();
      assert.match(e('confirm-host').innerHTML,new RegExp(`id="confirm" class="skill-${color}"`));
    }
    assert.ok(!html.includes('skills-bad'));assert.ok(!html.includes('skills-good'));
    env.privateOpen=false;api.renderPrivate();assert.equal(e('private-content').innerHTML,'');
  }
  const css=readFileSync(new URL('./public/styles/shellmap.css',import.meta.url),'utf8');
  assert.ok(css.includes('dialog.private-dialog .skill-blue{'));
  assert.ok(css.includes('dialog.private-dialog .skill-red{'));
});
await test('坏人线索入口独立位于顶部核心情报联动区且唯一、固定三列不自动拉伸', () => {
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/id="bad-toggle"/g)||[]).length, 1);
  const logs = html.slice(html.indexOf('<aside id="logs"'), html.indexOf('</aside>', html.indexOf('<aside id="logs"')));
  assert.equal(logs.indexOf('id="bad-toggle"'), -1);
  const hub = html.slice(html.indexOf('id="intel-hub"'), html.indexOf('<aside id="logs"'));
  assert.ok(hub.indexOf('id="clue-next"') !== -1 && hub.indexOf('id="bad-toggle"') !== -1 && hub.indexOf('id="logs-toggle"') !== -1);
  const css = readFileSync(new URL('./public/styles/badpool.css', import.meta.url), 'utf8');
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.ok(!css.includes('auto-fit')); assert.match(css,/\.log-clues-entry\{flex:none/);
});
await test('有次即启用，旧cooldownUntil不能禁用按钮，零次显示单调时钟倒计时', () => {
  const {env,api,e} = ui(); api.renderPrivate(); assert.equal(e('accuse').disabled, false);
  assert.equal(e('accuse-label').textContent, '指认 1/1');assert.equal(e('accuse-timer').hidden,true);
  env.me.skills.accuse.chargesRemaining=0; env.me.skills.accuse.nextChargeAt=91000;
  api.updateSkillStatus(); assert.equal(e('accuse-label').textContent, '指认 0/1');assert.equal(e('accuse-timer').textContent,'01:30');assert.equal(e('accuse-timer').hidden,false);assert.equal(e('accuse').disabled, true);
  env.now+=1001;api.updateSkillStatus();assert.equal(e('accuse-timer').textContent,'01:29');
  env.now=91000;api.updateSkillStatus();assert.equal(e('accuse').disabled,true);assert.match(e('accuse-timer').textContent,/等待恢复确认/);
  env.me.skills.accuse.chargesRemaining=1; api.updateSkillStatus();assert.equal(e('accuse').disabled,false);assert.equal(e('accuse-label').textContent,'指认 1/1');assert.equal(e('accuse-timer').hidden,true);
});
await test('结束/休战不显示虚假的恢复倒计时；今日已操作或保护中的目标禁用', () => {
  const {env,api,e} = ui(); api.renderPrivate(); env.me.skills.accuse.chargesRemaining=0;env.me.skills.accuse.nextChargeAt=91000;
  env.finished=true;api.updateSkillStatus();assert.match(e('accuse-timer').textContent,/已冻结/);
  env.finished=false;env.me.alive=false;api.updateSkillStatus();assert.match(e('accuse-timer').textContent,/已冻结/);assert.equal(e('accuse').disabled,true);
  env.me.alive=true;env.me.skills.accuse.chargesRemaining=1;api.updateSkillStatus();assert.equal(e('accuse').disabled,false);
  env.me.accusedToday=[2];api.updateSkillStatus();assert.equal(e('accuse').disabled,true);assert.equal(e('accuse-timer').textContent,'今日已操作过');
  env.me.accusedToday=[];env.target.protected=true;api.updateSkillStatus();assert.equal(e('accuse').disabled,true);assert.equal(e('accuse-timer').textContent,'目标保护中');
  env.target.protected=false;env.target.alive=false;api.updateSkillStatus();assert.equal(e('accuse').disabled,true,'休战目标不可操作');
});
await test('连续提交只有网络在途锁；成功响应立即更新次数，没有额外冷却', async () => {
  const {env,api,e} = ui(); api.renderPrivate(); env.pending={kind:'accuse',target:2};
  let finish;env.api=(path,body)=>{env.apiCalls++;env.lastBody=body;return new Promise(r=>{finish=r;});};
  const first=api.commit('');assert.equal(env.apiCalls,1);assert.equal(e('accuse').disabled,true);assert.equal(env.lastBody.skill,'accuse');
  assert.equal(await api.commit(''),false);assert.equal(env.apiCalls,1);
  const next=JSON.parse(JSON.stringify(env.me.skills));next.accuse.chargesRemaining=0;next.accuse.nextChargeAt=91000;
  finish({ok:true,serverTime:1000,skills:next,hp:3,alive:true});assert.equal(await first,true);
  assert.equal(e('accuse-label').textContent,'指认 0/1');assert.equal(e('accuse-timer').textContent,'01:30');assert.equal(e('accuse').disabled,true);
  next.accuse.chargesRemaining=1;next.accuse.nextChargeAt=0;env.me.skills=JSON.parse(JSON.stringify(next));api.updateSkillStatus();
  assert.equal(e('accuse-label').textContent,'指认 1/1');assert.equal(e('accuse').disabled,false);
});
await test('迟到资源响应不能覆盖更新快照；关闭后的响应不重建私密内容', async () => {
  const {env,api,e}=ui();api.renderPrivate();env.pending={kind:'accuse',target:2};
  let finish;env.api=()=>new Promise(r=>{finish=r;});const call=api.commit('');
  env.serverTime=2000;env.privateOpen=false;env.privateGeneration++;e('private-content').replaceChildren();
  const late=JSON.parse(JSON.stringify(env.me.skills));late.accuse.chargesRemaining=0;
  finish({ok:true,serverTime:1000,skills:late});assert.equal(await call,false);
  assert.equal(env.me.skills.accuse.chargesRemaining,1);assert.equal(e('private-content').innerHTML,'');
});
await test('旧运行后台拒绝冷却时提示需手动重启，不自动重试或伪报成功', async () => {
  const {env,api,e}=ui();api.renderPrivate();env.pending={kind:'accuse',target:2};
  env.api=async()=>{env.apiCalls++;return{ok:false,error:'该技能冷却中'};};
  assert.equal(await api.commit(''),false); assert.equal(env.apiCalls,1);
  assert.match(e('result-host').innerHTML,/需要手动重启服务/);
});
await test('技能按钮两行层级、mm:ss补零及跨分钟、20分钟和提交状态', async () => {
  const {env,api,e}=ui('bad');api.renderPrivate();
  const label=e('assassinate-label'),timer=e('assassinate-timer');env.me.skills.assassinate.chargesRemaining=0;
  for(const [seconds,text] of [[1200,'20:00'],[61,'01:01'],[60,'01:00'],[59,'00:59'],[9,'00:09'],[1,'00:01'],[3600,'60:00']]){
    env.me.skills.assassinate.nextChargeAt=env.now+seconds*1000;api.updateSkillStatus();
    assert.equal(label.textContent,'刺杀 0/1');assert.equal(timer.textContent,text);assert.equal(timer.hidden,false);
    assert.equal(e('assassinate-label'),label);assert.equal(e('assassinate-timer'),timer);
  }
  const html=e('private-content').innerHTML;
  assert.match(html,/class="skill-button-label"/);assert.match(html,/class="skill-button-timer"/);
  const css=readFileSync(new URL('./public/styles/shellmap.css',import.meta.url),'utf8');
  assert.match(css,/\.skill-button-label\{[^}]*font-size:16px/);
  assert.match(css,/\.skill-button-timer\{[^}]*font-size:11px/);
  env.me.skills.assassinate.chargesRemaining=1;env.me.skills.assassinate.nextChargeAt=0;api.updateSkillStatus();
  env.pending={kind:'assassinate',target:2};let resolve;env.api=()=>new Promise(r=>{resolve=r;});const call=api.commit('');
  assert.equal(e('assassinate-label').textContent,'刺杀 1/1');assert.equal(e('assassinate-timer').textContent,'正在提交…');
  resolve({ok:true});await call;assert.equal(e('assassinate-timer').hidden,true);
});
await test('坏人面板按匿名展示顺序01递增，10/100不截断，休战卡保留，空状态正常', () => {
  const node = () => ({children:[],textContent:'',append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;}});
  const root=node();
  const env={badPoolAvailable:true,lastBadPoolSig:'',MASK:'***',fieldNames:{hair:'发色',top:'上衣颜色',pants:'裤子颜色',shoes:'鞋颜色'},traitNames:{saying:'口头禅',food:'爱吃的食物',sport:'喜欢的运动'},
    badSlots:Array.from({length:100},(_,i)=>({key:'anonymous-'+i,label:'旧随机编号',alive:i!==1,traits:{saying:'旧版玩家探查泄露值'},systemClues:i===0?{colors:{hair:'银白'},traits:{saying:'系统公布口头禅'}}:{colors:{},traits:{}}})),
    $:()=>root,document:{createElement:node,createDocumentFragment:node}};
  const original=JSON.stringify(env.badSlots);
  const render=source.slice(source.indexOf('  function renderBadPool()'),source.indexOf('  function closeBadPool()'));
  vm.runInNewContext(render+';renderBadPool();',env);
  const cards=root.children[0].children;
  assert.equal(cards.length,100);
  for(const [i,title] of [[0,'坏人01'],[1,'坏人02'],[2,'坏人03'],[9,'坏人10'],[99,'坏人100']])assert.equal(cards[i].children[0].children[0].textContent,title);
  assert.equal(cards[1].children[0].children[1].textContent,'已休战');
  const rows=card=>card.children.filter(n=>n.className==='bad-clue');
  assert.equal(rows(cards[0]).length,7);
  assert.equal(rows(cards[0])[0].children[1].textContent,'银白');
  assert.equal(rows(cards[0])[4].children[1].textContent,'系统公布口头禅');
  assert.ok(rows(cards[1]).every(r=>r.children[1].textContent==='***'));
  delete env.badSlots[2].systemClues;env.lastBadPoolSig='';vm.runInNewContext('renderBadPool();',env);
  assert.ok(rows(root.children[0].children[2]).every(r=>r.children[1].textContent==='***'),'旧后台slot.traits不能回退显示');
  env.badSlots[2].systemClues={colors:{},traits:{}};
  assert.equal(JSON.stringify(env.badSlots),original,'不改变服务端匿名卡片的顺序或属性');
  env.badSlots=[];vm.runInNewContext('renderBadPool();',env);assert.equal(root.children[0].children[0].textContent,'暂无坏人');
  env.badPoolAvailable=false;vm.runInNewContext('renderBadPool();',env);assert.match(root.children[0].children[0].textContent,/尚未提供匿名线索池/);
});
await test('系统公布与玩家探查完全分离，七属性只下发系统项且不能伪造', () => {
  const r=fixture(),bad=r.room.players.find(p=>p.faction==='bad'),good=r.room.players.find(p=>p.faction==='good');
  const slot=()=>r.publicSnapshot(good.id).badSlots[0];
  assert.deepEqual(slot().systemClues,{colors:{},traits:{}});
  const key=slot().key;
  assert.equal(use(r,good.id,'accuse',bad.id).ok,true);
  assert.ok(!Object.values(bad.traitPublic).some(Boolean),'指认不公开属性');
  assert.deepEqual(slot().systemClues,{colors:{},traits:{}},'玩家对抗不加入系统线索');
  assert.equal(r.publishSystemClue(bad.id,'colors','hair').ok,true);
  assert.deepEqual(slot().systemClues.colors,{hair:bad.colors.hair[0]});
  assert.deepEqual(slot().systemClues.traits,{});
  assert.equal(r.publishSystemClue(bad.id,'traits','food').ok,true);
  assert.deepEqual(slot().systemClues.traits,{food:bad.traits.food});
  assert.equal(bad.traitPublic.food,false,'系统公布不复用或改变探查公开标志');
  assert.equal(r.publishSystemClue(bad.id,'traits','food').published,false);
  assert.equal(r.publishSystemClue(good.id,'traits','food').ok,false);
  assert.equal(r.publishSystemClue(bad.id,'traits','sid').ok,false);
  assert.equal(r.publishSystemClue(bad.id,'colors','__proto__').ok,false);
  assert.ok(Object.isFrozen(slot().systemClues.colors));
  assert.throws(()=>{slot().systemClues.traits.food='伪造';},TypeError);
  assert.equal(slot().key,key);r.setOffline(bad.id);r.join(bad.sessionId,'重连');assert.equal(slot().systemClues.traits.food,bad.traits.food);
  const saved=JSON.parse(JSON.stringify({players:r.room.players,sessions:[...r.room.sessions],roundId:r.room.roundId,startedAt:r.room.startedAt,includeNpcs:true}));
  const restored=createRoom({restore:saved});assert.deepEqual(restored.publicSnapshot().badSlots[0].systemClues,slot().systemClues);
  const projection=slot();assert.ok(!('id' in projection));assert.ok(!('name' in projection));assert.ok(!('traits' in projection));
  r.reset();r.join('brand-new','新坏人');assert.deepEqual(slot().systemClues,{colors:{},traits:{}});
});
await test('暂停时按钮计时固定，继续后使用平移后的恢复时间', () => {
  const {env,api,e}=ui();api.renderPrivate();env.me.skills.accuse.chargesRemaining=0;env.me.skills.accuse.nextChargeAt=91000;
  env.gamePausedAt=31000;env.gameClosed='本场已暂停';env.now=631000;api.updateSkillStatus();assert.equal(e('accuse-timer').textContent,'01:00');assert.equal(e('accuse').disabled,true);
  env.now+=10000;api.updateSkillStatus();assert.equal(e('accuse-timer').textContent,'01:00');
  env.me.skills.accuse.nextChargeAt+=env.now-env.gamePausedAt;env.gamePausedAt=0;env.gameClosed='';api.updateSkillStatus();assert.equal(e('accuse-timer').textContent,'01:00');
  env.now+=1000;api.updateSkillStatus();assert.equal(e('accuse-timer').textContent,'00:59');
});
await test('公共日志本人按目标标记青色，系统线索粗黄，无姓名片段误命中或HTML注入',()=>{
 const list={innerHTML:'',scrollTop:42},count={textContent:''};
 const env={me:{id:1,name:'小明'},lastLogSig:'',logs:[
  {time:'09:00',text:'小明的口头禅已公开：<img src=x>。',subjectPlayerId:1},
  {time:'09:01',text:'小明甲被指认一次。',subjectPlayerId:2},
  {time:'09:02',text:'系统公布：坏人01的发色为「棕」。',type:'systemClue'},
  {time:'09:03',text:'别人的口头禅包含小明'},
  {time:'09:04',text:'小明已淘汰。'},
  {time:'09:05',text:'小明甲已淘汰。'}],traitNames:{saying:'口头禅'},
  $:id=>id==='log-count'?count:list,escapeText:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),sidHTML:s=>s};
 const code=source.slice(source.indexOf('  function logHighlightClass('),source.indexOf('  function renderPublic()'));
 vm.runInNewContext(code+';renderLogs();',env);
 assert.equal((list.innerHTML.match(/class="log-mine"/g)||[]).length,2);
 assert.equal((list.innerHTML.match(/class="log-system-clue"/g)||[]).length,1);
 assert.ok(list.innerHTML.includes('与你有关'));assert.ok(list.innerHTML.includes('系统线索'));
 assert.ok(!list.innerHTML.includes('<img'));assert.ok(list.innerHTML.includes('&lt;img'));assert.equal(list.scrollTop,42);
 env.me={id:2,name:'小明甲'};vm.runInNewContext('renderLogs();',env);assert.equal((list.innerHTML.match(/class="log-mine"/g)||[]).length,2);
 const r=fixture(),g=r.room.players.find(p=>p.faction==='good'),b=r.room.players.find(p=>p.faction==='bad');
 assert.equal(use(r,g.id,'accuse',b.id).ok,true);const hit=r.room.logs.find(e=>e.text.includes('对抗生命变为'));
 assert.equal(hit.subjectPlayerId,b.id);assert.ok(!hit.type);assert.ok(!('actorId'in hit));assert.ok(!hit.text.includes(g.name),'公共日志不暴露操作者');
 const css=readFileSync(new URL('./public/styles/panels.css',import.meta.url),'utf8');
 // 明亮化改造后：系统线索=阳光橙浅底深橙字，与我有关=天蓝浅底深蓝字。
 // 断言的是「两者仍是各自独立的强调色、且不可互相替代」，不再绑定旧深色主题的具体十六进制值。
 assert.match(css,/\.logs li\.log-system-clue p\{color:#8a4a00;font-weight:700/);
 assert.match(css,/\.logs li\.log-mine p\{color:var\(--sky-dk\);font-weight:600/);
 assert.ok(!/#ffe078|#91e9f7/.test(css),'旧深色主题的青/黄强调色不应残留');
});
console.log(`轻量检查 ${passed} PASS / ${failed} FAIL；未启动服务或浏览器。`);
process.exitCode = failed ? 1 : 0;
