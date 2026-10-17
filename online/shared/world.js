'use strict';
// 服务端 CommonJS 与浏览器普通脚本共用地图：绘制矩形、实体足迹和深度相互独立。
// 本文件是聚合器：子模块在 online/shared/world/*.js（浏览器需按序先加载它们），导出 window.WORLD / module.exports 保持不变。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./world/config.js'), require('./world/geometry.js'), require('./world/furniture.js'), require('./world/floors.js'), require('./world/rooms.js'), require('./world/loot.js'), require('./world/sprite.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const WORLD = factory(D);
  root.WORLD = WORLD;
  if (isNode) module.exports = WORLD;
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_Y, MAX_Y, MIN_X, MAX_X, BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, ACTION, PALETTES, INTERACT_RANGE, PLAY_CONFIG, RULES, SCORE, WHEEL, WHEEL_ITEMS, WHEEL_CHIP_COLOR, wheelSpinCost, buildWheelPool, rpsOutcome, lineClear, collidesAt, coverFor, pointOccluded, distanceToEntity, spriteDirection, facingVector, deskBranch, deskIsland, FLOOR_BASE_HEIGHT, FLOOR_W, FLOOR_H, X_SPAN, Y_SPAN, LIFT_CONFIG, FLOOR_SPECS, CONTAINER_NAMES, FLOORS, NPCS, floorById, floorOptions, inHall, advanceGlassDoors, floorBlockers, floorFurniture, floorWalls, floorPortals, floorSpawns, floorArrivals, safeSideLanding, floorPortal, elevatorLanding, floorNpcs, floorContainers, inFloor, floorCollides, floorBounds, cameraBounds, makeFurniture, portalAccess, ATTACK_ANIMATION_MS, drawCharacterBody } = D;
  const { ROOM_SIZES, WALL_T, DOOR_HALF, ENTER_PAD, ROOM_SPECS, ROOM_LIST, ROOMS, roomById, roomsForFloor,
    roomBlockers, roomCollides, inRoom, roomBounds, roomCamera, roomInteractables, roomDoorNear,
    zoneContainers, zoneFurniture, zoneBlockers, zoneCollides, zoneBounds, zoneCamera } = D;
  const { RARITY, RARITY_ORDER, ITEMS, PROFILES, profileKeyFor, profileFor, buildSearchPlan, describeSlot,
    revealDelayMs, SEARCH_CONFIG, EFFECTS, EFFECT_ORDER, SHOP_ITEMS, FLOOR_POOL_ADD, floorPoolFor, containerFloor,
    PASSIVE_KINDS, PASSIVE_ORDER, passiveOf, passiveTotals } = D;
  // 房间门口清理（需求③）：把门口 64px 内的纯装饰家具移走，留出可走通道。
  // 只清装饰，**不动容器与 NPC**，避免把战利品/交互点清掉。
  (function pruneDoorClutter() {
    for (let fid = 1; fid <= 7; fid++) {
      const fl = floorById(fid);
      if (!fl || !Array.isArray(fl.furniture)) continue;
      const doors = roomsForFloor(fid).map(r => r.door);
      if (!doors.length) continue;
      const near = (q) => doors.some(d => {
        const dx = Math.max(q.x - d.x, 0, d.x - (q.x + q.w));
        const dy = Math.max(q.y - d.y, 0, d.y - (q.y + q.h));
        return Math.hypot(dx, dy) < 64;
      });
            // 只清纯装饰类，且任何能承载容器的家具一律保留（否则会把战利品点清掉）。
      const DECOR = new Set(['plant', 'lamp', 'chair', 'bench', 'cooler', 'water', 'rug', 'sofa', 'seat', 'deco', 'tv']);
      fl.furniture = fl.furniture.filter(q => q.architecturalPlaceholder || q.cont || q.container || q.npc ||
        !DECOR.has(q.type) || !near(q));
      fl._safeSpawns = null; // 家具变了，出生点重新净化
    }
  })();
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
    // 独立小房间（需求①）：每层 2 间可进入的独立空间，自带坐标、家具、容器与相机。
    ROOM_SIZES, ROOM_WALL_T: WALL_T, ROOM_DOOR_HALF: DOOR_HALF, ROOM_ENTER_PAD: ENTER_PAD,
    ROOM_SPECS, ROOM_LIST, ROOMS, roomById, roomsForFloor, roomBlockers, roomCollides, inRoom,
    roomBounds, roomCamera, roomInteractables, roomDoorNear,
    zoneContainers, zoneFurniture, zoneBlockers, zoneCollides, zoneBounds, zoneCamera,
    // 搜打撤式物品格搜索（需求③）：物品目录、稀有度、容器档案与确定性掷骰。
    LOOT: { RARITY, RARITY_ORDER, ITEMS, PROFILES, profileKeyFor, profileFor, buildSearchPlan, describeSlot,
      revealDelayMs, SEARCH_CONFIG, EFFECTS, EFFECT_ORDER, SHOP_ITEMS, FLOOR_POOL_ADD, floorPoolFor, containerFloor,
      PASSIVE_KINDS, PASSIVE_ORDER, passiveOf, passiveTotals },
    // 肢体互动（跳跃 / 锤子）共享数值表：服务端判定与客户端渲染同源。
    ACTION
  };
  return WORLD;
});
