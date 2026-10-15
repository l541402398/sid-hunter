'use strict';
// 标记模块：加入页与复制提示
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<div id="join-page" class="join-overlay" hidden>
    <form id="join-form" class="join-panel">
      <span class="eyebrow">LAN PLAYTEST</span>
      <h2>加入办公室</h2>
      <p id="join-hint">昵称可留空，留空由系统分配虚构姓名。第一位加入者是坏人，其后全部是好人。启用 CAS 单点登录后以姓名直接进局。</p>
      <input id="nickname" maxlength="8" placeholder="昵称（可留空）" autocomplete="off" spellcheck="false">
      <button type="submit" id="join-submit">进入办公室</button>
      <small id="join-error"></small>
    </form>
  </div>
<div id="copy-toast" class="copy-toast" hidden role="status" aria-live="polite"></div>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove(); // 宿主 <script> 不留痕：兄弟关系与原先直接写 HTML 时完全一致
  }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
