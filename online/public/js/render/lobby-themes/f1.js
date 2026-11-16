'use strict';
// 1F · 研发中心大堂 主题：温暖像素现代研发大楼（暖橡木侧翼 / 哑光洞石中庭 / 赤陶石灰石烘焙厅 / 写实园区地面景观）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const woodA = { base: '#c28a52', hi: '#d49d64', lo: '#ad7742', gap: '#7d502d', grain: '#a36c3b' };
  const woodB = { base: '#b8804a', hi: '#ca935c', lo: '#a36e3d', gap: '#754928', grain: '#996436' };
  const woodC = { base: '#ab7444', hi: '#bd8552', lo: '#966338', gap: '#6e4526', grain: '#8f5d35' };
  // 全部洞石色值严格保持 B>=174 或 R<=207/R>=228，避开 7F sports 像素检测区间 RGB(217,204,163)±6
  const stoneP = { tones: ['#ece4d6', '#e4dac9', '#f2ece0', '#cfc2ae'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };
  L.register(1, {
    wall: {
      style: 'modern',
      paper: '#efe7da', stripe: '#cfc2ae', panelHi: '#faf6ef', motif: '#cfc2ae',
      rail: '#784828', railHi: '#ab7046',
      wains: '#8c5632', wainsLo: '#693d20', wainsHi: '#b87d52',
      base: '#422516', crown: '#e6dccb',
      cap: '#6e4226', capHi: '#a66e44', capLo: '#2d1c22', capTop: '#875433'
    },
    door: { frame: '#36231d', frameHi: '#9e6a42', leaf: '#8f5934', plank: '#693d20', lintel: '#4d2c1c', glass: '#e8f4fa' },
    plaquePal: { bg: '#3b2b24', hi: '#785a48', edge: '#1e1518', ink: '#fbf2dc' },
    zones: [
      { x: 0, y: 0, w: 780, h: 480, mat: 'planks', pal: woodA, seed: 11 },
      { x: 780, y: 0, w: 1900, h: 606, mat: 'stone', pal: stoneP, seed: 3, tw: 64, th: 48 },
      { x: 2680, y: 0, w: 776, h: 480, mat: 'planks', pal: woodB, seed: 23 },
      { x: 780, y: 590, w: 1900, h: 16, mat: 'planks', pal: woodA, seed: 31 },
      { x: 780, y: 606, w: 600, h: 354, mat: 'planks', pal: woodC, seed: 41 },
      { x: 1396, y: 606, w: 664, h: 354, mat: 'checker', pal: { a: '#f0e7d8', b: '#c97e5c', grout: '#a6664a', aHi: '#faf5ec', bHi: '#db9270', aLo: '#cfc2ae', bLo: '#b06848' } },
      { x: 2076, y: 606, w: 604, h: 354, mat: 'parquet', pal: woodC }
    ],
    rugs: [
      { x: 88, y: 292, w: 344, h: 140, fill: '#3d6666', band: '#2b4a4a', trim: '#deb870', motif: '#ebd094', fringe: '#f0e6d4' },
      { x: 2684, y: 308, w: 544, h: 126, fill: '#5f7344', band: '#455430', trim: '#e6cf98', motif: '#f0deb0', fringe: '#f2ead8' },
      { x: 844, y: 736, w: 392, h: 132, fill: '#87403c', band: '#632b28', trim: '#e6c27c', motif: '#f0d69c', fringe: '#f2ead8' }
    ],
    windows: [530, 960, 1460, 2000, 2460, 3300], windowStyle: 'curtain',
    sconces: [430, 840, 1070, 1320, 1590, 1866, 2590, 3050],
    frames: [[156, 'land', 52, 28], [2080, 'map', 52, 28]],
    plaque: { x: 1728, text: 'CQRD · 研发中心大堂', w: 196 },
    exterior: (function () {
      // 1F 园区外景：写实地面研发园区广场与生态庭院（告别浮空大海孤岛：东西电梯厅外接花岗岩迎宾铺装广场，
      // 西南保留 CQRD 模纹花坛前庭，东南设镜面景观水溪与跨溪木桥连接樱花庭院）。
      const EW = 2368, EH = 800, OX = -640, OY = -320;
      const EXT_PAL = [
        null,
        '#1a426e', '#23568c', '#2e72ad', '#3d90c4', '#52acc7', '#86d8cb', '#dff6ea', // 1..7   东南景观镜面水池
        '#291622', '#54292e', '#7a5a46', '#9e7a60', '#bfa084',                       // 8..12  驳岸池壁石材
        '#8c6244', '#b08462', '#cbb092', '#e6d8c4',                                  // 13..16 园区暖石汀步与园路
        '#152233', '#1b3847', '#265c44', '#368242', '#52ab48', '#7ecc52', '#b4e864', // 17..23 树冠深暗影与修剪草坪
        '#47234d', '#8a3b6e', '#cf6292', '#f2a8c2', '#ffe4ee',                       // 24..28 樱花簇团色阶
        '#331c1e', '#633529', '#995a38', '#cc8852', '#ebb478',                       // 29..33 树干与原木景观桥/木栏
        '#38333a', '#786e68', '#b8aca0', '#ede5d8',                                  // 34..37 花岗岩广场地砖与景石
        '#24595c', '#32856c', '#5fc284', '#733548',                                  // 38..41 冷杉针叶与红檵木过渡
        '#ffd25a', '#fff4c4', '#f06f6a', '#78c7f5',                                  // 42..45 园艺花卉与庭院暖光柱灯
        '#e2d4be', '#8f7b70', '#2d2430', '#3d783d', '#72c94f', '#388a45',            // 46..51 CQRD 花坛洞石与黄杨联动色
        '#ad6478', '#803b52', '#522138', '#2e1326'                                   // 52..55 CQRD 红檵木字体阴影联动色
      ];
      const hexToIdx = new Map();
      const palR = new Uint8Array(EXT_PAL.length);
      const palG = new Uint8Array(EXT_PAL.length);
      const palB = new Uint8Array(EXT_PAL.length);
      const palA = new Uint8Array(EXT_PAL.length);
      for (let i = 1; i < EXT_PAL.length; i++) {
        const hx = EXT_PAL[i].toLowerCase();
        hexToIdx.set(hx, i);
        palR[i] = parseInt(hx.slice(1, 3), 16);
        palG[i] = parseInt(hx.slice(3, 5), 16);
        palB[i] = parseInt(hx.slice(5, 7), 16);
        palA[i] = 255;
      }

      const hash2 = (x, y) => {
        let h = ((x * 374761393) ^ (y * 668265263)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
      };
      const smoothNoise = (x, y, cell) => {
        const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
        const fx = (x - cx * cell) / cell, fy = (y - cy * cell) / cell;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const n00 = hash2(cx, cy), n10 = hash2(cx + 1, cy);
        const n01 = hash2(cx, cy + 1), n11 = hash2(cx + 1, cy + 1);
        return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
      };
      const wxToPx = wx => Math.round((wx - OX) / 2);
      const wyToPy = wy => Math.round((wy - OY) / 2);

      function fillPolyMask(mark, poly, val) {
        const pts = poly.map(p => [((p.x ?? p[0]) - OX) / 2, ((p.y ?? p[1]) - OY) / 2]);
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

      function ptInPolyWorld(poly, x, y) {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x ?? poly[i][0], yi = poly[i].y ?? poly[i][1];
          const xj = poly[j].x ?? poly[j][0], yj = poly[j].y ?? poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
        }
        return inside;
      }

      // 折线拐角圆弧平滑插值（2 轮保端点限幅 Chaikin 切角，闭合环自动跨首尾平滑）
      function smoothPathPts(pts) {
        if (!pts || pts.length < 3) return pts || [];
        let cur = pts.map(q => [q[0], q[1], q[2]]);
        const closed = Math.hypot(cur[0][0] - cur[cur.length - 1][0], cur[0][1] - cur[cur.length - 1][1]) < 2.5;
        for (let iter = 0; iter < 2; iter++) {
          const n = cur.length;
          if (n < 3) break;
          const next = [];
          if (!closed) next.push(cur[0]);
          const start = closed ? 0 : 1;
          const end = closed ? n - 1 : n - 1;
          for (let i = start; i < end; i++) {
            const p0 = cur[(i - 1 + n) % n];
            const p1 = cur[i];
            const p2 = cur[(i + 1) % n];
            const d0 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
            const d2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) || 1;
            const t0 = Math.min(0.30, 9 / d0);
            const t2 = Math.min(0.30, 9 / d2);
            next.push([
              p1[0] + (p0[0] - p1[0]) * t0,
              p1[1] + (p0[1] - p1[1]) * t0,
              p1[2] + (p0[2] - p1[2]) * t0
            ]);
            next.push([
              p1[0] + (p2[0] - p1[0]) * t2,
              p1[1] + (p2[1] - p1[1]) * t2,
              p1[2] + (p2[2] - p1[2]) * t2
            ]);
          }
          if (closed && next.length) next.push([next[0][0], next[0][1], next[0][2]]);
          else next.push(cur[n - 1]);
          cur = next;
        }
        return cur;
      }

      function buildExteriorCanvas(f) {
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const f1 = f || (root.WORLD && root.WORLD.floorById && root.WORLD.floorById(1)) || null;
        const westH = (f1 && Array.isArray(f1.halls) && f1.halls.find(h => h.side === 'left')) || { x: -144, y: 128, w: 144, h: 112 };
        const eastH = (f1 && Array.isArray(f1.halls) && f1.halls.find(h => h.side === 'right')) || { x: 3456, y: 128, w: 144, h: 112 };
        const bldgPoly = (f1 && Array.isArray(f1.polygon) && f1.polygon.length >= 3)
          ? f1.polygon
          : [{ x: 0, y: 0 }, { x: 3456, y: 0 }, { x: 3456, y: 480 }, { x: 2680, y: 480 }, { x: 2680, y: 960 }, { x: 780, y: 960 }, { x: 780, y: 480 }, { x: 0, y: 480 }];

        const grid = new Uint8Array(EW * EH);
        const bldg = new Uint8Array(EW * EH);
        const land = new Uint8Array(EW * EH);
        const wall = new Uint8Array(EW * EH);
        fillPolyMask(bldg, bldgPoly, 1);

        const pset = (x, y, c) => {
          const ix = x | 0, iy = y | 0;
          if (ix >= 0 && ix < EW && iy >= 0 && iy < EH && c && !bldg[iy * EW + ix]) grid[iy * EW + ix] = c;
        };
        const pat = (x, y) => {
          const ix = x | 0, iy = y | 0;
          return (ix >= 0 && ix < EW && iy >= 0 && iy < EH) ? grid[iy * EW + ix] : 0;
        };
        const fillDisc = (cx, cy, rx, ry, c) => {
          const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(EW - 1, Math.ceil(cx + rx));
          const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(EH - 1, Math.ceil(cy + ry));
          for (let y = y0; y <= y1; y++) {
            const dy = (y - cy) / ry;
            const row = y * EW;
            for (let x = x0; x <= x1; x++) {
              if (bldg[row + x]) continue;
              const dx = (x - cx) / rx;
              if (dx * dx + dy * dy <= 1) grid[row + x] = c;
            }
          }
        };
        const fillRect = (x, y, w, h, c) => {
          const x0 = Math.max(0, x | 0), x1 = Math.min(EW, (x + w) | 0);
          const y0 = Math.max(0, y | 0), y1 = Math.min(EH, (y + h) | 0);
          for (let yy = y0; yy < y1; yy++) {
            const row = yy * EW;
            for (let xx = x0; xx < x1; xx++) if (!bldg[row + xx]) grid[row + xx] = c;
          }
        };

        // 1) 东南景观水池 32×32 成簇水纹模板
        const WATER_TILE = new Uint8Array(32 * 32);
        WATER_TILE.fill(3);
        const wClust = (x, y, len, c) => {
          for (let i = 0; i < len; i++) WATER_TILE[(((y & 31) * 32) + ((x + i) & 31))] = c;
        };
        for (const [wx, wy, wl, wc] of [
          [2, 3, 6, 2], [4, 4, 5, 1], [15, 2, 7, 4], [24, 5, 5, 2],
          [8, 9, 6, 4], [10, 10, 4, 2], [21, 8, 6, 1], [22, 9, 5, 2],
          [1, 14, 7, 2], [13, 15, 6, 4], [26, 13, 5, 2], [27, 14, 4, 1],
          [6, 19, 5, 1], [17, 20, 7, 4], [18, 21, 5, 2], [29, 19, 4, 2],
          [3, 25, 6, 4], [12, 24, 6, 2], [13, 25, 4, 1], [23, 27, 6, 4], [25, 28, 4, 2]
        ]) wClust(wx, wy, wl, wc);

        const SIN256 = new Int8Array(256);
        for (let i = 0; i < 256; i++) SIN256[i] = Math.round(Math.sin((i / 256) * Math.PI * 2) * 1.5);
        const CGW = 152, CGH = 54;
        const cNoise = new Float32Array(CGW * CGH);
        for (let cy = 0; cy < CGH; cy++) for (let cx = 0; cx < CGW; cx++) cNoise[cy * CGW + cx] = hash2(cx * 3 + 7, cy * 5 + 11);
        const fastNoise = (x, y) => {
          const gx = x >> 4, gy = y >> 4;
          const fx = (x & 15) * 0.0625, fy = (y & 15) * 0.0625;
          const idx = gy * CGW + gx;
          const n00 = cNoise[idx], n10 = cNoise[idx + 1];
          const n01 = cNoise[idx + CGW], n11 = cNoise[idx + CGW + 1];
          return (n00 + (n10 - n00) * fx) * (1 - fy) + (n01 + (n11 - n01) * fx) * fy;
        };

        // 2) 全域写实地面园区基底（land=1），东南庭院跨桥处开凿镜面锦鲤水池：
        //    严格对齐水池阻挡边界 wx=2876..3148 (px=1758..1893), wy=488..826 (py=404..572)，
        //    池南 wy=828..928 留出宽敞平坦的修剪草坪与闭环漫步园路。
        for (let y = 0; y < EH; y++) {
          const row = y * EW;
          const wob = Math.round(2 * Math.sin((y - 404) * 0.07) + 1.2 * Math.cos((y - 404) * 0.13));
          for (let x = 0; x < EW; x++) {
            let inPond = false;
            if (x >= 1758 && x <= 1893 && y >= 404 && y <= 572) {
              const ny = y < 424 ? (424 - y) / 20 : (y > 549 ? (y - 549) / 23 : 0);
              const halfW = 64.5 * Math.sqrt(Math.max(0, 1 - ny * ny));
              const midX = 1825.5 + wob;
              if (Math.abs(x - midX) <= halfW) inPond = true;
            }
            if (!inPond) land[row + x] = 1;
          }
        }

        // 3) 景观水池北岸石砌池壁（5px 高暖灰驳岸立面）
        for (let x = 1745; x < 1915; x++) {
          for (let y = 398; y < 584; y++) {
            const idx = y * EW + x;
            if (land[idx]) continue;
            let top = -1;
            for (let k = 1; k <= 5; k++) {
              if (land[(y - k) * EW + x]) { top = k; break; }
            }
            if (top > 0) wall[idx] = top;
          }
        }

        // 4) 池岸浅水距离场
        const dist = new Uint8Array(EW * EH);
        for (let i = 0; i < dist.length; i++) dist[i] = (land[i] || wall[i]) ? 0 : 255;
        for (let y = 394; y < 588; y++) {
          const row = y * EW;
          for (let x = 1740; x < 1920; x++) {
            const i = row + x;
            if (!dist[i]) continue;
            let d = dist[i];
            const d1 = dist[i - 1] + 2, d2 = dist[i - EW] + 2, d3 = dist[i - EW - 1] + 3, d4 = dist[i - EW + 1] + 3;
            if (d1 < d) d = d1; if (d2 < d) d = d2; if (d3 < d) d = d3; if (d4 < d) d = d4;
            dist[i] = d;
          }
        }
        for (let y = 587; y >= 394; y--) {
          const row = y * EW;
          for (let x = 1919; x >= 1740; x--) {
            const i = row + x;
            if (!dist[i]) continue;
            let d = dist[i];
            const d1 = dist[i + 1] + 2, d2 = dist[i + EW] + 2, d3 = dist[i + EW + 1] + 3, d4 = dist[i + EW - 1] + 3;
            if (d1 < d) d = d1; if (d2 < d) d = d2; if (d3 < d) d = d3; if (d4 < d) d = d4;
            dist[i] = d;
          }
        }

        // 5) 绘制园区修剪草坪、建筑檐下环境投影与东南景观水池
        for (let y = 0; y < EH; y++) {
          const row = y * EW;
          for (let x = 0; x < EW; x++) {
            const i = row + x;
            if (bldg[i]) continue;
            if (land[i]) {
              const n = fastNoise(x, y) * 0.72 + fastNoise(((x * 3) + 41) % (EW - 20), ((y * 3) + 29) % (EH - 20)) * 0.28;
              let c = n < 0.34 ? 19 : (n < 0.70 ? 20 : 21);
              // 景观池岸石材压边（左上受光暖石 37，东南背光厚石 35/36）
              const nW = y > 0 && !land[i - EW], sW = y + 1 < EH && !land[i + EW];
              const wW = x > 0 && !land[i - 1], eW = x + 1 < EW && !land[i + 1];
              if (nW || sW || wW || eW) {
                c = (sW || eW) ? (((x + y) & 2) ? 37 : 36) : (((x + y) & 2) ? 36 : 35);
              }
              // 建筑南墙与侧翼墙基柔和环境光投影（左上光源）
              let sh = 0;
              for (let k = 1; k <= 7 && !sh; k++) if (y - k >= 0 && bldg[i - EW * k]) sh = k;
              for (let k = 1; k <= 5 && !sh; k++) if (x - k >= 0 && bldg[i - k]) sh = k;
              if (sh) {
                const wob = (((x >> 2) + (y >> 1)) % 3 === 0) ? 1 : 0;
                if (sh <= 3 + wob) c = 18;
                else if (sh <= 6 + wob) c = 19;
              }
              grid[i] = c;
            } else if (wall[i]) {
              const dTop = wall[i];
              grid[i] = dTop === 1 ? 37 : (dTop >= 5 ? 8 : (x % 8 === 0 ? 34 : 35));
            } else {
              const d = dist[i];
              const sw = SIN256[(x * 9 + y * 6) & 255];
              if (d + sw <= 4) grid[i] = 7;
              else if (d + sw <= 9) grid[i] = 6;
              else if (d + sw <= 15) grid[i] = 5;
              else grid[i] = WATER_TILE[((y & 31) << 5) | (x & 31)];
            }
          }
        }

        // 5.5) 统一掩码（Mask Union）一体化建筑石材基座承台（东西电梯翼楼单层连续花岗岩承台，零叠压黑框、零悬空断头石板）
        const paveMask = new Uint8Array(EW * EH);
        const addPlinthMask = (wx0, wy0, ww, wh, cornerR) => {
          const px0 = Math.max(2, wxToPx(wx0)), px1 = Math.min(EW - 2, wxToPx(wx0 + ww));
          const py0 = Math.max(2, wyToPy(wy0)), py1 = Math.min(EH - 4, wyToPy(wy0 + wh));
          const r = cornerR || 6;
          for (let y = py0; y < py1; y++) {
            const row = y * EW;
            for (let x = px0; x < px1; x++) {
              if (bldg[row + x] || !land[row + x]) continue;
              let dx = 0, dy = 0;
              if (x < px0 + r && !bldg[row + px0]) dx = (px0 + r) - x;
              else if (x >= px1 - r && !bldg[row + px1 - 1]) dx = x - (px1 - 1 - r);
              if (y < py0 + r) dy = (py0 + r) - y;
              else if (y >= py1 - r) dy = y - (py1 - 1 - r);
              if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) continue;
              paveMask[row + x] = 1;
            }
          }
        };
        const westApron = { x0: westH.x - 52, y0: westH.y - 96, w: westH.w + 56, h: westH.h + 156 };
        const eastApron = { x0: eastH.x - 4, y0: eastH.y - 96, w: eastH.w + 56, h: eastH.h + 156 };
        addPlinthMask(westApron.x0, westApron.y0, westApron.w, westApron.h, 6);
        addPlinthMask(eastApron.x0, eastApron.y0, eastApron.w, eastApron.h, 6);

        // 承台外侧 3/4 南向石材立面厚边与草地接触短影（rules://66 过渡准则）
        for (let y = 2; y < EH - 3; y++) {
          const row = y * EW;
          for (let x = 2; x < EW - 2; x++) {
            const i = row + x;
            if (paveMask[i] || bldg[i] || !land[i]) continue;
            if (paveMask[i - EW]) {
              grid[i] = (x % 12 === 0) ? 34 : 35;
            } else if (paveMask[i - EW * 2] || paveMask[i - 1]) {
              grid[i] = 18;
            }
          }
        }
        // 承台内部连续错缝花岗岩砖纹 + 1px 柔和受光/背光路缘与局部草叶自然咬边
        for (let y = 2; y < EH - 3; y++) {
          const row = y * EW;
          for (let x = 2; x < EW - 2; x++) {
            const i = row + x;
            if (!paveMask[i]) continue;
            const nOut = !paveMask[i - EW] && !bldg[i - EW];
            const sOut = !paveMask[i + EW] && !bldg[i + EW];
            const wOut = !paveMask[i - 1] && !bldg[i - 1];
            const eOut = !paveMask[i + 1] && !bldg[i + 1];
            if (nOut || wOut) {
              const bite = (((x >> 1) * 7 + (y >> 1) * 5) % 9) === 0;
              grid[i] = bite ? 20 : 35;
              continue;
            }
            if (sOut || eOut) {
              const bite = eOut && !sOut && (((y >> 1) * 7 + (x >> 1) * 3) % 11 === 0);
              grid[i] = bite ? 19 : 34;
              continue;
            }
            const nInner = (!paveMask[i - EW * 2] && !bldg[i - EW * 2]) || (!paveMask[i - 2] && !bldg[i - 2]);
            if (nInner) {
              grid[i] = 37;
              continue;
            }
            const r = Math.floor(y / 8), off = (r & 1) ? 7 : 0;
            const gx = (x + off) % 14, gy = y % 8;
            const cellH = hash2(Math.floor((x + off) / 14), r);
            if (gy === 0 || (gx === 0 && cellH > 0.18)) grid[i] = 35;
            else if (gy === 1 && gx >= 1 && gx <= 6 && cellH < 0.42) grid[i] = 37;
            else if (cellH > 0.84 && gy >= 3 && gy <= 4 && gx >= 4 && gx <= 7) grid[i] = 46;
            else grid[i] = 36;
          }
        }
        // 电梯翼楼墙脚环境光暗影
        for (const h of [westH, eastH]) {
          const hx0 = Math.max(2, wxToPx(h.x - 10)), hx1 = Math.min(EW - 2, wxToPx(h.x + h.w + 10));
          const hy0 = Math.max(2, wyToPy(h.y - 70)), hy1 = Math.min(EH - 4, wyToPy(h.y + h.h + 22));
          for (let y = hy0; y <= hy1; y++) {
            const row = y * EW;
            for (let x = hx0; x <= hx1; x++) {
              if (paveMask[row + x] && grid[row + x] >= 36) grid[row + x] = 35;
            }
          }
        }

        // 6) 圆润连贯的庭院暖砂砾园路系统（优先读取 f1.yards 的 yd.paths，统一距离场融合消除一切分叉黑线与折角）
        const defaultWorldPaths = [
          // sw-lawn：从大堂南门台阶 [660,480] 引出平滑闭环，优雅环绕 CQRD 立体花坛
          [[660, 480, 22], [660, 526, 20], [566, 542, 20], [396, 542, 20], [226, 554, 20], [174, 616, 20], [174, 718, 20], [232, 782, 20], [396, 794, 20], [570, 784, 20], [658, 730, 20], [668, 626, 20], [660, 526, 20]],
          // se-isle：北门 [2750,480] 与西门 [2680,655] 汇入跨溪木桥西桥头 [2868,622]
          [[2750, 480, 22], [2758, 542, 20], [2806, 602, 20], [2868, 622, 20]],
          [[2680, 655, 22], [2746, 652, 20], [2808, 634, 20], [2868, 622, 20]],
          // se-isle：东桥头 [3148,622] 引出东南樱花庭院与池南漫步闭环，回接西岸园路
          [[3148, 622, 20], [3238, 616, 20], [3338, 646, 20], [3372, 730, 20], [3324, 842, 20], [3196, 884, 20], [3012, 888, 20], [2836, 872, 20], [2760, 786, 20], [2752, 652, 20]]
        ];
        const rawYardPaths = [];
        if (f1 && Array.isArray(f1.yards)) {
          for (const yd of f1.yards) {
            for (const p of (yd.paths || [])) {
              const pts = Array.isArray(p) ? p : (p && p.pts);
              if (Array.isArray(pts) && pts.length >= 2) rawYardPaths.push(pts);
            }
          }
        }
        const worldPathsToDraw = rawYardPaths.length ? rawYardPaths : defaultWorldPaths;
        const smoothedPaths = worldPathsToDraw.map(wpts => smoothPathPts(
          wpts.map(q => [(q[0] - OX) / 2, (q[1] - OY) / 2, (q[2] || 20) / 2])
        ));

        const pathMargin = new Float32Array(EW * EH);
        pathMargin.fill(-999);
        let pGlobalMinX = EW, pGlobalMaxX = 0, pGlobalMinY = EH, pGlobalMaxY = 0;
        for (let pi = 0; pi < smoothedPaths.length; pi++) {
          const pts = smoothedPaths[pi];
          for (let s = 0; s < pts.length - 1; s++) {
            const p1 = pts[s], p2 = pts[s + 1];
            const x1 = p1[0], y1 = p1[1], r1 = p1[2];
            const x2 = p2[0], y2 = p2[1], r2 = p2[2];
            const rMax = (r1 > r2 ? r1 : r2) + 3;
            const sx0 = Math.max(1, Math.floor((x1 < x2 ? x1 : x2) - rMax));
            const sx1 = Math.min(EW - 2, Math.ceil((x1 > x2 ? x1 : x2) + rMax));
            const sy0 = Math.max(1, Math.floor((y1 < y2 ? y1 : y2) - rMax));
            const sy1 = Math.min(EH - 2, Math.ceil((y1 > y2 ? y1 : y2) + rMax));
            if (sx0 < pGlobalMinX) pGlobalMinX = sx0;
            if (sx1 > pGlobalMaxX) pGlobalMaxX = sx1;
            if (sy0 < pGlobalMinY) pGlobalMinY = sy0;
            if (sy1 > pGlobalMaxY) pGlobalMaxY = sy1;
            const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1, invL2 = 1 / l2;
            const dr = r2 - r1;
            for (let y = sy0; y <= sy1; y++) {
              const row = y * EW;
              const dy1 = y - y1;
              for (let x = sx0; x <= sx1; x++) {
                const i = row + x;
                if (!land[i] || bldg[i] || paveMask[i]) continue;
                let t = ((x - x1) * vx + dy1 * vy) * invL2;
                if (t < 0) t = 0; else if (t > 1) t = 1;
                const dx = x - (x1 + vx * t), dy = y - (y1 + vy * t);
                const rad = r1 + dr * t;
                const lim = rad + 2.5;
                const d2 = dx * dx + dy * dy;
                if (d2 <= lim * lim) {
                  const m = rad - Math.sqrt(d2);
                  if (m > pathMargin[i]) pathMargin[i] = m;
                }
              }
            }
          }
        }

        const pathMask = new Uint8Array(EW * EH);
        if (pGlobalMinX <= pGlobalMaxX) {
          const bx0 = Math.max(2, pGlobalMinX - 2), bx1 = Math.min(EW - 3, pGlobalMaxX + 2);
          const by0 = Math.max(2, pGlobalMinY - 2), by1 = Math.min(EH - 3, pGlobalMaxY + 2);
          for (let y = by0; y <= by1; y++) {
            const row = y * EW;
            for (let x = bx0; x <= bx1; x++) {
              const i = row + x;
              if (pathMargin[i] < -2) continue;
              const wob = (smoothNoise(x + 31, y + 19, 9) - 0.5) * 1.3;
              if (pathMargin[i] + wob >= 0) pathMask[i] = 1;
            }
          }
          // 1 轮形态学净边，消除路缘单像素毛刺
          const pathClean = pathMask.slice();
          for (let y = by0; y <= by1; y++) {
            const row = y * EW;
            for (let x = bx0; x <= bx1; x++) {
              const i = row + x;
              if (!land[i] || bldg[i] || paveMask[i]) continue;
              const nb = pathClean[i - 1] + pathClean[i + 1] + pathClean[i - EW] + pathClean[i + EW];
              if (pathClean[i] && nb <= 1) pathMask[i] = 0;
              else if (!pathClean[i] && nb >= 3) pathMask[i] = 1;
            }
          }
          // 统一渲染园路路牙（13）、过渡层（14）、暖砂心（15/16）与草芽咬边
          for (let y = by0; y <= by1; y++) {
            const row = y * EW;
            for (let x = bx0; x <= bx1; x++) {
              const i = row + x;
              if (!pathMask[i]) {
                // 园路南/东外侧草唇受左上光微亮（rules://66 tiles-edge-n-16）
                if (land[i] && !bldg[i] && !paveMask[i] && (pathMask[i - EW] || pathMask[i - 1])) {
                  if ((((x >> 1) * 5 + (y >> 1) * 3) % 4) === 0 && grid[i] >= 19 && grid[i] <= 21) grid[i] = 22;
                }
                continue;
              }
              const nOut = !pathMask[i - EW] && land[i - EW] && !bldg[i - EW];
              const sOut = !pathMask[i + EW] && land[i + EW] && !bldg[i + EW];
              const wOut = !pathMask[i - 1] && land[i - 1] && !bldg[i - 1];
              const eOut = !pathMask[i + 1] && land[i + 1] && !bldg[i + 1];
              if (nOut || wOut || sOut || eOut) {
                const bite = (((x >> 1) * 7 + (y >> 1) * 11) % 10) === 0;
                if (bite) grid[i] = (sOut || eOut) ? 21 : 19;
                else grid[i] = (nOut || wOut) ? 13 : 14;
                continue;
              }
              const nearNW = (!pathMask[i - EW * 2] && !bldg[i - EW * 2]) || (!pathMask[i - 2] && !bldg[i - 2]);
              const nearSE = (!pathMask[i + EW * 2] && !bldg[i + EW * 2]) || (!pathMask[i + 2] && !bldg[i + 2]);
              if (nearNW) {
                grid[i] = (((x >> 1) + (y >> 1)) % 5 === 0) ? 13 : 14;
              } else if (nearSE) {
                grid[i] = (((x >> 1) * 3 + (y >> 1)) % 4 === 0) ? 16 : 15;
              } else if (pathMargin[i] > 3.2 && smoothNoise(x + 17, y + 9, 10) > 0.53) {
                grid[i] = 16;
              } else {
                grid[i] = 15;
              }
            }
          }
        }
        // 园路砂心稀疏鹅卵石簇（成对 2px 受光 16 + 2px 暗部 14，零孤立像素）
        for (let y = 24; y < EH - 24; y += 16) {
          for (let x = 24; x < EW - 24; x += 18) {
            const h = hash2(x + 3, y + 7);
            if (h > 0.42) continue;
            const px = x + Math.floor(h * 7) - 3, py = y + Math.floor(hash2(y, x) * 5) - 2;
            const i = py * EW + px;
            if (pathMargin[i] > 4.2 && pathMask[i] && pathMask[i + 1] && pathMask[i + EW + 1] && pathMask[i + EW + 2]) {
              pset(px, py, 16); pset(px + 1, py, 16);
              pset(px + 1, py + 1, 14); pset(px + 2, py + 1, 14);
            }
          }
        }

        // 7) 修剪草坪细节点缀（4-连通成团草芽与双瓣野花簇，严禁任何 4-邻域孤立单像素）
        for (let y = 16; y < EH - 16; y += 12) {
          for (let x = 16; x < EW - 16; x += 14) {
            const h = hash2(x, y);
            const px = x + Math.floor(h * 7) - 3, py = y + Math.floor(hash2(y, x) * 5) - 2;
            if (px < 6 || px >= EW - 8 || py < 6 || py >= EH - 8) continue;
            const i = py * EW + px;
            if (!land[i] || bldg[i] || paveMask[i] || pathMask[i] || grid[i] < 19 || grid[i] > 21) continue;
            if (px >= 430 && px <= 606 && py >= 448 && py <= 538) continue;
            if (h < 0.20) {
              pset(px, py, 22); pset(px + 1, py, 22);
              pset(px, py - 1, 23); pset(px + 1, py - 1, 23);
              pset(px + 1, py + 1, 19); pset(px + 2, py + 1, 19);
            } else if (h > 0.92) {
              const fc = h > 0.97 ? 44 : 43;
              pset(px, py - 1, fc); pset(px + 1, py - 1, fc); pset(px, py, fc);
              pset(px + 1, py, 42); pset(px + 2, py, 42);
              pset(px + 1, py + 1, 19); pset(px + 2, py + 1, 19);
            }
          }
        }

        // 8) 嵌入西南前庭核心「CQRD」立体模纹花坛（160×72 原生网格精确压入 px=438, py=457）
        const cqFn = L.themes?.[1]?.furniture?.cqrdbed || f?.theme?.furniture?.cqrdbed;
        if (cqFn && cqFn.buildGrid) {
          const { w: cw, h: ch, pal: cpal, grid: cgrid } = cqFn.buildGrid();
          const cx0 = wxToPx(236), cy0 = wyToPy(594);
          for (let ry = 0; ry < ch; ry++) {
            for (let rx = 0; rx < cw; rx++) {
              const cv = cgrid[ry * cw + rx];
              if (!cv) continue;
              if (ry > 54 && !cgrid[Math.min(ch - 1, ry + 2) * cw + rx]) {
                const sDrop = ((rx >> 2) + (rx % 3)) % 3;
                pset(cx0 + rx + 1, cy0 + ry + 1, (rx >> 3) % 3 === 0 ? 19 : 18);
                if (sDrop > 0) pset(cx0 + rx + 1, cy0 + ry + 2, sDrop === 2 ? 18 : 19);
              }
              const mapped = hexToIdx.get(cpal[cv].toLowerCase());
              if (mapped) pset(cx0 + rx, cy0 + ry, mapped);
            }
          }
          for (let rx = 26; rx <= 134; rx += 14) {
            fillRect(cx0 + rx, cy0 + ch - 4, 2, 2, (rx % 28 === 26) ? 21 : 20);
          }
          for (const ry of [28, 42]) {
            fillRect(cx0, cy0 + ry, 2, 2, 20);
            fillRect(cx0 + cw - 2, cy0 + ry, 2, 2, 20);
          }
        }

        // 9) 景观构件绘制函数（全部 2× 原生像素精度、单源左上光照、成簇无噪点）
        const stampBridge = (px, py, pw, ph) => {
          // 东西两端洞石桥头踏步垫石，让暖砂园路与木桥无缝咬合
          for (const sx of [px - 3, px + pw]) {
            fillRect(sx, py + 1, 3, ph - 2, 34);
            fillRect(sx + (sx < px ? 1 : 0), py + 2, 2, ph - 4, 36);
            fillRect(sx + (sx < px ? 1 : 0), py + 2, 2, 3, 37);
          }
          for (let bx = 0; bx < pw; bx++) {
            const sd = (bx % 9 === 4) ? 2 : 3;
            for (let sy = 1; sy <= sd; sy++) {
              if (!land[(py + ph + sy) * EW + (px + bx)]) pset(px + bx, py + ph + sy, (bx % 8 < 2) ? 2 : 1);
            }
          }
          fillRect(px, py - 2, pw, ph + 4, 29);
          fillRect(px, py, pw, ph, 31);
          for (let by = 4; by < ph - 3; by += 10) {
            fillRect(px, py + by, 1, 2, 30);
            fillRect(px + pw - 1, py + by, 1, 2, 30);
          }
          for (let bx = 0; bx < pw; bx += 9) {
            const plankW = Math.min(8, pw - bx);
            const tone = ((bx / 9) & 1) ? 32 : 31;
            const splitY = (ph > 26) ? Math.floor(ph / 2) + (((bx / 9) & 1) ? -3 : 3) : -1;
            for (let by = 2; by < ph - 2; by++) {
              if (by === splitY) {
                for (let k = 0; k <= plankW && bx + k < pw; k++) pset(px + bx + k, py + by, 30);
                continue;
              }
              const j = (by % 5 === 0) ? 1 : 0;
              for (let k = 0; k < plankW - 1; k++) {
                const c = (by <= 3 || by === splitY + 1) ? 33 : (by >= ph - 3 ? 30 : (k === 0 && (by & 2) ? 30 : tone));
                if (bx + k + j < pw) pset(px + bx + k, py + by, c);
              }
              if (bx + plankW - 1 < pw) pset(px + bx + plankW - 1, py + by, 29);
            }
            if ((bx / 9) % 2 === 0 && bx + 3 < pw) {
              for (const ry of [py - 4, py + ph - 2]) {
                fillRect(px + bx, ry, 4, 6, 29);
                fillRect(px + bx + 1, ry + 1, 2, 4, 30);
                fillRect(px + bx + 1, ry + 1, 2, 1, 33);
              }
            }
          }
          for (let bx = 3; bx < pw - 2; bx += 18) {
            const len = Math.min(14, pw - bx - 1);
            if (len <= 0) break;
            fillRect(px + bx, py - 2, len, 2, 32);
            fillRect(px + bx, py + ph, len, 2, 30);
          }
        };

        const stampFence = (px, py, worldLenOrPosts) => {
          const totalW = (!worldLenOrPosts || worldLenOrPosts <= 12)
            ? ((worldLenOrPosts || 4) - 1) * 12 + 4
            : Math.max(16, Math.round(worldLenOrPosts / 2));
          const posts = Math.max(2, Math.round((totalW - 4) / 12) + 1);
          const span = totalW - 4;
          fillRect(px + 2, py + 3, totalW - 4, 2, 29);
          fillRect(px + 2, py + 4, totalW - 4, 1, 32);
          fillRect(px + 2, py + 6, totalW - 4, 2, 29);
          fillRect(px + 2, py + 7, totalW - 4, 1, 30);
          for (let k = 0; k < posts; k++) {
            const fx = px + Math.round(k * span / (posts - 1));
            fillRect(fx + 1, py + 9, 4, 2, 18);
            fillRect(fx, py, 4, 10, 29);
            fillRect(fx + 1, py + 1, 2, 8, 31);
            fillRect(fx + 1, py + 1, 2, 2, 33);
          }
        };

        const stampFenceV = (px, py, worldLen) => {
          const totalH = Math.max(12, Math.round((worldLen || 40) / 2));
          const posts = Math.max(2, Math.round((totalH - 6) / 10) + 1);
          fillRect(px + 1, py + 3, 2, totalH - 4, 32);
          fillRect(px + 3, py + 3, 1, totalH - 4, 29);
          for (let k = 0; k < posts; k++) {
            const fy = py + Math.round(k * (totalH - 8) / (posts - 1));
            fillRect(px + 1, fy + 8, 5, 2, 18);
            fillRect(px, fy, 4, 9, 29);
            fillRect(px + 1, fy + 1, 2, 7, 31);
            fillRect(px + 1, fy + 1, 2, 2, 33);
          }
        };

        const stampBench = (px, py) => {
          // 64×24 世界像素（32×12 原生网格）现代园区暖木铸铁休憩长椅，碰撞盒对齐 [wx, wy+10, 64, 14]
          fillRect(px + 2, py + 10, 30, 2, 18);
          // 铸铁侧架与支腿
          for (const lx of [1, 28]) {
            fillRect(px + lx, py + 1, 3, 10, 34);
            fillRect(px + lx, py + 2, 2, 2, 36);
          }
          // 靠背暖雪松木条（左上受光）
          fillRect(px, py, 32, 5, 29);
          fillRect(px + 1, py + 1, 30, 1, 33);
          fillRect(px + 1, py + 2, 30, 1, 32);
          fillRect(px + 1, py + 3, 30, 1, 30);
          // 座面格栅与前缘厚板
          fillRect(px, py + 5, 32, 5, 29);
          fillRect(px + 1, py + 5, 30, 2, 33);
          fillRect(px + 1, py + 7, 30, 1, 32);
          fillRect(px + 1, py + 8, 30, 1, 31);
          for (const ax of [1, 29]) {
            fillRect(px + ax, py + 4, 2, 3, 34);
            fillRect(px + ax, py + 4, 2, 1, 36);
          }
        };

        const stampFlowers = (px, py, nw, nh) => {
          // 自然错落的园区宿根花丛（地面平铺可走，成团绿叶衬底 + 2×2/3px 花瓣簇，0 孤立噪点）
          const w = Math.max(10, nw || 24), h = Math.max(8, nh || 16);
          const count = Math.max(3, Math.round((w * h) / 52));
          const palette = [43, 44, 27, 42, 45];
          for (let k = 0; k < count; k++) {
            const ha = hash2(px + k * 11, py + k * 5), hb = hash2(py + k * 17, px + k * 3);
            const cx = px + 3 + Math.floor(ha * Math.max(1, w - 7));
            const cy = py + 3 + Math.floor(hb * Math.max(1, h - 6));
            if (paveMask[cy * EW + cx] || pathMask[cy * EW + cx]) continue;
            fillDisc(cx + 1, cy + 2, 4, 2, 18);
            fillDisc(cx, cy + 1, 4, 2, 19);
            fillRect(cx - 2, cy, 3, 2, 21);
            fillRect(cx - 2, cy - 1, 2, 1, 22);
            const fc = palette[Math.floor(hash2(k * 7, px + py) * palette.length)];
            fillRect(cx - 1, cy - 2, 2, 2, fc);
            fillRect(cx, cy - 1, 2, 2, fc);
            if (fc !== 42) fillRect(cx + 1, cy - 2, 2, 1, 42);
            else fillRect(cx + 1, cy - 2, 2, 1, 43);
          }
        };

        const stampHedge = (px, py, nw) => {
          const w = Math.max(12, nw || 32);
          fillRect(px + 2, py + 4, w - 2, 2, 18);
          fillRect(px, py - 5, w, 9, 17);
          fillRect(px + 1, py - 4, w - 2, 7, 19);
          fillRect(px + 1, py - 4, w - 2, 3, 21);
          for (let x = 2; x < w - 4; x += 6) {
            fillRect(px + x, py - 4, 3, 2, 22);
            fillRect(px + x + 2, py + 1, 3, 2, 18);
          }
        };

        const stampLantern = (px, py) => {
          fillDisc(px, py + 6, 6, 3, 18);
          fillRect(px - 2, py + 3, 5, 4, 34);
          fillRect(px - 1, py + 4, 3, 2, 36);
          fillRect(px - 1, py - 6, 3, 10, 29);
          fillRect(px, py - 5, 1, 3, 31);
          fillRect(px - 3, py - 12, 7, 7, 29);
          fillRect(px - 2, py - 11, 5, 5, 42);
          fillRect(px - 1, py - 10, 3, 3, 43);
          fillRect(px - 4, py - 14, 9, 2, 34);
          fillRect(px - 2, py - 15, 5, 1, 36);
        };

        const stampLamp = (px, py) => {
          fillDisc(px + 1, py + 5, 5, 2, 18);
          fillRect(px - 2, py + 2, 5, 3, 34);
          fillRect(px - 1, py + 2, 3, 2, 36);
          fillRect(px - 1, py - 18, 3, 20, 34);
          fillRect(px, py - 16, 1, 6, 36);
          fillRect(px, py - 8, 1, 5, 36);
          fillRect(px - 4, py - 24, 9, 6, 34);
          fillRect(px - 3, py - 23, 7, 4, 42);
          fillRect(px - 2, py - 22, 3, 2, 43);
          fillRect(px - 5, py - 26, 11, 2, 34);
          fillRect(px - 3, py - 27, 7, 1, 36);
        };

        const stampRock = (px, py, large) => {
          // 三平面切面景石（rules://65 第 14 条：左上受光顶面 37 + 正面 36 + 右下背光面 35，告别同心圆枕头阴影）
          const rx = large ? 8 : 6, ry = large ? 5 : 4;
          fillDisc(px + 2, py + 3, rx, ry - 1, 18);
          fillDisc(px, py, rx, ry, 34);
          fillDisc(px, py, rx - 1, ry - 1, 35);
          fillDisc(px - 1, py - 1, rx - 2, ry - 1, 36);
          fillRect(px - Math.max(3, rx - 4), py - ry + 1, Math.max(3, rx - 2), 2, 37);
          fillRect(px - rx + 2, py - ry + 2, 3, 2, 37);
          if (large) fillRect(px + 1, py - 1, 3, 1, 34);
          fillRect(px + 2, py + ry - 1, 2, 1, 19);
        };

        const stampBush = (px, py, berry) => {
          fillDisc(px + 1, py + 4, 8, 4, 18);
          for (const [lx, ly, lr] of [[-4, 0, 5], [4, 1, 5], [0, -3, 6]]) fillDisc(px + lx, py + ly, lr, lr - 1, 17);
          for (const [lx, ly, lr] of [[-4, 0, 4], [4, 1, 4], [0, -3, 5]]) fillDisc(px + lx, py + ly, lr, lr - 1, 19);
          fillDisc(px - 2, py - 2, 3, 2, 20);
          fillDisc(px - 1, py - 4, 4, 3, 21);
          for (const [tx, ty, tc] of [[-4, -2, 21], [-2, -5, 22], [1, -4, 22], [-5, 0, 20], [2, 1, 18], [4, 0, 18]]) {
            fillRect(px + tx, py + ty, 2, 2, tc);
          }
          if (berry) {
            const fc = berry === 2 ? 27 : 44;
            fillRect(px - 3, py - 3, 2, 2, fc);
            fillRect(px + 2, py - 1, 2, 2, fc);
          }
        };

        const stampLotus = (px, py, flower) => {
          if (pat(px, py) > 7) return;
          fillDisc(px, py, 6, 3, 19);
          fillDisc(px - 1, py - 1, 4, 2, 21);
          fillRect(px + 2, py - 1, 2, 1, 3);
          if (flower) {
            fillRect(px - 2, py - 3, 4, 2, 27);
            fillRect(px - 1, py - 4, 2, 2, 43);
          }
        };

        const stampPine = (px, py) => {
          fillDisc(px + 2, py + 2, 13, 5, 18);
          fillDisc(px + 1, py + 1, 9, 4, 17);
          fillRect(px - 3, py - 12, 6, 13, 29);
          fillRect(px - 2, py - 11, 4, 11, 30);
          fillRect(px - 2, py - 9, 2, 8, 31);
          fillRect(px - 3, py - 12, 6, 3, 29);
          const tiers = [
            { cy: py - 14, hw: 13, hh: 7 },
            { cy: py - 21, hw: 11, hh: 7 },
            { cy: py - 28, hw: 8, hh: 6 },
            { cy: py - 35, hw: 5, hh: 6 }
          ];
          for (const t of tiers) {
            for (let dy = -t.hh; dy <= t.hh; dy++) {
              const frac = (dy + t.hh) / (t.hh * 2);
              const w = Math.max(1, Math.round(t.hw * frac + (dy > 1 ? 1.5 : 0)));
              for (let dx = -w; dx <= w; dx++) {
                if (dy === t.hh && ((dx + 20) % 3 === 0)) continue;
                const edge = Math.abs(dx) >= w - 1 || dy === -t.hh || dy === t.hh;
                const c = edge ? 17 : (dx > w * 0.35 ? 18 : (dx < -w * 0.15 && dy < 1 ? 40 : (dy < 2 ? 39 : 38)));
                pset(px + dx, t.cy + dy, c);
              }
            }
          }
        };

        const stampCanopyTree = (px, py, kind) => {
          fillDisc(px + 3, py + 3, 15, 6, 18);
          fillDisc(px - 1, py + 2, 11, 5, 17);
          if (kind === 'sakura') {
            for (const [ox, oy] of [[-11, 5], [-6, 8], [7, 7], [13, 4], [2, 9]]) {
              if (pat(px + ox, py + oy) >= 18) {
                fillRect(px + ox, py + oy, 2, 1, 27);
                fillRect(px + ox + 1, py + oy + 1, 2, 1, 26);
              }
            }
          }
          fillRect(px - 3, py - 14, 6, 16, 29);
          fillRect(px - 2, py - 13, 4, 14, 30);
          fillRect(px - 2, py - 10, 2, 10, 31);
          fillRect(px - 4, py - 1, 2, 3, 29);
          fillRect(px + 2, py - 1, 2, 3, 29);
          fillRect(px - 3, py - 14, 6, 4, 29);
          const cPal = (kind === 'sakura' || kind === 'alt' || kind === 'maple')
            ? { out: 24, sh: 25, mid: 26, hi: 27, rim: 28 }
            : { out: 17, sh: 18, mid: 20, hi: 22, rim: 23 };
          const lobes = [
            { lx: 6, ly: -20, rx: 10, ry: 9, shade: true },
            { lx: -7, ly: -21, rx: 10, ry: 9, shade: false },
            { lx: 0, ly: -19, rx: 9, ry: 8, shade: true },
            { lx: 5, ly: -28, rx: 9, ry: 8, shade: false },
            { lx: -3, ly: -31, rx: 11, ry: 9, shade: false }
          ];
          for (const lb of lobes) fillDisc(px + lb.lx, py + lb.ly, lb.rx + 1, lb.ry + 1, cPal.out);
          for (const lb of lobes) {
            fillDisc(px + lb.lx, py + lb.ly, lb.rx, lb.ry, lb.shade ? cPal.sh : cPal.mid);
            if (!lb.shade) {
              fillDisc(px + lb.lx - 1, py + lb.ly - 2, Math.max(3, lb.rx - 2), Math.max(2, lb.ry - 3), cPal.hi);
              fillDisc(px + lb.lx - 2, py + lb.ly - 4, Math.max(2, lb.rx - 5), Math.max(2, lb.ry - 5), cPal.rim);
            } else {
              fillDisc(px + lb.lx - 1, py + lb.ly - 2, Math.max(2, lb.rx - 4), Math.max(2, lb.ry - 4), cPal.mid);
            }
          }
          for (const [kx, ky, kr, kc] of [
            [-9, -27, 2, cPal.hi], [8, -26, 2, cPal.mid], [-5, -37, 2, cPal.rim],
            [4, -33, 2, cPal.hi], [11, -18, 2, cPal.sh], [-12, -19, 2, cPal.mid]
          ]) fillDisc(px + kx, py + ky, kr, kr, kc);
          for (const [cx, cy, cw, ch, kc] of [
            [-7, -23, 3, 2, cPal.sh], [-1, -26, 3, 2, cPal.sh], [4, -22, 3, 2, cPal.out],
            [7, -27, 2, 2, cPal.sh], [-11, -30, 3, 2, cPal.rim], [-3, -32, 3, 2, cPal.rim],
            [2, -31, 3, 2, cPal.hi], [-8, -17, 2, 2, cPal.mid], [10, -24, 2, 2, cPal.sh]
          ]) fillRect(px + cx, py + cy, cw, ch, kc);
        };

        // 庭院周界「园区修剪矮绿篱 + 暖木洞石矮柱护栏」（紧贴可达边界外侧，拐角单墩无缝咬合、52px 等距石柱模数）
        const stampPier = (px, py) => {
          fillRect(px + 1, py + 7, 6, 2, 18);
          fillRect(px, py - 2, 6, 9, 34);
          fillRect(px + 1, py, 4, 6, 36);
          fillRect(px + 3, py, 2, 6, 35);
          fillRect(px + 1, py - 1, 4, 2, 37);
          fillRect(px + 1, py - 2, 4, 1, 33);
        };
        const stampPerimeterH = (wx1, wx2, wy, outSignY) => {
          const pxL = wxToPx(Math.min(wx1, wx2)) - 4;
          const pxR = wxToPx(Math.max(wx1, wx2)) + 3;
          if (pxR - pxL < 6) return;
          const py = wyToPy(wy) + (outSignY > 0 ? 3 : -5);
          fillRect(pxL + 2, py + 5, pxR - pxL - 1, 2, 18);
          for (let x = pxL + 1; x <= pxR - 1; x++) {
            const sc = ((x >> 2) % 3 === 0) ? -1 : 0;
            pset(x, py - 3 + sc, 17);
            pset(x, py - 2 + sc, ((x >> 1) % 4 === 0) ? 23 : 22);
            pset(x, py - 1, 21);
            pset(x, py, ((x >> 2) & 1) ? 20 : 21);
            pset(x, py + 1, 19);
            pset(x, py + 4, 17);
          }
          fillRect(pxL + 1, py + 2, pxR - pxL - 1, 1, 33);
          fillRect(pxL + 1, py + 3, pxR - pxL - 1, 1, 31);
          const pierStart = pxL;
          const pierEnd = pxR - 5;
          const span = Math.max(1, pierEnd - pierStart);
          const nPiers = Math.max(2, Math.round(span / 26) + 1);
          for (let k = 0; k < nPiers; k++) {
            const qx = pierStart + Math.round(k * span / (nPiers - 1));
            stampPier(qx, py - 1);
          }
        };
        const stampPerimeterV = (wx, wy1, wy2, outSignX, isFirst, isLast, fullY0, fullY1) => {
          const baseTop = wyToPy(fullY0) - 4;
          const baseBot = wyToPy(fullY1) + 3;
          const py0 = isFirst ? Math.max(2, baseTop) : wyToPy(Math.min(wy1, wy2));
          const py1 = isLast ? Math.min(EH - 4, baseBot) : wyToPy(Math.max(wy1, wy2));
          if (py1 - py0 < 2) return;
          const px = wxToPx(wx) + (outSignX < 0 ? -4 : -2);
          fillRect(px + 6, py0 + 1, 2, py1 - py0 + 1, 18);
          for (let y = py0; y <= py1; y++) {
            const sc = ((y >> 2) % 3 === 0) ? 1 : 0;
            pset(px, y, 17);
            pset(px + 1, y, ((y >> 1) % 4 === 0) ? 23 : 22);
            pset(px + 2, y, sc ? 22 : 21);
            pset(px + 3, y, (y % 6 < 4) ? 32 : 21);
            pset(px + 4, y, ((y >> 2) & 1) ? 20 : 19);
            pset(px + 5, y, 17);
          }
          const totalSpan = Math.max(1, baseBot - baseTop);
          const nPiers = Math.max(2, Math.round(totalSpan / 26) + 1);
          for (let k = 0; k < nPiers; k++) {
            const qy = baseTop + Math.round(k * totalSpan / (nPiers - 1));
            if (qy >= py0 - 1 && qy <= py1 + 1) {
              // 首尾角墩若与水平护栏相交，与水平护栏同坐标叠合为单一角柱
              stampPier(px, qy - 1);
            }
          }
        };

        // 10) 东南镜面水池跨溪原木景观桥与池内睡莲
        stampBridge(wxToPx(2860), wyToPy(590), 148, 32);
        for (const [lx, ly, fl] of [[2960, 524, 1], [3040, 548, 0], [2950, 712, 1], [3030, 760, 0]]) {
          stampLotus(wxToPx(lx), wyToPy(ly), fl);
        }

        // 11) 动态读取 f1.yards 庭院景物 + 庭院周界围栏 + 零遮挡远景框景林带
        const fallbackYards = [
          {
            id: 'sw-lawn',
            poly: [{ x: 44, y: 480 }, { x: 780, y: 480 }, { x: 780, y: 928 }, { x: 44, y: 928 }],
            gates: [{ x1: 600, y1: 480, x2: 720, y2: 480 }],
            props: [
              ['fence', 120, 512, 96],
              ['pine', 724, 594],
              ['tree', 102, 608, 'sakura'],
              ['lantern', 86, 696],
              ['rock', 716, 692, 0],
              ['bush', 712, 764, 1],
              ['rock', 96, 772, 1],
              ['tree', 126, 868, 'oak'],
              ['bench', 360, 846],
              ['lantern', 628, 848],
              ['tree', 708, 876, 'sakura'],
              ['bush', 236, 872, 1],
              ['bush', 528, 868, 2],
              ['flowers', 584, 586, 52, 36],
              ['flowers', 284, 834, 48, 28]
            ]
          },
          {
            id: 'se-isle',
            poly: [{ x: 2680, y: 480 }, { x: 3536, y: 480 }, { x: 3536, y: 928 }, { x: 2680, y: 928 }],
            gates: [{ x1: 2700, y1: 480, x2: 2800, y2: 480 }, { x1: 2680, y1: 610, x2: 2680, y2: 700 }],
            props: [
              ['pine', 3210, 588],
              ['tree', 3448, 596, 'sakura'],
              ['lantern', 3168, 682],
              ['rock', 2816, 708, 1],
              ['bush', 3258, 708, 2],
              ['tree', 3458, 738, 'oak'],
              ['bench', 3228, 756],
              ['pine', 3452, 876],
              ['tree', 2716, 876, 'sakura'],
              ['rock', 3180, 824, 0],
              ['bush', 2868, 816, 1],
              ['lantern', 3368, 862],
              ['flowers', 3284, 534, 60, 36],
              ['flowers', 3240, 636, 48, 28]
            ]
          }
        ];
        const hasLiveYardProps = !!(f1 && Array.isArray(f1.yards) && f1.yards.some(y => Array.isArray(y.props) && y.props.length > 0));
        const activeYards = hasLiveYardProps ? f1.yards : fallbackYards;

        const props = [];
        const addProp = (yWorld, fn) => props.push({ y: yWorld, fn });

        // 11.1) 扫描每个可达庭院的非建筑外边缘，生成闭合的矮绿篱+石柱木护栏
        const gateHits = (yd, wx, wy) => (yd.gates || []).some(g => {
          const x1 = g.x1 ?? g[0], y1 = g.y1 ?? g[1], x2 = g.x2 ?? g[2], y2 = g.y2 ?? g[3];
          return wx >= Math.min(x1, x2) - 8 && wx <= Math.max(x1, x2) + 8 && wy >= Math.min(y1, y2) - 8 && wy <= Math.max(y1, y2) + 8;
        });
        const inAnyYard = (wx, wy) => activeYards.some(yd => ptInPolyWorld(yd.poly, wx, wy));
        for (const yd of activeYards) {
          const poly = yd.poly || [];
          for (let k = 0; k < poly.length; k++) {
            const ax = poly[k].x ?? poly[k][0], ay = poly[k].y ?? poly[k][1];
            const bx = poly[(k + 1) % poly.length].x ?? poly[(k + 1) % poly.length][0];
            const by = poly[(k + 1) % poly.length].y ?? poly[(k + 1) % poly.length][1];
            const horiz = Math.abs(ay - by) < 2;
            const vert = Math.abs(ax - bx) < 2;
            if (!horiz && !vert) continue;
            if (horiz) {
              const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), yFixed = Math.round((ay + by) / 2);
              const outY = ptInPolyWorld(poly, (x0 + x1) / 2, yFixed + 4) ? -1 : 1;
              let runStart = null;
              const flushH = (endX) => {
                if (runStart !== null && endX - runStart >= 12) {
                  const s0 = runStart, s1 = endX;
                  addProp(yFixed + (outY > 0 ? 8 : -2), () => stampPerimeterH(s0, s1, yFixed, outY));
                }
                runStart = null;
              };
              for (let sx = x0; sx < x1; sx += 8) {
                const mx = Math.min(x1 - 1, sx + 4);
                const testY = yFixed + outY * 12;
                const pxT = wxToPx(mx), pyT = wyToPy(testY);
                const touchesBldg = (pxT >= 0 && pxT < EW && pyT >= 0 && pyT < EH && bldg[pyT * EW + pxT]) || ptInPolyWorld(bldgPoly, mx, testY);
                const open = !touchesBldg && !inAnyYard(mx, testY) && !gateHits(yd, mx, yFixed);
                if (open && runStart === null) runStart = sx;
                else if (!open) flushH(sx);
              }
              flushH(x1);
            } else {
              const y0 = Math.min(ay, by), y1 = Math.max(ay, by), xFixed = Math.round((ax + bx) / 2);
              const outX = ptInPolyWorld(poly, xFixed + 4, (y0 + y1) / 2) ? -1 : 1;
              let runStart = null;
              const flushV = (endY) => {
                if (runStart !== null && endY - runStart >= 12) {
                  const s0 = runStart, s1 = endY;
                  const step = 52;
                  for (let cy = s0; cy < s1; cy += step) {
                    const seg0 = cy, seg1 = Math.min(s1, cy + step);
                    const isFirst = (cy === s0), isLast = (seg1 >= s1);
                    addProp(seg1, () => stampPerimeterV(xFixed, seg0, seg1, outX, isFirst, isLast, s0, s1));
                  }
                }
                runStart = null;
              };
              for (let sy = y0; sy < y1; sy += 8) {
                const my = Math.min(y1 - 1, sy + 4);
                const testX = xFixed + outX * 12;
                const pxT = wxToPx(testX), pyT = wyToPy(my);
                const touchesBldg = (pxT >= 0 && pxT < EW && pyT >= 0 && pyT < EH && bldg[pyT * EW + pxT]) || ptInPolyWorld(bldgPoly, testX, my);
                const open = !touchesBldg && !inAnyYard(testX, my) && !gateHits(yd, xFixed, my);
                if (open && runStart === null) runStart = sy;
                else if (!open) flushV(sy);
              }
              flushV(y1);
            }
          }
        }

        // 11.2) 完整视觉包围盒定义（世界像素），用于庭院登记与远景 100% 零遮挡守卫
        const visBoxForProp = (p) => {
          const [t, x, y, a, b] = p;
          if (t === 'tree') return { x: x - 36, y: y - 82, w: 72, h: 100 };
          if (t === 'pine') return { x: x - 30, y: y - 84, w: 60, h: 98 };
          if (t === 'bush') return { x: x - 20, y: y - 16, w: 40, h: 28 };
          if (t === 'rock') return { x: x - 18, y: y - 14, w: 36, h: 24 };
          if (t === 'lantern') return { x: x - 12, y: y - 34, w: 24, h: 54 };
          if (t === 'lamp') return { x: x - 14, y: y - 58, w: 28, h: 72 };
          if (t === 'bench') return { x: x - 4, y: y - 4, w: 72, h: 28 };
          if (t === 'fence') {
            const wLen = (!a || a <= 12) ? ((a || 4) - 1) * 24 + 8 : a;
            return { x: x - 4, y: y - 4, w: wLen + 8, h: 26 };
          }
          if (t === 'fenceV') return { x: x - 6, y: y - 4, w: 20, h: (a || 40) + 8 };
          if (t === 'hedge') return { x: x - 4, y: y - 12, w: (a || 64) + 8, h: 26 };
          if (t === 'flowers') return { x: x, y: y, w: a || 48, h: b || 32 };
          return { x: x - 16, y: y - 16, w: 32, h: 32 };
        };
        const boxesOverlap = (a, b, pad = 0) => (
          a.x - pad < b.x + b.w &&
          a.x + a.w + pad > b.x &&
          a.y - pad < b.y + b.h &&
          a.y + a.h + pad > b.y
        );
        const placedVisBoxes = [];
        // CQRD 花坛主体视觉禁区登记
        placedVisBoxes.push({ x: 234, y: 590, w: 324, h: 150 });
        // 跨溪木桥视觉禁区登记
        placedVisBoxes.push({ x: 2852, y: 582, w: 312, h: 80 });

        const queueProp = (p) => {
          const [t, x, y, a, b] = p;
          const px = wxToPx(x), py = wyToPy(y);
          if (t === 'flowers') {
            stampFlowers(px, py, Math.round((a || 48) / 2), Math.round((b || 32) / 2));
            return;
          }
          if (t === 'pebble') {
            fillRect(px, py, 3, 2, 35); fillRect(px, py, 2, 1, 37);
            return;
          }
          placedVisBoxes.push(visBoxForProp(p));
          if (t === 'tree') addProp(y, () => stampCanopyTree(px, py, a || 'oak'));
          else if (t === 'pine') addProp(y, () => stampPine(px, py));
          else if (t === 'bush') addProp(y, () => stampBush(px, py, a));
          else if (t === 'rock') addProp(y, () => stampRock(px, py, a));
          else if (t === 'lantern') addProp(y + 10, () => stampLantern(px, py));
          else if (t === 'lamp') addProp(y + 10, () => stampLamp(px, py));
          else if (t === 'fence') addProp(y + 20, () => stampFence(px, py, a));
          else if (t === 'fenceV') addProp(y + (a || 40), () => stampFenceV(px, py, a));
          else if (t === 'bench') addProp(y + 22, () => stampBench(px, py));
          else if (t === 'hedge') addProp(y + 6, () => stampHedge(px, py, Math.round((a || 64) / 2)));
        };

        // 绘制所有可达庭院内景物（与 layouts/f1.js 100% 同源）
        const yardPropSource = hasLiveYardProps ? f1.yards : fallbackYards;
        for (const yd of yardPropSource) {
          for (const p of (yd.props || [])) queueProp(p);
        }

        // 11.3) 远景背景框景装饰（经过建筑外墙+26px 裙边、电梯承台、可达庭院+周界绿篱与已放置景物的 100% 零重叠守卫）
        const forbiddenZones = [
          // 主建筑北翼（含北檐口 -20 与南墙地基裙边 +28）
          { x: -20, y: -20, w: 3496, h: 528 },
          // 主建筑南翼（含南墙地基裙边 +28）
          { x: 760, y: 480, w: 1940, h: 508 },
          // 西/东电梯翼楼及一体化花岗岩承台（含外扩余量）
          { x: westApron.x0 - 16, y: westApron.y0 - 16, w: westApron.w + 32, h: westApron.h + 36 },
          { x: eastApron.x0 - 16, y: eastApron.y0 - 16, w: eastApron.w + 32, h: eastApron.h + 36 }
        ];
        for (const yd of activeYards) {
          let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (const pt of (yd.poly || [])) {
            const px = pt.x ?? pt[0], py = pt.y ?? pt[1];
            if (px < x0) x0 = px; if (px > x1) x1 = px;
            if (py < y0) y0 = py; if (py > y1) y1 = py;
          }
          if (x1 > x0) forbiddenZones.push({ x: x0 - 28, y: y0 - 28, w: (x1 - x0) + 56, h: (y1 - y0) + 56 });
        }

        const farDecorCandidates = [
          // 北窗外园区林荫行道树与低矮景石灌木（全部保持 y <= -54，不碰北墙压顶）
          ['tree', -310, -16, 'oak'], ['pine', 360, -56], ['bush', 650, -52, 1], ['tree', 940, -58, 'oak'],
          ['bush', 1220, -52, 2], ['tree', 1480, -56, 'sakura'], ['rock', 1756, -52, 1], ['tree', 2020, -58, 'oak'],
          ['pine', 2540, -56], ['bush', 2890, -52, 1], ['tree', 3260, -56, 'sakura'], ['pine', 3760, -16],
          // 西电梯承台外侧园区绿地（错开 X/Y，彻底根除 bush 叠在 oak 头顶的问题）
          ['lantern', westApron.x0 - 52, westH.y + 56],
          ['bush', westApron.x0 - 144, westH.y + 24, 1],
          ['pine', westApron.x0 - 168, westH.y + 190],
          ['bush', westApron.x0 - 68, westApron.y0 + westApron.h + 52, 1],
          ['tree', westApron.x0 + 52, Math.max(442, westApron.y0 + westApron.h + 132), 'oak'],
          ['tree', -316, 566, 'sakura'], ['rock', -156, 650, 1], ['pine', -246, 768], ['bush', -156, 868, 2],
          // 东电梯承台外侧园区绿地（bush 与 oak 水平错开 148px，零重叠）
          ['lantern', eastApron.x0 + eastApron.w + 52, eastH.y + 56],
          ['bush', eastApron.x0 + eastApron.w + 144, eastH.y + 24, 2],
          ['bush', eastApron.x0 + eastApron.w - 48, eastApron.y0 + eastApron.h + 52, 2],
          ['tree', eastApron.x0 + eastApron.w + 100, Math.max(446, eastApron.y0 + eastApron.h + 136), 'oak'],
          ['tree', 3728, 624, 'sakura'], ['rock', 3652, 744, 1], ['pine', 3756, 858], ['bush', 3644, 920, 1],
          // 南侧园区远景生态林带（y >= 1084，完全避开南翼建筑裙边与庭院南护栏）
          ['tree', 220, 1112, 'oak'], ['bush', 490, 1086, 1], ['pine', 880, 1122], ['bush', 1290, 1092, 2],
          ['tree', 1728, 1134, 'sakura'], ['rock', 2120, 1096, 1], ['pine', 2520, 1122],
          ['bush', 2930, 1086, 2], ['tree', 3300, 1112, 'oak']
        ];

        let farPlaced = 0, farSkipped = 0;
        for (const cand of farDecorCandidates) {
          const vb = visBoxForProp(cand);
          if (forbiddenZones.some(fz => boxesOverlap(vb, fz, 0)) || placedVisBoxes.some(pb => boxesOverlap(vb, pb, 8))) {
            farSkipped++;
            continue;
          }
          farPlaced++;
          queueProp(cand);
        }

        props.sort((a, b) => a.y - b.y);
        for (const pr of props) pr.fn();

        // 12) 确保建筑镂空区严格透明、外景陆水区 100% 不透明，并清零全部 4-邻域孤立像素（及 8-邻域孤立描边噪点）
        for (let i = 0; i < grid.length; i++) {
          if (bldg[i]) grid[i] = 0;
          else if (!grid[i]) grid[i] = 20;
        }
        const isOutline = new Uint8Array(64);
        isOutline[8] = 1; isOutline[17] = 1; isOutline[24] = 1; isOutline[29] = 1; isOutline[34] = 1; isOutline[48] = 1;
        let strayFixed = 0;
        for (let pass = 0; pass < 5; pass++) {
          let passFixes = 0;
          for (let y = 0; y < EH; y++) {
            const row = y * EW;
            for (let x = 0; x < EW; x++) {
              const idx = row + x;
              if (bldg[idx]) continue;
              const v = grid[idx];
              const l = x > 0 ? grid[idx - 1] : 0;
              const r = x + 1 < EW ? grid[idx + 1] : 0;
              const u = y > 0 ? grid[idx - EW] : 0;
              const d = y + 1 < EH ? grid[idx + EW] : 0;
              if (l === v || r === v || u === v || d === v) continue;
              if (isOutline[v]) {
                const ul = (x > 0 && y > 0) ? grid[idx - EW - 1] : 0;
                const ur = (x + 1 < EW && y > 0) ? grid[idx - EW + 1] : 0;
                const dl = (x > 0 && y + 1 < EH) ? grid[idx + EW - 1] : 0;
                const dr = (x + 1 < EW && y + 1 < EH) ? grid[idx + EW + 1] : 0;
                if (ul === v || ur === v || dl === v || dr === v) continue;
              }
              const best = (l && (l === r || l === u || l === d)) ? l : ((u && (u === d || u === r)) ? u : (r || u || l || d || 20));
              grid[idx] = best;
              strayFixed++;
              passFixes++;
            }
          }
          if (!passFixes) break;
        }

        const cv = document.createElement('canvas');
        cv.width = EW; cv.height = EH;
        const cg = cv.getContext('2d');
        const img = cg.createImageData(EW, EH);
        const pal32 = new Uint32Array(EXT_PAL.length);
        const tmpB = new Uint8Array(4), tmpU = new Uint32Array(tmpB.buffer);
        for (let c = 0; c < EXT_PAL.length; c++) {
          tmpB[0] = palR[c]; tmpB[1] = palG[c]; tmpB[2] = palB[c]; tmpB[3] = palA[c];
          pal32[c] = tmpU[0];
        }
        const dst32 = new Uint32Array(img.data.buffer);
        for (let i = 0; i < grid.length; i++) dst32[i] = pal32[grid[i]];
        cg.putImageData(img, 0, 0);
        const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        return {
          cv, grid, w: EW, h: EH, pal: EXT_PAL,
          audit: { w: EW, h: EH, palCount: EXT_PAL.length - 1, buildMs: +(t1 - t0).toFixed(1), strayFixed, farPlaced, farSkipped }
        };
      }

      let cachedExt = null, cachedKey = '';
      const ensureExt = (f) => {
        const f1 = f || (root.WORLD && root.WORLD.floorById && root.WORLD.floorById(1)) || null;
        const hallSig = f1 && Array.isArray(f1.halls) ? f1.halls.map(h => `${h.side}:${h.x},${h.y},${h.w},${h.h}`).join('|') : 'default';
        const yardSig = f1 && Array.isArray(f1.yards)
          ? f1.yards.map(yd => {
              const poly = yd.poly || [];
              const p0 = poly.length ? `${poly[0].x ?? poly[0][0]},${poly[0].y ?? poly[0][1]}` : '';
              const pN = poly.length ? `${poly[poly.length - 1].x ?? poly[poly.length - 1][0]},${poly[poly.length - 1].y ?? poly[poly.length - 1][1]}` : '';
              const pr = (yd.props || []).map(p => p.join(',')).join(';');
              const pa = (yd.paths || []).map(p => ((Array.isArray(p) ? p : p.pts) || []).map(q => q.join(',')).join('/')).join(';');
              return `${yd.id}:${poly.length}:${p0}-${pN}:${pr}:${pa}`;
            }).join('|')
          : 'noyards';
        const key = `${hallSig}::${yardSig}`;
        if (!cachedExt || cachedKey !== key) {
          cachedExt = buildExteriorCanvas(f1);
          cachedKey = key;
        }
        return cachedExt;
      };
      function drawExterior(g, f, A, a) {
        if (typeof document === 'undefined') return;
        const cache = ensureExt(f);
        g.save();
        g.imageSmoothingEnabled = false;
        g.drawImage(cache.cv, a.x, a.y, a.w, a.h);
        g.restore();
      }
      drawExterior.getAuditInfo = () => ensureExt().audit;
      drawExterior.getCache = ensureExt;
      return drawExterior;
    })(),
    floorDecor(g, ox, oy, w, h, A) {
      // 中央涌泉中庭温润洞石地面镶边（低对比拼花，突出上方涌泉与花箱主体，严避 217,204,163±6）
      const FC = { cx: 1728, cy: 346 };
      const a = A.clipRect(ox, oy, w, h, { x: 1380, y: 176, w: 696, h: 344 });
      if (a) A.withClip(g, a, () => {
        const S = 16;
        for (let cy = Math.floor(a.y / S) * S; cy < a.y + a.h; cy += S) for (let cx = Math.floor(a.x / S) * S; cx < a.x + a.w; cx += S) {
          const dx = (cx + S / 2 - FC.cx) / 280, dy = (cy + S / 2 - FC.cy) / 148, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1 || d < 0.72) continue;
          if (d > 0.88) {
            A.R(g, cx, cy, S, S, '#9c683e');
            A.R(g, cx + 2, cy + 2, S - 4, S - 4, ((cx / S + cy / S) & 1) ? '#ba8254' : '#c68d5e');
          } else {
            A.R(g, cx, cy, S, S, '#bfb29e');
            A.R(g, cx + 2, cy + 2, S - 4, S - 4, '#f2ece0');
          }
        }
      });
      // 东西木地板与中庭洞石之间的黄铜收边压条
      for (const bx of [778, 2676]) {
        const b = A.clipRect(ox, oy, w, h, { x: bx, y: 112, w: 6, h: 368 });
        if (b) { A.R(g, b.x, b.y, b.w, b.h, '#8c683e'); A.R(g, b.x + 2, b.y, 2, b.h, '#e2b659'); }
      }
    },
    faceDecor(g, wl, top, bottom, A) {
      const x0 = wl.x, x1 = wl.x + wl.w, has = (a, b) => x0 <= a && x1 >= b;
      // 阳光烘焙餐厅取餐台正上方的木框餐牌（自动覆盖该开间采光窗）
      if (has(1740, 1876)) {
        A.R(g, 1740, top + 4, 132, 26, '#3b2618');
        A.R(g, 1744, top + 6, 124, 22, '#24332c');
        A.text(g, '今日 · 现烤可颂 / 手冲拿铁', 1806, top + 13, '#f5eee0', 9);
        A.text(g, '阳光烘焙餐厅 · 全天供应', 1806, top + 23, '#ffd166', 9);
      }
    },
    furniture: {
      cqrdbed: (function () {
        const W = 160, H = 72;
        const PAL = [
          null,
          '#ede1c9', '#e2d4be', '#8f7b70', '#2d2430', // 1..4: 暖米白洞石路缘（与冷灰紫深描边明确明暗/色相分离）
          '#bdf05c', '#82d44c', '#3d783d',             // 5..7: 晨光金叶女贞草毯
          '#ad6478', '#803b52', '#522138', '#2e1326',  // 8..11: 红檵木立体字与花境镶边
          '#72c94f', '#388a45', '#1b3847',             // 12..14: 修剪球形大叶黄杨
          '#ffd25a', '#f06f6a'                         // 15..16: 暖金/珊瑚点缀花簇
        ];
        const GLYPHS = [
          [ // C (26x15)
            '.....################.....',
            '...####################...',
            '..######################..',
            '.########........########.',
            '#######............#######',
            '######....................',
            '######....................',
            '######....................',
            '######....................',
            '######....................',
            '#######............#######',
            '.########........########.',
            '..######################..',
            '...####################...',
            '.....################.....'
          ],
          [ // Q (29x15)
            '.....################........',
            '...####################......',
            '..######################.....',
            '.########........########....',
            '#######............#######...',
            '######..............######...',
            '######..............######...',
            '######..............######...',
            '######..............######...',
            '######.....######...######...',
            '#######......######.######...',
            '.########.....###########....',
            '..#######################....',
            '...##################..#####.',
            '.....###############....#####'
          ],
          [ // R (26x15)
            '###################.......',
            '#####################.....',
            '#######################...',
            '######...........#######..',
            '######............#######.',
            '######............#######.',
            '######...........#######..',
            '#######################...',
            '#####################.....',
            '################..........',
            '######...#######..........',
            '######.....#######........',
            '######.......#######......',
            '######.........#######....',
            '######...........#######..'
          ],
          [ // D (26x15)
            '##################........',
            '####################......',
            '######################....',
            '######..........#######...',
            '######...........#######..',
            '######............#######.',
            '######............#######.',
            '######............#######.',
            '######............#######.',
            '######............#######.',
            '######...........#######..',
            '######..........#######...',
            '######################....',
            '####################......',
            '##################........'
          ]
        ];
        const BUSHES = {
          8: ['..1111..', '.111222.', '11222233', '11223333', '22333333', '.333333.'],
          10: ['...1111...', '.11112222.', '1112222233', '1122223333', '1222333333', '.22333333.', '..333333..']
        };
        function curbLeft(y) {
          if (y < 3 || y > 62) return 999;
          const arc = [18, 14, 11, 8, 6, 4, 3, 2, 2, 1, 1];
          if (y <= 13) return arc[y - 3];
          if (y <= 51) return 1;
          return arc[62 - y];
        }
        function buildGrid() {
          const grid = new Uint8Array(W * H);
          const at = (x, y) => (x >= 0 && x < W && y >= 0 && y < H) ? grid[y * W + x] : 0;
          const set = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) grid[y * W + x] = c; };
          const inPlan = (x, y) => { const l = curbLeft(y); return l < 999 && x >= l && x <= (W - 1) - l; };
          const inBed = (x, y) => {
            if (y < 7 || y > 58) return false;
            const l = curbLeft(y);
            return x >= l + 5 && x <= (W - 1) - l - 5;
          };
          // 1) 3/4 正交椭圆角洞石路缘立面（向下外扩 5px，贯通砖缝打破长平行带 + 底部深棕锚定线）
          for (let y = 3; y <= 62; y++) {
            const l = curbLeft(y), r = (W - 1) - l;
            for (let x = l; x <= r; x++) {
              const seam = x % 14 === 7;
              for (let d = 1; d <= 4; d++) set(x, y + d, seam ? 4 : 3);
              if (!inPlan(x, y + 5) && at(x, y + 5) === 0) set(x, y + 5, 4);
            }
          }
          // 2) 石材路缘顶面（左/上受光 #f6efdd，暖洞石本色 #e2d5b8，14px 节距石缝打破条带）
          for (let y = 3; y <= 62; y++) {
            const l = curbLeft(y), r = (W - 1) - l;
            for (let x = l; x <= r; x++) {
              if (inBed(x, y)) continue;
              const n4 = (!inPlan(x - 1, y) || !inPlan(x + 1, y) || !inPlan(x, y - 1) || !inPlan(x, y + 1));
              const nCorner = (!inPlan(x - 1, y - 1) || !inPlan(x + 1, y - 1) || !inPlan(x - 1, y + 1) || !inPlan(x + 1, y + 1));
              if (n4 || nCorner) { set(x, y, 4); continue; }
              const isSide = y >= 14 && y <= 51 && (x < l + 5 || x > r - 5);
              const joint = isSide ? (y % 10 === 4 || y % 10 === 5) : (x % 14 === 7);
              if (joint) set(x, y, 3);
              else if ((y <= 5 && x < 98) || (x <= l + 2 && y < 48) || (y >= 60 && y <= 61 && x < 72)) set(x, y, 1);
              else set(x, y, 2);
            }
          }
          // 3) 对称式模纹花坛：南北红檵木花境镶边 + 中央晨光金叶女贞草毯（2px 叶簇，无孤立噪点）
          const wave = (x, seed) => ((((x >> 2) * 13 + (x >> 3) * 7 + seed) % 5) === 0 ? 1 : 0);
          const zoneAt = (x, y) => {
            const wx = x & ~1;
            if (y <= 13 + wave(wx, 1)) return 0;   // 北红檵木镶边
            if (y <= 45 + wave(wx, 2)) return 1;   // 中央金叶女贞草毯
            return 2;                              // 南红檵木镶边
          };
          for (let y = 7; y <= 58; y++) {
            for (let x = 2; x < W - 2; x += 2) {
              const z = zoneAt(x, y), lime = (z === 1);
              const isTopEdge = y === 7 || zoneAt(x, y - 1) !== z;
              const isBotEdge = y === 58 || zoneAt(x, y + 1) !== z;
              const h = (((x >> 1) * 73856093) ^ (y * 19349663)) & 31;
              const hiSeg = (((x >> 2) * 11 + y * 5) % 3) === 0;
              const shSeg = (((x >> 2) * 7 + y * 3) % 4) === 0;
              const nearWall = y === 7 || !inBed(x - 1, y) || !inBed(x - 2, y);
              let col;
              if (lime) {
                if (isTopEdge && hiSeg) col = 5;
                else if (isBotEdge && shSeg) col = 7;
                else if (h === 0 || (isTopEdge && ((x >> 1) % 3 === 0))) col = 5;
                else col = 6;
              } else {
                if (nearWall && shSeg) col = 10;
                else if (isTopEdge && hiSeg) col = 8;
                else if (isBotEdge && shSeg) col = 10;
                else if (h === 2) col = 10;
                else col = 9;
              }
              if (inBed(x, y)) set(x, y, col);
              if (inBed(x + 1, y)) set(x + 1, y, col);
            }
          }
          // 4) 居中大号立体修剪字「C Q R D」（15px 高大字号 + 2px 立体侧壁 + 1px 草毯阴影）
          let gx = 17;
          const gy = 21;
          for (let gi = 0; gi < GLYPHS.length; gi++) {
            const rows = GLYPHS[gi], gw = rows[0].length, gh = rows.length;
            const on = (r, c) => r >= 0 && r < gh && c >= 0 && c < gw && rows[r][c] === '#';
            const hasLowerBody = (r, c) => { for (let k = r + 2; k < gh; k++) if (on(k, c)) return true; return false; };
            for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
              if (!on(r, c) || hasLowerBody(r, c)) continue;
              const px = gx + c, py = gy + r;
              if (inBed(px, py + 3) && !on(r + 3, c)) set(px, py + 3, 7);
              if (inBed(px + 1, py + 3) && !on(r + 3, c + 1)) set(px + 1, py + 3, 7);
            }
            for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
              if (!on(r, c)) continue;
              const px = gx + c, py = gy + r;
              if (!on(r + 1, c) && inBed(px, py + 1)) set(px, py + 1, 10);
              if (!hasLowerBody(r, c) && !on(r + 1, c) && !on(r + 2, c) && inBed(px, py + 2)) set(px, py + 2, 11);
            }
            const isLit = (r, c) => on(r, c) && (!on(r - 1, c) || !on(r, c - 1));
            for (let r = 0; r < gh; r++) for (let c = 0; c < gw; c++) {
              if (!on(r, c)) continue;
              set(gx + c, gy + r, isLit(r, c) ? 8 : 9);
            }
            for (let r = 1; r < gh - 1; r++) for (let c = 1; c < gw - 2; c += 2) {
              if (on(r, c) && on(r, c + 1) && !isLit(r, c) && !isLit(r, c + 1) && ((c + r * 3) % 7 === 0)) {
                set(gx + c, gy + r, 10); set(gx + c + 1, gy + r, 10);
              }
            }
            gx += gw + 6;
          }
          // 5) 对称八株修剪球形大叶黄杨（北沿 4 株 + 东西两壁各 1 株 + 南缘两隅各 1 株）+ 2×2 花簇
          const shrubs = [
            [26, 0, 10], [60, 0, 10], [90, 0, 10], [124, 0, 10],
            [0, 28, 10], [150, 28, 10],
            [20, 48, 8], [132, 48, 8]
          ];
          const bushAt = new Uint8Array(W * H);
          for (const [bx, by, sz] of shrubs) {
            const mask = BUSHES[sz], bh = mask.length, bw = mask[0].length;
            for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) {
              if (mask[r][c] === '.') continue;
              const px = bx + c, py = by + r;
              if (inBed(px + 1, py + 1)) {
                const z = zoneAt(px + 1, py + 1);
                set(px + 1, py + 1, z === 1 ? 7 : 11);
              }
            }
            for (let r = 0; r < bh; r++) for (let c = 0; c < bw; c++) {
              const ch = mask[r][c];
              if (ch === '.') continue;
              const px = bx + c, py = by + r;
              set(px, py, ch === '1' ? 12 : ch === '2' ? 13 : 14);
              if (px >= 0 && px < W && py >= 0 && py < H) bushAt[py * W + px] = 1;
            }
          }
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (!bushAt[y * W + x]) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              if (!dx && !dy) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < W && ny >= 0 && ny < H && at(nx, ny) === 0) set(nx, ny, 4);
            }
          }
          for (const [fx, fy, fc] of [
            [14, 10, 15], [46, 9, 16], [79, 9, 15], [112, 9, 16], [144, 10, 15],
            [14, 52, 16], [48, 52, 15], [79, 52, 16], [110, 52, 15], [144, 52, 16]
          ]) {
            if (inBed(fx, fy) && inBed(fx + 1, fy + 1)) {
              set(fx, fy, fc); set(fx + 1, fy, fc); set(fx, fy + 1, fc); set(fx + 1, fy + 1, fc);
            }
          }
          // 6) 清零全图 4-邻域孤立单像素（排除外轮廓 4）
          for (let pass = 0; pass < 3; pass++) {
            for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
              const v = at(x, y);
              if (v === 0 || v === 4) continue;
              if (at(x - 1, y) === v || at(x + 1, y) === v || at(x, y - 1) === v || at(x, y + 1) === v) continue;
              const counts = new Map();
              for (const nv of [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)]) {
                if (nv > 0) counts.set(nv, (counts.get(nv) || 0) + 1);
              }
              let best = 0, bestScore = -1;
              for (const [nv, n] of counts) {
                const score = n * 10 + (nv === 4 ? 0 : 2);
                if (score > bestScore) { best = nv; bestScore = score; }
              }
              if (best) set(x, y, best);
            }
          }
          return { w: W, h: H, pal: PAL, grid };
        }
        let cached = null;
        function draw(g, f, A) {
          if (!cached) {
            const { w, h, pal, grid } = buildGrid();
            if (typeof document !== 'undefined') {
              const cv = document.createElement('canvas');
              cv.width = w; cv.height = h;
              const cg = cv.getContext('2d');
              const img = cg.createImageData(w, h), data = img.data;
              const rgba = pal.map(hex => hex ? [
                parseInt(hex.slice(1, 3), 16),
                parseInt(hex.slice(3, 5), 16),
                parseInt(hex.slice(5, 7), 16), 255
              ] : [0, 0, 0, 0]);
              for (let i = 0; i < grid.length; i++) {
                const p = rgba[grid[i]];
                data[i * 4] = p[0]; data[i * 4 + 1] = p[1]; data[i * 4 + 2] = p[2]; data[i * 4 + 3] = p[3];
              }
              cg.putImageData(img, 0, 0);
              cached = { cv, w, h };
            } else {
              cached = { pal, grid, w, h };
            }
          }
          const iw = Math.max(1, Math.round(f.w / cached.w)) * cached.w;
          const ih = Math.max(1, Math.round(f.h / cached.h)) * cached.h;
          const rx = Math.round(f.x), ry = Math.round(f.y);
          const rw = Math.abs(f.w - iw) <= 2 ? iw : Math.round(f.w);
          const rh = Math.abs(f.h - ih) <= 2 ? ih : Math.round(f.h);
          if (cached.cv) {
            g.save();
            g.imageSmoothingEnabled = false;
            g.drawImage(cached.cv, rx, ry, rw, rh);
            g.restore();
          } else {
            const sx = rw / cached.w, sy = rh / cached.h;
            for (let y = 0; y < cached.h; y++) for (let x = 0; x < cached.w; x++) {
              const c = cached.pal[cached.grid[y * cached.w + x]];
              if (c) A.R(g, rx + Math.round(x * sx), ry + Math.round(y * sy), Math.ceil(sx), Math.ceil(sy), c);
            }
          }
        }
        draw.buildGrid = buildGrid;
        return draw;
      })()
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
