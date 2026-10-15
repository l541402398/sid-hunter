// Team-owned theme-assets QA. Isolated loopback port + own Chrome profile. Never touches 8788 or 8787.
// Owner: quality-lead. Writes ONLY to outputs/theme-qa/.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';

// Minimal dependency-free PNG decoder (colour types 6/2/0) so the QA can judge VISIBLE pixels
// without touching a cross-origin canvas.
function decodePNG(buf) {
  let off = 8, ih = null, id = [], plte = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), t = buf.toString('ascii', off + 4, off + 8), d = buf.subarray(off + 8, off + 8 + len);
    if (t === 'IHDR') ih = d; else if (t === 'PLTE') plte = d; else if (t === 'IDAT') id.push(d); else if (t === 'IEND') break;
    off += 12 + len;
  }
  const w = ih.readUInt32BE(0), h = ih.readUInt32BE(4), ct = ih[9];
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 1, stride = w * bpp, raw = inflateSync(Buffer.concat(id)), px = Buffer.alloc(h * stride);
  const at = i => (i < 0 ? 0 : px[i]);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)], s = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let i = 0; i < stride; i++) {
      const a = at(y * stride + i - bpp), b = at((y - 1) * stride + i), c = at((y - 1) * stride + i - bpp), x = s[i];
      let v; switch (ft) {
        case 0: v = x; break; case 1: v = x + a; break; case 2: v = x + b; break; case 3: v = x + ((a + b) >> 1); break;
        case 4: { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); break; }
      }
      px[y * stride + i] = v & 255;
    }
  }
  return { w, h, ct, bpp, px };
}

const online = dirname(fileURLToPath(import.meta.url)), root = dirname(online);
const out = join(root, 'outputs/theme-qa');
await mkdir(out, {recursive: true});
const PROFILE = join(out, '.chrome-profile');

const freePort = () => new Promise((ok, no) => { const s = createServer(); s.once('error', no); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(e => e ? no(e) : ok(p)); }); });
const pause = ms => new Promise(r => setTimeout(r, ms));
const sha = f => createHash('sha256').update(readFileSync(join(root, f))).digest('hex');
const GUARDED = ['online/shared/scene.js', 'online/shared/world.js', 'online/room.js', 'online/server.js', 'online/public/game.js', 'demo/main.js'];
const beforeHashes = Object.fromEntries(GUARDED.map(f => [f, sha(f)]));

const results = [], runtimeErrors = [], consoleErrors = [], notes = [];
let server, chrome, ws, seq = 0, fatal = null;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); rej(Error(method + ' timeout')); }, 20000); pending.set(id, { r: v => { clearTimeout(t); res(v); }, j: e => { clearTimeout(t); rej(e); } }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception || {})); return r.result.value; };
const wait = async (fn, label, n = 240) => { for (let i = 0; i < n; i++) { try { if (await fn()) return true; } catch { } await pause(50); } throw Error('等待超时：' + label); };
const test = async (name, fn) => { try { const d = await fn(); results.push({ name, pass: true, ...(d ? { detail: d } : {}) }); console.log('通过', name); } catch (e) { results.push({ name, pass: false, error: e.message, stack: e.stack }); console.error('失败', name, e.message); } };

