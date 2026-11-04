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
    plaque: { x: 1440, text: '晨光迎宾厅 · 欢迎光临', w: 160 },
    exterior: (g, f, A, a) => {
      A.R(g, a.x, a.y, a.w, a.h, "#6aa84f");
      for (let y = a.y; y < a.y + a.h; y += 16) for (let x = a.x; x < a.x + a.w; x += 16) {
        const k = A.hash(x + 7, y + 3);
        if (k < 0.45) { A.R(g, x + 4, y + 6, 2, 4, "#5a9442"); A.R(g, x + 7, y + 4, 2, 6, "#5a9442"); }
        else if (k > 0.985) { A.R(g, x + 6, y + 6, 4, 4, ['#f06f6a', '#ffd25a', '#ffffff'][Math.floor(k * 997) % ['#f06f6a', '#ffd25a', '#ffffff'].length]); A.R(g, x + 7, y + 7, 2, 2, "#fff6d0"); }
      }
      // 外围石板步道环绕建筑
      for (const [x, y, w, h] of [[700 - 72, 440, 48, 360], [2180 + 24, 440, 48, 360], [0, 444, 700 - 72, 40], [2180 + 72, 444, 700, 40]]) {
        for (let ty = y; ty < y + h; ty += 20) for (let tx = x; tx < x + w; tx += 24) { A.R(g, tx + 1, ty + 1, 22, 18, '#cfc3a6'); A.R(g, tx + 1, ty + 1, 22, 2, '#e8dec6'); }
      }
      for (const [tx, ty] of [[180, 620], [420, 700], [2500, 640], [2720, 720]]) { A.pxEllipse(g, tx, ty + 20, 34, 10, 'rgba(30,50,20,0.3)'); A.R(g, tx - 4, ty - 8, 8, 28, '#6e4322'); A.pxEllipse(g, tx, ty - 26, 30, 24, '#4c8c46'); A.pxEllipse(g, tx - 6, ty - 32, 18, 14, '#66b25a'); }
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
      if (has(1220, 1250)) { A.R(g, 1214, top + 4, 124, 26, '#5b3a22'); A.R(g, 1218, top + 6, 116, 22, '#2f3b32'); A.text(g, '今日 · 可颂 / 拿铁', 1224, top + 13, '#f4ecd2', 9, 'left'); A.text(g, '鲜果烘焙 3 筹码', 1224, top + 23, '#ffd27a', 9, 'left'); }
      if (has(880, 960)) { A.sconce(g, 880, top + 2); A.frame(g, 920, top + 4, 40, 24, 'flower'); }
      if (has(1500, 1540)) A.sconce(g, 1520, top + 2);
      if (has(1880, 1990)) for (let i = 0; i < 8; i++) { const fx = 1880 + i * 12, c = ['#f06f6a', '#ffd25a', '#6fc3df', '#8fd07a'][i % 4]; A.R(g, fx, top + 4, 10, 2, '#7a4a26'); A.R(g, fx + 2, top + 6, 6, 4, c); A.R(g, fx + 4, top + 10, 2, 2, c); }
    }
  });
})(typeof window !== "undefined" ? window : globalThis);
