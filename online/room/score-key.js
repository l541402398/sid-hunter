'use strict';

const { createHash } = require('node:crypto');
const keys = new WeakMap();

function scoreKey(player, roundId) {
  const identity = player.empNo ? 'employee:' + player.empNo
    : 'guest:' + (player.participantKey || player.sessionId || roundId + ':' + player.id);
  const cached = keys.get(player);
  if (cached?.identity === identity) return cached.key;
  const key = createHash('sha256').update(identity).digest('hex');
  keys.set(player, { identity, key });
  return key;
}

module.exports = { scoreKey };
