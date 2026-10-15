'use strict';
// 客户端子模块：像素绘制的纯颜色工具（明暗插值与肤色档位）。
(function () {
  const SID = window.SID = window.SID || {};
  const shadeCache = new Map();
  function shade(hex, k) {
    const key = hex + '|' + k;
    let v = shadeCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const t = k > 0 ? 255 : 8, a = Math.min(1, Math.abs(k));
    const ch = c => Math.round(c + (t - c) * a);
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    v = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    shadeCache.set(key, v); return v;
  }

  const SKIN = ['#eabb94', '#d3a58a', '#c08e73', '#e8c3a3', '#cf9d7e'];
  SID.paint = { shade, SKIN };
})();
