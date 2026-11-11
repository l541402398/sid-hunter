'use strict';
// 实物奖品池（方案 §九）：
// - 全活动共享库存；每位员工整个活动期间最多中一次，探索 / J 命中等所有渠道共用中奖资格。
// - 中奖与积分独立判定、不额外加分；中奖后不再参与后续抽取，进入休战不刷新资格。
// - 抽奖、扣库存、登记、落盘在同一同步调用里完成（Node 单线程，无并发交错）→ 不会超发、不会重复领取；
//   落盘失败立即回滚并返回未中奖，不先向玩家宣布成功。
// 品类、份数、各渠道概率与触发频率均为「待定」：默认空库存、概率 0（即关闭），由管理员在 /manager 配置。
const { randomInt: cryptoRandomInt } = require('crypto');

const CHANNELS = Object.freeze(['explore', 'hammer']);
const CHANNEL_TEXT = Object.freeze({ explore: '探索开箱', hammer: 'J 互动命中' });
// J 渠道有效触发次数上限（待定；暂与 J 积分渠道同口径：同一目标每日 2 次、每日合计 10 次）。
const DEFAULT_HAMMER_LIMITS = Object.freeze({ perTargetDaily: 2, dailyCap: 10 });
const MAX_ITEMS = 50, MAX_STOCK = 100000, MAX_NAME = 40;

function clampInt(v, lo, hi) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null; }

function normalizeState(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const items = (Array.isArray(src.items) ? src.items : []).filter(i => i && typeof i === 'object').slice(0, MAX_ITEMS).map((i, idx) => ({
    id: typeof i.id === 'string' && i.id ? i.id.slice(0, 40) : `prize-${idx + 1}`,
    name: String(i.name || '').trim().slice(0, MAX_NAME) || `奖品${idx + 1}`,
    stock: clampInt(i.stock, 0, MAX_STOCK) || 0,
    claimed: clampInt(i.claimed, 0, MAX_STOCK) || 0
  }));
  const chances = {};
  for (const c of CHANNELS) { const v = Number(src.chances && src.chances[c]); chances[c] = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }
  const hl = src.hammerLimits || {};
  const hammerLimits = {
    perTargetDaily: clampInt(hl.perTargetDaily, 0, 100) ?? DEFAULT_HAMMER_LIMITS.perTargetDaily,
    dailyCap: clampInt(hl.dailyCap, 0, 1000) ?? DEFAULT_HAMMER_LIMITS.dailyCap
  };
  const claims = {};
  if (src.claims && typeof src.claims === 'object') {
    for (const [k, v] of Object.entries(src.claims)) if (v && typeof v === 'object') claims[k] = { ...v };
  }
  return { items, chances, hammerLimits, claims, updatedAt: Number(src.updatedAt) || 0 };
}

