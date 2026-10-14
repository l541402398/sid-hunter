'use strict';
(() => {
  // All authoritative state stays in this closure. DOM and map consume publicProjection only.
  // No persistence, remote requests, analytics, or third-party libraries.
  const $ = id => document.getElementById(id);
  const WORLD = window.WORLD;
  const SPEED = WORLD.SPEED, BASE_H = WORLD.FLOOR_BASE_HEIGHT || 640;
  const canvas = $('office'), ctx = canvas.getContext('2d', {alpha:false});
  ctx.imageSmoothingEnabled = false;
  // ---------- 动态视口（统一缩放）---------- 世界与屏幕共用同一 s：屏幕变宽=看到更多世界，绝不非等比拉伸。
  let cssW=960,cssH=640,scale=1,viewW=960,viewH=BASE_H,dpr=1;
  let cameraX=0,cameraY=0,drawCamX=0,drawCamY=0;
  // ---------- 楼层渲染状态：只对应当前层，换层时整层原子替换 ----------
  let floorId=1,floorName='',glassDoorStates={};
  const SCENE=window.SID_SCENE;
  let furniture=[],walls=[],occluders=[],portals=[],npcs=[];
  const furnitureSprites=new Map();
  const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
  function buildNpcs(id){
    return WORLD.floorNpcs(id).map((n,i)=>({...n,id:n.id,npc:true,alive:true,walk:0,moving:false,spriteIndex:i+20,
      colors:Object.fromEntries(Object.entries(palettes).map(([key,options],j)=>[key,options[(i+j+2)%options.length]]))}));
  }
  // 换层时整层原子替换：floorId、家具/墙/NPC/入口/碰撞集合、点击标签全部对应同一新层。
  function loadFloorLocal(id){
    floorId=id;floorName=WORLD.floorById(id).name;
    furniture=WORLD.floorFurniture(id).filter(f=>!f.architecturalPlaceholder);walls=WORLD.floorWalls(id);
    glassDoorStates={};occluders=WORLD.floorBlockers(id,glassDoorStates);portals=WORLD.floorPortals(id);npcs=buildNpcs(id);
  }
  // 背景：固定 256×256 分块，按相机矩形枚举相交块；每块惰性烘焙一次后复用，与视口宽度解耦。
  // QA-D14：分块缓存加 LRU 上限（与在线客户端同口径）。原先 cx:cy 键无上限、跨楼层共享，
  // 最多 8×4=32 块≈32MiB 常驻；改为只保留相机相交块+少量预取，上限 10 块（≈10MiB），超出 LRU 淘汰。
  // 被淘汰块后续按世界坐标确定性重建（图案纯世界坐标 → 视觉无差异）；绝不淘汰当前可见块。
  // 阶段2-阶段1：CHUNK 512→256（世界÷4 后 512 已大于楼层高度 400，会浪费；分块仍是显式 canvas，口径不变）。
  const CHUNK=256;const CHUNK_CACHE_LIMIT=10;
  const chunkCache=new Map();let chunkTotal=0;
  function pruneChunks(keep){
    while(chunkTotal>CHUNK_CACHE_LIMIT){
      let victim=null;
      for(const k of chunkCache.keys()){if(!keep||!keep.has(k)){victim=k;break;}}
      if(victim===null)break;
      chunkCache.delete(victim);chunkTotal--;
    }
  }
  function chunkFor(cx,cy){
    const key=floorId+':'+cx+':'+cy;const hit=chunkCache.get(key);if(hit)return hit;
    const c=document.createElement('canvas');c.width=CHUNK;c.height=CHUNK;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.fillStyle='#4a3727';g.fillRect(0,0,CHUNK,CHUNK);
    const planks=['#54402f','#4a3727','#5b462f','#453324','#4f3c2c'];
    // 阶段2-阶段1：地板纹理模块 64×16 → 32×8（1.0m×0.25m 宽板），保持缩小后的屏幕观感。
    for(let y=0;y<CHUNK;y+=8){
      const row=((cy*CHUNK+y)/8)|0,stag=(row%2)?16:0;
      for(let x=-32+stag;x<CHUNK;x+=32){
        const worldCol=Math.round((cx*CHUNK+x)/32);
        const k=Math.abs(row*31+worldCol*17+97);
        g.fillStyle=planks[k%5];g.fillRect(x,y,32,8);
        if(k%7===0){g.fillStyle='#3c2c20';g.fillRect(x+5,y+3,9,1);}
        else if(k%5===0){g.fillStyle='#3c2c20';g.fillRect(x+16,y+5,6,1);}
        if(k%2){g.fillStyle='#3d2d20';g.fillRect(x,y,1,8);}
      }
      g.fillStyle='#5e4936';g.fillRect(0,y,CHUNK,1);
      g.fillStyle='#33251b';g.fillRect(0,y+7,CHUNK,1);
    }
    if(SCENE)SCENE.floor(g,floorId,cx*CHUNK,cy*CHUNK,CHUNK,CHUNK);
    chunkCache.set(key,c);chunkTotal++;return c;
  }
  // 每帧先把相机相交块全部就绪并 LRU 触及，再淘汰离屏块：本帧零重烘焙、可见块不被淘汰。
  function ensureChunks(c0x,c0y,c1x,c1y){
    const keep=new Set();
    for(let cy=c0y;cy<=c1y;cy++)for(let cx=c0x;cx<=c1x;cx++){
      const key=floorId+':'+cx+':'+cy;keep.add(key);
      if(chunkCache.has(key)){const v=chunkCache.get(key);chunkCache.delete(key);chunkCache.set(key,v);}
      else chunkFor(cx,cy);
    }
    pruneChunks(keep);
  }
  // 光晕与暗角都预渲染成小图后缩放贴图：逐帧/烘焙期不再重复求解大面积渐变。
  const glowSprite = (()=>{
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');
    const rg=g.createRadialGradient(64,64,2,64,64,64);
    rg.addColorStop(0,'rgba(255,214,158,1)');rg.addColorStop(1,'rgba(255,180,110,0)');
    g.fillStyle=rg;g.fillRect(0,0,128,128);return c;
  })();
  let vignette=null;
  function rebuildVignette(){
    const w=Math.max(1,Math.round(cssW)),h=Math.max(1,Math.round(cssH));
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const g=c.getContext('2d');
    const rg=g.createRadialGradient(w/2,h*.44,Math.min(w,h)*.3,w/2,h*.48,Math.max(w,h)*1.02);
    rg.addColorStop(0,'rgba(255,216,152,.05)');rg.addColorStop(.55,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(6,4,10,.42)');
    g.fillStyle=rg;g.fillRect(0,0,w,h);vignette=c;
  }
  // 视口尺寸/DPR 变化时重建 backing，并重新设置 transform 与 imageSmoothingEnabled。
  function resizeCanvas(){
    const cw=Math.max(1,Math.round(canvas.clientWidth||cssW||960));
    const ch=Math.max(1,Math.round(canvas.clientHeight||cssH||640));
    cssW=cw;cssH=ch;
    dpr=Math.min(window.devicePixelRatio||1,2,Math.sqrt(4000000/(cw*ch)));
    scale=ch/BASE_H;viewH=BASE_H;viewW=cw/scale;
    const bw=Math.max(1,Math.round(cw*dpr)),bh=Math.max(1,Math.round(ch*dpr));
    if(canvas.width!==bw||canvas.height!==bh){canvas.width=bw;canvas.height=bh;}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
    rebuildVignette();
    window.__viewport={cssW:cw,cssH:ch,viewW,viewH,scale,drawCamX,drawCamY,dpr};
  }
  const palettes = {
    hair:[['银白','#d3dce9'],['栗棕','#9f6748'],['墨黑','#263244'],['金黄','#e7bd6b'],['紫灰','#9986b2']],
    top:[['深蓝','#5686bc'],['砖红','#b86a64'],['草绿','#75a58a'],['米白','#d2c9b2'],['浅紫','#a18ac2']],
    pants:[['炭灰','#505d70'],['海军蓝','#354967'],['卡其','#a79770'],['浅灰','#95a1ad']],
    shoes:[['白色','#e3e7e8'],['黑色','#27303c'],['红色','#bb6258'],['棕色','#927253']]
  };
  // 明暗派生：所有渐变色都由公开颜色计算，不引入新的身份线索。
  const shadeCache = new Map();
  function shade(hex,k) {
    const key=hex+'|'+k;
    let v=shadeCache.get(key);
    if(v)return v;
    const n=parseInt(hex.slice(1),16);
    const t=k>0?255:8,a=Math.min(1,Math.abs(k));
    const ch=c=>Math.round(c+(t-c)*a);
    const r=ch((n>>16)&255),g=ch((n>>8)&255),b=ch(n&255);
    v='#'+((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
    shadeCache.set(key,v);return v;
  }
  // 肤色与发型只由「发色」这一公开属性推导，避免与阵营产生统计关联。
  const SKIN=['#eabb94','#d3a58a','#c08e73','#e8c3a3','#cf9d7e'];
  const fieldNames = {hair:'发色',top:'上衣颜色',pants:'裤子颜色',shoes:'鞋颜色'};
  const traitNames = {saying:'口头禅',food:'爱吃的食物',sport:'喜欢的运动'};
  const MASK = '***';
  const names = ['小序','阿澈','木木','七禾','南风','池雨','蓝桉','柚子','星野','可颂','松子','北辰','秋白','墨墨','梨舟','小满','照野','言川','竹青','余温'];
  let players, self, logs, selectedId = null, pending = null;
  let privateOpen = false, myHeld = false, myKey = null;
  let toastTimer;
  function showToast(message) {
    const toast = $('copy-toast');
    clearTimeout(toastTimer);toast.textContent=message;toast.hidden=false;
    toastTimer=setTimeout(()=>{toast.hidden=true;toast.textContent='';},1800);
  }
  async function copySID(text) {
    try {
      if(navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else {
        const focused=document.activeElement;
        const input=document.createElement('textarea');input.value=text;
        input.style.cssText='position:fixed;left:-9999px;top:0';
        document.body.append(input);input.select();
        const ok=document.execCommand('copy');input.remove();
        if(focused?.isConnected)focused.focus({preventScroll:true});
        if(!ok)throw new Error('copy unavailable');
      }
      showToast('已复制');
    } catch { showToast('复制失败，请允许剪贴板权限或手动复制'); }
  }
  const sidHTML = sid => `<span class="sid-copy" role="button" tabindex="0" aria-label="复制当前显示的S-ID" data-copy-sid>${escapeText(sid)}</span>`;
  // Copy only the rendered text: public masks stay masks, no hidden segments are read.
  document.addEventListener('pointerdown',e=>{
    const item=e.target.closest('[data-copy-sid]');
    if(item&&e.button===0){e.preventDefault();e.stopPropagation();copySID(item.textContent);}
  });
  document.addEventListener('click',e=>{if(e.target.closest('[data-copy-sid]'))e.stopPropagation();},true);
  document.addEventListener('keydown',e=>{
    const item=e.target.closest('[data-copy-sid]');
    if(item&&(e.key==='Enter'||e.code==='Space')){e.preventDefault();e.stopImmediatePropagation();copySID(item.textContent);}
  },true);
  let privateResult = '', candidates = [], keys = new Set(), clock = 0;
  let lastNow = performance.now(), lastUI = -1;
  const timings = [];
  let chips = 0, searched = new Set(), clues = [], clueKeys = new Set();
  let exploration = null, explorationResult = '';
  // 电梯过渡状态机：IDLE_SOURCE → PREPARING → SUBMITTING → TARGET_READY → OPENING → IDLE_TARGET；
  // 失败分 FAILED_SOURCE（已证实未换层，回源层）与 UNCONFIRMED（结果不明，只读对账，不重发）。
  let floorState='IDLE_SOURCE',floorFlight=null,floorStartedAt=0,floorStageTimer=null,floorNoticeTimer=null;
  // 电梯选层面板：不分方向的电梯，进门（E / 点击）先弹选层（1–7，禁当前层），选定后才发起换层。
  let elevatorPicker=null;
  // 本地娱乐互动状态：转盘领取记录、猜拳冷却/结果、J 互动冷却与朝向。全部只在本地，不写公共日志。
  const RPS_ZH = {rock:'石头',paper:'布',scissors:'剪刀'};
  let wheelClaims = new Set();
  let rpsChoice = 'rock', rpsUntil = 0, rpsResult = '', gamesBuilt = false;
  let attackUntil = 0, combatText = '', swingUntil = 0, swingDirection = 'right', facing = {x:1,y:0};
  // 结束判定与排行榜：finished 后禁用移动/探索/小游戏/攻击。startedAt 为开局 clock（当前恒为 0）。
  let finished = false, finishReason = null, ranking = null, hadBad = false, startedAt = 0;
  // 大转盘：可重复转动，wheelSpins 记录已转次数（首次免费，之后按 WORLD.wheelSpinCost 阶梯收费）。
  let wheelSpins = 0, wheel = null, wheelRAF = 0;
  const stamp = () => new Date().toLocaleTimeString('zh-CN',{hour12:false});
  function reset(mode='good') {
    players = names.map((name,i) => ({
      id:i,name,floorId:1,x:0,y:0,
      role:[3,7,12,18].includes(i)?'bad':'good',alive:i!==19,
      hp:[3,7,18].includes(i)?2:1,
      sid:[`${String.fromCharCode(65+i)}${(i*3+7)%10}${String.fromCharCode(67+i%20)}`,`${(i*2+9)%10}${String.fromCharCode(75+i%14)}${(i+2)%10}`,`${(i+3)%10}${String.fromCharCode(77+i%12)}${(i*7+8)%10}`],
      sidPublic:[true,false,false],
      colors:Object.fromEntries(Object.entries(palettes).map(([k,options],j)=>[k,options[(i+j)%options.length]])),
      traits:{saying:['先喝口水','马上就好','有点意思','稳住别慌','让我想想'][i%5],food:['番茄面','饺子','咖喱饭','火锅','三明治'][i%5],sport:['羽毛球','游泳','骑行','篮球','跑步'][i%5]},
      traitPublic:{saying:i%3===0,food:i%4===0,sport:false},
      probes:2,probeUntil:0,actionUntil:0,
      chips:3,stunUntil:0,freezeUntil:0,score:0,
      walk:0,moving:false,spriteFacing:'front'
    }));
    // 七层分布：自己与近邻留在 1F，其余模拟玩家分散到 2–7F，各层都有可交互目标；
    // 每人在本层安全出生点内落位（落在楼面轮廓内且不撞家具/墙体）。
    const floorOf = i => i===0||i<=3 ? 1 : 2 + ((i-4) % 6);
    players.forEach((p,i) => {
      const fid = floorOf(i), spawns = WORLD.floorSpawns(fid), blockers = WORLD.floorBlockers(fid);
      const base = spawns[i % spawns.length];
      const cx = base.x + (((i*37)%5)-2)*16, cy = base.y + (((i*53)%5)-2)*13;
      const ok = !WORLD.floorCollides(fid, cx, cy, blockers);
      p.floorId = fid; p.x = ok ? cx : base.x; p.y = ok ? cy : base.y;
    });
    loadFloorLocal(1);
    self = players[0]; self.role=mode; self.hp=mode==='bad'?2:1; self.score=0;
    players[5].traitPublic={saying:true,food:true,sport:true};
    players[5].sidPublic=[true,true,true];
    logs=[{time:stamp(),text:'办公室已就绪：20位模拟玩家，分布七层，19位存活。'}];
    clock=0;cameraX=0;cameraY=0;selectedId=null;keys.clear();pending=null;privateResult='';
    floorState='IDLE_SOURCE';floorFlight=null;closeFloorOverlay();
    chips=0;searched.clear();clues=[];clueKeys.clear();closeExploration();
    // 清空本地娱乐互动：转盘领取、猜拳冷却与结果、J 互动冷却、眩晕/僵直与朝向。
    wheelClaims.clear();rpsChoice='rock';rpsUntil=0;rpsResult='';
    attackUntil=0;combatText='';swingUntil=0;swingDirection='right';facing={x:1,y:0};
    // 重置结束判定、排行榜与大转盘：关闭覆盖层、清零已转次数。
    wheelSpins=0;closeWheel();
    finished=false;finishReason=null;ranking=null;hadBad=players.some(p=>p.role==='bad');startedAt=0;
    if($('finish-overlay'))$('finish-overlay').hidden=true;
    if($('ranking')){$('ranking').hidden=true;$('ranking').replaceChildren();}
    if($('ranking-toggle'))$('ranking-toggle').setAttribute('aria-expanded','false');
    closeGames();
    privateOpen=false;candidates=[];
    if($('copy-toast')){$('copy-toast').hidden=true;$('copy-toast').textContent='';clearTimeout(toastTimer);}
    // Never keep a previous query around: the roster re-renders from an empty search box.
    if($('search'))$('search').value='';
    $('target').hidden=true;$('target').replaceChildren();
    $('candidates').hidden=true;$('candidates').replaceChildren();
    renderPublic();updateExplorationHUD();if(myHeld)renderMine();
  }
  function publicProjection(p) {
    return {id:p.id,name:p.name,alive:p.alive,x:p.x,y:p.y,floorId:p.floorId,
      sid:p.sid.map((s,i)=>p.sidPublic[i]?s:MASK).join('-'),colors:p.colors,
      traits:Object.fromEntries(Object.keys(p.traits).map(k=>[k,p.traitPublic[k]?p.traits[k]:MASK]))};
  }
  function escapeText(value) { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  // 名单头像与地图角色同源：发型/肤色由发色推导，带描边与明暗，和地图上的小人一一对应。
  function portrait(p) {
    const c=p.colors;
    const hi=Math.max(0,palettes.hair.findIndex(o=>o[0]===c.hair[0]));
    const skin=SKIN[hi],hair=c.hair[1],style=hi%4;
    const sides=style===1
      ? `<path fill="${shade(hair,-.12)}" d="M3 6h3v11H3zM18 6h3v11h-3z"/>`
      : `<path fill="${shade(hair,-.3)}" d="M3 6h3v7H3zM18 6h3v7h-3z"/>`;
    const extra=style===2?`<path fill="${shade(hair,-.2)}" d="M20 9h3v9h-3z"/>`
      :style===3?`<path fill="${hair}" d="M9 0h6v4H9z"/><path fill="${shade(hair,.28)}" d="M10 1h4v1h-4z"/>`:'';
    return `<svg class="portrait" viewBox="0 0 24 32" aria-hidden="true">`
      +`<path fill="#1d1720" d="M4 0h16v17H4zM1 12h22v16H1zM2 24h20v8H2z"/>`
      +extra+sides
      +`<path fill="${hair}" d="M5 2h14v6H5z"/><path fill="${shade(hair,.3)}" d="M6 3h8v1H6z"/>`
      +`<path fill="${skin}" d="M6 7h12v9H6z"/>`
      +`<path fill="#2b2230" d="M8 10h2v2H8zM14 10h2v2h-2z"/><path fill="#f2f7ff" d="M8 10h1v1H8zM14 10h1v1h-1z"/>`
      +`<path fill="${shade(skin,-.3)}" d="M11 13h2v1h-2z"/><path fill="#a8706a" d="M10 15h4v1h-4z"/>`
      +`<path fill="${shade(skin,-.25)}" d="M10 16h4v2h-4z"/>`
      +`<path fill="${c.top[1]}" d="M5 17h14v10H5z"/><path fill="${shade(c.top[1],.25)}" d="M5 17h14v2H5z"/>`
      +`<path fill="${shade(c.top[1],-.3)}" d="M11 17h2v5h-2z"/>`
      +`<path fill="${shade(c.top[1],-.22)}" d="M2 18h3v8H2zM19 18h3v8h-3z"/>`
      +`<path fill="${skin}" d="M2 25h3v2H2zM19 25h3v2h-3z"/>`
      +`<path fill="${shade(c.pants[1],-.1)}" d="M6 27h5v4H6zM13 27h5v4h-5z"/>`
      +`<path fill="${c.pants[1]}" d="M6 27h5v1H6zM13 27h5v1h-5z"/>`
      +`<path fill="${c.shoes[1]}" d="M4 30h7v2H4zM13 30h7v2h-7z"/>`
      +`</svg>`;
  }
  // Roster search reads the public projection only: name, four public colors, and those
  // hidden traits whose public flag is set. A MASKed trait never enters this list, so an
  // unpublished value can neither match nor be revealed through a hit hint. No special
  // case for self: my own unpublished trait is masked exactly like everyone else's.
  function searchFields(p) {
    const fields=[{key:'name',label:'姓名',text:p.name}];
    for(const k of Object.keys(fieldNames)) fields.push({key:k,label:fieldNames[k],text:p.colors[k][0]});
    for(const k of Object.keys(traitNames)) if(p.traits[k]!==MASK) fields.push({key:k,label:traitNames[k],text:p.traits[k]});
    return fields;
  }
  // Value matching: name, four public colors and published trait values, substring based.
  // Field-name matching: exact equality only, and only for the three hidden traits, so
  // 口头禅 hits players whose 口头禅 is public while 颜色 / 姓名 never match anyone.
  function matchPublic(p,query) {
    if(!query)return [];
    return searchFields(p).filter(f=>f.text.toLowerCase().includes(query)||(traitNames[f.key]&&f.label===query));
  }
  // The 姓名 field never renders a hit line; at most two sources are shown, N counts the
  // rendered sources (name excluded) so the text never disagrees with what is displayed.
  function matchHint(hits) {
    const shown=(hits||[]).filter(h=>h.key!=='name');
    if(!shown.length)return '';
    const text=shown.slice(0,2).map(h=>`${escapeText(h.label)}：${escapeText(h.text)}`).join(' · ');
    return `<small class="roster-match">${text}${shown.length>2?` 等${shown.length}项`:''}</small>`;
  }
  function row(p,hits) {
    return `<button class="roster-row${p.id===selectedId?' active':''}" data-player="${p.id}">${portrait(p)}<span><strong>${p.name}</strong><small>${sidHTML(p.sid)}</small>${matchHint(hits)}</span>${!p.alive?'<span class="out-label">淘汰</span>':p.id===0?'<span class="self-label">自己</span>':''}</button>`;
  }
  function bindRows(container) { container.querySelectorAll('[data-player]').forEach(b=>b.onclick=()=>select(Number(b.dataset.player))); }
  function renderRoster() {
    const query=$('search').value.trim().toLowerCase();
    const result=players.map(publicProjection).map(p=>({p,hits:matchPublic(p,query)})).filter(r=>!query||r.hits.length);
    $('roster-items').innerHTML=result.length?result.map(r=>row(r.p,r.hits)).join(''):'<p class="panel-note">没有匹配的公开信息</p>';
    bindRows($('roster-items'));
  }
  function renderLogs() {
    $('log-items').innerHTML=logs.map(l=>`<li><time>${l.time}</time><p>${escapeText(l.text).replace(/[A-Z0-9*]{3}-[A-Z0-9*]{3}-[A-Z0-9*]{3}/g,sidHTML)}</p></li>`).join('');
    $('log-count').textContent=logs.length;
  }
  const anonymousIds=[3,7,12,18];
  function renderSlots() {
    $('bad-slots').innerHTML=anonymousIds.map((id,i)=>{
      const p=publicProjection(players[id]);
      // Fixed anonymous mapping. Never expose name, world position or full S-ID here.
      const clues=Object.entries(p.traits).filter(([,v])=>v!==MASK).map(([k,v])=>`${traitNames[k]}：${v}`);
      return `<article class="bad-slot"><h3>坏人${i+1} <span class="out-label">${p.alive?'未淘汰':'已淘汰'}</span></h3><p>${clues.length?clues.map(escapeText).join('<br>'):'暂无已公开隐藏线索'}</p></article>`;
    }).join('');
  }
  function renderPublic() {
    $('alive-count').textContent=players.filter(p=>p.alive).length;
    $('out-count').textContent=players.filter(p=>!p.alive).length;
    renderRoster();renderLogs();renderSlots();
  }
  function addLog(text) { logs.unshift({time:stamp(),text}); if(logs.length>80)logs.pop(); }
  function selected() { return selectedId===null?null:players[selectedId]; }
  function holding() { return privateOpen; }
  function clearPrivate(clearMy=false) {
    privateOpen=false;pending=null;privateResult='';
    const block=$('private-content');if(block)block.replaceChildren();
    const gate=$('private-gate');if(gate){gate.textContent='展开私密操作';gate.setAttribute('aria-expanded','false');}
    if(clearMy){myHeld=false;myKey=null;$('mine').replaceChildren();$('mine').hidden=true;}
  }
  // 切出页面 / 失焦 / pointercancel 统一入口：清空方向集合、释放指针捕获；不触发换层或任何上行请求。
  const pointerIds=new Set();
  canvas.addEventListener('pointerdown',e=>pointerIds.add(e.pointerId));
  function clearAllInput(e) {
    keys.clear();if(e&&typeof e.pointerId==='number')pointerIds.add(e.pointerId);
    for(const id of pointerIds){try{if(canvas.hasPointerCapture&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch{}}
    pointerIds.clear();clearPrivate(true);closeExploration();closeGames();closeWheel();
  }
  function select(id) {
    closeExploration();clearPrivate(true);closeGames();closeWheel();selectedId=id;candidates=[];$('candidates').hidden=true;$('candidates').replaceChildren();
    renderTarget();renderRoster();
  }
  function renderTarget() {
    const raw=selected();if(!raw){$('target').hidden=true;$('target').replaceChildren();return;}
    const p=publicProjection(raw);$('target').hidden=false;
    $('target').innerHTML=`<div class="panel-heading"><span class="eyebrow">PUBLIC PROFILE</span><button id="target-close" class="icon-button" aria-label="关闭目标档案">×</button></div><div class="target-person">${portrait(p)}<div><h2>${p.name}</h2><p class="sid">${sidHTML(p.sid)}</p><p class="status">${p.alive?'存活 · 公开档案':'已淘汰 · 可查看，不可操作'}${p.id===0?' · 自己':''}</p></div></div><div class="color-grid">${Object.entries(p.colors).map(([k,c])=>`<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${c[0]}</div>`).join('')}</div><div class="traits">${Object.entries(p.traits).map(([k,v])=>`<div class="trait"><span>${traitNames[k]}</span><strong>${escapeText(v)}</strong></div>`).join('')}</div><button id="private-gate" class="private-gate" aria-expanded="${privateOpen}">${privateOpen?'收起私密操作':'展开私密操作'}</button><p class="hold-note">点击展开或收起 · 展开期间请注意周围视线 · 切出页面自动隐藏</p><div id="private-content"></div>`;
    $('target-close').onclick=()=>{clearPrivate(true);selectedId=null;renderTarget();renderRoster();};
    $('private-gate').onclick=()=>{
      if(privateOpen)clearPrivate();
      else { closeGames();privateOpen=true;keys.clear();renderPrivate();$('private-gate').textContent='收起私密操作';$('private-gate').setAttribute('aria-expanded','true'); }
    };
    if(holding())renderPrivate();
  }
  const left = until => Math.max(0,Math.ceil(until-clock));
  function probeAvailable(p) { return self.role==='good'?Object.keys(p.traits).some(k=>!p.traitPublic[k]):p.sidPublic.some(x=>!x); }
  function canTarget(p) { return !!p && p.id!==0 && p.alive && self.alive; }
  function renderPrivate() {
    const host=$('private-content'),p=selected();if(!host)return;
    if(!holding()||!p){host.replaceChildren();return;}
    const can=canTarget(p),probeWait=left(self.probeUntil),actionWait=left(self.actionUntil);
    host.innerHTML=`<div class="private-block"><p class="private-title">${self.role==='good'?'好人':'坏人'}技能 · 私密操作已展开</p><div class="skill-row"><button id="probe" class="investigate" ${!can||!self.probes||probeWait||!probeAvailable(p)?'disabled':''}>探查 ${self.probes}/2</button><button id="action" class="${self.role==='good'?'accuse':'kill'}" ${!can||actionWait?'disabled':''}>${self.role==='good'?'指认':'击杀'}</button></div><p id="skill-info" class="skill-info"></p><div id="confirm-host"></div><div id="result-host"></div></div>`;
    $('probe').onclick=()=>{if(!holding())return;pending={kind:'probe',target:p.id};renderConfirmation();};
    $('action').onclick=()=>{if(!holding())return;pending={kind:self.role==='good'?'accuse':'kill',target:p.id};renderConfirmation();};
    updateSkillStatus();renderConfirmation();renderResult();
  }
  function updateSkillStatus() {
    if(!holding())return;const p=selected(),s=$('skill-info');if(!s||!p)return;
    const pw=left(self.probeUntil),aw=left(self.actionUntil);
    s.textContent=!canTarget(p)?'自己或淘汰目标不可操作；淘汰的自己不能使用技能。':`探查${pw?`冷却 ${pw}s`:'就绪'} · ${self.role==='good'?'指认':'击杀'}${aw?`冷却 ${aw}s`:'就绪'} · Demo：8s / 12s${!probeAvailable(p)?' · 无可公开项':''}`;
    $('probe').disabled=!canTarget(p)||self.probes<=0||pw>0||!probeAvailable(p);
    $('action').disabled=!canTarget(p)||aw>0;
  }
  function renderConfirmation() {
    const host=$('confirm-host');if(!host)return;host.replaceChildren();
    if(!holding()||!pending)return;
    const k=pending.kind;
    host.innerHTML=`<div class="confirm-box"><p>${k==='probe'?(self.role==='good'?'公开目标一项未知隐藏属性，消耗一次探查。':'公开目标一段未知S-ID，消耗一次探查。'):k==='accuse'?'确认指认该目标？有效提交后进入12秒冷却；错指认会公开自己一段S-ID。':'手动输入目标完整S-ID。示例格式：K8Q-2T9-6R4（仅示例）；严格大写精确匹配，不自动填入。可自由输入或粘贴，无需按住Shift。'}</p>${k==='kill'?'<input id="sid-input" aria-label="输入目标完整S-ID" autocomplete="off" spellcheck="false" placeholder="XXX-XXX-XXX" maxlength="11">':''}<button id="confirm">确认${k==='probe'?'探查':k==='accuse'?'指认':'击杀'}</button> <button id="cancel">取消</button></div>`;
    $('confirm').onclick=()=>commit($('sid-input')?$('sid-input').value:'');
    $('cancel').onclick=()=>{pending=null;renderConfirmation();};
  }
  function renderResult() {const r=$('result-host');if(r)r.innerHTML=holding()&&privateResult?`<p class="private-result">${escapeText(privateResult)}</p>`:'';}
  function commit(input='') {
    if(!holding()||!pending||pending.target!==selectedId)return false;
    const p=selected(),kind=pending.kind;
    if(!canTarget(p))return false;
    if(kind==='probe'){
      if(self.probes<=0||clock<self.probeUntil||!probeAvailable(p))return false;
      if(self.role==='good'){
        const key=Object.keys(p.traits).find(k=>!p.traitPublic[k]);p.traitPublic[key]=true;
        addLog(`${p.name}的${traitNames[key]}已公开：${p.traits[key]}。`);
        privateResult=`探查完成：${traitNames[key]}为「${p.traits[key]}」。`;
      }else{
        const index=p.sidPublic.findIndex(x=>!x);p.sidPublic[index]=true;
        addLog(`${p.name}的S-ID已公开：${publicProjection(p).sid}。`);
        privateResult=`探查完成：第${index+1}段S-ID为 ${p.sid[index]}。`;
      }
      self.probes--;self.probeUntil=clock+8;
      addScore(WORLD.SCORE.probe);
    }else{
      if(clock<self.actionUntil)return false;
      if(kind==='kill'){
        input=String(input); // Exact uppercase S-ID; no fuzzy matching or secret auto-fill.
        if(!/^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(input)){
          privateResult='格式错误：必须是三段，每段3位字母或数字。不消耗、不进入冷却。';renderResult();return false;
        }
      }
      self.actionUntil=clock+12;
      if(kind==='accuse'){
        addLog(`${p.name}被指认一次。`);
        if(p.role==='bad'){
          p.hp--;privateResult=`指认命中：目标扣1血${p.hp<=0?'，已淘汰':'，仍存活'}。`;
          addScore(WORLD.SCORE.accuseHit);
          if(p.hp<=0){p.alive=false;addLog(`${p.name}已淘汰。`);}
        }else{
          const index=self.sidPublic.findIndex(x=>!x);
          if(index>=0){self.sidPublic[index]=true;addLog(`${self.name}的S-ID已公开：${publicProjection(self).sid}。`);}
          privateResult=`错指认：${index>=0?'自己一段S-ID已公开':'自己的S-ID已全部公开，无新增公开段'}。`;
        }
      }else if(input===p.sid.join('-')){
        p.hp=0;p.alive=false;addLog(`${p.name}已淘汰。`);privateResult='S-ID完全匹配：目标已淘汰。';
        addScore(WORLD.SCORE.kill);
      }else privateResult='S-ID不匹配：目标未淘汰，进入12秒冷却。';
    }
    pending=null;renderPublic();renderTarget();return true;
  }
  function renderMine() {
    if(!myHeld){$('mine').replaceChildren();$('mine').hidden=true;return;}
    const p=self;$('mine').hidden=false;
    $('mine').innerHTML=`<span class="eyebrow">PRIVATE / HOLD TO REVEAL</span><h2>我的信息 · ${p.name}</h2><p class="sid">${sidHTML(p.sid.join('-'))}</p><div class="color-grid">${Object.entries(p.colors).map(([k,c])=>`<div class="attribute"><span>${fieldNames[k]}</span><i class="swatch" style="background:${c[1]}"></i>${c[0]}</div>`).join('')}</div><div class="secret-line"><span>阵营</span><strong>${p.role==='good'?'好人':'坏人'}</strong></div><div class="secret-line"><span>生命</span><strong>${p.hp} · ${p.alive?'存活':'已淘汰'}</strong></div>${Object.entries(p.traits).map(([k,v])=>`<div class="secret-line"><span>${traitNames[k]}</span><strong>${escapeText(v)}</strong></div>`).join('')}<p class="hold-note">探查 ${p.probes}/2 · 8秒Demo冷却<br>指认/击杀：12秒Demo冷却；每个角色资源独立。</p><p class="hold-note">测试模式：聚焦「我的信息」后按住空格，再用鼠标点击下列按钮。松开空格立即清空。</p><div class="test-controls"><button id="mode-good">切为好人</button><button id="mode-bad">切为坏人</button><button id="reset">重置模拟</button></div>`;
    $('mode-good').onclick=()=>changeMode('good');$('mode-bad').onclick=()=>changeMode('bad');
    $('reset').onclick=()=>{if(myHeld)reset(self.role);};
  }
  function changeMode(mode) {if(!myHeld)return;clearPrivate();self.role=mode;self.hp=mode==='bad'?2:1;renderMine();}
  function closeExploration() {
    exploration=null;explorationResult='';
    $('exploration').replaceChildren();$('exploration').hidden=true;
    $('clue-bag').setAttribute('aria-expanded','false');
  }
  function explorationEntity(kind,id) {
    return (kind==='container'?furniture.filter(f=>f.container):kind==='npc'?npcs:[]).find(e=>e.id===id);
  }
  function withinReach(entity) {return self.alive&&!!entity&&WORLD.distanceToEntity(self,entity)<=WORLD.INTERACT_RANGE;}
  function nearbyEntities() {
    return [...furniture.filter(f=>f.container).map(entity=>({kind:'container',entity})),...npcs.map(entity=>({kind:'npc',entity}))]
      .filter(({entity})=>withinReach(entity)).sort((a,b)=>WORLD.distanceToEntity(self,a.entity)-WORLD.distanceToEntity(self,b.entity));
  }
  function availableClue() {
    for(const p of players){
      if(!p.alive||p.id===self.id)continue;
      for(const key of Object.keys(traitNames))if(!p.traitPublic[key]&&!clueKeys.has(`${p.id}:${key}`))return {p,key};
    }
    return null;
  }
  function receiveClue(candidate,source) {
    const {p,key}=candidate,value=p.traits[key],label=traitNames[key];
    const clue={targetId:p.id,targetName:p.name,key,label,value,source,text:`${p.name}的${label}是「${value}」。`};
    clueKeys.add(`${p.id}:${key}`);clues.push(clue);return clue;
  }
  function openExploration(kind,id) {
    if(finished)return false;
    const entity=explorationEntity(kind,id);
    if(!self.alive||kind!=='backpack'&&!withinReach(entity))return false;
    closeGames();closeWheel();clearPrivate(true);keys.clear();closeExploration();selectedId=null;
    candidates=[];$('candidates').hidden=true;$('candidates').replaceChildren();renderTarget();renderRoster();
    exploration={kind,entityId:id??null};renderExploration();return true;
  }
  function interact(kind,entityId) {
    if(kind==='close'){closeExploration();return true;}
    if(finished)return false;
    if(['container','npc','backpack'].includes(kind))return openExploration(kind,entityId);
    const expected=kind==='search'?'container':kind==='exchange'?'npc':null;
    if(!expected||!exploration||exploration.kind!==expected||exploration.entityId!==entityId)return false;
    const entity=explorationEntity(expected,entityId);
    if(!withinReach(entity)){closeExploration();return false;}
    if(kind==='search'){
      const searchKey=`${self.id}:${entity.id}`;
      if(searched.has(searchKey)){explorationResult='已搜寻：每名玩家每个容器只能搜一次。';renderExploration();return false;}
      searched.add(searchKey);
      const candidate=['cabinet','table'].includes(entity.type)?availableClue():null;
      addScore(WORLD.SCORE.search);
      if(candidate){const clue=receiveClue(candidate,entity.container.name);addScore(WORLD.SCORE.clue);explorationResult=`搜寻完成：${clue.text}`;}
      else {const reward=entity.type==='reception'?3:2;chips+=reward;explorationResult=`搜寻完成：获得 ${reward} 筹码${['cabinet','table'].includes(entity.type)?'（暂无可获得的新私密线索）':''}。`;}
    }else{
      if(chips<entity.cost){explorationResult=`筹码不足：需要 ${entity.cost} 筹码，未扣除。`;renderExploration();return false;}
      const candidate=availableClue();
      if(!candidate){explorationResult='暂无未拥有的真实私密线索，未扣除筹码。';renderExploration();return false;}
      const clue=receiveClue(candidate,entity.name);chips-=entity.cost;
      addScore(WORLD.SCORE.exchange+WORLD.SCORE.clue);
      explorationResult=`兑换完成：${clue.text}`;
    }
    renderExploration();return true;
  }
  // ---------- 大转盘（可重复） ----------
  // 画布扇形沿用深色像素风：每格按 slot.color 填充，叠加格边与中心轮毂，顶部固定指针。
  // 文字按 slot.kind 区分：筹码格写数量，特殊券写 glyph + 短名；文字颜色由底色亮度推导以保证可读。
  function contrastText(hex) {
    const n=parseInt(String(hex||'#334155').slice(1),16)||0;
    const l=((n>>16)&255)*.299+((n>>8)&255)*.587+(n&255)*.114;
    return l>150?'#10151f':'#f6fbff';
  }
  function drawWheel(angle) {
    const cv=$('wheel-canvas');if(!cv)return;
    const g=cv.getContext('2d');g.imageSmoothingEnabled=false;
    const W=cv.width,Ht=cv.height,cx=W/2,cy=Ht/2,R=Math.min(cx,cy)-8;
    g.clearRect(0,0,W,Ht);
    g.fillStyle='#0b1221';g.beginPath();g.arc(cx,cy,R+5,0,Math.PI*2);g.fill();
    g.strokeStyle='#3b5470';g.lineWidth=2;g.stroke();
    const slots=(wheel&&wheel.slots)||[];
    if(!slots.length){
      g.fillStyle='#233149';g.beginPath();g.arc(cx,cy,R-4,0,Math.PI*2);g.fill();
      g.fillStyle='#8ca2bd';g.font='13px -apple-system,"PingFang SC",sans-serif';g.textAlign='center';g.textBaseline='middle';
      g.fillText('转盘物品暂不可用',cx,cy);return;
    }
    const seg=Math.PI*2/slots.length,start0=-Math.PI/2;
    g.save();g.translate(cx,cy);g.rotate(angle);
    for(let i=0;i<slots.length;i++){
      const s=slots[i],a0=start0+i*seg,b=a0+seg;
      g.beginPath();g.moveTo(0,0);g.arc(0,0,R,a0,b);g.closePath();
      g.fillStyle=s.color||'#334155';g.fill();
      g.lineWidth=2;g.strokeStyle='#0b1221';g.stroke();
      const isChip=s.kind==='chips';
      const main=isChip?String(s.amount):(s.glyph||'★');
      const sub=isChip?(s.label||'筹码'):(s.label||'');
      g.save();g.rotate(a0+seg/2);g.translate(R*.62,0);g.rotate(Math.PI/2);
      g.textAlign='center';g.textBaseline='middle';g.fillStyle=contrastText(s.color);
      g.font='bold 19px ui-monospace,SFMono-Regular,monospace';g.fillText(main,0,-7);
      g.font='10px -apple-system,"PingFang SC",sans-serif';g.fillText(sub,0,9);
      g.restore();
    }
    g.restore();
    g.fillStyle='#1e293b';g.beginPath();g.arc(cx,cy,25,0,Math.PI*2);g.fill();
    g.strokeStyle='#60a5fa';g.lineWidth=3;g.stroke();
    g.fillStyle='#cde5ff';g.font='bold 13px ui-monospace,monospace';g.textAlign='center';g.textBaseline='middle';g.fillText('S·ID',cx,cy);
    g.fillStyle='#ffd76a';g.beginPath();g.moveTo(cx,cy-R+6);g.lineTo(cx-11,cy-R-20);g.lineTo(cx+11,cy-R-20);g.closePath();g.fill();
    g.strokeStyle='#0b1221';g.lineWidth=2;g.stroke();
  }
  function wheelStateText() {
    const cost=WORLD.wheelSpinCost(wheelSpins);
    return `第 ${wheelSpins+1} 次 · ${cost?`消耗 ${cost} 筹码`:'免费'} · ${self.role==='bad'?'坏人盘（洗心革面券 / 轮回券）':'好人盘（线索券）'}`;
  }
  function updateWheelUI() {
    if(!wheel)return;
    const cost=WORLD.wheelSpinCost(wheelSpins),n=wheelSpins+1;
    if($('wheel-cost'))$('wheel-cost').textContent=cost===0?`第 ${n} 次：免费`:`第 ${n} 次：${cost} 筹码（当前 ${chips}）`;
    const btn=$('wheel-spin');
    if(btn){btn.disabled=wheel.spinning||finished||!self.alive;btn.textContent=wheel.spinning?'转动中…':'转动转盘';}
    if($('wheel-title'))$('wheel-title').textContent=self.role==='bad'?'大转盘 · 坏人盘':'大转盘 · 好人盘';
    if($('wheel-rules'))$('wheel-rules').textContent='可重复转动 · 首次免费，之后按次数阶梯收费 · 每次 10 格物品（不同数量筹码 + 特殊券） · 仅本地计算，不写公共日志。';
  }
  function openWheel(npcId) {
    if(finished||!self.alive)return false;
    const entity=explorationEntity('npc',npcId);
    if(!entity||!withinReach(entity))return false;
    closeWheel();
    wheel={npcId,slots:WORLD.buildWheelPool(self.role),angle:0,spinning:false,lastItem:null,lastIndex:-1};
    const ov=$('wheel-overlay');if(ov)ov.hidden=false;
    if($('wheel-result'))$('wheel-result').textContent='';
    drawWheel(0);updateWheelUI();
    return true;
  }
  function closeWheel() {
    // 旋转中关闭：先按已完成结算，避免已扣费的转动丢失奖励；随后取消动画并清空内容。
    if(wheel&&wheel.spinning&&wheel.lastItem)settleWheelSpin();
    if(wheelRAF){cancelAnimationFrame(wheelRAF);wheelRAF=0;}
    wheel=null;
    const ov=$('wheel-overlay');if(ov)ov.hidden=true;
    if($('wheel-result'))$('wheel-result').textContent='';
    const cv=$('wheel-canvas');
    if(cv){const g=cv.getContext('2d');g.clearRect(0,0,cv.width,cv.height);}
  }
  // 线索券目标：坏人模拟玩家中一条尚未拥有（clueKeys 未记）的未公开隐藏属性。
  function availableBadClue() {
    for(const p of players){
      if(!p.alive||p.role!=='bad'||p.id===self.id)continue;
      for(const key of Object.keys(traitNames))if(!p.traitPublic[key]&&!clueKeys.has(`${p.id}:${key}`))return {p,key};
    }
    return null;
  }
  // 轮回券：重新随机自己的公开颜色、隐藏属性与 S-ID，并重置公开状态（traitPublic / sidPublic 全 false）。
  function rebirthSelf() {
    const pick=arr=>arr[Math.floor(Math.random()*arr.length)];
    const randSeg=()=>String.fromCharCode(65+Math.floor(Math.random()*26))+Math.floor(Math.random()*10)+String.fromCharCode(65+Math.floor(Math.random()*26));
    self.colors=Object.fromEntries(Object.entries(palettes).map(([k,options])=>[k,pick(options)]));
    self.traits={saying:pick(['先喝口水','马上就好','有点意思','稳住别慌','让我想想']),food:pick(['番茄面','饺子','咖喱饭','火锅','三明治']),sport:pick(['羽毛球','游泳','骑行','篮球','跑步'])};
    self.sid=[randSeg(),randSeg(),randSeg()];
    self.traitPublic={saying:false,food:false,sport:false};
    self.sidPublic=[false,false,false];
    renderPublic();
    if(selected()===self)renderTarget();
    if(myHeld)renderMine();
  }
  // 结算一件转盘物品：筹码加量 / 线索券 / 洗心革面券 / 轮回券。返回结果文案。
  function applyWheelItem(item) {
    if(!item)return '无结果。';
    if(item.kind==='chips'){chips+=item.amount;return `${item.label||'筹码'}：+${item.amount} 筹码。`;}
    if(item.kind==='special'){
      if(item.key==='clue'){
        const cand=availableBadClue();
        if(cand){const clue=receiveClue(cand,'转盘·线索券');return `${item.label}：${clue.text}`;}
        chips+=2;return `${item.label}：当前没有可用的坏人线索，补偿 2 筹码。`;
      }
      if(item.key==='reform'){
        if(self.role==='bad'){self.role='good';self.hp=1;renderPublic();if(selected()===self)renderTarget();if(myHeld)renderMine();return `${item.label}：你已由坏人转换为好人。`;}
        return `${item.label}：你当前已是好人，无需转换。`;
      }
      if(item.key==='rebirth'){rebirthSelf();return `${item.label}：公开颜色、隐藏属性与 S-ID 已重新随机，公开状态已重置。`;}
      return `${item.label}：无效果。`;
    }
    return '未识别的转盘物品。';
  }
  function settleWheelSpin() {
    if(wheelRAF){cancelAnimationFrame(wheelRAF);wheelRAF=0;}
    if(!wheel||!wheel.lastItem||wheel.lastIndex<0)return;
    const item=wheel.lastItem;
    wheel.spinning=false;wheel.lastItem=null;
    const text=applyWheelItem(item);
    if($('wheel-result'))$('wheel-result').textContent=`第 ${wheelSpins} 次 · ${item.label||item.key||'物品'}：${text}`;
    updateWheelUI();updateExplorationHUD();checkFinish();
  }
  function startWheelSpin(delta) {
    wheel.spinning=true;
    const from=wheel.angle,to=wheel.angle+delta,t0=performance.now(),dur=1200;
    const tick=now=>{
      const t=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-t,3); // 缓出，落点对准 idx 格中心
      wheel.angle=from+delta*e;drawWheel(wheel.angle);
      if(t<1)wheelRAF=requestAnimationFrame(tick);
      else{wheel.angle=to;wheelRAF=0;settleWheelSpin();}
    };
    wheelRAF=requestAnimationFrame(tick);
    if($('wheel-spin')){$('wheel-spin').disabled=true;$('wheel-spin').textContent='转动中…';}
  }
  // instant=true 时跳过动画直接结算（供 __sidTest 连续调用）。
  function spinWheelLocal(instant) {
    if(!wheel||finished||!self.alive)return null;
    if(wheel.spinning){if(!instant)return null;settleWheelSpin();}
    const cost=WORLD.wheelSpinCost(wheelSpins);
    if(chips<cost){
      if($('wheel-result'))$('wheel-result').textContent=`筹码不足：本次转动需要 ${cost} 筹码，当前 ${chips}，未扣除。`;
      return {ok:false,item:null,slotIndex:-1,slots:wheel.slots,cost,spins:wheelSpins,chips,score:self.score};
    }
    chips-=cost;
    const pool=WORLD.buildWheelPool(self.role);
    const idx=Math.floor(Math.random()*pool.length);
    const item=pool[idx];
    wheel.slots=pool;wheel.lastItem=item;wheel.lastIndex=idx;
    wheelSpins+=1;
    const seg=Math.PI*2/pool.length;
    const targetMod=((-(idx+.5)*seg)%(Math.PI*2)+Math.PI*2)%(Math.PI*2);
    const curMod=((wheel.angle%(Math.PI*2))+Math.PI*2)%(Math.PI*2);
    const delta=((targetMod-curMod)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)+Math.PI*2*5;
    if(instant){wheel.angle+=delta;drawWheel(wheel.angle);settleWheelSpin();}
    else{startWheelSpin(delta);if($('wheel-result'))$('wheel-result').textContent='转动中…';}
    updateWheelUI();updateExplorationHUD();
    return {ok:true,item,slotIndex:idx,slots:pool,cost,spins:wheelSpins,chips,score:self.score};
  }
  // ---------- 分数 / 结束判定 / 排行榜 ----------
  // 模拟玩家没有真实行为分数：用「筹码 + 由 id 派生的确定性伪随机（xorshift 固定种子）」生成稳定本地分数，
  // 同一 id 每次结果一致，保证排名可见且稳定；自己使用真实累计 score。
  function simScore(p) {
    if(p.id===self.id)return self.score;
    let h=(p.id*2654435761)>>>0;
    h^=h<<13;h>>>=0;h^=h>>>17;h^=h<<5;h>>>=0;
    return (p.chips||0)+(h%40);
  }
  function addScore(n){self.score+=n;}
  function buildRanking() {
    return players.map(p=>({id:p.id,name:p.name,score:simScore(p),alive:p.alive,role:p.role}))
      .sort((a,b)=>b.score-a.score||a.id-b.id);
  }
  const FINISH_REASON_TEXT={aliveFloor:'存活人数已淘汰至剩余 100 人',badWiped:'坏人全灭',timeUp:'时间到（2 小时）'};
  // 仅三种结束方式；aliveFloor 仅在总人数 > endRemainingPlayers 时判定（20 人本地局永不触发）。
  function checkFinish() {
    if(finished)return;
    const aliveCount=players.filter(p=>p.alive).length;
    const aliveBad=players.filter(p=>p.alive&&p.role==='bad').length;
    let reason=null;
    if(players.length>WORLD.RULES.endRemainingPlayers&&aliveCount<=WORLD.RULES.endRemainingPlayers)reason='aliveFloor';
    else if(hadBad&&aliveBad===0)reason='badWiped';
    else if(clock-startedAt>=WORLD.RULES.timeLimitMs/1000)reason='timeUp';
    if(!reason)return;
    finished=true;finishReason=reason;
    ranking=reason==='aliveFloor'?null:buildRanking();
    onFinish();
  }
  function onFinish() {
    closeExploration();closeGames();closeWheel();clearPrivate(true);
    selectedId=null;renderTarget();renderRoster();
    showFinish();
    const rk=$('ranking');if(rk&&!rk.hidden)renderRanking();
  }
  function showFinish() {
    const ov=$('finish-overlay');if(!ov)return;
    if($('finish-reason'))$('finish-reason').textContent=FINISH_REASON_TEXT[finishReason]||'本局结束';
    const host=$('finish-ranking');if(host){
      host.replaceChildren();
      if(finishReason==='aliveFloor'){
        const alive=players.filter(p=>p.alive);
        const note=document.createElement('p');note.className='panel-note';
        note.textContent=`存活者 ${alive.length} 人（此结束方式不按分数排名，仅展示存活者）。`;
        host.append(note);
        const ol=document.createElement('ol');ol.className='ranking-items';
        ol.innerHTML=alive.map(p=>`<li class="ranking-row"><strong>${escapeText(p.name)}</strong>${p.id===self.id?'<span class="self-label">自己</span>':''}<span class="ranking-score">存活</span></li>`).join('');
        host.append(ol);
      }else{
        const list=ranking||buildRanking();
        const note=document.createElement('p');note.className='panel-note';note.textContent='按分数降序排名。';
        host.append(note);
        const ol=document.createElement('ol');ol.className='ranking-items';
        ol.innerHTML=list.map((r,i)=>`<li class="ranking-row"><span class="ranking-rank">${i+1}</span><strong>${escapeText(r.name)}</strong>${r.id===self.id?'<span class="self-label">自己</span>':''}<span class="ranking-score">${r.score}</span><span class="ranking-role">${r.role==='bad'?'坏人':'好人'}</span>${!r.alive?'<span class="out-label">淘汰</span>':''}</li>`).join('');
        host.append(ol);
      }
    }
    ov.hidden=false;
  }
  // 排行榜面板：只建一次 DOM，之后仅更新值槽（#ranking-rules / #ranking-items）。
  function buildRankingPanel() {
    const host=$('ranking');if(!host)return;
    if(!host.childElementCount){
      host.innerHTML='<div class="panel-heading"><div><small>LEADERBOARD</small><h2>排行榜</h2></div><button id="ranking-close" class="icon-button" aria-label="关闭排行榜">×</button></div><p id="ranking-rules" class="panel-note"></p><ol id="ranking-items" class="ranking-items"></ol>';
      $('ranking-close').onclick=()=>{host.hidden=true;$('ranking-toggle').setAttribute('aria-expanded','false');};
    }
    renderRanking();
  }
  function renderRanking() {
    const host=$('ranking');if(!host||!$('ranking-items'))return;
    const aliveCount=players.filter(p=>p.alive).length;
    const badAlive=players.filter(p=>p.alive&&p.role==='bad').length;
    const remain=Math.max(0,Math.round(WORLD.RULES.timeLimitMs/1000-(clock-startedAt)));
    const mm=String(Math.floor(remain/60)).padStart(2,'0'),ss=String(remain%60).padStart(2,'0');
    if($('ranking-rules'))$('ranking-rules').textContent=`结束条件：存活淘汰至剩余 ${WORLD.RULES.endRemainingPlayers} 人（当前存活 ${aliveCount}） · 距时间到 ${mm}:${ss} · ${hadBad?`坏人${badAlive===0?'已全灭':'尚未全灭'}`:'本局无坏人'}。`;
    const list=finished&&ranking?ranking:buildRanking();
    $('ranking-items').innerHTML=list.map((r,i)=>`<li class="ranking-row"><span class="ranking-rank">${i+1}</span><strong>${escapeText(r.name)}</strong>${r.id===self.id?'<span class="self-label">自己</span>':''}<span class="ranking-score">${r.score}</span>${finished&&r.role?`<span class="ranking-role">${r.role==='bad'?'坏人':'好人'}</span>`:''}${!r.alive?'<span class="out-label">淘汰</span>':''}</li>`).join('');
  }
  // 三档交互描边：ready（存活 + 64 像素内 + 动作可用）/ blocked（在范围内但动作不可用）/ idle（太远）。
  function outlineState(kind,entity) {
    if(WORLD.distanceToEntity(self,entity)>WORLD.INTERACT_RANGE)return 'idle';
    if(!self.alive)return 'blocked';
    return (kind==='container'?!searched.has(`${self.id}:${entity.id}`):chips>=entity.cost)?'ready':'blocked';
  }
  function drawInteractOutline(kind,entity) {
    const state=outlineState(kind,entity),ready=kind==='container'?'#7fe3ff':'#ffd76a';
    let color=ready,alpha,lw;
    if(state==='ready'){alpha=.5+.38*Math.sin(clock*4.4);lw=2;}
    else if(state==='blocked'){color='#8b93a6';alpha=.55;lw=1.5;}
    else {alpha=.14;lw=1;}
    const b=kind==='container'?{x:entity.x,y:entity.y,w:entity.w,h:entity.h}:{x:entity.x-21,y:entity.y-53,w:42,h:61};
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,alpha));ctx.strokeStyle=color;ctx.lineWidth=lw;
    ctx.strokeRect(Math.round(b.x)+.5,Math.round(b.y)+.5,b.w,b.h);ctx.restore();
  }
  // 猜拳目标：同层、附近存活模拟玩家中最近、64 像素内且 lineClear 无遮挡的一位。
  function rpsTargets() {
    return players.filter(p=>p.alive&&p.id!==self.id&&p.floorId===floorId)
      .map(p=>({p,d:WORLD.distanceToEntity(self,p)}))
      .filter(({p,d})=>d<=WORLD.INTERACT_RANGE&&WORLD.lineClear(self,p,occluders))
      .sort((a,b)=>a.d-b.d).map(({p})=>p);
  }
  function nearestRpsTarget(){return rpsTargets()[0]||null;}
  function runRps(choice,targetId) {
    const stake=WORLD.PLAY_CONFIG.rpsStake;
    if(choice&&RPS_ZH[choice])rpsChoice=choice;
    const fail=result=>({ok:false,result,delta:0,chips,opponentChips:null});
    const wait=left(rpsUntil);
    if(finished)return rpsResult='本局已结束，无法发起猜拳。',fail(rpsResult);
    if(!self.alive)return rpsResult='自己已淘汰，无法发起猜拳。',fail(rpsResult);
    if(wait>0)return rpsResult=`猜拳冷却中，剩余 ${wait} 秒。`,fail(rpsResult);
    if(chips<stake)return rpsResult=`筹码不足：发起猜拳需要至少 ${stake} 筹码，未扣除。`,fail(rpsResult);
    const target=targetId!=null?players[targetId]:nearestRpsTarget();
    if(!target||!target.alive||target.id===self.id)return rpsResult='附近没有符合条件（64 像素内、无遮挡）的对手。',fail(rpsResult);
    if(WORLD.distanceToEntity(self,target)>WORLD.INTERACT_RANGE||!WORLD.lineClear(self,target,occluders))return rpsResult='目标不在互动范围内或中间有遮挡，无法发起。',fail(rpsResult);
    if((target.chips??0)<stake)return rpsResult=`${target.name} 筹码不足（需至少 ${stake}），未扣除。`,fail(rpsResult);
    const theirs=['rock','paper','scissors'][Math.floor(Math.random()*3)];
    const outcome=WORLD.rpsOutcome(rpsChoice,theirs),delta=outcome*stake;
    chips+=delta;target.chips-=delta;rpsUntil=clock+WORLD.PLAY_CONFIG.rpsCooldownMs/1000;
    addScore(outcome>0?WORLD.SCORE.rpsWin:outcome<0?WORLD.SCORE.rpsLose:WORLD.SCORE.rpsDraw);
    rpsResult=`你出${RPS_ZH[rpsChoice]}，${target.name}出${RPS_ZH[theirs]}：${outcome>0?'你赢':outcome<0?'你输':'平局'}，你${delta>0?'+':''}${delta}（对手${-delta>0?'+':''}${-delta}）。你剩余 ${chips}，对手剩余 ${target.chips}。`;
    return {ok:true,result:rpsResult,delta,chips,opponentChips:target.chips};
  }
  // J 互动：只造成眩晕/僵直，无伤害、不改 hp、不淘汰、不写公共日志副作用。
  function attackTarget() {
    const cos=WORLD.PLAY_CONFIG.attackConeCos,range=WORLD.PLAY_CONFIG.attackRange;
    let best=null,bd=Infinity;
    for(const p of players){
      if(!p.alive||p.id===self.id||p.floorId!==floorId)continue; // J 只命中当前楼层
      const dx=p.x-self.x,dy=p.y-self.y,d=Math.hypot(dx,dy);
      if(d>range||d===0)continue;
      if((dx*facing.x+dy*facing.y)/d<cos)continue;
      if(!WORLD.lineClear(self,p,occluders)||WORLD.coverFor(p,occluders))continue;
      if(d<bd){bd=d;best=p;}
    }
    return best;
  }
  function doAttack() {
    const cd=WORLD.PLAY_CONFIG.attackCooldownMs,wait=left(attackUntil);
    if(finished)return combatText='本局已结束，无法使用互动。',{ok:false,hitId:null,resultText:combatText,cooldownMs:0};
    if(!self.alive)return combatText='已淘汰，无法使用互动。',{ok:false,hitId:null,resultText:combatText,cooldownMs:0};
    if(wait>0)return combatText=`互动冷却中，剩余 ${wait} 秒。`,{ok:false,hitId:null,resultText:combatText,cooldownMs:wait*1000};
    attackUntil=clock+cd/1000;swingUntil=clock+WORLD.ATTACK_ANIMATION_MS/1000; // 空挥也进入冷却
    swingDirection=WORLD.spriteDirection(facing.x,facing.y,self.spriteFacing);
    const target=attackTarget();
    if(!target)return combatText=`互动空挥，未命中目标，进入${cd/1000}秒冷却。`,{ok:false,hitId:null,resultText:combatText,cooldownMs:cd};
    const stunMs=WORLD.PLAY_CONFIG.stunMs,freezeMs=WORLD.PLAY_CONFIG.freezeMs;
    target.stunUntil=clock*1000+stunMs;target.freezeUntil=clock*1000+freezeMs;
    addScore(WORLD.SCORE.interactHit);
    combatText=`互动命中 ${target.name}：眩晕 ${stunMs/1000} 秒、僵直 ${freezeMs/1000} 秒（无伤害、不淘汰）。`;
    return {ok:true,hitId:target.id,resultText:combatText,cooldownMs:cd};
  }
  function updateAttackUI() {
    const wait=left(attackUntil),btn=$('attack-button');
    if(btn){btn.disabled=finished||!self.alive||wait>0;btn.textContent=wait>0?`J · 互动（${wait}s）`:'J · 互动';}
    const el=$('combat-status');
    if(el)el.textContent=wait>0?`${combatText?combatText+' · ':''}互动冷却 ${wait}s`:combatText;
  }
  // 互动小游戏面板：打开时只建一次 DOM，之后逐帧只更新稳定值槽。
  function buildGames() {
    const host=$('games');if(!host)return;
    const stake=WORLD.PLAY_CONFIG.rpsStake,cd=Math.round(WORLD.PLAY_CONFIG.rpsCooldownMs/1000);
    host.innerHTML=`<div class="panel-heading"><div><small>LOCAL MINI GAMES</small><h2>互动小游戏</h2></div><button id="games-close" class="icon-button" aria-label="关闭互动小游戏">×</button></div><p class="exploration-balance">我的筹码：<strong id="games-chips">0</strong></p><p class="panel-note">猜拳：与附近的存活角色对决，双方各需至少 ${stake} 筹码；胜者 +${stake}、败者 -${stake}、平局不变，任何人的筹码都不会变成负数。结算后 ${cd} 秒冷却。对手需在 64 像素内且中间无遮挡。</p><div class="games-choices" role="group" aria-label="选择出拳"><button class="games-choice" data-choice="rock">石头</button><button class="games-choice" data-choice="paper">布</button><button class="games-choice" data-choice="scissors">剪刀</button></div><p id="games-opponent" class="games-opponent"></p><button id="games-rps" class="games-launch">向最近的角色发起猜拳</button><p id="games-result" class="games-result" aria-live="polite"></p><p class="panel-note">大转盘在 NPC 沟通面板内：靠近 NPC 按 E 打开，再点「打开大转盘」。</p>`;
    $('games-close').onclick=closeGames;
    host.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{rpsChoice=b.dataset.choice;syncGamesChoices();});
    $('games-rps').onclick=()=>{runRps(rpsChoice);updateGames();};
    gamesBuilt=true;syncGamesChoices();
  }
  function syncGamesChoices() {
    const host=$('games');if(!host)return;
    host.querySelectorAll('[data-choice]').forEach(b=>{const on=b.dataset.choice===rpsChoice;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});
  }
  function openGames() {
    if(finished)return;
    if(!gamesBuilt||!$('games').childElementCount)buildGames();
    closeWheel();
    $('games').hidden=false;$('games-toggle').setAttribute('aria-expanded','true');
    syncGamesChoices();updateGames();
  }
  function closeGames() {
    const host=$('games');if(!host)return;
    host.hidden=true;$('games-toggle')?.setAttribute('aria-expanded','false');
    host.replaceChildren();gamesBuilt=false;
  }
  function updateGames() {
    const host=$('games');if(!host||host.hidden||!gamesBuilt)return;
    const stake=WORLD.PLAY_CONFIG.rpsStake,target=nearestRpsTarget(),wait=left(rpsUntil);
    if($('games-chips'))$('games-chips').textContent=chips;
    const opp=$('games-opponent');
    if(opp)opp.textContent=!self.alive?'已淘汰，无法发起猜拳。':!target?'附近没有符合条件（64 像素内、无遮挡）的对手。':`对手：${target.name} · 距离 ${Math.round(WORLD.distanceToEntity(self,target))} · 对手筹码 ${target.chips}`;
    const btn=$('games-rps');
    if(btn){btn.disabled=!self.alive||!target||chips<stake||wait>0;btn.textContent=wait>0?`向最近的角色发起猜拳（冷却 ${wait}s）`:'向最近的角色发起猜拳';}
    if($('games-result'))$('games-result').textContent=rpsResult;
  }
  function renderExploration() {
    if(!exploration)return;
    const {kind,entityId}=exploration,entity=explorationEntity(kind,entityId);
    if(!self.alive||kind!=='backpack'&&!withinReach(entity)){closeExploration();return;}
    const host=$('exploration');host.hidden=false;
    $('clue-bag').setAttribute('aria-expanded',String(kind==='backpack'));
    const heading=kind==='backpack'?'线索背包':kind==='container'?entity.container.name:entity.name;
    const already=kind==='container'&&searched.has(`${self.id}:${entity.id}`);
    const content=kind==='backpack'
      ? `<p class="panel-note">仅自己可见 · ${clues.length} 条真实线索 · 同一玩家同一属性不重复。</p><div class="clue-list">${clues.length?clues.map(c=>`<article class="clue-card"><strong>${escapeText(c.targetName)} · ${escapeText(c.label)}</strong><p>${escapeText(c.text)}</p><small>来源：${escapeText(c.source)}</small></article>`).join(''):'<p class="panel-note">背包为空。搜寻柜子、茶几，或向 NPC 兑换线索。</p>'}</div>`
      : kind==='container'
      ? `<p class="search-state">${already?'已搜寻 · 不可重复搜寻':'未搜寻 · 每人限搜一次'}</p><p class="panel-note">${['cabinet','table'].includes(entity.type)?'搜寻获得其他存活玩家的一条未公开真实属性线索；没有新线索时改为 2 筹码。':`搜寻获得 ${entity.type==='reception'?3:2} 筹码。`}</p><button id="exploration-action" ${already?'disabled':''}>搜寻容器</button>`
      : `<p class="npc-dialogue">${escapeText(entity.dialogue)}</p><p class="panel-note">NPC · 每次 ${entity.cost} 筹码兑换一条未拥有的其他存活玩家真实私密线索。无余额或无线索不扣筹码。</p><button id="exploration-action">确认支付 ${entity.cost} 筹码兑换线索</button><div class="wheel-block"><p class="wheel-title">大转盘</p><p class="panel-note">可重复转动 · 首次免费，之后按次数阶梯收费 · 每次 10 格物品</p><button id="exploration-wheel" ${!self.alive||!withinReach(entity)?'disabled':''}>打开大转盘</button><p id="exploration-wheel-state" class="panel-note">${wheelStateText()}</p></div>`;
    host.innerHTML=`<div class="panel-heading"><div><small>PRIVATE EXPLORATION</small><h2>${escapeText(heading)}</h2></div><button id="exploration-close" class="icon-button" aria-label="关闭私密探索">×</button></div><p class="exploration-balance">我的筹码：<strong>${chips}</strong></p>${content}${explorationResult?`<p class="private-result">${escapeText(explorationResult)}</p>`:''}<p class="hold-note">私密内容 · 关闭、Esc、切出页面或选择玩家立即销毁显示内容，不回滚奖励。</p>`;
    $('exploration-close').onclick=closeExploration;
    if($('exploration-action'))$('exploration-action').onclick=()=>interact(kind==='container'?'search':'exchange',entityId);
    if($('exploration-wheel'))$('exploration-wheel').onclick=()=>openWheel(entityId);
  }
  let nearbySignature='';
  function updateExplorationHUD() {
    if($('score-value'))$('score-value').textContent=self.score;
    $('cover-status').textContent=WORLD.coverFor(self,occluders)?'身体已遮挡':'无遮挡';
    const nearby=nearbyEntities();
    const signature=JSON.stringify([self.alive,chips,nearby.map(({kind,entity})=>[kind,entity.id,searched.has(`${self.id}:${entity.id}`)])]);
    if(signature!==nearbySignature){
      nearbySignature=signature;
      $('nearby-items').replaceChildren();
      $('chip-count').textContent=chips;
      $('clue-bag').disabled=!self.alive;
      $('nearby-empty').hidden=nearby.length>0;
      $('nearby-empty').textContent=self.alive?'靠近容器或 NPC，按 E 互动':'已淘汰，无法探索';
      for(const {kind,entity} of nearby){
        const button=document.createElement('button');
        button.textContent=kind==='container'?`${entity.container.name} · ${searched.has(`${self.id}:${entity.id}`)?'已搜寻':'未搜寻'}`:`${entity.name} · NPC / ${entity.cost} 筹码`;
        button.onclick=()=>openExploration(kind,entity.id);$('nearby-items').append(button);
      }
    }
    if(exploration&&( !self.alive||exploration.kind!=='backpack'&&!withinReach(explorationEntity(exploration.kind,exploration.entityId))))closeExploration();
  }
  $('clue-bag').onclick=()=>{if(exploration?.kind==='backpack')closeExploration();else openExploration('backpack');};
  $('games-toggle').onclick=()=>{if($('games').hidden)openGames();else closeGames();};
  $('attack-button').onclick=e=>{doAttack();updateAttackUI();e.currentTarget.blur();};
  // 大转盘 / 排行榜 / 结算覆盖层：转盘可重复转动；排行榜面板只建一次，之后只更新值槽。
  $('wheel-close').onclick=()=>closeWheel();
  $('wheel-spin').onclick=()=>{spinWheelLocal(false);};
  $('finish-close').onclick=()=>{const ov=$('finish-overlay');if(ov)ov.hidden=true;};
  $('ranking-toggle').onclick=()=>{
    const h=$('ranking');if(!h)return;
    if(h.hidden){closeWheel();buildRankingPanel();h.hidden=false;$('ranking-toggle').setAttribute('aria-expanded','true');}
    else{h.hidden=true;$('ranking-toggle').setAttribute('aria-expanded','false');}
  };
  function toggle(panel,button) {const visible=$(panel).hidden;if(visible)closeWheel();$(panel).hidden=!visible;$(button).setAttribute('aria-expanded',String(visible));}
  $('roster-toggle').onclick=()=>toggle('roster','roster-toggle');$('roster-close').onclick=()=>toggle('roster','roster-toggle');
  $('log-toggle').onclick=()=>toggle('logs','log-toggle');$('log-close').onclick=()=>toggle('logs','log-toggle');
  $('bad-toggle').onclick=()=>{toggle('bad-slots','bad-toggle');$('bad-toggle-label').textContent=$('bad-slots').hidden?'展开 ＋':'收起 −';};
  $('search').oninput=renderRoster;
  $('my-info').addEventListener('pointerdown',e=>{if(e.button!==0)return;myHeld=true;renderMine();});
  document.addEventListener('pointerup',()=>{if(!myKey){myHeld=false;renderMine();}},true);
  document.addEventListener('pointercancel',clearAllInput,true);
  const isTyping=()=>/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
  const isControl=()=>/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(document.activeElement?.tagName)||document.activeElement?.isContentEditable;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      if(closeElevatorPicker()){e.preventDefault();return;} // 电梯选层面板可被 Esc 取消（未提交任何请求）
      if(dismissFloorNotice()){e.preventDefault();return;} // 电梯 10 秒静态提示可被 Esc 关闭
      clearAllInput();$('candidates').hidden=true;$('candidates').replaceChildren();return;
    }
    if(document.activeElement===$('my-info')&&(e.code==='Space'||e.code==='Enter')){
      e.preventDefault();if(!e.repeat){myKey=e.code;myHeld=true;renderMine();}return;
    }
    if(isTyping())return;
    // 电梯选层面板打开时：忽略移动 / E / J（先选楼层或 Esc 取消），数字键直达对应楼层。
    if(elevatorPicker){
      if(/^[1-7]$/.test(e.key)){
        e.preventDefault();
        const f=Number(e.key);
        if(f!==floorId){const pid=elevatorPicker.portalId;closeElevatorPicker();requestFloorChange(pid,f);}
      }else e.preventDefault();
      return;
    }
    // 电梯过渡进行中：忽略移动 / E / J，避免在换层中途驱动旧层或重复发起。
    if(floorState!=='IDLE_SOURCE'&&floorState!=='IDLE_TARGET')return;
    if(e.code==='KeyJ'){
      if(e.repeat||myHeld||isControl())return;
      e.preventDefault();doAttack();updateAttackUI();return;
    }
    if(e.code==='KeyE'){
      e.preventDefault();if(e.repeat)return;
      if(exploration)closeExploration();
      else {
        // 面向电梯门（cos≥0.5）时 E 优先乘梯（弹选层面板），不被附近容器/NPC 抢走。
        const lift=elevatorTarget();
        if(lift){
          if(lift.access.allowed)openElevatorPicker(lift.portal.id);
          else showToast(lift.access.reason);
        } else {
          const near=nearbyEntities()[0];
          if(near)openExploration(near.kind,near.entity.id);
          else showToast('请靠近角色、容器/NPC 或电梯门（64 像素以内）');
        }
      }
      return;
    }
    if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowLeft','ArrowDown','ArrowRight'].includes(e.code)){
      e.preventDefault();keys.add(e.code);
    }
  });
  document.addEventListener('keyup',e=>{
    keys.delete(e.code);
    if(e.code===myKey){myKey=null;myHeld=false;renderMine();}
  });
  window.addEventListener('blur',clearAllInput);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearAllInput();});
  document.addEventListener('focusin',()=>{if(isTyping())keys.clear();});
  window.addEventListener('resize',()=>resizeCanvas());
  window.addEventListener('orientationchange',()=>resizeCanvas());
  if(window.ResizeObserver){try{new ResizeObserver(()=>resizeCanvas()).observe($('map-view'));}catch{}}
  // 家具尺度常量（阶段2-2a，§1.6 / §3 C0-2）：必须早于 bakeSprites 初始化（const 不提升）。
  const FURN_FACE={desk:24,table:24,counter:30,cabinet:58,reception:34,sofa:26,plant:19,treadmill:42,rack:35,mat:2,seat:30,stage:13,wall:7};
  const FURN_PAD={default:{padX:16,padUp:64,padDown:32},plant:{padX:26,padUp:44,padDown:12},sofa:{padX:16,padUp:12,padDown:12},mat:{padX:16,padUp:8,padDown:8},stage:{padX:16,padUp:20,padDown:16},wall:{padX:4,padUp:4,padDown:4}};
  const furnitureFace=type=>(FURN_FACE[type]==null?24:FURN_FACE[type]);
  const furniturePad=type=>FURN_PAD[type]||FURN_PAD.default;
  const cellC=(x,w,i,N)=>x+w*(i+0.5)/N;
  // 家具 sprite 预烘焙所有楼层（换层无需重烘焙，保证目标层首帧即就绪）。
  function bakeSprites(){
    furnitureSprites.clear();
    for(const key of Object.keys(WORLD.FLOORS)){
      for(const f of WORLD.FLOORS[key].furniture){
        // 阶段2-2a：per-type 烘焙 padding；画布 (w+2padX)×(h+padUp+padDown)，偏移 (-padX,-padUp)。
        const pad=furniturePad(f.type);
        const c=document.createElement('canvas');c.width=f.w+pad.padX*2;c.height=f.h+pad.padUp+pad.padDown;
        const g=c.getContext('2d');g.imageSmoothingEnabled=false;
        const dx=pad.padX-f.x,dy=pad.padUp-f.y;
        const local={
          ...f,x:pad.padX,y:pad.padUp,
          ...(f.blocks?{blocks:f.blocks.map(b=>({...b,x:b.x+dx,y:b.y+dy}))}:{}),
          ...(f.footprint?{footprint:{...f.footprint,x:f.footprint.x+dx,y:f.footprint.y+dy}}:{})
        };
        drawFurniture(local,g);furnitureSprites.set(f.id,c);
      }
    }
  }
  bakeSprites();
  if(SCENE)SCENE.ready.then(()=>{chunkCache.clear();chunkTotal=0;bakeSprites();draw();});
  function collides(x,y) {return WORLD.floorCollides(floorId,x,y,WORLD.floorBlockers(floorId,glassDoorStates));}
  function step(dt) {
    dt=Math.max(0,Math.min(.05,dt));clock+=dt;
    glassDoorStates=WORLD.advanceGlassDoors(floorId,glassDoorStates,players,clock*1000);
    occluders=WORLD.floorBlockers(floorId,glassDoorStates);
    if(self.alive&&!finished&&!isTyping()&&(floorState==='IDLE_SOURCE'||floorState==='IDLE_TARGET')){
      let dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      let dy=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
      const len=Math.hypot(dx,dy),ox=self.x,oy=self.y,fl=WORLD.floorById(floorId);
      if(len){facing={x:dx/len,y:dy/len};dx=dx/len*SPEED*dt;dy=dy/len*SPEED*dt;
        const bounds=WORLD.floorBounds(floorId);
        const nx=Math.max(bounds.minX,Math.min(bounds.maxX,self.x+dx));if(!collides(nx,self.y))self.x=nx;
        const ny=Math.max(bounds.minY,Math.min(bounds.maxY,self.y+dy));if(!collides(self.x,ny))self.y=ny;
      }
      // 行走相位按实际位移累积：撞墙时不播放迈步，只保留待机呼吸。
      const actualDx=self.x-ox,actualDy=self.y-oy,moved=Math.hypot(actualDx,actualDy);
      self.walk+=moved;self.moving=moved>0.02;
      if(moved>1e-6)self.spriteFacing=WORLD.spriteDirection(actualDx,actualDy,self.spriteFacing);
    }else self.moving=false;
    // 相机：世界某轴小于视口时该轴居中（cam 可为负），否则夹在楼面内。
    const cam=WORLD.floorById(floorId);
    cameraX=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).x;
    cameraY=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).y;
  }
  // ---------- 电梯过渡（本地 DEMO 版）：同样的状态机与失败分支 ----------
  // IDLE_SOURCE → PREPARING → SUBMITTING → TARGET_READY → OPENING → IDLE_TARGET；失败 FAILED_SOURCE / UNCONFIRMED。
  // DEMO 离线运行：裁决在本地即时完成（等价服务端权威），但仍保留“准备→提交→确认→开门”的顺序与门帘。
  const reduceMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function floorArrowText(from,to){return `${from}F → ${to}F`;}
  function showFloorOverlay(arrow,phase,detail){
    const overlay=$('floor-transition');if(!overlay)return;
    overlay.hidden=false;
    $('floor-arrow').textContent=arrow||'';$('floor-phase').textContent=phase||'';$('floor-detail').textContent=detail||'';
  }
  function floorDoorsClosed(closed){const overlay=$('floor-transition');if(overlay)overlay.classList.toggle('closed',!!closed);}
  function floorNoticeMode(on){
    const overlay=$('floor-transition');if(!overlay)return;
    overlay.classList.toggle('notice',!!on);
    const btn=$('floor-transition-close');if(btn)btn.hidden=!on;
    if(on){clearTimeout(floorStageTimer);clearTimeout(floorNoticeTimer);}
  }
  function closeFloorOverlay(){
    const overlay=$('floor-transition');if(!overlay)return;
    clearTimeout(floorStageTimer);clearTimeout(floorNoticeTimer);
    overlay.hidden=true;overlay.classList.remove('closed','notice');
    const btn=$('floor-transition-close');if(btn)btn.hidden=true;
  }
  function floorSlowStage(){if(floorState!=='PREPARING'&&floorState!=='SUBMITTING')return;const d=$('floor-detail');if(d)d.textContent='已等待 2 秒仍未收到确认 · 换层仍在进行，请勿重复操作';}
  function floorCurtainMax(){
    if(floorState!=='PREPARING'&&floorState!=='SUBMITTING'&&floorState!=='UNCONFIRMED')return;
    floorNoticeMode(true);const d=$('floor-detail');if(!d)return;
    d.textContent=floorState==='UNCONFIRMED'?'换层结果仍未确认 · 可关闭此提示继续观察；不会本地换层':'确认已超过 10 秒 · 可关闭此提示；换层请求不会重复发送';
  }
  function dismissFloorNotice(){
    const overlay=$('floor-transition');if(!overlay||overlay.hidden||!overlay.classList.contains('notice'))return false;
    overlay.hidden=true;overlay.classList.remove('notice');
    const btn=$('floor-transition-close');if(btn)btn.hidden=true;return true;
  }
  // 整层原子切换：楼层、家具/墙/NPC/入口/碰撞、点击标签、相机同时对应新层；朝向 spriteFacing 保留；
  // 不给无敌/眩晕/僵直，也不重置或消耗 J 冷却。
  function adoptFloor(id){
    loadFloorLocal(id);
    nearbySignature='';
    clearPrivate(true);closeExploration();closeGames();closeWheel();closeElevatorPicker();
    candidates=[];$('candidates').hidden=true;$('candidates').replaceChildren();selectedId=null;
    renderTarget();renderRoster();
    const fl=WORLD.floorById(id);
    cameraX=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).x;
    cameraY=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).y;
    draw();
  }
  // 电梯选层面板：进门（E / 点击门）→ 弹出 1–7 楼层按钮（当前层禁选）→ 选定后发起换层。
  // DEMO 与联机版同一交互模型；Esc / × / 数字键直达均可用。
  function closeElevatorPicker(){
    if(!elevatorPicker)return false;
    elevatorPicker=null;
    const overlay=$('elevator-picker');if(overlay)overlay.hidden=true;
    return true;
  }
  function openElevatorPicker(portalId){
    if(floorState!=='IDLE_SOURCE'&&floorState!=='IDLE_TARGET')return;
    if(finished||!self.alive)return;
    if(clock<self.stunUntil/1000||clock<self.freezeUntil/1000){showToast('眩晕/僵直中，暂时无法乘梯');return;}
    const portal=portals.find(p=>p.id===portalId);
    if(!portal)return;
    const access=WORLD.portalAccess(self,portal);
    if(!access.inReach){showToast(access.reason||'距离电梯太远，请靠近后再按 E');return;}
    if(!access.facingOk){showToast(access.reason||'请面向电梯门后再按 E');return;}
    closeExploration();closeGames();closeWheel();closeElevatorPicker();
    elevatorPicker={portalId};
    const box=$('elevator-floors');box.replaceChildren();
    for(const fl of WORLD.floorOptions()){
      const f=fl.id,btn=document.createElement('button');
      btn.type='button';btn.className='elevator-floor-btn';btn.dataset.floorId=String(f);
      btn.setAttribute('aria-label',`${fl.label} ${fl.name} ${f===floorId?'当前楼层':'目标楼层'}`);
      if(f===floorId){btn.disabled=true;btn.title='当前楼层';btn.innerHTML=`<span>${f}F</span><small>当前楼层</small>`;}
      else{
        btn.innerHTML=`<span>${f}F</span><small>${fl?(fl.name||'').replace(/^\d+F\s*·?\s*/,''):''}</small>`;
        btn.onclick=()=>{const pid=elevatorPicker?elevatorPicker.portalId:portalId;closeElevatorPicker();requestFloorChange(pid,f);};
      }
      box.append(btn);
    }
    const title=$('elevator-picker-title');
    if(title)title.textContent=`请选择楼层（当前 ${floorId}F）`;
    $('elevator-picker').hidden=false;
  }
  function requestFloorChange(portalId,targetFloorId){
    if(floorState!=='IDLE_SOURCE'&&floorState!=='IDLE_TARGET')return;
    if(finished||!self.alive)return;
    if(clock<self.stunUntil/1000||clock<self.freezeUntil/1000){showToast('眩晕/僵直中，暂时无法乘梯');return;}
    const portal=portals.find(p=>p.id===portalId);
    if(!portal)return;
    // 电梯无方向：目标层 1–7 任选（除当前层）。
    const target=Number(targetFloorId);
    if(!Number.isSafeInteger(target)||target<1||target>WORLD.FLOOR_COUNT){showToast('目标楼层无效（1–7）');return;}
    if(target===floorId){showToast('已在本层，请选择其它楼层');return;}
    if(WORLD.distanceToEntity(self,{x:portal.x,y:portal.y})>WORLD.INTERACT_RANGE){showToast('距离入口太远，请靠近后再试（64 像素以内）');return;}
    const access=WORLD.portalAccess(self,portal);if(!access.allowed){showToast(access.reason);return;}
    if(!WORLD.elevatorLanding(target,portal.side)){showToast('目标层电梯门口暂无安全落点，换层已取消');return;}
    keys.clear();
    clearPrivate(true);closeExploration();closeGames();closeWheel();closeElevatorPicker();
    candidates=[];$('candidates').hidden=true;$('candidates').replaceChildren();selectedId=null;renderTarget();renderRoster();
    floorFlight={portalId,fromFloorId:floorId,targetFloorId:target,side:portal.side,submitted:false};
    floorState='PREPARING';
    showFloorOverlay(floorArrowText(floorId,target),'正在准备目标楼层…','保留当前画面 · 准备目标楼层资源');
    floorDoorsClosed(true);
    floorStartedAt=performance.now();
    floorStageTimer=setTimeout(floorSlowStage,2000);
    floorNoticeTimer=setTimeout(floorCurtainMax,10000);
    submitFloorChange();
  }
  function submitFloorChange(){
    const flight=floorFlight;
    if(!flight||flight.submitted||floorState!=='PREPARING')return;
    flight.submitted=true;floorState='SUBMITTING';
    if(!$('floor-transition').hidden)$('floor-phase').textContent='正在确认（本地权威）…';
    Promise.resolve().then(()=>{
      if(floorFlight!==flight)return;
      if(flight.targetFloorId<1||flight.targetFloorId>WORLD.FLOOR_COUNT){floorRejected(flight,'目标楼层不存在');return;}
      const landing=WORLD.elevatorLanding(flight.targetFloorId,flight.side);
      if(!landing){floorRejected(flight,'目标层电梯门口暂无安全落点，换层已取消');return;}
      floorArrived(flight,landing);
    });
  }
  function floorArrived(flight,landing){
    self.x=landing.x;self.y=landing.y;
    self.floorId=flight.targetFloorId;
    floorState='TARGET_READY';adoptFloor(flight.targetFloorId);
    showFloorOverlay(floorArrowText(flight.fromFloorId,flight.targetFloorId),`已到达 ${floorName}`,'正在开门 · 即将恢复操作');
    floorState='OPENING';floorDoorsClosed(false);
    const delay=reduceMotion()?0:320;
    setTimeout(()=>{if(floorState!=='OPENING')return;floorState='IDLE_TARGET';floorFlight=null;closeFloorOverlay();renderPublic();},delay);
  }
  function floorRejected(flight,message){
    floorState='FAILED_SOURCE';floorDoorsClosed(false);
    showFloorOverlay(`${flight.fromFloorId}F`,'换层未成功',`${message}（仍在当前楼层）`);
    floorNoticeMode(true);showToast(message);
    const delay=reduceMotion()?0:320;
    setTimeout(()=>{if(floorState!=='FAILED_SOURCE')return;floorState='IDLE_SOURCE';floorFlight=null;closeFloorOverlay();},delay);
  }
  // 需求2：电梯门候选 = 进入 64px 且面向门（spriteFacing cos≥0.5）的**最近** portal。
  // 唯一归属 = 最近门（不因另一扇可用就改投）⇒ 站在禁用门前的反馈稳定、不会被悄悄换方向。
  function elevatorTarget(){
    if(finished||!self.alive)return null;
    let best=null,bd=Infinity,bestAccess=null;
    for(const portal of portals){
      const access=WORLD.portalAccess(self,portal);
      if(!access.inReach||!access.facingOk)continue;
      const d=WORLD.distanceToEntity(self,{x:portal.x,y:portal.y});
      if(d<bd){best=portal;bd=d;bestAccess=access;}
    }
    return best?{portal:best,access:bestAccess}:null;
  }
  // 像素绘制基元：末尾的 g 参数让同一套画法既能画到主画布，也能烘焙进离屏背景。
  function rect(x,y,w,h,color,g=ctx){g.fillStyle=color;g.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
  function line(x1,y1,x2,y2,color,g=ctx){g.strokeStyle=color;g.beginPath();g.moveTo(Math.round(x1)+.5,Math.round(y1));g.lineTo(Math.round(x2)+.5,Math.round(y2));g.stroke();}
  // 圆角像素块：名牌、面板类元素用它收掉直角，观感更整。
  function roundPx(x,y,w,h,fill,g=ctx){g.fillStyle=fill;g.fillRect(x+2,y,w-4,h);g.fillRect(x+1,y+1,w-2,h-2);g.fillRect(x,y+2,w,h-4);}
  // 加色暖光：只在烘焙阶段使用，营造顶灯与窗光的氛围。
  function glow(g,cx,cy,r,alpha){
    g.save();g.globalCompositeOperation='lighter';g.globalAlpha=Math.max(0,Math.min(1,alpha));
    g.drawImage(glowSprite,cx-r,cy-r,r*2,r*2);g.restore();
  }
  function diamond(g,cx,cy,r,c){for(let i=0;i<r;i++){const wd=(i+1)*2;rect(cx-i-1,cy-r+i,wd,1,c,g);rect(cx-i-1,cy+r-i,wd,1,c,g);}rect(cx-r,cy,2*r,1,c,g);}
  // 叶片、坐垫这类柔和形状用递减横条堆出圆角，避免生硬矩形。
  function blob(g,x,y,w,h,c){const hh=Math.max(2,Math.round(h));for(let i=0;i<hh;i++){const k=Math.sin((i/(hh-1))*Math.PI);const ww=Math.max(1,Math.round(w*(0.35+0.65*k)));rect(Math.round(x+(w-ww)/2),Math.round(y+i),ww,1,c,g);}}
  // 家具三层绘制（阶段2-2a，美术规格 §3 C-0）：立面 / 顶面 / 立式部件，子件按 w/h/facePx 比例。
  // rect = 平面投影；立面占 rect 下沿起 facePx（柜类可越过 y，故需 padUp）；顶面 = 立面之上的可见上表面。
  // （FURN_FACE / FURN_PAD / furnitureFace / furniturePad / cellC 见文件上方「家具尺度常量」段，需先于 bakeSprites 初始化。）
  function furnShadow(g,x,y,w,h,facePx){
    g.globalAlpha=.2;
    rect(x+w*.06,y+h-facePx*.20,w*.88,Math.max(4,facePx*.38),'#120c14',g);
    rect(x+w*.03,y+h-facePx*.10,w*.94,Math.max(3,facePx*.20),'#120c14',g);
    g.globalAlpha=1;
  }
  function drawFurnitureFace(f,g,x,y,w,facePx){
    const {h,type}=f,b=y+h,dp=h*.28*(facePx/24);
    if(type==='plant'){
      const px=x+w*.28,pw=w*.44,py=y+h*.52,ph=h*.46;
      rect(px,py,pw,ph,'#8a4f33',g);rect(px+1,py,pw-2,Math.max(2,ph*.14),'#b0714a',g);
      rect(px,py+ph*.14,pw,ph*.74,'#7a452c',g);rect(px+pw*.12,py+ph*.86,pw*.76,Math.max(2,ph*.16),'#5f3623',g);
      return;
    }
    if(type==='sofa'){
      rect(x+w*.02,y+facePx*1.05,w*.96,h-facePx*1.05,'#415f63',g);rect(x+w*.02,y+facePx*1.05,w*.96,3,'#6b9095',g);
      rect(x+w*.02,b-4,w*.96,3,'#25393c',g);
      rect(x+w*.05,y+facePx*1.2,w*.16,h-facePx*1.5,'#55797d',g);rect(x+w*.79,y+facePx*1.2,w*.16,h-facePx*1.5,'#55797d',g);
      const lw=Math.max(4,w*.05);
      rect(x+w*.06,b-facePx*.16,lw,facePx*.16,'#4a3524',g);rect(x+w*.88,b-facePx*.16,lw,facePx*.16,'#4a3524',g);
      return;
    }
    if(type==='cabinet'){
      const bd=Math.max(2,w*.02);
      rect(x,y,w,h,'#4e3c2c',g);rect(x+bd,y+bd,w-2*bd,h-2*bd,'#6b543c',g);
      rect(x+bd,y+bd,w-2*bd,3,'#8a6e52',g);rect(x+bd,b-3-bd,w-2*bd,3,'#3d2f22',g);
      rect(x+w/2-1,y+bd*2,2,h-bd*4,'#3d2f22',g);
      const dh=h*.34,dy=y+h*.18;
      rect(x+w*.06,dy,w*.40,dh,'#7a6247',g);rect(x+w*.06,dy,w*.40,2,'#93744a',g);
      rect(x+w*.54,dy,w*.40,dh,'#7a6247',g);rect(x+w*.54,dy,w*.40,2,'#93744a',g);
      const hw=Math.max(2,w*.015);
      rect(x+w*.30,y+h*.46,hw,h*.20,'#c8a86a',g);rect(x+w*.68,y+h*.46,hw,h*.20,'#c8a86a',g);
      return;
    }
    if(type==='desk'){
      rect(x+w*.07,b-dp,w*.05,dp,'#4a3524',g);rect(x+w*.88,b-dp,w*.05,dp,'#4a3524',g);
      rect(x+w*.06,b-dp*1.35,w*.88,dp*1.35,'#5a4231',g);rect(x+w*.06,b-dp*1.35,w*.88,3,'#8a6a48',g);
      rect(x+w*.86,b-dp*1.2,w*.11,dp*.86,'#6b5238',g);rect(x+w*.87,b-dp*1.08,w*.09,2,'#8f7050',g);rect(x+w*.89,b-dp*.86,w*.05,2,'#c8a86a',g);
      rect(x+w*.12,b-dp*1.1,w*.58,dp*.62,'#523c2d',g);rect(x+w*.12,b-dp*1.1,w*.58,1,'#634b38',g);
      return;
    }
    if(type==='counter'){
      rect(x+w*.03,y+facePx*.78,w*.94,h-facePx*.78,'#48524f',g);rect(x+w*.03,y+facePx*.78,w*.94,3,'#5f6b66',g);
      rect(x+w*.03,b-Math.max(3,facePx*.16),w*.94,Math.max(3,facePx*.16),'#2f3937',g);
      const N=4;
      for(let i=1;i<N;i++){const px=x+w*i/N,cw=w/N-w*.04;
        rect(px,y+facePx*.9,1,h-facePx*.95,'#333d3b',g);
        rect(px+w*.02,y+facePx,cw,h-facePx*1.35,'#525d59',g);
        rect(px+w*.02,y+facePx,cw,1,'#606c67',g);
        rect(px+w*.02,b-facePx*.32,cw,2,'#3c4644',g);}
      return;
    }
    if(type==='table'){
      rect(x+w*.08,y+h*.38,w*.05,h*.58,'#4a3524',g);rect(x+w*.87,y+h*.38,w*.05,h*.58,'#4a3524',g);
      return;
    }
    if(type==='reception'){
      rect(x+w*.03,y+h*.5,w*.94,h*.5,'#5a4231',g);rect(x+w*.03,y+h*.5,w*.94,3,'#8a6a48',g);
      rect(x+w*.03,b-4,w*.94,4,'#3f2f22',g);
      for(let i=1;i<3;i++)rect(x+w*i/3,y+h*.56,1,h*.4,'#46341f',g);
      return;
    }
    if(type==='stage'){rect(x,b-facePx,w,facePx,'#8a6a48',g);rect(x,b-facePx,w,2,'#a5825b',g);rect(x,b-Math.max(2,facePx*.34),w,Math.max(2,facePx*.34),'#3f2f22',g);return;}
    if(type==='rack'){rect(x+w*.22,b-4,Math.max(3,w*.05),4,'#3a2820',g);rect(x+w*.73,b-4,Math.max(3,w*.05),4,'#3a2820',g);return;}
    if(type==='seat'){const cw=Math.max(10,Math.min(16,w*.24)),ch=Math.max(5,h*.34);
      blob(g,x+w/2-cw/2,y+h-ch*1.6,cw,ch,'#a4665c');rect(x+w/2-cw*.66,y+h-ch*1.6-2,cw*1.32,2,'#2b1a14',g);return;}
    if(type==='mat')return;
    rect(x,y,w,h,'#5a4231',g);rect(x,y,w,3,'#8a6a48',g);rect(x,b-4,w,4,'#3f2f22',g);
    const lw=Math.max(4,w*.05);
    rect(x+w*.05,b,lw,facePx*.2,'#4a3524',g);rect(x+w*.9,b,lw,facePx*.2,'#4a3524',g);
  }
  function drawFurnitureTop(f,g,x,y,w,planPx){
    const {h,type}=f,facePx=furnitureFace(type),topH=Math.max(4,h-facePx),slab=Math.max(5,Math.min(topH,facePx*.6));
    if(type==='plant'){
      rect(x+w*.49,y+h*.26,Math.max(3,w*.08),h*.3,'#3f7a52',g);
      blob(g,x+w*.02,y+h*.04,w*.5,h*.46,'#3f7a52',g);blob(g,x+w*.46,y+h*.0,w*.46,h*.48,'#4a8a5d',g);
      blob(g,x+w*.14,y+h*.24,w*.4,h*.34,'#2f6242',g);blob(g,x+w*.44,y+h*.26,w*.44,h*.32,'#58996a',g);
      rect(x+w*.12,y+h*.1,w*.14,2,'#7fbb8c',g);rect(x+w*.6,y+h*.06,w*.12,2,'#7fbb8c',g);
      return;
    }
    if(type==='sofa'){
      rect(x+w*.03,y,w*.94,topH*.6,'#4b6b70',g);rect(x+w*.03,y,w*.94,3,'#62868b',g);rect(x+w*.03,y+topH*.52,w*.94,3,'#2c4549',g);
      const cw=(w-w*.18)/2;
      rect(x+w*.09,y+topH*.6,cw,Math.max(3,h-topH*.95),'#4b6d71',g);rect(x+w*.09,y+topH*.6,cw,2,'#62868b',g);
      rect(x+w*.55,y+topH*.6,cw,Math.max(3,h-topH*.95),'#4b6d71',g);rect(x+w*.55,y+topH*.6,cw,2,'#62868b',g);
      rect(x+w/2-1,y+topH*.6,2,Math.max(3,h-topH),'#2c4549',g);
      rect(x+w*.15,y+topH*.6,w*.14,topH*.34,'#a4665c',g);rect(x+w*.15,y+topH*.6,w*.14,2,'#c4837a',g);
      return;
    }
    if(type==='cabinet'){rect(x,y,w,Math.max(3,topH),'#6b543c',g);rect(x,y,w,2,'#8a6e52',g);return;}
    if(type==='desk'){
      rect(x-w*.02,y,w*1.04,Math.max(5,topH),'#7d5c3f',g);rect(x-w*.02,y,w*1.04,3,'#a5825b',g);rect(x-w*.02,y+Math.max(5,topH)-3,w*1.04,3,'#543f2d',g);
      rect(x+w*.11,y+topH*.3,w*.3,Math.max(3,topH*.5),'#4a5058',g);rect(x+w*.12,y+topH*.34,w*.28,1,'#6a7078',g);
      rect(x+w*.6,y+topH*.3,w*.28,Math.max(3,topH*.5),'#d5cfbe',g);rect(x+w*.61,y+topH*.34,w*.26,1,'#8f8a7e',g);
      rect(x+w*.8,y+topH*.2,w*.13,topH*.75,'#e6dfcd',g);rect(x+w*.81,y+topH*.26,w*.11,1,'#b9b3a2',g);
      rect(x+w*.9,y+topH*.16,w*.05,topH*.5,'#c96f4e',g);rect(x+w*.9,y+topH*.16,w*.05,2,'#e08a6a',g);
      return;
    }
    if(type==='counter'){
      rect(x-w*.015,y,w*1.03,slab,'#cfc7bb',g);rect(x-w*.015,y,w*1.03,3,'#e8e2d6',g);rect(x-w*.015,y+slab-3,w*1.03,3,'#9a9184',g);
      const N=Math.max(2,Math.round(w/(facePx*4)));
      for(let i=0;i<N;i++){const cx=cellC(x,w,i,N),cw=w/N*.22;
        rect(cx-cw/2,y+slab*.18,cw,slab*.6,'#dfe6e6',g);rect(cx-cw/2,y+slab*.18,cw,2,'#f2f7f7',g);rect(cx-cw/2,y+slab*.66,cw,2,'#9aa4a4',g);}
      return;
    }
    if(type==='table'){
      rect(x-w*.015,y,w*1.03,slab,'#7d5c3f',g);rect(x-w*.015,y,w*1.03,3,'#a5825b',g);rect(x-w*.015,y+slab-3,w*1.03,3,'#543f2d',g);
      rect(x+w*.05,y+slab*.2,w*.28,Math.max(3,slab*.5),'#4a5058',g);
      const px=x+w*.42,pw=w*.3;
      rect(px,y+slab*.2,pw,Math.max(3,slab*.6),'#e6dfcd',g);rect(px+2,y+slab*.32,pw-4,1,'#b9b3a2',g);
      rect(x+w*.8,y+slab*.16,w*.1,Math.max(3,slab*.66),'#d9814f',g);rect(x+w*.8,y+slab*.16,w*.1,2,'#e8a173',g);
      return;
    }
    if(type==='reception'){
      rect(x-w*.015,y,w*1.03,slab,'#cfc7bb',g);rect(x-w*.015,y,w*1.03,3,'#e8e2d6',g);rect(x-w*.015,y+slab-3,w*1.03,3,'#9a9184',g);
      rect(x+w*.04,y+slab*.3,w*.5,Math.max(2,slab*.4),'#4a5058',g);rect(x+w*.6,y+slab*.2,w*.2,Math.max(3,slab*.6),'#c8a86a',g);
      return;
    }
    if(type==='treadmill'){const mw=w*.75,mh=Math.max(6,h*.29),mx=x+(w-mw)/2,my=y+h*.34;
      rect(mx,my,mw,mh,'#39414a',g);rect(mx,my,mw,1,'#54606b',g);
      const bw=mw*.1,gp=mw*.07;rect(mx+mw*.16,my+1,bw,mh-2,'#2b2f38',g);rect(mx+mw*.16+bw+gp,my+1,bw,mh-2,'#182f38',g);return;}
    if(type==='rack'){const rw=w*.5,rh=Math.max(5,h*.26),rx=x+(w-rw)/2,ry=y+h*.3;
      rect(rx,ry,rw,rh,'#4a3528',g);rect(rx,ry,rw,1,'#6b4f36',g);
      for(let L=0;L<3;L++){const by=ry+rh*(L+.5)/3;rect(rx,by,rw,2,'#8d929a',g);
        for(let d=0;d<5;d++){const dx=rx+rw*(d+.5)/5-3;rect(dx,by-1,6,3,((d+L)%2)?'#39414a':'#8d929a',g);}}return;}
    if(type==='mat'){const n=Math.max(1,Math.round(w/48)),mw=Math.min(48,w/n),mh=Math.min(h*.84,26.7);
      const mx0=x+(w-n*mw)/2,my=y+(h-mh)/2;
      for(let i=0;i<n;i++){const mx=mx0+i*mw;
        rect(mx+2,my,mw-4,mh,'#4b6b70',g);rect(mx,my+2,mw,mh-4,'#4b6b70',g);
        rect(mx+2,my,mw-4,2,'#62868b',g);rect(mx+2,my+mh-2,mw-4,2,'#62868b',g);
        rect(mx,my+2,2,mh-4,'#62868b',g);rect(mx+mw-2,my+2,2,mh-4,'#62868b',g);
        rect(mx+mw/2-.5,my+2,1,mh-4,'#2c4549',g);}return;}
    if(type==='stage'){const th=Math.max(3,h-facePx);
      rect(x,y,w,th,'#8a6a48',g);rect(x,y,w,2,'#a5825b',g);
      for(let gx=32;gx<w-4;gx+=32)rect(x+gx,y,1,th,'#7d5c3f',g);return;}
    rect(x,y,w,Math.max(3,topH),'#8a6a48',g);
  }
  function drawFurnitureUpright(f,g,x,y,w){
    const {h,type}=f;
    if(type==='desk'){
      const mw=w*.16,mh=mw*.62,mx=x+w*.3;
      rect(mx-2,y-mh-2,mw+4,mh+4,'#2b2f38',g);rect(mx,y-mh,mw,mh,'#182f38',g);rect(mx,y-mh,mw,2,'#0d1e25',g);
      rect(mx+mw*.06,y-mh+mh*.16,mw*.88,3,'#63c7c4',g);rect(mx+mw*.06,y-mh+mh*.38,mw*.6,2,'#4f9d9c',g);rect(mx+mw*.06,y-mh+mh*.58,mw*.74,2,'#4f9d9c',g);
      rect(mx+mw*.34,y-mh*.28,mw*.12,mh*.28,'#39414a',g);rect(mx+mw*.16,y-4,mw*.5,4,'#4a5058',g);
      return;
    }
    if(type==='cabinet'){
      rect(x+w*.07,y-12,w*.19,12,'#8a5a4a',g);rect(x+w*.09,y-10,w*.15,2,'#a97262',g);
      rect(x+w*.3,y-10,w*.14,10,'#4f6b74',g);rect(x+w*.3,y-10,w*.14,2,'#64868f',g);
      rect(x+w*.48,y-8,w*.1,8,'#6b7f5c',g);rect(x+w*.48,y-8,w*.1,2,'#87a078',g);
      return;
    }
    if(type==='counter'){
      const rw=w*.12,rh=rw*.85;
      rect(x+w*.04,y-rh-4,rw,rh+4,'#39414a',g);rect(x+w*.05,y-rh-2,rw*.9,rh*.28,'#1e2a30',g);rect(x+w*.07,y-rh+rh*.3,rw*.25,3,'#d9814f',g);rect(x+w*.05,y-rh*.5,rw*.9,4,'#2b323a',g);
      const mw=w*.07,mh=mw;
      rect(x+w*.26,y-mh-6,mw,mh+6,'#8d929a',g);rect(x+w*.27,y-mh-4,mw*.85,3,'#a9aeb6',g);rect(x+w*.26+mw*.5,y-mh-11,mw*.12,6,'#5f646b',g);
      return;
    }
    if(type==='table'){
      const mw=w*.12,mh=mw*.6,mx=x+w*.12;
      rect(mx,y-mh-2,mw,mh+2,'#39414a',g);rect(mx+2,y-mh,mw-4,mh*.74,'#182f38',g);rect(mx+4,y-mh+mh*.18,mw*.55,2,'#63c7c4',g);
      return;
    }
    if(type==='reception'){
      const mw=w*.2,mh=mw*.62,mx=x+w*.1;
      rect(mx,y-mh-2,mw,mh+2,'#2b2f38',g);rect(mx+2,y-mh,mw-4,mh*.78,'#182f38',g);rect(mx+4,y-mh+mh*.2,mw*.7,3,'#63c7c4',g);
      rect(x+w*.78,y-20,w*.1,20,'#3f7a52',g);rect(x+w*.74,y-28,w*.17,8,'#c96f4e',g);rect(x+w*.8,y-24,w*.05,5,'#e08a6a',g);
      return;
    }
    if(type==='treadmill'){const cw=Math.max(14,w*.31),ch=Math.max(14,h*.68),mx=x+(w-cw)/2,my=y+h*.34;
      rect(mx,my-ch,cw,ch,'#2b2f38',g);rect(mx+2,my-ch+2,cw-4,ch*.55,'#182f38',g);
      rect(mx+3,my-ch+4,cw*.5,2,'#63c7c4',g);rect(mx+3,my-ch+8,cw*.36,2,'#4f9d9c',g);
      rect(mx+cw/2-1,my-2,2,2,'#39414a',g);
      rect(x+w*.1,my-5,w*.09,2,'#8d929a',g);rect(x+w*.81,my-5,w*.09,2,'#8d929a',g);return;}
    if(type==='seat'){const n=Math.max(3,Math.round(w/22.4)),sw=Math.max(10,Math.min(16,w/n*.74));
      for(let i=0;i<n;i++){const sx=x+w*(i+.5)/n-sw/2;
        rect(sx,y+h*.1,sw,h*.72,'#8b4f47',g);rect(sx,y+h*.1,sw,3,'#c4837a',g);
        rect(sx-2,y+h*.52,2,Math.max(3,h*.24),'#2b1a14',g);rect(sx+sw,y+h*.52,2,Math.max(3,h*.24),'#2b1a14',g);}return;}
  }
  // §4 1F 食堂餐桌（六张『食堂餐桌一…六』）：规范组 80×24.7 在 rect 内居中，固定顺序
  // 接地阴影→远排椅→桌面→餐具→桌裙/桌腿→近排椅（不能套 Face→Top→Upright，否则远排椅盖桌面）。
  function drawDiningTable(f,g){
    const {x,y,w,h}=f;
    const sx=w/105.6,sy=h/36;
    const X=v=>x+v*sx,Y=v=>y+v*sy,W=v=>v*sx,H=v=>v*sy;
    const chair=(cx,cy,down)=>{const sw=W(15),sh=H(7),bh=H(12),sy0=cy-sh*.5;
      blob(g,cx,sy0,sw,sh,'#c96f4e');
      const by=down?sy0+sh:sy0-bh;
      rect(cx,by,sw,bh,'#b3613f',g);rect(cx,by,sw,Math.max(1,H(1)),'#e08a6a',g);
      rect(cx,sy0+sh-1,sw,1,'#2b1a14',g);};
    g.globalAlpha=.2;
    rect(X(6),Y(30),W(94),Math.max(4,H(6)),'#120c14',g);rect(X(3),Y(33),W(100),Math.max(3,H(3)),'#120c14',g);
    g.globalAlpha=1;
    for(let i=0;i<3;i++)chair(X(28+i*16),Y(10.5),false);
    const tx=X(28),ty=Y(12.4),tw=W(50),th=H(12),rad=Math.max(2,W(2));
    rect(tx+rad,ty,tw-2*rad,th,'#a5825b',g);rect(tx,ty+rad,tw,th-2*rad,'#a5825b',g);
    rect(tx,ty,tw,Math.max(2,H(2)),'#7d5c3f',g);
    rect(tx,ty+th-Math.max(2,H(3)),tw,Math.max(2,H(3)),'#c19a6b',g);
    for(let i=0;i<3;i++){const cx=X(30+i*16);
      for(const far of [true,false]){const ey=far?Y(13.4):Y(21);
        rect(cx,ey,W(6),H(4),(!far&&i===1)?'#d9814f':'#e6dfcd',g);
        rect(cx,ey,W(6),Math.max(1,H(1)),'#b9b3a2',g);
        rect(cx+W(7),ey-H(3),Math.max(1,W(1)),H(7),'#4a5058',g);
        rect(cx+W(9),ey-H(1),W(2),Math.max(2,H(3)),'#dfe6e6',g);}}
    rect(X(28),Y(18),W(50),Math.max(3,H(6)),'#543f2d',g);rect(X(28),Y(18),W(50),Math.max(1,H(1)),'#8a6a48',g);
    for(const lx of [30,43,60,73]){rect(X(lx),Y(24),Math.max(2,W(3)),Math.max(3,H(4)),'#4a3524',g);
      rect(X(lx),Y(24),Math.max(1,W(1)),Math.max(3,H(4)),'#6b4f36',g);}
    for(let i=0;i<3;i++)chair(X(28+i*16),Y(28.5),true);
  }
  // §5 2F 工位：同一套零件按 rect 循环铺单体（绝不把整条带画成一块桌面）。单元 51.2×plan23.3；
  // 行数=(rect深>=47)?2:1；双面岛=上排镜像+下排正常+中线屏风。
  function drawWorkstation(f,g){
    // 与碰撞同源（world.js deskIsland / deskBranch）：画什么撞什么
    const br=WORLD.deskBranch(f);
    if(br&&br!=='island'){
      const b=f.blocks[0],bx=b.x,by=b.y,bw=b.w,bh=b.h;
      const chairH=Math.max(4,Math.min(8,bh*.35)),deskH=Math.max(4,bh-chairH);
      rect(bx,by,bw,deskH,'#a5825b',g);
      for(let gx=4;gx<bw-2;gx+=8)rect(bx+gx,by+1,1,Math.max(2,deskH-2),'#96744e',g);
      rect(bx,by,bw,1,'#c4a072',g);rect(bx,by+deskH-1,bw,1,'#6b4f36',g);
      rect(bx-1,by-1,bw+2,1,'#241c14',g);rect(bx-1,by+bh-1,bw+2,1,'#241c14',g);
      rect(bx-1,by-1,1,bh+1,'#241c14',g);rect(bx+bw,by-1,1,bh+1,'#241c14',g);
      const mw=Math.max(8,Math.min(22,bw+6)),mx=bx+(bw-mw)/2;
      rect(mx,by-9,mw,10,'#2b2f38',g);rect(mx+1,by-8,mw-2,6,'#182f38',g);rect(mx+2,by-6,Math.max(3,mw*.5),1,'#63c7c4',g);
      const cw=Math.min(14,Math.max(8,bw)),cx=bx+(bw-cw)/2,cyt=by+deskH;
      rect(cx,cyt,cw,chairH,'#2b2f38',g);rect(cx,cyt,cw,1,'#e08a6a',g);
      rect(cx-1,cyt,1,chairH,'#2b1a14',g);rect(cx+cw,cyt,1,chairH,'#2b1a14',g);
      return;
    }
    const isl=WORLD.deskIsland(f);
    const PLAN=isl.plan,UW=isl.unitW,Nper=isl.C,rows=isl.rows,gap=isl.gap;
    const blockH=isl.islandH,totalW=isl.bw,ox=isl.ox,oy=isl.uy;
    g.globalAlpha=.18;rect(ox+2,oy+blockH-4,totalW-4,5,'#120c14',g);g.globalAlpha=1;
    const unit=(ux,uyPlan,mirror)=>{
      const Y=(v,hh)=>mirror?uyPlan+PLAN-v-hh:uyPlan+v;
      const dTopScreen=mirror?uyPlan+PLAN-12:uyPlan;
      rect(ux+14.5,dTopScreen-9,23,16,'#2b2f38',g);
      rect(ux+16,dTopScreen-7.5,20,13,'#182f38',g);
      rect(ux+16.5,dTopScreen-6,15,2,'#63c7c4',g);
      rect(ux+16.5,dTopScreen-3,11,1,'#4f9d9c',g);
      rect(ux+16.5,dTopScreen-.5,13,1,'#4f9d9c',g);
      rect(ux+24,dTopScreen+8,4,5,'#39414a',g);
      rect(ux+20,dTopScreen+9,11,3,'#39414a',g);
      // §5.3-A 达标色值：面 #a5825b / 远边 #c4a072 / 近边 #6b4f36 / 外描边 #241c14
      const tyTop=Y(0,12);
      rect(ux+2,tyTop,47,12,'#a5825b',g);
      for(let gx=4;gx<48;gx+=8)rect(ux+gx,tyTop+1,1,10,'#96744e',g);   // D3：仅竖向木纹
      rect(ux+2,Y(0,2),47,2,'#c4a072',g);
      rect(ux+2,Y(10,2),47,2,'#6b4f36',g);
      rect(ux+1,tyTop-1,49,1,'#241c14',g);rect(ux+1,tyTop+12,49,1,'#241c14',g);
      rect(ux+1,tyTop-1,1,14,'#241c14',g);rect(ux+49,tyTop-1,1,14,'#241c14',g);
      rect(ux+2,Y(12,5),47,5,'#6b543c',g);
      rect(ux+2,Y(12,1),47,1,'#8f7050',g);
      rect(ux+3,Y(12,5),14,5,'#523c2d',g);
      rect(ux+3,Y(14,1),14,1,'#634b38',g);
      rect(ux+4,Y(14,2),2,2,'#c8a86a',g);
      rect(ux+12,Y(7,3),24,3,'#4a5058',g);
      rect(ux+12,Y(8,1),24,1,'#6a7078',g);
      rect(ux+38,Y(6,3),4,3,'#c96f4e',g);
      rect(ux+38,Y(5,4),4,4,'#8d929a',g);
      // §5.3-B C3/C5：蓝黑椅背 + 顶沿暖橙 + 1px 描边（与青灰屏风靠色相分开）
      rect(ux+18,Y(19,6),14,6,'#39414a',g);
      rect(ux+18,Y(19,1),14,1,'#4a5058',g);
      const byTop=Y(25,9);
      rect(ux+18,byTop,14,9,'#2b2f38',g);
      rect(ux+18,byTop,14,1,'#e08a6a',g);
      rect(ux+17,byTop-1,16,1,'#2b1a14',g);rect(ux+17,byTop,1,9,'#2b1a14',g);rect(ux+32,byTop,1,9,'#2b1a14',g);
      rect(ux+17,Y(30,3),16,3,'#4a5058',g);
    };
    for(let r=0;r<rows;r++){
      const uyPlan=oy+r*(PLAN+gap);
      const mirror=rows===2&&r===0;
      for(let i=0;i<Nper;i++)unit(ox+i*UW,uyPlan,mirror);
    }
    if(rows===2){
      const seamY=oy+PLAN+gap/2;
      const dTop=seamY-11;
      rect(ox,dTop,totalW,11,'#4b6b70',g);
      rect(ox,dTop,totalW,2,'#62868b',g);
      for(let s=1;s<Nper;s++)rect(ox+s*UW,dTop+2,1,9,'#2c4549',g);   // §5.3-B C1：每 51.2px 一条缝
    }
  }
  function drawFurniture(f,g=ctx){
    const {x,y,w,h,type}=f;
    if(SCENE&&SCENE.furniture(g,f))return;
    if(type==='table'&&/^食堂餐桌/.test(f.label||'')){drawDiningTable(f,g);return;}
    if(WORLD.deskBranch(f)){drawWorkstation(f,g);return;}
    if(type==='cabinet'&&f.label==='后厨操作台'){const g2=Object.assign({},f,{type:'counter'}),FACE=30;
      furnShadow(g,x,y,w,h,FACE);drawFurnitureFace(g2,g,x,y,w,FACE);drawFurnitureTop(g2,g,x,y,w,h);drawFurnitureUpright(g2,g,x,y,w);return;}
    furnShadow(g,x,y,w,h,furnitureFace(type));
    drawFurnitureFace(f,g,x,y,w,furnitureFace(type));
    drawFurnitureTop(f,g,x,y,w,h);
    drawFurnitureUpright(f,g,x,y,w);
  }
  // ---------- 静态场景烘焙 ----------
  function drawWindow(g,x,y,w,h) {
    rect(x-5,y-5,w+10,h+11,'#4a3a30',g);rect(x-4,y-4,w+8,3,'#6b5545',g);
    const sky=g.createLinearGradient(0,y,0,y+h);
    sky.addColorStop(0,'#7fb2cf');sky.addColorStop(.45,'#f0c894');sky.addColorStop(1,'#e2945f');
    g.fillStyle=sky;g.fillRect(x,y,w,h);
    rect(x,y+h-20,26,20,'#8a6a63',g);rect(x+22,y+h-28,18,28,'#7a5a56',g);
    rect(x+38,y+h-16,22,16,'#8a6a63',g);rect(x+58,y+h-30,20,30,'#6f5049',g);
    rect(x+74,y+h-18,24,18,'#8a6a63',g);rect(x+96,y+h-24,18,24,'#7a5a56',g);
    rect(x+112,y+h-14,30,14,'#8a6a63',g);
    for(let i=0;i<9;i++)rect(x+6+i*14,y+h-13+(i*7)%9,2,2,'#ffe0a8',g);
    rect(x+w/2-1,y,2,h,'#5d4a3c',g);rect(x,y+h/2-1,w,2,'#5d4a3c',g);
    rect(x,y,w,1,'#ffffff66',g);
    rect(x-6,y+h+4,w+12,4,'#5b483d',g);rect(x-6,y+h+4,w+12,1,'#7d6552',g);
    glow(g,x+w/2,y+h+46,152,.15);
  }
  function drawFrame(g,x,y,w,h) {
    rect(x-1,y-1,w+2,h+2,'#3a2d24',g);rect(x,y,w,h,'#6b5545',g);rect(x,y,w,2,'#8d745e',g);
    rect(x+3,y+3,w-6,h-6,'#22323a',g);
    rect(x+5,y+h-15,w-10,9,'#4f7078',g);rect(x+6,y+6,7,7,'#c98a5e',g);rect(x+w-18,y+8,12,5,'#8a6f8f',g);
    rect(x+6,y+6,7,1,'#e0a87c',g);
  }
  function drawClock(g,x,y,s) {
    rect(x-2,y-2,s+4,s+4,'#6b5545',g);rect(x-1,y-1,s+2,s+2,'#8d745e',g);
    rect(x,y,s,s,'#e8dcc4',g);rect(x+1,y+1,s-2,1,'#fff6e0',g);rect(x,y+s-2,s,2,'#b9ad95',g);
    rect(x+s/2-1,y+3,2,s/2-4,'#3a2f28',g);rect(x+s/2+1,y+s/2-1,s/2-5,2,'#3a2f28',g);
    rect(x+s/2-1,y+s/2-1,2,2,'#a34a4a',g);
  }
  // 地毯用深青与沙发同色系，在暖木地板上形成一块安静的视觉落点。
  function drawRug(g,x,y,w,h) {
    rect(x-2,y-2,w+4,h+4,'#1f2f31',g);
    // 切角 + 两端流苏，读起来像地毯而不是一块地板
    rect(x,y+6,w,h-12,'#2b3f42',g);rect(x+6,y,w-12,h,'#2b3f42',g);
    rect(x+5,y+5,w-10,h-10,'#37504f',g);rect(x+9,y+9,w-18,h-18,'#3f5f5b',g);
    for(let i=0;i<h-40;i+=12){rect(x-3,y+18+i,3,7,'#6d5a44',g);rect(x+w,y+18+i,3,7,'#6d5a44',g);}
    rect(x+12,y+12,w-24,1,'#c39a5c',g);rect(x+12,y+h-13,w-24,1,'#c39a5c',g);
    rect(x+12,y+12,1,h-24,'#c39a5c',g);rect(x+w-13,y+12,1,h-24,'#c39a5c',g);
    rect(x+16,y+16,w-32,h-32,'#385450',g);
    for(let cx=x+58;cx<x+w-52;cx+=78)for(let cy=y+46;cy<y+h-48;cy+=56)diamond(g,cx,cy,13,'#4d7168');
    rect(x+16,y+16,w-32,1,'#456a63',g);
  }
  function drawSign(g,x,y,w,h,text) {
    rect(x-2,y-2,w+4,h+4,'#3a2e26',g);rect(x,y,w,h,'#6b5233',g);
    rect(x,y,w,2,'#93744a',g);rect(x,y+h-3,w,3,'#4d3a26',g);
    g.font='bold 13px -apple-system,"PingFang SC","Microsoft YaHei",sans-serif';
    g.textAlign='center';g.textBaseline='middle';
    g.fillStyle='#2a1f14';g.fillText(text,x+w/2,y+h/2+1);
    g.fillStyle='#f8ecd0';g.fillText(text,x+w/2,y+h/2);
  }
  function drawLamp(g,cx) {
    rect(cx-1,0,2,11,'#4a3c4c',g);
    rect(cx-11,11,22,3,'#6b5545',g);rect(cx-9,14,18,3,'#7d6552',g);rect(cx-6,17,12,2,'#8d745e',g);
    rect(cx-4,19,8,3,'#ffe0a8',g);
    glow(g,cx,21,46,.5);
  }
  // 背景改为固定 512×512 分块 + 楼面轮廓多边形裁剪（见 chunkFor / draw），不再逐层整图烘焙。
  // 电梯厅 —— 厅地坪 + 门框 + 金属双扇门 + 中缝 + 楼层指示 + 单个呼梯按钮。
  // 阶段3：电梯不分上下方向（进门弹选层），去掉方向箭头与双按钮；整体比例放大（门 64×30）。
  // 站在门前并面向门时叠呼吸描边与「E 选择楼层」提示。
  function drawElevatorHall(p,active,g=ctx){
    const cx=Math.round(p.x),cy=Math.round(p.y);
    const accent='#7fe3ff';
    const hw=32,hh=15,x0=cx-hw,y0=cy-hh;
    const metal='#8d929a',metalHi='#a9aeb6';
    g.save();
    rect(x0-7,y0-7,hw*2+14,hh*2+18,'#3a3f4a',g);
    rect(x0-7,y0-7,hw*2+14,1,'#6b7480',g);
    rect(x0-7,y0+hh*2+10,hw*2+14,1,'#242a33',g);
    rect(x0-2,y0-2,hw*2+4,hh*2+4,'#39414a',g);
    rect(x0,y0,hw-1,hh*2,metal,g);
    rect(x0+hw+1,y0,hw-1,hh*2,metal,g);
    rect(cx-1,y0,2,hh*2,'#2b323a',g);
    rect(x0,y0,hw-1,3,metalHi,g);
    rect(x0+hw+1,y0,hw-1,3,metalHi,g);
    for(let i=0;i<2;i++){
      rect(x0+6+i*10,y0+8,6,2,'#767c85',g);
      rect(x0+hw+7+i*10,y0+8,6,2,'#767c85',g);
    }
    rect(cx-13,y0-13,26,9,'#1a1f26',g);
    rect(cx-13,y0-13,26,1,'#2f3640',g);
    g.font='7px ui-monospace,SFMono-Regular,monospace';g.textAlign='center';g.textBaseline='middle';
    g.fillStyle=accent;
    g.fillText(`${p.floorId}F`,cx,y0-8.5);
    rect(x0+hw*2+5,cy-4,6,8,'#39414a',g);
    rect(x0+hw*2+6,cy-3,4,6,'#7fe3ff',g);
    if(active){
      g.globalAlpha=.5+.35*Math.sin(clock*4);g.strokeStyle=accent;g.lineWidth=2;
      g.strokeRect(x0-6,y0-6,hw*2+12,hh*2+14);
      g.globalAlpha=1;g.lineWidth=1;
      const label='E 选择楼层';
      g.font='10px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      const tw=Math.round(g.measureText(label).width)+12,lx=cx-tw/2,ly=y0-32;
      g.fillStyle='rgba(8,11,18,.88)';g.fillRect(lx,ly,tw,16);
      g.strokeStyle=accent;g.lineWidth=1;
      g.strokeRect(lx+.5,ly+.5,tw-1,15);
      g.fillStyle='#eaf4ff';
      g.textAlign='center';g.textBaseline='middle';
      g.fillText(label,cx,ly+8.5);
    }
    g.restore();
  }
  // 角色：统一描边 + 三层明暗 + 五官 + 发型 + 行走摆动。
  // 命中框（x±21, y-53~y+8）与名牌偏移保持不变，外观升级不影响任何交互判定。
  function sprite(p) {
    const x=Math.round(p.x),ph=p.walk*.13;
    const bob=p.moving?-Math.round(Math.abs(Math.sin(ph))*2):Math.round(Math.sin(clock*1.5+(p.spriteIndex??p.id)*1.9)*.7);
    const yb=Math.round(p.y)+bob,a=p.alive?1:.4;
    const attackAge=p.id===self.id&&!p.npc&&clock<swingUntil ? Math.max(0,WORLD.ATTACK_ANIMATION_MS-(swingUntil-clock)*1000) : null;
    WORLD.drawCharacterBody(ctx,p,clock,attackAge,swingDirection);
    // 眩晕/僵直视觉：头顶星形 + 冰蓝覆盖 + 剩余秒数（自己同样支持，虽然 Demo 自己不会被命中）。
    const stunLeft=Math.max(0,(p.stunUntil||0)/1000-clock),freezeLeft=Math.max(0,(p.freezeUntil||0)/1000-clock);
    if(stunLeft>0||freezeLeft>0){
      const sa=p.alive?1:.4,off=Math.round(Math.sin(clock*9)*2),star=stunLeft>0?'#ffe08a':'#bfe8ff';
      if(freezeLeft>0){ctx.globalAlpha=.42*sa;rect(x-11,yb-52,22,61,'#8fd0ff');}
      ctx.globalAlpha=sa;
      rect(x-1,yb-66+off,3,9,star);rect(x-4,yb-63+off,9,3,star);
      ctx.font='10px ui-monospace,monospace';ctx.textAlign='center';ctx.fillStyle='#f4f8ff';
      ctx.fillText([stunLeft>0?`眩晕 ${stunLeft.toFixed(1)}s`:'',freezeLeft>0?`僵直 ${freezeLeft.toFixed(1)}s`:''].filter(Boolean).join(' · '),x,yb-70+off);
      ctx.globalAlpha=1;
    }
    // 遮挡对所有角色生效（含自己）：被遮挡时不画脚下圆环与选中框，解除后同一帧恢复。
    const covered = !!WORLD.coverFor(p,occluders);
    if(!p.npc&&!covered&&p.id===self.id&&p.id!==selectedId){
      ctx.globalAlpha=.8*a;ctx.strokeStyle='#7cc4ff';ctx.lineWidth=1;
      ctx.beginPath();ctx.ellipse(x,p.y+5,13,4,0,0,Math.PI*2);ctx.stroke();
      const off=Math.round(Math.sin(clock*2.6)*1.5);
      rect(x-3,yb-60+off,6,3,'#9ed4ff');rect(x-2,yb-57+off,4,2,'#9ed4ff');
      ctx.globalAlpha=1;ctx.lineWidth=1;
    }
    if(!p.npc&&!covered&&p.id===selectedId){
      ctx.globalAlpha=(.55+.3*Math.sin(clock*4.2))*a;
      ctx.strokeStyle='#8fd0ff';ctx.lineWidth=2;ctx.strokeRect(x-20.5,yb-52.5,41,58);
      ctx.globalAlpha=a;ctx.lineWidth=1;
      const b='#cfeeff';
      rect(x-21,yb-53,9,2,b);rect(x-21,yb-53,2,7,b);
      rect(x+13,yb-53,8,2,b);rect(x+19,yb-53,2,7,b);
      rect(x-21,yb+3,9,2,b);rect(x-21,yb-2,2,7,b);
      rect(x+13,yb+3,8,2,b);rect(x+19,yb-2,2,7,b);
      const off=Math.round(Math.sin(clock*3.4)*2);
      rect(x-4,yb-61+off,8,3,'#8fd0ff');rect(x-3,yb-59+off,6,2,'#8fd0ff');rect(x-2,yb-57+off,4,2,'#8fd0ff');
      ctx.globalAlpha=1;
    }
  }
  let labels=[];
  function makeLabels() {
    // Labels stay rigidly attached to each character, including at world/viewport edges.
    // Overlap is resolved during selection, never by moving a label or merging identities.
    // 任何被 coverFor 判定遮挡的角色（含自己）都不生成名牌，解除遮挡同一帧恢复。名牌只覆盖当前楼层。
    const visible=p=>p.alive&&p.x>=drawCamX-40&&p.x<=drawCamX+viewW+40&&p.y>=drawCamY-30&&p.y<=drawCamY+viewH+30&&!WORLD.coverFor(p,occluders);
    labels=players.filter(visible).map(publicProjection)
      .map(p=>({x:p.x-72,y:p.y+12,w:144,h:31,ids:[p.id],p}));
    labels.push(...npcs.filter(visible).map(p=>({x:p.x-72,y:p.y+12,w:144,h:31,ids:[],p,npc:true})));
  }
  function drawWallPanel(f){
    rect(f.x,f.y,f.w,f.h,'#5b4a3c');rect(f.x,f.y,f.w,3,'#8d745e');rect(f.x,f.y+f.h-3,f.w,3,'#33251b');
    if(f.w>=f.h){for(let x=f.x+18;x<f.x+f.w-8;x+=36)rect(x,f.y+6,2,Math.max(0,f.h-12),'#4b3a2d');}
    else{for(let y=f.y+18;y<f.y+f.h-8;y+=36)rect(f.x+5,y,Math.max(0,f.w-10),2,'#4b3a2d');}
  }
  // ---------- 任务7：上半部分后墙（墙带 + 窗户 + 标语展示区，星露谷风） ----------
  // 沿楼层轮廓上边缘画一面后墙：上半部分不再突兀消失。墙带只作背景（先于家具/角色绘制），
  // 家具与角色按深度自然叠在其前方；行走不受影响（MIN_Y 已把角色挡在墙根以南）。
  // 布局：10 个 144px 模块，第 3/6/9 模块为标语展示板（中央板显示本层名，两侧预留），其余为窗户。
  const BACK_WALL_H=58,WALL_MODULE=144;
  function drawBackWall(f){
    const w=f.width,y1=BACK_WALL_H,y0=-56; // 向上延伸：相机纵向居中（camY<0）时墙面不露底
    rect(0,y0,w,y1-y0,'#4d4460',ctx);
    rect(0,y0,w,2,'#6a5f80',ctx);
    rect(0,y0+2,w,1,'#585070',ctx);
    rect(0,y1-7,w,7,'#3a3248',ctx);
    rect(0,y1,w,2,'#241f30',ctx);
    for(let x=36;x<w;x+=48)rect(x,y0+3,1,y1-y0-10,'#443c56',ctx);
    const modules=Math.floor(w/WALL_MODULE);
    for(let i=0;i<modules;i++){
      const cx=Math.round(WALL_MODULE*(i+.5));
      if(i===2||i===5||i===8){drawSloganBoard(cx,i===5?(f.name||'').replace(/^\d+F\s*·?\s*/,''):null);continue;}
      drawBackWindow(cx);
    }
  }
  // 窗户：木框 + 玻璃（天空渐变 + 窗棂）+ 窗台 + 玻璃反光。
  function drawBackWindow(cx){
    const ww=64,wh=34,x0=cx-ww/2,y0=12;
    rect(x0-4,y0+wh,ww+8,4,'#8d745e',ctx);
    rect(x0-4,y0+wh+4,ww+8,1,'#5b4a3c',ctx);
    rect(x0-2,y0-2,ww+4,wh+4,'#6b5545',ctx);
    rect(x0,y0,ww,wh,'#2f2a3a',ctx);
    const g=ctx.createLinearGradient(0,y0,0,y0+wh);
    g.addColorStop(0,'#aee0ff');g.addColorStop(.6,'#8fc4ee');g.addColorStop(1,'#cfe6f7');
    ctx.fillStyle=g;ctx.fillRect(x0,y0,ww,wh);
    rect(x0+6,y0+wh-9,10,9,'#7da4c8',ctx);
    rect(x0+8,y0+wh-14,6,5,'#7da4c8',ctx);
    rect(x0+22,y0+wh-12,12,12,'#8fb4d6',ctx);
    rect(x0+40,y0+wh-8,8,8,'#7da4c8',ctx);
    rect(x0+50,y0+wh-13,9,13,'#8fb4d6',ctx);
    rect(x0+14,y0+6,12,3,'#f2f8ff',ctx);rect(x0+17,y0+4,7,3,'#f2f8ff',ctx);
    rect(x0+38,y0+9,10,2,'#f2f8ff',ctx);
    rect(cx-1,y0,2,wh,'#6b5545',ctx);
    rect(x0,y0+Math.floor(wh/2)-1,ww,2,'#6b5545',ctx);
    ctx.globalAlpha=.22;
    for(let k=0;k<5;k++)rect(x0+6+k*7,y0+2+k*5,3,8,'#ffffff',ctx);
    ctx.globalAlpha=1;
  }
  // 标语展示板：木框深色板面。中央板显示本层名，两侧为预留标语位（后续挂内容，不臆造文案）。
  function drawSloganBoard(cx,text){
    const bw=104,bh=30,x0=cx-bw/2,y0=14;
    rect(cx-2,4,1,10,'#5b4a3c',ctx);
    rect(cx+1,4,1,10,'#5b4a3c',ctx);
    rect(cx-3,3,7,2,'#8d745e',ctx);
    rect(x0-3,y0-3,bw+6,bh+6,'#8d745e',ctx);
    rect(x0-3,y0+bh+1,bw+6,2,'#5b4a3c',ctx);
    rect(x0,y0,bw,bh,'#1d2438',ctx);
    rect(x0+2,y0+2,bw-4,bh-4,'#232c44',ctx);
    ctx.font=text?'9px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif':'8px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=text?'#f0c47d':'#4d5a7a';
    ctx.fillText(text?text:'标 语 预 留',cx,y0+bh/2+1);
  }
  function draw() {
    if(floorState==='PREPARING'||floorState==='SUBMITTING'||floorState==='UNCONFIRMED')return;
    const camX=Math.round(cameraX),camY=Math.round(cameraY);
    drawCamX=camX;drawCamY=camY;
    const f=WORLD.floorById(floorId);
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false;
    ctx.fillStyle='#05070c';ctx.fillRect(0,0,cssW,cssH);
    ctx.save();ctx.scale(scale,scale);ctx.translate(-camX,-camY);
    // 楼面：按轮廓多边形裁剪后铺 512 分块地板；轮廓外保持非楼面（不补平）。
    ctx.beginPath();
    f.polygon.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));
    ctx.closePath();
    ctx.save();ctx.clip();
    ctx.fillStyle='#2b2333';ctx.fillRect(camX,camY,viewW,viewH);
    const c0x=Math.floor(camX/CHUNK),c1x=Math.floor((camX+viewW)/CHUNK);
    const c0y=Math.floor(camY/CHUNK),c1y=Math.floor((camY+viewH)/CHUNK);
    ensureChunks(c0x,c0y,c1x,c1y);
    for(let cy=c0y;cy<=c1y;cy++)for(let cx=c0x;cx<=c1x;cx++)ctx.drawImage(chunkCache.get(floorId+':'+cx+':'+cy),cx*CHUNK,cy*CHUNK);
    ctx.restore();
    // 任务7：后墙墙带 + 窗户 + 标语展示区（先于家具/角色绘制，作纯背景）。
    drawBackWall(f);
    ctx.restore();
    // 暗角在 CSS 像素空间贴一次，位于背景与角色之间，避免随缩放变形或压暗角色。
    if(vignette)ctx.drawImage(vignette,0,0,cssW,cssH);
    ctx.save();ctx.scale(scale,scale);ctx.translate(-camX,-camY);
    const near=(x,y,w,h,padx,pady)=>x+w+padx>camX&&x-padx<camX+viewW&&y+h+pady>camY&&y-(pady+20)<camY+viewH;
    if(SCENE)SCENE.halls(ctx,f,glassDoorStates);
    const list=[...players.filter(p=>p.alive&&p.floorId===floorId).map(p=>({...p,spriteFacing:p.spriteFacing||'front'})),...npcs];
    const scene=[
      ...furniture.filter(f2=>near(f2.x,f2.y,f2.w,f2.h,12,12)).map(f2=>({depth:f2.depth,f:f2})),
      ...walls.filter(w=>near(w.x,w.y,w.w,w.h,12,12)).map(w=>({depth:w.depth,f:w})),
      ...list.filter(p=>p.x>camX-12&&p.x<camX+viewW+12&&p.y>camY-25&&p.y<camY+viewH+30).map(p=>({depth:p.y,p}))
    ].sort((a,b)=>a.depth-b.depth||Number(!!b.f)-Number(!!a.f));
    for(const item of scene){
      if(item.f){
        const f2=item.f;
        if(f2.type==='wall'){drawWallPanel(f2);continue;}
        const pad=furniturePad(f2.type);
        ctx.drawImage(furnitureSprites.get(f2.id),f2.x-pad.padX,f2.y-pad.padUp);
        if(f2.container)drawInteractOutline('container',f2);
      }else{sprite(item.p);if(item.p.npc)drawInteractOutline('npc',item.p);}
    }
    // 需求2：当前层电梯厅（左右各一处，含上行/下行两扇门）。脉冲空框改为可辨认的电梯门，
    // 当前可提交的那扇叠呼吸描边 + 「E ↑/↓ 至 nF」提示；端点画灰态。
    const liftNow=elevatorTarget();
    const liftId=liftNow&&liftNow.access.allowed?liftNow.portal.id:'';
    for(const portal of portals)drawElevatorHall(portal,portal.id===liftId);
    makeLabels();
    ctx.textAlign='center';
    for(const l of labels.slice().sort((a,b)=>Number(a.p.id===selectedId||a.p.id===self.id)-Number(b.p.id===selectedId||b.p.id===self.id))){
      const active=!l.npc&&l.ids.includes(selectedId);
      const accent=l.npc?'#e9c877':active?'#7cc4ff':(l.p.alive?'#78c39b':'#7c8698');
      roundPx(l.x+2,l.y+3,l.w,l.h,'#080b12a0');
      roundPx(l.x-1,l.y-1,l.w+2,l.h+2,active?'#4f88c4':'#2f425c');
      roundPx(l.x,l.y,l.w,l.h,active?'#14304f':'#0f1826f2');
      rect(l.x+8,l.y+1,l.w-16,1,'#ffffff1f');
      rect(l.x+1,l.y+5,2,l.h-10,accent);
      ctx.font='12px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif';
      ctx.fillStyle=active?'#eaf4ff':'#e2e8f0';
      ctx.fillText(l.p.name+(l.npc?' · NPC':l.p.id===self.id?' · 自己':''),l.x+l.w/2,l.y+13);
      ctx.font='10px ui-monospace,SFMono-Regular,monospace';
      ctx.fillStyle=active?'#a8cbe8':'#96adc8';
      ctx.fillText(l.npc?`${l.p.cost} 筹码 / 私密线索兑换`:l.p.sid,l.x+l.w/2,l.y+26);
    }
    ctx.restore();
    ctx.setTransform(dpr,0,0,dpr,0,0);
    $('zone-name').textContent=floorName;$('coordinate').textContent=`${floorId}F / 7F`;
    if($('floor-indicator'))$('floor-indicator').textContent=`${floorId}F`;
    updateExplorationHUD();updateGames();updateAttackUI();
  }
  function canvasPoint(e) {
    // 屏幕像素 → CSS 像素 → 世界坐标，使用与绘制同一帧的 drawCam；不再用 contain 留边。
    const r=canvas.getBoundingClientRect();
    const kx=cssW/(r.width||cssW||1),ky=cssH/(r.height||cssH||1);
    const sx=(e.clientX-r.left)*kx,sy=(e.clientY-r.top)*ky;
    return {x:sx/scale+drawCamX,y:sy/scale+drawCamY};
  }
  function showCandidates(ids) {
    closeExploration();clearPrivate(true);candidates=[...new Set(ids)].filter(id=>players[id].alive&&players[id].floorId===floorId).sort((a,b)=>a-b);
    $('candidates').hidden=false;$('candidates').innerHTML=`<div class="panel-heading"><div><small>OVERLAPPING PLAYERS</small><h2>请选择目标</h2></div><button id="candidate-close" class="icon-button" aria-label="关闭重叠候选">×</button></div><p>同一点击点有${candidates.length}位玩家，不会自动选人。</p>${candidates.map(id=>row(publicProjection(players[id]))).join('')}`;
    bindRows($('candidates'));$('candidate-close').onclick=()=>{$('candidates').hidden=true;$('candidates').replaceChildren();candidates=[];};
  }
  canvas.addEventListener('click',e=>{
    if(floorState!=='IDLE_SOURCE'&&floorState!=='IDLE_TARGET'){canvas.focus();return;}
    const {x,y}=canvasPoint(e);
    makeLabels();
    const labelHits=labels.filter(l=>!l.npc&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h);
    const bodyHits=players.filter(p=>p.alive&&p.floorId===floorId&&Math.abs(x-p.x)<=21&&y>=p.y-53&&y<=p.y+8&&!WORLD.pointOccluded(x,y,p,occluders)).map(p=>p.id);
    const hits=[...new Set([...labelHits.flatMap(l=>l.ids),...bodyHits])];
    if(hits.length>1)showCandidates(hits);
    else if(hits.length===1){
      const label=labelHits.find(l=>l.ids.includes(hits[0]));
      if(label&&y>=label.y+15)copySID(label.p.sid);
      else select(hits[0]);
    }else {
      // 点击电梯门与 E 走同一套「靠近 + 面向」守卫，不再有绕过路径；进门先弹选层面板。
      const portalHit=portals.find(pt=>x>=pt.x-pt.w/2&&x<=pt.x+pt.w/2&&y>=pt.y-pt.h/2&&y<=pt.y+pt.h/2);
      if(portalHit){
        const access=WORLD.portalAccess(self,portalHit);
        if(access.allowed)openElevatorPicker(portalHit.id);
        else showToast(access.reason);
        canvas.focus();return;
      }
      const npc=npcs.filter(p=>Math.abs(x-p.x)<=21&&y>=p.y-53&&y<=p.y+8&&!WORLD.pointOccluded(x,y,p,occluders)||
        labels.some(l=>l.npc&&l.p.id===p.id&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h)).sort((a,b)=>b.y-a.y)[0];
      const container=furniture.filter(f=>f.container&&x>=f.x&&x<=f.x+f.w&&y>=f.y&&y<=f.y+f.h).sort((a,b)=>b.depth-a.depth)[0];
      if(npc||container){
        if(!openExploration(npc?'npc':'container',(npc||container).id))showToast(self.alive?'请靠近后再互动（64 像素以内）':'已淘汰，无法探索');
      }else {closeExploration();clearPrivate(true);selectedId=null;renderTarget();renderRoster();}
    }
    canvas.focus();
  });
  $('floor-transition-close').onclick=()=>dismissFloorNotice();
  $('elevator-close').onclick=()=>closeElevatorPicker();
  function frame(now) {
    const begin=performance.now();step(Math.min(.05,(now-lastNow)/1000));lastNow=now;checkFinish();draw();
    if(Math.floor(clock)!==lastUI){lastUI=Math.floor(clock);updateSkillStatus();const rk=$('ranking');if(rk&&!rk.hidden)renderRanking();}
    timings.push(performance.now()-begin);if(timings.length>600)timings.shift();requestAnimationFrame(frame);
  }
  reset();resizeCanvas();draw();requestAnimationFrame(frame);
  // 显式启用测试时才提供诊断接口，正常地址不暴露权威状态或私密线索。
  if(new URLSearchParams(location.search).has('test')) {
    // &floor=N（1–7）：测试直达指定楼层（不经过电梯），仅供无头截图/验收。
    {
      const want=Number(new URLSearchParams(location.search).get('floor'));
      if(want>=1&&want<=7){
        loadFloorLocal(want);
        self.floorId=want;
        const fl=WORLD.floorById(want);
        cameraX=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).x;
        cameraY=WORLD.cameraBounds(floorId,viewW,viewH,self.x,self.y).y;
        draw();
      }
    }
    const explorationSnapshot=()=>({chips,searched:[...searched],clues:clues.map(c=>({...c})),
      panel:exploration?{...exploration}:null,result:explorationResult,alive:self.alive,
      nearby:nearbyEntities().map(({kind,entity})=>({kind,entityId:entity.id}))});
    window.__sidTest={
      reset,select,step,draw,
      floorChange:(portalId,targetFloorId)=>{requestFloorChange(portalId,targetFloorId);},
      openElevatorPicker:portalId=>{openElevatorPicker(portalId);},
      floorState:()=>({floorId,floorName,floorState,portals:portals.map(p=>({id:p.id,side:p.side,x:p.x,y:p.y})),containers:furniture.filter(f=>f.container).map(f=>f.id),npcs:npcs.map(n=>n.id)}),
      interact:(kind,entityId)=>{
        if(kind==='search'||kind==='exchange'){
          const panelKind=kind==='search'?'container':'npc';
          if(exploration?.kind!==panelKind||exploration.entityId!==entityId){
            if(!openExploration(panelKind,entityId))return false;
          }
        }
        const ok=interact(kind,entityId);updateExplorationHUD();return ok;
      },
      exploration:explorationSnapshot,
      play:(kind,entityId)=>{
        const fail={ok:false,item:null,slotIndex:-1,slots:wheel?wheel.slots:[],cost:0,spins:wheelSpins,chips,score:self.score};
        if(kind!=='wheel')return fail;
        const entity=explorationEntity('npc',entityId);
        if(!entity)return fail;
        if(!wheel||wheel.npcId!==entityId){if(!openWheel(entityId))return fail;}
        return spinWheelLocal(true)||fail;
      },
      rps:(choice,targetId)=>runRps(choice,targetId),
      attack:()=>doAttack(),
      games:()=>({chips,wheels:[...wheelClaims],rpsUntil,lastResult:rpsResult,
        combat:{attackUntil,stunUntil:self.stunUntil||0,freezeUntil:self.freezeUntil||0},
        opponents:players.filter(p=>p.id!==self.id).map(p=>({id:p.id,x:p.x,y:p.y,stunUntil:p.stunUntil||0,freezeUntil:p.freezeUntil||0,chips:p.chips}))}),
      score:()=>({self:self.score,players:players.map(p=>({id:p.id,name:p.name,score:simScore(p),alive:p.alive}))}),
      finishInfo:()=>({finished,finishReason,ranking}),
      forceFinish:reason=>{
        if(finished)return {finished,finishReason,ranking};
        finished=true;finishReason=reason||'timeUp';
        ranking=finishReason==='aliveFloor'?null:buildRanking();
        onFinish();return {finished,finishReason,ranking};
      },
      get furniture(){return furniture.map(f=>({...f,footprint:{...f.footprint},...(f.container?{container:{...f.container}}:{})}));},
      get npcs(){return WORLD.NPCS.map(n=>({...n}));},
      snapshot:()=>({cameraX,cameraY,viewW,viewH,floorId,floorState,clock,selectedId,exploration:explorationSnapshot(),covered:!!WORLD.coverFor(self,occluders),facing:{...facing},outlines:[...furniture.filter(f=>f.container).map(f=>({kind:'container',id:f.id,state:outlineState('container',f)})),...npcs.map(n=>({kind:'npc',id:n.id,state:outlineState('npc',n)}))],keys:[...keys],hold:holding(),myHeld,score:self.score,finishReason,ranking,rules:WORLD.RULES,scores:players.map(p=>({id:p.id,name:p.name,score:simScore(p),alive:p.alive})),projections:players.map(publicProjection),labels:labels.map(l=>({x:l.x,y:l.y,w:l.w,h:l.h,ids:l.ids})),mapIds:players.filter(p=>p.alive&&p.floorId===floorId&&p.x>cameraX-40&&p.x<cameraX+viewW+40).map(p=>p.id),players:players.map(p=>({id:p.id,x:p.x,y:p.y,floorId:p.floorId,spriteFacing:p.spriteFacing,walk:p.walk,moving:p.moving})),self:{x:self.x,y:self.y,floorId:self.floorId,spriteFacing:self.spriteFacing,walk:self.walk,moving:self.moving,role:self.role,probes:self.probes,probeUntil:self.probeUntil,actionUntil:self.actionUntil,score:self.score},pending:pending?.kind,logs:logs.map(l=>l.text)}),
      setPosition:(x,y)=>{self.x=x;self.y=y;step(0);draw();},
      advance:seconds=>{clock+=seconds;updateSkillStatus();},
      secret:id=>({sid:players[id].sid.join('-'),role:players[id].role,hp:players[id].hp,alive:players[id].alive}),
      key:(code,on)=>on?keys.add(code):keys.delete(code),
      perf:()=>{const a=timings.slice().sort((a,b)=>a-b);return {frames:a.length,p95:a[Math.floor(a.length*.95)]||0,max:a[a.length-1]||0};},
      benchmark:()=>{const a=[];for(let i=0;i<600;i++){const t=performance.now();step(1/60);draw();a.push(performance.now()-t);}a.sort((a,b)=>a-b);return {frames:600,p95:a[570],max:a[599]};}
    };
  }
})();
