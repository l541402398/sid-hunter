'use strict';
// 场景接待/档案NPC专用。玩家与管理员加的好/坏NPC不走这套素材。
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = { createJuliRenderer: factory };
  else {
    root.SID = root.SID || {};
    const api = root.SID.juliSprites = factory(root);
    api.load();
  }
})(typeof window !== 'undefined' ? window : globalThis, function(env) {
  const CELL_W = 128, CELL_H = 112, ANCHOR_X = 64, ANCHOR_Y = 104, SCALE = .8;
  const DIRECTIONS = ['front', 'left', 'right', 'back'];
  const SCENE_NPCS = new Set(['npc-reception', 'npc-archive']);
  // 固定最大视觉范围，覆盖白色翼片和手掌；仅用于本地点击及描边，不改64px近距交互。
  const BOUNDS = Object.freeze({ x: -46, y: -78, w: 92, h: 80 });
  let status = 'loading', image = null, promise = null;
  const metrics = { draws: 0 };
  function isSceneNpc(p) { return !!(p && p.npc && SCENE_NPCS.has(p.entityId)); }
  function load() {
    if (promise) return promise;
    promise = new Promise(resolve => {
      const asset = new env.Image();
      asset.onload = () => {
        if (asset.naturalWidth !== CELL_W * 4 || asset.naturalHeight !== CELL_H) {
          status = 'error'; resolve(false); return;
        }
        image = asset; status = 'ready'; resolve(true);
      };
      asset.onerror = () => { status = 'error'; resolve(false); };
      asset.src = '/assets/npcs-juli/juli-atlas.png?v=2';
    });
    return promise;
  }
  function bounds(p) { return isSceneNpc(p) && status === 'ready' ? BOUNDS : null; }
  function draw(ctx, p, clock) {
    if (!isSceneNpc(p) || status !== 'ready' || !image) return false;
    const direction = DIRECTIONS.includes(p.facing) ? p.facing : 'front';
    const column = DIRECTIONS.indexOf(direction);
    const x = Math.round(p.x), y = Math.round(p.y);
    // 仅机体轻微呼吸压缩，脚底与地面影子不动；无需逐帧像素扫描/蒙版/重新着色。
    const compression = 1 - .015 * (.5 - .5 * Math.cos((Number(clock) || 0) * Math.PI * 2 / 2.8));
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#11182733';
    ctx.beginPath(); ctx.ellipse(x, y + 1, 18, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(image, column * CELL_W, 0, CELL_W, CELL_H,
      x - ANCHOR_X * SCALE, y - ANCHOR_Y * SCALE * compression,
      CELL_W * SCALE, CELL_H * SCALE * compression);
    ctx.restore(); metrics.draws++;
    return true;
  }
  return { load, draw, bounds, isSceneNpc, metrics, get status() { return status; },
    spec: Object.freeze({ cellWidth: CELL_W, cellHeight: CELL_H, anchorX: ANCHOR_X, anchorY: ANCHOR_Y, scale: SCALE, directions: DIRECTIONS.slice() }) };
});
