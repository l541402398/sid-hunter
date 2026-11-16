'use strict';
// 7F · 云端天台花园露台 主题：温暖像素现代研发大楼（柚木甲板 / 哑光洞石中庭 / 严守 stage 的 SID_SCENE sports #d9cca3 契约 / 建筑镜面浅水池 / 现代大楼女儿墙挑檐屋顶花园外景）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const teakA = { base: '#c28850', hi: '#d69d64', lo: '#a66e3c', gap: '#6b3f22', nail: '#422515' };
  const teakB = { base: '#b57b46', hi: '#c9905a', lo: '#996336', gap: '#61381d', grain: '#87532c' };
  // 地面洞石严格避开 RGB(217,204,163)±6，确保 #d9cca3 像素专属于中央演艺舞台 stage
  const skyTravertine = { tones: ['#ece4d6', '#e4dac9', '#f2ece0', '#cfc2ae'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };
  const sunsetTerra = { a: '#f2eadc', b: '#cf8462', grout: '#a86648', aHi: '#faf6ef', bHi: '#e09876', aLo: '#d1c4b0', bLo: '#b26c4c' };

  L.register(7, {
    wall: {
      style: 'modern',
      paper: '#f3ebe0', stripe: '#d6c8b4', panelHi: '#fcf8f2', motif: '#d6c8b4',
      rail: '#7d4c29', railHi: '#b2774c',
      wains: '#965f38', wainsLo: '#6e4022', wainsHi: '#c2885c',
      base: '#422415', crown: '#ebe0ce',
      cap: '#734528', capHi: '#a87046', capLo: '#2d1b20', capTop: '#8c5634'
    },
    door: { frame: '#36231d', frameHi: '#9e6a42', leaf: '#8f5934', plank: '#693d20', lintel: '#4d2c1c', glass: '#e8f4fa' },
    plaquePal: { bg: '#3b2b24', hi: '#785a48', edge: '#1e1518', ink: '#fbf2dc' },
    zones: [
      { x: 0, y: 0, w: 1160, h: 560, mat: 'deck', pal: teakA, seed: 71 },
      { x: 1160, y: 0, w: 1136, h: 560, mat: 'stone', pal: skyTravertine, seed: 72, tw: 64, th: 48 },
      { x: 2296, y: 0, w: 1160, h: 560, mat: 'deck', pal: teakA, seed: 73 },
      { x: 296, y: 560, w: 720, h: 400, mat: 'planks', pal: teakB, seed: 75 },
      { x: 1368, y: 560, w: 720, h: 400, mat: 'parquet', pal: teakB, size: 64 },
      { x: 2440, y: 560, w: 720, h: 400, mat: 'checker', pal: sunsetTerra, size: 48 }
    ],
    rugs: [
      { x: 96, y: 304, w: 304, h: 140, fill: '#3d6666', band: '#284545', trim: '#e2bc6e', motif: '#f0daa0', fringe: '#f2eadc' }
    ],
    windows: [540, 920, 1260, 1540, 1916, 2220, 2556, 3260], windowStyle: 'curtain',
    sconces: [456, 840, 1172, 1420, 2036, 2320, 2972, 3364], sconceColor: '#ffd984',
    frames: [[108, 'land', 52, 28], [2868, 'flower', 52, 28]],
    plaque: { x: 1728, text: 'CQRD · 云端天台花园露台', w: 212 },
    // 楼外：现代研发大楼裙房挑檐女儿墙与屋顶生态绿地（彻底淘汰浮空碎岩崖、荷兰风车与热气球）
    exterior: L.API.biomeExterior({
      pal: L.API.biomePal({
        1: '#1d4f7a', 2: '#296699', 3: '#3880b5', 4: '#4d99cc', 5: '#6eb4db', 6: '#a2d6ed', 7: '#e8f7fc',
        13: '#8c6244', 14: '#b08462', 15: '#cbb092', 16: '#e6d8c4',
        17: '#152233', 18: '#1b3847', 19: '#265c44', 20: '#368242', 21: '#52ab48', 22: '#7ecc52', 23: '#b4e864',
        24: '#47234d', 25: '#8a3b6e', 26: '#cf6292', 27: '#f2a8c2', 28: '#ffe4ee',
        34: '#38333a', 35: '#746a64', 36: '#b5a89c', 37: '#ede5d8',
        42: '#ffd25a', 43: '#fff4c4', 44: '#f06f6a', 45: '#78c7f5',
        46: '#e2d4be', 47: '#524640', 48: '#2c3d4f'
      }),
      extraLand: [{ rect: [-640, -320, 4736, 1600] }],
      forbidRects: [[-352, 982, 4160, 68]],
      flowers: [43, 44, 27, 42], flowerRate: 0.09, tuftRate: 0.16,
      treeLines: [{ y: -236, x0: -520, x1: 3980, step: 140, rows: 2, dy: 52, kinds: ['oak', 'alt', 'pine', 'oak'] }],
      decor: [
        ['tree', -280, 48, 'oak'], ['tree', 3720, 48, 'alt'],
        ['pine', -280, 488], ['tree', 3720, 488, 'oak'],
        ['lantern', -256, 108], ['lantern', 3704, 108],
        ['bush', -264, 384, 1], ['bush', 3704, 384, 2],
        ['tree', 640, 1148, 'oak'], ['tree', 1728, 1152, 'alt'], ['pine', 2800, 1148]
      ],
      after(S, ctx) {
        const { pset, fillRect, toPx, toPy, land } = ctx;
        // 现代研发大楼裙房屋顶外缘女儿墙压顶挑檐（3/4 分段暖灰洞石压顶 + 深古铜滴水檐 + 采光天窗列，零叠压石板框）
        const cx0 = toPx(-340), cx1 = toPx(3796), cw = cx1 - cx0, cyS = toPy(988);
        for (let x = cx0 + 2; x <= cx1; x++) {
          if (cyS + 27 < 800 && land[(cyS + 27) * 2368 + x]) { pset(x, cyS + 26, 18); pset(x, cyS + 27, 18); }
        }
        fillRect(cx0 + 1, cyS, cw - 2, 26, 34);
        fillRect(cx0, cyS + 1, cw, 24, 34);
        fillRect(cx0 + 2, cyS + 1, cw - 4, 13, 36);
        fillRect(cx0 + 2, cyS + 15, cw - 4, 9, 47);
        for (let sx = cx0 + 10; sx < cx1 - 12; sx += 24) {
          fillRect(sx, cyS + 1, 1, 13, 35);
          fillRect(sx + 2, cyS + 1, Math.min(14, cx1 - 4 - sx), 2, 37);
        }
        for (let sx = cx0 + 24; sx < cx1 - 48; sx += 64) {
          fillRect(sx - 4, cyS + 15, 2, 9, 34);
          fillRect(sx, cyS + 4, 36, 8, 34);
          fillRect(sx + 2, cyS + 5, 32, 6, 48);
          fillRect(sx + 4, cyS + 6, 10, 2, 6);
        }
      }
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 镜面浅水池外围暖白洞石溢水边框（严避 217,204,163±6）
      const a = A.clipRect(ox, oy, w, h, { x: 1544, y: 312, w: 368, h: 148 });
      if (a) A.withClip(g, a, () => {
        A.outlineBox(g, 1548, 316, 360, 140, '#ece4d6', '#faf6ef', '#bfb29e', A.OUT_COOL);
      });
      // 主露台柚木与中庭洞石黄铜收边压条
      for (const bx of [1158, 2294]) {
        const b = A.clipRect(ox, oy, w, h, { x: bx, y: 112, w: 6, h: 448 });
        if (b) { A.R(g, b.x, b.y, b.w, b.h, '#784c28'); A.R(g, b.x + 2, b.y, 2, b.h, '#e2b659'); }
      }
      // 南侧三座玻璃亭廊入口门槛铜条
      for (const [x, ww] of [[296, 720], [1368, 720], [2440, 720]]) {
        const c = A.clipRect(ox, oy, w, h, { x, y: 558, w: ww, h: 4 });
        if (c) A.R(g, c.x, c.y, c.w, c.h, '#d9aa4e');
      }
    },
    furniture: {
      stage(g, f, A) {
        const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h);
        // 严守 online/theme-assets-browser-test.mjs 像素契约：
        // 1) 先铺满 100% 不透明底色，杜绝任何图集边缘半透明像素；
        // 2) 调用 SID_SCENE.tile(g, 'sports', 0, 0, ...) 触发真实图集采样；
        // 3) 大面积无遮挡呈现 #d9cca3 (RGB 217,204,163) 声学木舞台台面（>9,000 像素，远超 >=50 阈值）。
        A.R(g, x - 2, y - 2, w + 4, h + 6, A.OUT);
        A.R(g, x, y, w, h + 2, '#6e4226');
        A.R(g, x, y, w, 2, '#ba8252');
        A.R(g, x + 2, y + h - 8, w - 4, 8, '#4f2d18');
        A.R(g, x + 16, y + h - 4, w - 32, 2, '#e2b659');
        A.R(g, x + 6, y + 4, w - 12, h - 14, '#d9cca3');
        if (root.SID_SCENE && typeof root.SID_SCENE.tile === 'function') {
          root.SID_SCENE.tile(g, 'sports', 0, 0, x + 8, y + 6, 64, Math.min(44, h - 18));
        }
        A.R(g, x + 8, y + 6, w - 16, h - 18, '#d9cca3');
        A.R(g, x + 10, y + 6, w - 20, 2, '#f2ead0');
        // 舞台两侧紧凑返听音箱与黄铜立麦（不遮挡中央米色声学台面）
        A.outlineBox(g, x + 12, y + 12, 22, 14, '#2d3540', '#586473', '#191e26', A.OUT_COOL);
        A.outlineBox(g, x + w - 34, y + 12, 22, 14, '#2d3540', '#586473', '#191e26', A.OUT_COOL);
        A.R(g, x + w / 2 - 2, y - 10, 4, 18, A.OUT_COOL);
        A.R(g, x + w / 2 - 4, y - 12, 8, 4, '#e2b659');
      },
      skypool(g, f, A) {
        const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h);
        // 3/4 现代研发天台建筑镜面浅水景池（哑光暖白洞石压顶 + 阶梯浅水层 + 黄铜涌泉口，移除泳圈玩具感）
        A.outlineBox(g, x - 4, y - 4, w + 8, h + 8, '#ebe3d5', '#fbf7f0', '#bfb29e', A.OUT_COOL);
        A.outlineBox(g, x + 4, y + 4, w - 8, h - 8, '#286c8e', '#4c9ec2', '#1b4b66', A.OUT_COOL);
        A.R(g, x + 8, y + 8, w - 16, 10, '#1e5470');
        A.R(g, x + 10, y + 18, w - 20, h - 28, '#3c8eb5');
        A.R(g, x + 18, y + 24, w - 36, h - 42, '#54accf');
        for (let wy = y + 26; wy < y + h - 20; wy += 18) {
          for (let wx = x + 28; wx < x + w - 48; wx += 44) {
            const sx = wx + (((wy - y) / 18) % 2) * 16;
            A.R(g, sx, wy, 18, 2, '#d4f3fc');
            A.R(g, sx + 4, wy + 2, 8, 2, '#86d2ec');
          }
        }
        // 西北侧建筑石阶与中央黄铜线性涌水口
        A.outlineBox(g, x + 12, y + 10, 32, 16, '#8acae2', '#d4f3fc', '#3c8eb5', A.OUT_COOL);
        A.outlineBox(g, x + w / 2 - 24, y - 2, 48, 10, '#c8943c', '#ffe48e', '#7d541c', A.OUT);
        A.R(g, x + w / 2 - 16, y + 8, 32, 4, '#ffffff');
        A.R(g, x + w / 2 - 12, y + 12, 24, 2, '#d4f3fc');
      },
      lounger(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
        // 现代天台柚木户外躺椅 + 亚麻米白软垫与鼠尾草/赤陶靠枕
        A.R(g, x + 8, by - 8, 6, 8, A.OUT);
        A.R(g, x + w - 14, by - 8, 6, 8, A.OUT);
        A.outlineBox(g, x, by - 20, w, 14, '#9c6438', '#c68a58', '#5c341a', A.OUT);
        A.outlineBox(g, x + 4, by - 28, w - 8, 12, '#f2eadc', '#fcf8f2', '#bfb29e', A.OUT);
        const accent = /东/.test(f.label) ? ['#c86a52', '#e8927a', '#7d3a2b'] : ['#4c7868', '#76a492', '#2d4a40'];
        const headX = /东/.test(f.label) ? x + w - 28 : x + 6;
        A.outlineBox(g, headX, by - 34, 22, 10, accent[0], accent[1], accent[2], A.OUT, true);
      },
      parasol(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 建筑感米白帆布八角遮阳伞（深古铜立杆 + 洞石压重底座）
        A.pxEllipse(g, cx, by - 4, 16, 6, A.OUT_COOL);
        A.pxEllipse(g, cx, by - 6, 14, 5, '#cfc2ae');
        A.R(g, cx - 2, by - 58, 4, 52, A.OUT_COOL);
        A.R(g, cx - 2, by - 58, 2, 50, '#5a636e');
        const trim = /东/.test(f.label) ? '#c86a52' : '#4c7868';
        A.pxEllipse(g, cx, by - 58, 34, 20, A.OUT);
        A.pxEllipse(g, cx, by - 58, 32, 18, trim);
        A.pxEllipse(g, cx, by - 60, 28, 15, '#f4ece0');
        A.pxEllipse(g, cx - 4, by - 62, 18, 9, '#fcf8f2');
        A.R(g, cx - 4, by - 68, 8, 4, '#c8943c');
      },
      spabed(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
        // 3/4 柚木格栅天台茶叙休憩榻
        A.R(g, x + 8, by - 12, 6, 12, A.OUT);
        A.R(g, x + w - 14, by - 12, 6, 12, A.OUT);
        A.outlineBox(g, x, by - 26, w, 16, '#8f5832', '#bc8252', '#522f19', A.OUT);
        A.outlineBox(g, x + 4, by - 36, w - 8, 14, '#f4ece0', '#fcf8f2', '#bfb29e', A.OUT);
        A.outlineBox(g, x + 10, by - 42, 26, 10, '#558068', '#7ea890', '#345242', A.OUT, true);
        A.R(g, x + w - 48, by - 34, 32, 8, '#c88850');
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
