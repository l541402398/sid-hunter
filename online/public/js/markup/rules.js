'use strict';
// 规则说明弹窗；保留现有 dialog ID、动态字段 ID、关闭按钮与快捷键绑定。
(function () {
  const html = `<dialog id="rules-view" class="rules-view" aria-labelledby="rules-title">
    <header class="rules-head">
      <div class="rules-head-copy">
        <span class="eyebrow">STUDY GUIDE · 研学积分手册</span>
        <h2 id="rules-title">学习探索指南 · 规则与积分手册</h2>
      </div>
      <button id="rules-close" type="button">关闭 <kbd>Esc</kbd></button>
    </header>
    <div class="rules-body">
      <section class="rules-training-entry" aria-label="新手训练室">
        <div>
          <div class="training-title-row"><h3>先到新手训练室走一圈</h3><span class="training-kicker">8 步实操</span></div>
          <p>用独立练习号体验移动、探索答题、线索排查与技能用法；随时可退，不影响你在正式场次中的角色与成绩。</p>
        </div>
        <button id="tutorial-entry" class="btn-sun" type="button" aria-haspopup="dialog" aria-controls="tutorial-offer">进入新手训练室 →</button>
      </section>

      <nav class="rules-toc" aria-label="规则目录">
        <button type="button" data-rule-jump="rule-sec-overview">01 基本规则</button>
        <button type="button" data-rule-jump="rule-sec-skills">02 身份与技能</button>
        <button type="button" data-rule-jump="rule-sec-clues">03 特征与线索</button>
        <button type="button" data-rule-jump="rule-sec-scoring">04 积分全览</button>
        <button type="button" data-rule-jump="rule-sec-truce">05 休战与结算</button>
      </nav>

      <section id="rule-sec-overview" class="rule-section">
        <div class="rule-sec-head">
          <span class="rule-num">01</span>
          <div>
            <h3>基本规则与核心目标</h3>
            <p class="rule-sub">每场独立开局，各场次得分自动累加，最终按累计总分排名。</p>
          </div>
        </div>
        <div class="rule-kpi-grid">
          <article class="rule-kpi accent-sun">
            <span class="kpi-tag">最终成绩</span>
            <h4>累计总分决定最终排名</h4>
            <p>通过探索答题、日常互动和阵营技能均可赚取积分；所有场次自动累加，按总榜排名。</p>
          </article>
          <article class="rule-kpi accent-mint">
            <span class="kpi-tag">身份分配</span>
            <h4>每场独立随机分配阵营</h4>
            <p>入场随机成为<strong>调查员（好人）</strong>或<strong>潜伏者（坏人）</strong>；<strong>阵营与技能仅本人可见</strong>，点右上角【我的信息】随时查看。</p>
          </article>
          <article class="rule-kpi accent-coral">
            <span class="kpi-tag">生命与休战</span>
            <h4 id="rules-initial-hp">每场入场时获得对抗生命</h4>
            <p>所有人的<strong>血条公开展示</strong>在名牌和档案中；被对方阵营技能命中扣 1 格，归零后进入<strong>休战</strong>，已得积分全部保留。</p>
          </article>
        </div>
        <p class="rule-footnote">每开新场时，身份、生命值、探索进度、NPC 福利与各项得分上限都会重置，历史累计总分继续保留。</p>
      </section>

      <section id="rule-sec-skills" class="rule-section">
        <div class="rule-sec-head">
          <span class="rule-num">02</span>
          <div>
            <h3>阵营技能与受击保护</h3>
            <p class="rule-sub">两个阵营各有 1 项专属技能：点击地图角色或【玩家名单】打开对方档案即可使用，用完等待冷却恢复。</p>
          </div>
        </div>
        <div class="rule-skill-grid">
          <article class="skill-card is-good">
            <div class="skill-card-head">
              <span class="rule-badge">调查员（好人）</span>
              <strong class="skill-score">+10 分</strong>
            </div>
            <h4>指认 <small>找出并指认潜伏者</small></h4>
            <ul class="rule-list">
              <li><strong>指认到潜伏者（坏人）</strong>：对方扣 1 格生命，你获得 <strong>+10 分</strong>。</li>
              <li><strong>误指了调查员（好人）</strong>：<strong>自己扣 1 格生命</strong>、不得分，且不会获得受击保护。</li>
              <li><strong>次数与恢复</strong>：最多存 1 次，<span id="rules-good-recovery">使用后进入冷却</span>。</li>
            </ul>
          </article>
          <article class="skill-card is-bad">
            <div class="skill-card-head">
              <span class="rule-badge bad">潜伏者（坏人）</span>
              <strong class="skill-score bad">+3 分</strong>
            </div>
            <h4>刺杀 <small>隐蔽行动，削减调查员生命</small></h4>
            <ul class="rule-list">
              <li><strong>刺杀到调查员（好人）</strong>：对方扣 1 格生命，你获得 <strong>+3 分</strong>。</li>
              <li><strong>误刺了潜伏者（坏人）</strong>：双方都不扣生命、不得分，但会用掉这次机会并进入冷却。</li>
              <li><strong>次数与恢复</strong>：最多存 1 次，<span id="rules-bad-recovery">使用后进入冷却</span>。</li>
            </ul>
          </article>
        </div>
        <div class="rule-callout-grid">
          <div class="rule-callout-item">
            <strong>🛡️ 受击保护罩</strong>
            <p><span id="rules-hit-protection">受击保护期间，角色周围显示统一保护罩。</span>保护期内不会再被技能命中；保护罩不暴露阵营，误指认自己扣血或被按 <kbd>J</kbd> 敲击不会触发保护。</p>
          </div>
          <div class="rule-callout-item">
            <strong>🎯 同目标每场限 1 次</strong>
            <p>本场内，你对同一名同事最多只能使用 <strong>1 次</strong>技能（无论结果对错），开新场后重新计算。</p>
          </div>
          <div class="rule-callout-item">
            <strong>↺ 无法执行不扣次</strong>
            <p>若点到自己、对方已休战、正处于保护罩中，或本场已对其用过技能，操作会被拦截——<strong>不扣生命、不耗次数，也不进入冷却</strong>。</p>
          </div>
        </div>
      </section>

      <section id="rule-sec-clues" class="rule-section">
        <div class="rule-sec-head">
          <span class="rule-num">03</span>
          <div>
            <h3>角色特征与线索排查</h3>
            <p class="rule-sub">结合公开外观、隐藏属性和系统定时线索，一步步锁定潜伏者。</p>
          </div>
        </div>
        <div class="rule-clue-grid">
          <article class="rule-card">
            <h4>角色档案构成</h4>
            <div class="rule-avatar-row">
              <svg class="rules-avatar" viewBox="0 0 64 74" aria-hidden="true">
                <rect x="6" y="5" width="52" height="64" rx="6" fill="#f9f0dc" stroke="#c49f68" stroke-width="1.5"/>
                <rect x="21" y="13" width="22" height="10" rx="3" fill="#4a5fe8"/>
                <rect x="19" y="23" width="26" height="14" rx="4" fill="#f3cfa0"/>
                <rect x="17" y="37" width="30" height="15" rx="4" fill="#1b6a94"/>
                <rect x="19" y="52" width="11" height="8" rx="2" fill="#197841"/>
                <rect x="34" y="52" width="11" height="8" rx="2" fill="#197841"/>
                <rect x="18" y="60" width="12" height="5" rx="1.5" fill="#d97706"/>
                <rect x="34" y="60" width="12" height="5" rx="1.5" fill="#d97706"/>
              </svg>
              <div class="rule-traits-wrap">
                <div class="rule-mini-label">4 项外观颜色（入场即公开）</div>
                <div class="rule-color-grid">
                  <div><i style="background:#4a5fe8"></i>发色</div>
                  <div><i style="background:#1b6a94"></i>上衣颜色</div>
                  <div><i style="background:#197841"></i>裤子颜色</div>
                  <div><i style="background:#d97706"></i>鞋颜色</div>
                </div>
                <div class="rule-mini-label">3 项隐藏属性（初始显示 <code>***</code>）</div>
                <div class="rule-pill-row">
                  <span>口头禅</span><span>爱吃的食物</span><span>喜欢的运动</span>
                </div>
                <p class="rule-card-tip">打开【玩家名单】输入颜色或已公开的属性关键词，可快速筛出对应同事。</p>
              </div>
            </div>
          </article>
          <article class="rule-card">
            <h4>三步排查线索</h4>
            <ol class="rule-steps">
              <li>
                <strong>看系统线索</strong>
                <p>系统<span id="rules-clue-interval">定时</span>随机公布一条仍在场潜伏者（坏人）的真实特征（外观或隐藏属性），点顶部<strong>【线索】</strong>即可查看。</p>
              </li>
              <li>
                <strong>去名单搜索</strong>
                <p>点开<strong>【玩家名单】</strong>，输入线索里的颜色或属性关键词，马上能缩小嫌疑范围。</p>
              </li>
              <li>
                <strong>领 NPC 情报福利</strong>
                <p>探索楼层容器达到指定数量后，可在 NPC 处免费使用能力：公开他人隐藏属性、隐藏自己的已公开属性，或撤下坏人线索卡上的 1 条线索。</p>
              </li>
            </ol>
          </article>
        </div>
      </section>

      <section id="rule-sec-scoring" class="rule-section">
        <div class="rule-sec-head">
          <span class="rule-num">04</span>
          <div>
            <h3>积分获取全览</h3>
            <p class="rule-sub">积分来自以下三大渠道；即使进入休战，日常学习与互动分依然可以照常拿。</p>
          </div>
        </div>
        <div class="rule-tiers" aria-label="三大积分来源">
          <article class="tier-card">
            <div class="tier-head"><strong>学习与互动分</strong><span class="tier-status keep">休战照常可得</span></div>
            <p>探索、知识答题、NPC 福利、大转盘、敲击、猜拳、献花。</p>
          </article>
          <article class="tier-card">
            <div class="tier-head"><strong>在场时长分</strong><span class="tier-status pause">休战后停止</span></div>
            <p>未休战期间，每满 <strong>30 分钟自动 +1 分</strong>。</p>
          </article>
          <article class="tier-card">
            <div class="tier-head"><strong>阵营技能分</strong><span class="tier-status pause">休战后停止</span></div>
            <p>调查员指认正确 <strong>+10 分</strong>；潜伏者刺杀正确 <strong>+3 分</strong>。</p>
          </article>
        </div>

        <h4 class="rule-group-title">日常学习与互动得分明细（每场独立计算上限）</h4>
        <div class="rule-channel-grid">
          <article class="channel-card">
            <div class="channel-head">
              <h5>📦 1F–7F 容器探索与答题</h5>
              <span class="channel-cap">直接 +1 / 答题 +2</span>
            </div>
            <p>在 1F–7F 靠近文件柜、储物箱或房间内物品按 <kbd>K</kbd> 探索（每处每场限 1 次）：可能为空、直接得 <strong>1 分</strong>，或弹出知识问答（答对得 <strong>2 分</strong>）。</p>
          </article>
          <article class="channel-card">
            <div class="channel-head">
              <h5>🎁 NPC 探索阶梯福利</h5>
              <span class="channel-cap">5/10/15/20/25 档</span>
            </div>
            <p>本场累计探索满 <strong>5 / 10 / 15 / 20 / 25</strong> 个容器，可在任意楼层 NPC 处<strong>免费领取</strong>对应档位福利（满 5 个直接领 <strong>+10 分礼包</strong>，后续档位解锁公开/隐藏属性或撤下线索，每档每场 1 次）。</p>
          </article>
          <article class="channel-card">
            <div class="channel-head">
              <h5>🎡 NPC 幸运大转盘</h5>
              <span class="channel-cap">每场 3 次免费</span>
            </div>
            <p>找任意楼层 NPC 即可免费抽奖，随机得 <strong>2 / 4 / 6 / 8 分</strong>；所有楼层共享次数，每场共 <strong>3 次免费</strong>。</p>
          </article>
          <article class="channel-card">
            <div class="channel-head">
              <h5>🔨 按 J 敲击互动</h5>
              <span class="channel-cap">同人 2 分 · 上限 10 分</span>
            </div>
            <p>靠近其他在线同事按 <kbd>J</kbd> 轻敲互动（纯趣味动作，不扣生命也不触发保护），敲中时有概率随机得 <strong>+1 分</strong>；同一人每场最多得 2 分，本场上限 10 分。</p>
          </article>
          <article class="channel-card">
            <div class="channel-head">
              <h5>✊ 猜拳切磋</h5>
              <span class="channel-cap">赢 +2 · 上限 10 分</span>
            </div>
            <p>靠近任意同事（休战也可）点开档案即可发起猜拳（10 秒内出拳，支持按 <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>）：赢一局 <strong>+2 分</strong>，平局或落败不扣分。本场与同一人最多计 <strong>2 局</strong>（拒绝、取消或超时不算），拿满 10 分后仍可继续切磋（不再加分）。</p>
          </article>
          <article class="channel-card">
            <div class="channel-head">
              <h5>🌷 向收花人献花</h5>
              <span class="channel-cap">送花上限 10 · 收花无上限</span>
            </div>
            <p>点开带「收花人」标识的同事档案，点击「为 TA 献花」（不能送自己，同一人每场限送 1 次）。<strong>送花方</strong>每次 +2 分，本场最多得 10 分（满额后仍可送给其他人）；<strong>收花方</strong>每累计 5 朵 +1 分、不设上限，仅显示本场总朵数。离线或休战均可收花，休战也可送花。</p>
          </article>
        </div>
      </section>

      <section id="rule-sec-truce" class="rule-section">
        <div class="rule-sec-head">
          <span class="rule-num">05</span>
          <div>
            <h3>休战状态、排行榜与结算</h3>
            <p class="rule-sub">生命归零不会出局，已得积分全部保留，照样可以继续学习与互动赚分。</p>
          </div>
        </div>
        <article class="rule-truce-card">
          <h4>🛡️ 休战状态说明</h4>
          <p>生命值降为 0 时会立即进入<strong>休战</strong>，角色变为幽灵外观；本场内不会自动复活，也不能再使用或成为指认/刺杀目标。</p>
          <div class="truce-split">
            <div class="truce-col is-keep">
              <strong>✓ 休战后完整保留与继续</strong>
              <p>已得积分全部保留；仍可自由移动、进房间、探索容器、知识答题、按 <kbd>J</kbd> 敲击、猜拳、领 NPC 福利、免费转盘和献花，各项上限接着休战前的进度算。</p>
            </div>
            <div class="truce-col is-stop">
              <strong>✕ 休战后仅暂停两项</strong>
              <p>仅停止「在场时长分」自动累计，以及「指认 / 刺杀」阵营技能与对应得分。</p>
            </div>
          </div>
        </article>
        <div class="rule-split rule-footer-grid">
          <article class="rule-card">
            <h4>🏆 实时排行榜与个人明细</h4>
            <p>点击顶部<strong>【排行榜】</strong>可随时查看全员累计总分（历史已结算场次 + 本场实时得分）；点击右上角<strong>【总分】</strong>可查看自己本场每一项的得分明细与上限进度。</p>
          </article>
          <article class="rule-card">
            <h4>⏱️ 场次结束与统一结算</h4>
            <p>每场只会在<strong>到达本场结束时间</strong>（或管理员手动结束）时统一结算，并按累计总分排名。<strong>中途不会因为所有潜伏者都休战、或场上剩余活跃人数变少而提前结束</strong>，大家可继续探索、答题和互动，直到本场时间结束。</p>
          </article>
        </div>
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
  document.addEventListener('click', e => {
    const btn = e.target?.closest?.('[data-rule-jump]');
    if (!btn) return;
    const target = document.getElementById(btn.dataset.ruleJump);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();
