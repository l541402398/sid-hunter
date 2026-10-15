'use strict';
// 客户端子模块：大转盘配置与服务端同构池（WORLD 提供实现时优先使用服务端版本）。
(function () {
  const SID = window.SID = window.SID || {};
  const WORLD = window.WORLD;
  const WHEEL = WORLD.WHEEL || { slotCount: 10, spinCosts: [0, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56, 64], chipAmounts: [0, 1, 2, 3, 5, 8], specialCount: { good: 2, bad: 2 }, specials: { good: ['clue'], bad: ['reform', 'rebirth'] } };
  const WHEEL_ITEMS = WORLD.WHEEL_ITEMS || {
    clue: { key: 'clue', label: '线索券', desc: '获取一名坏人的一条线索', color: '#3B82F6', glyph: '?' },
    reform: { key: 'reform', label: '洗心革面券', desc: '将自己由坏人转换为好人', color: '#22C55E', glyph: '♻' },
    rebirth: { key: 'rebirth', label: '轮回券', desc: '重新随机自己的身份特征', color: '#EF4444', glyph: '↻' }
  };
  const WHEEL_CHIP_COLOR = WORLD.WHEEL_CHIP_COLOR || '#F59E0B';
  function wheelSpinCost(priorSpins) {
    if (typeof WORLD.wheelSpinCost === 'function') return WORLD.wheelSpinCost(priorSpins);
    const costs = WHEEL.spinCosts, i = Math.max(0, Math.min(costs.length - 1, priorSpins | 0));
    return costs[i];
  }
  // 预览用的服务端同构池；服务端 buildWheelPool 存在时优先使用。落点始终以服务端返回的 slots 为准。
  function buildWheelPool(faction) {
    if (typeof WORLD.buildWheelPool === 'function') return WORLD.buildWheelPool(faction);
    const key = faction === 'bad' ? 'bad' : 'good', slots = [];
    const specials = WHEEL.specials[key] || [], specialCount = WHEEL.specialCount[key] || 0;
    for (let i = 0; i < specialCount; i++) {
      const item = WHEEL_ITEMS[specials[i % specials.length]];
      if (item) slots.push({ kind: 'special', key: item.key, label: item.label, desc: item.desc, color: item.color, glyph: item.glyph });
    }
    for (let ci = 0; slots.length < WHEEL.slotCount; ci++) {
      const amount = WHEEL.chipAmounts[ci % WHEEL.chipAmounts.length];
      slots.push({ kind: 'chips', amount, label: String(amount), color: WHEEL_CHIP_COLOR, glyph: '●' });
    }
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
    return slots;
  }
  SID.wheel = { WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool };
})();
