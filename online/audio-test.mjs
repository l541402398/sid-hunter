import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const AUDIO = require('./public/js/core/audio.js');
const { staticServe } = require('./server/http-util.js');

function serve(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    let status = 0, resHeaders = {};
    const res = {
      writeHead(code, h) { status = code; resHeaders = h || {}; },
      end(body) { resolve({ status, headers: resHeaders, body: Buffer.isBuffer(body) ? body : Buffer.from(body || '') }); }
    };
    try {
      staticServe({ method: 'GET', url: pathname, headers }, res, pathname);
    } catch (err) {
      reject(err);
    }
  });
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log('PASS', name);
}

await check('1. All 5 soothing BGM tracks & 37 SFX assets exist with valid headers and provenance', async () => {
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-oga-bgm/SOURCE-README.txt')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-kenney-sfx/SOURCE-README.txt')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-kenney-sfx/License.txt')));
  assert.equal(AUDIO.BGM_PLAYLIST.length, 5);

  for (const track of AUDIO.BGM_PLAYLIST) {
    const file = path.join(PUBLIC_DIR, track.url.replace(/^\/+/, ''));
    assert.ok(fs.existsSync(file), `Missing BGM track ${track.id}: ${file}`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 500_000, `BGM ${track.id} unexpectedly small: ${buf.length}`);
    const isId3 = buf.subarray(0, 3).toString('ascii') === 'ID3';
    const isMpegSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    assert.ok(isId3 || isMpegSync, `BGM ${track.id} does not look like a valid MP3`);
  }

  const uniqueFiles = new Set();
  for (const [name, spec] of Object.entries(AUDIO.SFX_CATALOG)) {
    assert.ok(Array.isArray(spec.files) && spec.files.length >= 1, `SFX ${name} missing files`);
    for (const rel of spec.files) {
      uniqueFiles.add(rel);
      const file = path.join(PUBLIC_DIR, 'assets/vendor/audio-kenney-sfx', rel);
      assert.ok(fs.existsSync(file), `Missing SFX ${name} -> ${rel}`);
      const buf = fs.readFileSync(file);
      assert.equal(buf.subarray(0, 4).toString('ascii'), 'OggS', `SFX ${rel} missing OggS header`);
    }
  }
  assert.ok(uniqueFiles.size >= 30, `Expected >= 30 curated Kenney SFX files, got ${uniqueFiles.size}`);
});

await check('2. Static server serves all playlist MP3s & OGGs with proper MIME and HTTP Range (206/416)', async () => {
  for (const track of AUDIO.BGM_PLAYLIST) {
    const res = await serve(track.url);
    assert.equal(res.status, 200, `Failed to serve ${track.url}`);
    assert.equal(res.headers['Content-Type'], 'audio/mpeg');
    assert.equal(res.headers['Accept-Ranges'], 'bytes');
    assert.equal(Number(res.headers['Content-Length']), res.body.length);
  }

  const first = AUDIO.BGM_PLAYLIST[0].url;
  const full = await serve(first);
  const partial = await serve(first, { range: 'bytes=0-1023' });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers['Content-Range'], `bytes 0-1023/${full.body.length}`);
  assert.equal(partial.body.length, 1024);
  assert.deepEqual(partial.body, full.body.subarray(0, 1024));

  const badRange = await serve(first, { range: 'bytes=99999999-' });
  assert.equal(badRange.status, 416);

  const sfx = await serve('/assets/vendor/audio-kenney-sfx/chop.ogg');
  assert.equal(sfx.status, 200);
  assert.equal(sfx.headers['Content-Type'], 'audio/ogg');
});

function createMockEnv({ supportsOgg = true, pathname = '/', subframe = false } = {}) {
  const store = new Map();
  const createdAudio = [];
  let clock = 1000;
  let synthOscCount = 0;

  class MockAudio {
    constructor(src = '') {
      this.src = src;
      this.loop = false;
      this.preload = '';
      this.volume = 1;
      this.currentTime = 0;
      this.paused = true;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this._listeners = new Map();
      if (src) createdAudio.push(this);
    }
    addEventListener(type, fn) {
      if (!this._listeners.has(type)) this._listeners.set(type, []);
      this._listeners.get(type).push(fn);
    }
    emit(type) {
      for (const fn of (this._listeners.get(type) || [])) fn();
    }
    canPlayType(type) {
      if (type.includes('ogg')) return supportsOgg ? 'probably' : '';
      return 'probably';
    }
    play() {
      this.paused = false;
      this.playCalls++;
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
      this.pauseCalls++;
    }
  }

  class MockAudioContext {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = {};
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {}
      };
    }
    createOscillator() {
      synthOscCount++;
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {}
      };
    }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    createBiquadFilter() { return { type: 'bandpass', frequency: { value: 1000 }, connect() {} }; }
  }

  const env = {
    Audio: MockAudio,
    AudioContext: MockAudioContext,
    performance: { now: () => clock },
    location: { pathname },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v))
    },
    addEventListener() {},
    document: { hidden: false, addEventListener() {} }
  };
  env.parent = subframe ? {} : env;

  return {
    env,
    createdAudio,
    store,
    advance(ms) { clock += ms; },
    getSynthCount: () => synthOscCount
  };
}

