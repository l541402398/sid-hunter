'use strict';
// 结构化功能区场景陈设（按各层建筑立柱与南侧窗台轴线对称摆放，彻底杜绝孤立散落与堆叠）。
//
// 设计原则：
//   · 仅沿主走廊柱列（y=378）与南侧落地窗台（y=774）成对对称布置，绝不在空旷地面中央孤立撒点；
//   · 全部保持 2× 像素比例（与 72px 角色高度协调）；
//   · 与既有家具/墙体保持充足安全间距（严禁任何视觉穿模或重叠堆叠）；
//   · 独立小房间仅在四角空位对称摆放 2–4 件 2× 比例温润小景，保持室内动线清爽通透。
//
// 加载顺序：必须排在 floors.js、rooms.js、dressing.js 之后，world.js 之前。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode
    ? Object.assign({}, require('./config.js'), require('./geometry.js'), require('./furniture.js'),
      require('./dressing.js'), require('./floors.js'), require('./rooms.js'))
    : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { FLOORS, THEME_CLUTTER, inFloor, floorPortals, floorSpawns, roomsForFloor } = D;

  const rectHit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;

  // 各楼层专属的「建筑轴线锚点」：[bx, by, listIndex]
  // 仅贴靠建筑柱列（y=378）与南窗花池线（y=774），不往房间或开阔地面中央乱放单件
  function structuredAnchorsForFloor(floor, fid, listLen) {
    const anchors = [];
    // 1) 主走廊南侧柱列对称景观位（每 360px 一组）
    for (let x = 360, i = 0; x <= 2520; x += 360, i++) {
      anchors.push([x, 378, i % listLen]);
    }
    // 2) 南侧阳光落地窗内侧花池与茶歇位（贴南墙边缘 y=774）
    for (let x = 320, i = 0; x <= 2600; x += 320, i++) {
      anchors.push([x, 774, (i + 2) % listLen]);
    }
    return anchors;
  }

  const STATS = {};
  if (!THEME_CLUTTER) return { CLUTTER_STATS: STATS };

  for (const key of Object.keys(THEME_CLUTTER)) {
    const fid = Number(key);
    const list = THEME_CLUTTER[key];
    const floor = FLOORS[fid];
    if (!floor || !Array.isArray(list) || !list.length) continue;

    // 既有家具与墙体的完整视觉矩形（含向上延伸高度），确保持久零堆叠
    const occupiedVisuals = floor.furniture.filter(f => !f.architecturalPlaceholder)
      .map(f => ({ x: f.x - 16, y: (f.y + f.h) - 64, w: f.w + 32, h: 74 }))
      .concat(floor.walls.map(w => ({ x: w.x - 16, y: w.y - 34, w: w.w + 32, h: w.h + 42 })));
    const doors = roomsForFloor(fid).map(r => r.door);
    const portals = floorPortals(fid);
    const spawns = floorSpawns(fid);
    const placed = [];

    const anchors = structuredAnchorsForFloor(floor, fid, list.length);
    let made = 0;
    const MAX_ITEMS = 6;

    for (const [bx, by, specIdx] of anchors) {
      if (made >= MAX_ITEMS) break;
      const spec = list[specIdx % list.length];
      const w = spec.w, h = spec.h;
      const left = Math.round(bx - w / 2), top = by - h;
      if (!inFloor(fid, bx, by) || !inFloor(fid, bx, Math.max(64, by - 20))) continue;
      if (by < 360 || by > floor.height - 16) continue;

      const visual = { x: left, y: top, w, h };
      const footW = Math.min(w, 40);
      const footLeft = Math.round(bx - footW / 2);
      const foot = { x: footLeft, y: by - 18, w: footW, h: 18 };

      // 严格防堆叠：整件视觉矩形与既有家具/墙体保持至少 24px 间距，与已放陈设保持 48px 间距
      if (occupiedVisuals.some(q => rectHit(visual, q, 24))) continue;
      if (placed.some(q => rectHit(visual, q, 48))) continue;

      // 门牌、电梯口、出生点周围留足清爽广场
      if (doors.some(d => Math.hypot(d.x - bx, d.y - by) < 150 ||
        rectHit(visual, { x: d.x - 84, y: d.y - 96, w: 168, h: 128 }, 16))) continue;
      if (portals.some(p => rectHit(visual, p, 96))) continue;
      if (spawns.some(s => Math.hypot(s.x - bx, s.y - by) < 84)) continue;

      const f = {
        id: `f${fid}:clutter:${made}`,
        floorId: fid,
        x: left, y: top, w, h,
        type: spec.type || 'decor',
        label: spec.label || '场景陈设',
        prop: spec.prop || undefined,
        propScale: spec.scale || 2,
        footprint: foot,
        depth: by,
        clutter: true
      };
      f.blocks = [{ x: foot.x, y: foot.y, w: foot.w, h: foot.h }];
      floor.furniture.push(f);
      placed.push(visual);
      made++;
    }
    STATS[fid] = made;
  }

  // ---------- 独立房间：仅在四角对称点缀 2× 比例绿植/边几，绝不随机撒在房间中央 ----------
  const ROOMS = D.ROOMS || {};
  for (const room of Object.values(ROOMS)) {
    const pool = (THEME_CLUTTER[room.floorId] || []).filter(o => (o.prop || o.type) && o.w <= 68 && o.h <= 68);
    if (!pool.length) continue;

    const occupied = room.furniture.map(f => ({ x: f.x, y: f.y, w: f.w, h: f.h }))
      .concat(room.walls.map(w => w.footprint).filter(Boolean));
    const placed = [];
    const entries = [room.entry, room.exit].filter(Boolean);

    // 固定四个室内角落锚点（北左、北右、南左、南右）
    const cornerAnchors = [
      [58, 108, 0],
      [room.width - 58, 108, 0],
      [58, room.height - 48, 1 % pool.length],
      [room.width - 58, room.height - 48, 1 % pool.length]
    ];

    let made = 0;
    for (const [bx, by, idx] of cornerAnchors) {
      const spec = pool[idx];
      const w = spec.w, h = spec.h;
      const left = Math.round(bx - w / 2), top = by - h;
      if (left < 24 || left + w > room.width - 24 || top < 24 || by > room.height - 28) continue;
      if (entries.some(e => Math.hypot(e.x - bx, e.y - by) < 96)) continue;

      const visual = { x: left, y: top, w, h };
      if (occupied.some(q => rectHit(visual, q, 14))) continue;
      if (placed.some(q => rectHit(visual, q, 20))) continue;

      const foot = { x: left + 8, y: by - 16, w: Math.max(16, w - 16), h: 16 };
      const f = {
        id: `${room.id}:clutter:${made}`,
        roomId: room.id,
        floorId: room.floorId,
        x: left, y: top, w, h,
        type: spec.type || 'decor',
        label: spec.label || '角落陈设',
        prop: spec.prop || undefined,
        propScale: spec.scale || 2,
        footprint: foot,
        depth: by,
        clutter: true
      };
      f.blocks = [{ x: foot.x, y: foot.y, w: foot.w, h: foot.h }];
      room.furniture.push(f);
      placed.push(visual);
      made++;
    }
    STATS[`room:${room.id}`] = made;
  }
  return { CLUTTER_STATS: STATS };
});
