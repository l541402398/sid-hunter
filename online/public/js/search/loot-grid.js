'use strict';
// 搜打撤式物品格面板（需求③）。
//
// 交互模型（对齐《三角洲行动》一类搜打撤）：
//   1) 对着容器按 K → 弹出 N×M 物品格，全部盖着；
//   2) 点「开始搜索」→ 服务端开一次会话，格子**逐格**翻开（每格之间有服务端强制的最小间隔）；
//   3) 全部翻完后「全部拾取」，物品进背包、筹码直接入账，容器标记为已搜索。
//
// 之所以"逐格"而不是一次开完：服务端只在 reveal 请求里下发当前格内容，
// 客户端在拿到结果之前连"这格是不是空的"都不知道，无法挑肥拣瘦。
//
// 本文件只做表现；所有判定、掷骰与记账都在 online/room/index.js。
(function (root) {
  const SID = root.SID = root.SID || {};
  const ICONS = SID.lootIcons;

  let host = null, els = null, state = null;

  function el(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function rarityClass(r) { return 'r-' + String(r || 'common'); }

  function ensure() {
    if (host) return;
    host = el('loot');
    if (!host) return;
    els = {
      title: el('loot-title'),
      grid: el('loot-grid'),
      status: el('loot-status'),
      bar: el('loot-bar'),
      start: el('loot-start'),
      take: el('loot-take'),
      close: el('loot-close'),
      summary: el('loot-summary'),
      meta: el('loot-meta')
    };
    els.close.onclick = () => close();
    els.start.onclick = () => beginSearch();
    els.take.onclick = () => takeAll();
    // 按钮上标出快捷键：面板开着时再按一次 K 等同点这个按钮（K 先「开始搜索」，翻完后「全部拾取」）。
    els.start.textContent = '开始搜索(K)';
    els.take.textContent = '全部拾取(K)';
  }

  function open(options) {
    ensure();
    if (!host) return;
    close(true);
    ensure();
    state = {
      containerId: options.containerId,
      containerName: options.containerName || '容器',
      api: options.api,
      floorFields: options.floorFields,
      commandId: options.commandId,
      onResult: options.onResult || (() => {}),
      toast: options.toast || (() => {}),
      session: null,
      cells: [],
      busy: false,
      done: false,
      timer: 0
    };
    host.hidden = false;
    els.title.textContent = state.containerName;
    els.grid.replaceChildren();
    els.grid.hidden = true;
    els.summary.hidden = true;
    els.summary.textContent = '';
    els.start.hidden = false;
    els.start.disabled = false;
    els.take.hidden = true;
    els.take.disabled = true;
    els.bar.style.width = '0%';
    els.meta.textContent = '每个容器每人只能搜一次 · 结果由服务端结算';
    els.status.textContent = '把耳朵贴到柜门上——点「开始搜索」逐格翻找。';
  }

  function close(silent) {
    if (!host) return;
    if (state && state.timer) { clearTimeout(state.timer); state.timer = 0; }
    host.hidden = true;
    state = null;
    if (!silent && SID.lootGrid.onClose) SID.lootGrid.onClose();
  }
  function isOpen() { return !!(host && !host.hidden); }

  // K 键复用入口：面板开着时再按一次 K。
  // 优先级与按钮一致：还没开始 → 「开始搜索」；格子翻完 → 「全部拾取」；翻找中 → 什么都不做
  // （翻找中把面板关掉就看不到进度了）。返回 true 表示这次按键已被消费。
  function pressPrimary() {
    if (!state || !els) return false;
    if (!state.session) {
      if (!els.start.hidden && !els.start.disabled) { beginSearch(); return true; }
      return false;
    }
    if (!els.take.hidden && !els.take.disabled) { takeAll(); return true; }
    return true;
  }

  function buildGrid(session) {
    els.grid.replaceChildren();
    els.grid.hidden = false;
    els.grid.style.setProperty('--cols', String(session.cols));
    state.cells = [];
    for (let i = 0; i < session.slotCount; i++) {
      const cell = h('div', 'loot-cell is-hidden');
      cell.dataset.i = String(i);
      const inner = h('div', 'loot-cell-inner');
      const q = h('span', 'loot-q', '?');
      const icon = document.createElement('canvas');
      icon.className = 'loot-icon';
      icon.width = 32; icon.height = 32;
      icon.hidden = true;
      const name = h('span', 'loot-name', '');
      const badge = h('span', 'loot-badge', '');
      inner.append(q, icon, name, badge);
      cell.append(inner);
      els.grid.append(cell);
      state.cells.push({ cell, inner, q, icon, name, badge, revealed: false });
    }
  }

  function paintCell(index, content) {
    const c = state.cells[index];
    if (!c) return;
    c.revealed = true;
    c.cell.classList.remove('is-hidden');
    c.cell.classList.add('is-revealing');
    c.q.hidden = true;
    setTimeout(() => c.cell.classList.remove('is-revealing'), 260);
    if (!content || content.kind === 'empty') {
      c.cell.classList.add('is-empty');
      c.name.textContent = '空';
      return;
    }
    c.cell.classList.add(rarityClass(content.rarity));
    if (ICONS && content.icon) {
      const sp = ICONS.sprite(content.icon, 32, content.art);
      const g = c.icon.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 32, 32);
      g.drawImage(sp, 0, 0);
      c.icon.hidden = false;
    }
    c.name.textContent = content.label || '';
    if (content.kind === 'chips') c.badge.textContent = '+' + content.amount;
    else if (content.value > 0) c.badge.textContent = '+' + content.value;
    c.cell.title = content.desc ? `${content.label}：${content.desc}` : (content.label || '');
  }

  function updateProgress() {
    if (!state || !state.session) return;
    const s = state.session;
    const pct = Math.round((s.revealed / s.slotCount) * 100);
    els.bar.style.width = pct + '%';
    els.status.textContent = s.revealed >= s.slotCount
      ? '搜索完毕，点「全部拾取」收进背包。'
      : `正在翻找… ${s.revealed} / ${s.slotCount}`;
    if (s.revealed >= s.slotCount) {
      els.start.hidden = true;
      els.take.hidden = false;
      els.take.disabled = false;
      els.take.classList.add('is-ready');
    }
  }

  async function beginSearch() {
    if (!state || state.busy) return;
    state.busy = true;
    els.start.disabled = true;
    els.status.textContent = '正在打开容器…';
    try {
      const r = await state.api('/api/search/start', {
        containerId: state.containerId, commandId: state.commandId(), ...state.floorFields()
      });
      if (!state) return;
      if (r.status !== 200 || !r.ok || !r.session) {
        els.status.textContent = r.error || '容器打不开，请靠近后再试。';
        els.start.hidden = true;
        return;
      }
      state.session = r.session;
      buildGrid(r.session);
      els.start.hidden = true;
      // 复用的旧会话：把已经揭示过的格子补回画面（同一玩家自己看过的内容，不泄露新信息）。
      const already = Array.isArray(r.session.revealedContent) ? r.session.revealedContent : [];
      for (let i = 0; i < already.length; i++) paintCell(i, already[i]);
      updateProgress();
      if (r.session.revealed < r.session.slotCount) scheduleReveal(240);
    } catch {
      if (state) els.status.textContent = '网络异常，搜索没有开始。';
    } finally {
      if (state) state.busy = false;
    }
  }

  function scheduleReveal(delay) {
    if (!state) return;
    if (state.timer) clearTimeout(state.timer);
    state.timer = setTimeout(revealNext, Math.max(60, delay));
  }

  async function revealNext() {
    if (!state || !state.session) return;
    state.timer = 0;
    const s = state.session;
    try {
      const r = await state.api('/api/search/reveal', { sessionId: s.id, ...state.floorFields() });
      if (!state || !state.session) return;
      if (r.status !== 200 || !r.ok) {
        // 服务端节流（仍在间隔内）→ 稍后重试；其它错误直接停在这里，面板保持可关闭。
        if (r.error && r.error.indexOf('搜索进行中') >= 0) { scheduleReveal(140); return; }
        els.status.textContent = r.error || '搜索中断，请关闭后重试。';
        return;
      }
      state.session = r.session || s;
      state.session.revealedContent = (s.revealedContent || []).concat([r.content]);
      paintCell(r.index, r.content);
      updateProgress();
      if (state.session.revealed < state.session.slotCount) {
        scheduleReveal((state.session.revealDelayMs || 460) + 40);
      }
    } catch {
      if (state) scheduleReveal(600);
    }
  }

  async function takeAll() {
    if (!state || !state.session || state.busy) return;
    state.busy = true;
    els.take.disabled = true;
    els.status.textContent = '正在装进背包…';
    try {
      const r = await state.api('/api/search/take', { sessionId: state.session.id, ...state.floorFields() });
      if (!state) return;
      if (r.status !== 200 || !r.ok) {
        els.status.textContent = r.error || '拾取失败。';
        els.take.disabled = false;
        return;
      }
      els.take.hidden = true;
      els.status.textContent = r.resultText || '搜索完成。';
      const gained = r.gained || { chips: 0, items: [], clues: 0 };
      els.summary.hidden = false;
      els.summary.replaceChildren();
      const head = h('div', 'loot-summary-head');
      head.append(h('strong', '', '收获清单'));
      if (gained.chips) head.append(h('span', 'loot-sum-chip', '+' + gained.chips + ' 筹码'));
      if (gained.clues) head.append(h('span', 'loot-sum-clue', '+' + gained.clues + ' 线索'));
      els.summary.append(head);
      const list = h('div', 'loot-sum-items');
      const items = Array.isArray(gained.items) ? gained.items : [];
      if (!items.length) list.append(h('span', 'loot-sum-empty', '没有值得带走的物品'));
      for (const it of items) {
        const row = h('span', 'loot-sum-item ' + rarityClass(it.rarity));
        if (ICONS && it.icon !== undefined) { /* 图标在格子里已展示，清单只列名字 */ }
        row.append(h('i', 'dot'), document.createTextNode(`${it.label}${it.value ? ` · ${it.value}` : ''}`));
        list.append(row);
      }
      els.summary.append(list);
      state.done = true;
      if (state.onResult) state.onResult(r.exploration, r.score, r.backpack);
    } catch {
      if (state) { els.status.textContent = '网络异常，拾取结果未确认。'; els.take.disabled = false; }
    } finally {
      if (state) state.busy = false;
    }
  }

  // Esc：优先关面板（与其它私密面板一致）。
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  SID.lootGrid = { open, close, isOpen, pressPrimary, onClose: null };
})(window);
