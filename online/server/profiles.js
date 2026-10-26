'use strict';
// 员工档案同步：调用 profile 服务把「工号 → 姓名/性别」写进游戏库，供 CAS 登录后分配男女形象。
//
// 上游 http://profile.app.x/profiles 是 HTML 页面；真正的员工 JSON 列表是
// http://profile.app.x/profilesAll（需要 CAS 会话）。未登录请求会 302 到统一登录页。
// 因此服务端必须拿到一个可用凭证，按优先级从环境变量读取：
//   PROFILE_API_TICKET  一次性 CAS 票据，拼成 /profiles?ticket=ST-...（配合只同步一次）
//   PROFILE_API_TOKEN   以 token 头（公司 CAS 约定）和 Authorization: Bearer 同时发送
//   PROFILE_API_COOKIE  以 Cookie 头发送（例如已登录会话的 golo-token）
//   PROFILE_API_HEADERS 额外请求头 JSON（最灵活，适合网关注入的固定头）
// 没有凭证时同步会失败并打印一次原因，但不会阻塞游戏启动；形象退回随机分配。
// 默认 PROFILE_SYNC_INTERVAL_MS=0：只在启动时同步一次，不反复请求。
//
// 响应结构兼容常见包装（数组、{data:[...]}、{data:{list:[...]}}、{records:[...]} 等），
// 字段名兼容中英文，性别值兼容 男/女、M/F、male/female、1/2。
const DEFAULT_URL = 'http://profile.app.x/profilesAll';
const DEFAULT_INTERVAL_MS = 0;
const DEFAULT_TIMEOUT_MS = 30 * 1000;

const { normalizeGender } = require('../shared/gender.js');

const EMP_KEYS = [
  'empNo', 'emp_no', 'empno', 'empNumber', 'emp_number', 'employeeNo', 'employee_no',
  'employeeId', 'employee_id', 'staffNo', 'staff_no', 'jobNumber', 'job_number',
  'workNo', 'work_no', 'no', '工号', '员工工号'
];
const NAME_KEYS = [
  'name', 'empName', 'emp_name', 'employeeName', 'employee_name', 'fullName', 'full_name',
  'displayName', 'display_name', 'realName', 'real_name', 'sn', '姓名', '员工姓名', '名字'
];
const GENDER_KEYS = [
  'gender', 'genderName', 'gender_name', 'sex', 'sexName', 'sex_name', '性别'
];
const EMAIL_KEYS = ['email', 'mail', 'emailAddress', 'email_address', '邮箱', '邮箱地址'];
const DEPARTMENT_KEYS = [
  'department', 'dept', 'deptName', 'dept_name', 'departmentName', 'department_name',
  'orgName', 'org_name', 'organization', '部门', '所属部门', '合约区'
];
const DELIVERY_GROUP_KEYS = [
  'deliveryGroup', 'delivery_group', 'deliveryTeam', 'delivery_team',
  'groupName', 'group_name', 'teamName', 'team_name', '交付组', '交付组名称', '所属交付组'
];
const TITLE_KEYS = ['title', 'jobTitle', 'job_title', 'position', 'positionName', 'position_name', '职位', '岗位'];
const NESTED_KEYS = ['employee', 'user', 'profile', 'staff', 'person', 'data'];

function cleanText(value, max = 256) {
  if (value === undefined || value === null) return '';
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return [...text].slice(0, max).join('');
}

function sourcesOf(item) {
  const list = [item];
  for (const key of NESTED_KEYS) {
    const value = item[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) list.push(value);
  }
  return list;
}

function pickField(item, keys) {
  if (!item || typeof item !== 'object') return undefined;
  const wanted = new Set(keys.map(key => key.toLowerCase()));
  for (const source of sourcesOf(item)) {
    for (const [key, value] of Object.entries(source)) {
      if (!wanted.has(key.toLowerCase())) continue;
      if (value !== undefined && value !== null && value !== '') return value;
    }
  }
  return undefined;
}

