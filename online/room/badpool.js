'use strict';
// room 子模块：匿名坏人线索池（自带状态与缓存，通过注入的 room 读取玩家）。
const WORLD = require('../shared/world.js');

function createBadPool({ room, randomInt, randomUUID }) {
    // ================= dev 分支并入：匿名坏人线索池 =================
    // 匿名坑位与玩家 id、名单顺序、镜头视角无关；标签是随机编号，不是加入顺序号。
    // 独立系统公布记录，绝不读取 traitPublic 或人物公开投影作为线索来源。
    const map = new Map(), order = [], labels = new Set();
    let dirty = true, cache = Object.freeze([]);
    function register(p) {
      if (p.faction !== 'bad' || map.has(p.id)) return;
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
        if (!p || p.faction !== 'bad') return [];
        // 没有系统记录就不下发真实值；外观在地图公开也不能自动进入此面板。
        const published = p.systemClues || {};
        const onlyPublished = (names, values) => Object.freeze(Object.fromEntries(Object.keys(names)
          .filter(k => Object.hasOwn(values || {}, k) && typeof values[k] === 'string')
          .map(k => [k, values[k]])));
        const systemClues = Object.freeze({
          colors: onlyPublished(WORLD.FIELD_NAMES, published.colors),
          traits: onlyPublished(WORLD.TRAIT_NAMES, published.traits)
        });
        return [Object.freeze({ key: slot.key, label: slot.label, alive: p.alive, systemClues })];
      }));
      dirty = false;
      return cache;
    }
  // 仅供服务端系统公布流程调用；不暴露玩家可调用接口，不触发探查/公开档案。
  // 值从服务端真实档案读取，调用方不能提交任意字符串作为真实线索。
  function publish(playerId, group, field) {
    const p = room.players.find(p => p.id === playerId);
    const names = group === 'colors' ? WORLD.FIELD_NAMES : group === 'traits' ? WORLD.TRAIT_NAMES : null;
    if (!p || p.faction !== 'bad' || !names || !Object.hasOwn(names, field)) return { ok: false, error: '系统线索目标或字段无效' };
    const value = group === 'colors' ? p.colors?.[field]?.[0] : p.traits?.[field];
    if (typeof value !== 'string') return { ok: false, error: '系统线索值无效' };
    p.systemClues = p.systemClues || { colors: {}, traits: {} };
    p.systemClues[group] = p.systemClues[group] || {};
    if (Object.hasOwn(p.systemClues[group], field)) return { ok: true, published: false };
    p.systemClues[group][field] = value;
    register(p); dirty = true;
    return { ok: true, published: true };
  }
  function candidates() {
    const pool = [];
    for (const p of room.players) {
      if (!p.alive || p.faction !== 'bad') continue;
      for (const [group, names] of [['colors', WORLD.FIELD_NAMES], ['traits', WORLD.TRAIT_NAMES]]) {
        for (const field of Object.keys(names)) {
          if (Object.hasOwn(p.systemClues?.[group] || {}, field)) continue;
          const value = group === 'colors' ? p.colors?.[field]?.[0] : p.traits?.[field];
          if (typeof value === 'string') pool.push({ playerId: p.id, group, field });
        }
      }
    }
    return pool;
  }
  function preview(config) {
    const aliveBad = room.players.filter(p => p.alive && p.faction === 'bad').length;
    const requested = aliveBad ? Math.min(config.clueMax, Math.max(config.clueMin, Math.ceil(aliveBad * config.cluePercent / 100))) : 0;
    const remaining = candidates().length;
    return { aliveBad, requested, remaining, count: Math.min(requested, remaining) };
  }
  function publishBatch(count) {
    const pool = candidates(), picked = [], used = new Set();
    const n = Math.min(Math.max(0, Math.floor(count)), pool.length);
    while (picked.length < n) {
      // 先抽本轮尚未选过的人；全部候选人轮到后才允许重复，每条字段不放回。
      let eligible = pool.filter(c => !used.has(c.playerId));
      if (!eligible.length) { used.clear(); eligible = pool; }
      const choice = eligible[randomInt(0, eligible.length)];
      pool.splice(pool.indexOf(choice), 1);
      if (publish(choice.playerId, choice.group, choice.field).published) {
        picked.push(choice); used.add(choice.playerId);
      }
    }
    return picked;
  }
  function publicationMessages(picked) {
    const slots = list();
    return picked.flatMap(c => {
      const p = room.players.find(p => p.id === c.playerId);
      const slot = map.get(c.playerId), index = slots.findIndex(s => s.key === slot?.key);
      const fieldName = (c.group === 'colors' ? WORLD.FIELD_NAMES : WORLD.TRAIT_NAMES)[c.field];
      const value = p?.systemClues?.[c.group]?.[c.field];
      if (index < 0 || typeof value !== 'string') return [];
      return [`系统公布：坏人${String(index + 1).padStart(2, '0')}的${fieldName}为「${value}」。`];
    });
  }
  function invalidate() { dirty = true; }
  function reset() { map.clear(); order.length = 0; labels.clear(); cache = Object.freeze([]); dirty = true; }
  return { register, list, publish, candidates, preview, publishBatch, publicationMessages, invalidate, reset };
}

module.exports = { createBadPool };
