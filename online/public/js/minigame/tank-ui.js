'use strict';
// 坦克对决 —— 客户端面板（小游戏 v1）。
//
// 刻意做成**独立脚本**而不是塞进 game.js：小游戏是插件式能力，主循环不需要知道它。
// 数据全部来自服务端（/api/minigame/*），这里只负责渲染与提交动作。
(function () {
  const SID = window.SID = window.SID || {};
  let panel = null, btn = null, listEl = null, boardEl = null, logEl = null, statusEl = null;
  let pollTimer = 0, match = null, picking = true, mode = 'lobby', presetFoe = null;

  function token() {
    try { return sessionStorage.getItem('sid-session') || ''; } catch { return ''; }
  }
  async function call(path, body) {
    const opts = { credentials: 'same-origin', cache: 'no-store', headers: {} }; if (token()) opts.headers['X-Sid-Session'] = token();
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    return res.json().catch(() => ({}));
  }
  function say(text) { if (statusEl) statusEl.textContent = text || ''; }

  function build() {
    if (panel) return;
    btn = document.createElement('button');
    btn.id = 'minigame-toggle';
    btn.type = 'button';
    btn.className = 'minigame-toggle';
    btn.textContent = '🎮 小游戏';
    btn.onclick = open;
    const host = document.getElementById('map-view') || document.body;
    host.appendChild(btn);

    panel = document.createElement('section');
    panel.id = 'minigame-panel';
    panel.className = 'minigame-panel';
    panel.hidden = true;
    panel.setAttribute('aria-label', '小游戏');
    panel.innerHTML =
      '<div class="mg-head"><div><small>MINIGAMES</small><h2 id="mg-title">小游戏</h2></div>'
      + '<button id="mg-close" class="mg-close" type="button" aria-label="关闭">×</button></div>'
      + '<div id="mg-pick" class="mg-pick"></div>'
      + '<div id="mg-board" class="mg-board" hidden></div>'
      + '<p id="mg-status" class="mg-status"></p>'
      + '<ol id="mg-log" class="mg-log"></ol>'
      + '<div class="mg-actions" id="mg-actions" hidden>'
      + '<button type="button" data-act="fire">开火</button>'
      + '<button type="button" data-act="load">装填</button>'
      + '<button type="button" data-act="dodge">闪避</button>'
      + '</div>';
    host.appendChild(panel);

    listEl = panel.querySelector('#mg-pick');
    boardEl = panel.querySelector('#mg-board');
    logEl = panel.querySelector('#mg-log');
    statusEl = panel.querySelector('#mg-status');
    panel.querySelector('#mg-close').onclick = close;
    panel.querySelectorAll('#mg-actions button').forEach(b => {
      b.onclick = () => act(b.dataset.act);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
  }

  async function open(opts) {
    build();
    opts = opts || {};
    mode = opts.arcade ? 'arcade' : (opts.opponentId != null ? 'direct' : 'lobby');
    presetFoe = opts.opponentId != null ? Number(opts.opponentId) : null;
    panel.hidden = false;
    picking = true;
    say('正在载入…');
    await refresh();
    if (mode === 'direct' && presetFoe != null) await startWith(presetFoe);
    pollTimer = setInterval(refresh, 1200);
  }
  async function startWith(foeId) {
    const res = await call('/api/minigame/start', { game: 'tank', opponentId: foeId, viaArcade: mode === 'arcade' });
    if (!res.ok) { say(res.error || '开局失败'); return; }
    match = res.match; renderBoard();
  }
  function close() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
    if (panel) panel.hidden = true;
    match = null;
  }

  async function refresh() {
    const st = await call('/api/minigame/state');
    if (!st || st.ok !== true) { say((st && st.error) || '状态不可用'); return; }
    match = st.match;
    if (match) renderBoard();
    else await renderPicker(st.enabled || [], st.foes || []);
  }

  async function renderPicker(enabled, foes) {
    picking = true;
    boardEl.hidden = true;
    panel.querySelector('#mg-actions').hidden = true;
    const hasTank = enabled.indexOf('tank') >= 0;
    const others = foes || [];
    listEl.replaceChildren();
    listEl.hidden = false;
    const title = document.createElement('p');
    title.className = 'mg-note';
    title.textContent = hasTank
      ? (others.length ? (mode === 'arcade' ? '楼层游戏机：可跨楼层挑战，先打掉对方 3 点装甲者胜。' : '选一名同层玩家开始「坦克对决」：先打掉对方 3 点装甲者胜。') : (mode === 'arcade' ? '整栋楼现在没有其他在线玩家。' : '同层没有其他玩家，去楼层游戏机可以跨楼层匹配。'))
      : '当前没有开放的小游戏。等管理员开放后再来。';
    listEl.appendChild(title);
    if (!hasTank) return;
    for (const p of others) {
      const row = document.createElement('button');
      row.type = 'button'; row.className = 'mg-foe';
      row.textContent = p.name + (mode === 'arcade' && p.floorId ? '　' + p.floorId + 'F' : '');
      row.onclick = () => startWith(p.id);
      listEl.appendChild(row);
    }
  }

  function renderBoard() {
    picking = false;
    listEl.hidden = true;
    boardEl.hidden = false;
    panel.querySelector('#mg-actions').hidden = !!match.finished;
    const hp = n => '▮'.repeat(Math.max(0, n)) + '▯'.repeat(Math.max(0, 3 - n));
    boardEl.innerHTML =
      '<div class="mg-side"><small>你</small><strong>' + (match.self.name || '你') + '</strong>'
      + '<span class="mg-hp">' + hp(match.self.hp) + '</span>'
      + '<span class="mg-ammo">弹药 ' + match.self.ammo + '</span></div>'
      + '<div class="mg-vs">VS<br><small>第 ' + match.round + ' 回合</small></div>'
      + '<div class="mg-side foe"><small>对手</small><strong>' + (match.foe.name || '对手') + '</strong>'
      + '<span class="mg-hp">' + hp(match.foe.hp) + '</span></div>';
    if (match.finished) {
      say(match.winnerId === match.self.id ? '你赢了！' : (match.winnerId === null ? '平局' : '你输了'));
    } else if (match.picked) {
      say('已出招，等对手…');
    } else {
      say('选一个动作（开火需要弹药）');
    }
    logEl.replaceChildren();
    for (const line of (match.log || []).slice(-6)) {
      const li = document.createElement('li'); li.textContent = line; logEl.appendChild(li);
    }
  }

  async function act(action) {
    if (!match || match.finished) return;
    const res = await call('/api/minigame/act', { action });
    if (!res.ok) { say(res.error || '出招失败'); return; }
    match = res.match; renderBoard();
  }

  build();
  SID.minigame = { open, close, get match() { return match; }, get mode() { return mode; } };
})();
