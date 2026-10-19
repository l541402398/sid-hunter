'use strict';
// 客户端 F1 碰撞调试层（零依赖）：把 TMJ collision 层、旧家具/墙 footprint 和玩家身体盒叠在同一张世界坐标图上。
// 只读 WORLD / WORLD.TMJ，不参与权威移动；打开 F1 只影响绘制。
// 数据来源：/tiled/floor1..7.tmj（server/http-util.js 只读托管），由 game.js 在 boot 时预取。
(function () {
  const SID = window.SID = window.SID || {};
  const state = {
    visible: false,
    mapsReady: false,
    loaded: 0,
    error: '',
    authority: false, // 服务端快照 config.tmj：true 表示权威行走碰撞已经切到 TMJ
    pending: false,
    base: '/tiled',
    lastStats: null,
    lastLoadedAt: 0,
  };
  const statsCache = new Map();
  const miniCache = new Map();
  let loadPromise = null;

  const TMJ = () => window.WORLD && window.WORLD.TMJ;
  const scale = () => (window.WORLD && window.WORLD.FLOOR_SCALE) || 1;
  const bw = () => (window.WORLD && window.WORLD.BODY_HALF) || 9;
  const footTop = () => (window.WORLD && window.WORLD.FOOT_TOP) || 4;
  const footBottom = () => (window.WORLD && window.WORLD.FOOT_BOTTOM) || 5;

  function load(base) {
    if (loadPromise) return loadPromise;
    if (base) state.base = base;
    const T = TMJ();
    if (!T) { state.error = 'WORLD.TMJ 未加载'; return Promise.resolve(0); }
    const jobs = [];
    for (let id = 1; id <= 7; id++) {
      jobs.push(fetch(`${state.base}/floor${id}.tmj`, { cache: 'no-store' }).then(r => {
        if (!r.ok) throw new Error(`floor${id}: HTTP ${r.status}`);
        return r.json();
      }).then(json => { T.install(id, json); return id; }));
    }
    loadPromise = Promise.allSettled(jobs).then(results => {
      state.loaded = results.filter(r => r.status === 'fulfilled').length;
      state.mapsReady = state.loaded > 0;
      state.lastLoadedAt = Date.now();
      const failed = results.find(r => r.status === 'rejected');
      state.error = failed ? String(failed.reason && failed.reason.message || failed.reason) : '';
      if (state.pending) apply(true);
      return state.loaded;
    }).catch(e => {
      state.error = String(e && e.message || e);
      loadPromise = null;
      return 0;
    });
    return loadPromise;
  }

  // 服务端通过 snapshot.config.tmj 下发开关；地图未下完时先记账，fetch 完再应用同一套布局。
  // 布局只用 WORLD.applyTMJLayout()，与 Node 启动时走的是同一个函数，避免两端 hall/portal 漂移。
  function apply(on) {
    const T = TMJ();
    if (!T) return false;
    const pendingBefore = state.pending;
    state.authority = !!on;
    if (on && !state.mapsReady) { state.pending = true; return false; }
    state.pending = false;
    const wasEnabled = T.isEnabled();
    const enabled = T.enable(!!on);
    const applied = enabled && window.WORLD.applyTMJLayout ? window.WORLD.applyTMJLayout() : 0;
    const changed = !!(applied || enabled !== wasEnabled || (enabled && pendingBefore));
    if (changed) statsCache.clear();
    // 通知 game.js：floor.halls/portals/spawnPoints 已经换成 TMJ 版本，需要重建当前层的渲染缓存。
    // 延迟到下一轮事件循环，避免在 applySnapshot 中途重入 draw()；只在真正发生变化时发一次。
    if (changed) {
      try { setTimeout(() => window.dispatchEvent(new Event('tmj:layout')), 0); } catch { /* 老浏览器忽略 */ }
    }
    return enabled;
  }

  function toggle() { state.visible = !state.visible; return state.visible; }
  function setVisible(v) { state.visible = !!v; return state.visible; }
  function isVisible() { return state.visible; }

  function pointInPoly(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  // 旧碰撞的原始 blocker：TMJ 接管后 WORLD.floorBlockers() 会返回 []，调试层需要另一条只读路径。
  function vanillaBlockers(floorId, doorStates) {
    const W = window.WORLD;
    const f = W && W.floorById(floorId);
    if (!f) return [];
    const list = f.furniture.filter(q => !q.architecturalPlaceholder).concat(f.walls || []);
    // 与服务端 floorBlockers 对齐：北侧隐形墙带 (0..1440 × 0..96) 属于旧碰撞的一部分，
    // 少了它会把整排上方格子误判成「旧可走」，对比统计虚高。
    list.push({ x: 0, y: 0, w: 1440, h: 96 });
    for (const d of (f.glassDoors || [])) {
      if (doorStates && doorStates[d.id] && doorStates[d.id].open) continue;
      list.push(d);
    }
    return list;
  }
  function vanillaInFloor(floorId, x, y) {
    const f = window.WORLD.floorById(floorId);
    if (!f) return false;
    if (pointInPoly(f.polygon, x, y)) return true;
    return (f.halls || []).some(h => x >= h.x && x <= h.x + h.w && y > h.y && y < h.y + h.h);
  }
  function vanillaCollides(floorId, x, y, doorStates) {
    if (!vanillaInFloor(floorId, x, y)) return true;
    return window.WORLD.collidesAt(x, y, vanillaBlockers(floorId, doorStates));
  }

  // 整层一致性统计（只在第一次打开 / 楼层切换时算一次；~2250 格 × 170 blocker 仍很轻）。
  function stats(floorId, doorStates) {
    const key = `${floorId}:${state.authority ? 1 : 0}`;
    if (statsCache.has(key)) return statsCache.get(key);
    const T = TMJ();
    const m = T && T.get(floorId);
    if (!m) return null;
    const s = scale(), ts = m.tileWidth * s;
    let tmjOpen = 0, oldOpen = 0, mismatch = 0, solid = 0;
    for (let ty = 0; ty < m.height; ty++) for (let tx = 0; tx < m.width; tx++) {
      const i = ty * m.width + tx;
      const cx = (tx + 0.5) * ts, cy = (ty + 0.5) * ts;
      const nowSolid = m.collision[i] !== 0;
      const beforeSolid = vanillaCollides(floorId, cx, cy, doorStates);
      if (nowSolid) solid++; else tmjOpen++;
      if (!beforeSolid) oldOpen++;
      if (nowSolid !== beforeSolid) mismatch++;
    }
    const out = { floorId: Number(floorId), solid, tmjOpen, oldOpen, mismatch, total: m.width * m.height, theme: m.theme };
    statsCache.set(key, out);
    return out;
  }

  function drawWorld(ctx, o) {
    const W = window.WORLD, T = TMJ();
    const m = T.get(o.floorId);
    if (!m) return;
    const s = o.scale, ws = scale();
    // 世界坐标里的一格 = 16px × FLOOR_SCALE；画在已 scale(s) 的上下文里，不再乘屏幕缩放。
    const tw = m.tileWidth * ws;
    const camX = Math.round(o.cameraX), camY = Math.round(o.cameraY);
    const viewW = o.viewW, viewH = o.viewH;
    const x0 = Math.max(0, Math.floor(camX / tw)), x1 = Math.min(m.width - 1, Math.floor((camX + viewW) / tw));
    const y0 = Math.max(0, Math.floor(camY / tw)), y1 = Math.min(m.height - 1, Math.floor((camY + viewH) / tw));
    ctx.save();
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    ctx.scale(s, s);
    ctx.translate(-camX, -camY);

    // TMJ collision 实心格：红色半透明；可走格给一点冷色底，便于和旧图区分。
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const i = ty * m.width + tx;
      if (m.collision[i]) {
        ctx.fillStyle = 'rgba(255,64,72,0.19)';
        ctx.fillRect(tx * tw, ty * tw, tw, tw);
      } else {
        ctx.fillStyle = 'rgba(64,170,255,0.035)';
        ctx.fillRect(tx * tw, ty * tw, tw, tw);
        // decor / objects 层用像素小点提示，不遮住原来的家具绘制。
        if (m.decor && m.decor[i]) { ctx.fillStyle = 'rgba(255,196,92,0.55)'; ctx.fillRect(tx * tw + tw * .34, ty * tw + tw * .34, tw * .32, tw * .32); }
        if (m.objects && m.objects[i]) { ctx.fillStyle = 'rgba(120,255,220,0.65)'; ctx.fillRect(tx * tw + tw * .15, ty * tw + tw * .15, tw * .22, tw * .22); }
      }
    }
    // 网格：每格一条，5 格加粗。
    ctx.lineWidth = 1;
    for (let tx = x0; tx <= x1 + 1; tx++) {
      ctx.strokeStyle = tx % 5 === 0 ? 'rgba(120,210,255,0.34)' : 'rgba(120,210,255,0.12)';
      ctx.beginPath(); ctx.moveTo(tx * tw + .5, y0 * tw); ctx.lineTo(tx * tw + .5, (y1 + 1) * tw); ctx.stroke();
    }
    for (let ty = y0; ty <= y1 + 1; ty++) {
      ctx.strokeStyle = ty % 5 === 0 ? 'rgba(120,210,255,0.34)' : 'rgba(120,210,255,0.12)';
      ctx.beginPath(); ctx.moveTo(x0 * tw, ty * tw + .5); ctx.lineTo((x1 + 1) * tw, ty * tw + .5); ctx.stroke();
    }
    // 旧碰撞 footprint：黄色描边。只画可见范围，避免整层 170 个矩形全画。
    const blockers = vanillaBlockers(o.floorId, o.doorStates);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,214,96,0.62)';
    for (const it of blockers) {
      const rects = it.blocks && it.blocks.length ? it.blocks : [it.footprint];
      for (const r of rects) {
        if (!r || r.x + r.w < camX || r.x > camX + viewW || r.y + r.h < camY || r.y > camY + viewH) continue;
        ctx.strokeRect(r.x + .5, r.y + .5, Math.max(1, r.w - 1), Math.max(1, r.h - 1));
      }
    }
    // TMJ 电梯 / 出生点。
    for (const p of T.portals(o.floorId, ws)) {
      ctx.strokeStyle = '#ffe66a'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - tw, p.y - tw, tw * 2, tw * 2);
      ctx.fillStyle = '#ffe66a';
      ctx.font = '10px ui-monospace,SFMono-Regular,monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${p.side}→${p.targetFloor}F`, p.x - tw, p.y - tw - 3);
    }
    const sp = T.spawnPoint(o.floorId, ws);
    if (sp) {
      ctx.strokeStyle = '#7cf7c4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, tw * .3, 0, Math.PI * 2); ctx.stroke();
    }
    // 玩家身体盒：与 floorCollides 的 TMJ 判定同尺寸（BODY_HALF / FOOT_*）。
    for (const p of (o.players || [])) {
      if (p.floorId !== o.floorId || (p.zoneId || null) !== null) continue;
      const x = p.__renderX !== undefined ? p.__renderX : p.x;
      const y = p.__renderY !== undefined ? p.__renderY : p.y;
      ctx.strokeStyle = p.id === o.selfId ? '#5ff5ff' : 'rgba(120,220,255,.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - bw(), y - footBottom(), bw() * 2, footTop() + footBottom());
      ctx.fillStyle = 'rgba(95,245,255,.9)';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    ctx.restore();
  }

  function panel(ctx, x, y, w, h) {
    ctx.fillStyle = 'rgba(4,8,14,.86)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,210,255,.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  }

  function drawHud(ctx, o, m) {
    const T = TMJ();
    const st = stats(o.floorId, o.doorStates);
    const hasSelf = o.selfX != null && o.selfY != null;
    const cell = hasSelf ? T.cellAt(o.floorId, o.selfX, o.selfY, scale()) : null;
    const tmjSolid = hasSelf ? T.solidAt(o.floorId, o.selfX, o.selfY, scale()) : false;
    const oldSolid = hasSelf ? vanillaCollides(o.floorId, o.selfX, o.selfY, o.doorStates) : false;
    const mode = state.authority ? 'ON（服务端权威）' : 'OFF（旧碰撞回退）';
    const lines = [
      `F1 · TMJ 碰撞调试  [${state.visible ? '显示' : '隐藏'}]`,
      `${o.floorId}F ${m.theme}  ${m.width}×${m.height} @ ${m.tileWidth}px  地图 ${state.mapsReady ? '✓' + state.loaded + '/7' : '加载中…'}`,
      `权威开关 ${mode}`,
      `玩家格 ${cell ? `${cell.x},${cell.y}` : '—'}  TMJ=${hasSelf ? (tmjSolid ? '实心' : '可走') : '—'}  旧=${hasSelf ? (oldSolid ? '实心' : '可走') : '—'}`,
      st ? `整层：TMJ空 ${st.tmjOpen}  旧空 ${st.oldOpen}  差异(手绘vs旧) ${st.mismatch}/${st.total}（${(st.mismatch / st.total * 100).toFixed(1)}%）` : '整层统计：无地图',
      `图例：红=TMJ 实心  黄=旧家具/墙  青=身体盒  绿=TMJ 出生点`,
      o.zoneId ? '当前在独立房间：TMJ 碰撞只作用于楼层公共空间' : 'F1 关闭调试',
    ];
    ctx.save();
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    ctx.font = '11px ui-monospace,SFMono-Regular,Consolas,monospace';
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const pad = 9, lh = 15, x = 10, y = 10, h = lines.length * lh + pad * 2;
    panel(ctx, x, y, Math.min(o.cssW - 20, w + pad * 2), h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = i === 0 ? '#eaf6ff' : i === 2 && state.authority ? '#7cf7c4' : '#b8d4e8';
      ctx.fillText(lines[i], x + pad, y + pad + i * lh);
    }
    ctx.restore();
    state.lastStats = st;
  }

  // 整层小地图底图只烘焙一次（90×25×2px），之后每帧只贴图 + 画镜头框/玩家。
  function minimapBase(m, cell = 2) {
    const key = `${m.floorId}:${cell}`;
    if (miniCache.has(key)) return miniCache.get(key);
    const c = document.createElement('canvas');
    c.width = m.width * cell; c.height = m.height * cell;
    const g = c.getContext('2d');
    for (let ty = 0; ty < m.height; ty++) for (let tx = 0; tx < m.width; tx++) {
      const i = ty * m.width + tx;
      g.fillStyle = m.collision[i] ? 'rgba(255,64,72,.70)' : 'rgba(36,58,76,.92)';
      g.fillRect(tx * cell, ty * cell, cell, cell);
    }
    miniCache.set(key, c);
    return c;
  }

  function drawMinimap(ctx, o, m) {
    ctx.save();
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    const cell = 2, w = m.width * cell, h = m.height * cell;
    const x = o.cssW - w - 12, y = 26;
    panel(ctx, x - 4, y - 16, w + 8, h + 20);
    ctx.font = '9px ui-monospace,SFMono-Regular,monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#b8d4e8';
    ctx.fillText(`TMJ ${m.width}×${m.height} · 1格=${m.tileWidth}px`, x, y - 13);
    ctx.drawImage(minimapBase(m, cell), x, y);
    // 当前视野框
    const ws = scale(), ts = m.tileWidth * ws;
    ctx.strokeStyle = 'rgba(140,230,255,.85)'; ctx.lineWidth = 1;
    ctx.strokeRect(x + o.cameraX / ts * cell, y + o.cameraY / ts * cell, o.viewW / ts * cell, o.viewH / ts * cell);
    // 玩家
    if (o.selfX != null) {
      ctx.fillStyle = '#5ff5ff';
      ctx.fillRect(x + o.selfX / ts * cell - 1.5, y + o.selfY / ts * cell - 1.5, 3, 3);
    }
    ctx.restore();
  }

  function drawRoomHint(ctx, o) {
    ctx.save();
    ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
    ctx.font = '12px ui-monospace,SFMono-Regular,Consolas,monospace';
    const line1 = 'F1 · TMJ 碰撞调试';
    const line2 = '当前在独立房间：TMJ 只接管楼层公共空间，房间仍走旧几何';
    const w = Math.max(ctx.measureText(line1).width, ctx.measureText(line2).width) + 20;
    panel(ctx, 10, 10, w, 48);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#eaf6ff'; ctx.fillText(line1, 20, 18);
    ctx.fillStyle = '#b8d4e8'; ctx.fillText(line2, 20, 36);
    ctx.restore();
  }

  function draw(ctx, o) {
    if (!state.visible || !o) return;
    if (o.zoneId) { drawRoomHint(ctx, o); return; }
    const T = TMJ();
    const m = T && T.get(o.floorId);
    if (!m) {
      // 地图没加载时也给出提示，避免 F1 看起来没反应。
      ctx.save();
      ctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0);
      ctx.font = '12px ui-monospace,SFMono-Regular,Consolas,monospace';
      const msg = state.error ? `TMJ 地图加载失败：${state.error}` : 'TMJ 地图加载中…（/tiled/floorN.tmj）';
      const w = ctx.measureText(msg).width + 18;
      panel(ctx, 10, 10, w, 28);
      ctx.fillStyle = '#ffd27a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(msg, 19, 25);
      ctx.restore();
      return;
    }
    drawWorld(ctx, o);
    drawHud(ctx, o, m);
    drawMinimap(ctx, o, m);
  }

  const api = { load, apply, toggle, setVisible, isVisible, draw, stats, vanillaBlockers, state };
  SID.tmjDebug = api;
  window.__tmjDebug = api;
})();

