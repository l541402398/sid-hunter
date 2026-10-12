'use strict';
(() => {
  // All authoritative state stays in this closure. DOM and map consume publicProjection only.
  // No persistence, remote requests, analytics, or third-party libraries.
  const $ = id => document.getElementById(id);
  const WORLD = window.WORLD;
  const {WORLD_W:W,WORLD_H:H,VIEW_W:VW,SPEED} = WORLD;
  const canvas = $('office'), ctx = canvas.getContext('2d', {alpha:false});
  ctx.imageSmoothingEnabled = false;
  // 离屏背景：静态场景烘焙一次，逐帧只做一次贴图，把预算留给角色与交互。
  // 背景按分区切成四张 960×640 贴图，逐帧只取当前视口覆盖的一到两张。
  const bgTiles = [0,1,2,3].map(()=>{const c=document.createElement('canvas');c.width=VW;c.height=H;return c;});
  // 光晕与暗角都预渲染成小图后缩放贴图：逐帧/烘焙期不再重复求解大面积渐变。
  const glowSprite = (()=>{
    const c=document.createElement('canvas');c.width=c.height=128;
    const g=c.getContext('2d');
    const rg=g.createRadialGradient(64,64,2,64,64,64);
    rg.addColorStop(0,'rgba(255,214,158,1)');rg.addColorStop(1,'rgba(255,180,110,0)');
    g.fillStyle=rg;g.fillRect(0,0,128,128);return c;
  })();
  const VIGNETTE = (()=>{
    const c=document.createElement('canvas');c.width=VW;c.height=H;
    const g=c.getContext('2d');
    const rg=g.createRadialGradient(VW/2,H*.44,190,VW/2,H*.48,650);
    rg.addColorStop(0,'rgba(255,216,152,.05)');rg.addColorStop(.55,'rgba(0,0,0,0)');rg.addColorStop(1,'rgba(6,4,10,.42)');
    g.fillStyle=rg;g.fillRect(0,0,VW,H);return c;
  })();
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
  let players, self, logs, selectedId = null, cameraX = 0, pending = null;
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
  const furniture = WORLD.makeFurniture();
  const npcs = WORLD.NPCS.map((n,i)=>({...n,npc:true,alive:true,walk:0,moving:false,spriteIndex:i+20,
    colors:Object.fromEntries(Object.entries(palettes).map(([key,options],j)=>[key,options[(i+j+2)%options.length]]))}));
  const furnitureSprites = new Map();
  const zones = WORLD.ZONES;
  let chips = 0, searched = new Set(), clues = [], clueKeys = new Set();
  let exploration = null, explorationResult = '';
  // 本地娱乐互动状态：转盘领取记录、猜拳冷却/结果、J 互动冷却与朝向。全部只在本地，不写公共日志。
  const RPS_ZH = {rock:'石头',paper:'布',scissors:'剪刀'};
  let wheelClaims = new Set();
  let rpsChoice = 'rock', rpsUntil = 0, rpsResult = '', gamesBuilt = false;
  let attackUntil = 0, combatText = '', swingUntil = 0, facing = {x:1,y:0};
  // 结束判定与排行榜：finished 后禁用移动/探索/小游戏/攻击。startedAt 为开局 clock（当前恒为 0）。
  let finished = false, finishReason = null, ranking = null, hadBad = false, startedAt = 0;
  // 大转盘：可重复转动，wheelSpins 记录已转次数（首次免费，之后按 WORLD.wheelSpinCost 阶梯收费）。
  let wheelSpins = 0, wheel = null, wheelRAF = 0;
  const stamp = () => new Date().toLocaleTimeString('zh-CN',{hour12:false});
  function reset(mode='good') {
    players = names.map((name,i) => ({
      id:i,name,x:i===0?480:i<4?655:300+(i*177)%3350,y:i===0?405:i<4?407:i%2?450:340,
      role:[3,7,12,18].includes(i)?'bad':'good',alive:i!==19,
      hp:[3,7,18].includes(i)?2:1,
      sid:[`${String.fromCharCode(65+i)}${(i*3+7)%10}${String.fromCharCode(67+i%20)}`,`${(i*2+9)%10}${String.fromCharCode(75+i%14)}${(i+2)%10}`,`${(i+3)%10}${String.fromCharCode(77+i%12)}${(i*7+8)%10}`],
      sidPublic:[true,false,false],
      colors:Object.fromEntries(Object.entries(palettes).map(([k,options],j)=>[k,options[(i+j)%options.length]])),
      traits:{saying:['先喝口水','马上就好','有点意思','稳住别慌','让我想想'][i%5],food:['番茄面','饺子','咖喱饭','火锅','三明治'][i%5],sport:['羽毛球','游泳','骑行','篮球','跑步'][i%5]},
      traitPublic:{saying:i%3===0,food:i%4===0,sport:false},
      probes:2,probeUntil:0,actionUntil:0,
      chips:3,stunUntil:0,freezeUntil:0,score:0,
      walk:0,moving:false
    }));
    self = players[0]; self.role=mode; self.hp=mode==='bad'?2:1; self.score=0;
    players[5].traitPublic={saying:true,food:true,sport:true};
    players[5].sidPublic=[true,true,true];
    players[18].x=3520; players[18].y=407;
    players[12].x=2250; players[12].y=410;
    players[4].x=885; players[4].y=415;
    logs=[{time:stamp(),text:'办公室已就绪：20位模拟玩家，19位存活。'}];
    clock=0;cameraX=0;selectedId=null;keys.clear();pending=null;privateResult='';
    chips=0;searched.clear();clues=[];clueKeys.clear();closeExploration();
    // 清空本地娱乐互动：转盘领取、猜拳冷却与结果、J 互动冷却、眩晕/僵直与朝向。
    wheelClaims.clear();rpsChoice='rock';rpsUntil=0;rpsResult='';
    attackUntil=0;combatText='';swingUntil=0;facing={x:1,y:0};
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
    return {id:p.id,name:p.name,alive:p.alive,x:p.x,y:p.y,
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
  function clearAllInput() { keys.clear();clearPrivate(true);closeExploration();closeGames();closeWheel(); }
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
  // 猜拳目标：附近存活模拟玩家中最近、64 像素内且 lineClear 无遮挡的一位。
  function rpsTargets() {
    return players.filter(p=>p.alive&&p.id!==self.id)
      .map(p=>({p,d:WORLD.distanceToEntity(self,p)}))
      .filter(({p,d})=>d<=WORLD.INTERACT_RANGE&&WORLD.lineClear(self,p,furniture))
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
    if(WORLD.distanceToEntity(self,target)>WORLD.INTERACT_RANGE||!WORLD.lineClear(self,target,furniture))return rpsResult='目标不在互动范围内或中间有遮挡，无法发起。',fail(rpsResult);
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
      if(!p.alive||p.id===self.id)continue;
      const dx=p.x-self.x,dy=p.y-self.y,d=Math.hypot(dx,dy);
      if(d>range||d===0)continue;
      if((dx*facing.x+dy*facing.y)/d<cos)continue;
      if(!WORLD.lineClear(self,p,furniture)||WORLD.coverFor(p,furniture))continue;
      if(d<bd){bd=d;best=p;}
    }
    return best;
  }
  function doAttack() {
    const cd=WORLD.PLAY_CONFIG.attackCooldownMs,wait=left(attackUntil);
    if(finished)return combatText='本局已结束，无法使用互动。',{ok:false,hitId:null,resultText:combatText,cooldownMs:0};
    if(!self.alive)return combatText='已淘汰，无法使用互动。',{ok:false,hitId:null,resultText:combatText,cooldownMs:0};
    if(wait>0)return combatText=`互动冷却中，剩余 ${wait} 秒。`,{ok:false,hitId:null,resultText:combatText,cooldownMs:wait*1000};
    attackUntil=clock+cd/1000;swingUntil=clock+.26; // 空挥也进入冷却
    const target=attackTarget();
    if(!target)return combatText=`互动空挥，未命中目标，进入${Math.round(cd/1000)}秒冷却。`,{ok:false,hitId:null,resultText:combatText,cooldownMs:cd};
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
    $('cover-status').textContent=WORLD.coverFor(self,furniture)?'身体已遮挡':'无遮挡';
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
    if(e.key==='Escape'){clearAllInput();$('candidates').hidden=true;$('candidates').replaceChildren();return;}
    if(document.activeElement===$('my-info')&&(e.code==='Space'||e.code==='Enter')){
      e.preventDefault();if(!e.repeat){myKey=e.code;myHeld=true;renderMine();}return;
    }
    if(isTyping())return;
    if(e.code==='KeyJ'){
      if(e.repeat||myHeld||isControl())return;
      e.preventDefault();doAttack();updateAttackUI();return;
    }
    if(e.code==='KeyE'){
      e.preventDefault();if(e.repeat)return;
      if(exploration)closeExploration();
      else {const nearest=nearbyEntities()[0];if(nearest)openExploration(nearest.kind,nearest.entity.id);}
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
  buildBackground();
  for(const f of furniture){
    const c=document.createElement('canvas');c.width=f.w+24;c.height=f.h+60;
    const g=c.getContext('2d');g.imageSmoothingEnabled=false;
    drawFurniture({...f,x:12,y:40},g);furnitureSprites.set(f.id,c);
  }
  function collides(x,y) {return WORLD.collidesAt(x,y,furniture);}
  function step(dt) {
    dt=Math.max(0,Math.min(.05,dt));clock+=dt;
    if(self.alive&&!finished&&!isTyping()){
      let dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
      let dy=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
      const len=Math.hypot(dx,dy),ox=self.x,oy=self.y;
      if(len){facing={x:dx/len,y:dy/len};dx=dx/len*SPEED*dt;dy=dy/len*SPEED*dt;
        const nx=Math.max(WORLD.MIN_X,Math.min(WORLD.MAX_X,self.x+dx));if(!collides(nx,self.y))self.x=nx;
        const ny=Math.max(WORLD.MIN_Y,Math.min(WORLD.MAX_Y,self.y+dy));if(!collides(self.x,ny))self.y=ny;
      }
      // 行走相位按实际位移累积：撞墙时不播放迈步，只保留待机呼吸。
      const moved=Math.hypot(self.x-ox,self.y-oy);
      self.walk+=moved;self.moving=moved>0.02;
    }else self.moving=false;
    cameraX=Math.max(0,Math.min(W-VW,self.x-VW/2));
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
  // 家具：接地阴影 + 三层明暗 + 暖色轮廓光，按材质区分木 / 布 / 金属 / 陶土。
  function drawFurniture(f,g=ctx) {
    const {x,y,w,h,type}=f;
    g.globalAlpha=.2;rect(x+8,y+h-6,w-12,11,'#120c14',g);rect(x+3,y+h-3,w-6,6,'#120c14',g);g.globalAlpha=1;
    if(type==='plant'){
      const px=x+w*.28,pw=Math.round(w*.46);
      rect(x+w*.49,y+h*.26,4,h*.3,'#3f7a52',g);
      blob(g,x+w*.02,y+h*.04,w*.5,h*.46,'#3f7a52',g);
      blob(g,x+w*.46,y+h*.0,w*.46,h*.48,'#4a8a5d',g);
      blob(g,x+w*.14,y+h*.24,w*.4,h*.34,'#2f6242',g);
      blob(g,x+w*.44,y+h*.26,w*.44,h*.32,'#58996a',g);
      rect(x+w*.12,y+h*.1,w*.14,2,'#7fbb8c',g);rect(x+w*.6,y+h*.06,w*.12,2,'#7fbb8c',g);
      rect(px,y+h*.52,pw,Math.round(h*.46),'#8a4f33',g);
      rect(px+1,y+h*.52,pw-2,4,'#b0714a',g);
      rect(px,y+h*.58,pw,Math.round(h*.36),'#7a452c',g);
      rect(px+3,y+h*.92,pw-6,4,'#5f3623',g);
      rect(px+3,y+h*.52,pw-6,3,'#3a2a22',g);
      return;
    }
    if(type==='sofa'){
      rect(x+4,y,w-8,24,'#4b6b70',g);rect(x+4,y,w-8,3,'#62868b',g);rect(x+4,y+21,w-8,3,'#2c4549',g);
      rect(x,y+20,w,h-28,'#415f63',g);rect(x,y+20,w,3,'#6b9095',g);rect(x,y+h-6,w,3,'#25393c',g);
      const cw=Math.max(6,Math.round((w-26)/2));
      rect(x+9,y+24,cw,h-38,'#4b6d71',g);rect(x+9,y+24,cw,2,'#62868b',g);
      rect(x+17+cw,y+24,cw,h-38,'#4b6d71',g);rect(x+17+cw,y+24,cw,2,'#62868b',g);
      rect(x+w/2-1,y+25,2,h-40,'#2c4549',g);
      rect(x,y+14,15,h-20,'#55797d',g);rect(x,y+14,15,3,'#7ba0a4',g);rect(x+13,y+16,2,h-24,'#2c4549',g);
      rect(x+w-15,y+14,15,h-20,'#55797d',g);rect(x+w-15,y+14,15,3,'#7ba0a4',g);rect(x+w-15,y+16,2,h-24,'#2c4549',g);
      rect(x+22,y+25,20,13,'#a4665c',g);rect(x+22,y+25,20,2,'#c4837a',g);rect(x+22,y+36,20,2,'#7d4a44',g);
      rect(x+7,y+h-5,9,6,'#4a3524',g);rect(x+w-16,y+h-5,9,6,'#4a3524',g);
      return;
    }
    if(type==='cabinet'){
      rect(x,y,w,h,'#4e3c2c',g);rect(x+2,y+2,w-4,h-4,'#6b543c',g);rect(x+2,y+2,w-4,3,'#8a6e52',g);rect(x+2,y+h-4,w-4,3,'#3d2f22',g);
      rect(x+w/2-1,y+5,2,h-10,'#3d2f22',g);
      rect(x+7,y+10,w/2-11,h-22,'#7a6247',g);rect(x+7,y+10,w/2-11,2,'#93744a',g);
      rect(x+w/2+4,y+10,w/2-11,h-22,'#7a6247',g);rect(x+w/2+4,y+10,w/2-11,2,'#93744a',g);
      rect(x+w/2-9,y+h/2-3,3,11,'#c8a86a',g);rect(x+w/2+6,y+h/2-3,3,11,'#c8a86a',g);
      rect(x+8,y-11,22,12,'#8a5a4a',g);rect(x+10,y-9,18,2,'#a97262',g);rect(x+10,y-11,6,2,'#b98272',g);
      rect(x+34,y-9,16,10,'#4f6b74',g);rect(x+34,y-9,16,2,'#64868f',g);
      rect(x+54,y-7,12,8,'#6b7f5c',g);rect(x+54,y-7,12,2,'#87a078',g);
      return;
    }
    if(type==='desk'){
      rect(x+6,y+30,7,h-30,'#4a3524',g);rect(x+w-13,y+30,7,h-30,'#4a3524',g);
      rect(x+4,y+22,w-8,h-22,'#5a4231',g);rect(x+4,y+22,w-8,3,'#8a6a48',g);rect(x+4,y+h-5,w-8,5,'#3f2f22',g);
      rect(x-5,y+8,w+10,16,'#7d5c3f',g);rect(x-5,y+8,w+10,3,'#a5825b',g);rect(x-5,y+21,w+10,3,'#543f2d',g);
      // 桌板下的凹板，避免正面是一整块平色
      rect(x+10,y+29,w-66,h-37,'#523c2d',g);rect(x+10,y+29,w-66,1,'#634b38',g);rect(x+10,y+h-11,w-66,2,'#3f2f22',g);
      rect(x+w-49,y+33,43,17,'#6b5238',g);rect(x+w-47,y+35,39,2,'#8f7050',g);rect(x+w-31,y+39,14,3,'#c8a86a',g);
      rect(x+37,y-31,58,36,'#2b2f38',g);rect(x+39,y-29,54,30,'#182f38',g);rect(x+39,y-29,54,2,'#0d1e25',g);
      rect(x+42,y-26,48,3,'#63c7c4',g);rect(x+42,y-20,32,2,'#4f9d9c',g);rect(x+42,y-15,40,2,'#4f9d9c',g);rect(x+42,y-10,24,2,'#4f9d9c',g);
      rect(x+58,y+3,12,6,'#39414a',g);rect(x+50,y+8,28,4,'#4a5058',g);
      rect(x+40,y+13,40,6,'#d5cfbe',g);rect(x+42,y+15,36,1,'#8f8a7e',g);rect(x+40,y+18,40,1,'#a49e8e',g);
      rect(x+w-27,y+11,10,9,'#c96f4e',g);rect(x+w-27,y+11,10,2,'#e08a6a',g);rect(x+w-17,y+13,3,4,'#c96f4e',g);
      rect(x+6,y+12,22,7,'#e6dfcd',g);rect(x+8,y+14,18,1,'#b9b3a2',g);rect(x+8,y+16,14,1,'#b9b3a2',g);
      return;
    }
    if(type==='counter'){
      // 茶水柜用冷色饰面，和暖木地板拉开层次
      rect(x+4,y+24,w-8,h-24,'#48524f',g);rect(x+4,y+24,w-8,3,'#5f6b66',g);rect(x+4,y+h-5,w-8,5,'#2f3937',g);
      for(let i=1;i<4;i++){
        const px=x+i*(w/4);
        rect(px,y+28,1,h-30,'#333d3b',g);
        rect(px+6,y+32,w/4-12,h-42,'#525d59',g);
        rect(px+6,y+32,w/4-12,1,'#606c67',g);rect(px+6,y+h-12,w/4-12,2,'#3c4644',g);
      }
      // 茶水台用浅色石面，和木质工作台拉开材质差
      rect(x-5,y+8,w+10,17,'#cfc7bb',g);rect(x-5,y+8,w+10,3,'#e8e2d6',g);rect(x-5,y+22,w+10,3,'#9a9184',g);
      rect(x+16,y-26,40,34,'#39414a',g);rect(x+18,y-24,36,10,'#1e2a30',g);rect(x+22,y-20,10,3,'#d9814f',g);
      rect(x+18,y-12,36,4,'#2b323a',g);rect(x+28,y-8,14,6,'#c9c4b4',g);
      rect(x+92,y-16,24,24,'#8d929a',g);rect(x+94,y-14,20,3,'#a9aeb6',g);rect(x+112,y-21,4,6,'#5f646b',g);rect(x+98,y-23,10,7,'#5f646b',g);
      for(let i=0;i<4;i++){const cx=x+140+i*24;rect(cx,y+11,9,9,'#dfe6e6',g);rect(cx,y+11,9,2,'#f2f7f7',g);rect(cx,y+18,9,2,'#9aa4a4',g);}
      rect(x+206,y+13,26,6,'#b58a5c',g);rect(x+208,y+8,7,7,'#c96f4e',g);rect(x+217,y+9,7,6,'#8a9a5c',g);rect(x+224,y+10,6,5,'#d9b45c',g);
      return;
    }
    if(type==='table'){
      rect(x+8,y+24,7,h-24,'#4a3524',g);rect(x+w-15,y+24,7,h-24,'#4a3524',g);
      rect(x-6,y+8,w+12,17,'#7d5c3f',g);rect(x-6,y+8,w+12,3,'#a5825b',g);rect(x-6,y+22,w+12,3,'#543f2d',g);
      rect(x+16,y-12,34,20,'#39414a',g);rect(x+18,y-10,30,15,'#182f38',g);rect(x+20,y-8,20,2,'#63c7c4',g);rect(x+20,y-4,24,2,'#4f9d9c',g);
      rect(x+12,y+8,42,5,'#4a5058',g);rect(x+14,y+9,38,1,'#6a7078',g);
      rect(x+64,y+12,24,7,'#e6dfcd',g);rect(x+66,y+14,20,1,'#b9b3a2',g);rect(x+66,y+16,14,1,'#b9b3a2',g);
      rect(x+96,y+11,10,9,'#d9814f',g);rect(x+96,y+11,10,2,'#e8a173',g);
      return;
    }
    if(type==='reception'){
      rect(x+4,y+18,w-8,h-18,'#5a4231',g);rect(x+4,y+18,w-8,3,'#8a6a48',g);rect(x+4,y+h-5,w-8,5,'#3f2f22',g);
      for(let i=1;i<3;i++)rect(x+i*(w/3),y+22,1,h-24,'#46341f',g);
      rect(x-5,y+6,w+10,13,'#cfc7bb',g);rect(x-5,y+6,w+10,3,'#e8e2d6',g);rect(x-5,y+16,w+10,3,'#9a9184',g);
      rect(x+6,y+23,w-12,2,'#c8a86a',g);
      rect(x+12,y-20,42,26,'#2b2f38',g);rect(x+14,y-18,38,20,'#182f38',g);rect(x+16,y-16,30,3,'#63c7c4',g);rect(x+16,y-11,22,2,'#4f9d9c',g);
      rect(x+26,y+6,12,6,'#39414a',g);rect(x+20,y+11,24,4,'#4a5058',g);
      rect(x+w-34,y-6,16,12,'#8a5a4a',g);rect(x+w-32,y-4,12,2,'#a97262',g);
      rect(x+w-28,y-19,3,14,'#3f7a52',g);rect(x+w-32,y-25,8,6,'#c96f4e',g);rect(x+w-24,y-21,6,5,'#e08a6a',g);
      return;
    }
    rect(x,y,w,h,'#5a4231',g);rect(x,y,w,3,'#8a6a48',g);rect(x,y+h-4,w,4,'#3f2f22',g);
    rect(x+6,y+h,9,6,'#4a3524',g);rect(x+w-15,y+h,9,6,'#4a3524',g);
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
  function buildBackground() {
    // 光点先登记为世界坐标，再按分区贴图各画一遍，跨区溢出的光不会在接缝处被切断。
    const spots=[];
    for(let z=0;z<4;z++){
      const base=z*960;
      for(let j=0;j<4;j++)spots.push({x:base+58+j*227+71,y:110,r:152,a:.15});
      spots.push({x:base+242,y:21,r:46,a:.5},{x:base+696,y:21,r:46,a:.5});
      spots.push({x:base+242,y:175,r:196,a:.14},{x:base+696,y:175,r:196,a:.14},{x:base+480,y:182,r:214,a:.16});
    }
    for(let z=0;z<4;z++){
      const base=z*960,g=bgTiles[z].getContext('2d');
      g.imageSmoothingEnabled=false;
      g.save();g.translate(-base,0);
      g.fillStyle='#2b2333';g.fillRect(base,0,VW,H);
      // 墙面：上部涂料 + 分段竖缝，下部护墙板，底部踢脚线
      const wall=g.createLinearGradient(0,0,0,86);
      wall.addColorStop(0,'#453a4e');wall.addColorStop(1,'#332b3e');
      g.fillStyle=wall;g.fillRect(base,0,VW,86);
      for(let x=base;x<base+VW;x+=96)rect(x,0,1,86,'#2b2334',g);
      rect(base,24,VW,1,'#4b3d4b',g);
      rect(base,86,VW,20,'#3a3145',g);rect(base,86,VW,2,'#514461',g);
      for(let x=base;x<base+VW;x+=48)rect(x,90,1,14,'#332b3e',g);
      rect(base,106,VW,12,'#1f1a28',g);rect(base,106,VW,1,'#443a4e',g);
      // 地面：横向木板，逐块色调变化 + 受光边与板缝
      const planks=['#54402f','#4a3727','#5b462f','#453324','#4f3c2c'];
      g.fillStyle='#4a3727';g.fillRect(base,118,VW,H-118);
      for(let y=118;y<H;y+=16){
        const row=((y-118)/16)|0,stag=(row%2)?32:0;
        for(let x=base-64+stag;x<base+VW;x+=64){
          const k=Math.abs(row*31+Math.round(x/64)*17+97);
          rect(x,y,64,16,planks[k%5],g);
          if(k%7===0)rect(x+9,y+6,18,1,'#3c2c20',g);
          else if(k%5===0)rect(x+31,y+10,11,1,'#3c2c20',g);
          if(k%2)rect(x,y,1,16,'#3d2d20',g);
        }
        rect(base,y,VW,1,'#5e4936',g);
        rect(base,y+15,VW,1,'#33251b',g);
      }
      if(z)rect(base,112,4,H-112,'#2c211b',g);
      for(let j=0;j<4;j++)drawWindow(g,base+58+j*227,13,142,51);
      drawFrame(g,base+12,30,42,34);
      drawClock(g,base+571,32,24);
      drawLamp(g,base+242);drawLamp(g,base+696);
      drawRug(g,base+200,328,560,140);
      drawSign(g,base+380,68,200,28,`0${z+1}  /  ${zones[z]}`);
      for(const s of spots)if(Math.abs(s.x-base-VW/2)<1200)glow(g,s.x,s.y,s.r,s.a);
      g.restore();
    }
  }
  // 角色：统一描边 + 三层明暗 + 五官 + 发型 + 行走摆动。
  // 命中框（x±21, y-53~y+8）与名牌偏移保持不变，外观升级不影响任何交互判定。
  function sprite(p) {
    const x=Math.round(p.x),c=p.colors;
    const hi=Math.max(0,palettes.hair.findIndex(o=>o[0]===c.hair[0]));
    const skin=SKIN[hi],skinLo=shade(skin,-.24);
    const hair=c.hair[1],hairHi=shade(hair,.3),hairLo=shade(hair,-.3);
    const top=c.top[1],topHi=shade(top,.24),topLo=shade(top,-.3);
    const pants=c.pants[1],pantsHi=shade(pants,.18),pantsLo=shade(pants,-.26);
    const shoes=c.shoes[1],shoeLo=shade(shoes,-.32);
    const OL='#1c1620';
    const ph=p.walk*.13,sw=p.moving?Math.sin(ph):0;
    const bob=p.moving?-Math.round(Math.abs(Math.sin(ph))*2):Math.round(Math.sin(clock*1.5+(p.spriteIndex??p.id)*1.9)*.7);
    const yb=Math.round(p.y)+bob;
    const liftL=Math.max(0,sw)*2,liftR=Math.max(0,-sw)*2,arm=Math.round(-sw*1.6);
    const a=p.alive?1:.4;
    ctx.globalAlpha=.3*a;rect(x-11,p.y+2,22,5,'#0f0a12');rect(x-8,p.y+1,16,6,'#0f0a12');
    ctx.globalAlpha=a;
    const parts=[
      [x-11,yb-3-liftL,10,4,shoes],[x+1,yb-3-liftR,10,4,shoes],
      [x-9,yb-12,7,9-liftL,pantsLo],[x+2,yb-12,7,9-liftR,pantsLo],
      [x-10,yb-17,20,6,pants],
      [x-11,yb-31,22,16,top],
      [x-16,yb-30+arm,5,12,topLo],[x+11,yb-30-arm,5,12,topLo],
      [x-16,yb-19+arm,5,5,skin],[x+11,yb-19-arm,5,5,skin],
      [x-4,yb-34,8,5,skinLo],
      [x-10,yb-47,20,16,skin],
      [x-11,yb-49,22,7,hair]
    ];
    const style=hi%4;
    if(style===1)parts.push([x-13,yb-44,3,16,hair],[x+10,yb-44,3,16,hair]);
    else parts.push([x-12,yb-44,3,10,hairLo],[x+9,yb-44,3,10,hairLo]);
    if(style===2)parts.push([x+11,yb-43,4,12,hairLo]);
    if(style===3)parts.push([x-5,yb-53,10,5,hair]);
    for(const q of parts)rect(q[0]-1,q[1]-1,q[2]+2,q[3]+2,OL);
    for(const q of parts)rect(q[0],q[1],q[2],q[3],q[4]);
    rect(x-9,yb-48,9,2,hairHi);
    rect(x-11,yb-31,22,2,topHi);rect(x-11,yb-17,22,2,topLo);
    rect(x-11,yb-31,2,16,shade(top,.1));rect(x+9,yb-31,2,16,topLo);
    rect(x-1,yb-31,2,5,shade(top,-.45));rect(x-10,yb-17,20,1,shade(pants,-.5));
    rect(x-9,yb-12,7,2,pantsHi);rect(x+2,yb-12,7,2,pantsHi);
    rect(x-11,yb-liftL,10,1,shoeLo);rect(x+1,yb-liftR,10,1,shoeLo);
    rect(x-11,yb-40,1,4,skinLo);rect(x+10,yb-40,1,4,skinLo);
    rect(x-8,yb-45,4,1,hairLo);rect(x+4,yb-45,4,1,hairLo);
    rect(x-7,yb-43,3,3,'#2b2230');rect(x+4,yb-43,3,3,'#2b2230');
    rect(x-7,yb-43,1,1,'#f4f8ff');rect(x+4,yb-43,1,1,'#f4f8ff');
    rect(x-1,yb-39,2,1,skinLo);
    rect(x-3,yb-36,6,1,'#a8706a');rect(x-4,yb-37,1,1,'#a8706a');rect(x+3,yb-37,1,1,'#a8706a');
    ctx.globalAlpha=1;
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
    const covered = !!WORLD.coverFor(p,furniture);
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
    // 任何被 coverFor 判定遮挡的角色（含自己）都不生成名牌，解除遮挡后同一帧恢复。
    const visible=p=>p.alive&&p.x>=cameraX-130&&p.x<=cameraX+VW+130&&!WORLD.coverFor(p,furniture);
    labels=players.filter(visible).map(publicProjection)
      .map(p=>({x:p.x-72,y:p.y+12,w:144,h:31,ids:[p.id],p}));
    labels.push(...npcs.filter(visible).map(p=>({x:p.x-72,y:p.y+12,w:144,h:31,ids:[],p,npc:true})));
  }
  function draw() {
    // 场景已烘焙：逐帧只做一次贴图 + 一次氛围光，剩下的预算全部给角色。
    const sc=Math.round(cameraX),tile=Math.floor(sc/VW),off=sc-tile*VW;
    if(off===0)ctx.drawImage(bgTiles[tile],0,0);
    else{
      ctx.drawImage(bgTiles[tile],off,0,VW-off,H,0,0,VW-off,H);
      ctx.drawImage(bgTiles[tile+1],0,0,off,H,VW-off,0,off,H);
    }
    ctx.drawImage(VIGNETTE,0,0);
    ctx.save();ctx.translate(-Math.round(cameraX),0);
    const scene=[
      ...furniture.filter(f=>f.x+f.w+12>cameraX&&f.x-12<cameraX+VW).map(f=>({depth:f.depth,f})),
      ...[...players,...npcs].filter(p=>p.alive&&p.x>cameraX-40&&p.x<cameraX+VW+40).map(p=>({depth:p.y,p}))
    ].sort((a,b)=>a.depth-b.depth||Number(!!a.f)-Number(!!b.f));
    for(const item of scene){
      // 紧跟对应 sprite 之后画描边；深度更大者随后绘制会自然盖住描边。
      if(item.f){const f=item.f;ctx.drawImage(furnitureSprites.get(f.id),f.x-12,f.y-40);if(f.container)drawInteractOutline('container',f);}
      else {sprite(item.p);if(item.p.npc)drawInteractOutline('npc',item.p);}
    }
    makeLabels();
    ctx.textAlign='center';
    for(const l of labels.slice().sort((a,b)=>Number(a.p.id===selectedId||a.p.id===0)-Number(b.p.id===selectedId||b.p.id===0))){
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
    // J 互动挥击弧：按 facing 在 self 上方画一个 260ms 的扇形。
    if(clock<swingUntil){
      const t=1-(swingUntil-clock)/.26,base=Math.atan2(facing.y,facing.x);
      ctx.save();ctx.globalAlpha=.6*(1-t);ctx.strokeStyle='#ffd76a';ctx.lineWidth=3;
      ctx.beginPath();ctx.arc(self.x,self.y-22,WORLD.PLAY_CONFIG.attackRange*.75,base-.6,base+.6);ctx.stroke();ctx.restore();
    }
    ctx.restore();
    $('zone-name').textContent=zones[Math.min(3,Math.floor(self.x/VW))];$('coordinate').textContent=`0${Math.min(4,Math.floor(self.x/VW)+1)} / 04`;
    updateExplorationHUD();updateGames();updateAttackUI();
  }
  function canvasPoint(e) {
    const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/VW,r.height/H);
    const ox=(r.width-VW*scale)/2,oy=(r.height-H*scale)/2;
    return {x:(e.clientX-r.left-ox)/scale+cameraX,y:(e.clientY-r.top-oy)/scale};
  }
  function showCandidates(ids) {
    closeExploration();clearPrivate(true);candidates=[...new Set(ids)].filter(id=>players[id].alive).sort((a,b)=>a-b);
    $('candidates').hidden=false;$('candidates').innerHTML=`<div class="panel-heading"><div><small>OVERLAPPING PLAYERS</small><h2>请选择目标</h2></div><button id="candidate-close" class="icon-button" aria-label="关闭重叠候选">×</button></div><p>同一点击点有${candidates.length}位玩家，不会自动选人。</p>${candidates.map(id=>row(publicProjection(players[id]))).join('')}`;
    bindRows($('candidates'));$('candidate-close').onclick=()=>{$('candidates').hidden=true;$('candidates').replaceChildren();candidates=[];};
  }
  canvas.addEventListener('click',e=>{
    const {x,y}=canvasPoint(e);
    makeLabels();
    const labelHits=labels.filter(l=>!l.npc&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h);
    const bodyHits=players.filter(p=>p.alive&&Math.abs(x-p.x)<=21&&y>=p.y-53&&y<=p.y+8&&!WORLD.pointOccluded(x,y,p,furniture)).map(p=>p.id);
    const hits=[...new Set([...labelHits.flatMap(l=>l.ids),...bodyHits])];
    if(hits.length>1)showCandidates(hits);
    else if(hits.length===1){
      const label=labelHits.find(l=>l.ids.includes(hits[0]));
      if(label&&y>=label.y+15)copySID(label.p.sid);
      else select(hits[0]);
    }else {
      const npc=npcs.filter(p=>Math.abs(x-p.x)<=21&&y>=p.y-53&&y<=p.y+8&&!WORLD.pointOccluded(x,y,p,furniture)||
        labels.some(l=>l.npc&&l.p.id===p.id&&x>=l.x&&x<=l.x+l.w&&y>=l.y&&y<=l.y+l.h)).sort((a,b)=>b.y-a.y)[0];
      const container=furniture.filter(f=>f.container&&x>=f.x&&x<=f.x+f.w&&y>=f.y&&y<=f.y+f.h).sort((a,b)=>b.depth-a.depth)[0];
      if(npc||container){
        if(!openExploration(npc?'npc':'container',(npc||container).id))showToast(self.alive?'请靠近后再互动（64 像素以内）':'已淘汰，无法探索');
      }else {closeExploration();clearPrivate(true);selectedId=null;renderTarget();renderRoster();}
    }
    canvas.focus();
  });
  function frame(now) {
    const begin=performance.now();step(Math.min(.05,(now-lastNow)/1000));lastNow=now;checkFinish();draw();
    if(Math.floor(clock)!==lastUI){lastUI=Math.floor(clock);updateSkillStatus();const rk=$('ranking');if(rk&&!rk.hidden)renderRanking();}
    timings.push(performance.now()-begin);if(timings.length>600)timings.shift();requestAnimationFrame(frame);
  }
  reset();draw();requestAnimationFrame(frame);
  // 显式启用测试时才提供诊断接口，正常地址不暴露权威状态或私密线索。
  if(new URLSearchParams(location.search).has('test')) {
    const explorationSnapshot=()=>({chips,searched:[...searched],clues:clues.map(c=>({...c})),
      panel:exploration?{...exploration}:null,result:explorationResult,alive:self.alive,
      nearby:nearbyEntities().map(({kind,entity})=>({kind,entityId:entity.id}))});
    window.__sidTest={
      reset,select,step,draw,
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
      snapshot:()=>({cameraX,clock,selectedId,exploration:explorationSnapshot(),covered:!!WORLD.coverFor(self,furniture),facing:{...facing},outlines:[...furniture.filter(f=>f.container).map(f=>({kind:'container',id:f.id,state:outlineState('container',f)})),...npcs.map(n=>({kind:'npc',id:n.id,state:outlineState('npc',n)}))],keys:[...keys],hold:holding(),myHeld,score:self.score,finishReason,ranking,rules:WORLD.RULES,scores:players.map(p=>({id:p.id,name:p.name,score:simScore(p),alive:p.alive})),projections:players.map(publicProjection),labels:labels.map(l=>({x:l.x,y:l.y,w:l.w,h:l.h,ids:l.ids})),mapIds:players.filter(p=>p.alive&&p.x>cameraX-40&&p.x<cameraX+VW+40).map(p=>p.id),self:{x:self.x,y:self.y,role:self.role,probes:self.probes,probeUntil:self.probeUntil,actionUntil:self.actionUntil,score:self.score},pending:pending?.kind,logs:logs.map(l=>l.text)}),
      setPosition:(x,y)=>{self.x=x;self.y=y;step(0);draw();},
      advance:seconds=>{clock+=seconds;updateSkillStatus();},
      secret:id=>({sid:players[id].sid.join('-'),role:players[id].role,hp:players[id].hp,alive:players[id].alive}),
      key:(code,on)=>on?keys.add(code):keys.delete(code),
      perf:()=>{const a=timings.slice().sort((a,b)=>a-b);return {frames:a.length,p95:a[Math.floor(a.length*.95)]||0,max:a[a.length-1]||0};},
      benchmark:()=>{const a=[];for(let i=0;i<600;i++){const t=performance.now();step(1/60);draw();a.push(performance.now()-t);}a.sort((a,b)=>a-b);return {frames:600,p95:a[570],max:a[599]};}
    };
  }
})();
