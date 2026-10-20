'use strict';
// server 路由：管理控制台入口与 /api/manager/*（独立授权码，不走 CAS）。
const { send, readBody, staticServe, managerSessionOf, managerReply, isJsonRequest } = require('../http-util.js');
const { featureList, sanitizeFeatures } = require('../features.js');
const { buildScoreExport } = require('../score-export.js');

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
    if (action === 'export-scores') {
      if (req.method !== 'GET') return send(res,405,{ok:false,error:'成绩导出仅允许GET'});
      const gate=MANAGER.sessionFor(req,token);
      if(gate.status!==200)return managerReply(res,gate);
      if(req.headers['sec-fetch-site']==='cross-site')return send(res,403,{ok:false,error:'不能跨站导出成绩'});
      const activity=MANAGER.state().body.activity;
      if(!activity)return send(res,503,{ok:false,error:'场次成绩服务未就绪'});
      let file;
      try{file=buildScoreExport(activity,url.searchParams.get('roundId'));}
      catch(error){return send(res,400,{ok:false,error:error.message});}
      res.writeHead(200,{'Content-Type':file.mime,'Content-Disposition':`attachment; filename="${file.fileName}"`,
        'Content-Length':file.buffer.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(file.buffer);return;
    }
    if (action === 'config' || action === 'npc' || action === 'control') {
      if (req.method !== 'POST') return send(res,405,{ok:false,error:'管理操作仅允许POST'});
      if (!isJsonRequest(req)) return send(res,415,{ok:false,error:'管理操作仅允许JSON'});
      const body=await readBody(req);
      return managerReply(res,action==='config'?MANAGER.configure(req,token,body):action==='control'?MANAGER.control(req,token,body):MANAGER.npc(req,token,body));
    }
    // 功能开关：GET 读当前配置，POST 覆盖（见 server/features.js）。
    if (action === 'features') {
      const gate = MANAGER.sessionFor(req, token);
      if (gate.status !== 200) return managerReply(res, gate);
      if (req.method === 'GET') return managerReply(res, { status: 200, body: { ok: true, features: featureList(ROOM.room.features) } });
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '管理操作仅允许JSON' });
      const body = await readBody(req);
      const mutation=MANAGER.mutationGate(req,token,body);
      if(mutation.status!==200)return managerReply(res,mutation);
      const previous = ROOM.room.features;
      ROOM.room.features = sanitizeFeatures(body && body.features, previous);
      if (!MANAGER.persist()) {
        ROOM.room.features = previous;
        return send(res,503,{ok:false,error:'小游戏配置保存失败，游戏已冻结，请检查存储'});
      }
      return managerReply(res, { status: 200, body: { ok: true, features: featureList(ROOM.room.features) } });
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
