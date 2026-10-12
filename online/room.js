'use strict';
// Authoritative room state. Server-only module.
// Everything that decides the game (position, skill resolution, public state,
// elimination, finish) is computed here. Clients only submit intents and render.
const { randomUUID, randomInt } = require('crypto');
const WORLD = require('./shared/world.js');

// Charge interval is a build-time switch: 90s for the LAN playtest build, 20 minutes
// for the real game. Change ONLY this constant when shipping the正式版; all charge
// logic reads it from here and nothing else hardcodes a recovery duration.
const SKILL_CONFIG = {
  chargeIntervalMs: 90_000, // 正式版改为 1_200_000（20 分钟）
  maxCharges: 2,
  probeCooldownMs: 8_000,
  actionCooldownMs: 12_000
};

// 奖励仅保存在服务端，共享地图不暴露容器内容。
const EXPLORATION_REWARDS = {
  'cabinet-785-160': { kind: 'clue' },
  'table-2010-514': { kind: 'clue' },
  'table-2535-513': { kind: 'clue' },
  'reception-132-173': { kind: 'chips', amount: 3 },
  'desk-1035-172': { kind: 'chips', amount: 2 },
  'desk-1690-172': { kind: 'chips', amount: 2 },
  'desk-2940-172': { kind: 'chips', amount: 2 },
  'desk-3600-172': { kind: 'chips', amount: 2 },
  'counter-1990-165': { kind: 'chips', amount: 2 }
};

const SEG_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const NAME_POOL = ['小序', '阿澈', '木木', '七禾', '南风', '池雨', '蓝桉', '柚子', '星野', '可颂',
  '松子', '北辰', '秋白', '墨墨', '梨舟', '小满', '照野', '言川', '竹青', '余温',
  '芋圆', '青禾', '眠川', '拾光', '晚舟', '云舒', '鸣夏', '知白', '白鹭', '寒枝', '归野', '南山'];
const TRAIT_POOL = {
  saying: ['先喝口水', '马上就好', '有点意思', '稳住别慌', '让我想想', '先做复盘', '晚点再说'],
  food: ['番茄面', '饺子', '咖喱饭', '火锅', '三明治', '牛肉粉', '烤红薯'],
  sport: ['羽毛球', '游泳', '骑行', '篮球', '跑步', '攀岩', '瑜伽']
};

const pick = list => list[Math.floor(Math.random() * list.length)];
const randChar = () => SEG_CHARS[Math.floor(Math.random() * SEG_CHARS.length)];
const randomSid = () => [0, 1, 2].map(() => randChar() + randChar() + randChar());
const randomColors = () => Object.fromEntries(Object.entries(WORLD.PALETTES).map(([k, options]) => [k, pick(options)]));
const randomTraits = () => Object.fromEntries(Object.keys(TRAIT_POOL).map(k => [k, pick(TRAIT_POOL[k])]));

