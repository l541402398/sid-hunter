'use strict';
// 搜打撤物品格的 16×16 像素图标（需求③）。
//
// 为什么是程序化像素画：桌面素材库里没有成套的"办公室战利品"小图标
// （office-supplies-32x32 只有 4 件、0x72 与 tiny-dungeon 是奇幻武器药水、Antea 是整件家具），
// 拼凑会得到风格不统一的物品格。这里用统一的 16×16 网格 + 固定调色板手绘一套原创图标：
// 与地图里的真实素材同为"像素画"，但保证同一套光照/描边/饱和度，缩放到 32/40px 仍是硬边像素。
//
// 约定：所有坐标都在 16×16 虚拟网格内，g 已被调用方按 size/16 缩放，且 imageSmoothingEnabled=false。
(function (root) {
  const SID = root.SID = root.SID || {};
  const OUT = '#151a22';       // 统一外描边
  const INK = '#2b3442';       // 内部深色
  const PAPER = '#f4f1e6';     // 纸张
  const PAPER_D = '#d8d3c2';   // 纸张阴影
  const BLUE = '#3f7bd6';
  const BLUE_L = '#79b2f2';
  const GREEN = '#4aa564';
  const GREEN_L = '#8fd49b';
  const RED = '#cc4b46';
  const YELLOW = '#f2c14e';
  const YELLOW_L = '#ffe08a';
  const ORANGE = '#e08a2e';
  const PURPLE = '#8a6ad0';
  const GRAY = '#8d99a8';
  const GRAY_D = '#5a6472';
  const GRAY_L = '#c3ccd6';
  const BROWN = '#a9744f';
  const CYAN = '#54c9d6';

  const P = {
    // —— 文档类 ——
    doc(g) {
      solid(g, 3, 1, 10, 14, PAPER);
      cut(g, 10, 1, 3, 3);
      for (let i = 0; i < 4; i++) line(g, 5, 5 + i * 2, 6, GRAY_D);
      line(g, 5, 13, 4, BLUE);
    },
    paper(g) {
      solid(g, 2, 2, 12, 12, PAPER);
      line(g, 4, 5, 8, GRAY_D); line(g, 4, 8, 8, GRAY_D); line(g, 4, 11, 5, GRAY_D);
      line(g, 2, 14, 12, PAPER_D);
    },
    memo(g) {
      solid(g, 3, 2, 10, 11, YELLOW_L);
      cut(g, 10, 2, 3, 3);
      line(g, 5, 6, 6, '#b5892a'); line(g, 5, 9, 6, '#b5892a');
      band(g, 7, 1, 2, 4, '#e05d5d');
    },
    note(g) {
      solid(g, 3, 2, 10, 12, PAPER);
      squiggle(g, 5, 6); squiggle(g, 5, 10);
      line(g, 3, 14, 10, PAPER_D);
    },
    plan(g) {
      solid(g, 2, 2, 12, 12, '#2c5fa8');
      line(g, 4, 5, 8, '#9ec8ff'); line(g, 4, 8, 4, '#9ec8ff');
      line(g, 8, 8, 0, ''); solid(g, 8, 8, 1, 5, '#9ec8ff');
      solid(g, 4, 12, 4, 1, '#9ec8ff');
    },
    contract(g) {
      solid(g, 3, 1, 10, 14, PAPER);
      line(g, 5, 5, 6, GRAY_D); line(g, 5, 8, 6, GRAY_D);
      solid(g, 5, 11, 5, 1, INK);
      solid(g, 9, 9, 3, 3, RED);     // 红章
      stampRing(g, 10, 10);
    },
    // —— 收纳类 ——
    folder(g) {
      solid(g, 1, 4, 14, 10, '#d9a441');
      band(g, 2, 2, 6, 3, '#e8b95c');
      solid(g, 1, 6, 14, 8, '#e8b95c');
      line(g, 1, 13, 14, '#a97a22');
      line(g, 3, 8, 8, '#a97a22');
    },
    clip(g) {
      stroke(g, 8, 2, 4, 10, GRAY_L);
      stroke(g, 10, 4, 1, 7, GRAY);
    },
    // —— 数码类 ——
    usb(g) {
      solid(g, 5, 1, 6, 5, GRAY);
      solid(g, 6, 6, 4, 9, INK);
      solid(g, 7, 8, 2, 3, CYAN);
      line(g, 6, 13, 4, GRAY_D);
    },
    keycard(g) {
      solid(g, 1, 4, 14, 8, '#4b6fa8');
      band(g, 1, 4, 14, 2, '#7fa8dd');
      solid(g, 2, 8, 4, 2, YELLOW_L);
    },
    badge(g) {
      solid(g, 5, 1, 6, 1, GRAY);
      solid(g, 2, 3, 12, 12, BLUE);
      solid(g, 4, 5, 8, 4, PAPER);
      solid(g, 5, 10, 6, 1, GRAY_L);
      solid(g, 5, 12, 4, 1, GRAY_L);
    },
    laptop(g) {
      solid(g, 2, 3, 12, 8, GRAY_D);
      solid(g, 3, 4, 10, 6, '#2f6fb5');
      solid(g, 1, 11, 14, 2, GRAY_L);
      solid(g, 7, 11, 2, 1, GRAY);
    },
    hdd(g) {
      solid(g, 2, 3, 12, 10, INK);
      solid(g, 3, 4, 10, 4, '#3a4658');
      solid(g, 4, 9, 3, 2, GREEN_L);
      solid(g, 10, 9, 2, 2, YELLOW);
      line(g, 2, 13, 12, '#0d1118');
    },
    disc(g) {
      circle(g, 8, 8, 6, GRAY_L);
      circle(g, 8, 8, 4, CYAN);
      circle(g, 8, 8, 2, PAPER);
      solid(g, 8, 2, 2, 2, '#ffffff88');
    },
    chip(g) {
      solid(g, 4, 4, 8, 8, INK);
      solid(g, 5, 5, 6, 6, '#3f5a3a');
      solid(g, 6, 6, 4, 4, GREEN);
      for (let i = 0; i < 3; i++) { solid(g, 2, 5 + i * 3, 2, 1, GRAY); solid(g, 12, 5 + i * 3, 2, 1, GRAY); }
      for (let i = 0; i < 3; i++) { solid(g, 5 + i * 3, 2, 1, 2, GRAY); solid(g, 5 + i * 3, 12, 1, 2, GRAY); }
    },
    cable(g) {
      stroke(g, 4, 2, 0, 8, INK);
      stroke(g, 6, 10, 6, 0, INK);
      solid(g, 2, 10, 3, 3, GRAY);
      solid(g, 12, 8, 3, 3, GRAY_L);
    },
    battery(g) {
      solid(g, 3, 4, 8, 8, GREEN);
      solid(g, 4, 5, 3, 6, GREEN_L);
      solid(g, 11, 6, 2, 4, GRAY);
      solid(g, 3, 4, 8, 1, '#2f7a48');
    },
    camera(g) {
      solid(g, 2, 5, 12, 9, INK);
      solid(g, 5, 3, 4, 2, GRAY_D);
      circle(g, 8, 9, 3, GRAY);
      circle(g, 8, 9, 2, '#2f6fb5');
      solid(g, 12, 6, 1, 1, YELLOW);
    },
    // —— 生活类 ——
    mug(g) {
      solid(g, 3, 4, 8, 9, PAPER);
      solid(g, 11, 6, 2, 4, PAPER_D);
      solid(g, 4, 5, 6, 3, BROWN);
      line(g, 3, 13, 8, PAPER_D);
    },
    snack(g) {
      solid(g, 3, 2, 10, 12, ORANGE);
      solid(g, 3, 5, 10, 2, PAPER);
      solid(g, 5, 8, 6, 4, YELLOW_L);
    },
    coffee(g) {
      solid(g, 3, 6, 9, 8, PAPER);
      solid(g, 4, 7, 7, 2, BROWN);
      solid(g, 12, 8, 2, 3, PAPER_D);
      for (let i = 0; i < 3; i++) stroke(g, 5 + i * 3, 1, 0, 3, '#ffffff77');
    },
    pill(g) {
      solid(g, 3, 6, 10, 5, PAPER);
      solid(g, 3, 6, 5, 5, RED);
      circle(g, 4, 8, 1, '#ffd6d4');
    },
    watch(g) {
      solid(g, 6, 1, 4, 3, GRAY_D);
      solid(g, 6, 12, 4, 3, GRAY_D);
      circle(g, 8, 8, 5, GRAY_L);
      circle(g, 8, 8, 4, '#2b3442');
      solid(g, 8, 5, 1, 4, PAPER);
      solid(g, 9, 8, 2, 1, PAPER);
    },
    tool(g) {
      solid(g, 3, 3, 2, 2, GRAY);
      solid(g, 4, 4, 2, 2, GRAY);
      stroke(g, 5, 5, 7, 7, GRAY_L, 2);
      solid(g, 11, 11, 3, 3, GRAY);
    },
    key(g) {
      circle(g, 4, 4, 3, YELLOW);
      circle(g, 4, 4, 1, INK);
      stroke(g, 6, 6, 8, 8, YELLOW, 2);
      solid(g, 11, 11, 3, 1, YELLOW);
      solid(g, 9, 13, 1, 2, YELLOW);
    },
    vaultkey(g) {
      circle(g, 5, 4, 4, '#c9a227');
      circle(g, 5, 4, 1, INK);
      stroke(g, 7, 7, 7, 7, '#c9a227', 2);
      solid(g, 10, 10, 4, 2, '#c9a227');
      solid(g, 9, 13, 2, 2, '#c9a227');
      solid(g, 12, 7, 2, 1, '#f6e08a');
    },
    // —— 价值类 ——
    cash(g) {
      solid(g, 1, 4, 14, 8, GREEN);
      band(g, 1, 4, 14, 1, GREEN_L);
      solid(g, 2, 5, 12, 6, '#3f8f57');
      circle(g, 8, 8, 2, GREEN_L);
    },
    gold(g) {
      solid(g, 2, 7, 12, 6, YELLOW);
      band(g, 3, 5, 10, 2, YELLOW_L);
      band(g, 2, 7, 12, 1, '#b5892a');
      solid(g, 4, 9, 3, 2, '#fff6c0');
    },
    jewel(g) {
      solid(g, 3, 5, 10, 3, '#e05d8f');
      solid(g, 4, 8, 8, 4, '#f2a0c0');
      solid(g, 6, 12, 4, 2, '#e05d8f');
      solid(g, 5, 6, 2, 2, '#ffffffaa');
    },
    stamp(g) {
      solid(g, 3, 3, 10, 3, RED);
      solid(g, 5, 6, 6, 5, '#8f3b38');
      solid(g, 1, 11, 14, 3, RED);
      solid(g, 2, 12, 12, 1, '#ffd6d4');
    },
    // —— 货币 / 券 ——
    chips(g) {
      circle(g, 8, 8, 6, RED);
      circle(g, 8, 8, 4, '#eae2cf');
      circle(g, 8, 8, 2, RED);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        solid(g, Math.round(8 + Math.cos(a) * 6 - 1), Math.round(8 + Math.sin(a) * 6 - 1), 2, 2, PAPER);
      }
    },
    chipbox(g) {
      solid(g, 2, 5, 12, 9, BROWN);
      solid(g, 2, 5, 12, 2, '#c99a6d');
      solid(g, 5, 9, 6, 3, RED);
      solid(g, 6, 10, 4, 1, YELLOW_L);
      line(g, 2, 14, 12, '#6f4a2c');
    },
    clue(g) {
      solid(g, 1, 5, 14, 6, '#3b6ed6');
      solid(g, 1, 5, 3, 6, '#2a4fa0');
      solid(g, 4, 7, 2, 2, PAPER);
      solid(g, 4, 7, 1, 1, '#3b6ed6');
      solid(g, 9, 7, 4, 2, '#cfe0ff');
    }
  };

  // ---------- 画图原语 ----------
  function solid(g, x, y, w, h, color) { g.fillStyle = color; g.fillRect(x, y, w, h); }
  // 带 1px 外描边的实心块
  function strokeBox(g, x, y, w, h, color) {
    solid(g, x, y, w, h, OUT); solid(g, x + 1, y + 1, w - 2, h - 2, color);
  }
  function band(g, x, y, w, h, color) { solid(g, x, y, w, h, color); }
  function line(g, x, y, len, color) { solid(g, x, y, len, 1, color); }
  function cut(g, x, y, w, h) { // 折角
    solid(g, x, y, w, h, '#00000000');
    g.clearRect(x, y, w, h);
    solid(g, x, y, w, 1, PAPER_D); solid(g, x, y, 1, h, PAPER_D);
  }
  function squiggle(g, x, y) {
    line(g, x, y, 5, GRAY_D); line(g, x + 1, y + 2, 4, GRAY_D); line(g, x, y + 4, 3, GRAY_D);
  }
  function stampRing(g, cx, cy) {
    g.strokeStyle = '#ff9a94'; g.lineWidth = 1;
    g.strokeRect(cx - 2.5, cy - 2.5, 5, 5);
  }
  function stroke(g, x, y, w, h, color, thick = 1) {
    solid(g, x, y, Math.max(thick, w), Math.max(thick, h), color);
  }
  function circle(g, cx, cy, r, color) {
    g.fillStyle = color;
    for (let y = -r; y <= r; y++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      g.fillRect(cx - dx, cy + y, dx * 2 + 1, 1);
    }
  }
  // ---------- 真实素材图标（第二轮：用户要求"物品格也要用素材库"） ----------
  // 这些图来自在线素材包，已复制进 vendor 并附 SOURCE-README：
  //   Antea 办公家具包（CC-BY，须署名）的 Papers / Folders / Wall-Note
  //   Pixelfrog Treasure Hunters（CC0）的金币 / 蓝宝石 / 羊皮地图 / 药水 / 金骷髅
  //   0x72 Dungeon Tileset（CC0）的四色药剂瓶
  // 绘制规则：整数倍最近邻放大并居中，避免像素被插值糊掉；素材未就绪时回落手绘图标。
  const REAL = {
    papers: '/assets/vendor/antea-office/Papers.png',
    folders: '/assets/vendor/antea-office/Folders.png',
    note: '/assets/vendor/antea-office/Wall-Note.png',
    gold: '/assets/vendor/pixelfrog-treasure/gold-coin.png',
    diamond: '/assets/vendor/pixelfrog-treasure/blue-diamond.png',
    map: '/assets/vendor/pixelfrog-treasure/big-map.png',
    potion: '/assets/vendor/pixelfrog-treasure/red-potion.png',
    skull: '/assets/vendor/pixelfrog-treasure/golden-skull.png',
    flaskR: '/assets/vendor/dungeon-0x72/flask_red.png',
    flaskG: '/assets/vendor/dungeon-0x72/flask_green.png',
    flaskB: '/assets/vendor/dungeon-0x72/flask_blue.png',
    flaskY: '/assets/vendor/dungeon-0x72/flask_yellow.png'
  };
  const realImages = {};
  const realReady = {};
  (function preloadReal() {
    if (typeof Image !== 'function') return;
    for (const key of Object.keys(REAL)) {
      const img = new Image();
      img.onload = () => { realImages[key] = img; realReady[key] = true; };
      img.onerror = () => { realReady[key] = false; };
      img.src = REAL[key];
    }
  })();
  function realSprite(art, size) {
    const img = realImages[art];
    if (!img) return null;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const s = Math.max(1, Math.floor(size / Math.max(img.width, img.height)));
    const w = img.width * s, h = img.height * s;
    g.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);
    return c;
  }
  // 关键：所有图标统一在 16×16 网格内绘制；调用方负责缩放与关闭平滑。
  function paint(g, key) {
    const fn = P[key] || P.doc;
    g.save();
    g.imageSmoothingEnabled = false;
    fn(g);
    g.restore();
  }
  // 生成一个离屏 canvas（按 size 放大），供 <canvas> 或 drawImage 直接使用。
  // art 有值且素材已加载时优先用真实素材，否则用同键的手绘图标。
  const cache = new Map();
  function sprite(key, size = 32, art) {
    const real = art ? realSprite(art, size) : null;
    if (real) return real;
    const k = key + '@' + size;
    if (cache.has(k)) return cache.get(k);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.scale(size / 16, size / 16);
    paint(g, key);
    cache.set(k, c);
    return c;
  }
  SID.lootIcons = { paint, sprite, keys: Object.keys(P), realReady: () => Object.keys(realReady).filter(k => realReady[k]) };
})(window);
