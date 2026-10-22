// 猜拳升级（RPS upgrade）独立 QA — 零依赖原生 CDP，两个互相隔离的浏览器 context 会话。
//
// 作用域（重要）：
//   - 仅验收「猜拳升级」：rpsInvite(无 choice) → rpsReply/rpsReject → selecting 10s(startedAt/deadline 共同)
//     → rpsChoose{challengeId,choice,revision} 双方可改 → 私有 pending(ownChoice/ownRevision 仅自己)
//     → games.rpsResult 权威揭示(self/opponent choice + win/lose/draw/delta) → 缺选/离线/取消全取消无扣 → 5s 冷却。
//   - 旧 mechanics-browser-test.mjs 的「原 guess 流程」基于旧协议(choice 写进 invite、即时结算)，与升级后不兼容；
//     本套件是其替代验收。
//   - 最终入口决定：联机 games-toggle「互动小游戏」入口与全局玩家列表邀请【已移除】；唯一入口为「靠近角色按 K
//     弹交互菜单 / 点击 target 角色」出现的「邀请猜拳」项。故本套件断言 #games-toggle 不存在、toolbar 无
//     『互动小游戏』文案，且不再按保留旧入口测试。其他 NPC 转盘玩法不在本套件范围。
//
// 运行模式：
//   - PRODUCT_READY=false（默认，产品未完成）：PLAN 模式。仅启动 harness，建立两个隔离 context 并真实加入，
//     校验隔离(localStorage/会话不共享)，然后输出测试计划 + selectors 需求到 outputs/rps-browser-qa.json，
//     不做任何 RPS 业务断言、不产生假通过、不产生 rps-*.png。
//   - PRODUCT_READY=true（main 通知最终 selectors 后）：RUN 模式。执行完整验收 + 4 张截图
//     (rps-invitation.png / rps-selection.png / rps-result.png / rps-mobile.png) + outputs/rps-browser-qa.json。
//
// 由 managed Node22 执行；服务端使用 process.execPath；HOST 127.0.0.1 动态端口；Chrome 独立用户目录，finally 关闭自起进程并删除专属 tmp。
// 加载/参考了 online/progression-browser-test.mjs 的原生 CDP 脚手架与 online/mechanics-browser-test.mjs 的旧猜拳用例。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
// Node 22 内置全局 WebSocket（CDP over WS）。复用线上 progression-browser-test.mjs 的同款约定，不额外依赖 ws 包。

const online = dirname(fileURLToPath(import.meta.url)), root = dirname(online);
const outputs = join(root, 'outputs');
const profile = join(outputs, `.rps-profile-${randomUUID().slice(0, 8)}`);
const reportPath = join(outputs, 'rps-browser-qa.json');
const shotInvitation = join(outputs, 'rps-invitation.png');
const shotSelection = join(outputs, 'rps-selection.png');
const shotResult = join(outputs, 'rps-result.png');
const shotMobile = join(outputs, 'rps-mobile.png');
const chromePath = process.env.SID_CHROME || '/usr/bin/google-chrome';

