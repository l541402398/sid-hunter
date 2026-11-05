'use strict';
// 容器探索与答题面板（需求 4 & 5）：
//   · 每个箱子或柜子的内容按玩家独立随机生成：可能为空(empty)、直接获得金币(coins)或触发答题获得金币(quiz)；
//   · 同一玩家对同一箱子或柜子只能开启一次；
//   · 题库支持单选题(single)、多选题(multiple)、判断题(judge)三种题型，全由服务端权威判分与记账。
(function (root) {
  const SID = root.SID = root.SID || {};

  let host = null, els = null, state = null;

  function el(id) { return document.getElementById(id); }
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

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
    els.take.onclick = () => submitQuizAnswer();
  }

  function setStatus(msg) {
    if (!els || !els.status) return;
    els.status.textContent = msg || '';
    els.status.hidden = !msg;
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
      forceMode: options.forceMode,
      questionType: options.questionType,
      mode: null,
      sessionId: null,
      quiz: null,
      selected: [],
      busy: false,
      done: false
    };
    host.hidden = false;
    els.title.textContent = state.containerName;
    els.grid.replaceChildren();
    els.grid.hidden = true;
    els.grid.style.display = '';
    els.summary.hidden = true;
    els.summary.replaceChildren();
    els.start.hidden = false;
    els.start.disabled = false;
    els.start.textContent = '开启容器(K)';
    els.take.hidden = true;
    els.take.disabled = true;
    els.take.textContent = '提交答案(K)';
    els.bar.style.width = '0%';
    els.meta.textContent = '同一容器每人限开启一次 · 随机为空、直接获得金币或答题获得金币';
    setStatus('正在开启容器…');
    if (options.autoStart !== false) {
      beginSearch();
    }
  }

  function close(silent) {
    if (!host) return;
    host.hidden = true;
    state = null;
    if (!silent && SID.lootGrid.onClose) SID.lootGrid.onClose();
  }
  function isOpen() { return !!(host && !host.hidden); }
  function isQuizActive() { return !!(isOpen() && state && state.mode === 'quiz' && !state.done); }

  function pressPrimary() {
    if (!state || !els) return false;
    if (!state.mode && !els.start.hidden && !els.start.disabled) {
      beginSearch();
      return true;
    }
    if (state.mode === 'quiz' && !state.done && !els.take.hidden && !els.take.disabled) {
      submitQuizAnswer();
      return true;
    }
    return false;
  }

  function renderSummaryBox(badgeText, detailText, extraText) {
    els.summary.hidden = false;
    els.summary.replaceChildren();
    const head = h('div', 'loot-summary-head');
    head.append(h('strong', '', '探索结算'));
    if (badgeText) head.append(h('span', 'loot-sum-chip', badgeText));
    els.summary.append(head);
    const body = h('div', 'loot-sum-items');
    body.append(h('span', 'loot-sum-item', detailText));
    if (extraText) body.append(h('span', 'loot-sum-empty', extraText));
    els.summary.append(body);
  }

  function buildQuizView(quiz) {
    els.grid.replaceChildren();
    els.grid.hidden = false;
    els.grid.style.display = 'block';

    const wrap = h('div', 'quiz-box');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:6px 2px;';

    const header = h('div', 'quiz-head');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
    const typeBadge = h('span', 'loot-sum-clue', quiz.typeLabel || (quiz.type === 'multiple' ? '多选题' : quiz.type === 'judge' ? '判断题' : '单选题'));
    const rewardBadge = h('span', 'loot-sum-chip', `答对 +${quiz.rewardCoins} 金币`);
    header.append(typeBadge, rewardBadge);

    const stem = h('p', 'quiz-question', quiz.question);
    stem.style.cssText = 'margin:2px 0 4px;font-weight:600;line-height:1.45;color:#f8fafc;';

    const optList = h('div', 'quiz-options');
    optList.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

    const syncSelectionUI = () => {
      for (const btn of optList.querySelectorAll('button.quiz-option')) {
        const key = btn.dataset.optionKey;
        const active = state && state.selected.includes(key);
        btn.classList.toggle('is-selected', !!active);
        btn.setAttribute('aria-pressed', String(!!active));
        btn.style.borderColor = active ? '#fbbf24' : 'rgba(148,163,184,0.35)';
        btn.style.background = active ? 'rgba(251,191,36,0.18)' : 'rgba(15,23,42,0.65)';
      }
    };

    for (const opt of (quiz.options || [])) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-option';
      btn.dataset.optionKey = opt.key;
      btn.setAttribute('aria-pressed', 'false');
      btn.style.cssText = 'text-align:left;padding:7px 10px;border-radius:6px;border:1px solid rgba(148,163,184,0.35);background:rgba(15,23,42,0.65);color:#e2e8f0;cursor:pointer;font-size:13px;line-height:1.35;';
      btn.textContent = quiz.type === 'judge' ? `${opt.text}` : `${opt.key}. ${opt.text}`;
      btn.onclick = () => {
        if (!state || state.done || state.busy) return;
        if (quiz.type === 'multiple') {
          if (state.selected.includes(opt.key)) {
            state.selected = state.selected.filter(k => k !== opt.key);
          } else {
            state.selected = [...state.selected, opt.key].sort();
          }
        } else {
          state.selected = [opt.key];
        }
        syncSelectionUI();
      };
      optList.append(btn);
    }

    wrap.append(header, stem, optList);
    els.grid.append(wrap);
  }

  async function beginSearch() {
    if (!state || state.busy) return;
    state.busy = true;
    els.start.disabled = true;
    setStatus('正在开启容器…');
    try {
      const payload = {
        containerId: state.containerId,
        commandId: state.commandId(),
        ...state.floorFields()
      };
      if (state.forceMode) payload.forceMode = state.forceMode;
      if (state.questionType) payload.questionType = state.questionType;
      const r = await state.api('/api/search/start', payload);
      if (!state) return;
      if (r.status !== 200 || !r.ok) {
        setStatus(r.error || '容器无法开启，请靠近后再试。');
        els.start.hidden = true;
        return;
      }
      els.start.hidden = true;
      state.mode = r.mode || 'coins';
      if (state.onResult) state.onResult(r.exploration, r.score);

      if (state.mode === 'empty') {
        els.bar.style.width = '100%';
        setStatus(r.resultText || '开启完成：箱子里空空如也，未获得金币。');
        renderSummaryBox('0 金币', '空空如也 · 本次未获得金币');
        state.done = true;
        return;
      }
      if (state.mode === 'coins') {
        const chips = (r.gained && r.gained.chips) || 0;
        els.bar.style.width = '100%';
        setStatus(r.resultText || `开启完成：直接获得 ${chips} 金币！`);
        renderSummaryBox(`+${chips} 金币`, `直接获得 ${chips} 金币`);
        state.done = true;
        return;
      }
      if (state.mode === 'quiz' && r.quiz) {
        state.sessionId = r.sessionId;
        state.quiz = r.quiz;
        state.selected = [];
        els.bar.style.width = '50%';
        setStatus(r.resultText || `触发答题：答对可得 ${r.quiz.rewardCoins} 金币！`);
        buildQuizView(r.quiz);
        els.take.hidden = false;
        els.take.disabled = false;
        els.take.classList.add('is-ready');
        els.take.textContent = '提交答案(K)';
      }
    } catch {
      if (state) setStatus('网络异常，开启容器未确认。');
    } finally {
      if (state) state.busy = false;
    }
  }

  async function submitQuizAnswer() {
    if (!state || state.mode !== 'quiz' || !state.sessionId || state.busy || state.done) return;
    if (!state.selected.length) {
      setStatus('请先选择答案后再提交');
      return;
    }
    if (state.quiz && state.quiz.type === 'multiple' && state.selected.length < 2) {
      setStatus('多选题请至少选择 2 个选项');
      return;
    }
    state.busy = true;
    els.take.disabled = true;
    setStatus('正在判题…');
    try {
      const answer = state.quiz && state.quiz.type === 'multiple' ? state.selected.slice() : state.selected[0];
      const r = await state.api('/api/search/take', {
        sessionId: state.sessionId,
        answer,
        ...state.floorFields()
      });
      if (!state) return;
      if (r.status !== 200 || !r.ok) {
        setStatus(r.error || '提交答案失败');
        els.take.disabled = false;
        return;
      }
      els.take.hidden = true;
      els.bar.style.width = '100%';
      state.done = true;
      for (const btn of els.grid.querySelectorAll('button.quiz-option')) {
        btn.disabled = true;
      }
      const chips = (r.gained && r.gained.chips) || 0;
      setStatus(r.resultText || (r.correct ? `回答正确！获得 ${chips} 金币。` : '回答错误，未获得金币。'));
      renderSummaryBox(
        r.correct ? `+${chips} 金币` : '0 金币',
        r.correct ? `回答正确，获得 ${chips} 金币！` : '回答错误，本次未获得金币',
        r.explanation ? `解析：${r.explanation}` : ''
      );
      if (state.onResult) state.onResult(r.exploration, r.score);
    } catch {
      if (state) {
        setStatus('网络异常，答题结果未确认。');
        els.take.disabled = false;
      }
    } finally {
      if (state) state.busy = false;
    }
  }

  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!isOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  SID.lootGrid = { open, close, isOpen, isQuizActive, pressPrimary, onClose: null };
})(window);
