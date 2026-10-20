'use strict';
// server 子模块：进程级配置与开关（端口/静态目录/开发与 SSO 门禁）。
const path = require('path');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0'; // Tests explicitly bind 127.0.0.1; live LAN default stays unchanged.
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// TMJ 地图源目录（仓库根 tiled/）：只读托管给客户端，供 F1 调试层和 TMJ 运行模式加载。
const TILED_DIR = path.join(__dirname, '..', '..', 'tiled');
const TICK_MS = 50;
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.ico', '.png', '.jpg', '.jpeg', '.webp', '.tmj', '.tsj', '.json']);
const DEV_ENABLED = process.env.SID_DEV === '1';
// dev 分支并入的 CAS 单点登录开关：默认正式模式要求登录；SID_TEST=1 保持自测的昵称加入；
// SID_SSO=0 供局域网试玩/回归显式关闭门禁（不改变任何玩法与权限判定以外的行为）。
const SSO_REQUIRED = process.env.SID_TEST !== '1' && process.env.SID_SSO !== '0';
const MANAGER_CODE = process.env.SID_MANAGER_CODE || '091256';
// 游戏时段与恢复周期统一由管理员配置，不再读取 SID_DURATION_MS。

module.exports = { PORT, HOST, PUBLIC_DIR, TILED_DIR, TICK_MS, ALLOWED_EXT, DEV_ENABLED, SSO_REQUIRED, MANAGER_CODE };

