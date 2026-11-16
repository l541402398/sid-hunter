'use strict';
// 美术层引擎（Canvas 2D 星露谷级 2× 像素手绘，零依赖）——为带 layouts/fN.js 的楼层（floor.lobby）绘制：
//   floor(g,id,ox,oy,w,h)  分区 2× 像素地面 + 门洞门槛 + 织纹地毯 + 窗光 + 柔投影 + 墙脚 AO + 主题地面装饰
//   backWall(g,f)          北墙（高度 = floor.wallBase）：墙面材质 + 护墙板 + 窗 + 壁灯 + 画框 + 牌匾 + 嵌墙房门
//   wall(g,w)              隔墙/独立建筑：压顶 + 立面 + 矮栏 + 3/4 微缩屋顶 + 嵌墙门 + 主题立面装饰
//   edges(g,f)             3/4 像素石砌/木构矮墙压顶 + 南向地基裙边 + 离屏主题外景
//   furniture(g,f)         主题陈设优先，其次通用 2× 像素陈设（含深色暖靛/深褐轮廓与左上统一光源）
//   doorMat(g,room,near,t) 门垫 + 可进入提示
// 主题：SID_LOBBY.register(floorId, theme)，见 js/render/lobby-themes/fN.js。统一光向左上；严守 2× 整数网格。
(function (root) {
  const W = () => root.WORLD;
  const OUT = '#221724';     // 暖色建筑/木器像素描边（避开纯黑）
  const OUT_COOL = '#182232'; // 冷色石材/金属/水体像素描边
  const snap2 = v => Math.round(v * 0.5) * 2;
  const R = (g, x, y, w, h, c) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const R2 = (g, x, y, w, h, c) => {
    const rx = snap2(x), ry = snap2(y);
    const rw = Math.max(2, snap2(w)), rh = Math.max(2, snap2(h));
    g.fillStyle = c;
    g.fillRect(rx, ry, rw, rh);
  };
  function outlineBox(g, x, y, w, h, fill, hi, lo, edge = OUT, cutCorner = false) {
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    if (rw < 4 || rh < 4) { R(g, rx, ry, rw, rh, edge); return; }
    if (cutCorner && rw >= 8 && rh >= 8) {
      R(g, rx + 2, ry, rw - 4, rh, edge);
      R(g, rx, ry + 2, rw, rh - 4, edge);
      R(g, rx + 2, ry + 2, rw - 4, rh - 4, fill);
    } else {
      R(g, rx, ry, rw, rh, edge);
      R(g, rx + 2, ry + 2, rw - 4, rh - 4, fill);
    }
    if (hi) R(g, rx + 2, ry + 2, rw - 4, 2, hi);
    if (lo && rh >= 8) R(g, rx + 2, ry + rh - 4, rw - 4, 2, lo);
  }
  const hash = (a, b) => {
    let n = (a * 374761393 + b * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177 | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const FONT = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  function text(g, s, x, y, c, px = 10, align = 'center') {
    g.fillStyle = c;
    g.font = FONT(px);
    g.textAlign = align;
    g.textBaseline = 'middle';
    g.fillText(s, Math.round(x), Math.round(y));
  }
  function pxEllipse(g, cx, cy, rx, ry, c, step = 2) {
    g.fillStyle = c;
    for (let dy = -ry; dy < ry; dy += step) {
      const t = (dy + step / 2) / ry;
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)) / step) * step;
      if (half > 0) g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, step);
    }
  }
  const clipRect = (ox, oy, w, h, r) => {
    const x0 = Math.max(ox, r.x), y0 = Math.max(oy, r.y);
    const x1 = Math.min(ox + w, r.x + r.w), y1 = Math.min(oy + h, r.y + r.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const withClip = (g, a, fn) => {
    g.save();
    g.beginPath();
    g.rect(a.x, a.y, a.w, a.h);
    g.clip();
    fn();
    g.restore();
  };

  // ---------- 2× 离屏索引色像素缓冲构建器（用于 7 层主题外景） ----------
  function parseHexRGB(hex) {
    const h = hex[0] === '#' ? hex.slice(1) : hex;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function createPixelBuffer(ew, eh, ox, oy, pal) {
    const c = document.createElement('canvas');
    c.width = ew; c.height = eh;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    const img = g.createImageData(ew, eh);
    const data = img.data;
    const idxGrid = new Uint16Array(ew * eh);
    const rgbList = [];
    const nameToIdx = new Map();
    const keys = Object.keys(pal || {});
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], rgb = parseHexRGB(pal[k]);
      rgbList.push(rgb);
      nameToIdx.set(k, i + 1);
      nameToIdx.set(pal[k].toLowerCase(), i + 1);
    }
    const resolve = col => {
      if (typeof col === 'number') return col;
      return nameToIdx.get(col) || nameToIdx.get(String(col).toLowerCase()) || 0;
    };
    const p = (ix, iy, col) => {
      const x = ix | 0, y = iy | 0;
      if (x < 0 || x >= ew || y < 0 || y >= eh) return;
      const ci = resolve(col);
      if (!ci) return;
      const pos = y * ew + x;
      idxGrid[pos] = ci;
      const rgb = rgbList[ci - 1], o = pos << 2;
      data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
    };
    const rect = (ix, iy, rw, rh, col) => {
      const ci = resolve(col);
      if (!ci) return;
      const rgb = rgbList[ci - 1];
      const x0 = Math.max(0, ix | 0), y0 = Math.max(0, iy | 0);
      const x1 = Math.min(ew, (ix + rw) | 0), y1 = Math.min(eh, (iy + rh) | 0);
      for (let y = y0; y < y1; y++) {
        let pos = y * ew + x0, o = pos << 2;
        for (let x = x0; x < x1; x++, pos++, o += 4) {
          idxGrid[pos] = ci;
          data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
        }
      }
    };
    const get = (ix, iy) => {
      const x = ix | 0, y = iy | 0;
      return (x < 0 || x >= ew || y < 0 || y >= eh) ? 0 : idxGrid[y * ew + x];
    };
    const commit = () => { g.putImageData(img, 0, 0); return c; };
    const draw = targetG => {
      targetG.save();
      targetG.imageSmoothingEnabled = false;
      targetG.drawImage(c, ox, oy, ew * 2, eh * 2);
      targetG.restore();
    };
    return { c, g, ew, eh, ox, oy, p, rect, get, commit, draw, keys };
  }

  // ---------- 共享 2× 外景光栅化器（Chamfer 岸线距离场 + 4-邻域去杂点 + Uint32 快速装填） ----------
  function createExteriorRaster(ew, eh, ox, oy, pal) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const grid = new Uint8Array(ew * eh);
    const hash2 = (x, y) => {
      let h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const smoothNoise = (x, y, cell) => {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      const fx = (x - cx * cell) / cell, fy = (y - cy * cell) / cell;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const n00 = hash2(cx, cy), n10 = hash2(cx + 1, cy), n01 = hash2(cx, cy + 1), n11 = hash2(cx + 1, cy + 1);
      return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
    };
    const pset = (x, y, c) => {
      const ix = x | 0, iy = y | 0;
      if (ix >= 0 && ix < ew && iy >= 0 && iy < eh && c) grid[iy * ew + ix] = c;
    };
    const pat = (x, y) => {
      const ix = x | 0, iy = y | 0;
      return (ix >= 0 && ix < ew && iy >= 0 && iy < eh) ? grid[iy * ew + ix] : 0;
    };
    const fillDisc = (cx, cy, rx, ry, c) => {
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(ew - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(eh - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) {
        const dy = (y - cy) / ry;
        for (let x = x0; x <= x1; x++) {
          const dx = (x - cx) / rx;
          if (dx * dx + dy * dy <= 1) grid[y * ew + x] = c;
        }
      }
    };
    const fillRect = (x, y, rw, rh, c) => {
      const x0 = Math.max(0, x | 0), x1 = Math.min(ew, (x + rw) | 0);
      const y0 = Math.max(0, y | 0), y1 = Math.min(eh, (y + rh) | 0);
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) grid[yy * ew + xx] = c;
    };
    const chamferDist = solid => {
      const dist = new Uint8Array(ew * eh);
      for (let i = 0; i < dist.length; i++) dist[i] = solid[i] ? 0 : 255;
      for (let y = 1; y < eh - 1; y++) {
        const row = y * ew;
        for (let x = 1; x < ew - 1; x++) {
          const i = row + x;
          if (!dist[i]) continue;
          let d = dist[i];
          const d1 = dist[i - 1] + 2, d2 = dist[i - ew] + 2, d3 = dist[i - ew - 1] + 3, d4 = dist[i - ew + 1] + 3;
          if (d1 < d) d = d1; if (d2 < d) d = d2; if (d3 < d) d = d3; if (d4 < d) d = d4;
          dist[i] = d;
        }
      }
      for (let y = eh - 2; y >= 1; y--) {
        const row = y * ew;
        for (let x = ew - 2; x >= 1; x--) {
          const i = row + x;
          if (!dist[i]) continue;
          let d = dist[i];
          const d1 = dist[i + 1] + 2, d2 = dist[i + ew] + 2, d3 = dist[i + ew + 1] + 3, d4 = dist[i + ew - 1] + 3;
          if (d1 < d) d = d1; if (d2 < d) d = d2; if (d3 < d) d = d3; if (d4 < d) d = d4;
          dist[i] = d;
        }
      }
      return dist;
    };
    const cleanupStrays = (keepSet) => {
      let fixed = 0;
      for (let pass = 0; pass < 4; pass++) {
        for (let y = 1; y < eh - 1; y++) {
          const row = y * ew;
          for (let x = 1; x < ew - 1; x++) {
            const v = grid[row + x];
            if (!v || (keepSet && keepSet.has(v))) continue;
            if (grid[row + x - 1] === v || grid[row + x + 1] === v || grid[row - ew + x] === v || grid[row + ew + x] === v) continue;
            const l = grid[row + x - 1], r = grid[row + x + 1], u = grid[row - ew + x], d = grid[row + ew + x];
            const best = (l && (l === r || l === u || l === d)) ? l : ((u && (u === d || u === r)) ? u : (r || u || l || d));
            if (best) { grid[row + x] = best; fixed++; }
          }
        }
      }
      return fixed;
    };
    const finish = (strayFixed = 0) => {
      const cv = document.createElement('canvas');
      cv.width = ew; cv.height = eh;
      const cg = cv.getContext('2d');
      const img = cg.createImageData(ew, eh);
      const pal32 = new Uint32Array(pal.length);
      const tmpB = new Uint8Array(4), tmpU = new Uint32Array(tmpB.buffer);
      for (let c = 1; c < pal.length; c++) {
        const hx = pal[c];
        tmpB[0] = parseInt(hx.slice(1, 3), 16);
        tmpB[1] = parseInt(hx.slice(3, 5), 16);
        tmpB[2] = parseInt(hx.slice(5, 7), 16);
        tmpB[3] = 255;
        pal32[c] = tmpU[0];
      }
      const dst32 = new Uint32Array(img.data.buffer);
      for (let i = 0; i < grid.length; i++) dst32[i] = pal32[grid[i]];
      cg.putImageData(img, 0, 0);
      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      return {
        cv, grid, w: ew, h: eh, pal,
        audit: { w: ew, h: eh, palCount: pal.length - 1, buildMs: +(t1 - t0).toFixed(1), strayFixed }
      };
    };
    const wx = w => Math.round((w - ox) / 2), wy = w => Math.round((w - oy) / 2);
    return { ew, eh, ox, oy, grid, pal, wx, wy, hash2, smoothNoise, pset, pat, fillDisc, fillRect, chamferDist, cleanupStrays, finish };
  }

  // ---------- 默认调色板（HSV 暖光冷影色移，2× 像素感） ----------
  const PAL = {
    wood: { base: '#c58b52', hi: '#dca264', lo: '#a46c3c', gap: '#6d4329', grain: '#945d36' },
    wall: {
      paper: '#efd9a7', stripe: '#e2c58c', motif: '#d1ac70',
      rail: '#7d4a2c', railHi: '#b47848',
      wains: '#9e6238', wainsLo: '#7c4828', wainsHi: '#bf824e',
      base: '#48281c', crown: '#d8ba80',
      cap: '#6a4128', capHi: '#a47044', capLo: '#2d1c22', capTop: '#845434', style: 'paper'
    },
    voidC: '#1a1520', edgeHi: '#cfa062',
    door: { frame: '#38201e', frameHi: '#a46e42', leaf: '#a2653a', plank: '#7c482c', lintel: '#4f2b1c', glass: '#f7de94' },
    plaque: { bg: '#744626', hi: '#ad7742', edge: '#26181c', ink: '#fcf0cc' }
  };
  const themes = {};
  const themeOf = id => themes[id] || {};
  const wallPal = th => Object.assign({}, PAL.wall, th.wall || {});
  const edgePal = th => {
    const wp = wallPal(th), ep = (th && th.edge) || {};
    return {
      cap: ep.cap || wp.cap,
      capHi: ep.capHi || wp.capHi,
      capLo: ep.capLo || wp.capLo,
      trim: ep.trim || th.edgeHi || PAL.edgeHi,
      mortar: ep.mortar || wp.capLo
    };
  };

  // ---------- 2× 像素地面材质（所有纹理块 >= 2px，单向左上光照） ----------
  //的低频长板木地板（去眩晕、去白点噪斑）：行高 32（=16 原生像素），板长 128–320，
  // 仅保留温润底缝与端缝，去除每块木板端头的刺眼亮白竖线，木纹成簇自然舒展。
  function planks(g, a, p, seed = 1, rowH = 32) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let r = Math.floor(a.y / rowH); r * rowH < a.y + a.h; r++) {
        const y = r * rowH;
        let x = Math.floor(a.x / 64) * 64 - 64 - Math.floor(hash(r, seed) * 6) * 32;
        while (x < a.x + a.w) {
          const len = 128 + Math.floor(hash(x, r + seed) * 7) * 32;
          const tone = hash(r * 7 + seed, x);
          const c = tone < 0.18 ? p.lo : tone > 0.88 ? p.hi : p.base;
          if (c !== p.base) R(g, x, y, len, rowH, c);
          R(g, x, y + rowH - 2, len, 2, p.gap);            // 横向板缝
          R(g, x, y, 2, rowH - 2, p.gap);                  // 端头板缝
          if (tone > 0.68) R(g, x + 6, y + 2, Math.min(36, len - 16), 2, p.hi); // 局部柔和受光面
          if (hash(x, r * 3 + seed) > 0.72) {              // 稀疏阶梯木纹簇
            const gx = snap2(x + 24 + hash(r, x) * Math.max(8, len - 76));
            R(g, gx, y + 12, 24, 2, p.grain);
            R(g, gx + 20, y + 14, 18, 2, p.grain);
          }
          x += len;
        }
      }
    });
  }
  // 现代建筑大规格哑光洞石/石灰石地砖（默认 64×48）：去除逐砖四面描框造成的塑料网格感，
  // 采用 2px 温润灰缝 + 局部左上短高光与稀疏天然石脉（遵循 rules://67 地面从属原则）。
  function stone(g, a, p, seed = 1, TW = 64, TH = 48) {
    if (!a) return;
    const tones = p.tones || ['#ece4d6', '#e4dac9', '#f2ece0', '#dad0be'];
    const grout = p.grout || '#bfb39e';
    const hi = p.hi || '#f8f4ec';
    const lo = p.lo || '#cdc1ad';
    R(g, a.x, a.y, a.w, a.h, grout);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / TH); ty * TH < a.y + a.h; ty++) {
        const off = (ty % 2) ? TW / 2 : 0;
        for (let tx = Math.floor((a.x - off) / TW) - 1; tx * TW + off < a.x + a.w; tx++) {
          const x = tx * TW + off, y = ty * TH, k = hash(tx + seed, ty);
          R(g, x + 2, y + 2, TW - 2, TH - 2, tones[Math.floor(k * tones.length)]);
          if (k < 0.34) {
            R(g, x + 4, y + 2, snap2(16 + k * 24), 2, hi);
            R(g, x + 2, y + 4, 2, 10, hi);
          } else if (k > 0.80) {
            const vx = snap2(x + 12 + (k - 0.8) * 90), vy = snap2(y + 14 + hash(ty, tx) * (TH - 24));
            R(g, vx, vy, 12, 2, lo);
            R(g, vx + 10, vy + 2, 8, 2, lo);
          }
        }
      }
    });
  }
  function checker(g, a, p, S = 48) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.grout);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) {
        for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
          const x = tx * S, y = ty * S, dark = (tx + ty) % 2 === 1;
          R(g, x + 2, y + 2, S - 2, S - 2, dark ? p.b : p.a);
          if (hash(tx + 17, ty + 3) < 0.45) R(g, x + 4, y + 4, 16, 2, dark ? p.bHi : p.aHi);
          if (hash(tx + 99, ty) > 0.88) R2(g, x + 12, y + S - 12, 10, 2, dark ? (p.bLo || p.grout) : (p.aLo || p.grout));
        }
      }
    });
  }
  // 编织拼花（去眩晕）：64 格、每格两条板，只用 base/lo 两档，受光边只描局部柔和短高光。
  function parquet(g, a, p, S = 64) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.gap);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) {
        for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
          const x = tx * S, y = ty * S, horiz = (tx + ty) % 2 === 0, half = S / 2;
          for (let i = 0; i < 2; i++) {
            const c = hash(tx * 2 + i, ty + 7) < 0.28 ? p.lo : p.base;
            if (horiz) {
              R(g, x + 2, y + i * half + 2, S - 2, half - 2, c);
              if (i === 0 && hash(tx, ty) > 0.4) R(g, x + 6, y + 4, 22, 2, p.hi);
            } else {
              R(g, x + i * half + 2, y + 2, half - 2, S - 2, c);
              if (i === 0 && hash(tx, ty) > 0.4) R(g, x + 4, y + 6, 2, 22, p.hi);
            }
          }
        }
      }
    });
  }
  function tiles(g, a, p, S = 48) {
    if (!a) return;
    const tones = p.tones || [p.base];
    R(g, a.x, a.y, a.w, a.h, p.grout);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) {
        for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
          const x = tx * S, y = ty * S, k = hash(tx + 5, ty + 3);
          R(g, x + 2, y + 2, S - 2, S - 2, tones[Math.floor(k * tones.length)]);
          if (k < 0.40) {
            R(g, x + 4, y + 4, 14, 2, p.hi);
            R(g, x + 4, y + 4, 2, 10, p.hi);
          }
          if (k > 0.84) R(g, x + 10, y + S - 6, 12, 2, p.lo || p.grout);
        }
      }
    });
  }
  function grass(g, a, p, seed = 3) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 16) * 16; y < a.y + a.h; y += 16) {
        for (let x = Math.floor(a.x / 16) * 16; x < a.x + a.w; x += 16) {
          const k = hash(x + seed, y);
          if (k < 0.42) {
            const bx = snap2(x + 2 + k * 8);
            R(g, bx, y + 8, 2, 4, p.blade);
            R(g, bx + 2, y + 6, 2, 6, p.blade);
            R(g, bx + 4, y + 8, 2, 4, p.hi);
          } else if (k < 0.60) {
            R(g, x + 2, y + 10, 6, 4, p.lo);
            R(g, x + 4, y + 8, 4, 2, p.blade);
          } else if (k > 0.982 && p.flower) {
            const fc = p.flower[Math.floor(k * 997) % p.flower.length];
            R(g, x + 4, y + 6, 6, 6, fc);
            R(g, x + 6, y + 8, 2, 2, '#fff6d0');
          } else if (k > 0.90) {
            R(g, x + 8, y + 4, 4, 2, p.hi);
          }
        }
      }
    });
  }
  function carpet(g, a, p, seed = 7) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 16) * 16; y < a.y + a.h; y += 16) {
        for (let x = Math.floor(a.x / 16) * 16; x < a.x + a.w; x += 16) {
          const k = hash(x + seed, y + seed);
          if (k > 0.74) R(g, x + 4, y + 4, 4, 2, p.hi);
          else if (k < 0.16) R(g, x + 8, y + 10, 4, 2, p.lo);
        }
      }
      if (p.pattern) {
        for (let y = Math.floor(a.y / 48) * 48 + 20; y < a.y + a.h; y += 48) {
          for (let x = Math.floor(a.x / 48) * 48 + 20; x < a.x + a.w; x += 48) {
            R(g, x + 2, y, 4, 2, p.pattern);
            R(g, x, y + 2, 8, 2, p.pattern);
            R(g, x + 2, y + 4, 4, 2, p.pattern);
          }
        }
      }
    });
  }
  function deck(g, a, p, seed = 9) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let r = Math.floor(a.y / 12); r * 12 < a.y + a.h; r++) {
        const y = r * 12, tone = hash(r, seed);
        R(g, a.x, y, a.w, 12, tone < 0.30 ? p.lo : tone > 0.75 ? p.hi : p.base);
        R(g, a.x, y + 10, a.w, 2, p.gap);
        for (let x = Math.floor(a.x / 96) * 96 + ((r % 3) * 32); x < a.x + a.w; x += 96) {
          R(g, x, y, 2, 10, p.gap);
          R(g, x + 6, y + 4, 2, 2, p.nail || p.gap);
          R(g, x - 8, y + 4, 2, 2, p.nail || p.gap);
        }
      }
    });
  }
  function dirt(g, a, p, seed = 11) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 16) * 16; y < a.y + a.h; y += 16) {
        for (let x = Math.floor(a.x / 16) * 16; x < a.x + a.w; x += 16) {
          const k = hash(x + seed, y);
          if (k > 0.80) R(g, x + 2, y + 4, 6, 4, p.hi);
          else if (k < 0.14) R(g, x + 6, y + 8, 4, 4, p.lo);
          else if (k > 0.68) R(g, x + 8, y + 4, 4, 4, p.pebble || p.lo);
        }
      }
    });
  }
  const MATS = { planks, stone, checker, parquet, tiles, grass, carpet, deck, dirt };

  function paintZone(g, z, ox, oy, w, h) {
    const a = clipRect(ox, oy, w, h, z);
    if (!a) return;
    const fn = MATS[z.mat] || planks, p = z.pal || PAL.wood;
    if (z.mat === 'planks' || !MATS[z.mat]) fn(g, a, p, z.seed || 1, z.rowH || 32);
    else if (z.mat === 'stone') fn(g, a, p, z.seed || 1, z.tw || 64, z.th || 48);
    else if (z.mat === 'checker' || z.mat === 'tiles') fn(g, a, p, z.size || 48);
    else if (z.mat === 'parquet') fn(g, a, p, z.size || 64);
    else fn(g, a, p, z.seed || 1);
  }
  function threshold(g, a, p) {
    if (!a) return;
    p = p || {};
    R(g, a.x, a.y, a.w, a.h, p.base || '#d4c6b2');
    R(g, a.x, a.y, a.w, 2, p.hi || '#f4ece0');
    R(g, a.x, a.y + a.h - 2, a.w, 2, p.lo || '#7c6b54');
  }
  function rug(g, r, ox, oy, w, h) {
    if (!clipRect(ox, oy, w, h, { x: r.x - 10, y: r.y - 4, w: r.w + 20, h: r.h + 12 })) return;
    R(g, r.x + 4, r.y + r.h, r.w - 4, 4, 'rgba(34,20,32,0.18)');
    if (r.round) {
      const cx = snap2(r.x + r.w / 2), cy = snap2(r.y + r.h / 2);
      pxEllipse(g, cx, cy, r.w / 2, r.h / 2, r.edge || '#2a1d26');
      pxEllipse(g, cx, cy, r.w / 2 - 2, r.h / 2 - 2, r.band);
      pxEllipse(g, cx, cy, r.w / 2 - 8, r.h / 2 - 6, r.trim);
      pxEllipse(g, cx, cy, r.w / 2 - 10, r.h / 2 - 8, r.fill);
      pxEllipse(g, cx, cy, r.w / 2 - 22, r.h / 2 - 16, r.motif);
      pxEllipse(g, cx, cy, r.w / 2 - 24, r.h / 2 - 18, r.fill);
      return;
    }
    const rx = snap2(r.x), ry = snap2(r.y), rw = snap2(r.w), rh = snap2(r.h);
    R(g, rx, ry, rw, rh, r.edge || '#2a1d26');
    R(g, rx + 2, ry + 2, rw - 4, rh - 4, r.band);
    R(g, rx + 8, ry + 8, rw - 16, rh - 16, r.trim);
    R(g, rx + 10, ry + 10, rw - 20, rh - 20, r.fill);
    // 柔和羊毛编织暗纹与四角几何纹章
    for (let yy = ry + 16; yy < ry + rh - 18; yy += 16) {
      for (let xx = rx + 18 + ((yy / 16) % 2 ? 12 : 0); xx < rx + rw - 22; xx += 28) {
        if (hash(xx, yy) > 0.55) R(g, xx, yy, 6, 2, r.band);
      }
    }
    R(g, rx + 16, ry + 16, rw - 32, 2, r.motif);
    R(g, rx + 16, ry + rh - 18, rw - 32, 2, r.motif);
    R(g, rx + 16, ry + 16, 2, rh - 32, r.motif);
    R(g, rx + rw - 18, ry + 16, 2, rh - 32, r.motif);
    for (const [cx, cy] of [[rx + 24, ry + 24], [rx + rw - 24, ry + 24], [rx + 24, ry + rh - 24], [rx + rw - 24, ry + rh - 24]]) {
      R(g, cx - 4, cy - 4, 8, 8, r.band);
      R(g, cx - 2, cy - 2, 4, 4, r.trim);
    }
    if (r.fringe) {
      for (let y = ry + 6; y < ry + rh - 6; y += 8) {
        R(g, rx - 6, y, 6, 2, r.fringe);
        R(g, rx + rw, y, 6, 2, r.fringe);
      }
    }
  }
  function windowLight(g, cx, top, len = 150, color = '255,236,170') {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${color},${(0.10 - i * 0.025).toFixed(3)})`;
      const inset = i * 6;
      g.beginPath();
      g.moveTo(cx - 22 + inset, top);
      g.lineTo(cx + 22 - inset, top);
      g.lineTo(cx + 70 - inset, top + len - inset * 2);
      g.lineTo(cx + 26 + inset, top + len - inset * 2);
      g.closePath();
      g.fill();
    }
  }
  function floor(g, id, ox, oy, w, h) {
    const F = W().floorById(id), th = themeOf(id);
    for (const z of (th.zones || [{ x: 0, y: 0, w: F.width, h: F.height, mat: 'planks' }])) paintZone(g, z, ox, oy, w, h);
    for (const d of (F.doors || [])) {
      const wl = F.walls.find(q => q.lobby && !q.northBand && (d.orientation === 'h'
        ? (q.w >= q.h && Math.abs(q.y + q.h / 2 - d.y) < 12)
        : (q.h > q.w && Math.abs(q.x + q.w / 2 - d.x) < 12)));
      const t = wl ? (d.orientation === 'h' ? wl.h : wl.w) : 16;
      threshold(g, clipRect(ox, oy, w, h, d.orientation === 'h'
        ? { x: d.x - d.width / 2, y: d.y - t / 2, w: d.width, h: t }
        : { x: d.x - t / 2, y: d.y - d.width / 2, w: t, h: d.width }), th.threshold);
    }
    if (th.floorDecor) th.floorDecor(g, ox, oy, w, h, API, F);
    for (const r of (th.rugs || [])) rug(g, r, ox, oy, w, h);
    if (th.floorDecorTop) th.floorDecorTop(g, ox, oy, w, h, API, F);
    for (const cx of (th.windows || [])) {
      const b = bandAt(F, cx);
      if (b) windowLight(g, cx, b.y + b.h, th.lightLen || 150, th.lightColor);
    }
    for (const b of bandsOf(F)) {
      for (let i = 0; i < 3; i++) {
        g.fillStyle = `rgba(34,20,32,${(0.22 - i * 0.065).toFixed(3)})`;
        g.fillRect(b.x, b.y + b.h + i * 4, b.w, 4);
      }
    }
    for (const wl of F.walls) {
      if (!wl.lobby || wl.northBand) continue;
      if (wl.w >= wl.h) { g.fillStyle = 'rgba(34,20,32,0.18)'; g.fillRect(wl.x, wl.y + wl.h, wl.w, 6); }
      else { g.fillStyle = 'rgba(34,20,32,0.14)'; g.fillRect(wl.x + wl.w, wl.y, 6, wl.h); }
    }
    for (const f of F.furniture) {
      if (!f.w) continue;
      const by = f.y + f.h;
      if (by < oy - 20 || by > oy + h + 20 || f.x > ox + w + 40 || f.x + f.w < ox - 40) continue;
      if (f.type === 'rug') continue;
      pxEllipse(g, f.x + f.w / 2 + 4, by - 2, Math.round(f.w / 2 + 4), f.type === 'pillar' ? 6 : 8, 'rgba(34,20,32,0.20)');
    }
    return true;
  }

  // ---------- 墙面部件（2× 像素风：清晰勾边 + 暖光高光 + 冷阴影） ----------
  function wallSurface(g, x, y, w, h, P) {
    R(g, x, y, w, h, P.paper);
    const st = P.style || 'paper';
    if (st === 'modern') {
      // 温暖现代研发建筑吸音/木饰大板墙：96px 模数竖缝 + 左上受光倒角，无墙纸圆点噪斑
      const hi = P.panelHi || '#faf5ec';
      for (let xx = Math.floor(x / 96) * 96; xx < x + w; xx += 96) {
        if (xx >= x) R(g, xx, y, 2, h, P.stripe);
        if (xx + 2 >= x && xx + 2 < x + w) R(g, xx + 2, y, 2, h, hi);
      }
      if (h >= 24) {
        R(g, x, y + h - 10, w, 2, P.stripe);
        R(g, x, y + h - 8, w, 2, hi);
      }
    } else if (st === 'brick') {
      for (let r = 0, yy = y; yy < y + h; yy += 8, r++) {
        R(g, x, yy + 6, w, 2, P.stripe);
        for (let xx = Math.floor(x / 16) * 16 + (r % 2 ? 8 : 0); xx < x + w; xx += 16) {
          R(g, Math.max(x, xx), yy, 2, 6, P.stripe);
          if (hash(xx, yy) > 0.82) R(g, Math.max(x, xx + 2), yy, 12, 4, P.motif);
        }
      }
    } else if (st === 'stone') {
      for (let r = 0, yy = y; yy < y + h; yy += 16, r++) {
        R(g, x, yy + 14, w, 2, P.stripe);
        for (let xx = Math.floor(x / 32) * 32 + (r % 2 ? 16 : 0); xx < x + w; xx += 32) {
          R(g, Math.max(x, xx), yy, 2, 14, P.stripe);
          R(g, Math.max(x, xx + 2), yy, 26, 2, P.motif);
        }
      }
    } else if (st === 'plank') {
      for (let xx = Math.ceil(x / 16) * 16; xx < x + w; xx += 16) {
        R(g, xx, y, 2, h, P.stripe);
        if (hash(xx, 3) > 0.55) R(g, xx + 6, y + snap2(hash(xx, 9) * Math.max(4, h - 10)), 2, 6, P.motif);
      }
    } else if (st === 'panel') {
      for (let xx = Math.floor(x / 64) * 64; xx < x + w; xx += 64) {
        R(g, xx, y, 2, h, P.stripe);
        R(g, xx + 8, y + 6, 48, 2, P.motif);
        R(g, xx + 8, y + h - 8, 48, 2, P.motif);
      }
    } else {
      for (let sx = Math.ceil(x / 16) * 16; sx < x + w; sx += 16) R(g, sx, y, 2, h, P.stripe);
      for (let sy = y + 8; sy < y + h - 4; sy += 20) {
        for (let sx = Math.ceil(x / 32) * 32 + 8; sx < x + w - 4; sx += 32) {
          R(g, sx, sy, 2, 2, P.motif);
          R(g, sx - 2, sy + 2, 6, 2, P.motif);
          R(g, sx, sy + 4, 2, 2, P.motif);
        }
      }
    }
  }
  function wainscot(g, x, y, w, h, P) {
    R(g, x, y, w, 4, P.rail);
    R(g, x, y, w, 2, P.railHi);
    R(g, x, y + 4, w, h - 8, P.wains);
    for (let px = Math.floor(x / 48) * 48 + 6; px < x + w - 8; px += 48) {
      const a = Math.max(px, x + 2), b = Math.min(px + 38, x + w - 2);
      if (b - a < 10) continue;
      R(g, a, y + 6, b - a, h - 12, P.wainsLo);
      R(g, a + 2, y + 8, b - a - 4, h - 16, P.wains);
      R(g, a + 2, y + 8, b - a - 4, 2, P.wainsHi);
    }
    R(g, x, y + h - 4, w, 2, P.base);
    R(g, x, y + h - 2, w, 2, OUT);
  }
  function windowAt(g, cx, top, bottom, style, P) {
    const w = style === 'porthole' ? 40 : (style === 'curtain' ? 64 : 44);
    const x = snap2(cx - w / 2), h = snap2(bottom - top);
    const frame = (P && P.winFrame) || '#6e4322';
    const frameHi = (P && P.winFrameHi) || '#a46b3e';
    const mull = (P && P.winMull) || '#7a4a26';
    if (style === 'porthole') {
      const cy = snap2(top + h / 2), r = snap2(Math.min(w, h) / 2);
      pxEllipse(g, cx, cy, r + 6, r + 6, OUT_COOL);
      pxEllipse(g, cx, cy, r + 4, r + 4, '#7e8692');
      pxEllipse(g, cx, cy, r + 2, r + 2, '#c8d0da');
      pxEllipse(g, cx, cy, r, r, '#74c6e8');
      pxEllipse(g, cx, cy + r / 2, r - 2, r / 3, '#4896bc');
      R(g, cx - r / 2, cy - r / 2, 4, 6, '#ffffff');
      for (const [dx, dy] of [[-r - 2, 0], [r, 0], [0, -r - 2], [0, r]]) R(g, cx + dx, cy + dy, 2, 2, '#3d4552');
      return;
    }
    if (style === 'curtain') {
      // 现代研发大楼深古铜框全景明窗：晴空层次 + 园区树冠远景 + 斜向像素反光 + 石材窗台
      const bOut = '#251e22', bFrm = (P && P.winFrame) || '#463b39', bHi = (P && P.winFrameHi) || '#7c6a5e';
      R(g, x - 6, top - 4, w + 12, h + 8, bOut);
      R(g, x - 4, top - 2, w + 8, h + 4, bFrm);
      R(g, x - 2, top, w + 4, 2, bHi);
      R(g, x, top + 2, w, h - 4, (P && P.sky) || '#9fd4ec');
      R(g, x, top + 2 + snap2((h - 4) * 0.38), w, snap2((h - 4) * 0.34), (P && P.sky2) || '#bfe6f6');
      R(g, x, top + 2 + snap2((h - 4) * 0.72), w, snap2((h - 4) * 0.28), '#dff3fb');
      // 窗外园区林冠与远景建筑轮廓
      R(g, x, bottom - 12, w, 10, (P && P.far) || '#6da66e');
      R(g, x + 4, bottom - 16, 16, 6, (P && P.far2) || '#538a59');
      R(g, x + 26, bottom - 14, 14, 4, '#83ba7c');
      R(g, x + 44, bottom - 18, 16, 8, (P && P.far2) || '#538a59');
      // 竖向中梃与上部横梁
      R(g, cx - 2, top + 2, 4, h - 4, bFrm);
      R(g, cx - 2, top + 2, 2, h - 4, bHi);
      R(g, x, top + 16, w, 4, bFrm);
      R(g, x, top + 16, w, 2, bHi);
      // 双格斜向玻璃高光
      R(g, x + 6, top + 6, 6, 2, '#ffffff');
      R(g, x + 4, top + 8, 4, 4, '#ffffff');
      R(g, x + 6, top + 24, 2, 12, '#ffffff');
      R(g, x + 8, top + 22, 2, 6, '#e8f8fe');
      R(g, cx + 6, top + 24, 2, 10, '#e8f8fe');
      R(g, cx + 8, top + 22, 2, 4, '#ffffff');
      // 哑光洞石内窗台（避开 217,204,163±6）
      R(g, x - 8, bottom - 2, w + 16, 8, bOut);
      R(g, x - 6, bottom, w + 12, 4, '#f0e8dc');
      R(g, x - 6, bottom + 4, w + 12, 2, '#b3a392');
      return;
    }
    R(g, x - 6, top - 4, w + 12, h + 8, OUT);
    R(g, x - 4, top - 2, w + 8, h + 4, frame);
    R(g, x - 2, top, w + 4, h, frameHi);
    R(g, x, top + 2, w, h - 4, (P && P.sky) || '#a8dcef');
    R(g, x, top + 2 + snap2((h - 4) * 0.45), w, snap2((h - 4) * 0.3), (P && P.sky2) || '#c8ecf8');
    R(g, x, bottom - 12, w, 10, (P && P.far) || '#7ebd70');
    R(g, x + 6, bottom - 16, 12, 6, (P && P.far2) || '#6ba860');
    R(g, x + 26, bottom - 14, 14, 4, (P && P.far2) || '#6ba860');
    if (style === 'arch') {
      R(g, x, top + 2, 8, 6, frameHi);
      R(g, x + w - 8, top + 2, 8, 6, frameHi);
      R(g, x, top + 8, 2, 4, frameHi);
      R(g, x + w - 2, top + 8, 2, 4, frameHi);
    }
    R(g, cx - 2, top + 2, 2, h - 4, mull);
    R(g, x, top + snap2(h / 2), w, 2, mull);
    R(g, x + 4, top + 10, 2, 10, '#ffffff');
    R(g, x + 6, top + 8, 2, 4, '#ffffff');
    R(g, cx + 4, top + snap2(h / 2) + 6, 2, 8, '#e6f6fb');
    R(g, x - 8, bottom - 2, w + 16, 8, OUT);
    R(g, x - 6, bottom, w + 12, 4, '#f0e6d6');
    R(g, x - 6, bottom + 4, w + 12, 2, '#9c7448');
    if (!P || P.flowerBox !== false) {
      R(g, x + 2, bottom - 4, w - 4, 4, '#a2602f');
      for (let i = 0; i < 5; i++) {
        R(g, x + 4 + i * 8, bottom - 8, 4, 4, ['#f06f6a', '#ffd25a', '#f5a0c8', '#ffd25a', '#f06f6a'][i]);
      }
    }
  }
  function sconce(g, cx, y, c = '#ffd27a') {
    const sx = snap2(cx);
    R(g, sx - 8, y - 2, 16, 12, OUT);
    R(g, sx - 4, y + 10, 8, 10, '#6e4022');
    R(g, sx - 6, y, 12, 8, c);
    R(g, sx - 4, y + 2, 8, 4, '#fff6d0');
    g.fillStyle = 'rgba(255,214,130,0.16)';
    g.fillRect(sx - 20, y - 10, 40, 34);
  }
  function frame(g, x, y, w, h, kind) {
    R(g, x - 2, y - 2, w + 4, h + 4, OUT);
    R(g, x, y, w, h, '#6e4322');
    R(g, x + 2, y + 2, w - 4, h - 4, '#c48d52');
    const inner = { sea: '#8fcbe0', night: '#32426e', land: '#f4e8c6', flower: '#f6ebd2', map: '#ecd8a8' }[kind] || '#f4e8c6';
    R(g, x + 4, y + 4, w - 8, h - 8, inner);
    if (kind === 'sea') {
      R(g, x + 4, y + h - 12, w - 8, 8, '#4690b8');
      R(g, x + 10, y + 8, 6, 4, '#fff6d8');
      R(g, x + w - 18, y + h - 16, 8, 4, '#f4ecd8');
    } else if (kind === 'night') {
      R(g, x + 10, y + 8, 4, 4, '#ffe9a0');
      for (let i = 0; i < 5; i++) R(g, x + 8 + i * 7, y + 14 + (i % 2) * 4, 2, 2, '#ffffff');
    } else if (kind === 'flower') {
      R(g, x + w / 2 - 2, y + 10, 4, h - 16, '#569a50');
      R(g, x + w / 2 - 6, y + 6, 12, 8, '#f06f6a');
      R(g, x + w / 2 - 2, y + 8, 4, 4, '#ffd25a');
    } else if (kind === 'map') {
      R(g, x + 8, y + 8, 12, 8, '#84b864');
      R(g, x + w - 22, y + 12, 14, 8, '#84b864');
      R(g, x + 10, y + h - 10, w - 20, 2, '#c9534a');
    } else {
      R(g, x + 6, y + h - 12, w - 12, 6, '#76aa5c');
      R(g, x + w / 2 - 4, y + 8, 8, 8, '#f08a5a');
    }
  }
  function plaque(g, cx, y, s, w, P) {
    P = Object.assign({}, PAL.plaque, P || {});
    const pw = snap2(w || Math.max(66, s.length * 12 + 18));
    const px = snap2(cx - pw / 2), py = snap2(y);
    R(g, px - 2, py - 2, pw + 4, 18, P.edge);
    R(g, px, py, pw, 14, P.bg);
    R(g, px, py, pw, 2, P.hi);
    R(g, px + 2, py + 6, 2, 2, '#e2b659');
    R(g, px + pw - 4, py + 6, 2, 2, '#e2b659');
    text(g, s, px + pw / 2, py + 7.5, P.ink, 10);
  }
  function embeddedDoor(g, cx, bottom, h, name, D, plaqueP) {
    D = Object.assign({}, PAL.door, D || {});
    const w = 40, x = snap2(cx - w / 2), top = snap2(bottom - h);
    R(g, x - 6, top - 6, w + 12, h + 6, OUT);
    R(g, x - 4, top - 4, w + 8, h + 4, D.frame);
    R(g, x - 2, top - 2, w + 4, 2, D.frameHi);
    R(g, x, top, w, h, D.leaf);
    R(g, x, top, w, 4, D.lintel);
    R(g, x + 4, top + 6, w - 8, 10, D.glass);
    R(g, cx - 2, top + 6, 2, 10, D.plank);
    for (let px = x + 8; px < x + w - 2; px += 8) R(g, px, top + 20, 2, h - 22, D.plank);
    R(g, x + 2, top + 18, w - 4, 2, D.frameHi);
    R(g, x + w - 10, top + snap2(h * 0.56), 4, 4, '#f0c45c');
    R(g, x + w - 10, top + snap2(h * 0.56) + 4, 4, 2, '#8e6224');
    if (name) plaque(g, cx, top - 20, name.length > 7 ? name.slice(0, 7) + '…' : name, 0, plaqueP);
  }
  const roomsOn = id => { const w = W(); return (w && w.roomsForFloor) ? w.roomsForFloor(id) : []; };

  const bandsOf = f => (f && f.bands && f.bands.length) ? f.bands : [{ x: 0, y: 0, w: (f && f.width) || 3456, h: (f && f.wallBase) || 112 }];
  const bandAt = (f, x) => bandsOf(f).find(b => x >= b.x + 24 && x <= b.x + b.w - 24) || null;
  const bandForDoor = (f, x, y) => bandsOf(f).find(b => x >= b.x && x <= b.x + b.w && Math.abs(y - (b.y + b.h + 22)) <= 20) || null;
  const floorAt = (f, x, y) => { const w = W(); return !!(w && w.inFloor && w.inFloor(f.id, x, y)); };

  // 离屏烘焙缓存：限制最多 4 个大画布（当前层 + 上一层 bw/ed），避免切层显存累积
  const floorLayerCache = new Map();
  function getFloorLayer(key, cw, ch, ox, oy, paintFn) {
    if (floorLayerCache.has(key)) {
      const entry = floorLayerCache.get(key);
      floorLayerCache.delete(key);
      floorLayerCache.set(key, entry);
      return entry;
    }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(cw));
    c.height = Math.max(1, Math.ceil(ch));
    const cg = c.getContext('2d');
    cg.imageSmoothingEnabled = false;
    cg.translate(-ox, -oy);
    paintFn(cg);
    const entry = { c, ox, oy };
    floorLayerCache.set(key, entry);
    while (floorLayerCache.size > 4) {
      const oldestKey = floorLayerCache.keys().next().value;
      const old = floorLayerCache.get(oldestKey);
      if (old && old.c) { old.c.width = 0; old.c.height = 0; }
      floorLayerCache.delete(oldestKey);
    }
    return entry;
  }

  function paintBackWall(g, f) {
    const th = themeOf(f.id), P = wallPal(th), H = f.wallBase || 112;
    const rooms = roomsOn(f.id);
    for (const b of bandsOf(f)) {
      const lift = b.y === 0 ? 60 : 18;
      g.save(); g.beginPath(); g.rect(b.x, b.y - lift, b.w, H + lift); g.clip(); g.translate(0, b.y);
      wallSurface(g, b.x, -lift, b.w, H - 34 + lift, P);
      if (b.y === 0) {
        R(g, b.x, -6, b.w, 2, OUT);
        R(g, b.x, -4, b.w, 4, P.crown);
      } else {
        R(g, b.x, -20, b.w, 2, OUT);
        R(g, b.x, -18, b.w, 16, P.cap);
        R(g, b.x, -18, b.w, 2, P.capHi);
        R(g, b.x, -16, b.w, 2, P.capTop);
        R(g, b.x, -4, b.w, 4, P.crown);
      }
      wainscot(g, b.x, H - 34, b.w, 34, P);
      const winTop = 14, winBot = H - 44, inB = x => x >= b.x + 26 && x <= b.x + b.w - 26;
      for (const cx of (th.windows || [])) if (inB(cx)) windowAt(g, cx, winTop, winBot, th.windowStyle || 'square', th.windowPal || null);
      for (const cx of (th.sconces || [])) if (inB(cx)) sconce(g, cx, 22, th.sconceColor);
      for (const [x, kind, fw, fh] of (th.frames || [])) if (inB(x) && inB(x + (fw || 44))) frame(g, x, 22, fw || 44, fh || 30, kind);
      if (th.plaque && inB(th.plaque.x)) plaque(g, th.plaque.x, 18, th.plaque.text, th.plaque.w, th.plaquePal);
      if (th.backDecor) th.backDecor(g, f, API, H, b);
      for (const r of rooms) {
        if (!r.door || bandForDoor(f, r.door.x, r.door.y) !== b) continue;
        embeddedDoor(g, r.door.x, H, 64, null, th.door);
        plaque(g, r.door.x, Math.max(14, H - 86), r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);
      }
      g.restore();
      for (const [ex, side] of [[b.x, -1], [b.x + b.w, 1]]) {
        if (!floorAt(f, ex + side * 6, b.y + H / 2)) continue;
        const px = side < 0 ? ex - 2 : ex - 10;
        R(g, px - 2, b.y - lift, 16, H + lift, OUT);
        R(g, px, b.y - lift, 12, H + lift, P.capLo);
        R(g, px + 2, b.y - lift, 8, H + lift - 4, P.cap);
        R(g, px + 2, b.y - lift, 2, H + lift - 4, P.capHi);
        R(g, px, b.y + H - 4, 12, 4, P.base);
      }
    }
    return true;
  }

  function backWall(g, f) {
    if (typeof document !== 'undefined' && f && f.id) {
      const ox = -16, oy = -64;
      const cw = (f.width || 3456) + 32, ch = (f.height || 960) + (f.wallBase || 112) + 80;
      const layer = getFloorLayer('bw:' + f.id, cw, ch, ox, oy, cg => paintBackWall(cg, f));
      g.drawImage(layer.c, layer.ox, layer.oy);
      return true;
    }
    return paintBackWall(g, f);
  }

  function paintWall(g, wl) {
    if (wl.northBand || wl.elevatorHall) return true;
    const fid = guessFloor(wl), th = themeOf(fid), P = wallPal(th);
    if (wl.style === 'fence' || wl.style === 'hedge' || wl.style === 'glass') return lowWall(g, wl, th);
    if (wl.style === 'house') return house(g, wl, th, fid, P);
    const x = snap2(wl.x), y = snap2(wl.y), w = snap2(wl.w), h = snap2(wl.h);
    const face = Math.min(wl.face || 44, 58), T = 12;
    const glazed = (wl.partition === 'glazed' || th.partition === 'glazed') && face >= 44;
    if (w >= h) {
      const capY = y - face, faceTop = capY + T, bottom = y + h;
      const doorsHere = roomsOn(fid).filter(r => r.door && r.door.x >= x + 24 && r.door.x <= x + w - 24 && Math.abs(r.door.y - (bottom + 20)) <= 16);
      R(g, x - 2, capY - 2, w + 4, bottom - capY + 4, OUT);
      wallSurface(g, x, faceTop, w, Math.max(4, bottom - faceTop - 18), P);
      if (glazed) {
        // 现代研发大楼木框高透玻璃隔墙：胡桃木竖梃 + 半透采光横窗（自动避开嵌墙门位与壁挂媒体屏开间）
        const gTop = faceTop + 4, gH = Math.max(12, bottom - 22 - gTop);
        const drawGlassPane = (bx, bw) => {
          R(g, bx - 2, gTop - 2, bw + 4, gH + 4, P.capLo);
          R(g, bx, gTop, bw, gH, '#cde2ec');
          R(g, bx, gTop + snap2(gH * 0.5), bw, gH - snap2(gH * 0.5), '#dcedf5');
          R(g, bx + 4, gTop + 2, 10, 2, '#ffffff');
          R(g, bx + 2, gTop + 4, 4, 6, '#ffffff');
          R(g, bx + snap2(bw / 2) - 1, gTop, 2, gH, P.cap);
        };
        const mediaBays = [];
        const pushMediaBay = (rx0, rx1) => {
          const b0 = Math.max(x + 8, snap2(rx0 - 8));
          const b1 = Math.min(x + w - 8, snap2(rx1 + 8));
          if (b1 - b0 < 24) return;
          const hit = mediaBays.find(m => b0 <= m.x1 + 12 && b1 >= m.x0 - 12);
          if (hit) { hit.x0 = Math.min(hit.x0, b0); hit.x1 = Math.max(hit.x1, b1); }
          else mediaBays.push({ x0: b0, x1: b1 });
        };
        const fl = W() && W().floorById && W().floorById(fid);
        if (fl && Array.isArray(fl.furniture)) {
          for (const it of fl.furniture) {
            if (it.type !== 'tv' && it.type !== 'whiteboard') continue;
            if (it.x + it.w <= x + 8 || it.x >= x + w - 8) continue;
            const sBy = snap2(it.y + it.h), sTop = sBy - (it.wallMount ? 46 : 64);
            if (sTop >= bottom - 12 || sBy <= capY) continue;
            const cx = snap2(it.x + it.w / 2);
            const sw = it.type === 'whiteboard'
              ? Math.min(116, Math.max(52, snap2(it.w - 6)))
              : Math.min(108, Math.max(48, snap2(it.w - 8)));
            pushMediaBay(cx - sw / 2, cx + sw / 2);
          }
        }
        if (typeof th.faceDecor === 'function') {
          let minRx = Infinity, maxRx = -Infinity;
          const rec = (rx, rw) => {
            const a = Math.max(x + 6, rx), b = Math.min(x + w - 6, rx + rw);
            if (b > a) { if (a < minRx) minRx = a; if (b > maxRx) maxRx = b; }
          };
          const noopG = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect: (_x, _y, _w) => rec(_x, _w) };
          const probeAPI = Object.assign({}, API, {
            R: (_g, rx, _ry, rw) => rec(rx, rw),
            outlineBox: (_g, rx, _ry, rw) => rec(rx, rw),
            pxEllipse: () => {},
            text: () => {}
          });
          th.faceDecor(noopG, wl, faceTop, bottom, probeAPI);
          if (maxRx > minRx) pushMediaBay(minRx, maxRx);
        }
        if (!mediaBays.length) {
          for (let bx = x + 12; bx < x + w - 44; bx += 72) {
            const bw = Math.min(60, x + w - 12 - bx);
            if (bw < 24) continue;
            if (doorsHere.some(r => Math.abs(r.door.x - (bx + bw / 2)) < bw / 2 + 28)) continue;
            drawGlassPane(bx, bw);
          }
        } else {
          // 扣除嵌墙门位与实木挂屏开间后，在各段净跨内对称排布采光玻璃窗格，杜绝屏幕背后露出半截玻璃
          const cuts = doorsHere.map(r => [snap2(r.door.x - 30), snap2(r.door.x + 30)])
            .concat(mediaBays.map(m => [m.x0 - 8, m.x1 + 8]))
            .sort((a, b) => a[0] - b[0]);
          let cur = x + 12;
          const spans = [];
          for (const [c0, c1] of cuts) {
            if (c0 > cur) spans.push([cur, Math.min(c0, x + w - 12)]);
            cur = Math.max(cur, c1);
          }
          if (cur < x + w - 12) spans.push([cur, x + w - 12]);
          for (const [sx0, sx1] of spans) {
            const spanW = sx1 - sx0;
            if (spanW < 40) continue;
            const n = Math.max(1, Math.floor((spanW + 10) / 58));
            const gap = n > 1 ? 10 : 0;
            const bw = Math.min(60, snap2((spanW - (n - 1) * gap) / n));
            if (bw < 28) continue;
            const totalW = n * bw + (n - 1) * gap;
            let bx = sx0 + snap2((spanW - totalW) / 2);
            for (let k = 0; k < n; k++, bx += bw + gap) drawGlassPane(bx, bw);
          }
          // 实心胡桃木嵌屏安装背板开间（与顶盖及护墙板竖梃贯通，左上统一受光）
          const bayTop = faceTop, bayH = Math.max(16, bottom - 18 - bayTop);
          for (const mb of mediaBays) {
            const mw = mb.x1 - mb.x0;
            R(g, mb.x0 - 2, bayTop, mw + 4, bayH, P.capLo);
            R(g, mb.x0, bayTop, mw, bayH, P.wains);
            R(g, mb.x0, bayTop, mw, 2, P.wainsLo);
            // 左右胡桃木承重竖梃（4px）
            R(g, mb.x0, bayTop + 2, 2, bayH - 2, P.wainsHi);
            R(g, mb.x0 + 2, bayTop + 2, 2, bayH - 2, P.cap);
            R(g, mb.x1 - 4, bayTop + 2, 2, bayH - 2, P.cap);
            R(g, mb.x1 - 2, bayTop + 2, 2, bayH - 2, P.wainsLo);
            // 内嵌整块胡桃木挂屏衬板与竖拼木纹缝
            if (mw >= 16 && bayH >= 12) {
              R(g, mb.x0 + 4, bayTop + 2, mw - 8, bayH - 4, P.wainsLo);
              R(g, mb.x0 + 6, bayTop + 4, mw - 12, bayH - 8, P.wains);
              for (let sx = mb.x0 + 24; sx < mb.x1 - 16; sx += 24) {
                R(g, sx, bayTop + 4, 2, bayH - 8, P.wainsLo);
              }
              R(g, mb.x0 + 6, bayTop + bayH - 4, mw - 12, 2, P.wainsHi);
              if (mw >= 64) {
                R(g, mb.x0 + 16, bayTop + bayH - 6, 12, 2, '#cfa358');
                R(g, mb.x1 - 28, bayTop + bayH - 6, 12, 2, '#cfa358');
              }
            }
          }
        }
      }
      wainscot(g, x, bottom - 18, w, 18, P);
      if (th.faceDecor) { g.save(); g.beginPath(); g.rect(x + 6, faceTop, w - 12, bottom - faceTop); g.clip(); th.faceDecor(g, wl, faceTop, bottom, API); g.restore(); }
      const doorH = Math.min(42, Math.max(36, bottom - faceTop - 4));
      for (const r of doorsHere) embeddedDoor(g, r.door.x, bottom, doorH, null, th.door);
      R(g, x, capY, w, T, P.cap);
      R(g, x, capY, w, 2, P.capHi);
      R(g, x, capY + 2, w, 2, P.capTop);
      R(g, x, capY + T - 2, w, 2, P.capLo);
      for (const r of doorsHere) plaque(g, r.door.x, capY - 4, r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);
      for (const ex of [x, x + w - 6]) {
        R(g, ex, capY, 6, bottom - capY, P.capLo);
        R(g, ex + (ex === x ? 0 : 4), capY, 2, bottom - capY, ex === x ? P.capHi : P.capLo);
        R(g, ex + 2, capY + 2, 2, bottom - capY - 4, P.cap);
      }
      R(g, x, bottom, w, 2, 'rgba(34,20,32,0.34)');
    } else {
      const capTop = y - face, capBot = y + h - face;
      R(g, x - 2, capTop - 2, w + 4, y + h - capTop + 4, OUT);
      R(g, x, capTop, w, capBot - capTop, P.cap);
      R(g, x, capTop, 2, capBot - capTop, P.capHi);
      R(g, x + w - 2, capTop, 2, capBot - capTop, P.capLo);
      for (let sy = capTop + 24; sy < capBot - 8; sy += 48) R(g, x + 2, sy, w - 4, 2, P.capLo);
      wallSurface(g, x, capBot, w, Math.max(4, face - 18), P);
      wainscot(g, x, y + h - 18, w, 18, P);
      R(g, x, capBot, w, 2, P.capLo);
    }
    return true;
  }

  function wall(g, wl) {
    if (wl.northBand || wl.elevatorHall) return true;
    if (typeof document !== 'undefined' && wl && typeof wl === 'object') {
      if (!wl._wallSprite) {
        const padL = 40, padR = 40, padT = Math.max(wl.face || 44, 58) + 36, padB = 20;
        const ox = Math.floor(wl.x) - padL, oy = Math.floor(wl.y) - padT;
        const cw = Math.ceil(wl.w) + padL + padR, ch = Math.ceil(wl.h) + padT + padB;
        const c = document.createElement('canvas');
        c.width = Math.max(1, cw); c.height = Math.max(1, ch);
        const cg = c.getContext('2d');
        cg.imageSmoothingEnabled = false;
        cg.translate(-ox, -oy);
        paintWall(cg, wl);
        wl._wallSprite = { c, ox, oy };
      }
      g.drawImage(wl._wallSprite.c, wl._wallSprite.ox, wl._wallSprite.oy);
      return true;
    }
    return paintWall(g, wl);
  }

  // ---------- 矮隔断：木栅栏 / 绿篱 / 玻璃护栏 ----------
  function lowWall(g, wl, th) {
    const x = snap2(wl.x), y = snap2(wl.y), w = snap2(wl.w), h = snap2(wl.h);
    const H = wl.face || 28, horiz = w >= h, st = wl.style;
    const S = Object.assign({}, (th[st] || {}), wl.skin || {});
    const bottom = y + h;
    if (st === 'hedge') {
      const dark = S.dark || '#326630', mid = S.mid || '#478b42', hi = S.hi || '#6eb85e', flower = S.flower || null;
      if (horiz) {
        R(g, x - 2, bottom - H - 2, w + 4, H + 4, '#1b341c');
        R(g, x, bottom - H, w, H, dark);
        R(g, x, bottom - 4, w, 4, '#244a22');
        for (let px = x + 6; px < x + w - 4; px += 14) {
          pxEllipse(g, px + 4, bottom - H + 4, 10, 6, mid);
          R(g, px, bottom - H, 8, 2, hi);
        }
        for (let px = x + 10; px < x + w - 6; px += 22) {
          R(g, px, bottom - H + 10, 4, 2, hi);
          if (flower && hash(px, y) > 0.55) R(g, px + 6, bottom - H + 6, 4, 4, flower[Math.floor(hash(px, 3) * flower.length)]);
        }
      } else {
        R(g, x - 6, y - H - 2, w + 12, h + H + 4, '#1b341c');
        R(g, x - 4, y - H, w + 8, h + H, dark);
        R(g, x - 4, bottom - 4, w + 8, 4, '#244a22');
        for (let py = y - H + 6; py < bottom - 8; py += 14) {
          pxEllipse(g, x + w / 2, py, w / 2 + 6, 6, mid);
          R(g, x - 2, py - 6, w + 4, 2, hi);
        }
      }
      return true;
    }
    if (st === 'glass') {
      const post = S.post || '#7e90a0', rail = S.rail || '#a8723f', pane = S.pane || 'rgba(190,232,246,0.44)';
      if (horiz) {
        R(g, x, bottom - H + 4, w, H - 6, pane);
        R(g, x, bottom - H + 6, w, 2, 'rgba(255,255,255,0.60)');
        for (let px = x; px <= x + w - 4; px += 48) { R(g, px - 2, bottom - H, 8, H, OUT_COOL); R(g, px, bottom - H, 4, H, post); }
        R(g, x + w - 4, bottom - H, 4, H, post);
        R(g, x - 2, bottom - H - 4, w + 4, 8, OUT);
        R(g, x - 2, bottom - H - 2, w + 4, 4, rail);
        R(g, x - 2, bottom - H - 2, w + 4, 2, '#d8a268');
        R(g, x, bottom - 2, w, 2, '#4a5662');
      } else {
        R(g, x, y - H, w, h + H, pane);
        for (let py = y; py <= bottom; py += 48) R(g, x - 2, py - H, w + 4, H, post);
        R(g, x + snap2(w / 2) - 2, y - H, 4, h, rail);
      }
      return true;
    }
    const post = S.post || '#f4efe4', postLo = S.postLo || '#c0b49a', railC = S.rail || '#e6dcc6', railLo = S.railLo || '#a49678';
    if (horiz) {
      for (const ry of [bottom - H + 6, bottom - H + 16]) {
        R(g, x, ry - 2, w, 8, OUT);
        R(g, x, ry, w, 4, railC);
        R(g, x, ry + 4, w, 2, railLo);
      }
      for (let px = x; px <= x + w - 6; px += 32) {
        R(g, px - 2, bottom - H - 4, 10, H + 4, OUT);
        R(g, px, bottom - H, 6, H, post);
        R(g, px + 4, bottom - H, 2, H, postLo);
        R(g, px - 2, bottom - H - 2, 10, 4, post);
      }
      R(g, x + w - 6, bottom - H, 6, H, post);
      R(g, x, bottom - 2, w, 2, 'rgba(34,20,32,0.28)');
    } else {
      const cx = x + snap2(w / 2);
      R(g, cx - 4, y - H + 6, 8, h, OUT);
      R(g, cx - 2, y - H + 6, 2, h, railC);
      R(g, cx, y - H + 6, 2, h, railLo);
      for (let py = y; py <= bottom; py += 32) {
        R(g, cx - 4, py - H - 2, 8, H + 2, post);
        R(g, cx + 2, py - H, 2, H, postLo);
      }
    }
    return true;
  }

  // ---------- 独立小建筑：紧凑 3/4 屋顶 + 立面 + 嵌墙门 ----------
  function house(g, wl, th, fid, P0) {
    const x = snap2(wl.x), y = snap2(wl.y), w = snap2(wl.w), h = snap2(wl.h);
    const S = Object.assign({ kind: 'gable' }, th.house || {}, wl.skin || {});
    const P = Object.assign({}, P0, S.wall || {});
    const bottom = y + h, facadeH = Math.min(S.facadeH || 40, Math.max(36, h - 22)), fTop = bottom - facadeH, top = y - 10;
    g.fillStyle = 'rgba(34,20,32,0.24)'; g.fillRect(x + 8, bottom, w, 6);
    R(g, x - 2, fTop - 2, w + 4, facadeH + 4, OUT);
    wallSurface(g, x, fTop, w, facadeH - 12, P);
    R(g, x, bottom - 12, w, 12, P.wains);
    R(g, x, bottom - 12, w, 2, P.wainsHi);
    R(g, x, bottom - 4, w, 4, P.base);
    const doors = roomsOn(fid).filter(r => r.door && r.door.x >= x + 20 && r.door.x <= x + w - 20 && Math.abs(r.door.y - (bottom + 20)) <= 16);
    for (let wx = x + 30; wx < x + w - 30; wx += 64) {
      if (doors.some(r => Math.abs(r.door.x - wx) < 46)) continue;
      if (S.kind === 'cabin') {
        pxEllipse(g, wx, fTop + 18, 10, 10, OUT_COOL);
        pxEllipse(g, wx, fTop + 18, 8, 8, '#8a929c');
        pxEllipse(g, wx, fTop + 18, 6, 6, '#7fc8e6');
        R(g, wx - 4, fTop + 14, 2, 4, '#ffffff');
        continue;
      }
      R(g, wx - 14, fTop + 4, 28, 22, OUT);
      R(g, wx - 12, fTop + 6, 24, 18, S.winFrame || '#6e4322');
      R(g, wx - 10, fTop + 8, 20, 14, S.glass || '#a8dcef');
      R(g, wx - 2, fTop + 8, 2, 14, S.winFrame || '#6e4322');
      R(g, wx - 10, fTop + 14, 20, 2, S.winFrame || '#6e4322');
      R(g, wx - 8, fTop + 10, 2, 4, '#ffffff');
      if (S.flowerBox !== false) {
        R(g, wx - 14, fTop + 24, 28, 4, '#a2602f');
        for (let i = 0; i < 4; i++) R(g, wx - 12 + i * 7, fTop + 20, 4, 4, ['#f06f6a', '#ffd25a', '#f5a0c8', '#ffffff'][i]);
      }
    }
    for (const r of doors) embeddedDoor(g, r.door.x, bottom, 38, null, S.door || th.door);
    if (S.kind === 'flat') {
      for (let px = x + 4; px < x + w - 8; px += 56) {
        if (doors.some(r => Math.abs(r.door.x - (px + 6)) < 30)) continue;
        R(g, px, fTop, 10, facadeH - 4, S.column || '#e9dfc8');
        R(g, px, fTop, 2, facadeH - 4, '#f8f2e4');
        R(g, px + 8, fTop, 2, facadeH - 4, '#c4b48e');
      }
      R(g, x - 6, top - 2, w + 12, Math.max(10, fTop - top - 6), OUT);
      R(g, x - 4, top, w + 8, Math.max(8, fTop - top - 8), S.roof || '#8c7a62');
      R(g, x - 4, top, w + 8, 2, S.roofHi || '#b8a688');
      for (let py = top + 4, r = 0; py < fTop - 12; py += 8, r++) {
        for (let px = x - 2 + (r % 2 ? 10 : 0); px < x + w + 2; px += 20) {
          const pw = Math.min(18, x + w + 2 - px); if (pw <= 2) continue;
          R(g, px, py, pw, 6, hash(px, py) > 0.5 ? (S.roofLo || '#7c6a52') : (S.roof || '#8c7a62'));
          R(g, px, py, pw, 2, S.roofHi || '#b8a688');
        }
      }
      const pc = doors.length ? doors[0].door.x : x + w / 2;
      for (let i = 0; i < 6; i++) R(g, pc - 30 + i * 5, fTop - 10 - i * 2, 60 - i * 10, 2, S.cornice || '#e2d5b8');
      R(g, x - 6, fTop - 8, w + 12, 8, S.cornice || '#e2d5b8');
      R(g, x - 6, fTop - 8, w + 12, 2, '#f8f1e0');
      for (let px = x - 2; px < x + w + 2; px += 8) R(g, px, fTop - 4, 4, 2, '#b8a888');
      R(g, x - 6, fTop - 2, w + 12, 2, 'rgba(34,20,32,0.3)');
    } else if (S.kind === 'cabin') {
      R(g, x - 6, top + 6, w + 12, Math.max(10, fTop - top - 6), OUT);
      R(g, x - 4, top + 8, w + 8, Math.max(8, fTop - top - 8), S.roof || '#f4efe4');
      R(g, x - 4, top + 8, w + 8, 2, '#ffffff');
      for (let py = top + 14; py < fTop - 4; py += 8) R(g, x, py, w, 2, S.roofLo || '#d8d0bc');
      for (let px = x - 2; px < x + w; px += 24) R(g, px, top, 4, 10, S.rail || '#a8723f');
      R(g, x - 4, top, w + 8, 4, S.rail || '#a8723f');
      R(g, x - 6, fTop - 6, w + 12, 6, S.trim || '#385e7a');
      R(g, x - 6, fTop - 6, w + 12, 2, '#6290b2');
      const lx = x + w - 26;
      pxEllipse(g, lx, top + 20, 8, 8, '#e0524a');
      pxEllipse(g, lx, top + 20, 5, 5, '#ffffff');
      pxEllipse(g, lx, top + 20, 2, 2, S.roof || '#f4efe4');
    } else if (S.kind === 'awning') {
      R(g, x - 6, top + 2, w + 12, Math.max(10, fTop - top - 14), OUT);
      R(g, x - 4, top + 4, w + 8, Math.max(8, fTop - top - 16), S.roof || '#efe6d2');
      R(g, x - 4, top + 4, w + 8, 2, '#fffaf0');
      const a = S.stripes || ['#e05a4c', '#fdf3e0'];
      for (let px = x - 6, i = 0; px < x + w + 6; px += 12, i++) {
        R(g, px, fTop - 14, 12, 12, a[i % 2]);
        R(g, px + 2, fTop - 2, 8, 2, a[i % 2]);
      }
      R(g, x - 6, fTop - 16, w + 12, 2, '#622c24');
      R(g, x - 6, fTop + 1, w + 12, 3, 'rgba(34,20,32,0.22)');
    } else {
      const rTop = top + 4, rBot = fTop - 4, roof = S.roof || '#b5523f', roofLo = S.roofLo || '#86362c', roofHi = S.roofHi || '#d4745c';
      R(g, x - 8, top - 2, w + 16, rBot - top + 8, OUT);
      for (let ry = rTop, r = 0; ry < rBot; ry += 6, r++) {
        R(g, x - 6, ry, w + 12, 6, r % 2 ? roof : roofHi);
        for (let px = x - 6 + (r % 2 ? 7 : 0); px < x + w + 6; px += 14) R(g, px, ry, 2, 6, roofLo);
        R(g, x - 6, ry + 4, w + 12, 2, roofLo);
      }
      R(g, x - 8, top, w + 16, 4, S.ridge || '#642922');
      R(g, x - 8, top, w + 16, 2, roofHi);
      R(g, x - 8, rBot, w + 16, 4, S.eave || '#542f1a');
      R(g, x - 6, rBot + 4, w + 12, 4, 'rgba(34,20,32,0.28)');
      if (S.chimney !== false) {
        const cx = x + snap2(w * 0.72);
        R(g, cx - 2, top - 10, 16, 12, OUT);
        R(g, cx, top - 8, 12, 10, '#9a6a52');
        R(g, cx - 2, top - 10, 16, 4, '#6e4a3a');
      }
    }
    for (const r of doors) plaque(g, r.door.x, fTop - (S.kind === 'awning' ? 22 : 12), r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);
    R(g, x, fTop, 2, facadeH, 'rgba(255,255,255,0.20)');
    R(g, x + w - 4, fTop, 4, facadeH, 'rgba(34,20,32,0.24)');
    return true;
  }
  function guessFloor(wl) { const m = /^f(\d+):/.exec(wl.id || ''); return m ? Number(m[1]) : 1; }

  // ---------- 3/4 像素石砌/木构护栏压顶 + 地基裙边 + 离屏外景（含东西 3/4 电梯翼楼无缝融合） ----------
  const HALL_SHAFT_H = 64;
  function paintEdges(g, f) {
    const th = themeOf(f.id), P = wallPal(th), EP = edgePal(th), poly = f.polygon;
    const fw = f.width || 3456, fh = f.height || 960;
    const hallsList = (f && f.lobby && Array.isArray(f.halls)) ? f.halls : [];
    const path = () => {
      g.beginPath();
      poly.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
      g.closePath();
    };
    const strokeCap = (drawPath) => {
      drawPath(); g.lineWidth = 30; g.strokeStyle = OUT; g.stroke();
      drawPath(); g.lineWidth = 24; g.strokeStyle = EP.capLo; g.stroke();
      drawPath(); g.lineWidth = 18; g.strokeStyle = EP.cap; g.stroke();
      drawPath(); g.lineWidth = 8; g.strokeStyle = EP.capHi; g.stroke();
      drawPath(); g.lineWidth = 4; g.strokeStyle = EP.trim; g.stroke();
    };
    g.save();
    g.beginPath();
    g.rect(-640, -320, fw + 1280, fh + 640);
    poly.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y));
    g.closePath();
    g.clip('evenodd');
    g.lineJoin = 'miter';
    if (th.exterior) {
      th.exterior(g, f, API, { x: -640, y: -320, w: fw + 1280, h: fh + 640 });
    }
    // 朝南外露底边下的 2× 像素地基厚边（呈现 3/4 台阶立体感）
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.abs(a.y - b.y) < 2 && b.x < a.x) {
        const sx = snap2(b.x), ex = snap2(a.x), sy = snap2(a.y);
        R(g, sx - 6, sy + 10, ex - sx + 12, 12, OUT);
        R(g, sx - 4, sy + 10, ex - sx + 8, 10, EP.capLo);
        for (let bx = sx; bx < ex; bx += 32) R(g, bx, sy + 10, 2, 10, OUT);
      }
    }
    // 电梯翼楼南向 3/4 地基裙边（skirtH = 18，与主体建筑外墙无缝交接）
    for (const h of hallsList) {
      const sy = snap2(h.y + h.h);
      const sx = snap2(h.side === 'left' ? h.x - 14 : fw + 12);
      const ex = snap2(h.side === 'left' ? -12 : h.x + h.w + 14);
      const sw = ex - sx, skirtH = 18;
      if (sw > 8) {
        R(g, sx + 2, sy + 12 + skirtH, sw - 2, 4, 'rgba(24,18,28,0.26)');
        R(g, sx, sy + 12, sw, skirtH, OUT);
        R(g, sx + 2, sy + 14, sw - 4, skirtH - 4, EP.capLo);
        R(g, sx + 2, sy + 14, sw - 4, 4, EP.cap);
        for (let bx = sx + 18; bx < ex - 8; bx += 28) R(g, bx, sy + 14, 2, skirtH - 4, OUT);
      }
    }
    // 主楼分层石砌压顶轮廓：在东西电梯厅门洞与北侧井道交接带切开（绝不封闭门洞 [h.y-2, h.y+h.h+2]）
    g.save();
    if (hallsList.length) {
      g.beginPath();
      g.rect(-640, -320, fw + 1280, fh + 640);
      for (const h of hallsList) {
        const cutX = h.side === 'left' ? h.x - 24 : h.x - 20;
        g.rect(cutX, h.y - HALL_SHAFT_H, h.w + 44, h.h + HALL_SHAFT_H);
      }
      g.clip('evenodd');
    }
    strokeCap(path);
    g.restore();
    // 电梯翼楼外围 3/4 压顶轮廓：与本层完全同源的 edgePal 围绕北井道顶、外端墙、南护栏并与主楼外墙斜接贯通
    if (hallsList.length) {
      g.save();
      g.beginPath();
      g.rect(-640, -320, fw + 1280, fh + 640);
      for (const h of hallsList) g.rect(h.x, h.y - HALL_SHAFT_H, h.w, h.h + HALL_SHAFT_H);
      g.clip('evenodd');
      for (const h of hallsList) {
        const edgeX = h.side === 'left' ? 0 : fw;
        const outerX = h.side === 'left' ? h.x : h.x + h.w;
        const ny = h.y - HALL_SHAFT_H, sy = h.y + h.h;
        strokeCap(() => {
          g.beginPath();
          g.moveTo(edgeX, ny - 16);
          g.lineTo(edgeX, ny);
          g.lineTo(outerX, ny);
          g.lineTo(outerX, sy);
          g.lineTo(edgeX, sy);
          g.lineTo(edgeX, sy + 16);
        });
      }
      g.restore();
    }
    g.restore();
    // 护栏砖缝刻度（避开电梯厅开口，并为电梯翼楼三面外墙同步刻画砖缝）
    g.save();
    const inHallWallCut = (x, yy) => hallsList.some(h => {
      const ex = h.side === 'left' ? 0 : fw;
      return Math.abs(x - ex) < 4 && yy >= h.y - HALL_SHAFT_H - 4 && yy <= h.y + h.h + 4;
    });
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (Math.abs(a.y - b.y) < 2) {
        const x0 = snap2(Math.min(a.x, b.x)), x1 = snap2(Math.max(a.x, b.x)), y = snap2(a.y);
        for (let xx = x0 + 16; xx < x1 - 12; xx += 32) R(g, xx, y - 6, 2, 12, EP.mortar);
      } else if (Math.abs(a.x - b.x) < 2) {
        const y0 = snap2(Math.min(a.y, b.y)), y1 = snap2(Math.max(a.y, b.y)), x = snap2(a.x);
        for (let yy = y0 + 16; yy < y1 - 12; yy += 32) {
          if (!inHallWallCut(x, yy)) R(g, x - 6, yy, 12, 2, EP.mortar);
        }
      }
    }
    for (const h of hallsList) {
      const hx0 = snap2(h.x), hx1 = snap2(h.x + h.w);
      const ny = snap2(h.y - HALL_SHAFT_H), sy = snap2(h.y + h.h);
      const outerX = h.side === 'left' ? hx0 : hx1;
      for (let xx = hx0 + 16; xx < hx1 - 12; xx += 32) {
        R(g, xx, ny - 12, 2, 10, EP.mortar);
        R(g, xx, sy + 2, 2, 10, EP.mortar);
      }
      const mx = h.side === 'left' ? outerX - 12 : outerX + 2;
      for (let yy = ny + 16; yy < sy - 12; yy += 32) R(g, mx, yy, 10, 2, EP.mortar);
    }
    g.restore();
    // 内侧 AO 柔影（在电梯厅门洞处自然断开，保持通道敞亮贯通）
    g.save();
    path(); g.clip();
    if (hallsList.length) {
      g.beginPath();
      g.rect(-640, -320, fw + 1280, fh + 640);
      for (const h of hallsList) {
        const ex = h.side === 'left' ? 0 : fw;
        g.rect(ex - 16, h.y - 2, 32, h.h + 4);
      }
      g.clip('evenodd');
    }
    path(); g.lineWidth = 12; g.strokeStyle = 'rgba(34,20,32,0.20)'; g.stroke();
    g.restore();
    // 庭院出入口：截断护栏压顶，铺 3 级暖石台阶 + 两侧矮石墩（与 floors.js yards.gates 同源）
    for (const yd of (f.yards || [])) for (const gt of (yd.gates || [])) paintGate(g, f, gt, P);
    return true;
  }
  function paintGate(g, f, gt, P) {
    const horiz = Math.abs(gt.y2 - gt.y1) < 2;
    const inside = (x, y) => {
      const poly = f.polygon; let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) c = !c;
      }
      return c;
    };
    const STEP = ['#f0e8da', '#e6dcd0', '#c7b8a2'], RISER = '#8e7a5c';
    if (horiz) {
      const x1 = snap2(gt.x1), x2 = snap2(gt.x2), y = snap2(gt.y1), wd = x2 - x1;
      const down = inside((x1 + x2) / 2, y - 4) ? 1 : -1;      // 台阶朝庭院一侧延伸
      const y0 = down > 0 ? y - 14 : y + 14;
      R(g, x1, Math.min(y0, y0 + down * 40), wd, 40, OUT);
      for (let s = 0; s < 3; s++) {
        const sy = y0 + down * (s * 12);
        const inset = s * 4;
        R(g, x1 + 2 + inset, down > 0 ? sy : sy - 12, wd - 4 - inset * 2, 12, STEP[s]);
        R(g, x1 + 2 + inset, down > 0 ? sy + 10 : sy - 2, wd - 4 - inset * 2, 2, RISER);
        R(g, x1 + 2 + inset, down > 0 ? sy : sy - 12, wd - 4 - inset * 2, 2, '#f8f0dc');
        for (let jx = x1 + 22 + inset + s * 6; jx < x2 - 12 - inset; jx += 34) R(g, jx, down > 0 ? sy + 2 : sy - 10, 2, 8, STEP[Math.min(2, s + 1)]);
      }
      for (const px of [x1 - 10, x2 - 6]) {
        R(g, px, y - 22, 16, 30, OUT);
        R(g, px + 2, y - 20, 12, 26, P.cap);
        R(g, px + 2, y - 20, 12, 4, P.capHi);
        R(g, px + 2, y + 2, 12, 4, P.capLo);
      }
    } else {
      const y1 = snap2(gt.y1), y2 = snap2(gt.y2), x = snap2(gt.x1), ht = y2 - y1;
      const right = inside(x - 4, (y1 + y2) / 2) ? 1 : -1;
      const x0 = right > 0 ? x - 14 : x + 14;
      R(g, Math.min(x0, x0 + right * 40), y1, 40, ht, OUT);
      for (let s = 0; s < 3; s++) {
        const sx = x0 + right * (s * 12), inset = s * 4;
        R(g, right > 0 ? sx : sx - 12, y1 + 2 + inset, 12, ht - 4 - inset * 2, STEP[s]);
        R(g, right > 0 ? sx + 10 : sx - 2, y1 + 2 + inset, 2, ht - 4 - inset * 2, RISER);
        R(g, right > 0 ? sx : sx - 12, y1 + 2 + inset, 12, 2, '#f8f0dc');
      }
      for (const py of [y1 - 12, y2 - 4]) {
        R(g, x - 8, py, 16, 16, OUT);
        R(g, x - 6, py + 2, 12, 12, P.cap);
        R(g, x - 6, py + 2, 12, 4, P.capHi);
      }
    }
  }

  function edges(g, f) {
    if (typeof document !== 'undefined' && f && f.id) {
      const ox = -640, oy = -320;
      const cw = (f.width || 3456) + 1280, ch = (f.height || 960) + 640;
      const layer = getFloorLayer('ed:' + f.id, cw, ch, ox, oy, cg => paintEdges(cg, f));
      g.drawImage(layer.c, layer.ox, layer.oy);
      return true;
    }
    return paintEdges(g, f);
  }

  // ---------- 3/4 视角手工 2× 像素建筑家具库（统一左上光源 + HSV 色相偏移阴影 + 0 半透明像素） ----------
  const C = {};
  C.fountain = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h);
    const rx = snap2(f.w / 2), ry = snap2(f.h / 2) - 4, cy = by - ry - 2;
    // 3/4 洞石水池基座与受光池壁
    pxEllipse(g, cx, cy + 6, rx + 2, ry + 2, OUT_COOL);
    pxEllipse(g, cx, cy + 4, rx, ry, '#8d7f70');
    pxEllipse(g, cx, cy, rx + 2, ry + 2, OUT_COOL);
    pxEllipse(g, cx, cy, rx, ry, '#f0e8dc');
    pxEllipse(g, cx - 2, cy - 2, rx - 4, ry - 4, '#fcf8f0');
    pxEllipse(g, cx, cy, rx - 6, ry - 6, '#cfc2b0');
    // 多层次晴空碧水与成簇涟漪
    pxEllipse(g, cx, cy + 2, rx - 12, ry - 8, '#286c8e');
    pxEllipse(g, cx, cy + 2, rx - 16, ry - 10, '#4498bd');
    pxEllipse(g, cx - 4, cy, rx - 26, ry - 14, '#62b8d8');
    for (const [dx, dy, lw] of [[-46, -4, 10], [34, 4, 8], [-24, 10, 12], [22, -8, 10]]) {
      if (Math.abs(dx) < rx - 22) R(g, cx + dx, cy + dy, lw, 2, '#d4f3fc');
    }
    // 中央双层石雕涌泉钵
    R(g, cx - 10, cy - 28, 20, 30, OUT_COOL);
    R(g, cx - 8, cy - 26, 16, 28, '#dfd4c4');
    R(g, cx - 8, cy - 26, 4, 28, '#fcf8f0');
    R(g, cx + 4, cy - 26, 4, 28, '#a69886');
    pxEllipse(g, cx, cy - 28, 28, 8, OUT_COOL);
    pxEllipse(g, cx, cy - 28, 26, 6, '#f0e8dc');
    pxEllipse(g, cx, cy - 28, 20, 4, '#4498bd');
    // 像素涌泉水柱与落水珠簇
    R(g, cx - 2, cy - 46, 4, 18, '#d4f3fc');
    R(g, cx - 2, cy - 50, 4, 4, '#ffffff');
    R(g, cx - 6, cy - 42, 2, 10, '#a8e4f8');
    R(g, cx + 4, cy - 42, 2, 10, '#a8e4f8');
    R(g, cx - 14, cy - 32, 2, 8, '#d4f3fc');
    R(g, cx + 12, cy - 32, 2, 8, '#d4f3fc');
  };
  C.pillar = (g, f) => {
    // 现代研发大堂洞石胡桃木复合方柱（剔除旧版贴在柱身上的怪异绿条）
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h), H = 92, w = 24, x = cx - w / 2;
    R(g, x - 6, by - 14, w + 12, 14, OUT);
    R(g, x - 4, by - 12, w + 8, 12, '#75482b');
    R(g, x - 4, by - 12, w + 8, 2, '#ad7449');
    R(g, x - 4, by - 4, w + 8, 2, '#4a2b1a');
    R(g, x - 2, by - H, w + 4, H - 12, OUT_COOL);
    R(g, x, by - H, w, H - 12, '#ebe3d5');
    R(g, x, by - H, 6, H - 12, '#fbf7f0');
    R(g, x + w - 6, by - H, 6, H - 12, '#c7baa6');
    // 两条纤细竖向凹槽线
    R(g, x + 8, by - H + 8, 2, H - 26, '#cfc2ae');
    R(g, x + 14, by - H + 8, 2, H - 26, '#cfc2ae');
    // 顶部胡桃木柱头压檐
    R(g, x - 6, by - H - 10, w + 12, 10, OUT);
    R(g, x - 4, by - H - 8, w + 8, 8, '#8a5634');
    R(g, x - 4, by - H - 8, w + 8, 2, '#bd8355');
    R(g, x - 2, by - H - 12, w + 4, 4, '#ede5d8');
  };
  C.planter = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 暖白洞石边条与雪松木花槽（3/4 厚度与槽口泥土）
    outlineBox(g, x, by - 20, w, 20, '#965d36', '#c68452', '#5c341d');
    for (let px = x + 14; px < x + w - 8; px += 20) R(g, px, by - 16, 2, 12, '#734324');
    outlineBox(g, x - 2, by - 26, w + 4, 8, '#ebe3d5', '#fbf7f0', '#bfb29e', OUT);
    R(g, x + 4, by - 24, w - 8, 2, '#472c1e');
    // 有机蓬松黄杨叶团与点缀花簇（告别方格栅栏叶）
    const cols = ['#f07167', '#ffd166', '#f4a4c0', '#fff8e8'];
    for (let px = x + 10, i = 0; px < x + w - 8; px += 16, i++) {
      const lift = (i % 2) * 2;
      pxEllipse(g, px, by - 28 - lift, 10, 8, '#1b3624');
      pxEllipse(g, px, by - 28 - lift, 8, 6, i % 2 ? '#346e3f' : '#2c5e38');
      pxEllipse(g, px - 2, by - 30 - lift, 6, 4, '#569e52');
      R(g, px - 4, by - 32 - lift, 4, 2, '#86cc6e');
      if (i % 2 === 0) {
        const fc = cols[(i + Math.round(x / 11)) % cols.length];
        R(g, px + 2, by - 32 - lift, 4, 4, fc);
        R(g, px + 2, by - 32 - lift, 2, 2, '#fffdf4');
      }
    }
  };
  C.stall = (g, f) => {
    // 园区手冲咖啡 / 文创轻食精品亭（墨绿与暖米织物遮阳篷 + 胡桃木格栅吧台 + 陈列器物）
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w), top = by - 80;
    const awn = f.awning || (/文创|果酱|蜂蜜|花/.test(f.label) ? ['#9e4c3b', '#f6efe2'] : ['#2f5d48', '#f5eee2']);
    // 两侧深古铜支撑立柱
    R(g, x + 2, top + 14, 6, 64, OUT);
    R(g, x + w - 8, top + 14, 6, 64, OUT);
    R(g, x + 4, top + 16, 2, 60, '#5a4d46');
    R(g, x + w - 6, top + 16, 2, 60, '#5a4d46');
    // 3/4 竖格栅原木柜体 + 石材台面
    outlineBox(g, x, by - 30, w, 30, '#996038', '#c48654', '#59331c');
    for (let px = x + 8; px < x + w - 6; px += 10) R(g, px, by - 24, 2, 18, '#6e4023');
    outlineBox(g, x - 2, by - 36, w + 4, 8, '#efe7da', '#fcf8f2', '#bfb29e', OUT);
    // 台面手冲咖啡壶/烘焙玻璃罩/菜单黑板
    outlineBox(g, x + 10, by - 50, 26, 16, '#2b3632', '#52635c', '#1b2420');
    R(g, x + 14, by - 46, 14, 2, '#f6e8c8');
    R(g, x + 14, by - 42, 18, 2, '#ffd166');
    const trayX = x + 44, trayW = Math.max(28, snap2(w * 0.36));
    outlineBox(g, trayX, by - 48, trayW, 14, '#d8eef6', '#ffffff', '#94bac9', OUT_COOL);
    for (let px = trayX + 4, i = 0; px < trayX + trayW - 8; px += 12, i++) {
      R(g, px, by - 42, 8, 4, i % 2 ? '#d9934c' : '#c9644a');
      R(g, px + 2, by - 44, 4, 2, '#f7dcb4');
    }
    if (w >= 128) {
      outlineBox(g, x + w - 36, by - 52, 22, 18, '#545c66', '#88929e', '#323840', OUT_COOL);
      R(g, x + w - 32, by - 48, 6, 4, '#ffd166');
      R(g, x + w - 22, by - 42, 6, 6, '#f8f4ec');
    }
    // 顶部定制坡面遮阳篷（宽幅条纹 + 垂帘阴影）
    R(g, x - 8, top - 2, w + 16, 22, OUT);
    const seg = 16;
    for (let i = 0, px = x - 6; px < x + w + 6; px += seg, i++) {
      const sw = Math.min(seg, x + w + 6 - px);
      const col = awn[i % 2];
      R(g, px, top, sw, 14, col);
      R(g, px, top, sw, 2, i % 2 ? '#ffffff' : '#4a8066');
      R(g, px, top + 14, sw, 2, '#221724');
      R(g, px + 2, top + 16, Math.max(2, sw - 4), 4, col);
    }
  };
  C.coffeetable = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 现代胡桃木圆角茶几（四条斜削木腿 + 下层杂志搁板 + 顶面受光倒角 + 陶瓷咖啡杯与画册）
    for (const lx of [x + 8, x + w - 14]) {
      R(g, lx, by - 14, 6, 14, OUT);
      R(g, lx + 2, by - 12, 2, 10, '#6e4124');
    }
    R(g, x + 12, by - 8, w - 24, 4, '#59331c');
    outlineBox(g, x, by - 24, w, 14, '#a86b3e', '#d19462', '#6e4023', OUT, true);
    R(g, x + 6, by - 20, w - 12, 6, '#ba7c4c');
    if (w >= 56) {
      outlineBox(g, x + 12, by - 26, 22, 8, '#f4ede0', '#ffffff', '#bfb29e');
      R(g, x + 16, by - 24, 12, 2, '#496d8c');
      R(g, x + w - 24, by - 26, 10, 6, OUT);
      R(g, x + w - 22, by - 24, 6, 4, '#fcf8f0');
      R(g, x + w - 22, by - 24, 6, 2, '#7a4828');
    }
  };
  C.armchair = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 区分实木办公/餐边单椅 vs 布艺休闲扶手沙发椅
    if (/木椅|木凳|伴读|主讲|球员|俱乐部|司书|藤椅/.test(f.label || '')) {
      const cw = Math.min(34, Math.max(24, w - 8)), cx = snap2(x + (w - cw) / 2);
      R(g, cx + 2, by - 12, 6, 12, OUT);
      R(g, cx + cw - 8, by - 12, 6, 12, OUT);
      R(g, cx + 4, by - 10, 2, 8, '#6e4124');
      R(g, cx + cw - 6, by - 10, 2, 8, '#6e4124');
      outlineBox(g, cx + 2, by - 40, cw - 4, 18, '#965d36', '#c48654', '#5c341d', OUT, true);
      R(g, cx + 6, by - 34, cw - 12, 4, '#6e4023');
      outlineBox(g, cx, by - 24, cw, 14, '#c48a4e', '#e2ac6e', '#7d4f28', OUT);
      R(g, cx + 4, by - 22, cw - 8, 6, '#5b7d66');
      return;
    }
    const [main, dark, hi] = f.tone || (/茶歇|红|暖/.test(f.label)
      ? ['#b85a48', '#7d362c', '#da806c']
      : /共读|绿|林/.test(f.label) ? ['#568265', '#355742', '#7da88a']
      : /蓝|海|接待/.test(f.label) ? ['#4c7394', '#2e4b66', '#749ec0']
      : ['#c48844', '#855526', '#e0a966']);
    R(g, x + 6, by - 6, 6, 6, OUT);
    R(g, x + w - 12, by - 6, 6, 6, OUT);
    R(g, x + 8, by - 4, 2, 4, '#6e4124');
    R(g, x + w - 10, by - 4, 2, 4, '#6e4124');
    // 3/4 靠背顶厚面 + 饱满坐垫 + 两侧微倾扶手
    outlineBox(g, x + 4, by - 44, w - 8, 22, main, hi, dark, OUT, true);
    R(g, x + 8, by - 38, w - 16, 12, main);
    outlineBox(g, x + 6, by - 24, w - 12, 18, main, hi, dark);
    R(g, x + 8, by - 12, w - 16, 4, dark);
    outlineBox(g, x, by - 32, 10, 26, dark, hi, OUT, OUT, true);
    outlineBox(g, x + w - 10, by - 32, 10, 26, dark, hi, OUT, OUT, true);
  };
  C.sofa = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    const [main, dark, hi] = f.tone || (/东廊|黄|阳光|沐光/.test(f.label)
      ? ['#c48f3e', '#855c22', '#e0b062']
      : /迎宾|蓝|海/.test(f.label) ? ['#486f8e', '#2c4861', '#7099ba']
      : /绿|林|草/.test(f.label) ? ['#558064', '#345440', '#7ca68a']
      : ['#b35644', '#783328', '#d47864']);
    // 实木矮脚与底框
    for (const lx of [x + 8, x + w - 14]) {
      R(g, lx, by - 6, 6, 6, OUT);
      R(g, lx + 2, by - 4, 2, 4, '#6e4124');
    }
    R(g, x + 8, by - 8, w - 16, 4, '#59331c');
    // 3/4 靠背顶面与分格软包
    outlineBox(g, x + 4, by - 48, w - 8, 24, dark, hi, dark, OUT, true);
    const n = Math.max(2, Math.round((w - 24) / 54)), cw = (w - 24) / n;
    for (let i = 0; i < n; i++) {
      const cx = snap2(x + 12 + i * cw), cww = snap2(cw);
      outlineBox(g, cx, by - 42, cww, 20, main, hi, dark);
      // 坐垫顶面（亮）与前缘厚裙（暗）分离
      outlineBox(g, cx, by - 24, cww, 18, main, hi, dark);
      R(g, cx + 2, by - 20, cww - 4, 8, main);
      R(g, cx + 2, by - 12, cww - 4, 4, dark);
    }
    // 两侧宽厚扶手与双色几何靠枕
    outlineBox(g, x, by - 36, 14, 30, dark, hi, OUT, OUT, true);
    outlineBox(g, x + w - 14, by - 36, 14, 30, dark, hi, OUT, OUT, true);
    if (w >= 110) {
      outlineBox(g, x + 16, by - 38, 18, 14, '#f2e6d4', '#ffffff', '#bfb29e', OUT, true);
      outlineBox(g, x + w - 34, by - 38, 18, 14, '#d99a4e', '#f2be78', '#966328', OUT, true);
    }
  };
  C.bench = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 现代中庭原木长凳（深灰金属腿架 + 温润橡木条板座面）
    for (const lx of [x + 8, x + w - 16]) {
      R(g, lx, by - 18, 8, 18, OUT_COOL);
      R(g, lx + 2, by - 16, 4, 14, '#4c545e');
    }
    if (w >= 96) {
      const mx = snap2(x + w / 2 - 4);
      R(g, mx, by - 16, 8, 14, OUT_COOL);
      R(g, mx + 2, by - 14, 4, 10, '#3a414a');
    }
    outlineBox(g, x, by - 28, w, 14, '#b87b48', '#d69c68', '#734424', OUT);
    R(g, x + 4, by - 22, w - 8, 2, '#8a542e');
  };
  C.vending = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h), w = 50, x = cx - w / 2, top = by - 78;
    const body = f.tone || (/轻食|草|花|绿|果汁/.test(f.label)
      ? ['#3f785c', '#264d3b', '#66a182']
      : /冰|海|蓝|云/.test(f.label) ? ['#437aa3', '#284f6e', '#6ea4cc']
      : ['#4a5564', '#2c3440', '#738091']);
    outlineBox(g, x, top, w, 78, body[0], body[2], body[1], OUT_COOL, true);
    outlineBox(g, x + 6, top + 8, 26, 46, '#1e2a34', '#384c5c', '#141c24', OUT_COOL);
    const items = ['#ffd166', '#84c973', '#f07167', '#6ec4e0', '#f7f3eb', '#e89b4e'];
    for (let r = 0; r < 4; r++) {
      R(g, x + 8, top + 18 + r * 10, 22, 2, '#4c5e6c');
      for (let c = 0; c < 3; c++) R(g, x + 9 + c * 7, top + 12 + r * 10, 4, 6, items[(r * 3 + c + cx) % items.length]);
    }
    R(g, x + 8, top + 10, 2, 38, '#a6dcf0');
    outlineBox(g, x + 34, top + 10, 10, 24, '#ebe4d8', '#ffffff', '#b5aa9a', OUT_COOL);
    R(g, x + 36, top + 14, 6, 4, '#2b3642');
    R(g, x + 36, top + 22, 6, 4, f.container ? '#ffe26a' : '#7ec484');
    outlineBox(g, x + 6, top + 58, 38, 12, '#1c242c', '#323e4a', '#12171d', OUT_COOL);
  };
  const PRODUCE = [['#f07167', '#c24740'], ['#ffd166', '#d99e32'], ['#84c973', '#539449'], ['#e89b4e', '#ba6e26']];
  function crateAt(g, x, by, w, h, seed, sealed, goods) {
    const rx = snap2(x), rby = snap2(by), rw = snap2(w), rh = snap2(h);
    // 3/4 封盖储物木箱（顶盖受光面 + 前立面条板 + 深铜包角 + 标签贴，仅蔬果箱露鲜果）
    outlineBox(g, rx, rby - rh, rw, rh, '#a66d3f', '#cf9663', '#693d20');
    R(g, rx + 2, rby - rh + 2, rw - 4, 8, '#c48a57');
    R(g, rx + 2, rby - rh + 10, rw - 4, 2, '#5c341b');
    R(g, rx + 2, rby - 10, rw - 4, 2, '#784726');
    // 金属包角与物流铭牌
    for (const cx of [rx + 2, rx + rw - 8]) {
      R(g, cx, rby - rh + 2, 6, 4, '#4a4340');
      R(g, cx, rby - 6, 6, 4, '#4a4340');
    }
    if (rw >= 36) {
      R(g, rx + snap2(rw / 2) - 8, rby - rh + 14, 16, 8, '#f5eee0');
      R(g, rx + snap2(rw / 2) - 6, rby - rh + 16, 10, 2, '#8a5a36');
    }
    if (!sealed) {
      const c = (goods || PRODUCE)[seed % (goods || PRODUCE).length];
      for (let k = 0; k < Math.floor((rw - 12) / 10); k++) {
        R(g, rx + 6 + k * 10, rby - rh - 4, 8, 6, OUT);
        R(g, rx + 8 + k * 10, rby - rh - 2, 4, 4, c[k % 2]);
      }
    }
  }
  C.crate = (g, f) => {
    const showProduce = /蔬果|鲜果|果蔬/.test(f.label || '');
    crateAt(g, Math.round(f.x + 4), f.y + f.h, Math.round(f.w - 8), 28, Math.floor(hash(Math.round(f.x), Math.round(f.y)) * 97), !showProduce, f.goods);
  };
  C.boxstack = (g, f) => {
    const x = snap2(f.x + 4), by = snap2(f.y + f.h), w = snap2(f.w - 8), seed = Math.floor(hash(Math.round(f.y), Math.round(f.x)) * 97);
    const showProduce = /蔬果|鲜果|果蔬/.test(f.label || '');
    crateAt(g, x, by, w, 26, seed, true, f.goods);
    crateAt(g, x + 8, by - 24, Math.max(24, w - 16), 22, seed + 1, !showProduce, f.goods);
  };
  C.cooler = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h), w = 30, x = cx - w / 2;
    outlineBox(g, x, by - 48, w, 48, '#ede7dc', '#ffffff', '#b8aea0', OUT_COOL);
    R(g, x + 4, by - 36, w - 8, 14, '#2c3640');
    R(g, x + 6, by - 34, 6, 4, '#e05a4f');
    R(g, x + 18, by - 34, 6, 4, '#4e94cc');
    R(g, x + 6, by - 26, w - 12, 2, '#8b95a0');
    outlineBox(g, x + 4, by - 68, w - 8, 20, '#88cde8', '#cef0fc', '#4c94b8', OUT_COOL, true);
    R(g, x + 8, by - 64, 4, 12, '#ffffff');
  };
  C.tv = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h);
    const w = Math.min(108, Math.max(48, snap2(f.w - 8))), x = cx - w / 2;
    const wallMount = f.wallMount || (!f.roomId && f.y <= 136) || (!!f.roomId && f.y <= 88);
    const top = wallMount ? by - 46 : by - 64;
    if (!wallMount) {
      R(g, x + 10, top + 38, 6, 26, OUT_COOL);
      R(g, x + w - 16, top + 38, 6, 26, OUT_COOL);
      R(g, x + 12, top + 38, 2, 24, '#5a626c');
      R(g, x + w - 14, top + 38, 2, 24, '#5a626c');
    } else {
      R(g, x + 2, top + 42, w - 2, 4, '#594a3e');
    }
    outlineBox(g, x, top, w, 42, '#2d3540', '#586473', '#191e26', OUT_COOL);
    R(g, x + 4, top + 4, w - 8, 34, '#1e303c');
    R(g, x + 4, top + 4, w - 8, 8, '#2b4759');
    // 园区导览/晴雨仪表盘 UI 卡片
    R(g, x + 8, top + 16, 16, 16, '#28404f');
    R(g, x + 12, top + 20, 8, 8, '#ffd166');
    if (w >= 68) {
      R(g, x + 28, top + 16, w - 36, 6, '#76c4e0');
      R(g, x + 28, top + 26, Math.max(12, w - 48), 4, '#88cc7a');
      R(g, x + 8, top + 6, 18, 4, '#e6f4fa');
    }
    R(g, x + w - 14, top + 6, 6, 4, '#ffffff');
  };
  C.whiteboard = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h);
    const w = Math.min(116, Math.max(52, snap2(f.w - 6))), x = cx - w / 2;
    const wallMount = f.wallMount || (!f.roomId && f.y <= 136) || (!!f.roomId && f.y <= 88);
    const top = wallMount ? by - 46 : by - 64;
    if (!wallMount) {
      R(g, x + 8, top + 40, 6, 24, OUT);
      R(g, x + w - 14, top + 40, 6, 24, OUT);
      R(g, x + 10, top + 40, 2, 22, '#7a4b2a');
      R(g, x + w - 12, top + 40, 2, 22, '#7a4b2a');
    } else {
      R(g, x + 2, top + 42, w - 2, 4, '#6e5846');
    }
    outlineBox(g, x, top, w, 42, '#9e683c', '#c99260', '#5e381e');
    R(g, x + 4, top + 4, w - 8, 34, '#f7f4ec');
    R(g, x + 4, top + 4, w - 8, 2, '#ffffff');
    // 研发看板泳道与便签贴
    const notes = ['#ffe89e', '#ffd4cc', '#cde8f8', '#d4f0c8'];
    const cols = Math.max(2, Math.min(4, Math.floor((w - 12) / 24)));
    for (let i = 0; i < cols; i++) {
      const nx = x + 8 + i * Math.floor((w - 14) / cols);
      R(g, nx, top + 8, 16, 10, notes[i % 4]);
      R(g, nx + 2, top + 12, 10, 2, '#8c7d6b');
      if (i % 2 === 0) {
        R(g, nx, top + 22, 16, 10, notes[(i + 2) % 4]);
        R(g, nx + 2, top + 26, 10, 2, '#8c7d6b');
      }
    }
    R(g, x + 10, top + 36, Math.min(32, w - 20), 2, '#4a525c');
    R(g, x + 12, top + 34, 6, 2, '#e05a4f');
    R(g, x + 20, top + 34, 6, 2, '#3f7fa8');
  };
  C.floorlamp = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h);
    pxEllipse(g, cx, by - 4, 10, 4, OUT);
    pxEllipse(g, cx, by - 4, 8, 3, '#8c683e');
    R(g, cx - 2, by - 56, 4, 52, OUT);
    R(g, cx - 2, by - 56, 2, 50, '#c89e56');
    outlineBox(g, cx - 14, by - 74, 28, 20, '#f5d98e', '#fff6d6', '#c4903e', OUT, true);
    R(g, cx - 8, by - 54, 16, 2, '#ffeab0');
  };
  C.readtable = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 北侧内推伴读木椅靠背
    for (const cx of [x + snap2(w * 0.28), x + snap2(w * 0.72)]) {
      outlineBox(g, cx - 12, by - 44, 24, 12, '#7d4c29', '#ad7246', '#4f2d18', OUT, true);
    }
    R(g, x + 6, by - 16, 6, 16, OUT);
    R(g, x + w - 12, by - 16, 6, 16, OUT);
    R(g, x + 8, by - 14, 2, 12, '#6e4124');
    R(g, x + w - 10, by - 14, 2, 12, '#6e4124');
    // 3/4 暖橡木大桌面（顶面高明度 + 前裙深明度）
    outlineBox(g, x, by - 36, w, 22, '#ba824c', '#d8a26c', '#754624');
    R(g, x + 2, by - 18, w - 4, 4, '#754624');
    // 摊开画册、黄铜阅览台灯与小绿植
    outlineBox(g, x + 16, by - 32, 28, 10, '#fcf8f0', '#ffffff', '#c7baa6');
    R(g, x + 30, by - 30, 2, 6, '#8a5a36');
    if (w >= 110) {
      R(g, x + snap2(w / 2) - 2, by - 44, 4, 12, '#8c683e');
      outlineBox(g, x + snap2(w / 2) - 10, by - 50, 20, 8, '#52785e', '#7aa486', '#33523e');
      outlineBox(g, x + w - 44, by - 32, 22, 10, '#486f8e', '#7099ba', '#2c4861');
    }
  };
  C.plant = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h);
    const pot = f.pot || (/烘焙|餐厅|茶|花|向日葵|金桔/.test(f.label || '')
      ? ['#c46d48', '#854229', '#e2916b']
      : ['#ebe4d8', '#b5aa9a', '#ffffff']);
    // 3/4 微收口陶瓷/赤陶花盆与盆口深土
    outlineBox(g, cx - 12, by - 20, 24, 20, pot[0], pot[2], pot[1]);
    outlineBox(g, cx - 14, by - 26, 28, 8, pot[0], pot[2], pot[1]);
    R(g, cx - 10, by - 24, 20, 2, '#3d281c');
    // 分枝木本主干
    R(g, cx - 2, by - 50, 4, 26, '#4f311c');
    R(g, cx - 2, by - 48, 2, 20, '#784c2e');
    R(g, cx - 8, by - 42, 6, 4, '#4f311c');
    R(g, cx + 2, by - 44, 6, 4, '#4f311c');
    // 5 团有机错落琴叶榕/散尾葵叶冠（4 阶 HSV 色移绿，彻底淘汰黑框方块堆叠）
    const lobes = [
      [8, -38, 12, 8, false],
      [-10, -40, 12, 8, true],
      [6, -50, 12, 9, false],
      [-8, -52, 12, 9, true],
      [0, -60, 14, 10, false]
    ];
    for (const [dx, dy, rx, ry] of lobes) pxEllipse(g, cx + dx, by + dy, rx + 2, ry + 2, '#183024');
    for (const [dx, dy, rx, ry, lit] of lobes) {
      pxEllipse(g, cx + dx, by + dy, rx, ry, lit ? '#3a7844' : '#295936');
      pxEllipse(g, cx + dx - 2, by + dy - 2, rx - 3, ry - 3, lit ? '#5ea658' : '#3a7844');
      if (lit) R(g, cx + dx - 4, by + dy - ry + 2, 6, 2, '#92d478');
    }
    // 叶丛间隙深影与顶部嫩叶亮簇（增强立体球面体积）
    R(g, cx - 2, by - 46, 6, 4, '#1e422b');
    R(g, cx - 4, by - 68, 6, 2, '#a6e288');
  };
  C.shelf = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w), H = 82, top = by - H;
    const wood = f.wood || ['#82502c', '#54301a', '#b57b4c'];
    // 3/4 胡桃木书柜：外挑顶冠 + 背板深影 + 三层层板投影 + 成组色系书脊与陶瓷书立
    outlineBox(g, x, top, w, H, '#362116', wood[2], wood[1]);
    outlineBox(g, x - 2, top - 6, w + 4, 8, wood[0], wood[2], wood[1]);
    R(g, x + 2, top + 2, 4, H - 6, wood[0]);
    R(g, x + w - 6, top + 2, 4, H - 6, wood[0]);
    const spines = f.spines || ['#c45848', '#487699', '#d9a448', '#568c58', '#6e568c', '#ede5d8', '#b8733e'];
    for (let s = 0; s < 3; s++) {
      const sy = top + 6 + s * 24;
      R(g, x + 6, sy, w - 12, 2, '#241510');
      R(g, x + 4, sy + 20, w - 8, 4, wood[0]);
      R(g, x + 4, sy + 20, w - 8, 2, wood[2]);
      let bx = x + 8, i = 0;
      while (bx < x + w - 14) {
        const k = hash(bx + s * 31, Math.round(x));
        if (k > 0.93 && s === 1 && bx < x + w - 28) {
          outlineBox(g, bx + 2, sy + 8, 14, 12, '#ebe3d5', '#ffffff', '#b5aa9a');
          R(g, bx + 6, sy + 4, 6, 4, '#569e52');
          bx += 18;
          continue;
        }
        const bw = 4 + Math.floor(k * 2) * 2, bh = 12 + Math.floor(hash(bx, s) * 3) * 2;
        const col = spines[(i + s * 2 + Math.round(x / 16)) % spines.length];
        R(g, bx, sy + 20 - bh, bw, bh, col);
        R(g, bx, sy + 20 - bh, bw, 2, '#f5eee0');
        bx += bw + (k > 0.72 ? 2 : 0);
        i++;
      }
    }
  };
  C.table = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    const label = f.label || '';
    // 变体 1：圆桌 / 茶几（烘焙圆桌、鲜果特饮圆桌、茶室茶几）
    if (f.round || /圆桌|特饮|茶几/.test(label)) {
      const cx = snap2(x + w / 2), rx = Math.min(48, Math.max(28, snap2(w * 0.44))), ry = 16;
      if (w >= 76) {
        outlineBox(g, cx - rx - 10, by - 32, 14, 20, '#7d4c29', '#ad7246', '#4f2d18', OUT, true);
        outlineBox(g, cx + rx - 4, by - 32, 14, 20, '#7d4c29', '#ad7246', '#4f2d18', OUT, true);
      }
      R(g, cx - 4, by - 20, 8, 18, OUT);
      R(g, cx - 2, by - 18, 4, 14, '#4c545e');
      pxEllipse(g, cx, by - 4, 14, 4, OUT);
      pxEllipse(g, cx, by - 22, rx + 2, ry + 2, OUT);
      pxEllipse(g, cx, by - 22, rx, ry, '#87552e');
      pxEllipse(g, cx, by - 24, rx, ry - 2, '#c28852');
      pxEllipse(g, cx - 4, by - 26, rx - 8, ry - 6, '#daa26c');
      pxEllipse(g, cx, by - 26, 12, 6, '#fcf8f0');
      R(g, cx - 4, by - 28, 8, 4, '#d98c46');
      return;
    }
    // 变体 2：会议/研讨/档案整理长桌（稳重胡桃木长桌 + 中轴桌旗 + 笔记本）
    if (/长桌|共创|议事|沙盘|整理|品鉴|展台|登记|图桌|备餐|造型|手作|书写/.test(label)) {
      const nC = Math.max(2, Math.min(5, Math.round(w / 56)));
      for (let i = 0; i < nC; i++) {
        const cx = snap2(x + 18 + i * ((w - 36) / Math.max(1, nC - 1)));
        outlineBox(g, cx - 10, by - 48, 20, 14, '#48525e', '#707d8c', '#2b323b', OUT_COOL, true);
      }
      R(g, x + 8, by - 16, 8, 16, OUT);
      R(g, x + w - 16, by - 16, 8, 16, OUT);
      outlineBox(g, x, by - 38, w, 24, '#8c5832', '#b87d50', '#54311a');
      R(g, x + 2, by - 20, w - 4, 6, '#5e371d');
      R(g, x + 14, by - 30, w - 28, 6, '#3d4c59');
      for (let i = 0; i < nC; i++) {
        const cx = snap2(x + 18 + i * ((w - 36) / Math.max(1, nC - 1)));
        R(g, cx - 8, by - 34, 16, 6, '#f5eee0');
        R(g, cx - 6, by - 32, 10, 2, '#7d8a96');
      }
      return;
    }
    // 变体 3（默认）：温暖现代餐厅原木餐桌 + 居中亚麻桌旗（告别全场刺眼红白野餐格子布）
    const nC = Math.max(2, Math.min(4, Math.round(w / 54)));
    for (let i = 0; i < nC; i++) {
      const cx = snap2(x + 18 + i * ((w - 36) / Math.max(1, nC - 1)));
      outlineBox(g, cx - 10, by - 48, 20, 14, '#7d4c29', '#ad7246', '#4f2d18', OUT, true);
    }
    R(g, x + 6, by - 16, 6, 16, OUT);
    R(g, x + w - 12, by - 16, 6, 16, OUT);
    R(g, x + 8, by - 14, 2, 12, '#6e4124');
    R(g, x + w - 10, by - 14, 2, 12, '#6e4124');
    outlineBox(g, x, by - 38, w, 24, '#ba824c', '#daa26c', '#754624');
    R(g, x + 2, by - 20, w - 4, 6, '#754624');
    // 居中暖白亚麻桌旗与细赤陶织边（两侧露出温润橡木桌面）
    const rw = Math.max(32, snap2(w * 0.56)), rx = snap2(x + (w - rw) / 2);
    R(g, rx, by - 36, rw, 20, '#f5eee2');
    R(g, rx, by - 36, rw, 2, '#ffffff');
    R(g, rx + 4, by - 34, rw - 8, 2, '#c96f53');
    R(g, rx, by - 16, rw, 6, '#ded4c4');
    for (let i = 0; i < nC; i++) {
      const cx = snap2(x + 18 + i * ((w - 36) / Math.max(1, nC - 1)));
      R(g, cx - 8, by - 32, 16, 6, '#ffffff');
      R(g, cx - 6, by - 30, 8, 4, ['#e29b3e', '#c95c48', '#7ab864'][i % 3]);
    }
    R(g, x + snap2(w / 2) - 4, by - 44, 8, 10, '#8ec8dc');
    R(g, x + snap2(w / 2) - 2, by - 48, 4, 4, '#f07167');
  };
  C.reception = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 现代研发中心迎宾总台：竖向胡桃木格栅前立面 + 悬挑哑光洞石台面 + 暖金踢脚灯带 + 访客一体机
    outlineBox(g, x, by - 42, w, 42, '#8f5832', '#bc8252', '#522f19');
    for (let px = x + 6; px < x + w - 6; px += 8) {
      R(g, px, by - 36, 2, 26, '#5c351c');
      R(g, px + 2, by - 36, 2, 26, '#ad7246');
    }
    R(g, x + 2, by - 6, w - 4, 2, '#e8bc5a');
    outlineBox(g, x - 4, by - 50, w + 8, 12, '#efe7da', '#fcf8f2', '#bfb29e', OUT);
    // 访客登记一体机、黄铜迎宾铃与小型桌面绿植
    outlineBox(g, x + 18, by - 64, 28, 16, '#2d3540', '#586473', '#191e26', OUT_COOL);
    R(g, x + 28, by - 48, 8, 4, '#4c545e');
    R(g, x + 56, by - 56, 12, 6, '#e8bc5a');
    if (w >= 110) {
      outlineBox(g, x + w - 30, by - 58, 14, 10, '#ebe4d8', '#ffffff', '#b5aa9a');
      pxEllipse(g, x + w - 23, by - 62, 8, 6, '#3a7844');
      R(g, x + w - 26, by - 66, 6, 2, '#86cc6e');
    }
    if (f.sign !== false && w >= 96) {
      const sx = x + snap2(w / 2) - 22;
      outlineBox(g, sx, by - 30, 44, 14, '#2d2522', '#5c4b42', '#1c1614');
      R(g, sx + 8, by - 24, 28, 2, '#f5d98e');
    }
  };
  C.cabinet = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w), H = 52, top = by - H;
    const wood = f.wood || ['#8a5530', '#563119', '#ba814f'];
    outlineBox(g, x, top, w, H, wood[0], wood[2], wood[1]);
    outlineBox(g, x - 2, top - 4, w + 4, 8, wood[2], '#d8a673', wood[1]);
    const n = Math.max(2, Math.round(w / 36)), dw = (w - 8) / n;
    for (let i = 0; i < n; i++) {
      const dx = snap2(x + 4 + i * dw), dww = snap2(dw);
      R(g, dx + 2, top + 8, dww - 4, H - 16, wood[1]);
      R(g, dx + 4, top + 10, dww - 8, H - 20, wood[0]);
      R(g, dx + 4, top + 10, dww - 8, 2, wood[2]);
      R(g, dx + snap2(dww / 2) - 2, top + snap2(H / 2) - 2, 4, 4, f.container ? '#ffe26a' : '#d9aa4e');
    }
    if (w >= 64) {
      outlineBox(g, x + 8, top - 14, 20, 10, '#efe7da', '#ffffff', '#b8aa96');
      if (w >= 92) outlineBox(g, x + 32, top - 12, 18, 8, '#4a6e8a', '#729aba', '#2c465c');
    }
  };
  C.counter = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 现代烘焙/茶水吧台：胡桃木竖格栅柜体 + 洞石台面 + 高透玻璃甜品冷柜 + 双头意式咖啡机
    outlineBox(g, x, by - 32, w, 32, '#8f5832', '#bc8252', '#522f19');
    for (let px = x + 6; px < x + w - 6; px += 10) R(g, px, by - 26, 2, 18, '#5c351c');
    R(g, x + 2, by - 6, w - 4, 2, '#d9aa4e');
    outlineBox(g, x - 2, by - 38, w + 4, 8, '#efe7da', '#fcf8f2', '#bfb29e', OUT);
    const gw = Math.max(28, snap2(w * 0.56)), gx = x + 6;
    outlineBox(g, gx, by - 60, gw, 24, '#d2ebf4', '#ffffff', '#8ab6c7', OUT_COOL);
    R(g, gx + 4, by - 48, gw - 8, 2, '#8ab6c7');
    const pastries = ['#d9934c', '#f07167', '#84c973', '#f2cf7e'];
    for (let i = 0; i < Math.floor((gw - 10) / 14); i++) {
      R(g, gx + 6 + i * 14, by - 54, 10, 4, pastries[i % pastries.length]);
      R(g, gx + 6 + i * 14, by - 44, 10, 4, pastries[(i + 2) % pastries.length]);
    }
    R(g, gx + 6, by - 58, 2, 16, '#ffffff');
    if (w >= 96) {
      const mx = gx + gw + 8, mw = Math.min(34, x + w - 6 - mx);
      if (mw >= 18) {
        outlineBox(g, mx, by - 56, mw, 20, '#626c78', '#96a2b0', '#38404a', OUT_COOL);
        R(g, mx + 4, by - 46, mw - 8, 4, '#242a30');
        R(g, mx + 6, by - 42, 4, 4, '#fcf8f0');
        if (mw >= 26) R(g, mx + 14, by - 42, 4, 4, '#fcf8f0');
      }
    }
  };
  C.desk = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    // 北侧内推人体工学椅靠背
    outlineBox(g, x + snap2(w / 2) - 12, by - 48, 24, 14, '#3e4752', '#647282', '#232930', OUT_COOL, true);
    R(g, x + 6, by - 16, 6, 16, OUT);
    R(g, x + w - 12, by - 16, 6, 16, OUT);
    // 3/4 胡桃木书桌顶面与右侧抽屉柜
    outlineBox(g, x, by - 36, w, 22, '#9c663b', '#c68d5e', '#5e381e');
    R(g, x + 2, by - 20, w - 4, 6, '#5e381e');
    if (w >= 84) {
      outlineBox(g, x + w - 38, by - 26, 30, 18, '#754624', '#a3683e', '#472814');
      R(g, x + w - 26, by - 20, 6, 2, f.container ? '#ffe26a' : '#d9aa4e');
    }
    // 宽屏显示器背面 + 文稿垫 + 黄铜台灯
    const mx = x + 14, mw = Math.min(34, Math.max(22, snap2(w * 0.28)));
    outlineBox(g, mx, by - 50, mw, 18, '#2d3540', '#586473', '#191e26', OUT_COOL);
    R(g, mx + snap2(mw / 2) - 2, by - 32, 4, 4, '#4c545e');
    if (w >= 96) {
      outlineBox(g, x + w - 34, by - 34, 20, 8, '#fcf8f0', '#ffffff', '#c7baa6');
      R(g, x + w - 18, by - 48, 2, 14, '#c89e56');
      outlineBox(g, x + w - 26, by - 54, 14, 8, '#f5d98e', '#fff6d6', '#c4903e');
    }
  };
  C.printer = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w);
    outlineBox(g, x, by - 30, w, 28, '#8a5530', '#ba814f', '#563119');
    const px = x + snap2(w / 2) - 22;
    outlineBox(g, px, by - 54, 44, 26, '#ebe5da', '#ffffff', '#b5aa9a', OUT_COOL);
    R(g, px + 6, by - 42, 32, 4, '#363c42');
    outlineBox(g, px + 8, by - 60, 28, 8, '#fcf8f0', '#ffffff', '#c7baa6', OUT_COOL);
    R(g, px + 34, by - 48, 4, 2, '#7ec484');
  };
  C.server = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w), H = 78, top = by - H;
    // 恒温自控/实验仪器玻璃木柜
    outlineBox(g, x, top, w, H, '#4a3020', '#7d5236', '#2b1a12');
    outlineBox(g, x + 4, top + 6, w - 8, H - 14, '#cde6f0', '#f0fafe', '#8ab4c4', OUT_COOL);
    outlineBox(g, x - 2, top - 4, w + 4, 8, '#8a5530', '#ba814f', '#563119');
    for (let s = 1; s < 3; s++) R(g, x + 6, top + 6 + s * Math.floor((H - 14) / 3), w - 12, 2, '#6c8896');
    const items = f.items || ['#7ec484', '#e8b44e', '#62a8d8', '#e06d58'];
    for (let s = 0; s < 3; s++) {
      for (let i = 0; i < Math.floor((w - 14) / 14); i++) {
        R(g, x + 8 + i * 14, top + 12 + s * Math.floor((H - 14) / 3) + 6, 8, 8, items[(s + i) % items.length]);
      }
    }
    R(g, x + 6, top + 8, 2, H - 20, '#ffffff');
  };
  C.safe = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h), w = Math.min(64, Math.max(40, snap2(f.w - 8))), x = cx - w / 2, H = 52;
    outlineBox(g, x, by - H, w, H, '#5a636e', '#8e99a6', '#343a42', OUT_COOL, true);
    outlineBox(g, x + 4, by - H + 6, w - 8, H - 14, '#49515b', '#747f8c', '#2b3038', OUT_COOL);
    pxEllipse(g, cx, by - H / 2 - 2, 10, 10, OUT_COOL);
    pxEllipse(g, cx, by - H / 2 - 2, 8, 8, '#e2b659');
    pxEllipse(g, cx, by - H / 2 - 2, 4, 4, '#2d323a');
    R(g, x + w - 12, by - H + 14, 4, 14, f.container ? '#ffe26a' : '#e2b659');
    R(g, x + 4, by - 4, 8, 4, '#242830');
    R(g, x + w - 12, by - 4, 8, 4, '#242830');
  };
  C.locker = (g, f) => {
    const x = snap2(f.x), by = snap2(f.y + f.h), w = snap2(f.w), H = 72, top = by - H;
    const n = Math.max(2, Math.round(w / 30)), dw = w / n;
    const tone = f.tone || (/木|衣|茶/.test(f.label || '')
      ? ['#9c683e', '#633d22', '#c48e60']
      : ['#6e8ea6', '#425d73', '#9ab8cf']);
    for (let i = 0; i < n; i++) {
      const dx = snap2(x + i * dw), dww = Math.max(16, snap2(dw - 2));
      outlineBox(g, dx, top, dww, H, tone[0], tone[2], tone[1], OUT_COOL);
      for (let v = 0; v < 3; v++) R(g, dx + 6, top + 8 + v * 4, Math.max(4, dww - 12), 2, tone[1]);
      R(g, dx + dww - 8, top + snap2(H / 2), 4, 8, f.container ? '#ffe26a' : '#e2b659');
    }
  };
  C.arcade = (g, f) => {
    const cx = snap2(f.x + f.w / 2), by = snap2(f.y + f.h), w = Math.min(52, snap2(f.w)), x = cx - w / 2, top = by - 78;
    // 研发休闲街机框体：深藏青胡桃侧板 + 暖金灯箱 + 像素屏幕 + 摇杆操控台
    outlineBox(g, x, top, w, 78, '#385470', '#6082a3', '#223447', OUT_COOL, true);
    outlineBox(g, x + 4, top + 4, w - 8, 12, '#ffd166', '#fff2b8', '#c48e2a', OUT_COOL);
    R(g, x + 8, top + 8, w - 16, 4, '#385470');
    outlineBox(g, x + 6, top + 18, w - 12, 24, '#182c3b', '#2b4a61', '#0f1c26', OUT_COOL);
    R(g, x + 12, top + 28, 6, 8, '#7de07a');
    R(g, x + 22, top + 24, 4, 4, '#ffe26a');
    R(g, x + 10, top + 36, w - 20, 2, '#4ea854');
    outlineBox(g, x - 2, top + 42, w + 4, 12, '#9c663b', '#c68d5e', '#5e381e', OUT);
    R(g, x + 8, top + 42, 4, 6, '#e2e6ee');
    R(g, x + 6, top + 38, 8, 6, '#e8524a');
    R(g, x + w - 18, top + 46, 4, 4, '#ffe26a');
    R(g, x + w - 12, top + 46, 4, 4, '#62d4e8');
    outlineBox(g, x + 10, top + 58, w - 20, 14, '#222c3a', '#3b4b61', '#141a24', OUT_COOL);
    R(g, cx - 2, top + 62, 4, 6, '#e8524a');
  };
  Object.assign(C, { rack: C.shelf, lamp: C.floorlamp, chair: C.armchair, seat: C.bench });

  function furniture(g, f) {
    const id = f.floorId || 1, th = themeOf(id), fn = (th.furniture && th.furniture[f.type]) || C[f.type];
    if (!fn) { (API.missing = API.missing || new Set()).add(id + ':' + f.type); return false; }
    g.save(); g.imageSmoothingEnabled = false; fn(g, f, API); g.restore();
    return true;
  }
  function doorMat(g, room, near, t) {
    const F = W().floorById(room.floorId), x = snap2(room.door.x), y = snap2(room.door.y);
    const bd = F ? bandForDoor(F, x, y) : null;
    const my = snap2(bd ? bd.y + bd.h + 2 : y - 14);
    outlineBox(g, x - 24, my, 48, 14, '#a84f3a', '#cf6e54', '#66281c');
    for (let k = x - 16; k < x + 16; k += 8) R(g, k, my + 5, 4, 4, '#f0be84');
    if (near) {
      const a = 0.55 + 0.35 * Math.sin(t * 4);
      g.strokeStyle = `rgba(255,222,120,${a.toFixed(3)})`;
      g.lineWidth = 2;
      g.strokeRect(x - 26, my - 2, 52, 18);
      text(g, 'K 进入 ' + room.name, x, y + 16, `rgba(255,244,210,${(0.70 + 0.3 * Math.sin(t * 4)).toFixed(3)})`, 10);
    }
  }
  // ---------- 3/4 融合式建筑电梯厅（楼层同源北井道墙 + 哑光石材地面 + 齐平轿厢门 + 深古铜感应玻璃门） ----------
  const doorAnims = new Map();
  function elevatorCab(g, f, h, portal, active = false, clock = 0) {
    if (!h) return;
    const fid = (f && f.id) || (portal && portal.floorId) || 1;
    const hx = snap2(h.x), hy = snap2(h.y), cx = hx + 72;
    g.save();
    g.imageSmoothingEnabled = false;
    // 1) 顶部嵌入式深古铜数码楼层指示屏（1F..7F）
    const ledW = 56, ledH = 12, ledX = cx - ledW / 2, ledY = hy - 58;
    R(g, ledX - 2, ledY - 2, ledW + 4, ledH + 4, OUT);
    R(g, ledX, ledY, ledW, ledH, '#4a3b34');
    R(g, ledX, ledY, ledW, 2, '#8c6d53');
    R(g, ledX + 2, ledY + 2, ledW - 4, ledH - 4, '#101620');
    text(g, `▲ ${fid}F ▼`, cx, ledY + 6.5, active ? '#4ade80' : '#ffd166', 8);

    // 2) 井道凹龛深古铜门套 + 3/4 洞石内侧壁厚揭示（左上光源：左内侧背光、右内侧受光）
    const bayX = cx - 36, bayY = hy - 44, bayW = 72, bayH = 56;
    R(g, bayX, bayY, bayW, bayH, OUT);
    R(g, bayX + 2, bayY + 2, bayW - 4, bayH - 2, '#59453a');
    R(g, bayX + 2, bayY + 2, bayW - 4, 2, '#8f705c');
    R(g, bayX + bayW - 4, bayY + 4, 2, bayH - 4, '#362822');
    // 拉丝不锈钢电梯门楣横梁（严格保留 #8d929a fillRect 以满足浏览器绘制层序校验契约）
    R(g, cx - 32, hy - 40, 64, 2, '#8d929a');
    R(g, cx - 32, hy - 38, 64, 2, '#dce3ec');
    // 3/4 石材内壁深凹揭示与门楣落影
    R(g, cx - 32, hy - 36, 4, 46, '#857b74');
    R(g, cx + 28, hy - 36, 4, 46, '#e6ddd0');
    R(g, cx - 28, hy - 36, 56, 2, '#334155');

    // 3) 齐平内嵌双扇拉丝香槟不锈钢轿厢门（cx-28..cx+28, hy-34..hy+10）
    const dTop = hy - 34, dH = 44, lw = 27;
    const lx = cx - 28, rx = cx + 1;
    R(g, lx, dTop, lw, dH, '#c8d2de');
    R(g, rx, dTop, lw, dH, '#bcc7d4');
    R(g, lx, dTop, lw, 4, '#e8eef5');
    R(g, rx, dTop, lw, 4, '#dde6f0');
    R(g, lx, dTop, 2, dH - 4, '#e8eef5');
    R(g, rx + lw - 2, dTop, 2, dH - 4, '#94a3b8');
    R(g, lx, dTop + dH - 4, lw, 4, '#8594a8');
    R(g, rx, dTop + dH - 4, lw, 4, '#768599');
    // 门扇竖向金属饰槽
    R(g, lx + 4, dTop + 6, 2, dH - 12, '#aebbc9');
    R(g, rx + lw - 6, dTop + 6, 2, dH - 12, '#a2b0bf');
    // 窄幅钢化观察视窗（深青灰玻璃 + 2px 斜向像素高光，沉稳现代）
    for (const wx of [lx + 11, rx + 8]) {
      R(g, wx - 2, dTop + 8, 12, 22, '#283544');
      R(g, wx, dTop + 10, 8, 18, '#3b6985');
      R(g, wx + 2, dTop + 12, 2, 12, '#e0f2fe');
      R(g, wx + 4, dTop + 10, 2, 6, '#ffffff');
    }
    // 轿厢门中缝与安全光幕指示点
    R(g, cx - 1, dTop, 2, dH, '#182230');
    R(g, cx - 1, dTop + 18, 2, 8, active ? '#4ade80' : '#7dd3fc');

    // 4) 金属沟槽地坎踏板（紧贴防滑迎宾地垫北缘）
    R(g, cx - 34, hy + 10, 68, 4, '#334155');
    R(g, cx - 32, hy + 10, 64, 2, '#cbd5e1');

    // 5) 右侧壁装深古铜外呼梯灯盒与按键
    const px = cx + 40, py = hy - 20;
    R(g, px, py, 10, 18, OUT);
    R(g, px + 2, py + 2, 6, 14, '#59453a');
    R(g, px + 2, py + 4, 6, 4, active ? '#4ade80' : '#ffd166');
    R(g, px + 4, py + 10, 2, 4, '#f8fafc');

    // 6) 靠近面向时的呼吸高亮框与顶部乘梯提示牌
    if (active) {
      g.globalAlpha = 0.65 + 0.30 * Math.sin(clock * 4);
      g.strokeStyle = '#38bdf8';
      g.lineWidth = 2;
      g.strokeRect(bayX - 1, bayY - 1, bayW + 2, bayH + 4);
      g.globalAlpha = 1;
      const label = '按 K 乘梯 / 选择楼层';
      g.font = FONT(10, true);
      const tw = snap2(Math.ceil(g.measureText(label).width) + 18), bx = cx - tw / 2, by = ledY - 20;
      R(g, bx, by, tw, 16, 'rgba(15,23,42,0.94)');
      g.strokeStyle = '#ffd86b';
      g.lineWidth = 1.5;
      g.strokeRect(bx + 0.5, by + 0.5, tw - 1, 15);
      text(g, label, cx, by + 8.5, '#fff8eb', 10);
    }
    g.restore();
  }

  function paintHallBase(g, f, h) {
    const th = themeOf(f.id), P = wallPal(th), EP = edgePal(th);
    const fw = f.width || 3456;
    const hx = snap2(h.x), hy = snap2(h.y), hw = snap2(h.w), hh = snap2(h.h), cx = hx + 72;
    const edgeX = h.side === 'left' ? hx + hw : hx;
    // 1) 与本层护墙裙色调同源的周边镶边 + 大规格哑光洞石地砖（严格收在翼楼内 hx..hx+hw，避开 217,204,163±6）
    R(g, hx, hy + 10, hw, hh - 10, P.wainsLo);
    R(g, hx + 4, hy + 10, hw - 8, hh - 14, '#c4b7a6');
    const tones = ['#efe8dc', '#e7dfd2', '#f4eee4', '#cfc2b0'];
    g.save();
    g.beginPath();
    g.rect(hx + 6, hy + 12, hw - 12, hh - 18);
    g.clip();
    const TW = 28, TH = 24;
    for (let ty = Math.floor((hy + 12) / TH); ty * TH < hy + hh - 6; ty++) {
      const off = (ty & 1) ? TW / 2 : 0;
      for (let tx = Math.floor((hx - off) / TW) - 1; tx * TW + off < hx + hw; tx++) {
        const x = tx * TW + off, y = ty * TH, k = hash(tx + f.id * 7, ty + 3);
        R(g, x + 2, y + 2, TW - 2, TH - 2, tones[Math.floor(k * tones.length)]);
        if (k < 0.36) R(g, x + 4, y + 2, 12, 2, '#faf6f0');
      }
    }
    g.restore();
    // 周边拉丝黄铜细嵌线
    R(g, hx + 4, hy + hh - 6, hw - 8, 2, '#cfa258');

    // 2) 门洞齐平石材过门石与拉丝黄铜滑轨压条（严格与门垛 pierX = edgeX - 12 / edgeX 同宽对齐，绝不溢出主楼地面）
    const gx = h.side === 'left' ? edgeX - 6 : edgeX + 6;
    const threshX = h.side === 'left' ? edgeX - 12 : edgeX;
    R(g, threshX, hy + 12, 12, hh - 12, '#c4b7a6');
    R(g, threshX + 2, hy + 12, 8, hh - 12, '#ede5d8');
    R(g, threshX + 2, hy + 12, 2, hh - 12, '#faf6f0');
    R(g, gx - 2, hy + 12, 4, hh - 14, '#3b302c');
    R(g, gx - 1, hy + 12, 2, hh - 14, '#d8ae5e');

    // 3) 厅内柔和环境光遮蔽（北井道墙根 + 外端墙内侧）
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(34,20,32,${(0.20 - i * 0.06).toFixed(3)})`;
      g.fillRect(hx + 2, hy + 12 + i * 4, hw - 4, 4);
    }
    g.fillStyle = 'rgba(34,20,32,0.12)';
    g.fillRect(h.side === 'left' ? hx + 2 : hx + hw - 8, hy + 12, 6, hh - 16);

    // 4) 轿厢门前内嵌深可可色罗纹防滑地垫 + 南沿低对比楼层石刻铭牌
    const matX = cx - 32, matY = hy + 16, matW = 64, matH = 22;
    R(g, matX - 2, matY - 2, matW + 4, matH + 4, '#241a1c');
    R(g, matX, matY, matW, matH, '#4a3532');
    for (let ry = matY + 2; ry < matY + matH - 2; ry += 4) R(g, matX + 2, ry, matW - 4, 2, '#342322');
    R(g, matX, matY, 8, 2, '#d8ab58');
    R(g, matX + matW - 8, matY, 8, 2, '#d8ab58');
    R(g, matX, matY + matH - 2, 8, 2, '#b88c42');
    R(g, matX + matW - 8, matY + matH - 2, 8, 2, '#b88c42');

    const lbl = h.label || `${f.id}F 电梯厅`;
    R(g, cx - 34, hy + hh - 20, 68, 12, '#cfc2b0');
    R(g, cx - 32, hy + hh - 18, 64, 8, '#ebe3d6');
    text(g, lbl, cx, hy + hh - 13.5, '#523e32', 8);

    // 5) 楼层同源 3/4 北向电梯井道实墙（shaftH = 64，y = hy - 64 .. hy + 12）：继承本层 wallSurface + wainscot + 壁灯
    const sTop = hy - HALL_SHAFT_H, sH = HALL_SHAFT_H + 12;
    g.save();
    g.beginPath();
    g.rect(hx, sTop, hw, sH);
    g.clip();
    wallSurface(g, hx, sTop, hw, sH - 28, P);
    R(g, hx, sTop, hw, 2, OUT);
    R(g, hx, sTop + 2, hw, 4, P.crown);
    wainscot(g, hx, hy - 16, hw, 28, P);
    sconce(g, hx + 18, hy - 44, th.sconceColor);
    sconce(g, hx + hw - 18, hy - 44, th.sconceColor);
    g.restore();

    // 6) 外端壁柱与主楼交接处 3/4 门垛（严格收在翼楼侧 edgeX 外侧并与护墙裙底线 hy+12 齐平，不侵入主楼北墙）
    const outPilX = h.side === 'left' ? hx : hx + hw - 6;
    R(g, outPilX, sTop, 6, sH, EP.capLo);
    R(g, outPilX + (h.side === 'left' ? 0 : 4), sTop, 2, sH, h.side === 'left' ? EP.capHi : EP.capLo);
    R(g, outPilX + 2, sTop + 2, 2, sH - 6, EP.cap);

    const pierX = h.side === 'left' ? edgeX - 12 : edgeX;
    R(g, pierX, sTop, 12, sH, OUT);
    R(g, pierX + 2, sTop, 8, sH - 2, EP.capLo);
    R(g, pierX + 2, sTop + 2, 6, sH - 6, EP.cap);
    R(g, pierX + 2, sTop + 2, 2, sH - 6, EP.capHi);
    R(g, pierX, hy + 8, 12, 4, OUT);

    // 7) 静态基底内绘制齐平轿厢门（保证任何单调 SID_SCENE.halls 的静态渲染也具备完整 3/4 电梯门）
    const portal = (f.portals || []).find(p => p.side === h.side) || { floorId: f.id, side: h.side, x: cx, y: hy + 44 };
    elevatorCab(g, f, h, portal, false, 0);
  }

  function halls(g, f, doorStates, dt = 0.016) {
    if (!f || !Array.isArray(f.halls)) return false;
    g.save();
    g.imageSmoothingEnabled = false;
    for (const h of f.halls) {
      if (typeof document !== 'undefined') {
        if (!h._hallSprite) {
          const pad = 28;
          const ox = Math.floor(h.x) - pad, oy = Math.floor(h.y) - HALL_SHAFT_H - pad;
          const cw = Math.ceil(h.w) + pad * 2, ch = Math.ceil(h.h) + HALL_SHAFT_H + pad * 2;
          const c = document.createElement('canvas');
          c.width = Math.max(1, cw); c.height = Math.max(1, ch);
          const cg = c.getContext('2d');
          cg.imageSmoothingEnabled = false;
          cg.translate(-ox, -oy);
          paintHallBase(cg, f, h);
          h._hallSprite = { c, ox, oy };
        }
        g.drawImage(h._hallSprite.c, h._hallSprite.ox, h._hallSprite.oy);
      } else {
        paintHallBase(g, f, h);
      }
    }
    // 动态感应双开深古铜框高透玻璃滑门（紧贴门垛中轴 gx = edgeX ± 6 平滑启闭，与北墙底线 hy+12 严丝合缝）
    const ds = doorStates || {};
    for (const d of (f.glassDoors || [])) {
      const h = f.halls.find(q => q.id === d.hallId || q.side === d.side);
      const isOpen = !!(ds[d.id] && ds[d.id].open);
      const target = isOpen ? 1 : 0, old = doorAnims.get(d.id) || 0;
      const v = old + (target - old) * Math.min(1, dt * 14);
      doorAnims.set(d.id, v);
      const gx = d.side === 'left' ? d.x - 6 : d.x + 6;
      const openTop = h ? snap2(h.y) + 12 : Math.round(d.y - (d.opening || 104) / 2);
      const openBot = h ? snap2(h.y + h.h) : Math.round(d.y + (d.opening || 104) / 2);
      const span = openBot - openTop, midY = Math.round((openTop + openBot) / 2);
      const leafH = Math.floor(span / 2) - 2, slide = Math.round(v * (leafH - 10));
      // 门洞上下深古铜导轨座与中央感应状态灯
      R(g, gx - 6, openTop, 12, 4, '#2b211e');
      R(g, gx - 6, openBot - 4, 12, 4, '#2b211e');
      const topY = Math.round(openTop + 2 - slide);
      const botY = Math.round(midY + slide);
      g.save();
      g.beginPath();
      g.rect(gx - 8, openTop, 16, span);
      g.clip();
      for (const ly of [topY, botY]) {
        g.fillStyle = 'rgba(196,232,244,0.48)';
        g.fillRect(gx - 4, ly, 8, leafH);
        R(g, gx - 5, ly, 2, leafH, '#382c28');
        R(g, gx + 3, ly, 2, leafH, '#382c28');
        R(g, gx - 5, ly, 10, 2, '#635048');
        R(g, gx - 5, ly + leafH - 2, 10, 2, '#2b211e');
        R(g, gx - 1, ly + 4, 2, Math.max(4, leafH - 10), '#ffffff');
      }
      R(g, gx - 3, topY + leafH - 8, 6, 4, '#e2b659');
      R(g, gx - 3, botY + 4, 6, 4, '#e2b659');
      g.restore();
      R(g, gx - 3, openTop - 6, 6, 6, OUT);
      R(g, gx - 1, openTop - 4, 2, 2, isOpen ? '#52c478' : '#e8b856');
    }
    g.restore();
    return true;
  }

  function register(id, theme) { themes[id] = Object.assign({ id }, theme); }
  function has(id) { const F = W() && W().floorById(id); return !!(F && F.lobby); }
  const API = {
    R, R2, snap2, outlineBox, createPixelBuffer, createExteriorRaster, OUT, OUT_COOL,
    hash, text, FONT, pxEllipse, clipRect, withClip, MATS, paintZone, rug,
    windowAt, windowLight, sconce, frame, plaque, embeddedDoor,
    wallSurface, wainscot, edgePal, crateAt, PRODUCE, COMMON: C, PAL
  };
  root.SID_LOBBY = { floor, backWall, wall, edges, halls, elevatorCab, furniture, doorMat, register, has, themes, API, PAL, C };
})(typeof window !== 'undefined' ? window : globalThis);
