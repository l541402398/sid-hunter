// 一次性同步/导入员工档案（工号 → 性别）到游戏库。
//
// 用法：
//   node online/profiles-sync.mjs                         # 调一次 /profilesAll（凭证见 PROFILE_*）
//   node online/profiles-sync.mjs --ticket=ST-...         # 用一次性 CAS 票据调一次
//   node online/profiles-sync.mjs --cookie='JSESSIONID=...' # 用浏览器会话 Cookie 调一次
//   node online/profiles-sync.mjs --file=profilesAll.json # 直接导入浏览器里保存的 JSON
//   cat profilesAll.json | node online/profiles-sync.mjs --file=-   # 从 stdin 导入
//
// 默认只在启动/执行时同步一次；需要定时刷新再设 PROFILE_SYNC_INTERVAL_MS。
import fs from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
function arg(name) {
  const inline = args.find(item => item.startsWith(name + '='));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const require = createRequire(import.meta.url);
// 复用 sso.js 的 .env 加载，保证 PROFILE_* 与 systemd/命令行配置一致。
require('./sso.js');
const { createStore } = require('./server/store.js');
const { createProfiles, extractProfiles } = require('./server/profiles.js');

const file = arg('--file');
const ticket = arg('--ticket');
const cookie = arg('--cookie');
const token = arg('--token');
const headers = arg('--headers');
const url = arg('--url');
if (url) process.env.PROFILE_API_URL = url;
if (ticket) process.env.PROFILE_API_TICKET = ticket;
if (cookie) process.env.PROFILE_API_COOKIE = cookie;
if (token) process.env.PROFILE_API_TOKEN = token;
if (headers) process.env.PROFILE_API_HEADERS = headers;

const store = createStore();
if (!store.enabled) {
  console.error(`游戏库不可用：${store.error || store.reason || '未知原因'}`);
  process.exit(1);
}

try {
  if (file) {
    const text = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
    let payload;
    try { payload = JSON.parse(text); }
    catch (error) { throw new Error(`JSON 解析失败：${error.message}`); }
    const employees = extractProfiles(payload);
    if (!employees.length) throw new Error('JSON 中没有识别到员工记录（检查字段名）');
    const saved = store.saveEmployees(employees);
    if (!saved) throw new Error('员工档案写入数据库失败');
    console.log(JSON.stringify({ source: file === '-' ? 'stdin' : file, saved }, null, 2));
  } else {
    const profiles = createProfiles({ store, enabled: true });
    const result = await profiles.sync();
    console.log(JSON.stringify({ result, status: profiles.status() }, null, 2));
    if (!result.ok) process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message || String(error));
  process.exitCode = 1;
} finally {
  store.close();
}
