// 七层主题单一真源：12 色角色、标志物、功能区名。
// 第 3 步主题表（tiled/THEME-TABLE.md）确认后的代码化版本。
// 只被构建期脚本引用；运行时不加载本文件。
export const THEME_ROLES = [
  'ink', 'void', 'wallShadow', 'wall', 'wallTop',
  'floorShadow', 'floor', 'floorLight',
  'accent1', 'accent2', 'warm', 'paper',
];

export const THEMES = [
  {
    id: 1, name: '科幻实验', tagline: '冷白无尘实验室，唯一暖色是危险警示与应急灯',
    landmark: '中央低温实验舱', zones: ['检疫闸口', '样本分析台', '低温实验舱', '主控室', '应急冲洗', '东侧电梯厅'],
    palette: {
      ink: '#070d16', void: '#04080f', wallShadow: '#0f2233', wall: '#1b3a52', wallTop: '#2f6280',
      floorShadow: '#0b1722', floor: '#132838', floorLight: '#20445c',
      accent1: '#3fd0e0', accent2: '#ff8a4c', warm: '#ffd27a', paper: '#dff6fb',
    },
  },
  {
    id: 2, name: '竞技运动', tagline: '室内综合运动场，草绿 + 跑道赭红 + 计分牌金',
    landmark: '中央计分塔', zones: ['检录更衣', '跑道直道', '中央球场', '看台补给', '器材库', '东侧电梯厅'],
    palette: {
      ink: '#0d130a', void: '#070b05', wallShadow: '#1e2a17', wall: '#364a26', wallTop: '#577337',
      floorShadow: '#162210', floor: '#27401d', floorLight: '#3f632c',
      accent1: '#f0c24a', accent2: '#f06a4a', warm: '#ffe6a3', paper: '#f4f0d8',
    },
  },
  {
    id: 3, name: '魔幻城堡', tagline: '紫石城堡，金饰与烛火，长廊两侧是拱券',
    landmark: '王座厅魔法阵', zones: ['王座厅', '中央拱廊', '藏书阁', '炼金室', '宝库', '东侧电梯厅'],
    palette: {
      ink: '#120b19', void: '#09050e', wallShadow: '#271635', wall: '#422658', wallTop: '#6a4184',
      floorShadow: '#1c1026', floor: '#2e1b3e', floorLight: '#4a2c60',
      accent1: '#e0b04a', accent2: '#c94f93', warm: '#ffd58a', paper: '#f5e8f7',
    },
  },
  {
    id: 4, name: '幽深森林', tagline: '建筑被森林吞没，苔藓、树根、月光下的水',
    landmark: '古树祭坛', zones: ['林间营地', '药草圃', '古树祭坛', '树屋', '溪流桥', '东侧电梯厅'],
    palette: {
      ink: '#0a110b', void: '#050906', wallShadow: '#172617', wall: '#2b4124', wallTop: '#486238',
      floorShadow: '#111d10', floor: '#1f331a', floorLight: '#345229',
      accent1: '#d6b36a', accent2: '#78c7bd', warm: '#ffe8a8', paper: '#eaf2dc',
    },
  },
  {
    id: 5, name: '地牢回廊', tagline: '湿冷石廊，火把与铁栅，唯一的光是橙色的',
    landmark: '中央铁栅井', zones: ['牢房', '刑讯室', '铁栅井', '守卫室', '水牢', '宝库'],
    palette: {
      ink: '#100c09', void: '#080504', wallShadow: '#211912', wall: '#392b20', wallTop: '#5a4532',
      floorShadow: '#18120e', floor: '#281f17', floorLight: '#433426',
      accent1: '#e6773f', accent2: '#d24a3a', warm: '#ffc06e', paper: '#ddccab',
    },
  },
  {
    id: 6, name: '海盗甲板', tagline: '海风、盐渍木板、金与红帆',
    landmark: '主桅瞭望台', zones: ['甲板', '货舱', '厨房', '船长室', '炮舱', '东侧电梯厅'],
    palette: {
      ink: '#090f12', void: '#05090b', wallShadow: '#17282d', wall: '#2a4348', wallTop: '#456a6a',
      floorShadow: '#111e22', floor: '#203638', floorLight: '#355653',
      accent1: '#e0b054', accent2: '#e05a44', warm: '#ffdd93', paper: '#ede1c5',
    },
  },
  {
    id: 7, name: '赛博霓虹', tagline: '黑紫底色，洋红/青双霓虹，金色广告',
    landmark: '全息广告塔', zones: ['霓虹街', '黑市', '服务器机房', '全息塔广场', '义体诊所', '天台酒吧'],
    palette: {
      ink: '#07020c', void: '#030106', wallShadow: '#180a2a', wall: '#2b1050', wallTop: '#4b2078',
      floorShadow: '#10051f', floor: '#1c0a33', floorLight: '#311455',
      accent1: '#ff2bd6', accent2: '#00e5ff', warm: '#ffb800', paper: '#f8f8ff',
    },
  },
];

export const PALETTE_LIST = Object.fromEntries(
  THEMES.map((t) => [t.id, THEME_ROLES.map((r) => t.palette[r])])
);

export function themeById(id) {
  return THEMES.find((t) => t.id === Number(id)) || null;
}
