'use strict';
// Zero-dependency LAN playtest server: static hosting + SSE (20Hz snapshots) + POST intents.
// Run: node /absolute/path/online/server.js   (uses built-in http/fs/os/crypto only)
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomBytes } = require('crypto');
const { createRoom, SKILL_CONFIG } = require('./room.js');
const sso = require('./sso.js');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0'; // Tests explicitly bind 127.0.0.1; live LAN default stays unchanged.
const PUBLIC_DIR = path.join(__dirname, 'public');
const TICK_MS = 50;
const ROOM = createRoom();
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.ico']);
const DEV_ENABLED = process.env.SID_DEV === '1';
const resetTokens = new Map(); // Scoped to an existing session, revoked together with the room.
function trustedDevRequest(req, requireOrigin = false) {
  if (!DEV_ENABLED || !isLoopback(req)) return false;
  let host;
  try { host = new URL(`http://${req.headers.host || ''}`); } catch { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || Number(host.port || 80) !== PORT) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return false;
  const origin = req.headers.origin;
  return requireOrigin ? origin === host.origin : !origin || origin === host.origin;
}

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address);
    }
  }
  return result;
}
function send(res, code, body, extra) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) });
  res.end(text);
}
function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}
// Credential resolution: the HttpOnly cookie is the primary channel. Some embedded /
// headless webviews drop it when the browser restarts, so the page may also replay the
// same session id as a header (kept in sessionStorage). Identity is never claimable by
// nickname, and the header carries exactly the same random credential as the cookie.
// EventSource cannot carry custom headers, so the SSE endpoint also accepts the same
// random credential as a query parameter. It is byte-identical to the cookie value and
// is never derived from a nickname.
function sessionOf(req, url) {
  return parseCookies(req.headers.cookie).sid_session || req.headers['x-sid-session'] || (url && url.searchParams.get('sid_token')) || null;
}
function setSessionCookie(res, sid) {
  // HttpOnly: the page script never reads the credential, so identity cannot be claimed
  // by guessing a nickname. SameSite=Lax keeps it working over plain LAN HTTP.
  res.setHeader('Set-Cookie', `sid_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`);
}
function setUserCookie(res, token) {
  res.setHeader('Set-Cookie', `sid_user=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sso.tokenExpire()}`);
}
function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    'sid_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'sid_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  ]);
}
function newSid() { return randomBytes(24).toString('base64url').slice(0, 32); }
function userTokenOf(req, url) {
  return req.headers['user-token'] || parseCookies(req.headers.cookie).sid_user || (url && url.searchParams.get('user_token')) || '';
}
function currentPlayer(req, url) {
  const player = ROOM.playerBySession(sessionOf(req, url));
  if (!player) return null;
  if (process.env.SID_TEST === '1') return player;
  const user = req.ssoUser;
  if (!user || player.empNo !== user.emp_no) return null;
  return player;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1 << 15) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}
