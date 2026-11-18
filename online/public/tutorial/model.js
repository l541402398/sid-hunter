'use strict';
// Entirely local practice state. This module has no live-player references or network calls.
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorialRoom = api;
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const STEPS = [
    { title: '移动', task: '试着用 W、A、S、D 移动', detail: 'W 向上、A 向左、S 向下、D 向右，走动一小段即可。', tip: '墙壁和家具会挡路，也可以用方向键移动。' },
    { title: '交互', task: '靠近身边的书桌，按 K 探索', detail: '走近高亮的书桌，再按 K 完成一次探索。', tip: '探索可能为空、获得积分或遇到题目。J 是敲击互动，不扣对抗生命。' },
    { title: '查看自己', task: '了解阵营、外观属性和隐藏属性', detail: '跟随高亮依次查看个人信息，最后关闭面板。', tip: '个人信息只向自己展示，公开属性仍遵循正式对局规则。' },
    { title: '查看线索', task: '根据系统公布的信息推理目标', detail: '展开线索，查看当前坏人信息卡片。', tip: '匿名编号不对应玩家顺序，未公布的字段为 ***。' },
    { title: '玩家名单', task: '用线索中的颜色搜索人物', detail: '在名单输入「砖红」，找到符合线索的人物并打开档案。', tip: '搜索只匹配公开信息，不会搜索出他人的隐藏属性。' },
    { title: '使用技能', task: '核对颜色线索，再使用「指认」', detail: '对照坏人01的线索，确认头发和上衣颜色一致，再指认。', tip: '指认潜伏者让对方扣 1 格生命；误指好人会让自己扣 1 格生命。' },
    { title: '观察结果', task: '查看地图和名单中的血量变化', detail: '两处血条同步由 3/3 变为 2/3。', tip: '生命归零后进入休战，已有积分保留，仍可参与非对抗玩法。' }
  ];
  const PHASES = [
    ['move'], ['explore','explore-close'], ['mine-open','mine-faction','mine-colors','mine-traits','mine-close'],
    ['clues-countdown','clues-open','clues-card','clues-close'], ['roster-open','roster-search','roster-alpha'],
    ['target-colors','accuse','confirm','target-close'], ['health'], ['complete']
  ];
  const DESK = { x: 430, y: 215, w: 90, h: 68 };
  // Every visit uses this immutable cast; published clues come from the same data.
  const PEOPLE = Object.freeze([
    Object.freeze({ id: 'alpha', name: '练习人物甲', x: 650, y: 365, hair: Object.freeze(['银白', '#d3dce9']), top: Object.freeze(['砖红', '#b86a64']), bad: true }),
    Object.freeze({ id: 'beta', name: '练习人物乙', x: 780, y: 440, hair: Object.freeze(['墨黑', '#263244']), top: Object.freeze(['深蓝', '#5686bc']), bad: false })
  ]);
  const CLUE_COLORS = Object.freeze({ hair: PEOPLE[0].hair[0], top: PEOPLE[0].top[0] });
  function normalizeProgress(value) {
    const step = Number.isInteger(value?.step) ? Math.max(0, Math.min(STEPS.length, value.step)) : 0;
    return { step, completed: step === STEPS.length, dismissed: !!value?.dismissed };
  }
  function create(saved, layout = {}) {
    const initial = normalizeProgress(saved);
    const state = { step: initial.step, phase: PHASES[initial.step][0], player: { x: 140, y: 390, hp: 3, score: initial.step >= 6 ? 12 : initial.step > 1 ? 2 : 0, walk: 0, moving: false, facing: 'front' },
      explored: initial.step > 1, profileViewed: initial.step > 2, cluesPublished: initial.step > 3,
      cluesLeft: 5, cluesRead: initial.step > 3, selected: null, result: '', npcHp: initial.step >= 6 ? 2 : 3 };
    const desk = layout.desk || DESK, people = layout.people || PEOPLE;
    // Resume near the current objective rather than requiring completed movement again.
    if (initial.step === 1) Object.assign(state.player, { x: 380, y: 330 });
    if (initial.step >= 2) Object.assign(state.player, { x: 580, y: 390 });
    if (layout.spawn) Object.assign(state.player, initial.step === 0 ? layout.spawn : (layout.resume || layout.spawn));
    function advance(step) { if (state.step === step) { state.step++; state.phase = PHASES[state.step][0]; return true; } return false; }
    function event(name) {
      const p = state.phase;
      const transitions = { 'mine-open:mine-open': 'mine-faction', 'mine-faction:next': 'mine-colors',
        'mine-colors:next': 'mine-traits', 'mine-traits:next': 'mine-close',
        'clues-countdown:next': 'clues-open', 'clues-card:next': 'clues-close',
        'roster-open:roster-open': 'roster-search', 'roster-search:search': 'roster-alpha',
        'target-colors:next': 'accuse', 'accuse:confirm-open': 'confirm', 'confirm:cancel': 'accuse' };
      if (transitions[p + ':' + name]) { state.phase = transitions[p + ':' + name]; return true; }
      if (p === 'explore-close' && name === 'loot-close') return advance(1);
      if (p === 'mine-close' && name === 'mine-close') { state.profileViewed = true; return advance(2); }
      if (p === 'clues-close' && name === 'clues-close') { state.cluesRead = true; return advance(3); }
      if (p === 'roster-alpha' && name === 'alpha-open') return advance(4);
      if (p === 'target-close' && name === 'target-close') return advance(5);
      if (p === 'health' && name === 'next') return advance(6);
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
      state.explored = true;
      state.player.score += 2;
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
    return { state, move, tick, nearDesk, explore, event, viewProfile, readClues, accuse, progress: () => ({ step: state.step }) };
  }
  return { STEPS, DESK, PEOPLE, CLUE_COLORS, create, normalizeProgress, PHASES };
});
