'use strict';
// LAN playtest client. Pure presentation: it submits intents and renders snapshots.
// Position, skill resolution, public state, elimination and finish are all server-side.
// The furniture layout comes from /shared/world.js, the same file the server loads, so
// 家具绘制、深度、遮挡与服务端足迹碰撞共用同一份地图。
(() => {
  const $ = id => document.getElementById(id);
  const BODY_HALF = WORLD.BODY_HALF, FOOT_TOP = WORLD.FOOT_TOP, FOOT_BOTTOM = WORLD.FOOT_BOTTOM;
  const fieldNames = WORLD.FIELD_NAMES, traitNames = WORLD.TRAIT_NAMES, MASK = WORLD.MASK;
  const palettes = WORLD.PALETTES, zones = WORLD.ZONES;
  // 肢体互动常量与服务端共用同一份 world.js；渲染层只读，不自行判定命中或击晕。
  const ACTION = WORLD.ACTION || { jumpMs: 520, jumpHeight: 16, jumpDodgeFrom: 0.18, jumpDodgeTo: 0.82, hammerRange: 58, hammerCooldownMs: 1000, frightMs: 750, stunMs: 750, bumpMs: 15000, maxBumps: 3 };
  // 方案 B（放大地图后的镜头）：视野宽度固定为「半层」，高度按地图视区比例自适应。
  // 放大 2× 后 FLOOR_W=2880，CAMERA_W=1440 → 一屏正好看半层；3:2 视区时高度为 960。
  // 这比固定世界高度更稳：窗口变宽只增加可看的横向范围，不会把人物越放越大。
  const CAMERA_W = Math.max(320, Math.round((WORLD.FLOOR_W || 1440) / 2));
  const FLOOR_H = WORLD.FLOOR_H || 400;
  // ---------- 动态视口状态 ----------
  // 统一缩放 s = 地图视区 CSS 宽 / CAMERA_W；世界与屏幕共用同一 s。
  let cssW = 960, cssH = 640, scale = 1, viewW = CAMERA_W, viewH = Math.round(CAMERA_W * 640 / 960), dpr = 1;
  let cameraX = 0, cameraY = 0, drawCamX = 0, drawCamY = 0;
  // ---------- 楼层渲染状态：只对应当前层，换层时整层原子替换 ----------
  let floorId = 1, floorName = '', glassDoorStates = {};
  // ---------- 独立小房间状态（需求①）：zoneId 为 null 表示楼层公共空间 ----------
  let zoneId = null, zoneName = '', zoneRoom = null, zoneRooms = [];
  const SCENE = window.SID_SCENE;
  const SID = window.SID;
  // 搜打撤物品格面板（需求③）由 js/search/loot-grid.js 提供，这里只做别名与开关。
  const LOOT = SID.lootGrid;
  function closeLoot() { if (LOOT && LOOT.isOpen()) LOOT.close(true); }
  let furniture = [], walls = [], containers = [], occluders = [], npcs = [], portals = [];
  const furnitureSprites = new Map();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function buildNpcs(id) {
    return WORLD.floorNpcs(id).map((n, i) => ({ ...n, entityId: n.id, id: -i - 1, npc: true, alive: true, walk: 0, moving: false,
      colors: Object.fromEntries(Object.entries(palettes).map(([key, options], j) => [key, options[(i + j + 2) % options.length]])) }));
  }
  // 换层时整层原子替换：floorId、家具/墙/NPC/容器/入口/碰撞集合、点击标签、HUD 全部对应同一新层。
  function loadFloorLocal(id) {
    floorId = id; floorName = WORLD.floorById(id).name;
    // 需求①：回到楼层公共空间时清空 zone 上下文。
    zoneId = null; zoneName = ''; zoneRoom = null;
    furniture = WORLD.floorFurniture(id).filter(f => !f.architecturalPlaceholder); walls = WORLD.floorWalls(id);
    occluders = WORLD.floorBlockers(id, glassDoorStates); containers = furniture.filter(f => f.container);
    npcs = buildNpcs(id); portals = WORLD.floorPortals(id);
    zoneRooms = WORLD.roomsForFloor(id);
  }
  // 需求①：进入房间时整间原子替换 —— 房间有自己的家具/墙体/碰撞/容器，NPC 与电梯不属于房间。
  // 人物也一样：drawList 只取同一 zoneId 的玩家，因此房间内看不到走廊上的人，反之亦然。
  function loadRoomLocal(roomId) {
    const room = WORLD.roomById(roomId);
    if (!room) return false;
    zoneId = room.id; zoneName = room.name; zoneRoom = room;
    furniture = room.furniture.slice(); walls = room.walls.slice();
    occluders = WORLD.roomBlockers(room.id);
    containers = furniture.filter(f => f.container);
    npcs = []; portals = [];
    return true;
  }
  // 权威空间切换（快照对账 / 进入 / 离开都走这里），保证渲染与权威状态同帧切换。
  function adoptZone(nextZone, position) {
    const target = nextZone || null;
    if (target === zoneId) return false;
    if (target) { if (!loadRoomLocal(target)) { loadFloorLocal(floorId); return false; } }
    else loadFloorLocal(floorId);
    if (position) {
      const authoritative = selfPlayer();
      if (authoritative) { authoritative.x = position.x; authoritative.y = position.y; }
    }
    // 进/出房间切换镜头：房间整间铺满，楼层回到半层视野。
    applyViewport();
    // 插值从权威坐标重新播种，避免"从走廊瞬移到房间"的残影。
    for (const p of players) {
      if (p.floorId !== floorId || (p.zoneId || null) !== target) continue;
      const seed = (p.id === selfId() && position) ? position : { x: p.x, y: p.y };
      renderMap.set(p.id, { x: seed.x, y: seed.y, walk: 0, moving: false });
    }
    closeExploration(); closeLoot(); closeElevatorPicker();
    $('candidates').hidden = true; $('candidates').replaceChildren();
    selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); clearPrivate(true);
    nearbySig = ''; labels = []; keys.clear(); lastIntent = '';
    sendIntent(true);
    syncZoneBanner();
    const self = selfPlayer();
    if (self) {
      const cam = WORLD.zoneCamera(floorId, zoneId, viewW, viewH, self.x, self.y);
      cameraX = cam.x; cameraY = cam.y; drawCamX = cameraX; drawCamY = cameraY;
    }
    updateExplorationHUD();
    draw();
    return true;
  }
  function syncZoneBanner() {
    const banner = $('zone-banner'), name = $('zone-banner-name');
    if (!banner || !name) return;
    banner.hidden = !zoneId;
    if (zoneId) name.textContent = `${floorId}F · ${zoneName}`;
    const chip = $('zone-name'), coord = $('coordinate');
    if (chip) chip.textContent = zoneId ? zoneName : floorName;
    if (coord) coord.textContent = zoneId ? `${floorId}F · ${zoneName}` : `${floorId}F / 7F`;
  }
  loadFloorLocal(1);
  // 互动、结束条件、计分与转盘全部读服务端共享配置（window.WORLD），客户端不新增硬编码数值。
  // world.js 尚未导出新契约时用等价兜底，避免旧版本直接抛错。
  const RULES = WORLD.RULES || { endRemainingPlayers: 100, timeLimitMs: 7200000 };
  // ---------- 已拆分到 js/core/* 与 js/render/* 的自包含工具（别名回本地，调用点零改动）----------
  const { CHUNK, CHUNK_CACHE_LIMIT, pruneChunks, chunkFor, ensureChunks, get: chunkGet, clear: chunkClear } = SID.chunks;
  const { WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool } = SID.wheel;
  const { shade, SKIN } = SID.paint;
  const { escapeText, commandId } = SID.text;
  const canvas = $('office'), ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  // 背景：固定 512×512 分块，按相机矩形枚举相交块；每块惰性烘焙一次后复用，与视口宽度解耦。
  const glowSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,214,158,1)'); rg.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return c;
  })();
  let vignette = null;
  function rebuildVignette() {
    const w = Math.max(1, Math.round(cssW)), h = Math.max(1, Math.round(cssH));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(w / 2, h * .44, Math.min(w, h) * .3, w / 2, h * .48, Math.max(w, h) * 1.02);
    rg.addColorStop(0, 'rgba(255,216,152,.05)'); rg.addColorStop(.55, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(6,4,10,.42)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h); vignette = c;
  }
  // 视区尺寸/DPR 变化时重建 backing，并重新设置 transform 与 imageSmoothingEnabled。
  // 视野分两种：楼层 = 固定半层宽（方案 B）；独立房间 = 整间屋子铺满视区（进门自动"放大"）。
  function applyViewport() {
    const room = zoneId ? WORLD.roomById(zoneId) : null;
    if (room) {
      scale = Math.min(cssW / room.width, cssH / room.height);
    } else {
      scale = cssW / CAMERA_W;
    }
    viewW = cssW / scale; viewH = cssH / scale;
    // 楼层：视区高不超过楼层高的 1.5 倍，避免超宽/超宽屏把镜头拉到虚空里。
    if (!room && viewH > FLOOR_H * 1.5) { viewH = FLOOR_H * 1.5; scale = cssH / viewH; viewW = cssW / scale; }
  }
  function resizeCanvas() {
    const cw = Math.max(1, Math.round(canvas.clientWidth || cssW || 960));
    const ch = Math.max(1, Math.round(canvas.clientHeight || cssH || 640));
    cssW = cw; cssH = ch;
    dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (cw * ch)));
    applyViewport();
    const bw = Math.max(1, Math.round(cw * dpr)), bh = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    rebuildVignette();
    window.__viewport = { cssW: cw, cssH: ch, viewW, viewH, scale, drawCamX, drawCamY, dpr };
  }
  // 明暗派生：所有渐变色都由公开颜色计算，不引入新的身份线索。
  // 肤色与发型只由「发色」这一公开属性推导，避免与阵营产生统计关联。

  // ---------- 权威状态（全部来自服务端快照） ----------
  let players = [], logs = [], me = null;
  let finished = false, aliveCount = 0, outCount = 0, serverTime = Date.now();
  let selectedId = null, clock = 0;
  // 电梯过渡状态机：IDLE_SOURCE → PREPARING → SUBMITTING → TARGET_READY → OPENING → IDLE_TARGET
  // 失败分 FAILED_SOURCE（已证实未换层，恢复源层）与 UNCONFIRMED（结果不明，只读对账）。
  let floorState = 'IDLE_SOURCE', floorFlight = null, floorPending = null;
  // 电梯选层面板：不分方向的电梯，进门（E / 点击）先弹选层（1–7，禁当前层），选定后才发起换层。
  let elevatorPicker = null; // { portalId }
  let floorStartedAt = 0, floorNoticeTimer = null, floorStageTimer = null, roundId = null;
  let privateOpen = false, mineOpen = false, pending = null, privateResult = '';
  let sessionGeneration = 0, privateGeneration = 0, explorationGeneration = 0;
  let explorationPanel = null, explorationResult = '', interactionFlight = null;
  let explorationDataSig = '', nearbySig = '';
  const revealedFieldIds = new Set();
  let devCsrf = null, resetBusy = false;
  let sessionToken = null, stream = null, awaitingFirst = true, lastSkillTick = -1;
  // dev 分支并入：单点登录状态、匿名坏人线索池、摘要确认集合与开发 NPC 忙标志。
  let ssoRequired = false, ssoLoginUrl = '', ssoLogoutUrl = '', loginRedirecting = false;
  let badSlots = [], badPoolAvailable = false, lastBadPoolSig = '';
  let npcBusy = false;
  const confirmedDigests = new Set(); // 只有服务端 ACK 成功后才登记
  let lastTargetSig = '', lastLogSig = '', lastRosterSig = '';
  const offlineEvents = new Set();
  const renderMap = new Map();
  const keys = new Set();
  let lastIntent = '', toastTimer;
  // 新增互动状态：仅在自身私有投影与公开投影之间读取，不引入任何新身份线索。
  let serverPerfBase = performance.now(), combatResult = '', gamesResult = '';
  let combatFlight = null, gamesFlight = null, gamesDomReady = false;
  // 猜拳本地乐观状态：与权威 pending.ownChoice / ownRevision 通过修订号屏障对齐，避免旧响应回滚。
  let rpsLocalChoice = null, rpsRevision = 0, rpsAckRevision = 0, rpsRemoteRevision = 0;
  let rpsChooseFlight = null, rpsChoosePending = null, rpsUnconfirmed = false;
  let rpsResultDismissId = null, rpsAutoId = null, rpsAutoPhase = null, rpsLastSelfGlyph = '', rpsLastOppGlyph = '';
  let snapshotGen = 0; // 每次快照自增；防止旧 HTTP 响应覆盖已更新的快照投影
  // 新增：大转盘覆盖层 / 排行榜 / 结算（均只读私有投影与公开投影，不新增身份线索）。
  let wheelOpen = false, wheelTarget = null, wheelSlots = null, wheelAngle = 0, wheelAnim = 0, wheelAnimating = false;
  let wheelSpinFlight = null, wheelResult = '';
  let playerCache = new Map(), skinCache = new Map(), rosterCache = [];
  let rulesInfo = null, finishReason = '', rankingList = null, achievementList = null, achievementLeaders = [], rankingTab = 'score', finishShown = false, lastRankingSig = '', lastFinishSig = '';
  // serverTime 只在快照到达时更新；本地用单调时钟插值，避免计时与动画在快照间隙抖动/闪烁。
  function serverNow() { return serverTime + (performance.now() - serverPerfBase); }
  function selfDisabled() {
    if (!me || !me.combat) return false;
    const t = serverNow();
    return t < (me.combat.stunUntil || 0) || t < (me.combat.freezeUntil || 0);
  }

  function selfId() { return me ? me.id : -1; }
  function selfPlayer() { return players.find(p => p.id === selfId()) || null; }
  function showToast(message) {
    const toast = $('copy-toast');
    clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; toast.textContent = ''; }, 1800);
  }

  // ---------- 网络：意图上行 + SSE 快照下行 ----------
  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = sessionToken || localStorage.getItem('sid_session_token');
    const user = localStorage.getItem('sid_user_token');
    if (token) h['X-Sid-Session'] = token;
    if (user) h['User-Token'] = user;
    return h;
  }
  async function api(path, body, method) {
    const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: headers(), body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (data && data.auth === false) {
      localStorage.removeItem('sid_user_token');
      redirectLogin();
    }
    return { ...data, status: res.status };
  }
  // Insecure LAN contexts have no crypto.randomUUID, so the command id is random string based.
  // 换层保护字段：所有可能驱动移动/互动的上行请求都带上 roundId 与 expectedFloorRevision，
  // 让服务端丢弃换层前按住的迟到指令（不静默放行）。技能 /api/skill 不受楼层限制，不带这些字段。
  function floorFields() {
    const f = {};
    if (roundId) f.roundId = roundId;
    if (me && typeof me.floorRevision === 'number') f.expectedFloorRevision = me.floorRevision;
    return f;
  }
  function sendIntent(force) {
    const sig = ['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft', 'KeyS', 'ArrowDown', 'KeyD', 'ArrowRight'].map(c => keys.has(c) ? 1 : 0).join('');
    if (!force && sig === lastIntent) return;
    lastIntent = sig;
    api('/api/input', {
      up: keys.has('KeyW') || keys.has('ArrowUp'),
      down: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      ...floorFields()
    }).catch(() => { });
  }
  // 停止意图也带楼层保护字段；换层期间只发送零移动，绝不携带换层指令。
  function stopIntent() { return api('/api/input', { up: false, down: false, left: false, right: false, ...floorFields() }); }
  function openStream() {
    const token = sessionToken || localStorage.getItem('sid_session_token');
    if (stream) { try { stream.close(); } catch { } }
    awaitingFirst = true;
    // EventSource cannot set headers, so the reconnect token rides in the query string.
    // It is the same random credential as the HttpOnly cookie; identity is never derived
    // from a nickname.
    // EventSource 不能带自定义头，CAS 会话与重连令牌一样走查询串（与 HttpOnly Cookie 同值）。
    const user = localStorage.getItem('sid_user_token');
    const query = new URLSearchParams();
    if (token) query.set('sid_token', token);
    if (user) query.set('user_token', user);
    const qs = query.toString();
    stream = new EventSource(qs ? `/api/stream?${qs}` : '/api/stream');
    const activeStream = stream, generation = sessionGeneration;
    stream.addEventListener('reset', () => { if (stream === activeStream) resetToJoin(); });
    stream.onmessage = event => {
      if (stream !== activeStream || generation !== sessionGeneration) return;
      try { applySnapshot(JSON.parse(event.data)); } catch { }
    };
    stream.onerror = () => { /* EventSource retries on its own with the advertised retry. */ };
  }
  async function join(nickname) {
    const r = await api('/api/join', ssoRequired ? {} : { nickname: String(nickname || '').slice(0, 8) });
    if (r.auth === false) return;
    if (r.status !== 200 || !r.ok) {
      $('join-error').textContent = r.error || '加入失败';
      $('join-page').hidden = false;
      if (ssoRequired) { $('nickname').hidden = true; $('join-submit').hidden = false; $('join-submit').textContent = '进入办公室'; $('join-submit').dataset.mode = 'join'; }
      return;
    }
    sessionToken = r.sessionToken;
    localStorage.setItem('sid_session_token', r.sessionToken);
    const host = (r.lan && r.lan[0]) || location.hostname || '127.0.0.1';
    localStorage.setItem('sid_lan', `http://${host}:${r.port || location.port || 8787}`);
    $('lan-address').textContent = localStorage.getItem('sid_lan');
    $('join-page').hidden = true;
    const snapshot = await api('/api/state', null, 'GET').catch(() => null);
    if (snapshot) applySnapshot(snapshot);
    openStream();
    loadCapabilities();
  }
  // ---------- CAS 单点登录（dev 分支并入） ----------
  function serviceUrl() { return location.origin + location.pathname; }
  function redirectLogin() {
    if (loginRedirecting) return;
    loginRedirecting = true;
    if (!ssoLoginUrl) { loginRedirecting = false; showRelogin('无法打开单点登录'); return; }
    const service = encodeURIComponent(serviceUrl());
    location.href = ssoLoginUrl.includes('{service}')
      ? ssoLoginUrl.replace('{service}', service)
      : ssoLoginUrl + (ssoLoginUrl.includes('?') ? '&' : '?') + 'service=' + service;
  }
  function redirectLogout() {
    localStorage.removeItem('sid_user_token');
    localStorage.removeItem('sid_session_token');
    sessionToken = null;
    if (stream) { try { stream.close(); } catch { } stream = null; }
    const logout = ssoLogoutUrl || String(ssoLoginUrl || '').split('?')[0].replace(/\/login\/?$/, '/logout');
    if (!logout) { showRelogin('已退出本局'); return; }
    loginRedirecting = true;
    location.href = logout;
  }
  function showRelogin(message) {
    $('join-page').hidden = false;
    $('join-hint').textContent = message;
    $('join-error').textContent = '';
    $('nickname').hidden = true;
    $('join-submit').hidden = false;
    $('join-submit').textContent = '重新登录';
    $('join-submit').dataset.mode = 'relogin';
  }
  function showUser(user) {
    if (!user) return;
    const el = $('sso-user');
    el.hidden = false;
    el.textContent = `${user.name || user.emp_no}（${user.emp_no}）`;
    $('sso-logout').hidden = false;
  }
  async function ensureLogin() {
    const params = new URLSearchParams(location.search);
    const ticket = params.get('ticket');
    if (ticket) history.replaceState(null, '', location.pathname + location.hash);
    let token = localStorage.getItem('sid_user_token');
    if (ticket && !token) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket, service: serviceUrl() })
        });
        const data = await res.json();
        if (data.token) { token = data.token; localStorage.setItem('sid_user_token', token); if (data.user && data.user.emp_no) return data.user; }
      } catch { /* 没有换到会话时再提示重试 */ }
      if (!token) { showRelogin('单点登录失败，请重试'); return null; }
    }
    if (!token) { redirectLogin(); return null; }
    const profile = await api('/api/auth/me', null, 'GET').catch(() => null);
    if (profile && profile.emp_no) return profile;
    if (profile && profile.auth === false) return null;
    showRelogin('无法确认登录状态');
    return null;
  }

  async function boot() {
    let cfg = { required: false, loginUrl: '' };
    try { cfg = await (await fetch('/api/auth/config')).json(); } catch { cfg = { required: false, loginUrl: '' }; }
    ssoRequired = !!cfg.required;
    ssoLoginUrl = cfg.loginUrl || '';
    ssoLogoutUrl = cfg.logoutUrl || '';
    if (!ssoRequired) {
      sessionToken = localStorage.getItem('sid_session_token');
      const storedLan = localStorage.getItem('sid_lan');
      if (storedLan) $('lan-address').textContent = storedLan;
      const s = await api('/api/state', null, 'GET').catch(() => ({}));
      if (s && s.me && s.me.id !== undefined) { applySnapshot(s); $('join-page').hidden = true; openStream(); loadCapabilities(); }
      else { localStorage.removeItem('sid_session_token'); sessionToken = null; $('join-page').hidden = false; }
      requestAnimationFrame(frame);
      return;
    }
    // CAS 单点登录模式：先确认身份，再决定是否需要加入新局。
    $('nickname').hidden = true;
    $('join-submit').hidden = true;
    $('join-hint').textContent = '正在通过单点登录确认身份…';
    $('join-page').hidden = false;
    const user = await ensureLogin();
    if (!user) { requestAnimationFrame(frame); return; }
    showUser(user);
    sessionToken = localStorage.getItem('sid_session_token');
    const storedLan = localStorage.getItem('sid_lan');
    if (storedLan) $('lan-address').textContent = storedLan;
    const s = await api('/api/state', null, 'GET').catch(() => ({}));
    if (s && s.auth === false) { requestAnimationFrame(frame); return; }
    if (s && s.me && s.me.id !== undefined) { applySnapshot(s); $('join-page').hidden = true; openStream(); loadCapabilities(); }
    else { localStorage.removeItem('sid_session_token'); sessionToken = null; await join(); }
    requestAnimationFrame(frame);
  }

  // ---------- 快照消费 ----------
  function applySnapshot(s) {
    if (!s || s.type !== 'snapshot') return;
    snapshotGen++;
    if (s.me && me && (s.me.id !== me.id || s.me.sid !== me.sid || s.me.faction !== me.faction)) {
      sessionGeneration++; interactionFlight = null; clearPrivate(true); closeExploration(); closeWheel(); closeGames();
      // 身份切换：清空猜拳本地乐观状态与队列，隔离旧响应生成。
      rpsLocalChoice = null; rpsRevision = 0; rpsAckRevision = 0; rpsRemoteRevision = 0;
      rpsChooseFlight = null; rpsChoosePending = null; rpsUnconfirmed = false;
      rpsResultDismissId = null; rpsAutoId = null; rpsAutoPhase = null; rpsLastSelfGlyph = ''; rpsLastOppGlyph = '';
    }
    glassDoorStates = Object.fromEntries((s.glassDoors || []).map(d => [d.id, { open: d.open }]));
    serverTime = s.serverTime || Date.now();
    if (s.roundId) roundId = s.roundId;
    serverPerfBase = performance.now();
    finished = !!s.finished;
    if (s.rules) rulesInfo = s.rules;
    rankingList = Array.isArray(s.ranking) ? s.ranking : null;
    achievementList = Array.isArray(s.rankingAchievement) ? s.rankingAchievement : null;
    achievementLeaders = Array.isArray(s.achievementLeaders) ? s.achievementLeaders : [];
    if (typeof s.finishReason === 'string') finishReason = s.finishReason;
    if (Array.isArray(s.logs)) logs = s.logs;
    // LOD/skins merge: keep entities that are missing from this frame (far ring is 5Hz).
    if (s.skins) for (const [sid, v] of Object.entries(s.skins)) skinCache.set(Number(sid), v);
    if (Array.isArray(s.roster)) rosterCache = s.roster;
    if (s.players && (s.lod || s.skins)) {
      for (const pp of s.players) playerCache.set(pp.id, pp);
      players = [...playerCache.values()].map(pp => (pp.colors ? pp : Object.assign({}, pp, skinCache.get(pp.id) || {})));
    } else {
      players = s.players || [];
      playerCache = new Map(players.map(pp => [pp.id, pp]));
      if (skinCache.size) players = players.map(pp => (pp.colors ? pp : Object.assign({}, pp, skinCache.get(pp.id) || {})));
    }
    badPoolAvailable = Array.isArray(s.badSlots);
    badSlots = badPoolAvailable ? s.badSlots : [];
    renderBadPool();
    // 存活/淘汰按服务端全量计数：迷雾层只下发附近玩家，不能拿过滤后的名单去数。
    aliveCount = typeof s.aliveCount === 'number' ? s.aliveCount : players.filter(p => p.alive).length;
    const totalPlayers = rosterCache.length || players.length;
    outCount = Math.max(0, totalPlayers - aliveCount);
    if (s.me && s.me.id !== undefined) {
      // The first snapshot after (re)connecting carries everything queued while offline.
      if (awaitingFirst) { for (const e of (s.me.pending || [])) offlineEvents.add(e.eventId); awaitingFirst = false; }
      me = s.me;
      // 已确认过的摘要不再重复提示（失败/重连时保持同一摘要可用）。
      if (me.interactionSummary && confirmedDigests.has(`${me.interactionSummary.epoch}:${me.interactionSummary.id}`)) {
        me = { ...me, interactionSummary: null };
      }
      // Do not interrupt the already-running old round: render its two actual skills
      // with their correct effects until the host schedules a server restart.
      if (me.skills.action) me = { ...me, legacy: true, skills: me.faction === 'bad'
        ? { spy: me.skills.probe, kill: me.skills.action }
        : { probe: me.skills.probe, accuse: me.skills.action } };
      // 权威楼层采纳：非过渡期间若服务端楼层与本地不同（例如重连、被动换层、换层结果未确认后
      // 权威对账），整层原子切换。UNCONFIRMED/FAILED_SOURCE 在对账成立后收敛回 IDLE。
      if (floorFlight && floorFlight.submitted && me.floorId === floorFlight.targetFloorId &&
          me.floorRevision > floorFlight.expectedFloorRevision &&
          (floorState === 'SUBMITTING' || floorState === 'UNCONFIRMED')) {
        const authoritative = selfPlayer();
        floorArrived(floorFlight, { floor: { id: me.floorId, name: me.floorName, revision: me.floorRevision },
          position: authoritative && { x: authoritative.x, y: authoritative.y } });
      } else if (me.floorId && me.floorId !== floorId && !floorFlight) {
        adoptFloor(me.floorId);
      }
      // 需求①：权威空间对账。进入/离开房间与重连都由服务端决定，客户端只跟随权威 zoneId，
      // 因此别人把你踢出房间、或你换层后残留的旧 zone 都会被这一行收敛。
      const authZone = me.zoneId || null;
      if (authZone !== zoneId) {
        const authoritative = players.find(p => p.id === me.id);
        adoptZone(authZone, authoritative ? { x: authoritative.x, y: authoritative.y } : null);
      }
    }
    occluders = zoneId ? WORLD.roomBlockers(zoneId) : WORLD.floorBlockers(floorId, glassDoorStates);
    for (const p of players) if (!renderMap.has(p.id)) renderMap.set(p.id, { x: p.x, y: p.y, walk: 0, moving: false });
    if (selectedId !== null && !players.some(p => p.id === selectedId)) { clearPrivate(); selectedId = null; }
    renderPublic();
    syncTarget();
    if (mineOpen) renderMine();
    syncExploration(); updateExplorationHUD();
    syncRpsLifecycle(); syncGames(); updateCombatHUD();
    updateOfflineUI();
    updateScoreDisplay(); syncTimeLeft(); syncRanking();
    if (wheelOpen) updateWheelControls();
    // 结算只自动弹出一次：关闭后不因 20Hz 快照反复弹出，新一轮开始时重置。
    if (finished) {
      if (!$('finish-overlay').hidden) renderFinish();
      else if (!finishShown) { finishShown = true; showFinish(); }
    } else {
      finishShown = false;
      if (!$('finish-overlay').hidden) hideFinish();
    }
  }

  // ---------- 名单 / 日志 / 目标档案 ----------
  function portrait(p) {
    const c = p.colors;
    const hi = Math.max(0, palettes.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], hair = c.hair[1], style = hi % 4;
    const sides = style === 1
      ? `<path fill="${shade(hair, -.12)}" d="M3 6h3v11H3zM18 6h3v11h-3z"/>`
      : `<path fill="${shade(hair, -.3)}" d="M3 6h3v7H3zM18 6h3v7h-3z"/>`;
    const extra = style === 2 ? `<path fill="${shade(hair, -.2)}" d="M20 9h3v9h-3z"/>`
      : style === 3 ? `<path fill="${hair}" d="M9 0h6v4H9z"/><path fill="${shade(hair, .28)}" d="M10 1h4v1h-4z"/>` : '';
    return `<svg class="portrait" viewBox="0 0 24 32" aria-hidden="true">`
      + `<path fill="#1d1720" d="M4 0h16v17H4zM1 12h22v16H1zM2 24h20v8H2z"/>`
      + extra + sides
      + `<path fill="${hair}" d="M5 2h14v6H5z"/><path fill="${shade(hair, .3)}" d="M6 3h8v1H6z"/>`
      + `<path fill="${skin}" d="M6 7h12v9H6z"/>`
      + `<path fill="#2b2230" d="M8 10h2v2H8zM14 10h2v2h-2z"/><path fill="#f2f7ff" d="M8 10h1v1H8zM14 10h1v1h-1z"/>`
      + `<path fill="${shade(skin, -.3)}" d="M11 13h2v1h-2z"/><path fill="#a8706a" d="M10 15h4v1h-4z"/>`
      + `<path fill="${shade(skin, -.25)}" d="M10 16h4v2h-4z"/>`
      + `<path fill="${c.top[1]}" d="M5 17h14v10H5z"/><path fill="${shade(c.top[1], .25)}" d="M5 17h14v2H5z"/>`
      + `<path fill="${shade(c.top[1], -.3)}" d="M11 17h2v5h-2z"/>`
      + `<path fill="${shade(c.top[1], -.22)}" d="M2 18h3v8H2zM19 18h3v8h-3z"/>`
      + `<path fill="${skin}" d="M2 25h3v2H2zM19 25h3v2h-3z"/>`
      + `<path fill="${shade(c.pants[1], -.1)}" d="M6 27h5v4H6zM13 27h5v4h-5z"/>`
      + `<path fill="${c.pants[1]}" d="M6 27h5v1H6zM13 27h5v1h-5z"/>`
      + `<path fill="${c.shoes[1]}" d="M4 30h7v2H4zM13 30h7v2h-7z"/>`
      + `</svg>`;
  }
  // 名单搜索只读 public 投影：姓名、四种公开颜色、以及已公开的隐藏属性。
  // 未公开的 *** 永不进入候选，因此搜不到也推不出。
  function searchFields(p) {
    const fields = [{ key: 'name', label: '姓名', text: p.name }];
    for (const k of Object.keys(fieldNames)) fields.push({ key: k, label: fieldNames[k], text: p.colors[k][0] });
    for (const k of Object.keys(traitNames)) if (p.traits[k] !== MASK) fields.push({ key: k, label: traitNames[k], text: p.traits[k] });
    return fields;
  }
  function matchPublic(p, query) {
    if (!query) return [];
    return searchFields(p).filter(f => f.text.toLowerCase().includes(query) || (traitNames[f.key] && f.label === query));
  }
  function matchHint(hits) {
    const shown = (hits || []).filter(h => h.key !== 'name');
    if (!shown.length) return '';
    const text = shown.slice(0, 2).map(h => `${escapeText(h.label)}：${escapeText(h.text)}`).join(' · ');
    return `<small class="roster-match">${text}${shown.length > 2 ? ` 等${shown.length}项` : ''}</small>`;
  }
  function row(p, hits) {
    const tag = !p.alive ? '<span class="out-label">淘汰</span>'
      : p.id === selfId() ? '<span class="self-label">自己</span>'
        : p.online === false ? '<span class="offline-tag">离线</span>' : '';
    return `<button class="roster-row${p.id === selectedId ? ' active' : ''}" data-player="${p.id}">${portrait(p)}<span><strong>${escapeText(p.name)}</strong><small>${sidHTML(p.sid)}</small>${matchHint(hits)}</span>${tag}</button>`;
  }
  function bindRows(container) { container.querySelectorAll('[data-player]').forEach(b => b.onclick = () => select(Number(b.dataset.player))); }
  function renderRoster() {
    if ($('roster').hidden) return;
    const query = $('search').value.trim().toLowerCase();
    // 20Hz position snapshots must not replace a button between pointerdown/pointerup.
    const sig = JSON.stringify([query, selectedId, players.map(({ x, y, ...p }) => p)]);
    if (sig === lastRosterSig) return;
    lastRosterSig = sig;
    const result = players.map(p => ({ p, hits: matchPublic(p, query) })).filter(r => !query || r.hits.length);
    $('roster-items').innerHTML = result.length ? result.map(r => row(r.p, r.hits)).join('') : '<p class="panel-note">没有匹配的公开信息</p>';
    bindRows($('roster-items'));
  }
  function renderLogs() {
    const mine = me ? me.name : null;
    $('log-count').textContent = logs.length;
    // 常驻栏只在公开日志或本人标记变化时更新，避免20Hz刷新打断阅读与滚动。
    const sig = JSON.stringify([mine, logs]);
    if (sig === lastLogSig) return;
    lastLogSig = sig;
    const list = $('log-items');
    const scrollTop = list.scrollTop;
    // 涉及自己的条目仅对自己高亮：不新增任何信息，只是把已有的公开条目标出来。
    list.innerHTML = logs.length ? logs.map(l => `<li${mine && l.text.includes(mine) ? ' class="log-mine"' : ''}><time>${escapeText(l.time)}</time><p>${escapeText(l.text).replace(/[A-Z0-9*]{3}-[A-Z0-9*]{3}-[A-Z0-9*]{3}/g, sidHTML)}</p></li>`).join('') : '<li class="log-empty"><p>暂无公共事件</p></li>';
    list.scrollTop = scrollTop;
  }
  function renderPublic() {
    $('alive-count').textContent = aliveCount;
    $('out-count').textContent = outCount;
    $('player-count').textContent = `${players.length} 位玩家 · 服务端权威${finished ? ' · 游戏已结束' : ''}`;
    $('roster-count').textContent = players.length;
    renderRoster(); renderLogs();
  }
  function selected() { return selectedId === null ? null : players.find(p => p.id === selectedId) || null; }
  function syncTarget() {
    const p = selected();
    const sig = p ? JSON.stringify([(({ x, y, ...profile }) => profile)(p), isInviteable(p), me?.games?.rpsPending?.id || null, me?.games?.rpsResult?.id || null]) : '';
    if (sig === lastTargetSig) { if (holding()) updateSkillStatus(); return; }
    lastTargetSig = sig;
    renderTarget();
  }
  function clearPrivate(clearMy) {
    privateGeneration++; privateOpen = false; pending = null; privateResult = '';
    const block = $('private-content'); if (block) block.replaceChildren();
    const gate = $('private-gate'); if (gate) { gate.textContent = '展开私密操作'; gate.setAttribute('aria-expanded', 'false'); }
    if (clearMy) {
      closeMine();
      $('offline-summary').hidden = true; $('offline-summary').replaceChildren();
    }
  }
  // 切出页面 / 失焦 / pointercancel 统一入口：清空方向集合、释放指针捕获、只发一次零移动意图；
  // 绝不在此触发或重发换层指令（换层只由显式 E / 点击入口发起，且提交后不重复）。
  const pointerIds = new Set();
  canvas.addEventListener('pointerdown', e => pointerIds.add(e.pointerId));
  function clearAllInput(e) {
    keys.clear();
    if (e && typeof e.pointerId === 'number') pointerIds.add(e.pointerId);
    for (const id of pointerIds) { try { if (canvas.hasPointerCapture && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch { } }
    pointerIds.clear();
    // blur 与 hidden 连续发生时零意图签名去重；不重发任何换层 POST。
    sendIntent(false); clearPrivate(true); closeExploration(); closeWheel();
  }
  function select(id) {
    closeExploration(); clearPrivate(true); closeGames(); closeWheel(); selectedId = id;
    $('candidates').hidden = true; $('candidates').replaceChildren();
    lastTargetSig = ''; renderTarget(); renderRoster();
  }
  function renderTarget() {
    const p = selected();
    if (!p) { $('target').hidden = true; $('target').replaceChildren(); return; }
    $('target').hidden = false;
    const status = p.alive ? '存活 · 公开档案' : '已淘汰 · 可查看，不可操作';
    $('target').innerHTML = `<div class="panel-heading"><span class="eyebrow">PUBLIC PROFILE</span><button id="target-close" class="icon-button" aria-label="关闭目标档案">×</button></div><div class="target-person">${portrait(p)}<div><h2>${escapeText(p.name)}</h2><p class="sid">${sidHTML(p.sid)}</p><p class="status">${status}${p.id === selfId() ? ' · 自己' : ''}</p></div></div><div class="color-grid">${Object.entries(p.colors).map(([k, c]) => `<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${c[0]}</div>`).join('')}</div><div class="traits">${Object.entries(p.traits).map(([k, v]) => `<div class="trait"><span>${traitNames[k]}</span><strong>${escapeText(v)}</strong></div>`).join('')}</div>${p.id !== selfId() && p.alive ? `<div class="player-interactions"><button id="target-invite-rps" class="target-invite-rps" type="button"${isInviteable(p) ? '' : ' disabled'}>邀请猜拳</button><button id="target-invite-minigame" class="target-invite-rps" type="button"${isInviteable(p) ? '' : ' disabled'}>小游戏</button><p id="target-rps-note" class="hold-note">${me?.games?.rpsPending ? '已有猜拳进行中，请先结束当前邀请或对战' : rpsNow() < (me?.games?.rpsUntil || 0) ? '猜拳冷却中，请稍后再试' : !isInviteable(p) ? '需靠近至 64 像素内、无遮挡且双方在线' : '发送邀请，对方同意后开始十秒猜拳'}</p>${me?.games?.rpsPending || me?.games?.rpsResult ? '<button id="target-return-rps" type="button">返回猜拳对战</button>' : ''}</div>` : ''}<button id="private-gate" class="private-gate" aria-expanded="${privateOpen}">${privateOpen ? '收起私密操作' : '展开私密操作'}</button><p class="hold-note">点击展开或收起 · 展开期间请注意周围视线 · 切出页面自动隐藏</p><div id="private-content"></div>`;
    $('target-close').onclick = () => { clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); };
    const minigameBtn = $('target-invite-minigame');
    if (minigameBtn) minigameBtn.onclick = () => { if (SID.minigame) SID.minigame.open({ opponentId: p.id }); };
    const inviteBtn = $('target-invite-rps');
    if (inviteBtn) inviteBtn.onclick = () => { if (isInviteable(selected())) sendRps({ kind: 'rpsInvite', targetId: selected().id }); };
    const returnBtn = $('target-return-rps');
    if (returnBtn) returnBtn.onclick = () => { rpsResultDismissId = null; openGames(); };
    $('private-gate').onclick = () => {
      if (privateOpen) clearPrivate();
      else { closeExploration(); closeGames(); privateOpen = true; renderPrivate(); $('private-gate').textContent = '收起私密操作'; $('private-gate').setAttribute('aria-expanded', 'true'); }
    };
    if (holding()) renderPrivate();
  }
  // ---------- 私密操作（点击展开，不再依赖 Shift） ----------
  function holding() { return privateOpen; }
  const secondsLeft = until => Math.max(0, Math.ceil((Number(until || 0) - serverTime) / 1000));
  const skillNames = { probe: '探查', accuse: '指认', spy: '刺探', kill: '击杀' };
  function availableSkills() {
    // Old running servers may still have action. Keep reading them until a planned restart.
    if (!me) return [];
    return Object.keys(me.skills).filter(id => skillNames[id]);
  }
  function hasUnknown(p, id) {
    return id === 'probe' ? Object.keys(traitNames).some(k => p.traits[k] === MASK)
      : id === 'spy' ? String(p.sid).split('-').includes(MASK) : true;
  }
  function canTarget(p) { return !!(p && me && p.id !== me.id && p.alive && me.alive && !finished); }
  function skillStatus(id, skill) {
    const cooldown = secondsLeft(skill.cooldownUntil);
    return `${skillNames[id]} ${skill.chargesRemaining}/${skill.maxCharges} · ${cooldown ? `冷却 ${cooldown}s` : '就绪'} · ${skill.nextChargeAt ? `${secondsLeft(skill.nextChargeAt)}s 后 +1` : '储存已满'}`;
  }
  function renderPrivate() {
    const host = $('private-content'), p = selected(); if (!host) return;
    if (!holding() || !p || !me) { host.replaceChildren(); return; }
    const ids = availableSkills();
    host.innerHTML = `<div class="private-block"><p class="private-title">${me.faction === 'good' ? '好人' : '坏人'}技能 · 私密操作已展开</p><div class="skill-row">${ids.map(id => `<button id="${id}" data-skill="${id}" class="${id === 'probe' || id === 'spy' ? 'investigate' : id}">${skillNames[id]}</button>`).join('')}</div><p id="skill-info" class="skill-info"></p><div id="confirm-host"></div><div id="result-host"></div></div>`;
    for (const id of ids) $(id).onclick = () => { if (!holding()) return; pending = { kind: id, target: p.id }; renderConfirmation(); };
    updateSkillStatus(); renderConfirmation(); renderResult();
  }
  function updateSkillStatus() {
    if (!holding() || !me) return;
    const p = selected(), info = $('skill-info'); if (!info || !p) return;
    const ids = availableSkills();
    info.textContent = (!canTarget(p) ? (finished ? '游戏已结束，技能已冻结。 ' : '自己或已淘汰目标不可操作。 ') : '')
      + ids.map(id => skillStatus(id, me.skills[id])).join('；')
      + (me.legacy ? '；运行中服务仍是旧技能版本，四技能需主持人安排重启后生效。' : '');
    for (const id of ids) {
      const skill = me.skills[id], button = $(id);
      if (button) { button.textContent = `${skillNames[id]} ${skill.chargesRemaining}/${skill.maxCharges}`;
        button.disabled = !canTarget(p) || skill.chargesRemaining <= 0 || secondsLeft(skill.cooldownUntil) > 0 || !hasUnknown(p, id); }
    }
  }
  function renderConfirmation() {
    const host = $('confirm-host'); if (!host || !me) return; host.replaceChildren();
    if (!holding() || !pending) return;
    const k = pending.kind;
    host.innerHTML = `<div class="confirm-box"><p>${k === 'probe' ? '公开目标一项未知隐藏属性，消耗一次探查。' : k === 'spy' ? '公开目标一段未知S-ID，消耗一次刺探。' : k === 'accuse' ? '确认指认该目标？有效提交后进入冷却；错指认会公开自己一段S-ID。' : '手动输入目标完整S-ID。示例格式：K8Q-2T9-6R4（仅示例）；严格大写精确匹配，不自动填入。可自由输入或粘贴。'}</p>${k === 'kill' ? '<input id="sid-input" aria-label="输入目标完整S-ID" autocomplete="off" spellcheck="false" placeholder="XXX-XXX-XXX" maxlength="11">' : ''}<button id="confirm">确认${skillNames[k]}</button> <button id="cancel">取消</button></div>`;
    $('confirm').onclick = () => commit($('sid-input') ? $('sid-input').value : '');
    $('cancel').onclick = () => { pending = null; renderConfirmation(); };
  }
  function renderResult() { const r = $('result-host'); if (r) r.innerHTML = holding() && privateResult ? `<p class="private-result">${escapeText(privateResult)}</p>` : ''; }
  async function commit(input) {
    if (!holding() || !pending || !me || pending.target !== selectedId) return false;
    const p = selected(); if (!p) return false;
    const requested = pending.kind;
    const skill = me.legacy ? (requested === 'spy' ? 'probe' : requested === 'accuse' || requested === 'kill' ? 'action' : requested) : requested;
    const body = { commandId: commandId(), skill, targetId: p.id };
    if (pending.kind === 'kill') body.sid = String(input || '');
    const generation = privateGeneration, session = sessionGeneration;
    const result = await api('/api/skill', body).catch(() => ({ ok: false, error: '网络异常，结果未确认' }));
    if (session !== sessionGeneration || generation !== privateGeneration || !holding()) return false;
    privateResult = result.ok ? (result.resultText || '已结算') : (result.error || '结算被拒绝');
    pending = null;
    renderConfirmation(); renderResult(); updateSkillStatus();
    lastTargetSig = '';
    return true;
  }
  // Personal privacy choices are ephemeral: opening is always fully masked.
  function closeMine(returnFocus = false) {
    mineOpen = false; revealedFieldIds.clear();
    $('mine').replaceChildren(); $('mine').hidden = true;
    $('my-info').setAttribute('aria-expanded', 'false');
    if (returnFocus) $('my-info').focus({ preventScroll: true });
  }
  const eyeIcon = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/><path class="eye-slash" d="M3 3 21 21" stroke="currentColor" stroke-width="2"/></svg>';
  const personalFields = { identity: '身份详情', sid: 'S-ID', ...traitNames };
  function renderMine() {
    const host = $('mine');
    if (!mineOpen || !me) { closeMine(); return; }
    host.hidden = false;
    // Build eyes once; snapshot refreshes update only value slots, never focusable controls.
    if (!host.childElementCount) {
      host.innerHTML = `<div class="panel-heading"><div><small>PRIVATE / CLICK TO REVEAL</small><h2 id="mine-name"></h2></div><button id="mine-close" class="icon-button" aria-label="关闭我的信息">×</button></div><p id="mine-alive" class="status"></p><div id="mine-colors" class="color-grid"></div><div class="mine-identity"><div class="secret-line"><span class="identity-label">身份</span><strong id="mine-value-identity">已隐藏</strong><button class="eye-toggle" id="eye-identity" data-field="identity" aria-label="显示身份详情" aria-pressed="false">${eyeIcon}</button></div><div id="mine-identity-details"></div></div>${['sid', ...Object.keys(traitNames)].map(id => `<div class="secret-line mine-field"><span>${personalFields[id]}</span><strong id="mine-value-${id}">${id === 'sid' ? '***-***-***' : '***'}</strong><button class="eye-toggle" id="eye-${id}" data-field="${id}" aria-label="显示${personalFields[id]}" aria-pressed="false">${eyeIcon}</button></div>`).join('')}<p class="hold-note">每次打开默认隐藏。各眼睛独立切换；关闭、切出页面或进入规则页会清空显示。身份眼睛同时隐藏血量和技能信息，避免通过技能数量推断好坏身份。</p>`;
      $('mine-close').onclick = () => { clearPrivate(true); $('my-info').focus({ preventScroll: true }); };
      host.querySelectorAll('[data-field]').forEach(button => button.onclick = () => {
        const id = button.dataset.field;
        if (revealedFieldIds.has(id)) revealedFieldIds.delete(id); else revealedFieldIds.add(id);
        renderMine();
      });
    }
    $('mine-name').textContent = `我的信息 · ${me.name}`;
    $('mine-alive').textContent = (me.alive ? '存活' : '已淘汰') + ` · 本人档案 · 分数 ${typeof me.score === 'number' ? me.score : 0}`;
    const colors = selfPlayer() ? selfPlayer().colors : {};
    const colorHTML = Object.entries(colors).map(([k,c]) => `<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${escapeText(c[0])}</div>`).join('');
    if ($('mine-colors').innerHTML !== colorHTML) $('mine-colors').innerHTML = colorHTML;
    for (const id of Object.keys(personalFields)) {
      const revealed = revealedFieldIds.has(id), value = $(`mine-value-${id}`), eye = $(`eye-${id}`);
      eye.setAttribute('aria-pressed', String(revealed));
      eye.setAttribute('aria-label', `${revealed ? '隐藏' : '显示'}${personalFields[id]}`);
      const html = !revealed ? (id === 'sid' ? '***-***-***' : id === 'identity' ? '已隐藏' : '***')
        : id === 'sid' ? sidHTML(me.sid) : escapeText(id === 'identity' ? (me.faction === 'good' ? '好人' : '坏人') : me.traits[id]);
      if (value.innerHTML !== html) value.innerHTML = html;
    }
    const details = $('mine-identity-details');
    if (!revealedFieldIds.has('identity')) details.replaceChildren();
    else {
      const html = `<div class="secret-line"><span>血量</span><strong>${me.hp}</strong></div><div class="mine-resources">${availableSkills().map(id => `<p>${escapeText(skillStatus(id, me.skills[id]))}</p>`).join('')}</div>`;
      if (details.innerHTML !== html) details.innerHTML = html;
    }
  }
  async function loadCapabilities() {
    devCsrf = null; $('dev-reset').hidden = true; $('dev-npc').hidden = true; $('dev-management').hidden = true;
    const expectedSession = sessionToken;
    try {
      const cap = await api('/api/dev/capabilities', null, 'GET');
      if (expectedSession !== sessionToken || !me) return;
      if (cap.status === 200 && cap.canReset === true && typeof cap.csrfToken === 'string' && cap.csrfToken) {
        devCsrf = cap.csrfToken; $('dev-npc').hidden = false; $('dev-reset').hidden = false; $('dev-management').hidden = false;
      }
    } catch { /* Older backend, denied, or network failure: fail closed. */ }
  }
  function resetToJoin() {
    sessionGeneration++; interactionFlight = null; combatFlight = null; gamesFlight = null; wheelSpinFlight = null;
    if (stream) { stream.close(); stream = null; }
    closeExploration(); closeGames(); clearPrivate(true); closeWheel(); closeRanking(); hideFinish(); keys.clear(); lastIntent = '';
    combatResult = ''; gamesResult = '';
    rpsLocalChoice = null; rpsRevision = 0; rpsAckRevision = 0; rpsRemoteRevision = 0;
    rpsChooseFlight = null; rpsChoosePending = null; rpsUnconfirmed = false;
    rpsResultDismissId = null; rpsAutoId = null; rpsAutoPhase = null; rpsLastSelfGlyph = ''; rpsLastOppGlyph = '';
    rulesInfo = null; finishReason = ''; rankingList = null; finishShown = false; lastRankingSig = '';
    wheelResult = ''; wheelAngle = 0; wheelAnimating = false;
    nearbySig = ''; $('nearby-items').replaceChildren();
    $('copy-toast').hidden = true; $('copy-toast').textContent = ''; clearTimeout(toastTimer);
    sessionToken = null; devCsrf = null;
    localStorage.removeItem('sid_session_token'); localStorage.removeItem('sid_lan');
    players = []; logs = []; me = null; selectedId = null; finished = false; aliveCount = outCount = 0;
    badSlots = []; badPoolAvailable = false; lastBadPoolSig = '';
    $('bad-slots').hidden = true; $('bad-toggle').setAttribute('aria-expanded', 'false');
    $('bad-toggle-label').textContent = '展开＋'; renderBadPool();
    renderMap.clear(); offlineEvents.clear(); confirmedDigests.clear(); lastRosterSig = lastTargetSig = lastLogSig = '';
    $('target').replaceChildren(); $('target').hidden = true;
    $('candidates').replaceChildren(); $('candidates').hidden = true;
    $('offline-summary').replaceChildren(); $('offline-summary').hidden = true;
    $('dev-reset').hidden = true; $('dev-npc').hidden = true; $('dev-management').hidden = true; closeResetDialog(false);
    if ($('rules-view').open) closeRules();
    renderPublic(); renderRoster(); renderLogs(); updateOfflineUI(); updateExplorationHUD();
    syncGames(); updateCombatHUD(); updateScoreDisplay(); syncTimeLeft();
    $('join-page').hidden = false;
    if (ssoRequired) {
      $('nickname').hidden = true;
      $('join-submit').hidden = false;
      $('join-submit').textContent = '进入办公室';
      $('join-submit').dataset.mode = 'join';
      $('join-hint').textContent = '本局已重置。确认后以当前登录身份进入新局。';
      $('join-error').textContent = '';
    } else {
      $('join-error').textContent = '本局已重置，请主动加入新局。';
      $('nickname').hidden = false;
      $('nickname').value = '';
      $('nickname').focus({ preventScroll: true });
    }
  }
  const resetDialog = $('reset-confirm');
  function closeResetDialog(returnFocus = true) {
    if (!resetDialog.open) return;
    resetDialog.close();
    if (returnFocus && !$('dev-reset').hidden) $('dev-reset').focus({ preventScroll: true });
  }
  // 开发用 NPC：新增而非清空，所以不套二次确认弹窗。完整 S-ID 只在这里出现（本机开发可见）。
  $('dev-npc').onclick = async () => {
    if (!devCsrf || npcBusy) return;
    npcBusy = true; $('dev-npc').disabled = true;
    const csrfToken = devCsrf;
    try {
      const result = await api('/api/dev/npc', { count: 1, csrfToken });
      const npc = result && result.npcs && result.npcs[0];
      if (result && result.status === 200 && result.ok && npc) showToast(`已加入好人NPC：${npc.name} · SID ${npc.sid}`);
      else { devCsrf = null; $('dev-npc').hidden = true; showToast((result && result.error) || '添加NPC失败或结果未确认。'); }
    } catch { devCsrf = null; $('dev-npc').hidden = true; showToast('添加NPC结果未确认；请勿重复操作。'); }
    finally { npcBusy = false; $('dev-npc').disabled = false; }
  };
  $('dev-reset').onclick = () => {
    if (resetBusy || !devCsrf) return;
    clearAllInput();
    resetDialog.showModal(); $('reset-cancel').focus({ preventScroll: true });
  };
  $('reset-cancel').onclick = () => closeResetDialog();
  resetDialog.addEventListener('cancel', e => { e.preventDefault(); closeResetDialog(); });
  resetDialog.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeResetDialog(); }
    if (e.key === 'Tab') {
      const first = $('reset-cancel'), last = $('reset-accept');
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  window.addEventListener('blur', () => closeResetDialog(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) closeResetDialog(false); });
  $('reset-accept').onclick = async () => {
    if (!resetDialog.open || resetBusy || !devCsrf) return;
    resetBusy = true; $('dev-reset').disabled = true; $('reset-accept').disabled = true;
    closeResetDialog(false);
    const csrfToken = devCsrf;
    try {
      const result = await api('/api/host/reset', { confirm: true, csrfToken });
      if (result.status === 200 && result.ok && result.reset) resetToJoin();
      else { devCsrf = null; $('dev-reset').hidden = true; $('dev-management').hidden = true; showToast('重置失败或结果未确认；未自动重试。'); }
    } catch { devCsrf = null; $('dev-reset').hidden = true; $('dev-management').hidden = true; showToast('重置结果未确认；请勿重复操作。'); }
    finally { resetBusy = false; $('dev-reset').disabled = false; $('reset-accept').disabled = false; }
  };

  // ---------- 私密探索：权威奖励只读 me.exploration，不进入公开档案 ----------
  function explorationState() { return me?.exploration || { chips: 0, clues: [], searched: [] }; }
  function explorationEntity(kind, id) {
    return kind === 'container' ? containers.find(f => f.id === id) : kind === 'npc' ? npcs.find(n => n.entityId === id) : null;
  }
  function entityDistance(entity) {
    const self = selfPlayer();
    return self && entity ? WORLD.distanceToEntity(self, entity) : Infinity;
  }
  function nearbyEntities() {
    if (!me?.alive || finished) return [];
    const self = selfPlayer();
    const list = [...containers.map(entity => ({ kind: 'container', id: entity.id, entity })),
      ...npcs.map(entity => ({ kind: 'npc', id: entity.entityId, entity }))];
    // 需求①：楼层上的房间门 / 房间内的出口也进入「就近互动」候选，
    // 这样 E 键与 HUD 只需一套排序逻辑，不需要给门单独开一条输入路径。
    const door = roomDoorCandidate();
    if (door) list.push({ kind: 'door', id: door.room.id, entity: { x: door.room.door.x, y: door.room.door.y, name: door.room.name, room: door.room } });
    const exit = roomExitCandidate();
    if (exit) list.push({ kind: 'exit', id: exit.id, entity: { x: exit.exit.x, y: exit.exit.y, name: exit.name, room: exit } });
    // 楼层游戏机：靠近按 E 直接进小游戏大厅（可跨楼层匹配）。
    for (const cab of furniture) {
      if (cab.type !== 'arcade') continue;
      list.push({ kind: 'arcade', id: cab.id, entity: { x: cab.x + cab.w / 2, y: cab.y + cab.h / 2, name: cab.label || '游戏机' } });
    }
    return list
      .filter(({ entity }) => entityDistance(entity) <= WORLD.INTERACT_RANGE)
      .sort((a, b) => entityDistance(a.entity) - entityDistance(b.entity));
  }
  // 需求2：电梯门候选 = 当前层「进入 64px 且面向门（spriteFacing cos≥0.5）」的**最近** portal。
  // 唯一归属 = 最近门（不因另一扇可用就改投）⇒ 站在禁用门前的反馈稳定、不会被悄悄换方向。
  function elevatorTarget() {
    const self = selfPlayer(); if (!self || !me?.alive || finished) return null;
    let best = null, bd = Infinity, bestAccess = null;
    for (const portal of portals) {
      const access = WORLD.portalAccess(self, portal);
      if (!access.inReach || !access.facingOk) continue;
      const d = WORLD.distanceToEntity(self, { x: portal.x, y: portal.y });
      if (d < bd) { bd = d; best = portal; bestAccess = access; }
    }
    return best ? { portal: best, access: bestAccess } : null;
  }
  // ---------- 需求①：房间门（进入 / 离开）----------
  // 门是楼层与房间之间唯一的连接：门外按 E 进入，房间内走到门口按 E 离开。
  // 位置还原由服务端保证（zoneReturn），客户端只提交意图。
  function roomDoorCandidate() {
    const self = selfPlayer();
    if (!self || zoneId || !me?.alive || finished) return null;
    return WORLD.roomDoorNear(floorId, self.x, self.y, WORLD.ROOM_ENTER_PAD);
  }
  function roomExitCandidate() {
    const self = selfPlayer();
    if (!self || !zoneId || !me?.alive || finished) return null;
    const room = WORLD.roomById(zoneId);
    if (!room) return null;
    return Math.hypot(self.x - room.exit.x, self.y - room.exit.y) <= 74 ? room : null;
  }
  let zoneFlight = false;
  async function postZone(path, body, okText) {
    if (zoneFlight || !me) return;
    zoneFlight = true; clearAllInput();
    try {
      const stopped = await stopIntent();
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('stop');
      const r = await api(path, { commandId: commandId(), ...body, ...floorFields() });
      if (!r || r.status !== 200 || !r.ok) { showToast((r && r.error) || '操作未确认，请靠近后再试'); return; }
      const nextZone = r.zone ? r.zone.id : null;
      if (r.floor) me = { ...me, floorId: r.floor.id, floorRevision: r.floor.revision };
      if (r.position) me = { ...me, x: r.position.x, y: r.position.y };
      me = { ...me, zoneId: nextZone };
      if (typeof r.exploration === 'object' && r.exploration) me = { ...me, exploration: r.exploration };
      adoptZone(nextZone, r.position || null);
      showToast(okText || r.resultText || '已完成');
    } catch {
      showToast('网络异常，操作未确认。');
    } finally {
      zoneFlight = false;
    }
  }
  function enterRoom(roomId, roomName) {
    return postZone('/api/zone/enter', { zoneId: roomId }, `进入「${roomName || '房间'}」`);
  }
  function leaveRoom(roomName) {
    return postZone('/api/zone/exit', {}, `离开「${roomName || '房间'}」`);
  }
  // 需求③：容器不再"点一下就搜完"，而是打开逐格揭示的物品格面板。
  function openLootFor(container) {
    if (!container || !LOOT) return;
    if (!me) return;
    if (me.alive === false || finished) { showToast(finished ? '游戏已结束，探索已冻结' : '已淘汰，无法搜索'); return; }
    if (entityDistance(container) > WORLD.INTERACT_RANGE) { showToast('距离太远，请靠近后再搜索（64 像素以内）'); return; }
    if (explorationState().searched.includes(container.id)) { showToast('这个容器你已经搜过了'); return; }
    LOOT.open({
      containerId: container.id,
      containerName: container.container ? container.container.name : (container.label || '容器'),
      api, floorFields, commandId, showToast,
      onResult: (exploration, score, backpack) => {
        if (exploration) me = { ...me, exploration };
        if (Array.isArray(backpack)) me = { ...me, backpack };
        if (typeof score === 'number') me = { ...me, score };
        updateExplorationHUD();
      }
    });
  }
  // ============================================================
  // 第二轮：道具背包 / NPC 商店 / 限时 buff
  // ============================================================
  // 服务端把 items（key→数量）与 buffs（剩余毫秒）放在私密快照的 me 上；
  // 客户端只负责渲染与提交意图，所有判定（够不够、能不能用、剩多久）都在服务端。
  const BAG = SID.lootIcons;
  function itemDef(key) { return (WORLD.LOOT && WORLD.LOOT.ITEMS && WORLD.LOOT.ITEMS[key]) || null; }
  function effectDef(key) { return (WORLD.LOOT && WORLD.LOOT.EFFECTS && WORLD.LOOT.EFFECTS[key]) || null; }
  function meItems() { return me && me.items && typeof me.items === 'object' ? me.items : {}; }
  function meBuffs() { return me && me.buffs ? me.buffs : { speedMs: 0, shieldMs: 0, focusNext: false }; }
  function itemIconCanvas(key, size) {
    const def = itemDef(key);
    const c = document.createElement('canvas');
    c.width = c.height = size; c.className = 'bag-icon';
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (BAG && def) g.drawImage(BAG.sprite(def.icon, size, def.art), 0, 0);
    return c;
  }
  async function postItem(path, body, fallback) {
    if (!me || itemFlight) return;
    itemFlight = true;
    try {
      const stopped = await stopIntent();
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('stop');
      const r = await api(path, { commandId: commandId(), ...body, ...floorFields() });
      if (!r || (r.status !== 200 && r.status !== 400)) throw new Error('net');
      if (r.items) me = { ...me, items: r.items };
      if (r.buffs) me = { ...me, buffs: r.buffs };
      if (typeof r.chips === 'number') me = { ...me, exploration: { ...(me.exploration || {}), chips: r.chips } };
      if (typeof r.score === 'number') me = { ...me, score: r.score };
      const text = r.resultText || r.error || fallback;
      if (r.ok) showToast(text); else showToast(text);
      renderBagAndShop();
      updateBuffHUD();
    } catch {
      showToast('网络异常，操作未确认。');
    } finally {
      itemFlight = false;
    }
  }
  // 背包格子（需求④）：一格里一件物品，图标 + 数量角标 + 稀有度色条。
  function bagCell(key, count) {
    const def = itemDef(key); if (!def) return null;
    const cell = document.createElement('button');
    cell.type = 'button'; cell.className = 'bag-cell';
    cell.dataset.key = key;
    cell.setAttribute('role', 'gridcell');
    cell.title = `${def.label} ×${count}`;
    cell.append(itemIconCanvas(key, 34));
    const badge = document.createElement('span');
    badge.className = 'bag-count';
    badge.textContent = count > 1 ? `×${count}` : '';
    cell.append(badge);
    const bar = document.createElement('span');
    bar.className = `bag-rarity r-${def.rarity || 'common'}`;
    cell.append(bar);
    cell.onclick = () => {
      const grid = $('bag-items');
      if (grid) grid.querySelectorAll('.bag-cell').forEach(n => n.classList.toggle('active', n === cell));
      renderBagDetail(key, count);
    };
    return cell;
  }
  // 点格子 → 在背包旁边弹出该物品的介绍与操作。
  function renderBagDetail(key, count) {
    const host = $('bag-detail'); if (!host) return;
    const def = itemDef(key); if (!def) { host.hidden = true; return; }
    const rar = WORLD.LOOT.RARITY && WORLD.LOOT.RARITY[def.rarity];
    host.hidden = false;
    host.replaceChildren();
    const head = document.createElement('div'); head.className = 'bag-detail-head';
    head.append(itemIconCanvas(key, 28));
    const title = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = def.label;
    const sub = document.createElement('small'); sub.textContent = `${rar ? rar.label : def.rarity || ''} · 数量 ${count}`;
    title.append(name, sub); head.append(title);
    const close = document.createElement('button'); close.type = 'button'; close.className = 'icon-button';
    close.textContent = '×'; close.setAttribute('aria-label', '关闭物品详情');
    close.onclick = () => { host.hidden = true; const g = $('bag-items'); if (g) g.querySelectorAll('.bag-cell').forEach(n => n.classList.remove('active')); };
    head.append(close);
    host.append(head);
    const desc = document.createElement('p'); desc.className = 'bag-detail-desc';
    const parts = [];
    if (def.value > 0) parts.push(`卖给 NPC：${def.value} 筹码`);
    const pas = def.passive && WORLD.LOOT.PASSIVE_KINDS[def.passive.kind];
    if (pas) parts.push(`在包生效：${pas.desc(def.passive.value)}`);
    const eff = def.use && effectDef(def.use.effect);
    if (eff) parts.push(`${eff.name}：${eff.desc}${def.use.durationMs ? `（${Math.round(def.use.durationMs / 1000)}s）` : ''}`);
    desc.textContent = parts.join(' · ') || '这件物品只用于出售。';
    host.append(desc);
    const acts = document.createElement('div'); acts.className = 'bag-actions';
    if (def.use) {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '使用';
      b.disabled = !me || me.alive === false || finished;
      b.onclick = () => postItem('/api/item/use', { itemKey: key }, '使用未确认');
      acts.append(b);
    }
    if (def.value > 0) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'sell'; b.textContent = '卖出';
      b.disabled = !me || me.alive === false || finished;
      b.onclick = () => postItem('/api/item/sell', { itemKey: key, count }, '卖出未确认');
      acts.append(b);
    }
    host.append(acts);
  }
  function shopRow(def) {
    const row = document.createElement('div'); row.className = 'bag-item shop';
    row.append(itemIconCanvas(def.key, 26));
    const meta = document.createElement('div'); meta.className = 'bag-meta';
    const name = document.createElement('strong'); name.textContent = def.label;
    const sub = document.createElement('span');
    const eff = def.use && effectDef(def.use.effect);
    sub.textContent = `${def.price} 筹码${eff ? ` · ${eff.name}：${eff.desc}` : ''}`;
    meta.append(name, sub); row.append(meta);
    const acts = document.createElement('div'); acts.className = 'bag-actions';
    const b = document.createElement('button'); b.type = 'button'; b.textContent = '买入';
    const chips = me?.exploration?.chips ?? 0;
    b.disabled = !me || me.alive === false || finished || chips < def.price;
    b.onclick = () => postItem('/api/shop/buy', { itemKey: def.key }, '购买未确认');
    acts.append(b); row.append(acts);
    return row;
  }
  function renderBagAndShop() {
    const bagHost = $('bag-items');
    if (bagHost) {
      bagHost.replaceChildren();
      const items = meItems();
      const keys = Object.keys(items).sort((a, b) => (itemDef(b)?.value || 0) - (itemDef(a)?.value || 0));
      if (!keys.length) {
        const p = document.createElement('p'); p.className = 'panel-note';
        p.textContent = '背包里还没有东西。搜容器、或者去 NPC 商店看看。';
        bagHost.append(p);
      } else {
        for (const k of keys) { const cell = bagCell(k, items[k]); if (cell) bagHost.append(cell); }
      }
      const bagList = $('bag-log');
      if (bagList) {
        const bag = Array.isArray(me?.backpack) ? me.backpack.slice(-6).reverse() : [];
        bagList.textContent = bag.length ? `最近拾取：${bag.map(b => b.label).join('、')}` : '';
      }
    }
    const shopHost = $('shop-items');
    if (shopHost) {
      shopHost.replaceChildren();
      const list = (WORLD.LOOT && WORLD.LOOT.SHOP_ITEMS) || [];
      const chips = me?.exploration?.chips ?? 0;
      const head = document.createElement('p'); head.className = 'panel-note';
      head.textContent = `用筹码买道具 · 当前 ${chips} 筹码`;
      shopHost.append(head);
      for (const it of list) shopHost.append(shopRow(it));
    }
  }
  // buff 条：只在有生效中的 buff 时出现，倒计时用服务端下发的剩余毫秒。
  function updateBuffHUD() {
    const host = $('buff-bar'); if (!host) return;
    const b = meBuffs();
    const chips = [];
    if (b.speedMs > 0) chips.push({ cls: 'speed', label: '疾行 +45%', ms: b.speedMs });
    if (b.shieldMs > 0) chips.push({ cls: 'shield', label: '护体 · 免疫眩晕', ms: b.shieldMs });
    if (b.focusNext) chips.push({ cls: 'focus', label: '专注 · 下次搜索 +1 件', ms: 0 });
    host.replaceChildren();
    for (const c of chips) {
      const el = document.createElement('span');
      el.className = 'buff-chip ' + c.cls;
      el.textContent = c.ms > 0 ? `${c.label} ${Math.ceil(c.ms / 1000)}s` : c.label;
      host.append(el);
    }
    host.hidden = chips.length === 0;
  }
  let itemFlight = false;
  // E 就近互动：同时比较附近玩家、家具/NPC 与楼梯入口，取距离最近者；已选中的近玩家在距离相当时优先。
  // 玩家必须同层（floorId 一致）才参与就近判定。
  function nearestInteractable() {
    const self = selfPlayer(); if (!self || !me?.alive || finished) return null;
    let pBest = null, pD = Infinity;
    for (const p of players) {
      if (p.id === me.id || !p.alive || p.online === false || p.floorId !== me.floorId) continue;
      if (!WORLD.lineClear(self, p, occluders)) continue;
      const d = WORLD.distanceToEntity(self, p);
      if (d <= WORLD.INTERACT_RANGE && d < pD) { pD = d; pBest = { kind: 'player', id: p.id }; }
    }
    let eBest = null, eD = Infinity;
    for (const item of nearbyEntities()) {
      const d = entityDistance(item.entity);
      if (d < eD) { eD = d; eBest = { kind: item.kind, id: item.id }; }
    }
    // 电梯门不进入这套「就近取最近」的仲裁：它由 elevatorTarget() 单独处理（必须先于玩家/容器），
    // 否则玩家只要靠近门就会在未面向门时也能乘梯，与「面对电梯按 E」冲突。
    const candidates = [];
    if (pBest) candidates.push({ d: pD, hit: pBest });
    if (eBest) candidates.push({ d: eD, hit: eBest });
    if (!candidates.length) return null;
    // 已选玩家在距离相差不超过 32 像素时优先（保持与旧版一致的手感）。
    if (pBest) {
      const player = candidates.find(c => c.hit === pBest);
      const other = candidates.filter(c => c.hit !== pBest).sort((a, b) => a.d - b.d)[0];
      if (!other || player.d <= other.d + 32) return pBest;
    }
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0].hit;
  }
  function closeExploration() {
    explorationGeneration++; explorationPanel = null; explorationResult = ''; explorationDataSig = '';
    $('exploration').replaceChildren(); $('exploration').hidden = true;
    $('clue-bag').setAttribute('aria-expanded', 'false');
  }
  function openExploration(kind, id = null) {
    // 背包是仓库型面板：在画面正中弹出，和容器/NPC 的侧栏面板区分开。
    const explorationHost = $('exploration');
    if (explorationHost) explorationHost.classList.toggle('bag-mode', kind === 'backpack');
    // 需求③：容器一律走搜打撤物品格面板；线索背包与 NPC 兑换仍用原私密面板。
    if (kind === 'container') {
      const c = explorationEntity('container', id);
      if (c) openLootFor(c);
      return;
    }
    if (!me || (kind !== 'backpack' && !explorationEntity(kind, id))) return;
    clearAllInput(); selectedId = null; lastTargetSig = '';
    $('candidates').hidden = true; $('candidates').replaceChildren(); renderTarget(); renderRoster();
    explorationPanel = { kind, entityId: id };
    const entity = explorationEntity(kind, id), host = $('exploration');
    host.hidden = false; $('clue-bag').setAttribute('aria-expanded', String(kind === 'backpack'));
    const heading = kind === 'backpack' ? '线索背包' : kind === 'container' ? entity.container.name : entity.name;
    // 控件每次打开只建立一次；20Hz 快照只更新稳定的值槽。
    host.innerHTML = `<div class="panel-heading"><div><small>PRIVATE EXPLORATION</small><h2>${escapeText(heading)}</h2></div><button id="exploration-close" class="icon-button" aria-label="关闭私密探索">×</button></div><div class="exploration-body"><p class="exploration-balance">我的筹码：<strong id="exploration-chips"></strong></p>${kind === 'backpack'
      ? '<div class="bag-block"><p class="private-title">道具背包</p><div class="bag-wrap"><div id="bag-items" class="bag-grid" role="grid" aria-label="道具背包格子"></div><aside id="bag-detail" class="bag-detail" hidden aria-live="polite"></aside></div><p id="bag-log" class="panel-note"></p></div><p id="exploration-clue-count" class="panel-note"></p><div id="exploration-clues" class="clue-list"></div>'
      : `<p id="exploration-distance" class="panel-note"></p><p id="exploration-state" class="search-state"></p>${kind === 'npc' ? `<p class="npc-dialogue">${escapeText(entity.dialogue)}</p><div class="bag-block"><p class="private-title">商店</p><div id="shop-items" class="bag-items"></div></div><div class="wheel-block"><p class="private-title">大转盘</p><p class="panel-note">10 格等概率 · 首次免费，之后按次数阶梯收费</p><button id="exploration-wheel" type="button">打开大转盘</button><p id="exploration-wheel-state" class="search-state"></p></div>` : ''}<p class="panel-note">${kind === 'container' ? '每名玩家每个容器限搜一次，奖励由服务端结算。' : `每次 ${entity.cost} 筹码兑换一条尚未拥有的真实隐藏属性线索；无新线索不扣筹码。`}</p><button id="exploration-action">${kind === 'container' ? '搜寻容器' : `确认支付 ${entity.cost} 筹码兑换线索`}</button>`}<p id="exploration-result" class="private-result" hidden></p><p class="hold-note">仅自己可见 · 关闭、Esc、切出页面、选择玩家、规则或重置立即销毁显示，不回滚已结算奖励。</p></div>`;
    $('exploration-close').onclick = closeExploration;
    if ($('exploration-action')) $('exploration-action').onclick = commitInteraction;
    if ($('exploration-wheel')) $('exploration-wheel').onclick = () => openWheel(entity.entityId, entity.name);
    // 远处容器/NPC 仍可打开面板查看，但按钮禁用并给出「靠近」提示。
    if (kind !== 'backpack' && entityDistance(entity) > WORLD.INTERACT_RANGE) showToast('距离太远，请靠近后再互动（64 像素以内）');
    syncExploration();
  }
  function syncExploration() {
    if (!explorationPanel || !me) return;
    const { kind, entityId } = explorationPanel, entity = explorationEntity(kind, entityId);
    const state = explorationState(), dataSig = JSON.stringify(state);
    if (dataSig !== explorationDataSig) {
      explorationDataSig = dataSig;
      $('exploration-chips').textContent = state.chips;
      if (kind === 'backpack') {
        $('exploration-clue-count').textContent = `仅自己可见 · ${state.clues.length} 条真实线索 · 不改变玩家公开档案`;
        $('exploration-clues').innerHTML = state.clues.length ? state.clues.map(c => `<article class="clue-card"><strong>${escapeText(c.targetName)} · ${escapeText(c.label)}</strong><p>${escapeText(c.text)}</p><small>来源：${escapeText(c.source)}</small></article>`).join('') : '<p class="panel-note">背包为空。靠近容器搜寻，或向 NPC 兑换线索。</p>';
      }
    }
    if (kind !== 'backpack') {
      const distance = entityDistance(entity), inRange = distance <= WORLD.INTERACT_RANGE;
      const searched = kind === 'container' && state.searched.includes(entityId);
      $('exploration-distance').textContent = `距离：${Number.isFinite(distance) ? Math.ceil(distance) + ' 像素' : '未知'} / 范围 ${WORLD.INTERACT_RANGE} · ${inRange ? '可近距离互动' : '距离太远，请靠近后再试'}`;
      $('exploration-state').textContent = finished ? '游戏已结束，探索已冻结' : !me.alive ? '已淘汰，无法探索' : kind === 'container' ? (searched ? '已搜寻 · 不可重复搜寻' : '未搜寻 · 每人限搜一次') : state.chips < entity.cost ? `筹码不足，需要 ${entity.cost} 筹码` : `可确认支付 ${entity.cost} 筹码兑换`;
      const button = $('exploration-action');
      button.disabled = !!interactionFlight || !me.alive || finished || !inRange || searched || (kind === 'npc' && state.chips < entity.cost);
      button.textContent = interactionFlight ? '正在确认结算…' : kind === 'container' ? '搜寻容器' : `确认支付 ${entity.cost} 筹码兑换线索`;
      const wheel = $('exploration-wheel');
      if (wheel) {
        const spins = wheelSpinsFor(entityId), cost = wheelSpinCost(spins);
        // 不再因「已领取」禁用：转盘可重复转动，只有淘汰/结束/距离/眩晕才禁用。
        wheel.disabled = !me.alive || finished || !inRange || selfDisabled();
        wheel.textContent = '打开大转盘';
        $('exploration-wheel-state').textContent = !me.alive ? '已淘汰，无法转动'
          : finished ? '游戏已结束，转盘已冻结'
            : !inRange ? '距离太远，请靠近后再试'
              : selfDisabled() ? '眩晕/僵直中，暂时无法互动'
                : cost > 0 && state.chips < cost ? `第 ${spins + 1} 次 · 需 ${cost} 筹码（当前 ${state.chips}）· 筹码不足`
                  : `第 ${spins + 1} 次 · ${cost === 0 ? '免费' : `需 ${cost} 筹码（当前 ${state.chips}）`}`;
      }
    }
    $('exploration-result').textContent = explorationResult;
    $('exploration-result').hidden = !explorationResult;
    // 第二轮：筹码/道具变化时同步刷新背包与商店（只渲染服务端权威值，不做本地乐观记账）。
    renderBagAndShop();
  }
  async function commitInteraction() {
    if (!explorationPanel || interactionFlight || !me || $('exploration-action')?.disabled) return;
    const { kind, entityId } = explorationPanel;
    if (!['container', 'npc'].includes(kind)) return;
    const request = { session: sessionGeneration, token: sessionToken, panel: explorationGeneration, state: JSON.stringify(explorationState()) };
    const sameSession = () => request.session === sessionGeneration && request.token === sessionToken && !!me;
    const samePanel = () => sameSession() && request.panel === explorationGeneration && !!explorationPanel;
    interactionFlight = request; explorationResult = ''; keys.clear(); lastIntent = '';
    syncExploration();
    try {
      // 先等待停止意图被服务端确认，再提交探索；提交期间禁止移动与双击。
      const stopped = await stopIntent();
      if (!samePanel()) return;
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('停止意图未确认');
      const result = await api('/api/interact', { commandId: commandId(), kind: kind === 'container' ? 'search' : 'exchange', entityId, ...floorFields() });
      if (!samePanel()) return;
      if (![200, 400].includes(result.status) || typeof result.ok !== 'boolean' || !result.exploration) throw new Error('结算结果未确认');
      // 相同会话内也不以旧响应覆盖已变化的探索快照。
      if (request.state === JSON.stringify(explorationState())) me = { ...me, exploration: result.exploration };
      if (typeof result.score === 'number') me = { ...me, score: result.score };
      explorationResult = result.resultText || result.error || (result.ok ? '已结算' : '结算被拒绝');
    } catch {
      if (samePanel()) explorationResult = '网络异常，结果未确认；请等待权威状态更新，未自动重试。';
    } finally {
      if (interactionFlight === request) interactionFlight = null;
      if (sameSession() && explorationPanel) syncExploration();
    }
  }
  // ---------- 大转盘覆盖层：预览用 buildWheelPool，落点用服务端返回的 slots ----------
  function wheelSpinsFor(entityId) { return (me && me.games && me.games.wheelSpins && me.games.wheelSpins[entityId]) || 0; }
  function openWheel(entityId, name) {
    if (!me || !entityId) return;
    closeGames(); closeRanking();
    selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster();
    wheelTarget = { entityId, name: name || '大转盘' };
    wheelResult = ''; wheelAngle = 0; wheelAnimating = false;
    wheelSlots = buildWheelPool(me.faction);
    wheelOpen = true;
    const overlay = $('wheel-overlay'); overlay.hidden = false;
    const result = $('wheel-result'); result.textContent = ''; result.hidden = true;
    drawWheel(wheelSlots, wheelAngle);
    updateWheelControls();
    $('wheel-close').focus({ preventScroll: true });
  }
  function closeWheel() {
    if (!wheelOpen) return;
    wheelOpen = false; wheelTarget = null; wheelSlots = null; wheelResult = ''; wheelAngle = 0; wheelAnimating = false;
    if (wheelAnim) { cancelAnimationFrame(wheelAnim); wheelAnim = 0; }
    const overlay = $('wheel-overlay'); if (overlay) overlay.hidden = true;
    const result = $('wheel-result'); if (result) { result.textContent = ''; result.hidden = true; }
    const canvasEl = $('wheel-canvas');
    if (canvasEl) { const g = canvasEl.getContext('2d'); g.clearRect(0, 0, canvasEl.width, canvasEl.height); }
  }
  function showWheelResult() {
    const result = $('wheel-result'); if (!result) return;
    result.textContent = wheelResult; result.hidden = !wheelResult;
  }
  function updateWheelControls() {
    if (!wheelOpen || !wheelTarget || !me) return;
    const spins = wheelSpinsFor(wheelTarget.entityId), chips = explorationState().chips, cost = wheelSpinCost(spins);
    const busy = !!wheelSpinFlight || wheelAnimating;
    $('wheel-title').textContent = wheelTarget.name;
    let costText = cost === 0 ? `第 ${spins + 1} 次：免费` : `第 ${spins + 1} 次：${cost} 筹码（当前 ${chips}）`;
    if (!me.alive) costText += ' · 已淘汰';
    else if (finished) costText += ' · 游戏已结束';
    else if (selfDisabled()) costText += ' · 眩晕/僵直中';
    else if (cost > chips) costText += ' · 筹码不足';
    $('wheel-cost').textContent = costText;
    const button = $('wheel-spin');
    button.disabled = busy || !me.alive || finished || selfDisabled() || cost > chips;
    button.textContent = busy ? '转动中…' : '转动转盘';
    $('wheel-rules').textContent = `共 ${WHEEL.slotCount} 格等概率。首次免费，之后次数越多越贵（费用见 WHEEL.spinCosts）。${me.faction === 'good' ? '好人转盘含线索券。' : '坏人转盘含洗心革面券与轮回券。'}`;
  }
  function drawWheel(slots, angle) {
    const canvasEl = $('wheel-canvas'); if (!canvasEl) return;
    const g = canvasEl.getContext('2d');
    const w = canvasEl.width, h = canvasEl.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 10;
    g.clearRect(0, 0, w, h);
    // 外圈：延续像素 / 发光风格的双描边。
    g.save();
    g.strokeStyle = WHEEL_CHIP_COLOR; g.globalAlpha = .9; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R + 4, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = .25; g.lineWidth = 8;
    g.beginPath(); g.arc(cx, cy, R + 9, 0, Math.PI * 2); g.stroke();
    g.restore();
    if (!slots || !slots.length) return;
    const n = slots.length, slice = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) {
      const mid = -Math.PI / 2 + i * slice + angle, a0 = mid - slice / 2, a1 = mid + slice / 2, slot = slots[i];
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, a0, a1); g.closePath();
      g.fillStyle = slot.color || '#334155'; g.fill();
      g.strokeStyle = '#0F172A'; g.lineWidth = 2; g.stroke();
      // 文字沿扇区中线排布；左半圈翻转，保证正向可读。
      g.save();
      g.translate(cx + Math.cos(mid) * R * 0.62, cy + Math.sin(mid) * R * 0.62);
      g.rotate(Math.cos(mid) < 0 ? mid + Math.PI : mid);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#0F172A';
      if (slot.kind === 'special') {
        g.font = '700 19px -apple-system,"PingFang SC",sans-serif';
        g.fillText(slot.glyph || '★', 0, -9);
        g.font = '700 11px -apple-system,"PingFang SC",sans-serif';
        g.fillText(String(slot.label || '').replace('券', '').slice(0, 2), 0, 9);
      } else {
        g.font = '700 22px ui-monospace,monospace';
        g.fillText(String(slot.amount), 0, 0);
      }
      g.restore();
    }
    // 中心轴。
    g.beginPath(); g.arc(cx, cy, 34, 0, Math.PI * 2); g.fillStyle = '#0F172A'; g.fill();
    g.strokeStyle = WHEEL_CHIP_COLOR; g.lineWidth = 3; g.stroke();
    g.fillStyle = '#E2E8F0'; g.font = '700 14px -apple-system,"PingFang SC",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('转盘', cx, cy);
    // 顶部指针：固定不随转盘旋转。
    g.beginPath(); g.moveTo(cx, cy - R + 16); g.lineTo(cx - 12, cy - R - 12); g.lineTo(cx + 12, cy - R - 12); g.closePath();
    g.fillStyle = WHEEL_CHIP_COLOR; g.fill(); g.strokeStyle = '#0F172A'; g.lineWidth = 2; g.stroke();
  }
  // 旋转动画：4 圈 + 目标角，约 1.2s，缓出；结束时 slotIndex 落在顶部指针处。
  function animateWheel(slots, slotIndex, done) {
    if (wheelAnim) { cancelAnimationFrame(wheelAnim); wheelAnim = 0; }
    const n = slots.length || WHEEL.slotCount, slice = Math.PI * 2 / n;
    const start = wheelAngle;
    const startMod = ((start % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const endMod = (((-slotIndex * slice) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const delta = ((endMod - startMod) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const end = start + 4 * Math.PI * 2 + delta, duration = 1200, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);
    const tick = now => {
      const t = Math.min(1, (now - t0) / duration);
      wheelAngle = start + (end - start) * ease(t);
      drawWheel(slots, wheelAngle);
      if (t < 1) wheelAnim = requestAnimationFrame(tick);
      else { wheelAnim = 0; wheelAngle = endMod; drawWheel(slots, wheelAngle); if (done) done(); }
    };
    wheelAnim = requestAnimationFrame(tick);
  }
  async function spinWheel() {
    if (!wheelOpen || !wheelTarget || wheelSpinFlight || !me) return;
    const entityId = wheelTarget.entityId, button = $('wheel-spin');
    if (!button || button.disabled) return;
    const request = { session: sessionGeneration, token: sessionToken };
    const sameSession = () => request.session === sessionGeneration && request.token === sessionToken && !!me;
    const samePanel = () => sameSession() && wheelOpen && wheelTarget && wheelTarget.entityId === entityId;
    wheelSpinFlight = request; wheelResult = ''; showWheelResult(); keys.clear(); lastIntent = '';
    updateWheelControls();
    try {
      // 沿用既有请求纪律：先确认停止意图，再提交；不做任何本地筹码预扣。
      const stopped = await stopIntent();
      if (!samePanel()) return;
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('停止意图未确认');
      const result = await api('/api/play', { commandId: commandId(), kind: 'wheel', entityId, ...floorFields() });
      if (!samePanel()) return;
      if (![200, 400].includes(result.status) || typeof result.ok !== 'boolean') throw new Error('结算结果未确认');
      if (!result.ok) { wheelResult = result.error || '转动被拒绝'; showWheelResult(); updateWheelControls(); return; }
      const wheel = result.wheel || {};
      const slots = (Array.isArray(wheel.slots) && wheel.slots.length) ? wheel.slots : buildWheelPool(me.faction);
      const slotIndex = Number.isInteger(wheel.slotIndex) ? wheel.slotIndex : 0;
      // 先旋转到落点；动画结束后才采纳投影并显示结果，避免提前泄露筹码变化。
      wheelSlots = slots;
      wheelAnimating = true; updateWheelControls();
      animateWheel(slots, slotIndex, () => {
        wheelAnimating = false;
        if (!samePanel()) return;
        if (result.exploration) me = { ...me, exploration: result.exploration };
        if (result.games) me = { ...me, games: result.games };
        if (typeof result.score === 'number') me = { ...me, score: result.score };
        if (result.faction) me = { ...me, faction: result.faction };
        wheelResult = result.resultText || '已结算';
        updateScoreDisplay(); showWheelResult(); updateWheelControls();
      });
    } catch {
      if (samePanel()) { wheelResult = '网络异常，结果未确认；请等待权威状态更新，未自动重试。'; showWheelResult(); }
    } finally {
      if (wheelSpinFlight === request) wheelSpinFlight = null;
      if (sameSession()) { updateWheelControls(); if (explorationPanel && explorationPanel.kind === 'npc') syncExploration(); }
    }
  }

  // ---------- 分数 / 排行榜 / 结算 / 剩余时间：只读公开投影与私有 me ----------
  function selfScore() { return me && typeof me.score === 'number' ? me.score : (selfPlayer() && typeof selfPlayer().score === 'number' ? selfPlayer().score : 0); }
  function updateScoreDisplay() {
    const node = $('score-value'); if (!node) return;
    const text = String(selfScore());
    if (node.textContent !== text) node.textContent = text;
  }
  function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000)), hh = Math.floor(total / 3600), mm = Math.floor((total % 3600) / 60), ss = total % 60;
    return `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  }
  function syncTimeLeft() {
    const node = $('time-left'); if (!node) return;
    const endsAt = rulesInfo && rulesInfo.endsAt;
    if (!endsAt) { node.textContent = finished ? '已结束' : '--:--'; return; }
    const left = endsAt - serverNow();
    node.textContent = left <= 0 ? (finished ? '已结束' : '00:00:00') : formatDuration(left);
  }
  function finishReasonText(reason) {
    return reason === 'aliveFloor' ? '存活人数已淘汰至剩余 100 人'
      : reason === 'badWiped' ? '坏人全灭'
        : reason === 'timeUp' ? '时间到（2 小时）'
          : reason === 'host' ? '主持人结束了游戏' : '游戏已结束';
  }
  function rankingRowHTML(entry, index) {
    const rank = entry.rank != null ? entry.rank : index + 1;
    const p = players.find(pl => pl.id === entry.id);
    const name = entry.name || (p ? p.name : '玩家');
    const out = entry.alive === false ? '<span class="out-label">淘汰</span>' : '';
    return `<div class="ranking-row" data-player="${escapeText(entry.id)}"><span class="ranking-rank">${rank}</span>${p ? portrait(p) : ''}<span class="ranking-name">${escapeText(name)}</span>${out}<span class="ranking-score">${Number(entry.score) || 0}</span></div>`;
  }
  function renderRankingRows(host, list) {
    if (!host) return;
    host.innerHTML = list.length ? list.map(rankingRowHTML).join('') : '<p class="panel-note">暂无排名数据。</p>';
  }
  function updateRankingHeader() {
    const rules = $('ranking-rules'); if (!rules) return;
    const endsAt = rulesInfo && rulesInfo.endsAt, left = endsAt ? Math.max(0, endsAt - serverNow()) : null;
    rules.textContent = `结束方式：存活淘汰至剩余 ${RULES.endRemainingPlayers} 人 / 坏人全灭 / 时间到（2 小时）`
      + (left != null ? ` · 距时间到还有 ${formatDuration(left)}` : '')
      + (finished ? ` · 已结束：${finishReasonText(finishReason)}` : '');
  }
  // 双榜：筹码榜（经济）与成就榜（参与度）。成就点只公开"点数"，不含私密数据。
  function ensureRankingTabs() {
    if ($('ranking-tabs')) return;
    const anchor = $('ranking-items'); if (!anchor || !anchor.parentNode) return;
    const bar = document.createElement('div');
    bar.id = 'ranking-tabs'; bar.className = 'ranking-tabs'; bar.setAttribute('role', 'tablist');
    bar.innerHTML = '<button type="button" data-tab="score" role="tab">筹码榜</button>'
      + '<button type="button" data-tab="achievement" role="tab">成就榜</button>';
    bar.querySelectorAll('button').forEach(b => {
      b.onclick = () => { rankingTab = b.dataset.tab; lastRankingSig = ''; syncRanking(); };
    });
    anchor.parentNode.insertBefore(bar, anchor);
  }
  function syncRanking() {
    const host = $('ranking'); if (!host || host.hidden) return;
    updateRankingHeader();
    ensureRankingTabs();
    const rankSource = rosterCache.length ? rosterCache : players;
    const sorted = rankSource.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const sig = JSON.stringify([finishReason, aliveCount, rankingTab,
      players.map(p => [p.id, p.name, p.score || 0, p.alive]), rankingList, achievementList, achievementLeaders]);
    if (sig === lastRankingSig) return;
    lastRankingSig = sig;
    $('ranking-alive').textContent = aliveCount;
    const tabs = $('ranking-tabs');
    if (tabs) tabs.querySelectorAll('button').forEach(b => {
      const on = b.dataset.tab === rankingTab;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (rankingTab === 'achievement') {
      const list = (achievementList && achievementList.length) ? achievementList
        : achievementLeaders.map(r => ({ ...r, score: r.points || 0 }));
      renderRankingRows($('ranking-items'), list);
      return;
    }
    const source = rankingList && rankingList.length
      ? rankingList
      : sorted.map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, score: p.score || 0, alive: p.alive }));
    renderRankingRows($('ranking-items'), source);
  }
  function openRanking() {
    const host = $('ranking'); if (!host) return;
    closeWheel();
    host.hidden = false; $('ranking-toggle').setAttribute('aria-expanded', 'true');
    lastRankingSig = ''; syncRanking();
  }
  function closeRanking() {
    const host = $('ranking'); if (!host || host.hidden) return;
    host.hidden = true; $('ranking-toggle').setAttribute('aria-expanded', 'false');
  }
  function renderFinish() {
    const overlay = $('finish-overlay'); if (!overlay) return;
    const sig = JSON.stringify([finishReason, rankingList, players.map(p => [p.id, p.name, p.score || 0, p.alive])]);
    if (sig === lastFinishSig) return;
    lastFinishSig = sig;
    $('finish-reason').textContent = finishReasonText(finishReason);
    const host = $('finish-ranking');
    if (rankingList && rankingList.length) { renderRankingRows(host, rankingList); return; }
    // 存活淘汰至剩余 100 人（ranking 为 null）：不按分数排名，只展示存活到最后的玩家。
    const survivors = players.filter(p => p.alive).sort((a, b) => (b.score || 0) - (a.score || 0));
    host.innerHTML = '<p class="panel-note">该结束方式不按分数排名，以下为存活到最后的玩家：</p>'
      + (survivors.length
        ? survivors.map(p => `<div class="ranking-row" data-player="${escapeText(p.id)}"><span class="ranking-rank">✓</span>${portrait(p)}<span class="ranking-name">${escapeText(p.name)}</span><span class="ranking-score">${p.score || 0} 分</span></div>`).join('')
        : '<p class="panel-note">没有存活玩家。</p>');
  }
  function showFinish() {
    const overlay = $('finish-overlay'); if (!overlay) return;
    lastFinishSig = ''; renderFinish(); overlay.hidden = false;
  }
  function hideFinish() {
    const overlay = $('finish-overlay'); if (!overlay) return;
    overlay.hidden = true; lastFinishSig = '';
    $('finish-reason').textContent = ''; $('finish-ranking').replaceChildren();
  }
  function updateExplorationHUD() {
    const self = selfPlayer(), renderedSelf = self && renderMap.get(self.id);
    $('cover-status').textContent = self ? (WORLD.coverFor(renderedSelf || self, occluders) ? '身体已遮挡 · 不免疫技能' : '无遮挡') : '尚未加入';
    $('clue-bag').disabled = !me;
    const nearby = nearbyEntities(), sig = JSON.stringify(nearby.map(n => [n.kind, n.id]).sort());
    if (sig !== nearbySig) {
      nearbySig = sig;
      // 名称控件按实体复用；进出范围也不替换按下中的按钮。
      const host = $('nearby-items');
      for (const item of nearby) {
        let button = [...host.children].find(b => b.dataset.entity === item.id);
        if (!button) {
          button = document.createElement('button'); button.dataset.entity = item.id;
          button.onclick = () => activateNearby(item.kind, item.id); host.append(button);
        }
        // 文案随状态更新（房间门/出口/容器/NPC 四类）
        button.textContent = item.kind === 'container' ? item.entity.container.name
          : item.kind === 'door' ? `进入「${item.entity.name}」`
            : item.kind === 'exit' ? `离开「${item.entity.name}」`
              : `${item.entity.name} · NPC / ${item.entity.cost} 筹码`;
      }
      for (const button of host.children) button.hidden = !nearby.some(item => item.id === button.dataset.entity);
    }
    $('nearby-empty').hidden = nearby.length > 0;
    $('nearby-empty').textContent = !me ? '加入后靠近容器或 NPC'
      : finished ? '游戏已结束，探索已冻结'
        : !me.alive ? '已淘汰，无法探索'
          : zoneId ? '靠近容器搜索 · 走到门口按 E 离开房间'
            : '靠近容器 / NPC / 房间门，按 E 互动（64 像素）';
  }
  // 就近列表点击与 E 键共用同一套分流逻辑（门 → 容器 → NPC → 玩家档案）。
  function activateNearby(kind, id) {
    if (kind === 'door') { const r = WORLD.roomById(id); if (r) enterRoom(r.id, r.name); return; }
    if (kind === 'exit') { const r = WORLD.roomById(id); if (r) leaveRoom(r.name); return; }
    if (kind === 'container') { openLootFor(explorationEntity('container', id)); return; }
    if (kind === 'arcade') { if (SID.minigame) SID.minigame.open({ arcade: true }); return; }
    openExploration(kind, id);
  }
  $('clue-bag').onclick = () => { if (explorationPanel?.kind === 'backpack') closeExploration(); else openExploration('backpack'); };

  // ---------- 猜拳小游戏：服务端权威 邀请 → 接受 → 10 秒可修改出拳 → 截止揭示 ----------
  const RPS_LABELS = { rock: '石头', paper: '布', scissors: '剪刀' };
  function rpsNow() { return serverNow(); }
  // 三个可区分的像素手势（64 viewBox，crispEdges）：握拳 / 剪刀手 / 张开手掌；未出拳占位与问号。
  function rpsGlyph(choice) {
    if (choice === 'rock') {
      return `<svg class="rps-glyph" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><rect x="12" y="22" width="40" height="30" rx="7" fill="#e7b27a" stroke="#7a4a22" stroke-width="2"/><rect x="15" y="25" width="34" height="24" rx="5" fill="#f0c08c"/><rect x="9" y="30" width="14" height="15" rx="6" fill="#e7b27a" stroke="#7a4a22" stroke-width="2"/><rect x="19" y="39" width="3" height="9" fill="#c98f57"/><rect x="27" y="39" width="3" height="9" fill="#c98f57"/><rect x="35" y="39" width="3" height="9" fill="#c98f57"/></svg>`;
    }
    if (choice === 'scissors') {
      return `<svg class="rps-glyph" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><rect x="20" y="33" width="24" height="21" rx="6" fill="#e7b27a" stroke="#7a4a22" stroke-width="2"/><rect x="23" y="36" width="18" height="15" rx="4" fill="#f0c08c"/><rect x="17" y="13" width="9" height="26" rx="4" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/><rect x="38" y="13" width="9" height="26" rx="4" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/><rect x="30" y="33" width="4" height="18" fill="#e7b27a"/></svg>`;
    }
    if (choice === 'paper') {
      return `<svg class="rps-glyph" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><rect x="18" y="31" width="28" height="23" rx="6" fill="#e7b27a" stroke="#7a4a22" stroke-width="2"/><rect x="21" y="34" width="22" height="18" rx="4" fill="#f0c08c"/><rect x="13" y="19" width="7" height="19" rx="3" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/><rect x="23" y="14" width="7" height="24" rx="3" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/><rect x="33" y="14" width="7" height="24" rx="3" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/><rect x="43" y="19" width="7" height="19" rx="3" fill="#f0c08c" stroke="#7a4a22" stroke-width="2"/></svg>`;
    }
    return `<svg class="rps-glyph" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><rect x="14" y="20" width="36" height="30" rx="10" fill="none" stroke="#7e93ad" stroke-width="3" stroke-dasharray="6 5"/><circle cx="32" cy="35" r="9" fill="none" stroke="#7e93ad" stroke-width="3"/></svg>`;
  }
  function rpsQuestion() {
    return `<svg class="rps-glyph" viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true"><rect x="14" y="20" width="36" height="30" rx="10" fill="#17273c" stroke="#5b83ad" stroke-width="3"/><text x="32" y="45" text-anchor="middle" font-family="ui-monospace,monospace" font-size="30" font-weight="700" fill="#9cc9ef">?</text></svg>`;
  }
  function openGames() {
    const host = $('games');
    if (!host) return;
    closeWheel();
    host.hidden = false;
    if (!gamesDomReady) {
      gamesDomReady = true;
      // 只建一次 DOM；20Hz 快照 / 帧循环只更新文本、disabled、aria-pressed 与手势槽，绝不重建按钮。
      host.innerHTML = `<div class="panel-heading"><div><small>RPS</small><h2>猜拳对战</h2></div><button id="games-close" class="icon-button" aria-label="取消并关闭猜拳">×</button></div><div class="games-body"><div id="games-rps" class="rps-arena" hidden><p class="games-balance">我的筹码：<strong id="games-chips">0</strong> · 分数 <strong id="games-score">0</strong></p><div class="rps-top"><div class="rps-side rps-self"><span class="rps-role">你</span><span class="rps-name" id="games-self-name"></span><span class="rps-glyph-slot" id="games-self-glyph"></span></div><div class="rps-vs">VS</div><div class="rps-side rps-opp"><span class="rps-role">对手</span><span class="rps-name" id="games-opp-name"></span><span class="rps-glyph-slot" id="games-opp-glyph"></span></div></div><p id="games-phase" class="rps-phase"></p><div class="rps-choices" role="group" aria-label="选择出拳"><button type="button" id="games-choice-rock" data-choice="rock" aria-pressed="false" aria-label="石头">${rpsGlyph('rock')}<span>石头</span></button><button type="button" id="games-choice-scissors" data-choice="scissors" aria-pressed="false" aria-label="剪刀">${rpsGlyph('scissors')}<span>剪刀</span></button><button type="button" id="games-choice-paper" data-choice="paper" aria-pressed="false" aria-label="布">${rpsGlyph('paper')}<span>布</span></button></div><p id="games-timer" class="games-timer"></p><p id="games-unconfirmed" class="rps-unconfirmed" hidden></p><div class="games-pending-actions"><button type="button" id="games-accept" class="rps-accept" hidden>接受</button><button type="button" id="games-reject" class="rps-reject" hidden>拒绝</button><button type="button" id="games-cancel" hidden>取消</button></div><p id="games-result" class="private-result" hidden></p><button type="button" id="games-result-close" class="rps-result-close" hidden>关闭结果</button></div></div>`;
      $('games-close').onclick = exitRps;
      for (const choice of ['rock', 'paper', 'scissors']) $(`games-choice-${choice}`).onclick = () => rpsChoose(choice);
      $('games-accept').onclick = () => { const p = me?.games?.rpsPending; if (p) sendRps({ kind: 'rpsAccept', challengeId: p.id }); };
      $('games-reject').onclick = () => { const p = me?.games?.rpsPending; if (p) sendRps({ kind: 'rpsReject', challengeId: p.id }); };
      $('games-cancel').onclick = () => { const p = me?.games?.rpsPending; if (p) sendRps({ kind: 'rpsCancel', challengeId: p.id }); };
      $('games-result-close').onclick = () => { const r = me?.games?.rpsResult; if (r) rpsResultDismissId = r.id; syncGames(); };
    }
    syncRpsLifecycle();
    syncGames();
  }
  function closeGames() {
    const host = $('games');
    // 仅关闭视图；不发送 rpsCancel，进行中的邀请/对局在服务端继续，可随时重开恢复（由 target 菜单「返回正在进行的猜拳」或阶段迁移自动恢复）。
    gamesDomReady = false; rpsLastSelfGlyph = ''; rpsLastOppGlyph = '';
    if (host) { host.hidden = true; host.replaceChildren(); }
  }
  async function exitRps() {
    const current = me?.games?.rpsPending;
    if (current) {
      if (gamesFlight) { showToast('正在处理请求，请稍后取消'); return; }
      await sendRps({ kind: 'rpsCancel', challengeId: current.id });
      if (me?.games?.rpsPending?.id === current.id) { showToast('取消未确认，请重试或等待权威结果'); return; }
    }
    if (me?.games?.rpsResult) rpsResultDismissId = me.games.rpsResult.id;
    closeGames();
  }
  async function rpsApi(body) {
    const response = await fetch('/api/play', { method: 'POST', headers: headers(), body: JSON.stringify({ ...body, ...floorFields() }), signal: AbortSignal.timeout(4000) });
    let data = {}; try { data = await response.json(); } catch { }
    return { ...data, status: response.status };
  }
  function isInviteable(p) {
    if (!p || !me || !me.alive || finished || p.id === me.id || !p.alive || p.online === false) return false;
    const self = selfPlayer(); if (!self) return false;
    return WORLD.distanceToEntity(self, p) <= WORLD.INTERACT_RANGE && p.floorId === me.floorId && WORLD.lineClear(self, p, occluders)
      && !me.games?.rpsPending && rpsNow() >= (me.games?.rpsUntil || 0) && !selfDisabled() && !gamesFlight;
  }
  function inviteDisabled() {
    return !me || !me.alive || finished || selfDisabled() || !!gamesFlight
      || me.games?.rpsPending != null || rpsNow() < (me.games?.rpsUntil || 0);
  }
  // 本地乐观选择 + 合并串行队列：每次点击立即更新 ownChoice，再按修订号递增提交最终最新选择。
  function rpsChoose(choice) {
    const pending = me?.games?.rpsPending;
    if (!pending || pending.phase !== 'selecting' || rpsNow() >= pending.deadline || !me.alive || finished || selfDisabled() || !['rock', 'paper', 'scissors'].includes(choice)) return;
    rpsLocalChoice = choice;
    rpsRevision++;
    rpsChoosePending = { revision: rpsRevision, choice };
    rpsUnconfirmed = false;
    syncGames();
    pumpRpsChoose();
  }
  async function pumpRpsChoose() {
    if (rpsChooseFlight || !rpsChoosePending || !me) return;
    const pending = me.games?.rpsPending;
    if (!pending || pending.phase !== 'selecting') { rpsChoosePending = null; return; }
    const { revision, choice } = rpsChoosePending;
    rpsChoosePending = null;
    const request = { session: sessionGeneration, token: sessionToken, challengeId: pending.id };
    const same = () => request.session === sessionGeneration && request.token === sessionToken && me?.games?.rpsPending?.id === request.challengeId;
    rpsChooseFlight = request;
    try {
      const result = await rpsApi({ commandId: commandId(), kind: 'rpsChoose', challengeId: pending.id, choice, revision });
      if (!same()) return;
      if (result.status === 200 && result.ok) {
        rpsAckRevision = Math.max(rpsAckRevision, revision); rpsUnconfirmed = false;
        const pg = result.games?.rpsPending;
        if (pg?.id === pending.id && typeof pg.ownRevision === 'number') {
          rpsRemoteRevision = Math.max(rpsRemoteRevision, pg.ownRevision);
          if (pg.ownRevision >= rpsRevision) rpsLocalChoice = pg.ownChoice;
        }
      } else {
        rpsUnconfirmed = true;
        if (revision === rpsRevision && !rpsChoosePending) rpsLocalChoice = me.games.rpsPending.ownChoice;
      } // 服务端拒绝/网络失败：明确未确认，下一步以权威状态为准恢复
    } catch { if (same()) { rpsUnconfirmed = true; if (revision === rpsRevision && !rpsChoosePending) rpsLocalChoice = me.games.rpsPending.ownChoice; } }
    finally {
      if (rpsChooseFlight === request) rpsChooseFlight = null;
      if (same()) { syncGames(); updateScoreDisplay(); }
      // 期间若有更新的本地选择，继续合并提交（仅最新修订号）。
      if (rpsChoosePending && same()) pumpRpsChoose();
    }
  }
  // 每次快照自动做阶段迁移、权威采纳与自动弹窗；帧循环只负责计时刷新。
  function syncRpsLifecycle() {
    const games = me?.games; if (!games) return;
    const pending = games.rpsPending;
    if (!pending) {
      rpsLocalChoice = null; rpsRevision = 0; rpsAckRevision = 0; rpsRemoteRevision = 0;
      rpsChoosePending = null; rpsUnconfirmed = false; rpsAutoId = null; rpsAutoPhase = null;
      return;
    }
    const isNew = pending.id !== rpsAutoId, phaseChanged = pending.phase !== rpsAutoPhase;
    if (isNew) {
      rpsChooseFlight = null; rpsChoosePending = null; rpsUnconfirmed = false;
      rpsRevision = pending.ownRevision || 0; rpsAckRevision = rpsRevision;
      rpsLocalChoice = pending.ownChoice || null; rpsResultDismissId = null;
    }
    rpsRemoteRevision = pending.ownRevision || 0;
    if (rpsRemoteRevision >= rpsRevision) {
      rpsLocalChoice = pending.ownChoice || null;
      rpsRevision = Math.max(rpsRevision, rpsRemoteRevision);
      rpsAckRevision = Math.max(rpsAckRevision, rpsRemoteRevision);
      rpsUnconfirmed = false;
    }
    rpsAutoId = pending.id; rpsAutoPhase = pending.phase;
    if ((isNew || phaseChanged) && $("games")?.hidden && !finished) {
      keys.clear(); sendIntent(true); openGames();
    }
  }
  function syncGames() {
    const host = $("games");
    if (!host || host.hidden || !me || !gamesDomReady) return;
    const games = me.games || {}, pending = games.rpsPending;
    const result = pending ? null : games.rpsResult;
    if ((!pending && !result) || (!pending && result.id === rpsResultDismissId)) { closeGames(); return; }
    $("games-chips").textContent = explorationState().chips;
    $("games-score").textContent = me.score || 0;
    $("games-rps").hidden = false;
    renderArena(pending, result);
  }
  function renderArena(pending, result) {
    const oppName = pending ? (pending.role === 'from' ? pending.toName : pending.fromName) : (result ? result.opponentName : '');
    $('games-self-name').textContent = me.name || '你';
    $('games-opp-name').textContent = oppName || '对手';
    let selfGlyph = rpsGlyph(rpsLocalChoice), oppGlyph = rpsQuestion();
    if (result) {
      selfGlyph = rpsGlyph(result.ownChoice);
      oppGlyph = result.status === 'resolved' ? rpsGlyph(result.opponentChoice) : rpsQuestion();
    }
    // 仅在手势变化时重写 innerHTML，避免 20Hz/帧循环重建。
    if (rpsLastSelfGlyph !== selfGlyph) { $('games-self-glyph').innerHTML = selfGlyph; rpsLastSelfGlyph = selfGlyph; }
    if (rpsLastOppGlyph !== oppGlyph) { $('games-opp-glyph').innerHTML = oppGlyph; rpsLastOppGlyph = oppGlyph; }
    $('games-self-glyph').dataset.choice = result ? (result.ownChoice || 'none') : (rpsLocalChoice || 'none');
    $('games-self-glyph').setAttribute('aria-label', `自己的手势：${RPS_LABELS[result ? result.ownChoice : rpsLocalChoice] || '未选择'}`);
    $('games-opp-glyph').dataset.choice = result?.status === 'resolved' ? result.opponentChoice : 'hidden';
    $('games-opp-glyph').setAttribute('aria-label', result?.status === 'resolved' ? `对手手势：${RPS_LABELS[result.opponentChoice]}` : '对手选择尚未揭示');
    const phaseEl = $('games-phase'), timerEl = $('games-timer');
    const choices = ['rock', 'paper', 'scissors'].map(c => $(`games-choice-${c}`));
    const accept = $('games-accept'), reject = $('games-reject'), cancel = $('games-cancel');
    const unconfirmed = $('games-unconfirmed'), resultEl = $('games-result'), resultClose = $('games-result-close');
    const now = serverNow();
    if (result) {
      const status = result.status, outcome = result.outcome;
      const delta = typeof result.delta === 'number' ? result.delta : 0;
      phaseEl.textContent = status === 'resolved'
        ? (outcome === 'win' ? '你获胜' : outcome === 'lose' ? '你落败' : outcome === 'draw' ? '平局' : '已结算')
        : '已取消';
      timerEl.textContent = '';
      for (const b of choices) { b.disabled = true; b.setAttribute('aria-pressed', 'false'); }
      accept.hidden = reject.hidden = cancel.hidden = true;
      unconfirmed.hidden = true;
      resultEl.hidden = false;
      resultEl.textContent = status === 'resolved'
        ? `你出${RPS_LABELS[result.ownChoice]}，对方出${RPS_LABELS[result.opponentChoice]} · ${outcome === 'win' ? `你获胜，筹码 +${delta}` : outcome === 'lose' ? `你落败，筹码 ${delta}` : '平局，筹码不变'}`
        : `本次取消：${result.reason || '对战已结束'} · 不扣筹码、不计胜负`;
      resultClose.hidden = false;
      return;
    }
    const phase = pending.phase === 'selecting' ? 'selecting' : 'invited';
    if (phase === 'invited') {
      phaseEl.textContent = pending.role === 'to' ? `${pending.fromName} 邀请你猜拳，是否接受？` : `已邀请 ${pending.toName}，等待对方接受`;
      const left = Math.max(0, Math.ceil((pending.expiresAt - now) / 1000));
      timerEl.textContent = `邀请 ${left} 秒后超时自动取消，不扣筹码`;
      for (const b of choices) { b.disabled = true; b.setAttribute('aria-pressed', String(rpsLocalChoice === b.dataset.choice)); }
      accept.hidden = pending.role !== 'to'; reject.hidden = pending.role !== 'to'; cancel.hidden = false;
      unconfirmed.hidden = true; resultEl.hidden = true; resultClose.hidden = true;
    } else {
      phaseEl.textContent = '十秒选择 · 倒计时结束统一揭示（截止前可改）';
      const deadline = pending.deadline;
      const settled = now >= deadline; // 截止但权威结果未到
      const left = Math.max(0, Math.ceil((deadline - now) / 1000));
      timerEl.textContent = settled ? '等待结算…' : `剩余 ${left} 秒 · 截止前可改`;
      const canChoose = !settled && me.alive && !finished && !selfDisabled();
      for (const b of choices) { b.disabled = !canChoose; b.setAttribute('aria-pressed', String(rpsLocalChoice === b.dataset.choice)); }
      accept.hidden = reject.hidden = true; cancel.hidden = false;
      unconfirmed.hidden = !rpsUnconfirmed;
      if (rpsUnconfirmed) unconfirmed.textContent = '最近一次出拳未确认，已以权威状态为准；可继续修改。';
      resultEl.hidden = true; resultClose.hidden = true;
    }
  }
  async function sendRps(extra) {
    if (gamesFlight || !me) return;
    if (extra.kind === 'rpsInvite' ? inviteDisabled() : (selfDisabled() || !me.alive || finished)) return;
    const request = { session: sessionGeneration, token: sessionToken, games: JSON.stringify(me.games || {}) };
    // 不依赖面板可见性：关闭后的成功请求不会被丢弃（same 不含 host.hidden）。
    const same = () => request.session === sessionGeneration && request.token === sessionToken && !!me;
    gamesFlight = request; gamesResult = '';
    syncGames();
    try {
      keys.clear(); sendIntent(true);
      const result = await rpsApi({ commandId: commandId(), ...extra });
      if (!same()) return;
      if (![200, 400].includes(result.status) || typeof result.ok !== 'boolean') throw new Error('结果未确认');
      // 状态未变时才采纳服务端投影，旧响应不覆盖新快照。
      if (request.games === JSON.stringify(me.games || {})) {
        if (result.games) me = { ...me, games: result.games };
        if (result.exploration) me = { ...me, exploration: result.exploration };
      }
      if (typeof result.score === 'number') me = { ...me, score: Math.max(me.score || 0, result.score) };
      syncRpsLifecycle();
      gamesResult = result.ok ? (result.resultText || '') : (result.error || '请求被拒绝');
      if (!result.ok && gamesResult) showToast(gamesResult);
    } catch { if (same()) { gamesResult = '网络异常，结果未确认；请等待权威状态更新，未自动重试。'; showToast(gamesResult); } }
    finally { if (gamesFlight === request) gamesFlight = null; if (same()) { syncGames(); updateScoreDisplay(); } }
  }
  // ---------- J 互动：无伤害，只眩晕 0.8 秒 / 僵直 1 秒；目标由服务端判定 ----------
  async function attack() {
    if (combatFlight || !me || !me.alive || finished || selfDisabled() || rpsNow() < (me.combat?.attackUntil || 0)) return;
    const request = { session: sessionGeneration, token: sessionToken, combat: JSON.stringify(me.combat || {}) };
    const same = () => request.session === sessionGeneration && request.token === sessionToken && !!me;
    // 挥锤冷却只限制再次挥锤，保留方向键与服务端移动意图，不给自己加硬控。
    combatFlight = request;
    updateCombatHUD();
    try {
      const result = await api('/api/attack', { commandId: commandId(), ...floorFields() });
      if (!same()) return;
      if (![200, 400].includes(result.status) || typeof result.ok !== 'boolean') throw new Error('结果未确认');
      if (request.combat === JSON.stringify(me.combat || {})) {
        if (result.combat) me = { ...me, combat: result.combat };
        if (result.exploration) me = { ...me, exploration: result.exploration };
        if (result.games) me = { ...me, games: result.games };
      }
      if (typeof result.score === 'number') me = { ...me, score: result.score };
      combatResult = result.ok
        ? `${result.resultText || '已互动'}（无伤害：命中只眩晕 0.8 秒 / 僵直 1 秒，不影响生命与阵营）`
        : (result.error || '互动被拒绝');
    } catch {
      if (same()) combatResult = '网络异常，结果未确认；请等待权威状态更新，未自动重试。';
    } finally {
      if (combatFlight === request) combatFlight = null;
      if (same()) { updateCombatHUD(); updateScoreDisplay(); }
    }
  }
  function updateCombatHUD() {
    const now = serverNow(), button = $('attack-button'), combat = me?.combat;
    const cooldown = combat ? Math.max(0, Math.ceil(((combat.attackUntil || 0) - now) / 1000)) : 0;
    if (button) {
      button.disabled = !me || !me.alive || finished || selfDisabled() || !!interactionFlight || !!combatFlight || !!gamesFlight || cooldown > 0;
      button.textContent = cooldown > 0 ? `J · 互动 · 冷却 ${cooldown}s` : 'J · 互动';
    }
    const selfState = $('self-combat-state');
    if (selfState) selfState.textContent = !me ? '' : now < (combat?.freezeUntil || 0) ? '你被冻结中 · 暂时无法移动/互动'
      : now < (combat?.stunUntil || 0) ? '你被僵直中 · 暂时无法移动/互动' : '';
    const status = $('combat-status');
    if (status) { status.textContent = combatResult; status.hidden = !combatResult; }
  }
  $('attack-button').onclick = () => attack();
  $('ranking-toggle').onclick = () => { if ($('ranking').hidden) openRanking(); else closeRanking(); };
  $('ranking-close').onclick = closeRanking;
  $('wheel-close').onclick = closeWheel;
  $('wheel-spin').onclick = () => spinWheel();
  $('finish-close').onclick = hideFinish;

  // ---------- 离线事件：横幅 + 一次性摘要（不含操作者） ----------
  function pendingList() { return (me && me.pending) || []; }
  function updateOfflineUI() {
    const banner = $('offline-banner'), list = pendingList();
    const digest = me && me.interactionSummary;
    const offlineCount = list.filter(e => offlineEvents.has(e.eventId)).length;
    if (!list.length && !digest) { banner.hidden = true; banner.textContent = ''; return; }
    if (digest && !list.length) {
      banner.hidden = false; banner.textContent = '有一份离线私密摘要 · 点击查看';
      banner.onclick = () => renderSummary(1); return;
    }
    banner.hidden = false;
    banner.textContent = offlineCount
      ? `离线期间有 ${offlineCount} 条涉及你的事件 · 点击查看详情`
      : `有 ${list.length} 条涉及你的事件 · 点击查看详情`;
    banner.onclick = () => renderSummary(offlineCount);
  }
  function renderSummary(offlineCount) {
    const list = pendingList();
    const digest = me && me.interactionSummary;
    const digestText = digest ? `<li><p>离线期间被敲${digest.counts.hammer}次、被鬼吓${digest.counts.scare}次</p></li>` : '';
    const panel = $('offline-summary');
    panel.hidden = false;
    panel.innerHTML = `<div class="panel-heading"><div><small>PRIVATE DIGEST</small><h2>${offlineCount ? '离线期间事件' : '涉及你的事件'}</h2></div><button id="summary-close" class="icon-button" aria-label="关闭事件摘要">×</button></div><ul class="summary-list">${digestText}${list.map(e => `<li><time>${new Date(e.occurredAt).toLocaleTimeString('zh-CN', { hour12: false })}</time><p>${escapeText(e.text)}</p></li>`).join('')}</ul><p class="hold-note">摘要只说明你身上发生了什么，不含操作者。关闭后不再重复提示。</p>`;
    $('summary-close').onclick = () => { panel.hidden = true; panel.replaceChildren(); acknowledge(list, digest); };
  }
  async function acknowledge(list, digest) {
    const ids = list.map(e => e.eventId);
    if (!ids.length && !digest) return;
    const owner = sessionToken;
    try {
      const response = await api('/api/ack', {
        eventIds: ids, interaction: digest ? { id: digest.id, epoch: digest.epoch } : undefined
      });
      // 只有服务端确认成功后才改本地状态；失败/重连时同一摘要仍可用。
      if (!response.ok || owner !== sessionToken || !me) return;
      const known = new Set(ids);
      for (const id of known) offlineEvents.delete(id);
      me.pending = pendingList().filter(e => !known.has(e.eventId));
      if (digest) confirmedDigests.add(`${digest.epoch}:${digest.id}`);
      if (digest && me.interactionSummary && me.interactionSummary.id === digest.id) me.interactionSummary = null;
      updateOfflineUI();
    } catch { /* 保留未确认载荷，重新打开摘要可重试。 */ }
  }

  // ---------- 电梯过渡（客户端）：IDLE_SOURCE → PREPARING → SUBMITTING → TARGET_READY → OPENING → IDLE_TARGET ----------
  // 顺序：准备目标资源 + 保留源画面 → 单次原子提交 → 权威确认 + 目标层首帧就绪 → 开门 → 恢复输入。
  // 失败分 FAILED_SOURCE（已证实未换层，回源层）与 UNCONFIRMED（结果不明，只读对账，不重发）。
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function floorArrowText(from, to) { return `${from}F → ${to}F`; }
  function showFloorOverlay(arrow, phase, detail) {
    const overlay = $('floor-transition'); if (!overlay) return;
    overlay.hidden = false;
    $('floor-arrow').textContent = arrow || '';
    $('floor-phase').textContent = phase || '';
    $('floor-detail').textContent = detail || '';
  }
  function floorDoorsClosed(closed) {
    const overlay = $('floor-transition'); if (!overlay) return;
    overlay.classList.toggle('closed', !!closed);
  }
  function floorNoticeMode(on) {
    const overlay = $('floor-transition'); if (!overlay) return;
    overlay.classList.toggle('notice', !!on);
    const button = $('floor-transition-close'); if (button) button.hidden = !on;
    if (on) { clearTimeout(floorStageTimer); clearTimeout(floorNoticeTimer); }
  }
  function closeFloorOverlay() {
    const overlay = $('floor-transition'); if (!overlay) return;
    clearTimeout(floorStageTimer); clearTimeout(floorNoticeTimer);
    overlay.hidden = true;
    overlay.classList.remove('closed', 'notice');
    const button = $('floor-transition-close'); if (button) button.hidden = true;
  }
  // 2 秒仍在未完成阶段：补一句如实的细节，不催促、不视为失败。
  function floorSlowStage() {
    if (floorState !== 'PREPARING' && floorState !== 'SUBMITTING') return;
    const detail = $('floor-detail');
    if (detail) detail.textContent = '已等待 2 秒仍未收到服务端确认 · 换层仍在进行，请勿重复操作';
  }
  // 10 秒门帘上限：切成可关闭的静态提示（Esc 可关），但 10 秒 ≠ 允许返回源层。
  function floorCurtainMax() {
    if (floorState !== 'PREPARING' && floorState !== 'SUBMITTING' && floorState !== 'UNCONFIRMED') return;
    floorNoticeMode(true);
    const detail = $('floor-detail');
    if (!detail) return;
    detail.textContent = floorState === 'UNCONFIRMED'
      ? '换层结果仍未确认 · 可关闭此提示继续观察；未确认期间不会本地换层，请等待权威状态对账'
      : '服务端确认已超过 10 秒 · 可关闭此提示；换层请求不会重复发送';
  }
  // 关闭静态提示：只隐藏覆盖层，不改变换层状态（可能仍在等待权威对账）。
  function dismissFloorNotice() {
    const overlay = $('floor-transition'); if (!overlay || overlay.hidden || !overlay.classList.contains('notice')) return false;
    overlay.hidden = true; overlay.classList.remove('notice');
    const button = $('floor-transition-close'); if (button) button.hidden = true;
    return true;
  }
  // 整层原子切换：楼层、家具/墙/NPC/容器/入口、碰撞集合、点击标签、相机、插值同时对应新层。
  // 插值重新从权威坐标播种；朝向 spriteFacing 保留；不改动战斗状态（无无敌/眩晕/僵直，不动 J 冷却）。
  function adoptFloor(id, position) {
    loadFloorLocal(id);
    if (position) {
      const authoritative = selfPlayer();
      if (authoritative) { authoritative.floorId = id; authoritative.x = position.x; authoritative.y = position.y; }
    }
    for (const p of players) {
      if (p.floorId !== id) continue;
      const seed = (p.id === selfId() && position) ? position : { x: p.x, y: p.y };
      renderMap.set(p.id, { x: seed.x, y: seed.y, walk: 0, moving: false });
    }
    // 属于源层的即时面板与选择一次性清空，避免残留指向旧层。
    closeExploration(); closeGames(); closeWheel(); closeElevatorPicker();
    $('candidates').hidden = true; $('candidates').replaceChildren();
    selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); clearPrivate(true);
    nearbySig = ''; // 强制重建就近列表与描边
    keys.clear(); lastIntent = '';
    sendIntent(true);
    const self = selfPlayer(); const fl = WORLD.floorById(id);
    if (self) {
      cameraX = WORLD.cameraBounds(floorId, viewW, viewH, self.x, self.y).x;
      cameraY = WORLD.cameraBounds(floorId, viewW, viewH, self.x, self.y).y;
      drawCamX = cameraX; drawCamY = cameraY;
    }
    labels = []; updateScoreDisplay(); updateExplorationHUD();
    draw();
  }
  // 电梯选层面板：进门（E / 点击门）→ 弹出 1–7 楼层按钮（当前层禁选）→ 选定后发起换层。
  // 面板期间可随时 Esc / 点 × / 移动取消；提交时再按「距离 + 面向」守卫复查（服务端仍会再判一次）。
  function closeElevatorPicker() {
    if (!elevatorPicker) return false;
    elevatorPicker = null;
    const overlay = $('elevator-picker'); if (overlay) overlay.hidden = true;
    return true;
  }
  function openElevatorPicker(portalId) {
    if (!me || !me.alive || finished) return;
    if (floorState !== 'IDLE_SOURCE' && floorState !== 'IDLE_TARGET') return; // 过渡期间不重复发起
    if (selfDisabled()) { showToast('眩晕/僵直中，暂时无法乘梯'); return; }
    if (interactionFlight || combatFlight || gamesFlight || wheelSpinFlight) return;
    const portal = portals.find(p => p.id === portalId);
    if (!portal) return;
    const self = selfPlayer();
    if (!self) return;
    const access = WORLD.portalAccess(self, portal);
    if (!access.inReach) { showToast(access.reason || '距离电梯太远，请靠近后再按 E'); return; }
    if (!access.facingOk) { showToast(access.reason || '请面向电梯门后再按 E'); return; }
    closeExploration(); closeGames(); closeWheel(); closeElevatorPicker();
    elevatorPicker = { portalId };
    const box = $('elevator-floors'); box.replaceChildren();
    for (const fl of WORLD.floorOptions()) {
      const f = fl.id, btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'elevator-floor-btn'; btn.dataset.floorId = String(f);
      btn.setAttribute('aria-label', `${fl.label} ${fl.name} ${f === floorId ? '当前楼层' : '目标楼层'}`);
      btn.innerHTML = `<span>${f}F</span><small>${fl ? (fl.name || '').replace(/^\d+F\s*·?\s*/, '') : ''}</small>`;
      if (f === floorId) { btn.disabled = true; btn.title = '当前楼层'; btn.innerHTML = `<span>${f}F</span><small>当前楼层</small>`; }
      else btn.onclick = () => { const pid = elevatorPicker ? elevatorPicker.portalId : portalId; closeElevatorPicker(); requestFloorChange(pid, f); };
      box.append(btn);
    }
    const title = $('elevator-picker-title');
    if (title) title.textContent = `请选择楼层（当前 ${floorId}F）`;
    $('elevator-picker').hidden = false;
  }
  function requestFloorChange(portalId, targetFloorId) {
    if (!me || !me.alive || finished) return;
    if (floorState !== 'IDLE_SOURCE' && floorState !== 'IDLE_TARGET') return; // 过渡期间不重复发起
    if (selfDisabled()) { showToast('眩晕/僵直中，暂时无法乘梯'); return; }
    if (interactionFlight || combatFlight || gamesFlight || wheelSpinFlight) return;
    const portal = portals.find(p => p.id === portalId);
    if (!portal) return;
    // 电梯无方向：目标层 1–7 任选（除当前层）；客户端先判一次，服务端仍会再判。
    const target = Number(targetFloorId);
    if (!Number.isSafeInteger(target) || target < 1 || target > WORLD.FLOOR_COUNT) { showToast('目标楼层无效（1–7）'); return; }
    if (target === floorId) { showToast('已在本层，请选择其它楼层'); return; }
    const self = selfPlayer();
    if (self && WORLD.distanceToEntity(self, { x: portal.x, y: portal.y }) > WORLD.INTERACT_RANGE) { showToast('距离电梯太远，请靠近后再试（64 像素以内）'); return; }
    const access = WORLD.portalAccess(self, portal);
    if (!access.allowed) { showToast(access.reason); return; }
    // PREPARING：保留源画面 + 收拢输入 + 准备目标资源（各层 sprite 均已预烘焙）。
    keys.clear(); lastIntent = '';
    clearPrivate(true); closeExploration(); closeGames(); closeWheel(); closeElevatorPicker();
    $('candidates').hidden = true; $('candidates').replaceChildren(); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster();
    floorFlight = {
      commandId: commandId(), portalId, fromFloorId: floorId, targetFloorId: target,
      roundId, expectedFloorRevision: me.floorRevision, submitted: false
    };
    floorState = 'PREPARING';
    showFloorOverlay(floorArrowText(floorId, target), '正在准备目标楼层…', '保留当前画面 · 准备目标楼层资源');
    floorDoorsClosed(true);
    floorStartedAt = performance.now();
    floorStageTimer = setTimeout(floorSlowStage, 2000);
    floorNoticeTimer = setTimeout(floorCurtainMax, 10000);
    submitFloorChange();
  }
  async function submitFloorChange() {
    const flight = floorFlight;
    if (!flight || flight.submitted || floorState !== 'PREPARING') return;
    flight.submitted = true; // 单次原子提交：任何情况下都不重复发送同一次换层
    floorState = 'SUBMITTING';
    if ($('floor-transition').hidden === false) {
      $('floor-phase').textContent = '正在请求服务端裁决…';
    }
    let res = null;
    try {
      res = await api('/api/floor-change', {
        commandId: flight.commandId, roundId: flight.roundId, portalId: flight.portalId,
        expectedFloorId: flight.fromFloorId, expectedFloorRevision: flight.expectedFloorRevision,
        targetFloorId: flight.targetFloorId
      });
    } catch { res = null; }
    if (floorFlight !== flight) return; // 已被新的过渡替换 / 已收敛
    if (!res) { floorUnconfirmed('网络异常，换层结果未确认'); return; }
    if (res.status === 200 && res.ok === true && res.floor && res.position) { floorArrived(flight, res); return; }
    if (res.status === 400 && res.ok === false) { floorRejected(flight, res.error || '换层被拒绝'); return; }
    floorUnconfirmed('服务端响应未能确认换层结果');
  }
  function floorArrived(flight, res) {
    // 权威确认：先落 me 的权威楼层/版本，再整层原子切换（首帧就绪），最后开门。
    if (me) me = { ...me, floorId: res.floor.id, floorRevision: res.floor.revision, floorName: res.floor.name };
    const pos = res.position || (selfPlayer() ? { x: selfPlayer().x, y: selfPlayer().y } : null);
    floorState = 'TARGET_READY';
    adoptFloor(res.floor.id, pos);
    showFloorOverlay(floorArrowText(flight.fromFloorId, res.floor.id), `已到达 ${res.floor.name}`, '正在开门 · 即将恢复操作');
    floorState = 'OPENING';
    floorDoorsClosed(false);
    const delay = reduceMotion() ? 0 : 320;
    setTimeout(() => {
      if (floorState !== 'OPENING') return;
      floorState = 'IDLE_TARGET'; floorFlight = null;
      closeFloorOverlay();
    }, delay);
  }
  function floorRejected(flight, message) {
    // 已证实未换层：留在源层，开门并恢复。
    floorState = 'FAILED_SOURCE';
    floorDoorsClosed(false);
    showFloorOverlay(`${flight.fromFloorId}F`, '换层未成功', `${message}（仍在当前楼层）`);
    floorNoticeMode(true);
    showToast(message);
    const delay = reduceMotion() ? 0 : 320;
    setTimeout(() => {
      if (floorState !== 'FAILED_SOURCE') return;
      floorState = 'IDLE_SOURCE'; floorFlight = null;
      closeFloorOverlay();
    }, delay);
  }
  function floorUnconfirmed(message) {
    // 结果不明：保留门帘，不做本地换层，不重发；等待权威快照对账（applySnapshot 会收敛）。
    floorState = 'UNCONFIRMED';
    floorNoticeMode(true);
    showFloorOverlay('换层结果未确认', '等待权威状态对账…', `${message} · 不会自动重试换层`);
    const flight = floorFlight;
    // 仅 GET 对账；源层快照不能证明 POST 未执行，故不因此恢复输入或再次 POST。
    api('/api/state', null, 'GET').then(snapshot => {
      if (floorFlight !== flight || !snapshot.me || snapshot.roundId !== flight.roundId) return;
      if (snapshot.me.floorId === flight.targetFloorId && snapshot.me.floorRevision > flight.expectedFloorRevision) applySnapshot(snapshot);
    }).catch(() => { });
  }

  // ---------- 像素绘制 ----------
  function rect(x, y, w, h, color, g = ctx) { g.fillStyle = color; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function roundPx(x, y, w, h, fill, g = ctx) { g.fillStyle = fill; g.fillRect(x + 2, y, w - 4, h); g.fillRect(x + 1, y + 1, w - 2, h - 2); g.fillRect(x, y + 2, w, h - 4); }
  function glow(g, cx, cy, r, alpha) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, alpha));
    g.drawImage(glowSprite, cx - r, cy - r, r * 2, r * 2); g.restore();
  }
  function diamond(g, cx, cy, r, c) { for (let i = 0; i < r; i++) { const wd = (i + 1) * 2; rect(cx - i - 1, cy - r + i, wd, 1, c, g); rect(cx - i - 1, cy + r - i, wd, 1, c, g); } rect(cx - r, cy, 2 * r, 1, c, g); }
  function blob(g, x, y, w, h, c) { const hh = Math.max(2, Math.round(h)); for (let i = 0; i < hh; i++) { const k = Math.sin((i / (hh - 1)) * Math.PI); const ww = Math.max(1, Math.round(w * (0.35 + 0.65 * k))); rect(Math.round(x + (w - ww) / 2), Math.round(y + i), ww, 1, c, g); } }
  function stunStar(cx, cy) {
    cx = Math.round(cx); cy = Math.round(cy);
    rect(cx - 1, cy - 4, 3, 9, '#ffe066'); rect(cx - 4, cy - 1, 9, 3, '#ffe066');
    rect(cx - 1, cy - 1, 3, 3, '#fff6c2');
  }
  // ---------- 可交互描边：仅带 container 的家具与两个 NPC，且描边状态与真实可交互性一致 ----------
  function interactTier(kind, id) {
    // idle：自己已淘汰 / 本局结束 / 超出 INTERACT_RANGE。
    if (!me || !me.alive || finished) return 'idle';
    const entity = explorationEntity(kind, id);
    if (!entity || entityDistance(entity) > WORLD.INTERACT_RANGE) return 'idle';
    // blocked：在范围内但当前不能操作（自己眩晕/僵直 / 容器已搜 / NPC 筹码不足）。
    if (selfDisabled()) return 'blocked';
    const state = explorationState();
    const usable = kind === 'container' ? !state.searched.includes(id) : state.chips >= entity.cost;
    return usable ? 'ready' : 'blocked';
  }
  function drawOutline(x, y, w, h, tier, readyColor) {
    const rx = Math.round(x), ry = Math.round(y), rw = Math.round(w), rh = Math.round(h);
    if (tier === 'ready') {
      // 亮色描边 + 轻微呼吸脉冲；只用 strokeRect，无模糊/滤镜，保证 60fps。
      const pulse = .6 + .34 * (0.5 + 0.5 * Math.sin(clock * 3.2));
      ctx.globalAlpha = pulse; ctx.strokeStyle = readyColor; ctx.lineWidth = 2;
      ctx.strokeRect(rx - 1, ry - 1, rw + 2, rh + 2);
      ctx.globalAlpha = Math.min(1, pulse + .12); ctx.lineWidth = 1;
      ctx.strokeRect(rx - 2.5, ry - 2.5, rw + 5, rh + 5);
    } else if (tier === 'blocked') {
      ctx.globalAlpha = .7; ctx.strokeStyle = '#8b93a6'; ctx.lineWidth = 2;
      ctx.strokeRect(rx - .5, ry - .5, rw + 1, rh + 1);
    } else {
      ctx.globalAlpha = .18; ctx.strokeStyle = '#8b93a6'; ctx.lineWidth = 2;
      ctx.strokeRect(rx - .5, ry - .5, rw + 1, rh + 1);
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // 可搜容器的"脚下光圈"：半径固定 20×10 世界像素，跟着相机缩放但不跟着家具尺寸膨胀。
  // ready = 呼吸椭圆 + 内圈；blocked/idle = 灰圈，仍能看出这里可以搜。
  function drawContainerMarker(f, tier) {
    const cx = f.x + f.w / 2, by = f.y + f.h;
    ctx.save();
    if (tier === 'ready') {
      const pulse = .55 + .4 * (0.5 + 0.5 * Math.sin(clock * 3.2));
      ctx.globalAlpha = pulse; ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, by - 2, 20, 10, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = .45; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, by - 2, 11, 5.5, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.globalAlpha = tier === 'blocked' ? .5 : .16;
      ctx.strokeStyle = '#8b93a6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, by - 2, 16, 8, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // ---------- 家具三层绘制（阶段2-2a，美术规格 §3 C-0）----------
  // 视角约定：rect = 平面投影；立面占 rect 下沿起 facePx（柜类可越过 y，故需 padUp）；
  // 顶面 = 立面之上的可见上表面；立式部件自 y 向上生长。子件一律按 w / h / facePx 比例
  // （仅 1–2px 高光 / 描边为绝对像素）。"第 N 分格" 一律用 cellC(x,w,i,N) 均匀分布。
  const FURN_FACE = { desk: 24, table: 24, counter: 30, cabinet: 58, reception: 34, sofa: 26, plant: 19,
    treadmill: 42, rack: 35, mat: 2, seat: 30, stage: 13, wall: 7 };
  const FURN_PAD = {
    default: { padX: 16, padUp: 64, padDown: 32 },
    plant: { padX: 26, padUp: 44, padDown: 12 },
    sofa: { padX: 16, padUp: 12, padDown: 12 },
    mat: { padX: 16, padUp: 8, padDown: 8 },
    stage: { padX: 16, padUp: 20, padDown: 16 },
    wall: { padX: 4, padUp: 4, padDown: 4 }
  };
  const furnitureFace = type => (FURN_FACE[type] == null ? 24 : FURN_FACE[type]);
  const furniturePad = type => FURN_PAD[type] || FURN_PAD.default;
  const cellC = (x, w, i, N) => x + w * (i + 0.5) / N;   // 第 i 个（共 N 个）分格中心
  // 接地阴影：随 facePx 缩放，保证不同尺度下厚度一致。
  function furnShadow(g, x, y, w, h, facePx) {
    g.globalAlpha = .2;
    rect(x + w * .06, y + h - facePx * .20, w * .88, Math.max(4, facePx * .38), '#120c14', g);
    rect(x + w * .03, y + h - facePx * .10, w * .94, Math.max(3, facePx * .20), '#120c14', g);
    g.globalAlpha = 1;
  }
  // 立面：前挡板 / 柜体 / 桌腿 / 器身。
  function drawFurnitureFace(f, g, x, y, w, facePx) {
    const { h, type } = f, b = y + h, dp = h * .28 * (facePx / 24); // dp ≈ 视觉进深
    if (type === 'plant') {
      const px = x + w * .28, pw = w * .44, py = y + h * .52, ph = h * .46;
      rect(px, py, pw, ph, '#8a4f33', g);
      rect(px + 1, py, pw - 2, Math.max(2, ph * .14), '#b0714a', g);
      rect(px, py + ph * .14, pw, ph * .74, '#7a452c', g);
      rect(px + pw * .12, py + ph * .86, pw * .76, Math.max(2, ph * .16), '#5f3623', g);
      return;
    }
    if (type === 'sofa') {
      rect(x + w * .02, y + facePx * 1.05, w * .96, h - facePx * 1.05, '#415f63', g);
      rect(x + w * .02, y + facePx * 1.05, w * .96, 3, '#6b9095', g);
      rect(x + w * .02, b - 4, w * .96, 3, '#25393c', g);
      rect(x + w * .05, y + facePx * 1.2, w * .16, h - facePx * 1.5, '#55797d', g);
      rect(x + w * .79, y + facePx * 1.2, w * .16, h - facePx * 1.5, '#55797d', g);
      const lw = Math.max(4, w * .05);
      rect(x + w * .06, b - facePx * .16, lw, facePx * .16, '#4a3524', g);
      rect(x + w * .88, b - facePx * .16, lw, facePx * .16, '#4a3524', g);
      return;
    }
    if (type === 'cabinet') {
      const bd = Math.max(2, w * .02);
      rect(x, y, w, h, '#4e3c2c', g);
      rect(x + bd, y + bd, w - 2 * bd, h - 2 * bd, '#6b543c', g);
      rect(x + bd, y + bd, w - 2 * bd, 3, '#8a6e52', g);
      rect(x + bd, b - 3 - bd, w - 2 * bd, 3, '#3d2f22', g);
      rect(x + w / 2 - 1, y + bd * 2, 2, h - bd * 4, '#3d2f22', g);
      const dh = h * .34, dy = y + h * .18;
      rect(x + w * .06, dy, w * .40, dh, '#7a6247', g); rect(x + w * .06, dy, w * .40, 2, '#93744a', g);
      rect(x + w * .54, dy, w * .40, dh, '#7a6247', g); rect(x + w * .54, dy, w * .40, 2, '#93744a', g);
      const hw = Math.max(2, w * .015);
      rect(x + w * .30, y + h * .46, hw, h * .20, '#c8a86a', g); rect(x + w * .68, y + h * .46, hw, h * .20, '#c8a86a', g);
      return;
    }
    if (type === 'desk') {
      rect(x + w * .07, b - dp, w * .05, dp, '#4a3524', g);
      rect(x + w * .88, b - dp, w * .05, dp, '#4a3524', g);
      rect(x + w * .06, b - dp * 1.35, w * .88, dp * 1.35, '#5a4231', g);
      rect(x + w * .06, b - dp * 1.35, w * .88, 3, '#8a6a48', g);
      rect(x + w * .86, b - dp * 1.2, w * .11, dp * .86, '#6b5238', g);
      rect(x + w * .87, b - dp * 1.08, w * .09, 2, '#8f7050', g);
      rect(x + w * .89, b - dp * .86, w * .05, 2, '#c8a86a', g);
      rect(x + w * .12, b - dp * 1.1, w * .58, dp * .62, '#523c2d', g);
      rect(x + w * .12, b - dp * 1.1, w * .58, 1, '#634b38', g);
      return;
    }
    if (type === 'counter') {
      rect(x + w * .03, y + facePx * .78, w * .94, h - facePx * .78, '#48524f', g);
      rect(x + w * .03, y + facePx * .78, w * .94, 3, '#5f6b66', g);
      rect(x + w * .03, b - Math.max(3, facePx * .16), w * .94, Math.max(3, facePx * .16), '#2f3937', g);
      const N = 4;
      for (let i = 1; i < N; i++) {
        const px = x + w * i / N, cw = w / N - w * .04;
        rect(px, y + facePx * .9, 1, h - facePx * .95, '#333d3b', g);
        rect(px + w * .02, y + facePx, cw, h - facePx * 1.35, '#525d59', g);
        rect(px + w * .02, y + facePx, cw, 1, '#606c67', g);
        rect(px + w * .02, b - facePx * .32, cw, 2, '#3c4644', g);
      }
      return;
    }
    if (type === 'table') {
      rect(x + w * .08, y + h * .38, w * .05, h * .58, '#4a3524', g);
      rect(x + w * .87, y + h * .38, w * .05, h * .58, '#4a3524', g);
      return;
    }
    if (type === 'reception') {
      rect(x + w * .03, y + h * .5, w * .94, h * .5, '#5a4231', g);
      rect(x + w * .03, y + h * .5, w * .94, 3, '#8a6a48', g);
      rect(x + w * .03, b - 4, w * .94, 4, '#3f2f22', g);
      for (let i = 1; i < 3; i++) rect(x + w * i / 3, y + h * .56, 1, h * .4, '#46341f', g);
      return;
    }
    if (type === 'stage') {                                  // §6 舞台：台体立面 + 台沿
      rect(x, b - facePx, w, facePx, '#8a6a48', g);
      rect(x, b - facePx, w, 2, '#a5825b', g);
      rect(x, b - Math.max(2, facePx * .34), w, Math.max(2, facePx * .34), '#3f2f22', g);
      return;
    }
    if (type === 'rack') {                                   // §6 哑铃架：底座 2 腿
      rect(x + w * .22, b - 4, Math.max(3, w * .05), 4, '#3a2820', g);
      rect(x + w * .73, b - 4, Math.max(3, w * .05), 4, '#3a2820', g);
      return;
    }
    if (type === 'seat') {                                   // §6 座椅：座面 blob（近观者侧）
      const cw = Math.max(10, Math.min(16, w * .24)), ch = Math.max(5, h * .34);
      blob(g, x + w / 2 - cw / 2, y + h - ch * 1.6, cw, ch, '#a4665c');
      rect(x + w / 2 - cw * .66, y + h - ch * 1.6 - 2, cw * 1.32, 2, '#2b1a14', g);
      return;
    }
    if (type === 'mat') return;                              // §6 训练垫：无立面
    // default：通用柜体
    rect(x, y, w, h, '#5a4231', g); rect(x, y, w, 3, '#8a6a48', g); rect(x, b - 4, w, 4, '#3f2f22', g);
    const lw = Math.max(4, w * .05);
    rect(x + w * .05, b, lw, facePx * .2, '#4a3524', g); rect(x + w * .9, b, lw, facePx * .2, '#4a3524', g);
  }
  // 顶面：可见上表面 + 台面器物。
  function drawFurnitureTop(f, g, x, y, w, planPx) {
    const { h, type } = f, facePx = furnitureFace(type);
    const topH = Math.max(4, h - facePx);          // 立面之上的可见上表面高度
    const slab = Math.max(5, Math.min(topH, facePx * .6)); // 台面板厚
    if (type === 'plant') {
      rect(x + w * .49, y + h * .26, Math.max(3, w * .08), h * .3, '#3f7a52', g);
      blob(g, x + w * .02, y + h * .04, w * .5, h * .46, '#3f7a52', g);
      blob(g, x + w * .46, y + h * .0, w * .46, h * .48, '#4a8a5d', g);
      blob(g, x + w * .14, y + h * .24, w * .4, h * .34, '#2f6242', g);
      blob(g, x + w * .44, y + h * .26, w * .44, h * .32, '#58996a', g);
      rect(x + w * .12, y + h * .1, w * .14, 2, '#7fbb8c', g); rect(x + w * .6, y + h * .06, w * .12, 2, '#7fbb8c', g);
      return;
    }
    if (type === 'sofa') {
      rect(x + w * .03, y, w * .94, topH * .6, '#4b6b70', g);
      rect(x + w * .03, y, w * .94, 3, '#62868b', g);
      rect(x + w * .03, y + topH * .52, w * .94, 3, '#2c4549', g);
      const cw = (w - w * .18) / 2;
      rect(x + w * .09, y + topH * .6, cw, Math.max(3, h - topH * .95), '#4b6d71', g);
      rect(x + w * .09, y + topH * .6, cw, 2, '#62868b', g);
      rect(x + w * .55, y + topH * .6, cw, Math.max(3, h - topH * .95), '#4b6d71', g);
      rect(x + w * .55, y + topH * .6, cw, 2, '#62868b', g);
      rect(x + w / 2 - 1, y + topH * .6, 2, Math.max(3, h - topH), '#2c4549', g);
      rect(x + w * .15, y + topH * .6, w * .14, topH * .34, '#a4665c', g);
      rect(x + w * .15, y + topH * .6, w * .14, 2, '#c4837a', g);
      return;
    }
    if (type === 'cabinet') {
      rect(x, y, w, Math.max(3, topH), '#6b543c', g);
      rect(x, y, w, 2, '#8a6e52', g);
      return;
    }
    if (type === 'desk') {
      rect(x - w * .02, y, w * 1.04, Math.max(5, topH), '#7d5c3f', g);
      rect(x - w * .02, y, w * 1.04, 3, '#a5825b', g);
      rect(x - w * .02, y + Math.max(5, topH) - 3, w * 1.04, 3, '#543f2d', g);
      rect(x + w * .11, y + topH * .3, w * .3, Math.max(3, topH * .5), '#4a5058', g);
      rect(x + w * .12, y + topH * .34, w * .28, 1, '#6a7078', g);
      rect(x + w * .6, y + topH * .3, w * .28, Math.max(3, topH * .5), '#d5cfbe', g);
      rect(x + w * .61, y + topH * .34, w * .26, 1, '#8f8a7e', g);
      rect(x + w * .8, y + topH * .2, w * .13, topH * .75, '#e6dfcd', g);
      rect(x + w * .81, y + topH * .26, w * .11, 1, '#b9b3a2', g);
      rect(x + w * .9, y + topH * .16, w * .05, topH * .5, '#c96f4e', g);
      rect(x + w * .9, y + topH * .16, w * .05, 2, '#e08a6a', g);
      return;
    }
    if (type === 'counter') {
      rect(x - w * .015, y, w * 1.03, slab, '#cfc7bb', g);
      rect(x - w * .015, y, w * 1.03, 3, '#e8e2d6', g);
      rect(x - w * .015, y + slab - 3, w * 1.03, 3, '#9a9184', g);
      const N = Math.max(2, Math.round(w / (facePx * 4)));   // 台面器物按宽度均布
      for (let i = 0; i < N; i++) {
        const cx = cellC(x, w, i, N), cw = w / N * .22;
        rect(cx - cw / 2, y + slab * .18, cw, slab * .6, '#dfe6e6', g);
        rect(cx - cw / 2, y + slab * .18, cw, 2, '#f2f7f7', g);
        rect(cx - cw / 2, y + slab * .66, cw, 2, '#9aa4a4', g);
      }
      return;
    }
    if (type === 'table') {
      rect(x - w * .015, y, w * 1.03, slab, '#7d5c3f', g);
      rect(x - w * .015, y, w * 1.03, 3, '#a5825b', g);
      rect(x - w * .015, y + slab - 3, w * 1.03, 3, '#543f2d', g);
      rect(x + w * .05, y + slab * .2, w * .28, Math.max(3, slab * .5), '#4a5058', g);   // 健盘
      const px = x + w * .42, pw = w * .3;                                               // 盘子
      rect(px, y + slab * .2, pw, Math.max(3, slab * .6), '#e6dfcd', g);
      rect(px + 2, y + slab * .32, pw - 4, 1, '#b9b3a2', g);
      rect(x + w * .8, y + slab * .16, w * .1, Math.max(3, slab * .66), '#d9814f', g);   // 汤碗
      rect(x + w * .8, y + slab * .16, w * .1, 2, '#e8a173', g);
      return;
    }
    if (type === 'reception') {
      rect(x - w * .015, y, w * 1.03, slab, '#cfc7bb', g);
      rect(x - w * .015, y, w * 1.03, 3, '#e8e2d6', g);
      rect(x - w * .015, y + slab - 3, w * 1.03, 3, '#9a9184', g);
      rect(x + w * .04, y + slab * .3, w * .5, Math.max(2, slab * .4), '#4a5058', g);   // 健盘
      rect(x + w * .6, y + slab * .2, w * .2, Math.max(3, slab * .6), '#c8a86a', g);    // 名牌金条
      return;
    }
    if (type === 'treadmill') {                              // §6 跑步机：机架平面 + 2 跑带
      const mw = w * .75, mh = Math.max(6, h * .29), mx = x + (w - mw) / 2, my = y + h * .34;
      rect(mx, my, mw, mh, '#39414a', g);
      rect(mx, my, mw, 1, '#54606b', g);
      const bw = mw * .1, gp = mw * .07;
      rect(mx + mw * .16, my + 1, bw, mh - 2, '#2b2f38', g);
      rect(mx + mw * .16 + bw + gp, my + 1, bw, mh - 2, '#182f38', g);
      return;
    }
    if (type === 'rack') {                                   // §6 哑铃架：架体 + 3 层横杆 + 每层 5 个哑铃
      const rw = w * .5, rh = Math.max(5, h * .26), rx = x + (w - rw) / 2, ry = y + h * .3;
      rect(rx, ry, rw, rh, '#4a3528', g);
      rect(rx, ry, rw, 1, '#6b4f36', g);
      for (let L = 0; L < 3; L++) {
        const by = ry + rh * (L + .5) / 3;
        rect(rx, by, rw, 2, '#8d929a', g);
        for (let d = 0; d < 5; d++) {
          const dx = rx + rw * (d + .5) / 5 - 3;
          rect(dx, by - 1, 6, 3, ((d + L) % 2) ? '#39414a' : '#8d929a', g);
        }
      }
      return;
    }
    if (type === 'mat') {                                    // §6 训练垫：垫区圆角 + 亮边 + 中缝（无立面）
      const n = Math.max(1, Math.round(w / 48)), mw = Math.min(48, w / n), mh = Math.min(h * .84, 26.7);
      const mx0 = x + (w - n * mw) / 2, my = y + (h - mh) / 2;
      for (let i = 0; i < n; i++) {
        const mx = mx0 + i * mw;
        rect(mx + 2, my, mw - 4, mh, '#4b6b70', g);
        rect(mx, my + 2, mw, mh - 4, '#4b6b70', g);
        rect(mx + 2, my, mw - 4, 2, '#62868b', g);
        rect(mx + 2, my + mh - 2, mw - 4, 2, '#62868b', g);
        rect(mx, my + 2, 2, mh - 4, '#62868b', g);
        rect(mx + mw - 2, my + 2, 2, mh - 4, '#62868b', g);
        rect(mx + mw / 2 - .5, my + 2, 1, mh - 4, '#2c4549', g);
      }
      return;
    }
    if (type === 'stage') {                                  // §6 舞台：台面 + 沿 x 每 32px 木纹
      const th = Math.max(3, h - facePx);
      rect(x, y, w, th, '#8a6a48', g);
      rect(x, y, w, 2, '#a5825b', g);
      for (let gx = 32; gx < w - 4; gx += 32) rect(x + gx, y, 1, th, '#7d5c3f', g);
      return;
    }
    rect(x, y, w, Math.max(3, topH), '#8a6a48', g);
  }
  // 立式部件：显示器 / 收纳盒 / 收银机 / 花瓶等，自 y 向上生长。
  function drawFurnitureUpright(f, g, x, y, w) {
    const { h, type } = f;
    if (type === 'desk') {
      const mw = w * .16, mh = mw * .62, mx = x + w * .3;
      rect(mx - 2, y - mh - 2, mw + 4, mh + 4, '#2b2f38', g);
      rect(mx, y - mh, mw, mh, '#182f38', g);
      rect(mx, y - mh, mw, 2, '#0d1e25', g);
      rect(mx + mw * .06, y - mh + mh * .16, mw * .88, 3, '#63c7c4', g);
      rect(mx + mw * .06, y - mh + mh * .38, mw * .6, 2, '#4f9d9c', g);
      rect(mx + mw * .06, y - mh + mh * .58, mw * .74, 2, '#4f9d9c', g);
      rect(mx + mw * .34, y - mh * .28, mw * .12, mh * .28, '#39414a', g);
      rect(mx + mw * .16, y - 4, mw * .5, 4, '#4a5058', g);
      return;
    }
    if (type === 'cabinet') {
      rect(x + w * .07, y - 12, w * .19, 12, '#8a5a4a', g); rect(x + w * .09, y - 10, w * .15, 2, '#a97262', g);
      rect(x + w * .3, y - 10, w * .14, 10, '#4f6b74', g); rect(x + w * .3, y - 10, w * .14, 2, '#64868f', g);
      rect(x + w * .48, y - 8, w * .1, 8, '#6b7f5c', g); rect(x + w * .48, y - 8, w * .1, 2, '#87a078', g);
      return;
    }
    if (type === 'counter') {
      const rw = w * .12, rh = rw * .85;
      rect(x + w * .04, y - rh - 4, rw, rh + 4, '#39414a', g);
      rect(x + w * .05, y - rh - 2, rw * .9, rh * .28, '#1e2a30', g);
      rect(x + w * .07, y - rh + rh * .3, rw * .25, 3, '#d9814f', g);
      rect(x + w * .05, y - rh * .5, rw * .9, 4, '#2b323a', g);
      const mw = w * .07, mh = mw;
      rect(x + w * .26, y - mh - 6, mw, mh + 6, '#8d929a', g);
      rect(x + w * .27, y - mh - 4, mw * .85, 3, '#a9aeb6', g);
      rect(x + w * .26 + mw * .5, y - mh - 11, mw * .12, 6, '#5f646b', g);
      return;
    }
    if (type === 'table') {
      const mw = w * .12, mh = mw * .6, mx = x + w * .12;
      rect(mx, y - mh - 2, mw, mh + 2, '#39414a', g);
      rect(mx + 2, y - mh, mw - 4, mh * .74, '#182f38', g);
      rect(mx + 4, y - mh + mh * .18, mw * .55, 2, '#63c7c4', g);
      return;
    }
    if (type === 'reception') {
      const mw = w * .2, mh = mw * .62, mx = x + w * .1;
      rect(mx, y - mh - 2, mw, mh + 2, '#2b2f38', g);
      rect(mx + 2, y - mh, mw - 4, mh * .78, '#182f38', g);
      rect(mx + 4, y - mh + mh * .2, mw * .7, 3, '#63c7c4', g);
      rect(x + w * .78, y - 20, w * .1, 20, '#3f7a52', g);
      rect(x + w * .74, y - 28, w * .17, 8, '#c96f4e', g);
      rect(x + w * .8, y - 24, w * .05, 5, '#e08a6a', g);
      return;
    }
    if (type === 'treadmill') {                              // §6 跑步机：控制台（向上长，0.9m）+ 两侧扶手
      const cw = Math.max(14, w * .31), ch = Math.max(14, h * .68), mx = x + (w - cw) / 2, my = y + h * .34;
      rect(mx, my - ch, cw, ch, '#2b2f38', g);
      rect(mx + 2, my - ch + 2, cw - 4, ch * .55, '#182f38', g);
      rect(mx + 3, my - ch + 4, cw * .5, 2, '#63c7c4', g);
      rect(mx + 3, my - ch + 8, cw * .36, 2, '#4f9d9c', g);
      rect(mx + cw / 2 - 1, my - 2, 2, 2, '#39414a', g);
      rect(x + w * .1, my - 5, w * .09, 2, '#8d929a', g);
      rect(x + w * .81, my - 5, w * .09, 2, '#8d929a', g);
      return;
    }
    if (type === 'seat') {                                   // §6 座椅：一排椅背（向上长，含头枕）
      const n = Math.max(3, Math.round(w / 22.4)), sw = Math.max(10, Math.min(16, w / n * .74));
      for (let i = 0; i < n; i++) {
        const sx = x + w * (i + .5) / n - sw / 2;
        rect(sx, y + h * .1, sw, h * .72, '#8b4f47', g);
        rect(sx, y + h * .1, sw, 3, '#c4837a', g);
        rect(sx - 2, y + h * .52, 2, Math.max(3, h * .24), '#2b1a14', g);
        rect(sx + sw, y + h * .52, 2, Math.max(3, h * .24), '#2b1a14', g);
      }
      return;
    }
  }
  // §4 1F 食堂餐桌（六张『食堂餐桌一…六』）：规范组 80×24.7 在 rect 内居中，按
  // 接地阴影 → 远排椅 → 桌面 → 餐具 → 桌裙/桌腿 → 近排椅 的固定顺序绘制（餐桌专属可读性顺序，
  // 不能套通用的 Face→Top→Upright 三层，否则远排椅会盖在桌面上）。规范 rect=105.6×36，其余按比例缩放。
  function drawDiningTable(f, g) {
    const { x, y, w, h } = f;
    const sx = w / 105.6, sy = h / 36;
    const X = v => x + v * sx, Y = v => y + v * sy, W = v => v * sx, H = v => v * sy;
    const chair = (cx, cy, down) => {                   // 餐椅：座面 blob + 靠背；远排朝上、近排朝下（近观者侧），避免近排椅背盖住桌面
      const sw = W(15), sh = H(7), bh = H(12), sy0 = cy - sh * .5;
      blob(g, cx, sy0, sw, sh, '#c96f4e');
      const by = down ? sy0 + sh : sy0 - bh;
      rect(cx, by, sw, bh, '#b3613f', g);
      rect(cx, by, sw, Math.max(1, H(1)), '#e08a6a', g);
      rect(cx, sy0 + sh - 1, sw, 1, '#2b1a14', g);
    };
    // 1) 接地阴影（两条渐窄矩形）
    g.globalAlpha = .2;
    rect(X(6), Y(30), W(94), Math.max(4, H(6)), '#120c14', g);
    rect(X(3), Y(33), W(100), Math.max(3, H(3)), '#120c14', g);
    g.globalAlpha = 1;
    // 2) 远排椅 ×3（靠背朝上）
    for (let i = 0; i < 3; i++) chair(X(28 + i * 16), Y(10.5), false);
    // 3) 桌面（50×12，圆角 2px 由三段矩形堆出，不用 arc）
    const tx = X(28), ty = Y(12.4), tw = W(50), th = H(12), rad = Math.max(2, W(2));
    rect(tx + rad, ty, tw - 2 * rad, th, '#a5825b', g);
    rect(tx, ty + rad, tw, th - 2 * rad, '#a5825b', g);
    rect(tx, ty, tw, Math.max(2, H(2)), '#7d5c3f', g);                              // 远边
    rect(tx, ty + th - Math.max(2, H(3)), tw, Math.max(2, H(3)), '#c19a6b', g);      // 近边
    // 4) 餐具：沿桌面两长边各 3 位成对均布（盘 6×4 + 筷 1×7 + 杯 2×3；1 位加暖色汤碗）
    for (let i = 0; i < 3; i++) {
      const cx = X(30 + i * 16);
      for (const far of [true, false]) {
        const ey = far ? Y(13.4) : Y(21);
        rect(cx, ey, W(6), H(4), (!far && i === 1) ? '#d9814f' : '#e6dfcd', g);
        rect(cx, ey, W(6), Math.max(1, H(1)), '#b9b3a2', g);
        rect(cx + W(7), ey - H(3), Math.max(1, W(1)), H(7), '#4a5058', g);
        rect(cx + W(9), ey - H(1), W(2), Math.max(2, H(3)), '#dfe6e6', g);
      }
    }
    // 5) 桌裙 / 前立面
    rect(X(28), Y(18), W(50), Math.max(3, H(6)), '#543f2d', g);
    rect(X(28), Y(18), W(50), Math.max(1, H(1)), '#8a6a48', g);
    // 6) 桌腿 ×4
    for (const lx of [30, 43, 60, 73]) {
      rect(X(lx), Y(24), Math.max(2, W(3)), Math.max(3, H(4)), '#4a3524', g);
      rect(X(lx), Y(24), Math.max(1, W(1)), Math.max(3, H(4)), '#6b4f36', g);
    }
    // 7) 近排椅 ×3（后画；靠背朝下 ⇒ 只压住桌裙/桌腿，不盖桌面）
    for (let i = 0; i < 3; i++) chair(X(28 + i * 16), Y(28.5), true);
  }
  // §5 2F 工位：同一套零件（桌面板+显示器+键盘+桌下柜+转椅+屏风）按 rect 循环铺单体，绝不把整条带画成一块桌面。
  // 单元 screenW=51.2、plan 深=23.3（§8.1 U），立面从 plan 下沿起 24。N/行=round(w/51.2)（铺满整带）；
  // 行数=(rect深>=47)?2:1（§5.2）；双面岛=上排镜像(椅朝外、桌朝中线)+下排正常+中线屏风。
  function drawWorkstation(f, g) {
    const br = WORLD.deskBranch(f);
    if (br && br !== 'island') {
      // 单桌（workSingle / roomSingle）：桌+椅都画在碰撞块内 ⇒ 画=撞（房号单桌不再被画成工位岛）
      const b = f.blocks[0], bx = b.x, by = b.y, bw = b.w, bh = b.h;
      const chairH = Math.max(4, Math.min(8, bh * .35)), deskH = Math.max(4, bh - chairH);
      rect(bx, by, bw, deskH, '#a5825b', g);
      for (let gx = 4; gx < bw - 2; gx += 8) rect(bx + gx, by + 1, 1, Math.max(2, deskH - 2), '#96744e', g);
      rect(bx, by, bw, 1, '#c4a072', g);
      rect(bx, by + deskH - 1, bw, 1, '#6b4f36', g);
      rect(bx - 1, by - 1, bw + 2, 1, '#241c14', g);
      rect(bx - 1, by + bh - 1, bw + 2, 1, '#241c14', g);
      rect(bx - 1, by - 1, 1, bh + 1, '#241c14', g);
      rect(bx + bw, by - 1, 1, bh + 1, '#241c14', g);
      const mw = Math.max(8, Math.min(22, bw + 6)), mx = bx + (bw - mw) / 2;
      rect(mx, by - 9, mw, 10, '#2b2f38', g);
      rect(mx + 1, by - 8, mw - 2, 6, '#182f38', g);
      rect(mx + 2, by - 6, Math.max(3, mw * .5), 1, '#63c7c4', g);
      const cw = Math.min(14, Math.max(8, bw)), cx = bx + (bw - cw) / 2, cyt = by + deskH;
      rect(cx, cyt, cw, chairH, '#2b2f38', g);
      rect(cx, cyt, cw, 1, '#e08a6a', g);
      rect(cx - 1, cyt, 1, chairH, '#2b1a14', g);
      rect(cx + cw, cyt, 1, chairH, '#2b1a14', g);
      return;
    }
    // 与碰撞同源（world.js deskIsland）：行数阈值 / 岛深 / 位置一致 ⇒ 画什么撞什么。
    const isl = WORLD.deskIsland(f);
    const PLAN = isl.plan, UW = isl.unitW, Nper = isl.C, rows = isl.rows, gap = isl.gap;
    const blockH = isl.islandH, totalW = isl.bw, ox = isl.ox, oy = isl.uy;
    // 接地阴影（整块）
    g.globalAlpha = .18;
    rect(ox + 2, oy + blockH - 4, totalW - 4, 5, '#120c14', g);
    g.globalAlpha = 1;
    const unit = (ux, uyPlan, mirror) => {
      const Y = (v, hh) => mirror ? uyPlan + PLAN - v - hh : uyPlan + v;   // 局部(0=plan上沿) → 屏幕
      const dTopScreen = mirror ? uyPlan + PLAN - 12 : uyPlan;             // 桌面屏幕上沿
      // 显示器（屏幕空间、永远竖直朝上；面板 22×16 + 支臂 + 底座）
      rect(ux + 14.5, dTopScreen - 9, 23, 16, '#2b2f38', g);
      rect(ux + 16, dTopScreen - 7.5, 20, 13, '#182f38', g);
      rect(ux + 16.5, dTopScreen - 6, 15, 2, '#63c7c4', g);
      rect(ux + 16.5, dTopScreen - 3, 11, 1, '#4f9d9c', g);
      rect(ux + 16.5, dTopScreen - .5, 13, 1, '#4f9d9c', g);
      rect(ux + 24, dTopScreen + 8, 4, 5, '#39414a', g);
      rect(ux + 20, dTopScreen + 9, 11, 3, '#39414a', g);
      // 桌面板（顶面 47×12）—— §5.3-A 达标色值：面 #a5825b / 远边 #c4a072 / 近边 #6b4f36 / 外描边 #241c14
      const tyTop = Y(0, 12);
      rect(ux + 2, tyTop, 47, 12, '#a5825b', g);
      for (let gx = 4; gx < 48; gx += 8) rect(ux + gx, tyTop + 1, 1, 10, '#96744e', g);   // D3：仅竖向木纹
      rect(ux + 2, Y(0, 2), 47, 2, '#c4a072', g);          // 远边高光
      rect(ux + 2, Y(10, 2), 47, 2, '#6b4f36', g);         // 近边暗边
      rect(ux + 1, tyTop - 1, 49, 1, '#241c14', g);        // 外描边：上
      rect(ux + 1, tyTop + 12, 49, 1, '#241c14', g);       //           下
      rect(ux + 1, tyTop - 1, 1, 14, '#241c14', g);        //           左
      rect(ux + 49, tyTop - 1, 1, 14, '#241c14', g);       //           右
      // 桌面前立面 47×5
      rect(ux + 2, Y(12, 5), 47, 5, '#6b543c', g);
      rect(ux + 2, Y(12, 1), 47, 1, '#8f7050', g);
      // 桌下柜 / 主机 14×5 + 拉手
      rect(ux + 3, Y(12, 5), 14, 5, '#523c2d', g);
      rect(ux + 3, Y(14, 1), 14, 1, '#634b38', g);
      rect(ux + 4, Y(14, 2), 2, 2, '#c8a86a', g);
      // 键盘 24×3 + 鼠标 / 笔筒
      rect(ux + 12, Y(7, 3), 24, 3, '#4a5058', g);
      rect(ux + 12, Y(8, 1), 24, 1, '#6a7078', g);
      rect(ux + 38, Y(6, 3), 4, 3, '#c96f4e', g);
      rect(ux + 38, Y(5, 4), 4, 4, '#8d929a', g);
      // 转椅（座 14×6 + 背 14×9）—— §5.3-B C3/C5：蓝黑背 + 顶沿暖橙 + 1px 描边（与青灰屏风靠色相分开）
      rect(ux + 18, Y(19, 6), 14, 6, '#39414a', g);
      rect(ux + 18, Y(19, 1), 14, 1, '#4a5058', g);
      const byTop = Y(25, 9);
      rect(ux + 18, byTop, 14, 9, '#2b2f38', g);
      rect(ux + 18, byTop, 14, 1, '#e08a6a', g);           // 顶沿 1px 暖橙
      rect(ux + 17, byTop - 1, 16, 1, '#2b1a14', g);
      rect(ux + 17, byTop, 1, 9, '#2b1a14', g);
      rect(ux + 32, byTop, 1, 9, '#2b1a14', g);
      rect(ux + 17, Y(30, 3), 16, 3, '#4a5058', g);
    };
    for (let r = 0; r < rows; r++) {
      const uyPlan = oy + r * (PLAN + gap);
      const mirror = rows === 2 && r === 0;                 // 上排镜像
      for (let i = 0; i < Nper; i++) unit(ox + i * UW, uyPlan, mirror);
    }
    if (rows === 2) {                                       // §5.3-B C1：屏风每 51.2px 一条 1px 竖缝 ⇒ 数得出席位数
      const seamY = oy + PLAN + gap / 2;
      const dTop = seamY - 11;
      rect(ox, dTop, totalW, 11, '#4b6b70', g);
      rect(ox, dTop, totalW, 2, '#62868b', g);
      for (let s = 1; s < Nper; s++) rect(ox + s * UW, dTop + 2, 1, 9, '#2c4549', g);
    }
  }
  function drawFurniture(f, g = ctx) {
    const { x, y, w, h, type } = f;
    if (SCENE && SCENE.furniture(g, f)) return;
    if (type === 'table' && /^食堂餐桌/.test(f.label || '')) { drawDiningTable(f, g); return; }
    if (WORLD.deskBranch(f)) { drawWorkstation(f, g); return; }   // 工位岛 / 工位单桌 / 房号竖放单桌
    // §4 C-1 附属：后厨操作台是 0.9m 高操作台（浅石面），不是 1.8m 更衣柜造型 —— 按 label 借 counter 画法。
    if (type === 'cabinet' && f.label === '后厨操作台') {
      const g2 = Object.assign({}, f, { type: 'counter' }), FACE = 30;
      furnShadow(g, x, y, w, h, FACE);
      drawFurnitureFace(g2, g, x, y, w, FACE);
      drawFurnitureTop(g2, g, x, y, w, h);
      drawFurnitureUpright(g2, g, x, y, w);
      return;
    }
    furnShadow(g, x, y, w, h, furnitureFace(type));
    drawFurnitureFace(f, g, x, y, w, furnitureFace(type));
    drawFurnitureTop(f, g, x, y, w, h);
    drawFurnitureUpright(f, g, x, y, w);
  }
  function drawWindow(g, x, y, w, h) {
    rect(x - 5, y - 5, w + 10, h + 11, '#4a3a30', g); rect(x - 4, y - 4, w + 8, 3, '#6b5545', g);
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#7fb2cf'); sky.addColorStop(.45, '#f0c894'); sky.addColorStop(1, '#e2945f');
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    rect(x, y + h - 20, 26, 20, '#8a6a63', g); rect(x + 22, y + h - 28, 18, 28, '#7a5a56', g);
    rect(x + 38, y + h - 16, 22, 16, '#8a6a63', g); rect(x + 58, y + h - 30, 20, 30, '#6f5049', g);
    rect(x + 74, y + h - 18, 24, 18, '#8a6a63', g); rect(x + 96, y + h - 24, 18, 24, '#7a5a56', g);
    rect(x + 112, y + h - 14, 30, 14, '#8a6a63', g);
    for (let i = 0; i < 9; i++) rect(x + 6 + i * 14, y + h - 13 + (i * 7) % 9, 2, 2, '#ffe0a8', g);
    rect(x + w / 2 - 1, y, 2, h, '#5d4a3c', g); rect(x, y + h / 2 - 1, w, 2, '#5d4a3c', g);
    rect(x, y, w, 1, '#ffffff66', g);
    rect(x - 6, y + h + 4, w + 12, 4, '#5b483d', g); rect(x - 6, y + h + 4, w + 12, 1, '#7d6552', g);
    glow(g, x + w / 2, y + h + 46, 152, .15);
  }
  function drawFrame(g, x, y, w, h) {
    rect(x - 1, y - 1, w + 2, h + 2, '#3a2d24', g); rect(x, y, w, h, '#6b5545', g); rect(x, y, w, 2, '#8d745e', g);
    rect(x + 3, y + 3, w - 6, h - 6, '#22323a', g);
    rect(x + 5, y + h - 15, w - 10, 9, '#4f7078', g); rect(x + 6, y + 6, 7, 7, '#c98a5e', g); rect(x + w - 18, y + 8, 12, 5, '#8a6f8f', g);
    rect(x + 6, y + 6, 7, 1, '#e0a87c', g);
  }
  function drawClock(g, x, y, s) {
    rect(x - 2, y - 2, s + 4, s + 4, '#6b5545', g); rect(x - 1, y - 1, s + 2, s + 2, '#8d745e', g);
    rect(x, y, s, s, '#e8dcc4', g); rect(x + 1, y + 1, s - 2, 1, '#fff6e0', g); rect(x, y + s - 2, s, 2, '#b9ad95', g);
    rect(x + s / 2 - 1, y + 3, 2, s / 2 - 4, '#3a2f28', g); rect(x + s / 2 + 1, y + s / 2 - 1, s / 2 - 5, 2, '#3a2f28', g);
    rect(x + s / 2 - 1, y + s / 2 - 1, 2, 2, '#a34a4a', g);
  }
  function drawRug(g, x, y, w, h) {
    rect(x - 2, y - 2, w + 4, h + 4, '#1f2f31', g);
    rect(x, y + 6, w, h - 12, '#2b3f42', g); rect(x + 6, y, w - 12, h, '#2b3f42', g);
    rect(x + 5, y + 5, w - 10, h - 10, '#37504f', g); rect(x + 9, y + 9, w - 18, h - 18, '#3f5f5b', g);
    for (let i = 0; i < h - 40; i += 12) { rect(x - 3, y + 18 + i, 3, 7, '#6d5a44', g); rect(x + w, y + 18 + i, 3, 7, '#6d5a44', g); }
    rect(x + 12, y + 12, w - 24, 1, '#c39a5c', g); rect(x + 12, y + h - 13, w - 24, 1, '#c39a5c', g);
    rect(x + 12, y + 12, 1, h - 24, '#c39a5c', g); rect(x + w - 13, y + 12, 1, h - 24, '#c39a5c', g);
    rect(x + 16, y + 16, w - 32, h - 32, '#385450', g);
    for (let cx = x + 58; cx < x + w - 52; cx += 78) for (let cy = y + 46; cy < y + h - 48; cy += 56) diamond(g, cx, cy, 13, '#4d7168');
    rect(x + 16, y + 16, w - 32, 1, '#456a63', g);
  }
  function drawSign(g, x, y, w, h, text) {
    rect(x - 2, y - 2, w + 4, h + 4, '#3a2e26', g); rect(x, y, w, h, '#6b5233', g);
    rect(x, y, w, 2, '#93744a', g); rect(x, y + h - 3, w, 3, '#4d3a26', g);
    g.font = 'bold 13px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#2a1f14'; g.fillText(text, x + w / 2, y + h / 2 + 1);
    g.fillStyle = '#f8ecd0'; g.fillText(text, x + w / 2, y + h / 2);
  }
  function drawLamp(g, cx) {
    rect(cx - 1, 0, 2, 11, '#4a3c4c', g);
    rect(cx - 11, 11, 22, 3, '#6b5545', g); rect(cx - 9, 14, 18, 3, '#7d6552', g); rect(cx - 6, 17, 12, 2, '#8d745e', g);
    rect(cx - 4, 19, 8, 3, '#ffe0a8', g);
    glow(g, cx, 21, 46, .5);
  }
  // 家具/墙体 sprite 只为所有楼层的非墙家具烘焙一次；墙体在场景中按程序化面板绘制。
  function bakeSprites() {
    furnitureSprites.clear();
    // 楼层家具 + 房间家具一起烘焙：两者的 id 都稳定唯一，共用同一张缓存表。
    const allFurniture = [...Object.keys(WORLD.FLOORS).flatMap(k => WORLD.FLOORS[k].furniture),
      ...Object.keys(WORLD.ROOMS || {}).flatMap(k => WORLD.ROOMS[k].furniture)];
    for (const f of allFurniture) {
      // 阶段2-2a（§3 C0-2）：per-type 烘焙 padding；画布 (w+2padX)×(h+padUp+padDown)，绘制偏移 (-padX,-padUp)。
      const pad = furniturePad(f.type);
      const c = document.createElement('canvas'); c.width = f.w + pad.padX * 2; c.height = f.h + pad.padUp + pad.padDown;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      const dx = pad.padX - f.x, dy = pad.padUp - f.y;
      const local = {
        ...f, x: pad.padX, y: pad.padUp,
        ...(f.blocks ? { blocks: f.blocks.map(b => ({ ...b, x: b.x + dx, y: b.y + dy })) } : {}),
        ...(f.footprint ? { footprint: { ...f.footprint, x: f.footprint.x + dx, y: f.footprint.y + dy } } : {})
      };
      drawFurniture(local, g); furnitureSprites.set(f.id, c);
    }
  }
  bakeSprites();
  if (SCENE) SCENE.ready.then(() => { chunkClear(); bakeSprites(); draw(); });
  function drawWallPanel(f) {
    // 需求②：楼层里的隔墙也要跟随该层主题配色，否则 3F/6F/7F 会突兀地出现棕色木墙。
    const t = SCENE && SCENE.themeOf ? SCENE.themeOf(floorId) : null;
    const p = t && t.wall ? t.wall : null;
    const base = p ? p.base : '#5b4a3c';
    const trim = p ? p.trim : '#8d745e';
    const dark = p ? p.skirt : '#33251b';
    const seam = p ? p.line : '#4b3a2d';
    rect(f.x, f.y, f.w, f.h, base);
    rect(f.x, f.y, f.w, 3, trim);
    rect(f.x, f.y + f.h - 3, f.w, 3, dark);
    if (f.w >= f.h) { for (let x = f.x + 18; x < f.x + f.w - 8; x += 36) rect(x, f.y + 6, 2, Math.max(0, f.h - 12), seam); }
    else { for (let y = f.y + 18; y < f.y + f.h - 8; y += 36) rect(f.x + 5, y, Math.max(0, f.w - 10), 2, seam); }
  }
  // 电梯厅 —— 厅地坪 + 门框 + 金属双扇门 + 中缝 + 楼层指示 + 单个呼梯按钮。
  // 阶段3：电梯不分上下方向（进门弹选层），去掉方向箭头与双按钮；整体比例放大（门 64×30）。
  // 玩家站在门前并面向门时叠呼吸描边与「E 选择楼层」提示。
  function drawElevatorHall(p, active) {
    const cx = Math.round(p.x), cy = Math.round(p.y);
    const accent = '#7fe3ff';
    const hw = 32, hh = 15, x0 = cx - hw, y0 = cy - hh;
    const metal = '#8d929a', metalHi = '#a9aeb6';
    ctx.save();
    // 厅地坪（把门从地板纹理里抬出来）
    rect(x0 - 7, y0 - 7, hw * 2 + 14, hh * 2 + 18, '#3a3f4a');
    rect(x0 - 7, y0 - 7, hw * 2 + 14, 1, '#6b7480');
    rect(x0 - 7, y0 + hh * 2 + 10, hw * 2 + 14, 1, '#242a33');
    // 门框 + 两扇门 + 中缝 + 顶部高光
    rect(x0 - 2, y0 - 2, hw * 2 + 4, hh * 2 + 4, '#39414a');
    rect(x0, y0, hw - 1, hh * 2, metal);
    rect(x0 + hw + 1, y0, hw - 1, hh * 2, metal);
    rect(cx - 1, y0, 2, hh * 2, '#2b323a');
    rect(x0, y0, hw - 1, 3, metalHi);
    rect(x0 + hw + 1, y0, hw - 1, 3, metalHi);
    // 门上金属压线（比例放大后的细节）
    for (let i = 0; i < 2; i++) {
      rect(x0 + 6 + i * 10, y0 + 8, 6, 2, '#767c85');
      rect(x0 + hw + 7 + i * 10, y0 + 8, 6, 2, '#767c85');
    }
    // 楼层指示（无方向：只显示本层号）
    rect(cx - 13, y0 - 13, 26, 9, '#1a1f26');
    rect(cx - 13, y0 - 13, 26, 1, '#2f3640');
    ctx.font = '7px ui-monospace,SFMono-Regular,monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.fillText(`${p.floorId}F`, cx, y0 - 8.5);
    // 单个呼梯按钮（不分上下方向，只有一个呼叫键）
    rect(x0 + hw * 2 + 5, cy - 4, 6, 8, '#39414a');
    rect(x0 + hw * 2 + 6, cy - 3, 4, 6, '#7fe3ff');
    if (active) {
      ctx.globalAlpha = .5 + .35 * Math.sin(clock * 4);
      ctx.strokeStyle = accent; ctx.lineWidth = 2;
      ctx.strokeRect(x0 - 6, y0 - 6, hw * 2 + 12, hh * 2 + 14);
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
      const label = 'E 选择楼层';
      ctx.font = '10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      const tw = Math.round(ctx.measureText(label).width) + 12, lx = cx - tw / 2, ly = y0 - 32;
      ctx.fillStyle = 'rgba(8,11,18,.88)'; ctx.fillRect(lx, ly, tw, 16);
      ctx.strokeStyle = accent; ctx.lineWidth = 1;
      ctx.strokeRect(lx + .5, ly + .5, tw - 1, 15);
      ctx.fillStyle = '#eaf4ff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, ly + 8.5);
    }
    ctx.restore();
  }
  // 角色：统一描边 + 三层明暗 + 五官 + 发型 + 行走摆动。
  // 离线者只在渲染层降低不透明度，四种颜色外观数据一律不改。
  // 幽灵（dev 分支并入）：中性轮廓，不含任何由秘密派生的形状或颜色。
  function ghostSprite(p) {
    const x = Math.round(p.x);
    const bob = Math.round(Math.sin(clock * 1.7 + p.id) * 1.5);
    const y = Math.round(p.y) + bob;
    ctx.globalAlpha = p.online === false ? .5 : .8;
    ctx.fillStyle = p.online === false ? '#b1b3b8' : '#eeeae0';
    ctx.strokeStyle = '#a8a9af'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 14, y); ctx.lineTo(x - 14, y - 26);
    ctx.arc(x, y - 26, 14, Math.PI, 0);
    ctx.lineTo(x + 14, y); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x, y); ctx.lineTo(x - 7, y - 5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    rect(x - 6, y - 25, 3, 4, '#424957'); rect(x + 3, y - 25, 3, 4, '#424957');
    const scareAge = serverTime - (Number(p.scareAt) || 0);
    if (p.visible !== false && scareAge >= 0 && scareAge < 300) {
      ctx.strokeStyle = '#a8deee'; ctx.beginPath(); ctx.arc(x, y - 20, 19, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.id === selectedId || p.id === selfId()) { ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 1; ctx.strokeRect(x - 17, y - 43, 34, 47); }
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // 肿包：只读服务端的 bumps / bumpUntil，到期前 1.5 秒按剩余比例缩小淡出。
  function drawBumps(p, x, yb, a) {
    const n = Math.min(ACTION.maxBumps, Number(p.bumps) || 0);
    if (!n) return;
    const remain = (Number(p.bumpUntil) || 0) - serverNow();
    const k = remain < 1500 ? Math.max(0, remain / 1500) : 1;
    if (k <= 0) return;
    ctx.globalAlpha = a * (.5 + .5 * k);
    const offsets = [[-7, -1], [1, -4], [7, -1]];
    for (let i = 0; i < n; i++) {
      const r = Math.max(1, Math.round(4 * k));
      const cx = x + offsets[i][0], cy = yb - 49 + offsets[i][1] - Math.round(2 * k);
      rect(cx - r - 1, cy - r - 1, r * 2 + 3, r * 2 + 3, '#2a1a1c');
      rect(cx - r, cy - r, r * 2 + 1, r * 2 + 1, '#e08a7a');
      rect(cx - r + 1, cy - r + 1, Math.max(1, r), 1, '#f2b6a8');
    }
    ctx.globalAlpha = a;
  }
  function sprite(p) {
    if (!p.alive) { ghostSprite(p); return; }
    const x = Math.round(p.x), meId = selfId();
    const ph = p.walk * .13;
    const bob = p.moving ? 0 : Math.round(Math.sin(clock * 1.5 + p.id * 1.9) * .7);
    const yb = Math.round(p.y) + bob;
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    const now = serverNow(), attackAge = p.lastAttackAt ? now - p.lastAttackAt : null;
    // dev 分支并入：跳跃只在画面上把整身抬高（地面坐标不参与），镜头外由 visible 兜一层。
    const seen = p.visible !== false;
    const z = seen ? (Number(p.z) || 0) : 0;
    ctx.save();
    WORLD.drawCharacterBody(ctx, p, clock, attackAge, p.lastAttackDirection, z);
    // 身体绘制函数已把地面影子与跳跃分离；附加特效仍跟随腾空身体。
    if (z) ctx.translate(0, -z);
    // 无伤害互动视觉：手持木锤、冰蓝覆盖层与头顶眩晕星，均由权威时间戳推导。
    if (p.freezeUntil && p.freezeUntil > now) {
      ctx.globalAlpha = .4 * a; rect(x - 13, yb - 55, 26, 62, '#bfe8ff');
      ctx.globalAlpha = .55 * a; ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 1;
      ctx.strokeRect(x - 13.5, yb - 55.5, 27, 63); ctx.globalAlpha = 1;
    }
    if (p.stunUntil && p.stunUntil > now) {
      for (let i = 0; i < 3; i++) {
        const ang = clock * 3 + i * (Math.PI * 2 / 3);
        stunStar(x + Math.cos(ang) * 9, yb - 59 + Math.round(Math.sin(ang) * 3));
      }
    }
    // 被家具/墙体遮挡时（含自己）隐藏脚下指示与选中框，避免把位置信息透出去。
    const covered = !!WORLD.coverFor(p, occluders);
    if (!p.npc && p.id === meId && p.id !== selectedId && !covered) {
      // 自己只保留头顶小箭头，不绘制脚底蓝圈；地面影子由角色身体函数绘制。
      const off = Math.round(Math.sin(clock * 2.6) * 1.5);
      rect(x - 3, yb - 60 + off, 6, 3, '#9ed4ff'); rect(x - 2, yb - 57 + off, 4, 2, '#9ed4ff');
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    if (!p.npc && !covered && p.id === selectedId) {
      ctx.globalAlpha = (.55 + .3 * Math.sin(clock * 4.2)) * a;
      ctx.strokeStyle = '#8fd0ff'; ctx.lineWidth = 2; ctx.strokeRect(x - 20.5, yb - 52.5, 41, 58);
      ctx.globalAlpha = a; ctx.lineWidth = 1;
      const b = '#cfeeff';
      rect(x - 21, yb - 53, 9, 2, b); rect(x - 21, yb - 53, 2, 7, b);
      rect(x + 13, yb - 53, 8, 2, b); rect(x + 19, yb - 53, 2, 7, b);
      rect(x - 21, yb + 3, 9, 2, b); rect(x - 21, yb - 2, 2, 7, b);
      rect(x + 13, yb + 3, 8, 2, b); rect(x + 19, yb - 2, 2, 7, b);
      const off = Math.round(Math.sin(clock * 3.4) * 2);
      rect(x - 4, yb - 61 + off, 8, 3, '#8fd0ff'); rect(x - 3, yb - 59 + off, 6, 2, '#8fd0ff'); rect(x - 2, yb - 57 + off, 4, 2, '#8fd0ff');
      ctx.globalAlpha = 1;
    }
    if (seen) {
      drawBumps(p, x, yb, a);
      if (p.frightUntil && p.frightUntil > now) {
        ctx.globalAlpha = a; ctx.fillStyle = '#88d6e9';
        for (const dx of [-15, 15]) {
          ctx.beginPath(); ctx.moveTo(x + dx, yb - 44);
          ctx.quadraticCurveTo(x + dx - 4, yb - 38, x + dx, yb - 36);
          ctx.quadraticCurveTo(x + dx + 4, yb - 38, x + dx, yb - 44); ctx.fill();
        }
        ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('受惊', x, yb - 48);
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
  }
  // 命中框（x±21, y-53~y+8）与名牌偏移保持不变，外观升级不影响任何交互判定。
  let labels = [];
  const nameplateMetrics = new Map();
  function nameplateText(p) {
    return {
      name: p.name + (p.npc ? ' · NPC' : p.id === selfId() ? ' · 自己' : p.online === false ? ' · 离线' : ''),
      detail: p.npc ? `${p.cost} 筹码 / 私密线索兑换` : p.sid
    };
  }
  function nameplateSize(text) {
    const key = JSON.stringify([text.name, text.detail]);
    let width = nameplateMetrics.get(key);
    if (width === undefined) {
      ctx.save();
      ctx.font = '11px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      const nameWidth = ctx.measureText(text.name).width;
      ctx.font = '10px ui-monospace,SFMono-Regular,monospace';
      width = Math.ceil(Math.max(nameWidth, ctx.measureText(text.detail).width)) + 14;
      ctx.restore();
      // Measure only when displayed public text changes, not for every animation frame.
      if (nameplateMetrics.size >= 512) nameplateMetrics.clear();
      nameplateMetrics.set(key, width);
    }
    return { w: Math.max(90, width), h: 27 };
  }
  function drawList() {
    // 需求①：只画"自己所在的这个空间"里的人 —— 同层 + 同 zoneId。
    // 房间内因此看不到走廊上的人，走廊上也看不到房间里的人（与 visibleTo 的服务端裁剪一致）。
    return [...players.filter(p => p.floorId === floorId && (p.zoneId || null) === zoneId).map(p => {
      const r = renderMap.get(p.id) || { x: p.x, y: p.y, walk: 0, moving: false };
      return { ...p, x: r.x, y: r.y, walk: r.walk, moving: r.moving, spriteFacing: p.spriteFacing || 'front' };
    }), ...npcs];
  }
  function makeLabels(list) {
    // 任何被家具/墙体遮挡的角色（含自己与 NPC）都不生成名牌；解除遮挡同一帧恢复。
    // 合并适配：幽灵仍在画面上可见（dev 分支的幽灵互动需要），但沿用 main 的隐私取向
    // ——不给已淘汰者生成地图名牌/选中框，档案与名单里仍可查看其公开信息。
    labels = list.filter(p => p.alive && p.x >= drawCamX - 40 && p.x <= drawCamX + viewW + 40 &&
      p.y >= drawCamY - 30 && p.y <= drawCamY + viewH + 30 &&
      !WORLD.coverFor(p, occluders))
      .map(p => {
        const text = nameplateText(p), size = nameplateSize(text);
        return { x: p.x - size.w / 2, y: p.y + 10, ...size, text, ids: p.npc ? [] : [p.id], p };
      });
  }
  // ---------- 任务7：上半部分后墙（墙带 + 窗户 + 标语展示区，星露谷风） ----------
  // 沿楼层轮廓上边缘画一面后墙：上半部分不再突兀消失。墙带只作背景（先于家具/角色绘制），
  // 家具与角色按深度自然叠在其前方；行走不受影响（MIN_Y 已把角色挡在墙根以南）。
  // 布局：10 个 144px 模块，第 3/6/9 模块为标语展示板（中央板显示本层名，两侧预留），其余为窗户。
  const BACK_WALL_H = 58, WALL_MODULE = 144;
  function drawBackWall(f) {
    const w = f.width, y1 = BACK_WALL_H, y0 = -56; // 向上延伸：相机纵向居中（camY<0）时墙面不露底
    // 墙面主体 + 上压线 + 踢脚线 + 墙根阴影
    rect(0, y0, w, y1 - y0, '#4d4460');
    rect(0, y0, w, 2, '#6a5f80');
    rect(0, y0 + 2, w, 1, '#585070');
    rect(0, y1 - 7, w, 7, '#3a3248');
    rect(0, y1, w, 2, '#241f30');
    // 竖向壁板缝（壁炉砖式的星露谷节奏感）
    for (let x = 36; x < w; x += 48) rect(x, y0 + 3, 1, y1 - y0 - 10, '#443c56');
    const modules = Math.floor(w / WALL_MODULE);
    for (let i = 0; i < modules; i++) {
      const cx = Math.round(WALL_MODULE * (i + 0.5));
      if (i === 2 || i === 5 || i === 8) { drawSloganBoard(cx, i === 5 ? (f.name || '').replace(/^\d+F\s*·?\s*/, '') : null); continue; }
      drawBackWindow(cx);
    }
  }
  // 窗户：木框 + 玻璃（天空渐变 + 窗棂）+ 窗台 + 玻璃反光。
  function drawBackWindow(cx) {
    const ww = 64, wh = 34, x0 = cx - ww / 2, y0 = 12;
    // 窗台
    rect(x0 - 4, y0 + wh, ww + 8, 4, '#8d745e');
    rect(x0 - 4, y0 + wh + 4, ww + 8, 1, '#5b4a3c');
    // 木框
    rect(x0 - 2, y0 - 2, ww + 4, wh + 4, '#6b5545');
    rect(x0, y0, ww, wh, '#2f2a3a');
    // 玻璃：白天天空渐变
    const g = ctx.createLinearGradient(0, y0, 0, y0 + wh);
    g.addColorStop(0, '#aee0ff'); g.addColorStop(.6, '#8fc4ee'); g.addColorStop(1, '#cfe6f7');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, ww, wh);
    // 远处天际线剪影（像素楼群，星露谷窗外感）
    rect(x0 + 6, y0 + wh - 9, 10, 9, '#7da4c8');
    rect(x0 + 8, y0 + wh - 14, 6, 5, '#7da4c8');
    rect(x0 + 22, y0 + wh - 12, 12, 12, '#8fb4d6');
    rect(x0 + 40, y0 + wh - 8, 8, 8, '#7da4c8');
    rect(x0 + 50, y0 + wh - 13, 9, 13, '#8fb4d6');
    // 云（简单两坨）
    rect(x0 + 14, y0 + 6, 12, 3, '#f2f8ff'); rect(x0 + 17, y0 + 4, 7, 3, '#f2f8ff');
    rect(x0 + 38, y0 + 9, 10, 2, '#f2f8ff');
    // 窗棂：中竖 + 中横
    rect(cx - 1, y0, 2, wh, '#6b5545');
    rect(x0, y0 + Math.floor(wh / 2) - 1, ww, 2, '#6b5545');
    // 玻璃斜反光
    ctx.globalAlpha = .22;
    for (let k = 0; k < 5; k++) rect(x0 + 6 + k * 7, y0 + 2 + k * 5, 3, 8, '#ffffff');
    ctx.globalAlpha = 1;
  }
  // 标语展示板：木框深色板面。中央板显示本层名，两侧为预留标语位（后续挂内容，不臆造文案）。
  function drawSloganBoard(cx, text) {
    const bw = 104, bh = 30, x0 = cx - bw / 2, y0 = 14;
    // 吊绳与挂钉
    rect(cx - 2, 4, 1, 10, '#5b4a3c');
    rect(cx + 1, 4, 1, 10, '#5b4a3c');
    rect(cx - 3, 3, 7, 2, '#8d745e');
    // 木框
    rect(x0 - 3, y0 - 3, bw + 6, bh + 6, '#8d745e');
    rect(x0 - 3, y0 + bh + 1, bw + 6, 2, '#5b4a3c');
    // 板面
    rect(x0, y0, bw, bh, '#1d2438');
    rect(x0 + 2, y0 + 2, bw - 4, bh - 4, '#232c44');
    ctx.font = text ? '9px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif' : '8px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = text ? '#f0c47d' : '#4d5a7a';
    ctx.fillText(text ? text : '标 语 预 留', cx, y0 + bh / 2 + 1);
  }
  // 需求①：楼层上的房间门（门牌 + 地面光垫 + 可进入时的呼吸描边）
  function drawRoomDoors() {
    const self = selfPlayer();
    const t = performance.now() / 1000;
    const theme = SCENE && SCENE.themeOf ? SCENE.themeOf(floorId) : null;
    const wp = theme && theme.wall ? theme.wall : null;
    for (const room of zoneRooms) {
      const x = room.door.x, y = room.door.y;
      // 门所在的墙段：让门"长在墙上"，而不是悬在空地中间
      if (wp) {
        ctx.fillStyle = wp.base; ctx.fillRect(x - 56, y - 48, 112, 36);
        ctx.fillStyle = wp.trim; ctx.fillRect(x - 56, y - 48, 112, 3);
        ctx.fillStyle = wp.skirt; ctx.fillRect(x - 56, y - 15, 112, 3);
        ctx.fillStyle = wp.line;
        for (let sx = x - 50; sx < x + 56; sx += 28) ctx.fillRect(sx, y - 44, 1, 26);
      }
      // 地面门垫
      ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(x - 26, y - 13, 52, 26);
      const g2 = ctx.createLinearGradient(0, y - 13, 0, y + 13);
      g2.addColorStop(0, 'rgba(127,227,255,0.34)'); g2.addColorStop(1, 'rgba(127,227,255,0.05)');
      ctx.fillStyle = g2; ctx.fillRect(x - 26, y - 13, 52, 26);
      ctx.strokeStyle = 'rgba(127,227,255,0.42)'; ctx.lineWidth = 1; ctx.strokeRect(x - 25.5, y - 12.5, 51, 25);
      // 门框 + 门扇
      ctx.fillStyle = '#3b2f24'; ctx.fillRect(x - 31, y - 44, 62, 8);
      ctx.fillStyle = '#8d745e'; ctx.fillRect(x - 31, y - 44, 62, 2);
      ctx.fillStyle = '#2b3442'; ctx.fillRect(x - 23, y - 37, 46, 24);
      ctx.fillStyle = '#6b8fb5'; ctx.fillRect(x - 21, y - 35, 42, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x - 1, y - 35, 2, 20);
      ctx.fillStyle = '#ffe3a3'; ctx.fillRect(x + 14, y - 24, 2, 4);   // 门把手
      // 门牌
      ctx.fillStyle = '#0d1b2a'; ctx.fillRect(x - 38, y - 66, 76, 19);
      ctx.strokeStyle = 'rgba(127,227,255,0.55)'; ctx.strokeRect(x - 37.5, y - 65.5, 75, 18);
      ctx.fillStyle = '#bfe9ff';
      ctx.font = '10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(room.name.length > 7 ? room.name.slice(0, 7) + '…' : room.name, x, y - 56);
      // 可进入：呼吸描边
      if (self && Math.hypot(self.x - x, self.y - y) <= WORLD.ROOM_ENTER_PAD) {
        const a = 0.45 + 0.35 * Math.sin(t * 4);
        ctx.strokeStyle = `rgba(127,227,255,${a.toFixed(3)})`; ctx.lineWidth = 2;
        ctx.strokeRect(x - 27, y - 14, 54, 28);
        ctx.fillStyle = `rgba(191,233,255,${(0.55 + 0.35 * Math.sin(t * 4)).toFixed(3)})`;
        ctx.font = '10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
        ctx.fillText('E 进入房间', x, y + 30);
      }
    }
  }
  // 需求①：房间内的出口（门垫 + 提示），走到这里按 E 离开；位置会还原到进门时的站位。
  function drawRoomExit(room) {
    const x = room.exit.x, y = room.exit.y;
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(x - 34, y - 12, 68, 24);
    const g2 = ctx.createLinearGradient(0, y - 12, 0, y + 12);
    g2.addColorStop(0, 'rgba(255,214,120,0.30)'); g2.addColorStop(1, 'rgba(255,214,120,0.05)');
    ctx.fillStyle = g2; ctx.fillRect(x - 34, y - 12, 68, 24);
    ctx.strokeStyle = 'rgba(255,214,120,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(x - 33.5, y - 11.5, 67, 23);
    ctx.fillStyle = '#2b3442'; ctx.fillRect(x - 40, y + 18, 80, 16);
    ctx.fillStyle = '#ffe3a3';
    ctx.font = '10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('E 离开房间', x, y + 26);
  }
  function draw() {
    if (floorState === 'PREPARING' || floorState === 'SUBMITTING' || floorState === 'UNCONFIRMED') return;
    const camX = Math.round(cameraX), camY = Math.round(cameraY);
    drawCamX = camX; drawCamY = camY;
    const WALL_Y = WORLD.WALL_BASE || 58;   // 后墙墙带下沿：墙带以内属纯背景，家具需裁剪
    const f = WORLD.floorById(floorId);
    const currentRoom = zoneId ? WORLD.roomById(zoneId) : null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, cssW, cssH);
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-camX, -camY);
    if (currentRoom) {
      // 需求①：房间是独立空间 —— 不画楼层轮廓/分块/后墙/电梯厅，只画这间屋子自己的地面与墙。
      ctx.fillStyle = '#070a10'; ctx.fillRect(camX - 8, camY - 8, viewW + 16, viewH + 16);
      if (!(SCENE && SCENE.roomFloor(ctx, currentRoom))) {
        ctx.fillStyle = '#2b2333'; ctx.fillRect(0, 0, currentRoom.width, currentRoom.height);
      }
      drawRoomExit(currentRoom);
    } else {
      // 楼面：按轮廓多边形裁剪后铺 512 分块地板；轮廓外保持非楼面（不补平）。
      ctx.beginPath();
      f.polygon.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.closePath();
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#2b2333'; ctx.fillRect(camX, camY, viewW, viewH);
      const c0x = Math.floor(camX / CHUNK), c1x = Math.floor((camX + viewW) / CHUNK);
      const c0y = Math.floor(camY / CHUNK), c1y = Math.floor((camY + viewH) / CHUNK);
      ensureChunks(c0x, c0y, c1x, c1y, floorId);
      for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) ctx.drawImage(chunkGet(cx, cy, floorId), cx * CHUNK, cy * CHUNK);
      ctx.restore();
      // 任务7：后墙墙带 + 窗户 + 标语展示区（先于家具/角色绘制，作纯背景）。
      // 逐层"世界风格"主题：改由共享 scene.js 按主题绘制墙带材质/配色/墙饰；未就绪时回退原生画法。
      if (!(SCENE && SCENE.wall(ctx, f))) drawBackWall(f);
    }
    ctx.restore();
    // 暗角在 CSS 像素空间贴一次，位于背景与角色之间，避免随缩放变形或压暗角色。
    if (vignette) ctx.drawImage(vignette, 0, 0, cssW, cssH);
    ctx.save(); ctx.scale(scale, scale); ctx.translate(-camX, -camY);
    if (SCENE && !currentRoom) SCENE.halls(ctx, f, glassDoorStates);
    // 需求①：楼层上画出通往各独立房间的门（门牌 + 地面指示灯带），让"哪面墙能进去"一眼可见。
    if (!currentRoom) drawRoomDoors();
    const list = drawList();
    const near = (x, y, w, h, padx, pady) => x + w + padx > camX && x - padx < camX + viewW && y + h + pady > camY && y - (pady + 20) < camY + viewH;
    const scene = [
      ...furniture.filter(f2 => near(f2.x, f2.y, f2.w, f2.h, 12, 12)).map(f2 => ({ depth: f2.depth, f: f2 })),
      ...walls.filter(w => near(w.x, w.y, w.w, w.h, 12, 12)).map(w => ({ depth: w.depth, f: w })),
      ...list.filter(p => p.x > camX - 12 && p.x < camX + viewW + 12 && p.y > camY - 25 && p.y < camY + viewH + 30).map(p => ({ depth: p.y, p }))
    ].sort((a, b) => a.depth - b.depth || Number(!!b.f) - Number(!!a.f));
    for (const item of scene) {
      if (item.f) {
        const f2 = item.f;
        if (f2.type === 'wall') {
          // 需求①：房间墙体走独立画法（主题色 + 门洞 + 挂画），楼层墙体保持原程序化面板。
          if (f2.roomId && SCENE && SCENE.roomWall) SCENE.roomWall(ctx, f2, currentRoom || { floorId });
          else drawWallPanel(f2);
          continue;
        }
        // 后墙墙带（y<WALL_Y）是纯背景：只对可能画进墙带的家具裁剪，避免"家具/装饰被画到墙上"。
        const clipWall = f2.y - 24 < WALL_Y;
        if (clipWall) { ctx.save(); ctx.beginPath(); ctx.rect(camX - 400, WALL_Y, viewW + 800, viewH + 600); ctx.clip(); }
        const pad = furniturePad(f2.type);
        ctx.drawImage(furnitureSprites.get(f2.id), f2.x - pad.padX, f2.y - pad.padUp);
        // 紧跟家具 sprite 之后画交互标记：深度更大的家具后画时会自然盖住，不穿透遮挡。
        // 用脚下的小椭圆光圈而不是整块家具矩形——放大后家具矩形可能很大，
        // 框住整张桌子/工位岛会让人误以为"搜索范围有这么大"。
        if (f2.container) drawContainerMarker(f2, interactTier('container', f2.id));
        if (clipWall) ctx.restore();
      } else {
        sprite(item.p);
        // NPC 描边对准命中框 x±21, y-53..y+8。
        if (item.p.npc) drawOutline(item.p.x - 21, item.p.y - 53, 42, 61, interactTier('npc', item.p.entityId), '#ffd76a');
      }
    }
    // 需求2：当前层电梯厅（每层左右各一处，含上行/下行两扇门）。脉冲空框改为可辨认的电梯门，
    // 当前可提交的那扇叠呼吸描边 + 「E ↑/↓ 至 nF」提示；端点画灰态。
    const liftNow = elevatorTarget();
    const liftId = liftNow && liftNow.access.allowed ? liftNow.portal.id : '';
    for (const portal of portals) drawElevatorHall(portal, portal.id === liftId);
    makeLabels(list);
    ctx.textAlign = 'center';
    const meId = selfId();
    for (const l of labels.slice().sort((a, b) => Number(a.p.id === selectedId || a.p.id === meId) - Number(b.p.id === selectedId || b.p.id === meId))) {
      const active = l.ids.includes(selectedId);
      const accent = l.p.npc ? '#e9c877' : active ? '#7cc4ff' : (l.p.alive ? '#78c39b' : '#7c8698');
      // Translucent backdrop; keep glyphs opaque and avoid an opaque border behind the fill.
      rect(l.x + 1, l.y + 2, l.w, l.h, '#080b1220');
      rect(l.x, l.y, l.w, l.h, active ? '#14304fcc' : '#0f1826b3');
      ctx.strokeStyle = active ? '#7cc4ffb3' : '#536c8980'; ctx.lineWidth = 1;
      ctx.strokeRect(l.x + .5, l.y + .5, l.w - 1, l.h - 1);
      rect(l.x + 1, l.y + 4, 2, l.h - 8, accent);
      ctx.font = '11px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.fillStyle = active ? '#eaf4ff' : '#e2e8f0';
      ctx.fillText(l.text.name, l.x + l.w / 2, l.y + 11);
      ctx.font = '10px ui-monospace,SFMono-Regular,monospace';
      ctx.fillStyle = active ? '#bbd9f3' : '#b0c5dd';
      ctx.fillText(l.text.detail, l.x + l.w / 2, l.y + 23);
    }
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFogOverlay();
  }
  // 5F 战争迷雾：只留人物周围一小圈可见，其余压黑。半径与服务端裁剪共用 FLOOR_FOG。
  // 房间内（zoneId）不盖雾——那是独立空间，有自己的小镜头。
  function drawFogOverlay() {
    const cfg = WORLD.FLOOR_FOG && WORLD.FLOOR_FOG[floorId];
    if (!cfg || zoneId) return;
    const self = renderMap.get(selfId());
    if (!self) return;
    ctx.save();
    ctx.globalAlpha = 1;
    const sx = (self.x - drawCamX) * scale;
    const sy = (self.y - drawCamY) * scale;
    // 轻微呼吸/火光抖动，避免像一块固定黑色遮罩。
    const wobble = 1 + Math.sin(clock * 6.3) * 0.012 + Math.sin(clock * 13.7) * 0.006;
    const radius = Math.max(60, cfg.radius * scale * wobble);
    // 可见圈里加一点暖色火光（贴地），让"一小圈可见"不是冷冰冰的探照灯。
    const warm = ctx.createRadialGradient(sx, sy, 4, sx, sy, radius * 0.62);
    warm.addColorStop(0, 'rgba(255,184,108,0.10)');
    warm.addColorStop(0.55, 'rgba(255,160,90,0.05)');
    warm.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, cssW, cssH);
    const g = ctx.createRadialGradient(sx, sy, Math.max(8, radius * 0.26), sx, sy, radius);
    g.addColorStop(0, 'rgba(3,4,8,0)');
    g.addColorStop(0.5, 'rgba(3,4,8,0.06)');
    g.addColorStop(0.72, 'rgba(3,4,8,0.45)');
    g.addColorStop(0.88, 'rgba(2,3,6,0.88)');
    g.addColorStop(1, 'rgba(1,2,4,0.99)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.restore();
  }

  // ---------- 插值与镜头 ----------
  function step(dt) {
    clock += dt;
    const k = Math.min(1, dt * 12);
    for (const p of players) {
      const r = renderMap.get(p.id); if (!r) continue;
      const dx = p.x - r.x, dy = p.y - r.y;
      r.x += dx * k; r.y += dy * k;
      r.moving = Math.hypot(dx, dy) > 0.6;
      if (r.moving) r.walk += Math.hypot(dx * k, dy * k);
    }
    const self = selfPlayer() ? renderMap.get(selfId()) : null;
    const fl = WORLD.floorById(floorId);
    // 相机：世界某轴小于视口时该轴居中（camX/ camY 可为负），否则夹在楼面内。
    // 需求①：房间内用房间自己的相机边界（房间通常小于一屏 → 整间居中，不产生滚动）。
    if (self) {
      const cam = WORLD.zoneCamera(floorId, zoneId, viewW, viewH, self.x, self.y);
      cameraX = cam.x;
      cameraY = cam.y;
    } else {
      const cam = WORLD.zoneCamera(floorId, zoneId, viewW, viewH, cameraX + viewW / 2, cameraY + viewH / 2);
      cameraX = cam.x;
      cameraY = zoneId ? cam.y : clamp(cameraY, 0, Math.max(0, fl.height - viewH));
    }
    $('floor-indicator').textContent = `${floorId}F`;
    // 需求①：空间提示条 / 坐标随 zone 变化（房间内显示房间名）。
    syncZoneBanner();
    const tick = Math.floor(serverTime / 1000);
    if (tick !== lastSkillTick) {
      lastSkillTick = tick;
      if (holding()) updateSkillStatus();
      updateBuffHUD();
      if (mineOpen) renderMine();
      syncTimeLeft();
      if (!$('ranking').hidden) syncRanking();
      if (wheelOpen) updateWheelControls();
    }
    // 自身眩晕/僵直期间不发送移动意图、清空按键（服务端也会强制停止，客户端保持一致）。
    if (selfDisabled() && keys.size) { keys.clear(); sendIntent(true); }
    updateCombatHUD();
    if (!$('games').hidden) syncGames();
  }
  let lastNow = performance.now();
  function frame(now) {
    step(Math.max(0, Math.min(.05, (now - lastNow) / 1000)));
    lastNow = now;
    draw(); updateExplorationHUD();
    requestAnimationFrame(frame);
  }

  // ---------- 交互 ----------
  function canvasPoint(e) {
    // 屏幕像素 → CSS 像素 → 世界坐标，使用与绘制同一帧的 drawCam；不再用 contain 留边。
    const r = canvas.getBoundingClientRect();
    const kx = cssW / (r.width || cssW || 1), ky = cssH / (r.height || cssH || 1);
    const sx = (e.clientX - r.left) * kx, sy = (e.clientY - r.top) * ky;
    return { x: sx / scale + drawCamX, y: sy / scale + drawCamY };
  }
  function showCandidates(ids) {
    closeExploration(); clearPrivate(true); closeWheel();
    const list = [...new Set(ids)].filter(id => players.some(p => p.id === id && p.alive && p.floorId === floorId)).sort((a, b) => a - b);
    $('candidates').hidden = false;
    $('candidates').innerHTML = `<div class="panel-heading"><div><small>OVERLAPPING PLAYERS</small><h2>请选择目标</h2></div><button id="candidate-close" class="icon-button" aria-label="关闭重叠候选">×</button></div><p>同一点击点有${list.length}位玩家，不会自动选人。</p>${list.map(id => row(players.find(p => p.id === id))).join('')}`;
    bindRows($('candidates'));
    $('candidate-close').onclick = () => { $('candidates').hidden = true; $('candidates').replaceChildren(); };
  }
  canvas.addEventListener('click', e => {
    if (floorState !== 'IDLE_SOURCE' && floorState !== 'IDLE_TARGET') { canvas.focus(); return; }
    const { x, y } = canvasPoint(e);
    const list = drawList();
    makeLabels(list);
    const atLabel = l => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h && !WORLD.pointOccluded(x, y, l.p, occluders);
    const atBody = p => Math.abs(x - p.x) <= 21 && y >= p.y - 53 && y <= p.y + 8 && !WORLD.pointOccluded(x, y, p, occluders);
    const labelHits = labels.filter(l => !l.p.npc && atLabel(l));
    const bodyHits = list.filter(p => !p.npc && atBody(p)).map(p => p.id);
    const hits = [...new Set([...labelHits.flatMap(l => l.ids), ...bodyHits])];
    if (hits.length > 1) showCandidates(hits);
    else if (hits.length === 1) {
      const label = labelHits.find(l => l.ids.includes(hits[0]));
      if (label && y >= label.y + 13) copySID(label.p.sid);
      else select(hits[0]);
    } else {
      // 需求①：点在房间门牌上 → 进入该房间（门牌本身就是交互热区）。
      if (!zoneId) {
        const door = roomDoorCandidate();
        if (door && Math.hypot(x - door.room.door.x, y - door.room.door.y) <= 34) {
          enterRoom(door.room.id, door.room.name); canvas.focus(); return;
        }
      } else {
        const exit = roomExitCandidate();
        if (exit && Math.hypot(x - exit.exit.x, y - exit.exit.y) <= 40) {
          leaveRoom(exit.name); canvas.focus(); return;
        }
      }
      // 点击电梯门与 E 走同一套「靠近 + 面向」守卫，不再有绕过路径；进门先弹选层面板。
      const portalHit = portals.find(pt => x >= pt.x - pt.w / 2 && x <= pt.x + pt.w / 2 && y >= pt.y - pt.h / 2 && y <= pt.y + pt.h / 2);
      if (portalHit) {
        const self = selfPlayer(), access = self ? WORLD.portalAccess(self, portalHit) : null;
        if (access && access.allowed) openElevatorPicker(portalHit.id);
        else showToast(access ? access.reason : '请靠近角色或电梯门后再操作');
        canvas.focus(); return;
      }
      const npc = npcs.filter(p => atBody(p) || labels.some(l => l.p.id === p.id && atLabel(l))).sort((a, b) => b.y - a.y)[0];
      // 只点击最前面的家具，不能隔着另一件家具搜寻容器。
      const front = furniture.filter(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => b.depth - a.depth)[0];
      // 需求③：容器点击打开物品格面板（不再是一键搜完的旧面板）。
      if (npc) openExploration('npc', npc.entityId);
      else if (front?.container) openLootFor(front);
      else { closeExploration(); clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); }
    }
    canvas.focus();
  });
  $('floor-transition-close').onclick = () => dismissFloorNotice();
  $('elevator-close').onclick = () => closeElevatorPicker();
  function toggle(panel, button) {
    const visible = $(panel).hidden;
    $(panel).hidden = !visible;
    $(button).setAttribute('aria-expanded', String(visible));
    if (panel === 'roster') renderRoster();
  }
  $('roster-toggle').onclick = () => toggle('roster', 'roster-toggle');
  $('roster-close').onclick = () => toggle('roster', 'roster-toggle');
  $('search').oninput = renderRoster;
  // ---------- 匿名坏人线索池（dev 分支并入）：只消费服务端的匿名投影，不推断身份 ----------
  function renderBadPool() {
    const sig = JSON.stringify([badPoolAvailable, badSlots]);
    if (sig === lastBadPoolSig) return;
    lastBadPoolSig = sig;
    const root = $('bad-slots'), fragment = document.createDocumentFragment();
    const text = (tag, content, className) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      node.textContent = content; return node;
    };
    if (!badPoolAvailable) {
      fragment.append(text('p', '当前服务尚未提供匿名线索池；请勿把暂未提供解读为没有坏人。', 'bad-empty'));
    } else if (!badSlots.length) {
      fragment.append(text('p', '暂无坏人', 'bad-empty'));
    } else {
      for (const slot of badSlots) {
        const card = document.createElement('article');
        card.className = slot.alive ? 'bad-slot' : 'bad-slot is-out';
        const head = document.createElement('header');
        head.append(text('strong', slot.label), text('span', slot.alive ? '存活' : '已淘汰', 'bad-status'));
        card.append(head);
        let known = 0;
        for (const [key, label] of Object.entries(traitNames)) {
          const value = slot.traits && typeof slot.traits[key] === 'string' ? slot.traits[key] : MASK;
          if (value !== MASK) known++;
          const row = document.createElement('p'); row.className = 'bad-clue';
          row.append(text('span', label), text('strong', value)); card.append(row);
        }
        if (!known) card.append(text('p', '暂无线索', 'bad-empty'));
        fragment.append(card);
      }
    }
    root.replaceChildren(fragment);
  }
  $('bad-toggle').onclick = () => {
    const expanded = $('bad-slots').hidden;
    $('bad-slots').hidden = !expanded;
    $('bad-toggle').setAttribute('aria-expanded', String(expanded));
    $('bad-toggle-label').textContent = expanded ? '收起−' : '展开＋';
    renderBadPool();
  };
  renderBadPool();
  $('join-form').addEventListener('submit', e => {
    e.preventDefault();
    if ($('join-submit').dataset.mode === 'relogin') { redirectLogin(); return; }
    join($('nickname').value);
  });
  // CAS 退出：先撤销本进程会话，再回落到 CAS 注销地址。
  $('sso-logout').onclick = async () => {
    await api('/api/auth/logout', {}).catch(() => {});
    redirectLogout();
  };
  $('my-info').onclick = () => {
    if (mineOpen) { clearPrivate(true); return; }
    clearAllInput(); mineOpen = true; revealedFieldIds.clear();
    $('my-info').setAttribute('aria-expanded', 'true'); renderMine();
  };
  document.addEventListener('pointercancel', clearAllInput, true);
  const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
  // 跳跃 / 挥锤额外放行按钮与链接：空格要能正常激活焦点里的按钮，不被游戏劫持。
  const isActionTarget = () => /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement && document.activeElement.tagName) || !!(document.activeElement && document.activeElement.isContentEditable);
  // 同一条中文原因只弹一次，避免按住键时刷屏。
  const actionToast = { text: '' };
  async function sendAction(kind) {
    if (!me || finished) return;
    const r = await api('/api/action', { kind }).catch(() => ({ ok: false, status: 0 }));
    if (r.ok || r.auth === false) { actionToast.text = ''; return; }
    if (r.status !== 401 && r.status !== 0) return; // 冷却 / 空中 / 硬控 / 已结束：静默
    const msg = r.status === 401 ? '连接身份已失效，请重新加入。' : '网络暂时不稳定。';
    if (msg === actionToast.text) return;
    actionToast.text = msg;
    showToast(msg);
  }
  document.addEventListener('keydown', e => {
    if ($('rules-view').open || $('reset-confirm').open) return;
    if (e.key === 'Escape') {
      // 电梯选层面板可被 Esc 取消（未提交任何请求）。
      if (closeElevatorPicker()) { e.preventDefault(); return; }
      // 电梯 10 秒静态提示可被 Esc 关闭（只隐藏提示，不改变换层状态）；其余保持原语义。
      if (dismissFloorNotice()) { e.preventDefault(); return; }
      if (!$('finish-overlay').hidden) { hideFinish(); return; }
      if (wheelOpen) { closeWheel(); return; }
      if (!$('games').hidden) { e.preventDefault(); exitRps(); return; }
      clearAllInput(); $('candidates').hidden = true; $('candidates').replaceChildren(); return;
    }
    // 转盘 / 结算覆盖层打开时，忽略移动、E、J 等游戏内按键。
    if (wheelOpen || !$('finish-overlay').hidden || !$('games').hidden) return;
    // 电梯选层面板打开时：忽略移动 / E / J（先选楼层或 Esc 取消），数字键直达对应楼层。
    if (elevatorPicker) {
      if (/^[1-7]$/.test(e.key)) {
        e.preventDefault();
        const f = Number(e.key);
        if (f !== floorId) { const pid = elevatorPicker.portalId; closeElevatorPicker(); requestFloorChange(pid, f); }
      } else e.preventDefault();
      return;
    }
    // 电梯过渡进行中：忽略移动 / E / J，避免在换层中途驱动旧层或重复发起。
    if (floorState !== 'IDLE_SOURCE' && floorState !== 'IDLE_TARGET') return;
    if (isTyping()) return;
    // B：随时开关背包（画布正中弹出）。
    if (e.code === 'KeyB' && !e.repeat) {
      e.preventDefault();
      if (explorationPanel && explorationPanel.kind === 'backpack') { closeExploration(); return; }
      if (explorationPanel) closeExploration();
      if (LOOT && LOOT.isOpen()) LOOT.close();
      openExploration('backpack');
      return;
    }
    if (e.code === 'KeyE') {
      e.preventDefault(); if (e.repeat) return;
      // 物品格面板打开时，E 先收起面板（与其它私密面板一致）。
      if (LOOT && LOOT.isOpen()) { LOOT.close(); return; }
      if (explorationPanel) { closeExploration(); return; }
      // 需求①：房间内先判「走到门口离开」，房间外先判「门口进入」——
      // 门的优先级高于旁边的容器/NPC，避免站在门口按 E 却搜到了柜子。
      const exitRoom = roomExitCandidate();
      if (exitRoom) { leaveRoom(exitRoom.name); return; }
      if (!zoneId) {
        const door = roomDoorCandidate();
        if (door) { enterRoom(door.room.id, door.room.name); return; }
      }
      // 需求2：站在电梯门前并面向门时，E 优先乘梯（弹选层面板），不被旁边的玩家/NPC/容器抢走。
      const lift = elevatorTarget();
      if (lift) {
        if (lift.access.allowed) openElevatorPicker(lift.portal.id);
        else showToast(lift.access.reason);
        return;
      }
      const hit = nearestInteractable();
      if (hit) {
        if (hit.kind === 'player') select(hit.id);
        else if (hit.kind === 'door') { const r = WORLD.roomById(hit.id); if (r) enterRoom(r.id, r.name); }
        else if (hit.kind === 'exit') { const r = WORLD.roomById(hit.id); if (r) leaveRoom(r.name); }
        else if (hit.kind === 'container') openLootFor(explorationEntity('container', hit.id));
        else if (hit.kind === 'arcade') { if (SID.minigame) SID.minigame.open({ arcade: true }); }
        else openExploration(hit.kind, hit.id);
      } else showToast(zoneId ? '走到门口按 E 离开房间' : '请靠近角色、容器/NPC、房间门或电梯门（64 像素以内）');
      return;
    }
    // K 跳跃 / J 攻击（幽灵 J 吓人）：服务端权威，这里只提交意图。
    if (e.code === 'KeyK' || e.code === 'KeyJ') {
      e.preventDefault(); if (e.repeat || isActionTarget()) return;
      if (e.code === 'KeyK') sendAction('jump');
      else if (me && !me.alive) sendAction('scare');
      else attack();
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) {
      e.preventDefault(); if (interactionFlight || selfDisabled()) return;
      keys.add(e.code); sendIntent(false);
    }
  });
  document.addEventListener('keyup', e => {
    keys.delete(e.code); sendIntent(false);
  });
  window.addEventListener('blur', clearAllInput);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAllInput(); });
  document.addEventListener('focusin', () => { if (isTyping()) { keys.clear(); sendIntent(true); } });
  // 视口尺寸变化（含全屏切换、窗口缩放、旋转）重建 backing 与统一缩放，自适应而不裁剪或拉伸。
  window.addEventListener('resize', () => resizeCanvas());
  window.addEventListener('orientationchange', () => resizeCanvas());
  if (window.ResizeObserver) { try { new ResizeObserver(() => resizeCanvas()).observe($('map-view')); } catch { } }
  resizeCanvas();

  // Rules are a static reading view in this document, not a second game/SSE session.
  const rules = $('rules-view');
  let rulesReturnFocus = null;
  function closeRules() {
    if (!rules.open) return;
    rules.close(); $('rules-toggle').setAttribute('aria-expanded', 'false');
    (rulesReturnFocus && rulesReturnFocus.isConnected ? rulesReturnFocus : $('rules-toggle')).focus({ preventScroll: true });
  }
  $('rules-toggle').onclick = () => {
    rulesReturnFocus = document.activeElement;
    clearAllInput();
    $('offline-summary').hidden = true; $('offline-summary').replaceChildren();
    rules.showModal(); rules.scrollTop = 0;
    $('rules-toggle').setAttribute('aria-expanded', 'true');
    $('rules-close').focus({ preventScroll: true });
  };
  $('rules-close').onclick = closeRules;
  rules.addEventListener('cancel', e => { e.preventDefault(); closeRules(); });
  rules.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeRules(); }
    if (e.key === 'Tab') {
      const controls = [...rules.querySelectorAll('button, a[href], [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // ---------- 剪贴板：局域网非安全上下文必须手动回退 ----------
  async function copySID(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else {
        const focused = document.activeElement;
        const input = document.createElement('textarea'); input.value = text;
        input.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.append(input); input.select();
        const ok = document.execCommand('copy'); input.remove();
        if (focused && focused.isConnected) focused.focus({ preventScroll: true });
        if (!ok) throw new Error('copy unavailable');
      }
      showToast('已复制');
    } catch { showToast('复制失败，请允许剪贴板权限或手动复制'); }
  }
  const sidHTML = sid => `<span class="sid-copy" role="button" tabindex="0" aria-label="复制当前显示的S-ID" data-copy-sid>${escapeText(sid)}</span>`;
  // 只复制渲染出来的文本：公开掩码仍是掩码，不会读到任何隐藏段。
  document.addEventListener('pointerdown', e => {
    const item = e.target.closest && e.target.closest('[data-copy-sid]');
    if (item && e.button === 0) { e.preventDefault(); e.stopPropagation(); copySID(item.textContent); }
  });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-copy-sid]')) e.stopPropagation(); }, true);
  document.addEventListener('keydown', e => {
    const item = e.target.closest && e.target.closest('[data-copy-sid]');
    if (item && (e.key === 'Enter' || e.code === 'Space')) { e.preventDefault(); e.stopImmediatePropagation(); copySID(item.textContent); }
  }, true);

  boot();
})();
