(() => {
  'use strict';
  const overlay = document.getElementById('annual-review-overlay'),
    frame = document.getElementById('annual-review-frame');
  const toggle = document.getElementById('annual-review-toggle'),
    fallback = document.getElementById('annual-review-fallback');
  const shell = document.querySelector('.shell');
  let ready = false,
    opening = false,
    requestClose = false,
    returnFocus = null,
    loadTimer = null,
    shellWasInert = false;
  const post = (type) => frame.contentWindow?.postMessage({ type }, location.origin);
  function finish() {
    if (!overlay.open) return;
    overlay.close();
    shell.inert = shellWasInert;
    delete overlay.dataset.exiting;
    toggle.setAttribute('aria-expanded', 'false');
    window.dispatchEvent(new Event('annual-review:close'));
    const target = returnFocus?.isConnected ? returnFocus : toggle;
    target.focus({ preventScroll: true });
  }
  function close() {
    if (!overlay.open) return;
    if (ready) post('annual-review:close');
    else if (overlay.dataset.failed === 'true') finish();
    else requestClose = true;
  }
  function open(event) {
    if (overlay.open || opening) return;
    opening = true;
    returnFocus = event?.currentTarget || toggle;
    shellWasInert = shell.inert;
    shell.inert = true;
    requestClose = false;
    delete overlay.dataset.exiting;
    toggle.setAttribute('aria-expanded', 'true');
    overlay.showModal();
    window.dispatchEvent(new Event('annual-review:open'));
    if (ready) {
      post('annual-review:open');
      frame.focus();
    } else if (!frame.hasAttribute('src')) {
      frame.src = '/annual-review/?embed=game';
      loadTimer = setTimeout(() => {
        if (!ready) {
          overlay.dataset.failed = 'true';
          fallback.hidden = false;
          frame.hidden = true;
        }
      }, 15000);
    }
    opening = false;
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    const type = event.data?.type;
    if (type === 'annual-review:ready') {
      ready = true;
      clearTimeout(loadTimer);
      overlay.dataset.ready = 'true';
      delete overlay.dataset.failed;
      fallback.hidden = true;
      frame.hidden = false;
      if (overlay.open) {
        if (requestClose) post('annual-review:close');
        else frame.focus();
      }
    } else if (type === 'annual-review:fading' && overlay.open) {
      overlay.dataset.exiting = 'true';
      window.dispatchEvent(new Event('annual-review:fading'));
    } else if (type === 'annual-review:closed') finish();
  });
  toggle.addEventListener('click', open);
  document.getElementById('annual-review-fallback-close').addEventListener('click', finish);
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
  open();
})();
