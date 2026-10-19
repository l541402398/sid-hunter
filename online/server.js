'use strict';
// 零依赖 LAN 试玩服务入口：只做装配（静态托管 + SSE 20Hz + POST 意图 + 房间 tick）。
// 业务实现：server/*（配置、HTTP 基础、CAS 会话、SSE、路由）与 room/*（权威房间状态）。
// Run: node /absolute/path/online/server.js   (uses built-in http/fs/os/crypto only)
const http = require('http');
const { createRoom, SKILL_CONFIG, WORLD } = require('./room.js');
const { createManager } = require('./manager.js');
const { PORT, HOST, TICK_MS, DEV_ENABLED, SSO_REQUIRED, MANAGER_CODE, DURATION_MS } = require('./server/config.js');
const { everyMs, lanAddresses, send } = require('./server/http-util.js');
const { makeSse } = require('./server/sse.js');
const { makeRouter } = require('./server/app.js');
const { createStore } = require('./server/store.js');

// 持久化：结算 + 整局快照。测试模式（SID_TEST=1）默认关闭，保证自测互不污染。
// 必须在 createRoom 之前创建，因为启动时要用快照恢复玩家与会话。
const STORE = createStore();
// 多日长局：默认 7 天一场；若库里有整局快照，重启时原样恢复玩家与会话。
const restoredSnapshot = STORE.loadSnapshot();
const ROOM = createRoom({
  ...(restoredSnapshot ? { restore: restoredSnapshot } : {}),
  ...(DURATION_MS > 0 ? { rules: { timeLimitMs: DURATION_MS } } : {})
});
require('./server/auth.js').bindRoom(ROOM);
const restored = STORE.loadLastRound();
if (restored && !ROOM.room.lastResult) {
  ROOM.room.lastResult = {
    finishReason: restored.finishReason || '',
    finishedAt: restored.finishedAt,
    roster: restored.roster || [],
    ranking: restored.ranking || []
  };
}
let savedRoundId = null;
// 结算落库用 1 秒轮询（房间一结束就写），玩家进度快照用 60 秒，两者成本都很低。
const cancelPersist = STORE.enabled ? everyMs(() => {
  const room = ROOM.room;
  if (room.finished && room.lastResult && savedRoundId !== room.roundId) {
    const saved = STORE.saveRound({
      roundId: room.roundId, finishedAt: room.lastResult.finishedAt,
      finishReason: room.lastResult.finishReason,
      aliveCount: room.lastResult.roster.filter(r => r.alive).length,
      roster: room.lastResult.roster, ranking: room.lastResult.ranking
    });
    if (saved) savedRoundId = room.roundId;
    // 结算时顺带把最终进度也落一份，重启后仍能查到"这局谁有多少分/筹码"。
    STORE.savePlayers(room.roundId, room.players);
  }
}, 1000) : () => { };
const cancelSnapshot = STORE.enabled ? everyMs(() => {
  const room = ROOM.room;
  // 在局进度快照：进程崩掉时最多丢 60 秒；实时位置/指令仍只在内存。
  if (!room.finished && room.players.some(p => !p.npc)) STORE.savePlayers(room.roundId, room.players);
}, 60000) : () => { };
const resetTokens = new Map(); // Scoped to an existing session, revoked together with the room.
const MANAGER = createManager({ room: ROOM, passcode: MANAGER_CODE });
const { openStream, startOfflineSweep } = makeSse(ROOM);
const route = makeRouter({ ROOM, MANAGER, resetTokens, WORLD, openStream });

// 整局快照：每 5 秒落一次（玩家+会话），重启后原样恢复；房间被清空时顺手删掉快照。
const cancelSnapshotSave = STORE.enabled ? everyMs(() => {
  const room = ROOM.room;
  if (!room.players.length) { if (STORE.loadSnapshot()) STORE.clearSnapshot(); return; }
  STORE.saveSnapshot({ roundId: room.roundId, startedAt: room.startedAt, players: room.players, sessions: [...room.sessions], features: room.features });
}, 5000) : () => { };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  route(req, res, url).catch(error => {
    if (process.env.SID_TEST === '1') console.error('route error', error && error.stack || error);
    if (!res.headersSent) send(res, 500, { error: String(error && error.message || error) });
    else { try { res.end(); } catch { /* closed */ } }
  });
});
const offlineTimer = startOfflineSweep();
const cancelRoomTick = everyMs(() => ROOM.step(TICK_MS / 1000), TICK_MS);
server.on('close', () => {
  cancelRoomTick();
  cancelPersist();
  cancelSnapshot();
  clearInterval(offlineTimer);
  STORE.close();
  for (const entry of ROOM.streams.values()) entry.close();
});
server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log(`S-ID 联机试玩服务已启动`);
  console.log(`本机访问: http://127.0.0.1:${PORT}`);
  console.log(`开发重置: ${DEV_ENABLED ? '启用（仅本机、已加入身份、同源Origin和CSRF）' : '关闭（需维护时以SID_DEV=1重启启用）'}；本机路径 http://127.0.0.1:${PORT}/`);
  console.log(`单点登录: ${SSO_REQUIRED ? '已启用，CAS 姓名直接进局；会话在本进程内存，重启后需重新登录' : '未启用（SID_TEST=1 或 SID_SSO=0），仍用昵称加入'}`);
  console.log(`TMJ 碰撞: ${WORLD.TMJ && WORLD.TMJ.isEnabled() ? `ON（${WORLD.TMJ.count()} 层；F1 查看叠加层）` : 'OFF（旧家具矩形碰撞；F1 仍可对比 TMJ）'}`);
  for (const address of lan) console.log(`局域网访问: http://${address}:${PORT}`);
  console.log(`技能次数恢复周期: ${SKILL_CONFIG.chargeIntervalMs / 1000}s（正式版改 room.js SKILL_CONFIG.chargeIntervalMs 为 1200000）`);
  if (!lan.length) console.log('未检测到局域网 IPv4 地址，同事可能无法通过局域网访问。');
});

module.exports = { server, ROOM, MANAGER, route, openStream, startOfflineSweep };
