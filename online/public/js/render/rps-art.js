// 猜拳像素艺术与非匀速帧动画渲染器（Native Canvas 2D，imageSmoothingEnabled = false，整数倍缩放）。
(() => {
  const SID = window.SID = window.SID || {};

  const SHEET_URL = '/assets/vendor/sid-rps-duel/rps-sheet.png';

  const FRAMES = Object.freeze({
    'hand-rock': { x: 1, y: 1, w: 64, h: 64 },
    'hand-scissors': { x: 66, y: 1, w: 64, h: 64 },
    'hand-paper': { x: 131, y: 1, w: 64, h: 64 },
    'opp-rock': { x: 196, y: 1, w: 64, h: 64 },
    'opp-scissors': { x: 261, y: 1, w: 64, h: 64 },
    'opp-paper': { x: 326, y: 1, w: 64, h: 64 },
    'hand-ready': { x: 391, y: 1, w: 64, h: 64 },
    'hand-mystery': { x: 456, y: 1, w: 64, h: 64 },
    'vs-crest': { x: 1, y: 66, w: 48, h: 48 },
    'badge-win': { x: 50, y: 66, w: 48, h: 48 },
    'badge-draw': { x: 99, y: 66, w: 48, h: 48 },
    'badge-lose': { x: 148, y: 66, w: 48, h: 48 },
    'btn-rock': { x: 197, y: 66, w: 32, h: 32 },
    'btn-scissors': { x: 230, y: 66, w: 32, h: 32 },
    'btn-paper': { x: 263, y: 66, w: 32, h: 32 }
  });

  // 蓄势呼吸（4 帧不等长周期 [280, 120, 190, 110] ms）与揭晓撞击（接触帧 260ms 更长）。
  const CHARGE_FRAMES = Object.freeze([
    { ms: 280, dy: 0 },
    { ms: 120, dy: -2 },
    { ms: 190, dy: -4 },
    { ms: 110, dy: -1 }
  ]);
  const REVEAL_FRAMES = Object.freeze([
    { ms: 90, dx: -4, dy: -2, spark: 0 },
    { ms: 70, dx: 3, dy: 0, spark: 0 },
    { ms: 260, dx: 6, dy: 0, spark: 1 },
    { ms: 160, dx: 2, dy: 0, spark: 0 }
  ]);
  const CHARGE_TOTAL_MS = CHARGE_FRAMES.reduce((sum, f) => sum + f.ms, 0);
  const REVEAL_TOTAL_MS = REVEAL_FRAMES.reduce((sum, f) => sum + f.ms, 0);

  let sheetImg = null;
  let sheetReady = false;
  let sheetError = false;

  function loadSheet() {
    if (sheetImg) return;
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => {
      sheetReady = true;
      sheetError = false;
      window.dispatchEvent(new CustomEvent('sid-rps-art-ready'));
    };
    img.onerror = () => {
      sheetError = true;
    };
    img.src = SHEET_URL;
    sheetImg = img;
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * 备战阶段蓄势循环的整数垂直偏移（停驻与起伏节奏不等长）。
   * @param {number} nowMs
   * @returns {number}
   */
  function selectingOffset(nowMs) {
    if (reducedMotion()) return 0;
    const t = ((Number(nowMs) || 0) % CHARGE_TOTAL_MS + CHARGE_TOTAL_MS) % CHARGE_TOTAL_MS;
    let acc = 0;
    for (const frame of CHARGE_FRAMES) {
      acc += frame.ms;
      if (t < acc) return frame.dy;
    }
    return 0;
  }

  /**
   * 揭示碰撞的单次整数像素位移动画（第 2 帧为 260ms 接触停留并附带像素星芒）。
   * @param {number} elapsedMs
   * @param {'self'|'opp'} side
   * @returns {{ dx: number, dy: number, spark: number }}
   */
  function revealAnim(elapsedMs, side = 'self') {
    if (reducedMotion()) return { dx: 0, dy: 0, spark: 0 };
    const t = Number(elapsedMs);
    if (!Number.isFinite(t) || t < 0 || t >= REVEAL_TOTAL_MS) return { dx: 0, dy: 0, spark: 0 };
    const dir = side === 'opp' ? -1 : 1;
    let acc = 0;
    for (const frame of REVEAL_FRAMES) {
      acc += frame.ms;
      if (t < acc) return { dx: frame.dx * dir, dy: frame.dy, spark: frame.spark };
    }
    return { dx: 0, dy: 0, spark: 0 };
  }

  /** 首帧贴图尚未解码完成时的可爱奶油手套轮廓占位，保证零空白帧。 */
  function drawFallback(ctx, spriteName, x0, y0, intScale, w, h) {
    const k = Math.max(1, Math.round((w * intScale) / 32));
    const px = (gx, gy, gw, gh, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x0 + gx * k, y0 + gy * k, gw * k, gh * k);
    };
    if (spriteName === 'hand-mystery') {
      px(6, 3, 20, 26, '#f2b840');
      px(8, 5, 16, 22, '#4172b3');
      px(13, 10, 6, 4, '#f2b840');
      px(15, 14, 4, 4, '#f2b840');
      px(15, 20, 4, 4, '#fff3a6');
    } else if (spriteName === 'hand-ready') {
      px(5, 5, 22, 22, '#f2b840');
      px(8, 8, 16, 16, '#4172b3');
      px(12, 11, 8, 8, '#fffdf5');
      px(12, 20, 8, 3, '#f2b840');
    } else if (spriteName.endsWith('rock')) {
      px(8, 7, 16, 14, '#fffdf5');
      px(10, 22, 12, 4, '#4172b3');
      px(10, 21, 12, 1, '#f2b840');
    } else if (spriteName.endsWith('scissors')) {
      px(10, 14, 12, 8, '#fffdf5');
      px(10, 4, 4, 11, '#fffdf5');
      px(18, 4, 4, 11, '#fffdf5');
      px(10, 22, 12, 4, '#4172b3');
    } else if (spriteName.endsWith('paper')) {
      px(8, 13, 16, 9, '#fffdf5');
      px(7, 5, 3, 9, '#fffdf5');
      px(12, 3, 3, 11, '#fffdf5');
      px(17, 4, 3, 10, '#fffdf5');
      px(22, 7, 3, 7, '#fffdf5');
      px(10, 22, 12, 4, '#4172b3');
    } else {
      const cw = Math.max(8, Math.floor(w / 2));
      const ch = Math.max(8, Math.floor(h / 2));
      ctx.fillStyle = spriteName === 'badge-win' ? '#f2b840' : '#d93b3b';
      ctx.fillRect(
        x0 + Math.floor((w * intScale - cw * intScale) / 2),
        y0 + Math.floor((h * intScale - ch * intScale) / 2),
        cw * intScale,
        ch * intScale
      );
    }
  }

  /** 绘制接触瞬间的纯正整数像素星芒。 */
  function drawSpark(ctx, width, height, stepPx) {
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const s = Math.max(1, stepPx);
    const marks = [
      [-22, -20, '#fff3a6'],
      [20, -22, '#fff3a6'],
      [-20, 18, '#f2b840'],
      [21, 17, '#f2b840'],
      [0, -26, '#fff3a6']
    ];
    for (const [ox, oy, color] of marks) {
      ctx.fillStyle = color;
      ctx.fillRect(cx + ox - s, cy + oy, s * 2, s);
      ctx.fillRect(cx + ox, cy + oy - s, s, s * 2);
    }
  }

  /**
   * 将指定精灵按严格整数倍像素绘制到 Canvas（imageSmoothingEnabled = false）。
   * @param {HTMLCanvasElement|null} canvas
   * @param {string} spriteName
   * @param {{ scale?: number, offsetX?: number, offsetY?: number, spark?: number }} [opts]
   */
  function drawSprite(canvas, spriteName, opts = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    loadSheet();
    const frame = FRAMES[spriteName] || FRAMES['hand-ready'];
    const fitScale = Math.max(1, Math.floor(Math.min(canvas.width / frame.w, canvas.height / frame.h)) || 1);
    const intScale = opts.scale != null ? Math.max(1, Math.round(Number(opts.scale) || 1)) : fitScale;
    const drawW = frame.w * intScale;
    const drawH = frame.h * intScale;
    const ox = Math.floor((canvas.width - drawW) / 2) + Math.round(Number(opts.offsetX) || 0);
    const oy = Math.floor((canvas.height - drawH) / 2) + Math.round(Number(opts.offsetY) || 0);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (sheetReady && sheetImg && !sheetError) {
      ctx.drawImage(sheetImg, frame.x, frame.y, frame.w, frame.h, ox, oy, drawW, drawH);
    } else {
      drawFallback(ctx, spriteName, ox, oy, intScale, frame.w, frame.h);
    }

    if (opts.spark > 0) drawSpark(ctx, canvas.width, canvas.height, Math.max(2, intScale * 2));
  }

  loadSheet();

  SID.rpsArt = {
    SHEET_URL,
    FRAMES,
    drawSprite,
    selectingOffset,
    revealAnim,
    isReady: () => sheetReady
  };
})();
