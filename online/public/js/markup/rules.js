'use strict';
// 游戏规则展示；保留现有 dialog ID、关闭按钮与快捷键绑定，对齐《年会对抗游戏业务方案》。
(function () {
  const html = `<dialog id="rules-view" class="rules-view" aria-labelledby="rules-title">
    <header class="rules-head">
      <div>
        <span class="eyebrow">SID HUNTER · 累计积分对抗赛</span>
        <h2 id="rules-title">年会对抗游戏 · 核心规则与计分手册</h2>
      </div>
      <button id="rules-close" type="button">返回游戏 <kbd>Esc</kbd></button>
    </header>
    <div class="rules-body">
      <section class="rules-training-entry" aria-label="新手训练室">
        <div><h3>先到训练室走一圈</h3><p>独立练习角色，7 步掌握基础操作。可跳过、随时再进入；正式角色留在原地图正常参与对局。</p></div>
        <button id="tutorial-entry" type="button" aria-haspopup="dialog" aria-controls="tutorial-offer">进入新手训练室 →</button>
      </section>
      <section class="rule-section">
        <span class="rule-number">01 / 活动赛制与对抗生命</span>
        <h3>两大阵营博弈 · 积分为唯一成绩</h3>
        <p>本次年会对抗赛最终按累计总积分排名发放奖励。每场入场独立随机分配为<strong>调查员（好人）</strong>或<strong>潜伏者（坏人）</strong>。<strong id="rules-initial-hp">每场入场时获得对抗生命</strong>，通过名牌与角色档案的血条公开展示；阵营与技能仅本人可见。被对方阵营有效命中扣 1 格，归零后进入<strong>休战状态</strong>，已得积分全部保留，仍可继续参加非对抗玩法。探索、福利与渠道额度按场次重置。</p>
        <div class="mini-flow"><span>每场独立开局</span><b>→</b><span>按累计总积分排名</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">02 / 阵营专属技能（各 1 次 · 冷却恢复）</span>
        <h3>调查员「指认」与潜伏者「刺杀」</h3>
        <div class="rule-skill-grid">
          <article>
            <span class="rule-badge">调查员（好人） · 指认</span>
            <h4>指认 <small>命中坏人 +10 分 · 对方扣 1 格生命</small></h4>
            <p><strong>目标为潜伏者（坏人）</strong>：对方扣 1 格对抗生命，你获得 <strong>+10 对抗分</strong>。</p>
            <p><strong>目标为调查员（好人）</strong>：误指认，<strong>你自己扣 1 格对抗生命</strong>，不加分，也不获得受击保护。</p>
            <p>技能 1 次，<span id="rules-good-recovery">使用后进入冷却</span>。</p>
          </article>
          <article>
            <span class="rule-badge bad">潜伏者（坏人） · 刺杀</span>
            <h4>刺杀 <small>命中好人 +3 分 · 对方扣 1 格生命</small></h4>
            <p><strong>目标为调查员（好人）</strong>：对方扣 1 格对抗生命，你获得 <strong>+3 对抗分</strong>。</p>
            <p><strong>目标为潜伏者（坏人）</strong>：双方生命不变，0 分，正常消耗本次机会并进入冷却。</p>
            <p>技能 1 次，<span id="rules-bad-recovery">使用后进入冷却</span>。</p>
          </article>
        </div>
        <p>无效操作（选自己、目标休战中、目标受击保护中、本场已对该目标有效操作过）<strong>不扣生命、不加分、不消耗次数、不进入冷却</strong>。<span id="rules-hit-protection">受击保护期间，角色周围显示统一保护罩。</span>保护不区分阵营，误指认自损及 J 互动不触发保护。同一目标每场只能被你有效操作 1 次，新场重新计算。</p>
        <div class="mini-flow"><span>系统线索锁定嫌疑</span><b>→</b><span>指认 / 刺杀扣 1 格生命</span><b>→</b><span>生命归零进入休战</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">03 / 外观与隐藏属性体系</span>
        <h3>4 项公开外观颜色 + 3 项隐藏个人属性</h3>
        <div class="rule-avatar-grid">
          <svg class="rules-avatar" viewBox="0 0 64 72" aria-hidden="true">
            <rect x="8" y="6" width="48" height="60" rx="8" fill="#eef2ff" stroke="#c7d2fe"/>
            <rect x="22" y="14" width="20" height="10" rx="3" fill="#4a5fe8"/>
            <rect x="20" y="24" width="24" height="14" rx="4" fill="#ffe0b2"/>
            <rect x="18" y="38" width="28" height="14" rx="4" fill="#1ba7e0"/>
            <rect x="20" y="52" width="10" height="8" rx="2" fill="#0fa974"/>
            <rect x="34" y="52" width="10" height="8" rx="2" fill="#0fa974"/>
          </svg>
          <div>
            <div class="rule-color-grid">
              <div><i style="background:#4a5fe8"></i>发色<strong>入场默认公开</strong></div>
              <div><i style="background:#1ba7e0"></i>上衣颜色<strong>入场默认公开</strong></div>
              <div><i style="background:#0fa974"></i>裤子颜色<strong>入场默认公开</strong></div>
              <div><i style="background:#ff9e2c"></i>鞋颜色<strong>入场默认公开</strong></div>
            </div>
            <p>每名玩家拥有 4 项外观颜色（默认公开）与 3 项隐藏属性（<strong>口头禅 / 爱吃的食物 / 喜欢的运动</strong>，初始对外显示为 <code>***</code>），可通过玩家名单搜索任意已公开词条快速锁定嫌疑对象。</p>
            <div class="mini-flow"><span>核对系统坏人线索</span><b>→</b><span>名单检索匹配属性</span><b>→</b><span>锁定嫌疑目标</span></div>
          </div>
        </div>
      </section>

      <section class="rule-section">
        <span class="rule-number">04 / 系统线索与探索转盘</span>
        <h3>定时坏人线索广播 · 7 层办公楼翻找与幸运大转盘</h3>
        <div class="rule-split">
          <div class="rule-note formal">
            <h4>系统定时公布坏人线索</h4>
            <p>系统<span id="rules-clue-interval">定时</span>从<strong>当前对抗中的潜伏者（坏人）</strong>中抽取并公布真实属性线索。点击顶部【线索】查看已公布的属性。</p>
          </div>
          <div class="rule-note playtest">
            <h4>容器翻找与 NPC 大转盘</h4>
            <p>在 1F–7F 靠近文件柜、储物箱或独立房间容器按 <kbd>K</kbd> 探索：可能为空、直接获得积分，或触发答题（答对得分）。每个容器每场只能探索 1 次。本场探索满 <strong>5 / 10 / 15 / 20 / 25</strong> 个容器，可在任意楼层 NPC 处<strong>免费领取</strong>对应福利（积分礼包、公开/隐藏属性、隐藏坏人线索等，每类每场 1 次）。NPC 大转盘每场 <strong>3 次全部免费</strong>，抽取随机积分。</p>
          </div>
        </div>
        <div class="mini-flow"><span>靠近容器/房间按K</span><b>→</b><span>开箱得积分或答题</span><b>→</b><span>按探索数领福利 · 免费转盘</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">05 / 每场积分构成（三大类积分）</span>
        <h3>统一积分累计；休战仅停止对战时长分与对抗分</h3>
        <div class="rule-flow" aria-label="三大积分来源">
          <div><small>参与分（各渠道按场次计）</small><strong>探索 · 答题 · J · 小游戏 · NPC · 转盘 · 献花</strong><em>休战后照常可得</em></div>
          <b>+</b>
          <div><small>对战时长分（自动结算）</small><strong>对抗中每满 30 分钟 +1 分</strong><em>休战后停止</em></div>
          <b>+</b>
          <div><small>对抗分（核心拉开差距）</small><strong>指认 +10 / 刺杀 +3</strong><em>休战后停止</em></div>
        </div>
        <div class="rule-note"><h4>✊ 猜拳切磋互动</h4><p>靠近其他玩家（含休战玩家）点击角色或按 K 打开公开档案，即可发起 10 秒同步猜拳（截止前可改，支持数字键 1/2/3）。赢一局 <strong>+2 分</strong>，平局或猜错均<strong>不扣分</strong>；本场猜拳积分上限为 <strong>10 分</strong>（满 10 分后仍可继续游玩，胜出记 +0 分）。为鼓励大家与不同同事互动，本场与同一位玩家最多完成 <strong>2 次</strong>有效对局；拒绝、主动取消或超时未完成均不计入次数。</p></div>
        <div class="rule-note"><h4>🌷 向收花人献花</h4><p>在玩家名单或地图打开带「收花人」标识的个人档案，点击「为 TA 献花」。同一对象每场限送一次，不能送给自己；每次献花 <strong>+2 分</strong>，发送者每场最多 <strong>10 分</strong>，满额后仍可给其他人献花。接收者每收到 <strong>5 朵鲜花 +1 分，无上限</strong>，仅展示本场鲜花总数。收花人也可向其他收花人献花；离线、休战仍可收花，休战也可献花。</p></div>
        <div class="mini-flow"><span>多渠道参与得分</span><b>→</b><span>对抗中每30分钟+1分</span><b>→</b><span>阵营对抗冲击高分</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">06 / 休战状态</span>
        <h3>对抗生命归零进入休战 · 仍可探索与趣味玩法</h3>
        <p>对抗生命扣到 0 时立即进入<strong>休战</strong>，角色以幽灵形态显示，本场不再参与对抗，也不会自动复活。<strong>已得积分完整保留</strong>；只停止对战时长分与指认/刺杀，仍可正常移动、进入房间、探索、答题、J 互动、小游戏、领取 NPC 福利与转盘积分，各项每场额度沿用休战前的记录。</p>
        <div class="mini-flow"><span>进入休战</span><b>→</b><span>本场已得积分保留</span><b>→</b><span>休战继续非对抗玩法</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">07 / 排行榜</span>
        <h3>实时累计积分榜</h3>
        <p>【排行榜】实时展示所有玩家的累计积分。总分包含所有已结算场次的积分和本场实时得分。点击右上角【总分】可查看自己的积分明细。</p>
      </section>

      <section class="rule-section pending-rule">
        <span class="rule-number">08 / 每场结束条件与场务说明</span>
        <h3>每场结束后统一结算 · 按分数排名</h3>
        <p>每场在<strong>到达本场结束时间</strong>或管理员手动结算时结束。坏人全部休战或对抗中人数减少时，本场照常进行。</p>
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
