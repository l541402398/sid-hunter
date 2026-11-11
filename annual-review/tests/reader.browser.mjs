import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { resolveChrome } from './browser.cjs';
const testDir = dirname(fileURLToPath(import.meta.url)),
  root = resolve(testDir, '..'),
  out = resolve(testDir, '../../outputs/annual-review-book');
const urlIndex = process.argv.indexOf('--url');
const baseURL =
  process.argv.find((arg) => arg.startsWith('--url='))?.slice(6) ||
  (urlIndex >= 0 ? process.argv[urlIndex + 1] : undefined) ||
  process.env.REVIEW_URL ||
  'http://127.0.0.1:8790/annual-review/';
const exitOnly = process.argv.includes('--exit-only'),
  coverOnly = process.argv.includes('--cover-only'),
  symmetryOnly = process.argv.includes('--symmetry-only'),
  exitCase = process.argv.find((a) => a.startsWith('--exit-case='))?.slice('--exit-case='.length);
mkdirSync(out, { recursive: true });
const profile = mkdtempSync(join(out, '.browser-profile-'));
const net = createServer();
await new Promise((r) => net.listen(0, '127.0.0.1', r));
const port = net.address().port;
await new Promise((r) => net.close(r));
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
  passed = [],
  symmetrySamples = [],
  curlSamples = [];
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const seq = ++id;
    const t = setTimeout(() => {
      pending.delete(seq);
      reject(Error('CDP timeout ' + method));
    }, 15000);
    pending.set(seq, {
      resolve: (r) => {
        clearTimeout(t);
        resolve(r);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      }
    });
    socket.send(JSON.stringify({ id: seq, method, params }));
  });
