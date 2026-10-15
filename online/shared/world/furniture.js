'use strict';
// 家具单体育迹分解（R-DECOMP）（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js'), require('./geometry.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const WK_W = 51.2, WK_PLAN = 23.3, R2_DEPTH = 46.6, R2_THRESH = 55.6;
  const _r3 = v => Math.round(v * 1000) / 1000;
  const _blk = (x, y, w, h) => ({ x: _r3(x), y: _r3(y), w: _r3(Math.max(1, w)), h: _r3(Math.max(1, h)) });
  const _cols = w => Math.max(1, Math.floor((w + 2) / WK_W));          // C = max{n | n*51.2 <= rectW+2}
  const _objD = d => Math.min(24, Math.max(6, d));                     // R-CLIP
  // 逐类型「单体自深」(m × 13.33px/m)；缺省用 rect 深
  const FURN_SELF_D = {
    desk: 9.3, table: 24, counter: 8.7, cabinet: 6.7, reception: 10.7, sofa: 12,
    plant: 10.7, treadmill: 9.3, rack: 6.7, seat: 6.7, mat: 24, stage: 24
  };
  // 工位分支的单一真源：'island'（连排/双面岛，C>=2）| 'workSingle'（工位型单桌）| 'roomSingle'（房号竖放单桌）。
  // blocksFor 与渲染（drawWorkstation）都以它为唯一判据，避免"房号单桌被画成工位岛"。
  function deskBranch(f) {
    if ((f.type === 'desk' || f.type === 'table') && /^\d{3}$/.test(f.label || '')) return 'roomSingle';
    if (f.type !== 'desk') return null;
    if (_cols(f.w) >= 2) return 'island';
    return /工位/.test(f.label || '') ? 'workSingle' : 'roomSingle';
  }
  // 工位岛的单一真源：碰撞（blocksFor）与绘制（drawWorkstation）都调它，保证「画什么撞什么」。
  // 非岛返回 null；返回 { C, rows, gap, plan, unitW, islandH, bw, ox, uy }；uy=rect.y。
  function deskIsland(f) {
    if (deskBranch(f) !== 'island') return null;               // 非岛（单桌走 workSingle / roomSingle）
    const { x, y, w, h } = f;
    const C = _cols(w);
    const rows = h >= R2_THRESH ? 2 : 1;
    const gap = rows === 2 ? Math.min(24, Math.max(0, h - 2 * WK_PLAN)) : 0;
    let islandH = rows === 2 ? (2 * WK_PLAN + gap) : WK_PLAN;
    // R-NO-POCKET：残余窄带 (0,9)px 吸附到 rect 全深，避免岛底留下 <9px（身位）的死缝
    if (rows === 2 && h - islandH > 0 && h - islandH < 9) islandH = h;
    const bw = C * WK_W;
    const ox = x + Math.max(0, (w - bw) / 2);
    return { C, rows, gap, plan: WK_PLAN, unitW: WK_W, islandH, bw, ox, uy: y };
  }
  function blocksFor(f) {
    const { type, label, x, y, w, h } = f;
    const cx = x + w / 2;
    // 2d 闭合件：工位绿植箱占满自身 rect（封住 205/206 工位间凹角）
    if (label === '工位绿植箱') return [_blk(x, y, w, h)];
    const center = (bw, bh) => [_blk(cx - bw / 2, y + Math.max(0, (h - bh) / 2), bw, bh)];
    const topStrip = d => [_blk(x, y, w, d)];
    const bottomStrip = d => [_blk(x, y + h - d, w, d)];
    // 工位/房号单桌：分支单一真源 deskBranch
    const br = deskBranch(f);
    if (br === 'roomSingle') {                                 // 房号竖放单桌：19.2×24，置 (rect.x+2, rect.y-6 上探封列顶死条)
      const bw = Math.min(19.2, Math.max(6, w - 8)), bh = Math.min(24, h);
      return [_blk(x + 2, Math.max(0, y - 6), bw, bh + (y >= 6 ? 6 : 0))];
    }
    if (br === 'workSingle') {                                 // 工位型单桌：D1 44.8×16 贴后沿
      const bw = Math.min(44.8, Math.max(24, w - 24)), bh = Math.min(16, h);
      const bx = (w - bw) >= 24 ? x + w - bw : x;
      return [_blk(bx, y + 2, bw, bh)];
    }
    if (br === 'island') {                                     // 连排/双面岛：块深 = 绘制岛深（单一真源 deskIsland）
      const isl = deskIsland(f);
      return [_blk(isl.ox, isl.uy, isl.bw, Math.min(h, isl.islandH))];
    }
    // 核心筒：底部条带 102.4×24（v5：禁全 rect，否则堵死 h313 门洞 / 埋 portal / 封 6F 左服务带）
    if (type === 'cabinet' && label === '核心筒') return [_blk(cx - 51.2, y + h - 24, 102.4, 24)];
    // 舞台：底部条带 24 深（可站上去，不加 walls）
    if (type === 'stage') return [_blk(x, y + h - 24, w, 24)];
    // 训练垫：垫区 48×24（R-FOOT 保留 24）
    if (type === 'mat') return center(Math.min(48, w), 24);
    if (type === 'treadmill') return center(Math.min(57.6, w), 9.3);
    if (type === 'rack') return center(Math.min(38.4, w), 6.7);
    if (type === 'seat') return center(Math.min(67.2, w), 6.7);
    if (type === 'table' && /^食堂餐桌/.test(label || '')) return center(Math.min(80, w - 12), 24);
    if (type === 'table') return center(Math.min(Math.max(24, w - 24), w), 24);      // 会议/讨论等：收至 rectW-24 居中
    // 任务9（碰撞体积消失/摆放错位修复）：台面/柜类/接待台/沙发/绿植原先碰撞贴 rect 北沿细条
    // （topStrip），但绘制的立面在 rect 南沿（面向镜头）——玩家能穿进可见家具大半才被挡。
    // 改为碰撞贴南沿立面（bottomStrip，与原始 footprint「底部 24px」语义一致），画什么撞什么。
    if (type === 'counter') return bottomStrip(_objD(FURN_SELF_D.counter));             // 台面：贴前沿立面
    if (type === 'cabinet') return bottomStrip(_objD(FURN_SELF_D.cabinet));             // 柜类：贴前沿立面
    if (type === 'reception' || type === 'sofa' || type === 'plant') return bottomStrip(_objD(FURN_SELF_D[type]));
    return bottomStrip(_objD(FURN_SELF_D[type] == null ? h : FURN_SELF_D[type]));    // 默认：底部条带
  }
  return { WK_W, WK_PLAN, R2_DEPTH, R2_THRESH, _r3, _blk, _cols, _objD, FURN_SELF_D, deskBranch, deskIsland, blocksFor };
});
