'use strict';

(() => {
  window.SID = window.SID || {};

  function create({ context, onOpen }) {
    const panel = document.getElementById('round-tasks');
    const toggle = document.getElementById('round-tasks-toggle');
    const definitions = [
      { key: 'exploration', label: '探索礼包', icon: '🎁' },
      { key: 'flowers', label: '献花得分', icon: '🌷', showProgress: true },
      { key: 'wheel', label: '免费转盘', icon: '🎡', showProgress: true },
      { key: 'rps', label: '猜拳得分', icon: '✊', showProgress: true },
      { key: 'hammer', label: '敲击互动', icon: '🔨', showProgress: true },
      { key: 'containers', label: '开箱得分' },
      { key: 'quiz', label: '答题得分' },
      { key: 'receivedFlowers', label: '收花得分' },
      { key: 'combat', label: '对战得分' },
      { key: 'survival', label: '对战时长' },
      { key: 'unallocated', label: '未细分积分' }
    ];
    const list = document.getElementById('round-tasks-list');
    const score = document.getElementById('round-tasks-score');
    const history = document.getElementById('round-tasks-history');
    const status = document.getElementById('round-tasks-status');
    const rows = new Map();
    let lastRender = '';
    const opened = () => panel.matches(':popover-open');

    for (const { key, label, icon, showProgress } of definitions) {
      const row = document.createElement('li');
      row.className = icon ? 'round-task' : 'round-task round-task-compact';
      row.dataset.task = key;
      const badge = icon ? `<span aria-hidden="true">${icon}</span> ` : '';
      row.innerHTML = `<div class="round-task-label"><h3>${badge}${label}</h3><strong></strong></div>
        ${showProgress ? `<progress aria-label="${label}进度" max="1" value="0"></progress>` : ''}
        <p class="round-task-detail" hidden></p>`;
      rows.set(key, {
        row, value: row.querySelector('strong'), meter: row.querySelector('progress'),
        detail: row.querySelector('p')
      });
      list.append(row);
    }

    function updateRow(key, { points, value = `${points} 分`, current, cap, detail = '', state = '' }) {
      const controls = rows.get(key);
      controls.value.textContent = value;
      if (controls.meter) {
        controls.meter.max = cap;
        controls.meter.value = current;
      }
      controls.detail.textContent = detail;
      controls.detail.hidden = !detail;
      controls.row.dataset.state = state;
    }
    function updatePoints(key, task, detail) {
      const full = task.points >= task.cap;
      updateRow(key, {
        value: `${task.points} / ${task.cap} 分`, current: task.points, cap: task.cap,
        detail: full ? '本场已拿满' : detail, state: full ? 'complete' : ''
      });
    }
    function render({ progress, flowerRecipient, truce, unavailable }) {
      const signature = JSON.stringify([progress, flowerRecipient, truce, unavailable]);
      if (signature === lastRender) return;
      lastRender = signature;
      score.textContent = progress.currentScore;
      history.textContent = progress.historyScore;
      status.textContent = unavailable;
      status.hidden = !unavailable;
      const { exploration, flowers, wheel, rps, hammer } = progress;
      const unlocked = exploration.count >= exploration.goal;
      const claimable = !exploration.claimed && unlocked && !unavailable;
      const explored = Math.min(exploration.count, exploration.goal);
      const claimStatus = exploration.claimed ? `探索 ${explored} / ${exploration.goal} · 已领取`
        : unlocked ? (unavailable ? '探索目标已达成 · 礼包未领取' : `可领取 ${exploration.reward} 分`)
        : `探索 ${explored} / ${exploration.goal} · 达成后可领 ${exploration.reward} 分`;
      updateRow('exploration', {
        points: exploration.points,
        detail: !exploration.claimed && !unavailable ? `${claimStatus} · 在楼层 NPC 处领取` : claimStatus,
        state: claimable ? 'ready' : exploration.claimed ? 'complete' : ''
      });
      updatePoints('flowers', flowers, '向收花人献花可得分');
      const wheelUsed = wheel.spins >= wheel.cap;
      const wheelUses = `已用 ${wheel.spins} / ${wheel.cap} 次`;
      updateRow('wheel', {
        points: wheel.points, current: wheel.spins, cap: wheel.cap,
        detail: wheel.completeHistory ? wheelUses : `${wheelUses} · 旧记录的得分未细分`,
        state: wheelUsed ? 'complete' : ''
      });
      updatePoints('rps', rps, rps.enabled ? `每赢一局 +${rps.winPoints} 分` : '本场猜拳暂未开放');
      updatePoints('hammer', hammer, `按 J 敲击在线玩家有机会得分，同一目标最多 ${hammer.perTargetCap} 分`);
      for (const key of ['containers', 'quiz', 'combat', 'survival']) {
        const detail = truce && (key === 'combat' || key === 'survival') ? '休战中 · 暂停累积' : '';
        updateRow(key, { points: progress[key].points, detail });
      }
      rows.get('receivedFlowers').row.hidden = !flowerRecipient;
      if (flowerRecipient) updateRow('receivedFlowers', progress.receivedFlowers);

      const previousFlowerPoints = flowerRecipient ? 0 : progress.receivedFlowers.points;
      const otherPoints = progress.unallocated.points + previousFlowerPoints;
      const otherRow = rows.get('unallocated').row;
      otherRow.hidden = otherPoints === 0;
      otherRow.querySelector('h3').textContent = previousFlowerPoints ? '其他积分' : '未细分积分';
      updateRow('unallocated', { points: otherPoints });
    }
    function position() {
      const bottom = Math.ceil(toggle.getBoundingClientRect().bottom);
      panel.style.setProperty('--round-tasks-top', `${bottom + 8}px`);
    }
    function sync() {
      const current = context();
      const { progress, unavailable } = current;
      toggle.disabled = !progress;
      const readyToClaim = progress && !progress.exploration.claimed && !unavailable &&
        progress.exploration.count >= progress.exploration.goal;
      toggle.classList.toggle('reward-ready', !!readyToClaim);
      toggle.title = readyToClaim ? '查看本场积分明细（有礼包可领取）' : '查看本场积分明细';
      if (!progress) close();
      else if (opened()) render(current);
    }
    function close() {
      if (opened()) panel.hidePopover();
    }
    panel.addEventListener('beforetoggle', event => {
      if (event.newState !== 'open') return;
      const current = context();
      if (!current.progress) { event.preventDefault(); return; }
      position();
      render(current);
      onOpen();
    });
    panel.addEventListener('toggle', () => toggle.setAttribute('aria-expanded', String(opened())));
    window.addEventListener('resize', () => { if (opened()) position(); });
    return { opened, close, sync };
  }

  window.SID.roundTasks = { create };
})();
