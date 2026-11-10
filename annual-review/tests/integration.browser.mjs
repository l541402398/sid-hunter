import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { resolveChrome } from './browser.cjs';

// Run against the real, separately started online game; this script starts no server.
// Example: node annual-review/tests/integration.browser.mjs --url=http://127.0.0.1:8790/
const testDir = dirname(fileURLToPath(import.meta.url)),
  out = resolve(testDir, '../../outputs/annual-review-book');
const urlIndex = process.argv.indexOf('--url');
const baseURL =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ||
  (urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined) ||
  process.env.REVIEW_URL ||
  'http://127.0.0.1:8790/';
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, '.integration-browser-profile-'));
const net = createServer();
await new Promise((resolve) => net.listen(0, '127.0.0.1', resolve));
const port = net.address().port;
await new Promise((resolve) => net.close(resolve));
const browser = spawn(
  resolveChrome(),
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ],
  { windowsHide: true, stdio: 'ignore' }
);

let socket,
  id = 0,
  activeCheck = 'startup';
const pending = new Map(),
  errors = [],
  failedResources = [],
  inputRequests = [],
  actionRequests = [],
  passed = [],
  exitTraces = [];
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const seq = ++id;
    const timer = setTimeout(() => {
      pending.delete(seq);
      reject(Error('CDP timeout ' + method));
    }, 18000);
    pending.set(seq, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
    });
    socket.send(JSON.stringify({ id: seq, method, params }));
  });
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (result.exceptionDetails)
    throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
const child = (expression) =>
  evaluate(
    `(()=>{const frame=globalThis.document.getElementById('annual-review-frame');const document=frame.contentDocument,window=frame.contentWindow;return (${expression});})()`
  );
async function wait(expression, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await delay(70);
  }
  throw Error('Timed out: ' + expression);
}
const waitChild = (expression) =>
  wait(
    `(()=>{const frame=globalThis.document.getElementById('annual-review-frame');if(!frame?.contentDocument)return false;const document=frame.contentDocument,window=frame.contentWindow;return (${expression});})()`
  );
const hostOpen = () => evaluate('document.getElementById("annual-review-overlay").open');
const childClick = (selector) =>
  child(`document.querySelector(${JSON.stringify(selector)}).click()`);
