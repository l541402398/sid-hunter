// 健康检查回归：仅内存，不启动 HTTP、不加载真实 SSO 配置或存档。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createRoom } = require('./room.js');
const { createActivity, TEMPLATES, at } = require('./server/activity.js');
const forbidden = () => assert.fail('健康检查不能进入认证、管理会话或场次操作');
const authFile = require.resolve('./server/auth.js'), priorAuth = require.cache[authFile];
// auth 会加载根 .env；替换整个模块，同时确保探针先于认证执行。
require.cache[authFile] = { loaded: true, exports: { handle: forbidden, requireSso: forbidden, handleMe: forbidden } };
let makeRouter;
try { ({ makeRouter } = require('./server/app.js')); }
finally {
  if (priorAuth) require.cache[authFile] = priorAuth;
  else delete require.cache[authFile];
}
assert.equal(require.cache[require.resolve('./sso.js')], undefined);

let clock;
const realNow = Date.now;
Date.now = () => clock;
function fixture(time = '09:00', enabled = true) {
  clock = at('2026-10-20', time);
  let saved = null;
  const store = {
    enabled, fail: false, writes: 0,
    loadAdmin() { return saved; },
    loadSessions() { return []; },
    saveAdmin(state) { this.writes++; if (this.fail) return false; saved = JSON.parse(JSON.stringify(state)); return true; }
  };
  const room = createRoom(), activity = createActivity({ room, store, now: () => clock });
  return { store, room, activity };
}
async function probe(route, method = 'GET') {
  let status, headers, text;
  await route({ method, headers: {}, socket: { remoteAddress: '127.0.0.1' } }, {
    writeHead(code, value) { status = code; headers = value; },
    end(value) { text = value; }
  }, new URL('http://127.0.0.1/healthz'));
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
  assert.equal(headers['Cache-Control'], 'no-store');
  return { status, body: JSON.parse(text) };
}

try {
  await test('休场与暂停仍健康，读取就绪状态不写存档', () => {
    const { store, activity } = fixture('08:00');
    assert.equal(activity.saveConfig({ ...TEMPLATES.development, enabled: true }).ok, true);
    assert.equal(activity.state().active, false);
    let writes = store.writes;
    assert.equal(activity.isReady(), true);
    assert.equal(store.writes, writes);
    assert.equal(activity.startManual({ minutes: 5 }).ok, true);
    assert.equal(activity.pause().ok, true);
    assert.equal(activity.state().paused, true);
    writes = store.writes;
    assert.equal(activity.isReady(), true);
    assert.equal(store.writes, writes);
  });

  await test('真实持久化失败返回503，探针不重试，场次tick恢复后返回200', async () => {
    const { store, activity } = fixture();
    activity.tick();
    const route = makeRouter({ ACTIVITY: activity });
    assert.deepEqual(await probe(route), { status: 200, body: { ok: true } });
    store.fail = true;
    assert.equal(activity.persist(), false);
    assert.equal(activity.isReady(), false);
    assert.deepEqual(await probe(route), { status: 503, body: { ok: false } });
    store.fail = false;
    clock += 1001;
    const writes = store.writes;
    assert.deepEqual(await probe(route), { status: 503, body: { ok: false } });
    assert.equal(store.writes, writes);
    activity.tick();
    assert.equal(activity.isReady(), true);
    assert.deepEqual(await probe(route), { status: 200, body: { ok: true } });
  });

  await test('存储禁用时立即不健康，探针不写库', async () => {
    const { store, activity } = fixture('09:00', false);
    assert.equal(activity.isReady(), false);
    assert.deepEqual(await probe(makeRouter({ ACTIVITY: activity })), { status: 503, body: { ok: false } });
    assert.equal(store.writes, 0);
  });

  await test('公开GET仅接受严格true且仅返回ok，不访问私密状态或管理会话', async () => {
    for (const ready of [true, false, undefined, 1, 'ready', {}]) {
      const route = makeRouter({
        ACTIVITY: { isReady: () => ready, state: forbidden, guard: forbidden, tick: forbidden, persist: forbidden },
        MANAGER: { sessionFor: forbidden, sessionProbe: forbidden, state: forbidden }
      });
      assert.deepEqual(await probe(route), { status: ready === true ? 200 : 503, body: { ok: ready === true } });
    }
  });

  await test('没有ACTIVITY时返回503', async () => {
    assert.deepEqual(await probe(makeRouter({})), { status: 503, body: { ok: false } });
  });

  await test('POST拒绝为405且不读取就绪状态或调用场次操作', async () => {
    const route = makeRouter({ ACTIVITY: { isReady: forbidden, guard: forbidden, tick: forbidden } });
    assert.deepEqual(await probe(route, 'POST'), { status: 405, body: { ok: false } });
  });
} finally { Date.now = realNow; }
