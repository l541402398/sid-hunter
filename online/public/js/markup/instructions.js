'use strict';
// 标记模块：操作与联机说明 details
(function () {
  const html = `<details class="instructions"><summary>操作与联机说明</summary><div><section class="lan-section"><span class="lan-line"><i class="dot blue"></i> 局域网试玩 · 把下面地址发给同事即可加入</span><code id="lan-address">读取中…</code><span class="lan-note">服务端权威：位置、技能结算、公开状态与休战都由服务端计算；配置与启闭统一进入管理员面板。</span></section><p>WASD / 方向键移动；家具足迹与墙体挡路，人物互穿。点击角色或名单查看公开档案；技能任意距离，禁止自选或操作已休战目标。</p><p>地图共七层（1–7F），电梯选层换层。靠近容器 / NPC 按 K 交互。每位玩家对同一容器每日只能开启一次；结果可能为空、直接积分或答题（答对得分）。</p><p><strong>对抗</strong>：好人∶坏人 ≈ 4∶1，双方默认 3 格对抗生命。好人技能「指认」（命中坏人扣其 1 生命并 +10 分；误指认自己扣 1 生命），坏人技能「刺杀」（命中好人扣其 1 生命并 +3 分；刺同阵营无效果）。每人同时最多 1 次机会；好人 CD 30 分钟、坏人 CD 20 分钟（试玩可缩短）。同一操作者每日对同一目标只能有效操作一次；受击后默认 5 分钟保护。公共提示只展示生命变化，不泄露操作者与技能。</p><p><strong>休战</strong>：对抗生命归零后进入休战——停止存活分与对抗技能/得分，仍可探索、答题、J、小游戏、领取 NPC 福利与转盘积分。外观可半透明标识，无穿墙优势。</p><p><strong>积分</strong>：取消独立金币与「首次搜索/首次小游戏」加分。探索/答题/J/小游戏/NPC 礼包/转盘均可产分；积分只累计排名，不用于消费。猜拳胜者得积分（建议值），不再押注。大转盘免费，每日限次（建议 3 次），产出随机积分。</p><p>按 J 挥锤：不扣对抗生命、不触发保护；有效命中后可能随机获得积分（建议渠道日上限）。NPC 福利按每探索 5 个容器解锁一档，免费领取。</p></div></details>`;
  const host = document.currentScript;
  if (host) { host.insertAdjacentHTML('beforebegin', html); host.remove(); }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
