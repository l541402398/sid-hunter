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
  const D = isNode ? Object.assign({}, require('./config.js'), require('./geometry.js'), require('./furniture.js'), require('./floors.js'), { TMJ: require('./tmj.js') }) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { blocksFor, floorById, floorCollides, floorBlockers, inFloor, TMJ } = D;
  // ---------- 房间尺寸（世界像素） ----------
  // 房间是独立空间，不随楼层放大：楼层放大是为了容纳更多人，房间再放大会变成"空荡的大厅"。
  // 进房后客户端会把镜头缩到整间屋子（见 game.js 的 applyViewport），所以小房间反而更有"进屋"感。
  const ROOM_SCALE = 1;
  // 楼层上的门点写在「1× 基准世界像素」里，建造时随楼层同比例放大（与 FLOOR_SPECS 一致）。
  const FLOOR_SCALE = D.FLOOR_SCALE || 1;
  const SC = (v) => Math.round(v * ROOM_SCALE);
  const BASE_ROOM_SIZES = {
    office: { w: 620, h: 420 },
    meeting: { w: 760, h: 470 },
    archive: { w: 700, h: 450 },
    lab: { w: 660, h: 440 },
    lounge: { w: 600, h: 400 },
    vault: { w: 560, h: 380 },
    locker: { w: 520, h: 360 },
    studio: { w: 640, h: 430 }
  };
  const ROOM_SIZES = {
    office: { w: SC(832), h: SC(560) },
    meeting: { w: SC(1008), h: SC(624) },
    archive: { w: SC(928), h: SC(592) },
    lab: { w: SC(880), h: SC(576) },
    lounge: { w: SC(800), h: SC(528) },
    vault: { w: SC(752), h: SC(512) },
    locker: { w: SC(704), h: SC(480) },
    studio: { w: SC(864), h: SC(576) }
  };
  const WALL_T = 24;         // 房间侧墙/南墙厚
  const NORTH_WALL_T = 76;   // 房间 3/4 视角北墙高度（容纳挂屏/白板/采光窗，杜绝伸出黑边）
  const DOOR_HALF = 46;      // 房间南墙门洞半宽
  const ENTER_PAD = 56;      // 楼层上「门口可按 E」的半径

  // ---------- 房间模板（按室内建筑三段式分区：北墙挂件 0..76、北沿柜列 y>=84、中央主功能组团、南角迎宾区） ----------
  // kind 决定默认尺寸与配色；furniture 行格式同 floors.js：[type,label,x1,y1,x2,y2,flag?]
  // flag 'container:<name>' → 生成稳定 ID `f{floor}:room:{slug}:container:{name}`。
  function office(extra = []) {
    return [
      ['tv', '园区数据挂屏', 275, 30, 445, 75],
      ['whiteboard', '研发日程看板', 475, 30, 665, 75],
      ['cabinet', '原木档案矮柜', 60, 150, 250, 225, 'container:cabA'],
      ['shelf', '北墙专业书架', 685, 150, 935, 225, 'container:shelfA'],
      ['desk', '研发主管书桌', 240, 430, 530, 525, 'container:deskA'],
      ['armchair', '访客接待单椅', 575, 435, 655, 520],
      ['cooler', '山泉直饮水机', 865, 435, 935, 525],
      ...extra
    ];
  }
  function meeting(extra = []) {
    return [
      ['whiteboard', '共创研讨白板', 190, 30, 470, 75],
      ['tv', '投屏演示大屏', 525, 30, 790, 75],
      ['counter', '会议茶歇边柜', 60, 150, 265, 225, 'container:counterA'],
      ['plant', '北角散尾葵', 875, 155, 945, 230],
      ['table', '胡桃木会议长桌', 250, 435, 710, 535, 'container:tableA'],
      ['chair', '主讲木椅', 745, 450, 815, 525],
      ...extra
    ];
  }
  function archive(extra = []) {
    return [
      ['shelf', '典藏木书架一', 60, 150, 300, 225, 'container:shelfA'],
      ['cabinet', '分类索引木柜', 375, 150, 625, 225, 'container:cabA'],
      ['shelf', '典藏木书架三', 700, 150, 940, 225, 'container:shelfC'],
      ['shelf', '典藏木书架二', 60, 440, 290, 520, 'container:shelfB'],
      ['table', '阳光阅览整理台', 375, 445, 635, 535, 'container:tableA'],
      ['crate', '手稿收纳木箱', 725, 455, 845, 530, 'container:crateA'],
      ['plant', '书斋万年青', 875, 455, 945, 535],
      ...extra
    ];
  }
  function lab(extra = []) {
    return [
      ['whiteboard', '研发实验看板', 350, 30, 650, 75],
      ['cabinet', '实验耗材木柜', 60, 150, 250, 225, 'container:cabA'],
      ['server', '恒温自控仪器柜', 720, 150, 920, 225, 'container:serverA'],
      ['desk', '研发实验台一', 180, 435, 440, 525, 'container:deskA'],
      ['desk', '研发实验台二', 500, 435, 760, 525, 'container:deskB'],
      ['plant', '实验室迷迭香', 855, 450, 935, 530],
      ...extra
    ];
  }
  function lounge(extra = []) {
    return [
      ['tv', '园区风景画屏', 150, 30, 430, 75],
      ['counter', '现磨咖啡吧台', 540, 155, 910, 235, 'container:counterA'],
      ['sofa', '暖阳布艺沙发', 225, 375, 525, 465],
      ['table', '烘焙茶叙圆桌', 285, 530, 455, 615, 'container:tableA'],
      ['shelf', '期刊绘本木架', 715, 445, 925, 535, 'container:shelfA'],
      ...extra
    ];
  }
  function vault(extra = []) {
    return [
      ['cabinet', '胡桃木凭证柜', 65, 155, 285, 235, 'container:cabA'],
      ['safe', '研发典藏保险柜', 400, 155, 620, 235, 'container:safeA'],
      ['table', '典藏品鉴长桌', 250, 445, 570, 535, 'container:tableA'],
      ['crate', '封存礼盒木箱', 700, 455, 845, 535, 'container:crateA'],
      ['plant', '迎宾金桔树', 875, 455, 945, 535],
      ...extra
    ];
  }
  function locker(extra = []) {
    return [
      ['locker', '员工原木衣柜一', 65, 160, 265, 245, 'container:lockA'],
      ['locker', '员工原木衣柜二', 300, 160, 500, 245, 'container:lockB'],
      ['counter', '暖光洗漱台', 650, 160, 920, 245],
      ['bench', '原木换鞋长凳', 340, 470, 660, 550],
      ['plant', '休息室绿植', 860, 470, 940, 555],
      ...extra
    ];
  }
  function studio(extra = []) {
    return [
      ['tv', '色彩校准画屏', 340, 30, 620, 75],
      ['cabinet', '画材收纳木柜', 60, 150, 260, 225, 'container:cabA'],
      ['shelf', '手绘作品陈列架', 690, 150, 930, 225, 'container:shelfA'],
      ['desk', '手绘创作台一', 175, 435, 435, 525, 'container:deskA'],
      ['desk', '色彩设计台二', 495, 435, 755, 525, 'container:deskB'],
      ['plant', '画室琴叶榕', 855, 450, 935, 530],
      ...extra
    ];
  }
  // 房间主题命名：统一温暖现代研发大楼语境，保留全部 slug 与稳定容器键。
  const ROOM_LABELS = {
    manager:     { desk: '行政接待书桌', cabinet: '访客档案木柜', shelf: '园区年鉴书架', whiteboard: '接待日程看板', tv: '园区导览挂屏', bench: '迎宾木长凳' },
    'canteen-p': { table: '阳光烘焙圆桌', counter: '鲜果烘焙吧台', shelf: '手作果酱陈列架', sofa: '暖阳布艺沙发', tv: '今日烘焙菜单屏', bench: '茶歇木凳' },
    meeting220:  { table: '友谊赛沙盘长桌', chair: '球员木椅', whiteboard: '友谊赛战术板', tv: '精彩集锦屏', counter: '能量饮补给台', bench: '球员休息凳' },
    'rd-lead':   { desk: '场馆主管书桌', cabinet: '纪念奖章木柜', shelf: '运动图鉴架', whiteboard: '场馆排期板', tv: '赛况回放屏', bench: '场边木长凳' },
    review301:   { table: '图书研讨长桌', chair: '胡桃木椅', whiteboard: '学术议程板', tv: '馆藏检索屏', counter: '暖茶边柜', bench: '伴读长凳' },
    lab3:        { desk: '古籍修复工作台', server: '恒湿典藏柜', cabinet: '装帧材料木柜', chair: '工坊木凳', whiteboard: '修复工序板', bench: '休息木凳' },
    archive4:    { shelf: '植物标本木架', table: '园艺整理长桌', crate: '良种收纳木箱', cabinet: '园艺工具柜', bench: '门边木长凳' },
    ticket4:     { safe: '珍稀种子保险柜', table: '温室观测长桌', cabinet: '植物日志柜', crate: '营养基质箱', bench: '花房木长凳' },
    dispatch5:   { desk: '策展人办公桌', cabinet: '胡桃木展品柜', shelf: '研发史料架', whiteboard: '展陈排期板', tv: '数字展陈屏', bench: '观展长凳' },
    meeting5:    { table: '学术沙龙长桌', chair: '讲堂木椅', whiteboard: '专题分享板', tv: '高清投影屏', counter: '热可可茶台', bench: '讲堂木长凳' },
    finance6:    { safe: '精品豆典藏柜', table: '咖啡杯测长桌', cabinet: '烘焙配方柜', crate: '庄园生豆木箱', bench: '休息木长凳' },
    meeting6:    { table: '下午茶研讨长桌', chair: '胡桃餐椅', whiteboard: '特调风味板', tv: '咖啡文化屏', counter: '手冲料理台', bench: '咖啡厅长凳' },
    board7:      { table: '露台沙龙长桌', chair: '暖白扶手椅', whiteboard: '音乐会节目单', tv: '晴空天幕屏', counter: '气泡饮吧台', bench: '观景窗长凳' },
    locker7:     { locker: '露台储物木柜', bench: '暖阳木长凳', counter: '清爽洗漱台' },
    server1:     { desk: '环境监控工作台', server: '楼宇自控机柜', cabinet: '工程图纸木柜', whiteboard: '能耗监测看板' },
    armory1:     { safe: '礼宾纪念保险柜', table: '庆典物料整理台', cabinet: '礼盒收纳木柜', crate: '活动物资木箱' },
    medbay1:     { desk: '健康问诊木桌', cabinet: '常备医药木柜', shelf: '健康手册书架', whiteboard: '四季健康贴士', tv: '舒缓导引屏' },
    cryo1:       { locker: '员工午休衣柜', bench: '暖阳午休长凳', counter: '温水洗漱台' },
    physio2:     { desk: '阳光理疗木台', server: '热敷毛巾柜', cabinet: '草本精油柜', chair: '放松木椅', whiteboard: '伸展运动图', shelf: '瑜伽垫木架' },
    equip2:      { shelf: '羽毛球拍木架', table: '运动器材登记台', crate: '野餐飞盘箱', cabinet: '网球收纳柜' },
    tactics2:    { table: '绿茵沙盘长桌', chair: '俱乐部木椅', whiteboard: '趣味赛程板', tv: '晴空球场屏', counter: '柠檬水吧台' },
    referee2:    { desk: '赛会记录木桌', cabinet: '荣誉绶带柜', shelf: '友爱规则书架', tv: '慢放回看屏' },
    armory3:     { safe: '善本恒温保险柜', table: '古籍校勘长桌', cabinet: '文献索引木柜', crate: '善本函套木箱' },
    library3:    { shelf: '研发文献木架', table: '期刊阅览整理台', crate: '学术手稿木箱', cabinet: '分类编目木柜' },
    dungeon3:    { locker: '馆员储物木柜', bench: '原木小憩长凳', counter: '暖光整理洗手台' },
    chapel3:     { sofa: '静音伴读软榻', table: '深研阅读圆桌', counter: '自助暖茶吧台', shelf: '外文期刊木架', tv: '馆藏导览画屏' },
    camp4:       { sofa: '温室暖阳沙发', table: '花房茶叙圆桌', counter: '草本茶饮吧台', shelf: '茶器花艺木架', tv: '温室微气候屏' },
    herb4:       { desk: '花草茶研工作台', server: '恒温烘焙醒发柜', cabinet: '花草茶叶木柜', chair: '茶艺师木凳', whiteboard: '茶饮烘焙配方板' },
    tree4:       { shelf: '育苗器皿木架', table: '园艺分株工作台', crate: '营养基质收纳箱', cabinet: '良种分类木柜' },
    watch4:      { desk: '植物图谱工作台', tv: '温室光照监测屏', shelf: '植物志陈列架', cabinet: '物候记录木柜' },
    torture5:    { locker: '展务人员储物柜', bench: '胡桃木小憩长凳', counter: '暖光茶歇洗手台' },
    crypt5:      { safe: '里程碑专利金柜', table: '原型机品鉴台', cabinet: '晶圆样品陈列柜', crate: '典藏铭牌木箱' },
    alchemy5:    { desk: '天文光学展陈台', server: '恒温光学仪器柜', cabinet: '星图拓片木柜', chair: '研究员木凳', whiteboard: '天文历法导览板' },
    cell5:       { shelf: '研发编年史木架', table: '文献数字化长桌', crate: '早期手稿典藏箱', cabinet: '历史影像档案柜' },
    galley6:     { sofa: '烘焙沙龙软榻', table: '欧包醒发料理台', counter: '现烤可颂操作台', shelf: '天然酵母陈列架', tv: '出炉时刻表画屏' },
    magazine6:   { shelf: '原料风味陈列架', crate: '庄园可可豆木箱', table: '西点造型研发台', cabinet: '恒温黄油储藏柜' },
    crew6:       { locker: '咖啡师储物木柜', bench: '休息室木长凳', counter: '暖光净手洗漱台' },
    crow6:       { desk: '精品手冲萃茶台', tv: '产区风味导览屏', shelf: '手冲器具陈列架', cabinet: '单品熟豆木柜' },
    clinic7:     { desk: '草本舒缓调配台', server: '恒温热敷毛巾柜', cabinet: '植物精油木柜', chair: '云端休憩单椅', whiteboard: '呼吸冥想导引板' },
    market7:     { shelf: '研发文创陈列架', table: '纪念徽章展陈台', crate: '园区礼盒收纳箱', cabinet: '手作周边木柜' },
    bar7room:    { sofa: '露台阳光卡座', table: '鲜果特饮圆桌', counter: '云端果汁吧台', shelf: '特调杯具木架', tv: '晚霞风景屏' },
    roof7:       { desk: '天台花艺工作台', cabinet: '多肉盆栽木架', shelf: '园艺花洒架', whiteboard: '空中花园导览', tv: '晴空日照屏' }
  };  const TEMPLATES = { office, meeting, archive, lab, lounge, vault, locker, studio };

  // ---------- 七层各自的房间清单 ----------
  // door = 楼层上的门点（**1× 基准世界像素**，随 FLOOR_SCALE 同比放大），实际建造时会就近吸附到可站立位置。
  // 每层 6 间，共 42 间；id 稳定，改动不影响既有容器/经济键。
  const ROOM_SPECS = [
    { slug: 'manager',   floorId: 1, kind: 'office',  name: '行政接待室', door: [240, 220] },
    { slug: 'canteen-p', floorId: 1, kind: 'lounge',  name: '阳光烘焙坊', door: [940, 260] },
    { slug: 'server1',   floorId: 1, kind: 'lab',     name: '环境总控室', door: [580, 95] },
    { slug: 'armory1',   floorId: 1, kind: 'vault',   name: '礼宾纪念室', door: [240, 360] },
    { slug: 'medbay1',   floorId: 1, kind: 'office',  name: '健康医务室', door: [1260, 95] },
    { slug: 'cryo1',     floorId: 1, kind: 'locker',  name: '员工午休室', door: [1150, 368] },

    { slug: 'meeting220', floorId: 2, kind: 'meeting', name: '阳光球员更衣室', door: [210, 100] },
    { slug: 'rd-lead',   floorId: 2, kind: 'office',  name: '绿茵教练室', door: [260, 240] },
    { slug: 'physio2',   floorId: 2, kind: 'lab',     name: '运动舒缓室', door: [680, 100] },
    { slug: 'equip2',    floorId: 2, kind: 'archive', name: '球具器材室', door: [1140, 240] },
    { slug: 'tactics2',  floorId: 2, kind: 'meeting', name: '友谊赛沙盘室', door: [1080, 100] },
    { slug: 'referee2',  floorId: 2, kind: 'office',  name: '赛会记录室', door: [1140, 360] },

    { slug: 'review301', floorId: 3, kind: 'meeting', name: '学术研讨室', door: [220, 102] },
    { slug: 'lab3',      floorId: 3, kind: 'lab',     name: '古籍修复室', door: [260, 285] },
    { slug: 'armory3',   floorId: 3, kind: 'vault',   name: '善本珍藏室', door: [740, 102] },
    { slug: 'library3',  floorId: 3, kind: 'archive', name: '文献阅览室', door: [420, 360] },
    { slug: 'dungeon3',  floorId: 3, kind: 'locker',  name: '馆员休息室', door: [1150, 102] },
    { slug: 'chapel3',   floorId: 3, kind: 'lounge',  name: '静音自习室', door: [1150, 310] },

    { slug: 'archive4',  floorId: 4, kind: 'archive', name: '植物标本室', door: [220, 102] },
    { slug: 'ticket4',   floorId: 4, kind: 'vault',   name: '恒温育苗室', door: [570, 220] },
    { slug: 'camp4',     floorId: 4, kind: 'lounge',  name: '阳光茶歇室', door: [780, 102] },
    { slug: 'herb4',     floorId: 4, kind: 'lab',     name: '茶艺烘焙坊', door: [320, 355] },
    { slug: 'tree4',     floorId: 4, kind: 'archive', name: '园艺育苗室', door: [1025, 220] },
    { slug: 'watch4',    floorId: 4, kind: 'studio',  name: '温室观测室', door: [1150, 310] },

    { slug: 'dispatch5', floorId: 5, kind: 'office',  name: '策展办公室', door: [260, 195] },
    { slug: 'meeting5',  floorId: 5, kind: 'meeting', name: '科技报告厅', door: [410, 340] },
    { slug: 'torture5',  floorId: 5, kind: 'locker',  name: '展务休息室', door: [540, 102] },
    { slug: 'crypt5',    floorId: 5, kind: 'vault',   name: '创新成果库', door: [960, 340] },
    { slug: 'alchemy5',  floorId: 5, kind: 'lab',     name: '天文展陈室', door: [960, 102] },
    { slug: 'cell5',     floorId: 5, kind: 'archive', name: '研发史料室', door: [1160, 310] },

    { slug: 'finance6',  floorId: 6, kind: 'vault',   name: '精品豆仓室', door: [240, 210] },
    { slug: 'meeting6',  floorId: 6, kind: 'meeting', name: '观景包厢',   door: [490, 210] },
    { slug: 'galley6',   floorId: 6, kind: 'lounge',  name: '烘焙工坊',   door: [680, 102] },
    { slug: 'magazine6', floorId: 6, kind: 'archive', name: '西点研发室', door: [490, 355] },
    { slug: 'crew6',     floorId: 6, kind: 'locker',  name: '烘焙更衣室', door: [1080, 102] },
    { slug: 'crow6',     floorId: 6, kind: 'studio',  name: '精品手冲室', door: [1140, 310] },

    { slug: 'board7',    floorId: 7, kind: 'meeting', name: '天台沙龙厅', door: [220, 210] },
    { slug: 'locker7',   floorId: 7, kind: 'locker',  name: '露台更衣室', door: [480, 150] },
    { slug: 'clinic7',   floorId: 7, kind: 'lab',     name: '冥想舒缓室', door: [995, 150] },
    { slug: 'market7',   floorId: 7, kind: 'archive', name: '文创纪念坊', door: [1080, 280] },
    { slug: 'bar7room',  floorId: 7, kind: 'lounge',  name: '晚霞特饮吧', door: [220, 340] },
    { slug: 'roof7',     floorId: 7, kind: 'office',  name: '露台花艺室', door: [1040, 360] }
  ];

  const ROOMS = {};
  const ROOM_GEO = {};   // 房间几何（墙体/门/入口/出口/室内地板范围）
  const ROOM_LIST = [];
  // 房间家具的最小碰撞自深（房间 px），与 SCENE.furniture 2× 像素绘制体积对齐，防止人物穿透房间家具。
  // 声明必须在 buildRooms 之前——建造期会调用 roomBlocksFor。
  const ROOM_SELF_D = {
    desk: 40, table: 40, counter: 38, reception: 38,
    sofa: 38, bench: 28, chair: 28, seat: 28,
    cabinet: 44, shelf: 38, server: 44, safe: 44, locker: 44,
    printer: 34, vending: 42, cooler: 34, plant: 28,
    crate: 34, boxstack: 34, treadmill: 32, rack: 34, arcade: 38,
    whiteboard: 18, tv: 18, glass: 18, lamp: 22
  };

  const nX = (v, w) => Math.round(v / 1000 * w);
  const nY = (v, h) => Math.round(v / 1000 * h);
  const nRect = (c, w, h) => {
    const x1 = nX(c[0], w), y1 = nY(c[1], h), x2 = nX(c[2], w), y2 = nY(c[3], h);
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  function snapDoor(floorId, wanted) {
    const floor = floorById(floorId);
    if (!floor) return null;
    const blockers = floorBlockers(floorId, {});
    const openCells = floor._mazeOpen || null;
    const inOpenCell = (x, y) => !openCells || openCells.some(c =>
      Math.abs(x - c.x) <= floor.maze.cellW / 2 - 10 && Math.abs(y - c.y) <= floor.maze.cellH / 2 - 8);
    const ok = (x, y) => (
      inFloor(floorId, x, y) &&
      inFloor(floorId, x - 36, y) &&
      inFloor(floorId, x + 36, y) &&
      inFloor(floorId, x, Math.max(108, y - 48)) &&
      !floorCollides(floorId, x, y, blockers) &&
      inOpenCell(x, y) &&
      x > 48 && x < floor.width - 48 && y > 122 && y < floor.height - 24
    );
    const boxOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    const clearAt = (x, y) => {
      const doorBox = { x: x - 46, y: y - 64, w: 92, h: 76 };
      const furnHit = floor.furniture.some(f => !f.architecturalPlaceholder && boxOverlap(doorBox, {
        x: f.x - 10,
        y: (f.y + f.h) - ((f.type === 'mat' || f.type === 'stage') ? f.h + 6 : Math.max(f.h + 10, 56)),
        w: f.w + 20,
        h: ((f.type === 'mat' || f.type === 'stage') ? f.h + 14 : Math.max(f.h + 18, 64))
      }));
      if (furnHit) return false;
      const wallHit = floor.walls.some(w => boxOverlap(doorBox, { x: w.x - 10, y: w.y - 28, w: w.w + 20, h: w.h + 36 }));
      if (wallHit) return false;
      const npcHit = (floor.npcs || []).some(n => boxOverlap(doorBox, { x: n.x - 42, y: n.y - 68, w: 84, h: 80 }));
      return !npcHit;
    };
    const farFromDoors = (x, y) => !ROOM_LIST.some(r => r.floorId === floorId && Math.hypot(r.door.x - x, r.door.y - y) < 150);
    const okClear = (x, y) => ok(x, y) && clearAt(x, y) && farFromDoors(x, y);
    if (okClear(wanted[0], wanted[1])) return { x: wanted[0], y: wanted[1] };
    for (let r = 12; r <= 520; r += 12) {
      for (let a = 0; a < 24; a++) {
        const th = a / 24 * Math.PI * 2;
        const x = Math.round(wanted[0] + Math.cos(th) * r), y = Math.round(wanted[1] + Math.sin(th) * r);
        if (okClear(x, y)) return { x: x, y: y };
      }
    }
    let best = null, bestD = Infinity;
    for (let y = 126; y < floor.height - 28; y += 12) {
      for (let x = 52; x < floor.width - 52; x += 12) {
        if (!okClear(x, y)) continue;
        const d = Math.hypot(x - wanted[0], y - wanted[1]);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    if (best) return best;
    for (let y = 126; y < floor.height - 28; y += 12) {
      for (let x = 52; x < floor.width - 52; x += 12) {
        if (!ok(x, y) || !clearAt(x, y)) continue;
        const crowd = ROOM_LIST.some(r => r.floorId === floorId && Math.hypot(r.door.x - x, r.door.y - y) < 100);
        const d = Math.hypot(x - wanted[0], y - wanted[1]) + (crowd ? 5000 : 0);
        if (d < bestD) { bestD = d; best = { x, y }; }
      }
    }
    return best;
  }

  (function buildRooms() {
    for (const spec of ROOM_SPECS) {
      const size = ROOM_SIZES[spec.kind] || ROOM_SIZES.office;
      const w = size.w, h = size.h;
      const id = `f${spec.floorId}:room:${spec.slug}`;
      const wantedDoor = [Math.round(spec.door[0] * FLOOR_SCALE), Math.round(spec.door[1] * FLOOR_SCALE)];
      // 美术层楼层（layouts/fN.js）：门嵌在墙面上，门点由布局给出（2× 世界 px），不做吸附。
      const pinned = D.LOBBY_DOORS && D.LOBBY_DOORS[spec.slug];
      const door = pinned ? { x: Math.round(pinned[0] * FLOOR_SCALE / 2), y: Math.round(pinned[1] * FLOOR_SCALE / 2) } : snapDoor(spec.floorId, wantedDoor);
      if (!door) throw new Error(`[rooms] 无法为 ${spec.name} 在 ${spec.floorId}F 找到可站立门点（候选 ${spec.door}）`);
      const room = {
        id, floorId: spec.floorId, slug: spec.slug, kind: spec.kind, name: spec.name,
        width: w, height: h,
        door,
        exteriorDoor: { x: door.x, y: door.y, radius: ENTER_PAD },
        depth: 0,
        furniture: [], walls: [], containers: []
      };
      const gap = { x: Math.round(w / 2), half: DOOR_HALF };
      room.entry = { x: gap.x, y: h - 74 };
      room.exit = { x: gap.x, y: h - 52 };
      const addWall = (name, x, y, ww, hh, customDepth) => {
        const rect = { x, y, w: ww, h: hh };
        room.walls.push({ id: `${id}:wall:${name}`, roomId: id, x, y, w: ww, h: hh,
          type: 'wall', footprint: { ...rect }, depth: customDepth != null ? customDepth : (y + hh), blocks: [rect] });
      };
      addWall('north', 0, 0, w, NORTH_WALL_T, 1);
      addWall('west', 0, 0, WALL_T, h);
      addWall('east', w - WALL_T, 0, WALL_T, h);
      addWall('south-l', 0, h - WALL_T, gap.x - gap.half, WALL_T);
      addWall('south-r', gap.x + gap.half, h - WALL_T, w - (gap.x + gap.half), WALL_T);

      const template = TEMPLATES[spec.kind] || TEMPLATES.office;
      const baseSize = BASE_ROOM_SIZES[spec.kind] || BASE_ROOM_SIZES.office;
      // 门内西南/东南两侧迎宾陈设（与各模板中北家具严格错层，零视觉重叠）
      const doorProps = [
        ['floorlamp', '暖光落地灯', 60, 625, 112, 700],
        ['plant', '迎宾花钵', 68, 790, 142, 880],
        ['bench', '门廊迎宾长凳', 770, 800, 935, 880]
      ];
      template().concat(doorProps).forEach((row, i) => {
        const [type, label, x1, y1, x2, y2, flag] = row;
        const rb = nRect([x1, y1, x2, y2], baseSize.w, baseSize.h);
        const cx = Math.round(((x1 + x2) / 2000) * w);
        const cy = Math.round(((y1 + y2) / 2000) * h);
        const isWallMount = (type === 'tv' || type === 'whiteboard') && y1 <= 85;
        const fw = Math.max(20, Math.round((rb.w * 1.08) / 2) * 2);
        const fh = isWallMount ? 36 : Math.max(16, Math.round((rb.h * 1.08) / 2) * 2);
        const rx = Math.max(WALL_T + 8, Math.min(w - WALL_T - 8 - fw, Math.round((cx - fw / 2) / 2) * 2));
        const ry = isWallMount
          ? 24
          : Math.max(NORTH_WALL_T + 8, Math.min(h - WALL_T - 12 - fh, Math.round((cy - fh / 2) / 2) * 2));
        const r = { x: rx, y: ry, w: fw, h: fh };
        const minD = ROOM_SELF_D[type] || 28;
        const footHeight = isWallMount ? 16 : Math.max(r.h, minD);
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
          type, label: finalLabel, wallMount: isWallMount || undefined,
          footprint: { x: r.x, y: r.y + r.h - footHeight, w: r.w, h: footHeight },
          depth: isWallMount ? (NORTH_WALL_T + 2) : (r.y + r.h) };
        f.blocks = roomBlocksFor(f);
        if (container) { f.container = container; room.containers.push(f); }
        room.furniture.push(f);
      });
      const entry = room.entry;
      room.furniture = room.furniture.filter(q => {
        if (q.container || q.wallMount) return true;
        const b = q.footprint;
        const dx = Math.max(b.x - entry.x, 0, entry.x - (b.x + b.w));
        const dy = Math.max(b.y - entry.y, 0, entry.y - (b.y + b.h));
        return Math.hypot(dx, dy) >= 56;
      });
      room.geometry = { w, h, wallT: WALL_T, northWallT: NORTH_WALL_T, door: gap, entry: room.entry, exit: room.exit };
      ROOMS[id] = room;
      ROOM_GEO[id] = room.geometry;
      ROOM_LIST.push({ id, floorId: spec.floorId, slug: spec.slug, kind: spec.kind, name: spec.name,
        width: w, height: h, door: { ...door } });
    }
  })();

  function roomBlocksFor(f) {
    if (f.wallMount) return [];
    const { type, x, y, w, h } = f;
    const blk = (bx, by, bw, bh) => ({ x: Math.round(bx * 1000) / 1000, y: Math.round(by * 1000) / 1000,
      w: Math.max(1, Math.round(bw * 1000) / 1000), h: Math.max(1, Math.round(bh * 1000) / 1000) });
    const minD = ROOM_SELF_D[type] || 28;
    const d = Math.max(h, minD);
    return [blk(x, y + h - d, w, d)];
  }

  // 房间 → TMJ 主题功能区
  const ROOM_TMJ_ZONE = {
    1: { manager: '主控室', 'canteen-p': '低温实验舱', server1: '样本分析台', armory1: '应急冲洗', medbay1: '应急冲洗', cryo1: '低温实验舱' },
    2: { meeting220: '检录更衣', 'rd-lead': '看台补给', physio2: '东侧电梯厅', equip2: '器材库', tactics2: '中央球场', referee2: '跑道直道' },
    3: { review301: '王座厅', lab3: '炼金室', armory3: '宝库', library3: '藏书阁', dungeon3: '中央拱廊', chapel3: '东侧电梯厅' },
    4: { archive4: '林间营地', ticket4: '溪流桥', camp4: '林间营地', herb4: '药草圃', tree4: '树屋', watch4: '古树祭坛' },
    5: { dispatch5: '宝库', meeting5: '铁栅井', torture5: '刑讯室', crypt5: '水牢', alchemy5: '宝库', cell5: '牢房' },
    6: { finance6: '船长室', meeting6: '货舱', galley6: '厨房', magazine6: '炮舱', crew6: '甲板', crow6: '东侧电梯厅' },
    7: { board7: '天台酒吧', locker7: '霓虹街', clinic7: '义体诊所', market7: '黑市', bar7room: '天台酒吧', roof7: '全息塔广场' },
  };
  function applyTMJRoomDoors() {
    if (!TMJ || !TMJ.isEnabled()) return 0;
    let moved = 0;
    const used = new Map();
    for (const r of ROOM_LIST) {
      const zoneName = (ROOM_TMJ_ZONE[r.floorId] || {})[r.slug];
      const map = TMJ.get(r.floorId);
      if (!zoneName || !map) continue;
      const zone = (map.zones || []).find(z => z.name === zoneName);
      if (!zone) continue;
      const ts = (map.tileWidth || 16) * FLOOR_SCALE;
      const zx0 = zone.x * FLOOR_SCALE, zy0 = zone.y * FLOOR_SCALE;
      const zx1 = (zone.x + zone.w) * FLOOR_SCALE, zy1 = (zone.y + zone.h) * FLOOR_SCALE;
      let best = null;
      for (let y = Math.floor(zy0 / ts); y <= Math.ceil(zy1 / ts); y++) {
        for (let x = Math.floor(zx0 / ts); x <= Math.ceil(zx1 / ts); x++) {
          const wx = (x + 0.5) * ts, wy = (y + 0.5) * ts;
          if (wx < zx0 || wx > zx1 || wy < zy0 || wy > zy1) continue;
          if (TMJ.solidAt(r.floorId, wx, wy, FLOOR_SCALE)) continue;
          if ((used.get(r.floorId) || []).some(u => Math.hypot(u.x - wx, u.y - wy) < 64)) continue;
          const d = (wx - r.door.x) ** 2 + (wy - r.door.y) ** 2;
          if (!best || d < best.d) best = { x: wx, y: wy, d };
        }
      }
      if (!best) continue;
      const door = { x: best.x, y: best.y };
      r.door = door;
      if (!used.has(r.floorId)) used.set(r.floorId, []);
      used.get(r.floorId).push(door);
      const room = ROOMS[r.id];
      if (room) {
        room.door = { ...door };
        room.exteriorDoor = { x: door.x, y: door.y, radius: ENTER_PAD };
      }
      moved++;
    }
    return moved;
  }

  function roomById(id) { return ROOMS[String(id)] || null; }
  function roomsForFloor(floorId) { return ROOM_LIST.filter(r => r.floorId === Number(floorId)).map(r => ({ ...r, door: { ...r.door } })); }
  function roomBlockers(id) {
    const r = roomById(id);
    if (!r) return [];
    return r.furniture.concat(r.walls);
  }
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
  function roomDoorNear(floorId, x, y, range = ENTER_PAD) {
    let best = null, bestD = Infinity;
    for (const r of ROOM_LIST) {
      if (r.floorId !== Number(floorId)) continue;
      const d = Math.hypot(r.door.x - x, r.door.y - y);
      if (d <= range && d < bestD) { bestD = d; best = r; }
    }
    return best ? { room: { ...best, door: { ...best.door } }, distance: bestD } : null;
  }
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
    zoneBounds, zoneCamera, roomBlocksFor, ROOM_SELF_D, applyTMJRoomDoors
  };
});
