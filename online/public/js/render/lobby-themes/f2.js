'use strict';
// 2F · 晴空绿茵场 主题：西东枫木球馆地板 + 中央室内绿茵球场（白线/中圈/禁区）+ 南排更衣室与能量吧。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const mapleA = { base: '#d49b5e', hi: '#e3ad72', lo: '#bf864c', gap: '#8e5d30', grain: '#b57b42' };
  const mapleB = { base: '#c99054', hi: '#d8a166', lo: '#b47c44', gap: '#86562c', grain: '#a8703b' };
  const turfP = { base: '#5aa64c', blade: '#4c9240', lo: '#448439', hi: '#74bf62' };
  const tileA = { tones: ['#e8dec4', '#dfd2b4', '#efe6cf', '#d6c7a6'], grout: '#b2a07c', hi: '#f7f0de', lo: '#c4b38e' };

  L.register(2, {
    wall: {
      paper: '#e8eff4', stripe: '#d4e2ec', motif: '#b8cde0',
      rail: '#8a5832', railHi: '#b47848', wains: '#b87e4a', wainsLo: '#966234', wainsHi: '#cf9660',
      base: '#5c361a', crown: '#c8d8e4', cap: '#6e4524', capHi: '#9e6c40', capLo: '#3e2412', capTop: '#84542e', style: 'panel'
    },
    fence: { post: "#f6f2ea", postLo: "#c9c0ac", rail: "#ece4d2", railLo: "#b8ac92" },
    fence: { post: "#f6f2ea", postLo: "#c9c0ac", rail: "#ece4d2", railLo: "#b8ac92" },
    zones: [
      { x: 0, y: 0, w: 720, h: 800, mat: "planks", pal: mapleA, seed: 21 },
      { x: 720, y: 0, w: 1480, h: 300, mat: "parquet", pal: mapleB, size: 32 },
      { x: 720, y: 300, w: 1480, h: 398, mat: "grass", pal: turfP, seed: 22 },
      { x: 720, y: 698, w: 1480, h: 102, mat: "tiles", pal: tileA, size: 32 },
      { x: 2200, y: 0, w: 680, h: 800, mat: "planks", pal: mapleB, seed: 23 }
    ],
    rugs: [
      { x: 330, y: 300, w: 280, h: 96, fill: "#2e6b4e", band: "#204e38", trim: "#f0c862", motif: "#fae08c", fringe: "#f4ead0" },
      { x: 2228, y: 278, w: 320, h: 96, fill: "#356288", band: "#244664", trim: "#f0c862", motif: "#d6e8f5", fringe: "#f4ead0" }
    ],
    windows: [150, 760, 1180, 1660, 2140, 2380, 2730], windowStyle: "square",
    sconces: [700, 1300, 1560, 2060],
    frames: [[340, "land"], [2620, "flower"]],
    plaque: { x: 1460, text: "晴空绿茵场 · 友谊第一", w: 168 },
    exterior(g, f, A, a) {
      // 体育场看台：一排排彩色座椅 + 过道台阶
      A.R(g, a.x, a.y, a.w, a.h, "#3d4a5c");
      const cols = ["#d9534a", "#f2c14e", "#4f9cc8", "#f4f4f4"];
      for (let y = a.y, r = 0; y < a.y + a.h; y += 20, r++) {
        A.R(g, a.x, y + 16, a.w, 4, "#2a3442");
        for (let x = a.x; x < a.x + a.w; x += 18) {
          if (Math.floor(x / 18) % 12 === 0) { A.R(g, x, y, 18, 16, "#8e96a2"); continue; }
          const c = cols[(Math.floor(x / 216) + r) % cols.length];
          A.R(g, x + 3, y + 4, 12, 10, c); A.R(g, x + 3, y + 4, 12, 2, "rgba(255,255,255,0.35)");
        }
      }
    },
    floorDecor(g, ox, oy, w, h, A) {
      const pitch = { x: 760, y: 330, w: 1400, h: 336 };
      const a = A.clipRect(ox, oy, w, h, { x: 728, y: 308, w: 1464, h: 382 });
      if (a) A.withClip(g, a, () => {
        for (let sx = pitch.x; sx < pitch.x + pitch.w; sx += 80) if (((sx - pitch.x) / 80) % 2 === 1) A.R(g, sx, 308, 40, 382, "rgba(255,255,255,0.07)");
        const W = "#f4f8ee";
        A.R(g, pitch.x, pitch.y, pitch.w, 4, W); A.R(g, pitch.x, pitch.y + pitch.h - 4, pitch.w, 4, W);
        A.R(g, pitch.x, pitch.y, 4, pitch.h, W); A.R(g, pitch.x + pitch.w - 4, pitch.y, 4, pitch.h, W);
        const mx = pitch.x + pitch.w / 2, my = pitch.y + pitch.h / 2;
        A.R(g, mx - 2, pitch.y, 4, pitch.h, W);
        A.pxEllipse(g, mx, my, 62, 46, W); A.pxEllipse(g, mx, my, 58, 42, "#5aa64c"); A.pxEllipse(g, mx, my, 6, 6, W);
        const boxH = 170, boxW = 120, by = my - boxH / 2;
        A.R(g, pitch.x, by, boxW, 4, W); A.R(g, pitch.x, by + boxH - 4, boxW, 4, W); A.R(g, pitch.x + boxW - 4, by, 4, boxH, W);
        A.R(g, pitch.x + pitch.w - boxW, by, boxW, 4, W); A.R(g, pitch.x + pitch.w - boxW, by + boxH - 4, boxW, 4, W); A.R(g, pitch.x + pitch.w - boxW, by, 4, boxH, W);
        for (const [bx, by2] of [[1320, 460], [1640, 560]]) { A.pxEllipse(g, bx + 2, by2 + 3, 7, 4, "rgba(30,50,20,0.35)"); A.pxEllipse(g, bx, by2, 7, 7, "#f7f9fb"); A.R(g, bx - 2, by2 - 2, 4, 4, "#2a3036"); }
      });
      const st = A.clipRect(ox, oy, w, h, { x: 720, y: 268, w: 1480, h: 24 });
      if (st) { A.R(g, st.x, st.y, st.w, st.h, "#b8865a"); A.R(g, st.x, st.y, st.w, 2, "#d8a678"); A.R(g, st.x, st.y + 22, st.w, 2, "#7c4c28"); }
    },
    backDecor(g, f, A) {
      // 北墙彩色队旗三角锦旗
      const cols = ['#e05a4c', '#f2c14e', '#4f9cc8', '#5fb368'];
      for (const [x0, x1] of [[760, 960], [1980, 2180]]) {
        A.R(g, x0, 18, x1 - x0, 2, '#6e4322');
        for (let x = x0 + 6, i = 0; x < x1 - 14; x += 18, i++) {
          const c = cols[i % cols.length];
          A.R(g, x, 20, 12, 6, c); A.R(g, x + 2, 26, 8, 4, c); A.R(g, x + 4, 30, 4, 4, c);
        }
      }
    },
    furniture: {
      trophycase(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), H = 76, top = by - H;
        A.R(g, x, top, w, H, '#5e3519'); A.R(g, x + 4, top + 6, w - 8, H - 14, '#27453a');
        A.R(g, x - 2, top - 4, w + 4, 6, '#9a6236');
        for (let s = 1; s < 3; s++) A.R(g, x + 4, top + 6 + s * 20, w - 8, 3, '#8a5530');
        // 金杯与银杯
        for (let i = 0; i < 3; i++) {
          const cx = x + 18 + i * Math.floor((w - 36) / 2);
          A.R(g, cx - 5, top + 18, 10, 6, '#ffd25a'); A.R(g, cx - 2, top + 24, 4, 2, '#d49b35');
          A.R(g, cx - 6, top + 36, 12, 8, i === 1 ? '#ffd25a' : '#dce4ec'); A.R(g, cx - 3, top + 44, 6, 2, '#8a5530');
          A.R(g, cx - 5, top + 56, 10, 6, '#e89a54');
        }
        A.R(g, x + 6, top + 8, 3, H - 18, 'rgba(255,255,255,0.45)');
        A.R(g, x, by - 6, w, 6, '#4a2a14');
      },
      goalpost(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), h = Math.round(f.h), top = by - h - 26;
        const west = x < 1400;
        // 球网阴影与网格
        A.R(g, x + 2, top + 6, w - 4, h + 18, 'rgba(235,244,248,0.28)');
        for (let gx = x + 6; gx < x + w - 4; gx += 8) A.R(g, gx, top + 6, 1, h + 18, 'rgba(220,235,240,0.55)');
        for (let gy = top + 10; gy < by - 4; gy += 8) A.R(g, x + 4, gy, w - 8, 1, 'rgba(220,235,240,0.55)');
        // 白色门框立柱与横梁
        const frontX = west ? x + w - 6 : x;
        const backX = west ? x : x + w - 4;
        A.R(g, backX, top + 6, 4, h + 18, '#cfd8e0');
        A.R(g, x, top, w, 5, '#ffffff'); A.R(g, x, top + 5, w, 2, '#b8c4ce');
        A.R(g, x, by - 4, w, 4, '#cfd8e0');
        A.R(g, frontX, top, 6, h + 26, '#ffffff'); A.R(g, frontX + (west ? 4 : 0), top, 2, h + 26, '#b8c4ce');
        // 红白警示贴纹
        for (let py = top + 8; py < by - 8; py += 16) A.R(g, frontX + 1, py, 4, 6, '#e05a4c');
      },
      ballrack(g, f, A) {
        const x = Math.round(f.x), by = f.y + f.h, w = Math.round(f.w), top = by - 48;
        A.R(g, x + 2, top, 4, 48, '#4a525a'); A.R(g, x + w - 6, top, 4, 48, '#4a525a');
        for (const sy of [top + 16, top + 36]) {
          A.R(g, x + 2, sy, w - 4, 3, '#6c7680');
          for (let bx = x + 12, i = 0; bx < x + w - 10; bx += 16, i++) {
            const orange = (i + (sy > top + 20 ? 1 : 0)) % 2 === 0;
            A.pxEllipse(g, bx, sy - 6, 6, 6, orange ? '#e07838' : '#f4f7fa');
            A.R(g, bx - 2, sy - 7, 4, 2, orange ? '#8a3e18' : '#2c3238');
          }
        }
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
