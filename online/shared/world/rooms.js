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

  // ---------- 房间模板（按室内建筑功能分区摆放：北壁收纳展示、中央功能组团、东西边柜、南侧迎宾步道） ----------
  // kind 决定默认尺寸与配色；furniture 行格式同 floors.js：[type,label,x1,y1,x2,y2,flag?]
  // flag 'container:<name>' → 生成稳定 ID `f{floor}:room:{slug}:container:{name}`。
  function office(extra = []) {
    return [
      // 北墙：白板、显示屏与整排资料书架
      ['tv', '阳光挂屏', 130, 32, 330, 58],
      ['whiteboard', '木框日程板', 380, 32, 640, 58],
      ['shelf', '北墙图书架', 680, 95, 930, 195, 'container:shelfA'],
      // 西壁：原木文件柜
      ['cabinet', '原木文件柜', 48, 160, 124, 320, 'container:cabA'],
      // 中区偏北：主管书桌与侧边伴读木椅（留出书桌正前方与南侧大片迎宾通道）
      ['desk', '向阳原木书桌', 240, 210, 520, 340, 'container:deskA'],
      ['chair', '伴读木椅', 548, 250, 622, 325],
      // 东壁偏南：茶歇边几与向阳绿植（彻底让开北墙图书架正前方）
      ['cooler', '山泉茶饮机', 865, 500, 935, 600],
      ['plant', '向阳琴叶榕', 860, 650, 945, 745],
      ...extra
    ];
  }
  function meeting(extra = []) {
    return [
      // 北墙：展示板与幕布
      ['whiteboard', '共创讨论板', 180, 30, 480, 58],
      ['tv', '分享投影幕', 530, 28, 790, 58],
      // 中央地毯区：原木共创长桌（自带南北实木座椅）与主讲木椅
      ['table', '原木共创长桌', 230, 260, 710, 395, 'container:tableA'],
      ['chair', '主讲木椅', 745, 295, 815, 360],
      // 西壁茶水吧台与东壁花木
      ['counter', '手作茶歇边柜', 42, 220, 155, 360, 'container:counterA'],
      ['plant', '阳光花箱', 855, 250, 945, 360],
      ...extra
    ];
  }
  function archive(extra = []) {
    return [
      // 北墙对称典藏书架与中央索引柜
      ['shelf', '典藏木书架一', 55, 90, 310, 190, 'container:shelfA'],
      ['cabinet', '分类索引木柜', 370, 90, 630, 180, 'container:cabA'],
      ['shelf', '典藏木书架三', 690, 90, 945, 190, 'container:shelfC'],
      // 西壁第二排书架（留出宽敞过道）与东壁收纳木箱
      ['shelf', '典藏木书架二', 55, 380, 310, 480, 'container:shelfB'],
      ['crate', '手稿收纳木箱', 740, 260, 860, 355, 'container:crateA'],
      // 中央阅览整理台
      ['table', '阳光阅览整理台', 385, 315, 625, 425, 'container:tableA'],
      ['plant', '书斋万年青', 865, 395, 945, 475],
      ...extra
    ];
  }
  function lab(extra = []) {
    return [
      // 北墙：研究看板、北壁零件柜与原木仪器柜
      ['whiteboard', '工坊配方看板', 150, 30, 500, 58],
      ['cabinet', '工坊材料木柜', 48, 85, 128, 285, 'container:cabA'],
      ['server', '恒温培育木柜', 760, 85, 910, 310, 'container:serverA'],
      // 中央对称双工作台（正前方不摆凳子遮挡交互）
      ['desk', '手作实验台一', 165, 210, 415, 325, 'container:deskA'],
      ['desk', '手作实验台二', 455, 210, 705, 325, 'container:deskB'],
      ['chair', '工坊木凳', 55, 365, 125, 430],
      ['plant', '工坊迷迭香', 855, 355, 940, 445]
    ];
  }
  function lounge(extra = []) {
    return [
      // 北墙：风景挂屏与北侧阳光茶吧
      ['tv', '田园风景画屏', 180, 30, 440, 58],
      ['counter', '阳光咖啡吧台', 560, 80, 910, 185, 'container:counterA'],
      // 中央偏左：温馨布艺沙发与原木茶几（拉开间距，避免沙发紧贴茶几容器）
      ['sofa', '暖阳布艺沙发', 140, 160, 430, 270],
      ['table', '原木茶几', 210, 330, 370, 415, 'container:tableA'],
      // 东壁绘本架与西壁花钵
      ['shelf', '绘本杂志木架', 680, 250, 880, 380, 'container:shelfA'],
      ['plant', '茶室向日葵', 55, 340, 135, 435]
    ];
  }
  function vault(extra = []) {
    return [
      // 北墙居中：镶金典藏柜；西壁：木质凭证柜
      ['safe', '镶金典藏保险柜', 350, 68, 650, 235, 'container:safeA'],
      ['cabinet', '胡桃木凭证柜', 50, 85, 145, 295, 'container:cabA'],
      // 中央清点木桌与东壁礼盒箱
      ['table', '典藏品鉴长桌', 280, 295, 560, 405, 'container:tableA'],
      ['crate', '封存礼盒木箱', 720, 275, 870, 395, 'container:crateA'],
      ['plant', '迎宾金桔树', 55, 335, 135, 430]
    ];
  }
  function locker(extra = []) {
    return [
      // 北壁整齐成排的原木储物柜与东侧洗漱台
      ['locker', '原木更衣柜一', 60, 78, 215, 290, 'container:lockA'],
      ['locker', '原木更衣柜二', 235, 78, 390, 290, 'container:lockB'],
      ['counter', '暖光洗漱台', 660, 82, 920, 195],
      // 中央换鞋木长凳与角落花木
      ['bench', '原木换鞋长凳', 380, 320, 640, 395],
      ['plant', '更衣室绿植', 860, 330, 945, 430]
    ];
  }
  function studio(extra = []) {
    return [
      // 北墙：画屏与东侧样片书架、西壁画材柜
      ['tv', '色彩校准画屏', 150, 35, 420, 68],
      ['shelf', '手绘作品陈列架', 680, 75, 920, 200, 'container:shelfA'],
      ['cabinet', '画材收纳木柜', 48, 88, 125, 295, 'container:cabA'],
      // 中央双创作木台
      ['desk', '手绘创作台一', 160, 215, 410, 330, 'container:deskA'],
      ['desk', '色彩设计台二', 445, 215, 695, 330, 'container:deskB'],
      ['plant', '画室琴叶榕', 855, 340, 945, 435]
    ];
  }
  // 房间主题命名：同一套温馨家具骨架，按星露谷风温暖房间身份赋予美好的称谓。
  const ROOM_LABELS = {
    manager:     { desk: '晨光迎宾总台', cabinet: '社区档案木柜', shelf: '小镇年鉴架', whiteboard: '晨间日程板', tv: '晴雨播报屏', bench: '迎宾木长凳' },
    'canteen-p': { table: '阳光烘焙圆桌', counter: '鲜果甜点吧台', shelf: '果酱陈列架', sofa: '暖阳布艺沙发', tv: '今日菜单屏', bench: '茶歇木凳' },
    meeting220:  { table: '友谊赛沙盘桌', chair: '球员木椅', whiteboard: '友谊赛战术板', tv: '精彩集锦屏', counter: '鲜榨果汁补给台', bench: '球员休息凳' },
    'rd-lead':   { desk: '教练原木书桌', cabinet: '纪念奖章木柜', shelf: '运动图鉴架', whiteboard: '晴空阵型板', tv: '赛况回放屏', bench: '场边木长凳' },
    review301:   { table: '书院议事长桌', chair: '雕花木椅', whiteboard: '书院纹章板', tv: '星图挂毯', counter: '暖茶边柜', bench: '伴读长凳' },
    lab3:        { desk: '草本调香台', server: '恒温花露柜', cabinet: '精油木柜', chair: '工坊木凳', whiteboard: '调香配方板', bench: '休息木凳' },
    archive4:    { shelf: '干花与草本架', table: '原木园艺台', crate: '良种木箱', cabinet: '农具收纳柜', bench: '门边木长凳' },
    ticket4:     { safe: '珍稀种子柜', table: '林间观测台', cabinet: '园丁日志柜', crate: '果蔬补给箱', bench: '守林木长凳' },
    dispatch5:   { desk: '典藏品鉴台', cabinet: '胡桃木宝库柜', shelf: '古籍善本架', whiteboard: '星象手绘卷', tv: '古董鉴赏屏', bench: '阅览长凳' },
    meeting5:    { table: '星象共读长桌', chair: '司书木椅', whiteboard: '二十四节气图', tv: '暖金壁灯屏', counter: '热可可茶台', bench: '学堂木长凳' },
    finance6:    { safe: '船长甜品金库', table: '航海美食图桌', cabinet: '香草曲奇柜', crate: '热带果干箱', bench: '观海木长凳' },
    meeting6:    { table: '下午茶长桌', chair: '甲板藤椅', whiteboard: '航海甜品单', tv: '晴海气象屏', counter: '冰淇淋料理台', bench: '甲板长凳' },
    board7:      { table: '云端庆典长桌', chair: '暖白沙发椅', whiteboard: '小镇风景油画', tv: '阳光天窗屏', counter: '气泡饮吧台', bench: '观景窗长凳' },
    locker7:     { locker: '露台泳衣木柜', bench: '暖阳木长凳', counter: '鲜果冰沙台' },
    // ===== 每层 6 间独立小房间：全部采用明媚、治愈的星露谷风称谓 =====
    server1:     { desk: '气象记录木台', server: '温室自控木柜', cabinet: '图纸木柜', chair: '记录员木椅', whiteboard: '小镇气象板', shelf: '仪器手册架' },
    armory1:     { safe: '庆典礼花保险柜', table: '游园道具整理台', cabinet: '彩带礼盒柜', crate: '庆典灯笼箱' },
    medbay1:     { desk: '草本理疗木桌', cabinet: '花草茶药柜', shelf: '健康手札架', whiteboard: '四季养生图', tv: '舒缓音乐屏' },
    cryo1:       { locker: '午休原木衣柜', bench: '阳光午休凳', counter: '香薰洗漱台' },
    physio2:     { desk: '阳光理疗木台', server: '热敷毛巾柜', cabinet: '草本精油柜', chair: '放松木椅', whiteboard: '伸展运动图', shelf: '瑜伽垫木架' },
    equip2:      { shelf: '羽毛球拍木架', table: '运动器材登记台', crate: '野餐飞盘箱', cabinet: '网球收纳柜' },
    tactics2:    { table: '绿茵沙盘长桌', chair: '俱乐部木椅', whiteboard: '趣味赛程板', tv: '晴空球场屏', counter: '柠檬水吧台' },
    referee2:    { desk: '赛会记录木桌', cabinet: '荣誉绶带柜', shelf: '友爱规则书架', tv: '慢放回看屏' },
    armory3:     { safe: '皇家绘本珍藏柜', table: '金箔装帧台', cabinet: '羽毛笔木柜', crate: '火漆印章箱' },
    library3:    { shelf: '童话古籍木架', table: '手抄绘本台', crate: '画卷收纳箱', cabinet: '诗集木柜' },
    dungeon3:    { locker: '剧团戏服木柜', bench: '换装木长凳', counter: '道具化妆台' },
    chapel3:     { sofa: '晨光聆听长椅', table: '鲜花琴谱台', counter: '八音盒陈列台', shelf: '乐谱木架', tv: '彩绘花窗' },
    camp4:       { sofa: '林间野餐软垫', table: '松木野餐桌', counter: '果木炊事台', shelf: '野炊餐具架' },
    herb4:       { desk: '鲜花干燥木台', server: '纯露蒸馏木柜', cabinet: '薄荷甘菊柜', chair: '花匠木凳', whiteboard: '花草图谱板' },
    tree4:       { shelf: '树屋图书木架', table: '松果手作台', crate: '橡果储藏箱' },
    watch4:      { desk: '林冠观鸟木台', tv: '森林望远镜窗', shelf: '鸟类图鉴架', cabinet: '自然笔记柜' },
    torture5:    { locker: '茶具典藏木柜', bench: '品茗木长凳', counter: '紫砂煮茶台' },
    crypt5:      { safe: '琥珀标本珍藏柜', table: '宝石鉴赏木台', cabinet: '矿石陈列柜', crate: '晶石礼盒箱' },
    alchemy5:    { desk: '星光手账工作台', server: '暖灯烘干木柜', cabinet: '彩墨琉璃柜', chair: '学徒木凳', whiteboard: '星座手绘板' },
    cell5:       { shelf: '旧时光信件架', table: '明信片书写台', crate: '纪念邮票箱' },
    galley6:     { sofa: '船员茶歇软榻', table: '海景备餐木台', counter: '华夫饼烘烤台', shelf: '香料果酱架' },
    magazine6:   { shelf: '缤纷糖罐木架', crate: '马卡龙礼盒箱', table: '翻糖造型台', cabinet: '巧克力恒温柜' },
    crew6:       { locker: '水手阳光衣柜', bench: '甲板木长凳', counter: '海风洗漱台' },
    crow6:       { desk: '晴海观景木台', tv: '海豚观测镜', shelf: '航海彩旗架', cabinet: '晴空海图柜' },
    clinic7:     { desk: '芳疗SPA木台', server: '香氛毛巾暖柜', cabinet: '花瓣精油柜', chair: '云端躺椅', whiteboard: '芳香冥想图' },
    market7:     { shelf: '手作文创木架', table: '农夫市集展台', crate: '蜂蜜果酱礼箱', cabinet: '工艺品木柜' },
    bar7room:    { sofa: '露台阳光卡座', table: '鲜果特饮圆桌', counter: '云端果汁吧台', shelf: '琉璃杯木架', tv: '晚霞风景屏' },
    roof7:       { desk: '天台花艺工作台', cabinet: '多肉盆栽木架', shelf: '园艺花洒架', whiteboard: '空中花园导览', tv: '晴空日照屏' }
  };  const TEMPLATES = { office, meeting, archive, lab, lounge, vault, locker, studio };

  // ---------- 七层各自的房间清单 ----------
  // door = 楼层上的门点（**1× 基准世界像素**，随 FLOOR_SCALE 同比放大），实际建造时会就近吸附到可站立位置。
  // 每层 6 间，共 42 间；id 稳定，改动不影响既有容器/经济键。
  const ROOM_SPECS = [
    { slug: 'manager',   floorId: 1, kind: 'office',  name: '晨光迎宾室', door: [240, 220] },
    { slug: 'canteen-p', floorId: 1, kind: 'lounge',  name: '阳光烘焙坊', door: [940, 260] },
    { slug: 'server1',   floorId: 1, kind: 'lab',     name: '小镇气象站', door: [580, 95] },
    { slug: 'armory1',   floorId: 1, kind: 'vault',   name: '庆典礼花屋', door: [240, 360] },
    { slug: 'medbay1',   floorId: 1, kind: 'office',  name: '草本茶疗室', door: [1260, 95] },
    { slug: 'cryo1',     floorId: 1, kind: 'locker',  name: '暖阳午休室', door: [1150, 368] },

    { slug: 'meeting220', floorId: 2, kind: 'meeting', name: '阳光球员更衣室', door: [210, 100] },
    { slug: 'rd-lead',   floorId: 2, kind: 'office',  name: '绿茵教练室', door: [260, 240] },
    { slug: 'physio2',   floorId: 2, kind: 'lab',     name: '运动舒缓室', door: [680, 100] },
    { slug: 'equip2',    floorId: 2, kind: 'archive', name: '球具器材室', door: [1140, 240] },
    { slug: 'tactics2',  floorId: 2, kind: 'meeting', name: '友谊赛沙盘室', door: [1080, 100] },
    { slug: 'referee2',  floorId: 2, kind: 'office',  name: '赛会记录室', door: [1140, 360] },

    { slug: 'review301', floorId: 3, kind: 'meeting', name: '暖木议事厅', door: [220, 102] },
    { slug: 'lab3',      floorId: 3, kind: 'lab',     name: '草本调香坊', door: [260, 285] },
    { slug: 'armory3',   floorId: 3, kind: 'vault',   name: '绘本珍藏馆', door: [740, 102] },
    { slug: 'library3',  floorId: 3, kind: 'archive', name: '童话藏书阁', door: [420, 360] },
    { slug: 'dungeon3',  floorId: 3, kind: 'locker',  name: '剧团衣帽间', door: [1150, 102] },
    { slug: 'chapel3',   floorId: 3, kind: 'lounge',  name: '八音盒音乐室', door: [1150, 310] },

    { slug: 'archive4',  floorId: 4, kind: 'archive', name: '林间木屋',   door: [220, 102] },
    { slug: 'ticket4',   floorId: 4, kind: 'vault',   name: '守林人花房', door: [570, 220] },
    { slug: 'camp4',     floorId: 4, kind: 'lounge',  name: '阳光野餐营地', door: [780, 102] },
    { slug: 'herb4',     floorId: 4, kind: 'lab',     name: '干花香草棚', door: [320, 355] },
    { slug: 'tree4',     floorId: 4, kind: 'archive', name: '松果树屋',   door: [1025, 220] },
    { slug: 'watch4',    floorId: 4, kind: 'studio',  name: '林冠观鸟塔', door: [1150, 310] },

    { slug: 'dispatch5', floorId: 5, kind: 'office',  name: '星象典藏宝库', door: [260, 195] },
    { slug: 'meeting5',  floorId: 5, kind: 'meeting', name: '星象共读厅', door: [410, 340] },
    { slug: 'torture5',  floorId: 5, kind: 'locker',  name: '暖灯茶艺室', door: [540, 102] },
    { slug: 'crypt5',    floorId: 5, kind: 'vault',   name: '琥珀标本室', door: [960, 340] },
    { slug: 'alchemy5',  floorId: 5, kind: 'lab',     name: '星光手账坊', door: [960, 102] },
    { slug: 'cell5',     floorId: 5, kind: 'archive', name: '时光书信室', door: [1160, 310] },

    { slug: 'finance6',  floorId: 6, kind: 'vault',   name: '船长甜品室', door: [240, 210] },
    { slug: 'meeting6',  floorId: 6, kind: 'meeting', name: '海景下午茶舱', door: [490, 210] },
    { slug: 'galley6',   floorId: 6, kind: 'lounge',  name: '华夫烘焙厨房', door: [680, 102] },
    { slug: 'magazine6', floorId: 6, kind: 'archive', name: '糖果礼盒屋', door: [490, 355] },
    { slug: 'crew6',     floorId: 6, kind: 'locker',  name: '水手阳光舱', door: [1080, 102] },
    { slug: 'crow6',     floorId: 6, kind: 'studio',  name: '晴海瞭望室', door: [1140, 310] },

    { slug: 'board7',    floorId: 7, kind: 'meeting', name: '云端阳光客厅', door: [220, 210] },
    { slug: 'locker7',   floorId: 7, kind: 'locker',  name: '露台更衣室', door: [480, 150] },
    { slug: 'clinic7',   floorId: 7, kind: 'lab',     name: '芳疗SPA馆',  door: [995, 150] },
    { slug: 'market7',   floorId: 7, kind: 'archive', name: '农夫文创市集', door: [1080, 280] },
    { slug: 'bar7room',  floorId: 7, kind: 'lounge',  name: '云端鲜果吧', door: [220, 340] },
    { slug: 'roof7',     floorId: 7, kind: 'office',  name: '天台阳光花园', door: [1040, 360] }
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

      const template = TEMPLATES[spec.kind] || TEMPLATES.office;
      // 门内两侧迎宾陈设（对称守门花钵与换鞋木凳，不挡正门进出流线）
      const doorProps = [
        ['plant', '迎宾花钵', 85, 760, 165, 880],
        ['bench', '门廊木长凳', 780, 775, 935, 855]
      ];
      template().concat(doorProps).forEach((row, i) => {
        const [type, label, x1, y1, x2, y2, flag] = row;
        const r = nRect([x1, y1, x2, y2], w, h);
        const minD = ROOM_SELF_D[type] || 28;
        const footHeight = Math.max(r.h, minD);
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

  function roomBlocksFor(f) {
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
