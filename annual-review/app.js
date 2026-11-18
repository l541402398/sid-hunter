(() => {
  'use strict';
  const $ = (id) => document.getElementById(id),
    data = window.AnnualContent;
  const dialog = $('review-dialog'),
    stage = $('book-stage');
  const embedded =
    window.parent !== window && new URLSearchParams(location.search).get('embed') === 'game';
  if (embedded) document.documentElement.classList.add('embedded-review');
  const notifyHost = (type) => {
    if (embedded) window.parent.postMessage({ type }, location.origin);
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const escape = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  const models = [{ type: 'foreword', chapter: '开篇寄语' }];
  for (let i = 0; i < data.people.length; i += 4)
    models.push({
      type: 'people',
      chapter: '榜样人物',
      people: data.people.slice(i, i + 4),
      group: Math.floor(i / 4) + 1
    });
  models.push({ type: 'personal', chapter: '我的2026' }, { type: 'ending', chapter: '写在最后' });
  const firstOf = (type) => models.findIndex((m) => m.type === type);
  let index = 0,
    mode = 'cover',
    busy = false,
    token = 0,
    intendedIndex = 0,
    leafAnimations = [],
    coverAnimations = [],
    opener = null;
  let activeMotion = null,
    exitTask = null,
    exitAnimation = null,
    exitRequested = false;
  const curlCache = new Map();
  let activeCurl = null,
    warmTask = null,
    artReady = false;
  // Reading sessions always start from the cover; discard progress left by earlier versions.
  try {
    localStorage.removeItem('my2026.annual-book.v2');
  } catch {}
  const readingStack = { left: 8, right: 8 };
  function applyStacks(closed = false) {
    const stack = closed ? { left: 0, right: 16 } : readingStack;
    $('volume').style.setProperty('--left-stack', `${stack.left}px`);
    $('volume').style.setProperty('--right-stack', `${stack.right}px`);
  }
  function trackMotion(task) {
    activeMotion = task;
    const done = () => {
      if (activeMotion === task) activeMotion = null;
    };
    task.then(done, done);
    return task;
  }
  function mascot(className) {
    return `<canvas class="${className}" width="360" height="290" role="img" aria-label="公司吉祥物黄色 JULI"></canvas>`;
  }
  function top(chapter, right = '2026 · 年度纪念册') {
    return `<div class="page-running"><span>${escape(chapter)}</span><span>${escape(
      right
    )}</span></div>`;
  }
  function folio(side, n) {
    const number = `<span class="folio-number">${String(n * 2 + (side === 'left' ? 1 : 2)).padStart(
        2,
        '0'
      )}</span>`,
      label = `<span>${side === 'left' ? 'MY 2026' : '一册同行的时光'}</span>`;
    return `<div class="folio">${side === 'left' ? number + label : label + number}</div>`;
  }
  function portrait(person, extra = '') {
    return `<div class="portrait-mount ${extra}"><img src="${escape(
      person.avatar || window.AnnualArt.portrait(person.portrait || 0)
    )}" alt="${escape(person.name)}的头像"${
      person.avatar ? ' class="original-photo"' : ''
    }><span aria-hidden="true"></span></div>`;
  }
  function card(item) {
    return `<article class="person-card${
      item.winners.length > 1 ? ' has-co-winners' : ''
    }" data-person="${escape(item.id)}"><div class="honor-portraits">${item.winners
      .map((winner) => portrait(winner))
      .join('')}</div><div class="person-content"><div class="honor-winners">${item.winners
      .map(
        (winner) =>
          `<div class="honor-winner"><h4>${escape(
            winner.name
          )}</h4><p class="employee-id">工号 ${escape(winner.employeeId)}</p></div>`
      )
      .join('')}</div><p class="honor-title">${escape(
      item.label
    )}</p><div class="person-metric" aria-label="${escape(item.label)}：${escape(
      item.value + item.unit
    )}"><strong>${escape(item.value)}</strong>${
      item.unit ? `<span>${escape(item.unit)}</span>` : ''
    }</div></div></article>`;
  }
  function render(side, n) {
    const m = models[n];
    let html = '';
    if (m.type === 'foreword') {
      const f = data.foreword;
      html =
        side === 'left'
          ? `${top(
              '序 · 致同行者'
            )}<div class="dedication-page"><p class="dedication-mark">✦</p><p class="dedication-year">2026</p><h3>致每一位<br>同行的你</h3><hr class="dedication-line"><p class="dedication-caption">这一年的每一份认真<br>都值得被好好珍藏</p>${mascot(
              'dedication-juli'
            )}</div>`
          : `${top(
              '一封给你的信',
              'FOREWORD'
            )}<p class="page-kicker">翻开这一年，先说一声</p><h3 class="page-title">辛苦了，亲爱的伙伴。</h3><div class="letter"><p class="salutation">${escape(
              f.salutation
            )}</p>${f.paragraphs
              .map((p) => `<p>${escape(p)}</p>`)
              .join('')}<p class="letter-thanks">${escape(
              f.thanks
            )}</p><div class="letter-signature">${escape(f.signature)}<br>${escape(
              f.date
            )}</div><p class="letter-guide">${escape(f.guide)}</p></div>`;
    } else if (m.type === 'people') {
      const part = m.people.slice(side === 'left' ? 0 : 2, side === 'left' ? 2 : 4);
      const title =
        data.peoplePageTitles?.[(m.group - 1) * 2 + (side === 'left' ? 0 : 1)] ||
        part[0]?.label ||
        '更多闪光，仍在继续';
      html = `${top('第一章 · 榜样人物')}<div class="page-header-row"><h3>${escape(
        title
      )}</h3><span>${
        side === 'left' ? '同行者图鉴' : '2026'
      }</span></div><div class="people-list">${part
        .map((p) => card(p))
        .join('')}</div><p class="people-caption">${
        side === 'left'
          ? '用一个个真实的日常，写下自己的不凡。'
          : '每一个闪光的身影，都值得被看见。'
      }</p>`;
    } else if (m.type === 'personal') {
      const p = data.personal;
      if (!p)
        html = `${top(
          '第二章 · 我的2026'
        )}<div class="ending-page"><span class="ending-seal">珍藏</span><h3>属于你的这一页，<br>正在写下。</h3><p>你的年度回忆整理完成后，会在这里与你见面。</p>${mascot(
          'ending-juli'
        )}</div>`;
      else if (side === 'left')
        html = `${top(
          '第二章 · 我的2026',
          'YOUR OWN STORY'
        )}<div class="personal-intro"><p class="page-kicker">接下来，把目光留给自己</p><h3 class="page-title">${escape(
          p.name
        )}，<br>这是你的2026。</h3>${portrait(
          p,
          'personal-face'
        )}<p class="personal-id">工号 ${escape(p.employeeId)}</p><p class="personal-note">${escape(
          p.intro
        )}</p><div class="personal-keyword">${escape(p.keyword)}</div></div>`;
      else
        html = `${top(
          '我的年度足迹',
          '只属于你的回忆'
        )}<p class="page-kicker">平凡的日常，积攒成不凡的一年</p><h3 class="page-title">回头看，已经走了这么远。</h3><div class="personal-stats">${p.stats
          .map(
            (s) =>
              `<div class="personal-stat"><strong>${escape(s.value)}<small>${escape(
                s.unit
              )}</small></strong><span>${escape(s.label)}</span></div>`
          )
          .join('')}</div><h4 class="timeline-title">值得记住的几个瞬间</h4>${p.moments
          .map(
            (m) =>
              `<div class="timeline-item"><time>${escape(m.date)}</time><p>${escape(
                m.text
              )}</p></div>`
          )
          .join('')}`;
    } else {
      html =
        side === 'left'
          ? `${top(
              '终章 · 写在最后'
            )}<div class="ending-page"><span class="ending-seal">同行</span><h3>这一年，<br>有你真好。</h3><p>感谢每一次认真，和每一段并肩。<br>愿下一段时光，仍有热爱，也有彼此。</p><button class="ending-link" data-book-action="restart">再读一次，从寄语开始 ↺</button></div>`
          : `${top('愿回忆有光，愿前路有伴', 'UNTIL NEXT TIME')}<div class="ending-page">${mascot(
              'ending-juli'
            )}<p class="ending-year">2026</p><p>故事暂时翻到这里，<br>属于我们的下一页，还在继续。</p><button class="ending-link" data-book-action="dismiss">收藏这份回忆，暂别纪念册 →</button></div>`;
    }
    return html + folio(side, n);
  }
  function fill(node, html) {
    node.innerHTML = html;
    window.AnnualArt.paintMascots(node);
  }
  function setBusy(value) {
    busy = value;
    stage.dataset.busy = String(value);
    $('spread').setAttribute('aria-busy', String(value));
    updateControls();
    if (value) stopCurlWarmup();
    else scheduleCurlWarmup();
  }
  function syncCoverMotion() {
    dialog.dataset.artPaused = String(document.hidden || mode !== 'cover' || !dialog.open);
  }
  function setMode(value) {
    mode = value;
    stage.dataset.mode = value;
    const open = value === 'open';
    $('open-footer').hidden = !open;
    $('chapter-bookmarks').hidden = !open;
    $('cover-front').inert = value !== 'cover' || exitRequested;
    $('cover-front').setAttribute('aria-hidden', String(value !== 'cover'));
    syncCoverMotion();
  }
  function updateControls() {
    const inactive = mode !== 'open' || busy || exitRequested;
    $('previous-page').disabled = inactive;
    $('corner-previous').disabled = inactive;
    $('next-page').disabled = inactive || index === models.length - 1;
    $('corner-next').disabled = inactive || index === models.length - 1;
    $('start-review').disabled = busy || exitRequested;
    $('close-review').disabled = exitRequested;
    $('cover-front').inert = mode !== 'cover' || exitRequested;
    $('previous-page').setAttribute('aria-label', index === 0 ? '向前翻到封面' : '上一组双页');
    $('corner-previous').setAttribute('aria-label', index === 0 ? '向前翻到封面' : '上一组双页');
    $('corner-previous').title = index === 0 ? '翻到封面 · ←' : '上一组 · ←';
    $('chapter-title').textContent = models[index].chapter;
    $('page-progress').textContent = `${String(index * 2 + 1).padStart(2, '0')}—${String(
      index * 2 + 2
    ).padStart(2, '0')} / ${models.length * 2} 页`;
    document.querySelectorAll('[data-chapter]').forEach((b) => {
      b.disabled = busy || exitRequested || firstOf(b.dataset.chapter) < 0;
      b.setAttribute('aria-current', String(models[index].type === b.dataset.chapter));
    });
  }
  function commit(n) {
    index = n;
    intendedIndex = n;
    fill($('left-page'), render('left', n));
    fill($('right-page'), render('right', n));
    applyStacks(mode === 'cover');
    updateControls();
    $('reader-status').textContent = `${models[n].chapter}，第${n * 2 + 1}至${n * 2 + 2}页，共${models.length * 2}页`;
  }
  function clearCoverAnimations() {
    for (const motion of coverAnimations) motion.cancel();
    coverAnimations = [];
  }
  function finishCover(open) {
    applyStacks(!open);
    $('spread').hidden = !open;
    setMode(open ? 'open' : 'cover');
    clearCoverAnimations();
    setBusy(false);
  }
  async function moveCover(open, duration = 1050) {
    if (busy || mode !== (open ? 'cover' : 'open')) return;
    const own = ++token;
    if (open) commit(0);
    fill($('cover-inside'), render('left', index));
    $('spread').hidden = false;
    setBusy(true);
    setMode(open ? 'opening' : 'closing');
    if (!reducedMotion.matches && !document.hidden) {
      const coverFrames = [],
        volumeFrames = [],
        backingFrames = [],
        gutterFrames = [],
        stack = readingStack,
        restCos = Math.cos((2.5 * Math.PI) / 180);
      for (let step = 0; step <= 32; step++) {
        const offset = step / 32,
          progress = open ? offset : 1 - offset,
          angle = -2.5 - 175 * progress,
          closed = 1 - progress;
        // Centre the visible silhouette as the hinged left half unfolds; use the same timeline as the cover.
        const unfolded = Math.min(1, Math.max(0, -Math.cos((angle * Math.PI) / 180) / restCos)),
          shift = -25 + 25 * unfolded;
        coverFrames.push({ offset, transform: `rotateY(${angle}deg)` });
        volumeFrames.push({
          offset,
          transform: `translateX(${shift}%) rotateX(${3 + 3 * progress}deg) rotateY(${
            -9 * closed
          }deg) rotateZ(${-0.8 * closed}deg)`,
          '--left-stack': `${stack.left * progress}px`,
          '--right-stack': `${16 + (stack.right - 16) * progress}px`
        });
        backingFrames.push({ offset, transform: `rotateY(${180 + angle}deg)` });
        const contact = Math.max(0, 2 * progress - 1);
        gutterFrames.push({ offset, opacity: contact * contact * (3 - 2 * contact) });
      }
      const timing = { duration, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' };
      coverAnimations = [
        $('hard-cover').animate(coverFrames, timing),
        $('volume').animate(volumeFrames, timing),
        $('left-backing').animate(backingFrames, timing),
        document.querySelector('.book-gutter').animate(gutterFrames, timing)
      ];
      const start = coverAnimations[0].startTime ?? document.timeline.currentTime;
      for (const motion of coverAnimations) motion.startTime = start;
      try {
        await Promise.all(coverAnimations.map((motion) => motion.finished));
      } catch {}
      if (own !== token) return;
    }
    finishCover(open);
    if (!exitRequested) (open ? $('next-page') : $('start-review')).focus({ preventScroll: true });
  }
  function openBook() {
    if (busy || exitRequested || mode !== 'cover') return;
    return trackMotion(moveCover(true));
  }
  function closeBook(duration) {
    return trackMotion(moveCover(false, duration));
  }
  function turnTo(n) {
    if (busy || exitRequested || mode !== 'open') return;
    if (n === -1 && index === 0) return closeBook();
    if (n === index || n < 0 || n >= models.length) return;
    return trackMotion(turnSpreadTo(n));
  }
  function clearLeafCurl() {
    const leaf = $('turning-leaf');
    for (const motion of leafAnimations) motion.cancel();
    leafAnimations = [];
    activeCurl?.root.remove();
    activeCurl = null;
    delete leaf.dataset.curled;
    $('volume').classList.remove('page-turn-forward', 'page-turn-backward');
  }
  function* buildLeafCurl(entry) {
    const strips = entry.root,
      sources = ['leaf-front', 'leaf-back'].map((id, face) => {
        const source = $(id).cloneNode(false);
        source.removeAttribute('id');
        fill(source, entry.html[face]);
        return source;
      }),
      canvases = sources.map((source) => [...source.querySelectorAll('canvas')]),
      count = 32,
      flat = 8;
    const curve = (step) => 56 * Math.pow(Math.max(0, (step - flat) / (count - flat)), 2.4);
    strips.className = 'leaf-strips';
    strips.style.setProperty('--strip-count', String(count));
    // Each hinge starts at the previous strip's edge, keeping the paper continuous.
    let parent = strips;
    for (let i = 0; i < count; i++) {
      const strip = document.createElement('div');
      strip.className = 'leaf-strip';
      if (i === 0) strip.style.width = `${100 / count}%`;
      const angle = curve(i + 1) - curve(i);
      strip.style.setProperty('--strip-angle', `${angle}deg`);
      if (angle) entry.joints.push({ strip, angle });
      // The bound quarter stays in one piece; the remainder forms a smooth, progressively looser arc.
      const span = i === 0 ? flat : 1;
      for (const [face, source] of (i === 0 || i >= flat ? sources.entries() : [])) {
        const viewport = document.createElement('div'),
          surface = source.cloneNode(true),
          slice = face === 0 ? i : count - i - span;
        viewport.className = `leaf-strip-face ${face === 0 ? 'front' : 'back'}`;
        viewport.style.width = `calc(${span * 100}% + 2.5px)`;
        surface.removeAttribute('id');
        surface.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
        surface.classList.add('leaf-surface');
        surface.style.transform = `translateX(${-100 * slice / count}%)`;
        // cloneNode does not copy the canvas bitmap; preserve the rendered JULI on letter pages.
        surface.querySelectorAll('canvas').forEach((canvas, index) => {
          canvas.getContext('2d').drawImage(canvases[face][index], 0, 0);
        });
        entry.surfaces.push(surface);
        viewport.append(surface);
        strip.append(viewport);
      }
      parent.append(strip);
      parent = strip;
      yield;
    }
    entry.ready = true;
  }
  function cachedLeafCurl(from, to) {
    const low = Math.min(from, to),
      high = Math.max(from, to),
      key = `${low}:${high}`,
      html = [render('right', low), render('left', high)];
    let entry = curlCache.get(key);
    if (!entry || entry.html.some((value, face) => value !== html[face])) {
      entry = { root: document.createElement('div'), html, joints: [], surfaces: [], ready: false };
      entry.builder = buildLeafCurl(entry);
    }
    curlCache.delete(key);
    curlCache.set(key, entry);
    // Keep at most the two neighbouring turns and one just-used or jumped-to turn, all detached at rest.
    while (curlCache.size > 3) curlCache.delete(curlCache.keys().next().value);
    return entry;
  }
  function stopCurlWarmup() {
    if (warmTask === null) return;
    if (window.cancelIdleCallback) cancelIdleCallback(warmTask);
    else clearTimeout(warmTask);
    warmTask = null;
  }
  function scheduleCurlWarmup() {
    stopCurlWarmup();
    if (
      !artReady || busy || exitRequested || mode !== 'open' || !dialog.open ||
      document.hidden || reducedMotion.matches
    ) return;
    const enqueue = (work) =>
      window.requestIdleCallback
        ? requestIdleCallback(work)
        : setTimeout(() => work({ timeRemaining: () => 5 }), 32);
    const work = (deadline) => {
      warmTask = null;
      if (
        busy || exitRequested || mode !== 'open' || !dialog.open ||
        document.hidden || reducedMotion.matches
      ) return;
      const start = performance.now();
      for (const next of [index + 1, index - 1]) {
        if (next < 0 || next >= models.length) continue;
        if (deadline.timeRemaining() <= 3 || performance.now() - start >= 8) {
          warmTask = enqueue(work);
          return;
        }
        const entry = cachedLeafCurl(index, next);
        while (!entry.ready && deadline.timeRemaining() > 3 && performance.now() - start < 8)
          entry.builder.next();
        if (!entry.ready) {
          warmTask = enqueue(work);
          return;
        }
      }
    };
    warmTask = enqueue(work);
  }
  function prepareLeafCurl(from, to) {
    clearLeafCurl();
    const leaf = $('turning-leaf'),
      entry = cachedLeafCurl(from, to);
    while (!entry.ready) entry.builder.next();
    // An early click can precede image loading; refresh those bitmaps before reusing the surface.
    if (!artReady) window.AnnualArt.paintMascots(entry.root);
    activeCurl = entry;
    leaf.append(entry.root);
    leaf.dataset.curled = 'true';
    return entry;
  }
  async function turnSpreadTo(n) {
    if (busy || mode !== 'open' || n === index || n < 0 || n >= models.length) return;
    const own = ++token,
      forward = n > index,
      old = index;
    intendedIndex = n;
    setBusy(true);
    if (!reducedMotion.matches && !document.hidden) {
      const leaf = $('turning-leaf');
      fill($('leaf-front'), render('right', forward ? old : n));
      fill($('leaf-back'), render('left', forward ? n : old));
      const curl = prepareLeafCurl(old, n);
      $('volume').classList.add(forward ? 'page-turn-forward' : 'page-turn-backward');
      if (forward) fill($('right-page'), render('right', n));
      else fill($('left-page'), render('left', n));
      leaf.hidden = false;
      // A page is picked up at the outer edge before the binding moves. The edge then
      // follows the hand through a broad arc and relaxes onto the destination stack.
      const poses = [
        [0, -2.5, 0, 0],
        [0.12, -7, 0.42, 0.12],
        [0.28, -39, 0.94, 0.28],
        [0.5, -96, 1, 0.42],
        [0.72, -149, 0.68, 0.3],
        [0.9, -176, 0.18, 0.08],
        [1, -177.5, 0, 0]
      ];
      const frames = poses.map(([offset, angle]) => ({
        offset,
        easing: 'cubic-bezier(.35,0,.65,1)',
        transform: `rotateY(${forward ? angle : -180 - angle}deg)`
      }));
      const timing = {
        duration: 1080,
        easing: 'linear',
        fill: 'both'
      };
      leafAnimations = [leaf.animate(frames, timing)];
      for (const { strip, angle } of curl.joints)
        leafAnimations.push(
          strip.animate(poses.map(([offset, , bend]) => ({
            offset,
            easing: 'cubic-bezier(.35,0,.65,1)',
            '--joint-angle': `${(forward ? bend : -bend) * angle}deg`
          })), timing)
        );
      const shades = poses.map(([offset, , , opacity]) => ({
        offset,
        easing: 'cubic-bezier(.35,0,.65,1)',
        opacity
      }));
      for (const surface of curl.surfaces)
        leafAnimations.push(surface.animate(shades, { ...timing, pseudoElement: '::after' }));
      // Every joint and light band uses the original poses and one shared document clock.
      const start = document.timeline.currentTime;
      for (const motion of leafAnimations) motion.startTime = start;
      try {
        await Promise.all(leafAnimations.map((motion) => motion.finished));
      } catch {}
      if (own !== token) return;
    }
    commit(n);
    $('turning-leaf').hidden = true;
    clearLeafCurl();
    setBusy(false);
    if (!exitRequested && document.activeElement?.disabled)
      $('previous-page').focus({ preventScroll: true });
  }
  function settleMotion() {
    if (!busy) return;
    ++token;
    $('turning-leaf').hidden = true;
    clearLeafCurl();
    if (mode === 'opening' || mode === 'closing') {
      finishCover(mode === 'opening');
      return;
    }
    commit(intendedIndex);
    $('spread').hidden = false;
    setMode('open');
    setBusy(false);
  }
  function resetReader() {
    ++token;
    stopCurlWarmup();
    clearCoverAnimations();
    $('turning-leaf').hidden = true;
    clearLeafCurl();
    curlCache.clear();
    setMode('cover');
    commit(0);
    $('spread').hidden = true;
    setBusy(false);
  }
  function openReader(event) {
    if (exitRequested || dialog.open) return;
    opener = event?.currentTarget || document.querySelector('[data-open-review]');
    dialog.showModal();
    $('reader-title').focus({ preventScroll: true });
    syncCoverMotion();
  }
  function dismiss() {
    if (exitTask || !dialog.open) return exitTask;
    exitRequested = true;
    notifyHost('annual-review:closing');
    stopCurlWarmup();
    updateControls();
    const task = (async () => {
      try {
        // The game reader settles an in-flight turn before the short exit animation.
        if (embedded) settleMotion();
        else if (activeMotion) await activeMotion;
        if (!dialog.open) return;
        if (mode === 'open') await closeBook(embedded ? 220 : undefined);
        if (!dialog.open) return;
        if (!reducedMotion.matches && !document.hidden) {
          dialog.dataset.exiting = 'true';
          notifyHost('annual-review:fading');
          exitAnimation = dialog.animate(
            [
              { opacity: 1, transform: 'translateY(0px)' },
              { opacity: 0, transform: 'translateY(8px)' }
            ],
            { duration: 180, easing: 'ease-in', fill: 'forwards' }
          );
          try {
            await exitAnimation.finished;
          } catch {}
        }
        dialog.close();
        resetReader();
        notifyHost('annual-review:closed');
      } finally {
        exitAnimation?.cancel();
        exitAnimation = null;
        delete dialog.dataset.exiting;
        exitRequested = false;
        updateControls();
        syncCoverMotion();
      }
    })();
    exitTask = task;
    const done = () => {
      if (exitTask === task) exitTask = null;
    };
    task.then(done, done);
    return task;
  }
  document
    .querySelectorAll('[data-open-review]')
    .forEach((b) => b.addEventListener('click', openReader));
  $('start-review').addEventListener('click', openBook);
  $('close-review').addEventListener('click', dismiss);
  $('previous-page').addEventListener('click', () => turnTo(index - 1));
  $('next-page').addEventListener('click', () => turnTo(index + 1));
  $('corner-previous').addEventListener('click', () => turnTo(index - 1));
  $('corner-next').addEventListener('click', () => turnTo(index + 1));
  let pagePress = null;
  stage.addEventListener(
    'pointerdown',
    (event) => {
      if (event.button === 0)
        pagePress = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          blocked: busy || exitRequested,
          dragged: false
        };
    },
    true
  );
  stage.addEventListener(
    'pointermove',
    (event) => {
      if (
        pagePress &&
        pagePress.id === event.pointerId &&
        Math.hypot(event.clientX - pagePress.x, event.clientY - pagePress.y) > 6
      )
        pagePress.dragged = true;
    },
    true
  );
  stage.addEventListener(
    'pointercancel',
    () => {
      if (pagePress) pagePress.blocked = true;
    },
    true
  );
  function canClickPage(event) {
    return (
      event.button === 0 &&
      event.detail <= 1 &&
      (!event.detail || (!pagePress?.blocked && !pagePress?.dragged)) &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !busy &&
      !exitRequested &&
      !event.defaultPrevented &&
      !event.target.closest(
        'button,a,input,textarea,select,[contenteditable="true"],[role="button"]'
      ) &&
      (window.getSelection()?.isCollapsed ?? true)
    );
  }
  $('spread').addEventListener('click', (event) => {
    if (mode !== 'open' || !canClickPage(event)) return;
    const page = event.target.closest('#left-page,#right-page');
    if (page) turnTo(index + (page.id === 'left-page' ? -1 : 1));
  });
  $('hard-cover').addEventListener('click', (event) => {
    if (mode === 'cover' && canClickPage(event)) openBook();
  });
  document
    .querySelectorAll('[data-chapter]')
    .forEach((b) => b.addEventListener('click', () => turnTo(firstOf(b.dataset.chapter))));
  dialog.addEventListener('click', (event) => {
    const a = event.target.closest('[data-book-action]');
    if (a && !a.closest('#turning-leaf')) {
      if (a.dataset.bookAction === 'restart') turnTo(0);
      else dismiss();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dismiss();
  });
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    syncCoverMotion();
    opener?.focus({ preventScroll: true });
  });
  $('home-link').addEventListener('click', (event) => {
    event.preventDefault();
    if (dialog.open) dismiss();
  });
  // Consume Escape before the native dialog close request, including repeated presses during motion.
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape' || !dialog.open) return;
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    },
    true
  );
  document.addEventListener('keydown', (event) => {
    if (
      !dialog.open ||
      busy ||
      exitRequested ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)
    )
      return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (mode === 'cover') openBook();
      else turnTo(index + 1);
    }
    if (event.key === 'ArrowLeft' && mode === 'open') {
      event.preventDefault();
      turnTo(index - 1);
    }
    if (event.key === 'Home' && mode === 'open') {
      event.preventDefault();
      turnTo(0);
    }
    if (event.key === 'End' && mode === 'open') {
      event.preventDefault();
      turnTo(models.length - 1);
    }
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      settleMotion();
      exitAnimation?.finish();
    }
    scheduleCurlWarmup();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      settleMotion();
      exitAnimation?.finish();
    }
    syncCoverMotion();
    scheduleCurlWarmup();
  });
  window.AnnualArt.ready.then(() => {
    artReady = true;
    // Detached surfaces prepared before JULI loaded must be rebuilt with the loaded bitmap.
    curlCache.clear();
    scheduleCurlWarmup();
  });
  if (embedded)
    window.addEventListener('message', (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (event.data?.type === 'annual-review:open') openReader();
      else if (event.data?.type === 'annual-review:close') dismiss();
    });
  commit(index);
  setMode(mode);
  $('spread').hidden = mode === 'cover';
  updateControls();
  if (!embedded) openReader();
  notifyHost('annual-review:ready');
})();
