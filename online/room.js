'use strict';
// Authoritative room state. Server-only module.
// Everything that decides the game (position, skill resolution, public state,
// elimination, finish) is computed here. Clients only submit intents and render.
const { randomUUID } = require('crypto');
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

function createRoom() {
  const room = {
    players: [],
    logs: [],
    eliminateEvents: 0,
    finished: false,
    startedAt: Date.now(),
    sessions: new Map(),
    processed: new Map(),
    pending: new Map(),
    clockOffset: 0
  };
  const furniture = WORLD.makeFurniture();
  const now = () => Date.now() + room.clockOffset;
  const streams = new Map();

  function collides(x, y) {
    return furniture.some(f => x + WORLD.BODY_HALF > f.x && x - WORLD.BODY_HALF < f.x + f.w &&
      y + WORLD.FOOT_TOP > f.y && y - WORLD.FOOT_BOTTOM < f.y + f.h);
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
    if (room.finished) return { error: '本局已结束，无法加入' };
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
      x: 430 + (id * 211) % 3000,
      y: id % 2 ? 450 : 340,
      online: true,
      lastSeen: t,
      sessionId,
      input: { up: false, down: false, left: false, right: false },
      walk: 0,
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
  function setIntent(id, input) {
    if (!room.finished) {
      const p = find(id);
      if (p) p.input = { up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right };
    }
  }
  function step(dt) {
    if (room.finished) return;
    const t = now();
    for (const p of room.players) {
      if (!p.alive || !p.online) continue;
      let dx = Number(p.input.right) - Number(p.input.left);
      let dy = Number(p.input.down) - Number(p.input.up);
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      dx = dx / len * WORLD.SPEED * dt;
      dy = dy / len * WORLD.SPEED * dt;
      const nx = Math.max(WORLD.MIN_X, Math.min(WORLD.MAX_X, p.x + dx));
      if (!collides(nx, p.y)) p.x = nx;
      const ny = Math.max(WORLD.MIN_Y, Math.min(WORLD.MAX_Y, p.y + dy));
      if (!collides(p.x, ny)) p.y = ny;
      p.walk += Math.hypot(nx - p.x, ny - p.y) ? Math.hypot(dx, dy) : 0;
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
      x: p.x,
      y: p.y,
      colors: p.colors,
      traits: Object.fromEntries(Object.keys(p.traits).map(k => [k, p.traitPublic[k] ? p.traits[k] : WORLD.MASK])),
      sid: p.sid.segments.map((s, i) => p.sid.revealed[i] ? s : WORLD.MASK).join('-')
    };
  }
  function privateProjection(p) {
    const t = now();
    syncCharges(p, t);
    return {
      id: p.id,
      name: p.name,
      faction: p.faction,
      sid: p.sid.segments.join('-'),
      hp: p.hp,
      alive: p.alive,
      traits: p.traits,
      skills: Object.fromEntries(Object.entries(p.skills).map(([id, skill]) => [id, { ...skill }])),
      pending: (room.pending.get(p.id) || []).map(projectEvent)
    };
  }
  function publicSnapshot() {
    return {
      type: 'snapshot',
      serverTime: now(),
      finished: room.finished,
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
  function checkFinish() {
    if (room.finished) return;
    // At least one elimination is required: otherwise the second player joining would
    // immediately drop the alive count to 2 and finish the very first round.
    if (room.players.filter(p => p.alive).length <= 2 && room.eliminateEvents > 0) {
      room.finished = true;
      log('本局已结束：存活人数已降到2人。');
    }
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
    if (room.finished) return reject('本局已结束，技能已冻结');
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
      if (room.processed.size > 3000) {
        for (const [key, at] of room.processed) if (t - at > 600000) room.processed.delete(key);
      }
    }
    return resolved;
  }
  function reset() {
    room.players = [];
    room.logs = [];
    room.eliminateEvents = 0;
    room.finished = false;
    room.startedAt = now();
    room.sessions.clear();
    room.processed.clear();
    room.pending.clear();
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
    log('办公室已重置：等待玩家加入。');
  }
  function finish() {
    if (room.finished) return;
    room.finished = true;
    log('本局已结束：主持人结束了本局。');
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
  }
  return {
    room, streams, now, join, setOffline, setIntent, step, useSkill, ack,
    publicSnapshot, privateSnapshot, privateProjection, publicProjection, reset, finish,
    playerBySession, find, config: SKILL_CONFIG
  };
}
module.exports = { createRoom, SKILL_CONFIG, WORLD };
