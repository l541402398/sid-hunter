'use strict';
// server 子模块：会话凭证解析（Cookie/Header/Query 三通道）、CAS 身份绑定与 /api/auth/* 路由。
const { randomBytes } = require('crypto');
const sso = require('../sso.js');
const { SSO_REQUIRED } = require('./config.js');
const { send, parseCookies, readBody } = require('./http-util.js');

function sessionOf(req, url) {
  return parseCookies(req.headers.cookie).sid_session || req.headers['x-sid-session'] || (url && url.searchParams.get('sid_token')) || null;
}
function setSessionCookie(res, sid) {
  // HttpOnly: the page script never reads the credential, so identity cannot be claimed
  // by guessing a nickname. SameSite=Lax keeps it working over plain LAN HTTP.
  res.setHeader('Set-Cookie', `sid_session=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 12}`);
}
function setUserCookie(res, token) {
  res.setHeader('Set-Cookie', `sid_user=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${sso.tokenExpire()}`);
}
function clearAuthCookies(res) {
  res.setHeader('Set-Cookie', [
    'sid_user=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    'sid_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  ]);
}
function newSid() { return randomBytes(24).toString('base64url').slice(0, 32); }
function userTokenOf(req, url) {
  return req.headers['user-token'] || parseCookies(req.headers.cookie).sid_user || (url && url.searchParams.get('user_token')) || '';
}
// ROOM 由入口在 createRoom() 后绑定（原实现里它是 server.js 的模块级常量）。
let ROOM = null;
function bindRoom(room) { ROOM = room; return room; }
function currentPlayer(req, url) {
  const player = ROOM.playerBySession(sessionOf(req, url));
  if (!player) return null;
  if (!SSO_REQUIRED) return player;
  const user = req.ssoUser;
  if (!user || player.empNo !== user.emp_no) return null;
  return player;
}
// 技能/互动/攻击/换层沿用 room.js 自身的授权文案：拿不到 CAS 绑定的身份时，
// 关闭 CAS 的模式把原始会话凭证交给 room 判定（得到 400「身份无效」），CAS 模式下门禁已先行 401。
function actingSession(req, url) {
  const player = currentPlayer(req, url);
  if (player) return player.sessionId;
  if (SSO_REQUIRED) return null;
  return sessionOf(req, url);
}

// 正式服务的游戏接口必须带 CAS 会话；例外：auth/manager/dev/host/test。
const SSO_EXEMPT = /^\/api\/(auth|manager|dev|host|test)(\/|$)/;

// 返回 true 表示已应答（401 未登录）；false 表示放行。
async function requireSso({ req, res, url, pathname }) {
  if (!pathname.startsWith('/api/') || SSO_EXEMPT.test(pathname) || !SSO_REQUIRED) return false;
  const user = await sso.getProfile(userTokenOf(req, url));
  if (!user) { send(res, 401, { error: '未登录或会话已过期', auth: false }); return true; }
  req.ssoUser = user;
  return false;
}

// 路由模块约定：返回 false 表示未处理，其它返回值都表示已应答。
async function handle({ req, res, url, pathname }) {
  if (pathname === '/api/auth/config' && req.method === 'GET') {
    const required = SSO_REQUIRED;
    return send(res, 200, { required, loginUrl: required ? sso.loginUrl() : '', logoutUrl: required ? sso.logoutUrl() : '' });
  }
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readBody(req);
    if (!sso.serviceAllowed(body.service, req.headers.host)) return send(res, 400, { token: '', error: '回调地址不匹配' });
    const token = await sso.authenticate(body.ticket, body.service);
    if (!token) return send(res, 200, { token: '' });
    setUserCookie(res, token);
    return send(res, 200, { token, user: await sso.getProfile(token) });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    await sso.revoke(userTokenOf(req, url));
    clearAuthCookies(res);
    return send(res, 200, { ok: true });
  }
  // 正式服务的游戏接口必须带 CAS 会话。SID_TEST=1 保持原昵称加入，供既有自测使用。
  // 例外：auth（登录链自身）、manager（授权码入口）、dev/host（本机开发门禁，未启用时应答 403）、
  // test（仅 SID_TEST=1 存在，正式模式应回落到 404/405，而不是被 SSO 门禁改写成 401）。
  const SSO_EXEMPT = /^\/api\/(auth|manager|dev|host|test)(\/|$)/;
  return false;
}

async function handleMe({ req, res, pathname }) {
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    if (!req.ssoUser) return send(res, 401, { error: '未登录或会话已过期', auth: false });
    return send(res, 200, req.ssoUser);
  }
  return false;
}

module.exports = { bindRoom, sessionOf, setSessionCookie, setUserCookie, clearAuthCookies, newSid, userTokenOf,
  currentPlayer, actingSession, requireSso, handle, handleMe, SSO_EXEMPT };
