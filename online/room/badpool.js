'use strict';
// room 子模块：匿名坏人线索池（自带状态与缓存，通过注入的 room 读取玩家）。
const WORLD = require('../shared/world.js');

function createBadPool({ room, randomInt, randomUUID }) {
    // ================= dev 分支并入：匿名坏人线索池 =================
    // 匿名坑位与玩家 id、名单顺序、镜头视角无关；标签是随机编号，不是加入顺序号。
    // 公共线索只展示「已经公开」的隐藏属性，本身不提供身份或选人链接。
    const map = new Map(), order = [], labels = new Set();
    let dirty = true, cache = Object.freeze([]);
    function register(p) {
      if (p.faction !== 'bad' || p.npc || map.has(p.id)) return;
      let label;
      do { label = `坏人${randomInt(1, 1000000)}`; } while (labels.has(label));
      const slot = { key: randomUUID(), label };
      labels.add(label); map.set(p.id, slot);
      order.splice(randomInt(0, order.length + 1), 0, p.id);
      dirty = true;
    }
    function list() {
      if (!dirty) return cache;
      const byId = new Map(room.players.map(p => [p.id, p]));
      for (const p of room.players) register(p);
      cache = Object.freeze(order.flatMap(id => {
        const p = byId.get(id), slot = map.get(id);
        if (!p || p.faction !== 'bad' || p.npc) return [];
        const traits = Object.freeze(Object.fromEntries(Object.keys(WORLD.TRAIT_NAMES)
          .filter(k => p.traitPublic[k]).map(k => [k, p.traits[k]])));
        return [Object.freeze({ key: slot.key, label: slot.label, alive: p.alive, traits })];
      }));
      dirty = false;
      return cache;
    }
  function invalidate() { dirty = true; }
  function reset() { map.clear(); order.length = 0; labels.clear(); cache = Object.freeze([]); dirty = true; }
  return { register, list, invalidate, reset };
}

module.exports = { createBadPool };