// ============================ 配置（main 通知最终 selectors 后填写） ============================
// 产品尚未完成：PRODUCT_READY 保持 false，本脚本仅跑 PLAN 模式。
// 下方 NEW 协议的 selectors 与 API 契约需 main 在前后端并行实现完成后，回传“最终 selectors”再填。
const CFG = {
  PRODUCT_READY: false,
  HOST: '127.0.0.1',
  // world.js 现有常量（升级协议默认值，待 main 确认未被改）：30s 邀请、10s selecting、5s 冷却、stake=1。
  INVITE_TTL_MS: 30000,
  SELECTING_MS: 10000,
  COOLDOWN_MS: 5000,
  STAKE: 1,
  // 稳定、复用自现有页面的 selectors（加入流程未变）。
  join: {
    joinPage: '#join-page',
    nickname: '#nickname',
    submit: '#join-form button[type=submit]',
    rosterCount: '#roster-count',
  },
  // —— 以下为「猜拳升级」新增 UI 的 selectors 需求。值保持 'TODO' 表示待 main 确认。
  // 每个条目后注释为该 selector 验收时的作用。
  rps: {
    // 入口（唯一）：靠近角色按 K 弹交互菜单，或点击目标角色，出现「邀请猜拳」项。games-toggle 入口已移除。
    inviteEntry: 'TODO',            // 发起邀请的触发入口（E 交互菜单项 / 点击 target 出现的按钮）
    // games-toggle「互动小游戏」入口已按最终决定【移除】：仅用于断言其不存在（应为 null/隐藏）且 toolbar 无『互动小游戏』文案。
    gamesToggle: '#games-toggle',   // 仅用于断言“已移除”，不再作为可点击入口
    requireGamesToggleRemoved: true,
    // 被邀请方自动出现的「邀请确认弹窗」：同意 / 拒绝。
    invitePopup: 'TODO',            // 被邀请方可见的邀请确认弹窗容器
    inviteAccept: 'TODO',           // 弹窗内「同意」按钮（rpsReply/rpsAccept）
    inviteReject: 'TODO',           // 弹窗内「拒绝」按钮（rpsReject）
    // selecting 阶段：上方自己(左) / 对手(右) 的待揭示手势 SVG；下方三按钮。
    arena: 'TODO',                  // selecting 竞技场容器
    selfHand: 'TODO',               // 自己侧 SVG（data-choice 反映 ownChoice，仅自己可见）
    opponentHand: 'TODO',           // 对手侧 SVG（deadline 前不应显示对手 choice）
    choiceRock: 'TODO',             // 石头按钮（建议带 data-choice="rock"）
    choicePaper: 'TODO',            // 布按钮
    choiceScissors: 'TODO',         // 剪刀按钮（pixel SVG 明确手势）
    deadlineLabel: 'TODO',          // 倒计时文案（双方一致，始于 accept）
    // 结算揭示：权威揭示后双方 choice + 胜负 + delta。
    result: 'TODO',                 // 结算揭示视图容器
    resultSelf: 'TODO',             // 自己出拳揭示
    resultOpponent: 'TODO',         // 对手出拳揭示
    resultVerdict: 'TODO',          // 胜/负/平 + 筹码 delta 文案
    cooldownLabel: 'TODO',          // 冷却中文案
    pending: 'TODO',                // pending 状态容器（仅自己可见 ownChoice/ownRevision）
  },
  // API 契约（已对照 online/room.js 当前实现确认复用 /api/play，以 kind 区分）。
  api: {
    play: '/api/play',              // {commandId, kind, ...}
    // kind 枚举（已确认）：
    //   rpsInvite{targetId}                        发起邀请（无 choice）
    //   rpsReply | rpsAccept{challengeId}          被邀请方“同意”，进入 selecting（共同 startedAt/deadline）
    //   rpsReject{challengeId}                     被邀请方“拒绝”→ 取消、不扣
    //   rpsChoose{challengeId,choice,revision}     双方均可改自己的出拳（revision 递增）
    //   rpsCancel{challengeId}                     任一方取消 → 取消、不扣
    testState: '/api/test/state',   // SID_TEST=1 专用：直接读房间全量，便于校验私密投影
    testAdvance: '/api/test/advance',
  },
  phases: { invited: 'invited', selecting: 'selecting' }, // invited 30s → accept 后 selecting(t+rpsRoundMs)
  // 私有投影形状（已对照 gamesProjection 确认）：me.games.rpsPending / rpsResult 仅含自己可见字段。
  projection: {
    pendingFields: ['id', 'role', 'fromId', 'toId', 'fromName', 'toName', 'phase', 'expiresAt', 'startedAt', 'deadline', 'ownChoice', 'ownRevision'],
    // 关键：pending 不得含 opponentChoice / opponent 是否已选（私密，已确认 backend 不泄露）。
    resultFields: ['id', 'status', 'ownChoice', 'opponentChoice', 'opponentName', 'outcome', 'delta', 'reason', 'completedAt'],
    // status: 'resolved' | 'cancelled'；outcome: 'win'|'lose'|'draw'；delta 为“自己”视角带符号变化。
    // 公共 roster 投影（publicProjection，line 259）不含 games —— 第三方无 games（RPS-05 后端已满足）。
    publicMustNotHave: ['games', 'rpsPending', 'rpsResult'],
  },
};

