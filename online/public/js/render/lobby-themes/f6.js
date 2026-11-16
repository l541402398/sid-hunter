'use strict';
// 6F · 观景咖啡与烘焙沙龙 主题：温暖像素现代研发大楼（暖橡木人字拼花 / 哑光洞石中庭 / 赤陶烘焙砖 / 精品咖啡烘焙机与铜框甜品岛台 / 退台花园外景）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  // 全部地面色值严格避开 7F sports 像素检测区间 RGB(217,204,163)±6
  const oakCafe = { base: '#be864e', hi: '#d29b62', lo: '#a6713d', gap: '#754827', grain: '#996436' };
  const oakPlank = { base: '#c48c54', hi: '#d6a068', lo: '#ab7642', gap: '#7a4d2b', grain: '#a16b3b' };
  const walnutCafe = { base: '#a87042', hi: '#bc8454', lo: '#915d34', gap: '#663d20', grain: '#87542d' };
  const cafeTravertine = { tones: ['#eee6d8', '#e6ddcc', '#f4efe4', '#d2c5b1'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };
  const bistroTile = { a: '#f2eadc', b: '#c87c5a', grout: '#a46448', aHi: '#faf6ef', bHi: '#da906e', aLo: '#d1c4b0', bLo: '#ad6646' };

  L.register(6, {
    wall: {
      style: 'modern',
      paper: '#f4ece0', stripe: '#d8cbb8', panelHi: '#fcf8f2', motif: '#d8cbb8',
      rail: '#784828', railHi: '#ad7248',
      wains: '#915b36', wainsLo: '#693e21', wainsHi: '#bc8458',
      base: '#3f2315', crown: '#ebe0ce',
      cap: '#704327', capHi: '#a66f46', capLo: '#2c1b20', capTop: '#8a5534'
    },
    door: { frame: '#36231d', frameHi: '#9e6a42', leaf: '#8f5934', plank: '#693d20', lintel: '#4d2c1c', glass: '#e8f4fa' },
    plaquePal: { bg: '#3b2b24', hi: '#785a48', edge: '#1e1518', ink: '#fbf2dc' },
    zones: [
      { x: 0, y: 0, w: 816, h: 740, mat: 'parquet', pal: oakCafe, size: 64 },
      { x: 816, y: 0, w: 1824, h: 584, mat: 'stone', pal: cafeTravertine, seed: 61, tw: 64, th: 48 },
      { x: 2640, y: 0, w: 816, h: 740, mat: 'planks', pal: oakPlank, seed: 62 },
      { x: 816, y: 584, w: 1824, h: 16, mat: 'planks', pal: oakPlank, seed: 63 },
      { x: 816, y: 600, w: 624, h: 360, mat: 'checker', pal: bistroTile, size: 48 },
      { x: 1440, y: 600, w: 592, h: 360, mat: 'planks', pal: walnutCafe, seed: 65 },
      { x: 2032, y: 600, w: 608, h: 360, mat: 'parquet', pal: walnutCafe, size: 64 }
    ],
    rugs: [
      { x: 96, y: 298, w: 296, h: 144, fill: '#87443c', band: '#612d28', trim: '#e6c27c', motif: '#f2daa0', fringe: '#f4ece0' },
      { x: 1516, y: 296, w: 424, h: 128, round: true, fill: '#3d6358', band: '#28453d', trim: '#e2bc6e', motif: '#f2deb0' }
    ],
    windows: [576, 872, 1188, 1940, 2280, 2540, 3160], windowStyle: 'curtain',
    sconces: [360, 1104, 1584, 1872, 2196, 2900, 3280], sconceColor: '#ffd680',
    frames: [[108, 'flower', 52, 28], [2404, 'land', 52, 28]],
    plaque: { x: 1728, text: 'CQRD · 观景咖啡与烘焙沙龙', w: 212 },
    // 楼外：阶梯空中花园与园区绿脉（无海洋、无帆船、无灯塔、无浮标；东西电梯门厅外设整洁花岗岩广场）
    exterior: L.API.biomeExterior({
      pal: L.API.biomePal({
        1: '#1a426e', 2: '#23568c', 3: '#2e72ad', 4: '#3d90c4', 5: '#52acc7', 6: '#86d8cb', 7: '#dff6ea',
        13: '#8c6244', 14: '#b08462', 15: '#cbb092', 16: '#e6d8c4',
        17: '#152233', 18: '#1b3847', 19: '#265c44', 20: '#368242', 21: '#52ab48', 22: '#7ecc52', 23: '#b4e864',
        24: '#47234d', 25: '#8a3b6e', 26: '#cf6292', 27: '#f2a8c2', 28: '#ffe4ee',
        34: '#38333a', 35: '#786e68', 36: '#b8aca0', 37: '#ede5d8',
        42: '#ffd25a', 43: '#fff4c4', 44: '#f06f6a', 45: '#78c7f5', 46: '#e2d4be'
      }),
      extraLand: [{ rect: [-640, -320, 4736, 1600] }],
      flowers: [44, 42, 27, 43], flowerRate: 0.11, tuftRate: 0.20,
      treeLines: [{ y: -230, x0: -560, x1: 4020, step: 128, rows: 2, dy: 50, kinds: ['alt', 'oak', 'pine', 'oak'] }],
      decor: [
        ['tree', -260, 48, 'oak'], ['tree', 3700, 48, 'alt'],
        ['tree', -260, 468, 'alt'], ['pine', 3700, 468],
        ['lantern', -248, 108], ['lantern', 3696, 108],
        ['bush', -256, 360, 2], ['bush', 3696, 360, 1],
        ['tree', 960, 1128, 'alt'], ['tree', 1728, 1136, 'oak'], ['pine', 2496, 1128],
        ['flowers', 1220, 1064, 180, 36], ['flowers', 2056, 1064, 180, 36]
      ],
      after(S, ctx) {
        const { fillRect, hash2, toPx, toPy } = ctx;
        const stampPlaza = (wx, wy, ww, wh) => {
          const px0 = toPx(wx), py0 = toPy(wy), pw = Math.round(ww / 2), ph = Math.round(wh / 2);
          fillRect(px0 - 2, py0 - 2, pw + 4, ph + 4, 34);
          fillRect(px0, py0, pw, ph, 35);
          for (let ty = py0 + 2, r = 0; ty < py0 + ph - 2; ty += 12, r++) {
            const off = (r & 1) ? 8 : 0;
            for (let tx = px0 + 2 - off; tx < px0 + pw - 2; tx += 16) {
              const x0 = Math.max(px0 + 2, tx), x1 = Math.min(px0 + pw - 2, tx + 15);
              const y1 = Math.min(py0 + ph - 2, ty + 11);
              if (x1 - x0 < 3 || y1 - ty < 3) continue;
              const h = hash2(tx, ty);
              fillRect(x0, ty, x1 - x0, y1 - ty, h > 0.58 ? 37 : 36);
              if (h < 0.32) fillRect(x0, ty, Math.min(6, x1 - x0), 1, 46);
            }
          }
        };
        // 东西电梯翼花岗岩平台 + 衔接西南/东南观景露台步道 + 南侧景观横轴石道
        stampPlaza(-308, 36, 312, 292);
        stampPlaza(-180, 324, 88, 200);
        stampPlaza(3452, 36, 312, 292);
        stampPlaza(3548, 324, 88, 200);
        stampPlaza(760, 988, 1936, 52);
      }
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 东西橡木区与中央洞石沙龙交界黄铜收边压条
      for (const bx of [814, 2638]) {
        const c = A.clipRect(ox, oy, w, h, { x: bx, y: 112, w: 6, h: 472 });
        if (c) { A.R(g, c.x, c.y, c.w, c.h, '#7d4f2a'); A.R(g, c.x + 2, c.y, 2, c.h, '#e2b659'); }
      }
    },
    faceDecor(g, wl, top, bottom, A) {
      const x0 = wl.x, x1 = wl.x + wl.w, has = (a, b) => x0 <= a && x1 >= b;
      if (has(1656, 1800)) {
        A.R(g, 1660, top + 4, 136, 24, '#3b2618');
        A.R(g, 1664, top + 6, 128, 20, '#24332c');
        A.R(g, 1676, top + 12, 72, 2, '#fbf2dc');
        A.R(g, 1676, top + 18, 96, 2, '#ffd166');
      }
    },
    furniture: {
      menuboard(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
        // 3/4 胡桃木立式手冲风味黑板（纯整数像素块，0 半透明抗锯齿文字）
        A.R(g, x + 8, by - 14, 6, 14, A.OUT);
        A.R(g, x + w - 14, by - 14, 6, 14, A.OUT);
        A.outlineBox(g, x, by - 56, w, 44, '#7d4c29', '#ad7246', '#4a2a16', A.OUT);
        A.R(g, x + 4, by - 52, w - 8, 36, '#23322c');
        A.R(g, x + 4, by - 52, w - 8, 2, '#354a41');
        // 手冲咖啡杯图标与像素价目横条
        A.outlineBox(g, x + 10, by - 44, 18, 16, '#f5eee0', '#ffffff', '#c7baa6');
        A.R(g, x + 14, by - 48, 2, 4, '#ffd166');
        A.R(g, x + 20, by - 48, 2, 4, '#ffd166');
        A.R(g, x + 34, by - 44, w - 46, 4, '#ffd166');
        A.R(g, x + 34, by - 36, w - 54, 2, '#f5eee0');
        A.R(g, x + 34, by - 30, w - 50, 2, '#f5eee0');
        A.R(g, x + 10, by - 22, w - 20, 2, '#88c498');
      },
      roaster(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 3/4 现代研发咖啡工坊微量黄铜铸铁烘焙机（替代旧版航海船舵，0 半透明像素）
        A.outlineBox(g, cx - 28, by - 26, 56, 26, '#363d46', '#5e6978', '#1e2329', A.OUT_COOL);
        // 前置不锈钢冷却圆盘与搅拌臂
        A.pxEllipse(g, cx - 10, by - 26, 18, 8, A.OUT_COOL);
        A.pxEllipse(g, cx - 10, by - 28, 16, 6, '#b8c2cc');
        A.pxEllipse(g, cx - 10, by - 28, 12, 4, '#6e4023');
        // 黄铜卧式烘焙滚筒与顶部银皮旋风进豆斗
        A.outlineBox(g, cx - 14, by - 50, 38, 24, '#c8923b', '#f2c86e', '#7d541c', A.OUT);
        A.R(g, cx - 10, by - 46, 30, 4, '#ffe69e');
        A.pxEllipse(g, cx - 14, by - 38, 8, 10, A.OUT_COOL);
        A.pxEllipse(g, cx - 14, by - 38, 6, 8, '#4a525e');
        A.R(g, cx + 12, by - 66, 8, 18, A.OUT_COOL);
        A.R(g, cx + 14, by - 64, 4, 14, '#7c8796');
        A.outlineBox(g, cx - 8, by - 68, 20, 18, '#d9a648', '#ffe48e', '#8a5e20', A.OUT, true);
      },
      carousel(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h), rx = A.snap2(f.w / 2) - 8;
        // 中央胡桃木与黄铜高透玻璃法式烘焙岛台（淘汰马戏团旋转木马红白顶，统一现代研发沙龙质感）
        A.pxEllipse(g, cx, by - 16, rx + 2, 22, A.OUT);
        A.pxEllipse(g, cx, by - 18, rx, 20, '#6e4226');
        A.pxEllipse(g, cx, by - 24, rx, 18, '#8f5832');
        A.pxEllipse(g, cx, by - 28, rx - 4, 16, '#efe7da');
        A.pxEllipse(g, cx - 4, by - 30, rx - 12, 12, '#faf6ef');
        // 四组玻璃罩法式挞与可颂陈列盘
        const items = ['#d98c42', '#e06d58', '#84c272', '#e8ba54'];
        for (let i = 0; i < 4; i++) {
          const px = cx - rx + 28 + i * Math.round((rx * 2 - 56) / 3);
          A.outlineBox(g, px - 12, by - 44, 24, 16, '#d6edf6', '#ffffff', '#8ab4c4', A.OUT_COOL);
          A.R(g, px - 8, by - 36, 16, 6, items[i]);
          A.R(g, px - 6, by - 38, 8, 2, '#fff8e4');
        }
        // 中央双层黄铜甜品架与胡桃木暖光吊顶檐
        A.R(g, cx - 6, by - 68, 12, 40, A.OUT);
        A.R(g, cx - 4, by - 66, 8, 36, '#c8943c');
        A.pxEllipse(g, cx, by - 50, 32, 10, A.OUT);
        A.pxEllipse(g, cx, by - 52, 30, 8, '#f5eee0');
        A.pxEllipse(g, cx, by - 70, rx - 14, 14, A.OUT);
        A.pxEllipse(g, cx, by - 72, rx - 16, 12, '#784828');
        A.pxEllipse(g, cx, by - 74, rx - 24, 8, '#b87d50');
        A.R(g, cx - 24, by - 68, 12, 2, '#ffe48e');
        A.R(g, cx + 12, by - 68, 12, 2, '#ffe48e');
      },
      waffle(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
        // 3/4 胡桃木格栅与哑光洞石台面华夫可丽饼料理台
        A.outlineBox(g, x, by - 34, w, 34, '#8f5832', '#bc8252', '#522f19', A.OUT);
        for (let px = x + 8; px < x + w - 8; px += 12) A.R(g, px, by - 28, 2, 20, '#5c351c');
        A.outlineBox(g, x - 2, by - 40, w + 4, 8, '#efe7da', '#fcf8f2', '#bfb29e', A.OUT);
        A.outlineBox(g, x + 12, by - 48, w - 24, 10, '#5a636e', '#8e99a6', '#343a42', A.OUT_COOL);
        for (let wx = x + 22; wx < x + w - 42; wx += 46) {
          A.outlineBox(g, wx, by - 52, 32, 10, '#df9e42', '#ffd984', '#8f5a1e', A.OUT);
          A.R(g, wx + 8, by - 50, 6, 2, '#fff8dc');
        }
      },
      giftpile(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h);
        // 精品咖啡挂耳礼盒组（赤陶、鼠尾草绿与暖米礼盒配黄铜丝带）
        A.outlineBox(g, x + 2, by - 22, 26, 22, '#c86a52', '#e8927a', '#7d3a2b', A.OUT);
        A.R(g, x + 13, by - 22, 4, 22, '#e8bc5a');
        A.outlineBox(g, x + 26, by - 18, 24, 18, '#4e7864', '#78a68e', '#2e4a3d', A.OUT);
        A.R(g, x + 36, by - 18, 4, 18, '#f2e6d0');
        A.outlineBox(g, x + 12, by - 38, 22, 18, '#e6d6be', '#faf4ea', '#a6947c', A.OUT);
        A.R(g, x + 21, by - 38, 4, 18, '#c86a52');
      },
      captaindesk(g, f, A) { A.COMMON.readtable(g, f); }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
