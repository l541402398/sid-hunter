'use strict';
// room 子模块：离线受击摘要（被敲 / 被鬼吓）的累计、水位与 ACK（自带状态）。
function createDigest({ randomUUID, find }) {
    // ============ dev 分支并入：离线受击摘要（被敲 / 被鬼吓） ============
    let epoch = randomUUID();
    const hits = new Map();
    // 单调累计 + 已确认水位：旧 ACK 永远不会清掉新产生的离线受击。
    function ledgerFor(p) {
      if (!hits.has(p.id)) hits.set(p.id, {
        totals: { hammer: 0, scare: 0 }, watermark: { hammer: 0, scare: 0 },
        summary: null, sent: false, acknowledged: new Set()
      });
      return hits.get(p.id);
    }
    function count(p, kind) {
      if (!p.online && !p.npc) ledgerFor(p).totals[kind]++;
    }
    function prepareReconnect(p) {
      if (!p || p.npc) return null;
      const ledger = ledgerFor(p);
      if (ledger.summary) return ledger.summary; // 重试/重连复用同一 ID 与水位
      const counts = {
        hammer: ledger.totals.hammer - ledger.watermark.hammer,
        scare: ledger.totals.scare - ledger.watermark.scare
      };
      if (!counts.hammer && !counts.scare) return null;
      ledger.summary = { id: randomUUID(), epoch: epoch, counts, watermark: { ...ledger.totals } };
      ledger.sent = false;
      return ledger.summary;
    }
  // 私密投影用：标记「已下发」并返回深拷贝的摘要（无摘要时返回 null）。
  function summaryFor(p) {
    const ledger = hits.get(p.id);
    if (!ledger) return null;
    if (ledger.summary) ledger.sent = true;
    return ledger.summary ? {
      ...ledger.summary, counts: { ...ledger.summary.counts }, watermark: { ...ledger.summary.watermark }
    } : null;
  }
  // ACK：epoch + summary id 双校验；旧 ACK 幂等且永不清掉新摘要。
  function ack(playerId, ids, interaction, pending) {
    const ledger = hits.get(playerId);
    if (!ledger || interaction.epoch !== epoch) return { ok: false, error: '摘要凭证无效' };
    if (ledger.acknowledged.has(interaction.id)) return { ok: true };
    if (!ledger.sent || !ledger.summary || interaction.id !== ledger.summary.id) return { ok: false, error: '摘要凭证无效' };
    pending.set(playerId, (pending.get(playerId) || []).filter(e => !ids.has(e.eventId)));
    ledger.watermark = { ...ledger.summary.watermark };
    ledger.acknowledged.add(ledger.summary.id);
    ledger.summary = null;
    ledger.sent = false;
    prepareReconnect(find(playerId));
    return { ok: true };
  }
  function reset() { hits.clear(); epoch = randomUUID(); }
  return { ledgerFor, count, prepareReconnect, summaryFor, ack, reset };
}

module.exports = { createDigest };
