'use strict';
// server 路由：玩法上行——/api/action、/api/skill、/api/interact、/api/play、/api/attack、/api/floor-change。
const { send, readBody } = require('../http-util.js');
const { actingSession, currentPlayer } = require('../auth.js');

async function handle(ctx) {
  const { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream } = ctx;
  if (pathname === '/api/action' && req.method === 'POST') {
    const body = await readBody(req);
    const player = currentPlayer(req, url);
    if (!player) return send(res, 401, { error: 'no identity' });
    const result = ROOM.performAction(player.id, body.kind);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/skill' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.useSkill(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/interact' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.interact(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/play' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.play(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/attack' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.attack(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/floor-change' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.floorChange(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  // 需求①：独立小房间的进入 / 离开（服务端权威；落点与位置还原都在 ROOM 内完成）。
  if (pathname === '/api/zone/enter' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.enterZone(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/zone/exit' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.exitZone(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  // 容器探索：开启即结算（空 / 直接积分 / 答题），答题经 take/answer 提交。
  if (pathname === '/api/search/start' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.searchStart(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/search/take' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.searchTake(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/search/answer' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.searchTake(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  // 小游戏（坦克 v1）：开始 / 出招 / 查状态 / 退出。
  if (pathname === '/api/minigame/start' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.startMinigame(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/minigame/act' && req.method === 'POST') {
    const body = await readBody(req);
    const result = ROOM.actMinigame(actingSession(req, url), body);
    return send(res, result.ok ? 200 : 400, result);
  }
  if (pathname === '/api/minigame/state' && req.method === 'GET') {
    return send(res, 200, ROOM.minigameState(actingSession(req, url)));
  }
  if (pathname === '/api/minigame/quit' && req.method === 'POST') {
    const result = ROOM.quitMinigame(actingSession(req, url));
    return send(res, result.ok ? 200 : 400, result);
  }
  return false;}

module.exports = { handle };
