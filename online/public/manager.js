'use strict';
// 统一管理：所有修改均经管理员会话、同源与CSRF校验；不保存授权码，不自动重试写操作。
(() => {
  const $=id=>document.getElementById(id);
  let authed=false,csrf='',busy=false,loading=false,initialized=false,templates={},history=[],featuresLoaded=false;
  let templateSource='development'; // 仅记录表单值来源，不是运行模式。
  let clueStats=null,currentActivity=null,draftSlots=[],exportBusy=false;
  const uid=()=>globalThis.crypto?.randomUUID?.()||'op_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  const formatTime=t=>t?new Date(t).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'—';
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
  function showLogin(){authed=false;csrf='';initialized=false;featuresLoaded=false;$('manager-app').hidden=true;$('manager-login-card').hidden=false;$('manager-code').value='';}
  function showApp(){$('manager-app').hidden=false;$('manager-login-card').hidden=true;authed=true;}
  function fill(config){templateSource=config.template;draftSlots=(config.slots||[{id:'daily',label:'每日场',startTime:config.startTime,endTime:config.endTime}]).map(s=>({...s}));renderSlots();
    $('config-minutes').value=Math.floor(config.chargeIntervalMs/60000);$('config-seconds').value=config.chargeIntervalMs/1000%60;
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
    return{template:templateSource,slots:draftSlots.map(s=>({...s})),chargeIntervalMs:(min*60+sec)*1000,enabled:$('config-enabled').checked,
      clueIntervalMs:(cm*60+cs)*1000,cluePercent:percent,clueMin:low,clueMax:high};}
  function previewClues(){
    if(!clueStats){$('clue-preview').textContent='等待载入当前存活坏人数；预览不保存设置。';return;}
    try{const c=form();const n=clueStats.aliveBad;const count=n?Math.min(c.clueMax,Math.max(c.clueMin,Math.ceil(n*c.cluePercent/100)),clueStats.remaining):0;
      $('clue-preview').textContent=`表单预览（未保存）：当前存活坏人 ${n} 人，剩余可公布 ${clueStats.remaining} 项，按当前填写设置下一轮预计 ${count} 条。`;
    }catch(e){$('clue-preview').textContent=e.message;}
  }
  for(const id of ['clue-minutes','clue-seconds','clue-percent','clue-min','clue-max'])$(id).oninput=previewClues;
  function table(id,rows,total=false){const host=$(id);host.replaceChildren();
    for(const p of rows){const tr=document.createElement('tr');for(const value of [p.rank,p.name,p.score,total?p.sessions:(p.alive?'存活':'淘汰')]){const td=document.createElement('td');td.textContent=String(value??'—');tr.append(td);}host.append(tr);}
    if(!rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='暂无已归档成绩';tr.append(td);host.append(tr);}
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
    }catch(e){message.textContent=e.message+'；未自动重试。';}
    finally{if(link)link.remove();if(objectUrl)setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);exportBusy=false;$('scores-export').textContent='导出成绩 Excel';renderSession();}
  };
  async function load(){if(!authed||loading)return;loading=true;try{
    const data=await api('state'),a=data.activity;
    if(!a)throw Error('后台仍是旧版，请手动重启服务后使用管理员配置');
    currentActivity=a;templates=a.templates;$('manager-state').textContent=a.status;$('manager-counts').textContent=`玩家 ${data.current.playerCount} · 存活 ${data.current.aliveCount} · 日期 ${a.day||'尚未开局'}`;
    $('manager-storage').textContent=a.error|| (a.storageReady?'存档已启用 · 每场成绩独立保存，总分累加':'存档未启用，不能开启场次');
    $('current-session').textContent=a.session?`${a.session.label} · ${a.active?(a.paused?'已暂停':'进行中'):'已结算'} · 开始 ${formatTime(a.session.startedAt)} · 原定结束 ${formatTime(a.session.endsAt)}`:'当前无场次。可保存自动安排，或手动开测试场。';
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
    const signature=history.map(d=>d.roundId).join(',');
    if($('history-session').dataset.signature!==signature){$('history-session').dataset.signature=signature;$('history-session').replaceChildren();
      for(const item of history){const opt=document.createElement('option');opt.value=item.roundId;opt.textContent=`${item.day} · ${item.label} · ${formatTime(item.startedAt)}`;$('history-session').append(opt);}
      $('history-session').value=history.some(d=>d.roundId===selected)?selected:(history[0]?.roundId||'');
    }
    renderSession();table('daily-ranking',a.dailyRanking||[],true);table('total-ranking',a.totalRanking||[],true);
    if(!featuresLoaded){const f=await api('features');$('manager-features-list').replaceChildren();for(const item of f.features||[]){const label=document.createElement('label');label.className='admin-switch';const box=document.createElement('input');box.type='checkbox';box.dataset.feature=item.key;box.checked=!!item.enabled;label.append(box,document.createTextNode(item.label));$('manager-features-list').append(label);}featuresLoaded=true;}
    $('manager-tick').textContent='最近刷新 '+new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）';
  }catch(e){$('manager-storage').textContent=e.message;}finally{loading=false;}}
  async function mutate(path,body,messageId){if(busy)return;busy=true;const host=$(messageId);host.textContent='正在保存…';try{const data=await api(path,body);host.textContent='操作成功';await load();return data;}catch(e){host.textContent=e.message+'；未自动重试，请先核对当前状态。';}finally{busy=false;}}
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
    $('config-message').textContent=`已填入${name==='development'?'开发':'生产'}模板，尚未生效；点击「保存设置」后才会应用。`;
  };
  $('settings-form').onsubmit=e=>{e.preventDefault();try{save(form());}catch(err){$('config-message').textContent=err.message;}};
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
  $('manager-features-save').onclick=()=>{const features={};for(const box of document.querySelectorAll('[data-feature]'))features[box.dataset.feature]=box.checked;mutate('features',{features},'features-message');};
  $('manager-login-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{const data=await api('login',{code:$('manager-code').value});csrf=data.csrfToken;$('manager-code').value='';$('manager-login-error').textContent='';showApp();await load();}catch(err){$('manager-login-error').textContent=err.message;$('manager-code').value='';}finally{busy=false;}};
  $('manager-logout').onclick=async()=>{try{await api('logout',{});}finally{showLogin();}};
  api('session').then(data=>{if(data.authed){csrf=data.csrfToken;showApp();load();}else showLogin();}).catch(()=>showLogin());
  setInterval(()=>{if(authed&&!document.hidden)load();},5000);
})();
