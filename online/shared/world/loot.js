'use strict';
// 搜打撤式「物品格搜索」的战利品数据层（浏览器与 Node 共用；由 online/shared/world.js 汇总）。
//
// 设计目标（对齐用户需求 ③）：
//   · 容器不再"点一下就搜完"，而是弹出一个物品格面板；
//   · 格子逐个揭示（服务端逐个下发，客户端不能提前看）；
//   · 每个格子可能空、可能是战利品、也可能直接是筹码或线索券；
//   · 同一容器对不同玩家、不同轮次掷出不同结果（种子 = 容器 ID + 玩家 ID + 本局 salt）。
//
// 本文件只放"纯数据 + 纯函数"，既能在 Node（服务端掷骰）里跑，也能在浏览器（渲染图标/名称）里跑。
// 掉落金额刻意压低：旧容器单次 1–3 筹码，新系统期望 ≈3–6 筹码/容器，
// 因为容器数量从 17 个扩到 60+ 个，避免一次性把筹码经济打穿。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // ---------- 稀有度 ----------
  // weight 用于权重抽样；color 供客户端渲染格子描边 / 名称颜色。
  const RARITY = {
    common:    { key: 'common',    name: '普通', color: '#c9d2dc', weight: 58, glow: 'rgba(201,210,220,0.35)' },
    uncommon:  { key: 'uncommon',  name: '优良', color: '#6fce8a', weight: 24, glow: 'rgba(111,206,138,0.40)' },
    rare:      { key: 'rare',      name: '稀有', color: '#5aa9f2', weight: 11, glow: 'rgba(90,169,242,0.45)' },
    epic:      { key: 'epic',      name: '史诗', color: '#b579f2', weight: 5,  glow: 'rgba(181,121,242,0.50)' },
    legendary: { key: 'legendary', name: '传说', color: '#f2b544', weight: 2,  glow: 'rgba(242,181,68,0.55)' }
  };
  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  // ===== 物品效果（第二轮：让每件东西都有用，而不只是数字） =====
  // 使用后给玩家挂一个**限时 / 限次**的 buff，计时与判定都在服务端，客户端只做展示。
  //   speed  ：移动速度倍率（持续）
  //   shield ：免疫 J 键攻击带来的眩晕/僵直（持续）
  //   focus  ：下一次容器搜索多翻出 1 件物品（一次性，用完即消）
  const EFFECTS = {
    speed:  { key: 'speed',  name: '疾行', color: '#6ee7a8', durationMs: 15000, desc: '移动速度 +45%' },
    shield: { key: 'shield', name: '护体', color: '#5ad8ff', durationMs: 12000, desc: '免疫 J 键攻击的眩晕与僵直' },
    focus:  { key: 'focus',  name: '专注', color: '#f2b544', durationMs: 0, desc: '下一次搜索多翻出 1 件物品' }
  };
  const EFFECT_ORDER = ['speed', 'shield', 'focus'];

  // ===== 背包被动（第二轮追加）=====
  // 用户要求"每种物品都有自己的特殊功能，放在背包就生效"。
  // 所以除了少数消耗品（有 use），**其余每件物品都带一条 passive**：
  // 只要它还在背包里就计入总加成；卖掉/用掉就立刻失效。
  // 同类加成可叠加但有上限，避免 60 件物品叠成超人。
  const PASSIVE_KINDS = {
    speed:  { key: 'speed',  name: '轻身', cap: 40, desc: n => `移动速度 +${n}%` },
    search: { key: 'search', name: '眼力', cap: 2,  desc: n => `每次搜索多翻 ${n} 件` },
    sell:   { key: 'sell',   name: '行情', cap: 50, desc: n => `卖出物品的筹码 +${n}%` },
    stun:   { key: 'stun',   name: '硬朗', cap: 50, desc: n => `被 J 键命中时眩晕时长 -${n}%` },
    luck:   { key: 'luck',   name: '手气', cap: 50, desc: n => `开出稀有物品的概率 +${n}%` },
    clue:   { key: 'clue',   name: '人脉', cap: 1,  desc: n => `NPC 线索兑换便宜 ${n} 筹码` }
  };
  const PASSIVE_ORDER = ['speed', 'search', 'sell', 'stun', 'luck', 'clue'];
  // 稀有度 → 被动数值（search/clue 是整数件，其余是百分比）
  const PASSIVE_TIER = { common: 2, uncommon: 3, rare: 5, epic: 8, legendary: 12 };
  // 用物品 key 的哈希稳定分配被动类型：同一个物品永远是同一条被动。
  function attachPassives() {
    let n = 0;
    for (const key of Object.keys(ITEMS)) {
      const item = ITEMS[key];
      if (item.use) continue;                 // 消耗品走主动效果
      let h = 2166136261 >>> 0;
      for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      const kind = PASSIVE_ORDER[h % PASSIVE_ORDER.length];
      const tier = PASSIVE_TIER[item.rarity] || 2;
      const value = kind === 'search' ? 1 : kind === 'clue' ? 1 : tier;
      item.passive = { kind, value };
      n++;
    }
    return n;
  }
  function passiveOf(key) {
    const item = ITEMS[key];
    if (!item || !item.passive) return null;
    const kind = PASSIVE_KINDS[item.passive.kind];
    if (!kind) return null;
    return { kind: kind.key, name: kind.name, value: item.passive.value, desc: kind.desc(item.passive.value) };
  }
  // 把背包（key→数量）折算成总加成；同 kind 相加后按 cap 截断。
  function passiveTotals(items) {
    const totals = {};
    for (const key of Object.keys(items || {})) {
      const count = Math.max(0, Number(items[key]) || 0);
      if (!count) continue;
      const p = ITEMS[key] && ITEMS[key].passive;
      if (!p) continue;
      totals[p.kind] = (totals[p.kind] || 0) + p.value * count;
    }
    const out = {};
    for (const k of PASSIVE_ORDER) {
      const cap = PASSIVE_KINDS[k].cap;
      const v = Math.min(cap, totals[k] || 0);
      if (v > 0) out[k] = k === 'search' || k === 'clue' ? Math.floor(v) : v;
    }
    return out;
  }

  // ---------- 物品目录 ----------
  // icon 是客户端 16×16 程序化像素图标的键（online/public/js/search/loot-grid.js）。
  // value = 拾取时立即折算的筹码数；0 表示纯纪念品（仍会进背包，供"收获清单"展示）。
  const ITEMS = {
    // —— 普通：办公室杂物，多数只值 0–1 筹码 ——
    memo:      { key: 'memo',      label: '便利贴',     icon: 'memo',      rarity: 'common', value: 0, desc: '写满了待办事项，没有一条被完成。' },
    clip:      { key: 'clip',      label: '回形针',     icon: 'clip',      rarity: 'common', value: 0, desc: '被人掰直过又掰回去。' },
    paper:     { key: 'paper',     label: '打印纸',     icon: 'paper',     rarity: 'common', value: 0, desc: '刚拆封的一叠 A4。' },
    pen:       { key: 'pen',       label: '签字笔',     icon: 'pen',       rarity: 'common', value: 0, desc: '按了十下才出墨。' },
    cable:     { key: 'cable',     label: '充电线',     icon: 'cable',     rarity: 'common', value: 1, desc: '接口已经松了。' },
    snack:     { key: 'snack',     label: '加班零食',   icon: 'snack',     rarity: 'common', value: 1, desc: '过期两个月，但能吃。' },
    battery:   { key: 'battery',   label: '备用电池',   icon: 'battery',   rarity: 'common', value: 1, desc: '还有两格电。' },
    mug:       { key: 'mug',       label: '马克杯',     icon: 'mug',       rarity: 'common', value: 1, desc: '杯底留着上一位主人的咖啡渍。' },
    doc:       { key: 'doc',       label: '一沓文件',   icon: 'doc',       rarity: 'common', value: 1, art: 'papers', desc: '打印时间写着今天凌晨三点。' },
    // —— 优良 ——
    folder:    { key: 'folder',    label: '文件夹',     icon: 'folder',    rarity: 'uncommon', value: 2, art: 'folders', desc: '标签上写着"暂不归档"。' },
    usb:       { key: 'usb',       label: 'U 盘',       icon: 'usb',       rarity: 'uncommon', value: 2, desc: '贴着"年终复盘终版(3)"。' },
    keycard:   { key: 'keycard',   label: '门禁卡',     icon: 'keycard',   rarity: 'uncommon', value: 2, desc: '权限到 7F，持卡人姓名被磨掉了。' },
    badge:     { key: 'badge',     label: '工牌',       icon: 'badge',     rarity: 'uncommon', value: 2, desc: '照片比本人年轻十岁。' },
    stamp:     { key: 'stamp',     label: '部门印章',   icon: 'stamp',     rarity: 'uncommon', value: 3, desc: '少了一角，但仍能盖出清晰的章。' },
    coffee:    { key: 'coffee',    label: '咖啡券',     icon: 'coffee',    rarity: 'uncommon', value: 2, desc: '还有三天过期。' },
    pill:      { key: 'pill',      label: '提神药片',   icon: 'pill',      rarity: 'uncommon', value: 2, art: 'potion', desc: '说明书被撕掉了。' },
    tool:      { key: 'tool',      label: '小工具组',   icon: 'tool',      rarity: 'uncommon', value: 2, desc: '能拧开大部分抽屉。' },
    note:      { key: 'note',      label: '手写便条',   icon: 'note',      rarity: 'uncommon', value: 2, art: 'note', desc: '只写了半句话："别让……"' },
    // —— 稀有 ——
    laptop:    { key: 'laptop',    label: '笔记本电脑', icon: 'laptop',    rarity: 'rare', value: 4, desc: '贴着公司资产编号，正在注销中。' },
    hdd:       { key: 'hdd',       label: '移动硬盘',   icon: 'hdd',       rarity: 'rare', value: 5, desc: '标签只有一串日期。' },
    contract:  { key: 'contract',  label: '合同原件',   icon: 'doc',       rarity: 'rare', value: 5, desc: '最后一页的签名栏是空的。' },
    blueprint: { key: 'blueprint', label: '施工蓝图',   icon: 'plan',      rarity: 'rare', value: 5, art: 'map', desc: '图上多画了一间不存在的房间。' },
    cash:      { key: 'cash',      label: '现金红包',   icon: 'cash',      rarity: 'rare', value: 5, desc: '没写名字，也没写祝福。' },
    watch:     { key: 'watch',     label: '旧手表',     icon: 'watch',     rarity: 'rare', value: 4, desc: '停在 23:59。' },
    keyring:   { key: 'keyring',   label: '钥匙串',     icon: 'key',       rarity: 'rare', value: 4, desc: '七把钥匙，六把找不到锁。' },
    camera:    { key: 'camera',    label: '口袋相机',   icon: 'camera',    rarity: 'rare', value: 5, desc: '存储卡被取走了。' },
    // —— 史诗 ——
    gold:      { key: 'gold',      label: '金条',       icon: 'gold',      rarity: 'epic', value: 10, art: 'gold', desc: '年终奖的另一种形态。' },
    jewel:     { key: 'jewel',     label: '珠宝盒',     icon: 'jewel',     rarity: 'epic', value: 10, art: 'diamond', desc: '锁扣是坏的，里面空了一格。' },
    chipset:   { key: 'chipset',   label: '未发布芯片', icon: 'chip',      rarity: 'epic', value: 12, desc: '样品编号被人为刮掉。' },
    disc:      { key: 'disc',      label: '加密光盘',   icon: 'disc',      rarity: 'epic', value: 12, desc: '盘面手写着"仅此一份"。' },
    // —— 传说 ——
    vaultkey:  { key: 'vaultkey',  label: '保险库钥匙', icon: 'vaultkey',  rarity: 'legendary', value: 25, art: 'skull', desc: '钥匙柄上刻着 6F。' },
    chipcase:  { key: 'chipcase',  label: '筹码箱',     icon: 'chipbox',   rarity: 'legendary', value: 30, desc: '打开时发出很轻的一声"咔"。' },
    // —— 4F 地牢层的奇幻战利品（真实素材图标：0x72 药水 + Pixelfrog 宝藏） ——
    potionRed:   { key: 'potionRed',   label: '红色药剂', icon: 'potion', rarity: 'uncommon', value: 2, art: 'flaskR', desc: '标签上写着"勿饮"。' },
    potionGreen: { key: 'potionGreen', label: '绿色药剂', icon: 'potion', rarity: 'uncommon', value: 2, art: 'flaskG', desc: '闻起来像薄荷与铁锈。' },
    potionBlue:  { key: 'potionBlue',  label: '蓝色药剂', icon: 'potion', rarity: 'rare', value: 4, art: 'flaskB', desc: '瓶身冰凉，晃起来没有声音。' },
    potionGold:  { key: 'potionGold',  label: '金色药剂', icon: 'potion', rarity: 'epic', value: 9, art: 'flaskY', desc: '据说喝下去能看见明天的股价。' },
    ancientCoin: { key: 'ancientCoin', label: '古币',     icon: 'gold', rarity: 'rare', value: 5, art: 'gold', desc: '币面的头像被人磨平了。' },
    oldMap:      { key: 'oldMap',      label: '羊皮地图', icon: 'plan', rarity: 'rare', value: 5, art: 'map', desc: '画的不是这栋楼的平面。' },
    gem:         { key: 'gem',         label: '蓝宝石',   icon: 'jewel', rarity: 'epic', value: 11, art: 'diamond', desc: '切面里映出一盏不该存在的灯。' },
    skullCup:    { key: 'skullCup',    label: '金骷髅',   icon: 'skull', rarity: 'legendary', value: 28, art: 'skull', desc: '很轻，像是空心的。' },
    // ===== 七层特产（每层 3 件：1 加速 / 1 护体 / 1 高价宝物）=====
    // 只在对应楼层的容器里出，用来把"换个楼层像换个世界"落到玩法上。
    // 1F 科幻实验层
    nanoSerum:   { key: 'nanoSerum',   label: '纳米修复剂', icon: 'pill',   rarity: 'rare',      value: 6,  kind: 'consumable', use: { effect: 'speed', durationMs: 15000 }, desc: '注射后小腿发烫，跑起来像被人推着走。' },
    forceField:  { key: 'forceField',  label: '力场发生器', icon: 'chip',   rarity: 'epic',      value: 9,  kind: 'consumable', use: { effect: 'shield', durationMs: 12000 }, desc: '一次性护盾，挡住一次结实的锤击。' },
    dataCore:    { key: 'dataCore',    label: '数据核心',   icon: 'disc',   rarity: 'epic',      value: 14, kind: 'treasure',   desc: '实验层最值钱的黑色方块。' },
    // 2F 竞技运动层
    energyGel:   { key: 'energyGel',   label: '能量胶',     icon: 'snack',  rarity: 'uncommon',  value: 4,  kind: 'consumable', use: { effect: 'speed', durationMs: 12000 }, desc: '甜得发腻，但确实管用。' },
    wristGuard:  { key: 'wristGuard',  label: '运动护腕',   icon: 'tool',   rarity: 'rare',      value: 6,  kind: 'consumable', use: { effect: 'shield', durationMs: 10000 }, desc: '护腕里缝了薄薄一层缓冲胶。' },
    goldMedal:   { key: 'goldMedal',   label: '冠军奖牌',   icon: 'badge',  rarity: 'epic',      value: 13, kind: 'treasure',   desc: '背面刻着别人的名字。' },
    // 3F 魔幻城堡层
    windRune:    { key: 'windRune',    label: '疾风符文',   icon: 'note',   rarity: 'rare',      value: 6,  kind: 'consumable', use: { effect: 'speed', durationMs: 18000 }, desc: '捏碎时有一阵不该出现在室内的风。' },
    aegisCharm:  { key: 'aegisCharm',  label: '圣盾护符',   icon: 'jewel',  rarity: 'epic',      value: 9,  kind: 'consumable', use: { effect: 'shield', durationMs: 14000 }, desc: '护符背面刻着看不懂的誓言。' },
    royalSigil:  { key: 'royalSigil',  label: '王室徽章',   icon: 'stamp',  rarity: 'epic',      value: 15, kind: 'treasure',   desc: '值钱，而且不该出现在这栋楼里。' },
    // 4F 森林层
    herbBundle:  { key: 'herbBundle',  label: '轻身草药',   icon: 'snack',  rarity: 'uncommon',  value: 4,  kind: 'consumable', use: { effect: 'speed', durationMs: 16000 }, desc: '嚼起来像青草味的橡皮。' },
    barkArmor:   { key: 'barkArmor',   label: '树皮护甲',   icon: 'folder', rarity: 'rare',      value: 6,  kind: 'consumable', use: { effect: 'shield', durationMs: 12000 }, desc: '穿上后肩膀硬得像块木头。' },
    forestEssence:{ key: 'forestEssence', label: '森之精华', icon: 'jewel', rarity: 'epic',      value: 13, kind: 'treasure',   desc: '一小瓶会自己发光的绿色液体。' },
    // 5F 地牢层
    swiftPotion: { key: 'swiftPotion', label: '迅捷药剂',   icon: 'potion', rarity: 'rare',      value: 5,  kind: 'consumable', use: { effect: 'speed', durationMs: 14000 }, art: 'flaskG', desc: '喝下去喉咙发凉，脚步变轻。' },
    stoneSkin:   { key: 'stoneSkin',   label: '石肤药水',   icon: 'potion', rarity: 'rare',      value: 7,  kind: 'consumable', use: { effect: 'shield', durationMs: 13000 }, art: 'flaskY', desc: '皮肤会短暂变成灰白色。' },
    relicCoin:   { key: 'relicCoin',   label: '遗物金币',   icon: 'gold',   rarity: 'epic',      value: 14, kind: 'treasure',   art: 'gold', desc: '正面是看不懂的文字。' },
    // 6F 海盗甲板层
    rum:         { key: 'rum',         label: '朗姆酒',     icon: 'mug',    rarity: 'uncommon',  value: 5,  kind: 'consumable', use: { effect: 'speed', durationMs: 15000 }, desc: '喝一口，走路带风。' },
    charm:       { key: 'charm',       label: '护身符',     icon: 'key',    rarity: 'rare',      value: 7,  kind: 'consumable', use: { effect: 'shield', durationMs: 12000 }, desc: '据说是用鲨鱼牙做的。' },
    blackPearl:  { key: 'blackPearl',  label: '黑珍珠',     icon: 'jewel',  rarity: 'epic',      value: 15, kind: 'treasure',   desc: '甲板缝里卡着的，没人认领。' },
    // 7F 赛博霓虹层
    neuroBoost:  { key: 'neuroBoost',  label: '神经加速剂', icon: 'battery',rarity: 'rare',      value: 6,  kind: 'consumable', use: { effect: 'speed', durationMs: 18000 }, desc: '太阳穴一跳一跳的。' },
    firewallChip:{ key: 'firewallChip', label: '防火墙芯片', icon: 'chip',  rarity: 'epic',      value: 9,  kind: 'consumable', use: { effect: 'shield', durationMs: 15000 }, desc: '别在衣领上，锤子会打滑。' },
    cryptoData:  { key: 'cryptoData',  label: '加密数据',   icon: 'disc',   rarity: 'epic',      value: 16, kind: 'treasure',   desc: '值钱，但没人知道里面是什么。' },
    // ===== 商店货（用筹码在 NPC 处买，不在容器里掉落）=====
    energyDrink: { key: 'energyDrink', label: '能量饮料',   icon: 'mug',    rarity: 'common',    value: 1, price: 4, kind: 'consumable', use: { effect: 'speed', durationMs: 10000 }, desc: '便利店里最提神的那一罐。', shop: true },
    portableShield:{ key: 'portableShield', label: '便携护盾', icon: 'chip', rarity: 'uncommon', value: 2, price: 6, kind: 'consumable', use: { effect: 'shield', durationMs: 8000 }, desc: '贴片式，撕开就能用。', shop: true },
    focusLens:   { key: 'focusLens',   label: '专注镜片',   icon: 'camera', rarity: 'uncommon',  value: 2, price: 5, kind: 'consumable', use: { effect: 'focus' }, desc: '戴上之后，柜子里的东西好像变多了。', shop: true },
    // —— 特殊：直接筹码 / 线索券（不占物品叙述，但同样占格） ——
    chips:     { key: 'chips',     label: '筹码',       icon: 'chips',     rarity: 'uncommon', value: 0, desc: '可以直接使用的赌场筹码。' },
    clue:      { key: 'clue',      label: '线索券',     icon: 'clue',      rarity: 'rare', value: 0, desc: '可换取一名坏人的线索。' }
  };

  // ITEMS 定义完成后再挂被动（不能在定义前执行）。
  attachPassives();

  // ---------- 容器档案 ----------
  // cols×rows 决定物品格面板的形状；count 是掷出的物品条目数区间（其余格为空）。
  // pool 是可用物品键；chips 表示额外允许掷出"直接筹码"。
  const PROFILES = {
    small:  { cols: 3, rows: 2, count: [1, 3], pool: ['memo', 'clip', 'paper', 'pen', 'snack', 'battery', 'mug'], chips: [0, 2] },
    desk:   { cols: 3, rows: 2, count: [2, 4], pool: ['doc', 'folder', 'pen', 'memo', 'usb', 'note', 'badge', 'contract', 'laptop', 'cash'], chips: [0, 3] },
    table:  { cols: 3, rows: 2, count: [2, 4], pool: ['doc', 'folder', 'coffee', 'snack', 'mug', 'note', 'watch', 'camera'], chips: [0, 2] },
    counter: { cols: 3, rows: 2, count: [2, 4], pool: ['snack', 'coffee', 'mug', 'pill', 'doc', 'cash'], chips: [0, 3] },
    cabinet: { cols: 3, rows: 3, count: [2, 5], pool: ['folder', 'doc', 'usb', 'keycard', 'badge', 'stamp', 'contract', 'hdd', 'blueprint', 'disc'], chips: [0, 3] },
    shelf:  { cols: 4, rows: 3, count: [3, 6], pool: ['doc', 'folder', 'paper', 'blueprint', 'contract', 'note', 'camera', 'hdd', 'disc', 'jewel'], chips: [0, 4] },
    locker: { cols: 3, rows: 2, count: [2, 4], pool: ['badge', 'cable', 'mug', 'folder', 'keyring', 'cash', 'pill', 'tool'], chips: [0, 2] },
    safe:   { cols: 4, rows: 3, count: [3, 6], pool: ['gold', 'jewel', 'cash', 'contract', 'chipset', 'vaultkey', 'chipcase', 'keyring', 'watch'], chips: [2, 6] },
    crate:  { cols: 3, rows: 3, count: [2, 5], pool: ['tool', 'battery', 'cable', 'paper', 'snack', 'folder', 'hdd', 'chipset'], chips: [0, 3] },
    server: { cols: 4, rows: 3, count: [3, 6], pool: ['hdd', 'chipset', 'cable', 'battery', 'disc', 'tool', 'laptop'], chips: [0, 4] }
  };
  // 容器的 type / label 关键词 → 档案键。顺序敏感（先匹配更具体的）。
  const PROFILE_RULES = [
    [/保险|金库|safe/i, 'safe'],
    [/服务器|机房|机柜|server/i, 'server'],
    [/档案|资料|书架|书柜|shelf/i, 'shelf'],
    [/储物|更衣|locker|储运/i, 'locker'],
    [/箱|crate/i, 'crate']
  ];
  function profileKeyFor(container) {
    const label = String((container && (container.label || (container.container && container.container.name))) || '');
    const type = String((container && container.type) || '');
    for (const [re, key] of PROFILE_RULES) if (re.test(label) || re.test(type)) return key;
    if (type === 'desk') return 'desk';
    if (type === 'table') return 'table';
    if (type === 'counter') return 'counter';
    if (type === 'reception') return 'desk';
    if (type === 'cabinet') return 'cabinet';
    if (type === 'stage' || type === 'mat') return 'small';
    return 'cabinet';
  }
  function profileFor(container) {
    const key = profileKeyFor(container);
    const p = PROFILES[key] || PROFILES.cabinet;
    return { key, ...p, slots: p.cols * p.rows };
  }

  // ---------- 确定性随机 ----------
  // 字符串 → 32 位种子（FNV-1a），再跑 mulberry32。同一 (containerId, playerId, salt) 结果恒定，
  // 因此刷新页面 / 重复请求不会重掷，也便于服务端做"先掷后逐个揭示"。
  function hashSeed(text) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rngFor(...parts) { return mulberry32(hashSeed(parts.join('|'))); }

  function weightedRarity(rng) {
    const total = RARITY_ORDER.reduce((s, k) => s + RARITY[k].weight, 0);
    let roll = rng() * total;
    for (const k of RARITY_ORDER) { roll -= RARITY[k].weight; if (roll <= 0) return k; }
    return 'common';
  }
  // 按权重从候选里取一件：稀有度越高的物品越少。
  function pickByRarity(candidates, rng) {
    const wanted = weightedRarity(rng);
    const exact = candidates.filter(k => ITEMS[k] && ITEMS[k].rarity === wanted);
    if (exact.length) return exact[Math.floor(rng() * exact.length)];
    // 落在空档时向相邻稀有度退让，保证"总是有东西"。
    const idx = RARITY_ORDER.indexOf(wanted);
    for (let d = 1; d < RARITY_ORDER.length; d++) {
      for (const s of [idx - d, idx + d]) {
        const bucket = RARITY_ORDER[s];
        if (!bucket) continue;
        const list = candidates.filter(k => ITEMS[k] && ITEMS[k].rarity === bucket);
        if (list.length) return list[Math.floor(rng() * list.length)];
      }
    }
    return candidates[0];
  }

  // ===== 逐层特产池（第二轮）=====
  // 每个楼层在通用池之外再混入 3 件"本层特产"：加速 / 护体 / 高价宝物（5F 额外保留奇幻物品）。
  // 这样"换楼层 = 换世界"不仅体现在美术上，也体现在能搜到什么、能怎么用。
  const FLOOR_POOL_ADD = {
    1: ['nanoSerum', 'forceField', 'dataCore'],
    2: ['energyGel', 'wristGuard', 'goldMedal'],
    3: ['windRune', 'aegisCharm', 'royalSigil'],
    4: ['herbBundle', 'barkArmor', 'forestEssence'],
    5: ['swiftPotion', 'stoneSkin', 'relicCoin', 'potionRed', 'potionGreen', 'potionBlue', 'potionGold', 'ancientCoin', 'oldMap', 'gem', 'skullCup'],
    6: ['rum', 'charm', 'blackPearl'],
    7: ['neuroBoost', 'firewallChip', 'cryptoData']
  };
  const DUNGEON_FLOOR = 5;
  function containerFloor(container) {
    if (!container) return 0;
    const direct = Number(container.floorId);
    if (Number.isSafeInteger(direct) && direct > 0) return direct;
    const m = /^f(\d+):/.exec(String(container.id || container.roomId || ''));
    return m ? Number(m[1]) : 0;
  }
  function floorPoolFor(container) { return FLOOR_POOL_ADD[containerFloor(container)] || []; }
  // 商店商品表（NPC 处用筹码购买，不在容器里掉落）
  const SHOP_ITEMS = Object.values(ITEMS).filter(i => i.shop)
    .map(i => ({ key: i.key, label: i.label, price: i.price, icon: i.icon, desc: i.desc, use: i.use }));

  // ---------- 生成一次搜索的完整计划（服务端权威；客户端拿不到未揭示的格子） ----------
  // options: { salt, bonus:{ kind:'chips'|'clue', amount }, extra }
  function buildSearchPlan(container, playerId, options = {}) {
    const profile = profileFor(container);
    const salt = String(options.salt || '');
    const rng = rngFor(container.id || container.containerId || 'container', String(playerId || ''), salt);
    const pool = profile.pool.concat(floorPoolFor(container));
    const countRange = profile.count;
    // 专注 buff + 背包「眼力」被动：本次多翻几件。
    const extra = Math.max(0, Math.min(4, Number(options.extra) || 0));
    // 背包「手气」被动：每 25% 多掷一次，取稀有度更高者。
    const luckRolls = 1 + Math.min(3, Math.floor(Math.max(0, Number(options.luck) || 0) / 25));
    const n = countRange[0] + Math.floor(rng() * (countRange[1] - countRange[0] + 1)) + extra;
    const slots = new Array(profile.slots).fill(null);
    // 随机但不重复地挑格子放物品（洗牌算法）。
    const order = [...Array(profile.slots).keys()];
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    let filled = 0;
    const used = new Set();
    for (let i = 0; i < n && i < order.length; i++) {
      // 同一容器内尽量不重复同一种物品，让"不同物品"的观感成立；
      // 池子太小时允许重复（否则会生不出足够的条目）。
      let key = pickByRarity(pool, rng);
      for (let r = 1; r < luckRolls; r++) {
        const alt = pickByRarity(pool, rng);
        if (RARITY_ORDER.indexOf((ITEMS[alt] || {}).rarity) > RARITY_ORDER.indexOf((ITEMS[key] || {}).rarity)) key = alt;
      }
      for (let attempt = 0; attempt < 8 && used.has(key); attempt++) key = pickByRarity(pool, rng);
      const item = ITEMS[key];
      if (!item) continue;
      used.add(key);
      slots[order[i]] = { kind: 'item', itemKey: key };
      filled++;
    }
    // 直接筹码：独立命中率，命中后放在剩下的空格里，最多 2 堆。
    const chipsRange = profile.chips || [0, 0];
    if (chipsRange[1] > 0) {
      const piles = rng() < 0.55 ? 1 + (rng() < 0.3 ? 1 : 0) : 0;
      for (let p = 0; p < piles; p++) {
        const free = slots.map((v, i) => v ? -1 : i).filter(i => i >= 0);
        if (!free.length) break;
        const at = free[Math.floor(rng() * free.length)];
        const amount = chipsRange[0] + Math.floor(rng() * (chipsRange[1] - chipsRange[0] + 1));
        if (amount <= 0) continue;
        slots[at] = { kind: 'chips', amount };
      }
    }
    // 旧容器的登记奖励折算成一件特殊物品，保持"这层那个柜子有惊喜"的手感。
    const bonus = options.bonus;
    if (bonus) {
      const free = slots.map((v, i) => v ? -1 : i).filter(i => i >= 0);
      const at = free.length ? free[Math.floor(rng() * free.length)] : Math.floor(rng() * slots.length);
      if (bonus.kind === 'clue') slots[at] = { kind: 'clue' };
      else slots[at] = { kind: 'chips', amount: Math.max(1, Number(bonus.amount) || 1) };
      filled++;
    }
    // 由服务端一次性掷完，但只按 reveal 请求逐格下发（见 online/room/index.js 的 searchReveal）。
    return { profileKey: profile.key, cols: profile.cols, rows: profile.rows, slots, itemCount: filled };
  }

  // 格子内容的可下发形态（不含任何未揭示信息）。
  function describeSlot(slot) {
    if (!slot) return { kind: 'empty' };
    if (slot.kind === 'chips') return { kind: 'chips', label: `${slot.amount} 筹码`, amount: slot.amount,
      rarity: 'uncommon', color: RARITY.uncommon.color, icon: 'chips' };
    if (slot.kind === 'clue') return { kind: 'clue', label: '线索券', rarity: 'rare',
      color: RARITY.rare.color, icon: 'clue', desc: '可换取一名坏人的线索。' };
    const item = ITEMS[slot.itemKey];
    if (!item) return { kind: 'empty' };
    const r = RARITY[item.rarity] || RARITY.common;
    return { kind: 'item', itemKey: item.key, label: item.label, icon: item.icon,
      // art = 真实素材图标的键（见 online/public/js/search/loot-icons.js 的 REAL）；
      // 没有对应素材的物品继续用手绘 16×16 图标。
      art: item.art || null,
      rarity: item.rarity, rarityName: r.name, color: r.color, glow: r.glow,
      value: item.value, desc: item.desc,
      // kind/use 让物品格能标出"可直接使用"，并告诉客户端使用后会发生什么。
      itemKind: item.kind || 'treasure', use: item.use || null, passive: passiveOf(item.key) };
  }

  // 揭示节奏：格子越多、单格越慢一点；第一格稍快，给"手伸进去"的反馈。
  function revealDelayMs(profileKey) {
    return { small: 380, desk: 430, table: 430, counter: 430, cabinet: 460, shelf: 500, locker: 420, safe: 560, crate: 450, server: 520 }[profileKey] || 460;
  }
  const SEARCH_CONFIG = {
    // 全部揭示后必须手动"全部拾取"，避免手滑；超时（60s）未拾取则由服务端自动结算，
    // 防止玩家搜到一半关页面把容器卡在"已搜索但没拿"的半状态。
    sessionTtlMs: 60_000,
    revealDelayMs,
    containerProfileFor: profileFor
  };

  return { RARITY, RARITY_ORDER, ITEMS, PROFILES, profileKeyFor, profileFor, hashSeed, rngFor,
    buildSearchPlan, describeSlot, revealDelayMs, SEARCH_CONFIG, DUNGEON_FLOOR,
    FLOOR_POOL_ADD, floorPoolFor, containerFloor, EFFECTS, EFFECT_ORDER, SHOP_ITEMS,
    PASSIVE_KINDS, PASSIVE_ORDER, passiveOf, passiveTotals };
});
