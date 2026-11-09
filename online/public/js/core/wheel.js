'use strict';
// 客户端子模块：大转盘配置与服务端同构池（WORLD 提供实现时优先使用服务端版本）。
// 转盘免费、全部为积分槽位；金币时代的花费阶梯与道具槽位已移除。
(function () {
  const SID = window.SID = window.SID || {};
  const WORLD = window.WORLD;
  const WHEEL = WORLD.WHEEL || { slotCount: 10, maxDailySpins: 3, chipAmounts: [1, 2, 3, 4, 5, 6, 8] };
  const WHEEL_CHIP_COLOR = WORLD.WHEEL_CHIP_COLOR || '#F59E0B';
  // 预览用的服务端同构池；落点始终以服务端返回的 slots 为准。
  function buildWheelPool(faction) {
    if (typeof WORLD.buildWheelPool === 'function') return WORLD.buildWheelPool(faction);
    const slots = [];
    for (let i = 0; i < WHEEL.slotCount; i++) {
      const amount = WHEEL.chipAmounts[i % WHEEL.chipAmounts.length];
      slots.push({ kind: 'points', amount, label: `${amount} 积分`, color: WHEEL_CHIP_COLOR, glyph: '●' });
    }
    return slots;
  }
  SID.wheel = { WHEEL, WHEEL_CHIP_COLOR, buildWheelPool };
})();
