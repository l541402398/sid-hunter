'use strict';
// 3F · 研发图书与阅览中心 主题：温暖像素现代研发大楼（北美黑胡桃木书库 + 哑光洞石检索中庭 + 采光玻璃阅览馆 + 静谧红枫庭院，无电梯翼暗渠）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const walnut = { base: '#9e633c', hi: '#b4784e', lo: '#844e2c', gap: '#54301a', grain: '#754425' };
  const warmOak = { base: '#b87e49', hi: '#cc935c', lo: '#9e6838', gap: '#6b4222', grain: '#8f5b31' };
  const slateP = { tones: ['#98a2ae', '#8b95a2', '#a4aeb9', '#7f8996'], grout: '#58616e', hi: '#c2ccd6', lo: '#687280' };
  // 严格避开 7F sports 检测色 RGB(217,204,163)±6
  const stoneP = { tones: ['#ece4d6', '#e4dac9', '#f2ece0', '#cfc2ae'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };

  const custom = {
    grandglobe(g, f, A) {
      const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
      // 胡桃木八角底座与黄铜承托柱
      A.pxEllipse(g, cx, by - 12, 52, 16, A.OUT);
      A.pxEllipse(g, cx, by - 14, 48, 14, '#754626');
      A.pxEllipse(g, cx - 2, by - 16, 40, 10, '#ba8748');
      A.R(g, cx - 10, by - 46, 20, 32, A.OUT);
      A.R(g, cx - 8, by - 44, 16, 28, '#b5833a');
      A.R(g, cx - 6, by - 44, 6, 28, '#e6ba66');
      // 黄铜子午环与天球仪球体（左上受光，HSV 色移海洋与陆块）
      A.pxEllipse(g, cx, by - 68, 36, 36, A.OUT_COOL);
      A.pxEllipse(g, cx, by - 68, 34, 34, '#d9ab52');
      A.pxEllipse(g, cx, by - 68, 30, 30, '#2e6b94');
      A.pxEllipse(g, cx - 4, by - 72, 22, 20, '#4489b2');
      A.pxEllipse(g, cx - 8, by - 76, 12, 10, '#6cb359');
      A.pxEllipse(g, cx + 8, by - 62, 10, 8, '#589c4c');
      A.R(g, cx - 12, by - 82, 6, 4, '#98d67c');
      A.R(g, cx - 16, by - 84, 4, 4, '#e6f6fc');
      // 黄铜赤道刻度横环
      A.outlineBox(g, cx - 38, by - 72, 76, 6, '#d9ab52', '#f7da88', '#8f6524', A.OUT);
    },
    catalogkiosk(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      // 现代图书馆双联胡桃木立式数字检索终端
      A.outlineBox(g, x, by - 32, w, 32, '#7d4b2a', '#ad7248', '#4a2a16');
      for (let px = x + 8; px < x + w - 8; px += 12) A.R(g, px, by - 26, 2, 18, '#543019');
      A.outlineBox(g, x - 2, by - 38, w + 4, 8, '#ebe3d5', '#fbf7f0', '#b8aa96', A.OUT);
      for (const sx of [x + 14, x + w - 50]) {
        A.outlineBox(g, sx, by - 58, 36, 22, '#2d3540', '#586473', '#191e26', A.OUT_COOL);
        A.R(g, sx + 4, by - 54, 28, 14, '#243c4c');
        A.R(g, sx + 6, by - 52, 12, 4, '#ffd166');
        A.R(g, sx + 6, by - 46, 22, 2, '#86cbe6');
        A.R(g, sx + 6, by - 42, 16, 2, '#88cc7a');
        A.R(g, sx + 14, by - 36, 8, 4, '#54606e');
      }
      // 中间参考索引卡片盒
      const mx = A.snap2(x + w / 2) - 10;
      A.outlineBox(g, mx, by - 46, 20, 10, '#ba824c', '#daa26c', '#734424');
      A.R(g, mx + 4, by - 48, 12, 2, '#fcf8f0');
    },
    bookcart(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      // 万向静音脚轮 + 胡桃木双层倾斜运书车
      for (const lx of [x + 6, x + w - 12]) {
        A.R(g, lx, by - 6, 6, 6, A.OUT_COOL);
        A.R(g, lx + 2, by - 4, 2, 2, '#7e8a96');
      }
      A.outlineBox(g, x, by - 42, w, 38, '#8a5530', '#ba814f', '#522f19');
      A.R(g, x - 4, by - 40, 4, 10, A.OUT);
      A.R(g, x - 2, by - 38, 2, 6, '#c89e56');
      const spines = ['#c45848', '#487699', '#d9a448', '#568c58', '#ede5d8', '#6e568c'];
      for (const [sy, seed] of [[by - 26, 0], [by - 10, 3]]) {
        A.R(g, x + 4, sy, w - 8, 4, '#5c351c');
        let bx = x + 6, i = 0;
        while (bx < x + w - 10) {
          const bw = 4 + (i % 2) * 2;
          A.R(g, bx, sy - 10, bw, 10, spines[(i + seed) % spines.length]);
          A.R(g, bx, sy - 10, bw, 2, '#f5eee0');
          bx += bw + 2; i++;
        }
      }
    },
    easel(g, f, A) {
      const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
      A.R(g, cx - 16, by - 26, 6, 26, A.OUT);
      A.R(g, cx + 10, by - 26, 6, 26, A.OUT);
      A.R(g, cx - 14, by - 24, 2, 24, '#8a5530');
      A.R(g, cx + 12, by - 24, 2, 24, '#6e4124');
      A.outlineBox(g, cx - 22, by - 62, 44, 36, '#fbf4e4', '#ffffff', '#c7baa6');
      A.R(g, cx - 16, by - 56, 32, 16, '#8ac6e6');
      A.R(g, cx - 16, by - 40, 32, 10, '#68ad56');
      A.R(g, cx - 8, by - 50, 8, 6, '#ffd166');
      A.R(g, cx + 4, by - 46, 8, 8, '#cf5c46');
      A.outlineBox(g, cx - 24, by - 28, 48, 6, '#8a5530', '#ba814f', '#522f19');
    },
    gramophone(g, f, A) {
      const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
      A.outlineBox(g, cx - 20, by - 24, 40, 24, '#844e2c', '#b4784e', '#4d2a16');
      A.pxEllipse(g, cx, by - 24, 14, 4, '#242228');
      A.R(g, cx - 2, by - 24, 4, 2, '#e2b659');
      A.R(g, cx + 8, by - 46, 6, 22, A.OUT);
      A.R(g, cx + 10, by - 44, 2, 20, '#d9ab52');
      A.pxEllipse(g, cx - 2, by - 48, 18, 12, A.OUT);
      A.pxEllipse(g, cx - 2, by - 48, 16, 10, '#e8bc5e');
      A.pxEllipse(g, cx - 4, by - 50, 10, 6, '#f7da88');
      A.pxEllipse(g, cx - 6, by - 48, 6, 4, '#5c381e');
    }
  };

  L.register(3, {
    wall: {
      style: 'modern',
      paper: '#efe6d6', stripe: '#cec0aa', panelHi: '#faf5ec', motif: '#cec0aa',
      rail: '#6e3f22', railHi: '#a36840',
      wains: '#824d2b', wainsLo: '#5c331b', wainsHi: '#ad7248',
      base: '#3b2014', crown: '#e4d8c3',
      cap: '#633a21', capHi: '#99623d', capLo: '#26181e', capTop: '#7d4b2c'
    },
    door: { frame: '#331f1a', frameHi: '#9c6640', leaf: '#854f2d', plank: '#5e351c', lintel: '#472718', glass: '#e8f4fa' },
    plaquePal: { bg: '#382620', hi: '#755646', edge: '#1c1316', ink: '#fbf2dc' },
    zones: [
      // 100% 覆盖 3F U 型多边形外轮廓
      { x: 0, y: 0, w: 1280, h: 668, mat: 'planks', pal: walnut, seed: 31 },
      { x: 384, y: 668, w: 896, h: 292, mat: 'parquet', pal: warmOak },
      { x: 1280, y: 0, w: 896, h: 576, mat: 'stone', pal: stoneP, seed: 32, tw: 64, th: 48 },
      { x: 2176, y: 0, w: 1280, h: 684, mat: 'planks', pal: warmOak, seed: 33 },
      { x: 2368, y: 304, w: 864, h: 380, mat: 'stone', pal: slateP, seed: 34, tw: 64, th: 48 },
      { x: 2176, y: 684, w: 624, h: 276, mat: 'parquet', pal: walnut },
      { x: 2800, y: 684, w: 656, h: 276, mat: 'planks', pal: warmOak, seed: 35 }
    ],
    rugs: [
      { x: 2600, y: 376, w: 400, h: 240, round: true, fill: '#7c3232', band: '#521e22', trim: '#e0b868', motif: '#f2d896' },
      { x: 1496, y: 332, w: 464, h: 168, fill: '#3b6166', band: '#264046', trim: '#deb86c', motif: '#f0d696', fringe: '#f2ead8' },
      { x: 716, y: 848, w: 296, h: 88, fill: '#5d7046', band: '#404f30', trim: '#e2c278', motif: '#f0da9e', fringe: '#f2ead8' }
    ],
    windows: [168, 444, 1228, 1396, 1960, 2128, 2828, 3280], windowStyle: 'curtain',
    sconces: [248, 1154, 1312, 1878, 2044, 3168],
    frames: [[64, 'map', 48, 28], [3360, 'flower', 48, 28]],
    plaque: { x: 1728, text: 'CQRD · 研发图书与阅览中心', w: 212 },
    // 写实研发园区红枫书院外景（彻底移除东西电梯厅下方暗渠 waterCarve！仅保留南侧远景静水溪带）
    exterior: L.API.biomeExterior({
      pal: L.API.biomePal({
        1: '#1c3b4d', 2: '#244d63', 3: '#2e637c', 4: '#3c7d96', 5: '#549eb0', 6: '#92d2c6', 7: '#e4f6ee',
        19: '#306e42', 20: '#428c48', 21: '#5cab50', 22: '#8ad060', 23: '#bce86e',
        24: '#4a181e', 25: '#8c2824', 26: '#c9482e', 27: '#ec7c3a', 28: '#ffb862',
        46: '#e08a2e', 47: '#f4b04a', 48: '#7a3a2a'
      }),
      extraLand: [{ rect: [-640, -320, 4736, 1600] }],
      waterCarve: [
        [[-640, 1036, 28], [480, 1042, 30], [1728, 1034, 32], [2980, 1042, 30], [4096, 1036, 28]]
      ],
      extraPaths: [
        { style: 'stone', pts: [[-560, 984, 24], [600, 988, 24], [1280, 968, 24], [2176, 968, 24], [2900, 988, 24], [4020, 984, 24]] }
      ],
      flowers: [26, 27, 43], flowerRate: 0.10, tuftRate: 0.18,
      treeLines: [
        { y: -264, x0: -600, x1: 4060, step: 96, rows: 2, dy: 44, kinds: ['maple', 'oak', 'maple', 'pine'] },
        { y: 1136, x0: -600, x1: 4060, step: 98, rows: 2, dy: 46, kinds: ['maple', 'oak', 'pine', 'maple'] }
      ],
      decor: [
        ['tree', -360, 140, 'maple'], ['pine', -420, 500], ['tree', -340, 820, 'oak'],
        ['tree', 3820, 140, 'maple'], ['pine', 3880, 500], ['tree', 3800, 820, 'maple'],
        ['lotus', 680, 1038, 1], ['lotus', 1728, 1036, 1], ['lotus', 2760, 1038, 0]
      ]
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 中庭洞石与东西胡桃木书库之间的黄铜镶嵌收边条
      for (const bx of [1278, 2174]) {
        const b = A.clipRect(ox, oy, w, h, { x: bx, y: 112, w: 6, h: 464 });
        if (b) { A.R(g, b.x, b.y, b.w, b.h, '#8c683e'); A.R(g, b.x + 2, b.y, 2, b.h, '#e2b659'); }
      }
      // 东翼静音阅览大厅门廊黄铜压边
      const a = A.clipRect(ox, oy, w, h, { x: 2368, y: 304, w: 864, h: 380 });
      if (a) A.withClip(g, a, () => {
        A.R(g, 2368, 320, 864, 4, '#c49e58');
        A.R(g, 2368, 680, 864, 4, '#c49e58');
      });
    },
    furniture: custom,
    custom
  });
})(typeof window !== 'undefined' ? window : globalThis);
