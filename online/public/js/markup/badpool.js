'use strict';
// 标记模块：匿名坏人线索池 section
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<dialog id="bad-pool-dialog" class="center-dialog bad-pool-dialog" aria-labelledby="bad-pool-title">
    <div class="panel-heading"><div><small>PUBLIC CLUES</small><h2 id="bad-pool-title">匿名坏人线索</h2></div><button id="bad-pool-close" class="icon-button" type="button" aria-label="关闭坏人线索">×</button></div>
    <div id="bad-slots" class="bad-slots" hidden></div>
    <p class="bad-note">仅展示系统公布的外观与隐藏属性；未公布均为 ***，玩家探查不会同步到这里。匿名编号不对应玩家顺序，不提供身份或选人链接。</p>
  </dialog>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove(); // 宿主 <script> 不留痕：兄弟关系与原先直接写 HTML 时完全一致
  }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