function isLoopbackAddress(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function isLoopback(req) {
  return isLoopbackAddress(req.socket.remoteAddress || '');
}
function staticServe(req, res, pathname) {
  // Only public/ is hosted, plus read-only access to shared/world.js so the client and
  // the server literally load the same furniture layout. Nothing else is reachable.
  const isShared = pathname === '/shared/world.js';
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative.includes('..') || path.isAbsolute(relative)) return send(res, 403, { error: 'forbidden' });
  const base = isShared ? path.join(__dirname, 'shared') : PUBLIC_DIR;
  const target = path.join(base, isShared ? 'world.js' : relative);
  if (!target.startsWith(base)) return send(res, 403, { error: 'forbidden' });
  if (!ALLOWED_EXT.has(path.extname(target).toLowerCase())) return send(res, 404, { error: 'not found' });
  fs.readFile(target, (error, data) => {
    if (error) return send(res, 404, { error: 'not found' });
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ico': 'image/x-icon' }[path.extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}
// SSE: one stream per player. The first write carries pending offline events; later
// writes are 20Hz snapshots. Closing the stream is the offline signal.
function openStream(req, res, player) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 1200\n\n');
  // 20Hz snapshots, plus a cheap heartbeat every tick. The heartbeat is what makes a
  // dropped TCP connection visible: a write to a dead socket surfaces the failure, and
  // the sweep below is the deterministic fallback that marks the player offline.
  const write = payload => { res.write(`data: ${JSON.stringify(payload)}\n\n`); };
  try { write({ ...ROOM.publicSnapshot(player.id), me: ROOM.privateSnapshot(player.id).me }); } catch { }
  const entry = { res, lastAck: Date.now() };
  ROOM.streams.set(player.id, entry);
  const timer = setInterval(() => {
    try {
      if (res.writableEnded || res.destroyed) throw new Error('closed');
      write({ ...ROOM.publicSnapshot(player.id), me: ROOM.privateSnapshot(player.id).me });
      entry.lastAck = Date.now();
      res.write(': ping\n\n');
    } catch { close(); }
  }, 1000 / 20);
  function close() {
    clearInterval(timer);
    // A stale stream must not mark the newer connection offline.
    if (ROOM.streams.get(player.id) === entry) {
      ROOM.streams.delete(player.id);
      if (ROOM.find(player.id) === player) ROOM.setOffline(player.id);
    }
    try { res.end(); } catch { /* already closed */ }
  }
  req.on('close', close);
  req.on('error', close);
  res.on('close', close);
}
async function route(req, res, url) {
  const pathname = url.pathname;
  if (pathname === '/api/auth/config' && req.method === 'GET') {
    const required = process.env.SID_TEST !== '1';
    return send(res, 200, { required, loginUrl: required ? sso.loginUrl() : '', logoutUrl: required ? sso.logoutUrl() : '' });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!sso.serviceAllowed(body.service, req.headers.host)) return send(res, 400, { token: '', error: '回调地址不匹配' });
    const token = await sso.authenticate(body.ticket, body.service);
    if (!token) return send(res, 200, { token: '' });
    setUserCookie(res, token);
    return send(res, 200, { token, user: await sso.getProfile(token) });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    await sso.revoke(userTokenOf(req, url));
    clearAuthCookies(res);
    return send(res, 200, { ok: true });
  }
  // 正式服务的游戏接口必须带 CAS 会话。SID_TEST=1 保持原昵称加入，供既有自测使用。
  if (pathname.startsWith('/api/') && process.env.SID_TEST !== '1') {
    const user = await sso.getProfile(userTokenOf(req, url));
    if (!user) return send(res, 401, { error: '未登录或会话已过期', auth: false });
    req.ssoUser = user;
  }
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!req.ssoUser) return send(res, 401, { error: '未登录或会话已过期', auth: false });
    return send(res, 200, req.ssoUser);
  }
  if (pathname === '/api/stream') {
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    ROOM.prepareReconnect(player);
    player.online = true;
    player.lastSeen = ROOM.now();
    openStream(req, res, player);
    return;
  }
  if (pathname === '/api/join' && req.method === 'POST') {
    const body = await readBody(req);
    const oldSid = sessionOf(req);
    if (process.env.SID_TEST === '1') {
      const sid = ROOM.playerBySession(oldSid) ? oldSid : newSid();
      const result = ROOM.join(sid, body.nickname);
      if (result.error) return send(res, 409, { error: result.error });
      setSessionCookie(res, sid);
      return send(res, 200, { ok: true, playerId: result.player.id, name: result.player.name, revived: result.revived, sessionToken: sid, lan: lanAddresses(), port: PORT });
    }
    const user = req.ssoUser;
    const bound = ROOM.playerByEmpNo(user.emp_no);
    const sid = bound && oldSid && bound.sessionId === oldSid ? oldSid : newSid();
    const result = ROOM.join(sid, null, { empNo: user.emp_no, name: user.name || user.emp_no });
    if (result.error) return send(res, 409, { error: result.error });
    setSessionCookie(res, sid);
    return send(res, 200, { ok: true, playerId: result.player.id, name: result.player.name, revived: result.revived, sessionToken: sid, lan: lanAddresses(), port: PORT });
  }
  if (pathname === '/api/input' && req.method === 'POST') {
    const body = await readBody(req);
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    ROOM.setIntent(player.id, body);
    return send(res, 200, { ok: true });
  }
  // 肢体互动（跳跃 / 挥锤）：只提交 kind，命中、击晕、冷却全部由服务端判定。
  // 刻意不做 commandId 去重：/api/skill 需要它是因为技能会消耗次数（重放会导致重复扣次），
  // 而本通道不消耗任何资源，写入的全是绝对时间戳，重复请求被冷却 / 腾空检查挡成空操作。
  if (pathname === '/api/action' && req.method === 'POST') {
    const body = await readBody(req);
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    const result = ROOM.performAction(player.id, body.kind);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/skill' && req.method === 'POST') {
    const body = await readBody(req);
    const actor = currentPlayer(req, url);
    if (!actor) return send(res, 401, { error: 'no identity' });
    const result = ROOM.useSkill(actor.sessionId, body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/ack' && req.method === 'POST') {
    const body = await readBody(req);
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    const result = ROOM.ack(player.id, body.eventIds, body.interaction);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/state' && req.method === 'GET') {
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    return send(res, 200, { ...ROOM.publicSnapshot(player.id), me: ROOM.privateSnapshot(player.id).me });
  }
  if (pathname === '/api/dev/capabilities') {
    if (req.method !== 'GET') return send(res, 405, { canReset: false });
    if (!trustedDevRequest(req)) return send(res, 403, { canReset: false });
    const player = currentPlayer(req, url);
    const sid = player && player.sessionId;
    if (!sid) return send(res, 401, { canReset: false });
    if (!resetTokens.has(sid)) resetTokens.set(sid, randomBytes(32).toString('base64url'));
    return send(res, 200, { canReset: true, csrfToken: resetTokens.get(sid) });
  }
  if (pathname.startsWith('/api/host/')) {
    const action = pathname.slice('/api/host/'.length);
    if (!['reset', 'finish'].includes(action)) return send(res, 404, { error: 'unknown host action' });
    // Both state-changing management actions share the same real-socket authorization.
    // No legacy fallback or simulated source header can bypass this gate.
    if (req.method !== 'POST') return send(res, 405, { error: '管理操作仅允许POST' });
    if (!trustedDevRequest(req, true)) return send(res, 403, { error: '开发管理未启用或来源无权' });
    if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') return send(res, 415, { error: '管理操作仅允许JSON' });
    const hostPlayer = currentPlayer(req, url);
    const sid = hostPlayer && hostPlayer.sessionId;
    if (!sid) return send(res, 401, { error: '身份凭证已失效' });
    const body = await readBody(req);
    if (!resetTokens.has(sid) || body.csrfToken !== resetTokens.get(sid)) return send(res, 403, { error: '管理凭证无效' });
    if (body.confirm !== true) return send(res, 400, { error: '管理操作需二次确认' });
    if (action === 'finish') {
      ROOM.finish();
      return send(res, 200, { ok: true, finished: true });
    }
    // Notify before revocation/close so every active client can stop EventSource retries.
    for (const entry of ROOM.streams.values()) {
      try { entry.res.write('event: reset\ndata: {"type":"reset"}\n\n'); } catch { /* disconnected client */ }
    }
    resetTokens.clear();
    ROOM.reset();
    ROOM.room.logs = []; // Reset notification is private transport control, not a new public log.
    res.setHeader('Set-Cookie', 'sid_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    return send(res, 200, { ok: true, reset: true });
  }
  // 开发用 NPC：门禁与 /api/host/* 完全一致（trustedDevRequest + JSON + 已加入身份 + CSRF）。
  // 不加二次确认——它是新增而非清空，开发期反复加 NPC 是高频动作。删除不做，重置即清空。
  if (pathname === '/api/dev/npc') {
    if (req.method !== 'POST') return send(res, 405, { error: '管理操作仅允许POST' });
    if (!trustedDevRequest(req, true)) return send(res, 403, { error: '开发管理未启用或来源无权' });
    if ((req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json') return send(res, 415, { error: '管理操作仅允许JSON' });
    const me = currentPlayer(req, url);
    const sid = me && me.sessionId;
    if (!me) return send(res, 401, { error: '身份凭证已失效' });
    const body = await readBody(req);
    if (!resetTokens.has(sid) || body.csrfToken !== resetTokens.get(sid)) return send(res, 403, { error: '管理凭证无效' });
    return send(res, 200, { ok: true, npcs: ROOM.spawnNpc(body.count, me) });
  }
  if (process.env.SID_TEST === '1' && pathname.startsWith('/api/test/')) {
    const action = pathname.replace('/api/test/', '');
    const body = req.method === 'POST' ? await readBody(req) : {};
    if (action === 'advance') { ROOM.room.clockOffset += Number(body.ms) || 0; return send(res, 200, { ok: true, offset: ROOM.room.clockOffset }); }
    if (action === 'sessions') {
      return send(res, 200, { ok: true, sessions: [...ROOM.room.sessions].map(([sessionId, playerId]) => ({ sessionId, playerId })) });
    }
    if (action === 'streams') {
      return send(res, 200, { ok: true, count: ROOM.streams.size, entries: [...ROOM.streams].map(([playerId, e]) => ({ playerId, lastAck: e.lastAck, ago: Date.now() - e.lastAck, destroyed: e.res.destroyed })) });
    }
    if (action === 'place') {
      const owner = body.playerId === undefined || body.playerId === null
        ? currentPlayer(req, url)
        : ROOM.find(Number(body.playerId));
      if (!owner) return send(res, 404, { error: 'player not found' });
      if (Number.isFinite(Number(body.x))) owner.x = Number(body.x);
      if (Number.isFinite(Number(body.y))) owner.y = Number(body.y);
      return send(res, 200, { ok: true, playerId: owner.id, x: owner.x, y: owner.y });
    }
    if (action === 'state') {
      return send(res, 200, {
        ok: true,
        // npc / hasSession 供自测断言 NPC 不可被会话认领；真实会话令牌不下发。
        players: ROOM.room.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, hp: p.hp, alive: p.alive, online: p.online, x: p.x, y: p.y, sid: p.sid.segments.join('-'), sidRevealed: p.sid.revealed.slice(), skills: p.skills, npc: !!p.npc, hasSession: !!p.sessionId })),
        finished: ROOM.room.finished,
        eliminateEvents: ROOM.room.eliminateEvents
      });
    }
    return send(res, 404, { error: 'unknown test action' });
  }
  if (req.method === 'GET') return staticServe(req, res, pathname);
  return send(res, 405, { error: 'method not allowed' });
}
// Deterministic offline detection: a stream whose last successful write is older than
// the threshold is considered dead even if the socket never reported an error.
setInterval(() => {
  const now = Date.now();
  for (const [playerId, entry] of ROOM.streams) {
    if (now - entry.lastAck > 3000) {
      try { entry.res.end(); } catch { /* already closed */ }
      ROOM.streams.delete(playerId);
      ROOM.setOffline(playerId);
    }
  }
}, 1000);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  route(req, res, url).catch(error => {
    if (process.env.SID_TEST === '1') console.error('route error', error && error.stack || error);
    if (!res.headersSent) send(res, 500, { error: String(error && error.message || error) });
    else { try { res.end(); } catch { /* closed */ } }
  });
});
setInterval(() => ROOM.step(TICK_MS / 1000), TICK_MS);
server.listen(PORT, HOST, () => {
  const lan = lanAddresses();
  console.log(`S-ID 联机试玩服务已启动`);
  console.log(`本机访问: http://127.0.0.1:${PORT}`);
  console.log(`开发重置: ${DEV_ENABLED ? '启用（仅本机、已加入身份、同源Origin和CSRF）' : '关闭（需维护时以SID_DEV=1重启启用）'}；本机路径 http://127.0.0.1:${PORT}/`);
  console.log(`单点登录: ${process.env.SID_TEST === '1' ? '测试模式关闭，仍用昵称加入' : '已启用，CAS 姓名直接进局；会话在本进程内存，重启后需重新登录'}`);
  for (const address of lan) console.log(`局域网访问: http://${address}:${PORT}`);
  console.log(`技能次数恢复周期: ${SKILL_CONFIG.chargeIntervalMs / 1000}s（正式版改 room.js SKILL_CONFIG.chargeIntervalMs 为 1200000）`);
  if (!lan.length) console.log('未检测到局域网 IPv4 地址，同事可能无法通过局域网访问。');
});
