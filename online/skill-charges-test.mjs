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
await test('坏人新建/重开3血，三次指认淘汰，重连不会恢复损失血量', () => {
  const r = fixture(), bad = r.find(0);
  assert.equal(bad.hp, 3);
  assert.equal(use(r, 1, 'accuse', 0).ok, true); assert.equal(bad.hp, 2); assert.equal(bad.alive, true);
  r.setOffline(0); const reconnect = r.join(bad.sessionId, '不应重建');
  assert.equal(reconnect.player, bad); assert.equal(bad.hp, 2);
  assert.equal(use(r, 1, 'accuse', 0).ok, true); assert.equal(bad.hp, 1); assert.equal(bad.alive, true);
  assert.equal(use(r, 2, 'accuse', 0).ok, true); assert.equal(bad.hp, 0); assert.equal(bad.alive, false);
  r.reset(); assert.equal(r.join('new-round', '新局坏人').player.hp, 3);
});
await test('四项身份技能无短CD，恢复周期和挥锤CD不变', () => {
  assert.equal(SKILL_CONFIG.probeCooldownMs, 0);
  assert.equal(SKILL_CONFIG.actionCooldownMs, 0);
  assert.equal(SKILL_CONFIG.chargeIntervalMs, 90000);
  assert.equal(WORLD.PLAY_CONFIG.attackCooldownMs, 1200);
  assert.equal(WORLD.ACTION.hammerCooldownMs, 1000);
});
for (const [actor, skill] of [[0,'probe'],[0,'accuse'],[0,'spy'],[0,'kill'],[1,'probe'],[1,'accuse']]) {
  await test(`${actor === 0 ? '坏人' : '好人'}${skill}：同一毫秒连续两次可用、第三次拒绝`, () => {
    const now = Date.now, t = 1800000000000;
    Date.now = () => t;
    try {
      const r = fixture(), p = r.find(actor), s = p.skills[skill];
      // A stale compatibility timestamp cannot impose a short cooldown.
      s.cooldownUntil = t + 12000;
      const wrong = r.find(2).sid.segments.join('-') === 'ZZZ-ZZZ-ZZZ' ? 'YYY-YYY-YYY' : 'ZZZ-ZZZ-ZZZ';
      const extra = skill === 'kill' ? { sid: wrong } : {};
      const first = use(r, actor, skill, 2, extra); assert.equal(first.ok, true, JSON.stringify(first));
      assert.equal(first.skills[skill].chargesRemaining, 1); assert.equal(first.serverTime, t);
      const next = s.nextChargeAt;
      assert.equal(next, t + SKILL_CONFIG.chargeIntervalMs); assert.equal(s.cooldownUntil, 0);
      const second = use(r, actor, skill, 2, extra); assert.equal(second.ok, true, JSON.stringify(second));
      assert.equal(s.chargesRemaining, 0); assert.equal(s.nextChargeAt, next);
      assert.equal(first.skills[skill].chargesRemaining, 1, 'response resources must be copies');
      const third = use(r, actor, skill, 2, extra); assert.equal(third.ok, false); assert.match(third.error, /次数用尽/);
      assert.equal(s.nextChargeAt, next);
    } finally { Date.now = now; }
  });
}
await test('正确SID连续击杀不同目标，四技能储存互相独立', () => {
  const r = fixture(), actor = r.find(0);
  const before = JSON.stringify(actor.skills.spy);
  for (const id of [2, 3]) {
    const target = r.find(id);
    assert.equal(use(r, 0, 'kill', id, { sid: target.sid.segments.join('-') }).ok, true);
    assert.equal(target.alive, false);
  }
  assert.equal(actor.skills.kill.chargesRemaining, 0);
  assert.equal(JSON.stringify(actor.skills.spy), before);
  assert.deepEqual(Object.keys(actor.skills), ['probe','accuse','spy','kill']);
  assert.equal(actor.skills.spy.chargesRemaining, 2);
});
await test('恢复精确边界：未到期0次，到期1次即可立刻使用', () => {
  const old = Date.now; let t = 1800000000000; Date.now = () => t;
  try {
    const r = fixture(); use(r, 1, 'probe'); use(r, 1, 'probe');
    const s = r.find(1).skills.probe;
    t = s.nextChargeAt - 1; assert.equal(use(r, 1, 'probe').ok, false);
    t++; const result = use(r, 1, 'probe'); assert.equal(result.ok, true);
    assert.equal(s.chargesRemaining, 0); assert.equal(s.cooldownUntil, 0);
    assert.equal(s.nextChargeAt, t + SKILL_CONFIG.chargeIntervalMs);
  } finally { Date.now = old; }
});
await test('离线恢复到上限停止计时；淘汰与结束不继续恢复', () => {
  const r = fixture(), p = r.find(1); use(r, 1, 'probe'); use(r, 1, 'probe');
  r.setOffline(p.id); r.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3;
  r.privateSnapshot(p.id);
  assert.equal(p.skills.probe.chargesRemaining, 2); assert.equal(p.skills.probe.nextChargeAt, 0);
  const r2 = fixture(), p2 = r2.find(1); use(r2, 1, 'probe'); use(r2, 1, 'probe');
  r2.finish(); r2.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3; r2.privateSnapshot(p2.id);
  assert.equal(p2.skills.probe.chargesRemaining, 0);
  const r3 = fixture(), p3 = r3.find(1); use(r3, 1, 'probe'); use(r3, 1, 'probe');
  assert.equal(use(r3, 0, 'kill', 1, {sid:p3.sid.segments.join('-')}).ok, true);
  r3.room.clockOffset += SKILL_CONFIG.chargeIntervalMs * 3; r3.privateSnapshot(1);
  assert.equal(p3.skills.probe.chargesRemaining, 0);
});
await test('无未知属性/无未知SID/非法输入不扣次，幂等及阵营权限不变', () => {
  const r = fixture(), p = r.find(0), q = r.find(2);
  for (const key of Object.keys(q.traits)) q.traitPublic[key] = true;
  q.sid.revealed.fill(true);
  assert.equal(use(r, 1, 'probe').ok, false); assert.equal(use(r, 0, 'spy').ok, false);
  assert.equal(use(r, 0, 'kill', 2, {sid:'bad'}).ok, false);
  assert.equal(r.find(1).skills.probe.chargesRemaining, 2); assert.equal(p.skills.spy.chargesRemaining, 2); assert.equal(p.skills.kill.chargesRemaining, 2);
  assert.equal(use(r, 1, 'spy').ok, false);
  const cmd = { commandId:'same-skill-id', skill:'accuse', targetId:2 };
  assert.equal(r.useSkill(r.find(1).sessionId, cmd).ok, true);
  assert.equal(r.useSkill(r.find(1).sessionId, cmd).ok, false);
  assert.equal(r.find(1).skills.accuse.chargesRemaining, 1);
  r.find(1).skills.spy = { ...p.skills.spy };
  assert.equal(use(r, 1, 'spy').ok, false, '好人即使有遗留技能也不能使用刺探');
  assert.ok(!('skills' in r.publicProjection(p)));
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
  const skills = Object.fromEntries(['probe','accuse','spy','kill'].map(id => [id, {chargesRemaining:2,maxCharges:2,cooldownUntil:999999, nextChargeAt:0}]));
  const env = { me:{id:0,alive:true,faction,skills}, finished:false, now:1000, serverTime:1000,
    privateGeneration:1, sessionGeneration:1, privateOpen:true, privateResult:'', pending:null, selectedId:2,
    target:{id:2,alive:true,sid:'***-***-***',name:'目标',traits:{saying:'***',food:'***',sport:'***'}},
    traitNames:{saying:'口头禅',food:'食物',sport:'运动'}, MASK:'***', apiCalls:0,
    $:element, holding:()=>env.privateOpen, selected:()=>env.target, serverNow:()=>env.now,
    escapeText:s=>String(s), commandId:()=>String(++seq), api:async()=>{ env.apiCalls++; return{ok:true}; } };
  const context = vm.createContext(env);
  vm.runInContext(section + '\n globalThis.uiAPI={skillButtonText,skillStatus,renderPrivate,updateSkillStatus,renderConfirmation,commit};', context);
  return {env,api:env.uiAPI,e:element};
}
await test('每个技能按钮下方都有对应简略效果和可访问说明', () => {
  for (const [faction, ids] of [['good',['probe','accuse']],['bad',['probe','accuse','spy','kill']]]) {
    const {api,e} = ui(faction); api.renderPrivate(); const html=e('private-content').innerHTML;
    for(const id of ids) {
      assert.ok(html.includes(`aria-describedby="${id}-effect"`));
      assert.ok(html.indexOf(`id="${id}"`) < html.indexOf(`id="${id}-effect"`));
    }
    assert.equal((html.match(/data-skill=/g)||[]).length,ids.length);
    for (const id of ['probe','accuse','spy','kill'].filter(id=>!ids.includes(id))) assert.ok(!html.includes(`data-skill="${id}"`));
  }
});
await test('好人两蓝、坏人两蓝两红，确认按钮随技能类型配色，关闭清除', () => {
  for (const faction of ['good','bad']) {
    const {env,api,e} = ui(faction); api.renderPrivate();
    const html=e('private-content').innerHTML;
    const ids=faction==='good'?['probe','accuse']:['probe','accuse','spy','kill'];
    for(const id of ids){
      const color=['probe','accuse'].includes(id)?'blue':'red';
      assert.match(html,new RegExp(`id="${id}"[^>]+class="skill-${color}"`));
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
await test('坏人线索入口在日志下方且唯一、固定三列不自动拉伸', () => {
  const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');
  assert.equal((html.match(/id="bad-toggle"/g)||[]).length, 1);
  const logs = html.slice(html.indexOf('<aside id="logs"'), html.indexOf('</aside>', html.indexOf('<aside id="logs"')));
  assert.ok(logs.indexOf('id="bad-toggle"') > logs.indexOf('id="log-items"'));
  const css = readFileSync(new URL('./public/styles/badpool.css', import.meta.url), 'utf8');
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.ok(!css.includes('auto-fit')); assert.match(css,/\.log-clues-entry\{flex:none/);
});
await test('有次即启用，旧cooldownUntil不能禁用按钮，零次显示单调时钟倒计时', () => {
  const {env,api,e} = ui(); api.renderPrivate(); assert.equal(e('probe').disabled, false);
  assert.equal(e('probe').textContent, '探查 2/2');
  env.me.skills.probe.chargesRemaining=0; env.me.skills.probe.nextChargeAt=91000;
  api.updateSkillStatus(); assert.equal(e('probe').textContent, '探查 0/2 · 90s 后 +1'); assert.equal(e('probe').disabled, true);
  env.now+=1001;api.updateSkillStatus();assert.equal(e('probe').textContent,'探查 0/2 · 89s 后 +1');
  env.now=91000;api.updateSkillStatus();assert.equal(e('probe').disabled,true);assert.match(e('probe').textContent,/等待恢复确认/);
  env.me.skills.probe.chargesRemaining=1; api.updateSkillStatus();assert.equal(e('probe').disabled,false);assert.equal(e('probe').textContent,'探查 1/2');
});
await test('结束/淘汰不显示虚假的恢复倒计时，目标全公开仍禁用', () => {
  const {env,api,e} = ui(); api.renderPrivate(); env.me.skills.probe.chargesRemaining=0;env.me.skills.probe.nextChargeAt=91000;
  env.finished=true;api.updateSkillStatus();assert.match(e('probe').textContent,/已冻结/);
  env.finished=false;env.me.alive=false;api.updateSkillStatus();assert.match(e('probe').textContent,/已冻结/);
  env.me.alive=true;env.me.skills.probe.chargesRemaining=2;env.target.traits={saying:'a',food:'b',sport:'c'};api.updateSkillStatus();assert.equal(e('probe').disabled,true);
});
await test('连续提交只有网络在途锁；成功响应立即更新次数，没有额外冷却', async () => {
  const {env,api,e} = ui(); api.renderPrivate(); env.pending={kind:'probe',target:2};
  let finish;env.api=()=>{env.apiCalls++;return new Promise(r=>{finish=r;});};
  const first=api.commit('');assert.equal(env.apiCalls,1);assert.equal(e('probe').disabled,true);
  assert.equal(await api.commit(''),false);assert.equal(env.apiCalls,1);
  const next=JSON.parse(JSON.stringify(env.me.skills));next.probe.chargesRemaining=1;next.probe.nextChargeAt=91000;
  finish({ok:true,serverTime:1000,skills:next});assert.equal(await first,true);
  assert.equal(e('probe').textContent,'探查 1/2');assert.equal(e('probe').disabled,false);
  env.pending={kind:'probe',target:2};const second=api.commit('');assert.equal(env.apiCalls,2);
  next.probe.chargesRemaining=0;finish({ok:true,serverTime:1000,skills:JSON.parse(JSON.stringify(next))});await second;
  assert.match(e('probe').textContent,/0\/2 · 90s/);assert.equal(e('probe').disabled,true);
});
await test('迟到资源响应不能覆盖更新快照；关闭后的响应不重建私密内容', async () => {
  const {env,api,e}=ui();api.renderPrivate();env.pending={kind:'probe',target:2};
  let finish;env.api=()=>new Promise(r=>{finish=r;});const call=api.commit('');
  env.serverTime=2000;env.privateOpen=false;env.privateGeneration++;e('private-content').replaceChildren();
  const late=JSON.parse(JSON.stringify(env.me.skills));late.probe.chargesRemaining=0;
  finish({ok:true,serverTime:1000,skills:late});assert.equal(await call,false);
  assert.equal(env.me.skills.probe.chargesRemaining,2);assert.equal(e('private-content').innerHTML,'');
});
await test('旧运行后台拒绝冷却时提示需手动重启，不自动重试或伪报成功', async () => {
  const {env,api,e}=ui();api.renderPrivate();env.pending={kind:'probe',target:2};
  env.api=async()=>{env.apiCalls++;return{ok:false,error:'该技能冷却中'};};
  assert.equal(await api.commit(''),false); assert.equal(env.apiCalls,1);
  assert.match(e('result-host').innerHTML,/需要手动重启服务/);
});
console.log(`轻量检查 ${passed} PASS / ${failed} FAIL；未启动服务或浏览器。`);
process.exitCode = failed ? 1 : 0;
