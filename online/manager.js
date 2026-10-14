'use strict';
// 公网管理控制台（/manager）的服务端逻辑：授权码登录、上局排名读取、一键开新局。
//
// 与 /api/dev 和 /api/host 的分工：那两个接口是本机开发用，依赖 SID_DEV=1 与回环地址，
// 线上被反向代理 404 掉。管理控制台必须在公网可用，因此走独立的授权码 + HttpOnly 会话
// Cookie + CSRF token 三层校验，不复用也不放宽既有的开发开关。
//
// Zero-dependency: only Node built-ins.
const { randomBytes, timingSafeEqual, createHash } = require('crypto');
const { RULES } = require('./shared/world.js');

const MANAGER_COOKIE = 'sid_manager';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 与 Cookie Max-Age 保持一致
const SWEEP_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_PENALTY_MS = 8 * 1000; // 超出失败上限后，每次额外失败追加的等待

const FINISH_REASON_TEXT = {
  timeUp: '时间到（2 小时）',
  badWiped: '坏人全灭',
  aliveFloor: '存活人数已淘汰至剩余 100 人',
  host: '主持人结束了游戏'
};

function finishReasonText(reason) {
  if (!reason) return '游戏已结束';
  return FINISH_REASON_TEXT[reason] || '游戏已结束';
}

// 定长比较：两侧先各自哈希到 32 字节再比较，避免长度不同直接抛错，也不泄露长度信息。
function safeEqual(a, b) {
  const pad = value => createHash('sha256').update(String(value == null ? '' : value), 'utf8').digest();
  return timingSafeEqual(pad(a), pad(b));
}

function clientIp(req) {
  const direct = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  // 只有本机反代才信任 X-Forwarded-For；其余情况用真实 socket 地址，避免伪造来源绕过限流。
  const isLoopback = direct === '127.0.0.1' || direct === '::1' || direct === '::ffff:127.0.0.1';
  return isLoopback && forwarded ? forwarded : (direct || 'unknown');
}

function createManager({ room, passcode, now = Date.now }) {
  const code = typeof passcode === 'string' && passcode.length ? passcode : '091256';
  const sessions = new Map(); // token -> { csrfToken, createdAt, lastSeenAt }
  const attempts = new Map(); // ip -> { failures, lastFailureAt, blockedUntil }

  function sweep() {
    const t = now();
    for (const [token, session] of sessions) {
      if (t - session.lastSeenAt > SESSION_TTL_MS) sessions.delete(token);
    }
    for (const [ip, record] of attempts) {
      if (t - record.lastFailureAt > LOGIN_WINDOW_MS) attempts.delete(ip);
    }
  }
  const sweeper = setInterval(sweep, SWEEP_MS);
  if (typeof sweeper.unref === 'function') sweeper.unref();

  // 登录前先看限流：失败次数超过上限后，每多失败一次多等一个惩罚窗口。
  function loginBackoffMs(ip) {
    const record = attempts.get(ip);
    if (!record || record.failures <= LOGIN_MAX_FAILURES) return 0;
    const extra = record.failures - LOGIN_MAX_FAILURES;
    return Math.max(0, record.lastFailureAt + extra * LOGIN_PENALTY_MS - now());
  }
  function noteFailure(ip) {
    const record = attempts.get(ip) || { failures: 0, lastFailureAt: 0, blockedUntil: 0 };
    record.failures += 1;
    record.lastFailureAt = now();
    attempts.set(ip, record);
  }

  function issueSession() {
    const token = randomBytes(24).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const t = now();
    sessions.set(token, { csrfToken, createdAt: t, lastSeenAt: t });
    return { token, csrfToken };
  }
  function readSession(token) {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (now() - session.lastSeenAt > SESSION_TTL_MS) { sessions.delete(token); return null; }
    session.lastSeenAt = now();
    return session;
  }
  // 授权码正确是唯一入口；登录成功后清掉该 IP 的失败计数。
  function login(req, body) {
    const ip = clientIp(req);
    const wait = loginBackoffMs(ip);
    if (wait > 0) return { status: 429, body: { ok: false, error: '尝试过于频繁，请稍后再试', retryAfterMs: wait } };
    const provided = body && typeof body.code === 'string' ? body.code.trim() : '';
    if (!provided || !safeEqual(provided, code)) {
      noteFailure(ip);
      return { status: 401, body: { ok: false, error: '授权码错误' } };
    }
    attempts.delete(ip);
    const session = issueSession();
    return {
      status: 200,
      body: { ok: true, csrfToken: session.csrfToken },
      cookie: `${MANAGER_COOKIE}=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
    };
  }
  function sessionFor(req, token) {
    const session = readSession(token);
    if (!session) return { status: 401, body: { ok: false, error: '管理会话已失效，请重新输入授权码' } };
    // 成功路径也必须带 status：调用方统一按 { status, body? } 处理，缺字段会写出非法状态码。
    return { status: 200, session };
  }
  // 会话探测固定返回 200：前端据此区分“未登录”和“接口不存在”，避免和反代 404 混淆。
  function sessionProbe(req, token) {
    const session = readSession(token);
    return { status: 200, body: { authed: !!session, csrfToken: session ? session.csrfToken : null } };
  }
  function state() {
    const last = room.lastResultSummary();
    return {
      status: 200,
      body: {
        ok: true,
        current: {
          finished: room.room.finished,
          finishReason: room.room.finishReason || null,
          aliveCount: room.room.players.filter(p => p.alive).length,
          playerCount: room.room.players.length,
          startedAt: room.room.startedAt,
          endsAt: room.room.startedAt + (room.rules && room.rules.timeLimitMs ? room.rules.timeLimitMs : RULES.timeLimitMs)
        },
        lastResult: last
          ? { ...last, finishReasonText: finishReasonText(last.finishReason), ranked: !!last.ranking }
          : null,
        teams: room.room.players.map(p => ({ id: p.id, name: p.name, alive: p.alive, score: p.score }))
      }
    };
  }
  // 管理端未结束也想留档：点开下一局时若本局已结束但还没归档（例如历史遗留状态），
  // lastResultSummary 会返回 null，此时重开只是清空，排名无从展示——所以只在已经结束时读快照。
  function reset(req, token, body) {
    const session = readSession(token);
    if (!session) return { status: 401, body: { ok: false, error: '管理会话已失效，请重新输入授权码' } };
    if (!safeEqual(body && body.csrfToken, session.csrfToken)) return { status: 403, body: { ok: false, error: '管理凭证无效' } };
    if (!body || body.confirm !== true) return { status: 400, body: { ok: false, error: '开新局需要二次确认' } };
    room.reset();
    const last = room.lastResultSummary();
    return {
      status: 200,
      body: {
        ok: true,
        reset: true,
        startedAt: room.room.startedAt,
        lastResult: last ? { ...last, finishReasonText: finishReasonText(last.finishReason), ranked: !!last.ranking } : null
      }
    };
  }
  function logout(token) {
    if (token) sessions.delete(token);
    return { status: 200, body: { ok: true }, cookie: `${MANAGER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` };
  }
  function close() { clearInterval(sweeper); }
  return { login, sessionProbe, sessionFor, state, reset, logout, close, code, cookieName: MANAGER_COOKIE };
}

module.exports = { createManager, MANAGER_COOKIE, finishReasonText, clientIp, safeEqual };
