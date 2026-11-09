'use strict';
// 游戏规则展示；保留现有 dialog ID、关闭按钮与快捷键绑定，对齐《年会对抗游戏业务方案》。
(function () {
  const html = `<dialog id="rules-view" class="rules-view" aria-labelledby="rules-title" aria-describedby="rules-live">
    <header class="rules-head">
      <div>
        <span class="eyebrow">SID HUNTER · 五日累计积分对抗赛</span>
        <h2 id="rules-title">年会对抗游戏 · 核心规则与计分手册</h2>
        <p id="rules-live">阅读规则时游戏仍在继续 · 连续 5 天每日独立开局 · 按累计总积分排名获奖</p>
      </div>
      <button id="rules-close" type="button">返回游戏 <kbd>Esc</kbd></button>
    </header>
    <div class="rules-body">
      <section class="rule-section">
        <span class="rule-number">01 / 活动赛制与对抗生命</span>
        <h3>两大阵营博弈 · 3 格对抗生命 · 积分为唯一成绩</h3>
        <p>本次年会对抗赛连续举办 <strong>5 天</strong>（每天 1 场独立对局），最终按 5 天累计总积分排名发放奖励。入场随机分配为<strong>调查员（好人）</strong>或<strong>潜伏者（坏人）</strong>。每人每天拥有 <strong>3 格对抗生命</strong>（仅本人可见），被对方阵营有效命中扣 1 格，归零后进入<strong>休战状态</strong>，已得积分全部保留，仍可继续参加非对抗玩法。</p>
        <div class="mini-flow"><span>每日独立开局</span><b>→</b><span>3 格对抗生命</span><b>→</b><span>5天累计积分排名</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">02 / 阵营专属技能（各 1 次 · 冷却恢复）</span>
        <h3>调查员「指认」与潜伏者「刺杀」</h3>
        <div class="rule-skill-grid">
          <article>
            <span class="rule-badge">调查员（好人） · 指认</span>
            <h4>指认 <small>命中坏人 +10 分 · 对方扣 1 格生命</small></h4>
            <p><strong>目标为潜伏者（坏人）</strong>：对方扣 1 格对抗生命并进入受击保护，你获得 <strong>+10 对抗分</strong>。</p>
            <p><strong>目标为调查员（好人）</strong>：误指认，<strong>你自己扣 1 格对抗生命</strong>，不加分，也不获得受击保护。</p>
            <p>技能 1 次，使用后约 <strong>30 分钟</strong>冷却恢复（建议值，以场务配置为准）。</p>
          </article>
          <article>
            <span class="rule-badge bad">潜伏者（坏人） · 刺杀</span>
            <h4>刺杀 <small>命中好人 +3 分 · 对方扣 1 格生命</small></h4>
            <p><strong>目标为调查员（好人）</strong>：对方扣 1 格对抗生命并进入受击保护，你获得 <strong>+3 对抗分</strong>。</p>
            <p><strong>目标为潜伏者（坏人）</strong>：双方生命不变，0 分，正常消耗本次机会并进入冷却。</p>
            <p>技能 1 次，使用后约 <strong>20 分钟</strong>冷却恢复（建议值，以场务配置为准）。</p>
          </article>
        </div>
        <p>无效操作（选自己、目标休战中、目标受击保护中、当天已对该目标有效操作过）<strong>不扣生命、不加分、不消耗次数、不进入冷却</strong>。被有效命中后获得约 <strong>5 分钟受击保护</strong>；同一目标每天只能被你有效操作 1 次。最后一击只发本次正常分值，没有额外击杀奖励。</p>
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
            <p>系统每隔固定周期自动从<strong>当前对抗中的潜伏者（坏人）</strong>中抽取并公布真实属性线索，汇总在右侧【坏人线索】面板，不点名具体玩家。</p>
          </div>
          <div class="rule-note playtest">
            <h4>容器翻找与 NPC 大转盘</h4>
            <p>在 1F–7F 靠近文件柜、储物箱或独立房间容器按 <kbd>K</kbd> 探索：可能为空、直接获得积分，或触发答题（答对得分）。每个容器每天只能探索 1 次。当天探索满 <strong>5 / 10 / 15 / 20 / 25</strong> 个容器，可在任意楼层 NPC 处<strong>免费领取</strong>对应福利（积分礼包、公开/隐藏属性、隐藏坏人线索等，每类每天 1 次）。NPC 大转盘每天 <strong>3 次全部免费</strong>，抽取随机积分。</p>
          </div>
        </div>
        <div class="mini-flow"><span>靠近容器/房间按K</span><b>→</b><span>开箱得积分或答题</span><b>→</b><span>按探索数领福利 · 免费转盘</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">05 / 每日积分构成（三大类积分）</span>
        <h3>统一积分累计；休战仅停止对抗时长分与对抗分</h3>
        <div class="rule-flow" aria-label="三大积分来源">
          <div><small>参与分（各渠道独立日额度）</small><strong>探索 · 答题 · J · 小游戏 · NPC · 转盘</strong><em>休战后照常可得</em></div>
          <b>+</b>
          <div><small>对抗时长分（自动结算）</small><strong>对抗中每满 30 分钟 +1 分</strong><em>休战后停止</em></div>
          <b>+</b>
          <div><small>对抗分（核心拉开差距）</small><strong>指认 +10 / 刺杀 +3</strong><em>休战后停止</em></div>
        </div>
        <p>已取消金币与首次搜索/首次小游戏加分，所有收益统一为积分。探索直接积分或答题答对得分；J 互动命中在线真人随机得分（同一目标每天最多 2 分、每天最多 10 分）；猜拳等小游戏获胜得分（每天共享上限）；NPC 积分礼包与免费转盘；对抗中每满 30 分钟 +1；正确指认 +10、正确刺杀 +3。具体分值为建议值，以活动公告为准。</p>
        <div class="mini-flow"><span>多渠道参与得分</span><b>→</b><span>对抗中每30分钟+1分</span><b>→</b><span>阵营对抗冲击高分</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">06 / 休战状态</span>
        <h3>对抗生命归零进入休战 · 仍可探索与趣味玩法</h3>
        <p>对抗生命扣到 0 时立即进入<strong>休战</strong>，当天不再参与对抗，也不会自动复活。<strong>已得积分完整保留</strong>；只停止对抗时长分与指认/刺杀，仍可正常移动、进入房间、探索、答题、J 互动、小游戏、领取 NPC 福利与转盘积分，各项每日额度沿用休战前的记录。休战玩家以轻度半透明与「休战」标记显示，碰撞与房间进入条件与对抗中玩家相同。</p>
        <div class="mini-flow"><span>进入休战</span><b>→</b><span>今日已得积分保留</span><b>→</b><span>休战继续非对抗玩法</span></div>
      </section>

      <section class="rule-section">
        <span class="rule-number">07 / 排行榜与防泄密机制</span>
        <h3>局内仅展示本人今日明细与截至昨日累计总榜（Top 100）</h3>
        <p>为防止通过实时涨分反推谁是好人或坏人，<strong>当日对局进行中排行榜不展示其他玩家的今日实时积分</strong>。局内打开【积分与总榜】仅展示<strong>你自己的今日积分明细（总分 / 参与分 / 对抗时长分 / 对抗分）</strong>以及<strong>截至昨日的累计总积分排行榜（前 100 名）</strong>；每日活动结束后统一结算并并入累计总榜。</p>
        <div class="mini-flow"><span>局内隐藏他人今日分</span><b>→</b><span>仅看本人今日明细</span><b>→</b><span>展示昨日累计Top100</span></div>
      </section>

      <section class="rule-section pending-rule">
        <span class="rule-number">08 / 每日结束条件与场务说明</span>
        <h3>每日按活动结束时间统一结算 · 按分数排名</h3>
        <p>正式活动每日仅在<strong>到达本场结束时间</strong>（或管理员手动结算）时结束本场；坏人全部休战或对抗中人数减少不会提前终止当日活动（专项测试场可由管理员配置“对抗中人数降至指定人数 / 坏人全部休战 / 时间到”等提前结束条件，以现场主持公告为准）。</p>
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
