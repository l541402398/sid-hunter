'use strict';
// 统一管理：所有修改均经管理员会话、同源与CSRF校验；不保存授权码，不自动重试写操作。
(() => {
  const $=id=>document.getElementById(id);
  const MODULE_META={
    'module-session':{nav:'nav-session',eyebrow:'OPERATIONS / 实时调度',title:'当前场次'},
    'module-settings':{nav:'nav-settings',eyebrow:'SCHEDULE & RULES / 参数配置',title:'排期与玩法'},
    'module-npc':{nav:'nav-npc',eyebrow:'SIMULATION / 角色投放',title:'NPC 投放'},
    'module-scores':{nav:'nav-scores',eyebrow:'ANALYTICS / 档案与导出',title:'成绩与榜单'},
    'module-flower-recipients':{nav:'nav-flower-recipients',eyebrow:'CAMPAIGN / 献花名单',title:'收花人名单'},
    'module-prizes':{nav:'nav-prizes',eyebrow:'REWARDS / 库存与概率',title:'实物奖品'},
    'module-quiz':{nav:'nav-quiz',eyebrow:'KNOWLEDGE BANK / 题库运维',title:'题库管理'},
    'module-minigames':{nav:'nav-minigames',eyebrow:'FEATURE FLAGS / 开放控制',title:'小游戏开关'}
  };
  const MODULE_TABS={
    'module-settings':{
      submenu:'submenu-settings',defaultTab:'schedule',
      tabs:{
        schedule:{subnav:'subnav-settings-schedule',tab:'tab-settings-schedule',pane:'pane-settings-schedule'},
        combat:{subnav:'subnav-settings-combat',tab:'tab-settings-combat',pane:'pane-settings-combat'},
        clues:{subnav:'subnav-settings-clues',tab:'tab-settings-clues',pane:'pane-settings-clues'}
      }
    },
    'module-scores':{
      submenu:'submenu-scores',defaultTab:'session',
      tabs:{
        session:{subnav:'subnav-scores-session',tab:'tab-scores-session',pane:'pane-scores-session'},
        daily:{subnav:'subnav-scores-daily',tab:'tab-scores-daily',pane:'pane-scores-daily'},
        total:{subnav:'subnav-scores-total',tab:'tab-scores-total',pane:'pane-scores-total'}
      }
    },
    'module-prizes':{
      submenu:'submenu-prizes',defaultTab:'config',
      tabs:{
        config:{subnav:'subnav-prizes-config',tab:'tab-prizes-config',pane:'pane-prizes-config'},
        claims:{subnav:'subnav-prizes-claims',tab:'tab-prizes-claims',pane:'pane-prizes-claims'}
      }
    },
    'module-quiz':{
      submenu:'submenu-quiz',defaultTab:'list',
      tabs:{
        list:{subnav:'subnav-quiz-list',tab:'tab-quiz-list',pane:'pane-quiz-list'},
        import:{subnav:'subnav-quiz-import',tab:'tab-quiz-import',pane:'pane-quiz-import'}
      }
    }
  };
  const MODULE_IDS=Object.keys(MODULE_META);
  const activeTabs={
    'module-settings':'schedule',
    'module-scores':'session',
    'module-prizes':'config',
    'module-quiz':'list'
  };
  let authed=false,csrf='',busy=false,loading=false,initialized=false,templates={},history=[],featuresLoaded=false,quizLoaded=false,quizList=[],flowerRecipientsLoaded=false;
  let templateSource='development'; // 仅记录表单值来源，不是运行模式。
  let clueStats=null,currentActivity=null,draftSlots=[],exportBusy=false,activeModule='module-session',toastTimer=null;
  const uid=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  const formatTime=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'—';
  const formatShortTime=t=>t?new Date(t).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false,hour:'2-digit',minute:'2-digit'}):'—';
  const toggleClass=(el,cls,on)=>{if(el&&el.classList&&typeof el.classList.toggle==='function')el.classList.toggle(cls,!!on);};
  const setAttr=(el,k,v)=>{if(!el||typeof el.setAttribute!=='function')return;if(v==null)el.removeAttribute?.(k);else el.setAttribute(k,v);};

  function showToast(text,kind='info'){
    const toast=$('manager-toast');
    if(!toast||!text)return;
    toast.textContent=text;
    toast.className='manager-toast'+(kind==='ok'?' is-ok':kind==='error'?' is-error':'');
    toast.hidden=false;
    if(toastTimer&&typeof clearTimeout==='function')clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>{toast.hidden=true;},3200);
  }

  function closeMobileNav(){
    toggleClass($('manager-sidebar'),'is-open',false);
    $('nav-backdrop').hidden=true;
    setAttr($('nav-toggle'),'aria-expanded','false');
  }

  function syncUrlHash(moduleId){
    if(typeof globalThis.history?.replaceState!=='function'||typeof globalThis.location?.pathname!=='string')return;
    const sub=MODULE_TABS[moduleId]?activeTabs[moduleId]:'';
    const hash=sub?`${moduleId}/${sub}`:moduleId;
    try{globalThis.history.replaceState(null,'',globalThis.location.pathname+'#'+hash);}catch{}
  }

  function selectSubTab(moduleId,tabKey,syncHash=true){
    const cfg=MODULE_TABS[moduleId];
    if(!cfg)return;
    const key=cfg.tabs[tabKey]?tabKey:cfg.defaultTab;
    activeTabs[moduleId]=key;
    for(const [k,ids] of Object.entries(cfg.tabs)){
      const isOn=k===key;
      $(ids.pane).hidden=!isOn;
      toggleClass($(ids.tab),'is-active',isOn);
      setAttr($(ids.tab),'aria-selected',String(isOn));
      toggleClass($(ids.subnav),'is-active',isOn);
      setAttr($(ids.subnav),'aria-current',isOn?'true':null);
    }
    if(syncHash&&activeModule===moduleId)syncUrlHash(moduleId);
  }

  function selectModule(moduleId,syncHash=true,subTab=null){
    if(!MODULE_META[moduleId])moduleId='module-session';
    activeModule=moduleId;
    for(const id of MODULE_IDS){
      const panel=$(id);
      const nav=$(MODULE_META[id].nav);
      const isOn=id===moduleId;
      panel.hidden=!isOn;
      toggleClass(nav,'is-active',isOn);
      setAttr(nav,'aria-current',isOn?'page':null);
      if(MODULE_TABS[id])$(MODULE_TABS[id].submenu).hidden=!isOn;
    }
    if(MODULE_TABS[moduleId])selectSubTab(moduleId,subTab||activeTabs[moduleId],false);
    const meta=MODULE_META[moduleId];
    $('active-module-eyebrow').textContent=meta.eyebrow;
    $('active-module-title').textContent=meta.title;
    closeMobileNav();
    if(syncHash)syncUrlHash(moduleId);
  }

  function initialRouteFromHash(){
    const raw=typeof globalThis.location?.hash==='string'?globalThis.location.hash.replace(/^#/,''):'';
    const [mod,sub]=raw.split('/');
    return {moduleId:MODULE_META[mod]?mod:'module-session',subTab:sub||null};
  }

  for(const id of MODULE_IDS){
    $(MODULE_META[id].nav).onclick=()=>selectModule(id,true);
  }
  for(const [moduleId,cfg] of Object.entries(MODULE_TABS)){
    for(const [tabKey,ids] of Object.entries(cfg.tabs)){
      $(ids.tab).onclick=()=>selectSubTab(moduleId,tabKey,true);
      $(ids.subnav).onclick=()=>selectModule(moduleId,true,tabKey);
    }
  }
  $('nav-toggle').onclick=()=>{
    const sidebar=$('manager-sidebar');
    const open=!(sidebar.classList&&sidebar.classList.contains('is-open'));
    toggleClass(sidebar,'is-open',open);
    $('nav-backdrop').hidden=!open;
    setAttr($('nav-toggle'),'aria-expanded',String(open));
  };
  $('nav-close').onclick=closeMobileNav;
  $('nav-backdrop').onclick=closeMobileNav;
  if(typeof document.addEventListener==='function'){
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMobileNav();});
  }

  // 登录密码显隐切换 & 快捷按钮绑定（纯浏览器增强，缺失 querySelectorAll 时安全跳过）
  $('manager-code-toggle').onclick=()=>{
    const input=$('manager-code');
    input.type=input.type==='password'?'text':'password';
  };
  if(typeof document.querySelectorAll==='function'){
    for(const btn of document.querySelectorAll('[data-jump]')){
      if(btn.dataset?.jump)btn.onclick=()=>selectModule(btn.dataset.jump,true);
    }
    for(const btn of document.querySelectorAll('[data-manual-minutes]')){
      if(btn.dataset?.manualMinutes)btn.onclick=()=>{$('manual-minutes').value=btn.dataset.manualMinutes;};
    }
  }
  function syncFloorPills(){
    const current=String($('npc-floor').value||'1');
    const wrap=$('npc-floor-pills');
    if(!wrap||typeof wrap.querySelectorAll!=='function')return;
    for(const pill of wrap.querySelectorAll('[data-floor]')){
      toggleClass(pill,'is-active',pill.dataset?.floor===current);
    }
  }
  if($('npc-floor-pills')&&typeof $('npc-floor-pills').querySelectorAll==='function'){
    for(const pill of $('npc-floor-pills').querySelectorAll('[data-floor]')){
      pill.onclick=()=>{$('npc-floor').value=pill.dataset.floor;syncFloorPills();};
    }
  }
  $('npc-floor').onchange=syncFloorPills;

  function updateClock(){
    const el=$('beijing-clock');
    if(!el)return;
    el.textContent='UTC+8 '+new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  }

  function renderSlots(){
    const root=$('schedule-slots');root.replaceChildren();
    for(const s of draftSlots){
      const row=document.createElement('div');row.className='admin-slot-row';
      for(const [key,caption,type] of [['label','场次名称','text'],['startTime','开始','time'],['endTime','结束','time']]){
        const label=document.createElement('label');label.append(document.createTextNode(caption));const input=document.createElement('input');input.type=type;input.value=s[key];input.required=true;if(type==='text')input.maxLength=40;
        input.oninput=()=>{s[key]=input.value;};label.append(input);row.append(label);
      }
      const del=document.createElement('button');del.type='button';del.textContent='移除';del.disabled=draftSlots.length===1;del.onclick=()=>{draftSlots=draftSlots.filter(v=>v!==s);renderSlots();};row.append(del);root.append(row);
    }
  }
  $('schedule-add').onclick=()=>{if(draftSlots.length>=12)return;draftSlots.push({id:uid().slice(0,48),label:'新增场次',startTime:'14:00',endTime:'17:00'});renderSlots();};
  async function api(path,body) {
    const r=await fetch('/api/manager/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',
      headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify({...body,csrfToken:csrf})});
    const data=await r.json();
    if(r.status===401&&path!=='login'){showLogin();throw Error('管理会话已过期，请重新登录');}
    if(!r.ok||data.ok===false)throw Error(data.error||'操作失败');
    return data;
  }
  function showLogin(){
    authed=false;csrf='';initialized=false;featuresLoaded=false;quizLoaded=false;flowerRecipientsLoaded=false;prizeFormFilled=false;
    $('manager-app').hidden=true;$('manager-login-card').hidden=false;$('manager-code').value='';$('manager-code').type='password';
    closeMobileNav();
  }
  function showApp(){
    $('manager-app').hidden=false;$('manager-login-card').hidden=true;authed=true;
    const route=initialRouteFromHash();
    selectModule(route.moduleId,false,route.subTab);
    updateClock();
  }
  function fill(config){templateSource=config.template;draftSlots=(config.slots||[{id:'daily',label:'每日场',startTime:config.startTime,endTime:config.endTime}]).map(s=>({...s}));renderSlots();
    $('config-minutes').value=Math.floor(config.chargeIntervalMs/60000);$('config-seconds').value=config.chargeIntervalMs/1000%60;
    const goodCd=config.goodChargeIntervalMs||config.chargeIntervalMs, badCd=config.badChargeIntervalMs||config.chargeIntervalMs;
    $('good-cd-minutes').value=Math.floor(goodCd/60000);$('good-cd-seconds').value=goodCd/1000%60;
    $('bad-cd-minutes').value=Math.floor(badCd/60000);$('bad-cd-seconds').value=badCd/1000%60;
    $('config-initial-hp').value=config.initialHp||3;
    $('config-protect-seconds').value=Math.floor((config.protectMs||300000)/1000);
    $('clue-minutes').value=Math.floor(config.clueIntervalMs/60000);$('clue-seconds').value=config.clueIntervalMs/1000%60;
    $('clue-percent').value=config.cluePercent;$('clue-min').value=config.clueMin;$('clue-max').value=config.clueMax;
    if(typeof config.enabled==='boolean')$('config-enabled').checked=config.enabled;
    previewClues();
  }
  function form(){const min=Number($('config-minutes').value),sec=Number($('config-seconds').value);
    if(!Number.isInteger(min)||!Number.isInteger(sec)||min<0||sec<0||sec>59)throw Error('请输入有效的分钟和秒');
    const cm=Number($('clue-minutes').value),cs=Number($('clue-seconds').value),percent=Number($('clue-percent').value),low=Number($('clue-min').value),high=Number($('clue-max').value);
    if(!Number.isInteger(cm)||!Number.isInteger(cs)||cm<0||cs<0||cs>59||(cm*60+cs)<1||(cm*60+cs)>86400)throw Error('公布间隔需为1秒至24小时，秒数0–59');
    if(!Number.isFinite(percent)||percent<=0||percent>100||!Number.isSafeInteger(low)||!Number.isSafeInteger(high)||low<1||high<low||high>1000)throw Error('线索比例需大于0且不超过100%，条数为1–1000且最高不小于最低');
    const gMin=Number($('good-cd-minutes')?.value??min),gSec=Number($('good-cd-seconds')?.value??sec);
    const bMin=Number($('bad-cd-minutes')?.value??min),bSec=Number($('bad-cd-seconds')?.value??sec);
    const initialHp=Number($('config-initial-hp')?.value??3),protectSec=Number($('config-protect-seconds')?.value??300);
    if(!Number.isInteger(initialHp)||initialHp<1||initialHp>20)throw Error('初始对抗生命需为1–20');
    if(!Number.isInteger(protectSec)||protectSec<0||protectSec>86400)throw Error('受击保护需为0–86400秒');
    return{template:templateSource,slots:draftSlots.map(s=>({...s})),chargeIntervalMs:(min*60+sec)*1000,
      goodChargeIntervalMs:(gMin*60+gSec)*1000,badChargeIntervalMs:(bMin*60+bSec)*1000,
      initialHp,protectMs:protectSec*1000,enabled:$('config-enabled').checked,
      clueIntervalMs:(cm*60+cs)*1000,cluePercent:percent,clueMin:low,clueMax:high};}
  function previewClues(){
    if(!clueStats){$('clue-preview').textContent='等待载入当前存活坏人数；预览不保存设置。';return;}
    try{const c=form();const n=clueStats.aliveBad;const count=n?Math.min(c.clueMax,Math.max(c.clueMin,Math.ceil(n*c.cluePercent/100)),clueStats.remaining):0;
      $('clue-preview').textContent=`表单预览（未保存）：当前存活坏人 ${n} 人，剩余可公布 ${clueStats.remaining} 项，按当前填写设置下一轮预计 ${count} 条。`;
    }catch(e){$('clue-preview').textContent=e.message;}
  }
  for(const id of ['clue-minutes','clue-seconds','clue-percent','clue-min','clue-max'])$(id).oninput=previewClues;
  function table(id,rows,total=false){
    const host=$(id);host.replaceChildren();
    for(const p of rows){
      const tr=document.createElement('tr');
      const rankTd=document.createElement('td');
      const rankBadge=document.createElement('span');
      const r=Number(p.rank);
      rankBadge.className='rank-badge'+(r===1?' is-top1':r===2?' is-top2':r===3?' is-top3':'');
      rankBadge.textContent=String(p.rank??'—');
      rankTd.append(rankBadge);
      const nameTd=document.createElement('td');nameTd.textContent=String(p.name??'—');
      const scoreTd=document.createElement('td');scoreTd.className='score-cell';scoreTd.textContent=String(p.score??'—');
      const tailTd=document.createElement('td');
      if(total){
        tailTd.textContent=String(p.sessions??'—');
      }else{
        const pill=document.createElement('span');
        pill.className='cell-pill '+(p.alive?'is-alive':'is-truce');
        pill.textContent=p.alive?'对抗中':'休战中';
        tailTd.append(pill);
      }
      tr.append(rankTd,nameTd,scoreTd,tailTd);
      host.append(tr);
    }
    if(!rows.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=4;td.className='manager-table-empty';td.textContent='暂无已归档成绩';
      tr.append(td);host.append(tr);
    }
  }
  function renderSession(){
    const selected=history.find(d=>d.roundId===$('history-session').value);
    table('session-ranking',selected?.ranking||[]);
    $('scores-export').disabled=exportBusy||!selected;
  }
  $('scores-export').onclick=async()=>{
    if(exportBusy||!authed)return;
    const roundId=$('history-session').value;if(!history.some(r=>r.roundId===roundId))return;
    exportBusy=true;$('scores-export').disabled=true;$('scores-export').textContent='正在导出…';
    const message=$('scores-export-message');message.textContent='正在生成已归档成绩工作簿…';
    let objectUrl=null,link=null;
    try{
      const response=await fetch('/api/manager/export-scores?roundId='+encodeURIComponent(roundId),{credentials:'same-origin',cache:'no-store'});
      if(!response.ok){let error={};try{error=await response.json();}catch{}
        if(response.status===401)showLogin();throw Error(error.error||'导出失败，请确认管理员会话和所选场次');}
      if(!response.headers.get('Content-Type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))throw Error('后台未返回Excel文件，请确认已升级新版服务');
      const blob=await response.blob();if(!blob.size)throw Error('导出文件为空');
      const disposition=response.headers.get('Content-Disposition')||'';
      const filename=disposition.match(/filename="([a-zA-Z0-9_.-]+\.xlsx)"/)?.[1]||'S-ID-scores.xlsx';
      objectUrl=URL.createObjectURL(blob);link=document.createElement('a');link.href=objectUrl;link.download=filename;
      document.body.append(link);link.click();message.textContent='Excel已生成并发起下载，请在浏览器下载记录查看。';
      showToast(`已发起下载 ${filename}`,'ok');
    }catch(e){message.textContent=e.message+'；未自动重试。';showToast(e.message,'error');}
    finally{if(link)link.remove();if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);exportBusy=false;$('scores-export').textContent='导出成绩 Excel';renderSession();}
  };
  async function load(){if(!authed||loading)return;loading=true;try{
    const data=await api('state'),a=data.activity;
    if(!a)throw Error('后台仍是旧版，请手动重启服务后使用管理员配置');
    currentActivity=a;templates=a.templates;
    const isLive=!!a.active&&!a.paused,isPaused=!!a.active&&!!a.paused;
    $('manager-state').textContent=a.status;
    toggleClass($('manager-state'),'is-live',isLive);
    toggleClass($('manager-state'),'is-paused',isPaused);
    $('manager-counts').textContent=`玩家 ${data.current.playerCount} · 存活 ${data.current.aliveCount} · 日期 ${a.day||'尚未开局'}`;

    // 左侧边栏实时脉搏与徽章同步
    const dot=$('sidebar-status-dot');
    dot.className='pulse-dot '+(isLive?'is-live':isPaused?'is-paused':'is-idle');
    $('sidebar-status-text').textContent=a.status;
    $('sidebar-player-summary').textContent=`在线 ${data.current.playerCount} · 存活 ${data.current.aliveCount}`;
    const badgeSession=$('badge-session');
    badgeSession.textContent=isLive?'进行中':isPaused?'已暂停':'休场';
    badgeSession.className='nav-badge'+(isLive?' is-live':isPaused?' is-paused':'');
    $('badge-settings').textContent=a.config?.enabled?'自动':'手动';

    const storageOk=!a.error&&!!a.storageReady;
    $('manager-storage').textContent=a.error||(a.storageReady?'存档已启用 · 每场成绩独立保存，总分累加':'存档未启用，不能开启场次');
    toggleClass($('storage-card'),'is-error',!storageOk);

    // Hero 控制舱数据
    const statePill=$('session-state-pill');
    statePill.textContent=isLive?'LIVE · 进行中':isPaused?'PAUSED · 已暂停':'STANDBY · 当前休场';
    statePill.className='hero-kicker'+(isLive?' is-live':isPaused?' is-paused':'');
    $('session-hero-title').textContent=a.session?a.session.label:'当前无进行中场次';
    $('current-session').textContent=a.session?`${a.session.label} · ${a.active?(a.paused?'已暂停':'进行中'):'已结算'} · 开始 ${formatTime(a.session.startedAt)} · 原定结束 ${formatTime(a.session.endsAt)}`:'当前无场次。可保存自动安排，或手动开测试场。';
    $('kpi-players').textContent=String(data.current.playerCount??0);
    $('kpi-alive').textContent=String(data.current.aliveCount??0);
    $('kpi-started').textContent=a.session?formatShortTime(a.session.startedAt):'—';
    $('kpi-ends').textContent=a.session?formatShortTime(a.session.endsAt):'—';

    $('session-pause').hidden=!!a.paused;$('session-pause').disabled=!a.active;
    $('session-resume').hidden=!a.paused;$('session-resume').disabled=!a.active;
    $('session-finish').disabled=!a.active;$('session-start').disabled=!!a.active;
    $('schedule-effective').textContent=a.scheduleEffective==='tomorrow'?'已保存的新安排明天生效；今日仍使用原安排，本场结束时间不变。':'当前显示的已保存安排可用于今日。今天开过场后再改安排，将从次日生效。';
    clueStats=a.cluePublication||null;
    if(!initialized){fill(a.config);initialized=true;}
    previewClues();
    const due=clueStats?.nextAt?new Date(clueStats.nextAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'今日无待执行公布（未开启、已结束或已超过当日截止时间）';
    $('clue-live').textContent=clueStats?`已生效设置：按当前人数下轮预计 ${clueStats.count} 条；下次公布：${due}；上轮实际公布 ${clueStats.lastCount||0} 条。`:'当前后台未支持定时系统公布，请维护重启新版后台。';
    if(clueStats?.paused)$('clue-live').textContent=`线索计时已暂停，剩余约 ${Math.ceil((clueStats.remainingMs||0)/1000)} 秒，继续本场后接着计时。`;
    const selected=$('history-session').value;history=a.history||[];
    $('badge-scores').textContent=String(history.length);
    const signature=history.map(d=>d.roundId).join(',');
    if($('history-session').dataset.signature!==signature){$('history-session').dataset.signature=signature;$('history-session').replaceChildren();
      for(const item of history){const opt=document.createElement('option');opt.value=item.roundId;opt.textContent=`${item.day} · ${item.label} · ${formatTime(item.startedAt)}`;$('history-session').append(opt);}
      $('history-session').value=history.some(d=>d.roundId===selected)?selected:(history[0]?.roundId||'');
    }
    renderSession();table('daily-ranking',a.dailyRanking||[],true);table('total-ranking',a.totalRanking||[],true);
    if(!featuresLoaded){
      const f=await api('features');
      const list=f.features||[];
      renderFeatures(list);
      featuresLoaded=true;
    }
    if(!quizLoaded){await loadQuiz();quizLoaded=true;}
    if(!flowerRecipientsLoaded){await loadFlowerRecipients();flowerRecipientsLoaded=true;}
    await loadPrizes();
    updateClock();
    $('manager-tick').textContent='最近刷新 '+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
  }catch(e){
    $('manager-storage').textContent=e.message;
    toggleClass($('storage-card'),'is-error',true);
  }finally{loading=false;}}

  function renderFeatures(list){
    const root=$('manager-features-list');
    root.replaceChildren();
    let onCount=0;
    for(const item of list){
      if(item.enabled)onCount++;
      const card=document.createElement('label');
      card.className='admin-switch feature-card';
      const copy=document.createElement('div');
      copy.className='feature-card-copy';
      const head=document.createElement('div');
      head.className='feature-card-head';
      const title=document.createElement('strong');
      title.textContent=item.label||item.key;
      head.append(title);
      if(item.players){
        const pTag=document.createElement('span');
        pTag.className='tag-chip';
        pTag.textContent=item.players;
        head.append(pTag);
      }
      if(typeof item.implemented==='boolean'){
        const sTag=document.createElement('span');
        sTag.className='tag-chip '+(item.implemented?'is-emerald':'is-amber');
        sTag.textContent=item.implemented?'已实装':'规划中';
        head.append(sTag);
      }
      copy.append(head);
      if(item.desc){
        const desc=document.createElement('span');
        desc.className='feature-card-desc';
        desc.textContent=item.desc;
        copy.append(desc);
      }
      const box=document.createElement('input');
      box.type='checkbox';
      box.dataset.feature=item.key;
      box.checked=!!item.enabled;
      card.append(copy,box);
      root.append(card);
    }
    $('badge-minigames').textContent=`${onCount}/${list.length}`;
  }

  async function mutate(path,body,messageId){
    if(busy)return;busy=true;
    const host=$(messageId);host.textContent='正在保存…';
    try{
      const data=await api(path,body);
      host.textContent='操作成功';
      showToast('操作已保存并生效','ok');
      await load();
      return data;
    }catch(e){
      host.textContent=e.message+'；未自动重试，请先核对当前状态。';
      showToast(e.message,'error');
    }finally{busy=false;}
  }
  async function loadFlowerRecipients() {
    const data = await api('flower-recipients');
    const list = data.recipients || [];
    $('flower-recipients').value = list.map(p => p.empNo + (p.name ? ',' + p.name : '')).join('\n');
    $('flower-recipients-summary').textContent = `已保存 ${list.length} 位收花人，按工号匹配；名单不会随新场次清空。`;
    $('badge-flowers').textContent = String(list.length);
  }
  $('flower-recipients-save').onclick = async () => {
    if (busy || !authed) return;
    try {
      const recipients = $('flower-recipients').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const fields = line.split(/[,，\t]/).map(v => v.trim());
        if (fields.length > 2) throw Error('每行只填写工号和姓名，用逗号或制表符分隔');
        return { empNo: fields[0], name: fields[1] || '' };
      });
      if (!confirm('确认保存收花人名单？立即生效；不会清空本场已有鲜花或积分。')) return;
      const result = await mutate('flower-recipients', { recipients, confirm: true }, 'flower-recipients-message');
      if (result) {
        $('flower-recipients-summary').textContent = `已保存 ${result.recipients.length} 位收花人，名单已生效。`;
        $('badge-flowers').textContent = String(result.recipients.length);
      }
    } catch (error) { $('flower-recipients-message').textContent = error.message; showToast(error.message,'error'); }
  };
  async function save(config){
    if(!confirm('确认保存设置？不会暂停或结算当前场。今天已开过场则时段/自动开局修改从明天生效；若今天尚未开场且处于启用时段，可能立即开局。技能周期下轮生效，线索间隔修改重新计时。'))return;
    const result=await mutate('config',{config,confirm:true},'config-message');if(result){fill(result.config);$('config-message').textContent=result.message||'设置已保存，当前场未结束。';}
  }
  for(const name of ['development','production'])$('template-'+name).onclick=()=>{
    const preset=templates[name];
    if(!preset){$('config-message').textContent='模板尚未载入，请稍后再试';return;}
    // 模板只填时间与恢复周期；即便服务端模板带enabled字段，也不能修改启闭草稿。
    const enabled=$('config-enabled').checked;
    fill({...preset,enabled});
    const label=name==='development'?'开发':'生产';
    $('config-message').textContent=`已填入${label}模板，尚未生效；点击「保存设置」后才会应用。`;
    showToast(`已填入${label}模板草稿，请点击保存设置生效`,'info');
  };
  $('settings-form').onsubmit=e=>{
    e.preventDefault();
    try{save(form());}
    catch(err){
      const msg=String(err.message||'');
      if(/公布|线索/.test(msg))selectSubTab('module-settings','clues',true);
      else if(/分钟|生命|保护/.test(msg))selectSubTab('module-settings','combat',true);
      $('config-message').textContent=msg;showToast(msg,'error');
    }
  };
  // 场次操作绝不提交表单草稿；使用已展示的场次版本，迟到指令不能误结算新场。
  async function control(action){
    if(busy||!currentActivity)return;
    const descriptions={pause:'暂停当前场？技能恢复和线索计时一起暂停，但结束时间不顺延。',resume:'继续当前场？恢复剩余计时，原定截止时间不变。',finish:'立即结算当前场并计入总分？本场不可继续；后续场次安排不变。',start:'确认手动开新场？身份/资源重新分配，旧场成绩保留，本场也会计入总分；不会保存设置草稿。'};
    const expectedRoundId=currentActivity.currentRoundId;
    if(!confirm(descriptions[action]))return;
    await mutate('control',{action,expectedRoundId,confirm:true,commandId:uid(),minutes:Number($('manual-minutes').value),label:$('manual-label').value},'session-message');
  }
  $('session-pause').onclick=()=>control('pause');$('session-resume').onclick=()=>control('resume');
  $('session-finish').onclick=()=>control('finish');$('session-start').onclick=()=>control('start');
  for(const faction of ['good','bad'])$('npc-'+faction).onclick=()=>mutate('npc',{faction,count:Number($('npc-count').value),floorId:Number($('npc-floor').value)},'npc-message');
  $('history-session').onchange=renderSession;
  $('manager-features-save').onclick=async()=>{
    const features={};
    for(const box of document.querySelectorAll('[data-feature]'))features[box.dataset.feature]=box.checked;
    const res=await mutate('features',{features},'features-message');
    if(res&&Array.isArray(res.features))renderFeatures(res.features);
  };
  function renderQuizSummary(summary){
    const el=$('quiz-summary');if(!el||!summary)return;
    const by=summary.byType||{};
    const cats=(summary.categories||[]).join('、')||'默认';
    el.textContent=`当前题库：共 ${summary.total||0} 题（启用 ${summary.enabled||0} 题 / 停用 ${summary.disabled||0} 题） · 单选 ${by.single||0} 题 / 多选 ${by.multiple||0} 题 / 判断 ${by.judge||0} 题 · 题目类别：${cats}`;
    $('quiz-kpi-total').textContent=`共 ${summary.total||0} 题`;
    $('quiz-kpi-enabled').textContent=`启用 ${summary.enabled||0}`;
    $('quiz-kpi-disabled').textContent=`停用 ${summary.disabled||0}`;
    $('badge-quiz').textContent=String(summary.enabled??summary.total??0);
  }
  function renderQuizTable(){
    const tbody=$('quiz-table-body');if(!tbody)return;
    tbody.replaceChildren();
    const filterType=$('quiz-filter-type')?.value||'';
    const kw=($('quiz-filter-keyword')?.value||'').trim().toLowerCase();
    const filtered=quizList.filter(q=>{
      if(filterType&&q.type!==filterType)return false;
      if(!kw)return true;
      return String(q.id||'').toLowerCase().includes(kw)||String(q.category||'').toLowerCase().includes(kw)||String(q.stem||'').toLowerCase().includes(kw);
    });
    $('quiz-filtered-count').textContent=`显示 ${filtered.length} 题`;
    if(!filtered.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=10;td.className='manager-table-empty';td.textContent='没有符合筛选条件的题目';
      tr.append(td);tbody.append(tr);return;
    }
    for(const q of filtered){
      const tr=document.createElement('tr');
      const typeText=q.type==='multiple'?'多选':(q.type==='judge'?'判断':'单选');
      const typeCls=q.type==='multiple'?'is-type-multiple':(q.type==='judge'?'is-type-judge':'is-type-single');
      const optMap={};
      if(q.type!=='judge'&&Array.isArray(q.options)){for(const o of q.options)optMap[o.key]=o.text??'';}
      const ansText=q.type==='judge'?(q.answer==='T'?'正确':'错误'):(Array.isArray(q.answer)?q.answer.join(','):String(q.answer||''));
      const idTd=document.createElement('td');idTd.textContent=String(q.id??'');tr.append(idTd);
      const catTd=document.createElement('td');catTd.textContent=String(q.category||'十五五规划');tr.append(catTd);
      const typeTd=document.createElement('td');const typePill=document.createElement('span');typePill.className='cell-pill '+typeCls;typePill.textContent=typeText;typeTd.append(typePill);tr.append(typeTd);
      for(const [val,cls] of [[q.stem,'quiz-col-stem'],[optMap.A||'—','quiz-col-opt'],[optMap.B||'—','quiz-col-opt'],[optMap.C||'—','quiz-col-opt'],[optMap.D||'—','quiz-col-opt']]){
        const td=document.createElement('td');td.className=cls;td.textContent=String(val??'');tr.append(td);
      }
      const ansTd=document.createElement('td');const ansPill=document.createElement('span');ansPill.className='quiz-ans-badge';ansPill.textContent=ansText;ansTd.append(ansPill);tr.append(ansTd);
      const actionTd=document.createElement('td');
      const btn=document.createElement('button');
      btn.type='button';
      const isEn=q.enabled!==false&&q.status!=='停用';
      btn.className='quiz-status-btn '+(isEn?'is-enabled':'is-disabled');
      btn.textContent=isEn?'启用（点击停用）':'停用（点击启用）';
      btn.onclick=async()=>{
        if(busy)return;busy=true;
        try{
          const r=await api('quiz-toggle',{id:q.id,enabled:!isEn});
          quizList=r.questions||[];renderQuizSummary(r.summary);renderQuizTable();
          $('quiz-message').textContent=r.message||'状态已更新';
          showToast(r.message||'题目状态已更新','ok');
        }catch(err){$('quiz-message').textContent=err.message;showToast(err.message,'error');}
        finally{busy=false;}
      };
      actionTd.append(btn);tr.append(actionTd);tbody.append(tr);
    }
  }
  // 实物奖品：每次刷新更新库存表与中奖记录；表单只在首次载入或保存成功后回填，避免覆盖正在编辑的草稿。
  let prizeItems=[],prizeFormFilled=false;
  const channelText={explore:'探索开箱',hammer:'J 命中'};
  function cell(row,text){const td=document.createElement('td');td.textContent=String(text);row.append(td);}
  function renderPrizes(p){
    prizeItems=p.items||[];
    const activeDrop=(p.chances.explore>0||p.chances.hammer>0)&&p.totals.remaining>0;
    $('prize-kpi-stock').textContent=String(p.totals.stock);
    $('prize-kpi-claimed').textContent=String(p.totals.claimed);
    $('prize-kpi-remaining').textContent=String(p.totals.remaining);
    $('prize-kpi-status').textContent=activeDrop?'投放中':'未开启';
    toggleClass($('prize-kpi-status-card'),'is-emerald',activeDrop);
    $('badge-prizes').textContent=String(p.totals.remaining);
    $('prize-summary').textContent=`总库存 ${p.totals.stock} · 已发出 ${p.totals.claimed} · 剩余 ${p.totals.remaining} · 探索概率 ${p.chances.explore} · J 概率 ${p.chances.hammer}`+(activeDrop?'':'（当前不会发放）');
    $('prize-items-table').replaceChildren();
    if(!prizeItems.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=4;td.className='manager-table-empty';td.textContent='尚未配置奖品品类';tr.append(td);$('prize-items-table').append(tr);
    }else{
      for(const i of prizeItems){const row=document.createElement('tr');cell(row,i.name);cell(row,i.stock);cell(row,i.claimed);cell(row,i.remaining);$('prize-items-table').append(row);}
    }
    $('prize-claims').replaceChildren();
    const claims=p.claims||[];
    $('badge-prize-claims').textContent=String(claims.length);
    if(!claims.length){
      const tr=document.createElement('tr'),td=document.createElement('td');
      td.colSpan=5;td.className='manager-table-empty';td.textContent='暂无中奖记录';tr.append(td);$('prize-claims').append(tr);
    }else{
      for(const c of claims){
        const row=document.createElement('tr');
        cell(row,formatTime(c.at));cell(row,c.playerName||'');cell(row,c.empNo||'—');cell(row,c.prizeName);
        const chTd=document.createElement('td');
        const pill=document.createElement('span');
        pill.className='cell-pill '+(c.channel==='hammer'?'is-hammer':'is-explore');
        pill.textContent=channelText[c.channel]||c.channel;
        chTd.append(pill);row.append(chTd);
        $('prize-claims').append(row);
      }
    }
    if(!prizeFormFilled){
      $('prize-items').value=prizeItems.map(i=>`${i.name},${i.stock}`).join('\n');
      $('prize-chance-explore').value=p.chances.explore;$('prize-chance-hammer').value=p.chances.hammer;
      $('prize-hammer-target').value=p.hammerLimits.perTargetDaily;$('prize-hammer-daily').value=p.hammerLimits.dailyCap;
      prizeFormFilled=true;
    }
  }
  async function loadPrizes(){try{const data=await api('prizes');if(data&&data.prizes)renderPrizes(data.prizes);}catch(e){$('prize-summary').textContent='奖品池载入失败：'+e.message;}}
  function prizeForm(){
    const byName=new Map(prizeItems.map(i=>[i.name,i.id]));
    const items=String($('prize-items').value||'').split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
      const m=line.match(/^(.+?)[,，]\s*(\d+)$/);if(!m)throw Error(`无法识别：「${line}」，格式应为「名称,库存」`);
      const name=m[1].trim();return {...(byName.has(name)?{id:byName.get(name)}:{}),name,stock:Number(m[2])};
    });
    return {items,chances:{explore:Number($('prize-chance-explore').value),hammer:Number($('prize-chance-hammer').value)},
      hammerLimits:{perTargetDaily:Number($('prize-hammer-target').value),dailyCap:Number($('prize-hammer-daily').value)}};
  }
  $('prize-save').onclick=async()=>{
    let body;try{body=prizeForm();}catch(e){$('prize-message').textContent=e.message;showToast(e.message,'error');return;}
    if(!confirm('确认保存奖品配置？立即生效；已中奖记录不受影响。'))return;
    const result=await mutate('prizes',body,'prize-message');
    if(result&&result.prizes){prizeFormFilled=false;renderPrizes(result.prizes);$('prize-message').textContent='奖品配置已保存';}
  };
  async function loadQuiz(){
    try{
      const r=await api('quiz');
      quizList=r.questions||[];renderQuizSummary(r.summary);renderQuizTable();
    }catch(err){$('quiz-summary').textContent='载入题库失败：'+err.message;}
  }
  async function downloadQuizWorkbook(endpoint,fallbackName){
    if(!authed)return;
    const msg=$('quiz-message');msg.textContent='正在生成 Excel 文件…';
    let objectUrl=null,link=null;
    try{
      const response=await fetch('/api/manager/'+endpoint,{credentials:'same-origin',cache:'no-store'});
      if(!response.ok){let error={};try{error=await response.json();}catch{}
        if(response.status===401)showLogin();throw Error(error.error||'下载失败');}
      const blob=await response.blob();if(!blob.size)throw Error('文件为空');
      const disposition=response.headers.get('Content-Disposition')||'';
      const filename=disposition.match(/filename="([a-zA-Z0-9_.-]+\.xlsx)"/)?.[1]||fallbackName;
      objectUrl=URL.createObjectURL(blob);link=document.createElement('a');link.href=objectUrl;link.download=filename;
      document.body.append(link);link.click();msg.textContent=`已生成并下载 ${filename}`;
      showToast(`已下载 ${filename}`,'ok');
    }catch(e){msg.textContent=e.message;showToast(e.message,'error');}
    finally{if(link)link.remove();if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);}
  }
  $('quiz-template-btn').onclick=()=>downloadQuizWorkbook('quiz-template','S-ID-quiz-template.xlsx');
  $('quiz-export-btn').onclick=()=>downloadQuizWorkbook('quiz-export','S-ID-quiz-bank.xlsx');
  $('quiz-filter-type').onchange=renderQuizTable;
  $('quiz-filter-keyword').oninput=renderQuizTable;
  $('quiz-import-btn').onclick=async()=>{
    if(busy||!authed)return;
    const fileInput=$('quiz-file');
    const file=fileInput?.files?.[0];
    const msg=$('quiz-message');
    if(!file){msg.textContent='请先选择需要导入的 .xlsx 或 .csv 题库文件';return;}
    const mode=$('quiz-import-mode')?.value==='replace'?'replace':'merge';
    if(mode==='replace'&&!confirm('确认以「全量覆盖」方式导入？这会清空现有题库并替换为本次上传文件中的题目。'))return;
    busy=true;$('quiz-import-btn').disabled=true;$('quiz-import-btn').textContent='正在导入…';
    msg.textContent=`正在解析并导入「${file.name}」…`;
    try{
      const contentBase64=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(String(reader.result||''));
        reader.onerror=()=>reject(new Error('读取本地文件失败'));
        reader.readAsDataURL(file);
      });
      const r=await api('quiz-import',{fileName:file.name,contentBase64,mode});
      quizList=r.questions||[];renderQuizSummary(r.summary);renderQuizTable();
      msg.textContent=r.message||'题库导入成功';
      showToast('题库导入成功','ok');
      fileInput.value='';
    }catch(err){
      msg.textContent='导入失败：'+err.message;
      showToast(err.message,'error');
    }finally{
      busy=false;$('quiz-import-btn').disabled=false;$('quiz-import-btn').textContent='上传并导入题库';
    }
  };
  $('manager-login-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const data=await api('login',{code:$('manager-code').value});csrf=data.csrfToken;$('manager-code').value='';$('manager-login-error').textContent='';showApp();await load();}catch(err){$('manager-login-error').textContent=err.message;$('manager-code').value='';}finally{busy=false;}};
  $('manager-logout').onclick=async()=>{try{await api('logout',{});}finally{showLogin();}};
  api('session').then(data=>{if(data.authed){csrf=data.csrfToken;showApp();load();}else showLogin();}).catch(()=>showLogin());
  setInterval(()=>{if(authed&&!document.hidden)updateClock();},1000);
  setInterval(()=>{if(authed&&!document.hidden)load();},5000);
})();
