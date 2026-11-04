'use strict';
// 4F · 阳光花房层 主题：温室玻璃北墙 + 茵茵草坪与石板小径 + 白木凉亭焦点 + 南排盆栽房/干花香草棚/野餐营地。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const lawnA = { base: '#6ab054', blade: '#589c42', lo: '#4e8c3a', hi: '#82c66a', flower: ['#f27874', '#ffd85e', '#f5a8cc', '#ffffff'] };
  const lawnB = { base: '#62a64c', blade: '#50923c', lo: '#468234', hi: '#7abc64', flower: ['#ffd85e', '#b98ae8', '#ffffff'] };
  const stoneG = { tones: ['#dfd4bc', '#d4c8ae', '#e8dec8', '#cbbd9e'], grout: '#988b6e', hi: '#f2ead8', lo: '#b6a88a' };
  const deckG = { base: '#b87e4a', hi: '#ca905c', lo: '#9e6838', gap: '#6e4322', nail: '#4a2a14' };
  const dirtG = { base: '#9e744c', hi: '#b4885e', lo: '#825c38', pebble: '#c4a682' };
  const shedWood = { base: '#b07846', hi: '#c28a56', lo: '#986436', gap: '#6a4020', grain: '#8a562e' };

  L.register(4, {
    wall: {
      paper: '#dceee4', stripe: '#c6e0d2', motif: '#9ec4b0',
      rail: '#5e7e58', railHi: '#7ea276', wains: '#6e9066', wainsLo: '#54724e', wainsHi: '#8ab080',
      base: '#3a4e36', crown: '#b8d6c4', cap: '#5a7852', capHi: '#82a478', capLo: '#2e402a', capTop: '#6c8e64', style: 'panel'
    },
    hedge: { dark: "#3f7a3a", mid: "#4f9446", hi: "#6cb35c", flower: ["#f5a0c8", "#ffffff", "#ffd25a"] },
    hedge: { dark: "#3f7a3a", mid: "#4f9446", hi: "#6cb35c", flower: ["#f5a0c8", "#ffffff", "#ffd25a"] },
    zones: [
      { x: 0, y: 0, w: 960, h: 560, mat: "grass", pal: lawnA, seed: 41 },
      { x: 960, y: 0, w: 960, h: 680, mat: "grass", pal: lawnB, seed: 42 },
      { x: 1920, y: 0, w: 460, h: 800, mat: "grass", pal: lawnA, seed: 43 },
      { x: 1990, y: 450, w: 320, h: 150, mat: "dirt", pal: dirtG, seed: 46 },
      { x: 2380, y: 0, w: 500, h: 800, mat: "deck", pal: deckG, seed: 44 }
    ],
    rugs: [],
    windows: [560, 820, 1100, 1700, 2050, 2400, 2700], windowStyle: "arch",
    sconces: [200, 700, 1250, 1600, 2300, 2560],
    frames: [[880, "flower"], [1800, "land"], [2780, "flower"]],
    plaque: { x: 1180, text: "阳光花房层 · 四季常青", w: 168 },
    exterior(g, f, A, a) {
      // 花房外的野花草甸 + 小池塘
      A.R(g, a.x, a.y, a.w, a.h, "#78b860");
      const fl = ["#f06f6a", "#ffd25a", "#ffffff", "#b98ae8", "#f5a0c8"];
      for (let y = a.y; y < a.y + a.h; y += 12) for (let x = a.x; x < a.x + a.w; x += 12) { const k = A.hash(x + 11, y + 5); if (k < 0.4) A.R(g, x + 4, y + 4, 2, 5, "#5e9e48"); else if (k > 0.95) A.R(g, x + 5, y + 5, 4, 4, fl[Math.floor(k * 991) % fl.length]); }
      A.pxEllipse(g, 400, 700, 150, 60, "#3f7a3a"); A.pxEllipse(g, 400, 700, 140, 54, "#5fa8d0"); A.pxEllipse(g, 380, 694, 90, 30, "#7cc4e4");
      for (const [px, py] of [[340, 690], [450, 712]]) { A.pxEllipse(g, px, py, 12, 6, "#4c9a44"); A.R(g, px - 2, py - 4, 4, 4, "#f5a0c8"); }
      for (const [tx, ty] of [[1300, 60], [2400, 120], [700, 740], [1500, 760]]) { if (ty < 0) continue; A.pxEllipse(g, tx, ty + 18, 30, 8, "rgba(30,50,20,0.3)"); A.R(g, tx - 4, ty - 8, 8, 26, "#6e4322"); A.pxEllipse(g, tx, ty - 24, 28, 22, "#4c8c46"); A.pxEllipse(g, tx - 6, ty - 30, 16, 12, "#66b25a"); }
    },
    floorDecor(g, ox, oy, w, h, A) {
      // 台地交界石阶
      for (const [x, y, hh] of [[952, 232, 148], [1912, 352, 148]]) {
        const c = A.clipRect(ox, oy, w, h, { x, y, w: 16, h: hh });
        if (!c) continue;
        for (let ty = y; ty < y + hh; ty += 12) { A.R(g, x, ty, 16, 12, "#b8a888"); A.R(g, x, ty, 16, 3, "#ddd2b8"); A.R(g, x, ty + 10, 16, 2, "#8e7e64"); }
      }
      // 凉亭花砖广场
      const GZ = { cx: 1270, cy: 380 };
      const q = A.clipRect(ox, oy, w, h, { x: 976, y: 232, w: 944, h: 448 });
      if (q) A.withClip(g, q, () => { A.pxEllipse(g, GZ.cx, GZ.cy, 220, 110, "#b89e76"); A.pxEllipse(g, GZ.cx, GZ.cy, 210, 104, "#e8dcc2"); A.pxEllipse(g, GZ.cx, GZ.cy, 150, 74, "#84b472"); A.pxEllipse(g, GZ.cx, GZ.cy, 140, 68, "#efe5ce"); });
      const d = A.clipRect(ox, oy, w, h, { x: 1986, y: 446, w: 328, h: 158 });
      if (d) { g.strokeStyle = "#7c4c28"; g.lineWidth = 4; g.strokeRect(1988, 448, 324, 154); }
    },
    backDecor(g, f, A) {
      // 北墙垂挂常春藤花蔓
      for (let x = 40; x < f.width - 40; x += 64) {
        const len = 14 + (x % 3) * 6;
        A.R(g, x, 2, 12, 6, '#4c8c46');
        A.R(g, x + 3, 8, 6, len, '#5fa356');
        if (x % 128 === 40) A.R(g, x + 4, 8 + len - 4, 4, 4, '#f5a0c8');
      }
    },
    furniture: {
      flowerbed(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 18, w, 18, '#8c522c'); A.R(g, x, by - 18, w, 3, '#b46e40'); A.R(g, x, by - 3, w, 3, '#583016');
        A.R(g, x + 4, by - 22, w - 8, 6, '#5c3c22');
        const cols = ['#f06f6a', '#ffd25a', '#b98ae8', '#f5a0c8', '#ffffff', '#ff9e4a'];
        for (let px = x + 6, i = 0; px < x + w - 10; px += 9, i++) {
          const h = 10 + (i % 3) * 3;
          A.R(g, px, by - 20 - h, 6, h, i % 2 ? '#589c48' : '#468238');
          A.R(g, px + 1, by - 24 - h, 5, 5, cols[(i + Math.round(x / 11)) % cols.length]);
          A.R(g, px + 2, by - 23 - h, 2, 2, '#fff6cc');
        }
      },
      pottree(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        // 陶土大花盆
        A.R(g, cx - 14, by - 22, 28, 22, '#b8623c'); A.R(g, cx - 16, by - 25, 32, 5, '#d2784e');
        A.R(g, cx - 12, by - 20, 6, 18, '#cf764c'); A.R(g, cx - 14, by - 3, 28, 3, '#7c3e22');
        // 树干
        A.R(g, cx - 4, by - 52, 8, 28, '#6e4322'); A.R(g, cx - 2, by - 52, 3, 28, '#8a5832');
        // 树冠与果实/花朵（按标签区分樱花/柠檬/橘/苹果/橄榄）
        const sakura = /樱/.test(f.label);
        const leaf = sakura ? ['#e890b4', '#f4acc8', '#fbd0e0'] : ['#46883c', '#589e4c', '#70b660'];
        A.pxEllipse(g, cx, by - 64, 24, 18, leaf[0]);
        A.pxEllipse(g, cx - 6, by - 68, 18, 14, leaf[1]);
        A.pxEllipse(g, cx + 6, by - 66, 16, 13, leaf[1]);
        A.pxEllipse(g, cx - 2, by - 72, 12, 9, leaf[2]);
        const fruit = /柠檬|梨/.test(f.label) ? '#ffd84a' : /橘/.test(f.label) ? '#ff9238' : /苹果/.test(f.label) ? '#e8524a' : sakura ? '#ffffff' : '#96c868';
        for (const [dx, dy] of [[-12, -62], [8, -68], [-2, -56], [12, -58], [-8, -72]]) {
          A.R(g, cx + dx, by + dy, 4, 4, fruit);
        }
      },
      seedtable(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x + 4, by - 18, 6, 18, '#5e3519'); A.R(g, x + w - 10, by - 18, 6, 18, '#5e3519');
        A.R(g, x, by - 32, w, 16, '#9e683a'); A.R(g, x, by - 32, w, 2, '#c08450'); A.R(g, x, by - 18, w, 2, '#6e4322');
        for (let px = x + 8, i = 0; px < x + w - 24; px += 18, i++) {
          A.R(g, px, by - 40, 12, 8, '#c06a42');
          A.R(g, px + 3, by - 48 - (i % 2) * 3, 6, 8 + (i % 2) * 3, '#5fa356');
        }
        // 洒水壶
        A.R(g, x + w - 22, by - 44, 12, 12, '#5fa8c8'); A.R(g, x + w - 26, by - 42, 4, 4, '#5fa8c8');
      },
      wheelbarrow(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        // 铁轮与木把手
        A.pxEllipse(g, x + w - 10, by - 8, 8, 8, '#3e3a36'); A.pxEllipse(g, x + w - 10, by - 8, 4, 4, '#9c9488');
        A.R(g, x, by - 16, w - 12, 4, '#6e4322'); A.R(g, x + 12, by - 14, 4, 14, '#5e3519');
        // 车斗与泥土鲜花
        A.R(g, x + 10, by - 30, w - 20, 16, '#a86838'); A.R(g, x + 10, by - 30, w - 20, 3, '#c88450');
        A.R(g, x + 14, by - 34, w - 28, 4, '#5a3a22');
        for (let i = 0; i < 4; i++) {
          A.R(g, x + 16 + i * 8, by - 40, 6, 6, '#5fa356');
          A.R(g, x + 17 + i * 8, by - 44, 4, 4, ['#ffd25a', '#f06f6a', '#f5a0c8', '#ffffff'][i]);
        }
      },
      gazebo(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), h = Math.round(f.h), cx = x + w / 2;
        const deckTop = by - h + 16, roofTop = deckTop - 70;
        // 八角白木地台与台阶
        A.R(g, x + 6, deckTop, w - 12, h - 16, '#d8ccb4');
        A.R(g, x + 10, deckTop + 4, w - 20, h - 24, '#ece2cc');
        A.R(g, x + 6, by - 8, w - 12, 8, '#9c8c72');
        A.R(g, cx - 28, by - 6, 56, 8, '#e2d6be'); A.R(g, cx - 28, by, 56, 3, '#8e7e64');
        // 亭内圆茶桌与对坐白木长椅
        A.R(g, x + 26, by - 58, 40, 26, '#f4efe4'); A.R(g, x + 28, by - 56, 36, 20, '#d8ceb8');
        A.R(g, x + w - 66, by - 58, 40, 26, '#f4efe4'); A.R(g, x + w - 64, by - 56, 36, 20, '#d8ceb8');
        A.pxEllipse(g, cx, by - 48, 24, 14, '#ffffff'); A.pxEllipse(g, cx, by - 48, 20, 11, '#e6dcc6');
        A.R(g, cx - 6, by - 56, 12, 8, '#7fc4dc'); A.R(g, cx - 4, by - 60, 8, 4, '#f06f6a');
        // 四根白木立柱 + 攀援蔷薇藤
        for (const px of [x + 14, x + w - 24, x + 36, x + w - 46]) {
          const py = (px === x + 14 || px === x + w - 24) ? by - 12 : deckTop + 14;
          const ph = py - (roofTop + 26);
          A.R(g, px, roofTop + 26, 10, ph, '#f4efe4');
          A.R(g, px + 7, roofTop + 26, 3, ph, '#cbc0a8');
          for (let vy = roofTop + 34; vy < py - 10; vy += 14) {
            A.R(g, px - 2, vy, 8, 6, '#4e8e44');
            A.R(g, px + 4, vy + 4, 4, 4, '#f2788a');
          }
        }
        // 分层尖顶（薄荷绿木瓦 + 白色檐口 + 悬垂花篮）
        A.R(g, x - 4, roofTop + 22, w + 8, 8, '#f6f2e8');
        A.R(g, x - 4, roofTop + 28, w + 8, 4, '#c4b89e');
        A.R(g, x + 8, roofTop + 12, w - 16, 12, '#6ea488');
        A.R(g, x + 28, roofTop + 4, w - 56, 10, '#7eb498');
        A.R(g, cx - 36, roofTop - 4, 72, 10, '#8ec4a8');
        A.R(g, cx - 4, roofTop - 12, 8, 8, '#f6f2e8');
      },
      gardenlamp(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 6, by - 4, 12, 4, '#2e3830');
        A.R(g, cx - 2, by - 58, 4, 54, '#3c483e');
        A.R(g, cx - 9, by - 72, 18, 14, '#ffe28a');
        A.R(g, cx - 11, by - 74, 22, 3, '#2e3830'); A.R(g, cx - 9, by - 58, 18, 2, '#2e3830');
        g.fillStyle = 'rgba(255,228,140,0.16)'; g.fillRect(cx - 26, by - 82, 52, 38);
      },
      gardenbench(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        for (const lx of [x + 6, x + w - 12]) A.R(g, lx, by - 18, 6, 18, '#3a4a3e');
        A.R(g, x, by - 36, w, 14, '#e8efe8'); A.R(g, x + 2, by - 34, w - 4, 10, '#cad8ca');
        A.R(g, x, by - 20, w, 8, '#f2f6f0'); A.R(g, x, by - 14, w, 2, '#9eb09e');
      },
      vegbed(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), h = Math.round(f.h);
        A.R(g, x, by - h, w, h, '#7c4c28'); A.R(g, x + 3, by - h + 3, w - 6, h - 6, '#54361c');
        for (let row = 0; row < 2; row++) {
          const ry = by - h + 6 + row * 13;
          A.R(g, x + 6, ry + 4, w - 12, 4, '#3e2612');
          for (let px = x + 10, i = 0; px < x + w - 14; px += 16, i++) {
            A.pxEllipse(g, px + 4, ry + 2, 6, 5, i % 2 ? '#68b454' : '#4e963e');
            if (/三|四/.test(f.label) && i % 2 === 0) A.R(g, px + 3, ry, 4, 4, '#e8524a');
          }
        }
      },
      pottingbench(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 34, w, 34, '#8a5530'); A.R(g, x + 2, by - 32, w - 4, 28, '#a66c40');
        A.R(g, x, by - 54, w, 20, '#6e4322'); A.R(g, x + 4, by - 50, w - 8, 2, '#9a6236');
        // 泥炭土槽与陶盆
        A.R(g, x + 12, by - 38, 36, 8, '#4e321a');
        for (let i = 0; i < 4; i++) {
          A.R(g, x + 60 + i * 18, by - 44, 12, 10, '#c26a40');
          A.R(g, x + 62 + i * 18, by - 50, 8, 6, '#5fa356');
        }
      },
      potstack(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h;
        for (let i = 0; i < 3; i++) {
          A.R(g, x + 6 + i * 16, by - 18 - (i % 2) * 8, 14, 16, '#c26a40');
          A.R(g, x + 4 + i * 16, by - 20 - (i % 2) * 8, 18, 4, '#d87e52');
        }
      },
      dryrack(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), top = by - 64;
        A.R(g, x + 4, top, 6, 64, '#6e4322'); A.R(g, x + w - 10, top, 6, 64, '#6e4322');
        for (const ry of [top + 10, top + 32]) {
          A.R(g, x + 2, ry, w - 4, 4, '#8a5530');
          const cols = ['#9a72c8', '#ffd25a', '#7ab062', '#e8828a'];
          for (let bx = x + 14, i = 0; bx < x + w - 16; bx += 16, i++) {
            A.R(g, bx + 2, ry + 4, 4, 4, '#c8a668');
            A.R(g, bx, ry + 8, 8, 12, cols[(i + (ry > top + 20 ? 2 : 0)) % cols.length]);
          }
        }
      },
      herbtable(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x + 6, by - 18, 6, 18, '#5e3519'); A.R(g, x + w - 12, by - 18, 6, 18, '#5e3519');
        A.R(g, x, by - 34, w, 18, '#a86e3e'); A.R(g, x, by - 34, w, 2, '#c88c58');
        const herbs = ['#9a72c8', '#7ab062', '#ffd25a', '#e8828a'];
        for (let i = 0; i < 4; i++) {
          const bx = x + 12 + i * 38;
          A.R(g, bx, by - 42, 28, 10, '#c89e62');
          A.R(g, bx + 3, by - 46, 22, 6, herbs[i]);
        }
      },
      herbbasket(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.pxEllipse(g, cx, by - 12, 24, 12, '#b8884c');
        A.pxEllipse(g, cx, by - 18, 22, 8, '#8e62c2');
        A.pxEllipse(g, cx - 4, by - 20, 14, 5, '#b086e0');
      },
      mat(g, f, A) {
        const x = Math.round(f.x), y = Math.round(f.y), w = Math.round(f.w), h = Math.round(f.h);
        // 红白格纹野餐毯 + 野餐篮与茶具
        A.R(g, x + 2, y + 3, w, h, 'rgba(40,60,20,0.22)');
        const c0 = '#f8f0dc', c1 = /二/.test(f.label) ? '#5a9ec4' : '#d95b52';
        A.R(g, x, y, w, h, c0);
        for (let gy = y; gy < y + h; gy += 12) for (let gx = x; gx < x + w; gx += 12) {
          if (((gx - x) / 12 + (gy - y) / 12) % 2 === 1) A.R(g, gx, gy, Math.min(12, x + w - gx), Math.min(12, y + h - gy), c1);
        }
        // 野餐藤篮与水果盘
        A.R(g, x + 18, y + 14, 28, 20, '#b88246'); A.R(g, x + 18, y + 14, 28, 4, '#d49e60');
        A.pxEllipse(g, x + w - 36, y + h - 22, 16, 10, '#ffffff');
        A.R(g, x + w - 42, y + h - 26, 6, 6, '#e8524a'); A.R(g, x + w - 34, y + h - 24, 6, 6, '#ffd25a');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
