'use strict';
// 卡牌对决（spire）v1 —— 纯逻辑对局引擎（无 DOM、无网络），供服务端与自测共用。
//
// 设计目标：先把"能打完一局"的规则跑通，界面与联机后续再接。
// 规则（杀戮尖塔简化版）：
//   · 玩家 30 血、3 点能量；每回合抽 5 张，回合结束弃掉手牌
//   · 卡牌三种效果：攻击（打敌人）、防御（加格挡，回合开始清零）、强化（抽牌/回能）
//   · 敌人有意图（攻击/蓄力），意图在下回合开始兑现
//   · 打完 3 个房间即胜利；血量归零失败
const START_HP = 30, ENERGY = 3, HAND = 5;

const CARDS = {
  strike:  { id: 'strike',  name: '直击',   cost: 1, type: 'attack', value: 6,  desc: '造成 6 点伤害' },
  heavy:   { id: 'heavy',   name: '重击',   cost: 2, type: 'attack', value: 14, desc: '造成 14 点伤害' },
  jab:     { id: 'jab',     name: '快拳',   cost: 0, type: 'attack', value: 3,  desc: '造成 3 点伤害' },
  guard:   { id: 'guard',   name: '格挡',   cost: 1, type: 'block',  value: 6,  desc: '获得 6 点格挡' },
  brace:   { id: 'brace',   name: '铁壁',   cost: 2, type: 'block',  value: 12, desc: '获得 12 点格挡' },
  focus:   { id: 'focus',   name: '专注',   cost: 0, type: 'draw',   value: 2,  desc: '抽 2 张牌' },
  surge:   { id: 'surge',   name: '过载',   cost: 0, type: 'energy', value: 2,  desc: '获得 2 点能量' },
  venom:   { id: 'venom',   name: '淬毒',   cost: 1, type: 'attack', value: 5,  bleed: 3, desc: '造成 5 点伤害并施加 3 层流血' },
  mend:    { id: 'mend',    name: '急救',   cost: 1, type: 'heal',   value: 6,  desc: '回复 6 点生命' },
  weaken:  { id: 'weaken',  name: '削弱',   cost: 1, type: 'debuff', value: 4,  desc: '敌人下次攻击 -4' }
};
const DECK = ['strike', 'strike', 'strike', 'strike', 'guard', 'guard', 'guard', 'jab', 'jab', 'focus', 'mend', 'heavy'];
const ENEMIES = [
  { name: '擂台拳手', hp: 26, attack: 8 },
  { name: '器械怪', hp: 34, attack: 11 },
  { name: '冠军', hp: 46, attack: 14 }
];

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createBattle(seed) {
  const rng = mulberry32(Number(seed) || 1);
  const st = {
    rng, hp: START_HP, maxHp: START_HP, block: 0, energy: ENERGY,
    deck: shuffle(DECK, rng), hand: [], discard: [], turn: 1,
    stage: 0, enemy: null, finished: false, won: false, log: []
  };
  spawnEnemy(st);
  draw(st, HAND);
  return st;
}
function spawnEnemy(st) {
  const spec = ENEMIES[st.stage] || ENEMIES[ENEMIES.length - 1];
  st.enemy = { ...spec, hp: spec.hp, maxHp: spec.hp, weak: 0, bleed: 0, intent: 'attack' };
  st.log.push(`第 ${st.stage + 1} 关：${spec.name} 出现（${spec.hp} 血）`);
}
function draw(st, n) {
  for (let i = 0; i < n; i++) {
    if (!st.deck.length) {
      if (!st.discard.length) return;
      st.deck = shuffle(st.discard, st.rng);
      st.discard = [];
    }
    st.hand.push(st.deck.pop());
  }
}

// 打出一张手牌。返回 {ok, error?}
function play(st, index) {
  if (st.finished) return { ok: false, error: '对局已结束' };
  const key = st.hand[index];
  const card = key && CARDS[key];
  if (!card) return { ok: false, error: '没有这张牌' };
  if (card.cost > st.energy) return { ok: false, error: '能量不足' };
  st.energy -= card.cost;
  st.hand.splice(index, 1);
  st.discard.push(key);
  const e = st.enemy;
  switch (card.type) {
    case 'attack':
      e.hp -= card.value;
      if (card.bleed) { e.bleed += card.bleed; }
      st.log.push(`${card.name}：造成 ${card.value} 伤害`);
      break;
    case 'block':
      st.block += card.value;
      st.log.push(`${card.name}：+${card.value} 格挡`);
      break;
    case 'draw':
      draw(st, card.value);
      st.log.push(`${card.name}：抽 ${card.value} 张`);
      break;
    case 'energy':
      st.energy += card.value;
      st.log.push(`${card.name}：+${card.value} 能量`);
      break;
    case 'heal':
      st.hp = Math.min(st.maxHp, st.hp + card.value);
      st.log.push(`${card.name}：回复 ${card.value} 生命`);
      break;
    case 'debuff':
      e.weak += card.value;
      st.log.push(`${card.name}：敌人下次攻击 -${card.value}`);
      break;
    default: break;
  }
  if (e.hp <= 0) nextStage(st);
  return { ok: true };
}

function nextStage(st) {
  st.log.push(`${st.enemy.name} 被击败`);
  st.stage += 1;
  st.block = 0;
  st.energy = ENERGY;
  if (st.stage >= ENEMIES.length) {
    st.finished = true; st.won = true; st.enemy = null;
    st.log.push('三关全破，你赢了');
    return;
  }
  spawnEnemy(st);
  st.hand = [];
  draw(st, HAND);
}

// 结束回合：敌人先兑现上回合意图，再决定新意图。
function endTurn(st) {
  if (st.finished) return { ok: false, error: '对局已结束' };
  const e = st.enemy;
  if (e) {
    if (e.bleed > 0) { e.hp -= e.bleed; st.log.push(`流血：${e.bleed} 伤害`); e.bleed = Math.max(0, e.bleed - 1); }
    if (e.hp <= 0) { nextStage(st); return { ok: true }; }
    const raw = Math.max(0, e.attack - e.weak);
    const dmg = Math.max(0, raw - st.block);
    st.hp -= dmg;
    st.block = 0;
    e.weak = 0;
    st.log.push(`${e.name} 攻击 ${dmg} 点（格挡抵消 ${Math.min(raw, st.block + dmg) - dmg}）`);
    if (st.hp <= 0) { st.hp = 0; st.finished = true; st.won = false; st.log.push('你倒下了'); return { ok: true }; }
  }
  st.turn += 1;
  st.energy = ENERGY;
  st.hand = [];
  draw(st, HAND);
  return { ok: true };
}

function view(st) {
  return {
    hp: st.hp, maxHp: st.maxHp, block: st.block, energy: st.energy, turn: st.turn,
    stage: st.stage, finished: st.finished, won: st.won,
    enemy: st.enemy ? { name: st.enemy.name, hp: st.enemy.hp, maxHp: st.enemy.maxHp, intent: st.enemy.intent, bleed: st.enemy.bleed } : null,
    hand: st.hand.map((k, i) => ({ index: i, ...CARDS[k] })),
    deckLeft: st.deck.length, discardLeft: st.discard.length,
    log: st.log.slice(-8)
  };
}

module.exports = { createBattle, play, endTurn, view, CARDS, DECK, ENEMIES, START_HP, ENERGY, HAND };
