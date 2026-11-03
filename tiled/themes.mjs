// 七层主题单一真源：12 色角色、标志物、功能区名（星露谷物语式明媚温暖色板）。
// 只被构建期脚本引用；运行时不加载本文件。
export const THEME_ROLES = [
  'ink', 'void', 'wallShadow', 'wall', 'wallTop',
  'floorShadow', 'floor', 'floorLight',
  'accent1', 'accent2', 'warm', 'paper',
];

export const THEMES = [
  {
    id: 1, name: '晨光迎宾', tagline: '温润蜜橡木拼花与陶土镶边，柔和暖光洒满迎宾长廊',
    landmark: '中央阳光花坛', zones: ['检疫闸口', '样本分析台', '低温实验舱', '主控室', '应急冲洗', '东侧电梯厅'],
    palette: {
      ink: '#3d2614', void: '#2b190c', wallShadow: '#7a502c', wall: '#a87446', wallTop: '#c99664',
      floorShadow: '#8c623b', floor: '#a6784c', floorLight: '#b8895c',
      accent1: '#b85d46', accent2: '#568f42', warm: '#dfb25b', paper: '#ebe0cc',
    },
  },
  {
    id: 2, name: '晴空绿茵', tagline: '沉稳森林绿茵与雪松木看台，清风拂过友谊球场',
    landmark: '中央阳光记分牌', zones: ['检录更衣', '跑道直道', '中央球场', '看台补给', '器材库', '东侧电梯厅'],
    palette: {
      ink: '#23381b', void: '#172611', wallShadow: '#3b612d', wall: '#528540', wallTop: '#6ea35a',
      floorShadow: '#3e6933', floor: '#4c7d40', floorLight: '#5c914e',
      accent1: '#d49e42', accent2: '#bf6249', warm: '#e0c678', paper: '#e6dfd0',
    },
  },
  {
    id: 3, name: '暖木书院', tagline: '胡桃木藏书阁与波斯织毯，书香与暖灯交织',
    landmark: '书院阳光共读台', zones: ['王座厅', '中央拱廊', '藏书阁', '炼金室', '宝库', '东侧电梯厅'],
    palette: {
      ink: '#331e10', void: '#24140a', wallShadow: '#633c1e', wall: '#8c5830', wallTop: '#b07848',
      floorShadow: '#6e4728', floor: '#855835', floorLight: '#996842',
      accent1: '#c98e3a', accent2: '#a64838', warm: '#deb868', paper: '#e8dcc8',
    },
  },
  {
    id: 4, name: '阳光花房', tagline: '温润苔草温室与雪松木花池，果木、花圃与砂石小径',
    landmark: '阳光古树花坛', zones: ['林间营地', '药草圃', '古树祭坛', '树屋', '溪流桥', '东侧电梯厅'],
    palette: {
      ink: '#213618', void: '#15240f', wallShadow: '#385c28', wall: '#4e7d39', wallTop: '#689e50',
      floorShadow: '#39612f', floor: '#46753b', floorLight: '#568a49',
      accent1: '#c49248', accent2: '#c96874', warm: '#dec478', paper: '#e3e8d5',
    },
  },
  {
    id: 5, name: '暖灯古籍', tagline: '琥珀砂岩石板与胡桃木学堂，柔和壁灯照亮星象长廊',
    landmark: '中央星象罗盘', zones: ['牢房', '刑讯室', '铁栅井', '守卫室', '水牢', '宝库'],
    palette: {
      ink: '#302012', void: '#21150b', wallShadow: '#5e3f22', wall: '#855c36', wallTop: '#a6784c',
      floorShadow: '#785636', floor: '#916b46', floorLight: '#a37b54',
      accent1: '#c47e36', accent2: '#a84a38', warm: '#dbb464', paper: '#e6d8c2',
    },
  },
  {
    id: 6, name: '晴海甜品', tagline: '肉桂柚木甲板与焦糖甜品屋，碧海微风与咖啡香',
    landmark: '晴海甜品主桅', zones: ['甲板', '货舱', '厨房', '船长室', '炮舱', '东侧电梯厅'],
    palette: {
      ink: '#242e30', void: '#171f21', wallShadow: '#614022', wall: '#875b34', wallTop: '#ab784b',
      floorShadow: '#734b2a', floor: '#8c5e37', floorLight: '#9e6d44',
      accent1: '#cf983e', accent2: '#bf5a47', warm: '#dfc076', paper: '#e8dfd0',
    },
  },
  {
    id: 7, name: '云端露台', tagline: '晚霞暖砂石与礼堂红毯，星空露台上的庆典俱乐部',
    landmark: '云端阳光花亭', zones: ['霓虹街', '黑市', '服务器机房', '全息塔广场', '义体诊所', '天台酒吧'],
    palette: {
      ink: '#38231d', void: '#261713', wallShadow: '#784a3b', wall: '#a16854', wallTop: '#c28670',
      floorShadow: '#7a583c', floor: '#946e4e', floorLight: '#a67e5c',
      accent1: '#bf5e4e', accent2: '#488fa6', warm: '#dbb25c', paper: '#e8ddd0',
    },
  },
];

export const PALETTE_LIST = Object.fromEntries(
  THEMES.map((t) => [t.id, THEME_ROLES.map((r) => t.palette[r])])
);

export function themeById(id) {
  return THEMES.find((t) => t.id === Number(id)) || null;
}
