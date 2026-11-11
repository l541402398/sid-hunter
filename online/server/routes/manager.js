'use strict';
// server 路由：管理控制台入口与 /api/manager/*（独立授权码，不走 CAS）。
const { send, readBody, staticServe, managerSessionOf, managerReply, isJsonRequest } = require('../http-util.js');
const { featureList, sanitizeFeatures } = require('../features.js');
const { buildScoreExport } = require('../score-export.js');
const { parseQuizFile, buildQuizWorkbook } = require('../quiz-excel.js');
const QUIZ = require('../../room/quiz.js');

async function handle(ctx) {
  const { req, res, url, pathname, ROOM, MANAGER, resetTokens, WORLD, openStream, STORE } = ctx;
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
    if (action === 'quiz') {
      if (req.method !== 'GET') return send(res, 405, { ok: false, error: '题库读取仅允许GET' });
      const gate = MANAGER.sessionFor(req, token);
      if (gate.status !== 200) return managerReply(res, gate);
      return managerReply(res, { status: 200, body: { ok: true, questions: QUIZ.getQuizBank(), summary: QUIZ.quizSummary() } });
    }
    if (action === 'quiz-template' || action === 'quiz-export') {
      if (req.method !== 'GET') return send(res, 405, { ok: false, error: '题库导出仅允许GET' });
      const gate = MANAGER.sessionFor(req, token);
      if (gate.status !== 200) return managerReply(res, gate);
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(res, 403, { ok: false, error: '不能跨站下载题库' });
      const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
      const isTemplate = action === 'quiz-template';
      const list = isTemplate ? QUIZ.INITIAL_QUIZ_BANK : QUIZ.getQuizBank();
      const file = buildQuizWorkbook(list, {
        fileName: isTemplate ? 'S-ID-quiz-template.xlsx' : `S-ID-quiz-bank-${today}.xlsx`,
        sheetName: 'Sheet1'
      });
      res.writeHead(200, {
        'Content-Type': file.mime,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Content-Length': file.buffer.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(file.buffer);
      return;
    }
    if (action === 'quiz-import') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '题库导入仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '题库导入仅允许JSON' });
      let body;
      try { body = await readBody(req, 4 * 1024 * 1024); }
      catch { return send(res, 413, { ok: false, error: '上传文件过大（上限 3MB）' }); }
      const mutation = MANAGER.mutationGate(req, token, body);
      if (mutation.status !== 200) return managerReply(res, mutation);
      const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : '';
      const mode = body.mode === 'replace' ? 'replace' : 'merge';
      let buffer;
      if (typeof body.contentBase64 === 'string' && body.contentBase64.trim()) {
        const cleanBase64 = body.contentBase64.replace(/^data:[^;]+;base64,/, '').trim();
        buffer = Buffer.from(cleanBase64, 'base64');
      } else if (typeof body.csvText === 'string' && body.csvText.trim()) {
        buffer = Buffer.from(body.csvText, 'utf8');
      } else {
        return send(res, 400, { ok: false, error: '请先选择需要导入的 .xlsx 或 .csv 题库文件' });
      }
      let parsed;
      try {
        parsed = parseQuizFile({ buffer, fileName });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message || '题库文件解析失败' });
      }
      const previous = QUIZ.getQuizBank();
      let result;
      try {
        result = QUIZ.importQuizQuestions(parsed, { mode });
      } catch (error) {
        return send(res, 400, { ok: false, error: error.message || '题库导入失败' });
      }
      if (STORE && STORE.enabled && !STORE.saveQuizQuestions(QUIZ.getQuizBank())) {
        QUIZ.setQuizBank(previous);
        return send(res, 503, { ok: false, error: '题库写入数据库失败，已回滚，请检查存储状态' });
      }
      const modeText = mode === 'replace'
        ? `全量覆盖导入成功：共载入 ${result.importedCount} 题`
        : `增量合并导入成功：本次解析 ${result.importedCount} 题（新增 ${result.added} 题，更新 ${result.updated} 题）`;
      return managerReply(res, {
        status: 200,
        body: {
          ok: true,
          ...result,
          questions: QUIZ.getQuizBank(),
          summary: QUIZ.quizSummary(),
          message: `${modeText}；当前题库共 ${result.totalCount} 题（启用 ${result.enabledCount} 题）。`
        }
      });
    }
    if (action === 'quiz-toggle') {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '管理操作仅允许JSON' });
      const body = await readBody(req);
      const mutation = MANAGER.mutationGate(req, token, body);
      if (mutation.status !== 200) return managerReply(res, mutation);
      const previous = QUIZ.getQuizBank();
      const updated = QUIZ.toggleQuestionStatus(body && body.id, typeof (body && body.enabled) === 'boolean' ? body.enabled : undefined);
      if (!updated) return send(res, 404, { ok: false, error: '未找到指定题目ID' });
      if (STORE && STORE.enabled && !STORE.saveQuizQuestions(QUIZ.getQuizBank())) {
        QUIZ.setQuizBank(previous);
        return send(res, 503, { ok: false, error: '题目状态保存失败，请检查存储' });
      }
      return managerReply(res, {
        status: 200,
        body: {
          ok: true,
          question: updated,
          questions: QUIZ.getQuizBank(),
          summary: QUIZ.quizSummary(),
          message: `题目 ${updated.id} 已设为「${updated.status}」`
        }
      });
    }
    if (action === 'config' || action === 'npc' || action === 'control') {
      if (req.method !== 'POST') return send(res,405,{ok:false,error:'管理操作仅允许POST'});
      if (!isJsonRequest(req)) return send(res,415,{ok:false,error:'管理操作仅允许JSON'});
      const body=await readBody(req);
      return managerReply(res,action==='config'?MANAGER.configure(req,token,body):action==='control'?MANAGER.control(req,token,body):MANAGER.npc(req,token,body));
    }
    // 实物奖品：GET 读库存 / 概率 / 中奖记录；POST 设置品类库存、各渠道概率与 J 有效触发上限。
    // 数值均为「待定」，默认空库存、概率 0（关闭）。库存不得低于已发出数量。
    if (action === 'prizes') {
      const gate = MANAGER.sessionFor(req, token);
      if (gate.status !== 200) return managerReply(res, gate);
      if (!ROOM.prizes) return send(res, 503, { ok: false, error: '奖品池未启用' });
      if (req.method === 'GET') return managerReply(res, { status: 200, body: { ok: true, prizes: ROOM.prizes.view() } });
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: '管理操作仅允许POST' });
      if (!isJsonRequest(req)) return send(res, 415, { ok: false, error: '管理操作仅允许JSON' });
      const body = await readBody(req);
      const mutation = MANAGER.mutationGate(req, token, body);
      if (mutation.status !== 200) return managerReply(res, mutation);
      const result = ROOM.prizes.configure({ items: body.items, chances: body.chances, hammerLimits: body.hammerLimits });
      return managerReply(res, { status: result.ok ? 200 : (/保存失败/.test(result.error || '') ? 503 : 400), body: result });
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
