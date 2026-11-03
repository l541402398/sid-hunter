'use strict';
// 逐层「独立主题功能陈设」（星露谷式明媚温暖主题 · 每层按专属建筑轮廓与功能区独立设计，严禁跨层复制粘贴与堆叠）。
//
// 格式与 floors.js 的 FLOOR_SPECS[*].furniture 完全一致：
//   [type, label, x1, y1, x2, y2, flag?]   // 角点，0–1500 × 0–1000 归一化
//   flag = 'container:<name>' → 生成可搜容器（稳定 ID）
//
// 本文件不依赖任何其它 world 子模块，必须在 floors.js 之前加载。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const DRESSING = {
    // ===== 1F · 晨光迎宾小镇厅（西迎宾接待 / 中央晨光花坛广场 / 南红格桌布烘焙餐厅 / 东社区市集） =====
    1: [
      ['shelf', '迎宾导览书架', 55, 100, 175, 185],
      ['whiteboard', '今日暖心公告板', 410, 95, 535, 155],
      ['tv', '小镇晴雨播报屏', 565, 95, 705, 155],
      ['bench', '花坛北沐光长凳', 655, 195, 795, 255],
      ['bench', '花坛南沐光长凳', 655, 395, 795, 455],
      ['plant', '花坛西琴叶榕', 560, 285, 625, 355],
      ['plant', '花坛东向日葵', 835, 285, 900, 355],
      ['cooler', '蜂蜜柠檬水站', 945, 110, 1005, 185],
      ['vending', '鲜果轻食柜', 1035, 105, 1110, 190],
      ['boxstack', '爱心邮包木箱', 1145, 110, 1235, 185, 'container:parcel1'],
      ['boxstack', '新鲜蔬果木箱', 205, 555, 295, 635, 'container:foodbox1'],
      ['cooler', '烘焙坊茶饮机', 205, 735, 265, 815],
      ['vending', '鲜奶果汁售货机', 1245, 310, 1325, 405, 'container:vending1'],
      ['boxstack', '东翼园艺收纳箱', 1245, 575, 1335, 655, 'container:boxe1'],
      ['crate', '果木补给箱一', 1055, 575, 1145, 655, 'container:junk1a'],
      ['crate', '果木补给箱二', 1055, 745, 1145, 825, 'container:junk1b'],
      ['crate', '南廊储物木箱', 1215, 745, 1305, 825, 'container:south1a'],
      ['crate', '中庭整理木箱', 1055, 315, 1145, 395, 'container:mid1a']
    ],

    // ===== 2F · 晴空绿茵体育场（中央绿茵足球场 / 北冠军奖杯看台 / 西更衣果汁吧 / 南替补席 / 东乒乓射箭区） =====
    2: [
      ['whiteboard', '友谊赛记分板', 435, 95, 555, 155],
      ['shelf', '俱乐部金杯架一', 595, 95, 725, 180],
      ['shelf', '俱乐部金杯架二', 755, 95, 885, 180],
      ['printer', '赛事手册印制台', 1055, 105, 1165, 185, 'container:copier2'],
      ['cooler', '场边鲜榨补水站', 265, 285, 325, 365],
      ['bench', '北看台观赛木凳一', 415, 205, 555, 255],
      ['bench', '北看台观赛木凳二', 885, 205, 1025, 255],
      ['vending', '运动能量果饮柜', 1355, 285, 1435, 380, 'container:vending2'],
      ['boxstack', '球具收纳木箱', 1355, 445, 1445, 525, 'container:paperbox2'],
      ['shelf', '运动器材木架', 1135, 685, 1255, 775, 'container:spare2'],
      ['crate', '场边补给木箱一', 1135, 285, 1225, 365, 'container:junk2a'],
      ['crate', '场边补给木箱二', 1135, 445, 1225, 525, 'container:junk2b'],
      ['crate', '南看台储物箱', 985, 875, 1075, 955, 'container:south2a'],
      ['crate', '西看台整理箱', 265, 685, 355, 765, 'container:mid2a']
    ],

    // ===== 3F · 暖木学者书院与画廊（北皇家藏书长廊 / 西茗茶修复室 / 中央红毯共读厅 / 东手绘画廊） =====
    3: [
      ['server', '古籍恒温典藏柜一', 715, 100, 825, 195, 'container:server3'],
      ['server', '古籍恒温典藏柜二', 855, 100, 965, 195],
      ['whiteboard', '手绘原画展示板', 1145, 100, 1285, 165],
      ['lamp', '黄铜阅读台灯一', 605, 365, 655, 435],
      ['lamp', '黄铜阅读台灯二', 985, 365, 1035, 435],
      ['crate', '画具收纳木箱', 1145, 355, 1235, 435, 'container:sample3'],
      ['vending', '书院下午茶柜', 1365, 355, 1445, 450, 'container:vending3'],
      ['boxstack', '手稿典藏木箱', 1365, 555, 1455, 635, 'container:parts3'],
      ['shelf', '精装绘本木架', 1145, 585, 1275, 675],
      ['crate', '书院木箱一', 215, 365, 305, 445, 'container:junk3a'],
      ['crate', '书院木箱二', 215, 645, 305, 725, 'container:junk3b'],
      ['crate', '南书廊整理箱', 1145, 845, 1235, 925, 'container:south3a'],
      ['crate', '中庭古籍木箱', 435, 645, 525, 725, 'container:mid3a']
    ],

    // ===== 4F · 阳光玻璃花房与果木温室（北育苗廊 / 西果木苗圃 / 中央阳光花坛 / 东香草茶歇露台） =====
    4: [
      ['whiteboard', '四季作物日历板', 515, 95, 645, 155],
      ['shelf', '草本标本木架甲', 685, 95, 815, 185, 'container:arc4a'],
      ['shelf', '草本标本木架乙', 845, 95, 975, 185, 'container:arc4b'],
      ['shelf', '花种培育木架丙', 1025, 95, 1155, 185, 'container:arc4c'],
      ['boxstack', '良种储藏木箱一', 1205, 105, 1295, 185, 'container:ticketbox4'],
      ['printer', '植物图鉴印制台', 655, 625, 765, 705, 'container:printer4'],
      ['lamp', '温室暖光灯柱', 655, 345, 710, 415],
      ['vending', '花草茶售货机', 1355, 325, 1435, 420, 'container:vending4'],
      ['plant', '温室向日葵花箱', 1355, 615, 1435, 695],
      ['crate', '园艺泥炭木箱一', 1125, 335, 1215, 415, 'container:junk4a'],
      ['crate', '园艺泥炭木箱二', 1125, 615, 1215, 695, 'container:junk4b'],
      ['crate', '南花境木箱', 985, 865, 1075, 945, 'container:south4a'],
      ['crate', '果圃工具箱', 205, 665, 295, 745, 'container:mid4a']
    ],

    // ===== 5F · 暖灯星象古籍馆（中央金辉星盘圆厅 / 北星图壁龛 / 西宝石标本翼 / 南星象讲堂） =====
    5: [
      ['server', '星象黄铜典籍柜', 635, 95, 755, 190, 'container:server5'],
      ['tv', '二十八宿星图屏', 795, 95, 945, 155],
      ['lamp', '星盘北引路提灯', 515, 285, 565, 355],
      ['lamp', '星盘东引路提灯', 935, 285, 985, 355],
      ['cooler', '暖姜茶饮机', 1115, 110, 1175, 185],
      ['crate', '星象仪零件箱', 945, 725, 1035, 805, 'container:emerg5'],
      ['vending', '热可可自助机', 1365, 285, 1445, 380, 'container:vending5'],
      ['boxstack', '羊皮卷储藏箱', 1365, 465, 1455, 545, 'container:bedding5'],
      ['shelf', '天文手札木架', 1115, 465, 1245, 555],
      ['crate', '标本收纳箱一', 195, 315, 285, 395, 'container:junk5a'],
      ['crate', '标本收纳箱二', 1115, 285, 1205, 365, 'container:junk5b'],
      ['crate', '南讲堂典藏箱', 945, 865, 1035, 945, 'container:south5a'],
      ['crate', '西翼矿石箱', 385, 725, 475, 805, 'container:mid5a']
    ],

    // ===== 6F · 晴海甲板甜品舱（北舷窗观海廊 / 西冰淇淋吧 / 中央蓝毯下午茶沙龙 / 东船长露台） =====
    6: [
      ['safe', '甜品工坊金库柜', 645, 95, 765, 185, 'container:minisafe6'],
      ['shelf', '烘焙食谱木架甲', 805, 95, 935, 185, 'container:voucher6'],
      ['whiteboard', '今日甜点推荐板', 985, 95, 1125, 155],
      ['lamp', '海风暖光台灯', 625, 395, 680, 465],
      ['printer', '礼盒礼券印制台', 315, 525, 425, 605, 'container:printer6'],
      ['crate', '糖果礼盒木箱', 1185, 735, 1275, 815, 'container:billbox6'],
      ['vending', '海盐冰淇淋柜', 1365, 385, 1445, 480, 'container:vending6'],
      ['boxstack', '可可豆木箱', 1365, 565, 1455, 645, 'container:audit6'],
      ['crate', '航海果干箱一', 185, 315, 275, 395, 'container:junk6a'],
      ['crate', '航海果干箱二', 1185, 385, 1275, 465, 'container:junk6b'],
      ['crate', '南甲板甜品箱', 1185, 865, 1275, 945, 'container:south6a'],
      ['crate', '中舱香料箱', 1185, 565, 1275, 645, 'container:mid6a']
    ],

    // ===== 7F · 云端晚霞音乐露台（北中露天音乐舞台 / 中央礼堂坐席 / 西云端健身阁 / 南晚霞果饮吧 / 东文创市集） =====
    7: [
      ['whiteboard', '音乐会节目单板', 1025, 95, 1155, 155],
      ['cooler', '鲜果气泡水吧', 915, 715, 975, 795, 'container:drink7'],
      ['lamp', '舞台西暖阳灯柱', 515, 145, 565, 215],
      ['lamp', '舞台东暖阳灯柱', 985, 145, 1035, 215],
      ['vending', '云端特饮售货机', 1355, 245, 1435, 340, 'container:vending7'],
      ['boxstack', '庆典彩带礼箱', 1355, 415, 1445, 495, 'container:gear7'],
      ['plant', '露台葵花盆栽一', 1155, 715, 1225, 795],
      ['crate', '市集手作木箱一', 1155, 285, 1245, 365, 'container:junk7a'],
      ['crate', '市集手作木箱二', 1155, 455, 1245, 535, 'container:junk7b'],
      ['crate', '南露台礼盒箱', 1155, 855, 1245, 935, 'container:south7a'],
      ['crate', '西健身补给箱', 345, 415, 435, 495, 'container:mid7a']
    ]
  };

  // ===== 功能区精细点缀池（由 clutter.js 按各层固定锚点对称摆放，全部采用 2× 真实像素比例） =====
  const deco = (prop, w, h, scale, label, weight = 1) => ({ prop, w, h, scale, label, weight });
  const THEME_CLUTTER = {
    1: [
      deco('plantBig', 64, 64, 2, '琴叶榕盆栽', 3),
      deco('plantSmall', 36, 36, 2, '向阳小盆栽', 3),
      deco('tableRound', 68, 56, 2, '阳光茶歇圆桌', 2),
      deco('coffee', 36, 38, 2, '手冲咖啡机', 2),
      deco('shelf', 40, 48, 2, '社区图书架', 2)
    ],
    2: [
      { type: 'bench', w: 96, h: 42, label: '场边观赛长凳', weight: 3 },
      { type: 'cooler', w: 44, h: 56, label: '绿茵补水站', weight: 2 },
      deco('plantBig', 64, 64, 2, '球场边花木', 3),
      deco('plantSmall', 36, 36, 2, '场边迎春花钵', 3),
      { type: 'shelf', w: 68, h: 64, label: '奖杯陈列架', weight: 2 }
    ],
    3: [
      deco('shelfTall', 64, 64, 2, '古典高书架', 3),
      deco('shelf', 40, 48, 2, '木质绘本架', 3),
      deco('tableRound', 68, 56, 2, '共读圆桌', 2),
      deco('plantBig', 64, 64, 2, '书斋绿植', 3),
      deco('dgnChest', 36, 36, 2, '镶金典藏木箱', 2)
    ],
    4: [
      deco('forestTree1', 68, 98, 1, '阳光果树', 3),
      deco('forestTree2', 42, 76, 1, '翠绿小树', 3),
      deco('forestBrush1', 50, 44, 1, '修剪花灌木', 3),
      deco('plantBig', 64, 64, 2, '温室花钵', 3),
      deco('tableRound', 68, 56, 2, '园艺茶叙圆桌', 2)
    ],
    5: [
      deco('shelfTall', 64, 64, 2, '回廊古籍架', 3),
      deco('dgnChest', 36, 36, 2, '星象典藏箱', 3),
      deco('dgnTorch1', 32, 48, 2, '暖金壁灯', 2),
      deco('plantBig', 64, 64, 2, '回廊万年青', 3),
      deco('tableRound', 68, 56, 2, '观星圆桌', 2)
    ],
    6: [
      deco('tableRound', 68, 56, 2, '海景下午茶圆桌', 3),
      deco('coffee', 36, 38, 2, '焦糖浓缩咖啡机', 2),
      deco('plantBig', 64, 64, 2, '甲板花钵', 3),
      deco('dgnChest', 36, 36, 2, '航海甜品礼箱', 2),
      deco('candyPop', 44, 44, 1, '缤纷棒棒糖花束', 2)
    ],
    7: [
      deco('plantBig', 64, 64, 2, '露台阳光葵花', 3),
      deco('plantSmall', 36, 36, 2, '云端花箱', 3),
      deco('tableRound', 68, 56, 2, '露台茶叙圆桌', 3),
      deco('sofaSmall', 64, 52, 2, '云端藤编沙发', 2),
      deco('water', 64, 64, 2, '露台冷萃水站', 2)
    ]
  };

  const THEME_PROP = {
    1: {
      cooler: { prop: 'water', scale: 2 },
      vending: { prop: 'vending', scale: 2 }
    },
    3: {
      crate: { prop: 'dgnChest', scale: 2 }
    },
    5: {
      crate: { prop: 'dgnChest', scale: 2 },
      boxstack: { prop: 'dgnChest', scale: 2 }
    },
    6: {
      plant: { prop: 'candyPop', scale: 1 }
    },
    7: {
      cooler: { prop: 'water', scale: 2 },
      vending: { prop: 'vending', scale: 2 }
    }
  };

  return { DRESSING, THEME_CLUTTER, THEME_PROP };
});
