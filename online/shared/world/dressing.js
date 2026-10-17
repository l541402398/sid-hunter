'use strict';
// 逐层「陈设填充」（需求③：每层楼太空旷，需要添加物品，特别是可搜索的物品）。
//
// 这里只放"额外家具行"，格式与 floors.js 的 FLOOR_SPECS[*].furniture 完全一致：
//   [type, label, x1, y1, x2, y2, flag?]   // 角点，0–1500 × 0–1000 归一化
//   flag = 'container:<name>' → 生成可搜容器（稳定 ID 见 floors.js 的 CONTAINER_IDS / 自动回退）
//
// 设计约束（建造后会由 validate 脚本 + elevator-world BFS 双重校验）：
//   · 家具的行走碰撞是"南沿立面条带"，所以整齐靠墙摆放不会切断走廊；
//   · 不覆盖：房间门点、出生点、电梯厅、门洞开口（这些点在别处定义）；
//   · 每层保持一条贯通东西的主走廊（y≈150–300 的可走带）。
//
// 本文件不依赖任何其它 world 子模块，必须在 floors.js 之前加载。
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const api = factory();
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {
  // 公共小件：各层都会用到的走廊陈设
  const corridor = (y, opts = {}) => ([
    ['plant', opts.leftPlant || '走廊绿植一', 560, y, 615, y + 55],
    ['plant', opts.rightPlant || '走廊绿植二', 900, y, 955, y + 55],
    ['bench', '走廊长凳', 660, y + 8, 790, y + 52]
  ]);
  // 「别让它太空」补丁：每层额外再加的一圈小陈设（靠墙、角落、工位之间），
  // 全部只用南沿薄碰撞带，不会切断走廊。数量按"走进任意一屏都能看到 3–5 件东西"来配。
  const filler = (floorId) => {
    const v = floorId;   // 用楼层号做轻微错位，避免七层看起来是同一张图复制
    return [
      ['plant', '窗台绿植', 300 + v * 6, 60, 350 + v * 6, 120],
      ['plant', '墙角绿植', 1000, 60, 1050, 125],
      ['lamp', '落地灯', 620, 60, 665, 120],
      ['chair', '临时座椅', 470, 260, 520, 310],
      ['cooler', '备用饮水机', 300, 420, 350, 490],
      ['boxstack', '杂物纸箱', 560, 430, 640, 505, `container:junk${v}a`],
      ['crate', '周转箱', 860, 430, 930, 505, `container:junk${v}b`],
      ['plant', '会议角绿植', 960, 430, 1010, 495],
      ['shelf', '共享资料架', 1050, 260, 1150, 350],
      ['chair', '等候椅', 1200, 260, 1250, 310],
      ['plant', '电梯厅绿植', 1250, 60, 1300, 125],
      ['bench', '东侧长凳二', 1200, 680, 1320, 740],
      // 每层一台『楼层游戏机』：支持跨楼层匹配（见 room/minigames.js 的 arcade 模式）。
      ['arcade', '楼层游戏机', 1320, 300, 1400, 380]
    ];
  };
  const DRESSING = {
    // ===== 1F 门厅 · 晨光木石 =====
    1: [
      // 北墙一侧：接待动线
      ['shelf', '总服务台资料架', 60, 80, 210, 160],
      ['shelf', '告示资料架', 340, 80, 430, 150],
      ['bench', '门厅长凳一', 760, 110, 900, 165],
      ['bench', '门厅长凳二', 760, 190, 900, 245],
      ['plant', '门厅绿植二', 950, 100, 1010, 170],
      ['cooler', '直饮水机', 1050, 100, 1100, 175],
      ['vending', '自动售货机', 1110, 95, 1175, 180],
      ['boxstack', '快递暂存箱', 1185, 100, 1250, 170, 'container:parcel1'],
      // 中部休闲区（原本只有两张沙发）
      ['plant', '休闲区绿植', 700, 280, 760, 350],
      ['chair', '休闲椅一', 780, 300, 830, 350],
      ['chair', '休闲椅二', 840, 300, 890, 350],
      ['tv', '大堂信息屏', 620, 60, 800, 90],
      ['whiteboard', '楼层导览板', 470, 70, 600, 105],
      // 食堂与后厨
      ['counter', '小料台', 300, 600, 350, 700],
      ['cooler', '后厨饮水机', 850, 870, 900, 950],
      ['boxstack', '食材周转箱', 860, 600, 950, 690, 'container:foodbox1'],
      ['plant', '食堂绿植二', 970, 600, 1030, 680],
      ['shelf', '餐具架', 970, 760, 1030, 860],
      // 东侧服务翼
      ['bench', '东侧等候长凳', 1020, 420, 1100, 470],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending1'],
      ['plant', '东侧绿植三', 1390, 560, 1450, 640],
      ['boxstack', '东侧杂物箱', 1390, 680, 1460, 760, 'container:boxe1'],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 2F 综合办公 · 薄荷工位 =====
    2: [
      ['shelf', '工位书架一', 620, 60, 760, 150],
      ['shelf', '工位书架二', 780, 60, 920, 150],
      ['printer', '打印间复印机', 600, 260, 700, 340, 'container:copier2'],
      ['whiteboard', '部门看板', 600, 60, 700, 95],
      ['cooler', '饮水机', 300, 250, 350, 320],
      ['plant', '工位绿植一', 560, 260, 610, 320],
      ['chair', '访客椅一', 300, 500, 350, 550],
      ['chair', '访客椅二', 620, 520, 670, 570],
      ['bench', '等候长凳', 950, 260, 1060, 310],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending2'],
      ['boxstack', '打印纸箱', 1390, 560, 1460, 640, 'container:paperbox2'],
      ['plant', '东侧绿植三', 1390, 680, 1450, 760],
      ['shelf', '档案备件架', 1010, 700, 1110, 800, 'container:spare2'],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 3F 产品研发 · 蓝图纸 =====
    3: [
      ['server', '研发机柜一', 660, 90, 760, 230, 'container:server3'],
      ['server', '研发机柜二', 780, 90, 880, 230],
      ['whiteboard', '迭代看板', 900, 90, 1080, 130],
      ['lamp', '绘图灯', 320, 240, 370, 300],
      ['crate', '样机箱', 460, 230, 540, 310, 'container:sample3'],
      ['chair', '讨论椅一', 640, 320, 690, 370],
      ['chair', '讨论椅二', 700, 320, 750, 370],
      ['plant', '研发区绿植', 900, 250, 960, 320],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending3'],
      ['boxstack', '零件箱', 1390, 560, 1460, 640, 'container:parts3'],
      ['bench', '东侧长凳', 1020, 420, 1100, 470],
      ['shelf', '元件架', 1010, 700, 1110, 800],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 4F 档案票证 · 纸张森林 =====
    4: [
      ['shelf', '档案架甲', 660, 80, 800, 190, 'container:arc4a'],
      ['shelf', '档案架乙', 820, 80, 960, 190, 'container:arc4b'],
      ['shelf', '档案架丙', 660, 220, 800, 330, 'container:arc4c'],
      ['shelf', '档案架丁', 820, 220, 960, 330],
      ['boxstack', '票证箱一', 1000, 220, 1080, 300, 'container:ticketbox4'],
      ['boxstack', '票证箱二', 1030, 620, 1110, 700],
      ['printer', '票证打印机', 620, 620, 720, 700, 'container:printer4'],
      ['lamp', '阅览台灯', 300, 500, 350, 560],
      ['chair', '阅览椅', 360, 520, 410, 570],
      ['whiteboard', '归档规则板', 620, 60, 760, 95],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending4'],
      ['plant', '东侧绿植三', 1390, 560, 1450, 640],
      ['bench', '东侧长凳', 1020, 420, 1100, 470],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 5F 值班会议 · 夜巡 =====
    5: [
      ['server', '值班服务器', 620, 120, 720, 260, 'container:server5'],
      ['tv', '值班监控墙', 620, 60, 900, 100],
      ['lamp', '值班台灯', 340, 300, 390, 360],
      ['cooler', '饮水机', 720, 300, 770, 370],
      ['chair', '值班椅', 500, 560, 550, 610],
      ['bench', '夜巡长凳', 640, 620, 780, 670],
      ['crate', '应急物资箱', 800, 620, 880, 700, 'container:emerg5'],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending5'],
      ['boxstack', '值班被褥箱', 1390, 560, 1460, 640, 'container:bedding5'],
      ['plant', '东侧绿植三', 1390, 680, 1450, 760],
      ['shelf', '值班资料架', 1010, 700, 1110, 800],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 6F 财务 · 保险库 =====
    6: [
      ['safe', '财务小保险柜', 620, 120, 740, 240, 'container:minisafe6'],
      ['shelf', '凭证架甲', 760, 120, 880, 230, 'container:voucher6'],
      ['shelf', '凭证架乙', 760, 250, 880, 360],
      ['whiteboard', '预算看板', 900, 110, 1080, 150],
      ['lamp', '账台灯', 400, 560, 450, 620],
      ['chair', '审阅椅', 460, 580, 510, 630],
      ['printer', '凭证打印机', 300, 700, 400, 780, 'container:printer6'],
      ['crate', '票据箱', 560, 700, 640, 780, 'container:billbox6'],
      ['vending', '东侧售货机', 1390, 400, 1460, 500, 'container:vending6'],
      ['boxstack', '审计箱', 1390, 560, 1460, 640, 'container:audit6'],
      ['bench', '东侧长凳', 1020, 420, 1100, 470],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ],

    // ===== 7F 健身 · 天光 =====
    7: [
      ['treadmill', '跑步机五', 170, 140, 250, 220],
      ['rack', '哑铃架三', 560, 260, 640, 330],
      ['bench', '训练长凳一', 660, 280, 760, 330],
      ['bench', '训练长凳二', 660, 350, 760, 400],
      ['cooler', '运动饮水站', 900, 240, 950, 320, 'container:drink7'],
      ['mat', '拉伸垫一', 900, 360, 1010, 430],
      ['whiteboard', '训练计划板', 700, 60, 860, 95],
      ['lamp', '场地射灯', 1000, 200, 1050, 260],
      ['vending', '能量售货机', 1390, 400, 1460, 500, 'container:vending7'],
      ['boxstack', '器材箱', 1390, 560, 1460, 640, 'container:gear7'],
      ['bench', '东侧休息凳', 1020, 420, 1100, 470],
      ['plant', '东侧绿植三', 1390, 680, 1450, 760],
      ...corridor(300, { leftPlant: '走廊绿植三', rightPlant: '走廊绿植四' })
    ]
  };
  // 把「别让它太空」补丁接到每层末尾。用追加而不是改写既有数组，
  // 让原有手工摆位保持可读、可回溯（谁加的、加在哪一层一目了然）。
  for (const key of Object.keys(DRESSING)) {
    if (Array.isArray(DRESSING[key])) DRESSING[key] = DRESSING[key].concat(filler(Number(key)));
  }
  return { DRESSING };
});
