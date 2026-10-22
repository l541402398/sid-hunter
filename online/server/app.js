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

function makeRouter({ ROOM, MANAGER, resetTokens, WORLD, openStream, ACTIVITY = null, PROFILES = null }) {
  return async function route(req, res, url) {
    const pathname = url.pathname;
    const ctx = { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream, PROFILES };
    const handled = async handler => (await handler(ctx)) !== false;
    if (await handled(auth.handle)) return;
    if (await handled(auth.requireSso)) return;
    if (await handled(auth.handleMe)) return;
    if (await handled(managerRoutes.handle)) return;
    if (ACTIVITY) {
      // 所有玩法写入统一门禁；关闭期间只允许查看快照/ACK/认证，管理操作独立鉴权。
      const reason = ACTIVITY.guard();
      if (reason && pathname.startsWith('/api/') && req.method !== 'GET' && !['/api/ack','/api/input'].includes(pathname) && !pathname.startsWith('/api/test/')) {
        return send(res,403,{ok:false,error:reason,closed:true});
      }
      if (pathname.startsWith('/api/dev/') || pathname.startsWith('/api/host/')) return send(res,410,{ok:false,error:'请使用统一管理员面板 /manager'});
    }
    if (await handled(sessionRoutes.handle)) return;
    if (await handled(gameplayRoutes.handle)) return;
    if (await handled(devRoutes.handle)) return;
    if (req.method === 'GET') return staticServe(req, res, pathname);
    return send(res, 405, { error: 'method not allowed' });
  };
}

module.exports = { makeRouter };
