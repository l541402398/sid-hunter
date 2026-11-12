'use strict';
// High-resolution 2D brass, walnut and ruby. Artwork is painted at display-independent scale.
(function () {
  const SID = window.SID = window.SID || {};
  const SIZE = 400, CX = 200, CY = 206, FACE = 154, TAU = Math.PI * 2;
  let housing, rotor, fittings, cacheScale = 0, cacheKey = '';

  function linear(g, x0, y0, x1, y1, stops) {
    const paint = g.createLinearGradient(x0, y0, x1, y1);
    stops.forEach(([at, color]) => paint.addColorStop(at, color));
    return paint;
  }
  function radial(g, x, y, r, stops, lightX = x, lightY = y) {
    const paint = g.createRadialGradient(lightX, lightY, 0, x, y, r);
    stops.forEach(([at, color]) => paint.addColorStop(at, color));
    return paint;
  }
  function circle(g, x, y, r, fill, stroke, width = 1) {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  }
  function metal(g, x, y, r) {
    return linear(g, x - r, y - r, x + r, y + r, [
      [0, '#fff0bc'], [.14, '#d8b46e'], [.29, '#8d632f'], [.43, '#f5d994'],
      [.54, '#ffeabd'], [.67, '#ba8a45'], [.86, '#7e5429'], [1, '#d3a45c']
    ]);
  }
  function layer(scale, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.round(SIZE * scale);
    const g = canvas.getContext('2d'); g.scale(scale, scale);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    paint(g); return canvas;
  }
  function paintHousing(g) {
    // Soft contact shadow, separate from the sharply lit metal profile.
    g.save(); g.shadowColor = 'rgba(65, 36, 17, .36)'; g.shadowBlur = 15; g.shadowOffsetY = 8;
    circle(g, CX, CY, 174, '#725331'); g.restore();
    circle(g, CX, CY + 3, 176, '#805b32', '#a17b48', .8);
    circle(g, CX, CY, 177, metal(g, CX, CY, 177), '#dfbd7d', .8);
    circle(g, CX, CY, 173.5, null, '#fff4ceae', 1.2);
    circle(g, CX, CY, 171.5, null, '#77532f', 1.6);
    circle(g, CX, CY, 169.5, linear(g, 50, 70, 345, 365, [[0, '#f1d597'], [.35, '#b18b4c'], [.65, '#dcb978'], [1, '#8e6735']]));
    circle(g, CX, CY, 157.5, '#6f4e2d', '#f7dfaa', .8);
    circle(g, CX, CY, 155.5, null, '#c7a46a', 1.5);
    // Inset fine engraving follows the outer ring without turning into a dark outline.
    for (let i = 0; i < 80; i++) {
      const a = -Math.PI / 2 + i * TAU / 80, long = i % 5 === 0;
      g.beginPath();
      g.moveTo(CX + Math.cos(a) * (long ? 159.5 : 163), CY + Math.sin(a) * (long ? 159.5 : 163));
      g.lineTo(CX + Math.cos(a) * 166.5, CY + Math.sin(a) * 166.5);
      g.strokeStyle = long ? '#805b3299' : '#96723d77'; g.lineWidth = long ? 1 : .55; g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i + .5) * TAU / 8, x = CX + Math.cos(a) * 170, y = CY + Math.sin(a) * 170;
      circle(g, x, y + .8, 2.8, '#6e4f2d99');
      circle(g, x, y, 2.4, radial(g, x, y, 2.7, [[0, '#fff4d2'], [.45, '#e4c183'], [1, '#936935']], x - .7, y - .8));
    }
  }
  function paintRotor(g, slots) {
    const slice = TAU / slots.length;
    for (let i = 0; i < slots.length; i++) {
      const mid = -Math.PI / 2 + i * slice, light = i % 2 === 0;
      g.save(); g.beginPath(); g.moveTo(CX, CY);
      g.arc(CX, CY, FACE, mid - slice / 2, mid + slice / 2); g.closePath(); g.clip();
      circle(g, CX, CY, FACE, radial(g, CX, CY, FACE, light
        ? [[0, '#ffefc8'], [.66, '#f4e1b5'], [1, '#d7ba80']]
        : [[0, '#624232'], [.6, '#432b24'], [1, '#2a1b19']], CX - 20, CY - 34));
      // Thin, continuous walnut grain is cached so that it rotates with the inlay.
      g.translate(CX, CY); g.rotate(mid); g.lineWidth = .55;
      for (let row = -160; row <= 160; row += 7) {
        g.beginPath();
        for (let x = 0; x <= 160; x += 5) {
          const y = row + Math.sin(x * .045 + row * .15) * 1.6 + Math.sin(x * .11 + row) * .45;
          if (!x) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokeStyle = light ? 'rgba(135, 94, 42, .12)' : 'rgba(221, 179, 118, .11)'; g.stroke();
      }
      g.restore();
    }
    for (let i = 0; i < slots.length; i++) {
      const a = -Math.PI / 2 + (i - .5) * slice;
      g.save(); g.translate(CX, CY); g.rotate(a);
      g.beginPath(); g.moveTo(52, .7); g.lineTo(FACE, .7);
      g.strokeStyle = '#6d4b2a99'; g.lineWidth = 2.2; g.stroke();
      g.beginPath(); g.moveTo(53, -.25); g.lineTo(FACE, -.25);
      g.strokeStyle = '#f4db9d'; g.lineWidth = .9; g.stroke(); g.restore();
    }
    circle(g, CX, CY, FACE - .7, null, '#b78e57', .8);
    circle(g, CX, CY, FACE, radial(g, CX, CY, FACE, [[0, '#ffeaba0d'], [.7, '#442a1700'], [1, '#442a1726']]));
  }
  function ink(g, text, x, y, font) {
    g.font = font; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const m = g.measureText(text), left = m.actualBoundingBoxLeft ?? 0, right = m.actualBoundingBoxRight ?? m.width;
    const up = m.actualBoundingBoxAscent ?? 24, down = m.actualBoundingBoxDescent ?? 0;
    return { x: x + (left - right) / 2, y: y + (up - down) / 2 };
  }
  function paintNumbers(g, slots, angle) {
    const slice = TAU / slots.length;
    slots.forEach((slot, i) => {
      const mid = -Math.PI / 2 + i * slice + angle, x = CX + Math.cos(mid) * 112, y = CY + Math.sin(mid) * 112;
      const text = String(slot.amount ?? slot.glyph ?? '★');
      g.save(); const at = ink(g, text, x, y, '700 34px "Times New Roman", "Noto Serif", serif');
      g.shadowColor = 'rgba(65, 37, 16, .6)'; g.shadowBlur = 2; g.shadowOffsetY = 1.4;
      g.strokeStyle = '#79552c'; g.lineWidth = 1.25; g.lineJoin = 'round'; g.strokeText(text, at.x, at.y);
      g.fillStyle = linear(g, 0, y - 15, 0, y + 15, [[0, '#fff3c5'], [.43, '#edcf8e'], [.6, '#bd8f49'], [1, '#efd294']]);
      g.fillText(text, at.x, at.y); g.restore();
    });
  }
  function paintHub(g) {
    g.save(); g.shadowColor = 'rgba(40, 16, 10, .45)'; g.shadowBlur = 10; g.shadowOffsetY = 5;
    circle(g, CX, CY, 61, '#79522f'); g.restore();
    // Rounded metal tabs and fine rivets replace the squared pixel gear teeth.
    for (let i = 0; i < 12; i++) {
      g.save(); g.translate(CX, CY); g.rotate(i * TAU / 12);
      g.beginPath(); g.roundRect(-5, -63, 10, 12, 2.5);
      g.fillStyle = linear(g, -5, 0, 5, 0, [[0, '#b28b51'], [.35, '#ffe6ae'], [1, '#9c703a']]);
      g.fill(); g.strokeStyle = '#8c6638'; g.lineWidth = .7; g.stroke(); g.restore();
    }
    circle(g, CX, CY, 59, metal(g, CX, CY, 59), '#e1bf80', 1);
    circle(g, CX, CY, 55.5, null, '#fff0c8', .8);
    circle(g, CX, CY, 53, '#79552f', '#a47b43', 1.3);
    circle(g, CX, CY, 51, metal(g, CX, CY, 51));
    circle(g, CX, CY, 46, '#4c1423', '#f2d49b', 1.5);
    circle(g, CX, CY, 43.8, radial(g, CX, CY, 49, [
      [0, '#ffb7ad'], [.18, '#e96975'], [.43, '#be2549'], [.72, '#8d1237'], [1, '#4b0b25']
    ], CX - 18, CY - 25));
    g.save(); g.beginPath(); g.arc(CX, CY, 43.3, 0, TAU); g.clip();
    // Broad, translucent facets read as glass instead of a low-resolution mosaic.
    g.beginPath(); g.moveTo(CX - 37, CY - 18); g.lineTo(CX - 14, CY - 37); g.lineTo(CX + 17, CY - 31);
    g.lineTo(CX + 26, CY - 12); g.lineTo(CX - 17, CY - 10); g.closePath();
    g.fillStyle = linear(g, CX, CY - 40, CX, CY + 10, [[0, '#ffe1d794'], [1, '#ff8a9a05']]); g.fill();
    g.beginPath(); g.moveTo(CX - 38, CY - 17); g.lineTo(CX - 20, CY + 14); g.lineTo(CX - 13, CY + 40);
    g.lineTo(CX - 42, CY + 20); g.closePath(); g.fillStyle = '#f77c9326'; g.fill();
    g.beginPath(); g.moveTo(CX + 26, CY - 12); g.lineTo(CX + 40, CY + 13); g.lineTo(CX + 15, CY + 39);
    g.lineTo(CX + 18, CY + 13); g.closePath(); g.fillStyle = '#500a2545'; g.fill();
    g.beginPath(); g.ellipse(CX - 10, CY - 26, 25, 8, -.22, 0, TAU);
    g.fillStyle = linear(g, 0, CY - 36, 0, CY - 18, [[0, '#ffffffc4'], [.7, '#ffe5e249'], [1, '#ffe5e200']]); g.fill();
    g.beginPath(); g.ellipse(CX + 7, CY + 34, 24, 6, -.18, 0, TAU);
    g.fillStyle = '#ff789733'; g.fill();
    g.beginPath(); g.arc(CX - 1, CY - 1, 40.5, Math.PI * 1.02, Math.PI * 1.77);
    g.strokeStyle = '#ffe7dda6'; g.lineWidth = .9; g.stroke(); g.restore();
    for (let i = 0; i < 8; i++) {
      const a = (i + .5) * TAU / 8, x = CX + Math.cos(a) * 54, y = CY + Math.sin(a) * 54;
      circle(g, x, y, 1.7, radial(g, x, y, 2, [[0, '#fff0cb'], [.45, '#d8b273'], [1, '#8c5d30']], x - .5, y - .6));
    }
    g.save(); const at = ink(g, 'GO', CX, CY + 1, '700 38px Georgia, "Times New Roman", serif');
    g.fillStyle = '#6d1533'; g.fillText('GO', at.x + .5, at.y + 2);
    g.shadowColor = '#4b0c29aa'; g.shadowBlur = 3; g.shadowOffsetY = 1.2;
    g.fillStyle = linear(g, 0, CY - 18, 0, CY + 20, [[0, '#fffbe9'], [.4, '#fff1bd'], [.55, '#cfa568'], [1, '#fff0bd']]);
    g.strokeStyle = '#ffe7baad'; g.lineWidth = .6; g.strokeText('GO', at.x, at.y); g.fillText('GO', at.x, at.y); g.restore();
  }
  function paintPointer(g) {
    circle(g, CX, 34, 28, radial(g, CX, 34, 28, [[0, '#ffe1a145'], [1, '#ffe1a100']]));
    g.save(); g.shadowColor = '#6b421e70'; g.shadowBlur = 4; g.shadowOffsetY = 3;
    g.beginPath(); g.moveTo(CX, 13); g.lineTo(CX + 7, 23);
    g.bezierCurveTo(CX + 21, 19, CX + 24, 32, CX + 14, 40);
    g.bezierCurveTo(CX + 8, 45, CX + 6, 59, CX, 76);
    g.bezierCurveTo(CX - 6, 59, CX - 8, 45, CX - 14, 40);
    g.bezierCurveTo(CX - 24, 32, CX - 21, 19, CX - 7, 23); g.closePath();
    g.fillStyle = linear(g, CX - 20, 0, CX + 20, 0, [[0, '#9b6a35'], [.25, '#efd69c'], [.49, '#fff6cf'], [.53, '#c39955'], [1, '#8e5d2d']]);
    g.fill(); g.strokeStyle = '#d2ab6a'; g.lineWidth = .9; g.stroke(); g.restore();
    g.beginPath(); g.moveTo(CX, 41); g.lineTo(CX, 68); g.strokeStyle = '#fff1bf'; g.lineWidth = 1; g.stroke();
    for (const sign of [-1, 1]) {
      g.beginPath(); g.moveTo(CX + sign * 4, 46); g.bezierCurveTo(CX + sign * 5, 35, CX + sign * 14, 40, CX + sign * 12, 30);
      g.strokeStyle = '#946a3b'; g.lineWidth = .85; g.stroke();
    }
    circle(g, CX, 28, 8, metal(g, CX, 28, 8), '#d9b674', .8);
    circle(g, CX, 28, 4.4, radial(g, CX, 28, 5, [[0, '#ffe0d2'], [.3, '#ec8990'], [.7, '#a42041'], [1, '#621731']], CX - 1.5, 26.5));
  }
  function draw(canvas, slots, angle = 0) {
    if (!canvas || !slots?.length) return;
    const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const key = JSON.stringify(slots.map(s => [s.kind, s.amount, s.glyph]));
    if (cacheScale !== scale) {
      housing = layer(scale, paintHousing); fittings = layer(scale, g => { paintHub(g); paintPointer(g); });
      rotor = null; cacheScale = scale;
    }
    if (!rotor || cacheKey !== key) { rotor = layer(scale, g => paintRotor(g, slots)); cacheKey = key; }
    const side = Math.round(SIZE * scale);
    if (canvas.width !== side || canvas.height !== side) canvas.width = canvas.height = side;
    const g = canvas.getContext('2d'); g.setTransform(scale, 0, 0, scale, 0, 0); g.clearRect(0, 0, SIZE, SIZE);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(housing, 0, 0, SIZE, SIZE);
    g.save(); g.translate(CX, CY); g.rotate(angle); g.translate(-CX, -CY); g.drawImage(rotor, 0, 0, SIZE, SIZE); g.restore();
    paintNumbers(g, slots, angle); g.drawImage(fittings, 0, 0, SIZE, SIZE);
    const description = `${slots.length} 格积分转盘，奖励：${slots.map(s => s.label || `${s.amount} 积分`).join('、')}`;
    if (canvas.getAttribute('aria-label') !== description) canvas.setAttribute('aria-label', description);
  }
  SID.wheelArt = { draw };
})();