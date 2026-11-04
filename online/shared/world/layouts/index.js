'use strict';
// Node 侧聚合：按楼层加载 layouts/fN.js（存在才加载）。浏览器侧由各 fN.js 的 <script> 注册到 window.SID_LAYOUTS。
const LAYOUTS = {};
for (let id = 1; id <= 7; id++) {
  try { const L = require(`./f${id}.js`); if (L && L.id === id) LAYOUTS[id] = L; }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || !String(e.message).includes(`f${id}.js`)) throw e; }
}
module.exports = LAYOUTS;
