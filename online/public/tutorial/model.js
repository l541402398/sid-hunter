'use strict';
// Entirely local practice state. This module has no live-player references or network calls.
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorialRoom = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const PHASES = [
    ['move'], ['explore','explore-quiz','explore-close'], ['mine-open','mine-faction','mine-colors','mine-traits','mine-close'],
    ['clues-countdown','clues-open','clues-card','clues-close'], ['roster-open','roster-search','roster-alpha'],
    ['target-colors','accuse','confirm','target-close'], ['health'],
    ['bad-intro-open','bad-intro','assassinate-target','assassinate','assassinate-confirm','truce'], ['complete']
  ];
  const DESK = { x: 430, y: 215, w: 90, h: 68 };
  const DESK_QUIZ = {
    type: 'single', stem: '靠近可探索的书桌后，按哪个键开始探索？',
    options: [{ key: 'A', text: 'J' }, { key: 'B', text: 'K' }, { key: 'C', text: 'M' }],
    rewardCoins: 2
  };
  // Every visit uses this immutable cast; published clues come from the same data.
  const PEOPLE = Object.freeze([
    Object.freeze({ id: 'alpha', name: '练习人物甲', x: 650, y: 365, hair: Object.freeze(['银白', '#d3dce9']), top: Object.freeze(['砖红', '#b86a64']), bad: true }),
    Object.freeze({ id: 'beta', name: '练习人物乙', x: 780, y: 440, hair: Object.freeze(['墨黑', '#263244']), top: Object.freeze(['深蓝', '#5686bc']), bad: false })
  ]);
  const CLUE_COLORS = Object.freeze({ hair: PEOPLE[0].hair[0], top: PEOPLE[0].top[0] });
  function normalizeProgress(value) {
    const finalStep = PHASES.length - 1;
    const step = Number.isInteger(value?.step) ? Math.max(0, Math.min(finalStep, value.step)) : 0;
    return { step, completed: step === finalStep, dismissed: !!value?.dismissed };
  }
  function create(saved, layout = {}) {
    const initial = normalizeProgress(saved);
    const badPractice = initial.step >= 7;
    const state = { step: initial.step, phase: PHASES[initial.step][0], player: {
      x: 140, y: 390, hp: 3, score: initial.completed ? 15 : initial.step >= 6 ? 12 : initial.step > 1 ? DESK_QUIZ.rewardCoins : 0,
      faction: badPractice ? 'bad' : 'good', walk: 0, moving: false, facing: 'front'
    },
      explored: initial.step > 1, profileViewed: initial.step > 2, cluesPublished: initial.step > 3,
      cluesLeft: 3, cluesRead: initial.step > 3, selected: null, result: '',
      npcHp: initial.completed ? 0 : badPractice ? 1 : initial.step === 6 ? 2 : 3 };
    const desk = layout.desk || DESK, people = layout.people || PEOPLE;
    // Resume near the current objective rather than requiring completed movement again.
    if (initial.step === 1) Object.assign(state.player, { x: 380, y: 330 });
    if (initial.step >= 2) Object.assign(state.player, { x: 580, y: 390 });
    if (layout.spawn) Object.assign(state.player, initial.step === 0 ? layout.spawn : (layout.resume || layout.spawn));
    function advance(step) { if (state.step === step) { state.step++; state.phase = PHASES[state.step][0]; return true; } return false; }
    function event(name) {
      const p = state.phase;
      if (p === 'clues-countdown' && name === 'next' && !state.cluesPublished) return false;
      const transitions = { 'explore-quiz:loot-close': 'explore', 'mine-open:mine-open': 'mine-faction', 'mine-faction:next': 'mine-colors',
        'mine-colors:next': 'mine-traits', 'mine-traits:next': 'mine-close',
        'clues-countdown:next': 'clues-open', 'clues-card:next': 'clues-close',
        'roster-open:roster-open': 'roster-search', 'roster-search:search': 'roster-alpha',
        'target-colors:next': 'accuse', 'accuse:confirm-open': 'confirm', 'confirm:cancel': 'accuse',
        'bad-intro-open:mine-open': 'bad-intro', 'bad-intro:mine-close': 'assassinate-target',
        'assassinate-target:alpha-open': 'assassinate', 'assassinate:confirm-open': 'assassinate-confirm',
        'assassinate-confirm:cancel': 'assassinate' };
      if (transitions[p + ':' + name]) { state.phase = transitions[p + ':' + name]; return true; }
      if (p === 'explore-close' && name === 'loot-close') return advance(1);
      if (p === 'mine-close' && name === 'mine-close') { state.profileViewed = true; return advance(2); }
      if (p === 'clues-close' && name === 'clues-close') { state.cluesRead = true; return advance(3); }
      if (p === 'roster-alpha' && name === 'alpha-open') return advance(4);
      if (p === 'target-close' && name === 'target-close') return advance(5);
      if (p === 'health' && name === 'next') {
        state.player.faction = 'bad';
        state.npcHp = 1;
        return advance(6);
      }
      if (p === 'truce' && name === 'next') return advance(7);
      return false;
    }
    function collides(x, y) {
      if (layout.collides) return layout.collides(x, y);
      return x < 46 || x > 914 || y < 175 || y > 510 || (x > DESK.x - 12 && x < DESK.x + DESK.w + 12 && y > DESK.y - 8 && y < DESK.y + DESK.h + 7);
    }
    function move(dx, dy, dt) {
      const length = Math.hypot(dx, dy), p = state.player;
      p.moving = false;
      if (!length) return;
      const distance = (layout.speed || 180) * Math.min(Math.max(dt, 0), .05), vx = dx / length * distance, vy = dy / length * distance;
      const oldX = p.x, oldY = p.y;
      if (!collides(p.x + vx, p.y)) p.x += vx;
      if (!collides(p.x, p.y + vy)) p.y += vy;
      p.moving = oldX !== p.x || oldY !== p.y;
      p.walk += Math.hypot(p.x - oldX, p.y - oldY);
      p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
      if (p.walk >= 72) advance(0);
    }
    function nearDesk() {
      const p = state.player, x = Math.max(desk.x, Math.min(p.x, desk.x + desk.w)), y = Math.max(desk.y, Math.min(p.y, desk.y + desk.h));
      return Math.hypot(p.x - x, p.y - y) <= 64;
    }
    function explore() {
      if (state.phase !== 'explore' || !nearDesk()) return false;
      state.phase = 'explore-quiz';
      return true;
    }
    function answerDeskQuiz(answer) {
      if (state.phase !== 'explore-quiz' || answer !== 'B') return false;
      state.explored = true;
      state.player.score += DESK_QUIZ.rewardCoins;
      state.phase = 'explore-close';
      return true;
    }
    function viewProfile() { return event('mine-open'); }
    function tick(dt) {
      if (state.step !== 3 || state.cluesPublished) return;
      state.cluesLeft = Math.max(0, state.cluesLeft - Math.min(Math.max(dt, 0), .1));
      if (state.cluesLeft === 0) state.cluesPublished = true;
    }
    function readClues() {
      if (!state.cluesPublished) return false;
      if (state.step === 3 && state.phase === 'clues-open') { state.phase = 'clues-card'; return true; }
      return false;
    }
    function accuse(id) {
      if (state.step !== 5 || !state.cluesRead || state.phase !== 'confirm') return false;
      const person = people.find(p => p.id === id);
      if (!person) return false;
      if (!person.bad) {
        state.player.hp = Math.max(0, state.player.hp - 1);
        state.result = state.player.hp ? '这是调查员，误指认让你失去 1 格练习生命。核对线索后再试一次。' : '练习生命已归零。正式对局会进入休战，仍可参与非对抗玩法；这里已补满练习生命，可以重试。';
        if (!state.player.hp) state.player.hp = 3;
        return false;
      }
      state.npcHp = 2; state.player.score += 10;
      state.result = '线索匹配成功！对方扣 1 格练习生命，你获得 10 分练习积分。正式对局还会有技能次数、冷却与受击保护。';
      state.phase = 'target-close'; return true;
    }
    function assassinate(id) {
      if (state.phase !== 'assassinate-confirm') return false;
      const person = people.find(p => p.id === id);
      if (!person) return false;
      // In this exercise, the two practice characters swap sides.
      if (!person.bad) {
        state.result = '对方也是潜伏者，双方生命不变，本次没有获得积分。';
        return false;
      }
      state.npcHp -= 1;
      state.player.score += 3;
      state.result = '刺杀成功，获得 3 分练习积分。练习人物甲进入休战。';
      state.phase = 'truce';
      return true;
    }
    return { state, move, tick, nearDesk, explore, answerDeskQuiz, event, viewProfile, readClues, accuse, assassinate, progress: () => ({ step: state.step }) };
  }
  return { DESK, DESK_QUIZ, PEOPLE, CLUE_COLORS, create, normalizeProgress, PHASES };
});
