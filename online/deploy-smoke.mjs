// 部署后冒烟自检：真实 HTTP 打 target，覆盖静态资源 / 身份 / SSE 快照 / 管理接口封锁。
// 用法: node smoke.mjs https://game.afann.xyz
const target = process.argv[2] || 'https://game.afann.xyz';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  <- ' + detail : ''}`); };

async function get(path, opts = {}) {
  const res = await fetch(target + path, { redirect: 'manual', ...opts });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text };
}

const index = await get('/');
check('GET / => 200', index.status === 200, `status=${index.status}`);
check('页面标题正确', /S-ID/.test(index.text), index.text.match(/<title>([^<]*)<\/title>/)?.[1] || 'no title');
check('缓存禁用头', /no-store/.test(index.headers.get('cache-control') || ''), index.headers.get('cache-control'));

for (const [path, type] of [['/game.js', 'javascript'], ['/styles.css', 'css'], ['/shared/world.js', 'javascript']]) {
  const res = await get(path);
  check(`静态资源 ${path}`, res.status === 200 && (res.headers.get('content-type') || '').includes(type), `status=${res.status} type=${res.headers.get('content-type')}`);
}

const bad = await get('/room.js');
check('服务端源码不可读 /room.js => 404', bad.status === 404, `status=${bad.status}`);

const state = await get('/api/state');
check('未认证 /api/state => 401', state.status === 401, `status=${state.status}`);

for (const path of ['/api/dev/capabilities', '/api/host/reset', '/api/test/state']) {
  const res = await get(path);
  check(`管理接口封锁 ${path} => 404`, res.status === 404, `status=${res.status}`);
}

const nick = 'smoke-' + Math.random().toString(36).slice(2, 8);
const join = await fetch(target + '/api/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ nickname: nick })
});
const joined = await join.json();
check('加入房间 /api/join => ok', join.status === 200 && joined.ok === true, JSON.stringify(joined).slice(0, 160));
check('下发身份凭证', typeof joined.sessionToken === 'string' && joined.sessionToken.length >= 16, `tokenLen=${(joined.sessionToken || '').length}`);

if (joined.sessionToken) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  let snapshots = 0;
  let first = null;
  try {
    const stream = await fetch(target + '/api/stream?sid_token=' + encodeURIComponent(joined.sessionToken), { signal: controller.signal });
    check('SSE /api/stream => 200', stream.status === 200, `status=${stream.status} type=${stream.headers.get('content-type')}`);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (snapshots < 3) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
        const line = chunk.split('\n').find(l => l.startsWith('data: '));
        if (!line) continue;
        const payload = JSON.parse(line.slice(6));
        if (payload.type === 'snapshot') { snapshots++; first = first || payload; }
      }
    }
    reader.cancel().catch(() => { });
  } catch (error) {
    if (error.name !== 'AbortError') check('SSE 读取', false, String(error.message));
  } finally { clearTimeout(timer); }
  check('SSE 推送快照 >= 3 帧', snapshots >= 3, `frames=${snapshots}`);
  check('快照含自身身份与规则', !!(first && first.me && first.rules), JSON.stringify(first && first.rules));
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
