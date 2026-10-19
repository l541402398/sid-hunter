// 真实素材键 → vendor 相对路径。构建期校验 + preview 绘制共用同一张表。
// 路径相对于 online/public/assets/vendor/。
export const ASSET_FILES = {
  // Antea office（CC-BY，需署名）
  desk: 'antea-office/Desk.png',
  desk2: 'antea-office/Desk-2.png',
  tableSmall: 'antea-office/Small-Table.png',
  tableRound: 'antea-office/Big-Round-Table.png',
  chair: 'antea-office/Chair.png',
  sofaSmall: 'antea-office/Small-Sofa.png',
  sofa: 'antea-office/Big-Sofa.png',
  plantSmall: 'antea-office/Small-Plant.png',
  plantBig: 'antea-office/Big-Plant.png',
  shelf: 'antea-office/Bookshelf.png',
  shelfTall: 'antea-office/Tall-Bookshelf.png',
  cabinetTall: 'antea-office/Filing-Cabinet-Tall.png',
  cabinetWide: 'antea-office/Wide-Filing-Cabinet.png',
  water: 'antea-office/Water-Dispenser.png',
  vending: 'antea-office/Vending-Machine.png',
  board: 'antea-office/Board.png',
  printer: 'antea-office/Printer.png',
  bin: 'antea-office/Bin.png',
  sportsGoalA: 'sports-kenney-sportsPack/PNG/Elements/element (78).png',
  sportsGoalB: 'sports-kenney-sportsPack/PNG/Elements/element (79).png',
  sportsGoalC: 'sports-kenney-sportsPack/PNG/Elements/element (80).png',
  // 0x72 dungeon（CC0）
  dgnChest: 'dungeon-0x72/chest_closed.png',
  dgnChestOpen: 'dungeon-0x72/chest_open_full.png',
  dgnBox: 'dungeon-0x72/box.png',
  dgnBoxes: 'dungeon-0x72/boxes_stacked.png',
  dgnColumn: 'dungeon-0x72/column.png',
  dgnSkull: 'dungeon-0x72/skull.png',
  dgnTorch1: 'dungeon-0x72/torch_1.png',
  dgnFlagRed: 'dungeon-0x72/wall_flag_red.png',
  dgnFlagBlue: 'dungeon-0x72/wall_flag_blue.png',
  // 森林（Snakerser Peaceful Forest）
  forestTree1: 'forest-snakerser/tree1a.png',
  forestTree2: 'forest-snakerser/tree2b.png',
  forestBrush1: 'forest-snakerser/brush1.png',
  forestStump: 'forest-snakerser/stump.png',
  forestRock1: 'forest-snakerser/rock1a.png',
  forestRock2: 'forest-snakerser/rock2a.png',
  forestFlowerR: 'forest-snakerser/flowerRed.png',
  forestFlowerB: 'forest-snakerser/flowerBlue.png',
  // 赛博（Warped City / Neon District）
  controlBox: 'cyber-warped/control-box.png',
  monitorFace: 'cyber-warped/monitorface.png',
  cyberLight: 'cyber-warped/light.png',
  antenna: 'cyber-warped/antenna.png',
  hotelSign: 'cyber-warped/hotel-sign.png',
  bannerSmall: 'cyber-warped/banner-small.png',
  bannerBig: 'cyber-warped/banner-a.png',
  bannerArrow: 'cyber-warped/banner-arrow.png',
  neonHolo: 'cyber-neon/panel_holo_on_f0.png',
  // 宝藏
  lootMap: 'pixelfrog-treasure/big-map.png',
};

// 预览/世界都是 16px 美术；scale 1 表示按设计 px 原尺寸绘制。
export const ASSET_SCALE = {
  antenna: 1, cyberLight: 1, controlBox: 1, monitorFace: 1,
  hotelSign: 1, bannerBig: 1, bannerSmall: 1, neonHolo: 1,
  dgnColumn: 1, dgnTorch1: 1, dgnFlagRed: 1, dgnFlagBlue: 1,
  forestTree1: 1, forestTree2: 1, forestBrush1: 1,
  forestStump: 1, forestRock1: 1, forestRock2: 1,
  forestFlowerR: 2, forestFlowerB: 2,
  vending: 1, plantBig: 1, plantSmall: 1,
  bin: 2,
  sportsGoalA: 1, sportsGoalB: 1, sportsGoalC: 1,
};