// persist(state) → true / false（false 表示落盘失败，调用方回滚）。未提供 persist 时视为纯内存（进程内自测）。
function createPrizePool({ initial = null, persist = null, randomInt = null, now = Date.now } = {}) {
  let state = normalizeState(initial);
  const rng = typeof randomInt === 'function' ? randomInt : (n => cryptoRandomInt(n));
  const save = () => (typeof persist === 'function' ? persist(snapshot()) !== false : true);
  const remaining = item => Math.max(0, item.stock - item.claimed);

  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  // 中奖资格键：正式活动按员工工号（整个活动）；无工号的昵称试玩按「局 + 玩家」，NPC 不参与。
  function winnerKey(player, roundId) {
    if (!player || player.npc) return null;
    if (player.empNo) return `employee:${player.empNo}`;
    return `guest:${roundId || 'round'}:${player.id}`;
  }
  function claimOf(player, roundId) {
    const key = winnerKey(player, roundId);
    return key && state.claims[key] ? { ...state.claims[key] } : null;
  }
  function eligible(player, roundId) { const key = winnerKey(player, roundId); return !!key && !state.claims[key]; }
  function chanceOf(channel) { return state.chances[channel] || 0; }

  // 一次有效触发的独立抽奖。返回 null（未中奖 / 不具备资格 / 无库存 / 落盘失败）或 { prize, claim }。
  function tryDraw(player, channel, ctx = {}) {
    if (!CHANNELS.includes(channel)) return null;
    const key = winnerKey(player, ctx.roundId);
    if (!key || state.claims[key]) return null;
    const chance = chanceOf(channel);
    if (!(chance > 0)) return null;
    const pool = state.items.filter(i => remaining(i) > 0);
    if (!pool.length) return null;
    if (rng(10000) >= Math.floor(chance * 10000)) return null;
    // 按剩余数量加权选品类
    const total = pool.reduce((s, i) => s + remaining(i), 0);
    let r = rng(total), item = pool[0];
    for (const i of pool) { if (r < remaining(i)) { item = i; break; } r -= remaining(i); }
    const claim = { prizeId: item.id, prizeName: item.name, channel, at: now(), roundId: ctx.roundId || null,
      playerId: player.id, playerName: player.name || '', empNo: player.empNo || null };
    item.claimed += 1;
    state.claims[key] = claim;
    state.updatedAt = claim.at;
    if (!save()) {
      item.claimed -= 1;
      delete state.claims[key];
      return { error: '奖品登记失败', persistFailed: true };
    }
    return { prize: { id: item.id, name: item.name }, claim: { ...claim } };
  }

  // 管理员配置：品类与库存、各渠道概率、J 有效触发上限。库存不得低于已发出数量；已有中奖的品类不能删除。
  function configure(input) {
    if (!input || typeof input !== 'object') return { ok: false, error: '奖品配置无效' };
    const next = snapshot();
    if (input.items !== undefined) {
      if (!Array.isArray(input.items) || input.items.length > MAX_ITEMS) return { ok: false, error: `奖品品类需为数组且不超过 ${MAX_ITEMS} 项` };
      const byId = new Map(state.items.map(i => [i.id, i]));
      const seen = new Set(), items = [];
      let seq = state.items.length;
      for (const raw of input.items) {
        if (!raw || typeof raw !== 'object') return { ok: false, error: '奖品品类格式无效' };
        const name = String(raw.name || '').trim();
        if (!name || name.length > MAX_NAME) return { ok: false, error: `奖品名称需为 1–${MAX_NAME} 个字符` };
        const stock = clampInt(raw.stock, 0, MAX_STOCK);
        if (stock === null || String(raw.stock).trim() === '' || Number(raw.stock) !== stock) return { ok: false, error: `「${name}」库存需为 0–${MAX_STOCK} 的整数` };
        let id = typeof raw.id === 'string' && byId.has(raw.id) ? raw.id : null;
        if (!id) { do { seq += 1; id = `prize-${seq}`; } while (byId.has(id) || seen.has(id)); }
        if (seen.has(id)) return { ok: false, error: '奖品品类重复' };
        seen.add(id);
        const claimed = byId.has(id) ? byId.get(id).claimed : 0;
        if (stock < claimed) return { ok: false, error: `「${name}」库存不能低于已发出的 ${claimed} 份` };
        items.push({ id, name, stock, claimed });
      }
      for (const old of state.items) if (!seen.has(old.id) && old.claimed > 0) return { ok: false, error: `「${old.name}」已有中奖记录，不能删除（可把库存调到已发出数量）` };
      next.items = items;
    }
    if (input.chances !== undefined) {
      if (!input.chances || typeof input.chances !== 'object') return { ok: false, error: '概率配置无效' };
      for (const c of CHANNELS) {
        if (input.chances[c] === undefined) continue;
        const v = Number(input.chances[c]);
        if (!Number.isFinite(v) || v < 0 || v > 1) return { ok: false, error: `${CHANNEL_TEXT[c]}概率需在 0–1 之间` };
        next.chances[c] = v;
      }
    }
    if (input.hammerLimits !== undefined) {
      const hl = input.hammerLimits || {};
      const per = hl.perTargetDaily === undefined ? next.hammerLimits.perTargetDaily : clampInt(hl.perTargetDaily, 0, 100);
      const cap = hl.dailyCap === undefined ? next.hammerLimits.dailyCap : clampInt(hl.dailyCap, 0, 1000);
      if (per === null || cap === null) return { ok: false, error: 'J 有效触发上限需为整数' };
      next.hammerLimits = { perTargetDaily: per, dailyCap: cap };
    }
    next.updatedAt = now();
    const previous = state;
    state = normalizeState(next);
    if (!save()) { state = previous; return { ok: false, error: '奖品配置保存失败，请检查存储' }; }
    return { ok: true, prizes: view() };
  }

  function view() {
    const items = state.items.map(i => ({ ...i, remaining: remaining(i) }));
    const claims = Object.entries(state.claims).map(([key, c]) => ({ key, ...c })).sort((a, b) => (a.at || 0) - (b.at || 0));
    return {
      items, claims, chances: { ...state.chances }, hammerLimits: { ...state.hammerLimits },
      totals: { stock: items.reduce((s, i) => s + i.stock, 0), claimed: claims.length, remaining: items.reduce((s, i) => s + i.remaining, 0) },
      channels: CHANNELS.map(c => ({ key: c, label: CHANNEL_TEXT[c] })), updatedAt: state.updatedAt
    };
  }
  function hammerLimits() { return { ...state.hammerLimits }; }
  return { tryDraw, configure, view, claimOf, eligible, chanceOf, hammerLimits, winnerKey, snapshot };
}

module.exports = { createPrizePool, normalizeState, CHANNELS, DEFAULT_HAMMER_LIMITS };
