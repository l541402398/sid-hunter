'use strict';
// Shared world definition. Loaded by the server (CommonJS) and by the browser as a
// plain defer script. Both sides must use the same furniture layout: the server does
// authoritative collision, the client bakes it into the background tiles. Any drift
// between the two would put players visibly inside furniture.
(function (root) {
  const WORLD_W = 3840, WORLD_H = 640, VIEW_W = 960, VIEW_H = 640;
  const SPEED = 160, MIN_Y = 135, MAX_Y = WORLD_H - 24, MIN_X = 20, MAX_X = WORLD_W - 20;
  const BODY_HALF = 9, FOOT_TOP = 4, FOOT_BOTTOM = 5;
  const ZONES = ['接待区', '产品研发区', '茶水休息区', '档案工作区'];
  const FIELD_NAMES = { hair: '头发颜色', top: '上衣颜色', pants: '裤子颜色', shoes: '鞋颜色' };
  const TRAIT_NAMES = { saying: '口头禅', food: '爱吃的食物', sport: '喜欢的运动' };
  const MASK = '***';
  const PALETTES = {
    hair: [['银白', '#d3dce9'], ['栗棕', '#9f6748'], ['墨黑', '#263244'], ['金黄', '#e7bd6b'], ['紫灰', '#9986b2']],
    top: [['深蓝', '#5686bc'], ['砖红', '#b86a64'], ['草绿', '#75a58a'], ['米白', '#d2c9b2'], ['浅紫', '#a18ac2']],
    pants: [['炭灰', '#505d70'], ['海军蓝', '#354967'], ['卡其', '#a79770'], ['浅灰', '#95a1ad']],
    shoes: [['白色', '#e3e7e8'], ['黑色', '#27303c'], ['红色', '#bb6258'], ['棕色', '#927253']]
  };
  function makeFurniture() {
    const list = [];
    const add = (x, y, w, h, type) => list.push({ x, y, w, h, type });
    add(132, 173, 155, 67, 'reception'); add(353, 169, 62, 70, 'plant'); add(785, 160, 92, 74, 'cabinet');
    add(120, 518, 184, 66, 'sofa'); add(407, 541, 64, 52, 'plant'); add(745, 523, 150, 62, 'sofa');
    [1035, 1240, 1480, 1690, 2940, 3145, 3380, 3600].forEach(x => { add(x, 172, 137, 77, 'desk'); add(x + 12, 509, 137, 77, 'desk'); });
    add(1990, 165, 267, 76, 'counter'); add(2450, 170, 162, 68, 'sofa'); add(2670, 165, 74, 81, 'plant');
    add(2010, 514, 128, 75, 'table'); add(2240, 519, 180, 63, 'sofa'); add(2535, 513, 127, 75, 'table'); add(2770, 526, 61, 58, 'plant');
    return list;
  }
  const WORLD = {
    WORLD_W, WORLD_H, VIEW_W, VIEW_H, SPEED, MIN_X, MAX_X, MIN_Y, MAX_Y,
    BODY_HALF, FOOT_TOP, FOOT_BOTTOM, ZONES, FIELD_NAMES, TRAIT_NAMES, MASK, PALETTES, makeFurniture
  };
  root.WORLD = WORLD;
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = (typeof window !== 'undefined' ? window : globalThis).WORLD;
