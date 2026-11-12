'use strict';
// 标记模块：大转盘与对局结算覆盖层（位于 #map-view 内）
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<div id="wheel-overlay" class="wheel-overlay" hidden role="dialog" aria-modal="true" aria-labelledby="wheel-title" aria-describedby="wheel-cost"><div class="wheel-card"><div class="panel-heading"><button id="wheel-back" class="icon-button" type="button" aria-label="返回 NPC 面板" title="返回 NPC 面板"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m13 5-7 7 7 7M6 12h13" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="wheel-heading-copy"><small>LUCKY WHEEL</small><h2 id="wheel-title">幸运大转盘</h2></div><button id="wheel-close" class="icon-button" type="button" aria-label="关闭大转盘">×</button></div><div class="wheel-stage"><canvas id="wheel-canvas" width="400" height="400" role="img" aria-label="8 格积分转盘"></canvas><button id="wheel-spin" type="button" aria-label="点击中央机关抽奖" title="点击中央 GO 抽奖"></button></div><div class="wheel-caption"><div class="wheel-caption-meta"><p id="wheel-cost" class="panel-note"></p><span class="wheel-free-label">免费抽奖</span></div><div class="wheel-result-slot"><p id="wheel-result" class="private-result" aria-live="polite" hidden></p></div></div></div></div>
<div id="finish-overlay" class="finish-overlay" hidden role="dialog" aria-modal="true" aria-label="对局结算"><div class="finish-card"><div class="panel-heading"><div><small>MATCH RESULT</small><h2>游戏已结束</h2></div><button id="finish-close" class="icon-button" aria-label="关闭结算">×</button></div><p id="finish-reason" class="search-state"></p><div id="finish-ranking" class="ranking-items"></div><p class="hold-note">结果由服务端权威结算 · 关闭后可点「排行榜」随时查看。</p></div></div>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove(); // 宿主 <script> 不留痕：兄弟关系与原先直接写 HTML 时完全一致
  }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
