'use strict';
// 4F · 阳光花房层 —— 外形：「西北→东南三级阶梯花园」。三块台地依次错落：
//   T1 0–960 × 0–560 / T2 960–1920 × 120–680 / T3 1920–2880 × 240–800，每级台地都有自己的温室北墙；
// 台地交界处用矮绿篱挡住一半，留出上下台阶通道；每级台地各一栋坡顶小木屋。
(function (root, factory) {
  const L = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = L;
  else (root.SID_LAYOUTS = root.SID_LAYOUTS || {})[L.id] = L;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return {
    id: 4, wallBase: 112,
    outline: [[0, 0], [960, 0], [960, 120], [1920, 120], [1920, 240], [2880, 240], [2880, 800], [1920, 800], [1920, 680], [960, 680], [960, 560], [0, 560]],
    furniture: [
      // —— T1 · 育苗花廊 ——
      ['shelf', '草本标本木架甲', 120, 120, 125, 36, 'container:arc4a'],
      ['shelf', '草本标本木架乙', 450, 120, 125, 36, 'container:arc4b'],
      ['cabinet', '珍稀花种储藏柜', 640, 120, 125, 36, 'container:ticket4'],
      ['flowerbed', '花廊花床一', 80, 270, 150, 30],
      ['flowerbed', '花廊花床二', 80, 360, 150, 30],
      ['pottree', '花廊柠檬树', 300, 290, 56, 34],
      ['seedtable', '育苗台一', 440, 248, 150, 34],
      ['wheelbarrow', '花廊手推车', 120, 470, 64, 30],
      ['boxstack', '良种储藏木箱一', 300, 470, 92, 32, 'container:ticketbox4'],
      ['potstack', '花房陶盆堆', 440, 470, 60, 30],
      ['crate', '园艺泥炭木箱一', 780, 500, 87, 32, 'container:junk4a'],
      // —— T2 · 中央凉亭台地 ——
      ['pottree', '台地橄榄树', 1000, 250, 56, 34],
      ['pottree', '台地樱花树', 1840, 250, 56, 34],
      ['gazebo', '白木花园凉亭', 1160, 300, 220, 130],
      ['gardenbench', '凉亭长椅西', 1060, 470, 110, 30],
      ['gardenbench', '凉亭长椅东', 1300, 470, 110, 30],
      ['dryrack', '香草晾晒架', 1500, 300, 150, 34],
      ['herbtable', '香草分拣台', 1700, 330, 170, 40],
      ['mat', '野餐毯一', 1000, 560, 150, 70],
      ['mat', '野餐毯二', 1200, 590, 150, 70],
      ['crate', '南花境木箱', 1365, 544, 87, 32, 'container:south4a'],
      ['herbbasket', '薰衣草篮', 1420, 630, 60, 30],
      ['crate', '园艺泥炭木箱二', 1790, 600, 87, 32, 'container:junk4b'],
      // —— T3 · 果木苗圃与露台 ——
      ['shelf', '花种培育木架丙', 2000, 358, 125, 36, 'container:arc4c'],
      ['printer', '植物图鉴印制台', 2440, 358, 106, 32, 'container:printer4'],
      ['desk', '植物图谱记录台', 2600, 420, 154, 38, 'container:desk3'],
      ['plant', '露台龟背竹', 2790, 420, 56, 34],
      ['vegbed', '苗圃菜畦一', 2000, 460, 120, 34],
      ['vegbed', '苗圃菜畦二', 2000, 560, 120, 34],
      ['vegbed', '苗圃菜畦三', 2180, 460, 120, 34],
      ['vegbed', '苗圃菜畦四', 2180, 560, 120, 34],
      ['pottree', '苗圃橘树', 2340, 480, 56, 34],
      ['crate', '果圃工具箱', 2298, 632, 86, 32, 'container:mid4a'],
      ['gardenbench', '东花境长椅', 2000, 700, 120, 30],
      ['flowerbed', '东花境', 2200, 740, 150, 30],
      ['pottree', '露台樱花盆', 2780, 560, 56, 34],
      ['vending', '花草茶售货机', 2760, 700, 77, 38, 'container:vending4']
    ],
    walls: [
      { o: 'h', y: 400, x1: 560, x2: 840, t: 64, face: 96, style: 'house', skin: { kind: 'gable', roof: '#6e8c4a', roofHi: '#8aa860', roofLo: '#4e6a34', ridge: '#3e5428' } },
      { o: 'h', y: 520, x1: 1480, x2: 1760, t: 64, face: 96, style: 'house', skin: { kind: 'gable', roof: '#9a72c8', roofHi: '#b48ee0', roofLo: '#6e4e9a', ridge: '#54397a', chimney: false } },
      { o: 'h', y: 640, x1: 2420, x2: 2700, t: 64, face: 96, style: 'house', skin: { kind: 'gable', roof: '#b8743e', roofHi: '#d08e54', roofLo: '#8a522a', ridge: '#6a3c1c' } },
      // 台地交界绿篱（各留上半段通道）
      { o: 'v', x: 960, y1: 380, y2: 560, t: 12, face: 30, style: 'hedge' },
      { o: 'v', x: 1920, y1: 500, y2: 680, t: 12, face: 30, style: 'hedge' }
    ],
    spawns: [[200, 200], [650, 230], [800, 330], [1440, 400], [1100, 650], [1700, 640], [2300, 420], [2600, 520], [2100, 640], [2780, 500]],
    npcs: [],
    rooms: { archive4: [300, 134], camp4: [1440, 254], watch4: [2200, 374], ticket4: [700, 484], herb4: [1620, 604], tree4: [2560, 724] }
  };
});
