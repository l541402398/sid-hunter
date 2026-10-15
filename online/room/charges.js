'use strict';
// room 子模块：技能次数懒结算与资源冻结。纯函数：只读写传入的 player/skill，
// 「本局是否已结束」由调用方以 finished 参数传入（原实现读 createRoom 闭包里的 room.finished）。
  // Lazy settlement: no timer loop. Charges are rebuilt from absolute timestamps every
  // time a skill state is read, so offline time counts exactly like online time.
  // dev 分支并入的资源冻结：淘汰或本局结束后 skillsFrozenAt 落定，之后读多少次都不再恢复。
  function sync(player, t, finished) {
    if (player.skillsFrozenAt != null || !player.alive || finished) return;
    for (const skill of Object.values(player.skills)) {
      if (skill.chargesRemaining >= skill.maxCharges) { skill.nextChargeAt = 0; continue; }
      while (skill.nextChargeAt && t >= skill.nextChargeAt) {
        skill.chargesRemaining = Math.min(skill.maxCharges, skill.chargesRemaining + 1);
        skill.nextChargeAt = skill.chargesRemaining >= skill.maxCharges ? 0 : skill.nextChargeAt + skill.chargeIntervalMs;
      }
      if (skill.chargesRemaining >= skill.maxCharges) skill.nextChargeAt = 0;
    }
  }
  function consume(skill, t) {
    if (skill.chargesRemaining >= skill.maxCharges) skill.nextChargeAt = t + skill.chargeIntervalMs;
    skill.chargesRemaining = Math.max(0, skill.chargesRemaining - 1);
    skill.cooldownUntil = t + skill.cooldownMs;
  }
  // 冻结前先把已经赚到的恢复结算掉，再固定 skillsFrozenAt；重复调用以第一次为准。
  function freeze(player, t, finished) {
    if (!player || player.skillsFrozenAt != null) return;
    sync(player, t, finished);
    player.skillsFrozenAt = t;
  }

module.exports = { sync, consume, freeze };
