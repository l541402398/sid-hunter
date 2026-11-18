'use strict';
// Host only: keeps the live connection running while the iframe owns practice input.
(() => {
  window.SID = window.SID || {};
  function create({ context, prepare, returned, toast }) {
    const $ = id => document.getElementById(id);
    document.body.insertAdjacentHTML('beforeend', `
      <dialog id="tutorial-offer" class="tutorial-card" aria-labelledby="tutorial-offer-title">
        <span class="tutorial-eyebrow">WELCOME · 新人报到</span><h2 id="tutorial-offer-title">先到训练室走一圈？</h2>
        <p>用一个独立练习角色，学会移动、交互、查看自己、查看线索、搜索名单和使用技能。</p>
        <p class="tutorial-live-note">正式角色仍站在原地图原坐标，正常受击、休战和计分；教程不会被打断。</p>
        <p id="tutorial-progress-note"></p><div class="tutorial-card-actions"><button id="tutorial-start" type="button">进入训练室</button><button id="tutorial-reset" type="button" hidden>从头练习</button><button id="tutorial-skip" type="button">跳过，直接玩</button></div>
        <small>以后可在「游戏规则 → 新手训练室」随时进入。</small>
      </dialog>
      <dialog id="tutorial-overlay" aria-label="独立新手训练室">
        <iframe id="tutorial-frame" allow="fullscreen" title="新手训练室，独立练习角色"></iframe>
        <div id="tutorial-loading"><p id="tutorial-loading-message">正在准备训练室…</p><button id="tutorial-loading-exit" type="button">返回办公室</button></div>
      </dialog>
      <dialog id="tutorial-return" class="tutorial-card" aria-labelledby="tutorial-return-title">
        <span class="tutorial-eyebrow">BACK TO OFFICE</span><h2 id="tutorial-return-title">已回到办公室</h2>
        <p id="tutorial-live-state"></p><ul id="tutorial-event-list"></ul>
        <p>练习身份、生命与积分不会带入正式对局。已保存教程进度，随时可以继续。</p>
        <button id="tutorial-return-ok" type="button">继续游戏</button>
      </dialog>`);
    const offer = $('tutorial-offer'), overlay = $('tutorial-overlay'), frame = $('tutorial-frame'), summary = $('tutorial-return');
    const shell = document.querySelector('.shell'), entry = $('tutorial-entry');
    let autoAttempted = false;
    let scope = '', storageKey = '', progress = { step: 0, dismissed: false }, busy = false, loaded = false, timer = null;
    let owner = '', entryRecord = null, savedInert = false, blockedShell = false, returnFocus = null, openingRevision = 0;
    function save() { try { localStorage.setItem(storageKey, JSON.stringify(progress)); } catch { /* Continue in memory when storage is unavailable. */ } }
    function lock() {
      if (blockedShell) return;
      returnFocus = document.activeElement; savedInert = shell.inert; shell.inert = true; blockedShell = true;
    }
    function unlock() {
      if (!blockedShell) return;
      shell.inert = savedInert; blockedShell = false;
      const focus = returnFocus?.isConnected && !returnFocus.closest('dialog:not([open])') ? returnFocus : $('office');
      focus?.focus({ preventScroll: true });
    }
    function isBlocking() { return busy || offer.open || overlay.open || summary.open; }
    function isPracticing() { return overlay.open; }
    function loadProgress() {
      try {
        const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
        progress = { step: Number.isInteger(value?.step) ? Math.max(0, Math.min(7, value.step)) : 0, dismissed: !!value?.dismissed };
      } catch { progress = { step: 0, dismissed: false }; }
    }
    function pauseFrame() { frame.contentWindow?.postMessage({ type: 'sid-tutorial:pause' }, location.origin); }
    function discard() {
      openingRevision++; busy = false; clearTimeout(timer); pauseFrame();
      for (const dialog of [offer, overlay, summary]) if (dialog.open) dialog.close();
      entryRecord = null; unlock();
    }
    function synchronize() {
      const c = context();
      if (entry) entry.disabled = !c.joined;
      if (c.owner !== scope) {
        discard(); autoAttempted = false; scope = c.owner || ''; storageKey = 'sid-tutorial-v3:' + (c.userKey || scope || 'guest'); loadProgress();
      }
      if (!c.joined || isBlocking() || autoAttempted || progress.dismissed || progress.step === 7 || c.unavailable || $('rules-view')?.open) return;
      autoAttempted = true; openOffer(false);
    }
    async function openOffer(manual = true) {
      const c = context();
      if (!c.joined) { toast('加入办公室后即可进入训练室。'); return; }
      if (isBlocking()) return;
      if (c.unavailable) { if (manual) toast('请先完成当前操作，再进入训练室。'); return; }
      const revision = ++openingRevision; owner = c.owner; busy = true;
      try {
        if (!await prepare() || revision !== openingRevision || owner !== context().owner) return;
        lock();
        $('tutorial-offer-title').textContent = progress.step === 7 ? '随时回来复习基础操作' : progress.step > 0 ? '继续你的训练室练习' : '先到训练室走一圈？';
        $('tutorial-progress-note').textContent = progress.step === 7 ? '已完成全部 7 步，可重新开始。' : progress.step > 0 ? `已完成 ${progress.step} / 7 步，将从上次的位置继续。` : '大约 3 分钟 · 7 步亲手练习 · 可随时退出';
        $('tutorial-start').textContent = progress.step === 7 ? '重新练习' : progress.step > 0 ? '继续练习' : '进入训练室';
        $('tutorial-reset').hidden = progress.step === 0 || progress.step === 7;
        $('tutorial-skip').textContent = manual ? '暂不进入' : '跳过，直接玩';
        offer.showModal(); $('tutorial-start').focus();
      } catch { toast('暂时无法确认正式角色已停下，请稍后再试。'); }
      finally { if (revision === openingRevision) busy = false; }
    }
    function skip() { progress.dismissed = true; save(); offer.close(); unlock(); }
    function initializeFrame() {
      if (!overlay.open || !loaded) return;
      $('tutorial-loading').hidden = true; clearTimeout(timer);
      frame.contentWindow.postMessage({ type: 'sid-tutorial:init', progress: { step: progress.step } }, location.origin);
      frame.focus();
    }
    function enter(reset = false) {
      if (reset || progress.step === 7) progress.step = 0;
      progress.dismissed = true; save();
      entryRecord = context().record; owner = context().owner;
      offer.close(); overlay.showModal(); $('tutorial-loading').hidden = false;
      $('tutorial-loading-message').textContent = '正在准备训练室…';
      timer = setTimeout(() => { $('tutorial-loading-message').textContent = '训练室暂时未能打开，可以返回办公室后重试。'; }, 12000);
      if (!frame.hasAttribute('src')) frame.src = 'tutorial/index.html';
      else initializeFrame();
    }
    function exit() {
      if (!overlay.open) return;
      pauseFrame(); clearTimeout(timer); overlay.close();
      if (!loaded) frame.removeAttribute('src');
      const record = entryRecord; entryRecord = null;
      if (!context().joined || owner !== context().owner) { unlock(); return; }
      const result = returned(record);
      $('tutorial-live-state').textContent = result.state;
      const list = $('tutorial-event-list'); list.replaceChildren();
      for (const message of result.events) { const li = document.createElement('li'); li.textContent = message; list.append(li); }
      if (!result.events.length) { const li = document.createElement('li'); li.textContent = '训练期间没有新的涉及你的事件。'; list.append(li); }
      summary.showModal(); $('tutorial-return-ok').focus();
    }
    window.addEventListener('message', e => {
      if (e.origin !== location.origin || e.source !== frame.contentWindow) return;
      if (e.data?.type === 'sid-tutorial:ready') { loaded = true; initializeFrame(); return; }
      if (!overlay.open || owner !== context().owner) return;
      if (e.data?.type === 'sid-tutorial:exit') exit();
      if (e.data?.type === 'sid-tutorial:restart') { progress.step = 0; save(); }
      if (e.data?.type === 'sid-tutorial:progress') {
        const step = e.data.progress?.step;
        if (Number.isInteger(step) && step >= 0 && step <= 7) { progress.step = step; save(); }
      }
    });
    $('tutorial-start').onclick = () => enter(); $('tutorial-reset').onclick = () => enter(true); $('tutorial-skip').onclick = skip;
    $('tutorial-loading-exit').onclick = exit;
    $('tutorial-return-ok').onclick = () => { summary.close(); unlock(); };
    offer.addEventListener('cancel', e => { e.preventDefault(); skip(); });
    overlay.addEventListener('cancel', e => { e.preventDefault(); exit(); });
    summary.addEventListener('cancel', e => { e.preventDefault(); summary.close(); unlock(); });
    if (entry) entry.onclick = () => openOffer(true);
    // Capture keys in the parent too (e.g. focus on a dialog button). iframe keys never bubble here.
    for (const type of ['keydown', 'keyup']) window.addEventListener(type, e => {
      if (!isBlocking()) return;
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (type === 'keydown' && !e.repeat) {
          if (overlay.open) {
            if (loaded) frame.contentWindow.postMessage({ type: 'sid-tutorial:escape' }, location.origin);
            else exit();
          } else if (offer.open) skip(); else if (summary.open) { summary.close(); unlock(); }
        }
      } else if (!['Tab', 'Enter', ' '].includes(e.key)) e.preventDefault();
    }, true);
    window.addEventListener('annual-review:close', synchronize);
    return { synchronize, isBlocking, isPracticing, discard };
  }
  window.SID.tutorial = { create };
})();
