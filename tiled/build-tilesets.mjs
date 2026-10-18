// 零依赖：为 7 层生成 16×16 图块集（PNG + TSJ）。用法 node tiled/build-tilesets.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { THEMES, PALETTE_LIST, THEME_ROLES } from './themes.mjs';

const T = 16, COLS = 4, ROWS = 1;
const ROLE = Object.fromEntries(THEME_ROLES.map((r, i) => [r, i]));
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

for (const th of THEMES) {
  const p = PALETTE_LIST[th.id].map(rgb);
  const w = T * COLS, h = T * ROWS;
  const buf = Buffer.alloc(w * h * 4);
  const put = (x, y, c) => {
    const i = (y * w + x) * 4;
    buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
  };
  // tile 0 地面 / tile 1 墙 / tile 2 装饰 / tile 3 物件；全部取自 12 色角色。
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const n = (x * 31 + y * 17) % 11;
    // 地面：底色 + 两块低频亮/暗斑，避免噪声式 dither
    let c = p[ROLE.floor];
    if (n === 0) c = p[ROLE.floorShadow];
    else if (n === 1) c = p[ROLE.floorLight];
    if (x === 0 || y === 0) c = p[ROLE.floorShadow];
    put(x, y, c);
    // 墙：底色 + 顶边受光 + 底部描边
    c = p[ROLE.wall];
    if (y < 2) c = p[ROLE.wallTop];
    else if (n === 0) c = p[ROLE.wallShadow];
    if (y === T - 1) c = p[ROLE.ink];
    put(T + x, y, c);
    // 装饰：暗底 + 主题色斜纹 + 中心暖光
    c = p[ROLE.floorShadow];
    if ((x + y) % 7 === 0 || (x - y + T) % 7 === 0) c = p[ROLE.accent1];
    if (x >= 6 && x <= 9 && y >= 6 && y <= 9) c = p[ROLE.warm];
    put(T * 2 + x, y, c);
    // 物件：主题强调色 + 深描边 + 纸白高光
    c = p[ROLE.accent2];
    if (x < 2 || y < 2 || x === T - 1 || y === T - 1) c = p[ROLE.ink];
    if (x > 12 && y > 12) c = p[ROLE.paper];
    if ((x + y) % 5 === 0) c = p[ROLE.warm];
    put(T * 3 + x, y, c);
  }
  writeFileSync(`tiled/tileset-floor${th.id}.png`, png(w, h, buf));
  const tsj = {
    type: 'tileset', version: '1.10', tiledversion: '1.12.2', name: `theme-floor${th.id}`,
    image: `tileset-floor${th.id}.png`, imagewidth: w, imageheight: h, tilewidth: T, tileheight: T,
    tilecount: COLS * ROWS, columns: COLS, margin: 0, spacing: 0,
    tiles: [
      { id: 0, properties: [{ name: 'role', type: 'string', value: 'ground' }] },
      { id: 1, properties: [{ name: 'role', type: 'string', value: 'wall' }] },
      { id: 2, properties: [{ name: 'role', type: 'string', value: 'decor' }] },
      { id: 3, properties: [{ name: 'role', type: 'string', value: 'object' }] },
    ],
  };
  writeFileSync(`tiled/tileset-floor${th.id}.tsj`, JSON.stringify(tsj, null, 1));
  console.log(`floor${th.id}  ${w}x${h}  ${PALETTE_LIST[th.id].length} 色`);
}