function normalizeProfile(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const empNo = cleanText(pickField(item, EMP_KEYS), 64);
  if (!empNo) return null;
  return {
    empNo,
    name: cleanText(pickField(item, NAME_KEYS), 128) || empNo,
    gender: normalizeGender(pickField(item, GENDER_KEYS)),
    email: cleanText(pickField(item, EMAIL_KEYS), 256) || null,
    department: cleanText(pickField(item, DEPARTMENT_KEYS), 128) || null,
    deliveryGroup: cleanText(pickField(item, DELIVERY_GROUP_KEYS), 128) || null,
    title: cleanText(pickField(item, TITLE_KEYS), 128) || null
  };
}

// 在任意 JSON 包装里找出“员工数组”。取规范化后条数最多的那一层，避免把
// 员工对象内部的小数组（角色、权限等）误当员工列表。
function extractProfiles(payload) {
  let best = [];
  let single = null;
  function visit(value, depth) {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      const list = value.map(normalizeProfile).filter(Boolean);
      if (list.length > best.length) best = list;
      for (const item of value) {
        if (item && typeof item === 'object') visit(item, depth + 1);
      }
      return;
    }
    if (typeof value === 'object') {
      if (!single) single = normalizeProfile(value);
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') visit(child, depth + 1);
      }
    }
  }
  visit(payload, 0);
  if (best.length) {
    // 同一工号出现多次时以后出现的为准（便于上游按更新时间追加）。
    const unique = new Map();
    for (const profile of best) unique.set(profile.empNo, profile);
    return [...unique.values()];
  }
  return single ? [single] : [];
}

function requestHeaders(env, logger) {
  const headers = { Accept: 'application/json' };
  const token = cleanText(env.PROFILE_API_TOKEN, 4096);
  if (token) {
    // 公司 CAS 的受保护接口使用 token 头；同时带 Bearer 以兼容标准网关。
    headers.token = token;
    headers.Authorization = `Bearer ${token}`;
  }
  const cookie = cleanText(env.PROFILE_API_COOKIE, 4096);
  if (cookie) headers.Cookie = cookie;
  const extra = cleanText(env.PROFILE_API_HEADERS, 8192);
  if (extra) {
    try {
      const parsed = JSON.parse(extra);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [key, value] of Object.entries(parsed)) headers[key] = String(value);
      }
    } catch (error) {
      logger?.warn?.(`[profile] PROFILE_API_HEADERS 不是有效 JSON：${error && error.message || error}`);
    }
  }
  return headers;
}

