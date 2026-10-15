'use strict';
// 几何：接触/遮挡/视线/距离/朝向（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { BODY_HALF, FOOT_TOP, FOOT_BOTTOM } = D;
  function lineClear(a, b, furniture) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, y = a.y + (b.y - a.y) * i / steps;
      if (furniture.some(({ footprint: f }) => f && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h)) return false;
    }
    return true;
  }
  function collidesAt(x, y, items) {
    const hit = f => x + BODY_HALF > f.x && x - BODY_HALF < f.x + f.w &&
      y + FOOT_TOP > f.y && y - FOOT_BOTTOM < f.y + f.h;
    for (const it of items) {
      // 行走碰撞优先用 f.blocks[]（单体足迹并集）；无 blocks 时回退 footprint（墙体走此分支）。
      const bs = it.blocks;
      if (bs && bs.length) { for (const b of bs) if (hit(b)) return true; }
      else if (it.footprint && hit(it.footprint)) return true;
    }
    return false;
  }
  // 身体包围盒与现有角色绘制范围一致；足迹只用于脚部碰撞。
  // 阶段2-阶段1（÷4 尺度修正）：包围盒随世界同步 ÷4（半宽 21→5.25、下 8→2、上 53→13.25，盒 10.5×15.25）。
  // 家具足迹同比例缩小 → 面积比与阈值 0.22 不变，命中集合与缩小前逐点等价（不重标定阈值即守恒）。
  function coverFor(p, furniture) {
    let cover = null;
    for (const f of furniture) {
      if (p.y >= f.depth) continue;
      const w = Math.max(0, Math.min(p.x + 5.25, f.x + f.w) - Math.max(p.x - 5.25, f.x));
      const h = Math.max(0, Math.min(p.y + 2, f.y + f.h) - Math.max(p.y - 13.25, f.y));
      if (w * h / (10.5 * 15.25) >= 0.22 && (!cover || f.depth >= cover.depth)) cover = f;
    }
    return cover;
  }
  function pointOccluded(x, y, p, furniture) {
    return furniture.some(f => p.y < f.depth && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h);
  }
  function distanceToEntity(p, entity) {
    if (!entity.footprint) return Math.hypot(p.x - entity.x, p.y - entity.y);
    const f = entity.footprint;
    const x = Math.max(f.x, Math.min(f.x + f.w, p.x));
    const y = Math.max(f.y, Math.min(f.y + f.h, p.y));
    return Math.hypot(p.x - x, p.y - y);
  }
  // 外观朝向独立于 J 挥拳向量；等轴位移保留仍有效的上一方向。
  function spriteDirection(dx, dy, previous = 'front') {
    const eps = 1e-6, ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.hypot(dx, dy) <= eps) return previous;
    const horizontal = dx < 0 ? 'left' : 'right', vertical = dy < 0 ? 'back' : 'front';
    if (Math.abs(ax - ay) <= eps * Math.max(1, ax, ay)) {
      return previous === horizontal || previous === vertical ? previous : vertical;
    }
    return ax > ay ? horizontal : vertical;
  }
  // ---------- 需求2：电梯门「面对 + 靠近」资格判定（两端与服务端同源的唯一真源） ----------
  // 外观四向 → 单位向量。front=朝屏幕下方(南)，back=朝上方(北)。
  function facingVector(dir) {
    return dir === 'left' ? { x: -1, y: 0 } : dir === 'right' ? { x: 1, y: 0 }
      : dir === 'back' ? { x: 0, y: -1 } : { x: 0, y: 1 };
  }
  // 电梯不分上下方向：任何一部都能乘到任意其它楼层（客户端弹选层）。
  // 资格：inReach（进入交互半径）/ facingOk（面向门，cos≥0.5）/ allowed（可提交）。
  return { lineClear, collidesAt, coverFor, pointOccluded, distanceToEntity, spriteDirection, facingVector };
});
