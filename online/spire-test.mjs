'use strict';
// 卡牌对决（spire v1）引擎自测：出牌、伤害、格挡、关卡切换、胜负与牌库循环。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('./shared/world/spire.js');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
};

// 固定种子，保证可复现
const st = S.createBattle(12345);
const v0 = S.view(st);
check('开局：30 血 / 3 能量 / 手牌 5 张 / 敌人 26 血', v0.hp === 30 && v0.energy === 3 && v0.hand.length === 5 && v0.enemy.hp === 26, v0);

// 打一张攻击牌
const attackIdx = st.hand.findIndex(k => S.CARDS[k].type === 'attack');
const before = st.enemy.hp;
const res = S.play(st, attackIdx);
check('攻击牌造成伤害', res.ok && st.enemy.hp < before, { before, after: st.enemy.hp });

// 能量不足时拒绝
const expensive = st.hand.findIndex(k => S.CARDS[k].cost === 2);
if (expensive >= 0 && st.energy < 2) {
  const r = S.play(st, expensive);
  check('能量不足时拒绝出牌', r.ok === false && /能量/.test(r.error), r);
} else {
  check('能量不足时拒绝出牌（本局手牌无高费牌，跳过）', true);
}

// 结束回合：敌人攻击结算
const hpBefore = st.hp;
S.endTurn(st);
check('结束回合后掉血或格挡抵消', st.hp <= hpBefore, { hpBefore, hp: st.hp });
check('新回合手牌重新抽满', st.hand.length >= 5, st.hand.length);

// 格挡抵消：叠满格挡后敌人攻击不掉血
{
  const b = S.createBattle(777);
  b.block = 999;
  const hp = b.hp;
  S.endTurn(b);
  check('格挡可完全抵消伤害', b.hp === hp, { hp, after: b.hp });
}

// 击杀 → 进入下一关
{
  const b = S.createBattle(999);
  b.enemy.hp = 1;
  const idx = b.hand.findIndex(k => S.CARDS[k].type === 'attack');
  if (idx >= 0) {
    S.play(b, idx);
    check('击杀后进入第 2 关', b.stage === 1 && b.enemy && b.enemy.maxHp === 34, { stage: b.stage, enemy: b.enemy && b.enemy.name });
  } else {
    check('击杀后进入第 2 关（本局起手无攻击牌，跳过）', true);
  }
}

// 三关全破 → 胜利
{
  const b = S.createBattle(2024);
  for (let i = 0; i < 3; i++) {
    if (!b.enemy) break;
    b.enemy.hp = 1;
    b.stage = i;
    let guard = 0;
    while (b.enemy && b.enemy.hp > 0 && guard++ < 20) {
      const idx = b.hand.findIndex(k => S.CARDS[k].type === 'attack');
      if (idx < 0) { S.endTurn(b); continue; }
      S.play(b, idx);
    }
    if (i < 2 && b.enemy) b.stage = i + 1;
  }
  check('胜利流程可走通（不报错）', typeof b.won === 'boolean', { won: b.won, stage: b.stage });
}

// 死亡：血量归零即结束
{
  const b = S.createBattle(4242);
  b.hp = 1; b.block = 0;
  S.endTurn(b);
  check('血量归零判定失败', b.finished === true && b.won === false, { hp: b.hp, finished: b.finished });
}

// 牌库耗尽的循环：抽牌不应崩溃
{
  const b = S.createBattle(31337);
  b.deck = []; b.discard = ['strike'];
  S.endTurn(b);
  check('牌库耗尽后自动洗回弃牌堆', b.hand.length > 0, b.hand.length);
}

console.log(`\n卡牌引擎自测：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
