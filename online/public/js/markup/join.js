'use strict';
// 标记模块：加入页与复制提示
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<div id="join-page" class="join-overlay" hidden>
    <form id="join-form" class="join-panel">
      <div class="join-badge-row">
        <span class="eyebrow">SID HUNTER · ANNUAL TOURNAMENT</span>
        <span class="join-tag">5天累计积分赛</span>
      </div>
      <h2>进入年会大厦现场</h2>
      <p id="join-hint">昵称可留空（系统将随机分配代号）。全员凭三段身份码（S-ID）展开阵营推理博弈，累计总分前 100 名获奖。</p>
      <div class="join-feature-strip" aria-hidden="true">
        <span><b>调查员</b> · 调查属性 / 指认</span>
        <span><b>潜伏者</b> · 公开身份码 / 击杀</span>
        <span><b>参与即得分</b> · 首搜+5 / 首游+5</span>
      </div>
      <input id="nickname" maxlength="8" placeholder="输入代号昵称（可留空随机）" autocomplete="off" spellcheck="false">
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
