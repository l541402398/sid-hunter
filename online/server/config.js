'use strict';
// server 子模块：进程级配置与开关（端口/静态目录/开发与 SSO 门禁）。
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0'; // Tests explicitly bind 127.0.0.1; live LAN default stays unchanged.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TICK_MS = 50;
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.ico', '.png', '.jpg', '.jpeg', '.webp']);
const DEV_ENABLED = process.env.SID_DEV === '1';
// dev 分支并入的 CAS 单点登录开关：默认正式模式要求登录；SID_TEST=1 保持自测的昵称加入；
// SID_SSO=0 供局域网试玩/回归显式关闭门禁（不改变任何玩法与权限判定以外的行为）。
const SSO_REQUIRED = process.env.SID_TEST !== '1' && process.env.SID_SSO !== '0';
const MANAGER_CODE = process.env.SID_MANAGER_CODE || '091256';
// 多日长局：活动会持续好几天，默认 7 天（SID_DURATION_MS 可覆盖；SID_TEST=1 时不覆盖共享的短时限）。
const DURATION_MS = Number(process.env.SID_DURATION_MS) > 0
  ? Number(process.env.SID_DURATION_MS)
  : (process.env.SID_TEST === '1' ? 0 : 7 * 24 * 60 * 60 * 1000);

module.exports = { PORT, HOST, PUBLIC_DIR, TICK_MS, ALLOWED_EXT, DEV_ENABLED, SSO_REQUIRED, MANAGER_CODE, DURATION_MS };