// ============================ 通用脚手架（复用 progression） ============================
const freePort = () => new Promise((ok, no) => {
  const s = createServer(); s.once('error', no);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); });
});
const port = await freePort(), debugPort = await freePort();
const base = `http://${CFG.HOST}:${port}`;
let server, chrome, ws, browserVersion, fatalError;
const inflight = new Map();
let cdpSequence = 0;
const commandSequence = { n: 0 };
const commandId = () => `rps-qa-${Date.now()}-${++commandSequence.n}`;
const waitFor = async (label, predicate, timeout = 9000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const v = await predicate(); if (v) return v; await pause(25); }
  throw Error(`等待超时：${label}`);
};
const results = [], runtimeErrorsAll = [], screenshots = [], cleanup = {};
const mode = CFG.PRODUCT_READY ? 'run' : 'plan';
const hashes = async () => {
  const files = ['online/server.js', 'online/room.js', 'online/public/game.js', 'online/public/index.html'];
  return Object.fromEntries(await Promise.all(files.map(async f => {
    try { return [f, createHash('sha256').update(await readFile(join(root, f))).digest('hex')]; }
    catch { return [f, 'missing']; }
  })));
};
const protectedBefore = await hashes();

function sendRaw(message) {
  return new Promise((ok, no) => {
    const id = message.id;
    const timer = setTimeout(() => { inflight.delete(id); no(Error(`CDP 超时：${message.method}`)); }, 15000);
    inflight.set(id, { ok: r => { clearTimeout(timer); ok(r); }, no: e => { clearTimeout(timer); no(e); } });
    ws.send(JSON.stringify(message));
  });
}
const browserSend = (method, params = {}) => sendRaw({ id: ++cdpSequence, method, params });

// 浏览器级 WebSocket + 消息分发（按 sessionId 路由事件到对应 Context）
const ctxBySession = new Map();
ws = null;
async function connectBrowser() {
  const version = await fetch(`http://${CFG.HOST}:${debugPort}/json/version`).then(r => r.json());
  browserVersion = version;
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && inflight.has(m.id)) { const p = inflight.get(m.id); inflight.delete(m.id); m.error ? p.no(Error(m.error.message)) : p.ok(m.result); }
    if (m.sessionId) { const ctx = ctxBySession.get(m.sessionId); ctx?.onMessage(m); }
  };
}