await check('3. Default list loop auto-advances on ended & wraps around; single mode sets loop=true', async () => {
  const m = createMockEnv();
  const engine = AUDIO.createEngine(m.env);

  engine.setBgm('game');
  assert.equal(m.createdAudio.length, 0, 'Should not play before user unlock');

  engine.unlock();
  assert.equal(engine.getState().playMode, 'list');
  assert.equal(engine.getState().activeTrackId, 'chill-lofi');
  const firstEl = m.createdAudio[0];
  assert.match(firstEl.src, /bgm-chill-lofi\.mp3$/);
  assert.equal(firstEl.loop, false, 'List mode must keep el.loop=false so ended fires');
  assert.equal(firstEl.paused, false);

  // Track 1 ends -> auto-advances to Track 2 (warm-fireplace)
  firstEl.emit('ended');
  assert.equal(engine.getState().activeTrackId, 'warm-fireplace');
  const secondEl = m.createdAudio.find(e => e.src.endsWith('bgm-warm-fireplace.mp3'));
  assert.ok(secondEl && !secondEl.paused);
  assert.equal(firstEl.paused, true);

  // Jump to last track (bluebonnet), emit ended -> wraps around to Track 1 (chill-lofi)
  engine.selectTrack('bluebonnet');
  const lastEl = m.createdAudio.find(e => e.src.endsWith('bgm-bluebonnet.mp3'));
  assert.ok(lastEl && !lastEl.paused);
  lastEl.emit('ended');
  assert.equal(engine.getState().activeTrackId, 'chill-lofi');
  assert.equal(firstEl.paused, false);

  // Manual next/prev & single-track loop mode
  engine.prevTrack();
  assert.equal(engine.getState().activeTrackId, 'bluebonnet');
  engine.nextTrack();
  assert.equal(engine.getState().activeTrackId, 'chill-lofi');
  engine.togglePlayMode();
  assert.equal(engine.getState().playMode, 'single');
  assert.equal(firstEl.loop, true);
  assert.equal(JSON.parse(m.store.get(AUDIO.STORAGE_KEY)).playMode, 'single');
  engine.dispose();
});

await check('4. Game and Annual Review use distinct soothing tracks and preserve game playback position', async () => {
  const m = createMockEnv();
  const engine = AUDIO.createEngine(m.env);
  engine.setBgm('game');
  engine.unlock();

  const gameEl = m.createdAudio.find(e => e.src.endsWith('bgm-chill-lofi.mp3'));
  assert.ok(gameEl);
  gameEl.currentTime = 38.5;

  // Opening Annual Review switches to first-light piano
  engine.setBgm('annual');
  assert.equal(engine.getState().activeTrackId, 'first-light');
  const annualEl = m.createdAudio.find(e => e.src.endsWith('bgm-first-light.mp3'));
  assert.ok(annualEl && !annualEl.paused);
  assert.equal(gameEl.paused, true);

  // Returning to game resumes chill-lofi at 38.5s
  engine.setBgm('game');
  assert.equal(engine.getState().activeTrackId, 'chill-lofi');
  assert.equal(annualEl.paused, true);
  assert.equal(gameEl.paused, false);
  assert.equal(gameEl.currentTime, 38.5);

  // If game is already playing first-light, Annual Review picks bluebonnet to stay distinct
  engine.selectTrack('first-light');
  engine.setBgm('annual');
  assert.equal(engine.getState().activeTrackId, 'bluebonnet');
  engine.dispose();
});

await check('5. SFX throttling, multi-variant bookFlip, Safari fallback, and tutorial BGM suppression', async () => {
  const m = createMockEnv({ supportsOgg: true });
  const engine = AUDIO.createEngine(m.env);
  engine.unlock();

  assert.equal(engine.play('wheelTick'), true);
  m.advance(10);
  assert.equal(engine.play('wheelTick'), false);
  m.advance(30);
  assert.equal(engine.play('wheelTick'), true);

  const played = [];
  for (let i = 0; i < 6; i++) {
    m.advance(150);
    const before = m.createdAudio.length;
    assert.equal(engine.play('bookFlip'), true);
    played.push(m.createdAudio[before].src);
  }
  for (let i = 1; i < played.length; i++) assert.notEqual(played[i], played[i - 1]);
  engine.dispose();

  const safari = createMockEnv({ supportsOgg: false });
  const sEngine = AUDIO.createEngine(safari.env);
  sEngine.unlock();
  assert.equal(sEngine.play('bonkHit'), true);
  assert.equal(sEngine.play('assassinateHit'), true);
  assert.ok(safari.getSynthCount() >= 2);
  sEngine.dispose();

  const tut = createMockEnv({ pathname: '/tutorial/index.html', subframe: true });
  const tEngine = AUDIO.createEngine(tut.env);
  tEngine.setBgm('game');
  tEngine.unlock();
  assert.equal(tut.createdAudio.length, 0, 'Tutorial iframe must not start duplicate BGM');
  assert.equal(tEngine.play('bonkHit'), true);
  tEngine.dispose();
});

console.log(`ALL ${passed} AUDIO TESTS PASSED.`);
