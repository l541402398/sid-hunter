'use strict';
// 每层「可进入的独立小房间」数据层（浏览器与 Node 共用；由 online/shared/world.js 汇总）。
//
// 需求 ①：每层扩充，并加入独立空间（办公室 / 会议室 / 档案室 …）。
//   · 房间有**自己的坐标空间**（0..w / 0..h 世界像素），进房后玩家在房间坐标系里移动；
//   · 房间有**自己的家具/墙体/可搜容器**，与楼层完全分离（"人物和物品独立加载"）；
//   · 楼层上的门点（door）是房间与楼层的唯一连接：站到门口按 E 进入，
//     房间内的离开点（exit）固定就是门内侧，所以退房必然回到进房的那一点；
//   · 服务端只认 zoneId：同层 + 同 zone 才互相可见，房间内看不到走廊上的人。
//
// 与 floors.js 的约定一致：家具/墙用 0–1000 归一化书写，建造时换算成房间自己的像素尺寸。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js'), require('./geometry.js'), require('./furniture.js'), require('./floors.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { blocksFor, floorById, floorCollides, floorBlockers, inFloor } = D;
  // ---------- 房间尺寸（世界像素） ----------
  // 房间是独立空间，不随楼层放大：楼层放大是为了容纳更多人，房间再放大会变成"空荡的大厅"。
  // 进房后客户端会把镜头缩到整间屋子（见 game.js 的 applyViewport），所以小房间反而更有"进屋"感。
  const ROOM_SCALE = 1;
  // 楼层上的门点写在「1× 基准世界像素」里，建造时随楼层同比例放大（与 FLOOR_SPECS 一致）。
  const FLOOR_SCALE = D.FLOOR_SCALE || 1;
  const SC = (v) => Math.round(v * ROOM_SCALE);
  const ROOM_SIZES = {
    office: { w: SC(620), h: SC(420) },
    meeting: { w: SC(760), h: SC(470) },
    archive: { w: SC(700), h: SC(450) },
    lab: { w: SC(660), h: SC(440) },
    lounge: { w: SC(600), h: SC(400) },
    vault: { w: SC(560), h: SC(380) },
    locker: { w: SC(520), h: SC(360) },
    studio: { w: SC(640), h: SC(430) }
  };
  const WALL_T = 26;         // 房间墙厚
  const DOOR_HALF = 46;      // 房间南墙门洞半宽
  const ENTER_PAD = 56;      // 楼层上「门口可按 E」的半径

  // ---------- 房间模板 ----------
  // kind 决定默认尺寸与配色；furniture 行格式同 floors.js：[type,label,x1,y1,x2,y2,flag?]
  // flag 'container:<name>' → 生成稳定 ID `f{floor}:room:{slug}:container:{name}`。
  function office(extra = []) {
    return [
      ['desk', '主管办公桌', 120, 170, 380, 330, 'container:deskA'],
      ['chair', '办公椅', 200, 340, 280, 400],
      ['cabinet', '文件柜', 40, 170, 105, 330, 'container:cabA'],
      ['shelf', '资料架', 700, 60, 960, 190, 'container:shelfA'],
      ['whiteboard', '白板', 430, 30, 660, 60],
      ['plant', '办公室绿植', 850, 330, 950, 430],
      ['tv', '显示屏', 120, 30, 330, 55],
      ...extra
    ];
  }
  function meeting(extra = []) {
    const chairs = [];
    for (let i = 0; i < 3; i++) {
      chairs.push(['chair', `上排椅${i + 1}`, 250 + i * 130, 170, 320 + i * 130, 230]);
      chairs.push(['chair', `下排椅${i + 1}`, 250 + i * 130, 400, 320 + i * 130, 460]);
    }
    return [
      ['table', '会议长桌', 210, 250, 690, 390, 'container:tableA'],
      ...chairs,
      ['whiteboard', '白板', 180, 30, 500, 60],
      ['tv', '投影幕布', 540, 25, 800, 60],
      ['counter', '茶水边柜', 20, 380, 130, 520, 'container:counterA'],
      ['plant', '会议室绿植', 860, 330, 950, 440]
    ];
  }
  function archive(extra = []) {
    return [
      ['shelf', '档案架一', 40, 90, 300, 210, 'container:shelfA'],
      ['shelf', '档案架二', 40, 240, 300, 360, 'container:shelfB'],
      ['shelf', '档案架三', 700, 90, 960, 210, 'container:shelfC'],
      ['table', '整理台', 380, 250, 620, 380, 'container:tableA'],
      ['crate', '纸箱堆', 700, 260, 800, 360, 'container:crateA'],
      ['cabinet', '索引柜', 380, 60, 620, 130, 'container:cabA'],
      ['plant', '角落绿植', 300, 400, 380, 470]
    ];
  }
  function lab(extra = []) {
    return [
      ['desk', '实验台一', 120, 200, 380, 300, 'container:deskA'],
      ['desk', '实验台二', 420, 200, 680, 300, 'container:deskB'],
      ['server', '机柜', 720, 90, 860, 330, 'container:serverA'],
      ['cabinet', '零件柜', 40, 90, 110, 300, 'container:cabA'],
      ['chair', '实验凳', 220, 320, 290, 370],
      ['whiteboard', '技术看板', 120, 30, 480, 60],
      ['plant', '实验室绿植', 900, 360, 970, 440]
    ];
  }
  function lounge(extra = []) {
    return [
      ['sofa', '休息沙发', 120, 180, 380, 300],
      ['table', '茶几', 200, 330, 320, 400, 'container:tableA'],
      ['counter', '茶水台', 620, 90, 900, 190, 'container:counterA'],
      ['shelf', '书报架', 620, 300, 780, 420, 'container:shelfA'],
      ['plant', '休息区绿植', 60, 330, 140, 420],
      ['tv', '电视', 420, 30, 660, 60]
    ];
  }
  function vault(extra = []) {
    return [
      ['safe', '保险柜', 340, 60, 620, 240, 'container:safeA'],
      ['table', '清点台', 250, 300, 470, 400, 'container:tableA'],
      ['cabinet', '凭证柜', 40, 90, 130, 300, 'container:cabA'],
      ['crate', '现钞箱', 700, 280, 840, 400, 'container:crateA'],
      ['plant', '前台绿植', 40, 330, 120, 420]
    ];
  }
  function locker(extra = []) {
    return [
      ['locker', '更衣柜一', 60, 80, 200, 300, 'container:lockA'],
      ['locker', '更衣柜二', 220, 80, 360, 300, 'container:lockB'],
      ['bench', '长凳', 430, 170, 640, 240],
      ['counter', '洗手台', 700, 90, 900, 200],
      ['plant', '更衣室绿植', 880, 330, 960, 430]
    ];
  }
  function studio(extra = []) {
    return [
      ['desk', '剪辑台', 120, 200, 380, 310, 'container:deskA'],
      ['desk', '设计台', 420, 200, 660, 310, 'container:deskB'],
      ['shelf', '样片架', 700, 80, 900, 210, 'container:shelfA'],
      ['tv', '监视器', 120, 40, 380, 75],
      ['cabinet', '器材柜', 40, 90, 110, 300, 'container:cabA'],
      ['plant', '摄影棚绿植', 860, 340, 950, 440]
    ];
  }
  // 房间主题命名：同一套家具骨架，按房间名换称谓，避免"教练室里摆一排电脑桌"。
  // key 是 slug，value 是 type→label 的覆盖表；未列出的类型沿用模板原名。
  const ROOM_LABELS = {
    manager:     { desk: '主控操作台', cabinet: '服务器机柜', shelf: '指令架', whiteboard: '监控大屏', tv: '状态看板', bench: '操作员工位' },
    'canteen-p': { table: '培养皿台', counter: '取样台', shelf: '样本架', sofa: '观察沙发', tv: '生命体征屏', bench: '值守工位' },
    meeting220:  { table: '战术沙盘', chair: '更衣柜凳', whiteboard: '战术板', tv: '比赛回放屏', counter: '饮水补给台', bench: '球员长凳' },
    'rd-lead':   { desk: '战术分析台', cabinet: '哨子与秒表柜', shelf: '训练手册架', whiteboard: '阵型板', tv: '录像分析屏', bench: '替补席' },
    review301:   { table: '王座前的长桌', chair: '王座', whiteboard: '家族纹章', tv: '占卜镜', counter: '烛台', bench: '侍从长凳' },
    lab3:        { desk: '炼金工作台', server: '符文熔炉', cabinet: '药剂柜', chair: '学徒凳', whiteboard: '配方板', bench: '等候长凳' },
    archive4:    { shelf: '柴火与草药架', table: '原木工作台', crate: '木箱', cabinet: '储物柜', bench: '门边长凳' },
    ticket4:     { safe: '猎枪柜', table: '瞭望记录台', cabinet: '弓箭柜', crate: '补给木箱', bench: '守夜长凳' },
    dispatch5:   { desk: '宝库清点台', cabinet: '金库柜', shelf: '账册架', whiteboard: '藏宝图', tv: '估价屏', bench: '点货长凳' },
    meeting5:    { table: '祭坛石台', chair: '跪凳', whiteboard: '古老符文', tv: '献祭之火', counter: '香炉台', bench: '信徒长凳' },
    finance6:    { safe: '船长保险箱', table: '航海图桌', cabinet: '朗姆酒柜', crate: '货箱', bench: '舵手长凳' },
    meeting6:    { table: '货单桌', chair: '捆货凳', whiteboard: '载货清单', tv: '航速表', counter: '捆货台', bench: '装卸长凳' },
    board7:      { table: '会客长桌', chair: '真皮沙发椅', whiteboard: '当代艺术画', tv: '全息投影', counter: '吧台', bench: '落地窗长凳' },
    locker7:     { locker: '义体冷藏柜', bench: '霓虹长凳', counter: '拉面摊台面' },
    // ===== 放大后新增（每层 6 间）：同一套家具骨架，按房间身份换称谓 =====
    server1:     { desk: '服务器机柜排', server: '核心机柜', cabinet: '线缆柜', chair: '运维椅', whiteboard: '网络拓扑板', shelf: '备件架' },
    armory1:     { safe: '武器保险柜', table: '武器维护台', cabinet: '枪械柜', crate: '弹药箱' },
    medbay1:     { desk: '诊疗台', cabinet: '药品柜', shelf: '病历架', whiteboard: 'X 光片', tv: '生命监护屏' },
    cryo1:       { locker: '休眠舱', bench: '准备长凳', counter: '更衣台' },
    physio2:     { desk: '理疗床', server: '冷疗机', cabinet: '绷带柜', chair: '诊疗凳', whiteboard: '康复计划', shelf: '护具架' },
    equip2:      { shelf: '球具架', table: '装备登记台', crate: '器材箱', cabinet: '护具柜' },
    tactics2:    { table: '战术沙盘', chair: '球员席', whiteboard: '战术板', tv: '比赛回放屏', counter: '补水台' },
    referee2:    { desk: '裁判席', cabinet: '判罚记录柜', shelf: '规则手册架', tv: '回放监视器' },
    armory3:     { safe: '兵器柜', table: '磨刀台', cabinet: '盾牌架', crate: '箭矢箱' },
    library3:    { shelf: '古籍架', table: '抄写台', crate: '卷轴箱', cabinet: '禁书架' },
    dungeon3:    { locker: '囚笼', bench: '刑凳', counter: '看守台' },
    chapel3:     { sofa: '祈祷长椅', table: '供桌', counter: '圣水台', shelf: '经书架', tv: '神像' },
    camp4:       { sofa: '营火座', table: '野餐桌', counter: '炊事台', shelf: '补给架' },
    herb4:       { desk: '配药台', server: '蒸馏器', cabinet: '草药柜', chair: '研药凳', whiteboard: '药方板' },
    tree4:       { shelf: '树洞储物架', table: '木工台', crate: '松果箱' },
    watch4:      { desk: '瞭望台', tv: '望远镜屏', shelf: '信号旗架', cabinet: '记录柜' },
    torture5:    { locker: '刑具柜', bench: '铁凳', counter: '审讯台' },
    crypt5:      { safe: '石棺', table: '陪葬品台', cabinet: '骨灰龛', crate: '殉葬箱' },
    alchemy5:    { desk: '炼金台', server: '坩埚炉', cabinet: '药剂柜', chair: '学徒凳', whiteboard: '配方板' },
    cell5:       { shelf: '囚犯名册', table: '审讯记录台', crate: '囚粮箱' },
    galley6:     { sofa: '厨房长凳', table: '备餐台', counter: '灶台', shelf: '食材架' },
    magazine6:   { shelf: '火药架', crate: '炮弹箱', table: '装填台', cabinet: '武器柜' },
    crew6:       { locker: '吊床柜', bench: '水手长凳', counter: '洗漱台' },
    crow6:       { desk: '瞭望台', tv: '瞭望镜', shelf: '信号旗架', cabinet: '航海图柜' },
    clinic7:     { desk: '手术台', server: '义体冷却机', cabinet: '植入体柜', chair: '诊疗椅', whiteboard: '义体蓝图' },
    market7:     { shelf: '数据芯片架', table: '交易台', crate: '黑市货箱', cabinet: '加密柜' },
    bar7room:    { sofa: '卡座沙发', table: '吧台桌', counter: '吧台', shelf: '酒架', tv: '霓虹屏' },
    roof7:       { desk: '园艺工作台', cabinet: '花架', shelf: '工具架', whiteboard: '温室示意图', tv: '天气屏' }
  };  const TEMPLATES = { office, meeting, archive, lab, lounge, vault, locker, studio };

  // ---------- 七层各自的房间清单 ----------
  // door = 楼层上的门点（**1× 基准世界像素**，随 FLOOR_SCALE 同比放大），实际建造时会就近吸附到可站立位置。
  // 每层 6 间，共 42 间；id 稳定，改动不影响既有容器/经济键。
  // 门点由 online/room-door-scan.mjs 在放大后的楼面上按「可站立 + 从出生点可达 + 彼此≥160px」挑出。
  const ROOM_SPECS = [
    { slug: 'manager',   floorId: 1, kind: 'office',  name: '主控室', door: [300, 250] },
    { slug: 'canteen-p', floorId: 1, kind: 'lounge',  name: '培养舱',   door: [1040, 300] },
    { slug: 'server1',   floorId: 1, kind: 'lab',     name: '数据机房', door: [1000, 92] },
    { slug: 'armory1',   floorId: 1, kind: 'vault',   name: '武器库',   door: [796, 368] },
    { slug: 'medbay1',   floorId: 1, kind: 'office',  name: '医疗舱',   door: [1312, 80] },
    { slug: 'cryo1',     floorId: 1, kind: 'locker',  name: '低温休眠室', door: [1396, 368] },

    { slug: 'meeting220', floorId: 2, kind: 'meeting', name: '球员更衣室', door: [210, 140] },
    { slug: 'rd-lead',   floorId: 2, kind: 'office',  name: '教练室', door: [900, 300] },
    { slug: 'physio2',   floorId: 2, kind: 'lab',     name: '理疗室', door: [964, 80] },
    { slug: 'equip2',    floorId: 2, kind: 'archive', name: '器材室', door: [736, 368] },
    { slug: 'tactics2',  floorId: 2, kind: 'meeting', name: '战术室', door: [1084, 368] },
    { slug: 'referee2',  floorId: 2, kind: 'office',  name: '裁判室', door: [1396, 368] },

    { slug: 'review301', floorId: 3, kind: 'meeting', name: '王座厅', door: [200, 100] },
    { slug: 'lab3',      floorId: 3, kind: 'lab',     name: '炼金室', door: [700, 260] },
    { slug: 'armory3',   floorId: 3, kind: 'vault',   name: '兵器库', door: [916, 80] },
    { slug: 'library3',  floorId: 3, kind: 'archive', name: '藏经阁', door: [652, 368] },
    { slug: 'dungeon3',  floorId: 3, kind: 'locker',  name: '地牢', door: [1072, 368] },
    { slug: 'chapel3',   floorId: 3, kind: 'lounge',  name: '祈祷室', door: [1396, 368] },

    { slug: 'archive4',  floorId: 4, kind: 'archive', name: '林间小屋',     door: [200, 100] },
    { slug: 'ticket4',   floorId: 4, kind: 'vault',   name: '守林人哨站',     door: [700, 260] },
    { slug: 'camp4',     floorId: 4, kind: 'lounge',  name: '猎人营地', door: [904, 92] },
    { slug: 'herb4',     floorId: 4, kind: 'lab',     name: '草药棚', door: [640, 368] },
    { slug: 'tree4',     floorId: 4, kind: 'archive', name: '树屋', door: [1072, 368] },
    { slug: 'watch4',    floorId: 4, kind: 'studio',  name: '瞭望塔', door: [1396, 368] },

    { slug: 'dispatch5', floorId: 5, kind: 'office',  name: '宝库', door: [300, 240] },
    { slug: 'meeting5',  floorId: 5, kind: 'meeting', name: '献祭祭坛',   door: [520, 332] },
    { slug: 'torture5',  floorId: 5, kind: 'locker',  name: '刑讯室', door: [856, 80] },
    { slug: 'crypt5',    floorId: 5, kind: 'vault',   name: '墓室', door: [592, 368] },
    { slug: 'alchemy5',  floorId: 5, kind: 'lab',     name: '炼金地窖', door: [1048, 368] },
    { slug: 'cell5',     floorId: 5, kind: 'archive', name: '囚室', door: [1396, 368] },

    { slug: 'finance6',  floorId: 6, kind: 'vault',   name: '船长室',   door: [300, 260] },
    { slug: 'meeting6',  floorId: 6, kind: 'meeting', name: '货舱', door: [500, 335] },
    { slug: 'galley6',   floorId: 6, kind: 'lounge',  name: '厨房', door: [856, 80] },
    { slug: 'magazine6', floorId: 6, kind: 'archive', name: '弹药库', door: [592, 356] },
    { slug: 'crew6',     floorId: 6, kind: 'locker',  name: '水手舱', door: [1048, 368] },
    { slug: 'crow6',     floorId: 6, kind: 'studio',  name: '瞭望室', door: [1396, 368] },

    { slug: 'board7',    floorId: 7, kind: 'meeting', name: '顶层公寓', door: [300, 300] },
    { slug: 'locker7',   floorId: 7, kind: 'locker',  name: '霓虹后巷',     door: [1150, 300] },
    { slug: 'clinic7',   floorId: 7, kind: 'lab',     name: '义体诊所', door: [1036, 80] },
    { slug: 'market7',   floorId: 7, kind: 'archive', name: '数据黑市', door: [844, 368] },
    { slug: 'bar7room',  floorId: 7, kind: 'lounge',  name: '酒吧', door: [364, 368] },
    { slug: 'roof7',     floorId: 7, kind: 'office',  name: '天台花园', door: [1396, 368] }
  ];

  const ROOMS = {};
  const ROOM_GEO = {};   // 房间几何（墙体/门/入口/出口/室内地板范围）
  const ROOM_LIST = [];
  // 房间专属家具类型的「单体自深」（房间 px）；其余类型走共享 blocksFor。
  // 声明必须在 buildRooms 之前——建造期会调用 roomBlocksFor。
  const ROOM_SELF_D = { chair: 14, shelf: 22, whiteboard: 12, tv: 12, server: 26, safe: 30, crate: 24, locker: 22, bench: 18 };

  const nX = (v, w) => Math.round(v / 1000 * w);
  const nY = (v, h) => Math.round(v / 1000 * h);
  const nRect = (c, w, h) => {
    const x1 = nX(c[0], w), y1 = nY(c[1], h), x2 = nX(c[2], w), y2 = nY(c[3], h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  // 把一个「希望的门点」吸附到最近的可站立位置：螺旋搜索，最多 40 步。
  // 除了可站立，还要求门牌周围一块净空（不然门牌会压在桌子/树上，见用户截图）。
  // 找不到净空点时退回旧的"只要求可站立"，避免因为拥挤直接丢门。
  function snapDoor(floorId, wanted) {
    const floor = floorById(floorId);
    if (!floor) return null;
    const blockers = floorBlockers(floorId, {});
    const ok = (x, y) => inFloor(floorId, x, y) && !floorCollides(floorId, x, y, blockers) &&
      x > 24 && x < floor.width - 24 && y > 100 && y < floor.height - 20;
    // 门牌 + 地面光带的净空：宽 128、门点上方 72 / 下方 24。
    const clearAt = (x, y) => !floor.furniture.some(f =>
      f.x < x + 64 && f.x + f.w > x - 64 && f.y < y + 24 && f.y + f.h > y - 72);
    const farFromDoors = (x, y) => !ROOM_LIST.some(r => r.floorId === floorId && Math.hypot(r.door.x - x, r.door.y - y) < 130);
    const okClear = (x, y) => ok(x, y) && clearAt(x, y) && farFromDoors(x, y);
    if (okClear(wanted[0], wanted[1])) return { x: wanted[0], y: wanted[1] };
    for (let r = 8; r <= 420; r += 8) {
      for (let a = 0; a < 20; a++) {
        const th = a / 20 * Math.PI * 2;
        const x = Math.round(wanted[0] + Math.cos(th) * r), y = Math.round(wanted[1] + Math.sin(th) * r);
        if (okClear(x, y)) return { x, y };
      }
    }
    for (let r = 8; r <= 320; r += 8) {
      for (let a = 0; a < 16; a++) {
        const th = a / 16 * Math.PI * 2;
        const x = Math.round(wanted[0] + Math.cos(th) * r), y = Math.round(wanted[1] + Math.sin(th) * r);
        if (ok(x, y)) return { x, y };
      }
    }
    return null;
  }

  (function buildRooms() {
    for (const spec of ROOM_SPECS) {
      const size = ROOM_SIZES[spec.kind] || ROOM_SIZES.office;
      const w = size.w, h = size.h;
      const id = `f${spec.floorId}:room:${spec.slug}`;
      // 门点按楼层比例放大：否则 2× 后所有门仍挤在原 1× 区域，东/南半边永远没有房间入口。
      const wantedDoor = [Math.round(spec.door[0] * FLOOR_SCALE), Math.round(spec.door[1] * FLOOR_SCALE)];
      const door = snapDoor(spec.floorId, wantedDoor);
      if (!door) throw new Error(`[rooms] 无法为 ${spec.name} 在 ${spec.floorId}F 找到可站立门点（候选 ${spec.door}）`);
      const room = {
        id, floorId: spec.floorId, slug: spec.slug, kind: spec.kind, name: spec.name,
        width: w, height: h,
        door,                                // 楼层上的门点（进/出都在这里）
        exteriorDoor: { x: door.x, y: door.y, radius: ENTER_PAD },
        depth: 0,
        furniture: [], walls: [], containers: []
      };
      // 南墙门洞中心
      const gap = { x: Math.round(w / 2), half: DOOR_HALF };
      // 室内落点：门内一点点，保证退房后仍在门口
      room.entry = { x: gap.x, y: h - 74 };
      room.exit = { x: gap.x, y: h - 52 };
      // 墙体：上、左、右、下（下墙中间留门洞）
      const addWall = (name, x, y, ww, hh) => {
        const rect = { x, y, w: ww, h: hh };
        room.walls.push({ id: `${id}:wall:${name}`, roomId: id, x, y, w: ww, h: hh,
          type: 'wall', footprint: { ...rect }, depth: y + hh, blocks: [rect] });
      };
      addWall('north', 0, 0, w, WALL_T);
      addWall('west', 0, 0, WALL_T, h);
      addWall('east', w - WALL_T, 0, WALL_T, h);
      addWall('south-l', 0, h - WALL_T, gap.x - gap.half, WALL_T);
      addWall('south-r', gap.x + gap.half, h - WALL_T, w - (gap.x + gap.half), WALL_T);
      // 家具
      const template = TEMPLATES[spec.kind] || TEMPLATES.office;
      // 门内侧的两件小陈设：让玩家一进门就有东西看，而不是先看到一大片空地。
      // 位置固定在门洞（居中 92px 宽）左右两侧，不与任何模板件冲突。
      const doorProps = [
        ['plant', '门边绿植', 90, 760, 170, 880],
        ['bench', '门边长凳', 780, 770, 940, 850]
      ];
      template().concat(doorProps).forEach((row, i) => {
        const [type, label, x1, y1, x2, y2, flag] = row;
        const r = nRect([x1, y1, x2, y2], w, h);
        // 同 floors.js：足迹不得高于家具本身（矮件不能形成头顶隐形墙）。
        // 与 floors.js 保持一致：整件家具都算碰撞，避免人物站进桌面。
        // 默认按素材自身高度给碰撞（留 15% 顶部余量，免得贴图顶端也挡人）；
        // 植物这类矮件保持 18px，避免盆栽形成隐形墙。
        const footHeight = type === 'plant' ? Math.min(r.h, 18) : Math.max(12, Math.round(r.h * 0.85));
        let fid, container = null;
        if (flag && flag.indexOf('container:') === 0) {
          const name = flag.slice('container:'.length);
          fid = `${id}:container:${name}`;
          container = { name: `${spec.name} · ${label}` };
        } else {
          fid = `${id}:${type}:${i}`;
        }
        const themed = (ROOM_LABELS[spec.slug] || {})[type];
        const finalLabel = themed || label;
        const f = { id: fid, roomId: id, floorId: spec.floorId, x: r.x, y: r.y, w: r.w, h: r.h,
          type, label: finalLabel, footprint: { x: r.x, y: r.y + r.h - footHeight, w: r.w, h: footHeight }, depth: r.y + r.h };
        f.blocks = roomBlocksFor(f);
        if (container) { f.container = container; room.containers.push(f); }
        room.furniture.push(f);
      });
      // 进场净空：把入口 56px 内的装饰家具移开，避免一进门就和家具叠在一起（容器保留）。
      const entry = room.entry;
      room.furniture = room.furniture.filter(q => {
        if (q.container) return true;
        const b = q.footprint;
        const dx = Math.max(b.x - entry.x, 0, entry.x - (b.x + b.w));
        const dy = Math.max(b.y - entry.y, 0, entry.y - (b.y + b.h));
        return Math.hypot(dx, dy) >= 56;
      });
      room.geometry = { w, h, wallT: WALL_T, door: gap, entry: room.entry, exit: room.exit };
      ROOMS[id] = room;
      ROOM_GEO[id] = room.geometry;
      ROOM_LIST.push({ id, floorId: spec.floorId, slug: spec.slug, kind: spec.kind, name: spec.name,
        width: w, height: h, door: { ...door } });
    }
  })();

  // 房间内家具的行走碰撞：沿用 world/furniture.js 的同一套语义（画什么撞什么）。
  // 单独包一层是为了让未知 type（chair/shelf/whiteboard/server/safe/locker…）也有合理足迹。
  function roomBlocksFor(f) {
    const { type, label, x, y, w, h } = f;
    const cx = x + w / 2;
    const blk = (bx, by, bw, bh) => ({ x: Math.round(bx * 1000) / 1000, y: Math.round(by * 1000) / 1000,
      w: Math.max(1, Math.round(bw * 1000) / 1000), h: Math.max(1, Math.round(bh * 1000) / 1000) });
    if (ROOM_SELF_D[type] != null) {
      const d = Math.min(h, ROOM_SELF_D[type]);
      return [blk(x, y + h - d, w, d)];
    }
    // 其余（desk/table/cabinet/counter/sofa/plant/seat/stage/mat）走共享实现。
    return blocksFor(f);
  }

  function roomById(id) { return ROOMS[String(id)] || null; }
  function roomsForFloor(floorId) { return ROOM_LIST.filter(r => r.floorId === Number(floorId)).map(r => ({ ...r, door: { ...r.door } })); }
  function roomBlockers(id) {
    const r = roomById(id);
    if (!r) return [];
    return r.furniture.concat(r.walls);
  }
  // 房间坐标系内的可行走判定：矩形内 + 不撞家具/墙（门洞在南墙已留空）。
  function inRoom(id, x, y) {
    const r = roomById(id);
    if (!r) return false;
    if (x < 10 || y < 10 || x > r.width - 10 || y > r.height - 10) return false;
    return true;
  }
  function roomCollides(id, x, y) {
    const r = roomById(id);
    if (!r) return true;
    if (!inRoom(id, x, y)) return true;
    const blockers = roomBlockers(id);
    const BODY_HALF = D.BODY_HALF, FOOT_TOP = D.FOOT_TOP, FOOT_BOTTOM = D.FOOT_BOTTOM;
    for (const it of blockers) {
      const bs = it.blocks && it.blocks.length ? it.blocks : (it.footprint ? [it.footprint] : []);
      for (const b of bs) {
        if (x + BODY_HALF > b.x && x - BODY_HALF < b.x + b.w &&
            y + FOOT_TOP > b.y && y - FOOT_BOTTOM < b.y + b.h) return true;
      }
    }
    return false;
  }
  function roomBounds(id) {
    const r = roomById(id);
    if (!r) return null;
    return { minX: 14, maxX: r.width - 14, minY: 40, maxY: r.height - 18 };
  }
  function roomCamera(id, viewW, viewH, x, y) {
    const r = roomById(id);
    if (!r) return { x: 0, y: 0 };
    const w = r.width, h = r.height;
    // 与楼层一致：某个轴比视口小就居中，否则跟随玩家并夹在房间内。
    // 房间通常大于"一个视口的世界尺寸"（视口按 CSS 高/320 放大），所以必须跟随，
    // 否则站在房间下半部分时会被裁在画面外。
    const px = Number.isFinite(x) ? x : w / 2, py = Number.isFinite(y) ? y : h / 2;
    return {
      x: viewW >= w ? (w - viewW) / 2 : Math.max(0, Math.min(w - viewW, px - viewW / 2)),
      y: viewH >= h ? (h - viewH) / 2 : Math.max(0, Math.min(h - viewH, py - viewH / 2))
    };
  }
  function roomInteractables(id) {
    const r = roomById(id);
    if (!r) return [];
    return r.containers.map(f => ({ ...f, container: { ...f.container } }));
  }
  // 楼层上距离玩家最近、且在其半径内的房间门（用于「按 E 进入」）。
  function roomDoorNear(floorId, x, y, range = ENTER_PAD) {
    let best = null, bestD = Infinity;
    for (const r of ROOM_LIST) {
      if (r.floorId !== Number(floorId)) continue;
      const d = Math.hypot(r.door.x - x, r.door.y - y);
      if (d <= range && d < bestD) { bestD = d; best = r; }
    }
    return best ? { room: { ...best, door: { ...best.door } }, distance: bestD } : null;
  }
  // 统一取"当前空间里的可搜容器"：房间内取房间的，走廊上取楼层的（不含房间内的）。
  function zoneContainers(floorId, zoneId) {
    if (zoneId) return roomInteractables(zoneId);
    const floor = floorById(floorId);
    if (!floor) return [];
    return floor.furniture.filter(f => f.container).map(f => ({ ...f, container: { ...f.container } }));
  }
  function zoneFurniture(floorId, zoneId) {
    if (zoneId) return roomById(zoneId) ? roomById(zoneId).furniture.slice() : [];
    return floorById(floorId) ? floorById(floorId).furniture.slice() : [];
  }
  function zoneBlockers(floorId, zoneId) {
    return zoneId ? roomBlockers(zoneId) : floorBlockers(floorId);
  }
  function zoneCollides(floorId, zoneId, x, y) {
    return zoneId ? roomCollides(zoneId, x, y) : floorCollides(floorId, x, y);
  }
  function zoneBounds(floorId, zoneId) {
    if (zoneId) return roomBounds(zoneId);
    return D.floorBounds(floorId);
  }
  function zoneCamera(floorId, zoneId, viewW, viewH, x, y) {
    if (zoneId) return roomCamera(zoneId, viewW, viewH, x, y);
    return D.cameraBounds(floorId, viewW, viewH, x, y);
  }

  return {
    ROOM_SIZES, WALL_T, DOOR_HALF, ENTER_PAD, ROOM_SPECS, ROOM_LIST, ROOMS, ROOM_GEO,
    roomById, roomsForFloor, roomBlockers, roomCollides, inRoom, roomBounds, roomCamera,
    roomInteractables, roomDoorNear, zoneContainers, zoneFurniture, zoneBlockers, zoneCollides,
    zoneBounds, zoneCamera, roomBlocksFor, ROOM_SELF_D
  };
});