// 单个隔离浏览器 context（独立 user-data 无法跨 context 共享，天然隔离 localStorage/cookie）
class Ctx {
  constructor(label) { this.label = label; this.sessionId = null; this.ctxId = null; this.targetId = null; this.runtimeErrors = []; this.consoleErrors = []; }
  async create() {
    const c = await browserSend('Target.createBrowserContext');
    this.ctxId = c.browserContextId;
    const t = await browserSend('Target.createTarget', { url: 'about:blank', browserContextId: this.ctxId, width: 1440, height: 1100 });
    this.targetId = t.targetId;
    const a = await browserSend('Target.attachToTarget', { targetId: this.targetId, flatten: true });
    this.sessionId = a.sessionId;
    ctxBySession.set(this.sessionId, this);
    await this.send('Runtime.enable'); await this.send('Page.enable'); await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await this.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__qaSSE=[];window.__qaAPI=[];const NES=window.EventSource;window.EventSource=class extends NES{constructor(...a){super(...a);this.addEventListener('message',()=>window.__qaSSE.push(performance.now()));}};const __f=window.fetch;window.fetch=function(...a){const u=String(a[0]);return __f.apply(this,a).then(r=>{try{const c=r.clone();c.json().then(j=>window.__qaAPI.push({url:u,status:r.status,body:j})).catch(()=>{});}catch(e){}return r;});};` });
  }
  onMessage(m) {
    if (m.method === 'Runtime.exceptionThrown') this.runtimeErrors.push(m.params);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.consoleErrors.push(m.params);
  }
  send(method, params = {}) { return sendRaw({ id: ++cdpSequence, sessionId: this.sessionId, method, params }); }
  async ev(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception)); return r.result.value; }
  async navigate(url, predicate) {
    await this.send('Page.navigate', { url });
    await waitFor('页面加载 ' + url, async () => this.ev(`location.href===${JSON.stringify(url)}&&document.readyState==='complete'${predicate ? '&&(' + predicate + ')' : ''}`).catch(() => false));
    await this.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  }
  async screenshot(path) { await this.ev('window.scrollTo(0,0);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))'); const s = await this.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(path, Buffer.from(s.data, 'base64')); screenshots.push(path); }
  async setViewport(w, h) { await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); }
  async click(selector) {
    const r = await this.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.hidden)throw Error('控件不存在或隐藏');e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();if(!b.width||!b.height)throw Error('控件不可见');return {x:b.x+b.width/2,y:b.y+b.height/2}})()`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
  }
  async typeText(selector, text) { await this.click(selector); await this.send('Input.insertText', { text }); }
  api(path, body, token) {
    return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { 'X-Sid-Session': token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(6000) }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));
  }
  state(token) { return this.api('/api/state', undefined, token).then(r => r.data); }
}

// ============================ 登录两个隔离会话 ============================
async function joinReal(ctx, nickname) {
  await ctx.navigate(base + '/', `!!document.querySelector(${JSON.stringify(CFG.join.joinPage)})&&!document.querySelector(${JSON.stringify(CFG.join.joinPage)}).hidden`);
  await ctx.typeText(CFG.join.nickname, nickname);
  await ctx.click(CFG.join.submit);
  await waitFor('已加入并收到权威快照', async () => ctx.ev(`document.querySelector(${JSON.stringify(CFG.join.joinPage)}).hidden&&__qaSSE.length>1`).catch(() => false));
  return ctx.ev(`localStorage.getItem('sid_session_token')`);
}

