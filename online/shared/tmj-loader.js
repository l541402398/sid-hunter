'use strict';
// 旧版独立 TMJ 加载器（保留给外部小工具；游戏运行时用 online/shared/world/tmj.js）。
// 浏览器：<script src="/shared/tmj-loader.js"> 后 const m = await TMJ.load('/tiled/floor1.tmj')
// Node：  const { parse } = require('./online/shared/tmj-loader.js')
// 坐标口径：本文件按 TMJ 设计 px（1 格 = tileWidth）；世界 px 请乘 FLOOR_SCALE。
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMJ = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  function parse(json) {
    const map = typeof json === 'string' ? JSON.parse(json) : json;
    const layers = {};
    for (const l of map.layers || []) {
      if (l.type === 'tilelayer') layers[l.name] = l;
      if (l.type === 'objectgroup') layers[l.name] = l;
    }
    const w = map.width, h = map.height, tw = map.tilewidth, th = map.tileheight;
    const collision = layers.collision ? layers.collision.data : [];
    const propObjs = (layers.props && layers.props.objects) || [];
    const prop = (o, n) => {
      const p = (o.properties || []).find((q) => q.name === n);
      return p ? p.value : undefined;
    };
    const props = propObjs.map((o) => ({
      name: o.name || '', kind: prop(o, 'kind') || '', solid: prop(o, 'solid') !== false,
      x: o.x, y: o.y, w: o.width || 0, h: o.height || 0,
    }));
    const objects = (layers.markers && layers.markers.objects) || [];
    const lifts = objects.filter((o) => o.name.indexOf('lift-') === 0).map((o) => ({
      side: prop(o, 'side'),
      targetFloor: Number(prop(o, 'targetFloor')),
      x: o.x / tw, y: o.y / th, w: (o.width || 0) / tw, h: (o.height || 0) / th,
    }));
    const halls = lifts.map((l) => ({
      side: l.side, x: l.side === 'left' ? -72 : w * tw,
      y: (l.y + l.h / 2) * th - 24, w: 72, h: 48,
    }));
    const spawn = objects.find((o) => o.name === 'spawn');
    const solidAt = (tx, ty) => {
      if (tx < 0 || ty < 0 || tx >= w || ty >= h) return true;
      return !!collision[ty * w + tx];
    };
    const solidAtWorld = (x, y) => {
      if (props.some((p) => p.solid && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + p.h)) return true;
      if (halls.some((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h)) return false;
      return solidAt(Math.floor(x / tw), Math.floor(y / th));
    };
    return {
      width: w, height: h, tileWidth: tw, tileHeight: th,
      layers, lifts, props, halls,
      spawn: spawn ? { x: spawn.x / tw, y: spawn.y / th } : null,
      theme: prop(map, 'theme') || '',
      palette: (prop(map, 'palette') || '').split(',').filter(Boolean),
      solidAt, solidAtWorld,
    };
  }
  async function load(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('TMJ load failed: ' + res.status);
    return parse(await res.json());
  }
  return { parse, load };
});
