'use strict';
// server 路由：本机开发/测试钩子——/api/dev/*、/api/host/*、/api/test/*。
// 门禁：trustedDevRequest（仅回环 + 同源）与 SID_TEST=1；生产反代另有 404 兜底。
const { randomBytes } = require('crypto');
const { send, readBody, isJsonRequest, trustedDevRequest } = require('../http-util.js');
const { currentPlayer } = require('../auth.js');

async function handle(ctx) {
  const { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream } = ctx;
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
    // 测试专用资源注入：猜拳要求双方各至少 1 筹码，但真实玩家从 0 筹码起步且获取途径是
    // 随机转盘/搜寻，端到端用例需要确定性前置条件。仅在 SID_TEST=1 下存在。
    if (action === 'resources') {
      const target = ROOM.find(Number(body.playerId));
      if (!target) return send(res, 404, { ok: false, error: 'player not found' });
      if (Number.isFinite(Number(body.chips))) target.exploration.chips = Math.max(0, Number(body.chips));
      if (Number.isFinite(Number(body.score))) target.score = Math.max(0, Number(body.score));
      // 第二轮：给指定玩家塞道具，便于端到端验证"使用/出售/购买"闭环。
      if (typeof body.item === 'string' && WORLD.LOOT.ITEMS[body.item]) {
        const n = Math.max(1, Math.min(20, Math.floor(Number(body.count) || 1)));
        target.exploration.items = target.exploration.items || {};
        target.exploration.items[body.item] = (target.exploration.items[body.item] || 0) + n;
      }
      return send(res, 200, { ok: true, playerId: target.id, chips: target.exploration.chips, score: target.score,
        items: target.exploration.items || {} });
    }
    if (action === 'sessions') {
      return send(res, 200, { ok: true, sessions: [...ROOM.room.sessions].map(([sessionId, playerId]) => ({ sessionId, playerId })) });
    }
    if (action === 'streams') {
      return send(res, 200, { ok: true, count: ROOM.streams.size, entries: [...ROOM.streams].map(([playerId, e]) => ({ playerId, lastAck: e.lastAck, ago: Date.now() - e.lastAck, destroyed: e.res.destroyed })) });
    }
    // 小游戏测试钩子：直接改开关 / 代指定玩家出招（仅 SID_TEST=1）。
    if (action === 'features') {
      if (!body || typeof body !== 'object') return send(res, 400, { ok: false, error: 'body required' });
      const { sanitizeFeatures } = require('../features.js');
      ROOM.room.features = sanitizeFeatures(body.features, ROOM.room.features);
      return send(res, 200, { ok: true, features: ROOM.room.features });
    }
    if (action === 'minigame-act') {
      const target = ROOM.find(Number(body.playerId));
      if (!target) return send(res, 404, { ok: false, error: 'player not found' });
      const sessionId = [...ROOM.room.sessions.entries()].find(([, pid]) => pid === target.id);
      if (!sessionId) return send(res, 404, { ok: false, error: 'session not found' });
      const result = ROOM.actMinigame(sessionId[0], { action: body.action });
      return send(res, 200, result);
    }    if (action === 'place') {
      const owner = body.playerId === undefined || body.playerId === null
        ? currentPlayer(req, url)
        : ROOM.find(Number(body.playerId));
      if (!owner) return send(res, 404, { error: 'player not found' });
      // floorId 可选：合并后的地图是七层，自测需要把角色放到指定楼层（仅 SID_TEST=1 暴露）。
      if (body.floorId !== undefined && WORLD.floorById(Number(body.floorId))) {
        owner.floorId = Number(body.floorId);
        owner.floorRevision += 1;
      }
      if (Number.isFinite(Number(body.x))) owner.x = Number(body.x);
      if (Number.isFinite(Number(body.y))) owner.y = Number(body.y);
      // zoneId 可选（仅 SID_TEST=1）：让自测能把角色直接放进某间独立房间或拉回走廊。
      // null / '' 表示楼层公共空间。
      if (body.zoneId !== undefined) {
        const z = body.zoneId === null || body.zoneId === '' ? null : WORLD.roomById(String(body.zoneId));
        if (body.zoneId !== null && body.zoneId !== '' && !z) return send(res, 400, { ok: false, error: 'room not found' });
        owner.zoneId = z ? z.id : null;
        owner.floorRevision += 1;
      }
      return send(res, 200, { ok: true, playerId: owner.id, x: owner.x, y: owner.y, floorId: owner.floorId, zoneId: owner.zoneId || null });
    }
    if (action === 'state') {
      return send(res, 200, {
        ok: true,
        // npc / hasSession 供自测断言 NPC 不可被会话认领；真实会话令牌不下发。
        players: ROOM.room.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, hp: p.hp, alive: p.alive, online: p.online, x: p.x, y: p.y, floorId: p.floorId, zoneId: p.zoneId || null, sid: p.sid.segments.join('-'), sidRevealed: p.sid.revealed.slice(), skills: p.skills, npc: !!p.npc, hasSession: !!p.sessionId, score: p.score,
          items: p.exploration.items || {},
          buffs: p.buffs || null,
          // 仅 SID_TEST=1：把私密探索状态一并暴露给自测，用于验证"搜打撤"记账确实落在服务端。
          exploration: { chips: p.exploration.chips, searched: p.exploration.searched.slice(), backpack: (p.exploration.backpack || []).slice(), clues: p.exploration.clues.length } })),
        finished: ROOM.room.finished,
        finishReason: ROOM.room.finishReason || null,
        ranking: ROOM.room.ranking,
        rules: { endRemainingPlayers: WORLD.RULES.endRemainingPlayers, timeLimitMs: WORLD.RULES.timeLimitMs, endsAt: ROOM.room.startedAt + WORLD.RULES.timeLimitMs },
        eliminateEvents: ROOM.room.eliminateEvents
      });
    }
    return send(res, 404, { error: 'unknown test action' });
  }
  return false;
}

module.exports = { handle };
