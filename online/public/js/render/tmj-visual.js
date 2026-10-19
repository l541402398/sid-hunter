'use strict';
// 游戏内 TMJ 画面层（零依赖）：把 tiled/floorN.tmj 的 ground/decor/objects/props 预渲染成一张
// 2880×800 的离屏 canvas，再按相机一次性 drawImage。只在 WORLD.TMJ.isEnabled() 时启用，
// 和权威碰撞使用同一张地图；不改变玩家/NPC/房间的绘制。
(function () {
  const SID = window.SID = window.SID || {};
  const state = {
    base: '/tiled',
    assetBase: '/assets/vendor/',
    files: {},
    imgs: {},
    tiles: {},
    caches: new Map(),
    ready: false,
    error: '',
    loading: null,
  };
  // 逐层光池：位置 0–1（相对 90×25 地图），颜色/半径/alpha。烘焙在地面层，props 和玩家压在上面。
  const AMBIENT = { 1: '#3fd0e0', 2: '#ffd27a', 3: '#ffb15a', 4: '#d8ff9a', 5: '#b07aff', 6: '#ffcf8a', 7: '#ff5ad0' };
  const LIGHT_POOLS = {
    1: [{ x: 0.5, y: 0.55, r: 0.30, color: '#3fd0e0', a: 0.12 }, { x: 0.18, y: 0.22, r: 0.22, color: '#9fd2ff', a: 0.09 }],
    2: [{ x: 0.25, y: 0.30, r: 0.32, color: '#ffd27a', a: 0.12 }, { x: 0.75, y: 0.30, r: 0.32, color: '#ffe9b0', a: 0.10 }],
    3: [{ x: 0.15, y: 0.22, r: 0.24, color: '#ffb15a', a: 0.13 }, { x: 0.55, y: 0.55, r: 0.26, color: '#ffd76a', a: 0.10 }, { x: 0.85, y: 0.30, r: 0.22, color: '#9fd2ff', a: 0.07 }],
    4: [{ x: 0.30, y: 0.25, r: 0.34, color: '#d8ff9a', a: 0.11 }, { x: 0.70, y: 0.55, r: 0.32, color: '#ffe9a0', a: 0.09 }],
    5: [{ x: 0.18, y: 0.30, r: 0.18, color: '#b07aff', a: 0.10 }, { x: 0.55, y: 0.60, r: 0.18, color: '#ff8a4c', a: 0.09 }, { x: 0.85, y: 0.30, r: 0.16, color: '#7fe3ff', a: 0.06 }],
    6: [{ x: 0.50, y: 0.15, r: 0.34, color: '#ffcf8a', a: 0.14 }, { x: 0.80, y: 0.55, r: 0.24, color: '#ff8a4c', a: 0.09 }],
    7: [{ x: 0.25, y: 0.30, r: 0.28, color: '#ff5ad0', a: 0.12 }, { x: 0.70, y: 0.45, r: 0.28, color: '#3fd0e0', a: 0.11 }, { x: 0.50, y: 0.75, r: 0.26, color: '#9b6bff', a: 0.08 }],
  };
  function rgba(hex, a) {
    const s = String(hex || '#ffffff').replace('#', '');
    const n = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function loadImg(src) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('asset ' + src));
      im.src = src;
    });
  }

  function scale() {
    return (window.WORLD && window.WORLD.FLOOR_SCALE) || 2;
  }

  async function load(base) {
    if (state.loading) return state.loading;
    if (base) state.base = base;
    state.loading = (async () => {
      try {
        const r = await fetch(`${state.base}/asset-files.json`, { cache: 'no-store' });
        if (r.ok) {
          const j = await r.json();
          state.files = j.files || {};
        }
      } catch { state.files = {}; }
      const jobs = [];
      for (let id = 1; id <= 7; id++) {
        jobs.push(loadImg(`${state.base}/tileset-floor${id}.png`).then((im) => { state.tiles[id] = im; }).catch(() => {}));
      }
      for (const [key, rel] of Object.entries(state.files)) {
        jobs.push(loadImg(state.assetBase + rel).then((im) => { state.imgs[key] = im; }).catch(() => {}));
      }
      await Promise.all(jobs);
      state.ready = true;
      try { window.dispatchEvent(new Event('tmj:visual-ready')); } catch { /* ignore */ }
      return true;
    })().catch((e) => {
      state.error = String(e && e.message || e);
      state.loading = null;
      return false;
    });
    return state.loading;
  }

  function tile(g, ts, gid, x, y, T) {
    if (!ts || !gid) return;
    const n = Math.max(0, Math.min(3, gid - 1));
    g.drawImage(ts, n * 16, 0, 16, 16, x * T, y * T, T, T);
  }

  function build(map, floorId) {
    const s = scale(), T = 16 * s, W = map.width, H = map.height;
    const cv = document.createElement('canvas');
    cv.width = W * T;
    cv.height = H * T;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    const pal = map.palette || [];
    const color = (i, fb) => pal[i] || fb;
    const ts = state.tiles[floorId];
    g.fillStyle = color(1, '#05070c');
    g.fillRect(0, 0, cv.width, cv.height);
    const edge = Math.max(2, Math.round(3 * s / 2));
    const inkW = Math.max(1, Math.round(s / 2));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const px = x * T, py = y * T;
        if (map.ground[i]) {
          if (ts) g.drawImage(ts, 0, 0, 16, 16, px, py, T, T);
          else { g.fillStyle = color(6, '#132838'); g.fillRect(px, py, T, T); }
          if (map.decor[i] === 3) {
            g.fillStyle = color(8, '#3fd0e0');
            g.globalAlpha = 0.30;
            g.fillRect(px, py, T, T);
            g.globalAlpha = 1;
          }
          if (map.objects[i] === 4) {
            g.fillStyle = color(9, '#ff8a4c');
            g.globalAlpha = 0.55;
            g.fillRect(px + 4 * s, py + 5 * s, 8 * s, 6 * s);
            g.globalAlpha = 1;
          }
        } else {
          // 墙：贴图顶面 + 底部侧壁 + 临地面描边，和 tiled/preview.html 的平面读法一致
          if (ts) g.drawImage(ts, 16, 0, 16, 16, px, py, T, T);
          else { g.fillStyle = color(4, '#2f6280'); g.fillRect(px, py, T, T); }
          g.fillStyle = color(3, '#1b3a52');
          g.fillRect(px, py + T - edge, T, edge);
          g.fillStyle = color(0, '#070d16');
          if (x > 0 && map.ground[i - 1]) g.fillRect(px, py, inkW, T);
          if (x < W - 1 && map.ground[i + 1]) g.fillRect(px + T - inkW, py, inkW, T);
          if (y > 0 && map.ground[i - W]) g.fillRect(px, py, T, inkW);
          if (y < H - 1 && map.ground[i + W]) g.fillRect(px, py + T - inkW, T, inkW);
        }
      }
    }
    const amb = AMBIENT[floorId];
    if (amb) {
      g.globalAlpha = 0.035; g.fillStyle = amb; g.fillRect(0, 0, cv.width, cv.height); g.globalAlpha = 1;
    }
    for (const l of (LIGHT_POOLS[floorId] || [])) {
      const cx = l.x * cv.width, cy = l.y * cv.height;
      const r = l.r * Math.min(cv.width, cv.height);
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      gr.addColorStop(0, rgba(l.color, l.a));
      gr.addColorStop(0.55, rgba(l.color, l.a * 0.42));
      gr.addColorStop(1, rgba(l.color, 0));
      g.fillStyle = gr;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    return cv;
  }

  function drawProp(g, p) {
    if (!p || p.kind === 'jamb') return false;
    const im = p.prop && state.imgs[p.prop];
    if (!im) return false;
    const s = scale();
    const px = p.x * s, py = p.y * s, pw = p.w * s, ph = p.h * s;
    const ps = (p.propScale || 1) * s;
    const w = im.width * ps, h = im.height * ps;
    g.drawImage(im, Math.round(px + pw / 2 - w / 2), Math.round(py + ph - h), w, h);
    return true;
  }

  function scene(map) {
    if (!map || !map.props) return [];
    return map.props.filter((p) => p.kind !== 'jamb' && p.prop);
  }

  function drawFloor(g, map, floorId) {
    if (!map || !state.ready) return false;
    let cv = state.caches.get(floorId);
    if (!cv) {
      cv = build(map, floorId);
      state.caches.set(floorId, cv);
    }
    g.drawImage(cv, 0, 0);
    return true;
  }

  function clear() {
    state.caches.clear();
  }

  SID.tmjVisual = {
    load,
    drawFloor,
    drawProp,
    scene,
    clear,
    get ready() { return state.ready; },
    get error() { return state.error; },
    state,
  };
})();


