'use strict';
// server 子模块：SSE 流（首帧 + 20Hz 快照 + 心跳）与确定性掉线检测。ROOM 由入口注入。
const { TICK_MS } = require('./config.js');
const { everyMs } = require('./http-util.js');

function makeSse(ROOM) {
function openStream(req, res, player) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 1200\n\n');
  // 20Hz snapshots, plus a cheap heartbeat every tick. The heartbeat is what makes a
  // dropped TCP connection visible: a write to a dead socket surfaces the failure, and
  // the sweep below is the deterministic fallback that marks the player offline.
  const write = payload => { res.write(`data: ${JSON.stringify(payload)}\n\n`); };
  try { write({ ...ROOM.publicSnapshot(player.id), me: ROOM.privateSnapshot(player.id).me }); } catch { }
  const previousEntry = ROOM.streams.get(player.id);
  const entry = { res, lastAck: Date.now(), close };
  ROOM.streams.set(player.id, entry);
  let closed = false;
  const cancelTick = everyMs(() => {
    try {
      if (res.writableEnded || res.destroyed) throw new Error('closed');
      write({ ...ROOM.publicSnapshot(player.id), me: ROOM.privateSnapshot(player.id).me });
      entry.lastAck = Date.now();
      res.write(': ping\n\n');
    } catch { close(); }
  }, TICK_MS);
  function close() {
    if (closed) return;
    closed = true;
    cancelTick();
    // 仅当本 entry 仍是该玩家当前流时才下线：刷新时新流已写入 ROOM.streams，旧流关闭
    // 不应误触发 setOffline；真实断线（无新流）则当前流即最新，照常下线并取消猜拳。
    if (ROOM.streams.get(player.id) === entry) {
      ROOM.streams.delete(player.id);
      if (ROOM.find(player.id) === player) ROOM.setOffline(player.id);
    }
    try { res.end(); } catch { /* already closed */ }
  }
  if (previousEntry && previousEntry !== entry) previousEntry.close();
  req.on('close', close);
  req.on('error', close);
  res.on('close', close);
  res.on('finish', close);
  res.on('error', close);
}

  // 确定性掉线检测：最后一次成功写入超过阈值即视为死流（即使 socket 从未报错）。
  function startOfflineSweep() {
    return setInterval(() => {
      const now = Date.now();
      for (const entry of ROOM.streams.values()) {
        if (now - entry.lastAck > 3000) entry.close();
      }
    }, 1000);
  }

  return { openStream, startOfflineSweep };
}

module.exports = { makeSse };
