'use strict';
// 统一音频引擎（零外部依赖）：
//   · 背景音乐（BGM）：游戏大厅（爵士轻音）与年度纪念册（暖光竖琴）双轨平滑淡入淡出，切页自动暂停/恢复；
//   · 动效音效（SFX）：优先 Web Audio 解码 Kenney CC0 音效池（支持高频重叠，如大转盘哒哒刻度与连敲），
//     遇到不支持 OGG Vorbis 的浏览器（如部分 Safari/iOS）自动降级为柔和的 Web Audio 合成音效；
//   · 静音与音量偏好持久化于 localStorage，游戏主页、年度纪念册与新手训练室共享同一份配置。
(function (root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SID = root.SID || {}; root.SID.audio = api; }
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  const STORAGE_KEY = 'sid-audio-prefs-v1';
  const BGM_BASE = '/assets/vendor/audio-oga-bgm/';
  const SFX_BASE = '/assets/vendor/audio-kenney-sfx/';
  const FADE_MS = 650;

  const BGM_TRACKS = Object.freeze({
    game: Object.freeze({
      url: BGM_BASE + 'bgm-game.mp3',
      gain: 0.82,
      label: '办公大厅 · 爵士轻音'
    }),
    annual: Object.freeze({
      url: BGM_BASE + 'bgm-annual.mp3',
      gain: 1.0,
      label: '年度纪念册 · 暖光竖琴'
    })
  });

  const SFX_CATALOG = Object.freeze({
    bonkSwing:       { files: ['cloth1.ogg'], gain: 0.58, minGap: 80, synth: 'whoosh' },
    bonkHit:         { files: ['chop.ogg'], gain: 0.9, minGap: 60, synth: 'bonk' },
    bonkStunned:     { files: ['bong_001.ogg'], gain: 0.78, minGap: 180, synth: 'boing' },
    assassinateHit:  { files: ['knifeSlice.ogg'], gain: 0.84, minGap: 140, synth: 'slice' },
    assassinateMiss: { files: ['drawKnife1.ogg'], gain: 0.72, minGap: 140, synth: 'metallic' },
    accuseHit:       { files: ['jingles_STEEL16.ogg'], gain: 0.82, minGap: 200, synth: 'fanfare' },
    accuseWrong:     { files: ['error_005.ogg'], gain: 0.78, minGap: 180, synth: 'buzz' },
    truce:           { files: ['jingles_HIT00.ogg'], gain: 0.74, minGap: 300, synth: 'truce' },
    skillConfirm:    { files: ['select_006.ogg'], gain: 0.56, minGap: 80, synth: 'click' },
    rpsInvite:       { files: ['question_002.ogg'], gain: 0.68, minGap: 240, synth: 'chime' },
    rpsChoose:       { files: ['card-place-1.ogg'], gain: 0.76, minGap: 60, synth: 'snap' },
    rpsWin:          { files: ['jingles_SAX10.ogg'], gain: 0.8, minGap: 240, synth: 'fanfare' },
    rpsLose:         { files: ['jingles_SAX07.ogg'], gain: 0.74, minGap: 240, synth: 'down' },
    rpsDraw:         { files: ['confirmation_001.ogg'], gain: 0.66, minGap: 240, synth: 'chime' },
    wheelTick:       { files: ['tick_001.ogg'], gain: 0.52, minGap: 35, synth: 'tick' },
    wheelWin:        { files: ['jingles_PIZZA10.ogg'], gain: 0.78, minGap: 240, synth: 'fanfare' },
    containerOpen:   { files: ['metalLatch.ogg'], gain: 0.66, minGap: 120, synth: 'latch' },
    lootPoints:      { files: ['handleCoins.ogg'], gain: 0.8, minGap: 140, synth: 'coins' },
    lootEmpty:       { files: ['drop_002.ogg'], gain: 0.62, minGap: 140, synth: 'plop' },
    quizStart:       { files: ['question_003.ogg'], gain: 0.68, minGap: 140, synth: 'chime' },
    quizSelect:      { files: ['click_003.ogg'], gain: 0.56, minGap: 50, synth: 'tick' },
    quizCorrect:     { files: ['confirmation_002.ogg'], gain: 0.8, minGap: 140, synth: 'coins' },
    quizWrong:       { files: ['error_003.ogg'], gain: 0.72, minGap: 140, synth: 'buzz' },
    elevatorClose:   { files: ['doorClose_1.ogg'], gain: 0.62, minGap: 200, synth: 'door' },
    elevatorArrive:  { files: ['glass_005.ogg'], gain: 0.74, minGap: 240, synth: 'ding' },
    roomDoor:        { files: ['doorOpen_1.ogg'], gain: 0.62, minGap: 200, synth: 'door' },
    flowerCelebrate: { files: ['jingles_STEEL10.ogg'], gain: 0.8, minGap: 350, synth: 'sparkle' },
    prizeDrop:       { files: ['jingles_STEEL02.ogg'], gain: 0.86, minGap: 400, synth: 'fanfare' },
    cluePublish:     { files: ['glass_004.ogg'], gain: 0.64, minGap: 400, synth: 'ding' },
    bookOpen:        { files: ['bookOpen.ogg'], gain: 0.72, minGap: 160, synth: 'page' },
    bookFlip:        { files: ['bookFlip1.ogg', 'bookFlip2.ogg', 'bookFlip3.ogg'], gain: 0.68, minGap: 100, synth: 'page' },
    bookClose:       { files: ['bookClose.ogg'], gain: 0.72, minGap: 160, synth: 'page' },
    uiClick:         { files: ['pluck_002.ogg'], gain: 0.48, minGap: 60, synth: 'tick' },
    chipsClink:      { files: ['chips-collide-1.ogg'], gain: 0.68, minGap: 80, synth: 'coins' },
    cardSlide:       { files: ['card-slide-1.ogg'], gain: 0.72, minGap: 80, synth: 'snap' }
  });

  const DEFAULTS = Object.freeze({
    muted: false,
    bgmEnabled: true,
    sfxEnabled: true,
    bgmVolume: 0.34,
    sfxVolume: 0.78
  });

  function clamp01(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  }

  function sanitizePrefs(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      muted: typeof src.muted === 'boolean' ? src.muted : DEFAULTS.muted,
      bgmEnabled: typeof src.bgmEnabled === 'boolean' ? src.bgmEnabled : DEFAULTS.bgmEnabled,
      sfxEnabled: typeof src.sfxEnabled === 'boolean' ? src.sfxEnabled : DEFAULTS.sfxEnabled,
      bgmVolume: clamp01(src.bgmVolume, DEFAULTS.bgmVolume),
      sfxVolume: clamp01(src.sfxVolume, DEFAULTS.sfxVolume)
    };
  }

  function loadPrefs(storage) {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return sanitizePrefs(JSON.parse(raw));
    } catch {
      return { ...DEFAULTS };
    }
  }

  function savePrefs(storage, prefs) {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* ignore quota / private mode */ }
  }

  function createEngine(env = root) {
    const doc = env?.document || null;
    const storage = (() => { try { return env?.localStorage || null; } catch { return null; } })();
    const hasAudio = typeof env?.Audio === 'function';
    const AudioCtx = env?.AudioContext || env?.webkitAudioContext || null;

    // 独立新手训练室嵌入在 iframe 中时，不重复起第二路 BGM，仅播放交互 SFX。
    const isSubframe = (() => {
      try { return !!(env && env.parent && env.parent !== env); } catch { return false; }
    })();
    const bgmDisabledByFrame = isSubframe && /\/tutorial\//.test(String(env?.location?.pathname || ''));

    let prefs = loadPrefs(storage);
    let desiredTrack = null; // 'game' | 'annual' | null
    let unlocked = false;
    let hiddenPaused = false;
    let ctx = null;
    let fadeRaf = 0;
    let listeners = new Set();

    const tracks = {}; // name -> { el, vol, target, from, startAt, dur, fadingOut }
    const bufferCache = new Map(); // file -> AudioBuffer | null
    const bufferPending = new Map(); // file -> Promise
    const lastPlayAt = new Map(); // sfxName -> ms
    const lastVariant = new Map(); // sfxName -> index
    const timers = new Set();

    const supportsOgg = (() => {
      if (!hasAudio) return false;
      try {
        const probe = new env.Audio();
        return !!(probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') !== '');
      } catch {
        return false;
      }
    })();

    function nowMs() {
      return typeof env?.performance?.now === 'function' ? env.performance.now() : Date.now();
    }

    function isBgmAudible() {
      return !bgmDisabledByFrame && !prefs.muted && prefs.bgmEnabled && prefs.bgmVolume > 0.001;
    }

    function isSfxAudible() {
      return !prefs.muted && prefs.sfxEnabled && prefs.sfxVolume > 0.001;
    }

    function targetVolumeFor(name) {
      const def = BGM_TRACKS[name];
      if (!def || !isBgmAudible() || hiddenPaused || desiredTrack !== name) return 0;
      return Math.max(0, Math.min(1, prefs.bgmVolume * def.gain));
    }

    function ensureTrack(name) {
      if (!BGM_TRACKS[name] || !hasAudio || bgmDisabledByFrame) return null;
      if (!tracks[name]) {
        const el = new env.Audio(BGM_TRACKS[name].url);
        el.loop = true;
        el.preload = 'none';
        el.volume = 0;
        tracks[name] = { el, vol: 0, target: 0, from: 0, startAt: 0, dur: 0 };
      }
      return tracks[name];
    }

    function stopFadeLoop() {
      if (fadeRaf && typeof env?.cancelAnimationFrame === 'function') {
        env.cancelAnimationFrame(fadeRaf);
      }
      fadeRaf = 0;
    }

    function stepFade() {
      fadeRaf = 0;
      const now = nowMs();
      let active = false;
      for (const name of Object.keys(tracks)) {
        const t = tracks[name];
        if (!t) continue;
        const p = t.dur > 0 ? Math.min(1, (now - t.startAt) / t.dur) : 1;
        // 余弦缓入缓出，听感更自然。
        const eased = p >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * p);
        const nextVol = t.from + (t.target - t.from) * eased;
        t.vol = Math.max(0, Math.min(1, nextVol));
        try { t.el.volume = t.vol; } catch {}
        if (p < 1) {
          active = true;
        } else if (t.target <= 0.0005 && !t.el.paused) {
          try { t.el.pause(); } catch {}
        }
      }
      if (active && typeof env?.requestAnimationFrame === 'function') {
        fadeRaf = env.requestAnimationFrame(stepFade);
      }
    }

    function scheduleFade(name, target, dur = FADE_MS) {
      const t = tracks[name];
      if (!t) return;
      const now = nowMs();
      t.from = t.vol;
      t.target = Math.max(0, Math.min(1, target));
      t.startAt = now;
      t.dur = Math.max(0, dur);
      if (t.dur === 0 || typeof env?.requestAnimationFrame !== 'function') {
        t.vol = t.target;
        try { t.el.volume = t.vol; } catch {}
        if (t.target <= 0.0005 && !t.el.paused) { try { t.el.pause(); } catch {} }
        return;
      }
      if (!fadeRaf) fadeRaf = env.requestAnimationFrame(stepFade);
    }

    function syncBgm(opts = {}) {
      const dur = typeof opts.fadeMs === 'number' ? opts.fadeMs : FADE_MS;
      const resetTarget = !!opts.restart;
      for (const name of Object.keys(BGM_TRACKS)) {
        const isDesired = name === desiredTrack;
        const wanted = targetVolumeFor(name);
        if (!isDesired && !tracks[name]) continue;
        if (wanted > 0 && unlocked) {
          const t = ensureTrack(name);
          if (!t) continue;
          if (resetTarget) {
            try { t.el.currentTime = 0; } catch {}
          }
          if (t.el.paused) {
            try {
              const p = t.el.play();
              if (p && typeof p.then === 'function') {
                p.then(() => {
                  scheduleFade(name, targetVolumeFor(name), dur);
                }).catch(() => {
                  // 浏览器尚未解锁自动播放：静默等待下一次用户手势，不抛异常。
                  unlocked = false;
                });
              }
            } catch {
              unlocked = false;
            }
          }
          scheduleFade(name, wanted, dur);
        } else if (tracks[name]) {
          scheduleFade(name, 0, isDesired && !isBgmAudible() ? 180 : Math.min(dur, 480));
        }
      }
    }

    function setBgm(trackName, opts = {}) {
      const next = trackName && BGM_TRACKS[trackName] ? trackName : null;
      const changed = next !== desiredTrack;
      desiredTrack = next;
      // 切到年度纪念册时总是从温暖前奏开始；切回游戏大厅时续播上次进度，衔接更自然。
      const restart = typeof opts.restart === 'boolean' ? opts.restart : (changed && next === 'annual');
      syncBgm({ fadeMs: opts.fadeMs, restart });
      if (changed) emit();
      return desiredTrack;
    }

    function ensureContext() {
      if (!AudioCtx) return null;
      if (!ctx) {
        try { ctx = new AudioCtx(); } catch { return null; }
      }
      if (ctx.state === 'suspended') {
        try { ctx.resume().catch(() => {}); } catch {}
      }
      return ctx;
    }

    function unlock() {
      const wasUnlocked = unlocked;
      unlocked = true;
      ensureContext();
      if (!wasUnlocked || (desiredTrack && isBgmAudible() && (!tracks[desiredTrack] || tracks[desiredTrack].el.paused))) {
        syncBgm({ fadeMs: wasUnlocked ? 350 : 750 });
      }
      if (!wasUnlocked) emit();
    }

    function loadSfxBuffer(file) {
      if (bufferCache.has(file)) return Promise.resolve(bufferCache.get(file));
      if (bufferPending.has(file)) return bufferPending.get(file);
      const audioCtx = ensureContext();
      if (!audioCtx || typeof env?.fetch !== 'function') return Promise.resolve(null);
      const task = env.fetch(SFX_BASE + file, { credentials: 'same-origin' })
        .then(res => (res && res.ok ? res.arrayBuffer() : null))
        .then(arr => (arr ? audioCtx.decodeAudioData(arr.slice(0)) : null))
        .then(buf => { bufferCache.set(file, buf || null); return buf || null; })
        .catch(() => { bufferCache.set(file, null); return null; })
        .finally(() => { bufferPending.delete(file); });
      bufferPending.set(file, task);
      return task;
    }

    function playBuffer(buf, volume) {
      const audioCtx = ensureContext();
      if (!audioCtx || !buf) return false;
      try {
        const src = audioCtx.createBufferSource();
        const gain = audioCtx.createGain();
        src.buffer = buf;
        gain.gain.value = Math.max(0, Math.min(1, volume));
        src.connect(gain);
        gain.connect(audioCtx.destination);
        src.start(0);
        return true;
      } catch {
        return false;
      }
    }

    // 针对 Safari/iOS（不支持 OGG Vorbis）或音频缓冲尚未解码就绪时的柔和 Web Audio 兜底合成器。
    function playSynth(kind, volume) {
      const audioCtx = ensureContext();
      if (!audioCtx) return false;
      try {
        const t = audioCtx.currentTime;
        const master = audioCtx.createGain();
        master.gain.value = Math.max(0, Math.min(0.6, volume * 0.55));
        master.connect(audioCtx.destination);

        const tone = (freq, start, dur, type = 'triangle', peak = 1, endFreq = null) => {
          const osc = audioCtx.createOscillator();
          const g = audioCtx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, t + start);
          if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + start + dur);
          g.gain.setValueAtTime(0.0001, t + start);
          g.gain.linearRampToValueAtTime(peak, t + start + Math.min(0.015, dur * 0.25));
          g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
          osc.connect(g);
          g.connect(master);
          osc.start(t + start);
          osc.stop(t + start + dur + 0.02);
        };

        const noise = (start, dur, filterHz = 1200, peak = 0.5) => {
          const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
          const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
          const ch = buf.getChannelData(0);
          for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
          const src = audioCtx.createBufferSource();
          src.buffer = buf;
          const filter = audioCtx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = filterHz;
          const g = audioCtx.createGain();
          g.gain.setValueAtTime(peak, t + start);
          g.gain.exponentialRampToValueAtTime(0.0001, t + start + dur);
          src.connect(filter);
          filter.connect(g);
          g.connect(master);
          src.start(t + start);
        };

        switch (kind) {
          case 'bonk':
            tone(260, 0, 0.14, 'triangle', 1, 92);
            noise(0, 0.05, 900, 0.45);
            break;
          case 'whoosh':
            noise(0, 0.12, 700, 0.4);
            break;
          case 'boing':
            tone(220, 0, 0.24, 'sine', 0.9, 390);
            break;
          case 'slice':
            noise(0, 0.12, 3200, 0.7);
            tone(1100, 0, 0.11, 'sawtooth', 0.35, 260);
            break;
          case 'metallic':
            tone(740, 0, 0.11, 'triangle', 0.55, 520);
            break;
          case 'fanfare':
            tone(523.25, 0, 0.14, 'triangle', 0.75);
            tone(659.25, 0.09, 0.14, 'triangle', 0.8);
            tone(783.99, 0.18, 0.24, 'triangle', 0.9);
            break;
          case 'sparkle':
            tone(587.33, 0, 0.16, 'sine', 0.65);
            tone(783.99, 0.07, 0.18, 'sine', 0.7);
            tone(987.77, 0.14, 0.28, 'sine', 0.75);
            break;
          case 'coins':
            tone(987.77, 0, 0.09, 'sine', 0.7);
            tone(1318.5, 0.07, 0.18, 'sine', 0.8);
            break;
          case 'buzz':
            tone(190, 0, 0.16, 'sawtooth', 0.45, 130);
            break;
          case 'truce':
            tone(330, 0, 0.16, 'triangle', 0.7, 220);
            tone(220, 0.14, 0.24, 'triangle', 0.7, 146.8);
            break;
          case 'down':
            tone(440, 0, 0.12, 'triangle', 0.65, 349.2);
            tone(349.2, 0.11, 0.18, 'triangle', 0.65, 261.6);
            break;
          case 'ding':
            tone(1046.5, 0, 0.32, 'sine', 0.7);
            tone(1567.98, 0.02, 0.22, 'sine', 0.35);
            break;
          case 'page':
            noise(0, 0.14, 1800, 0.35);
            break;
          case 'door':
          case 'latch':
            tone(180, 0, 0.08, 'triangle', 0.55, 110);
            noise(0.01, 0.06, 1200, 0.3);
            break;
          case 'snap':
            noise(0, 0.04, 2200, 0.5);
            tone(420, 0, 0.05, 'triangle', 0.45, 210);
            break;
          case 'tick':
            tone(880, 0, 0.032, 'triangle', 0.5, 520);
            break;
          case 'plop':
            tone(360, 0, 0.1, 'sine', 0.6, 170);
            break;
          default:
            tone(660, 0, 0.08, 'sine', 0.55, 780);
            break;
        }
        return true;
      } catch {
        return false;
      }
    }

    function pickFile(name, spec) {
      if (spec.files.length === 1) return spec.files[0];
      const prev = lastVariant.get(name);
      let idx = Math.floor(Math.random() * spec.files.length);
      if (idx === prev) idx = (idx + 1) % spec.files.length;
      lastVariant.set(name, idx);
      return spec.files[idx];
    }

    function play(name, opts = {}) {
      const spec = SFX_CATALOG[name];
      if (!spec || !isSfxAudible()) return false;
      const delayMs = Math.max(0, Number(opts.delayMs) || 0);
      if (delayMs > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          play(name, { ...opts, delayMs: 0 });
        }, delayMs);
        timers.add(timer);
        return true;
      }
      const t = nowMs();
      const prev = lastPlayAt.get(name) || -Infinity;
      if (t - prev < (spec.minGap || 0)) return false;
      lastPlayAt.set(name, t);

      const volume = Math.max(0, Math.min(1, prefs.sfxVolume * spec.gain * (Number(opts.gain) || 1)));
      if (volume <= 0.001) return false;

      if (!supportsOgg) {
        return playSynth(spec.synth, volume);
      }

      const file = pickFile(name, spec);
      const cached = bufferCache.get(file);
      if (cached) {
        if (playBuffer(cached, volume)) return true;
      }
      if (AudioCtx && typeof env?.fetch === 'function') {
        loadSfxBuffer(file).then(buf => {
          if (buf && isSfxAudible()) playBuffer(buf, volume);
          else if (!buf && isSfxAudible()) playSynth(spec.synth, volume);
        });
        return true;
      }
      if (hasAudio) {
        try {
          const el = new env.Audio(SFX_BASE + file);
          el.volume = volume;
          const p = el.play();
          if (p && typeof p.catch === 'function') p.catch(() => {});
          return true;
        } catch {
          return playSynth(spec.synth, volume);
        }
      }
      return false;
    }

    function updatePrefs(patch) {
      prefs = sanitizePrefs({ ...prefs, ...(patch || {}) });
      savePrefs(storage, prefs);
      if (!prefs.muted && prefs.bgmEnabled) unlocked = true;
      syncBgm({ fadeMs: 260 });
      emit();
      return getState();
    }

    function toggleMute() {
      unlocked = true;
      return updatePrefs({ muted: !prefs.muted });
    }

    function getState() {
      return {
        ...prefs,
        track: desiredTrack,
        trackLabel: desiredTrack && BGM_TRACKS[desiredTrack] ? BGM_TRACKS[desiredTrack].label : '',
        unlocked,
        bgmAudible: isBgmAudible(),
        sfxAudible: isSfxAudible()
      };
    }

    function subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    }

    function emit() {
      const snap = getState();
      for (const fn of listeners) {
        try { fn(snap); } catch {}
      }
    }

    function bindControls() {
      if (!doc) return;
      const toggle = doc.getElementById('audio-toggle');
      const popover = doc.getElementById('audio-popover');
      if (!toggle || !popover) return;
      const muteBtn = doc.getElementById('audio-mute-btn');
      const bgmToggle = doc.getElementById('audio-bgm-toggle');
      const bgmSlider = doc.getElementById('audio-bgm-volume');
      const bgmVal = doc.getElementById('audio-bgm-val');
      const sfxToggle = doc.getElementById('audio-sfx-toggle');
      const sfxSlider = doc.getElementById('audio-sfx-volume');
      const sfxVal = doc.getElementById('audio-sfx-val');
      const trackLabel = doc.getElementById('audio-track-label');

      const syncUI = (st) => {
        const silent = st.muted || (!st.bgmEnabled && !st.sfxEnabled);
        toggle.dataset.muted = String(silent);
        toggle.setAttribute('aria-pressed', String(!popover.hidden));
        toggle.setAttribute('aria-label', silent ? '声音设置（当前已静音）' : '声音设置（背景音乐与音效）');
        toggle.title = silent ? '声音设置 · 当前已静音' : '声音设置 · 背景音乐与音效';
        if (muteBtn) {
          muteBtn.textContent = st.muted ? '🔊 恢复全部声音' : '🔇 一键静音';
          muteBtn.setAttribute('aria-pressed', String(st.muted));
        }
        if (bgmToggle) bgmToggle.checked = st.bgmEnabled && !st.muted;
        if (bgmSlider) {
          bgmSlider.value = String(Math.round(st.bgmVolume * 100));
          bgmSlider.disabled = st.muted || !st.bgmEnabled;
        }
        if (bgmVal) bgmVal.textContent = `${Math.round(st.bgmVolume * 100)}%`;
        if (sfxToggle) sfxToggle.checked = st.sfxEnabled && !st.muted;
        if (sfxSlider) {
          sfxSlider.value = String(Math.round(st.sfxVolume * 100));
          sfxSlider.disabled = st.muted || !st.sfxEnabled;
        }
        if (sfxVal) sfxVal.textContent = `${Math.round(st.sfxVolume * 100)}%`;
        if (trackLabel) trackLabel.textContent = st.trackLabel || '待播放';
      };

      const closePopover = (returnFocus = false) => {
        if (popover.hidden) return;
        popover.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-pressed', 'false');
        if (returnFocus) toggle.focus({ preventScroll: true });
      };

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        unlock();
        const opening = popover.hidden;
        popover.hidden = !opening;
        toggle.setAttribute('aria-expanded', String(opening));
        toggle.setAttribute('aria-pressed', String(opening));
        if (opening) play('uiClick');
      });

      if (muteBtn) muteBtn.addEventListener('click', () => {
        const st = toggleMute();
        if (!st.muted) play('uiClick');
      });
      if (bgmToggle) bgmToggle.addEventListener('change', () => {
        unlock();
        updatePrefs({ muted: false, bgmEnabled: bgmToggle.checked });
        play('uiClick');
      });
      if (bgmSlider) bgmSlider.addEventListener('input', () => {
        unlock();
        updatePrefs({ muted: false, bgmEnabled: true, bgmVolume: Number(bgmSlider.value) / 100 });
      });
      if (sfxToggle) sfxToggle.addEventListener('change', () => {
        unlock();
        updatePrefs({ muted: false, sfxEnabled: sfxToggle.checked });
        if (sfxToggle.checked) play('uiClick');
      });
      if (sfxSlider) sfxSlider.addEventListener('input', () => {
        unlock();
        updatePrefs({ muted: false, sfxEnabled: true, sfxVolume: Number(sfxSlider.value) / 100 });
      });
      if (sfxSlider) sfxSlider.addEventListener('change', () => { play('uiClick'); });

      doc.addEventListener('pointerdown', (e) => {
        if (!popover.hidden && !popover.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
          closePopover(false);
        }
      });
      doc.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.hidden) {
          e.preventDefault();
          e.stopPropagation();
          closePopover(true);
        }
      }, true);

      subscribe(syncUI);
      syncUI(getState());
    }

    function dispose() {
      stopFadeLoop();
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const t of Object.values(tracks)) {
        try { t.el.pause(); } catch {}
      }
      listeners.clear();
    }

    if (doc && env?.addEventListener) {
      const onGesture = () => { unlock(); };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
        env.addEventListener(ev, onGesture, { capture: true, passive: true });
      }
      doc.addEventListener('visibilitychange', () => {
        hiddenPaused = !!doc.hidden;
        syncBgm({ fadeMs: hiddenPaused ? 220 : 500 });
      });
      env.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        prefs = loadPrefs(storage);
        syncBgm({ fadeMs: 260 });
        emit();
      });
    }

    return {
      BGM_TRACKS,
      SFX_CATALOG,
      STORAGE_KEY,
      setBgm,
      play,
      unlock,
      updatePrefs,
      toggleMute,
      getState,
      subscribe,
      bindControls,
      dispose
    };
  }

  const instance = createEngine(root);
  instance.createEngine = createEngine;
  return instance;
});
