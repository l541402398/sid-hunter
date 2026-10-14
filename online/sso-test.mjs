// SSO 与工号占座。不连接、不重置正在跑的 8787。
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sso = require('./sso.js');
const { createRoom } = require('./room.js');
const children = [];
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(label, fn) {
  for (let i = 0; i < 50; i++) { if (await fn()) return; await sleep(40); }
  throw new Error('timeout: ' + label);
}
function start(port, testMode, extra = {}) {
  const env = { ...process.env, HOST: '127.0.0.1', PORT: String(port), ...extra };
  delete env.SID_SSO_SEED;
  if (testMode) env.SID_TEST = '1';
  else delete env.SID_TEST;
  if (extra.SID_SSO_SEED) env.SID_SSO_SEED = extra.SID_SSO_SEED;
  const child = spawn(process.execPath, [join(root, 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });
  child.log = () => log;
  return child;
}

const cas = `<?xml version="1.0"?><cas:serviceResponse xmlns:cas="http://www.yale.edu/tp/cas"><cas:authenticationSuccess><cas:user>E100</cas:user><cas:attributes><cas:sn>张三</cas:sn><cas:mail>a@b.c</cas:mail></cas:attributes></cas:authenticationSuccess></cas:serviceResponse>`;
const parsed = sso.parseCas(cas);
assert.equal(parsed.empNo, 'E100');
assert.equal(parsed.name, '张三');
assert.equal(parsed.email, 'a@b.c');
assert.equal(sso.parseCas('<cas:authenticationFailure code="INVALID_TICKET">no</cas:authenticationFailure>'), null);
assert.equal(sso.serviceAllowed('http://evil.test/', '127.0.0.1:8787'), false);
assert.equal(sso.serviceAllowed('http://127.0.0.1:8787/', '127.0.0.1:8787'), true);

const room = createRoom();
const first = room.join('s1', null, { empNo: 'E1', name: '张三' });
assert.equal(first.player.name, '张三');
assert.equal(first.player.faction, 'bad');
assert.equal(first.revived, false);
const again = room.join('s2', '别人', { empNo: 'E1', name: '张三' });
assert.equal(again.revived, true);
assert.equal(again.player.id, first.player.id);
assert.equal(room.playerBySession('s1'), null);
assert.equal(room.playerBySession('s2').id, first.player.id);
const other = room.join('s3', null, { empNo: 'E2', name: '张三' });
assert.equal(other.player.name, '张三2');
assert.equal(other.player.faction, 'good');
const nick = room.join('s4', '小序');
assert.equal(nick.player.name, '小序');
assert.equal(nick.player.empNo, null);
const pub = JSON.stringify(room.publicSnapshot(first.player.id));
const priv = JSON.stringify(room.privateSnapshot(first.player.id));
assert.equal(pub.includes('E1'), false);
assert.equal(priv.includes('E1'), false);
room.finish();
// 合并适配：main 分支的文案为「游戏已结束，无法加入」，语义与 dev 一致，这里只校验语义。
assert.match(room.join('s5', null, { empNo: 'E9', name: '李四' }).error, /结束，无法加入$/);
assert.equal(room.join('s6', null, { empNo: 'E1', name: '张三' }).revived, true);

const previousExpire = process.env.TOKEN_EXPIRE;
process.env.TOKEN_EXPIRE = '0';
const expiredToken = sso.createToken('SSOEXP', '过期', null);
assert.equal(sso.getProfile(expiredToken), null);
process.env.TOKEN_EXPIRE = previousExpire;
const token = sso.createToken('SSOTEST1', '测单点', null);
const otherToken = sso.createToken('SSOTEST2', '测单点', null);
try {
  const profile = sso.getProfile(token);
  assert.equal(profile.emp_no, 'SSOTEST1');
  assert.equal(profile.name, '测单点');
  assert.equal(token.includes('SSOTEST1'), false);

  const openPort = await freePort();
  assert.notEqual(openPort, 8787);
  const testPort = await freePort();
  assert.notEqual(testPort, 8787);
  const seed = JSON.stringify([
    { token, user: { emp_no: 'SSOTEST1', name: '测单点', email: null } },
    { token: otherToken, user: { emp_no: 'SSOTEST2', name: '测单点', email: null } }
  ]);
  start(openPort, false, { SID_SSO_SEED: seed });
  start(testPort, true);
  const openBase = `http://127.0.0.1:${openPort}`;
  const testBase = `http://127.0.0.1:${testPort}`;
  await until('sso server', async () => { try { return (await fetch(openBase + '/api/auth/config')).ok; } catch { return false; } });
  await until('test server', async () => { try { return (await fetch(testBase + '/api/auth/config')).ok; } catch { return false; } });

  const openCfg = await (await fetch(openBase + '/api/auth/config')).json();
  const testCfg = await (await fetch(testBase + '/api/auth/config')).json();
  assert.equal(openCfg.required, true);
  assert.match(openCfg.loginUrl, /\{service\}/);
  assert.equal(openCfg.logoutUrl, 'https://172.26.1.10/logout');
  assert.equal(testCfg.required, false);

  const anon = await fetch(openBase + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const anonBody = await anon.json();
  assert.equal(anon.status, 401);
  assert.equal(anonBody.auth, false);

  const badService = await fetch(openBase + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket: 'ST-fake', service: 'http://evil.test/' })
  });
  assert.equal(badService.status, 400);

  const joined = await fetch(openBase + '/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Token': token },
    body: JSON.stringify({ nickname: '黑客' })
  });
  const joinedBody = await joined.json();
  assert.equal(joined.status, 200, JSON.stringify(joinedBody));
  assert.equal(joinedBody.name, '测单点');
  assert.equal(joinedBody.revived, false);
  const againHttp = await fetch(openBase + '/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Token': token },
    body: '{}'
  });
  const againBody = await againHttp.json();
  assert.equal(againBody.revived, true);
  assert.equal(againBody.playerId, joinedBody.playerId);
  const state = await fetch(openBase + '/api/state', { headers: { 'User-Token': token, 'X-Sid-Session': againBody.sessionToken } });
  const stateBody = await state.json();
  assert.equal(state.status, 200);
  assert.equal(stateBody.me.name, '测单点');
  assert.equal(JSON.stringify(stateBody).includes('SSOTEST1'), false);

  const second = await fetch(openBase + '/api/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Token': otherToken },
    body: '{}'
  });
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.name, '测单点2');
  assert.notEqual(secondBody.playerId, joinedBody.playerId);
  const mismatch = await fetch(openBase + '/api/state', { headers: { 'User-Token': otherToken, 'X-Sid-Session': againBody.sessionToken } });
  assert.equal(mismatch.status, 401);

  const loggedOut = await fetch(openBase + '/api/auth/logout', { method: 'POST', headers: { 'User-Token': token } });
  assert.equal(loggedOut.status, 200);
  const expired = await fetch(openBase + '/api/state', { headers: { 'User-Token': token, 'X-Sid-Session': againBody.sessionToken } });
  assert.equal(expired.status, 401);

  const legacy = await fetch(testBase + '/api/join', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '小序' })
  });
  const legacyBody = await legacy.json();
  assert.equal(legacy.status, 200, JSON.stringify(legacyBody));
  assert.equal(legacyBody.name, '小序');
  console.log('PASS sso');
} finally {
  sso.revoke(token);
  sso.revoke(otherToken);
  for (const child of children) child.kill();
}