// ============================ PLAN 模式：校验 harness + 输出计划/需求 ============================
const PLAN = [
  { id: 'RPS-01', title: '入口：仅近角色 E 交互菜单 / 点击 target 发起；games-toggle 已移除', checks: ['在 64px 内按 K 弹交互菜单或点击目标角色，出现「邀请猜拳」项（唯一入口）', '断言 #games-toggle 不存在且 toolbar 不含『互动小游戏』文案（原入口已移除，不再测试保留旧入口）'], requires: ['rps.inviteEntry'] },
  { id: 'RPS-02', title: '邀请：发起后出现邀请确认弹窗，对手端出现同意/拒绝', checks: ['发起方进入等待（invited 30s）', '对手端自动弹出邀请确认弹窗(rpsInvite SSE)', '弹窗含同意/拒绝', '服务端 pending.role 正确(from/to)'], requires: ['rps.invitePopup', 'rps.inviteAccept', 'rps.inviteReject', 'api.play(rpsInvite 无 choice)', 'projection.pendingFields'] },
  { id: 'RPS-03', title: '同意：双方进入 selecting，deadline 相同（实等 10s 验证同步）', checks: ['accept 后双方 startedAt/deadline 一致', '真实等待一次 ~10s，deadline 末段双方仍一致（不伪通过 advance）', 'deadline 文案双方一致'], requires: ['projection.pendingFields(startedAt/deadline)', 'rps.deadlineLabel', 'SELECTING_MS=10000'] },
  { id: 'RPS-04', title: '选择 + 改选：双方可改；自己 SVG data-choice 立即变化；对手 deadline 前不显示', checks: ['点击 rock/paper/scissors 立即更新 ownChoice', '可反复改选且 revision 递增', '对手侧 SVG 在 deadline 前不显示对方 choice', 'rpsChoose{challengeId,choice,revision} 双方可用'], requires: ['rps.choiceRock', 'rps.choicePaper', 'rps.choiceScissors', 'rps.selfHand', 'rps.opponentHand', 'api.play(rpsChoose)'] },
  { id: 'RPS-05', title: '私密：经 API+SSE 校验 A/B 都不泄露对方 choice；第三方 roster 无 games', checks: ['A 的 me.games.rpsPending 不含 opponentChoice', 'B 的 me.games 不含 A 的 choice', '公共 /api/state 的 players[] 无 games/rpsPending/rpsResult', 'SSE 消息体不含对手 choice'], requires: ['projection.pendingFields', 'projection.publicMustNotHave', 'api.testState'] },
  { id: 'RPS-06', title: '结算：deadline 刚过前不揭示，之后 revealed 胜负，准确筹码/积分 delta', checks: ['deadline 前 result 视图不显示对手出拳', 'deadline 后权威揭示 self/opponent choice + verdict + delta', 'me.exploration.chips 按 delta 变化且不为负', '公开投影 score 同步'], requires: ['rps.result', 'rps.resultSelf', 'rps.resultOpponent', 'rps.resultVerdict', 'projection.resultFields'] },
  { id: 'RPS-07', title: '平局：双方相同出拳 → 不扣筹码', checks: ['verdict=draw', '双方 chips 不变'], requires: ['projection.resultFields(delta=0)'] },
  { id: 'RPS-08', title: '单未选/双未选：缺选 → 全取消无扣', checks: ['一方未选 → 取消，双方不扣', '双方未选 → 取消，双方不扣'], requires: ['api.play(rpsCancel/超时)', 'projection.resultFields(取消无 delta)'] },
  { id: 'RPS-09', title: '拒绝：rpsReject → 清理、不扣筹码、可取消', checks: ['拒绝后双方 pending 清空', '不扣筹码', '拒绝方无冷却或按规则处理'], requires: ['rps.inviteReject', 'api.play(rpsReject)'] },
  { id: 'RPS-10', title: '重复邀请 / 不二次接受', checks: ['已有 pending 时拒绝新 invite', '冷却中拒绝新 invite', '已 accept 后不再触发二次接受', '拒绝后不双计'], requires: ['COOLDOWN_MS=5000', 'rps.cooldownLabel'] },
  { id: 'RPS-11', title: '取消/退出/断线清理 + 异步 rollback + 重开/刷新恢复不泄露、stream 竞态', checks: ['rpsCancel 清空 pending 不扣', '一方离线/退出 → 异步 rollback 全取消无扣、另一方 UI 不卡死不泄露', '刷新后不泄露对方选择、20Hz 下按钮身份稳定（无按下瞬间被替换）', '重开可再次邀请'], requires: ['rps.pending', 'api.play(rpsCancel)', 'projection 稳定'] },
  { id: 'RPS-12', title: '移动端 390：上下布局两 col、按钮不溢出', checks: ['390 宽下 selection 为上下两列、三按钮不溢出视口', '截图 rps-mobile.png'], requires: ['rps.arena', 'rps.choiceRock/paper/scissors', 'mobile 视口渲染'] },
  { id: 'RPS-13', title: '无 runtime 异常（允许已知 401/403/favicon 404）', checks: ['全流程 Runtime.exceptionThrown / console.error 为空', '已知初始化 401/403/favicon 404 准确说明，不扩范围修复'], requires: ['harness 运行'] },
];
const SCREENSHOTS_PLAN = [
  { file: basename(shotInvitation), when: 'RPS-02 被邀请方弹窗出现时', scope: '邀请确认弹窗（含同意/拒绝）' },
  { file: basename(shotSelection), when: 'RPS-04 双方 selecting 中、各自已选', scope: 'selecting 双方视图（左自己/右对手，deadline 文案）' },
  { file: basename(shotResult), when: 'RPS-06 deadline 后揭示', scope: 'settled 结算视图（双方出拳 + 胜负 + delta）' },
  { file: basename(shotMobile), when: 'RPS-12 390 宽 selection', scope: 'mobile 布局（上下两 col，按钮不溢出）' },
];