const INJECT = `
window.__t={rec:[],rects:[],clips:0,err:[]};
const _d=CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage=function(img,a,b,c,e,f,g,h,i){
  try{
    let sx=0,sy=0,sw=img&&img.width||0,sh=img&&img.height||0,dx=0,dy=0,dw=sw,dh=sh;
    if(c===undefined){dx=a;dy=b;} else {sx=a;sy=b;sw=c;sh=e;dx=f;dy=g;dw=h;dh=i;}
    const src=img&&img.src?String(img.src).replace(/^.*\\/assets\\/vendor\\//,''):(img&&img.tagName==='CANVAS'?'CANVAS':'?');
    const full=img&&img.src?String(img.src):null;
    if(window.__t.rec.length<40000)window.__t.rec.push({src,full,sx:Math.round(sx),sy:Math.round(sy),sw:Math.round(sw),sh:Math.round(sh),dx:Math.round(dx),dy:Math.round(dy),dw:Math.round(dw),dh:Math.round(dh),cw:this.canvas.width,ch:this.canvas.height,main:this.canvas.id==='office'});
  }catch(err){window.__t.err.push(String(err));}
  return _d.apply(this,arguments);
};
const _r=CanvasRenderingContext2D.prototype.rect;
CanvasRenderingContext2D.prototype.rect=function(x,y,w,h){try{if(this.canvas.id==='office'&&window.__t.rects.length<400)window.__t.rects.push({x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)});}catch(e){}return _r.apply(this,arguments);};
const _c=CanvasRenderingContext2D.prototype.clip;
CanvasRenderingContext2D.prototype.clip=function(){try{if(this.canvas.id==='office')window.__t.clips++;}catch(e){}return _c.apply(this,arguments);};
window.__resetRec=()=>{window.__t.rec.length=0;window.__t.rects.length=0;window.__t.clips=0;};
// Deterministic direct drive of the frozen scene module on a scratch canvas (immune to sprite bake caching).
window.__drive=(floorId,opts={})=>{
  window.__resetRec();
  const c=document.createElement('canvas');c.width=1600;c.height=560;const g=c.getContext('2d');
  if(opts.floor!==false)try{SID_SCENE.floor(g,floorId,0,0,1440,400);}catch(e){window.__t.err.push('floor '+e);}
  const f=WORLD.floorById(floorId);
  if(opts.wall!==false)try{SID_SCENE.wall(g,f);}catch(e){window.__t.err.push('wall '+e);}
  const drawn=[];let themedBefore=SID_SCENE.stats.themed||0;
  if(opts.furn!==false)for(const fu of WORLD.floorFurniture(floorId)){const ok=SID_SCENE.furniture(g,fu);drawn.push({id:fu.id,type:fu.type,ok:!!ok});}
  return {themedDelta:(SID_SCENE.stats.themed||0)-themedBefore,drawn,rec:window.__t.rec.slice(0,12000),err:window.__t.err.slice(0,5)};
};
// PROOF that registered atlases yield REAL pixels: compare the destination pixel of each
// shooter/sports blit with the corresponding pixel read back from the atlas image itself.
window.__pixelProof=async(floorId,srcFrag,types)=>{
  window.__resetRec();
  const c=document.createElement('canvas');c.width=1700;c.height=620;
  const g=c.getContext('2d',{willReadFrequently:true});
  const f=WORLD.floorById(floorId);
  if(types){for(const fu of WORLD.floorFurniture(floorId))if(types.includes(fu.type))SID_SCENE.furniture(g,fu);}
  else SID_SCENE.wall(g,f);
  const recs=window.__t.rec.filter(r=>new RegExp(srcFrag,'i').test(r.src));
  const out=[];
  for(const r of recs.slice(0,6)){
    const px=r.dx+Math.floor(r.dw/2),py=r.dy+Math.floor(r.dh/2);
    if(!r.full||px<0||py<0||px>=c.width||py>=c.height)continue;
    let im;try{im=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=r.full;});if(im.decode)await im.decode();}catch(e){out.push({err:'atlas load failed '+r.src});continue;}
    const tc=document.createElement('canvas');tc.width=im.width;tc.height=im.height;
    const tg=tc.getContext('2d',{willReadFrequently:true});tg.drawImage(im,0,0);
    const sx=r.sx+Math.floor(r.sw/2),sy=r.sy+Math.floor(r.sh/2);
    const dst=Array.from(g.getImageData(px,py,1,1).data),src=Array.from(tg.getImageData(sx,sy,1,1).data);
    out.push({file:r.src,atlas:im.width+'x'+im.height,srcPx:[sx,sy],dstPx:[px,py],srcRGBA:src,dstRGBA:dst,equal:dst[0]===src[0]&&dst[1]===src[1]&&dst[2]===src[2]&&dst[3]===src[3]});
  }
  return out;
};
window.__driveDesk=(floorId)=>{  window.__resetRec();
  const c=document.createElement('canvas');c.width=1600;c.height=560;const g=c.getContext('2d');
  const out=[];
  for(const fu of WORLD.floorFurniture(floorId)){ if(fu.type!=='desk')continue; const isl=WORLD.deskIsland(fu);
    window.__resetRec(); const ok=SID_SCENE.furniture(g,fu);
    out.push({id:fu.id,label:fu.label,island:isl?{rows:isl.rows,plan:isl.plan,gap:isl.gap,uy:isl.uy,ox:isl.ox,bw:isl.bw}:null,ok:!!ok,rec:window.__t.rec.slice(0,4000)});
  }
  return out;
};
`;

