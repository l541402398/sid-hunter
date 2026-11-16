'use strict';
// 2F · 研发运动健康馆 主题：温暖像素现代研发大楼（蜂蜜枫木运动地板 + 室内减震绿茵球场 + 胡桃木玻璃套间 + 写实园区运动绿地）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const mapleA = { base: '#c68d53', hi: '#d8a167', lo: '#ad7640', gap: '#784c28', grain: '#9e6838' };
  const mapleB = { base: '#bd844b', hi: '#cf985f', lo: '#a46e39', gap: '#704624', grain: '#945f33' };
  const mapleCourt = { base: '#cf965a', hi: '#e0aa6e', lo: '#b87f46', gap: '#87572e', grain: '#ab743e' };
  const turfA = { base: '#4f9e48', hi: '#72c45e', lo: '#3e8439', blade: '#337030' };
  const turfB = { base: '#469140', hi: '#68b854', lo: '#377832', blade: '#2d632a' };
  // 严格避开 7F sports 检测色 RGB(217,204,163)±6
  const stoneP = { tones: ['#ece4d6', '#e4dac9', '#f2ece0', '#cfc2ae'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };

  const custom = {
    trophycase(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w), H = 74, top = by - H;
      A.outlineBox(g, x, top, w, H, '#5c3822', '#9c6640', '#382015');
      A.outlineBox(g, x - 2, top - 4, w + 4, 8, '#8a5530', '#ba814f', '#522f19');
      A.outlineBox(g, x + 4, top + 6, w - 8, H - 16, '#cde6f0', '#effafe', '#8ab4c4', A.OUT_COOL);
      for (let s = 0; s < 2; s++) {
        const sy = top + 28 + s * 24;
        A.R(g, x + 6, sy, w - 12, 4, '#6e4326');
        A.R(g, x + 6, sy, w - 12, 2, '#9e6842');
        const cols = Math.max(2, Math.floor((w - 18) / 28));
        for (let i = 0; i < cols; i++) {
          const tx = A.snap2(x + 12 + i * ((w - 24) / Math.max(1, cols)));
          const silver = (i + s) % 3 === 1;
          A.outlineBox(g, tx + 2, sy - 14, 12, 10, silver ? '#b8c6d4' : '#eab84e', silver ? '#eef4fa' : '#fff0a6', silver ? '#748496' : '#a87422', A.OUT);
          A.R(g, tx + 6, sy - 4, 4, 4, silver ? '#748496' : '#a87422');
        }
      }
      A.R(g, x + 8, top + 10, 2, H - 24, '#f8fcff');
    },
    goalpost(g, f, A) {
      const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h), left = f.x < 1500;
      A.R(g, x - 2, y - 2, w + 4, h + 4, A.OUT_COOL);
      A.R(g, x + 2, y + 2, w - 4, h - 4, '#2e633c');
      for (let py = y + 6; py < y + h - 4; py += 8) A.R(g, x + 4, py, w - 8, 2, '#cfdde8');
      for (let px = x + 6; px < x + w - 4; px += 8) A.R(g, px, y + 4, 2, h - 8, '#cfdde8');
      const barX = left ? x + w - 8 : x;
      A.outlineBox(g, x, y, w, 6, '#e4ecf2', '#f8fcff', '#9aaab8', A.OUT_COOL);
      A.outlineBox(g, x, y + h - 6, w, 6, '#e4ecf2', '#f8fcff', '#9aaab8', A.OUT_COOL);
      A.outlineBox(g, barX, y, 8, h, '#eef4f8', '#f8fcff', '#9aaab8', A.OUT_COOL);
    },
    hoopstand(g, f, A) {
      const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h);
      const cy = A.snap2(y + h / 2), by = y + h;
      // 配重软包底座（右侧立柱向西挑臂）
      A.outlineBox(g, x + w - 26, cy - 16, 24, 34, '#36424f', '#5c6d80', '#202832', A.OUT_COOL);
      A.R(g, x + w - 22, cy - 10, 8, 22, '#c88d55');
      // 立柱与斜撑挑臂
      A.outlineBox(g, x + w - 16, y + 6, 8, cy - y, '#4a5664', '#7a8a9c', '#29313a', A.OUT_COOL);
      A.outlineBox(g, x + 16, y + 10, w - 28, 6, '#4a5664', '#7a8a9c', '#29313a', A.OUT_COOL);
      // 钢化玻璃篮板（深古铜外框 + 冰蓝玻璃 + 橙红瞄准框）
      A.outlineBox(g, x + 8, y, 12, 54, '#cbe4f0', '#f4fbfe', '#82adc0', A.OUT_COOL);
      A.R(g, x + 10, y + 18, 6, 16, '#d95b43');
      A.R(g, x + 12, y + 20, 2, 12, '#cbe4f0');
      // 篮筐与像素球网
      A.outlineBox(g, x, y + 22, 12, 12, '#e06344', '#f79468', '#9c3824', A.OUT);
      A.R(g, x + 2, y + 34, 8, 8, '#dce6f0');
      A.R(g, x + 4, y + 36, 4, 6, '#9eb0c2');
      // 底座旁备用篮球
      A.pxEllipse(g, x + w - 18, by - 8, 8, 8, A.OUT);
      A.pxEllipse(g, x + w - 18, by - 8, 6, 6, '#df7a38');
      A.R(g, x + w - 20, by - 12, 4, 2, '#f5a862');
    },
    pingpong(g, f, A) {
      const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h), by = y + h;
      const mx = A.snap2(x + w / 2);
      // 折叠金属桌腿与红轮横梁
      for (const lx of [x + 14, mx - 12, mx + 6, x + w - 20]) {
        A.R(g, lx, by - 16, 6, 16, A.OUT_COOL);
        A.R(g, lx + 2, by - 14, 2, 12, '#54606e');
      }
      A.R(g, mx - 10, by - 8, 20, 4, '#36404c');
      // 3/4 赛事级深海蓝台面 + 暖白边线 + 中线
      const ty = by - 42, th = 28;
      A.outlineBox(g, x, ty, w, th, '#2b587a', '#4d82a8', '#1b3b54', A.OUT_COOL);
      A.R(g, x + 4, ty + 4, w - 8, 2, '#f2f6fa');
      A.R(g, x + 4, ty + th - 6, w - 8, 2, '#dce6f0');
      A.R(g, x + 4, ty + 4, 2, th - 8, '#f2f6fa');
      A.R(g, x + w - 6, ty + 4, 2, th - 8, '#dce6f0');
      A.R(g, x + 8, ty + A.snap2(th / 2), w - 16, 2, '#9ec2dc');
      // 中央球网（立柱 + 白顶网带）
      A.R(g, mx - 2, ty - 6, 4, th + 8, A.OUT_COOL);
      A.R(g, mx - 2, ty - 6, 4, 4, '#f4f8fc');
      A.R(g, mx, ty - 2, 2, th, '#8ea6ba');
      // 球拍一对与三星橙球
      A.outlineBox(g, x + 18, ty + 8, 12, 10, '#cf4e42', '#ee7868', '#8c2d26', A.OUT);
      A.R(g, x + 14, ty + 12, 4, 4, '#c48a52');
      A.outlineBox(g, x + w - 32, ty + 12, 12, 10, '#2c3642', '#526070', '#181e26', A.OUT_COOL);
      A.R(g, x + w - 20, ty + 16, 4, 4, '#c48a52');
      A.R(g, mx + 16, ty + 10, 4, 4, '#ffa63e');
    },
    dumbbellrack(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      // 3/4 双层深钢哑铃壶铃架
      A.outlineBox(g, x + 2, by - 42, 8, 42, '#46505c', '#748292', '#282f38', A.OUT_COOL);
      A.outlineBox(g, x + w - 10, by - 42, 8, 42, '#46505c', '#748292', '#282f38', A.OUT_COOL);
      for (const [ry, weights] of [[by - 34, ['#3a4450', '#487699', '#c95c48']], [by - 18, ['#3a4450', '#568c58', '#d99e32']]]) {
        A.outlineBox(g, x + 6, ry, w - 12, 6, '#2d3540', '#525e6c', '#1a2028', A.OUT_COOL);
        let dx = x + 14, i = 0;
        while (dx < x + w - 24) {
          const col = weights[i % weights.length];
          A.R(g, dx, ry - 6, 4, 8, A.OUT_COOL);
          A.R(g, dx + 2, ry - 4, 2, 4, col);
          A.R(g, dx + 4, ry - 4, 6, 2, '#9aa8b8');
          A.R(g, dx + 10, ry - 6, 4, 8, A.OUT_COOL);
          A.R(g, dx + 10, ry - 4, 2, 4, col);
          dx += 20; i++;
        }
      }
    },
    ballrack(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      A.outlineBox(g, x, by - 44, 6, 44, '#5a626c', '#929ca6', '#2e343c', A.OUT_COOL);
      A.outlineBox(g, x + w - 6, by - 44, 6, 44, '#5a626c', '#929ca6', '#2e343c', A.OUT_COOL);
      for (const [ry, off] of [[by - 34, 0], [by - 16, 1]]) {
        A.R(g, x + 4, ry, w - 8, 4, '#363c44');
        for (let bx = x + 14; bx < x + w - 12; bx += 22) {
          A.pxEllipse(g, bx, ry - 6, 8, 8, A.OUT_COOL);
          A.pxEllipse(g, bx, ry - 6, 6, 6, off ? '#e2843a' : '#f2efe8');
          A.R(g, bx - 2, ry - 8, 4, 4, off ? '#a85220' : '#2c3644');
        }
      }
    }
  };

  L.register(2, {
    wall: {
      style: 'modern',
      paper: '#f1e9db', stripe: '#d1c4af', panelHi: '#fbf7f0', motif: '#d1c4af',
      rail: '#82522e', railHi: '#b57b4e',
      wains: '#99643b', wainsLo: '#704424', wainsHi: '#c48a5c',
      base: '#452818', crown: '#e8decb',
      cap: '#754829', capHi: '#ad7348', capLo: '#2d1c22', capTop: '#8f5a36'
    },
    door: { frame: '#38241d', frameHi: '#a67046', leaf: '#965f38', plank: '#6e4222', lintel: '#4f2e1d', glass: '#e8f4fa' },
    plaquePal: { bg: '#3b2b24', hi: '#785a48', edge: '#1e1518', ink: '#fbf2dc' },
    fence: { post: '#c48a52', postLo: '#87562d', rail: '#ebe3d5', railLo: '#9e9282' },
    zones: [
      // 100% 覆盖 2F 多边形外轮廓（含全部退台翼与隔墙门洞带）
      { x: 0, y: 128, w: 352, h: 512, mat: 'planks', pal: mapleA, seed: 21 },
      { x: 352, y: 0, w: 568, h: 708, mat: 'planks', pal: mapleA, seed: 22 },
      { x: 920, y: 0, w: 1616, h: 296, mat: 'stone', pal: stoneP, seed: 23, tw: 64, th: 48 },
      { x: 920, y: 296, w: 1128, h: 360, mat: 'grass', pal: turfA, seed: 24 },
      { x: 2048, y: 296, w: 488, h: 360, mat: 'planks', pal: mapleCourt, seed: 25 },
      { x: 920, y: 656, w: 1616, h: 52, mat: 'stone', pal: stoneP, seed: 26, tw: 64, th: 48 },
      { x: 2536, y: 0, w: 568, h: 708, mat: 'planks', pal: mapleB, seed: 27 },
      { x: 3104, y: 128, w: 352, h: 512, mat: 'planks', pal: mapleB, seed: 28 },
      { x: 352, y: 708, w: 2752, h: 16, mat: 'planks', pal: mapleA, seed: 29 },
      { x: 352, y: 724, w: 784, h: 236, mat: 'parquet', pal: mapleB },
      { x: 1136, y: 724, w: 1200, h: 236, mat: 'stone', pal: stoneP, seed: 30, tw: 64, th: 48 },
      { x: 2336, y: 724, w: 768, h: 236, mat: 'planks', pal: mapleA, seed: 31 }
    ],
    rugs: [
      { x: 376, y: 286, w: 272, h: 146, fill: '#3d6b58', band: '#294a3c', trim: '#e0bc72', motif: '#f0d89a', fringe: '#f2ead8' },
      { x: 2584, y: 262, w: 320, h: 92, fill: '#486884', band: '#2e465c', trim: '#e0bc72', motif: '#f0d89a', fringe: '#f2ead8' }
    ],
    windows: [180, 740, 1460, 2056, 2716, 3276], windowStyle: 'curtain',
    sconces: [660, 1148, 1568, 2308, 2796],
    frames: [[968, 'land', 48, 28], [2424, 'map', 48, 28]],
    plaque: { x: 1728, text: 'CQRD · 研发运动健康馆', w: 204 },
    // 写实研发园区运动绿地外景（全陆地公园草坪 + 石板慢跑径 + 遮阴乔木，零河流泊船/浮标，严避东西电梯翼）
    exterior: L.API.biomeExterior({
      pal: L.API.biomePal({
        24: '#542838', 25: '#8c3d58', 26: '#cf6488', 27: '#f2a6be', 28: '#ffe4ee',
        46: '#c95c48', 47: '#487699', 48: '#e2be6e'
      }),
      extraLand: [{ rect: [-640, -320, 4736, 1600] }],
      extraPaths: [
        { style: 'stone', pts: [[-560, 1024, 24], [480, 1028, 24], [1728, 1024, 26], [2980, 1028, 24], [4020, 1024, 24]] }
      ],
      flowers: [43, 44, 42], flowerRate: 0.08, tuftRate: 0.20,
      treeLines: [
        { y: -252, x0: -580, x1: 4040, step: 136, rows: 2, dy: 52, kinds: ['oak', 'pine', 'oak', 'sakura'] },
        { y: 1216, x0: -580, x1: 4040, step: 140, rows: 1, dy: 48, kinds: ['oak', 'pine', 'oak', 'sakura'] }
      ],
      decor: [
        ['tree', -360, 120, 'oak'], ['pine', -420, 480], ['tree', -340, 760, 'sakura'],
        ['pine', 3820, 120], ['tree', 3880, 480, 'oak'], ['tree', 3800, 760, 'sakura'],
        ['bench', 900, 1072], ['bench', 2480, 1072], ['lamp', 836, 1114], ['lamp', 2580, 1114],
        ['bush', 640, 1080, 1], ['bush', 1420, 1080, 2], ['bush', 2040, 1080, 1], ['bush', 2820, 1080, 2]
      ]
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 1) 西侧室内减震绿茵五人球场：交替修剪条纹 + 2× 暖白球场边线、中圈与禁区
      const turf = A.clipRect(ox, oy, w, h, { x: 936, y: 304, w: 1112, h: 352 });
      if (turf) A.withClip(g, turf, () => {
        for (let sx = 936, i = 0; sx < 2048; sx += 96, i++) {
          if (i % 2) L.API.MATS.grass(g, { x: sx, y: 304, w: Math.min(96, 2048 - sx), h: 352 }, turfB, 40 + i);
        }
        const ink = '#f6f2e4', px0 = 980, py0 = 320, pw = 1008, ph = 312;
        A.R(g, px0, py0, pw, 4, ink); A.R(g, px0, py0 + ph - 4, pw, 4, ink);
        A.R(g, px0, py0, 4, ph, ink); A.R(g, px0 + pw - 4, py0, 4, ph, ink);
        const mcx = A.snap2(px0 + pw / 2), mcy = A.snap2(py0 + ph / 2);
        A.R(g, mcx - 2, py0, 4, ph, ink);
        for (let a = 0; a < 40; a++) {
          const r = a / 40 * Math.PI * 2;
          A.R2(g, mcx + Math.cos(r) * 56 - 2, mcy + Math.sin(r) * 44 - 2, 4, 4, ink);
        }
        A.R2(g, mcx - 4, mcy - 4, 8, 8, ink);
        for (const [bx, s] of [[px0, 1], [px0 + pw, -1]]) {
          const x1 = s > 0 ? bx : bx - 112;
          A.R(g, x1, mcy - 76, 112, 4, ink); A.R(g, x1, mcy + 72, 112, 4, ink);
          A.R(g, s > 0 ? bx + 108 : bx - 112, mcy - 76, 4, 152, ink);
        }
      });

      // 2) 东侧枫木篮球半场：赤陶色油漆三秒区 + 暖白边线与罚球弧
      const court = A.clipRect(ox, oy, w, h, { x: 2048, y: 304, w: 472, h: 352 });
      if (court) A.withClip(g, court, () => {
        const ink = '#f6f2e4', cx0 = 2076, cy0 = 320, cw = 396, ch = 312, mcy = A.snap2(cy0 + ch / 2);
        // 三秒区低饱和赤陶涂装
        A.R(g, cx0 + cw - 136, mcy - 52, 136, 104, '#b86448');
        A.R(g, cx0, cy0, cw, 4, ink); A.R(g, cx0, cy0 + ch - 4, cw, 4, ink);
        A.R(g, cx0, cy0, 4, ch, ink); A.R(g, cx0 + cw - 4, cy0, 4, ch, ink);
        A.R(g, cx0 + cw - 136, mcy - 52, 136, 4, ink);
        A.R(g, cx0 + cw - 136, mcy + 48, 136, 4, ink);
        A.R(g, cx0 + cw - 136, mcy - 52, 4, 104, ink);
        for (let a = 12; a <= 36; a++) {
          const r = a / 48 * Math.PI * 2;
          A.R2(g, cx0 + cw - 136 + Math.cos(r) * 44 - 2, mcy + Math.sin(r) * 44 - 2, 4, 4, ink);
          const r3 = a / 48 * Math.PI * 2;
          const x3 = cx0 + cw - 36 + Math.cos(r3) * 184, y3 = mcy + Math.sin(r3) * 132;
          if (x3 >= cx0 + 4 && y3 >= cy0 + 4 && y3 <= cy0 + ch - 8) A.R2(g, x3, y3, 4, 4, ink);
        }
      });

      // 3) 材质分界拉丝黄铜收边压条
      for (const [bx, by, bh] of [[918, 112, 596], [2046, 304, 352], [2534, 112, 596]]) {
        const b = A.clipRect(ox, oy, w, h, { x: bx, y: by, w: 6, h: bh });
        if (b) { A.R(g, b.x, b.y, b.w, b.h, '#8c683e'); A.R(g, b.x + 2, b.y, 2, b.h, '#e2b659'); }
      }
    },
    furniture: custom,
    custom
  });
})(typeof window !== 'undefined' ? window : globalThis);