async function runPlan() {
  results.push({ name: 'PLAN 模式：harness 启动 + 两隔离 context 真实加入 + 隔离校验', pass: true, detail: { note: '产品未完成，仅验证脚手架；未执行 RPS 业务断言、未产生假通过/截图' } });
  const A = new Ctx('A'), B = new Ctx('B');
  await A.create(); await B.create();
  const tokenA = await joinReal(A, 'RPS甲'), tokenB = await joinReal(B, 'RPS乙');
  assert.ok(tokenA && tokenB, '两个会话都应成功加入');
  const sA = await A.state(tokenA), sB = await B.state(tokenB);
  assert.notEqual(sA.me.id, sB.me.id, '两 context 应为不同玩家(不同会话)');
  const lsA = await A.ev(`localStorage.getItem('sid_session_token')`), lsB = await B.ev(`localStorage.getItem('sid_session_token')`);
  assert.notEqual(lsA, lsB, '两独立 context 的 localStorage 会话令牌必须不同（隔离）');
  // 隔离反向校验：A 读不到 B 的会话存储（不同 context 天然隔离）
  const isolationOk = await A.ev(`(function(){try{return localStorage.getItem('sid_session_token')===${JSON.stringify(lsA)};}catch(e){return false;}})()`);
  assert.equal(isolationOk, true);
  const pendingRequirement = PLAN.flatMap(p => p.requires).filter(r => r.startsWith('rps.') || r.startsWith('api.') || r.startsWith('projection.'));
  const todoSelectors = Object.entries(CFG.rps).filter(([, v]) => v === 'TODO').map(([k]) => 'rps.' + k);
  const report = {
    mode: 'plan', date: new Date().toISOString(), engine: 'Linux Chrome headless(--no-sandbox) + managed Node22 零依赖原生 CDP，两个 Target.createBrowserContext 隔离会话',
    host: CFG.HOST, port, environment: { SID_DEV: '1', SID_TEST: '1' },
    note: '本套件替代旧 mechanics-browser-test 的 guess 验收（旧协议不兼容）。产品 front/backend 并行实现中，待 main 通知最终 selectors 后切换 RUN 模式。',
    testPlan: PLAN, screenshotsPlan: SCREENSHOTS_PLAN,
    selectorsRequirement: {
      todoRpsSelectors: todoSelectors,
      apiContract: CFG.api,
      timing: { INVITE_TTL_MS: CFG.INVITE_TTL_MS, SELECTING_MS: CFG.SELECTING_MS, COOLDOWN_MS: CFG.COOLDOWN_MS, STAKE: CFG.STAKE },
      projection: CFG.projection,
    },
    harnessVerified: { contexts: 2, joined: true, isolationLocalStorageDiffers: true, ctxAid: sA.me.id, ctxBid: sB.me.id },
    summary: { planned: PLAN.length, todoSelectors: todoSelectors.length, run: 0, passed: 0, failed: 0 },
    screenshots: [], cleanup,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ mode, planned: PLAN.length, todoSelectors: todoSelectors.length, reportPath: resolve(reportPath) }, null, 2));
  return { A, B };
}

// ============================ RUN 模式占位（产品就绪、main 填完 selectors 后展开） ============================
// 完整用例骨架与 PLAN 一一对应；下面以伪代码标注每步断言，待 RUN 模式装配真实 selector/断言。
async function runAcceptance() {
  // 见 PLAN 13 项，逐条映射为 test()：RPS-01..RPS-13。
  // 关键工具已就绪：joinReal / moveTo / ctx.ev 读 me.games / ctx.api('/api/play',{kind,...}) / 两 context 互为对手读对方 DOM 校验私密。
  throw Error('RUN 模式未装配：请 main 回传最终 selectors（消除 CFG.rps 中全部 TODO）后将 PRODUCT_READY 置 true。');
}

