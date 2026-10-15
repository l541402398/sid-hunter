'use strict';
// 角色像素绘制（drawCharacterBody / 攻击动画）（浏览器与 Node 共用；由 online/shared/world.js 汇总为 window.WORLD）
(function (root, factory) {
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? Object.assign({}, require('./config.js'), require('./geometry.js'), require('./furniture.js'), require('./floors.js')) : Object.assign({}, root.SID_WORLD_PARTS || {});
  const api = factory(D);
  if (isNode) module.exports = api;
  else Object.assign(root.SID_WORLD_PARTS = root.SID_WORLD_PARTS || {}, api);
})(typeof window !== 'undefined' ? window : globalThis, function (D) {
  const { PALETTES } = D;
  const SKIN = ['#eabb94', '#d3a58a', '#c08e73', '#e8c3a3', '#cf9d7e'];
  const characterShadeCache = new Map();
  function characterShade(hex, k) {
    const key = hex + '|' + k;
    if (characterShadeCache.has(key)) return characterShadeCache.get(key);
    const n = parseInt(hex.slice(1), 16), t = k > 0 ? 255 : 8, a = Math.min(1, Math.abs(k));
    const ch = c => Math.round(c + (t - c) * a);
    const color = '#' + ((1 << 24) | (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).slice(1);
    characterShadeCache.set(key, color);
    return color;
  }
  const ATTACK_ANIMATION_MS = 260;
  // 袖口、前臂、握点与木锤共用同一组关节；逐像素栅格化，旋转时不产生平滑边缘。
  function drawCharacterAttack(rect, x, y, direction, age, colors) {
    const t = age / ATTACK_ANIMATION_MS;
    const side = direction === 'left' || direction === 'right', back = direction === 'back';
    const poses = side
      ? [[2, -17, -.9], [-5, -40, -2.1], [16, -23, .2], [2, -17, -.9]]
      : back ? [[-14, -19, -1.3], [-21, -36, -2.3], [-17, -43, -1.1], [-14, -19, -1.3]]
        : [[14, -17, -1.2], [21, -38, -1.9], [10, -12, .9], [14, -17, -1.2]];
    const times = [0, .22, .62, 1];
    const i = t < times[1] ? 0 : t < times[2] ? 1 : 2;
    const u = (t - times[i]) / (times[i + 1] - times[i]), eased = u * u * (3 - 2 * u);
    const mix = (a, b) => a + (b - a) * eased;
    const hand = { x: mix(poses[i][0], poses[i + 1][0]), y: mix(poses[i][1], poses[i + 1][1]) };
    const angle = mix(poses[i][2], poses[i + 1][2]);
    const shoulder = { x: side ? 0 : back ? -11 : 11, y: -28 };
    const elbow = { x: shoulder.x + (hand.x - shoulder.x) * .55 + (back ? -3 : 3),
      y: shoulder.y + (hand.y - shoulder.y) * .55 + 3 };
    const pixel = (px, py, w, h, color) => rect(x + (direction === 'left' ? -px - w : px), y + py, w, h, color);
    const segment = (a, b, width, color) => {
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let j = 0; j <= steps; j++) {
        pixel(Math.round(a.x + (b.x - a.x) * j / steps) - Math.floor(width / 2),
          Math.round(a.y + (b.y - a.y) * j / steps) - Math.floor(width / 2), width, width, color);
      }
    };
    segment(shoulder, elbow, 7, colors.outline); segment(elbow, hand, 6, colors.outline);
    segment(shoulder, elbow, 5, colors.topLo); segment(elbow, hand, 4, colors.skinLo);
    segment({ x: shoulder.x - 1, y: shoulder.y - 1 }, { x: elbow.x - 1, y: elbow.y - 1 }, 2, colors.topHi);
    const vx = Math.cos(angle), vy = Math.sin(angle);
    const handleEnd = { x: hand.x + vx * 16, y: hand.y + vy * 16 };
    const handleButt = { x: hand.x - vx * 3, y: hand.y - vy * 3 };
    segment(handleButt, handleEnd, 5, colors.outline);
    segment(handleButt, handleEnd, 3, '#986039');
    // 锤头的横轴始终垂直于锤柄，保留深棕端面、暖木色与木纹。
    for (let py = Math.floor(handleEnd.y - 11); py <= Math.ceil(handleEnd.y + 11); py++) {
      for (let px = Math.floor(handleEnd.x - 11); px <= Math.ceil(handleEnd.x + 11); px++) {
        const dx = px - handleEnd.x, dy = py - handleEnd.y;
        const along = dx * vx + dy * vy, across = -dx * vy + dy * vx;
        if (Math.abs(along) > 5 || Math.abs(across) > 9) continue;
        const color = Math.abs(along) > 4 || Math.abs(across) > 8 ? colors.outline
          : across > 5 ? '#75472d' : along < -2 ? '#ddb078'
            : Math.abs(along - 1) < .6 ? '#a36b40' : '#bd8750';
        pixel(px, py, 1, 1, color);
      }
    }
    // 手掌最后盖住锤柄握点，不能出现柄与手分离的悬浮武器。
    pixel(Math.round(hand.x) - 3, Math.round(hand.y) - 3, 6, 6, colors.outline);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) - 2, 4, 4, colors.skin);
    pixel(Math.round(hand.x) - 2, Math.round(hand.y) + 1, 4, 1, colors.skinLo);
  }
  // 可选攻击 age 单位为毫秒；固定攻击方向只影响这次挥击，待机/走路仍使用原外观。
  function drawCharacterBody(g, p, clock, attackAgeMs = null, attackDirection = null, elevation = 0) {
    g.save();
    const rect = (x, y, w, h, color) => {
      g.fillStyle = color;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const shade = characterShade, x = Math.round(p.x), c = p.colors;
    const hi = Math.max(0, PALETTES.hair.findIndex(o => o[0] === c.hair[0]));
    const skin = SKIN[hi], skinLo = shade(skin, -.24);
    const hair = c.hair[1], hairHi = shade(hair, .3), hairLo = shade(hair, -.3);
    const top = c.top[1], topHi = shade(top, .24), topLo = shade(top, -.3);
    const pants = c.pants[1], pantsHi = shade(pants, .18), pantsLo = shade(pants, -.26);
    const shoes = c.shoes[1], shoeLo = shade(shoes, -.32), OL = '#1c1620';
    const ph = (p.walk || 0) * .13, sw = p.moving ? Math.sin(ph) : 0;
    // 行走用双腿交替抬脚，不再把整个人向上提，支撑脚保持贴地。
    const bob = p.moving ? 0 : Math.round(Math.sin(clock * 1.5 + (p.spriteIndex ?? p.id) * 1.9) * .7);
    const yb = Math.round(p.y) + bob;
    const liftL = Math.max(0, sw) * 2, liftR = Math.max(0, -sw) * 2, arm = Math.round(-sw * 1.6);
    const a = (p.alive ? 1 : .4) * (p.online === false ? .55 : 1);
    const attacking = p.alive && Number.isFinite(attackAgeMs) && attackAgeMs >= 0 && attackAgeMs < ATTACK_ANIMATION_MS;
    const direction = (attacking ? attackDirection : p.spriteFacing) || p.spriteFacing || 'front';
    const drawAttack = () => drawCharacterAttack(rect, x, yb, direction, attackAgeMs,
      { outline: OL, skin, skinLo, topLo, topHi });
    // 地面阴影贴在脚底中心，先绘制再抬高跳跃身体，避免影子与人物一起离地。
    const z = Math.max(0, Number(elevation) || 0);
    g.globalAlpha = (z > 0 ? .22 : .3) * a;
    rect(x - 11, Math.round(p.y) - 1, 22, 4, '#0f0a12');
    g.globalAlpha = a;
    if (z) g.translate(0, -z);
    if (direction === 'left' || direction === 'right') {
      // 以右侧面为基准逐块镜像，远侧肢体先画、近侧后画，两个步行相位相反。
      const sideRect = (sx, sy, w, h, color) => rect(x + (direction === 'left' ? -sx - w : sx), yb + sy, w, h, color);
      const layer = parts => {
        for (const q of parts) sideRect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
        for (const q of parts) sideRect(...q);
      };
      const stride = Math.round(sw * 4), farArm = Math.round(sw * 3);
      layer([
        [-5 - stride, -12, 6, 9 - liftR, pantsLo], [-5 - stride, -3 - liftR, 10, 4, shoeLo],
        [-4 + farArm, -30, 4, 12, topLo], [-4 + farArm, -19, 4, 5, skinLo]
      ]);
      layer([[-7, -17, 14, 6, pants], [-7, -31, 14, 16, top]]);
      sideRect(-7, -31, 14, 2, topHi); sideRect(-7, -17, 14, 2, topLo);
      sideRect(-7, -31, 2, 16, topLo); sideRect(5, -29, 2, 12, shade(top, .1));
      sideRect(-7, -17, 14, 1, shade(pants, -.5));
      layer([[-3 + stride, -12, 6, 9 - liftL, pantsLo], [-3 + stride, -3 - liftL, 10, 4, shoes]]);
      sideRect(-3 + stride, -12, 6, 2, pantsHi); sideRect(-3 + stride, -liftL, 10, 1, shoeLo);
      if (!attacking) {
        layer([[-2 - farArm, -30, 5, 12, topLo], [-2 - farArm, -19, 5, 5, skin]]);
        sideRect(-2 - farArm, -29, 2, 10, topHi);
      }
      const head = [[-3, -34, 6, 5, skinLo], [-7, -47, 14, 16, skin],
        [7, -41, 3, 4, skin], [-8, -49, 16, 7, hair], [-8, -44, 7, 12, hairLo]];
      const style = hi % 4;
      if (style === 1) head.push([-9, -44, 5, 16, hair]);
      if (style === 2) head.push([-11, -43, 4, 12, hairLo]);
      if (style === 3) head.push([-5, -53, 8, 5, hair]);
      layer(head);
      sideRect(-6, -48, 8, 2, hairHi); sideRect(-2, -41, 3, 4, skinLo); sideRect(-2, -41, 2, 3, skin);
      sideRect(3, -45, 3, 1, hairLo); sideRect(4, -43, 2, 3, '#2b2230'); sideRect(5, -43, 1, 1, '#f4f8ff');
      sideRect(8, -39, 2, 1, skinLo); sideRect(5, -36, 2, 1, '#a8706a');
      if (attacking) drawAttack(); // 侧面握锤的是近侧手臂，覆盖躯干与头部边缘。
    } else {
      const back = direction === 'back';
      if (attacking && back) drawAttack(); // 朝后挥击先画，随后由背部与后脑自然遮挡。
      const parts = [
        [x - 11, yb - 3 - liftL, 10, 4, shoes], [x + 1, yb - 3 - liftR, 10, 4, shoes],
        [x - 9, yb - 12, 7, 9 - liftL, pantsLo], [x + 2, yb - 12, 7, 9 - liftR, pantsLo],
        [x - 10, yb - 17, 20, 6, pants],
        [x - 11, yb - 31, 22, 16, top],
        [x - 16, yb - 30 + arm, 5, 12, topLo], [x + 11, yb - 30 - arm, 5, 12, topLo],
        [x - 16, yb - 19 + arm, 5, 5, skin], [x + 11, yb - 19 - arm, 5, 5, skin],
        [x - 4, yb - 34, 8, 5, skinLo],
        [x - 10, yb - 47, 20, 16, back ? hair : skin],
        [x - 11, yb - 49, 22, 7, hair]
      ];
      if (attacking) {
        const sleeveIndex = back ? 6 : 7;
        parts.splice(sleeveIndex + 2, 1); parts.splice(sleeveIndex, 1);
      }
      const style = hi % 4;
      if (style === 1) parts.push([x - 13, yb - 44, 3, 16, hair], [x + 10, yb - 44, 3, 16, hair]);
      else parts.push([x - 12, yb - 44, 3, 10, hairLo], [x + 9, yb - 44, 3, 10, hairLo]);
      if (style === 2) parts.push([x + 11, yb - 43, 4, 12, hairLo]);
      if (style === 3) parts.push([x - 5, yb - 53, 10, 5, hair]);
      for (const q of parts) rect(q[0] - 1, q[1] - 1, q[2] + 2, q[3] + 2, OL);
      for (const q of parts) rect(...q);
      rect(x - 9, yb - 48, 9, 2, hairHi);
      rect(x - 11, yb - 31, 22, 2, topHi); rect(x - 11, yb - 17, 22, 2, topLo);
      rect(x - 11, yb - 31, 2, 16, shade(top, .1)); rect(x + 9, yb - 31, 2, 16, topLo);
      if (!back) rect(x - 1, yb - 31, 2, 5, shade(top, -.45));
      rect(x - 10, yb - 17, 20, 1, shade(pants, -.5));
      rect(x - 9, yb - 12, 7, 2, pantsHi); rect(x + 2, yb - 12, 7, 2, pantsHi);
      rect(x - 11, yb - liftL, 10, 1, shoeLo); rect(x + 1, yb - liftR, 10, 1, shoeLo);
      if (back) {
        rect(x - 10, yb - 35, 20, 4, hairLo); rect(x - 8, yb - 44, 3, 8, shade(hair, .1));
        rect(x - 8, yb - 28, 16, 1, shade(top, .1));
      } else {
        rect(x - 11, yb - 40, 1, 4, skinLo); rect(x + 10, yb - 40, 1, 4, skinLo);
        rect(x - 8, yb - 45, 4, 1, hairLo); rect(x + 4, yb - 45, 4, 1, hairLo);
        rect(x - 7, yb - 43, 3, 3, '#2b2230'); rect(x + 4, yb - 43, 3, 3, '#2b2230');
        rect(x - 7, yb - 43, 1, 1, '#f4f8ff'); rect(x + 4, yb - 43, 1, 1, '#f4f8ff');
        rect(x - 1, yb - 39, 2, 1, skinLo);
        rect(x - 3, yb - 36, 6, 1, '#a8706a'); rect(x - 4, yb - 37, 1, 1, '#a8706a'); rect(x + 3, yb - 37, 1, 1, '#a8706a');
      }
      if (attacking && !back) drawAttack(); // 朝前的手臂与木锤处于身体前景。
    }
    g.restore();
  }
  return { SKIN, characterShadeCache, characterShade, ATTACK_ANIMATION_MS, drawCharacterAttack, drawCharacterBody };
});
