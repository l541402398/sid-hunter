import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayload, deploy } from './deploy.mjs';

const runtime = {
  SID_MANAGER_CODE: String.raw`manager-"quoted"\path-$TOKEN`,
  SSO_LOGIN_URL: 'https://sso.example.test/login',
  SSO_VALIDATE_URL: 'https://sso.example.test/validate',
  PROFILE_API_HEADERS: String.raw`{"text":"quoted \"value\"","path":"C:\\sid","money":"$100"}`,
  PROFILE_API_COOKIE: String.raw`a "quote", a \ slash, $HOME`
};
const token = 'xdog-token-do-not-log';
function fixture() {
  return { ...runtime, XDOG_TOKEN: token, IMAGE_NAME: 'registry.example.test/sid', CI_COMMIT_TAG: 'v1.2.3',
    USER_NAME: 'registry-user', USER_PASSWORD: 'registry-password', CI_JOB_TOKEN: 'gitlab-job-token', OTHER_SECRET: 'unrelated-secret' };
}
const forbidden = () => assert.fail('无效配置不能发送部署请求');

test('逐项变量保留特殊字符且不传流水线凭据，使用固定容器与数据卷', () => {
  const env = fixture();
  const payload = buildPayload(env);
  assert.deepEqual({ ...payload, Envs: undefined }, {
    ID: 281, Name: 'sid', Image: 'registry.example.test/sid:v1.2.3', Cmd: '', Envs: undefined,
    Vols: [{ ContainerID: 281, VolumeID: 393, MountPoint: '/app/online/.data' }]
  });
  assert.ok(payload.Envs.every(item => item.ContainerID === 281));
  assert.deepEqual(Object.fromEntries(payload.Envs.map(({ Key, Value }) => [Key, Value])), {
    TZ: 'Asia/Shanghai', ...runtime
  });
  assert.equal(buildPayload({ ...env, TZ: 'UTC' }).Envs.find(item => item.Key === 'TZ').Value, 'UTC');
});

test('缺少或空白的 CI 配置与运行时必填项在请求前失败', async () => {
  const env = fixture();
  for (const key of ['XDOG_TOKEN', 'IMAGE_NAME', 'CI_COMMIT_TAG', 'SID_MANAGER_CODE', 'SSO_LOGIN_URL', 'SSO_VALIDATE_URL']) {
    for (const value of [undefined, '', '   ']) {
      await assert.rejects(deploy({ ...env, [key]: value }, forbidden), new RegExp(key));
    }
  }
});

test('未配置的可选变量不传，空值和字符串0原样保留', () => {
  const env = { ...fixture(), PROFILE_API_TOKEN: '', SID_PROFILE_SYNC: '0', TOKEN_EXPIRE: '604800' };
  const values = Object.fromEntries(buildPayload(env).Envs.map(({ Key, Value }) => [Key, Value]));
  assert.equal(values.PROFILE_API_TOKEN, '');
  assert.equal(values.SID_PROFILE_SYNC, '0');
  assert.equal(values.TOKEN_EXPIRE, '604800');
  assert.equal(Object.hasOwn(values, 'PROFILE_API_TICKET'), false);
  assert.equal(Object.hasOwn(values, 'SID_TEST'), false);
});

test('非法 Docker 标签在请求前失败', async () => {
  const env = fixture();
  for (const tag of ['release/v1', '.v1', '-v1', 'v1\n', 'x'.repeat(129)]) {
    await assert.rejects(deploy({ ...env, CI_COMMIT_TAG: tag }, forbidden), /Docker/);
  }
  assert.equal(buildPayload({ ...env, CI_COMMIT_TAG: 'x'.repeat(128) }).Image, `${env.IMAGE_NAME}:${'x'.repeat(128)}`);
});

test('请求使用约定 URL、认证、JSON、禁止重定向与两分钟超时', async t => {
  const env = fixture(), signal = new AbortController().signal;
  t.mock.method(AbortSignal, 'timeout', ms => { assert.equal(ms, 120_000); return signal; });
  t.mock.method(console, 'log', () => {});
  let calls = 0;
  await deploy(env, async (url, options) => {
    calls++;
    assert.equal(url, 'http://172.26.14.1/modifyContainer');
    assert.deepEqual(options, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Xdog-Token': token },
      body: JSON.stringify(buildPayload(env)), redirect: 'error', signal
    });
    return { ok: true, status: 200 };
  });
  assert.equal(calls, 1);
});

test('HTTP 与网络失败抛错，错误和日志不回显密钥', async t => {
  const env = fixture(), logs = [];
  for (const method of ['log', 'error']) t.mock.method(console, method, (...args) => logs.push(args.join(' ')));
  const secret = `${token} manager-"quoted"\\path-$TOKEN`;
  const failures = [
    [async () => ({ ok: false, status: 503, text: async () => secret }), /HTTP 503/],
    [async () => { throw new Error(secret); }, /请求失败或超时/]
  ];
  for (const [request, expected] of failures) {
    await assert.rejects(deploy(env, request), error => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes(token) && !error.message.includes('manager-'));
      return true;
    });
  }
  assert.ok(!logs.join('\n').includes(token) && !logs.join('\n').includes('manager-'));
});
