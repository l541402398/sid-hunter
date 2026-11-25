'use strict';
// 对抗状态的纯绘制层：只读公开生命/保护状态，不读取阵营或改变角色配色。
(function(root, factory) {
  const api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SID = root.SID || {}; root.SID.combatVisuals = api; }
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  const cocoon = typeof root.Image === 'function' ? new root.Image() : null;
  if (cocoon) cocoon.src = '/assets/fx/protection-cocoon-frames.png';
  const reducedMotion = root.matchMedia?.('(prefers-reduced-motion: reduce)');

  // 图集中包含流光和上浮碎片。脚底锚点靠近茧底，使末端露在名牌上方。
  const frame = { width: 80, height: 100, anchorX: 40, anchorY: 89, count: 16, loopSeconds: 3.2 };
  function drawProtectionCocoon(g, p, clock, bodyHeight = 77) {
    if (!p?.protected || p.alive === false || p.truce || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    if (!cocoon?.complete || !cocoon.naturalWidth) return false;

    const x = Math.round(p.x), y = Math.round(p.y);
    const scale = Math.max(.7, Math.min(1.3, (Number(bodyHeight) || 77) / 77));
    const time = (Number(clock) || 0) + ((Number(p.id) || 0) % 7) * .23;
    const cycle = time / frame.loopSeconds;
    const index = reducedMotion?.matches ? 0 : Math.floor((cycle - Math.floor(cycle)) * frame.count);
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha *= p.online === false ? .57 : .92;
    g.drawImage(cocoon, index * frame.width, 0, frame.width, frame.height,
      x - Math.round(frame.anchorX * scale), y - Math.round(frame.anchorY * scale),
      Math.round(frame.width * scale), Math.round(frame.height * scale));
    g.restore();
    return true;
  }
  // x/y 是左上角；分隔线随可配置生命数绘制，0 生命及休战显示空槽。
  function drawHealthBar(g, state) {
    if (!state || !Number.isFinite(state.x) || !Number.isFinite(state.y) || !Number.isFinite(state.width) || state.width < 4) return false;
    const x = Math.round(state.x), y = Math.round(state.y), width = Math.round(state.width);
    const height = Math.max(5, Math.min(7, Math.round(Number(state.height) || 6)));
    const maxHp = Math.max(1, Math.min(20, Math.floor(Number(state.maxHp) || 3)));
    const hp = state.truce ? 0 : Math.max(0, Math.min(maxHp, Math.floor(Number(state.hp) || 0)));
    const inner = width - 2, bar = height - 2;
    g.save();
    g.fillStyle = '#241d1b'; g.fillRect(x, y, width, height);
    g.fillStyle = state.truce ? '#51494a' : '#554134'; g.fillRect(x + 1, y + 1, inner, bar);
    if (hp) {
      const filled = Math.round(inner * hp / maxHp);
      g.fillStyle = state.protected ? '#8dcac5' : hp / maxHp <= 1 / 3 ? '#cf826e' : '#a7bd78';
      g.fillRect(x + 1, y + 1, filled, bar);
      g.fillStyle = state.protected ? '#d9e7c0' : '#d5d5a1';
      g.fillRect(x + 1, y + 1, filled, 1);
    }
    // 相邻格边界只绘制一次，窄条也保持总宽度，最多20格不会溢出名牌。
    g.fillStyle = '#241d1b';
    for (let i = 1; i < maxHp; i++)
      g.fillRect(x + 1 + Math.round(inner * i / maxHp), y + 1, 1, bar);
    g.restore();
    return true;
  }
  return { drawProtectionCocoon, drawHealthBar };
});