async function evaluate(expression) {
  const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails)
    throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function wait(expression, timeout = 8000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(expression)) return;
    await delay(70);
  }
  throw Error('Timed out: ' + expression);
}
const click = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
const chapter = (type) => evaluate(`document.querySelector('[data-chapter="${type}"]').click()`);
async function mousePoint(selector, { blank = false } = {}) {
  const point = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(
      selector
    )});if(!e)return null;const r=e.getBoundingClientRect();for(const y of [.5,.25,.75,.1,.9,.04,.96])for(const x of [.5,.25,.75,.1,.9,.04,.96]){const p={x:r.left+r.width*x,y:r.top+r.height*y},hit=document.elementFromPoint(p.x,p.y);if(hit&&e.contains(hit)&&!(${blank}&&(hit.closest('button,a,input,textarea,select,[contenteditable],[role="button"]')||hit.matches('canvas,img,svg,svg *')||hit.childNodes.length&&[...hit.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()))))return p;}return null;})()`
  );
  assert(point, `No visible mouse target for ${selector}`);
  return point;
}
async function mouseClickAt(point, clickCount = 1) {
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...point,
    button: 'left',
    buttons: 1,
    clickCount
  });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...point,
    button: 'left',
    buttons: 0,
    clickCount
  });
}
const mouseClick = async (selector, options) => mouseClickAt(await mousePoint(selector, options));
const progress = () => evaluate('document.getElementById("page-progress").textContent');
async function selectTextWithMouse(selector) {
  const points = await evaluate(
    `(()=>{const e=document.querySelector(${JSON.stringify(
      selector
    )}),node=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim().length>4);if(!node)return null;const range=document.createRange();range.setStart(node,1);range.setEnd(node,Math.min(node.length,12));const r=range.getClientRects()[0];return{start:{x:r.left+1,y:r.top+r.height/2},end:{x:r.right-1,y:r.top+r.height/2}};})()`
  );
  assert(points, 'No visible text available for mouse selection');
  await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...points.start });
  await call('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    ...points.start,
    button: 'left',
    buttons: 1,
    clickCount: 1
  });
  for (let step = 1; step <= 6; step++)
    await call('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: points.start.x + ((points.end.x - points.start.x) * step) / 6,
      y: points.start.y,
      button: 'left',
      buttons: 1
    });
  await call('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    ...points.end,
    button: 'left',
    buttons: 0,
    clickCount: 1
  });
}
const idle = () => wait('document.getElementById("book-stage").dataset.busy==="false"');
async function key(name) {
  const code = { Escape: 27, ArrowLeft: 37, ArrowRight: 39 }[name];
  await call('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: name,
    code: name,
    windowsVirtualKeyCode: code
  });
  await call('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: name,
    code: name,
    windowsVirtualKeyCode: code
  });
}
const openReader = () => evaluate('document.querySelector("[data-open-review]").click()');
const mode = () => evaluate('document.getElementById("book-stage").dataset.mode');
const chapterTitle = () => evaluate('document.getElementById("chapter-title").textContent');
const noBookAnimations =
  '[document.getElementById("hard-cover"),document.getElementById("volume"),document.getElementById("left-backing"),document.querySelector(".book-gutter"),document.getElementById("turning-leaf"),document.getElementById("review-dialog")].every(e=>e.getAnimations().length===0)';
async function openBook() {
  await click('start-review');
  await idle();
  assert.equal(await mode(), 'open');
}
async function assertCover() {
  assert.equal(await mode(), 'cover');
  assert.equal(await evaluate('document.getElementById("spread").hidden'), true);
  assert.equal(await chapterTitle(), '开篇寄语');
  assert.equal(await evaluate(noBookAnimations), true);
}
function quadsDoNotOverlap(a, b, tolerance = 0.6) {
  const points = quad => Array.from({ length: 4 }, (_, i) => ({ x: quad[i * 2], y: quad[i * 2 + 1] }));
  const left = points(a), right = points(b);
  for (const quad of [left, right]) {
    for (let i = 0; i < quad.length; i++) {
      const p = quad[i], q = quad[(i + 1) % quad.length],
        length = Math.hypot(q.x - p.x, q.y - p.y),
        normal = { x: -(q.y - p.y) / length, y: (q.x - p.x) / length },
        project = points => points.map(point => point.x * normal.x + point.y * normal.y),
        aRange = project(left), bRange = project(right);
      if (
        Math.max(...aRange) <= Math.min(...bRange) + tolerance ||
        Math.max(...bRange) <= Math.min(...aRange) + tolerance
      ) return true;
    }
  }
  return false;
}
async function verifyInvitationLayout(label) {
  const layout = await evaluate(
    `(async () => {
      const cover = document.getElementById('cover-front'),
        row = cover.querySelector('.cover-invitation-row'),
        art = cover.querySelector('.cover-invitation-art'),
        brand = cover.querySelector('.cover-library-mark'),
        image = art?.querySelector('img.juli-invitation'),
        button = document.getElementById('start-review');
      if (!image) throw Error('Missing JULI invitation image inside the cover');
      await image.decode();
      const rect = element => {
        const {left, top, right, bottom, width, height} = element.getBoundingClientRect();
        return {left, top, right, bottom, width, height};
      };
      if (!window.__invitationAlphaBounds) {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let left = canvas.width, top = canvas.height, right = 0, bottom = 0;
        for (let y = 0; y < canvas.height; y++) {
          for (let x = 0; x < canvas.width; x++) {
            if (pixels[(y * canvas.width + x) * 4 + 3] <= 16) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
        }
        window.__invitationAlphaBounds = {left, top, right, bottom};
      }
      const mapToOffsetParent = (element, point) => {
        const style = getComputedStyle(element), [x, y] = style.transformOrigin.split(' ').map(parseFloat);
        return new DOMMatrix().translate(element.offsetLeft, element.offsetTop).translate(x, y)
          .multiply(new DOMMatrix(style.transform)).translate(-x, -y).transformPoint(point);
      };
      const localButtonCenter = mapToOffsetParent(button, new DOMPoint(button.offsetWidth / 2, button.offsetHeight / 2)),
        coverButtonCenter = mapToOffsetParent(row, localButtonCenter),
        coverArtCenter = mapToOffsetParent(art, new DOMPoint(art.offsetWidth / 2, art.offsetHeight / 2)),
        coverBrandCenter = brand && mapToOffsetParent(brand, new DOMPoint(brand.offsetWidth / 2, brand.offsetHeight / 2)),
        {left, top, right, bottom} = window.__invitationAlphaBounds;
      const points = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([x, y]) =>
        mapToOffsetParent(image, new DOMPoint(x * image.offsetWidth / image.naturalWidth, y * image.offsetHeight / image.naturalHeight))
      );
      return {
        cover: rect(cover), row: rect(row), art: rect(art), button: rect(button),
        source: new URL(image.src).pathname, decoded: image.naturalWidth > 0 && image.naturalHeight > 0,
        buttonAlone: row.children.length === 1 && row.firstElementChild === button,
        buttonText: button.textContent.trim(), edition: /OUR YEAR/i.test(cover.textContent),
        oldWatermark: !!cover.querySelector('.cover-monogram'),
        brand: brand && {
          text: brand.textContent.trim(), width: brand.offsetWidth, height: brand.offsetHeight,
          x: coverBrandCenter.x, y: coverBrandCenter.y, rect: rect(brand),
          attachedToCover: brand.offsetParent === cover
        },
        localCenter: {
          correctParents: button.offsetParent === row && row.offsetParent === cover && art.offsetParent === cover,
          buttonInRow: localButtonCenter.x, row: row.clientWidth / 2,
          buttonInCover: {x: coverButtonCenter.x, y: coverButtonCenter.y},
          artInCover: {x: coverArtCenter.x, y: coverArtCenter.y},
          coverWidth: cover.clientWidth, coverHeight: cover.clientHeight
        },
        artSize: {width: art.clientWidth, height: art.clientHeight},
        ink: {
          left: Math.min(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)),
          right: Math.max(...points.map(p => p.x)), bottom: Math.max(...points.map(p => p.y))
        },
        subtitle: !!cover.querySelector('.cover-subtitle'), oldMascot: !!cover.querySelector('.cover-mascot'),
        viewport: {width: innerWidth, height: innerHeight}
      };
    })()`
  );
  layout.buttonQuad = await projectedQuad('#start-review');
  layout.artQuad = await projectedQuad('.cover-invitation-art');
  if (layout.brand) layout.brandQuad = await projectedQuad('.cover-library-mark');
  writeFileSync(
    join(out, 'invitation-layout-' + label.replace(/[^a-z0-9-]/gi, '-') + '.json'),
    JSON.stringify({ label, ...layout }, null, 2)
  );
  assert(layout.decoded, label + ': the invitation PNG did not decode');
  assert.match(layout.source, /\/assets\/juli-invitation\.png$/);
  assert.equal(layout.subtitle, false);
  assert.equal(layout.oldMascot, false);
  assert.equal(layout.edition, false, label + ': remove the English footer from the cover');
  assert.equal(layout.buttonText, '开启年度回忆', label + ': the opening button needs a text-only label');
  assert.equal(layout.buttonAlone, true, label + ': the opening button needs its own centered row');
  assert.equal(layout.localCenter.correctParents, true, label + ': opening action has an unexpected coordinate parent');
  assert(Math.abs(layout.localCenter.buttonInRow - layout.localCenter.row) < 0.6,
    label + ': the opening button is not centered in its row');
  const { buttonInCover, artInCover, coverWidth, coverHeight } = layout.localCenter;
  assert(Math.abs(buttonInCover.x - coverWidth / 2) < coverWidth * 0.04,
    label + ': the opening action is not centered on the cover');
  assert(buttonInCover.y / coverHeight >= 0.67 && buttonInCover.y / coverHeight <= 0.76,
    label + ': the opening action should anchor the lower part of the cover');
  assert(layout.button.width >= 200 && layout.button.height >= 44,
    label + ': the opening button should be a prominent, usable action');
  assert(
    quadsDoNotOverlap(layout.buttonQuad, layout.artQuad),
    label + ': JULI must not overlap the opening button'
  );
  assert(layout.artSize.width / coverWidth >= 0.16 && layout.artSize.width / coverWidth <= 0.26,
    label + ': JULI should occupy about a fifth of the cover width');
  assert(artInCover.x > coverWidth * 0.6 && artInCover.x < coverWidth * 0.85 &&
    artInCover.y > buttonInCover.y && artInCover.y < coverHeight * 0.91,
    label + ': JULI should guide attention toward the lower opening action');
  assert(artInCover.x - buttonInCover.x < coverWidth * 0.35 &&
    artInCover.y - buttonInCover.y < coverHeight * 0.2,
    label + ': JULI and the opening action should form one nearby group');
  assert.equal(layout.oldWatermark, false, label + ': the oversized central watermark must be removed');
  assert(layout.brand && /CQRD/.test(layout.brand.text), label + ': the cover needs its CQRD library mark');
  assert(layout.brand.attachedToCover && layout.brand.width < coverWidth * 0.25 &&
    layout.brand.height < coverHeight * 0.2 && layout.brand.x < coverWidth * 0.4 &&
    layout.brand.y > coverHeight * 0.78,
    label + ': the brand should be a small lower-left library mark');
  assert(quadsDoNotOverlap(layout.brandQuad, layout.buttonQuad) &&
    quadsDoNotOverlap(layout.brandQuad, layout.artQuad),
    label + ': the library mark must not compete with the opening action or JULI');
  for (const [name, r] of [['button', layout.button], ['JULI', layout.art]]) {
    assert(
      r.left >= layout.cover.left - 0.6 && r.top >= layout.cover.top - 0.6 &&
      r.right <= layout.cover.right + 0.6 && r.bottom <= layout.cover.bottom + 0.6,
      label + ': ' + name + ' extends outside the cover'
    );
    assert(
      r.left >= -0.6 && r.top >= -0.6 &&
      r.right <= layout.viewport.width + 0.6 && r.bottom <= layout.viewport.height + 0.6,
      label + ': ' + name + ' extends outside the viewport'
    );
  }
  assert(
    layout.ink.left >= -0.6 && layout.ink.top >= -0.6 &&
    layout.ink.right <= layout.artSize.width + 0.6 && layout.ink.bottom <= layout.artSize.height + 0.6,
    label + ': the invitation crop cuts into JULI'
  );
}
async function capture(file) {
  await evaluate('document.activeElement?.blur()');
  await delay(120);
  const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(out, file), Buffer.from(r.data, 'base64'));
}
async function check(name, fn) {
  activeCheck = name;
  await fn();
  passed.push(name);
  console.log('PASS ' + name);
}
async function exitDiagnostics(name, error) {
  const state = await evaluate(
    `(()=>{const dialog=document.getElementById('review-dialog'),stage=document.getElementById('book-stage');return{samples:window.__exitSamples||[],originalFinished:window.__originalFinished||[],events:window.__exitEvents||[],actions:window.__exitActions||[],current:{time:performance.now(),mode:stage?.dataset.mode,busy:stage?.dataset.busy,open:dialog?.open,exiting:dialog?.dataset.exiting,opacity:dialog?getComputedStyle(dialog).opacity:null,hidden:document.hidden,chapter:document.getElementById('chapter-title')?.textContent,progress:document.getElementById('page-progress')?.textContent,animations:document.getAnimations().filter(a=>Number.isFinite(Number(a.effect?.getTiming().iterations))).map(a=>({target:a.effect?.target?.id||a.effect?.target?.className,state:a.playState,currentTime:a.currentTime,duration:a.effect?.getTiming().duration}))}};})()`
  );
  writeFileSync(
    join(out, `exit-${name.replace(/[^a-z0-9-]/gi, '-')}.json`),
    JSON.stringify(
      {
        name,
        error: error?.stack || null,
        errors: [...errors],
        failedResources: [...failedResources],
        ...state
      },
      null,
      2
    )
  );
  return state;
}
const ready =
  'document.readyState==="complete" && document.getElementById("review-dialog").open && window.AnnualArt && window.AnnualContent';
const expectedHonors = [
  ['CodeX使用次数榜首', '3024', [['蔡修明', '090911']]],
  ['CodeX采纳率榜首', '57', [['蔡修明', '090911']]],
  ['TestX使用次数榜首', '269', [['凌亚男', '091013']]],
  ['个人信度值榜首', '180.5', [['刁华林', '090212']]],
  ['代码高产小能手', '427860', [['张玉', '090641']]],
  ['用例数“C位”', '8008', [['吴四维', '091113']]],
  ['上线“常驻嘉宾”', '423', [['董长方', '091540']]],
  ['科创成果大户人家', '9', [['陈凯', '090071']]],
  [
    '认证追光者',
    '5',
    [
      ['陈浪', '090315'],
      ['屠琦', '090734']
    ]
  ],
  ['组织培训数稳居首位', '18', [['谢艳秋', '090604']]],
  ['瓢虫社区发文活跃王', '20', [['龚川林', '091188']]],
  [
    '评优“显眼包”',
    '7',
    [
      ['尹成龙', '090577'],
      ['杨鑫', '091560']
    ]
  ],
  ['值班劳模', '54', [['张欢', '090644']]],
  ['工作时长代言人', '2860', [['屠琦', '090734']]],
  ['食堂荣誉干饭人', '704', [['王元宏', '091518']]],
  ['参与工会活动“卷王”', '42', [['王林', '091400']]],
  ['数字粒收割机', '4585', [['杨京翰', '090154']]],
  ['最长待机面试官', '59', [['黎建宗', '090015']]],
  ['issue处理最多', '192', [['杨京翰', '090154']]],
  ['issue提出最多', '134', [['董恩思', '090203']]]
].map(([label, value, winners], i) => ({
  id: `honor-${i + 1}`,
  label,
  value,
  unit: [
    '次',
    '%',
    '次',
    '',
    '行',
    '条',
    '次',
    '次',
    '次',
    '次',
    '篇',
    '次',
    '次',
    '小时',
    '次',
    '次',
    '粒',
    '次',
    '条',
    '条'
  ][i],
  winners: winners.map(([name, employeeId]) => ({ name, employeeId })),
  sourceRow: i + 2
}));
const readHonorCards = () =>
  evaluate(
    `([...document.querySelectorAll('#spread .person-card')].map(c=>({id:c.dataset.person,label:c.querySelector('.honor-title')?.textContent.trim(),value:c.querySelector('.person-metric strong')?.textContent.trim(),unit:c.querySelector('.person-metric span')?.textContent.trim()||'',winners:[...c.querySelectorAll('.honor-winner')].map(w=>({name:w.querySelector('h4')?.textContent.trim(),employeeId:w.querySelector('.employee-id')?.textContent.replace('工号','').trim()})),metricCount:c.querySelectorAll('.person-metric').length,titleCount:c.querySelectorAll('.honor-title').length,portraitCount:c.querySelectorAll('.honor-portraits .portrait-mount img').length,portraitsLoaded:[...c.querySelectorAll('.honor-portraits .portrait-mount img')].every(img=>img.complete&&img.naturalWidth>0),readingOrder:(()=>{const winners=[...c.querySelectorAll('.honor-winner')],title=c.querySelector('.honor-title')?.getBoundingClientRect(),metric=c.querySelector('.person-metric')?.getBoundingClientRect();return winners.length>0&&!!title&&!!metric&&winners.every(w=>w.getBoundingClientRect().bottom<=title.top+.5)&&title.bottom<=metric.top+.5;})(),hasStory:!!c.querySelector('.person-event,.read-person,[data-read-person]')})))`
  );
function assertHonorCards(cards, group) {
  const expected = expectedHonors.slice(group * 4, group * 4 + 4);
  assert.equal(cards.length, 4, 'A spread must contain four honor items');
  cards.forEach((card, i) => {
    const { sourceRow, ...honor } = expected[i];
    assert.deepEqual(
      card,
      {
        ...honor,
        metricCount: 1,
        titleCount: 1,
        portraitCount: honor.winners.length,
        portraitsLoaded: true,
        readingOrder: true,
        hasStory: false
      },
      `${honor.id}: title, metric, winners and portraits must match the workbook`
    );
  });
}
// Check each paper's local layout; projected viewport boxes lose their containment relationship under perspective.
const noClip = `(()=>{const s=document.getElementById('spread');window.__layoutFailures=[...s.querySelectorAll('.page-header-row,.page-header-row h3,.person-card,.honor-title,.honor-winner,.honor-winner h4,.employee-id,.person-metric,.person-metric strong,.person-metric span,.honor-portraits,.letter,.personal-stats,.timeline-item,.page-title,.ending-page')].map(e=>{const page=e.closest('.paper-page');let node=e,x=0,y=0;while(node&&node!==page){x+=node.offsetLeft;y+=node.offsetTop;node=node.offsetParent;}const clipsY=['hidden','clip','scroll','auto'].includes(getComputedStyle(e).overflowY);const textFits=!(e.closest('.person-card')||e.matches('.page-header-row h3'))||(!e.clientWidth||e.scrollWidth<=e.clientWidth+1)&&(!clipsY||!e.clientHeight||e.scrollHeight<=e.clientHeight+1);return{tag:e.tagName,className:e.className,text:e.textContent.trim().slice(0,40),x,y,width:e.offsetWidth,height:e.offsetHeight,pageWidth:page.clientWidth,pageHeight:page.clientHeight,client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight],ok:node===page&&x>=0&&y>=0&&x+e.offsetWidth<=page.clientWidth+.5&&y+e.offsetHeight<=page.clientHeight-15+.5&&textFits};}).filter(e=>!e.ok);return __layoutFailures.length===0;})()`;
async function projectedQuad(selector) {
  const { root } = await call('DOM.getDocument');
  const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert(nodeId, `Missing geometry target ${selector}`);
  return (await call('DOM.getBoxModel', { nodeId })).model.border;
}
async function paperGeometry(selector) {
  return {
    paper: await projectedQuad(selector),
    running: await projectedQuad(`${selector} .page-running`),
    layout: await evaluate(
      `(()=>{const e=document.querySelector(${JSON.stringify(
        selector
      )}),s=getComputedStyle(e);return{width:e.clientWidth,height:e.clientHeight,padding:s.padding,borderRadius:s.borderRadius};})()`
    )
  };
}
function matchingPaper(actual, expected, label) {
  for (const part of ['paper', 'running'])
    assert(
      actual[part].every((value, i) => Math.abs(value - expected[part][i]) < 0.6),
      `${label}: ${part} projected corners do not match static paper`
    );
  assert.deepEqual(actual.layout, expected.layout, `${label}: paper layout differs`);
}
async function readCurl(label, phase) {
  const sample = await evaluate(
    `(()=>{
      const leaf=document.getElementById('turning-leaf'),strips=[...leaf.querySelectorAll('.leaf-strip')],last=strips.at(-1);
      const animations=leaf.getAnimations().map(animation=>({playState:animation.playState,currentTime:animation.currentTime,startTime:animation.startTime,timing:animation.effect.getTiming(),computedTiming:animation.effect.getComputedTiming(),keyframes:animation.effect.getKeyframes()}));
      if(!last)return{count:0,curl:0,width:leaf.clientWidth,z:0,angles:[],bendAngles:[],animations};
      const chain=[];
      for(let node=last;node&&node!==leaf;node=node.parentElement)if(node.matches('.leaf-strip'))chain.unshift(node);
      let matrix=new DOMMatrix();
      for(const strip of chain){
        const style=getComputedStyle(strip),origin=style.transformOrigin.split(' ').map(parseFloat);
        matrix=matrix.translate(strip.offsetLeft,strip.offsetTop).translate(origin[0],origin[1]).multiply(new DOMMatrix(style.transform)).translate(-origin[0],-origin[1]);
      }
      const transforms=strips.map(strip=>new DOMMatrix(getComputedStyle(strip).transform));
      return{count:strips.length,width:leaf.clientWidth,curl:Number(getComputedStyle(leaf).getPropertyValue('--page-curl')),z:matrix.transformPoint(new DOMPoint(last.offsetWidth,0,0)).z,angles:transforms.map(transform=>transform.m13),bendAngles:transforms.map(transform=>Math.atan2(-transform.m13,transform.m11)),stripStyles:strips.map(strip=>{const style=getComputedStyle(strip);return{curl:style.getPropertyValue('--page-curl'),angle:style.getPropertyValue('--strip-angle'),transform:style.transform,transformOrigin:style.transformOrigin,width:strip.offsetWidth,left:strip.offsetLeft};}),animations};
    })()`
  );
  curlSamples.push({ label, phase, ...sample });
  writeFileSync(join(out, 'curl-geometry.json'), JSON.stringify(curlSamples, null, 2));
  return sample;
}
async function seekPageTurn(fraction) {
  await evaluate(
    '__turnMotions.forEach(a=>a.currentTime=Number(a.effect.getTiming().duration)*' + fraction + ')'
  );
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
}
async function samplePageTurn(action, label, forward = true) {
  const origin = await paperGeometry(forward ? '#right-page' : '#left-page');
  await action();
  await evaluate(
    'window.__turnMotions=[...document.getElementById("turning-leaf").getAnimations(),...document.getElementById("volume").getAnimations()];Promise.all(__turnMotions.map(a=>{a.pause();return a.ready;}))'
  );
  assert.equal(
    await evaluate('__turnMotions.length>=1 && __turnMotions.every(a=>a.playState==="paused")'),
    true
  );
  await seekPageTurn(0);
  const startCurl = await readCurl(label, 'start');
  assert(startCurl.count >= 16, label + ': the turning page needs a continuous curved surface');
  assert(Math.abs(startCurl.z) < 0.1, label + ': the page must start flat');
  matchingPaper(
    await paperGeometry(forward ? '#leaf-front' : '#leaf-back'),
    origin,
    `${label} start`
  );
  const hinge = await projectedQuad('#turning-leaf'),
    curvedFrames = [];
  for (const fraction of [0.25, 0.5, 0.75]) {
    await seekPageTurn(fraction);
    const sample = await readCurl(label, fraction === 0.5 ? 'middle' : String(fraction)),
      quad = await projectedQuad('#turning-leaf');
    curvedFrames.push(sample);
    assert.equal(sample.count, startCurl.count, label + ': the paper surface changed while turning');
    assert(Math.abs(sample.curl) > 0.1, label + ': no paper curl at ' + fraction);
    assert(Math.abs(sample.z) > sample.width * 0.01,
      label + ': the outer edge stays flat at ' + fraction);
    assert(Math.abs(sample.z) < sample.width * 0.45,
      label + ': the paper rolls into an exaggerated tube at ' + fraction);
    assert(sample.bendAngles.filter(angle => Math.abs(angle) > 0.001).length >= 12,
      label + ': the page bends at a few hard folds instead of a continuous arc');
    assert(Math.max(...sample.bendAngles.map(Math.abs)) < Math.PI / 24,
      label + ': an individual paper joint forms a visible crease');
    for (const index of [0, 1, 6, 7])
      assert(Math.abs(quad[index] - hinge[index]) < 0.6,
        label + ': the book hinge drifts during the turn');
    assert.equal(await evaluate('document.getElementById("next-page").disabled'), true);
    await capture(`motion-${label}-${Math.round(fraction * 100)}.png`);
  }
  const middleCurl = curvedFrames[1];
  assert(Math.max(...curvedFrames.map(sample => Math.abs(sample.z) / sample.width)) > 0.03,
    label + ': the paper never forms a visible curve');
  if (!forward) {
    const outward = curlSamples.find(sample => sample.label === 'page-turn-forward' && sample.phase === 'middle');
    assert(outward && outward.z * middleCurl.z < 0, 'Forward and backward turns must curl in opposite directions');
  }
  assert.equal(await evaluate('document.getElementById("turning-leaf").hidden'), false);
  assert.equal(await evaluate('document.getElementById("next-page").disabled'), true);
  await click('next-page');
  await seekPageTurn(1);
  const endpoint = await paperGeometry(forward ? '#leaf-back' : '#leaf-front');
  const endCurl = await readCurl(label, 'end');
  assert(Math.abs(endCurl.z) < 0.1, label + ': the page must lie flat before settling');
  await capture(`motion-${label}-100.png`);
  await evaluate('__turnMotions.forEach(a=>a.finish())');
  await idle();
  matchingPaper(
    endpoint,
    await paperGeometry(forward ? '#left-page' : '#right-page'),
    `${label} finish`
  );
  assert.equal(await evaluate(noBookAnimations), true);
  assert.equal(await evaluate('document.querySelectorAll("#turning-leaf .leaf-strip").length'), 0);
  assert.equal(
    await evaluate('[...document.querySelectorAll("#leaf-front,#leaf-back")].every(e=>getComputedStyle(e).visibility==="visible")'),
    true,
    'The source paper faces must be restored after the curl is removed'
  );
}
const symmetryPairs = [
  ['paper', '#left-page', '#right-page'],
  ['backing', '.backing-left', '.backing-right'],
  ['binding', '.backing-left .binding', '.backing-right .binding'],
  ['edges', '.backing-left .paper-edges', '.backing-right .paper-edges']
];
async function readSymmetry(width, height, chapter) {
  const selectors = ['#volume', ...symmetryPairs.flatMap(([, left, right]) => [left, right])],
    { root } = await call('DOM.getDocument');
  const quads = Object.fromEntries(
    await Promise.all(
      selectors.map(async (selector) => {
        const { nodeId } = await call('DOM.querySelector', { nodeId: root.nodeId, selector });
        assert(nodeId, `Missing symmetry target ${selector}`);
        return [selector, (await call('DOM.getBoxModel', { nodeId })).model.border];
      })
    )
  );
  const styles = await evaluate(
    `(()=>{const selectors=${JSON.stringify(
      selectors
    )},properties=['top','bottom','width','height','opacity','visibility','clipPath','borderTopWidth','borderBottomWidth','borderLeftWidth','borderRightWidth','borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'];const values=Object.fromEntries(selectors.map(selector=>{const e=document.querySelector(selector),s=getComputedStyle(e),matrix=new DOMMatrix(s.transform);return[selector,{...Object.fromEntries(properties.map(p=>[p,s[p]])),clientWidth:e.clientWidth,clientHeight:e.clientHeight,matrix:[matrix.m11,matrix.m12,matrix.m13,matrix.m14,matrix.m21,matrix.m22,matrix.m23,matrix.m24,matrix.m31,matrix.m32,matrix.m33,matrix.m34,matrix.m41,matrix.m42,matrix.m43,matrix.m44]}];}));const volume=getComputedStyle(document.getElementById('volume'));return{values,leftStack:volume.getPropertyValue('--left-stack'),rightStack:volume.getPropertyValue('--right-stack')};})()`
  );
  return { width, height, chapter, quads, ...styles };
}
function assertSymmetry(sample) {
  const label = `${sample.width}x${sample.height}/${sample.chapter}`,
    volume = sample.quads['#volume'],
    axis = (volume[0] + volume[2] + volume[4] + volume[6]) / 4,
    tolerance = 0.6;
  const near = (a, b, message, limit = tolerance) =>
    assert(Math.abs(a - b) <= limit, `${label}: ${message} (${a} versus ${b})`);
  const leftStack = Number.parseFloat(sample.leftStack),
    rightStack = Number.parseFloat(sample.rightStack);
  assert(
    Number.isFinite(leftStack) && leftStack > 0,
    `${label}: the open stack must have visible thickness`
  );
  near(leftStack, rightStack, 'left and right stack thickness', 0.01);
  near(leftStack + rightStack, 16, 'combined paper thickness', 0.01);
  for (const [name, leftSelector, rightSelector] of symmetryPairs) {
    const left = sample.quads[leftSelector],
      right = sample.quads[rightSelector],
      a = sample.values[leftSelector],
      b = sample.values[rightSelector];
    for (const [i, j] of [
      [0, 1],
      [1, 0],
      [2, 3],
      [3, 2]
    ]) {
      near(left[i * 2] + right[j * 2], axis * 2, `${name} corner ${i}: horizontal reflection`);
      near(left[i * 2 + 1], right[j * 2 + 1], `${name} corner ${i}: top/bottom alignment`);
    }
    near(
      Math.max(left[1], left[3], left[5], left[7]) - Math.min(left[1], left[3], left[5], left[7]),
      Math.max(right[1], right[3], right[5], right[7]) -
        Math.min(right[1], right[3], right[5], right[7]),
      `${name}: projected height`
    );
    for (const property of [
      'top',
      'bottom',
      'width',
      'height',
      'clientWidth',
      'clientHeight',
      'opacity',
      'visibility',
      'clipPath',
      'borderTopWidth',
      'borderBottomWidth'
    ])
      assert.equal(a[property], b[property], `${label}: ${name} ${property} differs`);
    for (const [leftProperty, rightProperty] of [
      ['borderLeftWidth', 'borderRightWidth'],
      ['borderRightWidth', 'borderLeftWidth'],
      ['borderTopLeftRadius', 'borderTopRightRadius'],
      ['borderTopRightRadius', 'borderTopLeftRadius'],
      ['borderBottomLeftRadius', 'borderBottomRightRadius'],
      ['borderBottomRightRadius', 'borderBottomLeftRadius']
    ])
      assert.equal(
        a[leftProperty],
        b[rightProperty],
        `${label}: ${name} ${leftProperty} is not mirrored`
      );
    assert.equal(a.clipPath, 'none', `${label}: ${name} is clipped`);
    assert.equal(a.visibility, 'visible');
    assert.equal(a.opacity, '1');
    for (let i = 0; i < 16; i++) {
      const column = Math.floor(i / 4),
        row = i % 4,
        sign = (column === 0) !== (row === 0) ? -1 : 1;
      near(a.matrix[i], sign * b.matrix[i], `${name}: mirrored transform component ${i}`, 0.00001);
    }
    near(left[3], right[1], `${name}: top of the centre seam`);
    near(left[5], right[7], `${name}: no bottom step at the centre seam`);
  }
}
async function verifySymmetry(width, height) {
  for (const type of ['foreword', 'people', 'personal', 'ending']) {
    await chapter(type);
    await idle();
    const sample = await readSymmetry(width, height, type);
    symmetrySamples.push(sample);
    writeFileSync(join(out, 'geometry-symmetry.json'), JSON.stringify(symmetrySamples, null, 2));
    assertSymmetry(sample);
    assert.equal(
      await evaluate(noClip),
      true,
      `${width}x${height}/${type}: text exceeds its local paper bounds`
    );
    await verifyReadingLayout(width, height, type);
  }
}
async function verifyReadingLayout(width, height, type) {
  const layout = await evaluate(
    `(()=>{const rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};},pages=['left','right'].map(side=>{const page=document.getElementById(side+'-page'),folio=page.querySelector('.folio'),number=folio.querySelector('.folio-number');return{side,page:rect(page),folio:rect(folio),number:rect(number),text:number.textContent,position:[...folio.children].indexOf(number),children:folio.children.length};}),book=[...document.querySelectorAll('#volume,#spread .paper-page,.backing .binding,.backing .paper-edges')].map(rect),footer=rect(document.getElementById('open-footer')),controls=[...document.querySelectorAll('#open-footer button,#chapter-bookmarks button,#close-review')].map(rect);return{pages,book,footer,controls,viewport:{width:innerWidth,height:innerHeight},gap:footer.top-Math.max(...book.map(r=>r.bottom))};})()`
  );
  const label = `${width}x${height}/${type}`,
    left = layout.pages[0],
    right = layout.pages[1];
  assert.match(left.text, /^\d+$/);
  assert.match(right.text, /^\d+$/);
  assert.equal(left.position, 0, `${label}: left folio number is not the first element`);
  assert.equal(
    right.position,
    right.children - 1,
    `${label}: right folio number is not the last element`
  );
  assert(
    left.number.right < (left.page.left + left.page.right) / 2,
    `${label}: left folio number must sit at the outer left edge`
  );
  assert(
    right.number.left > (right.page.left + right.page.right) / 2,
    `${label}: right folio number must sit at the outer right edge`
  );
  assert(
    left.number.top > (left.page.top + left.page.bottom) / 2 &&
      right.number.top > (right.page.top + right.page.bottom) / 2,
    `${label}: folio numbers must sit at the bottom`
  );
  const leftInset = left.number.left - left.page.left,
    rightInset = right.page.right - right.number.right;
  assert(
    Math.abs(leftInset - rightInset) < 1,
    `${label}: outer folio insets are not mirrored (${leftInset} versus ${rightInset})`
  );
  assert(
    layout.gap >= 20 - 0.6,
    `${label}: navigation is only ${layout.gap.toFixed(2)}px below the projected book`
  );
  for (const r of [...layout.book, layout.footer, ...layout.controls])
    assert(
      r.top >= -0.6 &&
        r.left >= -0.6 &&
        r.right <= layout.viewport.width + 0.6 &&
        r.bottom <= layout.viewport.height + 0.6,
      `${label}: book or reading controls extend outside the viewport`
    );
}
async function verifyOrnaments() {
  const result = await evaluate(
    `(async()=>{const selectors=['#left-page','#right-page','#cover-inside','#leaf-front','#leaf-back'];const images=value=>[...value.matchAll(/url\\((?:"([^"]*)"|'([^']*)'|([^)]*))\\)/g)].map(match=>match[1]??match[2]??match[3]);const link=document.querySelector('link[href$="ornaments.css"]');const pages=selectors.map(selector=>{const e=document.querySelector(selector),paper=getComputedStyle(e),corners=getComputedStyle(e,'::before');return{selector,paperImages:images(paper.backgroundImage),cornerImages:images(corners.backgroundImage),cornerContent:corners.content,cornerOpacity:Number(corners.opacity),cornerPointerEvents:corners.pointerEvents};});const urls=[...new Set(pages.flatMap(page=>[...page.paperImages,...page.cornerImages]))];const decoded=await Promise.all(urls.map(async src=>{const image=new Image();image.src=src;try{await image.decode();return{src,ok:image.naturalWidth>0&&image.naturalHeight>0};}catch(error){return{src,ok:false,error:String(error)};}}));return{stylesheet:!!link?.sheet,pages,decoded};})()`
  );
  writeFileSync(join(out, 'ornament-resources.json'), JSON.stringify(result, null, 2));
  assert.equal(result.stylesheet, true, 'The ornament stylesheet did not load');
  for (const page of result.pages) {
    for (const corner of ['nw', 'ne', 'sw', 'se'])
      assert(
        page.cornerImages.some((src) => src.endsWith(`/assets/page-corner-${corner}.svg`)),
        `${page.selector}: missing ${corner} corner ornament`
      );
    for (const file of ['page-watermark.svg', 'paper-grain.svg'])
      assert(
        page.paperImages.some((src) => src.endsWith(`/assets/${file}`)),
        `${page.selector}: missing ${file}`
      );
    assert.notEqual(
      page.cornerContent,
      'none',
      `${page.selector}: the corner decoration has no generated box`
    );
    assert(page.cornerOpacity > 0, `${page.selector}: the corner decoration is transparent`);
    assert.equal(
      page.cornerPointerEvents,
      'none',
      `${page.selector}: the ornaments intercept reading controls`
    );
  }
  assert.equal(result.decoded.length >= 6, true);
  assert(
    result.decoded.every((resource) => resource.ok),
    'One or more corner or paper texture SVGs failed to decode'
  );
}
async function sampleCoverMotion(action, label) {
  await (typeof action === 'function' ? action() : click(action));
  await evaluate(
    'window.__coverElements=[document.getElementById("hard-cover"),document.getElementById("volume"),document.getElementById("left-backing"),document.querySelector(".book-gutter")];window.__coverMotions=__coverElements.map(e=>e.getAnimations()[0]);Promise.all(__coverMotions.map(a=>{a.pause();return a.ready;}))'
  );
  assert.equal(
    await evaluate('__coverMotions.length===4 && __coverMotions.every(a=>a.playState==="paused")'),
    true
  );
  await check(`${label}: matching leaf geometry and one moving text surface`, async () => {
    assert.equal(
      await evaluate(
        '(()=>{const a=document.getElementById("cover-inside"),b=document.getElementById("left-page");return a.clientWidth===b.clientWidth&&a.clientHeight===b.clientHeight&&getComputedStyle(a).padding===getComputedStyle(b).padding&&getComputedStyle(a).visibility==="visible"&&getComputedStyle(b).visibility==="hidden";})()'
      ),
      true
    );
    assert.equal(
      await evaluate('getComputedStyle(document.getElementById("spread")).backgroundColor'),
      'rgba(0, 0, 0, 0)'
    );
    assert.equal(
      await evaluate('getComputedStyle(document.getElementById("volume")).transitionDuration'),
      '0s'
    );
    assert.equal(
      await evaluate('getComputedStyle(document.getElementById("corner-previous")).visibility'),
      'hidden'
    );
  });
  const gutterSamples = [];
  const decorationMeasure = `(()=>{const read=selector=>{const e=document.querySelector(selector),s=getComputedStyle(e),r=e.getBoundingClientRect();return{transform:s.transform,clipPath:s.clipPath,opacity:s.opacity,visibility:s.visibility,rect:[r.x,r.y,r.width,r.height]};};const spread=getComputedStyle(document.getElementById("spread"));return{leftBacking:read("#left-backing").transform,gutterOpacity:getComputedStyle(document.querySelector(".book-gutter")).opacity,spreadBackground:spread.background,spreadBoxShadow:spread.boxShadow,decorations:[".backing-right .binding",".backing-right .paper-edges",".backing-left .binding",".backing-left .paper-edges"].map(read)};})()`;
  let pausedEnd;
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.98, 1]) {
    await evaluate(`__coverMotions.forEach(a=>a.currentTime=${fraction * 1050})`);
    assert.equal(
      await evaluate(
        '__coverMotions.every(a=>a.currentTime===__coverMotions[0].currentTime && a.playState==="paused")'
      ),
      true
    );
    assert.equal(
      await evaluate(
        '(()=>{const boards=[...document.querySelectorAll(".backing")],right=getComputedStyle(document.querySelector(".backing-right"));return boards.length===2&&boards.every(e=>getComputedStyle(e).clipPath==="none")&&right.opacity==="1"&&right.visibility==="visible";})()'
      ),
      true
    );
    gutterSamples.push(
      Number(await evaluate('getComputedStyle(document.querySelector(".book-gutter")).opacity'))
    );
    await capture(`motion-${label}-${String(Math.round(fraction * 100)).padStart(2, '0')}.png`);
    if (fraction === 1) pausedEnd = await evaluate(decorationMeasure);
  }
  assert(
    gutterSamples.slice(1, -1).some((opacity) => opacity > 0 && opacity < 1),
    `${label}: gutter must fade through an intermediate opacity`
  );
  assert.equal(gutterSamples[0], label === 'opening' ? 0 : 1);
  assert.equal(gutterSamples.at(-1), label === 'opening' ? 1 : 0);
  await evaluate('__coverMotions.forEach(a=>a.finish())');
  await idle();
  const settledEnd = await evaluate(decorationMeasure);
  assert.equal(
    settledEnd.leftBacking,
    pausedEnd.leftBacking,
    `${label}: left board transform jumped after finish`
  );
  assert.equal(
    settledEnd.gutterOpacity,
    pausedEnd.gutterOpacity,
    `${label}: gutter opacity jumped after finish`
  );
  assert.equal(
    settledEnd.spreadBackground,
    pausedEnd.spreadBackground,
    `${label}: spread background jumped after finish`
  );
  assert.equal(
    settledEnd.spreadBoxShadow,
    pausedEnd.spreadBoxShadow,
    `${label}: spread shadow jumped after finish`
  );
  for (let i = 0; i < pausedEnd.decorations.length; i++) {
    const before = pausedEnd.decorations[i],
      after = settledEnd.decorations[i];
    for (const property of ['transform', 'clipPath', 'opacity', 'visibility'])
      assert.equal(
        after[property],
        before[property],
        `${label}: decoration ${i} ${property} jumped after finish`
      );
    assert(
      before.rect.every((value, j) => Math.abs(value - after.rect[j]) < 0.05),
      `${label}: decoration ${i} geometry jumped after finish`
    );
  }
  const measure =
    '(()=>{const r=document.getElementById("volume").getBoundingClientRect();return[r.x,r.y,r.width,r.height]})()';
  const final = await evaluate(measure);
  await delay(1200);
  const stable = await evaluate(measure);
  await check(`${label}: completion has no second drift or leftover animation`, async () => {
    assert(final.every((value, i) => Math.abs(value - stable[i]) < 0.01));
    assert.equal(await evaluate('__coverElements.every(e=>e.getAnimations().length===0)'), true);
  });
}
async function observeFade(hold = false) {
  await evaluate(
    `(()=>{const dialog=document.getElementById('review-dialog'),stage=document.getElementById('book-stage');window.__fadeObserver?.disconnect();window.__fadeRecord=null;window.__fadeAnimation=null;const observer=new MutationObserver(()=>{if(dialog.dataset.exiting!=='true')return;const motion=dialog.getAnimations().find(a=>a.constructor.name==='Animation'&&a.effect?.target===dialog&&!a.effect.pseudoElement&&a.effect.getKeyframes().some(f=>'opacity'in f));if(!motion)return;observer.disconnect();window.__fadeAnimation=motion;const record=window.__fadeRecord={startedAt:performance.now(),mode:stage.dataset.mode,open:dialog.open,originalDone:(window.__originalFinished||[]).every(a=>a.finished&&!a.cancelled),duration:Number(motion.effect.getTiming().duration),ready:false,finished:false,cancelled:false};motion.ready.then(()=>record.ready=true,()=>record.readyRejected=true);motion.finished.then(()=>{record.finished=true;record.finishedAt=performance.now();},()=>{record.cancelled=true;record.cancelledAt=performance.now();});if(${hold})motion.pause();});window.__fadeObserver=observer;observer.observe(dialog,{attributes:true,attributeFilter:['data-exiting']});})()`
  );
}
async function sampleFade() {
  await openBook();
  await observeFade(true);
  await click('close-review');
  await wait('window.__fadeAnimation?.playState==="paused" && window.__fadeRecord.ready');
  const opacities = [];
  for (const fraction of [0, 0.5, 1]) {
    await evaluate(`__fadeAnimation.currentTime=__fadeRecord.duration*${fraction}`);
    const state = await evaluate(
      '({open:document.getElementById("review-dialog").open,mode:document.getElementById("book-stage").dataset.mode,opacity:Number(getComputedStyle(document.getElementById("review-dialog")).opacity)})'
    );
    assert.equal(state.open, true);
    assert.equal(state.mode, 'cover');
    opacities.push(state.opacity);
  }
  assert.equal(opacities[0], 1);
  assert(opacities[1] > 0 && opacities[1] < 1);
  assert.equal(opacities[2], 0);
  await key('Escape');
  assert.equal(await evaluate('document.getElementById("review-dialog").open'), true);
  await evaluate('__fadeAnimation.finish()');
  await wait('!document.getElementById("review-dialog").open');
  await assertCover();
  assert.equal(await evaluate('__fadeRecord.finished && !__fadeRecord.cancelled'), true);
  await openReader();
  await assertCover();
}
async function exitDuring(trigger, phase) {
  const caseName = `${trigger}-${phase}`;
  try {
    assert.equal(await mode(), 'cover');
    await evaluate('window.__heldExitMotions=[]');
    const startHeldMotion = (buttonId) => evaluate(
      '(async()=>{document.getElementById(' + JSON.stringify(buttonId) + ').click();window.__heldExitMotions=[...document.getElementById("hard-cover").getAnimations(),...document.getElementById("volume").getAnimations(),...document.getElementById("left-backing").getAnimations(),...document.querySelector(".book-gutter").getAnimations(),...document.getElementById("turning-leaf").getAnimations()];await Promise.all(__heldExitMotions.map(animation=>{animation.pause();return animation.ready;}));__heldExitMotions.forEach(animation=>animation.currentTime=120);})()'
    );
    let closingPeople = [];
    if (phase === 'opening') {
      await startHeldMotion('start-review');
    } else {
      await openBook();
      if (phase === 'closing') await startHeldMotion('previous-page');
      else {
        await chapter('people');
        await idle();
        closingPeople = await evaluate(
          '[...document.querySelectorAll("#left-page .person-card")].map(e=>e.dataset.person)'
        );
        if (phase === 'turning') {
          const first = await evaluate('AnnualContent.people[4].id'),
            second = await evaluate('AnnualContent.people[5].id');
          closingPeople = [first, second];
          await startHeldMotion('next-page');
        }
      }
    }
    const initialMode = await mode();
    assert.equal(
      initialMode,
      phase === 'opening' ? 'opening' : phase === 'closing' ? 'closing' : 'open'
    );
    await evaluate(
      `(()=>{const dialog=document.getElementById('review-dialog'),stage=document.getElementById('book-stage');window.__exitSamples=[];window.__originalFinished=[];window.__exitEvents=[];window.__exitActions=[];for(const type of ['cancel','close'])dialog.addEventListener(type,event=>{if(window.__sampleExit)__exitEvents.push({type,time:performance.now(),mode:stage.dataset.mode,open:dialog.open,exiting:dialog.dataset.exiting,cancelable:event.cancelable,defaultPrevented:event.defaultPrevented});});for(const e of [document.getElementById('hard-cover'),document.getElementById('volume'),document.getElementById('left-backing'),document.querySelector('.book-gutter'),document.getElementById('turning-leaf')])for(const a of e.getAnimations()){const record={target:e.id||e.className,startedAt:performance.now(),currentTime:a.currentTime,duration:a.effect.getTiming().duration,finished:false,cancelled:false};__originalFinished.push(record);a.finished.then(()=>{record.finished=true;record.finishedAt=performance.now();},()=>{record.cancelled=true;record.cancelledAt=performance.now();});}window.__sampleExit=true;const frame=()=>{__exitSamples.push({time:performance.now(),mode:stage.dataset.mode,busy:stage.dataset.busy,open:dialog.open,exiting:dialog.dataset.exiting,opacity:Number(getComputedStyle(dialog).opacity),hidden:document.hidden,chapter:document.getElementById('chapter-title').textContent,originalDone:__originalFinished.every(a=>a.finished&&!a.cancelled)});if(__sampleExit)requestAnimationFrame(frame);};frame();})()`
    );
    await observeFade();
    if (phase !== 'ordinary') assert((await evaluate('__originalFinished.length')) > 0);
    await evaluate(
      `__exitActions.push({action:${JSON.stringify(trigger)},time:performance.now()})`
    );
    if (trigger === 'X') await click('close-review');
    else await key('Escape');
    if (phase !== 'ordinary') {
      assert.equal(
        await evaluate('document.getElementById("review-dialog").open && document.getElementById("book-stage").dataset.busy==="true" && __originalFinished.some(animation=>!animation.finished&&!animation.cancelled) && __heldExitMotions.every(animation=>animation.playState==="paused")'),
        true,
        trigger + '/' + phase + ': closing did not wait for the active motion'
      );
      await evaluate('__exitActions.push({action:"resume-held-motion",time:performance.now()});__heldExitMotions.forEach(animation=>animation.play())');
    }
    await wait(
      'document.getElementById("review-dialog").open && document.getElementById("book-stage").dataset.mode==="closing"'
    );
    if (phase !== 'closing')
      assert.equal(
        await evaluate('__originalFinished.every(a=>a.finished&&!a.cancelled)'),
        true,
        `${trigger}/${phase}: current motion was cancelled before closing`
      );
    if (closingPeople.length)
      assert.deepEqual(
        await evaluate(
          '[...document.querySelectorAll("#cover-inside .person-card")].map(e=>e.dataset.person)'
        ),
        closingPeople,
        `${trigger}/${phase}: closing did not retain the current spread`
      );
    await evaluate(
      '__exitActions.push({action:"repeat-Escape-while-closing",time:performance.now()})'
    );
    await key('Escape');
    await key('Escape');
    // Trace the animation lifecycle; a loaded renderer can skip every intermediate RAF of a short fade.
    await wait('window.__fadeRecord || !document.getElementById("review-dialog").open');
    if (await evaluate('document.getElementById("review-dialog").open')) {
      assert.equal(await mode(), 'cover');
      await evaluate(
        '__exitActions.push({action:"repeat-Escape-while-fading",time:performance.now()})'
      );
      await key('Escape');
    }
    await wait('!document.getElementById("review-dialog").open');
    await evaluate('window.__sampleExit=false');
    const samples = await evaluate('__exitSamples');
    assert(
      samples.some((s) => s.open && s.mode === 'closing'),
      `${trigger}/${phase}: no observable closing phase`
    );
    const fade = await evaluate('window.__fadeRecord');
    assert(
      fade && fade.open && fade.mode === 'cover' && fade.originalDone,
      `${trigger}/${phase}: fade did not begin after the book closed`
    );
    assert(
      fade.duration > 0 && fade.finished && !fade.cancelled,
      `${trigger}/${phase}: fade did not finish naturally`
    );
    assert(
      samples.filter((s) => s.exiting === 'true').every((s) => s.mode === 'cover'),
      `${trigger}/${phase}: reader faded before the book closed`
    );
    assert(
      samples.filter((s) => s.time < fade.startedAt).every((s) => s.open && s.opacity > 0.99),
      `${trigger}/${phase}: reader hid or faded before the cover closed`
    );
    assert.equal(
      await evaluate('__originalFinished.every(a=>a.finished&&!a.cancelled)'),
      true,
      `${trigger}/${phase}: interrupted motion did not finish naturally`
    );
    await assertCover();
    assert.equal(await evaluate('document.getElementById("book-stage").dataset.busy'), 'false');
    assert.equal(await evaluate('document.getElementById("turning-leaf").hidden'), true);
    assert.match(await evaluate('document.getElementById("page-progress").textContent'), /^01—02/);
    await exitDiagnostics(caseName);
    await delay(1100);
    assert.equal(await evaluate('document.getElementById("review-dialog").open'), false);
    await openReader();
    await assertCover();
    await openBook();
    assert.equal(await chapterTitle(), '开篇寄语');
    await click('previous-page');
    await idle();
    await assertCover();
  } catch (error) {
    try {
      await exitDiagnostics(caseName, error);
    } catch (diagnosticError) {
      console.error('Could not capture exit diagnostics:', diagnosticError);
    }
    throw error;
  }
}
try {
  let ok = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:' + port + '/json/version')).ok) {
        ok = true;
        break;
      }
    } catch {}
    await delay(100);
  }
  if (!ok) throw Error('Chrome unavailable');
  const page = await (
    await fetch('http://127.0.0.1:' + port + '/json/new?about:blank', { method: 'PUT' })
  ).json();
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    socket.onopen = r;
    socket.onerror = j;
  });
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      if (p) {
        pending.delete(m.id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      }
    } else if (m.method === 'Runtime.exceptionThrown')
      errors.push(
        m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text
      );
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400)
      failedResources.push({ url: m.params.response.url, status: m.params.response.status });
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Network.enable');
  await call('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await call('Page.navigate', { url: baseURL });
  await call('Page.bringToFront');
  await wait(ready);
  await evaluate(
    'localStorage.setItem("my2026.annual-book.v2",JSON.stringify({version:2,index:6,mode:"open"}))'
  );
  await call('Page.reload');
  await wait(ready);
  await evaluate('AnnualArt.ready');
  await delay(250);
  if (coverOnly) {
    for (const [width, height] of [[1440, 900], [1280, 720], [1920, 1080]]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await check(`${width}x${height}: lower opening action, JULI and a small library mark fit on the cover`,
        () => verifyInvitationLayout(width + 'x' + height + ' cover'));
      await capture('cover-wrapped-' + width + '.png');
      await openBook();
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".cover-invitation-art")).visibility'), 'hidden');
      await click('previous-page');
      await idle();
      await assertCover();
    }
  } else if (symmetryOnly) {
    await openBook();
    await check(
      'Four mirrored corner ornaments and both paper textures load on every paper surface',
      verifyOrnaments
    );
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [1920, 1080]
    ]) {
      await call('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      });
      await delay(200);
      await check(
        `${width}x${height}: all chapters have mirrored paper, binding and equal stacks`,
        () => verifySymmetry(width, height)
      );
    }
  } else if (exitOnly) {
    await check(
      'The reader fades continuously after closing and stays modal until the fade completes',
      sampleFade
    );
    for (const trigger of ['X', 'Escape'])
      for (const phase of ['ordinary', 'opening', 'closing', 'turning'])
        if (!exitCase || exitCase === `${trigger}/${phase}`)
          await check(`${trigger} during ${phase} exits safely`, () => exitDuring(trigger, phase));
  } else {
    await check('Old saved reading positions are ignored on reload', assertCover);
    await check('The initial cover pairs the supplied JULI invitation with the opening button', async () => {
      assert.equal(await evaluate('document.getElementById("book-stage").dataset.mode'), 'cover');
      assert.equal(await evaluate('document.getElementById("spread").hidden'), true);
      assert.equal(await evaluate('AnnualContent.people.length'), 20);
      await verifyInvitationLayout('1440x900 cover');
      await capture('01-cover-1440.png');
    });
    await check(
      'Workbook honors preserve all twenty items, twenty-two awards and nineteen employee IDs',
      async () => {
        const honors = await evaluate('AnnualContent.people');
        assert.equal(await evaluate('AnnualContent.people === AnnualPeopleMock'), true);
        assert.deepEqual(
          honors.map(({ winners, ...honor }) => ({
            ...honor,
            winners: winners.map(({ name, employeeId }) => ({ name, employeeId }))
          })),
          expectedHonors
        );
        const winners = honors.flatMap((honor) => honor.winners),
          employees = new Map();
        assert.equal(winners.length, 22);
        for (const winner of winners) {
          assert.match(
            winner.employeeId,
            /^0\d{5}$/,
            'Employee IDs must retain their leading zero'
          );
          assert.notEqual(winner.portrait, undefined);
          if (employees.has(winner.employeeId))
            assert.deepEqual(winner, employees.get(winner.employeeId));
          else employees.set(winner.employeeId, winner);
        }
        assert.equal(employees.size, 19);
        assert.equal(new Set([...employees.values()].map((winner) => winner.portrait)).size, 19);
        assert.doesNotMatch(JSON.stringify(honors), /DEMO|example-\d|示例人物/);
      }
    );
    await check(
      'CQRD appears as a small library mark and the central watermark is removed',
      async () => {
        assert.match(
          await evaluate('document.querySelector(".cover-library-mark").textContent'),
          /CQRD/
        );
        assert.equal(await evaluate('document.querySelector(".cover-monogram")'), null);
        assert.equal(await evaluate('document.getElementById("later-review")'), null);
        assert.equal(await evaluate('document.getElementById("cover-footer")'), null);
        assert.equal(await evaluate('document.getElementById("close-book")'), null);
        assert.equal(await evaluate('document.querySelector(".demo-label")'), null);
        assert.equal(
          await evaluate('[...document.querySelectorAll(".cover-vine")].every(vine=>vine.querySelector("linearGradient")&&vine.querySelector(".vine-flower"))'),
          true,
          'The edge vines need leaves with shaded color and visible flowers'
        );
        assert.equal(
          await evaluate('!!document.querySelector("#review-dialog > .fireflies .star-glint")'),
          true,
          'The surrounding dark backdrop needs its own field of starlight'
        );
        assert.equal(
          await evaluate(
            '(()=>{const e=document.getElementById("start-review"),r=e.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2).closest("button")===e;})()'
          ),
          true
        );
      }
    );
    await check('JULI moves on the visible cover and pauses when the dialog closes', async () => {
      const before = await evaluate(
        'getComputedStyle(document.querySelector(".juli-invitation")).transform'
      );
      await delay(400);
      assert.notEqual(
        await evaluate(
          'getComputedStyle(document.querySelector(".juli-invitation")).transform'
        ),
        before
      );
      await click('close-review');
      await wait('!document.getElementById("review-dialog").open');
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".juli-invitation")).animationPlayState'
        ),
        'paused'
      );
      await evaluate('document.querySelector("[data-open-review]").click()');
      assert.equal(
        await evaluate(
          'getComputedStyle(document.querySelector(".juli-invitation")).animationPlayState'
        ),
        'running'
      );
    });
    await check(
      'Real mouse clicks open the cover from blank space, text and the start button; the first left page closes it',
      async () => {
        let firstSpread;
        for (const [selector, options] of [
          ['#cover-front', { blank: true }],
          ['#cover-front h3', {}],
          ['#start-review', {}]
        ]) {
          await mouseClick(selector, options);
          await idle();
          assert.equal(await mode(), 'open');
          assert.equal(await chapterTitle(), '开篇寄语');
          const current = await progress();
          if (firstSpread)
            assert.equal(current, firstSpread, 'Cover/start click skipped the foreword');
          else firstSpread = current;
          await mouseClick('#left-page', { blank: true });
          await idle();
          await assertCover();
        }
      }
    );
    await sampleCoverMotion('start-review', 'opening');
    await check('The cover hinges open to the foreword and letter', async () => {
      assert.equal(await evaluate('document.getElementById("book-stage").dataset.mode'), 'open');
      assert.equal(
        await evaluate('document.getElementById("chapter-title").textContent'),
        '开篇寄语'
      );
      assert.equal(await evaluate(noClip), true);
      await capture('03-foreword-1440.png');
    });
    await check(
      'Four mirrored corner ornaments and both paper textures load on every paper surface',
      verifyOrnaments
    );
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector(".juli-invitation")).animationPlayState'
      ),
      'paused'
    );
    await check('Both paper planes have a visible three-dimensional opening angle', async () => {
      assert.equal(
        await evaluate(
          '(()=>{const left=new DOMMatrix(getComputedStyle(document.getElementById("left-page")).transform),right=new DOMMatrix(getComputedStyle(document.getElementById("right-page")).transform),volume=new DOMMatrix(getComputedStyle(document.getElementById("volume")).transform);return Math.abs(left.m13)>.01&&Math.abs(right.m13)>.01&&left.m13*right.m13<0&&Math.abs(volume.m23)>.05;})()'
        ),
        true
      );
      assert.equal(
        await evaluate('document.querySelector(".book-gutter").parentElement.id'),
        'volume'
      );
      assert.equal(
        await evaluate(
          'document.getElementById("previous-page").disabled || document.getElementById("corner-previous").disabled'
        ),
        false
      );
    });
    await sampleCoverMotion('previous-page', 'closing');
    await check(
      'The previous button, left page corner and ArrowLeft close the first spread and remain on the cover',
      async () => {
        await assertCover();
        assert.equal(await evaluate('document.getElementById("review-dialog").open'), true);
        for (const close of [() => click('corner-previous'), () => key('ArrowLeft')]) {
          await openBook();
          await close();
          await idle();
          await assertCover();
          assert.equal(await evaluate('document.getElementById("review-dialog").open'), true);
        }
        await capture('10-cover-after-previous.png');
        await openBook();
      }
    );
    await check(
      'A forward 3D page turn matches both static paper planes and rejects repeated navigation',
      () => samplePageTurn(() => click('next-page'), 'page-turn-forward')
    );
    await check('A backward 3D page turn matches both static paper planes', () =>
      samplePageTurn(() => click('previous-page'), 'page-turn-backward', false)
    );
    await click('next-page');
    await idle();
    await check(
      'A spread displays four honor items, two per page, with workbook winners and one metric each',
      async () => {
        assert.equal(
          await evaluate('document.querySelectorAll("#left-page .person-card").length'),
          2
        );
        assert.equal(
          await evaluate('document.querySelectorAll("#right-page .person-card").length'),
          2
        );
        assertHonorCards(await readHonorCards(), 0);
        assert.equal(
          await evaluate(
            'document.querySelector(\'#spread [data-person="honor-2"] .person-metric\').textContent.replace(/\\s/g, "")'
          ),
          '57%'
        );
        assert.equal(await evaluate(noClip), true);
        await capture('05-people-1440.png');
      }
    );
    const seen = [],
      seenWinners = [],
      seenPageTitles = [];
    for (let group = 0; group < 5; group++) {
      const cards = await readHonorCards();
      assertHonorCards(cards, group);
      const pageTitles = await evaluate(
        '[...document.querySelectorAll("#spread .page-header-row h3")].map(e=>e.textContent.trim())'
      );
      assert.equal(pageTitles.length, 2, 'Each honor page needs its own guide title');
      assert(pageTitles.every(Boolean), 'An honor page has an empty guide title');
      seenPageTitles.push(...pageTitles);
      assert.doesNotMatch(
        await evaluate('document.getElementById("spread").textContent'),
        /第\s*\d+\s*(?:\/\s*\d+\s*)?组/,
        'Group counters must not appear above the honors'
      );
      assert.doesNotMatch(await progress(), /人物\s*\d+\s*\/\s*\d+/);
      assert.equal(await evaluate(noClip), true, `1440x900: honor group ${group + 1} is clipped`);
      seen.push(...cards.map((card) => card.id));
      seenWinners.push(...cards.flatMap((card) => card.winners));
      if (group < 4) {
        await click('next-page');
        await idle();
      }
    }
    await check(
      'All twenty honor items and twenty-two awards are reachable in exactly five groups',
      async () => {
        assert.deepEqual(
          seen,
          expectedHonors.map((honor) => honor.id)
        );
        assert.equal(new Set(seen).size, 20);
        assert.equal(seenWinners.length, 22);
        assert.equal(new Set(seenWinners.map((winner) => winner.employeeId)).size, 19);
        assert.equal(new Set(seenPageTitles).size, 10, 'Every honor page needs a distinct title');
        assert.deepEqual(seenPageTitles, await evaluate('AnnualContent.peoplePageTitles.flat()'));
        assert.match(await progress(), /^\d{2}—\d{2} \/ \d+ 页$/);
      }
    );
    await check(
      'People cards have no story action and real mouse clicks turn left backward and right forward',
      async () => {
        const before = await progress(),
          people = await evaluate(
            '[...document.querySelectorAll("#spread .person-card")].map(c=>c.dataset.person)'
          );
        assert.equal(
          await evaluate(
            'document.querySelector("#spread .read-person,#spread [data-read-person]")'
          ),
          null
        );
        assert.equal(
          await evaluate('document.getElementById("spread").textContent.includes("读 TA 的故事")'),
          false
        );
        await mouseClick('#left-page .honor-title');
        await idle();
        assert.notEqual(await progress(), before);
        assert.equal(await chapterTitle(), '榜样人物');
        await mouseClick('#right-page .honor-title');
        await idle();
        assert.equal(await progress(), before);
        assert.deepEqual(
          await evaluate(
            '[...document.querySelectorAll("#spread .person-card")].map(c=>c.dataset.person)'
          ),
          people
        );
        assert.equal(await evaluate('document.getElementById("person-dialog")'), null);
      }
    );
    await check(
      'Dragging a real mouse to select card text preserves the current spread',
      async () => {
        const before = await progress();
        await selectTextWithMouse('#right-page .honor-title');
        assert.equal(
          await evaluate(
            '!getSelection().isCollapsed && getSelection().toString().trim().length>0'
          ),
          true,
          'Mouse drag did not select text'
        );
        await idle();
        assert.equal(await progress(), before);
        assert.equal(await mode(), 'open');
        await evaluate('getSelection().removeAllRanges()');
      }
    );
    await check(
      'A real double click and repeated page clicks while busy advance exactly one spread',
      async () => {
        await chapter('personal');
        await idle();
        const destination = await progress();
        await mouseClick('#left-page .personal-note');
        await idle();
        const source = await progress();
        assert.notEqual(source, destination);
        const point = await mousePoint('#right-page .honor-title');
        await mouseClickAt(point);
        await evaluate(
          'window.__mouseTurnMotions=document.getElementById("turning-leaf").getAnimations();Promise.all(__mouseTurnMotions.map(a=>{a.pause();return a.ready;}))'
        );
        assert.equal(await evaluate('document.getElementById("book-stage").dataset.busy'), 'true');
        assert.equal(await evaluate('__mouseTurnMotions.length>0'), true);
        await mouseClickAt(point, 2);
        await mouseClickAt(point);
        await evaluate('__mouseTurnMotions.forEach(a=>a.finish())');
        await idle();
        assert.equal(await progress(), destination);
        await delay(100);
        assert.equal(await progress(), destination);
        assert.equal(await mode(), 'open');
        await evaluate('getSelection().removeAllRanges()');
      }
    );
    await check(
      'Real navigation and bookmark clicks act once; page buttons and links keep their own click',
      async () => {
        await mouseClick('[data-chapter="people"]');
        await idle();
        const firstPeople = await progress();
        await mouseClick('#next-page');
        await idle();
        const secondPeople = await progress();
        assert.notEqual(secondPeople, firstPeople);
        await mouseClick('#previous-page');
        await idle();
        assert.equal(await progress(), firstPeople);
        await evaluate(
          `(()=>{window.__controlClicks=0;for(const tag of ['button','a']){const e=document.createElement(tag);e.dataset.verificationControl=tag;e.textContent='Verification '+tag;e.style.cssText='position:absolute;top:50%;left:35%;z-index:10;padding:8px';if(tag==='a')e.href='#verification-control';e.addEventListener('click',event=>{event.preventDefault();__controlClicks++;});document.getElementById(tag==='a'?'right-page':'left-page').append(e);}})()`
        );
        for (const tag of ['button', 'a']) {
          await mouseClick(`[data-verification-control="${tag}"]`);
          await idle();
          assert.equal(await progress(), firstPeople);
        }
        assert.equal(await evaluate('__controlClicks'), 2);
        await evaluate(
          'document.querySelectorAll("[data-verification-control]").forEach(e=>e.remove())'
        );
        await mouseClick('[data-chapter="ending"]');
        await idle();
        await mouseClick('#left-page [data-book-action="restart"]');
        await idle();
        assert.equal(await chapterTitle(), '开篇寄语');
      }
    );
    await chapter('personal');
    await idle();
    await check(
      'Personal chapter shows the employee and annual records without project reviews',
      async () => {
        assert.equal(
          await evaluate('document.querySelectorAll("#spread .personal-stat").length'),
          4
        );
        assert.equal(await evaluate(noClip), true);
        assert.equal(
          await evaluate('document.getElementById("spread").textContent.includes("公司项目")'),
          false
        );
        await capture('06-personal-1440.png');
      }
    );
    await chapter('ending');
    await idle();
    await check('The last spread has an ending note and cannot turn past the end', async () => {
      assert.equal(await evaluate('document.getElementById("next-page").disabled'), true);
      await capture('07-ending-1440.png');
    });
    await check(
      '1440x900: all chapters have equal stacks and mirrored paper, backing and binding without a centre step',
      () => verifySymmetry(1440, 900)
    );
    await key('ArrowLeft');
    await idle();
    assert.equal(await chapterTitle(), '我的2026');
    await check(
      'Reloading from a later spread returns to the cover and the next opening starts with the foreword',
      async () => {
        await call('Page.reload');
        await wait(ready);
        await assertCover();
        await openBook();
        assert.equal(await chapterTitle(), '开篇寄语');
      }
    );
    await chapter('people');
    await idle();
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
      await delay(200);
      await chapter('foreword');
      await idle();
      await click('previous-page');
      await idle();
      await check(
        width + 'x' + height + ': the invitation and opening button fit together on the cover',
        () => verifyInvitationLayout(width + 'x' + height + ' cover')
      );
      await capture('cover-invitation-' + width + '.png');
      await openBook();
      await chapter('people');
      await idle();
      await check(
        `${width}×${height} keeps all honor titles, winners and six-digit metrics on the paper`,
        async () => {
          for (let group = 0; group < 5; group++) {
            assertHonorCards(await readHonorCards(), group);
            assert.equal(
              await evaluate(noClip),
              true,
              `${width}x${height}: honor group ${group + 1} is clipped`
            );
            if (group === 0) await capture(`08-people-${width}.png`);
            if (group === 1 || group === 2)
              await capture(`08-people-${width}-group-${group + 1}.png`);
            if (group < 4) {
              await click('next-page');
              await idle();
            }
          }
          assert.equal(
            await evaluate(
              '(()=>{const r=document.getElementById("next-page").getBoundingClientRect(),c=document.getElementById("close-review").getBoundingClientRect(),t=document.querySelector("[data-chapter=personal]").getBoundingClientRect();return r.bottom<=innerHeight&&c.top>=0&&t.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth})()'
            ),
            true
          );
        }
      );
      await check(
        `${width}x${height}: all chapters have equal stacks and mirrored paper, backing and binding without a centre step`,
        () => verifySymmetry(width, height)
      );
      await chapter('foreword');
      await idle();
      await capture(`09-foreword-${width}.png`);
      await chapter('people');
      await idle();
    }
    await chapter('foreword');
    await idle();
    await click('previous-page');
    await idle();
    await check(
      'The reader fades continuously after closing and stays modal until the fade completes',
      sampleFade
    );
    for (const trigger of ['X', 'Escape'])
      for (const phase of ['ordinary', 'opening', 'closing', 'turning'])
        await check(
          `${trigger} during ${phase} finishes the motion, closes the current spread, fades out and resets safely`,
          () => exitDuring(trigger, phase)
        );
    await check('The reset cover remains usable after repeated exits', async () => {
      await capture('10-cover-1920.png');
      await openBook();
      assert.equal(await chapterTitle(), '开篇寄语');
    });
    await call('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
    });
    await check(
      'Reduced motion changes pages and exits immediately; direct HTML opening starts at the cover',
      async () => {
        await click('next-page');
        await idle();
        assert.equal(await evaluate('document.getElementById("turning-leaf").hidden'), true);
        await key('Escape');
        await wait('!document.getElementById("review-dialog").open');
        await assertCover();
        await call('Page.navigate', { url: pathToFileURL(join(root, 'index.html')).href });
        await wait(ready);
        await evaluate('AnnualArt.ready');
        await assertCover();
        assert.equal(
          await evaluate('document.querySelectorAll(".juli-invitation").length'),
          1
        );
        assert.equal(
          await evaluate(
            'getComputedStyle(document.querySelector(".juli-invitation")).animationName'
          ),
          'none'
        );
      }
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(failedResources, []);
  writeFileSync(
    join(
      out,
      symmetryOnly
        ? 'verification-symmetry.json'
        : coverOnly
        ? 'verification-cover.json'
        : exitOnly
        ? 'verification-exits.json'
        : 'verification.json'
    ),
    JSON.stringify({ passed, errors, failedResources }, null, 2)
  );
  console.log('All ' + passed.length + ' checks passed.');
} catch (error) {
  try {
    const layoutFailures = await evaluate('window.__layoutFailures||[]');
    if (layoutFailures.length) {
      writeFileSync(join(out, 'layout-failures.json'), JSON.stringify(layoutFailures, null, 2));
      console.error('Layout failures:', JSON.stringify(layoutFailures));
    }
    await capture('verification-failure.png');
    await exitDiagnostics('failure', error);
    writeFileSync(
      join(out, 'verification-failure.json'),
      JSON.stringify(
        { check: activeCheck, error: error.stack, passed, errors, failedResources },
        null,
        2
      )
    );
  } catch (diagnosticError) {
    console.error('Could not capture failure diagnostics:', diagnosticError);
  }
  throw error;
} finally {
  for (const p of pending.values()) p.reject(Error('Browser closed'));
  socket?.close();
  browser.kill();
}
