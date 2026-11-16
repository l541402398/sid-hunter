'use strict';
// 5F · 研发历史与科技展厅 主题：温暖像素现代研发大楼（哑光暖砂岩 / 胡桃木护墙与人字拼花 / 黄铜里程碑星盘 / 暖光防雾导览灯柱 / 宁静园区雕塑花园外景）。
(function (root) {
  const L = root.SID_LOBBY; if (!L) return;
  // 全部地面色值严格避开 7F sports 像素检测区间 RGB(217,204,163)±6
  const sandTravertine = { tones: ['#ede5d7', '#e5dccb', '#f3ede2', '#d1c4b0'], grout: '#b8aa96', hi: '#faf6ef', lo: '#bfb29e' };
  const walnutParquet = { base: '#ad7442', hi: '#c28854', lo: '#945f34', gap: '#693f22', grain: '#87542e' };
  const oakGallery = { base: '#be864e', hi: '#d19a62', lo: '#a6723e', gap: '#754928', grain: '#996536' };
  const walnutPlank = { base: '#a36c3e', hi: '#b88050', lo: '#8c5a32', gap: '#633b20', grain: '#80502b' };

  L.register(5, {
    wall: {
      style: 'modern',
      paper: '#f0e8da', stripe: '#d2c5b0', panelHi: '#faf6ef', motif: '#d2c5b0',
      rail: '#6e4226', railHi: '#a36840',
      wains: '#82502e', wainsLo: '#5c351c', wainsHi: '#ad7348',
      base: '#3b2114', crown: '#e6dbc8',
      cap: '#693e23', capHi: '#9e6740', capLo: '#2b1a1e', capTop: '#824f2e'
    },
    door: { frame: '#36231d', frameHi: '#9e6a42', leaf: '#8a5430', plank: '#63391e', lintel: '#4a2a1a', glass: '#f5e2a8' },
    plaquePal: { bg: '#3b2b24', hi: '#785a48', edge: '#1e1518', ink: '#fbf2dc' },
    zones: [
      { x: 0, y: 140, w: 920, h: 480, mat: 'stone', pal: sandTravertine, seed: 51, tw: 64, th: 48 },
      { x: 920, y: 0, w: 1616, h: 640, mat: 'parquet', pal: walnutParquet, size: 64 },
      { x: 2536, y: 140, w: 920, h: 480, mat: 'planks', pal: oakGallery, seed: 53 },
      { x: 920, y: 640, w: 1616, h: 16, mat: 'planks', pal: oakGallery, seed: 54 },
      { x: 920, y: 656, w: 520, h: 304, mat: 'stone', pal: sandTravertine, seed: 55, tw: 64, th: 48 },
      { x: 1440, y: 656, w: 592, h: 304, mat: 'parquet', pal: walnutParquet, size: 64 },
      { x: 2032, y: 656, w: 504, h: 304, mat: 'planks', pal: walnutPlank, seed: 57 }
    ],
    rugs: [
      { x: 120, y: 528, w: 248, h: 72, fill: '#3d5e6b', band: '#28414b', trim: '#deb870', motif: '#ebd094', fringe: '#f0e6d4' },
      { x: 2844, y: 528, w: 236, h: 72, fill: '#6b443d', band: '#4d2e29', trim: '#e6c67c', motif: '#f0d89e', fringe: '#f2ead8' }
    ],
    windows: [260, 590, 1156, 1490, 1966, 2300, 3300], windowStyle: 'curtain',
    sconces: [364, 1396, 1584, 1872, 2060, 3220, 3396], sconceColor: '#ffd984',
    frames: [[120, 'map', 52, 28], [2620, 'land', 52, 28]],
    plaque: { x: 1728, text: 'CQRD · 研发历史与科技展厅', w: 212 },
    // 楼外：写实研发园区博物馆雕塑花园（全陆地草坪与花岗岩电梯前庭广场，严禁电梯翼下方开挖水渠）
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
      flowers: [43, 44, 27], flowerRate: 0.08, tuftRate: 0.18,
      treeLines: [{ y: -230, x0: -560, x1: 4020, step: 132, rows: 2, dy: 52, kinds: ['oak', 'pine', 'alt', 'oak'] }],
      decor: [
        ['tree', -260, 56, 'oak'], ['pine', 3700, 56],
        ['tree', -260, 580, 'pine'], ['tree', 3700, 580, 'oak'],
        ['lantern', -248, 180], ['lantern', 3696, 180],
        ['bush', -256, 468, 1], ['bush', 3696, 468, 2],
        ['pond', 1468, 1068, 520, 112],
        ['bench', 1320, 1088], ['bench', 2048, 1088],
        ['lantern', 1260, 1088], ['lantern', 2180, 1088],
        ['tree', 1020, 1136, 'oak'], ['tree', 2420, 1136, 'alt']
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
        // 东西电梯厅花岗岩迎宾铺装广场 + 南翼园区漫步石道
        stampPlaza(-308, 176, 312, 272);
        stampPlaza(-180, 444, 88, 180);
        stampPlaza(3452, 176, 312, 272);
        stampPlaza(3548, 444, 88, 180);
        stampPlaza(860, 988, 1736, 52);
      }
    }),
    floorDecor(g, ox, oy, w, h, A) {
      // 中庭黄铜与暖白洞石星轨纪念地徽（严避 217,204,163±6）
      const a = A.clipRect(ox, oy, w, h, { x: 1456, y: 216, w: 544, h: 268 });
      if (a) A.withClip(g, a, () => {
        A.pxEllipse(g, 1728, 350, 236, 116, '#693f22');
        A.pxEllipse(g, 1728, 350, 228, 110, '#d4a24c');
        A.pxEllipse(g, 1728, 350, 220, 104, '#ede5d7');
        A.pxEllipse(g, 1728, 350, 168, 78, '#bfb29e');
        A.pxEllipse(g, 1728, 350, 162, 74, '#f3ede2');
        A.pxEllipse(g, 1728, 350, 96, 44, '#c48f3e');
        A.pxEllipse(g, 1728, 350, 90, 40, '#2e4158');
        A.R(g, 1496, 348, 464, 4, '#c48f3e');
        A.R(g, 1726, 242, 4, 216, '#c48f3e');
      });
      // 东西展廊与中庭交界黄铜收边压条
      for (const bx of [918, 2534]) {
        const b = A.clipRect(ox, oy, w, h, { x: bx, y: 252, w: 6, h: 368 });
        if (b) { A.R(g, b.x, b.y, b.w, b.h, '#784c28'); A.R(g, b.x + 2, b.y, 2, b.h, '#e2b659'); }
      }
    },
    faceDecor(g, wl, top, bottom, A) {
      const x0 = wl.x, x1 = wl.x + wl.w, has = (a, b) => x0 <= a && x1 >= b;
      if (has(1656, 1800)) {
        A.R(g, 1660, top + 4, 136, 24, '#3b2618');
        A.R(g, 1664, top + 6, 128, 20, '#263642');
        A.R(g, 1676, top + 12, 64, 2, '#fbf2dc');
        A.R(g, 1676, top + 18, 96, 2, '#e2b659');
      }
    },
    furniture: {
      pedestal(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 3/4 哑光洞石胡桃木博物馆展座 + 高透玻璃防尘罩 + 硅锭/晶圆/金奖展品（0 半透明像素）
        A.outlineBox(g, cx - 20, by - 10, 40, 10, '#6e4226', '#9e6840', '#422515', A.OUT);
        A.outlineBox(g, cx - 16, by - 36, 32, 28, '#ebe3d5', '#fbf7f0', '#bfb29e', A.OUT_COOL);
        A.R(g, cx - 12, by - 32, 6, 20, '#faf6ef');
        A.R(g, cx - 8, by - 22, 16, 6, '#3b2b24');
        A.R(g, cx - 6, by - 20, 12, 2, '#e2b659');
        A.outlineBox(g, cx - 16, by - 58, 32, 24, '#d4ebf4', '#ffffff', '#8ab4c4', A.OUT_COOL);
        const col = /硅锭/.test(f.label) ? ['#5c6f84', '#9cb4cc', '#344152']
          : /晶圆/.test(f.label) ? ['#487ea8', '#8cd0f0', '#294c69']
          : ['#d9a23b', '#ffe694', '#8f5e1e'];
        A.outlineBox(g, cx - 8, by - 52, 16, 14, col[0], col[1], col[2], A.OUT_COOL, true);
        A.R(g, cx - 12, by - 54, 2, 14, '#ffffff');
      },
      globe(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 胡桃木圆座支架 + 黄铜子午环 + 3/4 地球协作仪
        A.pxEllipse(g, cx, by - 6, 18, 6, A.OUT);
        A.pxEllipse(g, cx, by - 8, 16, 5, '#7d4c29');
        A.R(g, cx - 4, by - 24, 8, 16, A.OUT);
        A.R(g, cx - 2, by - 22, 4, 14, '#c4923e');
        A.pxEllipse(g, cx, by - 38, 22, 22, A.OUT_COOL);
        A.pxEllipse(g, cx, by - 38, 20, 20, '#d8a648');
        A.pxEllipse(g, cx, by - 38, 16, 16, '#3876a8');
        A.pxEllipse(g, cx - 4, by - 40, 8, 6, '#6cb862');
        A.pxEllipse(g, cx + 4, by - 34, 6, 4, '#549e52');
        A.R(g, cx - 6, by - 48, 4, 4, '#d8f2fc');
      },
      starcase(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w), H = 72, top = by - H;
        // 博物馆胡桃木黄铜立式玻璃陈列柜
        A.outlineBox(g, x, top, w, H, '#6e4226', '#9e6840', '#3d2214', A.OUT);
        A.outlineBox(g, x - 2, top - 4, w + 4, 8, '#8a5530', '#ba814f', '#522f19', A.OUT);
        A.outlineBox(g, x + 6, top + 8, w - 12, H - 24, '#d2eaf4', '#ffffff', '#8ab4c4', A.OUT_COOL);
        A.R(g, x + 10, top + 10, w - 20, 2, '#fff6d0');
        A.R(g, x + 8, top + 28, w - 16, 2, '#7d9aa8');
        for (let i = 0; i < Math.max(2, Math.floor((w - 24) / 22)); i++) {
          const ix = x + 12 + i * 22;
          A.outlineBox(g, ix, top + 16, 14, 10, '#d49c3e', '#ffe28a', '#875c1e', A.OUT_COOL);
          A.outlineBox(g, ix, top + 34, 14, 12, '#4a6e8a', '#7eb0d4', '#2b4459', A.OUT_COOL);
        }
        A.R(g, x + 10, top + 12, 2, H - 32, '#ffffff');
        A.R(g, x + 12, by - 10, w - 24, 2, '#e2b659');
      },
      specimencase(g, f, A) {
        const x = A.snap2(f.x), by = A.snap2(f.y + f.h), w = A.snap2(f.w);
        // 3/4 博物馆斜顶玻璃标本展柜（胡桃木柜身 + 斜面玻璃 + 琥珀矿物标本）
        A.outlineBox(g, x, by - 36, w, 36, '#7d4c29', '#ad7246', '#4a2a16', A.OUT);
        for (let px = x + 18; px < x + w - 12; px += 28) A.R(g, px, by - 30, 2, 22, '#54301a');
        A.outlineBox(g, x - 2, by - 54, w + 4, 22, '#d4ecf6', '#ffffff', '#8ab4c4', A.OUT_COOL);
        A.R(g, x + 4, by - 38, w - 8, 4, '#3d2820');
        const gems = ['#e89b3e', '#569e78', '#d96852', '#528ec4', '#e2bc52'];
        for (let px = x + 10, i = 0; px < x + w - 14; px += 18, i++) {
          A.R(g, px, by - 46, 12, 8, A.OUT_COOL);
          A.R(g, px + 2, by - 44, 8, 4, gems[i % gems.length]);
          A.R(g, px + 2, by - 44, 4, 2, '#fff8dc');
        }
        A.R(g, x + 6, by - 50, 16, 2, '#ffffff');
      },
      orrery(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 3/4 研发中心金辉星盘里程碑仪（八角胡桃木石材基座 + 黄铜刻度盘 + 多轨运行星体）
        A.pxEllipse(g, cx, by - 16, 84, 26, A.OUT);
        A.pxEllipse(g, cx, by - 18, 80, 24, '#5c361e');
        A.pxEllipse(g, cx, by - 22, 76, 22, '#8a5530');
        A.pxEllipse(g, cx, by - 24, 64, 18, '#d9a648');
        A.pxEllipse(g, cx, by - 24, 56, 14, '#24354a');
        A.pxEllipse(g, cx, by - 24, 36, 8, '#c48f3b');
        // 中央精密黄铜主轴与横臂
        A.R(g, cx - 6, by - 78, 12, 56, A.OUT);
        A.R(g, cx - 4, by - 76, 8, 52, '#c8943c');
        A.R(g, cx - 2, by - 76, 2, 52, '#ffe48e');
        A.R(g, cx - 58, by - 56, 116, 6, A.OUT);
        A.R(g, cx - 56, by - 54, 112, 2, '#e2b454');
        A.R(g, cx - 34, by - 68, 68, 4, A.OUT);
        A.R(g, cx - 32, by - 66, 64, 2, '#d4a044');
        // 中央恒星金球（左上高光 + 暖琥珀暗部）
        A.pxEllipse(g, cx, by - 80, 18, 18, A.OUT);
        A.pxEllipse(g, cx, by - 80, 16, 16, '#e09e34');
        A.pxEllipse(g, cx - 2, by - 82, 12, 12, '#ffd45c');
        A.pxEllipse(g, cx - 4, by - 84, 6, 6, '#fff8d4');
        // 西侧蓝色地球与伴月
        A.pxEllipse(g, cx - 56, by - 58, 12, 12, A.OUT_COOL);
        A.pxEllipse(g, cx - 56, by - 58, 10, 10, '#3e84b8');
        A.R(g, cx - 60, by - 62, 4, 4, '#8cd690');
        A.R(g, cx - 58, by - 64, 4, 2, '#e8f8ff');
        // 东侧带环行星
        A.pxEllipse(g, cx + 56, by - 56, 18, 6, A.OUT);
        A.pxEllipse(g, cx + 56, by - 56, 16, 4, '#e6be6a');
        A.pxEllipse(g, cx + 56, by - 58, 10, 10, A.OUT);
        A.pxEllipse(g, cx + 56, by - 58, 8, 8, '#d97854');
        A.R(g, cx + 52, by - 62, 4, 2, '#ffd6b8');
        // 内轨水星/金星
        A.pxEllipse(g, cx - 32, by - 68, 8, 8, A.OUT);
        A.pxEllipse(g, cx - 32, by - 68, 6, 6, '#f0ba56');
        A.pxEllipse(g, cx + 32, by - 68, 8, 8, A.OUT_COOL);
        A.pxEllipse(g, cx + 32, by - 68, 6, 6, '#7ec4d8');
      },
      lamppost(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 5F 迷雾探索核心路标：胡桃黄铜立柱暖光宫灯（0 半透明像素，高辨识暖金灯笼顶）
        A.outlineBox(g, cx - 10, by - 8, 20, 8, '#6e4226', '#9e6840', '#3d2214', A.OUT);
        A.R(g, cx - 6, by - 12, 12, 4, '#c4923e');
        A.R(g, cx - 4, by - 62, 8, 50, A.OUT_COOL);
        A.R(g, cx - 2, by - 60, 4, 48, '#4a525e');
        A.R(g, cx - 2, by - 60, 2, 48, '#7c8796');
        A.R(g, cx - 6, by - 42, 12, 4, '#c4923e');
        A.outlineBox(g, cx - 12, by - 80, 24, 20, '#ffd86b', '#fffbe0', '#c98a2c', A.OUT, true);
        A.R(g, cx - 6, by - 74, 8, 10, '#fffdf0');
        A.outlineBox(g, cx - 14, by - 84, 28, 6, '#5c4638', '#8f725c', '#362820', A.OUT);
      },
      telescope(g, f, A) {
        const cx = A.snap2(f.x + f.w / 2), by = A.snap2(f.y + f.h);
        // 3/4 精密黄铜胡桃木三脚架观测望远镜
        A.pxEllipse(g, cx, by - 6, 28, 8, A.OUT);
        A.pxEllipse(g, cx, by - 8, 24, 6, '#6e4226');
        for (const dx of [-14, 0, 12]) {
          A.R(g, cx + dx - 2, by - 32, 6, 24, A.OUT);
          A.R(g, cx + dx, by - 30, 2, 20, '#8f5832');
        }
        A.outlineBox(g, cx - 28, by - 46, 54, 16, '#cf9b3e', '#ffe48e', '#82561c', A.OUT_COOL);
        A.outlineBox(g, cx + 20, by - 50, 16, 22, '#78c4e4', '#ffffff', '#386e8e', A.OUT_COOL);
        A.outlineBox(g, cx - 36, by - 42, 12, 10, '#4a525e', '#7c8796', '#282e36', A.OUT_COOL);
      },
      starboard(g, f, A) { A.COMMON.whiteboard(g, f); },
      craftdesk(g, f, A) { A.COMMON.desk(g, f); },
      teacounter(g, f, A) { A.COMMON.counter(g, f); },
      teatable(g, f, A) { A.COMMON.table(g, f); }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
