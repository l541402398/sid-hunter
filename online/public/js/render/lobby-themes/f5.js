'use strict';
// 5F · 暖灯古籍廊 主题：石板矿石翼 + 中央星图马赛克圆厅（黄铜星盘仪焦点）+ 拼花观星翼 + 南排标本室/手账坊/暖灯茶室。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const stoneM = { tones: ['#cfc4ae', '#c4b8a0', '#d8ceba', '#b9ad94'], grout: '#8e826c', hi: '#e6decb', lo: '#a69a82' };
  const stoneC = { tones: ['#ded4be', '#d4c8b0', '#e6dec8', '#c8bc9e'], grout: '#9a8e74', hi: '#f2ead8', lo: '#b4a88c' };
  const woodE = { base: '#9c663a', hi: '#b0784a', lo: '#86542c', gap: '#583418', grain: '#7a4a24' };
  const navyCarpet = { base: '#2c3c5a', hi: '#3a4e72', lo: '#1e2a42', pattern: '#d8b464' };

  L.register(5, {
    wall: {
      paper: '#dfd0b0', stripe: '#cfbda0', motif: '#b49e78',
      rail: '#684020', railHi: '#8e5a32', wains: '#7c4c28', wainsLo: '#5e381a', wainsHi: '#986238',
      base: '#3e220e', crown: '#c4b088', cap: '#563418', capHi: '#86542e', capLo: '#2e1808', capTop: '#6c4220', style: 'stone'
    },
    house: { kind: "flat", roof: "#7c6a52", roofHi: "#a8967a", roofLo: "#6a5a44", cornice: "#e2d5b8", column: "#ece2cc", flowerBox: false, glass: "#2e4266", winFrame: "#563418" },
    house: { kind: "flat", roof: "#7c6a52", roofHi: "#a8967a", roofLo: "#6a5a44", cornice: "#e2d5b8", column: "#ece2cc", flowerBox: false, glass: "#2e4266", winFrame: "#563418" },
    zones: [
      { x: 0, y: 0, w: 900, h: 560, mat: "stone", pal: stoneM, seed: 51 },
      { x: 900, y: 0, w: 1080, h: 520, mat: "stone", pal: stoneC, seed: 52 },
      { x: 900, y: 520, w: 1080, h: 280, mat: "planks", pal: woodE, seed: 54 },
      { x: 1980, y: 0, w: 900, h: 560, mat: "parquet", pal: woodE, size: 32 }
    ],
    rugs: [
      { x: 120, y: 372, w: 330, h: 80, fill: "#2c3e60", band: "#1e2c46", trim: "#deb864", motif: "#f0d48c", fringe: "#efe2c0" },
      { x: 2370, y: 420, w: 240, h: 84, fill: "#2c3e60", band: "#1e2c46", trim: "#deb864", motif: "#f0d48c", fringe: "#efe2c0" }
    ],
    windows: [160, 700, 1000, 1620, 1880, 2100, 2700], windowStyle: "arch",
    sconces: [300, 600, 1560, 2240, 2560],
    frames: [[40, "map"], [2780, "night"]],
    plaque: { x: 1440, text: "暖灯古籍廊 · 观星博物", w: 168 },
    exterior(g, f, A, a) {
      // 观星廊外的夜空：深蓝渐层 + 星点 + 一弯新月
      const sky = ["#141c33", "#18223d", "#1c2848", "#212f54"];
      for (let i = 0; i < 4; i++) A.R(g, a.x, a.y + i * a.h / 4, a.w, a.h / 4 + 1, sky[i]);
      for (let y = a.y; y < a.y + a.h; y += 10) for (let x = a.x; x < a.x + a.w; x += 10) { const k = A.hash(x + 13, y + 29); if (k > 0.985) A.R(g, x, y, 2, 2, "#ffffff"); else if (k > 0.975) A.R(g, x, y, 2, 2, "#ffe89c"); }
      A.pxEllipse(g, 400, 680, 34, 34, "#fff3c0"); A.pxEllipse(g, 414, 672, 30, 30, "#18223d");
    },
    floorDecor(g, ox, oy, w, h, A) {
      const OR = { cx: 1440, cy: 300 };
      const a = A.clipRect(ox, oy, w, h, { x: 900, y: 112, w: 1080, h: 408 });
      if (a) A.withClip(g, a, () => {
        A.pxEllipse(g, OR.cx, OR.cy, 260, 136, "#c8a252"); A.pxEllipse(g, OR.cx, OR.cy, 250, 130, "#23324e");
        A.pxEllipse(g, OR.cx, OR.cy, 192, 98, "#d8b464"); A.pxEllipse(g, OR.cx, OR.cy, 186, 94, "#2c3e60");
        A.pxEllipse(g, OR.cx, OR.cy, 120, 60, "#d8b464"); A.pxEllipse(g, OR.cx, OR.cy, 114, 56, "#1e2c46");
        A.R(g, OR.cx - 240, OR.cy - 1, 480, 2, "#d8b464"); A.R(g, OR.cx - 1, OR.cy - 124, 2, 248, "#d8b464");
        for (let i = 0; i < 12; i++) { const ang = i / 12 * Math.PI * 2; A.R(g, Math.round(OR.cx + Math.cos(ang) * 152) - 2, Math.round(OR.cy + Math.sin(ang) * 76) - 2, 4, 4, "#ffe89c"); }
      });
      const b = A.clipRect(ox, oy, w, h, { x: 2060, y: 390, w: 240, h: 100 });
      if (b) A.withClip(g, b, () => { A.pxEllipse(g, 2180, 440, 110, 44, "#c8a252"); A.pxEllipse(g, 2180, 440, 102, 39, "#283856"); });
    },
    furniture: {
      pedestal(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 18, by - 28, 36, 28, '#bfb298'); A.R(g, cx - 16, by - 26, 32, 22, '#dcd0b8');
        A.R(g, cx - 20, by - 32, 40, 4, '#8e3236');
        // 玻璃罩内展品（紫晶洞 / 陨石 / 琥珀）
        A.R(g, cx - 14, by - 54, 28, 22, 'rgba(205,235,245,0.45)');
        const c = /紫晶/.test(f.label) ? ['#8a52c8', '#b882f0'] : /琥珀/.test(f.label) ? ['#e08a2e', '#ffc252'] : ['#5c626c', '#8e96a2'];
        A.pxEllipse(g, cx, by - 40, 10, 8, c[0]); A.pxEllipse(g, cx - 2, by - 42, 6, 5, c[1]);
        A.R(g, cx - 12, by - 52, 2, 18, 'rgba(255,255,255,0.65)');
      },
      globe(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.pxEllipse(g, cx, by - 6, 20, 8, '#5e3519');
        A.R(g, cx - 4, by - 22, 8, 16, '#7a4a26');
        A.pxEllipse(g, cx, by - 36, 18, 18, '#d4a84e');
        A.pxEllipse(g, cx, by - 36, 14, 14, '#2c4268');
        A.R(g, cx - 16, by - 37, 32, 2, '#f0c868');
        A.R(g, cx - 6, by - 42, 4, 4, '#ffe89c');
      },
      starcase(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 38, w, 38, '#5e3519'); A.R(g, x + 3, by - 35, w - 6, 30, '#7a4a26');
        A.R(g, x + 4, by - 48, w - 8, 16, '#cde6f0');
        A.R(g, x + 10, by - 45, 32, 10, '#f4e6c2'); A.R(g, x + 50, by - 45, 32, 10, '#283856');
        A.pxEllipse(g, x + 66, by - 40, 6, 4, '#ffd25a');
      },
      orrery(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h, rx = Math.round(f.w / 2), ry = Math.round(f.h / 2) - 2, cy = by - ry - 2;
        // 双层胡桃木与黄铜底座
        A.pxEllipse(g, cx, cy + 5, rx, ry, '#3e220e');
        A.pxEllipse(g, cx, cy, rx, ry, '#6e4220');
        A.pxEllipse(g, cx, cy, rx - 8, ry - 4, '#d4a64a');
        A.pxEllipse(g, cx, cy, rx - 14, ry - 7, '#22304c');
        // 轨道铜环与行星球体
        for (const [orx, ory] of [[rx - 22, ry - 11], [rx - 44, ry - 20], [rx - 66, ry - 28]]) {
          A.pxEllipse(g, cx, cy - 10, orx, ory, '#d4a64a');
          A.pxEllipse(g, cx, cy - 10, orx - 3, ory - 2, '#22304c');
        }
        // 中央浑天黄铜环架 + 耀金太阳球
        A.R(g, cx - 6, cy - 36, 12, 28, '#b88832');
        A.pxEllipse(g, cx, cy - 42, 34, 24, '#d4a64a');
        A.pxEllipse(g, cx, cy - 42, 28, 19, '#22304c');
        A.pxEllipse(g, cx, cy - 42, 14, 14, '#ffae38');
        A.pxEllipse(g, cx - 2, cy - 44, 9, 9, '#ffe678');
        // 轨道行星（蓝地球、红火星、金土星）
        A.pxEllipse(g, cx - 54, cy - 12, 7, 7, '#4f9cd6');
        A.pxEllipse(g, cx + 48, cy - 18, 6, 6, '#e0624e');
        A.pxEllipse(g, cx + 74, cy - 4, 8, 6, '#e8bc58');
      },
      lamppost(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        A.R(g, cx - 7, by - 4, 14, 4, '#5a3a18');
        A.R(g, cx - 2, by - 58, 4, 54, '#b88a38');
        A.R(g, cx - 10, by - 72, 20, 14, '#ffd872');
        A.R(g, cx - 12, by - 74, 24, 3, '#7a521c');
        g.fillStyle = 'rgba(255,216,110,0.18)'; g.fillRect(cx - 28, by - 84, 56, 40);
      },
      telescope(g, f, A) {
        const cx = Math.round(f.x + f.w / 2), by = f.y + f.h;
        // 红木三脚架
        A.R(g, cx - 18, by - 28, 4, 28, '#6e3e1e'); A.R(g, cx + 14, by - 28, 4, 28, '#6e3e1e'); A.R(g, cx - 2, by - 32, 4, 32, '#542e14');
        // 黄铜斜向镜筒
        for (let i = 0; i < 8; i++) {
          A.R(g, cx - 22 + i * 5, by - 34 - i * 3, 12, 8, i === 7 ? '#f0d278' : '#c8983e');
          A.R(g, cx - 22 + i * 5, by - 34 - i * 3, 12, 2, '#f0c868');
        }
        A.pxEllipse(g, cx + 22, by - 54, 6, 8, '#8ad4f0');
      },
      specimencase(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 76, top = by - H;
        A.R(g, x, top, w, H, '#542e14'); A.R(g, x + 4, top + 6, w - 8, H - 14, '#362214');
        A.R(g, x - 2, top - 4, w + 4, 6, '#8e562e');
        for (let s = 0; s < 3; s++) {
          const sy = top + 22 + s * 22;
          A.R(g, x + 4, sy, w - 8, 3, '#7a4a26');
          for (let i = 0; i < 4; i++) {
            A.R(g, x + 10 + i * 26, sy - 10, 14, 10, ['#e89632', '#9a62d8', '#5fb8b0', '#ffd25a'][(s + i) % 4]);
          }
        }
        A.R(g, x + 6, top + 8, 3, H - 18, 'rgba(255,255,255,0.4)');
      },
      starboard(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), top = by - 68;
        A.R(g, x + 8, top + 36, 4, 32, '#5e3519'); A.R(g, x + w - 12, top + 36, 4, 32, '#5e3519');
        A.R(g, x, top, w, 42, '#8a5530'); A.R(g, x + 4, top + 4, w - 8, 34, '#1e2c46');
        A.pxEllipse(g, x + 36, top + 21, 14, 14, '#d8b464');
        A.pxEllipse(g, x + 36, top + 21, 12, 12, '#1e2c46');
        for (let i = 0; i < 6; i++) A.R(g, x + 64 + i * 10, top + 12 + (i % 3) * 7, 3, 3, '#ffe89c');
        A.text(g, '黄道十二宫星图', x + w / 2 + 12, top + 28, '#f0d890', 9);
      },
      craftdesk(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x + 4, by - 18, 6, 18, '#5e3519'); A.R(g, x + w - 10, by - 18, 6, 18, '#5e3519');
        A.R(g, x, by - 34, w, 18, '#965e34'); A.R(g, x, by - 34, w, 2, '#b87c4c');
        // 手账本、火漆印章与和纸胶带架
        A.R(g, x + 16, by - 40, 28, 8, '#f6ecd2'); A.R(g, x + 29, by - 40, 2, 8, '#8a5530');
        A.R(g, x + 54, by - 42, 8, 8, '#c94a45');
        for (let i = 0; i < 4; i++) A.R(g, x + 76 + i * 10, by - 42, 8, 8, ['#f2a2b8', '#6fc3df', '#ffd25a', '#8fd07a'][i]);
        A.R(g, x + w - 22, by - 48, 12, 14, '#ffd872');
      },
      teacounter(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        A.R(g, x, by - 32, w, 32, '#6e4220'); A.R(g, x + 2, by - 30, w - 4, 26, '#8e5830');
        A.R(g, x - 2, by - 38, w + 4, 6, '#d8c8a8');
        // 黄铜茶炊与青瓷茶罐
        A.R(g, x + 16, by - 58, 18, 20, '#d4a64a'); A.R(g, x + 20, by - 62, 10, 4, '#b88832');
        for (let i = 0; i < 4; i++) A.R(g, x + 52 + i * 20, by - 48, 12, 10, i % 2 ? '#7ab4a0' : '#d96a52');
      },
      teatable(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w);
        // 蒲团坐垫
        A.pxEllipse(g, x + 22, by - 4, 14, 6, '#c89e58'); A.pxEllipse(g, x + w - 22, by - 4, 14, 6, '#c89e58');
        A.R(g, x, by - 24, w, 14, '#7c4824'); A.R(g, x, by - 24, w, 2, '#a4683c');
        A.R(g, x + 6, by - 10, 6, 10, '#542e14'); A.R(g, x + w - 12, by - 10, 6, 10, '#542e14');
        // 青瓷茶壶与桂花瓶
        A.pxEllipse(g, x + 34, by - 28, 8, 6, '#88c2b4');
        A.R(g, x + w - 32, by - 34, 8, 10, '#e8dec8'); A.R(g, x + w - 34, by - 40, 12, 6, '#ffd25a');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
