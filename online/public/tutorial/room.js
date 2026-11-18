'use strict';
// Local practice transport for the REAL game client. No live-session API or SSE is used.
(() => {
  const $ = id => document.getElementById(id), T = window.TutorialRoom, W = window.WORLD;
  const scene = W.roomById('f1:room:manager');
  const desk = scene.furniture.filter(f => f.type === 'desk' && f.container)
    .sort((a, b) => W.distanceToEntity(scene.entry, a) - W.distanceToEntity(scene.entry, b))[0];
  function freeSpot(x, y) {
    for (let radius = 0; radius <= Math.max(scene.width, scene.height); radius += 12) {
      for (let i = 0; i < 16; i++) {
        const px = Math.round(x + Math.cos(i * Math.PI / 8) * radius);
        const py = Math.round(y + Math.sin(i * Math.PI / 8) * radius);
        if (!W.roomCollides(scene.id, px, py)) return { x: px, y: py };
      }
    }
    throw new Error('No walkable practice position in this room');
  }
  function clearLane() {
    for (let y = desk.y + desk.h + 100; y < scene.height - 60; y += 12) {
      for (let x = Math.round(scene.width / 4); x < scene.width - 140; x += 12) {
        let clear = true;
        for (let dx = 0; dx <= 90; dx += 3) if (W.roomCollides(scene.id, x + dx, y)) { clear = false; break; }
        if (clear) return { spawn: { x, y } };
      }
    }
    throw new Error('No clear practice movement lane');
  }
  const lane = clearLane();
  const people = T.PEOPLE.map((p, i) => ({ ...p, ...freeSpot(scene.width * (.63 + i * .1), scene.height * (.64 + i * .13)) }));
  const layout = { desk, people, speed: W.SPEED, spawn: lane.spawn,
    resume: freeSpot(desk.x + desk.w / 2, desk.y + desk.h + 68), collides: (x, y) => W.roomCollides(scene.id, x, y) };
  const clone = value => JSON.parse(JSON.stringify(value));
  const post = (type, extra = {}) => { if (parent !== window) parent.postMessage({ type: 'sid-tutorial:' + type, ...extra }, location.origin); };
  const colors = (hair, top) => ({ hair, top, pants: ['炭灰', '#505d70'], shoes: ['棕色', '#927253'] });
  const ownColors = colors(['栗棕', '#9f6748'], ['草绿', '#75a58a']);
  let room = T.create(null, layout), active = false, bridge = null, elapsed = 0, lastPush = 0, lastStep = -1, lastPublished = false;
  let input = {}, searched = [], generation = 0, swingAt = 0, logs = [], drawCount = 0, spotlightKey = '', mapHealth = null, lastView = {}, completionShown = false;
  function log(message, type = 'tutorial') {
    logs.unshift({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text: message, type });
    logs = logs.slice(0, 30);
  }
  function publicPlayer(id, name, position, look, hp) {
    return { ...position, id, name, colors: look, hp, maxHp: 3, alive: true, online: true, score: id === 1 ? room.state.player.score : 0,
      floorId: 1, zoneId: scene.id, protected: false, traits: { saying: '***', food: '***', sport: '***' }, sid: '***-***-***',
      spriteFacing: position.facing || 'front', facing: { x: 1, y: 0 }, lastAttackDirection: 'right', lastAttackFacing: { x: 1, y: 0 },
      lastAttackAt: id === 1 ? swingAt : 0, swingAt: id === 1 ? swingAt : 0 };
  }
  function exploration() { return { clues: [], searched: [...searched], pendingQuizContainerIds: [] }; }
  function me() {
    const s = room.state;
    return { id: 1, name: '练习角色', faction: 'good', sid: 'PRA-CTI-CE1', hp: s.player.hp, maxHp: 3, alive: true, truce: false, protected: false, protectUntil: 0,
      score: s.player.score, scoreBreakdown: { participate: s.explored ? 2 : 0, survival: 0, combat: s.npcHp === 2 ? 10 : 0 }, historicalScore: 0,
      floorId: 1, floorRevision: 0, floorName: '1F · 晨光迎宾厅', zoneId: scene.id, zoneName: scene.name,
      traits: { saying: '稳住别慌', food: '番茄面', sport: '散步' }, traitPublic: { saying: false, food: false, sport: false }, sidRevealed: [false, false, false],
      exploration: exploration(), npcExchange: { exploredCount: searched.length, used: {}, effects: [] }, flowers: { received: 0, sentPoints: 0, sentTo: [] },
      games: { rpsPending: null, rpsResult: null, rpsUntil: 0, wheelDailySpins: 0, wheelSpins: {} },
      combat: { facing: { x: 1, y: 0 }, attackUntil: 0, lastAttackAt: swingAt, lastAttackFacing: { x: 1, y: 0 }, lastAttackDirection: 'right', stunUntil: 0, freezeUntil: 0 },
      skills: { accuse: { chargesRemaining: 1, maxCharges: 1, cooldownMs: 0, cooldownUntil: 0, chargeIntervalMs: 1800000, nextChargeAt: 0 } },
      accusedToday: [], skillsFrozenAt: null, pending: [], interactionSummary: null, prize: null };
  }
  function snapshot() {
    const s = room.state;
    const actors = [publicPlayer(1, '练习角色', s.player, ownColors, s.player.hp), ...people.map((p, i) => publicPlayer(i + 2, p.name, p, colors(p.hair, p.top), p.bad ? s.npcHp : 3))];
    return { type: 'snapshot', serverTime: Date.now(), roundId: 'tutorial-' + generation, players: actors, directory: actors, me: me(),
      logs, aliveCount: 3, outCount: 0, finished: false, config: { tmj: false },
      nextClueAt: s.cluesPublished ? Date.now() - 1000 : Date.now() + Math.ceil(s.cluesLeft * 1000),
      badSlots: [{ key: 'tutorial-bad', label: '坏人01', alive: true, systemClues: { colors: s.cluesPublished ? T.CLUE_COLORS : {}, traits: {} } }],
      rules: { endsAt: 0 }, historicalRanking: [], ranking: null, glassDoors: [] };
  }
  function push() { if (bridge && active) bridge.applySnapshot(clone(snapshot())); }
  // Retain only an instruction card; every functional control below it belongs to game.js.
  function renderGuide() {
    const step = room.state.step;
    if (step === lastStep) return;
    lastStep = step; document.body.dataset.tutorialStep = String(step);
    const done = step === T.STEPS.length, lesson = T.STEPS[Math.min(step, T.STEPS.length - 1)];
    $('lesson-number').textContent = done ? '07 / 07 · 完成' : `${String(step + 1).padStart(2, '0')} / 07`;
    $('lesson-title').textContent = done ? '训练完成' : `${step + 1}. ${lesson.title}`;
    $('lesson-task').textContent = done ? '你已掌握基础操作，可以返回办公室。' : lesson.task;
    $('lesson-detail').textContent = done ? '正式对局继续进行，返回时将显示最新状态与期间事件。' : lesson.detail;
    $('lesson-tip').textContent = done ? '在「游戏规则 → 新手训练室」可随时再来。' : lesson.tip;
    $('lesson-progress').replaceChildren(...T.STEPS.map((p, i) => {
      const item = document.createElement('li'); item.className = i < step ? 'done' : i === step ? 'current' : '';
      item.setAttribute('aria-label', p.title + (i < step ? '：已完成' : i === step ? '：当前' : '：未开始')); return item;
    }));
    $('lesson-next').hidden = !done;
    for (const [id, on] of [['my-info', step === 2], ['bad-toggle', step === 3]]) $(id).classList.toggle('tutorial-focus', on);
    post('progress', { progress: room.progress() });
  }
  function spotlightDefinition(view) {
    const phase = room.state.phase;
    const definitions = {
      'mine-open': ['my-info', '点击「我的信息」', '先了解自己的阵营、外观属性和隐藏属性。', '#my-info'],
      'mine-faction': ['mine-faction', '我的阵营', '你是调查员（好人），可以使用「指认」。正式对局每场会重新分配阵营。', '.mine-identity', true],
      'mine-colors': ['mine-colors', '外观属性', '头发、上衣、裤子和鞋子的颜色默认公开，其他玩家也能看到，可以与系统线索核对。', '#mine-colors', true],
      'mine-traits': ['mine-traits', '隐藏属性', '口头禅、爱吃的食物和喜欢的运动只有自己能直接看到。其他玩家要等属性公开后才能查看或搜索。', '#mine-traits', true],
      'mine-close': ['mine-close', '关闭个人信息', '点击这里关闭面板，接下来查看系统公布的坏人线索。', '#mine-close'],
      'clues-open': ['clue-next', '点击「线索公布」', '展开坏人线索，观察系统公布的属性。', '#clue-next'],
      'clues-card': ['clues-card', '推理坏人身份', '根据系统公布的信息，推理出坏人是谁。', '#bad-slots .bad-slot', true],
      'clues-close': ['clues-close', '关闭线索窗口', '记住砖红上衣、银白头发，接下来去玩家名单中搜索。', '#bad-pool-close'],
      'roster-open': ['roster-toggle', '打开玩家名单', '点击这里查看人物的公开信息，并用关键字筛选。', '#roster-toggle'],
      'roster-search': ['roster-search', '输入关键字搜索', '输入系统线索中的上衣颜色「砖红」，找到匹配的人物后点下一步。', '#search', true, ['砖红']],
      'roster-alpha': ['roster-alpha', '查看练习人物甲', '这位人物的公开属性符合刚才的线索，点击打开档案。', '#roster-items [data-player="2"]'],
      'target-colors': ['target-colors', '对照系统线索', '头发银白、上衣砖红，与系统线索「坏人01」一致。请对照完整线索卡，确认后点下一步。', '#target [data-color="hair"], #target [data-color="top"]', true],
      'accuse': ['accuse', '使用技能：指认', '成功指认坏人后，将会减少该坏人1格生命。点击「指认」，然后确认。', '#accuse', false, [], '误指好人会扣除自己 1 格生命。'],
      'confirm': ['confirm', '确认指认', '核对目标是练习人物甲。成功指认坏人后，将会减少该坏人1格生命。', '#confirm', false, [], '误指好人会扣除自己 1 格生命。'],
      'target-close': ['target-close', '关闭人物档案', '指认成功！关闭窗口，看看地图和名单中的血量变化。', '#target-close'],
      'health': ['health', '生命减少了 1 点', '练习人物甲在地图和玩家名单中的血量都已从 3/3 变为 2/3。', '#roster-items [data-player="2"] .combat-health', true]
    };
    let def = definitions[phase];
    if (!def) return null;
    if (phase === 'mine-open' && (!$('loot').hidden || view.mineOpen)) return null;
    if (phase.startsWith('mine-') && phase !== 'mine-open' && !view.mineOpen) def = ['my-info', '继续查看个人信息', '点击「我的信息」继续当前讲解。', '#my-info'];
    if (phase === 'clues-open' && view.cluesOpen) def = ['clues-wait', '等待线索公布', '练习倒计时已经加速，稍等片刻就会公布属性。', '#bad-slots .bad-slot'];
    if (['clues-card','clues-close'].includes(phase) && !view.cluesOpen) def = ['clue-next', '重新打开线索', '点击继续阅读坏人信息。', '#clue-next'];
    if (phase.startsWith('roster-') && phase !== 'roster-open' && !view.rosterOpen) def = ['roster-toggle', '继续查看名单', '打开玩家名单继续搜索练习人物甲。', '#roster-toggle'];
    if (['target-colors','accuse','confirm','target-close'].includes(phase) && (!view.targetOpen || view.selectedId !== 2)) {
      def = view.rosterOpen
        ? ['roster-alpha', '打开练习人物甲', '点击名单中的练习人物甲，继续核对线索和使用技能。', '#roster-items [data-player="2"]']
        : ['roster-toggle', '继续查看名单', '打开玩家名单，继续核对人物线索。', '#roster-toggle'];
    }
    return { id: def[0], title: def[1], detail: def[2], selector: def[3], next: !!def[4], emphasis: def[5] || [], tip: def[6] || '' };
  }
  function panelCloseButton() {
    return document.querySelector('#rules-view[open] #rules-close, #bad-pool-dialog[open] #bad-pool-close, #exploration[open] #exploration-close')
      || ['target', 'mine', 'loot', 'games', 'ranking', 'roster'].filter(id => !$(id).hidden)
        .map(id => $(id).querySelector(`#${id}-close`)).find(Boolean);
  }
  function escapePanel() {
    if ($('training-complete').open) { exit(); return; }
    const close = panelCloseButton();
    if (close) close.click(); else exit();
  }
  function hideSpotlight() {
    const overlay = $('tutorial-spotlight');
    if (overlay.matches(':popover-open')) overlay.hidePopover();
    overlay.hidden = true; spotlightKey = '';
    document.body.classList.remove('tutorial-spotlighting');
    $('target').classList.remove('tutorial-comparing');
  }
  function updateSpotlight(view) {
    const def = spotlightDefinition(view), overlay = $('tutorial-spotlight');
    if (!def || !active) { hideSpotlight(); return; }
    $('target').classList.toggle('tutorial-comparing', def.id === 'target-colors');
    const node = document.querySelector(def.selector);
    if (!node || node.getBoundingClientRect().width === 0) { hideSpotlight(); return; }
    const changed = overlay.dataset.target !== def.id || overlay.hidden;
    if (changed) {
      // Scroll only the panel's contents. Scrolling the page can move a centered
      // profile out of the viewport, especially when highlighting two fields.
      for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (!['auto', 'scroll'].includes(getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
        const bounds = node.getBoundingClientRect(), panel = parent.getBoundingClientRect();
        const top = panel.top + parent.clientTop + 8, bottom = panel.top + parent.clientTop + parent.clientHeight - 8;
        if (bounds.top < top) parent.scrollTop += bounds.top - top;
        else if (bounds.bottom > bottom) parent.scrollTop += bounds.bottom - bottom;
        break;
      }
    }
    // A manual popover stays above native dialog backdrops. Attach it inside the
    // active modal so its Next/Exit controls remain interactive under modal inertness.
    const modal = [...document.querySelectorAll('dialog[open]')].at(-1);
    const parentNode = modal || document.body;
    if (overlay.parentElement !== parentNode) {
      if (overlay.matches(':popover-open')) overlay.hidePopover();
      parentNode.append(overlay);
    }
    overlay.hidden = false;
    if (!overlay.matches(':popover-open')) overlay.showPopover();
    overlay.dataset.target = def.id; overlay.dataset.phase = room.state.phase;
    document.body.classList.add('tutorial-spotlighting');
    const nodes = [...document.querySelectorAll(def.selector)];
    const raw = nodes.map(n => n.getBoundingClientRect());
    if (room.state.phase === 'health' && mapHealth) raw.push(mapHealth);
    const paddedRect = r => ({ x: Math.max(2, r.x - 5), y: Math.max(2, r.y - 5),
      right: Math.min(innerWidth - 2, r.x + r.width + 5), bottom: Math.min(innerHeight - 2, r.y + r.height + 5) });
    const rects = raw.map(paddedRect);
    const controls = [panelCloseButton(), room.state.phase === 'confirm' ? $('cancel') : null]
      .filter(n => n && !nodes.includes(n)).map(n => paddedRect(n.getBoundingClientRect()));
    const pathRect = r => `M${r.x} ${r.y}H${r.right}V${r.bottom}H${r.x}Z`;
    $('spotlight-shade').setAttribute('d', `M0 0H${innerWidth}V${innerHeight}H0Z ` + [...rects, ...controls].map(pathRect).join(' '));
    $('spotlight-svg').setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
    $('spotlight-rings').replaceChildren(...rects.map(r => {
      const ring = document.createElement('div'); ring.className = 'spotlight-ring';
      ring.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.right-r.x}px;height:${r.bottom-r.y}px`; return ring;
    }));
    $('spotlight-title').textContent = def.title;
    const detail = $('spotlight-detail'), detailKey = JSON.stringify([def.detail, def.emphasis]);
    if (detail.dataset.content !== detailKey) {
      detail.replaceChildren();
      const pattern = def.emphasis.find(text => def.detail.includes(text));
      if (pattern) {
        const index = def.detail.indexOf(pattern), strong = document.createElement('strong');
        strong.className = 'tutorial-emphasis'; strong.textContent = pattern;
        detail.append(def.detail.slice(0, index), strong, def.detail.slice(index + pattern.length));
      } else detail.textContent = def.detail;
      detail.dataset.content = detailKey;
    }
    $('spotlight-tip').hidden = !def.tip;
    if ($('spotlight-tip-text').textContent !== def.tip) $('spotlight-tip-text').textContent = def.tip;
    const next = $('spotlight-next'); next.hidden = !def.next;
    next.textContent = room.state.phase === 'health' ? '完成训练' : '下一步';
    next.disabled = room.state.phase === 'roster-search' && !($('search').value.trim() && document.querySelector('#roster-items [data-player="2"]'));
    const reference = $('spotlight-reference');
    reference.hidden = def.id !== 'target-colors';
    if (!reference.hidden && !reference.firstChild) {
      // Keep a copy of the actual published card so the comparison uses identical content and styling.
      const card = document.querySelector('#bad-slots .bad-slot')?.cloneNode(true);
      if (card) reference.append(card);
    }
    const placementRects = room.state.phase === 'confirm' && $('cancel')
      ? [...rects, paddedRect($('cancel').getBoundingClientRect())] : rects;
    const r = { x: Math.min(...placementRects.map(r => r.x)), y: Math.min(...placementRects.map(r => r.y)),
      right: Math.max(...placementRects.map(r => r.right)), bottom: Math.max(...placementRects.map(r => r.bottom)) }, gap = 16;
    const sideSpace = Math.max(r.x - gap - 12, innerWidth - r.right - gap - 12);
    const note = $('spotlight-note'), nw = Math.min(270, innerWidth - 24,
      def.id === 'target-colors' && sideSpace >= 200 ? sideSpace : 270);
    note.style.width = nw + 'px';
    const nh = note.offsetHeight;
    if (def.id === 'target-colors' && sideSpace < nw) {
      // Make room below the highlighted colors for the complete card on narrow screens.
      // Scroll the profile's contents while keeping both color fields visible.
      const panel = $('target'), panelTop = panel.getBoundingClientRect().top + panel.clientTop + 8;
      const desiredBottom = innerHeight - nh - 38;
      const shift = Math.min(r.bottom - desiredBottom, r.y - Math.max(12, panelTop));
      if (shift > 1) {
        const before = panel.scrollTop;
        panel.scrollTop += Math.ceil(shift);
        if (panel.scrollTop !== before) { updateSpotlight(view); return; }
      }
    }
    let x, y;
    if (r.right + gap + nw <= innerWidth - 12) { x = r.right + gap; y = Math.max(12, Math.min(innerHeight - nh - 12, (r.y + r.bottom - nh)/2)); }
    else if (r.x - gap - nw >= 12) { x = r.x - gap - nw; y = Math.max(12, Math.min(innerHeight - nh - 12, (r.y + r.bottom - nh)/2)); }
    else {
      x = Math.max(12, Math.min(innerWidth - nw - 12, (r.x + r.right - nw)/2));
      y = r.bottom + 26 + nh <= innerHeight - 12 ? r.bottom + 26 : Math.max(12, r.y - nh - 26);
    }
    // Keep two health highlights clear of the explanation as well.
    if (room.state.phase === 'health') { x = Math.max(12, (innerWidth-nw)/2); y = Math.max(12, innerHeight-nh-48); }
    y = Math.max(12, Math.min(innerHeight - nh - 12, y));
    note.style.left = x + 'px'; note.style.top = y + 'px';
    const key = def.id + '|' + room.state.phase;
    if (spotlightKey !== key) {
      spotlightKey = key;
      const focus = def.next ? (next.disabled ? node : next) : node.matches('button,input') ? node : node.querySelector('button');
      focus?.focus({ preventScroll: true });
    }
  }
  function observe(view) {
    const phase = room.state.phase;
    if (phase === 'mine-open' && view.mineOpen) room.event('mine-open');
    if (phase === 'mine-close' && !view.mineOpen) room.event('mine-close');
    if (phase === 'clues-open' && view.cluesOpen) room.readClues();
    if (phase === 'clues-close' && !view.cluesOpen) room.event('clues-close');
    if (phase === 'roster-open' && view.rosterOpen) room.event('roster-open');
    if (phase === 'roster-alpha' && view.selectedId === 2 && view.targetOpen) room.event('alpha-open');
    if (phase === 'accuse' && view.confirming) room.event('confirm-open');
    if (phase === 'confirm' && !view.confirming) room.event('cancel');
    if (phase === 'target-close' && !view.targetOpen) room.event('target-close');
    if (room.state.step === 6 && !$('logs').hidden) $('logs-toggle').click();
    if (room.state.step === 6 && !view.rosterOpen) $('roster-toggle').click();
    if (room.state.step === 7 && !completionShown) {
      completionShown = true; hideSpotlight(); $('training-complete').showModal(); $('training-complete-exit').focus();
    }
  }
  function start(progress) {
    completionShown = false; if ($('training-complete').open) $('training-complete').close(); hideSpotlight(); generation++; input = {}; elapsed = lastPush = 0; lastStep = -1; swingAt = 0;
    $('spotlight-reference').replaceChildren();
    room = T.create(progress, layout); searched = room.state.explored ? [desk.id] : []; logs = [];
    lastPublished = room.state.cluesPublished;
    active = true; bridge.reset();
    log('欢迎进入新手训练室，当前操作仅影响练习角色。');
    $('training-guide').classList.remove('is-collapsed'); $('tutorial-lesson-collapse').textContent = '−';
    push(); renderGuide(); $('office').focus({ preventScroll: true });
  }
  function exit() { input = {}; active = false; hideSpotlight(); if ($('training-complete').open) $('training-complete').close(); post('exit'); }
  function completeSearch(id) {
    if (!active || id !== desk.id) return { ok: false, status: 400, error: '请靠近身边高亮的书桌。' };
    const item = scene.furniture.find(f => f.id === id);
    if (W.distanceToEntity(room.state.player, item) > W.INTERACT_RANGE) return { ok: false, status: 400, error: '距离太远，请靠近后再搜索。' };
    if (!room.nearDesk() || room.state.step < 1) return { ok: false, status: 400, error: '先完成移动，再靠近身边高亮的书桌探索。' };
    room.explore(); searched = [...new Set([...searched, id])];
    log('探索书桌，获得 2 分练习积分。');
    const result = { ok: true, status: 200, mode: 'points', gainedPoints: 2, points: 2, score: room.state.player.score, exploration: exploration(), resultText: '获得 2 积分（练习）' };
    push(); renderGuide(); return result;
  }
  window.SID_PRACTICE = {
    boot(callbacks) {
      bridge = callbacks;
      document.body.classList.add('practice-game');
      $('stage').insertAdjacentHTML('beforeend', `<div class="tutorial-context"><strong>新手训练室</strong><small>独立练习角色</small><small class="context-copy">正式角色留在原位置，正常受击与计分</small><button id="room-exit" type="button">退出教程</button></div><aside id="training-guide" class="training-guide" aria-label="新手教程任务"><div class="lesson-heading"><span id="lesson-number"></span><small>仅练习数据</small><button id="tutorial-lesson-collapse" type="button" aria-label="折叠或展开教程提示">−</button></div><ol id="lesson-progress" aria-label="教程进度"></ol><div id="lesson-copy"><div aria-live="polite"><h2 id="lesson-title"></h2><p id="lesson-task"></p><p id="lesson-detail"></p></div><p id="lesson-tip" class="lesson-tip"></p><div class="lesson-actions"><button id="lesson-next" type="button" hidden>返回办公室</button><button id="lesson-restart" type="button">从头练习</button></div></div></aside>`);
      document.body.insertAdjacentHTML('beforeend', `<div id="tutorial-spotlight" popover="manual" hidden aria-label="教程操作引导"><svg id="spotlight-svg" aria-hidden="true"><path id="spotlight-shade" fill-rule="evenodd"/></svg><div id="spotlight-rings"></div><div id="spotlight-note" role="status"><strong id="spotlight-title"></strong><p id="spotlight-detail"></p><p id="spotlight-tip" hidden><span class="tutorial-tip-label">提示</span><strong id="spotlight-tip-text" class="tutorial-emphasis"></strong></p><div id="spotlight-reference" aria-label="系统公布的坏人01线索对照" hidden></div><button id="spotlight-next" type="button" hidden>下一步</button></div><button id="spotlight-exit" type="button">退出教程</button></div><dialog id="training-complete" class="center-dialog" aria-labelledby="training-complete-title"><div class="panel-heading"><h2 id="training-complete-title">恭喜您完成了新手训练营</h2></div><p>你已经学会移动、交互、查看信息、推理线索、搜索名单和使用技能。</p><p>正式角色的最新状态将在返回办公室时显示。</p><button id="training-complete-exit" type="button">返回办公室</button><button id="training-complete-restart" type="button">重新练习</button></dialog>`);
      $('stage').insertAdjacentHTML('beforeend', '<div id="movement-hint" hidden><strong>试着移动</strong><div class="movement-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>这几个按键可以移动人物</span></div>');
      $('spotlight-exit').onclick = exit; $('training-complete-exit').onclick = exit;
      $('training-complete-restart').onclick = () => start({ step: 0 });
      $('training-complete').addEventListener('cancel', event => { event.preventDefault(); exit(); });
      $('spotlight-next').onclick = () => {
        if (room.state.phase === 'roster-search') room.event('search'); else room.event('next');
        renderGuide(); updateSpotlight(lastView);
      };
      window.addEventListener('keydown', event => {
        if (active && event.key === 'Escape') {
          event.preventDefault(); event.stopImmediatePropagation();
          if (!event.repeat) escapePanel();
          return;
        }
        if ($('tutorial-spotlight').hidden) return;
        const def = spotlightDefinition(lastView), node = def && document.querySelector(def.selector);
        if (event.code === 'Tab') {
          const controls = [...new Set([node, panelCloseButton(), room.state.phase === 'confirm' ? $('cancel') : null, $('spotlight-next'), $('spotlight-exit')])].filter(n => n && !n.hidden && !n.disabled && n.matches('button,input'));
          const i = controls.indexOf(document.activeElement), offset = event.shiftKey ? -1 : 1;
          event.preventDefault(); event.stopImmediatePropagation(); controls[(i+offset+controls.length)%controls.length]?.focus({preventScroll:true}); return;
        }
        if (document.activeElement === $('search') && room.state.phase === 'roster-search') return;
        const allowed = { 'mine-open': 'KeyM', 'clues-open': 'KeyC', 'roster-open': 'KeyR' }[room.state.phase];
        if (!['Enter','Space',allowed].includes(event.code)) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      $('room-exit').onclick = exit; $('lesson-next').onclick = exit;
      $('lesson-restart').onclick = () => { start({ step: 0 }); post('restart'); };
      $('tutorial-lesson-collapse').onclick = () => {
        const collapsed = $('training-guide').classList.toggle('is-collapsed'); $('tutorial-lesson-collapse').textContent = collapsed ? '+' : '−';
        $('tutorial-lesson-collapse').setAttribute('aria-expanded', String(!collapsed));
      };
      $('annual-review-toggle').onclick = () => { log('退出教程后可查看年度纪念册。'); push(); };
      $('tutorial-entry').disabled = true;
      if (parent === window) start({ step: 0 }); else post('ready');
    },
    async request(path, body = {}) {
      if (!active) return { status: 400, ok: false, error: '练习已暂停。' };
      if (path === '/api/input') { input = { up: !!body?.up, down: !!body?.down, left: !!body?.left, right: !!body?.right }; return { ok: true, status: 200 }; }
      if (path === '/api/state') return { ...snapshot(), status: 200 };
      if (path === '/api/pending-players') return { ok: true, status: 200, groups: [], players: [], count: 0, roundId: 'tutorial-' + generation };
      if (path === '/api/search/start') return completeSearch(body.containerId);
      if (path === '/api/skill') {
        if (body.skill !== 'accuse' || ![2, 3].includes(body.targetId) || room.state.step !== 5 || room.state.phase !== 'confirm') return { status: 400, ok: false, error: '先查看身份与线索，再核对练习人物。' };
        room.accuse(people[body.targetId - 2].id); log(room.state.result); renderGuide();
        // Let the real confirmation UI finish before updating the shared snapshot.
        setTimeout(push, 0);
        return { ok: true, status: 200, serverTime: Date.now(), resultText: room.state.result, hp: room.state.player.hp, alive: true, score: room.state.player.score, skills: me().skills, accusedToday: [] };
      }
      if (path === '/api/attack') { swingAt = Date.now(); push(); return { ok: true, status: 200, combat: me().combat, resultText: '完成练习敲击', score: room.state.player.score }; }
      if (path === '/api/zone/exit') { exit(); return { ok: false, status: 400, error: '已退出教程。' }; }
      if (path === '/api/ack') return { ok: true, status: 200 };
      return { ok: false, status: 400, error: '这项功能可在返回正式对局后体验。' };
    },
    tick(dt, view) {
      if (!active) return;
      document.querySelector('.tutorial-context').style.top = `${Math.ceil(document.querySelector('.game-hud').getBoundingClientRect().bottom) + 8}px`;
      elapsed += dt;
      room.move(Number(input.right) - Number(input.left), Number(input.down) - Number(input.up), dt);
      room.tick(dt);
      if (room.state.cluesPublished && !lastPublished) { log('系统公布了坏人线索：上衣砖红、头发银白。', 'systemClue'); lastPublished = true; }
      lastView = view; observe(view);
      renderGuide(); updateSpotlight(view);
      const panelOpen = ['mine', 'target', 'roster', 'loot'].some(id => !$(id).hidden) || $('bad-pool-dialog').open;
      $('training-guide').classList.toggle('panel-active', panelOpen);
      if (elapsed - lastPush >= .05) { lastPush = elapsed; push(); }
    },
    drawOverlay(ctx, view) {
      mapHealth = view.healthBars.find(bar => bar.id === 2) || null;
      if (!active) return;
      drawCount++;
      const step = room.state.step;
      const hint = $('movement-hint');
      hint.hidden = step !== 0;
      const hintViewport = `${innerWidth}:${innerHeight}`;
      if (step === 0 && hint.dataset.viewport !== hintViewport) {
        const width = Math.min(210, innerWidth - 24);
        hint.style.width = width + 'px';
        hint.style.left = Math.max(12, Math.min(innerWidth - width - 12, innerWidth * .3 + 28)) + 'px';
        hint.style.top = Math.max(12, Math.min(innerHeight - hint.offsetHeight - 64, innerHeight * .62 - 90)) + 'px';
        hint.dataset.viewport = hintViewport;
      }
      if (step !== 1) return;
      ctx.save(); ctx.strokeStyle = '#ffe09a'; ctx.lineWidth = 2; ctx.fillStyle = '#f5d488';
      ctx.font = 'bold 11px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif'; ctx.textAlign = 'center';
      ctx.strokeRect(desk.x - 5, desk.y - 24, desk.w + 10, desk.h + 30);
      ctx.fillText('K 探索书桌', desk.x + desk.w / 2, desk.y - 34);
      ctx.restore();
    },
    cameraFor(viewW, viewH, scale, width, height) {
      // Anchor the room to its initial framing through movement and exploration.
      // Following the player, then switching cameras at step 1, makes the map jump.
      if (room.state.step < 6) return { x: layout.spawn.x - width * .3 / scale, y: layout.spawn.y - height * .62 / scale };
      if (room.state.step !== 6) return null;
      const rosterRight = $('roster').getBoundingClientRect().right;
      const screenX = Math.min(width-40, Math.max(width*.58,rosterRight+42));
      return { x: people[0].x - screenX/scale, y: people[0].y - height*.52/scale };
    },
    isActive: () => active,
    // Read-only diagnostic values for renderer and integration acceptance.
    inspect: () => ({ step: room.state.step, phase: room.state.phase, mapHealth, position: { x: room.state.player.x, y: room.state.player.y }, sceneId: scene.id, deskId: desk.id, drawCount, active })
  };
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'sid-tutorial:init' && bridge) start(event.data.progress);
    if (event.data?.type === 'sid-tutorial:escape' && active) escapePanel();
    if (event.data?.type === 'sid-tutorial:pause') { active = false; input = {}; hideSpotlight(); if ($('training-complete').open) $('training-complete').close(); }
  });
})();
