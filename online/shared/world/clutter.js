'use strict';
// 放大后的场景陈设撒放（按楼层世界观的纯装饰家具）。
//
// 为什么单独一个模块：
//   · 需要 floors.js 的楼面/碰撞，也需要 rooms.js 的房间门点（避免把树摆在门牌上）；
//   · 只在**空隙**里撒，不能挡住主走廊/容器/电梯厅/出生点；
//   · 规则是“确定性网格 + 按权重抽素材”，不是手写几百行坐标。
//
// 输出的是普通 floor.furniture 项（f.prop 指定素材），因此：
//   服务端碰撞、客户端遮挡/深度、房间门口清理等既有逻辑全部复用，不引入第二条渲染路径。
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
  const rand = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const rectHit = (a, b, pad = 0) => a.x < b.x + b.w + pad && a.x + a.w + pad > b.x &&
    a.y < b.y + b.h + pad && a.y + a.h + pad > b.y;
  const pointRect = (px, py) => ({ x: px, y: py, w: 0, h: 0 });

  const STATS = {};
  if (!THEME_CLUTTER) return { CLUTTER_STATS: STATS };

  for (const key of Object.keys(THEME_CLUTTER)) {
    const fid = Number(key);
    const list = THEME_CLUTTER[key];
    const floor = FLOORS[fid];
    if (!floor || !Array.isArray(list) || !list.length) continue;
    const rng = rand(0x5EED + fid * 7919);
    // 已有占位：家具/墙的碰撞足迹。陈设不和它们抢地面（树冠可以叠在桌后，但树根不插进桌子里）。
    const occupied = floor.furniture.map(f => f.footprint).filter(Boolean)
      .concat(floor.walls.map(w => w.footprint).filter(Boolean));
    const doors = roomsForFloor(fid).map(r => r.door);
    const portals = floorPortals(fid);
    const spawns = floorSpawns(fid);
    const placed = [];
    const totalW = list.reduce((s, o) => s + (o.weight || 1), 0);
    const pick = () => {
      let r = rng() * totalW;
      for (const o of list) { r -= (o.weight || 1); if (r <= 0) return o; }
      return list[list.length - 1];
    };
    let made = 0;
    const TARGET = fid === 5 ? 30 : 88;   // 迷宫层通道窄，少撒一点，避免堵路
    const STEP_X = 104, STEP_Y = 92;
    for (let pass = 0; pass < 3 && made < TARGET; pass++) {
      for (let gy = 360; gy < floor.height - 70 && made < TARGET; gy += STEP_Y) {
        for (let gx = 90; gx < floor.width - 90 && made < TARGET; gx += STEP_X) {
          // 抖动只用于让排列不像棋盘；固定种子保证每次构建结果一致。
          const bx = Math.round(gx + (rng() - 0.5) * 52 + pass * 17);
          const by = Math.round(gy + (rng() - 0.5) * 46);
          const spec = pick();
          const w = spec.w, h = spec.h;
          const left = Math.round(bx - w / 2), top = by - h;
          // 必须踩在楼面上（基座 + 基座上方 10px），且不与主走廊/墙带相交。
          if (!inFloor(fid, bx, by) || !inFloor(fid, bx, by - 10)) continue;
          if (by < (fid === 5 ? 90 : 350) || by > floor.height - 30) continue;
          // 视觉矩形（整棵树/霓虹牌）用于避免两件陈设叠在一起；
          // 与既有家具只校验**树干/底座**——树冠叠在桌子后面是正常的景深，不算穿模。
          const visual = { x: left, y: top, w, h };
          const footW = Math.min(w, 64);
          const footLeft = Math.round(bx - footW / 2);
          const base = { x: footLeft, y: by - 22, w: footW, h: 22 };
          if (occupied.some(q => rectHit(base, q, 2))) continue;
          if (placed.some(q => rectHit(visual, q, 8))) continue;
          // 不盖住房间门牌 / 电梯口 / 出生点。门牌净空是"宽 136 + 上方 78"的一块，
          // 只按基座距离判断会让树冠从下方盖住门牌。
          if (doors.some(d => Math.hypot(d.x - bx, d.y - by) < 120 ||
            rectHit(visual, { x: d.x - 68, y: d.y - 78, w: 136, h: 106 }, 6))) continue;
          if (portals.some(p => rectHit(visual, p, 70))) continue;
          if (spawns.some(s => Math.hypot(s.x - bx, s.y - by) < 60)) continue;
          // 基座碰撞条：只有最南沿 16px、树干宽度，允许人从两侧绕过。
          const foot = { x: footLeft, y: by - 24, w: footW, h: 24 };
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
      }
    }
    STATS[fid] = made;
  }

  // ---------- 独立房间：进门镜头会放大到整间屋子，陈设也要按楼层世界观补齐 ----------
  // 房间坐标是 0..w / 0..h 的独立空间；只放小件（大树/大招牌留给楼层），
  // 避开门口落点与房内家具，保证进房不卡人、出门照常。
  const ROOMS = D.ROOMS || {};
  for (const room of Object.values(ROOMS)) {
    const pool = (THEME_CLUTTER[room.floorId] || []).filter(o => (o.prop || o.type) && o.w <= 110 && o.h <= 140);
    if (!pool.length) continue;
    const rng = rand(0xA11CE + room.floorId * 977 + room.id.length * 131);
    const occupied = room.furniture.map(f => f.footprint).filter(Boolean)
      .concat(room.walls.map(w => w.footprint).filter(Boolean));
    const placed = [];
    const totalW = pool.reduce((s, o) => s + (o.weight || 1), 0);
    const pick = () => {
      let r = rng() * totalW;
      for (const o of pool) { r -= (o.weight || 1); if (r <= 0) return o; }
      return pool[pool.length - 1];
    };
    const entries = [room.entry, room.exit].filter(Boolean);
    let made = 0;
    for (let gy = 90; gy < room.height - 70 && made < 7; gy += 86) {
      for (let gx = 60; gx < room.width - 60 && made < 7; gx += 96) {
        const bx = Math.round(gx + (rng() - 0.5) * 40);
        const by = Math.round(gy + (rng() - 0.5) * 36);
        const spec = pick();
        const w = spec.w, h = spec.h;
        const left = Math.round(bx - w / 2), top = by - h;
        if (bx < 46 || bx > room.width - 46 || by < 80 || by > room.height - 54) continue;
        if (entries.some(e => Math.hypot(e.x - bx, e.y - by) < 96)) continue;
        // 门口正中留出通道（南墙门洞），不要用陈设堵住进/出路线。
        if (Math.abs(bx - room.width / 2) < 86 && by > room.height - 150) continue;
        const visual = { x: left, y: top, w, h };
        const base = { x: left, y: by - 22, w, h: 22 };
        if (occupied.some(q => rectHit(base, q, 2))) continue;
        if (placed.some(q => rectHit(visual, q, 8))) continue;
        const foot = { x: left, y: by - 24, w, h: 24 };
        const f = {
          id: `${room.id}:clutter:${made}`,
          roomId: room.id,
          floorId: room.floorId,
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
        room.furniture.push(f);
        placed.push(visual);
        made++;
      }
    }
    STATS[`room:${room.id}`] = made;
  }
  return { CLUTTER_STATS: STATS };
});
