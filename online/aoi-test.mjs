'use strict';
// AOI 专项测试：验证「同房间 > 同层 > 视野」的可见性分层，
// 以及 roster 全量通道不受过滤影响（排行榜不会只剩同层的人）。
//
// 注意：AOI_ENABLED 在模块加载时读取环境变量，所以必须在 require 之前设置。
process.env.SID_AOI = '1';

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom } = require('./room/index.js');
const WORLD = require('./shared/world.js');

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.error('FAIL', name, detail === undefined ? '' : JSON.stringify(detail)); }
};

function fixture(count = 6) {
  const room = createRoom();
  for (let i = 0; i < count; i++) room.join(`s${i}`, `P${i}`);
  const ps = room.room.players;
  // 所有人先放 1F 同一处
  for (const p of ps) { p.floorId = 1; p.zoneId = null; p.x = 300; p.y = 200; }
  room.step(0.05);
  return { room, ps };
}

// 1) 视野内可见：都站在同一点
{
  const { room, ps } = fixture(4);
  const snap = room.publicSnapshot(ps[0].id);
  check('同层同处：4 人互相可见', snap.players.length === 4, snap.players.length);
  check('自己始终在名单里', snap.players.some(p => p.id === ps[0].id));
}

// 2) 超出 AOI 半径不可见
{
  const { room, ps } = fixture(2);
  const R = Number(process.env.SID_AOI_RADIUS) > 0 ? Number(process.env.SID_AOI_RADIUS) : Math.round(WORLD.VIEW_W / 2);
  ps[1].x = ps[0].x + R + 200;             // 横向超出
  room.step(0.05);
  const snap = room.publicSnapshot(ps[0].id);
  check(`横向超出半径(${R})后不可见`, snap.players.length === 1, snap.players.length);

  ps[1].x = ps[0].x;                        // 拉回横向，但纵向超出 0.6 倍
  ps[1].y = ps[0].y + Math.round(R * 0.6) + 80;
  room.step(0.05);
  check('纵向超出 0.6 倍半径后不可见', room.publicSnapshot(ps[0].id).players.length === 1);

  ps[1].x = ps[0].x + 40; ps[1].y = ps[0].y + 40;
  room.step(0.05);
  check('拉回视野内重新可见', room.publicSnapshot(ps[0].id).players.length === 2);
}

// 3) 不同楼层互相不可见
{
  const { room, ps } = fixture(2);
  ps[1].floorId = 3;
  room.step(0.05);
  check('跨楼层不可见', room.publicSnapshot(ps[0].id).players.length === 1);
}

// 4) 房间隔离：房间里的人与走廊互相不可见，同房间可见
{
  const { room, ps } = fixture(3);
  const target = WORLD.roomsForFloor(1)[0];
  ps[1].zoneId = target.id;
  ps[2].zoneId = target.id;
  room.step(0.05);
  const corridor = room.publicSnapshot(ps[0].id);
  check('走廊看不到房间里的人', corridor.players.length === 1, corridor.players.length);
  const inRoom = room.publicSnapshot(ps[1].id);
  check('房间内只看到同房间的人', inRoom.players.length === 2, inRoom.players.length);
  check('房间内看不到走廊的人', !inRoom.players.some(p => p.id === ps[0].id));
}

// 5) roster 全量：排行榜数据不受 AOI 影响
{
  const { room, ps } = fixture(5);
  ps[1].floorId = 4; ps[2].floorId = 5; ps[3].zoneId = WORLD.roomsForFloor(1)[0].id;
  // roster 每 20 次快照刷新一次：多取几帧直到拿到。
  let snap = room.publicSnapshot(ps[0].id);
  for (let k = 0; k < 30 && !snap.roster; k++) { room.step(0.05); snap = room.publicSnapshot(ps[0].id); }
  check('roster 含全部玩家（1Hz 通道）', Array.isArray(snap.roster) && snap.roster.length === 5,
    snap.roster ? snap.roster.length : 'roster omitted this frame');
  check('可见名单被裁剪到 2 人以内', snap.players.length <= 2, snap.players.length);
}

console.log(`\nAOI 可见性自测：${pass} 通过 / ${fail} 失败`);
process.exitCode = fail ? 1 : 0;
