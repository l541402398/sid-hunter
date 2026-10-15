'use strict';
// 标记模块：开发管理 section + 重置确认 dialog
// 用 currentScript.insertAdjacentHTML('beforebegin', ...) 在 <script> 所在位置原位注入，
// DOM 位置与顺序与原先直接写在 index.html 里完全一致（含缩进）。
(function () {
  const html = `<section id="dev-management" class="dev-management" hidden aria-labelledby="dev-title"><h2 id="dev-title">开发管理 · 危险操作</h2><p>仅本机开发授权可用。重置会清空本局全部玩家与数据，不会自动加入新局。「添加好人NPC」用于单人自测：NPC 恒为好人、永不离线、计入存活人数，可被探查 / 指认 / 刺探 / 击杀 / 敲锤，但不进匿名坏人线索池，完整 S-ID 只在添加成功的本机提示里出现。</p><button id="dev-npc" class="dev-npc" hidden title="在当前位置旁添加一名好人 NPC，用于单人自测技能与锤戏">添加好人NPC</button><button id="dev-reset" class="dev-reset" hidden aria-haspopup="dialog" aria-controls="reset-confirm">开发重置</button></section>
  <dialog id="reset-confirm" class="reset-confirm" aria-labelledby="reset-title" aria-describedby="reset-impact"><h2 id="reset-title">确认清空本局？</h2><p id="reset-impact">开发重置将清空：</p><ul><li>全部玩家与身份凭证</li><li>公共日志与私密事件</li><li>技能次数、冷却及恢复状态</li><li>探索筹码、私密线索背包与容器已搜状态</li><li>小游戏记录（各 NPC 转盘次数、猜拳待回应与冷却）</li><li>J 互动冷却与眩晕/僵直状态</li><li>分数、全部玩家行为计分与结算排名</li><li>存活的结束条件状态</li></ul><p>所有人返回加入页；只有主动加入才进入新局。此操作无法撤销。</p><div class="reset-actions"><button id="reset-cancel" type="button">取消</button><button id="reset-accept" class="dev-reset" type="button">确认清空全部数据</button></div><p class="hold-note">按 Esc 或切出页面即取消，不发送重置请求。</p></dialog>`;
  const host = document.currentScript;
  if (host) {
    host.insertAdjacentHTML('beforebegin', html);
    host.remove(); // 宿主 <script> 不留痕：兄弟关系与原先直接写 HTML 时完全一致
  }
  else document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('beforeend', html));
})();
