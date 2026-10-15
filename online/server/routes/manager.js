'use strict';
// server 路由：管理控制台入口与 /api/manager/*（独立授权码，不走 CAS）。
const { send, readBody, staticServe, managerSessionOf, managerReply, isJsonRequest } = require('../http-util.js');

async function handle(ctx) {
  const { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream } = ctx;
  if (pathname === '/manager') {
    // 管理控制台入口：静态文件，但路径没有扩展名，静态服务只放行白名单后缀，所以单独路由。
    return staticServe(req, res, '/manager.html');
  }
  if (pathname.startsWith('/api/manager/')) {
    const action = pathname.slice('/api/manager/'.length);
    const token = managerSessionOf(req);
    if (action === 'login') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '管理操作仅允许JSON' });
      return managerReply(res, MANAGER.login(req, await readBody(req)));
    }
    if (action === 'session') {
      if (req.method !== 'GET') return send(res, 405, { ok: false, error: '管理操作仅允许GET' });
      // 固定 200：前端据此区分「未登录」与「接口不存在」。
      return managerReply(res, MANAGER.sessionProbe(req, token));
    }
    if (action === 'state') {
      if (req.method !== 'GET') return send(res, 405, { ok: false, error: '管理操作仅允许GET' });
      const gate = MANAGER.sessionFor(req, token);
      if (gate.status !== 200) return managerReply(res, gate);
      return managerReply(res, MANAGER.state());
    }
    if (action === 'reset') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '管理操作仅允许JSON' });
      return managerReply(res, MANAGER.reset(req, token, await readBody(req)));
    }
    if (action === 'logout') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      return managerReply(res, MANAGER.logout(token));
    }
    return send(res, 404, { ok: false, error: 'unknown manager action' });
  }
  return false;
}

module.exports = { handle };
