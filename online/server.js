'use strict';
// 服务入口：统一管理员日程、权威房间与低频持久化。环境变量只配置监听/认证等基础设施。
const http = require('http');
const { createRoom, WORLD } = require('./room.js');
const { createManager } = require('./manager.js');
const { PORT, HOST, TICK_MS, SSO_REQUIRED, MANAGER_CODE } = require('./server/config.js');
const { everyMs, lanAddresses, send } = require('./server/http-util.js');
const { makeSse } = require('./server/sse.js');
const { makeRouter } = require('./server/app.js');
const { createStore } = require('./server/store.js');
const { createProfiles } = require('./server/profiles.js');
const { createActivity } = require('./server/activity.js');

const STORE = createStore();
// 员工档案（工号 → 性别）：只在正式 CAS 模式启动同步，昵称试玩/回归不访问外网。
// 同步异步进行，不阻塞服务；失败时形象退回随机分配。
const PROFILES = createProfiles(SSO_REQUIRED ? { store: STORE } : { store: STORE, enabled: false });
// 不修改或删除旧库。新控制状态优先，未配置时旧快照先保留，管理员明确开启才归档转入每日局。
const admin = STORE.loadAdmin();
const restoredSnapshot = admin?.liveSnapshot
  ? { ...admin.liveSnapshot, includeNpcs:true }
  : STORE.loadSnapshot();
const ROOM = createRoom(restoredSnapshot ? { restore:restoredSnapshot, features:restoredSnapshot.features } : {});
require('./server/auth.js').bindRoom(ROOM);
// 重启恢复的玩家可能来自旧代码：用员工库补一次组织信息，目标档案无需等重连即可显示。
for (const player of ROOM.room.players) {
  if (!player.empNo) continue;
  const employee = PROFILES.employeeOf(player.empNo);
  if (!employee) continue;
  if (!player.dept) player.dept = employee.department || null;
  if (!player.deliveryGroup) player.deliveryGroup = employee.deliveryGroup || null;
  if (!player.gender) player.gender = PROFILES.normalizeGender(employee.gender) || null;
}
const restored = STORE.loadLastRound();
if(!admin?.liveSnapshot&&restored&&!ROOM.room.lastResult) ROOM.room.lastResult={ finishReason:restored.finishReason,finishedAt:restored.finishedAt,roster:restored.roster||[],ranking:restored.ranking||[] };
const ACTIVITY = createActivity({room:ROOM,store:STORE,initial:admin});
const resetTokens = new Map();
const MANAGER = createManager({room:ROOM,passcode:MANAGER_CODE,activity:ACTIVITY});
const { openStream, startOfflineSweep } = makeSse(ROOM);
const route = makeRouter({ROOM,MANAGER,resetTokens,WORLD,openStream,ACTIVITY,PROFILES});
const server = http.createServer((req,res)=>{
  let url;try{url=new URL(req.url,`http://${req.headers.host||'localhost'}`);}catch{return send(res,400,{error:'invalid URL'});}
  route(req,res,url).catch(error=>{
    if(process.env.SID_TEST==='1')console.error('route error',error);
    if(!res.headersSent)send(res,500,{error:'服务暂时不可用，请检查服务端状态'});
    else {try{res.end();}catch{}}
  });
});
const offlineTimer = startOfflineSweep();
const cancelRoomTick = everyMs(()=>{ACTIVITY.tick();ROOM.step(TICK_MS/1000);},TICK_MS);
server.on('close',()=>{
  PROFILES.stop();cancelRoomTick();clearInterval(offlineTimer);ACTIVITY.persist();MANAGER.close();
  for(const entry of ROOM.streams.values())entry.close();STORE.close();
});
let stopping=false;
function shutdown(){
  if(stopping)return;stopping=true;PROFILES.stop();cancelRoomTick();clearInterval(offlineTimer);
  ACTIVITY.persist();for(const entry of ROOM.streams.values())entry.close();
  server.close(()=>{process.exitCode=0;});
  server.closeIdleConnections();
}
process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
server.listen(PORT,HOST,()=>{
  console.log('S-ID 服务已启动；游戏启闭、时间与恢复周期统一由 /manager 配置');
  console.log(`监听地址：http://${HOST}:${PORT}/；管理员：http://127.0.0.1:${PORT}/manager`);
  console.log(`登录：${SSO_REQUIRED?'CAS':'昵称试玩'}；存档：${STORE.enabled?'已启用':'不可用（游戏将保持关闭）'}`);
  const profileStatus = PROFILES.status();
  if (profileStatus.enabled) console.log(`[profile] 员工档案${profileStatus.mode === 'once' ? '启动时同步一次' : '定时同步'}已启动`);
  PROFILES.start();
  for(const address of lanAddresses())console.log(`局域网地址：http://${address}:${PORT}/`);
});
module.exports={server,ROOM,MANAGER,STORE,ACTIVITY,PROFILES,route,openStream,startOfflineSweep};
