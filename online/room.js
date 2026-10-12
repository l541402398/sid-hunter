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
  // ---- 肢体互动纯函数（跳跃 / 锤子）----
  // 全部是纯函数：只读玩家状态与时间戳，不写状态、不记日志、不改任何玩法字段。
  const A = WORLD.ACTION;
  // 跳跃进度 0~1；未跳跃或已落地都返回 0。
  function jumpProgress(p, t) {
    if (!p || !p.jumpStartedAt) return 0;
    const k = (t - p.jumpStartedAt) / A.jumpMs;
    if (k <= 0 || k >= 1) return 0;
    return k;
  }
  // 抛物线高度，落地为 0。取整避免快照里出现长小数。
  function heightOf(p, t) {
    const k = jumpProgress(p, t);
    if (!k) return 0;
    return Math.round(4 * A.jumpHeight * k * (1 - k));
  }
  // 腾空窗口内才躲得开锤子；起跳与落地的边缘帧仍算站在地面。
  function airborne(p, t) {
    const k = jumpProgress(p, t);
    return k >= A.jumpDodgeFrom && k <= A.jumpDodgeTo;
  }
  // 过期肿包出队；bumpMax 保留剩余肿包中最晚到期的时间戳，供渲染层做淡出。
  function expireBumps(p, t) {
    if (!p.bumps.length) { p.bumpMax = 0; return; }
    p.bumps = p.bumps.filter(b => b.expiresAt > t);
    p.bumpMax = p.bumps.reduce((m, b) => Math.max(m, b.expiresAt), 0);
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
      skills: makeSkills(faction),
      // 肢体互动状态。纯表播字段，不参与血量 / S-ID / 技能 / 淘汰结算。
      jumpStartedAt: 0,
      stunUntil: 0,
      bumps: [],
      bumpMax: 0,
      hammerCooldownUntil: 0,
      lastSwingAt: 0,
      lastHitAt: 0
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
  // 开发用 NPC：真玩家（进 room.players、占 id、进公共快照与名单），这样单人也能把
  // 探查 / 指认 / 刺探 / 击杀 / 锤击整条流程走通。
  // 因此它必然计入 aliveCount 与 checkFinish——这是既有规则的必然结果，不是新规则：
  // 开发时击杀 NPC 可能直接把存活人数打到 2 触发结束，重置即可，不要以为是 bug。
  // 约束：阵营恒为 good（永不坏人）；不进 room.sessions（永不能被昵称或会话认领）；
  // 不写公共日志；纯站立（input 全 false，不漫游、不跳、不挥锤、不用技能）。
  function npcSpot(near, i) {
    // 基准 50 而不是 60：锤击范围是 58px，50 保证刚加进来的 NPC 就在手边，不用先走两步。
    const sign = i % 2 ? 1 : -1, step = 50 + Math.floor(i / 2) * 40;
    const clampX = v => Math.max(WORLD.MIN_X, Math.min(WORLD.MAX_X, v));
    const clampY = v => Math.max(WORLD.MIN_Y, Math.min(WORLD.MAX_Y, v));
    const baseX = clampX(near.x + sign * step), baseY = clampY(near.y + (i % 4 < 2 ? 12 : -12));
    for (let k = 0; k < 16; k++) {
      const x = clampX(baseX + (k % 4) * 6), y = clampY(baseY + Math.floor(k / 4) * 6);
      if (!collides(x, y)) return { x, y };
    }
    return { x: clampX(near.x), y: clampY(near.y) };
  }
  function spawnNpc(count, near) {
    const n = Math.max(1, Math.min(5, Math.floor(Number(count) || 1)));
    const made = [];
    for (let i = 0; i < n; i++) {
      const id = room.players.length;
      const raw = 'NPC·' + pick(NAME_POOL);
      const name = room.players.some(p => p.name === raw) ? uniqueName(raw) : raw;
      const spot = npcSpot(near || { x: 430, y: 340 }, i);
      const player = {
        id,
        name,
        colors: randomColors(),
        traits: randomTraits(),
        traitPublic: { saying: false, food: false, sport: false },
        sid: makeSidState(),
        faction: 'good', // NPC 恒为好人，永不当坏人
        hp: 1,
        alive: true,
        x: spot.x,
        y: spot.y,
        online: true, // NPC 永远在线，没有流也就不会进离线扫描
        lastSeen: now(),
        sessionId: null, // 永不能被昵称或会话认领
        npc: true,
        input: { up: false, down: false, left: false, right: false },
        walk: 0,
        skills: makeSkills('good'),
        jumpStartedAt: 0, stunUntil: 0, bumps: [], bumpMax: 0,
        hammerCooldownUntil: 0, lastSwingAt: 0, lastHitAt: 0
      };
      room.players.push(player);
      room.pending.set(id, []);
      // 完整 S-ID 只回给这台本机授权会话，不进公共投影、不写公共日志。
      made.push({ id: player.id, name: player.name, sid: player.sid.segments.join('-'), x: player.x, y: player.y });
    }
    return made;
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
      expireBumps(p, t);
      // 被敲晕者与淘汰 / 离线一样原地不动；stunUntil 是绝对时间戳，离线或淘汰期间也会自然到期。
      const stunned = t < p.stunUntil;
      if (!p.alive || !p.online || stunned) continue;
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
  // 肢体互动字段只在「亲眼可见」时下发：锤戏是互动感，不是公共信息。
  // 摄像机横向跟随自己：camX = clamp(x - VIEW_W/2, 0, WORLD_W - VIEW_W)，左右各留 VIEW_MARGIN 余量。
  // 纵向地图只有一屏高（640），不做纵向裁剪。自己永远看得见自己的状态。
  // 不传 viewerId 时一律可见（服务端内部拼日志文案用，只读 sid，不涉及锤戏字段）。
  // 余量必须大于「客户端绘制余量 40」+「插值 / 瞬移 / 切后台导致的两端镜头误差」。
  // 客户端用插值后的渲染 x 算镜头，服务端用权威 x，稳态差约 13px，但卡顿或瞬移会瞬间拉大，
  // 余量取 140 就是为了在任何情况下都不会出现"人在屏幕上但锤戏字段被抹成 0"的穿帮。
  const VIEW_MARGIN = 140;
  function cameraXOf(viewer) {
    return Math.max(0, Math.min(WORLD.WORLD_W - WORLD.VIEW_W, viewer.x - WORLD.VIEW_W / 2));
  }
  // viewer / camX 由 publicSnapshot 算一次传进来，避免每个玩家都线性查一遍观察者。
  function visibleTo(viewer, camX, target) {
    if (!viewer || viewer.id === target.id) return true;
    return target.x >= camX - VIEW_MARGIN && target.x <= camX + WORLD.VIEW_W + VIEW_MARGIN;
  }
  // 裁剪契约（改动前先读这段）：
  // 1. 不可见即把锤戏字段置 0，并额外下发 visible:false；数值字段保持 0 而不是 null，
  //    这样客户端永远不必判空。visible 是唯一的语义开关——0 表示"看不见"，不是"真的没晕"。
  // 2. 可见区间 ±140 严格宽于客户端绘制区间 ±40，所以任何被画出来的角色拿到的都是真实值，
  //    不会出现"人在屏幕上但肿包/锤子被抹成 0"的穿帮。
  // 3. 被裁剪的只有锤戏局部表现字段（z/stunUntil/bumps/bumpUntil/swingAt/hitAt）；
  //    公共日志、S-ID、存活、位置、颜色、已公开属性对所有视角完全一致，不随观察者变化。
  // 只追加画面必需的肢体互动字段；阵营 / 血量 / 技能 / 锤击者身份一律不进入公共投影。
  function publicProjection(p, viewer, camX) {
    const t = now();
    expireBumps(p, t);
    const seen = visibleTo(viewer, camX, p);
    return {
      id: p.id,
      name: p.name,
      alive: p.alive,
      online: p.online,
      x: p.x,
      y: p.y,
      colors: p.colors,
      traits: Object.fromEntries(Object.keys(p.traits).map(k => [k, p.traitPublic[k] ? p.traits[k] : WORLD.MASK])),
      sid: p.sid.segments.map((s, i) => p.sid.revealed[i] ? s : WORLD.MASK).join('-'),
      // 看不见的人：字段仍在，但一律归零，屏幕外推不出任何锤戏事实。
      visible: seen,
      z: seen ? heightOf(p, t) : 0,
      stunUntil: seen ? p.stunUntil : 0,
      bumps: seen ? Math.min(p.bumps.length, A.maxBumps) : 0,
      bumpUntil: seen ? p.bumpMax : 0,
      swingAt: seen ? p.lastSwingAt : 0,
      hitAt: seen ? p.lastHitAt : 0
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
  // viewerId 可选：传入后 players 里的肢体互动字段按该观察者的镜头裁剪。
  // 每条 SSE 流本来就各自拼一份 payload，所以这里只是让公有部分带视角，广播机制不变。
  function publicSnapshot(viewerId) {
    const viewer = viewerId === undefined || viewerId === null ? null : find(viewerId);
    const camX = viewer ? cameraXOf(viewer) : 0;
    return {
      type: 'snapshot',
      serverTime: now(),
      finished: room.finished,
      aliveCount: room.players.filter(p => p.alive).length,
      players: room.players.map(p => publicProjection(p, viewer, camX)),
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
  // 肢体互动：跳跃 / 挥锤。服务端权威，客户端只提交 kind，不自行判定命中或击晕。
  // 刻意与技能系统完全隔离：不扣血、不公开 S-ID、不消耗技能次数、不写公共日志。
  function performAction(id, kind) {
    const t = now();
    if (room.finished) return reject('本局已结束，动作已冻结');
    const actor = find(Number(id));
    if (!actor) return reject('身份无效，请重新加入');
    if (!actor.alive) return reject('你已淘汰，不能做动作');
    if (t < actor.stunUntil) return reject('你还被敲晕着');
    if (kind === 'jump') {
      // 已在空中（进度严格落在 0~1 之间）就不能二段跳。
      const k = (t - actor.jumpStartedAt) / A.jumpMs;
      if (actor.jumpStartedAt && k > 0 && k < 1) return reject('你还在空中');
      actor.jumpStartedAt = t;
      return { ok: true, kind: 'jump' };
    }
    if (kind !== 'hammer') return reject('未知动作');
    if (t < actor.hammerCooldownUntil) return reject('锤子还没抡回来');
    // 无论是否命中都进入冷却：空挥同样要等锤子抡回来。
    actor.hammerCooldownUntil = t + A.hammerCooldownMs;
    actor.lastSwingAt = t;
    let best = null, bestDist = Infinity;
    for (const q of room.players) {
      if (q.id === actor.id || !q.alive) continue;
      // 离线者沿用既有约定：可被作用，效果一致。
      const dist = Math.hypot(q.x - actor.x, q.y - actor.y);
      if (dist > A.hammerRange || dist >= bestDist) continue;
      if (airborne(q, t)) continue; // 腾空窗口内的人躲开了这一锤
      best = q; bestDist = dist;
    }
    if (!best) return { ok: true, kind: 'hammer', targetId: null, hit: false };
    best.stunUntil = t + A.stunMs;
    best.lastHitAt = t;
    best.bumps.push({ expiresAt: t + A.bumpMs });
    if (best.bumps.length > A.maxBumps) best.bumps.shift();
    best.bumpMax = best.bumps.reduce((m, b) => Math.max(m, b.expiresAt), 0);
    return { ok: true, kind: 'hammer', targetId: best.id, hit: true };
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
    room, streams, now, join, setOffline, setIntent, step, useSkill, performAction, spawnNpc, ack,
    publicSnapshot, privateSnapshot, privateProjection, publicProjection, reset, finish,
    playerBySession, find, config: SKILL_CONFIG
  };
}
module.exports = { createRoom, SKILL_CONFIG, WORLD };
