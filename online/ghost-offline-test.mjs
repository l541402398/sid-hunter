'use strict';
// Real HTTP/SSE on an isolated loopback server; deterministic module-level random injection.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { createRoom, WORLD } = require('./room.js');
const here = dirname(fileURLToPath(import.meta.url));
const port = 8912, base = `http://127.0.0.1:${port}`;
const results = [];
function check(name, value, detail = '') {
  results.push({ name, pass: !!value });
  console.log(`${value ? 'PASS' : 'FAIL'} ${name}${detail ? ` → ${detail}` : ''}`);
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(route, token, body) {
  const response = await fetch(base + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base, ...(token ? { 'X-Sid-Session': token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { ...(await response.json()), status: response.status };
}
async function stream(token) {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/stream?sid_token=${token}`, { signal: controller.signal });
  const reader = response.body.getReader();
  let buffer = '';
  return {
    async next() {
      for (;;) {
        const end = buffer.indexOf('\n\n');
        if (end >= 0) {
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const line = block.split('\n').find(s => s.startsWith('data: '));
          if (line) return JSON.parse(line.slice(6));
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('SSE unexpectedly closed');
        buffer += new TextDecoder().decode(value);
      }
    },
    close() { controller.abort(); reader.cancel().catch(() => {}); }
  };
}
const streams = [];
async function connect(token) { const s = await stream(token); streams.push(s); return s; }
const child = spawn(process.execPath, ['server.js'], {
  cwd: here, env: { ...process.env, SID_TEST: '1', SID_DEV: '1', HOST: '127.0.0.1', PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
child.stdout.on('data', data => { serverLog += data; }); child.stderr.on('data', data => { serverLog += data; });
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { await request('/api/state'); ready = true; break; } catch { await wait(50); }
  }
  if (!ready) throw new Error(serverLog || 'Server not ready');
  const joined = [];
  for (let i = 0; i < 6; i++) joined.push(await request('/api/join', null, { nickname: `T${i}` }));
  const [a, g, b, c, d, e] = joined;
  const token = p => p.sessionToken;
  const state = p => request('/api/state', token(p));
  const testState = () => request('/api/test/state');
  const advance = ms => request('/api/test/advance', null, { ms });
  const place = (p, x, y) => request('/api/test/place', null, { playerId: p.playerId ?? p.id, x, y });
  const action = (p, kind) => request('/api/action', token(p), { kind });
  const input = (p, dir) => request('/api/input', token(p), dir);
  const skill = (p, kind, target, sid) => request('/api/skill', token(p), { skill: kind, targetId: target.playerId ?? target.id, sid, commandId: randomUUID() });
  const own = (snapshot, p) => snapshot.players.find(v => v.id === (p.playerId ?? p.id));
  const killSid = (await testState()).players.find(v => v.id === g.playerId).sid;
  check('≥4存活时真实技能淘汰产生幽灵', (await skill(a, 'kill', g, killSid)).ok);
  let snapshot = await state(g);
  check('幽灵alive=false、仍在公共快照', own(snapshot, g).alive === false);
  check('幽灵不计存活且未结束', snapshot.aliveCount === 5 && !snapshot.finished);
  const sg = await connect(token(g)); await sg.next();
  await place(g, 110, 200); await input(g, { right: true }); await wait(500); await input(g, {});
  snapshot = await state(g);
  check('幽灵可以穿过家具（接待台132..287）', own(snapshot, g).x > 132, `x=${own(snapshot,g).x}`);
  await place(g, WORLD.MAX_X - 1, 300); await input(g, { right: true }); await wait(150); await input(g, {});
  check('幽灵仍受世界边界约束', own(await state(g), g).x === WORLD.MAX_X);
  check('幽灵不可jump', (await action(g, 'jump')).status === 400);
  check('幽灵不可hammer', (await action(g, 'hammer')).status === 400);
  check('幽灵不可使用身份技能', (await skill(g, 'probe', b)).status === 400);
  check('存活者不可scare', (await action(a, 'scare')).status === 400);
  await place(g, 1000, 300); await place(b, 1030, 300); await place(a, 1400, 300);
  const sb = await connect(token(b)); await sb.next();
  const scare = await action(g, 'scare'); snapshot = await state(b);
  check('幽灵scare命中最近存活者', scare.hit && scare.targetId === b.playerId);
  check('受惊时长750ms', own(snapshot,b).frightUntil - snapshot.serverTime > 650);
  check('scare立即重复冷却拒绝', (await action(g,'scare')).status === 400);
  await place(c,2400,300);
  const cView = await state(c);
  check('屏幕外受惊/吓人字段沿visible裁剪', own(cView,b).visible === false && own(cView,b).frightUntil === 0 && own(cView,b).frightAt === 0 && own(cView,g).scareAt === 0);
  check('scare不扣血、不公开SID、不改资格', snapshot.me.hp === 1 && snapshot.me.alive && own(snapshot,b).sid === '***-***-***');
  await input(b,{right:true}); await wait(180);
  check('受惊期间位置锁定', own(await state(b),b).x === 1030);
  check('受惊期间禁止K跳/J锤', (await action(b,'jump')).status === 400 && (await action(b,'hammer')).status === 400);
  check('受惊期间仍能probe', (await skill(b,'probe',c)).ok);
  await advance(800); await wait(100); await input(b,{});
  check('750ms到期后恢复移动', own(await state(b),b).x > 1030);
  await advance(1100); await place(b,1600,300);
  check('远距离scare不命中', (await action(g,'scare')).hit === false);
  await advance(1100); await place(b,1030,300);
  check('CD1000ms后可以再次scare', (await action(g,'scare')).hit === true);
  await place(a,1000,300); await place(g,1030,300); await place(b,1500,300); await advance(1100);
  check('锤子忽略幽灵目标', (await action(a,'hammer')).hit === false);
  await place(g,1000,300); await place(a,1030,300); await advance(1100);
  check('幽灵不能被其他幽灵scare（只选存活者）', (await action(g,'scare')).targetId === a.playerId);
  await advance(1100);
  // Overlapping control deadlines: hammer first, scare later extends the lock.
  await place(a,1000,300); await place(b,1030,300); await place(g,1040,300);
  await action(a,'hammer'); await advance(350); await action(g,'scare'); await input(b,{right:true});
  await advance(450); await wait(100);
  check('锤晕到期但受惊未到期仍锁定（max）', own(await state(b),b).x === 1030);
  await advance(400); await wait(100); await input(b,{});
  check('两个硬控都到期才恢复移动', own(await state(b),b).x > 1030);

  // Real stream shutdown + offline attacks. Drain/close all older streams first.
  sb.close(); await wait(100);
  check('真实SSE断线将本人置offline', !own(await state(b),b).online);
  await input(b,{}); await action(b,'jump');
  check('input/action不抢先置online', !own(await state(b),b).online);
  await advance(1100); await place(a,1000,300); await place(g,1040,300); await place(b,1030,300);
  const beforeLogs = JSON.stringify((await state(a)).logs);
  await action(a,'hammer'); await action(g,'scare'); await advance(1100); await action(a,'hammer');
  const joinedAgain = await request('/api/join',token(b),{nickname:'ignored'});
  check('join恢复身份但保持离线', joinedAgain.revived && !own(await state(b),b).online);
  const s1 = await connect(token(b)); const reconnect1 = await s1.next();
  const summary1 = reconnect1.me.interactionSummary;
  check('重连固化匿名N/M摘要', summary1?.counts.hammer === 2 && summary1?.counts.scare === 1, JSON.stringify(summary1));
  check('私密摘要仅本人可见', !(await state(a)).me.interactionSummary && !JSON.stringify(reconnect1.players).includes(summary1.id));
  check('离线每次受击不新增pending事件', reconnect1.me.pending.length === 0);
  check('摘要不含actor/name/阵营等', Object.keys(summary1).sort().join(',') === 'counts,epoch,id,watermark');
  check('锤/吓离线累计不写公共日志', JSON.stringify((await state(a)).logs) === beforeLogs);
  check('每20Hz只读相同缓存摘要', (await s1.next()).me.interactionSummary.id === summary1.id);
  // A newer SSE takes ownership; closing older s1 cannot take the newer stream offline.
  const s2 = await connect(token(b)); const reconnect2 = await s2.next();
  check('未ACK重连复用相同id与水位', JSON.stringify(reconnect2.me.interactionSummary) === JSON.stringify(summary1));
  s1.close(); await wait(100);
  check('旧流关闭不误offline新流', own(await state(b),b).online);
  check('他人ACK摘要被拒绝', (await request('/api/ack',token(a),{interaction:{id:summary1.id,epoch:summary1.epoch}})).status === 400);
  check('错误epoch ACK被拒绝', (await request('/api/ack',token(b),{interaction:{id:summary1.id,epoch:'wrong'}})).status === 400);
  check('伪造未发送id ACK被拒绝', (await request('/api/ack',token(b),{interaction:{id:randomUUID(),epoch:summary1.epoch}})).status === 400);
  s2.close(); await wait(100); await advance(1100); await action(a,'hammer'); await action(g,'scare');
  const s3 = await connect(token(b)); const reconnect3 = await s3.next();
  check('第二次离线增量不改尚未确认摘要', reconnect3.me.interactionSummary.id === summary1.id && reconnect3.me.interactionSummary.counts.hammer === 2);
  const ackBody = {interaction:{id:summary1.id,epoch:summary1.epoch}};
  check('本人ACK成功', (await request('/api/ack',token(b),ackBody)).ok);
  const summary2 = (await state(b)).me.interactionSummary;
  check('旧ACK不吞新离线增量（随后送达1/1）', summary2?.id !== summary1.id && summary2?.counts.hammer === 1 && summary2?.counts.scare === 1, JSON.stringify(summary2));
  check('旧ACK重复幂等且不吞新摘要', (await request('/api/ack',token(b),ackBody)).ok && (await state(b)).me.interactionSummary.id === summary2.id);
  check('新摘要ACK后清空', (await request('/api/ack',token(b),{interaction:{id:summary2.id,epoch:summary2.epoch}})).ok && !(await state(b)).me.interactionSummary);

  await advance(13000);
  const eSid = (await testState()).players.find(v=>v.id===e.playerId).sid;
  await skill(a,'kill',e,eSid);
  await place(g,1000,300); await place(e,1010,300); await place(a,1800,300); await place(b,1900,300); await advance(1100);
  check('两个幽灵相邻也不会互相受惊', (await action(g,'scare')).hit === false);

  // NPC excluded from offline ledger, even direct setOffline cannot change online.
  const cap = await request('/api/dev/capabilities',token(a));
  const npc = (await request('/api/dev/npc',token(a),{count:1,csrfToken:cap.csrfToken})).npcs[0];
  await advance(1100); await place(a,2000,300); await place(npc,2030,300); await action(a,'hammer');
  check('NPC保持在线且可以被打', own(await state(a),npc).online && own(await state(a),npc).bumps === 1);

  // Finish freezes ghosts, live movement, actions and skills without reviving.
  await request('/api/host/finish',token(a),{confirm:true,csrfToken:cap.csrfToken});
  const frozen = own(await state(g),g); await input(g,{right:true}); await wait(150);
  check('finished幽灵不能移动', own(await state(g),g).x === frozen.x);
  check('finished幽灵不能scare', (await action(g,'scare')).status === 400);
  check('finished活人jump/hammer冻结', (await action(a,'jump')).status === 400 && (await action(a,'hammer')).status === 400);
  check('finished身份技能冻结', (await skill(a,'probe',c)).status === 400);
  await advance(16000);
  check('finished仍可安全过期肿包且不复活', own(await state(a),npc).bumps === 0 && !own(await state(g),g).alive);
  await request('/api/host/reset',token(a),{confirm:true,csrfToken:cap.csrfToken});
  check('reset清累计/摘要/身份', (await testState()).players.length === 0 && (await state(b)).status === 401);

  // GH01/GH02 HTTP regressions: no privileged state mutation, only real skills/finish/advance.
  const freezePlayers = [];
  for (let i=0;i<5;i++) freezePlayers.push(await request('/api/join',null,{nickname:`F${i}`}));
  const [fa,fg,fd,fl,ft] = freezePlayers;
  const resourceJSON = me => JSON.stringify({ skills: me.skills, skillsFrozenAt: me.skillsFrozenAt });
  await skill(fg,'probe',ft);
  const fgInitial = (await state(fg)).me;
  check('GH01 HTTP预置真实probe2→1', fgInitial.skills.probe.chargesRemaining === 1);
  const fgSid = (await testState()).players.find(p=>p.id===fg.playerId).sid;
  await skill(fa,'kill',fg,fgSid);
  const fgFrozen = (await state(fg)).me;
  check('GH01 HTTP淘汰立即私密记录冻结时刻', !fgFrozen.alive && typeof fgFrozen.skillsFrozenAt==='number' && fgFrozen.skills.probe.chargesRemaining===1);
  await advance(180001);
  check('GH01 HTTP推进180001ms幽灵资源完整不变', resourceJSON((await state(fg)).me) === resourceJSON(fgFrozen));
  await action(fg,'scare'); await request('/api/ack',token(fg),{eventIds:[]});
  check('GH01 HTTP重复读/ACK/ghost动作不改资源时间戳', resourceJSON((await state(fg)).me) === resourceJSON(fgFrozen));
  const frozenStream = await connect(token(fg)); const frozenStreamFrame = await frozenStream.next();
  check('GH01 SSE首帧也保持冻结资源', resourceJSON(frozenStreamFrame.me) === resourceJSON(fgFrozen)); frozenStream.close();
  // Target recovery already due before elimination, not read/settled beforehand.
  await skill(fd,'probe',ft); await advance(90001);
  const fdSid = (await testState()).players.find(p=>p.id===fd.playerId).sid;
  await skill(fa,'kill',fd,fdSid);
  const fdFrozen = (await state(fd)).me;
  check('HTTP淘汰前补齐目标未懒结算到期恢复', fdFrozen.skills.probe.chargesRemaining===2 && fdFrozen.skills.probe.nextChargeAt===0 && !fdFrozen.alive);
  await skill(fl,'probe',ft);
  const offlineFlow = await connect(token(fl)); await offlineFlow.next(); offlineFlow.close(); await wait(80);
  await advance(90001);
  check('HTTP离线活人资源仍正常恢复', !(own(await state(fl),fl).online) && (await state(fl)).me.skills.probe.chargesRemaining===2);
  // Due offline recovery must be settled by manual finish, not by reading that player.
  await skill(fl,'probe',fa); await advance(90001);
  await skill(fa,'probe',ft); // 2→1 immediately before finish; no due recovery to accidentally mask GH02.
  const freezeCap = await request('/api/dev/capabilities',token(fa));
  await request('/api/host/finish',token(fa),{confirm:true,csrfToken:freezeCap.csrfToken});
  const faFrozen = (await state(fa)).me;
  check('GH02 HTTP手动结束冻结活人probe=1', faFrozen.skills.probe.chargesRemaining===1 && faFrozen.skillsFrozenAt!==null);
  check('HTTP结束前补齐离线活人未读取恢复', (await state(fl)).me.skills.probe.chargesRemaining===2);
  check('HTTP结束不覆盖更早幽灵冻结时刻', (await state(fg)).me.skillsFrozenAt===fgFrozen.skillsFrozenAt);
  await advance(180001);
  check('GH02 HTTP推进180001ms活人资源完整不变', resourceJSON((await state(fa)).me)===resourceJSON(faFrozen));
  await request('/api/host/finish',token(fa),{confirm:true,csrfToken:freezeCap.csrfToken});
  await action(fa,'hammer'); await request('/api/ack',token(fa),{eventIds:[]});
  check('HTTP重复finish/read/ACK/action均不改冻结资源', resourceJSON((await state(fa)).me)===resourceJSON(faFrozen));
  const publicFrozen = (await state(fa)).players;
  check('HTTP冻结时间/资源不进入公共字段', publicFrozen.every(p=>!('skillsFrozenAt' in p)&&!('skills' in p)&&!('faction' in p)&&!('hp' in p)));
  await request('/api/host/reset',token(fa),{confirm:true,csrfToken:freezeCap.csrfToken});
  const nextPlayers=[];for(let i=0;i<3;i++)nextPlayers.push(await request('/api/join',null,{nickname:`R${i}`}));
  const [na,nb,nc]=nextPlayers;
  check('HTTP重开清冻结标记', (await state(na)).me.skillsFrozenAt===null);
  await skill(na,'probe',nc);await advance(90001);
  check('HTTP重开后正常恢复', (await state(na)).me.skills.probe.chargesRemaining===2);
  const endingCommand=randomUUID();const nbSid=(await testState()).players.find(p=>p.id===nb.playerId).sid;
  const endingBody={skill:'kill',targetId:nb.playerId,sid:nbSid,commandId:endingCommand};
  await request('/api/skill',token(na),endingBody);
  const automatic=(await state(na));
  check('HTTP触发结束的最后技能消耗先于冻结', automatic.finished && automatic.me.skills.kill.chargesRemaining===1 && automatic.me.skills.kill.nextChargeAt===automatic.me.skillsFrozenAt+90000 && automatic.me.skills.kill.cooldownUntil===automatic.me.skillsFrozenAt+12000);
  const automaticJSON=resourceJSON(automatic.me);await request('/api/skill',token(na),endingBody);await advance(180001);
  check('HTTP重发结束指令不再消耗且冻结不恢复', resourceJSON((await state(na)).me)===automaticJSON);

  // Deterministic random selection, not flaky probability checks.
  const room = createRoom({ random: () => .99 });
  const ra = room.join('ra','ra').player, rb = room.join('rb','rb').player;
  const rp = () => room.useSkill('ra',{skill:'probe',targetId:rb.id,commandId:randomUUID()});
  check('可控random选择末项而非总选第一key', rp().ok && rb.traitPublic.sport && !rb.traitPublic.saying);
  room.room.clockOffset += 9000;
  check('随机只选剩余未公开集合', rp().ok && rb.traitPublic.food && !rb.traitPublic.saying);
  room.room.clockOffset += 100000; rp(); room.room.clockOffset += 9000;
  const charges = ra.skills.probe.chargesRemaining;
  check('全公开无项不消耗', !rp().ok && ra.skills.probe.chargesRemaining === charges);
  const localNpc = room.spawnNpc(1,ra)[0]; room.setOffline(localNpc.id);
  check('NPC不会被setOffline且不生成摘要', room.find(localNpc.id).online && room.prepareReconnect(room.find(localNpc.id)) === null);
  room.setOffline(rb.id); room.room.clockOffset += 1100; ra.x=1000; rb.x=1030; ra.y=rb.y=300;
  room.performAction(ra.id,'hammer'); room.prepareReconnect(rb);
  const oldEpoch = room.privateSnapshot(rb.id).me.interactionSummary.epoch;
  room.reset(); const newA=room.join('ra','ra').player,newB=room.join('rb','rb').player;
  room.setOffline(newB.id); newA.x=1000;newB.x=1030;newA.y=newB.y=300;
  room.performAction(newA.id,'hammer');room.prepareReconnect(newB);
  check('reset换epoch拒绝旧摘要ACK', room.privateSnapshot(newB.id).me.interactionSummary.epoch !== oldEpoch && !room.ack(newB.id,[],{id:summary1.id,epoch:oldEpoch}).ok);
  const unsentRoom = createRoom();
  const ua=unsentRoom.join('ua','ua').player,ub=unsentRoom.join('ub','ub').player;
  ua.x=1000;ub.x=1030;ua.y=ub.y=300;unsentRoom.setOffline(ub.id);
  unsentRoom.performAction(ua.id,'hammer'); const unsent=unsentRoom.prepareReconnect(ub);
  check('未发送摘要即使猜到id也不能ACK', !unsentRoom.ack(ub.id,[],{id:unsent.id,epoch:unsent.epoch}).ok);
  unsentRoom.privateSnapshot(ub.id);
  check('摘要实际发送后才能ACK', unsentRoom.ack(ub.id,[],{id:unsent.id,epoch:unsent.epoch}).ok);
  // Deterministic module freeze boundaries at exact timestamps (no probability or wall-clock jitter).
  const realNow=Date.now;let fixedNow=2_000_000_000_000;
  Date.now=()=>fixedNow;
  try {
    const fixture = (n=5) => {
      const r=createRoom({random:()=>0});const ps=[];
      for(let i=0;i<n;i++)ps.push(r.join(`M${i}`,`M${i}`).player);
      const use=(actor,kind,target,commandId=randomUUID())=>r.useSkill(actor.sessionId,{skill:kind,targetId:target.id,sid:target.sid.segments.join('-'),commandId});
      return {r,ps,use};
    };
    const frozenJSON=p=>JSON.stringify({skills:p.skills,skillsFrozenAt:p.skillsFrozenAt});
    const f=fixture();const [ma,mg,mt]=f.ps;
    f.use(mg,'probe',mt);f.use(ma,'kill',mg);
    const mgJSON=frozenJSON(mg),mgObjects=Object.values(mg.skills);
    check('GH01模块淘汰时probe余额1与冻结时刻记录', mg.skills.probe.chargesRemaining===1 && mg.skillsFrozenAt===fixedNow);
    fixedNow+=180001;
    f.r.privateSnapshot(mg.id);f.r.privateProjection(mg);f.r.publicSnapshot(ma.id);
    check('GH01模块推进180001ms重复读无资源恢复', frozenJSON(mg)===mgJSON);
    f.r.ack(mg.id,[]);f.r.performAction(mg.id,'scare');f.use(mg,'probe',mt);
    check('模块幽灵ACK/action/拒绝技能不改冻结对象及时间戳', frozenJSON(mg)===mgJSON && Object.values(mg.skills).every((s,i)=>s===mgObjects[i]));
    check('模块冻结时间私密下发、公有不泄露', f.r.privateSnapshot(mg.id).me.skillsFrozenAt===mg.skillsFrozenAt && !('skillsFrozenAt' in f.r.publicProjection(mg)));

    const due=fixture();const [da,dg,dt]=due.ps;
    due.use(dg,'probe',dt);fixedNow+=90000;due.use(da,'kill',dg);
    check('模块kill前恰好到期的目标恢复不丢', dg.skills.probe.chargesRemaining===2 && dg.skills.probe.nextChargeAt===0 && dg.skillsFrozenAt===fixedNow);
    const accuse=fixture();const [bad,good,targ]=accuse.ps;
    accuse.use(bad,'probe',targ);accuse.use(good,'accuse',bad);fixedNow+=90000;
    accuse.use(good,'accuse',bad);
    check('模块accuse淘汰也先结算目标到期资源', !bad.alive && bad.skillsFrozenAt===fixedNow && bad.skills.probe.chargesRemaining===2);
    check('模块accuse淘汰非结束局最后扣次有效', good.skills.accuse.chargesRemaining===1 && !accuse.r.room.finished);

    const end=fixture();const [ea,eg,et]=end.ps;
    end.use(ea,'probe',et);end.r.finish();const endJSON=frozenJSON(ea);
    check('GH02模块finish时活人余额1并全员冻结', ea.skills.probe.chargesRemaining===1 && end.ps.every(p=>p.skillsFrozenAt===fixedNow));
    fixedNow+=180001;end.r.privateSnapshot(ea.id);end.r.finish();end.r.performAction(ea.id,'hammer');end.r.ack(ea.id,[]);
    check('GH02模块读/finish/ACK/action完整对象不变', frozenJSON(ea)===endJSON);
    const dueEnd=fixture();const [deA,deB,deT]=dueEnd.ps;
    dueEnd.use(deB,'probe',deT);dueEnd.r.setOffline(deB.id);fixedNow+=90000;dueEnd.r.finish();
    check('模块手动finish补齐离线未读恰好到期资源', deB.skills.probe.chargesRemaining===2 && deB.skills.probe.nextChargeAt===0 && deB.skillsFrozenAt===fixedNow);
    const afterDue=fixture();const [adA,adB,adT]=afterDue.ps;
    afterDue.use(adB,'probe',adT);fixedNow+=89999;afterDue.r.finish();const adJSON=frozenJSON(adB);fixedNow+=2;afterDue.r.privateSnapshot(adB.id);
    check('模块冻结后一毫秒才到期的恢复不补', adB.skills.probe.chargesRemaining===1 && frozenJSON(adB)===adJSON);
    const prior=fixture();const [pa,pg,pt]=prior.ps;
    prior.use(pg,'probe',pt);prior.use(pa,'kill',pg);const priorFreeze=pg.skillsFrozenAt;fixedNow+=90000;prior.r.finish();
    check('模块结束保留幽灵更早冻结时刻和余额', pg.skillsFrozenAt===priorFreeze && pg.skills.probe.chargesRemaining===1);

    const auto=fixture(3);const [aa,ag,at]=auto.ps;const finalId=randomUUID();
    auto.use(at,'probe',aa);auto.r.setOffline(at.id);fixedNow+=90000;auto.use(aa,'kill',ag,finalId);
    check('模块自动结束先记最后消耗/幂等再冻全员', auto.r.room.finished && aa.skills.kill.chargesRemaining===1 && aa.skills.kill.nextChargeAt===fixedNow+90000 && aa.skills.kill.cooldownUntil===fixedNow+12000 && aa.skillsFrozenAt===fixedNow && auto.r.room.processed.get(finalId)===fixedNow);
    check('模块自动结束补齐其他离线存活者到期恢复', at.skills.probe.chargesRemaining===2 && at.skillsFrozenAt===fixedNow);
    const autoJSON=frozenJSON(aa);auto.use(aa,'kill',ag,finalId);fixedNow+=180001;auto.r.privateSnapshot(aa.id);
    check('模块重发最后结束指令只扣一次且无恢复', frozenJSON(aa)===autoJSON);
    const autoAccuse=fixture(3);const [ab,ac,acT]=autoAccuse.ps;
    autoAccuse.use(ac,'accuse',ab);fixedNow+=12000;autoAccuse.use(ac,'accuse',ab);
    check('模块指认触发结束也计最后消耗', autoAccuse.r.room.finished && ac.skills.accuse.chargesRemaining===0 && ac.skills.accuse.cooldownUntil===ac.skillsFrozenAt+12000);
    const off=fixture();const [oa,ob,ot]=off.ps;
    off.use(ob,'probe',ot);off.r.setOffline(ob.id);fixedNow+=90000;
    check('模块离线活人照常恢复、冻结标记为空', off.r.privateSnapshot(ob.id).me.skills.probe.chargesRemaining===2 && ob.skillsFrozenAt===null);
    auto.r.reset();const resetA=auto.r.join('M0','resetA').player,resetB=auto.r.join('M1','resetB').player;
    auto.r.useSkill('M0',{skill:'probe',targetId:resetB.id,commandId:randomUUID()});fixedNow+=90000;
    check('模块reset后清冻结并恢复技能次数', resetA.skillsFrozenAt===null && auto.r.privateSnapshot(resetA.id).me.skills.probe.chargesRemaining===2);
  } finally { Date.now=realNow; }
  const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
  const client=readFileSync(new URL('./public/game.js',import.meta.url),'utf8');
  check('静态键位契约：K跳且无Space游戏跳跃绑定', client.includes("e.code === 'KeyK'") && !client.includes("e.code === 'Space' ? 'jump'") && !html.includes('空格跳') && !html.includes('空格 跳'));
  check('静态规则：保留Survivor id用户拼写与4/3属性标题', html.includes('Survivor id（幸存者id）') && html.includes('4项外观属性，3项隐藏属性'));
  check('静态规则：正式3血/30分钟保护明确尚未生效', html.includes('试玩实现：坏人初始2血') && html.includes('尚未在当前试玩生效'));
  check('静态规则：身份技能分组6卡、不高亮本人', (html.match(/输入：/g)||[]).length === 6 && html.includes('不高亮所属组'));
  check('静态私密：ACK成功后才记确认并切出清摘要DOM', client.indexOf('if (!response.ok') < client.indexOf('confirmedDigests.add') && client.includes("$('offline-summary').replaceChildren()"));
} catch(error) { check('脚本异常', false, error.stack); }
finally { for (const s of streams) s.close(); child.kill('SIGTERM'); }
const failures = results.filter(r=>!r.pass);
console.log(`汇总：${results.length-failures.length}/${results.length} PASS；退出码 ${failures.length?1:0}`);
process.exitCode = failures.length?1:0;
