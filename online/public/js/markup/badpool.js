'use strict';
// 标记模块：匿名坏人线索池 section
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<section class="bad-section" aria-label="匿名坏人线索">
    <button id="bad-toggle" class="bad-toggle" type="button" aria-expanded="false" aria-controls="bad-slots"><span>匿名坏人线索 <small>身份不公开</small></span><span id="bad-toggle-label">展开＋</span></button>
    <div id="bad-slots" class="bad-slots" hidden></div>
    <p class="bad-note">仅展示已公开的隐藏属性；匿名编号不对应玩家顺序，不提供身份或选人链接。</p>
  </section>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove(); // 宿主 <script> 不留痕：兄弟关系与原先直接写 HTML 时完全一致
  }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
