'use strict';
// LAN playtest client. Pure presentation: it submits intents and renders snapshots.
// Position, skill resolution, public state, elimination and finish are all server-side.
// The furniture layout comes from /shared/world.js, the same file the server loads, so
// 家具绘制、深度、遮挡与服务端足迹碰撞共用同一份地图。
(() => {
  const $ = id => document.getElementById(id);
  const W = WORLD.WORLD_W, H = WORLD.WORLD_H, VW = WORLD.VIEW_W, VH = WORLD.VIEW_H;
  const MIN_X = WORLD.MIN_X, MAX_X = WORLD.MAX_X, MIN_Y = WORLD.MIN_Y, MAX_Y = WORLD.MAX_Y;
  const BODY_HALF = WORLD.BODY_HALF, FOOT_TOP = WORLD.FOOT_TOP, FOOT_BOTTOM = WORLD.FOOT_BOTTOM;
  const fieldNames = WORLD.FIELD_NAMES, traitNames = WORLD.TRAIT_NAMES, MASK = WORLD.MASK;
  const palettes = WORLD.PALETTES, zones = WORLD.ZONES;
  const furniture = WORLD.makeFurniture();
  const containers = furniture.filter(f => f.container);
  const furnitureSprites = new Map();
  const npcs = WORLD.NPCS.map((n, i) => ({ ...n, entityId: n.id, id: -i - 1,
    npc: true, alive: true, walk: 0, moving: false,
    colors: Object.fromEntries(Object.entries(palettes).map(([key, options], j) => [key, options[(i + j + 2) % options.length]])) }));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  // 互动、结束条件、计分与转盘全部读服务端共享配置（window.WORLD），客户端不新增硬编码数值。
  // world.js 尚未导出新契约时用等价兜底，避免旧版本直接抛错。
  const RULES = WORLD.RULES || { endRemainingPlayers: 100, timeLimitMs: 7200000 };
  const WHEEL = WORLD.WHEEL || { slotCount: 10, spinCosts: [0, 1, 2, 4, 6, 9, 12, 16, 20, 25, 30, 36, 42, 49, 56, 64], chipAmounts: [0, 1, 2, 3, 5, 8], specialCount: { good: 2, bad: 2 }, specials: { good: ['clue'], bad: ['reform', 'rebirth'] } };
  const WHEEL_ITEMS = WORLD.WHEEL_ITEMS || {
    clue: { key: 'clue', label: '线索券', desc: '获取一名坏人的一条线索', color: '#3B82F6', glyph: '?' },
    reform: { key: 'reform', label: '洗心革面券', desc: '将自己由坏人转换为好人', color: '#22C55E', glyph: '♻' },
    rebirth: { key: 'rebirth', label: '轮回券', desc: '重新随机自己的身份特征', color: '#EF4444', glyph: '↻' }
  };
  const WHEEL_CHIP_COLOR = WORLD.WHEEL_CHIP_COLOR || '#F59E0B';
  function wheelSpinCost(priorSpins) {
    if (typeof WORLD.wheelSpinCost === 'function') return WORLD.wheelSpinCost(priorSpins);
    const costs = WHEEL.spinCosts, i = Math.max(0, Math.min(costs.length - 1, priorSpins | 0));
    return costs[i];
  }
  // 预览用的服务端同构池；服务端 buildWheelPool 存在时优先使用。落点始终以服务端返回的 slots 为准。
  function buildWheelPool(faction) {
    if (typeof WORLD.buildWheelPool === 'function') return WORLD.buildWheelPool(faction);
    const key = faction === 'bad' ? 'bad' : 'good', slots = [];
    const specials = WHEEL.specials[key] || [], specialCount = WHEEL.specialCount[key] || 0;
    for (let i = 0; i < specialCount; i++) {
      const item = WHEEL_ITEMS[specials[i % specials.length]];
      if (item) slots.push({ kind: 'special', key: item.key, label: item.label, desc: item.desc, color: item.color, glyph: item.glyph });
    }
    for (let ci = 0; slots.length < WHEEL.slotCount; ci++) {
      const amount = WHEEL.chipAmounts[ci % WHEEL.chipAmounts.length];
      slots.push({ kind: 'chips', amount, label: String(amount), color: WHEEL_CHIP_COLOR, glyph: '●' });
    }
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
    return slots;
  }

  const canvas = $('office'), ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  // 离屏背景：静态场景烘焙一次，逐帧只做一次贴图，把预算留给角色与交互。
  // 背景按分区切成四张 960×640 贴图，逐帧只取当前视口覆盖的一到两张。
  const bgTiles = [0, 1, 2, 3].map(() => { const c = document.createElement('canvas'); c.width = VW; c.height = VH; return c; });
  const glowSprite = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,214,158,1)'); rg.addColorStop(1, 'rgba(255,180,110,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128); return c;
  })();
  const VIGNETTE = (() => {
    const c = document.createElement('canvas'); c.width = VW; c.height = VH;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(VW / 2, VH * .44, 190, VW / 2, VH * .48, 650);
    rg.addColorStop(0, 'rgba(255,216,152,.05)'); rg.addColorStop(.55, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(6,4,10,.42)');
    g.fillStyle = rg; g.fillRect(0, 0, VW, VH); return c;
  })();
  // 明暗派生：所有渐变色都由公开颜色计算，不引入新的身份线索。
  const shadeCache = new Map();
  function shade(hex, k) {
    const key = hex + '|' + k;
    let v = shadeCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    const t = k > 0 ? 255 : 8, a = Math.min(1, Math.abs(k));
    const ch = c => Math.round(c + (t - c) * a);
    const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
    v = '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
    shadeCache.set(key, v); return v;
  }
  // 肤色与发型只由「发色」这一公开属性推导，避免与阵营产生统计关联。
  const SKIN = ['#eabb94', '#d3a58a', '#c08e73', '#e8c3a3', '#cf9d7e'];

  // ---------- 权威状态（全部来自服务端快照） ----------
  let players = [], logs = [], me = null;
  let finished = false, aliveCount = 0, outCount = 0, serverTime = Date.now();
  let selectedId = null, cameraX = 0, clock = 0;
  let privateOpen = false, mineOpen = false, pending = null, privateResult = '';
  let sessionGeneration = 0, privateGeneration = 0, explorationGeneration = 0;
  let explorationPanel = null, explorationResult = '', interactionFlight = null;
  let explorationDataSig = '', nearbySig = '';
  const revealedFieldIds = new Set();
  let devCsrf = null, resetBusy = false;
  let sessionToken = null, stream = null, awaitingFirst = true, lastSkillTick = -1;
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
  let rulesInfo = null, finishReason = '', rankingList = null, finishShown = false, lastRankingSig = '', lastFinishSig = '';
  // serverTime 只在快照到达时更新；本地用单调时钟插值，避免计时与动画在快照间隙抖动/闪烁。
  function serverNow() { return serverTime + (performance.now() - serverPerfBase); }
  function selfDisabled() {
    if (!me || !me.combat) return false;
    const t = serverNow();
    return t < (me.combat.stunUntil || 0) || t < (me.combat.freezeUntil || 0);
  }

  function selfId() { return me ? me.id : -1; }
  function selfPlayer() { return players.find(p => p.id === selfId()) || null; }
  function escapeText(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function showToast(message) {
    const toast = $('copy-toast');
    clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false;
    toastTimer = setTimeout(() => { toast.hidden = true; toast.textContent = ''; }, 1800);
  }

  // ---------- 网络：意图上行 + SSE 快照下行 ----------
  function headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = sessionToken || localStorage.getItem('sid_session_token');
    if (token) h['X-Sid-Session'] = token;
    return h;
  }
  async function api(path, body, method) {
    const res = await fetch(path, { method: method || (body ? 'POST' : 'GET'), headers: headers(), body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    return { ...data, status: res.status };
  }
  // Insecure LAN contexts have no crypto.randomUUID, so the command id is random string based.
  const commandId = () => 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  function sendIntent(force) {
    const sig = ['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft', 'KeyS', 'ArrowDown', 'KeyD', 'ArrowRight'].map(c => keys.has(c) ? 1 : 0).join('');
    if (!force && sig === lastIntent) return;
    lastIntent = sig;
    api('/api/input', {
      up: keys.has('KeyW') || keys.has('ArrowUp'),
      down: keys.has('KeyS') || keys.has('ArrowDown'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight')
    }).catch(() => { });
  }
  function openStream() {
    const token = sessionToken || localStorage.getItem('sid_session_token');
    if (stream) { try { stream.close(); } catch { } }
    awaitingFirst = true;
    // EventSource cannot set headers, so the reconnect token rides in the query string.
    // It is the same random credential as the HttpOnly cookie; identity is never derived
    // from a nickname.
    stream = new EventSource(token ? `/api/stream?sid_token=${encodeURIComponent(token)}` : '/api/stream');
    const activeStream = stream, generation = sessionGeneration;
    stream.addEventListener('reset', () => { if (stream === activeStream) resetToJoin(); });
    stream.onmessage = event => {
      if (stream !== activeStream || generation !== sessionGeneration) return;
      try { applySnapshot(JSON.parse(event.data)); } catch { }
    };
    stream.onerror = () => { /* EventSource retries on its own with the advertised retry. */ };
  }
  async function join(nickname) {
    const r = await api('/api/join', { nickname: String(nickname || '').slice(0, 8) });
    if (r.status !== 200 || !r.ok) { $('join-error').textContent = r.error || '加入失败'; return; }
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
  async function boot() {
    sessionToken = localStorage.getItem('sid_session_token');
    const storedLan = localStorage.getItem('sid_lan');
    if (storedLan) $('lan-address').textContent = storedLan;
    const s = await api('/api/state', null, 'GET').catch(() => ({}));
    if (s && s.me && s.me.id !== undefined) { applySnapshot(s); $('join-page').hidden = true; openStream(); loadCapabilities(); }
    else { localStorage.removeItem('sid_session_token'); sessionToken = null; $('join-page').hidden = false; }
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
    serverTime = s.serverTime || Date.now();
    serverPerfBase = performance.now();
    finished = !!s.finished;
    if (s.rules) rulesInfo = s.rules;
    rankingList = Array.isArray(s.ranking) ? s.ranking : null;
    if (typeof s.finishReason === 'string') finishReason = s.finishReason;
    logs = s.logs || [];
    players = s.players || [];
    aliveCount = players.filter(p => p.alive).length;
    outCount = players.filter(p => !p.alive).length;
    if (s.me && s.me.id !== undefined) {
      // The first snapshot after (re)connecting carries everything queued while offline.
      if (awaitingFirst) { for (const e of (s.me.pending || [])) offlineEvents.add(e.eventId); awaitingFirst = false; }
      me = s.me;
      // Do not interrupt the already-running old round: render its two actual skills
      // with their correct effects until the host schedules a server restart.
      if (me.skills.action) me = { ...me, legacy: true, skills: me.faction === 'bad'
        ? { spy: me.skills.probe, kill: me.skills.action }
        : { probe: me.skills.probe, accuse: me.skills.action } };
    }
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
    if ($('logs').hidden) return;
    // 涉及自己的条目仅对自己高亮：不新增任何信息，只是把已有的公开条目标出来。
    $('log-items').innerHTML = logs.map(l => `<li${mine && l.text.includes(mine) ? ' class="log-mine"' : ''}><time>${l.time}</time><p>${escapeText(l.text).replace(/[A-Z0-9*]{3}-[A-Z0-9*]{3}-[A-Z0-9*]{3}/g, sidHTML)}</p></li>`).join('');
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
    if (clearMy) closeMine();
  }
  function clearAllInput() { keys.clear(); sendIntent(true); clearPrivate(true); closeExploration(); closeWheel(); }
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
    $('target').innerHTML = `<div class="panel-heading"><span class="eyebrow">PUBLIC PROFILE</span><button id="target-close" class="icon-button" aria-label="关闭目标档案">×</button></div><div class="target-person">${portrait(p)}<div><h2>${escapeText(p.name)}</h2><p class="sid">${sidHTML(p.sid)}</p><p class="status">${status}${p.id === selfId() ? ' · 自己' : ''}</p></div></div><div class="color-grid">${Object.entries(p.colors).map(([k, c]) => `<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${c[0]}</div>`).join('')}</div><div class="traits">${Object.entries(p.traits).map(([k, v]) => `<div class="trait"><span>${traitNames[k]}</span><strong>${escapeText(v)}</strong></div>`).join('')}</div>${p.id !== selfId() && p.alive ? `<div class="player-interactions"><button id="target-invite-rps" class="target-invite-rps" type="button"${isInviteable(p) ? '' : ' disabled'}>邀请猜拳</button><p id="target-rps-note" class="hold-note">${me?.games?.rpsPending ? '已有猜拳进行中，请先结束当前邀请或对战' : rpsNow() < (me?.games?.rpsUntil || 0) ? '猜拳冷却中，请稍后再试' : !isInviteable(p) ? '需靠近至 64 像素内、无遮挡且双方在线' : '发送邀请，对方同意后开始十秒猜拳'}</p>${me?.games?.rpsPending || me?.games?.rpsResult ? '<button id="target-return-rps" type="button">返回猜拳对战</button>' : ''}</div>` : ''}<button id="private-gate" class="private-gate" aria-expanded="${privateOpen}">${privateOpen ? '收起私密操作' : '展开私密操作'}</button><p class="hold-note">点击展开或收起 · 展开期间请注意周围视线 · 切出页面自动隐藏</p><div id="private-content"></div>`;
    $('target-close').onclick = () => { clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); };
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
    devCsrf = null; $('dev-reset').hidden = true; $('dev-management').hidden = true;
    const expectedSession = sessionToken;
    try {
      const cap = await api('/api/dev/capabilities', null, 'GET');
      if (expectedSession !== sessionToken || !me) return;
      if (cap.status === 200 && cap.canReset === true && typeof cap.csrfToken === 'string' && cap.csrfToken) {
        devCsrf = cap.csrfToken; $('dev-reset').hidden = false; $('dev-management').hidden = false;
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
    renderMap.clear(); offlineEvents.clear(); lastRosterSig = lastTargetSig = lastLogSig = '';
    $('target').replaceChildren(); $('target').hidden = true;
    $('candidates').replaceChildren(); $('candidates').hidden = true;
    $('offline-summary').replaceChildren(); $('offline-summary').hidden = true;
    $('dev-reset').hidden = true; $('dev-management').hidden = true; closeResetDialog(false);
    if ($('rules-view').open) closeRules();
    renderPublic(); renderRoster(); renderLogs(); updateOfflineUI(); updateExplorationHUD();
    syncGames(); updateCombatHUD(); updateScoreDisplay(); syncTimeLeft();
    $('join-page').hidden = false; $('join-error').textContent = '本局已重置，请主动加入新局。';
    $('nickname').value = ''; $('nickname').focus({ preventScroll: true });
  }
  const resetDialog = $('reset-confirm');
  function closeResetDialog(returnFocus = true) {
    if (!resetDialog.open) return;
    resetDialog.close();
    if (returnFocus && !$('dev-reset').hidden) $('dev-reset').focus({ preventScroll: true });
  }
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
    return [...containers.map(entity => ({ kind: 'container', id: entity.id, entity })),
      ...npcs.map(entity => ({ kind: 'npc', id: entity.entityId, entity }))]
      .filter(({ entity }) => entityDistance(entity) <= WORLD.INTERACT_RANGE)
      .sort((a, b) => entityDistance(a.entity) - entityDistance(b.entity));
  }
  // E 就近互动：同时比较附近玩家与家具/NPC，取距离最近者；已选中的近玩家在距离相当时优先。
  function nearestInteractable() {
    const self = selfPlayer(); if (!self || !me?.alive || finished) return null;
    let pBest = null, pD = Infinity;
    for (const p of players) {
      if (p.id === me.id || !p.alive || p.online === false) continue;
      if (!WORLD.lineClear(self, p, furniture)) continue;
      const d = WORLD.distanceToEntity(self, p);
      if (d <= WORLD.INTERACT_RANGE && d < pD) { pD = d; pBest = { kind: 'player', id: p.id }; }
    }
    let eBest = null, eD = Infinity;
    for (const item of nearbyEntities()) {
      const d = entityDistance(item.entity);
      if (d < eD) { eD = d; eBest = { kind: item.kind, id: item.id }; }
    }
    // 已选近玩家优先：与家具/NPC 距离相差不超过 32 像素时，保留/选择玩家。
    if (pBest && (!eBest || pD <= eD + 32)) return pBest;
    return eBest;
  }
  function closeExploration() {
    explorationGeneration++; explorationPanel = null; explorationResult = ''; explorationDataSig = '';
    $('exploration').replaceChildren(); $('exploration').hidden = true;
    $('clue-bag').setAttribute('aria-expanded', 'false');
  }
  function openExploration(kind, id = null) {
    if (!me || (kind !== 'backpack' && !explorationEntity(kind, id))) return;
    clearAllInput(); selectedId = null; lastTargetSig = '';
    $('candidates').hidden = true; $('candidates').replaceChildren(); renderTarget(); renderRoster();
    explorationPanel = { kind, entityId: id };
    const entity = explorationEntity(kind, id), host = $('exploration');
    host.hidden = false; $('clue-bag').setAttribute('aria-expanded', String(kind === 'backpack'));
    const heading = kind === 'backpack' ? '线索背包' : kind === 'container' ? entity.container.name : entity.name;
    // 控件每次打开只建立一次；20Hz 快照只更新稳定的值槽。
    host.innerHTML = `<div class="panel-heading"><div><small>PRIVATE EXPLORATION</small><h2>${escapeText(heading)}</h2></div><button id="exploration-close" class="icon-button" aria-label="关闭私密探索">×</button></div><div class="exploration-body"><p class="exploration-balance">我的筹码：<strong id="exploration-chips"></strong></p>${kind === 'backpack'
      ? '<p id="exploration-clue-count" class="panel-note"></p><div id="exploration-clues" class="clue-list"></div>'
      : `<p id="exploration-distance" class="panel-note"></p><p id="exploration-state" class="search-state"></p>${kind === 'npc' ? `<p class="npc-dialogue">${escapeText(entity.dialogue)}</p><div class="wheel-block"><p class="private-title">大转盘</p><p class="panel-note">10 格等概率 · 首次免费，之后按次数阶梯收费</p><button id="exploration-wheel" type="button">打开大转盘</button><p id="exploration-wheel-state" class="search-state"></p></div>` : ''}<p class="panel-note">${kind === 'container' ? '每名玩家每个容器限搜一次，奖励由服务端结算。' : `每次 ${entity.cost} 筹码兑换一条尚未拥有的真实隐藏属性线索；无新线索不扣筹码。`}</p><button id="exploration-action">${kind === 'container' ? '搜寻容器' : `确认支付 ${entity.cost} 筹码兑换线索`}</button>`}<p id="exploration-result" class="private-result" hidden></p><p class="hold-note">仅自己可见 · 关闭、Esc、切出页面、选择玩家、规则或重置立即销毁显示，不回滚已结算奖励。</p></div>`;
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
      const stopped = await api('/api/input', { up: false, down: false, left: false, right: false });
      if (!samePanel()) return;
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('停止意图未确认');
      const result = await api('/api/interact', { commandId: commandId(), kind: kind === 'container' ? 'search' : 'exchange', entityId });
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
      const stopped = await api('/api/input', { up: false, down: false, left: false, right: false });
      if (!samePanel()) return;
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('停止意图未确认');
      const result = await api('/api/play', { commandId: commandId(), kind: 'wheel', entityId });
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
  function syncRanking() {
    const host = $('ranking'); if (!host || host.hidden) return;
    updateRankingHeader();
    const sorted = players.slice().sort((a, b) => (b.score || 0) - (a.score || 0));
    const sig = JSON.stringify([finishReason, aliveCount, players.map(p => [p.id, p.name, p.score || 0, p.alive]), rankingList]);
    if (sig === lastRankingSig) return;
    lastRankingSig = sig;
    $('ranking-alive').textContent = aliveCount;
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
    $('cover-status').textContent = self ? (WORLD.coverFor(renderedSelf || self, furniture) ? '身体已遮挡 · 不免疫技能' : '无遮挡') : '尚未加入';
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
          button.textContent = item.kind === 'container' ? item.entity.container.name : `${item.entity.name} · NPC / ${item.entity.cost} 筹码`;
          button.onclick = () => openExploration(item.kind, item.id); host.append(button);
        }
      }
      for (const button of host.children) button.hidden = !nearby.some(item => item.id === button.dataset.entity);
    }
    $('nearby-empty').hidden = nearby.length > 0;
    $('nearby-empty').textContent = !me ? '加入后靠近容器或 NPC' : finished ? '游戏已结束，探索已冻结' : !me.alive ? '已淘汰，无法探索' : '靠近容器或 NPC，按 E 互动（64 像素）';
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
    const response = await fetch('/api/play', { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.timeout(4000) });
    let data = {}; try { data = await response.json(); } catch { }
    return { ...data, status: response.status };
  }
  function isInviteable(p) {
    if (!p || !me || !me.alive || finished || p.id === me.id || !p.alive || p.online === false) return false;
    const self = selfPlayer(); if (!self) return false;
    return WORLD.distanceToEntity(self, p) <= WORLD.INTERACT_RANGE && WORLD.lineClear(self, p, furniture)
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
    combatFlight = request; keys.clear(); lastIntent = '';
    updateCombatHUD();
    try {
      const stopped = await api('/api/input', { up: false, down: false, left: false, right: false });
      if (!same()) return;
      if (stopped.status !== 200 || stopped.ok !== true) throw new Error('停止意图未确认');
      const result = await api('/api/attack', { commandId: commandId() });
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
    const offlineCount = list.filter(e => offlineEvents.has(e.eventId)).length;
    if (!list.length) { banner.hidden = true; banner.textContent = ''; return; }
    banner.hidden = false;
    banner.textContent = offlineCount
      ? `离线期间有 ${offlineCount} 条涉及你的事件 · 点击查看详情`
      : `有 ${list.length} 条涉及你的事件 · 点击查看详情`;
    banner.onclick = () => renderSummary(offlineCount);
  }
  function renderSummary(offlineCount) {
    const list = pendingList();
    const panel = $('offline-summary');
    panel.hidden = false;
    panel.innerHTML = `<div class="panel-heading"><div><small>PRIVATE DIGEST</small><h2>${offlineCount ? '离线期间事件' : '涉及你的事件'}</h2></div><button id="summary-close" class="icon-button" aria-label="关闭事件摘要">×</button></div><ul class="summary-list">${list.map(e => `<li><time>${new Date(e.occurredAt).toLocaleTimeString('zh-CN', { hour12: false })}</time><p>${escapeText(e.text)}</p></li>`).join('')}</ul><p class="hold-note">摘要只说明你身上发生了什么，不含操作者。关闭后不再重复提示。</p>`;
    $('summary-close').onclick = () => { panel.hidden = true; panel.replaceChildren(); acknowledge(list); };
  }
  function acknowledge(list) {
    const ids = list.map(e => e.eventId);
    if (!ids.length) return;
    const known = new Set(ids);
    for (const id of known) offlineEvents.delete(id);
    if (me) me.pending = pendingList().filter(e => !known.has(e.eventId));
    updateOfflineUI();
    api('/api/ack', { eventIds: ids }).catch(() => { });
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
  function drawFurniture(f, g = ctx) {
    const { x, y, w, h, type } = f;
    g.globalAlpha = .2; rect(x + 8, y + h - 6, w - 12, 11, '#120c14', g); rect(x + 3, y + h - 3, w - 6, 6, '#120c14', g); g.globalAlpha = 1;
    if (type === 'plant') {
      const px = x + w * .28, pw = Math.round(w * .46);
      rect(x + w * .49, y + h * .26, 4, h * .3, '#3f7a52', g);
      blob(g, x + w * .02, y + h * .04, w * .5, h * .46, '#3f7a52', g);
      blob(g, x + w * .46, y + h * .0, w * .46, h * .48, '#4a8a5d', g);
      blob(g, x + w * .14, y + h * .24, w * .4, h * .34, '#2f6242', g);
      blob(g, x + w * .44, y + h * .26, w * .44, h * .32, '#58996a', g);
      rect(x + w * .12, y + h * .1, w * .14, 2, '#7fbb8c', g); rect(x + w * .6, y + h * .06, w * .12, 2, '#7fbb8c', g);
      rect(px, y + h * .52, pw, Math.round(h * .46), '#8a4f33', g);
      rect(px + 1, y + h * .52, pw - 2, 4, '#b0714a', g);
      rect(px, y + h * .58, pw, Math.round(h * .36), '#7a452c', g);
      rect(px + 3, y + h * .92, pw - 6, 4, '#5f3623', g);
      rect(px + 3, y + h * .52, pw - 6, 3, '#3a2a22', g);
      return;
    }
    if (type === 'sofa') {
      rect(x + 4, y, w - 8, 24, '#4b6b70', g); rect(x + 4, y, w - 8, 3, '#62868b', g); rect(x + 4, y + 21, w - 8, 3, '#2c4549', g);
      rect(x, y + 20, w, h - 28, '#415f63', g); rect(x, y + 20, w, 3, '#6b9095', g); rect(x, y + h - 6, w, 3, '#25393c', g);
      const cw = Math.max(6, Math.round((w - 26) / 2));
      rect(x + 9, y + 24, cw, h - 38, '#4b6d71', g); rect(x + 9, y + 24, cw, 2, '#62868b', g);
      rect(x + 17 + cw, y + 24, cw, h - 38, '#4b6d71', g); rect(x + 17 + cw, y + 24, cw, 2, '#62868b', g);
      rect(x + w / 2 - 1, y + 25, 2, h - 40, '#2c4549', g);
      rect(x, y + 14, 15, h - 20, '#55797d', g); rect(x, y + 14, 15, 3, '#7ba0a4', g); rect(x + 13, y + 16, 2, h - 24, '#2c4549', g);
      rect(x + w - 15, y + 14, 15, h - 20, '#55797d', g); rect(x + w - 15, y + 14, 15, 3, '#7ba0a4', g); rect(x + w - 15, y + 16, 2, h - 24, '#2c4549', g);
      rect(x + 22, y + 25, 20, 13, '#a4665c', g); rect(x + 22, y + 25, 20, 2, '#c4837a', g); rect(x + 22, y + 36, 20, 2, '#7d4a44', g);
      rect(x + 7, y + h - 5, 9, 6, '#4a3524', g); rect(x + w - 16, y + h - 5, 9, 6, '#4a3524', g);
      return;
    }
    if (type === 'cabinet') {
      rect(x, y, w, h, '#4e3c2c', g); rect(x + 2, y + 2, w - 4, h - 4, '#6b543c', g); rect(x + 2, y + 2, w - 4, 3, '#8a6e52', g); rect(x + 2, y + h - 4, w - 4, 3, '#3d2f22', g);
      rect(x + w / 2 - 1, y + 5, 2, h - 10, '#3d2f22', g);
      rect(x + 7, y + 10, w / 2 - 11, h - 22, '#7a6247', g); rect(x + 7, y + 10, w / 2 - 11, 2, '#93744a', g);
      rect(x + w / 2 + 4, y + 10, w / 2 - 11, h - 22, '#7a6247', g); rect(x + w / 2 + 4, y + 10, w / 2 - 11, 2, '#93744a', g);
      rect(x + w / 2 - 9, y + h / 2 - 3, 3, 11, '#c8a86a', g); rect(x + w / 2 + 6, y + h / 2 - 3, 3, 11, '#c8a86a', g);
      rect(x + 8, y - 11, 22, 12, '#8a5a4a', g); rect(x + 10, y - 9, 18, 2, '#a97262', g); rect(x + 10, y - 11, 6, 2, '#b98272', g);
      rect(x + 34, y - 9, 16, 10, '#4f6b74', g); rect(x + 34, y - 9, 16, 2, '#64868f', g);
      rect(x + 54, y - 7, 12, 8, '#6b7f5c', g); rect(x + 54, y - 7, 12, 2, '#87a078', g);
      return;
    }
    if (type === 'desk') {
      rect(x + 6, y + 30, 7, h - 30, '#4a3524', g); rect(x + w - 13, y + 30, 7, h - 30, '#4a3524', g);
      rect(x + 4, y + 22, w - 8, h - 22, '#5a4231', g); rect(x + 4, y + 22, w - 8, 3, '#8a6a48', g); rect(x + 4, y + h - 5, w - 8, 5, '#3f2f22', g);
      rect(x - 5, y + 8, w + 10, 16, '#7d5c3f', g); rect(x - 5, y + 8, w + 10, 3, '#a5825b', g); rect(x - 5, y + 21, w + 10, 3, '#543f2d', g);
      rect(x + 10, y + 29, w - 66, h - 37, '#523c2d', g); rect(x + 10, y + 29, w - 66, 1, '#634b38', g); rect(x + 10, y + h - 11, w - 66, 2, '#3f2f22', g);
      rect(x + w - 49, y + 33, 43, 17, '#6b5238', g); rect(x + w - 47, y + 35, 39, 2, '#8f7050', g); rect(x + w - 31, y + 39, 14, 3, '#c8a86a', g);
      rect(x + 37, y - 31, 58, 36, '#2b2f38', g); rect(x + 39, y - 29, 54, 30, '#182f38', g); rect(x + 39, y - 29, 54, 2, '#0d1e25', g);
      rect(x + 42, y - 26, 48, 3, '#63c7c4', g); rect(x + 42, y - 20, 32, 2, '#4f9d9c', g); rect(x + 42, y - 15, 40, 2, '#4f9d9c', g); rect(x + 42, y - 10, 24, 2, '#4f9d9c', g);
      rect(x + 58, y + 3, 12, 6, '#39414a', g); rect(x + 50, y + 8, 28, 4, '#4a5058', g);
      rect(x + 40, y + 13, 40, 6, '#d5cfbe', g); rect(x + 42, y + 15, 36, 1, '#8f8a7e', g); rect(x + 40, y + 18, 40, 1, '#a49e8e', g);
      rect(x + w - 27, y + 11, 10, 9, '#c96f4e', g); rect(x + w - 27, y + 11, 10, 2, '#e08a6a', g); rect(x + w - 17, y + 13, 3, 4, '#c96f4e', g);
      rect(x + 6, y + 12, 22, 7, '#e6dfcd', g); rect(x + 8, y + 14, 18, 1, '#b9b3a2', g); rect(x + 8, y + 16, 14, 1, '#b9b3a2', g);
      return;
    }
    if (type === 'counter') {
      rect(x + 4, y + 24, w - 8, h - 24, '#48524f', g); rect(x + 4, y + 24, w - 8, 3, '#5f6b66', g); rect(x + 4, y + h - 5, w - 8, 5, '#2f3937', g);
      for (let i = 1; i < 4; i++) {
        const px = x + i * (w / 4);
        rect(px, y + 28, 1, h - 30, '#333d3b', g);
        rect(px + 6, y + 32, w / 4 - 12, h - 42, '#525d59', g);
        rect(px + 6, y + 32, w / 4 - 12, 1, '#606c67', g); rect(px + 6, y + h - 12, w / 4 - 12, 2, '#3c4644', g);
      }
      rect(x - 5, y + 8, w + 10, 17, '#cfc7bb', g); rect(x - 5, y + 8, w + 10, 3, '#e8e2d6', g); rect(x - 5, y + 22, w + 10, 3, '#9a9184', g);
      rect(x + 16, y - 26, 40, 34, '#39414a', g); rect(x + 18, y - 24, 36, 10, '#1e2a30', g); rect(x + 22, y - 20, 10, 3, '#d9814f', g);
      rect(x + 18, y - 12, 36, 4, '#2b323a', g); rect(x + 28, y - 8, 14, 6, '#c9c4b4', g);
      rect(x + 92, y - 16, 24, 24, '#8d929a', g); rect(x + 94, y - 14, 20, 3, '#a9aeb6', g); rect(x + 112, y - 21, 4, 6, '#5f646b', g); rect(x + 98, y - 23, 10, 7, '#5f646b', g);
      for (let i = 0; i < 4; i++) { const cx = x + 140 + i * 24; rect(cx, y + 11, 9, 9, '#dfe6e6', g); rect(cx, y + 11, 9, 2, '#f2f7f7', g); rect(cx, y + 18, 9, 2, '#9aa4a4', g); }
      rect(x + 206, y + 13, 26, 6, '#b58a5c', g); rect(x + 208, y + 8, 7, 7, '#c96f4e', g); rect(x + 217, y + 9, 7, 6, '#8a9a5c', g); rect(x + 224, y + 10, 6, 5, '#d9b45c', g);
      return;
    }
    if (type === 'table') {
      rect(x + 8, y + 24, 7, h - 24, '#4a3524', g); rect(x + w - 15, y + 24, 7, h - 24, '#4a3524', g);
      rect(x - 6, y + 8, w + 12, 17, '#7d5c3f', g); rect(x - 6, y + 8, w + 12, 3, '#a5825b', g); rect(x - 6, y + 22, w + 12, 3, '#543f2d', g);
      rect(x + 16, y - 12, 34, 20, '#39414a', g); rect(x + 18, y - 10, 30, 15, '#182f38', g); rect(x + 20, y - 8, 20, 2, '#63c7c4', g); rect(x + 20, y - 4, 24, 2, '#4f9d9c', g);
      rect(x + 12, y + 8, 42, 5, '#4a5058', g); rect(x + 14, y + 9, 38, 1, '#6a7078', g);
      rect(x + 64, y + 12, 24, 7, '#e6dfcd', g); rect(x + 66, y + 14, 20, 1, '#b9b3a2', g); rect(x + 66, y + 16, 14, 1, '#b9b3a2', g);
      rect(x + 96, y + 11, 10, 9, '#d9814f', g); rect(x + 96, y + 11, 10, 2, '#e8a173', g);
      return;
    }
    if (type === 'reception') {
      rect(x + 4, y + 18, w - 8, h - 18, '#5a4231', g); rect(x + 4, y + 18, w - 8, 3, '#8a6a48', g); rect(x + 4, y + h - 5, w - 8, 5, '#3f2f22', g);
      for (let i = 1; i < 3; i++) rect(x + i * (w / 3), y + 22, 1, h - 24, '#46341f', g);
      rect(x - 5, y + 6, w + 10, 13, '#cfc7bb', g); rect(x - 5, y + 6, w + 10, 3, '#e8e2d6', g); rect(x - 5, y + 16, w + 10, 3, '#9a9184', g);
      rect(x + 6, y + 23, w - 12, 2, '#c8a86a', g);
      rect(x + 12, y - 20, 42, 26, '#2b2f38', g); rect(x + 14, y - 18, 38, 20, '#182f38', g); rect(x + 16, y - 16, 30, 3, '#63c7c4', g); rect(x + 16, y - 11, 22, 2, '#4f9d9c', g);
      rect(x + 26, y + 6, 12, 6, '#39414a', g); rect(x + 20, y + 11, 24, 4, '#4a5058', g);
      rect(x + w - 34, y - 6, 16, 12, '#8a5a4a', g); rect(x + w - 32, y - 4, 12, 2, '#a97262', g);
      rect(x + w - 28, y - 19, 3, 14, '#3f7a52', g); rect(x + w - 32, y - 25, 8, 6, '#c96f4e', g); rect(x + w - 24, y - 21, 6, 5, '#e08a6a', g);
      return;
    }
    rect(x, y, w, h, '#5a4231', g); rect(x, y, w, 3, '#8a6a48', g); rect(x, y + h - 4, w, 4, '#3f2f22', g);
    rect(x + 6, y + h, 9, 6, '#4a3524', g); rect(x + w - 15, y + h, 9, 6, '#4a3524', g);
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
  function buildBackground() {
    const spots = [];
    for (let z = 0; z < 4; z++) {
      const base = z * 960;
      for (let j = 0; j < 4; j++) spots.push({ x: base + 58 + j * 227 + 71, y: 110, r: 152, a: .15 });
      spots.push({ x: base + 242, y: 21, r: 46, a: .5 }, { x: base + 696, y: 21, r: 46, a: .5 });
      spots.push({ x: base + 242, y: 175, r: 196, a: .14 }, { x: base + 696, y: 175, r: 196, a: .14 }, { x: base + 480, y: 182, r: 214, a: .16 });
    }
    for (let z = 0; z < 4; z++) {
      const base = z * 960, g = bgTiles[z].getContext('2d');
      g.imageSmoothingEnabled = false;
      g.save(); g.translate(-base, 0);
      g.fillStyle = '#2b2333'; g.fillRect(base, 0, VW, VH);
      const wall = g.createLinearGradient(0, 0, 0, 86);
      wall.addColorStop(0, '#453a4e'); wall.addColorStop(1, '#332b3e');
      g.fillStyle = wall; g.fillRect(base, 0, VW, 86);
      for (let x = base; x < base + VW; x += 96) rect(x, 0, 1, 86, '#2b2334', g);
      rect(base, 24, VW, 1, '#4b3d4b', g);
      rect(base, 86, VW, 20, '#3a3145', g); rect(base, 86, VW, 2, '#514461', g);
      for (let x = base; x < base + VW; x += 48) rect(x, 90, 1, 14, '#332b3e', g);
      rect(base, 106, VW, 12, '#1f1a28', g); rect(base, 106, VW, 1, '#443a4e', g);
      const planks = ['#54402f', '#4a3727', '#5b462f', '#453324', '#4f3c2c'];
      g.fillStyle = '#4a3727'; g.fillRect(base, 118, VW, VH - 118);
      for (let y = 118; y < VH; y += 16) {
        const row = ((y - 118) / 16) | 0, stag = (row % 2) ? 32 : 0;
        for (let x = base - 64 + stag; x < base + VW; x += 64) {
          const k = Math.abs(row * 31 + Math.round(x / 64) * 17 + 97);
          rect(x, y, 64, 16, planks[k % 5], g);
          if (k % 7 === 0) rect(x + 9, y + 6, 18, 1, '#3c2c20', g);
          else if (k % 5 === 0) rect(x + 31, y + 10, 11, 1, '#3c2c20', g);
          if (k % 2) rect(x, y, 1, 16, '#3d2d20', g);
        }
        rect(base, y, VW, 1, '#5e4936', g);
        rect(base, y + 15, VW, 1, '#33251b', g);
      }
      if (z) rect(base, 112, 4, VH - 112, '#2c211b', g);
      for (let j = 0; j < 4; j++) drawWindow(g, base + 58 + j * 227, 13, 142, 51);
      drawFrame(g, base + 12, 30, 42, 34);
      drawClock(g, base + 571, 32, 24);
      drawLamp(g, base + 242); drawLamp(g, base + 696);
      drawRug(g, base + 200, 328, 560, 140);
      drawSign(g, base + 380, 68, 200, 28, `0${z + 1}  /  ${zones[z]}`);
      for (const s of spots) if (Math.abs(s.x - base - VW / 2) < 1200) glow(g, s.x, s.y, s.r, s.a);
      g.restore();
    }
  }
  buildBackground();
  for (const f of furniture) {
    const c = document.createElement('canvas'); c.width = f.w + 24; c.height = f.h + 60;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    drawFurniture({ ...f, x: 12, y: 40 }, g); furnitureSprites.set(f.id, c);
  }

  // 角色：统一描边 + 三层明暗 + 五官 + 发型 + 行走摆动。
  // 离线者只在渲染层降低不透明度，四种颜色外观数据一律不改。
  function sprite(p) {
    const x = Math.round(p.x), meId = selfId();
    const ph = p.walk * .13;
    const bob = p.moving ? -Math.round(Math.abs(Math.sin(ph)) * 2) : Math.round(Math.sin(clock * 1.5 + p.id * 1.9) * .7);
    const yb = Math.round(p.y) + bob;
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    const now = serverNow(), attackAge = p.lastAttackAt ? now - p.lastAttackAt : null;
    WORLD.drawCharacterBody(ctx, p, clock, attackAge, p.lastAttackDirection);
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
    // 被家具遮挡时（含自己）隐藏脚下指示与选中框，避免把位置信息透出去。
    const covered = !!WORLD.coverFor(p, furniture);
    if (!p.npc && p.id === meId && p.id !== selectedId && !covered) {
      ctx.globalAlpha = .8 * a; ctx.strokeStyle = '#7cc4ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, p.y + 5, 13, 4, 0, 0, Math.PI * 2); ctx.stroke();
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
  }
  // 命中框（x±21, y-53~y+8）与名牌偏移保持不变，外观升级不影响任何交互判定。
  let labels = [];
  function drawList() {
    return [...players.filter(p => p.alive).map(p => {
      const r = renderMap.get(p.id) || { x: p.x, y: p.y, walk: 0, moving: false };
      return { ...p, x: r.x, y: r.y, walk: r.walk, moving: r.moving, spriteFacing: p.spriteFacing || 'front' };
    }), ...npcs];
  }
  function makeLabels(list) {
    // 任何被家具遮挡的角色（含自己与 NPC）都不生成名牌；解除遮挡同一帧恢复。
    labels = list.filter(p => p.x >= cameraX - 130 && p.x <= cameraX + VW + 130 &&
      !WORLD.coverFor(p, furniture))
      .map(p => ({ x: p.x - 72, y: p.y + 12, w: 144, h: 31, ids: p.npc ? [] : [p.id], p }));
  }
  function draw() {
    const sc = Math.round(cameraX), tile = Math.floor(sc / VW), off = sc - tile * VW;
    if (off === 0) ctx.drawImage(bgTiles[tile], 0, 0);
    else {
      ctx.drawImage(bgTiles[tile], off, 0, VW - off, VH, 0, 0, VW - off, VH);
      ctx.drawImage(bgTiles[Math.min(3, tile + 1)], 0, 0, off, VH, VW - off, 0, off, VH);
    }
    ctx.drawImage(VIGNETTE, 0, 0);
    ctx.save(); ctx.translate(-Math.round(cameraX), 0);
    const list = drawList();
    const scene = [
      ...furniture.filter(f => f.x + f.w + 12 > cameraX && f.x - 12 < cameraX + VW).map(f => ({ depth: f.depth, f })),
      ...list.filter(p => p.x > cameraX - 40 && p.x < cameraX + VW + 40).map(p => ({ depth: p.y, p }))
    ].sort((a, b) => a.depth - b.depth || Number(!!b.f) - Number(!!a.f));
    for (const item of scene) {
      if (item.f) {
        const f = item.f;
        ctx.drawImage(furnitureSprites.get(f.id), f.x - 12, f.y - 40);
        // 紧跟家具 sprite 之后画描边：深度更大的家具后画时会自然盖住描边，不穿透遮挡。
        if (f.container) drawOutline(f.x, f.y, f.w, f.h, interactTier('container', f.id), '#7fe3ff');
      } else {
        sprite(item.p);
        // NPC 描边对准命中框 x±21, y-53..y+8。
        if (item.p.npc) drawOutline(item.p.x - 21, item.p.y - 53, 42, 61, interactTier('npc', item.p.entityId), '#ffd76a');
      }
    }
    makeLabels(list);
    ctx.textAlign = 'center';
    const meId = selfId();
    for (const l of labels.slice().sort((a, b) => Number(a.p.id === selectedId || a.p.id === meId) - Number(b.p.id === selectedId || b.p.id === meId))) {
      const active = l.ids.includes(selectedId);
      const accent = l.p.npc ? '#e9c877' : active ? '#7cc4ff' : (l.p.alive ? '#78c39b' : '#7c8698');
      roundPx(l.x + 2, l.y + 3, l.w, l.h, '#080b12a0');
      roundPx(l.x - 1, l.y - 1, l.w + 2, l.h + 2, active ? '#4f88c4' : '#2f425c');
      roundPx(l.x, l.y, l.w, l.h, active ? '#14304f' : '#0f1826f2');
      rect(l.x + 8, l.y + 1, l.w - 16, 1, '#ffffff1f');
      rect(l.x + 1, l.y + 5, 2, l.h - 10, accent);
      ctx.font = '12px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.fillStyle = active ? '#eaf4ff' : '#e2e8f0';
      ctx.fillText(l.p.name + (l.p.npc ? ' · NPC' : l.p.id === meId ? ' · 自己' : l.p.online === false ? ' · 离线' : ''), l.x + l.w / 2, l.y + 13);
      ctx.font = '10px ui-monospace,SFMono-Regular,monospace';
      ctx.fillStyle = active ? '#a8cbe8' : '#96adc8';
      ctx.fillText(l.p.npc ? `${l.p.cost} 筹码 / 私密线索兑换` : l.p.sid, l.x + l.w / 2, l.y + 26);
    }
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
    if (self) cameraX = clamp(self.x - VW / 2, 0, W - VW);
    const zoneIndex = Math.min(3, Math.floor((self ? self.x : 0) / 960));
    $('zone-name').textContent = zones[zoneIndex];
    $('coordinate').textContent = `0${Math.min(4, zoneIndex + 1)} / 04`;
    const tick = Math.floor(serverTime / 1000);
    if (tick !== lastSkillTick) {
      lastSkillTick = tick;
      if (holding()) updateSkillStatus();
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
    const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / VW, r.height / VH);
    const ox = (r.width - VW * scale) / 2, oy = (r.height - VH * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale + cameraX, y: (e.clientY - r.top - oy) / scale };
  }
  function showCandidates(ids) {
    closeExploration(); clearPrivate(true); closeWheel();
    const list = [...new Set(ids)].filter(id => players.some(p => p.id === id && p.alive)).sort((a, b) => a - b);
    $('candidates').hidden = false;
    $('candidates').innerHTML = `<div class="panel-heading"><div><small>OVERLAPPING PLAYERS</small><h2>请选择目标</h2></div><button id="candidate-close" class="icon-button" aria-label="关闭重叠候选">×</button></div><p>同一点击点有${list.length}位玩家，不会自动选人。</p>${list.map(id => row(players.find(p => p.id === id))).join('')}`;
    bindRows($('candidates'));
    $('candidate-close').onclick = () => { $('candidates').hidden = true; $('candidates').replaceChildren(); };
  }
  canvas.addEventListener('click', e => {
    const { x, y } = canvasPoint(e);
    const list = drawList();
    makeLabels(list);
    const atLabel = l => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h && !WORLD.pointOccluded(x, y, l.p, furniture);
    const atBody = p => Math.abs(x - p.x) <= 21 && y >= p.y - 53 && y <= p.y + 8 && !WORLD.pointOccluded(x, y, p, furniture);
    const labelHits = labels.filter(l => !l.p.npc && atLabel(l));
    const bodyHits = list.filter(p => !p.npc && atBody(p)).map(p => p.id);
    const hits = [...new Set([...labelHits.flatMap(l => l.ids), ...bodyHits])];
    if (hits.length > 1) showCandidates(hits);
    else if (hits.length === 1) {
      const label = labelHits.find(l => l.ids.includes(hits[0]));
      if (label && y >= label.y + 15) copySID(label.p.sid);
      else select(hits[0]);
    } else {
      const npc = npcs.filter(p => atBody(p) || labels.some(l => l.p.id === p.id && atLabel(l))).sort((a, b) => b.y - a.y)[0];
      // 只点击最前面的家具，不能隔着另一件家具搜寻容器。
      const front = furniture.filter(f => x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h).sort((a, b) => b.depth - a.depth)[0];
      if (npc || front?.container) openExploration(npc ? 'npc' : 'container', npc ? npc.entityId : front.id);
      else { closeExploration(); clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); }
    }
    canvas.focus();
  });
  function toggle(panel, button) {
    const visible = $(panel).hidden;
    $(panel).hidden = !visible;
    $(button).setAttribute('aria-expanded', String(visible));
    if (panel === 'roster') renderRoster();
    if (panel === 'logs') renderLogs();
  }
  $('roster-toggle').onclick = () => toggle('roster', 'roster-toggle');
  $('roster-close').onclick = () => toggle('roster', 'roster-toggle');
  $('log-toggle').onclick = () => toggle('logs', 'log-toggle');
  $('log-close').onclick = () => toggle('logs', 'log-toggle');
  $('search').oninput = renderRoster;
  $('join-form').addEventListener('submit', e => { e.preventDefault(); join($('nickname').value); });
  $('my-info').onclick = () => {
    if (mineOpen) { clearPrivate(true); return; }
    clearAllInput(); mineOpen = true; revealedFieldIds.clear();
    $('my-info').setAttribute('aria-expanded', 'true'); renderMine();
  };
  document.addEventListener('pointercancel', clearAllInput, true);
  const isTyping = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
  document.addEventListener('keydown', e => {
    if ($('rules-view').open || $('reset-confirm').open) return;
    if (e.key === 'Escape') {
      if (!$('finish-overlay').hidden) { hideFinish(); return; }
      if (wheelOpen) { closeWheel(); return; }
      if (!$('games').hidden) { e.preventDefault(); exitRps(); return; }
      clearAllInput(); $('candidates').hidden = true; $('candidates').replaceChildren(); return;
    }
    // 转盘 / 结算覆盖层打开时，忽略移动、E、J 等游戏内按键。
    if (wheelOpen || !$('finish-overlay').hidden || !$('games').hidden) return;
    if (isTyping()) return;
    if (e.code === 'KeyE') {
      e.preventDefault(); if (e.repeat) return;
      if (explorationPanel) { closeExploration(); return; }
      const hit = nearestInteractable();
      if (hit) { if (hit.kind === 'player') select(hit.id); else openExploration(hit.kind, hit.id); }
      else showToast('请靠近角色或容器/NPC（64 像素以内）');
      return;
    }
    if (e.code === 'KeyJ') {
      e.preventDefault(); if (e.repeat) return;
      attack();
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
