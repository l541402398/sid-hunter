// 员工档案同步 + 按性别分配男女形象：单元/数据库/HTTP 全链路回归。
// 不依赖真实 profile 服务，也不触碰线上库。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { normalizeGender, extractProfiles, createProfiles } = require('./server/profiles.js');
const { createStore } = require('./server/store.js');
const { createRoom } = require('./room.js');
const { randomColors } = require('./room/config.js');
const WORLD = require('./shared/world.js');
const { createCharacterRenderer } = require('./public/js/render/characters.js');

const renderer = createCharacterRenderer({ WORLD });
const silent = { log() { }, warn() { } };
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log('PASS', name);
}
const tempDirs = [];
function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sid-profile-'));
  tempDirs.push(dir);
  return dir;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const hairIndex = player => WORLD.PALETTES.hair.findIndex(item => item[0] === player.colors.hair[0]);

try {
  await test('性别归一：男/女、M/F、1/2 与未知值', () => {
    for (const value of ['男', '男性', '男生', 'M', 'male', 'MALE', '1', 1, true]) assert.equal(normalizeGender(value), 'male', String(value));
    for (const value of ['女', '女性', '女生', 'F', 'female', 'FEMALE', '2', 2, false]) assert.equal(normalizeGender(value), 'female', String(value));
    for (const value of [null, undefined, '', '0', 0, 'unknown', 'x']) assert.equal(normalizeGender(value), null, String(value));
  });

  await test('响应结构：数组、data.list、records、单对象都能取到员工', () => {
    const employees = [
      { empNo: 'E1', name: '张三', sex: '男' },
      { empNo: 'E2', name: '李四', sex: '女' }
    ];
    assert.deepEqual(extractProfiles(employees).map(item => item.empNo), ['E1', 'E2']);
    assert.deepEqual(extractProfiles({ code: 0, data: { list: employees } }).map(item => item.empNo), ['E1', 'E2']);
    assert.deepEqual(extractProfiles({ records: employees }).map(item => item.empNo), ['E1', 'E2']);
    const one = extractProfiles({ data: { empNo: 'E9', name: '单条', gender: 'F' } });
    assert.equal(one.length, 1);
    assert.equal(one[0].empNo, 'E9');
    assert.equal(one[0].gender, 'female');
  });

  await test('字段别名与嵌套员工对象：工号/姓名/性别/部门/交付组', () => {
    const [profile] = extractProfiles([{
      employee: { employeeNo: 'E7', empName: '王五', sex: '女' },
      deptName: '研发中心',
      deliveryGroup: 'TRP开发组',
      emailAddress: 'w@example.com',
      jobTitle: '工程师'
    }]);
    assert.deepEqual(profile, {
      empNo: 'E7', name: '王五', gender: 'female',
      email: 'w@example.com', department: '研发中心', deliveryGroup: 'TRP开发组', title: '工程师'
    });
    const [nested] = extractProfiles([{ user: { emp_no: 'E8', name: '赵六' }, gender: '男' }]);
    assert.equal(nested.empNo, 'E8');
    assert.equal(nested.name, '赵六');
    assert.equal(nested.gender, 'male');
  });

  await test('profilesAll 真实结构：employee.no / employee.sex / employee.dept / deliveryGroup', () => {
    const [profile] = extractProfiles([{
      employee: {
        no: '090001', name: '贾慧云', sex: '女', dept: '合约二区',
        deliveryGroup: '票证预订系维组',
        email: 'huiyjia@travelsky.com.cn'
      },
      profile: { empNumber: '090001', empName: '贾慧云', hobby: '爬山' }
    }]);
    assert.deepEqual(profile, {
      empNo: '090001', name: '贾慧云', gender: 'female',
      email: 'huiyjia@travelsky.com.cn', department: '合约二区',
      deliveryGroup: '票证预订系维组', title: null
    });
  });

  await test('同一工号重复出现时以后出现的记录为准', () => {
    const list = extractProfiles([
      { empNo: 'DUP', name: '旧名字', gender: '男' },
      { empNo: 'DUP', name: '新名字', gender: '女' }
    ]);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, '新名字');
    assert.equal(list[0].gender, 'female');
  });

  await test('SQLite employees 表 upsert / 查询 / 重开仍在', () => {
    const file = path.join(tempDir(), 'employees.sqlite');
    const store = createStore({ file });
    try {
      assert.equal(store.enabled, true, store.error || '');
      assert.equal(store.saveEmployees([
        { empNo: 'M1', name: '男员工', gender: 'male', department: '合约一区', deliveryGroup: 'TRP开发组' },
        { empNo: 'F1', name: '女员工', gender: 'female', department: '合约二区', deliveryGroup: '票证预订系维组' }
      ]), 2);
      assert.equal(store.employeeCount(), 2);
      assert.equal(store.getEmployee('M1').gender, 'male');
      assert.equal(store.getEmployee('M1').department, '合约一区');
      assert.equal(store.getEmployee('M1').deliveryGroup, 'TRP开发组');
      assert.equal(store.getEmployee('F1').name, '女员工');
      // 再写一次同名工号应更新而不是插重复行。
      assert.equal(store.saveEmployees([{ empNo: 'M1', name: '男员工改名', gender: 'male', deliveryGroup: 'TRP二组' }]), 1);
      assert.equal(store.employeeCount(), 2);
      assert.equal(store.getEmployee('M1').name, '男员工改名');
      assert.equal(store.getEmployee('M1').deliveryGroup, 'TRP二组');
    } finally {
      store.close();
    }
    const reopened = createStore({ file });
    try {
      assert.equal(reopened.employeeCount(), 2);
      assert.equal(reopened.getEmployee('F1').gender, 'female');
      assert.equal(reopened.getEmployee('F1').deliveryGroup, '票证预订系维组');
    } finally {
      reopened.close();
    }
  });

  await test('同步：一次性票据拼到 URL / token 头 / 默认只同步一次', async () => {
    const store = createStore({ file: path.join(tempDir(), 'sync.sqlite') });
    const calls = [];
    const profiles = createProfiles({
      store,
      enabled: true,
      env: {
        PROFILE_API_URL: 'http://profile.test/profiles',
        PROFILE_API_TOKEN: 'tk-test',
        PROFILE_API_TICKET: 'ST-once'
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true, status: 200,
          json: async () => ({ code: 0, data: [{ empNo: 'S1', name: '同步男', sex: 'M', deliveryGroup: 'TRP开发组' }, { empNo: 'S2', name: '同步女', sex: '女' }] })
        };
      },
      logger: silent
    });
    try {
      const result = await profiles.sync();
      assert.deepEqual(result, { ok: true, count: 2 });
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'http://profile.test/profiles?ticket=ST-once');
      assert.equal(calls[0].options.headers.token, 'tk-test');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer tk-test');
      assert.equal(calls[0].options.redirect, 'manual');
      assert.equal(profiles.status().mode, 'once');
      assert.equal(profiles.status().hasTicket, true);
      assert.equal(profiles.employeeOf('S1').gender, 'male');
      assert.equal(profiles.employeeOf('S1').deliveryGroup, 'TRP开发组');
      assert.equal(profiles.genderOf('S2'), 'female');
      assert.equal(profiles.status().employees, 2);
    } finally {
      store.close();
    }
  });

  await test('同步失败：302 登录跳转给出可操作提示，且不覆盖已有员工', async () => {
    const store = createStore({ file: path.join(tempDir(), 'denied.sqlite') });
    try {
      store.saveEmployees([{ empNo: 'KEEP', name: '保留', gender: 'female' }]);
      const profiles = createProfiles({
        store, enabled: true,
        env: { PROFILE_API_URL: 'http://profile.test/profiles' },
        fetchImpl: async () => ({ ok: false, status: 302, json: async () => ({}) }),
        logger: silent
      });
      const result = await profiles.sync();
      assert.equal(result.ok, false);
      assert.match(result.error, /302/);
      assert.match(result.error, /PROFILE_API_TOKEN/);
      assert.equal(profiles.employeeOf('KEEP').gender, 'female');
    } finally {
      store.close();
    }
  });

  await test('新角色按性别选发色，客户端 style() 得到正确男女形象', () => {
    const room = createRoom();
    const male = room.join('m1', null, { empNo: 'M1', name: '男员工', gender: 'male' }).player;
    const female = room.join('f1', null, { empNo: 'F1', name: '女员工', gender: 'female' }).player;
    assert.equal(male.gender, 'male');
    assert.equal(female.gender, 'female');
    assert.equal(hairIndex(male) % 2, 0);
    assert.equal(hairIndex(female) % 2, 1);
    assert.equal(renderer.style(male), 'male');
    assert.equal(renderer.style(female), 'female');
  });

  await test('目标公开档案：合约区/交付组进入公开快照，回座会更新', () => {
    const room = createRoom();
    const player = room.join('o1', null, {
      empNo: 'O1', name: '组织员工', gender: 'male',
      dept: '合约一区', deliveryGroup: 'TRP开发组'
    }).player;
    const snapshot = room.publicSnapshot(player.id);
    const publicPlayer = snapshot.players.find(item => item.id === player.id);
    assert.equal(publicPlayer.dept, '合约一区');
    assert.equal(publicPlayer.deliveryGroup, 'TRP开发组');

    room.join('o2', null, {
      empNo: 'O1', name: '组织员工', gender: 'male',
      dept: '合约二区', deliveryGroup: 'TRP二组'
    });
    assert.equal(player.dept, '合约二区');
    assert.equal(player.deliveryGroup, 'TRP二组');
    assert.equal(room.publicSnapshot(player.id).players.find(item => item.id === player.id).deliveryGroup, 'TRP二组');
  });

  await test('回座只纠正发色：保留阵营、其它配色与已正确形象', () => {
    const room = createRoom();
    const female = room.join('f1', null, { empNo: 'F1', name: '女员工', gender: 'female' }).player;
    const faction = female.faction;
    const top = female.colors.top;
    const hair = female.colors.hair;
    const again = room.join('f2', null, { empNo: 'F1', name: '女员工', gender: 'female' });
    assert.equal(again.revived, true);
    assert.equal(again.player, female);
    assert.equal(again.player.colors.hair, hair);
    assert.equal(again.player.colors.top, top);
    assert.equal(again.player.faction, faction);

    // 历史角色若发色与性别不符，只在回座时纠正发色，不动上衣。
    female.colors = { ...female.colors, hair: WORLD.PALETTES.hair[0] };
    room.join('f3', null, { empNo: 'F1', name: '女员工', gender: 'female' });
    assert.equal(hairIndex(female) % 2, 1);
    assert.equal(renderer.style(female), 'female');
    assert.equal(female.colors.top, top);
    assert.equal(female.faction, faction);
  });

  await test('轮回券重随机配色仍保持性别（randomColors(gender)）', () => {
    for (let i = 0; i < 40; i++) {
      const male = { colors: randomColors('male') };
      const female = { colors: randomColors('female') };
      assert.equal(renderer.style(male), 'male');
      assert.equal(renderer.style(female), 'female');
    }
  });

  await test('一次性导入：--file 直接写库，不需要 CAS 凭证', () => {
    const dir = tempDir();
    const jsonFile = path.join(dir, 'profiles.json');
    const dbFile = path.join(dir, 'import.sqlite');
    fs.writeFileSync(jsonFile, JSON.stringify({
      data: {
        list: [
          { empNo: 'IMP-M', name: '导入男', sex: '男', dept: '合约一区', deliveryGroup: 'TRP开发组' },
          { empNo: 'IMP-F', name: '导入女', gender: 'F', dept: '合约二区', deliveryGroup: '票证预订系维组' }
        ]
      }
    }));
    const env = { ...process.env, SID_DB_FILE: dbFile, PROFILE_SYNC_INTERVAL_MS: '0' };
    delete env.SID_TEST;
    const run = spawnSync(process.execPath, [path.join(ROOT, 'profiles-sync.mjs'), `--file=${jsonFile}`], {
      cwd: ROOT, env, encoding: 'utf8'
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /"saved": 2/);
    const store = createStore({ file: dbFile });
    try {
      assert.equal(store.employeeCount(), 2);
      assert.equal(store.getEmployee('IMP-M').gender, 'male');
      assert.equal(store.getEmployee('IMP-M').deliveryGroup, 'TRP开发组');
      assert.equal(store.getEmployee('IMP-F').gender, 'female');
      assert.equal(store.getEmployee('IMP-F').department, '合约二区');
    } finally {
      store.close();
    }
  });

  await test('目标公开档案 UI：状态行用“合约区 · 交付组”替换原存活/淘汰文案', () => {
    const game = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
    assert.ok(game.includes('function targetOrgLine'));
    assert.ok(game.includes('[p.dept, p.deliveryGroup]'));
    assert.ok(game.includes('map(escapeText)'));
    assert.ok(game.includes('const status = orgLine ||'));
    assert.ok(game.includes('存活 · 公开档案'));
    assert.ok(!game.includes('targetOrgHTML'));
    const css = fs.readFileSync(path.join(ROOT, 'public/styles/panels.css'), 'utf8');
    assert.ok(!css.includes('.org-grid'));
  });

  await test('待加入名单：真实员工库、交付组分组与工号排序、离线淘汰排除及最小字段', () => {
    const store = createStore({ file: path.join(tempDir(), 'pending.sqlite') });
    try {
      store.saveEmployees([
        { empNo: '010', name: '同名', deliveryGroup: '甲组', email: 'private@example.com', gender: 'male', title: '秘密职位' },
        { empNo: '002', name: '同名', deliveryGroup: '甲组' },
        { empNo: '001', name: '已离线', deliveryGroup: '乙组' },
        { empNo: '003', name: '已淘汰', deliveryGroup: '乙组' },
        { empNo: '004', name: '未分组' }
      ]);
      const profiles = createProfiles({ store, enabled: false });
      const result = profiles.pendingPlayers([
        { empNo: '001', online: false, alive: true }, { empNo: '003', alive: false },
        { name: '同名' }, { npc: true, empNo: '002' }
      ]);
      assert.equal(result.count, 3); assert.equal(result.total, 5);
      assert.deepEqual(result.groups, [
        { name: '甲组', members: [{ empNo: '002', name: '同名' }, { empNo: '010', name: '同名' }] },
        { name: '未分配交付组', members: [{ empNo: '004', name: '未分组' }] }
      ]);
      assert.equal(/private@example|gender|秘密职位|email|session|faction|sid/.test(JSON.stringify(result)), false);
      assert.equal(profiles.pendingPlayers(store.listEmployees()).count, 0, '全部加入空态');
      assert.equal(profiles.pendingPlayers([]).count, 5, '新场不排除上一场参与者');
      store.saveEmployees([{ empNo: '004', name: '调组', deliveryGroup: '甲组' }]);
      assert.equal(profiles.pendingPlayers([]).groups.length, 2);
    } finally { store.close(); }
    assert.equal(createProfiles({ store: createStore({ enabled: false }), enabled: false }).pendingPlayers([]).ok, false);
    const empty = createStore({ file: path.join(tempDir(), 'empty.sqlite') });
    try { assert.match(createProfiles({ store: empty, enabled: false }).pendingPlayers([]).error, /尚未同步/); }
    finally { empty.close(); }
  });

  await test('HTTP 全链路：SSO 员工库有性别 → /api/join 分配对应形象', async () => {
    const dir = tempDir();
    const file = path.join(dir, 'http.sqlite');
    const store = createStore({ file });
    store.saveEmployees([
      { empNo: 'HTTP-M', name: '接口男', gender: 'male', department: '合约一区', deliveryGroup: 'TRP开发组' },
      { empNo: 'HTTP-F', name: '接口女', gender: 'female', department: '合约二区', deliveryGroup: '票证预订系维组' }
    ]);
    // 用一段进行中的场次初始化管理状态，避免 /api/join 被“未开启自动开局”挡住。
    const now = Date.now();
    store.saveAdmin({
      version: 3,
      config: {
        template: 'development', startTime: '09:00', endTime: '17:00',
        slots: [{ id: 'daily', label: '每日场', startTime: '09:00', endTime: '17:00' }],
        chargeIntervalMs: 90000, clueIntervalMs: 120000, cluePercent: 20, clueMin: 1, clueMax: 5,
        enabled: true
      },
      session: {
        roundId: 'profile-test-round', day: '2026-10-21', label: '测试场', source: 'manual',
        startedAt: now - 1000, endsAt: now + 60 * 60 * 1000, settled: false, pausedAt: 0
      },
      planDay: '2026-10-21',
      plan: { enabled: true, slots: [{ id: 'daily', label: '每日场', startTime: '09:00', endTime: '17:00' }] },
      consumed: [], revision: 1, clueSchedule: { nextAt: 0, lastAt: 0, lastCount: 0 },
      liveSnapshot: {
        roundId: 'profile-test-round', startedAt: now - 1000, players: [], sessions: [],
        features: {}, finished: false, finishReason: '', lastResult: null, ranking: null,
        logs: [], eliminateEvents: 0, pausedAt: 0
      }
    });
    store.close();

    const port = await freePort();
    const seed = JSON.stringify([
      { token: 'token-m', user: { emp_no: 'HTTP-M', name: '接口男', email: null } },
      { token: 'token-f', user: { emp_no: 'HTTP-F', name: '接口女', email: null } }
    ]);
    const env = {
      ...process.env, HOST: '127.0.0.1', PORT: String(port),
      SID_DB_FILE: file, SID_SSO_SEED: seed, SID_PROFILE_SYNC: '0', SID_SSO: '1'
    };
    delete env.SID_TEST;
    const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe']
    });
    let log = '';
    child.stdout.on('data', chunk => { log += chunk; });
    child.stderr.on('data', chunk => { log += chunk; });
    try {
      const base = `http://127.0.0.1:${port}`;
      let ready = false;
      for (let i = 0; i < 80; i++) {
        try { if ((await fetch(base + '/api/auth/config')).ok) { ready = true; break; } } catch { /* retry */ }
        await sleep(50);
      }
      assert.equal(ready, true, log);

      const anonMe = await fetch(base + '/api/auth/me');
      assert.equal(anonMe.status, 401);
      assert.equal((await fetch(base + '/api/pending-players')).status, 401);
      assert.equal((await fetch(base + '/api/pending-players', { headers: { 'User-Token': 'token-m' } })).status, 401, '登录但未加入不可获取员工名单');

      const meM = await fetch(base + '/api/auth/me', { headers: { 'User-Token': 'token-m' } });
      const meMBody = await meM.json();
      assert.equal(meM.status, 200);
      assert.equal(meMBody.gender, 'male');
      assert.equal(meMBody.department, '合约一区');
      assert.equal(meMBody.deliveryGroup, 'TRP开发组');

      const joined = await fetch(base + '/api/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Token': 'token-m' }, body: '{}'
      });
      const joinedBody = await joined.json();
      assert.equal(joined.status, 200, JSON.stringify(joinedBody));
      const state = await fetch(base + '/api/state', {
        headers: { 'User-Token': 'token-m', 'X-Sid-Session': joinedBody.sessionToken }
      });
      const stateBody = await state.json();
      assert.equal(state.status, 200);
      const me = stateBody.players.find(player => player.id === joinedBody.playerId);
      assert.ok(me, '玩家应在公开快照里');
      assert.equal(WORLD.PALETTES.hair.findIndex(item => item[0] === me.colors.hair[0]) % 2, 0);
      assert.equal(renderer.style(me), 'male');
      assert.equal(me.dept, '合约一区');
      assert.equal(me.deliveryGroup, 'TRP开发组');
      const pendingHeaders = { 'User-Token': 'token-m', 'X-Sid-Session': joinedBody.sessionToken };
      const pendingResponse = await fetch(base + '/api/pending-players', { headers: pendingHeaders });
      assert.equal(pendingResponse.status, 200); assert.equal(pendingResponse.headers.get('cache-control'), 'no-store');
      const pending = await pendingResponse.json();
      assert.equal(pending.count, 1); assert.equal(pending.total, 2); assert.equal(pending.roundId, stateBody.roundId);
      assert.deepEqual(pending.groups, [{ name: '票证预订系维组', members: [{ empNo: 'HTTP-F', name: '接口女' }] }]);
      assert.equal(pending.port, port);
      assert.equal((await fetch(base + '/api/pending-players', { method: 'POST', headers: pendingHeaders })).status, 405);

      const joinedF = await fetch(base + '/api/join', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Token': 'token-f' }, body: '{}'
      });
      const joinedFBody = await joinedF.json();
      const stateF = await fetch(base + '/api/state', {
        headers: { 'User-Token': 'token-f', 'X-Sid-Session': joinedFBody.sessionToken }
      });
      const meF = (await stateF.json()).players.find(player => player.id === joinedFBody.playerId);
      assert.equal(WORLD.PALETTES.hair.findIndex(item => item[0] === meF.colors.hair[0]) % 2, 1);
      assert.equal(renderer.style(meF), 'female');
      const afterJoin = await fetch(base + '/api/pending-players', { headers: pendingHeaders }).then(r => r.json());
      assert.equal(afterJoin.count, 0); assert.deepEqual(afterJoin.groups, []);
      assert.equal(log.includes('员工档案同步失败'), false, log);
    } finally {
      child.kill();
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 1500);
        child.once('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  });

  console.log(`员工档案/性别形象 ${passed} PASS`);
} finally {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
