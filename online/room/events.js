'use strict';
// room 子模块：公共日志、私密事件队列与投影（自带逻辑，通过注入的 room/now/uuid 工作）。
function createEvents({ room, now, randomUUID }) {
    function localTime(ms) { return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false }); }
    function log(text, metadata = {}) {
      const entry = { time: localTime(now()), text };
      if (metadata.type === 'systemClue') entry.type = 'systemClue';
      // 仅能标记公开消息所指向的目标，不允许记录匿名操作的施技者。
      if (entry.type !== 'systemClue' && Number.isSafeInteger(metadata.subjectPlayerId)) entry.subjectPlayerId = metadata.subjectPlayerId;
      room.logs.unshift(entry);
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
      const combatHit = ['hit', 'selfHit', 'damaged'].includes(event.type),
        truce = ['truce', 'eliminated'].includes(event.type),
        health = {};
      for (const key of ['hp', 'maxHp', 'protectUntil']) {
        if (Number.isFinite(event[key])) health[key] = Math.max(0, event[key]);
      }
      let hitText = Number.isFinite(event.hp)
        ? `你的对抗生命 -1，剩余 ${Math.max(0, event.hp)} 格。`
        : '你的对抗生命 -1。';
      if (event.type === 'hit' && Number(event.protectUntil) > Number(event.occurredAt)) hitText += '已获得受击保护。';
      const truceText = '你已进入休战状态，本场不再参与对抗。仍可探索、答题、趣味互动和参加小游戏，继续赢取积分与奖品！';
      const text = {
        revealedTrait: event.traitName ? `你的${event.traitName}已被公开` : '你的隐藏属性已被公开',
        revealedSegment: `你的第${(event.segmentIndex || 0) + 1}段S-ID已公开`,
        hit: hitText,
        selfHit: hitText,
        damaged: hitText,
        truce: truceText,
        eliminated: truceText,
        accusationFailed: event.segmentIndex >= 0 ? `你的第${event.segmentIndex + 1}段S-ID已公开` : '你的S-ID已全部公开，无新增公开段'
      }[event.type] || '你身上发生了新的公开变化';
      return {
        eventId: event.eventId,
        type: event.type,
        occurredAt: event.occurredAt,
        text,
        ...health,
        result: {
          traitName: event.traitName || null,
          traitValue: event.traitValue || null,
          segmentIndex: typeof event.segmentIndex === 'number' ? event.segmentIndex : null,
          damaged: combatHit ? 1 : 0,
          eliminated: truce,
          truce,
          ...health
        }
      };
    }
  return { log, queue, project, localTime };
}

module.exports = { createEvents };
