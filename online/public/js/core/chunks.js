'use strict';
// 客户端子模块：背景分块缓存（惰性烘焙 + LRU 上限）。自包含，只依赖 document/canvas。
(function () {
  const SID = window.SID = window.SID || {};
  const CHUNK = 256; // 阶段2-阶段1：512→256（世界÷4 后 512 已大于楼层高度 400，会浪费；分块仍是显式 canvas，口径不变）
  // QA-D14：分块缓存加 LRU 上限。原先 cx:cy 键无上限、跨楼层共享，最多 8×4=32 块≈32MiB 常驻；
  // 改为只保留与当前相机相交的块 + 少量预取，容量上限 10 块（≈10MiB），超出按 LRU 淘汰。
  // 被淘汰块后续按世界坐标（cx:cy）确定性重建，图案纯世界坐标 → 视觉无可观察差异；绝不淘汰当前可见块。
  const CHUNK_CACHE_LIMIT = 10;
  const chunkCache = new Map(); // key 'cx:cy' → canvas；Map 迭代顺序即 LRU 顺序（队首最旧）
  let chunkTotal = 0;
  function pruneChunks(keep) {
    while (chunkTotal > CHUNK_CACHE_LIMIT) {
      let victim = null;
      for (const k of chunkCache.keys()) { if (!keep || !keep.has(k)) { victim = k; break; } }
      if (victim === null) break; // 可见块本身已达上限：保留，不淘汰（宁可多留也不闪空）
      chunkCache.delete(victim); chunkTotal--;
    }
  }
  function chunkFor(cx, cy, floorId) {
    const key = floorId + ':' + cx + ':' + cy;
    const hit = chunkCache.get(key); if (hit) return hit;
    const c = document.createElement('canvas'); c.width = CHUNK; c.height = CHUNK;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#4a3727'; g.fillRect(0, 0, CHUNK, CHUNK);
    const planks = ['#54402f', '#4a3727', '#5b462f', '#453324', '#4f3c2c'];
    // 阶段2-阶段1：地板纹理模块 64×16 → 32×8（1.0m×0.25m 宽板），保持缩小后的屏幕观感。
    for (let y = 0; y < CHUNK; y += 8) {
      const row = ((cy * CHUNK + y) / 8) | 0, stag = (row % 2) ? 16 : 0;
      for (let x = -32 + stag; x < CHUNK; x += 32) {
        const worldCol = Math.round((cx * CHUNK + x) / 32);
        const k = Math.abs(row * 31 + worldCol * 17 + 97);
        g.fillStyle = planks[k % 5]; g.fillRect(x, y, 32, 8);
        if (k % 7 === 0) { g.fillStyle = '#3c2c20'; g.fillRect(x + 5, y + 3, 9, 1); }
        else if (k % 5 === 0) { g.fillStyle = '#3c2c20'; g.fillRect(x + 16, y + 5, 6, 1); }
        if (k % 2) { g.fillStyle = '#3d2d20'; g.fillRect(x, y, 1, 8); }
      }
      g.fillStyle = '#5e4936'; g.fillRect(0, y, CHUNK, 1);
      g.fillStyle = '#33251b'; g.fillRect(0, y + 7, CHUNK, 1);
    }
    if (window.SID_SCENE) window.SID_SCENE.floor(g, floorId, cx * CHUNK, cy * CHUNK, CHUNK, CHUNK);
    chunkCache.set(key, c); chunkTotal++; return c;
  }
  // 每帧先把相机矩形相交的块全部就绪并做 LRU 触及，再淘汰离屏块：保证本帧绘制零重烘焙、可见块不被淘汰。
  function ensureChunks(c0x, c0y, c1x, c1y, floorId) {
    const keep = new Set();
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const key = floorId + ':' + cx + ':' + cy; keep.add(key);
      if (chunkCache.has(key)) { const v = chunkCache.get(key); chunkCache.delete(key); chunkCache.set(key, v); } // LRU 触及
      else chunkFor(cx, cy, floorId);
    }
    pruneChunks(keep);
  }
    // 楼层切换/资源就绪时需要整层重建：清空缓存并由调用方按当前 floorId 重烘焙。
  function clear() { chunkCache.clear(); chunkTotal = 0; }
  function get(cx, cy, floorId) { return chunkCache.get(floorId + ':' + cx + ':' + cy); }
  SID.chunks = { CHUNK, CHUNK_CACHE_LIMIT, pruneChunks, chunkFor, ensureChunks, get, clear };
})();
