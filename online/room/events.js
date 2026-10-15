'use strict';
// room 子模块：公共日志、私密事件队列与投影（自带逻辑，通过注入的 room/now/uuid 工作）。
function createEvents({ room, now, randomUUID }) {
    function localTime(ms) { return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false }); }
    function log(text) {
      room.logs.unshift({ time: localTime(now()), text });
      if (room.logs.length > 80) room.logs.pop();
    }
    function queue(playerId, event) {
      const queue = room.pending.get(playerId) || [];
      queue.push({ eventId: randomUUID(), occurredAt: now(), ...event });
      if (queue.length > 200) queue.shift();
      room.pending.set(playerId, queue);
    }
    // Victim-side events are projected without any actor information: only what happened
    // to the receiver. No actor id/name, no faction hint, no online/offline wording, and
    // never any mention of how or by whom.
    function project(event) {
      const text = {
        revealedTrait: event.traitName ? `你的${event.traitName}已被公开` : '你的隐藏属性已被公开',
        revealedSegment: `你的第${(event.segmentIndex || 0) + 1}段S-ID已公开`,
        damaged: '你被扣1血',
        eliminated: '你已被淘汰',
        accusationFailed: event.segmentIndex >= 0 ? `你的第${event.segmentIndex + 1}段S-ID已公开` : '你的S-ID已全部公开，无新增公开段'
      }[event.type] || '你身上发生了新的公开变化';
      return {
        eventId: event.eventId,
        type: event.type,
        occurredAt: event.occurredAt,
        text,
        result: {
          traitName: event.traitName || null,
          traitValue: event.traitValue || null,
          segmentIndex: typeof event.segmentIndex === 'number' ? event.segmentIndex : null,
          damaged: event.type === 'damaged' ? 1 : 0,
          eliminated: event.type === 'eliminated'
        }
      };
    }
  return { log, queue, project, localTime };
}

module.exports = { createEvents };
