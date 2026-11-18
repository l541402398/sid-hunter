(() => {
  'use strict';
  const overlay = document.getElementById('annual-review-overlay');
  let frame = document.getElementById('annual-review-frame');
  const toggle = document.getElementById('annual-review-toggle'),
    fallback = document.getElementById('annual-review-fallback'),
    status = document.getElementById('annual-review-loading-status');
  const shell = document.querySelector('.shell');
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
  let returnFocus = null,
    loadTimer = null,
    closeTimer = null,
    shellWasInert = false;
  const post = (type) => frame.contentWindow?.postMessage({ type }, location.origin);
  function discardFrame() {
    clearTimeout(loadTimer);
    // Replacing a stalled iframe also invalidates messages from its old window.
    const replacement = frame.cloneNode(false);
    replacement.removeAttribute('src');
    frame.replaceWith(replacement);
    frame = replacement;
    delete overlay.dataset.ready;
  }
  function finish() {
    if (!overlay.open) return;
    clearTimeout(closeTimer);
    closeTimer = null;
    overlay.close();
    shell.inert = shellWasInert;
    delete overlay.dataset.exiting;
    toggle.setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new Event('annual-review:close'));
    const target = returnFocus?.isConnected ? returnFocus : toggle;
    target.focus({ preventScroll: true });
  }
  function watchClose() {
    if (closeTimer !== null) return;
    closeTimer = setTimeout(() => {
      discardFrame();
      finish();
    }, 800);
  }
  function close() {
    if (!overlay.open) return;
    if (overlay.dataset.ready === 'true') {
      watchClose();
      post('annual-review:close');
    } else {
      discardFrame();
      finish();
    }
  }
  function open(event) {
    if (overlay.open) return;
    returnFocus = event?.currentTarget || toggle;
    shellWasInert = shell.inert;
    shell.inert = true;
    toggle.setAttribute('aria-expanded', 'true');
    fallback.hidden = overlay.dataset.ready === 'true';
    overlay.showModal();
    window.dispatchEvent(new Event('annual-review:open'));
    if (overlay.dataset.ready === 'true') {
      post('annual-review:open');
      frame.focus();
    } else {
      status.textContent = '正在打开年度纪念册…';
      frame.src = '/annual-review/?embed=game';
      loadTimer = setTimeout(() => {
        status.textContent = '纪念册暂时无法打开，请稍后再试。';
      }, 15000);
    }
  }
  function openDaily(employeeId) {
    const day = dayFormat.format(new Date());
    const key = 'sid-annual-review-day:' + (employeeId ? 'cas:' + employeeId : 'guest');
    try {
      if (localStorage.getItem(key) === day) return;
      localStorage.setItem(key, day);
    } catch {
      // A manual open is still available when the browser cannot retain the day.
      return;
    }
    open();
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const type = event.data?.type;
    if (type === 'annual-review:ready') {
      clearTimeout(loadTimer);
      overlay.dataset.ready = 'true';
      fallback.hidden = true;
      if (overlay.open) {
        post('annual-review:open');
        frame.focus();
      }
    } else if (type === 'annual-review:closing' && overlay.open) {
      watchClose();
    } else if (type === 'annual-review:fading' && overlay.open) {
      overlay.dataset.exiting = 'true';
      window.dispatchEvent(new Event('annual-review:fading'));
    } else if (type === 'annual-review:closed') finish();
  });
  toggle.addEventListener('click', open);
  document.getElementById('annual-review-fallback-close').addEventListener('click', close);
  overlay.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  // Reading keys belong to the iframe; parent keys never reach game or minigame listeners.
  for (const type of ['keydown', 'keyup'])
    window.addEventListener(
      type,
      (event) => {
        if (!overlay.open) return;
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          if (type === 'keydown') close();
        } else if (event.key !== 'Tab') event.preventDefault();
      },
      true
    );
  window.SID = window.SID || {};
  window.SID.annualReview = { openDaily };
})();
