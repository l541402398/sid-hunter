'use strict';
// server 路由：会话与快照——/api/stream、/api/join、/api/input、/api/ack、/api/state。
const { send, readBody, lanAddresses } = require('../http-util.js');
const { newSid, sessionOf, setSessionCookie, currentPlayer } = require('../auth.js');
const { PORT, SSO_REQUIRED } = require('../config.js');
const { randomBytes } = require('node:crypto');
function guestKey(req, res) {
  const token=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sid_participant='))?.slice(16);
  const key=/^[a-f0-9]{48}$/.test(token||'')?token:randomBytes(24).toString('hex');
  const existing=res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie',[...(Array.isArray(existing)?existing:existing?[existing]:[]),`sid_participant=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`]);
  return key;
}

async function handle(ctx) {
  const { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream, PROFILES } = ctx;
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
    if (!SSO_REQUIRED) {
      const sid = ROOM.playerBySession(oldSid) ? oldSid : newSid();
      const result = ROOM.join(sid, body.nickname);
      if (result.error) return send(res, 409, { error: result.error });
      setSessionCookie(res, sid);
      result.player.participantKey = result.player.participantKey || guestKey(req,res);
      return send(res, 200, { ok: true, playerId: result.player.id, name: result.player.name, revived: result.revived, sessionToken: sid, lan: lanAddresses(), port: PORT });
    }
    const user = req.ssoUser;
    // 组织信息同样来自员工档案库：合约区（dept）与交付组（deliveryGroup）在目标档案里公开显示。
    const employee = PROFILES ? PROFILES.employeeOf(user.emp_no) : null;
    const gender = (employee && employee.gender) || user.gender || null;
    const dept = (employee && employee.department) || null;
    const deliveryGroup = (employee && employee.deliveryGroup) || null;
    const bound = ROOM.playerByEmpNo(user.emp_no);
    const sid = bound && oldSid && bound.sessionId === oldSid ? oldSid : newSid();
    const result = ROOM.join(sid, null, { empNo: user.emp_no, name: user.name || user.emp_no, gender, dept, deliveryGroup });
    if (result.error) return send(res, 409, { error: result.error });
    setSessionCookie(res, sid);
    return send(res, 200, { ok: true, playerId: result.player.id, name: result.player.name, revived: result.revived, sessionToken: sid, roundId: ROOM.room.roundId, lan: lanAddresses(), port: PORT });
  }
  if (pathname === '/api/input' && req.method === 'POST') {
    const body = await readBody(req);
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    if (ROOM.setIntent(player.id, body) === false) return send(res, 400, { ok: false, error: '对局或楼层版本不一致，请重新同步' });
    return send(res, 200, { ok: true });
  }
  // 肢体互动（跳跃 / 挥锤）：只提交 kind，命中、击晕、冷却全部由服务端判定。
  // 刻意不做 commandId 去重：/api/skill 需要它是因为技能会消耗次数（重放会导致重复扣次），
  // 而本通道不消耗任何资源，写入的全是绝对时间戳，重复请求被冷却 / 腾空检查挡成空操作。
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
  return false;
}

module.exports = { handle };
