'use strict';
// 游戏规则展示；保留现有 dialog ID、关闭按钮与快捷键绑定，不改变后台玩法。
(function () {
  const html = `<dialog id="rules-view" class="rules-view" aria-labelledby="rules-title" aria-describedby="rules-live">
    <header class="rules-head">
      <div><span class="eyebrow">S-ID / 年终生存战</span><h2 id="rules-title">游戏规则</h2><p id="rules-live">阅读规则时游戏仍在继续</p></div>
      <button id="rules-close" type="button">返回游戏 <kbd>Esc</kbd></button>
    </header>
    <div class="rules-body">
      <section class="rule-section">
        <span class="rule-number">01 / 游戏介绍</span>
        <h3>保护好自己，活到最后</h3>
        <p>欢迎进入年终生存战，这里每个人都随机分配了一个虚拟形象和一段秘密 SID（幸存者 id），人群中潜伏着专门猎杀 SID 的坏人——SID Hunter！他们有特殊的能力，可以公开你的部分 SID，一旦你的 SID 被完全公开，SID Hunter 就能将你淘汰。除了你自己，不要相信任何人，保护好自己，用自己的技能找出坏人，活到最后吧。</p>
      </section>
      <section class="rule-section">
        <span class="rule-number">02 / 身份 &amp; 技能介绍</span>
        <h3>好人与坏人</h3>
        <div class="rule-skill-grid">
          <article>
            <span class="rule-badge">好人</span>
            <h4>好人技能</h4>
            <p><strong>探查：</strong>公开目标 1 条随机隐藏属性。</p>
            <p><strong>指认：</strong>认定目标是坏人，成功则扣除目标 1 血，失败则公开自己的一段 SID。</p>
          </article>
          <article>
            <span class="rule-badge bad">坏人 · 共 3 滴血</span>
            <h4>坏人技能</h4>
            <p><strong>探查：</strong>公开目标 1 条随机隐藏属性。</p>
            <p><strong>指认：</strong>认定目标是坏人，成功则扣除目标 1 血，失败则公开自己的一段 SID。</p>
            <p><strong>刺探：</strong>公开目标一段 SID。</p>
            <p><strong>击杀：</strong>输入目标完整 SID，立刻淘汰该玩家。</p>
          </article>
        </div>
      </section>
      <section class="rule-section">
        <span class="rule-number">03 / 公共信息</span>
        <h3>利用线索，找出坏人</h3>
        <p>非常重要的线索，每隔一段时间就会公布一些坏人的线索，好好利用它找出坏人。</p>
      </section>
      <section class="rule-section">
        <span class="rule-number">04 / 获胜条件</span>
        <h3>满足任一条件，游戏结束</h3>
        <div class="rule-flow" aria-label="三种游戏结束条件">
          <div><small>条件 1</small><strong>找出所有坏人</strong></div>
          <div><small>条件 2</small><strong>场上只剩 100 人</strong></div>
          <div><small>条件 3</small><strong>游戏时间结束</strong></div>
        </div>
        <p>满足任一以上条件时，游戏结束，按照积分排名。</p>
      </section>
    </div>
  </dialog>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove();
  } else {
    document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
  }
})();
