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
    plaque: { x: 1840, text: "云海藏书阁 · 浮岛开卷", w: 168 },
    exterior(g, f, A, a) {
      // 云海浮岛藏书阁：书院悬浮于晴空云海之上，中庭为悬浮灵树书院岛与云中浮石桥
      const sky = ["#82b4dc", "#98c4e6", "#b2d6f0", "#cce6f8"];
      for (let i = 0; i < 4; i++) A.R(g, a.x, a.y + Math.floor(i * a.h / 4), a.w, Math.ceil(a.h / 4) + 2, sky[i]);
      // 翻涌的层叠云海（带暖金天光与淡紫背光阴影）
      for (const [cx, cy, s] of [
        [-220, 180, 1.3], [-140, 520, 1.4], [180, 700, 1.5], [1440, 820, 1.8],
        [1180, 580, 1.2], [1700, 580, 1.2], [2980, 220, 1.3], [3040, 580, 1.5], [1440, -90, 1.6]
      ]) {
        A.pxEllipse(g, cx, cy + 14 * s, 96 * s, 26 * s, "#b8cee8");
        A.pxEllipse(g, cx - 38 * s, cy, 56 * s, 32 * s, "#f4f8ff");
        A.pxEllipse(g, cx + 26 * s, cy - 8 * s, 64 * s, 36 * s, "#ffffff");
        A.pxEllipse(g, cx - 8 * s, cy - 14 * s, 44 * s, 24 * s, "#fff9eb");
      }
      // 中庭南侧的「云中灵树浮岛」（悬浮岩层底座 + 翡翠草坪 + 十字浮石桥）
      const cx = 1440, cy = 640;
      A.pxEllipse(g, cx, cy + 28, 280, 118, "#6a5c50");
      A.pxEllipse(g, cx, cy + 14, 276, 112, "#8e7e6c");
      A.pxEllipse(g, cx, cy, 270, 106, "#cfc3a6");
      A.pxEllipse(g, cx, cy, 252, 96, "#62a452");
      // 连接东西两翼与中央连廊的悬浮白石阶桥
      for (let ty = 472; ty < 760; ty += 26) {
        A.R(g, cx - 32, ty + 4, 64, 18, "#8e7e6c");
        A.R(g, cx - 32, ty, 64, 16, "#e8dec6");
        A.R(g, cx - 28, ty + 2, 56, 3, "#fbf6ea");
      }
      for (let tx = 1084; tx < 1796; tx += 36) {
        A.R(g, tx, cy - 14, 28, 30, "#8e7e6c");
        A.R(g, tx, cy - 18, 28, 26, "#e8dec6");
      }
      // 浮岛古樱灵树与云端石灯笼
      for (const [tx, ty, s, pink] of [[1310, 590, 1.25, true], [1570, 680, 1.1, false], [180, 680, 1.0, true], [-110, 80, 0.9, false], [2990, 80, 0.9, true]]) {
        A.pxEllipse(g, tx, ty + 22, 36 * s, 12 * s, "rgba(30,50,30,0.28)");
        A.R(g, tx - 5, ty - 10, 10, 32, "#6e4322");
        A.pxEllipse(g, tx, ty - 32, 38 * s, 28 * s, pink ? "#e48cb2" : "#488c42");
        A.pxEllipse(g, tx - 8, ty - 40, 24 * s, 18 * s, pink ? "#f8b8d4" : "#64ac56");
      }
      for (const lx of [1368, 1512]) {
        A.R(g, lx - 6, cy - 48, 12, 6, "#a8a090");
        A.R(g, lx - 4, cy - 42, 8, 20, "#d8d0be");
        A.R(g, lx - 3, cy - 38, 6, 6, "#ffe078");
      }
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
