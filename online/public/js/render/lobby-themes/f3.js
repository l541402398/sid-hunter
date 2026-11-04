'use strict';
// 3F · 暖木藏书阁 主题：胡桃木长条地板 + 中庭鱼骨拼花与波斯圆毯 + 古籍恒温石室 / 插画工坊 / 留声沙龙。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const walnutA = { base: '#9e683c', hi: '#b27a4c', lo: '#885630', gap: '#5c361a', grain: '#7c4c28' };
  const walnutB = { base: '#ab7446', hi: '#be8656', lo: '#946036', gap: '#643c1e', grain: '#86542e' };
  const stoneV = { tones: ['#d6cbb8', '#cbc0ac', '#dfd5c2', '#c2b6a0'], grout: '#968a74', hi: '#ece4d4', lo: '#aea28c' };
  const salonCarpet = { base: '#782e32', hi: '#8e3a3e', lo: '#5e2024', pattern: '#d4ac62' };

  L.register(3, {
    wall: {
      paper: '#e6cfa4', stripe: '#d8be8e', motif: '#bfa06c',
      rail: '#6e3e1e', railHi: '#965a32', wains: '#844e28', wainsLo: '#683a1c', wainsHi: '#a06438',
      base: '#462610', crown: '#cbb07e', cap: '#5a3418', capHi: '#8a5630', capLo: '#321a0a', capTop: '#6e4220', style: 'paper'
    },
    zones: [
      { x: 0, y: 0, w: 1080, h: 800, mat: "planks", pal: walnutA, seed: 31 },
      { x: 1080, y: 0, w: 720, h: 470, mat: "parquet", pal: walnutB, size: 32 },
      { x: 1800, y: 0, w: 1080, h: 800, mat: "planks", pal: walnutA, seed: 33 },
      { x: 2016, y: 316, w: 668, h: 324, mat: "parquet", pal: walnutB, size: 32 },
      { x: 360, y: 616, w: 720, h: 184, mat: "stone", pal: stoneV, seed: 35 },
      { x: 1800, y: 656, w: 1080, h: 144, mat: "stone", pal: stoneV, seed: 36 }
    ],
    rugs: [
      { x: 2140, y: 336, w: 420, h: 270, round: true, fill: "#7c2d30", band: "#561c1e", trim: "#deb868", motif: "#eed28e" },
      { x: 360, y: 276, w: 640, h: 40, fill: "#355c4e", band: "#244036", trim: "#d8b264", motif: "#ead090" },
      { x: 400, y: 396, w: 560, h: 40, fill: "#355c4e", band: "#244036", trim: "#d8b264", motif: "#ead090" },
      { x: 1250, y: 350, w: 380, h: 100, fill: "#38526e", band: "#26394e", trim: "#dfb86c", motif: "#f0d494", fringe: "#efe2c2" }
    ],
    windows: [520, 1000, 1200, 1700, 1960, 2360, 2780], windowStyle: "arch",
    sconces: [640, 1080, 1800, 2200],
    frames: [[140, "map"], [1580, "flower"], [2700, "land"]],
    plaque: { x: 1840, text: "暖木藏书阁 · 静心开卷", w: 168 },
    exterior(g, f, A, a) {
      // 书院露天庭院：草坪 + 十字石径 + 中央古槐与小石灯
      A.R(g, a.x, a.y, a.w, a.h, "#5f9a4c");
      for (let y = a.y; y < a.y + a.h; y += 16) for (let x = a.x; x < a.x + a.w; x += 16) { const k = A.hash(x + 3, y + 9); if (k < 0.45) { A.R(g, x + 4, y + 6, 2, 4, "#4f8a40"); A.R(g, x + 8, y + 4, 2, 6, "#4f8a40"); } else if (k > 0.985) A.R(g, x + 6, y + 6, 4, 4, "#f5a0c8"); }
      const cx = 1440, cy = 650;
      for (let ty = 470; ty < 800; ty += 20) { A.R(g, cx - 30, ty + 1, 60, 18, "#cfc3a6"); A.R(g, cx - 30, ty + 1, 60, 2, "#e8dec6"); }
      for (let tx = 1080; tx < 1800; tx += 24) { A.R(g, tx + 1, cy - 14, 22, 28, "#cfc3a6"); A.R(g, tx + 1, cy - 14, 22, 2, "#e8dec6"); }
      for (const [tx, ty, s] of [[1240, 560, 1.2], [1650, 740, 1], [200, 720, 1], [3000, 860, 1]]) {
        A.pxEllipse(g, tx, ty + 24, 40 * s, 12 * s, "rgba(20,40,10,0.35)"); A.R(g, tx - 6, ty - 10, 12, 34, "#6e4322");
        A.pxEllipse(g, tx, ty - 34, 40 * s, 30 * s, "#3f7f3a"); A.pxEllipse(g, tx - 8, ty - 42, 26 * s, 18 * s, "#5a9e4a"); A.pxEllipse(g, tx + 10, ty - 30, 16 * s, 12 * s, "#4f8f44");
      }
      for (const lx of [1360, 1520]) { A.R(g, lx - 6, cy - 50, 12, 6, "#a8a090"); A.R(g, lx - 4, cy - 44, 8, 22, "#c8c0ae"); A.R(g, lx - 3, cy - 40, 6, 6, "#ffd872"); }
    },
    floorDecor(g, ox, oy, w, h, A) {
      for (const [x, y, ww] of [[360, 612, 720], [1800, 652, 1080]]) { const b = A.clipRect(ox, oy, w, h, { x, y, w: ww, h: 6 }); if (b) { A.R(g, b.x, b.y, b.w, b.h, "#c49e68"); A.R(g, b.x, b.y, b.w, 2, "#e6c892"); } }
    },
    faceDecor(g, wl, top, bottom, A) {
      const x0 = wl.x, x1 = wl.x + wl.w, has = (a, b) => x0 <= a && x1 >= b;
      if (wl.y < 320 && wl.w > wl.h) {
        if (has(2250, 2450)) { A.R(g, 2250, top + 4, 200, 24, "#4e3018"); A.R(g, 2254, top + 6, 192, 20, "#f2e6cc"); A.text(g, "东翼阅览大厅 · 请保持安静", 2350, top + 16, "#5a3418", 9); }
        if (has(2040, 2080)) A.sconce(g, 2060, top + 2);
        if (has(2620, 2660)) A.sconce(g, 2640, top + 2);
        return;
      }
      if (has(2030, 2080)) A.frame(g, 2030, top + 4, 44, 24, "map");
      if (has(2240, 2280)) A.sconce(g, 2260, top + 2);
      if (has(2440, 2480)) A.sconce(g, 2460, top + 2);
      if (has(2630, 2680)) A.frame(g, 2630, top + 4, 44, 24, "flower");
    },
    furniture: {
      grandglobe(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, rx = Math.round(f.w / 2), ry = Math.round(f.h / 2) - 2, cy = by - ry - 2;
        // 八角胡桃木底座 + 黄铜包边
        A.pxEllipse(g, cx, cy + 4, rx, ry, '#4e2c14');
        A.pxEllipse(g, cx, cy, rx, ry, '#7c4824');
        A.pxEllipse(g, cx, cy, rx - 6, ry - 3, '#c89e4c');
        A.pxEllipse(g, cx, cy, rx - 10, ry - 5, '#965c32');
        // 台面摊开的古籍与绿罩台灯
        A.R(g, cx - rx + 18, cy - 6, 22, 12, '#f6ecd2'); A.R(g, cx - rx + 28, cy - 6, 2, 12, '#8a5530');
        A.R(g, cx + rx - 38, cy - 8, 18, 10, '#c9534a'); A.R(g, cx + rx - 36, cy - 12, 14, 6, '#3f7fa8');
        // 中央立柱与黄铜子午环 + 地球仪球体
        A.R(g, cx - 8, cy - 22, 16, 22, '#5e3519'); A.R(g, cx - 12, cy - 4, 24, 6, '#d4a84e');
        const gy = cy - 42;
        A.pxEllipse(g, cx, gy, 24, 24, '#d4a84e');
        A.pxEllipse(g, cx, gy, 20, 20, '#7c4824');
        A.pxEllipse(g, cx, gy, 18, 18, '#4f8fb8');
        // 大陆板块与高光
        A.R(g, cx - 10, gy - 8, 10, 8, '#7ab062'); A.R(g, cx + 2, gy - 2, 10, 8, '#7ab062'); A.R(g, cx - 6, gy + 4, 8, 6, '#8cc070');
        A.R(g, cx - 18, gy - 1, 36, 2, '#e2b85c');
        A.R(g, cx - 8, gy - 12, 4, 4, '#ffffff');
      },
      easel(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, top = by - 64;
        // 木画架三脚支撑
        A.R(g, cx - 16, top + 24, 4, 40, '#7a4a26'); A.R(g, cx + 12, top + 24, 4, 40, '#7a4a26'); A.R(g, cx - 2, top + 20, 4, 42, '#5e3519');
        // 画板与水彩画布
        A.R(g, cx - 20, top + 4, 40, 32, '#8a5530'); A.R(g, cx - 17, top + 7, 34, 26, '#fbf4e2');
        A.R(g, cx - 17, top + 7, 34, 12, '#9ed2e6'); A.R(g, cx - 17, top + 19, 34, 14, '#7ab866');
        A.R(g, cx - 8, top + 11, 8, 8, '#f06f6a'); A.R(g, cx + 4, top + 10, 6, 6, '#ffd25a');
        A.R(g, cx - 22, top + 34, 44, 4, '#6e4322');
        // 调色盘点缀
        A.R(g, cx + 8, top + 32, 10, 3, '#e0b04a');
      },
      gramophone(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        // 红木底座柜
        A.R(g, cx - 20, by - 32, 40, 32, '#5e2c18'); A.R(g, cx - 18, by - 30, 36, 26, '#7c3c22');
        A.R(g, cx - 22, by - 36, 44, 4, '#9a5232');
        // 黑胶唱片转盘
        A.pxEllipse(g, cx, by - 38, 14, 5, '#222428'); A.pxEllipse(g, cx, by - 38, 4, 2, '#d9534a');
        // 黄铜大喇叭
        A.R(g, cx + 6, by - 50, 4, 14, '#c89a42');
        A.pxEllipse(g, cx - 2, by - 58, 16, 12, '#d4a64a');
        A.pxEllipse(g, cx - 3, by - 58, 12, 9, '#f0c868');
        A.pxEllipse(g, cx - 4, by - 58, 6, 5, '#8a6220');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
