'use strict';

const SENT_POINTS_CAP = 10;
const receivedFlowerPoints = count => Math.floor((Number(count) || 0) / 5);

// 名单跨场保留；献花记录跟随玩家写入本场快照。公开投影只有资格与鲜花总数。
function validateRecipients(input) {
  if (!Array.isArray(input) || input.length > 1000) throw Error('收花人名单需为数组，最多 1000 人');
  const seen = new Set();
  return input.map(entry => {
    if (!entry || typeof entry.empNo !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(entry.empNo.trim()))
      throw Error('收花人工号无效，请使用文本工号并保留前导零');
    const empNo = entry.empNo.trim();
    if (seen.has(empNo)) throw Error(`收花人工号重复：${empNo}`);
    seen.add(empNo);
    if (entry.name != null && typeof entry.name !== 'string') throw Error('收花人姓名需为文本');
    const name = (entry.name || '').trim();
    if (name.length > 40) throw Error('收花人姓名最多 40 字');
    return { empNo, name };
  });
}

function createFlowers({ room, find, playerBySession, ensureScoreState, initial = [], roleModels = [], persistRoster = () => true }) {
  let recipients = validateRecipients(initial), recipientIds = new Set(recipients.map(p => p.empNo));
  const roleModelIds = new Set(roleModels);
  let persist = () => true; // 服务启动后由 activity 接入同步存档；纯 room 自测使用内存。
  const eligible = p => !!(p && !p.npc && p.empNo && recipientIds.has(p.empNo));
  function state(p) {
    if (!p.flowerState) p.flowerState = { sentTo: [], sentPoints: 0, received: 0 };
    return p.flowerState;
  }
  function publicInfo(p) {
    return {
      flowerRecipient: eligible(p),
      annualRoleModel: !!(p && !p.npc && p.empNo && roleModelIds.has(p.empNo)),
      flowersReceived: Number(p?.flowerState?.received) || 0
    };
  }
  function privateInfo(p) {
    const s = p.flowerState;
    return { received: s?.received || 0, sentPoints: s?.sentPoints || 0,
      sentTo: (s?.sentTo || []).map(to => to.playerId) };
  }
  function view() { return { recipients: recipients.map(p => ({ ...p })) }; }
  function configure(input) {
    let next;
    try { next = validateRecipients(input); } catch (error) { return { ok: false, error: error.message }; }
    try {
      if (!persistRoster(next)) return { ok: false, error: '收花人名单保存失败，请检查存档' };
    } catch { return { ok: false, error: '收花人名单保存失败，请检查存档' }; }
    recipients = next; recipientIds = new Set(next.map(p => p.empNo));
    return { ok: true, ...view() };
  }
  function send(sessionId, body = {}) {
    const actor = playerBySession(sessionId);
    if (!actor || actor.npc) return { ok: false, error: '请先加入游戏' };
    if (!body || body.roundId !== room.roundId) return { ok: false, error: '场次已变化，请刷新后献花' };
    if (room.finished || room.accessClosed || room.pausedAt) return { ok: false, error: room.accessClosed || '本场已暂停或结束，暂不能献花' };
    const target = Number.isSafeInteger(body.targetId) ? find(body.targetId) : null;
    if (!eligible(target)) return { ok: false, error: '该玩家不在收花人名单中' };
    if (actor.id === target.id || (actor.empNo && actor.empNo === target.empNo)) return { ok: false, error: '不能给自己献花' };
    const a = state(actor);
    if (a.sentTo.some(to => to.empNo === target.empNo))
      return { ok: true, alreadySent: true, gainedPoints: 0, roundId: room.roundId, targetId: target.id,
        received: target.flowerState?.received || 0, flowers: privateInfo(actor) };
    ensureScoreState(actor); ensureScoreState(target);
    const b = state(target), gainedPoints = Math.min(2, Math.max(0, SENT_POINTS_CAP - a.sentPoints));
    const nextReceived = b.received + 1;
    const receivedPoints = receivedFlowerPoints(nextReceived) - receivedFlowerPoints(b.received);
    const before = [actor.flowerState, target.flowerState, actor.score, target.score,
      { ...actor.scoreBreakdown }, { ...target.scoreBreakdown }];
    actor.flowerState = { ...a, sentPoints: a.sentPoints + gainedPoints,
      sentTo: [...a.sentTo, { empNo: target.empNo, playerId: target.id }] };
    target.flowerState = { ...b, received: nextReceived };
    actor.score += gainedPoints; target.score += receivedPoints;
    actor.scoreBreakdown.participate = (actor.scoreBreakdown.participate || 0) + gainedPoints;
    target.scoreBreakdown.participate = (target.scoreBreakdown.participate || 0) + receivedPoints;
    let saved = false;
    try { saved = persist() === true; } catch { /* 同步存档失败：整笔操作回滚 */ }
    if (!saved) {
      [actor.flowerState, target.flowerState, actor.score, target.score, actor.scoreBreakdown, target.scoreBreakdown] = before;
      return { ok: false, error: '献花保存失败，未计花、未加分，请稍后重试' };
    }
    // 不写公共日志，不向接收者投递包含发送者身份的事件。
    return { ok: true, alreadySent: false, gainedPoints, roundId: room.roundId, targetId: target.id,
      received: nextReceived, flowers: privateInfo(actor) };
  }
  return { publicInfo, privateInfo, view, configure, send, setPersistence(fn) { persist = fn; } };
}

module.exports = { createFlowers, validateRecipients, SENT_POINTS_CAP, receivedFlowerPoints };
