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
    root.querySelectorAll('.dedication-juli,.ending-juli').forEach((canvas) => {
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
        dx: '1',
        dy: '2',
        stdDeviation: '1',
        'flood-color': '#1b1c0b',
        'flood-opacity': '.42'
      });
      const body = add(svg, 'g', { filter: 'url(#' + prefix + '-shadow)' });
      // The visible vine undulates around the corner; its two ends continue behind the leather.
      const path = 'M12 130 C38 151 65 126 43 103 C19 80 19 59 38 48 C57 37 71 67 89 47 C106 27 89 16 116 17 C144 18 137 44 162 35 C181 28 179 6 196 11';
      add(body, 'path', {
        d: path,
        fill: 'none',
        stroke: '#233c1f',
        'stroke-width': 5.2,
        'stroke-linecap': 'round'
      });
      add(body, 'path', {
        d: path,
        fill: 'none',
        stroke: stem,
        'stroke-width': 3.4,
        'stroke-linecap': 'round'
      });
      add(body, 'path', {
        d: path,
        fill: 'none',
        stroke: '#b9c774',
        'stroke-width': 0.8,
        'stroke-linecap': 'round',
        opacity: '.8'
      });
      const branches = [
        'M29 138 C58 151 79 140 77 117 C75 99 53 94 60 74 C65 60 82 67 83 77',
        'M37 95 C20 103 7 88 11 74 C14 63 29 63 29 72 C29 79 21 78 20 74',
        'M49 48 C40 23 53 7 72 14 C83 18 78 31 71 29 C65 27 67 20 72 22',
        'M103 25 C111 49 131 63 144 54 C154 46 149 37 143 40 C137 43 143 48 146 45',
        'M151 37 C160 54 181 54 188 39 C193 28 184 25 182 31'
      ];
      for (const d of branches) {
        add(body, 'path', { d, fill: 'none', stroke: '#3b5d2a', 'stroke-width': 2.4, 'stroke-linecap': 'round' });
        add(body, 'path', { d, fill: 'none', stroke: '#afbb6b', 'stroke-width': 0.7, 'stroke-linecap': 'round' });
      }
      const returns = svg.parentElement.querySelector('.cover-vine-return');
      for (const d of [
        'M47 163 C13 178 -9 159 1 140 C4 133 8 130 12 130',
        'M196 11 C197 -8 218 -13 227 -3 C237 8 225 22 208 22'
      ]) {
        add(returns, 'path', { d, fill: 'none', stroke: '#253d23', 'stroke-width': 5.1, 'stroke-linecap': 'round' });
        add(returns, 'path', { d, fill: 'none', stroke: '#638043', 'stroke-width': 3.2, 'stroke-linecap': 'round' });
      }
      for (const [x, y, r, size] of [
        [17, 136, -73, 0.9], [35, 141, 118, 1.06],
        [52, 129, 45, 0.84], [45, 109, -31, 1.1],
        [29, 89, -64, 1.04], [25, 72, 74, 0.91],
        [37, 49, -45, 1.04], [48, 42, 49, 0.82],
        [70, 57, 117, 1.03], [85, 48, -22, 0.97],
        [99, 27, -42, 0.91], [116, 18, 39, 0.95],
        [133, 31, 130, 1.08], [154, 39, 63, 0.88],
        [170, 28, -18, 0.96], [187, 14, 48, 0.85],
        [75, 119, 133, 0.75], [66, 96, 39, 0.8],
        [124, 54, 132, 0.73], [182, 49, 51, 0.71]
      ]) {
        const leaf = add(body, 'g', {
          transform: `translate(${x} ${y}) rotate(${r}) scale(${size})`
        });
        add(leaf, 'path', {
          d: 'M0 1 C-12 -9 -5 -23 5 -29 C17 -21 19 -6 3 1 Z',
          fill: '#2d4923',
          stroke: '#213b1e',
          'stroke-width': 1.4
        });
        add(leaf, 'path', { d: 'M0 -1 C-8 -9 -3 -21 5 -27 L4 -13 L2 -5 Z', fill: lit });
        add(leaf, 'path', { d: 'M2 -3 L5 -27 C15 -19 15 -8 2 -3 Z', fill: shade });
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
      // Small ivory blossoms sit among the leaves, with warm centres matching the gilt.
      for (const [x, y, size, rotation] of [[39, 52, 0.89, 12], [133, 34, 0.64, -8], [39, 128, 0.61, 27], [75, 81, 0.51, -17]]) {
        const blossom = add(body, 'g', {
          class: 'vine-flower',
          transform: `translate(${x} ${y}) rotate(${rotation}) scale(${size})`
        });
        for (let petal = 0; petal < 5; petal++) {
          add(blossom, 'path', {
            d: 'M0 2 C-8 -1 -9 -9 -4 -13 C1 -17 8 -12 6 -6 C5 -1 3 2 0 2 Z',
            transform: `rotate(${petal * 72})`,
            fill: petal % 2 ? '#f8eacf' : '#f0dab7',
            stroke: '#bd945b',
            'stroke-width': 0.65
          });
          add(blossom, 'path', {
            d: 'M0 -3 Q-2 -7 0 -11',
            transform: `rotate(${petal * 72})`,
            fill: 'none', stroke: '#fff9e6', 'stroke-width': 0.7, opacity: 0.7
          });
        }
        add(blossom, 'circle', { r: 4, fill: '#b98031', stroke: '#f4cf80', 'stroke-width': 1 });
        add(blossom, 'circle', { cx: -1, cy: -1, r: 1.3, fill: '#f9e6a5' });
      }
    });
  }
  for (let i = 0; i < 64; i++) {
    const el = document.createElement('i');
    el.className = 'firefly' + (i % 9 === 0 ? ' star-glint' : '');
    // Cover stars occupy the dark margins; the opened book naturally masks their centre.
    const x = i < 24 ? 3 + noise(i, 5) * 27 : i < 48 ? 70 + noise(i, 5) * 27 : noise(i, 5) * 100;
    const y = i >= 48 ? (i % 2 ? 3 + noise(i, 9) * 10 : 87 + noise(i, 9) * 10) : 5 + noise(i, 9) * 90;
    el.style.left = x + '%';
    el.style.top = y + '%';
    el.style.setProperty('--star-size', (i % 9 === 0 ? 5 : 1.2 + noise(i, 3) * 1.4) + 'px');
    el.style.setProperty('--star-duration', (4.8 + noise(i, 8) * 4.5) + 's');
    el.style.setProperty('--star-brightness', (0.28 + noise(i, 11) * 0.55).toFixed(2));
    el.style.animationDelay = -noise(i, 13) * 6 + 's';
    document.getElementById('fireflies').append(el);
  }
  office();
  vines();
  window.AnnualArt = Object.freeze({ portrait, paintMascots, ready });
})();
