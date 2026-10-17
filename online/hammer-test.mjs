'use strict';
// 跳跃 / 锤子肢体互动的真实 HTTP 自测。
// 只用 Node 内置 fetch + child_process，不装任何依赖。
// 起的是临时测试服务（SID_TEST=1 / PORT=8899 / HOST=127.0.0.1），不碰 8787 上正在跑的服务。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8899;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail === undefined ? '' : String(detail) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  → ${detail}`}`);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

async function call(pathname, { method, token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Sid-Session'] = token;
  const res = await fetch(BASE + pathname, {
    method: method || (body ? 'POST' : 'GET'),
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}
const join = () => call('/api/join', { body: { nickname: '' } });
// 合并适配：合并后的地图是七层，自测用可选的 floorId 把角色放到指定楼层。
const place = (playerId, x, y, floorId) => call('/api/test/place', { body: { playerId, x, y, ...(floorId === undefined ? {} : { floorId }) } });
const advance = ms => call('/api/test/advance', { body: { ms } });
const action = (token, kind) => call('/api/action', { token, body: { kind } });
const input = (token, dir) => call('/api/input', { token, body: dir });
const state = token => call('/api/state', { token });
// 读 SSE 首帧：客户端实际走的是这条通道，必须确认裁剪在流里也生效。
async function streamFirstSnapshot(token) {
  const ctrl = new AbortController();
  try {
    const res = await fetch(`${BASE}/api/stream?sid_token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const { value } = await reader.read();
    ctrl.abort();
    const text = new TextDecoder().decode(value);
    const line = text.split('\n').find(l => l.startsWith('data: '));
    return line ? JSON.parse(line.slice(6)) : null;
  } catch { try { ctrl.abort(); } catch { /* already gone */ } return null; }
}
const pub = async token => {
  const s = await state(token);
  return { serverTime: s.data.serverTime, players: s.data.players || [], logs: s.data.logs || [], me: s.data.me };
};
const of = (players, id) => players.find(p => p.id === id) || {};

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + '/api/state'); if (r.status === 401 || r.status === 200) return true; } catch { /* not up yet */ }
    await wait(100);
  }
  return false;
}

const child = spawn(process.execPath, ['server.js'], {
  cwd: HERE,
  env: { ...process.env, SID_TEST: '1', PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
child.stdout.on('data', d => { serverLog += d.toString(); });
child.stderr.on('data', d => { serverLog += d.toString(); });

let exitCode = 1;
try {
  if (!await waitReady()) throw new Error('测试服务未能启动\n' + serverLog);

  check('锤子冷却配置为1000ms', (await import('./shared/world.js')).default.ACTION.hammerCooldownMs === 1000);
  // ---------- 0. 两名玩家加入 ----------
  const ja = await join(), jb = await join();
  check('两名玩家加入成功', ja.data.ok && jb.data.ok, `A=${ja.data.playerId} B=${jb.data.playerId}`);
  const ta = ja.data.sessionToken, tb = jb.data.sessionToken;
  const idA = ja.data.playerId, idB = jb.data.playerId;

  // ---------- 1. 相邻摆位 + A 挥锤命中 ----------
  await place(idA, 300, 300);
  await place(idB, 330, 300);
  const before = await pub(ta);
  const bBefore = of(before.players, idB);
  const logCountBefore = before.logs.length;

  const hit = await action(ta, 'hammer');
  const after = await pub(ta);
  const bAfter = of(after.players, idB);
  check('A 挥锤命中 B（hit=true, targetId=B）', hit.status === 200 && hit.data.ok && hit.data.hit === true && hit.data.targetId === idB, JSON.stringify(hit.data));
  check('B 的 stunUntil 有效（晚于当前服务端时间）', bAfter.stunUntil > after.serverTime, `stunUntil-serverTime=${bAfter.stunUntil - after.serverTime}ms`);
  check('B 头顶 bumps=1', bAfter.bumps === 1, `bumps=${bAfter.bumps}`);
  check('B 记录了 hitAt', bAfter.hitAt > (bBefore.hitAt || 0), `hitAt=${bAfter.hitAt}`);

  // ---------- 2. A 立刻再挥被冷却拒绝 ----------
  const again = await action(ta, 'hammer');
  check('A 立刻再挥被冷却拒绝（400 + 中文原因）', again.status === 400 && again.data.error === '锤子还没抡回来', `${again.status} ${JSON.stringify(again.data)}`);

  // ---------- 3. 晕眩期间不能移动 ----------
  await input(tb, { right: true });
  const p0 = (await pub(ta)).players.find(p => p.id === idB);
  await wait(260); // 真实 tick 跑 ~5 次
  const p1 = (await pub(ta)).players.find(p => p.id === idB);
  check('晕眩期间提交方向键，服务端 tick 后 x/y 不变', p0.x === p1.x && p0.y === p1.y, `(${p0.x},${p0.y}) → (${p1.x},${p1.y})`);
  check('晕眩期间 B 仍被标记为 stunUntil 未到期', p1.stunUntil > Date.now() - 5000 && p1.stunUntil > p1.hitAt, `stunUntil=${p1.stunUntil}`);

  // ---------- 4. 晕眩期间不能挥锤 ----------
  const bHammer = await action(tb, 'hammer');
  check('晕眩期间 B 主动挥锤被拒绝', bHammer.status === 400 && bHammer.data.error === '你还被敲晕着', JSON.stringify(bHammer.data));
  const bJump = await action(tb, 'jump');
  check('晕眩期间 B 主动跳跃被拒绝', bJump.status === 400 && bJump.data.error === '你还被敲晕着', JSON.stringify(bJump.data));
  await input(tb, { right: false });

  // ---------- 5. 晕眩到期后恢复移动 ----------
  await wait(600); // 累计已超过 stunMs=750
  const beforeMove = (await pub(ta)).players.find(p => p.id === idB);
  await input(tb, { right: true });
  await wait(260);
  const afterMove = (await pub(ta)).players.find(p => p.id === idB);
  check('晕眩到期后 B 能重新移动', afterMove.x > beforeMove.x, `${beforeMove.x} → ${afterMove.x}`);
  await input(tb, { right: false });

  // ---------- 6. 远距离挥锤不命中 ----------
  await advance(1400); // 清掉 A 的锤子冷却
  await place(idA, 300, 300);
  await place(idB, 900, 300);
  const farBefore = await pub(ta);
  const far = await action(ta, 'hammer');
  const farAfter = await pub(ta);
  const bFar = of(farAfter.players, idB);
  check('远距离挥锤 hit=false 且无目标', far.status === 200 && far.data.ok && far.data.hit === false && far.data.targetId === null, JSON.stringify(far.data));
  check('远距离挥锤没人被晕', bFar.stunUntil === of(farBefore.players, idB).stunUntil, `stunUntil=${bFar.stunUntil}`);

  // ---------- 7. 腾空闪避 ----------
  await advance(1400); // 再清一次 A 的冷却
  await place(idA, 300, 300);
  await place(idB, 330, 300);
  const jr = await action(tb, 'jump');
  check('B 起跳成功', jr.status === 200 && jr.data.ok, JSON.stringify(jr.data));
  const dbl = await action(tb, 'jump');
  check('空中二段跳被拒绝', dbl.status === 400 && dbl.data.error === '你还在空中', JSON.stringify(dbl.data));
  await advance(260); // 跳跃进度 ≈0.5，落在 jumpDodgeFrom..jumpDodgeTo 窗口内
  const midAir = await pub(ta);
  const bAir = of(midAir.players, idB);
  check('跳跃中 B 的 z>0', bAir.z > 0, `z=${bAir.z}`);
  const stunBeforeDodge = bAir.stunUntil, bumpsBeforeDodge = bAir.bumps;
  const dodge = await action(ta, 'hammer');
  const afterDodge = await pub(ta);
  const bDodge = of(afterDodge.players, idB);
  check('腾空窗口内 A 挥锤不命中（hit=false）', dodge.status === 200 && dodge.data.hit === false, JSON.stringify(dodge.data));
  check('腾空者没有被击晕（stunUntil 未变）', bDodge.stunUntil === stunBeforeDodge, `${stunBeforeDodge} → ${bDodge.stunUntil}`);
  check('腾空者没有新增肿包', bDodge.bumps === bumpsBeforeDodge, `${bumpsBeforeDodge} → ${bDodge.bumps}`);

  // ---------- 8. 超过 jumpMs 后 z 回到 0 ----------
  await advance(400);
  const landed = await pub(ta);
  check('超过 jumpMs 后 z 回到 0', of(landed.players, idB).z === 0, `z=${of(landed.players, idB).z}`);

  // ---------- 9. 落地后能被正常敲中（躲窗口之外）----------
  await advance(1400);
  await place(idA, 300, 300);
  await place(idB, 330, 300);
  const ground = await action(ta, 'hammer');
  const groundAfter = await pub(ta);
  check('落地后 A 挥锤正常命中', ground.status === 200 && ground.data.hit === true, JSON.stringify(ground.data));
  check('落地命中后 B 再次被击晕', of(groundAfter.players, idB).stunUntil > groundAfter.serverTime, `stunUntil=${of(groundAfter.players, idB).stunUntil}`);

  // ---------- 10. 不触碰既有玩法 ----------
  const sa = await state(ta), sb = await state(tb);
  check('A 的 hp / alive / sid / faction / skills 未被锤戏改动',
    sa.data.me.hp === 2 && sa.data.me.alive === true && sa.data.me.faction === 'bad' && /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(sa.data.me.sid),
    `hp=${sa.data.me.hp} alive=${sa.data.me.alive} sid=${sa.data.me.sid}`);
  check('B 的 hp / alive / sid / faction 未被锤戏改动',
    sb.data.me.hp === 1 && sb.data.me.alive === true && sb.data.me.faction === 'good' && /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(sb.data.me.sid),
    `hp=${sb.data.me.hp} alive=${sb.data.me.alive} sid=${sb.data.me.sid}`);
  check('技能次数仍满（锤子不消耗技能次数）',
    Object.values(sa.data.me.skills).every(s => s.chargesRemaining === s.maxCharges),
    JSON.stringify(Object.entries(sa.data.me.skills).map(([k, s]) => `${k}:${s.chargesRemaining}/${s.maxCharges}`)));
  check('S-ID 无新增公开段（公共投影仍是 ***-***-***）',
    of(sa.data.players, idB).sid === '***-***-***' && of(sa.data.players, idA).sid === '***-***-***',
    `A=${of(sa.data.players, idA).sid} B=${of(sa.data.players, idB).sid}`);
  const leaked = sa.data.players.flatMap(p => Object.keys(p).filter(k => ['faction', 'hp', 'skills', 'traits_raw', 'bumps_detail'].includes(k)));
  check('公共快照不含 faction / hp / skills 字段', leaked.length === 0, leaked.length ? `泄漏字段: ${[...new Set(leaked)].join(',')}` : '无');
  // 合并适配：main 分支的公共投影另带战斗/楼层字段（score、floorId、spriteFacing、facing、
  // lastAttack*、freezeUntil）；这些是 main 的公开战斗状态，不属于锤戏裁剪字段。
  // 阶段4（需求①）：新增 zoneId —— 独立小房间的公开空间键，客户端据此只渲染同一空间里的人；
  // 它和 floorId 同级，是地图公开信息，不含任何身份/血量/筹码数据。
  const allowed = new Set(['id', 'name', 'alive', 'online', 'x', 'y', 'colors', 'traits', 'sid', 'visible', 'z', 'stunUntil', 'bumps', 'bumpUntil', 'swingAt', 'hitAt', 'frightUntil', 'scareAt', 'frightAt',
    'score', 'floorId', 'spriteFacing', 'facing', 'lastAttackAt', 'lastAttackFacing', 'lastAttackDirection', 'freezeUntil',
    'zoneId']);
  const extra = sa.data.players.flatMap(p => Object.keys(p).filter(k => !allowed.has(k)));
  check('公共快照未新增隐藏字段（仅visible与锤戏/受惊必要字段）', extra.length === 0, extra.length ? `多余字段: ${[...new Set(extra)].join(',')}` : '无');
  const logCountNow = sa.data.logs.length;
  check('公共日志未新增条目（锤戏不写日志）', logCountNow === logCountBefore, `${logCountBefore} → ${logCountNow}`);

  // ---------- 11. 可见性裁剪：锤戏字段只在亲眼可见时下发 ----------
  const jc = await join();
  const tc = jc.data.sessionToken, idC = jc.data.playerId;
  check('第三名玩家加入成功', jc.data.ok, `C=${idC}`);
  // 合并适配：合并后的地图是七层、每层正好一屏；C 放到 2F，跨层的锤戏字段不可见。
  await place(idA, 300, 300);
  await place(idB, 330, 300);
  await place(idC, 300, 300, 2);
  await advance(1400); // 清掉 A 的锤子冷却，同时让 B 此前的晕眩与肿包过期无关化
  const swing = await action(ta, 'hammer');
  const viewA = await pub(ta), viewB = await pub(tb), viewC = await pub(tc);
  const aByA = of(viewA.players, idA), bByA = of(viewA.players, idB), cByA = of(viewA.players, idC);
  const bByB = of(viewB.players, idB);
  const aByC = of(viewC.players, idA), bByC = of(viewC.players, idB), cByC = of(viewC.players, idC);
  check('同屏观察者能看到挥锤与命中（A 视角）', swing.data.hit === true && aByA.swingAt > 0 && bByA.hitAt > 0 && bByA.bumps > 0 && bByA.stunUntil > viewA.serverTime,
    `swingAt=${aByA.swingAt} hitAt=${bByA.hitAt} bumps=${bByA.bumps}`);
  // 合并适配：stunUntil 在 main 分支是公开战斗状态（不随镜头裁剪），故这里只校验 dev 的锤戏字段归零。
  check('屏幕外第三人 C 看到的锤戏字段全为 0',
    aByC.swingAt === 0 && bByC.hitAt === 0 && bByC.bumps === 0 && bByC.bumpUntil === 0 && bByC.z === 0 && bByC.visible === false,
    `A.swingAt=${aByC.swingAt} B.hitAt=${bByC.hitAt} B.bumps=${bByC.bumps} B.bumpUntil=${bByC.bumpUntil} B.visible=${bByC.visible} B.z=${bByC.z}`);
  check('裁剪后字段仍然存在（只是归零，不是消失）',
    ['z', 'stunUntil', 'bumps', 'bumpUntil', 'swingAt', 'hitAt'].every(k => k in bByC),
    Object.keys(bByC).join(','));
  check('屏幕外第三人看不到 C 之外的被击晕者（A 视角下 C 无锤戏信息）',
    cByA.bumps === 0 && cByA.swingAt === 0 && cByA.hitAt === 0,
    `C.bumps=${cByA.bumps} C.swingAt=${cByA.swingAt}`);
  check('当事人始终看得见自己的状态（B 视角下 B 自己）', bByB.stunUntil > 0 && bByB.bumps > 0 && bByB.hitAt > 0,
    `stunUntil=${bByB.stunUntil} bumps=${bByB.bumps} hitAt=${bByB.hitAt}`);

  // 屏幕外的跳跃高度恒为 0
  await advance(1400);
  const jc2 = await action(tc, 'jump');
  await advance(100); // C 仍在空中（进度≈0.19，落在腾空窗口内）
  const zSelf = of((await pub(tc)).players, idC).z;
  const zByA = of((await pub(ta)).players, idC).z;
  check('自己看得到自己在空中（C 视角 z>0）', jc2.data.ok && zSelf > 0, `z=${zSelf}`);
  check('屏幕外的人 z 恒为 0（A 视角看 C）', zByA === 0, `z=${zByA}`);

  // 走近后立刻拿到真实值
  await place(idC, 360, 320, 1); // 回到 1F，与 A/B 同层：立刻拿到真实值
  const nearC = await pub(tc), nearA = await pub(ta);
  check('C 走近后立刻看到真实的锤戏字段', of(nearC.players, idB).bumps > 0 && of(nearC.players, idA).swingAt > 0,
    `B.bumps=${of(nearC.players, idB).bumps} A.swingAt=${of(nearC.players, idA).swingAt}`);
  check('走近后 A 也能看到 C 的真实高度', of(nearA.players, idC).z > 0, `C.z=${of(nearA.players, idC).z}`);
  // 走远后重新归零
  await place(idC, 300, 300, 2);
  const farC = await pub(tc);
  check('走远后再次归零（可往返）', of(farC.players, idB).bumps === 0 && of(farC.players, idA).swingAt === 0,
    `B.bumps=${of(farC.players, idB).bumps} A.swingAt=${of(farC.players, idA).swingAt}`);

  // ---------- 12. 真实 SSE 流同样按观察者裁剪（客户端走的是这条通道）----------
  const snap = await streamFirstSnapshot(ta);
  if (!snap) {
    check('SSE 流首帧可读', false, '未能读到首帧');
  } else {
    const sB = (snap.players || []).find(p => p.id === idB);
    const sC = (snap.players || []).find(p => p.id === idC);
    check('SSE 流里同屏目标带真实锤戏字段', !!sB && sB.bumps > 0 && sB.hitAt > 0, sB && `B.bumps=${sB.bumps} B.hitAt=${sB.hitAt}`);
    // 合并适配：stunUntil 是 main 的公开战斗字段，不做跨层裁剪，这里只校验 dev 的锤戏字段。
    check('SSE 流里屏幕外目标字段全为 0', !!sC && sC.bumps === 0 && sC.swingAt === 0 && sC.hitAt === 0 && sC.visible === false,
      sC && `C.bumps=${sC.bumps} C.visible=${sC.visible}`);
  }

  // ---------- 13. visible 布尔 + 相机窗口裁剪（把推算变成断言）----------
  // 阶段3：每层楼板加宽到 1440×400（大于 VIEW_W=960），可见性 = 「同层 且 落在观察者相机窗口内」，
  // 不再等价于「同层」。这里同时断言「窗口内可见」与「同层但在窗口外被裁剪」。
  await advance(1400);
  await place(idA, 300, 300);
  await place(idB, 330, 300);
  const hs = await action(ta, 'hammer');
  const expectBumps = of((await pub(ta)).players, idB).bumps;
  check('基线：A 敲中 B 拿到真实肿包数', hs.data.hit === true && expectBumps > 0, `bumps=${expectBumps}`);
  const bounds1 = (await import('./shared/world.js')).default.floorBounds(1);
  // 相机窗口内（A 位于 x=300，窗口约 [0, VIEW_W]）：同层可见，必须拿到真实值而不是 0。
  for (const [label, bx] of [['窗口内左近', Math.max(bounds1.minX, 120)], ['窗口内右近', Math.min(bounds1.maxX, 780)]]) {
    await place(idB, bx, 300);
    const b = of((await pub(ta)).players, idB);
    check(`同层且相机窗口内（${label}）拿到真实值而非 0`, b.visible === true && b.bumps === expectBumps,
      `visible=${b.visible} bumps=${b.bumps} 期望=${expectBumps}`);
  }
  // 同层但在观察者相机窗口之外：楼板已宽于一屏，应被裁剪为 0（不再是「同层即可见」）。
  await place(idB, bounds1.maxX, 120);
  {
    const b = of((await pub(ta)).players, idB);
    check('同层但相机窗口外（右边界内侧）被裁剪为 0', b.visible === false && b.bumps === 0,
      `visible=${b.visible} bumps=${b.bumps}`);
  }
  await place(idC, 300, 300, 2);
  await place(idB, 330, 300);
  const vA = await pub(ta), vC = await pub(tc);
  check('自己对自己 visible=true', of(vA.players, idA).visible === true && of(vC.players, idC).visible === true, 'A/C 自视角');
  check('屏幕外目标 visible=false 且锤戏字段为 0',
    of(vC.players, idB).visible === false && of(vC.players, idB).bumps === 0,
    `visible=${of(vC.players, idB).visible} bumps=${of(vC.players, idB).bumps}`);
  check('同人同状态在不同视角下一致（A 看 B 真实，C 看 B 归零）',
    of(vA.players, idB).bumps === expectBumps && of(vC.players, idB).bumps === 0,
    `A视角=${of(vA.players, idB).bumps} C视角=${of(vC.players, idB).bumps}`);
} catch (error) {
  check('测试脚本异常中止', false, error && error.stack || error);
} finally {
  child.kill('SIGKILL');
}

const failed = results.filter(r => !r.pass);
console.log('\n──────── 汇总 ────────');
console.log(`通过 ${results.length - failed.length} / ${results.length}`);
if (failed.length) for (const f of failed) console.log(`  失败：${f.name}${f.detail ? ` → ${f.detail}` : ''}`);
exitCode = failed.length ? 1 : 0;
console.log(`退出码：${exitCode}`);
process.exit(exitCode);
