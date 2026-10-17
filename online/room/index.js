'use strict';
// Authoritative room state. Server-only module.
// Everything that decides the game (position, skill resolution, public state,
// elimination, finish) is computed here. Clients only submit intents and render.
const { randomUUID, randomInt } = require('crypto');
const WORLD = require('../shared/world.js');
const { defaultFeatures, sanitizeFeatures } = require('../server/features.js');
const { createMinigames } = require('./minigames.js');
const SPIRE = require('../shared/world/spire.js');

// Charge interval is a build-time switch: 90s for the LAN playtest build, 20 minutes
// for the real game. Change ONLY this constant when shipping the正式版; all charge
// logic reads it from here and nothing else hardcodes a recovery duration.
const { createBadPool } = require('./badpool.js');
const { createDigest } = require('./digest.js');
const { createEvents } = require('./events.js');
const charges = require('./charges.js');
const {
  SKILL_CONFIG, EXPLORATION_REWARDS, SEG_CHARS, NAME_POOL, TRAIT_POOL,
  pick, randChar, randomSid, randomColors, randomTraits
} = require('./config.js');

// 可见性分层开关：默认关闭，压测达标后再打开。
const AOI_ENABLED = process.env.SID_AOI === '1';
const SKINS_SPLIT = process.env.SID_SKINS === '1';
const LOD_ENABLED = process.env.SID_LOD === '1';
// AOI 半径（世界像素）：只同步视野附近 ±1 屏的人；纵向按 0.6 收缩（斜俯视）。
const AOI_RADIUS = Number(process.env.SID_AOI_RADIUS) > 0 ? Number(process.env.SID_AOI_RADIUS) : Math.round(WORLD.VIEW_W / 2);
function createRoom(options = {}) {
  const wheelRandomInt = options.randomInt || randomInt;
  // dev 分支并入的可注入随机源：只影响「探查公开哪一项未公开属性」。
  // 未注入时保持 main 的确定性顺序（第一个未公开项），注入后按注入源随机选择，便于自测。
  const random = typeof options.random === 'function' ? options.random : null;
  const playConfig = WORLD.PLAY_CONFIG;
  // 结束规则默认取 WORLD.RULES；测试可通过 options.rules 覆盖（如小房间活人阈值）。
  const rules = { ...WORLD.RULES, ...(options.rules || {}) };
  const room = {
    // 功能开关：管理页可随时开关（见 server/features.js）。默认全开，未配置时行为与以前一致。
    features: sanitizeFeatures(options && options.features, defaultFeatures()),
    players: [],
    // 卡牌对决（spire）：每人一局，单人闯三关，不占用坦克的双人对局表。
    spireBattles: new Map(),
    logs: [],
    eliminateEvents: 0,
    finished: false,
    finishReason: '',
    ranking: null,
    // 上一局结算快照：结束瞬间写入，reset 不会清掉，管理页/重开流程据此读取上局排名。
    lastResult: null,
    startedAt: Date.now(),
    sessions: new Map(),
    processed: new Map(),
    challenges: new Map(),
    pending: new Map(),
    clockOffset: 0,
    // 换层幂等凭据：键为 roundId+sessionId+commandId，成功 key 与 payload 绑定。
    // 独立于 processed（技能/J 的成功 nonce 表），reset 清空。
    floorReceipts: new Map(),
    glassDoors: {},
    // 搜打撤式物品格搜索：会话只在服务端内存里，键 sessionId → {playerId, containerId, floorId, zoneId,
    // plan, revealed:Set, taken:Set, createdAt, lastAt}。reset 清空。绝不进入公共快照。
    searchSessions: new Map(),
    searchSeq: 0,
    roundId: randomUUID()
  };
  // 多日长局恢复：从 SQLite 快照把玩家与会话原样塞回来（NPC 不落盘，重启后由 dev 钩子重新生成）。
  if (options && options.restore) {
    const r = options.restore;
    if (Array.isArray(r.players) && r.players.length) {
      room.players = r.players.filter(p => p && !p.npc);
      if (Number.isFinite(r.startedAt)) room.startedAt = r.startedAt;
      if (typeof r.roundId === 'string' && r.roundId) room.roundId = r.roundId;
      for (const entry of (Array.isArray(r.sessions) ? r.sessions : [])) {
        if (Array.isArray(entry) && typeof entry[0] === 'string') room.sessions.set(entry[0], Number(entry[1]));
      }
      for (const p of room.players) {
        // 重启后一律视为离线：等浏览器带着会话令牌重连时再置回在线。
        p.online = false;
        p.lastSeen = 0;
        p.sessionId = p.sessionId || null;
        if (!room.pending.has(p.id)) room.pending.set(p.id, []);
      }
    }
  }
  // 楼层查询：家具/墙体碰撞一律按玩家当前层取，服务端与两端共享同一份世界数据。
  const floorFurniture = floorId => WORLD.floorById(floorId).furniture;
  const floorBlockers = floorId => WORLD.floorBlockers(floorId, room.glassDoors[floorId] || {});
  // ---------- 独立小房间（需求①）：空间键 = floorId + zoneId ----------
  // zoneId 为 null 表示"楼层公共空间（走廊/大厅）"，否则是 online/shared/world/rooms.js 里的房间 ID。
  // 判定一律用这两个函数，避免各处散落 `p.zoneId === actor.zoneId` 漏判。
  const sameZone = (a, b) => a && b && a.floorId === b.floorId && (a.zoneId || null) === (b.zoneId || null);
  function zoneIdOf(p) { return (p && p.zoneId) || null; }
  function zoneBlockersOf(p) {
    const z = zoneIdOf(p);
    return z ? WORLD.roomBlockers(z) : floorBlockers(p.floorId);
  }
  function zoneCollides(p, x, y) {
    const z = zoneIdOf(p);
    return z ? WORLD.roomCollides(z, x, y) : collides(x, y, p.floorId);
  }
  function zoneBoundsOf(p) {
    const z = zoneIdOf(p);
    return z ? WORLD.roomBounds(z) : WORLD.floorBounds(p.floorId);
  }
  function updateGlassDoors(t) {
    for (const f of Object.values(WORLD.FLOORS)) room.glassDoors[f.id] = WORLD.advanceGlassDoors(f.id, room.glassDoors[f.id] || {}, room.players, t);
  }
  const now = () => Date.now() + room.clockOffset;
  const streams = new Map();

  // ---------- 子系统装配（room/*）：各自持有状态，通过显式注入交互 ----------
  const badPool = createBadPool({ room, randomInt, randomUUID });
  const digest = createDigest({ randomUUID, find });
  const events = createEvents({ room, now, randomUUID });
  // 兼容原调用点：保留同名薄包装，子系统函数体不再与 createRoom 闭包绑定。
  const registerBadSlot = p => badPool.register(p);
  const anonymousBadSlots = () => badPool.list();
  const hitLedger = p => digest.ledgerFor(p);
  const countOfflineHit = (p, kind) => digest.count(p, kind);
  const prepareReconnect = p => digest.prepareReconnect(p);
  const consumeCharge = (skill, t) => charges.consume(skill, t);
  function syncCharges(player, t) { return charges.sync(player, t, room.finished); }
  function freezeSkills(player, t) { return charges.freeze(player, t, room.finished); }
  function freezeRoom(t) {
    if (room.finished) return;
    for (const player of room.players) charges.freeze(player, t, room.finished);
    room.finished = true;
  }
  const log = text => events.log(text);
  const queueEvent = (playerId, event) => events.queue(playerId, event);
  const projectEvent = event => events.project(event);

  // ========== dev 分支并入：肢体互动纯函数（跳跃 / 挥锤 / 幽灵吓人） ==========
  // 全部是纯函数或只写表播字段：不扣血、不公开 S-ID、不消耗技能次数、不写公共日志。
  const A = WORLD.ACTION;
  function jumpProgress(p, t) {
    if (!p || !p.jumpStartedAt) return 0;
    const k = (t - p.jumpStartedAt) / A.jumpMs;
    if (k <= 0 || k >= 1) return 0;
    return k;
  }
  function heightOf(p, t) {
    const k = jumpProgress(p, t);
    if (!k) return 0;
    return Math.round(4 * A.jumpHeight * k * (1 - k));
  }
  function airborne(p, t) {
    const k = jumpProgress(p, t);
    return k >= A.jumpDodgeFrom && k <= A.jumpDodgeTo;
  }
  function expireBumps(p, t) {
    if (!p.bumps.length) { p.bumpMax = 0; return; }
    p.bumps = p.bumps.filter(b => b.expiresAt > t);
    p.bumpMax = p.bumps.reduce((m, b) => Math.max(m, b.expiresAt), 0);
  }
  // 肢体互动字段只在「亲眼可见」时下发：阶段3 起每层楼板加宽到 1440×400（大于 VIEW_W=960），
  // 相机裁剪不再退化为「同层即可见」，而是按该层实际宽度做横向视口裁剪（纵向仍整层可见）。
  // 不传 viewerId 时一律可见（服务端内部拼日志文案用，只读 sid，不涉及锤戏字段）。
  const VIEW_MARGIN = 140;
  function cameraXOf(viewer) {
    // 房间内不需要横向滚动（房间比视口小），cameraBounds 会居中。
    return WORLD.zoneCamera(viewer.floorId, viewer.zoneId || null, WORLD.VIEW_W, WORLD.VIEW_H, viewer.x, viewer.y).x;
  }
  function visibleTo(viewer, camX, target) {
    if (!viewer || viewer.id === target.id) return true;
    if (viewer.floorId !== target.floorId) return false;
    // 需求①：独立空间内的人只对同一空间内的人可见（走廊看不到房间里，房间也看不到走廊）。
    if ((viewer.zoneId || null) !== (target.zoneId || null)) return false;
    return target.x >= camX - VIEW_MARGIN && target.x <= camX + WORLD.VIEW_W + VIEW_MARGIN;
  }
  // 结束后表播过期的结算水位（dev 分支并入）：同一时间戳只结算一次肿包过期。
  let finishedExpiryAt = -Infinity;
  function displayName(name, fallback) {
    const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    const text = [...clean(name)].slice(0, 32).join('');
    return text || [...clean(fallback)].slice(0, 32).join('') || '玩家';
  }
  function bindSession(player, sessionId) {
    if (player.sessionId && player.sessionId !== sessionId) room.sessions.delete(player.sessionId);
    player.sessionId = sessionId;
    player.online = true;
    player.lastSeen = now();
    room.sessions.set(sessionId, player.id);
  }
  function playerByEmpNo(empNo) {
    if (!empNo) return null;
    const key = String(empNo);
    return room.players.find(p => p.empNo === key) || null;
  }

  function collides(x, y, floorId) {
    // floorBlockers(floorId) 已经带上该层的玻璃门状态（见本文件的 floorBlockers 定义）。
    return WORLD.floorCollides(floorId, x, y, floorBlockers(floorId));
  }
  // 落点安全判定：无碰撞、不在任何入口触发范围内、身体不被遮挡。服务端决定换层落点。
  function pointSafe(floorId, x, y) {
    if (WORLD.floorCollides(floorId, x, y, floorBlockers(floorId))) return false;
    for (const portal of WORLD.floorPortals(floorId)) {
      if (Math.hypot(x - portal.x, y - portal.y) <= WORLD.INTERACT_RANGE) return false;
    }
    if (WORLD.coverFor({ x, y }, floorBlockers(floorId))) return false;
    return true;
  }
  // 出生点：按 index 轮转安全池，跳过不安全的候选；全不安全时退回池内指定点（仍来自安全池构造）。
  function spawnPointFor(floorId, index) {
    const pool = WORLD.floorSpawns(floorId);
    const i = Math.abs(Math.floor(index)) % pool.length;
    for (let k = 0; k < pool.length; k++) {
      const p = pool[(i + k) % pool.length];
      if (pointSafe(floorId, p.x, p.y)) return { x: p.x, y: p.y };
    }
    return { x: pool[i].x, y: pool[i].y };
  }
  function safeLanding(floorId) {
    for (const p of WORLD.floorSpawns(floorId)) if (pointSafe(floorId, p.x, p.y)) return { x: p.x, y: p.y };
    return null;
  }
  function find(id) { return room.players.find(p => p.id === id); }
  function playerBySession(sid) {
    if (!sid) return null;
    const id = room.sessions.get(sid);
    return id === undefined ? null : find(id);
  }
  // 统一计分入口：所有行为只加分、绝不扣分，分值表来自 WORLD.SCORE。
  // ===== 成就点（与分数分开的第二条进度）=====
  // 用户定义：猜拳、淘汰玩家、玩小游戏等所有行为都给成就点；排行榜按「筹码」和「成就点」分别排。
  const ACHIEVEMENT = {
    search: 1, sell: 2, buy: 1, wheel: 2,
    rpsWin: 5, rpsDraw: 2, rpsLose: 1,
    hammer: 1, kill: 30, eliminated: 5, minigame: 8, minigameWin: 20
  };
  function gainAchievement(p, key, times = 1) {
    const base = ACHIEVEMENT[key] || 0;
    if (!base || !p.achievements) return 0;
    const add = base * Math.max(1, Math.floor(times));
    p.achievements.points += add;
    p.achievements.byKind[key] = (p.achievements.byKind[key] || 0) + add;
    return add;
  }
  const minigames = createMinigames({
    room, now, find, gainAchievement,
  });
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
  function makeSidState() {
    return { segments: randomSid(), revealed: [false, false, false] };
  }
  function uniqueName(name) {
    if (!room.players.some(p => p.name === name)) return name;
    let n = 2;
    while (room.players.some(p => p.name === `${name}${n}`)) n++;
    return `${name}${n}`;
  }
  function join(sessionId, nickname, identity) {
    const empNo = identity && identity.empNo ? String(identity.empNo) : '';
    if (empNo) {
      const bound = playerByEmpNo(empNo);
      if (bound) {
        // 同一工号回到原座位：不新开角色，也不改已经发下的阵营。
        bindSession(bound, sessionId);
        return { player: bound, revived: true };
      }
    }
    const existing = playerBySession(sessionId);
    if (existing) {
      if (empNo && existing.empNo && existing.empNo !== empNo) return { error: '身份凭证已绑定其他玩家' };
      // 只恢复身份；online 由流建立时置真，好让重连摘要先固化。
      existing.lastSeen = now();
      return { player: existing, revived: true };
    }
    if (room.finished) return { error: '游戏已结束，无法加入' };
    const t = now();
    const isFirst = room.players.length === 0;
    const faction = isFirst ? 'bad' : 'good';
    // 多日恢复后 id 不再等于数组下标：取现有最大 id + 1，避免重启后新玩家顶替旧身份。
    const id = room.players.reduce((m, q) => Math.max(m, Number(q.id) || 0), -1) + 1;
    const rawName = typeof nickname === 'string' ? nickname.trim().slice(0, 8) : '';
    const name = empNo ? uniqueName(displayName(identity.name, empNo)) : uniqueName(rawName || pick(NAME_POOL));
    // 新玩家统一在 1F 安全出生池（按 id 轮转）；每个点都已校验无碰撞、无遮挡、不在入口触发范围内。
    const spawn = spawnPointFor(1, id);
    const player = {
      id,
      name,
      empNo: empNo || null,
      colors: randomColors(),
      traits: randomTraits(),
      traitPublic: { saying: false, food: false, sport: false },
      sid: makeSidState(),
      faction,
      hp: faction === 'bad' ? 2 : 1,
      alive: true,
      score: 0,
      x: spawn.x,
      y: spawn.y,
      floorId: 1,
      floorRevision: 0,
      // 需求①：当前所处空间。null = 楼层公共空间；房间 ID = 独立空间内（由 enterZone 设置）。
      zoneId: null,
      // 进房前的楼层位置，退房时原样还原（"退出房间后位置还是处于进入的位置"）。
      zoneReturn: null,
      online: true,
      lastSeen: t,
      sessionId,
      npc: false,
      input: { up: false, down: false, left: false, right: false },
      walk: 0,
      spriteFacing: 'front',
      exploration: { chips: 0, clues: [], searched: [], backpack: [], items: {} },
      buffs: { speedUntil: 0, shieldUntil: 0, focusNext: false },
      achievements: { points: 0, byKind: {} },
      games: { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '', rpsResult: null },
      combat: { facing: { x: 1, y: 0 }, lastAttackFacing: { x: 1, y: 0 }, lastAttackDirection: 'right', attackUntil: 0, lastAttackAt: 0, stunUntil: 0, freezeUntil: 0 },
      // 肢体互动状态（dev 分支并入）：纯表播字段，不参与血量 / S-ID / 技能 / 淘汰结算。
      jumpStartedAt: 0,
      stunUntil: 0,
      bumps: [],
      bumpMax: 0,
      hammerCooldownUntil: 0,
      lastSwingAt: 0,
      lastHitAt: 0,
      frightUntil: 0, scareCooldownUntil: 0, scareAt: 0, frightAt: 0,
      skillsFrozenAt: null, // dev 分支并入：淘汰/结束后的资源冻结时刻
      skills: makeSkills(faction)
    };
    room.players.push(player);
    registerBadSlot(player);
    room.sessions.set(sessionId, id);
    room.pending.set(id, []);
    log(`${player.name}加入了办公室。`);
    // Reconnect token: headless/embedded webviews do not always persist the HttpOnly
    // cookie across a browser restart, so the page keeps this in sessionStorage and
    // replays it as a header. Identity is still never claimable by nickname.
    return { player, revived: false, sessionToken: sessionId };
  }
  // 开发用 NPC（dev 分支并入）：真玩家（进 room.players、占 id、进公共快照与名单），
  // 这样单人也能把探查 / 指认 / 刺探 / 击杀 / 锤击整条流程走通。
  // 约束：阵营恒为 good；不进 room.sessions（永不能被会话或昵称认领）；不写公共日志；纯站立。
  function npcSpot(near, i, floorId) {
    const sign = i % 2 ? 1 : -1, step = 50 + Math.floor(i / 2) * 40;
    const bounds = WORLD.floorBounds(floorId);
    const clampX = v => Math.max(bounds.minX, Math.min(bounds.maxX, v));
    const clampY = v => Math.max(bounds.minY, Math.min(bounds.maxY, v));
    const baseX = clampX(near.x + sign * step), baseY = clampY(near.y + (i % 4 < 2 ? 12 : -12));
    for (let k = 0; k < 16; k++) {
      const x = clampX(baseX + (k % 4) * 6), y = clampY(baseY + Math.floor(k / 4) * 6);
      if (!collides(x, y, floorId) && pointSafe(floorId, x, y)) return { x, y };
    }
    return { x: clampX(near.x), y: clampY(near.y) };
  }
  function spawnNpc(count, near) {
    const n = Math.max(1, Math.min(5, Math.floor(Number(count) || 1)));
    const floorId = near && WORLD.floorById(near.floorId) ? near.floorId : 1;
    const made = [];
    for (let i = 0; i < n; i++) {
      // 多日恢复后 id 不再等于数组下标：取现有最大 id + 1，避免重启后新玩家顶替旧身份。
    const id = room.players.reduce((m, q) => Math.max(m, Number(q.id) || 0), -1) + 1;
      const raw = 'NPC·' + pick(NAME_POOL);
      const name = room.players.some(p => p.name === raw) ? uniqueName(raw) : raw;
      const spot = npcSpot(near || { x: 430, y: 340 }, i, floorId);
      const player = {
        id,
        name,
        empNo: null,
        colors: randomColors(),
        traits: randomTraits(),
        traitPublic: { saying: false, food: false, sport: false },
        sid: makeSidState(),
        faction: 'good', // NPC 恒为好人，永不当坏人
        hp: 1,
        alive: true,
        score: 0,
        x: spot.x,
        y: spot.y,
        floorId,
        floorRevision: 0,
        zoneId: null,       // NPC 永远在楼层公共空间，不进房间
        zoneReturn: null,
        online: true, // NPC 永远在线，没有流也就不会进离线扫描
        lastSeen: now(),
        sessionId: null, // 永不能被昵称或会话认领
        npc: true,
        input: { up: false, down: false, left: false, right: false },
        walk: 0,
        spriteFacing: 'front',
        exploration: { chips: 0, clues: [], searched: [], backpack: [], items: {} },
        buffs: { speedUntil: 0, shieldUntil: 0, focusNext: false },
        achievements: { points: 0, byKind: {} },
        games: { wheelSpins: {}, rpsPending: null, rpsUntil: 0, lastResult: '', rpsResult: null },
        combat: { facing: { x: 1, y: 0 }, lastAttackFacing: { x: 1, y: 0 }, lastAttackDirection: 'right', attackUntil: 0, lastAttackAt: 0, stunUntil: 0, freezeUntil: 0 },
        jumpStartedAt: 0, stunUntil: 0, bumps: [], bumpMax: 0,
        hammerCooldownUntil: 0, lastSwingAt: 0, lastHitAt: 0,
        frightUntil: 0, scareCooldownUntil: 0, scareAt: 0, frightAt: 0,
        skillsFrozenAt: null,
        skills: makeSkills('good')
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
    if (!p || p.npc) return;
    p.online = false;
    p.lastSeen = now();
    p.input = { up: false, down: false, left: false, right: false };
    // 任意断线立即取消其参与的猜拳，不扣筹码、不计分（结算需双方在线）。
    for (const ch of [...room.challenges.values()]) {
      if (ch.fromId === id || ch.toId === id) cancelChallenge(ch, now(), '参与者已离线');
    }
  }
  function movementLocked(p, t) {
    // 主分支的眩晕/僵直 + dev 分支锤晕 / 受惊共用同一把锁：任一未到期即锁定移动。
    return t < p.combat.stunUntil || t < p.combat.freezeUntil || t < (p.stunUntil || 0) || t < (p.frightUntil || 0);
  }
  function setIntent(id, input) {
    const p = find(id);
    if (!p || !input || typeof input !== 'object') return;
    // 拒绝旧楼层的迟到指令：换层前按住的移动意图不得驱动新层。只有客户端显式带了
    // roundId / expectedFloorRevision 且与当前不符时才按无效处理；dev 分支并入的旧客户端
    // 与自测只发方向键（没有这两个字段），按兼容放行，仍由 step 的硬控与楼层边界兜底。
    const hasRound = input.roundId !== undefined;
    const hasRevision = input.expectedFloorRevision !== undefined;
    if ((hasRound && input.roundId !== room.roundId) || (hasRevision && input.expectedFloorRevision !== p.floorRevision)) {
      p.input = { up: false, down: false, left: false, right: false };
      return false;
    }
    const intent = { up: !!input.up, down: !!input.down, left: !!input.left, right: !!input.right };
    if (!Object.values(intent).some(Boolean)) { p.input = intent; return true; }
    // 幽灵（已淘汰）仍可移动，但只有存活者才受硬控锁定（dev 分支并入）。
    if (room.finished || !p.online) return;
    if (p.alive && movementLocked(p, now())) {
      p.input = { up: false, down: false, left: false, right: false };
      return;
    }
    p.input = intent;
    const x = Number(intent.right) - Number(intent.left), y = Number(intent.down) - Number(intent.up);
    const length = Math.hypot(x, y);
    if (length) p.combat.facing = { x: x / length, y: y / length };
    return true;
  }
  function step(dt) {
    const t = now();
    checkFinish(t);
    syncRoom(t);
    if (room.finished) return;
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;
    updateGlassDoors(t);
    minigames.tick();
    for (const p of room.players) {
      expireBumps(p, t);
      if (p.npc) continue; // NPC 纯站立：不移动，但肿包照常过期
      if (!p.online) continue;
      // 淘汰者化为幽灵（dev 分支并入）：仍能移动、可穿家具与墙，但被硬控时不移动。
      const controlled = p.alive && movementLocked(p, t);
      if (controlled) {
        p.input = { up: false, down: false, left: false, right: false };
        continue;
      }
      let dx = Number(p.input.right) - Number(p.input.left);
      let dy = Number(p.input.down) - Number(p.input.up);
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      // 第二轮：疾行 buff —— 只在服务端生效，客户端看到的位移由快照驱动，无法伪造。
      const act = p.buffs && t < (p.buffs.speedUntil || 0) ? 1.45 : 1;
      const pass = WORLD.LOOT.passiveTotals(p.exploration.items || {});
      const speedMul = act * (1 + Math.min(40, pass.speed || 0) / 100);
      dx = dx / len * WORLD.SPEED * speedMul * dt;
      dy = dy / len * WORLD.SPEED * speedMul * dt;
      const oldX = p.x, oldY = p.y;
      // 需求①：房间内按房间几何裁剪/碰撞，走廊按楼层；幽灵仍可穿（既有行为保持）。
      const bounds = zoneBoundsOf(p);
      const nx = Math.max(bounds.minX, Math.min(bounds.maxX, p.x + dx));
      if (!p.alive || !zoneCollides(p, nx, p.y)) p.x = nx;
      const ny = Math.max(bounds.minY, Math.min(bounds.maxY, p.y + dy));
      if (!p.alive || !zoneCollides(p, p.x, ny)) p.y = ny;
      const actualDx = p.x - oldX, actualDy = p.y - oldY;
      const moved = Math.hypot(actualDx, actualDy);
      p.walk += moved;
      if (moved > 1e-6) p.spriteFacing = WORLD.spriteDirection(actualDx, actualDy, p.spriteFacing);
    }
  }
  function publicProjection(p, viewer, camX) {
    const t = now();
    // dev 分支并入：镜头外的肢体互动字段一律归零，visible 区分「裁剪产生的 0」与真实 0。
    const seen = visibleTo(viewer, camX, p);
    return {
      id: p.id,
      name: p.name,
      alive: p.alive,
      online: p.online,
      score: p.score,
      x: p.x,
      y: p.y,
      floorId: p.floorId,
      // 需求①：房间是独立空间。公开投影带 zoneId，客户端据此只渲染同一空间里的人；
      // 它本身不含任何私密数据（房间 ID 是公开地图信息）。
      zoneId: p.zoneId || null,
      spriteFacing: p.spriteFacing,
      facing: { ...p.combat.facing },
      lastAttackAt: p.combat.lastAttackAt,
      lastAttackFacing: { ...p.combat.lastAttackFacing },
      lastAttackDirection: p.combat.lastAttackDirection,
      stunUntil: Math.max(p.combat.stunUntil || 0, p.stunUntil || 0),
      freezeUntil: p.combat.freezeUntil,
      visible: seen,
      z: seen && p.alive ? heightOf(p, t) : 0,
      bumps: seen ? Math.min(p.bumps.length, A.maxBumps) : 0,
      bumpUntil: seen ? p.bumpMax : 0,
      swingAt: seen ? p.lastSwingAt : 0,
      hitAt: seen ? p.lastHitAt : 0,
      frightUntil: seen ? p.frightUntil : 0,
      scareAt: seen ? p.scareAt : 0,
      frightAt: seen ? p.frightAt : 0,
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
      floorId: p.floorId,
      floorRevision: p.floorRevision,
      floorName: WORLD.floorById(p.floorId).name,
      // 需求①：房间内额外下发房间名/尺寸，客户端据此切相机、画室内墙体与地板。
      zoneId: p.zoneId || null,
      zoneName: p.zoneId ? (WORLD.roomById(p.zoneId) || {}).name || '' : '',
      spriteFacing: p.spriteFacing,
      exploration: explorationProjection(p),
      // 需求③：只发给本人的战利品清单（不进公开投影、不进 exploration 的旧结构）。
      backpack: backpackProjection(p),
      // 第二轮：道具背包与限时 buff（只发给本人；buff 附带剩余毫秒供客户端画倒计时）。
      items: itemsProjection(p),
      buffs: buffsProjection(p),
      // 背包被动总加成（放在背包就生效；卖掉/用掉立刻消失）。
      passive: passiveProfile(p),
      achievement: { points: (p.achievements && p.achievements.points) || 0, byKind: { ...((p.achievements && p.achievements.byKind) || {}) } },
      games: gamesProjection(p),
      combat: combatProjection(p),
      skills: Object.fromEntries(Object.entries(p.skills).map(([id, skill]) => [id, { ...skill }])),
      skillsFrozenAt: p.skillsFrozenAt, // dev 分支并入：仅私密下发，公有不泄露
      pending: (room.pending.get(p.id) || []).map(projectEvent),
      // dev 分支并入：离线期间被敲 / 被鬼吓的次数，只在本人的私密摘要里，不写公共日志。
      interactionSummary: digest.summaryFor(p)
    };
  }
  function publicSnapshot(viewerId) {
    const t = now();
    checkFinish(t);
    syncRoom(t);
    // 本局结束后 step 不再跑，但表播用的肿包仍要安全过期：每个时间戳只结算一次。
    if (room.finished && t !== finishedExpiryAt) {
      for (const p of room.players) expireBumps(p, t);
      finishedExpiryAt = t;
    }
    const viewer = viewerId === undefined || viewerId === null ? null : find(viewerId);
    const camX = viewer ? cameraXOf(viewer) : 0;
    const fogActive = !!(viewer && !viewer.zoneId && WORLD.FLOOR_FOG && WORLD.FLOOR_FOG[viewer.floorId]);
    updateGlassDoors(t);
    minigames.tick();
    room._snapNo = (room._snapNo || 0) + 1;
    return {
      type: 'snapshot',
      serverTime: now(),
      roundId: room.roundId,
      finished: room.finished,
      finishReason: room.finishReason || null,
      ranking: room.ranking ? room.ranking.map(r => ({ ...r })) : null,
      rankingAchievement: room.rankingAchievement ? room.rankingAchievement.map(r => ({ ...r })) : null,
      // 进行中的成就榜（前 10）：不算私密数据，只暴露名字与点数。
      achievementLeaders: room.players.slice()
        .sort((a, b) => ((b.achievements && b.achievements.points) || 0) - ((a.achievements && a.achievements.points) || 0) || (a.id - b.id))
        .slice(0, 10)
        .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, points: (p.achievements && p.achievements.points) || 0, alive: p.alive })),
      rules: { endRemainingPlayers: rules.endRemainingPlayers, timeLimitMs: rules.timeLimitMs, endsAt: room.startedAt + rules.timeLimitMs, speed: WORLD.SPEED },
      floorList: WORLD.floorOptions(),
      // 功能开关随快照下发：客户端据此隐藏未开放的入口（服务端仍然会拒绝）。
      features: { ...room.features },
      glassDoors: viewer ? WORLD.floorById(viewer.floorId).glassDoors.map(d => ({ id: d.id, open: !!room.glassDoors[viewer.floorId][d.id].open })) : [],
      aliveCount: room.players.filter(p => p.alive).length,
      // SID_AOI=1 时只同步同层同区玩家（默认关闭，保证既有测试与现网行为不变）。
      // 战争迷雾层（5F）无条件按 FLOOR_FOG 半径裁剪：否则改客户端就能看到墙后的位置。
      players: (function projectPlayers() {
        const near = [], far = [];
        const fog = fogActive ? WORLD.FLOOR_FOG[viewer.floorId] : null;
        for (const p of room.players) {
          if (fog && p.id !== viewer.id) {
            const sameZone = (p.zoneId || null) === (viewer.zoneId || null);
            if (!sameZone || p.floorId !== viewer.floorId ||
              Math.hypot(p.x - viewer.x, p.y - viewer.y) > fog.radius) continue;
          }
          if (AOI_ENABLED && viewer) {
            const sameZone = (p.zoneId || null) === (viewer.zoneId || null);
            const sameFloor = p.floorId === viewer.floorId;
            const dx = Math.abs(p.x - viewer.x), dy = Math.abs(p.y - viewer.y);
            const inView = p.id === viewer.id || (dx <= AOI_RADIUS && dy <= AOI_RADIUS * 0.6);
            if (!sameZone || !sameFloor || !inView) continue;
            (dx <= AOI_RADIUS / 2 ? near : far).push(p);
          } else {
            near.push(p);
          }
        }
        // LOD: far ring is refreshed at 5Hz (every 4th frame); client merges by id.
        const includeFar = !LOD_ENABLED || room._snapNo % 4 === 0;
        const list = near.concat(includeFar ? far : []).map(p => publicProjection(p, viewer, camX));
        if (SKINS_SPLIT) { for (const v of list) { delete v.colors; delete v.traits; } }
        return list;
      })(),
      lod: LOD_ENABLED || undefined,
      // roster 只在可见性分层启用时才下发，保持默认快照形状不变（既有测试按形状做深比较）。
      roster: (AOI_ENABLED || SKINS_SPLIT || LOD_ENABLED || fogActive) && (++room._snapNo || 0) % 20 === 0
        ? room.players.map(p => ({ id: p.id, name: p.name, score: p.score, alive: p.alive, faction: p.faction }))
        : undefined,
      skins: (SKINS_SPLIT && room._snapNo % 20 === 0)
        ? Object.fromEntries(room.players.map(p => [p.id, { colors: p.colors, traits: p.traits }]))
        : undefined,
      badSlots: anonymousBadSlots(),
      logs: room.logs.slice(),
      config: { chargeIntervalMs: SKILL_CONFIG.chargeIntervalMs }
    };
  }
  function privateSnapshot(playerId) {
    const p = find(playerId);
    if (!p) return { ok: false, error: 'identity not found' };
    return { ok: true, me: privateProjection(p) };
  }
  function ack(playerId, eventIds, interaction) {
    const ids = new Set(Array.isArray(eventIds) ? eventIds : []);
    if (!interaction) {
      room.pending.set(playerId, (room.pending.get(playerId) || []).filter(e => !ids.has(e.eventId)));
      return { ok: true };
    }
    // dev 分支并入：离线受击摘要按 epoch + summary id 确认，旧 ACK 永不清掉新摘要。
    return digest.ack(playerId, ids, interaction, room.pending);
  }
  // 肢体互动（dev 分支并入）：跳跃 / 挥锤 / 幽灵吓人。服务端权威，客户端只提交 kind。
  // 与技能系统完全隔离：不扣血、不公开 S-ID、不消耗技能次数、不写公共日志。
  // 与主分支的 J 攻击并存：两者都写同一把硬控锁（看门狗取 max），命中判定各自独立。
  function performAction(id, kind) {
    const t = now();
    if (room.finished) return reject('本局已结束，动作已冻结');
    const actor = find(Number(id));
    if (!actor) return reject('身份无效，请重新加入');
    if (actor.npc) return reject('NPC 不能主动行动');
    if (!['jump', 'hammer', 'scare'].includes(kind)) return reject('未知动作');
    if (!actor.alive) {
      if (kind !== 'scare') return reject('幽灵只能吓人');
      if (t < actor.scareCooldownUntil) return reject('吓人冷却中');
      actor.scareCooldownUntil = t + A.hammerCooldownMs;
      actor.scareAt = t;
      let target = null, distance = Infinity;
      for (const q of room.players) {
        if (!q.alive || q.id === actor.id || q.floorId !== actor.floorId) continue;
        const d = Math.hypot(q.x - actor.x, q.y - actor.y);
        if (d <= A.hammerRange && d < distance) { target = q; distance = d; }
      }
      if (!target) return { ok: true, kind, targetId: null, hit: false };
      target.frightUntil = t + A.frightMs;
      target.frightAt = t;
      countOfflineHit(target, 'scare');
      return { ok: true, kind, targetId: target.id, hit: true };
    }
    if (kind === 'scare') return reject('只有幽灵能吓人');
    if (t < actor.stunUntil || t < actor.frightUntil) return reject('你还被敲晕着');
    const k = actor.jumpStartedAt ? (t - actor.jumpStartedAt) / A.jumpMs : 1;
    if (k >= 0 && k < 1) return reject('你还在空中');
    if (kind === 'jump') {
      actor.jumpStartedAt = t;
      return { ok: true, kind: 'jump' };
    }
    if (t < actor.hammerCooldownUntil) return reject('锤子还没抡回来');
    // 无论是否命中都进冷却：空挥同样要等锤子抡回来。
    actor.hammerCooldownUntil = t + A.hammerCooldownMs;
    actor.lastSwingAt = t;
    let best = null, bestDist = Infinity;
    for (const q of room.players) {
      if (q.id === actor.id || !q.alive || q.floorId !== actor.floorId) continue;
      const dist = Math.hypot(q.x - actor.x, q.y - actor.y);
      if (dist > A.hammerRange || dist >= bestDist) continue;
      if (airborne(q, t)) continue; // 腾空窗口内的人躲开了这一锤
      best = q; bestDist = dist;
    }
    if (!best) return { ok: true, kind: 'hammer', targetId: null, hit: false };
    countOfflineHit(best, 'hammer');
    // 第二轮：护体 buff —— 免疫眩晕与僵直（但仍然算"被敲到"，留肿包与动画，避免无反馈）。
    const shielded = best.buffs && t < (best.buffs.shieldUntil || 0);
    if (!shielded) {
      // 同时写 dev 字段与主分支的硬控锁，保证移动/攻击/乘梯一致地被锁住。
      // 背包「硬朗」被动：按百分比缩短眩晕。
      const stunMul = 1 - Math.min(50, WORLD.LOOT.passiveTotals(best.exploration.items || {}).stun || 0) / 100;
      const stunMs = Math.max(120, Math.round(A.stunMs * stunMul));
      best.stunUntil = t + stunMs;
      best.combat.stunUntil = Math.max(best.combat.stunUntil || 0, t + stunMs);
    }
    best.lastHitAt = t;
    gainAchievement(actor, 'hammer');
    best.bumps.push({ expiresAt: t + A.bumpMs });
    if (best.bumps.length > A.maxBumps) best.bumps.shift();
    best.bumpMax = best.bumps.reduce((m, b) => Math.max(m, b.expiresAt), 0);
    return { ok: true, kind: 'hammer', targetId: best.id, hit: true };
  }
  // 排名：分数降序，其次存活优先，再按 id 升序。
  // 成就榜：按成就点降序（与筹码榜并列的第二套排名）。
  function buildAchievementRanking() {
    return room.players.slice()
      .sort((a, b) => ((b.achievements && b.achievements.points) || 0) - ((a.achievements && a.achievements.points) || 0) || (a.id - b.id))
      .map((p, index) => ({ rank: index + 1, id: p.id, name: p.name,
        points: (p.achievements && p.achievements.points) || 0,
        chips: p.exploration.chips, alive: p.alive, faction: p.faction }));
  }
  function buildRanking() {
    return room.players.slice()
      .sort((a, b) => (b.score - a.score) || (Number(b.alive) - Number(a.alive)) || (a.id - b.id))
      .map((p, index) => ({ rank: index + 1, id: p.id, name: p.name, score: p.score, alive: p.alive, faction: p.faction }));
  }
  // 上局结算快照（只读派生）。ranking 为 null 表示该结束方式不按分数排名（存活淘汰至剩余 100 人），
  // 此时照样记录最后一帧的存活名单，管理页只展示存活到最后的玩家。
  function lastResultSummary() {
    const archived = room.lastResult;
    if (!archived || !Array.isArray(archived.roster)) return null;
    const roster = archived.roster;
    const survivors = roster.filter(p => p.alive).slice()
      .sort((a, b) => (b.score - a.score) || (a.id - b.id))
      .map((p, index) => ({ rank: index + 1, id: p.id, name: p.name, score: p.score, alive: true, faction: p.faction }));
    const rankedList = Array.isArray(archived.ranking) && archived.ranking.length ? archived.ranking : null;
    // 成就榜并存：管理页也要能看到该局按成就点的排名。
    const rankedAchievement = Array.isArray(room.rankingAchievement) && room.rankingAchievement.length ? room.rankingAchievement : null;
    return {
      finishReason: archived.finishReason || null,
      finishedAt: archived.finishedAt,
      playerCount: roster.length,
      rankingAchievement: rankedAchievement,
      achievementTop: room.players.slice()
        .sort((a, b) => ((b.achievements && b.achievements.points) || 0) - ((a.achievements && a.achievements.points) || 0) || (a.id - b.id))
        .slice(0, 10)
        .map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, points: (p.achievements && p.achievements.points) || 0 })),
      aliveCount: roster.filter(p => p.alive).length,
      ranked: !!rankedList,
      ranking: rankedList ? rankedList.map(r => ({ ...r })) : null,
      survivors
    };
  }
  // 结束前把当帧名册与排名冻结下来；重复调用以第一次为准，避免后到的事件改写历史。
  function archiveResult(finishedAt) {
    if (room.lastResult) return;
    room.lastResult = {
      finishReason: room.finishReason || '',
      finishedAt: Number.isFinite(finishedAt) ? finishedAt : now(),
      roster: room.players.map(p => ({ id: p.id, name: p.name, score: p.score, alive: p.alive, faction: p.faction })),
      ranking: (room.ranking || []).map(r => ({ ...r }))
    };
  }
  // 仅三种结束方式。注意 aliveFloor 必须加 players.length > endRemainingPlayers 守卫：
  // 否则小房间（如 20 人）会在开局瞬间就满足“存活 <= 100”而立即结束，这是有意设计。
  function checkFinish(t = now(), syncChallenges = true) {
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
      freezeRoom(t);
      room.finishReason = reason;
      room.ranking = (reason === 'badWiped' || reason === 'timeUp') ? buildRanking() : null;
    room.rankingAchievement = buildAchievementRanking();
      archiveResult(t);
      log(reason === 'aliveFloor' ? `游戏结束：存活人数已淘汰至剩余${rules.endRemainingPlayers}人。`
        : reason === 'badWiped' ? '游戏结束：坏人已全部出局。'
        : `游戏结束：时间到（${rules.timeLimitMs / 3600000}小时）。`);
    }
    // syncRoom 以 false 调用此函数只判整体结束；避免相互递归。
    if (syncChallenges) syncRoom(t);
  }
  // Strict uppercase match. Whitespace is ignored so a pasted value still works, but
  // lowercase input is a format error: it never consumes a charge or starts a cooldown.
  function normalizeSid(value) {
    const raw = typeof value === 'string' ? value.replace(/\s/g, '') : '';
    return /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(raw) ? raw : null;
  }
  function reject(reason) { return { ok: false, error: reason }; }
  // 指令版本校验：拒绝旧楼层 / 旧对局的迟到指令，返回明确错误（字段缺省时按旧客户端兼容放行）。
  function floorGuard(p, body) {
    if (!body || body.roundId !== room.roundId) return '对局已更新，请重新同步';
    if (!Number.isSafeInteger(body.expectedFloorRevision) || body.expectedFloorRevision !== p.floorRevision) return '楼层版本不一致，请重新同步';
    return '';
  }

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
    const pending = Object.keys(target.traits).filter(k => !target.traitPublic[k]);
    if (!pending.length) return reject('该目标没有未公开的隐藏属性，不消耗次数');
    const key = random ? pending[Math.min(pending.length - 1, Math.floor(random() * pending.length))] : pending[0];
    target.traitPublic[key] = true;
    badPool.invalidate(); // 匿名池缓存随已公开属性失效
    queueEvent(target.id, { type: 'revealedTrait', traitName: WORLD.TRAIT_NAMES[key], traitValue: target.traits[key] });
    log(`${target.name}的${WORLD.TRAIT_NAMES[key]}已公开：${target.traits[key]}。`);
    return { ok: true, kind: 'probe', resultText: `探查完成：${WORLD.TRAIT_NAMES[key]}为「${target.traits[key]}」。`, targetId: target.id };
  }
  function doAccuse(actor, target, t) {
    log(`${target.name}被指认一次。`);
    if (target.faction === 'bad') {
      award(actor, 'accuseHit');
      target.hp -= 1;
      if (target.hp > 0) {
        queueEvent(target.id, { type: 'damaged' });
        return { ok: true, kind: 'accuse', resultText: `指认命中：目标扣1血，仍存活。`, targetId: target.id };
      }
      freezeSkills(target, t); // 先结算已赚到的恢复，再冻结资源
      target.alive = false;
      badPool.invalidate(); // 匿名池缓存随存活状态失效
      room.eliminateEvents += 1;
      queueEvent(target.id, { type: 'eliminated' });
      log(`${target.name}已淘汰。`);
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
  function doKill(actor, target, submitted, t) {
    const sid = normalizeSid(submitted);
    if (!sid) return { ok: false, error: '格式错误：必须是三段，每段3位字母或数字。不消耗、不进入冷却。', formatError: true };
    if (sid !== target.sid.segments.join('-')) {
      return { ok: true, kind: 'kill', resultText: 'S-ID不匹配：目标未淘汰，进入冷却。', targetId: target.id };
    }
    award(actor, 'kill');
    gainAchievement(actor, 'kill');
    gainAchievement(target, 'eliminated');
    gainAchievement(actor, 'kill');
    gainAchievement(target, 'eliminated');
    freezeSkills(target, t); // 先结算已赚到的恢复，再冻结资源
    target.hp = 0;
    target.alive = false;
    badPool.invalidate(); // 匿名池缓存随存活状态失效
    room.eliminateEvents += 1;
    queueEvent(target.id, { type: 'eliminated' });
    log(`${target.name}已淘汰。`);
    checkFinish();
    return { ok: true, kind: 'kill', resultText: 'S-ID完全匹配：目标已淘汰。', targetId: target.id };
  }
  function useSkill(sessionId, body) {
    const t = now();
    checkFinish(t);
    syncRoom(t);
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
    const resolved = kind === 'probe' ? doProbe(actor, target) : kind === 'accuse' ? doAccuse(actor, target, t) : kind === 'spy' ? doSpy(actor, target) : doKill(actor, target, body.sid, t);
    if (resolved && resolved.ok) {
      consumeCharge(skill, t);
      room.processed.set(commandId, t);
      // 最后一次成功扣次与幂等登记都先落入本事务，再判整局结束并冻结全员资源。
      checkFinish(t);
      // 同一局保留全部 commandId，避免旧指令在冷却结束后重新结算。
      // 计分：探查/刺探成功加分；指认命中与击杀在 doAccuse/doKill 内计分。
      if (kind === 'probe') award(actor, 'probe');
      else if (kind === 'spy') award(actor, 'spy');
    }
    return resolved;
  }
  function explorationProjection(p) {
    // 私密探索投影保持既有三字段形状（chips/clues/searched）不变 —— 多个既有测试按此结构做深比较。
    // 需求③的战利品清单单独走 `backpack` 字段（privateProjection 里下发），不混进 exploration。
    return { chips: p.exploration.chips, clues: p.exploration.clues.map(c => ({ ...c })),
      searched: p.exploration.searched.slice() };
  }
  function backpackProjection(p) {
    const bag = Array.isArray(p.exploration.backpack) ? p.exploration.backpack : [];
    return bag.map(b => ({ ...b }));
  }
  // 第二轮：道具背包（key → 数量）与 buff 剩余时间。两者都只下发给本人。
  function itemsProjection(p) {
    const items = p.exploration.items && typeof p.exploration.items === 'object' ? p.exploration.items : {};
    return Object.fromEntries(Object.entries(items).filter(([, n]) => Number(n) > 0).map(([k, n]) => [k, Number(n)]));
  }
  // 第二轮：背包被动加成（放在背包里就生效；卖掉/用掉立刻失效）。
  function passivesOf(actor) {
    return WORLD.LOOT.passiveTotals((actor && actor.exploration && actor.exploration.items) || {});
  }
  function passiveProfile(p) {
    return WORLD.LOOT.passiveTotals(p.exploration.items || {});
  }
  function buffsProjection(p) {
    const t = now(), b = p.buffs || {};
    return {
      speedUntil: b.speedUntil || 0, shieldUntil: b.shieldUntil || 0,
      speedMs: Math.max(0, (b.speedUntil || 0) - t), shieldMs: Math.max(0, (b.shieldUntil || 0) - t),
      focusNext: !!b.focusNext
    };
  }
  // 道具增减的唯一入口：保证 items 里不留 0，且数量不为负。
  function addItem(p, key, delta) {
    const items = p.exploration.items || (p.exploration.items = {});
    const next = Math.max(0, (Number(items[key]) || 0) + Number(delta || 0));
    if (next > 0) items[key] = next; else delete items[key];
    return next;
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
    const t = now();
    checkFinish(t);
    syncRoom(t);
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
    const guard = floorGuard(actor, body);
    if (guard) return fail(guard);
    if (!['search', 'exchange'].includes(body.kind)) return fail('未知交互');
    const entity = body.kind === 'search'
      ? floorFurniture(actor.floorId).find(f => f.id === body.entityId && f.container && EXPLORATION_REWARDS[f.id])
      : WORLD.NPCS.find(n => n.id === body.entityId && n.floorId === actor.floorId);
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
      gainAchievement(actor, 'search');
    } else {
      // 背包「人脉」被动：NPC 线索兑换便宜 N 筹码（最低 0）。
      const clueCost = Math.max(0, entity.cost - (passivesOf(actor).clue || 0));
      if (actor.exploration.chips < clueCost) return fail(`筹码不足，需要${clueCost}筹码`);
      const clue = availableClue(actor, entity.name);
      if (!clue) return fail('暂无尚未拥有的隐藏线索，不扣筹码');
      actor.exploration.chips -= clueCost;
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
    // rpsPending 投影：仅展示本人 ownChoice/ownRevision，绝不泄露对手出拳或是否已选。
    const pending = p.games.rpsPending;
    let rpsPending = null;
    if (pending) {
      const ch = room.challenges.get(pending.id);
      const sel = ch ? ch.selections[p.id] : null;
      rpsPending = {
        id: pending.id, fromId: pending.fromId, fromName: pending.fromName,
        toId: pending.toId, toName: pending.toName, role: pending.role,
        phase: pending.phase, expiresAt: pending.expiresAt,
        // startedAt/deadline 只在接受后的选择阶段才有意义；邀请阶段不下发 0 值占位，
        // 避免前端拿到无意义的截止时间，也让邀请阶段的投影字段保持最小集合。
        ...(pending.deadline ? { startedAt: pending.startedAt || 0, deadline: pending.deadline } : {}),
        ownChoice: sel ? sel.choice : null, ownRevision: sel ? sel.revision : 0
      };
    }
    return {
      wheelSpins: { ...p.games.wheelSpins }, rpsPending, rpsUntil: p.games.rpsUntil,
      lastResult: p.games.lastResult,
      rpsResult: p.games.rpsResult ? { ...p.games.rpsResult } : null
    };
  }
  function combatProjection(p) {
    return { facing: { ...p.combat.facing }, attackUntil: p.combat.attackUntil, lastAttackAt: p.combat.lastAttackAt,
      lastAttackFacing: { ...p.combat.lastAttackFacing }, lastAttackDirection: p.combat.lastAttackDirection,
      stunUntil: p.combat.stunUntil, freezeUntil: p.combat.freezeUntil };
  }
  function mechanicsResponse(actor, ok, resultText, extra = {}) {
    return { ok, ...(!ok ? { error: resultText } : {}), resultText,
      exploration: actor ? explorationProjection(actor) : null,
      games: actor ? gamesProjection(actor) : null, combat: actor ? combatProjection(actor) : null, ...extra };
  }
  // 取消挑战：不扣筹码、不计分，写入私密末局结果（取消不泄露对手选择）。
  // reason 可为字符串或 (player)=>string，用于按本人视角反馈“谁未选”。
  function cancelChallenge(challenge, t, reason) {
    const from = find(challenge.fromId), to = find(challenge.toId);
    room.challenges.delete(challenge.id);
    for (const p of [from, to]) {
      if (!p) continue;
      const text = typeof reason === 'function' ? reason(p) : reason;
      const mySel = challenge.selections[p.id];
      p.games.rpsPending = null;
      p.games.rpsUntil = t + playConfig.rpsCooldownMs;
      p.games.lastResult = `猜拳已取消：${text}，不扣筹码。`;
      p.games.rpsResult = {
        id: challenge.id, status: 'cancelled',
        ownChoice: mySel ? mySel.choice : null,
        opponentChoice: null,
        opponentName: p.id === challenge.fromId ? (to && to.name) : (from && from.name),
        outcome: null, delta: 0, reason: text, completedAt: t
      };
    }
  }
  // 截止结算：仅当双方都已选且仍存活/在线/筹码足够才结算；否则取消（未选齐则反馈谁未选）。
  // 进入选择阶段后锁定双方，不重新限制距离与视线。
  function settleChallenge(challenge, t) {
    const from = find(challenge.fromId), to = find(challenge.toId);
    const fromSel = challenge.selections[challenge.fromId], toSel = challenge.selections[challenge.toId];
    const fromChose = !!fromSel.choice, toChose = !!toSel.choice;
    const valid = from && to && from.alive && to.alive && from.online && to.online &&
      from.exploration.chips >= playConfig.rpsStake && to.exploration.chips >= playConfig.rpsStake;
    if (valid && fromChose && toChose) {
      const delta = WORLD.rpsOutcome(fromSel.choice, toSel.choice) * playConfig.rpsStake;
      from.exploration.chips += delta;
      to.exploration.chips = Math.max(0, to.exploration.chips - delta);
      if (delta > 0) { award(from, 'rpsWin'); award(to, 'rpsLose'); }
      else if (delta < 0) { award(to, 'rpsWin'); award(from, 'rpsLose'); }
      else { award(from, 'rpsDraw'); award(to, 'rpsDraw'); }
      // 成就点与分数分开计：猜拳无论胜负都给点（胜 > 平 > 负）。
      gainAchievement(from, delta > 0 ? 'rpsWin' : delta < 0 ? 'rpsLose' : 'rpsDraw');
      gainAchievement(to, delta < 0 ? 'rpsWin' : delta > 0 ? 'rpsLose' : 'rpsDraw');
      const labels = { rock: '石头', paper: '布', scissors: '剪刀' };
      room.challenges.delete(challenge.id);
      for (const p of [from, to]) {
        const mine = p.id === challenge.fromId ? fromSel : toSel, opp = p.id === challenge.fromId ? toSel : fromSel;
        const outcome = delta === 0 ? 'draw' : (p.id === challenge.fromId ? (delta > 0 ? 'win' : 'lose') : (delta > 0 ? 'lose' : 'win'));
        p.games.rpsPending = null;
        p.games.rpsUntil = t + playConfig.rpsCooldownMs;
        const change = p.id === challenge.fromId ? delta : -delta;
        p.games.lastResult = `猜拳结算：你出${labels[mine.choice]}，${p.id === challenge.fromId ? to.name : from.name}出${labels[opp.choice]}；${change === 0 ? '平局' : change > 0 ? '你获胜' : '你落败'}，筹码${change > 0 ? '+' : ''}${change}。`;
        p.games.rpsResult = {
          id: challenge.id, status: 'resolved',
          ownChoice: mine.choice, opponentChoice: opp.choice,
          opponentName: p.id === challenge.fromId ? to.name : from.name,
          outcome, delta: p.id === challenge.fromId ? delta : -delta,
          reason: 'settled', completedAt: t
        };
      }
      return;
    }
    if (!valid) { cancelChallenge(challenge, t, '结算条件不满足（在线、存活或筹码不足）'); return; }
    const reason = p => {
      const meChose = p.id === challenge.fromId ? fromChose : toChose;
      const otherChose = p.id === challenge.fromId ? toChose : fromChose;
      if (!meChose && !otherChose) return '双方均未出拳';
      return meChose ? '对方未出拳' : '你未出拳';
    };
    cancelChallenge(challenge, t, reason);
  }
  // 统一同步入口：所有请求与投影先判整体结束条件，结束后立即取消不结算；
  // 邀请阶段仅在超时取消，选择阶段到 deadline 才同步结算一次（即便双方都已选也不提前结算）。
  function syncRoom(t) {
    checkFinish(t, false);
    // 搜索会话按时间过期：玩家中途关页面时，容器不会永久卡在"搜到一半"的状态。
    expireSearchSessions(t);
    if (room.finished) {
      for (const ch of [...room.challenges.values()]) cancelChallenge(ch, t, '游戏已结束');
      return;
    }
    for (const ch of [...room.challenges.values()]) {
      const from = find(ch.fromId), to = find(ch.toId);
      // 任一参与者被淘汰/不存在则立即取消（不结算），覆盖“淘汰同步取消挑战”。
      if (!from || !to || !from.alive || !to.alive) { cancelChallenge(ch, t, '参与者已淘汰'); continue; }
      if (!from.online || !to.online) { cancelChallenge(ch, t, '参与者不在线'); continue; }
      if (ch.phase === 'invited') {
        if (t >= ch.expiresAt) cancelChallenge(ch, t, '邀请已超时');
      } else if (ch.phase === 'selecting') {
        if (t >= ch.deadline) settleChallenge(ch, t);
      }
    }
  }
  function rpsValidation(from, to) {
    if (!from || !to || from.id === to.id) return '猜拳目标无效';
    if (!from.alive || !to.alive) return '参与者已淘汰';
    if (!from.online || !to.online) return '参与者不在线';
    if (from.floorId !== to.floorId) return '双方不在同一楼层';
    if (WORLD.distanceToEntity(from, to) > WORLD.INTERACT_RANGE) return '距离太远，请靠近后再试';
    if (!WORLD.lineClear(from, to, floorBlockers(from.floorId))) return '家具挡住了猜拳双方';
    if (from.exploration.chips < playConfig.rpsStake || to.exploration.chips < playConfig.rpsStake) return '双方都需要至少1筹码';
    return '';
  }
  function play(sessionId, body) {
    // 小游戏开关：只拦注册表里的小游戏；其它 kind 交给原有逻辑。
    if (body && typeof body.kind === 'string' && Object.prototype.hasOwnProperty.call(room.features, body.kind) && !room.features[body.kind]) {
      return reject('该小游戏尚未开放');
    }
    // 只拦明确属于某个开关的 kind；缺省/其它形态交给原有校验，避免误拒旧调用。
    const t = now();
    checkFinish(t);
    syncRoom(t);
    const actor = playerBySession(sessionId);
    const fail = reason => mechanicsResponse(actor, false, reason);
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，小游戏已冻结');
    if (!actor.alive) return fail('你已淘汰，不能参与小游戏');
    if (movementLocked(actor, t)) return fail('你正在眩晕或僵直，暂时不能参与小游戏');
    if (!actor.online && (!body || !['rpsReply', 'rpsAccept', 'rpsReject', 'rpsCancel', 'rpsChoose'].includes(body.kind))) return fail('你不在线，不能参与小游戏');
    if (!body || typeof body !== 'object') return fail('小游戏指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    const guard = floorGuard(actor, body);
    if (guard) return fail(guard);
    const validChoice = choice => ['rock', 'paper', 'scissors'].includes(choice);
    let extra = {};
    if (body.kind === 'wheel') {
      const entity = WORLD.NPCS.find(n => n.id === body.entityId && n.floorId === actor.floorId);
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
      // 邀请不需 choice：rpsPending 仅保存邀请/选择元数据，不预选出拳；旧邀请若带 choice 也不锁定。
      const target = typeof body.targetId === 'number' || (typeof body.targetId === 'string' && body.targetId.trim())
        ? find(Number(body.targetId)) : null;
      const reason = rpsValidation(actor, target);
      if (reason) return fail(reason);
      if (actor.games.rpsPending || target.games.rpsPending) return fail('参与者已有待回应或进行的猜拳');
      if (t < actor.games.rpsUntil || t < target.games.rpsUntil) return fail('猜拳冷却中');
      const challenge = {
        id: randomUUID(), fromId: actor.id, toId: target.id, phase: 'invited',
        createdAt: t, expiresAt: t + playConfig.rpsTimeoutMs, startedAt: 0, deadline: 0,
        selections: {
          [actor.id]: { choice: null, revision: 0 },
          [target.id]: { choice: null, revision: 0 }
        }
      };
      room.challenges.set(challenge.id, challenge);
      const metadata = { id: challenge.id, fromId: actor.id, fromName: actor.name, toId: target.id,
        toName: target.name, role: 'from', phase: 'invited', expiresAt: challenge.expiresAt, startedAt: 0, deadline: 0 };
      actor.games.rpsPending = { ...metadata };
      target.games.rpsPending = { ...metadata, role: 'to' };
      // 新邀请清理双方旧的末局结果。
      actor.games.rpsResult = null;
      target.games.rpsResult = null;
      actor.games.lastResult = `已邀请${target.name}猜拳，等待对方回应。`;
      target.games.lastResult = `${actor.name}邀请你猜拳，可自愿回应或取消。`;
    } else if (body.kind === 'rpsReply' || body.kind === 'rpsAccept' || body.kind === 'rpsReject') {
      // rpsReply 与 rpsAccept 同为“接受”（仅 to）；rpsReject 仅 to 拒绝；rpsCancel 任一方见下。
      const challenge = room.challenges.get(body.challengeId);
      if (!challenge) return fail('猜拳邀请不存在或已结束');
      if (actor.id !== challenge.fromId && actor.id !== challenge.toId) return fail('无权操作他人的猜拳');
      if (challenge.phase !== 'invited') return fail('当前阶段无法回应此猜拳');
      if (actor.id !== challenge.toId) return fail('只有被邀请者可以回应');
      if (body.kind === 'rpsReject') {
        cancelChallenge(challenge, t, '对方拒绝');
      } else {
        // 接受仍需按现有距离/视线/余额校验；校验失败则取消（不扣）。
        const from = find(challenge.fromId), to = find(challenge.toId);
        const reason = rpsValidation(from, to);
        if (reason) {
          cancelChallenge(challenge, t, reason);
          return fail(`猜拳已取消：${reason}，不扣筹码。`);
        }
        // 接受设共同 startedAt 与 deadline=t+rpsRoundMs，phase 进入 selecting；截止前不结算。
        challenge.phase = 'selecting';
        challenge.startedAt = t;
        challenge.deadline = t + playConfig.rpsRoundMs;
        for (const p of [from, to]) {
          p.games.rpsPending.phase = 'selecting';
          p.games.rpsPending.startedAt = t;
          p.games.rpsPending.deadline = challenge.deadline;
        }
        actor.games.lastResult = `你已接受${from.id === actor.id ? to.name : from.name}的猜拳，请在倒计时内出拳。`;
      }
    } else if (body.kind === 'rpsCancel') {
      const challenge = room.challenges.get(body.challengeId);
      if (!challenge) return fail('猜拳邀请不存在或已结束');
      if (actor.id !== challenge.fromId && actor.id !== challenge.toId) return fail('无权操作他人的猜拳');
      cancelChallenge(challenge, t, '已取消');
    } else if (body.kind === 'rpsChoose') {
      // 双方均可修改自己的出拳；choices 只保存在 room.challenges，private 投影仅本人的 ownChoice/ownRevision。
      const challenge = room.challenges.get(body.challengeId);
      if (!challenge) return fail('猜拳邀请不存在或已结束');
      if (actor.id !== challenge.fromId && actor.id !== challenge.toId) return fail('无权操作他人的猜拳');
      if (challenge.phase !== 'selecting') return fail('尚未进入出拳阶段');
      if (!validChoice(body.choice)) return fail('出拳必须是 rock、paper 或 scissors');
      if (typeof body.revision !== 'number' || !Number.isSafeInteger(body.revision) || body.revision < 0) return fail('revision 必须为非负安全整数');
      const sel = challenge.selections[actor.id];
      // 用每人递增安全整数 revision 拒绝旧/乱序请求；相同 revision+choice 视为幂等成功。
      if (body.revision < sel.revision) return fail('请求已过期或乱序，请使用更大的 revision');
      if (body.revision !== sel.revision || body.choice !== sel.choice) {
        sel.choice = body.choice;
        sel.revision = body.revision;
        actor.games.lastResult = `你已出拳：${body.choice}，等待截止结算。`;
      }
    } else return fail('未知小游戏');
    room.processed.set(commandId, t);
    return mechanicsResponse(actor, true, actor.games.lastResult, extra);
  }
  function attack(sessionId, body) {
    const t = now();
    checkFinish(t);
    syncRoom(t);
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
    const guard = floorGuard(actor, body);
    if (guard) return fail(guard);
    if (t < actor.combat.attackUntil) return fail('攻击冷却中');
    const blockers = floorBlockers(actor.floorId);
    let target = null, nearest = Infinity;
    for (const p of room.players) {
      if (p.id === actor.id || !p.alive || !p.online || movementLocked(p, t)) continue;
      if (p.floorId !== actor.floorId) continue; // J 命中只处理当前层
      const dx = p.x - actor.x, dy = p.y - actor.y, distance = Math.hypot(dx, dy);
      if (distance > playConfig.attackRange || distance >= nearest) continue;
      if (distance && (dx * actor.combat.facing.x + dy * actor.combat.facing.y) / distance < playConfig.attackConeCos) continue;
      if (!WORLD.lineClear(actor, p, blockers) || WORLD.coverFor(p, blockers)) continue;
      target = p;
      nearest = distance;
    }
    room.processed.set(commandId, t);
    actor.combat.lastAttackAt = t;
    actor.combat.lastAttackFacing = { ...actor.combat.facing };
    actor.combat.lastAttackDirection = WORLD.spriteDirection(actor.combat.facing.x, actor.combat.facing.y, actor.spriteFacing);
    actor.combat.attackUntil = t + playConfig.attackCooldownMs;
    let resultText = `攻击空挥，未命中目标，进入${playConfig.attackCooldownMs / 1000}秒冷却。`;
    if (target) {
      target.combat.stunUntil = t + playConfig.stunMs;
      target.combat.freezeUntil = t + playConfig.freezeMs;
      target.input = { up: false, down: false, left: false, right: false };
      award(actor, 'interactHit');
      resultText = `互动命中${target.name}：眩晕0.8秒 / 僵直1秒，无伤害。`;
    }
    return mechanicsResponse(actor, true, resultText, target ? { hitId: target.id } : {});
  }
  // 楼层切换（服务端权威）。电梯不分上下方向：客户端进门后弹出选层 UI（1–7，禁选当前层），
  // 提交 body.targetFloorId；服务端校验顺序：会话认证 → 同 roundId → 玩家在线/存活/未结束 →
  // floorId 与 expectedFloorId 匹配 → floorRevision 匹配 → portal 属于当前层 →
  // targetFloorId 是 1–7 且 ≠ 当前层 → 到 portal 距离 ≤ INTERACT_RANGE → 目标层电梯门口有安全落点。
  // 落点由服务端决定（elevatorLanding：目标层同侧电梯门口正前方），忽略客户端 x/y。
  // 成功时在同一个同步函数内完成全部状态变更（不中途 await），并写入幂等 receipt。
  function floorChange(sessionId, body) {
    const t = now();
    checkFinish(t);
    syncRoom(t);
    const actor = playerBySession(sessionId);
    if (!actor) return reject('身份无效，请重新加入');
    if (!body || typeof body !== 'object') return reject('换层指令无效');
    if (body.roundId !== room.roundId) return reject('对局已更新，请重新同步');
    if (room.finished) return reject('游戏已结束，无法换层');
    if (!actor.alive) return reject('你已淘汰，无法换层');
    if (!actor.online) return reject('你不在线，无法换层');
    if (!body || typeof body !== 'object') return reject('换层指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return reject('缺少 commandId');
    // 幂等：同 key 复用同一 success receipt，不再重复执行；payload 冲突则拒绝。
    const key = `${room.roundId}:${actor.sessionId}:${commandId}`;
    if (room.floorReceipts.has(key)) {
      const rec = room.floorReceipts.get(key);
      if (rec.portalId !== body.portalId || rec.fromFloorId !== body.expectedFloorId || rec.fromRevision !== body.expectedFloorRevision || rec.targetFloorId !== body.targetFloorId) {
        return reject('指令冲突：相同 commandId 对应不同换层目标');
      }
      return rec.response;
    }
    if (body.expectedFloorId !== actor.floorId) return reject('请求的起始楼层与服务器不一致');
    if (!Number.isSafeInteger(body.expectedFloorRevision) || body.expectedFloorRevision !== actor.floorRevision) return reject('楼层版本不一致，请重新同步');
    if (movementLocked(actor, t)) return reject('眩晕/僵直中，暂时无法乘梯');
    const fromFloor = WORLD.floorById(actor.floorId);
    const portal = fromFloor.portals.find(p => p.id === body.portalId);
    if (!portal) return reject('该入口不属于当前楼层');
    // 电梯无方向：目标层由玩家选定，1–7 任意层（除当前层）。
    const targetFloorId = Number(body.targetFloorId);
    if (!Number.isSafeInteger(targetFloorId) || targetFloorId < 1 || targetFloorId > WORLD.FLOOR_COUNT) return reject('目标楼层无效（1–7）');
    if (targetFloorId === actor.floorId) return reject('已在本层，请选择其它楼层');
    const access = WORLD.portalAccess(actor, portal);
    if (!access.allowed) return reject(access.reason);
    const landing = WORLD.elevatorLanding(targetFloorId, portal.side);
    // 注意：落点就在目标层电梯门口（与 portal 距离 ≤64 是设计意图），不能用 pointSafe
    // （pointSafe 要求远离任何 portal，适用于出生点校验）；此处直接查楼面内/不碰撞/不遮挡。
    if (!landing || !WORLD.inFloor(targetFloorId, landing.x, landing.y)
      || WORLD.floorCollides(targetFloorId, landing.x, landing.y, floorBlockers(targetFloorId))
      || WORLD.coverFor({ x: landing.x, y: landing.y }, floorBlockers(targetFloorId))) {
      return reject('目标层电梯门口暂无安全落点，换层已取消');
    }
    // —— 同一同步函数内的原子变更 ——
    actor.input = { up: false, down: false, left: false, right: false };
    // 成功换层：取消该玩家未决猜拳（invited 与 selecting 都取消），沿用 cancelChallenge 语义。
    for (const ch of [...room.challenges.values()]) {
      if (ch.fromId === actor.id || ch.toId === actor.id) cancelChallenge(ch, t, '参与者换层');
    }
    actor.floorId = targetFloorId;
    actor.x = landing.x;
    actor.y = landing.y;
    // 换层一定回到楼层公共空间：房间是楼层的子空间，跨层后旧的 zone 不再成立。
    actor.zoneId = null;
    actor.zoneReturn = null;
    actor.floorRevision += 1;
    // 乘梯不改朝向、不给无敌、不产生眩晕/僵直、不重置也不消耗 J 冷却；walk 不累加。
    const targetName = WORLD.floorById(actor.floorId).name;
    const response = mechanicsResponse(actor, true, `已乘梯到达 ${targetName}。`, {
      floor: { id: actor.floorId, name: targetName, revision: actor.floorRevision }
    });
    response.floor = { id: actor.floorId, name: targetName, revision: actor.floorRevision };
    // 落点由服务端决定：客户端据此在开门前重播种插值与相机，不从源层平滑穿越建筑。
    response.position = { x: actor.x, y: actor.y };
    room.floorReceipts.set(key, {
      portalId: portal.id,
      fromFloorId: body.expectedFloorId,
      fromRevision: body.expectedFloorRevision,
      targetFloorId,
      response
    });
    return response;
  }
  // ============================================================
  // 需求①：独立小房间（zone）——进入 / 离开
  // ============================================================
  // 一个"空间"由 floorId + zoneId 唯一确定。进入房间时把楼层位置存进 zoneReturn，
  // 退出时原样还原，因此"退出房间后位置还是处于进入的位置"是结构性保证，不依赖任何估算。
  function zoneInfo(p) {
    const z = p.zoneId ? WORLD.roomById(p.zoneId) : null;
    return z ? { id: z.id, name: z.name, kind: z.kind, width: z.width, height: z.height,
      door: { ...z.door }, entry: { ...z.entry }, exit: { ...z.exit } } : null;
  }
  function zonePayload(actor) {
    return {
      zone: zoneInfo(actor),
      position: { x: actor.x, y: actor.y },
      floor: { id: actor.floorId, revision: actor.floorRevision },
      exploration: explorationProjection(actor)
    };
  }
  // 房间门在楼层上的交互资格：同层、活着、不在眩晕、离门点足够近。
  function zoneDoorAccess(actor, roomList, maxDist) {
    const near = WORLD.roomDoorNear(actor.floorId, actor.x, actor.y, maxDist);
    if (!near) return { ok: false, reason: '附近没有可进入的房间门（请靠近门牌）' };
    if (roomList && !roomList.includes(near.room.id)) return { ok: false, reason: '该房间不在本层' };
    return { ok: true, room: near.room, distance: near.distance };
  }
  function enterZone(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    if (!actor) return reject('身份无效，请重新加入');
    if (room.finished) return reject('游戏已结束，探索已冻结');
    if (!actor.alive) return reject('你已淘汰，不能进入房间');
    if (movementLocked(actor, t)) return reject('你正在眩晕或僵直，暂时不能进入房间');
    if (!body || typeof body !== 'object') return reject('进入指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return reject('缺少 commandId');
    if (room.processed.has(commandId)) return reject('该指令已结算过');
    if (actor.zoneId) return reject('你已经在房间内');
    const roomId = typeof body.zoneId === 'string' ? body.zoneId : '';
    const target = WORLD.roomById(roomId);
    if (!target) return reject('房间不存在');
    if (target.floorId !== actor.floorId) return reject('房间不在当前楼层');
    const guard = floorGuard(actor, body);
    if (guard) return reject(guard);

    const access = zoneDoorAccess(actor, [roomId], WORLD.ROOM_ENTER_PAD);
    if (!access.ok) return reject(access.reason);
    // 进入：先记下楼层位置，再把玩家放进房间内部落点。
    actor.zoneReturn = { x: actor.x, y: actor.y, floorId: actor.floorId };
    actor.zoneId = target.id;
    actor.x = target.entry.x;
    actor.y = target.entry.y;
    actor.floorRevision += 1;
    actor.input = { up: false, down: false, left: false, right: false };
    room.processed.set(commandId, t);
    return { ok: true, resultText: `进入「${target.name}」`, ...zonePayload(actor) };
  }
  function exitZone(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    if (!actor) return reject('身份无效，请重新加入');
    if (!actor.zoneId) return reject('你不在房间内');
    if (!body || typeof body !== 'object') return reject('离开指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return reject('缺少 commandId');
    if (room.processed.has(commandId)) return reject('该指令已结算过');
    const guard = floorGuard(actor, body);
    if (guard) return reject(guard);
    const zone = WORLD.roomById(actor.zoneId);
    if (!zone) { actor.zoneId = null; return reject('房间数据丢失，已退回楼层'); }
    // 必须走到门口才能离开（避免在房间深处瞬间传送回楼层）。
    const dist = Math.hypot(actor.x - zone.exit.x, actor.y - zone.exit.y);
    if (dist > 74) return reject('请走到门口再离开房间');
    // 还原到进入时站的位置；若该点变得不可站立（家具变化等）则退回门点。
    const back = actor.zoneReturn || { x: zone.door.x, y: zone.door.y, floorId: actor.floorId };
    let landing = { x: back.x, y: back.y };
    if (WORLD.floorCollides(actor.floorId, landing.x, landing.y, floorBlockers(actor.floorId))) {
      landing = { x: zone.door.x, y: zone.door.y };
    }
    actor.zoneId = null;
    actor.zoneReturn = null;
    actor.x = landing.x;
    actor.y = landing.y;
    actor.floorRevision += 1;
    actor.input = { up: false, down: false, left: false, right: false };
    room.processed.set(commandId, t);
    return { ok: true, resultText: `离开「${zone.name}」`, ...zonePayload(actor) };
  }

  // ============================================================
  // 需求③：搜打撤式物品格搜索（start → reveal… → take）
  // ============================================================
  // 服务端一次性掷完整个容器（确定性），但**只按 reveal 请求逐格下发**：
  // 客户端在拿到揭示结果前，连"这格是不是空的"都无从得知，因此无法提前挑选稀有物品。
  function findContainerInZone(actor, containerId) {
    if (!containerId) return null;
    return WORLD.zoneContainers(actor.floorId, actor.zoneId || null).find(c => c.id === containerId) || null;
  }
  function searchSessionFor(actor, sessionId) {
    const s = room.searchSessions.get(String(sessionId || ''));
    return s && s.playerId === actor.id ? s : null;
  }
  function expireSearchSessions(t) {
    for (const [id, s] of room.searchSessions) if (t - s.lastAt > WORLD.LOOT.SEARCH_CONFIG.sessionTtlMs) room.searchSessions.delete(id);
  }
  function describeSearchSession(s) {
    // revealedContent 只回放"该玩家自己已经揭示过的格子"，用于关掉面板再打开时恢复画面；
    // 未揭示的格子永远不下发内容（只给数量）。
    const revealedContent = [];
    for (let i = 0; i < s.revealed.size; i++) revealedContent.push(WORLD.LOOT.describeSlot(s.plan.slots[i]));
    return { id: s.id, containerId: s.containerId, containerName: s.containerName,
      cols: s.plan.cols, rows: s.plan.rows, slotCount: s.plan.slots.length,
      revealed: s.revealed.size, profileKey: s.plan.profileKey,
      revealDelayMs: WORLD.LOOT.SEARCH_CONFIG.revealDelayMs(s.plan.profileKey),
      nextRevealAt: s.nextAt, revealedContent, completed: s.revealed.size >= s.plan.slots.length };
  }
  function searchStart(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    const fail = reason => ({ ...reject(reason), exploration: actor ? explorationProjection(actor) : null });
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，探索已冻结');
    if (!actor.alive) return fail('你已淘汰，不能搜索');
    if (movementLocked(actor, t)) return fail('你正在眩晕或僵直，暂时不能搜索');
    if (!body || typeof body !== 'object') return fail('搜索指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    const guard = floorGuard(actor, body);
    if (guard) return fail(guard);
    const container = findContainerInZone(actor, body.containerId);
    if (!container) return fail('搜索目标无效');
    if (WORLD.distanceToEntity(actor, container) > WORLD.INTERACT_RANGE) return fail('距离太远，请靠近后再搜索');
    if (actor.exploration.searched.includes(container.id)) return fail('你已经搜索过这个容器');
    // 已有未完成会话：直接复用，避免连点开出多个格子面板。
    for (const s of room.searchSessions.values()) if (s.playerId === actor.id && s.containerId === container.id) {
      return { ok: true, resultText: '继续搜索', reused: true, session: describeSearchSession(s), serverNow: t };
    }
    const bonus = EXPLORATION_REWARDS[container.id] || null;
    // 专注 buff：本次多翻 1 件，开搜即消耗（无论最后拿不拿，眼镜已经戴上了）。
    const focus = !!(actor.buffs && actor.buffs.focusNext);
    if (focus && actor.buffs) actor.buffs.focusNext = false;
    const pass = passivesOf(actor);
    const plan = WORLD.LOOT.buildSearchPlan(container, actor.id, { salt: room.roundId, bonus,
      extra: (focus ? 1 : 0) + Math.min(2, pass.search || 0), luck: Math.min(50, pass.luck || 0) });
    room.searchSeq += 1;
    const s = { id: `search-${room.searchSeq}-${actor.id}`, playerId: actor.id, containerId: container.id,
      floorId: actor.floorId, zoneId: actor.zoneId || null, containerName: container.container.name,
      plan, revealed: new Set(), taken: false, createdAt: t, lastAt: t, nextAt: 0 };
    room.searchSessions.set(s.id, s);
    room.processed.set(commandId, t);
    actor.input = { up: false, down: false, left: false, right: false };
    return { ok: true, resultText: `开始搜索「${s.containerName}」`, session: describeSearchSession(s), serverNow: t };
  }
  function searchReveal(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    const fail = reason => ({ ...reject(reason), exploration: actor ? explorationProjection(actor) : null });
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，探索已冻结');
    const s = searchSessionFor(actor, body && body.sessionId);
    if (!s) return fail('搜索会话已失效，请重新打开容器');
    s.lastAt = t;
    // 防连点：每格之间有最小间隔，由服务端时间判定（客户端改计时器无效）。
    if (t < (s.nextAt || 0)) return fail('搜索进行中，请稍候');
    const index = s.revealed.size;
    if (index >= s.plan.slots.length) return fail('该容器已经全部揭示');
    s.revealed.add(index);
    s.nextAt = t + WORLD.LOOT.SEARCH_CONFIG.revealDelayMs(s.plan.profileKey);
    const content = WORLD.LOOT.describeSlot(s.plan.slots[index]);
    return { ok: true, index, content, session: describeSearchSession(s), serverNow: t };
  }
  function searchTake(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    const fail = reason => ({ ...reject(reason), exploration: actor ? explorationProjection(actor) : null });
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，探索已冻结');
    const s = searchSessionFor(actor, body && body.sessionId);
    if (!s) return fail('搜索会话已失效，请重新打开容器');
    if (s.revealed.size < s.plan.slots.length) return fail('还有格子没有揭示完，请先完成搜索');
    if (s.taken) return fail('该容器已经结算过');
    s.taken = true;
    const gained = { chips: 0, items: [], clues: 0 };
    const bag = Array.isArray(actor.exploration.backpack) ? actor.exploration.backpack : (actor.exploration.backpack = []);
    for (let i = 0; i < s.plan.slots.length; i++) {
      const slot = s.plan.slots[i];
      if (!slot) continue;
      if (slot.kind === 'chips') {
        actor.exploration.chips += slot.amount;
        gained.chips += slot.amount;
      } else if (slot.kind === 'clue') {
        const clue = availableClue(actor, s.containerName);
        if (clue) { actor.exploration.clues.push(clue); gained.clues++; award(actor, 'clue'); }
        else { actor.exploration.chips += 2; gained.chips += 2; }
      } else {
        const item = WORLD.LOOT.ITEMS[slot.itemKey];
        if (!item) continue;
        bag.push({ key: item.key, label: item.label, rarity: item.rarity, icon: item.icon,
          value: item.value, from: s.containerName, at: t });
        // 第二轮：物品不再当场折现，而是进背包，由玩家自己决定"卖掉换筹码"还是"用掉"。
        addItem(actor, item.key, 1);
        gained.items.push({ key: item.key, label: item.label, rarity: item.rarity, value: item.value });
      }
    }
    if (!actor.exploration.searched.includes(s.containerId)) actor.exploration.searched.push(s.containerId);
    award(actor, 'search');
    room.searchSessions.delete(s.id);
    actor.input = { up: false, down: false, left: false, right: false };
    const parts = [];
    if (gained.chips) parts.push(`${gained.chips} 筹码`);
    if (gained.clues) parts.push(`${gained.clues} 条线索`);
    if (gained.items.length) parts.push(`${gained.items.length} 件物品`);
    return { ok: true, resultText: parts.length ? `搜索完成：获得${parts.join('、')}。` : '搜索完成：只翻出一堆没用的东西。',
      gained, exploration: explorationProjection(actor), backpack: backpackProjection(actor), score: actor.score };
  }

    // ============================================================
  // 第二轮：道具经济 —— 使用 / 出售 / 购买
  // ============================================================
  // 设计意图：搜到的东西不再是"到手即折现的数字"，而是**资产**：
  //   · 卖掉 → 换筹码（再去 NPC 换线索 / 转盘 / 买道具）
  //   · 用掉 → 换一段时间的战力（疾行 / 护体）或一次更好的搜索（专注）
  // 所有判定与计时都在服务端；客户端只提交 itemKey 并渲染返回的 items/buffs。
  function itemDef(key) { return WORLD.LOOT.ITEMS[String(key || '')] || null; }
  function economyResponse(actor, ok, resultText, extra = {}) {
    return { ok, ...(ok ? {} : { error: resultText }), resultText,
      items: actor ? itemsProjection(actor) : null,
      buffs: actor ? buffsProjection(actor) : null,
      chips: actor ? actor.exploration.chips : 0,
      score: actor ? actor.score : 0, ...extra };
  }
  // 三个动作共用的准入检查
  function economyGuard(sessionId, body) {
    const t = now();
    checkFinish(t); syncRoom(t);
    const actor = playerBySession(sessionId);
    // 失败返回 { error }，成功返回 { actor, t, commandId }；调用方用 g.error 判空。
    const fail = reason => ({ error: economyResponse(actor, false, reason) });
    if (!actor) return fail('身份无效，请重新加入');
    if (room.finished) return fail('游戏已结束，背包已冻结');
    if (!actor.alive) return fail('你已淘汰，不能操作背包');
    if (!body || typeof body !== 'object') return fail('指令无效');
    const commandId = typeof body.commandId === 'string' ? body.commandId : '';
    if (!commandId.trim()) return fail('缺少 commandId');
    if (room.processed.has(commandId)) return fail('该指令已结算过');
    return { actor, t, commandId };
  }
  function useItem(sessionId, body) {
    const g = economyGuard(sessionId, body);
    if (g.error) return g.error;
    const { actor, t, commandId } = g;
    const fail = reason => economyResponse(actor, false, reason);
    const def = itemDef(body.itemKey);
    if (!def || !def.use) return fail('该物品不能直接使用');
    if (!(Number(actor.exploration.items[def.key]) > 0)) return fail('背包里没有这件物品');
    const eff = WORLD.LOOT.EFFECTS[def.use.effect];
    if (!eff) return fail('物品效果未定义');
    const duration = Number(def.use.durationMs) || eff.durationMs || 0;
    let text;
    if (def.use.effect === 'focus') {
      actor.buffs.focusNext = true;
      text = `使用「${def.label}」：下一次搜索会多翻出 1 件物品。`;
    } else if (def.use.effect === 'speed') {
      actor.buffs.speedUntil = Math.max(t, actor.buffs.speedUntil || 0) + duration;
      text = `使用「${def.label}」：${Math.round(duration / 1000)} 秒内移动速度 +45%。`;
    } else if (def.use.effect === 'shield') {
      actor.buffs.shieldUntil = Math.max(t, actor.buffs.shieldUntil || 0) + duration;
      text = `使用「${def.label}」：${Math.round(duration / 1000)} 秒内免疫 J 键攻击的眩晕与僵直。`;
    } else {
      return fail('未知的物品效果');
    }
    addItem(actor, def.key, -1);
    room.processed.set(commandId, t);
    return economyResponse(actor, true, text, { used: def.key, effect: def.use.effect });
  }
  function sellItem(sessionId, body) {
    const g = economyGuard(sessionId, body);
    if (g.error) return g.error;
    const { actor, t, commandId } = g;
    const fail = reason => economyResponse(actor, false, reason);
    const def = itemDef(body.itemKey);
    if (!def) return fail('未知物品');
    const have = Number(actor.exploration.items[def.key]) || 0;
    if (have <= 0) return fail('背包里没有这件物品');
    const want = Math.max(1, Math.min(have, Math.floor(Number(body.count) || 1)));
    // 背包「行情」被动：卖出价 +N%。
    const unit = Math.max(0, Math.floor((Number(def.value) || 0) * (1 + Math.min(50, passivesOf(actor).sell || 0) / 100)));
    if (unit <= 0) return fail(`「${def.label}」卖不出价钱`);
    addItem(actor, def.key, -want);
    actor.exploration.chips += unit * want;
    room.processed.set(commandId, t);
    return economyResponse(actor, true, `卖出「${def.label}」×${want}，获得 ${unit * want} 筹码。`, { sold: def.key, count: want, gained: unit * want });
  }
  function buyItem(sessionId, body) {
    const g = economyGuard(sessionId, body);
    if (g.error) return g.error;
    const { actor, t, commandId } = g;
    const fail = reason => economyResponse(actor, false, reason);
    const def = itemDef(body.itemKey);
    if (!def || !def.shop) return fail('这件商品不在售');
    const price = Math.max(1, Number(def.price) || 0);
    const want = Math.max(1, Math.min(5, Math.floor(Number(body.count) || 1)));
    if (actor.exploration.chips < price * want) return fail(`筹码不足：需要 ${price * want}，当前 ${actor.exploration.chips}`);
    actor.exploration.chips -= price * want;
    addItem(actor, def.key, want);
    room.processed.set(commandId, t);
    return economyResponse(actor, true, `买入「${def.label}」×${want}，花费 ${price * want} 筹码。`, { bought: def.key, count: want, spent: price * want });
  }

  // ===== 小游戏 =====
  function startMinigame(sessionId, body) {
    const actor = playerBySession(sessionId);
    if (!actor) return { ok: false, error: '身份无效' };
    if (room.finished) return { ok: false, error: '游戏已结束' };
    const game = body && body.game;
    if (game === 'spire') {
      if (!room.features.spire) return { ok: false, error: '该小游戏尚未开放' };
      if (!actor.alive) return { ok: false, error: '你已淘汰，不能开小游戏' };
      if (room.spireBattles.has(actor.id)) return { ok: false, error: '你已有一局卡牌对决' };
      const battle = SPIRE.createBattle(Date.now() % 100000 + actor.id * 7919);
      room.spireBattles.set(actor.id, battle);
      return { ok: true, spire: SPIRE.view(battle) };
    }
    return minigames.start(actor, game, body && body.opponentId, !!(body && body.viaArcade));
  }
  function actMinigame(sessionId, body) {
    const actor = playerBySession(sessionId);
    if (!actor) return { ok: false, error: '身份无效' };
    if (room.finished) return { ok: false, error: '游戏已结束' };
    // 坦克对局优先：玩家可能同时挂着一局卡牌，动作要先按当前对局分流。
    const battle = minigames.matchOf(actor.id) ? null : room.spireBattles.get(actor.id);
    if (battle) {
      const action = body && body.action;
      let res;
      if (action === 'end') res = SPIRE.endTurn(battle);
      else if (action === 'play') res = SPIRE.play(battle, Number(body.index));
      else return { ok: false, error: '未知操作' };
      if (!res.ok) return res;
      if (battle.finished && battle.won) { gainAchievement(actor, 'minigame'); gainAchievement(actor, 'minigameWin'); }
      else if (battle.finished) { gainAchievement(actor, 'minigame'); }
      return { ok: true, spire: SPIRE.view(battle) };
    }
    return minigames.act(actor, body && body.action);
  }
  function minigameState(sessionId) {
    const actor = playerBySession(sessionId);
    if (!actor) return { ok: false, error: '身份无效' };
    const m = minigames.matchOf(actor.id);
    // 同层可挑战的对手由服务端算好下发：客户端少一次 /api/state 请求、少一个失败点。
    // 对手列表带上楼层：直接挑战只显示同层，游戏机可以跨层匹配。
    const foes = room.players
      .filter(p => p.id !== actor.id && p.alive && !p.npc && p.online)
      .map(p => ({ id: p.id, name: p.name, floorId: p.floorId }));
    const battle = room.spireBattles.get(actor.id);
    return { ok: true, match: m ? minigames.project(m, actor.id) : null, spire: battle ? SPIRE.view(battle) : null,
      enabled: Object.keys(room.features).filter(k => room.features[k]), foes };
  }
  function quitMinigame(sessionId) {
    const actor = playerBySession(sessionId);
    if (!actor) return { ok: false, error: '身份无效' };
    if (room.spireBattles.delete(actor.id)) return { ok: true };
    return minigames.quit(actor);
  }
  // 开新局：清空本局全部玩家与身份凭证，所有人必须重新加入。room.lastResult 故意不清，
  // 管理页在重开后仍要能看到上一局排名。
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
    room.floorReceipts.clear();
    room.glassDoors = {};
    room.searchSessions.clear();
    room.searchSeq = 0;
    badPool.reset(); digest.reset(); finishedExpiryAt = -Infinity;
    room.roundId = randomUUID();
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
    log('办公室已重置：等待玩家加入。');
  }
  function finish() {
    if (room.finished) return;
    const t = now();
    freezeRoom(t);
    room.finishReason = 'host';
    room.ranking = null;
    syncRoom(now());
    archiveResult(now());
    log('游戏已结束：主持人结束了游戏。');
    for (const entry of streams.values()) { try { entry.res && entry.res.end(); } catch { /* already closed */ } }
    streams.clear();
  }
  return {
    room, streams, now, join, setOffline, setIntent, step, useSkill, interact, play, attack, floorChange, ack,
    performAction, spawnNpc, prepareReconnect,
    // 需求① / ③：独立房间进出与物品格搜索（服务端权威入口）。
    enterZone, exitZone, searchStart, searchReveal, searchTake, zoneInfo,
    // 第二轮：道具经济（使用 / 出售 / 购买）。
    useItem, sellItem, buyItem, passiveProfile,
    startMinigame, actMinigame, minigameState, quitMinigame,
    publicSnapshot, privateSnapshot, privateProjection, publicProjection, reset, finish,
    playerBySession, playerByEmpNo, find, lastResultSummary, rules, config: SKILL_CONFIG,
    floorFurniture, floorBlockers, safeLanding
  };
}
module.exports = { createRoom, SKILL_CONFIG, WORLD };
