/* Repo-native pixel illustrations. No remote images, fonts, or generation API. */
(() => {
  'use strict';
  const P = {
    ink: '#45351f',
    wood: '#98663d',
    woodLight: '#c18d55',
    woodDark: '#68462d',
    paper: '#fff0ce',
    gold: '#bf9047',
    light: '#f6d991',
    green: '#527e4a',
    darkGreen: '#315a3e',
    leaf: '#84a65d',
    blue: '#7b9c9a',
    brick: '#b77353'
  };
  const rect = (g, x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  function poly(g, points, color) {
    g.fillStyle = color;
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
  }
  function ellipse(g, x, y, rx, ry, color) {
    for (let dy = -ry; dy < ry; dy += 2) {
      const half = Math.round(rx * Math.sqrt(1 - ((dy + 1) / ry) ** 2));
      if (half > 0) rect(g, x - half, y + dy, half * 2, 2, color);
    }
  }
  function star(g, x, y, size = 3, color = P.gold) {
    rect(g, x - size, y, size * 3, size, color);
    rect(g, x, y - size, size, size * 3, color);
  }
  const noise = (x, y) => {
    let a = (x * 374761393 + y * 668265263) | 0;
    a = (a ^ (a >>> 13)) * 1274126177;
    return ((a ^ (a >>> 16)) >>> 0) / 4294967295;
  };

  function plant(g, x, y, size = 1, flower = '') {
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.scale(size, size);
    rect(g, -7, -1, 14, 4, '#bf8f55');
    rect(g, -6, 3, 12, 10, '#a56d43');
    rect(g, -4, 4, 3, 7, '#c4905b');
    rect(g, -4, 13, 8, 2, '#785332');
    rect(g, -1, -25, 2, 25, P.darkGreen);
    poly(
      g,
      [
        [0, -15],
        [-10, -20],
        [-11, -27],
        [-5, -26],
        [1, -19]
      ],
      P.green
    );
    poly(
      g,
      [
        [0, -9],
        [11, -15],
        [12, -23],
        [6, -22],
        [0, -15]
      ],
      P.leaf
    );
    poly(
      g,
      [
        [0, -23],
        [-4, -32],
        [0, -38],
        [5, -31],
        [3, -25]
      ],
      '#6b9251'
    );
    if (flower) {
      rect(g, -3, -40, 6, 10, flower);
      rect(g, -5, -38, 10, 6, flower);
      rect(g, -1, -36, 3, 3, '#f3d184');
    }
    g.restore();
  }
  function person(g, x, y, palette = 0, scale = 1) {
    const shirt = ['#637d88', '#b67c65', '#78875b', '#ad9c74', '#74708a'][palette % 5];
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    rect(g, -5, -25, 10, 9, '#59442f');
    rect(g, -4, -22, 8, 9, '#eac49b');
    rect(g, -5, -25, 10, 4, '#59442f');
    rect(g, -6, -13, 12, 12, shirt);
    rect(g, -8, -11, 3, 9, shirt);
    rect(g, 5, -11, 3, 9, shirt);
    rect(g, -5, -1, 4, 8, '#575b52');
    rect(g, 1, -1, 4, 8, '#575b52');
    rect(g, -6, 6, 5, 2, '#423c31');
    rect(g, 1, 6, 5, 2, '#423c31');
    rect(g, -2, -18, 1, 1, '#59442f');
    rect(g, 2, -18, 1, 1, '#59442f');
    g.restore();
  }
  function office() {
    const canvas = document.getElementById('office-scene');
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    rect(g, 0, 0, 1440, 900, '#a5a47c');
    rect(g, 0, 0, 1440, 350, '#e4d3a8');
    for (let x = 0; x < 1440; x += 80) {
      rect(g, x, 0, 3, 350, '#d6c197');
      rect(g, x + 5, 0, 1, 350, '#eedfbd');
    }
    rect(g, 0, 330, 1440, 16, '#987143');
    rect(g, 0, 344, 1440, 10, '#614a31');
    for (let y = 354; y < 900; y += 36) {
      for (let x = -160; x < 1440; x += 160) {
        const xx = x + (y % 72 ? 80 : 0);
        rect(
          g,
          xx,
          y,
          158,
          34,
          ['#b99563', '#bf9c6b', '#c6a574', '#b38d5b'][Math.floor(noise(xx, y) * 4)]
        );
        rect(g, xx + 12, y + 21, 50, 2, '#a9895966');
      }
    }
    for (let i = 0; i < 5; i++) {
      const x = 104 + i * 273;
      rect(g, x - 7, 140, 170, 164, '#725e3e');
      rect(g, x, 146, 156, 147, '#d0c99d');
      rect(g, x + 5, 150, 146, 138, '#94b5a1');
      rect(g, x + 74, 148, 7, 141, '#ddd5ac');
      rect(g, x + 3, 214, 149, 7, '#ddd5ac');
      rect(g, x - 11, 300, 178, 9, '#967345');
    }
    // A little front desk, plants, and workstation islands.
    for (let i = 0; i < 3; i++) {
      const x = 700 + i * 245,
        y = 420 + (i % 2) * 85;
      ellipse(g, x + 60, y + 96, 105, 13, '#67583e25');
      rect(g, x - 25, y, 180, 62, '#8c6941');
      rect(g, x - 29, y - 5, 188, 14, '#d3af79');
      rect(g, x - 13, y + 62, 10, 35, '#725536');
      rect(g, x + 131, y + 62, 10, 35, '#725536');
      rect(g, x + 17, y - 54, 87, 52, '#4b5f52');
      rect(g, x + 22, y - 49, 77, 39, '#8fa89b');
      rect(g, x + 56, y - 3, 13, 6, '#4b5f52');
      plant(g, x + 137, y - 5, 1.1);
    }
    rect(g, 780, 715, 430, 90, '#617955');
    rect(g, 790, 724, 410, 72, '#8b9b69');
    rect(g, 794, 730, 402, 60, '#728658');
    for (const [x, y, s] of [
      [77, 415, 2.8],
      [1310, 422, 2.5],
      [1230, 692, 1.9],
      [650, 705, 1.9]
    ])
      plant(g, x, y, s);
    rect(g, 90, 713, 430, 55, '#a58151');
    rect(g, 80, 702, 450, 17, '#c6a46e');
    rect(g, 104, 768, 13, 31, '#715638');
    rect(g, 480, 768, 13, 31, '#715638');
    for (let i = 0; i < 7; i++) person(g, 630 + i * 95, 670 - (i % 2) * 75, i, 2.3);
  }

  const portraitCache = new Map();
  function portrait(index) {
    if (portraitCache.has(index)) return portraitCache.get(index);
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 112;
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    const palettes = [
      ['#c5c8a7', '#d7d8ba'],
      ['#c7b8a0', '#e1d4ba'],
      ['#adbeb0', '#d1d8be'],
      ['#c8bfa5', '#e4d9bc']
    ];
    const p = palettes[index % 4];
    rect(g, 0, 0, 96, 112, p[0]);
    rect(g, 5, 5, 86, 102, p[1]);
    rect(g, 5, 73, 86, 34, p[0]);
    person(g, 48, 87, index, 2.55);
    star(g, 80, 17, 2, '#f6e7c5');
    const src = canvas.toDataURL();
    portraitCache.set(index, src);
    return src;
  }
  const mascot = new Image();
  const ready = new Promise((resolve) => {
    mascot.onload = () => {
      paintMascots(document);
      resolve(true);
    };
    mascot.onerror = () => resolve(false);
  });
  mascot.src = 'assets/juli-yellow-sheet.png';
  function paintMascots(root) {
    if (!mascot.complete || !mascot.naturalWidth) return;
    root.querySelectorAll('.juli-portrait,.dedication-juli,.ending-juli').forEach((canvas) => {
      const g = canvas.getContext('2d');
      g.clearRect(0, 0, canvas.width, canvas.height);
      // Render the front view directly from the supplied three-view source, preserving its alpha and identity.
      const sx = 158,
        sy = 520,
        sw = 835,
        sh = 665,
        s = Math.min(canvas.width / sw, canvas.height / sh);
      g.drawImage(
        mascot,
        sx,
        sy,
        sw,
        sh,
        (canvas.width - sw * s) / 2,
        (canvas.height - sh * s) / 2,
        sw * s,
        sh * s
      );
    });
  }
  function vines() {
    const ns = 'http://www.w3.org/2000/svg';
    document.querySelectorAll('.cover-vine').forEach((svg, index) => {
      const add = (parent, tag, attrs) => {
        const el = document.createElementNS(ns, tag);
        for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
        parent.append(el);
        return el;
      };
      const defs = add(svg, 'defs', {}),
        prefix = 'cover-ivy-' + index;
      const gradient = (name, stops, attrs = {}) => {
        const g = add(defs, 'linearGradient', {
          id: prefix + name,
          x1: '0%',
          y1: '0%',
          x2: '100%',
          y2: '100%',
          ...attrs
        });
        stops.forEach(([offset, color]) => add(g, 'stop', { offset, 'stop-color': color }));
        return 'url(#' + prefix + name + ')';
      };
      // A faceted leaf has two lit planes, a shaded folded edge, a vein and its own cast shadow.
      const lit = gradient('-leaf-lit', [
        ['0%', '#d9de88'],
        ['35%', '#a8bd59'],
        ['70%', '#74963c'],
        ['100%', '#4c742e']
      ]);
      const shade = gradient('-leaf-shade', [
        ['0%', '#80a54d'],
        ['45%', '#54792f'],
        ['100%', '#294a21']
      ]);
      const stem = gradient(
        '-stem',
        [
          ['0%', '#c3cb76'],
          ['25%', '#8fa657'],
          ['55%', '#567737'],
          ['100%', '#273f21']
        ],
        { x2: '100%', y2: '0%' }
      );
      const shadow = add(defs, 'filter', {
        id: prefix + '-shadow',
        x: '-60%',
        y: '-50%',
        width: '230%',
        height: '230%'
      });
      add(shadow, 'feDropShadow', {
        dx: '2',
        dy: '4',
        stdDeviation: '1.6',
        'flood-color': '#1b1c0b',
        'flood-opacity': '.65'
      });
      const body = add(svg, 'g', { filter: 'url(#' + prefix + '-shadow)' });
      const path = 'M7 143 C-2 100 41 94 30 61 C23 28 65 15 92 29 C120 43 137 14 193 20';
      add(body, 'path', {
        d: path,
        fill: 'none',
        stroke: '#233c1f',
        'stroke-width': 8,
        'stroke-linecap': 'round'
      });
      add(body, 'path', {
        d: path,
        fill: 'none',
        stroke: stem,
        'stroke-width': 5.5,
        'stroke-linecap': 'round'
      });
      add(body, 'path', {
        d: 'M6 140 C0 104 39 94 28 62 C22 29 64 14 92 27 C119 41 138 12 191 18',
        fill: 'none',
        stroke: '#b9c774',
        'stroke-width': 1.2,
        'stroke-linecap': 'round',
        opacity: '.8'
      });
      for (const [x, y, r, size] of [
        [13, 120, -45, 1.05],
        [29, 98, 65, 0.95],
        [28, 71, -50, 1.12],
        [40, 44, 25, 1],
        [67, 24, -30, 1.05],
        [93, 31, 100, 0.96],
        [122, 30, -20, 1.1],
        [155, 20, 45, 0.85],
        [181, 19, -30, 0.9]
      ]) {
        const leaf = add(body, 'g', {
          transform: `translate(${x} ${y}) rotate(${r}) scale(${size})`
        });
        add(leaf, 'path', {
          d: 'M0 1 L-6 -7 L-5 -15 L-1 -22 L5 -28 L12 -21 L14 -13 L10 -5 L3 1 Z',
          fill: '#2d4923',
          stroke: '#213b1e',
          'stroke-width': 1.4
        });
        add(leaf, 'path', { d: 'M0 -1 L-4 -8 L-4 -14 L0 -21 L5 -26 L4 -13 L2 -5 Z', fill: lit });
        add(leaf, 'path', { d: 'M2 -3 L5 -26 L11 -20 L12 -13 L9 -6 Z', fill: shade });
        add(leaf, 'path', {
          d: 'M1 0 L4 -14 L5 -25',
          fill: 'none',
          stroke: '#d4d58a',
          'stroke-width': 1.1,
          opacity: '.85'
        });
        add(leaf, 'path', {
          d: 'M3 -8 L-2 -14 M4 -14 L0 -19 M4 -11 L10 -16 M5 -18 L9 -21',
          fill: 'none',
          stroke: '#c5cf7c',
          'stroke-width': '.7',
          opacity: '.55'
        });
        add(leaf, 'path', {
          d: 'M-4 -11 L-3 -16 L2 -23',
          fill: 'none',
          stroke: '#d7dc90',
          'stroke-width': 1,
          opacity: '.65'
        });
      }
      // Two curls wrap over the gilt edge rather than lying on a single plane.
      add(body, 'path', {
        d: 'M26 88 C46 79 50 92 39 98 C33 100 31 95 35 92 M111 31 C115 13 132 12 129 22 C127 29 120 25 124 21',
        fill: 'none',
        stroke: '#355124',
        'stroke-width': 4.5,
        'stroke-linecap': 'round'
      });
      add(body, 'path', {
        d: 'M26 86 C46 77 50 90 39 96 M111 29 C115 11 132 10 129 20',
        fill: 'none',
        stroke: '#b6c66d',
        'stroke-width': 1.3,
        'stroke-linecap': 'round'
      });
    });
  }
  for (let i = 0; i < 16; i++) {
    const el = document.createElement('i');
    el.className = 'firefly';
    el.style.left = noise(i, 5) * 100 + '%';
    el.style.top = noise(i, 9) * 100 + '%';
    el.style.animationDelay = -noise(i, 13) * 6 + 's';
    document.getElementById('fireflies').append(el);
  }
  office();
  vines();
  window.AnnualArt = Object.freeze({ portrait, paintMascots, ready });
})();
