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

      function buildExteriorCanvas(f) {
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const f1 = f || (root.WORLD && root.WORLD.floorById && root.WORLD.floorById(1)) || null;
        const westH = (f1 && Array.isArray(f1.halls) && f1.halls.find(h => h.side === 'left')) || { x: -144, y: 128, w: 144, h: 112 };
        const eastH = (f1 && Array.isArray(f1.halls) && f1.halls.find(h => h.side === 'right')) || { x: 3456, y: 128, w: 144, h: 112 };
        const wPlazaY0 = westH.y - 84, wPlazaY1 = westH.y + westH.h + 88;
        const ePlazaY0 = eastH.y - 84, ePlazaY1 = eastH.y + eastH.h + 88;
        const grid = new Uint8Array(EW * EH);
        const land = new Uint8Array(EW * EH);
        const wall = new Uint8Array(EW * EH);
        const pset = (x, y, c) => {
          if (x >= 0 && x < EW && y >= 0 && y < EH && c) grid[y * EW + x] = c;
        };
        const pat = (x, y) => (x >= 0 && x < EW && y >= 0 && y < EH) ? grid[y * EW + x] : 0;
        const fillDisc = (cx, cy, rx, ry, c) => {
          const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(EW - 1, Math.ceil(cx + rx));
          const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(EH - 1, Math.ceil(cy + ry));
          for (let y = y0; y <= y1; y++) {
            const dy = (y - cy) / ry;
            for (let x = x0; x <= x1; x++) {
              const dx = (x - cx) / rx;
              if (dx * dx + dy * dy <= 1) grid[y * EW + x] = c;
            }
          }
        };
        const fillRect = (x, y, w, h, c) => {
          const x0 = Math.max(0, x), x1 = Math.min(EW, x + w);
          const y0 = Math.max(0, y), y1 = Math.min(EH, y + h);
          for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) grid[yy * EW + xx] = c;
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

        // 2) 全域写实地面园区基底（land=1），仅在东南庭院跨桥处开凿一湾自然蜿蜒的镜面景观锦鲤溪池！
        //    东南露台西岸 x<=1756（wx<=2872），樱花岛东岸 x>=1895（wx>=3150），南北水湾 y=396..576（wy=472..832）。
        for (let y = 0; y < EH; y++) {
          const row = y * EW;
          const wob = Math.round(3 * Math.sin(y * 0.07) + 2 * Math.cos(y * 0.13));
          for (let x = 0; x < EW; x++) {
            let inPond = false;
            if (x >= 1758 + wob && x <= 1894 + wob && y >= 404 && y <= 574) {
              // 水池南北两端收圆，东侧环抱樱花庭院西缘
              const ny = y < 424 ? (424 - y) / 20 : (y > 550 ? (y - 550) / 24 : 0);
              const halfW = 66 * Math.sqrt(Math.max(0, 1 - ny * ny));
              const midX = 1826 + wob;
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
            const inBldg = (x >= 320 && x <= 2048 && y >= 160 && y < 400) || (x >= 710 && x <= 1660 && y >= 400 && y < 640);
            if (inBldg) continue;
            if (land[i]) {
              const n = fastNoise(x, y) * 0.72 + fastNoise(((x * 3) + 41) % (EW - 20), ((y * 3) + 29) % (EH - 20)) * 0.28;
              let c = n < 0.34 ? 19 : (n < 0.70 ? 20 : 21);
              // 景观池岸石材压边
              if ((y + 1 < EH && !land[i + EW]) || (y > 0 && !land[i - EW]) || !land[i - 1] || !land[i + 1]) {
                c = ((x + y) & 2) ? 37 : 36;
              }
              const nearSouthWall = (x >= 320 && x <= 2048 && y >= 400 && y <= 408 && x < 710) ||
                                    (x >= 710 && x <= 1660 && y >= 640 && y <= 648) ||
                                    (x >= 1660 && x <= 2048 && y >= 400 && y <= 408);
              const nearWestHallWall = (x >= 700 && x < 710 && y >= 400 && y <= 640);
              const nearEastHallWall = (x > 1660 && x <= 1670 && y >= 400 && y <= 640);
              if (nearSouthWall || nearWestHallWall || nearEastHallWall) {
                const depth = Math.min(
                  nearSouthWall ? (y <= 408 ? y - 400 : y - 640) : 99,
                  nearWestHallWall ? (710 - x) : 99,
                  nearEastHallWall ? (x - 1660) : 99
                );
                if (depth <= 3) c = 18;
                else if (depth <= 6) c = 19;
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

        // 5.5) 东西电梯厅迎宾花岗岩广场 + 南北园区石板步道（彻底消除电梯厅悬在海面或压在樱花树冠上的违和感）
        const stampStonePlaza = (px0, py0, pw, ph) => {
          fillRect(px0 - 2, py0 - 2, pw + 4, ph + 4, 34);
          fillRect(px0, py0, pw, ph, 35);
          const tw = 16, th = 12;
          for (let ty = py0 + 2, r = 0; ty < py0 + ph - 2; ty += th, r++) {
            const off = (r & 1) ? 8 : 0;
            for (let tx = px0 + 2 - off; tx < px0 + pw - 2; tx += tw) {
              const x0 = Math.max(px0 + 2, tx), x1 = Math.min(px0 + pw - 2, tx + tw - 1);
              const y1 = Math.min(py0 + ph - 2, ty + th - 1);
              if (x1 - x0 < 3 || y1 - ty < 3) continue;
              const h = hash2(tx, ty);
              fillRect(x0, ty, x1 - x0, y1 - ty, h > 0.6 ? 37 : 36);
              if (h < 0.35) fillRect(x0, ty, Math.min(6, x1 - x0), 1, 46);
            }
          }
        };
        // 西电梯门厅外广场（随 f.halls 动态对齐）与南向连接园区步道
        stampStonePlaza(wxToPx(westH.x - 164), wyToPy(wPlazaY0), Math.round((westH.w + 168) / 2), Math.round((wPlazaY1 - wPlazaY0) / 2));
        stampStonePlaza(wxToPx(westH.x - 36), wyToPy(wPlazaY1 - 8), 44, Math.max(48, Math.round((676 - (wPlazaY1 - 8)) / 2)));
        // 东电梯门厅外广场（随 f.halls 动态对齐）与南向连接园区步道
        stampStonePlaza(wxToPx(eastH.x - 4), wyToPy(ePlazaY0), Math.round((eastH.w + 168) / 2), Math.round((ePlazaY1 - ePlazaY0) / 2));
        stampStonePlaza(wxToPx(eastH.x + 56), wyToPy(ePlazaY1 - 8), 44, 104);
        // 南翼外侧园区景观横轴石板漫步道（wy=988..1040）
        stampStonePlaza(wxToPx(680), wyToPy(988), 1040, 26);

        // 6) 园区庭院暖砂砾石园路（闭环环绕西南 CQRD 花坛并衔接出入口台阶，东侧连接露台、木桥与樱花庭院）
        const paths = [
          // 西电梯南步道 -> 西南 CQRD 花坛南环 -> 东侧北上接 [600..720,480] 大堂庭院台阶
          [[252, 496, 9], [364, 504, 9], [416, 556, 10], [492, 568, 10], [576, 568, 10], [642, 552, 9], [674, 514, 9], [662, 446, 9], [652, 398, 9]],
          // CQRD 花坛北沿对称观赏园路
          [[368, 500, 8], [392, 462, 8], [432, 438, 8], [520, 434, 8], [602, 436, 8], [662, 446, 8]],
          // 东南露台双门 -> 跨溪木桥西桥头
          [[1694, 398, 8], [1698, 432, 8], [1720, 458, 8], [1754, 470, 9]],
          [[1660, 488, 8], [1704, 482, 8], [1754, 470, 9]],
          // 樱花庭院东桥头环径
          [[1896, 468, 8], [1942, 476, 9], [1988, 494, 8], [2012, 472, 7], [1986, 448, 7]]
        ];
        let bestRad = 0;
        const pathDistSq = (px, py, pts) => {
          let best = 1e9, rad = 0;
          for (let s = 0; s < pts.length - 1; s++) {
            const [x1, y1, r1] = pts[s], [x2, y2, r2] = pts[s + 1];
            const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy || 1;
            const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2));
            const cx = x1 + vx * t, cy = y1 + vy * t;
            const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
            if (d2 < best) { best = d2; rad = r1 + (r2 - r1) * t; }
          }
          bestRad = rad;
          return best;
        };
        for (const pts of paths) {
          let minX = EW, maxX = 0, minY = EH, maxY = 0;
          for (const [px, py, r] of pts) {
            minX = Math.min(minX, px - r - 6); maxX = Math.max(maxX, px + r + 6);
            minY = Math.min(minY, py - r - 6); maxY = Math.max(maxY, py + r + 6);
          }
          minX = Math.max(0, Math.floor(minX)); maxX = Math.min(EW - 1, Math.ceil(maxX));
          minY = Math.max(0, Math.floor(minY)); maxY = Math.min(EH - 1, Math.ceil(maxY));
          for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
              const i = y * EW + x;
              if (!land[i]) continue;
              const inBldg = (x >= 320 && x <= 2048 && y >= 160 && y < 400) || (x >= 710 && x <= 1660 && y >= 400 && y < 640);
              if (inBldg) continue;
              const d2 = pathDistSq(x, y, pts);
              const rad = bestRad;
              if (d2 > (rad + 2.5) * (rad + 2.5)) continue;
              const d = Math.sqrt(d2);
              const edgeJitter = (smoothNoise(x, y, 6) - 0.5) * 2.4;
              const dr = d + edgeJitter;
              if (dr <= rad) {
                if (dr > rad - 1.4) grid[i] = 13;
                else if (dr < rad * 0.45 && smoothNoise(x + 17, y + 9, 8) > 0.48) grid[i] = 16;
                else grid[i] = 15;
              }
            }
          }
        }

        // 7) 修剪草坪细节点缀（成团草芽与低密度园区野花，严禁单像素噪点）
        for (let y = 16; y < EH - 16; y += 11) {
          for (let x = 16; x < EW - 16; x += 13) {
            const h = hash2(x, y);
            const px = x + Math.floor(h * 7) - 3, py = y + Math.floor(hash2(y, x) * 5) - 2;
            if (px < 4 || px >= EW - 6 || py < 4 || py >= EH - 6) continue;
            const i = py * EW + px;
            if (!land[i] || grid[i] < 19 || grid[i] > 21) continue;
            if (px >= 432 && px <= 604 && py >= 450 && py <= 536) continue;
            if (h < 0.22) {
              pset(px, py, 22); pset(px + 1, py, 22); pset(px, py - 1, 23);
              pset(px + 2, py + 1, 19);
            } else if (h > 0.91) {
              const fc = h > 0.97 ? 44 : 43;
              pset(px, py - 1, fc); pset(px, py + 1, fc);
              pset(px - 1, py, fc); pset(px + 1, py, fc);
              pset(px, py, 42);
            }
          }
        }

        // 8) 嵌入西南前庭核心「CQRD」立体模纹花坛（160×72 原生网格精确压入 px=438, py=457）
        const cqFn = L.themes?.[1]?.furniture?.cqrdbed || f.theme?.furniture?.cqrdbed;
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

        // 9) 景观构件绘制函数
        const stampBridge = (px, py, pw, ph) => {
          for (let bx = 0; bx < pw; bx++) {
            const sd = (bx % 9 === 4) ? 2 : 3;
            fillRect(px + bx, py + ph + 1, 1, sd, (bx % 8 < 2) ? 2 : 1);
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

        const stampFence = (px, py, posts) => {
          const step = 12;
          for (let k = 0; k < posts; k++) {
            const fx = px + k * step;
            fillRect(fx + 1, py + 9, 4, 2, 18);
            fillRect(fx, py, 4, 10, 29);
            fillRect(fx + 1, py + 1, 2, 8, 31);
            pset(fx + 1, py + 1, 33); pset(fx + 2, py + 1, 32);
            if (k < posts - 1) {
              fillRect(fx + 4, py + 3, 8, 2, 29);
              fillRect(fx + 4, py + 4, 8, 1, 32);
              fillRect(fx + 4, py + 6, 8, 2, 29);
              fillRect(fx + 4, py + 7, 8, 1, 30);
            }
          }
        };

        const stampLantern = (px, py) => {
          fillDisc(px, py + 6, 6, 3, 18);
          fillRect(px - 2, py + 3, 5, 4, 34);
          fillRect(px - 1, py + 4, 3, 2, 36);
          fillRect(px - 1, py - 6, 3, 10, 29);
          pset(px, py - 5, 31); pset(px, py - 3, 31);
          fillRect(px - 3, py - 12, 7, 7, 29);
          fillRect(px - 2, py - 11, 5, 5, 42);
          fillRect(px - 1, py - 10, 3, 3, 43);
          fillRect(px - 4, py - 14, 9, 2, 34);
          fillRect(px - 2, py - 15, 5, 1, 36);
        };

        const stampRock = (px, py, large) => {
          const rx = large ? 8 : 6, ry = large ? 6 : 4;
          fillDisc(px + 1, py + 3, rx, ry - 1, 18);
          fillDisc(px, py, rx, ry, 34);
          fillDisc(px, py - 1, rx - 1, ry - 1, 35);
          fillDisc(px - 1, py - 2, rx - 2, ry - 2, 36);
          fillDisc(px - 2, py - 3, Math.max(2, rx - 4), Math.max(1, ry - 3), 37);
          pset(px + 2, py + 1, 19); pset(px + 3, py + 1, 20);
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
            pset(px - 3, py - 3, fc); pset(px - 2, py - 3, fc);
            pset(px + 3, py - 1, fc); pset(px + 4, py - 1, fc);
          }
        };

        const stampLotus = (px, py, flower) => {
          if (pat(px, py) > 7) return; // 仅在东南水池内绘制睡莲
          fillDisc(px, py, 6, 3, 19);
          fillDisc(px - 1, py - 1, 4, 2, 21);
          pset(px + 3, py - 1, 3);
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
              if (pat(px + ox, py + oy) >= 18) { pset(px + ox, py + oy, 27); pset(px + ox + 1, py + oy, 26); }
            }
          }
          fillRect(px - 3, py - 14, 6, 16, 29);
          fillRect(px - 2, py - 13, 4, 14, 30);
          fillRect(px - 2, py - 10, 2, 10, 31);
          fillRect(px - 4, py - 1, 2, 3, 29);
          fillRect(px + 2, py - 1, 2, 3, 29);
          fillRect(px - 3, py - 14, 6, 4, 29);
          const cPal = kind === 'sakura'
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

        // 10) 东南镜面水池跨溪原木景观桥与池内睡莲
        stampBridge(wxToPx(2860), wyToPy(590), 148, 32);
        for (const [lx, ly, fl] of [[2960, 520, 1], [3040, 545, 0], [2950, 710, 1], [3030, 760, 0]]) {
          stampLotus(wxToPx(lx), wyToPy(ly), fl);
        }

        // 11) 按 Y 坐标由远及近绘制庭院景物（彻底移走曾被东西电梯厅硬截断的 [-110,250]/[3540,240] 樱花树）
        const props = [];
        const addProp = (yWorld, fn) => props.push({ y: yWorld, fn });

        addProp(524, () => stampFence(wxToPx(148), wyToPy(514), 5));

        addProp(624, () => stampLantern(wxToPx(70), wyToPy(614)));
        addProp(782, () => stampLantern(wxToPx(642), wyToPy(772)));
        addProp(580, () => stampLantern(wxToPx(3160), wyToPy(570)));
        addProp(wPlazaY0 + 16, () => stampLantern(wxToPx(westH.x - 108), wyToPy(wPlazaY0 + 16)));
        addProp(ePlazaY0 + 16, () => stampLantern(wxToPx(eastH.x + eastH.w + 108), wyToPy(ePlazaY0 + 16)));

        for (const [rx, ry, big] of [
          [92, 762, 1], [712, 688, 0], [186, 818, 0],
          [2800, 710, 1], [3220, 710, 1], [3440, 630, 0]
        ]) addProp(ry, () => stampRock(wxToPx(rx), wyToPy(ry), big));

        for (const [bx, by, br] of [
          [84, 584, 2], [326, 534, 1], [538, 534, 2], [702, 644, 1],
          [268, 812, 1], [602, 810, 2],
          [3250, 560, 2], [3420, 686, 1], [westH.x - 116, wPlazaY1 + 36, 1], [eastH.x + eastH.w + 100, ePlazaY1 + 36, 2]
        ]) addProp(by, () => stampBush(wxToPx(bx), wyToPy(by), br));

        for (const [tx, ty, type] of [
          // 北侧园区林荫行道树（窗外真实绿景）
          [westH.x - 112, wPlazaY0 - 20, 'oak'], [380, -34, 'pine'], [960, -36, 'oak'], [1480, -34, 'sakura'],
          [2020, -36, 'oak'], [2540, -34, 'pine'], [3280, -34, 'sakura'], [eastH.x + eastH.w + 112, ePlazaY0 - 20, 'pine'],
          // 东西电梯广场南外侧行道树（动态避开东西电梯翼楼及迎宾广场）
          [westH.x - 116, Math.max(456, wPlazaY1 + 128), 'oak'], [eastH.x + eastH.w + 100, Math.max(456, ePlazaY1 + 128), 'oak'],
          // 西南 CQRD 前庭景观树（与 yards[0].blocks 同源）
          [116, 560, 'sakura'], [740, 560, 'pine'], [138, 804, 'oak'], [676, 800, 'sakura'],
          // 东南樱花庭院景观树（与 yards[1].blocks 同源）
          [2810, 562, 'pine'], [3290, 592, 'sakura'], [3420, 694, 'oak'], [3240, 720, 'pine'],
          // 南侧园区林带远景树
          [920, 1130, 'oak'], [1728, 1140, 'sakura'], [2480, 1130, 'pine']
        ]) addProp(ty, () => {
          const px = wxToPx(tx), py = wyToPy(ty);
          if (type === 'pine') stampPine(px, py);
          else stampCanopyTree(px, py, type);
        });

        props.sort((a, b) => a.y - b.y);
        for (const pr of props) pr.fn();

        // 12) 消除 4-邻域孤立单像素
        let strayFixed = 0;
        for (let pass = 0; pass < 4; pass++) {
          for (let y = 1; y < EH - 1; y++) {
            const row = y * EW;
            for (let x = 1; x < EW - 1; x++) {
              const v = grid[row + x];
              if (!v || v === 8 || v === 17 || v === 24 || v === 29 || v === 34 || v === 48) continue;
              if (grid[row + x - 1] === v || grid[row + x + 1] === v || grid[row - EW + x] === v || grid[row + EW + x] === v) continue;
              const l = grid[row + x - 1], r = grid[row + x + 1], u = grid[row - EW + x], d = grid[row + EW + x];
              const best = (l && (l === r || l === u || l === d)) ? l : ((u && (u === d || u === r)) ? u : (r || u || l || d));
              if (best) { grid[row + x] = best; strayFixed++; }
              else { grid[row + x] = 0; strayFixed++; }
            }
          }
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
          audit: { w: EW, h: EH, palCount: EXT_PAL.length - 1, buildMs: +(t1 - t0).toFixed(1), strayFixed }
        };
      }

      let cachedExt = null, cachedKey = '';
      const ensureExt = (f) => {
        const f1 = f || (root.WORLD && root.WORLD.floorById && root.WORLD.floorById(1)) || null;
        const key = f1 && Array.isArray(f1.halls) ? f1.halls.map(h => `${h.side}:${h.x},${h.y}`).join('|') : 'default';
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
