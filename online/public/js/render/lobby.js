'use strict';
// 美术层引擎（Canvas 2D 程序化手绘，零依赖）——为带 layouts/fN.js 的楼层（floor.lobby）绘制：
//   floor(g,id,ox,oy,w,h)  分区地面材质 + 门洞门槛 + 地毯 + 窗光 + 家具软投影 + 墙脚 AO + 主题地面装饰
//   backWall(g,f)          北墙（高度 = floor.wallBase）：墙面材质 + 腰线护墙板 + 窗 + 壁灯 + 画框 + 牌匾 + 嵌墙房门
//   wall(g,w)              隔墙：顶盖 + 立面 + 门洞门柱 + 嵌墙房门 + 主题立面装饰（北墙带 northBand 不画）
//   edges(g,f)             楼板外沿压顶 + 内侧 AO（取代平涂空洞）
//   furniture(g,f)         主题陈设优先，其次通用陈设
//   doorMat(g,room,near,t) 门垫 + 可进入提示
// 主题：SID_LOBBY.register(floorId, theme)，见 js/render/lobby-themes/fN.js。统一光向左上；描边用同色系深色。
(function (root) {
  const W = () => root.WORLD;
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const hash = (a, b) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const FONT = (px, bold = true) => `${bold ? 'bold ' : ''}${px}px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif`;
  function text(g, s, x, y, c, px = 10, align = 'center') { g.fillStyle = c; g.font = FONT(px); g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); }
  function pxEllipse(g, cx, cy, rx, ry, c, step = 2) {
    g.fillStyle = c;
    for (let dy = -ry; dy < ry; dy += step) {
      const t = (dy + step / 2) / ry, half = Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t)) / step) * step;
      if (half > 0) g.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2, step);
    }
  }
  const clipRect = (ox, oy, w, h, r) => {
    const x0 = Math.max(ox, r.x), y0 = Math.max(oy, r.y), x1 = Math.min(ox + w, r.x + r.w), y1 = Math.min(oy + h, r.y + r.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const withClip = (g, a, fn) => { g.save(); g.beginPath(); g.rect(a.x, a.y, a.w, a.h); g.clip(); fn(); g.restore(); };

  // ---------- 默认调色板（主题可覆盖任意键） ----------
  const PAL = {
    wood: { base: '#c58b52', hi: '#d49a5f', lo: '#b27a45', gap: '#8a5a32', grain: '#a96f3d' },
    wall: { paper: '#efd9a7', stripe: '#e5c992', motif: '#d6b276', rail: '#8a5530', railHi: '#b27646', wains: '#a5683a', wainsLo: '#8a5228',
      wainsHi: '#bd7f4b', base: '#5b3318', crown: '#d9bd84', cap: '#6b4323', capHi: '#9a6a3c', capLo: '#3c2210', capTop: '#7e5130', style: 'paper' },
    voidC: '#1b130d', edgeHi: '#c99556',
    door: { frame: '#4a2a14', frameHi: '#a06a3a', leaf: '#a2653a', plank: '#83502c', lintel: '#5e3519', glass: '#f4d98c' },
    plaque: { bg: '#7e4f28', hi: '#a8723f', edge: '#3c2210', ink: '#fbe9c4' }
  };
  const themes = {};
  const themeOf = id => themes[id] || {};
  const wallPal = th => Object.assign({}, PAL.wall, th.wall || {});

  // ---------- 地面材质 ----------
  function planks(g, a, p, seed = 1, rowH = 16) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let r = Math.floor(a.y / rowH); r * rowH < a.y + a.h; r++) {
        const y = r * rowH;
        let x = Math.floor(a.x / 32) * 32 - Math.floor(hash(r, seed) * 96);
        while (x < a.x + a.w) {
          const len = 64 + Math.floor(hash(x, r + seed) * 4) * 16, tone = hash(r * 7 + seed, x);
          R(g, x, y, len, rowH, tone < 0.3 ? p.lo : tone > 0.78 ? p.hi : p.base);
          R(g, x, y, len, 2, p.hi); R(g, x, y + rowH - 2, len, 2, p.gap); R(g, x, y, 2, rowH, p.gap);
          if (hash(x, r * 3 + seed) > 0.7) R(g, x + 10 + Math.floor(hash(r, x) * (len - 30)), y + Math.floor(rowH / 2) - 2, 10, 2, p.grain);
          if (hash(x * 3, r + seed) > 0.86) R(g, x + len - 14, y + Math.floor(rowH / 2) - 1, 4, 2, p.gap);
          x += len;
        }
      }
    });
  }
  function stone(g, a, p, seed = 1, TW = 48, TH = 32) {
    if (!a) return;
    const tones = p.tones || ['#e6d9bd', '#ded0b1', '#eadfc6', '#d8c8a6'];
    R(g, a.x, a.y, a.w, a.h, p.grout || '#b8a581');
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / TH); ty * TH < a.y + a.h; ty++) {
        const off = (ty % 2) ? TW / 2 : 0;
        for (let tx = Math.floor((a.x - off) / TW) - 1; tx * TW + off < a.x + a.w; tx++) {
          const x = tx * TW + off, y = ty * TH, k = hash(tx + seed, ty);
          R(g, x + 2, y + 2, TW - 2, TH - 2, tones[Math.floor(k * tones.length)]);
          R(g, x + 2, y + 2, TW - 2, 2, p.hi || '#f3ead6'); R(g, x + 2, y + 2, 2, TH - 2, p.hi || '#f3ead6');
          R(g, x + 2, y + TH - 2, TW - 2, 2, p.lo || '#c9b793');
          if (k > 0.9) { R(g, x + 14, y + 12, 8, 2, p.lo || '#c9b793'); R(g, x + 20, y + 14, 6, 2, p.lo || '#c9b793'); }
        }
      }
    });
  }
  function checker(g, a, p, S = 32) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.grout);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
        const x = tx * S, y = ty * S, dark = (tx + ty) % 2 === 1;
        R(g, x + 1, y + 1, S - 2, S - 2, dark ? p.b : p.a); R(g, x + 1, y + 1, S - 2, 2, dark ? p.bHi : p.aHi);
        if (hash(tx + 99, ty) > 0.93) R(g, x + 8, y + S - 12, 6, 2, dark ? p.bLo || p.grout : p.aLo || p.grout);
      }
    });
  }
  function parquet(g, a, p, S = 32) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.gap);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
        const x = tx * S, y = ty * S, horiz = (tx + ty) % 2 === 0, half = S / 2;
        for (let i = 0; i < 2; i++) {
          const tone = hash(tx * 2 + i, ty + 7), c = tone < 0.33 ? p.lo : tone > 0.75 ? p.hi : p.base;
          if (horiz) { R(g, x + 1, y + i * half + 1, S - 2, half - 2, c); R(g, x + 1, y + i * half + 1, S - 2, 2, p.hi); }
          else { R(g, x + i * half + 1, y + 1, half - 2, S - 2, c); R(g, x + i * half + 1, y + 1, 2, S - 2, p.hi); }
        }
      }
    });
  }
  function tiles(g, a, p, S = 32) {
    if (!a) return;
    const tones = p.tones || [p.base];
    R(g, a.x, a.y, a.w, a.h, p.grout);
    withClip(g, a, () => {
      for (let ty = Math.floor(a.y / S); ty * S < a.y + a.h; ty++) for (let tx = Math.floor(a.x / S); tx * S < a.x + a.w; tx++) {
        const x = tx * S, y = ty * S, k = hash(tx + 5, ty + 3);
        R(g, x + 2, y + 2, S - 2, S - 2, tones[Math.floor(k * tones.length)]); R(g, x + 2, y + 2, S - 2, 2, p.hi); R(g, x + 2, y + S - 2, S - 2, 2, p.lo || p.grout);
      }
    });
  }
  function grass(g, a, p, seed = 3) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 16) * 16; y < a.y + a.h; y += 16) for (let x = Math.floor(a.x / 16) * 16; x < a.x + a.w; x += 16) {
        const k = hash(x + seed, y);
        if (k < 0.55) { R(g, x + 4 + Math.floor(k * 8), y + 6, 2, 4, p.blade); R(g, x + 6 + Math.floor(k * 8), y + 4, 2, 6, p.blade); }
        else if (k < 0.72) R(g, x + 2, y + 10, 4, 2, p.lo);
        else if (k > 0.985 && p.flower) { R(g, x + 6, y + 6, 4, 4, p.flower[Math.floor(k * 997) % p.flower.length]); R(g, x + 7, y + 7, 2, 2, '#fff6d0'); }
        else if (k > 0.94) R(g, x + 8, y + 4, 2, 2, p.hi);
      }
    });
  }
  function carpet(g, a, p, seed = 7) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 8) * 8; y < a.y + a.h; y += 8) for (let x = Math.floor(a.x / 8) * 8; x < a.x + a.w; x += 8) {
        const k = hash(x + seed, y + seed);
        if (k > 0.8) R(g, x + 2, y + 2, 2, 2, p.hi); else if (k < 0.12) R(g, x + 4, y + 4, 2, 2, p.lo);
      }
      if (p.pattern) for (let y = Math.floor(a.y / 48) * 48 + 20; y < a.y + a.h; y += 48) for (let x = Math.floor(a.x / 48) * 48 + 20; x < a.x + a.w; x += 48) {
        R(g, x + 2, y, 4, 2, p.pattern); R(g, x, y + 2, 8, 2, p.pattern); R(g, x + 2, y + 4, 4, 2, p.pattern);
      }
    });
  }
  function deck(g, a, p, seed = 9) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let r = Math.floor(a.y / 12); r * 12 < a.y + a.h; r++) {
        const y = r * 12, tone = hash(r, seed);
        R(g, a.x, y, a.w, 12, tone < 0.3 ? p.lo : tone > 0.75 ? p.hi : p.base);
        R(g, a.x, y + 10, a.w, 2, p.gap);
        for (let x = Math.floor(a.x / 96) * 96 + ((r % 3) * 32); x < a.x + a.w; x += 96) { R(g, x, y, 2, 10, p.gap); R(g, x + 6, y + 4, 2, 2, p.nail || p.gap); R(g, x - 8, y + 4, 2, 2, p.nail || p.gap); }
      }
    });
  }
  function dirt(g, a, p, seed = 11) {
    if (!a) return;
    R(g, a.x, a.y, a.w, a.h, p.base);
    withClip(g, a, () => {
      for (let y = Math.floor(a.y / 8) * 8; y < a.y + a.h; y += 8) for (let x = Math.floor(a.x / 8) * 8; x < a.x + a.w; x += 8) {
        const k = hash(x + seed, y);
        if (k > 0.86) R(g, x + 2, y + 2, 4, 2, p.hi); else if (k < 0.1) R(g, x + 2, y + 4, 2, 2, p.lo); else if (k > 0.8) R(g, x + 4, y + 2, 2, 2, p.pebble || p.lo);
      }
    });
  }
  const MATS = { planks, stone, checker, parquet, tiles, grass, carpet, deck, dirt };
  function paintZone(g, z, ox, oy, w, h) {
    const a = clipRect(ox, oy, w, h, z);
    if (!a) return;
    const fn = MATS[z.mat] || planks, p = z.pal || PAL.wood;
    if (z.mat === 'planks' || !MATS[z.mat]) fn(g, a, p, z.seed || 1, z.rowH || 16);
    else if (z.mat === 'stone') fn(g, a, p, z.seed || 1, z.tw || 48, z.th || 32);
    else if (z.mat === 'checker' || z.mat === 'parquet' || z.mat === 'tiles') fn(g, a, p, z.size || 32);
    else fn(g, a, p, z.seed || 1);
  }
  function threshold(g, a, p) {
    if (!a) return;
    p = p || {};
    R(g, a.x, a.y, a.w, a.h, p.base || '#cdbb95'); R(g, a.x, a.y, a.w, 2, p.hi || '#e9dcc0'); R(g, a.x, a.y + a.h - 2, a.w, 2, p.lo || '#9c8a68');
  }
  function rug(g, r, ox, oy, w, h) {
    if (!clipRect(ox, oy, w, h, { x: r.x - 8, y: r.y - 4, w: r.w + 16, h: r.h + 12 })) return;
    R(g, r.x + 4, r.y + r.h, r.w - 4, 4, 'rgba(60,30,12,0.22)');
    if (r.round) {
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      pxEllipse(g, cx, cy, r.w / 2, r.h / 2, r.band); pxEllipse(g, cx, cy, r.w / 2 - 6, r.h / 2 - 5, r.trim);
      pxEllipse(g, cx, cy, r.w / 2 - 10, r.h / 2 - 8, r.fill); pxEllipse(g, cx, cy, r.w / 2 - 22, r.h / 2 - 16, r.motif); pxEllipse(g, cx, cy, r.w / 2 - 26, r.h / 2 - 19, r.fill);
      return;
    }
    R(g, r.x, r.y, r.w, r.h, r.band); R(g, r.x + 6, r.y + 6, r.w - 12, r.h - 12, r.trim); R(g, r.x + 10, r.y + 10, r.w - 20, r.h - 20, r.fill);
    R(g, r.x + 16, r.y + 16, r.w - 32, 2, r.motif); R(g, r.x + 16, r.y + r.h - 18, r.w - 32, 2, r.motif);
    R(g, r.x + 16, r.y + 16, 2, r.h - 32, r.motif); R(g, r.x + r.w - 18, r.y + 16, 2, r.h - 32, r.motif);
    for (const [cx, cy] of [[r.x + 26, r.y + 26], [r.x + r.w - 26, r.y + 26], [r.x + 26, r.y + r.h - 26], [r.x + r.w - 26, r.y + r.h - 26]]) {
      R(g, cx - 2, cy - 4, 4, 2, r.trim); R(g, cx - 4, cy - 2, 8, 4, r.trim); R(g, cx - 2, cy + 2, 4, 2, r.trim);
    }
    for (let x = r.x + 16; x < r.x + r.w - 16; x += 12) { R(g, x, r.y + 2, 4, 2, r.trim); R(g, x, r.y + r.h - 4, 4, 2, r.trim); }
    if (r.fringe) for (let y = r.y + 4; y < r.y + r.h - 4; y += 4) { R(g, r.x - 6, y, 6, 2, r.fringe); R(g, r.x + r.w, y, 6, 2, r.fringe); }
  }
  function windowLight(g, cx, top, len = 150, color = '255,236,170') {
    for (let i = 0; i < 3; i++) {
      g.fillStyle = `rgba(${color},${(0.10 - i * 0.025).toFixed(3)})`;
      const inset = i * 6;
      g.beginPath(); g.moveTo(cx - 22 + inset, top); g.lineTo(cx + 22 - inset, top);
      g.lineTo(cx + 70 - inset, top + len - inset * 2); g.lineTo(cx + 26 + inset, top + len - inset * 2); g.closePath(); g.fill();
    }
  }
  function floor(g, id, ox, oy, w, h) {
    const F = W().floorById(id), th = themeOf(id), base = F.wallBase || 58;
    for (const z of (th.zones || [{ x: 0, y: 0, w: F.width, h: F.height, mat: 'planks' }])) paintZone(g, z, ox, oy, w, h);
    for (const d of (F.doors || [])) {
      const wl = F.walls.find(q => q.lobby && !q.northBand && (d.orientation === 'h' ? (q.w >= q.h && Math.abs(q.y + q.h / 2 - d.y) < 12) : (q.h > q.w && Math.abs(q.x + q.w / 2 - d.x) < 12)));
      const t = wl ? (d.orientation === 'h' ? wl.h : wl.w) : 16;
      threshold(g, clipRect(ox, oy, w, h, d.orientation === 'h' ? { x: d.x - d.width / 2, y: d.y - t / 2, w: d.width, h: t } : { x: d.x - t / 2, y: d.y - d.width / 2, w: t, h: d.width }), th.threshold);
    }
    if (th.floorDecor) th.floorDecor(g, ox, oy, w, h, API, F);
    for (const r of (th.rugs || [])) rug(g, r, ox, oy, w, h);
    if (th.floorDecorTop) th.floorDecorTop(g, ox, oy, w, h, API, F);
    for (const cx of (th.windows || [])) { const b = bandAt(F, cx); if (b) windowLight(g, cx, b.y + b.h, th.lightLen || 150, th.lightColor); }
    for (const b of bandsOf(F)) for (let i = 0; i < 3; i++) { g.fillStyle = `rgba(50,25,10,${(0.22 - i * 0.065).toFixed(3)})`; g.fillRect(b.x, b.y + b.h + i * 4, b.w, 4); }
    for (const wl of F.walls) {
      if (!wl.lobby || wl.northBand) continue;
      if (wl.w >= wl.h) { g.fillStyle = 'rgba(50,25,10,0.18)'; g.fillRect(wl.x, wl.y + wl.h, wl.w, 6); }
      else { g.fillStyle = 'rgba(50,25,10,0.14)'; g.fillRect(wl.x + wl.w, wl.y, 6, wl.h); }
    }
    for (const f of F.furniture) {
      if (!f.w) continue;
      const by = f.y + f.h;
      if (by < oy - 20 || by > oy + h + 20 || f.x > ox + w + 40 || f.x + f.w < ox - 40) continue;
      if (f.type === 'rug') continue;
      pxEllipse(g, f.x + f.w / 2 + 4, by - 2, Math.round(f.w / 2 + 4), f.type === 'pillar' ? 6 : 8, 'rgba(60,30,12,0.20)');
    }
    return true;
  }

  // ---------- 墙面部件 ----------
  function wallSurface(g, x, y, w, h, P) {
    R(g, x, y, w, h, P.paper);
    const st = P.style || 'paper';
    if (st === 'brick') {
      for (let r = 0, yy = y; yy < y + h; yy += 8, r++) {
        R(g, x, yy + 6, w, 2, P.stripe);
        for (let xx = Math.floor(x / 16) * 16 + (r % 2 ? 8 : 0); xx < x + w; xx += 16) { R(g, Math.max(x, xx), yy, 2, 6, P.stripe); if (hash(xx, yy) > 0.85) R(g, Math.max(x, xx + 2), yy, 14, 2, P.motif); }
      }
    } else if (st === 'stone') {
      for (let r = 0, yy = y; yy < y + h; yy += 16, r++) {
        R(g, x, yy + 14, w, 2, P.stripe);
        for (let xx = Math.floor(x / 32) * 32 + (r % 2 ? 16 : 0); xx < x + w; xx += 32) { R(g, Math.max(x, xx), yy, 2, 14, P.stripe); R(g, Math.max(x, xx + 2), yy, 28, 2, P.motif); }
      }
    } else if (st === 'plank') {
      for (let xx = Math.ceil(x / 16) * 16; xx < x + w; xx += 16) { R(g, xx, y, 2, h, P.stripe); if (hash(xx, 3) > 0.6) R(g, xx + 6, y + Math.floor(hash(xx, 9) * (h - 8)), 2, 6, P.motif); }
    } else if (st === 'panel') {
      for (let xx = Math.floor(x / 64) * 64; xx < x + w; xx += 64) { R(g, xx, y, 2, h, P.stripe); R(g, xx + 8, y + 6, 48, 2, P.motif); R(g, xx + 8, y + h - 8, 48, 2, P.motif); }
    } else {
      for (let sx = Math.ceil(x / 16) * 16; sx < x + w; sx += 16) R(g, sx, y, 2, h, P.stripe);
      for (let sy = y + 8; sy < y + h - 4; sy += 20) for (let sx = Math.ceil(x / 32) * 32 + 8; sx < x + w - 4; sx += 32) {
        R(g, sx, sy, 2, 2, P.motif); R(g, sx - 2, sy + 2, 6, 2, P.motif); R(g, sx, sy + 4, 2, 2, P.motif);
      }
    }
  }
  function wainscot(g, x, y, w, h, P) {
    R(g, x, y, w, 4, P.rail); R(g, x, y, w, 2, P.railHi);
    R(g, x, y + 4, w, h - 8, P.wains);
    for (let px = Math.floor(x / 48) * 48 + 6; px < x + w - 8; px += 48) {
      const a = Math.max(px, x + 2), b = Math.min(px + 38, x + w - 2);
      if (b - a < 8) continue;
      R(g, a, y + 7, b - a, h - 14, P.wainsLo); R(g, a + 2, y + 9, b - a - 4, h - 18, P.wains); R(g, a + 2, y + 9, b - a - 4, 2, P.wainsHi);
    }
    R(g, x, y + h - 4, w, 4, P.base);
  }
  function windowAt(g, cx, top, bottom, style, P) {
    const w = style === 'porthole' ? 40 : 44, x = cx - w / 2, h = bottom - top;
    const frame = (P && P.winFrame) || '#6e4322', frameHi = (P && P.winFrameHi) || '#9a6236', mull = (P && P.winMull) || '#7a4a26';
    if (style === 'porthole') {
      const cy = top + h / 2, r = Math.min(w, h) / 2;
      pxEllipse(g, cx, cy, r + 4, r + 4, '#8a8f96'); pxEllipse(g, cx, cy, r + 2, r + 2, '#c9ced4'); pxEllipse(g, cx, cy, r, r, '#7fc8e6');
      pxEllipse(g, cx, cy + r / 2, r - 2, r / 3, '#4f9cc0'); R(g, cx - r / 2, cy - r / 2, 4, 6, '#ffffff');
      for (const [dx, dy] of [[-r - 2, 0], [r, 0], [0, -r - 2], [0, r]]) R(g, cx + dx, cy + dy, 2, 2, '#5a5f66');
      return;
    }
    R(g, x - 4, top - 2, w + 8, h + 4, frame); R(g, x - 2, top, w + 4, h, frameHi);
    R(g, x, top + 2, w, h - 4, (P && P.sky) || '#a8dcef');
    R(g, x, top + 2 + Math.round((h - 4) * 0.45), w, Math.round((h - 4) * 0.3), (P && P.sky2) || '#c6e9f3');
    R(g, x, bottom - 12, w, 10, (P && P.far) || '#8cc47a'); R(g, x + 6, bottom - 16, 12, 6, (P && P.far2) || '#79b46a'); R(g, x + 26, bottom - 14, 14, 4, (P && P.far2) || '#79b46a');
    if (style === 'arch') { R(g, x, top + 2, 8, 6, frameHi); R(g, x + w - 8, top + 2, 8, 6, frameHi); R(g, x, top + 8, 2, 4, frameHi); R(g, x + w - 2, top + 8, 2, 4, frameHi); }
    R(g, cx - 1, top + 2, 2, h - 4, mull); R(g, x, top + Math.round(h / 2), w, 2, mull);
    R(g, x + 4, top + 10, 2, 10, '#ffffff'); R(g, x + 6, top + 8, 2, 4, '#ffffff'); R(g, cx + 5, top + Math.round(h / 2) + 6, 2, 8, '#e6f6fb');
    R(g, x - 6, bottom, w + 12, 4, '#e8d3a8'); R(g, x - 6, bottom + 4, w + 12, 2, '#9c7448');
    if (!P || P.flowerBox !== false) {
      R(g, x + 2, bottom - 4, w - 4, 4, '#a2602f');
      for (let i = 0; i < 5; i++) R(g, x + 4 + i * 8, bottom - 8, 4, 4, ['#f06f6a', '#ffd25a', '#f5a0c8', '#ffd25a', '#f06f6a'][i]);
    }
  }
  function sconce(g, cx, y, c = '#ffd27a') {
    R(g, cx - 3, y + 8, 6, 10, '#7a4a26'); R(g, cx - 7, y, 14, 10, c); R(g, cx - 5, y + 2, 10, 5, '#fff3c4');
    g.fillStyle = 'rgba(255,214,130,0.16)'; g.fillRect(cx - 20, y - 10, 40, 34);
  }
  function frame(g, x, y, w, h, kind) {
    R(g, x, y, w, h, '#6e4322'); R(g, x + 2, y + 2, w - 4, h - 4, '#c08a50');
    const inner = { sea: '#8fcbe0', night: '#3a4a7a', land: '#f3e6c4', flower: '#f6e9d0', map: '#ead8a8' }[kind] || '#f3e6c4';
    R(g, x + 4, y + 4, w - 8, h - 8, inner);
    if (kind === 'sea') { R(g, x + 4, y + h - 12, w - 8, 8, '#4f9cc0'); R(g, x + 10, y + 8, 6, 4, '#fff6d8'); R(g, x + w - 18, y + h - 16, 8, 4, '#f4ecd8'); }
    else if (kind === 'night') { R(g, x + 10, y + 8, 4, 4, '#ffe9a0'); for (let i = 0; i < 5; i++) R(g, x + 8 + i * 7, y + 14 + (i % 2) * 4, 2, 2, '#ffffff'); }
    else if (kind === 'flower') { R(g, x + w / 2 - 2, y + 10, 4, h - 16, '#5fa356'); R(g, x + w / 2 - 6, y + 6, 12, 8, '#f06f6a'); R(g, x + w / 2 - 2, y + 8, 4, 4, '#ffd25a'); }
    else if (kind === 'map') { R(g, x + 8, y + 8, 12, 8, '#8fbf6a'); R(g, x + w - 22, y + 12, 14, 8, '#8fbf6a'); R(g, x + 10, y + h - 10, w - 20, 2, '#c9534a'); }
    else { R(g, x + 6, y + h - 12, w - 12, 6, '#7fb262'); R(g, x + w / 2 - 4, y + 8, 8, 8, '#f08a5a'); }
  }
  function plaque(g, cx, y, s, w, P) {
    P = Object.assign({}, PAL.plaque, P || {});
    const pw = w || Math.max(64, s.length * 12 + 18);
    R(g, cx - pw / 2 - 2, y - 2, pw + 4, 18, P.edge); R(g, cx - pw / 2, y, pw, 14, P.bg); R(g, cx - pw / 2, y, pw, 2, P.hi);
    text(g, s, cx, y + 7.5, P.ink, 10);
  }
  function embeddedDoor(g, cx, bottom, h, name, D, plaqueP) {
    D = Object.assign({}, PAL.door, D || {});
    const w = 40, x = cx - w / 2, top = bottom - h;
    R(g, x - 5, top - 5, w + 10, h + 5, D.frame); R(g, x - 3, top - 3, w + 6, 2, D.frameHi);
    R(g, x, top, w, h, D.leaf); R(g, x, top, w, 4, D.lintel);
    R(g, x + 4, top + 7, w - 8, 10, D.glass); R(g, cx - 1, top + 7, 2, 10, D.plank);
    for (let px = x + 8; px < x + w - 2; px += 8) R(g, px, top + 20, 2, h - 22, D.plank);
    R(g, x + 2, top + 19, w - 4, 2, D.frameHi);
    R(g, x + w - 10, top + Math.round(h * 0.56), 4, 4, '#f0c45c'); R(g, x + w - 10, top + Math.round(h * 0.56) + 4, 4, 2, '#9c6f2a');
    if (name) plaque(g, cx, top - 20, name.length > 7 ? name.slice(0, 7) + '…' : name, 0, plaqueP);
  }
  const roomsOn = id => { const w = W(); return (w && w.roomsForFloor) ? w.roomsForFloor(id) : []; };

  // 墙带：楼层每条朝南外轮廓边各一段（floors.js 计算）；旧数据回退为整宽北墙。
  const bandsOf = f => (f && f.bands && f.bands.length) ? f.bands : [{ x: 0, y: 0, w: (f && f.width) || 2880, h: (f && f.wallBase) || 58 }];
  const bandAt = (f, x) => bandsOf(f).find(b => x >= b.x + 24 && x <= b.x + b.w - 24) || null;
  const bandForDoor = (f, x, y) => bandsOf(f).find(b => x >= b.x && x <= b.x + b.w && Math.abs(y - (b.y + b.h + 22)) <= 20) || null;
  const floorAt = (f, x, y) => { const w = W(); return !!(w && w.inFloor && w.inFloor(f.id, x, y)); };

  function backWall(g, f) {
    const th = themeOf(f.id), P = wallPal(th), H = f.wallBase || 58;
    const rooms = roomsOn(f.id);
    for (const b of bandsOf(f)) {
      const lift = b.y === 0 ? 60 : 18;
      g.save(); g.beginPath(); g.rect(b.x, b.y - lift, b.w, H + lift); g.clip(); g.translate(0, b.y);
      wallSurface(g, b.x, -lift, b.w, H - 34 + lift, P);
      if (b.y === 0) R(g, b.x, -4, b.w, 4, P.crown);
      else { R(g, b.x, -18, b.w, 16, P.cap); R(g, b.x, -18, b.w, 2, P.capHi); R(g, b.x, -16, b.w, 2, P.capTop); R(g, b.x, -4, b.w, 4, P.crown); }
      wainscot(g, b.x, H - 34, b.w, 34, P);
      const winTop = 14, winBot = H - 44, inB = x => x >= b.x + 26 && x <= b.x + b.w - 26;
      for (const cx of (th.windows || [])) if (inB(cx)) windowAt(g, cx, winTop, winBot, th.windowStyle || 'square', th.windowPal || null);
      for (const cx of (th.sconces || [])) if (inB(cx)) sconce(g, cx, 22, th.sconceColor);
      for (const [x, kind, fw, fh] of (th.frames || [])) if (inB(x) && inB(x + (fw || 44))) frame(g, x, 22, fw || 44, fh || 30, kind);
      if (th.plaque && inB(th.plaque.x)) plaque(g, th.plaque.x, 18, th.plaque.text, th.plaque.w, th.plaquePal);
      if (th.backDecor) th.backDecor(g, f, API, H, b);
      for (const r of rooms) {
        if (!r.door || bandForDoor(f, r.door.x, r.door.y) !== b) continue;
        embeddedDoor(g, r.door.x, H, 62, null, th.door);
        plaque(g, r.door.x + 66, 26, r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);
      }
      g.restore();
      // 墙带端头：旁边仍是楼面时补一根立柱，避免墙体在半空截断
      for (const [ex, side] of [[b.x, -1], [b.x + b.w, 1]]) {
        if (!floorAt(f, ex + side * 6, b.y + H / 2)) continue;
        const px = side < 0 ? ex - 2 : ex - 10;
        R(g, px, b.y - lift, 12, H + lift, P.capLo); R(g, px + 2, b.y - lift, 8, H + lift - 4, P.cap); R(g, px + 2, b.y - lift, 2, H + lift - 4, P.capHi);
        R(g, px, b.y + H - 4, 12, 4, P.base);
      }
    }
    return true;
  }

  function wall(g, wl) {
    if (wl.northBand || wl.elevatorHall) return true;
    const fid = guessFloor(wl), th = themeOf(fid), P = wallPal(th);
    if (wl.style === 'fence' || wl.style === 'hedge' || wl.style === 'glass') return lowWall(g, wl, th);
    if (wl.style === 'house') return house(g, wl, th, fid, P);
    const x = Math.round(wl.x), y = Math.round(wl.y), w = Math.round(wl.w), h = Math.round(wl.h);
    const face = Math.min(wl.face || 34, 34), T = 12;
    if (w >= h) {
      const capY = y - face, faceTop = capY + T, bottom = y + h;
      wallSurface(g, x, faceTop, w, Math.max(4, bottom - faceTop - 18), P);
      wainscot(g, x, bottom - 18, w, 18, P);
      if (th.faceDecor) { g.save(); g.beginPath(); g.rect(x + 6, faceTop, w - 12, bottom - faceTop); g.clip(); th.faceDecor(g, wl, faceTop, bottom, API); g.restore(); }
      const doorsHere = roomsOn(fid).filter(r => r.door && r.door.x >= x + 24 && r.door.x <= x + w - 24 && Math.abs(r.door.y - (bottom + 20)) <= 16);
      for (const r of doorsHere) embeddedDoor(g, r.door.x, bottom, 36, null, th.door);
      R(g, x, capY, w, T, P.cap); R(g, x, capY, w, 2, P.capHi); R(g, x, capY + 2, w, 2, P.capTop); R(g, x, capY + T - 2, w, 2, P.capLo);
      for (const r of doorsHere) plaque(g, r.door.x, capY + 1, r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);   // 门牌挂在墙顶
      for (const ex of [x, x + w - 6]) { R(g, ex, capY, 6, bottom - capY, P.capLo); R(g, ex + (ex === x ? 0 : 4), capY, 2, bottom - capY, ex === x ? P.capHi : P.capLo); R(g, ex + 2, capY + 2, 2, bottom - capY - 4, P.cap); }
      R(g, x, bottom, w, 2, 'rgba(40,20,8,0.35)');
    } else {
      const capTop = y - face, capBot = y + h - face;
      R(g, x, capTop, w, capBot - capTop, P.cap); R(g, x, capTop, 2, capBot - capTop, P.capHi); R(g, x + w - 2, capTop, 2, capBot - capTop, P.capLo);
      for (let sy = capTop + 24; sy < capBot - 8; sy += 48) R(g, x + 2, sy, w - 4, 2, P.capLo);
      wallSurface(g, x, capBot, w, Math.max(4, face - 18), P); wainscot(g, x, y + h - 18, w, 18, P);
      R(g, x, capBot, w, 2, P.capLo);
    }
    return true;
  }
  // ---------- 矮隔断：木栅栏 / 绿篱 / 玻璃护栏（高度 = wl.face，默认 28） ----------
  function lowWall(g, wl, th) {
    const x = Math.round(wl.x), y = Math.round(wl.y), w = Math.round(wl.w), h = Math.round(wl.h);
    const H = wl.face || 28, horiz = w >= h, st = wl.style;
    const S = Object.assign({}, (th[st] || {}), wl.skin || {});
    const bottom = y + h;
    if (st === 'hedge') {
      const dark = S.dark || '#3f7a3a', mid = S.mid || '#4f9446', hi = S.hi || '#6cb35c', flower = S.flower || null;
      if (horiz) {
        R(g, x, bottom - H, w, H, dark); R(g, x, bottom - 4, w, 4, '#2e5a2a');
        for (let px = x + 6; px < x + w - 4; px += 14) { pxEllipse(g, px + 4, bottom - H + 4, 10, 7, mid); R(g, px, bottom - H, 8, 2, hi); }
        for (let px = x + 10; px < x + w - 6; px += 22) { R(g, px, bottom - H + 10, 4, 2, hi); if (flower && hash(px, y) > 0.55) R(g, px + 6, bottom - H + 6, 4, 4, flower[Math.floor(hash(px, 3) * flower.length)]); }
      } else {
        R(g, x - 4, y - H, w + 8, h + H, dark); R(g, x - 4, bottom - 4, w + 8, 4, '#2e5a2a');
        for (let py = y - H + 6; py < bottom - 8; py += 14) { pxEllipse(g, x + w / 2, py, w / 2 + 6, 7, mid); R(g, x - 2, py - 6, w + 4, 2, hi); }
      }
      return true;
    }
    if (st === 'glass') {
      const post = S.post || '#8a9aa6', rail = S.rail || '#a8723f', pane = S.pane || 'rgba(190,232,246,0.42)';
      if (horiz) {
        R(g, x, bottom - H + 4, w, H - 6, pane); R(g, x, bottom - H + 6, w, 2, 'rgba(255,255,255,0.55)');
        for (let px = x; px <= x + w - 4; px += 48) R(g, px, bottom - H, 4, H, post);
        R(g, x + w - 4, bottom - H, 4, H, post);
        R(g, x - 2, bottom - H - 2, w + 4, 5, rail); R(g, x - 2, bottom - H - 2, w + 4, 1, '#d29a62'); R(g, x, bottom - 2, w, 2, '#5a6670');
      } else {
        R(g, x, y - H, w, h + H, pane);
        for (let py = y; py <= bottom; py += 48) R(g, x - 1, py - H, w + 2, H, post);
        R(g, x + Math.round(w / 2) - 2, y - H, 4, h, rail);
      }
      return true;
    }
    // fence：带帽柱 + 双横杆
    const post = S.post || '#f4efe4', postLo = S.postLo || '#c9bea6', railC = S.rail || '#e8e0cc', railLo = S.railLo || '#b3a68a';
    if (horiz) {
      for (const ry of [bottom - H + 6, bottom - H + 16]) { R(g, x, ry, w, 4, railC); R(g, x, ry + 4, w, 1, railLo); }
      for (let px = x; px <= x + w - 6; px += 32) { R(g, px, bottom - H, 6, H, post); R(g, px + 4, bottom - H, 2, H, postLo); R(g, px - 1, bottom - H - 2, 8, 3, post); }
      R(g, x + w - 6, bottom - H, 6, H, post); R(g, x, bottom - 2, w, 2, 'rgba(40,20,8,0.25)');
    } else {
      const cx = x + Math.round(w / 2);
      R(g, cx - 3, y - H + 6, 2, h, railC); R(g, cx + 1, y - H + 6, 2, h, railLo);
      for (let py = y; py <= bottom; py += 32) { R(g, cx - 3, py - H, 6, H, post); R(g, cx + 1, py - H, 2, H, postLo); R(g, cx - 4, py - H - 2, 8, 3, post); }
    }
    return true;
  }

  // ---------- 独立小建筑：紧凑微缩 3/4 屋顶（与碰撞盒对齐，避免遮挡北侧角色）+ 立面 + 嵌墙门 ----------
  function house(g, wl, th, fid, P0) {
    const x = Math.round(wl.x), y = Math.round(wl.y), w = Math.round(wl.w), h = Math.round(wl.h);
    const S = Object.assign({ kind: 'gable' }, th.house || {}, wl.skin || {});
    const P = Object.assign({}, P0, S.wall || {});
    const bottom = y + h, facadeH = Math.min(S.facadeH || 40, Math.max(36, h - 22)), fTop = bottom - facadeH, top = y - 10;
    // 地面投影
    g.fillStyle = 'rgba(50,25,10,0.22)'; g.fillRect(x + 8, bottom, w, 6);
    // 立面
    wallSurface(g, x, fTop, w, facadeH - 12, P);
    R(g, x, bottom - 12, w, 12, P.wains); R(g, x, bottom - 12, w, 2, P.wainsHi); R(g, x, bottom - 4, w, 4, P.base);
    const doors = roomsOn(fid).filter(r => r.door && r.door.x >= x + 20 && r.door.x <= x + w - 20 && Math.abs(r.door.y - (bottom + 20)) <= 16);
    // 立面窗：避开门
    for (let wx = x + 30; wx < x + w - 30; wx += 64) {
      if (doors.some(r => Math.abs(r.door.x - wx) < 46)) continue;
      if (S.kind === 'cabin') { pxEllipse(g, wx, fTop + 18, 9, 9, '#8a8f96'); pxEllipse(g, wx, fTop + 18, 6, 6, '#7fc8e6'); R(g, wx - 3, fTop + 14, 2, 3, '#ffffff'); continue; }
      R(g, wx - 13, fTop + 6, 26, 18, S.winFrame || '#6e4322'); R(g, wx - 11, fTop + 8, 22, 14, S.glass || '#a8dcef');
      R(g, wx - 1, fTop + 8, 2, 14, S.winFrame || '#6e4322'); R(g, wx - 11, fTop + 14, 22, 2, S.winFrame || '#6e4322'); R(g, wx - 9, fTop + 10, 2, 4, '#ffffff');
      if (S.flowerBox !== false) { R(g, wx - 14, fTop + 24, 28, 4, '#a2602f'); for (let i = 0; i < 4; i++) R(g, wx - 12 + i * 7, fTop + 21, 4, 3, ['#f06f6a', '#ffd25a', '#f5a0c8', '#ffffff'][i]); }
    }
    for (const r of doors) embeddedDoor(g, r.door.x, bottom, 38, null, S.door || th.door);
    if (S.kind === 'flat') {
      // 石砌柱廊：壁柱 + 檐口齿饰 + 平顶女儿墙
      for (let px = x + 4; px < x + w - 8; px += 56) { if (doors.some(r => Math.abs(r.door.x - (px + 6)) < 30)) continue; R(g, px, fTop, 10, facadeH - 4, S.column || '#e9dfc8'); R(g, px, fTop, 2, facadeH - 4, '#f8f2e4'); R(g, px + 8, fTop, 2, facadeH - 4, '#c9b994'); }
      R(g, x - 4, top, w + 8, Math.max(8, fTop - top - 8), S.roof || '#8c7a62'); R(g, x - 4, top, w + 8, 3, S.roofHi || '#b4a284');
      for (let py = top + 5, r = 0; py < fTop - 12; py += 9, r++) for (let px = x - 2 + (r % 2 ? 10 : 0); px < x + w + 2; px += 20) {
        const pw = Math.min(18, x + w + 2 - px); if (pw <= 2) continue;
        R(g, px, py, pw, 7, hash(px, py) > 0.5 ? (S.roofLo || '#7c6a52') : (S.roof || '#8c7a62')); R(g, px, py, pw, 2, S.roofHi || '#b4a284');
      }
      // 三角山花（正对首个门）
      const pc = doors.length ? doors[0].door.x : x + w / 2;
      for (let i = 0; i < 6; i++) R(g, pc - 30 + i * 5, fTop - 10 - i * 2, 60 - i * 10, 2, S.cornice || '#e2d5b8');
      R(g, x - 6, fTop - 8, w + 12, 8, S.cornice || '#e2d5b8'); R(g, x - 6, fTop - 8, w + 12, 2, '#f6efdd');
      for (let px = x - 2; px < x + w + 2; px += 8) R(g, px, fTop - 4, 4, 2, '#b8a888');
      R(g, x - 6, fTop - 2, w + 12, 2, 'rgba(40,20,8,0.3)');
    } else if (S.kind === 'cabin') {
      // 船舱：圆角舱顶 + 甲板护栏 + 救生圈
      R(g, x - 4, top + 8, w + 8, Math.max(8, fTop - top - 8), S.roof || '#f4efe4'); R(g, x - 4, top + 8, w + 8, 2, '#ffffff');
      for (let py = top + 14; py < fTop - 4; py += 8) R(g, x, py, w, 2, S.roofLo || '#d8d0bc');
      for (let px = x - 2; px < x + w; px += 24) R(g, px, top, 3, 10, S.rail || '#a8723f');
      R(g, x - 4, top, w + 8, 3, S.rail || '#a8723f');
      R(g, x - 5, fTop - 5, w + 10, 5, S.trim || '#385e7a'); R(g, x - 5, fTop - 5, w + 10, 2, '#5e8cae');
      const lx = x + w - 26; pxEllipse(g, lx, top + 20, 8, 8, '#e0524a'); pxEllipse(g, lx, top + 20, 5, 5, '#ffffff'); pxEllipse(g, lx, top + 20, 2, 2, S.roof || '#f4efe4');
    } else if (S.kind === 'awning') {
      // 售亭：平顶 + 条纹雨棚 + 招牌
      R(g, x - 4, top + 4, w + 8, Math.max(8, fTop - top - 16), S.roof || '#efe6d2'); R(g, x - 4, top + 4, w + 8, 2, '#fffaf0');
      R(g, x - 4, top + 2, w + 8, 3, S.roofLo || '#b8a888');
      const a = S.stripes || ['#e05a4c', '#fdf3e0'];
      for (let px = x - 6, i = 0; px < x + w + 6; px += 12, i++) { R(g, px, fTop - 14, 12, 11, a[i % 2]); R(g, px + 1, fTop - 3, 10, 3, a[i % 2]); }
      R(g, x - 6, fTop - 16, w + 12, 2, '#7a3a2c'); R(g, x - 6, fTop + 1, w + 12, 3, 'rgba(40,20,8,0.22)');
    } else {
      // gable 坡顶：木瓦逐行错缝 + 屋脊 + 檐口
      const rTop = top + 4, rBot = fTop - 3, roof = S.roof || '#b5523f', roofLo = S.roofLo || '#8e3b2e', roofHi = S.roofHi || '#d06f58';
      for (let ry = rTop, r = 0; ry < rBot; ry += 6, r++) {
        R(g, x - 6, ry, w + 12, 6, r % 2 ? roof : roofHi);
        for (let px = x - 6 + (r % 2 ? 7 : 0); px < x + w + 6; px += 14) R(g, px, ry, 2, 6, roofLo);
        R(g, x - 6, ry + 5, w + 12, 1, roofLo);
      }
      R(g, x - 8, top, w + 16, 5, S.ridge || '#6e2e24'); R(g, x - 8, top, w + 16, 2, roofHi);
      R(g, x - 8, rBot, w + 16, 4, S.eave || '#5e3519'); R(g, x - 6, rBot + 4, w + 12, 3, 'rgba(40,20,8,0.28)');
      if (S.chimney !== false) { const cx = x + Math.round(w * 0.72); R(g, cx, top - 8, 12, 10, '#9a6a52'); R(g, cx - 1, top - 10, 14, 3, '#6e4a3a'); }
    }
    for (const r of doors) plaque(g, r.door.x, fTop - (S.kind === 'awning' ? 22 : 12), r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name, 0, th.plaquePal);
    // 两侧山墙阴影
    R(g, x, fTop, 3, facadeH, 'rgba(255,255,255,0.18)'); R(g, x + w - 4, fTop, 4, facadeH, 'rgba(40,20,8,0.25)');
    return true;
  }
  // 墙对象不带 floorId：按 id 前缀 f<N>: 解析
  function guessFloor(wl) { const m = /^f(\d+):/.exec(wl.id || ''); return m ? Number(m[1]) : 1; }

  function edges(g, f) {
    const th = themeOf(f.id), P = wallPal(th), poly = f.polygon;
    const path = () => { g.beginPath(); poly.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath(); };
    g.save();
    g.beginPath(); g.rect(-560, -280, f.width + 1120, f.height + 560); poly.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath();
    g.clip('evenodd'); g.lineJoin = 'miter';
    if (th.exterior) {
      // 轮廓外的「室外景」（海面 / 天空 / 庭院草坪…）：首帧烘焙到离屏画布，之后每帧一次 drawImage。
      const key = '__ext' + f.id;
      if (!API[key]) {
        const c = document.createElement('canvas'); c.width = f.width + 1120; c.height = f.height + 560;
        const cg = c.getContext('2d'); cg.imageSmoothingEnabled = false; cg.translate(560, 280);
        th.exterior(cg, f, API, { x: -560, y: -280, w: f.width + 1120, h: f.height + 560 });
        API[key] = c;
      }
      g.drawImage(API[key], -560, -280);
    }
    path(); g.lineWidth = 28; g.strokeStyle = P.capLo; g.stroke();
    path(); g.lineWidth = 22; g.strokeStyle = P.cap; g.stroke();
    path(); g.lineWidth = 8; g.strokeStyle = P.capHi; g.stroke();
    path(); g.lineWidth = 4; g.strokeStyle = th.edgeHi || PAL.edgeHi; g.stroke();
    g.restore();
    g.save(); path(); g.clip(); path(); g.lineWidth = 12; g.strokeStyle = 'rgba(50,25,10,0.22)'; g.stroke(); g.restore();
    return true;
  }

  // ---------- 通用陈设（f.x/f.y = 落地矩形左上；by = 落地线） ----------
  const C = {};
  C.fountain = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, rx = Math.round(f.w / 2), ry = Math.round(f.h / 2) - 4, cy = by - ry - 2;
    pxEllipse(g, cx, cy + 6, rx, ry, '#7c6a52'); pxEllipse(g, cx, cy, rx, ry, '#e2d5b8'); pxEllipse(g, cx, cy, rx - 4, ry - 3, '#c8b893');
    pxEllipse(g, cx, cy + 1, rx - 10, ry - 7, '#3f8fb5'); pxEllipse(g, cx, cy, rx - 14, ry - 10, '#5fb3d6');
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; R(g, cx + Math.cos(a) * (rx - 26) - 3, cy + Math.sin(a) * (ry - 14), 6, 2, '#bfe7f4'); }
    R(g, cx - 8, cy - 30, 16, 32, '#cdbd98'); R(g, cx - 8, cy - 30, 4, 32, '#e6dbc2'); R(g, cx + 4, cy - 30, 4, 32, '#a99a78');
    pxEllipse(g, cx, cy - 32, 24, 7, '#e2d5b8'); pxEllipse(g, cx, cy - 32, 18, 4, '#5fb3d6');
    R(g, cx - 2, cy - 50, 4, 18, '#cfeefa'); R(g, cx - 6, cy - 46, 2, 10, '#bfe7f4'); R(g, cx + 4, cy - 46, 2, 10, '#bfe7f4');
    R(g, cx - 12, cy - 38, 2, 6, '#bfe7f4'); R(g, cx + 10, cy - 38, 2, 6, '#bfe7f4'); R(g, cx - 1, cy - 54, 2, 4, '#ffffff'); R(g, cx - rx + 6, cy - 2, 4, 2, '#f6efdd');
  };
  C.pillar = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, H = 92, w = 22, x = cx - w / 2;
    R(g, x - 4, by - 10, w + 8, 10, '#bfae8a'); R(g, x - 4, by - 10, w + 8, 2, '#e3d6ba');
    R(g, x, by - H, w, H - 10, '#e9dfc8'); R(g, x, by - H, 4, H - 10, '#f6efe0'); R(g, x + w - 6, by - H, 6, H - 10, '#c9b994');
    for (let px = x + 7; px < x + w - 6; px += 5) R(g, px, by - H + 6, 2, H - 22, '#d6c8a8');
    R(g, x - 4, by - H - 8, w + 8, 8, '#d8caa8'); R(g, x - 4, by - H - 8, w + 8, 2, '#f3ead6'); R(g, x - 2, by - H - 12, w + 4, 4, '#bfae8a');
    for (let i = 0; i < 5; i++) R(g, x + (i % 2 ? 12 : 2), by - H + 14 + i * 14, 8, 4, i % 2 ? '#5fa356' : '#4c8c46');
  };
  C.planter = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x, by - 18, w, 18, '#9a5d32'); R(g, x, by - 18, w, 2, '#c07a46'); R(g, x, by - 2, w, 2, '#5e3519');
    for (let px = x + 12; px < x + w - 6; px += 24) R(g, px, by - 16, 2, 14, '#7c4826');
    R(g, x + 2, by - 22, w - 4, 4, '#5a3a22');
    const cols = ['#f06f6a', '#ffd25a', '#f5a0c8', '#ffffff', '#b98ae8'];
    for (let px = x + 4, i = 0; px < x + w - 8; px += 8, i++) {
      R(g, px, by - 30 - (i % 3) * 2, 6, 10 + (i % 3) * 2, i % 2 ? '#5fa356' : '#4c8c46');
      R(g, px + 1, by - 34 - (i % 3) * 2, 4, 4, cols[(i + Math.round(x / 7)) % cols.length]);
    }
  };
  C.stall = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), top = by - 78;
    const awn = f.awning || ['#e05a4c', '#fdf3e0'];
    R(g, x + 2, top + 10, 6, 68, '#6e4322'); R(g, x + w - 8, top + 10, 6, 68, '#6e4322');
    R(g, x, by - 28, w, 28, '#9a5d32'); R(g, x, by - 28, w, 4, '#c07a46'); R(g, x, by - 2, w, 2, '#5e3519');
    for (let px = x + 10; px < x + w - 6; px += 20) R(g, px, by - 22, 2, 18, '#7c4826');
    const goods = [['#f06f6a', '#d94f4a'], ['#ffd25a', '#e8a838'], ['#8fd07a', '#5fa356'], ['#f4a55a', '#d9802e']];
    for (let i = 0, px = x + 6; px < x + w - 26; px += 28, i++) {
      R(g, px, by - 38, 24, 10, '#c79358'); R(g, px, by - 38, 24, 2, '#e2b47a');
      const c = goods[(i + Math.round(x / 9)) % goods.length];
      for (let k = 0; k < 4; k++) { R(g, px + 2 + k * 5, by - 44 + (k % 2) * 2, 5, 5, c[0]); R(g, px + 3 + k * 5, by - 44 + (k % 2) * 2, 2, 2, '#ffffff'); }
    }
    for (let i = 0, px = x - 6; px < x + w + 6; px += 12, i++) { R(g, px, top, 12, 16, awn[i % 2]); R(g, px + 2, top + 16, 8, 4, awn[i % 2]); }
    R(g, x - 6, top - 2, w + 12, 2, '#7a3a2c'); R(g, x - 6, top + 6, w + 12, 2, 'rgba(255,255,255,0.25)');
  };
  C.coffeetable = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, rx = Math.round(f.w / 2), ry = 10;
    R(g, cx - 3, by - 14, 6, 12, '#5e3519'); pxEllipse(g, cx, by - 16, rx, ry + 2, '#6e4322'); pxEllipse(g, cx, by - 18, rx, ry, '#b07040'); pxEllipse(g, cx - 4, by - 20, rx - 10, ry - 4, '#c4834e');
    R(g, cx - 14, by - 24, 8, 6, '#fdf6e8'); R(g, cx - 14, by - 24, 8, 2, '#8a5530'); R(g, cx + 6, by - 22, 10, 4, '#e8b85c'); R(g, cx + 8, by - 24, 6, 2, '#f6d58a');
  };
  C.armchair = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    const [main, dark, hi] = f.tone || (/茶歇|红/.test(f.label) ? ['#c0614f', '#8e4136', '#d97f6a'] : /共读|绿/.test(f.label) ? ['#5f8f6a', '#3f6a4c', '#7fae86'] : /蓝|海/.test(f.label) ? ['#4f7fa8', '#355a7c', '#6f9fc8'] : ['#c9883e', '#94602a', '#e0a65a']);
    R(g, x + 4, by - 4, 4, 4, '#4a2a14'); R(g, x + w - 8, by - 4, 4, 4, '#4a2a14');
    R(g, x + 2, by - 42, w - 4, 24, dark); R(g, x + 6, by - 44, w - 12, 2, dark); R(g, x + 6, by - 40, w - 12, 16, main); R(g, x + 6, by - 40, w - 12, 2, hi);
    R(g, x + 4, by - 22, w - 8, 18, main); R(g, x + 4, by - 22, w - 8, 2, hi); R(g, x + 4, by - 6, w - 8, 2, dark);
    R(g, x, by - 30, 8, 26, dark); R(g, x + w - 8, by - 30, 8, 26, dark); R(g, x, by - 30, 8, 2, hi); R(g, x + w - 8, by - 30, 8, 2, hi);
  };
  C.sofa = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    const [main, dark, hi] = f.tone || (/东廊|黄|阳光/.test(f.label) ? ['#c99a3a', '#94701f', '#e3b95a'] : /蓝|海|水手/.test(f.label) ? ['#4f7fa8', '#355a7c', '#6f9fc8'] : /绿|林|草/.test(f.label) ? ['#5f8f6a', '#3f6a4c', '#7fae86'] : ['#b5523f', '#83382b', '#d06f58']);
    R(g, x + 6, by - 4, 6, 4, '#4a2a14'); R(g, x + w - 12, by - 4, 6, 4, '#4a2a14'); R(g, x + 4, by - 46, w - 8, 28, dark);
    const n = Math.max(2, Math.round((w - 24) / 52)), cw = (w - 24) / n;
    for (let i = 0; i < n; i++) {
      const cx = x + 12 + i * cw;
      R(g, cx + 2, by - 42, cw - 4, 20, main); R(g, cx + 2, by - 42, cw - 4, 2, hi);
      R(g, cx + 1, by - 22, cw - 2, 16, main); R(g, cx + 1, by - 22, cw - 2, 2, hi); R(g, cx + cw - 2, by - 22, 2, 16, dark);
    }
    R(g, x, by - 34, 12, 30, dark); R(g, x + w - 12, by - 34, 12, 30, dark); R(g, x, by - 34, 12, 2, hi); R(g, x + w - 12, by - 34, 12, 2, hi); R(g, x + 12, by - 6, w - 24, 2, dark);
    R(g, x + 20, by - 38, 14, 10, '#f2e3c2'); R(g, x + w - 34, by - 38, 14, 10, '#9fc7d6');
  };
  C.bench = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    for (const lx of [x + 6, x + w - 12]) { R(g, lx, by - 18, 6, 18, '#3e3a3a'); R(g, lx - 2, by - 2, 10, 2, '#2a2626'); }
    for (let i = 0; i < 3; i++) { R(g, x, by - 36 + i * 6, w, 4, i % 2 ? '#a5683a' : '#b97a46'); R(g, x, by - 36 + i * 6, w, 1, '#d29a62'); }
    R(g, x + 4, by - 40, 4, 22, '#3e3a3a'); R(g, x + w - 8, by - 40, 4, 22, '#3e3a3a');
    R(g, x, by - 18, w, 6, '#b97a46'); R(g, x, by - 18, w, 2, '#d29a62'); R(g, x, by - 12, w, 2, '#7c4826');
  };
  C.vending = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, w = 46, x = cx - w / 2, top = by - 76;
    const body = f.tone || (/轻食|草|花|绿/.test(f.label) ? ['#4f8f6a', '#356a4c', '#6fb08a'] : /冰|海|蓝|云/.test(f.label) ? ['#4f8fc0', '#356a94', '#6fb0de'] : /可可|茶/.test(f.label) ? ['#9a6238', '#6e4322', '#b8804e'] : ['#d0503f', '#9c3328', '#e8735f']);
    R(g, x, top, w, 76, body[1]); R(g, x + 2, top, w - 4, 74, body[0]); R(g, x + 2, top, w - 4, 2, body[2]);
    R(g, x + 6, top + 8, 26, 46, '#2d3a44');
    const items = ['#ffd25a', '#8fd07a', '#f5a0c8', '#6fc3df', '#ffffff', '#f4a55a'];
    for (let r = 0; r < 4; r++) { R(g, x + 6, top + 18 + r * 11, 26, 2, '#56616a'); for (let c = 0; c < 4; c++) R(g, x + 8 + c * 6, top + 11 + r * 11, 4, 7, items[(r * 4 + c + cx) % items.length]); }
    R(g, x + 8, top + 10, 2, 40, 'rgba(255,255,255,0.35)');
    R(g, x + 35, top + 10, 6, 20, '#e9e2d0'); R(g, x + 36, top + 12, 4, 2, '#3c2210'); R(g, x + 36, top + 16, 4, 4, '#ffd25a');
    R(g, x + 6, top + 60, 34, 8, '#1f262c'); R(g, x + 8, top + 62, 30, 4, '#3a444c'); R(g, x, by - 2, w, 2, '#3c2210');
  };
  const PRODUCE = [['#f06f6a', '#c94a45'], ['#ffd25a', '#e0a63a'], ['#8fd07a', '#5fa356'], ['#f4a55a', '#d9802e'], ['#b98ae8', '#8a5cc0']];
  function crateAt(g, x, by, w, h, seed, lid, goods) {
    R(g, x, by - h, w, h, '#8a5530'); R(g, x + 2, by - h + 2, w - 4, h - 4, '#b07444');
    for (let sy = by - h + 2; sy < by - 4; sy += 8) R(g, x + 2, sy + 6, w - 4, 2, '#8a5530');
    R(g, x + 2, by - h + 2, w - 4, 2, '#cf9460'); R(g, x + 4, by - h + 4, 4, h - 8, '#7c4826'); R(g, x + w - 8, by - h + 4, 4, h - 8, '#7c4826');
    if (!lid) {
      const c = (goods || PRODUCE)[seed % (goods || PRODUCE).length];
      for (let k = 0; k < Math.floor((w - 8) / 7); k++) { R(g, x + 4 + k * 7, by - h - 5 + (k % 2) * 2, 6, 6, c[k % 2]); R(g, x + 5 + k * 7, by - h - 5 + (k % 2) * 2, 2, 2, '#ffffff'); }
    }
    R(g, x, by - 2, w, 2, '#5e3519');
  }
  C.crate = (g, f) => crateAt(g, Math.round(f.x + 4), f.y + f.h, Math.round(f.w - 8), 28, Math.floor(hash(Math.round(f.x), Math.round(f.y)) * 97), false, f.goods);
  C.boxstack = (g, f) => {
    const x = Math.round(f.x + 4), by = f.y + f.h, w = Math.round(f.w - 8), seed = Math.floor(hash(Math.round(f.y), Math.round(f.x)) * 97);
    crateAt(g, x, by, w, 26, seed, true, f.goods); crateAt(g, x + 8, by - 26, w - 16, 22, seed + 1, false, f.goods);
  };
  C.cooler = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, w = 26, x = cx - w / 2;
    R(g, x, by - 44, w, 44, '#d8d2c4'); R(g, x + 2, by - 44, w - 4, 42, '#f2eee4'); R(g, x + 2, by - 44, 4, 42, '#ffffff');
    R(g, x + 4, by - 30, 6, 4, '#d9534a'); R(g, x + 16, by - 30, 6, 4, '#4f8fd0'); R(g, x + 4, by - 14, w - 8, 4, '#b9b2a2');
    R(g, x + 4, by - 62, w - 8, 18, '#7fc4e8'); R(g, x + 6, by - 66, w - 12, 4, '#7fc4e8'); R(g, x + 6, by - 60, 4, 12, '#c8ecfa'); R(g, x + 9, by - 70, 8, 4, '#4f8fd0'); R(g, x, by - 2, w, 2, '#8a8474');
  };
  C.tv = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, w = Math.min(100, Math.round(f.w - 12)), x = cx - w / 2, top = by - 64;
    R(g, x + 8, top + 30, 4, 34, '#6e4322'); R(g, x + w - 12, top + 30, 4, 34, '#6e4322'); R(g, cx - 2, top + 36, 4, 28, '#5e3519');
    R(g, x, top, w, 40, '#6e4322'); R(g, x + 3, top + 3, w - 6, 34, '#2f3b32');
    R(g, x + 10, top + 9, 10, 10, '#ffd25a'); R(g, x + 8, top + 13, 14, 2, '#ffd25a'); R(g, x + 13, top + 6, 4, 16, '#ffd25a');
    R(g, x + 26, top + 12, 18, 6, '#f4ecd2'); R(g, x + 30, top + 8, 10, 4, '#f4ecd2');
    text(g, f.boardText || '今日晴 22°', x + 48, top + 15, '#f4ecd2', 9, 'left'); text(g, f.boardText2 || '宜 · 交朋友', x + 12, top + 29, '#9fd07a', 9, 'left');
  };
  C.whiteboard = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, w = Math.min(110, Math.round(f.w - 8)), x = cx - w / 2, top = by - 66;
    R(g, x + 6, top + 36, 4, 30, '#6e4322'); R(g, x + w - 10, top + 36, 4, 30, '#6e4322');
    R(g, x, top, w, 42, '#8a5530'); R(g, x + 3, top + 3, w - 6, 36, '#c9955c');
    const notes = ['#fff3b0', '#ffd0d0', '#d0ecff', '#d8f5c8'];
    for (let i = 0; i < 6; i++) { const nx = x + 8 + (i % 3) * Math.floor((w - 16) / 3), ny = top + 7 + Math.floor(i / 3) * 16; R(g, nx, ny, 22, 12, notes[i % 4]); R(g, nx + 2, ny + 4, 16, 2, '#9c8a68'); R(g, nx + 9, ny - 1, 4, 3, '#d9534a'); }
  };
  C.floorlamp = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
    R(g, cx - 8, by - 4, 16, 4, '#4a2a14'); R(g, cx - 1, by - 56, 2, 52, '#5e3519');
    R(g, cx - 12, by - 72, 24, 16, '#f2d48a'); R(g, cx - 12, by - 72, 24, 2, '#fff0bf'); R(g, cx - 12, by - 58, 24, 2, '#c99a48');
    g.fillStyle = 'rgba(255,220,140,0.14)'; g.fillRect(cx - 30, by - 84, 60, 44);
  };
  C.readtable = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x + 4, by - 16, 6, 16, '#5e3519'); R(g, x + w - 10, by - 16, 6, 16, '#5e3519');
    R(g, x, by - 30, w, 16, '#a86a3a'); R(g, x, by - 30, w, 2, '#c8874f'); R(g, x, by - 16, w, 2, '#6e4322');
    R(g, x + 16, by - 36, 22, 6, '#c9534a'); R(g, x + 18, by - 40, 18, 4, '#3f7fa8');
    R(g, x + 60, by - 34, 26, 4, '#fdf6e8'); R(g, x + 72, by - 34, 2, 4, '#8a5530');
    R(g, x + w - 34, by - 40, 8, 10, '#5fa356'); R(g, x + w - 36, by - 34, 12, 4, '#9a5d32');
  };
  C.plant = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, pot = f.pot || ['#c9714a', '#9a4f30', '#e08a5e'];
    R(g, cx - 12, by - 20, 24, 20, pot[0]); R(g, cx - 14, by - 22, 28, 4, pot[2]); R(g, cx + 6, by - 18, 6, 18, pot[1]); R(g, cx - 12, by - 2, 24, 2, pot[1]);
    const leaf = ['#3f7f3f', '#4f9a4a', '#66b25a'];
    const pts = [[-4, -30, 10, 8], [-16, -40, 12, 8], [6, -42, 12, 8], [-10, -54, 10, 10], [2, -58, 10, 10], [-4, -68, 8, 10], [-20, -28, 10, 6], [10, -30, 10, 6]];
    pts.forEach(([dx, dy, w, h], i) => { R(g, cx + dx, by + dy, w, h, leaf[i % 3]); R(g, cx + dx + 2, by + dy, w - 4, 2, '#8fd07a'); });
    R(g, cx - 1, by - 50, 2, 28, '#3a5f2a');
  };
  C.shelf = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 84, top = by - H;
    const wood = f.wood || ['#7a4a26', '#5e3519', '#9a6236'];
    R(g, x, top, w, H, wood[1]); R(g, x + 4, top + 6, w - 8, H - 10, '#3e2412');
    R(g, x - 2, top - 4, w + 4, 6, wood[2]); R(g, x, top, 4, H, wood[0]); R(g, x + w - 4, top, 4, H, wood[0]);
    const spines = f.spines || ['#c9534a', '#3f7fa8', '#e0b04a', '#5f9a56', '#8a5cc0', '#e8e0cc', '#d9802e'];
    for (let s = 0; s < 3; s++) {
      const sy = top + 8 + s * 25;
      R(g, x + 4, sy + 20, w - 8, 4, wood[0]); R(g, x + 4, sy + 20, w - 8, 1, wood[2]);
      let bx = x + 6, i = 0;
      while (bx < x + w - 10) {
        const k = hash(bx + s * 31, Math.round(x)), bw = 4 + Math.floor(k * 3) * 2, bh = 12 + Math.floor(hash(bx, s) * 4) * 2;
        if (k > 0.9 && bx < x + w - 24) { R(g, bx, sy + 20 - 10, 10, 10, '#c9714a'); R(g, bx + 1, sy + 20 - 16, 8, 6, '#5fa356'); bx += 14; continue; }
        R(g, bx, sy + 20 - bh, bw, bh, spines[(i + s * 2 + Math.round(x / 10)) % spines.length]); R(g, bx, sy + 20 - bh + 2, bw, 1, 'rgba(255,255,255,0.35)');
        bx += bw + (k > 0.75 ? 2 : 0); i++;
      }
    }
    R(g, x, by - 4, w, 4, wood[1]);
  };
  C.table = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    const cloth = f.cloth || ['#f6eedc', '#d9534a'];
    const nC = Math.max(2, Math.round(w / 52));
    for (let i = 0; i < nC; i++) {                                                         // 后排椅背
      const cx = x + 14 + i * ((w - 28) / Math.max(1, nC - 1));
      R(g, cx - 9, by - 52, 18, 18, '#7a4a26'); R(g, cx - 7, by - 50, 14, 4, '#a5683a'); R(g, cx - 7, by - 44, 14, 2, '#a5683a');
    }
    R(g, x + 6, by - 14, 4, 14, '#5e3519'); R(g, x + w - 10, by - 14, 4, 14, '#5e3519');
    R(g, x, by - 38, w, 18, cloth[0]);                                                     // 桌面（格纹）
    for (let yy = by - 38; yy < by - 20; yy += 6) for (let xx = x; xx < x + w; xx += 12) R(g, xx + ((yy / 6) % 2 ? 6 : 0), yy, 6, 6, cloth[1]);
    R(g, x, by - 38, w, 2, 'rgba(255,255,255,0.35)');
    R(g, x, by - 20, w, 8, cloth[0]); for (let xx = x; xx < x + w; xx += 12) { R(g, xx, by - 20, 6, 8, cloth[1]); R(g, xx + 2, by - 12, 4, 2, cloth[1]); }  // 垂边 + 波浪下摆
    R(g, x, by - 13, w, 1, 'rgba(60,30,12,0.25)');
    for (let i = 0; i < nC; i++) { const cx = x + 14 + i * ((w - 28) / Math.max(1, nC - 1)); R(g, cx - 7, by - 36, 14, 6, '#fdfbf4'); R(g, cx - 4, by - 35, 8, 4, (f.food || ['#e8a838', '#c9534a', '#8fd07a'])[i % 3]); }
    R(g, x + w / 2 - 3, by - 44, 6, 8, '#bfe7f4'); R(g, x + w / 2 - 2, by - 48, 4, 4, '#f06f6a');   // 小花瓶
  };
  C.reception = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x, by - 40, w, 40, '#7a4a26'); R(g, x + 2, by - 38, w - 4, 34, '#a5683a');
    for (let px = x + 10; px < x + w - 20; px += 34) { R(g, px, by - 32, 26, 24, '#8a5530'); R(g, px + 2, by - 30, 22, 2, '#c08a50'); }
    R(g, x - 4, by - 48, w + 8, 10, '#e9dfc8'); R(g, x - 4, by - 48, w + 8, 2, '#fbf6ea'); R(g, x - 4, by - 40, w + 8, 2, '#b8a888');    // 大理石台面
    R(g, x, by - 8, w, 2, '#c9a24a');
    R(g, x + 20, by - 56, 10, 8, '#e0b04a'); R(g, x + 23, by - 58, 4, 2, '#c99a3a');          // 服务铃
    R(g, x + w - 52, by - 56, 18, 8, '#3f7fa8'); R(g, x + w - 50, by - 60, 14, 4, '#c9534a');  // 访客登记簿
    R(g, x + w - 26, by - 64, 10, 16, '#c9714a'); R(g, x + w - 28, by - 72, 14, 10, '#5fa356');
    if (f.sign !== false) { R(g, x + w / 2 - 22, by - 30, 44, 14, '#3c2210'); text(g, f.signText || '服务台', x + w / 2, by - 23, '#fbe9c4', 9); }
  };
  C.cabinet = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 52, top = by - H;
    const wood = f.wood || ['#8a5530', '#6e4322', '#b07444'];
    R(g, x, top, w, H, wood[1]); R(g, x + 2, top + 2, w - 4, H - 6, wood[0]); R(g, x - 2, top - 4, w + 4, 6, wood[2]);
    const n = Math.max(2, Math.round(w / 34)), dw = (w - 8) / n;
    for (let i = 0; i < n; i++) { const dx = x + 4 + i * dw; R(g, dx + 1, top + 6, dw - 2, H - 16, wood[1]); R(g, dx + 3, top + 8, dw - 6, H - 20, wood[0]); R(g, dx + 3, top + 8, dw - 6, 2, wood[2]); R(g, dx + dw / 2 - 2, top + H / 2 - 2, 4, 4, '#e0b04a'); }
    R(g, x, by - 4, w, 4, wood[1]);
    const jars = f.jars || ['#f06f6a', '#ffd25a', '#8fd07a'];
    for (let i = 0; i < Math.min(4, Math.floor(w / 26)); i++) { R(g, x + 8 + i * 24, top - 14, 12, 10, '#e6f4f8'); R(g, x + 9 + i * 24, top - 10, 10, 5, jars[i % jars.length]); R(g, x + 8 + i * 24, top - 16, 12, 2, '#8a5530'); }
  };
  C.counter = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x, by - 30, w, 30, '#7a4a26'); R(g, x + 2, by - 28, w - 4, 24, '#a5683a');
    for (let px = x + 8; px < x + w - 8; px += 30) R(g, px, by - 24, 22, 16, '#8a5530');
    R(g, x, by - 6, w, 2, '#c9a24a');
    const gx = x + 4, gw = Math.round(w * 0.66);
    R(g, gx, by - 56, gw, 26, '#cfeaf2'); R(g, gx, by - 56, gw, 2, '#ffffff'); R(g, gx, by - 44, gw, 2, '#9fc7d6');          // 玻璃展柜
    const goods = f.goods2 || ['#d9a05a', '#f2d48a', '#c9714a', '#f5a0c8', '#fdf6e8'];
    for (let i = 0; i < Math.floor((gw - 8) / 14); i++) { R(g, gx + 4 + i * 14, by - 52, 10, 6, goods[i % goods.length]); R(g, gx + 4 + i * 14, by - 40, 10, 6, goods[(i + 2) % goods.length]); }
    R(g, gx + 2, by - 54, 2, 22, 'rgba(255,255,255,0.6)');
    R(g, x + gw + 12, by - 46, 24, 16, '#5a5f66'); R(g, x + gw + 14, by - 44, 20, 6, '#9fd07a');                                  // 收银机
  };
  C.desk = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x + 4, by - 18, 6, 18, '#5e3519'); R(g, x + w - 10, by - 18, 6, 18, '#5e3519');
    R(g, x, by - 34, w, 18, '#8a5530'); R(g, x, by - 34, w, 2, '#b07444'); R(g, x + w - 40, by - 30, 32, 12, '#6e4322'); R(g, x + w - 26, by - 26, 4, 2, '#e0b04a');
    R(g, x + 10, by - 42, 30, 8, '#fdf6e8'); R(g, x + 14, by - 40, 20, 2, '#9c8a68');
    R(g, x + 48, by - 48, 4, 14, '#5a5f66'); R(g, x + 42, by - 52, 16, 6, '#ffd27a');
    R(g, x + w / 2 - 9, by - 52 + 4, 18, 18, '#7a4a26'); R(g, x + w / 2 - 7, by - 46, 14, 4, '#a5683a');              // 椅背
  };
  C.printer = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
    R(g, x + 4, by - 16, 6, 16, '#5e3519'); R(g, x + w - 10, by - 16, 6, 16, '#5e3519'); R(g, x, by - 30, w, 16, '#8a5530'); R(g, x, by - 30, w, 2, '#b07444');
    const px = x + w / 2 - 22;
    R(g, px, by - 52, 44, 22, '#d8d2c4'); R(g, px + 2, by - 52, 40, 4, '#f2eee4'); R(g, px + 6, by - 44, 32, 4, '#3c3a36'); R(g, px + 8, by - 58, 28, 6, '#fdf6e8'); R(g, px + 34, by - 48, 4, 2, '#8fd07a');
    for (let i = 0; i < 3; i++) R(g, x + 6, by - 34 - i * 2, 18, 2, i % 2 ? '#fdf6e8' : '#efe6d0');
  };
  C.server = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 80, top = by - H;
    R(g, x, top, w, H, '#5e3519'); R(g, x + 4, top + 6, w - 8, H - 14, '#cfe6ee'); R(g, x - 2, top - 4, w + 4, 6, '#9a6236');
    for (let s = 1; s < 3; s++) R(g, x + 4, top + 6 + s * Math.floor((H - 14) / 3), w - 8, 2, '#7a4a26');
    const items = f.items || ['#e0b04a', '#c9534a', '#8a5cc0', '#5f9a56'];
    for (let s = 0; s < 3; s++) for (let i = 0; i < Math.floor((w - 12) / 14); i++) R(g, x + 8 + i * 14, top + 10 + s * Math.floor((H - 14) / 3) + 8, 8, 10, items[(s + i) % items.length]);
    R(g, x + 6, top + 8, 2, H - 18, 'rgba(255,255,255,0.6)'); R(g, x, by - 6, w, 6, '#4a2a14');
  };
  C.safe = (g, f) => {
    const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, w = Math.min(56, Math.round(f.w - 8)), x = cx - w / 2, H = 48;
    R(g, x, by - H, w, H, '#4a4f56'); R(g, x + 2, by - H + 2, w - 4, H - 6, '#6a7078'); R(g, x + 2, by - H + 2, w - 4, 2, '#9aa0a8');
    pxEllipse(g, cx, by - H / 2 - 2, 9, 9, '#c9a24a'); pxEllipse(g, cx, by - H / 2 - 2, 5, 5, '#3c3a36'); R(g, x + w - 10, by - H + 12, 4, 16, '#c9a24a');
    R(g, x + 4, by - 4, 6, 4, '#2a2e33'); R(g, x + w - 10, by - 4, 6, 4, '#2a2e33');
  };
  C.locker = (g, f) => {
    const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 72, top = by - H;
    const n = Math.max(2, Math.round(w / 30)), dw = w / n, tone = f.tone || ['#7fa8c8', '#5a82a2', '#a8c8e0'];
    for (let i = 0; i < n; i++) { const dx = x + i * dw; R(g, dx, top, dw - 2, H, tone[1]); R(g, dx + 2, top + 2, dw - 6, H - 6, tone[0]); R(g, dx + 2, top + 2, dw - 6, 2, tone[2]); for (let v = 0; v < 3; v++) R(g, dx + 6, top + 8 + v * 4, dw - 14, 2, tone[1]); R(g, dx + dw - 10, top + H / 2, 3, 8, '#e0b04a'); }
  };
  Object.assign(C, { rack: C.shelf, lamp: C.floorlamp, chair: C.armchair, seat: C.bench });

  function furniture(g, f) {
    const id = f.floorId || 1, th = themeOf(id), fn = (th.furniture && th.furniture[f.type]) || C[f.type];
    if (!fn) { (API.missing = API.missing || new Set()).add(id + ':' + f.type); return false; }
    g.save(); g.imageSmoothingEnabled = false; fn(g, f, API); g.restore();
    return true;
  }
  function doorMat(g, room, near, t) {
    const F = W().floorById(room.floorId), x = room.door.x, y = room.door.y;
    const bd = F ? bandForDoor(F, x, y) : null;
    const my = bd ? bd.y + bd.h + 2 : y - 14;
    R(g, x - 22, my, 44, 14, '#6e3326'); R(g, x - 20, my + 2, 40, 10, '#a84f3a');
    for (let k = x - 16; k < x + 16; k += 8) R(g, k, my + 5, 4, 4, '#e7b07a');
    if (near) {
      const a = 0.5 + 0.35 * Math.sin(t * 4);
      g.strokeStyle = `rgba(255,218,110,${a.toFixed(3)})`; g.lineWidth = 2; g.strokeRect(x - 24, my - 2, 48, 18);
      text(g, 'K 进入 ' + room.name, x, y + 16, `rgba(255,244,210,${(0.65 + 0.3 * Math.sin(t * 4)).toFixed(3)})`, 10);
    }
  }
  function register(id, theme) { themes[id] = Object.assign({ id }, theme); }
  function has(id) { const F = W() && W().floorById(id); return !!(F && F.lobby); }
  const API = { R, hash, text, FONT, pxEllipse, clipRect, withClip, MATS, paintZone, rug, windowAt, windowLight, sconce, frame, plaque, embeddedDoor,
    wallSurface, wainscot, crateAt, PRODUCE, COMMON: C, PAL };
  root.SID_LOBBY = { floor, backWall, wall, edges, furniture, doorMat, register, has, themes, API, PAL };
})(typeof window !== 'undefined' ? window : globalThis);
