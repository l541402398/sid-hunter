'use strict';
// 场次是存档/计分唯一单位；日期只用于分组。无额外后台进程或计时器。
const { createHash } = require('node:crypto');
const DEFAULT_SLOTS = [{ id:'daily',label:'每日场',startTime:'09:00',endTime:'17:00' }];
const TEMPLATES = Object.freeze({
  development: Object.freeze({template:'development',startTime:'09:00',endTime:'17:00',slots:DEFAULT_SLOTS,chargeIntervalMs:90000,clueIntervalMs:120000,cluePercent:20,clueMin:1,clueMax:5}),
  production: Object.freeze({template:'production',startTime:'09:00',endTime:'17:00',slots:DEFAULT_SLOTS,chargeIntervalMs:1200000,clueIntervalMs:1800000,cluePercent:20,clueMin:1,clueMax:5})
});
const clone=x=>JSON.parse(JSON.stringify(x));
const dayOf=t=>new Date(t+8*3600000).toISOString().slice(0,10);
const at=(day,time)=>Date.parse(`${day}T${time}:00+08:00`);
const timeOK=s=>typeof s==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s);
function validateConfig(input,current) {
  if(!input||typeof input!=='object')throw Error('配置不能为空');
  const next=clone(current);
  for(const k of ['template','chargeIntervalMs','enabled','clueIntervalMs','cluePercent','clueMin','clueMax','slots','startTime','endTime'])if(Object.hasOwn(input,k))next[k]=input[k];
  if(!Object.hasOwn(TEMPLATES,next.template))throw Error('未知模板来源');
  // 兼容旧版单时段配置，不把运行模式与模板绑定。
  if(!Object.hasOwn(input,'slots')&&(Object.hasOwn(input,'startTime')||Object.hasOwn(input,'endTime'))){
    next.slots=[{id:'daily',label:'每日场',startTime:next.startTime,endTime:next.endTime}];
  }
  if(!Array.isArray(next.slots)||next.slots.length<1||next.slots.length>12)throw Error('每天安排1–12场，测试也可手动开新场');
  const ids=new Set();
  next.slots=next.slots.map(s=>{
    if(!s||typeof s.id!=='string'||!/^[a-zA-Z0-9_-]{1,48}$/.test(s.id)||ids.has(s.id))throw Error('场次标识无效或重复');
    ids.add(s.id);
    if(!timeOK(s.startTime)||!timeOK(s.endTime)||s.startTime>=s.endTime)throw Error('每场结束需晚于开始，时间为HH:mm且不跨午夜');
    return{id:s.id,label:String(s.label||'定时场').trim().slice(0,40),startTime:s.startTime,endTime:s.endTime};
  }).sort((a,b)=>a.startTime.localeCompare(b.startTime));
  for(let i=1;i<next.slots.length;i++)if(next.slots[i].startTime<next.slots[i-1].endTime)throw Error('场次时间不能重叠');
  next.startTime=next.slots[0].startTime;next.endTime=next.slots.at(-1).endTime;
  if(!Number.isSafeInteger(next.chargeIntervalMs)||next.chargeIntervalMs<1000||next.chargeIntervalMs>86400000)throw Error('恢复时间需为1秒至24小时');
  if(!Number.isSafeInteger(next.clueIntervalMs)||next.clueIntervalMs<1000||next.clueIntervalMs>86400000||next.clueIntervalMs%1000)throw Error('线索间隔需为1秒至24小时的整秒');
  if(!Number.isFinite(next.cluePercent)||next.cluePercent<=0||next.cluePercent>100)throw Error('公布比例需大于0且不超过100%');
  if(!Number.isSafeInteger(next.clueMin)||!Number.isSafeInteger(next.clueMax)||next.clueMin<1||next.clueMax>1000||next.clueMax<next.clueMin)throw Error('公布条数需为1–1000整数，最高不小于最低');
  if(typeof next.enabled!=='boolean')throw Error('自动开局开关无效');
  return next;
}
function createActivity({room,store,now=Date.now,initial=null}) {
  const prior=initial||store.loadAdmin();
  let config=validateConfig(prior?.config||{},{...clone(TEMPLATES[prior?.config?.template]||TEMPLATES.development),enabled:false});
  const readResults=()=>store.loadSessions();
  let results=readResults();
  let session=prior?.session?clone(prior.session):null;
  // 原daily版在局数据迁移为一场，绝不丢弃未结算的旧局。
  if(!session&&prior?.day&&prior.active&&!prior.settled){session={roundId:room.room.roundId,day:prior.day,label:'每日场（旧版恢复）',source:'scheduled',slotId:'daily',
    startedAt:room.room.startedAt,endsAt:at(prior.day,config.endTime),settled:false,pausedAt:0};}
  let planDay=prior?.planDay||prior?.day||null;
  let plan=prior?.plan?clone(prior.plan):{enabled:config.enabled,slots:clone(config.slots)};
  let consumed=Array.isArray(prior?.consumed)?[...prior.consumed]:[];
  if(prior?.version<3&&prior?.day&&(prior.settled||results.some(r=>r.day===prior.day)))consumed.push(`${prior.day}:daily`);
  let clueSchedule=prior?.clueSchedule?{...prior.clueSchedule}:{nextAt:0,lastAt:0,lastCount:0};
  let revision=Number(prior?.revision)||0,error='',lastSave=now(),lastAttempt=0;
  room.room.pausedAt=session?.pausedAt||0;
  if(session&&!session.settled)room.rules.timeLimitMs=session.endsAt-room.room.startedAt;
  room.setChargeInterval(config.chargeIntervalMs);
  function snapshot(){const r=room.room;return{roundId:r.roundId,startedAt:r.startedAt,players:r.players,sessions:[...r.sessions],features:r.features,
    finished:r.finished,finishReason:r.finishReason,lastResult:r.lastResult,ranking:r.ranking,logs:r.logs,eliminateEvents:r.eliminateEvents,pausedAt:r.pausedAt||0};}
  function record(){return{version:3,config,session,planDay,plan,consumed,revision,clueSchedule:{...clueSchedule},liveSnapshot:snapshot()};}
  function block(reason){room.room.accessClosed=reason;for(const p of room.room.players)p.input={up:false,down:false,left:false,right:false};}
  function persist(){if(!store.enabled||!store.saveAdmin(record())){error='存档失败，已冻结；不会清空未归档场次';block(error);return false;}lastSave=now();error='';return true;}
  const isActive=()=>!!(session&&!session.settled);
  function resultForSession(reason){
    const ranking=room.room.players.filter(p=>!p.npc).map(p=>({
      key:createHash('sha256').update(p.empNo?'employee:'+p.empNo:'guest:'+(p.participantKey||p.sessionId||room.room.roundId+':'+p.id)).digest('hex'),
      name:p.name,score:Number(p.score)||0,alive:!!p.alive,faction:p.faction,points:Number(p.achievements?.points)||0
    })).sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).map((p,i)=>({...p,rank:i+1}));
    return{...session,pausedAt:0,settled:true,finishedAt:Math.min(now(),session.endsAt),reason,ranking,
      players:room.room.players.map(p=>({id:p.id,name:p.name,npc:!!p.npc,faction:p.faction,hp:p.hp,alive:p.alive,score:p.score,colors:p.colors,traits:p.traits,
        sid:p.sid,skills:p.skills,exploration:p.exploration,achievements:p.achievements,systemClues:p.systemClues||{colors:{},traits:{}}})),
      logs:room.room.logs.slice(),clueSchedule:{...clueSchedule}};
  }
  function settle(reason='sessionEnd'){
    if(!isActive())return true;
    block('本场结束，正在保存成绩');room.finish();
    const result=resultForSession(reason),done={...session,settled:true,pausedAt:0};
    const saved={...record(),session:done};
    if(!store.enabled||!store.archiveSession(result,saved)){error='场次结算保存失败，已冻结；不能开新场覆盖旧数据';block(error);return false;}
    session=done;room.room.pausedAt=0;results=readResults();lastSave=now();error='';return true;
  }
  function retainLegacy(){
    if(session||!room.room.players.length)return true;
    // 已有旧rounds结果保留；还在局的旧版本也作为独立场次归档进累计。
    const wasFinished=room.room.finished;
    session={roundId:room.room.roundId,day:dayOf(room.room.startedAt),label:'升级前历史场',source:'legacy',startedAt:room.room.startedAt,endsAt:now(),settled:false,pausedAt:0};
    if(!wasFinished)room.finish();
    return settle('adminTransition');
  }
  function openSession({label,source,slotId=null,startedAt,endsAt,commandId=null}){
    if(isActive())return{ok:false,error:'当前场次尚未结算，请先立即结算本场'};
    if(!retainLegacy())return{ok:false,error};
    // 新场重置前先持久化旧状态；失败绝不清场。
    if(!persist())return{ok:false,error};
    room.reset();room.room.lastResult=null;room.room.startedAt=startedAt;room.rules.timeLimitMs=endsAt-startedAt;
    session={roundId:room.room.roundId,day:dayOf(startedAt),label,source,slotId,commandId,startedAt,endsAt,settled:false,pausedAt:0};
    if(slotId)consumed.push(`${session.day}:${slotId}`);
    // 手动场重叠的自动场视为已占用，不在手动场结束后偷偷插入同一时段。
    if(source==='manual')for(const s of plan.slots){if(at(planDay,s.startTime)<endsAt&&at(planDay,s.endTime)>startedAt)consumed.push(`${planDay}:${s.id}`);}
    room.setChargeInterval(config.chargeIntervalMs);clueSchedule={nextAt:now()+config.clueIntervalMs,lastAt:0,lastCount:0};revision++;
    if(!persist())return{ok:false,error};
    return{ok:true,session:{...session}};
  }
  function publishDue(t){
    if(!clueSchedule.nextAt){clueSchedule.nextAt=t+config.clueIntervalMs;return persist();}
    if(t<clueSchedule.nextAt)return true;
    const old={...clueSchedule},oldLogs=room.room.logs.slice(),backup=room.room.players.map(p=>[p,p.systemClues?clone(p.systemClues):undefined]);
    const picked=room.publishSystemClueBatch(room.systemCluePreview(config).count);
    clueSchedule={nextAt:old.nextAt+(Math.floor((t-old.nextAt)/config.clueIntervalMs)+1)*config.clueIntervalMs,lastAt:t,lastCount:picked.length};
    if(!persist()){for(const [p,c]of backup){if(c===undefined)delete p.systemClues;else p.systemClues=c;}clueSchedule=old;room.room.logs=oldLogs;room.invalidateSystemClues();return false;}
    return true;
  }
  function tick(){
    const t=now(),today=dayOf(t);
    if(error&&t-lastAttempt<1000){block(error);return;}lastAttempt=t;
    if(!store.enabled){error='存档不可用，不能开始或继续场次';block(error);return;}
    // 结束时间优先于暂停与定时公布；暂停不能延长本场。
    if(isActive()&&(t>=session.endsAt||room.room.finished))if(!settle(t>=session.endsAt?'sessionEnd':room.room.finishReason||'finished'))return;
    if(planDay!==today){
      planDay=today;plan={enabled:config.enabled,slots:clone(config.slots)};
      consumed=consumed.filter(k=>k.startsWith(today+':'));
      if(!persist())return;
    }
    if(error&&!persist())return;
    if(isActive()){
      if(session.pausedAt){room.room.pausedAt=session.pausedAt;block('本场已暂停，技能恢复和线索计时暂停；仍按原定时间结算');return;}
      if(!publishDue(t))return;
      room.room.accessClosed='';room.room.daily={day:session.day,startAt:session.startedAt,endAt:session.endsAt,enabled:true};
      if(t-lastSave>=5000)persist();return;
    }
    // 不同定时场只在各自窗口自动开一次；过期场不补开、不捏造分数。
    const slot=plan.enabled&&plan.slots.find(s=>t>=at(today,s.startTime)&&t<at(today,s.endTime)&&!consumed.includes(`${today}:${s.id}`));
    if(slot){const result=openSession({label:slot.label,source:'scheduled',slotId:slot.id,startedAt:at(today,slot.startTime),endsAt:at(today,slot.endTime)});if(result.ok){room.room.accessClosed='';room.room.daily={day:today,startAt:session.startedAt,endAt:session.endsAt,enabled:true};}return;}
    block(plan.enabled?'当前休场，等待下一场；测试可手动开新场':'未开启自动开局；可安排场次或手动开新场');
  }
  function saveConfig(input){
    let next;try{next=validateConfig(input,config);}catch(e){return{ok:false,error:e.message};}
    if(!store.enabled)return{ok:false,error:'存档不可用，不能保存设置'};
    const old=config,oldClue={...clueSchedule},oldPlan=clone(plan),oldPlanDay=planDay;
    config=next;revision++;
    const today=dayOf(now());
    const startedToday=(session?.day===today)||results.some(r=>r.day===today)||consumed.some(k=>k.startsWith(today+':'));
    // 今天已经开过场，日程修改统一次日起效；不触发结束，也不改变当前场截止时间。
    if(!startedToday){planDay=today;plan={enabled:next.enabled,slots:clone(next.slots)};}
    if(isActive()&&next.clueIntervalMs!==old.clueIntervalMs){clueSchedule.nextAt=(session.pausedAt||now())+next.clueIntervalMs;}
    if(!persist()){config=old;clueSchedule=oldClue;plan=oldPlan;planDay=oldPlanDay;return{ok:false,error};}
    room.setChargeInterval(config.chargeIntervalMs);tick();
    return error?{ok:false,error}:{ok:true,config:clone(config),scheduleEffective:startedToday?'tomorrow':'today',message:startedToday?'已保存。场次安排与自动开局从明天生效；当前场不受影响，玩法参数按说明应用。':'已保存。今日尚未开过场，场次安排现在生效；开放时段内会开局。'};
  }
  function pause(){
    tick();if(error)return{ok:false,error};if(!isActive())return{ok:false,error:'没有进行中的场次'};
    if(session.pausedAt)return{ok:true,paused:true};
    // 先把暂停前已到期的资源结算，然后固定懒结算时钟。
    for(const p of room.room.players)room.privateSnapshot(p.id);
    const stamp=now();session.pausedAt=stamp;room.room.pausedAt=stamp;block('本场已暂停');
    if(!persist())return{ok:false,error};return{ok:true,paused:true};
  }
  function resume(){
    tick();if(error)return{ok:false,error};if(!isActive())return{ok:false,error:'本场已结束，不能继续'};
    if(!session.pausedAt)return{ok:true,paused:false};
    const duration=Math.max(0,now()-session.pausedAt),oldSchedule={...clueSchedule},oldPause=session.pausedAt;
    const changes=[];const shift=(obj,key)=>{if(obj&&Number(obj[key])>0){changes.push([obj,key,obj[key]]);obj[key]+=duration;}};
    for(const p of room.room.players){
      if(p.alive&&p.skillsFrozenAt==null)for(const skill of Object.values(p.skills))shift(skill,'nextChargeAt');
      // 其它短时互动恢复时也不瞬间超时，避免暂停期间结算猜拳等。
      for(const key of ['stunUntil','frightUntil','hammerCooldownUntil','scareCooldownUntil'])shift(p,key);
      for(const key of ['stunUntil','freezeUntil','attackUntil'])shift(p.combat,key);
    }
    for(const ch of room.room.challenges.values())for(const key of ['expiresAt','deadline','startedAt'])shift(ch,key);
    clueSchedule.nextAt+=duration;session.pausedAt=0;room.room.pausedAt=0;
    if(!persist()){for(const [o,k,v]of changes)o[k]=v;clueSchedule=oldSchedule;session.pausedAt=oldPause;room.room.pausedAt=oldPause;return{ok:false,error};}
    tick();return{ok:true,paused:false};
  }
  function finishSession(){
    // 处理截止与过场，但不自动开新的定时场作为手动结算目标。
    if(!isActive())return{ok:true,alreadySettled:true};
    return settle('adminFinished')?{ok:true,settled:true}:{ok:false,error};
  }
  function startManual({minutes,label,commandId=null}){
    if(!Number.isInteger(minutes)||minutes<1||minutes>720)return{ok:false,error:'测试场时长需为1–720分钟'};
    // 不调用tick自动开场，用户意图就是手动开场；若现有场未结算明确拒绝。
    if(isActive()&&now()>=session.endsAt&&!settle('sessionEnd'))return{ok:false,error};
    if(isActive())return{ok:false,error:'当前场尚未结算，请先立即结算本场，再手动开新场'};
    const today=dayOf(now());if(planDay!==today){planDay=today;plan={enabled:config.enabled,slots:clone(config.slots)};consumed=[];}
    const endsAt=now()+minutes*60000;
    if(dayOf(endsAt-1)!==today)return{ok:false,error:'手动场不能跨越北京时间午夜，请缩短时长'};
    const opened=openSession({label:String(label||'手动测试场').trim().slice(0,40),source:'manual',startedAt:now(),endsAt,commandId});
    if(opened.ok)tick();return opened;
  }
  function control(body){
    if(body.action==='start'&&typeof body.commandId==='string'&&(session?.commandId===body.commandId||results.some(r=>r.commandId===body.commandId)))return{ok:true,alreadyApplied:true};
    // 暂停/继续前先处理跨场边界，再核对版本；否则迟到一毫秒可能暂停下一场。
    if(body.action==='pause'||body.action==='resume')tick();
    if(body.expectedRoundId!==room.room.roundId)return{ok:false,error:'场次已变化，请刷新后确认，不操作新的场次'};
    if(body.action==='start'){
      if(typeof body.commandId!=='string'||! /^[a-zA-Z0-9_-]{8,100}$/.test(body.commandId))return{ok:false,error:'缺少有效的操作编号'};
      return startManual(body);
    }
    if(body.action==='pause')return pause();
    if(body.action==='resume')return resume();
    if(body.action==='finish')return finishSession();
    return{ok:false,error:'未知场次操作'};
  }
  function addNpc({faction,count=1,floorId=1}){
    tick();if(room.room.accessClosed)return{ok:false,error:room.room.accessClosed};
    if(!['good','bad'].includes(faction)||!Number.isInteger(count)||count<1||count>5||!Number.isInteger(floorId)||floorId<1||floorId>7)return{ok:false,error:'NPC数量1–5、楼层1–7，身份需为好人或坏人'};
    const made=room.spawnNpc(count,{floorId},faction);if(!persist())return{ok:false,error:'NPC已生成但存档失败，已冻结，请勿重复添加'};
    return{ok:true,players:made.map(p=>({id:p.id,name:p.name})),faction};
  }
  function sumRanking(list){const totals=new Map();for(const r of [...list].sort((a,b)=>a.startedAt-b.startedAt))for(const p of r.ranking||[]){const v=totals.get(p.key)||{key:p.key,name:p.name,score:0,sessions:0,daysSet:new Set()};v.name=p.name;v.score+=p.score;v.sessions++;v.daysSet.add(r.day);totals.set(p.key,v);}
    return[...totals.values()].sort((a,b)=>b.score-a.score||a.key.localeCompare(b.key)).map((v,i)=>{const{daysSet,...rest}=v;return{...rest,rank:i+1,days:daysSet.size};});}
  function state(){
    const active=isActive(),paused=!!(active&&session.pausedAt),today=dayOf(now());
    return{config:clone(config),templates:TEMPLATES,revision,day:session?.day||null,active,settled:!!session?.settled,paused,currentRoundId:room.room.roundId,session:session?{...session}:null,
      planDay,plan:clone(plan),scheduleEffective:JSON.stringify(plan)!==JSON.stringify({enabled:config.enabled,slots:config.slots})?'tomorrow':'today',
      status:error||room.room.accessClosed||'本场进行中',storageReady:!!store.enabled,error,
      cluePublication:{...room.systemCluePreview(config),...clueSchedule,paused,
        remainingMs:paused?Math.max(0,clueSchedule.nextAt-session.pausedAt):null,
        nextAt:active&&!paused&&!error&&clueSchedule.nextAt<session.endsAt?clueSchedule.nextAt:null},
      history:results.map(r=>({roundId:r.roundId,day:r.day,label:r.label||'历史场',source:r.source,startedAt:r.startedAt,endsAt:r.endsAt,finishedAt:r.finishedAt,reason:r.reason,ranking:r.ranking})),
      dailyRanking:sumRanking(results.filter(r=>r.day===today)),totalRanking:sumRanking(results)};
  }
  function guard(){tick();return room.room.accessClosed||'';}
  block(session?.pausedAt?'本场已暂停':'正在检查场次安排');
  for(const name of ['join','useSkill','performAction','interact','play','attack','floorChange','enterZone','exitZone','searchStart','searchReveal','searchTake','useItem','sellItem','buyItem','startMinigame','actMinigame','quitMinigame']){
    const original=room[name];if(typeof original==='function')room[name]=(...args)=>{const reason=guard();return reason?{ok:false,error:reason,closed:true}:original(...args);};
  }
  const originalIntent=room.setIntent;room.setIntent=(id,input)=>{const reason=guard();if(reason&&input&&['up','down','left','right'].some(k=>input[k]))return false;return originalIntent(id,input);};
  return{tick,state,saveConfig,addNpc,guard,persist,settle,pause,resume,finishSession,startManual,control};
}
module.exports={createActivity,TEMPLATES,dayOf,at,validateConfig};
