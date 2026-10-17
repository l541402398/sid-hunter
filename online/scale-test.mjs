'use strict';
// 容量压测：模拟 7 层各 43 人（峰值 300），量单帧体积与合计带宽。
// 用法：node online/scale-test.mjs            默认（全量广播，当前行为）
//       SID_AOI=1 node online/scale-test.mjs  同层过滤
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createRoom } = require('./room/index.js');
const WORLD = require('./shared/world.js');

const PEAK = Number(process.env.SID_PEAK || 300);
const FLOORS = 7;
const HZ = Number(process.env.SID_HZ || 20);

function build() {
  const room = createRoom();
  for (let i = 0; i < PEAK; i++) room.join(`s${i}`, `P${i}`);
  // 随机撒在楼层里，模拟真实分布（否则 AOI 测试没有意义，人都挤在出生点）。
  room.room.players.forEach((p, i) => {
    p.floorId = (i % FLOORS) + 1;
    const b = WORLD.floorBounds(p.floorId);
    p.x = b.minX + Math.random() * (b.maxX - b.minX);
    p.y = b.minY + Math.random() * (b.maxY - b.minY);
  });
  room.step(0.05);
  return room;
}

const room = build();
const viewer = 0;
let total = 0;
const N = 40;
for (let i = 0; i < N; i++) {
  room.step(0.05);
  total += JSON.stringify(room.publicSnapshot(viewer)).length;
}
const frame = total / N;
const perClient = frame * HZ / 1024 / 1024;      // MB/s per client
const aggregate = perClient * PEAK;               // MB/s 合计
const mode = process.env.SID_AOI === '1' ? '同层过滤(AOI)' : '全量广播';

console.log(JSON.stringify({
  mode, players: PEAK, floorCount: FLOORS, hz: HZ,
  visiblePlayers: room.publicSnapshot(viewer).players.length,
  frameBytes: Math.round(frame),
  perClientMBs: Number(perClient.toFixed(3)),
  aggregateMBs: Number(aggregate.toFixed(1)),
  gigabitHeadroom: Number((aggregate / 125 * 100).toFixed(1)) + '% of 1GbE'
}, null, 2));
