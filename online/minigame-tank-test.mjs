'use strict';
// 坦克对决（小游戏 v1）服务端自测：开关、开局条件、回合结算、胜负与成就点、超时补招。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom } = require('./room.js');

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`PASS ${name}`); }
  else { failed++; console.error(`FAIL ${name}${detail ? ' → ' + detail : ''}`); }
}
function fixture() {
  const r = createRoom();
  r.join('s1', '甲'); r.join('s2', '乙');
  return r;
}

// 1) 开关未开时必须拒绝
{
  const r = fixture();
  const foe = r.room.players[1];
  const res = r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  check('坦克未开放时拒绝开局', res.ok === false && /尚未开放/.test(res.error), JSON.stringify(res));
}
// 2) 开放后可以开局，且对手必须在同层
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  foe.floorId = 3;
  const res = r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  check('跨层不能开局', res.ok === false, JSON.stringify(res));
}
// 3) 正常开局 + 回合结算：开火 vs 装填 → 对手掉甲
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  const start = r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  check('开局成功且双方 3 甲', start.ok && start.match.self.hp === 3 && start.match.foe.hp === 3);
  r.actMinigame('s1', { action: 'fire' });
  r.actMinigame('s2', { action: 'load' });
  const st = r.minigameState('s1').match;
  check('开火命中装填：对手 -1 甲、自己 -1 弹药', st.foe.hp === 2 && st.self.ammo === 0, JSON.stringify(st));
}
// 4) 无弹药不能开火
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  r.actMinigame('s1', { action: 'fire' }); r.actMinigame('s2', { action: 'load' });
  const res = r.actMinigame('s1', { action: 'fire' });
  check('没有弹药时开火被拒', res.ok === false && /装填/.test(res.error), JSON.stringify(res));
}
// 5) 闪避躲开开火
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  r.actMinigame('s1', { action: 'fire' });
  r.actMinigame('s2', { action: 'dodge' });
  const st = r.minigameState('s1').match;
  check('闪避成功：对手不掉甲', st.foe.hp === 3, JSON.stringify(st));
}
// 6) 打满三发 → 一方胜、双方记成就点、胜者额外加点
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  for (let i = 0; i < 3; i++) {
    r.room.players[1].exploration.chips = 5;
    r.actMinigame('s1', { action: 'fire' });
    r.actMinigame('s2', { action: 'load' });
    if (i < 2) { r.actMinigame('s1', { action: 'load' }); r.actMinigame('s2', { action: 'load' }); }
  }
  const st = r.minigameState('s1').match;
  const a = r.room.players[0], b = r.room.players[1];
  check('三发命中后对局结束且甲获胜', st.finished === true && st.winnerId === a.id, JSON.stringify(st));
  check('双方都拿到"完成小游戏"成就点', (a.achievements.byKind.minigame || 0) === 8 && (b.achievements.byKind.minigame || 0) === 8,
    JSON.stringify([a.achievements, b.achievements]));
  check('胜者额外拿到"小游戏胜利"成就点', (a.achievements.byKind.minigameWin || 0) === 20 && !b.achievements.byKind.minigameWin,
    JSON.stringify([a.achievements.byKind, b.achievements.byKind]));
}
// 7) 超时自动补招，不会卡死
{
  const r = fixture();
  r.room.features.tank = true;
  const foe = r.room.players[1];
  r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  r.actMinigame('s1', { action: 'load' });
  r.room.clockOffset += 25000;
  r.step(0.05);
  const st = r.minigameState('s1').match;
  check('超时按装填补招并进入下一回合', st.round >= 2 && st.picked === false, JSON.stringify(st));
}
// 8) 同一玩家不能同时开两局
{
  const r = fixture();
  r.room.features.tank = true;
  r.join('s3', '丙');
  const foe = r.room.players[1], third = r.room.players[2];
  r.startMinigame('s1', { game: 'tank', opponentId: foe.id });
  const res = r.startMinigame('s1', { game: 'tank', opponentId: third.id });
  check('已在局中不能再开', res.ok === false && /别的对局/.test(res.error), JSON.stringify(res));
}

console.log(`\n坦克小游戏自测：${passed} 通过 / ${failed} 失败`);
process.exitCode = failed ? 1 : 0;