function createRoom(options = {}) {
  const wheelRandomInt = options.randomInt || randomInt;
  const playConfig = WORLD.PLAY_CONFIG;
  // 结束规则默认取 WORLD.RULES；测试可通过 options.rules 覆盖（如小房间活人阈值）。
  const rules = { ...WORLD.RULES, ...(options.rules || {}) };
  const room = {
    players: [],
    logs: [],
    eliminateEvents: 0,
    finished: false,
    finishReason: '',
    ranking: null,
    startedAt: Date.now(),
    sessions: new Map(),
    processed: new Map(),
    challenges: new Map(),
    pending: new Map(),
    clockOffset: 0
  };
  const furniture = WORLD.makeFurniture();
  const now = () => Date.now() + room.clockOffset;
  const streams = new Map();

  function collides(x, y) {
    return WORLD.collidesAt(x, y, furniture);
  }
  function find(id) { return room.players.find(p => p.id === id); }
  function playerBySession(sid) {
    if (!sid) return null;
    const id = room.sessions.get(sid);
    return id === undefined ? null : find(id);
  }
  function localTime(ms) { return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false }); }
  function log(text) {
    room.logs.unshift({ time: localTime(now()), text });
    if (room.logs.length > 80) room.logs.pop();
  }
  // 统一计分入口：所有行为只加分、绝不扣分，分值表来自 WORLD.SCORE。
  function award(p, key) {
    p.score += WORLD.SCORE[key] || 0;
  }
  function makeSkills(faction) {
    const ids = faction === 'bad' ? ['probe', 'accuse', 'spy', 'kill'] : ['probe', 'accuse'];
    return Object.fromEntries(ids.map(id => [id, {
      chargesRemaining: SKILL_CONFIG.maxCharges, maxCharges: SKILL_CONFIG.maxCharges,
      cooldownMs: ['probe', 'spy'].includes(id) ? SKILL_CONFIG.probeCooldownMs : SKILL_CONFIG.actionCooldownMs,
      cooldownUntil: 0, chargeIntervalMs: SKILL_CONFIG.chargeIntervalMs, nextChargeAt: 0
    }]));
  }
  // Lazy settlement: no timer loop. Charges are rebuilt from absolute timestamps every
  // time a skill state is read, so offline time counts exactly like online time.
  function syncCharges(player, t) {
    for (const skill of Object.values(player.skills)) {
      if (skill.chargesRemaining >= skill.maxCharges) { skill.nextChargeAt = 0; continue; }
      while (skill.nextChargeAt && t >= skill.nextChargeAt) {
        skill.chargesRemaining = Math.min(skill.maxCharges, skill.chargesRemaining + 1);
        skill.nextChargeAt = skill.chargesRemaining >= skill.maxCharges ? 0 : skill.nextChargeAt + skill.chargeIntervalMs;
      }
      if (skill.chargesRemaining >= skill.maxCharges) skill.nextChargeAt = 0;
    }
  }
  function consumeCharge(skill, t) {
    if (skill.chargesRemaining >= skill.maxCharges) skill.nextChargeAt = t + skill.chargeIntervalMs;
    skill.chargesRemaining = Math.max(0, skill.chargesRemaining - 1);
    skill.cooldownUntil = t + skill.cooldownMs;
  }
  function makeSidState() {
    return { segments: randomSid(), revealed: [false, false, false] };
  }
  function uniqueName(name) {
    if (!room.players.some(p => p.name === name)) return name;
    let n = 2;
    while (room.players.some(p => p.name === `${name}${n}`)) n++;
    return `${name}${n}`;
  }
  function join(sessionId, nickname) {
    const existing = playerBySession(sessionId);
    if (existing) {
      existing.online = true;
      existing.lastSeen = now();
      return { player: existing, revived: true };
    }
    if (room.finished) return { error: '游戏已结束，无法加入' };
    const t = now();
    const isFirst = room.players.length === 0;
    const faction = isFirst ? 'bad' : 'good';
    const id = room.players.length;
    const rawName = typeof nickname === 'string' ? nickname.trim().slice(0, 8) : '';
    const player = {
      id,
      name: uniqueName(rawName || pick(NAME_POOL)),
      colors: randomColors(),
      traits: randomTraits(),
      traitPublic: { saying: false, food: false, sport: false },
      sid: makeSidState(),
      faction,
      hp: faction === 'bad' ? 2 : 1,
      alive: true,
      score: 0,
      x: 430 + (id * 211) % 3000,
      y: id % 2 ? 450 : 340,
      online: true,
      lastSeen: t,
      sessionId,
      input: { up: false, down: false, left: false, right: false },
      walk: 0,
      exploration: { chips: 0, clues: [], searched: [] },
      games: { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '' },
      combat: { facing: { x: 1, y: 0 }, attackUntil: 0, lastAttackAt: 0, stunUntil: 0, freezeUntil: 0 },
      skills: makeSkills(faction)
    };
    room.players.push(player);
    room.sessions.set(sessionId, id);
    room.pending.set(id, []);
    log(`${player.name}加入了办公室。`);
    // Reconnect token: headless/embedded webviews do not always persist the HttpOnly
    // cookie across a browser restart, so the page keeps this in sessionStorage and
    // replays it as a header. Identity is still never claimable by nickname.
    return { player, revived: false, sessionToken: sessionId };
  }
  function setOffline(id) {
    const p = find(id);
    if (!p) return;
    p.online = false;
    p.lastSeen = now();
    p.input = { up: false, down: false, left: false, right: false };
  }
  function movementLocked(p, t) {
    return t < p.combat.stunUntil || t < p.combat.freezeUntil;
  }
  function setIntent(id, input) {
    const p = find(id);
    if (!p || !input || typeof input !== 'object') return;
    const intent = { up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right };
    if (!Object.values(intent).some(Boolean)) { p.input = intent; return; }
    if (room.finished || !p.alive || !p.online) return;
    if (movementLocked(p, now())) {
      p.input = { up: false, down: false, left: false, right: false };
      return;
    }
    p.input = intent;
    const x = Number(intent.right) - Number(intent.left), y = Number(intent.down) - Number(intent.up);
    const length = Math.hypot(x, y);
    if (length) p.combat.facing = { x: x / length, y: y / length };
  }
  function step(dt) {
    const t = now();
    syncRoom(t);
    checkFinish(t);
    if (room.finished) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    for (const p of room.players) {
      if (!p.alive || !p.online) continue;
      if (movementLocked(p, t)) {
        p.input = { up: false, down: false, left: false, right: false };
        continue;
      }
      let dx = Number(p.input.right) - Number(p.input.left);
      let dy = Number(p.input.down) - Number(p.input.up);
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      dx = dx / len * WORLD.SPEED * dt;
      dy = dy / len * WORLD.SPEED * dt;
      const oldX = p.x, oldY = p.y;
      const nx = Math.max(WORLD.MIN_X, Math.min(WORLD.MAX_X, p.x + dx));
      if (!collides(nx, p.y)) p.x = nx;
      const ny = Math.max(WORLD.MIN_Y, Math.min(WORLD.MAX_Y, p.y + dy));
      if (!collides(p.x, ny)) p.y = ny;
      p.walk += Math.hypot(p.x - oldX, p.y - oldY);
    }
  }
  function queueEvent(playerId, event) {
    const queue = room.pending.get(playerId) || [];
    queue.push({ eventId: randomUUID(), occurredAt: now(), ...event });
    if (queue.length > 200) queue.shift();
    room.pending.set(playerId, queue);
  }
  // Victim-side events are projected without any actor information: only what happened
  // to the receiver. No actor id/name, no faction hint, no online/offline wording, and
  // never any mention of how or by whom.
  function projectEvent(event) {
    const text = {
      revealedTrait: event.traitName ? `你的${event.traitName}已被公开` : '你的隐藏属性已被公开',
      revealedSegment: `你的第${(event.segmentIndex || 0) + 1}段S-ID已公开`,
      damaged: '你被扣1血',
      eliminated: '你已被淘汰',
      accusationFailed: event.segmentIndex >= 0 ? `你的第${event.segmentIndex + 1}段S-ID已公开` : '你的S-ID已全部公开，无新增公开段'
    }[event.type] || '你身上发生了新的公开变化';
    return {
      eventId: event.eventId,
      type: event.type,
      occurredAt: event.occurredAt,
      text,
      result: {
        traitName: event.traitName || null,
        traitValue: event.traitValue || null,
        segmentIndex: typeof event.segmentIndex === 'number' ? event.segmentIndex : null,
        damaged: event.type === 'damaged' ? 1 : 0,
        eliminated: event.type === 'eliminated'
      }
    };
  }
  function publicProjection(p) {
    return {
      id: p.id,
      name: p.name,
      alive: p.alive,
      online: p.online,
      score: p.score,
      x: p.x,
      y: p.y,
      facing: { ...p.combat.facing },
      lastAttackAt: p.combat.lastAttackAt,
      stunUntil: p.combat.stunUntil,
      freezeUntil: p.combat.freezeUntil,
      colors: p.colors,
      traits: Object.fromEntries(Object.keys(p.traits).map(k => [k, p.traitPublic[k] ? p.traits[k] : WORLD.MASK])),
      sid: p.sid.segments.map((s, i) => p.sid.revealed[i] ? s : WORLD.MASK).join('-')
    };
  }
  function privateProjection(p) {
    const t = now();
    syncRoom(t);
    syncCharges(p, t);
    return {
      id: p.id,
      name: p.name,
      faction: p.faction,
      sid: p.sid.segments.join('-'),
      hp: p.hp,
      alive: p.alive,
      score: p.score,
      traits: p.traits,
      exploration: explorationProjection(p),
      games: gamesProjection(p),
      combat: combatProjection(p),
      skills: Object.fromEntries(Object.entries(p.skills).map(([id, skill]) => [id, { ...skill }])),
      pending: (room.pending.get(p.id) || []).map(projectEvent)
    };
  }
  function publicSnapshot() {
    const t = now();
    checkFinish(t);
    syncRoom(t);
    return {
      type: 'snapshot',
      serverTime: now(),
      finished: room.finished,
      finishReason: room.finishReason || null,
      ranking: room.ranking ? room.ranking.map(r => ({ ...r })) : null,
      rules: { endRemainingPlayers: rules.endRemainingPlayers, timeLimitMs: rules.timeLimitMs, endsAt: room.startedAt + rules.timeLimitMs },
      aliveCount: room.players.filter(p => p.alive).length,
      players: room.players.map(publicProjection),
      logs: room.logs.slice(),
      config: { chargeIntervalMs: SKILL_CONFIG.chargeIntervalMs }
    };
  }
  function privateSnapshot(playerId) {
    const p = find(playerId);
    if (!p) return { ok: false, error: 'identity not found' };
    return { ok: true, me: privateProjection(p) };
  }
  function ack(playerId, eventIds) {
    const ids = new Set(Array.isArray(eventIds) ? eventIds : []);
    room.pending.set(playerId, (room.pending.get(playerId) || []).filter(e => !ids.has(e.eventId)));
  }
  // 排名：分数降序，其次存活优先，再按 id 升序。
  function buildRanking() {
    return room.players.slice()
      .sort((a, b) => (b.score - a.score) || (Number(b.alive) - Number(a.alive)) || (a.id - b.id))
      .map((p, index) => ({ rank: index + 1, id: p.id, name: p.name, score: p.score, alive: p.alive, faction: p.faction }));
  }
  // 仅三种结束方式。注意 aliveFloor 必须加 players.length > endRemainingPlayers 守卫：
  // 否则小房间（如 20 人）会在开局瞬间就满足“存活 <= 100”而立即结束，这是有意设计。
  function checkFinish(t = now()) {
    if (room.finished) return;
    if (!room.players.length) return;
    const alive = room.players.filter(p => p.alive);
    const bads = room.players.filter(p => p.faction === 'bad');
    const aliveBad = bads.filter(p => p.alive);
    let reason = '';
    if (room.players.length > rules.endRemainingPlayers && alive.length <= rules.endRemainingPlayers) reason = 'aliveFloor';
    else if (bads.length > 0 && aliveBad.length === 0) reason = 'badWiped';
    else if (t - room.startedAt >= rules.timeLimitMs) reason = 'timeUp';
    if (reason) {
      room.finished = true;
      room.finishReason = reason;
      room.ranking = (reason === 'badWiped' || reason === 'timeUp') ? buildRanking() : null;
      log(reason === 'aliveFloor' ? `游戏结束：存活人数已淘汰至剩余${rules.endRemainingPlayers}人。`
        : reason === 'badWiped' ? '游戏结束：坏人已全部出局。'
        : `游戏结束：时间到（${rules.timeLimitMs / 3600000}小时）。`);
    }
    // 未结束时同样清理过期/失效挑战（淘汰会因此关闭猜拳），与旧实现保持一致；syncRoom 不回调查 checkFinish，无递归。
    syncRoom(t);
  }
  // Strict uppercase match. Whitespace is ignored so a pasted value still works, but
  // lowercase input is a format error: it never consumes a charge or starts a cooldown.
  function normalizeSid(value) {
    const raw = typeof value === 'string' ? value.replace(/\s/g, '') : '';
    return /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(raw) ? raw : null;
  }
  function reject(reason) { return { ok: false, error: reason }; }

  function doSpy(actor, target) {
    {
      const index = target.sid.revealed.findIndex(x => !x);
      if (index < 0) return reject('该目标没有未公开的S-ID段，不消耗次数');
      target.sid.revealed[index] = true;
      queueEvent(target.id, { type: 'revealedSegment', segmentIndex: index });
      log(`${target.name}的S-ID已公开：${publicProjection(target).sid}。`);
      return { ok: true, kind: 'spy', resultText: `刺探完成：第${index + 1}段S-ID为 ${target.sid.segments[index]}。`, targetId: target.id };
    }
  }
  function doProbe(actor, target) {
    const key = Object.keys(target.traits).find(k => !target.traitPublic[k]);
    if (!key) return reject('该目标没有未公开的隐藏属性，不消耗次数');
    target.traitPublic[key] = true;
    queueEvent(target.id, { type: 'revealedTrait', traitName: WORLD.TRAIT_NAMES[key], traitValue: target.traits[key] });
    log(`${target.name}的${WORLD.TRAIT_NAMES[key]}已公开：${target.traits[key]}。`);
    return { ok: true, kind: 'probe', resultText: `探查完成：${WORLD.TRAIT_NAMES[key]}为「${target.traits[key]}」。`, targetId: target.id };
  }
  function doAccuse(actor, target) {
    log(`${target.name}被指认一次。`);
    if (target.faction === 'bad') {
      award(actor, 'accuseHit');
      target.hp -= 1;
      if (target.hp > 0) {
        queueEvent(target.id, { type: 'damaged' });
        return { ok: true, kind: 'accuse', resultText: `指认命中：目标扣1血，仍存活。`, targetId: target.id };
      }
      target.alive = false;
      room.eliminateEvents += 1;
      queueEvent(target.id, { type: 'eliminated' });
      log(`${target.name}已淘汰。`);
      checkFinish();
      return { ok: true, kind: 'accuse', resultText: '指认命中：目标已淘汰。', targetId: target.id };
    }
    const index = actor.sid.revealed.findIndex(x => !x);
    let resultText = '错指认：自己的S-ID已全部公开，无新增公开段。';
    if (index >= 0) {
      actor.sid.revealed[index] = true;
      resultText = `错指认：自己第${index + 1}段S-ID已公开。`;
      // Penalty updates the public projection, but never logs the actor or the outcome.
    }
    queueEvent(actor.id, { type: 'accusationFailed', segmentIndex: index });
    return { ok: true, kind: 'accuse', resultText, targetId: target.id, selfRevealed: true };
  }
  function doKill(actor, target, submitted) {
    const sid = normalizeSid(submitted);
    if (!sid) return { ok: false, error: '格式错误：必须是三段，每段3位字母或数字。不消耗、不进入冷却。', formatError: true };
    if (sid !== target.sid.segments.join('-')) {
      return { ok: true, kind: 'kill', resultText: 'S-ID不匹配：目标未淘汰，进入冷却。', targetId: target.id };
    }
    award(actor, 'kill');
    target.hp = 0;
    target.alive = false;
    room.eliminateEvents += 1;
    queueEvent(target.id, { type: 'eliminated' });
    log(`${target.name}已淘汰。`);
    checkFinish();
    return { ok: true, kind: 'kill', resultText: 'S-ID完全匹配：目标已淘汰。', targetId: target.id };
  }
  function useSkill(sessionId, body) {
    const t = now();
    syncRoom(t);
    checkFinish(t);
    if (room.finished) return reject('游戏已结束，技能已冻结');
    const actor = playerBySession(sessionId);
    if (!actor) return reject('身份无效，请重新加入');
    if (!actor.alive) return reject('你已淘汰，不能使用技能');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId) return reject('缺少 commandId');
    if (room.processed.has(commandId)) return reject('该指令已结算过');
    const kind = body.skill === 'action' ? (actor.faction === 'bad' ? 'kill' : 'accuse') : body.skill;
    if (!['probe', 'accuse', 'spy', 'kill'].includes(kind)) return reject('未知技能');
    const skill = actor.skills[kind];
    if (!skill) return reject('无权使用该技能');
    syncCharges(actor, t);
    if (skill.chargesRemaining <= 0) return reject(`${kind === 'probe' ? '探查' : '该技能'}次数用尽，等待恢复`);
    if (t < skill.cooldownUntil) return reject(`${kind === 'probe' ? '探查' : '该技能'}冷却中`);
    const target = find(Number(body.targetId));
    if (!target || target.id === actor.id) return reject('目标无效');
    if (!target.alive) return reject('已淘汰目标不可操作');
    const resolved = kind === 'probe' ? doProbe(actor, target) : kind === 'accuse' ? doAccuse(actor, target) : kind === 'spy' ? doSpy(actor, target) : doKill(actor, target, body.sid);
    if (resolved && resolved.ok) {
      consumeCharge(skill, t);
      room.processed.set(commandId, t);
      // 同一局保留全部 commandId，避免旧指令在冷却结束后重新结算。
      // 计分：探查/刺探成功加分；指认命中与击杀在 doAccuse/doKill 内计分。
      if (kind === 'probe') award(actor, 'probe');
      else if (kind === 'spy') award(actor, 'spy');
    }
    return resolved;
  }
  function explorationProjection(p) {
    return { chips: p.exploration.chips, clues: p.exploration.clues.map(c => ({ ...c })), searched: p.exploration.searched.slice() };
  }
  function availableClue(actor, source) {
    const seen = new Set(actor.exploration.clues.map(c => `${c.targetId}:${c.key}`));
    for (const target of room.players) {
      if (!target.alive || target.id === actor.id) continue;
      for (const key of Object.keys(WORLD.TRAIT_NAMES)) {
        if (target.traitPublic[key] || seen.has(`${target.id}:${key}`)) continue;
        const label = WORLD.TRAIT_NAMES[key], value = target.traits[key];
        return { id: randomUUID(), targetId: target.id, targetName: target.name, key, label, value, source,
          text: `${target.name}的${label}是「${value}」。` };
      }
    }
    return null;
  }
  // 转盘·线索券专用：只挑“存活且为坏人”的其他玩家作为线索目标，按 targetId:key 去重。
  function availableBadClue(actor) {
    const seen = new Set(actor.exploration.clues.map(c => `${c.targetId}:${c.key}`));
    for (const target of room.players) {
      if (target.faction !== 'bad' || !target.alive || target.id === actor.id) continue;
      for (const key of Object.keys(WORLD.TRAIT_NAMES)) {
        if (target.traitPublic[key] || seen.has(`${target.id}:${key}`)) continue;
        const label = WORLD.TRAIT_NAMES[key], value = target.traits[key];
        return { id: randomUUID(), targetId: target.id, targetName: target.name, key, label, value, source: '转盘·线索券',
          text: `${target.name}的${label}是「${value}」。` };
      }
    }
    return null;
  }
  function interact(sessionId, body) {
    checkFinish(now());
    const actor = playerBySession(sessionId);
    const fail = reason => ({ ...reject(reason), resultText: reason, exploration: actor ? explorationProjection(actor) : null });
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，探索已冻结');
    if (!actor.alive) return fail('你已淘汰，不能探索');
    if (movementLocked(actor, now())) return fail('你正在眩晕或僵直，暂时不能探索');
    if (!body || typeof body !== 'object') return fail('交互指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    if (!['search', 'exchange'].includes(body.kind)) return fail('未知交互');
    const entity = body.kind === 'search'
      ? furniture.find(f => f.id === body.entityId && f.container && EXPLORATION_REWARDS[f.id])
      : WORLD.NPCS.find(n => n.id === body.entityId);
    if (!entity) return fail('交互目标无效');
    if (WORLD.distanceToEntity(actor, entity) > WORLD.INTERACT_RANGE) return fail('距离太远，请靠近后再试');
    let resultText;
    if (body.kind === 'search') {
      if (actor.exploration.searched.includes(entity.id)) return fail('你已经搜索过这个容器');
      const reward = EXPLORATION_REWARDS[entity.id];
      const clue = reward.kind === 'clue' ? availableClue(actor, entity.container.name) : null;
      if (clue) {
        actor.exploration.clues.push(clue);
        resultText = `搜索完成：${clue.text}`;
        award(actor, 'clue');
      } else {
        const amount = reward.kind === 'chips' ? reward.amount : 2;
        actor.exploration.chips += amount;
        resultText = `搜索完成：获得${amount}筹码${reward.kind === 'clue' ? '（暂无可用线索）' : ''}。`;
      }
      actor.exploration.searched.push(entity.id);
      award(actor, 'search');
    } else {
      if (actor.exploration.chips < entity.cost) return fail(`筹码不足，需要${entity.cost}筹码`);
      const clue = availableClue(actor, entity.name);
      if (!clue) return fail('暂无尚未拥有的隐藏线索，不扣筹码');
      actor.exploration.chips -= entity.cost;
      actor.exploration.clues.push(clue);
      resultText = `兑换完成：${clue.text}`;
      award(actor, 'exchange');
      award(actor, 'clue');
    }
    room.processed.set(commandId, now());
    actor.input = { up: false, down: false, left: false, right: false };
    return { ok: true, resultText, exploration: explorationProjection(actor) };
  }
  function gamesProjection(p) {
    return { wheelSpins: { ...p.games.wheelSpins }, rpsPending: p.games.rpsPending ? { ...p.games.rpsPending } : null,
      rpsUntil: p.games.rpsUntil, lastResult: p.games.lastResult };
  }
  function combatProjection(p) {
    return { facing: { ...p.combat.facing }, attackUntil: p.combat.attackUntil, lastAttackAt: p.combat.lastAttackAt,
      stunUntil: p.combat.stunUntil, freezeUntil: p.combat.freezeUntil };
  }
  function mechanicsResponse(actor, ok, resultText, extra = {}) {
    return { ok, ...(!ok ? { error: resultText } : {}), resultText,
      exploration: actor ? explorationProjection(actor) : null,
      games: actor ? gamesProjection(actor) : null, combat: actor ? combatProjection(actor) : null, ...extra };
  }
  function closeChallenge(challenge, t, resultFor) {
    room.challenges.delete(challenge.id);
    for (const id of [challenge.fromId, challenge.toId]) {
      const p = find(id);
      if (!p) continue;
      p.games.rpsPending = null;
      p.games.rpsUntil = t + playConfig.rpsCooldownMs;
      p.games.lastResult = resultFor(p);
    }
  }
  // 所有请求与投影在同一同步调用栈内先清理过期挑战，再验证并结算。
  function syncRoom(t) {
    for (const challenge of room.challenges.values()) {
      const from = find(challenge.fromId), to = find(challenge.toId);
      const reason = room.finished ? '游戏已结束' : !from || !to || !from.alive || !to.alive ? '参与者已淘汰'
        : t >= challenge.expiresAt ? '邀请已超时' : '';
      if (reason) closeChallenge(challenge, t, () => `猜拳已取消：${reason}，不扣筹码。`);
    }
  }
  function rpsValidation(from, to) {
    if (!from || !to || from.id === to.id) return '猜拳目标无效';
    if (!from.alive || !to.alive) return '参与者已淘汰';
    if (!from.online || !to.online) return '参与者不在线';
    if (WORLD.distanceToEntity(from, to) > WORLD.INTERACT_RANGE) return '距离太远，请靠近后再试';
    if (!WORLD.lineClear(from, to, furniture)) return '家具挡住了猜拳双方';
    if (from.exploration.chips < playConfig.rpsStake || to.exploration.chips < playConfig.rpsStake) return '双方都需要至少1筹码';
    return '';
  }
  function play(sessionId, body) {
    const t = now();
    syncRoom(t);
    checkFinish(t);
    const actor = playerBySession(sessionId);
    const fail = reason => mechanicsResponse(actor, false, reason);
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，小游戏已冻结');
    if (!actor.alive) return fail('你已淘汰，不能参与小游戏');
    if (movementLocked(actor, t)) return fail('你正在眩晕或僵直，暂时不能参与小游戏');
    if (!actor.online && (!body || !['rpsReply', 'rpsCancel'].includes(body.kind))) return fail('你不在线，不能参与小游戏');
    if (!body || typeof body !== 'object') return fail('小游戏指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    const validChoice = choice => ['rock', 'paper', 'scissors'].includes(choice);
    let extra = {};
    if (body.kind === 'wheel') {
      const entity = WORLD.NPCS.find(n => n.id === body.entityId);
      if (!entity) return fail('转盘目标无效');
      if (WORLD.distanceToEntity(actor, entity) > WORLD.INTERACT_RANGE) return fail('距离太远，请靠近后再试');
      // 单局连续对局：同一 NPC 可反复转动，费用随已转次数阶梯上升。
      const spins = actor.games.wheelSpins[entity.id] || 0;
      const cost = WORLD.wheelSpinCost(spins);
      if (actor.exploration.chips < cost) return fail(`筹码不足：第${spins + 1}次转动需要${cost}筹码`);
      actor.exploration.chips -= cost;
      const pool = WORLD.buildWheelPool(actor.faction);
      const slotIndex = wheelRandomInt(pool.length);
      const item = pool[slotIndex];
      let resultText;
      if (item.kind === 'chips') {
        actor.exploration.chips += item.amount;
        resultText = `转盘第${spins + 1}次：获得${item.amount}筹码（花费${cost}筹码）。`;
      } else if (item.key === 'clue') {
        const clue = availableBadClue(actor);
        if (clue) {
          actor.exploration.clues.push(clue);
          resultText = `转盘第${spins + 1}次：线索券获得${clue.text}`;
        } else {
          actor.exploration.chips += 2;
          resultText = `转盘第${spins + 1}次：线索券暂无可用的坏人线索，补偿2筹码。`;
        }
      } else if (item.key === 'reform') {
        if (actor.faction === 'bad') {
          actor.faction = 'good';
          actor.hp = 1;
          actor.skills = makeSkills('good');
          resultText = `转盘第${spins + 1}次：洗心革面券，你由坏人转换为好人。`;
        } else {
          actor.exploration.chips += 2;
          resultText = `转盘第${spins + 1}次：洗心革面券（无效果），补偿2筹码。`;
        }
      } else {
        // rebirth：重新随机身份特征（颜色、隐藏属性、S-ID），并重置公开状态。
        actor.colors = randomColors();
        actor.traits = randomTraits();
        actor.sid = makeSidState();
        actor.traitPublic = { saying: false, food: false, sport: false };
        log('一名玩家的身份特征被重新随机。');
        resultText = `转盘第${spins + 1}次：轮回券，你的身份特征已重新随机。`;
      }
      actor.games.wheelSpins[entity.id] = spins + 1;
      award(actor, 'wheelPrize');
      actor.games.lastResult = resultText;
      // reform 可能造成坏人全灭，转盘结算后立即判定。
      checkFinish(now());
      extra = { wheel: { slots: pool, slotIndex, item }, cost, spins: spins + 1, faction: actor.faction, prize: item.kind === 'chips' ? item.amount : null };
    } else if (body.kind === 'rpsInvite') {
      if (!validChoice(body.choice)) return fail('出拳必须是 rock、paper 或 scissors');
      const target = typeof body.targetId === 'number' || typeof body.targetId === 'string' && body.targetId.trim()
        ? find(Number(body.targetId)) : null;
      const reason = rpsValidation(actor, target);
      if (reason) return fail(reason);
      if (actor.games.rpsPending || target.games.rpsPending) return fail('参与者已有待回应的猜拳');
      if (t < actor.games.rpsUntil || t < target.games.rpsUntil) return fail('猜拳冷却中');
      const challenge = { id: randomUUID(), fromId: actor.id, toId: target.id, choice: body.choice,
        expiresAt: t + playConfig.rpsTimeoutMs };
      room.challenges.set(challenge.id, challenge);
      const metadata = { id: challenge.id, fromId: actor.id, fromName: actor.name, toId: target.id,
        toName: target.name, expiresAt: challenge.expiresAt };
      actor.games.rpsPending = { ...metadata, role: 'from' };
      target.games.rpsPending = { ...metadata, role: 'to' };
      actor.games.lastResult = `已邀请${target.name}猜拳，出拳已锁定，等待对方回应。`;
      target.games.lastResult = `${actor.name}邀请你猜拳，可自愿回应或取消。`;
    } else if (body.kind === 'rpsReply' || body.kind === 'rpsCancel') {
      const challenge = room.challenges.get(body.challengeId);
      if (!challenge) return fail('猜拳邀请不存在或已结束');
      if (actor.id !== challenge.fromId && actor.id !== challenge.toId) return fail('无权操作他人的猜拳');
      if (body.kind === 'rpsCancel') {
        closeChallenge(challenge, t, () => '猜拳已取消，不扣筹码。');
      } else {
        if (actor.id !== challenge.toId) return fail('只有被邀请者可以回应');
        if (!validChoice(body.choice)) return fail('出拳必须是 rock、paper 或 scissors');
        const from = find(challenge.fromId), to = find(challenge.toId);
        const reason = rpsValidation(from, to);
        if (reason) {
          closeChallenge(challenge, t, () => `猜拳已取消：${reason}，不扣筹码。`);
          room.processed.set(commandId, t);
          return fail(actor.games.lastResult);
        }
        const delta = WORLD.rpsOutcome(challenge.choice, body.choice) * playConfig.rpsStake;
        from.exploration.chips += delta;
        to.exploration.chips -= delta;
        if (delta > 0) { award(from, 'rpsWin'); award(to, 'rpsLose'); }
        else if (delta < 0) { award(to, 'rpsWin'); award(from, 'rpsLose'); }
        else { award(from, 'rpsDraw'); award(to, 'rpsDraw'); }
        const labels = { rock: '石头', paper: '布', scissors: '剪刀' };
        closeChallenge(challenge, t, p => {
          const isFrom = p.id === from.id, change = isFrom ? delta : -delta;
          return `猜拳结算：你出${labels[isFrom ? challenge.choice : body.choice]}，${isFrom ? to.name : from.name}出${labels[isFrom ? body.choice : challenge.choice]}；${change === 0 ? '平局' : change > 0 ? '你获胜' : '你落败'}，筹码${change > 0 ? '+' : ''}${change}。`;
        });
        extra = { delta: -delta };
      }
    } else return fail('未知小游戏');
    room.processed.set(commandId, t);
    return mechanicsResponse(actor, true, actor.games.lastResult, extra);
  }
  function attack(sessionId, body) {
    const t = now();
    syncRoom(t);
    checkFinish(t);
    const actor = playerBySession(sessionId);
    const fail = reason => mechanicsResponse(actor, false, reason);
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，攻击已冻结');
    if (!actor.alive) return fail('你已淘汰，不能攻击');
    if (!actor.online) return fail('你不在线，不能攻击');
    if (movementLocked(actor, t)) return fail('你正在眩晕或僵直，暂时不能攻击');
    if (!body || typeof body !== 'object') return fail('攻击指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    if (t < actor.combat.attackUntil) return fail('攻击冷却中');
    let target = null, nearest = Infinity;
    for (const p of room.players) {
      if (p.id === actor.id || !p.alive || !p.online || movementLocked(p, t)) continue;
      const dx = p.x - actor.x, dy = p.y - actor.y, distance = Math.hypot(dx, dy);
      if (distance > playConfig.attackRange || distance >= nearest) continue;
      if (distance && (dx * actor.combat.facing.x + dy * actor.combat.facing.y) / distance < playConfig.attackConeCos) continue;
      if (!WORLD.lineClear(actor, p, furniture) || WORLD.coverFor(p, furniture)) continue;
      target = p;
      nearest = distance;
    }
    room.processed.set(commandId, t);
    actor.combat.lastAttackAt = t;
    actor.combat.attackUntil = t + playConfig.attackCooldownMs;
    let resultText = '攻击空挥，未命中目标，进入12秒冷却。';
    if (target) {
      target.combat.stunUntil = t + playConfig.stunMs;
      target.combat.freezeUntil = t + playConfig.freezeMs;
      target.input = { up: false, down: false, left: false, right: false };
      award(actor, 'interactHit');
      resultText = `互动命中${target.name}：眩晕0.8秒 / 僵直1秒，无伤害。`;
    }
    return mechanicsResponse(actor, true, resultText, target ? { hitId: target.id } : {});
  }
  function reset() {
    room.players = [];
    room.logs = [];
    room.eliminateEvents = 0;
    room.finished = false;
    room.finishReason = '';
    room.ranking = null;
    room.startedAt = now();
    room.sessions.clear();
    room.processed.clear();
    room.challenges.clear();
    room.pending.clear();
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
    log('办公室已重置：等待玩家加入。');
  }
  function finish() {
    if (room.finished) return;
    room.finished = true;
    room.finishReason = 'host';
    room.ranking = null;
    syncRoom(now());
    log('游戏已结束：主持人结束了游戏。');
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
  }
  return {
    room, streams, now, join, setOffline, setIntent, step, useSkill, interact, play, attack, ack,
    publicSnapshot, privateSnapshot, privateProjection, publicProjection, reset, finish,
    playerBySession, find, config: SKILL_CONFIG
  };
}
module.exports = { createRoom, SKILL_CONFIG, WORLD };
