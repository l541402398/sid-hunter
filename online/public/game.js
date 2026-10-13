'use strict';
// LAN playtest client. Pure presentation: it submits intents and renders snapshots.
// Position, skill resolution, public state, elimination and finish are all server-side.
// The furniture layout comes from /shared/world.js, the same file the server loads, so
// the baked background and the authoritative collision can never drift apart.
(() => {
  const $ = id => document.getElementById(id);
  const W = WORLD.WORLD_W, H = WORLD.WORLD_H, VW = WORLD.VIEW_W, VH = WORLD.VIEW_H;
  const MIN_X = WORLD.MIN_X, MAX_X = WORLD.MAX_X, MIN_Y = WORLD.MIN_Y, MAX_Y = WORLD.MAX_Y;
  const BODY_HALF = WORLD.BODY_HALF, FOOT_TOP = WORLD.FOOT_TOP, FOOT_BOTTOM = WORLD.FOOT_BOTTOM;
  const fieldNames = WORLD.FIELD_NAMES, traitNames = WORLD.TRAIT_NAMES, MASK = WORLD.MASK;
  const palettes = WORLD.PALETTES, zones = WORLD.ZONES;
  const furniture = WORLD.makeFurniture();
  // 肢体互动常量与服务端共用同一份 world.js；渲染层只读，不自行判定命中或击晕。
  const ACTION = WORLD.ACTION;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  let badSlots = [], badPoolAvailable = false, lastBadPoolSig = '';
  // Only consume the dedicated anonymous projection, never infer identities from players.
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
  let finished = false, aliveCount = 0, outCount = 0, serverTime = Date.now();
  let selectedId = null, cameraX = 0, clock = 0;
  let privateOpen = false, mineOpen = false, pending = null, privateResult = '';
  const revealedFieldIds = new Set();
  let devCsrf = null, resetBusy = false, npcBusy = false;
  let sessionToken = null, stream = null, awaitingFirst = true, lastSkillTick = -1;
  let lastTargetSig = '', lastLogSig = '', lastRosterSig = '';
  const offlineEvents = new Set();
  const confirmedDigests = new Set(); // only populated after server ACK succeeds
  const renderMap = new Map();
  const keys = new Set();
  let lastIntent = '', toastTimer;

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
    stream.addEventListener('reset', resetToJoin);
    stream.onmessage = event => { try { applySnapshot(JSON.parse(event.data)); } catch { } };
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
    if (s.me && me && (s.me.id !== me.id || s.me.sid !== me.sid || s.me.faction !== me.faction)) clearPrivate(true);
    serverTime = s.serverTime || Date.now();
    finished = !!s.finished;
    logs = s.logs || [];
    players = s.players || [];
    badPoolAvailable = Array.isArray(s.badSlots);
    badSlots = badPoolAvailable ? s.badSlots : [];
    renderBadPool();
    aliveCount = players.filter(p => p.alive).length;
    outCount = players.filter(p => !p.alive).length;
    if (s.me && s.me.id !== undefined) {
      // The first snapshot after (re)connecting carries everything queued while offline.
      if (awaitingFirst) { for (const e of (s.me.pending || [])) offlineEvents.add(e.eventId); awaitingFirst = false; }
      me = s.me;
      if (me.interactionSummary && confirmedDigests.has(`${me.interactionSummary.epoch}:${me.interactionSummary.id}`)) {
        me = { ...me, interactionSummary: null };
      }
      // Do not interrupt the already-running old round: render its two actual skills
      // with their correct effects until the host schedules a server restart.
      if (me.skills.action) me = { ...me, legacy: true, skills: me.faction === 'bad'
        ? { spy: me.skills.probe, kill: me.skills.action }
        : { probe: me.skills.probe, accuse: me.skills.action } };
    }
    for (const p of players) if (!renderMap.has(p.id)) renderMap.set(p.id, { x: p.x, y: p.y, walk: 0, moving: false, facing: 1 });
    if (selectedId !== null && !players.some(p => p.id === selectedId)) { clearPrivate(); selectedId = null; }
    renderPublic();
    syncTarget();
    if (mineOpen) renderMine();
    updateOfflineUI();
  }

  // ---------- 名单 / 日志 / 目标档案 ----------
  function portrait(p) {
    if (!p.alive) return '<svg class="portrait" viewBox="0 0 40 54" aria-label="幽灵 · 已淘汰"><path d="M6 46V24a14 14 0 0 1 28 0v22l-7-5-7 5-7-5-7 5Z" fill="#eeeae0" stroke="#a8a9af"/><circle cx="15" cy="25" r="2" fill="#424957"/><circle cx="25" cy="25" r="2" fill="#424957"/></svg>';
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
    const tag = !p.alive ? `<span class="out-label">幽灵 · 已淘汰${p.online === false ? ' · 离线' : ''}</span>`
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
    $('player-count').textContent = `${players.length} 位玩家 · 服务端权威${finished ? ' · 本局已结束' : ''}`;
    $('roster-count').textContent = players.length;
    renderRoster(); renderLogs();
  }
  function selected() { return selectedId === null ? null : players.find(p => p.id === selectedId) || null; }
  function syncTarget() {
    const p = selected();
    const sig = p ? JSON.stringify((({ x, y, ...profile }) => profile)(p)) : '';
    if (sig === lastTargetSig) { if (holding()) updateSkillStatus(); return; }
    lastTargetSig = sig;
    renderTarget();
  }
  function clearPrivate(clearMy) {
    privateOpen = false; pending = null; privateResult = '';
    const block = $('private-content'); if (block) block.replaceChildren();
    const gate = $('private-gate'); if (gate) { gate.textContent = '展开私密操作'; gate.setAttribute('aria-expanded', 'false'); }
    if (clearMy) {
      closeMine();
      $('offline-summary').hidden = true; $('offline-summary').replaceChildren();
    }
  }
  function clearAllInput() { keys.clear(); sendIntent(true); clearPrivate(true); }
  function select(id) {
    clearPrivate(true); selectedId = id;
    $('candidates').hidden = true; $('candidates').replaceChildren();
    lastTargetSig = ''; renderTarget(); renderRoster();
  }
  function renderTarget() {
    const p = selected();
    if (!p) { $('target').hidden = true; $('target').replaceChildren(); return; }
    $('target').hidden = false;
    const status = p.alive ? '存活 · 公开档案' : '幽灵 · 已淘汰 · 不可施技';
    $('target').innerHTML = `<div class="panel-heading"><span class="eyebrow">PUBLIC PROFILE</span><button id="target-close" class="icon-button" aria-label="关闭目标档案">×</button></div><div class="target-person">${portrait(p)}<div><h2>${escapeText(p.name)}</h2><p class="sid">${sidHTML(p.sid)}</p><p class="status">${status}${p.id === selfId() ? ' · 自己' : ''}</p></div></div><div class="color-grid">${Object.entries(p.colors).map(([k, c]) => `<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${c[0]}</div>`).join('')}</div><div class="traits">${Object.entries(p.traits).map(([k, v]) => `<div class="trait"><span>${traitNames[k]}</span><strong>${escapeText(v)}</strong></div>`).join('')}</div><button id="private-gate" class="private-gate" aria-expanded="${privateOpen}">${privateOpen ? '收起私密操作' : '展开私密操作'}</button><p class="hold-note">点击展开或收起 · 展开期间请注意周围视线 · 切出页面自动隐藏</p><div id="private-content"></div>`;
    $('target-close').onclick = () => { clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); };
    $('private-gate').onclick = () => {
      if (privateOpen) clearPrivate();
      else { privateOpen = true; renderPrivate(); $('private-gate').textContent = '收起私密操作'; $('private-gate').setAttribute('aria-expanded', 'true'); }
    };
    if (holding()) renderPrivate();
  }
  // ---------- 私密操作（点击展开，不再依赖 Shift） ----------
  function holding() { return privateOpen; }
  // Private skill resources stop at the authoritative freeze time, even while ghosts keep moving.
  const skillTime = () => me && me.skillsFrozenAt != null ? me.skillsFrozenAt : serverTime;
  const secondsLeft = until => Math.max(0, Math.ceil((Number(until || 0) - skillTime()) / 1000));
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
    const frozen = me && me.skillsFrozenAt != null;
    return `${skillNames[id]} ${skill.chargesRemaining}/${skill.maxCharges} · ${cooldown ? `冷却 ${cooldown}s` : '就绪'} · ${skill.nextChargeAt ? `${secondsLeft(skill.nextChargeAt)}s ${frozen ? '恢复剩余（冻结）' : '后 +1'}` : '储存已满'}${frozen ? ' · 技能资源已冻结' : ''}`;
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
    info.textContent = (!canTarget(p) ? (finished ? '本局已结束，技能已冻结。 ' : '自己或已淘汰目标不可操作。 ') : '')
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
    const result = await api('/api/skill', body).catch(() => ({ ok: false, error: '网络异常，未结算' }));
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
    $('mine-alive').textContent = me.alive ? '存活 · 本人档案' : '已淘汰 · 本人档案';
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
        devCsrf = cap.csrfToken;
        $('dev-npc').hidden = false; $('dev-reset').hidden = false; $('dev-management').hidden = false;
      }
    } catch { /* Older backend, denied, or network failure: fail closed. */ }
  }
  function resetToJoin() {
    if (stream) { stream.close(); stream = null; }
    clearPrivate(true); keys.clear(); lastIntent = '';
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
    renderPublic(); renderRoster(); renderLogs(); updateOfflineUI();
    $('join-page').hidden = false; $('join-error').textContent = '本局已重置，请主动加入新局。';
    $('nickname').value = ''; $('nickname').focus({ preventScroll: true });
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
      if (!response.ok || owner !== sessionToken || !me) return;
      // Only remove local state after confirmed ACK. Failure/reconnect keeps the same digest available.
      const known = new Set(ids);
      for (const id of known) offlineEvents.delete(id);
      me.pending = pendingList().filter(e => !known.has(e.eventId));
      if (digest) confirmedDigests.add(`${digest.epoch}:${digest.id}`);
      if (digest && me.interactionSummary && me.interactionSummary.id === digest.id) me.interactionSummary = null;
      updateOfflineUI();
    } catch { /* Keep unacknowledged payload; retry after reopening the summary. */ }
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
  function drawFurniture(f, g = ctx) {
    const { x, y, w, h, type } = f;
    g.globalAlpha = .2; rect(x + 8, y + h - 6, w - 12, 11, '#120c14', g); rect(x + 3, y + h - 3, w - 6, 6, '#120c14', g); g.globalAlpha = 1;
    if (type === 'plant') {
      const px = x + w * .28, pw = Math.round(w * .46);
      rect(x + w * .49, y + h * .26, 4, h * .3, '#3f7a52', g);
      blob(g, x + w * .02, y + h * .04, w * .5, h * .46, '#3f7a52');
      blob(g, x + w * .46, y + h * .0, w * .46, h * .48, '#4a8a5d');
      blob(g, x + w * .14, y + h * .24, w * .4, h * .34, '#2f6242');
      blob(g, x + w * .44, y + h * .26, w * .44, h * .32, '#58996a');
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
      for (const f of furniture) if (f.x + f.w / 2 >= base && f.x + f.w / 2 < base + VW) drawFurniture(f, g);
      g.restore();
    }
  }
  buildBackground();

  // ---- 肢体互动表现：肿包 / 眩晕星星 / 挥锤 / 命中星芒 ----
  // 全部只读服务端快照里的 bumps / bumpUntil / stunUntil / swingAt / hitAt，渲染层不做任何判定。
  function drawBumps(p, x, yb, a) {
    const n = Math.min(ACTION.maxBumps, Number(p.bumps) || 0);
    if (!n) return;
    // 到期前 1.5 秒按剩余时间比例缩小淡出。
    const remain = (Number(p.bumpUntil) || 0) - serverTime;
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
  function pixelStar(cx, cy, dark, light) {
    rect(cx - 3, cy, 7, 1, dark); rect(cx, cy - 3, 1, 7, dark);
    rect(cx - 2, cy, 5, 1, light); rect(cx, cy - 2, 1, 5, light);
    rect(cx - 1, cy - 1, 3, 3, '#fff6d8');
  }
  // 眩晕只画旋转星星 + 身体摇晃，绝不灰度化：灰度是离线专属视觉。
  function drawStunStars(x, yb, a) {
    ctx.globalAlpha = a;
    const cy = yb - 58;
    for (let i = 0; i < 3; i++) {
      const ang = clock * 3.6 + i * (Math.PI * 2 / 3);
      pixelStar(x + Math.round(Math.cos(ang) * 12), cy + Math.round(Math.sin(ang) * 4), '#6b4a12', '#ffd85e');
    }
  }
  // 挥锤后 300ms 内画一把像素锤子，从抬起插值到劈下；朝向只用渲染层自己的 facing。
  function drawSwing(p, x, yb, a) {
    const since = serverTime - (Number(p.swingAt) || 0);
    if (!(since >= 0 && since < 300)) return;
    const k = since / 300, ease = k * k * (3 - 2 * k);
    const facing = p.facing === -1 ? -1 : 1;
    const ang = (-100 + 118 * ease) * Math.PI / 180;
    const hx = x + facing * 12, hy = yb - 28;
    const hx2 = hx + Math.cos(ang) * facing * 13, hy2 = hy + Math.sin(ang) * 13;
    ctx.globalAlpha = a;
    for (let i = 1; i <= 8; i++) {
      const px = hx + (hx2 - hx) * (i / 8), py = hy + (hy2 - hy) * (i / 8);
      rect(px - 2, py - 2, 5, 5, '#1c1620');
    }
    for (let i = 1; i <= 8; i++) {
      const px = hx + (hx2 - hx) * (i / 8), py = hy + (hy2 - hy) * (i / 8);
      rect(px - 1, py - 1, 3, 3, '#8a5f3a');
    }
    rect(hx2 - 6, hy2 - 5, 13, 11, '#1c1620');
    rect(hx2 - 5, hy2 - 4, 11, 9, '#9aa0a6');
    rect(hx2 - 5, hy2 - 4, 11, 2, '#c3c8cd');
    rect(hx2 - 5, hy2 + 3, 11, 2, '#6f757b');
  }
  // 被敲中后 250ms 内在头顶爆开几根白色短星芒。
  function drawHitBurst(p, x, yb, a) {
    const since = serverTime - (Number(p.hitAt) || 0);
    if (!(since >= 0 && since < 250)) return;
    const k = since / 250, rad = 5 + 13 * k;
    ctx.globalAlpha = a * (1 - k);
    const n = 5, cy = yb - 46;
    for (let i = 0; i < n; i++) {
      const ang = -Math.PI / 2 + (i - (n - 1) / 2) * .52;
      const sx = x + Math.round(Math.cos(ang) * rad), sy = cy + Math.round(Math.sin(ang) * rad);
      rect(sx - 2, sy, 5, 1, '#ffffff'); rect(sx, sy - 2, 1, 5, '#ffffff');
    }
  }

  // 角色：统一描边 + 三层明暗 + 五官 + 发型 + 行走摆动。
  // 离线者只在渲染层降低不透明度，四种颜色外观数据一律不改。
  // Cached neutral ghost path, anchored at logical feet. No secret-derived shape or color.
  const ghostPath = new Path2D();
  ghostPath.moveTo(-14, 0); ghostPath.lineTo(-14, -26);
  ghostPath.arc(0, -26, 14, Math.PI, 0);
  ghostPath.lineTo(14, 0); ghostPath.lineTo(7, -5); ghostPath.lineTo(0, 0);
  ghostPath.lineTo(-7, -5); ghostPath.closePath();
  function ghostSprite(p) {
    const x = Math.round(p.x), y = Math.round(p.y);
    ctx.save(); ctx.translate(x, y);
    ctx.globalAlpha = p.online === false ? .5 : .8;
    ctx.fillStyle = p.online === false ? '#b1b3b8' : '#eeeae0';
    ctx.strokeStyle = '#a8a9af'; ctx.lineWidth = 1; ctx.fill(ghostPath); ctx.stroke(ghostPath);
    rect(-6, -25, 3, 4, '#424957'); rect(3, -25, 3, 4, '#424957');
    if (p.visible !== false && serverTime - p.scareAt >= 0 && serverTime - p.scareAt < 300) {
      ctx.strokeStyle = '#a8deee'; ctx.beginPath(); ctx.arc(0, -20, 19, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.id === selectedId || p.id === selfId()) {
      ctx.strokeStyle = '#8fd0ff'; ctx.strokeRect(-17, -43, 34, 47);
    }
    ctx.restore();
  }
  function sprite(p) {
    if (!p.alive) { ghostSprite(p); return; }
    const x = Math.round(p.x), c = p.colors, meId = selfId();
    const hi = Math.max(0, palettes.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], skinLo = shade(skin, -.24);
    const hair = c.hair[1], hairHi = shade(hair, .3), hairLo = shade(hair, -.3);
    const top = c.top[1], topHi = shade(top, .24), topLo = shade(top, -.3);
    const pants = c.pants[1], pantsHi = shade(pants, .18), pantsLo = shade(pants, -.26);
    const shoes = c.shoes[1], shoeLo = shade(shoes, -.32);
    const OL = '#1c1620';
    const ph = p.walk * .13, sw = p.moving ? Math.sin(ph) : 0;
    const bob = p.moving ? -Math.round(Math.abs(Math.sin(ph)) * 2) : Math.round(Math.sin(clock * 1.5 + p.id * 1.9) * .7);
    // 可见性开关：不可见时服务端已把锤戏字段置 0，这里再以 visible 为准显式兜一层，
    // visible:false 区分裁剪产生的 0 与可见目标的真实 0，防止把远处状态误读为真实无硬控。
    const seen = p.visible !== false;
    // 跳跃只在画面上把整身抬高：地面坐标（点击命中盒、名牌、阴影）一律不变。
    const z = seen ? (Number(p.z) || 0) : 0, zk = Math.min(1, z / ACTION.jumpHeight);
    const air = z > 0;
    const stunned = seen && serverTime < (Number(p.stunUntil) || 0);
    const frightened = seen && serverTime < (Number(p.frightUntil) || 0);
    const legShake = frightened ? Math.round(Math.sin(clock * 30)) : 0;
    const wobble = stunned ? Math.round(Math.sin(clock * 17) * 1.5) : 0;
    const yb = Math.round(p.y) + bob - z;
    const liftL = air ? 0 : Math.max(0, sw) * 2, liftR = air ? 0 : Math.max(0, -sw) * 2, arm = Math.round(-sw * 1.6);
    // 腾空时收腿：双脚并拢并抬高 2px。
    const tuck = air ? 2 : 0;
    const fx1 = (air ? x - 8 : x - 11) + legShake, fx2 = (air ? x - 2 : x + 1) - legShake;
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    // 地面阴影始终留在 p.y：随高度略微缩小并变淡，不跟着人一起抬高。
    const sf = 1 - .45 * zk;
    ctx.globalAlpha = Math.max(0, .3 * a * (1 - .5 * zk));
    rect(x - Math.round(22 * sf) / 2, p.y + 2, Math.round(22 * sf), 5, '#0f0a12');
    rect(x - Math.round(16 * sf) / 2, p.y + 1, Math.round(16 * sf), 6, '#0f0a12');
    ctx.globalAlpha = a;
    ctx.save(); if (wobble) ctx.translate(wobble, 0);
    const parts = [
      [fx1, yb - 3 - tuck, 10, 4, shoes], [fx2, yb - 3 - tuck, 10, 4, shoes],
      [x - 9 + legShake, yb - 12 - tuck, 7, 9 - liftL, pantsLo], [x + 2 - legShake, yb - 12 - tuck, 7, 9 - liftR, pantsLo],
      [x - 10, yb - 17, 20, 6, pants],
      [x - 11, yb - 31, 22, 16, top],
      [x - 16, yb - 30 + arm, 5, 12, topLo], [x + 11, yb - 30 - arm, 5, 12, topLo],
      [x - 16, yb - 19 + arm, 5, 5, skin], [x + 11, yb - 19 - arm, 5, 5, skin],
      [x - 4, yb - 34, 8, 5, skinLo],
      [x - 10, yb - 47, 20, 16, skin],
      [x - 11, yb - 49, 22, 7, hair]
    ];
    const style = hi % 4;
    if (style === 1) parts.push([x - 13, yb - 44, 3, 16, hair], [x + 10, yb - 44, 3, 16, hair]);
    else parts.push([x - 12, yb - 44, 3, 10, hairLo], [x + 9, yb - 44, 3, 10, hairLo]);
    if (style === 2) parts.push([x + 11, yb - 43, 4, 12, hairLo]);
    if (style === 3) parts.push([x - 5, yb - 53, 10, 5, hair]);
    for (const q of parts) rect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
    for (const q of parts) rect(q[0], q[1], q[2], q[3], q[4]);
    rect(x - 9, yb - 48, 9, 2, hairHi);
    rect(x - 11, yb - 31, 22, 2, topHi); rect(x - 11, yb - 17, 22, 2, topLo);
    rect(x - 11, yb - 31, 2, 16, shade(top, .1)); rect(x + 9, yb - 31, 2, 16, topLo);
    rect(x - 1, yb - 31, 2, 5, shade(top, -.45)); rect(x - 10, yb - 17, 20, 1, shade(pants, -.5));
    rect(x - 9 + legShake, yb - 12 - tuck, 7, 2, pantsHi); rect(x + 2 - legShake, yb - 12 - tuck, 7, 2, pantsHi);
    rect(fx1, yb - tuck, 10, 1, shoeLo); rect(fx2, yb - tuck, 10, 1, shoeLo);
    rect(x - 11, yb - 40, 1, 4, skinLo); rect(x + 10, yb - 40, 1, 4, skinLo);
    rect(x - 8, yb - 45, 4, 1, hairLo); rect(x + 4, yb - 45, 4, 1, hairLo);
    rect(x - 7, yb - 43, 3, 3, '#2b2230'); rect(x + 4, yb - 43, 3, 3, '#2b2230');
    rect(x - 7, yb - 43, 1, 1, '#f4f8ff'); rect(x + 4, yb - 43, 1, 1, '#f4f8ff');
    rect(x - 1, yb - 39, 2, 1, skinLo);
    rect(x - 3, yb - 36, 6, 1, '#a8706a'); rect(x - 4, yb - 37, 1, 1, '#a8706a'); rect(x + 3, yb - 37, 1, 1, '#a8706a');
    if (seen) {
      drawBumps(p, x, yb, a);
      if (stunned) drawStunStars(x, yb, a);
      drawSwing(p, x, yb, a);
      drawHitBurst(p, x, yb, a);
    }
    ctx.restore();
    if (frightened) {
      ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#88d6e9';
      for (const dx of [-16, 16]) {
        ctx.beginPath(); ctx.moveTo(x + dx, p.y - 8);
        ctx.quadraticCurveTo(x + dx - 4, p.y - 2, x + dx, p.y);
        ctx.quadraticCurveTo(x + dx + 4, p.y - 2, x + dx, p.y - 8); ctx.fill();
      }
      ctx.font = '12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('受惊', x, p.y - 14);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    if (p.id === meId && p.id !== selectedId) {
      ctx.globalAlpha = .8 * a; ctx.strokeStyle = '#7cc4ff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, p.y + 5, 13, 4, 0, 0, Math.PI * 2); ctx.stroke();
      const off = Math.round(Math.sin(clock * 2.6) * 1.5);
      rect(x - 3, yb - 60 + off, 6, 3, '#9ed4ff'); rect(x - 2, yb - 57 + off, 4, 2, '#9ed4ff');
      ctx.globalAlpha = 1; ctx.lineWidth = 1;
    }
    if (p.id === selectedId) {
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
    return players.map(p => {
      const r = renderMap.get(p.id) || { x: p.x, y: p.y, walk: 0, moving: false };
      return { ...p, x: r.x, y: r.y, walk: r.walk, moving: r.moving, facing: r.facing };
    });
  }
  function makeLabels(list) {
    labels = list.filter(p => p.x >= cameraX - 130 && p.x <= cameraX + VW + 130)
      .map(p => ({ x: p.x - 72, y: p.y + 12, w: 144, h: 31, ids: [p.id], p }));
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
    for (const p of list.filter(p => p.x > cameraX - 40 && p.x < cameraX + VW + 40).sort((a, b) => a.y - b.y || a.id - b.id)) {
      ctx.save();
      if (p.online === false) ctx.filter = 'grayscale(1)'; // offline-only; public color data unchanged
      sprite(p); ctx.restore();
    }
    makeLabels(list);
    ctx.textAlign = 'center';
    const meId = selfId();
    for (const l of labels.slice().sort((a, b) => Number(a.p.id === selectedId || a.p.id === meId) - Number(b.p.id === selectedId || b.p.id === meId))) {
      const active = l.ids.includes(selectedId);
      const accent = active ? '#7cc4ff' : (l.p.alive ? '#78c39b' : '#7c8698');
      roundPx(l.x + 2, l.y + 3, l.w, l.h, '#080b12a0');
      roundPx(l.x - 1, l.y - 1, l.w + 2, l.h + 2, active ? '#4f88c4' : '#2f425c');
      roundPx(l.x, l.y, l.w, l.h, active ? '#14304f' : '#0f1826f2');
      rect(l.x + 8, l.y + 1, l.w - 16, 1, '#ffffff1f');
      rect(l.x + 1, l.y + 5, 2, l.h - 10, accent);
      ctx.font = '12px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.fillStyle = active ? '#eaf4ff' : '#e2e8f0';
      ctx.fillText(l.p.name + (!l.p.alive ? ' · 幽灵' : l.p.id === meId ? ' · 自己' : '') + (l.p.online === false ? ' · 离线' : ''), l.x + l.w / 2, l.y + 13);
      ctx.font = '10px ui-monospace,SFMono-Regular,monospace';
      ctx.fillStyle = active ? '#a8cbe8' : '#96adc8';
      ctx.fillText(l.p.sid, l.x + l.w / 2, l.y + 26);
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
      // 朝向只服务于挥锤表现，纯渲染层维护，不回传服务端。
      if (Math.abs(dx) > 0.6) r.facing = dx > 0 ? 1 : -1;
    }
    const self = selfPlayer() ? renderMap.get(selfId()) : null;
    if (self) cameraX = clamp(self.x - VW / 2, 0, W - VW);
    const zoneIndex = Math.min(3, Math.floor((self ? self.x : 0) / 960));
    $('zone-name').textContent = zones[zoneIndex];
    const tick = Math.floor(serverTime / 1000);
    if (tick !== lastSkillTick) { lastSkillTick = tick; if (holding()) updateSkillStatus(); if (mineOpen) renderMine(); }
  }
  let lastNow = performance.now();
  function frame(now) {
    step(Math.max(0, Math.min(.05, (now - lastNow) / 1000)));
    lastNow = now;
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- 交互 ----------
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / VW, r.height / VH);
    const ox = (r.width - VW * scale) / 2, oy = (r.height - VH * scale) / 2;
    return { x: (e.clientX - r.left - ox) / scale + cameraX, y: (e.clientY - r.top - oy) / scale };
  }
  function showCandidates(ids) {
    clearPrivate(true);
    const list = [...new Set(ids)].filter(id => players.some(p => p.id === id)).sort((a, b) => a - b);
    $('candidates').hidden = false;
    $('candidates').innerHTML = `<div class="panel-heading"><div><small>OVERLAPPING PLAYERS</small><h2>请选择目标</h2></div><button id="candidate-close" class="icon-button" aria-label="关闭重叠候选">×</button></div><p>同一点击点有${list.length}位玩家，不会自动选人。</p>${list.map(id => row(players.find(p => p.id === id))).join('')}`;
    bindRows($('candidates'));
    $('candidate-close').onclick = () => { $('candidates').hidden = true; $('candidates').replaceChildren(); };
  }
  canvas.addEventListener('click', e => {
    const { x, y } = canvasPoint(e);
    const list = drawList();
    makeLabels(list);
    const labelHits = labels.filter(l => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h);
    const bodyHits = list.filter(p => Math.abs(x - p.x) <= 21 && y >= p.y - 53 && y <= p.y + 8).map(p => p.id);
    const hits = [...new Set([...labelHits.flatMap(l => l.ids), ...bodyHits])];
    if (hits.length > 1) showCandidates(hits);
    else if (hits.length === 1) {
      const label = labelHits[0];
      if (label && y >= label.y + 15) copySID(label.p.sid);
      else select(hits[0]);
    } else { clearPrivate(true); selectedId = null; lastTargetSig = ''; renderTarget(); renderRoster(); }
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
  // 跳跃 / 挥锤额外放行按钮与链接：空格要能正常激活焦点里的按钮，不被游戏劫持。
  const isActionTarget = () => /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(document.activeElement && document.activeElement.tagName) || !!(document.activeElement && document.activeElement.isContentEditable);
  // 同一条中文原因 1 秒内不重复弹提示，避免按住键时刷屏。
  const actionToast = { text: '', at: 0 };
  async function sendAction(kind) {
    const r = await api('/api/action', { kind }).catch(() => ({ ok: false, error: '网络异常，动作未执行' }));
    if (r.ok) { actionToast.text = ''; return; }
    if (r.status !== 401 && r.status !== undefined) return; // cooldown/airborne/control/frozen: silent
    const msg = r.status === 401 ? '连接身份已失效，请重新加入。' : '网络暂时不稳定。';
    const at = Date.now();
    if (msg === actionToast.text) return; // one gentle error per failing connection episode
    actionToast.text = msg; actionToast.at = at;
    showToast(msg);
  }
  document.addEventListener('keydown', e => {
    if ($('rules-view').open || $('reset-confirm').open) return;
    if (e.key === 'Escape') { clearAllInput(); $('candidates').hidden = true; $('candidates').replaceChildren(); return; }
    if (isTyping()) return;
    if (e.code === 'KeyK' || e.code === 'KeyJ') {
      // 服务端权威：这里只提交意图，命中与击晕一律由服务端判定。
      if (e.repeat || isActionTarget()) return;
      e.preventDefault();
      sendAction(e.code === 'KeyK' ? 'jump' : me && !me.alive ? 'scare' : 'hammer');
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(e.code)) {
      e.preventDefault(); keys.add(e.code); sendIntent(false);
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