function createProfiles(options = {}) {
  const store = options.store || null;
  const env = options.env || process.env;
  const logger = options.logger === undefined ? console : options.logger;
  const fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const url = cleanText(env.PROFILE_API_URL || DEFAULT_URL, 1024);
  const rawInterval = Number(env.PROFILE_SYNC_INTERVAL_MS);
  // 0（默认）= 只在启动时同步一次；需要定时刷新时再设置正数毫秒。
  const intervalMs = Number.isFinite(rawInterval) && rawInterval >= 0 ? Math.floor(rawInterval) : DEFAULT_INTERVAL_MS;
  const timeoutMs = Math.max(1000, Number(env.PROFILE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const requested = options.enabled !== undefined
    ? !!options.enabled
    : env.SID_PROFILE_SYNC !== '0' && env.SID_TEST !== '1';
  const enabled = requested && !!store && store.enabled !== false && !!fetchImpl && /^https?:\/\//i.test(url);
  const state = { lastSyncAt: 0, lastCount: 0, lastError: null, syncing: false };
  let timer = null;
  let running = null;
  let started = false;

  function employeeOf(empNo) {
    if (!store || !empNo) return null;
    try { return store.getEmployee(String(empNo)); } catch { return null; }
  }

  function pendingPlayers(players = []) {
    const employees = store && typeof store.listEmployees === 'function' ? store.listEmployees() : null;
    if (!employees) return { ok: false, error: '同事表暂时不可用，请联系管理员检查员工档案' };
    if (!employees.length) return { ok: false, error: '尚未同步同事表，请联系管理员同步员工档案' };
    // 按工号排除所有本场参与者，包含离线/淘汰；昵称及 NPC 不能凭同名排除员工。
    const joined = new Set(players.filter(p => !p.npc && p.empNo).map(p => String(p.empNo)));
    const groups = new Map();
    for (const e of employees) {
      if (joined.has(String(e.empNo))) continue;
      const group = e.deliveryGroup || '未分配交付组';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ empNo: String(e.empNo), name: e.name || String(e.empNo) });
    }
    const compare = (a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }) || (a < b ? -1 : a > b ? 1 : 0);
    const grouped = [...groups].sort(([a], [b]) => a === '未分配交付组' ? 1 : b === '未分配交付组' ? -1 : compare(a, b))
      .map(([name, members]) => ({ name, members: members.sort((a, b) => compare(a.empNo, b.empNo)) }));
    return { ok: true, total: employees.length, count: grouped.reduce((n, g) => n + g.members.length, 0), groups: grouped };
  }

  function genderOf(empNo) {
    const employee = employeeOf(empNo);
    return employee ? normalizeGender(employee.gender) : null;
  }

  // 一次性 CAS 票据也可以：把 PROFILE_API_TICKET 拼到 URL 的 ticket 参数上。
  // 票据通常只能用一次，所以配合 PROFILE_SYNC_INTERVAL_MS=0 只同步一次。
  function requestUrl() {
    const ticket = cleanText(env.PROFILE_API_TICKET, 4096);
    if (!ticket) return url;
    try {
      const target = new URL(url);
      target.searchParams.set('ticket', ticket);
      return target.toString();
    } catch { return url; }
  }

  async function runSync() {
    if (!enabled) return { ok: false, error: '员工档案同步未启用（检查 SID_PROFILE_SYNC / PROFILE_API_URL / 数据库）' };
    state.syncing = true;
    try {
      const response = await fetchImpl(requestUrl(), {
        headers: requestHeaders(env, logger),
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`HTTP ${response.status} 重定向：接口需要 CAS 登录，请配置 PROFILE_API_TOKEN / PROFILE_API_COOKIE`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let payload;
      try { payload = await response.json(); }
      catch { throw new Error('响应不是 JSON'); }
      const employees = extractProfiles(payload);
      if (!employees.length) throw new Error('响应中未找到员工记录（检查字段名或凭证是否有权限）');
      const saved = store.saveEmployees(employees);
      if (!saved) throw new Error('员工档案写入数据库失败');
      state.lastSyncAt = Date.now();
      state.lastCount = saved;
      state.lastError = null;
      logger?.log?.(`[profile] 员工档案同步成功：${saved} 条`);
      return { ok: true, count: saved };
    } catch (error) {
      const message = String(error && error.message || error);
      state.lastError = message;
      logger?.warn?.(`[profile] 员工档案同步失败：${message}`);
      return { ok: false, error: message };
    } finally {
      state.syncing = false;
    }
  }

  // 并发调用合并为一次请求：启动同步与管理页手动触发同时发生时不会重复拉取。
  function sync() {
    if (running) return running;
    running = runSync().finally(() => { running = null; });
    return running;
  }

  function start() {
    if (!enabled || started) return false;
    started = true;
    sync();
    if (intervalMs > 0) {
      timer = setInterval(() => { sync(); }, intervalMs);
      if (timer.unref) timer.unref();
    }
    return true;
  }

  function stop() {
    started = false;
    if (timer) { clearInterval(timer); timer = null; }
  }

  function status() {
    return {
      enabled,
      mode: intervalMs > 0 ? 'interval' : 'once',
      url,
      hasTicket: !!cleanText(env.PROFILE_API_TICKET, 4096),
      intervalMs,
      timeoutMs,
      syncing: state.syncing,
      lastSyncAt: state.lastSyncAt,
      lastCount: state.lastCount,
      lastError: state.lastError,
      employees: store && typeof store.employeeCount === 'function' ? store.employeeCount() : 0
    };
  }

  return { employeeOf, pendingPlayers, genderOf, sync, start, stop, status, normalizeGender };
}

module.exports = {
  DEFAULT_URL,
  normalizeGender,
  normalizeProfile,
  extractProfiles,
  createProfiles
};
