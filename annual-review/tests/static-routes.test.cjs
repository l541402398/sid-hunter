'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { staticServe } = require('../../online/server/http-util.js');
const { FLOOR_SCALE } = require('../../online/shared/world/config.js');

const repo = path.resolve(__dirname, '../..');
const options = { timeout: 5000 };

// Exercise the real file handler without opening a socket or loading the game server.
function request(pathname) {
  return new Promise((resolve, reject) => {
    let status, headers;
    const res = {
      writeHead(code, values) {
        status = code;
        headers = values;
      },
      end(body) {
        resolve({ status, headers, body: Buffer.from(body || '') });
      }
    };
    try {
      staticServe({ method: 'GET', url: pathname, headers: {} }, res, pathname);
    } catch (error) {
      reject(error);
    }
  });
}

test('game homepage keeps the office canvas and annual review overlay', options, async () => {
  const response = await request('/');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  const html = response.body.toString('utf8');
  assert.match(html, /<canvas\b[^>]*\bid="office"/);
  assert.match(html, /<dialog\b[^>]*\bid="annual-review-overlay"/);
  assert.match(html, /<iframe\b[^>]*\bid="annual-review-frame"/);
});

test('annual review directory serves the book page', options, async () => {
  const response = await request('/annual-review/');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  const html = response.body.toString('utf8');
  assert.match(html, /<dialog\b[^>]*\bid="review-dialog"/);
  assert.match(html, /<script\b[^>]*\bsrc="app\.js"/);
  assert.doesNotMatch(html, /\bid="office"/);
});

test('annual review directory redirects to its trailing slash', options, async () => {
  const response = await request('/annual-review');
  assert.equal(response.status, 308);
  assert.equal(response.headers.Location, '/annual-review/');
  assert.equal(response.body.length, 0);
});

test('annual review SVG decorations use the SVG MIME type', options, async () => {
  const response = await request('/annual-review/assets/page-corner-nw.svg');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/svg+xml');
  assert.match(response.body.toString('utf8'), /<svg\b/);
});

test('percent-encoded spaces resolve an existing sports asset', options, async () => {
  const asset = 'assets/vendor/sports-kenney-sportsPack/PNG/Elements/element (1).png';
  const response = await request('/' + asset.replace(/ /g, '%20'));
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.deepEqual(response.body, await readFile(path.join(repo, 'online/public', asset)));
});

test('shared world config still injects the server floor scale', options, async () => {
  const sourcePath = path.join(repo, 'online/shared/world/config.js');
  const source = await readFile(sourcePath);
  const response = await request('/shared/world/config.js');
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/javascript; charset=utf-8');
  assert.deepEqual(
    response.body,
    Buffer.concat([Buffer.from(`window.__SID_FLOOR_SCALE__=${FLOOR_SCALE};\n`), source])
  );
  assert.deepEqual(await readFile(sourcePath), source);
});

for (const pathname of [
  '/annual-review/serve.cjs',
  '/annual-review/source.cjs',
  '/annual-review/README.md',
  '/annual-review/tests/reader.browser.mjs',
  '/annual-review/tests/static-routes.test.cjs',
  '/annual-review/assets/__missing-static-route__.png',
  '/assets/__missing-static-route__.png'
]) {
  test(`non-public or missing file returns 404: ${pathname}`, options, async () => {
    const response = await request(pathname);
    assert.equal(response.status, 404);
    assert.deepEqual(JSON.parse(response.body.toString('utf8')), { error: 'not found' });
  });
}

for (const pathname of ['/annual-review/%', '/annual-review/%E0%A4%A']) {
  test(`malformed URL encoding returns 400: ${pathname}`, options, async () => {
    const response = await request(pathname);
    assert.equal(response.status, 400);
    assert.deepEqual(JSON.parse(response.body.toString('utf8')), { error: 'invalid path' });
  });
}

for (const pathname of [
  '/annual-review/../online/server.js',
  '/annual-review/%2e%2e/online/server.js',
  '/annual-review/%2E%2E%2Fonline/server.js',
  '/annual-review/..\\online\\server.js',
  '/annual-review/%2e%2e%5conline%5cserver.js',
  '/annual-review/assets\\paper-grain.svg',
  '/annual-review/assets%5cpaper-grain.svg',
  '/annual-review/assets/paper-grain.svg\0',
  '/annual-review/assets/paper-grain.svg%00'
]) {
  test(`unsafe path returns 403: ${JSON.stringify(pathname)}`, options, async () => {
    const response = await request(pathname);
    assert.equal(response.status, 403);
    assert.deepEqual(JSON.parse(response.body.toString('utf8')), { error: 'forbidden' });
  });
}
