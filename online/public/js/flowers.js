'use strict';
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SID = root.SID || {}; root.SID.flowers = api; }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  const DEDICATION_MS = 4500;
  function badgesHTML(p) {
    return (p?.annualRoleModel ? '<span class="honor-badge model-badge" title="年度回顾榜样人物">🏅 年度榜样</span>' : '') +
      (p?.flowerRecipient ? '<span class="honor-badge recipient-badge" title="收花人名单成员">🌷 收花人</span>' : '');
  }
  function rosterHTML(p) {
    const model = p?.annualRoleModel
      ? '<span class="honor-badge model-badge" title="年度榜样人物" aria-label="年度榜样人物">🏅 年度榜样</span>' : '';
    const count = Number.isSafeInteger(p?.flowersReceived) && p.flowersReceived > 0 ? p.flowersReceived : 0;
    const flowers = count ? `<span class="roster-flower-count" title="本场收到鲜花 ${count} 朵" aria-label="本场收到鲜花 ${count} 朵"><span aria-hidden="true">🌷</span><b>${count}</b></span>` : '';
    return model || flowers ? `<span class="honor-badges">${model}${flowers}</span>` : '';
  }
  // 固定数量的 SVG + CSS transform 动画；仅献花成功时创建，结束后整层销毁。
  const tulip = '<svg viewBox="0 0 40 56" aria-hidden="true"><path d="M20 54V25" fill="none" stroke="#758e52" stroke-width="3"/><path d="M19 48C3 46 4 36 4 36c11 0 16 5 16 12m1-6c14-1 15-11 15-11-10 1-15 5-15 11" fill="#8ca663"/><path d="M20 29C6 29 4 17 7 7l8 6L20 3l5 10 8-6c3 10 1 22-13 22Z" fill="currentColor"/><path d="M20 29C12 25 12 15 15 13l5 7 5-7c3 5 1 13-5 16Z" fill="#fff4dd" opacity=".4"/></svg>';
  function create({ context, api, changed, toast, document: doc = document }) {
    let flight = null, scope = '', confirmed = new Set(), effect = null, effectTimer = null;
    function synchronize() {
      const c = context(), next = `${c.generation}|${c.roundId}|${c.me?.id}`;
      if (scope !== next) { scope = next; confirmed.clear(); flight = null; clearEffect(); }
      return c;
    }
    function sent(p) {
      const c = synchronize();
      return confirmed.has(p.id) || !!c.me?.flowers?.sentTo?.includes(p.id);
    }
    function panelHTML(p) {
      const c = synchronize();
      if (!p?.flowerRecipient && !(p?.flowersReceived > 0)) return '';
      const count = Number(p.flowersReceived) || 0;
      const own = p.id === c.me?.id, done = sent(p), busy = flight?.targetId === p.id;
      const disabled = !c.me || own || done || !!flight || c.finished || !!c.closed;
      const maxed = (c.me?.flowers?.sentPoints || 0) >= 10;
      const button = !p.flowerRecipient || own ? '' : `<button type="button" id="send-flower" class="send-flower"${disabled ? ' disabled' : ''}>${busy ? '正在送出…' : done ? '✓ 已送花' : '🌷 为 TA 献花'}</button>`;
      const note = own ? '每收到 5 朵鲜花 +1 分，不设上限'
        : done ? '这份心意已送达，本场每人限送一次'
        : maxed ? '本场献花积分已达 10 分，仍可送出心意'
        : '每次献花 +2 分 · 本场最多 10 分';
      return `<div class="flower-panel"><div class="flower-count"><span>本场收到鲜花</span><strong>${count}<small> 朵</small></strong></div>${button}<p class="flower-note">${note}</p></div>`;
    }
    function clearEffect() {
      clearTimeout(effectTimer); effectTimer = null;
      if (effect) effect.remove(); effect = null;
    }
    function celebrate(name) {
      clearEffect();
      globalThis.SID?.audio?.play('flowerCelebrate');
      effect = doc.createElement('div'); effect.className = 'flower-celebration';
      effect.setAttribute('aria-hidden', 'true');
      effect.style.setProperty('--dedication-duration', `${DEDICATION_MS}ms`);
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      for (let i = 0; i < (reduced ? 0 : 28); i++) {
        const flower = doc.createElement('i'); flower.className = 'flower-particle'; flower.innerHTML = tulip;
        flower.style.cssText = `--x:${(i * 37 + 11) % 100}%;--drift:${(i % 7 - 3) * 34}px;--turn:${(i % 5 - 2) * 23}deg;--delay:${i % 7 * 35}ms;--size:${26 + i % 4 * 9}px;--petal:${['#e8a1a7','#f6d6ae','#d9788a','#f2c1c4'][i % 4]}`;
        effect.append(flower);
      }
      const message = doc.createElement('div'); message.className = 'flower-dedication';
      const icon = doc.createElement('span'); icon.className = 'flower-bouquet'; icon.innerHTML = tulip;
      const text = doc.createElement('strong'); text.textContent = `向 ${name} 致敬`;
      const sub = doc.createElement('small'); sub.textContent = '每一份认真，都值得被看见';
      message.append(icon, text, sub); effect.append(message); doc.body.append(effect);
      effectTimer = setTimeout(clearEffect, DEDICATION_MS);
    }
    async function send(p) {
      const c = synchronize();
      if (flight || !c.me || !p.flowerRecipient || p.id === c.me.id || sent(p) || c.finished || c.closed) return;
      const request = flight = { scope, targetId: p.id, roundId: c.roundId };
      changed();
      try {
        const result = await api('/api/flowers', { roundId: request.roundId, targetId: p.id });
        synchronize();
        if (flight !== request || request.scope !== scope) return;
        if (!result?.ok) { toast(result?.error || '献花结果未确认，请稍后重试'); return; }
        confirmed.add(p.id);
        if (!result.alreadySent) celebrate(p.name);
        toast(result.alreadySent ? '本场已向 TA 献过花' : result.gainedPoints > 0
          ? `心意已送达，参与积分 +${result.gainedPoints}` : '心意已送达，本场献花积分已达 10 分');
      } catch {
        if (request.scope === scope) toast('献花结果未确认，请稍后重试；不会重复计分');
      } finally { if (flight === request) { flight = null; changed(); } }
    }
    function bind(p) { const button = doc.getElementById('send-flower'); if (button) button.onclick = () => send(p); }
    return { panelHTML, bind, sent, synchronize, signature: () => [scope, flight?.targetId ?? null, [...confirmed]], clearEffect };
  }
  return { badgesHTML, rosterHTML, create };
});
