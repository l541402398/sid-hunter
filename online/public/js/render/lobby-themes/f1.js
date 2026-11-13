'use strict';
// 1F · 晨光迎宾厅 主题：暖木迎宾 / 米白石板中庭 / 赤陶格砖烘焙坊 / 拼花市集。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const woodA = { base: '#c58b52', hi: '#d49a5f', lo: '#b27a45', gap: '#8a5a32', grain: '#a96f3d' };
  const woodB = { base: '#b9804a', hi: '#c78e55', lo: '#a5703e', gap: '#7c4f2b', grain: '#9c6738' };
  const woodC = { base: '#ab7444', hi: '#b67e4b', lo: '#a26d3f', gap: '#7e5130', grain: '#94603a' };
  const stoneP = { tones: ['#e6d9bd', '#ded0b1', '#eadfc6', '#d8c8a6'], grout: '#b8a581', hi: '#f3ead6', lo: '#c9b793' };
  const FOUNTAIN = { cx: 1260, cy: 326 };
  L.register(1, {
    zones: [
      { x: 0, y: 0, w: 700, h: 420, mat: 'planks', pal: woodA, seed: 11 },
      { x: 700, y: 0, w: 1480, h: 544, mat: 'stone', pal: stoneP, seed: 3 },
      { x: 2180, y: 0, w: 700, h: 420, mat: 'planks', pal: woodB, seed: 23 },
      { x: 700, y: 544, w: 1480, h: 16, mat: 'planks', pal: woodA, seed: 31 },
      { x: 700, y: 560, w: 480, h: 240, mat: 'planks', pal: woodC, seed: 41 },
      { x: 1196, y: 560, w: 504, h: 240, mat: 'checker', pal: { a: '#efdcb4', b: '#cf8460', grout: '#a8644a', aHi: '#f8ebcb', bHi: '#dc9670', aLo: '#dcc596', bLo: '#b86f4f' } },
      { x: 1716, y: 560, w: 464, h: 240, mat: 'parquet', pal: woodC }
    ],
    rugs: [
      { x: 80, y: 330, w: 350, h: 80, fill: '#3e6a68', band: '#2f5250', trim: '#d9b46a', motif: '#e8cf8c', fringe: '#efe2bf' },
      { x: 2210, y: 316, w: 330, h: 90, fill: '#6e7c3c', band: '#566230', trim: '#efd9a0', motif: '#f3e3b0', fringe: '#f4e9c8' },
      { x: 760, y: 676, w: 270, h: 96, fill: '#8c3d3a', band: '#6e2e2c', trim: '#e7c27a', motif: '#f0d596', fringe: '#f2e3c2' }
    ],
    windows: [560, 820, 1240, 1640, 2120, 2460, 2780], windowStyle: 'arch',
    sconces: [700, 1160, 1720, 2180],
    frames: [[150, 'land'], [1860, 'sea'], [2300, 'flower']],
    plaque: { x: 1440, text: '晨光溪谷厅 · 临水迎宾', w: 168 },
    exterior: (g, f, A, a) => {
      // 溪谷花洲迎宾岛：碧绿河岸草甸 + 西南不可达迎宾草坪与 CQRD 花坛 + 环岛清溪 + 原木拱桥
      A.R(g, a.x, a.y, a.w, a.h, '#4fa6c4');
      // 柔和溪流水波（宽间距大色块，舒适不晃眼）
      for (let y = a.y + 12; y < a.y + a.h; y += 28) {
        const shift = ((Math.floor(y / 28) % 2) * 36);
        for (let x = a.x + shift; x < a.x + a.w; x += 72) {
          A.R(g, x, y, 28, 3, '#68bce0');
          A.R(g, x + 8, y - 2, 12, 2, '#92d6f0');
        }
      }
      // 贴近建筑边缘的翠绿溪岸草洲与暖石亲水护岸（西岸北段停于 y=420，为西南迎宾草坪留出连续庭院）
      for (const [bx, by, bw, bh] of [[-120, -60, 820, 480], [2180, -60, 820, 520], [700, 400, 1540, 440]]) {
        A.R(g, bx - 10, by - 10, bw + 20, bh + 20, '#dfd2b4');
        A.R(g, bx, by, bw, bh, '#68a852');
      }
      // 西南不可达「迎宾草坪洲」（x=44..700, y=424..756，避开右侧公告栏 HUD，整块直呈于 1F 西南外侧）
      {
        const lx = 44, ly = 424, lw = 656, lh = 332;
        const lawnDark = '#3b7336', lawnMid = '#589c48', lawnBand = '#529343', lawnLight = '#74b858';
        // 亲水溪岸投影与 3/4 暖石护岸壁（西侧自 y=424 连贯承接北段河岸，底端砌块缝打破长平行条带）
        A.R(g, lx - 16, ly + 8, lw + 8, lh + 14, '#3889a8');
        A.R(g, lx - 12, ly, 12, lh + 18, '#7c674e');
        A.R(g, lx - 10, ly, 8, lh + 14, '#b8a483');
        A.R(g, lx - 12, ly + lh, lw + 2, 18, '#7c674e');
        A.R(g, lx - 10, ly + lh + 2, lw - 2, 12, '#b8a483');
        for (let sx = lx + 12; sx < lx + lw - 12; sx += 24) A.R(g, sx, ly + lh + 2, 2, 12, '#7c674e');
        A.R(g, lx - 12, ly + lh - 6, lw, 8, '#dfd2b4');
        A.R(g, lx - 12, ly + lh - 6, lw, 2, '#f6efdd');
        A.R(g, lx - 12, ly, 8, lh + 2, '#dfd2b4');
        A.R(g, lx - 12, ly, 2, lh + 2, '#f6efdd');
        // 修剪草坪底色 + 低对比南北交替割草条纹
        A.R(g, lx, ly, lw, lh, lawnMid);
        for (let gx = lx + 16; gx < lx + lw - 32; gx += 64) A.R(g, gx, ly + 10, 32, lh - 16, lawnBand);
        // 建筑挑檐柔和阴影带（1F 西翼南檐 & 茶歇角西檐）
        A.R(g, lx, ly + 10, lw - 14, 10, lawnDark);
        A.R(g, lx + lw - 24, ly + 10, 10, lh - 10, lawnDark);
        // 2× 像素草叶簇与零星小野花（避开中央 188..540 × 504..686 花坛负空间，保持主体清晰可读）
        for (let gy = ly + 32; gy < ly + lh - 18; gy += 28) {
          for (let gx = lx + 20; gx < lx + lw - 34; gx += 36) {
            const jx = gx + ((((gx * 13 + gy * 7) / 4) | 0) % 5) * 2;
            const jy = gy + ((((gx * 5 + gy * 11) / 4) | 0) % 3) * 2;
            if (jx > 176 && jx < 548 && jy > 496 && jy < 688) continue;
            if ((gx + gy) % 72 === 0) {
              A.R(g, jx, jy, 4, 2, lawnLight);
              A.R(g, jx, jy + 2, 4, 2, lawnDark);
            } else if (((gx * 3 + gy) % 64) === 0) {
              A.R(g, jx + 2, jy, 4, 2, lawnLight);
            }
          }
        }
        // 草坪十字小白花（每朵 3×3 原生像素 → 6×6 世界像素，安静点缀外缘）
        for (const [fx, fy, petal] of [[126, 526, '#f7f3e8'], [148, 694, '#ffd25a'], [356, 474, '#f7f3e8'], [414, 718, '#f7f3e8'], [574, 540, '#ffd25a'], [580, 658, '#f7f3e8']]) {
          A.R(g, fx + 2, fy, 2, 6, petal);
          A.R(g, fx, fy + 2, 6, 2, petal);
          A.R(g, fx + 2, fy + 2, 2, 2, '#ffd25a');
        }
        // 西侧入园原木小桥与暖石汀步（引导视线望向中央 CQRD 花坛）
        A.R(g, -68, 570, 112, 56, '#6e4322');
        A.R(g, -68, 574, 112, 48, '#c48a52');
        for (let tx = -68; tx < 44; tx += 18) {
          A.R(g, tx, 576, 16, 44, '#d49a60');
          A.R(g, tx, 576, 16, 3, '#e6b278');
        }
        for (const [sx, sy, sw, sh] of [[62, 584, 28, 22], [102, 588, 26, 20], [140, 584, 24, 22]]) {
          A.R(g, sx + 2, sy + 4, sw, sh, lawnDark);
          A.R(g, sx, sy, sw, sh, '#b8a483');
          A.R(g, sx, sy, sw, sh - 4, '#e2d5b8');
          A.R(g, sx, sy, sw, 2, '#f6efdd');
        }
        // 草坪正中 CQRD 迎宾立体花坛（160×72 原生像素 → 320×144 整数 2× 缩放）
        A.R(g, 232, 662, 266, 8, lawnDark);
        A.R(g, 218, 654, 294, 8, lawnDark);
        const bedFn = L.themes?.[1]?.furniture?.cqrdbed || f.theme?.furniture?.cqrdbed;
        if (bedFn) bedFn(g, { x: 204, y: 524, w: 320, h: 144 }, A);
      }
      // 东侧与外侧溪面横跨原木景观栈桥
      for (const [bx, by, bw, bh] of [[2240, 440, 460, 56], [-180, 42, 180, 108], [2880, 42, 180, 108]]) {
        A.R(g, bx, by - 4, bw, bh + 8, '#6e4322');
        A.R(g, bx, by, bw, bh, '#c48a52');
        for (let tx = bx; tx < bx + bw; tx += 18) {
          A.R(g, tx, by + 2, 16, bh - 4, '#d49a60');
          A.R(g, tx, by + 2, 16, 3, '#e6b278');
        }
      }
      // 溪流睡莲与漂浮花瓣
      for (const [lx, ly] of [[-48, 500], [-72, 680], [280, 816], [2340, 600], [2560, 680], [2740, 570], [-140, 260], [3020, 260]]) {
        A.pxEllipse(g, lx, ly, 16, 9, '#4c9848');
        A.pxEllipse(g, lx - 2, ly - 1, 12, 6, '#62b058');
        A.R(g, lx - 3, ly - 4, 6, 5, '#f6a4c4');
        A.R(g, lx - 1, ly - 3, 2, 3, '#fff2b2');
      }
      // 迎宾草坪外角 3 株点景树木（保留中央负空间不遮花坛）+ 东溪林木
      for (const [tx, ty, sakura] of [[96, 488, true], [628, 488, false], [632, 712, true], [2320, 490, true], [2720, 490, false], [-90, 180, true], [2970, 180, true]]) {
        A.pxEllipse(g, tx, ty + 20, 34, 10, '#3b7336');
        A.R(g, tx - 4, ty - 8, 8, 28, '#6e4322');
        A.pxEllipse(g, tx, ty - 26, 30, 24, sakura ? '#e890b4' : '#4c8c46');
        A.pxEllipse(g, tx - 6, ty - 32, 18, 14, sakura ? '#f8bad4' : '#66b25a');
      }
    },
    floorDecor(g, ox, oy, w, h, A) {
      const FC = { cx: 1440, cy: 335 };
      const a = A.clipRect(ox, oy, w, h, { x: 700, y: 112, w: 1480, h: 432 });
      if (a) A.withClip(g, a, () => {
        const S = 16;
        for (let cy = Math.floor(a.y / S) * S; cy < a.y + a.h; cy += S) for (let cx = Math.floor(a.x / S) * S; cx < a.x + a.w; cx += S) {
          const dx = (cx + S / 2 - FC.cx) / 250, dy = (cy + S / 2 - FC.cy) / 150, d = Math.sqrt(dx * dx + dy * dy);
          if (d > 1) continue;
          if (d > 0.88 || (d > 0.70 && d <= 0.76)) { A.R(g, cx, cy, S, S, '#a86a40'); A.R(g, cx + 1, cy + 1, S - 2, S - 2, ((cx / S + cy / S) & 1) ? '#d0905e' : '#d89c6a'); A.R(g, cx + 1, cy + 1, S - 2, 2, '#e6b080'); }
          else if (d <= 0.70) { const band = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 8)) % 2; A.R(g, cx, cy, S, S, '#b8a581'); A.R(g, cx + 1, cy + 1, S - 2, S - 2, band ? '#efe5cf' : '#e2d4b6'); A.R(g, cx + 1, cy + 1, S - 2, 1, '#f3ead6'); }
        }
      });
      for (const bx of [696, 2176]) { const b = A.clipRect(ox, oy, w, h, { x: bx, y: 112, w: 8, h: 308 }); if (b) { A.R(g, b.x, b.y, b.w, b.h, '#b8a07a'); A.R(g, b.x, b.y, 2, b.h, '#d9c6a0'); } }
    },
    faceDecor(g, wl, top, bottom, A) {
      const x0 = wl.x, x1 = wl.x + wl.w, has = (a, b) => x0 <= a && x1 >= b;
      if (has(1220, 1250)) { A.R(g, 1214, top + 4, 124, 26, '#5b3a22'); A.R(g, 1218, top + 6, 116, 22, '#2f3b32'); A.text(g, '今日 · 可颂 / 拿铁', 1224, top + 13, '#f4ecd2', 9, 'left'); A.text(g, '鲜果烘焙 3 金币', 1224, top + 23, '#ffd27a', 9, 'left'); }
      if (has(880, 960)) { A.sconce(g, 880, top + 2); A.frame(g, 920, top + 4, 40, 24, 'flower'); }
      if (has(1500, 1540)) A.sconce(g, 1520, top + 2);
      if (has(1880, 1990)) for (let i = 0; i < 8; i++) { const fx = 1880 + i * 12, c = ['#f06f6a', '#ffd25a', '#6fc3df', '#8fd07a'][i % 4]; A.R(g, fx, top + 4, 10, 2, '#7a4a26'); A.R(g, fx + 2, top + 6, 6, 4, c); A.R(g, fx + 4, top + 10, 2, 2, c); }
    },
    furniture: {
      cqrdbed: (function () {
        const W = 160, H = 72;
        const PAL = [
          null,
          '#f6efdd', '#e2d5b8', '#b8a483', '#7c674e', // 1..4: 暖米白洞石路缘（与翠绿草坪明确明暗/色相分离）
          '#b4e64c', '#88c436', '#528e2c',             // 5..7: 晨光金叶女贞草毯
          '#965d67', '#73434d', '#4f2a34', '#331822',  // 8..11: 红檵木立体字与花境镶边
          '#68ab48', '#3f7a30', '#234d20',             // 12..14: 修剪球形大叶黄杨
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