// Floor -> expected themed draw signatures (source path fragment + exact atlas source coords where applicable)
const P = 17;
const SIGN = {
  1: [{ what: 'F1 墙带 shooter(21,1)', test: r => /shooter/i.test(r.src) && r.sx === 21 * 64 && r.sy === 1 * 64 }],
  2: [{ what: 'F2 木长桌 indoors(0,0)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 0 * P && r.sy === 0 * P },
      { what: 'F2 书架 indoors(5,12)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 5 * P && r.sy === 12 * P }],
  3: [{ what: 'F3 暖木地板 indoors(24,0..3)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 24 * P && r.sy >= 0 && r.sy <= 3 * P },
      { what: 'F3 书架 indoors(5,12)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 5 * P && r.sy === 12 * P }],
  4: [{ what: 'F4 草地 farm(0..2,0)', test: r => /tiny-town/i.test(r.src) && r.sy === 0 && r.sx >= 0 && r.sx <= 2 * P },
      { what: 'F4 木文件柜 indoors(4,12)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 4 * P && r.sy === 12 * P }],
  5: [{ what: 'F5 书架带 indoors(5,12)', test: r => /roguelikeIndoor/.test(r.src) && r.sx === 5 * P && r.sy === 12 * P }],
  6: [{ what: 'F6 棒棒糖 lollipop_red', test: r => /lollipop_red\.png/i.test(r.src) }],
  7: [{ what: 'F7 场地 sports 64px', test: r => /sportsPack/i.test(r.src) }]
};
const analyze = () => ev(`(()=>{const rec=window.__t.rec;const bySrc={};for(const r of rec)bySrc[r.src]=(bySrc[r.src]||0)+1;
 const main=rec.filter(r=>r.main), off=rec.filter(r=>!r.main);
 const single=main.filter(r=>/antea-office\\/|lollipop_red|food_sprites|sportsPack|Small-|Big-/.test(r.src));
 return {total:rec.length,bySrc,samples:rec.slice(0,0),offLocalUnder58:off.filter(r=>r.dy<58).length,
  mainMinPropDy:single.length?Math.min(...single.map(r=>r.dy)):null,mainMinPropDySrc:single.length?single.reduce((a,b)=>a.dy<=b.dy?a:b).src:null,
  clips:window.__t.clips,rects:window.__t.rects.slice(0,40),err:window.__t.err.slice(0,5),
  chair:main.filter(r=>/Chair\\.png/.test(r.src)).map(r=>({dw:r.dw,dh:r.dh})).slice(0,6),
  candy:main.filter(r=>/lollipop_red/.test(r.src)).map(r=>({dw:r.dw,dh:r.dh,dx:r.dx,count:1})).slice(0,6)};})()`);

try {
  // ---------- regression: the three elevator suites ----------
  for (const suite of ['elevator-world-test.mjs', 'elevator-room-test.mjs']) {
    await test('回归 ' + suite, () => new Promise((ok, no) => {
      const c = spawn(process.execPath, [join(online, suite)], { cwd: online, stdio: ['ignore', 'pipe', 'pipe'] });
      let so = '', se = ''; c.stdout.on('data', d => so += d); c.stderr.on('data', d => se += d);
      c.on('exit', code => code === 0 ? ok({ code, tail: so.trim().split('\n').pop() }) : no(Error('exit ' + code + ' :: ' + (se || so).slice(0, 300))));
    }));
  }
  await test('回归 elevator-browser-test.mjs（真实 Chrome，自管端口/profile）', () => new Promise((ok, no) => {
    const c = spawn(process.execPath, [join(online, 'elevator-browser-test.mjs')], { cwd: online, stdio: ['ignore', 'pipe', 'pipe'] });
    let so = '', se = ''; c.stdout.on('data', d => so += d); c.stderr.on('data', d => se += d);
    c.on('exit', code => code === 0 ? ok({ code, tail: so.trim().split('\n').pop() }) : no(Error('exit ' + code + ' :: ' + (se || so).slice(0, 400))));
  }));

  // ---------- real Chrome: online HTTP + demo file:// ----------
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(online, 'server.js')], { env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', SID_TEST: '1', SID_SSO: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let serverLog = ''; server.stdout.on('data', d => serverLog += d); server.stderr.on('data', d => serverLog += d);
  await wait(() => fetch(base + '/api/auth/config').then(r => r.ok).catch(() => false), '隔离服务启动');
  const repo = await fetch(base + '/shared/scene.js').then(r => ({ status: r.status, type: r.headers.get('content-type'), len: (r.headers.get('content-length') || '0') }));

  chrome = spawn(process.env.SID_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--no-sandbox', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-sync', `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1', `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeLog = ''; chrome.stderr.on('data', d => chromeLog += d);
  let page = null;
  await wait(async () => { const l = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then(r => r.json()).catch(() => []); page = l.find(p => p.type === 'page') || null; return !!page; }, 'Chrome CDP');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.j(Error(JSON.stringify(m.error))) : p.r(m.result); } if (m.method === 'Runtime.exceptionThrown') runtimeErrors.push(m.params.exceptionDetails?.text || JSON.stringify(m.params)); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args?.map(a => a.value || a.description).join(' ')); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });

  // ===== ONLINE =====
  await send('Page.navigate', { url: base + '/?test' });
  await wait(() => ev("document.readyState==='complete'&&!!window.SID_SCENE"), 'scene 加载');
  await ev('SID_SCENE.ready');
  await ev("document.querySelector('#nickname').value='主题验收'");
  const clickSel = async sel => { const r = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`); for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 }); };
  await clickSel('#join-form button[type=submit]');
  await wait(() => ev("document.querySelector('#join-page').hidden"), '加入');
  const pid = await ev("fetch('/api/state').then(r=>r.json()).then(s=>s.me.id)");

  await test('ONLINE：scene.js 由服务端共享路由托管且非 404', () => { assert.equal(repo.status, 200); return repo; });
  await test('ONLINE：SID_SCENE 就绪、stats.error===null、runtime/console 错误 0', async () => {
    const s = await ev('({ready:SID_SCENE.stats.ready,error:SID_SCENE.stats.error})');
    assert.equal(s.ready, true, 'assets not ready: ' + JSON.stringify(s));
    assert.equal(s.error, null, 'stats.error=' + s.error);
    assert.deepEqual(runtimeErrors, []); assert.deepEqual(consoleErrors, []);
    return s;
  });

  await test('ONLINE：直接驱动冻结的 scene 模块，7 层主题类型确实绘制（themed>0 且签名命中）', async () => {
    const report = [];
    for (let f = 1; f <= 7; f++) {
      const d = await ev(`window.__drive(${f})`);
      const detail = SIGN[f].map(sig => ({ what: sig.what, hit: d.rec.some(r => sig.test(r)) }));
      const themedFloor = d.drawn.filter(x => x.ok).length;
      report.push({ floor: f, themedDelta: d.themedDelta, themedFurniture: themedFloor, signatures: detail, allHit: detail.every(x => x.hit), err: d.err });
    }
    report.forEach(r => notes.push(`drive floor ${r.floor}: themedDelta=${r.themedDelta} themedFurniture=${r.themedFurniture} sig=${r.signatures.map(s => (s.hit ? '+' : '-') + s.what).join(' ')}`));
    // F1's theming is the themed WALL band (THEME_WALL), not furniture; every other floor must theme furniture.
    const bad = report.filter(r => !r.allHit || (r.themedDelta > 0 ? false : r.floor !== 1));
    assert.deepEqual(bad.map(r => ({ f: r.floor, themedDelta: r.themedDelta, miss: r.signatures.filter(s => !s.hit).map(s => s.what) })), [], '主题绘制缺失');
    return report;
  });
  await test('ONLINE：注册后确实取到真实像素 —— shooter/sports 图集解码出真实像素且被 wall()/stage() 消费', async () => {
    const p = await ev(`(async()=>{
      const load=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
      const read=(im,x,y)=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);return Array.from(g.getImageData(x,y,1,1).data);};
      const opaque=(im,baseX,baseY)=>{const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(im,0,0);for(let y=0;y<64;y++)for(let x=0;x<64;x++){if(g.getImageData(baseX+x,baseY+y,1,1).data[3]===255)return [x,y];}return null;};
      const shooter=await load(new URL('assets/vendor/scifi-kenney-topdown-shooter/Tilesheet/tilesheet_complete.png',location.href).href);
      const sports=await load(new URL('assets/vendor/sports-kenney-sportsPack/Tilesheet/groundBeige_white.png',location.href).href);
      const o1=opaque(shooter,21*64,1*64), o2=opaque(sports,0,0);
      const c=document.createElement('canvas');c.width=1700;c.height=620;const g=c.getContext('2d',{willReadFrequently:true});
      SID_SCENE.tile(g,'shooter',21,1,100,100,64,64);
      SID_SCENE.tile(g,'sports',0,0,300,100,64,64);
      const d1=Array.from(g.getImageData(100+o1[0],100+o1[1],1,1).data), s1=read(shooter,21*64+o1[0],1*64+o1[1]);
      const d2=Array.from(g.getImageData(300+o2[0],100+o2[1],1,1).data), s2=read(sports,0+o2[0],0+o2[1]);
      window.__resetRec();SID_SCENE.wall(g,WORLD.floorById(1));
      const wallShooter=window.__t.rec.filter(r=>/tilesheet_complete/.test(r.src)).length;
      window.__resetRec();for(const fu of WORLD.floorFurniture(7))if(fu.type==='stage'||fu.type==='mat')SID_SCENE.furniture(g,fu);
      const stageSports=window.__t.rec.filter(r=>/groundBeige/.test(r.src)).length;
      return {shooterAtlas:[shooter.width,shooter.height],sportsAtlas:[sports.width,sports.height],offsetShooter:o1,offsetSports:o2,
        shooterDest:d1,shooterAtlasPx:s1,shooterEqual:d1.join()===s1.join(),sportsDest:d2,sportsAtlasPx:s2,sportsEqual:d2.join()===s2.join(),
        wallShooterBlits:wallShooter,stageSportsBlits:stageSports};
    })()`);
    assert.ok(p.offsetShooter && p.offsetSports, '未能在图集内找到不透明像素');
    assert.equal(p.shooterEqual, true, 'tile(shooter) 目标像素 ≠ 图集源像素（静默回退/未加载）：' + JSON.stringify(p));
    assert.equal(p.sportsEqual, true, 'tile(sports) 目标像素 ≠ 图集源像素（静默回退/未加载）：' + JSON.stringify(p));
    assert.ok(p.wallShooterBlits > 0, 'F1 wall() 未发出 shooter 图集 blit：' + JSON.stringify(p));
    assert.ok(p.stageSportsBlits > 0, 'F7 stage/mat 未发出 sports 图集 blit：' + JSON.stringify(p));
    return p;
  });
  await test('ONLINE：实时画面像素判定 F7 场地为 sports 图集材质（blit 计数对烘焙缓存不适用）', async () => {
    // Online furniture goes through a furnitureSprites bake cache, so counting atlas blits in a
    // steady-state window is meaningless (mechanism, not a fallback). Judge the VISIBLE RESULT instead:
    // capture the real canvas and count pixels matching the sports groundBeige_white block (0,0).
    const TARGET = [217, 204, 163], TOL = 6;
    const rows = [];
    for (const [floor, type] of [[1, null], [7, 'stage']]) {
      const pos = type ? await ev(`(()=>{const f=WORLD.floorFurniture(${floor}).find(x=>x.type===${JSON.stringify(type)})||WORLD.floorFurniture(${floor}).find(x=>x.type==='mat');return f?{x:f.x+f.w/2,y:f.y+f.h/2}:{x:300,y:200};})()`) : { x: 300, y: 200 };
      await ev(`fetch('/api/test/place',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerId:${pid},floorId:${floor},x:${pos.x},y:${pos.y}})}).then(r=>r.json())`);
      await wait(() => ev(`document.querySelector('#floor-indicator').textContent==='${floor}F'`), 'pixel floor ' + floor);
      await pause(700);
      const rect = await ev("(()=>{const r=document.querySelector('#office').getBoundingClientRect();return{x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)};})()");
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...rect, scale: 1 } });
      const file = join(out, `live-floor${floor}.png`);
      await writeFile(file, Buffer.from(shot.data, 'base64'));
      const { w, h, px, bpp } = decodePNG(Buffer.from(shot.data, 'base64'));
      let near = 0; for (let i = 0; i < w * h; i++) { const r = px[i * bpp], g = px[i * bpp + 1], b = px[i * bpp + 2]; if (Math.abs(r - TARGET[0]) <= TOL && Math.abs(g - TARGET[1]) <= TOL && Math.abs(b - TARGET[2]) <= TOL) near++; }
      const blit = await ev(`(()=>{const r=window.__t.rec;const hit=r.filter(x=>x.src.indexOf('groundBeige')>=0);return {atlasBlits:hit.length,onMain:hit.filter(x=>x.main).length};})()`);
      rows.push({ floor, file, size: `${w}x${h}`, pixelsNearTarget: near, groundBeigeAtlasBlits: blit.atlasBlits, note: 'blit 计数仅作记录：在线端家具走 furnitureSprites 烘焙缓存，稳态窗口内数不到图集 blit 属机制使然' });
    }
    const f7 = rows.find(x => x.floor === 7), f1 = rows.find(x => x.floor === 1);
    assert.ok(f7.pixelsNearTarget >= 50, `F7 实时画面 sports 米色像素过少（疑似静默回退）：${JSON.stringify(f7)}`);
    assert.ok(f7.pixelsNearTarget > f1.pixelsNearTarget * 5, `F7 未显著多于 F1 对照：${JSON.stringify(out)}`);
    return { target: TARGET, tolerance: TOL, results: rows };
  });
  await test('ONLINE：blit 不再误裁局部 y<58（floor 就地绘制含 dy<58 的瓦片）', async () => {
    const r = await ev(`(()=>{const out={};for(const f of [2,3,5]){const d=window.__drive(f,{wall:false,furn:false});out[f]={total:d.rec.length,under58:d.rec.filter(x=>x.dy<58).length,minDy:d.rec.length?Math.min(...d.rec.map(x=>x.dy)):null};}return out;})()`);
    for (const f of [2, 3, 5]) assert.ok(r[f].under58 > 0, `floor ${f}: local dy<58 count=${r[f].under58} (局部误裁回归)`);
    return r;
  });
  await test('ONLINE：主画面后墙墙带裁剪仍生效（world 空间 rect(y=58)+clip 与 furniture 分离）', async () => {
    const a = await analyze();
    const band = (a.rects || []).filter(r => r.y === 58);
    assert.ok(a.clips > 0, 'main canvas never called clip()');
    assert.ok(band.length > 0, 'no world-space clip rect at WALL_Y=58 on main canvas; rects=' + JSON.stringify(a.rects));
    return { clips: a.clips, wallClipRects: band.slice(0, 4), mainMinPropDy: a.mainMinPropDy, mainMinPropDySrc: a.mainMinPropDySrc };
  });
  await test('ONLINE：Antea Chair 以 16px 原生绘制（无放大）', async () => {
    const d = await ev(`(()=>{const out=[];for(const f of [1,6,7]){const r=window.__drive(f);for(const x of r.rec)if(/Chair\\.png/.test(x.src))out.push({f,dw:x.dw,dh:x.dh});}return out;})()`);
    assert.ok(d.length > 0, 'no chair prop drawn by the scene module');
    assert.ok(d.every(x => x.dw === 16 && x.dh === 16), 'chair upscaled: ' + JSON.stringify(d.slice(0, 8)));
    return { samples: d.slice(0, 8), n: d.length };
  });

  // ===== DEMO (file://) =====
  await test('DEMO(file://)：SID_SCENE 就绪、stats.error===null', async () => {
    await send('Page.navigate', { url: pathToFileURL(join(root, 'demo/index.html')).href + '?test' });
    await wait(() => ev('!!window.SID_SCENE&&!!window.__sidTest'), 'demo 加载'); await ev('SID_SCENE.ready');
    const s = await ev('({ready:SID_SCENE.stats.ready,error:SID_SCENE.stats.error})');
    assert.equal(s.ready, true); assert.equal(s.error, null, 'stats.error=' + s.error);
    return s;
  });
  const demoPer = [];
  for (let f = 1; f <= 7; f++) {
    await send('Page.navigate', { url: pathToFileURL(join(root, 'demo/index.html')).href + `?test&floor=${f}` });
    await wait(() => ev('!!window.SID_SCENE&&!!window.__sidTest'), 'demo floor ' + f);
    await ev('SID_SCENE.ready'); await pause(350);
    const recs = await ev('window.__t.rec');
    const themed = (await ev('SID_SCENE.stats')).themed || 0;
    const detail = SIGN[f].map(sig => ({ what: sig.what, hit: recs.some(r => sig.test(r)) }));
    demoPer.push({ floor: f, themed, signatures: detail, allHit: detail.every(d => d.hit), clips: await ev('window.__t.clips'), rects58: (await ev('window.__t.rects')).filter(r => r.y === 58).length, offLocalUnder58: recs.filter(r => !r.main && r.dy < 58).length });
  }
  await test('DEMO(file://)：7 层 themed>0、逐层主题签名命中、局部 y<58 不再裁空、墙裁剪仍在', () => {
    demoPer.forEach(r => notes.push(`demo floor ${r.floor}: themed=${r.themed} sig=${r.signatures.map(s => (s.hit ? '+' : '-') + s.what).join(' ')} offLocal<58=${r.offLocalUnder58} clip58=${r.rects58}`));
    assert.ok(demoPer.every(r => r.themed > 0), 'demo themed==0: ' + JSON.stringify(demoPer.filter(r => !(r.themed > 0)).map(r => r.floor)));
    assert.ok(demoPer.every(r => r.allHit), 'demo missing signatures: ' + JSON.stringify(demoPer.filter(r => !r.allHit).map(r => ({ f: r.floor, miss: r.signatures.filter(s => !s.hit).map(s => s.what) }))));
    assert.ok(demoPer.every(r => r.offLocalUnder58 > 0), 'demo local y<58 clipped: ' + JSON.stringify(demoPer.map(r => ({ f: r.floor, n: r.offLocalUnder58 }))));
    assert.ok(demoPer.every(r => r.rects58 > 0), 'demo world wall clip rect at y=58 missing: ' + JSON.stringify(demoPer.map(r => ({ f: r.floor, n: r.rects58 }))));
    return demoPer;
  });
  await test('DEMO：工位岛双排都画（逐 blocks 而非只 blocks[0]）', async () => {
    const report = [];
    for (const f of [1, 6, 7]) {
      await send('Page.navigate', { url: pathToFileURL(join(root, 'demo/index.html')).href + `?test&floor=${f}` });
      await wait(() => ev('!!window.WORLD&&!!window.__sidTest&&!!window.SID_SCENE'), 'demo ' + f); await ev('SID_SCENE.ready'); await pause(250);
      const r = await ev(`window.__driveDesk(${f})`);
      for (const fu of r) {
        if (!fu.island || fu.island.rows !== 2) continue;
        const bottoms = [0, 1].map(i => fu.island.uy + i * (fu.island.plan + fu.island.gap) + fu.island.plan);
        const desk = fu.rec.filter(x => /antea-office\/(Desk|Desk-2)\.png/.test(x.src));
        const hit = bottoms.map(b => desk.some(x => Math.abs((x.dy + x.dh) - b) <= 2));
        report.push({ floor: f, id: fu.id, label: fu.label, rowBottoms: bottoms.map(b => +b.toFixed(1)), hit, deskDraws: desk.length });
      }
    }
    assert.ok(report.length > 0, '未找到 rows===2 的工位岛');
    const broken = report.filter(i => !i.hit.every(Boolean));
    assert.deepEqual(broken, [], '工位岛第二排未绘制：' + JSON.stringify(broken));
    return { islands: report };
  });
  await test('DEMO：单件/道具家具不被拉到足迹宽（prop 单张、single 不铺满）', async () => {
    await send('Page.navigate', { url: pathToFileURL(join(root, 'demo/index.html')).href + '?test&floor=6' });
    await wait(() => ev('!!window.WORLD&&!!window.__sidTest&&!!window.SID_SCENE'), 'demo 6'); await ev('SID_SCENE.ready'); await pause(250);
    const d = await ev('window.__drive(6,{floor:false,wall:false})');
    const candy = d.rec.filter(r => /lollipop_red/.test(r.src));
    const foot = await ev(`WORLD.floorFurniture(6).filter(f=>f.type==='plant').map(f=>({id:f.id,w:f.w,x:f.x,blocks:(f.blocks||[]).map(b=>b.w)}))`);
    assert.ok(candy.length > 0, 'F6 无棒棒糖绘制（themed plant 未生效）');
    const maxDw = Math.max(...candy.map(c => c.dw));
    assert.ok(maxDw <= 70, 'candy prop 超过 2× (70px)：' + JSON.stringify(candy.slice(0, 6)));
    const perBlock = candy.map(c => ({ dx: c.dx, count: candy.filter(x => x.dx === c.dx).length }));
    const maxPerBlock = Math.max(...perBlock.map(p => p.count));
    assert.ok(maxPerBlock === 1, '棒棒糖在单块内被重复平铺：' + JSON.stringify(perBlock.slice(0, 8)));
    return { candySamples: candy.slice(0, 6), plantFootprints: foot, maxDw, maxPerBlock };
  });

  await test('ONLINE+DEMO：runtime / console 错误为 0', () => { assert.deepEqual(runtimeErrors, [], 'runtime'); assert.deepEqual(consoleErrors, [], 'console'); return { runtimeErrors, consoleErrors }; });
} catch (e) { fatal = { message: e.message, stack: e.stack }; results.push({ name: 'harness', pass: false, error: e.stack }); console.error(e.stack); }
finally {
  if (ws) { try { await send('Browser.close'); } catch { } try { ws.close(); } catch { } }
  for (const p of [chrome, server]) if (p && p.exitCode === null) { try { p.kill(); } catch { } }
  await pause(400);
  try { await rm(PROFILE, { recursive: true, force: true }); } catch { }
}
const afterHashes = Object.fromEntries(GUARDED.map(f => [f, sha(f)]));
const unchanged = JSON.stringify(beforeHashes) === JSON.stringify(afterHashes);
results.push({ name: '仅新增本 QA 测试与 outputs；scene/world/room/server/game/demo 源码 SHA-256 未变', pass: unchanged, detail: unchanged ? undefined : { beforeHashes, afterHashes } });
const summary = { passed: results.filter(r => r.pass).length, failed: results.filter(r => !r.pass).length, total: results.length };
const report = { date: new Date().toISOString(), stage: 'theme-assets independent QA', harness: 'managed Node + system Chrome headless, zero-dep CDP, isolated loopback port + own profile', guardedHashes: { before: beforeHashes, after: afterHashes, unchanged }, results, runtimeErrors, consoleErrors, notes, fatal: fatal || null, summary };
await writeFile(join(out, 'theme-assets-results.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...summary, unchanged, fatal: fatal?.message || null }, null, 2));
if (summary.failed) process.exitCode = 1;
