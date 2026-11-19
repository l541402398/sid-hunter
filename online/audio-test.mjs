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

await check('1. All BGM & SFX assets exist on disk with valid headers and vendor provenance', async () => {
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-oga-bgm/SOURCE-README.txt')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-kenney-sfx/SOURCE-README.txt')));
  assert.ok(fs.existsSync(path.join(PUBLIC_DIR, 'assets/vendor/audio-kenney-sfx/License.txt')));

  for (const [key, track] of Object.entries(AUDIO.BGM_TRACKS)) {
    const file = path.join(PUBLIC_DIR, track.url.replace(/^\/+/, ''));
    assert.ok(fs.existsSync(file), `Missing BGM track ${key}: ${file}`);
    const buf = fs.readFileSync(file);
    assert.ok(buf.length > 100_000, `BGM ${key} unexpectedly tiny: ${buf.length}`);
    const isId3 = buf.subarray(0, 3).toString('ascii') === 'ID3';
    const isMpegSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;
    assert.ok(isId3 || isMpegSync, `BGM ${key} does not look like a valid MP3`);
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

await check('2. Static server serves MP3/OGG with proper MIME types and HTTP Range (206/416)', async () => {
  const gameBgm = await serve('/assets/vendor/audio-oga-bgm/bgm-game.mp3');
  assert.equal(gameBgm.status, 200);
  assert.equal(gameBgm.headers['Content-Type'], 'audio/mpeg');
  assert.equal(gameBgm.headers['Accept-Ranges'], 'bytes');
  assert.equal(Number(gameBgm.headers['Content-Length']), gameBgm.body.length);

  const annualBgm = await serve('/assets/vendor/audio-oga-bgm/bgm-annual.mp3');
  assert.equal(annualBgm.status, 200);
  assert.equal(annualBgm.headers['Content-Type'], 'audio/mpeg');

  const partial = await serve('/assets/vendor/audio-oga-bgm/bgm-game.mp3', { range: 'bytes=0-1023' });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers['Content-Type'], 'audio/mpeg');
  assert.equal(partial.headers['Content-Range'], `bytes 0-1023/${gameBgm.body.length}`);
  assert.equal(partial.body.length, 1024);
  assert.deepEqual(partial.body, gameBgm.body.subarray(0, 1024));

  const badRange = await serve('/assets/vendor/audio-oga-bgm/bgm-game.mp3', { range: 'bytes=99999999-' });
  assert.equal(badRange.status, 416);

  const sfx = await serve('/assets/vendor/audio-kenney-sfx/chop.ogg');
  assert.equal(sfx.status, 200);
  assert.equal(sfx.headers['Content-Type'], 'audio/ogg');
  assert.equal(sfx.body.subarray(0, 4).toString('ascii'), 'OggS');
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
      if (src) createdAudio.push(this);
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

await check('3. BGM waits for unlock, switches between game and annual, and preserves game track position', async () => {
  const m = createMockEnv();
  const engine = AUDIO.createEngine(m.env);

  engine.setBgm('game');
  assert.equal(m.createdAudio.length, 0, 'Should not eagerly play before user unlock');

  engine.unlock();
  assert.equal(m.createdAudio.length, 1);
  const gameEl = m.createdAudio[0];
  assert.match(gameEl.src, /bgm-game\.mp3$/);
  assert.equal(gameEl.paused, false);
  assert.ok(gameEl.volume > 0);

  // Advance playback in game BGM, then open Annual Review
  gameEl.currentTime = 42.5;
  engine.setBgm('annual');
  assert.equal(m.createdAudio.length, 2);
  const annualEl = m.createdAudio[1];
  assert.match(annualEl.src, /bgm-annual\.mp3$/);
  assert.equal(annualEl.paused, false);
  assert.equal(annualEl.currentTime, 0);
  assert.equal(gameEl.paused, true);

  // Close Annual Review -> resume game BGM without resetting currentTime
  engine.setBgm('game');
  assert.equal(annualEl.paused, true);
  assert.equal(gameEl.paused, false);
  assert.equal(gameEl.currentTime, 42.5, 'Game BGM should resume where it paused');

  // Mute persists and pauses BGM
  engine.toggleMute();
  assert.equal(engine.getState().muted, true);
  assert.equal(gameEl.paused, true);
  assert.equal(JSON.parse(m.store.get(AUDIO.STORAGE_KEY)).muted, true);

  engine.toggleMute();
  assert.equal(engine.getState().muted, false);
  assert.equal(gameEl.paused, false);
  engine.dispose();
});

await check('4. SFX throttling, multi-variant bookFlip, and Safari OGG->WebAudio synth fallback', async () => {
  const m = createMockEnv({ supportsOgg: true });
  const engine = AUDIO.createEngine(m.env);
  engine.unlock();

  // Rapid wheelTick within minGap (35ms) should throttle
  assert.equal(engine.play('wheelTick'), true);
  m.advance(10);
  assert.equal(engine.play('wheelTick'), false);
  m.advance(30);
  assert.equal(engine.play('wheelTick'), true);

  // Book flip should never repeat the exact same variant twice in a row
  const played = [];
  for (let i = 0; i < 6; i++) {
    m.advance(150);
    const before = m.createdAudio.length;
    assert.equal(engine.play('bookFlip'), true);
    const el = m.createdAudio[before];
    played.push(el.src);
  }
  for (let i = 1; i < played.length; i++) {
    assert.notEqual(played[i], played[i - 1], 'bookFlip repeated same variant back-to-back');
  }
  engine.dispose();

  // Safari (no OGG support) falls back cleanly to Web Audio synth
  const safari = createMockEnv({ supportsOgg: false });
  const sEngine = AUDIO.createEngine(safari.env);
  sEngine.unlock();
  assert.equal(sEngine.play('bonkHit'), true);
  assert.equal(sEngine.play('assassinateHit'), true);
  assert.equal(sEngine.play('accuseHit'), true);
  assert.ok(safari.getSynthCount() >= 4, 'Safari fallback should synthesize SFX via Web Audio');
  sEngine.dispose();
});

await check('5. Tutorial iframe suppresses duplicate BGM while preserving SFX', async () => {
  const m = createMockEnv({ pathname: '/tutorial/index.html', subframe: true });
  const engine = AUDIO.createEngine(m.env);
  engine.setBgm('game');
  engine.unlock();
  assert.equal(m.createdAudio.length, 0, 'Tutorial iframe must not start a duplicate BGM');
  assert.equal(engine.play('bonkHit'), true, 'Tutorial iframe should still play SFX');
  assert.equal(m.createdAudio.length, 1);
  assert.match(m.createdAudio[0].src, /chop\.ogg$/);
  engine.dispose();
});

console.log(`ALL ${passed} AUDIO TESTS PASSED.`);
