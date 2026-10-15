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
  return false;
}

module.exports = { handle };
