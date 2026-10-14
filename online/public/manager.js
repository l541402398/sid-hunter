'use strict';
/* S-ID 管理控制台前端：授权码登录、当前对局状态、上局结算排名、开始下一局。
   原生 ES2020，无依赖、无构建；所有动态文本一律走 textContent，不用 innerHTML 拼接数据。 */
(() => {
  const CSRF_KEY = 'sidManagerCsrf';
  const POLL_MS = 5000;
  const TOAST_MS = 3600;

  const $ = (id) => document.getElementById(id);

  const el = {
    loginCard: $('manager-login-card'),
    loginForm: $('manager-login-form'),
    loginButton: $('manager-login'),
    code: $('manager-code'),
    loginError: $('manager-login-error'),
    app: $('manager-app'),
    logout: $('manager-logout'),
    stateDot: $('manager-state-dot'),
    stateText: $('manager-state'),
    alive: $('manager-alive'),
    players: $('manager-players'),
    teams: $('manager-teams'),
    resultReason: $('manager-result-reason'),
    resultMeta: $('manager-result-meta'),
    ranking: $('manager-ranking'),
    start: $('manager-start'),
    actionNote: $('manager-action-note'),
    confirm: $('manager-confirm'),
    confirmCancel: $('manager-confirm-cancel'),
    confirmAccept: $('manager-confirm-accept'),
    toast: $('manager-toast'),
    tick: $('manager-tick'),
  };

  let authed = false;
  let pollTimer = null;
  let stateInFlight = false;
  let toastTimer = null;
  let lastStateSig = '';
  let confirmOpen = false;

  /* ---------- 工具 ---------- */

  function finishReasonText(reason) {
    return reason === 'aliveFloor' ? '存活人数已淘汰至剩余 100 人'
      : reason === 'badWiped' ? '坏人全灭'
        : reason === 'timeUp' ? '时间到（2 小时）'
          : reason === 'host' ? '主持人结束了游戏'
            : typeof reason === 'string' && reason ? '游戏已结束' : '游戏已结束（原因未知）';
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return '—';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '—';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds());
  }

  function dash(value) { return value === null || value === undefined || value === '' ? '—' : value; }

  function scoreText(score) {
    if (score === null || score === undefined || score === '') return '—';
    const n = Number(score);
    return Number.isFinite(n) ? String(n) : '—';
  }

  function factionText(faction) {
    return faction === 'good' ? '好人' : faction === 'bad' ? '坏人' : '—';
  }

  function aliveText(alive) {
    return alive === true ? '存活' : alive === false ? '淘汰' : '—';
  }

  function apiErrorText(data, res, fallback) {
    if (data && typeof data.error === 'string' && data.error) {
      if (res.status === 429 && Number.isFinite(Number(data.retryAfterMs))) {
        const secs = Math.max(1, Math.ceil(Number(data.retryAfterMs) / 1000));
        return data.error + '（约 ' + secs + ' 秒后可重试）';
      }
      return data.error;
    }
    if (res.status === 401) return '授权码错误';
    if (res.status === 429) return '尝试过于频繁，请稍后再试';
    if (res.status >= 500) return '服务端错误，请稍后重试';
    return fallback;
  }

  async function api(path, options) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options || {}));
    let data = null;
    let text = '';
    try { text = await res.text(); } catch (_) { text = ''; }
    if (text) { try { data = JSON.parse(text); } catch (_) { data = null; } }
    return { res: res, data: data };
  }

  function storeCsrf(token) {
    try { if (typeof token === 'string' && token) sessionStorage.setItem(CSRF_KEY, token); } catch (_) { /* 隐私模式忽略 */ }
  }
  function readCsrf() {
    try { return sessionStorage.getItem(CSRF_KEY) || ''; } catch (_) { return ''; }
  }
  function clearCsrf() {
    try { sessionStorage.removeItem(CSRF_KEY); } catch (_) { /* 忽略 */ }
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      if (!button.dataset.idleText) button.dataset.idleText = button.textContent;
      button.disabled = true;
      if (busyText) button.textContent = busyText;
    } else {
      button.disabled = false;
      if (busyText === undefined && button.dataset.idleText) button.textContent = button.dataset.idleText;
    }
  }

  function toast(message, kind) {
    if (!el.toast || !message) return;
    el.toast.textContent = message;
    el.toast.className = 'manager-toast' + (kind === 'ok' ? ' is-ok' : kind === 'error' ? ' is-error' : '');
    el.toast.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, TOAST_MS);
  }

  function tick(text) { if (el.tick) el.tick.textContent = text; }

  /* ---------- 视图切换 ---------- */

  function showLogin() {
    if (el.loginCard) el.loginCard.hidden = false;
    if (el.app) el.app.hidden = true;
  }

  function showApp() {
    if (el.loginCard) el.loginCard.hidden = true;
    if (el.app) el.app.hidden = false;
    if (el.loginError) el.loginError.textContent = '';
  }

  function setLoginError(message) {
    if (el.loginError) el.loginError.textContent = message || '';
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(() => { loadState(); }, POLL_MS);
  }

  function resetToLogin(message) {
    authed = false;
    stopPolling();
    clearCsrf();
    lastStateSig = '';
    showLogin();
    if (message) setLoginError(message);
    tick('每 5 秒自动刷新');
  }

  function handleExpired() {
    resetToLogin('登录状态已失效，请重新输入授权码');
    toast('登录状态已失效，请重新登录', 'error');
  }

  /* ---------- 渲染：当前对局状态 ---------- */

  function renderTeams(teams) {
    if (!el.teams) return;
    el.teams.replaceChildren();
    if (!Array.isArray(teams) || !teams.length) { el.teams.hidden = true; return; }
    const MAX_CHIPS = 12;
    for (const team of teams.slice(0, MAX_CHIPS)) {
      if (!team || typeof team !== 'object') continue;
      const chip = document.createElement('span');
      chip.className = 'manager-team';
      const name = document.createElement('span');
      name.textContent = typeof team.name === 'string' && team.name ? team.name : dash(team.id);
      const alive = document.createElement('strong');
      alive.textContent = team.alive === true ? '存活' : team.alive === false ? '淘汰' : '存活 —';
      const score = document.createElement('strong');
      score.textContent = scoreText(team.score) + ' 分';
      chip.append(name, alive, score);
      el.teams.appendChild(chip);
    }
    if (teams.length > MAX_CHIPS) {
      const more = document.createElement('span');
      more.className = 'manager-team manager-team-more';
      more.textContent = '另有 ' + (teams.length - MAX_CHIPS) + ' 人';
      el.teams.appendChild(more);
    }
    el.teams.hidden = false;
  }

  function renderState(data) {
    const current = (data && data.current && typeof data.current === 'object') ? data.current : {};
    const finished = current.finished === true;
    if (el.stateText) el.stateText.textContent = finished ? '已结束 · ' + finishReasonText(current.finishReason) : '进行中';
    if (el.stateDot) el.stateDot.className = 'dot ' + (finished ? 'gray' : 'green');
    if (el.alive) el.alive.textContent = current.aliveCount === null || current.aliveCount === undefined ? '—' : String(current.aliveCount);
    if (el.players) el.players.textContent = current.playerCount === null || current.playerCount === undefined ? '—' : String(current.playerCount);
    renderTeams(data && data.teams);
    renderResult(data ? data.lastResult : null);
  }

  /* ---------- 渲染：上局结算排名 ---------- */

  function emptyRow(message) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'manager-table-empty';
    td.colSpan = 5;
    td.textContent = message;
    tr.appendChild(td);
    return tr;
  }

  function cell(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }

  function buildRow(entry, index, unranked) {
    const item = (entry && typeof entry === 'object') ? entry : {};
    const rank = unranked ? '✓' : (item.rank === null || item.rank === undefined ? String(index + 1) : String(item.rank));
    const name = typeof item.name === 'string' && item.name ? item.name : '玩家';
    const tr = document.createElement('tr');
    tr.appendChild(cell(rank, 'manager-col-rank'));
    tr.appendChild(cell(name, 'manager-col-name'));
    tr.appendChild(cell(scoreText(item.score), 'manager-col-score'));
    tr.appendChild(cell(aliveText(item.alive), 'manager-col-alive'
      + (item.alive === true ? ' is-alive' : item.alive === false ? ' is-out' : '')));
    tr.appendChild(cell(factionText(item.faction), 'manager-col-faction'));
    return tr;
  }

  function renderResult(last) {
    if (!el.ranking) return;
    el.ranking.replaceChildren();

    if (!last || typeof last !== 'object') {
      if (el.resultReason) el.resultReason.textContent = '本局尚未结束，暂无排名';
      if (el.resultMeta) el.resultMeta.textContent = '';
      el.ranking.appendChild(emptyRow('本局尚未结束，暂无排名。'));
      return;
    }

    const ranked = last.ranked !== false;
    const reason = finishReasonText(last.finishReason);
    if (el.resultReason) {
      el.resultReason.textContent = ranked
        ? '结束方式：' + reason
        : '结束方式：' + reason + ' · 该结束方式不按分数排名，仅列出存活玩家';
    }

    const meta = [];
    if (last.finishedAt !== null && last.finishedAt !== undefined && last.finishedAt !== '') meta.push('结束时间 ' + formatTime(last.finishedAt));
    if (last.playerCount !== null && last.playerCount !== undefined && last.playerCount !== '') meta.push('结算人数 ' + last.playerCount);
    if (el.resultMeta) el.resultMeta.textContent = meta.join(' · ');

    let rows = Array.isArray(last.ranking) ? last.ranking.filter((e) => e && typeof e === 'object') : [];
    if (!ranked) {
      rows = rows.length
        ? rows.filter((e) => e.alive !== false)
        // 兼容服务端在 ranking=null 时额外给出的存活名单快照（契约外的可选字段）。
        : (Array.isArray(last.survivors) ? last.survivors.filter((e) => e && typeof e === 'object') : []);
    }

    if (!rows.length) {
      el.ranking.appendChild(emptyRow(ranked ? '暂无排名数据。' : '没有存活玩家。'));
      return;
    }
    rows.forEach((entry, index) => el.ranking.appendChild(buildRow(entry, index, !ranked)));
  }

  /* ---------- 数据加载 ---------- */

  async function loadState() {
    if (!authed || stateInFlight) return;
    stateInFlight = true;
    try {
      const { res, data } = await api('/api/manager/state');
      if (res.status === 401) { handleExpired(); return; }
      if (!res.ok || !data || typeof data !== 'object') { tick('状态刷新失败（HTTP ' + res.status + '）'); return; }
      const sig = JSON.stringify([data.current, data.lastResult, data.teams]);
      if (sig !== lastStateSig) { lastStateSig = sig; renderState(data); }
      tick('最近刷新 ' + formatTime(Date.now()));
    } catch (_) {
      tick('网络异常，稍后自动重试');
    } finally {
      stateInFlight = false;
    }
  }

  async function checkSession() {
    try {
      const { res, data } = await api('/api/manager/session');
      if (res.ok && data && typeof data === 'object' && data.authed === true) {
        storeCsrf(data.csrfToken);
        authed = true;
        showApp();
        startPolling();
        await loadState();
        return;
      }
      showLogin();
      if (!res.ok && res.status !== 401) setLoginError('会话校验失败（HTTP ' + res.status + '）');
    } catch (_) {
      showLogin();
      setLoginError('无法连接服务端，请检查网络后重试');
    }
  }

  async function ensureCsrf() {
    const stored = readCsrf();
    if (stored) return stored;
    try {
      const { res, data } = await api('/api/manager/session');
      if (res.ok && data && typeof data === 'object' && data.authed === true) {
        storeCsrf(data.csrfToken);
        return readCsrf();
      }
    } catch (_) { /* 交给调用方处理 */ }
    return '';
  }

  /* ---------- 交互 ---------- */

  async function handleLogin(event) {
    if (event) event.preventDefault();
    const code = el.code ? el.code.value : '';
    if (!code) { setLoginError('请输入管理员授权码'); if (el.code) el.code.focus(); return; }
    setLoginError('');
    setBusy(el.loginButton, true, '验证中…');
    try {
      const { res, data } = await api('/api/manager/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code }),
      });
      if (res.ok && data && data.ok === true && typeof data.csrfToken === 'string' && data.csrfToken) {
        storeCsrf(data.csrfToken);
        if (el.code) el.code.value = '';
        authed = true;
        showApp();
        lastStateSig = '';
        startPolling();
        await loadState();
        toast('已进入管理控制台', 'ok');
      } else {
        setLoginError(apiErrorText(data, res, '登录失败，请稍后重试'));
      }
    } catch (_) {
      setLoginError('网络异常，请稍后重试');
    } finally {
      setBusy(el.loginButton, false);
    }
  }

  async function handleLogout() {
    stopPolling();
    try {
      await api('/api/manager/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch (_) { /* 即使请求失败也回到登录卡片 */ }
    resetToLogin('');
    if (el.code) el.code.value = '';
    toast('已退出控制台', 'ok');
  }

  function openConfirm() {
    if (!el.confirm || confirmOpen) return;
    confirmOpen = true;
    if (typeof el.confirm.showModal === 'function') {
      try { el.confirm.showModal(); return; } catch (_) { /* 回退到 open 属性 */ }
    }
    el.confirm.setAttribute('open', '');
  }

  function closeConfirm() {
    if (!el.confirm) return;
    confirmOpen = false;
    if (typeof el.confirm.close === 'function') {
      try { el.confirm.close(); return; } catch (_) { /* 回退 */ }
    }
    el.confirm.removeAttribute('open');
  }

  async function handleReset() {
    closeConfirm();
    setBusy(el.start, true, '正在重开…');
    if (el.actionNote) el.actionNote.textContent = '正在清空本局并开始下一局…';
    try {
      const csrf = await ensureCsrf();
      if (!csrf) { handleExpired(); return; }
      const { res, data } = await api('/api/manager/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, csrfToken: csrf }),
      });
      if (res.status === 401) { handleExpired(); return; }
      if (res.ok && data && data.ok === true && data.reset === true) {
        // 重开后排名的 id 已不属于新局，必须用响应里的 lastResult 渲染。
        lastStateSig = '';
        renderState({
          current: { finished: false, finishReason: null, aliveCount: 0, playerCount: 0, startedAt: data.startedAt || null },
          lastResult: data.lastResult === undefined ? null : data.lastResult,
          teams: [],
        });
        toast('已开始下一局，所有人需要重新输入昵称加入', 'ok');
        await loadState();
      } else {
        toast(apiErrorText(data, res, '重开失败，请稍后重试'), 'error');
      }
    } catch (_) {
      toast('网络异常，重开失败，请稍后重试', 'error');
    } finally {
      setBusy(el.start, false);
      if (el.actionNote) el.actionNote.textContent = '重开会清空本局全部数据，操作前会再次确认。';
    }
  }

  /* ---------- 绑定与启动 ---------- */

  if (el.loginForm) el.loginForm.addEventListener('submit', handleLogin);
  else if (el.loginButton) el.loginButton.addEventListener('click', handleLogin);
  if (el.logout) el.logout.addEventListener('click', handleLogout);
  if (el.start) el.start.addEventListener('click', openConfirm);
  if (el.confirmCancel) el.confirmCancel.addEventListener('click', closeConfirm);
  if (el.confirmAccept) el.confirmAccept.addEventListener('click', handleReset);
  if (el.confirm) {
    el.confirm.addEventListener('cancel', (event) => { event.preventDefault(); closeConfirm(); });
    el.confirm.addEventListener('click', (event) => {
      // 点击 ::backdrop（事件目标为 dialog 自身且落在卡片外）时关闭。
      if (event.target === el.confirm) closeConfirm();
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && authed) loadState();
  });

  showLogin();
  checkSession();
})();
