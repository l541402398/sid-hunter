'use strict';
// 服务端 CommonJS 与浏览器普通脚本共用地图：绘制矩形、实体足迹和深度相互独立。
// 本文件是聚合器：子模块在 online/shared/world/*.js（浏览器需按序先加载它们），导出 window.WORLD / module.exports 保持不变。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./world/config.js'), require('./world/geometry.js'), require('./world/furniture.js'), require('./world/floors.js'), require('./world/sprite.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const WORLD = factory(D);
  root.WORLD = WORLD;
  if (isNode) module.exports = WORLD;
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_Y, MAX_Y, MIN_X, MAX_X, BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, ACTION, PALETTES, INTERACT_RANGE, PLAY_CONFIG, RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool, rpsOutcome, lineClear, collidesAt, coverFor, pointOccluded, distanceToEntity, spriteDirection, facingVector, deskBranch, deskIsland, FLOOR_BASE_HEIGHT, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, FLOOR_SPECS, CONTAINER_NAMES, FLOORS, NPCS, floorById, floorOptions, inHall, advanceGlassDoors, floorBlockers, floorFurniture, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorPortal, elevatorLanding, floorNpcs, floorContainers, inFloor, floorCollides, floorBounds, cameraBounds, makeFurniture, portalAccess, ATTACK_ANIMATION_MS, drawCharacterBody } = D;
  const WORLD = {
    WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_X, MAX_X, MIN_Y, MAX_Y,
    // 后墙墙带高度（世界像素）：墙带覆盖楼面北侧 y<WALL_BASE 的区域，属纯背景，不参与碰撞。
    // 两端 drawBackWall 与 shared/scene.js 的家具裁剪共用此值，避免"家具画到墙上"。
    WALL_BASE: 58,
    BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, PALETTES,
    makeFurniture, collidesAt, coverFor, pointOccluded, distanceToEntity, INTERACT_RANGE, NPCS,
    deskIsland, deskBranch,
    facingVector, portalAccess, floorPortal, elevatorLanding,
    PLAY_CONFIG, rpsOutcome, lineClear, spriteDirection, drawCharacterBody, ATTACK_ANIMATION_MS,
    RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool,
    // 七层楼层数据与查询接口（服务端权威、两端同源）。
    FLOOR_BASE_HEIGHT, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, FLOORS, CONTAINER_NAMES, floorById, floorBlockers,
    floorOptions, inHall, advanceGlassDoors, cameraBounds,
    floorFurniture, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorNpcs, floorContainers,
    FLOOR_COUNT: FLOOR_SPECS.length,
    inFloor, floorCollides, floorBounds,
    // 肢体互动（跳跃 / 锤子）共享数值表：服务端判定与客户端渲染同源。
    ACTION
  };
  return WORLD;
});