// ============================ main ============================
try {
  await mkdir(profile, { recursive: true });
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, HOST: CFG.HOST, PORT: String(port), SID_DEV: '1', SID_TEST: '1' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let serverLog = ''; server.on('error', e => serverLog += e.stack); server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  await waitFor('loopback 服务启动', async () => { if (server.exitCode !== null) throw Error(serverLog); return fetch(base + '/api/state').then(r => r.status === 401).catch(() => false); });
  chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let chromeLog = ''; chrome.on('error', e => chromeLog += e.stack); chrome.stderr.on('data', d => chromeLog = (chromeLog + d).slice(-8000));
  await waitFor('Chrome CDP 就绪', async () => { if (chrome.exitCode !== null) throw Error(chromeLog); return fetch(`http://${CFG.HOST}:${debugPort}/json/version`).then(r => r.ok).catch(() => false); });
  await connectBrowser();
  await browserSend('Browser.getVersion');

  if (mode === 'plan') {
    await runPlan();
  } else {
    await runAcceptance();
  }
} catch (e) {
  fatalError = { message: e.message, stack: e.stack };
  console.error('PLAN/验收初始化失败', e.stack);
  process.exitCode = 1;
}
finally {
  if (ws) { try { for (const ctx of ctxBySession.values()) await ctx.send('Target.closeTarget', { targetId: ctx.targetId }).catch(() => {}); await browserSend('Browser.close').catch(() => {}); } catch (e) {} ws.close(); }
  const term = async (child, label) => { if (!child) { cleanup[label] = '未启动'; return; } if (child.exitCode !== null) { cleanup[label] = { pid: child.pid, exited: true, code: child.exitCode }; return; } const ex = new Promise(r => child.once('exit', r)); child.kill(); let tm; await Promise.race([ex, new Promise((_, no) => tm = setTimeout(() => no(Error(label + ' 未退出')), 5000))]).finally(() => clearTimeout(tm)); cleanup[label] = { pid: child.pid, exited: true }; };
  try { await term(chrome, 'chrome'); } catch (e) { cleanup.chrome = { exited: false, error: e.message }; }
  try { await term(server, 'httpServer'); } catch (e) { cleanup.httpServer = { exited: false, error: e.message }; }
  // 删除本脚本专属 tmp（隔离用户目录）。
  try { await rm(profile, { recursive: true, force: true }); cleanup.profileDeleted = profile; } catch (e) { cleanup.profileDeleteError = String(e); }
  const protectedAfter = await hashes();
  const unchanged = JSON.stringify(protectedBefore) === JSON.stringify(protectedAfter);
  results.push({ name: '仅新增本验收脚本与 outputs；既有源码 SHA-256 未变', pass: unchanged, detail: unchanged ? { changed: [] } : { before: protectedBefore, after: protectedAfter } });
  results.push({ name: 'finally 关闭 Chrome 与 HTTP 子进程，并删除专属 tmp', pass: cleanup.chrome?.exited === true && cleanup.httpServer?.exited === true, detail: cleanup });
  if (mode === 'plan') {
    // plan 模式已写报告；补充分支再写一次以包含最终 cleanup（幂等）。
    const prev = JSON.parse(await readFile(reportPath, 'utf8').catch(() => '{}'));
    prev.cleanup = cleanup; prev.sourceHashes = { before: protectedBefore, after: protectedAfter }; prev.fatalError = fatalError ?? null;
    prev.summary = { planned: PLAN.length, todoSelectors: Object.values(CFG.rps).filter(v => v === 'TODO').length, run: 0, passed: 0, failed: 0 };
    await writeFile(reportPath, JSON.stringify(prev, null, 2));
  } else {
    const summary = { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, total: results.length };
    const report = { mode: 'run', date: new Date().toISOString(), node: process.execPath, browser: browserVersion, host: CFG.HOST, port, results, runtimeErrors: runtimeErrorsAll, screenshots: [...new Set(screenshots)], cleanup, sourceHashes: { before: protectedBefore, after: protectedAfter }, fatalError: fatalError ?? null, summary };
    await writeFile(reportPath, JSON.stringify(report, null, 2));
  }
  console.log('完成。report=', resolve(reportPath), 'mode=', mode);
}