const idle = () => waitChild('document.getElementById("book-stage").dataset.busy==="false"');
const rootClick = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function key(name, code = name) {
  const virtual = {
    Escape: 27,
    ArrowLeft: 37,
    ArrowRight: 39,
    ArrowUp: 38,
    ArrowDown: 40,
    KeyW: 87,
    KeyA: 65,
    KeyS: 83,
    KeyD: 68,
    KeyR: 82,
    KeyL: 76,
    KeyH: 72,
    KeyJ: 74,
    KeyK: 75
  }[code];
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: name,
    code,
    windowsVirtualKeyCode: virtual
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: name,
    code,
    windowsVirtualKeyCode: virtual
  });
}
async function realChildClick(selector) {
  const point = await evaluate(
    `(()=>{const frame=document.getElementById('annual-review-frame'),element=frame.contentDocument.querySelector(${JSON.stringify(
      selector
    )});if(!element)return null;const f=frame.getBoundingClientRect(),r=element.getBoundingClientRect();return{x:f.left+frame.clientLeft+r.left+r.width/2,y:f.top+frame.clientTop+r.top+r.height/2};})()`
  );
  assert(point, 'Missing child mouse target ' + selector);
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
}
async function capture(filename) {
  await delay(120);
  const result = await call('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false
  });
  writeFileSync(join(out, filename), Buffer.from(result.data, 'base64'));
}
async function check(name, fn) {
  activeCheck = name;
  await fn();
  passed.push(name);
  console.log('PASS ' + name);
}
async function cover() {
  assert.equal(await child('document.getElementById("review-dialog").open'), true);
  assert.equal(await child('document.getElementById("book-stage").dataset.mode'), 'cover');
  assert.equal(await child('document.getElementById("book-stage").dataset.busy'), 'false');
  assert.equal(await child('document.getElementById("spread").hidden'), true);
  assert.equal(await child('document.getElementById("chapter-title").textContent'), '开篇寄语');
  assert.match(await child('document.getElementById("page-progress").textContent'), /^01—02/);
}
async function openBook() {
  await realChildClick('#start-review');
  await idle();
  assert.equal(await child('document.getElementById("book-stage").dataset.mode'), 'open');
}
async function reopen() {
  await rootClick('#annual-review-toggle');
  await wait('document.getElementById("annual-review-overlay").open');
  await waitChild(
    'document.getElementById("review-dialog")?.open && document.getElementById("book-stage")?.dataset.busy==="false"'
  );
  await cover();
}
async function assertPreserved() {
  const state = await evaluate(
    `(()=>{const saved=window.__integrationOriginal;return{url:location.href,document:saved.document===document,canvas:saved.canvas===document.getElementById('office'),shell:saved.shell===document.querySelector('.shell'),join:saved.join===document.getElementById('join-page'),frame:saved.frame===document.getElementById('annual-review-frame'),bodyClass:document.body.className,bodyStyle:document.body.getAttribute('style'),background:getComputedStyle(document.body).backgroundImage,font:getComputedStyle(document.body).fontFamily};})()`
  );
  assert.equal(state.url, baseURL, 'Closing the review navigated the game');
  for (const field of ['document', 'canvas', 'shell', 'join', 'frame'])
    assert.equal(state[field], true, field + ' was replaced');
  const original = await evaluate('window.__integrationOriginal.styles');
  assert.equal(state.bodyClass, original.bodyClass);
  assert.equal(state.bodyStyle, original.bodyStyle);
  assert.equal(state.background, original.background);
  assert.equal(state.font, original.font);
}
async function traceExit(trigger, label) {
  await evaluate(
    `(()=>{const frame=document.getElementById('annual-review-frame'),doc=frame.contentDocument,dialog=doc.getElementById('review-dialog'),stage=doc.getElementById('book-stage'),host=document.getElementById('annual-review-overlay');window.__integrationExitTrace=[];window.__integrationTracing=true;const sample=kind=>{window.__integrationExitTrace.push({kind,time:performance.now(),hostOpen:host.open,childOpen:dialog.open,mode:stage.dataset.mode,busy:stage.dataset.busy,exiting:dialog.dataset.exiting||'',opacity:Number(frame.contentWindow.getComputedStyle(dialog).opacity)});};const observer=new MutationObserver(()=>sample('mutation'));observer.observe(stage,{attributes:true,attributeFilter:['data-mode','data-busy']});observer.observe(dialog,{attributes:true,attributeFilter:['data-exiting','open']});window.__integrationExitObserver=observer;dialog.addEventListener('close',()=>sample('child-close'),{once:true});host.addEventListener('close',()=>sample('host-close'),{once:true});function tick(){sample('raf');if(window.__integrationTracing)requestAnimationFrame(tick);}tick();})()`
  );
  if (trigger === 'Escape') await key('Escape');
  else await realChildClick('#close-review');
  await wait('!document.getElementById("annual-review-overlay").open');
  await evaluate('window.__integrationTracing=false;window.__integrationExitObserver.disconnect()');
  const samples = await evaluate('window.__integrationExitTrace');
  exitTraces.push({ label, trigger, samples });
  assert(
    samples.some((sample) => sample.mode === 'closing' && sample.childOpen && sample.hostOpen),
    label + ': no modal closing phase'
  );
  const fading = samples.filter((sample) => sample.exiting === 'true');
  assert(fading.length > 0, label + ': no fade after closing');
  assert(
    fading.every((sample) => sample.mode === 'cover'),
    label + ': fade began before the cover closed'
  );
  assert(
    fading.filter((sample) => sample.childOpen).every((sample) => sample.hostOpen),
    label + ': host lost modality during child fade'
  );
  assert.equal(await child('document.getElementById("review-dialog").open'), false);
  assert.equal(await child('document.getElementById("book-stage").dataset.mode'), 'cover');
  assert.equal(await child('document.getElementById("book-stage").dataset.busy'), 'false');
  await assertPreserved();
}
async function geometry(label) {
  const result = await evaluate(
    `(()=>{const frame=document.getElementById('annual-review-frame'),doc=frame.contentDocument,view=frame.contentWindow;const rect=element=>{const r=element.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};const targets=['#review-dialog','#close-review',doc.getElementById('book-stage').dataset.mode==='cover'?'#start-review':'#open-footer'];return{host:rect(document.getElementById('annual-review-overlay')),frame:rect(frame),width:innerWidth,height:innerHeight,childWidth:view.innerWidth,childHeight:view.innerHeight,targets:targets.map(selector=>({selector,...rect(doc.querySelector(selector))})),scrollWidth:document.documentElement.scrollWidth,childScrollWidth:doc.documentElement.scrollWidth};})()`
  );
  assert(
    result.frame.width > result.width * 0.9 && result.frame.height > result.height * 0.9,
    label + ': iframe does not cover the game'
  );
  assert(result.scrollWidth <= result.width + 1, label + ': game horizontal overflow');
  assert(result.childScrollWidth <= result.childWidth + 1, label + ': review horizontal overflow');
  for (const r of result.targets) {
    assert(r.width > 0 && r.height > 0, label + ': hidden ' + r.selector);
    assert(
      r.left >= -0.6 &&
        r.top >= -0.6 &&
        r.right <= result.childWidth + 0.6 &&
        r.bottom <= result.childHeight + 0.6,
      label + ': ' + r.selector + ' extends outside the frame'
    );
  }
}
async function gameControls() {
  // The isolated server may be resting with its join screen visible. Exercise the
  // genuine registered toolbar handlers without requiring a game admission.
  for (const [button, panel, close, dialog] of [
    ['roster-toggle', 'roster', 'roster-close', false],
    ['ranking-toggle', 'ranking', 'ranking-close', false],
    ['rules-toggle', 'rules-view', 'rules-close', true]
  ]) {
    await rootClick('#' + button);
    assert.equal(
      await evaluate(
        `(()=>{const panel=document.getElementById(${JSON.stringify(panel)});return ${
          dialog ? 'panel.open' : '!panel.hidden'
        };})()`
      ),
      true,
      button + ' did not open its game panel'
    );
    await rootClick('#' + close);
    assert.equal(
      await evaluate(
        `(()=>{const panel=document.getElementById(${JSON.stringify(panel)});return ${
          dialog ? 'panel.open' : '!panel.hidden'
        };})()`
      ),
      false,
      close + ' did not close its game panel'
    );
  }
  for (const [letter, code, panel, dialog] of [
    ['r', 'KeyR', 'roster', false],
    ['l', 'KeyL', 'ranking', false],
    ['h', 'KeyH', 'rules-view', true]
  ]) {
    await evaluate('document.getElementById("office").focus()');
    await key(letter, code);
    assert.equal(
      await evaluate(
        `(()=>{const panel=document.getElementById(${JSON.stringify(panel)});return ${
          dialog ? 'panel.open' : '!panel.hidden'
        };})()`
      ),
      true,
      code + ' stopped working after the review closed'
    );
    await rootClick(
      '#' + { roster: 'roster-close', ranking: 'ranking-close', 'rules-view': 'rules-close' }[panel]
    );
  }
}
async function attackWithRestoredFocus(label) {
  assert.equal(await evaluate('document.activeElement.id'), 'annual-review-toggle', label);
  await wait('!document.getElementById("attack-button").disabled');
  const before = await evaluate('fetch("/api/state").then(r=>r.json()).then(s=>s.me.combat)');
  const baseline = actionRequests.length;
  await key('j', 'KeyJ');
  await wait(
    `fetch("/api/state").then(r=>r.json()).then(s=>s.me.combat.attackUntil>${before.attackUntil} && s.me.combat.lastAttackAt>${before.lastAttackAt})`
  );
  assert.equal(actionRequests.slice(baseline).filter(({ path }) => path === '/api/attack').length, 1,
    label + ': J did not submit one real attack');
  assert.equal(await evaluate('document.activeElement.id'), 'annual-review-toggle',
    label + ': J moved focus away from the restored button');
}

