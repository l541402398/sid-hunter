'use strict';
// 4F · 空中花园与阳光茶水间 主题：温暖像素现代研发大楼（阳光植物温室 + 意式萃茶岛台 + 雪松花槽 + 屋顶退台空中花园，零农田沟渠/稻草人）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  const cedar = { base: '#bc824c', hi: '#d09760', lo: '#a26b3a', gap: '#6d4322', grain: '#945e32' };
  const walnut = { base: '#a46c3e', hi: '#b88050', lo: '#8c5830', gap: '#5c361c', grain: '#7e4d29' };
  const bistroChecker = {
    a: '#f2eadc', b: '#c9825e', grout: '#ab6a4b',
    aHi: '#fbf7f0', bHi: '#db9672', aLo: '#cfc2ae', bLo: '#ad6848'
  };
  // 严格避开 7F sports 检测色 RGB(217,204,163)±6
  const stoneP = { tones: ['#ece4d6', '#e4dac9', '#f2ece0', '#cfc2ae'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };

  const custom = {
    flowerbed(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      // 现代建筑雪松木与洞石压顶高花槽
      A.outlineBox(g, x, by - 22, w, 22, '#995f36', '#c68654', '#5c341c');
      for (let px = x + 12; px < x + w - 8; px += 18) A.R(g, px, by - 18, 2, 14, '#704122');
      A.outlineBox(g, x - 2, by - 28, w + 4, 8, '#ebe3d5', '#fbf7f0', '#b8aa96', A.OUT);
      A.R(g, x + 4, by - 26, w - 8, 2, '#472c1e');
      const cols = ['#f07167', '#ffd166', '#f29cb8', '#9c82e0', '#fcf8f0'];
      for (let px = x + 10, i = 0; px < x + w - 8; px += 14, i++) {
        const lift = (i & 1) * 2;
        A.pxEllipse(g, px, by - 30 - lift, 8, 6, '#1b3624');
        A.pxEllipse(g, px, by - 30 - lift, 6, 5, i & 1 ? '#367542' : '#2d6138');
        A.R(g, px - 4, by - 34 - lift, 4, 2, '#7ec868');
        A.R(g, px, by - 36 - lift, 4, 4, cols[i % cols.length]);
        A.R(g, px, by - 36 - lift, 2, 2, '#fffdf4');
      }
    },
    herbplanter(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      // 茶水间齐腰深钢支腿胡桃木食用香草种植槽（迷迭香/薄荷/洋甘菊）
      for (const lx of [x + 6, x + w - 12]) {
        A.R(g, lx, by - 10, 6, 10, A.OUT_COOL);
        A.R(g, lx + 2, by - 8, 2, 6, '#525e6c');
      }
      A.outlineBox(g, x, by - 28, w, 20, '#8f5832', '#bc8252', '#522f19');
      A.outlineBox(g, x - 2, by - 32, w + 4, 6, '#ebe3d5', '#fbf7f0', '#b8aa96', A.OUT);
      A.R(g, x + 4, by - 30, w - 8, 2, '#472c1e');
      for (let hx = x + 12, i = 0; hx < x + w - 10; hx += 16, i++) {
        A.pxEllipse(g, hx, by - 34, 8, 6, '#1d3b28');
        A.pxEllipse(g, hx, by - 34, 6, 4, i & 1 ? '#448a50' : '#367542');
        A.R(g, hx - 2, by - 38, 4, 4, i & 1 ? '#82cc6e' : '#6cb862');
        if (i % 2 === 0) A.R(g, hx + 2, by - 40, 4, 2, /薰|罗勒/.test(f.label) ? '#a67ce0' : '#ffd166');
      }
    },
    pottree(g, f, A) {
      const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
      const ceramic = /橄榄|樱/.test(f.label);
      const pot = ceramic ? ['#ebe4d8', '#ffffff', '#b5aa9a'] : ['#c26b46', '#e28f68', '#803f26'];
      A.outlineBox(g, cx - 14, by - 22, 28, 22, pot[0], pot[1], pot[2]);
      A.outlineBox(g, cx - 16, by - 28, 32, 8, pot[0], pot[1], pot[2]);
      A.R(g, cx - 12, by - 26, 24, 2, '#3d281c');
      A.R(g, cx - 4, by - 52, 8, 26, A.OUT);
      A.R(g, cx - 2, by - 50, 4, 24, '#784a2a');
      A.R(g, cx - 2, by - 50, 2, 20, '#9e663e');
      const citrus = /柠檬|柑|桔/.test(f.label), sak = /樱|茶花/.test(f.label);
      const c = sak
        ? ['#472338', '#9c4268', '#da6e94', '#f6aec8', '#ffe6f0']
        : ['#1b3624', '#2c6138', '#488c48', '#74bf5e', '#a8e484'];
      for (const [dx, dy, rx, ry] of [[8, -54, 12, 9], [-8, -56, 12, 9], [0, -64, 14, 10]]) {
        A.pxEllipse(g, cx + dx, by + dy, rx + 2, ry + 2, c[0]);
      }
      A.pxEllipse(g, cx + 8, by - 54, 12, 9, c[1]);
      A.pxEllipse(g, cx - 8, by - 56, 12, 9, c[2]);
      A.pxEllipse(g, cx, by - 64, 14, 10, c[2]);
      A.pxEllipse(g, cx - 4, by - 66, 10, 7, c[3]);
      A.R(g, cx - 8, by - 70, 6, 2, c[4]);
      if (citrus) {
        const fc = /桔|柑/.test(f.label) ? '#ff9636' : '#ffe052';
        for (const [fx, fy] of [[-10, -56], [8, -54], [0, -64]]) A.R(g, cx + fx, by + fy, 4, 4, fc);
      }
    },
    pergola(g, f, A) {
      const x = A.snap2(f.x), y = A.snap2(f.y), w = A.snap2(f.w), h = A.snap2(f.h), by = y + h;
      // 现代胡桃木与天窗玻璃阳光花架亭（四角立柱 + 顶部格栅采光梁 + 垂挂常春藤与暖吊灯，中间留空可驻足观赏）
      for (const px of [x + 8, x + w - 18]) {
        A.outlineBox(g, px, y + 20, 10, h - 20, '#8a5530', '#ba814f', '#522f19');
      }
      // 亭内洞石踏步地台与对坐茶叙软垫长凳
      A.outlineBox(g, x + 20, by - 26, w - 40, 18, '#ebe3d5', '#fbf7f0', '#b8aa96');
      A.outlineBox(g, x + 28, by - 46, 56, 16, '#588266', '#7ea88c', '#365642', A.OUT, true);
      A.outlineBox(g, x + w - 84, by - 46, 56, 16, '#588266', '#7ea88c', '#365642', A.OUT, true);
      A.outlineBox(g, x + A.snap2(w / 2) - 22, by - 42, 44, 14, '#a86b3e', '#d19462', '#6e4023');
      A.R(g, x + A.snap2(w / 2) - 6, by - 44, 12, 4, '#fcf8f0');
      // 顶部胡桃木格栅横梁与高透采光玻璃天窗
      A.outlineBox(g, x, y + 4, w, 24, '#7d4b2a', '#ad7248', '#4a2a16');
      for (let gx = x + 12; gx < x + w - 28; gx += 36) {
        A.outlineBox(g, gx, y + 8, 28, 16, '#cde8f4', '#f2fbfe', '#8ab8cc', A.OUT_COOL);
        A.R(g, gx + 4, y + 10, 8, 2, '#ffffff');
      }
      // 檐口攀援绿植与暖黄玻璃吊灯
      for (let vx = x + 18, i = 0; vx < x + w - 22; vx += 28, i++) {
        A.pxEllipse(g, vx, y + 28, 8, 5, '#295936');
        A.R(g, vx - 4, y + 24, 6, 2, '#78c464');
        if (i % 2 === 0) A.R(g, vx + 2, y + 26, 4, 4, '#ffd166');
      }
    },
    teacart(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      for (const lx of [x + 6, x + w - 12]) {
        A.pxEllipse(g, lx + 2, by - 4, 4, 4, A.OUT_COOL);
        A.R(g, lx, by - 34, 4, 30, '#8c683e');
      }
      A.outlineBox(g, x, by - 18, w, 8, '#9c663b', '#c68d5e', '#5e381e');
      A.outlineBox(g, x, by - 36, w, 10, '#efe7da', '#fcf8f2', '#bfb29e');
      // 手冲铜壶、玻璃茶海与茶杯
      A.outlineBox(g, x + 8, by - 48, 16, 14, '#d9ab52', '#f7da88', '#8f6524');
      A.outlineBox(g, x + 28, by - 46, 14, 12, '#cde8f4', '#ffffff', '#82adc0', A.OUT_COOL);
      A.R(g, x + 30, by - 40, 10, 4, '#d9843b');
      if (w >= 56) A.outlineBox(g, x + w - 18, by - 44, 10, 8, '#fcf8f0', '#ffffff', '#bfb29e');
    },
    seedtable(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      A.R(g, x + 8, by - 16, 6, 16, A.OUT);
      A.R(g, x + w - 14, by - 16, 6, 16, A.OUT);
      A.outlineBox(g, x, by - 36, w, 22, '#a86e40', '#ce9464', '#693f20');
      A.R(g, x + 6, by - 12, w - 12, 4, '#693f20');
      // 台面玻璃生态瓶与幼苗育苗盘
      for (let bx = x + 12, i = 0; bx < x + w - 34; bx += 36, i++) {
        if (i % 2 === 0) {
          A.outlineBox(g, bx, by - 48, 22, 16, '#d2ecf6', '#ffffff', '#8cb6c8', A.OUT_COOL);
          A.R(g, bx + 6, by - 40, 10, 4, '#488c48');
          A.R(g, bx + 8, by - 42, 6, 2, '#86cc6e');
        } else {
          A.outlineBox(g, bx, by - 42, 26, 10, '#5e3b22', '#8a5836', '#3b2212');
          A.R(g, bx + 4, by - 44, 6, 4, '#68b458');
          A.R(g, bx + 14, by - 44, 6, 4, '#86cc6e');
        }
      }
    },
    herbtable(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      A.R(g, x + 8, by - 16, 6, 16, A.OUT);
      A.R(g, x + w - 14, by - 16, 6, 16, A.OUT);
      A.outlineBox(g, x, by - 36, w, 22, '#9c663b', '#c68d5e', '#5e381e');
      A.outlineBox(g, x + 12, by - 46, 28, 12, '#fcf8f0', '#ffffff', '#c7baa6');
      A.R(g, x + 18, by - 42, 14, 4, '#568c58');
      if (w >= 96) {
        A.outlineBox(g, x + 50, by - 48, 18, 14, '#cde8f4', '#ffffff', '#82adc0', A.OUT_COOL);
        A.R(g, x + 54, by - 40, 10, 4, '#e2a644');
        A.outlineBox(g, x + w - 38, by - 44, 22, 10, '#c89052', '#e4b274', '#86582a');
        A.R(g, x + w - 34, by - 46, 14, 4, '#9c78d8');
      }
    },
    dryrack(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      A.outlineBox(g, x + 4, by - 56, 6, 56, '#7d4b2a', '#ad7248', '#4a2a16');
      A.outlineBox(g, x + w - 10, by - 56, 6, 56, '#7d4b2a', '#ad7248', '#4a2a16');
      A.R(g, x + 4, by - 50, w - 8, 4, '#6e4124');
      const cols = ['#6cae5e', '#9c74cc', '#e6b856', '#ea7870'];
      for (let hx = x + 18, i = 0; hx < x + w - 20; hx += 18, i++) {
        A.R(g, hx + 2, by - 48, 4, 4, '#ebe3d5');
        A.R(g, hx, by - 44, 8, 14, cols[i % cols.length]);
        A.R(g, hx + 2, by - 30, 4, 4, '#447842');
      }
    },
    potstack(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h);
      for (const [dx, dy, bw, ceramic] of [[4, -18, 22, 0], [28, -16, 20, 1], [16, -32, 18, 0]]) {
        A.outlineBox(g, x + dx, by + dy, bw, 16,
          ceramic ? '#ebe4d8' : '#c46c44',
          ceramic ? '#ffffff' : '#e48c62',
          ceramic ? '#b5aa9a' : '#823c24');
      }
    },
    herbbasket(g, f, A) {
      const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
      A.outlineBox(g, x + 4, by - 22, w - 8, 22, '#c89052', '#e4b274', '#86582a');
      for (let i = 0; i < Math.floor((w - 16) / 10); i++) {
        A.R(g, x + 10 + i * 10, by - 26, 6, 4, '#488848');
        A.R(g, x + 10 + i * 10, by - 30, 6, 4, i % 2 ? '#ffd166' : '#9c74d4');
      }
    },
    gazebo(g, f, A) { custom.pergola(g, f, A); },
    gardenbench(g, f, A) { A.COMMON.bench(g, f); },
    gardenlamp(g, f, A) { A.COMMON.floorlamp(g, f); }
  };

  L.register(4, {
    wall: {
      style: 'modern',
      paper: '#eff2e6', stripe: '#cbd4be', panelHi: '#fafcf5', motif: '#cbd4be',
      rail: '#784c2b', railHi: '#ab7348',
      wains: '#8e5d37', wainsLo: '#663f22', wainsHi: '#ba8256',
      base: '#402616', crown: '#e4ead8',
      cap: '#6b4528', capHi: '#a16d45', capLo: '#261c22', capTop: '#855634'
    },
    door: { frame: '#36231d', frameHi: '#a16d45', leaf: '#8f5b35', plank: '#663f22', lintel: '#4d2d1c', glass: '#e8f4fa' },
    plaquePal: { bg: '#343b2e', hi: '#68755e', edge: '#1b2018', ink: '#fbf4e2' },
    glass: { post: '#58646e', rail: '#9c663b' },
    zones: [
      // 100% 覆盖 4F 三级阶梯多边形外轮廓（零裸露缺口）
      { x: 0, y: 0, w: 1184, h: 720, mat: 'stone', pal: stoneP, seed: 41, tw: 64, th: 48 },
      { x: 640, y: 496, w: 480, h: 224, mat: 'parquet', pal: cedar },
      { x: 1120, y: 720, w: 64, h: 120, mat: 'checker', pal: bistroChecker, size: 48 },
      { x: 1184, y: 112, w: 1120, h: 728, mat: 'checker', pal: bistroChecker, size: 48 },
      { x: 1680, y: 608, w: 624, h: 232, mat: 'planks', pal: walnut, seed: 43 },
      { x: 2240, y: 840, w: 64, h: 120, mat: 'planks', pal: cedar, seed: 44 },
      { x: 2304, y: 224, w: 1152, h: 736, mat: 'planks', pal: cedar, seed: 45 },
      { x: 2752, y: 720, w: 704, h: 240, mat: 'stone', pal: stoneP, seed: 46, tw: 64, th: 48 }
    ],
    rugs: [
      { x: 1492, y: 396, w: 296, h: 144, fill: '#4e7552', band: '#345238', trim: '#e2c278', motif: '#f2dca0', fringe: '#f2ead8' }
    ],
    windows: [180, 882, 1312, 2136, 2596, 3276], windowStyle: 'curtain',
    sconces: [270, 1140, 1416, 1656, 2024, 2868, 3164],
    frames: [[64, 'flower', 48, 28], [3364, 'land', 48, 28]],
    plaque: { x: 1840, text: 'CQRD · 空中花园与阳光茶水间', w: 220 },
    // 写实研发大楼屋顶退台空中花园外景（零农田沟渠/零稻草人/零风车/零电梯翼暗渠）
    exterior: L.API.biomeExterior({
      pal: L.API.biomePal({
        19: '#2e6c44', 20: '#3f8a48', 21: '#58aa4e', 22: '#84cf5c', 23: '#b8e86c',
        24: '#42244c', 25: '#723c86', 26: '#9e5cb8', 27: '#c892e0', 28: '#efe0fa',
        46: '#e28848', 47: '#f5b462', 48: '#c9564a'
      }),
      extraLand: [{ rect: [-640, -320, 4736, 1600] }],
      extraPaths: [
        { style: 'stone', pts: [[-560, 1004, 26], [520, 1008, 26], [1728, 1004, 28], [2940, 1008, 26], [4020, 1004, 26]] },
        { style: 'stone', pts: [[1430, 932, 22], [1460, 1004, 24]] }
      ],
      flowers: [43, 44, 42, 27], flowerRate: 0.12, tuftRate: 0.18,
      treeLines: [
        { y: -256, x0: -600, x1: 4060, step: 98, rows: 2, dy: 44, kinds: ['oak', 'sakura', 'pine', 'oak'] },
        { y: 1136, x0: -600, x1: 4060, step: 100, rows: 2, dy: 46, kinds: ['oak', 'sakura', 'pine', 'oak'] }
      ],
      decor: [
        ['bed', -540, 620, 200, 80, 'lavender'],
        ['bed', 3760, 620, 200, 80, 'tulip'],
        ['bed', 2440, 1036, 240, 72, 'lavender'],
        ['bed', 2820, 1036, 240, 72, 'tulip'],
        ['tree', -380, 120, 'oak'], ['tree', -420, 460, 'sakura'], ['pine', -360, 840],
        ['tree', 3820, 140, 'sakura'], ['tree', 3880, 520, 'oak'], ['pine', 3820, 880],
        ['bench', 760, 1044], ['bench', 2080, 1044],
        ['lantern', 700, 1052], ['lantern', 2020, 1052]
      ]
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 三级退台交界处的洞石踏步收边与拉丝黄铜压条
      for (const [bx, by, bh] of [[1180, 112, 608], [2300, 224, 616]]) {
        const c = A.clipRect(ox, oy, w, h, { x: bx, y: by, w: 8, h: bh });
        if (c) {
          A.R(g, c.x, c.y, c.w, c.h, '#bfb29e');
          A.R(g, c.x + 2, c.y, 2, c.h, '#faf6ef');
          A.R(g, c.x + 6, c.y, 2, c.h, '#d9ab52');
        }
      }
    },
    furniture: custom,
    custom
  });
})(typeof window !== 'undefined' ? window : globalThis);
