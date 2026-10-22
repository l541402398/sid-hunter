'use strict';
// CAS 单点登录。票据校验仍走公司 CAS；登录会话只放在本进程内存，不连接 Redis。
// 重启服务后会话清空，需要重新登录。SID_SSO_SEED 只给测试进程预置会话。
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

function loadDotenv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) continue;
    const key = text.slice(0, text.indexOf('=')).trim();
    let value = text.slice(text.indexOf('=') + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotenv();

const config = {
  TOKEN_EXPIRE: Number(process.env.TOKEN_EXPIRE || 604800),
  SSO_LOGIN_URL: process.env.SSO_LOGIN_URL || 'https://172.26.1.10/login?service={service}',
  SSO_VALIDATE_URL: process.env.SSO_VALIDATE_URL || 'http://cas.x/p3/serviceValidate?service={service}&ticket={ticket}'
};

const sessions = new Map();

function expireMs() {
  const seconds = Number(process.env.TOKEN_EXPIRE || config.TOKEN_EXPIRE || 604800);
  if (!Number.isFinite(seconds) || seconds < 0) return 604800 * 1000;
  return seconds * 1000;
}
function remember(token, user, exp = Date.now() + expireMs()) {
  sessions.set(token, {
    user: {
      emp_no: user.emp_no,
      name: user.name,
      email: user.email || null,
      // CAS 若直接下发性别则一并保留；没有时由员工档案库补全（见 server/auth.js）。
      gender: user.gender || null
    },
    exp
  });
  if (sessions.size <= 500) return;
  const now = Date.now();
  for (const [key, item] of sessions) {
    if (item.exp <= now) sessions.delete(key);
  }
}
function readSeed() {
  if (!process.env.SID_SSO_SEED) return;
  let list;
  try { list = JSON.parse(process.env.SID_SSO_SEED); } catch (error) {
    console.log(`[sso] 测试会话种子无效: ${error && error.message || error}`);
    return;
  }
  if (!Array.isArray(list)) return;
  for (const item of list) {
    if (!item || !item.token || !item.user || !item.user.emp_no) continue;
    remember(String(item.token), item.user);
  }
}
readSeed();

function decodeXml(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}
function tagText(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([^<]*)</(?:[\\w.-]+:)?${name}>`, 'i'));
    if (match && match[1].trim()) return decodeXml(match[1].trim());
  }
  return '';
}
function cleanEmpNo(value) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text || [...text].length > 64) return '';
  return text;
}
function parseCas(xml) {
  const source = String(xml || '');
  const start = source.search(/<(?:[\w.-]+:)?authenticationSuccess\b/);
  const end = source.search(/<\/(?:[\w.-]+:)?authenticationSuccess>/);
  if (start < 0 || end < start) return null;
  const block = source.slice(start, end);
  const empNo = cleanEmpNo(tagText(block, ['user']));
  if (!empNo) return null;
  const name = tagText(block, ['sn']) || empNo;
  const email = tagText(block, ['mail', 'email']) || null;
  const gender = tagText(block, ['gender', 'sex', '性别']) || null;
  return { empNo, name, email, gender };
}
function serviceAllowed(service, hostHeader) {
  if (!service || !hostHeader) return false;
  let url;
  try { url = new URL(service); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return url.host === hostHeader;
}
function loginUrl() { return config.SSO_LOGIN_URL; }
function logoutUrl() {
  const base = String(config.SSO_LOGIN_URL || '').split('?')[0].replace(/\/login\/?$/, '/logout');
  try {
    const url = new URL(base);
    return url.origin + url.pathname;
  } catch { return ''; }
}
function tokenExpire() { return Number(process.env.TOKEN_EXPIRE || config.TOKEN_EXPIRE || 604800); }

function createToken(empNo, name, email, gender) {
  const token = randomBytes(24).toString('base64url');
  remember(token, { emp_no: empNo, name, email: email || null, gender: gender || null });
  return token;
}
async function authenticate(ticket, service) {
  const cleanTicket = String(ticket || '').trim();
  if (!cleanTicket || cleanTicket.length > 512 || !service) return null;
  const url = config.SSO_VALIDATE_URL
    .replace('{service}', encodeURIComponent(service))
    .replace('{ticket}', encodeURIComponent(cleanTicket));
  let xml = '';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    xml = await res.text();
  } catch (error) {
    console.log(`[sso] serviceValidate 请求失败: ${error && error.message || error}`);
    return null;
  }
  const parsed = parseCas(xml);
  if (!parsed) {
    console.log('[sso] serviceValidate 未通过');
    return null;
  }
  const token = createToken(parsed.empNo, parsed.name, parsed.email, parsed.gender);
  console.log(`[sso] 登录成功 emp_no=${parsed.empNo} name=${parsed.name}`);
  return token;
}
function getProfile(token) {
  if (!token) return null;
  const hit = sessions.get(token);
  if (!hit) return null;
  if (hit.exp <= Date.now()) { sessions.delete(token); return null; }
  return { ...hit.user };
}
function revoke(token) {
  if (token) sessions.delete(token);
}

module.exports = {
  config, parseCas, serviceAllowed, loginUrl, logoutUrl, tokenExpire,
  authenticate, createToken, getProfile, revoke
};
