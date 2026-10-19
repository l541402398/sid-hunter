'use strict';
// 卡牌对决（spire）客户端面板：与坦克一样是独立插件脚本，不侵入主循环。
// 数据全部以服务端为准（/api/minigame/*），这里只负责渲染与提交。
(function () {
  const SID = window.SID = window.SID || {};
  let panel = null, btn = null, host = null, statusEl = null, logEl = null, poll = 0, view = null;

  function token() { try { return sessionStorage.getItem('sid-session') || ''; } catch { return ''; } }
  async function call(path, body) {
    const opts = { credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (token()) opts.headers['X-Sid-Session'] = token();
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    return res.json().catch(() => ({}));
  }
  function say(t) { if (statusEl) statusEl.textContent = t || ''; }

  function build() {
    if (panel) return;
    btn = document.createElement('button');
    btn.id = 'spire-toggle';
    btn.type = 'button';
    btn.className = 'minigame-toggle spire-toggle';
    btn.textContent = '🃏 卡牌';
    btn.onclick = open;
    (document.getElementById('map-view') || document.body).appendChild(btn);

    panel = document.createElement('section');
    panel.id = 'spire-panel';
    panel.className = 'minigame-panel spire-panel';
    panel.hidden = true;
    panel.innerHTML =
      '<div class="mg-head"><div><small>SPIRE</small><h2>卡牌对决</h2></div>'
      + '<button id="spire-close" class="mg-close" type="button" aria-label="关闭">×</button></div>'
      + '<div id="spire-board" class="spire-board"></div>'
      + '<div id="spire-hand" class="spire-hand"></div>'
      + '<p id="spire-status" class="mg-status"></p>'
      + '<ol id="spire-log" class="mg-log"></ol>'
      + '<div class="mg-actions"><button type="button" id="spire-end">结束回合</button></div>';
    (document.getElementById('map-view') || document.body).appendChild(panel);
    host = panel.querySelector('#spire-board');
    statusEl = panel.querySelector('#spire-status');
    logEl = panel.querySelector('#spire-log');
    panel.querySelector('#spire-close').onclick = close;
    panel.querySelector('#spire-end').onclick = () => act({ action: 'end' });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && panel && !panel.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
  }

  async function open() {
    build();
    panel.hidden = false;
    say('正在载入…');
    const st = await call('/api/minigame/state');
    if (st && st.spire) { view = st.spire; render(); }
    else {
      const res = await call('/api/minigame/start', { game: 'spire' });
      if (!res.ok) { say(res.error || '开局失败'); return; }
      view = res.spire; render();
    }
    poll = setInterval(refresh, 1500);
  }
  function close() { if (poll) { clearInterval(poll); poll = 0; } if (panel) panel.hidden = true; }
  async function refresh() {
    const st = await call('/api/minigame/state');
    if (st && st.spire) { view = st.spire; render(); }
  }
  async function act(payload) {
    const res = await call('/api/minigame/act', payload);
    if (!res.ok) { say(res.error || '操作失败'); return; }
    view = res.spire; render();
  }

  function render() {
    if (!view) return;
    const e = view.enemy;
    host.innerHTML =
      '<div class="spire-enemy"><small>第 ' + (view.stage + 1) + ' 关</small><strong>' + (e ? e.name : '—') + '</strong>'
      + '<span class="spire-hp">' + (e ? e.hp + ' / ' + e.maxHp : '已击破') + '</span>'
      + (e && e.bleed ? '<span class="spire-tag">流血 ' + e.bleed + '</span>' : '') + '</div>'
      + '<div class="spire-self"><span>生命 ' + view.hp + ' / ' + view.maxHp + '</span>'
      + '<span>格挡 ' + view.block + '</span><span>能量 ' + view.energy + '</span>'
      + '<span>牌库 ' + view.deckLeft + '</span><span>弃牌 ' + view.discardLeft + '</span></div>';
    const hand = panel.querySelector('#spire-hand');
    hand.replaceChildren();
    (view.hand || []).forEach(card => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'spire-card type-' + card.type + (card.cost > view.energy ? ' costly' : '');
      b.innerHTML = '<span class="cost">' + card.cost + '</span><strong>' + card.name + '</strong><small>' + card.desc + '</small>';
      b.disabled = view.finished;
      b.onclick = () => act({ action: 'play', index: card.index });
      hand.appendChild(b);
    });
    logEl.replaceChildren();
    (view.log || []).slice(-5).forEach(line => {
      const li = document.createElement('li'); li.textContent = line; logEl.appendChild(li);
    });
    if (view.finished) say(view.won ? '三关全破，你赢了！' : '你倒下了');
    else say('点击手牌出牌，或结束回合');
    panel.querySelector('#spire-end').disabled = view.finished;
  }

  build();
  SID.spire = { open, close, get view() { return view; } };
})();
