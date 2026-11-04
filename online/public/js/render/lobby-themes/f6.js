'use strict';
// 6F · 晴海甜品舱 主题：船舱木甲板 + 航海罗盘镶嵌 + 旋转马卡龙甜品塔 + 舷窗北墙 + 南排烘焙坊/礼盒屋/船长金库/瞭望室。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const deckA = { base: '#b8824c', hi: '#c9945e', lo: '#9e6c3a', gap: '#6e4522', nail: '#4a2c14' };
  const deckB = { base: '#d4ab78', hi: '#e2bc8c', lo: '#bc9260', gap: '#8a6238', nail: '#5c3e1e' };
  const checkPastel = { a: '#fbf0dc', b: '#e89ca8', grout: '#c27482', aHi: '#ffffff', bHi: '#f4b4be', aLo: '#e6d8be', bLo: '#cf8290' };
  const tileKitchen = { a: '#f4ecd8', b: '#78b4cc', grout: '#54889e', aHi: '#ffffff', bHi: '#96cce0', aLo: '#dfd4bc', bLo: '#5e96ac' };

  L.register(6, {
    wall: {
      paper: '#e6f2f8', stripe: '#cfe4f0', motif: '#a8cbe0',
      rail: '#3a6888', railHi: '#588cb0', wains: '#487a9e', wainsLo: '#325a78', wainsHi: '#6498bc',
      base: '#223e54', crown: '#f4e6c8', cap: '#385e7a', capHi: '#5e8cae', capLo: '#1e3648', capTop: '#487494', style: 'plank'
    },
    house: { kind: "cabin", roof: "#f4efe4", roofLo: "#d8d0bc", rail: "#a8723f", trim: "#385e7a", wall: { paper: "#f6fbfd", stripe: "#dcebf2", motif: "#b8d4e2", wains: "#487a9e", wainsHi: "#6498bc", base: "#223e54" } },
    fence: { post: "#a8723f", postLo: "#7a4a26", rail: "#c08a50", railLo: "#7a4a26" },
    house: { kind: "cabin", roof: "#f4efe4", roofLo: "#d8d0bc", rail: "#a8723f", trim: "#385e7a", wall: { paper: "#f6fbfd", stripe: "#dcebf2", motif: "#b8d4e2", wains: "#487a9e", wainsHi: "#6498bc", base: "#223e54" } },
    zones: [
      { x: 0, y: 0, w: 806, h: 800, mat: "deck", pal: deckA, seed: 61 },
      { x: 806, y: 0, w: 1594, h: 800, mat: "deck", pal: deckB, seed: 62 },
      { x: 2400, y: 0, w: 480, h: 800, mat: "checker", pal: checkPastel, size: 32 },
      { x: 806, y: 600, w: 760, h: 200, mat: "checker", pal: tileKitchen, size: 32 }
    ],
    rugs: [
      { x: 96, y: 278, w: 266, h: 98, fill: "#2e6488", band: "#1e4662", trim: "#f2d278", motif: "#ffffff", fringe: "#f4ead0" }
    ],
    windows: [260, 640, 1000, 1500, 1840, 2520, 2760], windowStyle: "porthole",
    sconces: [800, 1240, 1700, 2060],
    frames: [[120, "sea"], [1100, "sea"]],
    plaque: { x: 1650, text: "晴海甜品舱 · 甜蜜启航", w: 168 },
    exterior(g, f, A, a) {
      // 船身四周的晴海：海面色带 + 波纹 + 船舷白浪
      A.R(g, a.x, a.y, a.w, a.h, "#3f8fc0");
      for (let y = a.y; y < a.y + a.h; y += 14) for (let x = a.x + ((y / 14) % 2) * 20; x < a.x + a.w; x += 40) { const k = A.hash(x, y); if (k > 0.55) { A.R(g, x, y, 14, 2, "#6fb4dc"); A.R(g, x + 4, y - 2, 6, 2, "#9fd4ee"); } else if (k < 0.08) A.R(g, x, y, 8, 2, "#2f74a4"); }
      g.save(); g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 6; g.setLineDash([10, 8]);
      g.beginPath(); f.polygon.forEach((q, i) => i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)); g.closePath(); g.stroke(); g.restore();
      for (const [bx, by] of [[200, 720], [3000, 700], [2700, 700]]) { A.pxEllipse(g, bx, by, 14, 6, "#e0524a"); A.pxEllipse(g, bx, by, 9, 4, "#ffffff"); }
    },
    floorDecor(g, ox, oy, w, h, A) {
      const CP = { cx: 1650, cy: 470 };
      const a = A.clipRect(ox, oy, w, h, { x: 1490, y: 330, w: 320, h: 280 });
      if (a) A.withClip(g, a, () => {
        A.pxEllipse(g, CP.cx, CP.cy, 156, 124, "#386484"); A.pxEllipse(g, CP.cx, CP.cy, 148, 118, "#f4ead2");
        A.pxEllipse(g, CP.cx, CP.cy, 112, 88, "#e28492"); A.pxEllipse(g, CP.cx, CP.cy, 104, 82, "#fbf4e4");
        A.R(g, CP.cx - 150, CP.cy - 2, 300, 4, "#386484"); A.R(g, CP.cx - 2, CP.cy - 120, 4, 240, "#386484");
      });
    },
    furniture: {
      barrel(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 14, by - 32, 28, 30, '#8e5830'); A.R(g, cx - 16, by - 26, 32, 18, '#a66c3e');
        A.R(g, cx - 16, by - 24, 32, 3, '#c89e48'); A.R(g, cx - 16, by - 12, 32, 3, '#c89e48');
        A.pxEllipse(g, cx, by - 32, 14, 6, '#6e4220');
        // 桶顶缤纷糖果堆
        const c = /薄荷/.test(f.label) ? ['#78d6b8', '#ffffff'] : /草莓/.test(f.label) ? ['#f2788a', '#ffd0dc'] : ['#ffd25a', '#f28294', '#78c8e6'];
        for (let i = 0; i < 5; i++) A.R(g, cx - 10 + i * 4, by - 36 - (i % 2) * 3, 5, 5, c[i % c.length]);
      },
      menuboard(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), top = by - 64;
        A.R(g, x + 8, top + 34, 4, 30, '#6e4322'); A.R(g, x + w - 12, top + 34, 4, 30, '#6e4322');
        A.R(g, x, top, w, 38, '#a87240'); A.R(g, x + 4, top + 4, w - 8, 30, '#2b4a5e');
        A.text(g, '今日甜品 · 马卡龙塔', x + w / 2, top + 14, '#ffe698', 9);
        A.text(g, '海盐圣代 / 草莓华夫', x + w / 2, top + 26, '#fbd0dc', 9);
      },
      carousel(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, rx = Math.round(f.w / 2), ry = Math.round(f.h / 2) - 2, cy = by - ry - 2;
        // 奶油金边圆底座
        A.pxEllipse(g, cx, cy + 5, rx, ry, '#8a5838');
        A.pxEllipse(g, cx, cy, rx, ry, '#f8eed8');
        A.pxEllipse(g, cx, cy, rx - 6, ry - 3, '#e898a8');
        A.pxEllipse(g, cx, cy, rx - 14, ry - 7, '#fff8ea');
        // 底层环绕小蛋糕与马卡龙
        const sweets = ['#f2788a', '#78c8e0', '#ffd25a', '#98d690', '#c898e8', '#ff9e68'];
        for (let i = 0; i < 8; i++) {
          const ang = (i / 8) * Math.PI * 2;
          const sx = Math.round(cx + Math.cos(ang) * (rx - 28)), sy = Math.round(cy + Math.sin(ang) * (ry - 13));
          A.R(g, sx - 6, sy - 6, 12, 8, sweets[i % sweets.length]);
          A.R(g, sx - 4, sy - 9, 8, 3, '#ffffff');
          A.R(g, sx - 1, sy - 11, 3, 2, '#e04848');
        }
        // 中层与顶层翻糖蛋糕塔 + 航海蓝白条纹顶篷
        A.R(g, cx - 8, cy - 38, 16, 36, '#e2b85c');
        A.pxEllipse(g, cx, cy - 22, 46, 16, '#78bce0');
        A.pxEllipse(g, cx, cy - 24, 42, 14, '#fff8ea');
        A.pxEllipse(g, cx, cy - 42, 28, 10, '#f28ea0');
        A.pxEllipse(g, cx, cy - 44, 24, 8, '#fff8ea');
        // 顶部草莓皇冠
        A.R(g, cx - 6, cy - 56, 12, 10, '#e84c58'); A.R(g, cx - 3, cy - 60, 6, 4, '#ffd25a');
      },
      shipwheel(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 10, by - 6, 20, 6, '#5e3519');
        A.R(g, cx - 4, by - 32, 8, 26, '#7a4a26');
        const wy = by - 42;
        A.pxEllipse(g, cx, wy, 18, 18, '#8e562e');
        A.pxEllipse(g, cx, wy, 13, 13, '#d4ab78');
        A.pxEllipse(g, cx, wy, 5, 5, '#e0b44c');
        for (const [dx, dy] of [[-20, -1], [16, -1], [-1, -20], [-1, 16], [-15, -15], [12, -15], [-15, 12], [12, 12]]) {
          A.R(g, cx + dx, wy + dy, 4, 4, '#6e3e1e');
        }
      },
      waffle(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 34, w, 34, '#46748e'); A.R(g, x + 2, by - 32, w - 4, 28, '#5c8ea8');
        A.R(g, x - 2, by - 40, w + 4, 6, '#f4ecd8');
        // 两台铸铁华夫饼炉 + 金黄华夫饼 + 糖浆瓶
        for (const wx of [x + 18, x + 68]) {
          A.R(g, wx, by - 48, 34, 10, '#363c42');
          A.R(g, wx + 4, by - 46, 26, 6, '#e8a842');
        }
        A.R(g, x + 124, by - 50, 10, 12, '#d9534a'); A.R(g, x + 140, by - 50, 10, 12, '#e2a83c');
        A.pxEllipse(g, x + w - 24, by - 44, 14, 6, '#ffffff');
      },
      giftpile(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h;
        // 三只蝴蝶结丝带礼盒
        A.R(g, x + 2, by - 18, 22, 18, '#f28294'); A.R(g, x + 11, by - 18, 4, 18, '#ffe278'); A.R(g, x + 2, by - 10, 22, 3, '#ffe278');
        A.R(g, x + 24, by - 16, 20, 16, '#6fc3df'); A.R(g, x + 32, by - 16, 4, 16, '#ffffff');
        A.R(g, x + 10, by - 32, 20, 14, '#ffd25a'); A.R(g, x + 18, by - 32, 4, 14, '#e0524a');
      },
      captaindesk(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 34, w, 34, '#6e3e1e'); A.R(g, x + 3, by - 31, w - 6, 26, '#8e542c');
        A.R(g, x - 2, by - 38, w + 4, 6, '#b87848');
        // 航海图、黄铜罗盘与双层甜品架
        A.R(g, x + 16, by - 44, 42, 8, '#f4e6c4'); A.R(g, x + 24, by - 42, 14, 4, '#68b078');
        A.pxEllipse(g, x + 76, by - 42, 8, 6, '#e0b44c');
        A.pxEllipse(g, x + w - 28, by - 44, 14, 5, '#ffffff');
        A.pxEllipse(g, x + w - 28, by - 52, 10, 4, '#f28294');
      },
      telescope(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 12, by - 24, 4, 24, '#6e3e1e'); A.R(g, cx + 8, by - 24, 4, 24, '#6e3e1e'); A.R(g, cx - 2, by - 26, 4, 26, '#542e14');
        A.R(g, cx - 14, by - 36, 28, 8, '#d4a64a'); A.R(g, cx - 14, by - 36, 28, 2, '#f4d278');
        A.R(g, cx + 12, by - 38, 6, 12, '#8ad4f0');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
