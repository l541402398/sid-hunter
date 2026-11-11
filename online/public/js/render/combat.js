'use strict';
// 对抗状态的纯绘制层：只读公开生命/保护状态，不读取阵营或改变角色配色。
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SID = root.SID || {}; root.SID.combatVisuals = api; }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  // 以 V4 脚底为原点的阶梯轮廓。路径固定，仅透明度缓慢呼吸；无逐帧滤镜/渐变/几何缓存。
  const SHIELD = Object.freeze([
    -14,-84, 14,-84, 14,-82, 23,-82, 23,-77, 29,-77, 29,-66,
    32,-66, 32,-12, 29,-12, 29,-3, 22,-3, 22,3, 12,3, 12,5,
    -12,5, -12,3, -22,3, -22,-3, -29,-3, -29,-12, -32,-12,
    -32,-66, -29,-66, -29,-77, -23,-77, -23,-82, -14,-82
  ]);
  function shieldPath(g, x, y, scale) {
    g.beginPath();
    g.moveTo(x + SHIELD[0] * scale, y + SHIELD[1] * scale);
    for (let i = 2; i < SHIELD.length; i += 2)
      g.lineTo(x + SHIELD[i] * scale, y + SHIELD[i + 1] * scale);
    g.closePath();
  }
  // clock 为秒；bodyHeight=77 对应 V4，旧逐块人物传 53，脚底锚点保持不变。
  function drawShield(g, p, clock, bodyHeight = 77) {
    if (!p || !p.protected || p.alive === false || p.truce || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const x = Math.round(p.x) + .5, y = Math.round(p.y) + .5;
    const scale = Math.max(35, Math.min(120, Number(bodyHeight) || 77)) / 77;
    const breath = .72 + .1 * Math.sin((Number(clock) || 0) * 2.1);
    const visibility = p.online === false ? .65 : 1;
    g.save();
    const alpha = g.globalAlpha * visibility;
    shieldPath(g, x, y, scale);
    // 极淡内衬保留发色与衣服的辨识度，外沿用暗金托住暖金亮线。
    g.globalAlpha = alpha * .025; g.fillStyle = '#a9e6df'; g.fill();
    g.globalAlpha = alpha * .28; g.strokeStyle = '#473923'; g.lineWidth = 4; g.stroke();
    g.globalAlpha = alpha * breath; g.strokeStyle = '#d8b778'; g.lineWidth = 2; g.stroke();
    g.globalAlpha = alpha * (.28 + .08 * breath); g.strokeStyle = '#a1e0dc'; g.lineWidth = 1; g.stroke();
    // 上沿微光与脚边短亮线，不在人物面部或衣服中间绘制高亮。
    g.globalAlpha = alpha * breath; g.fillStyle = '#f1d598';
    g.fillRect(Math.round(x - 10 * scale), Math.round(y - 85 * scale), Math.max(2, Math.round(7 * scale)), 1);
    g.fillRect(Math.round(x + 21 * scale), Math.round(y - 77 * scale), 1, Math.max(2, Math.round(5 * scale)));
    g.fillRect(Math.round(x - 11 * scale), Math.round(y + 4 * scale), Math.max(2, Math.round(5 * scale)), 1);
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
  return { drawShield, drawHealthBar };
});
