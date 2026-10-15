'use strict';
// server 子模块：HTTP 基础设施——响应/请求体/Cookie/LAN 地址/定时器/静态托管/本机开发门禁。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { performance } = require('node:perf_hooks');
const { PORT, PUBLIC_DIR, ALLOWED_EXT, DEV_ENABLED } = require('./config.js');
// shared/ 源码树在 online/ 下（本文件在 online/server/，所以上一级）
const SHARED_DIR = path.join(__dirname, '..', 'shared');

function everyMs(callback, interval) {
  let target = performance.now() + interval;
  let timer;
  let cancelled = false;
  function schedule() {
    timer = setTimeout(tick, Math.max(0, target - performance.now()));
  }
  function tick() {
    if (cancelled) return;
    if (performance.now() < target) { schedule(); return; }
    callback();
    if (cancelled) return;
    target += interval;
    const now = performance.now();
    // 保持截止时间网格；停顿后跳过过期 tick，不突发补发。
    if (target <= now) target += (Math.floor((now - target) / interval) + 1) * interval;
    schedule();
  }
  schedule();
  return () => { cancelled = true; clearTimeout(timer); };
}

function trustedDevRequest(req, requireOrigin = false) {
  if (!DEV_ENABLED || !isLoopback(req)) return false;
  let host;
  try { host = new URL(`http://${req.headers.host || ''}`); } catch { return false; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || Number(host.port || 80) !== PORT) return false;
  const site = req.headers['sec-fetch-site'];
  if (site && !['same-origin', 'none'].includes(site)) return false;
  const origin = req.headers.origin;
  return requireOrigin ? origin === host.origin : !origin || origin === host.origin;
}

function lanAddresses() {
  const result = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      if (item.family === 'IPv4' && !item.internal) result.push(item.address);
    }
  }
  return result;
}

function send(res, code, body, extra) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extra || {}) });
  res.end(text);
}

function parseCookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > 1 << 15) { reject(new Error('payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function isLoopbackAddress(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}
function isLoopback(req) {
  return isLoopbackAddress(req.socket.remoteAddress || '');
}

function staticServe(req, res, pathname) {
  // Only public/ is hosted, plus read-only access to the shared/ source tree (world/scene 子模块)：
  // 让客户端与服务端字面加载同一份地图/几何真源。其余路径不可达。
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  if (relative.includes('..') || path.isAbsolute(relative)) return send(res, 403, { error: 'forbidden' });
  const isShared = relative === 'shared' || relative.startsWith('shared/');
  const base = isShared ? SHARED_DIR : PUBLIC_DIR;
  const target = path.join(base, isShared ? relative.slice('shared/'.length) : relative);
  if (!target.startsWith(base)) return send(res, 403, { error: 'forbidden' });
  if (!ALLOWED_EXT.has(path.extname(target).toLowerCase())) return send(res, 404, { error: 'not found' });
  fs.readFile(target, (error, data) => {
    if (error) return send(res, 404, { error: 'not found' });
    const type = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[path.extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function managerSessionOf(req) {
  return parseCookies(req.headers.cookie).sid_manager || null;
}
function managerReply(res, result) {
  if (result.cookie) res.setHeader('Set-Cookie', result.cookie);
  return send(res, result.status, result.body);
}
function isJsonRequest(req) {
  return (req.headers['content-type'] || '').split(';')[0].trim() === 'application/json';
}

module.exports = {
  everyMs, trustedDevRequest, lanAddresses, send, parseCookies, readBody,
  isLoopbackAddress, isLoopback, staticServe, managerSessionOf, managerReply, isJsonRequest
};
