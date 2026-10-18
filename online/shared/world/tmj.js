'use strict';
// TMJ 运行时：把 tiled/floorN.tmj 的碰撞层、出生点和电梯标记变成可查询的共享真源。
// - Node（服务端 / 测试）：启动时从仓库 tiled/ 目录同步读取 7 层；SID_TMJ=1 时启用权威碰撞。
// - 浏览器：不读磁盘；由 js/render/tmj-debug.js fetch 对应 TMJ 后调用 install()。
// 默认关闭：TMJ.enable(false) 时 floors.js 完全走旧的家具矩形碰撞，旧行为零改动。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, { TMJ: api });
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const maps = Object.create(null);
  let enabled = false;
  let diskLoaded = false;

  function propOf(obj, name) {
    const p = (obj && obj.properties || []).find(q => q.name === name);
    return p ? p.value : undefined;
  }
  function layerOf(json, name) {
    return (json.layers || []).find(l => l.name === name && l.type === 'tilelayer') || null;
  }
  function grid(layer, size) {
    const data = (layer && Array.isArray(layer.data)) ? layer.data : [];
    const out = new Uint8Array(size);
    // 保留 gid：collision/ground 用 0/1，decor/objects 用 3/4（预览需要区分）。
    for (let i = 0; i < size && i < data.length; i++) out[i] = data[i] || 0;
    return out;
  }
  // 解析一份 TMJ（对象或已经 JSON.parse 的文本）→ 运行时 map。不依赖 TMJ.load，避免多一份加载路径。
  function parse(json) {
    const doc = typeof json === 'string' ? JSON.parse(json) : json;
    const w = Number(doc.width) || 0, h = Number(doc.height) || 0;
    const tileWidth = Number(doc.tilewidth) || 16, tileHeight = Number(doc.tileheight) || 16;
    if (!w || !h) throw new Error('TMJ: width/height missing');
    const size = w * h;
    const objs = ((doc.layers || []).find(l => l.name === 'markers' && l.type === 'objectgroup') || {}).objects || [];
    const spawn = objs.find(o => o.name === 'spawn') || null;
    const lifts = objs.filter(o => String(o.name || '').indexOf('lift-') === 0).map(o => ({
      side: propOf(o, 'side'),
      targetFloor: Number(propOf(o, 'targetFloor')),
      targetSpawn: propOf(o, 'targetSpawn'),
      x: o.x / tileWidth, y: o.y / tileHeight,
      w: (o.width || 0) / tileWidth, h: (o.height || 0) / tileHeight,
    }));
    // 真实 footprint：props 层的 x/y/w/h 直接是 TMJ 设计 px，不做整格量化。
    const propObjs = ((doc.layers || []).find(l => l.name === 'props' && l.type === 'objectgroup') || {}).objects || [];
    const props = propObjs.map(o => ({
      name: o.name || '', kind: propOf(o, 'kind') || '', label: propOf(o, 'label') || '', role: propOf(o, 'role') || '',
      prop: propOf(o, 'prop') || '', propScale: Number(propOf(o, 'propScale')) || 1,
      solid: propOf(o, 'solid') !== false, landmark: !!propOf(o, 'landmark'),
      x: o.x, y: o.y, w: o.width || 0, h: o.height || 0,
    }));
    const zoneObjs = ((doc.layers || []).find(l => l.name === 'zones' && l.type === 'objectgroup') || {}).objects || [];
    const zones = zoneObjs.map(o => ({
      name: o.name || '', style: propOf(o, 'style') || '', landmark: !!propOf(o, 'landmark'),
      x: o.x, y: o.y, w: o.width || 0, h: o.height || 0,
    }));
    return {
      floorId: 0, width: w, height: h, tileWidth, tileHeight,
      collision: grid(layerOf(doc, 'collision'), size),
      ground: grid(layerOf(doc, 'ground'), size),
      decor: grid(layerOf(doc, 'decor'), size),
      objects: grid(layerOf(doc, 'objects'), size),
      spawn: spawn ? { x: spawn.x / tileWidth, y: spawn.y / tileHeight } : null,
      lifts, props, zones,
      theme: propOf(doc, 'theme') || '',
      source: propOf(doc, 'source') || '',
      palette: String(propOf(doc, 'palette') || '').split(',').filter(Boolean),
      _spawnCells: null, _spawnScale: 0,
      _portals: null, _portalScale: 0, _halls: null,
    };
  }
  function install(floorId, json) {
    const m = parse(json);
    m.floorId = Number(floorId);
    maps[m.floorId] = m;
    return m;
  }
  function get(floorId) { return maps[Number(floorId)] || null; }
  function count() { return Object.keys(maps).length; }
  function enable(value) {
    enabled = !!value && count() > 0;
    return enabled;
  }
  function isEnabled() { return enabled; }
  // 某层是否真的走 TMJ 碰撞：开关打开且该层地图已载入；缺图时回退旧碰撞，绝不把整层封死。
  function active(floorId) {
    if (!enabled) return false;
    if (floorId === undefined || floorId === null) return count() > 0;
    return !!maps[Number(floorId)];
  }
  function tileSize(floorId, scale = 1) {
    const m = maps[Number(floorId)];
    return m ? m.tileWidth * scale : 0;
  }
  // 电梯厅在楼板外：旧世界是 144×96 world（=72×48 design px）的外挂带。
  // 这里不把厅写进 tile 层，只按 lift 对象生成虚拟厅；玩家仍可走进，楼外其它位置保持实心。
  function hallOf(m, lift) {
    const hallW = 72, hallH = 48;
    // lift 存的是格数；这里先换算回 TMJ 设计 px，再生成外挂电梯厅。
    const lx = lift.x * m.tileWidth, ly = lift.y * m.tileHeight;
    const lw = (lift.w || 0) * m.tileWidth, lh = (lift.h || 0) * m.tileHeight;
    const cx = lx + lw / 2, cy = ly + lh / 2;
    const x = lift.side === 'left' ? -hallW : m.width * m.tileWidth;
    return { id: `f${m.floorId}:hall:${lift.side}`, side: lift.side, x, y: cy - hallH / 2, w: hallW, h: hallH, entryY: cy };
  }
  function hallsOf(m) {
    if (!m._halls) m._halls = m.lifts.map(l => hallOf(m, l));
    return m._halls;
  }
  function inHallAt(m, dx, dy) {
    return hallsOf(m).some(h => dx >= h.x && dx <= h.x + h.w && dy >= h.y && dy <= h.y + h.h);
  }
  function inside(floorId, wx, wy, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m) return false;
    const ts = m.tileWidth * scale;
    if (wx >= 0 && wy >= 0 && wx < m.width * ts && wy < m.height * ts) return true;
    return inHallAt(m, wx / scale, wy / scale);
  }
  function cellAt(floorId, wx, wy, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m) return null;
    const ts = m.tileWidth * scale;
    const tx = Math.floor(wx / ts), ty = Math.floor(wy / ts);
    if (tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return null;
    return { x: tx, y: ty, index: ty * m.width + tx };
  }
  function solidAt(floorId, wx, wy, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m) return true;
    const dx = wx / scale, dy = wy / scale;
    // 家具/门框真实 footprint 优先：它们可以跨格、可以落在楼板外（电梯门框）。
    for (const p of m.props) {
      if (!p.solid) continue;
      if (dx >= p.x && dx < p.x + p.w && dy >= p.y && dy < p.y + p.h) return true;
    }
    // 虚拟电梯厅：tile 层没有它，但玩家要能站进去。
    if (inHallAt(m, dx, dy)) return false;
    const c = cellAt(floorId, wx, wy, scale);
    return !c || m.collision[c.index] !== 0;
  }
  function cellFlag(floorId, layer, tx, ty) {
    const m = maps[Number(floorId)];
    if (!m || tx < 0 || ty < 0 || tx >= m.width || ty >= m.height) return 0;
    const g = m[layer];
    return g ? g[ty * m.width + tx] : 0;
  }
  // 出生点：整层所有可走格中心，按到 TMJ spawn 的距离排序。多人按 id 轮转取，不会卡在墙里。
  function spawnCells(floorId, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m) return [];
    if (m._spawnCells && m._spawnScale === scale) return m._spawnCells;
    const ts = m.tileWidth * scale;
    const sx = m.spawn ? m.spawn.x : m.width / 2, sy = m.spawn ? m.spawn.y : m.height / 2;
    const cells = [];
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
      if (solidAt(floorId, (x + 0.5) * ts, (y + 0.5) * ts, scale)) continue;
      cells.push({ x: (x + 0.5) * ts, y: (y + 0.5) * ts, tx: x, ty: y });
    }
    cells.sort((a, b) => Math.hypot(a.tx + 0.5 - sx, a.ty + 0.5 - sy) - Math.hypot(b.tx + 0.5 - sx, b.ty + 0.5 - sy) || a.ty - b.ty || a.tx - b.tx);
    m._spawnCells = cells;
    m._spawnScale = scale;
    return cells;
  }
  // 电梯：lift 对象坐标就是 floorPortal() 的原坐标（TMJ 设计 px），不再算中心/吸附。
  // 同时给出一个包住门口的虚拟电梯厅，供 inHall/portalAccess 使用。
  function portals(floorId, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m) return [];
    if (m._portals && m._portalScale === scale) return m._portals;
    const ts = m.tileWidth * scale;
    const out = m.lifts.map(l => {
      const x = l.x * ts, y = l.y * ts, w = (l.w || 0) * ts, h = (l.h || 0) * ts;
      const hall = hallOf(m, l);
      return {
        id: `f${m.floorId}:portal:${l.side}`, floorId: m.floorId, side: l.side,
        x, y, w, h,
        targetFloor: l.targetFloor, targetSpawn: l.targetSpawn,
        hall: {
          id: hall.id, side: hall.side, x: hall.x * scale, y: hall.y * scale,
          w: hall.w * scale, h: hall.h * scale, entryY: hall.entryY * scale,
          approach: { x: (l.side === 'left' ? 28 : m.width * m.tileWidth - 28) * scale, y: hall.entryY * scale },
        },
      };
    });
    m._portals = out;
    m._portalScale = scale;
    return out;
  }
  function spawnPoint(floorId, scale = 1) {
    const m = maps[Number(floorId)];
    if (!m || !m.spawn) return null;
    const ts = m.tileWidth * scale;
    return { x: m.spawn.x * ts, y: m.spawn.y * ts };
  }
  function stats(floorId) {
    const m = maps[Number(floorId)];
    if (!m) return null;
    let solid = 0;
    for (let i = 0; i < m.collision.length; i++) if (m.collision[i]) solid++;
    const solidProps = m.props.filter(p => p.solid).length;
    return { floorId: m.floorId, width: m.width, height: m.height, tileWidth: m.tileWidth, tileHeight: m.tileHeight,
      theme: m.theme, source: m.source, palette: m.palette.slice(), solid, solidProps,
      props: m.props.length, zones: m.zones.length, walkable: m.collision.length - solid };
  }
  // Node 同步装载：仅服务端 / 单测使用。浏览器没有 require/__dirname，会安全跳过。
  function loadFromDisk(dir) {
    if (typeof require !== 'function' || typeof __dirname === 'undefined') return 0;
    let loaded = 0;
    try {
      const fs = require('node:fs'), path = require('node:path');
      const base = dir || path.resolve(__dirname, '..', '..', '..', 'tiled');
      for (let id = 1; id <= 7; id++) {
        const file = path.join(base, `floor${id}.tmj`);
        if (!fs.existsSync(file)) continue;
        install(id, fs.readFileSync(file, 'utf8'));
        loaded++;
      }
      diskLoaded = loaded > 0;
    } catch (e) {
      // 缺少 tiled/ 或 JSON 损坏时保持关闭，游戏回退旧碰撞；不要因为调试数据阻断正式服务。
      diskLoaded = false;
    }
    return loaded;
  }

  const TMJ = {
    parse, install, get, count, enable, isEnabled, active,
    tileSize, inside, cellAt, solidAt, cellFlag, spawnCells, spawnPoint, portals, stats,
    loadFromDisk,
    get diskLoaded() { return diskLoaded; },
    get enabled() { return enabled; },
  };
  // 服务端自动装载。SID_TMJ=1 才打开权威碰撞；否则数据只用于 F1 调试层对比。
  if (typeof process !== 'undefined' && process.env) {
    TMJ.loadFromDisk();
    if (process.env.SID_TMJ === '1') TMJ.enable(true);
  }
  return TMJ;
});
