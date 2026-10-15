'use strict';
// 零依赖 LAN 试玩服务入口：只做装配（静态托管 + SSE 20Hz + POST 意图 + 房间 tick）。
// 业务实现：server/*（配置、HTTP 基础、CAS 会话、SSE、路由）与 room/*（权威房间状态）。
// Run: node /absolute/path/online/server.js   (uses built-in http/fs/os/crypto only)
const http = require('http');
const { createRoom, SKILL_CONFIG, WORLD } = require('./room.js');
const { createManager } = require('./manager.js');
const { PORT, HOST, TICK_MS, DEV_ENABLED, SSO_REQUIRED, MANAGER_CODE } = require('./server/config.js');
const { everyMs, lanAddresses, send } = require('./server/http-util.js');
const { makeSse } = require('./server/sse.js');
const { makeRouter } = require('./server/app.js');

const ROOM = createRoom();
require('./server/auth.js').bindRoom(ROOM);
const resetTokens = new Map(); // Scoped to an existing session, revoked together with the room.
const MANAGER = createManager({ room: ROOM, passcode: MANAGER_CODE });
const { openStream, startOfflineSweep } = makeSse(ROOM);
const route = makeRouter({ ROOM, MANAGER, resetTokens, WORLD, openStream });

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
  clearInterval(offlineTimer);
  for (const entry of ROOM.streams.values()) entry.close();
});
server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log(`S-ID 联机试玩服务已启动`);
  console.log(`本机访问: http://127.0.0.1:${PORT}`);
  console.log(`开发重置: ${DEV_ENABLED ? '启用（仅本机、已加入身份、同源Origin和CSRF）' : '关闭（需维护时以SID_DEV=1重启启用）'}；本机路径 http://127.0.0.1:${PORT}/`);
  console.log(`单点登录: ${SSO_REQUIRED ? '已启用，CAS 姓名直接进局；会话在本进程内存，重启后需重新登录' : '未启用（SID_TEST=1 或 SID_SSO=0），仍用昵称加入'}`);
  for (const address of lan) console.log(`局域网访问: http://${address}:${PORT}`);
  console.log(`技能次数恢复周期: ${SKILL_CONFIG.chargeIntervalMs / 1000}s（正式版改 room.js SKILL_CONFIG.chargeIntervalMs 为 1200000）`);
  if (!lan.length) console.log('未检测到局域网 IPv4 地址，同事可能无法通过局域网访问。');
});

module.exports = { server, ROOM, MANAGER, route, openStream, startOfflineSweep };
