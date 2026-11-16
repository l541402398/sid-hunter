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

    // 6) 小径（读取庭院 paths；世界半径 → 原生半径）
    const PS = Object.assign({
      dirt: { kind: 'dirt', edge: 13, base: 14, light: 15, pebble: 16 },
      stone: { kind: 'flag', edge: 34, base: 36, light: 37, grout: 35 },
      deck: { kind: 'plank', edge: 29, base: 31, light: 32, seam: 30 },
      sand: { kind: 'dirt', edge: 13, base: 15, light: 16, pebble: 14 }
    }, cfg.pathStyles || {});
    const allPaths = [];
    for (const yd of (f.yards || [])) for (const p of (yd.paths || [])) allPaths.push(p);
    for (const p of (cfg.extraPaths || [])) allPaths.push(p);
    for (const p of allPaths) {
      const st = PS[p.style] || PS.dirt;
      const pts = p.pts.map(([x, y, r]) => [(x - OX) / 2, (y - OY) / 2, (r || 18) / 2]);
      let x0 = EW, x1 = 0, y0 = EH, y1 = 0;
      for (const [x, y, r] of pts) { x0 = Math.min(x0, x - r - 6); x1 = Math.max(x1, x + r + 6); y0 = Math.min(y0, y - r - 6); y1 = Math.max(y1, y + r + 6); }
      x0 = Math.max(0, x0 | 0); x1 = Math.min(EW - 1, Math.ceil(x1)); y0 = Math.max(0, y0 | 0); y1 = Math.min(EH - 1, Math.ceil(y1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * EW + x;
        if (!land[i] || bldg[i]) continue;
        let best = 1e9, rad = 0, tAlong = 0, dirx = 1, diry = 0;
        for (let s = 0; s < pts.length - 1; s++) {
          const [ax, ay, ar] = pts[s], [bx, by, br] = pts[s + 1];
          const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
          const cx = ax + vx * t, cy = ay + vy * t, d2 = (x - cx) ** 2 + (y - cy) ** 2;
          if (d2 < best) { best = d2; rad = ar + (br - ar) * t; tAlong = s + t; const l = Math.sqrt(l2); dirx = vx / l; diry = vy / l; }
        }
        if (best > (rad + 3) * (rad + 3)) continue;
        const d = Math.sqrt(best);
        if (st.kind === 'plank') {
          if (d > rad) continue;
          const along = Math.round(x * dirx + y * diry), across = d;
          if (across > rad - 1.5) grid[i] = st.edge;
          else grid[i] = (along % 5 === 0) ? st.seam : ((Math.floor(along / 5) % 3 === 0) ? st.light : st.base);
          continue;
        }
        const dr = d + (smoothNoise(x, y, 5) - 0.5) * 4.2;
        if (dr > rad) continue;
        if (st.kind === 'flag') {
          if (dr > rad - 1.5) { grid[i] = ((x + y) % 5 === 0) ? 22 : 19; continue; }
          const cx = Math.floor((x + (Math.floor(y / 6) & 1) * 4) / 8), cy = Math.floor(y / 6);
          const gx = (x + (Math.floor(y / 6) & 1) * 4) % 8, gy = y % 6;
          grid[i] = (gx === 0 || gy === 0) ? st.grout : (gy === 1 || gx === 1 ? st.light : (hash2(cx, cy) > 0.7 ? st.edge + 1 : st.base));
          continue;
        }
        if (dr > rad - 1.8) grid[i] = ((x + y) % 5 === 0) ? 22 : (dr > rad - 0.9 ? 19 : st.edge);
        else if (dr < rad * 0.42 && smoothNoise(x + 17, y + 9, 8) > 0.48) grid[i] = st.light;
        else grid[i] = st.base;
      }
    }

    // 7) 草地细节（成簇 ≥3px 的高光草芽与十字小花），避开庭院景物落脚处
    const flowerCols = cfg.flowers || [43, 44, 45];
    const tuftAvoid = [];
    for (const yd of (f.yards || [])) for (const p of (yd.props || [])) tuftAvoid.push([toPx(p[1]), toPy(p[2])]);
    for (let y = 16; y < EH - 16; y += 9) for (let x = 16; x < EW - 16; x += 11) {
      const h = hash2(x, y);
      const px = x + Math.floor(h * 7) - 3, py = y + Math.floor(hash2(y, x) * 5) - 2;
      const i = py * EW + px;
      if (!land[i] || bldg[i] || !isGround(grid[i])) continue;
      if (h < (cfg.tuftRate ?? 0.24)) { pset(px, py, 22); pset(px + 1, py, 22); pset(px, py - 1, 23); pset(px + 2, py + 1, 19); pset(px + 3, py, 22); }
      else if (h > 1 - (cfg.flowerRate ?? 0.10)) {
        const fc = flowerCols[Math.floor(hash2(px, py) * flowerCols.length)];
        pset(px, py - 1, fc); pset(px, py + 1, fc); pset(px - 1, py, fc); pset(px + 1, py, fc); pset(px, py, 42);
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
      for (let dy = -6; dy <= 0; dy++) { const w = 12 - Math.round((dy + 6) * 0.2) - (dy < -4 ? (dy + 7) * 3 : 0); for (let dx = -w; dx <= w; dx++) pset(px + dx, py - 22 + dy + 6, dy === 0 ? 17 : (Math.floor((dx + 13) / 4) & 1 ? 44 : 43)); }
      fillRect(px - 1, py - 29, 3, 2, 34);
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
    S.terraceApron = (ap) => {                   // 电梯翼楼悬挑石材露台裙板（与 2F–7F 各层石材色板 34..37 自动同源）
      const px0 = Math.max(2, toPx(ap.x0)), px1 = Math.min(EW - 2, toPx(ap.x1));
      const py0 = Math.max(2, toPy(ap.y0)), py1 = Math.min(EH - 4, toPy(ap.y1));
      for (let y = py0; y <= py1 + 2; y++) {
        for (let x = px0; x <= px1 + 1; x++) {
          const i = y * EW + x;
          if (bldg[i]) continue;
          if (y > py1 || x > px1) {
            if (land[i]) grid[i] = 18;
            continue;
          }
          // 1px 石材深色外轮廓 + 南侧 3px 石砌立面厚边
          if (x === px0 || x === px1 || y === py0 || y === py1) {
            grid[i] = 34;
          } else if (y >= py1 - 3) {
            grid[i] = ((x - px0) % 12 === 0) ? 34 : 35;
          } else if (y === py0 + 1 || x === px0 + 1) {
            grid[i] = 37;
          } else {
            const r = Math.floor((y - py0) / 8), off = (r & 1) ? 6 : 0;
            const gx = (x - px0 + off) % 12, gy = (y - py0) % 8;
            if (gx === 0 || gy === 0) grid[i] = 35;
            else if ((gx === 1 || gy === 1) && hash2(Math.floor((x + off) / 12), r) < 0.42) grid[i] = 37;
            else grid[i] = 36;
          }
        }
      }
      // 电梯翼楼墙基环绕环境光暗影
      const hx0 = Math.max(px0 + 2, toPx(ap.h.x - 7)), hx1 = Math.min(px1 - 2, toPx(ap.h.x + ap.h.w + 7));
      const hy0 = Math.max(py0 + 2, toPy(ap.h.y - 68)), hy1 = Math.min(py1 - 4, toPy(ap.h.y + ap.h.h + 17));
      for (let y = hy0; y <= hy1; y++) {
        for (let x = hx0; x <= hx1; x++) {
          const i = y * EW + x;
          if (!bldg[i] && grid[i] >= 36) grid[i] = 35;
        }
      }
    };
    if (cfg.stamps) Object.assign(S, cfg.stamps(S, { pset, pat, fillRect, fillDisc, hash2, smoothNoise, EW, EH, toPx, toPy, grid, land, bldg }));

    // 9) 底层景物（桥 / 水上物 / 地台）与按 Y 排序的地表景物（自动剔除侵入电梯石材露台的树冠/灌木/船只/田垄）
    const flat = new Set(['bed', 'crops', 'flowers', 'pond', 'picnic', 'fireflies', 'pebble']);
    const water = new Set(['boat', 'buoy', 'lotus']);
    const rawAll = [];
    for (const yd of (f.yards || [])) for (const p of (yd.props || [])) rawAll.push(p);
    for (const p of (cfg.decor || [])) rawAll.push(p);
    // 远岸林带：两排交错、品种与间距带确定性抖动（框景用，不可达）
    for (const tl of (cfg.treeLines || [])) {
      const kinds = tl.kinds || ['oak', 'alt', 'pine'];
      for (let row = 0; row < (tl.rows || 2); row++) for (let x = tl.x0 + row * (tl.step / 2); x < tl.x1; x += tl.step) {
        const h = hash2(Math.round(x), Math.round(tl.y + row * 31));
        const k = kinds[Math.floor(h * kinds.length)];
        const jx = Math.round(x + (h - 0.5) * tl.step * 0.5), jy = Math.round(tl.y + row * (tl.dy || 46) + (hash2(row, Math.round(x)) - 0.5) * 16);
        if (h > 0.9) rawAll.push(['bush', jx, jy, 1 + (h > 0.95 ? 1 : 0)]);
        else if (k === 'pine') rawAll.push(['pine', jx, jy]);
        else rawAll.push([k === 'palm' ? 'palm' : 'tree', jx, jy, k]);
      }
    }
    const hitsHallApron = (p) => {
      if (!hallAprons.length) return false;
      const [t, x, y, a, b] = p;
      let bx0, by0, bx1, by1;
      if (t === 'bed' || t === 'crops' || t === 'flowers' || t === 'pond' || t === 'shed' || t === 'dome' || t === 'bridge' || t === 'bridgeV' || t === 'fireflies') {
        bx0 = x - 8; by0 = y - 24; bx1 = x + (a || 0) + 8; by1 = y + (b || 0) + 12;
      } else if (t === 'fence' || t === 'bleacher' || t === 'hedge') {
        bx0 = x - 8; by0 = y - 20; bx1 = x + (a || 0) + 8; by1 = y + 32;
      } else if (t === 'fenceV') {
        bx0 = x - 12; by0 = y - 12; bx1 = x + 16; by1 = y + (a || 0) + 12;
      } else if (t === 'tree' || t === 'pine' || t === 'palm' || t === 'windmill' || t === 'lighthouse' || t === 'balloon') {
        bx0 = x - 44; by0 = y - 98; bx1 = x + 44; by1 = y + 22;
      } else {
        bx0 = x - 38; by0 = y - 58; bx1 = x + 38; by1 = y + 20;
      }
      return hallAprons.some(ap => bx1 > ap.x0 - 8 && bx0 < ap.x1 + 8 && by1 > ap.y0 - 10 && by0 < ap.y1 + 12);
    };
    const all = rawAll.filter(p => !hitsHallApron(p));
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
    // 电梯翼楼脚下铺设悬挑建筑石材露台裙板（替代旧版水上木栈桥）
    for (const ap of hallAprons) S.terraceApron(ap);
    for (const p of all) if (flat.has(p[0])) draw(p);
    all.filter(p => !flat.has(p[0]) && !water.has(p[0]) && p[0] !== 'bridge' && p[0] !== 'bridgeV').sort((a, b) => a[2] - b[2]).forEach(draw);
    if (cfg.after) cfg.after(S, { pset, pat, fillRect, fillDisc, hash2, smoothNoise, toPx, toPy, grid, land, bldg });

    // 10) 去孤立像素（保留结构描边与水沫）
    const keep = new Set([8, 17, 24, 29, 34, 42, 43, 7, 6].concat(cfg.keep || []));
    let fixed = 0;
    for (let pass = 0; pass < 3; pass++) for (let y = 1; y < EH - 1; y++) for (let x = 1, i = y * EW + 1; x < EW - 1; x++, i++) {
      const v = grid[i];
      if (!v || keep.has(v) || bldg[i]) continue;
      if (grid[i - 1] === v || grid[i + 1] === v || grid[i - EW] === v || grid[i + EW] === v) continue;
      const l = grid[i - 1], r = grid[i + 1], u = grid[i - EW], d = grid[i + EW];
      const best = (l && (l === r || l === u || l === d)) ? l : ((u && (u === d || u === r)) ? u : (r || u || l || d));
      if (best) { grid[i] = best; fixed++; }
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
    return { cv, grid, w: EW, h: EH, pal: PALX, audit: { w: EW, h: EH, palCount: PALX.length - 1, buildMs: +(performance.now() - t0).toFixed(1), strayFixed: fixed } };
  }

  // 主题入口：exterior: L.API.biomeExterior(cfg)
  function biomeExterior(cfg) {
    let cache = null, cacheFloor = null;
    function drawExterior(g, f, A, a) {
      if (typeof document === 'undefined') return;
      if (!cache || cacheFloor !== f) { cache = build(f, cfg); cacheFloor = f; }
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
