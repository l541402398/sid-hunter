'use strict';
// 游戏规则展示；保留现有 dialog ID、关闭按钮与快捷键绑定，对齐《年会对抗游戏业务方案》。
(function () {
  const html = `<dialog id="rules-view" class="rules-view" aria-labelledby="rules-title" aria-describedby="rules-live">
    <header class="rules-head">
      <div>
        <span class="eyebrow">SID HUNTER · 五日累计积分对抗赛</span>
        <h2 id="rules-title">年会对抗游戏 · 核心规则与计分手册</h2>
        <p id="rules-live">阅读规则时游戏仍在继续 · 连续 5 天每日独立开局 · 累计总分前 100 名获奖</p>
      </div>
      <button id="rules-close" type="button">返回游戏 <kbd>Esc</kbd></button>
    </header>
    <div class="rules-body">
      <section class="rule-section">
        <span class="rule-number">01 / 活动赛制与三段身份码</span>
        <h3>两大阵营博弈 · 三段身份码（S-ID）定胜负</h3>
        <p>本次年会对抗赛连续举办 <strong>5 天</strong>（每天 1 场独立对局，约 1000 人同场），最终按 5 天累计总积分排名前 <strong>100 名</strong> 发放奖励。入场随机分配为<strong>调查员（好人）</strong>或<strong>潜伏者（坏人，约 15%）</strong>。取消传统血量设计，每人拥有唯一三段式身份码（S-ID），初始对外全遮罩，随技能交锋逐段公开：</p>
        <div class="rule-masks" aria-label="S-ID 公开状态示例">
          <div>本人私密完整码<code>A7C-9K2-3M8</code></div>
          <div>初始对外全遮罩<code>***-***-***</code></div>
          <div>被公开 1 段后<code>***-9K2-***</code></div>
          <div>3 段全部公开<code>A7C-9K2-3M8</code></div>
        </div>
        <div class="mini-flow"><span>每日独立开局</span><b>→</b><span>三段身份码博弈</span><b>→</b><span>5天累计前100获奖</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">02 / 阵营专属双技能（各存 2 次 · 周期恢复）</span>
        <h3>调查员（好人）与潜伏者（坏人）专属技能</h3>
        <div class="rule-skill-grid">
          <article>
            <span class="rule-badge">调查员（好人） · 专属 2 技能</span>
            <h4>1. 调查属性 <small>0 分 · 推理排雷</small></h4>
            <p>对任意存活玩家使用，随机公开对方 <strong>1 项未公开的隐藏属性</strong>（口头禅 / 爱吃 / 运动）。若对方 3 项属性已全部公开，系统提示且<strong>不消耗次数</strong>。</p>
            <h4>2. 指认 <small>命中坏人 +10 分 · 满 3 段直接出局</small></h4>
            <p><strong>目标为潜伏者（坏人）</strong>：随机公开对方 <strong>1 段未公开身份码</strong>，并获得 <strong>+10 对抗分</strong>；当坏人第 3 段身份码被公开时<strong>同一事务内立即出局</strong>！</p>
            <p><strong>目标为调查员（好人）</strong>：对方身份码不变，系统随机公开<strong>你自己 1 段未公开身份码</strong>（0 分）；好人三段码全公开不会自动出局。</p>
            <div class="mini-flow"><span>调查属性排雷</span><b>→</b><span>指认坏人公开1段码(+10分)</span><b>→</b><span>满3段坏人立即出局</span></div>
          </article>
          <article>
            <span class="rule-badge bad">潜伏者（坏人） · 专属 2 技能</span>
            <h4>1. 公开身份码 <small>公开好人 +2 分</small></h4>
            <p><strong>目标为调查员（好人）</strong>：随机公开对方 <strong>1 段未公开身份码</strong>，获得 <strong>+2 对抗分</strong>。</p>
            <p><strong>目标为潜伏者（坏人）</strong>：<strong>双方身份码均不变化</strong>，消耗 1 次机会，0 分且不发公开公告（防坏人互刷）。</p>
            <h4>2. 击杀 <small>击杀好人 +5 分 · 无需手输身份码</small></h4>
            <p>仅在查看<strong>三段身份码已全部公开（3/3）</strong>的存活玩家时显示【击杀】按钮；点击确认即直接令目标出局（击杀好人 <strong>+5 分</strong>，击杀坏人 0 分）。</p>
            <div class="mini-flow"><span>公开好人身份码(+2分)</span><b>→</b><span>目标满3段码解锁击杀</span><b>→</b><span>一键击杀好人(+5分)</span></div>
          </article>
        </div>
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
            <p>系统每隔固定周期自动从<strong>当前存活的潜伏者（坏人）</strong>中抽取并公布真实属性线索，汇总在右侧【坏人线索】面板，不点名具体玩家。</p>
          </div>
          <div class="rule-note playtest">
            <h4>容器翻找与 NPC 大转盘</h4>
            <p>在 1F–7F 靠近文件柜、储物箱或独立房间容器按 <kbd>K</kbd> 翻找金币、道具与私密线索；找 NPC 兑换私密线索或转动幸运大转盘赢取高额金币福袋（不改变阵营与身份码）。</p>
          </div>
        </div>
        <div class="mini-flow"><span>靠近容器/房间按K</span><b>→</b><span>翻找金币与私密线索</span><b>→</b><span>NPC兑换或转盘抽奖</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">05 / 每日积分构成（三大类积分）</span>
        <h3>参与分 + 存活分 + 对抗分，出局后积分完整保留</h3>
        <div class="rule-flow" aria-label="三大积分来源">
          <div><small>参与分（每日上限 10 分）</small><strong>首搜 +5 · 首游 +5</strong><em>轻松拿满</em></div>
          <b>+</b>
          <div><small>存活分（自动结算）</small><strong>每满 30 分钟 +1 分</strong><em>按存活时长</em></div>
          <b>+</b>
          <div><small>对抗分（核心拉开差距）</small><strong>指认 +10 / 公开 +2 / 击杀 +5</strong><em>精准博弈</em></div>
        </div>
        <p>每日首次完成容器翻找 <strong>+5 分</strong>、每日首次完成小游戏（猜拳 / 坦克 / 卡牌）<strong>+5 分</strong>；在场存活每满 30 分钟 <strong>+1 分</strong>；好人指认命中坏人 <strong>+10 分/次</strong>，坏人公开好人身份码 <strong>+2 分/次</strong>、击杀好人 <strong>+5 分/次</strong>。其余操作均为 0 分。</p>
        <div class="mini-flow"><span>参与拿保底10分</span><b>→</b><span>存活每30分钟+1分</span><b>→</b><span>阵营对抗冲击高分</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">06 / 出局规则与幽灵状态</span>
        <h3>出局保留今日已得积分 · 化身幽灵继续游览互动</h3>
        <p>当潜伏者（坏人）三段身份码全部公开，或任意玩家被潜伏者发动【击杀】时即判定<strong>出局</strong>。出局后<strong>今日已获得的全部积分完整保留</strong>，不再新增参与分、存活分与对抗分；出局玩家化身半透明幽灵，仍可在 1F–7F 自由移动、按 <kbd>J</kbd> 吓人互动或观战。</p>
        <div class="mini-flow"><span>玩家判定出局</span><b>→</b><span>今日已得积分保留</span><b>→</b><span>化身幽灵观战互动</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">07 / 排行榜与防泄密机制</span>
        <h3>局内仅展示本人今日明细与截至昨日累计总榜（Top 100）</h3>
        <p>为防止通过实时涨分反推谁是好人或坏人，<strong>当日对局进行中排行榜不展示其他玩家的今日实时积分</strong>。局内打开【积分与总榜】仅展示<strong>你自己的今日积分明细（总分 / 参与分 / 存活分 / 对抗分）</strong>以及<strong>截至昨日的累计总积分排行榜（前 100 名）</strong>；每日活动结束后统一结算并并入累计总榜。</p>
        <div class="mini-flow"><span>局内隐藏他人今日分</span><b>→</b><span>仅看本人今日明细</span><b>→</b><span>展示昨日累计Top100</span></div>
      </section>

      <section class="rule-section pending-rule">
        <span class="rule-number">08 / 每日结束条件与场务说明</span>
        <h3>每日按活动结束时间统一结算 · 按分数排名</h3>
        <p>正式活动每日仅在<strong>到达本场结束时间</strong>（或管理员手动结算）时结束本场；坏人出局或场上人数减少不会提前终止当日活动（专项测试场可由管理员配置存活淘汰至剩余 100 人 / 坏人全灭 / 时间到（2 小时）等仅三种特定规则，待补充场务说明以现场主持公告为准）。</p>
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
