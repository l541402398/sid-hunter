'use strict';
// 共享楼外景观引擎（2F–7F）：沿用 1F「迎宾草坪洲」的像素管线并参数化生物群系。
//   · 原生 2368×800 网格 → 世界 2× 整数缩放（覆盖 -640..4096 × -320..1280），锁定指数色板（≤64 色）；
//   · 岸线由「建筑轮廓 ∪ 可达庭院 ∪ 额外陆地」的 Chamfer 距离场 + 低频噪声外扩生成，天然蜿蜒，无椭圆岛拼贴；
//   · 朝南断崖立面 / 浅水 shelf / 浪沫 / 檐口投影 / 草叶咬路 / 单源左上光 / 末轮去孤立像素。
//   · 庭院景物与小径直接读取 floors.js 的 floor.yards（碰撞同源，画什么撞什么）。
// 色板槽位（与 1F EXT_PAL 同语义）：
//   1..7 水(深→沫) · 8..12 崖(湿线→顶) · 13..16 路(暗→亮) · 17..23 地面(描边/阴影/暗/中/亮/高光/边缘)
//   24..28 次级树冠(描边/影/中/亮/边) · 29..33 木(描边→亮) · 34..37 石(描边→亮) · 38..40 针叶(影/中/亮)
//   41 备用 · 42..45 点缀(暖黄/奶白/红/蓝) · 46..63 生物群系自定义
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const EW = 2368, EH = 800, OX = -640, OY = -320;
  const toPx = wx => Math.round((wx - OX) / 2), toPy = wy => Math.round((wy - OY) / 2);

  function hash2(x, y) {
    let h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function smoothNoise(x, y, cell) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    const fx = (x - cx * cell) / cell, fy = (y - cy * cell) / cell;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const n00 = hash2(cx, cy), n10 = hash2(cx + 1, cy), n01 = hash2(cx, cy + 1), n11 = hash2(cx + 1, cy + 1);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
  }
  // 扫描线填充多边形（世界坐标 → 原生网格），mark[i] = val
  function fillPoly(mark, poly, val) {
    const pts = poly.map(p => [(p.x - OX) / 2, (p.y - OY) / 2]);
    let y0 = EH, y1 = 0;
    for (const [, y] of pts) { y0 = Math.min(y0, Math.floor(y)); y1 = Math.max(y1, Math.ceil(y)); }
    y0 = Math.max(0, y0); y1 = Math.min(EH - 1, y1);
    const xs = [];
    for (let y = y0; y <= y1; y++) {
      const sy = y + 0.5; xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > sy) !== (yj > sy)) xs.push(xi + (sy - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const a = Math.max(0, Math.round(xs[k])), b = Math.min(EW, Math.round(xs[k + 1]));
        for (let x = a; x < b; x++) mark[y * EW + x] = val;
      }
    }
  }
  function chamfer(seed) {
    const dist = new Uint8Array(EW * EH);
    for (let i = 0; i < dist.length; i++) dist[i] = seed[i] ? 0 : 255;
    for (let y = 1; y < EH - 1; y++) for (let x = 1, i = y * EW + 1; x < EW - 1; x++, i++) {
      if (!dist[i]) continue;
      let d = dist[i];
      const a = dist[i - 1] + 2, b = dist[i - EW] + 2, c = dist[i - EW - 1] + 3, e = dist[i - EW + 1] + 3;
      if (a < d) d = a; if (b < d) d = b; if (c < d) d = c; if (e < d) d = e;
      dist[i] = d;
    }
    for (let y = EH - 2; y >= 1; y--) for (let x = EW - 2, i = y * EW + EW - 2; x >= 1; x--, i--) {
      if (!dist[i]) continue;
      let d = dist[i];
      const a = dist[i + 1] + 2, b = dist[i + EW] + 2, c = dist[i + EW + 1] + 3, e = dist[i + EW - 1] + 3;
      if (a < d) d = a; if (b < d) d = b; if (c < d) d = c; if (e < d) d = e;
      dist[i] = d;
    }
    return dist;
  }

  function build(f, cfg) {
    const t0 = performance.now();
    const PALX = cfg.pal;
    const grid = new Uint8Array(EW * EH);
    const bldg = new Uint8Array(EW * EH), seed = new Uint8Array(EW * EH), land = new Uint8Array(EW * EH), yardM = new Uint8Array(EW * EH), apronM = new Uint8Array(EW * EH);
    const wall = new Uint8Array(EW * EH);
    const pset = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && x < EW && y >= 0 && y < EH && c) grid[y * EW + x] = c; };
    const pat = (x, y) => { x |= 0; y |= 0; return (x >= 0 && x < EW && y >= 0 && y < EH) ? grid[y * EW + x] : 0; };
    const fillRect = (x, y, w, h, c) => {
      const x0 = Math.max(0, x | 0), x1 = Math.min(EW, (x + w) | 0), y0 = Math.max(0, y | 0), y1 = Math.min(EH, (y + h) | 0);
      for (let yy = y0; yy < y1; yy++) grid.fill(c, yy * EW + x0, yy * EW + x1);
    };
    const fillDisc = (cx, cy, rx, ry, c) => {
      const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(EW - 1, Math.ceil(cx + rx));
      const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(EH - 1, Math.ceil(cy + ry));
      for (let y = y0; y <= y1; y++) { const dy = (y - cy) / ry; for (let x = x0; x <= x1; x++) { const dx = (x - cx) / rx; if (dx * dx + dy * dy <= 1) grid[y * EW + x] = c; } }
    };
    const isGround = v => v >= 19 && v <= 21;

    // 1) 遮罩：建筑 / 庭院 / 电梯翼楼悬挑石材露台裙板 / 额外陆地（世界坐标）
    fillPoly(bldg, f.polygon, 1);
    for (const yd of (f.yards || [])) if (yd.kind !== 'pier') fillPoly(yardM, yd.poly, 1);
    const hallAprons = (f.halls || []).map(h => ({
      h,
      x0: h.x - 52, x1: h.x + h.w + 52,
      y0: h.y - 98, y1: h.y + h.h + 56
    }));
    for (const ap of hallAprons) {
      fillPoly(apronM, [{ x: ap.x0, y: ap.y0 }, { x: ap.x1, y: ap.y0 }, { x: ap.x1, y: ap.y1 }, { x: ap.x0, y: ap.y1 }], 1);
    }
    for (let i = 0; i < seed.length; i++) seed[i] = bldg[i] | yardM[i] | apronM[i];
    for (const s of (cfg.extraLand || [])) {
      if (s.poly) fillPoly(seed, s.poly.map(([x, y]) => ({ x, y })), 1);
      else if (s.rect) { const [x, y, w, h] = s.rect; fillPoly(seed, [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], 1); }
      else if (s.ellipse) {
        const [cx, cy, rx, ry] = s.ellipse, n = 28, poly = [];
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; poly.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
        fillPoly(seed, poly, 1);
      }
    }
    // 2) 有机岸线：距离场 + 低频噪声外扩
    const dSeed = chamfer(seed);
    const shore = cfg.shore ?? 16, amp = cfg.shoreAmp ?? 7;
    let dYard = null, dBldg = null;
    if (cfg.bldgShore !== undefined) {           // 建筑（船身）贴水，只给庭院与电梯石材露台留基底
      const s2 = new Uint8Array(EW * EH);
      for (let i = 0; i < s2.length; i++) s2[i] = seed[i] && !bldg[i] ? 1 : 0;
      dYard = chamfer(s2); dBldg = chamfer(bldg);
    }
    for (let y = 0; y < EH; y++) for (let x = 0, i = y * EW; x < EW; x++, i++) {
      if (seed[i]) { land[i] = 1; continue; }
      const n = smoothNoise(x + 13, y + 7, 18) * 0.7 + smoothNoise(x + 91, y + 41, 7) * 0.3;
      const lim = (shore + (n - 0.5) * 2 * amp) * 2;
      if (dYard ? (dYard[i] <= lim || dBldg[i] <= cfg.bldgShore * 2) : dSeed[i] <= lim) land[i] = 1;
    }
    // 2.5) 陆地中蜿蜒溪流 / 湖面（世界坐标折线 + 半径），不侵入建筑、庭院与东西电梯石材露台
    let dProt = null;
    if ((cfg.waterCarve || []).length) { const prot = new Uint8Array(EW * EH); for (let i = 0; i < prot.length; i++) prot[i] = bldg[i] | yardM[i] | apronM[i]; dProt = chamfer(prot); }
    for (const cv of (cfg.waterCarve || [])) {
      const pts = cv.map(([x, y, r]) => [(x - OX) / 2, (y - OY) / 2, r / 2]);
      let x0 = EW, x1 = 0, y0 = EH, y1 = 0;
      for (const [x, y, r] of pts) { x0 = Math.min(x0, x - r - 8); x1 = Math.max(x1, x + r + 8); y0 = Math.min(y0, y - r - 8); y1 = Math.max(y1, y + r + 8); }
      x0 = Math.max(0, x0 | 0); x1 = Math.min(EW - 1, Math.ceil(x1)); y0 = Math.max(0, y0 | 0); y1 = Math.min(EH - 1, Math.ceil(y1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * EW + x;
        if (apronM[i] || dProt[i] <= 28) continue;
        let best = 1e9, rad = 0;
        for (let s = 0; s < pts.length - 1; s++) {
          const [ax, ay, ar] = pts[s], [bx, by, br] = pts[s + 1];
          const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
          const d2 = (x - ax - vx * t) ** 2 + (y - ay - vy * t) ** 2;
          if (d2 < best) { best = d2; rad = ar + (br - ar) * t; }
        }
        if (pts.length === 1) { best = (x - pts[0][0]) ** 2 + (y - pts[0][1]) ** 2; rad = pts[0][2]; }
        if (Math.sqrt(best) + (smoothNoise(x + 5, y + 3, 9) - 0.5) * 6 <= rad) land[i] = 0;
      }
    }
    const cliffBase = cfg.cliffH ?? 6, cliffVar = cfg.cliffVar ?? 2;
    const cliffH = new Uint8Array(EW);
    for (let x = 0; x < EW; x++) { const q = Math.floor(x / 6) * 6; cliffH[x] = Math.max(2, cliffBase + Math.round(cliffVar * Math.sin(q * 0.09) + cliffVar * 0.7 * Math.cos(q * 0.21))); }
    for (let x = 0; x < EW; x++) {
      const ch = cliffH[x];
      for (let y = 1; y < EH; y++) {
        const i = y * EW + x;
        if (land[i]) continue;
        for (let k = 1; k <= ch; k++) if (y - k >= 0 && land[(y - k) * EW + x]) { wall[i] = k; break; }
      }
    }
    const solid = new Uint8Array(EW * EH);
    for (let i = 0; i < solid.length; i++) solid[i] = land[i] || wall[i] ? 1 : 0;
    const dist = chamfer(solid);

    // 4) 水纹模板
    const WT = new Uint8Array(32 * 32); WT.fill(3);
    const wc = (x, y, l, c) => { for (let k = 0; k < l; k++) WT[((y & 31) << 5) | ((x + k) & 31)] = c; };
    for (const [x, y, l, c] of [[2, 3, 6, 2], [4, 4, 5, 1], [15, 2, 7, 4], [24, 5, 5, 2], [8, 9, 6, 4], [10, 10, 4, 2], [21, 8, 6, 1], [22, 9, 5, 2],
      [1, 14, 7, 2], [13, 15, 6, 4], [26, 13, 5, 2], [27, 14, 4, 1], [6, 19, 5, 1], [17, 20, 7, 4], [18, 21, 5, 2], [29, 19, 4, 2],
      [3, 25, 6, 4], [12, 24, 6, 2], [13, 25, 4, 1], [23, 27, 6, 4], [25, 28, 4, 2]]) wc(x, y, l, c);
    const SIN = new Int8Array(256); for (let i = 0; i < 256; i++) SIN[i] = Math.round(Math.sin(i / 256 * Math.PI * 2) * 1.8);
    const waterStyle = cfg.water || 'river';
    const waterAt = (x, y) => {
      if (waterStyle === 'cloud') {
        // 云海：低频大云团（受光顶缘 7 / 云体 6 / 底部暗面 5 / 薄雾边 4）+ 澄澈天空底色 3
        const cn = (yy) => smoothNoise(x, yy * 1.8, 64) * 0.72 + smoothNoise(x + 300, yy * 1.8 + 77, 22) * 0.28;
        const n = cn(y);
        if (n > 0.58) return cn(y - 3) <= 0.58 ? 7 : (cn(y + 4) <= 0.58 ? 5 : 6);
        if (n > 0.53) return 4;
        return smoothNoise(x + 900, y * 2, 90) > 0.7 ? 2 : 3;
      }
      if (waterStyle === 'night') {
        const h = hash2(x >> 1, y >> 1);
        if (h > 0.9965) return 7;
        if (h > 0.993 && ((x + y) & 1)) return 6;
        const t = WT[((y & 31) << 5) | (x & 31)];
        return t === 4 ? 3 : (t === 1 ? 1 : 2);
      }
      return WT[((y & 31) << 5) | (x & 31)];
    };

    // 5) 逐像素基底
    const ground = cfg.groundTones || [19, 20, 21];
    for (let y = 0; y < EH; y++) for (let x = 0, i = y * EW; x < EW; x++, i++) {
      if (bldg[i]) continue;
      if (land[i]) {
        const n = smoothNoise(x, y, 30) * 0.8 + smoothNoise(x + 41, y + 29, 10) * 0.2;
        let c = n < 0.32 ? ground[0] : (n < 0.72 ? ground[1] : ground[2]);
        if (y + 1 < EH && !land[i + EW]) c = ((x >> 2) % 3 === 0) ? 23 : 22;
        else if (y + 2 < EH && !land[i + EW * 2] && ((x * 5 + y) % 7 < 4)) c = 23;
        else if (y + 3 < EH && !land[i + EW * 3] && ((x >> 3) & 1)) c = 22;
        // 檐口投影（左上光 → 建筑南侧 / 东侧落影）
        let sh = 0;
        for (let k = 1; k <= 6 && !sh; k++) if (y - k >= 0 && bldg[i - EW * k]) sh = k;
        for (let k = 1; k <= 4 && !sh; k++) if (x - k >= 0 && bldg[i - k]) sh = k;
        if (sh) { const wob = (((x >> 2) + (y >> 1)) % 3 === 0) ? 1 : 0; if (sh <= 2 + wob) c = (((x >> 3) + (y >> 3)) % 3 === 0) ? 19 : 18; else if (sh <= 5 + wob) c = 19; }
        grid[i] = c;
      } else if (wall[i]) {
        const dTop = wall[i], ch = cliffH[x], overhang = 1 + (Math.floor(x / 5) * 3 % 3);
        if (dTop <= overhang && (smoothNoise(x, y, 16) > 0.25 || ((x >> 2) & 1))) grid[i] = dTop === overhang ? 19 : 22;
        else if (dTop >= ch) grid[i] = cfg.cliffStyle === 'float' && ((x * 7) % 11 < 4) ? 0 : 8;
        else {
          const colId = Math.floor((x + Math.floor(dTop / 3)) / 8), colOff = (x + Math.floor(dTop / 3)) % 8;
          const crack = colOff === 0 && ((colId * 7 + (y >> 2)) % 5 !== 0);
          if (crack) grid[i] = dTop >= ch - 2 ? 8 : 9;
          else if (dTop <= overhang + 2 && colOff >= 1 && colOff <= 5) grid[i] = ((colId & 1) && colOff <= 3) ? 12 : 11;
          else grid[i] = dTop >= ch - 2 ? 9 : (colOff >= 6 ? 9 : 10);
        }
      } else {
        const d = dist[i], sw = SIN[(x * 9 + y * 6) & 255];
        if (waterStyle === 'cloud') {
          if (d + sw <= 5) grid[i] = (((x >> 2) + y) & 1) ? 7 : 6;
          else grid[i] = waterAt(x, y);
          continue;
        }
        if (d <= 2 && y > 0 && wall[i - EW]) grid[i] = ((x >> 2) % 3 === 0) ? 2 : 1;
        else if (d + sw <= 5 && ((Math.floor(x / 4) + Math.floor(y / 3)) % 3 !== 0)) grid[i] = (d <= 4 && ((x >> 2) + y) % 2 === 0) ? 7 : 6;
        else if (d + sw <= 11) grid[i] = ((x >> 3) + (y >> 2)) % 4 === 0 ? 4 : 5;
        else if (d + sw <= 17 && ((x >> 2) + (y >> 2)) % 3 === 0) grid[i] = 4;
        else grid[i] = waterAt(x, y);
      }
    }
    // 浮空岛：断崖下沿锯齿垂岩（云海层）
    if (cfg.cliffStyle === 'float') {
      for (let x = 0; x < EW; x++) for (let y = 1; y < EH - 1; y++) {
        const i = y * EW + x;
        if (!wall[i] || wall[i] !== cliffH[x] - 1) continue;
        const dl = 2 + Math.floor(hash2(x >> 2, 7) * 7);
        if ((x & 3) === 3) continue;
        for (let k = 1; k <= dl; k++) { const yy = y + k; if (yy < EH && !land[yy * EW + x]) grid[yy * EW + x] = k >= dl - 1 ? 8 : (k > dl / 2 ? 9 : 10); }
      }
    }

    // 6) 一体化连续园路系统（读取庭院 paths ∪ extraPaths → 拐角圆弧平滑 + 全局距离场平滑并集 + 统一路缘包边）
    const PS = Object.assign({
      dirt: { kind: 'dirt', edge: 13, base: 14, light: 15, pebble: 16 },
      stone: { kind: 'flag', edge: 34, base: 36, light: 37, grout: 35 },
      deck: { kind: 'plank', edge: 29, base: 31, light: 32, seam: 30, hi: 33 },
      sand: { kind: 'dirt', edge: 13, base: 15, light: 16, pebble: 14 }
    }, cfg.pathStyles || {});
    const styleList = [null], styleIdMap = new Map();
    const getStyleId = (name) => {
      const key = PS[name] ? name : 'dirt';
      if (styleIdMap.has(key)) return styleIdMap.get(key);
      const id = styleList.length;
      styleList.push(PS[key]);
      styleIdMap.set(key, id);
      return id;
    };
    const smoothPathPts = (raw) => {
      if (raw.length < 3) return raw;
      const out = [raw[0]];
      for (let k = 1; k < raw.length - 1; k++) {
        const [ax, ay, ar] = raw[k - 1], [bx, by, br] = raw[k], [cx, cy, cr] = raw[k + 1];
        const v1x = ax - bx, v1y = ay - by, l1 = Math.hypot(v1x, v1y);
        const v2x = cx - bx, v2y = cy - by, l2 = Math.hypot(v2x, v2y);
        if (l1 > 4 && l2 > 4) {
          const cut = Math.min(6.5, l1 * 0.28, l2 * 0.28);
          const q0x = bx + v1x / l1 * cut, q0y = by + v1y / l1 * cut, q0r = br + (ar - br) * (cut / l1);
          const q1x = bx + v2x / l2 * cut, q1y = by + v2y / l2 * cut, q1r = br + (cr - br) * (cut / l2);
          out.push([q0x, q0y, q0r], [0.25 * q0x + 0.5 * bx + 0.25 * q1x, 0.25 * q0y + 0.5 * by + 0.25 * q1y, br], [q1x, q1y, q1r]);
        } else {
          out.push(raw[k]);
        }
      }
      out.push(raw[raw.length - 1]);
      return out;
    };
    const pathMask = new Uint8Array(EW * EH);
    const allPaths = [];
    for (const yd of (f.yards || [])) for (const p of (yd.paths || [])) if (p.pts && p.pts.length >= 2) allPaths.push(p);
    for (const p of (cfg.extraPaths || [])) if (p.pts && p.pts.length >= 2) allPaths.push(p);
    if (allPaths.length) {
      const pathSd = new Float32Array(EW * EH); pathSd.fill(1e4);
      const pathSid = new Uint8Array(EW * EH);
      const pathAlong = new Int16Array(EW * EH);
      let ux0 = EW, ux1 = 0, uy0 = EH, uy1 = 0;
      for (const p of allPaths) {
        const sid = getStyleId(p.style), st = styleList[sid];
        const pts = smoothPathPts(p.pts.map(([x, y, r]) => [(x - OX) / 2, (y - OY) / 2, (r || 18) / 2]));
        let x0 = EW, x1 = 0, y0 = EH, y1 = 0;
        for (const [x, y, r] of pts) {
          x0 = Math.min(x0, x - r - 6); x1 = Math.max(x1, x + r + 6);
          y0 = Math.min(y0, y - r - 6); y1 = Math.max(y1, y + r + 6);
        }
        x0 = Math.max(0, x0 | 0); x1 = Math.min(EW - 1, Math.ceil(x1));
        y0 = Math.max(0, y0 | 0); y1 = Math.min(EH - 1, Math.ceil(y1));
        if (x0 < ux0) ux0 = x0; if (x1 > ux1) ux1 = x1;
        if (y0 < uy0) uy0 = y0; if (y1 > uy1) uy1 = y1;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const i = y * EW + x;
          if (!land[i] || bldg[i]) continue;
          let best = 1e9, rad = 0, dirx = 1, diry = 0;
          for (let s = 0; s < pts.length - 1; s++) {
            const [ax, ay, ar] = pts[s], [bx, by, br] = pts[s + 1];
            const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
            const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
            const cx = ax + vx * t, cy = ay + vy * t, d2 = (x - cx) ** 2 + (y - cy) ** 2;
            if (d2 < best) { best = d2; rad = ar + (br - ar) * t; const l = Math.sqrt(l2); dirx = vx / l; diry = vy / l; }
          }
          if (best > (rad + 5) * (rad + 5)) continue;
          const wob = st.kind === 'plank' ? 0
            : (st.kind === 'flag' ? (smoothNoise(x + 31, y + 17, 16) - 0.5) * 1.25 : (smoothNoise(x + 31, y + 17, 12) - 0.5) * 1.85);
          const sd = Math.sqrt(best) - rad + wob;
          const along = Math.round(x * dirx + y * diry);
          const prev = pathSd[i];
          if (prev > 900) {
            pathSd[i] = sd; pathSid[i] = sid; pathAlong[i] = along;
          } else {
            const k = 2.8, h = Math.max(0, k - Math.abs(prev - sd)) / k;
            if (sd < prev) { pathSid[i] = sid; pathAlong[i] = along; }
            pathSd[i] = Math.min(prev, sd) - h * h * k * 0.25;
          }
        }
      }
      if (ux0 <= ux1 && uy0 <= uy1) {
        for (let y = uy0; y <= uy1; y++) for (let x = ux0; x <= ux1; x++) {
          const i = y * EW + x;
          if (pathSd[i] <= 0 && land[i] && !bldg[i]) pathMask[i] = pathSid[i];
        }
        // 清理 1px 毛刺与针孔，确保路缘石单像素连续圆润
        for (let y = Math.max(1, uy0); y <= Math.min(EH - 2, uy1); y++) for (let x = Math.max(1, ux0); x <= Math.min(EW - 2, ux1); x++) {
          const i = y * EW + x;
          if (bldg[i] || !land[i]) continue;
          const nb = (pathMask[i - 1] > 0) + (pathMask[i + 1] > 0) + (pathMask[i - EW] > 0) + (pathMask[i + EW] > 0);
          if (pathMask[i] && nb <= 1) pathMask[i] = 0;
          else if (!pathMask[i] && nb >= 3) pathMask[i] = pathMask[i - 1] || pathMask[i + 1] || pathMask[i - EW];
        }
        const edgeM = new Uint8Array(EW * EH);
        for (let y = uy0; y <= uy1; y++) for (let x = ux0; x <= ux1; x++) {
          const i = y * EW + x;
          if (!pathMask[i]) continue;
          const outN = y > 0 && !pathMask[i - EW] && !bldg[i - EW];
          const outS = y < EH - 1 && !pathMask[i + EW] && !bldg[i + EW];
          const outW = x > 0 && !pathMask[i - 1] && !bldg[i - 1];
          const outE = x < EW - 1 && !pathMask[i + 1] && !bldg[i + 1];
          if (outN || outS || outW || outE) edgeM[i] = (outN ? 1 : 0) | (outW ? 2 : 0) | (outS ? 4 : 0) | (outE ? 8 : 0);
        }
        for (let y = uy0; y <= uy1; y++) for (let x = ux0; x <= ux1; x++) {
          const i = y * EW + x, sid = pathMask[i];
          if (!sid) continue;
          const st = styleList[sid], em = edgeM[i];
          const cN = y > 0 ? edgeM[i - EW] : 0, cS = y < EH - 1 ? edgeM[i + EW] : 0;
          const cW = x > 0 ? edgeM[i - 1] : 0, cE = x < EW - 1 ? edgeM[i + 1] : 0;
          const isCurb = !em && (cN || cS || cW || cE);
          // 不同铺装材质交接处（如木栈台衔接石板园路）绘 1px 温润石材收口条
          const diffMat = !em && ((y > 0 && pathMask[i - EW] && pathMask[i - EW] !== sid) || (x > 0 && pathMask[i - 1] && pathMask[i - 1] !== sid));
          if (diffMat) { grid[i] = 37; continue; }
          if (st.kind === 'plank') {
            if (em) { grid[i] = st.edge; continue; }
            if (isCurb) { grid[i] = (cN || cW) ? (st.hi || 33) : st.light; continue; }
            const along = pathAlong[i], m = ((along % 6) + 6) % 6;
            grid[i] = m === 0 ? st.seam : (m === 1 && ((Math.floor(along / 6) + (y >> 3)) % 3 === 0) ? st.light : st.base);
            continue;
          }
          if (st.kind === 'flag') {
            if (em) {
              // 左上草皮咬合暗影 19 + 右下温润石牙 35，彻底告别生硬粗黑框
              grid[i] = (em & 3) ? 19 : st.grout;
              continue;
            }
            if (isCurb) {
              const joint = ((x + y) % 14 === 0);
              grid[i] = joint ? st.grout : ((cN || cW) ? st.light : st.base);
              continue;
            }
            // 低对比度大规格错缝石板（14×9 原生格 = 28×18 世界像素）
            const row = Math.floor(y / 9), off = (row & 1) * 7;
            const cx = Math.floor((x + off) / 14), gx = (x + off) % 14, gy = y % 9;
            if (gx === 0 || gy === 0) {
              grid[i] = st.grout;
            } else {
              const h = hash2(cx, row);
              if (gy === 1 && gx >= 2 && gx <= 6 && h < 0.36) grid[i] = st.light;
              else if (gy === 7 && gx >= 7 && gx <= 11 && h > 0.78) grid[i] = st.grout;
              else grid[i] = st.base;
            }
            continue;
          }
          // 砂砾 / 自然园路：暖棕路牙 + 柔滑受光路拱
          if (em) { grid[i] = (em & 3) ? st.edge : 19; continue; }
          if (isCurb) { grid[i] = st.base; continue; }
          if (pathSd[i] < -2.2) {
            const n = smoothNoise(x + 17, y + 9, 9);
            grid[i] = n > 0.68 ? st.pebble : st.light;
          } else {
            grid[i] = st.base;
          }
        }
        // 稀疏草芽自然咬合路缘（成对 ≥2px，零孤立杂点）
        for (let y = Math.max(2, uy0); y <= Math.min(EH - 3, uy1); y++) for (let x = Math.max(2, ux0); x <= Math.min(EW - 3, ux1); x++) {
          const i = y * EW + x;
          if (!edgeM[i] || ((x * 5 + y * 3) % 19 !== 0)) continue;
          if (edgeM[i + 1] && (isGround(grid[i - EW]) || isGround(grid[i + EW]))) {
            const gc = (edgeM[i] & 1) ? 21 : 22;
            grid[i] = gc; grid[i + 1] = gc;
          }
        }
      }
    }

    // 7) 草地细节（成簇 ≥3px 的高光草芽与十字小花），避开道路、庭院护栏带与景物落脚处
    const flowerCols = cfg.flowers || [43, 44, 45];
    const tuftAvoid = [];
    for (const yd of (f.yards || [])) for (const p of (yd.props || [])) tuftAvoid.push([toPx(p[1]), toPy(p[2])]);
    for (let y = 16; y < EH - 16; y += 9) for (let x = 16; x < EW - 16; x += 11) {
      const h = hash2(x, y);
      const px = x + Math.floor(h * 7) - 3, py = y + Math.floor(hash2(y, x) * 5) - 2;
      const i = py * EW + px;
      if (!land[i] || bldg[i] || pathMask[i] || !isGround(grid[i])) continue;
      if (tuftAvoid.some(([ax, ay]) => Math.abs(px - ax) < 10 && Math.abs(py - ay) < 8)) continue;
      if (h < (cfg.tuftRate ?? 0.24)) {
        pset(px, py, 22); pset(px + 1, py, 22); pset(px + 2, py, 22);
        pset(px, py - 1, 23); pset(px + 1, py - 1, 23);
        pset(px + 1, py + 1, 19); pset(px + 2, py + 1, 19);
      } else if (h > 1 - (cfg.flowerRate ?? 0.10)) {
        const fc = flowerCols[Math.floor(hash2(px, py) * flowerCols.length)];
        pset(px, py + 1, 19); pset(px + 1, py + 1, 19);
        pset(px + 1, py - 1, fc); pset(px, py, fc); pset(px + 1, py, fc);
        pset(px, py - 1, 43);
      }
    }

    // 8) 景物图章（单源左上光 · 深色描边 · 破碎叶簇）
    const S = {};
    const FO = Object.assign({ out: 17, sh: 18, d: 19, mid: 20, l: 21, hi: 22, rim: 23 }, cfg.foliage || {});
    S.shadow = (px, py, rx, ry) => fillDisc(px + 2, py + 2, rx, ry, 18);
    S.rock = (px, py, big) => {
      const rx = big ? 8 : 6, ry = big ? 6 : 4;
      fillDisc(px + 1, py + 3, rx, ry - 1, 18); fillDisc(px, py, rx, ry, 34); fillDisc(px, py - 1, rx - 1, ry - 1, 35);
      fillDisc(px - 1, py - 2, rx - 2, ry - 2, 36); fillDisc(px - 2, py - 3, Math.max(2, rx - 4), Math.max(1, ry - 3), 37);
      pset(px + 2, py + 1, 19); pset(px + 3, py + 1, 20);
    };
    S.pebble = (px, py) => { fillRect(px, py, 3, 2, 35); fillRect(px, py, 2, 1, 37); fillRect(px + 4, py + 2, 2, 2, 36); };
    S.bush = (px, py, berry) => {
      fillDisc(px + 1, py + 4, 8, 4, 18);
      for (const [lx, ly, lr] of [[-4, 0, 5], [4, 1, 5], [0, -3, 6]]) fillDisc(px + lx, py + ly, lr, lr - 1, FO.out);
      for (const [lx, ly, lr] of [[-4, 0, 4], [4, 1, 4], [0, -3, 5]]) fillDisc(px + lx, py + ly, lr, lr - 1, FO.d);
      fillDisc(px - 2, py - 2, 3, 2, FO.mid); fillDisc(px - 1, py - 4, 4, 3, FO.l);
      for (const [tx, ty, tc] of [[-4, -2, FO.l], [-2, -5, FO.hi], [1, -4, FO.hi], [-5, 0, FO.mid], [2, 1, FO.sh], [4, 0, FO.sh]]) fillRect(px + tx, py + ty, 2, 2, tc);
      if (berry) { const fc = berry === 2 ? 27 : 44; pset(px - 3, py - 3, fc); pset(px - 2, py - 3, fc); pset(px + 3, py - 1, fc); pset(px + 4, py - 1, fc); pset(px, py - 5, 43); pset(px + 1, py - 5, 42); }
    };
    S.pine = (px, py) => {
      fillDisc(px + 2, py + 2, 13, 5, 18); fillDisc(px + 1, py + 1, 9, 4, 17);
      fillRect(px - 3, py - 12, 6, 13, 29); fillRect(px - 2, py - 11, 4, 11, 30); fillRect(px - 2, py - 9, 2, 8, 31);
      for (const t of [{ cy: py - 14, hw: 13, hh: 7 }, { cy: py - 21, hw: 11, hh: 7 }, { cy: py - 28, hw: 8, hh: 6 }, { cy: py - 35, hw: 5, hh: 6 }]) {
        for (let dy = -t.hh; dy <= t.hh; dy++) {
          const w = Math.max(1, Math.round(t.hw * (dy + t.hh) / (t.hh * 2) + (dy > 1 ? 1.5 : 0)));
          for (let dx = -w; dx <= w; dx++) {
            if (dy === t.hh && ((dx + 20) % 3 === 0)) continue;
            const edge = Math.abs(dx) >= w - 1 || dy === -t.hh || dy === t.hh;
            pset(px + dx, t.cy + dy, edge ? FO.out : (dx > w * 0.35 ? FO.sh : (dx < -w * 0.15 && dy < 1 ? 40 : (dy < 2 ? 39 : 38))));
          }
        }
      }
    };
    S.tree = (px, py, kind) => {
      const alt = kind === 'alt' || kind === 'sakura' || kind === 'maple';
      fillDisc(px + 3, py + 3, 15, 6, 18); fillDisc(px - 1, py + 2, 11, 5, 17);
      if (alt) for (const [ox, oy] of [[-11, 5], [-6, 8], [7, 7], [13, 4], [2, 9]]) if (pat(px + ox, py + oy) >= 18) { pset(px + ox, py + oy, 27); pset(px + ox + 1, py + oy, 26); }
      fillRect(px - 3, py - 14, 6, 16, 29); fillRect(px - 2, py - 13, 4, 14, 30); fillRect(px - 2, py - 10, 2, 10, 31);
      fillRect(px - 4, py - 1, 2, 3, 29); fillRect(px + 2, py - 1, 2, 3, 29); fillRect(px - 3, py - 14, 6, 4, 29);
      const c = alt ? { out: 24, sh: 25, mid: 26, hi: 27, rim: 28 } : { out: FO.out, sh: FO.sh, mid: FO.mid, hi: FO.hi, rim: FO.rim };
      const lobes = [{ lx: 6, ly: -20, rx: 10, ry: 9, s: 1 }, { lx: -7, ly: -21, rx: 10, ry: 9, s: 0 }, { lx: 0, ly: -19, rx: 9, ry: 8, s: 1 }, { lx: 5, ly: -28, rx: 9, ry: 8, s: 0 }, { lx: -3, ly: -31, rx: 11, ry: 9, s: 0 }];
      for (const b of lobes) fillDisc(px + b.lx, py + b.ly, b.rx + 1, b.ry + 1, c.out);
      for (const b of lobes) {
        fillDisc(px + b.lx, py + b.ly, b.rx, b.ry, b.s ? c.sh : c.mid);
        if (!b.s) { fillDisc(px + b.lx - 1, py + b.ly - 2, Math.max(3, b.rx - 2), Math.max(2, b.ry - 3), c.hi); fillDisc(px + b.lx - 2, py + b.ly - 4, Math.max(2, b.rx - 5), Math.max(2, b.ry - 5), c.rim); }
        else fillDisc(px + b.lx - 1, py + b.ly - 2, Math.max(2, b.rx - 4), Math.max(2, b.ry - 4), c.mid);
      }
      for (const [kx, ky, kr, kc] of [[-9, -27, 2, c.hi], [8, -26, 2, c.mid], [-5, -37, 2, c.rim], [4, -33, 2, c.hi], [11, -18, 2, c.sh], [-12, -19, 2, c.mid]]) fillDisc(px + kx, py + ky, kr, kr, kc);
      for (const [cx, cy, cw, chh, kc] of [[-7, -23, 3, 2, c.sh], [-1, -26, 3, 2, c.sh], [4, -22, 3, 2, c.out], [7, -27, 2, 2, c.sh], [-11, -30, 3, 2, c.rim], [-3, -32, 3, 2, c.rim], [2, -31, 3, 2, c.hi], [-8, -17, 2, 2, c.mid], [10, -24, 2, 2, c.sh]]) fillRect(px + cx, py + cy, cw, chh, kc);
    };
    S.palm = (px, py) => {
      fillDisc(px + 6, py + 3, 13, 4, 18);
      // 微弯分节树干（向右上倾）
      for (let k = 0; k < 30; k++) {
        const tx = px + Math.round(Math.sin(k / 30 * 1.2) * 6), ty = py - k;
        fillRect(tx - 2, ty, 5, 1, k % 4 === 0 ? 29 : 31); pset(tx - 2, ty, 29); pset(tx + 2, ty, 30); if (k % 4 !== 0) pset(tx - 1, ty, 32);
      }
      const hx = px + 6, hy = py - 31;
      const frond = (dx, dy, len, droop) => {
        for (let s = 0; s <= len; s++) {
          const t = s / len, fx = Math.round(hx + dx * s), fy = Math.round(hy + dy * s + droop * t * t * len);
          const w = Math.max(1, Math.round(3 * (1 - t) + 1));
          for (let k = -w; k <= w; k++) pset(fx, fy + k, k === -w ? FO.hi : (k === w ? FO.out : (k < 0 ? FO.mid : FO.sh)));
        }
      };
      frond(-1, -0.15, 16, 0.5); frond(1, -0.2, 16, 0.55); frond(-0.8, 0.3, 13, 0.35); frond(0.85, 0.3, 13, 0.35); frond(-0.2, -0.9, 9, 0.6); frond(0.3, -0.85, 9, 0.6);
      fillRect(hx - 2, hy + 1, 3, 3, 29); fillRect(hx + 1, hy + 2, 3, 3, 30); pset(hx - 1, hy + 1, 32);
    };
    S.lantern = (px, py) => {
      fillDisc(px, py + 6, 6, 3, 18); fillRect(px - 2, py + 3, 5, 4, 34); fillRect(px - 1, py + 4, 3, 2, 36);
      fillRect(px - 1, py - 6, 3, 10, 29); pset(px, py - 5, 31); pset(px, py - 3, 31);
      fillRect(px - 3, py - 12, 7, 7, 29); fillRect(px - 2, py - 11, 5, 5, 42); fillRect(px - 1, py - 10, 3, 3, 43);
      fillRect(px - 4, py - 14, 9, 2, 34); fillRect(px - 2, py - 15, 5, 1, 36);
      for (const [ox, oy] of [[-5, 6], [4, 7], [-2, 9]]) if (isGround(pat(px + ox, py + oy))) { pset(px + ox, py + oy, 23); pset(px + ox + 1, py + oy, 22); }
    };
    S.lamp = (px, py) => {
      fillDisc(px + 1, py + 5, 5, 2, 18); fillRect(px - 2, py + 2, 5, 3, 34); fillRect(px - 1, py - 18, 3, 21, 34); pset(px, py - 16, 36); pset(px, py - 10, 36);
      fillRect(px - 4, py - 25, 9, 7, 34); fillRect(px - 3, py - 24, 7, 5, 42); fillRect(px - 2, py - 23, 3, 2, 43); fillRect(px - 5, py - 27, 11, 2, 34);
    };
    S.fence = (px, py, len) => {
      const posts = Math.max(2, Math.round(len / 2 / 12) + 1);
      for (let k = 0; k < posts; k++) {
        const fx = px + k * 12;
        fillRect(fx + 1, py + 9, 4, 2, 18); fillRect(fx, py, 4, 10, 29); fillRect(fx + 1, py + 1, 2, 8, 31); pset(fx + 1, py + 1, 33); pset(fx + 2, py + 1, 32);
        if (k < posts - 1) { fillRect(fx + 4, py + 3, 8, 2, 29); fillRect(fx + 4, py + 4, 8, 1, 32); fillRect(fx + 4, py + 6, 8, 2, 29); fillRect(fx + 4, py + 7, 8, 1, 30); }
      }
    };
    S.fenceV = (px, py, len) => {
      const n = Math.max(2, Math.round(len / 2 / 10) + 1);
      for (let k = 0; k < n; k++) { const fy = py + k * 10; fillRect(px + 1, fy + 9, 5, 2, 18); fillRect(px, fy, 4, 10, 29); fillRect(px + 1, fy + 1, 2, 8, 31); pset(px + 1, fy + 1, 33); }
      fillRect(px + 1, py + 3, 2, (n - 1) * 10, 32); fillRect(px + 3, py + 3, 1, (n - 1) * 10, 29);
    };
    S.bed = (px, py, w, h, crop) => {           // 翻耕菜畦：木框 + 垄沟 + 作物
      if (crop === 'lavender' || crop === 'tulip') {   // 花田：一丛丛圆润花株成行排布（无木框、无土垄硬边，行首尾自然收窄）
        const rows = Math.max(1, Math.floor(h / 10));
        for (let r = 0; r < rows; r++) {
          const ry = py + r * 10 + 7, shrink = Math.round(hash2(px + r, py) * 2) * 4;
          for (let x = 4 + shrink + (r & 1) * 4; x < w - 4 - shrink; x += 8) {
            const k = hash2(px + x, ry), cx = px + x + (k > 0.5 ? 1 : 0), cy = ry + (k > 0.75 ? 1 : 0);
            fillDisc(cx + 1, cy + 3, 5, 2, 18);                                   // 株下落影
            fillDisc(cx, cy + 1, 4, 2, FO.d); fillRect(cx - 3, cy, 2, 1, FO.l);   // 绿色株基（左上受光）
            if (crop === 'lavender') {
              fillDisc(cx, cy - 2, 3, 3, 26);                                     // 紫色花团
              fillRect(cx + 2, cy - 3, 1, 4, 25); fillRect(cx - 1, cy, 3, 1, 25);  // 右下背光
              fillRect(cx - 2, cy - 4, 2, 2, 27); pset(cx - 1, cy - 5, 28); pset(cx + 1, cy - 5, 27); pset(cx, cy - 6, 28); // 受光穗尖
            } else {
              const c = [44, 42, 46, 47, 27][Math.floor(k * 5)];
              fillDisc(cx, cy - 2, 3, 2, c); fillRect(cx - 2, cy - 3, 2, 1, 43); pset(cx + 2, cy - 1, FO.sh);
            }
          }
        }
        return;
      }
      fillRect(px - 1, py - 1, w + 2, h + 3, 29); fillRect(px, py, w, h, 13);
      for (let y = 2; y < h - 1; y += 5) { fillRect(px + 1, py + y, w - 2, 3, 14); fillRect(px + 1, py + y, w - 2, 1, 15); }
      fillRect(px, py + h, w, 2, 30); fillRect(px - 1, py - 1, w + 2, 1, 32);
      const kind = crop || 'sprout';
      for (let y = 3; y < h - 2; y += 5) for (let x = 3; x < w - 3; x += 6) {
        const cx = px + x + ((y / 5) & 1) * 2, cy = py + y;
        if (kind === 'sprout') { pset(cx, cy, 20); pset(cx + 1, cy - 1, 22); pset(cx - 1, cy - 1, 21); pset(cx, cy - 1, 22); }
        else if (kind === 'cabbage') { fillDisc(cx, cy, 2, 2, 20); pset(cx - 1, cy - 1, 22); pset(cx, cy - 1, 23); }
        else if (kind === 'tomato') { pset(cx, cy - 2, 20); pset(cx, cy - 1, 21); fillRect(cx - 1, cy, 2, 2, 44); pset(cx + 1, cy - 1, 44); }
        else if (kind === 'pumpkin') { fillRect(cx - 2, cy - 1, 4, 3, 46); fillRect(cx - 1, cy - 1, 2, 1, 47); pset(cx, cy - 2, 20); }
        else if (kind === 'flower') { const fc = flowerCols[(x + y) % flowerCols.length]; pset(cx, cy - 1, fc); pset(cx - 1, cy, fc); pset(cx + 1, cy, fc); pset(cx, cy + 1, 20); pset(cx, cy, 42); }
      }
    };
    S.flowers = (px, py, w, h) => {             // 自由花丛：错落的圆润花株簇（非网格），每簇 2~3 朵
      const n = Math.max(3, Math.round(w * h / 60));
      for (let k = 0; k < n; k++) {
        const a = hash2(px + k * 7, py), b = hash2(py + k * 13, px);
        const cx = px + 3 + Math.floor(a * Math.max(1, w - 6)), cy = py + 3 + Math.floor(b * Math.max(1, h - 6));
        const fc = flowerCols[Math.floor(hash2(k, px + py) * flowerCols.length)];
        fillDisc(cx + 1, cy + 2, 3, 1, 18); fillDisc(cx, cy + 1, 3, 1, FO.d); pset(cx - 2, cy, FO.l);
        fillRect(cx - 2, cy - 2, 2, 2, fc); fillRect(cx + 1, cy - 1, 2, 2, fc); pset(cx - 2, cy - 2, 43);
        if (a > 0.5) { fillRect(cx - 1, cy - 4, 2, 2, fc); pset(cx - 1, cy - 4, 43); }
      }
    };
    S.hedge = (px, py, w) => {
      fillRect(px, py - 6, w, 10, FO.out); fillRect(px + 1, py - 5, w - 2, 8, FO.d); fillRect(px + 1, py - 5, w - 2, 3, FO.l);
      for (let x = 3; x < w - 3; x += 7) { fillRect(px + x, py - 5, 3, 2, FO.hi); fillRect(px + x + 2, py, 3, 2, FO.sh); }
      fillRect(px + 1, py + 4, w - 2, 2, 18);
    };
    S.pond = (px, py, w, h) => {
      const cx = px + w / 2, cy = py + h / 2, rx = w / 2, ry = h / 2;
      fillDisc(cx + 1, cy + 2, rx, ry, 18); fillDisc(cx, cy, rx, ry, 34); fillDisc(cx, cy, rx - 2, ry - 2, 36);
      fillDisc(cx, cy + 1, rx - 4, ry - 3, 2); fillDisc(cx, cy + 2, rx - 5, ry - 5, 3);
      for (let k = 0; k < 4; k++) fillRect(cx - rx / 2 + k * rx / 3, cy - ry / 3 + (k & 1) * 4, 5, 1, 5);
      for (let a = 0; a < 6.28; a += 0.5) { const sx = Math.round(cx + Math.cos(a) * (rx - 1)), sy = Math.round(cy + Math.sin(a) * (ry - 1)); fillRect(sx - 1, sy - 1, 3, 2, a < 3.14 ? 35 : 37); }
      S.lotus(Math.round(cx - rx / 3), Math.round(cy + 1), 1); S.lotus(Math.round(cx + rx / 3), Math.round(cy - 2), 0);
    };
    S.lotus = (px, py, flower) => { fillDisc(px, py, 5, 2, 19); fillDisc(px - 1, py - 1, 3, 1, 21); pset(px + 3, py - 1, 3); if (flower) { fillRect(px - 2, py - 3, 4, 2, 27); fillRect(px - 1, py - 4, 2, 2, 43); } };
    S.bench = (px, py) => {
      fillRect(px + 1, py + 9, 32, 2, 18);
      fillRect(px, py, 32, 3, 29); fillRect(px + 1, py, 30, 2, 32);           // 椅背
      fillRect(px, py + 4, 32, 4, 29); fillRect(px + 1, py + 4, 30, 2, 33); fillRect(px + 1, py + 6, 30, 1, 31);
      for (const lx of [2, 28]) { fillRect(px + lx, py + 8, 2, 3, 34); }
    };
    S.umbrella = (px, py) => {
      fillDisc(px + 3, py + 3, 12, 3, 18); fillRect(px, py - 20, 1, 22, 34);
      const uw = [4, 7, 10, 11, 12, 12, 12];
      for (let dy = -6; dy <= 0; dy++) {
        const w = uw[dy + 6], ry = py - 16 + dy;
        for (let dx = -w; dx <= w; dx++) {
          const edge = dy === 0 || Math.abs(dx) === w || (dy === -6 && Math.abs(dx) <= w);
          pset(px + dx, ry, edge ? 17 : ((Math.floor((dx + 13) / 4) & 1) ? 44 : 43));
        }
      }
      fillRect(px - 1, py - 24, 3, 2, 34); pset(px, py - 24, 37); pset(px - 1, py - 24, 37);
      fillRect(px + 4, py - 2, 14, 6, 45); fillRect(px + 5, py - 1, 12, 1, 43); // 沙滩巾
    };
    S.picnic = (px, py) => {
      fillRect(px - 18, py - 6, 36, 14, 17);
      for (let y = 0; y < 12; y++) for (let x = 0; x < 34; x++) pset(px - 17 + x, py - 5 + y, ((x >> 2) + (y >> 2)) & 1 ? 44 : 43);
      fillRect(px + 6, py - 9, 8, 6, 29); fillRect(px + 7, py - 8, 6, 4, 32); fillRect(px + 8, py - 11, 4, 2, 29); // 野餐篮
      fillRect(px - 10, py - 3, 3, 3, 42);
    };
    S.scarecrow = (px, py) => {
      fillDisc(px + 1, py + 2, 6, 2, 18); fillRect(px, py - 20, 2, 22, 29); fillRect(px - 8, py - 15, 18, 2, 29);
      fillRect(px - 4, py - 16, 10, 9, 45); fillRect(px - 3, py - 15, 8, 2, 43);
      fillDisc(px + 1, py - 21, 3, 3, 15); fillRect(px - 4, py - 25, 11, 2, 33); fillRect(px - 2, py - 28, 7, 3, 32); pset(px, py - 21, 17); pset(px + 2, py - 21, 17);
    };
    S.well = (px, py) => {
      fillDisc(px + 2, py + 3, 13, 4, 18); fillDisc(px, py, 11, 6, 34); fillDisc(px, py - 1, 10, 5, 36); fillDisc(px, py - 1, 7, 3, 1);
      fillRect(px - 10, py - 18, 2, 18, 29); fillRect(px + 9, py - 18, 2, 18, 29);
      for (let k = 0; k < 6; k++) fillRect(px - 12 + k, py - 22 + k, 24 - k * 2, 1, k < 2 ? 46 : 47);
      fillRect(px - 1, py - 14, 2, 8, 34); fillRect(px - 2, py - 7, 4, 3, 30);
    };
    S.lighthouse = (px, py) => {
      fillDisc(px + 4, py + 4, 18, 5, 18); fillDisc(px, py, 16, 6, 34); fillDisc(px, py - 1, 15, 5, 36);
      for (let y = 0; y < 56; y++) {
        const w = Math.round(9 - y * 0.06);
        for (let dx = -w; dx <= w; dx++) {
          const band = Math.floor(y / 9) & 1;
          let c = band ? 44 : 43;
          if (dx >= w - 2) c = band ? 46 : 37; if (dx <= -w + 1) c = band ? 47 : 7; if (Math.abs(dx) === w) c = 17;
          pset(px + dx, py - 4 - y, c);
        }
      }
      fillRect(px - 9, py - 62, 18, 3, 17); fillRect(px - 6, py - 70, 12, 8, 17); fillRect(px - 5, py - 69, 10, 6, 42); fillRect(px - 3, py - 68, 4, 3, 43);
      for (let k = 0; k < 5; k++) fillRect(px - 5 + k, py - 75 + k, 10 - k * 2 + 1, 1, 44); fillRect(px - 1, py - 78, 2, 3, 17);
      fillRect(px - 3, py - 14, 6, 10, 29); fillRect(px - 2, py - 13, 4, 8, 31);   // 门
    };
    S.boat = (px, py) => {
      fillDisc(px + 2, py + 3, 16, 3, 1);
      for (let y = 0; y < 7; y++) { const w = 15 - Math.max(0, y - 3) * 2; fillRect(px - w, py + y - 3, w * 2, 1, y === 0 ? 33 : (y < 3 ? 31 : 29)); }
      fillRect(px - 12, py - 3, 24, 1, 17); fillRect(px - 9, py - 2, 18, 2, 30);
      if (hash2(px, py) > 0.4) { fillRect(px, py - 24, 1, 22, 29); for (let y = 0; y < 18; y++) fillRect(px + 1, py - 23 + y, Math.round(y * 0.6) + 1, 1, y > 14 ? 37 : 7); }
    };
    S.buoy = (px, py) => { fillDisc(px, py + 2, 4, 1, 1); fillRect(px - 2, py - 4, 5, 6, 44); fillRect(px - 2, py - 2, 5, 2, 43); fillRect(px - 1, py - 4, 2, 1, 7); };
    S.telescope = (px, py) => {
      fillDisc(px + 1, py + 2, 7, 2, 18); for (const dx of [-5, 0, 5]) for (let k = 0; k < 10; k++) pset(px + Math.round(dx * k / 10), py - 10 + k, 29);
      for (let k = 0; k < 14; k++) fillRect(px - 6 + k, py - 18 + Math.round(k * 0.5), 3, 3, k < 3 ? 37 : (k > 11 ? 42 : 35));
      fillRect(px - 7, py - 19, 2, 4, 34);
    };
    S.windmill = (px, py) => {
      fillDisc(px + 3, py + 3, 16, 4, 18);
      for (let y = 0; y < 34; y++) { const w = Math.round(10 - y * 0.12); fillRect(px - w, py - y, w * 2, 1, y < 2 ? 29 : (w + y) % 9 === 0 ? 35 : 36); pset(px - w, py - y, 34); pset(px + w - 1, py - y, 34); }
      for (let k = 0; k < 8; k++) fillRect(px - 8 + k, py - 42 + k, 16 - k * 2, 1, 46);
      fillRect(px - 3, py - 10, 6, 10, 29); fillRect(px - 2, py - 9, 4, 8, 31);
      const hx = px, hy = py - 34;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) for (let k = 2; k < 18; k++) { pset(hx + dx * k, hy + dy * k, 29); if (k > 5) { pset(hx + dx * k + dx, hy + dy * k, 43); pset(hx + dx * k + dx * 2, hy + dy * k, 37); } }
      fillDisc(hx, hy, 2, 2, 34);
    };
    S.bleacher = (px, py, w) => {
      fillRect(px, py + 24, w, 3, 18);
      for (let r = 0; r < 3; r++) { const y = py + r * 8; fillRect(px, y, w, 8, 17); fillRect(px + 1, y + 1, w - 2, 3, r === 0 ? 46 : (r === 1 ? 47 : 48)); fillRect(px + 1, y + 4, w - 2, 3, 34); fillRect(px + 1, y + 1, w - 2, 1, 37); }
      for (let x = 6; x < w; x += 24) fillRect(px + x, py + 24, 2, 3, 34);
    };
    S.shed = (px, py, w, h) => {                 // 小木屋：3/4 坡顶 + 立面 + 门窗
      fillRect(px + 3, py + h, w, 4, 18);
      const roofH = Math.round(h * 0.45), wallTop = py + roofH;
      fillRect(px, wallTop, w, h - roofH, 29); fillRect(px + 1, wallTop, w - 2, h - roofH - 1, 31);
      for (let x = px + 5; x < px + w - 2; x += 6) fillRect(x, wallTop, 1, h - roofH - 1, 30);
      for (let y = 0; y < roofH; y++) { fillRect(px - 2, py + y, w + 4, 1, y === roofH - 1 ? 17 : ((y >> 1) & 1 ? 46 : 47)); }
      fillRect(px - 2, py, w + 4, 1, 48); fillRect(px - 3, py + roofH - 1, w + 6, 2, 17);
      const dx = px + Math.round(w / 2) - 4; fillRect(dx, py + h - 14, 8, 14, 17); fillRect(dx + 1, py + h - 13, 6, 13, 30); pset(dx + 5, py + h - 7, 42);
      fillRect(px + 4, wallTop + 3, 7, 6, 17); fillRect(px + 5, wallTop + 4, 5, 4, 45); fillRect(px + 5, wallTop + 4, 2, 2, 43);
      if (w > 34) { fillRect(px + w - 11, wallTop + 3, 7, 6, 17); fillRect(px + w - 10, wallTop + 4, 5, 4, 45); fillRect(px + w - 10, wallTop + 4, 2, 2, 43); }
    };
    S.campfire = (px, py) => {
      fillDisc(px, py + 1, 8, 3, 18);
      for (const [dx, dy] of [[-6, 0], [-3, 2], [1, 3], [5, 1], [6, -1], [-5, -2]]) fillRect(px + dx - 1, py + dy - 1, 3, 2, 35);
      fillRect(px - 4, py - 1, 8, 2, 29); fillRect(px - 2, py - 7, 5, 6, 44); fillRect(px - 1, py - 9, 3, 5, 42); fillRect(px, py - 5, 1, 3, 43);
      for (const [ox, oy] of [[-9, 3], [8, 4], [-3, 6], [4, -6]]) if (isGround(pat(px + ox, py + oy))) { pset(px + ox, py + oy, 23); pset(px + ox + 1, py + oy, 22); }
    };
    S.sign = (px, py) => { fillRect(px + 1, py + 2, 4, 1, 18); fillRect(px, py - 8, 2, 10, 29); fillRect(px - 7, py - 15, 16, 8, 29); fillRect(px - 6, py - 14, 14, 6, 32); fillRect(px - 4, py - 12, 9, 1, 30); fillRect(px - 4, py - 10, 6, 1, 30); };
    S.crate = (px, py) => { fillRect(px - 6, py + 2, 14, 2, 18); fillRect(px - 7, py - 9, 14, 11, 29); fillRect(px - 6, py - 8, 12, 9, 31); fillRect(px - 6, py - 8, 12, 2, 33); for (let k = 0; k < 10; k++) pset(px - 5 + k, py - 6 + Math.round(k * 0.7), 30); };
    S.barrel = (px, py) => { fillDisc(px + 1, py + 2, 6, 2, 18); fillRect(px - 5, py - 10, 10, 12, 29); fillRect(px - 4, py - 10, 8, 11, 31); fillRect(px - 4, py - 10, 3, 11, 32); fillRect(px - 5, py - 7, 10, 1, 34); fillRect(px - 5, py - 2, 10, 1, 34); fillDisc(px, py - 10, 4, 1, 33); };
    S.arch = (px, py) => {
      for (const dx of [-16, 14]) { fillRect(px + dx, py - 26, 3, 28, 29); fillRect(px + dx + 1, py - 26, 1, 28, 32); }
      for (let a = 0; a <= 16; a++) { const t = a / 16 * Math.PI, x = Math.round(px - 1 - Math.cos(t) * 15), y = Math.round(py - 26 - Math.sin(t) * 8); fillRect(x, y, 3, 3, 29); }
      for (let a = 0; a <= 14; a++) { const t = a / 14 * Math.PI, x = Math.round(px - 1 - Math.cos(t) * 15), y = Math.round(py - 27 - Math.sin(t) * 8); fillDisc(x, y, 2, 2, (a & 1) ? 20 : 21); if (a % 3 === 0) { pset(x, y - 1, flowerCols[a % flowerCols.length]); pset(x + 1, y - 1, flowerCols[a % flowerCols.length]); } }
      for (const dx of [-16, 14]) for (let y = py - 22; y < py; y += 5) { fillRect(px + dx - 1, y, 2, 2, 20); pset(px + dx + 2, y + 2, 21); }
    };
    S.stall = (px, py) => {
      fillRect(px - 20, py + 2, 42, 3, 18); fillRect(px - 19, py - 10, 38, 12, 29); fillRect(px - 18, py - 9, 36, 10, 31); fillRect(px - 18, py - 9, 36, 2, 33);
      for (let k = 0; k < 6; k++) { fillDisc(px - 14 + k * 6, py - 12, 2, 2, [44, 42, 46, 45, 44, 42][k]); }
      fillRect(px - 19, py - 28, 2, 18, 29); fillRect(px + 17, py - 28, 2, 18, 29);
      for (let y = 0; y < 6; y++) for (let x = -22; x < 22; x++) pset(px + x, py - 34 + y, y === 5 ? 17 : ((Math.floor((x + 22) / 5) & 1) ? 44 : 43));
      for (let x = -22; x < 22; x += 5) fillRect(px + x, py - 28, 3, 2, 44);
    };
    S.goal = (px, py, side) => {
      const dir = side === 'right' ? -1 : 1;
      for (let y = -15; y <= 15; y++) { pset(px, py + y, 7); pset(px + dir * 8, py + y - 2, 35); if (y % 3 === 0) for (let k = 1; k < 8; k++) pset(px + dir * k, py + y - Math.round(k / 4), 36); }
      fillRect(px - 1, py - 16, 2, 33, 37); fillRect(px - 1, py - 16, dir * 9 + (dir > 0 ? 0 : 1), 2, 37);
    };
    S.fireflies = (px, py, w, h) => { for (let k = 0; k < Math.round(w * h / 260); k++) { const x = px + Math.floor(hash2(k, px) * w), y = py + Math.floor(hash2(py, k) * h); fillRect(x, y, 2, 1, 42); pset(x, y - 1, 43); } };
    S.chime = S.lantern; S.hoop = S.lamp;
    S.dome = (px, py, w, h) => {                 // 天文台：石砌圆筒 + 半球穹顶 + 观测缝 + 拱门
      const cx = px + Math.round(w / 2), base = py + h, rx = Math.round(w / 2) - 2, wallH = Math.round(h * 0.42);
      fillDisc(cx + 3, base + 2, rx + 4, 5, 18);
      fillRect(cx - rx, base - wallH, rx * 2, wallH, 34); fillRect(cx - rx + 1, base - wallH, rx * 2 - 2, wallH - 1, 36);
      for (let y = base - wallH + 4; y < base - 1; y += 5) for (let x = cx - rx + 2 + ((y >> 2) & 1) * 4; x < cx + rx - 2; x += 8) fillRect(x, y, 6, 1, 35);
      fillRect(cx + Math.round(rx * 0.4), base - wallH, Math.round(rx * 0.6), wallH - 1, 35);
      const dr = rx + 1, dy0 = base - wallH;
      for (let y = 0; y <= dr; y++) {
        const half = Math.round(Math.sqrt(Math.max(0, dr * dr - y * y)));
        for (let x = -half; x <= half; x++) {
          let c = x < -half * 0.2 && y > dr * 0.25 ? 37 : (x > half * 0.45 ? 35 : 36);
          if (Math.abs(x) >= half - 1 || y === dr) c = 34;
          pset(cx + x, dy0 - Math.round(y * 0.72), c);
        }
      }
      for (let y = 2; y < Math.round(dr * 0.72); y++) { pset(cx - 1, dy0 - y, 1); pset(cx, dy0 - y, 2); pset(cx + 1, dy0 - y, 1); }
      fillRect(cx - 4, base - 16, 8, 16, 34); fillRect(cx - 3, base - 15, 6, 15, 17); fillRect(cx - 2, base - 14, 4, 12, 42); fillRect(cx - 1, base - 13, 1, 4, 43);
      fillRect(cx - rx + 4, base - wallH + 4, 5, 5, 34); fillRect(cx - rx + 5, base - wallH + 5, 3, 3, 42);
      fillRect(cx + rx - 9, base - wallH + 4, 5, 5, 34); fillRect(cx + rx - 8, base - wallH + 5, 3, 3, 42);
    };
    S.swing = (px, py) => {                      // 花藤秋千
      fillRect(px - 10, py - 30, 2, 32, 29); fillRect(px + 8, py - 30, 2, 32, 29); fillRect(px - 11, py - 32, 22, 3, 29); fillRect(px - 10, py - 32, 20, 1, 32);
      fillRect(px - 5, py - 29, 1, 20, 37); fillRect(px + 4, py - 29, 1, 20, 37); fillRect(px - 6, py - 10, 12, 3, 31); fillRect(px - 6, py - 10, 12, 1, 33);
      for (let x = -10; x <= 10; x += 3) { pset(px + x, py - 33, 20); pset(px + x + 1, py - 33, flowerCols[(x + 12) % flowerCols.length]); }
      fillDisc(px + 1, py + 1, 12, 2, 18);
    };
    S.balloon = (px, py) => {                    // 系留热气球（云端露台）
      fillDisc(px + 4, py + 3, 14, 4, 18);
      fillRect(px - 8, py - 12, 16, 12, 29); fillRect(px - 7, py - 11, 14, 4, 32); fillRect(px - 7, py - 7, 14, 6, 31);
      for (const dx of [-7, 6]) for (let k = 0; k < 14; k++) pset(px + dx + Math.round(dx > 0 ? k * 0.3 : -k * 0.3), py - 13 - k, 34);
      const cy = py - 46, r = 20;
      for (let y = -r; y <= r + 6; y++) {
        const half = y <= 0 ? Math.round(Math.sqrt(r * r - y * y)) : Math.max(4, Math.round(r - y * 0.9));
        for (let x = -half; x <= half; x++) {
          const stripe = Math.floor((x + r) / 6) & 1;
          let c = stripe ? 44 : 43;
          if (x > half * 0.5) c = stripe ? 46 : 42; if (x < -half * 0.4 && y < 0) c = stripe ? 47 : 7;
          if (Math.abs(x) === half) c = 17;
          pset(px + x, cy + y, c);
        }
      }
    };
    S.bridge = (px, py, pw, ph) => {
      for (let bx = 0; bx < pw; bx++) fillRect(px + bx, py + ph + 1, 1, (bx % 9 === 4) ? 2 : 3, (bx % 8 < 2) ? 2 : 1);
      fillRect(px, py - 2, pw, ph + 4, 29); fillRect(px, py, pw, ph, 31);
      for (let bx = 0; bx < pw; bx += 9) {
        const plankW = Math.min(8, pw - bx), tone = ((bx / 9) & 1) ? 32 : 31;
        for (let by = 2; by < ph - 2; by++) for (let k = 0; k < plankW - 1; k++) pset(px + bx + k, py + by, by <= 3 ? 33 : (by >= ph - 3 ? 30 : tone));
        if (bx + plankW - 1 < pw) for (let by = 2; by < ph - 2; by++) pset(px + bx + plankW - 1, py + by, 29);
        if ((bx / 9) % 2 === 0 && bx + 3 < pw) for (const ry of [py - 4, py + ph - 2]) { fillRect(px + bx, ry, 4, 6, 29); fillRect(px + bx + 1, ry + 1, 2, 4, 30); fillRect(px + bx + 1, ry + 1, 2, 1, 33); }
      }
    };
    S.bridgeV = (px, py, pw, ph) => {           // 竖向木桥（南北走向）
      fillRect(px - 2, py, pw + 4, ph, 29); fillRect(px, py, pw, ph, 31);
      for (let by = 0; by < ph; by += 6) { fillRect(px + 1, py + by, pw - 2, 5, ((by / 6) & 1) ? 32 : 31); fillRect(px + 1, py + by, pw - 2, 1, 33); fillRect(px + 1, py + by + 5, pw - 2, 1, 29); }
      for (let by = 0; by < ph; by += 18) { fillRect(px - 4, py + by, 4, 6, 29); fillRect(px + pw, py + by, 4, 6, 29); fillRect(px - 3, py + by + 1, 2, 1, 33); fillRect(px + pw + 1, py + by + 1, 2, 1, 33); }
      fillRect(px + pw + 2, py + 2, 2, ph - 2, 1);
    };
    S.terraceApron = (ap) => {                   // 电梯翼楼一体化倒角石材基座裙板（单层连续铺装，零重影叠框）
      const isLeft = ap.h.side === 'left';
      const px0 = Math.max(2, toPx(ap.x0)), px1 = Math.min(EW - 3, toPx(ap.x1));
      const py0 = Math.max(2, toPy(ap.y0)), py1 = Math.min(EH - 4, toPy(ap.y1));
      for (let y = py0; y <= py1 + 2; y++) {
        for (let x = px0; x <= px1 + 1; x++) {
          const i = y * EW + x;
          if (bldg[i]) continue;
          const ox = isLeft ? (x - px0) : (px1 - x);
          const cutN = ox + (y - py0), cutS = ox + (py1 - y);
          const inPlinth = x <= px1 && y <= py1 && cutN >= 3 && cutS >= 3;
          if (!inPlinth) {
            if (land[i] && ((y > py1 && y <= py1 + 2 && x >= px0 + 2 && x <= px1 + 1) || (!isLeft && x === px1 + 1 && y >= py0 + 3 && y <= py1))) {
              grid[i] = 18;
            }
            continue;
          }
          const outerEdge = (isLeft ? x === px0 : x === px1) || cutN === 3 || cutS === 3;
          if (y === py1 || cutS === 3) {
            grid[i] = 34;
          } else if (y === py1 - 1) {
            grid[i] = ((x - px0) % 14 === 0) ? 34 : 35;
          } else if (y === py0 || (isLeft && x === px0) || cutN === 3) {
            grid[i] = 19;
          } else if (!isLeft && x === px1) {
            grid[i] = 35;
          } else if (y === py0 + 1 || (isLeft && x === px0 + 1) || cutN === 4) {
            grid[i] = ((x + y) % 14 === 0) ? 35 : 37;
          } else if (outerEdge) {
            grid[i] = 35;
          } else {
            const r = Math.floor((y - py0) / 9), off = (r & 1) * 7;
            const cx = Math.floor((x - px0 + off) / 14), gx = (x - px0 + off) % 14, gy = (y - py0) % 9;
            if (gx === 0 || gy === 0) grid[i] = 35;
            else if (gy === 1 && gx >= 2 && gx <= 6 && hash2(cx, r) < 0.38) grid[i] = 37;
            else grid[i] = 36;
          }
        }
      }
      // 电梯翼楼墙基环绕柔和环境光闭塞
      const hx0 = Math.max(px0 + 2, toPx(ap.h.x - 6)), hx1 = Math.min(px1 - 2, toPx(ap.h.x + ap.h.w + 6));
      const hy0 = Math.max(py0 + 2, toPy(ap.h.y - 68)), hy1 = Math.min(py1 - 3, toPy(ap.h.y + ap.h.h + 16));
      for (let y = hy0; y <= hy1; y++) {
        for (let x = hx0; x <= hx1; x++) {
          const i = y * EW + x;
          if (!bldg[i] && grid[i] >= 36) grid[i] = 35;
        }
      }
    };
    // 庭院周界 3/4 洞石压顶雪松矮柱 + 修剪黄杨绿篱（紧贴可达边界外侧，消灭无形空气墙）
    const pSafe = (x, y, c) => {
      x |= 0; y |= 0;
      if (x >= 0 && x < EW && y >= 0 && y < EH && c && !bldg[y * EW + x]) grid[y * EW + x] = c;
    };
    S.yardBollard = (bx, by) => {
      for (let dx = -1; dx <= 3; dx++) if (by + 9 < EH && land[(by + 9) * EW + (bx + dx)]) pSafe(bx + dx, by + 9, 18);
      for (let dy = 0; dy < 9; dy++) for (let dx = -2; dx <= 2; dx++) pSafe(bx + dx, by + dy, 29);
      for (let dy = 1; dy <= 2; dy++) for (let dx = -1; dx <= 1; dx++) pSafe(bx + dx, by + dy, 36);
      pSafe(bx - 1, by + 1, 37); pSafe(bx, by + 1, 37);
      for (let dy = 3; dy <= 6; dy++) {
        pSafe(bx - 1, by + dy, 32); pSafe(bx, by + dy, 31); pSafe(bx + 1, by + dy, 30);
      }
      for (let dx = -1; dx <= 1; dx++) pSafe(bx + dx, by + 7, 35);
    };
    S.yardHedgeH = (px0, px1, pyEdge, outY) => {
      if (px1 - px0 < 4) return;
      const topY = outY > 0 ? pyEdge : pyEdge - 8;
      for (let x = px0 + 1; x <= px1; x++) {
        const m = (x - px0) % 10;
        if (topY + 8 < EH && land[(topY + 8) * EW + x]) pSafe(x, topY + 8, 18);
        if (m >= 1 && m <= 8 && topY + 9 < EH && land[(topY + 9) * EW + x]) pSafe(x, topY + 9, 18);
      }
      for (let x = px0; x < px1; x++) {
        const m = (x - px0) % 10, mound = Math.floor((x - px0) / 10);
        const dip = (m === 0 || m === 9) ? 1 : 0;
        const y0 = topY + dip, y1 = topY + 7;
        for (let y = y0; y <= y1; y++) {
          if (x === px0 || x === px1 - 1 || y === y0 || y === y1) { pSafe(x, y, FO.out); continue; }
          const dy = y - topY;
          if ((dy === 1 && m >= 2 && m <= 4) || (dy === 2 && m >= 1 && m <= 3)) pSafe(x, y, FO.hi);
          else if (dy <= 2 || (dy === 3 && m >= 2 && m <= 6)) pSafe(x, y, FO.l);
          else if (dy <= 4) pSafe(x, y, m >= 8 ? FO.d : FO.mid);
          else pSafe(x, y, (m >= 6 && dy === 6) || (m >= 7 && dy === 5) ? FO.sh : FO.d);
        }
        // 绿篱点缀四连通花蕾簇（与竖向绿篱材质完全统一）
        if (m === 5 && (mound % 3 === 1) && x + 1 < px1 - 3) {
          const fc = flowerCols[mound % flowerCols.length];
          pSafe(x + 1, topY + 2, fc); pSafe(x, topY + 3, fc); pSafe(x + 1, topY + 3, fc); pSafe(x, topY + 2, 43);
        }
      }
      const span = px1 - px0, nPosts = Math.max(1, Math.round(span / 28));
      for (let k = 0; k <= nPosts; k++) {
        const bx = k === 0 ? px0 + 2 : (k === nPosts ? px1 - 3 : Math.round(px0 + 2 + (span - 5) * k / nPosts));
        S.yardBollard(bx, topY);
      }
    };
    S.yardHedgeV = (pxEdge, py0, py1, outX) => {
      if (py1 - py0 < 4) return;
      const leftX = outX < 0 ? pxEdge - 7 : pxEdge;
      for (let y = py0; y < py1; y++) {
        const n = (y - py0) % 9;
        if (outX > 0) {
          if (leftX + 7 < EW && land[y * EW + leftX + 7]) pSafe(leftX + 7, y, 18);
          if (n >= 1 && n <= 7 && leftX + 8 < EW && land[y * EW + leftX + 8]) pSafe(leftX + 8, y, 18);
        } else if (pxEdge < EW && land[y * EW + pxEdge] && !pathMask[y * EW + pxEdge]) {
          pSafe(pxEdge, y, 18);
        }
        const indent = n === 0 ? 1 : 0;
        const xL = leftX + indent, xR = leftX + 6 - indent;
        for (let x = xL; x <= xR; x++) {
          if (x === xL || x === xR || y === py0 || y === py1 - 1) { pSafe(x, y, FO.out); continue; }
          const dx = x - leftX;
          if (dx <= 2) pSafe(x, y, (n >= 2 && n <= 4) ? FO.hi : FO.l);
          else if (dx === 3) pSafe(x, y, n <= 5 ? FO.mid : FO.d);
          else pSafe(x, y, n <= 4 ? FO.d : FO.sh);
        }
      }
      const span = py1 - py0, nPosts = Math.max(1, Math.round(span / 26));
      for (let k = 0; k < nPosts; k++) {
        const by = k === 0 ? py0 : Math.round(py0 + span * k / nPosts) - 4;
        if (by + 8 <= py1 + 2) S.yardBollard(leftX + 3, by);
      }
    };
    if (cfg.stamps) Object.assign(S, cfg.stamps(S, { pset, pat, fillRect, fillDisc, hash2, smoothNoise, EW, EH, toPx, toPy, grid, land, bldg }));

    // 提取所有可达庭院（f.yards）的非建筑外边缘片段，生成闭合 3/4 绿篱矮栏
    const inPolyW = (poly, wx, wy) => {
      let c = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if (((a.y > wy) !== (b.y > wy)) && (wx < (b.x - a.x) * (wy - a.y) / (b.y - a.y) + a.x)) c = !c;
      }
      return c;
    };
    const yardHSegs = [], yardVSegs = [];
    for (const yd of (f.yards || [])) {
      if (yd.kind === 'pier' || !yd.poly || yd.poly.length < 3) continue;
      const poly = yd.poly;
      const atGateW = (wx, wy) => (yd.gates || []).some(g => wx >= g.x1 - 4 && wx <= g.x2 + 4 && wy >= g.y1 - 4 && wy <= g.y2 + 4);
      const hHere = [], vHere = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k], b = poly[(k + 1) % poly.length];
        if (Math.abs(a.y - b.y) < 2) {
          const wy = Math.round((a.y + b.y) / 2), wx0 = Math.min(a.x, b.x), wx1 = Math.max(a.x, b.x);
          if (wx1 - wx0 < 8) continue;
          const outY = inPolyW(poly, (wx0 + wx1) / 2, wy - 3) ? 1 : -1;
          let run = null;
          for (let s = wx0; s < wx1; s += 4) {
            const cx = Math.min(wx1 - 1, s + 2), opx = toPx(cx), opy = toPy(wy + outY * 10);
            const open = opx >= 0 && opx < EW && opy >= 0 && opy < EH && !bldg[opy * EW + opx] && !yardM[opy * EW + opx] && !atGateW(cx, wy);
            if (open && run === null) run = s;
            else if (!open && run !== null) { if (s - run >= 12) hHere.push({ wx0: run, wx1: s, wy, outY }); run = null; }
          }
          if (run !== null && wx1 - run >= 12) hHere.push({ wx0: run, wx1, wy, outY });
        } else if (Math.abs(a.x - b.x) < 2) {
          const wx = Math.round((a.x + b.x) / 2), wy0 = Math.min(a.y, b.y), wy1 = Math.max(a.y, b.y);
          if (wy1 - wy0 < 8) continue;
          const outX = inPolyW(poly, wx - 3, (wy0 + wy1) / 2) ? 1 : -1;
          let run = null;
          for (let s = wy0; s < wy1; s += 4) {
            const cy = Math.min(wy1 - 1, s + 2), opx = toPx(wx + outX * 10), opy = toPy(cy);
            const open = opx >= 0 && opx < EW && opy >= 0 && opy < EH && !bldg[opy * EW + opx] && !yardM[opy * EW + opx] && !atGateW(wx, cy);
            if (open && run === null) run = s;
            else if (!open && run !== null) { if (s - run >= 12) vHere.push({ wx, wy0: run, wy1: s, outX }); run = null; }
          }
          if (run !== null && wy1 - run >= 12) vHere.push({ wx, wy0: run, wy1, outX });
        }
      }
      // 拐角自动外扩咬合：若水平段端点衔接竖向段，水平段外延 7px 包覆竖向段端头并立转角石柱
      for (const hs of hHere) {
        let px0 = toPx(hs.wx0), px1 = toPx(hs.wx1);
        for (const vs of vHere) {
          if (vs.outX < 0 && Math.abs(vs.wx - hs.wx0) <= 6 && (Math.abs(vs.wy1 - hs.wy) <= 6 || Math.abs(vs.wy0 - hs.wy) <= 6)) px0 -= 7;
          if (vs.outX > 0 && Math.abs(vs.wx - hs.wx1) <= 6 && (Math.abs(vs.wy1 - hs.wy) <= 6 || Math.abs(vs.wy0 - hs.wy) <= 6)) px1 += 7;
        }
        yardHSegs.push({ px0, px1, py: toPy(hs.wy), wy: hs.wy, outY: hs.outY });
      }
      for (const vs of vHere) yardVSegs.push({ px: toPx(vs.wx), py0: toPy(vs.wy0), py1: toPy(vs.wy1), outX: vs.outX });
    }

    // 9) 全局视觉包围盒防遮挡守卫（f.yards 优先 → 远景 decor / treeLines 自动避让建筑裙边、庭院护栏、承台、园路与已放置景物）
    const flat = new Set(['bed', 'crops', 'flowers', 'pond', 'picnic', 'fireflies', 'pebble']);
    const water = new Set(['boat', 'buoy', 'lotus']);
    const visBox = (p) => {
      const [t, x, y, a, b] = p, px = toPx(x), py = toPy(y);
      const pw = Math.round((a || 0) / 2), ph = Math.round((b || 0) / 2);
      switch (t) {
        case 'tree': return [px - 19, py - 42, px + 19, py + 10];
        case 'pine': return [px - 16, py - 42, px + 16, py + 8];
        case 'palm': return [px - 13, py - 44, px + 25, py + 8];
        case 'bush': return [px - 10, py - 10, px + 10, py + 9];
        case 'rock': return [px - 9, py - 7, px + 10, py + 8];
        case 'pebble': return [px - 1, py - 1, px + 7, py + 5];
        case 'lantern': case 'chime': return [px - 7, py - 16, px + 7, py + 10];
        case 'lamp': case 'hoop': return [px - 7, py - 28, px + 7, py + 8];
        case 'bench': return [px - 2, py - 2, px + 35, py + 12];
        case 'umbrella': return [px - 14, py - 30, px + 19, py + 7];
        case 'arch': return [px - 19, py - 38, px + 19, py + 4];
        case 'dome': return [px - 5, py - 10, px + pw + 7, py + ph + 8];
        case 'bed': case 'crops': case 'flowers': case 'pond': case 'fireflies':
          return [px - 3, py - 6, px + pw + 4, py + ph + 5];
        case 'shed': return [px - 4, py - 2, px + pw + 5, py + ph + 5];
        case 'bridge': case 'bridgeV': return [px - 5, py - 5, px + pw + 5, py + ph + 5];
        case 'fence': return [px - 2, py - 2, px + pw + 6, py + 12];
        case 'fenceV': return [px - 2, py - 2, px + 8, py + pw + 12];
        case 'hedge': return [px - 2, py - 7, px + pw + 2, py + 7];
        case 'bleacher': return [px - 2, py - 2, px + pw + 2, py + 28];
        case 'telescope': return [px - 9, py - 20, px + 10, py + 5];
        case 'lotus': return [px - 6, py - 5, px + 6, py + 3];
        case 'boat': return [px - 17, py - 25, px + 19, py + 7];
        case 'buoy': return [px - 5, py - 5, px + 5, py + 4];
        case 'picnic': return [px - 19, py - 12, px + 19, py + 9];
        case 'scarecrow': return [px - 9, py - 29, px + 11, py + 5];
        case 'well': return [px - 13, py - 23, px + 16, py + 8];
        case 'lighthouse': return [px - 17, py - 79, px + 23, py + 10];
        case 'windmill': return [px - 20, py - 53, px + 21, py + 8];
        case 'campfire': return [px - 10, py - 10, px + 10, py + 7];
        case 'sign': return [px - 8, py - 16, px + 10, py + 4];
        case 'crate': return [px - 8, py - 10, px + 9, py + 5];
        case 'barrel': return [px - 6, py - 11, px + 8, py + 5];
        case 'stall': return [px - 23, py - 35, px + 23, py + 6];
        case 'goal': return [px - 10, py - 18, px + 10, py + 17];
        case 'swing': return [px - 12, py - 34, px + 14, py + 4];
        case 'balloon': return [px - 21, py - 67, px + 21, py + 8];
        default: return [px - 14, py - 24, px + 14, py + 8];
      }
    };
    const forbidM = new Uint8Array(EW * EH);
    const dilateTmp = new Uint8Array(EW * EH);
    const colSum = new Int16Array(EW);
    const dilateInto = (src, rxL, rxR, ryU, ryD) => {
      dilateTmp.fill(0);
      colSum.fill(0);
      for (let y = 0; y < EH; y++) {
        const row = y * EW;
        let s = 0;
        for (let x = 0; x <= Math.min(EW - 1, rxR); x++) s += src[row + x] ? 1 : 0;
        for (let x = 0; x < EW; x++) {
          if (s > 0) dilateTmp[row + x] = 1;
          if (x + rxR + 1 < EW && src[row + x + rxR + 1]) s++;
          if (x - rxL >= 0 && src[row + x - rxL]) s--;
        }
      }
      for (let y = 0; y <= Math.min(EH - 1, ryD); y++) {
        const row = y * EW;
        for (let x = 0; x < EW; x++) colSum[x] += dilateTmp[row + x];
      }
      for (let y = 0; y < EH; y++) {
        const row = y * EW;
        const addOff = y + ryD + 1 < EH ? (y + ryD + 1) * EW : -1;
        const subOff = y - ryU >= 0 ? (y - ryU) * EW : -1;
        for (let x = 0; x < EW; x++) {
          if (colSum[x] > 0) forbidM[row + x] = 1;
          if (addOff >= 0) colSum[x] += dilateTmp[addOff + x];
          if (subOff >= 0) colSum[x] -= dilateTmp[subOff + x];
        }
      }
    };
    // ① 建筑轮廓（南侧外扩 14 原生格 = 28px 护住南墙压顶+地基裙边，其余方向 8 格）
    dilateInto(bldg, 8, 8, 14, 8);
    // ② 可达庭院（外扩 11..12 原生格护住庭院内部与外侧周界矮绿篱护栏）
    dilateInto(yardM, 11, 11, 12, 11);
    // ③ 电梯翼楼承台裙板
    for (const ap of hallAprons) {
      const x0 = Math.max(0, toPx(ap.x0) - 4), x1 = Math.min(EW - 1, toPx(ap.x1) + 4);
      const y0 = Math.max(0, toPy(ap.y0) - 4), y1 = Math.min(EH - 1, toPy(ap.y1) + 6);
      for (let y = y0; y <= y1; y++) forbidM.fill(1, y * EW + x0, y * EW + x1 + 1);
    }
    // ④ 全局路径掩码（外扩 2 原生格护住路缘）
    dilateInto(pathMask, 2, 2, 2, 2);
    // ⑤ 主题额外禁放矩形（如 7F 远景裙房挑檐女儿墙）
    for (const [rx, ry, rw, rh] of (cfg.forbidRects || [])) {
      const x0 = Math.max(0, toPx(rx)), x1 = Math.min(EW - 1, toPx(rx + rw));
      const y0 = Math.max(0, toPy(ry)), y1 = Math.min(EH - 1, toPy(ry + rh));
      for (let y = y0; y <= y1; y++) forbidM.fill(1, y * EW + x0, y * EW + x1 + 1);
    }
    // 二维前缀和表：O(1) 判定任意候选视觉包围盒是否触碰禁区
    const SW = EW + 1, forbidSAT = new Int32Array(SW * (EH + 1));
    for (let y = 0; y < EH; y++) {
      let rowSum = 0;
      const rOff = (y + 1) * SW, pOff = y * SW, mOff = y * EW;
      for (let x = 0; x < EW; x++) {
        rowSum += forbidM[mOff + x];
        forbidSAT[rOff + x + 1] = forbidSAT[pOff + x + 1] + rowSum;
      }
    }
    const boxHitsForbid = (x0, y0, x1, y1) => {
      const ax = Math.max(0, x0), ay = Math.max(0, y0), bx = Math.min(EW, x1 + 1), by = Math.min(EH, y1 + 1);
      if (bx <= ax || by <= ay) return 0;
      return forbidSAT[by * SW + bx] - forbidSAT[ay * SW + bx] - forbidSAT[by * SW + ax] + forbidSAT[ay * SW + ax];
    };

    const hitsHallApron = (p) => {
      if (!hallAprons.length) return false;
      const [bx0, by0, bx1, by1] = visBox(p);
      return hallAprons.some(ap => bx1 > toPx(ap.x0) - 4 && bx0 < toPx(ap.x1) + 4 && by1 > toPy(ap.y0) - 5 && by0 < toPy(ap.y1) + 6);
    };
    const placedBoxes = [], all = [];
    let skippedDecor = 0;
    // 庭院内景物优先级最高（由 collision-yards 保证零重叠，登记包围盒供远景避让）
    for (const yd of (f.yards || [])) {
      for (const p of (yd.props || [])) {
        if (hitsHallApron(p)) continue;
        all.push(p);
        placedBoxes.push(visBox(p));
      }
    }
    // 收集远景候选景物（主题重点 decor 优先，远岸林带 treeLines 其次）
    const farCands = [];
    for (const p of (cfg.decor || [])) farCands.push(p);
    for (const tl of (cfg.treeLines || [])) {
      const kinds = tl.kinds || ['oak', 'alt', 'pine'];
      for (let row = 0; row < (tl.rows || 2); row++) for (let x = tl.x0 + row * (tl.step / 2); x < tl.x1; x += tl.step) {
        const h = hash2(Math.round(x), Math.round(tl.y + row * 31));
        const k = kinds[Math.floor(h * kinds.length)];
        const jx = Math.round(x + (h - 0.5) * tl.step * 0.5), jy = Math.round(tl.y + row * (tl.dy || 46) + (hash2(row, Math.round(x)) - 0.5) * 16);
        if (h > 0.9) farCands.push(['bush', jx, jy, 1 + (h > 0.95 ? 1 : 0)]);
        else if (k === 'pine') farCands.push(['pine', jx, jy]);
        else farCands.push([k === 'palm' ? 'palm' : 'tree', jx, jy, k]);
      }
    }
    for (const p of farCands) {
      const t = p[0], px = toPx(p[1]), py = toPy(p[2]);
      const vb = visBox(p), [x0, y0, x1, y1] = vb;
      if (x0 < 2 || y0 < 2 || x1 >= EW - 2 || y1 >= EH - 2 || px < 2 || px >= EW - 2 || py < 2 || py >= EH - 2) { skippedDecor++; continue; }
      const ci = py * EW + px;
      if (water.has(t)) {
        if (land[ci] || wall[ci]) { skippedDecor++; continue; }
      } else if (t !== 'bridge' && t !== 'bridgeV') {
        if (!land[ci]) { skippedDecor++; continue; }
        if (flat.has(t) && (!land[Math.min(EH - 1, y1 - 2) * EW + Math.max(0, x0 + 2)] || !land[Math.min(EH - 1, y1 - 2) * EW + Math.min(EW - 1, x1 - 2)])) {
          skippedDecor++; continue;
        }
      }
      if (boxHitsForbid(x0, y0, x1, y1) > 0) { skippedDecor++; continue; }
      if (placedBoxes.some(b => x0 < b[2] + 3 && x1 > b[0] - 3 && y0 < b[3] + 3 && y1 > b[1] - 3)) { skippedDecor++; continue; }
      all.push(p);
      placedBoxes.push(vb);
    }

    const draw = (p) => {
      const [t, x, y, a, b] = p, fn = S[t === 'crops' ? 'bed' : t];
      if (!fn) return;
      const px = toPx(x), py = toPy(y);
      if (t === 'bed' || t === 'crops' || t === 'flowers' || t === 'pond' || t === 'shed' || t === 'dome') fn(px, py, Math.round(a / 2), Math.round(b / 2), p[5]);
      else if (t === 'fence' || t === 'fenceV' || t === 'bleacher' || t === 'hedge') fn(px, py, Math.round(a / 2) * (t === 'fence' || t === 'fenceV' ? 2 : 1));
      else if (t === 'bridge' || t === 'bridgeV') fn(px, py, Math.round(a / 2), Math.round(b / 2));
      else if (t === 'fireflies') fn(px, py, Math.round(a / 2), Math.round(b / 2));
      else fn(px, py, a, b);
    };
    for (const p of all) if (p[0] === 'bridge' || p[0] === 'bridgeV' || water.has(p[0])) draw(p);
    // 电梯翼楼脚下铺设一体化建筑石材露台裙板
    for (const ap of hallAprons) S.terraceApron(ap);
    for (const p of all) if (flat.has(p[0])) draw(p);
    // 庭院东西侧竖向绿篱 → 按 Y 深度排序的地表立面景物与水平庭院绿篱护栏
    for (const vs of yardVSegs) S.yardHedgeV(vs.px, vs.py0, vs.py1, vs.outX);
    const uprightTasks = all
      .filter(p => !flat.has(p[0]) && !water.has(p[0]) && p[0] !== 'bridge' && p[0] !== 'bridgeV')
      .map(p => ({ y: p[2], run: () => draw(p) }));
    for (const hs of yardHSegs) {
      uprightTasks.push({ y: hs.wy + (hs.outY > 0 ? 16 : 0), run: () => S.yardHedgeH(hs.px0, hs.px1, hs.py, hs.outY) });
    }
    uprightTasks.sort((a, b) => a.y - b.y).forEach(t => t.run());
    if (cfg.after) cfg.after(S, { pset, pat, fillRect, fillDisc, hash2, smoothNoise, toPx, toPy, grid, land, bldg });

    // 10) 去孤立像素（保留结构描边与水沫，清零全部 4-邻域非保留杂点）
    const keep = new Set([8, 17, 24, 29, 34, 42, 43, 7, 6].concat(cfg.keep || []));
    let fixed = 0;
    for (let pass = 0; pass < 8; pass++) for (let y = 1; y < EH - 1; y++) for (let x = 1, i = y * EW + 1; x < EW - 1; x++, i++) {
      const v = grid[i];
      if (!v || keep.has(v) || bldg[i]) continue;
      if (grid[i - 1] === v || grid[i + 1] === v || grid[i - EW] === v || grid[i + EW] === v) continue;
      const l = bldg[i - 1] ? 0 : grid[i - 1], r = bldg[i + 1] ? 0 : grid[i + 1];
      const u = bldg[i - EW] ? 0 : grid[i - EW], d = bldg[i + EW] ? 0 : grid[i + EW];
      let best = (l && (l === r || l === u || l === d)) ? l : ((u && (u === d || u === r)) ? u : (r || u || l || d));
      if (!best) {
        for (const di of [-EW - 1, -EW + 1, EW - 1, EW + 1]) if (!bldg[i + di] && grid[i + di]) { best = grid[i + di]; break; }
      }
      if (best && best !== v) { grid[i] = best; fixed++; }
    }
    // 11) 装填画布（建筑内部保持透明，交由楼面层绘制）
    const cv = document.createElement('canvas'); cv.width = EW; cv.height = EH;
    const cg = cv.getContext('2d'), img = cg.createImageData(EW, EH);
    const pal32 = new Uint32Array(PALX.length), tb = new Uint8Array(4), tu = new Uint32Array(tb.buffer);
    for (let c = 1; c < PALX.length; c++) { const hx = PALX[c] || '#ff00ff'; tb[0] = parseInt(hx.slice(1, 3), 16); tb[1] = parseInt(hx.slice(3, 5), 16); tb[2] = parseInt(hx.slice(5, 7), 16); tb[3] = 255; pal32[c] = tu[0]; }
    const bg = cfg.voidColor || PALX[2];
    tb[0] = parseInt(bg.slice(1, 3), 16); tb[1] = parseInt(bg.slice(3, 5), 16); tb[2] = parseInt(bg.slice(5, 7), 16); tb[3] = 255; const bg32 = tu[0];
    const dst = new Uint32Array(img.data.buffer);
    for (let i = 0; i < grid.length; i++) dst[i] = grid[i] ? pal32[grid[i]] : (bldg[i] ? 0 : bg32);
    cg.putImageData(img, 0, 0);
    return {
      cv, grid, w: EW, h: EH, pal: PALX,
      audit: {
        w: EW, h: EH, palCount: PALX.length - 1,
        buildMs: +(performance.now() - t0).toFixed(1),
        strayFixed: fixed,
        placedProps: all.length,
        skippedDecor,
        yardHedges: yardHSegs.length + yardVSegs.length
      }
    };
  }

  // 主题入口：exterior: L.API.biomeExterior(cfg)
  function yardCacheSig(f) {
    if (!f || !f.yards) return '';
    return f.yards.map(yd => {
      const ps = (yd.poly || []).map(q => q.x + ',' + q.y).join(';');
      const pr = (yd.props || []).length + ':' + ((yd.props && yd.props[0]) ? yd.props[0].join(',') : '');
      const pt = (yd.paths || []).length;
      return yd.id + '[' + ps + '|' + pr + '|' + pt + ']';
    }).join('/');
  }
  function biomeExterior(cfg) {
    let cache = null, cacheFloor = null, cacheSig = '';
    function drawExterior(g, f, A, a) {
      if (typeof document === 'undefined') return;
      const sig = yardCacheSig(f);
      if (!cache || cacheFloor !== f || cacheSig !== sig) { cache = build(f, cfg); cacheFloor = f; cacheSig = sig; }
      g.save(); g.imageSmoothingEnabled = false; g.drawImage(cache.cv, a.x, a.y, a.w, a.h); g.restore();
    }
    drawExterior.getAuditInfo = () => cache && cache.audit;
    drawExterior.getCache = () => cache;
    return drawExterior;
  }
  L.API.biomeExterior = biomeExterior;
  // 默认夏日溪谷色板（与 1F 同源），按槽位覆盖：L.API.biomePal({ 1: '#...', 46: '#...' })
  const BASE_PAL = [null,
    '#163663', '#1e4a87', '#2864a8', '#3484c4', '#42a2c4', '#7ed6c4', '#d8f5e0',
    '#291622', '#54292e', '#824234', '#ad623b', '#cf8b56',
    '#945435', '#bd7c46', '#d99f5e', '#e8bc7d',
    '#152233', '#1b3847', '#235c46', '#33853f', '#52b043', '#82d44c', '#bdf05c',
    '#47234d', '#8a3b6e', '#cf6292', '#f2a8c2', '#ffe4ee',
    '#331c1e', '#633529', '#995a38', '#cc8852', '#ebb478',
    '#3d353e', '#7a6b63', '#b8a691', '#ede1c9',
    '#24595c', '#32856c', '#5fc284', '#733548',
    '#ffd25a', '#fff4c4', '#f06f6a', '#78c7f5',
    '#d0603c', '#e88a52', '#2f6fa8', '#c8b9a0'];
  L.API.biomePal = (over) => { const p = BASE_PAL.slice(); for (const k of Object.keys(over || {})) p[Number(k)] = over[k]; return p; };
})(typeof window !== 'undefined' ? window : globalThis);