try {
  let available = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch('http://127.0.0.1:' + port + '/json/version')).ok) {
        available = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  assert(available, 'Chrome unavailable');
  const page = await (
    await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })
  ).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task = pending.get(message.id);
      if (task) {
        pending.delete(message.id);
        message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result);
      }
      return;
    }
    if (message.method === 'Runtime.exceptionThrown')
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text
      );
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response,
        path = new URL(response.url).pathname;
      if (response.status >= 400 && !path.startsWith('/api/'))
        failedResources.push({ url: response.url, status: response.status });
    }
    if (message.method === 'Network.requestWillBeSent') {
      const path = new URL(message.params.request.url).pathname;
      if (!['/api/input', '/api/attack', '/api/action'].includes(path)) return;
      let payload;
      try {
        payload = JSON.parse(message.params.request.postData || '{}');
      } catch {
        payload = { raw: message.params.request.postData };
      }
      const request = { time: Date.now(), payload };
      if (path === '/api/input') inputRequests.push(request);
      else actionRequests.push({ ...request, path });
    }
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `if(window===window.top){window.__integrationMessages=[];window.addEventListener('message',event=>{const frame=document.getElementById('annual-review-frame');window.__integrationMessages.push({time:performance.now(),origin:event.origin,fromFrame:!!frame&&event.source===frame.contentWindow,data:event.data});});}`
  });
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await call('Page.navigate', { url: baseURL });
  await call('Page.bringToFront');
  await wait(
    'document.readyState==="complete" && !!document.getElementById("office") && !!document.getElementById("join-page") && !!document.getElementById("annual-review-frame")'
  );
  await wait('document.getElementById("annual-review-overlay").open');
  await waitChild(
    'document.readyState==="complete" && document.getElementById("review-dialog")?.open && document.getElementById("book-stage")?.dataset.mode==="cover" && !!window.AnnualArt'
  );
  await child('window.AnnualArt.ready');
  await delay(180);
  await evaluate(
    `window.__integrationOriginal={document,canvas:document.getElementById('office'),shell:document.querySelector('.shell'),join:document.getElementById('join-page'),frame:document.getElementById('annual-review-frame'),styles:{bodyClass:document.body.className,bodyStyle:document.body.getAttribute('style'),background:getComputedStyle(document.body).backgroundImage,font:getComputedStyle(document.body).fontFamily}}`
  );

  await check('The real game hosts the initial review in a same-origin iframe', async () => {
    assert.match(await evaluate('document.title'), /S-ID/);
    assert.equal(
      await evaluate('document.getElementById("office") instanceof HTMLCanvasElement'),
      true
    );
    assert.equal(await evaluate('document.querySelector(".lobby")'), null);
    assert.equal(await evaluate('document.getElementById("review-dialog")'), null);
    assert.equal(
      await evaluate(`document.querySelectorAll('link[href^="/annual-review/"]').length`),
      0,
      'Book CSS leaked into the game'
    );
    assert.equal(
      await evaluate('new URL(document.getElementById("annual-review-frame").src).pathname'),
      '/annual-review/'
    );
    assert.equal(
      await evaluate(
        'new URL(document.getElementById("annual-review-frame").src).searchParams.get("embed")'
      ),
      'game'
    );
    assert.equal(
      await child('document.documentElement.classList.contains("embedded-review")'),
      true
    );
    assert.equal(
      await child('window.getComputedStyle(document.querySelector(".lobby")).display'),
      'none'
    );
    assert.equal(await child('window.getComputedStyle(document.body).backgroundImage'), 'none');
    assert.equal(
      await child('window.getComputedStyle(document.body).backgroundColor'),
      'rgba(0, 0, 0, 0)'
    );
    await cover();
    await geometry('1440 cover');
    await capture('integration-01-cover-1440.png');
  });

  await check('Forged close messages from the host window do not dismiss the review', async () => {
    await evaluate(`window.postMessage({type:'annual-review:closed'},location.origin)`);
    await delay(200);
    assert.equal(await hostOpen(), true);
  });

  await check('Keyboard focus on the host modal cannot operate the game beneath it', async () => {
    const baseline = inputRequests.length;
    const actionBaseline = actionRequests.length;
    await evaluate(
      'document.getElementById("annual-review-overlay").tabIndex=-1;document.getElementById("annual-review-overlay").focus()'
    );
    assert.equal(await evaluate('document.activeElement.id'), 'annual-review-overlay');
    for (const [letter, code] of [
      ['r', 'KeyR'],
      ['l', 'KeyL'],
      ['h', 'KeyH'],
      ['w', 'KeyW'],
      ['a', 'KeyA'],
      ['s', 'KeyS'],
      ['d', 'KeyD'],
      ['j', 'KeyJ'],
      ['k', 'KeyK']
    ])
      await key(letter, code);
    await delay(150);
    assert.equal(
      await evaluate(
        'document.getElementById("roster").hidden && document.getElementById("ranking").hidden && !document.getElementById("rules-view").open'
      ),
      true
    );
    assert.equal(await hostOpen(), true);
    assert.equal(actionRequests.length, actionBaseline, 'J escaped the review modal');
    assert(
      inputRequests
        .slice(baseline)
        .every(({ payload }) => !payload.up && !payload.down && !payload.left && !payload.right),
      'Movement escaped the review modal'
    );
  });

  await check(
    'A real child Escape closes the book, fades the cover, and reveals the preserved game',
    async () => {
      await openBook();
      await geometry('1440 open');
      await capture('integration-03-open-1440.png');
      await traceExit('Escape', '1440 initial Escape');
      assert.equal(await evaluate('document.activeElement.id'), 'annual-review-toggle');
      await capture('integration-02-home-1440.png');
    }
  );

  await check(
    'J works with restored button focus after initial and later closes, and reading blocks game actions',
    async () => {
      await evaluate(
        'document.getElementById("nickname").value="预览检查";document.getElementById("join-form").requestSubmit()'
      );
      await wait('document.getElementById("join-page").hidden');
      await attackWithRestoredFocus('First automatic review close');
      const player = await evaluate(
        'fetch("/api/state").then(r=>r.json()).then(s=>{const p=s.players.find(p=>p.id===s.me.id);return{id:p.id,x:p.x,y:p.y};})'
      );
      await evaluate('document.getElementById("office").focus()');
      await call('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'w',
        code: 'KeyW',
        windowsVirtualKeyCode: 87
      });
      const baseline = inputRequests.length;
      await reopen();
      await openBook();
      await delay(200);
      const stopped = await evaluate(
        'fetch("/api/state").then(r=>r.json()).then(s=>{const p=s.players.find(p=>p.id===s.me.id);return{id:p.id,x:p.x,y:p.y};})'
      );
      await delay(250);
      const still = await evaluate(
        'fetch("/api/state").then(r=>r.json()).then(s=>{const p=s.players.find(p=>p.id===s.me.id);return{id:p.id,x:p.x,y:p.y};})'
      );
      assert.equal(stopped.id, player.id);
      assert.deepEqual(still, stopped, 'The player kept moving beneath the book');
      assert(
        inputRequests
          .slice(baseline)
          .some(({ payload }) => !payload.up && !payload.down && !payload.left && !payload.right),
        'Opening the book did not release the held movement key'
      );
      const actionBaseline = actionRequests.length;
      await key('j', 'KeyJ');
      await evaluate('document.getElementById("annual-review-overlay").focus()');
      await key('j', 'KeyJ');
      await delay(150);
      assert.equal(actionRequests.length, actionBaseline,
        'J submitted an attack/action while the joined player was reading');
      await traceExit('Escape', 'joined player Escape');
      await call('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'w',
        code: 'KeyW',
        windowsVirtualKeyCode: 87
      });
      assert.equal(await evaluate('document.getElementById("join-page").hidden'), true);
      assert.equal(
        await evaluate('fetch("/api/state").then(r=>r.json()).then(s=>s.me.id)'),
        player.id
      );
      await attackWithRestoredFocus('Manually reopened review close');
      await capture('integration-07-joined-game-1440.png');
    }
  );
  await check(
    'The original game toolbar and real keyboard shortcuts work after closing',
    gameControls
  );

  await check(
    'Reopening from the toolbar resets pagination, and X closes without rebuilding the game',
    async () => {
      await reopen();
      await openBook();
      const first = await child('document.getElementById("page-progress").textContent');
      await realChildClick('#next-page');
      await idle();
      assert.notEqual(await child('document.getElementById("page-progress").textContent'), first);
      await traceExit('X', '1440 paginated X');
      await reopen();
      await cover();
      await openBook();
      assert.equal(await child('document.getElementById("page-progress").textContent'), first);
      await traceExit('Escape', '1440 reset Escape');
    }
  );

  for (const [width, height] of [
    [1280, 720],
    [1920, 1080]
  ]) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false
    });
    await delay(180);
    await check(
      `${width}x${height}: the review opens, fits, closes, and leaves the game visible`,
      async () => {
        await reopen();
        await geometry(width + ' cover');
        await capture(`integration-04-cover-${width}.png`);
        await openBook();
        await geometry(width + ' open');
        await capture(`integration-05-open-${width}.png`);
        await traceExit('X', width + ' X');
        assert.equal(
          await evaluate('document.getElementById("office").getBoundingClientRect().width>0'),
          true
        );
        assert.equal(
          await evaluate('getComputedStyle(document.getElementById("office")).visibility'),
          'visible'
        );
        await capture(`integration-06-home-${width}.png`);
      }
    );
  }

  await check(
    'The host receives genuine lifecycle messages and all static resources load without JavaScript errors',
    async () => {
      const messages = await evaluate('window.__integrationMessages');
      const genuine = messages.filter(
        (message) => message.fromFrame && message.origin === new URL(baseURL).origin
      );
      for (const type of ['annual-review:ready', 'annual-review:fading', 'annual-review:closed'])
        assert(
          genuine.some((message) => message.data?.type === type),
          'Missing genuine ' + type + ' message'
        );
      assert.deepEqual(errors, []);
      assert.deepEqual(failedResources, []);
    }
  );
  writeFileSync(
    join(out, 'verification-integration.json'),
    JSON.stringify(
      {
        url: baseURL,
        passed,
        errors,
        failedResources,
        inputRequests,
        actionRequests,
        messages: await evaluate('window.__integrationMessages'),
        exitTraces
      },
      null,
      2
    )
  );
  console.log('All ' + passed.length + ' integration checks passed.');
} catch (error) {
  try {
    await capture('integration-failure.png');
    const state = await evaluate(
      `(()=>{const host=document.getElementById('annual-review-overlay'),frame=document.getElementById('annual-review-frame'),doc=frame?.contentDocument;return{url:location.href,hostOpen:host?.open,childURL:doc?.URL,childOpen:doc?.getElementById('review-dialog')?.open,mode:doc?.getElementById('book-stage')?.dataset.mode,busy:doc?.getElementById('book-stage')?.dataset.busy,exiting:doc?.getElementById('review-dialog')?.dataset.exiting,messages:window.__integrationMessages,exitTrace:window.__integrationExitTrace};})()`
    );
    writeFileSync(
      join(out, 'verification-integration-failure.json'),
      JSON.stringify(
        {
          check: activeCheck,
          error: error.stack,
          passed,
          errors,
          failedResources,
          inputRequests,
          actionRequests,
          exitTraces,
          state
        },
        null,
        2
      )
    );
  } catch (diagnosticError) {
    console.error('Could not capture integration diagnostics:', diagnosticError.message);
  }
  throw error;
} finally {
  for (const task of pending.values()) task.reject(Error('Browser closed'));
  socket?.close();
  browser.kill();
}
