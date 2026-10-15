'use strict';
// server 子模块：路由装配。顺序与拆分前逐行一致：
// auth → SSO 门禁 → auth/me → manager → session → gameplay → dev/test → 静态 → 405。
// 各路由模块约定：handle(ctx) 返回 false 表示未处理；其它返回值都表示已应答。
const { staticServe, send } = require('./http-util.js');
const auth = require('./auth.js');
const managerRoutes = require('./routes/manager.js');
const sessionRoutes = require('./routes/session.js');
const gameplayRoutes = require('./routes/gameplay.js');
const devRoutes = require('./routes/dev.js');

function makeRouter({ ROOM, MANAGER, resetTokens, WORLD, openStream }) {
  return async function route(req, res, url) {
    const pathname = url.pathname;
    const ctx = { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream };
    const handled = async handler => (await handler(ctx)) !== false;
    if (await handled(auth.handle)) return;
    if (await handled(auth.requireSso)) return;
    if (await handled(auth.handleMe)) return;
    if (await handled(managerRoutes.handle)) return;
    if (await handled(sessionRoutes.handle)) return;
    if (await handled(gameplayRoutes.handle)) return;
    if (await handled(devRoutes.handle)) return;
    if (req.method === 'GET') return staticServe(req, res, pathname);
    return send(res, 405, { error: 'method not allowed' });
  };
}

module.exports = { makeRouter };
