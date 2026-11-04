'use strict';
// 7F · 云端露台层 主题：柚木观景露台 + 砂岩泳池绿洲（天际泳池/遮阳伞/条纹躺椅）+ 晚霞鲜果特饮吧 + 南排更衣室/芳疗SPA/文创市集。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const teakA = { base: '#c48a52', hi: '#d49c64', lo: '#ac743e', gap: '#784c24', nail: '#523214' };
  const teakB = { base: '#b87e48', hi: '#ca9058', lo: '#9e6836', gap: '#6e4320', grain: '#8e5a2e' };
  const sandStone = { tones: ['#eadec4', '#dfd2b6', '#f2e8d0', '#d6c8aa'], grout: '#b4a280', hi: '#faf2e0', lo: '#c6b492' };
  const sunsetTile = { a: '#f4e4c8', b: '#de8262', grout: '#b25e42', aHi: '#fcf4e4', bHi: '#ec987a', aLo: '#dfd0b2', bLo: '#c46c4e' };

  L.register(7, {
    wall: {
      paper: '#f4e4d4', stripe: '#e8d2be', motif: '#d4b69c',
      rail: '#8e5a38', railHi: '#b47850', wains: '#a66c44', wainsLo: '#865230', wainsHi: '#c08458',
      base: '#58341c', crown: '#f8ecd8', cap: '#744828', capHi: '#a46c44', capLo: '#422612', capTop: '#8a5834', style: 'panel'
    },
    glass: { post: "#9aa8b2", rail: "#b47850", pane: "rgba(196,234,248,0.40)" },
    zones: [
      { x: 0, y: 0, w: 1000, h: 520, mat: "deck", pal: teakA, seed: 71 },
      { x: 200, y: 520, w: 600, h: 280, mat: "planks", pal: teakB, seed: 75 },
      { x: 1000, y: 0, w: 900, h: 560, mat: "stone", pal: sandStone, seed: 72 },
      { x: 1100, y: 560, w: 600, h: 240, mat: "parquet", pal: teakB, size: 32 },
      { x: 1900, y: 0, w: 980, h: 520, mat: "checker", pal: sunsetTile, size: 32 },
      { x: 2000, y: 520, w: 600, h: 280, mat: "planks", pal: teakB, seed: 77 }
    ],
    rugs: [
      { x: 76, y: 282, w: 284, h: 98, fill: "#d47458", band: "#a4523a", trim: "#f6dc92", motif: "#fff4d4", fringe: "#f4e8cc" }
    ],
    windows: [200, 640, 1200, 1420, 1720, 2120, 2780], windowStyle: "arch",
    sconces: [480, 860, 1560, 1960, 2380],
    frames: [[120, "sea"], [2000, "flower"], [2690, "sea"]],
    plaque: { x: 1310, text: "云端露台层 · 晴空晚霞", w: 168 },
    exterior(g, f, A, a) {
      // 栈台之间的天空云海：浅蓝渐层 + 成团白云
      const sky = ["#9fd4f0", "#b4def4", "#c8e8f8", "#dcf0fa"];
      for (let i = 0; i < 4; i++) A.R(g, a.x, a.y + i * a.h / 4, a.w, a.h / 4 + 1, sky[i]);
      for (const [cx, cy, s] of [[950, 660, 1.2], [1850, 700, 1], [500, 880, 1.4], [2400, 880, 1.3], [3000, 650, 1], [-150, 650, 1.1], [1300, 900, 1.5]]) {
        A.pxEllipse(g, cx, cy + 10, 70 * s, 18 * s, "#cfe4f2"); A.pxEllipse(g, cx - 30 * s, cy, 40 * s, 24 * s, "#ffffff"); A.pxEllipse(g, cx + 20 * s, cy - 8 * s, 46 * s, 30 * s, "#ffffff"); A.pxEllipse(g, cx + 60 * s, cy + 4, 30 * s, 18 * s, "#f4fafe");
      }
      for (const [bx, by] of [[900, 600], [1760, 620], [1040, 760]]) { A.R(g, bx, by, 6, 2, "#5a6670"); A.R(g, bx + 6, by - 2, 6, 2, "#5a6670"); A.R(g, bx - 6, by - 2, 6, 2, "#5a6670"); }
    },
    floorDecor(g, ox, oy, w, h, A) {
      const a = A.clipRect(ox, oy, w, h, { x: 1230, y: 230, w: 340, h: 150 });
      if (a) A.withClip(g, a, () => { A.R(g, 1234, 234, 332, 142, "#c8b692"); A.R(g, 1240, 240, 320, 130, "#e8dcc2"); });
      // 栈台入口铜条
      for (const [x, ww, y] of [[200, 600, 516], [1100, 600, 556], [2000, 600, 516]]) { const c = A.clipRect(ox, oy, w, h, { x, y, w: ww, h: 4 }); if (c) A.R(g, c.x, c.y, c.w, c.h, "#c8a252"); }
    },
    backDecor(g, f, A) {
      const cols = ["#ff8a66", "#ffd866", "#78c8e0", "#98d888", "#f49ac0"];
      for (const [x0, x1] of [[780, 1180], [1500, 1900]]) {
        A.R(g, x0, 12, x1 - x0, 2, "#6e4322");
        for (let x = x0 + 12, i = 0; x < x1 - 12; x += 22, i++) { A.R(g, x, 14, 6, 6, cols[i % cols.length]); A.R(g, x + 1, 15, 4, 4, "#fff8d6"); }
      }
    },
    furniture: {
      stage(g, f, A) {
        const x = Math.round(f.x), y = Math.round(f.y), w = Math.round(f.w), h = Math.round(f.h);
        // 柚木边框 + 运动软垫（兼容 sports 图集采样与目标色 #d9cca3）
        A.R(g, x, y, w, h, '#8a5530');
        A.R(g, x + 3, y + 3, w - 6, h - 6, '#d9cca3');
        if (root.SID_SCENE && typeof root.SID_SCENE.tile === 'function') {
          root.SID_SCENE.tile(g, 'sports', 0, 0, x + 6, y + 6, 64, Math.min(44, h - 12));
        }
        A.R(g, x + 6, y + 6, w - 12, h - 12, '#d9cca3');
        A.R(g, x + 10, y + 10, w - 20, 2, '#ece2c2');
        // 瑜伽软垫与毛巾卷
        A.R(g, x + 18, y + 16, 52, 24, '#5fa898'); A.R(g, x + 20, y + 18, 8, 20, '#88ccc0');
        A.R(g, x + w - 42, y + 20, 18, 12, '#f28268');
      },
      skypool(g, f, A) {
        const x = Math.round(f.x), y = Math.round(f.y), w = Math.round(f.w), h = Math.round(f.h);
        // 浅米黄洞石池岸 + 碧蓝渐变池水 + 水波纹 + 漂浮泳圈
        A.R(g, x - 6, y - 6, w + 12, h + 12, '#9e8c6c');
        A.R(g, x - 4, y - 4, w + 8, h + 8, '#e8dcc2');
        A.R(g, x + 4, y + 4, w - 8, h - 8, '#2e8eb8');
        A.R(g, x + 8, y + 8, w - 16, h - 16, '#48b2dc');
        A.R(g, x + 18, y + 16, w - 36, h - 32, '#68cceecc');
        // 水面波光条纹
        for (let wy = y + 16; wy < y + h - 16; wy += 16) {
          for (let wx = x + 22; wx < x + w - 40; wx += 36) {
            A.R(g, wx + ((wy / 16) % 2) * 14, wy, 18, 3, '#b8f0ff');
          }
        }
        // 粉白救生泳圈与池畔台阶
        const rx = x + w - 58, ry = y + h / 2;
        A.pxEllipse(g, rx, ry, 16, 12, '#ff7a8a');
        A.pxEllipse(g, rx, ry, 12, 9, '#ffffff');
        A.pxEllipse(g, rx, ry, 6, 4, '#48b2dc');
        A.R(g, x + 12, y + 6, 22, 4, '#d8ccb2'); A.R(g, x + 12, y + 14, 22, 4, '#92d8f0');
      },
      lounger(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        // 柚木底座 + 蓝白/橘白条纹度假软垫 + 靠枕
        A.R(g, x + 6, by - 8, 6, 8, '#6e4322'); A.R(g, x + w - 12, by - 8, 6, 8, '#6e4322');
        A.R(g, x, by - 20, w, 12, '#9e6436');
        const stripe = /东/.test(f.label) ? '#e87858' : '#4f98c8';
        for (let sx = x + 4, i = 0; sx < x + w - 8; sx += 10, i++) {
          A.R(g, sx, by - 26, 10, 8, i % 2 ? '#fbf6ea' : stripe);
        }
        const headX = /东/.test(f.label) ? x + w - 24 : x + 6;
        A.R(g, headX, by - 32, 18, 8, '#fff8e8'); A.R(g, headX + 2, by - 30, 14, 4, stripe);
      },
      parasol(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.pxEllipse(g, cx, by - 4, 14, 6, '#6e4322');
        A.R(g, cx - 2, by - 58, 4, 54, '#8a5530');
        // 八角度假遮阳伞面
        const c = /东/.test(f.label) ? '#e87858' : '#4896c8';
        A.pxEllipse(g, cx, by - 58, 32, 18, c);
        A.pxEllipse(g, cx, by - 60, 24, 13, '#fbf4e2');
        A.pxEllipse(g, cx, by - 62, 12, 7, c);
        A.R(g, cx - 3, by - 68, 6, 4, '#ffd25a');
      },
      spabed(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x + 6, by - 14, 6, 14, '#6e4322'); A.R(g, x + w - 12, by - 14, 6, 14, '#6e4322');
        A.R(g, x, by - 28, w, 16, '#8a5530');
        A.R(g, x + 2, by - 34, w - 4, 12, '#f6f2e8'); A.R(g, x + 2, by - 34, w - 4, 3, '#ffffff');
        // 芳疗毛巾铺巾、头枕与兰花点缀
        A.R(g, x + 12, by - 38, 22, 6, '#7ab4a4');
        A.R(g, x + 52, by - 35, 56, 8, '#7ab4a4');
        A.R(g, x + 76, by - 38, 6, 4, '#f282a0');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
